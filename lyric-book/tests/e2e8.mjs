// 2.3.1：歌詞を取ってきたとき、自分の保存どうしがぶつかって「別の端末の版」ができないか
// J-Lyric.net には問い合わせない（受け口の UrlFetchApp をまねの返事にする）。受け口は 2.5 秒かかるまね。
import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium, devices } = require('playwright');
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const DELAY = +(process.argv[2] || 2500);
const fake = url => {
  const body = url.includes('search.php')
    ? '<p class="mid"><a href="/artist/a1/l1.html" title="テスト歌手">テスト曲</a></p>'
    : '<p class="sml">作詞：だれか</p><p class="sml">作曲：だれか</p><p id="Lyric">一行目<br>二行目<br>三行目</p>';
  return { getResponseCode: () => 200, getContentText: () => body };
};
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname, { fetch: fake });
gas.setup();
const call = (fn, args) => { const r = gas.post(JSON.stringify({ fn, args })); if (r.error) throw new Error(fn + ' ' + r.error); return r.result; };
const { token } = call('lb_signup', { p_username: 'わたし', p_password: 'pass' });
call('lb_save_artist', { p_token: token, p_id: 'a1', p_data: { name: 'テスト歌手' } });
const base = { kind: 'real', artist_id: 'a1', yomi: '', anno: [], lyricsTried: true };
call('lb_save_song', { p_token: token, p_id: 's1', p_data: { ...base, title: 'テスト曲', text: '', keys: { autoTried: true }, releaseTried: true } });
call('lb_save_song', { p_token: token, p_id: 's2', p_data: { ...base, title: 'テスト曲', text: '', keys: { autoTried: true } } });
call('lb_save_song', { p_token: token, p_id: 's4', p_data: { ...base, title: 'テスト曲', text: '', keys: { autoTried: true } } });
call('lb_save_song', { p_token: token, p_id: 's3', p_data: { ...base, title: 'テスト曲', text: '前の歌詞', keys: { autoTried: true }, releaseTried: true } });

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
const errs = [], toasts = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message));
await p.exposeFunction('__toast', t => toasts.push(t));
await p.addInitScript(() => addEventListener('DOMContentLoaded', () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && /toast/.test(n.className)) window.__toast(n.textContent); }))).observe(document.body, { childList: true, subtree: true })));
await p.goto('http://localhost:8765/lyric-book/');
await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]');
await p.waitForSelector('.home', { timeout: 20000 });
await p.waitForTimeout(DELAY * 2 + 500);
const songsNow = () => Object.values(JSON.parse(gas.read('データ（さわらないでください）.json')).users)[0].songs;
for (const id of ['s1', 's2', 's3']) {
  await p.evaluate(id => { location.hash = '#/song/' + id; }, id);
  await p.waitForSelector('#lyr');
  if (id === 's3') {
    await p.click('#smenu'); await p.click('.sheet button:has-text("歌詞を取ってきなおす")');
    await p.waitForSelector('.sheet [data-s="ok"]', { timeout: 20000 }); await p.click('.sheet [data-s="ok"]');
  } else await p.click('#getLyr');
  await p.waitForSelector('.src', { timeout: 30000 });
  // 歌詞の保存が送られている最中に、練習の印も押す（同じ曲の保存が重なる）
  await p.waitForTimeout(1200);
  await p.click('[data-pk]');
  await p.waitForTimeout(DELAY * 4);
  const ss = songsNow();
  console.log(id, '| 印', ss[id].data.practice, '| 歌詞', JSON.stringify(ss[id].data.text), '| 曲の数', Object.keys(ss).length, '| 別の端末の版', Object.values(ss).filter(x => /別の端末/.test(x.data.title)).length);
}
// 取ってきたらすぐ別のページへ → 開きなおしても歌詞が残っているか
await p.evaluate(() => { location.hash = '#/song/s4'; });
await p.waitForSelector('#getLyr'); await p.click('#getLyr');
await p.waitForSelector('.src', { timeout: 30000 });
await p.click('#bk');
await p.waitForTimeout(DELAY * 4);
await p.goto('http://localhost:8765/lyric-book/'); await p.waitForSelector('.home', { timeout: 20000 }); await p.waitForTimeout(DELAY * 2 + 500);
await p.evaluate(() => { location.hash = '#/song/s4'; }); await p.waitForSelector('#lyr');
console.log('s4 開きなおし | 画面の行', await p.$$eval('#lyr .ln', e => e.length), '| 受け口の歌詞', JSON.stringify(songsNow().s4.data.text), '| 曲の数', Object.keys(songsNow()).length);
// 本当に別の端末で直したときは、今までどおり「別の端末の版」を残す
await p.evaluate(() => { location.hash = '#/song/s2'; }); await p.waitForSelector('#lyr');
await new Promise(r => setTimeout(r, 1500));
const other = songsNow().s2;
call('lb_save_song', { p_token: token, p_id: 's2', p_data: { ...other.data, memo: '別の端末' }, p_base: other.updated_at });
await p.click('[data-pk="sing"], [data-pk]:not(.on)');
await p.waitForTimeout(DELAY * 4);
console.log('別の端末とのかぶり | 別の端末の版', Object.values(songsNow()).filter(x => /別の端末/.test(x.data.title)).length);
console.log('toasts', JSON.stringify(toasts));
console.log(errs.join('\n') || 'no errors');
await b.close();
