import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { CraftingManager } from '../game/managers/CraftingManager';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CRAFTING_RECIPES } from '../game/data/craftingRecipes';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { backgroundSrc } from '../game/settings';
import {
  CraftingRecipeDef, EquipmentDef, EquipmentItem, MaterialId, Modifiers, Rarity, Stats,
} from '../game/types';
import {
  describeMods, describeStats, formatGold, MOD_LABEL, RARITY_COLOR, craftingStatLabel, MAIN_STAT_TOOLTIP,
} from '../game/util';
import { RecipeIcon, ItemIcon, MaterialIcon } from './icons';
import { RarityPill } from './RarityPill';

type Category = CraftingRecipeDef['category'];

/**
 * Tag/tab derivation for the two recipe pickers that got filter tabs in
 * patch 0348 (direct report -- "Armour is easy, they have slots.
 * consumables to be filtered by what they give"). Both are plain
 * functions of static recipe/def data, not component state, so they sit
 * up here next to the other lookup tables rather than inside
 * CraftingStation itself.
 */

/** Blacksmith gear recipes, tagged by the equipment slot they produce
 *  (`resultDefId` -> EquipmentDef.slot). Every gear recipe has exactly
 *  one slot, so this is always a single-element array. */
function gearSlotTags(recipe: CraftingRecipeDef): string[] {
  const def = recipe.resultDefId ? EQUIPMENT_BY_ID[recipe.resultDefId] : undefined;
  return def ? [def.slot] : [];
}

/** The tab set for gear's own picker -- collected from whichever slots
 *  the current category's recipes actually produce, rather than a fixed
 *  list, so a future gear recipe on a slot with nothing craftable today
 *  (shield) doesn't need this list hand-updated. Sentence case label
 *  from the raw EquipSlot string -- no separate label table needed, none
 *  of the nine slot names need anything fancier than a capitalized
 *  first letter. */
function gearSlotTabs(recipes: CraftingRecipeDef[]): { id: string; label: string }[] {
  const slots = Array.from(new Set(recipes.flatMap(gearSlotTags)));
  return slots.map((s) => ({ id: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
}

/**
 * Consumable/charm recipes, tagged by which of their own quest effects
 * actually apply (`resultConsumableId` -> ConsumableDef.effect) -- a
 * recipe with several real effects (success + gold both set, say) gets
 * several tags and shows up under each one, direct request: "if it
 * boosts a stat and heals, it appears in [both] filter[s]." `injury` is
 * a special case: Meal On The Go's own `injuryResist` bonus is a
 * player-*picked* option (`recipe.modOptions`), not baked into the base
 * item's `effect` the other five tags read from, so it's checked
 * separately. Pet Treat's `effect` is `{}` (fed to a pet directly, no
 * quest effect at all) and gets no tags -- it only ever shows under
 * "All", which is the accurate answer, not a bug.
 */
function consumableEffectTags(recipe: CraftingRecipeDef): string[] {
  const def = recipe.resultConsumableId ? CONSUMABLE_BY_ID[recipe.resultConsumableId] : undefined;
  const effect = def?.effect;
  const tags: string[] = [];
  if (effect?.success) tags.push('success');
  if (effect?.gold) tags.push('gold');
  if (effect?.lootWeightStat === 'luck') tags.push('luck');
  if (effect?.lootWeightStat === 'wisdom') tags.push('insight');
  if (effect?.peddlerCounterReduction) tags.push('peddler');
  if ((recipe.modOptions as string[] | undefined)?.includes('injuryResist')) tags.push('injury');
  return tags;
}

/** Fixed tab set (unlike gearSlotTabs' derived one) -- these six cover
 *  every effect any consumable/charm recipe actually has today, and
 *  "which effects exist" is a much rarer thing to add to than "which
 *  slots have a recipe," so a hand-written list reads clearer here than
 *  deriving one from CONSUMABLE_TABS the way gearSlotTabs does. */
const CONSUMABLE_EFFECT_TABS = [
  { id: 'success', label: 'Success' },
  { id: 'gold', label: 'Gold' },
  { id: 'luck', label: 'Luck' },
  { id: 'insight', label: 'Insight' },
  { id: 'injury', label: 'Injury resist' },
  { id: 'peddler', label: 'Peddler' },
];

/**
 * One background scene per category, matching the vendor it belongs to
 * (Blacksmith/gear, Alchemist/consumable, Enchanter/enchant) -- committed
 * art, not the gitignored-licensed convention public/vendors/ uses, so no
 * "missing file" fallback needed here the way VendorSprite has to have one.
 *
 * These are always the dim-mode path; passed through backgroundSrc() below
 * so Guild's Mood ("bright" setting, patch 0305/0309) can swap in a
 * lore/crafting/bright/<file> counterpart the same way VendorsPanel's own
 * vendor-scene wrapper already does (patch 0344, direct report -- this
 * station-level scene had been left out of that pass entirely). `gear`
 * (0344), `enchant`/`charm` (0345), and now `consumable` (0346) all have
 * real bright/ art committed; `gem` still just keeps showing its dim image
 * via the same "missing file quietly fails to paint" convention this game
 * already relies on elsewhere until it gets commissioned art of its own.
 */
const STATION_BG: Record<Category, string> = {
  gear: './lore/crafting/gear.jpg',
  consumable: './lore/crafting/consumable.jpg',
  enchant: './lore/crafting/enchant.jpg',
  // No commissioned art yet -- same "missing file just fails to paint"
  // convention every other banner/background in this game already uses.
  gem: './lore/crafting/gem.jpg',
  // Charms moved to the Alchemist (patch 0347, direct report -- "Alch
  // now has 2 functions") and now shares the Alchemist's own single-slot
  // consumable.jpg scene outright, same reasoning ArmourInfusionStation
  // sharing Weapon Enchanting's infuse.jpg already established in patch
  // 0346: both categories crafted the exact same way (one recipe, no
  // manual materials/bonus slots), so a second dedicated image would
  // just be a second thing to keep in sync. No longer reuses enchant.jpg
  // -- charm recipes were never really at the Enchanter's own bench
  // physically, that was just where the button used to live.
  charm: './lore/crafting/consumable.jpg',
};

const STATION_TITLE: Record<Category, string> = {
  gear: 'Crafting', consumable: 'Supplies', enchant: 'Enchanting', gem: 'Gems', charm: 'Charms',
};

/**
 * Which locked-aspect-ratio CSS class each category's scene uses (patch
 * 0242) -- gear/enchant/gem/charm/consumable all share .craft-scene's
 * 1402:1122 canvas as of patch 0346 (the Alchemist's new commissioned
 * art landed on that same shared canvas, so `.consumable-scene`'s own
 * 1277:1232 lock -- built for the old Alchemist_Crafting_Box.png this
 * replaces -- is no longer needed here; left in app.css unused rather
 * than deleted, same "orphaned rather than pruned" treatment
 * gearenhance.jpg already gets).
 */
const SCENE_CLASS: Record<Category, string> = {
  gear: 'craft-scene', consumable: 'craft-scene', enchant: 'craft-scene', gem: 'craft-scene', charm: 'craft-scene',
};

export interface Rect { left: number; top: number; width: number; height: number; }

/**
 * Percent-based slot rects, hand-measured against each background's own
 * 1402x1122 canvas. The scene container below is locked to that exact
 * aspect ratio via CSS (`aspect-ratio`), so these percentages line up with
 * the art's own painted frames regardless of how large the window renders
 * them -- no separate mobile/desktop cases needed. If a future art pass
 * moves the painted frames even slightly, these are the only four numbers
 * per category that need nudging.
 */
const SLOT_RECTS: Record<Category, { top: Rect; bottomLeft: Rect; bottomRight: Rect }> = {
  gear: {
    top: { left: 41.7, top: 24.2, width: 15.9, height: 19.3 },
    bottomLeft: { left: 30.0, top: 53.1, width: 15.4, height: 19.3 },
    bottomRight: { left: 53.9, top: 53.1, width: 15.4, height: 19.3 },
  },
  // Re-measured against the Alchemist's new commissioned consumable.jpg
  // (patch 0346, direct report) -- one single centred slot now, same
  // "recipe picker only" shape EnhanceStation's own SLOT_RECT uses,
  // replacing the old three-slot Alchemist_Crafting_Box.png layout. Only
  // `top` is ever rendered for this category now (see the scene JSX
  // below -- no bottomLeft/bottomRight block for `consumable` anymore,
  // `charm` keeps its own three-slot block since it still shares
  // enchant.jpg's layout, not this). bottomLeft/bottomRight kept as a
  // harmless centered placeholder, same convention `gem`'s own comment
  // explains, since the Record type requires all three either way.
  consumable: {
    top: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
    bottomLeft: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
    bottomRight: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
  },
  // Re-measured against the new commissioned enchant.jpg (patch 0345,
  // direct report -- the new art's painted frames run noticeably larger
  // than the old placeholder-era ones, especially the two bottom slots,
  // so the previous numbers left icons sitting visibly off-centre).
  // Detected via the same connected-components pass as every other
  // station's real art (see EnhanceStation/CraftingStation's own
  // 0344 comments), then inset ~1.5% per edge off the raw frame
  // bounding box so an icon sits inside the gold border rather than
  // touching it.
  enchant: {
    top: { left: 41.3, top: 22.9, width: 17.2, height: 21.7 },
    bottomLeft: { left: 29.3, top: 50.3, width: 17.4, height: 22.0 },
    bottomRight: { left: 53.1, top: 50.7, width: 17.5, height: 21.6 },
  },
  // Only the top slot is ever rendered for `gem` (see the scene JSX below
  // -- there's no category==='gem' block adding bottom slots, a recipe is
  // the only choice this category needs), so bottomLeft/bottomRight here
  // are never actually shown; kept centered as a harmless placeholder
  // rather than omitted, since the Record type requires all three either
  // way. These numbers were originally a copy of consumable's own rect as
  // a stand-in pending real commissioned art -- left as literal values
  // rather than a live reference, since patch 0242 moved consumable onto
  // its own differently-shaped art/aspect-ratio (Alchemist_Crafting_Box.png,
  // 1277x1232) while gem.jpg is still on the original shared 1402x1122
  // canvas every other .craft-scene category uses. Re-measure properly
  // once gem gets its own commissioned art.
  gem: {
    top: { left: 41.4, top: 18.5, width: 16.5, height: 21.0 },
    bottomLeft: { left: 26.5, top: 52.0, width: 16.0, height: 20.3 },
    bottomRight: { left: 57.1, top: 52.0, width: 16.0, height: 20.3 },
  },
  // Charms (patch 0347) now share the Alchemist's own single-slot
  // consumable.jpg scene and rects outright -- identical values to
  // `consumable` above, not a live reference to it, same "literal copy"
  // convention `gem`'s own comment explains for why this Record can't
  // just alias one category to another. Only `top` is ever rendered
  // (see the scene JSX below -- no bottomLeft/bottomRight block for
  // `charm` anymore either, both consumable-like categories are single-
  // slot now).
  charm: {
    top: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
    bottomLeft: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
    bottomRight: { left: 41.1, top: 36.7, width: 17.7, height: 22.1 },
  },
};

/** A single option row inside a slot's picker popup. */
export interface PickerOption {
  key: string;
  label: string;
  /**
   * Plain text in almost every picker (a recipe's flavour text, an
   * item's owner). Widened to ReactNode (patch 0346) so the Alchemist's
   * recipe table can show live colour-coded have/need material badges
   * here instead of a flat description string -- see materialBadges()
   * below. `hasSublabels`'s truthy check and the `<td>`/grid-card render
   * both already just drop whatever's passed straight into JSX, so a
   * plain string still works unchanged everywhere else.
   */
  sublabel?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Actual equipment only -- a recipe (crafting/enchant/gem/charm) has
   *  no rarity of its own, so this stays unset for every picker except
   *  an item picker (CraftingStation's own Enchant top slot, plus every
   *  other station's item slot -- EnhanceStation, ScrapStation,
   *  WeaponEnchantStation, ArmourInfusionStation). Drives
   *  .craft-picker-row's left-edge rarity stripe, same colour set
   *  RarityPill/item-card names already use (patch 0247, direct
   *  feedback that the picker table read as flatter than the Inventory
   *  grid it's showing the exact same items from). */
  rarity?: Rarity;
  /**
   * Which filter tab(s) (PickerModal's own `tabs` prop) this option
   * belongs to (patch 0348, direct report) -- e.g. an equipment slot, an
   * element, or one of a consumable's own quest effects. A consumable
   * with several effects carries several tags and shows up under each
   * one, same as a filter checkbox would; an option with none only ever
   * appears under "All". Ignored entirely by a picker with no `tabs`.
   */
  tags?: string[];
}

/** One clickable frame on the scene -- shows what's picked, or a plain
 *  "+" prompt when empty, and opens `onOpen` (a PickerModal) on click. */
export function SlotBox({
  rect, filled, disabled, label, onOpen,
}: {
  rect: Rect; filled: ReactNode | null; disabled?: boolean; label: string; onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`craft-slot ${filled ? 'filled' : ''} ${disabled ? 'disabled' : ''}`}
      style={{
        left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%`,
      }}
      disabled={disabled}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      {filled ?? <span className="craft-slot-plus" aria-hidden="true">+</span>}
    </button>
  );
}

/** Small nested picker -- reuses the same overlay/modal shell every other
 *  click-to-open-detail surface in this game already uses (see
 *  EquipmentShopCard), just narrower and listing options instead of one
 *  item's own detail. `closeOnPick` defaults to true (pick one, done) --
 *  set false for a picker where more than one row can be selected in the
 *  same visit (e.g. a sigil that grants more than one stat), so picking
 *  one doesn't force reopening the popup to pick the next. `selectedKeys`
 *  drives the checked/highlighted look either way, but only matters
 *  visually once closeOnPick is false -- a single-pick popup closes
 *  before the person would ever see it. */
/**
 * Was a scrolling stack of card-rows (still is, past `.craft-picker-list`'s
 * own max-height -- a picker with a genuinely long option list, e.g. every
 * item in the stash, still scrolls) -- rebuilt as an actual `<table>` on
 * direct feedback that a flat vertical list of cards was hard to scan.
 * Icon/Name/Details/pick columns line up now instead of each row being its
 * own independent little block, so comparing several options (e.g. which
 * stash item is which owner/refinement level) doesn't require re-reading
 * each row's own two-line layout from scratch. `<tr>` keeps the same
 * click-to-pick behaviour the old `<button>` row had, plus explicit
 * `role="button"`/`tabIndex`/`onKeyDown` so keyboard activation (Enter or
 * Space) still works the way a native button's did for free.
 *
 * `layout='grid'` (patch 0346, direct report) is a second rendering mode
 * for the same options/onPick/selectedKeys contract -- a single-column
 * `<tr>` still reads as "a scrolling 1-by-1 list" even wrapped in a
 * `<table>`, which is what prompted this: item pickers (Weapon Enchanting,
 * Armour Infusion) and their enchant/infusion pickers now want several
 * square icon+name cards per row instead. Deliberately not a blanket
 * default -- every other picker (recipes, gear/enchant bonus picks, the
 * Alchemist's own recipe table) still wants the row shape's room for a
 * Details column, so `layout` defaults to 'rows' and call sites opt in.
 */
export function PickerModal({
  title, options, onPick, onClose, closeOnPick = true, selectedKeys, layout = 'rows', maxWidth, tabs,
}: {
  title: string; options: PickerOption[]; onPick: (key: string) => void; onClose: () => void;
  closeOnPick?: boolean; selectedKeys?: string[]; layout?: 'rows' | 'grid'; maxWidth?: number;
  /**
   * Filter tabs above the list/grid (patch 0348, direct report) -- an
   * "All" tab is prepended automatically, callers only pass the real
   * categories. An option belongs to a tab when its own `tags` array
   * (PickerOption.tags) includes that tab's `id`; an option with no
   * tags at all (e.g. Pet Treat, which has no quest effect to tag) only
   * ever shows up under "All", same as it would with no tabs at all.
   * Omit entirely for a picker with nothing worth filtering by (the
   * stat/bonus pickers stay flat, direct request -- "probably doesn't
   * need tabs").
   */
  tabs?: { id: string; label: string }[];
}) {
  const [activeTab, setActiveTab] = useState('all');
  const visible = !tabs || activeTab === 'all' ? options : options.filter((o) => o.tags?.includes(activeTab));
  const hasSublabels = visible.some((o) => o.sublabel);
  const pick = (opt: PickerOption) => {
    if (opt.disabled) return;
    onPick(opt.key);
    if (closeOnPick) onClose();
  };
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: maxWidth ?? (layout === 'grid' ? 620 : 680) }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">{title}</span>
          <button className={closeOnPick ? '' : 'btn-primary'} onClick={onClose}>
            {closeOnPick ? 'Close' : 'Done'}
          </button>
        </div>
        {tabs && tabs.length > 0 && (
          <div className="craft-picker-tabs">
            <button
              type="button"
              className={`craft-picker-tab ${activeTab === 'all' ? 'on' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`craft-picker-tab ${activeTab === t.id ? 'on' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {visible.length === 0 && <p className="small muted">Nothing available yet.</p>}
        {visible.length > 0 && layout === 'grid' && (
          <div className="craft-picker-grid">
            {visible.map((opt) => {
              const selected = selectedKeys?.includes(opt.key) ?? false;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`craft-picker-grid-card ${selected ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
                  disabled={opt.disabled}
                  onClick={() => pick(opt)}
                  style={opt.rarity ? { borderColor: RARITY_COLOR[opt.rarity] } : undefined}
                  title={opt.label}
                >
                  <span className="craft-picker-grid-icon">{opt.icon ?? null}</span>
                  <span className="craft-picker-grid-name" style={opt.rarity ? { color: RARITY_COLOR[opt.rarity] } : undefined}>{opt.label}</span>
                  {opt.sublabel != null && <span className="craft-picker-grid-sub tiny muted">{opt.sublabel}</span>}
                  {selected && <span aria-hidden="true" className="craft-picker-grid-check">✓</span>}
                </button>
              );
            })}
          </div>
        )}
        {visible.length > 0 && layout === 'rows' && (
          <div className="craft-picker-list">
            <table className="craft-picker-table">
              <thead>
                <tr>
                  <th aria-hidden="true" className="craft-picker-th-icon" />
                  <th className="craft-picker-th-name">Name</th>
                  {hasSublabels && <th className="craft-picker-th-detail">Details</th>}
                  <th aria-hidden="true" className="craft-picker-th-check" />
                </tr>
              </thead>
              <tbody>
                {visible.map((opt) => {
                  const selected = selectedKeys?.includes(opt.key) ?? false;
                  return (
                    <tr
                      key={opt.key}
                      className={`craft-picker-row ${selected ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
                      role="button"
                      tabIndex={opt.disabled ? -1 : 0}
                      aria-disabled={opt.disabled}
                      onClick={() => pick(opt)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(opt); } }}
                    >
                      {/* Rarity stripe lives on the icon cell specifically, not
                          the <tr> -- `border-collapse: collapse` on the table
                          only respects borders declared on <td>/<th>, an
                          inline border on <tr> itself is silently dropped by
                          every browser once collapse is in effect. */}
                      <td className="craft-picker-td-icon" style={opt.rarity ? { borderLeftColor: RARITY_COLOR[opt.rarity] } : undefined}>{opt.icon ?? null}</td>
                      <td className="craft-picker-td-name" style={opt.rarity ? { color: RARITY_COLOR[opt.rarity] } : undefined}>{opt.label}</td>
                      {hasSublabels && (
                        <td className={`tiny muted craft-picker-td-detail ${typeof opt.sublabel !== 'string' ? 'rich' : ''}`}>{opt.sublabel}</td>
                      )}
                      <td className="craft-picker-td-check">{selected && <span aria-hidden="true" className="craft-picker-check">✓</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Interposed between PickerModal's item pick and a station actually being
 * ready to fire (EnhanceStation's single slot, CraftingStation's Enchant
 * top slot) -- direct feedback that picking an item used to drop straight
 * back to the scene with nothing but a compact one-line summary, making it
 * easy to commit gold against the wrong piece of gear without really
 * looking at it first. Reuses the same stat block StashCard's own expanded
 * modal already shows (EquipmentPanel.tsx) -- name/rarity/mods/enchant/
 * durability -- rather than inventing a second item-detail layout. `extra`
 * is where each station injects its own station-specific projection (e.g.
 * Enhance's "+N -> +N+1" refinement line) below the shared block.
 * "Choose a different item" reopens the picker instead of just closing,
 * since the whole point of this step is to let a wrong pick be corrected
 * before it reaches the paid action button, not to add a second click
 * for a right one.
 */
export function ItemPreviewModal({
  item, def, onBack, onContinue, extra,
}: {
  item: EquipmentItem; def: EquipmentDef; onBack: () => void; onContinue: () => void; extra?: ReactNode;
}) {
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onBack}>
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
        <div className="tiny muted" style={{ marginTop: 4 }}>
          {item.durability === 0 ? 'Broken, no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
        </div>
        {extra}
        <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn-ghost" onClick={onBack}>Choose a different item</button>
          <button className="btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Generic sibling to ItemPreviewModal above, for a picked *option* rather
 * than an owned item -- a recipe, an enchant, an infusion (patch 0347,
 * direct report: "after clicking an enchant/gem -- because they just
 * show the name/icon and requirements, it should open a new little card
 * with its description, then click continue from there"). Same "confirm
 * before it commits" shape, just generic enough for any picker's
 * icon+title+detail rather than specifically an EquipmentItem/
 * EquipmentDef pair -- `detail` is whatever that station wants to show
 * (a recipe's description + materialBadges() readout, an enchant's
 * Ready/cost sublabel, etc.), not a fixed shape. Used by CraftingStation
 * itself for consumable/charm recipes, and by WeaponEnchantStation/
 * ArmourInfusionStation for their own enchant/resistance-gem picks.
 */
export function OptionPreviewModal({
  icon, title, detail, onBack, onContinue,
}: {
  icon: ReactNode; title: ReactNode; detail?: ReactNode; onBack: () => void; onContinue: () => void;
}) {
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onBack}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
          <span className="card-title">{title}</span>
        </div>
        {detail && <div className="tiny muted" style={{ marginBottom: 4 }}>{detail}</div>}
        <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn-ghost" onClick={onBack}>Choose a different option</button>
          <button className="btn-primary" onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export function CraftingStation({ category, onClose }: { category: Category; onClose: () => void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;
  const rects = SLOT_RECTS[category];

  const recipes = CRAFTING_RECIPES.filter((r) => r.category === category);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const recipe = recipeId ? CRAFTING_RECIPES.find((r) => r.id === recipeId) ?? null : null;

  // gear -- two independent fixed slots rather than a growing array, so
  // "set bottom-left" and "set bottom-right" can never collide or leave a
  // hole the way indexing into a shared array would. Stats keys as of
  // patch 0255 (all-stats rework, see guild-idler-status.md and
  // CraftingManager.craftGear's own comment) -- gear recipes no longer
  // pick Modifiers.
  const [modSlot0, setModSlot0] = useState<keyof Stats | null>(null);
  const [modSlot1, setModSlot1] = useState<keyof Stats | null>(null);
  // enchant
  const [targetUid, setTargetUid] = useState('');
  const [chosenStats, setChosenStats] = useState<(keyof Stats)[]>([]);
  // consumable -- which of the recipe's required materials have been
  // clicked-through/confirmed (one combined slot covering all of them,
  // however many there are -- see materialsSlot below), plus an optional
  // chosen bonus, same modOptions/modsToPick/modValue fields gear recipes
  // already use, toggled the same multi-select way the enchant stat slot
  // is (a list, not fixed gear-style slots -- modsToPick is realistically
  // 0 or 1 for a consumable, not gear's fixed 2).
  const [confirmedMaterials, setConfirmedMaterials] = useState<Set<MaterialId>>(new Set());
  const [chosenConsumableMods, setChosenConsumableMods] = useState<(keyof Modifiers)[]>([]);

  const [openSlot, setOpenSlot] = useState<'top' | 'bottomLeft' | 'bottomRight' | null>(null);

  function pickRecipe(id: string) {
    setRecipeId(id);
    setModSlot0(null);
    setModSlot1(null);
    setChosenStats([]);
    // Materials are never a real choice -- recipe.materialCost is a fixed
    // dict (confirmed: no recipe anywhere lets you satisfy a requirement
    // with an alternate material), so the old "click through each one in
    // a picker" step was pure busywork duplicating what the have/need
    // summary row above the Craft button already shows live. Auto-
    // confirmed the instant a recipe is picked instead of gating on a
    // manual click-through.
    const newRecipe = CRAFTING_RECIPES.find((r) => r.id === id);
    setConfirmedMaterials(new Set(newRecipe ? (Object.keys(newRecipe.materialCost) as MaterialId[]) : []));
    setChosenConsumableMods([]);
  }

  function reset() {
    setRecipeId(null);
    setModSlot0(null);
    setModSlot1(null);
    setTargetUid('');
    setChosenStats([]);
    setConfirmedMaterials(new Set());
    setChosenConsumableMods([]);
    setPreviewUid(null);
    setPreviewRecipeId(null);
  }

  const afford = recipe ? CraftingManager.affordability(state, recipe) : null;
  const materialIds = recipe ? (Object.keys(recipe.materialCost) as MaterialId[]) : [];

  const modsToPick = recipe?.modsToPick ?? 0;
  const statsToPick = recipe?.statsToPick ?? 0;
  const chosenGearStats = [modSlot0, modSlot1].filter((m): m is keyof Stats => m !== null);

  // `charm` (patch 0247) is a separate category purely so these recipes
  // route to the Enchanter's own Charms button instead of the Alchemist's
  // Supplies one -- every actual behaviour (materials/bonus bottom slots,
  // resultConsumableId, craftConsumable) is identical to `consumable`, so
  // every place that used to check `category === 'consumable'` checks
  // this instead, rather than repeating the `|| category === 'charm'`
  // four separate times.
  const isConsumableLike = category === 'consumable' || category === 'charm';

  const canCraft = !!recipe && !!afford?.ok
    && (category !== 'gear' || chosenGearStats.length === modsToPick)
    && (category !== 'enchant' || (chosenStats.length === statsToPick && targetUid !== ''))
    && (!isConsumableLike || (materialIds.every((id) => confirmedMaterials.has(id)) && chosenConsumableMods.length === modsToPick));

  /**
   * "Keep crafting" (direct ask) -- a consumable recipe deliberately stays
   * selected after a successful craft instead of the old unconditional
   * reset(), so brewing five of the same potion in a row is five clicks
   * on the same Craft button rather than five full trips back through the
   * recipe picker (and, before the materials fix above existed, five more
   * trips through the materials-confirm picker too). Materials/bonus
   * choice both carry over as-is; only gold/materials actually change per
   * craft, which affordability/the have-need row already recompute live.
   * Scoped to `consumable` only -- gear crafting picks 2 mods per item
   * and enchant targets one specific piece of gear by uid, neither of
   * which has the same "make several of the identical thing back to
   * back" shape a potion recipe does, so both keep resetting after every
   * craft same as before this patch.
   */
  function handleCraft() {
    if (!recipe) return;
    if (category === 'gear') { engine.craftGear(recipe.id, chosenGearStats); reset(); }
    else if (category === 'enchant') { engine.enchantItem(recipe.id, targetUid, chosenStats); reset(); }
    else if (category === 'gem') { engine.craftGem(recipe.id); reset(); }
    else engine.craftConsumable(recipe.id, chosenConsumableMods);
  }

  /* ------------------------------- top slot ------------------------------ */
  const topFilled = category === 'enchant'
    ? (() => {
      if (!targetUid) return null;
      const found = EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid);
      const def = found && EquipmentManager.def(found.item);
      return def ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null;
    })()
    : (recipe ? <RecipeIcon icon={recipe.icon} category={category} size={88} /> : null);

  /**
   * Live colour-coded have/need readout for one recipe -- red number
   * below what's needed, green once met, same colour convention the
   * existing per-recipe summary row below the scene already uses
   * (`.tiny.bad`/`.tiny.good`). Pulled into its own helper (patch 0346,
   * direct report) so the Alchemist's recipe table can show this same
   * breakdown inline per row instead of the flat description string
   * every other category's recipe picker uses -- see topOptions' own
   * `consumable` branch below. Deliberately not reused inside the
   * existing below-scene summary block (materialIds.map(...) further
   * down): that block is already correct and untouched by this patch,
   * this is purely an additional presentation of the same numbers.
   */
  function materialBadges(r: CraftingRecipeDef): ReactNode {
    const ids = Object.keys(r.materialCost) as MaterialId[];
    return (
      <span className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
        {ids.map((id) => {
          const material = MATERIAL_BY_ID[id];
          const need = r.materialCost[id] ?? 0;
          const have = state.materials[id] ?? 0;
          const short = have < need;
          return (
            <span key={id} className="row" style={{ gap: 3, alignItems: 'center' }} title={`${material.name}: have ${have}, need ${need}`}>
              <MaterialIcon icon={material.icon} glyph={material.glyph} size={16} />
              <span className={`tiny ${short ? 'bad' : 'good'}`}>{have}/{need}</span>
            </span>
          );
        })}
        {!!r.scrapCost && (
          <span className={`tiny ${state.scrap < r.scrapCost ? 'bad' : 'good'}`}>⚙ {state.scrap}/{r.scrapCost}</span>
        )}
        <span className={`tiny ${state.gold < CraftingManager.goldCost(state, r) ? 'bad' : 'good'}`}>
          {'\u25c6'} {formatGold(state.gold)}/{formatGold(CraftingManager.goldCost(state, r))}
        </span>
      </span>
    );
  }

  const topOptions: PickerOption[] = category === 'enchant'
    ? EquipmentManager.allItems(state).map(({ item, heroId }): PickerOption | null => {
      const def = EquipmentManager.def(item);
      if (!def) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name : 'Stash';
      return {
        key: item.uid, label: def.name, sublabel: owner ?? 'Stash', rarity: def.rarity,
        icon: <ItemIcon slot={def.slot} icon={def.icon} size={40} />,
      };
    }).filter((o): o is PickerOption => o !== null)
    // Alchemist's own recipe table (patch 0346, extended to Charms in
    // 0347 -- both are `isConsumableLike` now, see that flag's own
    // comment): "no need to select the resources manually, the recipe
    // should just show what you can and can't craft" -- swaps the flat
    // description sublabel every other category's recipe picker shows
    // for the live materialBadges() readout instead, so affordability is
    // visible for every recipe at a glance rather than needing to pick
    // one first. Not gated on affordability (`disabled` stays unset) --
    // an out-of-reach recipe is still worth picking to see its full
    // breakdown and start gathering toward it, same as it always was.
    : isConsumableLike
      ? recipes.map((r) => ({
        key: r.id, label: r.name, sublabel: materialBadges(r),
        icon: <RecipeIcon icon={r.icon} category={category} size={40} />,
        tags: consumableEffectTags(r),
      }))
      : recipes.map((r) => ({
        key: r.id, label: r.name, sublabel: r.description,
        icon: <RecipeIcon icon={r.icon} category={category} size={40} />,
        tags: category === 'gear' ? gearSlotTags(r) : undefined,
      }));

  // Gear's own picker (patch 0348, direct report): "tabs would be the
  // slots." Only `gear` gets this -- `enchant`'s item picker above and
  // `gem`'s plain recipe list weren't asked for tabs, and giving them an
  // empty `tabs={[]}` would render nothing anyway (PickerModal only
  // shows the tab row when `tabs.length > 0`) but stays explicit here
  // rather than relying on that fallthrough.
  const topTabs = category === 'gear' ? gearSlotTabs(recipes)
    : isConsumableLike ? CONSUMABLE_EFFECT_TABS
      : undefined;

  // Enchant's top slot picks an existing item (unlike every other
  // category's top slot, which picks a recipe) -- routed through a preview
  // step before it actually lands in targetUid, same reasoning as
  // EnhanceStation's own previewUid.
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;

  // Consumable/charm recipe pick, same "confirm before it commits" shape
  // as the item preview above (patch 0347, direct report: "consumable
  // crafting should do the same" as the new enchant/gem preview card) --
  // the table row's own sublabel is now materialBadges(), not the recipe's
  // description, so there's nowhere left on the table itself to actually
  // read what the thing does before committing to it. gear/gem/enchant
  // recipe picks are untouched -- their table row still shows the plain
  // description sublabel, no separate preview step was asked for there.
  const [previewRecipeId, setPreviewRecipeId] = useState<string | null>(null);
  const previewRecipe = previewRecipeId ? CRAFTING_RECIPES.find((r) => r.id === previewRecipeId) ?? null : null;

  function handleTopPick(key: string) {
    if (category === 'enchant') setPreviewUid(key);
    else if (isConsumableLike) setPreviewRecipeId(key);
    else pickRecipe(key);
  }

  /* ---------------------------- gear mod slots ---------------------------- */
  function gearModSlot(index: 0 | 1) {
    const picked = index === 0 ? modSlot0 : modSlot1;
    const otherPicked = index === 0 ? modSlot1 : modSlot0;
    const setPicked = index === 0 ? setModSlot0 : setModSlot1;
    // patch 0255: gear recipes pick Stats now, not Modifiers -- label
    // format matches the enchant stat picker just below (`+N Label`, no
    // `%`, since this is a flat stat point, not a percentage bonus) rather
    // than the old `+N% Label` mod-flavored text.
    const options: PickerOption[] = ((recipe?.modOptions ?? []) as (keyof Stats)[])
      .filter((m) => m !== otherPicked)
      .map((m) => ({ key: m, label: `+${recipe?.modValue ?? 0} ${craftingStatLabel(m)}` }));
    return {
      filled: picked ? <span className="craft-slot-label">+{recipe?.modValue} {craftingStatLabel(picked)}</span> : null,
      options,
      disabled: !recipe,
      onPick: (key: string) => setPicked(key as keyof Stats),
    };
  }
  const mod0 = gearModSlot(0);
  const mod1 = gearModSlot(1);

  /* -------------------------- enchant stat slot --------------------------- */
  const statOptions: PickerOption[] = (recipe?.statOptions ?? []).map((s) => ({
    key: s,
    label: `+${recipe?.statValue ?? 0} ${craftingStatLabel(s)}`,
    // Only the Main Stat option gets a sublabel -- the others (Endurance/
    // Luck/Wisdom) don't need explaining, and an empty "Details" cell next
    // to them reads fine once at least one row in the table has real
    // content there (hasSublabels only needs one true to show the column
    // at all).
    sublabel: s === 'strength' ? MAIN_STAT_TOOLTIP : undefined,
    disabled: !chosenStats.includes(s) && chosenStats.length >= statsToPick,
  }));

  function toggleStat(key: string) {
    const stat = key as keyof Stats;
    setChosenStats((prev) => {
      if (prev.includes(stat)) return prev.filter((s) => s !== stat);
      if (prev.length >= statsToPick) return prev;
      return [...prev, stat];
    });
  }

  const statFilled = chosenStats.length === 0 ? null : (
    <span
      className="craft-slot-label"
      title={chosenStats.includes('strength') ? MAIN_STAT_TOOLTIP : undefined}
    >
      {chosenStats.map((s) => `+${recipe?.statValue} ${craftingStatLabel(s)}`).join(', ')}
    </span>
  );

  /* ------------------------- consumable: bonus slot ------------------------ */
  // Consumable recipes are untouched by patch 0255's all-stats rework (a
  // temporary buff isn't gear) and still pick Modifiers keys -- cast is
  // safe since modOptions is only ever a mixed union at the type level to
  // cover gear's Stats keys too (see CraftingRecipeDef.modOptions).
  const consumableModOptions: PickerOption[] = ((recipe?.modOptions ?? []) as (keyof Modifiers)[]).map((m) => ({
    key: m,
    label: `+${recipe?.modValue ?? 0}% ${MOD_LABEL[m]}`,
    disabled: !chosenConsumableMods.includes(m) && chosenConsumableMods.length >= modsToPick,
  }));

  function toggleConsumableMod(key: string) {
    const mod = key as keyof Modifiers;
    setChosenConsumableMods((prev) => {
      if (prev.includes(mod)) return prev.filter((m) => m !== mod);
      if (prev.length >= modsToPick) return prev;
      return [...prev, mod];
    });
  }

  const scene = (
    <div className={SCENE_CLASS[category]} style={{ backgroundImage: `url(${backgroundSrc(STATION_BG[category], settings.backgroundMood)})` }}>
      <SlotBox
        rect={rects.top}
        filled={topFilled}
        label={category === 'enchant' ? 'Choose an item to enchant' : 'Choose a recipe'}
        onOpen={() => setOpenSlot('top')}
      />

      {category === 'gear' && (
        <>
          <SlotBox
            rect={rects.bottomLeft}
            filled={mod0.filled}
            disabled={mod0.disabled}
            label="Choose a bonus"
            onOpen={() => setOpenSlot('bottomLeft')}
          />
          <SlotBox
            rect={rects.bottomRight}
            filled={mod1.filled}
            disabled={mod1.disabled}
            label="Choose a second bonus"
            onOpen={() => setOpenSlot('bottomRight')}
          />
        </>
      )}

      {category === 'enchant' && (
        <>
          <SlotBox
            rect={rects.bottomLeft}
            filled={recipe ? <RecipeIcon icon={recipe.icon} category={category} size={80} /> : null}
            label="Choose what to apply"
            onOpen={() => setOpenSlot('bottomLeft')}
          />
          <SlotBox
            rect={rects.bottomRight}
            filled={statFilled}
            disabled={!recipe}
            label="Choose a stat"
            onOpen={() => setOpenSlot('bottomRight')}
          />
        </>
      )}

      {/* consumable/charm (patch 0347: charm joined consumable's
          single-slot rework) have no bottom boxes at all anymore --
          materials are auto-confirmed the instant a recipe is picked
          (pickRecipe, unchanged), and the rare bonus pick
          (modsToPick > 0, currently only craft_trail_meal) gets a plain
          text button below the scene instead -- see that button just
          after this scene block. */}
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">{STATION_TITLE[category]}</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>

        {scene}

        {recipe && (
          <div style={{ margin: '8px 0' }}>
            <p className="tiny muted" style={{ margin: '0 0 4px' }}>{recipe.name}</p>
            {/* Per-requirement icon + have/need count, color-coded --
                replaces what used to be a single flat sentence
                ("2 Ore + 1 Timber + 40 gold") with something that shows
                what's actually missing (and how much) at a glance, rather
                than making the player do the subtraction themselves or
                open the materials picker just to see a have/need number
                that picker already computed internally. */}
            <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
              {materialIds.map((id) => {
                const material = MATERIAL_BY_ID[id];
                const need = recipe.materialCost[id] ?? 0;
                const have = state.materials[id] ?? 0;
                const short = have < need;
                return (
                  <span
                    key={id}
                    className="row"
                    style={{ gap: 4, alignItems: 'center' }}
                    title={`${material.name}: have ${have}, need ${need}`}
                  >
                    <MaterialIcon icon={material.icon} glyph={material.glyph} size={20} />
                    <span className={`tiny ${short ? 'bad' : 'good'}`}>{have}/{need}</span>
                  </span>
                );
              })}
              {!!recipe.scrapCost && (
                <span className={`tiny ${state.scrap < recipe.scrapCost ? 'bad' : 'good'}`}>
                  ⚙ {state.scrap}/{recipe.scrapCost}
                </span>
              )}
              <span className={`tiny ${state.gold < CraftingManager.goldCost(state, recipe) ? 'bad' : 'good'}`}>
                ◆ {formatGold(state.gold)}/{formatGold(CraftingManager.goldCost(state, recipe))}
              </span>
            </div>
          </div>
        )}
        {!recipe && (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {category === 'enchant' ? 'Choose an item, then what to apply to it.' : 'Choose a recipe to begin.'}
          </p>
        )}

        {/* Consumable's one remaining choice beyond the recipe itself
            (patch 0346) -- almost every consumable/charm recipe has
            modsToPick === 0 (confirmed against crafting-recipes.json:
            16 of 17 do), so this only ever actually shows up for
            craft_trail_meal today. A plain text button rather than a
            SlotBox since the new single-slot Alchemist art has nowhere
            left to paint a second frame -- opens the exact same bonus
            picker (openSlot 'bottomRight') charm's own SlotBox already
            triggers below, just from off-canvas instead of on it. */}
        {category === 'consumable' && recipe && modsToPick > 0 && (
          <button
            type="button"
            className="btn-ghost"
            style={{ margin: '0 0 8px', width: '100%' }}
            onClick={() => setOpenSlot('bottomRight')}
          >
            {chosenConsumableMods.length > 0
              ? `Bonus: ${chosenConsumableMods.map((m) => `+${recipe.modValue}% ${MOD_LABEL[m]}`).join(', ')}`
              : `Choose a bonus (${chosenConsumableMods.length}/${modsToPick})`}
          </button>
        )}

        {/* Cost on the button label mirrors VendorsPanel's "Buy · <cost>" /
            "Level up · <cost>" convention -- every other paid action in the
            game already shows its price right on the button, this was the
            one holdout relying on the ◆ have/need row above (which stays;
            it answers a different question -- can I afford this right
            now -- than the flat sticker price the button now shows). */}
        <button className="btn-purple" disabled={!canCraft} onClick={handleCraft}>
          {afford && !afford.ok
            ? afford.reason
            : recipe
              ? (
                <>
                  {category === 'enchant' ? 'Enchant' : 'Craft'} {'\u00b7'} <span className="gold-text">{'\u25c6'} {formatGold(CraftingManager.goldCost(state, recipe))}</span>
                </>
              )
              : (category === 'enchant' ? 'Enchant' : 'Craft')}
        </button>
      </div>

      {openSlot === 'top' && (
        <PickerModal
          title={category === 'enchant' ? 'Choose an item' : 'Choose a recipe'}
          options={topOptions}
          tabs={topTabs}
          onPick={handleTopPick}
          onClose={() => setOpenSlot(null)}
        />
      )}

      {category === 'enchant' && previewItem && previewDef && (
        <ItemPreviewModal
          item={previewItem}
          def={previewDef}
          onBack={() => { setPreviewUid(null); setOpenSlot('top'); }}
          onContinue={() => { setTargetUid(previewItem.uid); setPreviewUid(null); setOpenSlot(null); }}
        />
      )}

      {/* Confirm step for a consumable/charm recipe pick (patch 0347,
          direct report) -- the table row's own sublabel is
          materialBadges() now, not a description, so this is the only
          place left to actually read what the recipe does before
          committing to it. onContinue is what used to fire straight from
          the table row's onPick: pickRecipe(id), unchanged. */}
      {isConsumableLike && previewRecipe && (
        <OptionPreviewModal
          icon={<RecipeIcon icon={previewRecipe.icon} category={category} size={48} />}
          title={previewRecipe.name}
          detail={(
            <>
              <div style={{ marginBottom: 6 }}>{previewRecipe.description}</div>
              {materialBadges(previewRecipe)}
            </>
          )}
          onBack={() => { setPreviewRecipeId(null); setOpenSlot('top'); }}
          onContinue={() => { pickRecipe(previewRecipe.id); setPreviewRecipeId(null); setOpenSlot(null); }}
        />
      )}

      {openSlot === 'bottomLeft' && category === 'gear' && (
        <PickerModal title="Choose a bonus" options={mod0.options} onPick={mod0.onPick} onClose={() => setOpenSlot(null)} />
      )}
      {openSlot === 'bottomRight' && category === 'gear' && (
        <PickerModal title="Choose a second bonus" options={mod1.options} onPick={mod1.onPick} onClose={() => setOpenSlot(null)} />
      )}

      {openSlot === 'bottomLeft' && category === 'enchant' && (
        <PickerModal
          title="Choose what to apply"
          options={recipes.map((r) => ({ key: r.id, label: r.name, sublabel: r.description, icon: <RecipeIcon icon={r.icon} category={category} size={40} /> }))}
          onPick={pickRecipe}
          onClose={() => setOpenSlot(null)}
        />
      )}
      {openSlot === 'bottomRight' && category === 'enchant' && (
        <PickerModal
          title={recipe ? `Choose a stat (${chosenStats.length}/${statsToPick})` : 'Choose what to apply first'}
          options={statOptions}
          onPick={toggleStat}
          onClose={() => setOpenSlot(null)}
          closeOnPick={statsToPick <= 1}
          selectedKeys={chosenStats}
        />
      )}

      {/* consumable/charm's only remaining picker modal -- the rare bonus
          pick (modsToPick > 0), triggered by the plain text button above
          rather than an on-canvas slot (see that button's own comment).
          The old "Materials" picker modal is gone entirely (patch 0347)
          -- materials were never a real choice (see pickRecipe's own
          comment) and had no on-canvas trigger left to open it once both
          consumable-like categories dropped their bottom boxes. */}
      {openSlot === 'bottomRight' && isConsumableLike && (
        <PickerModal
          title={`Choose a bonus (${chosenConsumableMods.length}/${modsToPick})`}
          options={consumableModOptions}
          onPick={toggleConsumableMod}
          onClose={() => setOpenSlot(null)}
          closeOnPick={modsToPick <= 1}
          selectedKeys={chosenConsumableMods}
        />
      )}
    </div>
  );
}
