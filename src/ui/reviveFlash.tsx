import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAR_BURST } from './maxFlash';

/**
 * Same "detect a crossing, fire a one-off flash" shape as maxFlash.tsx's
 * useMaxFlash and levelFlash.tsx's useLevelUpFlash, reusing the same
 * STAR_BURST layout, but for a Fallen hero or pet coming back rather than
 * a level or an upgrade cap. Distinct event, distinct meaning -- see
 * guild-idler-status.md's Health stat + Fallen/death mechanic section --
 * so this is its own hook/component rather than overloading either of
 * the existing two.
 *
 * Tracks `fallen` (a plain boolean) rather than a numeric threshold: a
 * flash fires the moment a tracked id goes from fallen=true to
 * fallen=false, i.e. HeroManager.revive/PetManager.revive actually
 * landing -- not on mount, so opening a panel on an already-healthy
 * roster never replays a flash for a revival that happened while the
 * panel was closed (same "only fires for what you're watching" scope
 * engine.ts's own immediate sound cues already use for quest results).
 */
export function useReviveFlash(items: { id: string; fallen: boolean }[]) {
  const prevRef = useRef<Record<string, boolean> | null>(null);
  const [flashes, setFlashes] = useState<Record<string, { key: number }>>({});

  const signature = items.map((i) => `${i.id}:${i.fallen}`).join('|');
  useEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, boolean> = {};
    const revived: string[] = [];
    for (const item of items) {
      next[item.id] = item.fallen;
      const before = prev?.[item.id];
      if (prev && before === true && item.fallen === false) revived.push(item.id);
    }
    prevRef.current = next;
    if (revived.length > 0) {
      setFlashes((cur) => {
        const merged = { ...cur };
        for (const id of revived) merged[id] = { key: Date.now() + Math.random() };
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

/**
 * Moss-green rather than max-flash's brass or level-flash's sky -- matches
 * the moss-green `.bar.health` fill (see HealthBar), so "revived" reads as
 * the same "good/health" colour language the rest of the Health system
 * already uses, not a third unrelated accent.
 */
export function ReviveFlash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="revive-flash-layer" aria-hidden="true">
      <span className="revive-flash-text">Revived!</span>
      {STAR_BURST.map((s, i) => (
        <span
          key={i}
          className="revive-flash-star"
          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--rot': `${s.rot}deg`, animationDelay: `${i * 25}ms` } as CSSProperties}
        >
          ✚
        </span>
      ))}
    </div>
  );
}
