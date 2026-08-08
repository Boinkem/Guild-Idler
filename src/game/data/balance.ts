import { DIFFICULTIES, DIFFICULTY_ORDER, DifficultyConfig } from './quests';
import { Difficulty } from '../types';
import { HOUR } from '../util';

/**
 * Replaces the old flat burstTaper(topLevel) curve in QuestManager with a
 * live cap computed directly from DIFFICULTIES, separately for gold and
 * XP. The flat curve had two confirmed problems: its floor (0.2) never
 * actually dropped burst below the best unlocked tier until very late,
 * making burst-spamming the mathematically dominant strategy from level 1
 * to roughly 25-30; and a single shared curve couldn't correctly gate both
 * currencies at once, since legendary quests are gold-heavy but XP-light
 * relative to hard/epic -- tightening the curve for XP purposes measurably
 * loosened effective gold-farming speed in testing.
 *
 * Tying the cap to live tier data instead of a fixed curve also means it
 * self-corrects if DIFFICULTIES changes later (bump hard's maxGold, the
 * cap recalculates) without needing to re-derive a curve by hand.
 */

/** Matches QuestManager.resolve's actual failure payout exactly -- a failed
 *  quest still pays a fraction of the roll, gold and xp at different rates. */
const GOLD_FAILURE_MULTIPLIER = 0.15;
const XP_FAILURE_MULTIPLIER = 0.3;

/** Non-burst quests roll XP from this fixed base range before the tier's
 *  own xpMultiplier applies -- see QuestManager.generateOffer. */
const BASE_XP_MIN = 18;
const BASE_XP_MAX = 30;

function expectedRatePerHour(cfg: DifficultyConfig, kind: 'gold' | 'xp'): number {
  const avgDurationHours = (cfg.minDuration + cfg.maxDuration) / 2 / HOUR;
  const successRate = cfg.baseSuccess / 100;
  const avgReward = kind === 'gold'
    ? (cfg.minGold + cfg.maxGold) / 2
    : ((BASE_XP_MIN + BASE_XP_MAX) / 2) * cfg.xpMultiplier;
  const failureMultiplier = kind === 'gold' ? GOLD_FAILURE_MULTIPLIER : XP_FAILURE_MULTIPLIER;
  const expectedReward = successRate * avgReward + (1 - successRate) * failureMultiplier * avgReward;
  return expectedReward / avgDurationHours;
}

/** Highest difficulty tier currently available at a given level -- same
 *  eligibility rule QuestManager.generateContractsForHero already uses
 *  (level + 2 >= reqLevel, legendary additionally gated by its unlock).
 *  Called with a specific hero's own level, not the guild's top hero. */
export function bestUnlockedTier(topLevel: number, legendaryUnlocked: boolean): Difficulty {
  let best: Difficulty = 'easy';
  for (const id of DIFFICULTY_ORDER) {
    if (id === 'legendary' && !legendaryUnlocked) continue;
    if (topLevel + 2 >= DIFFICULTIES[id].reqLevel) best = id;
  }
  return best;
}

/** Below this level, burst keeps its full, uncapped reward -- the
 *  deliberate onboarding hook, confirmed not to be the problem. */
const MIN_LEVEL_FOR_CAP = 5;
/** Midpoint of the requested 80-85% range: clearly still worthwhile as a
 *  quick top-up, never the rational default strategy over the board. */
const BURST_CAP_FRACTION = 0.825;

/**
 * Shared by both fast-completion modes (burst AND medium -- see
 * DifficultyConfig's own comment on mediumChance for why medium needs the
 * same guardrail burst already has). Kept as one function/one cap fraction
 * rather than two separate curves: both modes exist for the same reason
 * (an explicit, generous-feeling reward range reads better than a
 * proportional slice of the full range), so both need the same protection
 * against becoming the dominant strategy once out-leveled.
 */
export function fastQuestCapsPerHour(topLevel: number, legendaryUnlocked: boolean): { gold: number; xp: number } {
  if (topLevel < MIN_LEVEL_FOR_CAP) return { gold: Infinity, xp: Infinity };
  const tier = DIFFICULTIES[bestUnlockedTier(topLevel, legendaryUnlocked)];
  return {
    gold: BURST_CAP_FRACTION * expectedRatePerHour(tier, 'gold'),
    xp: BURST_CAP_FRACTION * expectedRatePerHour(tier, 'xp'),
  };
}
