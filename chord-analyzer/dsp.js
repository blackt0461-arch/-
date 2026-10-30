// 周波数分析（FFT）の共通部品。ブラウザでも、解析用のワーカーでも、テストでも使う

/** その場で書き換える FFT（長さは2のべき乗） */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wStepRe = Math.cos(ang), wStepIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const t = wr * wStepRe - wi * wStepIm;
        wi = wr * wStepIm + wi * wStepRe;
        wr = t;
      }
    }
  }
}

const windows = new Map();
function blackman(length) {
  if (!windows.has(length)) {
    const w = new Float64Array(length);
    let sum = 0;
    for (let i = 0; i < length; i++) {
      w[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / length) + 0.08 * Math.cos((4 * Math.PI * i) / length);
      sum += w[i];
    }
    windows.set(length, { w, sum });
  }
  return windows.get(length);
}

/**
 * signal の start から length サンプルを切り出し、ブラックマン窓をかけて fftSize に0を足して FFT し、
 * 振幅を返す。窓の合計で割っているので、正弦波の振幅がそのままの大きさで出る
 * （長さの違う区間どうしでも、音の大きさを比べられる）。
 */
export function magnitudeSpectrum(signal, start, length, fftSize = length) {
  const { w, sum } = blackman(length);
  const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
  for (let i = 0; i < length; i++) {
    const idx = start + i;
    re[i] = idx >= 0 && idx < signal.length ? signal[idx] * w[i] : 0;
  }
  fft(re, im);
  const mags = new Float32Array(fftSize / 2);
  for (let k = 0; k < fftSize / 2; k++) mags[k] = (2 * Math.hypot(re[k], im[k])) / sum;
  return mags;
}

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

/** 周波数 f 付近（±cents）でいちばん大きい振幅と、その周波数（放物線補間）を返す */
export function peakNear(mags, binHz, f, cents = 35) {
  const lo = Math.max(1, Math.floor((f * 2 ** (-cents / 1200)) / binHz));
  const hi = Math.min(mags.length - 2, Math.ceil((f * 2 ** (cents / 1200)) / binHz));
  let k = -1;
  for (let i = lo; i <= hi; i++) if (k < 0 || mags[i] > mags[k]) k = i;
  if (k < 0) return { mag: 0, freq: f };
  const a = mags[k - 1], b = mags[k], c = mags[k + 1];
  const denom = a - 2 * b + c;
  const offset = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  return { mag: b, freq: (k + offset) * binHz };
}

/** ある音（MIDI）の強さ：基音と倍音（最大 harmonics 個）の振幅の合計 */
export function noteEnergy(mags, binHz, midi, harmonics = 4) {
  const f0 = midiToFreq(midi);
  let sum = 0;
  for (let h = 1; h <= harmonics; h++) sum += peakNear(mags, binHz, f0 * h, 30).mag / h ** 0.5;
  return sum;
}

/**
 * 一番目立つ音の高さ（セント：MIDI × 100）を、倍音の合計がいちばん大きい高さとして 10 セント刻みで探す。
 * 歌のメロディの追跡に使う（範囲は C3〜C6）。
 */
export function predominantPitch(mags, binHz, { fromCents = 4800, toCents = 8400 } = {}) {
  let best = { cents: fromCents, sum: 0 };
  for (let c = fromCents; c <= toCents; c += 10) {
    const f0 = 440 * 2 ** ((c / 100 - 69) / 12);
    let sum = 0;
    for (let h = 1; h <= 6; h++) sum += peakNear(mags, binHz, f0 * h, 15).mag / h;
    if (sum > best.sum) best = { cents: c, sum };
  }
  return best;
}

/** 周波数分布から、ある音（基音 f0）とその倍音を取り除く（その場で書き換える） */
export function removeHarmonics(mags, binHz, f0, { count = 12, widthCents = 60 } = {}) {
  for (let h = 1; h <= count; h++) {
    const f = f0 * h;
    const lo = Math.floor((f * 2 ** (-widthCents / 1200)) / binHz), hi = Math.ceil((f * 2 ** (widthCents / 1200)) / binHz);
    for (let k = Math.max(0, lo); k <= hi && k < mags.length; k++) mags[k] = 0;
  }
}
