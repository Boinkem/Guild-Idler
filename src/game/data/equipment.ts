import { EquipmentDef, ItemSet, Rarity } from '../types';

/** Loot weight and shop pricing scale off rarity. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100, uncommon: 45, rare: 16, epic: 5, legendary: 1,
};

/** Base per-item drop chance, before the hero's rare-loot bonus. */
export const RARITY_LOOT_CHANCE: Record<Rarity, number> = {
  common: 30, uncommon: 14, rare: 5, epic: 1.6, legendary: 0.4,
};

export const RARITY_PRICE_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 2.2, rare: 5, epic: 12, legendary: 32,
};

/**
 * Equipment lives in json/equipment.json so it can be edited via
 * tools/devtool without touching TypeScript.
 */
import equipmentJson from './json/equipment.json';
export const EQUIPMENT: EquipmentDef[] = equipmentJson as EquipmentDef[];

export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(
  EQUIPMENT.map((e) => [e.id, e]),
);

export const ITEM_SETS: ItemSet[] = [
  {
    id: 'dragon_slayer',
    name: 'Dragon Slayer Set',
    pieces: ['dragon_helm', 'dragon_armor', 'dragon_blade'],
    bonuses: [
      { count: 2, mods: { success: 6, injuryResist: 10 }, label: 'Scaled Guard' },
      { count: 3, mods: { success: 12, gold: 40, loot: 10, durability: 25 }, label: 'Wyrmbane' },
    ],
  },
  {
    id: 'voidforged',
    name: 'Voidforged Set',
    pieces: ['voidforged_blade', 'voidforged_crown', 'voidforged_plate'],
    bonuses: [
      { count: 2, mods: { success: 10, loot: 8 }, label: 'Between Worlds' },
      { count: 3, mods: { success: 18, gold: 30, loot: 15, injuryResist: 15, xp: 25 }, label: 'Unmade' },
    ],
  },
];

export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(ITEM_SETS.map((s) => [s.id, s]));

/** Loot pools per difficulty: which rarities can drop. */
export const LOOT_RARITY_BY_DIFFICULTY: Record<string, Rarity[]> = {
  easy: ['common', 'uncommon'],
  normal: ['common', 'uncommon', 'rare'],
  hard: ['uncommon', 'rare', 'epic'],
  epic: ['rare', 'epic', 'legendary'],
  legendary: ['rare', 'epic', 'legendary'],
};
