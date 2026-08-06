import { CraftingRecipeDef } from '../types';

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
 * Both craftable gear bases (guildmade_blade, guildmade_band) live in
 * equipment.json with an empty `mods` object and `craftable: true` -- see
 * that flag's own comment in types.ts for why the def itself carries no
 * mods of its own.
 */
export const CRAFTING_RECIPES: CraftingRecipeDef[] = [
  {
    id: 'craft_guildmade_blade',
    name: 'Guildmade Blade',
    description: 'A weapon built to the wielder\u2019s own spec, not whatever the smith happened to have on the rack.',
    category: 'gear',
    materialCost: { ore: 20, timber: 10 },
    goldCost: 400,
    resultDefId: 'guildmade_blade',
    modOptions: ['success', 'gold', 'xp', 'loot'],
    modsToPick: 2,
    modValue: 6,
  },
  {
    id: 'craft_guildmade_band',
    name: 'Guildmade Band',
    description: 'A ring cast and set by the guild\u2019s own hand -- exactly the bonuses asked for, nothing left to chance.',
    category: 'gear',
    materialCost: { ore: 15, timber: 5 },
    goldCost: 350,
    resultDefId: 'guildmade_band',
    modOptions: ['success', 'gold', 'xp', 'loot'],
    modsToPick: 2,
    modValue: 6,
  },
  {
    id: 'craft_trail_rations',
    name: 'Trail Rations',
    description: 'Smoked fish and dried herbs, packed for a hero who won\u2019t be home for dinner.',
    category: 'consumable',
    materialCost: { fish: 8, herbs: 4 },
    goldCost: 20,
    resultConsumableId: 'strength_potion',
  },
  {
    id: 'craft_herbal_tonic',
    name: 'Herbal Tonic',
    description: 'The Herb Garden\u2019s own cure-all, brewed in-house rather than bought off a vendor\u2019s shelf.',
    category: 'consumable',
    materialCost: { herbs: 10 },
    goldCost: 25,
    resultConsumableId: 'healing_potion',
  },
  {
    id: 'enchant_minor_sigil',
    name: 'Minor Sigil',
    description: 'A working the Enchanter presses into a piece already carried, rather than anything built from scratch.',
    category: 'enchant',
    materialCost: { herbs: 15, ore: 10 },
    goldCost: 300,
    statOptions: ['strength', 'endurance', 'luck', 'wisdom'],
    statsToPick: 1,
    statValue: 3,
  },
];

export const CRAFTING_RECIPE_BY_ID: Record<string, CraftingRecipeDef> = Object.fromEntries(
  CRAFTING_RECIPES.map((r) => [r.id, r]),
);
