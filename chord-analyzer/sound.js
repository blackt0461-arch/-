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
