import {
  GUILD_BY_ID, GUILD_FACILITIES, HERO_CLASSES, RECRUIT_COST, UPGRADE_BY_ID, UPGRADES, VENDORS,
  guildCost, upgradeCost, vendorLevelCost, isVendorUpgradeUnlocked,
} from '../data/progression';
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

  recruit(state: GameState, heroClass: HeroClass, rng: Rng): string | null {
    if (state.heroes.length >= ModifierManager.heroSlots(state)) {
      return 'No free hero slots. Upgrade the Tavern or buy an Extra Banner.';
    }
    if (!GuildManager.recruitableClasses(state).includes(heroClass)) {
      return `The Tavern is not large enough to attract a ${HERO_CLASSES[heroClass].name}.`;
    }
    const cost = RECRUIT_COST[heroClass];
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.heroes.push(HeroManager.create(heroClass, rng));
    if (!state.roster.includes(heroClass)) state.roster.push(heroClass);
    return null;
  },
};
