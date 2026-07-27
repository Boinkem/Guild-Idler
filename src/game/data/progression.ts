import { GuildDef, HeroClass, Modifiers, QuestTag, RenownPerkDef, Stats, UpgradeDef, VendorId } from '../types';

/* --------------------------- permanent upgrades --------------------------- */

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'weapons_training', name: 'Better Weapons Training',
    description: 'Drill the fundamentals until they are boring.',
    baseCost: 200, costGrowth: 1.75, maxLevel: 10,
    modsPerLevel: { success: 5 }, vendor: 'blacksmith',
  },
  {
    id: 'efficient_adventuring', name: 'Efficient Adventuring',
    description: 'Negotiate the contract before drawing the sword.',
    baseCost: 250, costGrowth: 1.8, maxLevel: 10,
    modsPerLevel: { gold: 10 },
  },
  {
    id: 'veteran_explorer', name: 'Veteran Explorer',
    description: 'Knows which rubble is worth turning over.',
    baseCost: 400, costGrowth: 1.9, maxLevel: 8,
    modsPerLevel: { loot: 5 }, vendor: 'alchemist',
  },
  {
    id: 'mounted_travel', name: 'Mounted Travel',
    description: 'A good horse shortens every road.',
    baseCost: 600, costGrowth: 2.0, maxLevel: 6,
    modsPerLevel: { speed: 10 }, vendor: 'blacksmith',
  },
  {
    id: 'field_medicine', name: 'Field Medicine',
    description: 'Fewer injuries make it home with the knight.',
    baseCost: 350, costGrowth: 1.85, maxLevel: 8,
    modsPerLevel: { injuryResist: 8 }, vendor: 'alchemist',
  },
  {
    id: 'armourers_contract', name: "Armourer's Contract",
    description: 'Standing repairs mean gear lasts noticeably longer.',
    baseCost: 500, costGrowth: 1.9, maxLevel: 6,
    modsPerLevel: { durability: 10 }, vendor: 'blacksmith',
  },
  {
    id: 'war_stories', name: 'War Stories',
    description: 'Every quest teaches more when it is retold properly.',
    baseCost: 450, costGrowth: 1.85, maxLevel: 8,
    modsPerLevel: { xp: 15 }, vendor: 'enchanter',
  },
  {
    id: 'master_adventurer', name: 'Master Adventurer',
    description: 'Unlocks Legendary contracts on the quest board.',
    baseCost: 5000, costGrowth: 1, maxLevel: 1,
    modsPerLevel: { success: 3 }, unlocks: 'legendaryQuests', vendor: 'enchanter',
  },
  {
    id: 'guild_charter', name: 'Guild Charter',
    description: 'Unlocks multi-day quest chains.',
    baseCost: 3000, costGrowth: 1, maxLevel: 1,
    modsPerLevel: {}, unlocks: 'chains',
  },
  {
    id: 'black_market_contact', name: 'Black Market Contact',
    description: "Someone who knows someone. Unlocks a second, pricier stock rotation biased toward rare and legendary gear — often stock the regular armourer would never touch.",
    baseCost: 9000, costGrowth: 1, maxLevel: 1,
    modsPerLevel: {}, unlocks: 'blackMarket',
  },
  {
    id: 'auto_chain', name: 'Auto-Chain',
    description: 'A hero keeps taking the next contract on their own instead of waiting for orders — for a while. Each level lets the streak run longer before it needs a fresh send.',
    baseCost: 3500, costGrowth: 2.3, maxLevel: 4,
    modsPerLevel: {}, unlocks: 'autoChain',
  },
];

/**
 * Auto-Chain quest-count range per upgrade level, indexed 1-4. A streak's
 * actual length is rolled within this range each time a fresh one starts
 * (via a manual send), so the exact stopping point stays a little
 * unpredictable rather than a metronomic "always exactly 3."
 */
export const AUTO_CHAIN_RANGES: Record<number, { min: number; max: number }> = {
  1: { min: 2, max: 3 },
  2: { min: 3, max: 5 },
  3: { min: 6, max: 8 },
  4: { min: 10, max: 10 },
};

/* --------------------------------- vendors --------------------------------- */

export interface VendorDef {
  id: VendorId;
  name: string;
  blurb: string;
}

export const VENDORS: VendorDef[] = [
  { id: 'blacksmith', name: 'The Blacksmith', blurb: 'Weapons, armour, and a horse that actually listens.' },
  { id: 'alchemist', name: 'The Alchemist', blurb: 'Salves, remedies, and an eye for what a ruin is really worth.' },
  { id: 'enchanter', name: 'The Enchanter', blurb: 'Old books, older favours, and a taste for the theatrical.' },
];

const VENDOR_LEVEL_BASE_COST = 800;
const VENDOR_LEVEL_COST_GROWTH = 2.1;

/** Every upgrade a given vendor offers, in the fixed order they unlock at vendor levels 1, 2, 3... */
export function vendorUpgrades(vendorId: VendorId): UpgradeDef[] {
  return UPGRADES.filter((u) => u.vendor === vendorId);
}

/** Cost to raise a vendor from currentLevel to currentLevel+1, or null if they're already at their cap. */
export function vendorLevelCost(vendorId: VendorId, currentLevel: number): number | null {
  const cap = vendorUpgrades(vendorId).length;
  if (currentLevel >= cap) return null;
  return Math.floor(VENDOR_LEVEL_BASE_COST * Math.pow(VENDOR_LEVEL_COST_GROWTH, currentLevel));
}

/** Whether a specific upgrade is currently visible/purchasable given the vendor's level. */
export function isVendorUpgradeUnlocked(vendorLevel: number, vendorId: VendorId, upgradeId: string): boolean {
  const list = vendorUpgrades(vendorId);
  const index = list.findIndex((u) => u.id === upgradeId);
  if (index === -1) return true; // not a vendor upgrade at all -- not gated
  return vendorLevel >= index + 1;
}

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upgradeCost(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

/* ------------------------------- guild hall ------------------------------- */

export const GUILD_FACILITIES: GuildDef[] = [
  {
    id: 'barracks', name: 'Barracks',
    description: 'Training yard and drill sergeant. Every hero fights better.',
    baseCost: 500, costGrowth: 1.8, maxLevel: 10, modsPerLevel: { success: 3 },
  },
  {
    id: 'treasury', name: 'Treasury',
    description: 'Raises how much gold the guild can hold at once.',
    baseCost: 400, costGrowth: 1.7, maxLevel: 12, modsPerLevel: { gold: 4 }, storagePerLevel: 5000,
  },
  {
    id: 'workshop', name: 'Workshop',
    description: 'Gear wears down more slowly and upgrades cost less.',
    baseCost: 600, costGrowth: 1.85, maxLevel: 10, modsPerLevel: { durability: 8 },
  },
  {
    id: 'library', name: 'Library',
    description: 'Maps, bestiaries, and a very patient archivist.',
    baseCost: 550, costGrowth: 1.8, maxLevel: 10, modsPerLevel: { xp: 12 },
  },
  {
    id: 'tavern', name: 'Tavern',
    description: 'Where new heroes are found. Each level opens a hero slot.',
    baseCost: 750, costGrowth: 2.4, maxLevel: 5, modsPerLevel: { loot: 2 }, heroSlotsPerLevel: 1,
  },
];

export const GUILD_BY_ID: Record<string, GuildDef> = Object.fromEntries(GUILD_FACILITIES.map((g) => [g.id, g]));

export function guildCost(def: GuildDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

export const BASE_GOLD_STORAGE = 10_000;

/* ----------------------------- renown perks ------------------------------ */

export const RENOWN_PERKS: RenownPerkDef[] = [
  {
    id: 'renowned_skill', name: 'Renowned Skill',
    description: 'Every retired knight leaves behind hard-won technique.',
    cost: 1, costGrowth: 1.6, maxLevel: 20, modsPerLevel: { success: 3 },
    tier2: { maxLevel: 25, startCost: 9822, costGrowth: 1.12, unlockFlavour: 'The old masters take on students of their own.' },
  },
  {
    id: 'legacy_of_wealth', name: 'Legacy of Wealth',
    description: 'The guild coffers remember better days.',
    cost: 1, costGrowth: 1.6, maxLevel: 20, modsPerLevel: { gold: 15 },
    tier2: { maxLevel: 25, startCost: 9822, costGrowth: 1.12, unlockFlavour: 'Word of the guild reaches courts that used to ignore it.' },
  },
  {
    id: 'swift_legend', name: 'Swift Legend',
    description: 'Reputation opens gates that used to take days.',
    cost: 2, costGrowth: 1.7, maxLevel: 10, modsPerLevel: { speed: 5 },
    tier2: { maxLevel: 13, startCost: 309, costGrowth: 1.12, unlockFlavour: 'Roads that were never built start showing up on the map.' },
  },
  {
    id: 'collectors_eye', name: "Collector's Eye",
    description: 'You know exactly what is worth carrying home.',
    cost: 2, costGrowth: 1.7, maxLevel: 12, modsPerLevel: { loot: 4 },
    tier2: { maxLevel: 15, startCost: 891, costGrowth: 1.12, unlockFlavour: 'Things that should stay buried start feeling curious about you too.' },
  },
  {
    id: 'enduring_legend', name: 'Enduring Legend',
    description: 'Heroes trained on your legend get hurt far less.',
    cost: 2, costGrowth: 1.65, maxLevel: 10, modsPerLevel: { injuryResist: 10 },
    tier2: { maxLevel: 13, startCost: 236, costGrowth: 1.12, unlockFlavour: 'New recruits flinch less on their first day than veterans used to on their hundredth.' },
  },
  {
    id: 'extra_banner', name: 'Extra Banner',
    description: 'A permanent additional hero slot.',
    cost: 5, costGrowth: 2.2, maxLevel: 4, modsPerLevel: {}, heroSlotsPerLevel: 1,
    // Deliberately no tier2: hero slots stay a small, fixed number rather
    // than scaling indefinitely — the roster is meant to stay a roster.
  },
  {
    id: 'scholars_legacy', name: "Scholar's Legacy",
    description: 'New heroes learn from every campaign that came before.',
    cost: 1, costGrowth: 1.6, maxLevel: 15, modsPerLevel: { xp: 20 },
    tier2: { maxLevel: 19, startCost: 936, costGrowth: 1.12, unlockFlavour: 'The guild library runs out of shelf space again.' },
  },
];

export const RENOWN_BY_ID: Record<string, RenownPerkDef> = Object.fromEntries(RENOWN_PERKS.map((p) => [p.id, p]));

/** The real level ceiling for a perk, accounting for tier 2 if it has one. */
export function renownEffectiveMaxLevel(def: RenownPerkDef): number {
  return def.tier2?.maxLevel ?? def.maxLevel;
}

export function renownCost(def: RenownPerkDef, currentLevel: number): number {
  if (def.tier2 && currentLevel >= def.maxLevel) {
    const tier2Level = currentLevel - def.maxLevel;
    return Math.max(1, Math.floor(def.tier2.startCost * Math.pow(def.tier2.costGrowth, tier2Level)));
  }
  return Math.max(1, Math.floor(def.cost * Math.pow(def.costGrowth, currentLevel)));
}

/* ------------------------------ hero classes ----------------------------- */

export interface HeroClassDef {
  id: HeroClass;
  name: string;
  blurb: string;
  baseStats: Stats;
  growth: Stats;
  mods: Partial<Modifiers>;
  /** Bonus success on preferred quest tags. */
  preferred: QuestTag[];
  preferredBonus: number;
  /** Tavern level needed to recruit. */
  unlockTavernLevel: number;
  /** Baseline power tier 0-3; higher hires start stronger to justify the cost. */
  tier: number;
  names: string[];
}

export const HERO_CLASSES: Record<HeroClass, HeroClassDef> = {
  adventurer: {
    id: 'adventurer', name: 'Adventurer', blurb: 'No banner, no order, just grit and a willingness to go first. The guild starts here.',
    baseStats: { strength: 6, endurance: 6, luck: 3, wisdom: 3 },
    growth: { strength: 1.2, endurance: 1.1, luck: 0.4, wisdom: 0.4 },
    mods: { injuryResist: 5 }, preferred: ['combat', 'defense'], preferredBonus: 6,
    unlockTavernLevel: 0, tier: 0,
    names: ['Finn', 'Robin', 'Cade', 'Briar', 'Wren Ashfield'],
  },
  knight: {
    id: 'knight', name: 'Knight', blurb: 'Sworn, drilled, and reliable in a way freelancers rarely are. Cheap for what it brings.',
    baseStats: { strength: 6, endurance: 7, luck: 2, wisdom: 3 },
    growth: { strength: 1.15, endurance: 1.25, luck: 0.3, wisdom: 0.4 },
    mods: { injuryResist: 10 }, preferred: ['combat', 'defense'], preferredBonus: 8,
    unlockTavernLevel: 0, tier: 0,
    names: ['Sir Pip', 'Sir Bramble', 'Dame Orla', 'Sir Corwin', 'Dame Wren'],
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf Warrior', blurb: 'A wall with an axe. Almost impossible to put down, in no particular hurry.',
    baseStats: { strength: 7, endurance: 9, luck: 2, wisdom: 3 },
    growth: { strength: 1.1, endurance: 1.5, luck: 0.3, wisdom: 0.5 },
    mods: { injuryResist: 22, durability: 15, speed: -12 }, preferred: ['defense'], preferredBonus: 12,
    unlockTavernLevel: 1, tier: 1,
    names: ['Brenna', 'Durgan', 'Thora', 'Balin', 'Greta Stoneheel'],
  },
  gladiator: {
    id: 'gladiator', name: 'Gladiator', blurb: 'Sword, net, and a bow for the ones that run. Fast and greedy for spoils.',
    baseStats: { strength: 7, endurance: 5, luck: 6, wisdom: 3 },
    growth: { strength: 1.1, endurance: 0.8, luck: 1.0, wisdom: 0.4 },
    mods: { speed: 12, loot: 5, gold: 8 }, preferred: ['combat', 'explore'], preferredBonus: 8,
    unlockTavernLevel: 1, tier: 1,
    names: ['Marcus', 'Livia', 'Crixus', 'Vela', 'Otho the Swift'],
  },
  samurai: {
    id: 'samurai', name: 'Samurai', blurb: 'One clean strike. Prizes a perfect kill and the rare blade it earns.',
    baseStats: { strength: 9, endurance: 6, luck: 5, wisdom: 5 },
    growth: { strength: 1.4, endurance: 0.9, luck: 0.7, wisdom: 0.7 },
    mods: { success: 6, loot: 8 }, preferred: ['combat'], preferredBonus: 12,
    unlockTavernLevel: 2, tier: 2,
    names: ['Kaede', 'Hiroshi', 'Ayame', 'Takeshi', 'Rin of the Reed'],
  },
  witch: {
    id: 'witch', name: 'Witch', blurb: 'Hexes, bargains, and a nose for what a ruin is really worth. Fragile.',
    baseStats: { strength: 3, endurance: 4, luck: 8, wisdom: 8 },
    growth: { strength: 0.5, endurance: 0.6, luck: 1.3, wisdom: 1.3 },
    mods: { loot: 12, gold: 22, injuryResist: -10 }, preferred: ['arcane', 'stealth'], preferredBonus: 12,
    unlockTavernLevel: 2, tier: 2,
    names: ['Morwenna', 'Hazel', 'Sybil', 'Nettle', 'Old Agatha'],
  },
  lizardman: {
    id: 'lizardman', name: 'Lizardman', blurb: 'Scales, claws, and a swamp-born refusal to die. Little sense for coin.',
    baseStats: { strength: 8, endurance: 8, luck: 4, wisdom: 3 },
    growth: { strength: 1.3, endurance: 1.3, luck: 0.5, wisdom: 0.3 },
    mods: { success: 8, injuryResist: 15, gold: -12 }, preferred: ['combat', 'explore'], preferredBonus: 10,
    unlockTavernLevel: 3, tier: 3,
    names: ['Sythiss', 'Vorak', 'Xala', 'Threelk', 'Marsh-King Ozz'],
  },
  pyromancer: {
    id: 'pyromancer', name: 'Pyromancer', blurb: 'Answers every problem with fire. Devastating, and made of paper.',
    baseStats: { strength: 4, endurance: 3, luck: 5, wisdom: 10 },
    growth: { strength: 0.5, endurance: 0.4, luck: 0.8, wisdom: 1.7 },
    mods: { xp: 30, gold: 25, injuryResist: -15 }, preferred: ['arcane'], preferredBonus: 16,
    unlockTavernLevel: 3, tier: 3,
    names: ['Ignatia', 'Cinder', 'Ravan', 'Ember', 'Lord Vaylen'],
  },
  wizard: {
    id: 'wizard', name: 'Wizard', blurb: 'Decades of study in a pointed hat. Unmatched on anything arcane.',
    baseStats: { strength: 3, endurance: 4, luck: 5, wisdom: 12 },
    growth: { strength: 0.4, endurance: 0.6, luck: 0.7, wisdom: 1.9 },
    mods: { xp: 25, success: 5, loot: 6, injuryResist: -6 }, preferred: ['arcane', 'explore'], preferredBonus: 14,
    unlockTavernLevel: 4, tier: 3,
    names: ['Alaric', 'Merewyn', 'Cassius', 'Elspeth', 'Grand Magus Vorn'],
  },
};

export const RECRUIT_COST: Record<HeroClass, number> = {
  adventurer: 0, knight: 400,
  dwarf: 1200, gladiator: 1500,
  samurai: 5000, witch: 6500,
  lizardman: 16000, pyromancer: 20000, wizard: 32000,
};

/**
 * Higher-tier heroes are expensive, so they start ahead: a fresh hire begins at
 * this level with stat points already banked, rather than at level 1. Combined
 * with per-hero training gifts (bonusStats) this lets a late recruit stay
 * relevant instead of spending days catching up.
 */
export const RECRUIT_START_LEVEL: Record<number, number> = {
  0: 1, 1: 3, 2: 8, 3: 15,
};

/* -------------------------------- skins --------------------------------- */

export interface SkinDef {
  id: string;
  name: string;
  description: string;
  /** Flat gold price; every skin costs the same regardless of class. */
  cost: number;
  /** Small swatch colours for the shop UI. */
  swatch: [string, string];
}

export const SKIN_PRICE = 3500;

export const SKINS: SkinDef[] = [
  { id: 'original', name: 'Original', description: 'The colours they arrived in. Always owned.', cost: 0, swatch: ['#8e8e8e', '#c0c0c0'] },
  { id: 'necrotic', name: 'Necrotic', description: 'Graveyard greens and a violet pallor.', cost: SKIN_PRICE, swatch: ['#3aa55d', '#7a4fa0'] },
  { id: 'holy', name: 'Holy', description: 'Bleached white and gilded edges.', cost: SKIN_PRICE, swatch: ['#e9d8a0', '#bcd0e0'] },
  { id: 'infernal', name: 'Infernal', description: 'Ember reds banked over black.', cost: SKIN_PRICE, swatch: ['#c0331e', '#e07a2a'] },
  { id: 'frost', name: 'Frost', description: 'Glacier blues and pale teal.', cost: SKIN_PRICE, swatch: ['#5aa8d8', '#79c0c0'] },
];

export const SKIN_BY_ID: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/* ----------------------------- level curve ------------------------------ */

export function xpForLevel(level: number): number {
  return Math.floor(55 * Math.pow(level, 1.55));
}

export const PRESTIGE_MIN_LEVEL = 30;

/** Renown granted for retiring a hero at a given level. */
export function renownForRetirement(level: number, totalQuests: number): number {
  if (level < PRESTIGE_MIN_LEVEL) return 0;
  return Math.max(1, Math.floor(Math.pow(level - PRESTIGE_MIN_LEVEL + 1, 0.75) + totalQuests / 150));
}

/* ------------------------------ prestige streak ---------------------------- */

/** Retiring again within this window of the last retirement extends the streak. */
export const PRESTIGE_STREAK_WINDOW_MS = 72 * 60 * 60 * 1000; // 3 days
const PRESTIGE_STREAK_BONUS_PER_STEP = 5; // percent
const PRESTIGE_STREAK_BONUS_CAP = 50; // percent, reached at streak 11

/** Percentage bonus applied to renown gained, based on the current streak. */
export function prestigeStreakBonusPct(streak: number): number {
  return Math.min((Math.max(1, streak) - 1) * PRESTIGE_STREAK_BONUS_PER_STEP, PRESTIGE_STREAK_BONUS_CAP);
}

/* -------------------------------- ascension -------------------------------- */

/** Flat permanent stat bonus per ascension level, applied to every stat. */
export const ASCENSION_STAT_BONUS = 1;

const ASCENSION_RANKS: { min: number; name: string }[] = [
  { min: 10, name: 'Living Legend' },
  { min: 6, name: 'Elder' },
  { min: 3, name: 'Veteran' },
];

/** The rank label for a given ascension count, or null below the first threshold. */
export function ascensionRank(ascension: number): string | null {
  for (const rank of ASCENSION_RANKS) {
    if (ascension >= rank.min) return rank.name;
  }
  return null;
}
