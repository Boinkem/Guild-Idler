import { EQUIPMENT, EQUIPMENT_BY_ID, LOOT_RARITY_BY_DIFFICULTY, RARITY_LOOT_CHANCE } from '../data/equipment';
import {
  ChainDef, DIFFICULTIES, DIFFICULTY_ORDER, QUEST_CHAINS, QUEST_PREFIXES, QUEST_TEMPLATES,
} from '../data/quests';
import { HERO_CLASSES } from '../data/progression';
import { fastQuestCapsPerHour } from '../data/balance';
import { questEggDropChance } from '../data/pets';
import {
  ActiveQuest, Difficulty, GameState, Hero, QuestOffer, QuestResult, Rarity,
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
import { rerollDay, rerollsUsedToday, nextRerollCost } from '../data/reroll';
import { rollElementTags, elementalBonusForHero } from '../data/elements';

export const BOARD_SIZE = 6;
export const BOARD_REFRESH_MS = 30 * MINUTE;
export const MIN_SUCCESS = 5;
export const MAX_SUCCESS = 95;

export const CHAIN_BY_ID: Record<string, ChainDef> = Object.fromEntries(QUEST_CHAINS.map((c) => [c.id, c]));

function lootTableFor(difficulty: Difficulty, rng: Rng): { defId: string; chance: number }[] {
  const rarities = LOOT_RARITY_BY_DIFFICULTY[difficulty] ?? ['common'];
  // raidExclusive (Heroic/Mythic tiered raid variants) filtered out here too
  // -- this pool predates that flag and was never updated when it was added,
  // the same gap the shop/black market had before 0075. Confirmed as the
  // actual cause of Mythic gear turning up in ordinary quest rewards: rarity
  // alone doesn't distinguish a raid-tier variant from its base item, since
  // they share the same rarity by design. craftable bases are excluded the
  // same way -- a Guildmade Blade dropping as ordinary loot, with none of
  // the customMods a real craft would give it, would just be a worse
  // version of the same item for no reason.
  const pool = EQUIPMENT.filter((e) => rarities.includes(e.rarity) && !e.raidExclusive && !e.craftable);
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
      offers.push(QuestManager.generateOffer(difficulty, rng, `q:${window}:${hero.id}:${salt}:${i}`, hero.level, false, legendaryUnlocked));
    }

    // Every hero's board is their own now, so "no second pair of hands to
    // fall back on while waiting out a long quest" is true of every hero
    // individually, not just a one-hero guild -- guaranteed unconditionally
    // (this used to be gated on state.heroes.length <= 1, back when a
    // second hero could just pull from the same shared pool instead).
    if (!offers.some((o) => o.difficulty === 'easy' && o.duration <= 5 * MINUTE)) {
      offers[offers.length - 1] = QuestManager.generateOffer('easy', rng, `q:${window}:${hero.id}:${salt}:guaranteed`, hero.level, true, legendaryUnlocked);
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
    state.questBoards[hero.id] = QuestManager.generateContractsForHero(state, hero, now, now);
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
    forceBurst = false, legendaryUnlocked = false,
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
    const useBurst = forceBurst || (cfg.burstChance !== undefined && rng.chance(cfg.burstChance));
    const useMedium = !useBurst && cfg.mediumChance !== undefined && rng.chance(cfg.mediumChance);
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
      const durationHours = duration / HOUR;
      const caps = fastQuestCapsPerHour(topLevel, legendaryUnlocked);
      rewardGold = Math.min(rewardGold, Math.max(1, Math.round(caps.gold * durationHours)));
      rewardXp = Math.min(rewardXp, Math.floor(caps.xp * durationHours));
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
    const scored = eligible.map((o) => ({ o, p: QuestManager.previewSuccess(state, hero, o, [], now) }));
    const viable = scored.filter((e) => e.p >= 50).sort((a, b) => b.o.rewardGold - a.o.rewardGold);
    if (viable.length > 0) return viable[0].o;
    return scored.sort((a, b) => b.p - a.p)[0].o;
  },

  /**
   * Success chance preview, used by the UI and locked in at departure.
   *
   * The level/stat-derived portion of `heroMods` (the flat `level * 0.4`
   * term, plus the str/end curve inside statMods) both scale off the
   * hero's *raw* level -- which used to mean a hero standing exactly at a
   * quest's own reqLevel, with zero gear or spent stat points, was still
   * carrying the full "free" bonus of every level it took to get there.
   * reqLevel ended up barely gating anything.
   *
   * `baselineOffset` below is exactly what a bare, zero-investment hero of
   * this class would carry in these two terms if it were standing right at
   * offer.reqLevel -- HeroManager.heroMods/statMods themselves are left
   * untouched (they're also used for the Heroes panel's raw stat display
   * and for raids, neither of which has this same "gated by reqLevel"
   * framing), and only this preview subtracts it.
   *
   * With that in place, `DIFFICULTIES[tier].baseSuccess` is now exactly
   * what a hero standing at reqLevel with nothing invested actually gets
   * (tuned directly to 70/60/50/40/30 for Easy/Normal/Hard/Epic/Legendary
   * -- see DIFFICULTIES in quests.ts) -- there's no separate flat
   * difficulty-tier penalty layered on top anymore; baseSuccess already
   * fully encodes the tier, so a second penalty was only ever redundant
   * once reqLevel itself stopped being a formality. Any class-identity
   * success mod (Samurai's, Lizardman's) still lands a specific class a
   * little above that baseline, intentionally. Out-leveling the
   * requirement, or investing in stats/gear/upgrades/consumables, is what
   * should move the needle from there -- and does, since all of those
   * raise the hero's *actual* mods above this now-tier-accurate floor.
   *
   * Going the other way -- attempting a quest *above* the hero's own
   * level -- is a deliberate, opt-in trade now rather than blocked
   * outright (see `start`'s own comment for why). `overLevelPenalty`
   * below is the cost of that trade: `quest.overLevelPenaltyPercent`
   * (tunable, default 10) success points per level of gap between the
   * hero and offer.reqLevel, on top of everything else. A hero already
   * at or above reqLevel pays nothing extra here -- this only ever
   * subtracts, never adds.
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
    const mods = sumMods(
      HeroManager.heroMods(hero, now),
      ModifierManager.global(state),
      loadout.mods,
      { success: preferred },
    );
    const baselineStats = HeroManager.baselineStats(hero.heroClass, offer.reqLevel);
    const baselineOffset = (HeroManager.statMods(baselineStats).success ?? 0) + offer.reqLevel * 0.4;
    const levelGap = Math.max(0, offer.reqLevel - hero.level);
    const overLevelPenalty = levelGap * Tuning.get('quest.overLevelPenaltyPercent');
    const elemental = elementalBonusForHero(hero, offer);
    return clamp(offer.baseSuccess + mods.success + elemental - baselineOffset - overLevelPenalty, MIN_SUCCESS, MAX_SUCCESS);
  },

  previewDuration(state: GameState, hero: Hero, offer: QuestOffer, now: number): number {
    const mods = sumMods(HeroManager.heroMods(hero, now), ModifierManager.global(state));
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
    for (const id of consumables) {
      if (InventoryManager.count(state, id) < consumables.filter((c) => c === id).length) {
        return { error: 'Not enough consumables for that loadout.' };
      }
    }

    const loadout = InventoryManager.loadoutEffects(state, consumables);
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
    // Chain stages come off the shared chainBoard; ordinary contracts come
    // off specifically the sending hero's own board -- a contract offer
    // only ever exists in that one hero's pool to begin with.
    if (offer.chain) {
      state.chainBoard = state.chainBoard.filter((o) => o.id !== offer.id);
    } else {
      const board = state.questBoards[hero.id];
      if (board) state.questBoards[hero.id] = board.filter((o) => o.id !== offer.id);
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

    /* ----------------------------- apply -------------------------------- */
    let levelsGained = 0;
    if (hero) {
      levelsGained = HeroManager.grantXp(hero, xp);
      if (injury) hero.injuries.push(injury);
      hero.status = 'idle';
      hero.activeQuestId = null;
      hero.questsCompleted += 1;
    }

    // Hatchery progress and equipped-pet xp both key off the same raw xp
    // reward as the hero's own grantXp call above, but are account-wide --
    // an incubating egg or an equipped pet doesn't care which specific
    // hero earned it. See PetManager for why this lives here rather than
    // inside HeroManager.grantXp itself (that function only ever sees one
    // hero, not the full GameState an egg/pet needs).
    const newlyReadyEggs = PetManager.addHatchXp(state, xp);
    if (newlyReadyEggs.length > 0) state.pendingHatchReadyNotice = true;
    PetManager.grantEquippedXp(state, xp);

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
          if (chain.title && hero) hero.title = chain.title;
          // The Hatchery's own intro -- see ChainDef.grantsHatchery. Just
          // the unlock+spotlight now; the_last_clutch's actual egg grant
          // goes through the generic rewardEgg path above like any other
          // chain's would.
          if (chain.grantsHatchery) {
            state.hatcheryUnlocked = true;
            state.pendingHatcherySpotlight = true;
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
    const mods = sumMods(HeroManager.heroMods(hero, now), ModifierManager.global(state), loadout.mods);
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
