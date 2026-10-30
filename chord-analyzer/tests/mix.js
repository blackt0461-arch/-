// 精度テスト用：歌・ベース・ドラム入りの「曲」を合成し、ギターの正解（いつ・どの音）も返す

import { rng } from './synth.js';

export const MIX_RATE = 44100;
const TUNING = [40, 45, 50, 55, 59, 64];
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

// 弦をはじいた音（カープラス・ストロング法。乱数を固定して毎回同じ音にする）
function pluck(f, seconds, rand) {
  const out = new Float32Array(Math.floor(MIX_RATE * seconds));
  const period = MIX_RATE / f;
  const head = Math.ceil(period);
  for (let i = 0; i < head; i++) out[i] = rand() * 2 - 1;
  for (let i = 1; i < head; i++) out[i] = 0.5 * (out[i] + out[i - 1]);
  const decay = 0.996 + Math.min(0.0035, f / 200000);
  const delay = period - 0.5;
  const read = (t) => { const i = Math.floor(t); const fr = t - i; return (1 - fr) * out[i] + fr * out[i + 1]; };
  for (let i = head + 1; i < out.length; i++) out[i] = decay * 0.5 * (read(i - delay) + read(i - delay - 1));
  // 終わりをなめらかに消す（急に切ると「プツッ」という雑音が出て、弾いていない瞬間に見えてしまう）
  const fade = Math.floor(MIX_RATE * 0.08);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

function addAt(buf, src, at, gain) {
  const start = Math.floor(at * MIX_RATE);
  for (let i = 0; i < src.length && start + i < buf.length; i++) buf[start + i] += src[i] * gain;
}

/** 歌声：倍音を声らしい響き（フォルマント）で強弱をつけ、ビブラートと音のつながり（ポルタメント）を入れる */
function sing(out, notes, gain, rand) {
  const formant = (f) => Math.exp(-(((f - 700) / 300) ** 2)) + 0.7 * Math.exp(-(((f - 1200) / 400) ** 2)) + 0.15;
  let phase = new Float64Array(12);
  let prev = notes[0].midi;
  for (const { midi, start, end } of notes) {
    const s = Math.floor(start * MIX_RATE), e = Math.floor(end * MIX_RATE);
    for (let i = s; i < e && i < out.length; i++) {
      const t = (i - s) / MIX_RATE;
      const glide = Math.min(1, t / 0.07);
      const vib = Math.min(1, Math.max(0, (t - 0.15) / 0.3)) * 0.35 * Math.sin(2 * Math.PI * 5.5 * t);
      const m = prev + (midi - prev) * glide + vib;
      const f0 = freq(m);
      const env = Math.min(1, t / 0.08) * Math.min(1, (e - i) / MIX_RATE / 0.08);
      let v = 0;
      for (let h = 1; h <= 12; h++) {
        phase[h - 1] += (2 * Math.PI * f0 * h) / MIX_RATE;
        if (f0 * h < 5000) v += (Math.sin(phase[h - 1]) * formant(f0 * h)) / h ** 0.7;
      }
      out[i] += v * env * gain * (1 + (rand() - 0.5) * 0.05);
    }
    prev = midi;
  }
}

/**
 * 8小節の曲を作る。テンポ100（1拍0.6秒）、コードは C → G → Am → F を2回。
 * ギター：1〜4小節はアルペジオ、5〜6小節はストローク、7〜8小節は単音のリフ
 * stereo: true ならギターは左寄り、歌・ベース・ドラムは真ん中（よくあるバンドの混ぜ方）
 * stereo: false なら全部真ん中（弾き語りの動画など）
 */
export function makeSong({ seed = 1, stereo = true, vocalGain = 0.12, withBand = true } = {}) {
  const rand = rng(seed);
  const beat = 0.6;
  const bars = 8;
  const length = Math.ceil((bars * 4 * beat + 2) * MIX_RATE);
  const guitar = new Float32Array(length);
  const center = new Float32Array(length);
  const truth = [];

  const shapes = { C: [null, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], Am: [null, 0, 2, 2, 1, 0], F: [1, 3, 3, 2, 1, 1] };
  const progression = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'];
  const noteOf = (shape, s) => TUNING[s] + shape[s];
  const play = (midi, at, seconds = 1.6, gain = 0.5) => addAt(guitar, pluck(freq(midi), seconds, rand), at, gain * (0.8 + rand() * 0.4));

  progression.forEach((name, bar) => {
    const shape = shapes[name];
    const t0 = 0.5 + bar * 4 * beat;
    const strings = shape.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
    if (bar < 4) {
      // アルペジオ：低い弦から高い弦へ、8分音符で
      const order = [strings[0], strings[2], strings[3], strings[4], strings[strings.length - 1], strings[4], strings[3], strings[2]];
      order.forEach((s, i) => {
        const at = t0 + i * beat / 2;
        play(noteOf(shape, s), at);
        truth.push({ t: at, notes: [noteOf(shape, s)] });
      });
    } else if (bar < 6) {
      // ストローク：1拍目と3拍目に全部の弦を少しずつずらして鳴らす
      [0, 2].forEach((b) => {
        const at = t0 + b * beat;
        strings.forEach((s, i) => play(noteOf(shape, s), at + i * 0.012, 1.2, 0.35));
        truth.push({ t: at, notes: strings.map((s) => noteOf(shape, s)) });
      });
    } else {
      // 単音のリフ：コードの音を中心にした8分音符のフレーズ
      const root = noteOf(shape, strings[0]) + 12;
      [0, 3, 7, 12, 10, 7, 5, 3].forEach((d, i) => {
        const at = t0 + i * beat / 2;
        const m = Math.min(76, root + d);
        play(m, at, 0.8, 0.5);
        truth.push({ t: at, notes: [m] });
      });
    }
  });

  if (withBand) {
    // 歌：ゆったりした長めの音のメロディ
    const melody = [67, 64, 62, 64, 67, 69, 67, 64, 65, 64, 62, 60, 64, 67, 72, 71, 69, 67, 65, 64];
    let t = 0.6;
    const notes = melody.map((midi, i) => {
      const dur = 0.9 + (i % 3) * 0.3;
      const n = { midi, start: t, end: t + dur - 0.05 };
      t += dur;
      return n;
    });
    sing(center, notes, vocalGain, rand);
    // ベース：各小節の1拍目と3拍目にルート音
    const roots = { C: 36, G: 31, Am: 33, F: 29 };
    progression.forEach((name, bar) => {
      [0, 2].forEach((b) => {
        const at = 0.5 + (bar * 4 + b) * beat;
        const f = freq(roots[name]);
        const tone = new Float32Array(Math.floor(MIX_RATE * beat * 1.8));
        for (let i = 0; i < tone.length; i++) {
          const tt = i / MIX_RATE;
          tone[i] = (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(4 * Math.PI * f * tt) + 0.25 * Math.sin(6 * Math.PI * f * tt)) * Math.exp(-tt * 1.5);
        }
        addAt(center, tone, at, 0.25);
      });
    });
    // ドラム：バスドラ（1・3拍）、スネア（2・4拍）、ハイハット（8分）
    for (let b = 0; b < bars * 4; b++) {
      const at = 0.5 + b * beat;
      const hit = new Float32Array(Math.floor(MIX_RATE * 0.3));
      for (let i = 0; i < hit.length; i++) {
        const tt = i / MIX_RATE;
        hit[i] = b % 2 === 0
          ? Math.sin(2 * Math.PI * (50 + 60 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 12)
          : (rand() - 0.5) * Math.exp(-tt * 18) * 1.2;
      }
      addAt(center, hit, at, 0.35);
      for (const off of [0, beat / 2]) {
        const hat = new Float32Array(Math.floor(MIX_RATE * 0.05));
        let last = 0;
        for (let i = 0; i < hat.length; i++) { const n = rand() - 0.5; hat[i] = (n - last) * Math.exp(-i / MIX_RATE * 80); last = n; }
        addAt(center, hat, at + off, 0.15);
      }
    }
  }

  const left = new Float32Array(length), right = new Float32Array(length);
  const [gl, gr] = stereo ? [0.85, 0.25] : [0.6, 0.6];
  for (let i = 0; i < length; i++) {
    left[i] = guitar[i] * gl + center[i] * 0.6;
    right[i] = guitar[i] * gr + center[i] * 0.6;
  }
  return { channels: [left, right], sampleRate: MIX_RATE, truth, chords: progression.map((name, bar) => ({ name, start: 0.5 + bar * 4 * beat, end: 0.5 + (bar + 1) * 4 * beat })) };
}

/** 予想した音と正解の音を照らし合わせる（時間の差 tol 秒以内・同じ高さなら正解） */
export function scoreNotes(predicted, truth, { tol = 0.06, octaveFree = false } = {}) {
  const flat = (events) => events.flatMap((e) => e.notes.map((m) => ({ t: e.t, m })));
  const p = flat(predicted), g = flat(truth);
  const used = new Set();
  let hit = 0;
  for (const tn of g) {
    const i = p.findIndex((pn, idx) => !used.has(idx) && Math.abs(pn.t - tn.t) <= tol
      && (octaveFree ? (pn.m - tn.m) % 12 === 0 : pn.m === tn.m));
    if (i >= 0) { used.add(i); hit++; }
  }
  const precision = p.length ? hit / p.length : 0;
  const recall = g.length ? hit / g.length : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, predicted: p.length, truth: g.length };
}
