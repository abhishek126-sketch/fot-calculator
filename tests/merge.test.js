const test = require('node:test'), assert = require('node:assert');
const S = require('../storage.js');

test('merge keeps newer updatedAt for same id', () => {
  const local = { uh1: [{ id: 't1', ptId: 'uh1', r5: 1, updatedAt: '2026-01-01T00:00:00.000Z' }] };
  const remote = { uh1: [{ id: 't1', ptId: 'uh1', r5: 9, updatedAt: '2026-06-01T00:00:00.000Z' }] };
  const m = S.mergeStores(local, remote);
  assert.equal(m.data.uh1.length, 1);
  assert.equal(m.data.uh1[0].r5, 9);
  assert.equal(m.conflictCount, 0);
});

test('merge keeps local when local is newer', () => {
  const local = { uh1: [{ id: 't1', r5: 5, updatedAt: '2026-08-01T00:00:00.000Z' }] };
  const remote = { uh1: [{ id: 't1', r5: 1, updatedAt: '2026-01-01T00:00:00.000Z' }] };
  const m = S.mergeStores(local, remote);
  assert.equal(m.data.uh1[0].r5, 5);
});

test('merge unions different ids (no data loss)', () => {
  const local = { a: [{ id: 'L', r5: 1, updatedAt: '2026-01-01T00:00:00.000Z' }] };
  const remote = { a: [{ id: 'R', r5: 2, updatedAt: '2026-01-02T00:00:00.000Z' }] };
  const m = S.mergeStores(local, remote);
  assert.equal(m.data.a.length, 2);
  const ids = m.data.a.map(x => x.id).sort();
  assert.deepEqual(ids, ['L', 'R']);
});

test('conflict same updatedAt different content keeps both', () => {
  const ts = '2026-03-01T12:00:00.000Z';
  const local = { p: [{ id: 't9', note: 'A', updatedAt: ts }] };
  const remote = { p: [{ id: 't9', note: 'B', updatedAt: ts }] };
  const m = S.mergeStores(local, remote);
  assert.equal(m.conflictCount, 1);
  assert.equal(m.data.p.length, 2);
  const notes = m.data.p.map(x => x.note).sort();
  assert.deepEqual(notes, ['A', 'B']);
  assert.ok(m.data.p.some(x => x.conflictOf === 't9'));
});

test('identical content same id does not duplicate', () => {
  const rec = { id: 't2', r5: 3, updatedAt: '2026-02-01T00:00:00.000Z' };
  const m = S.mergeStores({ x: [rec] }, { x: [{ ...rec }] });
  assert.equal(m.data.x.length, 1);
  assert.equal(m.conflictCount, 0);
});

test('falls back to savedAt when updatedAt missing', () => {
  const local = { a: [{ id: 't3', r5: 1, savedAt: '2026-01-01T00:00:00.000Z' }] };
  const remote = { a: [{ id: 't3', r5: 2, savedAt: '2026-05-01T00:00:00.000Z' }] };
  const m = S.mergeStores(local, remote);
  assert.equal(m.data.a[0].r5, 2);
});
