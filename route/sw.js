// いどうナビ：通知を受け取る（Web プッシュ）。ページの部品はためこまない（いつも新しい版を読む）。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: e.data ? e.data.text() : 'いどうナビ' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'いどうナビ', {
    body: d.body || '', tag: d.tag || undefined, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.includes('/route/')) { await c.focus(); return; }
    await self.clients.openWindow('./');
  })());
});
