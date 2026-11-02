// 試し弾きで確かめる：迷った音の候補（同じ音・1オクターブ上下・半音上下）ごとに、
// 「この曲のギターでその音を弾いたら、こういう響き（倍音の並び）になるはず」という音を作り、
// 実際に増えた音といちばん似ている候補を選び直す。
// 音色（倍音の強さの並び）は、その曲の中で自信を持って取れた1音から覚える。

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const HARMONICS = 12;
const DEFAULT_PROFILE = Array.from({ length: HARMONICS }, (_, i) => 1 / (i + 1));

/** 弾いた瞬間に増えた分（直後 − 直前を少し弱めたもの） */
export function riseSpectrum(post, pre, decay = 0.9) {
  const d = new Float32Array(post.length);
  for (let k = 0; k < post.length; k++) d[k] = Math.max(0, post[k] - pre[k] * decay);
  return d;
}

// 弦の硬さで、高い倍音ほど少し上にずれる（本物の弦の鳴り方）
const partialHz = (m, h, stiffness) => freq(m) * h * Math.sqrt(1 + stiffness * h * h);

/** 倍音ごとの強さ（その近くのいちばん大きい値） */
function partialAmps(d, binHz, m, stiffness) {
  const out = [];
  for (let h = 1; h <= HARMONICS; h++) {
    const f = partialHz(m, h, stiffness);
    const c = 25 + 4 * h;
    const lo = Math.max(1, Math.floor((f * 2 ** (-c / 1200)) / binHz)), hi = Math.min(d.length - 1, Math.ceil((f * 2 ** (c / 1200)) / binHz));
    let best = 0;
    for (let k = lo; k <= hi; k++) if (d[k] > best) best = d[k];
    out.push(f > 5000 ? null : best);
  }
  return out;
}

/**
 * 曲の音色を覚える：1音だけ弾いた、はっきりした音の倍音の並び（基音を1とした比）の中央値
 * samples：[{ d, m }]
 */
export function learnProfile(samples, binHz, { stiffness = 0.0001, minSamples = 5 } = {}) {
  const per = Array.from({ length: HARMONICS }, () => []);
  samples.forEach(({ d, m }) => {
    const a = partialAmps(d, binHz, m, stiffness);
    const top = Math.max(...a.filter((x) => x != null));
    if (!(top > 0)) return;
    a.forEach((v, h) => { if (v != null) per[h].push(v / top); });
  });
  if (per[0].length < minSamples) return null;
  return per.map((v, h) => {
    if (v.length < 3) return DEFAULT_PROFILE[h] * 0.5;
    const s = [...v].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  });
}

/** 候補の音を「弾いてみた」ときの音の形（周波数ごとの強さ） */
function synthesize(m, profile, binHz, length, stiffness) {
  const out = new Float32Array(length);
  for (let h = 1; h <= HARMONICS; h++) {
    const f = partialHz(m, h, stiffness);
    if (f > 5000) break;
    const k = f / binHz;
    const width = 1.5;
    for (let j = Math.floor(k - width * 2); j <= Math.ceil(k + width * 2); j++) {
      if (j < 0 || j >= length) continue;
      out[j] += profile[h - 1] * Math.exp(-((j - k) ** 2) / (2 * width * width));
    }
  }
  return out;
}

/**
 * いくつかの音を一緒に弾いたときの音の形を、実際の音に重ねて合わせ、どれだけずれたかを返す（小さいほど似ている）
 * 音の強さは「実際の音を最もよく説明する」ように、音ごとに自動で決める（負にはしない）
 */
function mismatch(d, notes, profile, binHz, lo, hi, stiffness, cache) {
  const shapes = notes.map((m) => {
    if (!cache.has(m)) cache.set(m, synthesize(m, profile, binHz, d.length, stiffness));
    return cache.get(m);
  });
  const g = shapes.map(() => 0);
  // 音ごとの強さを、少しずつ合わせる（負にならないよう、0 で止める）
  for (let it = 0; it < 30; it++) {
    for (let n = 0; n < shapes.length; n++) {
      let num = 0, den = 0;
      for (let k = lo; k <= hi; k++) {
        let rest = d[k];
        for (let o = 0; o < shapes.length; o++) if (o !== n) rest -= g[o] * shapes[o][k];
        num += rest * shapes[n][k];
        den += shapes[n][k] * shapes[n][k];
      }
      g[n] = den > 0 ? Math.max(0, num / den) : 0;
    }
  }
  let err = 0, total = 0;
  for (let k = lo; k <= hi; k++) {
    let p = 0;
    for (let n = 0; n < shapes.length; n++) p += g[n] * shapes[n][k];
    err += (d[k] - p) ** 2;
    total += d[k] * d[k];
  }
  return total > 0 ? err / total : 1;
}

/**
 * 試し弾きで音を選び直す。notes：今の答え（音の番号の配列）
 * 戻り値：選び直した音の配列（変わらなければ同じもの）
 */
export function checkBySynthesis(d, binHz, notes, profile, { steps = [12, -12, 1, -1], margin = 0.08, stiffness = 0.0001, lowest = 40, highest = 88 } = {}) {
  if (!notes.length || !profile) return notes;
  // 高い音ほど同じ幅でも音の高さの違いが小さいので、強さを平方根にして、弱い倍音も比べられるようにする
  const s = new Float32Array(d.length);
  for (let k = 0; k < d.length; k++) s[k] = Math.sqrt(d[k]);
  const sqrtProfile = profile.map((v) => Math.sqrt(v));
  const lo = Math.floor(70 / binHz), hi = Math.min(d.length - 1, Math.ceil(5000 / binHz));
  const cache = new Map();
  let current = [...notes];
  let err = mismatch(s, current, sqrtProfile, binHz, lo, hi, stiffness, cache);
  for (let n = 0; n < current.length; n++) {
    let best = null, bestErr = err * (1 - margin);
    for (const step of steps) {
      const m = current[n] + step;
      if (m < lowest || m > highest || current.includes(m)) continue;
      const trial = current.map((x, i) => (i === n ? m : x));
      const e = mismatch(s, trial, sqrtProfile, binHz, lo, hi, stiffness, cache);
      if (e < bestErr) { best = m; bestErr = e; }
    }
    if (best != null) { current[n] = best; err = bestErr; }
  }
  return current.sort((a, b) => a - b);
}

/**
 * いくつかの候補（音の組）を試し弾きして、それぞれのずれ（小さいほど似ている）を返す
 * 例：1音だけ弾いた案と、コードの押さえ方の全部の音を弾いた案を比べる
 */
export function compareBySynthesis(d, binHz, options, profile, { stiffness = 0.0001 } = {}) {
  const s = new Float32Array(d.length);
  for (let k = 0; k < d.length; k++) s[k] = Math.sqrt(d[k]);
  const sqrtProfile = profile.map((v) => Math.sqrt(v));
  const lo = Math.floor(70 / binHz), hi = Math.min(d.length - 1, Math.ceil(5000 / binHz));
  const cache = new Map();
  return options.map((notes) => mismatch(s, notes, sqrtProfile, binHz, lo, hi, stiffness, cache));
}
