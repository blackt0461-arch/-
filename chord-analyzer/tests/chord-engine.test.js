import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyFromNotes, identifyFromChroma, NOTE_NAMES } from '../chord-engine.js';
import { analyzeSpectrum } from '../audio.js';
import { TUNINGS, parseShape, formatShape, soundingNotes } from '../fretboard.js';

const STANDARD = TUNINGS[0];
const pc = (name) => NOTE_NAMES.indexOf(name);

function nameFromShape(shape, tuning = STANDARD, capo = 0) {
  const notes = soundingNotes(parseShape(shape), tuning, capo);
  const result = identifyFromNotes(notes.map((n) => n % 12), Math.min(...notes) % 12);
  return result[0]?.name;
}

test('よく使うオープンコードを判定できる', () => {
  assert.equal(nameFromShape('x32010'), 'C');
  assert.equal(nameFromShape('320003'), 'G');
  assert.equal(nameFromShape('xx0232'), 'D');
  assert.equal(nameFromShape('x02210'), 'Am');
  assert.equal(nameFromShape('022000'), 'Em');
  assert.equal(nameFromShape('xx0231'), 'Dm');
  assert.equal(nameFromShape('x02220'), 'A');
  assert.equal(nameFromShape('022100'), 'E');
});

test('セブンス系・sus・dim・aug を判定できる', () => {
  assert.equal(nameFromShape('x32310'), 'C7');
  assert.equal(nameFromShape('x32000'), 'Cmaj7');
  assert.equal(nameFromShape('x02010'), 'Am7');
  assert.equal(nameFromShape('xx0233'), 'Dsus4');
  assert.equal(nameFromShape('xx0230'), 'Dsus2');
  assert.equal(nameFromShape('x3424x'), 'Cdim7');
  assert.equal(nameFromShape('x3211x'), 'Caug');
  assert.equal(nameFromShape('x2323x'), 'Bm7♭5');
  assert.equal(nameFromShape('x022x0'), 'A5');
});

test('5度を省略したセブンスコードも判定できる', () => {
  assert.equal(nameFromShape('x3x35x'), 'C7');
});

test('分数コード（転回形）を判定できる', () => {
  assert.equal(nameFromShape('032010'), 'C/E');
  assert.equal(nameFromShape('3x0003'), 'G');
  assert.equal(nameFromShape('xx0212'), 'D7');
  assert.equal(nameFromShape('2x0232'), 'D/F#');
});

test('同じ構成音の別名も候補に並ぶ（C6 と Am7/C）', () => {
  const result = identifyFromNotes([pc('C'), pc('E'), pc('G'), pc('A')], pc('C'));
  assert.deepEqual(result.slice(0, 2).map((r) => r.name), ['C6', 'Am7/C']);
  assert.deepEqual(result[0].degrees, ['R', '3', '5', '6']);
});

test('チューニングとカポを反映する', () => {
  const dropD = TUNINGS.find((t) => t.id === 'drop-d');
  assert.equal(nameFromShape('000232', dropD), 'D');
  assert.equal(nameFromShape('x32010', STANDARD, 2), 'D');
});

test('押さえ方の文字列を読み書きできる', () => {
  assert.deepEqual(parseShape('x32010'), [null, 3, 2, 0, 1, 0]);
  assert.deepEqual(parseShape('X-10-12-12-11-10'), [null, 10, 12, 12, 11, 10]);
  assert.equal(parseShape('x3201'), null);
  assert.equal(parseShape('x3201a'), null);
  assert.equal(formatShape([null, 3, 2, 0, 1, 0]), 'x32010');
  assert.equal(formatShape([null, 10, 12, 12, 11, 10]), 'x-10-12-12-11-10');
});

test('クロマ（音の強さ）からコードと信頼度を求められる', () => {
  const chroma = new Array(12).fill(0.02);
  chroma[pc('A')] = 1; chroma[pc('C')] = 0.8; chroma[pc('E')] = 0.9;
  const [top] = identifyFromChroma(chroma, pc('A'));
  assert.equal(top.name, 'Am');
  assert.ok(top.confidence >= 90);

  const [slash] = identifyFromChroma(chroma, pc('E'));
  assert.equal(slash.name, 'Am/E');
});

test('倍音を含む音の山からクロマとベース音を取り出せる（Cコード）', () => {
  const sampleRate = 48000, fftSize = 16384;
  const mags = new Float32Array(fftSize / 2);
  const addTone = (midi, amp) => {
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    for (let h = 1; h <= 6; h++) {
      const k = Math.round((f0 * h) / (sampleRate / fftSize));
      if (k < mags.length) mags[k] += amp / h;
    }
  };
  // x32010 の C コード：C3 E3 G3 C4 E4
  [48, 52, 55, 60, 64].forEach((m) => addTone(m, 1));
  const { chroma, bass } = analyzeSpectrum(mags, sampleRate, fftSize);
  assert.equal(bass, pc('C'));
  assert.equal(identifyFromChroma(chroma, bass)[0].name, 'C');
});

test('雑音を覚えて差し引くと、雑音の多いマイクでもコードを判定できる', async () => {
  const { NoiseProfile } = await import('../audio.js');
  const { synthChord, synthNoise, spectrum, SAMPLE_RATE } = await import('./synth.js');
  const fftSize = 16384;
  const profile = new NoiseProfile();
  for (let i = 0; i < 6; i++) profile.learn(spectrum(synthNoise({ seed: 50 + i, fftSize, noise: 1 })));
  // x02010 の Am7（A2 E3 G3 C4 E4）
  const mags = spectrum(synthChord([45, 52, 55, 60, 64], { seed: 3, fftSize, noise: 1 }));
  const { chroma, bass } = analyzeSpectrum(profile.subtract(mags), SAMPLE_RATE, fftSize);
  assert.equal(identifyFromChroma(chroma, bass)[0].name, 'Am7');
});
