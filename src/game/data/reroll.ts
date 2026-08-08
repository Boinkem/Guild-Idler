import { DAY } from '../util';
import { Tuning } from './tuning';

/**
 * Shared math for the two independent reroll systems (quest board, Vendors
 * restock) -- same shape both times: a small number of free rerolls per
 * calendar day (base 1, more via that system's own guild upgrade), then an
 * escalating gold cost per additional reroll, all resetting together at the
 * next day boundary. Kept as plain functions rather than a stateful manager
 * since neither system owns any state of its own beyond the two counters
 * already living on GameState (dayField/usedField), the same way burst's
 * cap math in balance.ts is plain functions rather than a manager.
 *
 * Day boundaries are plain UTC-epoch-day division (`Math.floor(now / DAY)`),
 * matching every other window-bucketed system in this game (the quest
 * board's own 30-min windows, shop's 4h window, etc.) rather than the
 * player's local midnight -- simplest, and consistent with how every other
 * "resets on a timer" system here already works.
 */
export function rerollDay(now: number): number {
  return Math.floor(now / DAY);
}

/** How many of today's rerolls have actually been used, given the day the
 *  stored counter was last touched -- 0 if that day has since rolled over,
 *  since the counter itself is only reset lazily, on next use, not ticked. */
export function rerollsUsedToday(usedCount: number, storedDay: number, now: number): number {
  return storedDay === rerollDay(now) ? usedCount : 0;
}

/**
 * Gold cost of the *next* reroll, given how many have already been used
 * today and how many of today's are free. 0 while still within the free
 * allowance; otherwise baseCost * growth^(paid rerolls so far), rounded
 * down to a whole gold amount.
 */
export function nextRerollCost(
  usedToday: number, freeCount: number, baseCostTuningId: string, growthTuningId: string,
): number {
  if (usedToday < freeCount) return 0;
  const paidSoFar = usedToday - freeCount;
  return Math.floor(Tuning.get(baseCostTuningId) * Tuning.get(growthTuningId) ** paidSoFar);
}
