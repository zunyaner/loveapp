// Bump version when assets change to invalidate old caches
const CACHE = 'love-app-v10';
const FONT_CACHE = 'love-app-fonts-v1';
const DYNAMIC_CACHE = 'love-app-dynamic-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './sync.js'
];

// ===== Install: cache core assets =====
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ===== Activate: clean old caches, claim clients =====
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== FONT_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== Fetch: smart caching strategy =====
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-first for Open-Meteo APIs (geocoding + weather)
  if (url.hostname === 'geocoding-api.open-meteo.com' || url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(FONT_CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate for Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Cache-first for app assets, with background update
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.ok && (url.origin === self.location.origin || url.origin === '')) {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => {});

      // Always return cached version first (offline-first for app)
      if (cached) {
        fetchPromise; // fire and forget for background update
        return cached;
      }
      return fetchPromise.then(res => res || cached);
    })
  );
});

// ===== Push notifications =====
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: '💕 小窝', body: '想你啦～' };
  const { title, body, icon, badge, data: notifData } = data;
  e.waitUntil(
    self.registration.showNotification(title || '💕 小窝', {
      body: body || '想你啦～',
      icon: icon || '/icon-192.png',
      badge: badge || '/icon-192.png',
      data: notifData,
      vibrate: [200, 100, 200],
      tag: 'love-app',
      requireInteraction: true
    })
  );
});

// ===== Notification click: open app =====
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

// ===== Background sync: pull data when back online =====
self.addEventListener('sync', e => {
  if (e.tag === 'pull-data') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'bg-sync' });
        });
      })
    );
  }
});

// ===== Message from main thread =====
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
