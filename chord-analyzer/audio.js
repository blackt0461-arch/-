// マイクの音を聞き取り、12音の強さ（クロマ）とベース音を求める

import { frequencyToMidi } from './chord-engine.js';

const MIN_FREQ = 70;     // 6弦開放(82Hz)や Drop D(73Hz) より少し下
const MAX_FREQ = 1400;
const PEAK_RATIO = 0.08; // いちばん強い山に対して、これより弱い山は無視する

/**
 * FFT の振幅（線形）から、音の山（ピーク）を拾ってクロマとベース音を求める。
 * 倍音（基音の2〜6倍の周波数）は弱めて、実際に弾いた音を優先する。
 */
export function analyzeSpectrum(magnitudes, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(MIN_FREQ / binHz));
  const hi = Math.min(magnitudes.length - 2, Math.ceil(MAX_FREQ / binHz));

  let max = 0;
  for (let k = lo; k <= hi; k++) max = Math.max(max, magnitudes[k]);
  if (max === 0) return { chroma: new Array(12).fill(0), bass: null, peaks: [] };

  const peaks = [];
  for (let k = lo; k <= hi; k++) {
    const m = magnitudes[k];
    if (m < max * PEAK_RATIO || m < magnitudes[k - 1] || m < magnitudes[k + 1]) continue;
    // 放物線補間で山の頂点の周波数を細かく求める
    const a = magnitudes[k - 1], b = m, c = magnitudes[k + 1];
    const denom = a - 2 * b + c;
    const offset = denom === 0 ? 0 : 0.5 * (a - c) / denom;
    peaks.push({ freq: (k + offset) * binHz, mag: m, weight: 1 });
  }

  peaks.forEach((p) => {
    for (const q of peaks) {
      if (q.freq >= p.freq * 0.97) break;
      const ratio = p.freq / q.freq;
      const n = Math.round(ratio);
      if (n >= 2 && n <= 6 && Math.abs(ratio - n) < 0.03 * n && q.mag > p.mag * 0.3) {
        p.weight = 0.25;
        break;
      }
    }
  });

  const chroma = new Array(12).fill(0);
  peaks.forEach((p) => {
    const pc = ((Math.round(frequencyToMidi(p.freq)) % 12) + 12) % 12;
    chroma[pc] += Math.sqrt(p.mag) * p.weight;
  });

  const bassPeak = peaks.find((p) => p.weight === 1 && p.mag > max * 0.15);
  const bass = bassPeak ? ((Math.round(frequencyToMidi(bassPeak.freq)) % 12) + 12) % 12 : null;

  return { chroma, bass, peaks };
}

/**
 * マイクを使い始め、フレームごとに onFrame({ chroma, bass, level }) を呼ぶ。
 * 戻り値の stop() で止める。
 */
export async function startListening(onFrame, { smoothing = 0.2 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 16384;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const db = new Float32Array(analyser.frequencyBinCount);
  const linear = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  let smoothChroma = new Array(12).fill(0);
  let smoothBass = new Array(12).fill(0);
  let last = performance.now();
  let rafId = 0;

  const tick = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    // 約 smoothing 秒で追いつく指数移動平均（表示のチラつきを抑える）
    const alpha = 1 - Math.exp(-dt / smoothing);

    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / wave.length);

    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < db.length; i++) linear[i] = Math.pow(10, db[i] / 20);
    const { chroma, bass } = analyzeSpectrum(linear, ctx.sampleRate, analyser.fftSize);

    const total = chroma.reduce((s, v) => s + v, 0) || 1;
    smoothChroma = smoothChroma.map((v, i) => v + alpha * (chroma[i] / total - v));
    smoothBass = smoothBass.map((v, i) => v + alpha * ((bass === i ? 1 : 0) - v));
    const bassMax = Math.max(...smoothBass);
    const smoothedBass = bassMax > 0.3 ? smoothBass.indexOf(bassMax) : null;

    onFrame({ chroma: smoothChroma, bass: smoothedBass, level });
    rafId = requestAnimationFrame(tick);
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
