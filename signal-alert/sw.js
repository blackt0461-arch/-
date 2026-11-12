// オフラインでもアプリ画面を開けるようにする。ping.txt は絶対にキャッシュしない。
const CACHE = 'signal-alert-v6';
const ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'map.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/ping.txt')) return; // 測定はネットワークへ直接
  if (e.request.method !== 'GET') return;
  // ネット優先:つながる時は最新版を取得してキャッシュを更新し、圏外の時だけキャッシュを使う
  // (キャッシュ優先だと、修正版を公開しても利用者の画面が古いまま残るため)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
