import { GameState } from './types';
import { HeroManager } from './managers/HeroManager';

/**
 * Every source contributes at this same "1 level/perk = 20 points" rate --
 * vendor upgrades, guild facilities, renown perks, and raid upgrades are
 * all conceptually the same thing (spend a resource, permanently improve
 * the guild), so they're weighted identically rather than each needing
 * its own tuned number.
 */
const UPGRADE_LEVEL_WEIGHT = 20;
const CHAIN_WEIGHT = 100;
/** Gear Score feeds Guild Power 1:1 with raw hero stat points -- see power.ts docs. */
const GEAR_SCORE_WEIGHT = 1;
const ASCENSION_WEIGHT = 30;

export interface GuildPowerBreakdown {
  /** Sum of every hero's strength+endurance+luck+wisdom (base + gear + bonus stats). */
  heroStats: number;
  /** Sum of every hero's per-item Gear Score (see gearScoreForItem in data/equipment.ts). */
  gearScore: number;
  /** Ascension stacks from retired heroes. Deliberately uncapped -- see guildPowerCeiling(). */
  ascension: number;
  facilities: number;
  vendorUpgrades: number;
  raidUpgrades: number;
  renownPerks: number;
  completedChains: number;
  total: number;
}

/**
 * A single aggregated "how far has this guild come" number, combining
 * every progress system rather than just one dimension. Purely derived
 * from existing state; nothing new to save.
 *
 * IMPORTANT: renown perks are counted by LEVELS OWNED (state.renownPerks),
 * never by the spendable state.renown currency balance. Renown is earned
 * by retiring and spent buying perks -- if we counted the balance, buying
 * a perk would make Guild Power go DOWN, which is exactly backwards.
 */
export function guildPowerBreakdown(state: GameState): GuildPowerBreakdown {
  let heroStats = 0;
  let gearScore = 0;
  let ascension = 0;

  for (const hero of state.heroes) {
    const stats = HeroManager.totalStats(hero);
    heroStats += stats.strength + stats.endurance + stats.luck + stats.wisdom;
    gearScore += HeroManager.gearScore(hero) * GEAR_SCORE_WEIGHT;
    ascension += hero.ascension * ASCENSION_WEIGHT;
  }

  const facilities = Object.values(state.guild).reduce((sum, lvl) => sum + lvl, 0) * UPGRADE_LEVEL_WEIGHT;
  const vendorUpgrades = Object.values(state.upgrades).reduce((sum, lvl) => sum + lvl, 0) * UPGRADE_LEVEL_WEIGHT;
  const raidUpgrades = Object.values(state.raidUpgrades).reduce((sum, lvl) => sum + lvl, 0) * UPGRADE_LEVEL_WEIGHT;
  const renownPerks = Object.values(state.renownPerks).reduce((sum, lvl) => sum + lvl, 0) * UPGRADE_LEVEL_WEIGHT;
  const completedChains = state.completedChains.length * CHAIN_WEIGHT;

  const total = heroStats + gearScore + ascension + facilities + vendorUpgrades + raidUpgrades + renownPerks + completedChains;

  return {
    heroStats, gearScore, ascension, facilities, vendorUpgrades, raidUpgrades, renownPerks, completedChains,
    total: Math.floor(total),
  };
}

export function guildPowerLevel(state: GameState): number {
  return guildPowerBreakdown(state).total;
}

/**
 * The finite ceiling of Guild Power at "everything unlocked, every hero
 * slot filled with a level-55 hero in full legendary gear, every upgrade
 * tree maxed, every chain complete" -- used only to size the rank bands
 * in guildRank.ts. Deliberately EXCLUDES ascension: retirement stacks are
 * uncapped by design (that's the point -- see PrestigeManager.retire), so
 * counting them here would make the ceiling a moving target. Ascension is
 * instead what carries a guild from "max rank" into the "Ascended" band.
 *
 * Hand-verified against current content rather than computed live from
 * every data file, since several of those numbers (average stat growth
 * across hero classes, effective renown-perk caps including tier2) don't
 * reduce to a single clean formula. Re-derive this if hero slots, gear
 * slots, upgrade trees, or chain count change meaningfully:
 *
 *   heroes:       10 slots x ~212 avg stat total at level 55         = 2,120
 *   gear score:   10 slots x 9 gear slots x 30 (legendary)           = 2,700
 *   upgrades:     254 total levels (79 vendor + 47 facilities
 *                 + 114 renown incl. tier2 + 14 raid) x 20           = 5,080
 *   chains:       20 chains x 100                                   = 2,000
 *   ------------------------------------------------------------------------
 *   ceiling                                                         = 9,900
 */
export const GUILD_POWER_CEILING = 9_900;

/**
 * Level tiers echo the same colour language as equipment rarity (see
 * RARITY_COLOR in util.ts) -- a level-50 hero's ring glows the same amber as
 * a legendary weapon, reinforcing "you've become that" rather than
 * introducing a second, unrelated colour system to learn.
 */
export function levelTierColor(level: number): string {
  if (level >= 50) return '#d9a441'; // legendary
  if (level >= 35) return '#a874d6'; // epic
  if (level >= 20) return '#5b8fd6'; // rare
  if (level >= 10) return '#79a86b'; // uncommon
  return '#b9ad93'; // common
}

export function levelTierName(level: number): string {
  if (level >= 50) return 'Legendary';
  if (level >= 35) return 'Epic';
  if (level >= 20) return 'Rare';
  if (level >= 10) return 'Uncommon';
  return 'Common';
}
