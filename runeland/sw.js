// ルーンランド：ホーム画面に置けるようにする（画面とプログラムを保存。遊ぶにはネットが必要）
const CACHE = 'runeland-v14';
const SHELL = ['./', './index.html', './style.css', './app.js', './game.js', './net.js', './ai.js', './audio.js', './icons.js', './board3d.js', './relay-config.js', './icon.svg', './icon-192.png', './apple-touch-icon.png', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!same && !cdn) return;
  const keep = res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
  // 3Dのモデルと読みこむ部品は、保存した分を先に使う（2回目から速い。モデルは名前が同じなら中身も同じ）
  if (cdn || url.pathname.includes('/models/')) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep))); return; }
  // 新しい方を先に。つながらない時は保存した分
  e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true })));
});
