const { platform, arch } = process

/** @typedef {typeof import('./client.d')} Client */
/** @type {Client | undefined} */
let nativeBinding = undefined
/** @type {Error | undefined} */
let loadError = undefined

// Wrapped in try/catch (patch: Guildbound leaderboard fork) -- a missing
// platform .node used to throw straight out of this top-level require(),
// which crashes the ENTIRE importing process before any of its own
// try/catch ever runs (Guildbound's electron/main.ts only wraps the
// later `steamworks.init()` call, not this module's own import). Caught
// here instead and re-thrown lazily, from inside init() below, so a
// missing platform build degrades exactly the same way "Steam isn't
// running" already does for every consumer of this package -- not a
// process crash.
try {
    if (platform === 'win32' && arch === 'x64') {
        nativeBinding = require('./dist/win64/steamworksjs.win32-x64-msvc.node')
    } else if (platform === 'linux' && arch === 'x64') {
        nativeBinding = require('./dist/linux64/steamworksjs.linux-x64-gnu.node')
    } else if (platform === 'darwin') {
        if (arch === 'x64') {
            nativeBinding = require('./dist/osx/steamworksjs.darwin-x64.node')
        } else if (arch === 'arm64') {
            nativeBinding = require('./dist/osx/steamworksjs.darwin-arm64.node')
        }
    } else {
        throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`)
    }
} catch (err) {
    loadError = err
}

let runCallbacksInterval = undefined

/**
 * Initialize the steam client or throw an error if it fails
 * @param {number} [appId] - App ID of the game to load, if undefined, will search for a steam_appid.txt file
 * @returns {Omit<Client, 'init' | 'runCallbacks'>}
*/
module.exports.init = (appId) => {
    if (!nativeBinding) {
        // Surfaced here, not at import time -- see the try/catch above.
        // Every existing caller already wraps init() in its own
        // try/catch (achievements/DLC's own graceful "Steam not
        // available" path), so this reaches the exact same handling a
        // real "Steam isn't running" failure already does, rather than
        // needing its own special case.
        throw loadError ?? new Error(`No native binding available for ${platform}/${arch}`)
    }

    const { init: internalInit, runCallbacks, restartAppIfNecessary, ...api } = nativeBinding

    internalInit(appId)

    clearInterval(runCallbacksInterval)
    runCallbacksInterval = setInterval(runCallbacks, 1000 / 30)

    return api
}

/**
 * @param {number} appId - App ID of the game to load
 * {@link https://partner.steamgames.com/doc/api/steam_api#SteamAPI_RestartAppIfNecessary}
 * @returns {boolean} 
 */
module.exports.restartAppIfNecessary = (appId) => {
    if (!nativeBinding) throw loadError ?? new Error(`No native binding available for ${platform}/${arch}`)
    return nativeBinding.restartAppIfNecessary(appId)
};

/**
 * Enable the steam overlay on electron
 * @param {boolean} [disableEachFrameInvalidation] - Should attach a single pixel to be rendered each frame
*/
module.exports.electronEnableSteamOverlay = (disableEachFrameInvalidation) => {
    const electron = require('electron')
    if (!electron) {
        throw new Error('Electron module not found')
    }

    electron.app.commandLine.appendSwitch('in-process-gpu')
    electron.app.commandLine.appendSwitch('disable-direct-composition')

    if (!disableEachFrameInvalidation) {
        /** @param {electron.BrowserWindow} browserWindow */
        const attachFrameInvalidator = (browserWindow) => {
            browserWindow.steamworksRepaintInterval = setInterval(() => {
                if (browserWindow.isDestroyed()) {
                    clearInterval(browserWindow.steamworksRepaintInterval)
                } else if (!browserWindow.webContents.isPainting()) {
                    browserWindow.webContents.invalidate()
                }
            }, 1000 / 60)
        }

        electron.BrowserWindow.getAllWindows().forEach(attachFrameInvalidator)
        electron.app.on('browser-window-created', (_, bw) => attachFrameInvalidator(bw))
    }
}

// Guarded (was a bare top-level access) -- would otherwise throw at
// import time exactly like the require() calls above used to, silently
// re-defeating the whole point of wrapping those in try/catch. A
// consumer only ever touches SteamCallback after a successful init()
// anyway, so undefined here (nativeBinding missing) is safe -- nothing
// reaches it without init() having already thrown first.
const SteamCallback = nativeBinding ? nativeBinding.callback.SteamCallback : undefined
module.exports.SteamCallback = SteamCallback