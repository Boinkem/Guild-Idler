/**
 * Sound cues, synthesized with the Web Audio API rather than shipped as audio
 * files. This means: no licensing question, nothing to bundle, and every cue
 * is a few lines of oscillator/envelope code that's easy to retune by ear.
 *
 * All playback is gated through Settings (soundEnabled / soundVolume), read
 * fresh on every call so a toggle takes effect immediately without needing to
 * thread settings through every call site.
 */

import { SettingsStore } from './settings';

export type SoundCue =
  | 'quest_success' | 'quest_fail' | 'level_up' | 'legendary_drop'
  | 'chain_complete' | 'purchase' | 'error' | 'depart' | 'achievement' | 'collect'
  | 'equip' | 'sell' | 'scrap' | 'craft' | 'enhance' | 'infuse' | 'enchant' | 'prestige_upgrade' | 'repair';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  // Browsers suspend a freshly-created context until a user gesture; resume
  // opportunistically. If it's still suspended the sound just won't play,
  // which is a fine failure mode (no error, no crash).
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Tone {
  /** Hz */
  freq: number;
  /** Seconds from the start of the cue. */
  start: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  /** Relative gain 0-1, multiplied by the master volume. */
  gain?: number;
}

/** Each cue is a tiny sequence of tones — a tune, not a sample. */
const CUES: Record<SoundCue, Tone[]> = {
  quest_success: [
    { freq: 523.25, start: 0, duration: 0.09, type: 'triangle', gain: 0.5 },
    { freq: 659.25, start: 0.08, duration: 0.14, type: 'triangle', gain: 0.5 },
  ],
  quest_fail: [
    { freq: 220, start: 0, duration: 0.16, type: 'sine', gain: 0.4 },
    { freq: 174.61, start: 0.12, duration: 0.22, type: 'sine', gain: 0.35 },
  ],
  level_up: [
    { freq: 392.0, start: 0, duration: 0.08, type: 'triangle', gain: 0.45 },
    { freq: 523.25, start: 0.07, duration: 0.08, type: 'triangle', gain: 0.45 },
    { freq: 659.25, start: 0.14, duration: 0.08, type: 'triangle', gain: 0.45 },
    { freq: 783.99, start: 0.21, duration: 0.22, type: 'triangle', gain: 0.5 },
  ],
  legendary_drop: [
    { freq: 392.0, start: 0, duration: 0.1, type: 'sine', gain: 0.4 },
    { freq: 587.33, start: 0.08, duration: 0.1, type: 'sine', gain: 0.42 },
    { freq: 783.99, start: 0.16, duration: 0.1, type: 'sine', gain: 0.44 },
    { freq: 1046.5, start: 0.24, duration: 0.3, type: 'triangle', gain: 0.5 },
  ],
  chain_complete: [
    { freq: 261.63, start: 0, duration: 0.12, type: 'triangle', gain: 0.4 },
    { freq: 329.63, start: 0.1, duration: 0.12, type: 'triangle', gain: 0.42 },
    { freq: 392.0, start: 0.2, duration: 0.12, type: 'triangle', gain: 0.44 },
    { freq: 523.25, start: 0.3, duration: 0.16, type: 'triangle', gain: 0.46 },
    { freq: 659.25, start: 0.42, duration: 0.4, type: 'triangle', gain: 0.5 },
  ],
  purchase: [
    { freq: 700, start: 0, duration: 0.04, type: 'square', gain: 0.2 },
    { freq: 900, start: 0.03, duration: 0.05, type: 'square', gain: 0.22 },
  ],
  error: [
    { freq: 180, start: 0, duration: 0.12, type: 'square', gain: 0.25 },
  ],
  depart: [
    { freq: 440, start: 0, duration: 0.06, type: 'triangle', gain: 0.3 },
    { freq: 554.37, start: 0.05, duration: 0.08, type: 'triangle', gain: 0.3 },
  ],
  achievement: [
    { freq: 587.33, start: 0, duration: 0.09, type: 'square', gain: 0.35 },
    { freq: 739.99, start: 0.08, duration: 0.09, type: 'square', gain: 0.35 },
    { freq: 880.0, start: 0.16, duration: 0.28, type: 'triangle', gain: 0.45 },
  ],
  // Plays when the reward card is dismissed, timed with the coins/XP flying
  // up off the card -- a quick bright sparkle rather than the fuller fanfare
  // that already played when the quest resolved.
  collect: [
    { freq: 880.0, start: 0, duration: 0.05, type: 'triangle', gain: 0.3 },
    { freq: 1108.73, start: 0.04, duration: 0.06, type: 'triangle', gain: 0.32 },
    { freq: 1318.51, start: 0.09, duration: 0.14, type: 'sine', gain: 0.38 },
  ],
  // A short, solid metallic snap -- gear settling into a slot, not a
  // purchase. Previously equip() played nothing at all.
  equip: [
    { freq: 660, start: 0, duration: 0.03, type: 'square', gain: 0.28 },
    { freq: 440, start: 0.025, duration: 0.07, type: 'triangle', gain: 0.32 },
  ],
  // Coin-drop, descending -- deliberately the mirror image of `purchase`
  // (which rises) so selling and buying read as opposite actions by ear
  // alone, not the same blip both ways.
  sell: [
    { freq: 900, start: 0, duration: 0.04, type: 'square', gain: 0.22 },
    { freq: 700, start: 0.03, duration: 0.05, type: 'square', gain: 0.2 },
  ],
  // A dull, low crunch -- breaking an item down, not selling it whole.
  scrap: [
    { freq: 220, start: 0, duration: 0.05, type: 'square', gain: 0.3 },
    { freq: 160, start: 0.04, duration: 0.09, type: 'square', gain: 0.28 },
  ],
  // A quick hammer-tap pair -- crafting something new at a station.
  craft: [
    { freq: 500, start: 0, duration: 0.03, type: 'square', gain: 0.3 },
    { freq: 500, start: 0.06, duration: 0.03, type: 'square', gain: 0.3 },
    { freq: 740, start: 0.12, duration: 0.1, type: 'triangle', gain: 0.35 },
  ],
  // A light ascending sparkle -- refining an item's +N, deliberately
  // smaller/quicker than level_up's full fanfare since this happens far
  // more often per session.
  enhance: [
    { freq: 587.33, start: 0, duration: 0.06, type: 'triangle', gain: 0.35 },
    { freq: 880.0, start: 0.05, duration: 0.14, type: 'triangle', gain: 0.4 },
  ],
  // A short magical shimmer -- applying an elemental gem to gear.
  infuse: [
    { freq: 740, start: 0, duration: 0.08, type: 'sine', gain: 0.3 },
    { freq: 988, start: 0.05, duration: 0.08, type: 'sine', gain: 0.32 },
    { freq: 1245, start: 0.1, duration: 0.12, type: 'sine', gain: 0.34 },
  ],
  // A brighter, slightly slower twinkle than infuse -- rolling a stat
  // enchant onto a piece, meant to feel distinct from (not identical to)
  // the elemental-gem shimmer above even though both are "arcane."
  enchant: [
    { freq: 659.25, start: 0, duration: 0.07, type: 'sine', gain: 0.3 },
    { freq: 987.77, start: 0.06, duration: 0.09, type: 'triangle', gain: 0.34 },
    { freq: 1318.51, start: 0.14, duration: 0.16, type: 'sine', gain: 0.38 },
  ],
  // Spending Renown on a permanent perk -- weightier than a plain
  // `purchase` blip (this is a much rarer, bigger-stakes spend), but
  // shorter than achievement/level_up since it's not a milestone moment.
  prestige_upgrade: [
    { freq: 493.88, start: 0, duration: 0.08, type: 'triangle', gain: 0.4 },
    { freq: 739.99, start: 0.07, duration: 0.1, type: 'triangle', gain: 0.42 },
    { freq: 1108.73, start: 0.15, duration: 0.2, type: 'sine', gain: 0.45 },
  ],
  // A soft double-tap mend, lower and warmer than `craft`'s hammer-tap
  // pair -- fixing something that already exists rather than making
  // something new. Manual repair (single and "Repair Everything") had
  // played nothing at all before this; auto-repair stays deliberately
  // silent (see its own comment in engine.ts), same as every other
  // background-automation preference.
  repair: [
    { freq: 350, start: 0, duration: 0.05, type: 'triangle', gain: 0.28 },
    { freq: 420, start: 0.06, duration: 0.06, type: 'triangle', gain: 0.3 },
    { freq: 550, start: 0.13, duration: 0.12, type: 'sine', gain: 0.32 },
  ],
};

export function playSound(cue: SoundCue): void {
  const settings = SettingsStore.load();
  if (!settings.soundEnabled || settings.soundVolume <= 0) return;

  const audioCtx = getContext();
  if (!audioCtx) return;

  const tones = CUES[cue];
  const now = audioCtx.currentTime;

  for (const tone of tones) {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;

    const peak = (tone.gain ?? 0.4) * settings.soundVolume;
    const t0 = now + tone.start;
    const t1 = t0 + tone.duration;

    // Short envelope so notes don't click at the edges.
    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.015, tone.duration / 4));
    gainNode.gain.linearRampToValueAtTime(0, t1);

    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

/** Used by the settings panel's "test sound" button. */
export function previewSound(): void {
  playSound('level_up');
}
