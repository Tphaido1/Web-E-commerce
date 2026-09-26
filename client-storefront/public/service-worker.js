const CACHE_NAME = 'ecommerce-pwa-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Cài đặt Service Worker và cache các tài nguyên tĩnh nền tảng
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [ServiceWorker] Pre-caching static offline assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Kích hoạt và dọn dẹp các cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 [ServiceWorker] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Xử lý fetch request: Chiến lược Network-First with Cache Fallback cho API & Cache-First cho Assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Chỉ can thiệp các request GET
  if (request.method !== 'GET') return;

  // Với API lấy danh mục/sản phẩm: Network-First rồi fallback về Cache
  if (url.pathname.includes('/api/v1/products') || url.pathname.includes('/api/v1/categories')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('📡 [ServiceWorker] Mạng ngoại tuyến -> Phục vụ từ Cache:', request.url);
          return caches.match(request);
        })
    );
    return;
  }

  // Với tài nguyên tĩnh: Cache-First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).catch(() => {
        // Fallback về trang chủ nếu mất mạng khi duyệt URL
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});
