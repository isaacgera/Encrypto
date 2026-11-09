/*
 * Encrypto — sw.js (service worker)
 * -----------------------------------------------------------------------------
 * Caches ONLY the static app shell so Encrypto works fully offline. It never
 * caches or transmits vault data — the vault lives in localStorage (which a
 * service worker cannot read), and the app makes ZERO network requests for
 * data by design. This worker only serves local assets.
 *
 * Release discipline: bump CACHE_NAME on every release so clients pick up new
 * assets (a cache-first worker otherwise serves stale files).
 * -----------------------------------------------------------------------------
 */
var CACHE_NAME = 'encrypto-v1.1.3';

// Core shell — must all cache or the install fails (atomic addAll).
var CORE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/crypto.js',
  './js/attachments.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest'
];

// Optional assets — best-effort; a miss here must not fail the whole install.
var OPTIONAL_ASSETS = [
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // core first (atomic)
      return cache.addAll(CORE_ASSETS).then(function () {
        // optional, best-effort — swallow individual failures
        return Promise.all(OPTIONAL_ASSETS.map(function (url) {
          return cache.add(url).catch(function () { /* ignore missing optional asset */ });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle same-origin GET requests. Anything else (there shouldn't be
  // any) is left to the network — we never proxy data.
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for the local app shell, with a network fallback that also
  // updates the cache for next time. For navigations, fall back to index.html
  // so a deep refresh still works offline.
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        // cache successful same-origin responses opportunistically
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
