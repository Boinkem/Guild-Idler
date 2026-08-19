import {
  GameState, PeddlerCardDef, PeddlerCardTier, PeddlerFlipCard, PeddlerFlipResult, Rarity,
} from '../types';
import { PEDDLER_CARDS_BY_TIER } from '../data/peddler';
import { EQUIPMENT, EQUIPMENT_BY_ID } from '../data/equipment';
import { MATERIAL_BY_ID } from '../data/materials';
import { CURIO_BY_ID } from '../data/curios';
import { warehouseCapacity } from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { PetManager } from './PetManager';
import { CurioManager } from './CurioManager';

const TIERS: PeddlerCardTier[] = ['bust', 'refund', 'modest', 'good', 'jackpot'];

/** 5-10 by default, both ends tuning-registry values (see
 *  peddler.cooldownMin/MaxQuests) -- re-rolled every time he leaves, not
 *  fixed, so the arrival cadence can't be predicted exactly. */
function rollThreshold(): number {
  const min = Tuning.get('peddler.cooldownMinQuests');
  const max = Tuning.get('peddler.cooldownMaxQuests');
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Picks a tier against the Tuning-driven relative weights -- pure
 *  balance knob, content-free (see PeddlerCardDef's own comment on the
 *  two-level roll design). */
function rollTier(): PeddlerCardTier {
  const weights = TIERS.map((t) => Math.max(0, Tuning.get(`peddler.tierWeight.${t}`)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 'bust';
  let roll = Math.random() * total;
  for (let i = 0; i < TIERS.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return TIERS[i];
  }
  return TIERS[TIERS.length - 1];
}

/** Picks one entry from a tier's own content pool, weighted by that
 *  entry's own `weight` field -- content, tier-probability-free. Falls
 *  back to a generic "empty cart" outcome if a tier's pool is somehow
 *  empty (e.g. a fresh install before peddler-cards.json has any jackpot
 *  entries yet) rather than throwing -- same "missing content degrades
 *  gracefully" spirit as a missing art file just failing to paint. */
function rollCardFromTier(tier: PeddlerCardTier): PeddlerCardDef {
  const pool = PEDDLER_CARDS_BY_TIER[tier];
  if (pool.length === 0) {
    return {
      id: `fallback_${tier}`, tier, weight: 1, kind: 'nothing',
      flavorText: "Grimsby pats his cart down and comes up empty. \"...Give me a second.\"",
    };
  }
  const totalWeight = pool.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return pool[0];
  let roll = Math.random() * totalWeight;
  for (const card of pool) {
    roll -= Math.max(0, card.weight);
    if (roll <= 0) return card;
  }
  return pool[pool.length - 1];
}

function rollOneOutcome(): PeddlerCardDef {
  return resolveEquipmentRoll(rollCardFromTier(rollTier()));
}

/** Every EquipmentDef at the given rarity that's fair game for Grimsby
 *  to hand out at random -- excludes raidExclusive (Heroic/Legendary raid-
 *  only loot, per direct request: "raid only for sure"), craftable
 *  (empty-mods crafting bases, not real drops), and chainExclusive (a
 *  chain's own guaranteed reward -- previously tracked here via its own
 *  ad-hoc CHAIN_REWARD_ITEM_IDS set computed from ChainDef.rewardItems;
 *  now that EquipmentDef.chainExclusive exists as the single source of
 *  truth Shop/QuestManager also read, this reads that instead, so all
 *  three pools agree by construction rather than by three separately
 *  maintained exclusion lists). */
function eligibleEquipmentForRarity(rarity: Rarity): typeof EQUIPMENT {
  return EQUIPMENT.filter((def) => (
    def.rarity === rarity
    && !def.raidExclusive
    && !def.craftable
    && !def.chainExclusive
  ));
}

/**
 * Resolves an outcome's `itemRarity` (if set) into a concrete `itemId`
 * -- a uniform random pick among everything eligibleEquipmentForRarity
 * returns for that rarity. Baked into a NEW outcome object at roll time
 * (not re-rolled separately later) so the revealed card face and the
 * item actually granted on pick are guaranteed to be the exact same
 * roll. Outcomes with no `itemRarity` (either not an equipment card, or
 * an equipment card still using the older fixed `itemId` field) pass
 * through completely unchanged. An empty eligible pool (nothing left
 * after exclusions at that rarity) falls back to whatever `itemId`
 * already was on the card -- same "degrade gracefully" precedent
 * rollCardFromTier's own empty-pool fallback above already sets.
 */
function resolveEquipmentRoll(outcome: PeddlerCardDef): PeddlerCardDef {
  if (outcome.kind !== 'equipment' || !outcome.itemRarity) return outcome;
  const pool = eligibleEquipmentForRarity(outcome.itemRarity);
  if (pool.length === 0) return outcome;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { ...outcome, itemId: picked.id };
}

/** Human-readable summary of what a resolved outcome actually was, for
 *  the picked card's own result line in the UI -- resolves real item/
 *  material names against live game data so PeddlerPanel doesn't need
 *  to re-look those up itself. `multiplier` is 1 for a regular flip, or
 *  peddler.highRollerMultiplier for a High Roller one (see
 *  applyOutcome's own comment for why goldRefund doesn't need it
 *  applied a second time here). */
function summarizeReward(outcome: PeddlerCardDef, feePaid: number, multiplier: number): string {
  switch (outcome.kind) {
    case 'nothing': return 'Nothing at all.';
    case 'joke': return outcome.jokeItemName ?? 'Something, technically.';
    case 'goldFlat': return `+${(outcome.goldAmount ?? 0) * multiplier} gold`;
    case 'goldRefund': {
      const amt = Math.floor((feePaid * (outcome.refundPercent ?? 0)) / 100);
      return `+${amt} gold back`;
    }
    case 'material': {
      const def = outcome.materialId ? MATERIAL_BY_ID[outcome.materialId] : undefined;
      return `+${(outcome.materialAmount ?? 0) * multiplier} ${def?.name ?? outcome.materialId ?? 'material'}`;
    }
    case 'scrap': return `+${(outcome.scrapAmount ?? 0) * multiplier} Scrap`;
    case 'equipment': {
      const def = outcome.itemId ? EQUIPMENT_BY_ID[outcome.itemId] : undefined;
      const name = def ? def.name : 'A mystery item.';
      return multiplier > 1 ? `${name} ×${multiplier}` : name;
    }
    case 'egg': {
      const label = `A ${outcome.eggRarity ?? 'common'} egg`;
      return multiplier > 1 ? `${label} ×${multiplier}` : label;
    }
    case 'curio': {
      const def = outcome.curioId ? CURIO_BY_ID[outcome.curioId] : undefined;
      const name = def ? def.name : 'A curio.';
      return multiplier > 1 ? `${name} ×${multiplier}` : name;
    }
    default: return 'Something.';
  }
}

export const PeddlerManager = {
  rollThreshold,

  /**
   * Fee for a single Pick Your Card flip -- scales with the guild's
   * highest hero level, same "scales with progress, not a fixed price
   * forever" shape quest tiers already use, just a much simpler linear
   * formula since this doesn't need its own difficulty-band system.
   */
  feeCost(state: GameState): number {
    const topLevel = state.heroes.reduce((max, h) => Math.max(max, h.level), 1);
    const base = Tuning.get('peddler.feeBaseCost');
    const perLevel = Tuning.get('peddler.feeCostPerLevel');
    return Math.floor(base + topLevel * perLevel);
  },

  /** Fee for a High Roller flip -- always exactly the regular fee times
   *  peddler.highRollerMultiplier, never its own independent curve, so
   *  the two stay in lockstep as feeBaseCost/feeCostPerLevel get tuned. */
  highRollerFeeCost(state: GameState): number {
    return PeddlerManager.feeCost(state) * Tuning.get('peddler.highRollerMultiplier');
  },

  /** Just the multiplier itself, for UI copy ("3x the fee, 3x the
   *  payout") -- everywhere else reads highRollerFeeCost/applyOutcome's
   *  own multiplier param instead of re-deriving it. */
  highRollerMultiplier(): number {
    return Tuning.get('peddler.highRollerMultiplier');
  },

  /** Fee for a flip at a given stake (see STAKE_OPTIONS/resolveFlip's own
   *  comment) -- the one place the UI (PeddlerPanel/PeddlerCardModal)
   *  should compute a displayed cost from, so it can never drift from
   *  what resolveFlip itself actually charges. */
  feeWithStake(state: GameState, highRoller: boolean, stake: number): number {
    return (highRoller ? PeddlerManager.highRollerFeeCost(state) : PeddlerManager.feeCost(state)) * stake;
  },

  /** One-time gold cost to unlock High Roller at all -- flat, not
   *  per-level, same shape master_adventurer's own single-purchase
   *  unlock uses. */
  highRollerUnlockCost(): number {
    return Tuning.get('peddler.highRollerUnlockCost');
  },

  canUnlockHighRoller(state: GameState): boolean {
    return !state.grimsbyHighRollerUnlocked && state.gold >= PeddlerManager.highRollerUnlockCost();
  },

  /** Buys the High Roller unlock outright -- caller (GameEngine) is
   *  expected to have already checked canUnlockHighRoller; this is just
   *  a defensive guard against a stale/replayed call, same convention
   *  resolveFlip's own early-return already uses. */
  unlockHighRoller(state: GameState): boolean {
    if (state.grimsbyHighRollerUnlocked) return false;
    const cost = PeddlerManager.highRollerUnlockCost();
    if (state.gold < cost) return false;
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.stats.peddlerGoldSpent += cost;
    state.grimsbyHighRollerUnlocked = true;
    return true;
  },

  /**
   * Stake multiplier options for a card flip -- a player-chosen (not
   * Tuning-driven) multiplier applied ON TOP OF the regular/High Roller
   * fee, for a proportionally bigger reward. "Same with the high roller
   * function" per direct request -- both regular and High Roller flips
   * take a stake, and the two multiply together (High Roller's own 3x
   * fee/reward, times whatever stake is picked), rather than the stake
   * only applying to one or the other.
   */
  STAKE_OPTIONS: [1, 2, 3, 4, 5] as const,

  /** True once he's actually here and interactable. Distinct from
   *  questsSinceGrimsby reaching 0 -- see GameState.grimsbyArrivedAt's
   *  own comment for why this is the flag to check, not the counter. */
  isPresent(state: GameState): boolean {
    return state.grimsbyArrivedAt !== null;
  },

  /**
   * Called once per quest resolution (QuestManager.resolve), success or
   * failure both count the same -- a completed quest is a completed
   * quest either way, same "counts regardless of outcome" precedent
   * fastQuestCapsPerHour already sets for its own per-hour accounting.
   * Burst-mode quests are excluded entirely -- see
   * GameState.questsSinceGrimsby's own comment for why (the exact class
   * of exploit the original burst-taper fix already had to correct
   * once: a cheap, frequent action shouldn't be able to fast-forward a
   * separately-balanced system). No-ops until peddlerUnlocked, and while
   * he's already present (no point accumulating toward a NEXT visit
   * mid-visit).
   */
  registerQuestCompletion(state: GameState, isBurst: boolean, now: number): void {
    if (!state.peddlerUnlocked || isBurst || state.grimsbyArrivedAt !== null) return;
    state.questsSinceGrimsby += 1;
    if (state.questsSinceGrimsby >= state.grimsbyThreshold) {
      PeddlerManager.arrive(state, now);
    }
  },

  /** Fires Grimsby's arrival -- resets the counter, starts the leave
   *  timer. Caller (GameEngine) is responsible for the actual banner/
   *  toast; this only updates state. */
  arrive(state: GameState, now: number): void {
    state.grimsbyArrivedAt = now;
    state.grimsbyLeavesAt = now + Tuning.get('peddler.leaveWindowMs');
    state.questsSinceGrimsby = 0;
  },

  /**
   * Ticked from GameEngine.refreshWorld, same "the world doesn't pause
   * just because you're not looking at it" principle Harvest's own
   * despawn timer already follows. Returns true if his presence state
   * actually changed (he left), so refreshWorld/the caller knows to
   * persist/notify/fire a leaving flavor line.
   */
  checkExpiry(state: GameState, now: number): boolean {
    if (state.grimsbyArrivedAt === null || state.grimsbyLeavesAt === null) return false;
    if (now < state.grimsbyLeavesAt) return false;
    state.grimsbyArrivedAt = null;
    state.grimsbyLeavesAt = null;
    state.grimsbyThreshold = rollThreshold();
    return true;
  },

  /**
   * Resolves a full "Pick Your Card" flip: rolls THREE independent
   * outcomes (one per card), applies only the picked one's reward to
   * state, and returns all three for display -- per design, all three
   * flip so the player sees what they missed, not just the one they
   * chose; a missed card can genuinely have been the jackpot, this
   * isn't faked. Card-back art (which of the 3 uploaded designs each
   * card shows face-down) is rolled independently of outcome, on
   * purpose -- see PeddlerCardDef's own comment for why appearance must
   * never correlate with tier.
   *
   * `highRoller` -- same card pool, same tier weights, same format as
   * the regular flip (per design: keep it simple for now, no separate
   * content). The only difference is scale: fee and reward both
   * multiplied by peddler.highRollerMultiplier. Requires
   * grimsbyHighRollerUnlocked; a stale/replayed call without it is
   * treated the same as not being able to afford it.
   *
   * Returns null if he isn't actually here, High Roller was requested
   * but isn't unlocked, or the fee can't be paid -- callers (GameEngine)
   * are expected to have already checked isPresent/feeCost/
   * highRollerFeeCost before offering the button at all; this is just a
   * defensive guard against a stale/replayed call.
   *
   * `stake` (1-5, see STAKE_OPTIONS above) is a player-chosen multiplier
   * on top of whichever base this already is -- 1 for a regular flip,
   * peddler.highRollerMultiplier for High Roller -- multiplying together
   * rather than being its own separate scale, so "High Roller at 3x
   * stake" really is 3x the fee/reward High Roller already was, not a
   * flat replacement of it.
   */
  resolveFlip(state: GameState, pickedIndex: 0 | 1 | 2, now: number, highRoller = false, stake = 1): PeddlerFlipResult | null {
    if (state.grimsbyArrivedAt === null) return null;
    if (highRoller && !state.grimsbyHighRollerUnlocked) return null;
    const multiplier = (highRoller ? Tuning.get('peddler.highRollerMultiplier') : 1) * stake;
    const fee = PeddlerManager.feeCost(state) * multiplier;
    if (state.gold < fee) return null;

    state.gold -= fee;
    state.stats.goldSpent += fee;
    state.stats.peddlerGoldSpent += fee;

    const outcomes: [PeddlerCardDef, PeddlerCardDef, PeddlerCardDef] = [
      rollOneOutcome(), rollOneOutcome(), rollOneOutcome(),
    ];
    const cards = outcomes.map((outcome) => ({
      backIndex: Math.floor(Math.random() * 3) as 0 | 1 | 2,
      outcome,
    })) as [PeddlerFlipCard, PeddlerFlipCard, PeddlerFlipCard];

    const picked = outcomes[pickedIndex];
    PeddlerManager.applyOutcome(state, picked, fee, now, multiplier);

    // Achievement-supporting counters -- see Statistics.peddlerFlips'
    // own comment for why these live here rather than being derived
    // after the fact. Tier check reads the PICKED card only, never the
    // two cosmetic-only reveals a player didn't actually choose.
    state.stats.peddlerFlips += 1;
    if (picked.tier === 'jackpot') {
      state.stats.peddlerJackpots += 1;
      if (highRoller) state.stats.peddlerHighRollerJackpots += 1;
    } else if (picked.tier === 'bust') {
      state.stats.peddlerBusts += 1;
    }

    return {
      cards,
      pickedIndex,
      feePaid: fee,
      highRoller,
      rewardSummary: summarizeReward(picked, fee, multiplier),
    };
  },

  /**
   * Applies exactly one outcome's reward to state -- split out from
   * resolveFlip so it only ever runs once, on the picked card, never
   * accidentally on the two cosmetic-only reveals. Respects the same
   * caps every other source of that reward type already respects (gold
   * storage, warehouse capacity) rather than being a way to bypass them.
   *
   * `multiplier` (1 for a regular flip, peddler.highRollerMultiplier for
   * a High Roller one) scales the reward -- but not every kind the same
   * way: goldFlat/material/scrap are flat amounts, straightforwardly
   * multiplied; goldRefund is a PERCENTAGE of feePaid, which is already
   * the multiplied fee by the time it gets here, so applying the
   * multiplier a second time would double-count it -- left alone on
   * purpose. equipment/egg are discrete, one-of drops with no partial
   * amount to scale, so "3x reward" for those means literally 3 copies
   * of whatever was rolled, not a stronger version of it.
   */
  applyOutcome(state: GameState, outcome: PeddlerCardDef, feePaid: number, now: number, multiplier = 1): void {
    switch (outcome.kind) {
      case 'nothing':
      case 'joke':
        break;
      case 'goldFlat': {
        const storage = ModifierManager.goldStorage(state);
        state.gold = Math.min(storage, state.gold + (outcome.goldAmount ?? 0) * multiplier);
        break;
      }
      case 'goldRefund': {
        const storage = ModifierManager.goldStorage(state);
        const amt = Math.floor((feePaid * (outcome.refundPercent ?? 0)) / 100);
        state.gold = Math.min(storage, state.gold + amt);
        break;
      }
      case 'material': {
        if (!outcome.materialId) break;
        const cap = warehouseCapacity(state.warehouseLevel);
        const current = state.materials[outcome.materialId];
        const gain = Math.max(0, Math.min((outcome.materialAmount ?? 0) * multiplier, cap - current));
        state.materials[outcome.materialId] = current + gain;
        break;
      }
      case 'scrap':
        state.scrap += (outcome.scrapAmount ?? 0) * multiplier;
        break;
      case 'equipment': {
        if (!outcome.itemId) break;
        for (let i = 0; i < multiplier; i += 1) {
          const item = EquipmentManager.instantiate(outcome.itemId);
          if (item) state.stash.push(item);
        }
        if (!state.discoveredItems.includes(outcome.itemId)) state.discoveredItems.push(outcome.itemId);
        state.stats.itemsFound += multiplier;
        break;
      }
      case 'egg':
        for (let i = 0; i < multiplier; i += 1) {
          PetManager.grantEgg(state, outcome.eggRarity ?? 'common', outcome.dedicatedPetId, now);
        }
        break;
      case 'curio':
        if (!outcome.curioId) break;
        CurioManager.add(state, outcome.curioId, multiplier);
        break;
      default:
        break;
    }
  },
};
