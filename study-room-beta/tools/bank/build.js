// 問題バンク（リポジトリの roomin-questions/data）を、アプリが読む形にする。
//   使い方（どこからでも）：node study-room-beta/tools/bank/build.js
//   できるもの：study-room-beta/data/bank/<科目>.json（1科目1ファイル）
// 番号（id）は「科目・ジャンル・単元・問題文」から作るので、問題を足したり並べかえても、前の記録とずれない。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'roomin-questions', 'data'), OUT = path.join(ROOT, 'study-room-beta', 'data', 'bank');
// 問題バンクの subject → アプリの科目（物理は今の「公式」の物理と分けて、4択の物理にする）
const SID = { physics: 'physics4' };
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const bySid = {};
(function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.json')) continue;
    for (const q of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      const sid = SID[q.subject] || q.subject;
      const ids = new Set((bySid[sid] ||= []).map(x => x.id));
      let id = `${sid}-b${hash(`${q.genre}|${q.unit}|${q.text}`)}`;
      for (let k = 2; ids.has(id); k++) id = `${sid}-b${hash(`${q.genre}|${q.unit}|${q.text}|${k}`)}`;
      bySid[sid].push({ id, genre: q.genre, unit: q.unit, grade: q.grade, level: q.level, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain });
    }
  }
})(SRC);
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [sid, list] of Object.entries(bySid)) {
  fs.writeFileSync(path.join(OUT, sid + '.json'), JSON.stringify(list));
  total += list.length;
  console.log(`${sid}: ${list.length}問`);
}
console.log(`合計 ${total}問 → ${path.relative(ROOT, OUT)}`);
