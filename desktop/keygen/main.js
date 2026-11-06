'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const licence = require('./lib/licence');

function documentsFot() {
  const root = path.join(app.getPath('documents'), 'FOT Calculator');
  const licences = path.join(root, 'Licences');
  fs.mkdirSync(licences, { recursive: true });
  return { root, licences };
}

function privateKey() {
  const embedded = path.join(__dirname, 'embedded-private.pem');
  const res = path.join(process.resourcesPath || '', 'embedded-private.pem');
  const p = fs.existsSync(embedded) ? embedded : res;
  return licence.loadPrivateKey(p);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 560,
    title: 'FOT Key Generator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('keygen:issue', (_e, { name, notes }) => {
  if (!name || !String(name).trim()) throw new Error('Doctor name required');
  const { key, payload } = licence.issueLicence(privateKey(), { name, notes });
  const { licences } = documentsFot();
  const safe = String(name).trim().replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_');
  const txtPath = path.join(licences, `${safe}_${payload.issued}.txt`);
  const body = [
    'FOT Calculator licence key',
    'Licensee: ' + payload.name,
    'Issued:   ' + payload.issued,
    'Expires:  ' + payload.expires + ' (1 year)',
    notes ? 'Notes:    ' + notes : null,
    '',
    key,
    ''
  ].filter(x => x !== null).join('\n');
  fs.writeFileSync(txtPath, body, { mode: 0o600 });
  // Append CSV log
  const logPath = path.join(licences, 'issued-keys.csv');
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, 'issued,expires,name,notes,file\n');
  }
  const notesCsv = '"' + String(notes || '').replace(/"/g, '""') + '"';
  fs.appendFileSync(logPath, `${payload.issued},${payload.expires},"${payload.name.replace(/"/g, '""')}",${notesCsv},${path.basename(txtPath)}\n`);
  return { key, payload, file: txtPath };
});

ipcMain.handle('keygen:openLicences', async () => {
  const { licences } = documentsFot();
  await shell.openPath(licences);
  return { ok: true, folder: licences };
});
