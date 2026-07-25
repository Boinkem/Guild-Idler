import { PRESTIGE_MIN_LEVEL, RENOWN_BY_ID, RENOWN_PERKS, renownCost, renownEffectiveMaxLevel, renownForRetirement } from '../data/progression';
import { GameState, Hero } from '../types';
import { Rng } from '../rng';
import { HeroManager } from './HeroManager';

export const PrestigeManager = {
  canRetire(hero: Hero): boolean {
    return hero.level >= PRESTIGE_MIN_LEVEL && hero.status !== 'questing';
  },

  renownPreview(hero: Hero): number {
    return renownForRetirement(hero.level, hero.questsCompleted);
  },

  /**
   * Retiring wipes the hero's level, stats, and gear but keeps everything the
   * guild owns: upgrades, facilities, discovered items, and renown perks.
   */
  retire(state: GameState, hero: Hero, rng: Rng): { renownGained: number } | { error: string } {
    if (hero.status === 'questing') return { error: `${hero.name} is out on a quest.` };
    if (hero.level < PRESTIGE_MIN_LEVEL) {
      return { error: `Heroes retire at level ${PRESTIGE_MIN_LEVEL}. ${hero.name} is level ${hero.level}.` };
    }
    const renownGained = PrestigeManager.renownPreview(hero);

    // Their gear goes back to the guild stash rather than vanishing.
    for (const item of Object.values(hero.equipment)) {
      if (item) state.stash.push(item);
    }

    const replacement = HeroManager.create(hero.heroClass, rng);
    replacement.id = hero.id;
    replacement.name = hero.name;
    const index = state.heroes.findIndex((h) => h.id === hero.id);
    state.heroes[index] = replacement;

    state.renown += renownGained;
    state.stats.prestigeCount += 1;
    return { renownGained };
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
