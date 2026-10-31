// 自動採点：全部のデータを解析して、種類ごとの成績表と前回との比較を出す
//   node tests/eval/eval.js            … ふだんの採点（データの一部で素早く）
//   node tests/eval/eval.js --full     … 全部のデータで採点（節目に）
//   OPTIONS='{"precise":false}' node tests/eval/eval.js  … 解析の設定を変えて試す
// データの場所：GUITARSET（既定 /tmp/claude-0/guitarset）、REAL_SONGS（既定 /tmp/claude-0/realsong*）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const full = args.includes('--full');
const options = JSON.parse(process.env.OPTIONS || '{}');
const label = (args.find((a) => a.startsWith('--label=')) || '--label=').slice(8);
const jobs = [];

// 1. GuitarSet：演奏者 00〜03 は調整用、04・05 は本番テスト用（知らない人の演奏でも通用するかを見る）
const gsDir = process.env.GUITARSET || '/tmp/claude-0/guitarset';
const gsJson = path.join(gsDir, 'guitarset.json');
if (fs.existsSync(gsJson)) {
  const clips = JSON.parse(fs.readFileSync(gsJson, 'utf8'));
  clips.forEach((c, i) => {
    const audio = path.join(gsDir, 'audio', `${c.id}_mic.wav`);
    if (!fs.existsSync(audio)) return;
    if (!full && i % 12 !== 0 && i % 12 !== 7) return; // ふだんは 6 曲に 1 曲（伴奏とソロの両方が入るように選ぶ・60 曲）
    jobs.push({
      kind: 'guitarset', id: c.id, audio, solo: c.mode === 'solo', set: ['04', '05'].includes(c.player) ? '本番テスト' : '調整用',
      category: `研究用・${c.mode === 'comp' ? '伴奏' : 'ソロ'}・${c.style}`,
      truth: { chords: c.chords, notes: c.notes, tempo: c.tempo, duration: c.duration },
    });
  });
}

// 2. 本物の曲（あなたの画面収録。手元にあるときだけ）：動画の表示は演奏より 0.2 秒早いので、その分ずらして採点する
for (const dir of ['/tmp/claude-0/realsong', '/tmp/claude-0/realsong2']) {
  const audio = path.join(dir, 'audio.f32'), truthPath = path.join(dir, 'truth.json');
  if (!fs.existsSync(audio) || !fs.existsSync(truthPath)) continue;
  const chords = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  jobs.push({ kind: 'real', id: path.basename(dir), audio, set: '調整用', category: '本物の曲（動画）', offset: 0.2, truth: { chords } });
}

// 3. 合成の曲：seed 1〜6 は調整用、7〜10 は本番テスト用
const conditions = [['合成・ギターだけ', { withBand: false }], ['合成・バンド', { stereo: true }], ['合成・弾き語り', { stereo: false }], ['合成・歌が大きい', { stereo: false, vocalGain: 0.25 }],
  ['合成・2拍ごとに切り替え', { stereo: true, changesPerBar: 2 }], ['合成・1拍ごとに切り替え', { withBand: false, changesPerBar: 4 }]];
for (const [category, so] of conditions) {
  for (let seed = 1; seed <= 10; seed++) {
    if (!full && seed % 2 === 0) continue;
    jobs.push({ kind: 'synth', id: `${category}-${seed}`, song: { ...so, seed }, set: seed >= 7 ? '本番テスト' : '調整用', category });
  }
}

// CPU の数だけ同時に採点する
const results = [];
const started = Date.now();
await new Promise((resolve) => {
  let next = 0, running = 0;
  const workers = Math.max(1, Math.min(os.cpus().length, jobs.length));
  for (let w = 0; w < workers; w++) {
    const worker = new Worker(path.join(here, 'worker.js'));
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); if (--running === 0) resolve(); return; }
      worker.postMessage({ job: jobs[next++], options });
    };
    worker.on('message', (r) => {
      results.push(r);
      process.stderr.write(`\r採点中 ${results.length}/${jobs.length}`);
      feed();
    });
    running++;
    feed();
  }
});
process.stderr.write('\n');

// 集計：種類ごと・調整用／本番テストごとの平均
const avg = (list, key) => { const v = list.map((r) => r[key]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const summarize = (list) => ({ count: list.length, chord: avg(list, 'chord'), chordStrict: avg(list, 'chordStrict'), chordMajmin: avg(list, 'chordMajmin'), notes: avg(list, 'notes'), tempo: avg(list, 'tempo'), rhythm: avg(list, 'rhythm'), strumKind: avg(list, 'strumKind'), duration: avg(list, 'duration'), chordEdge: avg(list, 'chordEdge'), changes: avg(list, 'changes'), shortNotes: avg(list, 'shortNotes'), fromPrev: avg(list, 'fromPrev') });
const ok = results.filter((r) => !r.error);
const categories = [...new Set(ok.map((r) => r.category))].sort();
const summary = {
  date: new Date().toISOString(), label, full, options,
  overall: summarize(ok), tune: summarize(ok.filter((r) => r.set === '調整用')), test: summarize(ok.filter((r) => r.set === '本番テスト')),
  categories: Object.fromEntries(categories.map((c) => [c, summarize(ok.filter((r) => r.category === c))])),
  errors: results.filter((r) => r.error).map((r) => `${r.id}: ${r.error.split('\n')[0]}`),
  minutes: (Date.now() - started) / 60000,
};

// 前回（同じ範囲：ふだん／全部）と比べる
const histDir = path.join(here, 'history');
fs.mkdirSync(histDir, { recursive: true });
const previous = fs.readdirSync(histDir).filter((f) => f.endsWith(full ? '-full.json' : '-quick.json')).sort().pop();
const prev = previous ? JSON.parse(fs.readFileSync(path.join(histDir, previous), 'utf8')) : null;
const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '  ―  ');
const diff = (a, b) => (typeof a === 'number' && typeof b === 'number' ? `${a >= b ? '+' : ''}${((a - b) * 100).toFixed(1)}` : '');
const row = (name, s, p) => `${name.padEnd(22, '　')} コード ${pct(s.chord).padStart(6)} ${diff(s.chord, p?.chord).padStart(6)}  （厳しく ${pct(s.chordStrict)}）  1音ずつ ${pct(s.notes).padStart(6)} ${diff(s.notes, p?.notes).padStart(6)}  テンポ ${pct(s.tempo)}  ${s.count}曲${s.rhythm != null ? `\n${''.padEnd(22, '　')}   再生のリズム ${pct(s.rhythm)} ${diff(s.rhythm, p?.rhythm)}  和音/1音 ${pct(s.strumKind)}  長さ ${pct(s.duration)} ${diff(s.duration, p?.duration)}` : ''}${s.chordEdge != null || s.shortNotes != null ? `\n${''.padEnd(22, '　')}   切り替わり直後 ${pct(s.chordEdge)} ${diff(s.chordEdge, p?.chordEdge)}  切り替わり発見 ${pct(s.changes)} ${diff(s.changes, p?.changes)}  短い音 ${pct(s.shortNotes)} ${diff(s.shortNotes, p?.shortNotes)}  間違いのうち前のコードが原因 ${pct(s.fromPrev)}` : ''}`;
console.log(`\n=== 成績表（${full ? '全部' : 'ふだん'}・${summary.minutes.toFixed(1)}分）${label ? ` ${label}` : ''} ===`);
console.log(row('全体', summary.overall, prev?.overall));
console.log(row('調整用', summary.tune, prev?.tune));
console.log(row('本番テスト', summary.test, prev?.test));
console.log('--- 種類ごと ---');
for (const c of categories) console.log(row(c, summary.categories[c], prev?.categories?.[c]));
if (summary.errors.length) console.log('エラー:', summary.errors.slice(0, 5).join(' / '));

// 採用してよいか：全体と本番テストが下がっておらず、どの種類も 2 ポイント以上は下がっていない
if (prev) {
  // コード譜と1音ずつの両方で、全体・本番テストが下がっておらず、どの種類も 2 ポイント以上は下がっていないこと
  const keys = [['chord', 'コード'], ['notes', '1音ずつ'], ['rhythm', '再生のリズム'], ['chordEdge', '切り替わり直後'], ['shortNotes', '短い音']];
  const drops = [];
  for (const c of categories) for (const [k, name] of keys) {
    const before = prev.categories?.[c]?.[k], now = summary.categories[c][k];
    if (typeof before === 'number' && typeof now === 'number' && now < before - 0.02) drops.push(`${c}（${name} ${((now - before) * 100).toFixed(1)}）`);
  }
  const worse = keys.filter(([k]) => typeof prev.overall[k] === 'number' && (summary.overall[k] < prev.overall[k] - 0.002 || (typeof prev.test[k] === 'number' && summary.test[k] < prev.test[k] - 0.002))).map(([, n]) => n);
  console.log(!worse.length && !drops.length ? '→ 採用してよい（コード・1音ずつとも、全体・本番テストが下がらず、大きく下がった種類も無い）'
    : `→ 採用しない（${worse.length ? `${worse.join('・')}の全体か本番テストが下がった ` : ''}${drops.length ? `大きく下がった種類：${drops.join('・')}` : ''}）`);
}
if (!args.includes('--dry')) fs.writeFileSync(path.join(histDir, `${summary.date.replace(/[:.]/g, '-')}-${full ? 'full' : 'quick'}.json`), JSON.stringify(summary, null, 1));
