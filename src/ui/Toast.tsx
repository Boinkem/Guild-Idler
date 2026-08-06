import { useEffect } from 'react';
import { useEngine } from './useEngine';

export function Toast() {
  const engine = useEngine();
  const toast = engine.toast;

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => engine.clearToast(), 3200);
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
