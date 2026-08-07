import {
  PRESTIGE_MIN_LEVEL, PRESTIGE_STREAK_WINDOW_MS, RENOWN_BY_ID, RENOWN_PERKS,
  ASCENSION_STAT_BONUS, ascensionRank, prestigeStreakBonusPct, renownCost,
  renownEffectiveMaxLevel, renownForRetirement,
} from '../data/progression';
import { GameState, Hero } from '../types';
import { Rng } from '../rng';
import { HeroManager } from './HeroManager';

export const PrestigeManager = {
  canRetire(hero: Hero): boolean {
    return hero.level >= PRESTIGE_MIN_LEVEL && hero.status !== 'questing';
  },

  canEarlyRetire(hero: Hero): boolean {
    return hero.status !== 'questing';
  },

  /**
   * Frees up a hero slot immediately, at any level, with no reward at all
   * -- no renown, no ascension, no prestige streak credit. A normal Retire
   * (below) requires level 30, which is the right gate for the *reward*
   * (renown scales off level and quest count, so an under-levelled retire
   * genuinely isn't worth much yet) but was also, incidentally, the only
   * way to ever get a hero slot back at all. That's a real trap: recruit
   * the wrong class, or just decide you don't want that slot filled right
   * now, and there was no way out of it short of levelling that specific
   * hero all the way to 30 first. Early Retirement exists purely to
   * un-stick that -- deliberately worse than waiting for a real Retire
   * (nothing gained), but always available. Unlike Retire, which replaces
   * the hero in place (same slot, same id, reset to level 1), this
   * removes them from the roster outright, actually shrinking
   * `state.heroes` so the freed slot can be spent on a different recruit.
   */
  earlyRetire(state: GameState, hero: Hero): { error: string } | null {
    if (hero.status === 'questing') return { error: `${hero.name} is out on a quest.` };
    for (const item of Object.values(hero.equipment)) {
      if (item) state.stash.push(item);
    }
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    return null;
  },

  /** Base renown, before any streak bonus. Shown as the "guaranteed" part of the preview. */
  renownPreview(hero: Hero): number {
    return renownForRetirement(hero.level, hero.questsCompleted);
  },

  /** What the streak bonus would add right now if this hero retired this instant. */
  streakPreview(state: GameState, hero: Hero, now: number): { streak: number; bonusPct: number; total: number } {
    const streak = PrestigeManager.projectedStreak(state, now);
    const bonusPct = prestigeStreakBonusPct(streak);
    const base = PrestigeManager.renownPreview(hero);
    return { streak, bonusPct, total: Math.floor(base * (1 + bonusPct / 100)) };
  },

  /** What the streak WOULD become if a retirement happened right now. */
  projectedStreak(state: GameState, now: number): number {
    if (state.lastPrestigeAt === null) return 1;
    return now - state.lastPrestigeAt <= PRESTIGE_STREAK_WINDOW_MS ? state.prestigeStreak + 1 : 1;
  },

  /**
   * Retiring wipes the hero's level, xp, equipped gear, and title, but keeps
   * everything the guild owns: upgrades, facilities, discovered items, and
   * renown perks. Two things persist for this specific hero identity across
   * the reset: ascension count (and the small permanent stat bonus it
   * grants), and — guild-wide — the prestige streak, which rewards retiring
   * again soon rather than letting months pass between retirements.
   */
  retire(state: GameState, hero: Hero, rng: Rng, now: number): { renownGained: number; streak: number; ascension: number } | { error: string } {
    if (hero.status === 'questing') return { error: `${hero.name} is out on a quest.` };
    if (hero.level < PRESTIGE_MIN_LEVEL) {
      return { error: `Heroes retire at level ${PRESTIGE_MIN_LEVEL}. ${hero.name} is level ${hero.level}.` };
    }

    const streak = PrestigeManager.projectedStreak(state, now);
    const bonusPct = prestigeStreakBonusPct(streak);
    const baseRenown = PrestigeManager.renownPreview(hero);
    const renownGained = Math.floor(baseRenown * (1 + bonusPct / 100));

    // Their gear goes back to the guild stash rather than vanishing.
    for (const item of Object.values(hero.equipment)) {
      if (item) state.stash.push(item);
    }

    const ascension = hero.ascension + 1;
    const replacement = HeroManager.create(hero.heroClass, rng);
    replacement.id = hero.id;
    replacement.name = hero.name;
    replacement.ascension = ascension;
    replacement.bonusStats = {
      strength: ascension * ASCENSION_STAT_BONUS,
      endurance: ascension * ASCENSION_STAT_BONUS,
      luck: ascension * ASCENSION_STAT_BONUS,
      wisdom: ascension * ASCENSION_STAT_BONUS,
    };
    const index = state.heroes.findIndex((h) => h.id === hero.id);
    state.heroes[index] = replacement;

    state.renown += renownGained;
    state.stats.prestigeCount += 1;
    state.prestigeStreak = streak;
    state.lastPrestigeAt = now;
    state.stats.bestPrestigeStreak = Math.max(state.stats.bestPrestigeStreak, streak);

    return { renownGained, streak, ascension };
  },

  /** Display label for a hero's ascension rank, or null if not yet ranked. */
  rankFor(hero: Hero): string | null {
    return ascensionRank(hero.ascension);
  },

  perkLevel(state: GameState, id: string): number {
    return state.renownPerks[id] ?? 0;
  },

  nextPerkCost(state: GameState, id: string): number | null {
    const def = RENOWN_BY_ID[id];
    const level = PrestigeManager.perkLevel(state, id);
    if (!def || level >= renownEffectiveMaxLevel(def)) return null;
    return renownCost(def, level);
  },

  /** True once the base tier is maxed but a tier2 extension exists and isn't maxed yet. */
  perkInTier2(state: GameState, id: string): boolean {
    const def = RENOWN_BY_ID[id];
    if (!def?.tier2) return false;
    const level = PrestigeManager.perkLevel(state, id);
    return level >= def.maxLevel && level < def.tier2.maxLevel;
  },

  /** True once the base tier is maxed and tier2 exists but hasn't been touched yet — used to surface the unlock flavour once. */
  perkTier2JustUnlocked(state: GameState, id: string): boolean {
    const def = RENOWN_BY_ID[id];
    if (!def?.tier2) return false;
    return PrestigeManager.perkLevel(state, id) === def.maxLevel;
  },

  buyPerk(state: GameState, id: string): string | null {
    const def = RENOWN_BY_ID[id];
    if (!def) return 'Unknown perk.';
    const level = PrestigeManager.perkLevel(state, id);
    const cap = renownEffectiveMaxLevel(def);
    if (level >= cap) return 'Already at maximum.';
    const cost = renownCost(def, level);
    if (state.renown < cost) return 'Not enough Heroic Renown.';
    state.renown -= cost;
    state.renownPerks[id] = level + 1;
    return null;
  },

  perks() {
    return RENOWN_PERKS;
  },
};
