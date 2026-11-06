// 着せ替えごとに、画面の文字が背景にとけて見えなくなっていないかを自動で調べる。
//
// 使い方（study-room フォルダで）：
//   node tools/check/contrast.js              … 全部の着せ替え × 全部の画面
//   node tools/check/contrast.js e5 b         … 着せ替えをしぼる
// 結果：見えにくい文字の一覧を表示し、tools/check/out/ に画面の写真と report.html を書く。
//       「見えない」（コントラスト比 3 未満）が1つでもあれば、終わりの番号が 1（失敗）になる。
//
// しくみ：
//   1. js/skins.js の SKINS を読みこむ（新しい着せ替えを足すと、自動で調べる対象に入る）
//   2. テスト用の保存先（mock.js）で管理者としてログインし、主な画面を順に開く
//   3. 表示されている文字・アイコンの色をおぼえる → 文字だけを消して画面を撮る →
//      文字のうしろに実際に映っている色（グラデーションや3Dの部屋もふくむ）と比べる
//   4. WCAG のコントラスト比を出す。3 未満は「見えない」、小さい文字で 4.5 未満は「見えにくい」
//
// 必要な物：Playwright（require('playwright')）と、それが使う Chromium。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const mock = require('./mock.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const FAIL = 3.0;  // これ未満は「見えない」
const WARN = 4.5;  // 小さい文字でこれ未満は「見えにくい」

// ---- 小さなファイル置き場（ほかのサーバーがいらないように） ----
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

// ---- 調べる画面（開き方）。新しい画面を作ったら、ここに足す ----
const click = (sel) => (p) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('見つからない: ' + s); e.click(); }, sel);
const waitFor = (sel, t = 20000) => (p) => p.waitForSelector(sel, { state: 'attached', timeout: t });
const sleep = (ms) => (p) => p.waitForTimeout(ms);
const SCREENS = [
  { id: 'home', name: '部屋', steps: [sleep(800)] },
  { id: 'half-furn', name: '家具（半分の画面）', steps: [click('.hotbar [data-t=furn]'), waitFor('.half-sheet'), sleep(700)] },
  { id: 'half-social', name: 'みんな（半分の画面）', steps: [click('.hotbar [data-t=social]'), waitFor('.half-sheet'), sleep(700)] },
  { id: 'room-pop', name: '部屋えらび', steps: [click('.room-name'), waitFor('.room-pop'), sleep(500)] },
  { id: 'rank-road', name: 'Lvの道のり', steps: [click('.rankchip'), waitFor('.rr-sheet'), sleep(700)] },
  { id: 'buy-genre', name: '家具を買う（ジャンル）', steps: [click('.hotbar [data-t=buy]'), waitFor('.genre-row'), sleep(700)] },
  { id: 'buy-cand', name: '家具を買う（候補）', steps: [click('.hotbar [data-t=buy]'), waitFor('.genre-row'), click('.genre-row'), waitFor('.cand'), click('.cand'), sleep(1500)] },
  { id: 'gacha', name: 'レアガチャ', steps: [click('.hotbar [data-t=gacha]'), waitFor('.banner'), sleep(800)] },
  { id: 'gacha-result', name: 'ガチャの結果（10連）', steps: [click('.hotbar [data-t=gacha]'), waitFor('.pull10'), click('.pull10'), waitFor('.pfx-skip'), click('.pfx-skip'), waitFor('.pfx-btns:not(.hide)', 60000), (p) => p.waitForFunction(() => { const e = document.querySelector('.pfx-btns'); return e && getComputedStyle(e).opacity === '1' && document.querySelectorAll('.pc.flip').length === document.querySelectorAll('.pc').length; }, null, { timeout: 60000 }), sleep(800)] },
  { id: 'login-bonus', name: 'ログインボーナス', steps: [(p) => p.evaluate(() => { window.__app.S.getState().loginBonus = { count: 3, last: '2000-01-01' }; window.__app.showLoginBonus(); }), waitFor('.lb-screen.show'), sleep(1200)] },
  { id: 'menu', name: 'メニュー', steps: [click('.hotbar [data-t=menu]'), waitFor('.menu-list'), sleep(500)] },
  { id: 'records', name: '記録', steps: [click('.hotbar [data-t=menu]'), waitFor('[data-m=records]'), click('[data-m=records]'), waitFor('.rec-subj'), sleep(500)] },
  { id: 'skins', name: '着せ替え', steps: [click('.hotbar [data-t=menu]'), waitFor('[data-m=skins]'), click('[data-m=skins]'), waitFor('.skin-grid'), sleep(500)] },
  { id: 'settings', name: '設定', steps: [click('.hotbar [data-t=menu]'), waitFor('[data-m=settings]'), click('[data-m=settings]'), sleep(800)] },
  { id: 'news', name: 'お知らせ', steps: [click('.hotbar [data-t=menu]'), waitFor('[data-m=news]'), click('[data-m=news]'), sleep(800)] },
  { id: 'zukan', name: '図鑑', steps: [click('.hotbar [data-t=zukan]'), waitFor('.zk-genre'), sleep(600)] },
  { id: 'bag', name: '持ち物（アイテム）', steps: [click('.hotbar [data-t=furn]'), waitFor('.half-sheet'), click('.half-sheet .hc[data-i="4"]'), waitFor('.bagtabs'), click('.bagtabs [data-t=items]'), sleep(600)] },
  { id: 'edit', name: '模様がえ', steps: [click('.hotbar [data-t=furn]'), waitFor('.half-sheet'), click('.half-sheet .hc[data-i="1"]'), waitFor('.editbar'), sleep(600)] },
  { id: 'subjects', name: '教科えらび', steps: [click('.hotbar [data-t=play]'), waitFor('.subj'), sleep(600)] },
  { id: 'quiz', name: '問題（物理）', steps: [click('.hotbar [data-t=play]'), waitFor('.subj'), click('.subj[data-s=physics]'), waitFor('.sym'), sleep(600)] },
  { id: 'choice', name: '問題（4択）', steps: [click('.hotbar [data-t=play]'), waitFor('.subj'), click('.subj[data-s=math]'), waitFor('.ch4 .fcard'), sleep(500)] },
  { id: 'choice-res', name: '問題の結果', steps: [click('.hotbar [data-t=play]'), waitFor('.subj'), click('.subj[data-s=math]'), waitFor('.ch4 .fcard'), click('.ch4 .fcard'), waitFor('.res'), sleep(800)] },
  { id: 'home-full', name: '部屋（ゲージ満タン）', steps: [(p) => p.evaluate(() => { const A = window.__app, hs = A.HS(); hs.gauge = A.S.gaugeMax(hs); hs.fullNotified = true; A.showHome(); }), waitFor('.buy-tip'), sleep(600), (p) => p.evaluate(() => document.getElementById('toast')?.classList.remove('show')), sleep(500)] },
  { id: 'giftbox', name: 'プレゼントBOX', steps: [(p) => p.evaluate(() => { const S = window.__app.S; S.addGift({ kind: 'ticket', amount: 3, title: '新規登録記念', from: 'operator' }); S.addGift({ kind: 'ticket4', amount: 1, title: 'Lv5 のごほうび', from: 'rank' }); window.__app.showGiftBox(); }), waitFor('.gb-row'), sleep(600)] },
  { id: 'gacha-item', name: '出る家具を3Dで見る', steps: [click('.hotbar [data-t=gacha]'), waitFor('.gc-it'), click('.gc-it'), waitFor('.gi-view'), sleep(1500)] },
  { id: 'admin', name: '管理者', steps: [click('.hotbar [data-t=menu]'), waitFor('[data-m=admin]'), click('[data-m=admin]'), waitFor('.acard'), sleep(600)] },
];

// ---- 画面の中で：見えている文字とアイコンを集める ----
function collectInPage() {
  document.querySelectorAll('[data-cc]').forEach(e => e.removeAttribute('data-cc'));
  const out = [];
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    return true;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const inView = (r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const clip = (r) => ({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) });
  // 文字
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || el.closest('script,style,svg,canvas,[aria-hidden="true"]') && !el.closest('.ic')) continue;
    if (!visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (!inView(r)) continue;
    // 上に別の物がかぶっていて見えない文字は数えない
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, cx)), Math.min(innerHeight - 1, Math.max(0, cy)));
    if (top && top !== el && !el.contains(top) && !top.contains(el) && top.id !== 'room') continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const id = out.length;
    el.setAttribute('data-cc', id);
    out.push({ id, kind: 'text', text: t.slice(0, 24), color: cs.color, opacity: opacityOf(el), size: parseFloat(cs.fontSize), bold: +cs.fontWeight >= 700, rect: clip(r), path: describe(el) });
  }
  // アイコン（線の色＝文字の色）
  for (const ic of document.querySelectorAll('.ic')) {
    if (!visible(ic)) continue;
    const r = ic.getBoundingClientRect();
    if (!inView(r) || r.width < 10) continue;
    const top = document.elementFromPoint(Math.min(innerWidth - 1, (r.left + r.right) / 2), Math.min(innerHeight - 1, (r.top + r.bottom) / 2));
    if (top && !ic.contains(top) && top !== ic && !top.contains(ic) && top.id !== 'room') continue;
    const id = out.length;
    ic.setAttribute('data-cc', id);
    out.push({ id, kind: 'icon', text: '(アイコン)', color: getComputedStyle(ic).color, opacity: opacityOf(ic), size: 18, bold: true, rect: clip(r), path: describe(ic) });
  }
  return out;
  function describe(el) {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''));
    return parts.join(' > ');
  }
}

// ---- 画面の中で：写真から、それぞれの場所のうしろの色をとる ----
async function sampleInPage({ b64, items }) {
  const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const sx = img.width / innerWidth;
  return items.map(it => {
    const x = Math.floor(it.rect.x * sx), y = Math.floor(it.rect.y * sx), w = Math.max(1, Math.floor(it.rect.w * sx)), h = Math.max(1, Math.floor(it.rect.h * sx));
    const d = g.getImageData(x, y, w, h).data;
    const rs = [], gs = [], bs = [];
    const step = Math.max(1, Math.floor((w * h) / 400));
    for (let i = 0; i < d.length / 4; i += step) { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); }
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    return [med(rs), med(gs), med(bs)];
  });
}

// ---- 色の計算（WCAG） ----
function parseColor(s) { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; }
function lum([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

(async () => {
  const want = process.argv.slice(2);
  const { SKINS } = await import(pathToFileURL(path.join(ROOT, 'js', 'skins.js')).href);
  const skins = SKINS.filter(s => !want.length || want.includes(s.id));
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mock(ctx);
  await ctx.route('https://fonts.googleapis.com/**', r => r.continue()).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.quality', 'low'); window.__ccFreeze = true; });
  await page.goto(base);
  await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.click('.swap'); await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.lb-screen.show', { timeout: 60000 }); await page.click('.lb-screen .ok', { force: true });
  await page.waitForSelector('.style-sheet .stylecard', { timeout: 15000 }).catch(() => {});
  if (await page.locator('.style-sheet .stylecard').count()) { await page.evaluate(() => document.querySelector('.stylecard').click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.style-sheet .ok').click()); }
  await page.waitForSelector('.hotbar');
  await page.evaluate(() => document.fonts.ready);

  const results = [];
  for (const skin of skins) {
    for (const sc of SCREENS.filter(x => !process.env.CC_ONLY || x.id === process.env.CC_ONLY)) {
      // まっさらな部屋の画面から始める
      await page.evaluate((id) => {
        document.querySelectorAll('.pfx, .lb-screen, .update-ov, .sheet, .room-pop').forEach(e => e.remove());
        window.__app.S.profile().skin = id; window.__app.showHome();
      }, skin.id);
      await page.waitForTimeout(300);
      try { for (const st of sc.steps) await st(page); } catch (e) { results.push({ skin: skin.id, screen: sc, error: e.message.split('\n')[0] }); continue; }
      // 動きを止めて、文字を集める
      const pause = await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}' });
      await page.waitForTimeout(150);
      const items = await page.evaluate(collectInPage);
      const shotFile = path.join(OUT, `${skin.id}-${sc.id}.png`);
      await page.screenshot({ path: shotFile });
      // 文字とアイコンだけを消して撮る → うしろの色
      const hide = await page.addStyleTag({ content: '[data-cc]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important} [data-cc] *{color:transparent!important;-webkit-text-fill-color:transparent!important} .ic[data-cc] svg{visibility:hidden!important}' });
      await page.waitForTimeout(80);
      const b64 = (await page.screenshot()).toString('base64');
      await hide.evaluate(e => e.remove());
      await pause.evaluate(e => e.remove()); // つぎの画面の動きを止めたままにしない
      const bgs = await page.evaluate(sampleInPage, { b64, items });
      const bad = [];
      items.forEach((it, i) => {
        const c = parseColor(it.color), a = c.a * it.opacity, bg = bgs[i];
        const fg = [c.r * a + bg[0] * (1 - a), c.g * a + bg[1] * (1 - a), c.b * a + bg[2] * (1 - a)];
        const cr = ratio(fg, bg);
        const big = it.size >= 18 || (it.bold && it.size >= 14);
        const level = cr < FAIL ? 'fail' : (!big && cr < WARN) ? 'warn' : null;
        if (level) bad.push({ ...it, ratio: +cr.toFixed(2), level, bg: `rgb(${bg.map(Math.round).join(',')})` });
      });
      results.push({ skin: skin.id, screen: sc, shot: path.basename(shotFile), count: items.length, bad });
      process.stdout.write(`${skin.id.padEnd(3)} ${sc.name.padEnd(16, '　')} 文字 ${String(items.length).padStart(3)}  見えない ${bad.filter(x => x.level === 'fail').length}  見えにくい ${bad.filter(x => x.level === 'warn').length}\n`);
    }
  }
  await browser.close(); srv.close();

  // ---- 結果 ----
  const fails = results.flatMap(r => (r.bad || []).filter(b => b.level === 'fail').map(b => ({ ...b, skin: r.skin, screen: r.screen.name })));
  const warns = results.flatMap(r => (r.bad || []).filter(b => b.level === 'warn').map(b => ({ ...b, skin: r.skin, screen: r.screen.name })));
  const broken = results.filter(r => r.error);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const row = (b) => `<tr class="${b.level}"><td>${b.skin}</td><td>${esc(b.screen)}</td><td>${esc(b.text)}</td><td>${b.ratio}</td><td><span class="sw" style="background:${b.bg}"><i style="color:${b.color}">あ</i></span></td><td><code>${esc(b.path)}</code></td></tr>`;
  fs.writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><meta charset="utf-8"><title>文字の見えにくさ</title>
<style>body{font-family:sans-serif;background:#111;color:#eee;padding:16px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #333;padding:6px;text-align:left}tr.fail td:first-child{border-left:4px solid #e0453a}tr.warn td:first-child{border-left:4px solid #e0b040}.sw{display:inline-block;width:40px;height:24px;border-radius:4px;text-align:center;font-weight:700}code{color:#aaa}</style>
<h1>文字の見えにくさ</h1><p>見えない（3未満）：${fails.length}　見えにくい（小さい文字で4.5未満）：${warns.length}　開けなかった画面：${broken.length}</p>
${broken.length ? `<h2>開けなかった画面</h2><ul>${broken.map(r => `<li>${r.skin} ${esc(r.screen.name)}：${esc(r.error)}</li>`).join('')}</ul>` : ''}
<table><tr><th>着せ替え</th><th>画面</th><th>文字</th><th>比</th><th>色</th><th>場所</th></tr>${[...fails, ...warns].map(row).join('')}</table>`);
  console.log(`\n見えない：${fails.length}　見えにくい：${warns.length}　開けなかった画面：${broken.length}`);
  for (const b of fails.slice(0, 60)) console.log(`  ✗ [${b.skin}] ${b.screen}「${b.text}」 比 ${b.ratio}  ${b.path}`);
  for (const r of broken) console.log(`  ! [${r.skin}] ${r.screen.name} を開けなかった：${r.error}`);
  if (errors.length) console.log('画面のエラー：\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
  console.log(`くわしくは ${path.relative(process.cwd(), path.join(OUT, 'report.html'))}`);
  process.exit(fails.length || broken.length ? 1 : 0);
})();
