/**
 * Balance Sandbox sim worker.
 *
 * Runs ONE variant (either "live" or "with a proposed tuning overlay") of a
 * headless economy simulation and prints a JSON results summary to stdout.
 * Always run as its own fresh `tsx` process (see server.mjs's `/api/sim/run`
 * handler) rather than in-process with a sibling baseline run -- several of
 * the modules this imports (`balance.ts`, `progression.ts`) read tuning
 * values into module-level `const`s at import time, not lazily on every
 * call, so a proposed-change overlay has to be applied *before* those
 * modules are ever evaluated in this process. Running baseline and modified
 * as two separate process invocations, each starting from a clean module
 * cache, is the only way to guarantee one variant's values can't leak into
 * the other -- not a workaround, the actual correct isolation boundary.
 *
 * Deliberately reuses the real formula modules directly (DIFFICULTIES,
 * bestUnlockedTier, expectedRatePerHour, xpForLevel, guildCost,
 * upgradeCost) rather than re-deriving any of this math -- a second copy
 * of a formula the game already isolated into a pure function is exactly
 * the kind of drift risk flagged elsewhere in this project (see
 * guild-idler-status.md's DevTool scalability discussion), and it's
 * avoidable here since every formula this sim needs already lives in an
 * engine-independent module (no GameState, no Hero object, no manager
 * class required to call any of them).
 *
 * Fast-quest income (patch 0332) is NOT modeled here -- same "flagged
 * rather than silently approximated" treatment as raids/chains below.
 * Fast rolls are rare (1-5% per offer, tier-dependent) and reward-neutral
 * on average (time-scaled off the same baseline this sim already uses,
 * floored but not inflated), so their effect on aggregate gold/xp *rate*
 * is small; a proper model would need per-offer RNG this expected-value
 * sim deliberately doesn't do anywhere else either.
 *
 * Engine v2 (patch 0497) -- now modelled, all through the game's own code:
 *  - Each hero has their own level and xp (before, every hero's xp was
 *    poured into one shared level, so N heroes levelled N times too fast),
 *    capped at MAX_HERO_LEVEL (before, levels ran past it, e.g. 129).
 *    Recruits (growRoster) start at level 1.
 *  - Facilities and upgrades bought feed back into income straight away:
 *    ModifierManager.upgradeMods/guildMods on a stand-in state, gold/xp
 *    through the economy soft caps, speed scaling duration inside the
 *    game's 0.25x-1.75x clamp, success = tier base + success mods +
 *    QuestManager.rookieBonus, clamped to MIN/MAX_SUCCESS.
 *  - Gold storage (ModifierManager.goldStorage): income over the cap is
 *    lost (goldLostToCap), and an item costing more than storage can hold
 *    is skipped instead of blocking the spend list forever (capBlocked).
 *  - Outputs milestones (day the first / every hero reaches 10..55),
 *    per-level-band gold/hr (guild) and xp/hr (one hero) with days spent
 *    and the usual best difficulty, heroLevels, finalMods.
 *
 * Still NOT modelled (flagged rather than silently approximated):
 *  - Hero stats, gear, sets, pets, renown perks (only guild-wide mods).
 *
 * Phase 1 scope, explicitly NOT modeled (flagged rather than silently
 * approximated):
 *  - Renown / Prestige / retirement. Renown perk tier2 curves are real gold
 *    sinks but are paid in Renown, which only exists via the retire loop --
 *    modeling that honestly needs its own income model, not a gold-economy
 *    shortcut. Renown perks are excluded from the spend simulation entirely
 *    for this pass.
 *  - Raids, equipment, injuries, pets, events, chains. Gold/XP income here
 *    is quest-board-only, computed the same expected-value way balance.ts's
 *    own live burst-cap math already does (success-rate-weighted average of
 *    a tier's reward range), not a literal per-quest event simulation.
 *  - (Fixed in v2: heroes no longer share one level; see above.)
 *  - Hero stat allocation, gear, sets, mods of any kind. `previewSuccess`'s
 *    real per-hero success formula is not called; DIFFICULTIES' own
 *    baseSuccess is used directly, the same simplification balance.ts's
 *    real, shipped `expectedRatePerHour` already makes for its own
 *    cap/floor math -- this sim is consistent with that precedent, not a
 *    new one.
 */

import { DIFFICULTIES, DIFFICULTY_ORDER, DifficultyConfig } from '../../../src/game/data/quests';
import { MINUTE } from '../../../src/game/util';
import { TUNING_BY_ID } from '../../../src/game/data/tuning';

type Preset = {
  id: string;
  label: string;
  checkInMinutes: number;
  heroCount: number;
  tierPreference: 'bestValue' | 'longestDuration';
  spendPolicy: 'immediate';
};

type SimInput = {
  preset: Preset;
  heroCountOverride?: number;
  overrides: Record<string, number>;
  maxDays: number;
  sampleEveryDays: number;
  /** Patch 0217 -- when true, heroCount starts at 1 and grows dynamically
   *  via in-loop recruiting instead of staying fixed at heroCountOverride/
   *  preset.heroCount for the whole run. See the roster-growth comment
   *  in main() for the full mechanic. */
  growRoster?: boolean;
  /** Patch 0498 -- false = never buy facilities/upgrades (income stays at
   *  base). Default true. */
  buyFacilities?: boolean;
  /** Patch 0498 -- grid mode: run the same overrides once per entry and
   *  return `{ grid: [...] }` (time-to-level per roster) instead of one
   *  full result. 'grow' = start with 1 hero and recruit as slots open. */
  heroCounts?: (number | 'grow')[];
};

/** Applied before balance.ts/progression.ts are ever imported in this
 *  process -- see the file-level comment above for why order matters here. */
function applyOverrides(overrides: Record<string, number>) {
  for (const [id, value] of Object.entries(overrides)) {
    const entry = TUNING_BY_ID[id];
    if (!entry) {
      process.stderr.write(`sim: unknown tuning id in overrides, ignored: "${id}"\n`);
      continue;
    }
    entry.value = value;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin()) as SimInput;
  applyOverrides(input.overrides ?? {});

  // Dynamic import, deliberately AFTER applyOverrides -- these modules read
  // Tuning.get() into module-level consts / array literals the moment
  // they're first evaluated, so the overlay above has to already be in
  // place before this line runs.
  const balance = await import('../../../src/game/data/balance');
  const progression = await import('../../../src/game/data/progression');
  // Patch 0497 -- the game's own bonus maths, so the sim can't drift from
  // it: facility/upgrade mods (ModifierManager), soft caps (softCap), the
  // rookie success top-up (QuestManager.rookieBonus) and the success clamp.
  const { ModifierManager } = await import('../../../src/game/managers/ModifierManager');
  const { QuestManager, MIN_SUCCESS, MAX_SUCCESS } = await import('../../../src/game/managers/QuestManager');
  const { softCap, clamp } = await import('../../../src/game/util');
  const { Tuning } = await import('../../../src/game/data/tuning');

  const maxDays = input.maxDays;
  const sampleEveryDays = Math.max(1, input.sampleEveryDays || 5);
  const buyFacilities = input.buyFacilities !== false;
  const MAX_LEVEL = progression.MAX_HERO_LEVEL;

  // Patch 0498 -- the engine is one function so grid mode can run it per
  // roster size in this same process (the overrides are identical, so the
  // module-isolation rule in the header comment still holds).
  const simulate = (heroCount: number, growRoster: boolean) => {

    // --------------------------------------------------------------- roster --
    // Patch 0497: every hero has their OWN level and xp. Before, every
    // hero's xp was poured into one shared level, so N heroes levelled N
    // times too fast. Gold still pools into the guild purse.
    type SimHero = { level: number; xp: number };
    const heroes: SimHero[] = Array.from({ length: growRoster ? 1 : heroCount }, () => ({ level: 1, xp: 0 }));
    const recruitedClasses = new Set<string>(['adventurer']); // HeroManager.create's starting class
    const allClasses = Object.keys(progression.RECRUIT_COST);
    const recruitCost = (c: string) => progression.RECRUIT_COST[c as keyof typeof progression.RECRUIT_COST];
    const cheapestUnrecruited = () => allClasses.filter((c) => !recruitedClasses.has(c))
      .reduce<string | null>((best, c) => (best === null || recruitCost(c) < recruitCost(best) ? c : best), null);
    const recruitLog: { day: number; heroCount: number }[] = [];

    // ---------------------------------------------------------- spend list --
    type SpendItem = { kind: 'facility' | 'upgrade'; id: string; label: string; maxLevel: number; costAt: (level: number) => number };
    const orderedFacilities = growRoster
      ? [...progression.GUILD_FACILITIES].sort((a, b) => (a.id === 'tavern' ? -1 : b.id === 'tavern' ? 1 : 0))
      : progression.GUILD_FACILITIES;
    const spendList: SpendItem[] = [
      ...orderedFacilities.map((f): SpendItem => ({ kind: 'facility', id: f.id, label: f.name, maxLevel: f.maxLevel, costAt: (level: number) => progression.guildCost(f, level) })),
      ...progression.UPGRADES.map((u): SpendItem => ({ kind: 'upgrade', id: u.id, label: u.name, maxLevel: u.maxLevel, costAt: (level: number) => progression.upgradeCost(u, level) })),
    ];
    const levels: Record<string, number> = {};
    const completionDay: Record<string, number | null> = {};
    for (const item of spendList) { levels[item.id] = 0; completionDay[item.id] = null; }

    // A stand-in GameState holding only what ModifierManager reads for
    // guild-wide bonuses and gold storage. Rebuilt from `levels` on each
    // purchase, so every facility/upgrade bought feeds straight into income
    // (patch 0497 -- before, purchases never changed any rate).
    const guildState = () => {
      const guild: Record<string, number> = {};
      const upgrades: Record<string, number> = {};
      for (const item of spendList) if (levels[item.id] > 0) (item.kind === 'facility' ? guild : upgrades)[item.id] = levels[item.id];
      return { guild, upgrades, renownPerks: {} } as unknown as Parameters<typeof ModifierManager.goldStorage>[0];
    };
    let gState = guildState();
    let mods = { ...ModifierManager.upgradeMods(gState), ...{} } as Record<string, number>;
    const refreshMods = () => {
      gState = guildState();
      const u = ModifierManager.upgradeMods(gState) as Record<string, number>;
      const g = ModifierManager.guildMods(gState) as Record<string, number>;
      mods = {};
      for (const src of [u, g]) for (const [k, v] of Object.entries(src)) mods[k] = (mods[k] ?? 0) + (v ?? 0);
    };
    refreshMods();
    const storage = () => ModifierManager.goldStorage(gState);
    const rosterCap = () => Math.min(allClasses.length, ModifierManager.heroSlots(gState));

    // ------------------------------------------------------------ income --
    /** Expected gold/xp per hour for one hero at `level`, with the guild's
     *  current bonuses applied the way QuestManager does: success = tier
     *  base + success mods + rookie top-up, clamped; duration scaled by
     *  speed (0.25x-1.75x); gold/xp through the economy soft caps. Hero
     *  stats, gear, pets and renown are still not modelled. */
    const rateFor = (tierId: string, level: number) => {
      const cfg = DIFFICULTIES[tierId as keyof typeof DIFFICULTIES];
      const success = clamp(cfg.baseSuccess + (mods.success ?? 0) + QuestManager.rookieBonus(level), MIN_SUCCESS, MAX_SUCCESS);
      const factor = clamp(1 - (mods.speed ?? 0) / 100, 0.25, 1.75);
      const tuned: DifficultyConfig = { ...cfg, baseSuccess: success, minDuration: cfg.minDuration * factor, maxDuration: cfg.maxDuration * factor };
      const goldMult = 1 + softCap(mods.gold ?? 0, Tuning.get('economy.goldSoftCapThreshold'), Tuning.get('economy.goldSoftCapDecay')) / 100;
      const xpMult = 1 + softCap(mods.xp ?? 0, Tuning.get('economy.xpSoftCapThreshold'), Tuning.get('economy.xpSoftCapDecay')) / 100;
      return {
        gold: balance.expectedRatePerHour(tuned, 'gold', level) * goldMult,
        xp: balance.expectedRatePerHour(tuned, 'xp', level) * xpMult,
        avgDurationMinutes: (tuned.minDuration + tuned.maxDuration) / 2 / MINUTE,
      };
    };
    /** Same unlock rule as balance.bestUnlockedTier (level + 2 >= the
     *  tier's referenceLevel), Legendary from level 25 as before. Picks the
     *  best gold/hr of those -- the "Active" play style. */
    const pickTier = (level: number) => {
      const eligible = DIFFICULTY_ORDER.filter((d) => (d === 'easy' || level + 2 >= DIFFICULTIES[d].referenceLevel) && (d !== 'legendary' || level >= 25));
      return eligible.reduce((best, id) => (rateFor(id, level).gold > rateFor(best, level).gold ? id : best), eligible[0]);
    };

    // -------------------------------------------------------- bookkeeping --
    const MILESTONES = [10, 20, 30, 40, 50, 55].filter((l) => l <= MAX_LEVEL);
    const milestones: Record<number, { first: number | null; all: number | null }> = {};
    for (const m of MILESTONES) milestones[m] = { first: null, all: null };
    const BANDS: [number, number][] = [[1, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, MAX_LEVEL]];
    const bandAcc = BANDS.map(() => ({ hours: 0, gold: 0, xp: 0, heroHours: 0, tiers: {} as Record<string, number> }));
    // Upper bound exclusive: a hero at max level has left the last band
    // (time spent sitting at max level isn't time "in" 50-55).
    const bandOf = (level: number) => BANDS.findIndex(([lo, hi]) => level >= lo && level < hi);
    // Patch 0498 -- per level of the lead hero (heroes[0]): hours spent,
    // whole-guild gold earned, that hero's xp earned, and the day any hero
    // first reached the level. Lets the UI total any level range without a
    // rerun (gold/hr, xp/hr, days in range, time to level N).
    const perLevel = Array.from({ length: MAX_LEVEL + 1 }, () => ({ hours: 0, gold: 0, xp: 0 }));
    const levelDays: (number | null)[] = Array.from({ length: MAX_LEVEL + 1 }, (_, l) => (l <= 1 ? 0 : null));
    let fullyBuiltDay: number | null = null;

    let day = 0;
    let gold = 0;
    let goldLostToCap = 0;
    let hitSafetyCap = false;
    const checkInHours = input.preset.checkInMinutes / 60;
    const levelCurve: { day: number; level: number; avgLevel: number }[] = [];
    const goldCurve: { day: number; gold: number }[] = [];
    const purchaseLog: { day: number; id: string; kind: 'facility' | 'upgrade'; level: number }[] = [];
    const tierFirstSeen: Record<string, { day: number; level: number }> = {};
    let lastSampleDay = -Infinity;

    const topLevel = () => Math.max(...heroes.map((h) => h.level));
    const allSpent = () => spendList.every((item) => levels[item.id] >= item.maxLevel);
    const rosterMaxed = () => !growRoster || heroes.length >= rosterCap();
    const allMaxLevel = () => heroes.every((h) => h.level >= MAX_LEVEL);

    while (day < maxDays) {
      if ((!buyFacilities || allSpent()) && rosterMaxed() && allMaxLevel()) break;

      // Income: each hero runs its own best tier at its own level.
      let tickGold = 0;
      const band = bandOf(heroes[0].level);
      const leadLevel = heroes[0].level;
      let leadXp = 0;
      for (const h of heroes) {
        const tier = pickTier(h.level);
        if (!tierFirstSeen[tier]) tierFirstSeen[tier] = { day, level: h.level };
        const r = rateFor(tier, h.level);
        const uptime = input.preset.checkInMinutes <= r.avgDurationMinutes ? 1 : Math.min(1, r.avgDurationMinutes / input.preset.checkInMinutes);
        const g = r.gold * uptime * checkInHours;
        const x = r.xp * uptime * checkInHours;
        tickGold += g;
        if (h === heroes[0]) leadXp = x;
        if (h === heroes[0] && band >= 0) {
          bandAcc[band].xp += x;
          bandAcc[band].tiers[tier] = (bandAcc[band].tiers[tier] ?? 0) + 1;
        }
        if (h.level < MAX_LEVEL) {
          h.xp += x;
          while (h.level < MAX_LEVEL && h.xp >= progression.xpForLevel(h.level)) {
            h.xp -= progression.xpForLevel(h.level);
            h.level += 1;
          }
        }
      }
      if (band >= 0) { bandAcc[band].hours += checkInHours; bandAcc[band].gold += tickGold; }
      if (leadLevel < MAX_LEVEL) {
        perLevel[leadLevel].hours += checkInHours;
        perLevel[leadLevel].gold += tickGold;
        perLevel[leadLevel].xp += leadXp;
      }

      // Gold storage cap (patch 0497): anything over storage is lost, as in game.
      const cap = storage();
      const room = Math.max(0, cap - gold);
      if (tickGold > room) goldLostToCap += tickGold - room;
      gold = Math.min(cap, gold + tickGold);

      if (growRoster && heroes.length < rosterCap()) {
        const cls = cheapestUnrecruited();
        if (cls && gold >= recruitCost(cls)) {
          gold -= recruitCost(cls);
          recruitedClasses.add(cls);
          heroes.push({ level: 1, xp: 0 });
          recruitLog.push({ day: Math.round(day), heroCount: heroes.length });
        }
      }

      // Spend in list order. An item that costs more than storage can ever
      // hold right now is skipped (it would block everything behind it
      // forever) -- Treasury, which raises storage, is still bought in turn.
      let bought = buyFacilities;
      while (bought) {
        bought = false;
        const capNow = storage();
        const next = spendList.find((item) => levels[item.id] < item.maxLevel && item.costAt(levels[item.id]) <= capNow);
        if (!next) break;
        const cost = next.costAt(levels[next.id]);
        if (gold < cost) break;
        gold -= cost;
        levels[next.id] += 1;
        purchaseLog.push({ day: Math.round(day), id: next.id, kind: next.kind, level: levels[next.id] });
        if (levels[next.id] >= next.maxLevel) completionDay[next.id] = Math.round(day);
        refreshMods();
        bought = true;
      }

      day += checkInHours / 24;
      if (fullyBuiltDay === null && buyFacilities && allSpent()) fullyBuiltDay = Math.round(day * 10) / 10;
      for (const h of heroes) for (let l = 2; l <= h.level; l++) if (levelDays[l] === null) levelDays[l] = Math.round(day * 100) / 100;
      for (const m of MILESTONES) {
        if (milestones[m].first === null && heroes.some((h) => h.level >= m)) milestones[m].first = Math.round(day * 10) / 10;
        if (milestones[m].all === null && (!growRoster || heroes.length >= rosterCap()) && heroes.every((h) => h.level >= m)) milestones[m].all = Math.round(day * 10) / 10;
      }
      if (day - lastSampleDay >= sampleEveryDays) {
        levelCurve.push({ day: Math.round(day), level: topLevel(), avgLevel: Math.round((heroes.reduce((s, h) => s + h.level, 0) / heroes.length) * 10) / 10 });
        goldCurve.push({ day: Math.round(day), gold: Math.round(gold) });
        lastSampleDay = day;
      }
    }
    if (day >= maxDays) hitSafetyCap = true;

    const tierRates: Record<string, unknown> = {};
    for (const id of DIFFICULTY_ORDER) {
      const cfg = DIFFICULTIES[id];
      tierRates[id] = {
        unlockedAtLevel: tierFirstSeen[id]?.level ?? null,
        unlockedAtDay: tierFirstSeen[id] ? Math.round(tierFirstSeen[id].day) : null,
        goldPerHour: Math.round(balance.expectedRatePerHour(cfg, 'gold') * 100) / 100,
        xpPerHour: Math.round(balance.expectedRatePerHour(cfg, 'xp') * 100) / 100,
      };
    }
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const bands = BANDS.map(([lo, hi], i) => {
      const a = bandAcc[i];
      const topTier = Object.entries(a.tiers).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      return {
        band: `${lo}-${hi}`,
        days: a.hours ? round1(a.hours / 24) : null,
        // Whole-guild gold per hour while the first hero is in this band;
        // xp per hour is one hero's.
        goldPerHour: a.hours ? Math.round(a.gold / a.hours) : null,
        xpPerHourPerHero: a.hours ? Math.round(a.xp / a.hours) : null,
        bestTier: topTier,
      };
    });
    const capBlocked = spendList.filter((i) => levels[i.id] < i.maxLevel && i.costAt(levels[i.id]) > storage()).map((i) => i.id);

    return {
      engineVersion: 2,
      preset: input.preset.id,
      heroCount: heroes.length,
      growRoster,
      recruitLog,
      days: Math.round(day),
      hitSafetyCap,
      completed: !hitSafetyCap,
      finalLevel: topLevel(),
      heroLevels: heroes.map((h) => h.level),
      finalGold: Math.round(gold),
      goldStorage: storage(),
      goldLostToCap: Math.round(goldLostToCap),
      capBlocked,
      milestones,
      bands,
      levelCurve,
      goldCurve,
      purchaseLog,
      facilityCompletionDays: Object.fromEntries(spendList.filter((i) => i.kind === 'facility').map((i) => [i.id, completionDay[i.id]])),
      upgradeCompletionDays: Object.fromEntries(spendList.filter((i) => i.kind === 'upgrade').map((i) => [i.id, completionDay[i.id]])),
      allSpentDay: allSpent() ? Math.round(day) : null,
      // Patch 0498 -- the day the last facility/upgrade level was bought
      // (allSpentDay above is just the run's end day when that happened).
      fullyBuiltDay,
      buyFacilities,
      perLevel: perLevel.map((p) => ({ hours: Math.round(p.hours * 100) / 100, gold: Math.round(p.gold), xp: Math.round(p.xp) })),
      levelDays,
      finalMods: mods,
      tierRates,
    };
  };

  if (Array.isArray(input.heroCounts) && input.heroCounts.length) {
    const grid = input.heroCounts.map((hc) => {
      const grow = hc === 'grow';
      const r = simulate(grow ? 1 : Math.max(1, Math.floor(Number(hc)) || 1), grow);
      return { heroCount: hc, finalHeroes: r.heroCount, levelDays: r.levelDays, milestones: r.milestones, fullyBuiltDay: r.fullyBuiltDay, days: r.days, hitSafetyCap: r.hitSafetyCap };
    });
    process.stdout.write(JSON.stringify({ engineVersion: 2, grid }));
    return;
  }
  const result = simulate(input.heroCountOverride ?? input.preset.heroCount, input.growRoster === true);
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
