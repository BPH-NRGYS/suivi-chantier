// Mise en cache de l'application pour un fonctionnement sans réseau.
// Changer VERSION à chaque mise à jour du code pour forcer le rafraîchissement.
const VERSION = 'v2';
const CACHE = 'suivi-chantier-' + VERSION;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'img/logo.jpg', 'img/icon-192.png', 'img/icon-512.png',
  'js/db.js', 'js/zip.js', 'js/model.js', 'js/annot.js', 'js/plans.js', 'js/export-pdf.js',
  'js/export-docx.js', 'js/export-xlsx.js', 'js/backup.js', 'js/app.js',
  'lib/pdfjs/pdf.min.mjs', 'lib/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour récupérer les mises à jour), cache si pas de réseau
// ou si le réseau ne répond pas en 3 secondes (4G faible sur chantier).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const net = fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  });
  const fromCache = () => caches.match(e.request, { ignoreSearch: true });
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000)).then(fromCache);
  e.respondWith(
    Promise.race([net, timeout.then((r) => r || net)])
      .catch(() => fromCache().then((r) => r || Response.error()))
  );
});
