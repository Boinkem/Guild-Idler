import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import type { Display } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Electron derives the userData folder (where saves live) from app.getName(),
 * which defaults to package.json's name/productName. Locking it explicitly
 * here means the display name (productName, window titles, installer name)
 * can change freely — as it already has three times now, Little Knight ->
 * Guild Idler -> Guildbound -> (internal id) guildbound — without silently
 * redirecting existing testers to a new, empty save folder. This must run
 * before any app.getPath('userData') call, including ones inside imported
 * modules that might run at import time.
 *
 * Patch 0266: internal id itself finally moved off the original
 * 'little-knight' value, in step with package.json's own `name`/`appId`
 * fields (both were the last "Little Knight" holdouts; productName/author
 * had already been Guildbound for a while). Changing THIS specific string
 * is exactly the operation the comment above warns about -- it silently
 * redirects app.getPath('userData') to a brand-new, empty OS folder the
 * instant this ships, for every existing player. migrateLegacySaveFolder()
 * below is what stops that from actually losing anyone's progress: it runs
 * once, before any save is read, and copies a prior 'little-knight'
 * install's save/backup/settings files into the new 'guildbound' folder if
 * (and only if) the new folder doesn't already have its own save. See that
 * function's own comment for the full guard logic.
 */
app.setName('guildbound');

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
 *
 * Patch 0216 fix: this used to silently resolve to `undefined` in every
 * PACKAGED build, even though `build/icon.png` was committed and real --
 * `package.json`'s `build.files` allowlist (what electron-builder actually
 * copies into the packaged app's asar) only listed `dist/**` and
 * `dist-electron/**`, never `build/`. `build.win.icon`/`mac.icon`/
 * `linux.icon` only brand the installer/exe file itself at package time;
 * they don't cause `build/` to exist inside the running app's own
 * resources. Dev mode never hit this (running straight from the real
 * source tree, `build/icon.png` is right there), which is exactly why
 * testers only saw a missing tray icon in installed builds, never in dev.
 * Fixed by adding the one specific file this code actually reads
 * (`build/icon.png`) to `build.files` -- not the whole `build/` folder,
 * which also holds unused dev-only variants (icon2.ico, 1icon.png,
 * ICON-README.md) with no reason to ship in the package.
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
 *  regardless of how big MENU_SIZE itself gets.
 *
 *  IDLE_SIZE.height bumped 300 -> 340 (patch 0231, direct report + fix)
 *  -- closes a real, confirmed bug: .idle-root bottom-anchors its content
 *  (justify-content: flex-end) inside this fixed-height window, so any
 *  content taller than the window pushes earlier elements up and off the
 *  TOP, not into a scrollable overflow -- there's no "overflow" here in
 *  any CSS sense, content pushed above y=0 is pushed past the window's
 *  own physical boundary and is simply gone. This exact bug already
 *  happened once before with the pet sprite's own margin (see
 *  .pet-companion-button's app.css comment) and was fixed THERE by
 *  shrinking content back into the existing 300px budget rather than
 *  growing the window -- deliberately NOT the same fix this time: the
 *  thing getting pushed off-screen this time is the "While you were
 *  away" banner (IdleView.tsx's awayBanner, plus three siblings --
 *  chainBanner/raidBanner/hatchReadyBanner -- that can each add their
 *  own row), and there's no version of shrinking existing UI that makes
 *  room for a banner that didn't exist when the pet-sprite fix was
 *  written. Confirmed safe: `idleBounds` is reclamped against the
 *  CURRENT IDLE_SIZE on every launch (see createWindow below), so a
 *  saved position from before this change can never end up positioned
 *  off-screen because of the extra height. The extra 40px is invisible
 *  in the common (no banner) case -- the window is fully transparent, so
 *  unused headroom above bottom-anchored content is literally nothing
 *  on screen, not a visible empty box. Deliberately sized for ONE
 *  banner row comfortably, not a worst-case stack of all four -- an
 *  accepted, known limitation (see guild-idler-status.md's own writeup)
 *  rather than taking on a dynamic window-resize feature for a rare
 *  multi-banner edge case. */
const IDLE_SIZE = { width: 260, height: 340 };
const MENU_SIZE = { width: 1350, height: 930 };
/**
 * Patch 0269: the "Status bars (corner companion)" display mode's own
 * size story -- see window:setIdleDisplay below. STATUS_MIN_SIZE is a
 * floor (same concept as MENU_MIN_SIZE just above), small enough that a
 * couple of roster rows still fit; STATUS_DEFAULT_SIZE is the starting
 * point on first use, roomy enough to show a handful of heroes without
 * immediately needing to drag it bigger. Both are just starting/floor
 * values -- a user-resized size (statusWidth/statusHeight in Settings,
 * same persistence shape menuWidth/menuHeight already have) takes over
 * from STATUS_DEFAULT_SIZE the moment one exists, exactly like menuSize
 * already does for the big menu window.
 */
const STATUS_MIN_SIZE = { width: 220, height: 160 };
const STATUS_DEFAULT_SIZE = { width: 300, height: 420 };
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
/**
 * Patch 0269: which footprint the corner companion shows while
 * currentMode === 'idle' -- orthogonal to currentMode itself on purpose.
 * currentMode's job stays exactly "idle vs menu" (the two OS-level window
 * shapes/behaviors every existing check in this file already branches on);
 * this is purely "which of the two idle DISPLAYS is showing," so nothing
 * that already reads currentMode needs to learn about a third value.
 * Reset to 'sprite' on relaunch same as menuSize/idleBounds's own "starts
 * fresh, restored from settings inside createWindow" pattern -- see
 * window:setIdleDisplay below for how a saved statusWidth/statusHeight
 * actually gets applied once the renderer re-requests 'status' on boot.
 */
let idleDisplayKind: 'sprite' | 'status' = 'sprite';
/** A user-resized menu size, remembered the same way idleBounds remembers
 *  position -- null until the user actually resizes it once, at which
 *  point it takes over from the MENU_SIZE default. */
let menuSize: { width: number; height: number } | null = null;
/** Patch 0269: same remembered-size concept as menuSize just above, for
 *  the "Status bars (corner companion)" display -- null until the user
 *  actually resizes it once, at which point it takes over from
 *  STATUS_DEFAULT_SIZE. */
let statusSize: { width: number; height: number } | null = null;
/** When locked (default), the idle companion can't be dragged at all. */
let companionLocked = true;
/**
 * Which display (by Electron's own numeric display id) the window was on as
 * of the last 'moved' event -- used purely to detect a cross-monitor move,
 * not read anywhere else. See suppressNextResizeSave below for why this
 * exists.
 */
let lastKnownDisplayId: number | null = null;
/**
 * Set for a brief window immediately after detecting the menu window landed
 * on a DIFFERENT display than it was on before -- guards against a real,
 * confirmed bug: dragging the window across two monitors running at
 * different Windows display-scaling percentages (e.g. a 150%-scaled laptop
 * panel and a 100%-scaled external monitor, an extremely common real-world
 * setup) makes Windows itself silently rescale the window's pixel bounds to
 * preserve its physical/DIP size on the new display, firing a genuine
 * native 'resize' event in the process -- one the OS generated, not the
 * player dragging an edge. Before this flag existed, the `resized` listener
 * below couldn't tell that apart from a real manual resize and persisted
 * the OS-rescaled size as if the player had deliberately chosen it,
 * corrupting `menuSize`/`menuWidth`/`menuHeight` with a value nobody
 * actually asked for -- which is exactly what "moving the game to a new
 * monitor resets the manual resize" was reported as. The window's actual
 * on-screen bounds are left completely alone either way (this never calls
 * setBounds or fights Windows' own rescale) -- only whether that
 * particular resize gets WRITTEN DOWN as the new remembered preference is
 * suppressed, and only for the one resize event immediately following a
 * detected display change, not resizes in general.
 */
let suppressNextResizeSave = false;

const userDataDir = () => app.getPath('userData');
const savePath = () => path.join(userDataDir(), 'guildbound-save.json');
const backupPath = () => path.join(userDataDir(), 'guildbound-save.backup.json');
const settingsPath = () => path.join(userDataDir(), 'guildbound-settings.json');

/**
 * One-time migration for the app.setName('little-knight') -> 'guildbound'
 * change above. Electron resolves userData as
 * path.join(app.getPath('appData'), app.getName()) -- since app.getName()
 * already returned 'guildbound' by the time userDataDir() above ever runs,
 * that path is reconstructed here by hand from appData + the OLD literal
 * name, rather than read from anywhere live, since nothing in this process
 * still has 'little-knight' as its actual app name to ask for.
 *
 * Guard order matters: only runs the copy at all if guildbound-save.json
 * does NOT already exist -- so a player who has already launched a
 * post-rename build once (and therefore has their own real guildbound
 * save, however small) can never have it silently overwritten by an old
 * little-knight save on a later launch. A first-time player with no
 * little-knight folder at all (never played before this patch) simply
 * finds nothing to copy and proceeds to createInitialState() exactly as
 * before -- this function is a no-op for them, not an error path.
 *
 * Copies save + backup + settings independently (each guarded by its own
 * try/catch) rather than all-or-nothing -- a settings file missing
 * shouldn't block recovering the actual save, which is the part that
 * matters. Runs before createWindow() in the startup sequence below, so
 * the very first save:read the renderer ever issues already sees the
 * migrated file, not a race against it.
 */
async function migrateLegacySaveFolder() {
  const newSave = savePath();
  try {
    await fs.access(newSave);
    return; // already has its own guildbound save -- never touch it
  } catch {
    /* fall through -- no guildbound save yet, worth checking for a legacy one */
  }

  const legacyDir = path.join(app.getPath('appData'), 'little-knight');
  const legacySave = path.join(legacyDir, 'little-knight-save.json');
  const legacyBackup = path.join(legacyDir, 'little-knight-save.backup.json');
  const legacySettings = path.join(legacyDir, 'little-knight-settings.json');

  try {
    await fs.copyFile(legacySave, newSave);
    console.log('[migration] copied little-knight save into guildbound userData folder');
  } catch {
    return; // no legacy save either -- nothing to migrate, genuinely a fresh install
  }
  try {
    await fs.copyFile(legacyBackup, backupPath());
  } catch {
    /* legacy backup missing is fine -- the save copy above is what matters */
  }
  try {
    await fs.copyFile(legacySettings, settingsPath());
  } catch {
    /* legacy settings missing is fine -- window falls back to defaults */
  }
}

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
  /** Patch 0269: same persisted-resize philosophy as menuWidth/menuHeight
   *  above, for the "Status bars (corner companion)" display. */
  statusWidth?: number;
  statusHeight?: number;
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

/**
 * Both bottomRight and clampToWorkArea default to the primary display so
 * every existing call site keeps working unchanged, but nearly every call
 * this file actually makes now passes an explicit `display` -- see the
 * cross-monitor position sync fix below for why defaulting to primary
 * everywhere was the root cause of the idle/menu mismatch.
 */
function bottomRight(width: number, height: number, display: Display = screen.getPrimaryDisplay()) {
  const { workArea } = display;
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
  };
}

/** Clamps a top-left position so the given size stays fully on `display`'s work area. */
function clampToWorkArea(x: number, y: number, width: number, height: number, display: Display = screen.getPrimaryDisplay()) {
  const { workArea } = display;
  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)),
  };
}

/** True if point (x, y) falls within `display`'s full bounds (not just its work area). */
function pointOnDisplay(x: number, y: number, display: Display) {
  const { bounds } = display;
  return (
    x >= bounds.x && x < bounds.x + bounds.width &&
    y >= bounds.y && y < bounds.y + bounds.height
  );
}

async function createWindow() {
  const settings = await readSettings();
  alwaysOnTop = settings.alwaysOnTop ?? true;
  companionLocked = settings.locked ?? true;
  menuSize = settings.menuWidth != null && settings.menuHeight != null
    ? { width: settings.menuWidth, height: settings.menuHeight }
    : null;
  statusSize = settings.statusWidth != null && settings.statusHeight != null
    ? { width: settings.statusWidth, height: settings.statusHeight }
    : null;
  idleDisplayKind = 'sprite';

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
  //
  // Clamped against the display NEAREST the saved point, not always the
  // primary display -- see the cross-monitor position sync fix below.
  // Clamping a secondary-monitor position into the primary display's work
  // area was itself a second, milder version of the same bug: not
  // off-screen, just quietly relocated to the wrong monitor every single
  // launch, which is exactly the "feels jank til you manually move it
  // around on launch" symptom reported directly by testers.
  idleBounds = settings.x != null && settings.y != null
    ? clampToWorkArea(
        settings.x, settings.y, IDLE_SIZE.width, IDLE_SIZE.height,
        screen.getDisplayNearestPoint({ x: settings.x, y: settings.y }),
      )
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
    // Not fullscreenable at creation time (idle mode never should be) --
    // window:setMode flips this on/off as the same window enters/leaves
    // menu mode, via win.setFullScreenable() below, rather than this ever
    // being a fixed value for the window's whole lifetime.
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

  // Baseline for the cross-monitor detection in the 'moved' listener below
  // -- set once immediately on creation so the very first real move
  // compares against the display the window actually opened on, rather
  // than starting from null and needing a whole extra move before the
  // detection logic has anything to compare against.
  lastKnownDisplayId = screen.getDisplayMatching(win.getBounds()).id;

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

  // Authoritative fullscreen-state push -- these fire for ANY transition,
  // not just ones window:setFullscreen itself requested, including the
  // OS/Chromium's own default Esc-to-exit-fullscreen behavior, which
  // bypasses that IPC handler entirely. Without this, MenuWindow.tsx's own
  // `fullscreen` React state only ever updated in response to its own
  // button click, so pressing Esc would silently desync it from the
  // window's real state -- part of the same "toggle button stops
  // reflecting reality" bug window:setFullscreen's own comment covers.
  win.on('enter-full-screen', () => win?.webContents.send('window:fullscreen-changed', true));
  win.on('leave-full-screen', () => win?.webContents.send('window:fullscreen-changed', false));

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('moved', async () => {
    if (!win) return;
    // Cross-monitor detection -- runs regardless of currentMode, since a
    // display change can happen while dragging the window in either mode
    // (only menu mode's size is ever persisted, but the display itself
    // doesn't care which mode the window is in). Compared by Electron's
    // own numeric display id, not bounds/coordinates, since two displays
    // can legitimately share an edge or overlap in virtual-desktop space.
    const nowOnDisplayId = screen.getDisplayMatching(win.getBounds()).id;
    if (lastKnownDisplayId !== null && nowOnDisplayId !== lastKnownDisplayId) {
      // See suppressNextResizeSave's own comment for the full bug this
      // guards against. The flag is intentionally cleared on a short
      // timer rather than left set indefinitely -- Windows' own DPI
      // rescale fires its 'resize' essentially immediately after the
      // display change is detected (same tick or the next one in
      // practice), so a genuine manual resize the player performs any
      // real time after actually finishing the drag must still save
      // normally, not get silently swallowed by a flag that never reset.
      suppressNextResizeSave = true;
      setTimeout(() => { suppressNextResizeSave = false; }, 500);
    }
    lastKnownDisplayId = nowOnDisplayId;

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
    // Patch 0269: the idle companion is now genuinely resizable while
    // showing the "Status bars" display (see window:setIdleDisplay below)
    // -- this listener used to assume 'menu' was the only mode that could
    // ever fire it (the plain sprite companion still isn't resizable, so
    // that assumption stays correct for THAT display specifically). Two
    // separate remembered-size branches below, one per resizable display,
    // rather than trying to force them through one shared code path --
    // menu's fullscreen-guard genuinely doesn't apply to the idle window
    // (never fullscreenable in the first place, see window:setMode), so
    // sharing the branch would mean a fullscreen check that's dead code
    // on one side of it.
    if (currentMode === 'menu') {
      // A fullscreen toggle fires its own 'resized' event (Chromium reports
      // the new fullscreen bounds as a resize) -- that's not the player
      // choosing a new windowed size, so it must never overwrite the
      // remembered menuWidth/menuHeight the way a genuine drag-to-resize
      // would. Exiting fullscreen back to the windowed size fires another
      // 'resized' event of its own, which is also skipped here since it's
      // just restoring the size already on disk, not a new one to save.
      if (win.isFullScreen()) return;
      // See suppressNextResizeSave's own comment -- this specific resize was
      // very likely Windows rescaling the window for a new display's DPI
      // scale factor, not the player dragging an edge. The window's actual
      // on-screen size is left exactly as Windows/Chromium already set it;
      // only the write to disk is skipped, so the player's real, previously
      // chosen size survives to be restored next time menu mode opens
      // (see window:setMode's own `menuSize ?? MENU_SIZE` fallback) instead
      // of being overwritten by whatever this move happened to rescale to.
      if (suppressNextResizeSave) {
        suppressNextResizeSave = false;
        return;
      }
      const [width, height] = win.getSize();
      menuSize = { width, height };
      await writeSettings({ menuWidth: width, menuHeight: height });
      return;
    }
    if (currentMode === 'idle' && idleDisplayKind === 'status') {
      // Same DPI-rescale guard as the menu branch above -- a cross-monitor
      // move can fire a native resize that isn't the player dragging an
      // edge, and that shouldn't overwrite their real chosen size either.
      if (suppressNextResizeSave) {
        suppressNextResizeSave = false;
        return;
      }
      const [width, height] = win.getSize();
      statusSize = { width, height };
      await writeSettings({ statusWidth: width, statusHeight: height });
      return;
    }
    // Plain sprite idle display is never resizable (see window:setMode /
    // window:setIdleDisplay) -- nothing to persist for it.
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

  // Which display the window is CURRENTLY sitting on, captured before
  // either branch below touches its bounds. This is the fix for a real
  // reported bug: both branches used to size/centre against
  // screen.getPrimaryDisplay() unconditionally, so a companion the player
  // had dragged onto a second monitor would still have its menu open
  // centred on the primary display -- a visible cross-monitor jump -- and
  // closing that menu could clamp the return position back into the
  // primary display's work area too, landing it in the wrong corner of
  // the wrong screen. "Check where the window currently is and open the
  // other on it" is exactly what this now does: both idle and menu bounds
  // are computed relative to wherever the window already is, not always
  // the primary display.
  const activeDisplay = screen.getDisplayMatching(win.getBounds());

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
    const { workArea } = activeDisplay;
    const requested = menuSize ?? MENU_SIZE;
    const size = {
      width: Math.max(MENU_MIN_SIZE.width, Math.min(requested.width, workArea.width)),
      height: Math.max(MENU_MIN_SIZE.height, Math.min(requested.height, workArea.height)),
    };
    // The guild menu opens centred on screen rather than anchored to the
    // companion's corner — confirmed as the preferred default: the hero stays
    // put bottom-right, but the menu is a separate, larger surface that reads
    // better centred than sprouting from a corner. Centred on activeDisplay
    // (wherever the companion currently is), not always the primary display.
    const pos = {
      x: Math.round(workArea.x + (workArea.width - size.width) / 2),
      y: Math.round(workArea.y + (workArea.height - size.height) / 2),
    };
    win.setBounds({ ...pos, ...size }, false);
    // Only the menu window is allowed to go fullscreen at all -- the tiny
    // idle companion never should be. See window:setFullscreen below.
    win.setFullScreenable(true);
  } else {
    // A fullscreened window can't have its bounds set directly (Chromium
    // ignores/queues it until fullscreen actually exits), so leaving menu
    // mode while fullscreen has to drop out of fullscreen first, same as
    // if the player had toggled it off themselves. Guarded on isFullScreen()
    // so the ordinary (non-fullscreen) path here is completely unchanged.
    if (win.isFullScreen()) win.setFullScreen(false);
    // Prefer the saved home position, but only when it's still actually on
    // the display the menu is currently sitting on. If the player dragged
    // the menu window to a different monitor than the companion's
    // remembered home, clamping that stale coordinate into the new
    // display's work area could shove it into an arbitrary edge (this is
    // the "snaps to top-left" jank reported directly) -- falling back to a
    // clean bottom-right-of-activeDisplay position reads as correct
    // instead of janky in that case, and keeps idle/menu correlated to
    // whichever screen the player is actually working on.
    //
    // Patch 0269: returning to idle mode needs to restore whichever idle
    // DISPLAY was actually showing before the menu opened, not always the
    // plain fixed-size sprite footprint -- a player who had Status Bars
    // on, opened the menu, then closed it again should land back in the
    // resizable status view at its own remembered size, not get silently
    // reset to the sprite companion.
    const restoreSize = idleDisplayKind === 'status' ? (statusSize ?? STATUS_DEFAULT_SIZE) : IDLE_SIZE;
    const restoreMin = idleDisplayKind === 'status' ? STATUS_MIN_SIZE : IDLE_SIZE;
    const size = idleDisplayKind === 'status'
      ? {
        width: Math.max(restoreMin.width, Math.min(restoreSize.width, activeDisplay.workArea.width)),
        height: Math.max(restoreMin.height, Math.min(restoreSize.height, activeDisplay.workArea.height)),
      }
      : IDLE_SIZE;
    const home = idleBounds && pointOnDisplay(idleBounds.x, idleBounds.y, activeDisplay)
      ? idleBounds
      : bottomRight(size.width, size.height, activeDisplay);
    const pos = clampToWorkArea(home.x, home.y, size.width, size.height, activeDisplay);
    win.setBounds({ ...pos, ...size }, false);
    win.setResizable(idleDisplayKind === 'status');
    win.setMaximizable(false);
    win.setFullScreenable(false);
    win.setMinimumSize(restoreMin.width, restoreMin.height);
  }
  currentMode = mode;
});

ipcMain.handle('window:setFullscreen', (_e, value: boolean) => {
  if (!win) return false;
  // Fullscreen is only ever meaningful in menu mode -- the idle companion
  // is never fullscreenable in the first place (see window:setMode), so
  // this is a defensive no-op rather than something the renderer should
  // normally be able to trigger from there.
  if (currentMode !== 'menu') return false;
  win.setFullScreen(value);
  // Returns the VALUE JUST REQUESTED, not a fresh win.isFullScreen() read --
  // confirmed as the actual cause of "toggles to fullscreen, but clicking
  // again doesn't bring back windowed mode": setFullScreen()'s underlying
  // native transition isn't guaranteed to have completed by the time this
  // handler returns, so re-querying isFullScreen() immediately afterward
  // can still report the PREVIOUS state. MenuWindow.tsx's button trusted
  // that (possibly stale) return value to update its own `fullscreen`
  // React state, so the very first click could silently desync the button
  // from reality -- it would take an extra click to catch back up, reading
  // as "the second click does nothing." The window itself always enters
  // whatever mode was requested regardless (setFullScreen isn't skipped
  // here, only the stale re-read after it); authoritative state, including
  // changes from outside this handler entirely (the OS/Chromium's own
  // Esc-to-exit-fullscreen), is pushed to the renderer separately via the
  // enter-full-screen/leave-full-screen listeners registered in
  // createWindow above.
  return value;
});

ipcMain.handle('window:getFullscreen', () => win?.isFullScreen() ?? false);

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

/**
 * Widens (or restores) the idle companion's width only -- height stays at
 * IDLE_SIZE.height, position keeps its RIGHT edge anchored (grows/shrinks
 * leftward) since that's how a bottom-right corner companion naturally
 * reads, rather than the window's right edge visibly walking further out
 * toward (or past) the screen edge it's normally tucked against. Direct
 * feature: showing the whole raid party as a row of running sprites
 * (RaidPartySprites) needs real horizontal room a fixed 260px was never
 * going to provide, and standard sprite size (not shrinking per party
 * size) was the explicit call, so the window has to grow instead.
 *
 * No-op outside idle mode (menu mode has its own independent size/resize
 * story already, `window:setMode` above) and no-op with no window --
 * matches every other handler in this file's own defensive style rather
 * than assuming a `win` that might not exist yet during startup ordering.
 * `width` is clamped to [IDLE_SIZE.width, activeDisplay.workArea.width]
 * so a caller can't shrink the companion below its normal minimum or
 * request something wider than the actual screen has room for.
 */
ipcMain.handle('window:setIdleWidth', (_e, width: number) => {
  // Patch 0269: also a no-op while the Status Bars display is showing --
  // that display is genuinely user-resizable (window:setIdleDisplay
  // below), and forcing IDLE_SIZE.height back here on every call would
  // fight a player who's deliberately resized it taller. IdleView.tsx
  // itself already only ever calls setIdleWidth for Raid View, which is
  // gated off whenever the status view is on, so this is a defensive
  // backstop, not something expected to trigger in normal use.
  if (!win || currentMode !== 'idle' || idleDisplayKind !== 'sprite') return;
  const activeDisplay = screen.getDisplayMatching(win.getBounds());
  const clampedWidth = Math.max(IDLE_SIZE.width, Math.min(Math.round(width), activeDisplay.workArea.width));
  const [curX, curY] = win.getPosition();
  const [curWidth] = win.getSize();
  const rightEdge = curX + curWidth;
  const pos = clampToWorkArea(rightEdge - clampedWidth, curY, clampedWidth, IDLE_SIZE.height, activeDisplay);
  win.setBounds({ ...pos, width: clampedWidth, height: IDLE_SIZE.height }, false);
});

/**
 * Patch 0269. Switches the corner companion between its normal fixed-size
 * sprite footprint and a resizable "Status bars" footprint (Settings >
 * Knight -- see settings.ts's own idleStatusView comment), without
 * touching currentMode itself -- see idleDisplayKind's own comment above
 * for why this stays a separate, orthogonal flag rather than a third
 * currentMode value. No-op outside idle mode (menu mode has its own
 * independent, already-resizable story) and no-op with no window, same
 * defensive shape window:setIdleWidth just above already uses.
 *
 * Patch 0272 (bug fix): used to also skip the whole resize/resizable block
 * whenever `kind === idleDisplayKind`, on the assumption that a repeat
 * call means nothing actually changed. In practice this made the switch
 * back to 'sprite' able to get permanently stuck: IdleView.tsx's own
 * effect fires this on BOTH its cleanup and its new body when the setting
 * flips off (both targeting 'sprite'), and if the first of those two
 * calls hadn't finished updating `idleDisplayKind` yet when the second
 * arrived -- or any other desync between this tracked flag and the
 * window's real bounds -- every later call believing "already there,
 * nothing to do" would silently no-op forever, leaving the companion
 * stuck resizable and oversized while the renderer had already moved on
 * to rendering the plain sprite view inside it (exactly the reported
 * "toggle on then off, sprite view ends up tiny/spread out in a huge
 * window" bug). Every call now unconditionally re-applies the full
 * resizable/size state for the requested `kind`, regardless of what
 * `idleDisplayKind` currently claims -- redundant repeat calls become a
 * harmless no-op AT THE OS LEVEL instead (setBounds/setResizable with
 * values that already match do nothing visible), and the window can no
 * longer get stuck in a state this flag insists it isn't in.
 */
ipcMain.handle('window:setIdleDisplay', (_e, kind: 'sprite' | 'status') => {
  if (!win || currentMode !== 'idle') return;
  const activeDisplay = screen.getDisplayMatching(win.getBounds());

  if (kind === 'status') {
    // Anchor the top-left corner where the companion already is, same
    // "grow from where you are" philosophy setIdleWidth's own right-edge
    // anchoring uses -- the companion shouldn't visually jump to a new
    // spot just because the display mode changed under it.
    const [x, y] = win.getPosition();
    win.setMinimumSize(STATUS_MIN_SIZE.width, STATUS_MIN_SIZE.height);
    win.setResizable(true);
    const requested = statusSize ?? STATUS_DEFAULT_SIZE;
    const size = {
      width: Math.max(STATUS_MIN_SIZE.width, Math.min(requested.width, activeDisplay.workArea.width)),
      height: Math.max(STATUS_MIN_SIZE.height, Math.min(requested.height, activeDisplay.workArea.height)),
    };
    const pos = clampToWorkArea(x, y, size.width, size.height, activeDisplay);
    win.setBounds({ ...pos, ...size }, false);
  } else {
    // Returning to the plain sprite display -- same restore-to-IDLE_SIZE
    // shape window:setMode's own idle branch already uses, anchored at
    // the window's current position rather than jumping back to the
    // remembered idleBounds (which may be stale if the status window was
    // dragged around while resizable).
    const [x, y] = win.getPosition();
    win.setResizable(false);
    win.setMinimumSize(IDLE_SIZE.width, IDLE_SIZE.height);
    const pos = clampToWorkArea(x, y, IDLE_SIZE.width, IDLE_SIZE.height, activeDisplay);
    win.setBounds({ ...pos, ...IDLE_SIZE }, false);
  }
  idleDisplayKind = kind;
});

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
  await migrateLegacySaveFolder();
  await createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
