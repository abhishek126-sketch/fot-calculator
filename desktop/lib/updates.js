'use strict';
const crypto = require('crypto');
const path = require('path');
const { updateFolderName } = require('./paths');

const REPO = 'abhishek126-sketch/fot-calculator';
const API = 'https://api.github.com/repos/' + REPO + '/releases';

function isDesktopTag(tag) {
  return /^desktop-v\d+\.\d+\.\d+/i.test(String(tag || ''));
}

function parseVersion(tag) {
  const m = String(tag || '').match(/desktop-v(\d+\.\d+\.\d+)/i);
  return m ? m[1] : null;
}

function cmpSemver(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

async function fetchLatestDesktopRelease(fetchFn = fetch) {
  const res = await fetchFn(API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FOT-Calculator-Desktop' }
  });
  if (!res.ok) throw new Error('GitHub releases HTTP ' + res.status);
  const list = await res.json();
  const desktop = (list || []).filter(r => isDesktopTag(r.tag_name) && !r.draft);
  desktop.sort((a, b) => cmpSemver(parseVersion(b.tag_name), parseVersion(a.tag_name)));
  if (!desktop.length) return null;
  const r = desktop[0];
  const exe = (r.assets || []).find(a => /\.exe$/i.test(a.name) && /FOT-Calculator-Setup/i.test(a.name));
  const shaAsset = (r.assets || []).find(a => /sha256/i.test(a.name) || /\.sha256$/i.test(a.name));
  return {
    tag: r.tag_name,
    version: parseVersion(r.tag_name),
    name: r.name,
    body: r.body || '',
    publishedAt: r.published_at,
    exeName: exe && exe.name,
    exeUrl: exe && exe.browser_download_url,
    shaUrl: shaAsset && shaAsset.browser_download_url,
    htmlUrl: r.html_url
  };
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseSha256File(text, expectedName) {
  // formats: "hex  filename" or "hex" alone or "hex *filename"
  const lines = String(text || '').trim().split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(\S+)?/);
    if (m) {
      if (!expectedName || !m[2] || m[2].endsWith(expectedName) || m[2] === expectedName) {
        return m[1].toLowerCase();
      }
    }
  }
  const only = String(text || '').trim().match(/^([a-fA-F0-9]{64})$/);
  return only ? only[1].toLowerCase() : null;
}

function localUpdatePath(updatesRoot, version, dateStr) {
  return path.join(updatesRoot, updateFolderName(dateStr, version));
}

module.exports = {
  REPO, isDesktopTag, parseVersion, cmpSemver,
  fetchLatestDesktopRelease, sha256Buffer, parseSha256File, localUpdatePath, updateFolderName
};
