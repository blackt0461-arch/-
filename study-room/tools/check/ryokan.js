// 旅館シリーズの確かめ（3D担当 2026-11-12）。node tools/check/ryokan.js
// 和室に旅館の家具を全部置いた写真（昼・夜）、ガチャ画面（旅館とバンドが並ぶ・のこり日数）、10連、図鑑、11/20 にバンドが消えても家具が残るか。写真は tools/check/out/ryokan-*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await mock(ctx);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.addInitScript((q) => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', q); }, process.env.Q || 'high');
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);
  const O = (n) => path.join(OUT, 'ryokan-' + n + '.png');
  let bad = 0; const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) bad++; };
  // ── 旅館の家具を2つの部屋に置く（和室：客室／趣味部屋：お風呂と囲炉裏） ──
  const PLAN = [
    ['washitsu', ['g5-ryokan-tokonoma', 'g5-ryokan-zataku', 'g4-ryokan-yunomi', 'g4-ryokan-manju', 'g4-ryokan-key', 'g5-ryokan-yukimi', 'g4-ryokan-andon', 'g4-ryokan-chadansu', 'g4-ryokan-bonsai', 'g4-ryokan-futon'], ['g5-ryokan-tokonoma', 'g5-ryokan-zataku', 'g5-ryokan-yukimi', 'g4-ryokan-futon']],
    ['hobby', ['g5-ryokan-rotenburo', 'g5-ryokan-irori', 'g5-ryokan-noren', 'g4-ryokan-scroll', 'g4-ryokan-rug', 'g4-ryokan-engawa', 'g4-ryokan-shogi', 'g4-ryokan-zaisu', 'g4-ryokan-yukata'], ['g5-ryokan-rotenburo', 'g5-ryokan-irori', 'g5-ryokan-noren', 'g4-ryokan-engawa']],
  ];
  const look = async (name, id) => { await page.evaluate((id) => { const r = window.__app.room3d; const c = r.camera.position; const w = Object.values(r.objByUid).find(o => o.userData.item.id === id); if (!w) return; const t = r.boxOf(w).getCenter(c.clone()); const x = t.x, y = Math.min(t.y, 1.0), z = t.z; const dx = x - c.x, dy = y - c.y, dz = z - c.z; r.yaw = Math.atan2(-dx, -dz); r.pitch = Math.atan2(dy, Math.hypot(dx, dz)); r.targetLook = null; r.vyaw = r.vpitch = 0; r.setZoom?.(1.15); }, id); await page.evaluate(() => document.body.classList.add('photo-mode')); await page.waitForTimeout(2500); await page.screenshot({ path: O(name), timeout: 180000 }); await page.evaluate(() => document.body.classList.remove('photo-mode')); };
  for (const [roomId, ids, views] of PLAN) {
    const res = await page.evaluate(async ([roomId, ids]) => {
      const a = window.__app, hs = a.HS(); a.S.profile().xp = 99999;
      const { itemById, STARTER } = await import('/js/items.js'); const { roomDef } = await import('/js/rooms.js'); const G = await import('/js/gacha.js');
      let i = hs.rooms.findIndex(r => r.id === roomId);
      if (i < 0) { hs.rooms.push({ id: roomId, style: 'natural', surf: { ...STARTER, ...(roomDef(roomId).surf || {}) }, placed: [] }); i = hs.rooms.length - 1; }
      const r = hs.rooms[i]; r.placed = []; r.surf.wall = 'g4-ryokan-wall'; r.surf.floor = 'g4-ryokan-floor'; r.surf.door = 'g4-ryokan-door';
      await a.switchRoom(i);
      await new Promise(z => setTimeout(z, 1500));
      const out = [];
      for (const id of ids) { const it = G.gachaById(id) || itemById(id); const n0 = a.curRoom().placed.length; const ok = await a.putIntoRoom(it); const p = a.curRoom().placed.length > n0 ? a.curRoom().placed.at(-1) : null; const on = p?.on ? (a.curRoom().placed.find(q => q.uid === p.on)?.item || p.on) : null; out.push([id, !!ok && p?.item === id, on]); for (const o of a.room3d.items.children) if (o.userData.appear !== undefined && o.userData.appear < 1) { o.userData.appear = 1; o.scale.setScalar(o.userData.baseScale || 1); o.position.y = o.userData.baseY; } }
      a.S.save();
      const rr = a.room3d; const over = Object.values(rr.objByUid).filter(o => !Object.values(rr.objByUid).some(x => x.userData.p.on === o.userData.uid) && !rr.checkPlacement(o)).map(o => o.userData.item.id); // 上に物がのっている台はのぞく（台は上の物と重なって見えるため）
      return { out, over };
    }, [roomId, ids]);
    console.log('■ ' + roomId);
    for (const [id, ok, on] of res.out) check(ok, `${id} を置けた${on ? '（' + on + ' の上）' : ''}`);
    check(!res.over.length, '置いた家具が重なっていない ' + res.over.join(','));
    for (const [k, v] of views.entries()) await look(roomId + '-' + k, v);
    await page.evaluate(() => window.__app.room3d.setMoodId('night')); await look(roomId + '-night', views[0]); await page.evaluate(() => window.__app.room3d.setMoodId('day'));
  }
  // ── ガチャ画面 ──
  const openTab = async (t) => { await page.evaluate((t) => { const b = document.querySelector(`.tabbar [data-t=${t}]`); if (b) b.click(); }, t); await page.waitForTimeout(2500); };
  await openTab('gacha');
  const bn = await page.evaluate(() => [...document.querySelectorAll('.gc-card')].map(c => c.className.replace(/.*b-/, '') + ':' + (c.querySelector('.gc-days')?.textContent || '-')));
  console.log('  バナー', bn.join(' '));
  check(bn[0]?.startsWith('ryokan') && bn[1]?.startsWith('band') && /あと\d+日/.test(bn[1]), '旅館とバンドのガチャが並び、バンドに残り日数');
  await page.screenshot({ path: O('gacha'), timeout: 180000 });
  await page.evaluate(() => document.querySelector('.gc-line')?.scrollIntoView()); await page.waitForTimeout(1500); await page.screenshot({ path: O('gacha-lineup'), timeout: 180000 });
  // 10連
  await page.evaluate(() => document.querySelector('.pull10')?.click()); await page.waitForTimeout(1500);
  // 注文書に指でサイン → スキップで結果へ
  const sg = await page.$('.od-sign canvas');
  if (sg) { const b = await sg.boundingBox(); await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down(); for (let k = 1; k <= 12; k++) await page.mouse.move(b.x + 20 + k * 14, b.y + b.height / 2 + (k % 2 ? -12 : 12)); await page.mouse.up(); }
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.pfx-skip')?.click());
  await page.waitForTimeout(12000);
  await page.screenshot({ path: O('pull10'), timeout: 180000 });
  const got = await page.evaluate(async () => { const G = await import('/js/gacha.js'); return G.bySeries('ryokan').filter(i => window.__app.S.collected(i.id)).map(i => i.id); });
  console.log('  10連で手に入った旅館の家具', got.length);
  await page.evaluate(() => document.querySelectorAll('.pfx button').forEach(b => /とじる|OK|もどる|閉じる/.test(b.textContent) && b.click())); await page.evaluate(() => document.querySelector('.pfx')?.remove());
  await page.waitForTimeout(1000);
  // 図鑑（ガチャの家具）
  await page.evaluate(() => { const b = document.querySelector('.tabbar [data-t=zukan]'); if (b) b.click(); }); await page.waitForTimeout(2000);
  if (!(await page.$('.zk-tabs'))) { await openTab('menu'); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /図鑑/.test(b.textContent))?.click()); await page.waitForTimeout(2000); }
  await page.evaluate(() => [...document.querySelectorAll('.zk-tabs button, .zk-genre')].find(b => b.dataset.g === 'gacha')?.click()); await page.waitForTimeout(2500);
  const zk = await page.evaluate(() => document.body.innerText.includes('ひのきの露天風呂') || document.body.innerText.includes('旅館'));
  check(zk, '図鑑に旅館シリーズが出る');
  await page.screenshot({ path: O('zukan'), timeout: 180000 });
  // ── 11/20：バンドが消えて、持っている家具は残る ──
  await page.evaluate(() => { const S = window.__app.S; for (const id of ['g5-drum-kit', 'g4-band-mic']) S.collect?.(id); });
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00+09:00'));
  await page.evaluate(() => document.querySelector('.tabbar [data-t=room]')?.click()); await page.waitForTimeout(1500);
  await openTab('gacha');
  const bn2 = await page.evaluate(() => [...document.querySelectorAll('.gc-card')].map(c => c.className.replace(/.*b-/, '')));
  check(!bn2.some(b => b.startsWith('band')) && bn2[0]?.startsWith('ryokan'), '11/20 はバンドのガチャが消える（' + bn2.join(' ') + '）');
  await page.screenshot({ path: O('gacha-1120'), timeout: 180000 });
  const keep = await page.evaluate(async () => { const { itemById } = await import('/js/items.js'); const G = await import('/js/gacha.js'); const S = window.__app.S; return ['g5-drum-kit', 'g4-band-mic'].map(id => [id, !!(G.gachaById(id) || itemById(id)), S.collected(id)]); });
  check(keep.every(k => k[1]), '11/20 もバンドの家具のデータはそのまま ' + JSON.stringify(keep));
  console.log(errors.filter(e => !/404|Failed to load/.test(e)).slice(0, 10).join('\n'));
  console.log(bad ? 'NG' : 'OK');
  await browser.close(); srv.close();
})();
