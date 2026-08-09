import { GameState } from '../types';
import { QUEST_CHAINS } from './quests';
import { guildPowerLevel, GUILD_POWER_CEILING } from '../power';

export interface GuildRankTier {
  id: string;
  name: string;
  blurb: string;
  /**
   * Reuses the same rarity palette as power.ts's per-hero level tiers, so a
   * chain's edge glow in the Lore tab reads as the same visual language
   * used elsewhere rather than introducing a second colour system. Ascended
   * gets a colour of its own (crimson) rather than reusing "legendary",
   * since it's meant to read as distinct even from the tier just below it.
   */
  color: string;
}

/**
 * Guild-wide rank names/blurbs/colours, shared by two different threshold
 * scales below: individual quest chains are tiered by their own reqLevel
 * (0-34, see rankTierForLevel), while the guild's own rank is tiered by
 * total Guild Power (0-GUILD_POWER_CEILING, see currentGuildRank). Same six
 * labels either way -- only the number being measured differs.
 */
export const GUILD_RANK_TIERS: GuildRankTier[] = [
  {
    id: 'freelance_operators', name: 'Freelance Operators',
    blurb: 'Whatever is on the board, whoever is free to take it.',
    color: '#b9ad93',
  },
  {
    id: 'professional_contractors', name: 'Professional Contractors',
    blurb: 'Reputable enough that the work keeps finding the guild first.',
    color: '#79a86b',
  },
  {
    id: 'actors_of_greater_calls', name: 'Actors of Greater Calls',
    blurb: 'Asked directly, now, rather than posted to a board.',
    color: '#5b8fd6',
  },
  {
    id: 'realms_influence', name: "A Realm's Influence",
    blurb: 'Territory held, not just visited.',
    color: '#a874d6',
  },
  {
    id: 'realms_protector', name: "A Realm's Protector",
    blurb: 'The thing standing between the Reach and what comes for it.',
    color: '#d9a441',
  },
  {
    id: 'ascended', name: 'Ascended',
    blurb: 'Known throughout, for reasons nobody has to explain twice.',
    color: '#d64f4f',
  },
];

/**
 * Thresholds for CHAIN reqLevel tiering (a single chain's own difficulty,
 * 0-34), unrelated to guild rank. "Actors of Greater Calls" lands on
 * proving_the_bastion (reqLevel 16); "Ascended" triggers at reqLevel 34,
 * matching the first capstone chain (world_ender). Index-aligned with
 * GUILD_RANK_TIERS.
 */
const CHAIN_LEVEL_THRESHOLDS = [0, 8, 15, 18, 32, 34];

/** The rank tier a given chain reqLevel falls into. Used by the Lore tab
 * to colour individual chains -- NOT the guild's own rank, see below. */
export function rankTierForLevel(level: number): GuildRankTier {
  let index = 0;
  for (let i = 0; i < CHAIN_LEVEL_THRESHOLDS.length; i++) {
    if (level >= CHAIN_LEVEL_THRESHOLDS[i]) index = i;
  }
  return GUILD_RANK_TIERS[index];
}

/**
 * Thresholds for GUILD rank tiering, evenly spaced across
 * GUILD_POWER_CEILING (see power.ts for how that ceiling is derived).
 * A brand-new guild sits at 0/9,900 -> Freelance Operators. A single
 * level-55 hero with nothing else invested sits at roughly 550/9,900 --
 * still comfortably Freelance Operators, not Ascended, which is the bug
 * this replaces (guild rank used to be driven off a single hero's level
 * alone). "Ascended" is reserved for actually reaching the ceiling --
 * from there, further ascension stacks (uncapped, see power.ts) are the
 * only thing left to grow.
 */
const GUILD_RANK_POWER_THRESHOLDS = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(
  (fraction) => Math.round(fraction * GUILD_POWER_CEILING),
);

/** The rank tier a given Guild Power total falls into. */
export function guildRankTierForPower(power: number): GuildRankTier {
  let index = 0;
  for (let i = 0; i < GUILD_RANK_POWER_THRESHOLDS.length; i++) {
    if (power >= GUILD_RANK_POWER_THRESHOLDS[i]) index = i;
  }
  return GUILD_RANK_TIERS[index];
}

/** Guild Power required to reach a given rank tier index, or null if out of range. */
function powerThresholdForIndex(index: number): number | null {
  return GUILD_RANK_POWER_THRESHOLDS[index] ?? null;
}

/** Highest chain reqLevel among all completed chains, or 0 if none completed yet.
 *  Kept only as a display aid (e.g. lore progress), not part of guild rank anymore. */
export function highestCompletedReqLevel(state: GameState): number {
  let highest = 0;
  for (const id of state.completedChains) {
    const chain = QUEST_CHAINS.find((c) => c.id === id);
    if (chain && chain.reqLevel > highest) highest = chain.reqLevel;
  }
  return highest;
}

/** The guild's current rank tier, driven by total Guild Power. */
export function currentGuildRank(state: GameState): GuildRankTier {
  return guildRankTierForPower(guildPowerLevel(state));
}

/** The next tier up, or null if already at the highest (Ascended). */
export function nextGuildRank(state: GameState): GuildRankTier | null {
  const current = currentGuildRank(state);
  const index = GUILD_RANK_TIERS.findIndex((t) => t.id === current.id);
  return GUILD_RANK_TIERS[index + 1] ?? null;
}

/** Guild Power still needed to reach the next rank, or null if already at the highest. */
export function powerToNextRank(state: GameState): number | null {
  const current = currentGuildRank(state);
  const index = GUILD_RANK_TIERS.findIndex((t) => t.id === current.id);
  const nextThreshold = powerThresholdForIndex(index + 1);
  if (nextThreshold === null) return null;
  return Math.max(0, nextThreshold - guildPowerLevel(state));
}
