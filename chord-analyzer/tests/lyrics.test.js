import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics, placeChords, applyEdit, diffTimelines, habitKey, lineSpans } from '../lyrics.js';
import { parseChordName } from '../chord-engine.js';

const TL = [
  { start: 0, end: 4, name: 'C' }, { start: 4, end: 6, name: 'Fmaj7' }, { start: 6, end: 8, name: 'G' },
  { start: 8, end: 10, name: 'C' }, { start: 10, end: 14, name: 'Am7' },
];

test('歌詞を行に分ける（空の行は区切りとして1つだけ残す）', () => {
  const lines = parseLyrics('あいう\n\n\nえお\n');
  assert.deepEqual(lines.map((l) => l.text), ['あいう', '', 'えお']);
});

test('コードを、変わった時間の割合で歌詞の文字の上に載せる', () => {
  const lines = parseLyrics('あいうえおかきくけこ\nさしすせそ');
  const placed = placeChords(lines, { 0: 0, 1: 8 }, TL, { duration: 14 });
  // 1行目：0〜8秒。C は頭、Fmaj7 は 4秒（半分＝5文字目）、G は 6秒（7〜8文字目）
  assert.deepEqual(placed[0].marks.map((m) => [m.pos, m.name]), [[0, 'C'], [5, 'Fmaj7'], [8, 'G']]);
  assert.equal(placed[1].marks[0].name, 'C');
});

test('コードの名前・位置の訂正と、訂正の一覧・くせ', () => {
  let tl = applyEdit(TL, { kind: 'rename', seg: 1, name: 'F' });
  tl = applyEdit(tl, { kind: 'move', seg: 2, start: 6.5 });
  assert.equal(tl[1].name, 'F');
  assert.equal(tl[2].start, 6.5);
  const d = diffTimelines(TL, tl);
  assert.equal(d[0].before, 'Fmaj7');
  assert.equal(d[0].after, 'F');
  assert.equal(habitKey('Fmaj7', 'F', parseChordName), 'maj7→');
  // 同じコードが隣に並んだらまとめる
  const merged = applyEdit(TL, { kind: 'rename', seg: 2, name: 'Fmaj7' });
  assert.equal(merged.length, TL.length - 1);
  assert.equal(lineSpans([{ text: 'a' }], { 0: 2 }, 10)[0].start, 2);
});
