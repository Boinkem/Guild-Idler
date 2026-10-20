import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { fxSpeed } from './purchaseFx';
import type { EntryScope } from '../game/data/entryScopes';

/**
 * Patch 0428 -- new Lore / Discovered Quests entries "ink in" (Design
 * canvas "New Lore / Discovered Quests entries ink in", signed off; saved
 * version chosen).
 *
 * Per list (`scope`), GameState.entryMarks remembers each entry as shown
 * (1) or opened (2). The first time a list renders an entry it hasn't
 * shown before, that entry plays the ink-in -- a blank page, a quill
 * writing the name and line, the art fading up from sepia -- one after
 * another, and is marked shown so it never plays again. Its red NEW tab
 * stays until the player opens it (`open`). A scope an older save has
 * never shown is adopted silently (everything in it counts as opened).
 */
export interface EntryInk {
  /** className + style for an entry's root element. */
  props: (id: string) => { className: string; style?: CSSProperties };
  isNew: (id: string) => boolean;
  inking: (id: string) => boolean;
  open: (id: string) => void;
}

const STAGGER = 650;

export function useEntryInk(scope: EntryScope, ids: string[]): EntryInk {
  const engine = useEngine();
  const state = engine.state;
  const [ink, setInk] = useState<string[]>([]);
  const sig = ids.join('|');
  const adopted = state.entryScopes.includes(scope);

  useLayoutEffect(() => {
    if (!engine.state.entryScopes.includes(scope)) {
      engine.adoptEntryScope(scope, ids);
      return;
    }
    const fresh = ids.filter((id) => !engine.state.entryMarks[`${scope}|${id}`]);
    if (fresh.length === 0) return;
    if (fxSpeed() > 0) setInk((cur) => [...cur, ...fresh.filter((id) => !cur.includes(id))]);
    engine.markEntriesShown(scope, fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sig]);

  const isNew = (id: string) => adopted && state.entryMarks[`${scope}|${id}`] !== 2;
  const inking = (id: string) => ink.includes(id);
  return {
    isNew,
    inking,
    props: (id) => {
      const i = ink.indexOf(id);
      return {
        className: `nex-entry ${isNew(id) ? 'nex-new' : ''} ${i >= 0 ? 'nex-ink fx-ink' : ''}`,
        style: i >= 0 ? ({ ['--nex-d' as string]: `calc(var(--fx-t) * ${i * STAGGER})` } as CSSProperties) : undefined,
      };
    },
    open: (id) => { if (isNew(id)) engine.markEntryOpened(scope, id); },
  };
}

/** The quill and the NEW tab, dropped inside an entry's root. */
export function EntryInkMarks({ ink, id }: { ink: EntryInk; id: string }) {
  return (
    <>
      {ink.inking(id) && (
        <svg className="nex-quill" viewBox="0 0 18 28" fill="currentColor" aria-hidden="true">
          <path d="M17 1C9 3 4 10 3 19l-2 8 3-7c6-2 11-9 13-19z" />
        </svg>
      )}
      {ink.isNew(id) && <span className="nex-tab" aria-label="New">New</span>}
    </>
  );
}
