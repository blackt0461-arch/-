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

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [
    ['ギターだけ', { withBand: false }],
    ['バンド・ステレオ', { stereo: true }],
    ['バンド・ステレオ（歌フィルタなし）', { stereo: true }, { voiceFilter: false }],
    ['バンド・ステレオ（左右分離なし）', { stereo: true }, { mode: 'mix' }],
    ['弾き語り（全部真ん中）', { stereo: false }],
    ['弾き語り（歌フィルタなし）', { stereo: false }, { voiceFilter: false }],
    ['弾き語り・歌が大きい', { stereo: false, vocalGain: 0.25 }],
  ];
  for (const [label, so, to] of cases) {
    const r = runCase(label, so, to);
    const pct = (x) => `${(x * 100).toFixed(0).padStart(3)}%`;
    console.log(`${label.padEnd(18, '　')} 音F1 ${pct(r.f1)}（適合${pct(r.precision)} 再現${pct(r.recall)}） オクターブ無視F1 ${pct(r.octaveFreeF1)}  コード ${pct(r.chords)}  左右分離:${r.useSide ? 'あり' : 'なし'}  ${r.ms}ms`);
  }
}
