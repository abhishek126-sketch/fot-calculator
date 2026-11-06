/* fot-calc-v8 — bump CACHE on every deploy so clients drop stale assets. */
const CACHE = 'fot-calc-v8';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'equations.js', 'clinical.js', 'config.js', 'storage.js', 'drive-sync.js', 'features.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
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
  const path = url.pathname.split('/').pop() || 'index.html';
  if (path === 'sw.js' || path === 'index.html' || path === 'config.js' || path === '' || e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  })));
});
