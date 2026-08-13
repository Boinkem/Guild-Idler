import { GUILD_BY_ID, RENOWN_BY_ID, UPGRADE_BY_ID, BASE_GOLD_STORAGE } from '../data/progression';
import { RAID_UPGRADE_BY_ID } from '../data/raidUpgrades';
import { BASE_INCUBATION_SLOTS } from '../data/pets';
import { GameState, Hero, Modifiers, VendorId } from '../types';
import { scaleMods, sumMods } from '../util';
import { PetManager } from './PetManager';

/**
 * Account-wide bonuses. These apply to every hero and are recomputed on demand
 * rather than cached, because they change rarely and the maths is trivial.
 */
export const ModifierManager = {
  upgradeMods(state: GameState): Partial<Modifiers> {
    return sumMods(
      ...Object.entries(state.upgrades).map(([id, level]) => {
        const def = UPGRADE_BY_ID[id];
        return def ? scaleMods(def.modsPerLevel, level) : {};
      }),
    );
  },

  guildMods(state: GameState): Partial<Modifiers> {
    return sumMods(
      ...Object.entries(state.guild).map(([id, level]) => {
        const def = GUILD_BY_ID[id];
        if (!def) return {};
        // modsMaxLevel (Treasury only, currently) clamps how many levels'
        // worth of the flat Modifiers bonus count, independent of the
        // facility's real level -- lets a facility keep selling levels
        // past that point for a purely structural effect (Treasury's own
        // storagePerLevel, read straight off state.guild.treasury with no
        // clamp in ModifierManager.goldStorage) without the % bonus
        // growing forever alongside it. See GuildDef.modsMaxLevel.
        const modLevel = def.modsMaxLevel !== undefined ? Math.min(level, def.modsMaxLevel) : level;
        return scaleMods(def.modsPerLevel, modLevel);
      }),
    );
  },

  renownMods(state: GameState): Partial<Modifiers> {
    return sumMods(
      ...Object.entries(state.renownPerks).map(([id, level]) => {
        const def = RENOWN_BY_ID[id];
        return def ? scaleMods(def.modsPerLevel, level) : {};
      }),
    );
  },

  /**
   * Raid-only bonuses -- deliberately NOT folded into global(). This is
   * the dedicated channel RAID_UPGRADES writes into; RaidManager reads
   * this separately (see partyEconomyMods), so raid progression never
   * silently inherits quest-side upgrades (Mounted Travel etc.) the way it
   * did before 0061, and quest progression never inherits raid ones either.
   */
  raidMods(state: GameState): Partial<Modifiers> {
    return sumMods(
      ...Object.entries(state.raidUpgrades).map(([id, level]) => {
        const def = RAID_UPGRADE_BY_ID[id];
        return def ? scaleMods(def.modsPerLevel, level) : {};
      }),
    );
  },

  /**
   * Sum of every currently-equipped pet's effective bonus, each folded
   * into its own PetBonusType key -- unlike upgrade/guild/renown mods,
   * this isn't a flat modsPerLevel table (each pet rolled its own type and
   * magnitude at hatch), so it's built directly here rather than through
   * scaleMods.
   *
   * Per-hero now, not guild-wide -- reads hero.equippedPetId instead of
   * the old state.equippedPetIds list, so only the ONE pet paired with
   * THIS hero contributes, and only when this specific hero's mods are
   * being computed (see HeroManager.heroMods). A Fallen pet contributes
   * nothing at all -- no soft penalty the way a hero's own Health does,
   * since a downed pet doesn't block its hero from questing. See
   * guild-idler-status.md's Pet Health/Fallen entry.
   */
  petModsForHero(state: GameState, hero: Hero, now = Date.now()): Partial<Modifiers> {
    if (!hero.equippedPetId) return {};
    const pet = state.pets.find((p) => p.uid === hero.equippedPetId);
    if (!pet || PetManager.isFallen(pet)) return {};
    const value = PetManager.effectiveBonus(pet, now);
    return { [pet.bonusType]: value };
  },

  /**
   * Guild-wide mods only -- NOT including pets anymore (see
   * petModsForHero above). Every call site that used to rely on
   * `global()` alone picking up pet bonuses now needs
   * HeroManager.heroMods (which folds petModsForHero in per-hero)
   * summed alongside it, same as it already sums equipment/injury/etc.
   */
  global(state: GameState): Modifiers {
    return sumMods(
      ModifierManager.upgradeMods(state),
      ModifierManager.guildMods(state),
      ModifierManager.renownMods(state),
    );
  },

  goldStorage(state: GameState): number {
    const treasury = state.guild.treasury ?? 0;
    const perLevel = GUILD_BY_ID.treasury?.storagePerLevel ?? 0;
    return BASE_GOLD_STORAGE + treasury * perLevel;
  },

  heroSlots(state: GameState): number {
    const tavern = (state.guild.tavern ?? 0) * (GUILD_BY_ID.tavern?.heroSlotsPerLevel ?? 0);
    const perks = Object.entries(state.renownPerks).reduce((sum, [id, level]) => {
      const def = RENOWN_BY_ID[id];
      return sum + (def?.heroSlotsPerLevel ?? 0) * level;
    }, 0);
    return 1 + tavern + perks;
  },

  /** 1 base, +1 per Potion Belt level (max 2 levels -> 3 total). Same
   *  "special-purpose field, not a generic mod" shape as heroSlots above. */
  consumableSlots(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.consumableSlotsPerLevel ?? 0) * level;
    }, 0);
    return 1 + bonus;
  },

  /** Same shape as consumableSlots, for how many eggs can incubate at once. */
  incubationSlots(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.incubationSlotsPerLevel ?? 0) * level;
    }, 0);
    return BASE_INCUBATION_SLOTS + bonus;
  },

  /** Same shape again, for how many pets can be equipped at once. */
  petSlots(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.petSlotsPerLevel ?? 0) * level;
    }, 0);
    return 1 + bonus;
  },

  /** 1 free quest-board reroll per day base, +1 per Board Runner level
   *  (max 3 levels -> 4 total, matching the backlog's "up to 4" spec). */
  questFreeRerolls(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.questFreeRerollsPerLevel ?? 0) * level;
    }, 0);
    return 1 + bonus;
  },

  /**
   * Same shape again, for a single vendor stall's own restock reroll --
   * now split per vendor (Trade Favor: Blacksmith/Alchemist/Enchanter),
   * since each stall reroll is its own independent action with its own
   * cost/counter as of the Vendor Upgrades Consolidation. Filters
   * vendorFreeRerollsPerLevel-bearing upgrades down to the ones actually
   * tagged for this vendor, so leveling Blacksmith's Trade Favor doesn't
   * also grant free Alchemist rerolls.
   */
  vendorFreeRerolls(state: GameState, vendorId: VendorId): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      if (!def || def.vendor !== vendorId) return sum;
      return sum + (def.vendorFreeRerollsPerLevel ?? 0) * level;
    }, 0);
    return 1 + bonus;
  },

  /** 1 free freeze change per day base, +1 per Board Warden level (max 2
   *  levels -> 3 total, matching the backlog's "up to 3 times" spec). Only
   *  gates freezing a new contract -- unfreezing never spends from this,
   *  see QuestManager.unfreezeOffer. */
  freezeChangesPerDay(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.freezeChangesPerLevel ?? 0) * level;
    }, 0);
    return 1 + bonus;
  },

  /** Physician's Charity's daily free-Treat allowance -- 0 until at
   *  least level 1 is bought (unlike freezeChangesPerDay's base-1
   *  floor above, there's no free-by-default allowance here; a hero's
   *  own one-time usedFreeTreat is the always-available safety net
   *  instead). See GameEngine.consumeFreeHeal for how this actually
   *  gets spent against GameState.freeHealDay/freeHealsUsedToday. */
  freeHealsPerDay(state: GameState): number {
    const def = GUILD_BY_ID.physicians_charity;
    const level = state.guild.physicians_charity ?? 0;
    return (def?.freeHealsPerLevel ?? 0) * level;
  },

  /** Smith's Charity's twin of freeHealsPerDay above, for Repair. */
  freeRepairsPerDay(state: GameState): number {
    const def = GUILD_BY_ID.smiths_charity;
    const level = state.guild.smiths_charity ?? 0;
    return (def?.freeRepairsPerLevel ?? 0) * level;
  },

  hasUnlock(state: GameState, unlock: 'legendaryQuests' | 'chains' | 'blackMarket' | 'raids' | 'raidsHeroic' | 'raidsMythic'): boolean {
    return Object.entries(state.upgrades).some(([id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return !!def && def.unlocks === unlock && level > 0;
    });
  },
};
