// 「コード譜を鳴らす」が元の演奏をどれだけ再現できるか測る： node tests/playback-bench.js
import { transcribe } from '../transcribe.js';
import { chartPlayback } from '../song.js';
import { parseChordName } from '../chord-engine.js';
import { TUNINGS } from '../fretboard.js';
import { easiestVoicing } from '../practice.js';
import { makeSong } from './mix.js';

const tuning = TUNINGS[0];
const shapeFor = (name) => { const p = parseChordName(name); return p && easiestVoicing(p.root, p.type, p.bass, tuning, 0); };

/** 元の演奏（truth）と鳴らす音（items）を比べる */
export function scorePlayback(items, truth, { tol = 0.06 } = {}) {
  const used = new Set();
  let timing = 0, sameKind = 0, sameNotes = 0;
  truth.forEach((tr) => {
    const i = items.findIndex((it, k) => !used.has(k) && Math.abs(it.t - tr.t) <= tol);
    if (i < 0) return;
    used.add(i);
    timing++;
    const it = items[i];
    const strumTruth = tr.notes.length >= 3;
    const strumItem = it.notes.length >= 3;
    if (strumTruth === strumItem) sameKind++;
    // 鳴らした音名（12音）が元の演奏と同じか
    const pcs = (arr) => [...new Set(arr.map((m) => m % 12))].sort((a, b) => a - b).join(',');
    if (pcs(it.notes.map((n) => n.midi)) === pcs(tr.notes)) sameNotes++;
  });
  return { recall: timing / truth.length, precision: items.length ? timing / items.length : 0, sameKind: timing ? sameKind / timing : 0, sameNotes: timing ? sameNotes / timing : 0 };
}

export function runPlayback(songOpts) {
  const song = makeSong(songOpts);
  const r = transcribe(song.channels, song.sampleRate);
  const items = chartPlayback(r.events, r.timeline, shapeFor, tuning, { onsets: r.onsets });
  // 以前のやり方：拍ごとにコードの押さえ方を鳴らす
  const old = [];
  r.timeline.forEach((seg) => {
    const shape = shapeFor(seg.name);
    if (!shape) return;
    const notes = shape.map((f, s) => (f === null ? null : { midi: tuning.strings[s] + f, string: s })).filter(Boolean);
    r.beats.filter((b) => b >= seg.start - 0.02 && b < seg.end - 0.02).forEach((t) => old.push({ t, notes }));
  });
  return { now: scorePlayback(items, song.truth), before: scorePlayback(old, song.truth) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const songs = Number(process.env.SONGS || 10);
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  for (const [label, so] of [['バンド', { stereo: true }], ['ギターだけ', { withBand: false }], ['弾き語り', { stereo: false }]]) {
    const sum = { now: {}, before: {} };
    for (let seed = 1; seed <= songs; seed++) {
      const r = runPlayback({ ...so, seed });
      for (const k of ['now', 'before']) for (const [m, v] of Object.entries(r[k])) sum[k][m] = (sum[k][m] || 0) + v / songs;
    }
    for (const [k, name] of [['before', '以前（拍ごと）'], ['now', '今回（弾いた瞬間）']]) {
      const s = sum[k];
      console.log(`${label.padEnd(6, '　')} ${name.padEnd(9, '　')} 弾いた瞬間を再現 ${pct(s.recall)}  余計に鳴らさない ${pct(s.precision)}  和音／1音の区別 ${pct(s.sameKind)}  鳴らす音名が同じ ${pct(s.sameNotes)}`);
    }
  }
}
