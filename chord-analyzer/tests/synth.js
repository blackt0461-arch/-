// 精度テスト用：ギターらしい音を合成し、AnalyserNode と同じように周波数分析する

export const SAMPLE_RATE = 48000;

// 再現できる乱数（毎回同じ結果にするため）
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 弦をはじいた音の集まりを合成する。現実の録音に近づけるため次を入れている：
 * - 弾く位置による倍音の強弱、高い倍音ほど早く減衰する
 * - 弦の硬さによる倍音のずれ（インハーモニシティ）
 * - ギター全体のチューニングのずれ ＋ 弦ごとの小さなずれ
 * - スマホのマイクは低音が苦手（低い周波数ほど小さくなる）
 * - 雑音
 */
export function synthChord(midis, { seed = 1, fftSize = 16384, at = 0.25, noise = 0 } = {}) {
  const rand = rng(seed);
  const globalCents = (rand() - 0.5) * 40;
  const n = fftSize;
  const out = new Float64Array(n);
  midis.forEach((midi, idx) => {
    const cents = globalCents + (rand() - 0.5) * 16;
    const f0 = 440 * 2 ** ((midi - 69 + cents / 100) / 12);
    const amp = 0.5 + rand() * 0.5;
    const pluck = 0.12 + rand() * 0.15;
    const B = 0.00005 + rand() * 0.0002;
    const delay = idx * 0.012; // ストロークで弦が少しずつ遅れて鳴る
    for (let h = 1; h <= 14; h++) {
      const f = h * f0 * Math.sqrt(1 + B * h * h);
      if (f > SAMPLE_RATE / 2 - 1000) break;
      const micGain = (f * f) / (f * f + 160 * 160);
      const a = amp * Math.abs(Math.sin(Math.PI * h * pluck)) / h ** 0.9 * micGain * (0.6 + rand() * 0.8);
      const decay = 1.5 + h * 0.6;
      const phase = rand() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const t = at + i / SAMPLE_RATE - delay;
        if (t < 0) continue;
        out[i] += a * Math.exp(-decay * t) * Math.sin(2 * Math.PI * f * t + phase);
      }
    }
  });
  addNoise(out, rand, noise);
  return out;
}

/**
 * 安いマイクや部屋の雑音を足す。
 * noise = 0 は静かな部屋、1 は「サー」という雑音と電源の「ブーン」（50Hz とその倍音）が目立つ状態
 */
export function addNoise(out, rand, noise = 0) {
  const white = 0.004 + noise * 0.05;
  let pink = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    pink = 0.97 * pink + (rand() - 0.5) * 0.3; // 低い音ほど強い雑音
    let hum = 0;
    for (let h = 1; h <= 6; h++) hum += Math.sin(2 * Math.PI * 50 * h * t + h) / h;
    out[i] += (rand() - 0.5) * white + noise * (pink * 0.06 + hum * 0.05);
  }
}

/** 弾いていない間の雑音だけの音（アプリが雑音を覚えるときに聞く音） */
export function synthNoise({ seed = 1, fftSize = 16384, noise = 0 } = {}) {
  const out = new Float64Array(fftSize);
  addNoise(out, rng(seed), noise);
  return out;
}

/** AnalyserNode と同じブラックマン窓をかけて FFT し、振幅（線形）を返す */
export function spectrum(signal) {
  const n = signal.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  const a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;
  for (let i = 0; i < n; i++) {
    const w = a0 - a1 * Math.cos((2 * Math.PI * i) / n) + a2 * Math.cos((4 * Math.PI * i) / n);
    re[i] = signal[i] * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const mags = new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) mags[k] = Math.hypot(re[k], im[k]) / n;
  return mags;
}

// 精度テストに使うコード（標準チューニング、6弦 → 1弦）と正解
export const BENCH_CHORDS = [
  ['x32010', 'C'], ['320003', 'G'], ['xx0232', 'D'], ['x02220', 'A'], ['022100', 'E'],
  ['133211', 'F'], ['x24442', 'B'], ['x02210', 'Am'], ['022000', 'Em'], ['xx0231', 'Dm'],
  ['x24432', 'Bm'], ['244222', 'F#m'], ['x35543', 'Cm'], ['355333', 'Gm'],
  ['x32310', 'C7'], ['320001', 'G7'], ['xx0212', 'D7'], ['x02020', 'A7'], ['020100', 'E7'], ['x21202', 'B7'],
  ['x32000', 'Cmaj7'], ['xx3210', 'Fmaj7'], ['x02120', 'Amaj7'], ['xx0202', 'D6'],
  ['x02010', 'Am7'], ['020000', 'Em7'], ['xx0211', 'Dm7'], ['x24232', 'Bm7'],
  ['xx0233', 'Dsus4'], ['x02230', 'Asus4'], ['xx0230', 'Dsus2'], ['x02200', 'Asus2'],
  ['x2323x', 'Bm7♭5'], ['x3424x', 'Cdim7'], ['x3211x', 'Caug'],
  ['032010', 'C/E'], ['2x0232', 'D/F#'], ['3x2010', 'C/G'],
  ['x32030', 'Cadd9'], ['x02110', 'Am(maj7)'], ['x32330', 'C9'], ['x02030', 'A7sus4'], ['022002', 'Em(add9)'],
];
