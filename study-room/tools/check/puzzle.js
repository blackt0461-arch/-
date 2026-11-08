// パズルモードの確かめ。使い方（study-room フォルダで）：node tools/check/puzzle.js
//   1. 新しく登録 → はじめに「パズル」を選ぶ → 右下が「パズル」になる
//   2. 4種のパズルを開いて、まちがえるとハートが減る・解くとクリア → ゲージ・経験値・レベルが上がる
//   3. おひっこしは失敗がなく、「1手戻る」「最初から」で何回でもやり直せる。手数でポイントが決まる
//   3b. 家具あぶりだしの絵（25枚）が、どれも数字だけで解ける（コンピューターで確かめる）
//   3c. 終わりのないパズル2つ（おしいれパッキング・インテリア・マージ）：区切りでゲージ・ベスト・ランキング
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
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
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
    // はじめて開いた時は、遊び方のカードが自動で出る（指が動く）→ とじると「i」が光らなくなる
    await page.waitForSelector('.ph-sheet', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2600);
    const help = await page.evaluate(() => ({ open: !!document.querySelector('.ph-sheet'), cap: document.querySelector('.ph-cap')?.textContent || '', finger: getComputedStyle(document.querySelector('.ph-finger') || document.body).opacity }));
    check(help.open && /(ます|です)/.test(help.cap), `${id}：はじめは遊び方のカードが自動で出る（${help.cap.slice(0, 22)}…）`);
    // 注意：遊び方のカードが動いている間は、ためし用のブラウザで画面の写真がとれない（実機では問題なし）。写真はとじてからとる
    await page.evaluate(() => document.querySelector('.ph-close')?.click()); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `puzzle-2-${id}.png`) });
    check(!(await page.locator('.ph-sheet').count()) && (await page.locator('.pz-ibtn').count()) === 1, `${id}：とじると、右上に「i」が残る`);
    const before = await page.evaluate(() => ({ g: window.__app.HS().gauge, xp: window.__app.S.profile().xp }));
    if (id === 'hikkoshi') check(await page.locator('.pz-life').count() === 0, 'hikkoshi：ハート（まちがいの回数）が出ない');
    // わざとまちがえる（おひっこしは無し）
    if (id !== 'hikkoshi') {
      await page.evaluate((id) => {
        const host = document.querySelector('.pz-host');
        if (id === 'akari') { for (const b of host.querySelectorAll('.pz-cell')) { b.click(); b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3) break; } }
        if (id === 'aburi') { host.querySelector('.pz-tool[data-m="2"]').click(); for (const b of host.querySelectorAll('.pz-nono .pz-cell')) { b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3) break; } }
        if (id === 'rokujo') { // あいているマスをえらんで家具を順に押す（たまたま正解でうまったら、次のあいているマスで続ける）
          for (let k = 0; k < 30 && document.querySelectorAll('.pz-life i.on').length === 3; k++) { const cells = [...host.querySelectorAll('.pz-sd .pz-cell')], e = cells.find(b => !b.querySelector('svg')); if (!e) break; e.click();
            for (const b of host.querySelectorAll('.pz-pal button')) { b.click(); if (document.querySelectorAll('.pz-life i.on').length < 3 || e.querySelector('svg')) break; } } }
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

  { const pts = await page.evaluate(() => window.__app.S.weekPoints()); check(pts > 0, `パズルをクリアすると、ランキングのポイントがたまる（${pts}pt）`); }
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
  console.log('4. おひっこし：失敗なし・1手戻る・最初から');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
  await page.click('.pz-star[data-p=hikkoshi][data-s="2"]'); await page.waitForSelector('.pz-blk'); await page.waitForTimeout(300);
  check(!/\//.test(await page.locator('.pz-moves').textContent()) && /最短/.test(await page.locator('.pz-moves').textContent()), `手数の上限がなく、最短の手数が出る（${(await page.locator('.pz-moves').textContent()).trim()}）`);
  // 植物を行ったり来たりさせて、40手うごかしても失敗にならない
  for (let k = 0; k < 40; k++) {
    await page.evaluate(() => {
      const bl = [...document.querySelectorAll('.pz-blk')]; const arrows = [...document.querySelectorAll('.pz-arrows button')];
      for (const b of bl) { b.click(); const before = document.querySelector('.pz-moves b').textContent; for (const a of arrows) { a.click(); if (document.querySelector('.pz-moves b')?.textContent !== before) return; } }
    });
  }
  await page.waitForTimeout(400);
  const mv40 = +(await page.locator('.pz-moves b').textContent());
  check(!(await page.locator('.pz-res-sheet').count()) && mv40 >= 40, `40手うごかしても失敗にならない（${mv40}手）`);
  await page.click('.pz-back'); await page.waitForTimeout(150);
  check(+(await page.locator('.pz-moves b').textContent()) === mv40 - 1, '「1手戻る」で手数が1つもどる');
  await page.click('.pz-reset'); await page.waitForTimeout(150);
  check(+(await page.locator('.pz-moves b').textContent()) === 0 && await page.locator('.pz-back').isDisabled(), '「最初から」で手数が0にもどる');
  await page.screenshot({ path: path.join(OUT, 'puzzle-4-slide-undo.png') });
  { const g0 = await page.evaluate(() => window.__app.HS().gauge);
    await page.evaluate(() => document.querySelector('.pz-host')._solve()); await page.waitForSelector('.pz-res-sheet', { timeout: 8000 }); await page.waitForTimeout(300);
    const g1 = await page.evaluate(() => window.__app.HS().gauge), t = await page.locator('.pz-res-sheet').textContent();
    check(/最短！/.test(t) && g1 - g0 >= 30, `最短で解くと「最短！」・★2 のゲージ満額（+${g1 - g0}）`); }
  { const r = await page.evaluate(async () => { const m = await import('/js/puzzles.js'); return [m.slideRate(16, 16), m.slideRate(24, 16), m.slideRate(32, 16), m.slideRate(99, 16)]; });
    check(r[0] === 1 && r[1] === 0.75 && r[2] === 0.5 && r[3] === 0.5, `ポイントの割合：最短 100%・1.5倍 75%・2倍以上 50%（${r.join(' / ')}）`); }
  await page.screenshot({ path: path.join(OUT, 'puzzle-4-slide-clear.png') });

  console.log('4a. 家具あぶりだしの絵');
  { const r = await page.evaluate(async () => { const m = await import('/js/puzzles.js'), n = await import('/js/nonosolve.js'); const sym = (p) => p.m.every(r => r === [...r].reverse().join('')); return m.PICS.map(p => ({ n: p.n, s: p.s, ok: n.picSolvable(p.m).solved, size: p.m.length === m.ABURI_SIZE[p.s - 1] && p.m.every(r => r.length === m.ABURI_SIZE[p.s - 1]), sym: sym(p) })); });
    check(r.length >= 20, `絵が20枚以上ある（${r.length}枚）`);
    const ng = r.filter(x => !x.ok || !x.size);
    check(!ng.length, ng.length ? `数字だけで解けない・大きさがちがう絵：${ng.map(x => x.n).join('、')}` : 'どの絵も、行と列の数字だけで最後まで解ける（大きさも★どおり）');
    check(!r.some(x => x.sym), '左右対称の絵がない');
    check([1, 2, 3, 4, 5].every(s => r.filter(x => x.s === s).length >= 4), '★ごとに4枚以上ある'); }
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__app.S.puzzleState('aburi').best = 4; });
  await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
  await page.click('.pz-star[data-p=aburi][data-s="5"]'); await page.waitForSelector('.pz-nono .pz-cell'); await page.waitForTimeout(300);
  { const r = await page.evaluate(() => ({ n: document.querySelectorAll('.pz-nono .pz-cell').length, pre: [...document.querySelectorAll('.pz-nono .pz-cell')].filter(b => b.style.background && b.style.background !== 'rgb(255, 255, 255)').length, w: document.querySelector('.pz-nono .pz-cell').getBoundingClientRect().width, right: document.querySelector('.pz-nono').getBoundingClientRect().right }));
    check(r.n === 225 && r.pre === 0, `★5 は 15×15・はじめからぬってあるマスなし（${r.n}マス・${r.pre}）`);
    check(r.w >= 34, `15×15 は、はじめから拡大して押しやすい（1マス ${r.w.toFixed(1)}px）`); }
  // 5マスごとの太い線が、マスとマスのすき間のまん中にある（マスの中に入りこまない）
  const sepOk = () => page.evaluate(() => { const c = [...document.querySelectorAll('.pz-nono .pz-cell')], N = Math.sqrt(c.length), out = [];
    document.querySelectorAll('.pz-sep').forEach(s => { const r = s.getBoundingClientRect(), v = s.classList.contains('v');
      const i = v ? Math.round(out.filter(o => o.v).length + 1) * 5 : Math.round(out.filter(o => !o.v).length + 1) * 5;
      const p = (v ? c[i - 1] : c[(i - 1) * N]).getBoundingClientRect(), q = (v ? c[i] : c[i * N]).getBoundingClientRect();
      const mid = v ? (p.right + q.left) / 2 : (p.bottom + q.top) / 2, me = v ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
      out.push({ v, d: Math.abs(mid - me), inP: v ? r.left < p.right - 1 : r.top < p.bottom - 1 }); });
    return { n: out.length, bad: out.filter(o => o.d > 0.6 || o.inP).length }; });
  { const r = await sepOk(); check(r.n === 4 && r.bad === 0, `5マスごとの太い線が、マスのさかい目にぴったり重なる（${r.n}本・ずれ ${r.bad}本）`); }
  { const r = await page.evaluate(async () => { const sc = document.querySelector('.pz-nscroll'), before = sc.scrollLeft; sc.scrollLeft = 200; await new Promise(r => setTimeout(r, 100)); const clue = document.querySelector('.pz-clue.r').getBoundingClientRect(), sr = sc.getBoundingClientRect(); const moved = sc.scrollLeft; sc.scrollLeft = before; return { moved, stuck: Math.abs(clue.left - sr.left) < 2, over: sc.scrollWidth > sc.clientWidth }; });
    check(r.over && r.moved > 0 && r.stuck, '拡大中は盤を左右に動かせて、左の数字はついてくる'); }
  await page.screenshot({ path: path.join(OUT, 'puzzle-4a-aburi5-zoom.png') });
  await page.click('.pz-zoom'); await page.waitForTimeout(250);
  { const r = await page.evaluate(() => { const sc = document.querySelector('.pz-nscroll'); return { fit: sc.scrollWidth <= sc.clientWidth + 1, w: document.querySelector('.pz-nono .pz-cell').getBoundingClientRect().width, t: document.querySelector('.pz-zoom').textContent }; });
    check(r.fit && /拡大/.test(r.t), `「全体を見る」で盤全体が画面におさまる（1マス ${r.w.toFixed(1)}px）`); }
  { const r = await sepOk(); check(r.bad === 0, '全体を見る時も、太い線はさかい目にぴったり'); }
  await page.screenshot({ path: path.join(OUT, 'puzzle-4a-aburi5.png') });
  await page.click('.pz-zoom'); await page.waitForTimeout(250); // 拡大にもどして、なぞる確かめ
  // 指でなぞると、まとめてぬれる：横に3マス以上つづく「ぬるマス」をなぞる
  { const seg = await page.evaluate(() => { const G = document.querySelector('.pz-host')._G, cl = document.querySelector('.pz-clue.r').getBoundingClientRect().right; const cell = (y, xx) => document.querySelectorAll('.pz-nono .pz-cell')[y * G.length + xx].getBoundingClientRect(); const vis = (y, xx) => { const r = cell(y, xx); return r.left > cl && r.right < innerWidth; }; for (let y = 0; y < G.length; y++) for (let x = 0; x + 2 < G[y].length; x++) if (G[y][x] && G[y][x + 1] && G[y][x + 2] && vis(y, x) && vis(y, x + 2)) { const c = (xx) => { const r = cell(y, xx); return [r.left + r.width / 2, r.top + r.height / 2]; }; let e = x + 2; while (e + 1 < G[y].length && G[y][e + 1] && vis(y, e + 1)) e++; return { y, x, e, a: c(x), b: c(e) }; } return null; });
    await page.mouse.move(seg.a[0], seg.a[1]); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(seg.a[0] + (seg.b[0] - seg.a[0]) * k / 8, seg.a[1], { steps: 2 });
    await page.mouse.up(); await page.waitForTimeout(200);
    const n = await page.evaluate((seg) => { const cs = document.querySelectorAll('.pz-nono .pz-cell'), N = Math.sqrt(cs.length); let k = 0; for (let x = seg.x; x <= seg.e; x++) if (cs[seg.y * N + x].style.background === 'rgb(43, 42, 51)') k++; return k; }, seg);
    check(n === seg.e - seg.x + 1 && await page.locator('.pz-life i.on').count() === 2, `指でなぞると、まとめてぬれる（${n}マス・まちがいなし）`); }
  // 2本指でなぞると盤が左右に動き、マスはぬられない（1.16.5）
  { const r = await page.evaluate(async () => {
      const sc = document.querySelector('.pz-nscroll'), board = document.querySelector('.pz-nono'); sc.scrollLeft = 0; await new Promise(r => setTimeout(r, 50));
      const cs = [...document.querySelectorAll('.pz-nono .pz-cell')], dark = () => cs.filter(b => b.style.background === 'rgb(43, 42, 51)' || b.querySelector('.pz-x')).length, d0 = dark();
      const a = cs[7 * 15 + 8].getBoundingClientRect(), b = cs[9 * 15 + 9].getBoundingClientRect();
      const ev = (t, id, x, y) => board.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
      ev('pointerdown', 1, a.x + 5, a.y + 5); await new Promise(r => setTimeout(r, 40)); ev('pointerdown', 2, b.x + 5, b.y + 5);
      for (let k = 1; k <= 6; k++) { ev('pointermove', 1, a.x + 5 - k * 25, a.y + 5); ev('pointermove', 2, b.x + 5 - k * 25, b.y + 5); await new Promise(r => setTimeout(r, 30)); }
      ev('pointerup', 1, a.x - 145, a.y + 5); ev('pointerup', 2, b.x - 145, b.y + 5); await new Promise(r => setTimeout(r, 200));
      return { moved: sc.scrollLeft, painted: dark() - d0 }; });
    check(r.moved > 50 && r.painted === 0 && await page.locator('.pz-life i.on').count() === 2, `2本指でなぞると盤が動き、マスはぬられない（${Math.round(r.moved)}px 動いた・ぬられた ${r.painted}）`); }
  await page.evaluate(() => document.querySelector('.pz-host')._solve()); await page.waitForSelector('.pz-res-sheet', { timeout: 8000 }); await page.waitForTimeout(500);
  check(/あらわれたのは/.test(await page.locator('.pz-res-sheet').textContent()), '★5 の絵をクリアすると、絵の名前が出る');
  await page.evaluate(() => document.querySelector('.pz-res-sheet')?.remove()); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'puzzle-4a-aburi5-clear.png') });

  console.log('4c. 終わりのないパズル');
  for (const id of ['pack', 'merge']) {
    await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
    if (id === 'pack') { await page.waitForTimeout(800); await page.evaluate(() => document.querySelector('.ed-pick')?.scrollIntoView()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, 'puzzle-5-hub-endless.png') }); }
    await page.click(`.ed-go[data-e=${id}]`); await page.waitForSelector('.endless-screen .pz-host > *');
    await page.waitForSelector('.ph-sheet', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(2600);
    const cap = await page.evaluate(() => document.querySelector('.ph-cap')?.textContent || '');
    check(/(ます|です|に)/.test(cap), `${id}：はじめは遊び方のカードが出る（${cap.slice(0, 20)}…）`);
    await page.evaluate(() => document.querySelector('.ph-close')?.click()); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `puzzle-5-${id}.png`) });
    if (id === 'pack') { // 指で箱を運んで置く
      const bb = await page.locator('.pk-board').boundingBox(), sb = await page.locator('.pk-slot').first().boundingBox();
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
      for (let k = 1; k <= 10; k++) await page.mouse.move(sb.x + sb.width / 2 + (bb.x + bb.width / 2 - sb.x - sb.width / 2) * k / 10, sb.y + sb.height / 2 + (bb.y + bb.height - 8 - sb.y - sb.height / 2) * k / 10);
      await page.screenshot({ path: path.join(OUT, 'puzzle-5-pack-drag.png') });
      await page.mouse.up(); await page.waitForTimeout(300);
      const st = await page.evaluate(() => document.querySelector('.pz-host')._state());
      check(st.moves === 1 && st.score > 0, `pack：箱を指で運んで置ける（スコア ${st.score}）`);
    }
    const g0 = await page.evaluate(() => window.__app.HS().gauge);
    // コンピューターが遊ぶ：区切りを2つ越えるまで
    const target = id === 'pack' ? 250 : 800;
    for (let k = 0; k < 1500; k++) {
      const st = await page.evaluate(async (id) => { const h = document.querySelector('.pz-host'); if (id === 'pack') { h._auto(); } else { for (const d of ['down', 'left', 'down', 'right']) { if (h._move(d)) break; } await new Promise(r => setTimeout(r, 150)); } return h._state(); }, id);
      if (st.over || st.score >= target) break;
    }
    const mid = await page.evaluate(() => ({ g: window.__app.HS().gauge, got: document.querySelector('.ed-got')?.textContent, s: +document.querySelector('.ed-now').textContent }));
    check(mid.g > g0 && /\+\d+/.test(mid.got), `${id}：スコアが区切りを越えるとゲージがたまる（スコア ${mid.s}・ゲージ ${g0}→${mid.g}・${mid.got}）`);
    await page.screenshot({ path: path.join(OUT, `puzzle-5-${id}-play.png`) });
    await page.evaluate(() => document.querySelector('.pz-host')._end());
    await page.waitForSelector('.pz-res-sheet', { timeout: 6000 }); await page.waitForTimeout(300);
    const t = await page.locator('.pz-res-sheet').textContent();
    const best = await page.evaluate((id) => window.__app.S.endlessState(id).best, id);
    check(/スコア/.test(t) && best === mid.s, `${id}：終わるとスコアとベストが出る（ベスト ${best}）`);
    await page.screenshot({ path: path.join(OUT, `puzzle-5-${id}-end.png`) });
    await page.click('.pz-res-sheet .rank'); await page.waitForSelector('.ed-rank-sheet .rk-row', { timeout: 6000 }).catch(() => {});
    check(await page.locator('.ed-rank-sheet .rk-row.me').count() === 1, `${id}：ランキングに自分の記録が出る`);
    await page.click('.ed-tabs [data-s=all]'); await page.waitForTimeout(500);
    check(await page.locator('.ed-rank-sheet .rk-row.me').count() === 1, `${id}：「歴代」にも出る`);
    if (id === 'merge') await page.screenshot({ path: path.join(OUT, 'puzzle-5-ranking.png') });
  }
  { // 1回の上限は ★5 と同じ（72）。同じ日にたくさん遊ぶと減る
    const r = await page.evaluate(async () => { const e = await import('/js/endless.js'); const S = window.__app.S; const a = e.MILESTONES.pack.length * e.MILESTONE_GAUGE; const pf = S.profile(); pf.endlessDay = { day: S.dayKey(), pack: 450 }; const rate = S.endlessRate('pack'); return { a, rate, capOk: e.scoreCap('pack', 10) === 3190 }; });
    check(r.a === 72 && r.rate === 0.4 && r.capOk, `1回のゲージの上限は 72・同じ日にたくさん遊ぶと減る（倍率 ${r.rate}）`); }
  { const n0 = errors.length;
    const r = await page.evaluate(async () => { const { rpc } = await import('/js/cloud.js'); try { await rpc('sr_endless_submit', { p_token: 't-puzzler', p_game: 'pack', p_score: 999999, p_moves: 3, p_secs: 60 }); return 'ok'; } catch (e) { return e.code || e.message; } });
    await page.waitForTimeout(200); errors.splice(n0); // はじかれた時の「400」はわざと（エラーに数えない）
    check(r !== 'ok', 'ありえない高得点は、ランキングに入らない'); }
  { await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
    const t = await page.locator('.ed-pick').first().textContent();
    check(/ベスト\s*[1-9]/.test(t), `パズルえらびに自分のベストが出る（${t.replace(/\s+/g, ' ').trim().slice(0, 40)}）`);
    await page.click('.puzzle-sheet .sh-x'); await page.waitForTimeout(200); }

  console.log('4b. パズルサイドは、勉強とパズルを自由に行き来できる');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
  check(await page.locator('.mode-toggle').count() === 1, '部屋の右下に「勉強｜パズル」の切りかえがある');
  await page.click('.mode-toggle [data-mode=study]'); await page.waitForTimeout(300);
  check(/解く|続きから/.test(await page.locator('.solve-ring').textContent()), '「勉強」を押すと、右下が「解く」になる');
  await page.click('.mode-toggle [data-mode=puzzle]'); await page.waitForTimeout(300);
  check(/パズル/.test(await page.locator('.solve-ring').textContent()), '「パズル」を押すと、右下が「パズル」にもどる');
  await page.evaluate(() => document.querySelector('.solve-ring').click()); await page.waitForSelector('.pz-hub');
  check(await page.locator('.pz-tix').count() === 0, 'パズルサイドには、パズルの回数の制限が出ない');
  check(await page.locator('.puzzle-sheet .sh-x').count() === 1, 'パズルえらびの右上に × がある');
  await page.click('.puzzle-sheet .sh-x'); await page.waitForTimeout(300);
  check(await page.locator('.pz-hub').count() === 0, '× でとじる');

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
