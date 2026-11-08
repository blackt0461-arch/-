// 物理の新しい出し方の問題を、src/*.js（下書き）から data/<ジャンル>/<単元>.json に書き出す。
//   使い方：node roomin-questions/physics-x/build.js
// 書き出す前に1問ずつ確かめる（1つでもだめなら書き出さない）：
//   ・num：calc()（問題文の数字から計算する式）の値と、ans が 0.5% 以内で合っているか
//   ・build：空らんの答えがボタンにあるか・ダミーが答えとかぶらないか
//   ・order：3つ以上・同じものがないか
//   ・choice：選択肢4つ・answer が 0〜3
//   ・どれも：問題文・解説があるか・LaTeX（\ や $）を使っていないか・同じ問題文がないか
const fs = require('fs'), path = require('path');
const DIR = __dirname, SRC = path.join(DIR, 'src'), OUT = path.join(DIR, 'data');
const KEYS = ['genre', 'unit', 'grade', 'level', 'type', 'kind', 'text', 'fig', 'ans', 'ansText', 'unitText', 'tol', 'parts', 'pool', 'items', 'ends', 'choices', 'answer', 'explain'];
const errs = [], out = {}, texts = new Set();
let n = 0;
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort()) {
  const { genre, unit, grade, list } = require(path.join(SRC, f));
  list.forEach((q0, i) => {
    const q = { genre, unit, grade, ...q0 };
    const at = `${f} ${i + 1}問目（${String(q.text).slice(0, 24)}…）`;
    const bad = (m) => errs.push(`${at}：${m}`);
    if (!q.text || !q.explain) bad('問題文か解説がない');
    if (/[\\$]/.test(q.text + q.explain + JSON.stringify(q.choices || q.items || q.parts || ''))) bad('\\ や $ を使っている');
    if (![1, 2, 3].includes(q.level)) bad('level は 1〜3');
    const key = `${q.type || 'choice'}|${q.text}`;
    if (texts.has(key)) bad('同じ問題文がある'); texts.add(key);
    if (q.type === 'num') {
      if (typeof q.calc !== 'function' || !Number.isFinite(q.ans)) bad('num には calc と ans がいる');
      else { const v = q.calc(); if (Math.abs(v - q.ans) > Math.abs(q.ans) * 0.005 + 1e-12) bad(`計算すると ${v} だが ans は ${q.ans}`); }
      if (q.tol !== undefined && !(q.tol >= 0 && q.tol < 0.2)) bad('tol がおかしい');
    } else if (q.type === 'build') {
      const ans = q.parts.filter(x => x && typeof x === 'object').map(x => x.a);
      if (!ans.length) bad('空らんがない');
      if (ans.some(a => !a)) bad('空らんの答えがない');
      for (const d of q.pool || []) if (ans.includes(d)) bad(`ダミー「${d}」が答えとかぶる`);
    } else if (q.type === 'order') {
      if (!Array.isArray(q.items) || q.items.length < 3) bad('並べかえは3つ以上');
      else if (new Set(q.items).size !== q.items.length) bad('同じものがある');
    } else if (!q.type) {
      if (!Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices).size !== 4) bad('選択肢は4つ（ちがうもの）');
      if (!(q.answer >= 0 && q.answer < 4)) bad('answer は 0〜3');
      if (!q.fig) bad('ふつうの4択は roomin-questions/src に書く（ここはグラフつきだけ）');
    } else bad('type がおかしい：' + q.type);
    if (q.fig) { const g = q.fig; if (!Array.isArray(g.x) || !Array.isArray(g.y) || !(g.lines || g.wave)) bad('fig の形がおかしい'); }
    const o = {}; for (const k of KEYS) if (q[k] !== undefined) o[k] = q[k];
    o.subject = 'physics';
    (out[`${genre}/${unit}`] ||= []).push(o);
    n++;
  });
}
if (errs.length) { console.log(errs.join('\n')); console.log(`\nまちがい ${errs.length}件。書き出していません。`); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
for (const [k, list] of Object.entries(out)) {
  const f = path.join(OUT, k + '.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list, null, 1) + '\n');
  const c = {}; list.forEach(q => { const t = q.type || 'グラフ4択'; c[t] = (c[t] || 0) + 1; });
  console.log(`${k}: ${list.length}問`, JSON.stringify(c));
}
console.log(`合計 ${n}問 → roomin-questions/physics-x/data（アプリに入れるのは node study-room-beta/tools/bank/build.js）`);
