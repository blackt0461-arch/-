// みゃくみゃくのぬいぐるみ（補填だけで送る家具）の確かめ（3D担当 2026-11-13）。node tools/check/myaku.js
// 管理者が「補填」でふつうの人に送る → 受け取って部屋に置く（床・テーブルの上）。ガチャ・図鑑・お店に出ないか。写真は tools/check/out/myaku-*.png
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
  const db = { users: {} };
  let bad = 0; const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) bad++; };
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await mock(ctx, db);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); }); // 画質はスマホと同じ「かるい」のまま
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    await page.waitForSelector('button[type=submit]');
    if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
    await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__app.S.save(); });
    return { ctx, page, errors };
  };
  // ── ふつうの人（taro）を作る ──
  const U = await open('taro');
  const before = await U.page.evaluate(async () => { const G = await import('/js/gacha.js'); const { ITEMS } = await import('/js/items.js'); return { gacha: G.GACHA_ITEMS.some(i => i.id === 'x-myaku-plush'), shop: ITEMS.some(i => i.id === 'x-myaku-plush'), odds: ['standard', ...G.SERIES.map(s => s.id)].some(b => G.oddsFor(b).some(o => o.item.id === 'x-myaku-plush')), series: G.SERIES.some(s => s.id === 'secret') }; });
  check(!before.gacha && !before.shop && !before.odds && !before.series, 'ガチャ・確率表示・お店・シリーズ一覧に入っていない ' + JSON.stringify(before));
  // ── 管理者が補填で送る ──
  const A = await open('admin');
  await A.page.evaluate(() => window.__app.showAdmin()); await A.page.waitForSelector('.ac-comp[data-u=taro]', { timeout: 30000 });
  await A.page.click('.ac-comp[data-u=taro]'); await A.page.waitForSelector('.comp-form');
  const inList = await A.page.evaluate(() => [...document.querySelectorAll('#comp-items option')].some(o => o.value === 'みゃくみゃくのぬいぐるみ'));
  check(inList, '補填の家具の候補に「みゃくみゃくのぬいぐるみ」が出る');
  await A.page.fill('.comp-form input[name=item]', 'みゃくみゃく');
  await A.page.fill('.comp-form input[name=title]', 'プレゼント');
  await A.page.click('.comp-form button[type=submit]'); await A.page.waitForTimeout(800);
  await A.page.screenshot({ path: path.join(OUT, 'myaku-comp.png') });
  const sum = await A.page.evaluate(() => document.querySelector('.comp-sum')?.innerText || '');
  check(/みゃくみゃくのぬいぐるみ/.test(sum), '送る前の確認に名前が出る（' + sum.trim() + '）');
  await A.page.click('.comp-sheet .go'); await A.page.waitForTimeout(1500);
  check(db.gifts?.some(g => g.item_id === 'x-myaku-plush' && g.target === 'taro'), '補填が taro に送られた');
  // ── taro が受け取る ──
  await U.page.reload(); await U.page.waitForSelector('.title-screen'); await U.page.click('.title-screen'); await U.page.waitForTimeout(6000);
  await U.page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await U.page.waitForTimeout(800);
  await U.page.evaluate(() => window.__app.showGiftBox()); await U.page.waitForTimeout(2500);
  await U.page.screenshot({ path: path.join(OUT, 'myaku-giftbox.png') });
  for (let k = 0; k < 4; k++) { await U.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /まとめて受け取る|受け取る/.test(b.textContent) && !b.disabled); b?.click(); }); await U.page.waitForTimeout(1200); }
  const own = await U.page.evaluate(() => window.__app.S.owned('x-myaku-plush'));
  check(own, 'taro の持ち物に入った');
  // 図鑑（％・数）に入らない
  const zk = await U.page.evaluate(async () => { const t0 = document.body.innerText; return t0; });
  await U.page.evaluate(() => document.querySelector('.tabbar [data-t=menu]')?.click()); await U.page.waitForTimeout(1200);
  await U.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /図鑑/.test(b.textContent))?.click()); await U.page.waitForTimeout(2000);
  const zText = await U.page.evaluate(async () => { const out = []; for (const g of [null, 'decor', 'gacha']) { const b = [...document.querySelectorAll('.zk-tabs button, .zk-genre')].find(x => (x.dataset.g || null) === g); b?.click(); await new Promise(z => setTimeout(z, 800)); out.push(document.body.innerText); } return out.join('\n'); });
  check(!/みゃくみゃく/.test(zText), '図鑑に出ない');
  const head = zText.match(/(\d+)\s*\/\s*(\d+)/); console.log('  図鑑の数', head ? head[0] : '?');
  // ── 部屋に置く（床・テーブルの上）──
  const r = await U.page.evaluate(async () => {
    const a = window.__app; const { itemById } = await import('/js/items.js');
    a.curRoom().placed = []; await a.switchRoom(a.HS().rooms.indexOf(a.curRoom())); await new Promise(z => setTimeout(z, 1500));
    a.S.profile().xp = 99999;
    const t0 = performance.now();
    a.HS().inventory['table-round-wood'] = 1; await a.putIntoRoom(itemById('table-round-wood'));
    a.HS().inventory['x-myaku-plush'] = 2; // 2つ目（テーブルの上に置く分）
    const ok1 = await a.putIntoRoom(itemById('x-myaku-plush'));
    const ok2 = await a.putIntoRoom(itemById('x-myaku-plush'));
    // テーブルがあれば、小物と同じく自動でテーブルの上にのる
    const ms = Math.round(performance.now() - t0);
    for (const o of a.room3d.items.children) if (o.userData.appear !== undefined) { o.userData.appear = 1; o.scale.setScalar(o.userData.baseScale || 1); o.position.y = o.userData.baseY; }
    a.S.save();
    const rr = a.room3d, ws = Object.values(rr.objByUid).filter(o => o.userData.item.id === 'x-myaku-plush');
    let tris = 0; ws[0]?.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    const sizes = ws.map(w => { const b = rr.boxOf(w); const s = b.getSize(b.min.clone()); return { h: +s.y.toFixed(3), w: +s.x.toFixed(3), d: +s.z.toFixed(3), y0: +b.min.y.toFixed(3), on: w.userData.p.on ? 'table' : 'floor' }; });
    return { ok1, ok2, ms, tris: Math.round(tris), sizes, tex: rr.renderer.info.memory.textures, over: ws.filter(o => !rr.checkPlacement(o)).length };
  });
  console.log('  置いた結果', JSON.stringify(r));
  check(r.ok1 && r.ok2 && r.sizes.some(s => s.on === 'floor') && r.sizes.some(s => s.on === 'table'), '床とテーブルの上に置けた');
  check(r.sizes.every(s => s.h > 0.3 && s.h < 0.55), '高さが 0.3〜0.55m（' + r.sizes.map(s => s.h + 'm/' + s.on).join(', ') + '）');
  check(!r.over, '重なっていない');
  // 写真：ぬいぐるみの正面に向く
  for (const [k, idx] of [['floor', 0], ['table', 1]]) {
    await U.page.evaluate((idx) => { const rr = window.__app.room3d; const ws = Object.values(rr.objByUid).filter(o => o.userData.item.id === 'x-myaku-plush'); const w = ws.find(o => (idx ? !!o.userData.p.on : !o.userData.p.on)) || ws[idx]; const c = rr.camera.position; const t = rr.boxOf(w).getCenter(c.clone()); const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z; rr.yaw = Math.atan2(-dx, -dz); rr.pitch = Math.atan2(dy, Math.hypot(dx, dz)); rr.targetLook = null; rr.vyaw = rr.vpitch = 0; rr.setZoom?.(0.55); }, idx);
    await U.page.evaluate(() => document.body.classList.add('photo-mode')); await U.page.waitForTimeout(3000);
    await U.page.screenshot({ path: path.join(OUT, `myaku-room-${k}.png`), timeout: 180000 });
    await U.page.evaluate(() => document.body.classList.remove('photo-mode'));
  }
  // 持ち物の一覧（家具の画面）に出る
  await U.page.evaluate(() => document.querySelector('.tabbar [data-t=furn]')?.click()); await U.page.waitForTimeout(2500);
  await U.page.screenshot({ path: path.join(OUT, 'myaku-furn.png'), timeout: 180000 });
  // ガチャ画面に出ない
  await U.page.evaluate(() => document.querySelector('.half-sheet .close, .sh-x')?.click()); await U.page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await U.page.evaluate(() => document.querySelector('.tabbar [data-t=gacha]')?.click()); await U.page.waitForTimeout(2500); await U.page.screenshot({ path: path.join(OUT, 'myaku-gacha.png') });
  const gtext = await U.page.evaluate(() => [...document.querySelectorAll('.screen, .gc-car, .gc-line, .sheet')].map(e => e.innerText).join(' ') + [...document.querySelectorAll('img')].map(i => i.alt).join(' '));
  const gm = gtext.match(/.{0,40}みゃくみゃく.{0,40}/s); check(!gm, 'ガチャ画面に出ない' + (gm ? '（' + gm[0].replace(/\n/g, ' ') + '）' : ''));
  console.log([...U.errors, ...A.errors].slice(0, 8).join('\n'));
  console.log(bad ? 'NG' : 'OK');
  await browser.close(); srv.close();
})();
