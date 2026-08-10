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
import { HatchReadyModal } from './ui/HatchReadyModal';
import { HatchRevealModal } from './ui/HatchRevealModal';
import { AchievementPopup } from './ui/AchievementPopup';
import { Toast } from './ui/Toast';
import { NotificationBanner } from './ui/NotificationBanner';

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

  const changeMode = useCallback((next: ViewMode): Promise<void> => {
    setMode(next);
    return window.littleKnight?.setWindowMode(next) ?? Promise.resolve();
  }, []);

  // The naming modal needs real screen space to render in -- if it shows up
  // while the app is still in the tiny idle-companion window (the default
  // on boot), it's visually trapped inside that window's actual OS-level
  // dimensions, not just visually cramped. Force the full menu size the
  // moment an unnamed guild is detected, same mechanism changeMode already
  // uses, rather than trying to make the modal itself bigger than the
  // window it's stuck in.
  // Tray menu's "Show Guild Hall" -- the one main-process-initiated mode
  // switch. Everywhere else, changeMode is called directly from a click
  // already happening in the renderer.
  useEffect(() => window.littleKnight?.onOpenGuildHall(() => changeMode('menu')), [changeMode]);

  // Answers main's "about to close, flush your save" request -- see
  // preload.ts/main.ts for why this exists (a real race where the process
  // could previously terminate mid-write). Only registered once `engine`
  // exists, since there's nothing to save before that; a close attempt
  // during the brief loading window before boot finishes has nothing
  // in-memory yet that could be lost anyway.
  useEffect(() => {
    if (!engine) return undefined;
    return window.littleKnight?.onRequestFlushSave(() => engine.saveNow());
  }, [engine]);

  if (!engine) return <div className="loading">Waking the knight…</div>;

  return (
    <EngineContext.Provider value={engine}>
      {mode === 'idle'
        ? <IdleView onOpenMenu={() => changeMode('menu')} />
        : <MenuWindow onClose={() => changeMode('idle')} />}
      {/* Forcing menu size for an unnamed guild now lives inside
          GuildNamingModal itself, not here -- this effect used to depend on
          [engine, changeMode], neither of which changes when hardReset()
          reassigns engine.state internally (engine stays the same instance
          the whole app lifetime). That meant it only ever ran once, on the
          initial null -> instance transition, and silently stopped
          protecting against the tiny-idle-window trap on every reset after
          the first. GuildNamingModal already re-renders correctly whenever
          guildName changes, since it reads it directly as a normal
          useEngine() consumer -- so the side effect belongs there instead. */}
      <GuildNamingModal onNeedsSpace={() => changeMode('menu')} />
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
          <QuestResultModal onViewLore={() => changeMode('menu')} onNeedsSpace={() => changeMode('menu')} />
          <ChainCompleteModal active={mode === 'menu'} onViewLore={() => changeMode('menu')} />
          <RaidResultModal active={mode === 'menu'} onViewLore={() => changeMode('menu')} />
          <HatchReadyModal active={mode === 'menu'} onView={() => changeMode('menu')} />
          {/* Not active-gated like the others above -- HatchRevealModal can
              only ever be triggered by a click already happening inside the
              Hatchery panel, which means the menu is already open. No idle-
              view path to guard against, unlike an egg becoming ready
              (which can happen mid-quest while the companion window is all
              that's showing). */}
          <HatchRevealModal />
        </>
      )}
      <Toast />
      {/* Menu-only -- the notification banner is meant to be a prominent,
          clickable "go check this out" moment, which only makes sense
          once the full menu (with somewhere for it to actually navigate
          to) is open. The tiny idle companion window already has its own
          compact quest-result banner for the one thing worth surfacing
          there; a second, unrelated banner system popping up over that
          small window would be genuinely noisy, not helpful. Notifications
          that arrive while idle still archive into the log and count
          toward the header badge/unread count exactly the same -- this
          only gates the transient pop-in banner itself. */}
      {mode === 'menu' && <NotificationBanner />}
      <AchievementPopup />
    </EngineContext.Provider>
  );
}
