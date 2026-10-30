// 押さえた形をギターらしい音で鳴らす

let ctx = null;

/**
 * 弦をはじいた音を作る（カープラス・ストロング法）。
 * 雑音を「弦の長さ」ぶんの輪にして、少しずつ平均しながら繰り返すと、弦が振動するような音になる。
 */
function pluck(freq, sampleRate, seconds) {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  const period = sampleRate / freq;
  const head = Math.ceil(period);
  // 最初の1周ぶんは雑音（はじいた瞬間）。少しなめらかにして硬さを和らげる
  for (let i = 0; i < head; i++) out[i] = Math.random() * 2 - 1;
  for (let i = 1; i < head; i++) out[i] = 0.5 * (out[i] + out[i - 1]);
  const decay = 0.996 + Math.min(0.0035, freq / 200000); // 低い弦ほど長く響く
  // 隣り合う2つの平均で半サンプル遅れるので、そのぶん短く読む（音程を正確にするため）
  const delay = period - 0.5;
  const read = (t) => {
    const i = Math.floor(t);
    const f = t - i;
    return (1 - f) * out[i] + f * out[i + 1];
  };
  for (let i = head + 1; i < out.length; i++) {
    out[i] = decay * 0.5 * (read(i - delay) + read(i - delay - 1));
  }
  return out;
}

/** MIDI ノート番号の並び（低い弦から）を、ジャラーンとストロークして鳴らす */
export async function playNotes(midis, { strumMs = 35, seconds = 2.5 } = {}) {
  if (!midis.length) return;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') await ctx.resume();

  const sr = ctx.sampleRate;
  const strum = Math.floor((sr * strumMs) / 1000);
  const buffer = ctx.createBuffer(1, Math.floor(sr * seconds) + strum * midis.length, sr);
  const data = buffer.getChannelData(0);
  midis.forEach((midi, i) => {
    const note = pluck(440 * 2 ** ((midi - 69) / 12), sr, seconds);
    const offset = i * strum;
    for (let j = 0; j < note.length; j++) data[offset + j] += note[j] * 0.3;
  });
  // 音割れしないよう、いちばん大きいところをそろえる
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0.9) for (let i = 0; i < data.length; i++) data[i] *= 0.9 / peak;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
}

/**
 * 音の並びを、時間どおりに鳴らす（コード譜・タブ譜の再生）。
 * items: [{ t: 鳴らす時刻（秒）, midis: [MIDI…], strumMs }]
 * from 秒から rate 倍の速さで鳴らし始め、onTime(今の曲の時刻) を画面の更新用に呼ぶ。戻り値の stop() で止める。
 * 音は少し先（0.6秒ぶん）ずつ作って予約していくので、長い曲でも最初に待たされない。
 */
export async function playSequence(items, { from = 0, rate = 1, onTime = () => {}, onEnd = () => {} } = {}) {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') await ctx.resume();
  const sr = ctx.sampleRate;
  const queue = items.filter((it) => it.t >= from - 0.01).sort((a, b) => a.t - b.t);
  const startAt = ctx.currentTime + 0.15;
  const end = queue.length ? queue[queue.length - 1].t + 2 : from;
  const sources = [];
  let next = 0;
  let stopped = false;

  const schedule = () => {
    const horizon = (ctx.currentTime - startAt) * rate + from + 0.6;
    while (next < queue.length && queue[next].t <= horizon) {
      const { t, midis, strumMs = 0 } = queue[next++];
      midis.forEach((midi, i) => {
        const note = pluck(440 * 2 ** ((midi - 69) / 12), sr, 1.8);
        const buffer = ctx.createBuffer(1, note.length, sr);
        buffer.getChannelData(0).set(note.map((v) => v * (0.5 / Math.sqrt(midis.length))));
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(startAt + (t - from) / rate + (i * strumMs) / 1000);
        sources.push(src);
      });
    }
  };
  const timer = setInterval(() => {
    if (stopped) return;
    schedule();
    const now = (ctx.currentTime - startAt) * rate + from;
    onTime(Math.max(from, now));
    if (now > end) { stop(); onEnd(); }
  }, 100);
  schedule();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    sources.forEach((s) => { try { s.stop(); } catch { /* もう止まっている */ } });
  }
  return { stop };
}
