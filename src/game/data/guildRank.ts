import { GameState } from '../types';
import { QUEST_CHAINS } from './quests';

export interface GuildRankTier {
  id: string;
  name: string;
  /** Minimum reqLevel among completed chains needed to reach this tier. */
  minReqLevel: number;
  blurb: string;
}

/**
 * Guild-wide rank, distinct from a hero's individual `ascension` count.
 * Derived from the highest reqLevel among completed quest chains, since that
 * persists across hero retirements/resets the same way `completedChains`
 * does -- unlike hero level, which resets to 1 on prestige.
 *
 * Thresholds are mapped onto the existing QUEST_CHAINS reqLevel curve:
 * "Actors of Greater Calls" lands on proving_the_bastion (reqLevel 16), the
 * chain where the guild stops being purely freelance; "Ascended" triggers on
 * unlocking (not completing) the first capstone tier at reqLevel 34.
 */
export const GUILD_RANK_TIERS: GuildRankTier[] = [
  {
    id: 'freelance_operators', name: 'Freelance Operators', minReqLevel: 0,
    blurb: 'Whatever is on the board, whoever is free to take it.',
  },
  {
    id: 'professional_contractors', name: 'Professional Contractors', minReqLevel: 8,
    blurb: 'Reputable enough that the work keeps finding the guild first.',
  },
  {
    id: 'actors_of_greater_calls', name: 'Actors of Greater Calls', minReqLevel: 15,
    blurb: 'Asked directly, now, rather than posted to a board.',
  },
  {
    id: 'realms_influence', name: "A Realm's Influence", minReqLevel: 18,
    blurb: 'Territory held, not just visited.',
  },
  {
    id: 'realms_protector', name: "A Realm's Protector", minReqLevel: 32,
    blurb: 'The thing standing between the Reach and what comes for it.',
  },
  {
    id: 'ascended', name: 'Ascended', minReqLevel: 34,
    blurb: 'Known throughout, for reasons nobody has to explain twice.',
  },
];

/** Highest chain reqLevel among all completed chains, or 0 if none completed yet. */
export function highestCompletedReqLevel(state: GameState): number {
  let highest = 0;
  for (const id of state.completedChains) {
    const chain = QUEST_CHAINS.find((c) => c.id === id);
    if (chain && chain.reqLevel > highest) highest = chain.reqLevel;
  }
  return highest;
}

/** The guild's current rank tier, derived from completed chains. */
export function currentGuildRank(state: GameState): GuildRankTier {
  const level = highestCompletedReqLevel(state);
  let rank = GUILD_RANK_TIERS[0];
  for (const tier of GUILD_RANK_TIERS) {
    if (level >= tier.minReqLevel) rank = tier;
  }
  return rank;
}

/** The next tier up, or null if already at the highest (Ascended). */
export function nextGuildRank(state: GameState): GuildRankTier | null {
  const current = currentGuildRank(state);
  const index = GUILD_RANK_TIERS.findIndex((t) => t.id === current.id);
  return GUILD_RANK_TIERS[index + 1] ?? null;
}
