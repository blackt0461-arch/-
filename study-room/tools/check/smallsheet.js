// 小物・備え付けの形の見本画像を1枚にまとめる（tools/check/out/small-sheet.png）
// 使い方：node tools/check/smallsheet.js [sm-|fx]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((req, rsp) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
    rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
  }).listen(0);
  const pre = process.argv[2] || 'sm-', zone = process.argv[3] || '', ids = process.argv[4] || '';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${srv.address().port}/tools/check/smallsheet.html?pre=${pre}${zone ? '&zone=' + zone + '&cols=5' : ''}${ids ? '&ids=' + ids + '&cols=5' : ''}`);
  await page.waitForFunction(() => window.DONE !== undefined, null, { timeout: 600000 });
  const file = path.join(OUT, `small-sheet-${pre.replace(/\W/g, '')}${zone ? '-' + zone : ''}${ids ? '-ids' : ''}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('items:', await page.evaluate(() => window.DONE), '→', file);
  if (errs.length) console.log('errors:\n' + errs.join('\n'));
  await browser.close(); srv.close();
})();
