/* Desktop-only UI: Reports folder + hide browser Google OAuth sync.
 * Activates only when window.fotDesktop is present (Electron preload). */
(function (root) {
  'use strict';
  if (!root.fotDesktop || !root.fotDesktop.isDesktop) return;

  const $ = (id) => document.getElementById(id);

  function setMsg(t) {
    const el = $('desktopFolderMsg');
    if (el) el.textContent = t || '';
  }

  async function refreshFolderLabel() {
    const info = await root.fotDesktop.getInfo();
    const label = $('desktopFolderPath');
    if (label) label.textContent = info.reportsFolder || '(not set — choose a folder)';
    const prop = $('desktopProposedPath');
    if (prop) {
      prop.textContent = info.reportsFolderProposed || '';
      const wrap = $('desktopProposeWrap');
      if (wrap) wrap.style.display = info.reportsFolder ? 'none' : 'block';
    }
    return info;
  }

  async function ensureFolder() {
    const info = await root.fotDesktop.getInfo();
    if (info.reportsFolder) return info.reportsFolder;
    return null;
  }

  async function acceptProposed() {
    const r = await root.fotDesktop.acceptProposedFolder();
    setMsg('Reports folder: ' + r.reportsFolder);
    await refreshFolderLabel();
    await refreshFromFolder();
  }

  async function browseFolder() {
    const r = await root.fotDesktop.pickReportsFolder();
    if (r.canceled) return;
    setMsg('Reports folder: ' + r.reportsFolder);
    await refreshFolderLabel();
    await refreshFromFolder();
  }

  async function refreshFromFolder() {
    if (!root.FOTSTORE || !root.FOTFOLDER) {
      setMsg('Storage helpers not loaded.');
      return;
    }
    const folder = await ensureFolder();
    if (!folder) {
      setMsg('Set a Reports folder first.');
      return;
    }
    const listed = await root.fotDesktop.listReports();
    if (listed.error === 'no_folder') {
      setMsg('No Reports folder set.');
      return;
    }
    const merged = root.FOTFOLDER.mergeFolderIntoLocal(root.FOTSTORE.loadAll(), listed.records);
    root.FOTSTORE.replaceAll(merged.data);
    const skipNote = listed.skipped && listed.skipped.length
      ? ` (${listed.skipped.length} file(s) skipped — not synced yet or not a test JSON)`
      : '';
    setMsg(`Loaded ${listed.records.length} report(s) from folder${skipNote}. Conflicts kept: ${merged.conflictCount}.`);
    if (typeof root.refreshCompareSelect === 'function') root.refreshCompareSelect();
  }

  /** After local save: write JSON (+ PDF if provided) into Reports folder. */
  async function persistToFolder(record, pdfBase64) {
    let folder = await ensureFolder();
    if (!folder) {
      // Auto-accept proposed Google Drive / home folder on first save
      try {
        const r = await root.fotDesktop.acceptProposedFolder();
        folder = r.reportsFolder;
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
      setMsg('Folder save failed: ' + (e.message || e) + ' (local save kept)');
      return null;
    }
  }

  function hideBrowserDriveSync() {
    const wrap = $('driveSyncWrap');
    if (wrap) wrap.style.display = 'none';
    const cardP = document.querySelector('#driveSyncWrap')?.previousElementSibling;
  }

  function injectUi() {
    hideBrowserDriveSync();
    if ($('desktopReportsCard')) return;
    const anchor = document.querySelector('h2') && document.getElementById('saveMsg');
    const saveMsg = $('saveMsg');
    if (!saveMsg) return;
    const card = document.createElement('div');
    card.id = 'desktopReportsCard';
    card.style.marginTop = '12px';
    card.style.paddingTop = '10px';
    card.style.borderTop = '1px solid #e2e8f0';
    card.innerHTML = `
      <label style="display:block;margin-bottom:6px;"><strong>Reports folder</strong> (desktop — JSON + PDF for each save; shared via Google Drive for Desktop)</label>
      <p class="muted" style="margin:0 0 6px;">Path: <code id="desktopFolderPath">(loading…)</code></p>
      <div id="desktopProposeWrap" style="display:none;margin-bottom:8px;">
        <p class="muted" style="margin:0 0 6px;">Suggested (Google Drive if found): <code id="desktopProposedPath"></code></p>
        <button type="button" class="primary" id="desktopAcceptProposed">Use suggested folder</button>
      </div>
      <div class="actions">
        <button type="button" class="secondary" id="desktopBrowseFolder">Browse…</button>
        <button type="button" class="secondary" id="desktopRefreshFolder">Refresh from folder</button>
        <button type="button" class="secondary" id="desktopOpenFolder">Open folder</button>
      </div>
      <p id="desktopFolderMsg" class="muted" style="margin-top:6px;"></p>
    `;
    saveMsg.parentNode.insertBefore(card, saveMsg);
    $('desktopAcceptProposed')?.addEventListener('click', () => acceptProposed());
    $('desktopBrowseFolder')?.addEventListener('click', () => browseFolder());
    $('desktopRefreshFolder')?.addEventListener('click', () => refreshFromFolder());
    $('desktopOpenFolder')?.addEventListener('click', () => root.fotDesktop.openReportsFolder());
  }

  async function init() {
    injectUi();
    hideBrowserDriveSync();
    // Update card title text
    const h = Array.from(document.querySelectorAll('h2')).find(x => /Saved tests/i.test(x.textContent || ''));
    if (h) h.innerHTML = '1c. Saved tests &amp; Reports folder';
    const info = await refreshFolderLabel();
    if (info.reportsFolder) {
      await refreshFromFolder();
    } else {
      setMsg('Choose a Reports folder (Google Drive “My Drive\\FOT Reports” is suggested when Drive for Desktop is installed).');
    }
  }

  root.FOTDESKTOP_UI = { init, persistToFolder, refreshFromFolder, hideBrowserDriveSync };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  } else {
    setTimeout(init, 0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
