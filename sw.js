/* fot-calc-v7 — bump CACHE on every deploy so clients drop stale assets.
 * Root cause of "stuck on v4": old SW kept serving cached index/equations
 * while CDN/GitHub Pages also cache for ~10 min. skipWaiting + clients.claim
 * help, but CACHE must change and ASSETS must list every local script. */
const CACHE = 'fot-calc-v7';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'equations.js', 'clinical.js', 'storage.js', 'features.js',
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
  // Network-first for the SW script and HTML shell so deploys are not stuck behind old cache
  const path = url.pathname.split('/').pop() || 'index.html';
  if (path === 'sw.js' || path === 'index.html' || path === '' || e.request.mode === 'navigate') {
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
