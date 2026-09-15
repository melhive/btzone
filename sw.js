// BT Zone service worker
// APP_VERSION drives both cache-busting and the "What's New" screen.
// Bump this string (and add an entry to js/changelog.js) on every release.
const APP_VERSION = '1.0.1';
const CACHE_NAME = `btzone-cache-${APP_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/changelog.js',
  './js/db.js',
  './js/bluetooth.js',
  './js/qr.js',
  './js/state.js',
  './js/render.js',
  './js/app.js',
  './vendor/qrcode.min.js',
  './vendor/jsQR.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Tell open tabs a new version has taken over so the UI can
        // show the "What's New" sheet on next load/refresh.
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'BTZONE_UPDATED', version: APP_VERSION }));
        });
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline fallback to cache
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
