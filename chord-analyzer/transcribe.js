// 録音（画面収録など）の音から、ギターのコード進行とタブ譜の材料を作る
// ブラウザのワーカー（画面を固めずに裏で計算する仕組み）でも、テストでも動くように、画面の部品は使わない

import { magnitudeSpectrum, peakNear, noteEnergy, predominantPitch, removeHarmonics } from './dsp.js';
import { analyzeSpectrum } from './audio.js';
import { identifyFromChroma, CHORD_TYPES, parseChordName } from './chord-engine.js';
import { TUNINGS, findVoicings, soundingNotes } from './fretboard.js';
import { buildChordTimeline } from './song.js';
import { estimateBeats, findDownbeatScored, decodeChords, buildChart, cosine } from './chart.js';

const LOWEST = 40;  // E2（6弦の開放）
const HIGHEST = 88; // E6（1弦24フレット）
const freq = (m) => 440 * 2 ** ((m - 69) / 12);
// 倍音が来る高さ（基音からの半音数）：2倍=12、3倍=19、4倍=24、5倍=28、6倍=31
const HARMONIC_STEPS = [12, 19, 24, 28, 31];

function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/**
 * どの音を解析に使うか決める。
 * ステレオの曲は、歌・ベース・ドラムが真ん中、ギターが左右に振り分けられていることが多い。
 * 「左 − 右」（サイド）を取ると真ん中の音が消えてギターが残る。
 * サイドがほとんど無い曲（弾き語りなど全部が真ん中）は、普通に左右を混ぜた音を使う。
 */
export function chooseSignal(channels, mode = 'auto', sampleRate = 44100) {
  const [l, r = l] = channels;
  const mid = new Float32Array(l.length);
  const side = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) {
    mid[i] = (l[i] + r[i]) / 2;
    side[i] = (l[i] - r[i]) / 2;
  }
  const sideRatio = rms(side) / (rms(mid) || 1);
  // 左右の差は「真ん中に歌があり、ギターが左右に振り分けられている」曲にだけ役立つ。
  // ギター1本をマイク2本で録った曲で使うと、ギターの音そのものが削れてしまう
  let vocalShare = null;
  let useSide = mode === 'side';
  if (mode === 'auto' && sideRatio > 0.2) {
    const frames = removeVocalFrames(mid, sampleRate);
    vocalShare = frames.filter((f) => f.vocal).length / Math.max(1, frames.length);
    useSide = vocalShare >= 0.35;
  }
  return { guitar: useSide ? side : mid, mid, useSide, sideRatio, vocalShare };
}

/**
 * 「弾いた瞬間」を探す（スペクトルフラックス法）。
 * 短い区間ごとに周波数ごとの強さを求め、前の区間より強くなった分を合計する。
 * その合計が周りより飛び抜けて大きいところが、音の鳴り始め。
 */
export function detectOnsets(signal, sampleRate, options = {}) {
  return detectOnsetsDetailed(signal, sampleRate, options).map((o) => o.t);
}

/** 弾いた瞬間と、その勢い（strength：スペクトルフラックスの大きさ）を返す */
export function detectOnsetsDetailed(signal, sampleRate, { frame = 2048, hop = 512, minGap = 0.06 } = {}) {
  const binHz = sampleRate / frame;
  const lo = Math.floor(80 / binHz), hi = Math.ceil(5000 / binHz);
  const flux = [];
  const frames = [];
  let prev = null;
  for (let start = 0; start + frame <= signal.length; start += hop) {
    const mags = magnitudeSpectrum(signal, start, frame);
    const cur = new Float32Array(hi - lo);
    let f = 0;
    for (let k = lo; k < hi; k++) {
      cur[k - lo] = Math.log1p(1000 * mags[k]);
      if (prev) f += Math.max(0, cur[k - lo] - prev[k - lo]);
    }
    flux.push(f);
    frames.push(cur);
    prev = cur;
  }
  // 広がり：弾いた直前と、その後約0.07秒の間でいちばん強くなったときを比べ、はっきり強くなった周波数の数。
  // 1音なら倍音の位置だけ、和音（ストローク）なら多くの周波数が一斉に強くなる。音量にはあまり左右されない
  const spread = (i) => {
    const before = frames[Math.max(0, i - 2)];
    let count = 0;
    for (let k = 0; k < before.length; k++) {
      let peak = 0;
      for (let j = i; j < Math.min(frames.length, i + 6); j++) peak = Math.max(peak, frames[j][k]);
      if (peak - before[k] > 1) count++;
    }
    return count;
  };
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const onsets = [];
  const w = 6;
  for (let i = 1; i < flux.length - 1; i++) {
    const local = flux.slice(Math.max(0, i - w * 2), i + w * 2 + 1).sort((a, b) => a - b);
    const median = local[Math.floor(local.length / 2)];
    const isPeak = flux.slice(Math.max(0, i - 3), i + 4).every((v) => v <= flux[i]);
    if (!isPeak || flux[i] < median * 1.4 + mean * 0.4) continue;
    // フレームの真ん中あたりが鳴り始め
    const t = (i * hop + frame / 2) / sampleRate;
    if (onsets.length && t - onsets[onsets.length - 1].t < minGap) continue;
    // 勢い：鳴り始めから約0.07秒の間のフラックスの合計（和音は弦が少しずつずれて鳴るので、短い区間で足し合わせる）
    let strength = 0;
    for (let j = i; j < Math.min(flux.length, i + 6); j++) strength += flux[j];
    onsets.push({ t, strength, spread: spread(i) });
  }
  return onsets;
}

/**
 * 歌声らしい音かどうか。歌は音程が揺れる（ビブラート・なめらかな上下）うえに、
 * 鳴り始めより後のほうが大きくなることがある。ギターは音程が一定で、だんだん小さくなる。
 * 区間を3つに分け、それぞれで倍音の周波数と強さを測って比べる。
 */
function looksLikeVoice(signal, sampleRate, midi, start, length, { wobbleCents = 25, useSwell = true } = {}) {
  const sub = 4096;
  if (length < sub * 1.6) return false; // 短すぎて判断できない
  const f0 = freq(midi);
  const h = Math.max(1, Math.ceil(700 / f0)); // 周波数を細かく測れるよう、700Hz より上の倍音で見る
  const binHz = sampleRate / 8192;
  const points = [0, 0.5, 1].map((r) => {
    const s = start + Math.floor((length - sub) * r);
    const mags = magnitudeSpectrum(signal, s, sub, 8192);
    return peakNear(mags, binHz, f0 * h, 60);
  });
  if (points.some((p) => p.mag === 0)) return false;
  const cents = points.map((p) => 1200 * Math.log2(p.freq / (f0 * h)));
  const wobble = Math.max(...cents) - Math.min(...cents);
  const swelling = points[2].mag > points[0].mag * 1.15;
  return wobble > wobbleCents || (useSwell && swelling);
}

/**
 * 弾いた瞬間に新しく鳴り始めた音を、1つずつはがすように見つける。
 * 1. 直後の音から直前の音（少し小さくなっている分も見込む）を引き、「増えた分」だけを残す
 * 2. 各音の候補について、基音と倍音（2倍・3倍…）の位置の「増えた分」を合計する
 * 3. 合計がいちばん大きい音を確定し、その音の基音と倍音を全部取り除く。これを繰り返す
 * 倍音を取り除いてから次を探すので、倍音（1オクターブ上など）を別の音と間違えにくい。
 */
export function peelNotes(post, pre, binHz, { maxNotes = 6, stopRatio = 0.15, decay = 0.9, riseMode = 'sub', riseRatio = 1.5, floorRatio = 0.05 } = {}) {
  const d = new Float32Array(post.length);
  for (let k = 0; k < post.length; k++) {
    // 'ratio'：直前より riseRatio 倍以上強くなった周波数だけを「新しく鳴った」とみなす（鳴り続けて弱まっている音を確実に除く）
    d[k] = riseMode === 'ratio' ? (post[k] > pre[k] * riseRatio ? post[k] - pre[k] : 0) : Math.max(0, post[k] - pre[k] * decay);
  }
  const loBin = Math.floor(70 / binHz), hiBin = Math.min(d.length - 1, Math.ceil(5000 / binHz));
  let total = 0;
  for (let k = loBin; k <= hiBin; k++) total += d[k];
  const partialRange = (m, h) => {
    const f = freq(m) * h * Math.sqrt(1 + 0.0001 * h * h); // 弦の硬さで、高い倍音ほど少し上にずれる
    const c = 25 + 4 * h;
    return [Math.max(1, Math.floor((f * 2 ** (-c / 1200)) / binHz)), Math.min(d.length - 1, Math.ceil((f * 2 ** (c / 1200)) / binHz))];
  };
  const amp = (m, h) => {
    const [lo, hi] = partialRange(m, h);
    let best = 0;
    for (let k = lo; k <= hi; k++) if (d[k] > best) best = d[k];
    return best;
  };
  // はっきりした山だけを数える基準（いちばん強い山の floorRatio 倍）。
  // 1つ目の音を取り除いた後のごく小さな消え残りを寄せ集めて、ありもしない音をでっち上げないため
  let peakMax = 0;
  for (let k = loBin; k <= hiBin; k++) if (d[k] > peakMax) peakMax = d[k];
  const floor = peakMax * floorRatio;
  const score = (m) => {
    let sum = 0, present = 0;
    for (let h = 1; h <= 10; h++) {
      if (freq(m) * h > 5000) break;
      const a = amp(m, h);
      if (a < floor) continue;
      sum += a;
      present++;
    }
    // 基音（または2倍音）がはっきりしない候補は、別の音の倍音の寄せ集めなので選ばない
    if (amp(m, 1) < floor * 2 && amp(m, 2) < floor * 2) return 0;
    return sum * Math.min(1, present / 3);
  };
  const found = [];
  let first = 0;
  while (found.length < maxNotes) {
    let best = null, bestS = 0;
    for (let m = LOWEST; m <= HIGHEST; m++) {
      if (found.some((f) => f.m === m)) continue;
      const sc = score(m);
      if (sc > bestS) { best = m; bestS = sc; }
    }
    if (best === null) break;
    if (!found.length) first = bestS;
    else if (bestS < first * stopRatio) break;
    const fundamental = amp(best, 1);
    let removed = 0;
    for (let h = 1; h <= 12; h++) {
      const [lo, hi] = partialRange(best, h);
      for (let k = lo - 1; k <= hi + 1; k++) if (k >= 0 && k < d.length) { if (k >= loBin && k <= hiBin) removed += d[k]; d[k] = 0; }
    }
    // share：増えた分全体のうち、この音（基音と倍音）が占める割合
    found.push({ m: best, s: bestS, fundamental, share: total > 0 ? removed / total : 0 });
  }
  return found;
}

/**
 * 立ち上がりがゆるい音かどうか。ギターは弾いた瞬間に一気に大きな音が出るが、
 * 歌声はふわっと大きくなる。弾いた直後のごく短い区間と、その少し後の区間で強さを比べる。
 */
function softAttack(signal, sampleRate, midi, onsetSample, ratio) {
  const short = 2048;
  const f0 = freq(midi);
  const h = Math.max(1, Math.ceil(500 / f0)); // 短い区間でも周波数を見分けられる高さの倍音で見る
  const binHz = sampleRate / 4096;
  const early = peakNear(magnitudeSpectrum(signal, onsetSample, short, 4096), binHz, f0 * h, 60).mag;
  const later = peakNear(magnitudeSpectrum(signal, onsetSample + Math.floor(0.07 * sampleRate), short, 4096), binHz, f0 * h, 60).mag;
  return later > 0 && early < later * ratio;
}

/**
 * ストロークの音を、実際に押さえられるコードの形にそろえる。
 * 和音は倍音どうしが重なって1音ずつ聞き分けるのが難しいので、コード名を先に判定し、
 * その押さえ方の候補の中から、聞こえた音といちばん多く一致する形を選ぶ。
 */
function snapToVoicing(post, sampleRate, win, heard, tuning) {
  const { chroma, bass } = analyzeSpectrum(post, sampleRate, win);
  const lowest = Math.min(...heard) % 12;
  // 上位の候補のコードすべてについて押さえ方を比べ、聞こえた音にいちばん合う形を選ぶ
  // （1位の候補が少しだけ違うコードでも、押さえ方まで合わせて考えると正しく選べることが多い）
  let best = null;
  identifyFromChroma(chroma, bass ?? lowest, 5).forEach((chord, rank) => {
    const type = CHORD_TYPES.find((c) => c.suffix === chord.suffix);
    for (const frets of findVoicings(chord.root, type, chord.bass ?? chord.root, tuning, { limit: 12 })) {
      const midis = soundingNotes(frets, tuning);
      const match = heard.filter((m) => midis.includes(m)).length;
      const score = match - 0.5 * heard.filter((m) => !midis.includes(m)).length - 0.1 * rank;
      if (!best || score > best.score) best = { score, match, frets, midis, chord: chord.name };
    }
  });
  if (best && best.match >= 2) {
    const positions = best.frets.map((f, s) => (f === null ? null : { string: s, fret: f })).filter(Boolean);
    return { notes: best.midis, positions, chord: best.chord };
  }
  return null;
}

/**
 * 拍ごとの「安定した音」の周波数分布を作る。
 * 周波数ごとに、前後約0.3秒の中央値をとる（時間方向のメディアンフィルタ）。
 * ギターの音は鳴っている間ほぼ同じ高さで続くので残るが、歌声はビブラートで高さが揺れて
 * 同じ周波数に居続けないので弱まる。ドラムのような一瞬の音も消える。
 * そのうえで、拍の中の周波数分布を平均して、拍ごとにまとめる。
 */
export function stableBeatSpectra(signal, sampleRate, beats, period, { frame = 8192, hop = 1024, medianSeconds = 0.3 } = {}) {
  const frames = [];
  const times = [];
  for (let start = 0; start + frame <= signal.length; start += hop) {
    frames.push(magnitudeSpectrum(signal, start, frame));
    times.push((start + frame / 2) / sampleRate);
  }
  const bins = Math.min(frame / 2, Math.ceil(5000 / (sampleRate / frame)));
  const half = Math.max(1, Math.round((medianSeconds * sampleRate) / hop / 2));
  const window = new Float32Array(half * 2 + 1);
  const stable = frames.map(() => new Float32Array(frame / 2));
  for (let k = 0; k < bins; k++) {
    for (let i = 0; i < frames.length; i++) {
      let n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(frames.length - 1, i + half); j++) window[n++] = frames[j][k];
      const sorted = window.subarray(0, n).sort();
      stable[i][k] = sorted[n >> 1];
    }
  }
  return beats.map((b, idx) => {
    const end = idx + 1 < beats.length ? beats[idx + 1] : b + period;
    const sum = new Float32Array(frame / 2);
    let count = 0;
    times.forEach((t, i) => {
      if (t < b || t >= end) return;
      for (let k = 0; k < bins; k++) sum[k] += stable[i][k];
      count++;
    });
    if (count) for (let k = 0; k < bins; k++) sum[k] /= count;
    return sum;
  });
}

/**
 * 歌のメロディを追いかけて、その音（基音と倍音）を周波数分布から取り除く。
 * 短い区間ごとに「一番目立つ音」の高さを細かく測り、前後で高さが揺れている（ビブラート・なめらかな上下）なら
 * 歌とみなす。ギターの音は高さが一定なので残る。
 * 戻り値：区間ごとの { t, mags }（歌を取り除いた周波数分布）
 */
export function removeVocalFrames(signal, sampleRate, { frame = 4096, fft = 16384, hop = 2048, wobbleCents = 30, nearCents = 50 } = {}) {
  const binHz = sampleRate / fft;
  const frames = [];
  for (let start = 0; start + frame <= signal.length; start += hop) {
    const mags = magnitudeSpectrum(signal, start, frame, fft);
    const best = predominantPitch(mags, binHz);
    frames.push({ t: (start + frame / 2) / sampleRate, mags, cents: best.cents, sum: best.sum });
  }
  // 前後0.3秒の中で高さが揺れていれば歌とみなし、その音の基音と倍音を取り除く
  const span = Math.max(1, Math.round((0.15 * sampleRate) / hop));
  frames.forEach((fr, i) => {
    const near = frames.slice(Math.max(0, i - span), i + span + 1).filter((g) => Math.abs(g.cents - fr.cents) < nearCents);
    if (near.length < 3) return;
    const values = near.map((g) => g.cents);
    const wobble = Math.max(...values) - Math.min(...values);
    if (wobble < wobbleCents) return;
    removeHarmonics(fr.mags, binHz, 440 * 2 ** ((fr.cents / 100 - 69) / 12));
    fr.vocal = true;
  });
  return frames;
}

/**
 * コード譜を手がかりに、弾いた瞬間ごとの音を整える。
 * - 和音（ストローク）を弾いたらしい瞬間：その時のコードの押さえ方のうち、聞こえた音にいちばん合う形にそろえる
 * - 1音弾き：はっきり聞こえた音（いちばん強い音の strongRatio 倍以上）だけを残す
 * 和音かどうかは、弾いた瞬間の勢い（曲の中での比べ）と、同時に鳴り始めた音の数・割合で判断する。
 */
function refineWithChart(events, onsetList, timeline, tuning, { strumStrength = 1.25, strongRatio = 0.35 } = {}) {
  const strengths = onsetList.map((o) => o.strength).sort((a, b) => a - b);
  const median = strengths[Math.floor(strengths.length / 2)] || 1;
  const strengthAt = (t) => onsetList.find((o) => Math.abs(o.t - t) < 0.005)?.strength ?? median;
  return events.map((e) => {
    const peeled = e.peeled ?? e.notes.map((m) => ({ m, s: 1, share: 1 / e.notes.length }));
    const first = peeled[0]?.s ?? 1;
    const strong = peeled.filter((p) => p.s >= first * strongRatio);
    const looksStrum = strengthAt(e.t) / median >= strumStrength || (strong.length >= 3 && (peeled[0]?.share ?? 1) < 0.5);
    const seg = timeline.find((c) => e.t >= c.start - 0.05 && e.t < c.end);
    if (looksStrum && seg) {
      const parsed = parseChordName(seg.name);
      if (parsed) {
        const voicings = findVoicings(parsed.root, parsed.type, parsed.bass, tuning, { limit: 12 });
        let best = null;
        for (const frets of voicings) {
          const midis = soundingNotes(frets, tuning);
          const score = peeled.reduce((a, p) => a + (midis.includes(p.m) ? p.s : -0.5 * p.s), 0);
          if (!best || score > best.score) best = { score, frets, midis };
        }
        if (best) {
          const positions = best.frets.map((f, s) => (f === null ? null : { string: s, fret: f })).filter(Boolean);
          return { t: e.t, notes: best.midis, positions };
        }
      }
    }
    const notes = strong.map((p) => p.m).sort((a, b) => a - b);
    return notes.length ? { t: e.t, notes } : { t: e.t, notes: [peeled[0].m] };
  });
}

/**
 * 録音全体を解析する。
 * - chords: 0.1秒ごとのコードの判定（buildChordTimeline でコード進行にまとめる）
 * - events: 弾いた瞬間ごとの、新しく鳴った音（タブ譜の材料）
 */
export function transcribe(channels, sampleRate, { mode = 'auto', voiceFilter = true, method = 'peel', riseRatio = 1.3, minStrength = 0.2, harmonicRatio = 4, tuning = TUNINGS[0], snapStrums = true, snapMin = 3, peelOptions = {}, useChart = true, chartOptions = {}, noteWeight = null, chromaMethod = 'auto', harmonicResidual = 0.35, vocalOptions = {}, vocalPresence = 0.35, minBeats = 1, precise = true, highWeight = 0.6, useContext = true, contextOptions = {}, dropVocalNotes = true, voiceOptions = { wobbleCents: 60, useSwell: false }, attackRatio = 0, chordWindow = 16384, chordMinDuration = 0.5, onProgress = () => {} } = {}) {
  const { guitar, mid, useSide, sideRatio } = chooseSignal(channels, mode, sampleRate);
  const duration = guitar.length / sampleRate;

  // 1. コード：0.1秒ごとに、前後約0.37秒の音で判定する
  const chordFrames = [];
  const win = 16384;
  const cwin = chordWindow;
  const hopChord = Math.floor(sampleRate * (precise ? 0.05 : 0.1));
  const binHz = sampleRate / win;
  const loudness = [];
  for (let c = 0; c + cwin <= guitar.length; c += hopChord) loudness.push(rms(guitar.subarray(c, c + cwin)));
  const loudest = Math.max(...loudness, 1e-9);
  const zeros = new Float32Array(cwin / 2);
  let step = 0;
  for (let c = 0; c + cwin <= guitar.length; c += hopChord, step++) {
    if (step % 20 === 0) onProgress(0.4 * (c / guitar.length), 'コードを調べています');
    if (loudness[step] < loudest * 0.05) continue; // ほぼ無音
    const frameMags = magnitudeSpectrum(guitar, c, cwin);
    // コード用には倍音をしっかり取り除く（3度の音の3倍音が maj7 の音と同じ高さになり、C を Cmaj7 と読み違えるため）
    let { chroma } = analyzeSpectrum(frameMags, sampleRate, cwin, { harmonicResidual, highWeight });
    if (precise) {
      // じっくり解析：同じ場所を、長さの違う3つの区間（短い・ふつう・長い）でも見て、12音の強さを平均する。
      // 短い区間は音の変わり目に、長い区間は低い音の高さの聞き分けに強い
      const center = c + cwin / 2;
      const sum = chroma.map((v) => v / (chroma.reduce((a, b) => a + b, 0) || 1));
      for (const w of [cwin / 2, cwin * 2]) {
        const cc = analyzeSpectrum(magnitudeSpectrum(guitar, Math.round(center - w / 2), w), sampleRate, w, { harmonicResidual, highWeight }).chroma;
        const tot = cc.reduce((a, b) => a + b, 0) || 1;
        cc.forEach((v, i) => { sum[i] += v / tot; });
      }
      chroma = sum;
    }
    if (chromaMethod === 'peel') {
      // 倍音を完全にはがして見つけた音だけで、12音の強さを作る（倍音の消え残りでコードを読み違えないように）
      chroma = new Array(12).fill(0);
      peelNotes(frameMags, zeros, sampleRate / cwin, { maxNotes: 8, stopRatio: 0.1 }).forEach((n) => { chroma[n.m % 12] += n.s; });
    }
    const total = chroma.reduce((a, b) => a + b, 0) || 1;
    // ベース音は、サイドでは消えてしまうベースギターも含む真ん中の音から探す
    const { bass } = analyzeSpectrum(magnitudeSpectrum(useSide ? mid : guitar, c, cwin), sampleRate, cwin);
    const [top] = identifyFromChroma(chroma, bass, 1);
    if (top) chordFrames.push({ t: (c + cwin / 2) / sampleRate, name: top.name, confidence: top.confidence, chroma: chroma.map((v) => v / total), bass });
  }

  // 2. 弾いた瞬間を探す
  onProgress(0.4, '弾いた瞬間を探しています');
  const onsetList = detectOnsetsDetailed(guitar, sampleRate);
  const onsets = onsetList.map((o) => o.t);

  // 3. 弾いた瞬間ごとに、直前より強くなった音（＝新しく弾いた音）を拾う
  let events = [];
  onsets.forEach((t, i) => {
    if (i % 10 === 0) onProgress(0.5 + 0.5 * (i / onsets.length), 'タブ譜を作っています');
    const start = Math.floor((t + 0.02) * sampleRate);
    const next = i + 1 < onsets.length ? onsets[i + 1] : duration;
    const length = Math.max(Math.floor(0.1 * sampleRate), Math.floor((Math.min(next, t + 0.45) - t - 0.02) * sampleRate));
    // 直前の区間は、直後の区間と同じ長さにそろえる（長さが違うと低い音の強さを公平に比べられない）
    const prev = i > 0 ? onsets[i - 1] : 0;
    const preLength = Math.max(Math.floor(0.08 * sampleRate), Math.min(length, Math.floor((t - prev - 0.03) * sampleRate)));
    const post = magnitudeSpectrum(guitar, start, length, win);
    const pre = magnitudeSpectrum(guitar, Math.floor((t - 0.01) * sampleRate) - preLength, preLength, win);

    // 直後の音から直前の音を引いた「増えた分」だけを見る（鳴り続けている音を除くため）
    const added = new Float32Array(post.length);
    for (let k = 0; k < post.length; k++) added[k] = Math.max(0, post[k] - pre[k]);
    if (method === 'peel') {
      const peeled = peelNotes(post, pre, binHz, peelOptions);
      let fresh = peeled.map((e) => e.m);
      if (voiceFilter) fresh = fresh.filter((m) => !looksLikeVoice(guitar, sampleRate, m, start, length, voiceOptions));
      fresh.sort((a, b) => a - b);
      let positions = null;
      if (snapStrums && fresh.length >= snapMin) {
        const snapped = snapToVoicing(post, sampleRate, win, fresh, tuning);
        if (snapped) ({ notes: fresh, positions } = snapped);
      }
      if (fresh.length) events.push({ t, notes: fresh, ...(positions ? { positions } : {}), peeled: peeled.map((e) => ({ m: e.m, s: e.s, share: e.share })) });
      return;
    }
    // method 'diff'：増えた分のスペクトルから音を探す / 'rise'：鳴っている音を探し、直前より強くなった音を選ぶ
    const source = method === 'diff' ? added : post;
    const { notes } = analyzeSpectrum(source, sampleRate, win);
    const energies = notes
      .filter((m) => m >= LOWEST && m <= HIGHEST)
      .map((m) => ({
        m,
        now: noteEnergy(source, binHz, m),
        rise: noteEnergy(post, binHz, m) / (noteEnergy(pre, binHz, m) + 1e-9),
        fundamental: peakNear(source, binHz, freq(m), 30).mag,
      }))
      .filter((e) => method === 'diff' || e.rise >= riseRatio);
    const strongest = Math.max(...energies.map((e) => e.now), 1e-9);
    const candidates = energies.filter((e) => e.now >= strongest * minStrength).sort((a, b) => a.m - b.m);
    // 低い音の倍音（1オクターブ上・その5度上・2オクターブ上…）と同じ高さで、低い音よりはっきり強くないものは倍音とみなして除く
    const accepted = [];
    for (const e of candidates) {
      const harmonicOf = accepted.find((a) => HARMONIC_STEPS.includes(e.m - a.m) && e.fundamental < a.fundamental * harmonicRatio);
      if (harmonicOf) continue;
      // 本物の音なら倍音もそろっている。倍音が見つからない高い音は、弾いた瞬間の「カチッ」という雑音とみなす
      if (e.m >= 72 && peakNear(source, binHz, freq(e.m) * 2, 30).mag < e.fundamental * 0.1) continue;
      if (voiceFilter && looksLikeVoice(guitar, sampleRate, e.m, start, length, voiceOptions)) continue;
      if (voiceFilter && attackRatio > 0 && softAttack(guitar, sampleRate, e.m, Math.floor((t - 0.01) * sampleRate), attackRatio)) continue;
      accepted.push(e);
    }
    let fresh = accepted.slice(0, 6).map((e) => e.m);
    let positions = null;

    if (!fresh.length) {
      // 弾いた瞬間なのに新しい音が無い：鳴っていた音を同じ弦で弾き直したとみなし、いちばん強い音を使う
      const top = energies.filter((e) => e.rise >= 0.9).sort((a, b) => b.now - a.now)[0];
      if (top) fresh = [top.m];
    } else if (snapStrums && fresh.length >= snapMin) {
      // ストローク（3音以上を同時に弾いた）：コードを判定し、聞こえた音にいちばん合う押さえ方にそろえる
      const snapped = snapToVoicing(post, sampleRate, win, fresh, tuning);
      if (snapped) ({ notes: fresh, positions } = snapped);
    }
    if (fresh.length) events.push(positions ? { t, notes: fresh, positions } : { t, notes: fresh });
  });

  // 4. 拍を見つけ、拍ごとに鳴った音をまとめてコード譜にする
  onProgress(0.97, 'コード譜にまとめています');
  const beatChromasFor = (beats, period) => {
    const chromas = [];
    const basses = [];
    beats.forEach((b, k) => {
      const end = k + 1 < beats.length ? beats[k + 1] : b + period;
      const inside = chordFrames.filter((f) => f.t >= b && f.t < end);
      const chroma = new Array(12).fill(0);
      inside.forEach((f) => f.chroma.forEach((v, i) => { chroma[i] += v; }));
      // その拍の中で実際に弾いた音（倍音をはがして見つけた音）も、コードの手がかりとして足す
      const played = events.filter((e) => e.t >= b - 0.03 && e.t < end - 0.03);
      const frameTotal = chroma.reduce((a, c) => a + c, 0) || 1;
      // 弾き語りなど歌と分けられない曲では、弾いた音に歌が混ざるので使わない
      const w = noteWeight ?? (useSide ? 0.5 : 0);
      played.forEach((e) => e.notes.forEach((m) => { chroma[m % 12] += (w * frameTotal) / Math.max(1, played.length * e.notes.length); }));
      chromas.push(chroma);
      const counts = new Map();
      inside.forEach((f) => { if (f.bass !== null && f.bass !== undefined) counts.set(f.bass, (counts.get(f.bass) || 0) + 1); });
      basses.push([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    });
    return { chromas, basses };
  };
  // 拍の位置は、表と裏（8分音符のずれ）を取り違えやすい。表と裏の2つの候補のうち、
  // コードの変わり目が小節の頭にいちばんきれいにそろう位置を選ぶ
  let grid = null;
  let vocalFrames = null;
  const devocalChromas = (g) => {
    // 歌のメロディを取り除いた短い区間の音から、拍ごとの12音の強さを作り直す
    vocalFrames ??= removeVocalFrames(guitar, sampleRate, vocalOptions);
    return g.beats.map((b, k) => {
      const end = k + 1 < g.beats.length ? g.beats[k + 1] : b + g.period;
      const chroma = new Array(12).fill(0);
      vocalFrames.filter((f) => f.t >= b && f.t < end).forEach((f) => {
        const c = analyzeSpectrum(f.mags, sampleRate, 16384, { harmonicResidual }).chroma;
        const tot = c.reduce((a, v) => a + v, 0) || 1;
        c.forEach((v, i) => { chroma[i] += v / tot; });
      });
      return chroma;
    });
  };
  // 拍の区切り：表裏・直線当てはめの候補から、コードの変わり目が小節の頭にいちばんきれいにそろうものを選ぶ
  for (const [phaseShift, fitLine] of [[0, false], [0.5, false], [0, true], [0.5, true]]) {
    const g = estimateBeats(onsetList, duration, { phaseShift, fitLine });
    if (g.beats.length < 4) continue;
    let { chromas, basses } = beatChromasFor(g.beats, g.period);
    if (chromaMethod === 'devocal') chromas = devocalChromas(g);
    if (chromaMethod === 'stable') {
      chromas = stableBeatSpectra(guitar, sampleRate, g.beats, g.period).map((spec) => analyzeSpectrum(spec, sampleRate, 8192).chroma);
    }
    const { offset, score } = findDownbeatScored(chromas);
    if (!grid || score > grid.score) grid = { ...g, chromas, basses, downbeat: offset, score };
  }
  let timeline = buildChordTimeline(chordFrames, { minDuration: chordMinDuration });
  const bpm = grid?.bpm ?? null, beats = grid?.beats ?? [], downbeat = grid?.downbeat ?? 0;
  let chartInfo = null;
  let vocalShare = null;
  if (useChart && grid) {
    // 歌を取り除くかどうか：同じ高さの周りで音程が揺れる（ビブラート）区間が多い曲だけ、歌が入っているとみなして取り除く。
    // （歌の無い曲で取り除くと、ギターのメロディの音まで消してしまうため）
    const variants = [{ label: 'そのまま', chromas: grid.chromas }];
    if (chromaMethod === 'auto' && !useSide) {
      const devocal = devocalChromas(grid);
      vocalShare = vocalFrames.filter((f) => f.vocal).length / Math.max(1, vocalFrames.length);
      if (vocalShare >= vocalPresence) variants[0] = { label: '歌を除く', chromas: devocal };
    }
    let best = null;
    for (const v of variants) {
      // ベース音の信用度：聞き取ったベースの音が、その拍で強く鳴っている音（上位3つ）に入っている割合。
      // 低い音の聞き取りが不安定な録音では、ベースの音を手がかりにしない
      let agree = 0, counted = 0;
      v.chromas.forEach((c, k) => {
        const bass = grid.basses[k];
        if (bass === null || bass === undefined) return;
        counted++;
        const top3 = c.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
        if (top3.includes(bass)) agree++;
      });
      const reliability = counted ? Math.max(0, Math.min(1, (agree / counted - 0.5) / 0.35)) : 0;
      // ベースの音は少しだけ手がかりにする。分数コード（Em/D・D/C など）ではベースがルートと違い、
      // コードの外の音のこともあるので、ベースがコードの外の音でも減点しない
      const weight = (chartOptions.rootBonus ?? 0.05) * reliability;
      const states = decodeChords(v.chromas, grid.downbeat, { beatBass: grid.basses, ...chartOptions, rootBonus: weight, foreignBassPenalty: chartOptions.foreignBassPenalty ?? 0 });
      const fit = states.reduce((a, st, k) => a + cosine(v.chromas[k], st.template), 0) / Math.max(1, states.length);
      if (!best || fit > best.fit) best = { ...v, states, fit, reliability };
    }
    chartInfo = { method: best.label, vocalShare, bassReliability: best.reliability, fit: best.fit };
    // ベース音を信用できない録音では、分数コード（C/G など）にしない
    timeline = buildChart(grid.beats, best.states, grid.basses, grid.period, { allowSlash: best.reliability >= 0.6, minBeats }).filter((seg) => seg.end - seg.start > 0);
  }

  // 5. コード譜を手がかりに、1音ずつのタブ譜を整える
  if (useContext && grid) events = refineWithChart(events, onsetList, timeline, tuning, contextOptions);
  // 歌と分けられない曲：歌のメロディと同じ高さ・同じころに鳴り始めた単音は、歌とみなしてタブ譜から除く
  if (!useSide && vocalFrames && dropVocalNotes) {
    events = events.map((e) => {
      if (e.positions) return e;
      const near = vocalFrames.filter((f) => f.vocal && Math.abs(f.t - e.t) < 0.2);
      const notes = e.notes.filter((m) => !near.some((f) => Math.abs(f.cents / 100 - m) < 0.6));
      return { ...e, notes };
    }).filter((e) => e.notes.length);
  }

  onProgress(1, '完了');
  return { duration, useSide, sideRatio, chordFrames, timeline, events, bpm, beats, downbeat, chartInfo, onsets: onsetList.map(({ t, strength }) => ({ t, strength })) };
}
