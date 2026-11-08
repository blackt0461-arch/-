import { createRequire } from 'module';
import { makeGas } from './gas.mjs';
const require = createRequire('/opt/node-tools/node_modules/x.js');
const { chromium } = require('playwright');
const SP = process.argv[2], OUT = SP + '/ui'; require('fs').mkdirSync(OUT, { recursive: true });
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
const gas = makeGas(new URL('../lyric-book/server/Code.gs', import.meta.url).pathname); gas.setup();
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
await ctx.route(URL_, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gas.post(r.request().postData())) }));
await ctx.route('**/lyric-book/js/cloud.js*', async r => { const x = await r.fetch(); await r.fulfill({ response: x, body: (await x.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) }); });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/lyric-book/');
await p.click('.tabs button[data-m="signup"]').catch(() => {});
await p.waitForSelector('#lf-user'); await p.fill('#lf-user', 'わたし'); await p.fill('#lf-pass', 'pass');
await p.click('#lf button[type="submit"]'); await p.waitForSelector('.recovery'); await p.click('[data-s="ok"]'); await p.waitForSelector('.home');
await p.evaluate(() => { location.hash = '#/new?kind=real'; }); await p.waitForSelector('#e-title');
await p.type('#e-title', 'Pretender', { delay: 20 }); await p.waitForSelector('#e-sugg [data-sg]', { timeout: 20000 });
await p.click('#e-sugg [data-sg]'); await p.click('#save'); await p.waitForSelector('#lyr', { timeout: 20000 });
await p.waitForSelector('.est.kt', { timeout: 40000 }); await p.waitForTimeout(1500);
const sid = await p.evaluate(() => location.hash.split('/')[2]);
await p.click('#smenu');
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.menu-list button:has-text("音源から合わせる")')]);
await fc.setFiles(SP + '/test-tone.wav'); await p.waitForSelector('#fa-box:not([hidden])', { timeout: 20000 });
await p.click('[data-s="play"]'); await p.waitForTimeout(300);
for (let i = 0; i < 12; i++) { await p.click('#fa-tap'); await p.waitForTimeout(200); }
await p.click('#fa-save'); await p.waitForFunction(() => /音源を保存しました/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(500);
const theme = t => p.evaluate(t => { document.documentElement.dataset.theme = t; }, t);
const go = async (h, sel) => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForSelector(sel, { timeout: 20000 }); await p.waitForTimeout(400); };
for (const [vw, vh, dev] of [[390, 844, 'phone'], [820, 1180, 'ipad']]) {
  await p.setViewportSize({ width: vw, height: vh });
  for (const t of ['light', 'dark']) {
    const shot = async (n, full = false) => { await theme(t); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/${dev}-${t}-${n}.png`, fullPage: full }); };
    await go('#/', '.home'); await p.fill('#q', '夜に駆ける'); await p.waitForSelector('#appleSugg [data-ap]', { timeout: 20000 }).catch(() => {}); await shot('01-search');
    await p.fill('#q', '');
    await go('#/song/' + sid, '#lyr'); await shot('02-song', true);
    await p.click('#smenu'); await p.waitForTimeout(300); await shot('03-menu'); await p.keyboard.press('Escape'); await p.click('.sheet-bg', { position: { x: 5, y: 5 } }).catch(() => {}); await p.waitForTimeout(300);
    await go('#/song/' + sid, '#lyr');
    const [f2] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-src-audio]')]);
    await f2.setFiles(SP + '/test-tone.wav'); await p.waitForSelector('#fa-box:not([hidden])', { timeout: 20000 }); await shot('04-fa');
    await p.click('[data-s="no"]'); await p.waitForTimeout(300);
    await p.click('#tPitch'); await p.waitForTimeout(400); await shot('05-pitch'); await p.click('.sheet [data-s="no"], .sheet .btn.sub').catch(() => {}); await p.waitForTimeout(300);
    await go('#/new?kind=real', '#e-title'); await p.type('#e-title', 'Lemon', { delay: 10 }); await p.waitForSelector('#e-sugg [data-sg]', { timeout: 20000 }).catch(() => {}); await shot('06-new', true);
    await go('#/edit/' + sid, '#e-title'); await shot('07-edit', true);
    await go('#/play/' + sid, '.playS'); await p.waitForTimeout(800); await shot('08-perform');
    await p.click('#bk');
    await go('#/settings', '#my-top'); await shot('09-settings', true);
    await go('#/setlists', '#sl-auto'); await p.click('#sl-auto'); await p.waitForTimeout(300); await shot('10-auto');
    await go('#/help?tab=how', '.screen'); await shot('11-help', true);
  }
}
console.log(errs.join('\n') || 'no errors'); await b.close();
