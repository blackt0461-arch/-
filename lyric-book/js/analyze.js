// 音の分析：試聴の音からキーとテンポを推定する／マイクの声の高さを測る

// ---- 小さな FFT（2のべき乗の長さ） ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// 音を 11025Hz のモノラルにする
export async function toMono(arrayBuffer) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await new Promise((res, rej) => tmp.decodeAudioData(arrayBuffer.slice(0), res, rej));
  tmp.close?.();
  const rate = 11025;
  const len = Math.ceil(buf.duration * rate);
  const off = new Ctx(1, len, rate);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { data: out.getChannelData(0), rate };
}

// Krumhansl のキーの形
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];
function corr(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db || 1);
}

// 試聴の音から { key: 'E♭', tempo: 128, keyScore, tempoScore } を出す
export async function estimateKeyTempo(arrayBuffer) {
  return estimateFromMono(await toMono(arrayBuffer));
}
// すでに 11025Hz のモノラルにした音から（曲まるごとでも使える）
export function estimateFromMono({ data, rate }) {
  const N = 4096, hop = 1024;
  const chroma = new Array(12).fill(0);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  // テンポ用：短い区切りの音の強さの増え方
  const N2 = 512, hop2 = 256;
  const flux = [];
  let prev = null;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let s = 0; s + N <= data.length; s += hop) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) re[i] = data[s + i] * win[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * rate / N;
      if (f < 60 || f > 2000) continue;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const midi = 69 + 12 * Math.log2(f / 440);
      chroma[((Math.round(midi) % 12) + 12) % 12] += Math.log1p(mag);
    }
  }
  const re2 = new Float32Array(N2), im2 = new Float32Array(N2);
  for (let s = 0; s + N2 <= data.length; s += hop2) {
    re2.fill(0); im2.fill(0);
    for (let i = 0; i < N2; i++) re2[i] = data[s + i];
    fft(re2, im2);
    const mags = new Float32Array(N2 / 2);
    for (let k = 0; k < N2 / 2; k++) mags[k] = Math.log1p(Math.sqrt(re2[k] * re2[k] + im2[k] * im2[k]));
    let f = 0;
    if (prev) for (let k = 0; k < mags.length; k++) { const d = mags[k] - prev[k]; if (d > 0) f += d; }
    flux.push(f); prev = mags;
  }
  // キー
  let best = { score: -2, key: '' };
  for (let r = 0; r < 12; r++) {
    const rot = i => chroma[(i + r) % 12];
    const c = Array.from({ length: 12 }, (_, i) => rot(i));
    const sMaj = corr(c, MAJ), sMin = corr(c, MIN);
    if (sMaj > best.score) best = { score: sMaj, key: NAMES[r] };
    if (sMin > best.score) best = { score: sMin, key: NAMES[r] + 'm' };
  }
  // テンポ（60〜190 BPM、120 付近を少し優先）
  const fr = rate / hop2;
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const o = flux.map(x => Math.max(0, x - mean));
  let bt = { score: 0, bpm: 0 };
  for (let bpm = 60; bpm <= 190; bpm += 0.5) {
    const lag = fr * 60 / bpm;
    let sum = 0;
    for (let i = Math.ceil(lag); i < o.length; i++) {
      const j = i - lag, j0 = Math.floor(j), t = j - j0;
      sum += o[i] * (o[j0] * (1 - t) + o[j0 + 1] * t);
    }
    sum /= o.length;
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    if (sum * w > bt.score) bt = { score: sum * w, bpm };
  }
  return { key: best.key, keyScore: best.score, tempo: Math.round(bt.bpm), tempoScore: bt.score };
}

// ---- マイクの声の高さ（自己相関） ----
// 返り値：周波数（Hz）か、聞きとれなければ null
export function detectPitch(buf, rate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return null;
  const minLag = Math.floor(rate / 1200), maxLag = Math.floor(rate / 70);
  const n = buf.length - maxLag;
  // YIN の差の関数
  const d = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const x = buf[i] - buf[i + lag]; s += x * x; }
    d[lag] = s;
  }
  let run = 0;
  const cmnd = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) { run += d[lag]; cmnd[lag] = d[lag] * (lag - minLag + 1) / (run || 1); }
  let lag = -1;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (cmnd[l] < 0.15 && cmnd[l] <= cmnd[l - 1] && cmnd[l] <= cmnd[l + 1]) { lag = l; break; }
  }
  if (lag < 0) return null;
  const a = cmnd[lag - 1], b = cmnd[lag], c = cmnd[lag + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (lag + (isFinite(shift) ? shift : 0));
}
export function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

// 歌い出しの音を推定する：t0 秒から t1 秒のあいだで、声の高さ（110〜1000Hz）が
// 同じ音で4回つづいた最初の音。見つからなければ、その区間でいちばん多い音。楽器にまぎれるので「推定」。
export function startNote({ data, rate }, t0, t1) {
  const N = 1024, hop = 256;
  const from = Math.max(0, Math.floor(t0 * rate)), to = Math.min(data.length - N, Math.floor(t1 * rate));
  const notes = [];
  for (let s = from; s < to; s += hop) {
    const f = detectPitch(data.subarray(s, s + N), rate);
    notes.push(f && f >= 110 && f <= 1000 ? Math.round(freqToMidi(f)) : null);
  }
  for (let i = 0; i + 3 < notes.length; i++) {
    const n = notes[i];
    if (n != null && notes[i + 1] === n && notes[i + 2] === n && notes[i + 3] === n) return n;
  }
  const count = new Map();
  for (const n of notes) if (n != null) count.set(n, (count.get(n) || 0) + 1);
  let best = null, c = 0;
  for (const [n, k] of count) if (k > c) { best = n; c = k; }
  return best;
}
