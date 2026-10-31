import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, buildChordTimeline, assignTab, formatTab } from '../song.js';
import { TUNINGS } from '../fretboard.js';

const STANDARD = TUNINGS[0];

test('秒を「分:秒」で書く', () => {
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

test('録音の解析：ギターが左右に分かれた曲では、歌を弱めてタブ譜の材料を作れる', async () => {
  const { runCase } = await import('./transcribe-bench.js');
  const r = runCase('バンド', { stereo: true });
  assert.equal(r.useSide, true);
  assert.ok(r.f1 >= 0.7, `音の正解率 ${(r.f1 * 100).toFixed(0)}%`);
  assert.ok(r.chords >= 0.85, `コードの正解率 ${(r.chords * 100).toFixed(0)}%`);
});

test('拍（テンポ）を見つけ、小節ごとのコード譜を作れる', async () => {
  const { makeSong } = await import('./mix.js');
  const { transcribe } = await import('../transcribe.js');
  const song = makeSong({ stereo: true, seed: 3 });
  const r = transcribe(song.channels, song.sampleRate);
  assert.ok(Math.abs(r.bpm - song.tempo) <= 3, `テンポ ${r.bpm}（正解 ${song.tempo}）`);
  const ok = song.chords.filter((c) => {
    const t = (c.start + c.end) / 2;
    const seg = r.timeline.find((s) => t >= s.start && t <= s.end + 0.2);
    return seg && seg.name.split('/')[0] === c.name;
  }).length;
  assert.ok(ok >= 7, `コード譜 ${ok}/8`);
});

test('マイク判定：歌いながら弾いても、以前より正しくコードを表示できる', async () => {
  const { runLive } = await import('./live-bench.js');
  let before = 0, after = 0;
  for (const seed of [1, 2, 3]) {
    const song = { stereo: false, withRhythm: false, vocalGain: 0.25, seed };
    before += runLive(song, { legacy: true }).accuracy / 3;
    after += runLive(song).accuracy / 3;
  }
  assert.ok(after >= 0.8, `新しい判定 ${(after * 100).toFixed(0)}%`);
  assert.ok(after > before + 0.1, `以前 ${(before * 100).toFixed(0)}% → 新しい ${(after * 100).toFixed(0)}%`);
});

test('全弦チューナー：6本を同時に鳴らしても、弦ごとのずれを測れる', async () => {
  const { measureStrings } = await import('../audio.js');
  const { magnitudeSpectrum } = await import('../dsp.js');
  const sr = 48000, n = 32768;
  const targets = [40, 45, 50, 55, 59, 64];
  for (const detune of [[12, -18, 5, 25, -8, -30], [-25, 7, -12, 0, 18, 10], [0, 0, 0, 0, 0, 0]]) {
    const sig = new Float32Array(n);
    targets.forEach((m, s) => {
      const f0 = 440 * 2 ** ((m - 69 + detune[s] / 100) / 12);
      for (let h = 1; h <= 10; h++) {
        const f = f0 * h * Math.sqrt(1 + 0.00008 * h * h); // 弦の硬さで高い倍音ほど少し上にずれる
        const amp = (s === 0 ? 0.5 : 1) / h ** 0.8;
        for (let i = 0; i < n; i++) sig[i] += amp * Math.sin(2 * Math.PI * f * i / sr + h + s) * Math.exp(-i / sr * 1.5);
      }
    });
    const result = measureStrings(magnitudeSpectrum(sig, 0, n), sr, n, targets);
    result.forEach((r, s) => {
      assert.ok(r.found, `${6 - s}弦が見つからない`);
      assert.ok(Math.abs(r.cents - detune[s]) <= 3, `${6 - s}弦：${r.cents.toFixed(1)}セント（正解 ${detune[s]}）`);
    });
  }
  // 5弦を鳴らさないと「見つからない」になる
  const sig = new Float32Array(n);
  targets.forEach((m, s) => { if (s === 1) return; const f0 = 440 * 2 ** ((m - 69) / 12); for (let h = 1; h <= 6; h++) for (let i = 0; i < n; i++) sig[i] += Math.sin(2 * Math.PI * f0 * h * i / sr) / h; });
  assert.equal(measureStrings(magnitudeSpectrum(sig, 0, n), sr, n, targets)[1].found, false);
});

test('押さえ方チェック：鳴っていない弦・ずれた弦・鳴らさない弦を見つける', async () => {
  const { checkShape } = await import('../audio.js');
  const { magnitudeSpectrum } = await import('../dsp.js');
  const sr = 48000, n = 32768;
  const open = [40, 45, 50, 55, 59, 64];
  const strum = (midis) => {
    const sig = new Float32Array(n);
    midis.forEach((m, s) => {
      if (m === null) return;
      const f0 = 440 * 2 ** ((m - 69) / 12);
      for (let h = 1; h <= 8; h++) for (let i = 0; i < n; i++) sig[i] += Math.sin(2 * Math.PI * f0 * h * i / sr + h + s) / h ** 0.9 * Math.exp(-i / sr * 2);
    });
    return magnitudeSpectrum(sig, 0, n);
  };
  const C = [null, 48, 52, 55, 60, 64]; // x32010
  const status = (played) => checkShape(strum(played), sr, n, C, open).map((r) => r.status);
  // 正しく弾けば、どの弦も「鳴っていない」「違う」にはならない（1オクターブ上の弦は確かめきれないことがある）
  status(C).forEach((st, s) => assert.ok(s === 0 ? st === 'muted' : ['ok', 'unsure'].includes(st), `${6 - s}弦が ${st}`));
  // 3弦（G3）を鳴らし損ねた
  assert.equal(status([null, 48, 52, null, 60, 64])[3], 'missing');
  // 4弦を1フレット低く押さえた（E3 ではなく E♭3）
  assert.equal(status([null, 48, 51, 55, 60, 64])[2], 'wrong');
  // 鳴らさないはずの6弦（E2）も鳴らしてしまった：E は C コードの音だが E2 の高さは説明できないので見つかる
  assert.equal(status([40, 48, 52, 55, 60, 64])[0], 'muted-ringing');
});

test('曲の調を推定し、弾きやすいカポの位置を提案できる', async () => {
  const { estimateKey, suggestCapo } = await import('../practice.js');
  const chart = (names) => names.map((name, i) => ({ name, start: i * 2, end: i * 2 + 2 }));
  assert.equal(estimateKey(chart(['C', 'G', 'Am', 'F'])).name, 'C');
  assert.equal(estimateKey(chart(['Am', 'F', 'C', 'G', 'Am'])).name, 'Am');
  assert.equal(estimateKey(chart(['E', 'B', 'C#m', 'A'])).name, 'E');
  // セーハの多い進行（B♭ F Gm E♭）は、カポ3で G D Em C の形にできる
  const s = suggestCapo(chart(['B♭', 'F', 'Gm', 'E♭']), STANDARD);
  assert.equal(s.capo, 3);
  assert.deepEqual([...s.shapes].sort(), ['C', 'D', 'Em', 'G']);
  // もともと弾きやすい進行（開放弦の形だけ）はカポなし
  assert.equal(suggestCapo(chart(['G', 'D', 'Em', 'C']), STANDARD).capo, 0);
  // F のセーハがある C G Am F は、カポ5で G D Em C の形にすると楽になる
  assert.equal(suggestCapo(chart(['C', 'G', 'Am', 'F']), STANDARD).capo, 5);
});

test('コード譜の再生：拍ごとではなく、実際に弾いた瞬間に合わせて鳴らす', async () => {
  const { runPlayback } = await import('./playback-bench.js');
  const r = runPlayback({ stereo: true, seed: 1 });
  assert.ok(r.now.recall >= 0.95, `弾いた瞬間の再現 ${(r.now.recall * 100).toFixed(0)}%`);
  assert.ok(r.now.precision >= 0.95, `余計に鳴らさない ${(r.now.precision * 100).toFixed(0)}%`);
  assert.ok(r.now.recall > r.before.recall + 0.3, `以前 ${(r.before.recall * 100).toFixed(0)}% → 今回 ${(r.now.recall * 100).toFixed(0)}%`);
});
