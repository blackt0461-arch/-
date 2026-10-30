// 練習の手助け：曲の調（キー）の推定と、弾きやすいカポの位置の提案

import { NOTE_NAMES, parseChordName } from './chord-engine.js';
import { findVoicings } from './fretboard.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
// 長調の各音の上にできるコードの種類（I ii iii IV V vi vii°）
const DIATONIC = [['', 'maj7', '6', 'add9', 'sus4', 'sus2'], ['m', 'm7'], ['m', 'm7'], ['', 'maj7', '6', 'add9'], ['', '7', 'sus4', '9'], ['m', 'm7'], ['dim', 'm7♭5']];

/**
 * コード譜（[{ name, start, end }]）から、曲の調を推定する。
 * 12の長調それぞれについて、その調でよく使うコード（ダイアトニックコード）がどれだけ長く鳴っているかを数え、
 * いちばん当てはまる調を選ぶ。最初か最後のコードが6番目（vi）なら短調（例：C ではなく Am）とする。
 */
export function estimateKey(timeline) {
  const chords = timeline.map((seg) => ({ ...parseChordName(seg.name), dur: seg.end - seg.start })).filter((c) => c.type);
  if (!chords.length) return null;
  let best = null;
  for (let key = 0; key < 12; key++) {
    let score = 0;
    chords.forEach(({ root, type, dur }) => {
      const degree = MAJOR_SCALE.indexOf((root - key + 12) % 12);
      if (degree < 0) return;
      score += DIATONIC[degree].includes(type.suffix) ? dur : dur * 0.3;
    });
    // 主音（I）のコードが多いほど少し優先
    chords.forEach(({ root, dur }) => { if (root === key) score += dur * 0.2; });
    if (!best || score > best.score) best = { key, score };
  }
  const relativeMinor = (best.key + 9) % 12;
  const edge = [chords[0], chords[chords.length - 1]];
  const minor = edge.some((c) => c.root === relativeMinor && c.type.suffix.startsWith('m') && !c.type.suffix.startsWith('maj'));
  return minor ? { root: relativeMinor, minor: true, name: `${NOTE_NAMES[relativeMinor]}m` } : { root: best.key, minor: false, name: NOTE_NAMES[best.key] };
}

/** 押さえ方の難しさ（大きいほど難しい）：セーハ・高いフレット・指を広げる形は難しい */
export function shapeDifficulty(frets) {
  const fretted = frets.filter((f) => f !== null && f > 0);
  if (!fretted.length) return 0;
  const min = Math.min(...fretted), max = Math.max(...fretted);
  const atMin = frets.filter((f) => f === min).length;
  const opens = frets.filter((f) => f === 0).length;
  const barre = atMin >= 2 && opens === 0 && fretted.length >= 4;
  return (barre ? 3 : 0) + Math.max(0, min - 3) * 0.5 + Math.max(0, max - min - 2) + fretted.length * 0.2;
}

/**
 * 弾きやすいカポの位置を提案する。カポ 0〜7 のそれぞれで、コード譜の各コードをいちばん弾きやすい形で押さえたときの
 * 難しさを、鳴っている長さで重みをつけて合計し、いちばん楽な位置を選ぶ（同じくらいなら、カポは低いほうを選ぶ）。
 * 戻り値：{ capo, shapes: [カポを付けたときの見た目のコード名…], saving: 今（カポなし）よりどれだけ楽になるか（0〜1） }
 */
export function suggestCapo(timeline, tuning, { maxCapo = 7 } = {}) {
  const chords = [];
  timeline.forEach((seg) => {
    const parsed = parseChordName(seg.name);
    if (!parsed) return;
    const found = chords.find((c) => c.name === seg.name);
    if (found) found.dur += seg.end - seg.start;
    else chords.push({ name: seg.name, ...parsed, dur: seg.end - seg.start });
  });
  if (!chords.length) return null;
  const costAt = (capo) => chords.reduce((sum, c) => {
    const frets = easiestVoicing(c.root, c.type, c.bass, tuning, capo);
    return sum + c.dur * (frets ? shapeDifficulty(frets) : 8);
  }, 0);
  const costs = Array.from({ length: maxCapo + 1 }, (_, capo) => costAt(capo));
  let capo = 0;
  costs.forEach((cost, i) => { if (cost < costs[capo] * 0.85) capo = i; });
  const shapes = chords
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 4)
    .map((c) => NOTE_NAMES[(c.root - capo + 12) % 12] + c.type.suffix);
  return { capo, shapes, saving: costs[0] > 0 ? 1 - costs[capo] / costs[0] : 0 };
}

/** いちばん弾きやすい押さえ方（候補の中で shapeDifficulty が最小、同じなら低いポジション） */
export function easiestVoicing(root, type, bass, tuning, capo = 0) {
  const candidates = findVoicings(root, type, bass, tuning, { capo, limit: 6 });
  let best = null;
  for (const frets of candidates) {
    const d = shapeDifficulty(frets);
    if (!best || d < best.d - 1e-9) best = { frets, d };
  }
  return best?.frets ?? null;
}
