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

test('add9・m(maj7)・9th などを判定できる', () => {
  assert.equal(nameFromShape('x32030'), 'Cadd9');
  assert.equal(nameFromShape('x02110'), 'Am(maj7)');
  assert.equal(nameFromShape('x32330'), 'C9');
  assert.equal(nameFromShape('x02030'), 'A7sus4');
  assert.equal(nameFromShape('x00232'), 'D/A');
});

test('どれにも当てはまらない形は「近い形」として余分な音を添える', () => {
  // C E G と F#（♯11）
  const result = identifyFromNotes([pc('C'), pc('E'), pc('G'), pc('F#')], pc('C'));
  assert.equal(result[0].name, 'C(+F#)');
  assert.equal(result[0].approx, true);
  assert.deepEqual(result[0].degrees, ['R', '3', '5', '♯11']);
});

test('構成音を度数に合わせた正しい音名で書く', async () => {
  const { spellNote } = await import('../chord-engine.js');
  assert.equal(spellNote(0, '♭♭7', 9), 'B♭♭');
  assert.equal(spellNote(pc('E♭'), '3', 7), 'G');
  assert.equal(spellNote(pc('F#'), '3', 10), 'A#');
  const [cdim7] = identifyFromNotes([0, 3, 6, 9], 0);
  assert.deepEqual(cdim7.notes, ['C', 'E♭', 'G♭', 'B♭♭']);
  assert.equal(identifyFromNotes([pc('B♭'), pc('D'), pc('F')], pc('B♭'))[0].notes.join(' '), 'B♭ D F');
});

test('コード名を読み取れる（書き方のゆれにも対応）', async () => {
  const { parseChordName } = await import('../chord-engine.js');
  const read = (t) => { const r = parseChordName(t); return r && `${NOTE_NAMES[r.root]}${r.type.suffix}/${NOTE_NAMES[r.bass]}`; };
  assert.equal(read('CM7'), 'Cmaj7/C');
  assert.equal(read('F#m7-5'), 'F#m7♭5/F#');
  assert.equal(read('D/F#'), 'D/F#');
  assert.equal(read('Bbm'), 'B♭m/B♭');
  assert.equal(read('C6/9'), 'C6(9)/C');
  assert.equal(read('Am(maj7)'), 'Am(maj7)/A');
  assert.equal(read('Hm'), null);
});

test('コード名から、定番の押さえ方を探せる', async () => {
  const { parseChordName } = await import('../chord-engine.js');
  const { findVoicings } = await import('../fretboard.js');
  const first = (name, tuning = STANDARD, capo = 0) => {
    const { root, type, bass } = parseChordName(name);
    return findVoicings(root, type, bass, tuning, { capo }).map(formatShape);
  };
  assert.ok(first('C').includes('x32010'));
  assert.ok(first('G').includes('320003'));
  assert.ok(first('Am').includes('x02210'));
  assert.ok(first('F').includes('133211'));
  assert.ok(first('Bm').includes('x24432'));
  assert.ok(first('D/F#').includes('200232'));
  assert.ok(first('Cadd9').includes('x32030'));
  // 見つけた押さえ方は、判定するとちゃんとそのコードになる
  for (const name of ['C', 'Em7', 'Bm7♭5', 'Asus4', 'G/B']) {
    for (const shape of first(name)) assert.equal(nameFromShape(shape), name, `${name} の押さえ方 ${shape}`);
  }
  // カポ2なら D の形は「C の形」で押さえられる
  assert.ok(first('D', STANDARD, 2).includes('x32010'));
});

test('チューナー：倍音の多い音でも高さを正確に測れる', async () => {
  const { detectPitch } = await import('../audio.js');
  const sr = 48000;
  for (const f of [73.42, 82.41, 110, 196, 329.63]) {
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) {
      for (let h = 1; h <= 8; h++) buf[i] += (Math.sin(2 * Math.PI * f * h * i / sr + h) * (h === 1 ? 0.3 : 1)) / h;
    }
    const cents = 1200 * Math.log2(detectPitch(buf, sr) / f);
    assert.ok(Math.abs(cents) < 1, `${f}Hz で ${cents.toFixed(2)} セントずれた`);
  }
  assert.equal(detectPitch(new Float32Array(4096), sr), null);
});
