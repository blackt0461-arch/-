// 録音（画面収録など）の音から、ギターのコード進行とタブ譜の材料を作る
// ブラウザのワーカー（画面を固めずに裏で計算する仕組み）でも、テストでも動くように、画面の部品は使わない

import { magnitudeSpectrum, peakNear, noteEnergy } from './dsp.js';
import { analyzeSpectrum } from './audio.js';
import { identifyFromChroma, CHORD_TYPES } from './chord-engine.js';
import { TUNINGS, findVoicings, soundingNotes } from './fretboard.js';
import { buildChordTimeline } from './song.js';

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
export function chooseSignal(channels, mode = 'auto') {
  const [l, r = l] = channels;
  const mid = new Float32Array(l.length);
  const side = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) {
    mid[i] = (l[i] + r[i]) / 2;
    side[i] = (l[i] - r[i]) / 2;
  }
  const sideRatio = rms(side) / (rms(mid) || 1);
  const useSide = mode === 'side' || (mode === 'auto' && sideRatio > 0.2);
  return { guitar: useSide ? side : mid, mid, useSide, sideRatio };
}

/**
 * 「弾いた瞬間」を探す（スペクトルフラックス法）。
 * 短い区間ごとに周波数ごとの強さを求め、前の区間より強くなった分を合計する。
 * その合計が周りより飛び抜けて大きいところが、音の鳴り始め。
 */
export function detectOnsets(signal, sampleRate, { frame = 2048, hop = 512, minGap = 0.06 } = {}) {
  const binHz = sampleRate / frame;
  const lo = Math.floor(80 / binHz), hi = Math.ceil(5000 / binHz);
  const flux = [];
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
    prev = cur;
  }
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
    if (onsets.length && t - onsets[onsets.length - 1] < minGap) continue;
    onsets.push(t);
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
 * 録音全体を解析する。
 * - chords: 0.1秒ごとのコードの判定（buildChordTimeline でコード進行にまとめる）
 * - events: 弾いた瞬間ごとの、新しく鳴った音（タブ譜の材料）
 */
export function transcribe(channels, sampleRate, { mode = 'auto', voiceFilter = true, method = 'rise', riseRatio = 1.3, minStrength = 0.2, harmonicRatio = 4, tuning = TUNINGS[0], snapStrums = true, snapMin = 3, voiceOptions = { wobbleCents: 60, useSwell: false }, attackRatio = 0, chordWindow = 16384, chordMinDuration = 0.5, onProgress = () => {} } = {}) {
  const { guitar, mid, useSide, sideRatio } = chooseSignal(channels, mode);
  const duration = guitar.length / sampleRate;

  // 1. コード：0.1秒ごとに、前後約0.37秒の音で判定する
  const chordFrames = [];
  const win = 16384;
  const cwin = chordWindow;
  const hopChord = Math.floor(sampleRate * 0.1);
  const binHz = sampleRate / win;
  const loudness = [];
  for (let c = 0; c + cwin <= guitar.length; c += hopChord) loudness.push(rms(guitar.subarray(c, c + cwin)));
  const loudest = Math.max(...loudness, 1e-9);
  let step = 0;
  for (let c = 0; c + cwin <= guitar.length; c += hopChord, step++) {
    if (step % 20 === 0) onProgress(0.4 * (c / guitar.length), 'コードを調べています');
    if (loudness[step] < loudest * 0.05) continue; // ほぼ無音
    const { chroma } = analyzeSpectrum(magnitudeSpectrum(guitar, c, cwin), sampleRate, cwin);
    // ベース音は、サイドでは消えてしまうベースギターも含む真ん中の音から探す
    const { bass } = analyzeSpectrum(magnitudeSpectrum(useSide ? mid : guitar, c, cwin), sampleRate, cwin);
    const [top] = identifyFromChroma(chroma, bass, 1);
    if (top) chordFrames.push({ t: (c + cwin / 2) / sampleRate, name: top.name, confidence: top.confidence });
  }

  // 2. 弾いた瞬間を探す
  onProgress(0.4, '弾いた瞬間を探しています');
  const onsets = detectOnsets(guitar, sampleRate);

  // 3. 弾いた瞬間ごとに、直前より強くなった音（＝新しく弾いた音）を拾う
  const events = [];
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

  onProgress(1, '完了');
  return { duration, useSide, sideRatio, chordFrames, timeline: buildChordTimeline(chordFrames, { minDuration: chordMinDuration }), events };
}
