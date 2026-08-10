import { useEffect, useRef, useState } from 'react';

/**
 * Animates a displayed number climbing (or dropping) toward `target`
 * instead of snapping to it instantly on every render -- the numeric
 * equivalent of the .bar width transition added elsewhere in this pass.
 * A number just appearing already-final reads as flat; watching it climb
 * is a large part of what makes a gain feel like a gain in this genre.
 *
 * Two call shapes:
 *  - `useCountUp(engine.state.gold)` -- tracks a live value that changes
 *    over time (a nav gold counter, a stat that ticks up as the guild
 *    runs). No animation on first mount (nobody wants the nav bar
 *    counting up from 0 on every app launch) -- only on values that
 *    change *after* that first render, continuing smoothly from wherever
 *    the display currently sits if another change lands mid-tween, rather
 *    than restarting from scratch (so a burst of quick, small gains reads
 *    as one continuously climbing number).
 *  - `useCountUp(result.gold, { from: 0 })` -- a one-shot reward number
 *    mounted once with its final value already known (a result modal's
 *    reward burst, an offline report total). Explicitly starts from 0 so
 *    it counts up to the reward on arrival instead of appearing static.
 */
export function useCountUp(target: number, options?: { durationMs?: number; from?: number }): number {
  const durationMs = options?.durationMs ?? 600;
  const initial = options?.from ?? target;
  const [display, setDisplay] = useState(initial);
  const displayRef = useRef(initial);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const delta = target - from;
    if (delta === 0) return undefined;

    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out -- fast start, gentle settle, same shape the .bar
      // transition and most of this pass's other motion already uses.
      const eased = 1 - (1 - t) * (1 - t);
      const next = Math.round(from + delta * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
