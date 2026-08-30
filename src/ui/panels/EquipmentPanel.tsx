import { useState } from 'react';
import { useEngine } from '../useEngine';
import { GameEngine } from '../../game/engine';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { EQUIPMENT_BY_ID, EQUIP_SLOTS, SET_BY_ID, gearScoreForInstance } from '../../game/data/equipment';
import { ELEMENT_GLYPH, ELEMENT_LABEL, GEM_TIER_LABEL } from '../../game/data/elements';
import { EquipSlot, EquipmentDef, EquipmentItem, ElementType, Hero, Rarity, ConsumableDef, CurioDef } from '../../game/types';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { CurioManager } from '../../game/managers/CurioManager';
import { rerollsUsedToday } from '../../game/data/reroll';
import { describeMods, describeStats, formatGold, RARITY_BANNER, RARITY_COLOR, MAIN_STAT_TOOLTIP } from '../../game/util';
import { ItemIcon, ConsumableIcon, CurioIcon } from '../icons';
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

/** Marks an item that belongs to a set -- orthogonal to rarity and crafted
 *  status, same small-pill convention as CraftedPill. Shown whenever
 *  def.setId is set, regardless of whether the set's bonus is currently
 *  active for this hero -- SetInfoBlock/SetBonusCard already cover "is it
 *  contributing right now"; this pill is "would this piece count toward a
 *  set at all", visible on the card itself before opening anything. Teal
 *  to match the existing set-active language (.item-card.set-active's own
 *  border/glow, and SetInfoBlock's met-tier text already use this token). */
function SetPill() {
  return (
    <span className="rarity-pill" style={{ color: 'var(--teal)', borderColor: 'var(--teal)' }}>
      set
    </span>
  );
}

/** Marks a Vault-locked stash item -- excluded from Sell/Sell Junk/Scrap
 *  (see EquipmentItem.locked's own comment), still visible and usable
 *  everywhere else. --sky, distinct from every other pill's color here. */
function LockedPill() {
  return (
    <span className="rarity-pill" style={{ color: 'var(--sky)', borderColor: 'var(--sky)' }}>
      {'\uD83D\uDD12'} vaulted
    </span>
  );
}

/**
 * Same "is this actually an upgrade" check engine.equipBestGear and
 * QuestManager's auto-equip-on-loot both already use -- reqLevel-gated,
 * then compared via gearScoreForInstance against whatever's currently
 * worn in that slot (an empty slot scores -1, so anything eligible
 * always beats it). Kept here rather than duplicated per-caller so this
 * badge can never disagree with what clicking "Equip Best Gear" would
 * actually do.
 *
 * Takes the actual `item` instance now, not just its def (patch 0263 --
 * the caller below already had a real EquipmentItem in scope and was
 * silently discarding it, so this badge scored purely by def just like
 * gearScoreForItem's other three call sites did; see that function's
 * own comment in data/equipment.ts for the shared bug and fix).
 */
function isGearUpgrade(hero: Hero, item: EquipmentItem, def: EquipmentDef): boolean {
  if (hero.level < def.reqLevel) return false;
  const equipped = hero.equipment[def.slot];
  const equippedDef = equipped ? EQUIPMENT_BY_ID[equipped.defId] : undefined;
  const currentScore = equipped && equippedDef ? gearScoreForInstance(equipped, equippedDef) : -1;
  return gearScoreForInstance(item, def) > currentScore;
}

/** Green "would this beat what's worn" flag for a stash item -- arrow +
 *  text so it reads at a glance in the dense stash grid, not just a color
 *  shift that could be missed. Moss is the palette's existing positive/
 *  opportunity token (`.good`, Easy-tier "opportunity" quest cards, burst
 *  XP text all already use it), not a new color introduced for this. */
function UpgradePill() {
  return (
    <span className="rarity-pill" style={{ color: 'var(--moss)', borderColor: 'var(--moss)' }}>
      &#9650; upgrade
    </span>
  );
}

/**
 * `thresholdPercent`, when passed, marks where Auto-repair (see the
 * toggle/slider in the Inventory header below) will trigger for this item
 * -- a thin tick line at that position on the bar itself, so "how close is
 * this to auto-repairing" is visible at a glance without cross-referencing
 * the settings card's percentage against this item's own numbers. Purely
 * visual (position: absolute over .bar, see .bar-threshold in app.css) --
 * doesn't affect the fill itself. Omitted entirely when Auto-repair is off,
 * since there's nothing meaningful to mark.
 */
function DurabilityBar({ item, compact = false, thresholdPercent }: { item: EquipmentItem; compact?: boolean; thresholdPercent?: number }) {
  const max = EquipmentManager.maxDurability(item);
  const ratio = item.durability / max;
  return (
    <>
      <div className="dura-row" style={{ marginTop: compact ? 2 : 4 }}>
        <div className={`bar dura ${ratio < 0.25 ? 'low' : ''}`}>
          <span style={{ width: `${ratio * 100}%` }} />
          {thresholdPercent !== undefined && (
            <i
              className="bar-threshold"
              style={{ left: `${thresholdPercent}%` }}
              title={`Auto-repairs at ${thresholdPercent}% durability`}
            />
          )}
        </div>
        {/* Number beside the bar (patch 0295), compact mode only -- direct
            request: the compact card grid had no numeric durability
            readout at all before this, only the bar's own low-tint
            threshold. Inline rather than overlaid on the bar itself --
            .bar is only 6px tall, nowhere near enough to hold legible
            text -- and inline rather than a head-line above/below so it
            costs no extra vertical space in a dense item grid. The
            expanded (non-compact) view below keeps its own existing text
            line instead, since it already has the room. */}
        {compact && <span className="dura-value tiny muted">{item.durability}/{max}</span>}
      </div>
      {!compact && (
        <div className="tiny muted">
          {item.durability === 0 ? 'Broken, no bonuses' : `Durability ${item.durability}/${max}`}
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
 *  way, since setInfoFor only counts what's actually worn.
 *
 *  Lists every tier the set has, not just the ones already met or the
 *  single next one -- direct tester feedback was that seeing what a tier
 *  "actually gives you" needed to be readable text, not something buried
 *  behind a hover title. Met tiers render in `--teal` (the same colour the
 *  gear card itself outlines in once a bonus goes active); unmet tiers
 *  stay `.muted` so the two read apart at a glance. */
function SetInfoBlock({ hero, setId, equipped }: { hero: Hero; setId: string; equipped: boolean }) {
  const info = setInfoFor(hero, setId);
  if (!info) return null;
  const { set, count } = info;
  return (
    <div className="set-info tiny">
      <div style={{ color: 'var(--teal)' }}>
        {set.name}, {count}/{set.pieces.length} equipped on {hero.name}
      </div>
      {set.bonuses.map((b) => {
        const met = count >= b.count;
        return (
          <div key={b.label} className={met ? '' : 'muted'} style={met ? { color: 'var(--teal)' } : undefined}>
            ({b.count}) {b.label}: {describeMods(b.mods).join(', ')}
          </div>
        );
      })}
      {!equipped && <div className="muted">Equip this to count toward the set.</div>}
    </div>
  );
}

/**
 * Expandable per-set entry for the Inventory tab's "Active Set Bonuses"
 * card (see EquipmentPanel below). Click the header to open it -- shows
 * every piece in the set with whether this hero currently has it equipped,
 * plus every bonus tier (met ones in `--teal`, same convention
 * SetInfoBlock above just established, unmet ones `.muted`). Kept as its
 * own component (own `open` state) rather than folded into the summary's
 * render loop, so each set in the list can be expanded independently.
 */
function SetBonusCard({ hero, setId }: { hero: Hero; setId: string }) {
  const [open, setOpen] = useState(false);
  const info = setInfoFor(hero, setId);
  if (!info) return null;
  const { set, count } = info;
  const equippedDefIds = new Set(
    Object.values(hero.equipment)
      .filter((item): item is EquipmentItem => !!item && item.durability > 0)
      .map((item) => item.defId),
  );
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((v) => !v)}
        className="tiny"
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: 'var(--teal)' }}
      >
        <span>
          {set.name} ({count}/{set.pieces.length})
        </span>
        <span className="muted">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="tiny" style={{ marginTop: 4, marginLeft: 4 }}>
          <div className="muted">Pieces:</div>
          {set.pieces.map((defId) => {
            const piece = EQUIPMENT_BY_ID[defId];
            const worn = equippedDefIds.has(defId);
            return (
              <div key={defId} className={worn ? '' : 'muted'} style={worn ? { color: 'var(--teal)' } : undefined}>
                {worn ? '✓ ' : '· '}
                {piece?.name ?? defId}
                {worn ? ` (worn by ${hero.name})` : ''}
              </div>
            );
          })}
          <div className="muted" style={{ marginTop: 4 }}>
            Bonuses:
          </div>
          {set.bonuses.map((b) => {
            const met = count >= b.count;
            return (
              <div key={b.label} className={met ? '' : 'muted'} style={met ? { color: 'var(--teal)' } : undefined}>
                ({b.count}) {b.label}: {describeMods(b.mods).join(', ')}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Same clickable-detail treatment SlotCard/StashCard already use for gear --
 * a consumable in the stash used to just be a static chip with a title
 * tooltip. Now expands to show the real description, matching everything
 * else in this panel.
 */
/**
 * Whether a consumable is used immediately on a hero via
 * InventoryManager.useOnHero (healInjury and/or restoreHealth) rather than
 * equipped ahead of a quest send. See ConsumableDef.effect's own comments
 * in types.ts for why these two are grouped this way.
 */
function isInstantUseOnHero(def: ConsumableDef): boolean {
  return !!def.effect.healInjury || (def.effect.restoreHealth ?? 0) > 0;
}

/**
 * Stash consumables used to be a static, non-interactive chip -- clicking
 * only expanded the description. Now offers the actual action inline:
 * "Use" for a healInjury/restoreHealth item (applied immediately to
 * whichever hero is selected in this panel, via engine.useConsumable --
 * same InventoryManager.useOnHero path the hardcoded Bandage button in
 * HeroesPanel already uses), "Equip" for a per-quest loadout item (drops
 * it into the selected hero's first empty Consumable Slot via
 * engine.equipConsumable, same call the slot picker below already makes --
 * "No free consumable slots." surfaces as a toast if there isn't one), or
 * the peddler charm's own guild-wide action for Beckoning Charm. An item
 * with no actionable effect at all (Pet Treat -- fed from the Hatchery
 * instead) shows no button, just the description.
 */
/**
 * Stash consumables -- same overlay/modal treatment SlotCard/StashCard
 * use for gear (see those two above), replacing this card's own previous
 * inline `.item-card-details` expansion. Offers the actual action inside
 * the modal: "Use" for a healInjury/restoreHealth item (applied
 * immediately to whichever hero is selected in this panel, via
 * engine.useConsumable -- same InventoryManager.useOnHero path the
 * hardcoded Bandage button in HeroesPanel already uses), "Equip" for a
 * per-quest loadout item (drops it into the selected hero's first empty
 * Consumable Slot via engine.equipConsumable, same call the slot picker
 * below already makes -- "No free consumable slots." surfaces as a toast
 * if there isn't one), or the peddler charm's own guild-wide action for
 * Beckoning Charm. An item with no actionable effect at all (Pet Treat --
 * fed from the Hatchery instead) shows no button, just the description.
 */
/**
 * A single owned curio -- click opens a small modal with its description
 * and a Sell action, same "click to expand into a modal" shape
 * ConsumableInfoCard just below uses, rather than an inline expand.
 * Curios have exactly one action (sell the whole stack), so there's no
 * equip/use branching to speak of the way ConsumableInfoCard has.
 */
function CurioCard({ def, count, engine }: { def: CurioDef; count: number; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
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
          <CurioIcon icon={def.icon} glyph={def.glyph} />
          <div className="item-card-body">
            <div className="item-card-name">{def.name} ×{count}</div>
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <CurioIcon icon={def.icon} glyph={def.glyph} size={48} />
              <div>
                <span className="card-title">{def.name}</span>
                <div className="tiny muted">Owned ×{count} · {formatGold(def.sellValue)} each</div>
              </div>
            </div>
            <div className="tiny muted">{def.description}</div>
            <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
              <button onClick={() => setOpen(false)}>Close</button>
              <button
                className="btn-green"
                onClick={() => { engine.sellCurio(def.id); setOpen(false); }}
              >
                Sell all ×{count} · {formatGold(def.sellValue * count)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConsumableInfoCard({
  def, count, hero, engine,
}: { def: ConsumableDef; count: number; hero: Hero; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const instantUse = isInstantUseOnHero(def);
  const loadout = InventoryManager.isLoadoutEffect(def);
  const peddlerCharm = (def.effect.peddlerCounterReduction ?? 0) > 0;
  // Same "can't touch a deployed hero's loadout" rule the gear Equip button
  // (canEquip.ok, below in SlotCard) already enforces -- engine.equipConsumable
  // now blocks this server-side too, but disabling it here matches gear's own
  // UX instead of letting a click silently no-op into a toast.
  const deployed = hero.status === 'questing';
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
          <ConsumableIcon icon={def.icon} glyph={def.glyph} />
          <div className="item-card-body">
            <div className="item-card-name">{def.name} ×{count}</div>
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
              <div>
                <span className="card-title">{def.name}</span>
                <div className="tiny muted">Owned ×{count}</div>
              </div>
            </div>
            <div className="tiny muted">{def.description}</div>
            <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
              {instantUse && (
                <button
                  className="btn-primary"
                  onClick={() => { engine.useConsumable(hero.id, def.id); setOpen(false); }}
                >
                  Use on {hero.name}
                </button>
              )}
              {loadout && (
                <button
                  className="btn-primary"
                  disabled={deployed}
                  onClick={() => { engine.equipConsumable(hero.id, def.id); setOpen(false); }}
                  title={deployed ? `${hero.name} is away on a quest.` : `Equip into ${hero.name}'s next open Consumable Slot`}
                >
                  Equip on {hero.name}
                </button>
              )}
              {peddlerCharm && (
                <button
                  className="btn-primary"
                  onClick={() => { engine.usePeddlerCharm(def.id); setOpen(false); }}
                >
                  Use
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
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
/**
 * A single consumable-equip slot for whichever hero is currently selected --
 * separate from the gear SLOTS grid above (consumables are used up over a
 * quest, gear isn't), but placed directly beneath it so it reads as part of
 * the same "what this hero is carrying" picture. Filled opens a modal with
 * the consumable's info and an Unequip action, same overlay/modal shape
 * SlotCard uses for gear; empty opens a modal with the picker instead of
 * expanding inline, for the same visual-consistency reason.
 */
function ConsumableSlotCard({
  hero, equippedDefId, available, engine,
}: {
  hero: Hero; equippedDefId: string | undefined;
  available: { def: ConsumableDef; count: number }[]; engine: GameEngine;
}) {
  const [open, setOpen] = useState(false);
  const def = equippedDefId ? InventoryManager.resolveDef(engine.state, equippedDefId) : undefined;
  // Same deployed-hero guard as ConsumableInfoCard above.
  const deployed = hero.status === 'questing';

  if (def) {
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
            <ConsumableIcon icon={def.icon} glyph={def.glyph} />
            <div className="item-card-body">
              <div className="item-card-name">{def.name}</div>
              <div className="tiny muted">Equipped on {hero.name}</div>
            </div>
          </div>
        </div>

        {open && (
          <div className="overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
                <div>
                  <span className="card-title">{def.name}</span>
                  <div className="tiny muted">Equipped on {hero.name}</div>
                </div>
              </div>
              <div className="tiny muted">{def.description}</div>
              <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
                <button
                  className="btn-primary"
                  disabled={deployed}
                  title={deployed ? `${hero.name} is away on a quest.` : undefined}
                  onClick={() => { engine.unequipConsumable(hero.id, def.id); setOpen(false); }}
                >
                  Unequip
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="item-card empty clickable">
        <div
          className="item-card-summary"
          onClick={() => setOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        >
          <div className="item-icon" style={{ width: 40, height: 40, fontSize: 18, display: 'grid', placeItems: 'center' }}>+</div>
          <div className="item-card-body">
            <div className="slot-name">consumable</div>
            <div className="tiny muted">Empty</div>
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-title" style={{ marginBottom: 8 }}>Equip a consumable on {hero.name}</div>
            {deployed ? (
              <p className="tiny muted">{hero.name} is away on a quest.</p>
            ) : available.length === 0 ? (
              <p className="tiny muted">Nothing spare to equip. Buy potions in the Shop.</p>
            ) : (
              <div className="row wrap" style={{ gap: 4 }}>
                {available.map(({ def: d, count }) => (
                  <button
                    key={d.id}
                    className="chip"
                    onClick={() => { engine.equipConsumable(hero.id, d.id); setOpen(false); }}
                    title={d.description}
                  >
                    {d.glyph} {d.name} ×{count}
                  </button>
                ))}
              </div>
            )}
            <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A single worn-gear slot. The collapsed card just shows icon, name, and
 *  rarity pill; clicking opens the full mod breakdown, durability, and
 *  the repair/remove actions in an overlay modal -- previously this
 *  expanded in place, which read as the whole card jumping/resizing
 *  when clicked. Same .overlay/.modal shape the shop item cards
 *  (EquipmentShopCard/ConsumableShopCard) and PeddlerCardDetailOverlay
 *  already use. */
/**
 * Elemental infusion line for an item's detail modal -- weapons show what
 * they deal (WeaponEnchantStation, `elementalDamage`, replaces on
 * reinfuse), everything else shows accumulated resist per element
 * (ArmourInfusionStation, `elementalResist`, additive across repeat
 * infusions of the same element). Neither field had ANY display anywhere
 * outside the infusion stations themselves before this -- not here, not
 * in RaidsPanel's ItemDetailOverlay -- so a fully-infused item read
 * identically to a plain one everywhere a player would actually check it,
 * even though both RaidManager.elementalBonus and
 * QuestManager.previewSuccess were already folding the values into the
 * success roll the whole time. Same "own line under the mods list" slot
 * `enchantStats` already established, distinct colour (--sky, matching
 * WeaponEnchantStation's own accent) so the two don't blur together.
 */
function ElementalInfoLine({ item }: { item: EquipmentItem }) {
  const resistEntries = (Object.entries(item.elementalResist ?? {}) as [ElementType, number][])
    .filter(([, value]) => value > 0);
  if (!item.elementalDamage && resistEntries.length === 0) return null;
  const tier = item.elementalDamageTier ?? 'common';
  return (
    <div className="tiny" style={{ marginTop: 2, color: 'var(--sky)' }}>
      {item.elementalDamage && (
        <span title={`${GEM_TIER_LABEL[tier]} tier -- bonus success against foes vulnerable to it, nullified against foes immune to it`}>
          {ELEMENT_GLYPH[item.elementalDamage]} Deals {ELEMENT_LABEL[item.elementalDamage]}
          {' '}(<span style={{ color: RARITY_COLOR[tier] }}>{GEM_TIER_LABEL[tier]}</span>)
        </span>
      )}
      {item.elementalDamage && resistEntries.length > 0 && ' · '}
      {resistEntries.map(([el, value], i) => (
        <span key={el} title={`+${value.toFixed(1)}% success resisting ${ELEMENT_LABEL[el]} attacks`}>
          {i > 0 ? ' · ' : ''}{ELEMENT_GLYPH[el]} +{value.toFixed(1)}% {ELEMENT_LABEL[el]} resist
        </span>
      ))}
    </div>
  );
}

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
  const repairDiscount = ModifierManager.global(engine.state).repairDiscount ?? 0;

  return (
    <>
      <div
        className={`item-card ${hasActiveSetBonus ? 'set-active' : ''}`}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} broken={EquipmentManager.isBroken(item)} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <RarityPill rarity={def.rarity} />
            {def.setId && <SetPill />}
            {def.craftable && <CraftedPill />}
            <DurabilityBar item={item} compact thresholdPercent={engine.state.autoRepairEnabled ? engine.state.autoRepairThresholdPercent : undefined} />
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
            <div className="modal-banner-scrim">
              <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <ItemIcon slot={def.slot} icon={def.icon} size={48} broken={EquipmentManager.isBroken(item)} />
                <div>
                  <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>
                    {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                  </span>
                  <div className="tiny muted">{slot} · requires level {def.reqLevel}</div>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
                <RarityPill rarity={def.rarity} />
                {def.setId && <SetPill />}
                {def.craftable && <CraftedPill />}
              </div>
              {(() => {
                const modLines = describeMods(item.customMods ?? def.mods ?? {});
                // patch 0255: a procedural roll or Guildmade/Masterwork craft's
                // real power lives in item.rolledStats now (all-stats rework,
                // see guild-idler-status.md) -- folded into the same bonuses
                // line rather than a separate one, since this occupies the
                // exact spot the old mod roll used to. Distinct from the
                // "Enchanted:" line below, which is Armour Infusion's own
                // purchased stats, never touched by this.
                const rolledLines = item.rolledStats ? describeStats(item.rolledStats, true) : [];
                const lines = [...modLines, ...rolledLines];
                return <div className="tiny muted">{lines.length > 0 ? lines.join(' · ') : 'No bonuses'}</div>;
              })()}
              {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
                <div
                className="tiny"
                style={{ marginTop: 2, color: 'var(--brass)' }}
                title={item.enchantStats.strength ? MAIN_STAT_TOOLTIP : undefined}
              >
                Enchanted: {describeStats(item.enchantStats, true).join(' · ')}
              </div>
              )}
              <ElementalInfoLine item={item} />
              {def.setId && (
                <SetInfoBlock hero={hero} setId={def.setId} equipped={item.durability > 0} />
              )}
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {item.durability === 0 ? 'Broken, no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
              </div>
              <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
                <button
                  className="btn-primary"
                  disabled={EquipmentManager.repairCost(item, workshop, repairDiscount) === 0}
                  onClick={() => { engine.repair(item.uid); setOpen(false); }}
                >
                  {itemFreeRepairAvailable && EquipmentManager.repairCost(item, workshop, repairDiscount) > 0
                    ? 'Repair · Free'
                    : `Repair ${formatGold(EquipmentManager.repairCost(item, workshop, repairDiscount))}`}
                </button>
                <button onClick={() => { engine.unequip(hero.id, slot); setOpen(false); }}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A single stash item, same collapsed-card pattern as SlotCard. */
/** A single stash item -- same overlay-modal treatment as SlotCard above,
 *  replacing the previous inline expand.
 *
 *  Patch 0277: no Sell button here anymore -- direct request, selling
 *  moved entirely to the Blacksmith's own "Sell from the stash" section
 *  (VendorsPanel.tsx's ArmourStock), alongside Scrap, which already lived
 *  there since patch 0267. This card is purely for viewing, equipping,
 *  and locking now, matching the panel's own subtitle ("Buying and
 *  selling both happen in the Shop -- this is just what you have"),
 *  which was already true for the Shop side and is now true for Sell
 *  too. `confirmSell` dropped from the props for the same reason -- with
 *  no Sell action left in this component, there's nothing left for it to
 *  gate. */
function StashCard({
  item, hero, engine,
}: { item: EquipmentItem; hero: Hero; engine: GameEngine }) {
  const [open, setOpen] = useState(false);
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return null;
  const canEquip = EquipmentManager.canEquip(hero, item);
  const isUpgrade = isGearUpgrade(hero, item, def);

  return (
    <>
      <div
        className="item-card"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} broken={EquipmentManager.isBroken(item)} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <RarityPill rarity={def.rarity} />
            {def.setId && <SetPill />}
            {def.craftable && <CraftedPill />}
            {isUpgrade && <UpgradePill />}
            {item.locked && <LockedPill />}
            <DurabilityBar item={item} compact thresholdPercent={engine.state.autoRepairEnabled ? engine.state.autoRepairThresholdPercent : undefined} />
          </div>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
            <div className="modal-banner-scrim">
              <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <ItemIcon slot={def.slot} icon={def.icon} size={48} broken={EquipmentManager.isBroken(item)} />
                <div>
                  <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>
                    {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                  </span>
                  <div className="tiny muted">{def.slot} · requires level {def.reqLevel}</div>
                </div>
              </div>
              <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
                <RarityPill rarity={def.rarity} />
                {def.setId && <SetPill />}
                {def.craftable && <CraftedPill />}
                {isUpgrade && <UpgradePill />}
                {item.locked && <LockedPill />}
              </div>
              {(() => {
                const modLines = describeMods(item.customMods ?? def.mods ?? {});
                // patch 0255: a procedural roll or Guildmade/Masterwork craft's
                // real power lives in item.rolledStats now (all-stats rework,
                // see guild-idler-status.md) -- folded into the same bonuses
                // line rather than a separate one, since this occupies the
                // exact spot the old mod roll used to. Distinct from the
                // "Enchanted:" line below, which is Armour Infusion's own
                // purchased stats, never touched by this.
                const rolledLines = item.rolledStats ? describeStats(item.rolledStats, true) : [];
                const lines = [...modLines, ...rolledLines];
                return <div className="tiny muted">{lines.length > 0 ? lines.join(' · ') : 'No bonuses'}</div>;
              })()}
              {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
                <div
                className="tiny"
                style={{ marginTop: 2, color: 'var(--brass)' }}
                title={item.enchantStats.strength ? MAIN_STAT_TOOLTIP : undefined}
              >
                Enchanted: {describeStats(item.enchantStats, true).join(' · ')}
              </div>
              )}
              <ElementalInfoLine item={item} />
              {def.setId && (
                <SetInfoBlock hero={hero} setId={def.setId} equipped={false} />
              )}
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {item.durability === 0 ? 'Broken, no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
              </div>
              <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
                <button
                  className="btn-primary"
                  disabled={!canEquip.ok}
                  onClick={() => { engine.equip(hero.id, item.uid); setOpen(false); }}
                  title={canEquip.reason}
                >
                  Equip on {hero.name}
                </button>
                <button
                  onClick={() => engine.toggleItemLock(item.uid)}
                  title={item.locked
                    ? 'Unlock -- Sell, Sell Junk, and Scrap can reach this item again'
                    : 'Lock in the Vault -- protects this item from Sell, Sell Junk, and Scrap'}
                >
                  {item.locked ? `${'\uD83D\uDD13'} Unlock` : `${'\uD83D\uDD12'} Lock in Vault`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function EquipmentPanel() {
  const engine = useEngine();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;
  const [heroId, setHeroId] = useState(state.heroes[0].id);
  const hero = state.heroes.find((h) => h.id === heroId) ?? state.heroes[0];

  const repairBill = EquipmentManager.allItems(state)
    .reduce((sum, e) => sum + EquipmentManager.repairCost(e.item, workshop, ModifierManager.global(state).repairDiscount ?? 0), 0);

  const curiosOwned = CurioManager.owned(state);

  // Gear-type filter -- sorts the Stash grid down to one slot at a time
  // (Weapon/Helmet/etc.), purely a display filter. 'all' is the default
  // so nothing changes for anyone who never touches it.
  const [stashSlotFilter, setStashSlotFilter] = useState<EquipSlot | 'all'>('all');
  const stashCapacity = ModifierManager.stashCapacity(state);
  const filteredStash = state.stash.filter((item) => {
    if (stashSlotFilter === 'all') return true;
    const def = EQUIPMENT_BY_ID[item.defId];
    return def?.slot === stashSlotFilter;
  });

  return (
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/inventory.jpg)' }}>
      <div className="tab-scene-content">
      <h2>Inventory</h2>
      <p className="subtitle">
        Everything the guild owns: worn gear, the shared stash, and consumables on hand.
        Buying and selling both happen in the Shop. This is just what you have.
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
          right now"). Each set is its own clickable SetBonusCard -- click to
          expand and see exactly which equipped items are that set's pieces
          and every tier's actual bonus text, not just the fact that
          something is "active" (direct tester feedback on both counts).
          Still only lists sets with at least one bonus currently met, same
          visibility rule the old plain-list version used -- a set worn
          below its first threshold has nothing "active" to summarise here
          yet. */}
      {(() => {
        const wornSetIds = Array.from(
          new Set(
            Object.values(hero.equipment)
              .filter((item): item is EquipmentItem => !!item && item.durability > 0)
              .map((item) => EQUIPMENT_BY_ID[item.defId]?.setId)
              .filter((id): id is string => !!id),
          ),
        );
        const activeSetIds = wornSetIds.filter((setId) => {
          const info = setInfoFor(hero, setId);
          return info && info.active.length > 0;
        });
        if (activeSetIds.length === 0) return null;
        return (
          <div className="card set-info" style={{ marginBottom: 10 }}>
            <div className="section-heading" style={{ marginBottom: 4, color: 'var(--teal)' }}>
              Active Set Bonuses
            </div>
            {activeSetIds.map((setId) => (
              <SetBonusCard key={setId} hero={hero} setId={setId} />
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
            disabled={hero.status === 'questing'}
            onClick={() => engine.equipBestConsumables(hero.id)}
            title={hero.status === 'questing' ? `${hero.name} is away on a quest.` : 'Fill this hero\'s empty consumable slots with the best available potions'}
          >
            Equip best
          </button>
        )}
      </div>
      <div className="item-card-grid">
        {Array.from({ length: ModifierManager.consumableSlots(state) }).map((_, i) => {
          const equipped = hero.equippedConsumables ?? [];
          // Available to equip here: an actual loadout-effect consumable
          // (patch 0263 -- previously this list had NO such check at all,
          // so a Pet Treat or any other non-loadout item could still be
          // "equipped" into a slot here even though the per-item detail
          // popup's own Equip button was already correctly gated by this
          // exact same check; see InventoryManager.isLoadoutEffect's own
          // comment), owned in excess of however many are already slotted
          // (on this hero or any other) -- prevents "equipping" the same
          // single potion into two slots at once.
          const equippedElsewhereCount = (defId: string) =>
            state.heroes.reduce((sum, other) => sum + (other.equippedConsumables ?? []).filter((id) => id === defId).length, 0);
          const available = InventoryManager.owned(state).filter(
            ({ def }) => InventoryManager.isLoadoutEffect(def) && equippedElsewhereCount(def.id) < InventoryManager.count(state, def.id),
          );
          return (
            <ConsumableSlotCard key={i} hero={hero} equippedDefId={equipped[i]} available={available} engine={engine} />
          );
        })}
      </div>

      <div className="section-heading">Consumables</div>
      <p className="tiny muted" style={{ marginTop: -6, marginBottom: 6 }}>
        Click one to Use or Equip it on {hero.name} (switch heroes with the tabs above).
      </p>
      {InventoryManager.owned(state).length === 0 ? (
        <p className="small muted">None on hand. The Shop sells potions and charms.</p>
      ) : (
        <div className="item-card-grid">
          {InventoryManager.owned(state).map(({ def, count }) => (
            <ConsumableInfoCard key={def.id} def={def} count={count} hero={hero} engine={engine} />
          ))}
        </div>
      )}

      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>
          Stash ({state.stash.length}/{stashCapacity})
        </div>
        {state.stash.length > 0 && (
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <select
              value={stashSlotFilter}
              onChange={(e) => setStashSlotFilter(e.target.value as EquipSlot | 'all')}
              style={{
                background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
              }}
            >
              <option value="all">All slots</option>
              {SLOTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare. Loot drops from successful quests.</p>}
      {state.stash.length > 0 && filteredStash.length === 0 && (
        <p className="small muted">Nothing in the stash matches that filter.</p>
      )}
      <div className="item-card-grid">
        {filteredStash.map((item) => (
          <StashCard key={item.uid} item={item} hero={hero} engine={engine} />
        ))}
      </div>

      {/* Sellable odds-and-ends -- see CurioDef's own doc comment in
          types.ts. No confirm-sell gate on this bulk action -- a curio
          has no equip/durability/rarity stakes attached, so there's
          nothing a misclick here could cost beyond the sale itself. */}
      {curiosOwned.length > 0 && (
        <>
          <div className="spread" style={{ alignItems: 'center' }}>
            <div className="section-heading" style={{ marginBottom: 0 }}>Curios ({curiosOwned.length})</div>
            <button
              className="btn-green"
              style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
              onClick={() => engine.sellAllCurios()}
              title="Sells every curio currently in the stash"
            >
              Sell All · {formatGold(curiosOwned.reduce((sum, { def, count }) => sum + def.sellValue * count, 0))}
            </button>
          </div>
          <div className="item-card-grid">
            {curiosOwned.map(({ def, count }) => (
              <CurioCard key={def.id} def={def} count={count} engine={engine} />
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
