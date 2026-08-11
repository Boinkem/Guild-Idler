import {
  GameState, PeddlerCardDef, PeddlerCardTier, PeddlerFlipCard, PeddlerFlipResult,
} from '../types';
import { PEDDLER_CARDS_BY_TIER } from '../data/peddler';
import { EQUIPMENT_BY_ID } from '../data/equipment';
import { MATERIAL_BY_ID } from '../data/materials';
import { warehouseCapacity } from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { PetManager } from './PetManager';

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
  return rollCardFromTier(rollTier());
}

/** Human-readable summary of what a resolved outcome actually was, for
 *  the picked card's own result line in the UI -- resolves real item/
 *  material names against live game data so PeddlerPanel doesn't need
 *  to re-look those up itself. */
function summarizeReward(outcome: PeddlerCardDef, feePaid: number): string {
  switch (outcome.kind) {
    case 'nothing': return 'Nothing at all.';
    case 'joke': return outcome.jokeItemName ?? 'Something, technically.';
    case 'goldFlat': return `+${outcome.goldAmount ?? 0} gold`;
    case 'goldRefund': {
      const amt = Math.floor((feePaid * (outcome.refundPercent ?? 0)) / 100);
      return `+${amt} gold back`;
    }
    case 'material': {
      const def = outcome.materialId ? MATERIAL_BY_ID[outcome.materialId] : undefined;
      return `+${outcome.materialAmount ?? 0} ${def?.name ?? outcome.materialId ?? 'material'}`;
    }
    case 'scrap': return `+${outcome.scrapAmount ?? 0} Scrap`;
    case 'equipment': {
      const def = outcome.itemId ? EQUIPMENT_BY_ID[outcome.itemId] : undefined;
      return def ? def.name : 'A mystery item.';
    }
    case 'egg': return `A ${outcome.eggRarity ?? 'common'} egg`;
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
   * Returns null if he isn't actually here or the fee can't be paid --
   * callers (GameEngine) are expected to have already checked
   * isPresent/feeCost before offering the button at all; this is just a
   * defensive guard against a stale/replayed call.
   */
  resolveFlip(state: GameState, pickedIndex: 0 | 1 | 2, now: number): PeddlerFlipResult | null {
    if (state.grimsbyArrivedAt === null) return null;
    const fee = PeddlerManager.feeCost(state);
    if (state.gold < fee) return null;

    state.gold -= fee;
    state.stats.goldSpent += fee;

    const outcomes: [PeddlerCardDef, PeddlerCardDef, PeddlerCardDef] = [
      rollOneOutcome(), rollOneOutcome(), rollOneOutcome(),
    ];
    const cards = outcomes.map((outcome) => ({
      backIndex: Math.floor(Math.random() * 3) as 0 | 1 | 2,
      outcome,
    })) as [PeddlerFlipCard, PeddlerFlipCard, PeddlerFlipCard];

    const picked = outcomes[pickedIndex];
    PeddlerManager.applyOutcome(state, picked, fee, now);

    return {
      cards,
      pickedIndex,
      feePaid: fee,
      rewardSummary: summarizeReward(picked, fee),
    };
  },

  /**
   * Applies exactly one outcome's reward to state -- split out from
   * resolveFlip so it only ever runs once, on the picked card, never
   * accidentally on the two cosmetic-only reveals. Respects the same
   * caps every other source of that reward type already respects (gold
   * storage, warehouse capacity) rather than being a way to bypass them.
   */
  applyOutcome(state: GameState, outcome: PeddlerCardDef, feePaid: number, now: number): void {
    switch (outcome.kind) {
      case 'nothing':
      case 'joke':
        break;
      case 'goldFlat': {
        const storage = ModifierManager.goldStorage(state);
        state.gold = Math.min(storage, state.gold + (outcome.goldAmount ?? 0));
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
        const gain = Math.max(0, Math.min(outcome.materialAmount ?? 0, cap - current));
        state.materials[outcome.materialId] = current + gain;
        break;
      }
      case 'scrap':
        state.scrap += outcome.scrapAmount ?? 0;
        break;
      case 'equipment': {
        if (!outcome.itemId) break;
        const item = EquipmentManager.instantiate(outcome.itemId);
        if (item) state.stash.push(item);
        if (!state.discoveredItems.includes(outcome.itemId)) state.discoveredItems.push(outcome.itemId);
        state.stats.itemsFound += 1;
        break;
      }
      case 'egg':
        PetManager.grantEgg(state, outcome.eggRarity ?? 'common', outcome.dedicatedPetId, now);
        break;
      default:
        break;
    }
  },
};
