import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from './useEngine';
import { CraftingManager } from '../game/managers/CraftingManager';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CRAFTING_RECIPES } from '../game/data/craftingRecipes';
import { MATERIAL_BY_ID } from '../game/data/materials';
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
 * One background scene per category, matching the vendor it belongs to
 * (Blacksmith/gear, Alchemist/consumable, Enchanter/enchant) -- committed
 * art, not the gitignored-licensed convention public/vendors/ uses, so no
 * "missing file" fallback needed here the way VendorSprite has to have one.
 */
const STATION_BG: Record<Category, string> = {
  gear: './lore/crafting/gear.jpg',
  consumable: './lore/crafting/consumable.jpg',
  enchant: './lore/crafting/enchant.jpg',
  // No commissioned art yet -- same "missing file just fails to paint"
  // convention every other banner/background in this game already uses.
  gem: './lore/crafting/gem.jpg',
  // Same room/canvas as `enchant` -- these are the Enchanter's own bench-
  // made charms (patch 0247), not a separate physical space, so they
  // reuse enchant.jpg rather than getting dedicated art of their own.
  charm: './lore/crafting/enchant.jpg',
};

const STATION_TITLE: Record<Category, string> = {
  gear: 'Crafting', consumable: 'Supplies', enchant: 'Enchanting', gem: 'Gems', charm: 'Charms',
};

/**
 * Which locked-aspect-ratio CSS class each category's scene uses (patch
 * 0242) -- gear/enchant/gem/charm still share .craft-scene's 1402:1122
 * canvas, but consumable moved to its own differently-shaped art
 * (Alchemist_Crafting_Box.png, 1277x1232) and needs its own class
 * (.consumable-scene, app.css) with a matching aspect-ratio, same
 * pattern .armor-infusion-scene/.hatchery-select-scene already use for
 * their own off-ratio art.
 */
const SCENE_CLASS: Record<Category, string> = {
  gear: 'craft-scene', consumable: 'consumable-scene', enchant: 'craft-scene', gem: 'craft-scene', charm: 'craft-scene',
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
  consumable: {
    // Hand-measured against Alchemist_Crafting_Box.png's own 1277x1232
    // canvas (patch 0242) -- replaced the old transparent-square art, so
    // these four numbers per slot moved too, same as any other art swap
    // here would require. See .consumable-scene in app.css for why this
    // category gets its own aspect-ratio lock instead of reusing
    // .craft-scene's shared 1402:1122 one.
    top: { left: 40.80, top: 24.68, width: 15.51, height: 19.00 },
    bottomLeft: { left: 30.00, top: 46.51, width: 18.01, height: 18.34 },
    bottomRight: { left: 51.92, top: 46.51, width: 18.01, height: 18.34 },
  },
  enchant: {
    top: { left: 42.3, top: 24.5, width: 16.8, height: 21.8 },
    bottomLeft: { left: 31.8, top: 52.0, width: 16.4, height: 21.8 },
    bottomRight: { left: 51.2, top: 52.0, width: 16.8, height: 21.8 },
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
  // Same canvas as `enchant` (enchant.jpg), so the same rects apply --
  // see STATION_BG's own comment on why `charm` shares that art.
  charm: {
    top: { left: 42.3, top: 24.5, width: 16.8, height: 21.8 },
    bottomLeft: { left: 31.8, top: 52.0, width: 16.4, height: 21.8 },
    bottomRight: { left: 51.2, top: 52.0, width: 16.8, height: 21.8 },
  },
};

/** A single option row inside a slot's picker popup. */
export interface PickerOption {
  key: string;
  label: string;
  sublabel?: string;
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
 */
export function PickerModal({
  title, options, onPick, onClose, closeOnPick = true, selectedKeys,
}: {
  title: string; options: PickerOption[]; onPick: (key: string) => void; onClose: () => void;
  closeOnPick?: boolean; selectedKeys?: string[];
}) {
  const hasSublabels = options.some((o) => o.sublabel);
  const pick = (opt: PickerOption) => {
    if (opt.disabled) return;
    onPick(opt.key);
    if (closeOnPick) onClose();
  };
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">{title}</span>
          <button className={closeOnPick ? '' : 'btn-primary'} onClick={onClose}>
            {closeOnPick ? 'Close' : 'Done'}
          </button>
        </div>
        {options.length === 0 && <p className="small muted">Nothing available yet.</p>}
        {options.length > 0 && (
          <div className="craft-picker-list">
            <table className="craft-picker-table">
              <thead>
                <tr>
                  <th aria-hidden="true" className="craft-picker-th-icon" />
                  <th>Name</th>
                  {hasSublabels && <th>Details</th>}
                  <th aria-hidden="true" className="craft-picker-th-check" />
                </tr>
              </thead>
              <tbody>
                {options.map((opt) => {
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
                      {hasSublabels && <td className="tiny muted craft-picker-td-detail">{opt.sublabel}</td>}
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
        <div className="tiny muted">{describeMods(item.customMods ?? def.mods).join(' · ') || 'No bonuses'}</div>
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
          {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
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

export function CraftingStation({ category, onClose }: { category: Category; onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const rects = SLOT_RECTS[category];

  const recipes = CRAFTING_RECIPES.filter((r) => r.category === category);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const recipe = recipeId ? CRAFTING_RECIPES.find((r) => r.id === recipeId) ?? null : null;

  // gear -- two independent fixed slots rather than a growing array, so
  // "set bottom-left" and "set bottom-right" can never collide or leave a
  // hole the way indexing into a shared array would.
  const [modSlot0, setModSlot0] = useState<keyof Modifiers | null>(null);
  const [modSlot1, setModSlot1] = useState<keyof Modifiers | null>(null);
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
  }

  const afford = recipe ? CraftingManager.affordability(state, recipe) : null;
  const materialIds = recipe ? (Object.keys(recipe.materialCost) as MaterialId[]) : [];

  const modsToPick = recipe?.modsToPick ?? 0;
  const statsToPick = recipe?.statsToPick ?? 0;
  const chosenMods = [modSlot0, modSlot1].filter((m): m is keyof Modifiers => m !== null);

  // `charm` (patch 0247) is a separate category purely so these recipes
  // route to the Enchanter's own Charms button instead of the Alchemist's
  // Supplies one -- every actual behaviour (materials/bonus bottom slots,
  // resultConsumableId, craftConsumable) is identical to `consumable`, so
  // every place that used to check `category === 'consumable'` checks
  // this instead, rather than repeating the `|| category === 'charm'`
  // four separate times.
  const isConsumableLike = category === 'consumable' || category === 'charm';

  const canCraft = !!recipe && !!afford?.ok
    && (category !== 'gear' || chosenMods.length === modsToPick)
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
    if (category === 'gear') { engine.craftGear(recipe.id, chosenMods); reset(); }
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
    : recipes.map((r) => ({
      key: r.id, label: r.name, sublabel: r.description,
      icon: <RecipeIcon icon={r.icon} category={category} size={40} />,
    }));

  // Enchant's top slot picks an existing item (unlike every other
  // category's top slot, which picks a recipe) -- routed through a preview
  // step before it actually lands in targetUid, same reasoning as
  // EnhanceStation's own previewUid. A recipe pick has no such step: its
  // own label/sublabel in the picker row already is the description, there
  // isn't a separate "item" to look over first.
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;

  function handleTopPick(key: string) {
    if (category === 'enchant') setPreviewUid(key);
    else pickRecipe(key);
  }

  /* ---------------------------- gear mod slots ---------------------------- */
  function gearModSlot(index: 0 | 1) {
    const picked = index === 0 ? modSlot0 : modSlot1;
    const otherPicked = index === 0 ? modSlot1 : modSlot0;
    const setPicked = index === 0 ? setModSlot0 : setModSlot1;
    const options: PickerOption[] = (recipe?.modOptions ?? [])
      .filter((m) => m !== otherPicked)
      .map((m) => ({ key: m, label: `+${recipe?.modValue ?? 0}% ${MOD_LABEL[m]}` }));
    return {
      filled: picked ? <span className="craft-slot-label">+{recipe?.modValue}% {MOD_LABEL[picked]}</span> : null,
      options,
      disabled: !recipe,
      onPick: (key: string) => setPicked(key as keyof Modifiers),
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

  /* ------------------------- consumable: materials slot (combined) -------- */
  const materialsOptions: PickerOption[] = materialIds.map((id) => {
    const material = MATERIAL_BY_ID[id];
    const need = recipe?.materialCost[id] ?? 0;
    const have = state.materials[id] ?? 0;
    return {
      key: id,
      label: `${material.name} x${need}`,
      sublabel: have >= need ? `Have ${have}` : `Need ${need}, have ${have}`,
      disabled: have < need,
    };
  });
  const allMaterialsConfirmed = materialIds.length > 0 && materialIds.every((id) => confirmedMaterials.has(id));
  // Used to show each material's own glyph here (ore/herbs/fish etc.) --
  // pulled per direct request (patch 0247): these two bottom boxes are a
  // planned removal from this screen entirely, so showing resource icons
  // in a slot that's going away wasn't worth keeping around in the
  // meantime. A plain checkmark instead -- still confirms materials are
  // set without naming which ones, the have/need row above the Craft
  // button already answers that in full anyway.
  const materialsFilled = allMaterialsConfirmed
    ? <span className="craft-slot-label" aria-hidden="true">✓</span>
    : null;

  /* ------------------------- consumable: bonus slot ------------------------ */
  const consumableModOptions: PickerOption[] = (recipe?.modOptions ?? []).map((m) => ({
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

  const consumableModFilled = chosenConsumableMods.length === 0 ? null : (
    <span className="craft-slot-label">
      {chosenConsumableMods.map((m) => `+${recipe?.modValue}% ${MOD_LABEL[m]}`).join(', ')}
    </span>
  );

  const scene = (
    <div className={SCENE_CLASS[category]} style={{ backgroundImage: `url(${STATION_BG[category]})` }}>
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

      {isConsumableLike && (
        <>
          {/* Auto-confirmed the instant a recipe is picked (see pickRecipe's
              own comment) -- no longer a required click. Still openable to
              confirm materials are met, though the slot itself no longer
              shows what they are -- see materialsFilled's own comment on
              why the resource glyphs were pulled (patch 0247), same
              reasoning gearModSlot's own filled preview stays clickable
              after it's set. */}
          <SlotBox
            rect={rects.bottomLeft}
            filled={materialsFilled}
            disabled={!recipe}
            label="Materials"
            onOpen={() => setOpenSlot('bottomLeft')}
          />
          {modsToPick > 0 && (
            <SlotBox
              rect={rects.bottomRight}
              filled={consumableModFilled}
              disabled={!recipe}
              label="Choose a bonus"
              onOpen={() => setOpenSlot('bottomRight')}
            />
          )}
        </>
      )}
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

      {openSlot === 'bottomLeft' && isConsumableLike && (
        <PickerModal
          title="Materials"
          options={materialsOptions}
          onPick={(key) => setConfirmedMaterials((prev) => new Set(prev).add(key as MaterialId))}
          onClose={() => setOpenSlot(null)}
          closeOnPick={materialIds.length <= 1}
          selectedKeys={[...confirmedMaterials]}
        />
      )}
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
