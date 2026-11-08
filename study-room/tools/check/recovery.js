// 管理者が「復元コード」を作り、忘れた人がそれで新しいパスワードにできるかを確かめる（1.16.6）。使う：node tools/check/recovery.js
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
  const db = { users: { wasure: { data: { profile: { xp: 120 } }, pw: 'old1' } } }, fails = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx, db);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study], .lb-screen.show', { timeout: 60000 });
  if (await page.locator('.mode-sheet [data-m=study]').count()) await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => { document.querySelector('.lb-screen .ok')?.click(); });
  await page.waitForTimeout(600); await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.evaluate(() => window.__app.showAdmin()); await page.waitForSelector('.ac-rec[data-u=wasure]', { timeout: 20000 });
  check(true, '管理者画面の人ごとに「復元コード」ボタンがある');
  await page.click('.ac-rec[data-u=wasure]'); await page.waitForSelector('.rec-sheet .rec-go');
  await page.click('.rec-sheet .rec-go'); await page.waitForSelector('.rec-sheet .rc-code');
  const code = (await page.locator('.rec-sheet .rc-code').textContent()).trim();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `コードが出る（${code}）`);
  await page.screenshot({ path: path.join(OUT, 'admin-recovery.png') });
  // 忘れた人：ログイン画面の「パスワードを忘れた」で、そのコードを使う
  const r = await page.evaluate(async (code) => { const { rpc } = await import('./js/cloud.js'); try { return await rpc('sr_password_reset', { p_username: 'wasure', p_code: code, p_new: 'new2222' }); } catch (e) { return { err: e.message }; } }, code).catch(e => ({ err: String(e) }));
  check(r && r.ok && db.users.wasure.pw === 'new2222', `そのコードで新しいパスワードにできる（${JSON.stringify(r)}）`);
  check(db.users.wasure.data.profile.xp === 120, '記録はそのまま');
  check(!errors.length, '画面のエラーなし' + (errors.length ? '：' + errors[0] : ''));
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめ ${fails.length}件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})();
