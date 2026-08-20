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
  const spendList: SpendItem[] = [
    ...progression.GUILD_FACILITIES.map((f): SpendItem => ({
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

  while (day < maxDays) {
    if (level >= 55 && allSpent()) break; // completion condition -- see file comment on the level-55 assumption

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

    const goldGain = goldPerHour * heroCount * uptimeFactor * checkInHours;
    const xpGain = xpPerHour * heroCount * uptimeFactor * checkInHours;

    gold += goldGain;
    xp += xpGain;
    while (xp >= progression.xpForLevel(level)) {
      xp -= progression.xpForLevel(level);
      level += 1;
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
    heroCount,
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
    tierRates,
    burstCheck,
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
