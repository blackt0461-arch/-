// 歌声を消す：歌のメロディの高さを追いかけて、その音（基音と倍音）だけを、音そのもの（波形）から取り除く。
// 歌は高さが揺れる（ビブラート・なめらかな上下）が、ギターの音は高さが一定なので、揺れている音だけを消す。
// 左右に分かれていない曲（弾き語りなど、歌とギターが同じ場所にいる曲）のためのもの。
import { fft, magnitudeSpectrum, predominantPitch } from './dsp.js';

export function suppressVocal(signal, sampleRate, { frame = 4096, hop = 1024, pitchFft = 16384, wobbleCents = 30, nearCents = 50, widthCents = 45, harmonics = 16, depth = 1, minSum = 0 } = {}) {
  const n = signal.length;
  const starts = [];
  for (let s = 0; s + frame <= n; s += hop) starts.push(s);
  // 1. 区間ごとに、いちばん目立つ音の高さを細かく測る
  const pitchBin = sampleRate / pitchFft;
  const pitches = starts.map((s) => predominantPitch(magnitudeSpectrum(signal, s, frame, pitchFft), pitchBin));
  // 2. 前後 0.15 秒で高さが揺れていれば歌とみなす
  const span = Math.max(1, Math.round((0.15 * sampleRate) / hop));
  const vocal = pitches.map((p, i) => {
    if (p.sum <= minSum) return null;
    const near = pitches.slice(Math.max(0, i - span), i + span + 1).filter((g) => Math.abs(g.cents - p.cents) < nearCents);
    if (near.length < 3) return null;
    const values = near.map((g) => g.cents);
    return Math.max(...values) - Math.min(...values) >= wobbleCents ? 440 * 2 ** ((p.cents / 100 - 69) / 12) : null;
  });
  // 3. 歌の区間だけ、その音と倍音のところを消して、音に戻す（窓をかけて重ね合わせる）
  const out = new Float32Array(n);
  const norm = new Float32Array(n);
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame));
  const binHz = sampleRate / frame;
  const re = new Float64Array(frame), im = new Float64Array(frame);
  starts.forEach((s, fi) => {
    for (let i = 0; i < frame; i++) { re[i] = signal[s + i] * win[i]; im[i] = 0; }
    const f0 = vocal[fi];
    if (f0) {
      fft(re, im);
      for (let h = 1; h <= harmonics; h++) {
        const f = f0 * h;
        if (f > sampleRate / 2 - binHz) break;
        const lo = Math.max(1, Math.floor((f * 2 ** (-widthCents / 1200)) / binHz)), hi = Math.min(frame / 2 - 1, Math.ceil((f * 2 ** (widthCents / 1200)) / binHz));
        for (let k = lo; k <= hi; k++) {
          const g = 1 - depth;
          re[k] *= g; im[k] *= g; re[frame - k] *= g; im[frame - k] *= g;
        }
      }
      // 逆変換（共役を取って同じ FFT を使う）
      for (let i = 0; i < frame; i++) im[i] = -im[i];
      fft(re, im);
      for (let i = 0; i < frame; i++) re[i] /= frame;
    }
    for (let i = 0; i < frame; i++) { out[s + i] += re[i] * win[i]; norm[s + i] += win[i] * win[i]; }
  });
  for (let i = 0; i < n; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : signal[i];
  return { signal: out, vocalShare: vocal.filter(Boolean).length / Math.max(1, vocal.length) };
}
