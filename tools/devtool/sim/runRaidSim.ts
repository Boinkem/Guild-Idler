/**
 * Balance Sandbox -- Raid Tuning worker (patch 0499).
 *
 * Runs ONE variant (live, or with a proposed overlay) and prints JSON to
 * stdout. Like runSim.ts it is always its own fresh tsx process (see
 * server.mjs /api/sim/raid): data/raids.ts reads the raid_difficulty
 * tuning into RAID_DIFFICULTIES the moment it is first imported, so
 * tuning overrides have to be applied before that import.
 *
 * Odds come from the game itself, not a copy of the formula: the party is
 * built as real Hero objects (HeroManager.create + baselineStats, spent
 * stat points, real gear from EquipmentManager.instantiate) inside a real
 * GameState (createInitialState), and every encounter's chance is
 * RaidManager.previewEncounterSuccess -- the same number the raid screen
 * shows and RaidManager.resolve rolls against. The "why" breakdown is
 * re-derived from RaidManager's own parts and checked against that number
 * (breakdownMatches).
 *
 * Because each encounter's chance is fixed once the party is locked in and
 * a raid stops at the first failed encounter, the run statistics are exact
 * rather than sampled: full clear = product of the chances, "lost at
 * encounter i" = cleared every earlier one then failed i, and over N runs
 * the chance of at least one clear is 1 - (1 - p)^N.
 *
 * Not modelled: pets, Renown perks, hero renown, attunements, elemental
 * weapons/resists (gear presets roll none), consumables, Raider's Charm,
 * injuries/health. Loot, gold, xp and duration are not reported.
 *
 * Patch 0500 (Raid Tuning v2): guild 'none' / 'typical' (facilities and
 * upgrades at min(0.5, raid level / 60) of max -- the calibration
 * baseline in claude/raid-rebalance-plan.md) / 'max'; gear presets
 * 'quest-hard-set' (Hard-quest Epics + the best quest set for the level)
 * and 'raid-fixed-<tier>' (that tier's own drops at any difficulty);
 * set-bonus success edits (dataOverrides.sets); checkpoint maths
 * (fights to a first clear, each fight retried on its own with
 * retryStep per loss up to retryCap); and 'ladder' mode.
 *
 * Modes (input.mode):
 *  - 'meta'  -> raids, encounters, classes, difficulties (for the UI).
 *  - 'one'   -> one raid + difficulty with a given (or auto-built) party.
 *  - 'all'   -> every raid x difficulty, each with an auto-built party at
 *               the raid's own level (+ levelOffset).
 *  - 'ladder'-> every raid x gear tier (quest, Normal..Mythic drops) x
 *               difficulty, for the agreed 70/50/35/20 ladder.
 */

import { TUNING_BY_ID } from '../../../src/game/data/tuning';

type Role = 'melee' | 'ranged' | 'caster';
type GearPreset = 'none' | 'quest-rare' | 'quest-epic' | 'quest-legendary' | 'quest-hard-set'
  | 'raid-below' | 'raid-same' | 'raid-fixed-normal' | 'raid-fixed-heroic' | 'raid-fixed-mythic' | 'raid-fixed-legendary';
type StatMode = 'unspent' | 'even' | 'strength';
type PartySlot = { heroClass: string; level: number; role?: Role };

type RaidInput = {
  mode: 'meta' | 'one' | 'all' | 'ladder';
  overrides?: Record<string, number>;
  /** Proposed raid data edits, applied in memory only. */
  dataOverrides?: {
    encounters?: Record<string, { baseSuccess?: number }>;
    raids?: Record<string, { successModifier?: number }>;
    /** setId -> { pieceCount: success } -- replaces that set tier's
     *  success bonus (patch 0500); other set effects are kept. */
    sets?: Record<string, Record<string, number>>;
  };
  raidId?: string;
  difficulty?: string;
  party?: PartySlot[];
  /** 'all' mode, and 'one' mode when party is omitted: party level = raid reqLevel + this. */
  levelOffset?: number;
  gear?: GearPreset;
  statMode?: StatMode;
  /** true = every guild facility and upgrade at max level. */
  guildMaxed?: boolean;
  /** 'typical' = facilities/upgrades at min(0.5, reqLevel/60) of max
   *  (wins over guildMaxed); 'none' / 'max' as named. */
  guild?: 'none' | 'typical' | 'max';
  /** Per-fight retry bonus for checkpoint maths: +step per loss, up to cap. */
  retryStep?: number;
  retryCap?: number;
  runs?: number;
};

function applyOverrides(overrides: Record<string, number>) {
  for (const [id, value] of Object.entries(overrides)) {
    const entry = TUNING_BY_ID[id];
    if (!entry) { process.stderr.write(`raid sim: unknown tuning id ignored: "${id}"\n`); continue; }
    entry.value = value;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const input = JSON.parse(await readStdin()) as RaidInput;
  applyOverrides(input.overrides ?? {});

  // Dynamic imports AFTER the overlay -- see the header comment.
  const raids = await import('../../../src/game/data/raids');
  const { RaidManager } = await import('../../../src/game/managers/RaidManager');
  const { HeroManager } = await import('../../../src/game/managers/HeroManager');
  const { EquipmentManager } = await import('../../../src/game/managers/EquipmentManager');
  const { createInitialState } = await import('../../../src/game/managers/SaveManager');
  const { HERO_CLASSES, GUILD_FACILITIES, UPGRADES, MAX_HERO_LEVEL } = await import('../../../src/game/data/progression');
  const { EQUIPMENT, EQUIP_SLOTS, EQUIPMENT_BY_ID, ITEM_SETS, SET_BY_ID } = await import('../../../src/game/data/equipment');
  const { isProceduralTemplate } = await import('../../../src/game/data/proceduralLoot');
  const { MIN_SUCCESS, MAX_SUCCESS } = await import('../../../src/game/managers/QuestManager');
  const { createRng } = await import('../../../src/game/rng');
  const { clamp } = await import('../../../src/game/util');
  const { Tuning } = await import('../../../src/game/data/tuning');

  const { RAIDS, RAID_BY_ID, RAID_ENCOUNTER_BY_ID, RAID_DIFFICULTIES, RAID_DIFFICULTY_ORDER, RAID_DIFFICULTY_LABEL, lootForDifficulty, parseLootEntry } = raids;

  // Proposed data edits, in memory only (the defs are plain objects read
  // at call time by RaidManager).
  for (const [id, patch] of Object.entries(input.dataOverrides?.encounters ?? {})) {
    const enc = RAID_ENCOUNTER_BY_ID[id];
    if (enc && Number.isFinite(patch.baseSuccess)) enc.baseSuccess = patch.baseSuccess as number;
  }
  for (const [id, patch] of Object.entries(input.dataOverrides?.raids ?? {})) {
    const raid = RAID_BY_ID[id];
    if (raid && Number.isFinite(patch.successModifier)) raid.successModifier = patch.successModifier as number;
  }

  for (const [setId, tiers] of Object.entries(input.dataOverrides?.sets ?? {})) {
    const set = SET_BY_ID[setId];
    if (!set) continue;
    for (const b of set.bonuses) if (Number.isFinite(tiers[String(b.count)])) b.mods = { ...b.mods, success: tiers[String(b.count)] };
  }
  // Quest/shop sets (no piece is a raid drop, chain reward or craft) --
  // what a quest-only guild can complete.
  const raidLootIds = new Set<string>();
  for (const enc of Object.values(RAID_ENCOUNTER_BY_ID)) for (const k of ['loot', 'lootHeroic', 'lootMythic', 'lootLegendary'] as const) {
    for (const e of ((enc as Record<string, unknown>)[k] as string[] | undefined) ?? []) { const p = parseLootEntry(e); if (p) raidLootIds.add(p.defId); }
  }
  const questSets = ITEM_SETS.filter((set) => {
    const pieces = EQUIPMENT.filter((d) => d.setId === set.id);
    return pieces.length > 0 && pieces.every((d) => !raidLootIds.has(d.id) && !d.raidExclusive && !d.craftable && !(d as { chainExclusive?: boolean }).chainExclusive);
  }).map((set) => ({ set, pieces: EQUIPMENT.filter((d) => d.setId === set.id), level: Math.max(...EQUIPMENT.filter((d) => d.setId === set.id).map((d) => d.reqLevel)) }));

  const playableClasses = Object.entries(HERO_CLASSES)
    .filter(([, c]) => !(c as { requiresDlc?: unknown }).requiresDlc)
    .map(([id, c]) => ({ id, name: (c as { name?: string }).name ?? id, role: ((c as { role?: Role }).role ?? 'melee') as Role, tier: (c as { tier?: number }).tier ?? 0 }));

  /** The set(s) a raid's loot belongs to (patch 0500), for set-bonus edits. */
  const raidSets = (raidId: string) => {
    const ids = new Set<string>();
    for (const encId of RAID_BY_ID[raidId]?.encounterIds ?? []) {
      const enc = RAID_ENCOUNTER_BY_ID[encId] as Record<string, unknown> | undefined;
      for (const k of ['loot', 'lootHeroic', 'lootMythic', 'lootLegendary']) {
        for (const e of (enc?.[k] as string[] | undefined) ?? []) {
          const p = parseLootEntry(e);
          const setId = p && EQUIPMENT_BY_ID[p.defId]?.setId;
          if (setId && SET_BY_ID[setId]) ids.add(setId);
        }
      }
    }
    return [...ids].map((id) => ({
      id, name: SET_BY_ID[id].name, pieces: EQUIPMENT.filter((d) => d.setId === id).length,
      tiers: SET_BY_ID[id].bonuses.map((b) => ({ count: b.count, success: b.mods.success ?? 0 })),
    }));
  };

  if (input.mode === 'meta') {
    process.stdout.write(JSON.stringify({
      raids: RAIDS.map((r) => ({
        sets: raidSets(r.id),
        id: r.id, name: r.name, reqLevel: r.reqLevel, successModifier: r.successModifier ?? 0,
        requiredRoles: r.requiredRoles ?? {},
        encounters: r.encounterIds.map((id) => ({ id, name: RAID_ENCOUNTER_BY_ID[id]?.name ?? id, baseSuccess: RAID_ENCOUNTER_BY_ID[id]?.baseSuccess ?? null })),
      })),
      difficulties: RAID_DIFFICULTY_ORDER.map((d) => ({
        id: d, label: RAID_DIFFICULTY_LABEL[d], partySize: RAID_DIFFICULTIES[d].partySize,
        successPenalty: RAID_DIFFICULTIES[d].successPenalty, roleMismatchCap: RAID_DIFFICULTIES[d].roleMismatchCap ?? null,
      })),
      classes: playableClasses,
      maxLevel: MAX_HERO_LEVEL,
      roleMismatchPenaltyPerSlot: Tuning.get('raid.roleMismatchPenaltyPerSlot'),
    }));
    return;
  }

  let gear: GearPreset = input.gear ?? 'quest-hard-set';
  const statMode: StatMode = input.statMode ?? 'even';
  const runs = Math.max(1, Math.min(1_000_000, Math.floor(input.runs ?? 100)));
  const now = Date.UTC(2026, 0, 1);

  // ------------------------------------------------------------ state --
  const guildMode = input.guild ?? (input.guildMaxed ? 'max' : 'none');
  const baseState = (reqLevel: number) => {
    const state = createInitialState(now);
    state.heroes = [];
    const frac = guildMode === 'max' ? 1 : guildMode === 'typical' ? Math.min(0.5, reqLevel / 60) : 0;
    if (frac > 0) {
      for (const f of GUILD_FACILITIES) state.guild[f.id] = Math.floor(f.maxLevel * frac);
      for (const u of UPGRADES) state.upgrades[u.id] = Math.floor(u.maxLevel * frac);
    }
    return state;
  };

  // ------------------------------------------------------------- gear --
  const RARITY_FALLBACK: Record<string, string[]> = {
    'quest-rare': ['rare', 'uncommon', 'common'],
    'quest-epic': ['epic', 'rare', 'uncommon'],
    'quest-legendary': ['legendary', 'epic', 'rare'],
  };
  /** Quest-drop style gear: the slot's blank procedural template of the
   *  wanted rarity (falling back a rarity if a slot has none), rolled at
   *  the hero's level exactly as a quest drop would be (seeded, so runs
   *  are repeatable). */
  const questItem = (slot: string, preset: string, level: number, seed: string) => {
    if (preset === 'quest-hard-set') {
      // Hard-quest Epics (Hard tag, x1.15 budget) in every slot, then the
      // best quest set the hero's level allows over them.
      const set = [...questSets].filter((q) => q.level <= level).sort((a, b) => b.level - a.level)[0];
      const piece = set?.pieces.find((d) => d.slot === slot);
      if (piece) return EquipmentManager.instantiate(piece.id, { itemLevel: level, sourceTag: 'hard', rng: createRng(seed), heroLevel: level });
      const def = EQUIPMENT.find((d) => d.slot === slot && d.rarity === 'epic' && isProceduralTemplate(d) && !d.raidExclusive && !d.craftable);
      return def ? EquipmentManager.instantiate(def.id, { itemLevel: level, sourceTag: 'hard', rng: createRng(seed), heroLevel: level }) : null;
    }
    for (const rarity of RARITY_FALLBACK[preset] ?? []) {
      const def = EQUIPMENT.find((d) => d.slot === slot && d.rarity === rarity && isProceduralTemplate(d)
        && !d.raidExclusive && !d.craftable && !(d as { chainExclusive?: boolean }).chainExclusive && d.reqLevel <= level);
      if (def) return EquipmentManager.instantiate(def.id, { itemLevel: level, sourceTag: 'standard', rng: createRng(seed), heroLevel: level });
    }
    return null;
  };
  /** This raid's own drops at this difficulty, one per slot, rolled the way
   *  RaidManager.resolve rolls them (raid-level item, party-level scaling,
   *  difficulty rarity floor). Slots with no raid drop get quest Epics. */
  const raidDropsBySlot = (raidId: string, difficulty: string) => {
    const raid = RAID_BY_ID[raidId];
    const bySlot: Record<string, string> = {};
    for (const encId of raid?.encounterIds ?? []) {
      const enc = RAID_ENCOUNTER_BY_ID[encId];
      if (!enc) continue;
      for (const entry of lootForDifficulty(enc, difficulty as never)) {
        const parsed = parseLootEntry(entry);
        const def = parsed && EQUIPMENT_BY_ID[parsed.defId];
        if (def && !bySlot[def.slot]) bySlot[def.slot] = def.id;
      }
    }
    return bySlot;
  };
  const raidSourceTag = (d: string) => (d === 'heroic' ? 'raidHeroic' : d === 'mythic' ? 'raidMythic' : d === 'legendary' ? 'raidLegendary' : 'raidNormal');

  // ------------------------------------------------------------ heroes --
  const buildHero = (slot: PartySlot, index: number, raidId: string, difficulty: string, partyLevel: number) => {
    const cls = HERO_CLASSES[slot.heroClass] ? slot.heroClass : 'adventurer';
    const level = clamp(Math.round(slot.level), 1, MAX_HERO_LEVEL);
    const hero = HeroManager.create(cls, createRng(`raidsim:hero:${index}`));
    hero.level = level;
    hero.stats = HeroManager.baselineStats(cls, level);
    const points = level - 1;
    if (statMode === 'strength') { hero.stats.strength += points; hero.statPoints = 0; }
    else if (statMode === 'even') {
      const keys = ['strength', 'endurance', 'luck', 'wisdom'] as const;
      for (let i = 0; i < points; i++) hero.stats[keys[i % 4]] += 1;
      hero.statPoints = 0;
    } else hero.statPoints = points;
    const native = HeroManager.nativeRole(cls);
    if (slot.role && slot.role !== native) { hero.role = slot.role; hero.unlockedRoles = [native, slot.role]; }
    if (gear !== 'none') {
      // 'raid-below' = this raid's drops from the difficulty below (what a
      // party realistically wears going in; Normal has none, so quest
      // Epics); 'raid-same' = this difficulty's own drops (farming).
      const dropTier = (gear as string).startsWith('raid-fixed-') ? (gear as string).slice(11) : gear === 'raid-same' ? difficulty
        : gear === 'raid-below' ? RAID_DIFFICULTY_ORDER[RAID_DIFFICULTY_ORDER.indexOf(difficulty as never) - 1] : undefined;
      const raidSlots = dropTier ? raidDropsBySlot(raidId, dropTier) : {};
      const raid = RAID_BY_ID[raidId];
      for (const s of EQUIP_SLOTS) {
        let item = null;
        if (raidSlots[s]) {
          item = EquipmentManager.instantiate(raidSlots[s], {
            itemLevel: raid?.reqLevel ?? level, sourceTag: raidSourceTag(dropTier as string) as never,
            rng: createRng(`raidsim:${index}:${s}`), heroLevel: partyLevel, rarityFloor: RAID_DIFFICULTIES[dropTier as never]?.rarityFloor,
          });
        } else {
          item = questItem(s, (gear as string).startsWith('raid-') ? 'quest-hard-set' : gear, level, `raidsim:${index}:${s}`);
        }
        if (item) hero.equipment[s] = item;
      }
    }
    return hero;
  };

  /** Auto party: meets the raid's required roles first (training a hero
   *  into a role when there aren't enough native classes), then fills with
   *  the strongest remaining classes. Distinct classes, as in game. */
  const autoParty = (raidId: string, difficulty: string, level: number): PartySlot[] => {
    const size = RAID_DIFFICULTIES[difficulty as never]?.partySize ?? 3;
    const need = { ...(RAID_BY_ID[raidId]?.requiredRoles ?? {}) } as Partial<Record<Role, number>>;
    const strength = (id: string) => {
      const c = HERO_CLASSES[id] as { mods?: { success?: number }; growth?: { strength?: number } };
      return (c.mods?.success ?? 0) + (c.growth?.strength ?? 0) * 6;
    };
    const pool = [...playableClasses].sort((a, b) => strength(b.id) - strength(a.id));
    const used = new Set<string>();
    const party: PartySlot[] = [];
    for (const [role, n] of Object.entries(need) as [Role, number][]) {
      for (let i = 0; i < n && party.length < size; i++) {
        const pick = pool.find((c) => !used.has(c.id) && c.role === role) ?? pool.find((c) => !used.has(c.id));
        if (!pick) break;
        used.add(pick.id);
        party.push({ heroClass: pick.id, level, role });
      }
    }
    for (const c of pool) {
      if (party.length >= size) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      party.push({ heroClass: c.id, level, role: c.role });
    }
    return party;
  };

  // ---------------------------------------------------------- evaluate --
  const evaluate = (raidId: string, difficulty: string, partySlots: PartySlot[]) => {
    const raid = RAID_BY_ID[raidId];
    const diffCfg = RAID_DIFFICULTIES[difficulty as never];
    if (!raid || !diffCfg) throw new Error(`Unknown raid/difficulty: ${raidId}/${difficulty}`);
    const state = baseState(raid.reqLevel);
    const avgLevel = Math.round(partySlots.reduce((s, p) => s + p.level, 0) / Math.max(1, partySlots.length));
    const heroes = partySlots.map((p, i) => buildHero(p, i, raidId, difficulty, avgLevel));
    state.heroes = heroes;
    const heroIds = heroes.map((h) => h.id);
    const baselineLevel = RaidManager.successBaselineLevel(raid, heroes);
    const partyBonus = RaidManager.partySuccessBonus(state, heroes, now, baselineLevel);
    const roleMismatch = RaidManager.roleMismatchPenalty(heroes, raid.requiredRoles);
    const mismatched = RaidManager.hasRoleMismatch(heroes, raid.requiredRoles);
    const roleCounts = RaidManager.partyRoleCounts(heroes);
    const modifier = raid.successModifier ?? 0;

    const encounters = raid.encounterIds.map((encId) => {
      const enc = RAID_ENCOUNTER_BY_ID[encId];
      const chance = RaidManager.previewEncounterSuccess(state, heroIds, raidId, difficulty as never, encId, now);
      const elemental = enc ? RaidManager.elementalBonus(heroes, enc) : 0;
      const base = enc?.baseSuccess ?? 0;
      const raw = base - diffCfg.successPenalty + partyBonus + elemental + modifier - roleMismatch;
      const clamped = clamp(raw, MIN_SUCCESS, MAX_SUCCESS);
      const capped = diffCfg.roleMismatchCap != null && mismatched && clamped > diffCfg.roleMismatchCap;
      const derived = capped ? (diffCfg.roleMismatchCap as number) : clamped;
      return {
        id: encId, name: enc?.name ?? encId, chance,
        breakdown: {
          base, difficultyPenalty: -diffCfg.successPenalty, partyBonus, elemental, raidModifier: modifier,
          roleMismatch: -roleMismatch, raw, clampedTo: clamped !== raw ? clamped : null,
          roleCap: capped ? diffCfg.roleMismatchCap : null,
        },
        breakdownMatches: Math.abs(derived - chance) < 1e-6,
      };
    });

    let reach = 1;
    const ends = encounters.map((e) => {
      const p = e.chance / 100;
      const lost = reach * (1 - p);
      reach *= p;
      return { encounterId: e.id, name: e.name, lostHere: lost };
    });
    const fullClear = reach;
    // Checkpoint maths (patch 0500 calibration): each fight is retried on
    // its own; every loss on it adds retryStep (up to retryCap). Expected
    // attempts per fight, and expected fights fought to a first clear
    // with and without checkpoints (no retry bonus without).
    const retryStep = input.retryStep ?? 5;
    const retryCap = input.retryCap ?? 15;
    const attemptsFor = (chance: number) => {
      let expected = 0; let notYet = 1;
      for (let k = 0; k < 200 && notYet > 1e-9; k++) {
        const p = Math.min(MAX_SUCCESS, chance + Math.min(retryCap, retryStep * k)) / 100;
        expected += (k + 1) * notYet * p;
        notYet *= 1 - p;
      }
      return expected;
    };
    const fightsPerRun = encounters.reduce((acc, e, i) => acc + encounters.slice(0, i).reduce((p, x) => p * x.chance / 100, 1), 0);
    const checkpoint = {
      fightsToClear: encounters.reduce((acc, e) => acc + attemptsFor(e.chance), 0),
      fightsToClearNoCheckpoint: fullClear > 0 ? fightsPerRun / fullClear : null,
    };
    const runsStats = {
      runs,
      atLeastOneClear: 1 - Math.pow(1 - fullClear, runs),
      expectedClears: fullClear * runs,
      expectedRunsToFirstClear: fullClear > 0 ? 1 / fullClear : null,
      medianRunsToFirstClear: fullClear >= 1 ? 1 : fullClear > 0 ? Math.ceil(Math.log(0.5) / Math.log(1 - fullClear)) : null,
    };
    const heroRows = heroes.map((h, i) => ({
      heroClass: h.heroClass, level: h.level, role: HeroManager.activeRole(h),
      gearScore: Math.round(HeroManager.gearScore(h)),
      // This hero's own contribution before the weakest-link blend.
      contribution: Math.round(RaidManager.partySuccessBonus(state, [h], now, baselineLevel) * 10) / 10,
      slot: i,
    }));
    return {
      raidId, raidName: raid.name, difficulty, partySize: diffCfg.partySize,
      party: partySlots, heroes: heroRows, partyBonus, roleMismatch, mismatched, roleCounts,
      requiredRoles: raid.requiredRoles ?? {}, roleMismatchCap: diffCfg.roleMismatchCap ?? null,
      // True when the raid's role minimums need more heroes than this
      // difficulty's party holds -- that difficulty can never meet them.
      rolesExceedParty: Object.values(raid.requiredRoles ?? {}).reduce((a: number, b) => a + (b ?? 0), 0) > diffCfg.partySize,
      baselineLevel, encounters, ends, fullClear, checkpoint, ...runsStats,
    };
  };

  const levelOffset = Math.round(input.levelOffset ?? 0);
  const levelFor = (raidId: string) => clamp((RAID_BY_ID[raidId]?.reqLevel ?? 1) + levelOffset, 1, MAX_HERO_LEVEL);

  if (input.mode === 'one') {
    const raidId = input.raidId ?? RAIDS[0].id;
    const difficulty = input.difficulty ?? 'normal';
    const party = Array.isArray(input.party) && input.party.length ? input.party : autoParty(raidId, difficulty, levelFor(raidId));
    process.stdout.write(JSON.stringify({ engine: 'raid-v2', gear, statMode, guild: guildMode, ...evaluate(raidId, difficulty, party) }));
    return;
  }

  if (input.mode === 'ladder') {
    // Patch 0500 -- the agreed raid ladder check: each raid x gear tier
    // (quest gear, then each tier's own raid drops) x difficulty, auto
    // party at the raid's level. Target: gear one tier below a difficulty
    // ~70% full clear, one rung per difficulty above (see
    // claude/raid-rebalance-plan.md).
    const tiers: GearPreset[] = ['quest-hard-set', 'raid-fixed-normal', 'raid-fixed-heroic', 'raid-fixed-mythic'];
    const ladder = RAIDS.map((r) => ({
      raidId: r.id, raidName: r.name, reqLevel: r.reqLevel, encounters: r.encounterIds.length,
      rows: tiers.map((t) => {
        gear = t;
        return {
          gear: t,
          cells: RAID_DIFFICULTY_ORDER.map((d) => {
            const res = evaluate(r.id, d, autoParty(r.id, d, levelFor(r.id)));
            return { difficulty: d, fullClear: res.fullClear, partyBonus: res.partyBonus, mismatched: res.mismatched, checkpoint: res.checkpoint };
          }),
        };
      }),
    }));
    process.stdout.write(JSON.stringify({ engine: 'raid-v2', guild: guildMode, statMode, levelOffset, ladder }));
    return;
  }

  // mode 'all'
  const grid = RAIDS.map((r) => ({
    raidId: r.id, raidName: r.name, reqLevel: r.reqLevel, encounters: r.encounterIds.length,
    baseSuccesses: r.encounterIds.map((id) => RAID_ENCOUNTER_BY_ID[id]?.baseSuccess ?? null),
    successModifier: r.successModifier ?? 0,
    cells: RAID_DIFFICULTY_ORDER.map((d) => {
      const res = evaluate(r.id, d, autoParty(r.id, d, levelFor(r.id)));
      return {
        difficulty: d, fullClear: res.fullClear, partyBonus: res.partyBonus, mismatched: res.mismatched, rolesExceedParty: res.rolesExceedParty,
        chances: res.encounters.map((e) => e.chance), expectedRunsToFirstClear: res.expectedRunsToFirstClear, checkpoint: res.checkpoint,
        party: res.party.map((p) => p.heroClass),
      };
    }),
  }));
  process.stdout.write(JSON.stringify({ engine: 'raid-v2', gear, statMode, guild: guildMode, levelOffset, grid }));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
