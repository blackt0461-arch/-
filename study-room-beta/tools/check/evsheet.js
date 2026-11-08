// イベント家具の見本を撮る（3D担当）。node tools/check/evsheet.js 'newtonCradle?time=0.3' ...
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((req, rsp) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp); }).listen(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on('pageerror', e => console.log('ERR', e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
  let i = 0;
  for (const a of process.argv.slice(2)) {
    const [t, qs] = a.split('?');
    await page.goto(`http://localhost:${srv.address().port}/tools/check/evsheet.html?t=${t}&${qs || ''}`);
    await page.waitForFunction(() => window.DONE, null, { timeout: 120000 });
    const f = path.join(OUT, `ev-${i++}-${t}.png`); await page.screenshot({ path: f }); console.log(f);
  }
  await browser.close(); srv.close();
})();
