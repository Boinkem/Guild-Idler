import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from './useEngine';
import { CraftingManager } from '../game/managers/CraftingManager';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CRAFTING_RECIPES } from '../game/data/craftingRecipes';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { CraftingRecipeDef, MaterialId, Modifiers, Stats } from '../game/types';
import { formatGold, MOD_LABEL, STAT_LABEL } from '../game/util';
import { RecipeIcon, ItemIcon } from './icons';

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
};

const STATION_TITLE: Record<Category, string> = {
  gear: 'Crafting', consumable: 'Supplies', enchant: 'Enchanting',
};

interface Rect { left: number; top: number; width: number; height: number; }

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
};

/** A single option row inside a slot's picker popup. */
interface PickerOption {
  key: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** One clickable frame on the scene -- shows what's picked, or a plain
 *  "+" prompt when empty, and opens `onOpen` (a PickerModal) on click. */
function SlotBox({
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
function PickerModal({
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
                {opt.icon}
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <div>{opt.label}</div>
                  {opt.sublabel && <div className="tiny muted">{opt.sublabel}</div>}
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
  // clicked-through/confirmed. Every current recipe has exactly one valid
  // material per slot, so this is a "reveal, then confirm" tap rather than
  // a real choice yet -- built to already support a recipe with real
  // alternatives later without another UI pass.
  const [confirmedMaterials, setConfirmedMaterials] = useState<Set<MaterialId>>(new Set());

  const [openSlot, setOpenSlot] = useState<'top' | 'bottomLeft' | 'bottomRight' | null>(null);

  function pickRecipe(id: string) {
    setRecipeId(id);
    setModSlot0(null);
    setModSlot1(null);
    setChosenStats([]);
    setConfirmedMaterials(new Set());
  }

  function reset() {
    setRecipeId(null);
    setModSlot0(null);
    setModSlot1(null);
    setTargetUid('');
    setChosenStats([]);
    setConfirmedMaterials(new Set());
  }

  const afford = recipe ? CraftingManager.affordability(state, recipe) : null;
  const materialIds = recipe ? (Object.keys(recipe.materialCost) as MaterialId[]) : [];

  const modsToPick = recipe?.modsToPick ?? 0;
  const statsToPick = recipe?.statsToPick ?? 0;
  const chosenMods = [modSlot0, modSlot1].filter((m): m is keyof Modifiers => m !== null);

  const canCraft = !!recipe && !!afford?.ok
    && (category !== 'gear' || chosenMods.length === modsToPick)
    && (category !== 'enchant' || (chosenStats.length === statsToPick && targetUid !== ''))
    && (category !== 'consumable' || materialIds.every((id) => confirmedMaterials.has(id)));

  function handleCraft() {
    if (!recipe) return;
    if (category === 'gear') engine.craftGear(recipe.id, chosenMods);
    else if (category === 'enchant') engine.enchantItem(recipe.id, targetUid, chosenStats);
    else engine.craftConsumable(recipe.id);
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
        icon: <ItemIcon slot={def.slot} icon={def.icon} size={64} />,
      };
    }).filter((o): o is PickerOption => o !== null)
    : recipes.map((r) => ({
      key: r.id, label: r.name, sublabel: r.description,
      icon: <RecipeIcon icon={r.icon} category={category} size={64} />,
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

  /* ------------------------- consumable material slots -------------------- */
  function materialSlot(index: 0 | 1) {
    const id = materialIds[index];
    if (!id) return null;
    const material = MATERIAL_BY_ID[id];
    const need = recipe?.materialCost[id] ?? 0;
    const have = state.materials[id] ?? 0;
    const confirmed = confirmedMaterials.has(id);
    return {
      id, material, need, have, confirmed,
      options: [{
        key: id,
        label: `${material.name} x${need}`,
        sublabel: have >= need ? `Have ${have}` : `Need ${need}, have ${have}`,
        disabled: have < need,
      }],
    };
  }

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
          {[0, 1].map((i) => {
            const slot = materialSlot(i as 0 | 1);
            if (!slot) return null;
            return (
              <SlotBox
                key={slot.id}
                rect={i === 0 ? rects.bottomLeft : rects.bottomRight}
                filled={slot.confirmed
                  ? <span className="craft-slot-label">{slot.material.glyph} {slot.material.name}</span>
                  : null}
                disabled={!recipe}
                label={`Select ${slot.material.name}`}
                onOpen={() => setOpenSlot(i === 0 ? 'bottomLeft' : 'bottomRight')}
              />
            );
          })}
        </>
      )}
    </div>
  );

  const materialCostLine = recipe
    ? `${Object.entries(recipe.materialCost).map(([id, amt]) => `${amt} ${MATERIAL_BY_ID[id as MaterialId].name}`).join(' + ')} + ${formatGold(recipe.goldCost)} gold`
    : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">{STATION_TITLE[category]}</span>
          <button onClick={onClose}>Close</button>
        </div>

        {scene}

        {recipe && (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {recipe.name} &mdash; {materialCostLine}
          </p>
        )}
        {!recipe && (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {category === 'enchant' ? 'Choose an item, then what to apply to it.' : 'Choose a recipe to begin.'}
          </p>
        )}

        <button className="btn-primary" disabled={!canCraft} onClick={handleCraft}>
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
          options={recipes.map((r) => ({ key: r.id, label: r.name, sublabel: r.description, icon: <RecipeIcon icon={r.icon} category={category} size={64} /> }))}
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

      {(openSlot === 'bottomLeft' || openSlot === 'bottomRight') && category === 'consumable' && (() => {
        const index = openSlot === 'bottomLeft' ? 0 : 1;
        const slot = materialSlot(index);
        if (!slot) return null;
        return (
          <PickerModal
            title={`Select ${slot.material.name}`}
            options={slot.options}
            onPick={(key) => setConfirmedMaterials((prev) => new Set(prev).add(key as MaterialId))}
            onClose={() => setOpenSlot(null)}
          />
        );
      })()}
    </div>
  );
}
