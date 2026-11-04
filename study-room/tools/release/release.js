// テスト版（study-room-beta/）を、みんなが使う本番（study-room/）に写す。
// 管理者がテスト版でためして、ユーザーの「許可」が出てから使う。
//   使い方（どこからでも）：node study-room-beta/tools/release/release.js
// 写したあとは、いつもどおりコミット → プルリクエスト → main にマージで本番に出る。
// tools/check/out（確かめの写真）と tools/pack/src（暗号にする前の問題）は、写さず・消さない。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'study-room-beta'), DST = path.join(ROOT, 'study-room');
const SKIP = ['tools/check/out', 'tools/pack/src'];
const skip = (rel) => SKIP.some(s => rel === s || rel.startsWith(s + '/'));
function walk(dir, base = '') { const out = []; for (const n of fs.readdirSync(dir)) { const rel = base ? base + '/' + n : n; if (skip(rel)) continue; const full = path.join(dir, n); if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel)); else out.push(rel); } return out; }
const want = new Set(walk(SRC));
let copied = 0, removed = 0;
for (const rel of want) { const a = path.join(SRC, rel), b = path.join(DST, rel); if (fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b))) continue; fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); copied++; }
for (const rel of walk(DST)) if (!want.has(rel)) { fs.rmSync(path.join(DST, rel)); removed++; }
const v = JSON.parse(fs.readFileSync(path.join(DST, 'version.json'), 'utf8')).version;
console.log(`本番に写しました（${v}）：かえた ${copied}・消した ${removed}`);
