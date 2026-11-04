// 物理以外の教科の問題（4択）。教科ごとのファイルに分けて、ここでまとめる。
// 1問の形：
// {
//   id: 'math-001',            // 教科ごとに重ならない
//   unit: '二次関数',           // 単元（記録の分類）
//   grade: 'hs1' | 'hs2',      // 学年の目安（高1／高2）
//   level: 1 | 2 | 3,          // 難しさ（1=基本 2=標準 3=発展）
//   text: '問題文',             // 改行は \n。数式はふつうの文字で（x²、√2、½ など）
//   choices: ['A', 'B', 'C', 'D'], // 4つ。並びは画面で毎回まぜる
//   answer: 0,                 // choices の中の正解の番号（0〜3）
//   explain: '解き方の説明（短く）',
// }
import { PROBLEMS as math } from './math.js';
import { PROBLEMS as english } from './english.js';
import { PROBLEMS as chem } from './chem.js';
import { PROBLEMS as jp } from './jp.js';
import { PROBLEMS as social } from './social.js';

const ok = (p) => p && p.id && p.text && Array.isArray(p.choices) && p.choices.length === 4 && p.answer >= 0 && p.answer < 4;
export const SUBJECT_PROBLEMS = { math: math.filter(ok), english: english.filter(ok), chem: chem.filter(ok), jp: jp.filter(ok), social: social.filter(ok) };
