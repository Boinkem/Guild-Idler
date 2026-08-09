import { useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { GameEngine } from '../../game/engine';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { EQUIPMENT_BY_ID, ITEM_SETS } from '../../game/data/equipment';
import { EquipSlot, EquipmentItem, Hero, Rarity, ConsumableDef } from '../../game/types';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { describeMods, describeStats, formatGold, RARITY_COLOR } from '../../game/util';
import { ItemIcon, ConsumableIcon } from '../icons';
import { GearScoreBadge } from '../GearScoreBadge';

const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'chest', 'shield', 'gloves', 'boots', 'ring', 'amulet', 'cloak'];

function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-pill" style={{ color: RARITY_COLOR[rarity], borderColor: RARITY_COLOR[rarity] }}>
      {rarity}
    </span>
  );
}

/** Marks a crafted instance -- orthogonal to rarity, which still governs power tier. */
function CraftedPill() {
  return (
    <span className="rarity-pill" style={{ color: 'var(--brass)', borderColor: 'var(--brass)' }}>
      crafted
    </span>
  );
}

function DurabilityBar({ item }: { item: EquipmentItem }) {
  const max = EquipmentManager.maxDurability(item);
  const ratio = item.durability / max;
  return (
    <>
      <div className={`bar dura ${ratio < 0.25 ? 'low' : ''}`} style={{ marginTop: 4 }}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="tiny muted">
        {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${max}`}
      </div>
    </>
  );
}

/**
 * Same clickable-detail treatment SlotCard/StashCard already use for gear --
 * a consumable in the stash used to just be a static chip with a title
 * tooltip. Now expands to show the real description, matching everything
 * else in this panel.
 */
function ConsumableInfoCard({ def, count }: { def: ConsumableDef; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`item-card ${open ? 'open' : ''}`}>
      <div
        className="item-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <ConsumableIcon icon={def.icon} glyph={def.glyph} />
        <div className="item-card-body">
          <div className="item-card-name">{def.name} ×{count}</div>
        </div>
      </div>
      {open && (
        <div className="item-card-details">
          <div className="tiny muted">{def.description}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A single consumable-equip slot for whichever hero is currently selected --
 * separate from the gear SLOTS grid above (consumables are used up over a
 * quest, gear isn't), but placed directly beneath it so it reads as part of
 * the same "what this hero is carrying" picture. Filled shows the
 * consumable with an unequip action; empty shows a picker built from
 * whatever's owned but not already equipped somewhere.
 */
function ConsumableSlotCard({
  hero, equippedDefId, available, engine,
}: {
  hero: Hero; equippedDefId: string | undefined;
  available: { def: ConsumableDef; count: number }[]; engine: GameEngine;
}) {
  const [picking, setPicking] = useState(false);
  const def = equippedDefId ? InventoryManager.resolveDef(engine.state, equippedDefId) : undefined;

  if (def) {
    return (
      <div className="item-card">
        <div className="item-card-summary">
          <ConsumableIcon icon={def.icon} glyph={def.glyph} />
          <div className="item-card-body">
            <div className="item-card-name">{def.name}</div>
            <div className="tiny muted">Equipped on {hero.name}</div>
          </div>
        </div>
        <div className="item-card-details">
          <div className="tiny muted">{def.description}</div>
          <button
            style={{ marginTop: 6, minHeight: 24, padding: '3px 6px' }}
            onClick={() => engine.unequipConsumable(hero.id, def.id)}
          >
            Unequip
          </button>
        </div>
      </div>
    );
  }

  if (picking) {
    return (
      <div className="item-card open">
        <div className="item-card-details" style={{ paddingTop: 8 }}>
          {available.length === 0 ? (
            <p className="tiny muted">Nothing spare to equip. Buy potions in the Shop.</p>
          ) : (
            <div className="row wrap" style={{ gap: 4 }}>
              {available.map(({ def: d, count }) => (
                <button
                  key={d.id}
                  className="chip"
                  onClick={() => { engine.equipConsumable(hero.id, d.id); setPicking(false); }}
                  title={d.description}
                >
                  {d.glyph} {d.name} ×{count}
                </button>
              ))}
            </div>
          )}
          <button className="btn-ghost" style={{ marginTop: 6, minHeight: 22 }} onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="item-card empty clickable">
      <div
        className="item-card-summary"
        onClick={() => setPicking(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicking(true); } }}
      >
        <div className="item-icon" style={{ width: 40, height: 40, fontSize: 18, display: 'grid', placeItems: 'center' }}>+</div>
        <div className="item-card-body">
          <div className="slot-name">consumable</div>
          <div className="tiny muted">Empty</div>
        </div>
      </div>
    </div>
  );
}

/** A single worn-gear slot. Collapsed shows just the icon, name, and rarity
 *  pill; clicking expands to the full mod breakdown, durability, and the
 *  repair/remove actions -- same collapse-by-default pattern used on
 *  the Quest Board and Lore tab. "Refine" (the +N upgrade, which also
 *  raises the durability cap) now lives on the Blacksmith's own Enhance
 *  station instead of a button here -- plain repair (restore to whatever
 *  the cap already is, no cap increase) stays here as a quick action. */
function SlotCard({
  slot, item, workshop, hero, engine,
}: { slot: EquipSlot; item: EquipmentItem | undefined; workshop: number; hero: Hero; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;

  if (!item || !def) {
    return (
      <div className="item-card empty">
        <ItemIcon slot={slot} />
        <div className="item-card-body">
          <div className="slot-name">{slot}</div>
          <div className="tiny muted">Empty</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`item-card ${open ? 'open' : ''}`}>
      <div
        className="item-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <ItemIcon slot={def.slot} icon={def.icon} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
          <RarityPill rarity={def.rarity} />
          {item.customMods && <CraftedPill />}
        </div>
      </div>
      {open && (
        <div className="item-card-details">
          <div className="tiny muted">{slot} · requires level {def.reqLevel}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{describeMods(item.customMods ?? def.mods).join(' · ') || 'No bonuses'}</div>
          {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
            <div className="tiny" style={{ marginTop: 2, color: 'var(--brass)' }}>Enchanted: {describeStats(item.enchantStats).join(' · ')}</div>
          )}
          <DurabilityBar item={item} />
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button
              style={{ minHeight: 24, padding: '3px 6px' }}
              onClick={() => engine.repair(item.uid)}
              disabled={EquipmentManager.repairCost(item, workshop) === 0}
            >
              Repair {formatGold(EquipmentManager.repairCost(item, workshop))}
            </button>
            <button
              style={{ minHeight: 24, padding: '3px 6px' }}
              onClick={() => engine.unequip(hero.id, slot)}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A single stash item, same collapsed-card pattern as SlotCard. */
function StashCard({
  item, hero, confirmSell, engine,
}: { item: EquipmentItem; hero: Hero; confirmSell: boolean; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return null;
  const canEquip = EquipmentManager.canEquip(hero, item);

  return (
    <div className={`item-card ${open ? 'open' : ''}`}>
      <div
        className="item-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <ItemIcon slot={def.slot} icon={def.icon} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
          <RarityPill rarity={def.rarity} />
          {item.customMods && <CraftedPill />}
        </div>
      </div>
      {open && (
        <div className="item-card-details">
          <div className="tiny muted">{def.slot} · requires level {def.reqLevel}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{describeMods(item.customMods ?? def.mods).join(' · ') || 'No bonuses'}</div>
          {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
            <div className="tiny" style={{ marginTop: 2, color: 'var(--brass)' }}>Enchanted: {describeStats(item.enchantStats).join(' · ')}</div>
          )}
          <DurabilityBar item={item} />
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button
              className="btn-primary"
              style={{ minHeight: 26 }}
              disabled={!canEquip.ok}
              onClick={() => engine.equip(hero.id, item.uid)}
              title={canEquip.reason}
            >
              Equip on {hero.name}
            </button>
            <button
              style={{ minHeight: 26 }}
              onClick={() => { if (!confirmSell || confirm('Sell this item?')) engine.sellItem(item.uid); }}
            >
              Sell {formatGold(EquipmentManager.sellValue(item))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EquipmentPanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;
  const [heroId, setHeroId] = useState(state.heroes[0].id);
  const hero = state.heroes.find((h) => h.id === heroId) ?? state.heroes[0];

  const repairBill = EquipmentManager.allItems(state)
    .reduce((sum, e) => sum + EquipmentManager.repairCost(e.item, workshop), 0);

  return (
    <>
      <h2>Inventory</h2>
      <p className="subtitle">
        Everything the guild owns: worn gear, the shared stash, and consumables on hand.
        Buying and selling both happen in the Shop — this is just what you have.
      </p>

      <div className="row wrap" style={{ marginBottom: 10, alignItems: 'center' }}>
        {state.heroes.map((h) => (
          <button key={h.id} className={h.id === hero.id ? 'btn-primary' : ''} onClick={() => setHeroId(h.id)}>
            {h.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <GearScoreBadge score={HeroManager.gearScore(hero)} showProgress />
        <button onClick={() => engine.repairAll()} disabled={repairBill === 0} style={{ marginLeft: 10 }}>
          Repair everything · {formatGold(repairBill)}
        </button>
      </div>

      <div className="item-card-grid">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} slot={slot} item={hero.equipment[slot]} workshop={workshop} hero={hero} engine={engine} />
        ))}
      </div>

      <div className="section-heading">
        Consumable Slots ({(hero.equippedConsumables ?? []).length}/{ModifierManager.consumableSlots(state)})
      </div>
      <div className="item-card-grid">
        {Array.from({ length: ModifierManager.consumableSlots(state) }).map((_, i) => {
          const equipped = hero.equippedConsumables ?? [];
          // Available to equip here: owned in excess of however many are
          // already slotted (on this hero or any other) -- prevents
          // "equipping" the same single potion into two slots at once.
          const equippedElsewhereCount = (defId: string) =>
            state.heroes.reduce((sum, other) => sum + (other.equippedConsumables ?? []).filter((id) => id === defId).length, 0);
          const available = InventoryManager.owned(state).filter(
            ({ def }) => equippedElsewhereCount(def.id) < InventoryManager.count(state, def.id),
          );
          return (
            <ConsumableSlotCard key={i} hero={hero} equippedDefId={equipped[i]} available={available} engine={engine} />
          );
        })}
      </div>

      <div className="section-heading">Consumables</div>
      {InventoryManager.owned(state).length === 0 ? (
        <p className="small muted">None on hand. The Shop sells potions and charms.</p>
      ) : (
        <div className="item-card-grid">
          {InventoryManager.owned(state).map(({ def, count }) => (
            <ConsumableInfoCard key={def.id} def={def} count={count} />
          ))}
        </div>
      )}

      <div className="section-heading">Stash ({state.stash.length})</div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare. Loot drops from successful quests.</p>}
      <div className="item-card-grid">
        {state.stash.map((item) => (
          <StashCard key={item.uid} item={item} hero={hero} confirmSell={settings.confirmSell} engine={engine} />
        ))}
      </div>

      <div className="section-heading">Collection</div>
      <p className="small muted">
        {state.discoveredItems.length} of {Object.keys(EQUIPMENT_BY_ID).length} items discovered.
      </p>
      {ITEM_SETS.map((set) => {
        const found = set.pieces.filter((p) => state.discoveredItems.includes(p));
        return (
          <div key={set.id} className="card">
            <div className="spread">
              <span className="card-title">{set.name}</span>
              <span className="small muted">{found.length}/{set.pieces.length} found</span>
            </div>
            <div className="stat-row" style={{ marginTop: 6 }}>
              {set.pieces.map((pieceId) => (
                <span
                  key={pieceId}
                  style={{ color: state.discoveredItems.includes(pieceId) ? RARITY_COLOR.legendary : undefined }}
                >
                  {EQUIPMENT_BY_ID[pieceId]?.name ?? pieceId}
                </span>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {set.bonuses.map((b) => `${b.count}-piece ${b.label}: ${describeMods(b.mods).join(', ')}`).join(' · ')}
            </div>
          </div>
        );
      })}
    </>
  );
}
