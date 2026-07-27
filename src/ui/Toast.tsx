import { useEffect } from 'react';
import { useEngine } from './useEngine';

export function Toast() {
  const engine = useEngine();
  const message = engine.toast;

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => engine.clearToast(), 3200);
    return () => window.clearTimeout(id);
  }, [message, engine]);

  if (!message) return null;
  // Keying on the message text forces a remount whenever it changes, which
  // restarts the toast-pop animation -- the visual half of the sound cue
  // that already plays for purchases and other actions.
  return <div key={message} className="toast toast-pop" role="status">{message}</div>;
}
