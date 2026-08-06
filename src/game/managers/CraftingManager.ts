import { CraftingRecipeDef, GameState, MaterialId, Modifiers } from '../types';
import { CRAFTING_RECIPE_BY_ID } from '../data/craftingRecipes';
import { EquipmentManager } from './EquipmentManager';
import { InventoryManager } from './InventoryManager';
import { MATERIAL_BY_ID } from '../data/materials';

export const CraftingManager = {
  /** What's still missing to afford a recipe, if anything -- used to grey out the Craft button. */
  affordability(state: GameState, recipe: CraftingRecipeDef): { ok: boolean; reason?: string } {
    if (state.gold < recipe.goldCost) return { ok: false, reason: 'Not enough gold.' };
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      if (state.materials[materialId] < amount) {
        return { ok: false, reason: `Not enough ${MATERIAL_BY_ID[materialId].name.toLowerCase()}.` };
      }
    }
    return { ok: true };
  },

  /**
   * Crafts a `gear` recipe, applying `chosenMods` (must be exactly
   * recipe.modsToPick entries, each one of recipe.modOptions) as the
   * result item's customMods at recipe.modValue each. Returns an error
   * string, or null on success.
   */
  craftGear(state: GameState, recipeId: string, chosenMods: (keyof Modifiers)[]): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'gear' || !recipe.resultDefId) return 'Unknown recipe.';
    const modsToPick = recipe.modsToPick ?? 0;
    const modOptions = recipe.modOptions ?? [];
    if (chosenMods.length !== modsToPick) return `Pick exactly ${modsToPick} bonuses.`;
    if (new Set(chosenMods).size !== chosenMods.length) return 'Each bonus can only be picked once.';
    if (chosenMods.some((m) => !modOptions.includes(m))) return 'One of those bonuses isn\u2019t available on this recipe.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';

    const item = EquipmentManager.instantiate(recipe.resultDefId);
    if (!item) return 'That item no longer exists.';
    item.customMods = Object.fromEntries(chosenMods.map((m) => [m, recipe.modValue ?? 0])) as Partial<Modifiers>;

    state.gold -= recipe.goldCost;
    state.stats.goldSpent += recipe.goldCost;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    state.stash.push(item);
    return null;
  },

  /** Crafts a `consumable` recipe -- no choices involved, just cost in for a fixed item out. */
  craftConsumable(state: GameState, recipeId: string): string | null {
    const recipe = CRAFTING_RECIPE_BY_ID[recipeId];
    if (!recipe || recipe.category !== 'consumable' || !recipe.resultConsumableId) return 'Unknown recipe.';
    const afford = CraftingManager.affordability(state, recipe);
    if (!afford.ok) return afford.reason ?? 'Cannot afford this.';

    state.gold -= recipe.goldCost;
    state.stats.goldSpent += recipe.goldCost;
    for (const [materialId, amount] of Object.entries(recipe.materialCost) as [MaterialId, number][]) {
      state.materials[materialId] -= amount;
    }
    InventoryManager.add(state, recipe.resultConsumableId, 1);
    return null;
  },
};
