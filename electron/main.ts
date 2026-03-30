import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron';
import path from 'node:path';
import { startApiServer } from './api-server.js';

let mainWindow: BrowserWindow | null = null;
let apiPort: number | null = null;

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function getResourcesPath(): string {
  if (isDev) return app.getAppPath();
  return process.resourcesPath;
}

function getDistDir(): string {
  return path.join(app.getAppPath(), 'dist');
}

async function requestPermissions() {
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch (e) {
      console.warn('[dsplab] microphone permission request failed:', e);
    }
  }
}

async function createWindow() {
  const resourcesPath = getResourcesPath();
  // In production, serve static files from the dist directory through the API server
  const distDir = isDev ? undefined : getDistDir();
  apiPort = await startApiServer(resourcesPath, distDir);

  // Grant microphone and MIDI permissions automatically
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'midi', 'midiSysex', 'microphone'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'midi', 'midiSysex', 'microphone'];
    return allowed.includes(permission);
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DSPLab',
    backgroundColor: '#121212',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  ipcMain.handle('get-api-port', () => apiPort);

  const url = isDev && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `http://127.0.0.1:${apiPort}/`;

  // Retry loading in case the dev server isn't ready yet
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await mainWindow.loadURL(url);
      break;
    } catch (e) {
      if (attempt === 9) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  await requestPermissions();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
