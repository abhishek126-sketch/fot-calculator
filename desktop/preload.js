'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fotDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('desktop:getInfo'),
  setReportsFolder: (folder) => ipcRenderer.invoke('desktop:setReportsFolder', folder),
  pickReportsFolder: () => ipcRenderer.invoke('desktop:pickReportsFolder'),
  acceptProposedFolder: () => ipcRenderer.invoke('desktop:acceptProposedFolder'),
  writeTest: (payload) => ipcRenderer.invoke('desktop:writeTest', payload),
  listReports: () => ipcRenderer.invoke('desktop:listReports'),
  openReportsFolder: () => ipcRenderer.invoke('desktop:openReportsFolder')
});
