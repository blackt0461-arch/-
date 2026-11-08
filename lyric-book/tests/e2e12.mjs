// 2.3.3：歌詞の文字を選ぶとき、iPhone の青い選ぶ印を出さずに、タップ・横になぞるで選べるか
import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const SP = process.argv[2] || '.';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname, { fetch: () => ({ getResponseCode: () => 404, getContentText: () => '' }) });
gas.setup();
const call = (fn, args) => { const r = gas.post(JSON.stringify({ fn, args })); if (r.error) throw new Error(fn + ' ' + r.error); return r.result; };
const { token } = call('lb_signup', { p_username: 'わたし', p_password: 'pass' });
call('lb_save_artist', { p_token: token, p_id: 'a1', p_data: { name: 'テスト歌手' } });
call('lb_save_song', { p_token: token, p_id: 's1', p_data: { kind: 'real', artist_id: 'a1', title: 'テスト曲', yomi: '', anno: [], text: '触れたくて震えてく声が\n成りたくて鳴らせないが息絶えても\n確かめるまで終わらせないで', keys: { autoTried: true }, releaseTried: true, lyricsTried: true } });
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await ctx.route(URL_, async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gas.post(route.request().postData())) }));
await ctx.route('**/lyric-book/js/cloud.js*', async route => {
  const r = await route.fetch();
  await route.fulfill({ response: r, body: (await r.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) });
});
await ctx.route('https://itunes.apple.com/**', r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
await p.goto('http://localhost:8765/lyric-book/');
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.home'); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/song/s1'; }); await p.waitForSelector('#lyr .ln');
const box = async (l, i) => { const el = await p.$(`#lyr [data-l="${l}"][data-i="${i}"]`); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150); return el.boundingBox(); };
const mid = bb => [bb.x + bb.width / 2, bb.y + bb.height / 2];
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const css = await p.$eval('#lyr', el => { const c = getComputedStyle(el); return [c.webkitUserSelect || c.userSelect, c.webkitTouchCallout, c.touchAction].join(' '); });
console.log('lyr style', css);
// 1) タップで1文字
let [x, y] = mid(await box(1, 4));
await p.touchscreen.tap(x, y); await p.waitForTimeout(300);
console.log('tap | bar', !!(await p.$('#annobar')), '| pick', await p.$$eval('#lyr .pick', e => e.map(x => x.textContent).join('')), '| native', JSON.stringify(await p.evaluate(() => getSelection().toString())));
await p.click('#annobar [data-a="close"]'); await p.waitForTimeout(200);
// 2) 横になぞる（同じ行）
const [x0, y0] = mid(await box(0, 0)); const [x1] = mid(await box(0, 4));
await touch('touchStart', x0, y0);
for (let k = 1; k <= 8; k++) { await touch('touchMove', x0 + (x1 - x0) * k / 8, y0); await p.waitForTimeout(20); }
await touch('touchEnd'); await p.waitForTimeout(300);
console.log('drag | bar', !!(await p.$('#annobar')), '| pick', await p.$$eval('#lyr .pick', e => e.map(x => x.textContent).join('')));
await p.screenshot({ path: SP + '/v233-pick.png' });
await p.click('#annobar [data-a="color"]'); await p.waitForTimeout(1200);
const sv = JSON.parse(gas.read('データ（さわらないでください）.json'));
console.log('saved color', JSON.stringify(Object.values(sv.users)[0].songs.s1.data.anno[0].c));
// 3) 縦に動かしたときは選ばない（スクロール）
const [xa, ya] = mid(await box(1, 2));
await touch('touchStart', xa, ya);
for (let k = 1; k <= 8; k++) { await touch('touchMove', xa, ya - k * 15); await p.waitForTimeout(20); }
await touch('touchEnd'); await p.waitForTimeout(300);
console.log('vertical | bar', !!(await p.$('#annobar')));
console.log(errs.join('\n') || 'no errors');
await b.close();
