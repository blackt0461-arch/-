// ひととおり動くかの確かめ（スモークテスト）。何かを直したあとに走らせる。
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
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push('ページ: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base);

  // ---- 1. 新しく登録 ----
  console.log('1. 新しく登録');
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  const btnText = await page.locator('button[type=submit]').textContent();
  check(/登録/.test(btnText), `初めての端末では、最初から登録の画面（ボタン：${btnText.trim()}）`);
  if (!/登録/.test(btnText)) await page.click('.swap');
  await page.fill('input[name=name]', 'smoketest'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.lb-screen.show', { timeout: 60000 }); await page.click('.lb-screen .ok', { force: true });
  await page.waitForSelector('.style-sheet .stylecard', { timeout: 15000 }).catch(() => {});
  if (await page.locator('.style-sheet .stylecard').count()) { await page.evaluate(() => document.querySelector('.stylecard').click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.style-sheet .ok').click()); }
  await page.waitForSelector('.home .giftbox', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const welcome = await page.evaluate(() => window.__app.S.gifts().find(g => g.id === 'welcome'));
  check(welcome && welcome.kind === 'ticket' && welcome.amount === 10, '新規登録記念のレアチケット10枚がBOXに届く');
  await page.click('.home .giftbox'); await page.waitForSelector('.gifts');
  const t0 = await page.evaluate(() => window.__app.HS().rareTickets || 0);
  await page.click('.gb-all'); await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => window.__app.HS().rareTickets || 0);
  check(t1 - t0 >= 10, `受け取るとチケットが増える（${t0} → ${t1}）`);
  await page.screenshot({ path: path.join(OUT, 'smoke-1-gifts.png') });
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(800);

  // ---- 2. 4択の教科を解く ----
  console.log('2. 4択の教科を解く');
  for (const subj of ['math', 'english', 'chem', 'jp', 'social']) {
    await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForTimeout(600);
    if (!(await page.locator(`.subj[data-s=${subj}]`).count())) { check(false, `${subj}：科目えらびにボタンがない`); await page.evaluate(() => window.__app.showHome()); continue; }
    await page.click(`.subj[data-s=${subj}]`); await page.waitForTimeout(700);
    let solved = 0;
    for (let k = 0; k < 30 && solved < 3; k++) {
      const st = await page.evaluate(() => {
        const vis = (e) => e && e.offsetParent !== null;
        if (vis(document.querySelector('.step .more'))) return 'more';
        const f = [...document.querySelectorAll('.fcard')].find(b => vis(b) && !b.disabled);
        if (f) { f.click(); return 'pick'; }
        return 'wait';
      });
      if (st === 'more') { solved++; await page.click('.step .more'); }
      await page.waitForTimeout(400);
    }
    check(solved >= 3, `${subj}：${solved}問 解けた`);
    await page.evaluate(() => (document.querySelector('.step .home') || document.querySelector('.quiz .back'))?.click()); await page.waitForTimeout(700);
  }

  // ---- 3. ガチャの演出（★5・昇格） ----
  console.log('3. ガチャの演出');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const [{ playPullFX }, G, T, I] = await Promise.all([import('/js/pullfx.js'), import('/js/gacha.js'), import('/js/thumbs.js'), import('/js/icons.js')]);
    const it = G.bySeries('band').find(i => i.rarity === 5) || G.byRarity(5)[0];
    // 最初の2回の乱数を小さくして、かならず「昇格」させる
    const r0 = Math.random; let n = 0; Math.random = () => (n++ < 2 ? 0.1 : r0());
    playPullFX([{ item: it, rarity: 5 }], { thumbHTML: T.thumbHTML, hydrateThumbs: T.hydrateThumbs, esc: s => String(s), vibrate: () => {}, icon: I.icon, kind: 'ticket', onDone: () => {} });
  });
  await page.waitForSelector('.od-sign canvas'); await page.waitForTimeout(600);
  const b = await page.locator('.od-sign canvas').boundingBox();
  await page.mouse.move(b.x + 20, b.y + 60); await page.mouse.down();
  for (let k = 0; k < 8; k++) await page.mouse.move(b.x + 30 + k * 25, b.y + 40 + (k % 2) * 40, { steps: 3 });
  await page.mouse.up();
  const seen = new Set(); let stamped = false;
  for (let q = 0; q < 24 && !stamped; q++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ r: (document.querySelector('.pfx')?.className.match(/r\d/) || ['-'])[0], st: !!document.querySelector('.bp.stamped') }));
    seen.add(s.r); stamped = s.st;
  }
  check(seen.has('r3') && seen.has('r5'), `線の色が青から金に変わる（昇格）：${[...seen].join(' → ')}`);
  check(stamped, '★5の「完成」ハンコが押される');
  await page.screenshot({ path: path.join(OUT, 'smoke-3-gacha.png') });

  // ---- 4. エラー ----
  console.log('4. 画面のエラー');
  check(!errors.length, errors.length ? `エラーが ${errors.length} 件：\n      ` + errors.slice(0, 5).join('\n      ') : 'エラーなし');

  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
