import type { CSSProperties } from 'react';

/**
 * Patch 0466 -- shared bits for the ambient (always-on, slow) motion
 * pass: Design canvas "Guildbound Ambient Motion", signed off. Every
 * ambient class starts `amb-` so app.css can stop them all at once:
 *  - Reduce motion: `:root[data-motion='off'] [class*='amb-']` -> none;
 *  - window hidden or minimised: `:root[data-hidden='1']` pauses them,
 *    so the idle game isn't spending frames on glows nobody can see.
 */

/** A stable negative animation-delay (seconds) from an id, so items in a
 *  list breathe out of phase with each other but never jump between
 *  renders. `period` is the loop length the phase is spread over. */
export function ambPhase(id: string, period = 5): CSSProperties {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const frac = ((Math.imul(h, 2654435761) >>> 0) % 1000) / 1000;
  return { animationDelay: `-${(frac * period).toFixed(2)}s` };
}

let installed = false;
/** Mirrors document visibility onto `<html data-hidden>`. Called once at boot. */
export function installAmbientPause() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const sync = () => {
    document.documentElement.dataset.hidden = document.hidden ? '1' : '0';
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}
