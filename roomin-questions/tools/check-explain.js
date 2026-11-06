#!/usr/bin/env node
// 解説（explain/ フォルダ）の確かめ機。EXPLAIN_INSTRUCTIONS.md の「4. 返す前の確かめ」の機械で見られる部分。
//   node roomin-questions/tools/check-explain.js
// explain/<subject>/<genre>/<unit>.json を、同じ場所の data/…/<unit>.json の問題と見くらべる。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), EX = path.join(ROOT, 'explain'), DATA = path.join(ROOT, 'data');
const BAD = [/\\frac/, /\$/, /\\\(/, /\\\[/, /\*\*/, /\\sqrt/, /\\times/, /`/];
let files = 0, ok = 0, errs = 0, review = 0;
const err = (f, i, m) => { errs++; console.log(`× ${path.relative(ROOT, f)} [${i}] ${m}`); };
function walk(d) { if (!fs.existsSync(d)) return []; return fs.readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.json') ? [path.join(d, x.name)] : []); }
for (const f of walk(EX)) {
  files++;
  const df = path.join(DATA, path.relative(EX, f));
  if (!fs.existsSync(df)) { err(f, '-', `問題のファイルがない（${path.relative(ROOT, df)}）`); continue; }
  let ex, qs;
  try { ex = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, '-', 'JSON として読めない：' + e.message); continue; }
  qs = JSON.parse(fs.readFileSync(df, 'utf8'));
  if (!Array.isArray(ex)) { err(f, '-', '配列ではない'); continue; }
  const byText = new Map(qs.map(q => [q.text, q]));
  ex.forEach((e, i) => {
    const q = byText.get(e.text);
    if (!q) return err(f, i, '問題が見つからない（text が一字一句同じか確かめる）：' + String(e.text).slice(0, 30));
    if (typeof e.detail !== 'string' || !e.detail.trim()) return err(f, i, 'detail がない');
    if (/^要確認/.test(e.detail)) { review++; console.log(`？ ${path.relative(ROOT, f)} [${i}] ${e.detail.slice(0, 60)}`); return; }
    const sents = e.detail.split('。').filter(x => x.trim()).length;
    if (sents < 2 || sents > 8) err(f, i, `detail の文の数が ${sents}（3〜6文）`);
    if (!Array.isArray(e.why) || e.why.length !== 4) return err(f, i, 'why がちょうど4つではない');
    e.why.forEach((w, k) => {
      if (k === q.answer && w) err(f, i, `正解（${k}）の why は "" にする`);
      if (k !== q.answer && !String(w || '').trim()) err(f, i, `まちがいの選択肢（${k}）の why がない`);
    });
    for (const s of [e.detail, ...e.why]) for (const b of BAD) if (b.test(s || '')) err(f, i, 'LaTeX・Markdown が入っている：' + b);
    ok++;
  });
  if (ex.length !== qs.length) console.log(`△ ${path.relative(ROOT, f)}：問題 ${qs.length}問のうち ${ex.length}問ぶん`);
}
console.log(`\n解説ファイル ${files}・使える解説 ${ok}問・要確認 ${review}問・だめ ${errs}件`);
process.exit(errs ? 1 : 0);
