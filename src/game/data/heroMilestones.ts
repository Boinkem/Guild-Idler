import { GameState, HeroClass } from '../types';
import { chainReplayBandComplete } from './chainReplay';

/**
 * Alternate unlock conditions for the four tier-4 heroes (patch 0251) --
 * see HeroClassDef.milestoneUnlockDescription/milestoneGoldCost's own
 * comment in progression.ts for the full reasoning on why this is a small
 * set of hardcoded checks rather than a generic data-driven condition
 * shape, same "authored, not data-driven" precedent GuidanceManager's own
 * CHECKS map already established for a similar one-off-per-id situation.
 *
 * A class with no entry here simply has no milestone path -- every
 * base-game class through patch 0250 falls into that bucket, gated purely
 * by Tavern level as before. Read via heroMilestoneUnlocked below, never
 * this map directly, so a missing entry and a present-but-false check both
 * correctly resolve to "not unlocked" without every caller needing its own
 * `?? false`.
 */
const HERO_MILESTONE_CHECKS: Partial<Record<HeroClass, (state: GameState) => boolean>> = {
  // Huge Knight: any raid, any raid, full-cleared at Legendary difficulty
  // at least once. completedRaidDifficulties already tracks exactly this
  // (see its own comment in types.ts) -- confirmed before reaching for a
  // new counter, so this needed zero new state.
  huge_knight: (state) => state.completedRaidDifficulties.includes('legendary'),
  // Kobold: every chain in the Founding Days replay band (band1) cleared
  // at Legendary at least once. Reuses the same chainReplayBandComplete
  // helper the new Replay Memories "% complete" display is built on --
  // Kobold's milestone is just "band1 legendary == 100%" read through
  // that same function, not a separate check.
  kobold: (state) => chainReplayBandComplete(state, 'band1', 'legendary'),
  // Minotaur: retire a hero for the first time. stats.prestigeCount
  // already exists and increments on every retirement (PrestigeManager.
  // retire) -- also needed zero new state.
  minotaur: (state) => state.stats.prestigeCount >= 1,
  // Werewolf: complete the new Kindred Moon chain (see quest-chains.json,
  // gated behind full_moon_over_ashvale). completedChains is the same
  // list every other "has this chain been finished" check in the game
  // already reads.
  werewolf: (state) => state.completedChains.includes('kindred_moon'),
};

/** True if this class's milestone condition (if it has one) is currently
 *  met. False for a class with no milestoneUnlock at all -- see this
 *  file's own top comment for why that's the correct default rather than
 *  every caller needing its own fallback. */
export function heroMilestoneUnlocked(state: GameState, heroClass: HeroClass): boolean {
  const check = HERO_MILESTONE_CHECKS[heroClass];
  return check ? check(state) : false;
}
