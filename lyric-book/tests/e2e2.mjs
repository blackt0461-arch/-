import { createRequire } from 'module';
import fs from 'fs';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname);
gas.setup();
const call = (fn, args) => gas.post(JSON.stringify({ fn, args }));
let offline = false;
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, permissions: ['microphone'] });
await ctx.route(URL_, async route => {
  if (offline) return route.abort('internetdisconnected');
  const out = gas.post(route.request().postData());
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
});
await ctx.route('**/lyric-book/js/cloud.js*', async route => {
  const r = await route.fetch();
  await route.fulfill({ response: r, body: (await r.text()).replace("export const SCRIPT_URL = '';", `export const SCRIPT_URL = '${URL_}';`) });
});
await ctx.route('https://itunes.apple.com/**', r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|itunes|ERR_INTERNET/.test(m.text())) errs.push('console ' + m.text()); });
const log = (...a) => console.log(...a);
await p.goto('http://localhost:8765/lyric-book/');
// はじめての準備の画面
await p.click('#first');
await p.waitForSelector('#fs-code');
log('setup code ok', (await p.inputValue('#fs-code')).includes('function doPost'));
await p.screenshot({ path: SP + '/g0-first.png' });
await p.click('.sheet [data-s="no"]');
await p.click('[data-m="signup"]');
await p.fill('#lf-user', 'テスト'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.recovery');
const recovery = await p.textContent('.recovery');
await p.click('[data-s="ok"]');
await p.waitForSelector('.home');
log('2nd signup', JSON.stringify(call('lb_signup', { p_username: 'other', p_password: 'xxxx' })));
await p.click('[data-tab="own"]'); await p.click('#fab');
await p.waitForSelector('#e-text');
await p.fill('#e-title', 'かぶる歌');
await p.fill('#e-text', '[Aメロ]\n一行目の歌詞\n二行目の歌詞');
await p.click('#save');
await p.waitForSelector('#lyr');
const sid = await p.evaluate(() => location.hash.split('/')[2]);
// 録音して聞く
await p.click('#tRec'); await p.click('.rec-big'); await p.waitForTimeout(1500); await p.click('.rec-big');
await p.waitForSelector('[data-rec]', { timeout: 10000 });
await p.click('[data-recplay]'); await p.waitForTimeout(800);
log('playing', await p.isVisible('.rec.playing'));
// 電波なしで書きこむ
offline = true;
await p.evaluate(() => {
  const sp = [...document.querySelectorAll('[data-l="0"][data-i]')];
  const r = document.createRange(); r.setStart(sp[0].firstChild, 0); r.setEnd(sp[2].firstChild, 1);
  getSelection().removeAllRanges(); getSelection().addRange(r);
});
await p.waitForSelector('#annobar');
await p.click('[data-a="color"][data-k="strong"]');
await p.waitForTimeout(1500);
log('offline banner', await p.isVisible('#offline'), 'queue', await p.evaluate(() => JSON.parse(localStorage.lb_queue || '[]').length));
await p.reload();
await p.waitForSelector('#lyr', { timeout: 10000 });
log('offline reopen cols', await p.$$eval('.ln .col', e => e.map(x => x.textContent)));
// iPad が同じ曲を直す
const ipad = call('lb_login', { p_username: 'テスト', p_password: 'pass' }).result.token;
const cur = call('lb_load', { p_token: ipad }).result.songs[0];
await new Promise(r => setTimeout(r, 1200));
log('ipad save', JSON.stringify(call('lb_save_song', { p_token: ipad, p_id: sid, p_data: { ...cur.data, text: '[Aメロ]\niPadで直した歌詞' }, p_base: cur.updated_at }).ok));
offline = false;
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await p.waitForTimeout(2500);
log('queue after', await p.evaluate(() => JSON.parse(localStorage.lb_queue || '[]').length));
log('songs', call('lb_load', { p_token: ipad }).result.songs.map(s => s.data.title));
// バックアップ
gas.backup();
log('drive files', gas.files().map(f => `${f.parent}/${f.name}${f.trashed ? '(ごみ箱)' : ''}`));
await p.evaluate(() => { location.hash = '#/settings'; });
await p.reload();
await p.waitForSelector('#bk-restore');
log('settings', (await p.textContent('.setS')).match(/最後のバックアップ：[^曲]*/)?.[0]);
await p.screenshot({ path: SP + '/g1-settings.png', fullPage: true });
// 戻す
fs.writeFileSync(SP + '/latest.json', gas.read('LYRIC BOOK 最新.json'));
call('lb_delete_song', { p_token: ipad, p_id: sid });
log('after delete files', gas.files().filter(f => f.parent === '消した録音').length, 'in 消した録音');
await p.reload(); await p.waitForSelector('#bk-restore');
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#bk-restore')]);
await fc.setFiles(SP + '/latest.json');
await p.waitForSelector('.sheet [data-s="ok"]');
await p.click('.sheet [data-s="ok"]');
await p.waitForTimeout(1500);
log('after restore', call('lb_load', { p_token: ipad }).result.songs.map(s => s.data.title));
// パスワードを忘れた
await p.evaluate(() => { localStorage.removeItem('lb_token'); });
await p.reload();
await p.click('[data-m="reset"]');
await p.fill('#lf-user', 'テスト'); await p.fill('#lf-rec', recovery.toLowerCase()); await p.fill('#lf-pass', 'newpass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.home', { timeout: 10000 });
log('reset ok, old ipad token', call('lb_load', { p_token: ipad }).error);
log(errs.join('\n') || 'no errors');
await b.close();
