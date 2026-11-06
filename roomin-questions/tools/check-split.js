#!/usr/bin/env node
// 大問を分けたもの（split/ フォルダ）の確かめ機。SPLIT_INSTRUCTIONS.md の「5. 返す前の確かめ」の機械で見られる部分。
//   node roomin-questions/tools/check-split.js
// split/<subject>/<genre>/<unit>.json を、同じ場所の data/…/<unit>.json の問題と見くらべる。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SP = path.join(ROOT, 'split'), DATA = path.join(ROOT, 'data');
const BAD = [/\\frac/, /\$/, /\\\(/, /\\\[/, /\*\*/, /\\sqrt/, /\\times/, /`/];
let files = 0, ok = 0, errs = 0, review = 0;
const err = (f, i, m) => { errs++; console.log(`× ${path.relative(ROOT, f)} [${i}] ${m}`); };
function walk(d) { if (!fs.existsSync(d)) return []; return fs.readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.json') ? [path.join(d, x.name)] : []); }
for (const f of walk(SP)) {
  files++;
  const df = path.join(DATA, path.relative(SP, f));
  if (!fs.existsSync(df)) { err(f, '-', `問題のファイルがない（${path.relative(ROOT, df)}）`); continue; }
  let sp; try { sp = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, '-', 'JSON として読めない：' + e.message); continue; }
  const qs = JSON.parse(fs.readFileSync(df, 'utf8'));
  if (!Array.isArray(sp)) { err(f, '-', '配列ではない'); continue; }
  const byText = new Map(qs.map(q => [q.text, q]));
  sp.forEach((e, i) => {
    const q = byText.get(e.text);
    if (!q) return err(f, i, '問題が見つからない（text が一字一句同じか確かめる）：' + String(e.text).slice(0, 30));
    if (e.note && /^要確認/.test(e.note)) { review++; console.log(`？ ${path.relative(ROOT, f)} [${i}] ${e.note.slice(0, 60)}`); return; }
    if (!Array.isArray(e.steps) || e.steps.length < 2 || e.steps.length > 3) return err(f, i, 'steps が2つか3つではない');
    e.steps.forEach((s, k) => {
      if (!s.ask || String(s.ask).length > 70) err(f, i, `ステップ${k + 1}の ask がないか長すぎる`);
      if (!Array.isArray(s.choices) || s.choices.length !== 4) err(f, i, `ステップ${k + 1}の choices がちょうど4つではない`);
      if (!(s.answer >= 0 && s.answer <= 3)) err(f, i, `ステップ${k + 1}の answer が0〜3ではない`);
      if (new Set(s.choices || []).size !== 4) err(f, i, `ステップ${k + 1}の choices に同じものがある`);
      for (const t of [s.ask, s.hint, ...(s.choices || [])]) for (const b of BAD) if (b.test(t || '')) err(f, i, 'LaTeX・Markdown が入っている：' + b);
    });
    const last = e.steps[e.steps.length - 1];
    if (JSON.stringify(last.choices) !== JSON.stringify(q.choices) || last.answer !== q.answer) err(f, i, '最後のステップの choices・answer が元の問題と同じではない');
    if (e.steps.slice(0, -1).some(s => s.choices?.[s.answer] === q.choices[q.answer])) err(f, i, '途中のステップで元の正解を教えてしまっている');
    ok++;
  });
}
console.log(`\n分けたファイル ${files}・使える問題 ${ok}問・要確認 ${review}問・だめ ${errs}件`);
process.exit(errs ? 1 : 0);
