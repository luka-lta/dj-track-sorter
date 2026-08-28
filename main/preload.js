// main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  getSettings: () => ipcRenderer.invoke('dj:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('dj:save-settings', settings),
  scan: () => ipcRenderer.invoke('dj:scan'),
  plan: (params) => ipcRenderer.invoke('dj:plan', params),
  execute: (params) => ipcRenderer.invoke('dj:execute', params),
  syncGenres: () => ipcRenderer.invoke('dj:sync-genres'),
  pickFolder: () => ipcRenderer.invoke('dj:pick-folder'),
  onSidecarCrash: (callback) => ipcRenderer.on('dj:sidecar-crash', (_e, code) => callback(code)),
});
