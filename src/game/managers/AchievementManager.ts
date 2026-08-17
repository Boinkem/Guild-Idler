import { ACHIEVEMENTS } from '../data/achievements';
import { HERO_CLASSES, SKINS, UPGRADES, GUILD_FACILITIES } from '../data/progression';
import { QUEST_CHAINS } from '../data/quests';
import { RAIDS } from '../data/raids';
import { PETS } from '../data/pets';
import { HARVEST_TOOLS, WAREHOUSE_UPGRADE } from '../data/harvestUpgrades';
import { GameState } from '../types';

const ASCENSION_FOR_LIVING_LEGEND = 10;
const STREAK_FOR_ON_A_ROLL = 5;
const AGAINST_THE_ODDS_THRESHOLD = 30;
const PRESTIGE_COUNT_FOR_VETERAN_RETIREE = 5;

/**
 * Every check reads only GameState — no event payload required. That's
 * deliberate: it means a save migrated forward from before achievements
 * existed can be checked once at migration time and retroactively credit
 * anything already true (500 quests in, level 40 heroes, etc.) rather than
 * forcing the player to do something they'd already done again to get
 * credit for it. See SaveManager's v8->v9 migration.
 */
type Check = (state: GameState) => boolean;

const allFacilitiesMaxed = (state: GameState): boolean =>
  GUILD_FACILITIES.every((f) => (state.guild[f.id] ?? 0) >= f.maxLevel);

const CHECKS: Record<string, Check> = {
  FIRST_CONTRACT: (state) => state.stats.totalQuests >= 1,

  AGAINST_THE_ODDS: (state) =>
    state.stats.lowestSuccessfulChance !== null && state.stats.lowestSuccessfulChance < AGAINST_THE_ODDS_THRESHOLD,

  FIRST_LEGENDARY: (state) => state.stats.legendaryItemsFound >= 1,

  RETIREMENT_PARTY: (state) => state.stats.prestigeCount >= 1,

  LIVING_LEGEND: (state) => (state.heroes ?? []).some((h) => h.ascension >= ASCENSION_FOR_LIVING_LEGEND),

  CHAIN_BREAKER: (state) => state.stats.chainsCompleted >= 1,

  WORLDS_END: (state) => (state.completedChains ?? []).includes('world_ender'),

  // Same mirrored-treatment as WORLDS_END above, but checking completedRaids
  // rather than completedChains -- the Last God moved from a quest chain to
  // a raid in its own restructure, so this is the correct list to check now.
  LAST_GOD_DEFEATED: (state) => (state.completedRaids ?? []).includes('requiem_last_god'),

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

  RAID_NORMAL_CLEARED: (state) => (state.completedRaidDifficulties ?? []).includes('normal'),

  RAID_HEROIC_CLEARED: (state) => (state.completedRaidDifficulties ?? []).includes('heroic'),

  RAID_LEGENDARY_CLEARED: (state) => (state.completedRaidDifficulties ?? []).includes('legendary'),

  RAID_ALL_DIFFICULTIES: (state) => {
    const cleared = new Set(state.completedRaidDifficulties ?? []);
    return cleared.has('normal') && cleared.has('heroic') && cleared.has('legendary');
  },

  /* ------------------------- vendor / guild completion ------------------------- */
  // All four share the same "every relevant UPGRADES entry at its own
  // maxLevel" shape, just filtered to a different vendor id (or, for
  // COMPLETIONIST, no filter at all). state.upgrades is keyed by
  // UpgradeDef.id -- an entry missing entirely (never bought) reads as
  // level 0 via `?? 0`, same convention every cost-curve lookup in this
  // game already uses.
  BLACKSMITH_MAXED: (state) =>
    UPGRADES.filter((u) => u.vendor === 'blacksmith').every((u) => (state.upgrades[u.id] ?? 0) >= u.maxLevel),

  ALCHEMIST_MAXED: (state) =>
    UPGRADES.filter((u) => u.vendor === 'alchemist').every((u) => (state.upgrades[u.id] ?? 0) >= u.maxLevel),

  ENCHANTER_MAXED: (state) =>
    UPGRADES.filter((u) => u.vendor === 'enchanter').every((u) => (state.upgrades[u.id] ?? 0) >= u.maxLevel),

  GUILD_HALL_MAXED: allFacilitiesMaxed,

  // The grand-finale completionist achievement -- every one of the 24
  // UPGRADES entries (vendor-tagged AND general/Guild-Hall-tagged alike,
  // hence no `.filter()` here) at its own maxLevel, AND all 8 facilities
  // maxed via the same allFacilitiesMaxed helper GUILD_HALL_MAXED uses
  // directly above (not called through CHECKS itself, which isn't fully
  // initialized yet at this point in its own object literal). Matches
  // the ~109-day full-completion timeline already estimated in
  // guild-idler-project-brief.md -- the single rarest, longest-horizon
  // achievement in the game by design.
  COMPLETIONIST: (state) =>
    UPGRADES.every((u) => (state.upgrades[u.id] ?? 0) >= u.maxLevel) && allFacilitiesMaxed(state),

  /* ------------------------------ harvest ------------------------------ */
  WAREHOUSE_MAXED: (state) => state.warehouseLevel >= WAREHOUSE_UPGRADE.maxLevel,

  ALL_TOOLS_MAXED: (state) =>
    HARVEST_TOOLS.every((t) => (state.harvestTools[t.nodeId] ?? 0) >= t.maxLevel),

  /* -------------------------------- pets -------------------------------- */
  FIRST_PET_HATCHED: (state) => (state.pets ?? []).length >= 1,

  // Pets have no release/delete path anywhere in the game today (a hatch
  // is permanent, unlike an egg which can sit unhatched indefinitely) --
  // state.pets is therefore safe to read as "every species ever hatched,"
  // not just "currently owned," with no separate discovered-pets ledger
  // needed the way discoveredItems exists for equipment.
  ALL_PETS_COLLECTED: (state) => {
    const owned = new Set((state.pets ?? []).map((p) => p.defId));
    return PETS.every((p) => owned.has(p.id));
  },

  /* ------------------------------ prestige ------------------------------ */
  // Complements RETIREMENT_PARTY (>=1 retirement, already above) and
  // ON_A_ROLL (a same-window streak of 5, already above) with a third,
  // orthogonal axis: total retirements over the account's whole
  // lifetime, streak or no streak.
  VETERAN_RETIREE: (state) => state.stats.prestigeCount >= PRESTIGE_COUNT_FOR_VETERAN_RETIREE,

  /* --------------------------- Grimsby / peddler --------------------------- */
  PEDDLER_FIRST_FLIP: (state) => (state.stats.peddlerFlips ?? 0) >= 1,

  PEDDLER_JACKPOT: (state) => (state.stats.peddlerJackpots ?? 0) >= 1,

  HIGH_ROLLER_UNLOCKED: (state) => state.grimsbyHighRollerUnlocked === true,

  PEDDLER_HIGH_ROLLER_JACKPOT: (state) => (state.stats.peddlerHighRollerJackpots ?? 0) >= 1,
};

/**
 * Auto-generated, one per quest chain -- id `CHAIN_<UPPER_SNAKE_ID>`,
 * checking straight against completedChains. Deliberately a loop rather
 * than 28 hand-written one-line entries: every one of these is
 * mechanically identical (only the chain id differs), so writing them by
 * hand would just be a 28-line transcription exercise with 28 chances to
 * typo a chain id. `world_ender` is skipped -- it already has its own
 * bespoke achievement (WORLDS_END above), predating this batch; adding a
 * second achievement for the same completion would be a real duplicate,
 * not just redundant naming. A chain added after this ships gets its
 * completion check for free the moment this module loads; the matching
 * achievements.json metadata entry (name/description/hidden) still has
 * to be added by hand, same "data needs a check, a check does nothing
 * without matching data" split this file's own top comment describes.
 */
for (const chain of QUEST_CHAINS) {
  if (chain.id === 'world_ender') continue;
  CHECKS[`CHAIN_${chain.id.toUpperCase()}`] = (state) => (state.completedChains ?? []).includes(chain.id);
}

/**
 * Same auto-generated treatment for raids -- id
 * `RAID_<UPPER_SNAKE_ID>_CLEARED`, checking completedRaids (a full clear
 * at ANY difficulty, same semantics RAID_NORMAL_CLEARED's own comment
 * already establishes). `requiem_last_god` is skipped -- already covered
 * by the pre-existing, hidden LAST_GOD_DEFEATED achievement.
 */
for (const raid of RAIDS) {
  if (raid.id === 'requiem_last_god') continue;
  CHECKS[`RAID_${raid.id.toUpperCase()}_CLEARED`] = (state) => (state.completedRaids ?? []).includes(raid.id);
}

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
