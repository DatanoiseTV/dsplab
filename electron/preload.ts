import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('dsplab', {
  isElectron: true,
});
