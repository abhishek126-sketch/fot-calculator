/* Local-only FOT test storage (localStorage). Nothing is uploaded. */
(function (root) {
  'use strict';
  const KEY = 'fotCalc.savedTests.v1';

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveAll(obj) {
    localStorage.setItem(KEY, JSON.stringify(obj));
  }
  function patientKey(id, name) {
    const a = (id || '').trim().toLowerCase();
    const b = (name || '').trim().toLowerCase();
    return a || b || 'anonymous';
  }
  function listForPatient(id, name) {
    const all = loadAll();
    const k = patientKey(id, name);
    return (all[k] || []).slice().sort((a, b) => (b.testDate || '').localeCompare(a.testDate || ''));
  }
  function saveTest(record) {
    const all = loadAll();
    const k = patientKey(record.ptId, record.ptName);
    if (!all[k]) all[k] = [];
    record.savedAt = new Date().toISOString();
    record.id = record.id || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    all[k].push(record);
    saveAll(all);
    return record;
  }
  function deleteTest(ptId, ptName, testId) {
    const all = loadAll();
    const k = patientKey(ptId, ptName);
    all[k] = (all[k] || []).filter(t => t.id !== testId);
    saveAll(all);
  }
  function exportJSON() {
    return JSON.stringify({ format: 'fot-calc-backup', version: 1, exportedAt: new Date().toISOString(), data: loadAll() }, null, 2);
  }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed.data || parsed;
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup file');
    const all = loadAll();
    Object.keys(data).forEach(k => {
      if (!all[k]) all[k] = [];
      const existing = new Set(all[k].map(t => t.id));
      (data[k] || []).forEach(t => { if (t && t.id && !existing.has(t.id)) all[k].push(t); });
    });
    saveAll(all);
  }

  /** Compare two saved evaluation snapshots. */
  function compare(prev, curr) {
    const params = ['r5', 'rhi', 'x5', 'ax', 'fres'];
    const rows = [];
    params.forEach(p => {
      const a = prev.measured && prev.measured[p];
      const b = curr.measured && curr.measured[p];
      if (a == null && b == null) return;
      const za = prev.z && prev.z[p];
      const zb = curr.z && curr.z[p];
      let pct = null, dz = null;
      if (a != null && b != null && a !== 0) pct = ((b - a) / Math.abs(a)) * 100;
      if (za != null && zb != null) dz = zb - za;
      rows.push({ param: p, prev: a, curr: b, prevZ: za, currZ: zb, pctChange: pct, deltaZ: dz });
    });
    return {
      prevDate: prev.testDate, currDate: curr.testDate,
      rows,
      note: 'No validated minimal clinically important difference (MCID) for between-visit FOT change is applied here. Values and Δz are shown for clinical correlation. Within-session CoV targets (ERS 2020) are quality metrics, not visit-to-visit significance thresholds.'
    };
  }

  const api = { loadAll, saveTest, listForPatient, deleteTest, exportJSON, importJSON, compare, patientKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTSTORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
