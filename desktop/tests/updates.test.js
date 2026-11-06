const test = require('node:test'), assert = require('node:assert');
const Up = require('../lib/updates');
const path = require('path');

test('parse desktop tags and semver', () => {
  assert.ok(Up.isDesktopTag('desktop-v1.1.0'));
  assert.ok(!Up.isDesktopTag('v1.1.0'));
  assert.equal(Up.parseVersion('desktop-v1.2.3'), '1.2.3');
  assert.ok(Up.cmpSemver('1.1.0', '1.0.0') > 0);
  assert.ok(Up.cmpSemver('1.0.0', '1.1.0') < 0);
});

test('update folder naming', () => {
  assert.equal(Up.updateFolderName('2026-11-07', '1.1.0'), '2026-11-07_v1.1.0');
});

test('sha256 parse and hash', () => {
  const buf = Buffer.from('hello');
  const hex = Up.sha256Buffer(buf);
  assert.equal(hex.length, 64);
  const file = hex + '  FOT-Calculator-Setup-1.1.0.exe\n';
  assert.equal(Up.parseSha256File(file, 'FOT-Calculator-Setup-1.1.0.exe'), hex);
});

test('localUpdatePath', () => {
  const p = Up.localUpdatePath('/docs/Updates', '1.1.0', '2026-11-07');
  assert.ok(p.endsWith(path.join('2026-11-07_v1.1.0')));
});
