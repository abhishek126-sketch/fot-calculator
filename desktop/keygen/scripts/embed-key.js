'use strict';
const fs = require('fs');
const path = require('path');
const fromEnv = process.env.FOT_LICENCE_PRIVATE_KEY;
const altPath = '/workspace/fot-desktop/licensing/fot-licence-private.pem';
const localPath = process.env.FOT_LICENCE_PRIVATE_KEY_PATH || altPath;
let pem = fromEnv;
if (!pem) {
  if (!fs.existsSync(localPath)) {
    console.error('No private key available');
    process.exit(1);
  }
  pem = fs.readFileSync(localPath, 'utf8');
}
pem = pem.replace(/\\n/g, '\n');
if (!pem.includes('BEGIN')) { console.error('Bad PEM'); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '..', 'embedded-private.pem'), pem, { mode: 0o600 });
// Copy licence.js next to main for require('../lib/licence') — in packaged app use local copy
const licSrc = path.join(__dirname, '..', '..', 'lib', 'licence.js');
const licDestDir = path.join(__dirname, '..', 'lib');
fs.mkdirSync(licDestDir, { recursive: true });
fs.copyFileSync(licSrc, path.join(licDestDir, 'licence.js'));
console.log('Embedded private key + licence.js for keygen build');
