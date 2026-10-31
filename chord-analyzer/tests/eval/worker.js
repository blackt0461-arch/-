// 採点の作業者：1曲を解析して点数を返す（eval.js から、CPU の数だけ同時に動かす）
import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import { transcribe } from '../../transcribe.js';
import { same } from '../real-song-eval.js';
import { parseChordName } from '../../chord-engine.js';
import { makeSong } from '../mix.js';
import { chartPlayback } from '../../song.js';
import { TUNINGS } from '../../fretboard.js';
import { easiestVoicing } from '../../practice.js';

/** WAV（16bit・24bit・32bit float）を読む */
function readWav(path) {
  const b = fs.readFileSync(path);
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === 'data') data = [pos + 8, size];
    pos += 8 + size + (size % 2);
  }
  const [start, size] = data;
  const bytes = fmt.bits / 8, frames = Math.floor(size / (bytes * fmt.channels));
  const channels = Array.from({ length: Math.min(2, fmt.channels) }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels.length; c++) {
      const o = start + (i * fmt.channels + c) * bytes;
      channels[c][i] = fmt.format === 3 ? b.readFloatLE(o) : fmt.bits === 16 ? b.readInt16LE(o) / 32768 : fmt.bits === 24 ? b.readIntLE(o, 3) / 8388608 : b.readInt32LE(o) / 2147483648;
    }
  }
  return { channels, sampleRate: fmt.rate };
}

function readF32Stereo(path, sampleRate = 44100) {
  const buf = fs.readFileSync(path);
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const n = f.length / 2, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = f[2 * i]; r[i] = f[2 * i + 1]; }
  return { channels: [l, r], sampleRate };
}

// 「長調・短調」だけで比べるゆるい判定（研究でよく使われる「メジャー・マイナー」基準）
const majmin = (name) => {
  const p = name && parseChordName(name.split('/')[0]);
  if (!p) return null;
  return `${p.root}:${p.type.intervals.includes(3) && !p.type.intervals.includes(4) ? 'min' : 'maj'}`;
};

// 楽譜のコードに音を足して弾いたもの（E♭ に対して E♭maj7、D に対して D7・Dadd9 など）も正解とする判定。
// 研究用データの正解は楽譜に書かれたシンプルなコードだが、ジャズなどの奏者は音を足して弾くため
const tonesOf = (name) => {
  const p = name && parseChordName(name.split('/')[0]);
  if (!p) return null;
  const iv = p.type.suffix === 'dim' ? [0, 3, 6] : p.type.intervals;
  return { root: p.root, tones: new Set(iv.map((i) => (p.root + i) % 12)), minor: iv.includes(3) && !iv.includes(4) };
};
const extends_ = (got, truth) => {
  const g = tonesOf(got), t = tonesOf(truth);
  if (!g || !t || g.root !== t.root || g.minor !== t.minor) return false;
  return [...t.tones].every((x) => g.tones.has(x) || x === (t.root + 7) % 12); // 5度は省略されていてもよい
};

/** コード譜の正解率：正解のコードがある時間のうち、同じコードを示していた割合（0.05秒きざみ） */
function chordScore(timeline, truth, duration, offset = 0, allowExtensions = false) {
  const segs = truth.map(([t, name], i) => ({ start: t + offset, end: (i + 1 < truth.length ? truth[i + 1][0] : duration) + offset, name })).filter((s) => s.name);
  let ok = 0, okStrict = 0, okMM = 0, n = 0;
  for (const s of segs) {
    for (let t = s.start; t < s.end; t += 0.05) {
      const got = timeline.find((x) => t >= x.start && t < x.end)?.name ?? null;
      n++;
      if (same(got, s.name) || (allowExtensions && extends_(got, s.name))) ok++;
      if (same(got, s.name)) okStrict++;
      if (got && majmin(got) === majmin(s.name)) okMM++;
    }
  }
  return { chord: n ? ok / n : null, chordStrict: n ? okStrict / n : null, chordMajmin: n ? okMM / n : null };
}

/** 1音ずつの正解率（F1）：弾いた瞬間が 0.05 秒以内で、音の高さが同じなら正解 */
function noteScore(events, truthNotes, tol = 0.05) {
  const pred = events.flatMap((e) => e.notes.map((m) => ({ t: e.t, m })));
  const used = new Set();
  let hit = 0;
  for (const g of truthNotes) {
    const i = pred.findIndex((p, k) => !used.has(k) && p.m === g.midi && Math.abs(p.t - g.t) <= tol);
    if (i >= 0) { used.add(i); hit++; }
  }
  const precision = pred.length ? hit / pred.length : 0, recall = truthNotes.length ? hit / truthNotes.length : 0;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
}

/**
 * コード譜の再生が、実際の演奏のリズムにどれだけ合っているか。
 * 正解の音を「ほぼ同時（0.04秒以内）に弾いたかたまり」にまとめて、実際に弾いた瞬間とする。
 * - rhythm：弾いた瞬間の一致（F1。0.05秒以内）
 * - strumKind：一致した瞬間のうち、和音（3音以上）か1音かが合っている割合
 * - duration：一致した瞬間のうち、鳴らす長さが実際の長さの半分〜2倍に収まっている割合
 */
function rhythmScore(r, truthNotes, playbackOptions = {}) {
  const notes = [...truthNotes].sort((a, b) => a.t - b.t);
  const strokes = [];
  notes.forEach((n) => {
    const last = strokes[strokes.length - 1];
    if (last && n.t - last.t <= 0.04) { last.count++; last.dur = Math.max(last.dur, n.dur ?? 0); } else strokes.push({ t: n.t, count: 1, dur: n.dur ?? 0 });
  });
  const tuning = TUNINGS[0];
  const shapeFor = (name) => { const p = parseChordName(name); return p && easiestVoicing(p.root, p.type, p.bass, tuning, 0); };
  const items = chartPlayback(r.events, r.timeline, shapeFor, tuning, { onsets: r.onsets, ...playbackOptions });
  const used = new Set();
  let hit = 0, kindOk = 0, durOk = 0, durN = 0;
  strokes.forEach((st) => {
    const i = items.findIndex((it, k) => !used.has(k) && Math.abs(it.t - st.t) <= 0.05);
    if (i < 0) return;
    used.add(i);
    hit++;
    if ((items[i].notes.length >= 3) === (st.count >= 3)) kindOk++;
    if (st.dur > 0) {
      durN++;
      const d = items[i].dur ?? 2.2; // 長さを決めていない再生は、音が自然に消えるまで（約2秒）鳴る
      if (d >= st.dur / 2 && d <= st.dur * 2) durOk++;
    }
  });
  const precision = items.length ? hit / items.length : 0, recall = strokes.length ? hit / strokes.length : 0;
  return { rhythm: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, strumKind: hit ? kindOk / hit : null, duration: durN ? durOk / durN : null };
}

parentPort.on('message', ({ job, options }) => {
  try {
    let audio, truth;
    if (job.kind === 'guitarset') { audio = readWav(job.audio); truth = job.truth; if (job.solo) truth = { ...truth, chords: null }; }
    else if (job.kind === 'real') { audio = readF32Stereo(job.audio); truth = job.truth; }
    else {
      const song = makeSong(job.song);
      audio = { channels: song.channels, sampleRate: song.sampleRate };
      truth = { chords: song.chords.map((c) => [c.start, c.name]), notes: song.truth.flatMap((e) => e.notes.map((m, k) => ({ t: e.t + (e.notes.length > 1 ? k * 0.012 : 0), midi: m }))), tempo: song.tempo, duration: song.channels[0].length / song.sampleRate };
      truth.chords.push([song.chords[song.chords.length - 1].end, null]);
    }
    const t0 = Date.now();
    const r = transcribe(audio.channels, audio.sampleRate, options);
    const duration = truth.duration ?? audio.channels[0].length / audio.sampleRate;
    const result = { id: job.id, set: job.set, category: job.category, seconds: (Date.now() - t0) / 1000, ...(truth.chords ? chordScore(r.timeline, truth.chords, duration, job.offset ?? 0, job.kind === 'guitarset') : {}) };
    if (truth.notes) result.notes = noteScore(r.events, truth.notes);
    if (truth.notes && !job.solo) Object.assign(result, rhythmScore(r, truth.notes, options.playback));
    if (truth.tempo) {
      const ratio = r.bpm / truth.tempo;
      result.tempo = [1, 2, 0.5].some((k) => Math.abs(ratio / k - 1) <= 0.04) ? 1 : 0;
    }
    parentPort.postMessage(result);
  } catch (err) {
    parentPort.postMessage({ id: job.id, set: job.set, category: job.category, error: String(err?.stack || err) });
  }
});
