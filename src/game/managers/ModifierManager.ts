import { GUILD_BY_ID, RENOWN_BY_ID, UPGRADE_BY_ID, BASE_GOLD_STORAGE } from '../data/progression';
import { GameState, Modifiers } from '../types';
import { scaleMods, sumMods } from '../util';

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

  hasUnlock(state: GameState, unlock: 'legendaryQuests' | 'chains' | 'blackMarket' | 'raids'): boolean {
    return Object.entries(state.upgrades).some(([id, level]) => {
      const def = UPGRADE_BY_ID[id];
      return !!def && def.unlocks === unlock && level > 0;
    });
  },
};
