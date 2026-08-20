import { useEffect } from 'react';
import { useEngine } from './useEngine';

/** Routine confirmations ("Sold.", "Repaired.") get the short window --
 *  quick to read, and there are a lot of them. `long` (guidance topics,
 *  and anything else banner-worthy -- see GameEngine.say's own comment)
 *  gets roughly double: these are actual instructional sentences, not a
 *  one-word confirmation, and are exactly the moments a new player most
 *  needs the extra time to actually finish reading before it's gone. */
const TOAST_DURATION_MS = 3200;
const TOAST_DURATION_LONG_MS = 6500;

export function Toast() {
  const engine = useEngine();
  const toast = engine.toast;

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => engine.clearToast(), toast.long ? TOAST_DURATION_LONG_MS : TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [toast?.seq, engine]);

  if (!toast) return null;
  // Keying on seq (not message text) forces a remount whenever a new toast
  // arrives, even if it's word-for-word identical to the last one -- same
  // reasoning as the effect above, and the actual fix: two toasts with the
  // same text are still two distinct toasts, each needing its own timer
  // and its own restarted pop-in animation.
  return <div key={toast.seq} className="toast toast-pop" role="status">{toast.message}</div>;
}
