// パズルモードの確かめ。使い方（study-room フォルダで）：node tools/check/puzzle.js
//   1. 新しく登録 → はじめに「パズル」を選ぶ → 右下が「パズル」になる
//   2. 4種のパズルを開いて、まちがえるとハートが減る・解くとクリア → ゲージ・経験値・レベルが上がる
//   3. おひっこしは手数の上限で失敗になる
//   4. 管理者がモードを「勉強」に変えると、その人のアプリで切りかわる
//   5. 画面のエラーが出ない
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [], fails = [];
  page.on('pageerror', e => errors.push('ページ: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base);

  console.log('1. 登録して「パズル」を選ぶ');
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'puzzler'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=puzzle]', { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'puzzle-0-mode.png') });
  await page.click('.mode-sheet [data-m=puzzle]');
  await page.waitForSelector('.lb-screen.show', { timeout: 30000 }); await page.click('.lb-screen .ok', { force: true });
  await page.waitForTimeout(800);
  if (await page.locator('.style-sheet .stylecard').count()) { await page.evaluate(() => document.querySelector('.stylecard').click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.style-sheet .ok').click()); }
  await page.waitForSelector('.solve-ring', { timeout: 30000 });
  check(/パズル/.test(await page.locator('.solve-ring').textContent()), '右下のボタンが「パズル」になる');
  check(await page.evaluate(() => window.__app.S.profile().mode === 'puzzle'), 'モードが「パズル」で保存される');

  console.log('2. 4種のパズル');
  for (const id of ['akari', 'aburi', 'rokujo', 'hikkoshi']) {
    await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
    if (id === 'akari') await page.screenshot({ path: path.join(OUT, 'puzzle-1-hub.png') });
    await page.click(`.pz-star[data-p=${id}][data-s="1"]`); await page.waitForSelector('.puzzle-screen .pz-host > *');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `puzzle-2-${id}.png`) });
    const before = await page.evaluate(() => ({ g: window.__app.HS().gauge, xp: window.__app.S.profile().xp }));
    // わざとまちがえる（おひっこしは無し）
    if (id !== 'hikkoshi') {
      await page.evaluate((id) => {
        const host = document.querySelector('.pz-host');
        if (id === 'akari') { for (const b of host.querySelectorAll('.pz-cell')) { b.click(); b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3) break; } }
        if (id === 'aburi') { host.querySelector('.pz-tool[data-m="2"]').click(); for (const b of host.querySelectorAll('.pz-nono .pz-cell')) { b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3) break; } }
        if (id === 'rokujo') { const empty = [...host.querySelectorAll(".pz-sd .pz-cell")].findIndex(b => !b.querySelector("svg")); host.querySelectorAll('.pz-sd .pz-cell')[empty].click(); for (const b of host.querySelectorAll('.pz-pal button')) { b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3) break; } }
      }, id);
      check(await page.locator('.pz-life i.on').count() === 2, `${id}：まちがえるとハートが1つ減る`);
    }
    await page.evaluate(() => document.querySelector('.pz-host')._solve());
    await page.waitForSelector('.pz-res-sheet', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const txt = await page.locator('.pz-res-sheet').textContent().catch(() => '');
    check(/クリア/.test(txt), `${id}：解くとクリアになる`);
    const after = await page.evaluate((id) => ({ g: window.__app.HS().gauge, xp: window.__app.S.profile().xp, open: window.__app.S.puzzleOpen(id) }), id);
    check(after.g > before.g && after.xp > before.xp && after.open === 2, `${id}：ゲージ ${before.g}→${after.g}・XP ${before.xp}→${after.xp}・★${after.open}まで選べる`);
    await page.screenshot({ path: path.join(OUT, `puzzle-3-${id}-clear.png`) });
    if (id === 'aburi') {
      // 「★2 にちょうせん」で ★2 が始まる
      await page.click('.pz-res-sheet .go-up'); await page.waitForTimeout(300);
      check(/★2/.test(await page.locator('.puzzle-screen h2').textContent()), 'aburi：「★2 にちょうせん」で ★2 が始まる');
    }
  }

  console.log('3. ゲージのため置き・★5 のまちがい回数');
  {
    const r = await page.evaluate(() => { const hs = window.__app.HS(); hs.gauge = 500; return document.querySelector('.solve-ring') ? 1 : 0; });
    await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
    const tip = await page.locator('.buy-tip').textContent().catch(() => '');
    check(/[2-9]つ買える/.test(tip), `ゲージをためると、いくつも買える（${tip.trim()}）`);
    await page.evaluate(() => { const ps = window.__app.S.puzzleState('akari'); ps.best = 4; });
    await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
    await page.screenshot({ path: path.join(OUT, 'puzzle-1-hub2.png') });
    await page.click('.pz-star[data-p=akari][data-s="5"]'); await page.waitForSelector('.pz-cell');
    check(await page.locator('.pz-life i').count() === 2 && await page.locator('.pz-akari .pz-cell').count() === 81, '★5 は 9×9・まちがい2回まで');
    await page.screenshot({ path: path.join(OUT, 'puzzle-2-akari5.png') });
  }
  console.log('4. おひっこしの手数の上限');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
  await page.click('.pz-star[data-p=hikkoshi][data-s="2"]'); await page.waitForSelector('.pz-blk'); await page.waitForTimeout(300);
  const limit = +(await page.locator('.pz-moves').textContent()).split('/')[1];
  // 小さい植物を行ったり来たりさせる
  for (let k = 0; k < limit + 2 && !(await page.locator('.pz-res-sheet').count()); k++) {
    await page.evaluate(() => {
      const bl = [...document.querySelectorAll('.pz-blk')]; const arrows = [...document.querySelectorAll('.pz-arrows button')];
      for (const b of bl) { b.click(); const before = document.querySelector('.pz-moves b').textContent; for (const a of arrows) { a.click(); if (document.querySelector('.pz-moves b')?.textContent !== before) return; } }
    });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(700);
  check(/手数の上限/.test(await page.locator('.pz-res-sheet').textContent().catch(() => '')), `上限（${limit}手）をこえると失敗になる`);
  await page.screenshot({ path: path.join(OUT, 'puzzle-4-lose.png') });

  console.log('5. 管理者がモードを変える');
  await page.evaluate(async () => { const { rpc } = await import('/js/cloud.js'); await rpc('sr_signup', { p_username: 'admin', p_password: 'x' }); });
  // 管理者として「puzzler」を勉強に（mock なので直接コードを渡す）
  await page.evaluate(async () => { const { rpc } = await import('/js/cloud.js'); await rpc('sr_admin_grant_code', { p_token: 't-admin', p_username: 'puzzler', p_code: 'MODE:study:' + (Date.now() + 1000) }); });
  await page.evaluate(() => window.__app.showHome());
  await page.reload(); await page.waitForTimeout(1500);
  if (await page.locator('.title-screen').count()) await page.click('.title-screen');
  await page.waitForSelector('.solve-ring', { timeout: 60000 });
  if (await page.locator('.lb-screen.show').count()) await page.click('.lb-screen .ok', { force: true });
  await page.waitForTimeout(2500);
  check(await page.evaluate(() => window.__app.S.profile().mode === 'study'), '管理者が変えると「勉強」に切りかわる');
  check(!(await page.locator('.mode-sheet').count()), 'もう一度モードをきかれない');

  console.log('6. 画面のエラー');
  check(!errors.length, errors.length ? `エラーが ${errors.length} 件：\n      ` + errors.slice(0, 6).join('\n      ') : 'エラーなし');
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
