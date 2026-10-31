// 本物の曲をマイクで聞いた場合の答え合わせ： node tests/real-live-eval.js 音声.f32 正解.json '{トラッカーの設定}'
import fs from 'node:fs';
import { loadAudio } from './real-song-eval.js';
import { LiveChordTracker } from '../live.js';
import { magnitudeSpectrum } from '../dsp.js';
import { parseChordName } from '../chord-engine.js';

export function evaluateLive(channels, sr, truth, trackerOpts = {}, { fps = 15, fft = 16384 } = {}) {
  const mix = new Float32Array(channels[0].length);
  for (let i = 0; i < mix.length; i++) mix[i] = (channels[0][i] + channels[1][i]) / 2;
  const dur = mix.length / sr;
  const segs = truth.map(([s, n], i) => ({ start: s, end: i + 1 < truth.length ? truth[i + 1][0] : dur, name: n }));
  const same = (a, b) => { const pa = a && parseChordName(a.split('/')[0]), pb = parseChordName(b); return Boolean(pa && pb && pa.root === pb.root && pa.type.suffix === pb.type.suffix); };
  const tracker = new LiveChordTracker(sr, fft, trackerOpts);
  const hop = Math.round(sr / fps);
  const shown = [];
  for (let end = fft; end <= mix.length; end += hop) {
    const { candidates } = tracker.update(magnitudeSpectrum(mix, end - fft, fft), { wave: mix.subarray(end - 4096, end), dt: 1 / fps, onset: end === fft });
    shown.push({ t: end / sr, name: candidates[0]?.name });
  }
  let ok = 0, n = 0;
  segs.forEach((s) => shown.filter((x) => x.t >= s.start + (s.end - s.start) * 0.5 && x.t < s.end).forEach((x) => { n++; if (same(x.name, s.name)) ok++; }));
  return { accuracy: ok / n, shown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [audioPath, truthPath, optsJson] = process.argv.slice(2);
  const { channels, sampleRate } = loadAudio(audioPath);
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
  const opts = JSON.parse(optsJson || '{}');
  console.log(`正解 ${(evaluateLive(channels, sampleRate, truth, opts.tracker ?? opts, { fft: opts.fft ?? 16384 }).accuracy * 100).toFixed(0)}%`);
}
