#!/usr/bin/env node
// 下書き（src/*.txt）から data/<subject>/<genre>/<unit>.json を作る。
//   node roomin-questions/tools/build.js
// 下書きの書き方:
//   @ math ;; 数学I ;; 数と式 ;; hs1        ← ここから下の問題の教科・ジャンル・単元・学年
//   1 ;; 問題文 ;; *正解 ;; まちがい ;; まちがい ;; まちがい ;; 解説
//   ↑ level（学年を変えるときは 2@hs2 のように書く）。正解の頭に * をつける。
//   問題文の改行は \n と書く。# で始まる行はメモ。
// 正解の位置は問題文から決まる（毎回同じ）。アプリは表示のたびに並びをまぜる。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DATA = path.join(ROOT, 'data');

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const out = new Map();
let bad = 0;
for (const name of fs.readdirSync(SRC).filter((f) => f.endsWith('.txt')).sort()) {
  const lines = fs.readFileSync(path.join(SRC, name), 'utf8').split('\n');
  let head = null;
  lines.forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const where = `${name}:${n + 1}`;
    const parts = line.replace(/^@/, '').split(';;').map((s) => s.trim());
    if (line.startsWith('@')) {
      const [subject, genre, unit, grade] = parts;
      head = { subject, genre, unit, grade };
      return;
    }
    if (!head) { console.log('見出し(@)がない ' + where); bad++; return; }
    if (parts.length !== 7) { console.log(`区切りが ${parts.length} 個 ${where}`); bad++; return; }
    const [lv, text, ...rest] = parts;
    const explain = rest.pop();
    const [lvl, grade] = lv.split('@');
    const correct = rest.filter((c) => c.startsWith('*'));
    if (correct.length !== 1) { console.log('正解(*)が1つでない ' + where); bad++; return; }
    const right = correct[0].slice(1).trim();
    const wrong = rest.filter((c) => !c.startsWith('*'));
    const t = text.replace(/\\n/g, '\n');
    const pos = hash(t) % 4;
    const choices = wrong.slice();
    choices.splice(pos, 0, right);
    const q = {
      id: null, subject: head.subject, genre: head.genre, unit: head.unit,
      grade: grade || head.grade, level: Number(lvl), text: t, choices, answer: pos, explain,
    };
    const key = `${head.subject}/${head.genre}/${head.unit}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(q);
  });
}

const fname = (s) => s.replace(/[\\/:*?"<>|]/g, '_');
for (const [key, arr] of out) {
  const [s, g, u] = key.split('/');
  const dir = path.join(DATA, s, fname(g));
  fs.mkdirSync(dir, { recursive: true });
  const body = '[\n' + arr.map((q) => '  ' + JSON.stringify(q)).join(',\n') + '\n]\n';
  fs.writeFileSync(path.join(dir, fname(u) + '.json'), body);
}
console.log(`${out.size} 単元を書き出しました${bad ? `（下書きのまちがい ${bad} 件）` : ''}`);
process.exit(bad ? 1 : 0);
