import { EQUIPMENT, EQUIPMENT_BY_ID, LOOT_RARITY_BY_DIFFICULTY, RARITY_LOOT_CHANCE, gearScoreForItem } from '../data/equipment';
import {
  ChainDef, DIFFICULTIES, DIFFICULTY_ORDER, QUEST_CHAINS, QUEST_PREFIXES, QUEST_TEMPLATES, TUTORIAL_QUEST_ID,
} from '../data/quests';
import { HERO_CLASSES } from '../data/progression';
import { fastQuestCapsPerHour, fastQuestFloorPerHour, easyFastModeChances } from '../data/balance';
import { questEggDropChance } from '../data/pets';
import { CURIOS, questCurioDropChance } from '../data/curios';
import { INJURY_BY_ID, healthDamagePercentForInjuryDef } from '../data/items';
import { NODE_ORDER, MATERIAL_BY_ID } from '../data/materials';
import { warehouseCapacity } from '../data/harvestUpgrades';
import {
  ActiveQuest, AutoChainWeightBy, Difficulty, GameState, Hero, MaterialId, QuestOffer, QuestResult, Rarity,
} from '../types';
import { createRng, Rng, uid } from '../rng';
import { clamp, HOUR, MINUTE, sumMods } from '../util';
import { HeroManager } from './HeroManager';
import { EventManager } from './EventManager';
import { InventoryManager } from './InventoryManager';
import { Tuning } from '../data/tuning';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { PetManager } from './PetManager';
import { CurioManager } from './CurioManager';
import { PeddlerManager } from './PeddlerManager';
import { rerollDay, rerollsUsedToday, nextRerollCost } from '../data/reroll';
import { rollElementTags, elementalBonusForHero } from '../data/elements';

export const BOARD_SIZE = 6;
export const BOARD_REFRESH_MS = 30 * MINUTE;
export const MIN_SUCCESS = 5;
export const MAX_SUCCESS = 95;
/** Passive injuryResist stacking (upgrades/facilities/renown/gear/stats)
 *  can bring risk down close to zero but never quite reach it -- same
 *  "always some headroom" reasoning as MIN_SUCCESS above. Deliberately
 *  much smaller than MIN_SUCCESS's 5, since a 3% floor here is a rare
 *  bad-luck injury roll, not a routine one -- the preventInjury
 *  consumable (see Quest.injuryImmune) remains the only way to actually
 *  reach true zero, as a deliberate active choice rather than something
 *  passive stacking should ever fully replicate. */
export const MIN_INJURY_RISK = 3;

export const CHAIN_BY_ID: Record<string, ChainDef> = Object.fromEntries(QUEST_CHAINS.map((c) => [c.id, c]));

function lootTableFor(difficulty: Difficulty, rng: Rng): { defId: string; chance: number }[] {
  const rarities = LOOT_RARITY_BY_DIFFICULTY[difficulty] ?? ['common'];
  // raidExclusive (Heroic/Legendary tiered raid variants) filtered out here too
  // -- this pool predates that flag and was never updated when it was added,
  // the same gap the shop/black market had before 0075. Confirmed as the
  // actual cause of Legendary gear turning up in ordinary quest rewards: rarity
  // alone doesn't distinguish a raid-tier variant from its base item, since
  // they share the same rarity by design. craftable bases are excluded the
  // same way -- a Guildmade Blade dropping as ordinary loot, with none of
  // the customMods a real craft would give it, would just be a worse
  // version of the same item for no reason.
  // raidExclusive (Heroic/Legendary tiered raid variants) filtered out here too
  // -- this pool predates that flag and was never updated when it was added,
  // the same gap the shop/black market had before 0075. Confirmed as the
  // actual cause of Legendary gear turning up in ordinary quest rewards: rarity
  // alone doesn't distinguish a raid-tier variant from its base item, since
  // they share the same rarity by design. craftable bases are excluded the
  // same way -- a Guildmade Blade dropping as ordinary loot, with none of
  // the customMods a real craft would give it, would just be a worse
  // version of the same item for no reason. chainExclusive items (a
  // specific Quest Chain's guaranteed reward) get the same exclusion --
  // finding one as random loot before the chain grants it undercuts the
  // reward.
  const pool = EQUIPMENT.filter((e) => rarities.includes(e.rarity) && !e.raidExclusive && !e.craftable && !e.chainExclusive);
  if (pool.length === 0) return [];
  const picks = rng.shuffle(pool).slice(0, 3);
  return picks.map((def) => ({ defId: def.id, chance: RARITY_LOOT_CHANCE[def.rarity] }));
}

export const QuestManager = {
  /**
   * One hero's own contract pool -- each hero generates and keeps their
   * own board now (see the Quest Tab hero-log rework), rather than a
   * single shared 6-slot board the whole roster used to compete over.
   * Eligibility and burst caps scale off *this hero's* level, not the
   * guild's top hero, so a fresh recruit sees Easy/Normal contracts sized
   * for them instead of leftovers from a high-level main -- and, since
   * every hero has their own untouched pool, a large roster no longer
   * drains a shared board other heroes were relying on. Deterministic per
   * (window, hero id), so it survives reloads the same way the old shared
   * board did.
   */
  generateContractsForHero(state: GameState, hero: Hero, now: number, salt: number | string = 0): QuestOffer[] {
    const window = Math.floor(now / BOARD_REFRESH_MS);
    const rng = createRng(`board:${window}:${hero.id}:${state.createdAt}:${salt}`);
    const legendaryUnlocked = ModifierManager.hasUnlock(state, 'legendaryQuests');

    const available = DIFFICULTY_ORDER.filter((d) => {
      const cfg = DIFFICULTIES[d];
      if (d === 'legendary' && !legendaryUnlocked) return false;
      return hero.level + 2 >= cfg.reqLevel;
    });

    const offers: QuestOffer[] = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const difficulty = rng.weighted(available.map((d) => ({ item: d, weight: DIFFICULTIES[d].weight })));
      // Gathering Bounties only ever appear once Harvest itself is
      // unlocked -- a material-fetch offer makes no sense (and points at
      // a tab the player can't even see yet) before `the_first_haul` is
      // done. Rolled independently per slot, same shape any other
      // per-offer chance in this function would use.
      const seedTag = `q:${window}:${hero.id}:${salt}:${i}`;
      if (state.harvestUnlocked && rng.chance(Tuning.get('quest.gatheringBountyChance'))) {
        offers.push(QuestManager.generateGatheringOffer(difficulty, rng, seedTag, hero.level, legendaryUnlocked));
      } else {
        offers.push(QuestManager.generateOffer(difficulty, rng, seedTag, hero.level, false, legendaryUnlocked));
      }
    }

    // Guaranteed on-level offer: a hero could otherwise complete every
    // Easy contract in their own pool and have the window regenerate
    // into nothing but a tier they're not actually at yet -- both Easy
    // (reqLevel 1) and Normal (reqLevel 3) are simultaneously "eligible"
    // for a level 1-2 hero (the `hero.level + 2 >= reqLevel` window
    // above deliberately looks two levels ahead), so a run of bad RNG on
    // a small BOARD_SIZE pool can roll every single slot into the
    // higher, penalized tier and leave literally nothing the hero is
    // actually at-or-above level for -- reported directly, reproduced at
    // level 2 (an all-Normal board) and level 3 (2 Easy landed that
    // time, same board, pure chance). This is the same "small pool, high
    // variance" shape as the burst/standard duration guarantees below,
    // just for difficulty tier instead of duration -- and unlike those
    // two, going without ever hitting 0% isn't a flavour loss, it's every
    // offer on the board showing a red "reduced success chance" warning
    // with nothing else to send the hero on instead. Targets slot 0,
    // deliberately never colliding with the burst guarantee's last slot
    // or the standard-duration guarantee's second-to-last slot below.
    const onLevelDifficulty = [...available].reverse().find((d) => DIFFICULTIES[d].reqLevel <= hero.level) ?? available[0];
    if (onLevelDifficulty && !offers.some((o) => DIFFICULTIES[o.difficulty].reqLevel <= hero.level)) {
      offers[0] = QuestManager.generateOffer(
        onLevelDifficulty, rng, `q:${window}:${hero.id}:${salt}:guaranteed-on-level`, hero.level, false, legendaryUnlocked,
      );
    }

    // Every hero's board is their own now, so "no second pair of hands to
    // fall back on while waiting out a long quest" is true of every hero
    // individually, not just a one-hero guild -- guaranteed unconditionally
    // (this used to be gated on state.heroes.length <= 1, back when a
    // second hero could just pull from the same shared pool instead).
    // Skipped once burst itself has been tapered to 0% for this hero's own
    // level (see easyFastModeChances) -- forcing one on regardless would
    // silently override the taper's whole point. Medium/standard already
    // cover the "something to do soon" need by that point.
    if (
      easyFastModeChances(hero.level).burstChance > 0
      && !offers.some((o) => o.difficulty === 'easy' && o.duration <= 5 * MINUTE)
    ) {
      offers[offers.length - 1] = QuestManager.generateOffer('easy', rng, `q:${window}:${hero.id}:${salt}:guaranteed`, hero.level, true, legendaryUnlocked);
    }

    // Mirror guarantee for the other end of the spread: a heavy run of
    // burst/medium rolls (both explicitly generous per-offer, see quests.ts)
    // could otherwise fill a small low-level pool with nothing but short
    // contracts, leaving a hero with no genuine full-length quest to send on
    // at all -- a real reported gap, not hypothetical, since a fresh
    // hero's pool is small and Easy/Normal (the only tiers a low-level hero
    // is eligible for) are exactly where burst/medium are heaviest. "Standard"
    // here means an offer whose duration falls in its own difficulty's real
    // minDuration..maxDuration range -- burst/medium's own ranges never reach
    // that far (Easy's medium tops out at 40min, well under its own 1hr
    // floor), so checking against the offer's own difficulty is enough to
    // tell the modes apart without a dedicated field on QuestOffer. Targets
    // the second-to-last slot so it can never collide with the burst
    // guarantee above, which always owns the last slot.
    if (!offers.some((o) => o.duration >= DIFFICULTIES[o.difficulty].minDuration)) {
      const difficulty = rng.weighted(available.map((d) => ({ item: d, weight: DIFFICULTIES[d].weight })));
      const targetIndex = offers.length > 1 ? offers.length - 2 : 0;
      offers[targetIndex] = QuestManager.generateOffer(
        difficulty, rng, `q:${window}:${hero.id}:${salt}:guaranteed-standard`, hero.level, false, legendaryUnlocked, true,
      );
    }
    return offers;
  },

  /**
   * Gold cost of this hero's *next* quest-board reroll -- 0 while still
   * within today's free allowance (see ModifierManager.questFreeRerolls),
   * climbing per additional paid reroll after that. The free/paid count is
   * account-wide, not per hero -- rerolling three different heroes' boards
   * in one day spends from the same daily allowance as rerolling one
   * hero's board three times.
   */
  questRerollCost(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.questRerollsUsedToday, state.questRerollDay, now);
    const free = ModifierManager.questFreeRerolls(state);
    return nextRerollCost(used, free, 'reroll.questBaseCost', 'reroll.questCostGrowth');
  },

  /**
   * Replaces this one hero's own contract board with a freshly-rolled set,
   * spending today's next reroll (free or paid, per questRerollCost above).
   * Only touches `questBoards[hero.id]` -- the chain board and every other
   * hero's own contracts are untouched, and `boardRefreshedAt` (the natural
   * 30-min window clock) isn't reset either, so this doesn't push back the
   * next scheduled refresh for anyone.
   */
  rerollContractsForHero(state: GameState, hero: Hero, now: number): string | null {
    const day = rerollDay(now);
    if (state.questRerollDay !== day) {
      state.questRerollDay = day;
      state.questRerollsUsedToday = 0;
    }
    const cost = QuestManager.questRerollCost(state, now);
    if (cost > 0) {
      if (state.gold < cost) return `Not enough gold to reroll (needs ${cost}).`;
      state.gold -= cost;
      state.stats.goldSpent += cost;
    }
    state.questRerollsUsedToday += 1;
    // Salted with the exact reroll moment so this produces genuinely new
    // offers rather than reproducing the same window-seeded board --
    // generateContractsForHero's default (unsalted) seed is otherwise fully
    // deterministic per (window, hero), on purpose, for reload stability.
    // Frozen offer (if any) survives a reroll same as it survives the
    // natural window refresh -- see applyFrozenOffer.
    state.questBoards[hero.id] = QuestManager.applyFrozenOffer(
      state, hero, QuestManager.generateContractsForHero(state, hero, now, now),
    );
    return null;
  },

  /**
   * Splices `hero`'s currently-frozen contract (if any) into a freshly
   * generated board in place of one generated slot, so board size stays
   * exactly BOARD_SIZE either way. This is the one place all three "fully
   * regenerate this hero's board" paths converge (window refresh, a paid
   * reroll, and an Auto-Chain restock) -- call it right after generating a
   * fresh board rather than duplicating the splice logic at each call site.
   * A frozen offer currently being quested on (hero already sent on it) is
   * skipped -- it'll reappear once that quest resolves and the freeze is
   * still set, rather than showing twice.
   */
  applyFrozenOffer(state: GameState, hero: Hero, fresh: QuestOffer[]): QuestOffer[] {
    const frozen = state.frozenQuestOffers[hero.id];
    if (!frozen) return fresh;
    if (state.activeQuests.some((q) => q.offer.id === frozen.id)) return fresh;
    return [frozen, ...fresh.slice(0, Math.max(0, fresh.length - 1))];
  },

  /**
   * How many freeze changes `hero`'s guild still has today, given Board
   * Warden's level (see ModifierManager.freezeChangesPerDay). Unfreezing
   * doesn't spend from this allowance at all (see unfreezeOffer below) --
   * this only gates freezing a new contract. Same lazy day-reset shape as
   * the reroll systems -- the stored day/count only resets on next use,
   * not proactively. Account-wide, not per hero, same as the reroll
   * allowances.
   */
  freezeChangesRemaining(state: GameState, now: number): number {
    const used = rerollsUsedToday(state.freezeChangesUsedToday, state.freezeChangeDay, now);
    return Math.max(0, ModifierManager.freezeChangesPerDay(state) - used);
  },

  /**
   * Freezes one of `hero`'s own board contracts so it survives the next
   * window refresh, reroll, or Auto-Chain restock instead of being
   * replaced -- exactly one frozen slot per hero at a time. Freezing a new
   * offer silently replaces whichever one was already frozen for this
   * hero, rather than requiring an explicit unfreeze first. Spends one of
   * today's freeze changes (see freezeChangesRemaining); returns an error
   * string if none remain, or null on success, same shape as every other
   * gated action in this file. Unfreezing is deliberately NOT gated the
   * same way -- see unfreezeOffer -- so running out of freeze changes for
   * the day can never trap a player with a contract they no longer want
   * frozen.
   */
  freezeOffer(state: GameState, hero: Hero, offerId: string, now: number): string | null {
    const day = rerollDay(now);
    if (state.freezeChangeDay !== day) {
      state.freezeChangeDay = day;
      state.freezeChangesUsedToday = 0;
    }
    if (QuestManager.freezeChangesRemaining(state, now) <= 0) {
      return 'No freeze changes left today.';
    }
    const offer = (state.questBoards[hero.id] ?? []).find((o) => o.id === offerId && !o.chain);
    if (!offer) return 'That contract is no longer on the board.';
    state.freezeChangesUsedToday += 1;
    state.frozenQuestOffers[hero.id] = offer;
    return null;
  },

  /**
   * Clears whichever contract is frozen for `hero`, if any -- always free
   * and always available, regardless of today's freeze-change allowance.
   * Only freezing spends from that allowance (see freezeOffer); unfreezing
   * never does, on purpose -- a player who's used up today's freeze
   * changes should never be stuck holding a frozen contract they don't
   * want anymore. A no-op if nothing is currently frozen for this hero.
   */
  unfreezeOffer(state: GameState, hero: Hero, now: number): string | null {
    void now; // kept for signature symmetry with freezeOffer / future use
    delete state.frozenQuestOffers[hero.id];
    return null;
  },

  /**
   * Story-chain stage offers -- still one shared list, not per-hero.
   * ActiveChain tracks a chain's stage once per chainId (not owned by any
   * one hero), so every idle hero who qualifies sees the same current
   * stage on their own tab, exactly as any idle hero could pick up any
   * chain offer on the old shared board.
   */
  generateChainBoard(state: GameState, now: number): QuestOffer[] {
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const window = Math.floor(now / BOARD_REFRESH_MS);
    const rng = createRng(`chains:${window}:${state.createdAt}`);
    const offers: QuestOffer[] = [];
    if (ModifierManager.hasUnlock(state, 'chains')) {
      for (const chain of QUEST_CHAINS) {
        if (state.completedChains.includes(chain.id)) continue;
        if (topLevel < chain.reqLevel) continue;
        const active = state.activeChains.find((c) => c.chainId === chain.id);
        // Only gates a chain that hasn't been started yet -- an existing
        // save could already have one of these active from before this
        // prerequisite existed (level gates alone never guaranteed
        // completion order), and stranding someone mid-story on a save
        // migration would be a real regression, not a feature.
        if (!active && chain.requiresChainId && !state.completedChains.includes(chain.requiresChainId)) continue;
        const stage = active?.stage ?? 0;
        if (stage >= chain.stages.length) continue;
        offers.push(QuestManager.chainOffer(chain, stage, rng));
      }
    }
    return offers;
  },

  generateOffer(
    difficulty: Difficulty, rng: Rng, seedTag: string, topLevel: number,
    forceBurst = false, legendaryUnlocked = false, forceStandard = false,
  ): QuestOffer {
    const cfg = DIFFICULTIES[difficulty];
    const tierIndex = DIFFICULTY_ORDER.indexOf(difficulty);
    const eligible = QUEST_TEMPLATES.filter((t) => {
      if (!t.minDifficulty) return true;
      return DIFFICULTY_ORDER.indexOf(t.minDifficulty) <= tierIndex;
    });
    const template = rng.pick(eligible.length > 0 ? eligible : QUEST_TEMPLATES);
    const subject = rng.pick(template.subjects);
    const prefix = rng.chance(18) ? `${rng.pick(QUEST_PREFIXES)} ` : '';

    // Duration and reward used to be rolled independently, which meant a
    // quest at the short end of a tier's range paid exactly as well as one at
    // the long end. Reward now interpolates across whichever range was
    // actually rolled. Burst and medium quests each use their own explicit
    // reward range (deliberately generous — see the comment on
    // burstMinGold) rather than a proportional slice of the full range,
    // which measured out to 1-2 XP per burst quest — mathematically fair,
    // but reads as insulting rather than the "numbers going up" feeling
    // this is supposed to deliver. Burst is checked first, medium only gets
    // a chance if burst didn't hit, so an offer is never both at once.
    // forceStandard is the mirror image of forceBurst below -- used by
    // generateContractsForHero's own "don't run dry on real quests" guarantee
    // to force a genuine full-length offer regardless of what the burst/
    // medium rolls would have produced.
    //
    // Easy's own burst/medium chance is overridden by level -- see
    // easyFastModeChances's own comment. Every other tier still reads
    // straight off DIFFICULTIES, since burst/medium currently only exist
    // on Easy at all.
    const fastChances = difficulty === 'easy' ? easyFastModeChances(topLevel) : undefined;
    const effectiveBurstChance = fastChances ? fastChances.burstChance : cfg.burstChance;
    const effectiveMediumChance = fastChances ? fastChances.mediumChance : cfg.mediumChance;
    const useBurst = !forceStandard && (forceBurst || (
      effectiveBurstChance !== undefined && effectiveBurstChance > 0 && rng.chance(effectiveBurstChance)
    ));
    const useMedium = !forceStandard && !useBurst
      && effectiveMediumChance !== undefined && effectiveMediumChance > 0 && rng.chance(effectiveMediumChance);
    const durMin = useBurst ? cfg.burstMinDuration! : useMedium ? cfg.mediumMinDuration! : cfg.minDuration;
    const durMax = useBurst ? cfg.burstMaxDuration! : useMedium ? cfg.mediumMaxDuration! : cfg.maxDuration;
    const duration = rng.int(durMin, durMax);
    const span = durMax - durMin;
    const t = span > 0 ? (duration - durMin) / span : 1;
    const goldMin = useBurst ? cfg.burstMinGold! : useMedium ? cfg.mediumMinGold! : cfg.minGold;
    const goldMax = useBurst ? cfg.burstMaxGold! : useMedium ? cfg.mediumMaxGold! : cfg.maxGold;
    const xpMin = useBurst ? cfg.burstMinXp! : useMedium ? cfg.mediumMinXp! : 18;
    const xpMax = useBurst ? cfg.burstMaxXp! : useMedium ? cfg.mediumMaxXp! : 30;
    let rewardGold = Math.max(1, Math.round(goldMin + t * (goldMax - goldMin)));
    let rewardXp = Math.floor((xpMin + t * (xpMax - xpMin)) * cfg.xpMultiplier);

    // Both fast-completion modes are capped at ~80-85% of whatever the best
    // currently-unlocked tier pays per hour -- live, computed from
    // DIFFICULTIES itself rather than a flat decay curve, so neither can
    // silently become the mathematically dominant strategy the way the old
    // flat burst taper did (confirmed directly: its 0.2 floor never
    // actually dropped burst below the best unlocked tier until very
    // late). Untouched below level 5 -- the deliberate onboarding hook,
    // confirmed not the problem.
    if (useBurst || useMedium) {
      const rawGold = rewardGold;
      const rawXp = rewardXp;
      const durationHours = duration / HOUR;
      const caps = fastQuestCapsPerHour(topLevel, legendaryUnlocked);
      rewardGold = Math.min(rawGold, Math.max(1, Math.round(caps.gold * durationHours)));
      rewardXp = Math.min(rawXp, Math.floor(caps.xp * durationHours));

      // The cap above can legitimately crush a very short duration down to
      // the bare "1" minimum -- mathematically necessary for the cap to
      // mean anything, but reads as insulting rather than "a smaller but
      // real reward" (this was the actual player-reported complaint that
      // led here). Floors it back up to at least what the offer's OWN
      // tier would pay for this same duration at its own uncapped rate --
      // see fastQuestFloorPerHour's own comment for why this specific
      // anchor can never let a fast-mode offer out-earn the player's real
      // best-unlocked tier, even though it visibly improves the worst
      // case. Clamped to never exceed the raw pre-cap roll -- a floor,
      // not a second, looser cap.
      const floor = fastQuestFloorPerHour(cfg);
      const floorGold = Math.max(1, Math.round(floor.gold * durationHours));
      const floorXp = Math.max(1, Math.round(floor.xp * durationHours));
      rewardGold = Math.max(rewardGold, Math.min(rawGold, floorGold));
      rewardXp = Math.max(rewardXp, Math.min(rawXp, floorXp));
    }

    return {
      id: `${seedTag}:${difficulty}:${subject.replace(/\s+/g, '_')}`,
      name: `${prefix}${template.verb} ${subject}`,
      flavour: rng.pick(template.flavour),
      difficulty,
      tag: template.tag,
      duration,
      baseSuccess: cfg.baseSuccess,
      rewardGold,
      rewardXp,
      loot: lootTableFor(difficulty, rng),
      reqLevel: cfg.reqLevel,
      vulnerableTo: rollElementTags(rng, difficulty),
      dealsElement: rollElementTags(rng, difficulty),
    };
  },

  /**
   * A special-case offer variant, rolled instead of an ordinary
   * generateOffer() result at generateContractsForHero's own chance (see
   * quest.gatheringBountyChance). Reuses generateOffer for everything
   * that doesn't need to change (duration/gold/xp/success/loot all still
   * come from the same difficulty-tier math every other offer uses) and
   * only overrides name/flavour/tag and attaches the guaranteed
   * `materialReward` -- deliberately not a parallel implementation, so
   * this automatically inherits any future tuning change to burst/medium
   * modes, caps, or elemental rolls without needing its own copy kept in
   * sync.
   *
   * `amount` is duration-scaled off quest.gatheringMaterialPerHour --
   * see that tuning entry's own description for the exact "slightly
   * below optimal manual clicking" math it's calibrated against.
   */
  generateGatheringOffer(
    difficulty: Difficulty, rng: Rng, seedTag: string, topLevel: number, legendaryUnlocked = false,
  ): QuestOffer {
    const base = QuestManager.generateOffer(difficulty, rng, seedTag, topLevel, false, legendaryUnlocked);
    const materialId: MaterialId = rng.pick(NODE_ORDER);
    const materialName = MATERIAL_BY_ID[materialId]?.name ?? materialId;
    const perHour = Tuning.get('quest.gatheringMaterialPerHour');
    const amount = Math.max(1, Math.round((perHour * base.duration) / HOUR));
    return {
      ...base,
      name: `Gathering Bounty: ${materialName}`,
      flavour: `A standing request to bring back as much ${materialName.toLowerCase()} as a hero can carry -- less than a full day at the actual gathering grounds would net, but nobody's asking this hero to stand there clicking either.`,
      tag: 'explore',
      materialReward: { materialId, amount },
    };
  },

  chainOffer(chain: ChainDef, stage: number, rng: Rng): QuestOffer {
    const stageDef = chain.stages[stage];
    const cfg = DIFFICULTIES[stageDef.difficulty];
    return {
      id: `chain:${chain.id}:${stage}`,
      name: `${chain.name} — ${stageDef.name}`,
      flavour: stageDef.flavour,
      difficulty: stageDef.difficulty,
      tag: stageDef.tag,
      duration: stageDef.duration,
      baseSuccess: cfg.baseSuccess,
      rewardGold: Math.floor(cfg.maxGold * stageDef.goldMultiplier),
      rewardXp: Math.floor(28 * cfg.xpMultiplier * 1.5),
      loot: lootTableFor(stageDef.difficulty, rng),
      reqLevel: chain.reqLevel,
      chain: { chainId: chain.id, stage, totalStages: chain.stages.length },
    };
  },

  /**
   * Picks the best quest currently on offer for a hero — the highest-paying
   * quest at 50%+ odds, otherwise the best odds available rather than
   * stalling. Used by Auto-Chain to pick a hero's next contract without the
   * player choosing it themselves.
   *
   * Chain offers are deliberately excluded, always. ActiveChain has no
   * per-hero ownership (any hero can advance any chain's stage), so "only
   * auto-continue a chain this specific hero already started" isn't
   * something the data model can express -- and without that guard, every
   * idle hero's auto-continue independently grabbed the first chain offer
   * it saw, which is how multiple heroes ended up piling into the same
   * handful of chains instead of a spread of ordinary board contracts.
   * Chain progression -- first stage or last -- always goes through the
   * manual Assign Hero flow instead, on purpose: these are the quests with
   * real narrative weight, and shouldn't start or advance without the
   * player noticing.
   */
  pickBestQuest(state: GameState, hero: Hero, now: number): QuestOffer | null {
    const eligible = (state.questBoards[hero.id] ?? []).filter((o) => hero.level >= o.reqLevel && !o.chain);
    if (eligible.length === 0) return null;
    const scored = eligible.map((o) => ({ o, p: QuestManager.previewSuccess(state, hero, o, hero.equippedConsumables ?? [], now) }));
    // Chain Tactics (unlocks: 'autoChainTactics') lets the player override
    // both the floor and the tiebreaker below -- unowned, this reduces to
    // exactly the original hardcoded behavior (50% floor, sort by gold),
    // so a guild without the upgrade sees no change at all.
    const tactics = ModifierManager.hasUnlock(state, 'autoChainTactics') ? state.autoChainTactics : undefined;
    const floor = tactics?.successFloor ?? 50;
    const weightBy = tactics?.weightBy ?? 'gold';
    const viable = scored.filter((e) => e.p >= floor).sort((a, b) => QuestManager.autoChainWeight(b.o, weightBy) - QuestManager.autoChainWeight(a.o, weightBy));
    if (viable.length > 0) return viable[0].o;
    return scored.sort((a, b) => b.p - a.p)[0].o;
  },

  /**
   * The score pickBestQuest's viable-offer tiebreaker sorts by, once
   * Chain Tactics unlocks a choice of which axis to prefer. 'gold'
   * reproduces the picker's original single-axis sort exactly. Offers
   * don't carry a single scalar "loot value" the way gold/xp are already
   * flat numbers, so 'loot' uses loot.length (how many rolls this offer
   * grants) as the stand-in, and 'balanced' folds all three into one
   * blended score rather than optimizing only one axis -- weights are a
   * first-pass judgment call (100 gold ~ 1 xp ~ 1 loot roll), not derived
   * from any existing conversion rate elsewhere in the game.
   */
  autoChainWeight(o: QuestOffer, weightBy: AutoChainWeightBy): number {
    switch (weightBy) {
      case 'xp': return o.rewardXp;
      case 'loot': return o.loot.length;
      case 'balanced': return o.rewardGold / 100 + o.rewardXp + o.loot.length * 50;
      case 'gold':
      default: return o.rewardGold;
    }
  },

  /**
   * Success chance preview, used by the UI and locked in at departure.
   *
   * The level/stat-derived portion of a hero's mods (the flat `level *
   * 0.4` term, plus the str/end curve inside statMods) both scale off the
   * hero's *raw* level -- which used to mean a hero standing exactly at a
   * quest's own reqLevel, with zero gear or spent stat points, was still
   * carrying the full "free" bonus of every level it took to get there.
   * reqLevel ended up barely gating anything. That part -- the automatic,
   * zero-investment growth every hero of this class gets just from being
   * hero.level -- is still fully isolated out below via `baselineStats`/
   * `autoGrowthStats`, same as before, and still flows through completely
   * uncurved: it's what makes genuinely out-levelling a quest (not just
   * gearing up for one at your own level) the one lever that can still
   * reach MAX_SUCCESS on its own. HeroManager.heroMods/statMods
   * themselves are left untouched throughout (they're also used for the
   * Heroes panel's raw stat display and for raids, neither of which has
   * this "gated by reqLevel" framing) -- only this preview does any of
   * this split.
   *
   * Everything else -- equipped gear, consumables, guild facilities,
   * renown perks, spent stat points, elemental matchups, the
   * preferred-tag bonus -- is real, active *investment*, and now goes
   * through `QuestManager.curveInvestment` as one combined total before
   * being added on top of baseSuccess. This replaced an earlier flat cap
   * (a hard ceiling on at-level success, tuned against real playtest
   * numbers) once it became clear a hard wall kills the incentive to
   * bother with the last few points of investment at all -- once a build
   * was capped, a consumable or an elemental-matched enchant did
   * literally nothing, which is exactly backwards for a stat a player is
   * meant to keep optimizing. A smooth diminishing curve keeps every
   * source worthwhile (each additional point of investment still helps,
   * just by less and less) while still preventing modest gear alone from
   * blowing through a tier's own baseSuccess the way pure linear stacking
   * did. `quest.investmentLinearThreshold` (raw points that still count
   * 1:1) and `quest.investmentDiminishingCapExtra`/`Decay` (the
   * asymptotic extra beyond that, approached but never quite reached) are
   * all tunable -- see guild-idler-status.md's "Quest success rebalance"
   * writeup for the before/after numbers these were checked against,
   * including real gear pulled from equipment.json against two actual
   * playtester heroes.
   *
   * Going the other way -- attempting a quest *above* the hero's own
   * level -- is a deliberate, opt-in trade now rather than blocked
   * outright (see `start`'s own comment for why). `overLevelPenalty`
   * below is the cost of that trade: `quest.overLevelPenaltyPercent`
   * (tunable, default 10) success points per level of gap between the
   * hero and offer.reqLevel, on top of everything else. A hero already
   * at or above reqLevel pays nothing extra here -- this only ever
   * subtracts, never adds. Left uncurved, same as the outlevel bonus --
   * both are level-gap terms, not investment.
   */
  previewSuccess(state: GameState, hero: Hero, offer: QuestOffer, consumables: string[], now: number): number {
    const loadout = InventoryManager.loadoutEffects(state, consumables);
    const classDef = HERO_CLASSES[hero.heroClass];
    // Every chain stage now carries its own authored tag (see
    // ChainStageDef.tag / chainOffer) rather than the old hardcoded
    // 'explore' every stage in the game used to share -- so the preferred
    // bonus applies to chain offers exactly the same way it does to
    // ordinary board contracts now, matching whatever that specific stage
    // is actually about.
    const preferred = classDef.preferred.includes(offer.tag) ? classDef.preferredBonus : 0;

    // Split the hero's stat-derived success into the automatic half (zero
    // gear/points spent, same shape baselineStats already computes for a
    // quest's own reqLevel -- just evaluated at the hero's OWN level too)
    // and the invested half (gear + spent stat points on top of that).
    // Only the invested half is curved below.
    const autoGrowthStats = HeroManager.baselineStats(hero.heroClass, hero.level);
    const baselineStats = HeroManager.baselineStats(hero.heroClass, offer.reqLevel);
    const autoGrowthSuccess = HeroManager.statMods(autoGrowthStats).success ?? 0;
    const baselineSuccess = HeroManager.statMods(baselineStats).success ?? 0;
    const totalStatSuccess = HeroManager.statMods(HeroManager.totalStats(hero)).success ?? 0;
    const investedStatSuccess = totalStatSuccess - autoGrowthSuccess;

    const investedMods = sumMods(
      classDef.mods,
      HeroManager.equipmentMods(hero),
      HeroManager.injuryMods(hero, now),
      HeroManager.healthMods(hero),
      ModifierManager.petModsForHero(state, hero, now),
      ModifierManager.global(state),
      loadout.mods,
      { success: preferred },
    );
    const elemental = elementalBonusForHero(hero, offer);
    const investmentRaw = investedStatSuccess + (investedMods.success ?? 0) + elemental;
    const investmentCurved = QuestManager.curveInvestment(investmentRaw);

    const outlevelBonus = (autoGrowthSuccess - baselineSuccess) + (hero.level - offer.reqLevel) * 0.4;
    const levelGap = Math.max(0, offer.reqLevel - hero.level);
    const overLevelPenalty = levelGap * Tuning.get('quest.overLevelPenaltyPercent');

    return clamp(
      offer.baseSuccess + investmentCurved + outlevelBonus - overLevelPenalty,
      MIN_SUCCESS,
      MAX_SUCCESS,
    );
  },

  /**
   * Diminishing-returns curve applied to a hero's combined *invested*
   * success bonus -- see previewSuccess's own comment above for the full
   * reasoning. The first `investmentLinearThreshold` raw points still
   * count fully 1:1 (early gear/potions feel exactly as good as they used
   * to). Past that, each further point buys less: a continuous
   * exponential approach to `investmentLinearThreshold +
   * investmentDiminishingCapExtra`, with slope exactly 1 at the threshold
   * itself so there's no discontinuous jump. Never a hard wall -- one
   * more enchant or potion always helps a little, it just gets harder and
   * harder to matter, which is what keeps min-maxing worthwhile instead
   * of pointless once a hero's gear already covers the easy points.
   * Negative input (an injury, missing Health) passes through unchanged
   * below the threshold -- penalties should never be softened by this.
   */
  curveInvestment(raw: number): number {
    const threshold = Tuning.get('quest.investmentLinearThreshold');
    if (raw <= threshold) return raw;
    const capExtra = Tuning.get('quest.investmentDiminishingCapExtra');
    const decay = Tuning.get('quest.investmentDiminishingDecay');
    const excess = raw - threshold;
    return threshold + capExtra * (1 - Math.exp(-excess / decay));
  },

  previewDuration(state: GameState, hero: Hero, offer: QuestOffer, now: number): number {
    const mods = sumMods(HeroManager.heroMods(state, hero, now), ModifierManager.global(state));
    const factor = clamp(1 - mods.speed / 100, 0.25, 1.75);
    return Math.max(MINUTE, Math.floor(offer.duration * factor));
  },

  /**
   * Direct player feedback: running out of same-level quests between board
   * refreshes (especially likely right after a couple of short burst
   * quests clear) left a hero simply idle with nothing to do. Rather than
   * only tuning board supply/refresh timing, a hero can now be sent on a
   * quest *above* their own level -- previously a hard block here
   * (`hero.level < offer.reqLevel` used to return an error outright) --
   * at reduced odds instead of being blocked outright. See
   * previewSuccess's own comment for exactly how that penalty is
   * computed; MIN_SUCCESS (5) still applies, so it's always technically
   * attemptable, never a free pass or a true dead end. Auto-Chain
   * (`pickBestQuest`) deliberately still only picks quests a hero already
   * qualifies for -- reaching above your level is an explicit, opt-in
   * trade a player makes on purpose, not something automation should do
   * on its own.
   */
  start(
    state: GameState, hero: Hero, offer: QuestOffer, consumables: string[], now: number,
  ): { quest?: ActiveQuest; error?: string } {
    if (hero.status === 'questing') return { error: `${hero.name} is already out.` };
    if (hero.status === 'fallen') return { error: `${hero.name} is Fallen and needs to be revived first.` };

    // A hero's equipped consumable slots can end up pointing at an item the
    // guild no longer actually has -- the previous version of this hard-
    // failed the whole send with "Not enough consumables for that loadout"
    // whenever that happened, which is exactly what a slot still assigned
    // to an item consumed on a PRIOR send does (equipping never touches
    // state.inventory; the deduction below is what actually spends the
    // item, and nothing ever cleared the slot afterward). That turned "used
    // your last potion last time" into "this hero can never be sent again
    // until you notice and manually unequip," and made sendAllIdle silently
    // skip every affected hero, reporting "no idle heroes have an open
    // contract" even though they plainly did. Fixed by reconciling instead
    // of failing: drop whatever's no longer actually in stock and proceed
    // with whatever legitimately still is, keeping the hero's own equipped
    // slots in sync so the next send doesn't hit the same wall.
    const remaining: Record<string, number> = {};
    consumables = consumables.filter((id) => {
      remaining[id] = remaining[id] ?? InventoryManager.count(state, id);
      if (remaining[id] > 0) {
        remaining[id] -= 1;
        return true;
      }
      return false;
    });
    if (hero.equippedConsumables) hero.equippedConsumables = [...consumables];

    const loadout = InventoryManager.loadoutEffects(state, consumables);
    const classDef = HERO_CLASSES[hero.heroClass];
    const preferred = classDef.preferred.includes(offer.tag) ? classDef.preferredBonus : 0;
    const mods = sumMods(
      HeroManager.heroMods(state, hero, now),
      ModifierManager.global(state),
      loadout.mods,
      { success: preferred },
    );

    const quest: ActiveQuest = {
      id: uid('quest'),
      heroId: hero.id,
      offer,
      startedAt: now,
      endsAt: now + QuestManager.previewDuration(state, hero, offer, now),
      finalSuccess: QuestManager.previewSuccess(state, hero, offer, consumables, now),
      goldMultiplier: 1 + mods.gold / 100,
      xpMultiplier: 1 + mods.xp / 100,
      lootBonus: mods.loot,
      injuryResist: mods.injuryResist,
      injuryImmune: loadout.preventInjury,
      consumables,
      guaranteedGoodEvent: loadout.guaranteedGoodEvent,
      healthDamageReduction: loadout.healthDamageReduction,
    };

    for (const id of consumables) InventoryManager.remove(state, id);
    hero.status = 'questing';
    hero.activeQuestId = quest.id;
    state.activeQuests.push(quest);
    // Chain stages come off the shared chainBoard; ordinary contracts come
    // off specifically the sending hero's own board -- a contract offer
    // only ever exists in that one hero's pool to begin with.
    if (offer.chain) {
      state.chainBoard = state.chainBoard.filter((o) => o.id !== offer.id);
    } else {
      const board = state.questBoards[hero.id];
      if (board) state.questBoards[hero.id] = board.filter((o) => o.id !== offer.id);
    }
    // Sending a hero on their own frozen contract clears the freeze --
    // it's been used, not "changed", so this doesn't touch today's freeze
    // allowance the way an explicit unfreeze does.
    if (state.frozenQuestOffers[hero.id]?.id === offer.id) {
      delete state.frozenQuestOffers[hero.id];
    }
    return { quest };
  },

  /**
   * Resolves a finished quest. Deterministic in the quest id, so the outcome is
   * identical whether it is resolved live or on the next launch.
   */
  resolve(state: GameState, quest: ActiveQuest, resolvedAt: number): QuestResult {
    const rng = createRng(quest.id);
    const hero = state.heroes.find((h) => h.id === quest.heroId);
    const heroName = hero?.name ?? 'A hero';

    const events = EventManager.roll(quest, rng);
    const finalSuccess = clamp(quest.finalSuccess + events.successDelta, MIN_SUCCESS, MAX_SUCCESS);
    const success = rng.chance(finalSuccess);

    const cfg = DIFFICULTIES[quest.offer.difficulty];
    let gold = 0;
    let xp = 0;
    const loot: QuestResult['loot'] = [];
    let eggDropped: QuestResult['eggDropped'];
    let curioGained: QuestResult['curioGained'];

    if (success) {
      gold = Math.floor(quest.offer.rewardGold * quest.goldMultiplier * (1 + events.goldPct)) + events.flatGold;
      xp = Math.floor(quest.offer.rewardXp * quest.xpMultiplier * (1 + events.xpPct));
      // Two separate multiplicative stages now, not one combined additive
      // sum -- quest.lootBonus (difficulty + equipment + guild/renown, all
      // account-wide) still applies as before, but the hero's own Luck
      // stat is applied as its own independent stage via
      // personalLootBonus, recomputed fresh here from current stats rather
      // than locked in at departure (no ActiveQuest schema change needed;
      // stats essentially never change mid-quest in practice). See
      // HeroManager.personalLootBonus for why this moved.
      const lootChance = cfg.lootChance + quest.lootBonus + events.lootDelta;
      const personalLoot = hero ? HeroManager.personalLootBonus(HeroManager.totalStats(hero)) : 0;
      for (const entry of quest.offer.loot) {
        const chance = Math.min(90, entry.chance * (1 + lootChance / 100) * (1 + personalLoot / 100));
        if (rng.chance(chance)) {
          const def = EQUIPMENT_BY_ID[entry.defId];
          if (def) loot.push({ defId: def.id, name: def.name, rarity: def.rarity });
        }
      }
      // Ordinary egg drop -- flat per-difficulty chance (not scaled by
      // lootChance/personalLoot the way equipment is; kept as its own
      // simple independent roll since eggs aren't part of the equipment-
      // loot economy at all). Rarity is fixed per difficulty tier -- see
      // the pets.questEggDropChance.* tuning descriptions for why.
      if (rng.chance(questEggDropChance(quest.offer.difficulty))) {
        const rarities = LOOT_RARITY_BY_DIFFICULTY[quest.offer.difficulty] ?? ['common'];
        const rarity = rarities[rarities.length - 1];
        PetManager.grantEgg(state, rarity, undefined, resolvedAt);
        eggDropped = { rarity };
      }
      // Ordinary curio drop -- same independent-roll shape as the egg
      // drop directly above (flat per-difficulty chance, not scaled by
      // lootChance/personalLoot), just for CurioManager's sellable-junk
      // pool instead of PetManager's eggs. Uses the quest's own seeded
      // rng (not raw Math.random) for which curio, same determinism
      // convention every other roll in this function already follows.
      // Silently does nothing if CURIOS is empty (no curios authored
      // yet) -- same "degrade gracefully" precedent as everywhere else
      // a content pool might come up empty.
      if (CURIOS.length > 0 && rng.chance(questCurioDropChance(quest.offer.difficulty))) {
        const picked = CURIOS[rng.int(0, CURIOS.length - 1)];
        CurioManager.add(state, picked.id, 1);
        curioGained = { curioId: picked.id, amount: 1 };
      }
    } else {
      // Failure still pays a small consolation and a little experience.
      gold = Math.floor(quest.offer.rewardGold * 0.15 * quest.goldMultiplier) + Math.max(0, events.flatGold);
      xp = Math.floor(quest.offer.rewardXp * 0.3 * quest.xpMultiplier);
    }
    gold = Math.max(0, gold);

    /* --------------------------- gathering bounty --------------------------- */
    // Independent of the success/failure gold-xp branch above -- a
    // Gathering Bounty's material payout follows the exact same
    // full-on-success / 15%-consolation-on-failure shape gold already
    // does, just applied to state.materials instead. Capped by warehouse
    // capacity same as a manual HarvestManager.catch, so a bounty landing
    // while the Warehouse is already full doesn't silently overflow it.
    let materialGained: QuestResult['materialGained'];
    if (quest.offer.materialReward) {
      const { materialId, amount } = quest.offer.materialReward;
      const rawAmount = success ? amount : Math.floor(amount * 0.15);
      if (rawAmount > 0) {
        const cap = warehouseCapacity(state.warehouseLevel);
        const gained = Math.max(0, Math.min(rawAmount, cap - state.materials[materialId]));
        state.materials[materialId] += gained;
        materialGained = { materialId, amount: gained };
      }
    }

    // Critical Burst -- a rare, purely random spike on top of the normal
    // reward roll, independent of the daily first-burst floor below (both
    // can fire on the same quest, on a very good day -- that's intended,
    // not a bug to dedupe). Scoped to gold/xp only, not loot chance, which
    // already has its own personalLoot stage -- keeping crit to raw
    // currency keeps it legible as "this run just paid extra" rather than
    // becoming a second loot system layered on the first. Only rolls on
    // success; a failed quest already pays a reduced consolation and
    // doesn't need an additional random axis.
    let critBonus = false;
    if (success && rng.chance(Tuning.get('quest.critChance'))) {
      critBonus = true;
      const mult = Tuning.get('quest.critMultiplier');
      gold = Math.floor(gold * mult);
      xp = Math.floor(xp * mult);
    }

    // Daily first-burst bonus -- see Hero.lastBurstBonusDay's own comment
    // for why a once-per-day event can safely be generous where every
    // other lever in the burst formula has to stay conservative. Applied
    // after success/failure is already resolved, as a GUARANTEED MINIMUM
    // (Math.max), not a multiplier -- a multiplier was tried first and
    // caught by direct testing before it shipped: it multiplies whatever
    // the roll already produced, so a failed first burst (which can
    // legitimately pay 0 gold after the 15% failure-payout reduction)
    // stayed at exactly 0 regardless of the multiplier, defeating the
    // entire point of guaranteeing a meaningful first experience. A flat
    // floor sidesteps that -- it doesn't matter what the underlying roll
    // or outcome was, the first burst of the day always pays out at
    // least this much. Regardless of duration within the burst range --
    // simplest possible rule: first burst-mode quest this hero finishes
    // each day, full stop. Burst-mode is identified the same way
    // generateOffer's own useBurst check would have (duration within the
    // tier's own burst range), rather than adding a field to QuestOffer
    // just to remember which mode generated it.
    let dailyBurstBonus = false;
    if (hero && cfg.burstMaxDuration !== undefined && quest.offer.duration <= cfg.burstMaxDuration) {
      const today = rerollDay(resolvedAt);
      if (hero.lastBurstBonusDay !== today) {
        hero.lastBurstBonusDay = today;
        dailyBurstBonus = true;
        gold = Math.max(gold, Tuning.get('quest.dailyBurstBonusGold'));
        xp = Math.max(xp, Tuning.get('quest.dailyBurstBonusXp'));
      }
    }

    /* ------------------------------- injury ------------------------------- */
    let injury: QuestResult['injury'];
    const injuryRisk = success
      ? (events.forcedInjury ? 25 : 0)
      : clamp(35 + DIFFICULTY_ORDER.indexOf(quest.offer.difficulty) * 8 - quest.injuryResist, MIN_INJURY_RISK, 90);
    // Tutorial quest: forces this branch regardless of injuryRisk/rng --
    // see tutorialQuestOffer's own doc comment in quests.ts for why a
    // guaranteed injury (and guaranteed broken gear, below) is the whole
    // point of this specific quest rather than a maybe. Still respects
    // injuryImmune (a genuine preventInjury consumable, deliberately
    // equipped before this send) -- forcing the LESSON isn't the same as
    // overriding a player's own deliberate choice on the rare chance
    // they've already found their way to a Protection Charm by quest one.
    const isTutorialQuest = quest.offer.id === TUTORIAL_QUEST_ID;
    if (!quest.injuryImmune && (isTutorialQuest || rng.chance(injuryRisk))) {
      injury = HeroManager.rollInjury(rng, quest.offer.difficulty);
      injury.healsAt = resolvedAt + (injury.healsAt - Date.now());
      // Health damage piggybacks directly on this same roll rather than a
      // separate trigger -- see items.ts's healthDamagePercentForInjuryDef
      // and guild-idler-status.md's Health stat + Fallen/death mechanic
      // section. A hero can be sent home Fallen from an ordinary quest,
      // same as any other injury outcome -- there's no special handling
      // needed here beyond applying the damage; HeroManager.applyHealthDamage
      // itself flips hero.status to 'fallen' if this drops them to 0.
      if (hero) {
        const def = INJURY_BY_ID[injury.id];
        if (def) {
          // Guardian's Retainer-style loadout mitigation, baked into
          // quest.healthDamageReduction at send time -- applied here as
          // a straight percentage cut of the damage, not the resolved
          // injury itself (the injury and its own success/speed mods
          // still happen; only the Health cost is softened).
          const reduction = quest.healthDamageReduction ?? 0;
          const damagePercent = healthDamagePercentForInjuryDef(def) * (1 - reduction / 100);
          HeroManager.applyHealthDamage(hero, damagePercent);
          // Real per-hero pet pairing (see Hero.equippedPetId): whichever
          // pet is paired with THIS hero shares the exact same
          // damagePercent -- same % of ITS OWN Max Health, not a
          // separate roll, not scaled down. Guardian's Retainer already
          // protects both for free since the reduction is baked into
          // damagePercent before either applies it.
          if (hero.equippedPetId) {
            const pet = state.pets.find((p) => p.uid === hero.equippedPetId);
            if (pet) PetManager.applyHealthDamage(state, pet, damagePercent);
          }
        }
      }
    }

    /* ----------------------------- durability ----------------------------- */
    const baseWear = 3 + DIFFICULTY_ORDER.indexOf(quest.offer.difficulty) * 2 + (success ? 0 : 4);
    // Tutorial quest: forced far past any equipped item's own
    // maxDurability (the starter Wooden Practice Sword's is 10) so it's
    // guaranteed to break outright, not just wear down -- same "the
    // lesson isn't a maybe" reasoning as the forced injury above.
    // EquipmentManager.applyWear already clamps at 0, so this can't push
    // durability negative or otherwise misbehave.
    const wear = isTutorialQuest ? 9999 : baseWear + events.durabilityDelta;
    const globalMods = ModifierManager.global(state);
    const broken = hero ? EquipmentManager.applyWear(hero, wear, globalMods.durability) : [];

    /* ----------------------------- apply -------------------------------- */
    let levelsGained = 0;
    if (hero) {
      levelsGained = HeroManager.grantXp(hero, xp);
      if (injury) hero.injuries.push(injury);
      // Don't stomp Fallen back to idle -- HeroManager.applyHealthDamage
      // (above, in the injury block) may have just set this hero to
      // 'fallen' as part of resolving THIS quest. They still came home
      // (activeQuestId clears either way), they just can't be sent back
      // out until revived.
      if (hero.status !== 'fallen') hero.status = 'idle';
      hero.activeQuestId = null;
      hero.questsCompleted += 1;
      // Only THIS hero's own paired pet can earn from this specific
      // quest now -- see PetManager.grantEquippedXp's own comment for
      // why this moved from an account-wide call to a per-hero one.
      PetManager.grantEquippedXp(state, hero, xp);
    }

    // Hatchery progress stays account-wide -- an incubating egg doesn't
    // care which specific hero earned the xp reward.
    const newlyReadyEggs = PetManager.addHatchXp(state, xp);
    if (newlyReadyEggs.length > 0) state.pendingHatchReadyNotice = true;

    // Grimsby's cooldown counter, same account-wide shape -- doesn't care
    // which hero completed the quest, only whether it was burst-mode
    // (excluded) or not. Identified the same way this function's own
    // dailyBurstBonus check already does (duration within the tier's own
    // burst range), computed independently here since dailyBurstBonus's
    // own check is gated on `hero` existing and this isn't.
    const isBurstQuest = cfg.burstMaxDuration !== undefined && quest.offer.duration <= cfg.burstMaxDuration;
    const grimsbyWasPresent = PeddlerManager.isPresent(state);
    PeddlerManager.registerQuestCompletion(state, isBurstQuest, resolvedAt);
    const grimsbyArrived = !grimsbyWasPresent && PeddlerManager.isPresent(state);

    const storage = ModifierManager.goldStorage(state);
    state.gold = Math.min(storage, state.gold + gold);

    for (const drop of loot) {
      const item = EquipmentManager.instantiate(drop.defId);
      if (item) {
        // Auto-equip on loot -- opt-in (GameState.autoEquipOnLoot), only
        // for the hero who actually earned the drop, same gearScoreForItem
        // comparison engine.equipBestGear already uses for its own manual
        // bulk-equip, so "beats what's worn" means the same thing in both
        // places. EquipmentManager.equip handles the displaced item
        // landing back in the stash itself -- no separate push needed on
        // that path. Falls through to the ordinary stash push when the
        // setting is off, hero is missing (shouldn't happen but guarded
        // same as the durability block above), or the drop simply isn't
        // an upgrade.
        const def = EQUIPMENT_BY_ID[item.defId];
        const currentItem = def && hero ? hero.equipment[def.slot] : undefined;
        const currentDef = currentItem ? EQUIPMENT_BY_ID[currentItem.defId] : undefined;
        const currentScore = currentDef ? gearScoreForItem(currentDef) : -1;
        const newScore = def ? gearScoreForItem(def) : -1;
        const isUpgrade = !!def && !!hero && newScore > currentScore && hero.level >= def.reqLevel;
        if (state.autoEquipOnLoot && isUpgrade && hero) {
          EquipmentManager.equip(state, hero, item);
        } else {
          state.stash.push(item);
        }
      }
      if (!state.discoveredItems.includes(drop.defId)) state.discoveredItems.push(drop.defId);
      state.stats.itemsFound += 1;
      if (drop.rarity === 'legendary') state.stats.legendaryItemsFound += 1;
    }

    /* -------------------------------- chain -------------------------------- */
    let chainAdvanced: QuestResult['chainAdvanced'];
    let titleGranted: string | undefined;
    if (quest.offer.chain) {
      const { chainId, stage, totalStages } = quest.offer.chain;
      let active = state.activeChains.find((c) => c.chainId === chainId);
      if (!active) {
        active = { chainId, stage: 0, startedAt: resolvedAt, failedStages: 0 };
        state.activeChains.push(active);
      }
      if (success) {
        active.stage = stage + 1;
        const completed = active.stage >= totalStages;
        chainAdvanced = { chainId, stage: active.stage, totalStages, completed };
        if (completed) {
          const chain = CHAIN_BY_ID[chainId];
          state.gold = Math.min(storage, state.gold + chain.rewardGold);
          state.renown += chain.rewardRenown;
          for (const defId of chain.rewardItems) {
            const item = EquipmentManager.instantiate(defId);
            if (item) state.stash.push(item);
            if (!state.discoveredItems.includes(defId)) state.discoveredItems.push(defId);
          }
          // Guaranteed egg reward -- the egg equivalent of rewardItems
          // just above, same "always granted" contract. Independent of
          // grantsHatchery below (that flag is only ever about the tab's
          // own unlock+spotlight); any chain can carry a rewardEgg once
          // the Hatchery exists.
          if (chain.rewardEgg) {
            PetManager.grantEgg(state, chain.rewardEgg.rarity, chain.rewardEgg.dedicatedPetId, resolvedAt);
          }
          state.completedChains.push(chainId);
          state.activeChains = state.activeChains.filter((c) => c.chainId !== chainId);
          state.stats.chainsCompleted += 1;
          if (chain.title && hero && HeroManager.grantTitle(hero, chain.title)) {
            titleGranted = chain.title;
          }
          // The Hatchery's own intro -- see ChainDef.grantsHatchery. Just
          // the unlock+spotlight now; the_last_clutch's actual egg grant
          // goes through the generic rewardEgg path above like any other
          // chain's would.
          if (chain.grantsHatchery) {
            state.hatcheryUnlocked = true;
            state.pendingHatcherySpotlight = true;
          }
          // Grimsby's own intro -- same shape as grantsHatchery just
          // above. His actual arrival still goes through the normal
          // registerQuestCompletion/threshold path (not an immediate
          // visit on unlock) -- unlocking the tab and him actually
          // showing up are deliberately separate moments, matching how
          // completing the_last_clutch doesn't drop an egg-ready pet
          // notice either.
          if (chain.grantsPeddler) {
            state.peddlerUnlocked = true;
            state.pendingPeddlerSpotlight = true;
          }
          // The Harvest tab's own intro -- same shape again. Only ever
          // reachable by actually completing the_first_haul; the
          // grandfather path for pre-existing saves (see
          // GameState.harvestUnlocked's own comment) sets
          // state.harvestUnlocked directly in a SaveManager migration
          // instead, deliberately without also setting this spotlight
          // flag, since a save that's already been using Harvest for
          // real doesn't need a "here's your new tab" tour.
          if (chain.grantsHarvest) {
            state.harvestUnlocked = true;
            state.pendingHarvestSpotlight = true;
          }
        }
      } else {
        active.failedStages += 1;
        chainAdvanced = { chainId, stage, totalStages, completed: false };
      }
    }

    /* -------------------------------- stats -------------------------------- */
    state.stats.totalQuests += 1;
    state.stats[success ? 'successes' : 'failures'] += 1;
    state.stats.goldEarned += gold;
    state.stats.highestReward = Math.max(state.stats.highestReward, gold);
    if (injury) state.stats.injuriesSuffered += 1;
    state.stats.itemsBroken += broken.length;
    if (success) {
      state.stats.lowestSuccessfulChance = state.stats.lowestSuccessfulChance === null
        ? finalSuccess
        : Math.min(state.stats.lowestSuccessfulChance, finalSuccess);
    }

    state.activeQuests = state.activeQuests.filter((q) => q.id !== quest.id);

    const result: QuestResult = {
      questId: quest.id,
      heroId: quest.heroId,
      heroName,
      questName: quest.offer.name,
      difficulty: quest.offer.difficulty,
      success,
      resolvedAt,
      gold,
      xp,
      loot,
      events: events.defs.map((e) => ({ id: e.id, name: e.name, description: e.description, kind: e.kind })),
      injury,
      durabilityLost: wear,
      brokenItems: broken,
      levelsGained,
      chainAdvanced,
      eggDropped,
      materialGained,
      curioGained,
      dailyBurstBonus: dailyBurstBonus || undefined,
      critBonus: critBonus || undefined,
      grimsbyArrived: grimsbyArrived || undefined,
      titleGranted,
    };
    state.log.unshift(result);
    if (state.log.length > 60) state.log.length = 60;
    return result;
  },

  /**
   * Renamed from lootPreview and given real hero context -- the previous
   * version showed each entry's raw, unmodified LootRoll.chance, which is
   * NOT what actually gets rolled at resolution. The real roll (see
   * resolve() below) is entry.chance * (1 + (difficulty's own lootChance +
   * the hero's total loot modifier) / 100), clamped to 90 -- e.g. an EPIC
   * quest alone contributes +45 before the hero's stats/gear/upgrades even
   * factor in. Mirrors previewSuccess/previewDuration's exact mod-stacking
   * (hero mods + account-wide mods + consumable loadout) so what's shown
   * here is what that specific hero would actually get, not a generic
   * unmodified number that understates the real odds.
   */
  previewLoot(
    state: GameState, hero: Hero, offer: QuestOffer, consumables: string[], now: number,
  ): { name: string; rarity: Rarity; chance: number }[] {
    const loadout = InventoryManager.loadoutEffects(state, consumables);
    const mods = sumMods(HeroManager.heroMods(state, hero, now), ModifierManager.global(state), loadout.mods);
    const lootChance = DIFFICULTIES[offer.difficulty].lootChance + mods.loot;
    // Mirrors resolve()'s own two-stage math exactly -- see the comment
    // there and on HeroManager.personalLootBonus.
    const personalLoot = HeroManager.personalLootBonus(HeroManager.totalStats(hero));
    return offer.loot
      .map((entry) => {
        const def = EQUIPMENT_BY_ID[entry.defId];
        if (!def) return null;
        const chance = Math.min(90, entry.chance * (1 + lootChance / 100) * (1 + personalLoot / 100));
        return { name: def.name, rarity: def.rarity, chance };
      })
      .filter((x): x is { name: string; rarity: Rarity; chance: number } => x !== null);
  },

  /**
   * A chain's own reward -- gold, renown, and named items -- is granted in
   * full the moment the final stage succeeds, with no roll at all (see the
   * `completed` branch in resolve() below). This has never been previewable
   * anywhere before; used on a chain's final-stage board card to show what's
   * actually guaranteed, separate from that stage's own chance-based loot.
   */
  chainCompletionPreview(chain: ChainDef): { rewardGold: number; rewardRenown: number; items: { name: string; rarity: Rarity }[]; egg?: { rarity: Rarity } } {
    return {
      rewardGold: chain.rewardGold,
      rewardRenown: chain.rewardRenown,
      items: chain.rewardItems
        .map((defId) => EQUIPMENT_BY_ID[defId])
        .filter((def): def is NonNullable<typeof def> => !!def)
        .map((def) => ({ name: def.name, rarity: def.rarity })),
      egg: chain.rewardEgg ? { rarity: chain.rewardEgg.rarity } : undefined,
    };
  },
};
