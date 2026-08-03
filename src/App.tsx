import { useCallback, useEffect, useState } from 'react';
import { GameEngine } from './game/engine';
import { EngineContext } from './ui/useEngine';
import { IdleView } from './ui/IdleView';
import { MenuWindow } from './ui/MenuWindow';
import { GuildNamingModal } from './ui/GuildNamingModal';
import { OfflineReportModal } from './ui/OfflineReportModal';
import { QuestResultModal } from './ui/QuestResultModal';
import { ChainCompleteModal } from './ui/ChainCompleteModal';
import { RaidResultModal } from './ui/RaidResultModal';
import { AchievementPopup } from './ui/AchievementPopup';
import { Toast } from './ui/Toast';

export type ViewMode = 'idle' | 'menu';

export function App() {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [mode, setMode] = useState<ViewMode>('idle');

  useEffect(() => {
    let live = true;
    let created: GameEngine | null = null;
    void GameEngine.boot().then((instance) => {
      if (!live) return instance.stop();
      created = instance;
      setEngine(instance);
    });
    return () => {
      live = false;
      created?.stop();
      void created?.saveNow();
    };
  }, []);

  // Save on the way out so a quit never loses the last few seconds.
  useEffect(() => {
    if (!engine) return;
    const flush = () => { void engine.saveNow(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [engine]);

  const changeMode = useCallback((next: ViewMode) => {
    setMode(next);
    void window.littleKnight?.setWindowMode(next);
  }, []);

  // The naming modal needs real screen space to render in -- if it shows up
  // while the app is still in the tiny idle-companion window (the default
  // on boot), it's visually trapped inside that window's actual OS-level
  // dimensions, not just visually cramped. Force the full menu size the
  // moment an unnamed guild is detected, same mechanism changeMode already
  // uses, rather than trying to make the modal itself bigger than the
  // window it's stuck in.
  useEffect(() => {
    if (!engine) return;
    if (engine.state.guildName === '') changeMode('menu');
  }, [engine, changeMode]);

  if (!engine) return <div className="loading">Waking the knight…</div>;

  return (
    <EngineContext.Provider value={engine}>
      {mode === 'idle'
        ? <IdleView onOpenMenu={() => changeMode('menu')} />
        : <MenuWindow onClose={() => changeMode('idle')} />}
      <GuildNamingModal />
      {engine.state.guildName !== '' && (
        <>
          {/* Always mounted regardless of mode -- its own auto-dismiss
              effect (silently clearing a report when the setting is off)
              needs to keep running even while the idle companion, not this
              modal, is what's showing. Its full-detail render is gated on
              "active" internally, so it never displays cropped inside the
              tiny idle window; IdleView shows a compact banner instead and
              opens the menu on click. */}
          <OfflineReportModal active={mode === 'menu'} />
          <QuestResultModal onViewLore={() => changeMode('menu')} />
          <ChainCompleteModal active={mode === 'menu'} onViewLore={() => changeMode('menu')} />
          <RaidResultModal active={mode === 'menu'} onViewLore={() => changeMode('menu')} />
        </>
      )}
      <Toast />
      <AchievementPopup />
    </EngineContext.Provider>
  );
}
