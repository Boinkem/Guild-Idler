import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { fxMs } from './purchaseFx';
import { useCountUp } from './useCountUp';

/**
 * Patch 0422 -- shared timing helpers for the three animated result cards
 * (QuestResultModal, ChainCompleteModal, RaidResultModal).
 *
 * Each card is one CSS timeline: every beat is a keyframe animation with
 * `both` fill and a start delay written in --fx-t units (1ms at 1x, scaled
 * by Settings > Animation speed). Each card's root class contains "fx-",
 * so the existing Reduce motion rule zeroes every delay inside it and the
 * global rule collapses every duration -- the card simply appears in its
 * final state. Numbers use the JS twin (fxMs) so the count-ups start on
 * the same beat as the CSS they sit in.
 */

/** Inline start delay for one beat, in 1x milliseconds. */
export function at(ms: number, extra?: CSSProperties): CSSProperties {
  return { animationDelay: `calc(var(--fx-t) * ${Math.round(ms)})`, ...extra };
}

/** A one-shot count-up from 0 that waits `delayMs` (1x) before it starts,
 *  so it climbs while its row is actually on screen. Instant with motion off. */
export function useDelayedCount(target: number, delayMs: number, durationMs = 700): number {
  const [started, setStarted] = useState(() => fxMs(delayMs) <= 0);
  useEffect(() => {
    if (started) return undefined;
    const id = window.setTimeout(() => setStarted(true), fxMs(delayMs));
    return () => window.clearTimeout(id);
  }, [started, delayMs]);
  return useCountUp(started ? target : 0, { from: 0, durationMs: Math.max(1, fxMs(durationMs)) });
}

/** The little drawn tick used by the streak track and story stage list. */
export function TickMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.3 L5 9 L10 3" />
    </svg>
  );
}
