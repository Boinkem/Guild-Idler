import { ALWAYS_KNOWN_RECIPE_IDS, RECIPE_SCROLLS, RECIPE_SCROLL_BY_ID, scrollSellValue } from '../data/recipeScrolls';
import { RecipeScrollDef, GameState, VendorId, CraftingRecipeDef } from '../types';
import { Rng, createRng } from '../rng';
import { ModifierManager } from './ModifierManager';
import { CRAFTING_RECIPE_BY_ID } from '../data/craftingRecipes';
import { Tuning } from '../data/tuning';
import { rerollDay } from '../data/reroll';

/** Patch 0506 -- which vendor's Recipe Shelf a recipe category sits on.
 *  Same split the vendors' own crafting buttons use (charms moved to the
 *  Alchemist in patch 0347). */
const SHELF_VENDOR_BY_CATEGORY: Record<CraftingRecipeDef['category'], VendorId> = {
  gear: 'blacksmith', consumable: 'alchemist', charm: 'alchemist', enchant: 'enchanter', gem: 'enchanter',
};
const SHELF_VENDORS: VendorId[] = ['blacksmith', 'alchemist', 'enchanter'];

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
    // Patch 0484 -- always-known recipes added after a save was made
    // (Raider's Charm) count as known without a migration.
    return state.unlockedRecipes.includes(recipeId) || ALWAYS_KNOWN_RECIPE_IDS.includes(recipeId);
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
      // Patch 0506 -- shelfOnly (Mythic) recipes never drop.
      (def) => !def.shelfOnly && def.reqLevel <= contentLevel && !RecipeManager.isKnown(state, def.recipeId),
    );
  },

  /* ------------------------------ Recipe Shelf ------------------------------ */
  // Patch 0506 -- each vendor sells unknown recipes for gold (a late-game
  // gold sink, and a guaranteed route to a recipe the drop table hides).
  // Rolled once per rerollDay and stored (GameState.recipeShelf) so the
  // offer doesn't reshuffle as heroes level or recipes are learned during
  // the day. Buying learns the recipe on the spot.

  shelfVendor(def: RecipeScrollDef): VendorId | null {
    const recipe = CRAFTING_RECIPE_BY_ID[def.recipeId];
    return recipe ? SHELF_VENDOR_BY_CATEGORY[recipe.category] : null;
  },

  /** Gold price of a shelf recipe -- see recipeShelf.* in tuning.json.
   *  Rounded to the nearest 100. */
  shelfPrice(def: RecipeScrollDef): number {
    if (def.shelfOnly) return Tuning.get('recipeShelf.mythicPrice');
    const raw = Tuning.get('recipeShelf.basePrice')
      * Tuning.get(`recipeShelf.rarityMult.${def.rarity}`)
      * (1 + def.reqLevel / Math.max(1, Tuning.get('recipeShelf.levelDivisor')));
    return Math.round(raw / 100) * 100;
  },

  /** The Alchemist level that shows the Mythic slot. */
  mythicSlotOpen(state: GameState): boolean {
    return (state.vendorLevels.alchemist ?? 0) >= Tuning.get('recipeShelf.mythicVendorLevel');
  },

  /** Rolls today's shelves if the stored ones are from an earlier day (or
   *  were never rolled). Returns whether anything changed. Called from
   *  GameEngine.refreshWorld. Eligibility: unknown, not shelfOnly,
   *  reqLevel <= the guild's top hero level. The Mythic slot picks from
   *  the unknown shelfOnly recipes (shown only once the Alchemist is at
   *  recipeShelf.mythicVendorLevel). */
  ensureShelf(state: GameState, now: number): boolean {
    const day = rerollDay(now);
    if (state.recipeShelf && state.recipeShelf.day === day) return false;
    const rng = createRng(`recipe-shelf:${day}:${state.createdAt}`);
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const slots = Math.max(0, Math.floor(Tuning.get('recipeShelf.slots')));
    const offers = {} as Record<VendorId, string[]>;
    for (const vendor of SHELF_VENDORS) {
      const pool = RECIPE_SCROLLS.filter((d) => !d.shelfOnly && d.reqLevel <= topLevel
        && !RecipeManager.isKnown(state, d.recipeId) && RecipeManager.shelfVendor(d) === vendor);
      offers[vendor] = rng.shuffle(pool).slice(0, slots).map((d) => d.id);
    }
    const mythicPool = RECIPE_SCROLLS.filter((d) => d.shelfOnly && !RecipeManager.isKnown(state, d.recipeId));
    const mythic = mythicPool.length > 0 ? rng.pick(mythicPool).id : null;
    state.recipeShelf = { day, offers, mythic };
    return true;
  },

  /** Null if `scrollId` can be bought from today's shelf right now, else
   *  why not (player-facing). */
  shelfBlocker(state: GameState, scrollId: string, now: number): string | null {
    const def = RECIPE_SCROLL_BY_ID[scrollId];
    if (!def) return 'Unknown recipe.';
    const shelf = state.recipeShelf;
    if (!shelf || shelf.day !== rerollDay(now)) return 'The shelf is being restocked.';
    const vendor = RecipeManager.shelfVendor(def);
    const onShelf = (vendor && shelf.offers[vendor]?.includes(scrollId)) || shelf.mythic === scrollId;
    if (!onShelf) return 'Not on the shelf today.';
    if (RecipeManager.isKnown(state, def.recipeId)) return 'Already learned.';
    if (shelf.mythic === scrollId && !RecipeManager.mythicSlotOpen(state)) {
      return `The Alchemist sells Mythic recipes from level ${Tuning.get('recipeShelf.mythicVendorLevel')}.`;
    }
    const price = RecipeManager.shelfPrice(def);
    if (price > ModifierManager.goldStorage(state)) return 'Costs more than the Treasury can hold -- upgrade the Treasury first.';
    if (state.gold < price) return 'Not enough gold.';
    return null;
  },

  /** Buys and learns a shelf recipe. Returns an error string or null. */
  buyFromShelf(state: GameState, scrollId: string, now: number): string | null {
    const blocked = RecipeManager.shelfBlocker(state, scrollId, now);
    if (blocked) return blocked;
    const def = RECIPE_SCROLL_BY_ID[scrollId]!;
    const price = RecipeManager.shelfPrice(def);
    state.gold -= price;
    state.stats.goldSpent += price;
    state.unlockedRecipes.push(def.recipeId);
    return null;
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
