// Bump the version whenever the planner shell or its assets change.
const CACHE_VERSION = 'kfp-v1-20261101';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE, TILE_CACHE];
const SCOPE = self.registration.scope;
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest'].map(path => new URL(path, SCOPE).href);
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
];
const MAX_TILES = 300;

function excluded(request, url) {
  return request.method !== 'GET' || url.href.toLowerCase().includes('api.php') ||
    url.origin === 'https://trip.yi-jia-zi.com' ||
    /(^|\.)(drive|accounts)\.google\.com$/.test(url.hostname);
}
function cacheable(response) { return response.ok || response.type === 'opaque'; }
async function timedFetch(request, ms = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(request, {signal: controller.signal}); }
  finally { clearTimeout(timer); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS.map(url => new Request(url, {cache: 'reload'})));
    // The first page has loaded its libraries before registration. Warm these
    // explicitly so its very next visit can use maps and sorting offline.
    const assets = await caches.open(STATIC_CACHE);
    await Promise.allSettled(CDN_ASSETS.map(async url => {
      const request = new Request(url, {mode: 'cors', cache: 'reload'});
      const response = await timedFetch(request, 5000);
      if (cacheable(response)) await assets.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Leave caches belonging to other apps on this origin alone.
    await Promise.all((await caches.keys()).filter(name => name.startsWith('kfp-') && !CURRENT_CACHES.includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await timedFetch(request);
    if (!response.ok) throw new Error('Page unavailable');
    // Ignore query parameters such as backend overrides in the offline shell.
    const url = new URL(request.url);
    if (url.pathname === new URL('./', SCOPE).pathname || url.pathname === new URL('./index.html', SCOPE).pathname) {
      await Promise.all(SHELL_URLS.slice(0, 2).map(key => cache.put(key, response.clone()))).catch(() => {});
    }
    return response;
  } catch (error) {
    return (await cache.match(SHELL_URLS[1])) || (await cache.match(SHELL_URLS[0])) || Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(request.url === SHELL_URLS[2] ? SHELL_CACHE : STATIC_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async response => {
    if (cacheable(response)) await cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  event.waitUntil(refresh.catch(() => {}));
  return cached || refresh;
}

// Serialize tile writes and trimming so concurrent map requests respect the cap.
let tileWrites = Promise.resolve();
async function tile(request) {
  const cache = await caches.open(TILE_CACHE), cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) {
    const copy = response.clone();
    tileWrites = tileWrites.catch(() => {}).then(async () => {
      await cache.put(request, copy);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map(key => cache.delete(key)));
    });
    // Storage quota errors must not discard a successful network response.
    await tileWrites.catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // No respondWith means direct network, including every sync read and write.
  if (excluded(request, url)) return;
  const sameOrigin = url.origin === self.location.origin && url.href.startsWith(SCOPE);
  if (sameOrigin && (request.mode === 'navigate' || request.destination === 'document' || SHELL_URLS.slice(0, 2).includes(url.origin + url.pathname))) {
    event.respondWith(navigation(request));
  } else if (/(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)) {
    event.respondWith(tile(request));
  } else if ((sameOrigin || ['https://unpkg.com', 'https://cdn.jsdelivr.net'].includes(url.origin)) &&
      /\.(js|css|svg|png|jpe?g|webp|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
