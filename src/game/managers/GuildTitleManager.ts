import { GameState } from '../types';

/**
 * Guild-wide titles (patch 0371) -- "how the world sees this guild,"
 * granted for guild-scale accomplishments (defeating a world-ending
 * threat, clearing a major raid chain) rather than anything one hero did
 * alone. Deliberately the exact shape HeroManager's own
 * grantTitle/displayTitle already use for per-hero titles, one level up:
 * append-only earned list, one currently-displayed entry, player free to
 * switch among earned titles (or None) afterward. See
 * AchievementDef.grantsGuildTitle for how a title actually gets earned --
 * this module only owns the grant/display mechanics, not the trigger.
 */
export const GuildTitleManager = {
  /**
   * Adds a newly-earned title to the guild's collection and switches the
   * displayed one to it, unless the guild already holds it. Returns true
   * if the title was actually new, mirroring HeroManager.grantTitle's own
   * return contract, for the same reason: a caller (engine.ts's
   * reportAchievements) can decide whether a celebration should mention
   * it.
   */
  grant(state: GameState, title: string): boolean {
    if (state.guildTitles.includes(title)) return false;
    state.guildTitles.push(title);
    state.activeGuildTitle = title;
    return true;
  },

  /** The title actually shown under the guild's name -- just
   *  activeGuildTitle, directly. No fallback-to-most-recent logic here on
   *  purpose (see HeroManager.displayTitle's own comment on why that
   *  fallback was actually a bug for the per-hero version) -- null always
   *  means null, whether that's "nothing earned yet" or "player
   *  deliberately picked None." */
  display(state: GameState): string | null {
    return state.activeGuildTitle;
  },

  /** Player-driven picker action (Dashboard's guild-name card) -- setting
   *  to any title not actually in guildTitles is a silent no-op rather
   *  than an error, same defensive shape a stale/tampered dropdown value
   *  elsewhere in this game would get. `null` (None) is always valid. */
  setActive(state: GameState, title: string | null): void {
    if (title !== null && !state.guildTitles.includes(title)) return;
    state.activeGuildTitle = title;
  },
};
