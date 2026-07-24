import { createContext, useContext, useEffect, useState } from 'react';
import { GameEngine } from '../game/engine';

export const EngineContext = createContext<GameEngine | null>(null);

/** Subscribes to the engine and re-renders on every notify(). */
export function useEngine(): GameEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('EngineContext is missing. Wrap the tree in EngineContext.Provider.');
  const [, force] = useState(0);
  useEffect(() => engine.subscribe(() => force((n) => n + 1)), [engine]);
  return engine;
}

/** Ticks once a second so countdowns stay live even without engine changes. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
