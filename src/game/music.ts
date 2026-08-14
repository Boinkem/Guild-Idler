/**
 * Background music -- an ambient track behind the guild menu, plus a
 * pool of bard tracks the player earns as scattered rewards (a quest
 * chain, a raid clear, an achievement, a win at Grimsby's table -- see
 * achievements.json's own `unlocksTrackId` field and engine.ts's
 * reportAchievements for where a track actually gets granted) that they
 * can pick between or shuffle across once they've earned at least one.
 *
 * Deliberately separate from sound.ts's synthesized SFX cues (those exist
 * specifically to avoid ever shipping a real audio file -- see that
 * file's own top comment). This is the opposite trade-off on purpose: a
 * real track the player supplies themselves, dropped in at the path
 * below. Same "missing file just does nothing" convention as every
 * gitignored sprite pack in this game -- no file at a track's path means
 * playback silently never starts, not an error.
 *
 * DROP YOUR TRACKS HERE:
 *   public/audio/background-music.mp3       (the always-free default)
 *   public/audio/bard/<id>.mp3               (one per BARD_TRACKS entry)
 * (mp3 or ogg both work in Electron/Chromium -- if a file is a different
 * format, either convert it or change its `path` in bard-tracks.json via
 * the DevTool.)
 *
 * One HTMLAudioElement for the app's whole lifetime (created lazily, on
 * first use) rather than one per mount -- MenuWindow itself mounts and
 * unmounts every time the guild menu opens/closes, and recreating (and
 * re-decoding) the element on every single open would both glitch the
 * loop and throw away the fade-out-in-progress from the previous close.
 */

import { Settings, SettingsStore } from './settings';
import { BARD_TRACKS, BARD_TRACK_BY_ID } from './data/bard';
import { DAY } from './util';

const DEFAULT_TRACK_SRC = './audio/background-music.mp3';
const FADE_IN_MS = 3000;
const FADE_OUT_MS = 700;

let el: HTMLAudioElement | null = null;
let fadeHandle: number | null = null;
/** The src the element is actually currently playing/paused on, tracked
 *  separately from `el.src` itself -- reading `audio.src` back gives a
 *  browser-resolved absolute URL, not the relative path this was set
 *  with, so comparing against that directly would always look "changed"
 *  even when nothing was. */
let currentSrc: string | null = null;

/**
 * Resolves a Settings.selectedBardTrack choice down to an actual audio
 * src, given the guild's actually-earned track ids (state.
 * unlockedBardTracks). Exported standalone (not just used internally) so
 * it can be unit-tested without spinning up a real <audio> element.
 */
export function resolveTrackSrc(selection: string, unlockedTrackIds: string[], now: number): string {
  const unlocked = BARD_TRACKS.filter((t) => unlockedTrackIds.includes(t.id));
  if (selection === 'shuffle') {
    // The default track always counts as one option in the shuffle pool,
    // so a fresh guild with nothing earned yet still gets *some*
    // rotation-flavoured behaviour (trivially, always the default)
    // rather than shuffle silently doing nothing until the first track
    // is earned. Deterministic per real-world day (same UTC-epoch-day
    // bucketing every other window-based system in this game already
    // uses, e.g. reroll.ts's rerollDay), so it doesn't jump mid-session.
    const pool = ['default', ...unlocked.map((t) => t.id)];
    const pick = pool[Math.floor(now / DAY) % pool.length];
    return pick === 'default' ? DEFAULT_TRACK_SRC : `./audio/${BARD_TRACK_BY_ID[pick].path}`;
  }
  if (selection !== 'default') {
    // Falls back to the default track below if this id isn't currently
    // unlocked -- covers both "never earned" and the unusual case of a
    // save somehow pointing at a track id the guild doesn't actually
    // have (e.g. a save imported onto a build where that achievement no
    // longer exists).
    const track = unlocked.find((t) => t.id === selection);
    if (track) return `./audio/${track.path}`;
  }
  return DEFAULT_TRACK_SRC;
}

function getElement(src: string): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!el || currentSrc !== src) {
    // Switching tracks mid-session (a live Settings change, not just
    // first load) tears down the old element and starts the new one
    // silent -- the caller (enterGuildMenu/applySettingsChange) always
    // follows this with its own paused-check-then-play plus fadeTo, so
    // starting at 0 here just means that fade-in looks the same whether
    // this is the very first track played or a switch mid-session,
    // rather than needing two different code paths for the two cases.
    if (el) el.pause();
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    // No file dropped in yet (or a bad path) -- fail silently, same as a
    // missing sprite sheet elsewhere in this game, rather than spamming
    // the console on every launch.
    audio.addEventListener('error', () => { if (el === audio) el = null; }, { once: true });
    el = audio;
    currentSrc = src;
  }
  return el;
}

function cancelFade(): void {
  if (fadeHandle !== null) {
    window.cancelAnimationFrame(fadeHandle);
    fadeHandle = null;
  }
}

function fadeTo(audio: HTMLAudioElement, target: number, durationMs: number, onDone?: () => void): void {
  cancelFade();
  const start = audio.volume;
  const startTime = performance.now();
  if (durationMs <= 0 || start === target) {
    audio.volume = target;
    onDone?.();
    return;
  }
  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    audio.volume = start + (target - start) * t;
    if (t < 1) {
      fadeHandle = window.requestAnimationFrame(step);
    } else {
      fadeHandle = null;
      onDone?.();
    }
  };
  fadeHandle = window.requestAnimationFrame(step);
}

export const MusicManager = {
  /**
   * Call when the guild menu opens. Starts the currently-selected track
   * (if it isn't already playing) and fades up to the settings volume
   * over FADE_IN_MS -- silent at app launch and in the idle companion
   * view by design, this is ambience for the guild menu specifically,
   * not something playing the instant the app starts. `unlockedTrackIds`
   * comes from the caller's own GameState (state.unlockedBardTracks) --
   * this module has no notion of game state on its own, same as it
   * already had none of app view state.
   */
  enterGuildMenu(unlockedTrackIds: string[]): void {
    const settings = SettingsStore.load();
    if (!settings.musicEnabled || settings.musicVolume <= 0) return;
    const src = resolveTrackSrc(settings.selectedBardTrack, unlockedTrackIds, Date.now());
    const audio = getElement(src);
    if (!audio) return;
    if (audio.paused) {
      // A fresh AudioContext-style play() call can be rejected before any
      // user gesture has happened yet on some platforms -- swallowing
      // that here is correct (not a bug being hidden): the very next
      // guild-menu open, after the player has clicked something, retries
      // cleanly on its own.
      void audio.play().catch(() => {});
    }
    fadeTo(audio, settings.musicVolume, FADE_IN_MS);
  },

  /**
   * Call when the guild menu closes. Cuts to silence immediately unless
   * musicContinuesWhenMinimized is on, in which case playback is left
   * exactly as it was (no fade needed -- it's not stopping).
   */
  leaveGuildMenu(): void {
    const settings = SettingsStore.load();
    if (settings.musicContinuesWhenMinimized) return;
    if (!el || el.paused) return;
    const audio = el;
    fadeTo(audio, 0, FADE_OUT_MS, () => { audio.pause(); });
  },

  /**
   * Re-applies a live settings change (the Settings panel's toggle/
   * slider/track picker) without waiting for the next menu open/close.
   * `guildMenuOpen` is passed in rather than read from anywhere here,
   * same as `unlockedTrackIds` -- this module tracks none of it itself.
   */
  applySettingsChange(settings: Settings, guildMenuOpen: boolean, unlockedTrackIds: string[]): void {
    if (!settings.musicEnabled || settings.musicVolume <= 0) {
      if (el && !el.paused) fadeTo(el, 0, 200, () => el?.pause());
      return;
    }
    if (!guildMenuOpen && !settings.musicContinuesWhenMinimized) return;
    const src = resolveTrackSrc(settings.selectedBardTrack, unlockedTrackIds, Date.now());
    const audio = getElement(src);
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => {});
    fadeTo(audio, settings.musicVolume, 200);
  },
};
