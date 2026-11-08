// 2.6.2：端末にとっておいた「Google のコードの版」が古い（4）ままでも、版5 の KEYTUBE で最高音・最低音が入るか
// KEYTUBE には問い合わせない（まねの返事）。受け口は 1.5 秒かかるまね。
import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const DELAY = 1500;
const fake = url => {
  const body = url.includes('/search/')
    ? '<h2 class="song-row__title"><a href="/song/detail/53">テスト曲</a></h2>\n<p class="song-row__artist"><a href="/a">テスト歌手</a></p>\n<p class="song-row__compact-meta"><span class="scale-value--low" data-range-note="F3"></span><span class="scale-value--high" data-range-note="B4"></span></p>'
    : '<div>BPM 106</div>';
  return { getResponseCode: () => 200, getContentText: () => body };
};
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname, { fetch: fake });
gas.setup();
const call = (fn, args) => { const r = gas.post(JSON.stringify({ fn, args })); if (r.error) throw new Error(fn + ' ' + r.error); return r.result; };
const { token } = call('lb_signup', { p_username: 'わたし', p_password: 'pass' });
call('lb_save_artist', { p_token: token, p_id: 'a1', p_data: { name: 'テスト歌手' } });
call('lb_save_song', { p_token: token, p_id: 's1', p_data: { kind: 'real', artist_id: 'a1', title: 'テスト曲', yomi: '', anno: [{ t: 'あいうえお', m: [], c: [], u: [], memo: '' }], text: 'あいうえお', keys: { autoTried: true }, releaseTried: true, lyricsTried: true } });
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
// 端末の中の版だけを 4 にして開きなおす（中身は Google と同じ）（版4 の時に開いていた端末のまね）
const cs = await p.evaluate(() => JSON.parse(localStorage.getItem('lb_cache')).settings);
call('lb_save_settings', { p_token: token, p_settings: cs }); // 設定を一度保存したことがある人のまね（端末と Google で設定が同じ）
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('lb_cache')); c.server_version = 4; localStorage.setItem('lb_cache', JSON.stringify(c)); });
await p.goto('http://localhost:8765/lyric-book/#/song/s1'); await p.reload(); // ハッシュだけの移動では読みこみなおさないので、本当に開きなおす
await p.waitForSelector('#lyr', { timeout: 20000 });
await p.waitForTimeout(DELAY * 6);
const k = Object.values(JSON.parse(gas.read('データ（さわらないでください）.json')).users)[0].songs.s1.data.keys;
console.log('受け口 | 最高音', k.top, '| 最低音', k.low, '| テンポ', k.tempo, '| 出どころ', k.rangeFrom?.site);
console.log('画面のキーの表', (await p.textContent('#keys').catch(() => '')).replace(/\s+/g, ' ').slice(0, 80));
console.log('端末の版', await p.evaluate(() => JSON.parse(localStorage.getItem('lb_cache')).server_version));
console.log(errs.join('\n') || 'no errors');
await b.close();
