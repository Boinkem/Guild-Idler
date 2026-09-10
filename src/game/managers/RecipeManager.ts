import { RECIPE_SCROLLS, RECIPE_SCROLL_BY_ID, scrollSellValue } from '../data/recipeScrolls';
import { RecipeScrollDef, GameState } from '../types';
import { Rng } from '../rng';
import { ModifierManager } from './ModifierManager';

/**
 * Patch 0357 -- WoW-style recipe drop/learn system, direct request.
 * Same "own bucket, own manager, same shape as an existing sibling"
 * precedent CurioManager already set for `state.curios`: `owned`/`add`/
 * `sellAll`/`sellEverything` below all mirror CurioManager's own
 * methods almost 1:1, since a not-yet-learned scroll behaves exactly
 * like a curio (a flat count per def, sellable, no other use) right up
 * until the one new action a curio never had: `learn`.
 */
export const RecipeManager = {
  count(state: GameState, scrollId: string): number {
    return state.recipeScrolls[scrollId] ?? 0;
  },

  add(state: GameState, scrollId: string, amount = 1): void {
    state.recipeScrolls[scrollId] = (state.recipeScrolls[scrollId] ?? 0) + amount;
  },

  /** Everything currently owned with stock > 0, resolved against
   *  RECIPE_SCROLL_BY_ID -- a scroll id that no longer matches any def
   *  (content removed/renamed after some were already granted) is
   *  silently skipped rather than crashing the Inventory tab, same
   *  "degrade gracefully" precedent CurioManager.owned already uses. */
  owned(state: GameState): { def: RecipeScrollDef; count: number }[] {
    return Object.entries(state.recipeScrolls)
      .map(([id, count]) => ({ def: RECIPE_SCROLL_BY_ID[id], count }))
      .filter((entry): entry is { def: RecipeScrollDef; count: number } => !!entry.def && entry.count > 0);
  },

  isKnown(state: GameState, recipeId: string): boolean {
    return state.unlockedRecipes.includes(recipeId);
  },

  /**
   * Consumes one scroll and permanently unlocks its recipe. A no-op
   * (returns an error string, changes nothing) if there's no unused
   * copy to spend or the recipe's somehow already known -- the latter
   * shouldn't be reachable from the Inventory UI (a known recipe's own
   * scroll stops being offered as a "Learn" action there), but this
   * stays a hard guard rather than trusting the caller, same defensive
   * shape every other consume-and-grant action in this codebase uses.
   */
  learn(state: GameState, scrollId: string): string | null {
    const def = RECIPE_SCROLL_BY_ID[scrollId];
    if (!def) return 'Unknown recipe.';
    if (RecipeManager.isKnown(state, def.recipeId)) return 'Already known.';
    const have = state.recipeScrolls[scrollId] ?? 0;
    if (have <= 0) return "You don't have that recipe.";
    state.recipeScrolls[scrollId] = have - 1;
    if (state.recipeScrolls[scrollId] <= 0) delete state.recipeScrolls[scrollId];
    state.unlockedRecipes.push(def.recipeId);
    return null;
  },

  /** Sells the full stack of one scroll -- same "one button, whole
   *  stack" shape CurioManager.sellAll already uses. Returns the gold
   *  earned, or 0 if there was nothing to sell. */
  sellAll(state: GameState, scrollId: string): number {
    const def = RECIPE_SCROLL_BY_ID[scrollId];
    const have = state.recipeScrolls[scrollId] ?? 0;
    if (!def || have <= 0) return 0;
    const gold = scrollSellValue(def.rarity) * have;
    delete state.recipeScrolls[scrollId];
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + gold);
    state.stats.goldEarned += gold;
    return gold;
  },

  /** Sells every owned scroll in one action -- the Recipes-section
   *  counterpart to CurioManager.sellEverything. Returns how many
   *  distinct scrolls sold and the total gold earned, so the caller can
   *  report one summary rather than one toast per scroll. */
  sellEverything(state: GameState): { count: number; gold: number } {
    const owned = RecipeManager.owned(state);
    if (owned.length === 0) return { count: 0, gold: 0 };
    let gold = 0;
    for (const { def, count } of owned) {
      gold += scrollSellValue(def.rarity) * count;
    }
    state.recipeScrolls = {};
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + gold);
    state.stats.goldEarned += gold;
    return { count: owned.length, gold };
  },

  /**
   * Every scroll a piece of content at `contentLevel` is allowed to
   * drop right now -- `reqLevel <= contentLevel` (same "loose ceiling,
   * not an equality" shape ShopManager.rollEquipment's own eligibility
   * check uses for gear), AND its recipe isn't already known. Does NOT
   * exclude a scroll the guild already owns an unused copy of --
   * direct answer, duplicates are allowed and simply sellable, so the
   * only thing that actually stops a scroll from dropping again is
   * having learned it already. Exported mainly so DevTool/tests can
   * introspect what's currently droppable without duplicating this
   * filter.
   */
  eligibleDrops(state: GameState, contentLevel: number): RecipeScrollDef[] {
    return RECIPE_SCROLLS.filter(
      (def) => def.reqLevel <= contentLevel && !RecipeManager.isKnown(state, def.recipeId),
    );
  },

  /** Picks one random eligible scroll for a drop roll to grant -- unweighted
   *  (every eligible scroll at a given content level is equally likely),
   *  since unlike equipment there's no rarity-weighted pool here: reqLevel
   *  already does the "harder content reaches higher tiers" gating on its
   *  own, so weighting a second time on top of it would just make the
   *  higher tiers even rarer than the reqLevel gate alone already makes
   *  them. Returns null if nothing is currently eligible (guild has
   *  already learned everything up to this content level). */
  rollDrop(state: GameState, contentLevel: number, rng: Rng): RecipeScrollDef | null {
    const eligible = RecipeManager.eligibleDrops(state, contentLevel);
    if (eligible.length === 0) return null;
    return eligible[rng.int(0, eligible.length - 1)];
  },
};
