import { ACHIEVEMENTS } from '../data/achievements';
import { HERO_CLASSES, SKINS } from '../data/progression';
import { GameState } from '../types';

const ASCENSION_FOR_LIVING_LEGEND = 10;
const STREAK_FOR_ON_A_ROLL = 5;
const AGAINST_THE_ODDS_THRESHOLD = 30;

/**
 * Every check reads only GameState — no event payload required. That's
 * deliberate: it means a save migrated forward from before achievements
 * existed can be checked once at migration time and retroactively credit
 * anything already true (500 quests in, level 40 heroes, etc.) rather than
 * forcing the player to do something they'd already done again to get
 * credit for it. See SaveManager's v8->v9 migration.
 */
type Check = (state: GameState) => boolean;

const CHECKS: Record<string, Check> = {
  FIRST_CONTRACT: (state) => state.stats.totalQuests >= 1,

  AGAINST_THE_ODDS: (state) =>
    state.stats.lowestSuccessfulChance !== null && state.stats.lowestSuccessfulChance < AGAINST_THE_ODDS_THRESHOLD,

  FIRST_LEGENDARY: (state) => state.stats.legendaryItemsFound >= 1,

  RETIREMENT_PARTY: (state) => state.stats.prestigeCount >= 1,

  LIVING_LEGEND: (state) => (state.heroes ?? []).some((h) => h.ascension >= ASCENSION_FOR_LIVING_LEGEND),

  CHAIN_BREAKER: (state) => state.stats.chainsCompleted >= 1,

  WORLDS_END: (state) => (state.completedChains ?? []).includes('world_ender'),

  ON_A_ROLL: (state) => state.stats.bestPrestigeStreak >= STREAK_FOR_ON_A_ROLL,

  FULL_ROSTER: (state) => {
    const owned = new Set(state.roster ?? []);
    return (Object.keys(HERO_CLASSES) as (keyof typeof HERO_CLASSES)[]).every((cls) => owned.has(cls));
  },

  BLACK_MARKET_REGULAR: (state) => state.stats.blackMarketPurchases >= 1,

  COMPLETE_WARDROBE: (state) => {
    const purchasable = SKINS.filter((s) => s.cost > 0).map((s) => s.id);
    return purchasable.every((id) => (state.unlockedSkins ?? []).includes(id));
  },
};

export const AchievementManager = {
  isUnlocked(state: GameState, id: string): boolean {
    return id in state.unlockedAchievements;
  },

  /**
   * Runs every not-yet-unlocked achievement's check. Cheap enough (plain
   * state reads) to call after any action that could plausibly satisfy one,
   * rather than needing to know which specific achievement an action maps
   * to. Returns the ids that newly unlocked, in definition order.
   */
  checkAll(state: GameState, now = Date.now()): string[] {
    const newlyUnlocked: string[] = [];
    for (const def of ACHIEVEMENTS) {
      if (AchievementManager.isUnlocked(state, def.id)) continue;
      const check = CHECKS[def.id];
      if (!check) continue; // metadata exists but no trigger wired yet — safe no-op
      if (check(state)) {
        state.unlockedAchievements[def.id] = now;
        newlyUnlocked.push(def.id);
      }
    }
    return newlyUnlocked;
  },

  progress(state: GameState): { unlocked: number; total: number } {
    return { unlocked: Object.keys(state.unlockedAchievements).length, total: ACHIEVEMENTS.length };
  },

  list() {
    return ACHIEVEMENTS;
  },
};
