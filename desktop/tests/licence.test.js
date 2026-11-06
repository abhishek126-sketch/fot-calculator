const test = require('node:test'), assert = require('node:assert');
const crypto = require('crypto');
const L = require('../lib/licence');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

test('issue and verify valid licence', () => {
  const { key, payload } = L.issueLicence(privateKey, { name: 'Dr Test', issued: '2026-01-01' });
  assert.equal(payload.expires, '2027-01-01');
  const v = L.verifyLicence(publicKey, key, '2026-06-01');
  assert.equal(v.ok, true);
  assert.equal(v.payload.name, 'Dr Test');
  assert.equal(v.warn, false);
});

test('warn within 30 days', () => {
  const { key } = L.issueLicence(privateKey, { name: 'A', issued: '2025-02-01' });
  // expires 2026-02-01; clock 2026-01-15 => 17 days left
  const v = L.verifyLicence(publicKey, key, '2026-01-15');
  assert.equal(v.ok, true);
  assert.equal(v.warn, true);
});

test('expired licence', () => {
  const { key } = L.issueLicence(privateKey, { name: 'A', issued: '2024-01-01' });
  const v = L.verifyLicence(publicKey, key, '2026-01-01');
  assert.equal(v.ok, false);
  assert.equal(v.expired, true);
  assert.equal(v.reason, 'expired');
});

test('tampered payload fails signature', () => {
  const { key } = L.issueLicence(privateKey, { name: 'A', issued: '2026-01-01' });
  const parts = key.split('.');
  const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  body.name = 'Hacker';
  parts[1] = Buffer.from(JSON.stringify(body)).toString('base64url');
  const v = L.verifyLicence(publicKey, parts.join('.'), '2026-01-02');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'bad_signature');
});

test('clock rollback guard uses lastSeen', () => {
  assert.equal(L.effectiveClock('2026-01-01', '2026-06-01'), '2026-06-01');
  assert.equal(L.effectiveClock('2026-07-01', '2026-06-01'), '2026-07-01');
});
