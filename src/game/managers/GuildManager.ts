import {
  GUILD_BY_ID, GUILD_FACILITIES, HERO_CLASSES, RECRUIT_COST, UPGRADE_BY_ID, UPGRADES, VENDORS,
  guildCost, upgradeCost, vendorLevelCost, isVendorUpgradeUnlocked,
} from '../data/progression';
import { RAID_UPGRADES, RAID_UPGRADE_BY_ID, raidUpgradeCost } from '../data/raidUpgrades';
import { chainReplayTierForChain } from '../data/chainReplay';
import { GameState, GuildFacility, HeroClass, VendorId } from '../types';
import { Rng } from '../rng';
import { HeroManager } from './HeroManager';
import { ModifierManager } from './ModifierManager';
import { Tuning } from '../data/tuning';

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

  /* ------------------------- chain replay tiers ------------------------- */
  // Deliberately just the read side here (patch 0224, data-model step of
  // Replayable Quest Chains -- see guild-idler-status.md's Backlog entry).
  // Purchasing and difficulty/resolution logic land in later patches, per
  // that entry's own sequencing plan; these two exist now because
  // eligibility is fundamentally a data query, not a mutation, and every
  // later step needs a single correct place to ask it from.

  hasChainReplayTier(state: GameState, tierId: string): boolean {
    return state.chainReplayTiersOwned.includes(tierId);
  },

  /**
   * A chain is replayable once its own saga band is owned AND the chain
   * is already in completedChains -- both required, neither alone
   * sufficient (confirmed design: owning a band never bypasses a
   * chain's first clear). Also requires the 'master' unlock, same as
   * every band -- a band's own purchase doesn't imply master is owned
   * too, they're independent per CHAIN_REPLAY_TIERS' own "no forced
   * ordering" design.
   */
  isChainReplayEligible(state: GameState, chainId: string): boolean {
    if (!GuildManager.hasChainReplayTier(state, 'master')) return false;
    if (!state.completedChains.includes(chainId)) return false;
    const tier = chainReplayTierForChain(chainId);
    return !!tier && GuildManager.hasChainReplayTier(state, tier.id);
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

  /* ------------------------------ treasury ------------------------------ */
  // Two standalone gold sinks added in patch 0220, neither routed through
  // the general UPGRADES list above -- same reasoning grimsbyHighRollerUnlocked
  // already established for Grimsby: these aren't stat bonuses with a
  // modsPerLevel curve, they gate/perform a standalone action instead.

  /** One-time gold cost to unlock the Gold-for-Renown exchange. */
  renownExchangeUnlockCost(): number {
    return Tuning.get('treasury.renownExchangeUnlockCost');
  },

  canUnlockRenownExchange(state: GameState): boolean {
    return !state.goldRenownExchangeUnlocked && state.gold >= GuildManager.renownExchangeUnlockCost();
  },

  /** Buys the exchange outright -- same defensive-guard shape
   *  PeddlerManager.unlockHighRoller already uses. */
  unlockRenownExchange(state: GameState): boolean {
    if (state.goldRenownExchangeUnlocked) return false;
    const cost = GuildManager.renownExchangeUnlockCost();
    if (state.gold < cost) return false;
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.goldRenownExchangeUnlocked = true;
    return true;
  },

  /** Flat gold cost per 1 Renown, once the exchange is unlocked --
   *  deliberately harsh (50,000g default), see the tuning entry's own
   *  comment for why: real Renown from retiring a hero is typically
   *  single-to-low-double digits, so this can never come close to
   *  competing with the retirement loop, only give genuinely excess
   *  gold somewhere to go. */
  goldPerRenown(): number {
    return Tuning.get('treasury.goldPerRenown');
  },

  /**
   * Converts `goldOffered` into as many whole Renown as it actually
   * buys at goldPerRenown's rate, charging only for what's actually
   * converted (floored) rather than the full amount entered -- so
   * entering an amount that isn't an exact multiple of the rate never
   * silently burns the remainder. Returns null (nothing charged) if the
   * exchange isn't unlocked, the offer is invalid, or it doesn't even
   * cover 1 Renown at the current rate.
   */
  exchangeGoldForRenown(state: GameState, goldOffered: number): { renownGained: number; goldSpent: number } | null {
    if (!state.goldRenownExchangeUnlocked) return null;
    const offered = Math.floor(goldOffered);
    if (!Number.isFinite(offered) || offered <= 0) return null;
    const rate = GuildManager.goldPerRenown();
    const renownGained = Math.floor(offered / rate);
    if (renownGained < 1) return null;
    const goldSpent = renownGained * rate;
    if (state.gold < goldSpent) return null;
    state.gold -= goldSpent;
    state.stats.goldSpent += goldSpent;
    state.renown += renownGained;
    return { renownGained, goldSpent };
  },

  /**
   * "Fund the Guild" -- an open-ended, uncapped gold sink with no
   * catalog and no max level: any amount donated adds straight to the
   * lifetime `guildDonationsTotal` counter, which in turn feeds a small,
   * deliberately diminishing-returns component of Guild Power (see
   * power.ts guildPowerBreakdown -- sqrt of this total, not linear).
   * Returns null (nothing charged) for an invalid/unaffordable amount.
   */
  donateToGuild(state: GameState, amount: number): number | null {
    const donated = Math.floor(amount);
    if (!Number.isFinite(donated) || donated <= 0) return null;
    if (state.gold < donated) return null;
    state.gold -= donated;
    state.stats.goldSpent += donated;
    state.guildDonationsTotal += donated;
    return donated;
  },
};
