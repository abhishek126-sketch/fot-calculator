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

/* ---------- 2.0: monthly subscription keys bound to one computer (FOT2) ---------- */
const k2 = crypto.generateKeyPairSync('ed25519');
const KEYS = { v1: publicKey, v2: k2.publicKey };
const PC = L.machineCode('guid:11111111-2222-3333-4444-555555555555');
const OTHER = L.machineCode('guid:99999999-2222-3333-4444-555555555555');

test('computer code: stable, 10 readable characters, typed input normalised', () => {
  assert.match(PC, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
  assert.equal(PC, L.machineCode('GUID:11111111-2222-3333-4444-555555555555'));
  assert.notEqual(PC, OTHER);
  assert.equal(L.normaliseCode(PC.toLowerCase().replace('-', ' ')), PC);
  assert.equal(L.normaliseCode('ABC'), '');
  assert.equal(L.normaliseCode('ABCDE-0OI1X'), '', '0/O/1/I never used');
});

test('addMonths: calendar months, end of month clamps', () => {
  assert.equal(L.addMonths('2026-01-05', 1), '2026-02-05');
  assert.equal(L.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(L.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(L.addMonths('2026-11-22', 3), '2027-02-22');
  assert.equal(L.addMonths('2026-12-15', 12), '2027-12-15');
});

test('1-month key: valid from start to the day before the same date next month', () => {
  const { key, payload } = L.issueSubscription(k2.privateKey, { name: 'Dr Rao', machine: PC, months: 1, start: '2026-11-22' });
  assert.equal(payload.expires, '2026-12-22');
  assert.equal(L.lastValidDay(payload), '2026-12-21');
  assert.match(key, /^FOT2\./);
  assert.equal(L.verifyLicence(KEYS, key, '2026-11-21', PC).reason, 'not_yet_valid');
  const first = L.verifyLicence(KEYS, key, '2026-11-22', PC);
  assert.equal(first.ok, true); assert.equal(first.version, 2); assert.equal(first.warn, false);
  const near = L.verifyLicence(KEYS, key, '2026-12-16', PC);
  assert.equal(near.ok, true); assert.equal(near.warn, true, 'warn in the last 7 days');
  assert.equal(L.verifyLicence(KEYS, key, '2026-12-21', PC).ok, true);
  const end = L.verifyLicence(KEYS, key, '2026-12-22', PC);
  assert.equal(end.ok, false); assert.equal(end.reason, 'expired');
});

test('key works only on the computer it was made for', () => {
  const { key } = L.issueSubscription(k2.privateKey, { name: 'Dr Rao', machine: PC, months: 6, start: '2026-11-22' });
  assert.equal(L.verifyLicence(KEYS, key, '2026-12-01', PC).ok, true);
  const v = L.verifyLicence(KEYS, key, '2026-12-01', OTHER);
  assert.equal(v.ok, false); assert.equal(v.reason, 'wrong_computer');
});

test('tampering with months / computer / expiry breaks the signature', () => {
  const { key } = L.issueSubscription(k2.privateKey, { name: 'Dr Rao', machine: PC, months: 1, start: '2026-11-22' });
  for (const change of [p => { p.expires = '2030-01-01'; }, p => { p.machine = OTHER; }, p => { p.months = 12; }, p => { p.name = 'Dr X'; }]) {
    const parts = key.split('.');
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    change(body);
    parts[1] = Buffer.from(JSON.stringify(body)).toString('base64url');
    const v = L.verifyLicence(KEYS, parts.join('.'), '2026-11-23', body.machine);
    assert.equal(v.ok, false); assert.equal(v.reason, 'bad_signature');
  }
});

test('a FOT2 key signed with another private key is rejected; FOT1 cannot pass as FOT2', () => {
  const rogue = crypto.generateKeyPairSync('ed25519');
  const { key } = L.issueSubscription(rogue.privateKey, { name: 'Dr Rao', machine: PC, months: 1, start: '2026-11-22' });
  assert.equal(L.verifyLicence(KEYS, key, '2026-11-23', PC).reason, 'bad_signature');
  const { key: k1 } = L.issueLicence(privateKey, { name: 'A', issued: '2026-01-01' });
  assert.equal(L.verifyLicence(KEYS, k1.replace(/^FOT1/, 'FOT2'), '2026-02-01', PC).ok, false);
});

test('legacy FOT1 keys still accepted with the v1 key until they expire', () => {
  const { key } = L.issueLicence(privateKey, { name: 'Dr Old', issued: '2026-06-01' });
  const v = L.verifyLicence(KEYS, key, '2026-12-01', PC);
  assert.equal(v.ok, true); assert.equal(v.version, 1);
  assert.equal(L.verifyLicence(KEYS, key, '2027-06-02', PC).reason, 'expired');
});

test('issueSubscription refuses bad input', () => {
  assert.throws(() => L.issueSubscription(k2.privateKey, { name: '', machine: PC, months: 1 }), /name/);
  assert.throws(() => L.issueSubscription(k2.privateKey, { name: 'A', machine: 'XYZ', months: 1 }), /Computer code/);
  assert.throws(() => L.issueSubscription(k2.privateKey, { name: 'A', machine: PC, months: 0 }), /Months/);
  assert.throws(() => L.issueSubscription(k2.privateKey, { name: 'A', machine: PC, months: 1, start: '22-11-2026' }), /Start date/);
});

test('plain-language reasons exist for every refusal', () => {
  for (const r of ['missing', 'invalid_format', 'bad_signature', 'wrong_computer', 'expired', 'not_yet_valid'])
    assert.ok(!/not accepted \(/.test(L.reasonText(r)), r);
});

test('the shipped v2 public key is a valid Ed25519 key', () => {
  const k = L.loadPublicKey(require('path').join(__dirname, '..', 'lib', 'fot-licence-public-v2.pem'));
  assert.equal(k.asymmetricKeyType, 'ed25519');
});

test('today = local calendar date (IST key issued at 01:00 starts the same day)', () => {
  const d = new Date(); const local = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  assert.equal(L.todayUTC(d), local);
});
