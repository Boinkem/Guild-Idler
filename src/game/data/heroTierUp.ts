import { Tuning } from './tuning';

/**
 * Hero Tier-Up (patch 0329) -- lets an individual hero earn their way to
 * matching a higher tier's power, one step at a time, without changing
 * class/sprite/identity. Direct request: "a way to upgrade the lower tier
 * heroes to 'a tier above'... also at the same time have a 5th power tier
 * available, so you can upgrade the tier 4's too (everyone has the 5th
 * available)."
 *
 * Lives in its own file for the same reason chainReplay.ts/raidUpgrades.ts
 * do -- a deliberately separable system, not an extension of ordinary hero
 * progression, with its own cost curve and its own gating.
 */

/** No real Tier 5 hero classes exist (hero-classes.json tops out at
 *  tier 4) -- Tier 5 is purely a mechanical ceiling every hero can reach
 *  via tier-ups, not a class roster. Hardcoded, not tuning-driven: this
 *  is a structural fact about how many tiers exist, same category as
 *  MAX_HERO_LEVEL's own "this is the design's real ceiling" reasoning,
 *  not a balance knob. */
export const HERO_TIER_UP_MAX_TIER = 5;

/** How many times a hero of a given native tier can tier up before
 *  hitting the Tier 5 ceiling -- a Tier 4 native needs exactly 1
 *  (matching "everyone has the 5th available" including Tier 4s who'd
 *  otherwise have nothing left to earn), a Tier 0 native needs 5. */
export function heroTierUpMaxSteps(nativeTier: number): number {
  return Math.max(0, HERO_TIER_UP_MAX_TIER - nativeTier);
}

/** The hero's current effective tier for power purposes -- native tier
 *  plus however many steps they've bought, clamped at the ceiling (the
 *  clamp is defensive; heroTierUpMaxSteps already prevents buying past
 *  it, this just guarantees the number displayed can never read above 5
 *  even if something upstream is ever wrong). */
export function heroEffectiveTier(nativeTier: number, tierUpLevel: number): number {
  return Math.min(HERO_TIER_UP_MAX_TIER, nativeTier + tierUpLevel);
}

/**
 * Stat multiplier per tier-up step, applied to BOTH baseStats and growth
 * together (not baseStats alone) -- confirmed directly: the ask was for a
 * Tier 1 hero at level 20 to read as comparable in power to a real Tier 2
 * hero at level 20, and growth is what actually compounds over a hero's
 * whole career. Boosting baseStats alone would be nearly invisible by
 * level 20 (growth's contribution dwarfs it by then); boosting both keeps
 * the uplift meaningful at every level, not just level 1.
 *
 * Calibrated from hero-classes.json's own real per-tier averages, NOT
 * assumed -- summed across the four stats per class, per tier:
 *   tier 0 -> 1: base +16.7%, growth +8.1%
 *   tier 1 -> 2: base +14.3%, growth +10.4%
 *   tier 2 -> 3: base -4.2%, growth -6.3%  (an outlier: tier 3's two
 *     casters trade raw stats for wisdom/utility rather than being a
 *     strict power increase over tier 2 by this measure -- excluded from
 *     the average below rather than dragging every step's multiplier
 *     down to match one anomalous transition)
 *   tier 3 -> 4: base +13.0%, growth +2.1%
 * Averaging the three well-behaved transitions (0->1, 1->2, 3->4) gives
 * base ~+14.7%/growth ~+6.9%, rounded to the flat, tunable multipliers
 * below. A flat per-step multiplier (rather than a literal per-tier
 * lookup table) is deliberate: it's the only way to give Tier 5 -- which
 * has no real class data to reference at all -- a principled number
 * instead of an arbitrarily invented one, and it stays well-behaved
 * (monotonically increasing) where the raw per-tier data itself isn't.
 */
const BASE_STATS_MULTIPLIER_PER_TIER = Tuning.get('hero_tier_up.baseStatsMultiplierPerTier');
const GROWTH_MULTIPLIER_PER_TIER = Tuning.get('hero_tier_up.growthMultiplierPerTier');

export function heroTierUpStatMultiplier(tierUpLevel: number): { base: number; growth: number } {
  return {
    base: BASE_STATS_MULTIPLIER_PER_TIER ** tierUpLevel,
    growth: GROWTH_MULTIPLIER_PER_TIER ** tierUpLevel,
  };
}

/**
 * Cumulative quest-count gate for a hero's NEXT tier-up step (1-indexed --
 * `nextStep` is the step being bought, i.e. hero.tierUpLevel + 1). Reads
 * directly off Hero.questsCompleted (already-tracked, lifetime, covers
 * quests/chain stages/chain replay stages alike per that field's own
 * comment) rather than a new counter -- cumulative thresholds work
 * cleanly off a monotonically-increasing lifetime total with no need to
 * track "quests since last tier-up" separately.
 */
const QUESTS_REQUIRED_PER_STEP = Tuning.get('hero_tier_up.questsRequiredPerStep');
export function heroTierUpQuestsRequired(nextStep: number): number {
  return QUESTS_REQUIRED_PER_STEP * nextStep;
}

/**
 * Gold cost to reach a given DESTINATION tier (1-4) -- confirmed cost
 * split: every step that lands on tiers 1 through 4 costs gold; only the
 * final step into Tier 5 costs Renown (see heroTierUpRenownCost below).
 * Scales with the destination tier itself, not the step number, so a
 * Tier 3 hero's single step to Tier 4 costs the same as a Tier 0 hero's
 * fourth step to Tier 4 -- the destination is what the money is buying,
 * not how far the hero's own journey there was.
 */
const GOLD_BASE_COST = Tuning.get('hero_tier_up.goldBaseCost');
const GOLD_COST_GROWTH = Tuning.get('hero_tier_up.goldCostGrowth');
export function heroTierUpGoldCost(destinationTier: number): number {
  return Math.floor(GOLD_BASE_COST * GOLD_COST_GROWTH ** (destinationTier - 1));
}

/** Flat Renown cost for the one step that lands a hero on Tier 5 --
 *  confirmed as Renown regardless of which native tier the hero started
 *  at (a Tier 4 native's only step already IS this one). First-pass
 *  number, same Balance Sandbox caveat as every other new economy figure
 *  in this codebase -- roughly in line with Extra Banner's own tier2
 *  per-level cost (120 Renown for a much smaller, repeatable bonus), set
 *  higher here since this is a one-time, guild-defining purchase per
 *  hero. */
export function heroTierUpRenownCost(): number {
  return Tuning.get('hero_tier_up.renownCost');
}

/** True once the destination tier for a hero's NEXT step is the Tier 5
 *  ceiling -- the one point where the cost currency switches from gold
 *  to Renown. */
export function heroTierUpNextStepIsFinal(nativeTier: number, tierUpLevel: number): boolean {
  return heroEffectiveTier(nativeTier, tierUpLevel + 1) >= HERO_TIER_UP_MAX_TIER;
}
