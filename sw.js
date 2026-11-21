/* fot-calc-v13 — bump CACHE on every deploy so clients drop stale assets.
 * Network-first for every file of this app (update 2.1.1): an update shows the next time the app is opened, and the
 * page and its scripts always come from the same version. The cache is only a fallback when offline. */
const CACHE = 'fot-calc-v13';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'units.js', 'equations.js', 'clinical.js', 'gli-global-data.js', 'spirometry.js', 'config.js', 'storage.js', 'drive-sync.js', 'folder-sync.js', 'features.js', 'desktop-ui.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Always try the network first (bypassing the browser's HTTP cache); keep a copy for offline use.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
