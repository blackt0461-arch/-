// マイク判定の精度を測る： node tests/live-bench.js
// 合成した曲を、マイクが聞くのと同じように少しずつずらしながら判定させ、各小節の後半で表示されるコードが正しいか数える
import { LiveChordTracker } from '../live.js';
import { magnitudeSpectrum } from '../dsp.js';
import { makeSong } from './mix.js';

const FFT = 32768;
const FPS = 15;

export function runLive(songOpts, trackerOpts = {}) {
  const song = makeSong(songOpts);
  const [l, r] = song.channels;
  const mix = new Float32Array(l.length);
  for (let i = 0; i < mix.length; i++) mix[i] = (l[i] + r[i]) / 2; // マイクには左右が混ざって届く
  const sr = song.sampleRate;
  const hop = Math.round(sr / FPS);
  const tracker = new LiveChordTracker(sr, FFT, trackerOpts);
  const shown = [];
  let playing = false;
  for (let end = FFT; end <= mix.length; end += hop) {
    let sum = 0;
    for (let i = end - Math.round(sr * 0.1); i < end; i++) sum += mix[i] * mix[i];
    const loud = Math.sqrt(sum / (sr * 0.1)) > 0.003;
    const onset = loud && !playing;
    playing = loud;
    if (!loud) continue;
    const { candidates } = tracker.update(magnitudeSpectrum(mix, end - FFT, FFT), { wave: mix.subarray(end - 4096, end), dt: 1 / FPS, onset });
    shown.push({ t: end / sr, name: candidates[0]?.name ?? null });
  }
  let ok = 0, n = 0, changes = 0, baseChanges = 0;
  for (const c of song.chords) {
    const inBar = shown.filter((s) => s.t >= c.start && s.t < c.end);
    for (let i = 1; i < inBar.length; i++) {
      if (inBar[i].name !== inBar[i - 1].name) changes++;
      if ((inBar[i].name || '').split('/')[0] !== (inBar[i - 1].name || '').split('/')[0]) baseChanges++;
    }
    // 小節の後半（弾き始めてから音がそろった後）に表示されているコードで判定する
    shown.filter((s) => s.t >= c.start + (c.end - c.start) * 0.5 && s.t < c.end).forEach((s) => { n++; if (s.name && s.name.split('/')[0] === c.name) ok++; });
  }
  return { accuracy: n ? ok / n : 0, flicker: changes / song.chords.length, baseFlicker: baseChanges / song.chords.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const songs = Number(process.env.SONGS || 10);
  for (const [label, so] of [['ギターだけ', { withBand: false }], ['弾き語り（歌＋ギター）', { stereo: false, withRhythm: false }], ['弾き語り・歌が大きい', { stereo: false, withRhythm: false, vocalGain: 0.25 }]]) {
    for (const [name, opts] of [['以前の判定', { legacy: true }], ['新しい判定', {}]]) {
      let acc = 0, flick = 0;
      for (let seed = 1; seed <= songs; seed++) { const r = runLive({ ...so, seed }, opts); acc += r.accuracy; flick += r.flicker; }
      console.log(`${label.padEnd(12, '　')} ${name}  正解 ${(acc / songs * 100).toFixed(0)}%  1小節あたりの表示の切り替わり ${(flick / songs).toFixed(1)}回`);
    }
  }
}
