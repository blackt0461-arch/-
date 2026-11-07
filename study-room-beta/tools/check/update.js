// 新しい版が出た時の「アップデートしますか？」を確かめる（1.16.1）。使い方：node tools/check/update.js
//
// 使い方（study-room フォルダで）：
//   node tools/check/smoke.js
// 確かめること：
//   1. 新しく登録 → 新規登録記念のレアチケット10枚がプレゼントBOXに届く → 受け取ると増える
//   2. 4択の教科（数学・英語・化学・国語・社会）を、それぞれ数問ずつ解いて部屋にもどれる
//   3. ガチャの演出：注文書にサイン → 設計図 → ★5の「完成」ハンコ、とちゅうの昇格（青→金）
//   4. そのあいだに画面のエラー（ページのエラー・console.error）が1つも出ない
// 結果：だめな所があれば表示して、終わりの番号が 1（失敗）になる。tools/check/out/smoke-*.png に画面の写真。
// テスト用の保存先（mock.js）を使うので、本物のデータにはさわらない。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let f = decodeURIComponent(req.url.split('?')[0]);
      if (f.endsWith('/')) f += 'index.html';
      const file = path.join(ROOT, f);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mock(ctx);
  // version.json だけ、新しい版が出たことにする
  let fake = null;
  await ctx.route('**/version.json*', async r => { if (!fake) return r.continue(); r.fulfill({ contentType: 'application/json', body: JSON.stringify(fake) }); });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base);
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.click('.swap'); await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study], .lb-screen.show', { timeout: 60000 });
  if (await page.locator('.mode-sheet [data-m=study]').count()) await page.click('.mode-sheet [data-m=study]');
  await page.waitForSelector('.lb-screen.show', { timeout: 60000 }); await page.click('.lb-screen .ok', { force: true });
  await page.waitForSelector('.hotbar', { state: 'attached' }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.sheet').forEach(e => e.remove()));
  const cur = await page.evaluate(() => fetch('version.json', { cache: 'no-store' }).then(r => r.json()));
  fake = { version: '99.0.0', notes: ['テスト：新しいこと', 'テスト：良くしたこと'] };
  const poke = () => page.evaluate(() => dispatchEvent(new Event('focus')));
  await poke();
  const shown = await page.waitForSelector('.up-ask .up-card', { timeout: 8000 }).then(() => true, () => false);
  check(shown, `新しい版（${cur.version} → 99.0.0）が出ると「アップデートがあります」が出る`);
  check(await page.locator('.update-ov').count() === 0, 'たずねている間は、勝手に再起動しない');
  check((await page.locator('.up-list li').count()) === 2, '新しくなったことが出る');
  await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, 'update-ask.png') });
  await page.click('.up-later'); await page.waitForTimeout(300);
  check(await page.locator('.up-ask').count() === 0, '「あとで」で閉じる');
  await poke(); await page.waitForTimeout(1500);
  check(await page.locator('.up-ask').count() === 0, '「あとで」のあと30分は、もうたずねない');
  await page.evaluate(() => { const z = JSON.parse(sessionStorage.getItem('studyroom.upSnooze')); z.until = Date.now() - 1; sessionStorage.setItem('studyroom.upSnooze', JSON.stringify(z)); });
  await poke();
  check(await page.waitForSelector('.up-ask', { timeout: 8000 }).then(() => true, () => false), '30分たつと、またたずねる');
  const nav = page.waitForEvent('framenavigated', { timeout: 15000 }).then(() => true, () => false);
  await page.click('.up-go');
  check(await page.waitForSelector('.update-ov', { timeout: 3000 }).then(() => true, () => false), '「今すぐ」でアップデートの画面になる');
  check(await nav, '「今すぐ」のあと、読みこみ直す');
  check(!errors.length, '画面のエラーなし' + (errors.length ? '：' + errors[0] : ''));
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめ ${fails.length}件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})();
