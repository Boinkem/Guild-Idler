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

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider.');
  return ctx;
}
