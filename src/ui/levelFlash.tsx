import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAR_BURST } from './maxFlash';

/**
 * Same "detect a crossing, fire a one-off flash" shape as maxFlash.tsx's
 * useMaxFlash/MaxFlash, reusing its STAR_BURST particle layout, but for a
 * hero's level going up rather than an upgrade hitting its cap -- distinct
 * event, distinct meaning (this can fire repeatedly across a hero's whole
 * career; MaxFlash fires exactly once per upgrade, ever), so this is its
 * own hook/component rather than overloading useMaxFlash with a second
 * purpose. --sky (the same blue the XP bar itself already uses) instead of
 * --brass, so a level-up doesn't visually read as "maxed out" the way
 * MaxFlash's gold intentionally does.
 *
 * Levels gained while offline are already called out in the Offline
 * Report's own "+N levels" summary line (OfflineReportModal) -- this only
 * covers a level-up happening while the Heroes tab is actually open and
 * visible, the same "only fires for what you're watching" scope
 * engine.ts's own immediate sound cues already use for quest results.
 */
export function useLevelUpFlash(heroes: { id: string; level: number }[]) {
  const prevRef = useRef<Record<string, number> | null>(null);
  const [flashes, setFlashes] = useState<Record<string, { levels: number; key: number }>>({});

  const signature = heroes.map((h) => `${h.id}:${h.level}`).join('|');
  useEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    const leveled: { id: string; levels: number }[] = [];
    for (const hero of heroes) {
      next[hero.id] = hero.level;
      const before = prev?.[hero.id];
      // Only fires when there's a real previous reading to compare against
      // (prev !== null) -- same guard useMaxFlash uses, so opening the tab
      // on a hero who's already level 12 never replays a flash for levels
      // 1 through 11 they earned before the tab was ever opened.
      if (prev && before !== undefined && hero.level > before) {
        leveled.push({ id: hero.id, levels: hero.level - before });
      }
    }
    prevRef.current = next;
    if (leveled.length > 0) {
      setFlashes((cur) => {
        const merged = { ...cur };
        for (const l of leveled) merged[l.id] = { levels: l.levels, key: Date.now() + Math.random() };
        return merged;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const dismiss = (id: string) => setFlashes((cur) => {
    if (!(id in cur)) return cur;
    const rest = { ...cur };
    delete rest[id];
    return rest;
  });

  return { flashes, dismiss };
}

export function LevelUpFlash({ levels, onDone }: { levels: number; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="level-flash-layer" aria-hidden="true">
      <span className="level-flash-text">Level Up{levels > 1 ? ` ×${levels}` : ''}!</span>
      {STAR_BURST.map((s, i) => (
        <span
          key={i}
          className="level-flash-star"
          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--rot': `${s.rot}deg`, animationDelay: `${i * 25}ms` } as CSSProperties}
        >
          ✦
        </span>
      ))}
    </div>
  );
}
