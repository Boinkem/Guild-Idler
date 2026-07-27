import { EQUIPMENT_BY_ID, SET_BY_ID } from '../data/equipment';
import { INJURIES } from '../data/items';
import { HERO_CLASSES, RECRUIT_START_LEVEL, xpForLevel } from '../data/progression';
import { DIFFICULTY_ORDER } from '../data/quests';
import { Difficulty, Hero, HeroClass, Injury, Modifiers, Stats } from '../types';
import { Rng, uid } from '../rng';
import { scaleMods, sumMods } from '../util';

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

  /** Stats coming from equipped, unbroken gear. */
  equipmentStats(hero: Hero): Stats {
    const total: Stats = { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def?.stats) continue;
      const scale = 1 + item.plus * 0.15;
      total.strength += (def.stats.strength ?? 0) * scale;
      total.endurance += (def.stats.endurance ?? 0) * scale;
      total.luck += (def.stats.luck ?? 0) * scale;
      total.wisdom += (def.stats.wisdom ?? 0) * scale;
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

  /**
   * Stats convert to modifiers on a deliberately gentle curve so that gear and
   * upgrades stay relevant deep into the game.
   */
  statMods(stats: Stats): Partial<Modifiers> {
    return {
      success: Math.sqrt(stats.strength) * 1.6 + Math.sqrt(stats.endurance) * 0.8,
      gold: Math.sqrt(stats.luck) * 2.2,
      loot: Math.sqrt(stats.luck) * 1.1,
      xp: Math.sqrt(stats.wisdom) * 2.6,
      injuryResist: Math.sqrt(stats.endurance) * 2.0,
      speed: Math.sqrt(stats.endurance) * 0.6,
    };
  },

  equipmentMods(hero: Hero): Partial<Modifiers> {
    const sources: Partial<Modifiers>[] = [];
    const setCounts: Record<string, number> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item || item.durability <= 0) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (!def) continue;
      sources.push(scaleMods(def.mods, 1 + item.plus * 0.15));
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

  /** Everything the hero personally contributes, before guild/upgrade bonuses. */
  heroMods(hero: Hero, now: number): Modifiers {
    const classDef = HERO_CLASSES[hero.heroClass];
    return sumMods(
      classDef.mods,
      HeroManager.statMods(HeroManager.totalStats(hero)),
      HeroManager.equipmentMods(hero),
      HeroManager.injuryMods(hero, now),
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
