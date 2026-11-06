// サイドの確かめ（1.12.0）：管理者がサイドを変えると、その人が「勉強｜パズル」を押したあとでも、開いたままでも、切りかわる。
// ふつうの人は「勉強｜パズル」を押してもサイドは変わらない。使い方：node tools/check/side.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const db = { users: {} }, fails = [], errors = [];
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  async function device(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx, db);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen'); await page.waitForSelector('button[type=submit]');
    if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
    await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
    await page.waitForTimeout(800);
    return { ctx, page };
  }
  console.log('1. ふつうの人：「勉強｜パズル」を押してもサイドは変わらない');
  const N = await device('nana');
  const side0 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf());
  await N.page.evaluate(() => document.querySelector('.mode-toggle [data-mode=puzzle]')?.click()); await N.page.waitForTimeout(800);
  const after = await N.page.evaluate(async () => ({ side: (await import('/js/store.js')).sideOf(), mode: window.__app.S.profile().mode }));
  check(side0 === 'study' && after.side === 'study' && after.mode === 'puzzle', `パズルに切りかえても、スタディサイドのまま（mode ${after.mode}・side ${after.side}）`);
  console.log('1b. パズルの回数：正解だけ数え、その日にふえるたびに必要な数がふえる');
  const tk = await N.page.evaluate(async () => {
    const S = await import('/js/store.js'), p = S.profile();
    const save = { c: p.studyCount, t: p.puzzleTickets, d: p.ticketDay, n: p.ticketsToday };
    p.studyCount = 0; p.puzzleTickets = 0; p.ticketsToday = 0;
    const r = {};
    for (let i = 0; i < 8; i++) S.countStudyForPuzzle(false);
    r.wrong = S.puzzleTickets();
    for (let i = 0; i < 5; i++) S.countStudyForPuzzle(true);
    r.first = S.puzzleTickets(); r.need2 = S.studyToNextPuzzle();
    for (let i = 0; i < 9; i++) S.countStudyForPuzzle(true);
    r.nine = S.puzzleTickets();
    S.countStudyForPuzzle(true); r.second = S.puzzleTickets(); r.need3 = S.studyToNextPuzzle();
    p.ticketDay = '2000-01-01'; r.nextDay = S.studyToNextPuzzle();
    Object.assign(p, { studyCount: save.c, puzzleTickets: save.t, ticketDay: save.d, ticketsToday: save.n });
    delete p.side; p.mode = 'puzzle'; r.noSide = S.sideOf(); p.mode = 'study';
    return r;
  });
  const gp = await N.page.evaluate(async () => { const S = await import('/js/store.js'); return { jp15: S.gaugePoints(true, false, 15, 'jp'), math60: S.gaugePoints(true, false, 60, 'math'), jpIdle: S.gaugePoints(true, false, 600, 'jp'), mathIdle: S.gaugePoints(true, false, 600, 'math'), wrong: S.gaugePoints(false, false, 60, 'math'), quick: S.gaugePoints(true, false, 2, 'jp') }; });
  check(gp.jp15 === 23 && gp.math60 === 90, `ゲージはかかった時間に比例（国語15秒 ${gp.jp15}・数学60秒 ${gp.math60}）`);
  check(gp.jpIdle < gp.mathIdle && gp.jpIdle === Math.round(45 * 1.5), `放っておいても上限まで（国語 ${gp.jpIdle}・数学 ${gp.mathIdle}）`);
  check(gp.wrong === Math.round(60 * 1.5 * 0.3) && gp.quick === 12, `まちがいは考えた時間の3割、すぐ答えても少しはたまる（${gp.wrong}・${gp.quick}）`);
  const mk = await N.page.evaluate(async () => {
    const S = await import('/js/store.js'), st = window.__app.S;
    S.logDay({}); const d = S.dayKey(), log = S.dayLog();
    const keep = JSON.stringify(log);
    for (const k of Object.keys(log)) delete log[k];
    // 7日で国語40問（正解率9割）・数学10問（正解率4割）。英語は0問
    log[d] = { n: 50, c: 40, pz: 0, u: { 'jp|古文単語': [40, 36], 'math|二次関数': [10, 4] }, t: { jp: 25 * 60 } };
    const m = S.subjectMults(['jp', 'math', 'english']);
    const decayJp = S.todayUse('jp', '古文単語'), f = S.gaugeFactor({ sid: 'jp', unit: '古文単語', sids: ['jp', 'math', 'english'] });
    const fm = S.gaugeFactor({ sid: 'math', unit: '二次関数', sids: ['jp', 'math', 'english'] });
    const sub = { srs: { q1: { lastOk: d } } }, fr = S.gaugeFactor({ sid: 'math', unit: '二次関数', sub, id: 'q1', sids: ['math'] });
    for (const k of Object.keys(log)) delete log[k];
    Object.assign(log, JSON.parse(keep));
    const few = S.subjectMults(['jp', 'english']);
    return { m, f, fm, fr, decayJp, few };
  });
  check(mk.m.english.mult === 1.3 && mk.m.math.mult === 1.2 && mk.m.jp.mult === 0.9, `倍率：やっていない英語1.3・苦手な数学1.2・やりすぎの国語0.9（${mk.m.english.mult}・${mk.m.math.mult}・${mk.m.jp.mult}）`);
  check(Math.abs(mk.f.f - 0.9 * 0.7 * 0.4) < 1e-9 && mk.f.decayed, `国語25分・古文単語40問 → 0.9×0.7×0.4（${mk.f.f.toFixed(3)}）`);
  check(mk.fm.f === 1.2 && !mk.fm.decayed, `数学は減らずに1.2倍（${mk.fm.f}）`);
  check(Math.abs(mk.fr.f - 1.2 * 0.3) < 1e-9 && mk.fr.repeat, `今日もう正解した問題は3割（${mk.fr.f.toFixed(2)}）`);
  check(tk.wrong === 0, `まちがいは数えない（${tk.wrong}回）`);
  check(tk.first === 1 && tk.need2 === 10, `正解5問で1回、次は10問（${tk.first}回・あと${tk.need2}問）`);
  check(tk.nine === 1 && tk.second === 2 && tk.need3 === 15, `正解10問で2回目、その次は15問（${tk.second}回・あと${tk.need3}問）`);
  check(tk.nextDay === 5, `次の日は5問にもどる（あと${tk.nextDay}問）`);
  check(tk.noSide === 'study', `サイドの記録がない人は、パズルにしていてもスタディサイド（${tk.noSide}）`);
  await N.page.evaluate(async () => { window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  console.log('2. 管理者が「パズルサイド」に変える（nana は開いたまま・押したあと）');
  const A = await device('admin');
  await A.page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await A.page.waitForTimeout(400);
  await A.page.click('.menu-list [data-m=admin]'); await A.page.waitForSelector('.ac-mode-btn[data-u=nana]');
  await A.page.click('.ac-mode-btn[data-u=nana]'); await A.page.waitForSelector('.mode-pick [data-m=puzzle]');
  await A.page.click('.mode-pick [data-m=puzzle]'); await A.page.waitForTimeout(800)
  check(db.users.nana.data.profile.side === 'puzzle', `サーバーの記録が「パズルサイド」になる（${db.users.nana.data.profile.side}）`);
  // nana の開いたままのアプリが、古いサイドで保存しても元にもどらない
  await N.page.evaluate(async () => { window.__app.S.profile().xp += 3; window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  await N.page.waitForTimeout(600);
  check(db.users.nana.data.profile.side === 'puzzle', `開いたままのアプリが保存しても、パズルサイドのまま（${db.users.nana.data.profile.side}）`);
  // nana が画面にもどると、すぐ切りかわる
  await N.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await N.page.waitForTimeout(1500);
  const n2 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf());
  check(n2 === 'puzzle', `nana のアプリも切りかわる（${n2}）`);
  console.log('3. 次に開いた時も、パズルサイド');
  await N.page.reload(); await N.page.waitForSelector('.title-screen'); await N.page.click('.title-screen'); await N.page.waitForTimeout(5000);
  const n3 = await N.page.evaluate(async () => (await import('/js/store.js')).sideOf()).catch(() => null);
  check(n3 === 'puzzle', `開きなおしても、パズルサイド（${n3}）`);
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 150)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
