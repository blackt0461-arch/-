// 問題バンク（リポジトリの roomin-questions/data）を、アプリが読む形にする。
//   使い方（どこからでも）：node study-room-beta/tools/bank/build.js
//   できるもの：study-room-beta/data/bank/<科目>.json（1科目1ファイル）
// 番号（id）は「科目・ジャンル・単元・問題文」から作るので、問題を足したり並べかえても、前の記録とずれない。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'roomin-questions', 'data'), OUT = path.join(ROOT, 'study-room-beta', 'data', 'bank');
// 問題バンクの subject → アプリの科目。1.17.0 から物理は1つ（physics）。
// 番号（id）の頭は、前の記録とずれないように前のまま（物理は physics4-b…）
const SID = {};
const IDP = { physics: 'physics4' };
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
// 解説（roomin-questions/explain/…/<単元>.json）があれば、くわしい解説（detail）とちがう理由（why）を足す。1.12.0
const EXP = path.join(ROOT, 'roomin-questions', 'explain');
function explainsFor(p) {
  const f = path.join(EXP, path.relative(SRC, p));
  if (!fs.existsSync(f)) return new Map();
  try { return new Map(JSON.parse(fs.readFileSync(f, 'utf8')).filter(e => e && e.detail && !/^要確認/.test(e.detail)).map(e => [e.text, e])); } catch (e) { console.log('解説が読めない：' + f); return new Map(); }
}
// 大問を分けたもの（roomin-questions/split/…/<単元>.json）があれば、steps を足す。1.14.0（SPLIT_INSTRUCTIONS.md）
const SPL = path.join(ROOT, 'roomin-questions', 'split');
function splitsFor(p) {
  const f = path.join(SPL, path.relative(SRC, p));
  if (!fs.existsSync(f)) return new Map();
  try { return new Map(JSON.parse(fs.readFileSync(f, 'utf8')).filter(e => e && Array.isArray(e.steps) && e.steps.length >= 2 && !e.note).map(e => [e.text, e])); } catch (e) { console.log('分けた問題が読めない：' + f); return new Map(); }
}
let withDetail = 0, withSteps = 0;
const bySid = {};
(function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.json')) continue;
    const ex = explainsFor(p), sp = splitsFor(p);
    for (const q of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      const sid = SID[q.subject] || q.subject;
      const ids = new Set((bySid[sid] ||= []).map(x => x.id));
      const idp = IDP[q.subject] || sid;
      let id = `${idp}-b${hash(`${q.genre}|${q.unit}|${q.text}`)}`;
      for (let k = 2; ids.has(id); k++) id = `${idp}-b${hash(`${q.genre}|${q.unit}|${q.text}|${k}`)}`;
      const e = ex.get(q.text), item = { id, genre: q.genre, unit: q.unit, grade: q.grade, level: q.level, text: q.text, choices: q.choices, answer: q.answer, explain: q.explain };
      if (e) { item.detail = e.detail; if (Array.isArray(e.why) && e.why.length === 4) item.why = e.why; withDetail++; }
      const sx = sp.get(q.text);
      if (sx) { item.steps = sx.steps.map(s => ({ ask: s.ask, choices: s.choices, answer: s.answer, hint: s.hint || '' })); withSteps++; }
      bySid[sid].push(item);
    }
  }
})(SRC);
// 物理の新しい出し方（計算・組み立て・並べかえ・グラフつき4択）：roomin-questions/physics-x/data/<ジャンル>/<単元>.json（1.17.0）
// 番号は physics-x-… （出し方と問題文から作る）
const PX = path.join(ROOT, 'roomin-questions', 'physics-x', 'data');
let typed = 0;
if (fs.existsSync(PX)) (function walk(d) {
  for (const f of fs.readdirSync(d).sort()) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.json')) continue;
    const list = bySid.physics ||= [];
    const ids = new Set(list.map(x => x.id));
    for (const q of JSON.parse(fs.readFileSync(p, 'utf8'))) {
      let id = `physics-x${hash(`${q.genre}|${q.unit}|${q.type || 'choice'}|${q.text}`)}`;
      for (let k = 2; ids.has(id); k++) id = `physics-x${hash(`${q.genre}|${q.unit}|${q.type || 'choice'}|${q.text}|${k}`)}`;
      ids.add(id);
      const { subject, ...rest } = q;
      list.push({ id, ...rest });
      typed++;
    }
  }
})(PX);
console.log(`物理の新しい出し方 ${typed}問`);
fs.mkdirSync(OUT, { recursive: true });
// 前の名前のファイル（物理（4択）の physics4.json）は消す
for (const old of ['physics4.json']) { const f = path.join(OUT, old); if (fs.existsSync(f)) fs.unlinkSync(f); }
let total = 0;
for (const [sid, list] of Object.entries(bySid)) {
  fs.writeFileSync(path.join(OUT, sid + '.json'), JSON.stringify(list));
  total += list.length;
  console.log(`${sid}: ${list.length}問`);
}
console.log(`くわしい解説つき ${withDetail}問・段階に分けた問題 ${withSteps}問`);
console.log(`合計 ${total}問 → ${path.relative(ROOT, OUT)}`);
