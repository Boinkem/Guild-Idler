import { useEffect, useRef } from 'react';
import { useEngine } from './useEngine';

/** Routine confirmations ("Sold.", "Repaired.") get the short window --
 *  quick to read, and there are a lot of them. `long` (guidance topics,
 *  and anything else banner-worthy -- see GameEngine.say's own comment)
 *  gets roughly double: these are actual instructional sentences, not a
 *  one-word confirmation, and are exactly the moments a new player most
 *  needs the extra time to actually finish reading before it's gone. */
const TOAST_DURATION_MS = 3200;
const TOAST_DURATION_LONG_MS = 6500;

/**
 * Patch 0330, direct tester feedback: "Some written parts popped up for
 * only 5 seconds and I didn't have time to read it." A longer fixed
 * duration alone doesn't fix that for a genuinely slow reader (or anyone
 * who just glanced away), so this now pauses its own countdown on
 * hover/focus and resumes from wherever it left off on leave/blur,
 * rather than only ever extending the fixed window further -- plus a
 * manual × close for "I'm done reading, dismiss it now" the other
 * direction. `remaining`/`startedAt`/`timerId` are refs, not state --
 * they only need to survive across the pause/resume boundary, never
 * need to trigger a re-render on their own.
 */
export function Toast() {
  const engine = useEngine();
  const toast = engine.toast;
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const timerId = useRef<number | null>(null);

  const clear = () => {
    if (timerId.current !== null) window.clearTimeout(timerId.current);
    timerId.current = null;
  };

  const arm = (ms: number) => {
    clear();
    startedAt.current = Date.now();
    timerId.current = window.setTimeout(() => engine.clearToast(), ms);
  };

  useEffect(() => {
    if (!toast) return undefined;
    remaining.current = toast.long ? TOAST_DURATION_LONG_MS : TOAST_DURATION_MS;
    arm(remaining.current);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.seq, engine]);

  if (!toast) return null;

  const pause = () => {
    if (timerId.current === null) return;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    clear();
  };
  const resume = () => {
    if (timerId.current !== null || remaining.current <= 0) return;
    arm(remaining.current);
  };

  // Keying on seq (not message text) forces a remount whenever a new toast
  // arrives, even if it's word-for-word identical to the last one -- same
  // reasoning as the effect above, and the actual fix: two toasts with the
  // same text are still two distinct toasts, each needing its own timer
  // and its own restarted pop-in animation.
  return (
    <div
      key={toast.seq}
      className="toast toast-pop"
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span>{toast.message}</span>
      <button
        className="toast-close"
        onClick={() => engine.clearToast()}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
