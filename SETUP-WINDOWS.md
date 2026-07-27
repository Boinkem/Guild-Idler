# Getting Guild Idler running on Windows

## What the error means

```
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
    at getElectronPath (...\node_modules\electron\index.js:17:11)
```

When you run `npm install`, the `electron` package downloads roughly 100 MB of prebuilt binary as a **postinstall step**, separately from the npm package itself. That download failed, so `node_modules/electron/` contains the JavaScript wrapper but no actual `electron.exe`.

`getElectronPath()` reads a file called `path.txt` that only exists after a successful download. It's missing, hence the error.

Nothing is wrong with the game code — this happens before any of it runs.

---

## Step 1 — Check your Node version first

Your log shows **Node.js v24.16.0**. Electron 33 was released well before Node 24 and its install script is not tested against it. This is the single most likely cause.

```powershell
node -v
```

If it starts with `v24`, install Node 20 LTS or 22 LTS and use that instead. The easiest route on Windows is [nvm-windows](https://github.com/coreybutler/nvm-windows/releases):

```powershell
nvm install 22.11.0
nvm use 22.11.0
node -v          # should print v22.11.0
```

Then jump to Step 3.

---

## Step 2 — Confirm postinstall scripts aren't disabled

Some setups (corporate machines, security policies, a stray `.npmrc`) globally disable the scripts Electron needs:

```powershell
npm config get ignore-scripts
```

If it prints `true`, that alone explains the failure:

```powershell
npm config set ignore-scripts false
```

---

## Step 3 — Clean reinstall

Open **PowerShell** in `C:\little-knight` and run:

```powershell
cd C:\little-knight

Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue

# Clear the cached (possibly half-downloaded) Electron binary
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron\Cache" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache" -ErrorAction SilentlyContinue

npm cache clean --force
npm install --foreground-scripts
```

`--foreground-scripts` is the important part: it prints the Electron download progress and the real error if it fails again, instead of swallowing it.

If you're in Git Bash rather than PowerShell, the equivalent is:

```bash
cd /c/little-knight
rm -rf node_modules package-lock.json
rm -rf "$LOCALAPPDATA/electron/Cache" "$LOCALAPPDATA/electron-builder/Cache"
npm cache clean --force
npm install --foreground-scripts
```

---

## Step 4 — Verify Electron actually landed

```powershell
Test-Path node_modules\electron\path.txt      # must be True
Test-Path node_modules\electron\dist\electron.exe   # must be True
npx electron -v                                # should print v33.x.x
```

If all three are good, you're done — go to Step 6.

---

## Step 5 — If the download is still failing

This is almost always a network issue: corporate proxy, VPN, firewall, or antivirus blocking the GitHub release download.

**Behind a proxy or mirror:**

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install --foreground-scripts
```

**Antivirus:** temporarily allow `C:\little-knight\node_modules\electron\` — some scanners quarantine `electron.exe` the moment it's extracted, which produces this exact error.

**Manual install** (last resort, and reliable): download `electron-v33.2.0-win32-x64.zip` from the [Electron releases page](https://github.com/electron/electron/releases/tag/v33.2.0), then:

1. Extract it into `C:\little-knight\node_modules\electron\dist\`
2. Create a file `C:\little-knight\node_modules\electron\path.txt` containing exactly one line: `electron.exe`
3. Run `npx electron -v` to confirm

---

## Step 6 — Run the game

```powershell
cd C:\little-knight
npm run dev
```

A small transparent window with the knight appears in the bottom-right of your screen. Click him to open the guild menu.

To build and run without the dev server:

```powershell
npm start
```

---

## Meanwhile: play it in a browser right now

You don't have to wait for Electron. The renderer detects that it isn't running in Electron and falls back to `localStorage` for saves, so the entire game works in a browser tab:

```powershell
cd C:\little-knight
npm run dev:web
```

This opens `http://localhost:5173` with no Electron dependency at all. Everything works — quests, offline progression, saves, prestige. The only dead controls are the three that need a real window: **Hide**, **On top**, and **Where is my save?**.

Note that the browser save (`localStorage`) and the Electron save (a JSON file in `%APPDATA%`) are **separate**. To carry progress across, use the Statistics tab once export/import is wired to a button, or copy it via the devtools console:

```js
// in the browser, to copy your save out
copy(localStorage.getItem('little-knight-save'))
```

---

## Quick reference

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (downloads Electron binary) |
| `npm run dev` | Dev server + Electron window, hot reload |
| `npm run dev:web` | Dev server in a browser tab, no Electron |
| `npm start` | Production build, then launch Electron |
| `npm run package` | Build a Windows installer into `release/` |

---

## If it still won't go

Run this and share the output — it narrows things down fast:

```powershell
node -v
npm -v
npm config get ignore-scripts
npm config get proxy
Test-Path node_modules\electron\path.txt
```
