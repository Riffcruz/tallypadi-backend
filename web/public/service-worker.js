const CACHE_PREFIX = 'tallypadi-';
const CACHE_NAME = 'tallypadi-v2';

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
