/* Local FOT test storage (localStorage). Optional Google Drive sync is client-side only. */
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
    const now = new Date().toISOString();
    record.savedAt = now;
    record.updatedAt = now;
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
    return JSON.stringify({
      format: 'fot-calc-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: loadAll()
    }, null, 2);
  }

  function stripMeta(rec) {
    const o = Object.assign({}, rec);
    delete o.updatedAt;
    delete o.savedAt;
    delete o.conflictOf;
    delete o.conflictNote;
    return o;
  }
  function stableStringify(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
  }
  function contentEqual(a, b) {
    return stableStringify(stripMeta(a)) === stableStringify(stripMeta(b));
  }

  /**
   * Merge two patient→records maps. Same id: keep newer updatedAt.
   * Same id + same updatedAt + different content: keep both (clone gets new id).
   * Never drops a unique record.
   */
  function mergeStores(localData, remoteData) {
    const map = new Map();
    const extras = [];
    let conflictCount = 0;

    function consider(pk, raw, side) {
      if (!raw) return;
      const rec = Object.assign({}, raw);
      if (!rec.id) rec.id = 't_anon_' + Math.random().toString(36).slice(2, 10);
      const ts = rec.updatedAt || rec.savedAt || '';
      if (!rec.updatedAt) rec.updatedAt = ts || '1970-01-01T00:00:00.000Z';
      const cur = map.get(rec.id);
      if (!cur) {
        map.set(rec.id, { pk: pk || 'anonymous', rec });
        return;
      }
      const cts = cur.rec.updatedAt || cur.rec.savedAt || '';
      if (rec.updatedAt > cts) {
        map.set(rec.id, { pk: pk || cur.pk, rec });
        return;
      }
      if (rec.updatedAt < cts) return;
      if (contentEqual(cur.rec, rec)) return;
      conflictCount += 1;
      const clone = Object.assign({}, rec, {
        id: rec.id + '__' + side + '_' + Math.random().toString(36).slice(2, 6),
        conflictOf: rec.id,
        conflictNote: 'Kept both versions (same updatedAt, different content)'
      });
      extras.push({ pk: pk || cur.pk, rec: clone });
    }

    Object.keys(localData || {}).forEach(pk => {
      (localData[pk] || []).forEach(r => consider(pk, r, 'local'));
    });
    Object.keys(remoteData || {}).forEach(pk => {
      (remoteData[pk] || []).forEach(r => consider(pk, r, 'remote'));
    });

    const out = {};
    map.forEach(({ pk, rec }) => {
      if (!out[pk]) out[pk] = [];
      out[pk].push(rec);
    });
    extras.forEach(({ pk, rec }) => {
      if (!out[pk]) out[pk] = [];
      out[pk].push(rec);
    });
    return { data: out, conflictCount };
  }

  function replaceAll(data) {
    saveAll(data || {});
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed.data || parsed;
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid backup file');
    const merged = mergeStores(loadAll(), data);
    saveAll(merged.data);
    return merged;
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

  const api = {
    loadAll, saveTest, listForPatient, deleteTest, exportJSON, importJSON, compare, patientKey,
    mergeStores, replaceAll, contentEqual
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTSTORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
