import { CraftingRecipeDef, ElementType, EquipmentItem, GameState, GemTier, MaterialId, Modifiers, Stats } from '../types';
import { CRAFTING_RECIPE_BY_ID } from '../data/craftingRecipes';
import { CONSUMABLE_BY_ID } from '../data/items';
import { EquipmentManager } from './EquipmentManager';
import { InventoryManager } from './InventoryManager';
import { ModifierManager } from './ModifierManager';
import { MATERIAL_BY_ID } from '../data/materials';
import { MOD_LABEL } from '../util';
import { EQUIPMENT_BY_ID } from '../data/equipment';
import { isProceduralTemplate, rollProceduralItem } from '../data/proceduralLoot';
import { createRng } from '../rng';

export const CraftingManager = {
  /**
   * Gold cost of a recipe after the Enchanter's own Arcane Discount
   * vendor upgrade (enchantDiscount, guild-wide via ModifierManager.global)
   * -- applies to `gem` and `enchant` category recipes only (the two
   * categories Weapon Enchanting/Armour Infusion/enchantItem actually
   * spend gold on), everything else pays the recipe's own goldCost
   * unchanged. Floored at 0 same as every other cost in the game.
   */
  goldCost(state: GameState, recipe: CraftingRecipeDef): number {
    if (recipe.category !== 'gem' && recipe.category !== 'enchant') return recipe.goldCost;
    const discount = ModifierManager.global(state).enchantDiscount ?? 0;
    return Math.max(0, Math.round(recipe.goldCost * (1 - discount / 100)));
  },

  /** What's still missing to afford a recipe, if anything -- used to grey out the Craft button. */
  affordability(state: GameState, recipe: CraftingRecipeDef): { ok: boolean; reason?: string } {
    if (state.gold < CraftingManager.goldCost(state, recipe)) return { ok: false, reason: 'Not enough gold.' };
    if ((recipe.scrapCost ?? 0) > state.scrap) return { ok: false, reason: 'Not enough scrap.' };
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      if (state.materials[materialId] < amount) {
        return { ok: false, reason: `Not enough ${MATERIAL_BY_ID[materialId].name.toLowerCase()}.` };
      }
    }
    return { ok: true };
  },

  /**
   * The recipe id for a given kind/element/tier combo -- one small helper
   * rather than repeating this string template at every call site. Patch
   * 0237 added a tier suffix (`_<tier>`) to what used to be a flat
   * per-element id (`craft_elemental_gem_fire`) -- 5x more recipes than
   * before (one per element/tier combo, both kinds), same naming shape
   * just extended.
   */
  gemRecipeId(isWeapon: boolean, element: ElementType, tier: GemTier): string {
    return isWeapon ? `craft_elemental_gem_${element}_${tier}` : `craft_resistance_gem_${element}_${tier}`;
  },

  /**
   * Crafts a `gem` recipe -- no player choice at craft time (unlike gear/
   * enchant), a gem recipe is authored per element/kind/tier already (see
   * CraftingRecipeDef.resultGem), so this just checks affordability and
   * adds +1 to the right counter/tier bucket (GameState.gems or
   * resistGems).
   */
  craftGem(state: GameState, recipeId: string): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'gem' || !recipe.resultGem) return 'Unknown recipe.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';

    const { kind, element, tier } = recipe.resultGem;
    const pool = kind === 'elemental' ? state.gems : state.resistGems;
    pool[element] = { ...pool[element], [tier]: (pool[element]?.[tier] ?? 0) + 1 };

    const goldCost = CraftingManager.goldCost(state, recipe);
    state.gold -= goldCost;
    state.stats.goldSpent += goldCost;
    state.scrap -= recipe.scrapCost ?? 0;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    return null;
  },

  /**
   * What it costs to infuse a given item with a given element AT a given
   * tier -- 0/0 and `ready: true` if a matching gem of that exact tier is
   * already sitting in inventory from an earlier craft (state.gems/
   * resistGems, whichever the item's own slot points at), otherwise the
   * underlying gem recipe's own scrapCost/goldCost (Arcane-Discounted,
   * via CraftingManager.goldCost), since craftAndInfuse below will need
   * to craft one fresh before it can apply it. Used by both Weapon
   * Enchanting and Armour Infusion to label each element/tier option
   * ("Ready" vs a cost) -- a "Ready" at one tier says nothing about
   * whether another tier is also ready, by design, since each tier is
   * its own separate gem.
   */
  gemCost(state: GameState, isWeapon: boolean, element: ElementType, tier: GemTier): { ready: boolean; scrapCost: number; goldCost: number } {
    const pool = isWeapon ? state.gems : state.resistGems;
    if ((pool[element]?.[tier] ?? 0) >= 1) return { ready: true, scrapCost: 0, goldCost: 0 };
    const recipe = CRAFTING_RECIPE_BY_ID[CraftingManager.gemRecipeId(isWeapon, element, tier)];
    return { ready: false, scrapCost: recipe?.scrapCost ?? 0, goldCost: recipe ? CraftingManager.goldCost(state, recipe) : 0 };
  },

  /**
   * Weapon Enchanting and Armour Infusion both collapsed from a two-step
   * "craft a gem, then separately spend it" flow into this single action
   * -- select gear, select an element AND a tier, Infuse, done. Uses an
   * already-owned gem of that exact tier if one exists (state.gems/
   * resistGems, per the item's own slot -- see EquipmentManager.infuse's
   * own comment for why there's no separate "kind" choice), otherwise
   * crafts one fresh via the underlying recipe first. Which pool/recipe
   * applies is decided entirely by the item's own slot (weapon vs
   * everything else), same as before patch 0237 -- tier is now a third
   * axis alongside that, not a replacement for it.
   */
  craftAndInfuse(state: GameState, itemUid: string, element: ElementType, tier: GemTier): string | null {
    const found = EquipmentManager.allItems(state).find((e) => e.item.uid === itemUid);
    if (!found) return 'That item can\u2019t be found.';
    const def = EquipmentManager.def(found.item);
    if (!def) return 'That item no longer exists.';
    const isWeapon = def.slot === 'weapon';
    const pool = isWeapon ? state.gems : state.resistGems;
    if ((pool[element]?.[tier] ?? 0) < 1) {
      const craftErr = CraftingManager.craftGem(state, CraftingManager.gemRecipeId(isWeapon, element, tier));
      if (craftErr) return craftErr;
    }
    return EquipmentManager.infuse(state, itemUid, element, tier);
  },

  /**
   * Crafts a `gear` recipe, applying `chosenStats` (must be exactly
   * recipe.modsToPick entries, each one of recipe.modOptions) as the
   * result item's rolledStats at recipe.modValue each. Returns an error
   * string, or null on success.
   *
   * `modOptions`/`modValue` used to be Modifiers keys/a flat % (pre-0255
   * data: e.g. Guildmade picked 2 of ['success','gold','xp','loot'] at
   * +6% each). Patch 0255 (all-stats rework, see guild-idler-status.md)
   * remapped every gear recipe's `modOptions` to Stats keys the same way
   * procedural loot's own pool was remapped -- `success`->`strength`,
   * `gold`/`loot`->`luck` (collapsed to one option; Loot is a Luck
   * output now, see HeroManager.statMods, so there's no longer a
   * separate pick for it), `xp`->`wisdom`, `injuryResist`/`speed`-
   * >`endurance` (also collapsed -- Endurance grants both outputs
   * together automatically now, not by separate picks). `modValue` was
   * recalibrated as a raw stat-point budget rather than left at its old
   * %-flavored number -- same first-pass/needs-playtest caveat as
   * `loot_procedural.budgetRarityMultiplier`.
   */
  craftGear(state: GameState, recipeId: string, chosenStats: (keyof Stats)[]): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'gear' || !recipe.resultDefId) return 'Unknown recipe.';
    const modsToPick = recipe.modsToPick ?? 0;
    const modOptions = recipe.modOptions ?? [];
    if (chosenStats.length !== modsToPick) return `Pick exactly ${modsToPick} bonuses.`;
    if (new Set(chosenStats).size !== chosenStats.length) return 'Each bonus can only be picked once.';
    if (chosenStats.some((m) => !modOptions.includes(m))) return 'One of those bonuses isn\u2019t available on this recipe.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';
    if (state.stash.length >= ModifierManager.stashCapacity(state)) return 'The stash is full.';

    const item = EquipmentManager.instantiate(recipe.resultDefId);
    if (!item) return 'That item no longer exists.';
    item.rolledStats = Object.fromEntries(chosenStats.map((m) => [m, recipe.modValue ?? 0])) as Partial<Stats>;

    state.gold -= recipe.goldCost;
    state.stats.goldSpent += recipe.goldCost;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    state.stash.push(item);
    return null;
  },

  /**
   * Crafts a `consumable` recipe. With no chosen mods (the common case --
   * Trail Rations, Herbal Tonic), this is unchanged from before: cost in,
   * a stack of the recipe's own `resultConsumableId` out.
   *
   * With `chosenMods` (must be exactly recipe.modsToPick entries, each one
   * of recipe.modOptions -- same validation shape as craftGear), the
   * output is a distinct crafted *variant* instead: a synthetic id derived
   * from the base consumable + the exact mod combo, so re-crafting the
   * same combo stacks onto the same registered entry rather than spawning
   * duplicates every time. The variant is registered once, in
   * `state.customConsumables`, cloning the base def's icon/glyph/other
   * effects and adding the chosen mod bonus on top -- see
   * InventoryManager.resolveDef, which is what makes a crafted variant
   * behave identically to a shop consumable everywhere one might be used
   * (equipped, applied standalone, or spent on a quest).
   *
   * `speed` is deliberately not a valid mod option here even though it's
   * a real Modifiers key -- QuestManager.previewDuration doesn't consult
   * the consumable loadout at all (a pre-existing gap, not introduced by
   * this), so a "speed" consumable bonus would silently do nothing. Don't
   * add it to a recipe's modOptions until that's actually wired up.
   */
  craftConsumable(state: GameState, recipeId: string, chosenMods: (keyof Modifiers)[] = []): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'consumable' || !recipe.resultConsumableId) return 'Unknown recipe.';
    const modsToPick = recipe.modsToPick ?? 0;
    const modOptions = recipe.modOptions ?? [];
    if (chosenMods.length !== modsToPick) return `Pick exactly ${modsToPick} bonus${modsToPick === 1 ? '' : 'es'}.`;
    if (new Set(chosenMods).size !== chosenMods.length) return 'Each bonus can only be picked once.';
    if (chosenMods.some((m) => !modOptions.includes(m))) return 'One of those bonuses isn\u2019t available on this recipe.';
    const baseDef = CONSUMABLE_BY_ID[recipe.resultConsumableId];
    if (!baseDef) return 'That item no longer exists.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';

    let resultId = recipe.resultConsumableId;
    if (chosenMods.length > 0) {
      const sorted = [...chosenMods].sort();
      resultId = `${recipe.resultConsumableId}::${sorted.join(',')}`;
      if (!state.customConsumables[resultId]) {
        const bonusLabel = sorted.map((m) => `+${recipe.modValue}% ${MOD_LABEL[m]}`).join(', ');
        state.customConsumables[resultId] = {
          ...baseDef,
          id: resultId,
          name: `${baseDef.name} (${bonusLabel})`,
          effect: {
            ...baseDef.effect,
            ...Object.fromEntries(sorted.map((m) => [m, (baseDef.effect[m] ?? 0) + (recipe.modValue ?? 0)])),
          },
        };
      }
    }

    state.gold -= recipe.goldCost;
    state.stats.goldSpent += recipe.goldCost;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    InventoryManager.add(state, resultId, 1);
    return null;
  },

  /**
   * Enchants an item the player already owns (stash or equipped, same
   * search scope as EquipmentManager.repair uses) with `chosenStats`,
   * additive with anything it's already been enchanted with -- see
   * EquipmentItem.enchantStats's own comment for why this adds rather
   * than replaces, unlike a gear recipe's customMods.
   */
  enchantItem(state: GameState, recipeId: string, itemUid: string, chosenStats: (keyof Stats)[]): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'enchant') return 'Unknown recipe.';
    const statsToPick = recipe.statsToPick ?? 0;
    const statOptions = recipe.statOptions ?? [];
    if (chosenStats.length !== statsToPick) return `Pick exactly ${statsToPick} stat${statsToPick === 1 ? '' : 's'}.`;
    if (new Set(chosenStats).size !== chosenStats.length) return 'Each stat can only be picked once.';
    if (chosenStats.some((s) => !statOptions.includes(s))) return 'One of those stats isn\u2019t available on this recipe.';
    const found = EquipmentManager.allItems(state).find((e) => e.item.uid === itemUid);
    if (!found) return 'That item can\u2019t be found.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';

    const item = found.item;
    const updated: Partial<Stats> = { ...item.enchantStats };
    for (const s of chosenStats) updated[s] = (updated[s] ?? 0) + (recipe.statValue ?? 0);
    item.enchantStats = updated;

    const goldCost = CraftingManager.goldCost(state, recipe);
    state.gold -= goldCost;
    state.stats.goldSpent += goldCost;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    return null;
  },

  /**
   * Enchanter reroll (patch 0215) -- rerolls a procedurally-generated
   * item's `customMods` using its *current* `rolledItemLevel` (post any
   * Blacksmith re-leveling, see EquipmentManager.relevel) as the budget
   * basis, so re-level-then-reroll is the correct min-max order.
   *
   * Touches `rolledStats` only, never `enchantStats` -- `enchantStats` is
   * the pre-existing, additive Armour Infusion/Enchanting system above
   * (enchantItem), which ADDS its recipe stats onto whatever an item
   * already has. A reroll that touched `enchantStats` would silently
   * destroy any Enchant investment the player separately paid gold/
   * materials for, with no way to tell "which part was the original
   * procedural roll" apart from "which part was a later, legitimate
   * purchase" once they're merged into one field. Patch 0255 (all-stats
   * rework, see guild-idler-status.md) gave a procedural roll's stat
   * power its own field, `rolledStats`, specifically so reroll could
   * safely overwrite the WHOLE item -- before that patch this could only
   * safely touch the (now-retired) `customMods` half, a known limitation
   * called out here at the time.
   *
   * Not routed through the Tuning-driven crafting-recipe system the way
   * every other CraftingManager action is -- this isn't picking from a
   * fixed pool of authored recipes, it's re-running the same generator
   * that made the item in the first place, so its own cost formula lives
   * here instead.
   */
  rerollCost(state: GameState, item: EquipmentItem): { gold: number; herbs: number } | null {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def || !isProceduralTemplate(def)) return null;
    const goldRaw = def.value * 1.2;
    const discount = ModifierManager.global(state).enchantDiscount ?? 0;
    return { gold: Math.max(0, Math.round(goldRaw * (1 - discount / 100))), herbs: 20 };
  },

  reroll(state: GameState, item: EquipmentItem, heroLevel: number): string | null {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 'Unknown item.';
    if (!isProceduralTemplate(def)) return 'This item\u2019s power is fixed -- nothing to reroll.';
    const goldRaw = def.value * 1.2;
    const discount = ModifierManager.global(state).enchantDiscount ?? 0;
    const goldCost = Math.max(0, Math.round(goldRaw * (1 - discount / 100)));
    const herbsCost = 20;
    if (state.gold < goldCost) return 'Not enough gold for the reroll.';
    if ((state.materials.herbs ?? 0) < herbsCost) return 'Not enough herbs for the reroll.';

    const itemLevel = item.rolledItemLevel ?? Math.min(def.reqLevel, heroLevel);
    const rng = createRng(`reroll:${item.uid}:${Date.now()}`);
    const result = rollProceduralItem(def.rarity, itemLevel, 'normal', def.name, rng);
    item.rolledStats = result.stats;
    // Reroll deliberately doesn't touch the bonus-roll tier or the
    // bracketed source tag baked into proceduralName at drop time --
    // those describe where the item came from, not its current power,
    // and shouldn't change just because the stats were rerolled.

    state.gold -= goldCost;
    state.stats.goldSpent += goldCost;
    state.materials.herbs -= herbsCost;
    return null;
  },
};
