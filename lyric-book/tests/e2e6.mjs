import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname);
gas.setup();
const log = (...a) => console.log(...a);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await ctx.route(URL_, async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gas.post(route.request().postData())) }));
await ctx.route('**/lyric-book/js/cloud.js*', async route => {
  const r = await route.fetch();
  await route.fulfill({ response: r, body: (await r.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
const shot = n => p.screenshot({ path: `${SP}/v22-${n}.png` });
await p.goto('http://localhost:8765/lyric-book/');
await p.click('[data-m="signup"]'); await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]'); await p.waitForSelector('.recovery'); await p.click('[data-s="ok"]');
await p.waitForSelector('.home');
// タブを足す
await p.click('#addTab'); await p.fill('#ask-in', 'バンド'); await p.click('.sheet [data-s="ok"]');
await p.waitForTimeout(400);
log('tabs', await p.$$eval('.seg button', e => e.map(x => x.textContent)));
// 歌手 → 曲の一覧
await p.click('[data-tab="real"]');
await p.click('#addArtist'); await p.fill('#na-name', 'あいみょん'); await p.click('[data-s="ok"]');
await p.waitForSelector('#a-songs');
await p.click('#a-songs');
await p.waitForSelector('.as-row', { timeout: 30000 });
log('artist songs', await p.$$eval('.as-row', e => e.length), (await p.$$eval('.as-row .as-t', e => e.slice(0, 3).map(x => x.textContent.replace(/\s+/g, ' ')))).join(' | '));
await p.fill('#as-q', 'マリーゴールド'); await p.waitForTimeout(200);
await p.click('.as-row'); await p.waitForTimeout(600);
log('marked', await p.$eval('.as-row', e => e.classList.contains('on')));
await shot('1-artist-songs');
await p.click('.sheet [data-s="no"]');
await p.waitForSelector('#alist .item');
await p.click('#alist .item');
await p.waitForSelector('#lyr');
await p.waitForTimeout(1500);
log('meta', await p.textContent('.head .meta'));
// タブに入れる
await p.click('#smenu'); await p.click('.menu-list button:has-text("タブに入れる")');
await p.click('.menu-list button:has-text("バンド")'); await p.waitForTimeout(400);
// 編集：保存と消すの場所
await p.click('.toolbar [data-go^="#/edit"]'); await p.waitForSelector('#e-text');
log('top button', await p.textContent('.topbar #e-del'), '| bottom', await p.textContent('.save-bar #save'));
await p.fill('#e-text', '[サビ]\n線を引いてみる歌詞');
await shot('2-edit');
await p.click('#save'); await p.waitForSelector('#lyr');
// 線をつける
// 2.3.3 から、文字は横になぞって選ぶ（iPhone の選ぶ印は使わない）
const sel = async (a, z) => {
  const bb = async i => (await p.$(`[data-l="0"][data-i="${i}"]`)).boundingBox();
  const A = await bb(a), Z = await bb(z);
  await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await p.mouse.down();
  for (let k = 1; k <= 6; k++) await p.mouse.move(A.x + A.width / 2 + (Z.x - A.x) * k / 6, A.y + A.height / 2);
  await p.mouse.up();
};
await sel(0, 3); await p.waitForSelector('#annobar'); await p.click('[data-a="line"][data-k="line"]');
await sel(2, 6); await p.waitForSelector('#annobar'); await p.click('[data-a="line"][data-k="wave"]');
await sel(5, 8); await p.waitForSelector('#annobar'); await p.click('[data-a="color"][data-k="strong"]');
await p.waitForTimeout(400);
log('lines', await p.$$eval('.u-line', e => e.length), await p.$$eval('.u-wave', e => e.length));
await p.evaluate(() => document.querySelector('#lyr').scrollIntoView());
await shot('3-lines');
// ホームのバンドのタブ
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.home');
await p.click('.seg button:has-text("バンド")'); await p.waitForTimeout(300);
log('band tab', await p.$$eval('#homeList .item b', e => e.map(x => x.textContent)));
await shot('4-band');
// 音（例外が出ないか）
await p.evaluate(() => { location.hash = '#/help?tab=notes'; }); await p.waitForTimeout(300);
await p.click('[data-play="69"]'); await p.waitForTimeout(300);
log(errs.join('\n') || 'no errors');
await b.close();
