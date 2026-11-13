// スケートラップ：電波がなくても開けるようにする（Service Worker）
// 画面は「まずネットから・だめなら保存した分」。モデルと読みこむ部品（jsDelivr）は「保存した分を先に」。
const CACHE = 'skate-v31';
// 大きくて中身の変わらないもの（人を見つけるモデルと部品）は、版が上がっても消さない別の入れ物に入れる
const BIG = 'skate-big-v1';
const SHELL = ['./', './index.html', './app.js', './vision.js', './motion.js', './members.js', './stand.js', './share.js', './collect.js', './liveid.js', './relay-config.js', './icon.svg', './icon-192.png', './apple-touch-icon.png', './manifest.webmanifest'];
// 入れるのは画面とプログラムだけ（小さいのですぐ終わる）。大きいものは、画面の側（app.js）が開いたあとで取りに行く
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== BIG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
let slowUntil = 0;
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!same && !cdn) return;
  const keep = name => res => { if (res.ok) { const cp = res.clone(); caches.open(name).then(c => c.put(req, cp)); } return res; };
  if (same && !url.pathname.includes('/models/')) {
    // 画面とプログラム：新しい方を先に。ただし電波が弱くて返事が来ない時に待ち続けない（1.5秒で、保存した分を出す）
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      const net = fetch(req).then(keep(CACHE));
      if (!hit) return net;
      net.catch(() => { slowUntil = Date.now() + 60000; });
      if (Date.now() < slowUntil) return hit; // さっき返事が来なかった：しばらくは待たずに保存した分を出す
      return Promise.race([net, new Promise(r => setTimeout(() => { slowUntil = Date.now() + 60000; r(hit); }, 1500))]).catch(() => hit);
    })());
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep(BIG))));
});
