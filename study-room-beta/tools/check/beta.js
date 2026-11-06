// テスト版（study-room-beta/）の入り口の確かめ。使い方：node study-room-beta/tools/check/beta.js
//   1. 管理者でない人は、テスト版に入れない（「いつものアプリを開く」画面になる）
//   2. 管理者は入れて、上に「テスト版」のしるしが出る。メニューに「いつもの版にもどる」
//   3. 本番（study-room/）の管理者メニューに「テスト版を開く」
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..', '..'); // リポジトリのいちばん上（study-room と study-room-beta の両方を出す）
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const fails = [], check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  async function open(url, name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx);
    const page = await ctx.newPage(); page.on('dialog', d => d.accept());
    await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.quality', 'low'); });
    await page.goto(base + url); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    return page;
  }
  console.log('1. 管理者でない人');
  let p = await open('study-room-beta/', 'someone');
  await p.waitForSelector('text=管理者だけが使える', { timeout: 30000 }).catch(() => {});
  check(await p.locator('text=管理者だけが使える').count() > 0 && !(await p.locator('.home').count()), 'テスト版に入れず、いつものアプリへの案内が出る');
  console.log('2. 管理者');
  p = await open('study-room-beta/', 'admin');
  await p.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }).catch(() => {}); if (await p.locator('.mode-sheet [data-m=study]').count()) await p.click('.mode-sheet [data-m=study]');
  await p.waitForSelector('.home', { timeout: 60000 }).catch(() => {});
  check(await p.locator('.home').count() > 0, '管理者は入れる');
  check(await p.evaluate(() => getComputedStyle(document.body, '::after').content.includes('テスト版')), '上に「テスト版」のしるし');
  await p.evaluate(() => window.__app.showHome()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.lb-screen .ok')?.click());
  await p.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await p.waitForTimeout(500);
  check(/いつもの版にもどる/.test(await p.locator('.menu-list').textContent().catch(() => '')), 'メニューに「いつもの版にもどる」');
  await p.screenshot({ path: path.join(__dirname, 'out', 'beta-menu.png') });
  console.log('3. 本番');
  p = await open('study-room/', 'admin');
  await p.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }).catch(() => {}); if (await p.locator('.mode-sheet [data-m=study]').count()) await p.click('.mode-sheet [data-m=study]');
  await p.waitForSelector('.home', { timeout: 60000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('.lb-screen .ok')?.click());
  await p.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await p.waitForTimeout(500);
  check(/テスト版を開く/.test(await p.locator('.menu-list').textContent().catch(() => '')), '本番の管理者メニューに「テスト版を開く」');
  check(!(await p.evaluate(() => getComputedStyle(document.body, '::after').content.includes('テスト版'))), '本番には「テスト版」のしるしが出ない');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
