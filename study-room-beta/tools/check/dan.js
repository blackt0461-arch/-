// 教科の段位の確かめ。使い方：node tools/check/dan.js
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
  const page = await ctx.newPage(), fails = [], errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);


  const A = (fn, arg) => page.evaluate(fn, arg);
  const setMath = (solved, correct) => A(([n, c]) => { const st = window.__app.S.subject('math'); st.units = { テスト: { solved: n, correct: c, perfect: c } }; }, [solved, correct]);
  const danGifts = () => A(() => window.__app.S.gifts().filter(g => g.from === 'dan').map(g => g.id).sort().join());
  console.log('1. 正解49問ではまだ・50問で初段');
  await setMath(60, 49); await A(() => window.__app.showHome()); await page.waitForTimeout(300);
  check(await danGifts() === '', `正解49問ではごほうびなし（${await danGifts()}）`);
  await setMath(60, 50); await A(() => window.__app.showHome()); await page.waitForTimeout(300);
  check(await danGifts() === 'dan-math-1-medals', `正解50問で初段のごほうび（${await danGifts()}）`);
  await A(() => window.__app.showHome()); await page.waitForTimeout(300);
  check(await danGifts() === 'dan-math-1-medals', '2回は届かない');
  console.log('2. 一気に五段（★4以上確定がつく）・正解率が足りないと止まる');
  await setMath(900, 540); await A(() => window.__app.showHome()); await page.waitForTimeout(300); // 正解率60% → 四段まで
  const g4 = await danGifts();
  check(/dan-math-4-medals/.test(g4) && !/dan-math-5/.test(g4), `正解率60%では四段まで（${g4}）`);
  await setMath(760, 540); await A(() => window.__app.showHome()); await page.waitForTimeout(300); // 71% → 五段
  const g5 = await danGifts();
  check(/dan-math-5-medals/.test(g5) && /dan-math-5-ticket4/.test(g5), `正解率71%で五段・★4以上確定（${g5}）`);
  console.log('3. 受け取るとメダルがふえる・プロフィールに出る');
  const m = await A(() => { const { S, HS } = window.__app; const h = HS(); const m0 = h.medals || 0; for (const g of S.gifts().filter(g => g.from === 'dan')) S.claimGift(g.id); return (h.medals || 0) - m0; });
  check(m === 20 + 40 + 60 + 80 + 100, `メダルが段×20 ずつ（${m}）`);
  await A(() => window.__app.showProfile()); await page.waitForSelector('.dan-list'); await page.waitForTimeout(400);
  const badge = await A(() => [...document.querySelectorAll('.dan-row')].map(r => r.querySelector('b').textContent + ':' + r.querySelector('.dan-badge').textContent).join(' '));
  check(/数学:五段/.test(badge) && /国語:—/.test(badge), `プロフィールに段位（${badge}）`);
  await page.locator('.dan-list').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'dan-profile.png') });
  console.log('4. 段は下がらない・古い記録でもこわれない');
  await setMath(2000, 540); await A(() => window.__app.showProfile()); await page.waitForSelector('.dan-list');
  const keep = await A(() => document.querySelector('.dan-row:nth-child(2) .dan-badge')?.textContent);
  check(keep === '五段', `正解率が下がっても五段のまま（${keep}）`);
  const old = await A(async () => { const { S } = window.__app; delete S.profile().dan; const D = await import('/js/dan.js'); return D.danSaved('math'); });
  check(old === 0, `記録がなくても開ける（${old}）`);
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 160)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
