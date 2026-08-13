import { useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { GameEngine } from '../../game/engine';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { EQUIPMENT_BY_ID, EQUIP_SLOTS, SET_BY_ID } from '../../game/data/equipment';
import { EquipSlot, EquipmentItem, Hero, Rarity, ConsumableDef } from '../../game/types';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { rerollsUsedToday } from '../../game/data/reroll';
import { describeMods, describeStats, formatGold, RARITY_COLOR, RARITY_ORDER } from '../../game/util';
import { ItemIcon, ConsumableIcon } from '../icons';
import { GearScoreBadge } from '../GearScoreBadge';
import { Row, Toggle } from './SettingsPanel';

const SLOTS = EQUIP_SLOTS;

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

function DurabilityBar({ item, compact = false }: { item: EquipmentItem; compact?: boolean }) {
  const max = EquipmentManager.maxDurability(item);
  const ratio = item.durability / max;
  return (
    <>
      <div className={`bar dura ${ratio < 0.25 ? 'low' : ''}`} style={{ marginTop: compact ? 2 : 4 }}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      {/* Compact mode (the always-visible collapsed card row) skips the
          text line -- the bar itself, plus its own low-durability red
          tint, is enough to spot "this needs repair" at a glance across
          a whole hero's loadout without expanding every card first. The
          exact number still shows once expanded, same as before. */}
      {!compact && (
        <div className="tiny muted">
          {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${max}`}
        </div>
      )}
    </>
  );
}

/**
 * Set membership + progress for one item's setId, computed against a
 * specific hero's current loadout. Reused by both SlotCard (an equipped
 * piece -- "active" reflects the hero's real current mods, same counting
 * rule as HeroManager.equipmentMods/activeSetBonuses: only equipped items
 * above 0 durability count) and StashCard (an unequipped piece -- shown as
 * progress toward, not a claim of, an active bonus).
 */
function setInfoFor(hero: Hero, setId: string) {
  const set = SET_BY_ID[setId];
  if (!set) return null;
  let count = 0;
  for (const equipped of Object.values(hero.equipment)) {
    if (!equipped || equipped.durability <= 0) continue;
    if (EQUIPMENT_BY_ID[equipped.defId]?.setId === setId) count++;
  }
  const active = set.bonuses.filter((b) => count >= b.count);
  const next = set.bonuses.find((b) => count < b.count);
  return { set, count, active, next };
}

/** Set info block shown inside an item's expanded tooltip/modal -- teal
 *  throughout, matching the same glow SlotCard's collapsed card gets when
 *  a set bonus is actually active (see .set-active / .set-info in
 *  app.css). `equipped` only changes the wording, not the underlying
 *  count -- an unequipped stash piece never contributes to `count` either
 *  way, since setInfoFor only counts what's actually worn. */
function SetInfoBlock({ hero, setId, equipped }: { hero: Hero; setId: string; equipped: boolean }) {
  const info = setInfoFor(hero, setId);
  if (!info) return null;
  const { set, count, active, next } = info;
  return (
    <div className="set-info tiny">
      <div style={{ color: 'var(--teal)' }}>
        {set.name} — {count}/{set.pieces.length} equipped on {hero.name}
      </div>
      {active.length > 0 && (
        <div>Active: {active.map((b) => `${b.label} (${b.count})`).join(' · ')}</div>
      )}
      {next && <div className="muted">Next at {next.count} pieces: {next.label}</div>}
      {!equipped && <div className="muted">Equip this to count toward the set.</div>}
    </div>
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

/** A single worn-gear slot. The collapsed card just shows icon, name, and
 *  rarity pill; clicking opens the full mod breakdown, durability, and
 *  the repair/remove actions in an overlay modal -- previously this
 *  expanded in place, which read as the whole card jumping/resizing
 *  when clicked. Same .overlay/.modal shape the shop item cards
 *  (EquipmentShopCard/ConsumableShopCard) and PeddlerCardDetailOverlay
 *  already use. */
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

  // Only meaningful once equipped -- an unworn piece can't have an active
  // bonus regardless of its own setId, so this stays undefined for a
  // durability-0 (broken) item too, same rule equipmentMods itself uses.
  const setInfo = def.setId && item.durability > 0 ? setInfoFor(hero, def.setId) : null;
  const hasActiveSetBonus = (setInfo?.active.length ?? 0) > 0;

  // Mirrors GameEngine.consumeFreeRepair's own priority (guild daily
  // allowance first, hero's one-time freebie second) purely for the
  // button label/enabled-state -- the engine call is still the actual
  // source of truth when Repair is actually clicked.
  const repairsUsedToday = rerollsUsedToday(engine.state.freeRepairsUsedToday, engine.state.freeRepairDay, Date.now());
  const itemFreeRepairAvailable = repairsUsedToday < ModifierManager.freeRepairsPerDay(engine.state) || !hero.usedFreeRepair;

  return (
    <>
      <div
        className={`item-card ${hasActiveSetBonus ? 'set-active' : ''}`}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <RarityPill rarity={def.rarity} />
            {item.customMods && <CraftedPill />}
            <DurabilityBar item={item} compact />
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ItemIcon slot={def.slot} icon={def.icon} size={48} />
              <div>
                <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>
                  {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                </span>
                <div className="tiny muted">{slot} · requires level {def.reqLevel}</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              <RarityPill rarity={def.rarity} />
              {item.customMods && <CraftedPill />}
            </div>
            <div className="tiny muted">{describeMods(item.customMods ?? def.mods).join(' · ') || 'No bonuses'}</div>
            {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
              <div className="tiny" style={{ marginTop: 2, color: 'var(--brass)' }}>Enchanted: {describeStats(item.enchantStats).join(' · ')}</div>
            )}
            {def.setId && (
              <SetInfoBlock hero={hero} setId={def.setId} equipped={item.durability > 0} />
            )}
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
            </div>
            <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
              <button onClick={() => setOpen(false)}>Close</button>
              <button
                className="btn-primary"
                disabled={EquipmentManager.repairCost(item, workshop) === 0}
                onClick={() => { engine.repair(item.uid); setOpen(false); }}
              >
                {itemFreeRepairAvailable && EquipmentManager.repairCost(item, workshop) > 0
                  ? 'Repair · Free'
                  : `Repair ${formatGold(EquipmentManager.repairCost(item, workshop))}`}
              </button>
              <button onClick={() => { engine.unequip(hero.id, slot); setOpen(false); }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A single stash item, same collapsed-card pattern as SlotCard. */
/** A single stash item -- same overlay-modal treatment as SlotCard above,
 *  replacing the previous inline expand. */
function StashCard({
  item, hero, confirmSell, engine,
}: { item: EquipmentItem; hero: Hero; confirmSell: boolean; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return null;
  const canEquip = EquipmentManager.canEquip(hero, item);

  return (
    <>
      <div
        className="item-card"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <RarityPill rarity={def.rarity} />
            {item.customMods && <CraftedPill />}
            <DurabilityBar item={item} compact />
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ItemIcon slot={def.slot} icon={def.icon} size={48} />
              <div>
                <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>
                  {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                </span>
                <div className="tiny muted">{def.slot} · requires level {def.reqLevel}</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              <RarityPill rarity={def.rarity} />
              {item.customMods && <CraftedPill />}
            </div>
            <div className="tiny muted">{describeMods(item.customMods ?? def.mods).join(' · ') || 'No bonuses'}</div>
            {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
              <div className="tiny" style={{ marginTop: 2, color: 'var(--brass)' }}>Enchanted: {describeStats(item.enchantStats).join(' · ')}</div>
            )}
            {def.setId && (
              <SetInfoBlock hero={hero} setId={def.setId} equipped={false} />
            )}
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
            </div>
            <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
              <button onClick={() => setOpen(false)}>Close</button>
              <button
                className="btn-primary"
                disabled={!canEquip.ok}
                onClick={() => { engine.equip(hero.id, item.uid); setOpen(false); }}
                title={canEquip.reason}
              >
                Equip on {hero.name}
              </button>
              <button
                onClick={() => {
                  if (!confirmSell || confirm('Sell this item?')) { engine.sellItem(item.uid); setOpen(false); }
                }}
              >
                Sell {formatGold(EquipmentManager.sellValue(item))}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

  // Sell Junk -- bulk-sells everything in the stash at or below a chosen
  // rarity (see ShopManager.sellBelowRarity). Defaults to Common, the
  // safest threshold, rather than defaulting to whatever was last picked
  // or something broader -- a bulk sell is higher-stakes than selling one
  // item at a time, so the default shouldn't be able to surprise anyone.
  // The preview below mirrors sellBelowRarity's own filter exactly
  // (skip crafted/enchanted items regardless of rarity) so the count and
  // gold shown on the button are exactly what pressing it will do, not an
  // approximation.
  const [junkRarity, setJunkRarity] = useState<Rarity>('common');
  const junkMaxIndex = RARITY_ORDER.indexOf(junkRarity);
  const junkPreview = state.stash.filter((item) => {
    if (item.customMods || (item.enchantStats && Object.keys(item.enchantStats).length > 0)) return false;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return false;
    return RARITY_ORDER.indexOf(def.rarity) <= junkMaxIndex;
  });
  const junkGold = junkPreview.reduce((sum, item) => sum + EquipmentManager.sellValue(item), 0);
  const sellJunk = () => {
    if (junkPreview.length === 0) return;
    if (!settings.confirmSell || confirm(`Sell ${junkPreview.length} item${junkPreview.length === 1 ? '' : 's'} (${junkRarity} and below) for ${junkGold} gold?`)) {
      engine.sellJunk(junkRarity);
    }
  };

  return (
    <>
      <h2>Inventory</h2>
      <p className="subtitle">
        Everything the guild owns: worn gear, the shared stash, and consumables on hand.
        Buying and selling both happen in the Shop — this is just what you have.
      </p>

      {/* Guild-wide automation preferences -- live in GameState, not
          Settings, since both spend gold/touch gear and therefore follow
          the save (and eventually Steam Cloud) rather than being a local
          device cosmetic. Placed here, next to the manual actions they
          automate (Repair Everything below, Equip Best from Stash on
          each hero's own gear grid), rather than in the Settings panel,
          whose own subtitle promises it "never touches your guild's
          progress" -- these two genuinely do. */}
      <div className="card" style={{ marginBottom: 10 }}>
        <Row
          label="Auto-repair"
          hint={`Automatically repair gear once it drops to ${state.autoRepairThresholdPercent}% durability or below, whenever the guild can afford it.`}
        >
          <Toggle
            value={state.autoRepairEnabled}
            onChange={(v) => engine.setAutoRepair(v)}
          />
        </Row>
        {state.autoRepairEnabled && (
          <Row label="Repair threshold" hint="Lower means gear wears further before it's automatically fixed.">
            <input
              type="range"
              min={1}
              max={99}
              value={state.autoRepairThresholdPercent}
              onChange={(e) => engine.setAutoRepair(true, Number(e.target.value))}
              style={{ width: 120 }}
            />
            <span className="tiny muted" style={{ marginLeft: 8 }}>{state.autoRepairThresholdPercent}%</span>
          </Row>
        )}
        <Row
          label="Auto-equip loot"
          hint="A quest reward that beats what the hero who found it is already wearing equips immediately, instead of sitting in the stash."
        >
          <Toggle value={state.autoEquipOnLoot} onChange={(v) => engine.setAutoEquipOnLoot(v)} />
        </Row>
        <Row
          label="Auto-fill consumables on send"
          hint="Any empty consumable slot fills with the best available potion right before a hero departs -- covers a slot left empty after its last potion ran out, without displacing anything already equipped."
        >
          <Toggle value={state.autoEquipConsumablesOnSend} onChange={(v) => engine.setAutoEquipConsumablesOnSend(v)} />
        </Row>
      </div>

      <div className="row wrap" style={{ marginBottom: 10, alignItems: 'center' }}>
        {state.heroes.map((h) => (
          <button key={h.id} className={`hero-tab-chip ${h.id === hero.id ? 'on' : ''}`} onClick={() => setHeroId(h.id)}>
            {h.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <GearScoreBadge score={HeroManager.gearScore(hero)} showProgress />
        <button
          className="btn-green"
          onClick={() => engine.equipBestGear(hero.id)}
          style={{ marginLeft: 10 }}
          title="Equip the highest Gear Score item in the stash for each slot, wherever it beats what's already worn"
        >
          Equip best from stash
        </button>
        <button className="btn-primary" onClick={() => engine.repairAll()} disabled={repairBill === 0} style={{ marginLeft: 10 }}>
          Repair everything · {formatGold(repairBill)}
        </button>
      </div>

      {/* Per-hero summary of currently-active set bonuses -- lets someone
          managing gear see this without leaving Inventory for the Lore tab's
          Collection sub-tab (that stays the full browsable codex of every
          discovered set; this is just "what's actually active on this hero
          right now", reusing HeroManager.activeSetBonuses, which HeroesPanel
          already relies on for its own expanded-card line). */}
      {(() => {
        const activeSets = HeroManager.activeSetBonuses(hero);
        if (activeSets.length === 0) return null;
        return (
          <div className="card set-info" style={{ marginBottom: 10 }}>
            <div className="section-heading" style={{ marginBottom: 4, color: 'var(--teal)' }}>
              Active Set Bonuses
            </div>
            {activeSets.map((s) => (
              <div key={`${s.setName}:${s.label}`} className="tiny">{s.setName}: {s.label}</div>
            ))}
          </div>
        );
      })()}

      <div className="item-card-grid">
        {SLOTS.map((slot) => (
          <SlotCard key={slot} slot={slot} item={hero.equipment[slot]} workshop={workshop} hero={hero} engine={engine} />
        ))}
      </div>

      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>
          Consumable Slots ({(hero.equippedConsumables ?? []).length}/{ModifierManager.consumableSlots(state)})
        </div>
        {(hero.equippedConsumables ?? []).length < ModifierManager.consumableSlots(state) && (
          <button
            className="btn-green"
            style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
            onClick={() => engine.equipBestConsumables(hero.id)}
            title="Fill this hero's empty consumable slots with the best available potions"
          >
            Equip best
          </button>
        )}
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

      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>Stash ({state.stash.length})</div>
        {state.stash.length > 0 && (
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <select
              value={junkRarity}
              onChange={(e) => setJunkRarity(e.target.value as Rarity)}
              style={{
                background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
              }}
            >
              {RARITY_ORDER.map((r) => (
                <option key={r} value={r}>{r} and below</option>
              ))}
            </select>
            <button
              className="btn-green"
              style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
              onClick={sellJunk}
              disabled={junkPreview.length === 0}
              title="Crafted and enchanted items are never swept up by this, regardless of rarity"
            >
              Sell Junk ({junkPreview.length}) · {formatGold(junkGold)}
            </button>
          </div>
        )}
      </div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare. Loot drops from successful quests.</p>}
      <div className="item-card-grid">
        {state.stash.map((item) => (
          <StashCard key={item.uid} item={item} hero={hero} confirmSell={settings.confirmSell} engine={engine} />
        ))}
      </div>
    </>
  );
}
