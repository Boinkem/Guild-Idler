import { useCallback, useEffect, useState } from 'react';
import { GameEngine } from './game/engine';
import { MusicManager } from './game/music';
import { EngineContext } from './ui/useEngine';
import { useSettings } from './ui/useSettings';
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
  // Surfaces a real boot-time failure instead of hanging silently on
  // "Waking the knight..." forever -- previously an uncaught exception
  // anywhere inside GameEngine.boot() (past SaveManager.load's own safe
  // try/catch -- catchUpOffline, refreshWorld, start are not wrapped)
  // rejected this promise with no .catch() anywhere in the chain, so
  // `engine` just stayed null with no visible error and no console
  // signal beyond an easy-to-miss "Uncaught (in promise)" line. Real
  // example that hit this exact gap: patch 0255 stopped setting
  // item.customMods on procedural drops, and HeroManager.equipmentMods's
  // `item.customMods ?? def.mods` fell through to undefined for any
  // procedural/crafted item with no def.mods of its own -- crashed
  // inside catchUpOffline's regenHealth->maxHealth->equipmentMods chain
  // on the very first boot after that patch, for any save with one of
  // those equipped. That specific bug is fixed at its own source (see
  // guild-idler-status.md's patch 0260 writeup) -- this is the general
  // safety net so the NEXT unrelated boot-time bug fails loud, not
  // silent.
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let created: GameEngine | null = null;
    void GameEngine.boot().then((instance) => {
      if (!live) return instance.stop();
      created = instance;
      setEngine(instance);
    }).catch((err: unknown) => {
      console.error('Boot failed:', err);
      if (live) setBootError(err instanceof Error ? err.message : String(err));
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

  // Background music: fades in when the guild menu opens, fades out (or
  // keeps playing, if musicContinuesWhenMinimized is on) when it closes.
  // Re-runs on every relevant settings change too, not just on `mode`
  // changing, so dragging the volume slider, flipping the toggle, or
  // picking a different track in Settings takes effect immediately
  // rather than waiting for the next menu open/close -- see
  // MusicManager.applySettingsChange. unlockedTrackIds (which tracks are
  // actually earned) comes from engine.state directly rather than being
  // tracked inside music.ts itself, same "this module knows nothing
  // about game/app state on its own" boundary the mode-tracking already
  // established.
  const { settings } = useSettings();
  const unlockedTrackIds = engine ? engine.state.unlockedBardTracks : [];
  useEffect(() => {
    if (mode === 'menu') MusicManager.enterGuildMenu(unlockedTrackIds);
    else MusicManager.leaveGuildMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => {
    MusicManager.applySettingsChange(settings, mode === 'menu', unlockedTrackIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.musicEnabled, settings.musicVolume, settings.musicContinuesWhenMinimized,
    settings.selectedBardTrack, unlockedTrackIds.join(','),
  ]);

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

  if (bootError) {
    return (
      <div className="loading">
        <div>Something went wrong waking the knight.</div>
        <div className="tiny muted" style={{ marginTop: 8, maxWidth: 420 }}>{bootError}</div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Check the console for the full stack trace.</div>
      </div>
    );
  }
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
