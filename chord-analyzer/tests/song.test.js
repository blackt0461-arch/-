import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId, formatTime, buildChordTimeline, detectNoteEvents, assignTab, formatTab } from '../song.js';
import { TUNINGS } from '../fretboard.js';

const STANDARD = TUNINGS[0];

test('YouTube のいろいろな形のリンクから動画 ID を取り出せる', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}&t=30s`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=RD`,
    id,
  ]) assert.equal(parseYouTubeId(url), id, url);
  assert.equal(parseYouTubeId('https://example.com/'), null);
  assert.equal(formatTime(65.9), '1:05');
});

test('一瞬の誤判定や信頼度の低いところをならして、コード進行にまとめる', () => {
  const frames = [];
  const add = (from, to, name, confidence = 90) => { for (let t = from; t < to; t += 0.1) frames.push({ t, name, confidence }); };
  add(0, 2, 'C');
  frames.push({ t: 2.0, name: 'Am', confidence: 90 }); // 一瞬の誤判定
  add(2.1, 4, 'G');
  add(4, 4.3, 'F#dim', 40);                              // 信頼度が低い
  add(4.3, 6, 'Am');
  const timeline = buildChordTimeline(frames);
  assert.deepEqual(timeline.map((s) => s.name), ['C', 'G', 'Am']);
  assert.ok(Math.abs(timeline[1].start - 2.0) < 0.3);
});

test('鳴り始めた音だけを拾い、同時に鳴った音は和音としてまとめる', () => {
  // 実際は1秒に約30回判定するので、鳴り続けている音は毎回の判定に出てくる
  const frames = [];
  for (let t = 0; t < 1.0; t += 0.05) frames.push({ t, notes: t >= 0.5 ? [64, 67] : [64] }); // 0.5秒で 67 が加わる
  frames.push({ t: 1.0, notes: [60] });
  frames.push({ t: 1.05, notes: [60, 64] }); // 64 はいったん止まってから → 60 とほぼ同時に鳴った和音
  frames[frames.length - 1].t = 1.4; // 64 が止まってから 0.25 秒以上たって鳴り直した
  frames[frames.length - 2].t = 1.38;
  assert.deepEqual(detectNoteEvents(frames).map((e) => e.notes), [[64], [67], [60, 64]]);
});

test('手の移動が少なく、低いフレットになるようにタブ譜を割り当てる', () => {
  // E4 G4 A4 の短いフレーズ → 1弦 0・3・5 が自然
  const tab = assignTab([{ t: 0, notes: [64] }, { t: 1, notes: [67] }, { t: 2, notes: [69] }], STANDARD);
  assert.deepEqual(tab.map((e) => e.positions.map((p) => `${6 - p.string}弦${p.fret}`)), [['1弦0'], ['1弦3'], ['1弦5']]);
  // 和音（C3 E3 G3）は弦が重ならないように
  const [chord] = assignTab([{ t: 0, notes: [48, 52, 55] }], STANDARD);
  assert.equal(new Set(chord.positions.map((p) => p.string)).size, 3);
  // 長い曲でもすぐ終わる
  const long = Array.from({ length: 3000 }, (_, i) => ({ t: i * 0.2, notes: [52 + (i % 12)] }));
  const start = Date.now();
  assert.equal(assignTab(long, STANDARD).length, 3000);
  assert.ok(Date.now() - start < 2000);
});

test('タブ譜を文字で書く（上が1弦）', () => {
  const text = formatTab([
    { t: 12, positions: [{ string: 5, fret: 0 }] },
    { t: 13, positions: [{ string: 4, fret: 1 }, { string: 1, fret: 3 }] },
    { t: 14, positions: [{ string: 3, fret: 12 }] },
  ]);
  assert.equal(text, [
    '0:12',
    'e|-0------|',
    'B|---1----|',
    'G|-----12-|',
    'D|--------|',
    'A|---3----|',
    'E|--------|',
  ].join('\n'));
});

test('ベース音だけ違う判定（G と G/D）が交互に出ても、1つのコードとしてまとめる', () => {
  const frames = [];
  for (let t = 0; t < 3; t += 0.1) frames.push({ t, name: 'C', confidence: 90 });
  for (let t = 3; t < 6; t += 0.1) frames.push({ t, name: Math.round(t * 10) % 4 < 2 ? 'G' : 'G/D', confidence: 90 });
  for (let t = 6; t < 7; t += 0.1) frames.push({ t, name: 'G', confidence: 90 });
  const timeline = buildChordTimeline(frames);
  assert.deepEqual(timeline.map((s) => s.name), ['C', 'G']);
});
