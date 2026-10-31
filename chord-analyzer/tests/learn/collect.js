// 学習用の材料集め：拍ごとの音の特徴と、その拍の正解のコードの音（12音名）を書き出す
//   node tests/learn/collect.js 出力.json
// 使うのは「調整用」のデータだけ（GuitarSet の演奏者 00〜03 の伴奏、合成曲の seed 1〜6）。
// 本番テスト用のデータ（演奏者 04・05、seed 7〜10）と、あなたの動画の曲は使わない（採点を公平にするため）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);

if (isMainThread) {
  const out = process.argv[2] || '/tmp/claude-0/learn-data.json';
  const jobs = [];
  const gsDir = process.env.GUITARSET || '/tmp/claude-0/guitarset';
  const clips = JSON.parse(fs.readFileSync(path.join(gsDir, 'guitarset.json'), 'utf8'));
  clips.forEach((c) => {
    if (c.mode !== 'comp' || ['04', '05'].includes(c.player)) return;
    const audio = path.join(gsDir, 'audio', `${c.id}_mic.wav`);
    if (fs.existsSync(audio)) jobs.push({ kind: 'guitarset', id: c.id, audio, chords: c.chords, duration: c.duration });
  });
  const conditions = [{ withBand: false }, { stereo: true }, { stereo: false }, { stereo: true, changesPerBar: 2 }, { withBand: false, changesPerBar: 4 }, { stereo: true, changesPerBar: 4 }];
  conditions.forEach((so, ci) => { for (let seed = 1; seed <= 10; seed++) jobs.push({ kind: 'synth', id: `s${ci}-${seed}`, song: { ...so, seed: 1000 + seed + 100 * ci } }); });
  const rows = [];
  let next = 0, done = 0;
  await new Promise((resolve) => {
    const n = Math.min(os.cpus().length, jobs.length);
    let running = n;
    for (let w = 0; w < n; w++) {
      const worker = new Worker(here, { workerData: {} });
      const feed = () => { if (next >= jobs.length) { worker.terminate(); if (--running === 0) resolve(); return; } worker.postMessage(jobs[next++]); };
      worker.on('message', (r) => { rows.push(r); process.stderr.write(`\r集めています ${++done}/${jobs.length}`); feed(); });
      feed();
    }
  });
  fs.writeFileSync(out, JSON.stringify(rows));
  console.error(`\n${rows.length}曲・${rows.reduce((a, r) => a + (r.beats?.length || 0), 0)}拍を書き出しました → ${out}`);
} else {
  const { transcribe } = await import('../../transcribe.js');
  const { parseChordName } = await import('../../chord-engine.js');
  const { makeSong } = await import('../mix.js');
  const readWav = (p) => {
    const b = fs.readFileSync(p);
    let pos = 12, fmt = null, data = null;
    while (pos + 8 <= b.length) {
      const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
      if (id === 'fmt ') fmt = { format: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
      if (id === 'data') data = [pos + 8, size];
      pos += 8 + size + (size % 2);
    }
    const bytes = fmt.bits / 8, frames = Math.floor(data[1] / (bytes * fmt.channels));
    const ch = new Float32Array(frames);
    for (let i = 0; i < frames; i++) { const o = data[0] + i * fmt.channels * bytes; ch[i] = fmt.format === 3 ? b.readFloatLE(o) : fmt.bits === 16 ? b.readInt16LE(o) / 32768 : b.readIntLE(o, 3) / 8388608; }
    return { channels: [ch], sampleRate: fmt.rate };
  };
  const pcs = (name) => { const p = name && parseChordName(name.split('/')[0]); return p ? p.type.intervals.map((i) => (p.root + i) % 12) : null; };
  parentPort.on('message', (job) => {
    try {
      let audio, chords;
      if (job.kind === 'guitarset') { audio = readWav(job.audio); chords = job.chords.map(([t, n], i) => ({ start: t, end: i + 1 < job.chords.length ? job.chords[i + 1][0] : job.duration, name: n })); }
      else { const s = makeSong(job.song); audio = { channels: s.channels, sampleRate: s.sampleRate }; chords = s.chords; }
      const r = transcribe(audio.channels, audio.sampleRate, { exportFeatures: true, fastBeats: 0 });
      const f = r.chartInfo?.features;
      if (!f) { parentPort.postMessage({ id: job.id, beats: [] }); return; }
      // 拍の正解：拍の中で最も長く鳴っているコード（拍の 70% 以上を占めるものだけ。境目をまたぐ拍は除く）
      const beats = f.beats.map((b, k) => {
        const end = k + 1 < f.beats.length ? f.beats[k + 1] : b + (b - (f.beats[k - 1] ?? b - 0.5));
        const c = chords.find((x) => Math.min(end, x.end) - Math.max(b, x.start) >= 0.7 * (end - b));
        return { chroma: f.chromas[k], attack: f.attacks[k], bass: f.basses[k], target: c ? pcs(c.name) : null, chord: c?.name ?? null, bar: ((k - f.downbeat) % 4 + 4) % 4 };
      });
      parentPort.postMessage({ id: job.id, kind: job.kind, beats });
    } catch (e) { parentPort.postMessage({ id: job.id, error: String(e), beats: [] }); }
  });
}
