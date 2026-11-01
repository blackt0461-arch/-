// 録音（画面収録など）の音から、ギターのコード進行とタブ譜の材料を作る
// ブラウザのワーカー（画面を固めずに裏で計算する仕組み）でも、テストでも動くように、画面の部品は使わない

import { magnitudeSpectrum, peakNear, noteEnergy, predominantPitch, removeHarmonics } from './dsp.js';
import { analyzeSpectrum } from './audio.js';
import { identifyFromChroma, CHORD_TYPES, parseChordName } from './chord-engine.js';
import { TUNINGS, findVoicings, soundingNotes } from './fretboard.js';
import { buildChordTimeline } from './song.js';
import { chordToneProbabilities } from './learned.js';
import { estimateBeats, findDownbeatScored, decodeChords, buildChart, cosine } from './chart.js';

const LOWEST = 40;  // E2（6弦の開放）
const HIGHEST = 88; // E6（1弦24フレット）
const freq = (m) => 440 * 2 ** ((m - 69) / 12);
// 倍音が来る高さ（基音からの半音数）：2倍=12、3倍=19、4倍=24、5倍=28、6倍=31
const HARMONIC_STEPS = [12, 19, 24, 28, 31];

function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/**
 * どの音を解析に使うか決める。
 * ステレオの曲は、歌・ベース・ドラムが真ん中、ギターが左右に振り分けられていることが多い。
 * 「左 − 右」（サイド）を取ると真ん中の音が消えてギターが残る。
 * サイドがほとんど無い曲（弾き語りなど全部が真ん中）は、普通に左右を混ぜた音を使う。
 */
export function chooseSignal(channels, mode = 'auto', sampleRate = 44100) {
  const [l, r = l] = channels;
  const mid = new Float32Array(l.length);
  const side = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) {
    mid[i] = (l[i] + r[i]) / 2;
    side[i] = (l[i] - r[i]) / 2;
  }
  const sideRatio = rms(side) / (rms(mid) || 1);
  // 左右の差は「真ん中に歌があり、ギターが左右に振り分けられている」曲にだけ役立つ。
  // ギター1本をマイク2本で録った曲で使うと、ギターの音そのものが削れてしまう
  let vocalShare = null;
  let useSide = mode === 'side';
  if (mode === 'auto' && sideRatio > 0.2) {
    const frames = removeVocalFrames(mid, sampleRate);
    vocalShare = frames.filter((f) => f.vocal).length / Math.max(1, frames.length);
    useSide = vocalShare >= 0.35;
  }
  return { guitar: useSide ? side : mid, mid, useSide, sideRatio, vocalShare };
}

/**
 * 「弾いた瞬間」を探す（スペクトルフラックス法）。
 * 短い区間ごとに周波数ごとの強さを求め、前の区間より強くなった分を合計する。
 * その合計が周りより飛び抜けて大きいところが、音の鳴り始め。
 */
export function detectOnsets(signal, sampleRate, options = {}) {
  return detectOnsetsDetailed(signal, sampleRate, options).map((o) => o.t);
}

/** 弾いた瞬間と、その勢い（strength：スペクトルフラックスの大きさ）を返す */
export function detectOnsetsDetailed(signal, sampleRate, { frame = 2048, hop = 512, minGap = 0.06, superflux = false, refine = false, refineLate = 0.025, thresholdMedian = 1.4, thresholdMean = 0.4 } = {}) {
  const binHz = sampleRate / frame;
  const lo = Math.floor(80 / binHz), hi = Math.ceil(5000 / binHz);
  const flux = [];
  const frames = [];
  let prev = null;
  for (let start = 0; start + frame <= signal.length; start += hop) {
    const mags = magnitudeSpectrum(signal, start, frame);
    const cur = new Float32Array(hi - lo);
    for (let k = lo; k < hi; k++) cur[k - lo] = Math.log1p(1000 * mags[k]);
    let f = 0;
    if (superflux) {
      // 揺れに強い探し方：2つ前の区切りと比べ、比べる側は隣の周波数も含めた最大値にする。
      // 歌やチョーキングで音程が少し揺れただけでは「強くなった」と数えない
      const ref = frames.length >= 2 ? frames[frames.length - 2] : prev;
      if (ref) for (let k = 0; k < cur.length; k++) {
        const m = Math.max(ref[k], k > 0 ? ref[k - 1] : 0, k + 1 < ref.length ? ref[k + 1] : 0);
        f += Math.max(0, cur[k] - m);
      }
    } else if (prev) {
      for (let k = 0; k < cur.length; k++) f += Math.max(0, cur[k] - prev[k]);
    }
    flux.push(f);
    frames.push(cur);
    prev = cur;
  }
  // 時刻の微調整：見つけた瞬間の前後を 0.002 秒きざみで見直し、高い音（弦をはじいた「カッ」という音）の強さが
  // いちばん急に増えたところを鳴り始めとする
  let hp = null;
  const refineTime = (t) => {
    if (!hp) {
      hp = new Float32Array(signal.length);
      for (let i = 1; i < signal.length; i++) hp[i] = 0.95 * (hp[i - 1] + signal[i] - signal[i - 1]);
    }
    const step = Math.round(sampleRate * 0.002), win = Math.round(sampleRate * 0.004);
    const energy = (c) => { let e = 0; for (let i = Math.max(0, c - win); i < Math.min(hp.length, c + win); i++) e += hp[i] * hp[i]; return Math.log(e + 1e-9); };
    const center = Math.round(t * sampleRate);
    let best = t, bestRise = -Infinity;
    for (let c = center - Math.round(sampleRate * 0.035); c <= center + Math.round(sampleRate * refineLate); c += step) {
      const rise = energy(c + win) - energy(c - win);
      if (rise > bestRise) { bestRise = rise; best = c / sampleRate; }
    }
    return best;
  };
  // 広がり：弾いた直前と、その後約0.07秒の間でいちばん強くなったときを比べ、はっきり強くなった周波数の数。
  // 1音なら倍音の位置だけ、和音（ストローク）なら多くの周波数が一斉に強くなる。音量にはあまり左右されない
  const spread = (i) => {
    const before = frames[Math.max(0, i - 2)];
    let count = 0;
    for (let k = 0; k < before.length; k++) {
      let peak = 0;
      for (let j = i; j < Math.min(frames.length, i + 6); j++) peak = Math.max(peak, frames[j][k]);
      if (peak - before[k] > 1) count++;
    }
    return count;
  };
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const onsets = [];
  const w = 6;
  for (let i = 1; i < flux.length - 1; i++) {
    const local = flux.slice(Math.max(0, i - w * 2), i + w * 2 + 1).sort((a, b) => a - b);
    const median = local[Math.floor(local.length / 2)];
    const isPeak = flux.slice(Math.max(0, i - 3), i + 4).every((v) => v <= flux[i]);
    if (!isPeak || flux[i] < median * thresholdMedian + mean * thresholdMean) continue;
    // フレームの真ん中あたりが鳴り始め
    let t = (i * hop + frame / 2) / sampleRate;
    if (refine) t = refineTime(t);
    if (onsets.length && t - onsets[onsets.length - 1].t < minGap) continue;
    // 勢い：鳴り始めから約0.07秒の間のフラックスの合計（和音は弦が少しずつずれて鳴るので、短い区間で足し合わせる）
    let strength = 0;
    for (let j = i; j < Math.min(flux.length, i + 6); j++) strength += flux[j];
    onsets.push({ t, strength, spread: spread(i) });
  }
  return onsets;
}

/**
 * 指で音を変えた瞬間（ハンマリング・プリング・スライド）を探す担当。弦をはじかないので音量は急に大きくならないが、
 * 音の高さが別の高さに切り替わる。0.01 秒ごとに音の高さを追いかけ（YIN 法）、ある高さで安定したあと、
 * 別の高さに切り替わってまた安定したところを返す。1音ずつ鳴っている場面でしか使えない（和音では高さが1つに決まらない）
 * 戻り値：[{ t, midi }]
 */
export function detectPitchChanges(signal, sampleRate, { hop = 0.01, minStable = 4, minFreq = 75, maxFreq = 1100, threshold = 0.15, maxGap = 3 } = {}) {
  // 計算を軽くするため、4 分の 1 に間引く（音の高さの判定には 11kHz あれば足りる）
  const k = 4, sr = sampleRate / k;
  const x = new Float32Array(Math.floor(signal.length / k));
  for (let i = 0; i < x.length; i++) x[i] = (signal[i * k] + signal[i * k + 1] + signal[i * k + 2] + signal[i * k + 3]) / 4;
  const win = 1024, maxLag = Math.floor(sr / minFreq), minLag = Math.floor(sr / maxFreq), n = win - maxLag;
  const step = Math.round(hop * sr);
  const d = new Float32Array(maxLag + 1), cm = new Float32Array(maxLag + 1);
  const track = [];
  for (let s0 = 0; s0 + win <= x.length; s0 += step) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += x[s0 + i] * x[s0 + i];
    if (energy < 1e-6 * win) { track.push(null); continue; }
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < n; i++) { const df = x[s0 + i] - x[s0 + i + lag]; sum += df * df; }
      d[lag] = sum;
    }
    let running = 0;
    for (let lag = 1; lag < minLag; lag++) { let sum = 0; for (let i = 0; i < n; i++) { const df = x[s0 + i] - x[s0 + i + lag]; sum += df * df; } running += sum; }
    let found = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      running += d[lag];
      cm[lag] = running ? (d[lag] * lag) / running : 1;
    }
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (cm[lag] < threshold) { while (lag + 1 < maxLag && cm[lag + 1] < cm[lag]) lag++; found = lag; break; }
    }
    if (found < 0) { track.push(null); continue; }
    const a = cm[found - 1], b = cm[found], c = cm[found + 1], den = a - 2 * b + c;
    const lag = found + (den ? (0.5 * (a - c)) / den : 0);
    track.push(Math.round(69 + 12 * Math.log2(sr / lag / 440)));
  }
  // 同じ高さが minStable 回以上続く「安定した区間」をつなぐ
  const runs = [];
  track.forEach((m, i) => {
    const last = runs[runs.length - 1];
    if (m !== null && last && last.m === m && i - last.end <= maxGap) last.end = i;
    else if (m !== null) runs.push({ m, start: i, end: i });
  });
  const stable = runs.filter((r) => r.end - r.start + 1 >= minStable);
  const out = [];
  for (let i = 1; i < stable.length; i++) {
    const a = stable[i - 1], b = stable[i];
    if (a.m !== b.m && b.start - a.end <= maxGap + 2) out.push({ t: (b.start * step + win / 2) / sr - 0.02, midi: b.m });
  }
  return out;
}

/**
 * 歌声らしい音かどうか。歌は音程が揺れる（ビブラート・なめらかな上下）うえに、
 * 鳴り始めより後のほうが大きくなることがある。ギターは音程が一定で、だんだん小さくなる。
 * 区間を3つに分け、それぞれで倍音の周波数と強さを測って比べる。
 */
function looksLikeVoice(signal, sampleRate, midi, start, length, { wobbleCents = 25, useSwell = true } = {}) {
  const sub = 4096;
  if (length < sub * 1.6) return false; // 短すぎて判断できない
  const f0 = freq(midi);
  const h = Math.max(1, Math.ceil(700 / f0)); // 周波数を細かく測れるよう、700Hz より上の倍音で見る
  const binHz = sampleRate / 8192;
  const points = [0, 0.5, 1].map((r) => {
    const s = start + Math.floor((length - sub) * r);
    const mags = magnitudeSpectrum(signal, s, sub, 8192);
    return peakNear(mags, binHz, f0 * h, 60);
  });
  if (points.some((p) => p.mag === 0)) return false;
  const cents = points.map((p) => 1200 * Math.log2(p.freq / (f0 * h)));
  const wobble = Math.max(...cents) - Math.min(...cents);
  const swelling = points[2].mag > points[0].mag * 1.15;
  return wobble > wobbleCents || (useSwell && swelling);
}

/**
 * 弾いた瞬間に新しく鳴り始めた音を、1つずつはがすように見つける。
 * 1. 直後の音から直前の音（少し小さくなっている分も見込む）を引き、「増えた分」だけを残す
 * 2. 各音の候補について、基音と倍音（2倍・3倍…）の位置の「増えた分」を合計する
 * 3. 合計がいちばん大きい音を確定し、その音の基音と倍音を全部取り除く。これを繰り返す
 * 倍音を取り除いてから次を探すので、倍音（1オクターブ上など）を別の音と間違えにくい。
 */
export function peelNotes(post, pre, binHz, { maxNotes = 6, stopRatio = 0.15, decay = 0.9, riseMode = 'sub', riseRatio = 1.5, floorRatio = 0.05, oddRatio = 0.25 } = {}) {
  const d = new Float32Array(post.length);
  for (let k = 0; k < post.length; k++) {
    // 'ratio'：直前より riseRatio 倍以上強くなった周波数だけを「新しく鳴った」とみなす（鳴り続けて弱まっている音を確実に除く）
    d[k] = riseMode === 'ratio' ? (post[k] > pre[k] * riseRatio ? post[k] - pre[k] : 0) : Math.max(0, post[k] - pre[k] * decay);
  }
  const loBin = Math.floor(70 / binHz), hiBin = Math.min(d.length - 1, Math.ceil(5000 / binHz));
  let total = 0;
  for (let k = loBin; k <= hiBin; k++) total += d[k];
  const partialRange = (m, h) => {
    const f = freq(m) * h * Math.sqrt(1 + 0.0001 * h * h); // 弦の硬さで、高い倍音ほど少し上にずれる
    const c = 25 + 4 * h;
    return [Math.max(1, Math.floor((f * 2 ** (-c / 1200)) / binHz)), Math.min(d.length - 1, Math.ceil((f * 2 ** (c / 1200)) / binHz))];
  };
  const amp = (m, h) => {
    const [lo, hi] = partialRange(m, h);
    let best = 0;
    for (let k = lo; k <= hi; k++) if (d[k] > best) best = d[k];
    return best;
  };
  // はっきりした山だけを数える基準（いちばん強い山の floorRatio 倍）。
  // 1つ目の音を取り除いた後のごく小さな消え残りを寄せ集めて、ありもしない音をでっち上げないため
  let peakMax = 0;
  for (let k = loBin; k <= hiBin; k++) if (d[k] > peakMax) peakMax = d[k];
  const floor = peakMax * floorRatio;
  const score = (m) => {
    let sum = 0, present = 0;
    for (let h = 1; h <= 10; h++) {
      if (freq(m) * h > 5000) break;
      const a = amp(m, h);
      if (a < floor) continue;
      sum += a;
      present++;
    }
    // 基音（または2倍音）がはっきりしない候補は、別の音の倍音の寄せ集めなので選ばない
    if (amp(m, 1) < floor * 2 && amp(m, 2) < floor * 2) return 0;
    // 1オクターブ下の音との取り違え防止：ある音の倍音は、1オクターブ下の音の偶数番目の倍音と重なる。
    // 本当に低い音なら奇数番目の倍音（1・3・5倍）も鳴るので、それが偶数番目に比べて弱ければ、この音ではない
    if (oddRatio > 0) {
      const odd = amp(m, 1) + amp(m, 3) + amp(m, 5), even = amp(m, 2) + amp(m, 4) + amp(m, 6);
      if (odd < even * oddRatio) return 0;
    }
    return sum * Math.min(1, present / 3);
  };
  const found = [];
  let first = 0;
  while (found.length < maxNotes) {
    let best = null, bestS = 0;
    for (let m = LOWEST; m <= HIGHEST; m++) {
      if (found.some((f) => f.m === m)) continue;
      const sc = score(m);
      if (sc > bestS) { best = m; bestS = sc; }
    }
    if (best === null) break;
    if (!found.length) first = bestS;
    else if (bestS < first * stopRatio) break;
    const fundamental = amp(best, 1);
    let removed = 0;
    for (let h = 1; h <= 12; h++) {
      const [lo, hi] = partialRange(best, h);
      for (let k = lo - 1; k <= hi + 1; k++) if (k >= 0 && k < d.length) { if (k >= loBin && k <= hiBin) removed += d[k]; d[k] = 0; }
    }
    // share：増えた分全体のうち、この音（基音と倍音）が占める割合
    found.push({ m: best, s: bestS, fundamental, share: total > 0 ? removed / total : 0 });
  }
  return found;
}

/**
 * 立ち上がりがゆるい音かどうか。ギターは弾いた瞬間に一気に大きな音が出るが、
 * 歌声はふわっと大きくなる。弾いた直後のごく短い区間と、その少し後の区間で強さを比べる。
 */
function softAttack(signal, sampleRate, midi, onsetSample, ratio) {
  const short = 2048;
  const f0 = freq(midi);
  const h = Math.max(1, Math.ceil(500 / f0)); // 短い区間でも周波数を見分けられる高さの倍音で見る
  const binHz = sampleRate / 4096;
  const early = peakNear(magnitudeSpectrum(signal, onsetSample, short, 4096), binHz, f0 * h, 60).mag;
  const later = peakNear(magnitudeSpectrum(signal, onsetSample + Math.floor(0.07 * sampleRate), short, 4096), binHz, f0 * h, 60).mag;
  return later > 0 && early < later * ratio;
}

/**
 * ストロークの音を、実際に押さえられるコードの形にそろえる。
 * 和音は倍音どうしが重なって1音ずつ聞き分けるのが難しいので、コード名を先に判定し、
 * その押さえ方の候補の中から、聞こえた音といちばん多く一致する形を選ぶ。
 */
function snapToVoicing(post, sampleRate, win, heard, tuning) {
  const { chroma, bass } = analyzeSpectrum(post, sampleRate, win);
  const lowest = Math.min(...heard) % 12;
  // 上位の候補のコードすべてについて押さえ方を比べ、聞こえた音にいちばん合う形を選ぶ
  // （1位の候補が少しだけ違うコードでも、押さえ方まで合わせて考えると正しく選べることが多い）
  let best = null;
  identifyFromChroma(chroma, bass ?? lowest, 5).forEach((chord, rank) => {
    const type = CHORD_TYPES.find((c) => c.suffix === chord.suffix);
    for (const frets of findVoicings(chord.root, type, chord.bass ?? chord.root, tuning, { limit: 12 })) {
      const midis = soundingNotes(frets, tuning);
      const match = heard.filter((m) => midis.includes(m)).length;
      const score = match - 0.5 * heard.filter((m) => !midis.includes(m)).length - 0.1 * rank;
      if (!best || score > best.score) best = { score, match, frets, midis, chord: chord.name };
    }
  });
  if (best && best.match >= 2) {
    const positions = best.frets.map((f, s) => (f === null ? null : { string: s, fret: f })).filter(Boolean);
    return { notes: best.midis, positions, chord: best.chord };
  }
  return null;
}

/**
 * 拍ごとの「安定した音」の周波数分布を作る。
 * 周波数ごとに、前後約0.3秒の中央値をとる（時間方向のメディアンフィルタ）。
 * ギターの音は鳴っている間ほぼ同じ高さで続くので残るが、歌声はビブラートで高さが揺れて
 * 同じ周波数に居続けないので弱まる。ドラムのような一瞬の音も消える。
 * そのうえで、拍の中の周波数分布を平均して、拍ごとにまとめる。
 */
export function stableBeatSpectra(signal, sampleRate, beats, period, { frame = 8192, hop = 1024, medianSeconds = 0.3 } = {}) {
  const frames = [];
  const times = [];
  for (let start = 0; start + frame <= signal.length; start += hop) {
    frames.push(magnitudeSpectrum(signal, start, frame));
    times.push((start + frame / 2) / sampleRate);
  }
  const bins = Math.min(frame / 2, Math.ceil(5000 / (sampleRate / frame)));
  const half = Math.max(1, Math.round((medianSeconds * sampleRate) / hop / 2));
  const window = new Float32Array(half * 2 + 1);
  const stable = frames.map(() => new Float32Array(frame / 2));
  for (let k = 0; k < bins; k++) {
    for (let i = 0; i < frames.length; i++) {
      let n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(frames.length - 1, i + half); j++) window[n++] = frames[j][k];
      const sorted = window.subarray(0, n).sort();
      stable[i][k] = sorted[n >> 1];
    }
  }
  return beats.map((b, idx) => {
    const end = idx + 1 < beats.length ? beats[idx + 1] : b + period;
    const sum = new Float32Array(frame / 2);
    let count = 0;
    times.forEach((t, i) => {
      if (t < b || t >= end) return;
      for (let k = 0; k < bins; k++) sum[k] += stable[i][k];
      count++;
    });
    if (count) for (let k = 0; k < bins; k++) sum[k] /= count;
    return sum;
  });
}

/**
 * 歌のメロディを追いかけて、その音（基音と倍音）を周波数分布から取り除く。
 * 短い区間ごとに「一番目立つ音」の高さを細かく測り、前後で高さが揺れている（ビブラート・なめらかな上下）なら
 * 歌とみなす。ギターの音は高さが一定なので残る。
 * 戻り値：区間ごとの { t, mags }（歌を取り除いた周波数分布）
 */
export function removeVocalFrames(signal, sampleRate, { frame = 4096, fft = 16384, hop = 2048, wobbleCents = 30, nearCents = 50 } = {}) {
  const binHz = sampleRate / fft;
  const frames = [];
  for (let start = 0; start + frame <= signal.length; start += hop) {
    const mags = magnitudeSpectrum(signal, start, frame, fft);
    const best = predominantPitch(mags, binHz);
    frames.push({ t: (start + frame / 2) / sampleRate, mags, cents: best.cents, sum: best.sum });
  }
  // 前後0.3秒の中で高さが揺れていれば歌とみなし、その音の基音と倍音を取り除く
  const span = Math.max(1, Math.round((0.15 * sampleRate) / hop));
  frames.forEach((fr, i) => {
    const near = frames.slice(Math.max(0, i - span), i + span + 1).filter((g) => Math.abs(g.cents - fr.cents) < nearCents);
    if (near.length < 3) return;
    const values = near.map((g) => g.cents);
    const wobble = Math.max(...values) - Math.min(...values);
    if (wobble < wobbleCents) return;
    removeHarmonics(fr.mags, binHz, 440 * 2 ** ((fr.cents / 100 - 69) / 12));
    fr.vocal = true;
  });
  return frames;
}

/**
 * コード譜を手がかりに、弾いた瞬間ごとの音を整える。
 * - 和音（ストローク）を弾いたらしい瞬間：その時のコードの押さえ方のうち、聞こえた音にいちばん合う形にそろえる
 * - 1音弾き：はっきり聞こえた音（いちばん強い音の strongRatio 倍以上）だけを残す
 * 和音かどうかは、弾いた瞬間の勢い（曲の中での比べ）と、同時に鳴り始めた音の数・割合で判断する。
 */
function refineWithChart(events, onsetList, timeline, tuning, { strumStrength = 1.25, strongRatio = 0.35 } = {}) {
  const strengths = onsetList.map((o) => o.strength).sort((a, b) => a - b);
  const median = strengths[Math.floor(strengths.length / 2)] || 1;
  const strengthAt = (t) => onsetList.find((o) => Math.abs(o.t - t) < 0.005)?.strength ?? median;
  return events.map((e) => {
    const peeled = e.peeled ?? e.notes.map((m) => ({ m, s: 1, share: 1 / e.notes.length }));
    const first = peeled[0]?.s ?? 1;
    const strong = peeled.filter((p) => p.s >= first * strongRatio);
    const looksStrum = strengthAt(e.t) / median >= strumStrength || (strong.length >= 3 && (peeled[0]?.share ?? 1) < 0.5);
    const seg = timeline.find((c) => e.t >= c.start - 0.05 && e.t < c.end);
    if (looksStrum && seg) {
      const parsed = parseChordName(seg.name);
      if (parsed) {
        const voicings = findVoicings(parsed.root, parsed.type, parsed.bass, tuning, { limit: 12 });
        let best = null;
        for (const frets of voicings) {
          const midis = soundingNotes(frets, tuning);
          const score = peeled.reduce((a, p) => a + (midis.includes(p.m) ? p.s : -0.5 * p.s), 0);
          if (!best || score > best.score) best = { score, frets, midis };
        }
        if (best) {
          const positions = best.frets.map((f, s) => (f === null ? null : { string: s, fret: f })).filter(Boolean);
          return { t: e.t, notes: best.midis, positions };
        }
      }
    }
    const notes = strong.map((p) => p.m).sort((a, b) => a - b);
    return notes.length ? { t: e.t, notes } : { t: e.t, notes: [peeled[0].m] };
  });
}

/**
 * 録音全体を解析する。
 * - chords: 0.1秒ごとのコードの判定（buildChordTimeline でコード進行にまとめる）
 * - events: 弾いた瞬間ごとの、新しく鳴った音（タブ譜の材料）
 */
function transcribeOnce(channels, sampleRate, { mode = 'auto', voiceFilter = true, method = 'peel', riseRatio = 1.3, minStrength = 0.2, harmonicRatio = 4, tuning = TUNINGS[0], snapStrums = true, snapMin = 3, peelOptions = {}, useChart = true, chartOptions = {}, noteWeight = null, chromaMethod = 'auto', harmonicResidual = 0.35, vocalOptions = {}, vocalPresence = 0.35, minBeats = 1, precise = true, highWeight = 0.6, useContext = true, contextOptions = {}, dropVocalNotes = true, estimateDurations = true, stopRatio = 0.25, voiceOptions = { wobbleCents: 60, useSwell: false }, attackRatio = 0, chordWindow = 16384, chordMinDuration = 0.5, segmentChroma = 0, segmentBass = false, prevSubtract = 0, attackChroma = 0, changeGate = 0, fuseAttack = 0, fuseSubtract = 0, changeBonus = 0, exportFeatures = false, learned = 0, learnedConfidence = false, onsetOptions = {}, noteOnsetOptions = null, legatoNotes = false, onProgress = () => {} } = {}) {
  const { guitar, mid, useSide, sideRatio } = chooseSignal(channels, mode, sampleRate);
  const duration = guitar.length / sampleRate;

  // 1. コード：0.1秒ごとに、前後約0.37秒の音で判定する
  const chordFrames = [];
  const win = 16384;
  const cwin = chordWindow;
  const hopChord = Math.floor(sampleRate * (precise ? 0.05 : 0.1));
  const binHz = sampleRate / win;
  const loudness = [];
  for (let c = 0; c + cwin <= guitar.length; c += hopChord) loudness.push(rms(guitar.subarray(c, c + cwin)));
  const loudest = Math.max(...loudness, 1e-9);
  const zeros = new Float32Array(cwin / 2);
  let step = 0;
  for (let c = 0; c + cwin <= guitar.length; c += hopChord, step++) {
    if (step % 20 === 0) onProgress(0.4 * (c / guitar.length), 'コードを調べています');
    if (loudness[step] < loudest * 0.05) continue; // ほぼ無音
    const frameMags = magnitudeSpectrum(guitar, c, cwin);
    // コード用には倍音をしっかり取り除く（3度の音の3倍音が maj7 の音と同じ高さになり、C を Cmaj7 と読み違えるため）
    let { chroma } = analyzeSpectrum(frameMags, sampleRate, cwin, { harmonicResidual, highWeight });
    if (precise) {
      // じっくり解析：同じ場所を、長さの違う3つの区間（短い・ふつう・長い）でも見て、12音の強さを平均する。
      // 短い区間は音の変わり目に、長い区間は低い音の高さの聞き分けに強い
      const center = c + cwin / 2;
      const sum = chroma.map((v) => v / (chroma.reduce((a, b) => a + b, 0) || 1));
      for (const w of [cwin / 2, cwin * 2]) {
        const cc = analyzeSpectrum(magnitudeSpectrum(guitar, Math.round(center - w / 2), w), sampleRate, w, { harmonicResidual, highWeight }).chroma;
        const tot = cc.reduce((a, b) => a + b, 0) || 1;
        cc.forEach((v, i) => { sum[i] += v / tot; });
      }
      chroma = sum;
    }
    if (chromaMethod === 'peel') {
      // 倍音を完全にはがして見つけた音だけで、12音の強さを作る（倍音の消え残りでコードを読み違えないように）
      chroma = new Array(12).fill(0);
      peelNotes(frameMags, zeros, sampleRate / cwin, { maxNotes: 8, stopRatio: 0.1 }).forEach((n) => { chroma[n.m % 12] += n.s; });
    }
    const total = chroma.reduce((a, b) => a + b, 0) || 1;
    // ベース音は、サイドでは消えてしまうベースギターも含む真ん中の音から探す
    const { bass } = analyzeSpectrum(magnitudeSpectrum(useSide ? mid : guitar, c, cwin), sampleRate, cwin);
    const [top] = identifyFromChroma(chroma, bass, 1);
    if (top) chordFrames.push({ t: (c + cwin / 2) / sampleRate, name: top.name, confidence: top.confidence, chroma: chroma.map((v) => v / total), bass });
  }

  // 2. 弾いた瞬間を探す
  onProgress(0.4, '弾いた瞬間を探しています');
  // 拍・コード用の「弾いた瞬間」と、1音ずつのタブ譜用の「弾いた瞬間」は別の設定で探せる
  // （細かく時刻を合わせると1音ずつは正確になるが、拍の推定が変わってコード譜が崩れることがあるため）
  const onsetList = detectOnsetsDetailed(guitar, sampleRate, onsetOptions);
  const noteOnsetList = noteOnsetOptions ? detectOnsetsDetailed(guitar, sampleRate, noteOnsetOptions) : onsetList;
  let onsets = noteOnsetList.map((o) => o.t);
  // 指で音を変えた担当：音の高さが切り替わった瞬間のうち、ほかの担当の白い線が近くに無いものを、1音ずつの聞き取りの対象に足す
  // （時刻だけを使い、音の高さは倍音をはがす方法で決める）
  let legatoTimes = [];
  if (legatoNotes) {
    const opts = typeof legatoNotes === 'object' ? legatoNotes : { threshold: 0.35, minStable: 3, maxGap: 4 };
    legatoTimes = detectPitchChanges(guitar, sampleRate, opts).map((c) => c.t).filter((t) => !onsets.some((o) => Math.abs(o - t) < 0.07));
    onsets = [...onsets, ...legatoTimes].sort((x, y) => x - y);
  }

  // 3. 弾いた瞬間ごとに、直前より強くなった音（＝新しく弾いた音）を拾う
  let events = [];
  onsets.forEach((t, i) => {
    if (i % 10 === 0) onProgress(0.5 + 0.5 * (i / onsets.length), 'タブ譜を作っています');
    const start = Math.floor((t + 0.02) * sampleRate);
    const next = i + 1 < onsets.length ? onsets[i + 1] : duration;
    const length = Math.max(Math.floor(0.1 * sampleRate), Math.floor((Math.min(next, t + 0.45) - t - 0.02) * sampleRate));
    // 直前の区間は、直後の区間と同じ長さにそろえる（長さが違うと低い音の強さを公平に比べられない）
    const prev = i > 0 ? onsets[i - 1] : 0;
    const preLength = Math.max(Math.floor(0.08 * sampleRate), Math.min(length, Math.floor((t - prev - 0.03) * sampleRate)));
    const post = magnitudeSpectrum(guitar, start, length, win);
    const pre = magnitudeSpectrum(guitar, Math.floor((t - 0.01) * sampleRate) - preLength, preLength, win);

    // 直後の音から直前の音を引いた「増えた分」だけを見る（鳴り続けている音を除くため）
    const added = new Float32Array(post.length);
    for (let k = 0; k < post.length; k++) added[k] = Math.max(0, post[k] - pre[k]);
    if (method === 'peel') {
      const peeled = peelNotes(post, pre, binHz, peelOptions);
      let fresh = peeled.map((e) => e.m);
      if (voiceFilter) fresh = fresh.filter((m) => !looksLikeVoice(guitar, sampleRate, m, start, length, voiceOptions));
      fresh.sort((a, b) => a - b);
      let positions = null;
      if (snapStrums && fresh.length >= snapMin) {
        const snapped = snapToVoicing(post, sampleRate, win, fresh, tuning);
        if (snapped) ({ notes: fresh, positions } = snapped);
      }
      if (fresh.length) events.push({ t, notes: fresh, ...(positions ? { positions } : {}), ...(legatoTimes.includes(t) ? { legato: true } : {}), peeled: peeled.map((e) => ({ m: e.m, s: e.s, share: e.share })) });
      return;
    }
    // method 'diff'：増えた分のスペクトルから音を探す / 'rise'：鳴っている音を探し、直前より強くなった音を選ぶ
    const source = method === 'diff' ? added : post;
    const { notes } = analyzeSpectrum(source, sampleRate, win);
    const energies = notes
      .filter((m) => m >= LOWEST && m <= HIGHEST)
      .map((m) => ({
        m,
        now: noteEnergy(source, binHz, m),
        rise: noteEnergy(post, binHz, m) / (noteEnergy(pre, binHz, m) + 1e-9),
        fundamental: peakNear(source, binHz, freq(m), 30).mag,
      }))
      .filter((e) => method === 'diff' || e.rise >= riseRatio);
    const strongest = Math.max(...energies.map((e) => e.now), 1e-9);
    const candidates = energies.filter((e) => e.now >= strongest * minStrength).sort((a, b) => a.m - b.m);
    // 低い音の倍音（1オクターブ上・その5度上・2オクターブ上…）と同じ高さで、低い音よりはっきり強くないものは倍音とみなして除く
    const accepted = [];
    for (const e of candidates) {
      const harmonicOf = accepted.find((a) => HARMONIC_STEPS.includes(e.m - a.m) && e.fundamental < a.fundamental * harmonicRatio);
      if (harmonicOf) continue;
      // 本物の音なら倍音もそろっている。倍音が見つからない高い音は、弾いた瞬間の「カチッ」という雑音とみなす
      if (e.m >= 72 && peakNear(source, binHz, freq(e.m) * 2, 30).mag < e.fundamental * 0.1) continue;
      if (voiceFilter && looksLikeVoice(guitar, sampleRate, e.m, start, length, voiceOptions)) continue;
      if (voiceFilter && attackRatio > 0 && softAttack(guitar, sampleRate, e.m, Math.floor((t - 0.01) * sampleRate), attackRatio)) continue;
      accepted.push(e);
    }
    let fresh = accepted.slice(0, 6).map((e) => e.m);
    let positions = null;

    if (!fresh.length) {
      // 弾いた瞬間なのに新しい音が無い：鳴っていた音を同じ弦で弾き直したとみなし、いちばん強い音を使う
      const top = energies.filter((e) => e.rise >= 0.9).sort((a, b) => b.now - a.now)[0];
      if (top) fresh = [top.m];
    } else if (snapStrums && fresh.length >= snapMin) {
      // ストローク（3音以上を同時に弾いた）：コードを判定し、聞こえた音にいちばん合う押さえ方にそろえる
      const snapped = snapToVoicing(post, sampleRate, win, fresh, tuning);
      if (snapped) ({ notes: fresh, positions } = snapped);
    }
    if (fresh.length) events.push(positions ? { t, notes: fresh, positions } : { t, notes: fresh });
  });

  // 4. 拍を見つけ、拍ごとに鳴った音をまとめてコード譜にする
  onProgress(0.97, 'コード譜にまとめています');
  const beatChromasFor = (beats, period, useSegment = false) => {
    const chromas = [];
    const basses = [];
    beats.forEach((b, k) => {
      const end = k + 1 < beats.length ? beats[k + 1] : b + period;
      const inside = chordFrames.filter((f) => f.t >= b && f.t < end);
      const chroma = new Array(12).fill(0);
      inside.forEach((f) => f.chroma.forEach((v, i) => { chroma[i] += v; }));
      // その拍の中で実際に弾いた音（倍音をはがして見つけた音）も、コードの手がかりとして足す
      const played = events.filter((e) => e.t >= b - 0.03 && e.t < end - 0.03);
      const frameTotal = chroma.reduce((a, c) => a + c, 0) || 1;
      // 弾き語りなど歌と分けられない曲では、弾いた音に歌が混ざるので使わない
      const w = noteWeight ?? (useSide ? 0.5 : 0);
      played.forEach((e) => e.notes.forEach((m) => { chroma[m % 12] += (w * frameTotal) / Math.max(1, played.length * e.notes.length); }));
      // 区切りの中だけで聞く：拍の頭〜次の拍の頭の音だけを使う（前後のコードの音が混ざらない）。
      // 長い区間で聞いた12音の強さは前後の拍の音を含むので、コードが速く切り替わると混ざってしまうため
      let segBass = null;
      if (useSegment && segmentChroma > 0 && end - b >= 0.12) {
        const s0 = Math.floor((b + 0.03) * sampleRate), len = Math.floor((end - b - 0.04) * sampleRate);
        const mags = magnitudeSpectrum(guitar, s0, len, 16384);
        const a = analyzeSpectrum(mags, sampleRate, 16384, { harmonicResidual, highWeight });
        const tot = a.chroma.reduce((x, y) => x + y, 0) || 1;
        a.chroma.forEach((v, i) => { chroma[i] = (1 - Math.min(1, segmentChroma)) * chroma[i] + segmentChroma * (v / tot) * frameTotal; });
        if (segmentBass) segBass = analyzeSpectrum(magnitudeSpectrum(useSide ? mid : guitar, s0, len, 16384), sampleRate, 16384).bass;
      }
      chromas.push(chroma);
      const counts = new Map();
      inside.forEach((f) => { if (f.bass !== null && f.bass !== undefined) counts.set(f.bass, (counts.get(f.bass) || 0) + 1); });
      basses.push(segBass ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    });
    return { chromas, basses };
  };
  // 拍の位置は、表と裏（8分音符のずれ）を取り違えやすい。表と裏の2つの候補のうち、
  // コードの変わり目が小節の頭にいちばんきれいにそろう位置を選ぶ
  let grid = null;
  let vocalFrames = null;
  const devocalChromas = (g) => {
    // 歌のメロディを取り除いた短い区間の音から、拍ごとの12音の強さを作り直す
    vocalFrames ??= removeVocalFrames(guitar, sampleRate, vocalOptions);
    return g.beats.map((b, k) => {
      const end = k + 1 < g.beats.length ? g.beats[k + 1] : b + g.period;
      const chroma = new Array(12).fill(0);
      vocalFrames.filter((f) => f.t >= b && f.t < end).forEach((f) => {
        const c = analyzeSpectrum(f.mags, sampleRate, 16384, { harmonicResidual }).chroma;
        const tot = c.reduce((a, v) => a + v, 0) || 1;
        c.forEach((v, i) => { chroma[i] += v / tot; });
      });
      return chroma;
    });
  };
  // 拍の区切り：表裏・直線当てはめの候補から、コードの変わり目が小節の頭にいちばんきれいにそろうものを選ぶ
  for (const [phaseShift, fitLine] of [[0, false], [0.5, false], [0, true], [0.5, true]]) {
    const g = estimateBeats(onsetList, duration, { phaseShift, fitLine });
    if (g.beats.length < 4) continue;
    let { chromas, basses } = beatChromasFor(g.beats, g.period);
    if (chromaMethod === 'devocal') chromas = devocalChromas(g);
    if (chromaMethod === 'stable') {
      chromas = stableBeatSpectra(guitar, sampleRate, g.beats, g.period).map((spec) => analyzeSpectrum(spec, sampleRate, 8192).chroma);
    }
    const { offset, score } = findDownbeatScored(chromas);
    if (!grid || score > grid.score) grid = { ...g, chromas, basses, downbeat: offset, score };
  }
  // 拍の区切りが決まってから、区切りの中だけで聞いた音でコードを判定し直す
  if (grid && segmentChroma > 0 && chromaMethod !== 'devocal' && chromaMethod !== 'stable') ({ chromas: grid.chromas, basses: grid.basses } = beatChromasFor(grid.beats, grid.period, true));
  // 前のコードの残りへの対策（弾いた瞬間の音を手がかりにする）：
  // 弾いた瞬間に「急に大きくなった音」＝新しく弾いた弦の音。前から響いているだけの音は大きくならない。
  // - 新しく鳴った音が前の拍のコードの音と同じ → コードは変わっていない。そのまま
  // - 前の拍に無かった音が強く鳴った → コードが変わった。前の拍の残りを差し引き、新しく鳴った音を重く見る
  if (grid && (attackChroma > 0 || prevSubtract > 0 || fuseAttack > 0 || fuseSubtract > 0 || changeBonus > 0 || exportFeatures || learned > 0)) {
    const norm = (c) => { const t = c.reduce((x, y) => x + y, 0) || 1; return c.map((v) => v / t); };
    const orig = grid.chromas.map(norm);
    const attacks = grid.beats.map((b, k) => {
      const end = k + 1 < grid.beats.length ? grid.beats[k + 1] : b + grid.period;
      const inBeat = onsetList.filter((o) => o.t >= b - 0.05 && o.t < end - 0.05);
      if (!inBeat.length) return null;
      const att = new Array(12).fill(0);
      inBeat.forEach((o) => {
        const len = Math.floor(Math.min(0.25, Math.max(0.08, end - o.t - 0.03)) * sampleRate);
        const post = magnitudeSpectrum(guitar, Math.floor((o.t + 0.02) * sampleRate), len, win);
        const pre = magnitudeSpectrum(guitar, Math.floor((o.t - 0.01) * sampleRate) - len, len, win);
        const rise = new Float32Array(post.length);
        for (let i = 0; i < post.length; i++) rise[i] = Math.max(0, post[i] - pre[i]);
        const ch = analyzeSpectrum(rise, sampleRate, win, { harmonicResidual, highWeight }).chroma;
        const tot = ch.reduce((x, y) => x + y, 0) || 1;
        ch.forEach((v, i) => { att[i] += (v / tot) * o.strength; });
      });
      return norm(att);
    });
    // 組み合わせ：元の12音の強さはそのままに、「弾いた瞬間の音」「前の拍の残りを引いた音」「前に無い音が鳴った度合い」を別に渡す
    const fresh = attacks.map((att, k) => {
      if (!att || k === 0) return 0.25;
      const pm = Math.max(...orig[k - 1]), am = Math.max(...att);
      let strong = 0, f = 0;
      att.forEach((v, i) => { if (v >= am * 0.3) { strong += v; if (orig[k - 1][i] < pm * 0.4) f += v; } });
      return f / (strong || 1);
    });
    grid.extra = [];
    if (fuseAttack > 0) grid.extra.push({ chromas: attacks.map((a, k) => (a && k > 0 ? a : null)), weight: fuseAttack });
    if (fuseSubtract > 0) grid.extra.push({ chromas: orig.map((v, k) => (k ? norm(v.map((x, i) => Math.max(x * 0.15, x - 0.5 * orig[k - 1][i]))) : null)), weight: fuseSubtract });
    grid.fresh = fresh;
    // 学習用：拍ごとの12音の強さ（ふつうに聞いた音・弾いた瞬間の音）とベース音を書き出す
    // 学習した判定器で「コードに本当に入っている音」の確率を出し、12音の強さに混ぜる（前のコードの響きの残りを掃除する）
    if (learned > 0) {
      const bars = grid.beats.map((_, k) => ((k - grid.downbeat) % 4 + 4) % 4);
      const probs = chordToneProbabilities(orig, attacks, grid.basses, bars);
      grid.chromas = grid.chromas.map((c, k) => {
        const tot = c.reduce((x, y) => x + y, 0) || 1;
        const pt = probs[k].reduce((x, y) => x + y, 0) || 1;
        // 判定器の自信（確率が 0 か 1 にどれだけ近いか）が低い拍では、今までの聞き方を優先する
        const conf = learnedConfidence ? probs[k].reduce((a, q) => a + Math.abs(2 * q - 1), 0) / 12 : 1;
        const w = Math.min(1, learned) * (learnedConfidence ? conf * conf : 1);
        return orig[k].map((v, i) => ((1 - w) * v + (w * probs[k][i]) / pt) * tot);
      });
    }
    if (exportFeatures) grid.features = { beats: grid.beats, chromas: orig, attacks, basses: grid.basses, downbeat: grid.downbeat };
    const changed = [];
    if (attackChroma > 0 || prevSubtract > 0) grid.chromas = grid.chromas.map((c, k) => {
      const att = attacks[k];
      if (!att || k === 0) { changed.push(false); return c; }
      if (changeGate > 0) {
        const pm = Math.max(...orig[k - 1]);
        const am = Math.max(...att);
        let strong = 0, fresh = 0;
        att.forEach((v, i) => { if (v >= am * 0.3) { strong += v; if (orig[k - 1][i] < pm * 0.4) fresh += v; } });
        if (fresh / (strong || 1) < changeGate) { changed.push(false); return c; }
      }
      changed.push(true);
      const tot = c.reduce((x, y) => x + y, 0) || 1;
      let out = orig[k].map((v, i) => Math.max(v * 0.15, v - prevSubtract * orig[k - 1][i]));
      out = norm(out).map((v, i) => (1 - Math.min(1, attackChroma)) * v + attackChroma * att[i]);
      return norm(out).map((v) => v * tot);
    });
    if (chartOptions.debug) grid.debugChanged = changed;
  }
  let timeline = buildChordTimeline(chordFrames, { minDuration: chordMinDuration });
  const bpm = grid?.bpm ?? null, beats = grid?.beats ?? [], downbeat = grid?.downbeat ?? 0;
  let chartInfo = null;
  let vocalShare = null;
  if (useChart && grid) {
    // 歌を取り除くかどうか：同じ高さの周りで音程が揺れる（ビブラート）区間が多い曲だけ、歌が入っているとみなして取り除く。
    // （歌の無い曲で取り除くと、ギターのメロディの音まで消してしまうため）
    const variants = [{ label: 'そのまま', chromas: grid.chromas }];
    if (chromaMethod === 'auto' && !useSide) {
      const devocal = devocalChromas(grid);
      vocalShare = vocalFrames.filter((f) => f.vocal).length / Math.max(1, vocalFrames.length);
      if (vocalShare >= vocalPresence) variants[0] = { label: '歌を除く', chromas: devocal };
    }
    let best = null;
    for (const v of variants) {
      // ベース音の信用度：聞き取ったベースの音が、その拍で強く鳴っている音（上位3つ）に入っている割合。
      // 低い音の聞き取りが不安定な録音では、ベースの音を手がかりにしない
      let agree = 0, counted = 0;
      v.chromas.forEach((c, k) => {
        const bass = grid.basses[k];
        if (bass === null || bass === undefined) return;
        counted++;
        const top3 = c.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
        if (top3.includes(bass)) agree++;
      });
      const reliability = counted ? Math.max(0, Math.min(1, (agree / counted - 0.5) / 0.35)) : 0;
      // ベースの音は少しだけ手がかりにする。分数コード（Em/D・D/C など）ではベースがルートと違い、
      // コードの外の音のこともあるので、ベースがコードの外の音でも減点しない
      const weight = (chartOptions.rootBonus ?? 0.05) * reliability;
      const states = decodeChords(v.chromas, grid.downbeat, { beatBass: grid.basses, extra: v.label === 'そのまま' ? grid.extra ?? [] : [], changeEvidence: grid.fresh ?? null, changeBonus, ...chartOptions, rootBonus: weight, foreignBassPenalty: chartOptions.foreignBassPenalty ?? 0 });
      const fit = states.reduce((a, st, k) => a + cosine(v.chromas[k], st.template), 0) / Math.max(1, states.length);
      if (!best || fit > best.fit) best = { ...v, states, fit, reliability };
    }
    chartInfo = { ...(grid.features ? { features: grid.features } : {}), method: best.label, vocalShare, bassReliability: best.reliability, fit: best.fit, ...(chartOptions.debug ? { debugChromas: best.chromas, debugStates: best.states.map((x) => x.name), debugBasses: grid.basses } : {}) };
    // ベース音を信用できない録音では、分数コード（C/G など）にしない
    timeline = buildChart(grid.beats, best.states, grid.basses, grid.period, { allowSlash: best.reliability >= 0.6, minBeats }).filter((seg) => seg.end - seg.start > 0);
  }

  // 5. コード譜を手がかりに、1音ずつのタブ譜を整える
  if (useContext && grid) events = refineWithChart(events, noteOnsetList, timeline, tuning, contextOptions);
  // 歌と分けられない曲：歌のメロディと同じ高さ・同じころに鳴り始めた単音は、歌とみなしてタブ譜から除く
  // （歌が入っていると判断した曲だけ。ソロのギターもチョーキングやビブラートで音程が揺れるので、歌の無い曲で行うとメロディを消してしまう）
  if (!useSide && vocalFrames && dropVocalNotes && chartInfo?.method === '歌を除く') {
    events = events.map((e) => {
      if (e.positions) return e;
      const near = vocalFrames.filter((f) => f.vocal && Math.abs(f.t - e.t) < 0.2);
      const notes = e.notes.filter((m) => !near.some((f) => Math.abs(f.cents / 100 - m) < 0.6));
      return { ...e, notes };
    }).filter((e) => e.notes.length);
  }

  // 6. 音の長さ：弾いた後、音量がどこまで下がったら止めた（ミュートした）とみなすかを、音量の変化から読み取る。
  //    コード譜の再生で、実際の演奏と同じ長さで鳴らすため
  if (estimateDurations) {
    const hop = Math.round(sampleRate * 0.01);
    const env = new Float32Array(Math.ceil(guitar.length / hop));
    for (let i = 0; i < env.length; i++) {
      let sum = 0, n = 0;
      for (let j = i * hop; j < Math.min(guitar.length, (i + 1) * hop); j++) { sum += guitar[j] * guitar[j]; n++; }
      env[i] = Math.sqrt(sum / Math.max(1, n));
    }
    const times = onsets;
    events = events.map((e) => {
      const start = Math.round(e.t / 0.01);
      let peak = 0;
      for (let i = start; i < Math.min(env.length, start + 8); i++) peak = Math.max(peak, env[i]);
      const next = times.find((t) => t > e.t + 0.03) ?? duration;
      let end = Math.round(next / 0.01);
      for (let i = start + 3; i < Math.min(env.length, end); i++) {
        if (env[i] < peak * stopRatio) { end = i; break; }
      }
      return { ...e, dur: Math.max(0.05, end * 0.01 - e.t) };
    });
  }

  onProgress(1, '完了');
  return { duration, useSide, sideRatio, chordFrames, timeline, events, bpm, beats, downbeat, chartInfo, onsets: noteOnsetList.map(({ t, strength }) => ({ t, strength })) };
}

/**
 * 曲を解析する。まず1回解析し、コードがとても速く変わる曲（平均 fastBeats 拍未満で変わる）だと分かったら、
 * 「弾いた瞬間に急に大きくなった音」と「前の拍の残りを引いた音」も手がかりに加えて、解析し直す。
 * （速い曲では前のコードの響きが残って読み違えやすいが、ゆっくりの曲でこの手がかりを使うと、かえって雑音を拾うため）
 */
export function transcribe(channels, sampleRate, options = {}) {
  const { fastBeats = 1.8, fastOptions = { fuseAttack: 0.5, fuseSubtract: 0.5, changeBonus: 0.1 }, learned = 0.4, learnedConfidence = true, onProgress = () => {} } = options;
  // 解析の回数（1回目：ふつう、2回目：学習した判定器でコード譜だけ作り直す、3回目：速い曲だけ）に合わせて進み具合を分ける
  const passes = 1 + (learned > 0 ? 1 : 0) + (fastBeats ? 0.5 : 0);
  let done = 0;
  const run = (opts, label) => {
    const from = done / passes, size = 1 / passes;
    const r = transcribeOnce(channels, sampleRate, { ...options, ...opts, onProgress: (p, m) => onProgress(from + size * p, label ?? m) });
    done += 1;
    return r;
  };
  // 1回目：ふつうに解析する（1音ずつのタブ譜は、この結果を使う）
  const first = run({ learned: 0 });
  let { timeline, chartInfo } = first;
  // 2回目：学習した判定器（前のコードの響きの残りなどを掃除する）を使って、コード譜だけ作り直す
  if (learned > 0 && first.bpm) ({ timeline, chartInfo } = run({ learned, learnedConfidence }, 'コード譜を学習した判定器で見直しています'));
  if (fastBeats && first.bpm) {
    const segs = timeline.filter((x) => x.end - x.start > 0);
    const avgBeats = segs.length ? segs.reduce((a, x) => a + (x.end - x.start), 0) / segs.length / (60 / first.bpm) : Infinity;
    // コードがとても速く変わる曲：弾いた瞬間に急に大きくなった音なども手がかりにして、コード譜を作り直す
    if (avgBeats < fastBeats) {
      const second = run({ ...fastOptions, learned, learnedConfidence }, 'コードの速い切り替わりに合わせて、解析し直しています');
      timeline = second.timeline;
      chartInfo = { ...second.chartInfo, fastMode: true, firstAvgBeats: avgBeats };
    }
  }
  onProgress(1, '完了');
  return { ...first, timeline, chartInfo };
}

/**
 * 解析のしかたの選択肢（画面の「解析の時間」）。
 * - fast：速い。1か所を見る区間を1つにし、解き直しもしない
 * - normal：ふつう（おすすめ）。採点に合格した方法を全部使う
 * - careful：じっくり。時間をかけてよい場合に、より重い方法も使う（採点に合格したものだけを足していく）
 */
export const ANALYSIS_PRESETS = {
  fast: { precise: false, fastBeats: 0, learned: 0 },
  normal: {},
  careful: {},
};

/**
 * ジャンルを推定するための、曲の特徴（1回目の解析結果から作る）。どれも 0〜1 くらいの大きさにそろえる
 */
export function songFeatures(r) {
  const dur = Math.max(1, r.duration);
  const ev = r.events ?? [];
  const tl = (r.timeline ?? []).filter((s) => s.end - s.start > 0);
  const beat = r.bpm ? 60 / r.bpm : 0.5;
  const ext = (name) => /7|9|6|11|13|sus|add|dim|aug|♭5/.test(name.split('/')[0].replace(/^[A-G][#♭]?/, ''));
  const tlTime = tl.reduce((a, s) => a + (s.end - s.start), 0) || 1;
  const durs = ev.map((e) => e.dur ?? 0.3).sort((a, b) => a - b);
  const medianDur = durs.length ? durs[Math.floor(durs.length / 2)] : 0.3;
  return {
    onsetRate: Math.min(1, ev.length / dur / 8), // 1秒あたりに弾いた回数（8回で 1）
    shortness: Math.min(1, 0.1 / Math.max(0.02, medianDur)), // 音が短いほど 1 に近い
    extended: tl.reduce((a, s) => a + (ext(s.name) ? s.end - s.start : 0), 0) / tlTime, // 足し音のあるコードの時間の割合
    slash: tl.reduce((a, s) => a + (s.name.includes('/') ? s.end - s.start : 0), 0) / tlTime, // 分数コードの割合（ベースが動く）
    chordBeats: Math.min(1, (tlTime / Math.max(1, tl.length) / beat) / 16), // コードが何拍ごとに変わるか（16拍で 1）
    strumShare: ev.length ? ev.filter((e) => e.positions || e.notes.length >= 3).length / ev.length : 0, // 和音で弾いた割合
    tempo: Math.min(1, (r.bpm ?? 100) / 200),
  };
}

/**
 * ジャンルごとの設定（画面の「ジャンル」）。研究用データのジャンル別の採点で、
 * 知らない演奏者でも良くなった設定だけをここに入れる（tests/learn/genre-search.js）。
 * auto（おまかせ）は、音の特徴からジャンルを推定して、そのジャンルの設定を使う
 */
export const GENRE_PRESETS = {
  pop: {},
  singer: {},
  jazz: {},
  funk: {},
  bossa: {},
};
export const GENRE_NAMES = { pop: 'ポップ・ロック', singer: '弾き語り', jazz: 'ジャズ', funk: 'ファンク', bossa: 'ボサノバ' };
