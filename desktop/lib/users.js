'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

function hashPassword(password, saltBuf) {
  const salt = saltBuf || crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    algo: 'scrypt',
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P
  };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const salt = Buffer.from(record.salt, 'base64');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, {
    N: record.N || SCRYPT_N, r: record.r || SCRYPT_R, p: record.p || SCRYPT_P
  });
  const expected = Buffer.from(record.hash, 'base64');
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

function loadUsers(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { version: 1, users: [] };
  }
}

function saveUsers(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function findUser(db, username) {
  const u = String(username || '').trim().toLowerCase();
  return (db.users || []).find(x => x.username === u) || null;
}

function createAdmin(db, username, password, displayName) {
  if ((db.users || []).length) throw new Error('Admin already exists');
  const un = String(username).trim().toLowerCase();
  if (!un || !password) throw new Error('Username and password required');
  const cred = hashPassword(password);
  db.users = [{
    username: un,
    displayName: displayName || username,
    role: 'admin',
    createdAt: new Date().toISOString(),
    ...cred
  }];
  return db.users[0];
}

function addUser(db, { username, password, displayName, role }, actorIsAdmin) {
  if (!actorIsAdmin) throw new Error('Admin only');
  const un = String(username).trim().toLowerCase();
  if (!un || !password) throw new Error('Username and password required');
  if (findUser(db, un)) throw new Error('User already exists');
  const cred = hashPassword(password);
  const user = {
    username: un,
    displayName: displayName || username,
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
    ...cred
  };
  db.users.push(user);
  return user;
}

function removeUser(db, username, actorUsername) {
  const un = String(username).trim().toLowerCase();
  if (un === String(actorUsername).trim().toLowerCase()) throw new Error('Cannot remove yourself');
  const before = db.users.length;
  db.users = db.users.filter(u => u.username !== un);
  if (db.users.length === before) throw new Error('User not found');
  if (!db.users.some(u => u.role === 'admin')) throw new Error('Cannot remove the last admin');
}

function resetPassword(db, username, newPassword, actorIsAdmin) {
  if (!actorIsAdmin) throw new Error('Admin only');
  const u = findUser(db, username);
  if (!u) throw new Error('User not found');
  if (!newPassword) throw new Error('Password required');
  const cred = hashPassword(newPassword);
  Object.assign(u, cred);
  u.passwordResetAt = new Date().toISOString();
  return u;
}

function authenticate(db, username, password) {
  const u = findUser(db, username);
  if (!u) return { ok: false, reason: 'unknown_user' };
  if (!verifyPassword(password, u)) return { ok: false, reason: 'bad_password' };
  return {
    ok: true,
    user: { username: u.username, displayName: u.displayName, role: u.role }
  };
}

/** Sanitize username for folder names */
function userFolderName(username) {
  return String(username || 'user').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'user';
}

module.exports = {
  hashPassword, verifyPassword, loadUsers, saveUsers, findUser,
  createAdmin, addUser, removeUser, resetPassword, authenticate, userFolderName
};
