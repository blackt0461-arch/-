// 物理の統合と新しい出し方の確かめ（1.17.0）。使い方：node tools/check/physics.js
//   1. 前の「物理（公式）」「物理（4択）」の記録が、1つの「物理」にまとまる（まちがえた問題・単元の数・毎日の記録）
//   2. 教科えらびに「物理」が1つだけ出る
//   3. 計算・組み立て（公式・単位）・並べかえ・グラフの問題が、正解でもまちがいでも動く
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bank/physics.json'), 'utf8'));
const C4 = BANK.find(p => p.id.startsWith('physics4-'));
const pick = (f) => BANK.find(f);
const QN = pick(p => p.type === 'num' && !p.fig && p.ans > 0 && !p.ansText);
const QNEG = pick(p => p.type === 'num' && p.ans < 0);
const QEXP = pick(p => p.type === 'num' && p.ansText);
const QFIG = pick(p => p.type === 'num' && p.fig);
const QB = pick(p => p.type === 'build' && p.kind !== 'unit' && p.parts.some(x => x.g));
const QU = pick(p => p.type === 'build' && p.kind === 'unit');
const QO = pick(p => p.type === 'order');
const QC = pick(p => !p.type && p.fig);
const today = (() => { const t = new Date(Date.now() - 6 * 3600e3); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
// 前の版の記録（公式で phy-001 を2回まちがえ、4択で1問まちがえ・1問克服）
const OLD = {
  version: 1, streak: { count: 1, last: today, total: 3 }, profile: { xp: 50, solved: 6, correct: 3, perfect: 2, lastStudy: { sid: 'physics4', scope: { genre: '物理基礎', unit: '運動の法則' } }, qtime: { 'physics4|運動の法則': [120, 3], 'physics|力学': [300, 3] } },
  subjects: {
    physics: { srs: { 'phy-001': { stage: 0, due: today, wrongs: 2, rights: 1, mastered: false, seen: true }, 'phy-006': { stage: -1, due: null, wrongs: 0, rights: 1, mastered: false, seen: true } }, units: { '力学': { solved: 3, correct: 1, perfect: 1 }, '熱': { solved: 1, correct: 1, perfect: 1 } }, session: null, scope: { unit: '力学' } },
    physics4: { srs: { [C4.id]: { stage: 0, due: today, wrongs: 1, rights: 0, mastered: false, seen: true }, [BANK[1].id]: { stage: 3, due: null, wrongs: 1, rights: 3, mastered: true, seen: true } }, units: { [C4.unit]: { solved: 2, correct: 1, perfect: 1 } }, session: null },
  },
  log: { [today]: { n: 6, c: 3, pz: 0, u: { 'physics4|運動の法則': [2, 1], 'physics|力学': [4, 2] }, t: { physics4: 100, physics: 200 } } },
  house: { v: 2, gauge: 0, unlocks: 0, tickets: 0, inventory: {}, rooms: [], current: 0, nextUid: 1, specialsGiven: 0, pendingSpecials: 0 },
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const db = { users: { physU: { data: JSON.parse(JSON.stringify(OLD)) } } };
  await mock(ctx, db);
  const page = await ctx.newPage(), fails = [], errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'physU'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { document.querySelector('.mode-sheet [data-m=study]')?.click(); }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);

  console.log('1. 記録のまとめ');
  const st = await page.evaluate(() => { const s = window.__app.S.getState(); return { subs: Object.keys(s.subjects), ph: s.subjects.physics, merged: s.physMerged, backup: !!s.physBackup?.physics4, log: s.log, last: s.profile.lastStudy, qtime: s.profile.qtime }; });
  check(!st.subs.includes('physics4'), `物理（4択）の記録がなくなり、1つになる（${st.subs.join(',')}）`);
  check(st.merged && st.backup, '元の記録を念のため残している');
  check(st.ph.srs['phy-001']?.wrongs === 2 && st.ph.srs[C4.id]?.wrongs === 1 && st.ph.srs[BANK[1].id]?.mastered, '問題ごとの記録（まちがい・克服）が両方そろう');
  check(!st.ph.units['力学'] && st.ph.units['運動の表し方']?.solved === 3 && st.ph.units['熱']?.solved === 1, `公式の単元を教科書の単元に数えなおす（${JSON.stringify(st.ph.units)}）`);
  check(st.ph.units[C4.unit]?.solved >= 2, '4択の単元の数も入る');
  const lg = st.log[today];
  check(lg.u['physics|運動の法則']?.[0] === 2 && !lg.u['physics4|運動の法則'] && lg.t.physics === 300 && !lg.t.physics4, '毎日の記録も「物理」にまとまる');
  check(st.last.sid === 'physics' && st.ph.scope?.unit === '運動の法則', '前回のつづき（範囲）も引きつぐ');
  check(st.qtime['physics|運動の法則'] && st.qtime['physics:f|力学'], '答えた時間の記録も引きつぐ');
  const wrongN = await page.evaluate(() => window.__app.S.wrongList(window.__app.S.subject('physics'), []).length);
  // 2回目に開いても二重に数えない（古い端末がまた physics4 を書いた場合）
  const again = await page.evaluate((id) => { const S = window.__app.S, s = S.getState(); s.subjects.physics4 = { srs: { [id]: { stage: 0, wrongs: 5, rights: 0, seen: true } }, units: { x: { solved: 9 } } }; S.replaceState(JSON.parse(JSON.stringify(s))); const t = S.getState(); return { has4: !!t.subjects.physics4, w: t.subjects.physics.srs[id].wrongs, x: !!t.subjects.physics.units.x }; }, C4.id);
  check(!again.has4 && again.w === 5 && !again.x, '古い端末の記録がまた来ても、問題ごとの記録だけ足して二重に数えない');

  console.log('2. 教科えらび');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.solve-ring')?.click());
  await page.waitForFunction(() => { const b = document.querySelector('.subj[data-s=physics]'); return b && !b.disabled && !/読みこみ/.test(b.textContent); }, null, { timeout: 30000 });
  const names = await page.locator('.subj b').allTextContents();
  check(names.filter(n => /物理/.test(n)).length === 1 && names.includes('物理'), `「物理」が1つだけ（${names.join('・')}）`);
  const nAll = await page.evaluate(() => window.__app.problemById ? null : null);
  await page.click('.subj[data-s=physics]'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'physics-genres.png') });
  const rows = await page.locator('.sc-row b').allTextContents();
  check(rows.includes('物理基礎') && rows.includes('物理'), `ジャンル：${rows.join('・')}`);
  check(/問/.test(await page.locator('.sc-wrong').textContent().catch(() => '')), 'まちがえた問題（公式・4択の両方）を解き直せる');
  await page.evaluate(() => document.querySelector('.sheet .close, .sh-x.close')?.click()); await page.waitForTimeout(300);

  console.log('3. 新しい出し方');
  const run = async (q, label, answer, expectOk, shot) => {
    await page.evaluate((id) => { const S = window.__app.S, st = S.subject('physics'); st.scope = null; st.session = { set: [{ id, review: false }], idx: 0, results: [], gained: 0, xp: 0, rankUp: false, startedAt: Date.now(), bonus: false }; S.save(); }, q.id);
    await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('.solve-ring')?.click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.subj[data-s=physics]')?.click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.sc-resume')?.click());
    await page.waitForSelector('.quiz .step', { timeout: 8000 });
    if (shot) await page.screenshot({ path: path.join(OUT, `physics-${shot}-q.png`) });
    await answer();
    await page.waitForSelector('.nx-res, .res', { timeout: 8000 });
    const ok = await page.locator('.res.ok').count() === 1;
    check(ok === expectOk, `${label}：${expectOk ? '正解' : 'まちがい'}になる`);
    if (shot) await page.screenshot({ path: path.join(OUT, `physics-${shot}-a.png`), fullPage: true });
    const r = await page.evaluate((id) => window.__app.S.subject('physics').srs[id], q.id);
    check(r && r.seen && (expectOk ? r.rights >= 1 : r.wrongs >= 1), `${label}：記録に残る`);
  };
  const typeNum = (s) => async () => { for (const ch of s) { const k = ch === '-' ? 'neg' : ch === 'e' ? 'exp' : ch; await page.click(`.pt-k[data-k="${k}"]`); } await page.click('.pt-k[data-k=go]'); };
  const fmt = (v) => String(+v.toPrecision(3));
  await run(QN, `計算（${QN.text.slice(0, 14)}…）`, typeNum(fmt(QN.ans)), true, 'num');
  await run(QN, '計算でまちがえた数', typeNum(fmt(QN.ans * 1.5)), false, 'num-ng');
  await run(QNEG, `計算・マイナス（答え ${QNEG.ans}）`, typeNum(fmt(QNEG.ans)), true);
  const ex = Math.floor(Math.log10(QEXP.ans)), man = +(QEXP.ans / 10 ** ex).toPrecision(2);
  await run(QEXP, `計算・×10ⁿ（${man}×10^${ex}）`, typeNum(`${man}e${ex}`), true);
  await run(QFIG, 'グラフを読む計算', typeNum(fmt(QFIG.ans)), true, 'fig');
  const build = (q, swap) => async () => {
    const want = q.parts.filter(x => x && typeof x === 'object').map(x => x.a);
    if (swap) { const gi = q.parts.map((x, i) => [x, i]).filter(([x]) => x && x.g); const a = want.indexOf(gi[0][0].a), b = want.indexOf(gi[1][0].a); [want[a], want[b]] = [want[b], want[a]]; }
    for (const t of want) await page.evaluate((t) => [...document.querySelectorAll('.pb-chip:not(.used)')].find(b => b.textContent === t)?.click(), t);
    await page.click('.pb-go');
  };
  await run(QB, `公式を組み立てる（${QB.text.slice(0, 12)}…）`, build(QB, false), true, 'build');
  await run(QB, '順番を問わない所を入れかえても正解', build(QB, true), true);
  await run(QU, '単位を組み立てる', build(QU, false), true, 'unit');
  await run(QU, '単位をまちがえる', async () => { const n = QU.parts.filter(x => typeof x === 'object').length; for (let i = 0; i < n; i++) await page.evaluate((d) => [...document.querySelectorAll('.pb-chip:not(.used)')].find(b => b.textContent === d)?.click(), QU.pool[i % QU.pool.length]); await page.click('.pb-go'); }, false);
  const order = (q, rev) => async () => { const its = rev ? q.items.slice().reverse() : q.items; for (const t of its) await page.evaluate((t) => [...document.querySelectorAll('.po-item')].find(b => b.querySelector('span').textContent === t)?.click(), t); await page.click('.po-go'); };
  await run(QO, '並べかえ', order(QO, false), true, 'order');
  await run(QO, '並べかえをまちがえる', order(QO, true), false);
  await run(QC, 'グラフつき4択', async () => { await page.click(`.fcard[data-i="${QC.answer}"]`); }, true, 'choice');
  check(await page.evaluate(() => !!document.querySelector('.pfig svg')), 'グラフが描かれる');
  // 前の公式の問題も、物理の中で動く
  await run({ id: 'phy-003' }, '前の公式の問題（文字→公式）', async () => {
    for (let k = 0; k < 6 && await page.locator('.sym').count(); k++) {
      const ok = await page.evaluate(() => { const want = { '質量 2.0 kg': 'm', '6.0 N の力': 'F', '加速度の大きさ': 'a' }; const act = document.querySelector('.ph.active'); const s = want[act?.textContent.trim()]; const b = [...document.querySelectorAll('.sym')].find(x => x.textContent === s); b?.click(); return !!b; });
      if (!ok) break; await page.waitForTimeout(150);
    }
    await page.evaluate(() => [...document.querySelectorAll('.fcard')].find(b => b.textContent === 'F = ma')?.click());
  }, true);
  const tag = await page.evaluate(() => document.querySelector('.quiz .tag')?.textContent);
  check(tag === '運動の法則', `公式の問題の単元が教科書の名前になる（${tag}）`);
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 160)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
