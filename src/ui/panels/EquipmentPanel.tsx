import { useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { GameEngine } from '../../game/engine';
import { EquipmentManager, MAX_PLUS } from '../../game/managers/EquipmentManager';
import { EQUIPMENT_BY_ID, ITEM_SETS } from '../../game/data/equipment';
import { EquipSlot, EquipmentItem, Hero, Rarity } from '../../game/types';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { describeMods, formatGold, RARITY_COLOR } from '../../game/util';

const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'chest', 'shield', 'gloves', 'boots', 'ring', 'amulet'];

/**
 * Emoji placeholder per slot, shown whenever an item has no icon assigned
 * yet -- devtool icon assignment is manual and ongoing (55+ items), so most
 * won't have one right away. Same "always show something legible, never a
 * broken image" approach used elsewhere for missing art.
 */
const SLOT_FALLBACK: Record<EquipSlot, string> = {
  weapon: '⚔️', helmet: '🪖', chest: '🎽', shield: '🛡️',
  gloves: '🧤', boots: '👢', ring: '💍', amulet: '📿',
};

function ItemIcon({ slot, icon, size = 40 }: { slot: EquipSlot; icon?: string; size?: number }) {
  return (
    <div className="item-icon" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>
      {icon
        ? <img src={`./item-icons/${icon}`} alt="" />
        : <span aria-hidden="true">{SLOT_FALLBACK[slot]}</span>}
    </div>
  );
}

function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-pill" style={{ color: RARITY_COLOR[rarity], borderColor: RARITY_COLOR[rarity] }}>
      {rarity}
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

/** A single worn-gear slot. Collapsed shows just the icon, name, and rarity
 *  pill; clicking expands to the full mod breakdown, durability, and the
 *  repair/refine/remove actions -- same collapse-by-default pattern used on
 *  the Quest Board and Lore tab. */
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
        </div>
      </div>
      {open && (
        <div className="item-card-details">
          <div className="tiny muted">{slot} · requires level {def.reqLevel}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{describeMods(def.mods).join(' · ') || 'No bonuses'}</div>
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
              onClick={() => engine.upgradeItem(item.uid)}
              disabled={item.plus >= MAX_PLUS}
            >
              Refine {formatGold(EquipmentManager.upgradeCost(item, workshop))}
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
        </div>
      </div>
      {open && (
        <div className="item-card-details">
          <div className="tiny muted">{def.slot} · requires level {def.reqLevel}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{describeMods(def.mods).join(' · ') || 'No bonuses'}</div>
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

      <div className="row wrap" style={{ marginBottom: 10 }}>
        {state.heroes.map((h) => (
          <button key={h.id} className={h.id === hero.id ? 'btn-primary' : ''} onClick={() => setHeroId(h.id)}>
            {h.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => engine.repairAll()} disabled={repairBill === 0}>
          Repair everything · {formatGold(repairBill)}
        </button>
      </div>

      <div className="item-card-grid">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} slot={slot} item={hero.equipment[slot]} workshop={workshop} hero={hero} engine={engine} />
        ))}
      </div>

      <div className="section-heading">Consumables</div>
      {InventoryManager.owned(state).length === 0 ? (
        <p className="small muted">None on hand. The Shop sells potions and charms.</p>
      ) : (
        <div className="row wrap" style={{ marginBottom: 8 }}>
          {InventoryManager.owned(state).map(({ def, count }) => (
            <span key={def.id} className="chip" title={def.description}>
              {def.glyph} {def.name} ×{count}
            </span>
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
