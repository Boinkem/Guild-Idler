import { EQUIPMENT, EQUIPMENT_BY_ID, LOOT_RARITY_BY_DIFFICULTY, RARITY_LOOT_CHANCE } from '../data/equipment';
import {
  ChainDef, DIFFICULTIES, DIFFICULTY_ORDER, QUEST_CHAINS, QUEST_PREFIXES, QUEST_TEMPLATES,
} from '../data/quests';
import { HERO_CLASSES } from '../data/progression';
import {
  ActiveQuest, Difficulty, GameState, Hero, QuestOffer, QuestResult, Rarity,
} from '../types';
import { createRng, Rng, uid } from '../rng';
import { clamp, MINUTE, sumMods } from '../util';
import { HeroManager } from './HeroManager';
import { EventManager } from './EventManager';
import { InventoryManager } from './InventoryManager';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';

export const BOARD_SIZE = 6;
export const BOARD_REFRESH_MS = 30 * MINUTE;
export const MIN_SUCCESS = 5;
export const MAX_SUCCESS = 95;

/**
 * Burst quests (short 90s-8min offers rolled instead of the normal duration
 * range -- see DIFFICULTIES.burstChance) keep their full reward at very low
 * levels, on purpose: they exist for the fast, satisfying "start a quest and
 * immediately get to see it pay off" loop hook early on. Without a taper,
 * that same flat reward stays a flat-rate exploit deep into the game (a
 * 90-second quest paying out at 10-15x the normal per-hour rate regardless
 * of level). BURST_TAPER_FLOOR is the reward multiplier once fully tapered,
 * not zero -- a burst quest should still feel like a nice quick top-up at
 * high level, just not a strategy.
 */
const BURST_TAPER_FLOOR = 0.2;
const BURST_TAPER_LEVELS = 30;

function burstTaper(topLevel: number): number {
  const t = clamp((topLevel - 1) / BURST_TAPER_LEVELS, 0, 1);
  return 1 - t * (1 - BURST_TAPER_FLOOR);
}

export const CHAIN_BY_ID: Record<string, ChainDef> = Object.fromEntries(QUEST_CHAINS.map((c) => [c.id, c]));

function lootTableFor(difficulty: Difficulty, rng: Rng): { defId: string; chance: number }[] {
  const rarities = LOOT_RARITY_BY_DIFFICULTY[difficulty] ?? ['common'];
  const pool = EQUIPMENT.filter((e) => rarities.includes(e.rarity));
  if (pool.length === 0) return [];
  const picks = rng.shuffle(pool).slice(0, 3);
  return picks.map((def) => ({ defId: def.id, chance: RARITY_LOOT_CHANCE[def.rarity] }));
}

export const QuestManager = {
  /** The board is regenerated from a stable seed so it survives reloads. */
  generateBoard(state: GameState, now: number): QuestOffer[] {
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const window = Math.floor(now / BOARD_REFRESH_MS);
    const rng = createRng(`board:${window}:${topLevel}:${state.createdAt}`);
    const legendaryUnlocked = ModifierManager.hasUnlock(state, 'legendaryQuests');

    const available = DIFFICULTY_ORDER.filter((d) => {
      const cfg = DIFFICULTIES[d];
      if (d === 'legendary' && !legendaryUnlocked) return false;
      return topLevel + 2 >= cfg.reqLevel;
    });

    const offers: QuestOffer[] = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const difficulty = rng.weighted(available.map((d) => ({ item: d, weight: DIFFICULTIES[d].weight })));
      offers.push(QuestManager.generateOffer(difficulty, rng, `q:${window}:${i}`, topLevel));
    }

    // With only one hero, there's no second pair of hands to fall back on
    // while waiting out a long quest -- and the burst roll (see
    // generateOffer) is random, so a genuinely unlucky board could hand a
    // solo player nothing under a couple of hours until the next refresh.
    // Force one guaranteed short Easy offer onto the board in that case,
    // replacing the last slot rather than adding a 7th, so a fresh guild
    // always has *something* to send within a few minutes.
    if (state.heroes.length <= 1 && !offers.some((o) => o.difficulty === 'easy' && o.duration <= 5 * MINUTE)) {
      offers[offers.length - 1] = QuestManager.generateOffer('easy', rng, `q:${window}:guaranteed`, topLevel, true);
    }

    // Chain stages are appended when a chain is running or available.
    if (ModifierManager.hasUnlock(state, 'chains')) {
      for (const chain of QUEST_CHAINS) {
        if (state.completedChains.includes(chain.id)) continue;
        if (topLevel < chain.reqLevel) continue;
        const active = state.activeChains.find((c) => c.chainId === chain.id);
        const stage = active?.stage ?? 0;
        if (stage >= chain.stages.length) continue;
        offers.push(QuestManager.chainOffer(chain, stage, rng));
      }
    }
    return offers;
  },

  generateOffer(difficulty: Difficulty, rng: Rng, seedTag: string, topLevel: number, forceBurst = false): QuestOffer {
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
    // actually rolled. Burst quests use their own explicit reward range
    // (deliberately generous — see the comment on burstMinGold) rather than
    // a proportional slice of the full range, which measured out to 1-2 XP
    // per burst quest — mathematically fair, but reads as insulting rather
    // than the "numbers going up" feeling this is supposed to deliver.
    const useBurst = forceBurst || (cfg.burstChance !== undefined && rng.chance(cfg.burstChance));
    const durMin = useBurst ? cfg.burstMinDuration! : cfg.minDuration;
    const durMax = useBurst ? cfg.burstMaxDuration! : cfg.maxDuration;
    const duration = rng.int(durMin, durMax);
    const span = durMax - durMin;
    const t = span > 0 ? (duration - durMin) / span : 1;
    const taper = useBurst ? burstTaper(topLevel) : 1;
    const goldMin = useBurst ? cfg.burstMinGold! * taper : cfg.minGold;
    const goldMax = useBurst ? cfg.burstMaxGold! * taper : cfg.maxGold;
    const xpMin = useBurst ? cfg.burstMinXp! * taper : 18;
    const xpMax = useBurst ? cfg.burstMaxXp! * taper : 30;
    const rewardGold = Math.max(1, Math.round(goldMin + t * (goldMax - goldMin)));
    const rewardXp = Math.floor((xpMin + t * (xpMax - xpMin)) * cfg.xpMultiplier);

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
      tag: 'explore',
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
    const eligible = state.questBoard.filter((o) => hero.level >= o.reqLevel && !o.chain);
    if (eligible.length === 0) return null;
    const scored = eligible.map((o) => ({ o, p: QuestManager.previewSuccess(state, hero, o, [], now) }));
    const viable = scored.filter((e) => e.p >= 50).sort((a, b) => b.o.rewardGold - a.o.rewardGold);
    if (viable.length > 0) return viable[0].o;
    return scored.sort((a, b) => b.p - a.p)[0].o;
  },

  /** Success chance preview, used by the UI and locked in at departure. */
  previewSuccess(state: GameState, hero: Hero, offer: QuestOffer, consumables: string[], now: number): number {
    const loadout = InventoryManager.loadoutEffects(consumables);
    const classDef = HERO_CLASSES[hero.heroClass];
    const preferred = classDef.preferred.includes(offer.tag) ? classDef.preferredBonus : 0;
    const mods = sumMods(
      HeroManager.heroMods(hero, now),
      ModifierManager.global(state),
      loadout.mods,
      { success: preferred },
      { success: -(DIFFICULTY_ORDER.indexOf(offer.difficulty) * 2) },
    );
    return clamp(offer.baseSuccess + mods.success, MIN_SUCCESS, MAX_SUCCESS);
  },

  previewDuration(state: GameState, hero: Hero, offer: QuestOffer, now: number): number {
    const mods = sumMods(HeroManager.heroMods(hero, now), ModifierManager.global(state));
    const factor = clamp(1 - mods.speed / 100, 0.25, 1.75);
    return Math.max(MINUTE, Math.floor(offer.duration * factor));
  },

  start(
    state: GameState, hero: Hero, offer: QuestOffer, consumables: string[], now: number,
  ): { quest?: ActiveQuest; error?: string } {
    if (hero.status === 'questing') return { error: `${hero.name} is already out.` };
    if (hero.level < offer.reqLevel) return { error: `Requires level ${offer.reqLevel}.` };
    for (const id of consumables) {
      if (InventoryManager.count(state, id) < consumables.filter((c) => c === id).length) {
        return { error: 'Not enough consumables for that loadout.' };
      }
    }

    const loadout = InventoryManager.loadoutEffects(consumables);
    const classDef = HERO_CLASSES[hero.heroClass];
    const preferred = classDef.preferred.includes(offer.tag) ? classDef.preferredBonus : 0;
    const mods = sumMods(
      HeroManager.heroMods(hero, now),
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
      injuryResist: loadout.preventInjury ? 100 : mods.injuryResist,
      consumables,
      guaranteedGoodEvent: loadout.guaranteedGoodEvent,
    };

    for (const id of consumables) InventoryManager.remove(state, id);
    hero.status = 'questing';
    hero.activeQuestId = quest.id;
    state.activeQuests.push(quest);
    state.questBoard = state.questBoard.filter((o) => o.id !== offer.id);
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

    if (success) {
      gold = Math.floor(quest.offer.rewardGold * quest.goldMultiplier * (1 + events.goldPct)) + events.flatGold;
      xp = Math.floor(quest.offer.rewardXp * quest.xpMultiplier * (1 + events.xpPct));
      const lootChance = cfg.lootChance + quest.lootBonus + events.lootDelta;
      for (const entry of quest.offer.loot) {
        if (rng.chance(Math.min(90, entry.chance * (1 + lootChance / 100)))) {
          const def = EQUIPMENT_BY_ID[entry.defId];
          if (def) loot.push({ defId: def.id, name: def.name, rarity: def.rarity });
        }
      }
    } else {
      // Failure still pays a small consolation and a little experience.
      gold = Math.floor(quest.offer.rewardGold * 0.15 * quest.goldMultiplier) + Math.max(0, events.flatGold);
      xp = Math.floor(quest.offer.rewardXp * 0.3 * quest.xpMultiplier);
    }
    gold = Math.max(0, gold);

    /* ------------------------------- injury ------------------------------- */
    let injury: QuestResult['injury'];
    const injuryRisk = success
      ? (events.forcedInjury ? 25 : 0)
      : clamp(35 + DIFFICULTY_ORDER.indexOf(quest.offer.difficulty) * 8 - quest.injuryResist, 0, 90);
    if (quest.injuryResist < 100 && rng.chance(injuryRisk)) {
      injury = HeroManager.rollInjury(rng, quest.offer.difficulty);
      injury.healsAt = resolvedAt + (injury.healsAt - Date.now());
    }

    /* ----------------------------- durability ----------------------------- */
    const baseWear = 3 + DIFFICULTY_ORDER.indexOf(quest.offer.difficulty) * 2 + (success ? 0 : 4);
    const wear = baseWear + events.durabilityDelta;
    const globalMods = ModifierManager.global(state);
    const broken = hero ? EquipmentManager.applyWear(hero, wear, globalMods.durability) : [];

    /* ------------------------------- apply -------------------------------- */
    let levelsGained = 0;
    if (hero) {
      levelsGained = HeroManager.grantXp(hero, xp);
      if (injury) hero.injuries.push(injury);
      hero.status = 'idle';
      hero.activeQuestId = null;
      hero.questsCompleted += 1;
    }

    const storage = ModifierManager.goldStorage(state);
    state.gold = Math.min(storage, state.gold + gold);

    for (const drop of loot) {
      const item = EquipmentManager.instantiate(drop.defId);
      if (item) state.stash.push(item);
      if (!state.discoveredItems.includes(drop.defId)) state.discoveredItems.push(drop.defId);
      state.stats.itemsFound += 1;
      if (drop.rarity === 'legendary') state.stats.legendaryItemsFound += 1;
    }

    /* -------------------------------- chain -------------------------------- */
    let chainAdvanced: QuestResult['chainAdvanced'];
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
          state.completedChains.push(chainId);
          state.activeChains = state.activeChains.filter((c) => c.chainId !== chainId);
          state.stats.chainsCompleted += 1;
          if (chain.title && hero) hero.title = chain.title;
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
    };
    state.log.unshift(result);
    if (state.log.length > 60) state.log.length = 60;
    return result;
  },

  lootPreview(offer: QuestOffer): { name: string; rarity: Rarity }[] {
    return offer.loot
      .map((entry) => EQUIPMENT_BY_ID[entry.defId])
      .filter((def): def is NonNullable<typeof def> => !!def)
      .map((def) => ({ name: def.name, rarity: def.rarity }));
  },
};
