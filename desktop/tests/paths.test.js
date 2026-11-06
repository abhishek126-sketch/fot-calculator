const test = require('node:test'), assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../lib/paths');

test('ensureTree creates Documents/FOT Calculator structure', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fot-docs-'));
  const dirs = P.ensureTree(tmp);
  assert.ok(fs.existsSync(dirs.licences));
  assert.ok(fs.existsSync(dirs.updates));
  assert.ok(fs.existsSync(dirs.keyGenerator));
  assert.ok(fs.existsSync(dirs.reports));
  assert.equal(dirs.root, path.join(tmp, 'FOT Calculator'));
});
