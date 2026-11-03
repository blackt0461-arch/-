// AI で「いつ・どの高さの音が鳴っているか」を聞き取る（Spotify の Basic Pitch・Apache 2.0 ライセンス・無料公開）。
// 曲を 22050Hz にして約2秒ずつ AI に渡すと、0.0116 秒ごと・88 鍵ぶんの
//   note（その高さの音が鳴っている確率）と onset（その高さの音を弾いた瞬間の確率）が返ってくる。
// ort（ONNX Runtime）と読み込んだモデルは呼ぶ側が渡す。

export const PITCH_RATE = 22050;
const HOP = 256;
const WINDOW = PITCH_RATE * 2 - HOP; // 43844：AI に一度に渡す長さ
const OVERLAP_FRAMES = 30;
const OVERLAP = OVERLAP_FRAMES * HOP;
const STEP = WINDOW - OVERLAP;
const OUT_FRAMES = 172;
export const PITCH_FPS = PITCH_RATE / HOP; // 1秒あたりのコマ数（約 86）
export const LOWEST_MIDI = 21; // 88 鍵のいちばん下（A0）

/** 高い音を落としてから間引く（折り返しの雑音が出ないように）。窓をかけた sinc で好きな比率に直す */
export function resampleClean(x, from, to) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from, n = Math.floor(x.length * ratio), y = new Float32Array(n);
  const cutoff = Math.min(1, ratio) * 0.94, zeros = 16, half = Math.ceil(zeros / cutoff);
  for (let i = 0; i < n; i++) {
    const p = i / ratio, c = Math.floor(p);
    let sum = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      const d = p - k;
      const s = d === 0 ? 1 : Math.sin(Math.PI * cutoff * d) / (Math.PI * cutoff * d);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (half + 1));
      const v = s * w;
      wsum += v;
      if (k >= 0 && k < x.length) sum += x[k] * v;
    }
    y[i] = wsum ? sum / wsum : 0;
  }
  return y;
}

/**
 * AI で聞き取る。channels：[左, 右]（1本でもよい）。session：Basic Pitch のモデルを読み込んだ InferenceSession。
 * 戻り値 { fps, frames, note, onset }：note・onset は frames×88 の確率（0〜1）
 */
export async function runPitchAI(channels, sampleRate, { ort, session, batch = 4, onProgress = () => {} }) {
  const mono = channels.length > 1 ? Float32Array.from(channels[0], (v, i) => (v + channels[1][i]) / 2) : channels[0];
  const audio = resampleClean(mono, sampleRate, PITCH_RATE);
  // 公式と同じ：先頭に半分の重なりぶんの無音を足し、STEP ずつずらして WINDOW の長さで切り出す
  const padded = new Float32Array(audio.length + OVERLAP / 2);
  padded.set(audio, OVERLAP / 2);
  const starts = [];
  for (let s = 0; s < padded.length; s += STEP) starts.push(s);
  const want = Math.floor((audio.length / PITCH_RATE) * PITCH_FPS);
  const keep = OUT_FRAMES - OVERLAP_FRAMES; // 1区間から使うコマ数（前後 15 コマずつ捨てる）
  const note = new Float32Array(starts.length * keep * 88), onset = new Float32Array(starts.length * keep * 88);
  const inName = session.inputNames[0];
  for (let b = 0; b < starts.length; b += batch) {
    const group = starts.slice(b, b + batch);
    const input = new Float32Array(group.length * WINDOW);
    group.forEach((s, g) => input.set(padded.subarray(s, Math.min(padded.length, s + WINDOW)), g * WINDOW));
    const res = await session.run({ [inName]: new ort.Tensor('float32', input, [group.length, WINDOW, 1]) });
    // 出口の名前：StatefulPartitionedCall:1 が note、:2 が onset（公式の basic_pitch/inference.py と同じ対応）
    const pick = (suffix) => res[Object.keys(res).find((k) => k.endsWith(suffix))].data;
    const nd = pick(':1'), od = pick(':2');
    group.forEach((_, g) => {
      for (let f = 0; f < keep; f++) {
        const src = (g * OUT_FRAMES + f + OVERLAP_FRAMES / 2) * 88, dst = ((b + g) * keep + f) * 88;
        note.set(nd.subarray(src, src + 88), dst);
        onset.set(od.subarray(src, src + 88), dst);
      }
    });
    onProgress(Math.min(1, (b + group.length) / starts.length));
  }
  const frames = Math.min(want, starts.length * keep);
  return { fps: PITCH_FPS, frames, note: note.subarray(0, frames * 88), onset: onset.subarray(0, frames * 88) };
}

/**
 * AI の確率から、1つずつの音（弾いた時刻・止めた時刻・高さ・強さ）を取り出す（公式の output_to_notes_polyphonic を簡単にしたもの）。
 * onsetThresh：弾いた瞬間とみなす確率、frameThresh：鳴り続けているとみなす確率、minFrames：これより短い音は捨てる
 */
export function pitchNotes(ai, { onsetThresh = 0.5, frameThresh = 0.3, minFrames = 11, inferOnsets = true, energyTol = 11, minMidi = 40, maxMidi = 88 } = {}) {
  const { frames: n, note, fps } = ai;
  let onset = ai.onset;
  if (inferOnsets) {
    // 鳴っている確率が急に上がったところも「弾いた瞬間」の候補に足す（公式の get_infered_onsets と同じ）
    const diff = new Float32Array(n * 88);
    let maxDiff = 0, maxOnset = 0;
    for (let i = 0; i < n * 88; i++) maxOnset = Math.max(maxOnset, onset[i]);
    for (let t = 2; t < n; t++) for (let p = 0; p < 88; p++) {
      const v = note[t * 88 + p];
      const d = Math.max(0, Math.min(v - note[(t - 1) * 88 + p], v - note[(t - 2) * 88 + p]));
      diff[t * 88 + p] = d;
      maxDiff = Math.max(maxDiff, d);
    }
    const merged = new Float32Array(n * 88);
    for (let i = 0; i < n * 88; i++) merged[i] = Math.max(onset[i], maxDiff ? (diff[i] * maxOnset) / maxDiff : 0);
    onset = merged;
  }
  const remaining = Float32Array.from(note);
  const peaks = [];
  for (let t = 1; t < n - 1; t++) for (let p = minMidi - LOWEST_MIDI; p <= Math.min(87, maxMidi - LOWEST_MIDI); p++) {
    const v = onset[t * 88 + p];
    if (v >= onsetThresh && v > onset[(t - 1) * 88 + p] && v > onset[(t + 1) * 88 + p]) peaks.push([t, p, v]);
  }
  peaks.sort((a, b) => b[0] - a[0]); // 公式と同じく、後ろの音から順に決める
  const out = [];
  for (const [start, p, strength] of peaks) {
    if (start >= n - 1) continue;
    let i = start + 1, k = 0;
    while (i < n - 1 && k < energyTol) { if (remaining[i * 88 + p] < frameThresh) k++; else k = 0; i++; }
    i -= k;
    if (i - start <= minFrames) continue;
    let sum = 0;
    for (let t = start; t < i; t++) {
      sum += note[t * 88 + p];
      remaining[t * 88 + p] = 0;
      if (p < 87) remaining[t * 88 + p + 1] = 0;
      if (p > 0) remaining[t * 88 + p - 1] = 0;
    }
    out.push({ t: start / fps, end: i / fps, midi: p + LOWEST_MIDI, amp: sum / (i - start), onset: strength });
  }
  return out.sort((a, b) => a.t - b.t || a.midi - b.midi);
}

/** start〜end 秒のあいだで、AI が聞いた 12 音の強さ（鳴っている確率の平均）と、いちばん低くはっきり鳴っている音 */
export function pitchChroma(ai, start, end, { minMidi = 40, bassThresh = 0.35 } = {}) {
  const a = Math.max(0, Math.floor(start * ai.fps)), b = Math.min(ai.frames, Math.ceil(end * ai.fps));
  const chroma = new Array(12).fill(0);
  const level = new Float32Array(88);
  for (let t = a; t < b; t++) for (let p = minMidi - LOWEST_MIDI; p < 88; p++) level[p] += ai.note[t * 88 + p];
  const len = Math.max(1, b - a);
  let bass = null;
  for (let p = minMidi - LOWEST_MIDI; p < 88; p++) {
    const v = level[p] / len;
    chroma[(p + LOWEST_MIDI) % 12] += v;
    if (bass === null && v >= bassThresh) bass = (p + LOWEST_MIDI) % 12;
  }
  return { chroma, bass };
}
