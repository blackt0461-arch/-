import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname);
gas.setup();
const call = (fn, args) => gas.post(JSON.stringify({ fn, args }));
const log = (...a) => console.log(...a);
let offline = false;
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
async function newPage() {
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, permissions: ['microphone'] });
  await ctx.route(URL_, async route => {
    if (offline) return route.abort('internetdisconnected');
    const out = gas.post(route.request().postData());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await ctx.route('**/lyric-book/js/cloud.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET/.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto('http://localhost:8765/lyric-book/');
  return p;
}
const shot = (p, n, full = false) => p.screenshot({ path: `${SP}/v2-${n}.png`, fullPage: full });
const p = await newPage();
await p.click('[data-m="signup"]');
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.recovery'); await p.click('[data-s="ok"]');
await p.waitForSelector('.home');
// 歌手を追加 → ジャケット
await p.click('#addArtist'); await p.fill('#na-name', 'あいみょん'); await p.click('[data-s="ok"]');
await p.waitForSelector('.artistS');
await p.waitForFunction(() => document.querySelector('.hero .ph.has-img'), null, { timeout: 20000 }).catch(() => log('no jacket'));
// 写真の管理 → ジャケットから2枚足す
await p.click('#photo');
await p.click('[data-s="jacket"]');
await p.waitForSelector('.jk', { timeout: 20000 });
log('jacket candidates', await p.$$eval('.jk', e => e.length), (await p.$$eval('.jk i', e => e.slice(0, 4).map(x => x.textContent))).join(' / '));
const jks = await p.$$('.jk:not(.on)');
await jks[0].click(); await jks[1].click();
await p.click('[data-j="ok"]');
await p.waitForTimeout(300);
await shot(p, '1-photos');
await p.click('.sheet [data-s="no"]');
await p.waitForTimeout(500);
log('slides', await p.$$eval('.slide', e => e.length));
await shot(p, '2-artist');
// 曲を入れる
await p.click('.fab');
await p.waitForSelector('#e-title');
await p.fill('#e-title', 'マリーゴールド');
await p.fill('#e-text', '[イントロ 2]\n[Aメロ]\n一行目の歌詞です\n二行目の歌詞です\n[間奏 1]\n[サビ]\nサビの一行目\nサビの二行目');
await shot(p, '3-edit', true);
await p.click('#save');
await p.waitForSelector('#lyr');
const sid = await p.evaluate(() => location.hash.split('/')[2]);
await p.waitForFunction(() => /推定/.test(document.querySelector('#keysBox')?.textContent || ''), null, { timeout: 40000 }).catch(() => log('no estimate'));
log('keys', (await p.textContent('#keysBox')).replace(/\s+/g, ' '));
// 練習の印・点数
await p.click('[data-pk="learning"]');
await p.click('[data-score]'); await p.fill('#sc-v', '91.5'); await p.click('.sheet [data-s="add"]');
await p.waitForTimeout(300);
await shot(p, '4-song');
// 鍵盤で最高音を選ぶ
await p.click('#keys');
await p.click('#k-top');
await p.waitForSelector('.picker .kb');
await p.click('.picker [data-k="71"]'); await p.click('.picker [data-p="ok"]');
log('picked top', await p.textContent('#k-top'));
await p.click('.sheet [data-s="ok"]');
await p.waitForTimeout(800);
// 本番モード
await p.goto(`http://localhost:8765/lyric-book/#/play/${sid}`); await p.waitForSelector('.playS');
await p.fill('#bpm', '240'); await p.selectOption('#bars', '1');
await p.click('#pp');
await p.waitForTimeout(3500);
log('perform current', await p.$eval('.pl.cur', e => e.textContent.trim().slice(0, 20)));
await shot(p, '5-perform');
await p.click('#bk');
await p.waitForSelector('#lyr');
// 音程チェックの板
await p.click('#tPitch'); await p.waitForTimeout(1500);
await shot(p, '6-pitch');
await p.click('.sheet [data-s="no"]');
// 電波なしで録音
offline = true;
await p.click('#tRec'); await p.click('.rec-big'); await p.waitForTimeout(1200); await p.click('.rec-big');
await p.waitForTimeout(1500);
log('pending rec', await p.textContent('#recsBox'));
offline = false;
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await p.waitForTimeout(2500);
log('after online rec', (await p.textContent('#recsBox')).replace(/\s+/g, ' '), 'server recs', gas.files().filter(f => f.parent === '録音').length);
// 再生と小さな再生バー
await p.click('[data-recplay]'); await p.waitForTimeout(600);
log('mini', await p.isVisible('#mini'));
await shot(p, '7-mini');
// セットリスト
await p.evaluate(() => { location.hash = '#/setlists'; }); await p.waitForSelector('#sl-new');
await p.click('#sl-new'); await p.fill('#ask-in', '今日のカラオケ'); await p.click('.sheet [data-s="ok"]');
await p.waitForSelector('#sl-add'); await p.click('#sl-add'); await p.click('.sheet .item'); await p.click('.sheet [data-s="no"]');
await p.waitForTimeout(300);
log('setlist rows', await p.$$eval('.sl-row', e => e.length));
await shot(p, '8-setlist');
// ゴミ箱
await p.evaluate(id => { location.hash = '#/song/' + id; }, sid); await p.waitForSelector('#smenu');
await p.click('#smenu'); await p.click('.menu-list button.danger'); await p.click('.sheet [data-s="ok"]');
await p.waitForTimeout(800);
log('after delete home', await p.evaluate(() => location.hash));
await p.evaluate(() => { location.hash = '#/trash'; }); await p.waitForSelector('.setS');
log('trash items', await p.$$eval('[data-back]', e => e.length));
await p.click('[data-back]'); await p.waitForTimeout(800);
log('restored alive', !JSON.stringify(call('lb_load', { p_token: call('lb_login', { p_username: 'わたし', p_password: 'pass' }).result.token }).result.songs[0].data).includes('deleted_at'));
// 解説
for (const t of ['parts', 'how']) { await p.evaluate(tt => { location.hash = '#/help?tab=' + tt; }, t); await p.waitForTimeout(400); await shot(p, '9-help-' + t, true); }
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
await shot(p, '10-settings', true);
// メンバーに見せる → メンバーの「みんなの曲」
await p.evaluate(id => { location.hash = '#/song/' + id; }, sid); await p.waitForSelector('#smenu');
await p.click('#smenu'); await p.click('.menu-list button:has-text("メンバーに見せる")'); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.invite');
const invite = await p.textContent('.invite');
const m = await newPage();
await m.click('[data-m="signup"]'); await m.fill('#lf-user', 'ともだち'); await m.fill('#lf-pass', 'pass'); await m.fill('#lf-inv', invite);
await m.click('#lf button[type="submit"]'); await m.waitForSelector('.recovery'); await m.click('[data-s="ok"]');
await m.waitForSelector('[data-tab="shared"]', { timeout: 10000 });
await m.click('[data-tab="shared"]'); await m.click('#homeList .item'); await m.waitForSelector('#copy-mine');
await shot(m, '11-shared');
log(errs.join('\n') || 'no errors');
await b.close();
