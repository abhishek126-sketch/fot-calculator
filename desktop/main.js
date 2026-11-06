'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const SETTINGS_NAME = 'fot-desktop-settings.json';
let mainWindow = null;

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_NAME);
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}

function webRoot() {
  // Packaged: extraResources/app-web; dev: parent of desktop/
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app-web');
  }
  return path.join(__dirname, '..');
}

/** Detect Google Drive for Desktop "My Drive" folders on Windows (and common Linux/Mac paths for dev). */
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
  const candidates = [
    path.join(home, 'Google Drive', 'My Drive'),
    path.join(home, 'Google Drive'),
    path.join(home, 'My Drive'),
    'G:\\My Drive',
    'H:\\My Drive',
    'I:\\My Drive',
    'D:\\My Drive',
    'E:\\My Drive',
    'F:\\My Drive'
  ];
  candidates.forEach(push);

  // Scan drive letters A-Z for "My Drive" or "Google Drive\\My Drive"
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i) + ':\\';
    push(path.join(letter, 'My Drive'));
    push(path.join(letter, 'Google Drive', 'My Drive'));
  }

  // Windows: Google Drive FS often under LOCALAPPDATA\Google\DriveFS — skip; use mapped letters above
  return found;
}

function defaultReportsProposal() {
  const drives = detectGoogleDriveCandidates();
  if (drives.length) return path.join(drives[0], 'FOT Reports');
  const home = process.env.USERPROFILE || process.env.HOME || app.getPath('documents');
  return path.join(home, 'FOT Reports');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(s) {
  return String(s || 'unknown').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

async function isFileReady(filePath) {
  // Drive "online-only" placeholders: size 0 or cloud reparse — retry briefly
  for (let i = 0; i < 5; i++) {
    try {
      const st = await fsp.stat(filePath);
      if (st.size > 0) {
        const fh = await fsp.open(filePath, 'r');
        try {
          const buf = Buffer.alloc(Math.min(64, st.size));
          await fh.read(buf, 0, buf.length, 0);
          return true;
        } finally {
          await fh.close();
        }
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
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  const index = path.join(webRoot(), 'index.html');
  mainWindow.loadFile(index);
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  // First-run: propose reports folder if unset
  const s = loadSettings();
  if (!s.reportsFolder) {
    s.reportsFolderProposed = defaultReportsProposal();
    saveSettings(s);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:getInfo', () => {
  const s = loadSettings();
  return {
    isDesktop: true,
    version: app.getVersion(),
    reportsFolder: s.reportsFolder || null,
    reportsFolderProposed: s.reportsFolderProposed || defaultReportsProposal(),
    googleDriveCandidates: detectGoogleDriveCandidates(),
    userData: app.getPath('userData')
  };
});

ipcMain.handle('desktop:setReportsFolder', async (_e, folder) => {
  if (!folder || typeof folder !== 'string') throw new Error('Invalid folder');
  ensureDir(folder);
  const s = loadSettings();
  s.reportsFolder = folder;
  saveSettings(s);
  return { reportsFolder: folder };
});

ipcMain.handle('desktop:pickReportsFolder', async () => {
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
  return { canceled: false, reportsFolder: folder };
});

ipcMain.handle('desktop:acceptProposedFolder', async () => {
  const s = loadSettings();
  const folder = s.reportsFolderProposed || defaultReportsProposal();
  ensureDir(folder);
  s.reportsFolder = folder;
  saveSettings(s);
  return { reportsFolder: folder };
});

ipcMain.handle('desktop:writeTest', async (_e, payload) => {
  const s = loadSettings();
  const folder = s.reportsFolder;
  if (!folder) throw new Error('Reports folder not set');
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
    savedAt: (payload.record && payload.record.savedAt) || new Date().toISOString()
  });
  await fsp.writeFile(jsonPath, JSON.stringify(record, null, 2), 'utf8');
  let wrotePdf = false;
  if (payload.pdfBase64) {
    const buf = Buffer.from(payload.pdfBase64, 'base64');
    await fsp.writeFile(pdfPath, buf);
    wrotePdf = true;
  }
  return { jsonPath, pdfPath: wrotePdf ? pdfPath : null, base };
});

ipcMain.handle('desktop:listReports', async () => {
  const s = loadSettings();
  const folder = s.reportsFolder;
  if (!folder || !fs.existsSync(folder)) {
    return { folder: folder || null, records: [], skipped: [], error: folder ? null : 'no_folder' };
  }
  let names;
  try {
    names = await fsp.readdir(folder);
  } catch (e) {
    return { folder, records: [], skipped: [], error: e.message };
  }
  const records = [];
  const skipped = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const fp = path.join(folder, name);
    const res = await readJsonFileSafe(fp);
    if (!res.ok) {
      skipped.push({ file: name, reason: res.reason });
      continue;
    }
    const data = res.data;
    // Accept either a single record or a backup envelope
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
  const s = loadSettings();
  if (!s.reportsFolder) return { ok: false };
  ensureDir(s.reportsFolder);
  await shell.openPath(s.reportsFolder);
  return { ok: true };
});
