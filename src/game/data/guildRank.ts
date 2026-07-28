import { GameState } from '../types';
import { QUEST_CHAINS } from './quests';

export interface GuildRankTier {
  id: string;
  name: string;
  /** Minimum effective level (see effectiveGuildLevel) needed to reach this tier. */
  minLevel: number;
  blurb: string;
}

/**
 * Guild-wide rank, distinct from a hero's individual `ascension` count or the
 * per-hero level-color tiers in power.ts. Thresholds are mapped onto the
 * existing QUEST_CHAINS reqLevel curve: "Actors of Greater Calls" lands on
 * proving_the_bastion (reqLevel 16), the chain where the guild stops being
 * purely freelance; "Ascended" triggers at reqLevel 34, matching the first
 * capstone chain (world_ender).
 */
export const GUILD_RANK_TIERS: GuildRankTier[] = [
  {
    id: 'freelance_operators', name: 'Freelance Operators', minLevel: 0,
    blurb: 'Whatever is on the board, whoever is free to take it.',
  },
  {
    id: 'professional_contractors', name: 'Professional Contractors', minLevel: 8,
    blurb: 'Reputable enough that the work keeps finding the guild first.',
  },
  {
    id: 'actors_of_greater_calls', name: 'Actors of Greater Calls', minLevel: 15,
    blurb: 'Asked directly, now, rather than posted to a board.',
  },
  {
    id: 'realms_influence', name: "A Realm's Influence", minLevel: 18,
    blurb: 'Territory held, not just visited.',
  },
  {
    id: 'realms_protector', name: "A Realm's Protector", minLevel: 32,
    blurb: 'The thing standing between the Reach and what comes for it.',
  },
  {
    id: 'ascended', name: 'Ascended', minLevel: 34,
    blurb: 'Known throughout, for reasons nobody has to explain twice.',
  },
];

/** Highest chain reqLevel among all completed chains, or 0 if none completed yet. */
function highestCompletedReqLevel(state: GameState): number {
  let highest = 0;
  for (const id of state.completedChains) {
    const chain = QUEST_CHAINS.find((c) => c.id === id);
    if (chain && chain.reqLevel > highest) highest = chain.reqLevel;
  }
  return highest;
}

/**
 * The level used to place the guild in a rank tier. Combines two signals so
 * "Ascended" can trigger the moment a hero reaches capstone level (matching
 * "starts doing capstone quests", not "finishes one") while never regressing
 * once a chain has actually been completed at that tier: completedChains
 * only ever grows, so it acts as a floor even if the hero who reached that
 * level later retires and resets.
 */
export function effectiveGuildLevel(state: GameState): number {
  const chainLevel = highestCompletedReqLevel(state);
  const heroLevel = state.heroes.reduce((max, h) => Math.max(max, h.level), 0);
  return Math.max(chainLevel, heroLevel);
}

/** The guild's current rank tier. */
export function currentGuildRank(state: GameState): GuildRankTier {
  const level = effectiveGuildLevel(state);
  let rank = GUILD_RANK_TIERS[0];
  for (const tier of GUILD_RANK_TIERS) {
    if (level >= tier.minLevel) rank = tier;
  }
  return rank;
}

/** The next tier up, or null if already at the highest (Ascended). */
export function nextGuildRank(state: GameState): GuildRankTier | null {
  const current = currentGuildRank(state);
  const index = GUILD_RANK_TIERS.findIndex((t) => t.id === current.id);
  return GUILD_RANK_TIERS[index + 1] ?? null;
}
