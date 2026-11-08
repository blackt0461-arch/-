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
const b = await chromium.launch();
const errs = [];
async function newPage() {
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  await ctx.route(URL_, async route => {
    const out = gas.post(route.request().postData());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await ctx.route('**/lyric-book/js/cloud.js*', async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()).replace(/export const SCRIPT_URL = '[^']*';/, `export const SCRIPT_URL = '${URL_}';`) });
  });
  await ctx.route('https://itunes.apple.com/**', r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|itunes/.test(m.text())) errs.push('console ' + m.text()); });
  await p.goto('http://localhost:8765/lyric-book/');
  return p;
}
async function signup(p, name, invite) {
  await p.click('[data-m="signup"]');
  await p.fill('#lf-user', name); await p.fill('#lf-pass', 'pass'); if (invite) await p.fill('#lf-inv', invite);
  await p.click('#lf button[type="submit"]');
  await Promise.race([p.waitForSelector('.recovery'), p.waitForFunction(() => document.querySelector('.err')?.textContent.trim())]);
  const err = await p.textContent('.err').catch(() => '');
  if (await p.isVisible('.recovery')) { await p.click('[data-s="ok"]'); await p.waitForSelector('.home'); return 'ok'; }
  return err;
}
async function addOwnSong(p, title) {
  await p.click('[data-tab="own"]'); await p.click('#fab');
  await p.waitForSelector('#e-text');
  await p.fill('#e-title', title); await p.fill('#e-text', '[サビ]\n' + title + 'の歌詞');
  await p.click('#save'); await p.waitForSelector('#lyr');
}
const owner = await newPage();
log('owner signup', await signup(owner, 'わたし'));
await addOwnSong(owner, '持ち主の歌');
const member = await newPage();
log('member no invite', await signup(member, 'ともだち', ''));
await owner.evaluate(() => { location.hash = '#/settings'; });
await owner.waitForSelector('.invite');
const invite = await owner.textContent('.invite');
log('invite', invite);
log('member wrong invite', await signup(member, 'ともだち', 'XXXX-YYYY'));
log('member with invite', await signup(member, 'ともだち', invite.toLowerCase()));
await addOwnSong(member, 'ともだちの歌');
await member.evaluate(() => { location.hash = '#/'; });
await member.waitForSelector('#homeList');
log('member sees', await member.$$eval('#homeList .item b', e => e.map(x => x.textContent)));
log('dup name', await signup(await newPage(), 'ともだち', invite));
await member.evaluate(() => { location.hash = '#/settings'; });
await member.waitForSelector('.setS');
log('member has members section', await member.isVisible('#members'), '| backup text:', (await member.textContent('.setS')).includes('管理している人のグーグルドライブ'));
gas.backup();
log('drive', gas.files().filter(f => !f.trashed).map(f => `${f.parent}/${f.name}`).sort());
await owner.reload();
await owner.waitForSelector('[data-out]');
log('owner list', await owner.$$eval('#members .set-row > span:first-child', e => e.map(x => x.textContent.slice(0, 30))));
await owner.screenshot({ path: SP + '/m1-owner.png', fullPage: true });
await owner.click('[data-out]');
await owner.click('.sheet [data-s="ok"]');
await owner.waitForTimeout(800);
log('after remove members', JSON.stringify(call('lb_admin', { p_token: JSON.parse(await owner.evaluate(() => JSON.stringify(localStorage.lb_token))) }).result.members));
await member.reload();
await member.waitForTimeout(1500);
log('removed member screen', await member.isVisible('#lf-user'));
log(errs.join('\n') || 'no errors');
await b.close();
