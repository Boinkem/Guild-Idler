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
  setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:setAlwaysOnTop', value),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:getAlwaysOnTop'),
  setLocked: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:setLocked', value),
  getLocked: (): Promise<boolean> => ipcRenderer.invoke('window:getLocked'),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  quit: (): Promise<void> => ipcRenderer.invoke('window:quit'),
  unlockAchievement: (steamApiName: string): Promise<boolean> => ipcRenderer.invoke('steam:unlockAchievement', steamApiName),
};

contextBridge.exposeInMainWorld('littleKnight', api);

export type LittleKnightApi = typeof api;
