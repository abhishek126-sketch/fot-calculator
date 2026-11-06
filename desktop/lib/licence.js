'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENCE_VERSION = 1;
const VALIDITY_DAYS = 365;
const WARN_DAYS = 30;

function loadPublicKey(pemPath) {
  const pem = fs.readFileSync(pemPath, 'utf8');
  return crypto.createPublicKey(pem);
}

function loadPrivateKey(pemPathOrPem) {
  const pem = pemPathOrPem.includes('BEGIN') ? pemPathOrPem : fs.readFileSync(pemPathOrPem, 'utf8');
  return crypto.createPrivateKey(pem);
}

/** Canonical payload string for signing/verifying */
function payloadString(payload) {
  return [
    'v' + (payload.v || LICENCE_VERSION),
    String(payload.name || '').trim(),
    String(payload.issued || ''),
    String(payload.expires || '')
  ].join('|');
}

function daysFrom(iso, days) {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUTC(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Issue a licence. Returns compact key: FOT1.<base64url(payloadJson)>.<base64url(sig)>
 */
function issueLicence(privateKey, { name, issued, notes }) {
  const issuedDate = issued || todayUTC();
  const expires = daysFrom(issuedDate, VALIDITY_DAYS);
  const payload = { v: LICENCE_VERSION, name: String(name).trim(), issued: issuedDate, expires };
  if (notes) payload.notes = String(notes).trim();
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = crypto.sign(null, Buffer.from(payloadString(payload), 'utf8'), privateKey);
  const key = 'FOT1.' + body.toString('base64url') + '.' + Buffer.from(sig).toString('base64url');
  return { key, payload };
}

/**
 * Verify licence key with public key. clockDate = YYYY-MM-DD effective date (after rollback guard).
 * Returns { ok, reason?, payload?, daysLeft?, warn? }
 */
function verifyLicence(publicKey, keyText, clockDate) {
  try {
    const raw = String(keyText || '').trim().replace(/\s+/g, '');
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'FOT1') {
      return { ok: false, reason: 'invalid_format' };
    }
    const body = Buffer.from(parts[1], 'base64url');
    const sig = Buffer.from(parts[2], 'base64url');
    let payload;
    try { payload = JSON.parse(body.toString('utf8')); } catch {
      return { ok: false, reason: 'invalid_payload' };
    }
    if (!payload.name || !payload.issued || !payload.expires) {
      return { ok: false, reason: 'missing_fields' };
    }
    const good = crypto.verify(null, Buffer.from(payloadString(payload), 'utf8'), publicKey, sig);
    if (!good) return { ok: false, reason: 'bad_signature', payload };
    const today = clockDate || todayUTC();
    if (today < payload.issued) {
      return { ok: false, reason: 'not_yet_valid', payload };
    }
    const expired = today > payload.expires;
    const daysLeft = Math.ceil((new Date(payload.expires + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    return {
      ok: !expired,
      expired,
      reason: expired ? 'expired' : undefined,
      payload,
      daysLeft,
      warn: !expired && daysLeft <= WARN_DAYS
    };
  } catch (e) {
    return { ok: false, reason: 'error:' + (e.message || e) };
  }
}

/** Apply clock-rollback guard: effective date = max(systemToday, lastSeen). */
function effectiveClock(systemToday, lastSeen) {
  if (!lastSeen) return systemToday;
  return systemToday > lastSeen ? systemToday : lastSeen;
}

module.exports = {
  LICENCE_VERSION, VALIDITY_DAYS, WARN_DAYS,
  loadPublicKey, loadPrivateKey, issueLicence, verifyLicence,
  payloadString, daysFrom, todayUTC, effectiveClock
};
