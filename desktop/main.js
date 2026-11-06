'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn } = require('child_process');

const licence = require('./lib/licence');
const users = require('./lib/users');
const paths = require('./lib/paths');
const updates = require('./lib/updates');

const SETTINGS_NAME = 'fot-desktop-settings.json';
const USERS_NAME = 'users.json';
const LICENCE_STORE = 'licence.json';
const SESSION_IDLE_MS = 15 * 60 * 1000;

let mainWindow = null;
let sessionUser = null;
let idleTimer = null;

function userDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

function documentsPath() {
  return app.getPath('documents');
}

function fotDirs() {
  return paths.ensureTree(documentsPath());
}

function settingsPath() { return userDataPath(SETTINGS_NAME); }
function usersPath() { return userDataPath(USERS_NAME); }
function licencePath() { return userDataPath(LICENCE_STORE); }
function publicKeyPath() {
  return path.join(__dirname, 'lib', 'fot-licence-public.pem');
}

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return {}; }
}
function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}

function loadLicenceStore() {
  try { return JSON.parse(fs.readFileSync(licencePath(), 'utf8')); }
  catch { return {}; }
}
function saveLicenceStore(s) {
  fs.writeFileSync(licencePath(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

function getPublicKey() {
  return licence.loadPublicKey(publicKeyPath());
}

function clockDate() {
  const store = loadLicenceStore();
  const sys = licence.todayUTC();
  const effective = licence.effectiveClock(sys, store.lastSeen);
  if (effective !== store.lastSeen) {
    store.lastSeen = effective;
    saveLicenceStore(store);
  }
  return effective;
}

function currentLicenceStatus() {
  const store = loadLicenceStore();
  if (!store.key) return { ok: false, reason: 'missing', canViewOld: true, canCreate: false };
  const v = licence.verifyLicence(getPublicKey(), store.key, clockDate());
  return {
    ...v,
    canCreate: !!v.ok,
    canViewOld: true,
    licensee: v.payload && v.payload.name,
    expires: v.payload && v.payload.expires,
    issued: v.payload && v.payload.issued
  };
}

function detectGoogleDriveCandidates() {
  const found = [];
  const seen = new Set();
  const push = (p) => {
    try {
      const n = path.normalize(p);
      if (!seen.has(n.toLowerCase()) && fs.existsSync(n) && fs.statSync(n).isDirectory()) {
        seen.add(n.toLowerCase());
        found.push(n);
      }
    } catch { /* ignore */ }
  };
  const home = process.env.USERPROFILE || process.env.HOME || '';
  [
    path.join(home, 'Google Drive', 'My Drive'),
    path.join(home, 'Google Drive'),
    'G:\\My Drive', 'H:\\My Drive', 'I:\\My Drive', 'D:\\My Drive', 'E:\\My Drive', 'F:\\My Drive'
  ].forEach(push);
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i) + ':\\';
    push(path.join(letter, 'My Drive'));
    push(path.join(letter, 'Google Drive', 'My Drive'));
  }
  return found;
}

function defaultReportsProposal() {
  const drives = detectGoogleDriveCandidates();
  if (drives.length) return path.join(drives[0], 'FOT Reports');
  return fotDirs().reports;
}

function webRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app-web');
  return path.join(__dirname, '..');
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function safeName(s) {
  return String(s || 'unknown').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

async function isFileReady(filePath) {
  for (let i = 0; i < 5; i++) {
    try {
      const st = await fsp.stat(filePath);
      if (st.size > 0) {
        const fh = await fsp.open(filePath, 'r');
        try {
          const buf = Buffer.alloc(Math.min(64, st.size));
          await fh.read(buf, 0, buf.length, 0);
          return true;
        } finally { await fh.close(); }
      }
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      throw e;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function readJsonFileSafe(filePath) {
  const ready = await isFileReady(filePath);
  if (!ready) return { ok: false, reason: 'not_synced', path: filePath };
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    if (!text.trim()) return { ok: false, reason: 'empty', path: filePath };
    return { ok: true, data: JSON.parse(text), path: filePath };
  } catch (e) {
    return { ok: false, reason: e.message || String(e), path: filePath };
  }
}

function reportsRootForUser() {
  const s = loadSettings();
  const root = s.reportsFolder || defaultReportsProposal();
  if (!sessionUser) return root;
  return paths.userReportsDir(root, sessionUser.username);
}

function requireSession() {
  if (!sessionUser) throw new Error('Not signed in');
  return sessionUser;
}

function resetIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    sessionUser = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:sessionLocked');
    }
  }, SESSION_IDLE_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'FOT Calculator',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(webRoot(), 'index.html'));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('before-input-event', () => resetIdle());
}

app.whenReady().then(() => {
  fotDirs();
  const s = loadSettings();
  if (!s.reportsFolder) {
    s.reportsFolderProposed = defaultReportsProposal();
    saveSettings(s);
  }
  clockDate();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC: info / licence / auth ---------- */
ipcMain.handle('desktop:getInfo', () => {
  const s = loadSettings();
  const dirs = fotDirs();
  const lic = currentLicenceStatus();
  const db = users.loadUsers(usersPath());
  return {
    isDesktop: true,
    version: app.getVersion(),
    reportsFolder: s.reportsFolder || null,
    reportsFolderProposed: s.reportsFolderProposed || defaultReportsProposal(),
    googleDriveCandidates: detectGoogleDriveCandidates(),
    userData: app.getPath('userData'),
    fotRoot: dirs.root,
    documentsTree: dirs,
    licence: {
      ok: !!lic.ok,
      expired: !!lic.expired,
      reason: lic.reason,
      licensee: lic.licensee || null,
      expires: lic.expires || null,
      issued: lic.issued || null,
      daysLeft: lic.daysLeft,
      warn: !!lic.warn,
      canCreate: !!lic.canCreate,
      canViewOld: true
    },
    session: sessionUser,
    needsAdminSetup: !(db.users && db.users.length),
    users: (db.users || []).map(u => ({ username: u.username, displayName: u.displayName, role: u.role }))
  };
});

ipcMain.handle('desktop:activateLicence', (_e, keyText) => {
  const v = licence.verifyLicence(getPublicKey(), keyText, clockDate());
  if (!v.ok && v.reason !== 'expired') {
    return { ok: false, reason: v.reason };
  }
  // Allow activating even if already expired so user can view old; but canCreate false
  const store = loadLicenceStore();
  store.key = String(keyText).trim().replace(/\s+/g, '');
  store.activatedAt = new Date().toISOString();
  saveLicenceStore(store);
  // Also copy into Documents\FOT Calculator\Licences for the owner
  try {
    const dest = path.join(fotDirs().licences, 'active-licence.txt');
    fs.writeFileSync(dest, store.key + '\n', { mode: 0o600 });
  } catch { /* ignore */ }
  return { ok: true, status: currentLicenceStatus() };
});

ipcMain.handle('desktop:setupAdmin', (_e, { username, password, displayName }) => {
  const db = users.loadUsers(usersPath());
  if (db.users && db.users.length) return { ok: false, reason: 'already_setup' };
  users.createAdmin(db, username, password, displayName);
  users.saveUsers(usersPath(), db);
  const auth = users.authenticate(db, username, password);
  sessionUser = auth.user;
  resetIdle();
  ensureDir(reportsRootForUser());
  return { ok: true, user: sessionUser };
});

ipcMain.handle('desktop:login', (_e, { username, password }) => {
  const db = users.loadUsers(usersPath());
  const auth = users.authenticate(db, username, password);
  if (!auth.ok) return auth;
  sessionUser = auth.user;
  resetIdle();
  ensureDir(reportsRootForUser());
  return { ok: true, user: sessionUser, licence: currentLicenceStatus() };
});

ipcMain.handle('desktop:logout', () => {
  sessionUser = null;
  if (idleTimer) clearTimeout(idleTimer);
  return { ok: true };
});

ipcMain.handle('desktop:touchSession', () => {
  if (sessionUser) resetIdle();
  return { ok: !!sessionUser, user: sessionUser };
});

ipcMain.handle('desktop:listUsers', () => {
  requireSession();
  const db = users.loadUsers(usersPath());
  return (db.users || []).map(u => ({ username: u.username, displayName: u.displayName, role: u.role }));
});

ipcMain.handle('desktop:addUser', (_e, payload) => {
  const actor = requireSession();
  if (actor.role !== 'admin') throw new Error('Admin only');
  const db = users.loadUsers(usersPath());
  users.addUser(db, payload, true);
  users.saveUsers(usersPath(), db);
  return { ok: true };
});

ipcMain.handle('desktop:removeUser', (_e, username) => {
  const actor = requireSession();
  if (actor.role !== 'admin') throw new Error('Admin only');
  const db = users.loadUsers(usersPath());
  users.removeUser(db, username, actor.username);
  users.saveUsers(usersPath(), db);
  return { ok: true };
});

ipcMain.handle('desktop:resetPassword', (_e, { username, newPassword }) => {
  const actor = requireSession();
  if (actor.role !== 'admin') throw new Error('Admin only');
  const db = users.loadUsers(usersPath());
  users.resetPassword(db, username, newPassword, true);
  users.saveUsers(usersPath(), db);
  return { ok: true, note: 'Reports are not encrypted; password reset does not affect saved reports.' };
});

/* ---------- Reports folder ---------- */
ipcMain.handle('desktop:setReportsFolder', async (_e, folder) => {
  requireSession();
  if (!folder || typeof folder !== 'string') throw new Error('Invalid folder');
  ensureDir(folder);
  const s = loadSettings();
  s.reportsFolder = folder;
  saveSettings(s);
  ensureDir(reportsRootForUser());
  return { reportsFolder: folder };
});

ipcMain.handle('desktop:pickReportsFolder', async () => {
  requireSession();
  const s = loadSettings();
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose FOT Reports folder',
    defaultPath: s.reportsFolder || s.reportsFolderProposed || defaultReportsProposal(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const folder = res.filePaths[0];
  ensureDir(folder);
  s.reportsFolder = folder;
  saveSettings(s);
  ensureDir(reportsRootForUser());
  return { canceled: false, reportsFolder: folder };
});

ipcMain.handle('desktop:acceptProposedFolder', async () => {
  requireSession();
  const s = loadSettings();
  const folder = s.reportsFolderProposed || defaultReportsProposal();
  ensureDir(folder);
  s.reportsFolder = folder;
  saveSettings(s);
  ensureDir(reportsRootForUser());
  return { reportsFolder: folder };
});

ipcMain.handle('desktop:writeTest', async (_e, payload) => {
  requireSession();
  const lic = currentLicenceStatus();
  if (!lic.canCreate) throw new Error('Licence expired or missing — viewing old reports only; new tests blocked.');
  const folder = reportsRootForUser();
  ensureDir(folder);
  const pt = safeName(payload.patientId || payload.ptId || payload.ptName || 'patient');
  const date = safeName(payload.testDate || new Date().toISOString().slice(0, 10));
  const id = safeName(payload.id || ('t_' + Date.now()));
  const base = `${pt}_${date}_${id}`;
  const jsonPath = path.join(folder, base + '.json');
  const pdfPath = path.join(folder, base + '.pdf');
  const record = Object.assign({}, payload.record || payload, {
    id: payload.id || (payload.record && payload.record.id),
    updatedAt: (payload.record && payload.record.updatedAt) || new Date().toISOString(),
    savedAt: (payload.record && payload.record.savedAt) || new Date().toISOString(),
    _owner: sessionUser.username
  });
  await fsp.writeFile(jsonPath, JSON.stringify(record, null, 2), 'utf8');
  let wrotePdf = false;
  if (payload.pdfBase64) {
    await fsp.writeFile(pdfPath, Buffer.from(payload.pdfBase64, 'base64'));
    wrotePdf = true;
  }
  return { jsonPath, pdfPath: wrotePdf ? pdfPath : null, base, folder };
});

ipcMain.handle('desktop:listReports', async () => {
  requireSession();
  const folder = reportsRootForUser();
  if (!folder || !fs.existsSync(folder)) {
    return { folder: folder || null, records: [], skipped: [], error: folder ? null : 'no_folder' };
  }
  let names;
  try { names = await fsp.readdir(folder); }
  catch (e) { return { folder, records: [], skipped: [], error: e.message }; }
  const records = [];
  const skipped = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const fp = path.join(folder, name);
    const res = await readJsonFileSafe(fp);
    if (!res.ok) { skipped.push({ file: name, reason: res.reason }); continue; }
    const data = res.data;
    if (data && data.format === 'fot-calc-backup' && data.data) {
      skipped.push({ file: name, reason: 'backup_envelope_use_import' });
      continue;
    }
    if (data && data.id) records.push(data);
    else skipped.push({ file: name, reason: 'not_a_test_record' });
  }
  return { folder, records, skipped };
});

ipcMain.handle('desktop:openReportsFolder', async () => {
  requireSession();
  const folder = reportsRootForUser();
  ensureDir(folder);
  await shell.openPath(folder);
  return { ok: true, folder };
});

/* ---------- Updates ---------- */
ipcMain.handle('desktop:checkUpdates', async () => {
  const current = app.getVersion();
  const latest = await updates.fetchLatestDesktopRelease();
  if (!latest) return { current, latest: null, updateAvailable: false };
  return {
    current,
    latest,
    updateAvailable: updates.cmpSemver(latest.version, current) > 0
  };
});

ipcMain.handle('desktop:downloadUpdate', async (_e, { url, version, exeName, shaUrl }) => {
  requireSession();
  const dirs = fotDirs();
  const dateStr = new Date().toISOString().slice(0, 10);
  const destDir = updates.localUpdatePath(dirs.updates, version, dateStr);
  ensureDir(destDir);
  const name = exeName || path.basename(new URL(url).pathname);
  const destFile = path.join(destDir, name);
  const res = await fetch(url, { headers: { 'User-Agent': 'FOT-Calculator-Desktop' } });
  if (!res.ok) throw new Error('Download failed: HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (shaUrl) {
    const shaRes = await fetch(shaUrl, { headers: { 'User-Agent': 'FOT-Calculator-Desktop' } });
    if (shaRes.ok) {
      const shaText = await shaRes.text();
      const expected = updates.parseSha256File(shaText, name);
      const actual = updates.sha256Buffer(buf);
      if (expected && expected !== actual) {
        throw new Error('SHA-256 mismatch — download aborted');
      }
    }
  }
  await fsp.writeFile(destFile, buf);
  // write local sha
  await fsp.writeFile(destFile + '.sha256', updates.sha256Buffer(buf) + '  ' + name + '\n');
  return { path: destFile, dir: destDir, sha256: updates.sha256Buffer(buf) };
});

ipcMain.handle('desktop:installUpdate', async (_e, installerPath) => {
  requireSession();
  if (!installerPath || !fs.existsSync(installerPath)) throw new Error('Installer not found');
  // Launch NSIS installer and quit so files can be replaced
  spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
});

ipcMain.handle('desktop:installFromFile', async () => {
  requireSession();
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Install update from file',
    filters: [{ name: 'Installer', extensions: ['exe'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const src = res.filePaths[0];
  const dirs = fotDirs();
  const dateStr = new Date().toISOString().slice(0, 10);
  // Try to parse version from filename
  const m = path.basename(src).match(/(\d+\.\d+\.\d+)/);
  const ver = m ? m[1] : 'local';
  const destDir = updates.localUpdatePath(dirs.updates, ver, dateStr);
  ensureDir(destDir);
  const dest = path.join(destDir, path.basename(src));
  await fsp.copyFile(src, dest);
  return { canceled: false, path: dest, dir: destDir };
});

ipcMain.handle('desktop:shareUpdate', async () => {
  requireSession();
  const dirs = fotDirs();
  ensureDir(dirs.updates);
  await shell.openPath(dirs.updates);
  return { ok: true, folder: dirs.updates };
});

ipcMain.handle('desktop:openFotRoot', async () => {
  const dirs = fotDirs();
  await shell.openPath(dirs.root);
  return { ok: true, folder: dirs.root };
});
