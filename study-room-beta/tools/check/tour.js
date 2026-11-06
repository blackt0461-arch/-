// はじめての人の案内の確かめ（1.12.0）。使い方：node tools/check/tour.js
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
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  console.log('1. 新しく登録すると案内が出る');
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'newbie'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(800);
  check(await page.locator('.tour').count() === 0, '部屋のスタイルをえらぶまでは出ない');
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForSelector('.tour', { timeout: 15000 }).catch(() => {});
  check(await page.locator('.tour').count() === 1, '案内が出る');
  const titles = [];
  for (let k = 0; k < 7; k++) {
    titles.push(await page.locator('.tour-title').textContent());
    if (k === 1 || k === 4) await page.screenshot({ path: path.join(OUT, `tour-${k + 1}.png`) });
    if (k === 1) { const hb = await page.locator('.tour-hole').boundingBox(), rb = await page.locator('.solve-ring').boundingBox(); check(hb && rb && Math.abs(hb.x + hb.width / 2 - (rb.x + rb.width / 2)) < 4, '「解く」ボタンが光る'); }
    await page.click('.tour-next'); await page.waitForTimeout(350);
  }
  check(titles.length === 7 && new Set(titles).size === 7, `7つの説明（${titles.join(' → ')}）`);
  await page.waitForSelector('.subj-sheet', { timeout: 6000 }).catch(() => {});
  check(await page.locator('.subj-sheet').count() === 1, '最後に「解いてみる」で教科えらびが開く');
  check(await page.evaluate(() => window.__app.S.profile().tour === 1), '見たことが記録される');
  console.log('2. 2回目は出ない・設定からもう一度見られる');
  await page.reload(); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForTimeout(4000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(2500);
  check(await page.locator('.tour').count() === 0, '開きなおしても出ない');
  await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(400);
  await page.click('.menu-list [data-m=settings]'); await page.click('.tour-again'); await page.waitForSelector('.tour', { timeout: 5000 }).catch(() => {});
  check(await page.locator('.tour').count() === 1, '設定から案内をもう一度見られる');
  await page.click('.tour-skip'); await page.waitForTimeout(300);
  check(await page.locator('.tour').count() === 0 && await page.locator('.subj-sheet').count() === 0, '「スキップ」で閉じる');
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 120)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
