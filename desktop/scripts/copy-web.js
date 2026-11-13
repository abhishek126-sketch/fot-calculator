'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dest = path.join(__dirname, '..', 'app-web');

const files = [
  'index.html', 'manifest.webmanifest', 'icon.svg', 'sw.js',
  'equations.js', 'clinical.js', 'gli-global-data.js', 'spirometry.js', 'config.js', 'storage.js', 'drive-sync.js',
  'folder-sync.js', 'features.js', 'desktop-ui.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'
];

fs.rmSync(dest, { recursive: true, force: true });
for (const rel of files) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
console.log('Copied', files.length, 'web assets to', dest);
