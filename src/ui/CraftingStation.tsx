import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from './useEngine';
import { CraftingManager } from '../game/managers/CraftingManager';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CRAFTING_RECIPES } from '../game/data/craftingRecipes';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { CraftingRecipeDef, MaterialId, Modifiers, Stats } from '../game/types';
import { formatGold, MOD_LABEL, STAT_LABEL } from '../game/util';
import { RecipeIcon, ItemIcon, MaterialIcon } from './icons';

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
};

const STATION_TITLE: Record<Category, string> = {
  gear: 'Crafting', consumable: 'Supplies', enchant: 'Enchanting', gem: 'Gems',
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
    top: { left: 41.4, top: 18.5, width: 16.5, height: 21.0 },
    bottomLeft: { left: 26.5, top: 52.0, width: 16.0, height: 20.3 },
    bottomRight: { left: 57.1, top: 52.0, width: 16.0, height: 20.3 },
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
  // way. Reuses consumable's top rect pending real commissioned art.
  gem: {
    top: { left: 41.4, top: 18.5, width: 16.5, height: 21.0 },
    bottomLeft: { left: 26.5, top: 52.0, width: 16.0, height: 20.3 },
    bottomRight: { left: 57.1, top: 52.0, width: 16.0, height: 20.3 },
  },
};

/** A single option row inside a slot's picker popup. */
export interface PickerOption {
  key: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
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
export function PickerModal({
  title, options, onPick, onClose, closeOnPick = true, selectedKeys,
}: {
  title: string; options: PickerOption[]; onPick: (key: string) => void; onClose: () => void;
  closeOnPick?: boolean; selectedKeys?: string[];
}) {
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">{title}</span>
          <button className={closeOnPick ? '' : 'btn-primary'} onClick={onClose}>
            {closeOnPick ? 'Close' : 'Done'}
          </button>
        </div>
        {options.length === 0 && <p className="small muted">Nothing available yet.</p>}
        <div className="craft-picker-list">
          {options.map((opt) => {
            const selected = selectedKeys?.includes(opt.key) ?? false;
            return (
              <button
                key={opt.key}
                type="button"
                className={`craft-picker-row ${selected ? 'selected' : ''}`}
                disabled={opt.disabled}
                onClick={() => { if (!opt.disabled) { onPick(opt.key); if (closeOnPick) onClose(); } }}
              >
                {/*
                 * .craft-picker-row is a 3-column CSS grid (40px icon /
                 * 1fr text / auto checkmark) -- when opt.icon is omitted,
                 * React renders nothing at all for that slot, so CSS
                 * Grid auto-places the remaining children starting from
                 * column 1, shoving the text span into the 40px icon
                 * column instead of the 1fr text column. The result was
                 * severe truncation on any picker whose options don't
                 * carry an icon (confirmed directly: Armour Infusion's
                 * gem picker, which only had glyphs embedded in the
                 * label string, showed "Fire" as "F…" and "Lightning"
                 * as "L…", while every icon-bearing picker on the same
                 * screen rendered fine). A stable empty placeholder here
                 * keeps exactly 3 grid children at all times regardless
                 * of what an individual caller passes.
                 */}
                {opt.icon ?? <span aria-hidden="true" />}
                <span style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                  {opt.sublabel && <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sublabel}</div>}
                </span>
                {selected && <span aria-hidden="true" className="craft-picker-check">✓</span>}
              </button>
            );
          })}
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
    setConfirmedMaterials(new Set());
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
  }

  const afford = recipe ? CraftingManager.affordability(state, recipe) : null;
  const materialIds = recipe ? (Object.keys(recipe.materialCost) as MaterialId[]) : [];

  const modsToPick = recipe?.modsToPick ?? 0;
  const statsToPick = recipe?.statsToPick ?? 0;
  const chosenMods = [modSlot0, modSlot1].filter((m): m is keyof Modifiers => m !== null);

  const canCraft = !!recipe && !!afford?.ok
    && (category !== 'gear' || chosenMods.length === modsToPick)
    && (category !== 'enchant' || (chosenStats.length === statsToPick && targetUid !== ''))
    && (category !== 'consumable' || (materialIds.every((id) => confirmedMaterials.has(id)) && chosenConsumableMods.length === modsToPick));

  function handleCraft() {
    if (!recipe) return;
    if (category === 'gear') engine.craftGear(recipe.id, chosenMods);
    else if (category === 'enchant') engine.enchantItem(recipe.id, targetUid, chosenStats);
    else if (category === 'gem') engine.craftGem(recipe.id);
    else engine.craftConsumable(recipe.id, chosenConsumableMods);
    reset();
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
        key: item.uid, label: def.name, sublabel: owner ?? 'Stash',
        icon: <ItemIcon slot={def.slot} icon={def.icon} size={40} />,
      };
    }).filter((o): o is PickerOption => o !== null)
    : recipes.map((r) => ({
      key: r.id, label: r.name, sublabel: r.description,
      icon: <RecipeIcon icon={r.icon} category={category} size={40} />,
    }));

  function handleTopPick(key: string) {
    if (category === 'enchant') setTargetUid(key);
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
    label: `+${recipe?.statValue ?? 0} ${STAT_LABEL[s]}`,
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
    <span className="craft-slot-label">
      {chosenStats.map((s) => `+${recipe?.statValue} ${STAT_LABEL[s]}`).join(', ')}
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
  const materialsFilled = allMaterialsConfirmed
    ? <span className="craft-slot-label">{materialIds.map((id) => MATERIAL_BY_ID[id].glyph).join(' ')}</span>
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
    <div className="craft-scene" style={{ backgroundImage: `url(${STATION_BG[category]})` }}>
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

      {category === 'consumable' && (
        <>
          <SlotBox
            rect={rects.bottomLeft}
            filled={materialsFilled}
            disabled={!recipe}
            label="Confirm materials"
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
          <button onClick={onClose}>Close</button>
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
              <span className={`tiny ${state.gold < recipe.goldCost ? 'bad' : 'good'}`}>
                ◆ {formatGold(state.gold)}/{formatGold(recipe.goldCost)}
              </span>
            </div>
          </div>
        )}
        {!recipe && (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {category === 'enchant' ? 'Choose an item, then what to apply to it.' : 'Choose a recipe to begin.'}
          </p>
        )}

        <button className="btn-purple" disabled={!canCraft} onClick={handleCraft}>
          {afford && !afford.ok ? afford.reason : (category === 'enchant' ? 'Enchant' : 'Craft')}
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

      {openSlot === 'bottomLeft' && category === 'consumable' && (
        <PickerModal
          title="Confirm materials"
          options={materialsOptions}
          onPick={(key) => setConfirmedMaterials((prev) => new Set(prev).add(key as MaterialId))}
          onClose={() => setOpenSlot(null)}
          closeOnPick={materialIds.length <= 1}
          selectedKeys={[...confirmedMaterials]}
        />
      )}
      {openSlot === 'bottomRight' && category === 'consumable' && (
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
