import { RecipeScrollDef, Rarity } from '../types';
import { Tuning } from './tuning';

/**
 * Recipe scrolls live in json/recipe-scrolls.json so they can be edited
 * via tools/devtool without touching TypeScript -- same reasoning and
 * pattern equipment.ts/consumables.ts/curios.ts already use for their
 * own data. See RecipeScrollDef's own doc comment in types.ts for what
 * each field means.
 */
import recipeScrollsJson from './json/recipe-scrolls.json';
export const RECIPE_SCROLLS: RecipeScrollDef[] = recipeScrollsJson as RecipeScrollDef[];

export const RECIPE_SCROLL_BY_ID: Record<string, RecipeScrollDef> = Object.fromEntries(
  RECIPE_SCROLLS.map((s) => [s.id, s]),
);

/** Reverse lookup, recipeId -> its own scroll -- every RecipeManager call
 *  site cares "does THIS recipe have a scroll" far more often than "what
 *  recipe does THIS scroll unlock" (the forward direction RECIPE_SCROLLS
 *  itself already serves directly). A recipe with no entry here is one
 *  of the always-known ones (see ALWAYS_KNOWN_RECIPE_IDS below) -- there
 *  is deliberately no scroll for those at all, not a scroll nobody can
 *  ever find. */
export const RECIPE_SCROLL_BY_RECIPE_ID: Record<string, RecipeScrollDef> = Object.fromEntries(
  RECIPE_SCROLLS.map((s) => [s.recipeId, s]),
);

/**
 * Every recipe a brand-new guild already knows, with no scroll needed --
 * the lowest tier of every gated family, plus everything that was never
 * part of a tier ladder to begin with (patch 0357, direct design pass):
 *   - Gems: the `common` tier of all 8 element/type lines (elemental +
 *     resistance, x4 elements) -- uncommon/rare/epic/legendary all gated.
 *   - Enchant Sigils: `enchant_minor_sigil` -- standard/greater gated.
 *   - Charms: Lucky Charm (gold + xp) -- Fortune Weave and Windfall
 *     Sigil (both variants each) gated.
 *   - Gear: none -- all 12 (6 Guildmade, 6 Masterwork) are individually
 *     gated, direct request ("each gear recipe has its own individual
 *     scroll") rather than one flat unlock or a free starting tier, since
 *     Gear has no natural tier ladder to anchor a "lowest tier" on in
 *     the first place.
 *   - Consumables: the tier-1 recipe of each of the 3 tiered "food type"
 *     lines identified from the actual data (Herbal Tonic / Trail
 *     Rations / Forager's Bundle), plus Pet Treat and Beckoning Charm,
 *     neither of which has any tiered siblings at all.
 * 16 always-known + 56 gated (RECIPE_SCROLLS.length) == all 72 recipes
 * in crafting-recipes.json.
 */
export const ALWAYS_KNOWN_RECIPE_IDS: string[] = [
  'craft_elemental_gem_fire_common',
  'craft_elemental_gem_frost_common',
  'craft_elemental_gem_lightning_common',
  'craft_elemental_gem_poison_common',
  'craft_resistance_gem_fire_common',
  'craft_resistance_gem_frost_common',
  'craft_resistance_gem_lightning_common',
  'craft_resistance_gem_poison_common',
  'enchant_minor_sigil',
  'craft_lucky_charm_gold',
  'craft_lucky_charm_xp',
  'craft_herbal_tonic',
  'craft_trail_rations',
  'craft_foragers_bundle',
  'craft_pet_treat',
  'craft_beckoning_charm',
];

/** Flat gold value on sale, by rarity -- same "curios have no other use
 *  besides selling the spare ones" economics as CurioDef.sellValue, just
 *  keyed off rarity instead of hand-authored per entry, since a scroll's
 *  worth is really just "how rare was this drop," nothing else. */
const SCROLL_SELL_VALUE_BY_RARITY: Record<Rarity, number> = {
  common: 20, uncommon: 60, rare: 180, epic: 450, legendary: 1000,
};
export function scrollSellValue(rarity: Rarity): number {
  return SCROLL_SELL_VALUE_BY_RARITY[rarity];
}

/** Same shape as curios.ts's own questCurioDropChance/pets.ts's own
 *  questEggDropChance -- see quest.recipeDropChance.* in tuning.json for
 *  the actual per-difficulty values and their own descriptions. */
export function questRecipeDropChance(difficulty: string): number {
  return Tuning.get(`quest.recipeDropChance.${difficulty}`);
}

/** Raid counterpart to questRecipeDropChance above -- rolled once per
 *  raid clear (RaidManager), not per encounter, same "one flat
 *  independent roll" shape the quest side uses rather than requiring
 *  every encounter in the game to hand-author its own recipeLoot table
 *  the way equipment/egg loot already does. See raid.recipeDropChance.*
 *  in tuning.json. */
export function raidRecipeDropChance(difficulty: string): number {
  return Tuning.get(`raid.recipeDropChance.${difficulty}`);
}
