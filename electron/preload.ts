import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only surface the renderer gets. Everything the game needs from the OS
 * goes through here, which keeps the React side testable in a plain browser.
 */
const api = {
  readSave: (): Promise<string | null> => ipcRenderer.invoke('save:read'),
  writeSave: (json: string): Promise<boolean> => ipcRenderer.invoke('save:write', json),
  saveFolder: (): Promise<string> => ipcRenderer.invoke('save:reveal'),
  setWindowMode: (mode: 'idle' | 'menu'): Promise<void> => ipcRenderer.invoke('window:setMode', mode),
  /** Idle-mode-only, no-op otherwise -- see main.ts's own window:setIdleWidth
   *  handler for the full reasoning (RaidPartySprites needing real
   *  horizontal room). Pass IDLE_SIZE.width's own value (260) to restore
   *  the normal width; there's no separate "reset" call, widening back
   *  down to the minimum IS the reset. */
  setIdleWidth: (width: number): Promise<void> => ipcRenderer.invoke('window:setIdleWidth', width),
  /**
   * Patch 0269. Idle-mode-only, no-op otherwise -- switches the corner
   * companion between its normal fixed-size sprite footprint and a
   * resizable status-list footprint (Settings > Knight -- "Status bars
   * (corner companion)"). Unlike setIdleWidth above (which only ever
   * grows/shrinks width programmatically for Raid View), 'status' makes
   * the window genuinely user-resizable via its OS-level border, since a
   * plain scrolling-free list of the whole roster needs real vertical
   * room a request-a-width call alone can't provide. See main.ts's own
   * window:setIdleDisplay handler for the full resizable/remembered-size
   * behavior.
   */
  setIdleDisplay: (kind: 'sprite' | 'status'): Promise<void> => ipcRenderer.invoke('window:setIdleDisplay', kind),
  setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:getAlwaysOnTop'),
  /** Menu-mode-only -- see main.ts's own window:setFullscreen handler for
   *  why this is a no-op (returns false) outside menu mode. */
  setFullscreen: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:setFullscreen', value),
  getFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:getFullscreen'),
  setLocked: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:setLocked', value),
  getLocked: (): Promise<boolean> => ipcRenderer.invoke('window:getLocked'),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  quit: (): Promise<void> => ipcRenderer.invoke('window:quit'),
  unlockAchievement: (steamApiName: string): Promise<boolean> => ipcRenderer.invoke('steam:unlockAchievement', steamApiName),
  /**
   * The one main-to-renderer direction in this bridge -- everything else is
   * the renderer asking main to do something. This lets the tray's "Show
   * Guild Hall" item tell the already-running renderer to switch modes,
   * since window:setMode only resizes the window and has no way on its own
   * to change React's own mode state. Returns an unsubscribe function,
   * matching the standard DOM/React listener-cleanup shape.
   */
  onOpenGuildHall: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('open-guild-hall', listener);
    return () => ipcRenderer.removeListener('open-guild-hall', listener);
  },
  /**
   * The other main-to-renderer direction: main is about to actually close
   * the window (or quit the app) and needs the renderer's own in-memory
   * state flushed to disk first -- see main.ts's own `close` handler for
   * why this exists (a real, previously-unguarded race where the process
   * could terminate mid-write, silently losing whatever happened in the
   * last few seconds before close). `callback` should call the engine's
   * own saveNow() and await it; this always signals completion back to
   * main afterward (even if the callback throws), since main is blocking
   * the actual close on that signal and must never wait forever.
   */
  onRequestFlushSave: (callback: () => void | Promise<void>): (() => void) => {
    const listener = async () => {
      try {
        await callback();
      } finally {
        ipcRenderer.send('save:flush-complete');
      }
    };
    ipcRenderer.on('save:flush-request', listener);
    return () => ipcRenderer.removeListener('save:flush-request', listener);
  },
  /**
   * Main-to-renderer only, fired whenever the window's REAL fullscreen
   * state changes for any reason -- not just in response to setFullscreen
   * itself, but also the OS/Chromium's own Esc-to-exit-fullscreen, which
   * never goes through IPC at all. See main.ts's own enter-full-screen/
   * leave-full-screen listeners and window:setFullscreen's own comment for
   * the full "toggle button stops reflecting reality" bug this fixes.
   */
  onFullscreenChanged: (callback: (value: boolean) => void): (() => void) => {
    const listener = (_e: unknown, value: boolean) => callback(value);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
};

contextBridge.exposeInMainWorld('littleKnight', api);

export type LittleKnightApi = typeof api;
