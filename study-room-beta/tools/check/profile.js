// プロフィールの確かめ（1.9.0）。使い方：node tools/check/profile.js
//   1. メニューのカードからプロフィールが開く。パラメータのグラフ（勉強・パズル）と称号が出る
//   2. 問題を解くとパラメータが上がり、称号「はじめの一歩」が手に入る → 選ぶと名前の下に出る
//   3. アイコンを変えられる（Lv が足りない物はえらべない）
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx);
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push('ページ: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'proftest'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2500); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(800);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });

  console.log('1. 問題を解いてから、プロフィールを開く');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForTimeout(600);
  await page.click('.subj[data-s=math]'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.sc-list [data-all]')?.click()); await page.waitForTimeout(700);
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => { const p = window.__app; const b = [...document.querySelectorAll('.fcard')].find(x => !x.disabled); b?.click(); }); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('.step .more')?.click()); await page.waitForTimeout(600);
  }
  await page.evaluate(() => (document.querySelector('.step .home') || document.querySelector('.quiz .back'))?.click()); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(500);
  check(await page.locator('.pc-tap .avatar').count() === 1, 'メニューのカードにアイコンが出る');
  await page.click('.pc-tap'); await page.waitForSelector('.pf-head');
  check(await page.locator('.pf-radar svg.radar').count() === 2, '勉強とパズルのグラフが出る');
  const math = await page.locator('.pf-row').nth(1).textContent();
  check(/4問/.test(math), `数学に解いた数が出る（${math.trim().replace(/\s+/g, ' ')}）`);
  await page.screenshot({ path: path.join(OUT, 'profile-1.png'), fullPage: true });

  console.log('2. 称号');
  const got = await page.locator('.pf-t.got').count();
  check(got >= 1, `手に入れた称号がある（${got}つ）`);
  await page.click('.pf-t.got[data-t=first]'); await page.waitForSelector('.pf-head');
  check(/はじめの一歩/.test(await page.locator('.pf-tbtn').textContent()), '称号を選ぶと名前の下に出る');

  console.log('3. アイコン');
  await page.click('.pf-avbtn'); await page.waitForSelector('.av-grid');
  check(await page.locator('.av-pick:disabled').count() === 4, 'Lv が足りないアイコンは選べない（4つ）');
  await page.click('.av-pick[data-a=bear]'); await page.click('.av-col[data-c="3"]');
  await page.screenshot({ path: path.join(OUT, 'profile-2-avatar.png') });
  await page.click('.av-sheet .ok'); await page.waitForTimeout(400);
  const pf = await page.evaluate(() => window.__app.S.profile());
  check(pf.avatar === 'bear' && pf.avatarColor === 3, `アイコンを覚えている（${pf.avatar}・色${pf.avatarColor}）`);

  console.log('4. 画面のエラー');
  check(!errors.length, errors.length ? `エラー：${errors.slice(0, 3).join(' / ')}` : 'エラーなし');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
