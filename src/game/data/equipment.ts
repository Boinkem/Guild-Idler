import { EquipmentDef, ItemSet, Rarity } from '../types';

/** Loot weight and shop pricing scale off rarity. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100, uncommon: 45, rare: 16, epic: 5, legendary: 1,
};

/**
 * Base per-item drop chance, before the difficulty tier's own bonus, any
 * account-wide loot bonus, and the hero's personal Luck-derived bonus (see
 * HeroManager.personalLootBonus). Legendary raised from 0.4 to 1.5 --
 * multiplier tuning alone couldn't reach a reasonable target for a
 * balanced-stat hero (getting from 0.4% to ~10% needs roughly a 25x total
 * multiplier, which no percentage-based curve can deliver without also
 * making a maxed build hit the 90% clamp trivially). Every other rarity's
 * base is untouched.
 */
export const RARITY_LOOT_CHANCE: Record<Rarity, number> = {
  common: 30, uncommon: 14, rare: 5, epic: 1.6, legendary: 1.5,
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
    id: 'ashen_hand',
    name: 'Ashen Hand Set',
    // sword_of_the_ashen_hand and bulwark_of_the_war_saint were the_pale_rider's
    // reward pair but had no setId at all until now -- every other chain reward
    // pair (Dragon, Voidforged, Empyrean) got real set treatment, this one just
    // hadn't yet. Two new pieces (gloves, boots) round it out to a full 4-piece set.
    pieces: ['sword_of_the_ashen_hand', 'bulwark_of_the_war_saint', 'gauntlets_of_the_ashen_hand', 'boots_of_the_ashen_hand'],
    bonuses: [
      { count: 2, mods: { success: 8, injuryResist: 12 }, label: 'Sworn Oath' },
      { count: 3, mods: { success: 14, injuryResist: 20, gold: 10 }, label: "Paladin's Bulwark" },
      { count: 4, mods: { success: 22, injuryResist: 30, gold: 15, speed: 10 }, label: "The Ashen Hand's Champion" },
    ],
  },
  {
    id: 'voidforged',
    name: 'Voidforged Set',
    // voidforged_signet existed already but was missing from this list despite
    // clearly belonging -- fixed. Gauntlets and treads are new, filling what
    // was otherwise a total absence of legendary gloves/boots in the game.
    pieces: ['voidforged_blade', 'voidforged_crown', 'voidforged_plate', 'voidforged_signet', 'voidforged_gauntlets', 'voidforged_treads'],
    bonuses: [
      { count: 2, mods: { success: 10, loot: 8 }, label: 'Between Worlds' },
      { count: 3, mods: { success: 18, gold: 30, loot: 15, injuryResist: 15, xp: 25 }, label: 'Unmade' },
      { count: 4, mods: { success: 22, gold: 35, loot: 18 }, label: 'Signet-Bound' },
      { count: 5, mods: { success: 28, gold: 45, loot: 24, injuryResist: 18 }, label: 'Fully Unmade' },
      { count: 6, mods: { success: 36, gold: 60, loot: 32, injuryResist: 25, xp: 30, speed: 15 }, label: 'One With the Void' },
    ],
  },
  {
    id: 'empyrean',
    name: 'Empyrean Set',
    pieces: ['empyrean_blade', 'empyrean_halo', 'empyrean_aegis', 'empyrean_grips', 'empyrean_striders'],
    bonuses: [
      { count: 2, mods: { success: 14, injuryResist: 14 }, label: 'Ascendant' },
      { count: 3, mods: { success: 24, gold: 40, loot: 22, injuryResist: 20, xp: 35, speed: 12 }, label: 'Beyond the Vault of Heaven' },
      { count: 4, mods: { success: 30, gold: 50, loot: 28, injuryResist: 25 }, label: 'Choir Ascendant' },
      { count: 5, mods: { success: 40, gold: 60, loot: 35, injuryResist: 30, xp: 45, speed: 18 }, label: 'Beyond the Vault, Whole' },
    ],
  },
  {
    id: 'requiem',
    name: 'Requiem Set',
    // The full last_god capstone reward -- all seven slots, so finishing the
    // game's final chain outfits a hero completely rather than handing over
    // one amulet and calling it done. The 7-piece bonus label echoes the
    // chain's own final stage name on purpose.
    pieces: [
      'the_last_ember', 'requiem_blade', 'requiem_crown', 'requiem_plate',
      'requiem_signet', 'requiem_grips', 'requiem_striders',
    ],
    bonuses: [
      { count: 2, mods: { success: 16, injuryResist: 20 }, label: 'Requiem Begun' },
      { count: 4, mods: { success: 28, gold: 40, loot: 20, injuryResist: 30 }, label: "Requiem-Bearer's Due" },
      { count: 7, mods: { success: 45, gold: 70, loot: 40, injuryResist: 45, xp: 50, speed: 20 }, label: 'What Is Left of It' },
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
