// ゲーミングチェアの部品が消える・ばらける不具合の再現（3D担当 2026-11-08）。node tools/check/chairbug.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const mock = require('./mock.js');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const serve = () => new Promise(res => { const srv = http.createServer((req, rsp) => { let f = decodeURIComponent(req.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const file = path.join(ROOT, f); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(rsp); }).listen(0, () => res(srv)); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 500, height: 700 } }); await mock(ctx);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.addInitScript((q) => { localStorage.setItem('studyroom.download', 'later'); localStorage.setItem('studyroom.notour', '1'); localStorage.setItem('studyroom.uinext', '0'); localStorage.setItem('studyroom.quality', q); }, process.env.Q || 'low');
  await page.goto(base); await page.waitForSelector('.title-screen'); await page.click('.title-screen');
  await page.waitForSelector('button[type=submit]');
  if (!/登録/.test(await page.locator('button[type=submit]').textContent())) await page.click('.swap');
  await page.fill('input[name=name]', 'admin'); await page.fill('input[name=pw]', 'test1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.mode-sheet [data-m=study]', { timeout: 60000 }); await page.click('.mode-sheet [data-m=study]');
  await page.waitForTimeout(2000); await page.evaluate(() => document.querySelector('.lb-screen .ok')?.click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('.style-sheet .stylecard')?.click(); document.querySelector('.style-sheet .ok')?.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(async () => { const a = window.__app; a.S.profile().xp = 99999; const { itemById } = await import('/js/items.js'); a.curRoom().placed = []; await a.switchRoom(a.HS().rooms.indexOf(a.curRoom())); await a.putIntoRoom(itemById('hobby-gamechair-black')); for (const o of a.room3d.items.children) if (o.userData.appear !== undefined) { o.userData.appear = 1; o.scale.setScalar(1); o.position.y = o.userData.baseY; } a.S.save(); });
  await page.waitForTimeout(1500);
  // カメラをイスに向ける
  const aim = () => page.evaluate(() => { const r = window.__app.room3d; const w = Object.values(r.objByUid).find(o => o.userData.item.id === 'hobby-gamechair-black'); if (!w) return 'none'; r.lookAt(w.position.clone().setY(0.7)); if (r.targetLook) { r.look = { ...r.targetLook }; } let n = 0; w.traverse(o => { if (o.isMesh) n++; }); return n; });
  const shot = async (name) => { const n = await aim(); await page.evaluate(() => document.body.classList.add('photo-mode')); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, `chairbug-${name}.png`), timeout: 120000 }); await page.evaluate(() => document.body.classList.remove('photo-mode')); console.log(name, 'meshes', n); };
  await page.evaluate(async () => { const THREE = await import('three'); const r = window.__app.room3d; window.__live = []; const orig = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function () { let live = false; r.scene.traverse(o => { if (o.geometry === this) live = true; }); if (live) window.__live.push((this.type || '') + ':' + this.attributes.position?.count); return orig.call(this); }; });
  let bad = 0;
  const live = async (tag) => { const r = await page.evaluate(() => { const n = window.__live.length; const s = window.__live.slice(0, 5); window.__live = []; return [n, s.join(',')]; }); bad += r[0]; console.log((r[0] ? '  × ' : '  ○ ') + tag + '：部屋で使っている形を捨てた数 ' + r[0] + (r[0] ? '（' + r[1] + '）' : '')); };
  await shot('0-placed');
  // サムネイルを作る（共有の形を捨てる？）
  await page.evaluate(async () => { const T = await import('/js/thumbs.js'); const { itemById } = await import('/js/items.js'); const it = itemById('hobby-gamechair-black'); const r = T.renderThumb ? T.renderThumb({ ...it, id: it.id + '-x' }) : null; await r; });
  await page.waitForTimeout(1500);
  await live('thumb'); await page.evaluate(async () => { const T = await import('/js/thumbs.js'); const { itemById } = await import('/js/items.js'); const host = document.createElement('div'); host.style.cssText='width:200px;height:200px'; document.body.append(host); const v = await T.spinViewer(host, itemById('hobby-gamechair-black')); await new Promise(r => setTimeout(r, 800)); (v?.close || v?.dispose || v?.stop)?.call(v); host.remove(); }); await page.waitForTimeout(1500); await live('spin');
  await shot('1-afterthumb');
  // 部屋の行き来
  await page.evaluate(async () => { const a = window.__app; const i = a.HS().rooms.indexOf(a.curRoom()); const hs = a.HS(); if (hs.rooms.length < 2) { const { STARTER } = await import('/js/items.js'); hs.rooms.push({ id: 'kitchen', style: 'natural', surf: { ...STARTER }, placed: [] }); } const j = i === 0 ? 1 : 0; await a.switchRoom(j); await new Promise(r => setTimeout(r, 1500)); await a.switchRoom(i); });
  await page.waitForTimeout(2500);
  await live('switch');
  // 部屋を出た時は、ほかで使っていない形はちゃんと返しているか（メモリ）
  const mem = await page.evaluate(async () => { const a = window.__app, r = a.room3d; const i = a.HS().rooms.indexOf(a.curRoom()); const before = r.renderer.info.memory.geometries; await a.switchRoom(i === 0 ? 1 : 0); await new Promise(z => setTimeout(z, 2000)); r.renderer.render(r.scene, r.camera); const after = r.renderer.info.memory.geometries; await a.switchRoom(i); await new Promise(z => setTimeout(z, 2000)); return [before, after]; });
  console.log('  形の数（GPU）リビング ' + mem[0] + ' → ほかの部屋 ' + mem[1]);
  // すばやく部屋を行き来しても、形の数が増えつづけない（はだか電球の返し忘れ。2026-11-08）
  const grow = await page.evaluate(async () => { const a = window.__app, r = a.room3d; const i = a.HS().rooms.indexOf(a.curRoom()); const out = []; for (let k = 0; k < 8; k++) { await a.switchRoom(i === 0 ? 1 : 0); await new Promise(z => setTimeout(z, 300)); await a.switchRoom(i); await new Promise(z => setTimeout(z, 400)); r.renderer.render(r.scene, r.camera); out.push(r.renderer.info.memory.geometries); } return out; });
  const inc = grow.at(-1) - grow[1]; if (inc > 2) bad++;
  console.log((inc > 2 ? '  × ' : '  ○ ') + 'すばやく8往復した時の形の数 ' + grow.join(' '));
  // 同じイスを2脚置いて、1脚しまう（もう1脚の形を捨てていないか）
  await page.evaluate(async () => { const a = window.__app; const { itemById } = await import('/js/items.js'); await a.putIntoRoom(itemById('hobby-gamechair-black')); const p = a.curRoom().placed.at(-1); a.room3d.removeObject(p.uid); a.curRoom().placed.pop(); a.S.save(); });
  await page.waitForTimeout(1000); await live('remove-one');
  await shot('2-afterswitch');
  // ログインの直後（本人「ログイン直後によく起こる」）：イスを置いたまま読みこみなおして、タイトル→部屋
  {
    const ctx2 = ctx;
    await ctx2.route('**/three@0.169.0/build/three.module.js', async route => { const r = await route.fetch(); const body = (await r.text()) + `\n;{const __od = BufferGeometry.prototype.dispose; BufferGeometry.prototype.dispose = function () { try { const r = window.__app?.room3d; let live = false; r?.scene.traverse(o => { if (o.geometry === this) live = true; }); if (live) (window.__live = window.__live || []).push(String(new Error().stack).split('\\n').slice(2, 4).join(' | ')); } catch (e) {} return __od.call(this); };}`; route.fulfill({ status: 200, contentType: 'text/javascript', body }); });
    const p2 = page; await p2.evaluate(() => window.__app.S.save()); await p2.waitForTimeout(1000);
    await p2.reload(); await p2.waitForSelector('.title-screen'); await p2.click('.title-screen');
    await p2.waitForTimeout(1500);
    if (await p2.$('button[type=submit]')) { if (!/ログイン/.test(await p2.locator('button[type=submit]').textContent())) await p2.click('.swap').catch(() => {}); await p2.fill('input[name=name]', 'admin'); await p2.fill('input[name=pw]', 'test1234'); await p2.click('button[type=submit]'); }
    await p2.waitForTimeout(4000); await p2.evaluate(() => document.querySelector('.mode-sheet [data-m=study]')?.click());
    await p2.waitForTimeout(8000);
    // 家具の一覧を開く（サムネイル）
    await p2.evaluate(() => [...document.querySelectorAll('button')].find(b => /家具/.test(b.textContent))?.click()); await p2.waitForTimeout(5000);
    const r = await p2.evaluate(() => { const a = window.__app; const has = a?.curRoom()?.placed.some(p => p.item === 'hobby-gamechair-black'); return { has, live: window.__live || [] }; });
    console.log('  ログイン後：イスあり ' + r.has);
    bad += r.live.length; console.log((r.live.length ? '  × ' : '  ○ ') + 'login：部屋で使っている形を捨てた数 ' + r.live.length + (r.live.length ? '\n     ' + [...new Set(r.live)].slice(0, 4).join('\n     ') : ''));
  }
  console.log(errors.slice(0, 10).join('\n'));
  console.log(bad ? 'NG' : 'OK');
  process.exitCode = bad ? 1 : 0;
  await browser.close(); srv.close();
})();
