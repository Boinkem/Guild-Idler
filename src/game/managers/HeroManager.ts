import { EQUIPMENT_BY_ID, GEAR_SCORE_BY_RARITY, SET_BY_ID } from '../data/equipment';
import { INJURIES } from '../data/items';
import { HERO_CLASSES, RECRUIT_START_LEVEL, xpForLevel, infirmaryHealTimeMinutes } from '../data/progression';
import { DIFFICULTY_ORDER } from '../data/quests';
import { Tuning } from '../data/tuning';
import { Difficulty, Hero, HeroClass, Injury, Modifiers, Stats } from '../types';
import { Rng, uid } from '../rng';
import { MINUTE, scaleMods, sumMods } from '../util';

export const HeroManager = {
  create(heroClass: HeroClass, rng: Rng, nameOverride?: string): Hero {
    const def = HERO_CLASSES[heroClass];
    const startLevel = RECRUIT_START_LEVEL[def.tier] ?? 1;

    // Grow base stats up to the starting level so a tier-3 hire isn't a level-1
    // weakling despite the price. Each level applies the class growth once.
    const stats = { ...def.baseStats };
    for (let lvl = 1; lvl < startLevel; lvl++) {
      stats.strength += def.growth.strength;
      stats.endurance += def.growth.endurance;
      stats.luck += def.growth.luck;
      stats.wisdom += def.growth.wisdom;
    }

    return {
      id: uid('hero'),
      name: nameOverride ?? rng.pick(def.names),
      heroClass,
      level: startLevel,
      xp: 0,
      stats,
      statPoints: startLevel - 1,
      equipment: {},
      injuries: [],
      status: 'idle',
      activeQuestId: null,
      questsCompleted: 0,
      skin: 'original',
      ascension: 0,
      autoChainCount: 0,
      autoChainTarget: null,
      bonusStats: { strength: 0, endurance: 0, luck: 0, wisdom: 0 },
    };
  },

  /**
   * The stats a hero of this class would have at a given level with zero
   * investment -- no equipment, no bonusStats, no spent stat points. Same
   * automatic per-level growth math create()/grantXp already apply, just
   * evaluated directly for an arbitrary level instead of by simulating
   * every level-up in sequence. Used to anchor success chance to a quest's
   * own reqLevel rather than the hero's raw level -- see
   * QuestManager.previewSuccess's comment for why.
   */
  baselineStats(heroClass: HeroClass, level: number): Stats {
    const def = HERO_CLASSES[heroClass];
    const levels = Math.max(0, level - 1);
    return {
      strength: def.baseStats.strength + def.growth.strength * levels,
      endurance: def.baseStats.endurance + def.growth.endurance * levels,
      luck: def.baseStats.luck + def.growth.luck * levels,
      wisdom: def.baseStats.wisdom + def.growth.wisdom * levels,
    };
  },

  xpToNext(hero: Hero): number {
    return xpForLevel(hero.level);
  },

  /** Adds xp and applies as many level-ups as it earns. Returns levels gained. */
  grantXp(hero: Hero, amount: number): number {
    hero.xp += Math.max(0, Math.floor(amount));
    let gained = 0;
    while (hero.xp >= xpForLevel(hero.level)) {
      hero.xp -= xpForLevel(hero.level);
      hero.level += 1;
      gained += 1;
      const growth = HERO_CLASSES[hero.heroClass].growth;
      hero.stats = {
        strength: hero.stats.strength + growth.strength,
        endurance: hero.stats.endurance + growth.endurance,
        luck: hero.stats.luck + growth.luck,
        wisdom: hero.stats.wisdom + growth.wisdom,
      };
      hero.statPoints += 1;
    }
    return gained;
  },

  /** Stats coming from equipped, unbroken gear -- including any Enchanting on top. */
  equipmentStats(hero: Hero): Stats {
    const total: Stats = { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      const scale = 1 + item.plus * 0.15;
      const base = def.stats;
      const enchant = item.enchantStats;
      if (!base && !enchant) continue;
      total.strength += ((base?.strength ?? 0) + (enchant?.strength ?? 0)) * scale;
      total.endurance += ((base?.endurance ?? 0) + (enchant?.endurance ?? 0)) * scale;
      total.luck += ((base?.luck ?? 0) + (enchant?.luck ?? 0)) * scale;
      total.wisdom += ((base?.wisdom ?? 0) + (enchant?.wisdom ?? 0)) * scale;
    }
    return total;
  },

  /**
   * Sum of GEAR_SCORE_BY_RARITY across every equipped item. Deliberately
   * flat per tier (see GEAR_SCORE_BY_RARITY) rather than reading the item's
   * rolled stats -- this is a badge of "how well is this hero geared",
   * separate from and in addition to the combat-stat bonus gear already
   * grants via equipmentStats(). Broken/zero-durability items still count:
   * the badge represents what's equipped, not what's currently usable.
   */
  gearScore(hero: Hero): number {
    let total = 0;
    for (const item of Object.values(hero.equipment)) {
      if (!item) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      total += GEAR_SCORE_BY_RARITY[def.rarity] ?? 0;
    }
    return total;
  },

  totalStats(hero: Hero): Stats {
    const gear = HeroManager.equipmentStats(hero);
    const bonus = hero.bonusStats ?? { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    return {
      strength: hero.stats.strength + gear.strength + bonus.strength,
      endurance: hero.stats.endurance + gear.endurance + bonus.endurance,
      luck: hero.stats.luck + gear.luck + bonus.luck,
      wisdom: hero.stats.wisdom + gear.wisdom + bonus.wisdom,
    };
  },

  /* ------------------------------- health -------------------------------- */

  /**
   * Max Health -- a base floor, plus sqrt(endurance) (same shape
   * statMods already uses for injuryResist) and a flat per-level term,
   * plus any flat `health` bonus gear rolls (EquipmentDef.mods.health,
   * summed the normal way via equipmentMods). Since Health damage is
   * always expressed as a % of this max rather than a flat amount, these
   * coefficients mostly govern feel/display -- see
   * guild-idler-status.md's Health stat + Fallen/death mechanic section.
   */
  maxHealth(hero: Hero): number {
    const endurance = HeroManager.totalStats(hero).endurance;
    const base = Tuning.get('health.maxHealthBase')
      + Math.sqrt(endurance) * Tuning.get('health.maxHealthEnduranceCoefficient')
      + hero.level * Tuning.get('health.maxHealthLevelCoefficient');
    const gearBonus = HeroManager.equipmentMods(hero).health ?? 0;
    return Math.round(base + gearBonus);
  },

  /**
   * Current Health, defaulting to full whenever `hero.health` is
   * undefined -- see Hero.health's own comment for why this is the one
   * place that default should be applied. Also clamps to the current
   * max, so a Health value stored while more heavily geared doesn't
   * read as "healed above max" after gear changes lower it back down.
   */
  currentHealth(hero: Hero): number {
    const max = HeroManager.maxHealth(hero);
    return Math.min(hero.health ?? max, max);
  },

  healthPercent(hero: Hero): number {
    const max = HeroManager.maxHealth(hero);
    if (max <= 0) return 0;
    return (HeroManager.currentHealth(hero) / max) * 100;
  },

  /**
   * Applies Health damage as a percent of max, piggybacking on the
   * existing injury roll rather than a separate trigger -- see
   * items.ts's healthDamagePercentForInjuryDef for where the percent
   * itself comes from. No floor: reaching (or going below, in one hit)
   * 0 flips the hero to 'fallen' -- see the Fallen state's own comment
   * on HeroStatus and reviveHero/checkAutoRevive below. Deliberately
   * does nothing if the hero is already fallen -- damage can't stack
   * past 0 in a way that matters.
   */
  applyHealthDamage(hero: Hero, damagePercent: number): void {
    if (hero.status === 'fallen') return;
    const max = HeroManager.maxHealth(hero);
    const current = HeroManager.currentHealth(hero);
    const damage = (damagePercent / 100) * max;
    const remaining = Math.max(0, current - damage);
    hero.health = remaining;
    if (remaining <= 0) {
      hero.status = 'fallen';
      hero.fallenAt = Date.now();
    }
  },

  /**
   * Passive regen -- a continuous rate derived from the current target
   * heal time (100% / minutes), NOT a fixed tick. A fixed-interval tick
   * (the original plan reused the dormant REST_TICK constant) can't work
   * once Infirmary's heal time drops to 10 minutes at max level while
   * REST_TICK was a fixed 30 -- see guild-idler-status.md's correction
   * note. `elapsedMs` is whatever real time has actually passed since
   * the last tick/offline-catchup calculation, same "compute from
   * elapsed time, not a counted tick" approach QuestManager's offline
   * resolution already uses elsewhere. Rate is halved to
   * health.questRegenFraction while `questing` is true, so a long quest
   * isn't a total recovery freeze, just slower than resting at the guild.
   * No-ops for a Fallen hero -- Health regen is irrelevant until revived.
   */
  regenHealth(hero: Hero, elapsedMs: number, infirmaryLevel: number, questing: boolean): void {
    if (hero.status === 'fallen') return;
    const max = HeroManager.maxHealth(hero);
    const current = HeroManager.currentHealth(hero);
    if (current >= max) {
      hero.health = max;
      return;
    }
    const healTimeMinutes = infirmaryHealTimeMinutes(infirmaryLevel);
    const fraction = questing ? Tuning.get('health.questRegenFraction') : 1;
    const percentPerMinute = (100 / healTimeMinutes) * fraction;
    const regen = (elapsedMs / MINUTE) * percentPerMinute * (max / 100);
    hero.health = Math.min(max, current + regen);
  },

  /**
   * Gold cost to instantly revive a Fallen hero -- see
   * fallen.revivalCostBase/PerLevel. `discountPercent` comes from
   * Undertaker's Favor (ModifierManager.global(state).revivalDiscount) --
   * a parameter rather than reading state directly here, so HeroManager
   * doesn't need a GameState/ModifierManager import for one field. Callers
   * (engine.reviveHero, the Revive button, reviveAllFallen) all pass it
   * through the same way.
   */
  revivalCost(hero: Hero, discountPercent = 0): number {
    const base = Tuning.get('fallen.revivalCostBase') + hero.level * Tuning.get('fallen.revivalCostPerLevel');
    return Math.round(base * (1 - Math.min(100, Math.max(0, discountPercent)) / 100));
  },

  /**
   * Brings a Fallen hero back at full Health -- shared by both the paid
   * instant-revive path and the free auto-revive path once Infirmary
   * hits max level. Deliberately does NOT touch level/xp/gear/ascension
   * -- nothing permanent was lost, see guild-idler-status.md.
   */
  revive(hero: Hero): void {
    hero.status = 'idle';
    hero.health = HeroManager.maxHealth(hero);
    hero.fallenAt = null;
  },

  /**
   * True once a Fallen hero has waited out Infirmary's free auto-revive
   * timer -- only reachable at all once infirmaryAutoReviveUnlocked(level)
   * is true; below max Infirmary level there is no free path, only
   * paid (see revivalCost above). Checked from the engine tick, same
   * "compute from elapsed real time" shape regenHealth already uses.
   */
  autoReviveDue(hero: Hero, now: number): boolean {
    if (hero.status !== 'fallen' || !hero.fallenAt) return false;
    const hours = Tuning.get('guild_facility.infirmary.autoReviveHours');
    return now - hero.fallenAt >= hours * 60 * MINUTE;
  },

  /**
   * Stats convert to modifiers on a deliberately gentle curve so that gear and
   * upgrades stay relevant deep into the game.
   */
  /**
   * loot is deliberately absent here now -- Luck's contribution to rare-loot
   * odds moved to its own function (personalLootBonus below), applied as a
   * separate multiplicative stage rather than summed into this pool. It
   * used to be diluted into the same additive total as the difficulty
   * tier's own flat lootChance and every account-wide bonus combined --
   * two heroes with wildly different Luck investment (27 vs 79, confirmed
   * directly) came out within a rounding error of each other, because a
   * ~4-point gap barely registers inside a 120+ point sum. Equipment,
   * guild, and renown loot bonuses still flow through the normal Modifiers
   * pool same as before; only the Luck *stat's* own contribution moved.
   *
   * speed's curve was also raised (0.5 exponent/0.6 coefficient -> 0.7/1.3)
   * for the same underlying reason -- even a heavily-invested 93 Endurance
   * only saved ~10 minutes off a 3-hour quest under the old curve.
   */
  statMods(stats: Stats): Partial<Modifiers> {
    return {
      success: Math.sqrt(stats.strength) * 1.6 + Math.sqrt(stats.endurance) * 0.8,
      gold: Math.sqrt(stats.luck) * 2.2,
      xp: Math.sqrt(stats.wisdom) * 2.6,
      injuryResist: Math.sqrt(stats.endurance) * 2.0,
      speed: Math.pow(stats.endurance, 0.7) * 1.3,
    };
  },

  /**
   * Luck's own rare-loot contribution, applied as an independent
   * multiplicative stage on top of (difficulty tier + every account-wide
   * loot bonus) rather than summed into the same pool as those -- see the
   * comment on statMods above for why. Curve tuned so a balanced-stat
   * level-55 hero (~40 Luck) lands close to a 10% legendary chance on an
   * Epic-tier quest, while a genuinely Luck-dumped build still comes out
   * meaningfully (~2x) ahead of one that mostly ignored it, and even an
   * extreme min-max build stays well short of the 90% clamp.
   */
  personalLootBonus(stats: Stats): number {
    return Math.pow(stats.luck, 0.9) * 7.2;
  },

  equipmentMods(hero: Hero): Partial<Modifiers> {
    const sources: Partial<Modifiers>[] = [];
    const setCounts: Record<string, number> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      // Crafted items carry their own chosen mods (EquipmentItem.customMods)
      // instead of the def's -- see that field's own comment in types.ts.
      sources.push(scaleMods(item.customMods ?? def.mods, 1 + item.plus * 0.15));
      if (def.setId) setCounts[def.setId] = (setCounts[def.setId] ?? 0) + 1;
    }
    for (const [setId, count] of Object.entries(setCounts)) {
      const set = SET_BY_ID[setId];
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (count >= bonus.count) sources.push(bonus.mods);
      }
    }
    return sumMods(...sources);
  },

  activeSetBonuses(hero: Hero): { setName: string; label: string }[] {
    const setCounts: Record<string, number> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (def?.setId) setCounts[def.setId] = (setCounts[def.setId] ?? 0) + 1;
    }
    const out: { setName: string; label: string }[] = [];
    for (const [setId, count] of Object.entries(setCounts)) {
      const set = SET_BY_ID[setId];
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (count >= bonus.count) out.push({ setName: set.name, label: `${bonus.label} (${bonus.count})` });
      }
    }
    return out;
  },

  injuryMods(hero: Hero, now: number): Partial<Modifiers> {
    return sumMods(...hero.injuries.filter((i) => i.healsAt > now).map((i) => i.mods));
  },

  /**
   * Success points lost to missing Health, folded in the same way
   * injuryMods already is -- a soft penalty, never a hard gate, so a
   * hero at low Health is worse odds but never literally unsendable
   * (that's what avoids the "auto-fail on 0 health" problem this system
   * was designed around). Zero once fully healed.
   */
  healthMods(hero: Hero): Partial<Modifiers> {
    const missing = 100 - HeroManager.healthPercent(hero);
    if (missing <= 0) return {};
    return { success: -missing * Tuning.get('health.successPenaltyPerMissingPercent') };
  },

  /** Everything the hero personally contributes, before guild/upgrade bonuses. */
  heroMods(hero: Hero, now: number): Modifiers {
    const classDef = HERO_CLASSES[hero.heroClass];
    return sumMods(
      classDef.mods,
      HeroManager.statMods(HeroManager.totalStats(hero)),
      HeroManager.equipmentMods(hero),
      HeroManager.injuryMods(hero, now),
      HeroManager.healthMods(hero),
      { success: hero.level * 0.4 },
    );
  },

  rollInjury(rng: Rng, difficulty: Difficulty = 'normal'): Injury {
    const tierIndex = DIFFICULTY_ORDER.indexOf(difficulty);
    const eligible = INJURIES.filter((i) => {
      if (!i.minDifficulty) return true;
      return DIFFICULTY_ORDER.indexOf(i.minDifficulty) <= tierIndex;
    });
    const pool = eligible.length > 0 ? eligible : INJURIES;
    const def = rng.weighted(pool.map((i) => ({ item: i, weight: i.weight })));
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      healsAt: Date.now() + def.durationMs,
      mods: def.mods,
      treatmentCost: def.treatmentCost,
    };
  },

  /** Injuries whose timers have elapsed simply fall off. */
  pruneInjuries(hero: Hero, now: number): void {
    hero.injuries = hero.injuries.filter((i) => i.healsAt > now);
  },
};
