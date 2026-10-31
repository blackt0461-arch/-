// 「前の音を掃除する判定器」を学習させる
//   node tests/learn/train.js 材料.json
// 拍ごとに、12音名それぞれについて「この音は今のコードに本当に入っているか」を答える小さなニューラルネット。
// 入力は、その音名から見た（その音名を 0 として回した）
//   今の拍の音・弾いた瞬間の音・前の拍の音・次の拍の音（各12）、ベース音（12＋無し）、小節の中の位置（4）
// どの音名にも同じネットを使うので、C でも F# でも同じように判断できる（少ない材料でも学習しやすい）
import fs from 'node:fs';
import { featuresFor } from '../../learned.js';

const rows = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/claude-0/learn-data.json', 'utf8'));
const H = Number(process.env.HIDDEN || 16);
// 材料を作る（曲ごとに 5 曲に 1 曲は確認用にとっておく）
const train = [], valid = [];
rows.forEach((song, si) => {
  const b = song.beats;
  if (!b?.length) return;
  const chromas = b.map((x) => x.chroma), attacks = b.map((x) => x.attack), basses = b.map((x) => x.bass), bars = b.map((x) => x.bar);
  b.forEach((x, k) => {
    if (!x.target) return;
    // 確認用：知らない演奏者（GuitarSet の演奏者 03）と、合成曲の一部。覚えすぎ（演奏者のクセを覚える）に気づけるように
    const isValid = song.kind === 'guitarset' ? song.id.startsWith('03_') : si % 5 === 4;
    for (let p = 0; p < 12; p++) (isValid ? valid : train).push({ x: featuresFor(chromas, attacks, basses, bars, k, p), y: x.target.includes(p) ? 1 : 0, song: si, k, p });
  });
});
const D = train[0].x.length;
console.log(`入力 ${D} 個・学習 ${train.length / 12} 拍・確認 ${valid.length / 12} 拍`);

// 小さなネット：入力 → 隠れ層（H 個）→ 1 つの確率
let seed = Number(process.env.SEED || 7);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const W1 = Array.from({ length: H }, () => Array.from({ length: D }, () => rnd() * 0.3)), b1 = new Array(H).fill(0);
const W2 = Array.from({ length: H }, () => rnd() * 0.3); let b2 = 0;
const forward = (x) => { const h = W1.map((w, j) => Math.tanh(w.reduce((a, v, i) => a + v * x[i], b1[j]))); const z = h.reduce((a, v, j) => a + v * W2[j], b2); return { h, p: 1 / (1 + Math.exp(-z)) }; };
// Adam で学習
const params = [...W1.map((w) => ({ w })), { w: b1 }, { w: W2 }];
const m = new Map(), v = new Map();
let t = 0, lr = 0.01;
const step = (grads) => {
  t++;
  grads.forEach(([arr, g]) => {
    if (!m.has(arr)) { m.set(arr, new Float64Array(arr.length)); v.set(arr, new Float64Array(arr.length)); }
    const mm = m.get(arr), vv = v.get(arr);
    for (let i = 0; i < arr.length; i++) {
      mm[i] = 0.9 * mm[i] + 0.1 * g[i]; vv[i] = 0.999 * vv[i] + 0.001 * g[i] * g[i];
      arr[i] -= (lr * (mm[i] / (1 - 0.9 ** t))) / (Math.sqrt(vv[i] / (1 - 0.999 ** t)) + 1e-8);
    }
  });
};
let b2arr = [b2];
const evaluate = (set) => {
  let loss = 0, ok = 0;
  set.forEach((s) => { const { p } = forward(s.x); loss -= s.y ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9); if ((p > 0.5) === (s.y === 1)) ok++; });
  return { loss: loss / set.length, acc: ok / set.length };
};
const epochs = Number(process.env.EPOCHS || 30), batch = 64, l2 = Number(process.env.L2 || 1e-4);
for (let e = 0; e < epochs; e++) {
  for (let i = train.length - 1; i > 0; i--) { const j = Math.floor((rnd() + 0.5) * (i + 1)); [train[i], train[j]] = [train[j], train[i]]; }
  for (let s = 0; s < train.length; s += batch) {
    const gW1 = W1.map(() => new Float64Array(D)), gb1 = new Float64Array(H), gW2 = new Float64Array(H), gb2 = new Float64Array(1);
    const part = train.slice(s, s + batch);
    part.forEach(({ x, y }) => {
      const { h, p } = forward(x);
      const dz = (p - y) / part.length;
      for (let j = 0; j < H; j++) {
        gW2[j] += dz * h[j];
        const dh = dz * W2[j] * (1 - h[j] * h[j]);
        gb1[j] += dh;
        for (let i = 0; i < D; i++) if (x[i]) gW1[j][i] += dh * x[i];
      }
      gb2[0] += dz;
    });
    W1.forEach((w, j) => w.forEach((val, i) => { gW1[j][i] += l2 * val; }));
    b2arr[0] = b2;
    step([...W1.map((w, j) => [w, gW1[j]]), [b1, gb1], [W2, gW2], [b2arr, gb2]]);
    b2 = b2arr[0];
  }
  if (e % 5 === 4 || e === epochs - 1) { const tr = evaluate(train), va = evaluate(valid.filter((x) => rows[x.song].kind === 'guitarset')); console.log(`${e + 1}回目  学習 ${(tr.acc * 100).toFixed(1)}%  確認 ${(va.acc * 100).toFixed(1)}%（損失 ${va.loss.toFixed(3)}）`); }
  lr *= 0.93;
}
// 比べる基準：今のやり方（音の強さが最大の 35% 以上なら「入っている」）
const vg = valid.filter((x) => rows[x.song].kind === 'guitarset');
let base = 0; vg.forEach((s) => { if ((s.x[0] >= 0.35) === (s.y === 1)) base++; });
console.log(`（くらべる基準：音の強さだけで決めた場合 ${(base / vg.length * 100).toFixed(1)}%）`);
const round = (a) => a.map((x) => Math.round(x * 1e4) / 1e4);
// WRITE_MODEL=1 なら、学んだ重みを learned.js の MODEL に書き込む
const model = { D, H, W1: W1.map(round), b1: round(b1), W2: round(W2), b2: Math.round(b2 * 1e4) / 1e4 };
// （learned.js への書き込みは tests/learn/ensemble.js で行う）
fs.writeFileSync(process.env.OUT || '/tmp/claude-0/chroma-model.json', JSON.stringify({ D, H, W1: W1.map(round), b1: round(b1), W2: round(W2), b2: Math.round(b2 * 1e4) / 1e4 }));
