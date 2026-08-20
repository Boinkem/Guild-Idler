import {
  GUILD_BY_ID, GUILD_FACILITIES, HERO_CLASSES, RECRUIT_COST, UPGRADE_BY_ID, UPGRADES, VENDORS,
  guildCost, upgradeCost, vendorLevelCost, isVendorUpgradeUnlocked,
} from '../data/progression';
import { RAID_UPGRADES, RAID_UPGRADE_BY_ID, raidUpgradeCost } from '../data/raidUpgrades';
import { GameState, GuildFacility, HeroClass, VendorId } from '../types';
import { Rng } from '../rng';
import { HeroManager } from './HeroManager';
import { ModifierManager } from './ModifierManager';

export const GuildManager = {
  facilityLevel(state: GameState, id: GuildFacility): number {
    return state.guild[id] ?? 0;
  },

  nextCost(state: GameState, id: GuildFacility): number | null {
    const def = GUILD_BY_ID[id];
    const level = GuildManager.facilityLevel(state, id);
    if (!def || level >= def.maxLevel) return null;
    return guildCost(def, level);
  },

  upgradeFacility(state: GameState, id: GuildFacility): string | null {
    const def = GUILD_BY_ID[id];
    if (!def) return 'Unknown facility.';
    const level = GuildManager.facilityLevel(state, id);
    if (level >= def.maxLevel) return `${def.name} is fully built.`;
    const cost = guildCost(def, level);
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.guild[id] = level + 1;
    return null;
  },

  facilities() {
    return GUILD_FACILITIES;
  },

  /* ----------------------------- upgrades ----------------------------- */

  upgradeLevel(state: GameState, id: string): number {
    return state.upgrades[id] ?? 0;
  },

  nextUpgradeCost(state: GameState, id: string): number | null {
    const def = UPGRADE_BY_ID[id];
    const level = GuildManager.upgradeLevel(state, id);
    if (!def || level >= def.maxLevel) return null;
    if (def.vendor && !isVendorUpgradeUnlocked(state.vendorLevels[def.vendor], def.vendor, def.id)) return null;
    return upgradeCost(def, level);
  },

  buyUpgrade(state: GameState, id: string): string | null {
    const def = UPGRADE_BY_ID[id];
    if (!def) return 'Unknown upgrade.';
    if (def.vendor && !isVendorUpgradeUnlocked(state.vendorLevels[def.vendor], def.vendor, def.id)) {
      return 'Not offered yet — level up the vendor first.';
    }
    const level = GuildManager.upgradeLevel(state, id);
    if (level >= def.maxLevel) return 'Already at maximum.';
    const cost = upgradeCost(def, level);
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.upgrades[id] = level + 1;
    return null;
  },

  upgrades() {
    return UPGRADES;
  },

  /* ------------------------------- vendors ------------------------------- */

  vendorLevel(state: GameState, vendorId: VendorId): number {
    return state.vendorLevels[vendorId] ?? 0;
  },

  nextVendorLevelCost(state: GameState, vendorId: VendorId): number | null {
    return vendorLevelCost(vendorId, GuildManager.vendorLevel(state, vendorId));
  },

  levelUpVendor(state: GameState, vendorId: VendorId): string | null {
    const level = GuildManager.vendorLevel(state, vendorId);
    const cost = vendorLevelCost(vendorId, level);
    if (cost === null) return 'This vendor has nothing further to teach right now.';
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.vendorLevels[vendorId] = level + 1;
    return null;
  },

  vendors() {
    return VENDORS;
  },

  /* ------------------------------ heroes ------------------------------ */

  recruitableClasses(state: GameState): HeroClass[] {
    const tavern = GuildManager.facilityLevel(state, 'tavern');
    return (Object.keys(HERO_CLASSES) as HeroClass[]).filter(
      (id) => HERO_CLASSES[id].unlockTavernLevel <= tavern,
    );
  },

  /**
   * True if the guild already has a living hero of this class (patch
   * 0219 -- "one of every hero" cap, direct request, replacing unlimited
   * same-class recruiting). Checked against the live `state.heroes`
   * roster, not `state.roster` (a separate, lifetime "which classes has
   * this guild ever recruited" tracker used only by AchievementManager --
   * unrelated to this check and deliberately left untouched). There is
   * currently no way for a hero to ever leave `state.heroes` once
   * recruited -- retirement (PrestigeManager.retire) replaces a hero
   * in-place with a fresh ascended hero of the SAME class rather than
   * removing them, and no dismiss/release action exists anywhere in the
   * codebase -- so this check never needs to account for a class
   * becoming available again later; once recruited, always occupied.
   */
  classAlreadyRecruited(state: GameState, heroClass: HeroClass): boolean {
    return state.heroes.some((h) => h.heroClass === heroClass);
  },

  recruit(state: GameState, heroClass: HeroClass, rng: Rng): string | null {
    if (state.heroes.length >= ModifierManager.heroSlots(state)) {
      return 'No free hero slots. Upgrade the Tavern or buy an Extra Banner.';
    }
    if (!GuildManager.recruitableClasses(state).includes(heroClass)) {
      return `The Tavern is not large enough to attract a ${HERO_CLASSES[heroClass].name}.`;
    }
    if (GuildManager.classAlreadyRecruited(state, heroClass)) {
      return `The guild already has a ${HERO_CLASSES[heroClass].name} -- one of each class only.`;
    }
    const cost = RECRUIT_COST[heroClass];
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.heroes.push(HeroManager.create(heroClass, rng));
    if (!state.roster.includes(heroClass)) state.roster.push(heroClass);
    return null;
  },

  /* --------------------------- raid upgrades --------------------------- */
  // Fully separate tree from the general upgrades above -- see
  // RaidUpgradeDef and ModifierManager.raidMods. Same buy/cost shape as
  // upgradeLevel/nextUpgradeCost/buyUpgrade, but reading state.raidUpgrades
  // instead of state.upgrades, and the cost can be gold or Renown depending
  // on which tier the next level falls in.

  raidUpgradeLevel(state: GameState, id: string): number {
    return state.raidUpgrades[id] ?? 0;
  },

  nextRaidUpgradeCost(state: GameState, id: string): { cost: number; currency: 'gold' | 'renown' } | null {
    const def = RAID_UPGRADE_BY_ID[id];
    if (!def) return null;
    return raidUpgradeCost(def, GuildManager.raidUpgradeLevel(state, id));
  },

  buyRaidUpgrade(state: GameState, id: string): string | null {
    const def = RAID_UPGRADE_BY_ID[id];
    if (!def) return 'Unknown raid upgrade.';
    const level = GuildManager.raidUpgradeLevel(state, id);
    const next = raidUpgradeCost(def, level);
    if (!next) return 'Already at maximum.';
    if (next.currency === 'gold') {
      if (state.gold < next.cost) return 'Not enough gold.';
      state.gold -= next.cost;
      state.stats.goldSpent += next.cost;
    } else {
      if (state.renown < next.cost) return 'Not enough renown.';
      state.renown -= next.cost;
    }
    state.raidUpgrades[id] = level + 1;
    return null;
  },

  raidUpgrades() {
    return RAID_UPGRADES;
  },
};
