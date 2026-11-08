// 音源を軽くして保存できる形にする。
// 動画・音声ファイル → 22050Hz のモノラル → MP3（48kbps。4分で約1.4MB）。
// MP3 の部品が読みこめないときは、WAV（11025Hz・8bit）にする。

// ファイルを 22050Hz のモノラルにする（分析用の 11025Hz もここから作る）
export async function decodeMono(arrayBuffer, rate = 22050) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  let buf;
  try { buf = await new Promise((res, rej) => tmp.decodeAudioData(arrayBuffer, res, rej)); }
  finally { tmp.close?.(); }
  const len = Math.ceil(buf.duration * rate);
  const off = new Ctx(1, len, rate);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { data: out.getChannelData(0), rate };
}

// 半分の速さ（11025Hz）にする。となり同士を平均するだけ
export function half({ data, rate }) {
  const n = data.length >> 1, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (data[2 * i] + data[2 * i + 1]) / 2;
  return { data: out, rate: rate / 2 };
}

let lamePromise = null;
function loadLame() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  if (lamePromise) return lamePromise;
  lamePromise = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    sc.onload = () => (window.lamejs ? resolve(window.lamejs) : reject(new Error('lame')));
    sc.onerror = () => { lamePromise = null; reject(new Error('lame')); };
    document.head.appendChild(sc);
    setTimeout(() => reject(new Error('lame')), 15000);
  });
  return lamePromise;
}

const toInt16 = (f, i0, i1) => {
  const out = new Int16Array(i1 - i0);
  for (let i = i0; i < i1; i++) { const v = Math.max(-1, Math.min(1, f[i])); out[i - i0] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
};
const pause = () => new Promise(r => setTimeout(r, 0));

async function toMp3({ data, rate }, onProgress) {
  const lame = await loadLame();
  const enc = new lame.Mp3Encoder(1, rate, 48);
  const parts = [], step = 1152 * 32;
  for (let i = 0; i < data.length; i += step) {
    const b = enc.encodeBuffer(toInt16(data, i, Math.min(data.length, i + step)));
    if (b.length) parts.push(new Uint8Array(b));
    if ((i / step) % 8 === 7) { onProgress?.(i / data.length); await pause(); }
  }
  const last = enc.flush();
  if (last.length) parts.push(new Uint8Array(last));
  return new Blob(parts, { type: 'audio/mpeg' });
}

function toWav({ data, rate }) {
  // 8bit・11025Hz（MP3 が使えないときの予備。4分で約2.6MB）
  const src = rate > 11025 ? half({ data, rate }) : { data, rate };
  const n = src.data.length, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, src.rate, true); v.setUint32(28, src.rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, Math.round(Math.max(-1, Math.min(1, src.data[i])) * 127 + 128));
  return new Blob([buf], { type: 'audio/wav' });
}

// { blob, mime, duration } を返す
export async function encodeForSave(pcm, onProgress) {
  const duration = Math.round(pcm.data.length / pcm.rate);
  let blob;
  try { blob = await toMp3(pcm, onProgress); }
  catch (e) { blob = toWav(pcm); }
  return { blob, mime: blob.type, duration };
}
