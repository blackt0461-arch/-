// マイクの音を聞き取り、12音の強さ（クロマ）とベース音を求める

import { frequencyToMidi } from './chord-engine.js';

const MIN_FREQ = 60;      // Drop D の6弦(73Hz)より少し下
const MAX_FREQ = 4000;    // 倍音も使うので高めまで見る
const PEAK_RATIO = 0.005; // いちばん強い山に対して、これより弱い山は雑音として無視
const LOWEST_NOTE = 38;   // D2（Drop D の6弦）
const HIGHEST_NOTE = 86;  // D6
const HARMONICS = 8;
const MAX_NOTES = 7;
const ONSET_WAIT_MS = 150;

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

/** 音の山（ピーク）を拾う。放物線補間で頂点の周波数を細かく求める */
function findPeaks(magnitudes, binHz) {
  const lo = Math.max(1, Math.floor(MIN_FREQ / binHz));
  const hi = Math.min(magnitudes.length - 2, Math.ceil(MAX_FREQ / binHz));
  let max = 0;
  for (let k = lo; k <= hi; k++) max = Math.max(max, magnitudes[k]);
  const peaks = [];
  if (max === 0) return peaks;
  for (let k = lo; k <= hi; k++) {
    const b = magnitudes[k];
    if (b < max * PEAK_RATIO || b < magnitudes[k - 1] || b <= magnitudes[k + 1]) continue;
    const a = magnitudes[k - 1], c = magnitudes[k + 1];
    const denom = a - 2 * b + c;
    const offset = denom === 0 ? 0 : 0.5 * (a - c) / denom;
    peaks.push({ freq: (k + offset) * binHz, mag: b / max });
  }
  return peaks;
}

/** ギター全体のチューニングのずれ（セント）を、強い山の平均的なずれから推定する */
function estimateTuningCents(peaks) {
  let x = 0, y = 0;
  peaks.forEach((p) => {
    if (p.freq > 1000) return; // 高い倍音は弦の硬さで上にずれるので使わない
    const dev = frequencyToMidi(p.freq) - Math.round(frequencyToMidi(p.freq));
    x += p.mag * Math.cos(2 * Math.PI * dev);
    y += p.mag * Math.sin(2 * Math.PI * dev);
  });
  return (Math.atan2(y, x) / (2 * Math.PI)) * 100;
}

/**
 * FFT の振幅（線形）から、鳴っている音を推定してクロマとベース音を求める。
 *
 * 1つの弦の音は「基音 f と、その 2f, 3f, 4f… の倍音」のまとまりになる。
 * そこで各音の候補について倍音の強さを合計し（倍音加算）、いちばん強い音から順に確定して、
 * 確定した音の倍音を差し引いていく。これで倍音を別の音と間違えにくくなり、
 * スマホのマイクで基音が小さく拾われる低音弦も、倍音の助けで見つけられる。
 */
export function analyzeSpectrum(magnitudes, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  const peaks = findPeaks(magnitudes, binHz);
  if (peaks.length === 0) return { chroma: new Array(12).fill(0), bass: null, notes: [] };

  const tuning = estimateTuningCents(peaks);
  const remaining = peaks.map((p) => p.mag);

  // 周波数 f に近い山（許容 tol セント以内）の番号。見つからなければ -1
  const nearest = (f, tolCents) => {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < peaks.length; i++) {
      const d = Math.abs(1200 * Math.log2(peaks[i].freq / f));
      if (d < tolCents && d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  };

  // 各音の候補について、倍音に当たる山の番号を先に求めておく
  const candidates = [];
  for (let m = LOWEST_NOTE; m <= HIGHEST_NOTE; m++) {
    const f0 = midiToFreq(m + tuning / 100);
    const partials = [];
    for (let h = 1; h <= HARMONICS; h++) {
      const f = h * f0 * (1 + 0.0001 * h * h); // 弦の硬さで高い倍音ほど少し上にずれる
      if (f > MAX_FREQ) break;
      partials.push(nearest(f, h === 1 ? 35 : 45));
    }
    // 基音の山が無い候補は「別の音の倍音の一部」とみなして除外
    if (partials[0] >= 0) candidates.push({ midi: m, partials });
  }

  const salience = (c) => c.partials.reduce((sum, idx, i) => (idx < 0 ? sum : sum + Math.sqrt(remaining[idx]) / (i + 1) ** 0.5), 0)
    * (c.partials.slice(1, 4).some((idx) => idx >= 0) ? 1 : 0.5); // 倍音を1つも持たない山は弱める

  const notes = [];
  let first = 0;
  while (notes.length < MAX_NOTES) {
    let best = null, bestS = 0;
    candidates.forEach((c) => {
      if (notes.some((n) => n.midi === c.midi)) return;
      const s = salience(c);
      if (s > bestS) { best = c; bestS = s; }
    });
    if (!best) break;
    if (notes.length === 0) first = bestS;
    else if (bestS < first * 0.25) break;
    notes.push({ midi: best.midi, strength: bestS });
    // 確定した音の倍音を差し引く（別の弦の音が同じ周波数にあるかもしれないので少し残す）
    best.partials.forEach((idx, i) => { if (idx >= 0) remaining[idx] *= i === 0 ? 0 : 0.35; });
  }

    // ベース音：スマホのマイクでは低音弦の基音が小さくなり、上の処理で取りこぼしやすい。
  // そこで「基音と 2倍・3倍の倍音がそろっている、いちばん低い音」を別に探す
  let lowest = notes.reduce((lo, n) => (lo === null || n.midi < lo.midi ? n : lo), null);
  const bassCandidate = candidates.find((c) => c.partials[1] >= 0 && c.partials[2] >= 0
    && peaks[c.partials[0]].mag > 0.01 && peaks[c.partials[1]].mag + peaks[c.partials[2]].mag > 0.1);
  if (bassCandidate && (!lowest || bassCandidate.midi < lowest.midi)) {
    lowest = { midi: bassCandidate.midi, strength: first * 0.5 };
    if (!notes.some((n) => (n.midi - lowest.midi) % 12 === 0)) notes.push(lowest);
  }
  const bass = lowest ? ((lowest.midi % 12) + 12) % 12 : null;

  const chroma = new Array(12).fill(0);
  notes.forEach((n) => { chroma[((n.midi % 12) + 12) % 12] += n.strength; });

  return { chroma, bass, notes: notes.map((n) => n.midi) };
}

/**
 * 雑音の覚え方と差し引き方。
 * 弾いていない間の周波数ごとの雑音の大きさを覚えておき、音を分析する前に差し引く
 * （スペクトル減算）。エアコンの「サー」や電源の「ブーン」のような、ずっと鳴っている雑音に効く。
 */
export class NoiseProfile {
  constructor() {
    this.noise = null;
    this.count = 0;
  }

  learn(magnitudes) {
    if (!this.noise) this.noise = new Float32Array(magnitudes.length);
    // 最初は平均、その後はゆっくり追いかける（部屋の雑音が変わっても追従できるように）
    const a = this.count < 20 ? 1 / (this.count + 1) : 0.05;
    for (let i = 0; i < magnitudes.length; i++) this.noise[i] += a * (magnitudes[i] - this.noise[i]);
    this.count++;
  }

  get ready() {
    return this.count >= 5;
  }

  subtract(magnitudes, overSubtract = 2) {
    if (!this.noise) return magnitudes;
    const out = new Float32Array(magnitudes.length);
    for (let i = 0; i < magnitudes.length; i++) {
      // 雑音の少し上までを差し引き、残りが小さすぎるところは 0 にする
      out[i] = Math.max(0, magnitudes[i] - this.noise[i] * overSubtract);
    }
    return out;
  }
}

/**
 * マイクを使い始め、フレームごとに onFrame({ chroma, bass, level, state }) を呼ぶ。
 * state は 'calibrating'（周りの雑音を覚えている途中）/ 'quiet'（弾いていない）/ 'playing'。
 * 戻り値の stop() で止める。
 */
export async function startListening(onFrame, { smoothing = 0.2, calibrationSeconds = 1 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  // 大きいほど近い音（低音弦や、電源の雑音と重なる音）を見分けやすい
  analyser.fftSize = 32768;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const db = new Float32Array(analyser.frequencyBinCount);
  const linear = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const recentSamples = Math.round(ctx.sampleRate * 0.1);
  const noise = new NoiseProfile();
  let noiseLevel = 0;
  let smoothChroma = new Array(12).fill(0);
  let smoothBass = new Array(12).fill(0);
  const startedAt = performance.now();
  let last = startedAt;
  let wasPlaying = false;
  let loudSince = null;
  let rafId = 0;

  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    const dt = (now - last) / 1000;
    if (dt < 1 / 30) return; // 1秒に30回で十分
    last = now;
    const alpha = 1 - Math.exp(-dt / smoothing);

    // 直近 0.1 秒の音量
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = wave.length - recentSamples; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / recentSamples);

    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < db.length; i++) linear[i] = Math.pow(10, db[i] / 20);

    // 最初の約1秒と、周りの雑音と同じくらい静かなときに、雑音を覚える
    const calibrating = now - startedAt < calibrationSeconds * 1000 || !noise.ready;
    const quiet = level < Math.max(noiseLevel * 1.3, 0.002);
    if (calibrating || quiet) {
      noise.learn(linear);
      noiseLevel += (calibrating ? 0.3 : 0.05) * (level - noiseLevel);
    }
    if (calibrating) {
      onFrame({ chroma: smoothChroma, bass: null, level, state: 'calibrating' });
      return;
    }
    const loud = level > Math.max(noiseLevel * 1.8, 0.003);
    // 弾いた直後は分析する範囲にまだ弾く前の音が多く混ざるので、少し鳴ってから判定する
    if (!loud) loudSince = null;
    else if (loudSince === null) loudSince = now;
    const playing = loud && now - loudSince >= ONSET_WAIT_MS;

    const { chroma, bass } = analyzeSpectrum(noise.subtract(linear), ctx.sampleRate, analyser.fftSize);
    // 約 smoothing 秒で追いつく指数移動平均（表示のチラつきを抑える）
    const total = chroma.reduce((s, v) => s + v, 0) || 1;
    // 判定を始めた瞬間は平均をとらず、すぐに新しい音に切り替える
    const a = playing && !wasPlaying ? 1 : alpha;
    wasPlaying = playing;
    smoothChroma = smoothChroma.map((v, i) => v + a * ((playing ? chroma[i] / total : 0) - v));
    smoothBass = smoothBass.map((v, i) => v + a * ((playing && bass === i ? 1 : 0) - v));
    const bassMax = Math.max(...smoothBass);
    const smoothedBass = bassMax > 0.3 ? smoothBass.indexOf(bassMax) : null;

    onFrame({ chroma: smoothChroma, bass: smoothedBass, level, state: playing ? 'playing' : 'quiet' });
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}
