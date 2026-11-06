const test = require('node:test'), assert = require('node:assert');
const S = require('../storage.js');
// Attach FOTSTORE for folder-sync
globalThis.FOTSTORE = S;
const F = require('../folder-sync.js');

test('recordsToStore groups by patient key', () => {
  const store = F.recordsToStore([
    { id: 'a', ptId: 'UH1', ptName: 'A', r5: 1 },
    { id: 'b', ptId: 'UH1', ptName: 'A', r5: 2 },
    { id: 'c', ptId: '', ptName: 'Bob', r5: 3 }
  ]);
  assert.equal(store.uh1.length, 2);
  assert.equal(store.bob.length, 1);
});

test('mergeFolderIntoLocal adds remote-only reports', () => {
  const local = { uh1: [{ id: 'local1', ptId: 'uh1', r5: 1, updatedAt: '2026-01-01T00:00:00.000Z' }] };
  const folder = [{ id: 'remote1', ptId: 'uh1', r5: 9, updatedAt: '2026-02-01T00:00:00.000Z' }];
  const m = F.mergeFolderIntoLocal(local, folder);
  assert.equal(m.data.uh1.length, 2);
  assert.ok(m.data.uh1.some(r => r.id === 'remote1'));
});

test('mergeFolderIntoLocal prefers newer updatedAt', () => {
  const local = { p: [{ id: 't1', ptId: 'p', note: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }] };
  const folder = [{ id: 't1', ptId: 'p', note: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }];
  const m = F.mergeFolderIntoLocal(local, folder);
  assert.equal(m.data.p.length, 1);
  assert.equal(m.data.p[0].note, 'new');
});

test('mergeFolderIntoLocal conflict keeps both', () => {
  const ts = '2026-03-01T00:00:00.000Z';
  const local = { p: [{ id: 't1', ptId: 'p', note: 'L', updatedAt: ts }] };
  const folder = [{ id: 't1', ptId: 'p', note: 'F', updatedAt: ts }];
  const m = F.mergeFolderIntoLocal(local, folder);
  assert.equal(m.conflictCount, 1);
  assert.equal(m.data.p.length, 2);
});
