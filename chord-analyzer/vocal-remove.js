// 歌声を消す：歌のメロディの高さを追いかけて、その音（基音と倍音）だけを、音そのもの（波形）から取り除く。
// 歌は高さが揺れる（ビブラート・なめらかな上下）が、ギターの音は高さが一定なので、揺れている音だけを消す。
// 左右に分かれていない曲（弾き語りなど、歌とギターが同じ場所にいる曲）のためのもの。
import { fft, magnitudeSpectrum, predominantPitch } from './dsp.js';

export function suppressVocal(signal, sampleRate, { frame = 4096, hop = 1024, pitchFft = 16384, wobbleCents = 30, stepCents = 40, spanFrames = 12, minRun = 6, extrema = 2, widthCents = 45, harmonics = 16, depth = 1, minSum = 0, gate = 0.15 } = {}) {
  const n = signal.length;
  const starts = [];
  for (let s = 0; s + frame <= n; s += hop) starts.push(s);
  // 1. 区間ごとに、いちばん目立つ音の高さを細かく測る
  const pitchBin = sampleRate / pitchFft;
  const pitches = starts.map((s) => predominantPitch(magnitudeSpectrum(signal, s, frame, pitchFft), pitchBin));
  // 2. 歌とみなす区間：高さがなめらかにつながっていて（となりとの差が stepCents 以内）、
  //    その中で wobbleCents 以上、上下に揺れている（ビブラート：山と谷が extrema 回以上ある）。
  //    ギターの音は高さが一定で、音が変わるときは一気に飛ぶので、ここには入らない
  const vocal = pitches.map((p, i) => {
    if (p.sum <= minSum) return null;
    let a = i, b = i;
    while (a > i - spanFrames && a > 0 && Math.abs(pitches[a - 1].cents - pitches[a].cents) <= stepCents) a--;
    while (b < i + spanFrames && b < pitches.length - 1 && Math.abs(pitches[b + 1].cents - pitches[b].cents) <= stepCents) b++;
    if (b - a + 1 < minRun) return null;
    const v = pitches.slice(a, b + 1).map((g) => g.cents);
    if (Math.max(...v) - Math.min(...v) < wobbleCents) return null;
    const sm = v.map((_, k) => (v[Math.max(0, k - 1)] + v[k] + v[Math.min(v.length - 1, k + 1)]) / 3);
    let turns = 0;
    for (let k = 1; k < sm.length - 1; k++) if ((sm[k] - sm[k - 1]) * (sm[k + 1] - sm[k]) < 0) turns++;
    return turns >= extrema ? 440 * 2 ** ((p.cents / 100 - 69) / 12) : null;
  });
  const vocalShare = vocal.filter(Boolean).length / Math.max(1, vocal.length);
  // 歌がほとんど見つからない曲（ギターだけの演奏など）は、そのまま返す（ギターの音を削らないため）
  if (vocalShare < gate) return { signal, vocalShare, removed: false };
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
  return { signal: out, vocalShare, removed: true };
}
