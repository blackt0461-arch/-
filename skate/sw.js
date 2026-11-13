// スケートラップ：電波がなくても開けるようにする（Service Worker）
// 画面は「まずネットから・だめなら保存した分」。モデルと読みこむ部品（jsDelivr）は「保存した分を先に」。
const CACHE = 'skate-v28';
const SHELL = ['./', './index.html', './app.js', './vision.js', './motion.js', './members.js', './stand.js', './share.js', './collect.js', './liveid.js', './relay-config.js', './icon.svg', './icon-192.png', './apple-touch-icon.png', './manifest.webmanifest', './models/efficientdet_lite0.tflite'];
// 人を見つける部品（外の置き場から読むもの）。電波のない所でも「設置して測る」が動くよう、先に取っておく。取れなくてもアプリは入れる
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const EXTRA = [MP + '/vision_bundle.mjs', MP + '/wasm/vision_wasm_internal.js', MP + '/wasm/vision_wasm_internal.wasm'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => Promise.allSettled(EXTRA.map(u => c.add(u))))).then(() => self.skipWaiting())); });
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
