// AI の聞き取り結果（確率）から音を取り出す部分のテスト： node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchNotes, pitchChroma, resampleClean, PITCH_FPS } from '../ai-pitch.js';

// 作り物の聞き取り結果：frames コマ・88 鍵。notes：[{ midi, from, to }]（コマ番号）
function fakeAI(frames, notes) {
  const note = new Float32Array(frames * 88), onset = new Float32Array(frames * 88);
  notes.forEach(({ midi, from, to }) => {
    const p = midi - 21;
    for (let t = from; t < to; t++) note[t * 88 + p] = 0.8;
    onset[from * 88 + p] = 0.9;
    if (from > 0) onset[(from - 1) * 88 + p] = 0.4;
    onset[(from + 1) * 88 + p] = 0.4;
  });
  return { fps: PITCH_FPS, frames, note, onset };
}

test('鳴っている音を、時刻と高さで取り出す', () => {
  const ai = fakeAI(200, [{ midi: 52, from: 10, to: 60 }, { midi: 64, from: 100, to: 150 }]);
  const notes = pitchNotes(ai);
  assert.deepEqual(notes.map((n) => n.midi), [52, 64]);
  assert.ok(Math.abs(notes[0].t - 10 / PITCH_FPS) < 1e-6);
  assert.ok(Math.abs(notes[1].end - 150 / PITCH_FPS) < 0.05);
});

test('短すぎる音は捨てる', () => {
  const ai = fakeAI(100, [{ midi: 60, from: 10, to: 14 }]);
  assert.equal(pitchNotes(ai, { minFrames: 6 }).length, 0);
});

test('12音の強さといちばん低い音', () => {
  const ai = fakeAI(100, [{ midi: 48, from: 0, to: 100 }, { midi: 52, from: 0, to: 100 }, { midi: 55, from: 0, to: 100 }]);
  const { chroma, bass } = pitchChroma(ai, 0.1, 0.9);
  assert.equal(bass, 0); // C
  assert.ok(chroma[0] > 0.5 && chroma[4] > 0.5 && chroma[7] > 0.5 && chroma[2] === 0);
});

test('音の速さを直しても、音の高さは変わらない', () => {
  const from = 44100, to = 22050, f = 440;
  const x = Float32Array.from({ length: from }, (_, i) => Math.sin((2 * Math.PI * f * i) / from));
  const y = resampleClean(x, from, to);
  assert.equal(y.length, to);
  // ゼロをまたぐ回数から高さを測る
  let cross = 0;
  for (let i = 1000; i < y.length - 1000; i++) if (y[i - 1] < 0 && y[i] >= 0) cross++;
  assert.ok(Math.abs(cross / ((y.length - 2000) / to) - f) < 3);
});
