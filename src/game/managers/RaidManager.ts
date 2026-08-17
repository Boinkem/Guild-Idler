import {
  ActiveRaid, GameState, Hero, Modifiers, RaidDifficulty, RaidEncounterDef, RaidLootDrop, RaidResult, Role,
} from '../types';
import { RAID_BY_ID, RAID_DIFFICULTIES, RAID_ENCOUNTER_BY_ID, isRaidUnlocked, parseLootEntry, parseEggLootEntry, lootForDifficulty } from '../data/raids';
import { Tuning } from '../data/tuning';
import { EQUIPMENT_BY_ID } from '../data/equipment';
import { INJURY_BY_ID, healthDamagePercentForInjuryDef } from '../data/items';
import { MIN_SUCCESS, MAX_SUCCESS, MIN_INJURY_RISK } from './QuestManager';
import { HeroManager } from './HeroManager';
import { EquipmentManager } from './EquipmentManager';
import { ModifierManager } from './ModifierManager';
import { PetManager } from './PetManager';
import { elementalBonusForHero } from '../data/elements';
import { createRng } from '../rng';
import { clamp, sumMods, MINUTE } from '../util';

export const RaidManager = {
  /**
   * Average elemental contribution across the party for one specific
   * encounter -- recomputed fresh per encounter (unlike partySuccessBonus,
   * which is locked in once at raid start), since different encounters in
   * the same raid can carry entirely different tags. Averaged rather than
   * weakest-link like partySuccessBonus: this is a small bonus on top, not
   * the core pass/fail gate, matching how partyEconomyMods (gold/xp/loot/
   * speed) already treats "a shared payout, not something to punish a
   * lagging hero for" -- see that function's own comment.
   */
  elementalBonus(heroes: Hero[], encounter: RaidEncounterDef): number {
    if (heroes.length === 0) return 0;
    const total = heroes.reduce((sum, h) => sum + elementalBonusForHero(h, encounter), 0);
    return total / heroes.length;
  },

  /**
   * Weakest-link success contribution: the party's worst hero sets the
   * floor, with a smaller (0.2x) averaged contribution from the rest of the
   * party layered on top. Bringing more or better heroes genuinely helps,
   * but can't fully cover for one badly-equipped member -- that's the whole
   * point of the model versus a plain average, which would let one strong
   * hero carry a party of otherwise-unprepared ones.
   *
   * Each hero's raw contribution is adjusted against `baselineOffset` --
   * exactly what a bare, zero-investment hero of *that hero's own class*
   * would carry in heroMods' level/stat-derived terms if it stood right at
   * the raid's own reqLevel. Same mechanism as
   * QuestManager.previewSuccess's own baselineOffset, and for the same
   * reason: heroMods scales off each hero's raw level, so without this a
   * party exactly at reqLevel with nothing invested still carried the full
   * "free" bonus of every level it took to get there, and reqLevel barely
   * gated anything (confirmed directly: a fresh level-55 party hit the 95%
   * success ceiling on Normal for Requiem for the Last God, the intended
   * capstone raid). With the offset, `encounter.baseSuccess` is now what
   * that kind of party actually gets on Normal -- over-leveling, gear,
   * consumables, and guild-wide upgrades are what move the needle from
   * there, since all of those raise a hero's *actual* mods above this
   * now-tier-accurate floor. Heroic/Mythic's own successPenalty values are
   * unchanged by this -- see the retune note in guild-idler-status.md for
   * why those needed a fresh look regardless once this landed.
   */
  partySuccessBonus(state: GameState, heroes: Hero[], now: number, reqLevel: number): number {
    if (heroes.length === 0) return 0;
    const contributions = heroes
      .map((h) => {
        const raw = sumMods(HeroManager.heroMods(state, h, now), ModifierManager.global(state)).success ?? 0;
        const baselineStats = HeroManager.baselineStats(h.heroClass, reqLevel);
        const baselineOffset = (HeroManager.statMods(baselineStats).success ?? 0) + reqLevel * 0.4;
        return raw - baselineOffset;
      })
      .sort((a, b) => a - b);
    const weakest = contributions[0];
    const rest = contributions.slice(1);
    const restAvg = rest.length > 0 ? rest.reduce((sum, v) => sum + v, 0) / rest.length : 0;
    return weakest + restAvg * 0.2;
  },

  /** How many heroes in this party are currently active in each role --
   *  used both by roleMismatchPenalty below and directly by the raid UI's
   *  role-requirement circles (RaidsPanel) to show live met/unmet status
   *  as the party selection changes. */
  partyRoleCounts(heroes: Hero[]): Record<Role, number> {
    const counts: Record<Role, number> = { melee: 0, ranged: 0, caster: 0 };
    for (const h of heroes) counts[HeroManager.activeRole(h)] += 1;
    return counts;
  },

  /**
   * Flat success-point penalty for a party that doesn't meet a raid's
   * requiredRoles minimums -- 0 for a raid with no requirement at all
   * (the common case, see RaidDef.requiredRoles' own comment), otherwise
   * Tuning.get('raid.roleMismatchPenaltyPerSlot') per unmet slot (e.g. a
   * raid wanting 2 melee with only 1 in the party is 1 unmet slot, not a
   * full penalty). Folded directly into partySuccessBonus at raid start
   * (see start() below) and into previewEncounterSuccess for the UI
   * preview -- one more term in a formula that already exists rather
   * than a parallel system, same reasoning successModifier already
   * established.
   */
  roleMismatchPenalty(heroes: Hero[], requiredRoles?: Partial<Record<Role, number>>): number {
    if (!requiredRoles) return 0;
    const counts = RaidManager.partyRoleCounts(heroes);
    let unmet = 0;
    for (const [role, needed] of Object.entries(requiredRoles) as [Role, number][]) {
      unmet += Math.max(0, needed - counts[role]);
    }
    return unmet * Tuning.get('raid.roleMismatchPenaltyPerSlot');
  },

  /**
   * True if the party is missing at least one requiredRoles slot -- kept
   * as its own boolean rather than reusing `roleMismatchPenalty(...) > 0`,
   * so the Heroic/Mythic success ceiling below still engages even if
   * `raid.roleMismatchPenaltyPerSlot` itself were ever tuned down to 0.
   * The two are meant to be independently tunable: one is "how much does
   * each unmet slot cost you," the other is "how high can you climb back
   * to regardless" -- see RaidDifficultyConfig.roleMismatchCap.
   */
  hasRoleMismatch(heroes: Hero[], requiredRoles?: Partial<Record<Role, number>>): boolean {
    if (!requiredRoles) return false;
    const counts = RaidManager.partyRoleCounts(heroes);
    return (Object.entries(requiredRoles) as [Role, number][]).some(([role, needed]) => counts[role] < needed);
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
    const withGlobal = heroes.map((h) => sumMods(HeroManager.heroMods(state, h, now), ModifierManager.global(state)));
    // speed = personal (stats + gear) + the dedicated Raid Guild Upgrade
    // channel (ModifierManager.raidMods) -- still never global(), so quest
    // upgrades like Mounted Travel still don't touch raid duration. This is
    // the lever RAID_UPGRADES writes into.
    const raidOnly = heroes.map((h) => sumMods(HeroManager.heroMods(state, h, now), ModifierManager.raidMods(state)));
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
    state: GameState, heroIds: string[], raidId: string, difficulty: RaidDifficulty, encounterId: string, now: number,
  ): number {
    const raid = RAID_BY_ID[raidId];
    const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
    if (!raid || !encounter) return 0;
    const heroes = heroIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h);
    const bonus = RaidManager.partySuccessBonus(state, heroes, now, raid.reqLevel);
    const diffCfg = RAID_DIFFICULTIES[difficulty];
    const elemental = RaidManager.elementalBonus(heroes, encounter);
    const override = raid.successModifier ?? 0;
    const roleMismatch = RaidManager.roleMismatchPenalty(heroes, raid.requiredRoles);
    const success = clamp(encounter.baseSuccess - diffCfg.successPenalty + bonus + elemental + override - roleMismatch, MIN_SUCCESS, MAX_SUCCESS);
    // Heroic/Mythic's role-mismatch ceiling applies AFTER the ordinary
    // clamp, only while the party is actually missing a required slot --
    // see RaidDifficultyConfig.roleMismatchCap. Normal has no cap
    // (undefined), so this is a no-op there regardless of party makeup.
    if (diffCfg.roleMismatchCap != null && RaidManager.hasRoleMismatch(heroes, raid.requiredRoles)) {
      return Math.min(success, diffCfg.roleMismatchCap);
    }
    return success;
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

    // Raid Charter / Heroic Clearance / Mythic Clearance were previously
    // enforced only by RaidsPanel.tsx's difficulty circles (UI-only) --
    // this manager, the actual single mutation path per the project's own
    // "one mutable state, one mutation path" architecture, never checked
    // them at all. That meant any other call into startRaid (a future UI
    // surface, a bug in the modal's own gating, a bad save edit) could
    // commit a party to a raid -- or straight to Heroic/Mythic -- without
    // ever owning the upgrade that's supposed to gate it. Mirrors
    // RaidsPanel's own DIFFICULTY_UNLOCK map exactly, just enforced here
    // where it can't be bypassed.
    if (!ModifierManager.hasUnlock(state, 'raids')) {
      return { ok: false, error: 'The guild needs a Raid Charter before it can commit to a raid.' };
    }
    if (difficulty === 'heroic' && !ModifierManager.hasUnlock(state, 'raidsHeroic')) {
      return { ok: false, error: 'Heroic Clearance is required to raid at this difficulty.' };
    }
    if (difficulty === 'mythic' && !ModifierManager.hasUnlock(state, 'raidsMythic')) {
      return { ok: false, error: 'Legendary Clearance is required to raid at this difficulty.' };
    }

    const cfg = RAID_DIFFICULTIES[difficulty];
    if (heroIds.length !== cfg.partySize) {
      return { ok: false, error: `${cfg.difficulty[0].toUpperCase()}${cfg.difficulty.slice(1)} requires exactly ${cfg.partySize} heroes.` };
    }
    if (new Set(heroIds).size !== heroIds.length) return { ok: false, error: 'The same hero cannot fill two spots.' };

    for (const id of heroIds) {
      const hero = state.heroes.find((h) => h.id === id);
      if (!hero) return { ok: false, error: 'Unknown hero in the party.' };
      if (hero.status === 'questing') return { ok: false, error: `${hero.name} is already away.` };
      if (hero.status === 'fallen') return { ok: false, error: `${hero.name} is Fallen and needs to be revived first.` };
      if (hero.level < raid.reqLevel) return { ok: false, error: `${hero.name} is below the required level (${raid.reqLevel}).` };
    }
    return { ok: true };
  },

  /** Commits the party -- marks every hero busy, locks in the party's success bonus, and starts the clock. */
  start(state: GameState, raidId: string, difficulty: RaidDifficulty, heroIds: string[], now: number): { raid?: ActiveRaid; error?: string } {
    const check = RaidManager.canStart(state, raidId, difficulty, heroIds);
    if (!check.ok) return { error: check.error };

    const heroes = heroIds.map((id) => state.heroes.find((h) => h.id === id)!);
    const raidDef = RAID_BY_ID[raidId]!;
    const roleMismatch = RaidManager.roleMismatchPenalty(heroes, raidDef.requiredRoles);
    const partySuccessBonus = RaidManager.partySuccessBonus(state, heroes, now, raidDef.reqLevel) - roleMismatch;
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
    // The party is locked in for the whole raid -- requiredRoles lives on
    // RaidDef, not per-encounter, and nothing here lets heroes swap roles
    // mid-raid. Computed once, same as active.partySuccessBonus itself
    // (which already has roleMismatchPenalty folded in from start()) --
    // every encounter in the loop below reuses this single result rather
    // than re-deriving it per encounter.
    const roleMismatched = RaidManager.hasRoleMismatch(heroes, raid?.requiredRoles);

    let encountersCleared = 0;
    let gold = 0;
    let xp = 0;
    const loot: RaidLootDrop[] = [];
    const eggsFound: RaidResult['eggsFound'] = [];
    const encounterIds = raid?.encounterIds ?? [];

    for (const encounterId of encounterIds) {
      const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
      if (!encounter) continue; // devtool data drift safety -- an unknown id is skipped, not a crash
      const elemental = RaidManager.elementalBonus(heroes, encounter);
      const override = raid?.successModifier ?? 0;
      const rawChance = clamp(encounter.baseSuccess - diffCfg.successPenalty + active.partySuccessBonus + elemental + override, MIN_SUCCESS, MAX_SUCCESS);
      // Same Heroic/Mythic role-mismatch ceiling as previewEncounterSuccess,
      // applied identically here so the actual roll never has better odds
      // than what the party saw in the preview -- see
      // RaidDifficultyConfig.roleMismatchCap.
      const chance = (diffCfg.roleMismatchCap != null && roleMismatched)
        ? Math.min(rawChance, diffCfg.roleMismatchCap)
        : rawChance;
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

      // Eggs as raid loot -- same devtool-editable "string list, parsed
      // token@chance" convention as equipment loot just above, just a
      // different token shape (rarity, optionally a dedicated pet) since
      // an egg isn't an EquipmentDef. Rolled independently of the
      // equipment loot loop, same economy.loot/diffCfg.lootBonus scaling.
      for (const entry of encounter.eggLoot ?? []) {
        const parsed = parseEggLootEntry(entry);
        if (!parsed) continue;
        if (!rng.chance(Math.min(90, parsed.chance * (1 + (economy.loot + diffCfg.lootBonus) / 100)))) continue;
        PetManager.grantEgg(state, parsed.rarity, parsed.dedicatedPetId, resolvedAt);
        eggsFound.push({ rarity: parsed.rarity, encounterId });
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
    // Every hero in the clearing party earns the raid's title, if it has
    // one -- unlike a quest chain's title (one hero, since a quest is
    // solo), a raid is a group effort, so the whole party that actually
    // finished it shares the credit. grantTitle itself is the guard
    // against re-granting on a repeat clear (skips a title the hero
    // already holds), so no separate "first clear only" check is needed
    // here beyond the fullClear gate itself.
    if (fullClear && raid?.title) {
      for (const hero of heroes) HeroManager.grantTitle(hero, raid.title);
    }

    // Independent per-hero injury rolls regardless of how far the raid got --
    // everyone who went in shares the risk, not just whoever caused a stop.
    // Risk scales with difficulty and eases if the run was a full clear.
    const injuries: RaidResult['injuries'] = [];
    for (const hero of heroes) {
      const resist = sumMods(HeroManager.heroMods(state, hero, resolvedAt), ModifierManager.global(state)).injuryResist ?? 0;
      const risk = clamp(30 + diffCfg.successPenalty - resist + (fullClear ? -10 : 10), MIN_INJURY_RISK, 90);
      if (rng.chance(risk)) {
        const questDifficulty = active.difficulty === 'mythic' ? 'legendary' : active.difficulty === 'heroic' ? 'epic' : 'hard';
        const injury = HeroManager.rollInjury(rng, questDifficulty);
        injury.healsAt = resolvedAt + (injury.healsAt - Date.now());
        hero.injuries.push(injury);
        injuries.push({ heroId: hero.id, heroName: hero.name, injury });
        // Same Health-damage piggyback as QuestManager.resolve's injury
        // roll -- see items.ts's healthDamagePercentForInjuryDef.
        const def = INJURY_BY_ID[injury.id];
        if (def) {
          const damagePercent = healthDamagePercentForInjuryDef(def);
          HeroManager.applyHealthDamage(hero, damagePercent);
          // Same per-hero pet pairing as QuestManager.resolve -- raids
          // have no loadout/consumable system, so there's no Guardian's
          // Retainer-style reduction to bake in here, just the raw
          // damagePercent shared as-is.
          if (hero.equippedPetId) {
            const pet = state.pets.find((p) => p.uid === hero.equippedPetId);
            if (pet) PetManager.applyHealthDamage(state, pet, damagePercent);
          }
        }
      }
      // Don't stomp Fallen back to idle -- see QuestManager.resolve's
      // identical guard for the full reasoning.
      if (hero.status !== 'fallen') hero.status = 'idle';
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
      eggsFound,
      injuries,
      resolvedAt,
    };

    state.raidLog.unshift(result);
    if (state.raidLog.length > 30) state.raidLog.length = 30;
    state.activeRaid = null;

    return result;
  },
};
