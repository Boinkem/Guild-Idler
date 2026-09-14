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
 * Rank -- no new metric to invent).
 *
 * Patch 0382: real upload/download, via a custom steamworks.js fork
 * (electron/steamworks-leaderboards/) -- the plain upstream package has
 * no leaderboard API at all (confirmed by inspecting its actual type
 * declarations before deciding a custom addon was even necessary). Falls
 * back to the same "just your own row" shape whenever Steam genuinely
 * can't answer (not running, or the platform's native build isn't
 * available -- see the fork's own index.js for why that degrades
 * gracefully now instead of crashing), so this UI never shows a hard
 * error, only ever a preview vs. a live leaderboard.
 */
export const LEADERBOARD_READY = true;

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
 * Throttled to once per 5 minutes, not once per saveNow() call --
 * saveNow() itself fires very frequently (almost every state-changing
 * action across this codebase), and the leaderboard has no need for
 * that kind of freshness. Keeping the throttle here, not at engine.ts's
 * call site, means saveNow() itself stays a single unconditional call
 * -- the "should this particular save actually upload" decision lives
 * in exactly one place.
 */
const UPLOAD_THROTTLE_MS = 5 * 60 * 1000;
let lastUploadAttemptAt = 0;

/**
 * Fire-and-forget upload, called from engine.ts's own saveNow() (patch
 * 0382) -- piggybacks on the existing save cadence rather than its own
 * separate timer, same "reuse what's already there" reasoning every
 * other periodic Steam check in this codebase already follows.
 * `forceUpdate: false` keeps the player's BEST score if this one is
 * worse -- a temporary Guild Power dip (a prestige reset, say) shouldn't
 * tank a rank that was legitimately earned once, matching the decision
 * already recorded here before the fork even existed to enforce it.
 * Never throws -- window.littleKnight itself already swallows every
 * Steam-side failure into a plain `false`/`null` return, not an
 * exception, so there's nothing here to catch.
 */
export function uploadGuildPowerScore(state: GameState): void {
  if (typeof window === 'undefined' || !window.littleKnight?.uploadGuildPowerScore) return;
  const now = Date.now();
  if (now - lastUploadAttemptAt < UPLOAD_THROTTLE_MS) return;
  lastUploadAttemptAt = now;
  void window.littleKnight.uploadGuildPowerScore(clampForUpload(guildPowerLevel(state)), false);
}

/**
 * Real leaderboard read when Steam can answer; the same "just your own
 * row" preview as before when it can't (no bridge at all -- browser/dev
 * mode -- or Steam unavailable, or the download call itself fails). Never
 * rejects -- every failure path here resolves to the preview instead,
 * so LeaderboardModal never needs its own error-state branch.
 */
export async function fetchLeaderboard(state: GameState, scope: LeaderboardScope): Promise<LeaderboardEntry[]> {
  const previewRow: LeaderboardEntry = {
    rank: 1,
    name: state.guildName || 'Your Guild',
    power: clampForUpload(guildPowerLevel(state)),
    isYou: true,
  };

  if (typeof window === 'undefined' || !window.littleKnight?.downloadGuildPowerEntries) {
    return [previewRow];
  }

  const [entries, localSteamId] = await Promise.all([
    window.littleKnight.downloadGuildPowerEntries(scope, 1, 100),
    window.littleKnight.getLocalSteamId?.() ?? Promise.resolve(null),
  ]);

  if (!entries) return [previewRow];

  return entries.map((e) => ({
    rank: e.globalRank,
    name: e.name,
    power: e.score,
    isYou: localSteamId !== null && e.steamId64 === localSteamId,
  }));
}
