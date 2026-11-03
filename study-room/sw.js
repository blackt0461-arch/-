// オフラインでも開けるようにする。
// アプリ本体はネット優先（更新がすぐ届く）、家具の3Dデータや three.js は一度読んだら保存して使う。
const APP = 'studyroom-app-v1';
const ASSET = 'studyroom-assets-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'dl.polyhaven.org' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(ASSET).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request)));
  }
});
