/**
 * SafeMap Service Worker
 *
 * Three-tier caching strategy:
 *  - /api/maps/*        → network-first + cache fallback (offline project data access)
 *  - /uploads/ /maps/   → cache-first (large floor plan images, rarely change)
 *  - everything else    → network-first (Next.js pages/assets)
 */

const CACHE_NAME = 'safemap-v2';

// App shell pages to precache on install
const PRECACHE_URLS = ['/', '/setup', '/navigate'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove old caches from previous SW versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── API routes: network-first, cache fallback ─────────────────────────────
  // Always try fresh data; serve cache if offline so the app still works.
  if (url.pathname.startsWith('/api/maps')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses for offline use
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Floor plan images: cache-first (only for uploads, not /maps/ config data)
  // Large binary assets that essentially never change once uploaded.
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Only cache successful responses — never cache 404s
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) =>
              cache.put(event.request, response.clone())
            );
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Everything else: network-first, stale fallback ───────────────────────
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache navigations and static assets for offline fallback
        if (event.request.destination === 'document' || event.request.destination === 'script' || event.request.destination === 'style') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
