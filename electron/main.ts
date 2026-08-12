import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Electron derives the userData folder (where saves live) from app.getName(),
 * which defaults to package.json's name/productName. Locking it explicitly
 * here means the display name (productName, window titles, installer name)
 * can change freely — as it already has twice now, Little Knight -> Guild Idler -> Guildbound — without
 * silently redirecting existing testers to a new, empty save folder. This
 * must run before any app.getPath('userData') call, including ones inside
 * imported modules that might run at import time.
 */
app.setName('little-knight');

/**
 * Single-instance lock -- nothing previously stopped a player launching a
 * second copy (double-clicking the icon twice, a Steam relaunch, a stray
 * shortcut, etc.), and since every save-mutating action in this game calls
 * saveNow() immediately rather than on a batched interval (see
 * SaveManager.ts's own comment on that), two live instances both reading
 * and writing the exact same save file is a real corruption path, not a
 * theoretical one -- whichever instance saves last silently wins, discarding
 * whatever the other one did in between. `requestSingleInstanceLock()` must
 * be called this early, before any window is created or any other
 * `app.on`/`app.whenReady` registration happens, since a losing second
 * instance needs to quit before it does any of that. The winning instance's
 * `second-instance` listener (registered down in the lifecycle section
 * below, alongside `window-all-closed`) is what actually surfaces the
 * already-running window rather than leaving the player's second launch
 * attempt looking like it silently did nothing.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // This process is the redundant second instance -- Electron has already
  // notified the original, lock-holding instance via 'second-instance' (see
  // that listener below) by the time this branch runs. Quit immediately and
  // don't do anything else: everything below this point (window creation,
  // ipcMain handlers, the tray) would just be duplicate setup in a process
  // that's about to exit anyway.
  app.quit();
}

/**
 * Taskbar/window icon, and the source Tray falls back to once real art
 * exists. Windows wants an .ico; this .png path is what actually gets read
 * at runtime for the taskbar/window icon on Windows and Linux (macOS's
 * Dock icon instead comes from the app bundle itself, via build.mac.icon
 * in package.json -- see the icon note there). electron-builder separately
 * reads build.win.icon/build.mac.icon/build.linux.icon at PACKAGE time for
 * the installed app's own icon, so both this runtime path and those
 * package.json paths need the real files dropped in, not just one of them.
 * `nativeImage.createFromPath` on a missing file returns an empty (not
 * null/throwing) image, so `loadAppIcon()` safely resolves to `undefined`
 * until `build/icon.png` actually exists -- Electron's own default icon
 * keeps showing in the meantime, exactly like today, rather than every
 * window suddenly going blank the moment this lands.
 */
const APP_ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png');
function loadAppIcon() {
  const img = nativeImage.createFromPath(APP_ICON_PATH);
  return img.isEmpty() ? undefined : img;
}

/** Window sizes. The idle companion is tiny; the menu needs room.
 *  MENU_SIZE bumped from 900x620 to 1350x930 (1.5x) per direct request --
 *  the old default read as cramped even though the window's always been
 *  freely resizable; this is just a better starting point, not a new
 *  cap. Still clamped against the display's actual work area at open
 *  time (see window:setMode below), so this is safe on any screen size
 *  regardless of how big MENU_SIZE itself gets. */
const IDLE_SIZE = { width: 260, height: 300 };
const MENU_SIZE = { width: 1350, height: 930 };
/** The menu is now user-resizable -- this is a floor, not a cap, so the
 *  panel layout (nav column + content) never gets squeezed into something
 *  unusable. No maximum beyond whatever the display itself allows. */
const MENU_MIN_SIZE = { width: 700, height: 480 };

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let alwaysOnTop = true;

/**
 * Which window mode the renderer currently shows, and the companion's "home"
 * position — independent concepts that used to get tangled together. The
 * home position is where the tiny idle window belongs; opening the big menu
 * and dragging it around must never overwrite that, or closing the menu
 * leaves the companion stranded wherever the menu happened to end up rather
 * than back at its actual spot.
 */
let currentMode: 'idle' | 'menu' = 'idle';
let idleBounds: { x: number; y: number } | null = null;
/** A user-resized menu size, remembered the same way idleBounds remembers
 *  position -- null until the user actually resizes it once, at which
 *  point it takes over from the MENU_SIZE default. */
let menuSize: { width: number; height: number } | null = null;
/** When locked (default), the idle companion can't be dragged at all. */
let companionLocked = true;

const userDataDir = () => app.getPath('userData');
const savePath = () => path.join(userDataDir(), 'little-knight-save.json');
const backupPath = () => path.join(userDataDir(), 'little-knight-save.backup.json');
const settingsPath = () => path.join(userDataDir(), 'little-knight-settings.json');

interface Settings {
  alwaysOnTop: boolean;
  x?: number;
  y?: number;
  locked?: boolean;
  /** A user-resized menu window persists across launches, same philosophy
   *  as the idle companion's own remembered position -- resizable that
   *  resets every session would feel like it doesn't actually work. */
  menuWidth?: number;
  menuHeight?: number;
}

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Settings;
  } catch {
    return { alwaysOnTop: true };
  }
}

async function writeSettings(patch: Partial<Settings>) {
  const current = await readSettings();
  const next = { ...current, ...patch };
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
}

function bottomRight(width: number, height: number) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
  };
}

/** Clamps a top-left position so the given size stays fully on the primary display. */
function clampToWorkArea(x: number, y: number, width: number, height: number) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)),
  };
}

async function createWindow() {
  const settings = await readSettings();
  alwaysOnTop = settings.alwaysOnTop ?? true;
  companionLocked = settings.locked ?? true;
  menuSize = settings.menuWidth != null && settings.menuHeight != null
    ? { width: settings.menuWidth, height: settings.menuHeight }
    : null;

  // Clamped here, not just used raw -- confirmed as the actual root cause of
  // the companion appearing completely absent (not blank, genuinely
  // off-screen) on cold boot: a position saved on one display (e.g. an
  // ultrawide monitor) stays in settings and gets restored verbatim on a
  // later launch under a different display setup, where it can land
  // entirely outside any visible screen. The return-to-idle path in
  // window:setMode already clamped this same kind of position -- this was
  // the one path that didn't, which is exactly why opening then closing
  // Guild Hall "fixed" it: that path recomputes and clamps, this one
  // hadn't.
  idleBounds = settings.x != null && settings.y != null
    ? clampToWorkArea(settings.x, settings.y, IDLE_SIZE.width, IDLE_SIZE.height)
    : bottomRight(IDLE_SIZE.width, IDLE_SIZE.height);
  currentMode = 'idle';

  win = new BrowserWindow({
    ...IDLE_SIZE,
    ...idleBounds,
    icon: loadAppIcon(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium throttles timers and fetches in windows its own occlusion
      // heuristic decides are "backgrounded" -- a heuristic that gets
      // confused by exactly this window's configuration (frameless,
      // transparent, always-on-top at an elevated level, tiny, pinned to a
      // screen corner). Confirmed as the actual cause of the hero sprite
      // never loading on cold boot: the manifest fetch it depends on was
      // getting silently throttled, not slow or broken, and resolving the
      // moment the window was resized into Guild Hall's normal, centered
      // shape un-confused Chromium's visibility tracking. This is an
      // always-on desktop companion by design -- it needs to stay fully
      // active regardless of what Chromium's occlusion detection assumes.
      backgroundThrottling: false,
    },
  });

  // 'floating' only sits above normal windows, not exclusive-fullscreen
  // apps/games. 'screen-saver' (Electron's highest level) fixes that in
  // principle, but on Windows it's a known bad combination with a
  // transparent + frameless window specifically -- the DWM compositor can
  // fail to composite a layered window at that level at all, making it
  // invisible everywhere, not just behind other apps (confirmed: this is
  // exactly what happened on first try). 'pop-up-menu' is one level down --
  // still well above ordinary windows and most borderless-fullscreen games,
  // without that specific transparent-window rendering bug. Note this still
  // can't defeat a game running in true DirectX/GPU-exclusive fullscreen
  // (as opposed to the far more common borderless-windowed) -- that mode
  // bypasses the OS window manager entirely, which no window flag from any
  // app can override.
  win.setAlwaysOnTop(alwaysOnTop, 'pop-up-menu');
  // Keep the companion visible when the user switches virtual desktops,
  // fullscreen ones included.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('moved', async () => {
    if (!win) return;
    // Only a move of the IDLE window updates its home position. Dragging the
    // menu window around (a deliberately supported thing to do) must not
    // relocate where the companion snaps back to afterward.
    if (currentMode !== 'idle') return;
    const [x, y] = win.getPosition();
    idleBounds = { x, y };
    await writeSettings({ x, y });
  });

  win.on('resized', async () => {
    if (!win) return;
    // The idle companion is never resizable (see window:setMode), so this
    // only ever fires in menu mode in practice -- checked anyway, same
    // defensive shape as the moved listener above, in case that ever
    // changes.
    if (currentMode !== 'menu') return;
    const [width, height] = win.getSize();
    menuSize = { width, height };
    await writeSettings({ menuWidth: width, menuHeight: height });
  });

  /**
   * Blocks the window from actually closing until the renderer confirms
   * its own save has finished writing to disk. Previously nothing did
   * this at all -- the renderer's own `beforeunload`/`visibilitychange`
   * handlers (App.tsx) fired a save, but fire-and-forget, with nothing on
   * the main-process side ever waiting for it. `save:write`'s own handler
   * is a genuine multi-step async sequence (write a temp file, back up the
   * old save, rename the temp file into place) -- real disk I/O that
   * takes real time, and Electron gives a closing window/quitting app no
   * guarantee that time exists. Closing (or quitting from the tray) soon
   * after something saveworthy happened -- a quest resolving, a
   * notification archiving -- could let the process terminate mid-write,
   * silently discarding it. The NEXT launch would then load a save from
   * before that event, and normal catch-up/refresh logic would naturally
   * reprocess whatever was still "due" by wall-clock time -- reported
   * directly as a quest-result popup and its matching notification both
   * reappearing on every restart, which is exactly what a lost save
   * right before close would produce.
   *
   * `allowClose` lets the SECOND close attempt (this handler calling
   * `win.close()` again once the flush confirms) actually proceed instead
   * of looping forever. A 2-second timeout is a safety net, not the
   * expected path -- if the renderer is unresponsive for any reason, the
   * window still closes rather than trapping the user in an unclosable
   * app.
   */
  let allowClose = false;
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    const finish = () => {
      if (allowClose) return;
      allowClose = true;
      win?.close();
    };
    const timeout = setTimeout(finish, 2000);
    ipcMain.once('save:flush-complete', () => {
      clearTimeout(timeout);
      finish();
    });
    win?.webContents.send('save:flush-request');
  });
}

function createTray() {
  // Falls back to a 16x16 transparent icon so the tray entry still works
  // before build/icon.png exists -- see loadAppIcon's own comment above.
  tray = new Tray(loadAppIcon() ?? nativeImage.createEmpty());
  const menu = Menu.buildFromTemplate([
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: (item) => {
        alwaysOnTop = item.checked;
        win?.setAlwaysOnTop(alwaysOnTop, 'pop-up-menu');
        void writeSettings({ alwaysOnTop });
      },
    },
    {
      label: 'Lock companion position',
      type: 'checkbox',
      checked: companionLocked,
      click: (item) => {
        companionLocked = item.checked;
        void writeSettings({ locked: companionLocked });
      },
    },
    { label: 'Show knight', click: () => win?.show() },
    {
      label: 'Show Guild Hall',
      click: () => {
        // window:setMode's own handler only resizes the window -- it has
        // no way to change React's mode state on its own, since every
        // other call to it originates FROM the renderer as a side effect
        // of a state change that already happened there. This is the one
        // path that goes the other direction, so it notifies the renderer
        // instead of trying to duplicate setMode's resize logic here.
        win?.show();
        win?.webContents.send('open-guild-hall');
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('Guildbound');
  tray.setContextMenu(menu);
}

/* ------------------------------- IPC ------------------------------- */

ipcMain.handle('save:read', async () => {
  try {
    return await fs.readFile(savePath(), 'utf8');
  } catch {
    try {
      return await fs.readFile(backupPath(), 'utf8');
    } catch {
      return null;
    }
  }
});

ipcMain.handle('save:write', async (_e, json: string) => {
  // Write to a temp file, promote the old save to backup, then swap in.
  const tmp = savePath() + '.tmp';
  await fs.writeFile(tmp, json, 'utf8');
  try {
    await fs.copyFile(savePath(), backupPath());
  } catch {
    /* first run: nothing to back up */
  }
  await fs.rename(tmp, savePath());
  return true;
});

ipcMain.handle('save:reveal', () => userDataDir());

ipcMain.handle('window:setMode', (_e, mode: 'idle' | 'menu') => {
  if (!win) return;
  if (mode === currentMode) return;

  if (mode === 'menu') {
    // Capture the idle position before growing, so we have somewhere correct
    // to return to later regardless of where the menu window gets dragged.
    const [x, y] = win.getPosition();
    idleBounds = { x, y };

    win.setMinimumSize(MENU_MIN_SIZE.width, MENU_MIN_SIZE.height);
    win.setResizable(true);
    win.setMaximizable(true);

    // A previously-resized size takes over from the default once one
    // exists, clamped the same defensive way idle position already is --
    // a size remembered from a bigger display (an ultrawide, say) could
    // otherwise ask for a window larger than the current one can show.
    const { workArea } = screen.getPrimaryDisplay();
    const requested = menuSize ?? MENU_SIZE;
    const size = {
      width: Math.max(MENU_MIN_SIZE.width, Math.min(requested.width, workArea.width)),
      height: Math.max(MENU_MIN_SIZE.height, Math.min(requested.height, workArea.height)),
    };
    // The guild menu opens centred on screen rather than anchored to the
    // companion's corner — confirmed as the preferred default: the hero stays
    // put bottom-right, but the menu is a separate, larger surface that reads
    // better centred than sprouting from a corner.
    const pos = {
      x: Math.round(workArea.x + (workArea.width - size.width) / 2),
      y: Math.round(workArea.y + (workArea.height - size.height) / 2),
    };
    win.setBounds({ ...pos, ...size }, false);
  } else {
    // Always return to the saved home position, never wherever the menu
    // window currently happens to be sitting.
    const home = idleBounds ?? bottomRight(IDLE_SIZE.width, IDLE_SIZE.height);
    const pos = clampToWorkArea(home.x, home.y, IDLE_SIZE.width, IDLE_SIZE.height);
    win.setBounds({ ...pos, ...IDLE_SIZE }, false);
    win.setResizable(false);
    win.setMaximizable(false);
    win.setMinimumSize(IDLE_SIZE.width, IDLE_SIZE.height);
  }
  currentMode = mode;
});

ipcMain.handle('window:setAlwaysOnTop', (_e, value: boolean) => {
  alwaysOnTop = value;
  win?.setAlwaysOnTop(value, 'pop-up-menu');
  void writeSettings({ alwaysOnTop: value });
  return value;
});

ipcMain.handle('window:getAlwaysOnTop', () => alwaysOnTop);

ipcMain.handle('window:setLocked', (_e, value: boolean) => {
  companionLocked = value;
  void writeSettings({ locked: value });
  return value;
});

ipcMain.handle('window:getLocked', () => companionLocked);

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:quit', () => app.quit());

/**
 * Steam achievement unlock — currently a stub. Swap the body for a real
 * steamworks.js call once the SDK is installed and an App ID exists:
 *
 *   import steamworks from 'steamworks.js';
 *   const client = steamworks.init(APP_ID);
 *   client.achievement.activate(steamApiName);
 *
 * Kept as a no-op-but-logged IPC call rather than skipped entirely so the
 * renderer side (engine.ts, AchievementManager) can be built and tested now
 * and never needs to change when the real SDK goes in — only this handler's
 * body does.
 */
ipcMain.handle('steam:unlockAchievement', (_e, steamApiName: string) => {
  console.log(`[steam stub] would unlock achievement: ${steamApiName}`);
  return true;
});

/* ------------------------------ lifecycle ------------------------------ */

/**
 * Fired on the ORIGINAL (lock-holding) instance only, the moment a second
 * launch attempt calls requestSingleInstanceLock() and loses -- see that
 * call's own comment above. Surfaces the already-running window rather than
 * leaving a player's second launch attempt looking like nothing happened:
 * restores it if minimized, switches it into Guild Hall (menu) mode via the
 * same renderer notification the tray's own "Show Guild Hall" item already
 * uses (see createTray above), and focuses it. Deliberately the same
 * behavior as that tray item rather than just re-showing the idle
 * companion -- a player double-clicking the app icon again is almost
 * certainly trying to get the game's attention, not just glance at the
 * corner sprite.
 */
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.webContents.send('open-guild-hall');
  win.focus();
});

app.whenReady().then(async () => {
  await createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
