import { DIFFICULTIES, DIFFICULTY_ORDER, DifficultyConfig } from './quests';
import { Difficulty } from '../types';
import { HOUR } from '../util';
import { Tuning } from './tuning';
import { questGoldBaseline, questXpBaseline } from './progression';

/**
 * Patch 0332 retired this file's old burst/medium per-hour cap/floor/
 * taper system (fastQuestCapsPerHour, fastQuestFloorPerHour,
 * easyFastModeChances) entirely -- direct feedback that the guardrail
 * stack itself, not any one number in it, was the recurring problem
 * (four separate systems all fighting the same "burst became the
 * mathematically dominant strategy" fire). Fast quests
 * (QuestManager.generateOffer) now use the same reward formula every
 * other quest does, time-scaled and rarity-gated instead of a separate
 * hand-tuned mini-economy -- see quests.ts's own DifficultyConfig.
 * fastChance comment and guild-idler-status.md's patch 0332 writeup for
 * the full redesign. `bestUnlockedTier`/`expectedRatePerHour` below both
 * survive that removal -- bestUnlockedTier is still load-bearing for
 * HarvestManager.sellGoldPerHourTarget's Trade Route cap (unrelated to
 * quests entirely), and expectedRatePerHour for that same caller plus
 * the DevTool's Balance Sandbox sim's own income-curve estimates.
 */

/** Matches QuestManager.resolve's actual failure payout exactly -- a failed
 *  quest still pays a fraction of the roll, gold and xp at different rates.
 *  Both read from the tuning registry ('balance' category) now rather
 *  than being literals, same devtool-editable convention every other
 *  standalone numeric constant in this file is migrating to. */
const GOLD_FAILURE_MULTIPLIER = Tuning.get('balance.goldFailureMultiplier');
const XP_FAILURE_MULTIPLIER = Tuning.get('balance.xpFailureMultiplier');

/**
 * Exported (previously module-private) so the devtool's Sandbox sim
 * (tools/devtool/sim/runSim.ts) can reuse this exact expected-value
 * approximation instead of shipping a second copy of it -- see that file's
 * own header comment. No behavior change for any existing caller; every
 * in-file use below is unaffected by this becoming a named export.
 */
/**
 * `atLevel` lets a caller estimate this tier's rate for a hero at a
 * SPECIFIC level, rather than the tier's own fixed `referenceLevel` --
 * needed for anything tracking a leveling hero's actual income over time
 * (the Balance Sandbox sim, HarvestManager.sellGoldPerHourTarget), since
 * reward now scales continuously with the rolled reqLevel (near
 * hero.level, patch 0214), not with a fixed per-tier constant. Defaults
 * to `cfg.referenceLevel` when omitted -- see this function's own
 * callers for which is which. Found and fixed while auditing reward-
 * scaling consistency (patch 0217): the Balance Sandbox sim was calling
 * this with no `atLevel`, silently pinning every tier's income estimate
 * to its referenceLevel forever regardless of how high the simulated
 * hero actually leveled, which would have made the "days to level 55"
 * simulation meaningless post-patch-0214 without this.
 */
export function expectedRatePerHour(cfg: DifficultyConfig, kind: 'gold' | 'xp', atLevel?: number): number {
  const avgDurationHours = (cfg.minDuration + cfg.maxDuration) / 2 / HOUR;
  const successRate = cfg.baseSuccess / 100;
  const level = atLevel ?? cfg.referenceLevel;
  // Standard reward no longer reads a flat minGold/maxGold range (patch
  // 0214) -- estimated here off the same level-scaled baseline curve
  // QuestManager.generateOffer actually rolls against. The old
  // xpMin/xpMax base range (BASE_XP_MIN/MAX) is no longer part of the
  // standard-offer xp roll either, only questXpBaseline is.
  const avgReward = kind === 'gold'
    ? questGoldBaseline(level) * cfg.rewardMultiplier
    : questXpBaseline(level) * cfg.rewardMultiplier;
  const failureMultiplier = kind === 'gold' ? GOLD_FAILURE_MULTIPLIER : XP_FAILURE_MULTIPLIER;
  const expectedReward = successRate * avgReward + (1 - successRate) * failureMultiplier * avgReward;
  return expectedReward / avgDurationHours;
}

/**
 * Highest difficulty tier currently "available" at a given level.
 * Formerly also used by the burst/medium fast-quest per-hour cap system,
 * retired in patch 0332 (see this file's own header comment) -- its one
 * remaining caller is HarvestManager.sellGoldPerHourTarget, unrelated to
 * quests, which still needs "what does a hero currently earn at the
 * guild's own best-unlocked tier" as its Trade Route gold-per-hour
 * target. Reads each tier's `referenceLevel` (a "typical level for this
 * tier" heuristic, see DifficultyConfig's own comment) purely as that --
 * quest offers themselves have had no difficulty-based level gate since
 * patch 0214. Called with a specific hero's own level, not the guild's
 * top hero, by that one remaining caller.
 */
export function bestUnlockedTier(topLevel: number, legendaryUnlocked: boolean): Difficulty {
  let best: Difficulty = 'easy';
  for (const id of DIFFICULTY_ORDER) {
    if (id === 'legendary' && !legendaryUnlocked) continue;
    if (topLevel + 2 >= DIFFICULTIES[id].referenceLevel) best = id;
  }
  return best;
}

/** Reward floor (patch 0325) -- fraction/absolute-minimum pair, see
 *  rewardPayoutFloor's own comment for what these actually fix. */
const REWARD_FLOOR_FRACTION_GOLD = Tuning.get('balance.rewardFloorFractionGold');
const REWARD_FLOOR_FRACTION_XP = Tuning.get('balance.rewardFloorFractionXp');
const REWARD_FLOOR_MIN_GOLD = Tuning.get('balance.rewardFloorMinGold');
const REWARD_FLOOR_MIN_XP = Tuning.get('balance.rewardFloorMinXp');

/**
 * A final, last-mile floor on top of everything else in this file --
 * closes the specific "1 gold, 0 xp" complaint reported directly, which
 * fastQuestFloorPerHour above does NOT actually prevent by itself.
 * fastQuestFloorPerHour only floors the OFFER's own rewardGold/rewardXp at
 * generation time (what a quest is listed as paying); QuestManager.resolve
 * then multiplies that by a success/failure factor -- 100%-ish on success,
 * but a flat 15% (gold) / 30% (xp) consolation on failure -- and a small
 * pre-floored offer reward (say 6 gold, 2 xp, already the legitimate
 * generation-time minimum for a short/low-tier quest) can still round all
 * the way down to 1 gold and 0 xp once that failure multiplier and
 * Math.floor are applied. That gap, not the generation-time floor, is what
 * a "reward floor" request is actually about.
 *
 * Deliberately keyed off the OFFER's own already-computed rewardGold/
 * rewardXp (not a fresh level-based curve) so this can never fight the
 * burst/medium anti-dominant-strategy cap (fastQuestCapsPerHour) the way
 * an independent level curve could -- whatever the offer's own reward
 * ended up being, after every existing cap/floor/taper already ran, this
 * only ever guarantees the player actually RECEIVES a meaningful fraction
 * of that number, never more than the number itself already implies.
 * Applied identically to success and failure in QuestManager.resolve, right
 * after failure's own 15%/30% cut -- a success reward is essentially always
 * already well above this floor and is never reduced by it (Math.max only
 * ever raises), so this is functionally a failure/rounding-edge-case fix,
 * not a broad reward buff.
 */
export function rewardPayoutFloor(offerRewardGold: number, offerRewardXp: number): { gold: number; xp: number } {
  return {
    gold: Math.max(REWARD_FLOOR_MIN_GOLD, Math.round(offerRewardGold * REWARD_FLOOR_FRACTION_GOLD)),
    xp: Math.max(REWARD_FLOOR_MIN_XP, Math.round(offerRewardXp * REWARD_FLOOR_FRACTION_XP)),
  };
}
