import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname);
gas.setup();
const call = (fn, args) => gas.post(JSON.stringify({ fn, args }));
const log = (...a) => console.log(...a);
const DELAY = 2500;
const calls = [];
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, permissions: ['microphone'] });
await ctx.route(URL_, async route => {
  const body = route.request().postData();
  calls.push(JSON.parse(body).fn);
  await new Promise(r => setTimeout(r, DELAY)); // 本物と同じくらい遅い
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gas.post(body)) });
});
await ctx.route('**/lyric-book/js/cloud.js*', async route => {
  const r = await route.fetch();
  await route.fulfill({ response: r, body: (await r.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) });
});
await ctx.route('https://itunes.apple.com/**', r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
await p.goto('http://localhost:8765/lyric-book/');
await p.click('[data-m="signup"]');
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.recovery', { timeout: 20000 }); await p.click('[data-s="ok"]');
await p.waitForSelector('.home', { timeout: 20000 });
await p.click('[data-tab="own"]'); await p.click('#fab');
await p.fill('#e-title', '速さの歌'); await p.fill('#e-text', '[サビ]\nはやく開いて');
await p.click('#save'); await p.waitForSelector('#lyr', { timeout: 20000 });
const sid = await p.evaluate(() => location.hash.split('/')[2]);
// 録音して、1回目・2回目の再生
await p.click('#tRec'); await p.click('.rec-big'); await p.waitForTimeout(1200); await p.click('.rec-big');
await p.waitForSelector('[data-rec]', { timeout: 20000 });
await p.waitForTimeout(500);
// ---- 開きなおす：前回のデータですぐ出るか ----
await p.evaluate(() => { location.hash = '#/'; });
let t0 = Date.now();
await p.reload();
await p.waitForSelector('#homeList .item, #homeList .grid', { timeout: 20000 });
log('開きなおしてホームが出るまで', Date.now() - t0, 'ms（受け口は1回', DELAY, 'ms）');
// 別の端末で曲を足す → 裏の読みこみで出てくるか
const tok = call('lb_login', { p_username: 'わたし', p_password: 'pass' }).result.token;
call('lb_save_song', { p_token: tok, p_id: '11111111-2222-3333-4444-555555555555', p_data: { kind: 'own', title: 'iPadで足した歌', text: '[サビ]\nあとから', anno: [] } });
await p.reload();
t0 = Date.now();
await p.waitForSelector('#homeList', { timeout: 20000 });
log('2回目もすぐ出る', Date.now() - t0, 'ms');
await p.waitForFunction(() => /iPadで足した歌/.test(document.querySelector('#homeList')?.textContent || ''), null, { timeout: 15000 });
log('裏の読みこみで、iPadの曲が出た', Date.now() - t0, 'ms');
// 録音：もう端末にあるので、Googleに取りに行かずに再生できるか
await p.evaluate(id => { location.hash = '#/song/' + id; }, sid);
await p.waitForSelector('[data-recplay]');
calls.length = 0;
t0 = Date.now();
await p.click('[data-recplay]');
await p.waitForSelector('.rec.playing', { timeout: 20000 });
log('録音の再生が始まるまで', Date.now() - t0, 'ms', '| Googleに取りに行った回数', calls.filter(c => c === 'lb_get_recording').length);
log(errs.join('\n') || 'no errors');
await b.close();
