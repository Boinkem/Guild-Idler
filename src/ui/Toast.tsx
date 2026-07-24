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
  return <div className="toast" role="status">{message}</div>;
}
