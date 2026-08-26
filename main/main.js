// main/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { Sidecar } = require('./sidecar');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow;
let sidecar;

function sidecarCommand() {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return { command: path.join(process.resourcesPath, 'sidecar', `dj-sorter-sidecar${ext}`), args: [] };
  }
  return { command: 'python3', args: [path.join(__dirname, '..', 'backend', 'main.py')] };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

function startSidecar() {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  // Dieselbe Sidecar-Instanz wiederverwenden, falls vorhanden, damit die in
  // registerIpcHandlers() erzeugten Closures weiterhin auf das richtige
  // Objekt zeigen, wenn der Prozess nach einem Neustart neu gestartet wird.
  if (!sidecar) {
    const { command, args } = sidecarCommand();
    sidecar = new Sidecar(command, args);
    sidecar.on('crash', (code) => {
      if (mainWindow) mainWindow.webContents.send('dj:sidecar-crash', code);
    });
  }
  sidecar.start(settingsPath);
}

app.whenReady().then(() => {
  startSidecar();
  registerIpcHandlers(sidecar);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!sidecar || !sidecar.process) startSidecar();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (sidecar) sidecar.stop();
  if (process.platform !== 'darwin') app.quit();
});
