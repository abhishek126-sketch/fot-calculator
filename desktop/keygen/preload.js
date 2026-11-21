'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('keygen', {
  status: () => ipcRenderer.invoke('keygen:status'),
  preview: (p) => ipcRenderer.invoke('keygen:preview', p),
  issue: (p) => ipcRenderer.invoke('keygen:issue', p),
  copy: (t) => ipcRenderer.invoke('keygen:copy', t),
  openLicences: () => ipcRenderer.invoke('keygen:openLicences')
});
