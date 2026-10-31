// 本物の曲での答え合わせ： node tests/real-song-eval.js 音声.f32（44.1kHz・ステレオ・32bit float） 正解.json
// 正解.json は [[切り替わりの秒, "コード名"], …]（最後の区間は曲の終わりまで）
import fs from 'node:fs';
import { transcribe } from '../transcribe.js';
import { parseChordName } from '../chord-engine.js';

export function loadAudio(path, sampleRate = 44100) {
  const buf = fs.readFileSync(path);
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const n = f.length / 2;
  const left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) { left[i] = f[2 * i]; right[i] = f[2 * i + 1]; }
  return { channels: [left, right], sampleRate };
}

// 同じコードかどうか（A# と B♭ などの書き方の違い、分数コードのベース音は気にしない）
// dim と dim7 は同じものとして扱う（コード譜では「dim」と書いて dim7 を弾くことが多い）
const kind = (suffix) => (suffix === 'dim7' ? 'dim' : suffix);
// 鳴っている音の組み合わせ（分数コードのベース音も含む）。Em/D と Em7 は同じ音
const pitchSet = (name) => {
  const p = parseChordName(name);
  if (!p) return null;
  const intervals = p.type.suffix === 'dim' ? [0, 3, 6, 9] : p.type.intervals; // dim は dim7 として扱う
  const set = new Set(intervals.map((i) => (p.root + i) % 12));
  set.add(p.bass);
  return [...set].sort((x, y) => x - y).join(',');
};
// 正解：名前（ルートと種類）が同じ、または鳴っている音の組み合わせがまったく同じ
export const same = (a, b) => {
  if (!a || !b) return false;
  const pa = parseChordName(a.split('/')[0]), pb = parseChordName(b.split('/')[0]);
  if (pa && pb && pa.root === pb.root && kind(pa.type.suffix) === kind(pb.type.suffix)) return true;
  // 答えが分数コードでないときは、ベース音を含めずに比べる（ベース音を書いていないだけのことが多い）
  const sa = a.includes('/') && b.includes('/') ? pitchSet(a) : pitchSet(a.split('/')[0]);
  const sb = b.includes('/') ? pitchSet(b) : pitchSet(b.split('/')[0]);
  return Boolean(sa && sb && (sa === sb || pitchSet(a) === pitchSet(b)));
};

export function evaluate(timeline, truth, duration) {
  const segs = truth.map(([start, name], i) => ({ start, end: i + 1 < truth.length ? truth[i + 1][0] : duration, name }));
  const at = (t) => timeline.find((s) => t >= s.start && t < s.end)?.name ?? null;
  let ok = 0, n = 0;
  for (let t = segs[0].start; t < segs[segs.length - 1].end; t += 0.1) {
    const truthName = segs.find((s) => t >= s.start && t < s.end).name;
    n++;
    if (same(at(t), truthName)) ok++;
  }
  const perSeg = segs.map((s) => ({ ...s, got: at((s.start + s.end) / 2) }));
  return { timeRatio: ok / n, segRatio: perSeg.filter((s) => same(s.got, s.name)).length / perSeg.length, perSeg };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [audioPath, truthPath, optsJson] = process.argv.slice(2);
  const { channels, sampleRate } = loadAudio(audioPath);
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  const t0 = Date.now();
  const r = transcribe(channels, sampleRate, JSON.parse(optsJson || '{}'));
  const e = evaluate(r.timeline, truth, channels[0].length / sampleRate);
  console.log(`解析 ${((Date.now() - t0) / 1000).toFixed(1)}秒  テンポ ${r.bpm}  左右分離 ${r.useSide ? 'あり' : 'なし'}  ${JSON.stringify(r.chartInfo)}`);
  console.log(`正しいコードを示していた時間 ${(e.timeRatio * 100).toFixed(1)}%  区間ごとの正解 ${(e.segRatio * 100).toFixed(1)}%（${e.perSeg.filter((s) => same(s.got, s.name)).length}/${e.perSeg.length}）`);
  console.log(e.perSeg.map((s) => `${s.start.toFixed(1)} ${s.name}${same(s.got, s.name) ? '○' : `×(${s.got ?? '-'})`}`).join('  '));
}
