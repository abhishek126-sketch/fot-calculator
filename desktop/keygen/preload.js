'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('keygen', {
  issue: (p) => ipcRenderer.invoke('keygen:issue', p),
  openLicences: () => ipcRenderer.invoke('keygen:openLicences')
});
