import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Window sizes. The idle companion is tiny; the menu needs room. */
const IDLE_SIZE = { width: 260, height: 300 };
const MENU_SIZE = { width: 900, height: 620 };

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let alwaysOnTop = true;

const userDataDir = () => app.getPath('userData');
const savePath = () => path.join(userDataDir(), 'little-knight-save.json');
const backupPath = () => path.join(userDataDir(), 'little-knight-save.backup.json');
const settingsPath = () => path.join(userDataDir(), 'little-knight-settings.json');

type Settings = { alwaysOnTop: boolean; x?: number; y?: number };

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Settings;
  } catch {
    return { alwaysOnTop: true };
  }
}

async function writeSettings(next: Settings) {
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
}

function bottomRight(width: number, height: number) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24),
  };
}

async function createWindow() {
  const settings = await readSettings();
  alwaysOnTop = settings.alwaysOnTop ?? true;

  const pos = settings.x != null && settings.y != null
    ? { x: settings.x, y: settings.y }
    : bottomRight(IDLE_SIZE.width, IDLE_SIZE.height);

  win = new BrowserWindow({
    ...IDLE_SIZE,
    ...pos,
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

  win.setAlwaysOnTop(alwaysOnTop, 'floating');
  // Keep the companion visible when the user switches virtual desktops.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('moved', async () => {
    if (!win) return;
    const [x, y] = win.getPosition();
    await writeSettings({ alwaysOnTop, x, y });
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
        win?.setAlwaysOnTop(alwaysOnTop, 'floating');
        void writeSettings({ alwaysOnTop });
      },
    },
    { label: 'Show knight', click: () => win?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('Little Knight');
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
  const size = mode === 'menu' ? MENU_SIZE : IDLE_SIZE;
  const [curX, curY] = win.getPosition();
  const [curW, curH] = win.getSize();
  // Grow from the bottom-right corner so the knight stays put.
  const anchorX = curX + curW;
  const anchorY = curY + curH;
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x, Math.min(anchorX - size.width, workArea.x + workArea.width - size.width));
  const y = Math.max(workArea.y, Math.min(anchorY - size.height, workArea.y + workArea.height - size.height));
  win.setBounds({ x, y, ...size }, false);
});

ipcMain.handle('window:setAlwaysOnTop', (_e, value: boolean) => {
  alwaysOnTop = value;
  win?.setAlwaysOnTop(value, 'floating');
  void writeSettings({ alwaysOnTop: value });
  return value;
});

ipcMain.handle('window:getAlwaysOnTop', () => alwaysOnTop);
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:quit', () => app.quit());

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
