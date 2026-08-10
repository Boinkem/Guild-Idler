import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Gates a one-off CSS pulse (see .purchase-pulse in app.css) to only the
 * moment a tracked value actually changes -- not the first render of
 * whatever component calls this. Guild Hall/Vendors/Harvest's own level
 * displays ("Level 2/5") used to apply that class unconditionally via a
 * `key={level}` remount trick: real for an actual purchase (level really
 * did just change, so React inserts a genuinely new element and the CSS
 * animation correctly plays), but ALSO real every time the containing
 * panel itself remounts -- which happens on every ordinary tab switch,
 * since navigating away and back tears the whole panel down and rebuilds
 * it fresh. A freshly-inserted DOM element plays a CSS animation
 * regardless of *why* it was inserted, so simply clicking back to Guild
 * Hall replayed the same "just bought this" pulse on every level number
 * in the tab, purchase or not.
 *
 * Same batch shape as useMaxFlash just below (one hook call per
 * component, a `{id: value}` map in, a `{id: boolean}` lookup out) --
 * not a per-item hook, since every call site here renders each card via
 * a plain helper function invoked inside `.map()` (upgradeCard, etc.),
 * not a real per-item component instance. Calling a hook inside that
 * kind of per-item closure would violate the Rules of Hooks (a variable
 * number of hook calls depending on list length, no stable fiber to
 * attach state to) -- this is the correct shape for that constraint,
 * mirroring how useMaxFlash already solved the identical problem for its
 * own per-item flashes.
 */
export function usePulsesOnChange(items: { id: string; value: number }[]): Record<string, boolean> {
  const prevRef = useRef<Record<string, number> | null>(null);
  const [pulsing, setPulsing] = useState<Record<string, boolean>>({});

  const signature = items.map((i) => `${i.id}:${i.value}`).join('|');
  useEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    const changed: string[] = [];
    for (const item of items) {
      next[item.id] = item.value;
      const before = prev?.[item.id];
      if (prev && before !== undefined && before !== item.value) changed.push(item.id);
    }
    prevRef.current = next;
    if (changed.length === 0) return undefined;
    setPulsing((cur) => {
      const merged = { ...cur };
      for (const id of changed) merged[id] = true;
      return merged;
    });
    const id = window.setTimeout(() => {
      setPulsing((cur) => {
        const cleared = { ...cur };
        for (const cid of changed) delete cleared[cid];
        return cleared;
      });
    }, 500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return pulsing;
}

/**
 * Shared "Fully upgraded X" card flash -- stars poof up and out, then fade.
 * Used by anything with a level cap: permanent upgrades, vendor levels, and
 * Guild Hall facilities. Extracted here rather than duplicated per panel.
 */

export const STAR_BURST: { dx: number; dy: number; rot: number }[] = [
  { dx: 0, dy: -36, rot: -12 },
  { dx: 27, dy: -24, rot: 16 },
  { dx: 36, dy: 3, rot: -20 },
  { dx: 23, dy: 30, rot: 24 },
  { dx: -4, dy: 36, rot: -9 },
  { dx: -29, dy: 23, rot: 18 },
  { dx: -36, dy: -4, rot: -22 },
  { dx: -21, dy: -29, rot: 13 },
];

export function MaxFlash({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="max-flash-layer" aria-hidden="true">
      <span className="max-flash-text">Fully upgraded — {label}</span>
      {STAR_BURST.map((s, i) => (
        <span
          key={i}
          className="max-flash-star"
          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--rot': `${s.rot}deg`, animationDelay: `${i * 25}ms` } as CSSProperties}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export interface FlashTarget { id: string; name: string; level: number; maxLevel: number }

/** Fires a one-off flash the moment any tracked item's level first reaches
 * its cap -- not on mount, so opening the panel on an already-maxed item
 * doesn't replay it. */
export function useMaxFlash(items: FlashTarget[]) {
  const prevRef = useRef<Record<string, number> | null>(null);
  const [flashes, setFlashes] = useState<Record<string, { name: string; key: number }>>({});

  const signature = items.map((i) => `${i.id}:${i.level}`).join('|');
  useEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    const newlyMaxed: FlashTarget[] = [];
    for (const item of items) {
      next[item.id] = item.level;
      const before = prev?.[item.id];
      if (prev && item.level >= item.maxLevel && before !== undefined && before < item.maxLevel) {
        newlyMaxed.push(item);
      }
    }
    prevRef.current = next;
    if (newlyMaxed.length > 0) {
      setFlashes((cur) => {
        const merged = { ...cur };
        for (const item of newlyMaxed) merged[item.id] = { name: item.name, key: Date.now() + Math.random() };
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
