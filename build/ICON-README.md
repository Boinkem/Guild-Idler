# App icon

Drop the real artwork in here, named exactly as below. Nothing else needs to
change -- `electron/main.ts` and `package.json`'s `build` block already point
at these paths (see `loadAppIcon()` in `electron/main.ts` for the runtime
window/taskbar icon, and the `build.win`/`build.mac`/`build.linux` sections
of `package.json` for the packaged installer/app icon).

| File | Used for | Size | Notes |
|-|-|-|-|
| `icon.png` | Runtime window/taskbar icon (Windows & Linux, live app), Linux packaged-app icon | 512x512 | Plain PNG, transparent background. Also what the tray icon falls back to using once present. |
| `icon.ico` | Windows packaged installer/exe icon | 256x256 source, multi-res | Needs to actually contain multiple resolutions embedded (16/32/48/256) for Windows to pick the sharpest one per context (taskbar vs. desktop shortcut vs. Explorer thumbnail) -- a single-size .ico will look soft in some of those. Most icon-conversion tools (e.g. an online png-to-ico converter, or `electron-icon-builder`) do this automatically from one square source PNG. |
| `icon.icns` | macOS packaged app/Dock icon | 1024x1024 source | Apple's multi-res icon container format. Same idea as .ico -- generate from a single 1024x1024 square PNG via `iconutil` (macOS-only CLI) or any icns conversion tool; don't hand-roll it. |

**Not needed to test the runtime window/taskbar icon on Windows/Linux** --
just `icon.png` and a normal `npm run dev`/`npm start`. The packaged
installer icon (`.ico`/`.icns`) only shows up after `npm run package`.

Until these files exist, everything falls back exactly to today's behavior
(Electron's own default icon, and the tray's blank 16x16 fallback) --
nothing errors or breaks with this folder empty.
