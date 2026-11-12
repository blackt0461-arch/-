// スケートラップ：電波がなくても開けるようにする（Service Worker）
// 画面は「まずネットから・だめなら保存した分」。モデルと読みこむ部品（jsDelivr）は「保存した分を先に」。
const CACHE = 'skate-v16';
const SHELL = ['./', './index.html', './app.js', './vision.js', './motion.js', './members.js', './stand.js', './share.js', './relay-config.js', './icon.svg', './manifest.webmanifest', './models/efficientdet_lite0.tflite'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!same && !cdn) return;
  const keep = res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
  if (same && !url.pathname.includes('/models/')) { // 画面とプログラム：新しい方を先に
    e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep)));
});
