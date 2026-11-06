'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fotDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('desktop:getInfo'),
  activateLicence: (key) => ipcRenderer.invoke('desktop:activateLicence', key),
  setupAdmin: (p) => ipcRenderer.invoke('desktop:setupAdmin', p),
  login: (p) => ipcRenderer.invoke('desktop:login', p),
  logout: () => ipcRenderer.invoke('desktop:logout'),
  touchSession: () => ipcRenderer.invoke('desktop:touchSession'),
  listUsers: () => ipcRenderer.invoke('desktop:listUsers'),
  addUser: (p) => ipcRenderer.invoke('desktop:addUser', p),
  removeUser: (u) => ipcRenderer.invoke('desktop:removeUser', u),
  resetPassword: (p) => ipcRenderer.invoke('desktop:resetPassword', p),
  setReportsFolder: (folder) => ipcRenderer.invoke('desktop:setReportsFolder', folder),
  pickReportsFolder: () => ipcRenderer.invoke('desktop:pickReportsFolder'),
  acceptProposedFolder: () => ipcRenderer.invoke('desktop:acceptProposedFolder'),
  writeTest: (payload) => ipcRenderer.invoke('desktop:writeTest', payload),
  listReports: () => ipcRenderer.invoke('desktop:listReports'),
  openReportsFolder: () => ipcRenderer.invoke('desktop:openReportsFolder'),
  checkUpdates: () => ipcRenderer.invoke('desktop:checkUpdates'),
  downloadUpdate: (p) => ipcRenderer.invoke('desktop:downloadUpdate', p),
  installUpdate: (p) => ipcRenderer.invoke('desktop:installUpdate', p),
  installFromFile: () => ipcRenderer.invoke('desktop:installFromFile'),
  shareUpdate: () => ipcRenderer.invoke('desktop:shareUpdate'),
  openFotRoot: () => ipcRenderer.invoke('desktop:openFotRoot'),
  onSessionLocked: (cb) => ipcRenderer.on('desktop:sessionLocked', () => cb())
});
