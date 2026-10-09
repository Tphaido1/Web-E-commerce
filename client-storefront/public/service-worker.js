const CACHE_PREFIX = 'storefront-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v3`;
const IMAGE_CACHE_NAME = `${CACHE_PREFIX}images-v3`;
const MAX_CACHED_IMAGES = 100;
const APP_SHELL = '/index.html';
const STATIC_ASSETS = [
  APP_SHELL,
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];
const PUBLIC_API_PREFIX = '/api/v1/products';

function getBuildAssets(html) {
  const assets = new Set(STATIC_ASSETS);
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype=["']module["']|\brel=["'](?:modulepreload|stylesheet)["']/i.test(tag)) continue;
    const source = tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (source?.startsWith('/')) assets.add(source);
  }
  return [...assets];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_SHELL, { cache: 'reload' });
    if (!response.ok) throw new Error(`Unable to fetch app shell: ${response.status}`);
    const html = await response.clone().text();
    await cache.put(APP_SHELL, response);
    await cache.addAll(getBuildAssets(html));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && ![CACHE_NAME, IMAGE_CACHE_NAME].includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function handlePublicProductRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const hasAuth = request.headers.has('Authorization');
  try {
    const response = await fetch(request);
    const cacheControl = response.headers.get('Cache-Control') || '';
    if (
      response.ok
      && !hasAuth
      && !/\b(?:private|no-store)\b/i.test(cacheControl)
    ) {
      try {
        await cache.put(request, response.clone());
      } catch (cacheError) {
        console.warn('[PWA] Unable to cache public product response:', cacheError);
      }
    }
    return response;
  } catch {
    const cachedResponse = hasAuth ? null : await cache.match(request);
    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Offline-Cache', 'hit');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({
      status: 'error',
      message: 'This product data is not available offline.',
      offline: true,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'miss' },
    });
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(APP_SHELL, response.clone());
      } catch (cacheError) {
        console.warn('[PWA] Unable to update the offline app shell:', cacheError);
      }
    }
    return response;
  } catch {
    const shell = await cache.match(APP_SHELL);
    if (shell) return shell;
    return new Response('The app shell is not available offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (cacheError) {
      console.warn('[PWA] Unable to cache static asset:', cacheError);
    }
  }
  return response;
}

async function handleExternalImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      try {
        await cache.put(request, response.clone());
        const cachedRequests = await cache.keys();
        if (cachedRequests.length > MAX_CACHED_IMAGES) {
          await cache.delete(cachedRequests[0]);
        }
      } catch (cacheError) {
        console.warn('[PWA] Unable to cache public image:', cacheError);
      }
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(PUBLIC_API_PREFIX)) {
    event.respondWith(handlePublicProductRequest(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    if (request.destination === 'image' && request.credentials !== 'include') {
      event.respondWith(handleExternalImage(request));
    }
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (['font', 'image', 'manifest', 'script', 'style'].includes(request.destination)) {
    event.respondWith(handleStaticAsset(request));
  }
});
