#!/usr/bin/env node
// ROOMIN 問題バンクの確かめ機。
//   node roomin-questions/tools/check.js          … 全ファイルを検査して、数を表示
//   node roomin-questions/tools/check.js --merge  … 検査に通ったら dist/all.json に1本にまとめる
// 検査の内容は INSTRUCTIONS.md の「5. 返す前の確かめ」の機械で見られる部分。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const GENRES = {
  jp: ['現代文', '古文', '漢文', '言葉（漢字・語彙・文法・敬語）', '文学史'],
  math: ['数学I', '数学A', '数学II', '数学B', '数学III', '数学C'],
  english: ['文法', '語彙・熟語', '会話表現', '発音・アクセント', '読解'],
  chem: ['化学基礎', '化学'],
  physics: ['物理基礎', '物理'],
  bio: ['生物基礎', '生物'],
  earth: ['地学基礎', '地学'],
  social: ['地理総合', '地理探究', '歴史総合', '日本史探究', '世界史探究', '公共', '政治・経済', '倫理'],
};
const KEYS = ['id', 'subject', 'genre', 'unit', 'grade', 'level', 'text', 'choices', 'answer', 'explain'];
const BAD = [/\\frac/, /\$/, /\\\(/, /\\\[/, /\*\*/, /\\sqrt/, /\\times/, /`/];
const BANNED_CHOICES = /^(すべて正しい|どれでもない|全て正しい|上のどれでもない)/;

function walk(dir) {
  let out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out = out.concat(walk(p));
    else if (f.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

let errors = 0, warns = 0;
const err = (f, i, m) => { errors++; console.log(`ERROR ${path.relative(ROOT, f)} #${i + 1}: ${m}`); };
const warn = (f, i, m) => { warns++; if (process.argv.includes('-v')) console.log(`warn  ${path.relative(ROOT, f)} #${i + 1}: ${m}`); };

const all = [];
const stats = {};
const seenText = new Map();

for (const f of walk(DATA)) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, -1, 'JSON が読めない: ' + e.message); continue; }
  if (!Array.isArray(arr)) { err(f, -1, '配列ではない'); continue; }
  const lv = [0, 0, 0, 0];
  let neg = 0;
  arr.forEach((q, i) => {
    const keys = Object.keys(q);
    if (keys.join() !== KEYS.join()) err(f, i, '項目名・順番がちがう: ' + keys.join());
    if (q.id !== null) err(f, i, 'id は null');
    if (!GENRES[q.subject]) err(f, i, 'subject が一覧にない: ' + q.subject);
    else if (!GENRES[q.subject].includes(q.genre)) err(f, i, 'genre が一覧とちがう: ' + q.genre);
    if (!q.unit || typeof q.unit !== 'string') err(f, i, 'unit がない');
    if (!['hs1', 'hs2', 'hs3'].includes(q.grade)) err(f, i, 'grade がおかしい');
    if (![1, 2, 3].includes(q.level)) err(f, i, 'level がおかしい'); else lv[q.level]++;
    if (typeof q.text !== 'string' || !q.text) err(f, i, 'text がない');
    if (!Array.isArray(q.choices) || q.choices.length !== 4) err(f, i, 'choices が4つでない');
    else {
      if (new Set(q.choices).size !== 4) err(f, i, '同じ選択肢がある');
      q.choices.forEach((c) => {
        if (typeof c !== 'string' || !c) err(f, i, '選択肢が文字でない');
        else if (c.length > 45) warn(f, i, '選択肢が長い(' + c.length + '): ' + c);
        if (BANNED_CHOICES.test(c)) err(f, i, '使えない選択肢: ' + c);
      });
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(f, i, 'answer が 0〜3 でない');
    if (typeof q.explain !== 'string' || !q.explain.endsWith('。')) err(f, i, 'explain が「。」で終わっていない');
    else {
      const n = q.explain.split('。').filter(Boolean).length;
      if (n > 4) warn(f, i, 'explain の文が多い(' + n + ')');
      if (/選択肢.{0,3}[0-9０-９]|答えは[0-9０-９]番|[0-3]番の選択肢/.test(q.explain)) err(f, i, 'explain で選択肢の番号を使っている');
    }
    if (q.text && q.text.length > 220) warn(f, i, 'text が長い(' + q.text.length + ')');
    const blob = [q.text, q.explain, ...(q.choices || [])].join('\n');
    for (const r of BAD) if (r.test(blob)) err(f, i, 'LaTeX/Markdown らしき文字: ' + r);
    if (/正しくない|誤っている|あてはまらない|適当でない/.test(q.text || '')) neg++;
    const key = (q.text || '').replace(/\s/g, '');
    if (seenText.has(key)) err(f, i, '同じ問題文が ' + seenText.get(key) + ' にもある');
    else seenText.set(key, path.relative(ROOT, f) + ' #' + (i + 1));
    all.push(q);
    const s = (stats[q.subject] ||= {});
    const g = (s[q.genre] ||= {});
    g[q.unit] = (g[q.unit] || 0) + 1;
  });
  const n = arr.length;
  if (n && neg / n > 0.2 + 1e-9) warn(f, -1, `「正しくないもの」形が2割をこえる (${neg}/${n})`);
  if (n >= 10 && (lv[3] / n > 0.35 || lv[1] / n < 0.25)) warn(f, -1, `難しさの配分 L1=${lv[1]} L2=${lv[2]} L3=${lv[3]}`);
  const ansDist = [0, 0, 0, 0];
  arr.forEach((q) => ansDist[q.answer]++);
}

let total = 0;
for (const [s, gs] of Object.entries(stats)) {
  for (const [g, us] of Object.entries(gs)) {
    const n = Object.values(us).reduce((a, b) => a + b, 0);
    total += n;
    console.log(`${s} / ${g} : ${n}問（${Object.keys(us).length}単元）`);
  }
}
console.log(`合計 ${total}問  エラー ${errors}  注意 ${warns}${warns && !process.argv.includes('-v') ? '（-v でくわしく）' : ''}`);

if (process.argv.includes('--merge')) {
  if (errors) { console.log('エラーがあるのでまとめません'); process.exit(1); }
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', 'all.json'), JSON.stringify(all, null, 0) + '\n');
  console.log('dist/all.json に書き出しました');
}
process.exit(errors ? 1 : 0);
