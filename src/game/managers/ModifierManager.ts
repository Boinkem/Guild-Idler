import { GUILD_BY_ID, RENOWN_BY_ID, UPGRADE_BY_ID, BASE_GOLD_STORAGE } from '../data/progression';
import { RAID_UPGRADE_BY_ID } from '../data/raidUpgrades';
import { BASE_INCUBATION_SLOTS } from '../data/pets';
import { GameState, Modifiers, PetBonusType } from '../types';
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
        return def ? scaleMods(def.modsPerLevel, level) : {};
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
   */
  petMods(state: GameState, now = Date.now()): Partial<Modifiers> {
    const result: Partial<Record<PetBonusType, number>> = {};
    for (const petId of state.equippedPetIds) {
      const pet = state.pets.find((p) => p.uid === petId);
      if (!pet) continue;
      const value = PetManager.effectiveBonus(pet, now);
      result[pet.bonusType] = (result[pet.bonusType] ?? 0) + value;
    }
    return result;
  },

  global(state: GameState): Modifiers {
    return sumMods(
      ModifierManager.upgradeMods(state),
      ModifierManager.guildMods(state),
      ModifierManager.renownMods(state),
      ModifierManager.petMods(state),
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

  /** Same shape again, for the Vendors shop restock reroll, via Trade Favor. */
  vendorFreeRerolls(state: GameState): number {
    const bonus = Object.entries(state.upgrades).reduce((sum, [id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return sum + (def?.vendorFreeRerollsPerLevel ?? 0) * level;
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

  hasUnlock(state: GameState, unlock: 'legendaryQuests' | 'chains' | 'blackMarket' | 'raids' | 'raidsHeroic' | 'raidsMythic'): boolean {
    return Object.entries(state.upgrades).some(([id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return !!def && def.unlocks === unlock && level > 0;
    });
  },
};
