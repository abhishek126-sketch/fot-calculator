'use strict';
/* FOT Key Generator 2.0 - PRIVATE tool for Dr Abhishek Singh. Issues FOT2 monthly subscription keys bound to one
 * computer. The private signing key is NOT inside this program: it is read at run time from the private keys folder
 * (OneDrive\Documents\FOT-Publisher-Keys\fot-licence-private-v2.pem), so a copied Key Generator is useless alone. */
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const licence = require('./lib/licence');

const KEY_FILE = 'fot-licence-private-v2.pem';

function keyDirCandidates() {
  const home = os.homedir();
  return [
    process.env.FOT_KEYS_DIR,
    process.env.OneDrive && path.join(process.env.OneDrive, 'Documents', 'FOT-Publisher-Keys'),
    path.join(home, 'OneDrive', 'Documents', 'FOT-Publisher-Keys'),
    path.join(app.getPath('documents'), 'FOT-Publisher-Keys'),
    path.join(home, 'Documents', 'FOT-Publisher-Keys')
  ].filter(Boolean);
}
function privateKeyPath() {
  for (const d of keyDirCandidates()) { const p = path.join(d, KEY_FILE); if (fs.existsSync(p)) return p; }
  return null;
}
function privateKey() {
  const p = privateKeyPath();
  if (!p) throw new Error('Private key not found. Expected ' + KEY_FILE + ' in: ' + keyDirCandidates().join(' ; '));
  return licence.loadPrivateKey(p);
}

function licencesDir() {
  const dir = path.join(app.getPath('documents'), 'FOT Calculator', 'Licences');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function createWindow() {
  const win = new BrowserWindow({
    width: 720, height: 760, title: 'FOT Key Generator (private)',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('keygen:status', () => ({ keyFound: !!privateKeyPath(), keyPath: privateKeyPath(), months: licence.MONTH_CHOICES, today: licence.todayUTC() }));

ipcMain.handle('keygen:preview', (_e, { months, start }) => {
  const s = start || licence.todayUTC();
  const exp = licence.addMonths(s, Number(months) || 1);
  return { start: s, lastDay: licence.daysFrom(exp, -1) };
});

ipcMain.handle('keygen:issue', (_e, { name, machine, months, start, amount, notes }) => {
  const { key, payload } = licence.issueSubscription(privateKey(), { name, machine, months: Number(months), start: start || undefined });
  const lastDay = licence.lastValidDay(payload);
  const dir = licencesDir();
  const safe = payload.name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_');
  const txtPath = path.join(dir, `${safe}_${payload.machine}_${payload.issued}_${payload.months}m.txt`);
  fs.writeFileSync(txtPath, [
    'FOT Calculator subscription key',
    'Doctor:        ' + payload.name,
    'Computer code: ' + payload.machine,
    'Valid:         ' + payload.issued + ' to ' + lastDay + ' (' + payload.months + ' month' + (payload.months > 1 ? 's' : '') + ')',
    amount ? 'Amount:        Rs ' + amount : null,
    notes ? 'Notes:         ' + notes : null,
    '',
    'Key (copy the whole line into FOT Calculator > Activate):',
    key, ''
  ].filter(x => x !== null).join('\r\n'));
  const logPath = path.join(dir, 'issued-keys.csv');
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, 'issued_on,doctor,computer_code,start,last_day,months,amount_rs,notes,key_id,file\r\n');
  fs.appendFileSync(logPath, [licence.todayUTC(), payload.name, payload.machine, payload.issued, lastDay, payload.months,
    amount || '', notes || '', payload.id, path.basename(txtPath)].map(csvCell).join(',') + '\r\n');
  return { key, payload, lastDay, file: txtPath };
});

ipcMain.handle('keygen:copy', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
ipcMain.handle('keygen:openLicences', async () => { const d = licencesDir(); await shell.openPath(d); return { folder: d }; });
