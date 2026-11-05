// ログイン情報の確かめ（1.8.1）。使い方：node tools/check/session.js
//   1. 端末の保存からログイン情報だけ消えても、ランキング・フレンド・管理者がこわれない（ページの中の控えから戻る）
//   2. 本当にログアウトされた時（合い鍵が使えない時）は、ログイン画面になる
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx);
  await ctx.route('**/rest/v1/rpc/sr_weekly_points', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ top: [], me: null, total: 0 }) }));
  await ctx.route('**/rest/v1/rpc/sr_weekly_puzzle', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ top: [], me: null, total: 0 }) }));
  await ctx.route('**/rest/v1/rpc/sr_weekly_ranking', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ top: [], me: null, total: 0 }) }));
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push('ページ: ' + e.message));
  page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=puzzle]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=puzzle]');
  await page.waitForTimeout(2500); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(800);

  console.log('1. 端末の保存だけ消えた');
  await page.evaluate(() => localStorage.removeItem('studyroom.cloud'));
  await page.evaluate(() => document.querySelector('[data-t=social]')?.click()); await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll('.half-sheet button, .sheet button')].find(b => /ランキング/.test(b.textContent))?.click()); await page.waitForTimeout(1200);
  await page.waitForFunction(() => !/読み込み中/.test(document.querySelector('.rk-list')?.textContent || '読み込み中'), null, { timeout: 8000 }).catch(() => {});
  const rk = await page.locator('.rk-list').textContent().catch(() => '');
  check(!/null|token|読み込み中/.test(rk) && rk.length > 0, `ランキングが出る（${rk.trim().slice(0, 30)}）`);
  check(await page.evaluate(() => !!localStorage.getItem('studyroom.cloud')), 'ログイン情報が端末にもどる');
  await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(500);
  check(await page.locator('.menu-list [data-m=admin]').count() === 1, '管理者のメニューが消えない');
  await page.click('.menu-list [data-m=settings]'); await page.waitForSelector('.mode-seg');
  await page.click('.mode-seg [data-mode=study]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__app.S.profile().mode) === 'study' && /解く|続きから/.test(await page.locator('.solve-ring').textContent()), '管理者は設定で勉強⇄パズルを切りかえられる');
  await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForTimeout(500);
  check(await page.locator('.mode-switch[data-to=puzzle]').count() === 1, '管理者には教科えらびに「パズルに切りかえる」が出る');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);

  console.log('2. 本当にログアウトされた');
  await page.evaluate(async () => { const A = await import('/js/auth.js'); A.forget(); window.__app.showHome(); }); await page.waitForTimeout(600);
  check(await page.locator('.login form').count() === 1, 'ログイン画面になる');
  check(!errors.length, errors.length ? `エラー：${errors.slice(0, 3).join(' / ')}` : 'エラーなし');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
