/* Merge report JSON records from a Reports folder into the local patient store shape.
 * Used by the desktop build; safe to load on web (unused). */
(function (root) {
  'use strict';

  function patientKeyFromRecord(rec) {
    if (root.FOTSTORE && root.FOTSTORE.patientKey) {
      return root.FOTSTORE.patientKey(rec.ptId, rec.ptName);
    }
    const a = (rec.ptId || '').trim().toLowerCase();
    const b = (rec.ptName || '').trim().toLowerCase();
    return a || b || 'anonymous';
  }

  /** records: array of test snapshots from folder JSON files → { patientKey: [records] } */
  function recordsToStore(records) {
    const out = {};
    (records || []).forEach(rec => {
      if (!rec || !rec.id) return;
      const k = patientKeyFromRecord(rec);
      if (!out[k]) out[k] = [];
      out[k].push(rec);
    });
    return out;
  }

  /**
   * Merge folder records into local store map.
   * Returns { data, conflictCount, added, updated } using FOTSTORE.mergeStores.
   */
  function mergeFolderIntoLocal(localData, folderRecords) {
    const remote = recordsToStore(folderRecords);
    if (!root.FOTSTORE || !root.FOTSTORE.mergeStores) {
      throw new Error('FOTSTORE.mergeStores required');
    }
    return root.FOTSTORE.mergeStores(localData || {}, remote);
  }

  const api = { recordsToStore, mergeFolderIntoLocal, patientKeyFromRecord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FOTFOLDER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
