const test = require('node:test'), assert = require('node:assert');
const U = require('../lib/users');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('hash and verify password', () => {
  const h = U.hashPassword('secret123');
  assert.ok(U.verifyPassword('secret123', h));
  assert.ok(!U.verifyPassword('wrong', h));
});

test('create admin, add user, auth, separation folder', () => {
  const db = { version: 1, users: [] };
  U.createAdmin(db, 'Owner', 'pass1', 'Dr Owner');
  assert.equal(db.users[0].role, 'admin');
  U.addUser(db, { username: 'tech1', password: 'pass2', displayName: 'Tech' }, true);
  assert.equal(U.authenticate(db, 'tech1', 'pass2').ok, true);
  assert.equal(U.authenticate(db, 'tech1', 'x').ok, false);
  assert.equal(U.userFolderName('Tech One!'), 'tech_one');
  U.resetPassword(db, 'tech1', 'newpass', true);
  assert.equal(U.authenticate(db, 'tech1', 'newpass').ok, true);
  U.removeUser(db, 'tech1', 'owner');
  assert.equal(db.users.length, 1);
});

test('cannot remove last admin', () => {
  const db = { version: 1, users: [] };
  U.createAdmin(db, 'only', 'p', 'O');
  assert.throws(() => U.removeUser(db, 'only', 'someone'));
});
