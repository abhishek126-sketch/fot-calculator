/* Desktop-only UI: licence gate, multi-user login, reports folder, updates.
 * No-op on GitHub Pages (no window.fotDesktop). */
(function (root) {
  'use strict';
  if (!root.fotDesktop || !root.fotDesktop.isDesktop) return;

  const $ = (id) => document.getElementById(id);
  let infoCache = null;
  let unlocked = false;

  function setMsg(t) {
    const el = $('desktopFolderMsg');
    if (el) el.textContent = t || '';
  }

  function overlay(html) {
    let el = $('fotDesktopOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fotDesktopOverlay';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="background:#fff;max-width:480px;width:100%;border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.35);color:#0f172a;">' + html + '</div>';
    el.style.display = 'flex';
    return el;
  }

  function hideOverlay() {
    const el = $('fotDesktopOverlay');
    if (el) el.style.display = 'none';
  }

  function showLicenceGate(status) {
    const expired = status && status.expired;
    overlay(`
      <h2 style="margin:0 0 8px;font-size:18px;">${expired ? 'Licence expired' : 'Enter licence key'}</h2>
      <p style="font-size:13px;color:#475569;margin:0 0 12px;">
        ${expired
          ? 'Your licence has expired. You can still <strong>view and export</strong> saved reports, but <strong>new tests are blocked</strong> until you enter a new key.'
          : 'Paste the FOT1… licence key issued for this doctor. Validity is 1 year from issue date.'}
      </p>
      <textarea id="licKeyInput" rows="3" style="width:100%;font-family:monospace;font-size:12px;" placeholder="FOT1...."></textarea>
      <p id="licErr" style="color:#b91c1c;font-size:12px;min-height:1.2em;"></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="primary" id="licActivateBtn">Activate</button>
        ${expired ? '<button type="button" class="secondary" id="licContinueView">Continue (view only)</button>' : ''}
      </div>
    `);
    $('licActivateBtn').onclick = async () => {
      const key = $('licKeyInput').value;
      const r = await root.fotDesktop.activateLicence(key);
      if (!r.ok) {
        $('licErr').textContent = 'Invalid key: ' + (r.reason || 'unknown');
        return;
      }
      hideOverlay();
      await bootAfterLicence();
    };
    const cont = $('licContinueView');
    if (cont) cont.onclick = async () => { hideOverlay(); await bootAfterLicence(); };
  }

  function showAdminSetup() {
    overlay(`
      <h2 style="margin:0 0 8px;font-size:18px;">Create owner (admin) account</h2>
      <p style="font-size:13px;color:#475569;">First run on this computer. Reports are separated per login; passwords are hashed (not recoverable). Reports themselves are <strong>not encrypted</strong> so an admin password reset cannot lock you out of patient files.</p>
      <label>Username</label><input id="admUser" style="width:100%;margin-bottom:8px;">
      <label>Display name</label><input id="admName" style="width:100%;margin-bottom:8px;" placeholder="Dr …">
      <label>Password</label><input id="admPass" type="password" style="width:100%;margin-bottom:8px;">
      <p id="admErr" style="color:#b91c1c;font-size:12px;"></p>
      <button type="button" class="primary" id="admGo">Create &amp; sign in</button>
    `);
    $('admGo').onclick = async () => {
      try {
        const r = await root.fotDesktop.setupAdmin({
          username: $('admUser').value,
          password: $('admPass').value,
          displayName: $('admName').value
        });
        if (!r.ok) { $('admErr').textContent = r.reason || 'Failed'; return; }
        hideOverlay();
        await afterLogin();
      } catch (e) { $('admErr').textContent = e.message || String(e); }
    };
  }

  function showLogin() {
    overlay(`
      <h2 style="margin:0 0 8px;font-size:18px;">Sign in — FOT Calculator</h2>
      <label>Username</label><input id="loginUser" style="width:100%;margin-bottom:8px;" autocomplete="username">
      <label>Password</label><input id="loginPass" type="password" style="width:100%;margin-bottom:8px;" autocomplete="current-password">
      <p id="loginErr" style="color:#b91c1c;font-size:12px;"></p>
      <button type="button" class="primary" id="loginGo">Sign in</button>
    `);
    $('loginGo').onclick = async () => {
      const r = await root.fotDesktop.login({ username: $('loginUser').value, password: $('loginPass').value });
      if (!r.ok) { $('loginErr').textContent = r.reason === 'bad_password' ? 'Wrong password' : 'Unknown user'; return; }
      hideOverlay();
      await afterLogin();
    };
    $('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginGo').click(); });
  }

  async function bootAfterLicence() {
    infoCache = await root.fotDesktop.getInfo();
    if (infoCache.needsAdminSetup) showAdminSetup();
    else if (!infoCache.session) showLogin();
    else await afterLogin();
  }

  async function afterLogin() {
    unlocked = true;
    hideOverlay();
    injectUi();
    hideBrowserDriveSync();
    infoCache = await root.fotDesktop.getInfo();
    await refreshFolderLabel();
    if (infoCache.licence && infoCache.licence.warn) {
      setMsg('Licence expires in ' + infoCache.licence.daysLeft + ' day(s) (' + infoCache.licence.expires + ').');
    }
    if (infoCache.licence && !infoCache.licence.canCreate) {
      setMsg('Licence inactive/expired — viewing & exporting only; new saves blocked.');
    }
    if (infoCache.reportsFolder || infoCache.session) {
      try { await refreshFromFolder(); } catch (e) { /* ignore */ }
    }
    document.addEventListener('click', () => root.fotDesktop.touchSession());
    document.addEventListener('keydown', () => root.fotDesktop.touchSession());
    root.fotDesktop.onSessionLocked(() => {
      unlocked = false;
      showLogin();
    });
  }

  function hideBrowserDriveSync() {
    const wrap = $('driveSyncWrap');
    if (wrap) wrap.style.display = 'none';
  }

  async function refreshFolderLabel() {
    const info = await root.fotDesktop.getInfo();
    infoCache = info;
    const label = $('desktopFolderPath');
    if (label) label.textContent = info.reportsFolder || '(not set)';
    const prop = $('desktopProposedPath');
    if (prop) {
      prop.textContent = info.reportsFolderProposed || '';
      const wrap = $('desktopProposeWrap');
      if (wrap) wrap.style.display = info.reportsFolder ? 'none' : 'block';
    }
    const about = $('desktopAboutLic');
    if (about) {
      about.textContent = info.licence && info.licence.licensee
        ? `Licensed to ${info.licence.licensee} — expires ${info.licence.expires}`
        : 'No active licence';
    }
    const who = $('desktopWho');
    if (who && info.session) who.textContent = `Signed in: ${info.session.displayName || info.session.username} (${info.session.role})`;
    return info;
  }

  async function refreshFromFolder() {
    if (!root.FOTSTORE || !root.FOTFOLDER) return;
    const listed = await root.fotDesktop.listReports();
    const merged = root.FOTFOLDER.mergeFolderIntoLocal(root.FOTSTORE.loadAll(), listed.records || []);
    root.FOTSTORE.replaceAll(merged.data);
    const skipNote = listed.skipped && listed.skipped.length
      ? ` (${listed.skipped.length} skipped — not synced / not a test JSON)` : '';
    setMsg(`Loaded ${listed.records.length} report(s)${skipNote}. Conflicts kept: ${merged.conflictCount}.`);
    if (typeof root.refreshCompareSelect === 'function') root.refreshCompareSelect();
  }

  async function persistToFolder(record, pdfBase64) {
    const info = infoCache || await root.fotDesktop.getInfo();
    if (info.licence && !info.licence.canCreate) {
      setMsg('Licence expired/missing — cannot save new tests. Old reports remain available.');
      return null;
    }
    if (!info.reportsFolder) {
      try {
        await root.fotDesktop.acceptProposedFolder();
        await refreshFolderLabel();
      } catch (e) {
        setMsg('Could not create Reports folder: ' + (e.message || e));
        return null;
      }
    }
    try {
      const result = await root.fotDesktop.writeTest({
        id: record.id,
        patientId: record.ptId || record.ptName,
        ptId: record.ptId,
        ptName: record.ptName,
        testDate: record.testDate,
        record,
        pdfBase64: pdfBase64 || null
      });
      setMsg('Saved to Reports folder: ' + (result.base || '') + '.json' + (result.pdfPath ? ' + .pdf' : ''));
      return result;
    } catch (e) {
      setMsg('Folder save failed: ' + (e.message || e));
      return null;
    }
  }

  function injectUi() {
    hideBrowserDriveSync();
    if ($('desktopReportsCard')) {
      refreshFolderLabel();
      return;
    }
    const saveMsg = $('saveMsg');
    if (!saveMsg) return;
    const card = document.createElement('div');
    card.id = 'desktopReportsCard';
    card.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;';
    card.innerHTML = `
      <p id="desktopWho" class="muted" style="margin:0 0 6px;"></p>
      <p id="desktopAboutLic" class="muted" style="margin:0 0 8px;"></p>
      <label style="display:block;margin-bottom:6px;"><strong>Reports folder</strong> (per-user subfolder; Google Drive if available, else Documents\\FOT Calculator\\Reports)</label>
      <p class="muted" style="margin:0 0 6px;">Path: <code id="desktopFolderPath">(loading…)</code></p>
      <div id="desktopProposeWrap" style="display:none;margin-bottom:8px;">
        <p class="muted">Suggested: <code id="desktopProposedPath"></code></p>
        <button type="button" class="primary" id="desktopAcceptProposed">Use suggested folder</button>
      </div>
      <div class="actions">
        <button type="button" class="secondary" id="desktopBrowseFolder">Browse…</button>
        <button type="button" class="secondary" id="desktopRefreshFolder">Refresh from folder</button>
        <button type="button" class="secondary" id="desktopOpenFolder">Open folder</button>
        <button type="button" class="secondary" id="desktopOpenRoot">Open FOT Calculator folder</button>
      </div>
      <h3 style="font-size:13px;margin:14px 0 6px;color:var(--accent,#1e3a8a);">Updates</h3>
      <div class="actions">
        <button type="button" class="secondary" id="desktopCheckUpd">Check for updates</button>
        <button type="button" class="secondary" id="desktopInstallFile">Install from file</button>
        <button type="button" class="secondary" id="desktopShareUpd">Share update folder</button>
      </div>
      <div id="desktopUpdPanel" class="muted" style="margin-top:8px;"></div>
      <div id="desktopAdminPanel" style="display:none;margin-top:12px;">
        <h3 style="font-size:13px;margin:0 0 6px;color:var(--accent,#1e3a8a);">Users (admin)</h3>
        <div class="actions">
          <input id="newUserName" placeholder="username" style="max-width:120px;">
          <input id="newUserPass" type="password" placeholder="password" style="max-width:120px;">
          <button type="button" class="secondary" id="desktopAddUser">Add user</button>
        </div>
        <ul id="desktopUserList" style="font-size:13px;"></ul>
      </div>
      <p id="desktopFolderMsg" class="muted" style="margin-top:6px;"></p>
      <button type="button" class="secondary" id="desktopLogout" style="margin-top:8px;">Sign out</button>
    `;
    saveMsg.parentNode.insertBefore(card, saveMsg);
    $('desktopAcceptProposed')?.addEventListener('click', async () => {
      await root.fotDesktop.acceptProposedFolder();
      await refreshFolderLabel();
      await refreshFromFolder();
    });
    $('desktopBrowseFolder')?.addEventListener('click', async () => {
      const r = await root.fotDesktop.pickReportsFolder();
      if (!r.canceled) { await refreshFolderLabel(); await refreshFromFolder(); }
    });
    $('desktopRefreshFolder')?.addEventListener('click', () => refreshFromFolder());
    $('desktopOpenFolder')?.addEventListener('click', () => root.fotDesktop.openReportsFolder());
    $('desktopOpenRoot')?.addEventListener('click', () => root.fotDesktop.openFotRoot());
    $('desktopLogout')?.addEventListener('click', async () => {
      await root.fotDesktop.logout();
      unlocked = false;
      showLogin();
    });
    $('desktopCheckUpd')?.addEventListener('click', checkUpdatesUi);
    $('desktopInstallFile')?.addEventListener('click', async () => {
      const r = await root.fotDesktop.installFromFile();
      if (r.canceled) return;
      const panel = $('desktopUpdPanel');
      panel.innerHTML = `Copied to <code>${r.path}</code>. <button type="button" class="primary" id="updInstallNow">Install now</button>`;
      $('updInstallNow').onclick = () => root.fotDesktop.installUpdate(r.path);
    });
    $('desktopShareUpd')?.addEventListener('click', () => root.fotDesktop.shareUpdate());
    $('desktopAddUser')?.addEventListener('click', async () => {
      try {
        await root.fotDesktop.addUser({ username: $('newUserName').value, password: $('newUserPass').value });
        $('newUserName').value = ''; $('newUserPass').value = '';
        await renderUsers();
      } catch (e) { setMsg(e.message || String(e)); }
    });
    const h = Array.from(document.querySelectorAll('h2')).find(x => /Saved tests/i.test(x.textContent || ''));
    if (h) h.innerHTML = '1c. Saved tests &amp; Reports folder';
    renderUsers();
  }

  async function renderUsers() {
    const info = await root.fotDesktop.getInfo();
    const panel = $('desktopAdminPanel');
    if (!panel) return;
    if (!info.session || info.session.role !== 'admin') { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const list = await root.fotDesktop.listUsers();
    const ul = $('desktopUserList');
    ul.innerHTML = '';
    list.forEach(u => {
      const li = document.createElement('li');
      li.textContent = `${u.displayName || u.username} (@${u.username}) — ${u.role} `;
      if (u.username !== info.session.username) {
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'secondary'; rm.textContent = 'Remove';
        rm.onclick = async () => { await root.fotDesktop.removeUser(u.username); renderUsers(); };
        const rp = document.createElement('button');
        rp.type = 'button'; rp.className = 'secondary'; rp.textContent = 'Reset pw';
        rp.onclick = async () => {
          const np = prompt('New password for ' + u.username);
          if (!np) return;
          const r = await root.fotDesktop.resetPassword({ username: u.username, newPassword: np });
          alert(r.note || 'Password reset');
        };
        li.appendChild(rm); li.appendChild(rp);
      }
      ul.appendChild(li);
    });
  }

  async function checkUpdatesUi() {
    const panel = $('desktopUpdPanel');
    panel.textContent = 'Checking GitHub releases…';
    try {
      const r = await root.fotDesktop.checkUpdates();
      if (!r.latest) { panel.textContent = 'No desktop releases found.'; return; }
      if (!r.updateAvailable) {
        panel.innerHTML = `You are on v${r.current}. Latest is v${r.latest.version} — up to date.`;
        return;
      }
      panel.innerHTML = `
        <p><strong>Update available:</strong> v${r.current} → <strong>v${r.latest.version}</strong></p>
        <pre style="white-space:pre-wrap;font-size:11px;max-height:120px;overflow:auto;background:#f8fafc;padding:8px;border-radius:6px;">${(r.latest.body || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
        <button type="button" class="primary" id="updDownload">Download to Updates folder</button>
      `;
      $('updDownload').onclick = async () => {
        panel.textContent = 'Downloading…';
        try {
          const d = await root.fotDesktop.downloadUpdate({
            url: r.latest.exeUrl,
            version: r.latest.version,
            exeName: r.latest.exeName,
            shaUrl: r.latest.shaUrl
          });
          panel.innerHTML = `Downloaded to <code>${d.path}</code> (SHA-256 verified if provided).<br>
            <button type="button" class="primary" id="updInstallNow">Install now</button>
            <button type="button" class="secondary" id="updShare">Share update folder</button>`;
          $('updInstallNow').onclick = () => root.fotDesktop.installUpdate(d.path);
          $('updShare').onclick = () => root.fotDesktop.shareUpdate();
        } catch (e) {
          panel.textContent = 'Download failed: ' + (e.message || e);
        }
      };
    } catch (e) {
      panel.textContent = 'Update check failed: ' + (e.message || e);
    }
  }

  async function init() {
    hideBrowserDriveSync();
    infoCache = await root.fotDesktop.getInfo();
    const lic = infoCache.licence || {};
    if (!lic.licensee && lic.reason === 'missing') {
      showLicenceGate(lic);
      return;
    }
    if (lic.expired && !lic.licensee) {
      showLicenceGate(lic);
      return;
    }
    // Has key (valid or expired with payload)
    if (!lic.ok && lic.reason === 'expired') {
      // still show gate with continue view
      showLicenceGate(lic);
      return;
    }
    if (!lic.ok && lic.reason === 'missing') {
      showLicenceGate(lic);
      return;
    }
    await bootAfterLicence();
  }

  root.FOTDESKTOP_UI = { init, persistToFolder, refreshFromFolder, hideBrowserDriveSync };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  } else {
    setTimeout(init, 0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
