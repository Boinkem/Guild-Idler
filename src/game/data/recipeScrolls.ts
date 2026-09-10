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
 * part of a tier ladder to begin with (patch 0357, direct design pass;
 * Gear's own tier ladder added patch 0362, see below):
 *   - Gems: the `common` tier of all 8 element/type lines (elemental +
 *     resistance, x4 elements) -- uncommon/rare/epic/legendary all gated.
 *   - Enchant Sigils: `enchant_minor_sigil` -- standard/greater gated.
 *   - Charms: Lucky Charm (gold + xp) -- Fortune Weave and Windfall
 *     Sigil (both variants each) gated.
 *   - Gear: Guildmade Tier I (level 1) of all 9 slots -- Tiers II-VI
 *     (level 10/20/30/40/50, II and VI being the original Guildmade/
 *     Masterwork items respectively, now folded into one continuous
 *     6-tier Guildmade Set) are all gated. Originally NONE of Gear was
 *     free (patch 0357: "Gear has no natural tier ladder to anchor a
 *     lowest tier on") -- now that it has one (patch 0362, direct
 *     design discussion), Tier I follows the same "bottom rung is free"
 *     rule every other tiered family already does.
 *   - Consumables: the tier-1 recipe of each of the 3 tiered "food type"
 *     lines identified from the actual data (Herbal Tonic / Trail
 *     Rations / Forager's Bundle), plus Pet Treat and Beckoning Charm,
 *     neither of which has any tiered siblings at all.
 * 25 always-known + 119 gated (RECIPE_SCROLLS.length) == all 144
 * recipes in crafting-recipes.json (25 + 119 = 144, cross-checked by
 * script before writing this up) -- Heirloom's own 30 are all gated
 * separately (patch 0359), none of them ever free -- see that patch's
 * own writeup for why Gear-shaped tiering doesn't automatically mean a
 * free tier for every family that has one.
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
  // Patch 0362 -- Guildmade's own tier I (level 1) is now the Gear
  // category's lowest tier, same "the bottom rung of any tiered family
  // is free" rule every other category (Gems/Sigils/Charms/
  // Consumables) already followed; Gear was the one exception before
  // this patch specifically because it had no tier ladder to anchor a
  // "lowest tier" on. See RECIPE_SCROLLS' own comment above for tiers
  // II-VI (all still gated) and CraftingStation's own tiered-crafting
  // writeup in guild-idler-status.md for the full redesign.
  'craft_guildmade_blade_t1',
  'craft_guildmade_band_t1',
  'craft_guildmade_helm_t1',
  'craft_guildmade_plate_t1',
  'craft_guildmade_boots_t1',
  'craft_guildmade_cloak_t1',
  'craft_guildmade_gauntlets_t1',
  'craft_guildmade_buckler_t1',
  'craft_guildmade_talisman_t1',
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
