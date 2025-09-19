const CACHE_NAME = 'overtime-app-cache-v1.9.5'; // نسخه جدید برای تشخیص آپدیت
const urlsToCache = [
  '/',
  'index.html',
  'manifest.json'
  // توجه: کتابخانه‌های خارجی دیگر در اینجا کش نمی‌شوند تا از خطا جلوگیری شود.
];

// 1. نصب سرویس ورکر و کش کردن فایل‌های اصلی
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // <<< مهم: سرویس ورکر جدید را فورا فعال می‌کند
  );
});

// 2. فعال‌سازی سرویس ورکر جدید
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // حذف تمام کش‌های قدیمی
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // <<< مهم: کنترل تمام صفحات باز را به دست می‌گیرد
  );
});

// 3. پاسخ به درخواست‌ها (استراتژی Cache First)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // اگر در کش بود، از کش پاسخ بده
        if (response) {
          return response;
        }
        // اگر نبود، از شبکه درخواست کن
        return fetch(event.request);
      }
    )
  );
});
