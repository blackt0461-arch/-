// 勉強まわりの確かめ（1.12.0）。使い方：node tools/check/study.js
//   1. まちがえると「えらんだ答えがちがう理由」と「くわしい解説」が出る
//   2. 単元えらびに「まちがえた問題を解き直す」が出て、3回続けて正解すると外れる
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/bank/math.json'), 'utf8'));
const Q = BANK.find(p => p.detail && /重心/.test(p.text));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx);
  const page = await ctx.newPage(), fails = [], errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'studyU'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);
  check(!!Q, `くわしい解説つきの問題がある（${Q && Q.text.slice(0, 20)}…）`);

  console.log('1. まちがえた時の解説');
  let meta = '';
  const openMath = async () => {
    await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.solve-ring')?.click());
    await page.waitForFunction(() => { const b = document.querySelector('.subj[data-s=math]'); return b && !b.disabled; }, null, { timeout: 30000 });
    meta = await page.evaluate(() => document.querySelector('.subj[data-s=math] small')?.textContent);
    await page.click('.subj[data-s=math]'); await page.waitForTimeout(500);
  };
  await page.evaluate((id) => { const S = window.__app.S, st = S.subject('math'); st.scope = { genre: '数学A', unit: '図形の性質' }; st.session = { set: [{ id, review: false }], idx: 0, results: [], gained: 0, xp: 0, rankUp: false, startedAt: Date.now(), bonus: false }; S.save(); }, Q.id);
  await openMath();
  await page.click('.sc-resume'); await page.waitForSelector('.fcard');
  const wrongIdx = Q.answer === 0 ? 1 : 0;
  await page.click(`.fcard[data-i="${wrongIdx}"]`); await page.waitForSelector('.res', { timeout: 8000 });
  const why = await page.locator('.why-wrong').textContent().catch(() => '');
  check(why.includes(Q.why[wrongIdx].slice(0, 10)), `えらんだ答えがちがう理由が出る（${why.replace(/\s+/g, ' ').slice(0, 40)}…）`);
  check(await page.locator('.detail-ex[open]').count() === 1, 'くわしい解説が開いた状態で出る');
  await page.screenshot({ path: path.join(OUT, 'study-why.png'), fullPage: true });
  await page.click('.step .home'); await page.waitForTimeout(800);

  console.log('2. まちがえた問題を解き直す');
  await openMath();
  check(/まちがい 1問/.test(meta || ''), `教科えらびに「まちがい 1問」（${meta}）`);
  await page.waitForSelector('.sc-wrong', { timeout: 5000 }).catch(() => {});
  check(/1問/.test(await page.locator('.sc-wrong').textContent().catch(() => '')), '「まちがえた問題を解き直す 1問」が出る');
  await page.screenshot({ path: path.join(OUT, 'study-wrong.png') });
  await page.click('.sc-wrong');
  for (let k = 0; k < 3; k++) {
    await page.waitForSelector('.fcard', { timeout: 8000 });
    const txt = await page.locator('.choice .problem').textContent();
    check(txt.includes(Q.text.slice(0, 12)), `${k + 1}回目：まちがえた問題が出る`);
    await page.click(`.fcard[data-i="${Q.answer}"]`); await page.waitForSelector('.step .more', { timeout: 8000 });
    await page.click('.step .more'); await page.waitForTimeout(900);
  }
  const r = await page.evaluate((id) => window.__app.S.subject('math').srs[id], Q.id);
  check(r && r.mastered, `3回続けて正解で克服（stage ${r && r.stage}）`);
  check(await page.locator('.home').count() === 1, 'ぜんぶ克服したら部屋にもどる');
  await openMath();
  check(await page.locator('.sc-wrong').count() === 0, '解き直しの行が消える');
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 120)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
