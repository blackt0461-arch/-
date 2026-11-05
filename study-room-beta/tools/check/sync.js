// 2つの端末で同じアカウントを使った時に、記録が消えないかの確かめ（1.11.0）。使い方：node tools/check/sync.js
//   端末B で少し遊ぶ → 端末A で大きく進める → 端末B を電波が悪い状態（記録の読みこみが5秒かかる）で開く
//   → 前の版では、端末B の古い記録がネットの新しい記録を上書きしていた。いまは 端末A の記録が残り、端末B も追いつく
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const db = { users: {} }, fails = [];
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  const serverXp = () => db.users.syncU?.data?.profile?.xp || 0;
  async function device(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx, db, opts);
    const page = await ctx.newPage(); page.on('dialog', d => d.accept());
    await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.quality', 'low'); });
    return { ctx, page };
  }
  async function login(page, signup) {
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    await page.waitForSelector('button[type=submit]');
    const isSignup = /登録/.test(await page.locator('button[type=submit]').textContent());
    if (signup !== isSignup) await page.click('.swap');
    await page.fill('input[name=name]', 'syncU'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    if (signup) { await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]'); }
    await page.waitForTimeout(2500); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click());
  }
  console.log('1. 端末B で少し遊ぶ');
  const B = await device();
  await login(B.page, true);
  await B.page.evaluate(async () => { const p = window.__app.S.profile(); p.xp = 30; p.solved = 3; window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  for (let k = 0; k < 20 && serverXp() !== 30; k++) await B.page.waitForTimeout(500);
  check(serverXp() === 30, `ネットの記録：経験値 ${serverXp()}`);
  const bState = await B.page.evaluate(() => JSON.stringify([...Array(localStorage.length).keys()].map(i => [localStorage.key(i), localStorage.getItem(localStorage.key(i))])));
  await B.ctx.close();

  console.log('2. 端末A で大きく進める');
  const A = await device();
  await login(A.page, false);
  await A.page.evaluate(async () => { const p = window.__app.S.profile(); p.xp = 900; p.solved = 120; window.__app.S.save(); const Sy = await import('/js/sync.js'); await Sy.push(); });
  await A.page.waitForFunction(() => true); for (let k = 0; k < 20 && db.users.syncU.data.profile.xp !== 900; k++) await A.page.waitForTimeout(500);
  check(serverXp() === 900, `ネットの記録：経験値 ${serverXp()}`);
  await A.ctx.close();

  console.log('3. 端末B を、電波が悪い状態で開く（端末B の中は古い記録のまま）');
  const B2 = await device({ loadDelay: 5000 });
  await B2.page.addInitScript((st) => { if (!sessionStorage.getItem('restored')) { for (const [k, v] of JSON.parse(st)) localStorage.setItem(k, v); sessionStorage.setItem('restored', '1'); } }, bState);
  await B2.page.goto(base); await B2.page.waitForSelector('.title-screen'); await B2.page.click('.title-screen');
  await B2.page.waitForTimeout(4000);
  // 部屋に入ってから、なにかを保存する（ログインボーナスや買い物など）
  await B2.page.evaluate(() => { document.querySelector('.lb-screen .ok')?.click(); try { window.__app.S.save(); } catch (e) {} });
  await B2.page.waitForTimeout(9000);
  check(serverXp() === 900, `端末A の記録が消えない（ネットの経験値 ${serverXp()}）`);
  const bxp = await B2.page.evaluate(() => window.__app?.S?.profile()?.xp).catch(() => null);
  check(bxp === 900, `端末B も、端末A の記録に追いつく（端末B の経験値 ${bxp}）`);
  await B2.ctx.close();
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
