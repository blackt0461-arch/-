// 家具の並べ方（ふつう・名前順・新しい順）の確かめ（1.20.0）。node tools/check/sort.js
// 持ち物（家具の画面）・模様がえの持ち物・図鑑で、ボタンで並びが変わるか、次に開いても覚えているか、ジャンルのタブといっしょに使えるか。写真は tools/check/out/sort-*.png
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
  const U = await open('taro');
  const p = U.page;
  // 持ち物をいくつか持たせる（手に入れた日をずらす）
  await p.evaluate(async () => {
    const a = window.__app, hs = a.HS(); const { ITEMS } = await import('/js/items.js'); const G = await import('/js/gacha.js');
    const ids = ['sofa-modern-sage', 'table-round-wood', 'g5-ryokan-irori', 'g4-ryokan-andon', 'g4-ryokan-bonsai', 'g3-peacock-chair', 'g-peacock-chair', 'g4-lava-lamp', 'g5-grand-piano', 'sm-teddy', 'sm-duck', 'g4-ryokan-zaisu', 'g-tiffany-lamp', 'g4-band-mic'];
    let t = Date.now() - 1e8; hs.collected = hs.collected || {};
    for (const id of ids) { if (!(ITEMS.find(i => i.id === id) || G.gachaById(id))) continue; hs.inventory[id] = 1; hs.collected[id] = (t += 1e6); }
    a.S.save();
  });
  const names = async (sel) => p.evaluate(async (sel) => { const { itemById } = await import('/js/items.js'); return [...document.querySelectorAll(sel)].map(e => { const id = e.closest('[data-id]')?.dataset.id; return id && /？/.test(e.textContent) ? itemById(id)?.name || e.textContent.trim() : e.textContent.trim(); }); }, sel);
  const JA = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
  const sorted = (l) => l.every((x, i) => !i || JA.compare(l[i - 1], x) <= 0);
  const mode = async () => p.evaluate(() => document.querySelector('.sort-btn > span:last-child')?.textContent);
  // ── 家具の画面の「持ち物」 ──
  await p.evaluate(() => document.querySelector('.tabbar [data-t=furn]')?.click()); await p.waitForTimeout(1200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /持ち物/.test(b.textContent))?.click()); await p.waitForTimeout(2000);
  const n0 = await names('.zk-grid .bag-item b'); console.log('  ふつう', n0.slice(0, 6).join(' / '));
  check(await mode() === 'ふつう', '最初は「ふつう」');
  await p.click('.sort-btn'); await p.waitForTimeout(1500);
  const n1 = await names('.zk-grid .bag-item b'); console.log('  名前順', n1.join(' / '));
  check(await mode() === '名前順' && sorted(n1) && n1.length === n0.length, '押すと名前順（あいうえお）に並ぶ');
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, 'sort-bag.png') });
  // ジャンルのタブといっしょに
  await p.evaluate(() => [...document.querySelectorAll('.zk-tabs button')].find(b => b.dataset.g === 'light')?.click()); await p.waitForTimeout(1500);
  const nL = await names('.zk-grid .bag-item b'); console.log('  照明だけ・名前順', nL.join(' / '));
  check(await mode() === '名前順' && sorted(nL) && nL.length >= 2, 'ジャンル（照明）でしぼっても名前順のまま');
  // 新しい順
  await p.evaluate(() => [...document.querySelectorAll('.zk-tabs button')].find(b => b.dataset.g === '')?.click()); await p.waitForTimeout(1200);
  await p.click('.sort-btn'); await p.waitForTimeout(1500);
  const n2 = await names('.zk-grid .bag-item b'); console.log('  新しい順', n2.slice(0, 4).join(' / '));
  check(await mode() === '新しい順' && /座椅子|ラバランプ|マイク|ステンドグラス/.test(n2[0]), '新しい順（最後に手に入れた物が先頭）');
  // ── 次に開いても覚えている（読みこみなおし）──
  await p.click('.sort-btn'); await p.waitForTimeout(800); // ふつう にもどる
  await p.click('.sort-btn'); await p.waitForTimeout(800); // 名前順
  await p.reload(); await p.waitForSelector('.title-screen'); await p.click('.title-screen'); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await p.waitForTimeout(800);
  // ── 模様がえ → 持ち物（部屋に置く一覧）──
  await p.evaluate(() => window.__app.showEdit()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('.inv')?.click()); await p.waitForTimeout(2000);
  const ni = await names('.inv-sheet .inv-item b'); console.log('  模様がえの持ち物', ni.join(' / '));
  check(await mode() === '名前順' && sorted(ni), '読みこみなおしても名前順を覚えていて、模様がえの持ち物も名前順');
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, 'sort-inv.png') });
  await p.evaluate(() => document.querySelector('.inv-sheet .close')?.click()); await p.waitForTimeout(800);
  // ── 図鑑（ジャンルを選ぶとボタンが出る）──
  await p.evaluate(() => window.__app.showHome?.()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.tabbar [data-t=menu]')?.click()); await p.waitForTimeout(1000);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /図鑑/.test(b.textContent))?.click()); await p.waitForTimeout(1500);
  check(!(await p.$('.sort-btn')), '図鑑の「すべて」（ジャンルのカード）ではボタンを出さない');
  await p.evaluate(() => [...document.querySelectorAll('.zk-tabs button')].find(b => b.dataset.g === 'decor')?.click()); await p.waitForTimeout(1500);
  const z0 = await names('.zk-grid .zk-item b');
  await p.click('.sort-btn'); await p.waitForTimeout(1500);
  const z1 = await names('.zk-grid .zk-item b'); console.log('  図鑑・小物', await mode(), z1.slice(0, 6).join(' / '));
  const zm = await mode();
  if (zm !== '名前順') { await p.click('.sort-btn'); await p.waitForTimeout(1000); await p.click('.sort-btn'); await p.waitForTimeout(1500); }
  const z2 = await names('.zk-grid .zk-item b');
  const zHave = await p.evaluate(() => [...document.querySelectorAll('.zk-grid .zk-item')].map(e => e.classList.contains('have')));
  const firstLocked = zHave.indexOf(false), haveNames = z2.slice(0, firstLocked < 0 ? z2.length : firstLocked);
  console.log('  図鑑・持っている物', haveNames.join(' / '));
  check(await mode() === '名前順' && haveNames.length >= 2 && sorted(haveNames) && zHave.slice(firstLocked).every(x => !x) && z2.length === z0.length, '図鑑も名前順（持っている物が先、名前順）（' + z2.length + '種類）');
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, 'sort-zukan.png') });
  // ボタンが窮屈でないか（はみ出し・2行にならない）
  const fit = await p.evaluate(() => { const b = document.querySelector('.sort-btn'); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth }; });
  check(fit.h <= 34 && fit.right <= fit.vw - 8, 'ボタンが1行におさまり、画面からはみ出さない ' + JSON.stringify(fit));
  console.log(U.errors.slice(0, 8).join('\n'));
  console.log(bad ? 'NG' : 'OK');
  await browser.close(); srv.close();
})();
