// main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  getSettings: () => ipcRenderer.invoke('dj:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('dj:save-settings', settings),
  scan: () => ipcRenderer.invoke('dj:scan'),
  plan: (genreChoices) => ipcRenderer.invoke('dj:plan', genreChoices),
  execute: (genreChoices) => ipcRenderer.invoke('dj:execute', genreChoices),
  pickFolder: () => ipcRenderer.invoke('dj:pick-folder'),
  onSidecarCrash: (callback) => ipcRenderer.on('dj:sidecar-crash', (_e, code) => callback(code)),
});
