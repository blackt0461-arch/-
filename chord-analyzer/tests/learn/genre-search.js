// ジャンルごとに効く設定を探す
//   node tests/learn/genre-search.js ジャンル名（BN / Funk / Jazz / Rock / SS）
// 1. 調整用の演奏者（00〜03）の、そのジャンルの全部の曲で、候補の設定をそれぞれ採点する
// 2. いちばん良かった設定を、知らない演奏者（04・05）で、今の設定と比べる（ここで良くならなければ採用しない）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const style = process.argv[2];
const candidates = JSON.parse(fs.readFileSync(path.join(here, 'genre-candidates.json'), 'utf8'));
const run = (options, set) => {
  const dump = `/tmp/claude-0/genre-${style}-${Date.now()}.json`;
  execFileSync('node', [path.join(here, '../eval/eval.js'), '--full', '--dry'], { env: { ...process.env, OPTIONS: JSON.stringify(options), ONLY: `・${style}`, SET: set, DUMP: dump }, stdio: 'ignore' });
  const rows = JSON.parse(fs.readFileSync(dump, 'utf8')).filter((r) => !r.error);
  const avg = (k) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return { chord: avg('chord'), notes: avg('notes'), shortNotes: avg('shortNotes'), n: rows.length };
};
// 点数：コードと1音ずつの平均（どちらかが下がる設定を選ばないよう、両方を見る）
const score = (r) => ((r.chord ?? 0) + (r.notes ?? 0)) / 2;
const pct = (x) => (x == null ? '―' : `${(x * 100).toFixed(1)}%`);
console.log(`== ${style}：調整用の演奏者で候補を比べる`);
const results = [];
for (const [name, options] of Object.entries(candidates)) {
  const r = run(options, '調整用');
  results.push({ name, options, r });
  console.log(`${name.padEnd(20)} コード ${pct(r.chord)}  1音ずつ ${pct(r.notes)}  短い音 ${pct(r.shortNotes)}  点数 ${pct(score(r))}`);
}
const base = results.find((x) => x.name === '今の設定');
const best = results.reduce((a, b) => (score(b.r) > score(a.r) ? b : a));
console.log(`→ 調整用でいちばん良い：${best.name}（今の設定より ${((score(best.r) - score(base.r)) * 100).toFixed(1)} ポイント）`);
if (best === base) { console.log('→ 今の設定のままにする'); process.exit(0); }
console.log(`== ${style}：知らない演奏者で確かめる`);
const t0 = run(base.options, '本番テスト'), t1 = run(best.options, '本番テスト');
console.log(`今の設定 コード ${pct(t0.chord)} 1音ずつ ${pct(t0.notes)}  ／  ${best.name} コード ${pct(t1.chord)} 1音ずつ ${pct(t1.notes)}`);
const ok = score(t1) > score(t0) && (t1.chord ?? 0) >= (t0.chord ?? 0) - 0.01 && (t1.notes ?? 0) >= (t0.notes ?? 0) - 0.01;
console.log(ok ? `→ 採用してよい：${JSON.stringify(best.options)}` : '→ 知らない演奏者では良くならないので採用しない');
fs.writeFileSync(`/tmp/claude-0/genre-result-${style}.json`, JSON.stringify({ style, best: best.name, options: best.options, ok, tune: results.map((x) => ({ name: x.name, ...x.r })), test: { base: t0, best: t1 } }, null, 1));
