'use strict';
const path = require('path');
const fs = require('fs');

function fotRoot(documentsPath) {
  return path.join(documentsPath, 'FOT Calculator');
}

function ensureTree(documentsPath) {
  const root = fotRoot(documentsPath);
  const dirs = {
    root,
    app: path.join(root, 'App'),
    updates: path.join(root, 'Updates'),
    licences: path.join(root, 'Licences'),
    keyGenerator: path.join(root, 'Key Generator'),
    backups: path.join(root, 'Backups'),
    reports: path.join(root, 'Reports')
  };
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));
  return dirs;
}

function updateFolderName(dateStr, version) {
  const d = dateStr || new Date().toISOString().slice(0, 10);
  const v = String(version || 'unknown').replace(/[^0-9A-Za-z._-]+/g, '_');
  return `${d}_v${v}`;
}

function userReportsDir(reportsRoot, username) {
  const { userFolderName } = require('./users');
  return path.join(reportsRoot, userFolderName(username));
}

module.exports = { fotRoot, ensureTree, updateFolderName, userReportsDir };
