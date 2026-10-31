// 精度テスト用：歌・ベース・ドラム入りの「曲」を合成し、ギターの正解（いつ・どの音）も返す

import { rng } from './synth.js';
import { parseChordName } from '../chord-engine.js';
import { findVoicings } from '../fretboard.js';

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

// テスト曲のコード進行（seed ごとに選ぶ）
const PROGRESSIONS = [
  ['C', 'G', 'Am', 'F'],
  ['Am', 'F', 'C', 'G'],
  ['D', 'A', 'Bm', 'G'],
  ['G', 'Em', 'C', 'D'],
  ['E', 'B', 'C#m', 'A'],
  ['F', 'C', 'Dm', 'B♭'],
  ['Dm', 'G', 'C', 'Am'],
  ['A', 'E', 'F#m', 'D'],
  // 7th コードを使う曲（シンプルなコードばかりに合わせ込んでいないか確かめるため）
  ['Cmaj7', 'Am7', 'Dm7', 'G7'],
  ['Em7', 'A7', 'Dmaj7', 'Bm7'],
];

/**
 * 8小節の曲を作る。seed ごとにテンポ（80〜130）・コード進行・弾き方（アルペジオ・ストローク・リフ）が変わる。
 * stereo: true ならギターは左寄り、歌・ベース・ドラムは真ん中（よくあるバンドの混ぜ方）
 * stereo: false なら全部真ん中（弾き語りの動画など）
 */
export function makeSong({ seed = 1, stereo = true, vocalGain = 0.12, withBand = true, withRhythm = true, changesPerBar = 1 } = {}) {
  const rand = rng(seed * 7919);
  const tempo = 80 + Math.floor(rand() * 51);
  const beat = 60 / tempo;
  const bars = 8;
  const start = 0.5;
  const length = Math.ceil((start + bars * 4 * beat + 2) * MIX_RATE);
  const guitar = new Float32Array(length);
  const center = new Float32Array(length);
  const truth = [];

  const base = PROGRESSIONS[(seed - 1) % PROGRESSIONS.length];
  const progression = [...base, ...base];
  const shapeOf = (name) => {
    const { root, type, bass } = parseChordName(name);
    return findVoicings(root, type, bass, { strings: TUNING }, { limit: 6 })[0];
  };
  const noteOf = (shape, s) => TUNING[s] + shape[s];
  // 弦ごとに音を重ねる。本物のギターと同じく、1本の弦は同時に1つの音しか鳴らせないので、
  // 同じ弦で次の音を弾いたら前の音は止まる（短くフェードアウト）
  const strings6 = Array.from({ length: 6 }, () => new Float32Array(length));
  const stopString = (s, at) => {
    const from = Math.floor(at * MIX_RATE);
    const fade = Math.floor(0.015 * MIX_RATE);
    const track = strings6[s];
    for (let i = from; i < track.length; i++) track[i] *= i - from < fade ? 1 - (i - from) / fade : 0;
  };
  const play = (midi, at, seconds = 1.6, gain = 0.5, string = null) => {
    // 弦の指定が無いとき（リフ）は、その音を出せるいちばん高い弦（12フレット以内）で弾く
    const s = string ?? [5, 4, 3, 2, 1, 0].find((k) => midi - TUNING[k] >= 0 && midi - TUNING[k] <= 12) ?? 0;
    stopString(s, at);
    addAt(strings6[s], pluck(freq(midi), seconds, rand), at, gain * (0.8 + rand() * 0.4));
  };

  // 小節ごとの弾き方：seed ごとに並びを変える（どの曲にもアルペジオ・ストローク・リフが入る）
  const kinds = ['arp', 'arp', 'strum', 'strum', 'riff', 'arp', 'strum', 'riff'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }

  // コードの区切り：1小節に changesPerBar 回切り替わる（1：1小節ごと、2：2拍ごと、4：1拍ごと）
  const segBeats = 4 / changesPerBar;
  const segments = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let k = 0; k < changesPerBar; k++) {
      const name = changesPerBar === 1 ? progression[bar] : base[(bar * changesPerBar + k) % base.length];
      segments.push({ name, bar, start: start + (bar * 4 + k * segBeats) * beat, end: start + (bar * 4 + (k + 1) * segBeats) * beat, kind: kinds[bar] });
    }
  }
  const segAt = (bar, b) => segments[bar * changesPerBar + Math.min(changesPerBar - 1, Math.floor(b / segBeats + 1e-9))];

  let prevShape = null, prevKind = null;
  segments.forEach((seg) => {
    // コードを持ち替えると、押さえる場所が変わる弦・押さえていた弦の音は止まる（開放弦のまま変わらない弦は鳴り続ける）
    const shape = shapeOf(seg.name);
    if (prevShape) shape.forEach((f, s) => { if (prevShape[s] !== f || (f !== null && f > 0 && prevKind === 'riff')) stopString(s, seg.start - 0.02); });
    if (seg.kind === 'riff') for (let s = 0; s < 6; s++) stopString(s, seg.start - 0.02);
    prevShape = shape;
    prevKind = seg.kind;
    seg.shape = shape;
  });

  for (let bar = 0; bar < bars; bar++) {
    const t0 = start + bar * 4 * beat;
    const kind = kinds[bar];
    if (kind === 'arp') {
      // アルペジオ：8分音符で、低い弦から高い弦へ（並びは小節ごとに少し変える）
      const orders = [[0, 2, 3, 4, 5, 4, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 5]];
      const order = orders[Math.floor(rand() * orders.length)];
      for (let i = 0; i < 8; i++) {
        const seg = segAt(bar, i / 2);
        const strings = seg.shape.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
        // 区切りの最初の音は、いちばん低い弦（ベース）から
        const k = Math.abs(i / 2 - (seg.start - t0) / beat) < 1e-6 ? 0 : order[i];
        const s = strings[Math.min(k, strings.length - 1)];
        const at = t0 + (i * beat) / 2;
        play(TUNING[s] + seg.shape[s], at, 1.6, 0.5, s);
        truth.push({ t: at, notes: [TUNING[s] + seg.shape[s]], kind: 'arp' });
      }
    } else if (kind === 'strum') {
      // ストローク：リズムは2通り（2分音符・8分のダウンアップ）。コードが変わる拍では必ず弾く
      const pattern = rand() < 0.5 ? [0, 2] : [0, 1, 1.5, 2.5, 3];
      const hits = [...new Set([...pattern, ...Array.from({ length: changesPerBar }, (_, k) => k * segBeats)])].sort((a, b) => a - b);
      hits.forEach((b) => {
        const seg = segAt(bar, b);
        const strings = seg.shape.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
        const at = t0 + b * beat;
        const up = !Number.isInteger(b);
        const order = up ? [...strings].reverse() : strings;
        order.forEach((s, k) => play(TUNING[s] + seg.shape[s], at + k * 0.012, 1.0, 0.3, s));
        truth.push({ t: at, notes: strings.map((s) => TUNING[s] + seg.shape[s]).sort((a, b) => a - b), kind: 'strum' });
      });
    } else {
      // 単音のリフ：表拍（強い拍）はコードの構成音、裏拍に経過音を挟む（実際のリフの多くはこう作られ、コードが聞き取れる）
      for (let i = 0; i < 8; i++) {
        const seg = segAt(bar, i / 2);
        const strings = seg.shape.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
        const root = TUNING[strings[0]] + seg.shape[strings[0]] + 12;
        const { type } = parseChordName(seg.name);
        const minor = /^[A-G][#♭]?m(?!aj)/.test(seg.name);
        const iv = type.intervals;
        const steps = [iv[0], iv[1], iv[2], iv.length > 3 ? iv[3] : 12, 12, iv[2], minor ? 5 : 2, iv[1]];
        // 区切りの最初の音はルート
        const d = Math.abs(i / 2 - (seg.start - t0) / beat) < 1e-6 ? 0 : steps[i];
        const at = t0 + (i * beat) / 2;
        let m = root + d;
        while (m > 79) m -= 12;
        play(m, at, 0.8, 0.5);
        truth.push({ t: at, notes: [m], kind: 'riff' });
      }
    }
  }

  if (withBand) {
    // 歌：コードの音を中心にした、2拍か4拍の長めの音のメロディ
    const notes = [];
    for (let bar = 0; bar < bars; bar++) {
      let b = 0;
      while (b < 4) {
        const len = Math.min(rand() < 0.5 ? 2 : 4 - b, segBeats);
        const { root, type } = parseChordName(segAt(bar, b).name);
        const tones = type.intervals.map((i) => 60 + ((root + i) % 12));
        const t = start + (bar * 4 + b) * beat;
        notes.push({ midi: tones[Math.floor(rand() * tones.length)] + (rand() < 0.3 ? 2 : 0), start: t + 0.05, end: t + len * beat - 0.05 });
        b += len;
      }
    }
    sing(center, notes, vocalGain, rand);
    // ベース：各小節の1拍目と3拍目にルート音（withRhythm が false なら、ベースとドラムは無し＝1人の弾き語り）
    if (withRhythm) segments.forEach((seg) => {
      const { root } = parseChordName(seg.name);
      const midi = 28 + ((root - 4 + 12) % 12);
      (segBeats >= 4 ? [0, 2] : [0]).forEach((b) => {
        const at = seg.start + b * beat;
        const f = freq(midi);
        const tone = new Float32Array(Math.floor(MIX_RATE * beat * 1.8));
        for (let i = 0; i < tone.length; i++) {
          const tt = i / MIX_RATE;
          tone[i] = (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(4 * Math.PI * f * tt) + 0.25 * Math.sin(6 * Math.PI * f * tt)) * Math.exp(-tt * 1.5);
        }
        addAt(center, tone, at, 0.25);
      });
    });
    // ドラム：バスドラ（1・3拍）、スネア（2・4拍）、ハイハット（8分）
    for (let b = 0; withRhythm && b < bars * 4; b++) {
      const at = start + b * beat;
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

  strings6.forEach((track) => { for (let i = 0; i < length; i++) guitar[i] += track[i]; });
  const left = new Float32Array(length), right = new Float32Array(length);
  const [gl, gr] = stereo ? [0.85, 0.25] : [0.6, 0.6];
  for (let i = 0; i < length; i++) {
    left[i] = guitar[i] * gl + center[i] * 0.6;
    right[i] = guitar[i] * gr + center[i] * 0.6;
  }
  return {
    channels: [left, right],
    sampleRate: MIX_RATE,
    tempo,
    truth: truth.sort((a, b) => a.t - b.t),
    chords: segments.map(({ name, kind, start: s0, end }) => ({ name, kind, start: s0, end })),
  };
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
