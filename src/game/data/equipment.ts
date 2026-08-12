import { EquipSlot, EquipmentDef, ItemSet, Rarity } from '../types';

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
 * Flat "Gear Score" awarded per equipped item, purely by rarity tier --
 * deliberately NOT derived from the item's actual rolled stats/mods (those
 * already feed hero power separately via equipmentStats). This is a clean,
 * predictable prestige number, the equivalent of an "item level" badge: a
 * legendary always contributes 30 regardless of which legendary it is or
 * how it rolled, so it reads consistently everywhere it's shown (hero
 * card, Guild Power breakdown, tier-colour breakpoints).
 */
export const GEAR_SCORE_BY_RARITY: Record<Rarity, number> = {
  common: 1, uncommon: 3, rare: 7, epic: 15, legendary: 30,
};

/** Max possible Gear Score for one hero: 9 equipment slots, all legendary. */
export const GEAR_SCORE_MAX = 9 * GEAR_SCORE_BY_RARITY.legendary;

/**
 * Every equipment slot a hero has, in the fixed display order
 * EquipmentPanel already used locally -- pulled out here so
 * engine.equipBestGear can iterate the same set without either duplicating
 * the list or importing a UI file into game logic.
 */
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'helmet', 'chest', 'shield', 'gloves', 'boots', 'ring', 'amulet', 'cloak'];

/**
 * Gear Score tiers, evenly spaced across GEAR_SCORE_MAX and reusing the
 * same rarity palette as everything else (RARITY_COLOR in util.ts) -- a
 * hero's Gear Score badge glows the same amber as a legendary item, same
 * "one colour language" reasoning as levelTierColor in power.ts. Distinct
 * from item rarity itself: this bands the *sum* across all equipped gear,
 * not any single item.
 */
export const GEAR_SCORE_TIERS: { name: string; min: number; color: string }[] = [
  { name: 'Common', min: 0, color: '#b9ad93' },
  { name: 'Uncommon', min: Math.round(GEAR_SCORE_MAX * 0.2), color: '#79a86b' },
  { name: 'Rare', min: Math.round(GEAR_SCORE_MAX * 0.4), color: '#5b8fd6' },
  { name: 'Epic', min: Math.round(GEAR_SCORE_MAX * 0.6), color: '#a874d6' },
  { name: 'Legendary', min: Math.round(GEAR_SCORE_MAX * 0.8), color: '#d9a441' },
];

/** The Gear Score tier (name + colour + min threshold) a given score falls
 * into, plus its index -- the index is what callers use to detect a
 * breakpoint crossing. */
export function gearScoreTier(score: number): { name: string; color: string; min: number; index: number } {
  let index = 0;
  for (let i = 0; i < GEAR_SCORE_TIERS.length; i++) {
    if (score >= GEAR_SCORE_TIERS[i].min) index = i;
  }
  return { ...GEAR_SCORE_TIERS[index], index };
}

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
  // Three parallel early/mid-game material-tier sets, one per rarity rung
  // (common/uncommon/rare) rather than tied to a specific chain or raid --
  // the equipment pool below rare was previously thin (a single leather_cap
  // with no set at all), so these exist to give a real, complete
  // progression a fresh guild can chase before the chain/raid reward sets
  // above become reachable. All three are full 9-piece sets (every slot,
  // including the new `cloak` slot) -- three items in each fold in a
  // pre-existing piece that already fit the theme perfectly but had never
  // been given a setId (leather_cap, gauntlets, thief_wraps), rather than
  // creating redundant near-duplicates.
  {
    id: 'leather',
    name: 'Leather Set',
    pieces: [
      'leather_dagger', 'leather_cap', 'leather_jerkin', 'leather_buckler',
      'leather_gloves', 'leather_boots', 'leather_cord_ring', 'leather_talisman', 'leather_cloak',
    ],
    bonuses: [
      { count: 3, mods: { success: 3, injuryResist: 3 }, label: 'Well-Worn' },
      { count: 6, mods: { success: 6, injuryResist: 6, gold: 5 }, label: 'Broken In' },
      { count: 9, mods: { success: 10, injuryResist: 10, gold: 8, speed: 8 }, label: 'Head to Toe in Leather' },
    ],
  },
  {
    id: 'steel',
    name: 'Steel Set',
    pieces: [
      'steel_longsword', 'steel_helm', 'steel_cuirass', 'steel_kite_shield',
      'gauntlets', 'steel_greaves', 'steel_band', 'steel_locket', 'steel_clasped_cloak',
    ],
    bonuses: [
      { count: 3, mods: { success: 5, injuryResist: 6 }, label: 'Standard Issue' },
      { count: 6, mods: { success: 10, injuryResist: 12, gold: 8 }, label: "Smith's Pride" },
      { count: 9, mods: { success: 16, injuryResist: 18, gold: 12, speed: 10 }, label: 'Head to Toe in Steel' },
    ],
  },
  {
    id: 'thief',
    name: "Cutpurse's Set",
    pieces: [
      'cutpurse_stiletto', 'cutpurse_hood', 'cutpurse_leathers', 'cutpurse_buckler',
      'thief_wraps', 'cutpurse_softboots', 'cutpurse_signet', 'cutpurse_locket', 'cutpurse_cloak',
    ],
    bonuses: [
      { count: 3, mods: { gold: 10, loot: 4, speed: 5 }, label: 'Light Fingers' },
      { count: 6, mods: { gold: 20, loot: 10, speed: 10, success: 6 }, label: "Guild of Cutpurses" },
      { count: 9, mods: { gold: 32, loot: 16, speed: 16, success: 10, injuryResist: 8 }, label: 'Nobody Saw a Thing' },
    ],
  },
  // One set per raid, assembled entirely from that raid's own existing
  // drop pool rather than new items -- requiem (above) was the only raid
  // that had this treatment before now; Blackford Keep/Bonewrought
  // Vault/Frozen Wyrmkeep/What Got Out all dropped real, already-themed
  // loot with no setId grouping or set bonus attached to any of it.
  // `setId` is applied to a piece's Normal *and* Heroic *and* Mythic
  // variant alike (see the matching equipment.json entries) -- the actual
  // bonus-counting logic in HeroManager.equipmentMods only cares about
  // which slot is filled and what setId that item carries, never which
  // exact difficulty-tier id it is, so mixing tiers (e.g. a Heroic ring
  // with a Normal helmet) still correctly counts toward the same set.
  // `pieces` below lists one canonical (Normal-tier) id per slot for the
  // discovery-tracker UI, which is about "found this slot", not "found
  // every tier of every drop." dragon_helm drops in both Bonewrought
  // Vault and Frozen Wyrmkeep but is deliberately left out of both --
  // it already belongs to the dragon_slayer set above and reassigning it
  // would have pulled a piece out from under that chain reward.
  {
    id: 'blackford',
    name: 'Blackford Garrison Set',
    pieces: ['knights_blade', 'iron_helm', 'chainmail', 'work_gloves', 'ranger_boots', 'tollkeepers_signet'],
    bonuses: [
      { count: 2, mods: { success: 5, injuryResist: 6 }, label: 'Garrison Standard' },
      { count: 4, mods: { success: 10, injuryResist: 12, gold: 6 }, label: 'Held the Wall' },
      { count: 6, mods: { success: 16, injuryResist: 18, gold: 10, speed: 8 }, label: 'Siege Veteran' },
    ],
  },
  {
    id: 'bonewrought',
    name: 'Bonewrought Vault Set',
    pieces: ['gravewatchers_band', 'choir_mask', 'silenced_bell'],
    bonuses: [
      { count: 2, mods: { success: 10, injuryResist: 12 }, label: 'Vault-Touched' },
      { count: 3, mods: { success: 18, injuryResist: 22, gold: 12 }, label: 'Choir Silenced' },
    ],
  },
  {
    id: 'wyrmkeep',
    name: 'Frozen Wyrmkeep Set',
    pieces: ['frostfang_claw', 'keepers_warded_charm', 'frostwalker_treads', 'frozen_maw_shield'],
    bonuses: [
      { count: 2, mods: { success: 10, speed: 10 }, label: 'Frostbitten' },
      { count: 3, mods: { success: 18, speed: 16, injuryResist: 10 }, label: "Keeper's Ward" },
      { count: 4, mods: { success: 26, speed: 22, injuryResist: 16, gold: 12 }, label: 'Wyrmkeep Thawed' },
    ],
  },
  {
    id: 'what_got_out',
    name: 'What Got Out Set',
    pieces: ['cinder_ash_grip', 'loyalists_brand', 'cornered_fang', 'desperate_ends_crown'],
    bonuses: [
      { count: 2, mods: { success: 12, gold: 14 }, label: 'Trail Gone Cold' },
      { count: 3, mods: { success: 20, gold: 24, loot: 8 }, label: 'The Last Loyal' },
      { count: 4, mods: { success: 30, gold: 34, loot: 14, injuryResist: 12 }, label: 'Cornered' },
    ],
  },
  // Three new raids -- Black Dragon Nest, House of Bones, Silence the Loom
  // (see guild-idler-status.md) -- each gets the same one-set-per-raid
  // treatment as blackford/bonewrought/wyrmkeep/what_got_out above.
  {
    id: 'cinderfang',
    name: 'Cinderfang Set',
    pieces: ['cinderfang_gauntlets', 'wyrmwardens_cloak', 'scaleknit_boots', 'brood_fang_dagger', 'blackscale_helm', 'broodmothers_crown'],
    bonuses: [
      { count: 2, mods: { success: 10, injuryResist: 10 }, label: 'Nest-Touched' },
      { count: 4, mods: { success: 18, injuryResist: 18, gold: 12 }, label: 'Ridge-Scorched' },
      { count: 6, mods: { success: 28, injuryResist: 26, gold: 20, loot: 12 }, label: 'The Nest Is Ash' },
    ],
  },
  {
    id: 'grimward',
    name: 'Grimward Set',
    pieces: ['sewn_maw_greataxe', 'stitched_hide_vest', 'phylactery_shard_ring', 'unbinding_gauntlets', 'lichbound_diadem', 'grimward_amulet'],
    bonuses: [
      { count: 2, mods: { success: 12, injuryResist: 14 }, label: 'Ossuary-Marked' },
      { count: 4, mods: { success: 22, injuryResist: 24, xp: 16 }, label: 'Phylactery Broken' },
      { count: 6, mods: { success: 34, injuryResist: 32, xp: 26, gold: 16 }, label: 'The Ritual Ended' },
    ],
  },
  {
    id: 'loom',
    name: "The Loom's Set",
    pieces: ['woven_mind_circlet', 'unraveling_cloak', 'threadcutter'],
    bonuses: [
      { count: 2, mods: { success: 16, xp: 18 }, label: 'One Thread Cut' },
      { count: 3, mods: { success: 28, xp: 30, speed: 14, gold: 18 }, label: 'Unraveled' },
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
