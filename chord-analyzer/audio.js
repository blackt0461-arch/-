// マイクの音を聞き取り、12音の強さ（クロマ）とベース音を求める

import { frequencyToMidi } from './chord-engine.js';
import { LiveChordTracker } from './live.js';

const MIN_FREQ = 60;      // Drop D の6弦(73Hz)より少し下
const MAX_FREQ = 4000;    // 倍音も使うので高めまで見る
const PEAK_RATIO = 0.005; // いちばん強い山に対して、これより弱い山は雑音として無視
const LOWEST_NOTE = 38;   // D2（Drop D の6弦）
const HIGHEST_NOTE = 86;  // D6
const HARMONICS = 8;
const MAX_NOTES = 7;
const ONSET_WAIT_MS = 150;

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

/** 音の山（ピーク）を拾う。放物線補間で頂点の周波数を細かく求める */
function findPeaks(magnitudes, binHz) {
  const lo = Math.max(1, Math.floor(MIN_FREQ / binHz));
  const hi = Math.min(magnitudes.length - 2, Math.ceil(MAX_FREQ / binHz));
  let max = 0;
  for (let k = lo; k <= hi; k++) max = Math.max(max, magnitudes[k]);
  const peaks = [];
  if (max === 0) return peaks;
  for (let k = lo; k <= hi; k++) {
    const b = magnitudes[k];
    if (b < max * PEAK_RATIO || b < magnitudes[k - 1] || b <= magnitudes[k + 1]) continue;
    const a = magnitudes[k - 1], c = magnitudes[k + 1];
    const denom = a - 2 * b + c;
    const offset = denom === 0 ? 0 : 0.5 * (a - c) / denom;
    peaks.push({ freq: (k + offset) * binHz, mag: b / max });
  }
  return peaks;
}

/** ギター全体のチューニングのずれ（セント）を、強い山の平均的なずれから推定する */
function estimateTuningCents(peaks) {
  let x = 0, y = 0;
  peaks.forEach((p) => {
    if (p.freq > 1000) return; // 高い倍音は弦の硬さで上にずれるので使わない
    const dev = frequencyToMidi(p.freq) - Math.round(frequencyToMidi(p.freq));
    x += p.mag * Math.cos(2 * Math.PI * dev);
    y += p.mag * Math.sin(2 * Math.PI * dev);
  });
  return (Math.atan2(y, x) / (2 * Math.PI)) * 100;
}

/**
 * FFT の振幅（線形）から、鳴っている音を推定してクロマとベース音を求める。
 *
 * 1つの弦の音は「基音 f と、その 2f, 3f, 4f… の倍音」のまとまりになる。
 * そこで各音の候補について倍音の強さを合計し（倍音加算）、いちばん強い音から順に確定して、
 * 確定した音の倍音を差し引いていく。これで倍音を別の音と間違えにくくなり、
 * スマホのマイクで基音が小さく拾われる低音弦も、倍音の助けで見つけられる。
 */
export function analyzeSpectrum(magnitudes, sampleRate, fftSize, { harmonicResidual = 0.35, highWeight = 1, highFrom = 64 } = {}) {
  const binHz = sampleRate / fftSize;
  const peaks = findPeaks(magnitudes, binHz);
  if (peaks.length === 0) return { chroma: new Array(12).fill(0), bass: null, notes: [] };

  const tuning = estimateTuningCents(peaks);
  const remaining = peaks.map((p) => p.mag);

  // 周波数 f に近い山（許容 tol セント以内）の番号。見つからなければ -1
  const nearest = (f, tolCents) => {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < peaks.length; i++) {
      const d = Math.abs(1200 * Math.log2(peaks[i].freq / f));
      if (d < tolCents && d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  };

  // 各音の候補について、倍音に当たる山の番号を先に求めておく
  const candidates = [];
  for (let m = LOWEST_NOTE; m <= HIGHEST_NOTE; m++) {
    const f0 = midiToFreq(m + tuning / 100);
    const partials = [];
    for (let h = 1; h <= HARMONICS; h++) {
      const f = h * f0 * (1 + 0.0001 * h * h); // 弦の硬さで高い倍音ほど少し上にずれる
      if (f > MAX_FREQ) break;
      partials.push(nearest(f, h === 1 ? 35 : 45));
    }
    // 基音の山が無い候補は「別の音の倍音の一部」とみなして除外
    if (partials[0] >= 0) candidates.push({ midi: m, partials });
  }

  const salience = (c) => c.partials.reduce((sum, idx, i) => (idx < 0 ? sum : sum + Math.sqrt(remaining[idx]) / (i + 1) ** 0.5), 0)
    * (c.partials.slice(1, 4).some((idx) => idx >= 0) ? 1 : 0.5); // 倍音を1つも持たない山は弱める

  const notes = [];
  let first = 0;
  while (notes.length < MAX_NOTES) {
    let best = null, bestS = 0;
    candidates.forEach((c) => {
      if (notes.some((n) => n.midi === c.midi)) return;
      const s = salience(c);
      if (s > bestS) { best = c; bestS = s; }
    });
    if (!best) break;
    if (notes.length === 0) first = bestS;
    else if (bestS < first * 0.25) break;
    notes.push({ midi: best.midi, strength: bestS });
    // 確定した音の倍音を差し引く（別の弦の音が同じ周波数にあるかもしれないので少し残す）
    best.partials.forEach((idx, i) => { if (idx >= 0) remaining[idx] *= i === 0 ? 0 : harmonicResidual; });
  }

    // ベース音：スマホのマイクでは低音弦の基音が小さくなり、上の処理で取りこぼしやすい。
  // そこで「基音と 2倍・3倍の倍音がそろっている、いちばん低い音」を別に探す
  let lowest = notes.reduce((lo, n) => (lo === null || n.midi < lo.midi ? n : lo), null);
  const bassCandidate = candidates.find((c) => c.partials[1] >= 0 && c.partials[2] >= 0
    && peaks[c.partials[0]].mag > 0.01 && peaks[c.partials[1]].mag + peaks[c.partials[2]].mag > 0.1);
  if (bassCandidate && (!lowest || bassCandidate.midi < lowest.midi)) {
    lowest = { midi: bassCandidate.midi, strength: first * 0.5 };
    if (!notes.some((n) => (n.midi - lowest.midi) % 12 === 0)) notes.push(lowest);
  }
  const bass = lowest ? ((lowest.midi % 12) + 12) % 12 : null;

  const chroma = new Array(12).fill(0);
  // highWeight < 1 なら、高い音（highFrom より上：メロディが多い）を軽く扱う
  notes.forEach((n) => { chroma[((n.midi % 12) + 12) % 12] += n.strength * (n.midi > highFrom ? highWeight : 1); });

  return { chroma, bass, notes: notes.map((n) => n.midi) };
}

/**
 * 雑音の覚え方と差し引き方。
 * 弾いていない間の周波数ごとの雑音の大きさを覚えておき、音を分析する前に差し引く
 * （スペクトル減算）。エアコンの「サー」や電源の「ブーン」のような、ずっと鳴っている雑音に効く。
 */
export class NoiseProfile {
  constructor() {
    this.noise = null;
    this.count = 0;
  }

  learn(magnitudes) {
    if (!this.noise) this.noise = new Float32Array(magnitudes.length);
    // 最初は平均、その後はゆっくり追いかける（部屋の雑音が変わっても追従できるように）
    const a = this.count < 20 ? 1 / (this.count + 1) : 0.05;
    for (let i = 0; i < magnitudes.length; i++) this.noise[i] += a * (magnitudes[i] - this.noise[i]);
    this.count++;
  }

  get ready() {
    return this.count >= 5;
  }

  subtract(magnitudes, overSubtract = 2) {
    if (!this.noise) return magnitudes;
    const out = new Float32Array(magnitudes.length);
    for (let i = 0; i < magnitudes.length; i++) {
      // 雑音の少し上までを差し引き、残りが小さすぎるところは 0 にする
      out[i] = Math.max(0, magnitudes[i] - this.noise[i] * overSubtract);
    }
    return out;
  }
}

/**
 * マイクの「聞き取る距離」。0（近く：ギターにスマホを近づける）〜 1（遠く：離して置く）。
 * 遠くにするほど、聞こえた音を大きく増幅し（最大16倍）、「弾いている」とみなす基準も下げる。
 */
const micSetting = { distance: 0.3 };
const openGains = new Set();
export const micGain = () => 2 ** (micSetting.distance * 4); // 1〜16倍
// 「弾いている」とみなす、周りの雑音との差（近く 1.8倍 〜 遠く 1.25倍）
const loudRatio = () => 1.8 - micSetting.distance * 0.55;
export function setMicDistance(value) {
  micSetting.distance = Math.max(0, Math.min(1, value));
  openGains.forEach((g) => { g.gain.value = micGain(); });
}

/**
 * マイクを開く（コード判定とチューナーで共通）。
 * - iPhone の Safari は、音の処理が「一時停止」で始まることがあるので、タップ直後に再開させる
 * - 弾いている間に画面が消えてマイクが止まらないよう、画面を点けたままにする（対応ブラウザのみ）
 */
async function openMicrophone(fftSize) {
  // タップの処理の中ですぐ作って再開する（await の後だと iPhone で再開できないことがある）
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const resumed = ctx.resume();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    ctx.close();
    throw err;
  }
  await resumed;
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  // 聞き取る距離に合わせて増幅してから分析する（遠くに置いても小さな音を拾えるように）
  const gain = ctx.createGain();
  gain.gain.value = micGain();
  openGains.add(gain);
  source.connect(gain).connect(analyser);

  let wakeLock = null;
  const keepAwake = async () => {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 使えなくても動作は続ける */ }
  };
  // アプリに戻ってきたとき：画面の点灯を取り直し、止まった音の処理を再開する
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    keepAwake();
    if (ctx.state !== 'running') ctx.resume();
  };
  keepAwake();
  document.addEventListener('visibilitychange', onVisible);

  return {
    ctx,
    analyser,
    close() {
      openGains.delete(gain);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}

/**
 * マイクを使い始め、フレームごとに onFrame({ chroma, candidates, level, state }) を呼ぶ（candidates：コードの候補）。
 * state は 'calibrating'（周りの雑音を覚えている途中）/ 'quiet'（弾いていない）/ 'playing'。
 * 戻り値の stop() で止める。
 */
export async function startListening(onFrame, { calibrationSeconds = 1 } = {}) {
  // 分析する長さ（約0.37秒）。長いほど近い音を見分けやすいが、コードの切り替わりへの反応が遅れる。
  // 本物の曲（1小節 約1.8秒）での答え合わせで、この長さがいちばん良かった
  const mic = await openMicrophone(16384);
  const { ctx, analyser } = mic;

  const db = new Float32Array(analyser.frequencyBinCount);
  const linear = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const recentSamples = Math.round(ctx.sampleRate * 0.1);
  const noise = new NoiseProfile();
  let noiseLevel = 0;
  let smoothChroma = new Array(12).fill(0);
  const tracker = new LiveChordTracker(ctx.sampleRate, analyser.fftSize);
  const startedAt = performance.now();
  let last = startedAt;
  let wasPlaying = false;
  let loudSince = null;
  let rafId = 0;

  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    const dt = (now - last) / 1000;
    if (dt < 1 / 30) return; // 1秒に30回で十分
    last = now;

    // 直近 0.1 秒の音量
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = wave.length - recentSamples; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / recentSamples);

    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < db.length; i++) linear[i] = Math.pow(10, db[i] / 20);

    // 最初の約1秒と、周りの雑音と同じくらい静かなときに、雑音を覚える
    const calibrating = now - startedAt < calibrationSeconds * 1000 || !noise.ready;
    const quiet = level < Math.max(noiseLevel * 1.3, 0.002);
    if (calibrating || quiet) {
      noise.learn(linear);
      noiseLevel += (calibrating ? 0.3 : 0.05) * (level - noiseLevel);
    }
    if (calibrating) {
      onFrame({ chroma: smoothChroma, candidates: [], level, state: 'calibrating' });
      return;
    }
    const loud = level > Math.max(noiseLevel * loudRatio(), 0.003);
    // 弾いた直後は分析する範囲にまだ弾く前の音が多く混ざるので、少し鳴ってから判定する
    if (!loud) loudSince = null;
    else if (loudSince === null) loudSince = now;
    const playing = loud && now - loudSince >= ONSET_WAIT_MS;

    // コードの判定（倍音対策・シンプルなコード優先・ベース音・歌の除去・慣性つき）は live.js で行う
    const onset = playing && !wasPlaying;
    wasPlaying = playing;
    if (!playing) {
      onFrame({ chroma: smoothChroma, candidates: [], level, state: 'quiet' });
      return;
    }
    const { candidates } = tracker.update(noise.subtract(linear), { wave, dt, onset });
    smoothChroma = tracker.chroma;
    onFrame({ chroma: smoothChroma, candidates, level, state: 'playing' });
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      cancelAnimationFrame(rafId);
      mic.close();
    },
  };
}

/**
 * 単音の高さ（Hz）を求める（チューナー用）。YIN という方法で、波形が何サンプルごとに
 * 繰り返しているかを調べる。倍音の多いギターの音でも、1オクターブ上と間違えにくい。
 * 音が無い・はっきりしないときは null。
 */
export function detectPitch(buffer, sampleRate, { minFreq = 60, maxFreq = 1000, threshold = 0.12 } = {}) {
  const maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buffer.length / 2));
  const minLag = Math.floor(sampleRate / maxFreq);
  const n = buffer.length - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const diff = buffer[i] - buffer[i + lag];
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  // 累積平均で正規化した差分（小さいほど、その間隔で繰り返している）
  let running = 0;
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cmnd[lag] = running === 0 ? 1 : (d[lag] * lag) / running;
  }
  let lag = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      lag = t;
      break;
    }
  }
  if (lag < 0) return null;
  // 放物線補間で、サンプルの間まで細かく求める
  const a = cmnd[lag - 1], b = cmnd[lag], c = lag + 1 <= maxLag ? cmnd[lag + 1] : b;
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : 0.5 * (a - c) / denom;
  return sampleRate / (lag + shift);
}

/**
 * チューナー：フレームごとに onFrame({ freq, level }) を呼ぶ（freq は鳴っていなければ null）。
 */
export async function startTuner(onFrame) {
  const mic = await openMicrophone(4096);
  const { ctx, analyser } = mic;
  const wave = new Float32Array(analyser.fftSize);
  let rafId = 0;
  let last = 0;
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    if (now - last < 1000 / 20) return;
    last = now;
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / wave.length);
    const freq = level > 0.004 ? detectPitch(wave, ctx.sampleRate) : null;
    onFrame({ freq, level });
  };
  rafId = requestAnimationFrame(tick);
  return {
    stop() {
      cancelAnimationFrame(rafId);
      mic.close();
    },
  };
}

/**
 * 6本の弦を同時に鳴らした音から、弦ごとの音程のずれ（セント）を測る（全弦チューナー）。
 * 各弦について、合わせたい高さの近く（±70セント）で基音の山を探し、2倍・3倍の倍音でも高さを測って平均する。
 * ただし、別の弦の倍音と重なる倍音（例：5弦 A の3倍音と1弦 E）は、どちらの音か分からないので使わない。
 * targets：合わせたい高さ（MIDI、6弦→1弦）。戻り値：[{ cents, found, strength }]（6弦→1弦）
 */
export function measureStrings(mags, sampleRate, fftSize, targets) {
  const binHz = sampleRate / fftSize;
  const freqOf = (m) => 440 * 2 ** ((m - 69) / 12);
  const peakIn = (f, cents) => {
    const lo = Math.max(1, Math.floor((f * 2 ** (-cents / 1200)) / binHz));
    const hi = Math.min(mags.length - 2, Math.ceil((f * 2 ** (cents / 1200)) / binHz));
    let k = -1;
    for (let i = lo; i <= hi; i++) if (mags[i] > mags[i - 1] && mags[i] >= mags[i + 1] && (k < 0 || mags[i] > mags[k])) k = i;
    if (k < 0) return null;
    const a = mags[k - 1], b = mags[k], c = mags[k + 1];
    const denom = a - 2 * b + c;
    const offset = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    return { freq: (k + offset) * binHz, mag: b };
  };
  // 別の弦の倍音（4倍まで）と 30 セント以内で重なるか
  const overlaps = (s, f) => targets.some((m, o) => o !== s && [1, 2, 3, 4].some((h) => Math.abs(1200 * Math.log2(f / (freqOf(m) * h))) < 30));

  const results = targets.map((m, s) => {
    const target = freqOf(m);
    const fund = peakIn(target, 70);
    if (!fund) return { cents: null, found: false, strength: 0 };
    const estimates = [{ f0: fund.freq, w: 2 }];
    for (const h of [2, 3]) {
      if (overlaps(s, target * h)) continue;
      const p = peakIn(fund.freq * h, 25);
      if (p) estimates.push({ f0: p.freq / h, w: 1 });
    }
    const f0 = estimates.reduce((a, e) => a + e.f0 * e.w, 0) / estimates.reduce((a, e) => a + e.w, 0);
    return { cents: 1200 * Math.log2(f0 / target), found: true, strength: fund.mag };
  });
  // 鳴っていない弦（ほかの弦よりずっと小さい山しか無い）は「見つからない」とする
  const strongest = Math.max(...results.map((r) => r.strength), 1e-9);
  return results.map((r) => (r.strength < strongest * 0.04 ? { cents: null, found: false, strength: r.strength } : r));
}

/**
 * 全弦チューナー：ジャラーンと鳴らすと、onFrame({ strings: [{ cents, found }], level }) を呼ぶ。
 * 鳴っている間の測定を平均して、針のふらつきを抑える。
 */
export async function startStrumTuner(targets, onFrame) {
  const mic = await openMicrophone(32768);
  const { ctx, analyser } = mic;
  const db = new Float32Array(analyser.frequencyBinCount);
  const linear = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const recent = Math.round(ctx.sampleRate * 0.1);
  let averaged = targets.map(() => null);
  let loudSince = null;
  let rafId = 0;
  let last = 0;
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    if (now - last < 1000 / 15) return;
    last = now;
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = wave.length - recent; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / recent);
    if (level < 0.004) { loudSince = null; onFrame({ strings: averaged, level }); return; }
    if (loudSince === null) { loudSince = now; averaged = targets.map(() => null); }
    if (now - loudSince < 300) return; // 鳴らしてすぐは、分析する範囲に前の音が多く混ざる
    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < db.length; i++) linear[i] = Math.pow(10, db[i] / 20);
    const measured = measureStrings(linear, ctx.sampleRate, analyser.fftSize, targets);
    averaged = measured.map((m, i) => {
      if (!m.found) return averaged[i];
      const prev = averaged[i];
      return { found: true, cents: prev ? prev.cents + 0.3 * (m.cents - prev.cents) : m.cents };
    });
    onFrame({ strings: averaged, level });
  };
  rafId = requestAnimationFrame(tick);
  return { stop() { cancelAnimationFrame(rafId); mic.close(); } };
}

/**
 * 押さえ方チェック：弾いた音（周波数分布）を、表示している押さえ方と比べる。
 * expected：弦ごとの鳴るはずの音（MIDI、6弦→1弦。鳴らさない弦は null）、openStrings：開放弦の高さ
 * 戻り値：弦ごとに { status: 'ok' | 'missing' | 'wrong' | 'unsure' | 'muted-ringing' | 'muted', detail }
 * - 鳴るはずの音の山があれば ok。無くて、半音〜全音ずれた山があれば wrong（押さえる位置のずれ）、どちらも無ければ missing
 * - 他の弦の倍音と重なる音（1オクターブ上など）は、倍音だけでは出ない大きさの山があるときだけ ok とする
 * - 鳴らさない弦の開放の音が、他の弦では説明できない大きさで鳴っていたら muted-ringing
 */
export function checkShape(mags, sampleRate, fftSize, expected, openStrings) {
  const binHz = sampleRate / fftSize;
  const freqOf = (m) => 440 * 2 ** ((m - 69) / 12);
  const peak = (m, cents = 35) => peakAt(freqOf(m), cents);
  const peakAt = (f, cents = 35) => {
    const lo = Math.max(1, Math.floor((f * 2 ** (-cents / 1200)) / binHz));
    const hi = Math.min(mags.length - 2, Math.ceil((f * 2 ** (cents / 1200)) / binHz));
    let best = 0;
    for (let k = lo; k <= hi; k++) if (mags[k] > mags[k - 1] && mags[k] >= mags[k + 1]) best = Math.max(best, mags[k]);
    return best;
  };
  const sounding = expected.filter((m) => m !== null);
  // 他の弦の倍音（2〜4倍）と同じ高さになる音なら、その倍音だけで出るはずの強さを見積もる。
  // 低い弦の1つ下と1つ上の倍音の強さの中間（幾何平均）を「倍音だけならこのくらい」とする
  const HARMONIC_OF = { 12: 2, 19: 3, 24: 4 };
  const harmonicEstimate = (m, s) => {
    let est = 0;
    expected.forEach((o, j) => {
      const h = HARMONIC_OF[m - o];
      if (j === s || o === null || !h) return;
      const below = peakAt(freqOf(o) * (h - 1)), above = peakAt(freqOf(o) * (h + 1));
      est = Math.max(est, Math.sqrt(below * above));
    });
    return est;
  };
  const levels = sounding.map((m) => peak(m)).filter((v) => v > 0).sort((a, b) => a - b);
  const reference = levels[Math.floor(levels.length / 2)] || Math.max(...mags);

  // 鳴らさないはずなのに鳴っている開放弦
  const ringing = expected.map((m, s) => {
    if (m !== null) return null;
    const open = openStrings[s];
    const explained = sounding.some((o) => [0, 12, 19, 24].includes(open - o));
    return !explained && peak(open) > reference * 0.3 ? open : null;
  });
  // 鳴っている音（ほかの弦の音とその倍音）で説明できる高さか
  const sources = [...sounding, ...ringing.filter((x) => x !== null)];
  const explainedBy = (n) => sources.some((o) => [0, 12, 19, 24, 28, 31].includes(n - o));

  return expected.map((m, s) => {
    if (m === null) return ringing[s] !== null ? { status: 'muted-ringing', detail: '鳴らさない弦が鳴っています' } : { status: 'muted', detail: '' };
    const level = peak(m);
    const fromHarmonic = harmonicEstimate(m, s);
    if (level >= reference * 0.12 && level >= fromHarmonic * 1.6) return { status: 'ok', detail: '' };
    const near = [-2, -1, 1, 2]
      .filter((d) => !explainedBy(m + d))
      .map((d) => ({ d, level: peak(m + d) }))
      .sort((a, b) => b.level - a.level)[0];
    if (near && near.level >= reference * 0.25) {
      return { status: 'wrong', detail: `${Math.abs(near.d) === 1 ? '半音' : '全音'}${near.d > 0 ? '高い' : '低い'}音が鳴っています（押さえる位置を確認）` };
    }
    // ほかの弦の1オクターブ上などと同じ音は、倍音と重なって確かめきれない
    if (fromHarmonic > 0 && level >= reference * 0.12) return { status: 'unsure', detail: 'ほかの弦と同じ音なので確認できません' };
    return { status: 'missing', detail: '鳴っていません（指が触れていないか確認）' };
  });
}

/**
 * 押さえ方チェックを始める。ジャラーンと弾くたびに onResult(弦ごとの結果) を呼ぶ。
 * getExpected()：その時点の押さえ方（弦ごとの MIDI。鳴らさない弦は null）
 */
export async function startShapeCheck(getExpected, openStrings, onResult) {
  const mic = await openMicrophone(32768);
  const { ctx, analyser } = mic;
  const db = new Float32Array(analyser.frequencyBinCount);
  const linear = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const recent = Math.round(ctx.sampleRate * 0.1);
  let loudSince = null;
  let done = false;
  let rafId = 0;
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = wave.length - recent; i < wave.length; i++) sum += wave[i] * wave[i];
    const level = Math.sqrt(sum / recent);
    if (level < 0.004) { loudSince = null; done = false; return; }
    if (loudSince === null) loudSince = now;
    // 弾いてから 0.35 秒後（音がそろったころ）に1回だけ調べる。次は静かになってから
    if (done || now - loudSince < 350) return;
    done = true;
    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < db.length; i++) linear[i] = Math.pow(10, db[i] / 20);
    onResult(checkShape(linear, ctx.sampleRate, analyser.fftSize, getExpected(), openStrings));
  };
  rafId = requestAnimationFrame(tick);
  return { stop() { cancelAnimationFrame(rafId); mic.close(); } };
}
