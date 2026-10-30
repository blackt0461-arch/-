// 録音ファイル解析の精度を測る： node tests/transcribe-bench.js
import { transcribe } from '../transcribe.js';
import { makeSong, scoreNotes } from './mix.js';

function chordAccuracy(timeline, truth) {
  // 正解の各小節の真ん中の時刻で、予想したコード（ベース音は無視）が合っているか
  let ok = 0;
  for (const c of truth) {
    const t = (c.start + c.end) / 2;
    const seg = timeline.find((s) => t >= s.start && t <= s.end + 0.2);
    if (seg && seg.name.split('/')[0] === c.name) ok++;
  }
  return ok / truth.length;
}

export function runCase(label, songOpts, transcribeOpts = {}) {
  const song = makeSong(songOpts);
  const t0 = Date.now();
  const r = transcribe(song.channels, song.sampleRate, transcribeOpts);
  const ms = Date.now() - t0;
  const s = scoreNotes(r.events, song.truth);
  const so = scoreNotes(r.events, song.truth, { octaveFree: true });
  return {
    label, f1: s.f1, precision: s.precision, recall: s.recall, octaveFreeF1: so.f1,
    chords: chordAccuracy(r.timeline, song.chords), useSide: r.useSide, ms, timeline: r.timeline,
  };
}

export const CONDITIONS = [
  ['ギターだけ', { withBand: false }],
  ['バンド・ステレオ', { stereo: true }],
  ['弾き語り', { stereo: false }],
  ['弾き語り・歌が大きい', { stereo: false, vocalGain: 0.25 }],
];

/** いくつもの曲で測って平均する */
export function runBench(transcribeOpts = {}, { songs = 8, conditions = CONDITIONS } = {}) {
  return conditions.map(([label, so]) => {
    const rs = [];
    for (let seed = 1; seed <= songs; seed++) rs.push(runCase(label, { ...so, seed }, transcribeOpts));
    const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    return { label, f1: avg('f1'), precision: avg('precision'), recall: avg('recall'), chords: avg('chords'), worst: Math.min(...rs.map((r) => r.chords)) };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = JSON.parse(process.argv[2] || '{}');
  const pct = (x) => `${(x * 100).toFixed(0).padStart(3)}%`;
  for (const r of runBench(opts, { songs: Number(process.env.SONGS || 10) })) {
    console.log(`${r.label.padEnd(10, '　')} 音 ${pct(r.f1)}（適合${pct(r.precision)} 再現${pct(r.recall)}）  コード譜 ${pct(r.chords)}（いちばん悪い曲 ${pct(r.worst)}）`);
  }
}
