// マイク判定の精度を測る： node tests/accuracy-bench.js
import { identifyFromChroma } from '../chord-engine.js';
import { analyzeSpectrum, NoiseProfile } from '../audio.js';
import { TUNINGS, parseShape, soundingNotes } from '../fretboard.js';
import { synthChord, synthNoise, spectrum, SAMPLE_RATE, BENCH_CHORDS } from './synth.js';

const FFT_SIZE = Number(process.env.FFT_SIZE || 16384);
const SEEDS = 6;

export function runBench({ fftSize = FFT_SIZE, noise = 0, useNoiseProfile = true, seedOffset = 0 } = {}) {
  // アプリと同じく、弾く前の雑音を何回か聞いて覚えておく
  const profile = new NoiseProfile();
  if (useNoiseProfile) for (let i = 0; i < 10; i++) profile.learn(spectrum(synthNoise({ seed: 9000 + i, fftSize, noise })));
  let exact = 0, chordOnly = 0, total = 0;
  const misses = [];
  for (const [shape, expected] of BENCH_CHORDS) {
    const midis = soundingNotes(parseShape(shape), TUNINGS[0]);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const mags = spectrum(synthChord(midis, { seed: seed * 101 + midis[0] + seedOffset, fftSize, noise }));
      const { chroma, bass } = analyzeSpectrum(useNoiseProfile ? profile.subtract(mags) : mags, SAMPLE_RATE, fftSize);
      const got = identifyFromChroma(chroma, bass)[0]?.name ?? '―';
      total++;
      if (got === expected) exact++;
      else misses.push(`${expected}→${got}`);
      if (got.split('/')[0] === expected.split('/')[0]) chordOnly++;
    }
  }
  return { exact: exact / total, chordOnly: chordOnly / total, total, misses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [
    ['静かな部屋', { noise: 0 }],
    ['静かな部屋（別の乱数で検証）', { noise: 0, seedOffset: 7777 }],
    ['雑音あり・雑音対策なし', { noise: 1, useNoiseProfile: false }],
    ['雑音あり・雑音対策あり', { noise: 1 }],
    ['強い雑音・雑音対策なし', { noise: 2, useNoiseProfile: false }],
    ['強い雑音・雑音対策あり', { noise: 2 }],
  ];
  for (const [label, opts] of cases) {
    const r = runBench(opts);
    const counts = {};
    r.misses.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`).join(', ');
    console.log(`${label.padEnd(16, '　')} 完全一致 ${(r.exact * 100).toFixed(1).padStart(5)}%  コード名一致 ${(r.chordOnly * 100).toFixed(1).padStart(5)}%  ${top}`);
  }
}
