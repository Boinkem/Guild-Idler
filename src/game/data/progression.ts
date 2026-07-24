import { GuildDef, HeroClass, Modifiers, QuestTag, RenownPerkDef, Stats, UpgradeDef } from '../types';

/* --------------------------- permanent upgrades --------------------------- */

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'weapons_training', name: 'Better Weapons Training',
    description: 'Drill the fundamentals until they are boring.',
    baseCost: 200, costGrowth: 1.75, maxLevel: 10,
    modsPerLevel: { success: 5 },
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
    modsPerLevel: { loot: 5 },
  },
  {
    id: 'mounted_travel', name: 'Mounted Travel',
    description: 'A good horse shortens every road.',
    baseCost: 600, costGrowth: 2.0, maxLevel: 6,
    modsPerLevel: { speed: 10 },
  },
  {
    id: 'field_medicine', name: 'Field Medicine',
    description: 'Fewer injuries make it home with the knight.',
    baseCost: 350, costGrowth: 1.85, maxLevel: 8,
    modsPerLevel: { injuryResist: 8 },
  },
  {
    id: 'armourers_contract', name: "Armourer's Contract",
    description: 'Standing repairs mean gear lasts noticeably longer.',
    baseCost: 500, costGrowth: 1.9, maxLevel: 6,
    modsPerLevel: { durability: 10 },
  },
  {
    id: 'war_stories', name: 'War Stories',
    description: 'Every quest teaches more when it is retold properly.',
    baseCost: 450, costGrowth: 1.85, maxLevel: 8,
    modsPerLevel: { xp: 15 },
  },
  {
    id: 'master_adventurer', name: 'Master Adventurer',
    description: 'Unlocks Legendary contracts on the quest board.',
    baseCost: 5000, costGrowth: 1, maxLevel: 1,
    modsPerLevel: { success: 3 }, unlocks: 'legendaryQuests',
  },
  {
    id: 'guild_charter', name: 'Guild Charter',
    description: 'Unlocks multi-day quest chains.',
    baseCost: 3000, costGrowth: 1, maxLevel: 1,
    modsPerLevel: {}, unlocks: 'chains',
  },
];

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
  },
  {
    id: 'legacy_of_wealth', name: 'Legacy of Wealth',
    description: 'The guild coffers remember better days.',
    cost: 1, costGrowth: 1.6, maxLevel: 20, modsPerLevel: { gold: 15 },
  },
  {
    id: 'swift_legend', name: 'Swift Legend',
    description: 'Reputation opens gates that used to take days.',
    cost: 2, costGrowth: 1.7, maxLevel: 10, modsPerLevel: { speed: 5 },
  },
  {
    id: 'collectors_eye', name: "Collector's Eye",
    description: 'You know exactly what is worth carrying home.',
    cost: 2, costGrowth: 1.7, maxLevel: 12, modsPerLevel: { loot: 4 },
  },
  {
    id: 'enduring_legend', name: 'Enduring Legend',
    description: 'Heroes trained on your legend get hurt far less.',
    cost: 2, costGrowth: 1.65, maxLevel: 10, modsPerLevel: { injuryResist: 10 },
  },
  {
    id: 'extra_banner', name: 'Extra Banner',
    description: 'A permanent additional hero slot.',
    cost: 5, costGrowth: 2.2, maxLevel: 4, modsPerLevel: {}, heroSlotsPerLevel: 1,
  },
  {
    id: 'scholars_legacy', name: "Scholar's Legacy",
    description: 'New heroes learn from every campaign that came before.',
    cost: 1, costGrowth: 1.6, maxLevel: 15, modsPerLevel: { xp: 20 },
  },
];

export const RENOWN_BY_ID: Record<string, RenownPerkDef> = Object.fromEntries(RENOWN_PERKS.map((p) => [p.id, p]));

export function renownCost(def: RenownPerkDef, currentLevel: number): number {
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
  palette: { armor: string; trim: string; cloth: string };
  names: string[];
}

export const HERO_CLASSES: Record<HeroClass, HeroClassDef> = {
  knight: {
    id: 'knight', name: 'Knight', blurb: 'Dependable in a fight and hard to knock down.',
    baseStats: { strength: 6, endurance: 6, luck: 3, wisdom: 3 },
    growth: { strength: 1.2, endurance: 1.1, luck: 0.4, wisdom: 0.4 },
    mods: { injuryResist: 5 }, preferred: ['combat', 'defense'], preferredBonus: 6,
    unlockTavernLevel: 0,
    palette: { armor: '#b9c3d6', trim: '#d9a441', cloth: '#a33a3a' },
    names: ['Sir Pip', 'Sir Bramble', 'Dame Orla', 'Sir Corwin', 'Dame Wren'],
  },
  squire: {
    id: 'squire', name: 'Squire', blurb: 'Cheap, eager, and learns faster than anyone.',
    baseStats: { strength: 4, endurance: 4, luck: 4, wisdom: 4 },
    growth: { strength: 0.8, endurance: 0.8, luck: 0.8, wisdom: 0.8 },
    mods: { xp: 30, gold: -10 }, preferred: ['escort'], preferredBonus: 8,
    unlockTavernLevel: 1,
    palette: { armor: '#9aa0a8', trim: '#c9b27a', cloth: '#4f7a58' },
    names: ['Tam', 'Nessa', 'Bertie', 'Ilse', 'Cob'],
  },
  archer: {
    id: 'archer', name: 'Archer', blurb: 'Ends fights from a comfortable distance.',
    baseStats: { strength: 5, endurance: 4, luck: 6, wisdom: 4 },
    growth: { strength: 0.9, endurance: 0.7, luck: 1.1, wisdom: 0.5 },
    mods: { speed: 10, loot: 3 }, preferred: ['combat', 'explore'], preferredBonus: 7,
    unlockTavernLevel: 2,
    palette: { armor: '#6f8f5f', trim: '#c9b27a', cloth: '#3f5a45' },
    names: ['Fenn', 'Alys', 'Roe', 'Sparrow', 'Hale'],
  },
  rogue: {
    id: 'rogue', name: 'Rogue', blurb: 'Brings back more than the contract specified.',
    baseStats: { strength: 4, endurance: 4, luck: 8, wisdom: 4 },
    growth: { strength: 0.7, endurance: 0.6, luck: 1.4, wisdom: 0.6 },
    mods: { gold: 20, loot: 6, injuryResist: -5 }, preferred: ['stealth', 'explore'], preferredBonus: 10,
    unlockTavernLevel: 3,
    palette: { armor: '#4b4a5c', trim: '#8d7fb0', cloth: '#2b2a38' },
    names: ['Quill', 'Sable', 'Nix', 'Mira', 'Dusk'],
  },
  mage: {
    id: 'mage', name: 'Mage', blurb: 'Unmatched on arcane work, fragile everywhere else.',
    baseStats: { strength: 3, endurance: 3, luck: 5, wisdom: 9 },
    growth: { strength: 0.4, endurance: 0.5, luck: 0.8, wisdom: 1.6 },
    mods: { xp: 20, loot: 5, injuryResist: -8 }, preferred: ['arcane'], preferredBonus: 14,
    unlockTavernLevel: 4,
    palette: { armor: '#4d5aa8', trim: '#d9a441', cloth: '#2a2f5c' },
    names: ['Elowen', 'Vesper', 'Calder', 'Isolde', 'Aster'],
  },
  paladin: {
    id: 'paladin', name: 'Paladin', blurb: 'Slow, expensive, and almost impossible to stop.',
    baseStats: { strength: 7, endurance: 8, luck: 3, wisdom: 6 },
    growth: { strength: 1.1, endurance: 1.4, luck: 0.4, wisdom: 0.8 },
    mods: { injuryResist: 20, success: 5, speed: -10 }, preferred: ['defense', 'arcane'], preferredBonus: 8,
    unlockTavernLevel: 5,
    palette: { armor: '#e6dcc3', trim: '#d9a441', cloth: '#8d6bb0' },
    names: ['Ser Aldwin', 'Dame Solene', 'Ser Halric', 'Dame Iseult'],
  },
};

export const RECRUIT_COST: Record<HeroClass, number> = {
  knight: 0, squire: 800, archer: 2500, rogue: 6000, mage: 14000, paladin: 30000,
};

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
