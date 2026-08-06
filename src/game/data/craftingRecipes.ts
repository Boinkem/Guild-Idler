import { CraftingRecipeDef } from '../types';
import craftingRecipesJson from './json/crafting-recipes.json';

/**
 * Crafting recipes, cross-node by category rather than per-item -- a ring
 * never needs Fish. Gear recipes produce a fresh EquipmentItem with
 * player-chosen customMods (see EquipmentItem.customMods) instead of a
 * fixed roll -- the actual reason to craft rather than just farm or buy,
 * choice instead of RNG. Consumable recipes are simpler on purpose:
 * materials+gold standing in for the shop's gold-only price, no
 * customization, since "choose your own stat spread" only makes sense for
 * something you keep. Enchant recipes are a third shape again -- they
 * modify an item the player already owns (additive enchantStats, see
 * that field's comment in types.ts) rather than producing anything new.
 *
 * Lives in json/crafting-recipes.json rather than a literal array here --
 * editable via tools/devtool (the "Crafting Recipes" tab) without
 * touching TypeScript, same reasoning as equipment/consumables/raids.
 *
 * Both craftable gear bases (guildmade_blade, guildmade_band) live in
 * equipment.json with an empty `mods` object and `craftable: true` -- see
 * that flag's own comment in types.ts for why the def itself carries no
 * mods of its own.
 */
export const CRAFTING_RECIPES: CraftingRecipeDef[] = craftingRecipesJson as CraftingRecipeDef[];

export const CRAFTING_RECIPE_BY_ID: Record<string, CraftingRecipeDef> = Object.fromEntries(
  CRAFTING_RECIPES.map((r) => [r.id, r]),
);
