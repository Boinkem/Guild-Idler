import { useLayoutEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { fxSpeed } from './purchaseFx';
import type { EntryScope } from '../game/data/entryScopes';

/**
 * Patch 0465 -- the "first time you see it" half of entryInk.tsx's
 * machinery, without the quill. Same GameState.entryMarks storage
 * (shown = 1, opened = 2), same rules:
 *  - an id the scope hasn't shown before is `fresh` for this mount (the
 *    caller plays its one-off moment) and is marked shown straight away,
 *    so it never plays twice -- even across a reload, and even if the
 *    change happened offline or while another tab was open;
 *  - it stays `isNew` (a NEW tab / dot) until the caller `open`s it;
 *  - a scope an older save has never seen is adopted silently: what's
 *    already there counts as opened, nothing plays.
 *
 * Call it ONCE per scope per screen with every qualifying id (the panel,
 * not each card), or the first card to mount would adopt the scope with
 * only its own ids and every other card's would look fresh.
 * `fresh` stays empty with Reduce motion on (ids are still marked shown).
 */
export interface FirstSeen {
  fresh: (id: string) => boolean;
  /** Position among this mount's fresh ids, for staggering; -1 if not fresh. */
  order: (id: string) => number;
  isNew: (id: string) => boolean;
  open: (id: string) => void;
  anyNew: boolean;
}

export function useFirstSeen(scope: EntryScope, ids: string[]): FirstSeen {
  const engine = useEngine();
  const state = engine.state;
  const [fresh, setFresh] = useState<string[]>([]);
  const sig = ids.join('|');
  const adopted = state.entryScopes.includes(scope);

  useLayoutEffect(() => {
    if (!engine.state.entryScopes.includes(scope)) {
      engine.adoptEntryScope(scope, ids);
      return;
    }
    const unseen = ids.filter((id) => !engine.state.entryMarks[`${scope}|${id}`]);
    if (unseen.length === 0) return;
    if (fxSpeed() > 0) setFresh((cur) => [...cur, ...unseen.filter((id) => !cur.includes(id))]);
    engine.markEntriesShown(scope, unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sig]);

  const isNew = (id: string) => adopted && ids.includes(id) && state.entryMarks[`${scope}|${id}`] !== 2;
  return {
    fresh: (id) => fresh.includes(id),
    order: (id) => fresh.indexOf(id),
    isNew,
    open: (id) => { if (isNew(id)) engine.markEntryOpened(scope, id); },
    anyNew: ids.some(isNew),
  };
}

/**
 * Patch 0465 -- what each tracked number or ring showed the last time
 * this screen was on, this session (module memory, not the save: "since
 * your last visit" is about what you watched, and a fresh launch has
 * nothing to catch up from). Returns, once per mount, the old value for
 * every key whose value moved since then; always records the current
 * values. Empty with Reduce motion on.
 */
const lastSeenValues = new Map<string, number>();
export function useSinceLastVisit(values: Record<string, number>): Record<string, number> {
  const [from] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (fxSpeed() <= 0) return out;
    for (const [key, value] of Object.entries(values)) {
      const before = lastSeenValues.get(key);
      if (before !== undefined && before !== value) out[key] = before;
    }
    return out;
  });
  const sig = Object.entries(values).map(([k, v]) => `${k}:${v}`).join('|');
  useLayoutEffect(() => {
    for (const [key, value] of Object.entries(values)) lastSeenValues.set(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return from;
}
