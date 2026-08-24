import {
  DiceFace, DiceRollResult, GameState, HighLowCall, HighLowRollResult, PeddlerCardDef, PeddlerCardTier,
  PeddlerFlipCard, PeddlerFlipResult, PeddlerTabRunResult, Rarity,
} from '../types';
import { PEDDLER_CARDS_BY_TIER } from '../data/peddler';
import { EQUIPMENT, EQUIPMENT_BY_ID } from '../data/equipment';
import { MATERIAL_BY_ID } from '../data/materials';
import { CURIO_BY_ID } from '../data/curios';
import { warehouseCapacity } from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';
import { applyVendorRepDiscount, vendorRepPercent } from '../data/vendorRep';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { PetManager } from './PetManager';
import { CurioManager } from './CurioManager';

const TAB_TIER_TUNING_IDS = [
  'peddler.tab.tier0BuyIn', 'peddler.tab.tier1BuyIn', 'peddler.tab.tier2BuyIn', 'peddler.tab.tier3BuyIn',
];

/**
 * Face bands for the High/Low game -- standard is a plain two-way split
 * (Under 1-3 / Over 4-6), High Roller splits into three (Under 1-2 /
 * Middle 3-4 / Over 5-6). 'middle' simply doesn't exist as a key in the
 * standard band, rather than existing with an empty face list, so a
 * standard-mode call of 'middle' fails the lookup below and is rejected
 * outright instead of silently resolving as a guaranteed loss.
 */
const HIGH_LOW_BANDS: {
  standard: Record<'under' | 'over', DiceFace[]>;
  highRoller: Record<HighLowCall, DiceFace[]>;
} = {
  standard: { under: [1, 2, 3], over: [4, 5, 6] },
  highRoller: { under: [1, 2], middle: [3, 4], over: [5, 6] },
};

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

/**
 * Grimsby's own Vendor Rep payout bonus -- a small automatic cash-back
 * on whatever was just paid him, regardless of the game's own outcome
 * (even a bust still gets this rebate; it's about him being a decent
 * dealer to a regular, not a consolation prize). Shared identically
 * across Cards, Dice, and the Tab -- same level, same percent, same cap
 * as feeWithStake's own discount, just pointed at what comes back
 * instead of what goes out. Reads state.stats.peddlerGoldSpent as of
 * BEFORE the current transaction's own fee gets added to it -- callers
 * compute this before incrementing that counter, so the rebate reflects
 * established loyalty, not the level this very payment just reached.
 */
function repRebate(state: GameState, feePaid: number): number {
  const percent = vendorRepPercent(state.stats.peddlerGoldSpent);
  return Math.floor((feePaid * percent) / 100);
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
    const base = (highRoller ? PeddlerManager.highRollerFeeCost(state) : PeddlerManager.feeCost(state)) * stake;
    return applyVendorRepDiscount(base, state.stats.peddlerGoldSpent);
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
   *  own comment for why this is the flag to check, not the counter.
   *  Patch 0220: also true once grimsbyPermanentSpotUnlocked is bought,
   *  independent of the arrival/leave-timer cycle entirely -- every
   *  caller (this panel, the tab badge, resolveFlip, rollDice) already
   *  routes through this one function rather than checking
   *  grimsbyArrivedAt directly, so the permanent unlock only needed to
   *  change here. */
  isPresent(state: GameState): boolean {
    return state.grimsbyArrivedAt !== null || state.grimsbyPermanentSpotUnlocked;
  },

  /** One-time gold cost for "A Permanent Spot" -- same flat,
   *  single-purchase shape as highRollerUnlockCost above. */
  permanentSpotUnlockCost(): number {
    return Tuning.get('peddler.permanentSpotUnlockCost');
  },

  canUnlockPermanentSpot(state: GameState): boolean {
    return !state.grimsbyPermanentSpotUnlocked && state.gold >= PeddlerManager.permanentSpotUnlockCost();
  },

  /** Buys "A Permanent Spot" outright -- same defensive-guard shape
   *  unlockHighRoller uses (caller is expected to have already checked
   *  canUnlockPermanentSpot). Deliberately does NOT touch
   *  grimsbyArrivedAt/grimsbyLeavesAt/questsSinceGrimsby -- the
   *  arrival/leave cycle keeps ticking underneath exactly as before,
   *  isPresent above is just no longer the only thing gating on it. */
  unlockPermanentSpot(state: GameState): boolean {
    if (state.grimsbyPermanentSpotUnlocked) return false;
    const cost = PeddlerManager.permanentSpotUnlockCost();
    if (state.gold < cost) return false;
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.stats.peddlerGoldSpent += cost;
    state.grimsbyPermanentSpotUnlocked = true;
    return true;
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
    if (!PeddlerManager.isPresent(state)) return null;
    if (highRoller && !state.grimsbyHighRollerUnlocked) return null;
    const multiplier = (highRoller ? Tuning.get('peddler.highRollerMultiplier') : 1) * stake;
    const fee = PeddlerManager.feeWithStake(state, highRoller, stake);
    if (state.gold < fee) return null;
    const rebate = repRebate(state, fee);

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
    if (rebate > 0) {
      const storage = ModifierManager.goldStorage(state);
      state.gold = Math.min(storage, state.gold + rebate);
    }

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
      rebate,
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

  /**
   * Resolves one Dice game roll -- Grimsby's second, gold-only wager game
   * alongside Pick Your Card, with no card-tier content pool: the wager
   * itself is a free-form gold amount rather than a fixed fee, and the
   * payout is decided purely by CIRCULAR distance between the chosen face
   * and wherever the die lands. See DiceRollResult's own doc comment
   * (types.ts) for the full payout table and why the adjacency wraps
   * (1 and 6 are neighbors, same as any other consecutive pair).
   *
   * Same "he has to actually be here" gate resolveFlip already uses --
   * Dice lives on his cart, not as a standalone always-available game.
   * `wager` is floored to a whole gold amount and rejected outright (null
   * return, nothing charged) if it isn't a positive, affordable number --
   * callers (GameEngine) are expected to have already validated the
   * wager input before calling this, same defensive-guard convention
   * resolveFlip's own doc comment already establishes.
   */
  rollDice(state: GameState, wager: number, chosen: DiceFace): DiceRollResult | null {
    if (!PeddlerManager.isPresent(state)) return null;
    const stake = Math.floor(wager);
    if (!Number.isFinite(stake) || stake <= 0) return null;
    if (state.gold < stake) return null;
    // Dice has no fixed fee to discount the way Cards/Tab do -- the
    // wager is a free-form player-chosen amount, and discounting a
    // number the player just typed would be confusing ("I entered 100,
    // why was I charged 95?"). Vendor Rep's full effect here is the
    // rebate instead -- functionally the same net benefit, just
    // expressed as gold back rather than a lower charge up front.
    const rebate = repRebate(state, stake);

    state.gold -= stake;
    state.stats.goldSpent += stake;
    state.stats.peddlerGoldSpent += stake;

    const landed = (1 + Math.floor(Math.random() * 6)) as DiceFace;
    const rawDistance = Math.abs(landed - chosen);
    // Wheel distance, not plain numeric distance -- 1 and 6 sit next to
    // each other once the faces wrap around, same as any other
    // consecutive pair (see DiceRollResult's own comment for the worked
    // example this was confirmed against).
    const distance = Math.min(rawDistance, 6 - rawDistance);
    const outcome: DiceRollResult['outcome'] = distance === 0 ? 'jackpot' : distance === 1 ? 'partial' : 'bust';
    const payout = outcome === 'jackpot' ? stake * 3 : outcome === 'partial' ? Math.floor(stake / 2) : 0;

    const totalPayout = payout + rebate;
    if (totalPayout > 0) {
      const storage = ModifierManager.goldStorage(state);
      state.gold = Math.min(storage, state.gold + totalPayout);
    }

    // Grimsby-wide counters, not Dice-specific ones -- see peddlerJackpots/
    // peddlerBusts' own comments (types.ts) for why these are shared with
    // the card game rather than tracked separately per game. Deliberately
    // NOT incrementing peddlerFlips here -- that counter's own doc comment
    // scopes it to card flips specifically ("Total Grimsby card flips").
    if (outcome === 'jackpot') state.stats.peddlerJackpots += 1;
    else if (outcome === 'bust') state.stats.peddlerBusts += 1;

    return { chosen, landed, wager: stake, outcome, payout, rebate };
  },

  /**
   * Lowest wager `rollHighLow` will accept for the given band -- a real
   * gate, not just a UI hint, since `rollHighLow` itself re-checks this
   * before touching gold. High Roller's own minimum additionally
   * requires GameState.grimsbyHighRollerUnlocked; a stale/replayed call
   * without it is rejected the same way resolveFlip's own highRoller
   * flag is.
   */
  highLowMinWager(highRoller: boolean): number {
    return highRoller
      ? Tuning.get('peddler.highLow.highRollerMinWager')
      : Tuning.get('peddler.highLow.minWager');
  },

  /**
   * Resolves one High/Low roll -- Grimsby's third dice game, alongside
   * Call a Number (rollDice above) and Pick Your Card. Same "he has to
   * actually be here" gate, same floored/positive/affordable wager
   * check, same Vendor Rep rebate treatment as rollDice -- the only real
   * difference is the win condition (landing in the called band, not an
   * exact/adjacent face) and the flat payout multiplier instead of a
   * tiered one. `highRoller` selects the three-way band split and the
   * bigger multiplier, and is rejected outright (null, nothing charged)
   * without GameState.grimsbyHighRollerUnlocked -- same defensive
   * re-check resolveFlip's own highRoller flag already gets, so a stale
   * client can't roll a High Roller call it was never actually granted.
   */
  rollHighLow(state: GameState, wager: number, call: HighLowCall, highRoller: boolean): HighLowRollResult | null {
    if (!PeddlerManager.isPresent(state)) return null;
    if (highRoller && !state.grimsbyHighRollerUnlocked) return null;
    const bands = highRoller ? HIGH_LOW_BANDS.highRoller : HIGH_LOW_BANDS.standard;
    const faces = (bands as Partial<Record<HighLowCall, DiceFace[]>>)[call];
    if (!faces) return null;
    const stake = Math.floor(wager);
    if (!Number.isFinite(stake) || stake <= 0) return null;
    if (stake < PeddlerManager.highLowMinWager(highRoller)) return null;
    if (state.gold < stake) return null;
    // Same "no fixed fee to discount, Vendor Rep pays out as a rebate
    // instead" reasoning rollDice's own comment gives -- the wager here
    // is just as free-form.
    const rebate = repRebate(state, stake);

    state.gold -= stake;
    state.stats.goldSpent += stake;
    state.stats.peddlerGoldSpent += stake;

    const landed = (1 + Math.floor(Math.random() * 6)) as DiceFace;
    const win = faces.includes(landed);
    const multiplier = highRoller
      ? Tuning.get('peddler.highLow.highRollerPayoutMultiplier')
      : Tuning.get('peddler.highLow.standardPayoutMultiplier');
    const payout = win ? Math.floor(stake * multiplier) : 0;

    const totalPayout = payout + rebate;
    if (totalPayout > 0) {
      const storage = ModifierManager.goldStorage(state);
      state.gold = Math.min(storage, state.gold + totalPayout);
    }

    // Same shared Grimsby-wide counters rollDice's own comment explains
    // (not Dice/High-Low-specific ones) -- a win here reads as a
    // "jackpot" for achievement/stat purposes the same way an exact
    // Call-a-Number match does.
    if (win) state.stats.peddlerJackpots += 1;
    else state.stats.peddlerBusts += 1;

    return { call, highRoller, landed, wager: stake, win, payout, rebate };
  },

  /* -------------------------------- the tab -------------------------------- */

  /** Buy-in for a given Tab tier (0-3, low to high) -- see
   *  TAB_TIER_TUNING_IDS above. Out-of-range tiers fall back to tier 0
   *  rather than throwing. */
  tabTierBuyIn(tier: number): number {
    return Tuning.get(TAB_TIER_TUNING_IDS[tier] ?? TAB_TIER_TUNING_IDS[0]);
  },

  tabTierCount(): number {
    return TAB_TIER_TUNING_IDS.length;
  },

  /** Success chance for pushing TO the given round -- round 2 is the
   *  first real roll (round 1 is the guaranteed buy-in, no roll at all,
   *  see openTab). No ceiling on rounds by direct design request --
   *  decays toward, but never below, the tuned floor no matter how far
   *  a run is pushed, rather than capping at a designed max round. */
  tabSuccessChance(round: number): number {
    const base = Tuning.get('peddler.tab.baseSuccessChance');
    const decay = Tuning.get('peddler.tab.successDecayPerRound');
    const floor = Tuning.get('peddler.tab.minSuccessChance');
    return Math.max(floor, base - (round - 2) * decay);
  },

  /** Gold ADDED to the tab on a successful push to the given round --
   *  grows every round, same curve the design mockup validated. Not the
   *  tab's total value -- callers add this to the running total. */
  tabRoundReward(tier: number, round: number): number {
    const buyIn = PeddlerManager.tabTierBuyIn(tier);
    const growth = Tuning.get('peddler.tab.rewardGrowthPerRound');
    return Math.round(buyIn * (0.9 + (round - 1) * growth));
  },

  /** Gated behind Permanent Spot per direct design request -- this is
   *  the one game where the tension is explicitly Grimsby's own
   *  patience, so it only makes sense once he's actually settled in.
   *  isPresent isn't checked separately here -- Permanent Spot already
   *  implies it (see isPresent's own comment). */
  canOpenTab(state: GameState): boolean {
    return state.grimsbyPermanentSpotUnlocked === true && state.peddlerTab === null;
  },

  /** Opens a new tab at the given tier -- round 1, guaranteed, no risk
   *  roll (the buy-in itself is never at risk, only what gets pushed on
   *  top of it). Rep accumulates from Cards/Dice spend even before
   *  Permanent Spot unlocks (peddlerGoldSpent is Grimsby-wide, not
   *  gated), so a regular's first tab can already carry a real rebate --
   *  per direct design confirmation, a deliberate touch, not an
   *  oversight. */
  openTab(state: GameState, tier: number): GameState['peddlerTab'] {
    if (!PeddlerManager.canOpenTab(state)) return null;
    const buyIn = PeddlerManager.tabTierBuyIn(tier);
    if (state.gold < buyIn) return null;
    const rebate = repRebate(state, buyIn);

    state.gold -= buyIn;
    state.stats.goldSpent += buyIn;
    state.stats.peddlerGoldSpent += buyIn;
    if (rebate > 0) {
      const storage = ModifierManager.goldStorage(state);
      state.gold = Math.min(storage, state.gold + rebate);
    }

    state.peddlerTab = { tier, round: 1, value: buyIn };
    return state.peddlerTab;
  },

  /** Pushes the open tab one more round -- pay the tier's buy-in again,
   *  roll tabSuccessChance for the NEXT round. Success grows the tab and
   *  advances round; a bust wipes the tab ENTIRELY (no partial refund),
   *  per direct design request -- "a bust is a bust," deliberately the
   *  sharper, more honest version of the loss rather than a softened
   *  one, since that's the one thing that makes this feel different
   *  from Cards/Dice. Grimsby's own rebate still applies to this push's
   *  fee regardless of the roll's outcome -- see repRebate's own
   *  comment for why. */
  runItUp(state: GameState): PeddlerTabRunResult | null {
    const tab = state.peddlerTab;
    if (!tab) return null;
    const buyIn = PeddlerManager.tabTierBuyIn(tab.tier);
    if (state.gold < buyIn) return null;
    const rebate = repRebate(state, buyIn);

    state.gold -= buyIn;
    state.stats.goldSpent += buyIn;
    state.stats.peddlerGoldSpent += buyIn;
    if (rebate > 0) {
      const storage = ModifierManager.goldStorage(state);
      state.gold = Math.min(storage, state.gold + rebate);
    }

    const nextRound = tab.round + 1;
    const chance = PeddlerManager.tabSuccessChance(nextRound);
    if (Math.random() < chance) {
      tab.value += PeddlerManager.tabRoundReward(tab.tier, nextRound);
      tab.round = nextRound;
      return { success: true, round: tab.round, value: tab.value, rebate };
    }

    state.peddlerTab = null;
    state.stats.peddlerBusts += 1;
    return { success: false, round: nextRound, value: 0, rebate };
  },

  /** Banks the open tab's current value and closes it. Settling at or
   *  past peddler.tab.jackpotRound counts as a jackpot -- both the
   *  shared peddlerJackpots counter (so it feeds the existing
   *  PEDDLER_JACKPOT achievement the same as any other game) and the
   *  Tab's own peddlerTabJackpots counter (for a dedicated Tab
   *  achievement, same "shared counter for the general achievement, own
   *  counter for the specific one" pattern peddlerHighRollerJackpots
   *  already established) -- per direct design request, on SETTLING
   *  specifically, not merely reaching the round and busting past it on
   *  a later push. Returns null if no tab is open (nothing to settle),
   *  the banked value otherwise. */
  settleTab(state: GameState): number | null {
    const tab = state.peddlerTab;
    if (!tab) return null;
    const storage = ModifierManager.goldStorage(state);
    state.gold = Math.min(storage, state.gold + tab.value);
    if (tab.round >= Tuning.get('peddler.tab.jackpotRound')) {
      state.stats.peddlerJackpots += 1;
      state.stats.peddlerTabJackpots += 1;
    }
    const { value } = tab;
    state.peddlerTab = null;
    return value;
  },
};
