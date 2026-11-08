// 2.3.4：消す・保存などの動作で、Google の返事を待たずに画面が進むか（受け口は 2.5 秒かかるまね）
import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const DELAY = 2500;
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname, { fetch: () => ({ getResponseCode: () => 404, getContentText: () => '' }) });
gas.setup();
const call = (fn, args) => { const r = gas.post(JSON.stringify({ fn, args })); if (r.error) throw new Error(fn + ' ' + r.error); return r.result; };
const { token } = call('lb_signup', { p_username: 'わたし', p_password: 'pass' });
call('lb_save_artist', { p_token: token, p_id: 'a1', p_data: { name: 'テスト歌手' } });
const base = { kind: 'real', artist_id: 'a1', yomi: '', anno: [], keys: { autoTried: true }, releaseTried: true, lyricsTried: true };
call('lb_save_song', { p_token: token, p_id: 's1', p_data: { ...base, title: '曲いち', text: 'あいうえお' } });
call('lb_save_song', { p_token: token, p_id: 's2', p_data: { ...base, title: '曲に', text: 'かきくけこ' } });
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await ctx.route(URL_, async route => {
  const body = route.request().postData();
  await new Promise(r => setTimeout(r, DELAY));
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
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.home', { timeout: 20000 }); await p.waitForTimeout(DELAY * 2 + 500);
const songs = () => Object.values(JSON.parse(gas.read('データ（さわらないでください）.json')).users)[0].songs;
const ms = async (f, until) => { const t = Date.now(); await f(); await p.waitForFunction(until, null, { timeout: 15000 }); return Date.now() - t; };
// 1) 編集して保存
await p.evaluate(() => { location.hash = '#/edit/s1'; }); await p.waitForSelector('#save');
await p.fill('#e-title', '曲いち（直した）').catch(() => {});
const tSave = await ms(() => p.click('#save'), () => location.hash === '#/song/s1' && !!document.querySelector('#lyr'));
// 2) 曲を消す
await p.click('#smenu'); await p.click('.sheet button:has-text("この曲を消す")');
const tDel = await ms(() => p.click('.sheet [data-s="ok"]'), () => !location.hash.startsWith('#/song/'));
console.log('保存→曲のページ', tSave, 'ms | 消す→前の画面', tDel, 'ms');
await p.waitForTimeout(DELAY * 4);
const ss = songs();
console.log('受け口 | s1 の題名', ss.s1.data.title, '| s1 消した印', !!ss.s1.data.deleted_at, '| 別の端末の版', Object.values(ss).filter(x => /別の端末/.test(x.data.title)).length);
console.log(errs.join('\n') || 'no errors');
await b.close();
