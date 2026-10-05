const CACHE_PREFIX = 'tallypadi-';
const CACHE_NAME = 'tallypadi-v3';

self.addEventListener('install', () => {
  // Do not pre-cache Next.js pages. Their HTML references build-specific
  // chunks and becomes unsafe as soon as a new deployment goes live.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first keeps deployed Next.js builds fresh. The cached response is
// used only when the network is unavailable, allowing a previously opened POS
// screen to load without bringing back stale chunks during normal operation.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const cacheable = request.mode === 'navigate'
    || ['script', 'style', 'font', 'image'].includes(request.destination);
  if (!cacheable) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate' && url.pathname === '/sales') {
          const salesPage = await caches.match('/sales');
          if (salesPage) return salesPage;
        }
        return Response.error();
      })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_SALES_SHELL' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.slice(0, 80).filter(value => {
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin
        && (url.pathname === '/sales' || url.pathname.startsWith('/_next/static/'));
    } catch {
      return false;
    }
  });

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(urls.map(async value => {
      try {
        const response = await fetch(value, { credentials: 'same-origin' });
        if (response.ok) await cache.put(value, response);
      } catch {
        // A later online visit will fill any missing shell asset.
      }
    })))
  );
});

// --- PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || 'TallyPadi Support';
  const options = {
    body: payload.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: payload.data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const ticketId = event.notification.data?.ticketId;
  const urlToOpen = ticketId ? `/agent/dashboard?ticketId=${ticketId}` : '/agent/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If already open, focus
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('/agent/dashboard') && 'focus' in client) {
          if (ticketId) {
             client.postMessage({ type: 'OPEN_TICKET', ticketId });
          }
          return client.focus();
        }
      }
      // Open new
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
