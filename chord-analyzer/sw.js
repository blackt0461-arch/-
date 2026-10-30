// 電波が無くてもアプリを開けるようにする（サービスワーカー）
// 方針：まずネットから最新を取り、取れなければ前に保存したものを使う（ネット優先）。
// こうすると、更新はいつもすぐ反映され、オフラインのときだけ保存した版で動く。

const CACHE = 'chord-analyzer';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
