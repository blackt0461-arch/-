// サイドの確かめ（1.12.0）：管理者がサイドを変えると、その人が「勉強｜パズル」を押したあとでも、開いたままでも、切りかわる。
// ふつうの人は「勉強｜パズル」を押してもサイドは変わらない。使い方：node tools/check/side.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const db = { users: {} }, fails = [], errors = [];
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  async function device(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx, db);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.quality', 'low'); });
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen'); await page.waitForSelector('button[type=submit]');
    if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
    await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
    await page.waitForTimeout(800);
    return { ctx, page };
  }
  console.log('1. ふつうの人：「勉強｜パズル」を押してもサイドは変わらない');
  const N = await device('nana');
  const side0 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf());
  await N.page.evaluate(() => document.querySelector('.mode-toggle [data-mode=puzzle]')?.click()); await N.page.waitForTimeout(800);
  const after = await N.page.evaluate(async () => ({ side: (await import('/js/store.js')).sideOf(), mode: window.__app.S.profile().mode }));
  check(side0 === 'study' && after.side === 'study' && after.mode === 'puzzle', `パズルに切りかえても、スタディサイドのまま（mode ${after.mode}・side ${after.side}）`);
  await N.page.evaluate(async () => { window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  console.log('2. 管理者が「パズルサイド」に変える（nana は開いたまま・押したあと）');
  const A = await device('admin');
  await A.page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await A.page.waitForTimeout(400);
  await A.page.click('.menu-list [data-m=admin]'); await A.page.waitForSelector('.ac-mode-btn[data-u=nana]');
  await A.page.click('.ac-mode-btn[data-u=nana]'); await A.page.waitForSelector('.mode-pick [data-m=puzzle]');
  await A.page.click('.mode-pick [data-m=puzzle]'); await A.page.waitForTimeout(800)
  check(db.users.nana.data.profile.side === 'puzzle', `サーバーの記録が「パズルサイド」になる（${db.users.nana.data.profile.side}）`);
  // nana の開いたままのアプリが、古いサイドで保存しても元にもどらない
  await N.page.evaluate(async () => { window.__app.S.profile().xp += 3; window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  await N.page.waitForTimeout(600);
  check(db.users.nana.data.profile.side === 'puzzle', `開いたままのアプリが保存しても、パズルサイドのまま（${db.users.nana.data.profile.side}）`);
  // nana が画面にもどると、すぐ切りかわる
  await N.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await N.page.waitForTimeout(1500);
  const n2 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf());
  check(n2 === 'puzzle', `nana のアプリも切りかわる（${n2}）`);
  console.log('3. 次に開いた時も、パズルサイド');
  await N.page.reload(); await N.page.waitForSelector('.title-screen'); await N.page.click('.title-screen'); await N.page.waitForTimeout(5000);
  const n3 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf()).catch(() => null);
  check(n3 === 'puzzle', `開きなおしても、パズルサイド（${n3}）`);
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 150)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
