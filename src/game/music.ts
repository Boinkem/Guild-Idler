/**
 * Background music -- one looping ambient track behind the guild menu.
 *
 * Deliberately separate from sound.ts's synthesized SFX cues (those exist
 * specifically to avoid ever shipping a real audio file -- see that
 * file's own top comment). This is the opposite trade-off on purpose: a
 * real track the player supplies themselves, dropped in at the path
 * below. Same "missing file just does nothing" convention as every
 * gitignored sprite pack in this game -- no file at MUSIC_SRC means
 * playback silently never starts, not an error.
 *
 * DROP YOUR TRACK HERE: public/audio/background-music.mp3
 * (mp3 or ogg both work in Electron/Chromium -- if your file is a
 * different format, either convert it or change MUSIC_SRC below to
 * match its extension.)
 *
 * One HTMLAudioElement for the app's whole lifetime (created lazily, on
 * first use) rather than one per mount -- MenuWindow itself mounts and
 * unmounts every time the guild menu opens/closes, and recreating (and
 * re-decoding) the element on every single open would both glitch the
 * loop and throw away the fade-out-in-progress from the previous close.
 */

import { Settings, SettingsStore } from './settings';

const MUSIC_SRC = './audio/background-music.mp3';
const FADE_IN_MS = 3000;
const FADE_OUT_MS = 700;

let el: HTMLAudioElement | null = null;
let fadeHandle: number | null = null;

function getElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!el) {
    const audio = new Audio(MUSIC_SRC);
    audio.loop = true;
    audio.volume = 0;
    // No file dropped in yet (or a bad path) -- fail silently, same as a
    // missing sprite sheet elsewhere in this game, rather than spamming
    // the console on every launch.
    audio.addEventListener('error', () => { el = null; }, { once: true });
    el = audio;
  }
  return el;
}

function cancelFade(): void {
  if (fadeHandle !== null) {
    window.cancelAnimationFrame(fadeHandle);
    fadeHandle = null;
  }
}

function fadeTo(target: number, durationMs: number, onDone?: () => void): void {
  const audio = getElement();
  if (!audio) return;
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
   * Call when the guild menu opens. Starts the track (if it isn't
   * already playing) and fades up to the settings volume over
   * FADE_IN_MS -- silent at app launch and in the idle companion view by
   * design, this is ambience for the guild menu specifically, not
   * something playing the instant the app starts.
   */
  enterGuildMenu(): void {
    const settings = SettingsStore.load();
    if (!settings.musicEnabled || settings.musicVolume <= 0) return;
    const audio = getElement();
    if (!audio) return;
    if (audio.paused) {
      // A fresh AudioContext-style play() call can be rejected before any
      // user gesture has happened yet on some platforms -- swallowing
      // that here is correct (not a bug being hidden): the very next
      // guild-menu open, after the player has clicked something, retries
      // cleanly on its own.
      void audio.play().catch(() => {});
    }
    fadeTo(settings.musicVolume, FADE_IN_MS);
  },

  /**
   * Call when the guild menu closes. Cuts to silence immediately unless
   * musicContinuesWhenMinimized is on, in which case playback is left
   * exactly as it was (no fade needed -- it's not stopping).
   */
  leaveGuildMenu(): void {
    const settings = SettingsStore.load();
    if (settings.musicContinuesWhenMinimized) return;
    const audio = getElement();
    if (!audio || audio.paused) return;
    fadeTo(0, FADE_OUT_MS, () => { audio?.pause(); });
  },

  /**
   * Re-applies a live settings change (the Settings panel's toggle/
   * slider) without waiting for the next menu open/close. `guildMenuOpen`
   * is passed in rather than read from anywhere here, since this module
   * has no notion of app view state on its own.
   */
  applySettingsChange(settings: Settings, guildMenuOpen: boolean): void {
    const audio = getElement();
    if (!audio) return;
    if (!settings.musicEnabled || settings.musicVolume <= 0) {
      fadeTo(0, 200, () => audio.pause());
      return;
    }
    if (!guildMenuOpen && !settings.musicContinuesWhenMinimized) return;
    if (audio.paused) void audio.play().catch(() => {});
    fadeTo(settings.musicVolume, 200);
  },
};
