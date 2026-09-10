import { GameState } from './types';
import { guildPowerLevel, GUILD_POWER_CEILING } from './power';

export type LeaderboardScope = 'global' | 'friends';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  power: number;
  isYou?: boolean;
}

/**
 * Steam leaderboards -- patch 0363, UI shell for a design already locked
 * in guild-idler-status.md: Global + Friends, tracking Guild Power
 * (power.ts's guildPowerLevel, already the number driving in-game Guild
 * Rank -- no new metric to invent). Real upload/download depends on the
 * Steamworks SDK integration (steamworks.js) landing first against the
 * now-registered App ID (GuildBound, 5143490) -- this module is the seam
 * that swap-in replaces once it does, the same "stub now, real call
 * later" shape DlcManager.owns() already uses for DLC ownership checks.
 *
 * LEADERBOARD_READY flips true the same day FindOrCreateLeaderBoard /
 * UploadLeaderboardScore / DownloadLeaderboardEntries actually get called
 * from here -- LeaderboardModal reads this flag directly rather than
 * duplicating its own "not live yet" check.
 */
export const LEADERBOARD_READY = false;

/**
 * Sanity clamp for a value before it's ever trusted as an upload -- the
 * save is client-authoritative, so this needs to exist before the first
 * real UploadLeaderboardScore call, not bolted on after the fact.
 *
 * Deliberately looser than GUILD_POWER_CEILING itself: ascension is
 * uncapped by design (see power.ts's own comment on why it's excluded
 * from that ceiling), so a genuinely multi-retirement guild can sail well
 * past the "one full clear" ceiling through entirely legitimate play. 10x
 * is a soft backstop -- "not achievable through normal play no matter how
 * many times you've retired" -- not a tight bound. Revisit once real
 * upload data exists and genuine high-end saves are actually observable.
 */
const MAX_PLAUSIBLE_POWER = GUILD_POWER_CEILING * 10;

export function clampForUpload(power: number): number {
  return Math.max(0, Math.min(Math.floor(power), MAX_PLAUSIBLE_POWER));
}

/**
 * Placeholder leaderboard read. No live Steam connection exists yet, so
 * this returns just the player's own (clamped) row -- already the exact
 * shape a real DownloadLeaderboardEntries response gets mapped into, so
 * LeaderboardModal doesn't need to change when the real call lands, only
 * this function's body does. `scope` is accepted now (unused) so the
 * eventual Global-vs-Friends branch is a one-line change here, not a
 * signature change at every call site.
 */
export function fetchLeaderboard(state: GameState, _scope: LeaderboardScope): LeaderboardEntry[] {
  return [
    {
      rank: 1,
      name: state.guildName || 'Your Guild',
      power: clampForUpload(guildPowerLevel(state)),
      isYou: true,
    },
  ];
}
