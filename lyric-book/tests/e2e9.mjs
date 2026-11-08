import { createRequire } from 'module';
import fs from 'fs';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const SP = process.argv[2];
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname);
gas.setup();
const log = (...a) => console.log(...a);
// ためしの音源：A4(440Hz) の音が 0.5 秒ごとに鳴る 12 秒の WAV
{
  const rate = 22050, sec = 12, n = rate * sec, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate, env = (t % 0.5) < 0.3 ? 1 : 0.05; buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * t) * 9000 * env), 44 + i * 2); }
  fs.writeFileSync(SP + '/test-tone.wav', buf);
}
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
const shot = n => p.screenshot({ path: `${SP}/v25-${n}.png` });
// 招待リンクで開く
await p.goto('http://localhost:8765/lyric-book/?invite=ABCD-EFGH');
await p.waitForSelector('#lf-inv');
log('invite prefilled', await p.inputValue('#lf-inv'));
await p.fill('#lf-inv', '');
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]'); await p.waitForSelector('.recovery'); await p.click('[data-s="ok"]');
await p.waitForSelector('.home');
log('query removed', await p.evaluate(() => location.search === ''));
// 自分の最高音・最低音
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('#my-top');
await p.click('#my-top'); await p.click('.picker [data-k="69"]'); await p.click('.picker [data-p="ok"]');
await p.waitForSelector('#my-low'); await p.click('#my-low'); await p.click('.picker [data-k="50"]'); await p.click('.picker [data-p="ok"]');
await p.waitForTimeout(300);
// 新しい曲：曲名の候補
await p.evaluate(() => { location.hash = '#/new?kind=real'; }); await p.waitForSelector('#e-title');
await p.type('#e-title', 'Pretender', { delay: 30 });
await p.waitForSelector('#e-sugg [data-sg]', { timeout: 20000 });
log('suggestions', (await p.$$eval('#e-sugg .as-t', e => e.slice(0, 3).map(x => x.textContent.replace(/\s+/g, ' ')))).join(' | '));
await p.click('#e-sugg [data-sg]');
await shot('1-sugg');
await p.click('#save');
await p.waitForSelector('#lyr', { timeout: 20000 });
await p.waitForSelector('.est.kt', { timeout: 40000 });
await p.waitForSelector('.lyr .part', { timeout: 40000 }).catch(() => log('no parts'));
log('parts', await p.$$eval('.lyr .part', e => e.map(x => x.textContent).join(' ')));
log('rec-key', (await p.textContent('.rec-key').catch(() => 'なし')).replace(/\s+/g, ' '));
log('art', await p.isVisible('.song-art'));
await shot('2-song');
const sid = await p.evaluate(() => location.hash.split('/')[2]);
// 音源から合わせる
await p.click('#smenu');
const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 8000 }), p.click('.menu-list button:has-text("音源から合わせる")')]);
await fc.setFiles(SP + '/test-tone.wav');
await p.waitForSelector('#fa-box:not([hidden])', { timeout: 20000 });
await p.click('[data-s="play"]'); await p.waitForTimeout(600);
for (let i = 0; i < 4; i++) { await p.click('#fa-tap'); await p.waitForTimeout(700); }
await shot('3-tap');
await p.click('#fa-save');
await p.waitForTimeout(800);
log('after audio', (await p.textContent('#keysBox')).replace(/\s+/g, ' ').slice(0, 140));
// 本番モード：タップの時間
await p.evaluate(id => { location.hash = '#/play/' + id; }, sid); await p.waitForSelector('.playS');
log('timed chip', await p.isVisible('#pm-time'), await p.$eval('#pm-time', e => e.classList.contains('on')).catch(() => false));
await p.click('#pp'); await p.waitForTimeout(2600);
log('clock', await p.textContent('#clock'), '| cur', await p.$eval('.pl.cur', e => e.textContent.trim().slice(0, 12)).catch(() => 'none'));
await shot('4-perform');
await p.click('#bk');
// ホームの検索 → Apple の曲から入れる
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('#q');
await p.fill('#q', '夜に駆ける');
await p.waitForSelector('#appleSugg [data-ap]', { timeout: 20000 });
await shot('5-search');
await p.click('#appleSugg [data-ap]');
await p.waitForSelector('#lyr', { timeout: 20000 });
log('added from search', await p.textContent('.head h1'));
// 歌手を追加 → すぐ曲の一覧
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.home');
await p.click('[data-tab="real"]'); await p.click('#addArtist'); await p.fill('#na-name', 'あいみょん'); await p.click('[data-s="ok"]');
await p.waitForSelector('#as-list', { timeout: 20000 });
log('artist sheet opened', true);
await p.click('.sheet [data-s="no"]');
// おまかせセットリスト
await p.evaluate(() => { location.hash = '#/setlists'; }); await p.waitForSelector('#sl-auto');
await p.click('#sl-auto'); await p.click('.menu-list button:has-text("ランダム")');
await p.waitForSelector('.sl-row'); log('auto setlist rows', await p.$$eval('.sl-row', e => e.length));
log(errs.join('\n') || 'no errors');
await b.close();
