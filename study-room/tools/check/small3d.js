// 小物・備え付けの形の確かめ（3D担当 2026-11）。使い方：node tools/check/small3d.js
// 1. 部屋ごと（リビング・キッチン・お風呂・洗面所・書斎）に小物を自動で置いて、テーブル・棚・洗面台・キッチンの天板の上にのるか
// 2. 備え付けの形（キッチン・浴槽・冷蔵庫・洗面台・洗たく機・エアコン）を変えて、作り直せるか・天板の小物がついてくるか
// 3. 夜（天井の照明の影）でも崩れないか
// 画面の写真は tools/check/out/small3d-*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });

// 部屋ごとに置く物：[家具…], [小物…], 見る向き（備え付けの種類 or 家具）
const PLAN = {
  living: { furn: ['table-round-wood', 'test-hikkoshiCrates', 'sofa-modern-sage', 'test-zukan75'], small: ['sm-aromacandle', 'sm-tripleframe', 'sm-teddy', 'sm-remote', 'sm-shelljar', 'sm-woodtray', 'sm-watchstand', 'sm-sunglasses', 'sm-boardgame'] },
  kitchen: { furn: ['table-rect-oak'], small: ['sm-tetsubin', 'sm-fryingpan', 'sm-donabe', 'sm-plates', 'sm-cuttingboard', 'sm-wine', 'sm-fruitbasket', 'sm-microwave', 'sm-kyusu'], fix: { kitchen: 'fx-kitchen-country', fridge: 'fx-fridge-retro' }, look: 'kitchen' },
  bath: { furn: [], small: ['sm-shampoo', 'sm-bodysoap', 'sm-duck'], fix: { bathtub: 'g4-fx-bathtub-claw' }, look: 'bathtub' },
  washroom: { furn: [], small: ['sm-toothbrush', 'sm-handsoap', 'sm-lotion', 'sm-detergent', 'sm-towels'], fix: { vanity: 'fx-vanity-woodbowl', washer: 'fx-washer-top' }, look: 'vanity' },
  'c-living': { furn: ['sofa-chester-brown', 'table-trunk-pine'], small: ['sm-aromacandle', 'sm-tripleframe', 'sm-mug', 'sm-teddy'], look: 'fireplace' },
  'c-loft': { furn: ['bed-platform-oak', 'table-side-oak'], small: ['sm-bunko', 'sm-digiclock'], look: 'furn' },
  'c-study': { furn: ['table-farm-desk'], small: ['sm-kettle', 'sm-refbooks', 'sm-penstand'], look: 'woodstove' },
  study: { furn: ['test-aburiDesk', 'storage-steel-shelves', 'test-zukan50', 'test-cafeSign'], small: ['sm-laptop', 'sm-monitor', 'sm-notebooks', 'sm-pencils', 'sm-refbooks', 'sm-digiclock', 'sm-cube', 'sm-deskfan'], fix: { aircon: 'fx-aircon-wood' }, look: 'furn' },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 720, height: 900 } }); await mock(ctx);
  const page = await ctx.newPage(), fails = [], errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'high'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);
  // 置ける数の上限に当たらないように、Lv を上げておく（テスト用の保存先だけ）
  await page.evaluate(() => { window.__app.S.profile().xp = 99999; });
  const shot = async (name) => {
    await page.evaluate(() => document.body.classList.add('photo-mode'));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, `small3d-${name}.png`), timeout: 180000 });
    await page.evaluate(() => document.body.classList.remove('photo-mode'));
  };

  for (const [roomId, plan] of Object.entries(PLAN).filter(([k]) => !process.env.ROOMS || process.env.ROOMS.split(',').includes(k))) {
    console.log(`■ ${roomId}`);
    const idx = await page.evaluate(async (roomId) => {
      const a = window.__app, hs = a.HS();
      let i = hs.rooms.findIndex(r => r.id === roomId);
      if (i < 0) { const { STARTER } = await import('/js/items.js'); const { roomDef } = await import('/js/rooms.js'); hs.rooms.push({ id: roomId, style: 'natural', surf: { ...STARTER, ...(roomDef(roomId).surf || {}) }, placed: [] }); i = hs.rooms.length - 1; }
      hs.rooms[i].style = hs.rooms[i].style || 'natural';
      hs.rooms[i].placed = [];
      await a.switchRoom(i);
      return i;
    }, roomId);
    await page.waitForTimeout(2500);
    // 備え付けの形
    if (plan.fix) await page.evaluate(async (fix) => { const r = window.__app.curRoom(); for (const [k, id] of Object.entries(fix)) r.surf['fix-' + k] = id; window.__app.S.save(); await window.__app.room3d.buildShell(); }, plan.fix);
    await page.waitForTimeout(1200);
    const res = await page.evaluate(async ({ furn, small }) => {
      const a = window.__app, { itemById } = await import('/js/items.js');
      // 組み合わせ家具（rewardfurn.js の PARTS）を、ためしに置ける家具として足す（テストの中だけ）
      const G = await import('/js/gacha.js');
      for (const [id, genre, place] of [['test-aburiDesk', 'table', 'floor'], ['test-hikkoshiCrates', 'storage', 'floor'], ['test-zukan50', 'storage', 'floor'], ['test-zukan75', 'decor', 'floor'], ['test-cafeSign', 'wallart', 'wall']]) if (!G.GACHA_BY_ID[id]) { const it = { id, name: id, genre, styles: ['natural'], place, src: { gacha: id.slice(5) }, size: 1, rare: true, rarity: 4 }; G.GACHA_ITEMS.push(it); G.GACHA_BY_ID[id] = it; }
      const out = [];
      for (const id of [...furn, ...small]) { const ok = await a.putIntoRoom(itemById(id)); const p = a.curRoom().placed.at(-1); out.push({ id, ok, on: p?.item === id ? p.on ?? null : 'none', y: p?.y }); for (const o of a.room3d.items.children) if (o.userData.appear !== undefined && o.userData.appear < 1) { o.userData.appear = 1; o.scale.setScalar(o.userData.baseScale); o.position.y = o.userData.baseY; } } // 置いた時のアニメーション（この遅い画面では長くかかる）をすぐ終わらせる
      a.S.save();
      return out;
    }, plan);
    await page.waitForTimeout(2500);
    for (const r of res.filter(r => r.id.startsWith('sm-'))) check(r.ok && r.on != null && r.on !== 'none', `${r.id} が物をのせられる面の上に（${r.on}${r.y ? ' / 高さ ' + r.y : ''}）`);
    // 重なっていないか（置いた後に全部の置き方をもう一度確かめる）
    const bad = await page.evaluate(() => { const r = window.__app.room3d; return Object.values(r.objByUid).filter(o => (o.userData.item.id.startsWith('sm-') || (o.userData.item.id.startsWith('test-') && !Object.values(r.objByUid).some(x => x.userData.p.on === o.userData.uid))) && !r.checkPlacement(o)).map(o => o.userData.item.id); });
    check(!bad.length, `重なり・めりこみなし${bad.length ? '（' + bad.join(', ') + '）' : ''}`);
    if (bad.length && process.env.DEBUG) console.log(await page.evaluate((ids) => { const r = window.__app.room3d; return JSON.stringify(ids.map(id => { const o = Object.values(r.objByUid).find(o => o.userData.item.id === id); const b = r.boxOf(o); const p = o.userData.p; return { id, p, bb: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(3)), top: r.fixTopAt(b.clone().expandByScalar(-0.01))?.id, tops: r.fixTops.map(t => [t.id, +t.x0.toFixed(2), +t.x1.toFixed(2), +t.z0.toFixed(2), +t.z1.toFixed(2)]), others: Object.values(r.objByUid).filter(x => x !== o && b.clone().expandByScalar(-0.01).intersectsBox(r.boxOf(x))).map(x => x.userData.item.id), shell: r.solids.filter(s => b.clone().expandByScalar(-0.01).intersectsBox(s.box)).map(s => s.kind) }; })); }, bad));
    // 見る向き
    await page.evaluate((look) => {
      const r = window.__app.room3d, T = r.camera.position.constructor;
      let pt = null;
      if (look === 'furn') { const o = Object.values(r.objByUid).find(o => /table|desk/.test(o.userData.item.id)); if (o) pt = r.boxOf(o).getCenter(new T()); }
      else if (look) { const sd = r.solids.find(s => s.kind === look); if (sd) pt = sd.box.getCenter(new T()); }
      else { const o = Object.values(r.objByUid).find(o => o.userData.item.genre === 'table'); if (o) pt = r.boxOf(o).getCenter(new T()); }
      if (pt) { pt.y = Math.max(0.6, pt.y - 0.2); r.lookAt(pt); }
    }, plan.look);
    await shot(roomId);
    if (roomId === 'c-living') { if (process.env.NOAO) await page.evaluate(() => { const r = window.__app.room3d; if (r.ao) r.ao.enabled = false; }); await page.evaluate(() => { const r = window.__app.room3d; r.lookAt(new r.camera.position.constructor(0.6, 1.1, -2.8)); }); await shot(roomId + '-window'); }
    // 夜
    if (roomId.startsWith('c-')) { await page.evaluate(() => window.__app.room3d.setMoodId('sunset')); await shot(roomId + '-sunset'); }
    await page.evaluate(() => window.__app.room3d.setMoodId('night'));
    await shot(roomId + '-night');
    await page.evaluate(() => window.__app.room3d.setMoodId('day'));
    // 形をいつものにもどしても、小物が天板にのったまま（高さが合う）
    if (plan.fix) {
      const r2 = await page.evaluate(async (kinds) => {
        const a = window.__app, r = a.curRoom();
        for (const k of kinds) delete r.surf['fix-' + k];
        await a.room3d.buildShell();
        const rr = a.room3d;
        return Object.values(rr.objByUid).filter(o => typeof o.userData.p.on === 'string').map(o => { const b = rr.boxOf(o); return { id: o.userData.item.id, gap: +(b.min.y - o.userData.p.y).toFixed(3), on: o.userData.p.on }; });
      }, Object.keys(plan.fix));
      check(r2.every(x => Math.abs(x.gap) < 0.01), `いつもの形にもどしても、天板の小物が浮かない・しずまない（${r2.map(x => x.id.slice(3) + ':' + x.gap).join(', ')}）`);
      await shot(roomId + '-std');
    }
  }
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 300)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
