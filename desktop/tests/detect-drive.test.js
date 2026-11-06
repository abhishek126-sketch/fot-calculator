const test = require('node:test'), assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mirror detect logic lightly for portable test
function detectGoogleDriveCandidates(env, existsFn) {
  const found = [];
  const seen = new Set();
  const push = (p) => {
    const n = path.normalize(p);
    if (!seen.has(n.toLowerCase()) && existsFn(n)) {
      seen.add(n.toLowerCase());
      found.push(n);
    }
  };
  const home = env.USERPROFILE || env.HOME || '';
  push(path.join(home, 'Google Drive', 'My Drive'));
  push(path.join(home, 'Google Drive'));
  push('G:\\My Drive');
  return found;
}

test('detect prefers USERPROFILE Google Drive My Drive when present', () => {
  const fakeHome = path.join(os.tmpdir(), 'fot-fake-home-drive');
  const myDrive = path.join(fakeHome, 'Google Drive', 'My Drive');
  fs.mkdirSync(myDrive, { recursive: true });
  const found = detectGoogleDriveCandidates({ USERPROFILE: fakeHome }, (p) => {
    try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; }
  });
  assert.ok(found.some(p => p.includes('My Drive')));
});
