'use strict';
/* FOT Calculator licences.
 *  FOT1 (v1, legacy): name-bound, 1 year, any computer. Still accepted (signed by the v1 key) until it expires.
 *  FOT2 (v2, update 2.0): SUBSCRIPTION - bound to ONE computer (its "Computer code"), valid for N calendar months
 *        from the start date. Signed with Ed25519; the app holds only the public key. */
const crypto = require('crypto');
const fs = require('fs');

const LICENCE_VERSION = 1;          // legacy v1
const VALIDITY_DAYS = 365;          // legacy v1
const WARN_DAYS = 30;               // legacy v1 (1-year keys)
const WARN_DAYS_V2 = 7;             // monthly keys: warn in the last 7 days
const MONTH_CHOICES = [1, 2, 3, 6, 12];

function loadPublicKey(pemPath) { return crypto.createPublicKey(fs.readFileSync(pemPath, 'utf8')); }
function loadPrivateKey(pemPathOrPem) {
  const pem = pemPathOrPem.includes('BEGIN') ? pemPathOrPem : fs.readFileSync(pemPathOrPem, 'utf8');
  return crypto.createPrivateKey(pem);
}

/* ---------- dates (all UTC calendar dates, YYYY-MM-DD) ---------- */
function daysFrom(iso, days) {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Same day N months later; if that month is shorter, the last day of it (31 Jan + 1 month = 28/29 Feb). */
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
/** Today's date on THIS computer's calendar (India: IST), as YYYY-MM-DD. (Name kept from v1.) Using the UTC date
 * made a key issued between midnight and 05:30 IST start "yesterday". */
function todayUTC(now = new Date()) { return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z'));

/* ---------- computer code ---------- */
const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/1/I/O: easy to read out on the phone
/** Short, stable code for this computer, made from Windows' MachineGuid (or a fallback id). XXXXX-XXXXX */
function machineCode(rawId) {
  const h = crypto.createHash('sha256').update('FOT-MACHINE|' + String(rawId || '').trim().toLowerCase()).digest();
  let out = '';
  for (let i = 0; i < 10; i++) out += B32[h[i] % 32];
  return out.slice(0, 5) + '-' + out.slice(5);
}
/** Accepts the code as typed (spaces, lower case, missing dash) and returns XXXXX-XXXXX, or '' if not valid. */
function normaliseCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (c.length !== 10 || [...c].some(ch => !B32.includes(ch))) return '';
  return c.slice(0, 5) + '-' + c.slice(5);
}

/* ---------- canonical strings that are signed ---------- */
function payloadString(p) {
  if (Number(p.v) === 2) {
    return ['v2', String(p.name || '').trim(), String(p.machine || ''), String(p.issued || ''), String(p.expires || ''),
      String(p.months || ''), String(p.id || '')].join('|');
  }
  return ['v' + (p.v || LICENCE_VERSION), String(p.name || '').trim(), String(p.issued || ''), String(p.expires || '')].join('|');
}

/* ---------- issuing ---------- */
/** Legacy v1 (kept for tests / old generator). */
function issueLicence(privateKey, { name, issued, notes }) {
  const issuedDate = issued || todayUTC();
  const payload = { v: LICENCE_VERSION, name: String(name).trim(), issued: issuedDate, expires: daysFrom(issuedDate, VALIDITY_DAYS) };
  if (notes) payload.notes = String(notes).trim();
  const sig = crypto.sign(null, Buffer.from(payloadString(payload), 'utf8'), privateKey);
  return { key: 'FOT1.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.' + Buffer.from(sig).toString('base64url'), payload };
}

/** v2 subscription key for ONE computer. start = first day of validity (default today). */
function issueSubscription(privateKey, { name, machine, months, start }) {
  const nm = String(name || '').trim();
  if (!nm) throw new Error('Doctor name required');
  const code = normaliseCode(machine);
  if (!code) throw new Error('Computer code must be 10 letters/digits, like ABCDE-23456');
  const mo = Number(months);
  if (!Number.isInteger(mo) || mo < 1 || mo > 24) throw new Error('Months must be a whole number from 1 to 24');
  const issued = start || todayUTC();
  if (!isDate(issued)) throw new Error('Start date must be YYYY-MM-DD');
  const payload = { v: 2, name: nm, machine: code, issued, expires: addMonths(issued, mo), months: mo, id: crypto.randomBytes(4).toString('hex') };
  const sig = crypto.sign(null, Buffer.from(payloadString(payload), 'utf8'), privateKey);
  const key = 'FOT2.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.' + Buffer.from(sig).toString('base64url');
  return { key, payload };
}

/* ---------- verifying ---------- */
/**
 * keys: { v1: KeyObject|null, v2: KeyObject } (a single KeyObject is treated as the v1 key, for old callers)
 * clockDate: effective YYYY-MM-DD (after the rollback guard). thisMachine: this computer's code (needed for FOT2).
 * The key is valid from `issued` up to and including `expires - 1 day` (a 1-month key from 05 Jan ends 04 Feb).
 * Returns { ok, reason?, expired?, payload?, daysLeft?, warn?, version? }
 */
function verifyLicence(keys, keyText, clockDate, thisMachine) {
  try {
    const K = keys && keys.asymmetricKeyType ? { v1: keys, v2: null } : (keys || {});
    const raw = String(keyText || '').trim().replace(/\s+/g, '');
    const parts = raw.split('.');
    if (parts.length !== 3 || !/^FOT[12]$/.test(parts[0])) return { ok: false, reason: 'invalid_format' };
    const version = parts[0] === 'FOT2' ? 2 : 1;
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'invalid_payload' }; }
    if (Number(payload.v || 1) !== version) return { ok: false, reason: 'invalid_payload' };
    if (!payload.name || !payload.issued || !payload.expires || (version === 2 && !payload.machine)) return { ok: false, reason: 'missing_fields' };
    const pub = version === 2 ? K.v2 : K.v1;
    if (!pub) return { ok: false, reason: 'bad_signature', payload };
    const good = crypto.verify(null, Buffer.from(payloadString(payload), 'utf8'), pub, Buffer.from(parts[2], 'base64url'));
    if (!good) return { ok: false, reason: 'bad_signature', payload };
    if (version === 2 && normaliseCode(thisMachine) !== payload.machine) return { ok: false, reason: 'wrong_computer', payload, version };
    const today = clockDate || todayUTC();
    if (today < payload.issued) return { ok: false, reason: 'not_yet_valid', payload, version };
    // v1 kept its original rule (valid through the expiry date); v2 ends the day before `expires`.
    const expired = version === 2 ? today >= payload.expires : today > payload.expires;
    const daysLeft = Math.ceil((new Date(payload.expires + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    return { ok: !expired, expired, reason: expired ? 'expired' : undefined, payload, version, daysLeft,
      warn: !expired && daysLeft <= (version === 2 ? WARN_DAYS_V2 : WARN_DAYS) };
  } catch (e) {
    return { ok: false, reason: 'error:' + (e.message || e) };
  }
}

/** Last valid day shown to the user (v2: the day before `expires`). */
function lastValidDay(payload) {
  if (!payload || !payload.expires) return null;
  return Number(payload.v) === 2 ? daysFrom(payload.expires, -1) : payload.expires;
}

/** Plain-language reason for the licence screen. */
function reasonText(reason) {
  return ({
    missing: 'No licence key entered yet.',
    invalid_format: 'This is not a FOT Calculator key. Copy the whole key, starting with FOT2.',
    invalid_payload: 'The key is damaged. Copy it again exactly as received.',
    missing_fields: 'The key is incomplete. Copy it again exactly as received.',
    bad_signature: 'This key is not genuine, or it was changed. Copy it again exactly as received.',
    wrong_computer: 'This key was made for a different computer. Send THIS computer\'s code to get a key for it.',
    not_yet_valid: 'This key starts on a later date.',
    expired: 'This key has expired. Please renew your subscription.'
  })[reason] || ('Key not accepted (' + reason + ').');
}

/** Apply clock-rollback guard: effective date = max(systemToday, lastSeen). */
function effectiveClock(systemToday, lastSeen) {
  if (!lastSeen) return systemToday;
  return systemToday > lastSeen ? systemToday : lastSeen;
}

module.exports = {
  LICENCE_VERSION, VALIDITY_DAYS, WARN_DAYS, WARN_DAYS_V2, MONTH_CHOICES,
  loadPublicKey, loadPrivateKey, issueLicence, issueSubscription, verifyLicence,
  payloadString, daysFrom, addMonths, todayUTC, effectiveClock, machineCode, normaliseCode, lastValidDay, reasonText
};
