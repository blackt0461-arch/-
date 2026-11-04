// BGM と画質のはじめの値の確かめ。使い方（study-room-beta フォルダで）：node tools/check/bgm.js
//   1. 画質を選んだことがない人は「かるい」になる
//   2. 画面をさわると BGM が鳴りはじめる（時間と天気で曲が決まる）
//   3. 設定でオフにすると止まり、オンで鳴る。音量・曲を変えられて、覚えている
//   4. 問題・パズルを解いている間は小さくなる
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx);
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push('ページ: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); });
  await page.goto(base);
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'bgmtest'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelector('.lb-screen .ok')?.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  const B = (fn) => page.evaluate(`import('/js/bgm.js').then(m => (${fn})(m))`);

  console.log('1. 画質のはじめの値');
  check(await page.evaluate(() => window.__app.room3d.quality) === 'low', `選んでいなければ「かるい」（${await page.evaluate(() => window.__app.room3d.quality)}）`);

  console.log('2. BGM が鳴る');
  await page.mouse.click(200, 300); await page.waitForTimeout(1500);
  const st = await B('m => ({ now: m.nowPlaying(), auto: m.autoTrack(), s: m.settings() })');
  check(!!st.now && st.now === st.auto, `画面をさわると鳴る（${st.now}、自動の曲：${st.auto}）`);
  const tracks = await B(`m => [9, 13, 18, 22].map(h => h + '時:' + m.autoTrack(new Date(2026, 6, 6, h)))`);
  check(tracks.length === 4, `時間で曲が変わる：${tracks.join(' ')}`);

  console.log('3. 設定');
  await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(400);
  await page.click('.menu-list [data-m=settings]'); await page.waitForSelector('.bgm-set');
  await page.screenshot({ path: path.join(OUT, 'bgm-settings.png') });
  await page.click('.bgm-on [data-on=false]'); await page.waitForTimeout(300);
  check(await B('m => m.nowPlaying()') === null, 'オフにすると止まる');
  await page.click('.bgm-on [data-on=true]'); await page.waitForTimeout(500);
  check(!!(await B('m => m.nowPlaying()')), 'オンにすると鳴る');
  await page.fill('#bgm-vol', '20'); await page.dispatchEvent('#bgm-vol', 'input');
  await page.selectOption('#bgm-track', 'fire'); await page.waitForTimeout(500);
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('studyroom.bgm')));
  check(s2.vol === 0.2 && s2.track === 'fire' && await B('m => m.nowPlaying()') === 'fire', `音量と曲を覚えている（音量 ${s2.vol}・曲 ${s2.track}）`);
  check(await page.locator('.seg button[data-q].on').count() === 1 && await page.locator('.bgm-on button.on').count() === 1, '画質とBGMのボタンが、おたがいに消し合わない');

  console.log('4. 画面のエラー');
  check(!errors.length, errors.length ? `エラーが ${errors.length} 件：\n      ` + errors.slice(0, 6).join('\n      ') : 'エラーなし');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
