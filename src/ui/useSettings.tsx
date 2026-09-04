import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, Settings, SettingsStore } from '../game/settings';

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Holds the live settings object, persists on every change, and re-applies the
 * CSS variables so the whole UI reflows immediately.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = SettingsStore.load();
    SettingsStore.apply(loaded);
    return loaded;
  });

  useEffect(() => {
    SettingsStore.apply(settings);
    SettingsStore.save(settings);
  }, [settings]);

  // Guild's Mood "System" (patch 0309) -- backgroundSrc()'s own
  // resolveBackgroundMood check is a plain function of the current time,
  // so it already returns a fresh answer on every call; what it needs
  // from here is just a reason to actually be CALLED again once the
  // 6am/6pm boundary passes while a session is sitting open. `tick`
  // exists purely to give the memoized context value below a new
  // reference every minute while System mode is active, which forces
  // every settings consumer to re-render and recompute its own
  // backgroundSrc() calls -- settings itself never changes here, so this
  // never triggers an unnecessary save. Inert (no interval at all)
  // whenever backgroundMood isn't 'system', so Dim/Bright players pay
  // nothing for this.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (settings.backgroundMood !== 'system') return undefined;
    const interval = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(interval);
  }, [settings.backgroundMood]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset, tick]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider.');
  return ctx;
}
