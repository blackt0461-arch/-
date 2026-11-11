// 版6：「LYRIC BOOK」フォルダを別のフォルダへ動かしても、ログインできて、空のフォルダを新しく作らないか（画面は使わない）
// node e2e15.mjs            … いまの Code.gs
// node e2e15.mjs <Code.gs>  … ほかの Code.gs（直す前と比べるとき）
import { makeGas } from './gas.mjs';
const path = process.argv[2] || new URL('../lyric-book/server/Code.gs', import.meta.url).pathname;
const gas = makeGas(path);
gas.setup();
const call = (fn, args) => gas.post(JSON.stringify({ fn, args }));
const login = () => { const r = call('lb_login', { p_username: 'わたし', p_password: 'pass' }); return r.ok ? 'ログインできた' : 'ログインできない（' + r.error + '）'; };
const lb = () => gas.folders().filter(f => f.name === 'LYRIC BOOK' && !f.trashed).map(f => f.parent).join(' / ');
call('lb_signup', { p_username: 'わたし', p_password: 'pass' });
console.log('はじめ              |', login(), '| LYRIC BOOK の場所:', lb());
gas.moveRoot('LYRIC BOOK', 'アプリ（KOTETSU WORKS）'); gas.resetCache();
console.log('フォルダを動かした  |', login(), '| LYRIC BOOK の場所:', lb());
gas.resetCache(true);
console.log('ID を忘れた状態でも |', login(), '| LYRIC BOOK の場所:', lb());
