// AI で歌声を取り除く（Open-Unmix UMX-HQ の歌声用ネットワーク・MIT ライセンス・無料公開）。
// 曲を短い区間ごとの周波数分布（STFT）にして AI に渡すと、「その中の歌の強さ」が返ってくる。
// 歌の割合のぶんだけ各周波数を弱めて、音に戻す。ort（ONNX Runtime）と読み込んだモデルは呼ぶ側が渡す。
import { fft } from './dsp.js';

const RATE = 44100, NFFT = 4096, HOP = 1024, BINS = NFFT / 2 + 1;

/** 44.1kHz 以外の音を、なめらかにつないで 44.1kHz に（または元に）直す */
export function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor((x.length * to) / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f; }
  return y;
}

const hann = new Float32Array(NFFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));

/** 周波数分布（実部・虚部）を、区間ごとに求める。両端は折り返してのばす（torch.stft の center と同じ） */
function stft(x) {
  const pad = NFFT / 2, n = x.length;
  const at = (i) => { let j = i - pad; if (j < 0) j = -j; if (j >= n) j = 2 * (n - 1) - j; return x[Math.max(0, Math.min(n - 1, j))]; };
  const frames = 1 + Math.floor(n / HOP);
  const re = new Float32Array(frames * BINS), im = new Float32Array(frames * BINS);
  const r = new Float64Array(NFFT), q = new Float64Array(NFFT);
  for (let t = 0; t < frames; t++) {
    for (let i = 0; i < NFFT; i++) { r[i] = at(t * HOP + i) * hann[i]; q[i] = 0; }
    fft(r, q);
    for (let k = 0; k < BINS; k++) { re[t * BINS + k] = r[k]; im[t * BINS + k] = q[k]; }
  }
  return { re, im, frames };
}

/** 周波数分布から音に戻す */
function istft(re, im, frames, n) {
  const pad = NFFT / 2, out = new Float32Array(n + NFFT), norm = new Float32Array(n + NFFT);
  const r = new Float64Array(NFFT), q = new Float64Array(NFFT);
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < BINS; k++) { r[k] = re[t * BINS + k]; q[k] = -im[t * BINS + k]; }
    for (let k = 1; k < NFFT / 2; k++) { r[NFFT - k] = r[k]; q[NFFT - k] = -q[k]; }
    fft(r, q); // 共役を取って同じ変換をすると逆変換になる
    for (let i = 0; i < NFFT; i++) { const v = r[i] / NFFT; out[t * HOP + i] += v * hann[i]; norm[t * HOP + i] += hann[i] * hann[i]; }
  }
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = norm[i + pad] > 1e-8 ? out[i + pad] / norm[i + pad] : 0;
  return y;
}

/**
 * 歌声を取り除いた音を返す。channels：[左, 右]（1本でもよい）、session：モデルを読み込んだ ONNX Runtime の InferenceSession
 * chunk フレーム（約6秒）ずつ、前後に context フレームの余白をつけて AI に渡す
 */
export async function removeVocalsAI(channels, sampleRate, { ort, session, chunk = 256, context = 32, onProgress = () => {} }) {
  const chs = (channels.length > 1 ? channels.slice(0, 2) : [channels[0], channels[0]]).map((c) => resample(c, sampleRate, RATE));
  const n = chs[0].length;
  const specs = chs.map(stft);
  const frames = specs[0].frames;
  const mask = new Float32Array(frames * BINS); // 歌を残す割合（0〜1）。最後に (1 − mask) を掛ける
  for (let s = 0; s < frames; s += chunk) {
    const a = Math.max(0, s - context), b = Math.min(frames, s + chunk + context), len = b - a;
    const mag = new Float32Array(2 * BINS * len);
    for (let c = 0; c < 2; c++) for (let k = 0; k < BINS; k++) for (let t = 0; t < len; t++) {
      const i = (a + t) * BINS + k;
      mag[(c * BINS + k) * len + t] = Math.hypot(specs[c].re[i], specs[c].im[i]);
    }
    const res = await session.run({ magnitude: new ort.Tensor('float32', mag, [1, 2, BINS, len]) });
    const voc = Object.values(res)[0].data;
    for (let t = s; t < Math.min(frames, s + chunk); t++) for (let k = 0; k < BINS; k++) {
      let m = 0;
      for (let c = 0; c < 2; c++) { const j = (c * BINS + k) * len + (t - a); m += Math.min(1, voc[j] / (mag[j] + 1e-8)); }
      mask[t * BINS + k] = m / 2;
    }
    onProgress(Math.min(1, (s + chunk) / frames));
  }
  return specs.map((sp) => {
    const re = sp.re.slice(), im = sp.im.slice();
    for (let i = 0; i < mask.length; i++) { const g = 1 - mask[i]; re[i] *= g; im[i] *= g; }
    return resample(istft(re, im, frames, n), RATE, sampleRate);
  });
}
