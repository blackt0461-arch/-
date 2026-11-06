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
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base);

  // ---- 1. 新しく登録 ----
  console.log('1. 新しく登録');
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  const btnText = await page.locator('button[type=submit]').textContent();
  check(/登録/.test(btnText), `初めての端末では、最初から登録の画面（ボタン：${btnText.trim()}）`);
  if (!/登録/.test(btnText)) await page.click('.swap');
  await page.fill('input[name=name]', 'smoketest'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  // はじめに「勉強」を選ぶ（確かめの画面は OK）
  page.on('dialog', d => d.accept());
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
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
    await page.click(`.subj[data-s=${subj}]`); await page.waitForTimeout(500);
    // ジャンル・単元をえらぶ画面が出たら「すべて」から
    await page.evaluate(() => (document.querySelector('.sc-list [data-all]') || document.querySelector('.sc-list [data-gall]'))?.click()); await page.waitForTimeout(700);
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

  // ---- 2b. 教科 → ジャンル → 単元（問題バンク） ----
  console.log('2b. 教科 → ジャンル → 単元');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.solve-ring')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.subj')].some(b => b.dataset.s === 'bio' && !b.disabled), null, { timeout: 30000 }).catch(() => {});
  const subjList = await page.evaluate(() => [...document.querySelectorAll('.subj')].map(b => b.dataset.s + (b.disabled ? '(×)' : '')).join(' '));
  check(['bio', 'earth', 'physics4', 'physics'].every(k => subjList.includes(k) && !subjList.includes(k + '(×)')), `生物・地学・物理（4択）・物理（公式）がえらべる：${subjList}`);
  await page.screenshot({ path: path.join(OUT, 'smoke-2b-subjects.png') });
  await page.click('.subj[data-s=jp]'); await page.waitForSelector('.sc-list');
  check(await page.locator('.sc-list [data-g]').count() >= 4, `国語のジャンルが出る（${await page.locator('.sc-list [data-g]').count()}つ）`);
  await page.click('.sc-list [data-g="古文"]'); await page.waitForSelector('.sc-list [data-u]');
  await page.screenshot({ path: path.join(OUT, 'smoke-2b-units.png') });
  await page.click('.sc-list [data-u="枕草子"]'); await page.waitForTimeout(800);
  const units = new Set();
  for (let k = 0; k < 3; k++) {
    units.add(await page.evaluate(() => document.querySelector('.choice .tag')?.textContent.trim()));
    await page.evaluate(() => [...document.querySelectorAll('.fcard')].find(b => !b.disabled)?.click()); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('.step .more')?.click()); await page.waitForTimeout(600);
  }
  check(units.size === 1 && units.has('枕草子'), `「枕草子」をえらぶと、枕草子の問題だけ出る（${[...units].join('・')}）`);
  await page.evaluate(() => (document.querySelector('.step .home') || document.querySelector('.quiz .back'))?.click()); await page.waitForTimeout(600);
  // もう一度ひらくと「続きから」が出る（とちゅうでやめた時）
  await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForTimeout(500);
  await page.click('.subj[data-s=jp]'); await page.waitForTimeout(400);
  const rs = await page.locator('.sc-resume').textContent().catch(() => '');
  check(/枕草子/.test(rs) || rs === '', `続きからのボタンに、えらんだ範囲が出る（${rs.trim() || 'セットが終わっていて続きなし'}）`);
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);

  // ---- 2c. スタディサイド：勉強をするとパズルが遊べる ----
  console.log('2c. スタディサイドのパズル');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
  const tix = await page.evaluate(() => ({ t: window.__app.S.puzzleTickets(), side: window.__app.S.sideOf(), solved: window.__app.S.profile().solved }));
  check(tix.side === 'study' && tix.t === Math.floor(tix.solved / 5), `5問ごとにパズルが1回ふえる（${tix.solved}問 → ${tix.t}回）`);
  await page.click('.mode-toggle [data-mode=puzzle]'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForSelector('.pz-hub');
  check(await page.locator('.pz-tix').count() === 1, `パズルえらびに「あと${tix.t}回できます」が出る`);
  await page.evaluate(() => document.querySelector('.pz-star[data-p=akari][data-s="1"]')?.click()); await page.waitForTimeout(800);
  check(await page.locator('.puzzle-screen').count() === 1 && await page.evaluate(() => window.__app.S.puzzleTickets()) === tix.t - 1, 'パズルを始めると、回数が1つへる');
  await page.evaluate(() => { document.querySelector('.ph-close')?.click(); document.querySelector('.puzzle-screen .back')?.click(); }); await page.waitForTimeout(400);
  await page.evaluate(() => { window.__app.S.profile().puzzleTickets = 0; });
  await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForSelector('.pz-hub');
  await page.evaluate(() => document.querySelector('.pz-star[data-p=akari][data-s="1"]')?.click()); await page.waitForTimeout(600);
  check(await page.locator('.puzzle-screen').count() === 0, '回数が0のときは、パズルを始められない');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.click('.mode-toggle [data-mode=study]'); await page.waitForTimeout(300);

  // ---- 2d. 家具を買う画面をたたんで、部屋を見る ----
  console.log('2d. 家具を買う画面をたたむ');
  await page.evaluate(() => { const hs = window.__app.HS(); hs.gauge = 999; window.__app.showHome(); }); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-t=buy]')?.click()); await page.waitForSelector('.genre-row', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.genre-row')?.click()); await page.waitForSelector('.cand-sheet .cand', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.cand-sheet .cand')?.click()); await page.waitForTimeout(800);
  const h0 = await page.evaluate(() => document.querySelector('.cand-sheet')?.getBoundingClientRect().height || 0);
  await page.click('.cand-sheet .sh-fold'); await page.waitForTimeout(400);
  const h1 = await page.evaluate(() => document.querySelector('.cand-sheet')?.getBoundingClientRect().height || 0);
  check(h1 > 0 && h1 < h0 * 0.5 && await page.locator('.cand-sheet .ok').isVisible(), `「部屋を見る」で画面が小さくなり、買うボタンは残る（高さ ${Math.round(h0)} → ${Math.round(h1)}）`);
  await page.screenshot({ path: path.join(OUT, 'smoke-2d-fold.png') });
  await page.click('.cand-sheet .sh-fold'); await page.waitForTimeout(300);
  check(await page.locator('.cand-sheet .candgrid').isVisible(), '「もどす」で元にもどる');
  await page.evaluate(() => { window.__app.room3d?.clearPreview(); window.__app.showHome(); }); await page.waitForTimeout(400);

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
