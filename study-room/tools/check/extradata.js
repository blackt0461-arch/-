// アップデートで増えた家具のデータを「追加データのダウンロード」でたずねるかを確かめる（1.16.3）。使う：node tools/check/extradata.js
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
  // 家具のデータの取りよせは、小さな中身で返す（本物を落とさない）
  let fetched = 0;
  await ctx.route(/dl\.polyhaven\.org|cdn\.jsdelivr\.net\/gh/, r => { fetched++; r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: 'x' }); });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base);
  // 前に「まとめて保存」した人：いまのデータのうち、10個だけ保存していないことにする
  const n = await page.evaluate(async () => {
    const { downloadList } = await import('./js/download.js');
    const list = downloadList(); const c = await caches.open('studyroom-assets-v1');
    const keep = list.slice(10);
    await Promise.all(keep.map(x => c.put(x.url, new Response('x'))));
    localStorage.setItem('studyroom.download', 'done'); localStorage.removeItem('studyroom.dlskip');
    return list.length;
  });
  const login = async () => {
    await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    if (await page.locator('.swap').count() && /登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  };
  await login();
  const shown = await page.waitForSelector('.card.dl', { timeout: 20000 }).then(() => true, () => false);
  const text = shown ? await page.locator('.card.dl').textContent() : '';
  check(shown && /追加データ/.test(text), `増えた分があると「追加データのダウンロード」が出る（全部で${n}個のうち10個がまだ）`);
  check(/約\d+MB/.test(text), '容量（約○MB）が出る：' + (text.match(/約\d+MB/) || [''])[0]);
  await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'extradata.png') });
  await page.click('.card.dl .later');
  check(await page.waitForSelector('.mode-sheet, .lb-screen.show, .hotbar', { state: 'attached', timeout: 30000 }).then(() => true, () => false), '「あとで」で部屋に入る');
  check(await page.evaluate(() => localStorage.getItem('studyroom.dlskip')) === await page.evaluate(() => fetch('version.json').then(r => r.json()).then(v => v.version)), '「あとで」はこの版のあいだ覚える');
  // もう一度開く → 同じ版ではたずねない
  await page.reload(); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForTimeout(6000);
  check(await page.locator('.card.dl').count() === 0, '同じ版では、もうたずねない');
  // 次のアップデートになった（覚えた版とちがう）→ またたずねる → ダウンロード
  await page.evaluate(() => localStorage.setItem('studyroom.dlskip', '0.0.0'));
  await page.reload(); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  check(await page.waitForSelector('.card.dl', { timeout: 20000 }).then(() => true, () => false), '次のアップデートでは、またたずねる');
  fetched = 0;
  await page.click('.card.dl .go');
  await page.waitForFunction(() => /はじめる/.test(document.querySelector('.card.dl .go')?.textContent || ''), null, { timeout: 30000 });
  check(fetched === 10, `「ダウンロードする」で、まだの分だけ取りよせる（${fetched}個）`);
  const left = await page.evaluate(async () => (await (await import('./js/download.js')).missing()).list.length);
  check(left === 0, `ダウンロードのあと、まだの分は0（${left}）`);
  await page.click('.card.dl .go');
  check(await page.waitForSelector('.hotbar', { state: 'attached', timeout: 30000 }).then(() => true, () => false), '「はじめる」で部屋に入る');
  check(!errors.length, '画面のエラーなし' + (errors.length ? '：' + errors[0] : ''));
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめ ${fails.length}件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})();
