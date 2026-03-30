import { app, BrowserWindow, dialog, ipcMain, Menu, session, systemPreferences } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { startApiServer } from './api-server.js';

let mainWindow: BrowserWindow | null = null;
let apiPort: number | null = null;
let currentFilePath: string | null = null;
let recentFiles: string[] = [];

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// ── Window state persistence ──────────────────────────────────────────────────

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const RECENT_FILE = path.join(app.getPath('userData'), 'recent-files.json');

interface WindowState { x?: number; y?: number; width: number; height: number; maximized: boolean }

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch { /* ignore */ }
  return { width: 1400, height: 900, maximized: false };
}

function saveWindowState(win: BrowserWindow) {
  const bounds = win.getBounds();
  const state: WindowState = { ...bounds, maximized: win.isMaximized() };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* ignore */ }
}

function loadRecentFiles(): string[] {
  try {
    if (fs.existsSync(RECENT_FILE)) return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8'));
  } catch { /* ignore */ }
  return [];
}

function saveRecentFiles() {
  try { fs.writeFileSync(RECENT_FILE, JSON.stringify(recentFiles.slice(0, 10))); } catch { /* ignore */ }
}

function addRecentFile(filePath: string) {
  recentFiles = [filePath, ...recentFiles.filter(f => f !== filePath)].slice(0, 10);
  saveRecentFiles();
  buildMenu();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResourcesPath(): string {
  if (isDev) return app.getAppPath();
  return process.resourcesPath;
}

function getDistDir(): string {
  return path.join(app.getAppPath(), 'dist');
}

function sendToRenderer(event: string, data?: unknown) {
  mainWindow?.webContents.send('menu-event', event, data);
}

// ── Menu ──────────────────────────────────────────────────────────────────────

function buildMenu() {
  const recentSubmenu: Electron.MenuItemConstructorOptions[] = recentFiles.length > 0
    ? [
        ...recentFiles.map(f => ({
          label: path.basename(f),
          click: () => openFileByPath(f),
        })),
        { type: 'separator' as const },
        { label: 'Clear Recent', click: () => { recentFiles = []; saveRecentFiles(); buildMenu(); } },
      ]
    : [{ label: 'No Recent Files', enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('file:new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => handleFileOpen() },
        { label: 'Open Recent', submenu: recentSubmenu },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('file:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('file:save-as') },
        { type: 'separator' },
        { label: 'Export...', accelerator: 'CmdOrCtrl+E', click: () => sendToRenderer('file:export') },
        ...(process.platform !== 'darwin' ? [
          { type: 'separator' as const },
          { role: 'quit' as const },
        ] : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => sendToRenderer('view:toggle-sidebar') },
        { label: 'Toggle AI Panel', accelerator: 'CmdOrCtrl+Shift+A', click: () => sendToRenderer('view:toggle-ai') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => sendToRenderer('view:command-palette') },
        { type: 'separator' },
        { role: 'toggleDevTools' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Transport',
      submenu: [
        { label: 'Play / Stop', accelerator: 'CmdOrCtrl+Return', click: () => sendToRenderer('transport:toggle') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About DSPLab', click: () => {
          dialog.showMessageBox(mainWindow!, {
            type: 'info',
            title: 'About DSPLab',
            message: 'DSPLab — DSP Workbench',
            detail: 'A professional-grade DSP IDE and Prototyping Studio\nby syso (DatanoiseTV)\n\nVersion 1.0.0',
          });
        }},
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── File operations ───────────────────────────────────────────────────────────

async function handleFileOpen(): Promise<{ path: string; content: string } | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'Vult Files', extensions: ['vult'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return openFileByPath(filePath);
}

function openFileByPath(filePath: string): { path: string; content: string } | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    currentFilePath = filePath;
    addRecentFile(filePath);
    mainWindow?.setTitle(`DSPLab — ${path.basename(filePath)}`);
    sendToRenderer('file:opened', { path: filePath, content, name: path.basename(filePath, '.vult') });
    return { path: filePath, content };
  } catch (e) {
    dialog.showErrorBox('Open Failed', `Could not read file:\n${e}`);
    return null;
  }
}

async function handleFileSave(content: string): Promise<string | null> {
  if (!mainWindow) return null;
  if (currentFilePath) {
    fs.writeFileSync(currentFilePath, content, 'utf8');
    return currentFilePath;
  }
  return handleFileSaveAs(content);
}

async function handleFileSaveAs(content: string): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Vult Files', extensions: ['vult'] }],
    defaultPath: currentFilePath || 'untitled.vult',
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, content, 'utf8');
  currentFilePath = result.filePath;
  addRecentFile(result.filePath);
  mainWindow.setTitle(`DSPLab — ${path.basename(result.filePath)}`);
  return result.filePath;
}

async function handleExportZip(data: ArrayBuffer, defaultName: string): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    defaultPath: defaultName,
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, Buffer.from(data));
  return result.filePath;
}

// ── Permissions ───────────────────────────────────────────────────────────────

async function requestPermissions() {
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch (e) {
      console.warn('[dsplab] microphone permission request failed:', e);
    }
  }
}

// ── Window creation ───────────────────────────────────────────────────────────

async function createWindow() {
  const resourcesPath = getResourcesPath();
  const distDir = isDev ? undefined : getDistDir();
  apiPort = await startApiServer(resourcesPath, distDir);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'midi', 'midiSysex', 'microphone'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'midi', 'midiSysex', 'microphone'];
    return allowed.includes(permission);
  });

  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
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

  if (savedState.maximized) mainWindow.maximize();

  // Save window state on resize/move
  mainWindow.on('resize', () => { if (mainWindow) saveWindowState(mainWindow); });
  mainWindow.on('move', () => { if (mainWindow) saveWindowState(mainWindow); });

  // IPC handlers
  ipcMain.handle('get-api-port', () => apiPort);
  ipcMain.handle('file:open', () => handleFileOpen());
  ipcMain.handle('file:save', (_e, content: string) => handleFileSave(content));
  ipcMain.handle('file:save-as', (_e, content: string) => handleFileSaveAs(content));
  ipcMain.handle('file:export-zip', (_e, data: ArrayBuffer, name: string) => handleExportZip(data, name));
  ipcMain.handle('get-recent-files', () => recentFiles);

  const url = isDev && process.env.VITE_DEV_SERVER_URL
    ? process.env.VITE_DEV_SERVER_URL
    : `http://127.0.0.1:${apiPort}/`;

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

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  recentFiles = loadRecentFiles();
  buildMenu();
  await requestPermissions();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
