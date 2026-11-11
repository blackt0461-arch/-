// アプリをスマホにとっておく（サービスワーカー）
// ・アプリの部品（画面・見た目・プログラム・図・フォント・数式の道具）はとっておいたものをすぐ出し、裏で新しいものに入れかえる
// ・問題データ（data/*.json）はネットを先に見て、つながらないときだけとっておいたものを使う
// ・新しい版を出すときは VERSION を上げる（index.html の ?v= と同じにする）。上がると古いものを消して入れかわる
const VERSION = '1.14.0';
const CACHE = 'test-study-' + VERSION;
const CORE = [
  './', 'index.html', `style.css?v=${VERSION}`, `js/app.js?v=${VERSION}`, 'js/store.js', 'js/memory.js', 'js/cloud.js',
  'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'data/courses.json',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' で、ブラウザにとってある古い部品ではなく、かならず新しい部品をとる（部品の版がまざらないように）
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('test-study-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const SAVE_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !SAVE_HOSTS.includes(url.hostname)) return; // ドライブなどはそのまま
  if (same && !url.pathname.includes('/test-study/')) return;
  // 問題データ：ネット優先
  if (same && /\/data\/.*\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // それ以外：とっておいたものをすぐ出し、裏で新しくする
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  }));
});
