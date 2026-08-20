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
 * bestUnlockedTier, expectedRatePerHour, xpForLevel, guildCost, upgradeCost,
 * fastQuestCapsPerHour/fastQuestFloorPerHour, easyFastModeChances) rather
 * than re-deriving any of this math -- a second copy of a formula the game
 * already isolated into a pure function is exactly the kind of drift risk
 * flagged elsewhere in this project (see guild-idler-status.md's DevTool
 * scalability discussion), and it's avoidable here since every formula this
 * sim needs already lives in an engine-independent module (no GameState,
 * no Hero object, no manager class required to call any of them).
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
 *  - Multiple heroes are modeled as `heroCount` identical, same-level
 *    earners rather than a real roster with staggered levels -- a
 *    reasonable approximation for aggregate gold/xp *rate*, not for
 *    anything roster-composition-specific.
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

  const heroCount = input.heroCountOverride ?? input.preset.heroCount;
  const maxDays = input.maxDays;
  const sampleEveryDays = Math.max(1, input.sampleEveryDays || 5);

  // --------------------------------------------------- dynamic roster growth --
  // Patch 0217 addition: recruiting is now modeled as part of the spend
  // policy itself, not a fixed heroCount input, when `growRoster` is set --
  // starts at 1 hero, recruits another whenever a slot is open (Tavern's
  // own heroSlotsPerLevel, base 1 -- Renown's Extra Banner perk excluded,
  // same Phase 1 scope reasoning as everywhere else Renown is skipped in
  // this file) AND gold is available, always the CHEAPEST currently-
  // recruitable class (RECRUIT_COST) -- a rational choice under this sim's
  // own "every hero is an identical, same-level earner" simplification
  // (see file header), since a class's own flavor/mods aren't modeled at
  // all here, only raw headcount multiplying the income rate. Recruiting
  // is checked BEFORE the facility/upgrade spend loop each tick, ahead of
  // it in priority -- more heroes compounds every future tick's income,
  // unlike a one-time facility level, so a rational player grows the
  // economy first.
  //
  // Original version of this comment claimed Tavern and recruiting
  // "naturally alternate" without needing to reorder anything -- checked
  // directly and that was wrong: Tavern sits 5th in GUILD_FACILITIES'
  // declared order, behind Treasury specifically, which is priced as the
  // single biggest sink in the game. Under the plain declared order, the
  // sim gets stuck saving toward Treasury indefinitely and NEVER reaches
  // Tavern, so roster growth never happens at all -- confirmed directly
  // (a full run stalls at 1 hero even across an 800-day safety window).
  // A realistic player pursuing growth rushes the facility that
  // compounds every future tick's income before a single enormous
  // one-time sink, the same reasoning that already puts recruiting ahead
  // of ordinary facility spend above -- so growRoster mode reorders
  // Tavern to the front of the facility priority list specifically (see
  // spendList below), leaving every other facility/upgrade in its normal
  // declared order.
  const growRoster = input.growRoster === true;
  let liveHeroCount = growRoster ? 1 : heroCount;
  // One of every hero (patch 0219) -- recruiting can't repeat a class, so
  // this sim needs to track which classes are already "recruited" and
  // stop offering them, same real constraint GuildManager.recruit now
  // enforces in the live game. With exactly 9 classes total, roster growth
  // naturally caps at 9 regardless of how many Tavern/Extra Banner slots
  // exist beyond that -- rosterCap below reflects this.
  const recruitedClasses = new Set<string>(['adventurer']); // HeroManager.create's starting class, see file's own preset assumption below
  const allClasses = Object.keys(progression.RECRUIT_COST);
  const cheapestUnrecruitedCost = () => {
    const remaining = allClasses.filter((c) => !recruitedClasses.has(c));
    return remaining.length > 0 ? Math.min(...remaining.map((c) => progression.RECRUIT_COST[c as keyof typeof progression.RECRUIT_COST])) : Infinity;
  };
  const cheapestUnrecruitedClass = () => {
    const remaining = allClasses.filter((c) => !recruitedClasses.has(c));
    return remaining.reduce((best, c) => (
      progression.RECRUIT_COST[c as keyof typeof progression.RECRUIT_COST]
        < progression.RECRUIT_COST[best as keyof typeof progression.RECRUIT_COST] ? c : best
    ), remaining[0]);
  };
  const rosterCap = () => Math.min(
    allClasses.length,
    progression.GUILD_BY_ID.tavern
      ? 1 + (levels['tavern'] ?? 0) * (progression.GUILD_BY_ID.tavern.heroSlotsPerLevel ?? 0)
      : 1,
  );
  const recruitLog: { day: number; heroCount: number }[] = [];

  // ------------------------------------------------------------ spend list --
  // Fixed priority order: every Guild Facility to its maxLevel, then every
  // gold-tier Upgrade to its maxLevel, in the order each is declared in its
  // own file. A real player's priorities vary; this is a single deterministic
  // policy so pre/post comparisons are apples-to-apples, not a claim that
  // it's the only reasonable spend order. Renown Perks excluded -- see the
  // file-level comment on Phase 1 scope.
  type SpendItem = {
    kind: 'facility' | 'upgrade';
    id: string;
    label: string;
    maxLevel: number;
    costAt: (level: number) => number;
  };
  const orderedFacilities = growRoster
    ? [...progression.GUILD_FACILITIES].sort((a, b) => (a.id === 'tavern' ? -1 : b.id === 'tavern' ? 1 : 0))
    : progression.GUILD_FACILITIES;
  const spendList: SpendItem[] = [
    ...orderedFacilities.map((f): SpendItem => ({
      kind: 'facility', id: f.id, label: f.name, maxLevel: f.maxLevel,
      costAt: (level: number) => progression.guildCost(f, level),
    })),
    ...progression.UPGRADES.map((u): SpendItem => ({
      kind: 'upgrade', id: u.id, label: u.name, maxLevel: u.maxLevel,
      costAt: (level: number) => progression.upgradeCost(u, level),
    })),
  ];
  const levels: Record<string, number> = {};
  for (const item of spendList) levels[item.id] = 0;
  const completionDay: Record<string, number | null> = {};
  for (const item of spendList) completionDay[item.id] = null;

  // ------------------------------------------------------------- sim loop --
  let day = 0;
  let level = 1;
  let xp = 0;
  let gold = 0;
  let hitSafetyCap = false;

  const checkInHours = input.preset.checkInMinutes / 60;
  const levelCurve: { day: number; level: number }[] = [];
  const tierFirstSeen: Record<string, { day: number; level: number }> = {};
  let lastSampleDay = -Infinity;

  const allSpent = () => spendList.every((item) => levels[item.id] >= item.maxLevel);
  // Completion for a roster-growth run targets full facility/upgrade
  // spend AND a maxed-out roster (every Tavern-granted slot filled) --
  // hero level is tracked and reported but deliberately not part of this
  // run's own completion condition, since the actual ask was "how long
  // to buy everything," not "how long to hit 55" (already answered
  // separately, see the previous patch's own simulation).
  const rosterMaxed = () => !growRoster || liveHeroCount >= rosterCap();

  while (day < maxDays) {
    if (allSpent() && rosterMaxed()) break; // completion condition

    // Every difficulty is available at any level now (patch 0214 --
    // reqLevel rolls near hero.level regardless of tier), so "which tier"
    // is a pure pick-the-best-rate optimization now, not an unlock
    // question the way bestUnlockedTier's old reqLevel-gated logic
    // modeled. Picks whichever tier's expectedRatePerHour (gold) is
    // highest AT THE HERO'S CURRENT LEVEL -- both the tier choice and the
    // rate itself now track live `level`, neither pinned to a fixed
    // referenceLevel the way this loop read before patch 0217's fix (see
    // expectedRatePerHour's own comment for why that was wrong here).
    // Legendary excluded below level 25, matching quest_reqlevel.
    // legendaryLevelFloor -- this sim doesn't model the Enchanted Seal
    // unlock at all (Phase 1 scope, see file header), so treating
    // Legendary as unavailable below the level floor is the closer
    // approximation of the two.
    const eligibleTiers = DIFFICULTY_ORDER.filter((d) => d !== 'legendary' || level >= 25);
    const tier = eligibleTiers.reduce((best, id) => (
      balance.expectedRatePerHour(DIFFICULTIES[id], 'gold', level)
        > balance.expectedRatePerHour(DIFFICULTIES[best], 'gold', level) ? id : best
    ), eligibleTiers[0]);
    if (!tierFirstSeen[tier]) tierFirstSeen[tier] = { day, level };
    const cfg: DifficultyConfig = DIFFICULTIES[tier];

    const avgDurationMinutes = (cfg.minDuration + cfg.maxDuration) / 2 / MINUTE;
    // Idle-time approximation: if the check-in interval is longer than the
    // quest itself typically takes, the hero sits idle for the remainder
    // until the next check-in (Casual/AFK's whole reason for earning less
    // per day than Active at the same level) -- see file-level comment,
    // this is a deliberate expected-value simplification, not literal
    // per-quest event scheduling.
    const uptimeFactor = input.preset.checkInMinutes <= avgDurationMinutes
      ? 1
      : Math.min(1, avgDurationMinutes / input.preset.checkInMinutes);

    const goldPerHour = balance.expectedRatePerHour(cfg, 'gold', level);
    const xpPerHour = balance.expectedRatePerHour(cfg, 'xp', level);

    const goldGain = goldPerHour * liveHeroCount * uptimeFactor * checkInHours;
    const xpGain = xpPerHour * liveHeroCount * uptimeFactor * checkInHours;

    gold += goldGain;
    xp += xpGain;
    while (xp >= progression.xpForLevel(level)) {
      xp -= progression.xpForLevel(level);
      level += 1;
    }

    // Recruiting -- highest priority, checked before the facility/upgrade
    // spend loop below (see the file-level comment on why: more heroes
    // compounds every future tick's income). Only fires when growRoster
    // is on, a slot is actually open, and gold covers the cheapest
    // currently-recruitable (not-yet-recruited) class. "One of every
    // hero" (patch 0219) means the cheapest option changes over time as
    // classes get used up -- recomputed fresh each tick, not cached.
    if (growRoster && liveHeroCount < rosterCap() && gold >= cheapestUnrecruitedCost()) {
      const cls = cheapestUnrecruitedClass();
      gold -= progression.RECRUIT_COST[cls as keyof typeof progression.RECRUIT_COST];
      recruitedClasses.add(cls);
      liveHeroCount += 1;
      recruitLog.push({ day: Math.round(day), heroCount: liveHeroCount });
    }

    // Immediate spend, strictly in priority order: gold always goes toward
    // whichever incomplete item is highest-priority first. Deliberately NOT
    // "buy anything currently affordable, anywhere in the list" -- that
    // greedy variant was tried first and let cheap, low-priority items
    // (a handful of gold each) perpetually intercept every small income
    // trickle before it could ever bank up toward an expensive early-
    // priority item, so high-cost facilities never finished even after the
    // full multi-year safety window. This sequential version instead saves
    // gold entirely toward the current priority target and only advances to
    // the next item once it's fully maxed -- confirmed by rerunning after
    // the fix that core facilities now complete in a realistic timeframe.
    while (true) {
      const next = spendList.find((item) => levels[item.id] < item.maxLevel);
      if (!next) break;
      const cost = next.costAt(levels[next.id]);
      if (gold < cost) break;
      gold -= cost;
      levels[next.id] += 1;
      if (levels[next.id] >= next.maxLevel) completionDay[next.id] = Math.round(day);
    }

    day += checkInHours / 24;
    if (day - lastSampleDay >= sampleEveryDays) {
      levelCurve.push({ day: Math.round(day), level });
      lastSampleDay = day;
    }
  }

  if (day >= maxDays) hitSafetyCap = true;

  // ---------------------------------------------------- tier rate summary --
  // Snapshot of each tier's OWN reference-level rate (a fixed, level-
  // independent baseline for comparing tiers against each other), not a
  // tracked hero's live rate -- the sim loop above already reports the
  // real, level-tracked income via levelCurve/goldPerHour. See
  // expectedRatePerHour's own comment for the referenceLevel-vs-atLevel
  // distinction.
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

  // -------------------------------------------------- burst dominance check --
  // Sanity check carried over from balance.ts's own documented invariant
  // (fastQuestFloorPerHour can never exceed the real best-unlocked tier's
  // own rate) -- re-checked here against whatever tuning is active in THIS
  // process, so a proposed change that breaks the invariant shows up as a
  // real, flagged regression instead of silently shipping. Passes `lvl`
  // into expectedRatePerHour now (patch 0217 fix) -- this check is about
  // a specific hero level's real experience, not the tier's own fixed
  // reference point.
  const burstCheck = [5, 10, 15, 20, 25, 30, 40, 50].map((lvl) => {
    const tier = balance.bestUnlockedTier(lvl, false);
    const cfg = DIFFICULTIES[tier];
    const caps = balance.fastQuestCapsPerHour(lvl, false);
    const tierGoldPerHour = balance.expectedRatePerHour(cfg, 'gold', lvl);
    return {
      level: lvl,
      tier,
      capGoldPerHour: Math.round(caps.gold * 100) / 100,
      tierGoldPerHour: Math.round(tierGoldPerHour * 100) / 100,
      dominant: caps.gold > tierGoldPerHour,
    };
  });

  const result = {
    preset: input.preset.id,
    heroCount: liveHeroCount,
    growRoster,
    recruitLog,
    days: Math.round(day),
    hitSafetyCap,
    completed: !hitSafetyCap,
    finalLevel: level,
    finalGold: Math.round(gold),
    levelCurve,
    facilityCompletionDays: Object.fromEntries(
      spendList.filter((i) => i.kind === 'facility').map((i) => [i.id, completionDay[i.id]]),
    ),
    upgradeCompletionDays: Object.fromEntries(
      spendList.filter((i) => i.kind === 'upgrade').map((i) => [i.id, completionDay[i.id]]),
    ),
    allSpentDay: allSpent() ? Math.round(day) : null,
    tierRates,
    burstCheck,
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
