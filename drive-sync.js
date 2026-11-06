/* Client-side Google Drive sync (GIS token client + Drive API v3).
 * Patient data goes only to the signed-in user's Drive — never to GitHub or our servers.
 * Scope: drive.file (app-created files only; visible in Drive for cross-device confidence). */
(function (root) {
  'use strict';

  const FILE_ID_KEY = 'fotCalc.driveFileId';
  const PENDING_KEY = 'fotCalc.drivePendingSync';
  const TOKEN_KEY = 'fotCalc.driveToken';
  const EMAIL_KEY = 'fotCalc.driveEmail';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let syncing = false;
  let statusEl = null;

  function cfg() { return root.FOT_CONFIG || {}; }
  function clientId() { return (cfg().GOOGLE_CLIENT_ID || '').trim(); }
  function scope() { return cfg().DRIVE_SCOPE || 'https://www.googleapis.com/auth/drive.file'; }
  function fileName() { return cfg().DRIVE_FILE_NAME || 'fot-calculator-sync.json'; }
  function isConfigured() { return !!clientId(); }

  function setStatus(msg, kind) {
    statusEl = statusEl || document.getElementById('driveSyncStatus');
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.dataset.kind = kind || '';
  }

  function updateUi() {
    const wrap = document.getElementById('driveSyncWrap');
    const signBtn = document.getElementById('driveSignInBtn');
    const syncBtn = document.getElementById('driveSyncBtn');
    const signOutBtn = document.getElementById('driveSignOutBtn');
    const cfgNote = document.getElementById('driveConfigNote');
    if (!wrap) return;
    if (!isConfigured()) {
      wrap.classList.add('not-configured');
      if (cfgNote) cfgNote.style.display = 'block';
      if (signBtn) signBtn.disabled = true;
      if (syncBtn) syncBtn.disabled = true;
      if (signOutBtn) signOutBtn.disabled = true;
      setStatus('Google Drive sync: not configured yet (OAuth client ID missing).', 'warn');
      return;
    }
    if (cfgNote) cfgNote.style.display = 'none';
    const signed = !!accessToken && Date.now() < tokenExpiresAt;
    const email = localStorage.getItem(EMAIL_KEY) || '';
    if (signBtn) {
      signBtn.disabled = false;
      signBtn.textContent = signed ? ('Signed in' + (email ? ': ' + email : '')) : 'Sign in with Google';
    }
    if (syncBtn) syncBtn.disabled = !signed || syncing;
    if (signOutBtn) signOutBtn.disabled = !signed;
    const pending = localStorage.getItem(PENDING_KEY) === '1';
    if (signed && pending) setStatus('Signed in. Pending changes will sync…', 'info');
    else if (signed) setStatus('Signed in. Sync uses your Google Drive only (drive.file).', 'ok');
  }

  function loadCachedToken() {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && o.accessToken && o.expiresAt > Date.now() + 60000) {
        accessToken = o.accessToken;
        tokenExpiresAt = o.expiresAt;
      }
    } catch (e) { /* ignore */ }
  }

  function cacheToken(token, expiresInSec) {
    accessToken = token;
    tokenExpiresAt = Date.now() + (expiresInSec || 3600) * 1000;
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: tokenExpiresAt }));
    } catch (e) { /* ignore */ }
  }

  function clearToken() {
    accessToken = null;
    tokenExpiresAt = 0;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    localStorage.removeItem(EMAIL_KEY);
  }

  function ensureGis() {
    return new Promise((resolve, reject) => {
      if (!isConfigured()) return reject(new Error('GOOGLE_CLIENT_ID not configured'));
      if (root.google && root.google.accounts && root.google.accounts.oauth2) return resolve();
      const existing = document.querySelector('script[data-fot-gis]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.dataset.fotGis = '1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }

  async function initTokenClient() {
    await ensureGis();
    if (tokenClient) return tokenClient;
    tokenClient = root.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: scope(),
      callback: () => {} // set per-request
    });
    return tokenClient;
  }

  function requestToken(prompt) {
    return new Promise(async (resolve, reject) => {
      try {
        await initTokenClient();
      } catch (e) { return reject(e); }
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        cacheToken(resp.access_token, resp.expires_in);
        resolve(resp.access_token);
      };
      const opts = {};
      if (prompt) opts.prompt = prompt;
      tokenClient.requestAccessToken(opts);
    });
  }

  async function getToken() {
    if (accessToken && Date.now() < tokenExpiresAt - 30000) return accessToken;
    return requestToken('');
  }

  async function fetchEmail() {
    try {
      const tok = await getToken();
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + tok }
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.email) localStorage.setItem(EMAIL_KEY, j.email);
    } catch (e) { /* optional */ }
  }

  async function driveFetch(path, options) {
    const tok = await getToken();
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    const res = await fetch('https://www.googleapis.com/drive/v3/' + path, opts);
    if (res.status === 401) {
      clearToken();
      updateUi();
      throw new Error('Google session expired — sign in again');
    }
    return res;
  }

  async function findOrCreateFile() {
    let id = localStorage.getItem(FILE_ID_KEY);
    if (id) {
      const check = await driveFetch('files/' + encodeURIComponent(id) + '?fields=id,name,trashed');
      if (check.ok) {
        const meta = await check.json();
        if (!meta.trashed) return id;
      }
      localStorage.removeItem(FILE_ID_KEY);
    }
    const q = encodeURIComponent("name='" + fileName() + "' and trashed=false");
    const list = await driveFetch('files?q=' + q + '&spaces=drive&fields=files(id,name)&pageSize=5');
    if (!list.ok) throw new Error('Drive list failed: ' + list.status);
    const lj = await list.json();
    if (lj.files && lj.files.length) {
      id = lj.files[0].id;
      localStorage.setItem(FILE_ID_KEY, id);
      return id;
    }
    // Create empty file
    const meta = {
      name: fileName(),
      mimeType: 'application/json',
      description: 'FOT Calculator sync backup (created by abhishek126-sketch.github.io/fot-calculator). Patient data stays in your Drive only.'
    };
    const create = await driveFetch('files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    });
    if (!create.ok) throw new Error('Drive create failed: ' + create.status);
    const cj = await create.json();
    localStorage.setItem(FILE_ID_KEY, cj.id);
    // seed content
    await uploadContent(cj.id, {
      format: 'fot-calc-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {}
    });
    return cj.id;
  }

  async function downloadRemote(fileId) {
    const res = await driveFetch('files/' + encodeURIComponent(fileId) + '?alt=media');
    if (res.status === 404) return { data: {} };
    if (!res.ok) throw new Error('Drive download failed: ' + res.status);
    const text = await res.text();
    if (!text || !text.trim()) return { data: {} };
    const parsed = JSON.parse(text);
    return { data: parsed.data || parsed, raw: parsed };
  }

  async function uploadContent(fileId, payload) {
    const body = JSON.stringify(payload);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + (await getToken()),
          'Content-Type': 'application/json'
        },
        body
      }
    );
    if (!res.ok) throw new Error('Drive upload failed: ' + res.status);
  }

  function markPending() {
    localStorage.setItem(PENDING_KEY, '1');
  }
  function clearPending() {
    localStorage.removeItem(PENDING_KEY);
  }

  async function syncNow() {
    if (!isConfigured()) {
      setStatus('Google Drive sync: not configured yet.', 'warn');
      return { ok: false, reason: 'not_configured' };
    }
    if (!navigator.onLine) {
      markPending();
      setStatus('Offline — will sync when you are back online.', 'warn');
      return { ok: false, reason: 'offline' };
    }
    if (syncing) return { ok: false, reason: 'busy' };
    syncing = true;
    updateUi();
    setStatus('Syncing with Google Drive…', 'info');
    try {
      await getToken();
      await fetchEmail();
      const fileId = await findOrCreateFile();
      const remote = await downloadRemote(fileId);
      const local = root.FOTSTORE.loadAll();
      const merged = root.FOTSTORE.mergeStores(local, remote.data || {});
      root.FOTSTORE.replaceAll(merged.data);
      const payload = {
        format: 'fot-calc-backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        syncedFrom: location.origin + location.pathname,
        data: merged.data
      };
      await uploadContent(fileId, payload);
      clearPending();
      const msg = 'Synced with Google Drive' +
        (merged.conflictCount ? ' (' + merged.conflictCount + ' conflict(s) kept both versions)' : '') +
        '.';
      setStatus(msg, 'ok');
      if (typeof root.refreshCompareSelect === 'function') root.refreshCompareSelect();
      return { ok: true, conflictCount: merged.conflictCount };
    } catch (e) {
      markPending();
      setStatus('Sync failed: ' + (e.message || e) + '. Local data kept; will retry.', 'err');
      return { ok: false, error: e.message || String(e) };
    } finally {
      syncing = false;
      updateUi();
    }
  }

  async function signIn() {
    if (!isConfigured()) {
      setStatus('Google Drive sync: not configured yet.', 'warn');
      return;
    }
    try {
      await requestToken('consent');
      await fetchEmail();
      updateUi();
      await syncNow();
    } catch (e) {
      setStatus('Sign-in failed: ' + (e.message || e), 'err');
    }
  }

  function signOut() {
    if (accessToken && root.google && root.google.accounts && root.google.accounts.oauth2) {
      try { root.google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) { /* ignore */ }
    }
    clearToken();
    setStatus('Signed out. Local data remains on this device.', 'info');
    updateUi();
  }

  function onSaveHook() {
    markPending();
    if (!isConfigured()) return;
    if (!accessToken || Date.now() >= tokenExpiresAt) {
      setStatus('Saved locally. Sign in with Google to sync across devices.', 'info');
      return;
    }
    if (!navigator.onLine) {
      setStatus('Saved locally (offline). Will sync when online.', 'warn');
      return;
    }
    syncNow();
  }

  function init() {
    loadCachedToken();
    updateUi();
    window.addEventListener('online', () => {
      if (localStorage.getItem(PENDING_KEY) === '1' && accessToken) syncNow();
    });
  }

  const api = {
    isConfigured, signIn, signOut, syncNow, onSaveHook, init, updateUi, markPending,
    // exposed for tests
    _mergeViaStore: (a, b) => root.FOTSTORE.mergeStores(a, b)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FOTDRIVE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
