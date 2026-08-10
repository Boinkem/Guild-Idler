import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * A shared registry of DOM elements that a flying particle (see
 * ScrapStation.tsx's original fly-to-counter, and now HarvestPanel.tsx's
 * catch flash / QuestResultModal.tsx's gold+XP flights) can measure and
 * fly toward, even when the origin and the destination live in different,
 * not-simultaneously-mounted components -- Scrap's own flight worked
 * without this because the item slot and the Scrap counter were both
 * inside the same modal at the same time; a quest reward flying toward
 * the header's gold display, or a Harvest catch flying toward the
 * Warehouse tab's stock counter while the Fields tab is what's actually
 * showing, don't have that luxury.
 *
 * A target that isn't currently mounted (e.g. the Heroes tab isn't open,
 * so no hero XP bar is registered) simply isn't in the registry --
 * every consumer treats "not found" as "skip this particular flight,"
 * never as an error. The local burst/count-up still happens regardless;
 * this registry only ever gates the extra long-distance flourish on top.
 */
const targets: Record<string, HTMLElement | null> = {};

export function registerFlyTarget(key: string, el: HTMLElement | null) {
  targets[key] = el;
}

/** The target's current on-screen center, or null if nothing with this
 *  key is currently mounted/registered. */
export function getFlyTargetCenter(key: string): { x: number; y: number } | null {
  const el = targets[key];
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * The real on-screen distance (in px) from `originEl`'s own center to the
 * registered target's center -- same live-measurement approach
 * ScrapStation.tsx's original fly-to-counter used (a fixed dx/dy only
 * works when the layout distance is actually fixed, which it isn't once
 * origin and target can be in different, independently-sized panels).
 * Returns null if the target isn't currently registered, so callers can
 * skip the long-distance flight gracefully rather than flying toward
 * nothing.
 */
export function measureFlyOffset(originEl: HTMLElement, targetKey: string): { dx: number; dy: number } | null {
  const target = getFlyTargetCenter(targetKey);
  if (!target) return null;
  const originRect = originEl.getBoundingClientRect();
  const originCenter = { x: originRect.left + originRect.width / 2, y: originRect.top + originRect.height / 2 };
  return { dx: target.x - originCenter.x, dy: target.y - originCenter.y };
}

/** Registers `key` as pointing at this ref's element for as long as the
 *  calling component stays mounted -- unregisters (sets back to null,
 *  never deletes the key) on unmount, so a stale rect from a torn-down
 *  component can never be measured against by mistake. */
export function useFlyTargetRef<T extends HTMLElement>(key: string): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    registerFlyTarget(key, ref.current);
    return () => registerFlyTarget(key, null);
  });
  return ref;
}
