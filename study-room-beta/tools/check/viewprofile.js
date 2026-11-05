// ほかの人のプロフィールと、管理者の切りかえの確かめ（1.9.1）。使い方：node tools/check/viewprofile.js
//   1. 「friendA」で登録して問題を解く → ログアウト
//   2. 「admin」で登録 → ランキングで friendA を押す → friendA さんのプロフィールが出る（解いた数がある）
//   3. 管理者画面で friendA のアイコンを押す → プロフィール。「切りかえ」→ パズルメイン → friendA にモードの知らせが届く
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
  page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  async function signup(name, mode) {
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    await page.waitForSelector('button[type=submit]');
    if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    await page.waitForSelector(`.mode-sheet [data-m=${mode}]`, { timeout: 60000 }); await page.click(`.mode-sheet [data-m=${mode}]`);
    await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  }
  console.log('1. friendA で問題を解く');
  await signup('friendA', 'study');
  await page.evaluate(() => { const p = window.__app.S.profile(); p.avatar = 'fox'; p.avatarColor = 2; p.title = 'first'; p.solved = 12; p.correct = 9; window.__app.S.addPoints(80); const st = window.__app.S.subject('math'); st.units = { '二次関数': { solved: 12, correct: 9, perfect: 9 } }; window.__app.S.save(); });
  await page.evaluate(async () => { const Sy = await import('/js/sync.js'); await Sy.push(); const A = await import('/js/auth.js'); A.logOut(); });
  await page.evaluate(() => localStorage.clear());

  console.log('2. admin でランキングから見る');
  await signup('admin', 'study');
  await page.evaluate(() => document.querySelector('[data-t=social]')?.click()); await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /ランキング/.test(b.textContent))?.click());
  await page.waitForSelector('.rk-row[data-u=friendA]', { timeout: 8000 }).catch(() => {});
  check(await page.locator('.rk-row[data-u=friendA] .avatar').count() === 1, 'ランキングにアイコンが出る');
  check(/80\s*pt/.test(await page.locator('.rk-row[data-u=friendA]').textContent()), `ランキングはポイントで出る（${(await page.locator('.rk-row[data-u=friendA]').textContent()).trim().replace(/\s+/g, ' ')}）`);
  await page.screenshot({ path: path.join(OUT, 'view-ranking.png') });
  await page.click('.rk-row[data-u=friendA]'); await page.waitForSelector('.pf-head', { timeout: 8000 }).catch(() => {});
  const head = await page.locator('.pf-head').textContent().catch(() => '');
  check(/friendA/.test(head) && /はじめの一歩/.test(head), `押すと friendA さんのプロフィール（${head.trim().replace(/\s+/g, ' ').slice(0, 40)}）`);
  check(/12問/.test(await page.locator('.pf-list').first().textContent()), '数学の解いた数が出る');
  check(await page.locator('.pf-avbtn').count() === 0 && await page.locator('.pf-t:not([disabled])').count() === 0, 'ほかの人のアイコン・称号は変えられない');
  await page.screenshot({ path: path.join(OUT, 'view-profile.png') });
  await page.click('.screen .back'); await page.waitForTimeout(600);
  check(await page.locator('.rk-list').count() === 1, '「もどる」でランキングにもどる');

  console.log('3. 管理者画面');
  await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(400);
  await page.click('.menu-list [data-m=admin]'); await page.waitForSelector('.acard');
  check(await page.locator('.ac-mode-btn[data-u=friendA]').count() === 1, '管理者画面に「切りかえ」がある');
  await page.click('.ac-mode-btn[data-u=friendA]'); await page.waitForSelector('.mode-pick [data-m=puzzle]');
  await page.click('.mode-pick [data-m=puzzle]'); await page.waitForTimeout(800);
  const codes = await page.evaluate(async () => { const { rpc } = await import('/js/cloud.js'); return rpc('sr_my_codes', { p_token: 't-friendA' }); });
  check((codes || []).some(c => /^MODE:puzzle:/.test(c)), `friendA に「パズルメイン」の知らせが届く（${(codes || []).join(',')}）`);
  await page.click('.acard .pf-open[data-u=friendA] >> nth=0'); await page.waitForSelector('.pf-head');
  check(/friendA/.test(await page.locator('.pf-head').textContent()), '管理者画面のアイコンを押すとプロフィール');

  console.log('4. 画面のエラー');
  check(!errors.length, errors.length ? `エラー：${errors.slice(0, 3).join(' / ')}` : 'エラーなし');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
