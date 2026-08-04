import {
  ActiveRaid, GameState, Hero, Modifiers, RaidDifficulty, RaidLootDrop, RaidResult,
} from '../types';
import { RAID_BY_ID, RAID_DIFFICULTIES, RAID_ENCOUNTER_BY_ID, isRaidUnlocked, parseLootEntry, lootForDifficulty } from '../data/raids';
import { EQUIPMENT_BY_ID } from '../data/equipment';
import { MIN_SUCCESS, MAX_SUCCESS } from './QuestManager';
import { HeroManager } from './HeroManager';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { createRng } from '../rng';
import { clamp, sumMods, MINUTE } from '../util';

export const RaidManager = {
  /**
   * Weakest-link success contribution: the party's worst hero sets the
   * floor, with a smaller (0.2x) averaged contribution from the rest of the
   * party layered on top. Bringing more or better heroes genuinely helps,
   * but can't fully cover for one badly-equipped member -- that's the whole
   * point of the model versus a plain average, which would let one strong
   * hero carry a party of otherwise-unprepared ones.
   */
  partySuccessBonus(state: GameState, heroes: Hero[], now: number): number {
    if (heroes.length === 0) return 0;
    const contributions = heroes
      .map((h) => sumMods(HeroManager.heroMods(h, now), ModifierManager.global(state)).success ?? 0)
      .sort((a, b) => a - b);
    const weakest = contributions[0];
    const rest = contributions.slice(1);
    const restAvg = rest.length > 0 ? rest.reduce((sum, v) => sum + v, 0) / rest.length : 0;
    return weakest + restAvg * 0.2;
  },

  /**
   * Economy contributions (gold/xp/loot/speed) use a plain average across
   * the party instead -- these aren't a pass/fail gate the way success is,
   * just a shared payout, so there's no reason to punish a party for one
   * hero being behind on gear the way the success calculation does.
   *
   * speed is deliberately computed differently from the other three: it
   * excludes ModifierManager.global (guild/vendor/renown upgrades), using
   * only each hero's own personal speed (stats + equipment). Quest-speed
   * upgrades like Mounted Travel were silently also collapsing raid
   * duration to its 25% floor by default -- a maxed Mounted Travel (+60%)
   * alone gets most of the way there before any hero-specific investment
   * even factors in. Raids are meant to have their own separate speed
   * levers eventually (dedicated Raid Upgrades, not yet built); until then,
   * raid duration only responds to the party's own stats/gear, not the
   * guild's general quest infrastructure. gold/xp/loot are unaffected and
   * still include account-wide bonuses as before.
   */
  partyEconomyMods(state: GameState, heroes: Hero[], now: number) {
    const zero = { gold: 0, xp: 0, loot: 0, speed: 0 };
    if (heroes.length === 0) return zero;
    const withGlobal = heroes.map((h) => sumMods(HeroManager.heroMods(h, now), ModifierManager.global(state)));
    // speed = personal (stats + gear) + the dedicated Raid Guild Upgrade
    // channel (ModifierManager.raidMods) -- still never global(), so quest
    // upgrades like Mounted Travel still don't touch raid duration. This is
    // the lever RAID_UPGRADES writes into.
    const raidOnly = heroes.map((h) => sumMods(HeroManager.heroMods(h, now), ModifierManager.raidMods(state)));
    const avg = (arr: Modifiers[], key: keyof Modifiers) =>
      arr.reduce((sum, m) => sum + (m[key] ?? 0), 0) / arr.length;
    return {
      gold: avg(withGlobal, 'gold'),
      xp: avg(withGlobal, 'xp'),
      loot: avg(withGlobal, 'loot'),
      speed: avg(raidOnly, 'speed'),
    };
  },

  /** Preview odds for one specific encounter, given a prospective party -- used by the UI before committing. */
  previewEncounterSuccess(
    state: GameState, heroIds: string[], difficulty: RaidDifficulty, encounterId: string, now: number,
  ): number {
    const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
    if (!encounter) return 0;
    const heroes = heroIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
    const bonus = RaidManager.partySuccessBonus(state, heroes, now);
    const penalty = RAID_DIFFICULTIES[difficulty].successPenalty;
    return clamp(encounter.baseSuccess - penalty + bonus, MIN_SUCCESS, MAX_SUCCESS);
  },

  /**
   * Total raid duration for a prospective party at a given difficulty --
   * the tier's own durationMultiplier applies first (harder tiers take
   * longer, independent of party build), then the party's own speed
   * contribution (personal only, see partyEconomyMods) on top.
   */
  previewDuration(state: GameState, heroIds: string[], raidId: string, difficulty: RaidDifficulty, now: number): number {
    const raid = RAID_BY_ID[raidId];
    if (!raid) return 0;
    const heroes = heroIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
    const speed = RaidManager.partyEconomyMods(state, heroes, now).speed;
    const factor = clamp(1 - speed / 100, 0.25, 1.75);
    const total = raid.encounterIds.reduce((sum, id) => sum + (RAID_ENCOUNTER_BY_ID[id]?.duration ?? 0), 0);
    const tierScaled = total * RAID_DIFFICULTIES[difficulty].durationMultiplier;
    return Math.max(MINUTE, Math.floor(tierScaled * factor));
  },

  /** Validates a prospective raid commit without side effects. */
  canStart(state: GameState, raidId: string, difficulty: RaidDifficulty, heroIds: string[]): { ok: boolean; error?: string } {
    if (state.activeRaid) return { ok: false, error: 'The guild already has a raid underway.' };
    const raid = RAID_BY_ID[raidId];
    if (!raid) return { ok: false, error: 'Unknown raid.' };
    if (!isRaidUnlocked(raidId, state.completedRaids, state.completedChains)) return { ok: false, error: 'This raid has not been unlocked yet.' };

    const cfg = RAID_DIFFICULTIES[difficulty];
    if (heroIds.length !== cfg.partySize) {
      return { ok: false, error: `${cfg.difficulty[0].toUpperCase()}${cfg.difficulty.slice(1)} requires exactly ${cfg.partySize} heroes.` };
    }
    if (new Set(heroIds).size !== heroIds.length) return { ok: false, error: 'The same hero cannot fill two spots.' };

    for (const id of heroIds) {
      const hero = state.heroes.find((h) => h.id === id);
      if (!hero) return { ok: false, error: 'Unknown hero in the party.' };
      if (hero.status === 'questing') return { ok: false, error: `${hero.name} is already away.` };
      if (hero.level < raid.reqLevel) return { ok: false, error: `${hero.name} is below the required level (${raid.reqLevel}).` };
    }
    return { ok: true };
  },

  /** Commits the party -- marks every hero busy, locks in the party's success bonus, and starts the clock. */
  start(state: GameState, raidId: string, difficulty: RaidDifficulty, heroIds: string[], now: number): { raid?: ActiveRaid; error?: string } {
    const check = RaidManager.canStart(state, raidId, difficulty, heroIds);
    if (!check.ok) return { error: check.error };

    const heroes = heroIds.map((id) => state.heroes.find((h) => h.id === id)!);
    const partySuccessBonus = RaidManager.partySuccessBonus(state, heroes, now);
    const duration = RaidManager.previewDuration(state, heroIds, raidId, difficulty, now);

    const active: ActiveRaid = {
      raidId, difficulty, heroIds,
      startedAt: now,
      endsAt: now + duration,
      currentEncounter: 0,
      partySuccessBonus,
    };

    for (const hero of heroes) hero.status = 'questing';
    state.activeRaid = active;
    return { raid: active };
  },

  /**
   * Resolves the whole raid atomically once its total duration has elapsed
   * -- there's no separate per-encounter wait, the same way a single
   * ActiveQuest resolves as one event rather than ticking through
   * sub-stages. Walks the encounter list in order, rolling each one
   * independently, and stops at the first failure; every encounter cleared
   * before that point still pays out in full. Deterministic in
   * (raidId, startedAt), so live and offline-catch-up resolution always
   * agree, same reasoning as QuestManager.resolve.
   */
  resolve(state: GameState, active: ActiveRaid, resolvedAt: number): RaidResult {
    const raid = RAID_BY_ID[active.raidId];
    const diffCfg = RAID_DIFFICULTIES[active.difficulty];
    const rng = createRng(`raid:${active.raidId}:${active.difficulty}:${active.startedAt}`);
    const heroes = active.heroIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
    const economy = RaidManager.partyEconomyMods(state, heroes, resolvedAt);

    let encountersCleared = 0;
    let gold = 0;
    let xp = 0;
    const loot: RaidLootDrop[] = [];
    const encounterIds = raid?.encounterIds ?? [];

    for (const encounterId of encounterIds) {
      const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
      if (!encounter) continue; // devtool data drift safety -- an unknown id is skipped, not a crash
      const chance = clamp(encounter.baseSuccess - diffCfg.successPenalty + active.partySuccessBonus, MIN_SUCCESS, MAX_SUCCESS);
      if (!rng.chance(chance)) break;

      encountersCleared += 1;
      gold += Math.floor(encounter.rewardGold * diffCfg.rewardMultiplier * (1 + economy.gold / 100));
      xp += Math.floor(encounter.rewardXp * diffCfg.rewardMultiplier * (1 + economy.xp / 100));

      for (const entry of lootForDifficulty(encounter, active.difficulty)) {
        const parsed = parseLootEntry(entry);
        if (!parsed) continue;
        // diffCfg.lootBonus is new -- harder raid tiers now trade success
        // for better odds too, not just bigger gold/xp (see
        // RaidDifficultyConfig.lootBonus for the reasoning).
        if (!rng.chance(Math.min(90, parsed.chance * (1 + (economy.loot + diffCfg.lootBonus) / 100)))) continue;
        const def = EQUIPMENT_BY_ID[parsed.defId];
        const item = EquipmentManager.instantiate(parsed.defId);
        if (!def || !item) continue;
        state.stash.push(item);
        if (!state.discoveredItems.includes(parsed.defId)) state.discoveredItems.push(parsed.defId);
        state.stats.itemsFound += 1;
        if (def.rarity === 'legendary') state.stats.legendaryItemsFound += 1;
        loot.push({ defId: parsed.defId, name: def.name, rarity: def.rarity, encounterId });
      }
    }

    const fullClear = encounterIds.length > 0 && encountersCleared === encounterIds.length;
    const storage = ModifierManager.goldStorage(state);
    state.gold = Math.min(storage, state.gold + gold);

    if (fullClear && raid && !state.completedRaids.includes(raid.id)) {
      state.completedRaids.push(raid.id);
    }
    if (fullClear && !state.completedRaidDifficulties.includes(active.difficulty)) {
      state.completedRaidDifficulties.push(active.difficulty);
    }

    // Independent per-hero injury rolls regardless of how far the raid got --
    // everyone who went in shares the risk, not just whoever caused a stop.
    // Risk scales with difficulty and eases if the run was a full clear.
    const injuries: RaidResult['injuries'] = [];
    for (const hero of heroes) {
      const resist = sumMods(HeroManager.heroMods(hero, resolvedAt), ModifierManager.global(state)).injuryResist ?? 0;
      const risk = clamp(30 + diffCfg.successPenalty - resist + (fullClear ? -10 : 10), 0, 90);
      if (rng.chance(risk)) {
        const questDifficulty = active.difficulty === 'mythic' ? 'legendary' : active.difficulty === 'heroic' ? 'epic' : 'hard';
        const injury = HeroManager.rollInjury(rng, questDifficulty);
        injury.healsAt = resolvedAt + (injury.healsAt - Date.now());
        hero.injuries.push(injury);
        injuries.push({ heroId: hero.id, heroName: hero.name, injury });
      }
      hero.status = 'idle';
    }

    const result: RaidResult = {
      raidId: active.raidId,
      raidName: raid?.name ?? 'Unknown Raid',
      difficulty: active.difficulty,
      heroIds: active.heroIds,
      encountersCleared,
      totalEncounters: encounterIds.length,
      fullClear,
      gold,
      xp,
      loot,
      injuries,
      resolvedAt,
    };

    state.raidLog.unshift(result);
    if (state.raidLog.length > 30) state.raidLog.length = 30;
    state.activeRaid = null;

    return result;
  },
};
