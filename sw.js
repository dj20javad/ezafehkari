// A more stable cache name to reduce the risk of accidental data clearing by the browser.
const CACHE_NAME = 'overtime-pwa-cache'; 
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap',
  './jalali-moment.browser.js',
  './xlsx.full.min.js',
  './Logo.png',
  'https://placehold.co/192x192/4a90e2/ffffff?text=App',
  'https://placehold.co/512x512/4a90e2/ffffff?text=App'
];

// Install a service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate the service worker
self.addEventListener('activate', event => {
  // This event fires when the new service worker becomes active.
  // It's a good place to clean up old caches.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If the cache name is not our current cache, delete it.
          // This prevents old, unused cache files from piling up.
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});


// Cache and return requests
self.addEventListener('fetch', event => {
    // We only want to cache GET requests.
    if (event.request.method !== 'GET') {
        return;
    }

    // Use a "Cache, falling back to network" strategy
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Cache hit - return response
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Not in cache - fetch from network
                return fetch(event.request).then(
                    networkResponse => {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // IMPORTANT: Clone the response. A response is a stream
                        // and can only be consumed once. Since we want the browser 
                        // to consume the response and the cache to consume the
                        // response, we need to clone it.
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                ).catch(error => {
                    // This will happen if the network is unavailable.
                    // You could return a custom offline page here if you have one cached.
                    console.log('Fetch failed; returning offline page instead.', error);
                });
            })
    );
});


