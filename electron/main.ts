import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Electron derives the userData folder (where saves live) from app.getName(),
 * which defaults to package.json's name/productName. Locking it explicitly
 * here means the display name (productName, window titles, installer name)
 * can change freely — as it just did, Little Knight -> Guild Idler — without
 * silently redirecting existing testers to a new, empty save folder. This
 * must run before any app.getPath('userData') call, including ones inside
 * imported modules that might run at import time.
 */
app.setName('little-knight');

/** Window sizes. The idle companion is tiny; the menu needs room. */
const IDLE_SIZE = { width: 260, height: 300 };
const MENU_SIZE = { width: 900, height: 620 };

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

  idleBounds = settings.x != null && settings.y != null
    ? { x: settings.x, y: settings.y }
    : bottomRight(IDLE_SIZE.width, IDLE_SIZE.height);
  currentMode = 'idle';

  win = new BrowserWindow({
    ...IDLE_SIZE,
    ...idleBounds,
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
}

function createTray() {
  // A 16x16 transparent icon keeps the tray entry working without shipping binaries.
  tray = new Tray(nativeImage.createEmpty());
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
  tray.setToolTip('Guild Idler');
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
    // The guild menu opens centred on screen rather than anchored to the
    // companion's corner — confirmed as the preferred default: the hero stays
    // put bottom-right, but the menu is a separate, larger surface that reads
    // better centred than sprouting from a corner.
    const { workArea } = screen.getPrimaryDisplay();
    const pos = {
      x: Math.round(workArea.x + (workArea.width - MENU_SIZE.width) / 2),
      y: Math.round(workArea.y + (workArea.height - MENU_SIZE.height) / 2),
    };
    win.setBounds({ ...pos, ...MENU_SIZE }, false);
  } else {
    // Always return to the saved home position, never wherever the menu
    // window currently happens to be sitting.
    const home = idleBounds ?? bottomRight(IDLE_SIZE.width, IDLE_SIZE.height);
    const pos = clampToWorkArea(home.x, home.y, IDLE_SIZE.width, IDLE_SIZE.height);
    win.setBounds({ ...pos, ...IDLE_SIZE }, false);
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
