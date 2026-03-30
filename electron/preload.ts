import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dsplab', {
  isElectron: true,

  // File operations
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (content: string) => ipcRenderer.invoke('file:save', content),
  saveFileAs: (content: string) => ipcRenderer.invoke('file:save-as', content),
  exportZip: (data: ArrayBuffer, defaultName: string) => ipcRenderer.invoke('file:export-zip', data, defaultName),

  // Window
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),

  // Menu events → renderer
  onMenuEvent: (callback: (event: string, data?: unknown) => void) => {
    const handler = (_e: unknown, event: string, data?: unknown) => callback(event, data);
    ipcRenderer.on('menu-event', handler);
    return () => { ipcRenderer.removeListener('menu-event', handler); };
  },
});
