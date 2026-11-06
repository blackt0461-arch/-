// ストアに出すための機能の確かめ（1.12.0）：復元コード・パスワード再設定・通報・ブロック・問題の報告・確率表示・エラー記録・アカウント削除・集中モード。使い方：node tools/check/store.js
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
  const db = { users: {} };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(ctx, db);
  const page = await ctx.newPage(), fails = [], errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const check = (ok, msg) => { console.log((ok ? '  ○ ' : '  × ') + msg); if (!ok) fails.push(msg); };
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', 'low'); });
  async function enter(name, signup = true) {
    await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
    await page.waitForSelector('button[type=submit]');
    const isSignup = /登録/.test(await page.locator('button[type=submit]').textContent());
    if (signup !== isSignup) await page.click('.swap');
    await page.fill('input[name=name]', name); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
    if (signup) { await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]'); }
    await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
    await page.waitForTimeout(800);
  }
  const menu = async (m) => { await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-t=menu]')?.click()); await page.waitForTimeout(400); await page.click(`.menu-list [data-m=${m}]`); await page.waitForTimeout(500); };

  console.log('1. 登録画面に規約・ポリシー、規約のページが開く');
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen'); await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  check(await page.locator('.login .agree a[href="legal/terms.html"]').count() === 1, '登録画面に「利用規約」「プライバシーポリシー」');
  for (const f of ['terms', 'privacy', 'delete']) { const r = await page.request.get(base + `legal/${f}.html`); check(r.ok() && /ROOMIN/.test(await r.text()), `legal/${f}.html が開ける`); }

  console.log('2. 復元コードを作る → パスワードを忘れた → 新しいパスワード');
  await enter('alice');
  await menu('settings');
  await page.waitForFunction(() => /まだ作っていない/.test(document.querySelector('.rc-st')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/まだ作っていない/.test(await page.locator('.rc-st').textContent()), '設定に「復元コード：まだ作っていない」');
  await page.click('.recov'); await page.click('.rc-make'); await page.waitForSelector('.rc-code');
  const code = (await page.locator('.rc-code').textContent()).trim();
  check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `復元コードが出る（${code}）`);
  await page.screenshot({ path: path.join(OUT, 'store-recovery.png') });
  await page.evaluate(async () => { const A = await import('/js/auth.js'); A.forget(); });
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen'); await page.waitForSelector('button[type=submit]');
  if (/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.click('.login .forgot'); await page.waitForSelector('.pr-form');
  await page.fill('.pr-form [name=u]', 'alice'); await page.fill('.pr-form [name=c]', 'zzzz-zzzz-zzzz'); await page.fill('.pr-form [name=p]', 'newpass1'); await page.click('.pr-form button');
  await page.waitForTimeout(500);
  check(/ちがいます/.test(await page.locator('.pr-form .err').textContent()), 'まちがったコードは断られる');
  await page.fill('.pr-form [name=c]', code.toLowerCase()); await page.click('.pr-form button'); await page.waitForTimeout(600);
  check(db.users.alice.pw === 'newpass1' && await page.locator('.pr-form').count() === 0, '正しいコードで新しいパスワードになる');

  console.log('3. ほかの人を通報・ブロック、ランキングから消える');
  db.users.bob = { data: { version: 1, profile: { xp: 50, solved: 5, week: { key: 'x', points: 10 } }, subjects: {}, house: {} } };
  await enter('alice', false);
  await page.evaluate(() => { window.__app.S.addPoints(5); window.__app.S.save(); });
  await page.evaluate(async () => { const Sy = await import('/js/sync.js'); await Sy.push(); });
  db.users.bob.data.profile.week = { key: (await page.evaluate(() => window.__app.S.profile().week.key)), points: 10 };
  await page.evaluate(() => document.querySelector('[data-t=social]')?.click()); await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /ランキング/.test(b.textContent))?.click());
  await page.waitForSelector('.rk-row[data-u=bob]', { timeout: 8000 }).catch(() => {});
  check(await page.locator('.rk-row[data-u=bob]').count() === 1, 'ブロック前はランキングに bob が出る');
  await page.click('.rk-row[data-u=bob]'); await page.waitForSelector('.pf-safety');
  await page.click('.pf-report'); await page.waitForSelector('.report-sheet'); await page.click('.report-sheet .rp-send'); await page.waitForTimeout(500);
  check((db.feedback || []).some(f => f.kind === 'report' && /bob/.test(f.body)), '通報が運営に届く');
  await page.click('.pf-block'); await page.click('.sheet .go'); await page.waitForTimeout(600);
  check((db.blocks?.alice || []).includes('bob'), 'ブロックできる');
  await page.click('.screen .back'); await page.waitForTimeout(800);
  check(await page.locator('.rk-row[data-u=bob]').count() === 0, 'ブロックした人はランキングに出ない');

  console.log('4. 問題のまちがいを報告・確率の表示');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.solve-ring')?.click());
  await page.waitForFunction(() => { const b = document.querySelector('.subj[data-s=math]'); return b && !b.disabled; }, null, { timeout: 30000 });
  await page.click('.subj[data-s=math]'); await page.waitForTimeout(400);
  await page.evaluate(() => (document.querySelector('.sc-list [data-all]') || document.querySelector('.sc-list [data-gall]'))?.click()); await page.waitForSelector('.fcard');
  await page.click('.fcard >> nth=0'); await page.waitForSelector('.pr-report', { timeout: 8000 });
  await page.click('.pr-report'); await page.click('.report-sheet .rp-send'); await page.waitForTimeout(500);
  check((db.feedback || []).some(f => f.kind === 'problem' && /math-/.test(f.body)), '問題のまちがい報告が、問題の番号つきで届く');
  await page.evaluate(() => window.__app.showHome()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-t=gacha]')?.click()); await page.waitForSelector('.rates-btn');
  await page.click('.rates-btn'); await page.waitForSelector('.odds-r');
  const pct = await page.evaluate(() => [...document.querySelectorAll('.odds-r b')].reduce((n, b) => n + parseFloat(b.textContent), 0));
  check(Math.abs(pct - 100) < 0.6, `家具ごとの確率が出て、合計がほぼ100%（${pct.toFixed(2)}%・${await page.locator('.odds-r').count()}種）`);
  await page.screenshot({ path: path.join(OUT, 'store-odds.png') });

  console.log('5. エラーの自動記録');
  await page.evaluate(() => { setTimeout(() => { throw new Error('テスト用のエラー'); }, 0); });
  await page.waitForTimeout(800);
  check((db.errors || []).some(e => e.p_msg.includes('テスト用のエラー') && e.p_version === JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'))).version), 'エラーがサーバーに記録される（版つき）');
  errors.splice(errors.findIndex(e => /テスト用のエラー/.test(e)), 1);

  console.log('6. 模様がえ中は、下のメニューや部屋の名前をかくす');
  await page.evaluate(() => { window.__app.showHome(); window.__app.showEdit(); }); await page.waitForSelector('.editbar');
  const vis = await page.evaluate(() => ['.tabbar', '.home > header.hud', '.side-tools'].map(q => { const e = document.querySelector(q); return e ? getComputedStyle(e).display : 'none'; }));
  check(vis.every(v => v === 'none'), `かくれる（${vis.join(',')}）`);
  await page.screenshot({ path: path.join(OUT, 'store-edit-focus.png') });
  await page.click('.editbar .done'); await page.waitForTimeout(500);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display !== 'none'), '「完了」で元にもどる');

  console.log('7. アカウントを消す');
  await menu('settings');
  await page.click('.del-me'); await page.fill('.del-in', 'wrongpw'); await page.click('.del-sheet .go'); await page.waitForTimeout(400);
  check(/ちがいます/.test(await page.locator('.del-sheet .err').textContent()), 'パスワードがちがうと消えない');
  await page.fill('.del-in', 'test1234'); await page.click('.del-sheet .go'); await page.waitForTimeout(800);
  check(!db.users.alice && await page.locator('.login').count() === 1, '消すと、ログイン画面にもどる（サーバーからも消える）');
  check(!errors.length, `画面のエラーなし（${errors.join(' / ').slice(0, 160)}）`);
  await browser.close(); srv.close();
  console.log(fails.length ? `\nだめな所：${fails.length} 件` : '\nぜんぶ OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
