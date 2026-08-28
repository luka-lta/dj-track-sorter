// main/ipc-handlers.js
const { ipcMain, dialog } = require('electron');

function registerIpcHandlers(sidecar) {
  ipcMain.handle('dj:get-settings', () => sidecar.send('get_settings'));
  ipcMain.handle('dj:save-settings', (_e, settings) => sidecar.send('save_settings', { settings }));
  ipcMain.handle('dj:scan', () => sidecar.send('scan'));
  ipcMain.handle('dj:plan', (_e, params) => sidecar.send('plan', {
    genre_choices: params.genreChoices,
    selected_tracks: params.selectedTracks,
  }));
  ipcMain.handle('dj:execute', (_e, params) => sidecar.send('execute', {
    genre_choices: params.genreChoices,
    selected_tracks: params.selectedTracks,
  }));
  ipcMain.handle('dj:sync-genres', () => sidecar.send('sync_genres'));
  ipcMain.handle('dj:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

module.exports = { registerIpcHandlers };
