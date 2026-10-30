// 拍（テンポ）を見つけ、拍・小節ごとにコードを決めて「コード譜」を作る

import { CHORD_TYPES, NOTE_NAMES } from './chord-engine.js';

/**
 * 弾いた瞬間（onsets: [{ t, strength }]）の並びから、曲のテンポと拍の位置を見つける。
 * 1. 弾いた瞬間を 0.01 秒きざみの「勢いの波」にする
 * 2. その波が何秒ごとに繰り返しているか（自己相関）を、1分に 60〜180 拍の範囲で調べる
 * 3. 拍の位置（ずれ）を、弾いた瞬間がいちばん多く重なるように決める
 * 4. それぞれの拍を、近く（±0.06秒）の弾いた瞬間に少し寄せる（演奏の揺れに合わせる）
 */
export function estimateBeats(onsets, duration, { minBpm = 60, maxBpm = 180, preferBpm = 110, phaseShift = 0, fitLine = false } = {}) {
  const res = 0.01;
  const n = Math.ceil(duration / res) + 1;
  const env = new Float32Array(n);
  onsets.forEach(({ t, strength }) => {
    const i = Math.round(t / res);
    if (i >= 0 && i < n) env[i] += strength;
  });
  // 少しぼかして、わずかなずれでも重なるようにする
  const blurred = new Float32Array(n);
  for (let i = 0; i < n; i++) for (let j = -3; j <= 3; j++) if (env[i + j]) blurred[i] += env[i + j] * Math.exp(-(j * j) / 4);

  const scoreLag = (lag) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += blurred[i] * blurred[i + lag];
    return s / (n - lag);
  };
  let best = null;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const lag = Math.round(60 / bpm / res);
    // 拍の倍・半分の長さでも繰り返していれば本物らしい。よくあるテンポ（preferBpm 付近）を少し優先する
    const s = (scoreLag(lag) + 0.5 * scoreLag(lag * 2) + 0.25 * scoreLag(lag * 4))
      * Math.exp(-0.5 * (Math.log2(bpm / preferBpm) / 0.9) ** 2);
    if (!best || s > best.s) best = { bpm, s };
  }
  const period = 60 / best.bpm;

  // 拍の位置：弾いた瞬間を「ほぼ1拍おき」につないでいく道筋のうち、いちばん自然なものを曲全体で探す（動的計画法）。
  // つなぐ瞬間の勢いが大きいほど加点し、間隔が1拍（拍が抜けるときは2拍）からずれるほど減点する。
  // 1拍ずつ合わせていくので、テンポのわずかな誤差や演奏の揺れがたまっていかない
  const meanStrength = onsets.reduce((a, o) => a + o.strength, 0) / Math.max(1, onsets.length);
  const score = new Float64Array(onsets.length);
  const from = new Int32Array(onsets.length).fill(-1);
  for (let i = 0; i < onsets.length; i++) {
    score[i] = onsets[i].strength;
    for (let j = i - 1; j >= 0; j--) {
      const dt = onsets[i].t - onsets[j].t;
      if (dt > period * 2.6) break;
      if (dt < period * 0.6) continue;
      const k = Math.round(dt / period);
      const dev = Math.log2(dt / (k * period));
      const sc = score[j] + onsets[i].strength - meanStrength * (400 * dev * dev + (k - 1) * 0.5);
      if (sc > score[i]) { score[i] = sc; from[i] = j; }
    }
  }
  let last = -1;
  onsets.forEach((o, i) => { if (o.t > duration - period * 2.5 && (last < 0 || score[i] > score[last])) last = i; });
  if (last < 0) last = onsets.length - 1;
  const picked = [];
  for (let i = last; i >= 0; i = from[i]) picked.unshift(onsets[i].t);

  // 録音された曲のテンポはほぼ一定なので、選んだ拍に一直線（t = a + k × 1拍）を当てはめて、拍の間隔と位置を整える
  if (fitLine && picked.length >= 4) {
    const k = picked.map((t) => Math.round((t - picked[0]) / period));
    const mk = k.reduce((a, b) => a + b, 0) / k.length, mt = picked.reduce((a, b) => a + b, 0) / picked.length;
    let num = 0, den = 0;
    k.forEach((kk, i) => { num += (kk - mk) * (picked[i] - mt); den += (kk - mk) ** 2; });
    const slope = den ? num / den : period;
    const a = mt - slope * mk;
    const grid = [];
    for (let kk = Math.ceil((-a - 0.05) / slope); a + kk * slope < duration; kk++) {
      const t = a + kk * slope;
      const near = onsets.filter((o) => Math.abs(o.t - t) < 0.05).sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t))[0];
      grid.push(near ? near.t : Math.max(0, t));
    }
    let beats = grid;
    if (phaseShift === 0.5) beats = beats.slice(0, -1).map((b, i) => (b + beats[i + 1]) / 2);
    return { bpm: Math.round((60 / slope) * 4) / 4, period: slope, beats };
  }

  // 拍が抜けたところ（2拍あいた間）を埋め、最初と最後も1拍ずつ広げる
  let beats = [];
  picked.forEach((t, i) => {
    if (i > 0) {
      const gap = t - picked[i - 1];
      const k = Math.round(gap / period);
      for (let j = 1; j < k; j++) beats.push(picked[i - 1] + (gap * j) / k);
    }
    beats.push(t);
  });
  while (beats.length && beats[0] - period > -0.05) beats.unshift(beats[0] - period);
  while (beats.length && beats[beats.length - 1] + period < duration) beats.push(beats[beats.length - 1] + period);
  if (beats[0] < 0) beats[0] = 0;
  // 裏拍（半拍ずらし）の候補：隣り合う拍の真ん中
  if (phaseShift === 0.5) beats = beats.slice(0, -1).map((b, i) => (b + beats[i + 1]) / 2);
  return { bpm: best.bpm, period, beats };
}

export const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** 4拍ごとに区切ったとき、どの拍が小節の頭か（0〜3）。コードが変わるところが小節の頭になりやすい */
export function findDownbeat(beatChromas) {
  return findDownbeatScored(beatChromas).offset;
}

/** findDownbeat と同じ。コードの変わり目が小節の頭にどれだけきれいにそろったか（score）も返す */
export function findDownbeatScored(beatChromas) {
  let best = 0, bestScore = -Infinity;
  for (let offset = 0; offset < 4; offset++) {
    let s = 0;
    for (let b = offset; b < beatChromas.length; b += 4) {
      if (b < 2 || b + 2 > beatChromas.length) continue;
      const before = beatChromas[b - 2].map((v, i) => v + beatChromas[b - 1][i]);
      const after = beatChromas[b].map((v, i) => v + beatChromas[b + 1][i]);
      s += 1 - cosine(before, after);
    }
    const count = Math.max(1, Math.floor((beatChromas.length - offset) / 4));
    s /= count;
    if (s > bestScore) { bestScore = s; best = offset; }
  }
  return { offset: best, score: bestScore };
}

const RARE = new Set(['sus4', 'sus2', 'dim', 'dim7', 'aug', 'm7♭5', '7sus4']);

// コード譜の候補（12音 × コードの種類）。パワーコードは、コード譜では使わない
export const STATES = [];
for (let root = 0; root < 12; root++) {
  CHORD_TYPES.forEach((type, typeIndex) => {
    if (type.suffix === '5') return;
    const template = new Array(12).fill(0);
    type.intervals.forEach((i) => { template[(root + i) % 12] = 1; });
    STATES.push({ root, type, typeIndex, template, name: NOTE_NAMES[root] + type.suffix });
  });
}

/**
 * 拍ごとの音の強さ（chroma）から、拍ごとのコードを決める（ビタビ法）。
 * 「その拍の音にどれだけ合うか」に加えて、
 * - コードはそう頻繁には変わらない（変わるたびに減点）
 * - 変わるなら小節の頭が多く、次が小節の真ん中（3拍目）。それ以外の拍で変わるのは珍しい
 * という音楽の決まりを点数にして、曲全体でいちばん自然なコードの並びを選ぶ。
 */
/**
 * 12音の強さ（chroma）とベース音から、コードの候補（STATES）それぞれの点数を出す。
 * 曲の解析（拍ごと）とマイク（その瞬間ごと）の両方で使う。
 */
export function scoreStates(c, bass, { rootBonus = 0.1, foreignBassPenalty = 0.1, tensionPenalty = 0.03, extraTonePenalty = 0.02, rarePenalty = 0.08 } = {}) {
  const total = c.reduce((a, b) => a + b, 0);
  return STATES.map((st) => {
    if (!total) return 0;
    // ベース音（いちばん低い音）は歌に邪魔されにくく、多くはコードのルート（土台の音）を弾いている
    const bassTerm = bass === null || bass === undefined ? 0 : bass === st.root ? rootBonus : st.template[bass] ? 0 : -foreignBassPenalty;
    // 3音より多いコード（7th・6th・9th など）は、メロディの音を構成音と取り違えやすいので、音の数に応じて控えめにする
    const extra = Math.max(0, st.type.intervals.length - 3);
    // sus4・sus2・dim・aug などは実際の曲では少ないので、はっきりした証拠があるときだけ選ぶ
    const rare = RARE.has(st.type.suffix) ? rarePenalty : 0;
    return cosine(c, st.template) + bassTerm - (st.type.tension ? tensionPenalty : 0) - extra * extraTonePenalty - rare - st.typeIndex * 0.001;
  });
}

export function decodeChords(beatChromas, downbeat, { beatBass = [], changePenalty = 0.12, offBarPenalty = 0.25, halfBarPenalty = 0.08, ...scoreOptions } = {}) {
  const n = beatChromas.length;
  if (!n) return [];
  const emit = beatChromas.map((c, b) => scoreStates(c, beatBass[b], scoreOptions));
  let score = emit[0].slice();
  const back = [];
  for (let b = 1; b < n; b++) {
    const pos = ((b - downbeat) % 4 + 4) % 4;
    const cost = changePenalty + (pos === 0 ? 0 : pos === 2 ? halfBarPenalty : offBarPenalty);
    let bestPrev = 0;
    for (let j = 1; j < STATES.length; j++) if (score[j] > score[bestPrev]) bestPrev = j;
    const next = new Array(STATES.length);
    const from = new Array(STATES.length);
    for (let j = 0; j < STATES.length; j++) {
      const stay = score[j];
      const change = score[bestPrev] - cost;
      if (stay >= change) { next[j] = stay + emit[b][j]; from[j] = j; } else { next[j] = change + emit[b][j]; from[j] = bestPrev; }
    }
    score = next;
    back.push(from);
  }
  let j = 0;
  for (let k = 1; k < STATES.length; k++) if (score[k] > score[j]) j = k;
  const path = new Array(n);
  path[n - 1] = j;
  for (let b = n - 1; b > 0; b--) { j = back[b - 1][j]; path[b - 1] = j; }
  return path.map((k) => STATES[k]);
}

/**
 * 拍ごとのコードを、コード譜（区間の並び）にまとめる。ベース音がルートと違えば分数コード（C/E など）にする。
 * beatBass：拍ごとのいちばん低い音（12音のどれか、または null）
 */
export function buildChart(beats, states, beatBass, period) {
  const segments = [];
  states.forEach((st, b) => {
    const start = beats[b];
    const end = b + 1 < beats.length ? beats[b + 1] : beats[b] + period;
    const last = segments[segments.length - 1];
    if (last && last.state === st) { last.end = end; last.basses.push(beatBass[b]); } else segments.push({ state: st, start, end, basses: [beatBass[b]] });
  });
  // 1.5拍より短いコードは、読みにくいうえに誤判定のことが多いので、前（最初なら次）のコードにまとめる
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (segments.length < 2 || seg.end - seg.start >= period * 1.5) continue;
    const target = i > 0 ? segments[i - 1] : segments[i + 1];
    target.start = Math.min(target.start, seg.start);
    target.end = Math.max(target.end, seg.end);
    target.basses.push(...seg.basses);
    segments.splice(i, 1);
    i -= 1;
  }
  // まとめた結果、隣どうしが同じコードになったら1つにする
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].state !== segments[i - 1].state) continue;
    segments[i - 1].end = segments[i].end;
    segments[i - 1].basses.push(...segments[i].basses);
    segments.splice(i, 1);
    i -= 1;
  }
  return segments.map(({ state, start, end, basses }) => {
    // 区間の中でいちばん多かったベース音（構成音にあるときだけ分数コードにする）
    const counts = new Map();
    basses.filter((x) => x !== null && x !== undefined).forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    const bass = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const slash = bass !== undefined && bass !== state.root && state.template[bass] ? `/${NOTE_NAMES[bass]}` : '';
    return { name: state.name + slash, root: state.root, suffix: state.type.suffix, start, end };
  });
}
