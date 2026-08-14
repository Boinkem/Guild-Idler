export interface BardTrack {
  id: string;
  name: string;
  /** Relative to public/audio/ -- e.g. "bard/bard_track_1.mp3". Same
   *  "missing file just does nothing" convention background-music.mp3
   *  already established in music.ts; a track can be listed here and
   *  selectable in Settings well before its actual mp3 is dropped in. */
  path: string;
  /** License/attribution line, shown next to the track name in Settings
   *  when non-empty -- open-license audio commonly requires this. */
  credit: string;
}

/**
 * Bard tracks live in json/bard-tracks.json so they can be edited via
 * tools/devtool without touching TypeScript -- same pattern
 * materials.ts/consumables.ts already use for their own data. Each track
 * is unlocked by a specific achievement (see achievements.json's own
 * `unlocksTrackId` field) rather than bought -- list order here has no
 * unlock meaning anymore, it's just display order. See music.ts for the
 * read side (state.unlockedBardTracks) and engine.ts's reportAchievements
 * for where an unlock is actually granted.
 */
import bardTracksJson from './json/bard-tracks.json';
export const BARD_TRACKS: BardTrack[] = bardTracksJson as BardTrack[];

export const BARD_TRACK_BY_ID: Record<string, BardTrack> = Object.fromEntries(
  BARD_TRACKS.map((t) => [t.id, t]),
);
