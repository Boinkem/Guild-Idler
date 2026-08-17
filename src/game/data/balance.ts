import { DIFFICULTIES, DIFFICULTY_ORDER, DifficultyConfig } from './quests';
import { Difficulty } from '../types';
import { HOUR } from '../util';
import { Tuning } from './tuning';

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
 *  quest still pays a fraction of the roll, gold and xp at different rates.
 *  Both read from the tuning registry ('balance' category) now rather
 *  than being literals, same devtool-editable convention every other
 *  standalone numeric constant in this file is migrating to. */
const GOLD_FAILURE_MULTIPLIER = Tuning.get('balance.goldFailureMultiplier');
const XP_FAILURE_MULTIPLIER = Tuning.get('balance.xpFailureMultiplier');

/** Non-burst quests roll XP from this fixed base range before the tier's
 *  own xpMultiplier applies -- see QuestManager.generateOffer. */
const BASE_XP_MIN = Tuning.get('balance.baseXpMin');
const BASE_XP_MAX = Tuning.get('balance.baseXpMax');

/**
 * Exported (previously module-private) so the devtool's Sandbox sim
 * (tools/devtool/sim/runSim.ts) can reuse this exact expected-value
 * approximation instead of shipping a second copy of it -- see that file's
 * own header comment. No behavior change for any existing caller; every
 * in-file use below is unaffected by this becoming a named export.
 */
export function expectedRatePerHour(cfg: DifficultyConfig, kind: 'gold' | 'xp'): number {
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
const MIN_LEVEL_FOR_CAP = Tuning.get('balance.minLevelForCap');
/** Midpoint of the requested 80-85% range: clearly still worthwhile as a
 *  quick top-up, never the rational default strategy over the board. */
const BURST_CAP_FRACTION = Tuning.get('balance.burstCapFraction');

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

/**
 * A floor, not a ceiling -- the counterpart to fastQuestCapsPerHour above,
 * closing the "worthless reward" complaint that motivated adding this at
 * all. Anchored to the offer's OWN tier's rate (not the player's current
 * best-unlocked tier the way the cap is) -- a deliberately safe choice:
 * every tier's own rate is, by construction, no higher than any harder
 * tier's rate (DIFFICULTIES only gets more generous per hour going up),
 * so flooring an Easy offer at Easy's own rate can never let it out-earn
 * whatever the player's actual best-unlocked tier currently pays. This
 * was checked by direct simulation, not assumed: at every tested level
 * and every tested duration, `tierOwnRate(easy) <= expectedRatePerHour of
 * the real best-unlocked tier`, with equality only when Easy IS the best
 * tier (i.e. before level 5, when the cap doesn't even apply yet).
 *
 * This does NOT fully close the residual overshoot at the very shortest
 * durations (see QuestManager.generateOffer's own comment on why a
 * positive-integer floor divided by an arbitrarily short duration can
 * never be made airtight) -- it meaningfully shrinks it. That's a
 * confirmed, accepted tradeoff, not an oversight.
 */
export function fastQuestFloorPerHour(cfg: DifficultyConfig): { gold: number; xp: number } {
  return {
    gold: expectedRatePerHour(cfg, 'gold'),
    xp: expectedRatePerHour(cfg, 'xp'),
  };
}

/**
 * Burst/medium chance taper for the Easy tier, by hero level -- see
 * guild-idler-status.md's "Burst quest reward taper" writeup for the full
 * before/after numbers this was checked against. Burst's own duration is
 * short enough (2-8min) that even a level-appropriate live per-hour cap
 * (fastQuestCapsPerHour above) rounds down to a trivial 1 gold / 1-2 xp
 * once a hero is a handful of levels in -- confirmed directly against a
 * real playtest report, not assumed. Stretching burst's own duration
 * range doesn't fix this: the cap itself is the bottleneck, not the
 * rounding window, and a duration long enough to clear it (~20min+) is
 * just Medium's own range already. So the fix shifts weight away from
 * burst and toward Medium as a hero levels, rather than growing burst's
 * own duration -- Medium already produces healthy absolute numbers at
 * its 20-40min range with no changes needed there.
 *
 * Untouched through level 5, same onboarding-hook reasoning
 * MIN_LEVEL_FOR_CAP above already uses -- burst is still the deliberate
 * fast-turnaround hook for a brand new guild. From level 16 on, burst is
 * retired entirely (0% chance): by that point a hero has Hard and likely
 * Epic unlocked, and a sub-10-minute Easy quest can never pay a
 * respectable absolute reward under the live cap regardless of how it's
 * tuned, so the board stops offering it rather than offering something
 * that reads as broken.
 */
export function easyFastModeChances(level: number): { burstChance: number; mediumChance: number } {
  if (level <= 5) {
    return {
      burstChance: Tuning.get('quest.easyBurstChanceTier1'),
      mediumChance: Tuning.get('quest.easyMediumChanceTier1'),
    };
  }
  if (level <= 10) {
    return {
      burstChance: Tuning.get('quest.easyBurstChanceTier2'),
      mediumChance: Tuning.get('quest.easyMediumChanceTier2'),
    };
  }
  if (level <= 15) {
    return {
      burstChance: Tuning.get('quest.easyBurstChanceTier3'),
      mediumChance: Tuning.get('quest.easyMediumChanceTier3'),
    };
  }
  return {
    burstChance: Tuning.get('quest.easyBurstChanceTier4'),
    mediumChance: Tuning.get('quest.easyMediumChanceTier4'),
  };
}
