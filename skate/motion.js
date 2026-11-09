// スケートラップ：画面の動き（カメラの首振り）を測る
// 2つのコマで同じ景色の点（観客席・壁など）を探して結び、「片方のコマの点が、もう片方のどこに写るか」を
// 3×3 の変換（ホモグラフィー）で表す。その場で首を振るだけなら、この変換で正しく重ねられる。
// 座標は 0〜1（動画の幅・高さを1とする）。
export const MW = 320;

// ---------- 3×3 の計算 ----------
export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (!det) return I3();
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
export function apply(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }
const toNorm = (Hp, w, h) => mul3(mul3([1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1], Hp), [w, 0, 0, 0, h, 0, 0, 0, 1]);
const toPix = (Hn, w, h) => mul3(mul3([w, 0, 0, 0, h, 0, 0, 0, 1], Hn), [1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1]);

// ---------- 白黒の小さい画像（3段のピラミッド）----------
const gcv = document.createElement('canvas');
const gcx = gcv.getContext('2d', { willReadFrequently: true });
export function grabGray(src, W, H) {
  const w = MW, h = Math.max(8, Math.round(MW * H / W));
  gcv.width = w; gcv.height = h; gcx.drawImage(src, 0, 0, w, h);
  const d = gcx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  const L0 = blur({ w, h, d: g });
  const L1 = down(L0), L2 = down(L1);
  return [L0, L1, L2].map(withGrad);
}
function blur(im) { // 横と縦に [1,2,1]/4
  const { w, h, d } = im, t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = (d[i - (x > 0)] + 2 * d[i] + d[i + (x < w - 1)]) / 4; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; o[i] = (t[i - (y > 0) * w] + 2 * t[i] + t[i + (y < h - 1) * w]) / 4; }
  return { w, h, d: o };
}
function down(im) {
  const w = im.w >> 1, h = im.h >> 1, d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 2 * y * im.w + 2 * x; d[y * w + x] = (im.d[i] + im.d[i + 1] + im.d[i + im.w] + im.d[i + im.w + 1]) / 4; }
  return blur({ w, h, d });
}
function withGrad(im) {
  const { w, h, d } = im, gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (d[i + 1] - d[i - 1]) / 2; gy[i] = (d[i + w] - d[i - w]) / 2; }
  return { w, h, d, gx, gy };
}
function samp(im, x, y) {
  if (x < 0 || y < 0 || x > im.w - 1.001 || y > im.h - 1.001) return NaN;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * im.w + x0, d = im.d;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + im.w] * (1 - fx) + d[i + im.w + 1] * fx) * fy;
}

// ---------- よい点を選ぶ（角のようにはっきりした所）----------
function pickPoints(P, masks) {
  const im = P[0], { w, h, gx, gy } = im, GX = 24, GY = 14, out = [];
  const cw = w / GX, ch = h / GY, R = 3;
  let maxS = 0; const cand = [];
  for (let cy = 0; cy < GY; cy++) for (let cx = 0; cx < GX; cx++) {
    let best = 0, bx = 0, by = 0;
    for (let y = Math.max(8, Math.floor(cy * ch)); y < Math.min(h - 8, Math.floor((cy + 1) * ch)); y += 2)
      for (let x = Math.max(8, Math.floor(cx * cw)); x < Math.min(w - 8, Math.floor((cx + 1) * cw)); x += 2) {
        if (masks.some(m => x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3])) continue;
        let a = 0, b = 0, c = 0;
        for (let v = -R; v <= R; v++) for (let u = -R; u <= R; u++) { const i = (y + v) * w + x + u, p = gx[i], q = gy[i]; a += p * p; b += p * q; c += q * q; }
        const s = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b); // 小さい方の固有値
        if (s > best) { best = s; bx = x; by = y; }
      }
    if (best > 0) { cand.push([bx, by, best]); if (best > maxS) maxS = best; }
  }
  for (const c of cand) if (c[2] > maxS * 0.02) out.push([c[0], c[1]]);
  return out;
}

// ---------- 点を追う（Lucas–Kanade・粗い段から細かい段へ）----------
function lkPoint(A, B, x, y, gx0, gy0) {
  let dx = gx0 / 4, dy = gy0 / 4;
  const R = 4;
  for (let L = 2; L >= 0; L--) {
    const a = A[L], b = B[L], s = 1 / (1 << L), px = x * s, py = y * s;
    if (L < 2) { dx *= 2; dy *= 2; }
    let g11 = 0, g12 = 0, g22 = 0;
    const tpl = [], ixs = [], iys = [];
    for (let v = -R; v <= R; v++) for (let u = -R; u <= R; u++) {
      const ix = interpG(a.gx, a, px + u, py + v), iy = interpG(a.gy, a, px + u, py + v);
      tpl.push(samp(a, px + u, py + v)); ixs.push(ix); iys.push(iy);
      g11 += ix * ix; g12 += ix * iy; g22 += iy * iy;
    }
    const det = g11 * g22 - g12 * g12;
    if (!(det > 1e-3) || tpl.some(isNaN)) return null;
    for (let it = 0; it < 12; it++) {
      let b1 = 0, b2 = 0, k = 0, bad = false;
      for (let v = -R; v <= R; v++) for (let u = -R; u <= R; u++, k++) {
        const bv = samp(b, px + u + dx, py + v + dy); if (isNaN(bv)) { bad = true; break; }
        const e = tpl[k] - bv; b1 += e * ixs[k]; b2 += e * iys[k];
      }
      if (bad) return null;
      const ddx = (g22 * b1 - g12 * b2) / det, ddy = (g11 * b2 - g12 * b1) / det;
      dx += ddx; dy += ddy;
      if (ddx * ddx + ddy * ddy < 0.0009) break;
    }
  }
  return [x + dx, y + dy];
}
function interpG(arr, im, x, y) {
  if (x < 0 || y < 0 || x > im.w - 1.001 || y > im.h - 1.001) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * im.w + x0;
  return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + im.w] * (1 - fx) + arr[i + im.w + 1] * fx) * fy;
}

// ---------- 4点からホモグラフィー・RANSAC ----------
function solve(M, v) { // ガウスの消去法
  const n = v.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; v[r] -= f * v[c]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
function fitH(pa, pb, idx) { // 最小二乗（h33=1）。座標は中心をずらして数値を安定させる
  const cx = 160, cy = 90;
  const N = Array.from({ length: 8 }, () => new Array(8).fill(0)), r = new Array(8).fill(0);
  for (const i of idx) {
    const x = pa[i][0] - cx, y = pa[i][1] - cy, X = pb[i][0] - cx, Y = pb[i][1] - cy;
    const rows = [[x, y, 1, 0, 0, 0, -x * X, -y * X, X], [0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]];
    for (const row of rows) for (let j = 0; j < 8; j++) { r[j] += row[j] * row[8]; for (let k = 0; k < 8; k++) N[j][k] += row[j] * row[k]; }
  }
  const h = solve(N, r); if (!h) return null;
  const Hc = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  return mul3(mul3([1, 0, cx, 0, 1, cy, 0, 0, 1], Hc), [1, 0, -cx, 0, 1, -cy, 0, 0, 1]);
}
function ransac(pa, pb, th = 1.5) {
  const n = pa.length; if (n < 8) return null;
  let best = null, bestIn = [];
  const err = (H, i) => { const q = apply(H, pa[i][0], pa[i][1]); return Math.hypot(q[0] - pb[i][0], q[1] - pb[i][1]); };
  for (let it = 0; it < 250; it++) {
    const s = new Set(); while (s.size < 4) s.add((Math.random() * n) | 0);
    const H = fitH(pa, pb, [...s]); if (!H) continue;
    const inl = []; for (let i = 0; i < n; i++) if (err(H, i) < th) inl.push(i);
    if (inl.length > bestIn.length) { bestIn = inl; best = H; }
  }
  if (!best || bestIn.length < 8) return null;
  for (let k = 0; k < 2; k++) { const H = fitH(pa, pb, bestIn); if (!H) break; best = H; bestIn = []; for (let i = 0; i < n; i++) if (err(best, i) < th) bestIn.push(i); }
  return { H: best, inl: bestIn.length, ratio: bestIn.length / n };
}

// 大きく動いた時のために、いちばん粗い段で横・縦のずれを総当たりで探す
function coarseShift(A, B, R = 22) {
  const a = A[2], b = B[2];
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -10; dy <= 10; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0, n = 0;
    for (let y = 4; y < a.h - 4; y += 2) { const yy = y + dy; if (yy < 0 || yy >= b.h) continue;
      for (let x = 4; x < a.w - 4; x += 2) { const xx = x + dx; if (xx < 0 || xx >= b.w) continue; s += Math.abs(a.d[y * a.w + x] - b.d[yy * b.w + xx]); n++; } }
    if (n > 150 && s / n < best) { best = s / n; bx = dx; by = dy; }
  }
  return [1, 0, bx * 4, 0, 1, by * 4, 0, 0, 1];
}

// A（いまのコマ）の点が B のどこに写るかを返す（0〜1 の座標の変換）。Hinit は予想（0〜1 の座標）。
// boxes：人の枠（人は景色と別に動くので点を選ばない）。うまくいかなければ null。
export function estimate(A, B, HinitN, boxes = [], wide = false) {
  const w = A[0].w, h = A[0].h;
  const masks = boxes.map(b => { const bw = (b.x2 - b.x1) * w, bh = (b.y2 - b.y1) * h; return [b.x1 * w - bw * 0.15, b.y1 * h - bh * 0.1, b.x2 * w + bw * 0.15, b.y2 * h + bh * 0.1]; });
  const pts = pickPoints(A, masks);
  const run = Hp => {
    const pa = [], pb = [];
    for (const [x, y] of pts) {
      const g = apply(Hp, x, y), q = lkPoint(A, B, x, y, g[0] - x, g[1] - y);
      if (q) { pa.push([x, y]); pb.push(q); }
    }
    const rr = ransac(pa, pb);
    if (self.MOTION_DEBUG) console.log('estimate', pts.length, pa.length, rr ? rr.inl : 0, JSON.stringify(Hp.map(v => +v.toFixed(2))));
    return rr;
  };
  let r = run(toPix(HinitN || I3(), w, h));
  if (!r || r.inl < 25 || r.ratio < 0.35) {
    const r2 = run(coarseShift(A, B, wide ? Math.round(A[2].w * 0.7) : 22));
    if (r2 && (!r || r2.inl > r.inl)) r = r2;
  }
  // 見つかった重ね方を予想にして、もう一度点を追う（大きくずれていた時に、追える点が増える）
  for (let k = 0; k < 2 && r && r.inl >= 8 && (r.inl < 60 || r.ratio < 0.6); k++) {
    const r3 = run(r.H); if (r3 && r3.inl > r.inl) r = r3; else break;
  }
  if (!r || r.inl < 15) return null;
  return { H: toNorm(r.H, w, h), inl: r.inl, ratio: r.ratio };
}

// ---------- 動画の最初のコマを基準にして、各コマ→基準 の変換をつないでいく ----------
// 基準になるコマ（キー）にできるだけ直接重ねて、つなぎ目のずれ（ドリフト）をためないようにする。
export class MotionChain {
  constructor() { this.key = null; this.keyT = null; this.prev = null; this.prevT = I3(); this.lost = 0; }
  // P：いまのコマのピラミッド、boxes：人の枠。返り値：いまのコマ→基準 の変換
  step(P, boxes) {
    if (!this.key) { this.key = P; this.keyT = I3(); this.prev = P; this.prevT = I3(); return I3(); }
    // まずキーに重ねる（予想：前のコマの変換）
    let T = null;
    const r = estimate(P, this.key, mul3(inv3(this.keyT), this.prevT), boxes);
    if (r && r.inl >= 30) T = mul3(this.keyT, r.H);
    if (!T || r.inl < 60) { // キーとの重なりが少なくなってきた：前のコマに重ねて、いまのコマを新しいキーにする
      if (!T) { const r2 = estimate(P, this.prev, I3(), boxes); T = r2 ? mul3(this.prevT, r2.H) : this.prevT; if (!r2) this.lost++; }
      this.key = P; this.keyT = T;
    }
    this.prev = P; this.prevT = T;
    return T;
  }
}
export const isStill = T => Math.abs(T[2]) < 0.004 && Math.abs(T[5]) < 0.004 && Math.abs(T[0] - 1) < 0.004 && Math.abs(T[4] - 1) < 0.004;

// ---------- 線を合わせたコマ（K）に、いまのコマを直接重ねる ----------
// 首振りで一周しても、ずれがたまらない。重ならない（線が写っていない向き）時は null。
export class LineAnchor {
  constructor(K, line) { this.K = K; this.line = line; this.lastH = null; this.lastT = null; }
  // P：いまのコマ、T：いまのコマ→基準（MotionChain の値。予想に使う）、boxes：人の枠
  // 返り値：いまのコマでの線 [[x,y],[x,y]]（0〜1）と、いまのコマ→K の変換
  locate(P, T, boxes) {
    let init = null;
    if (this.lastH && this.lastT) init = mul3(this.lastH, mul3(inv3(this.lastT), T)); // 前に重なった所から、動いた分だけ動かす
    const ok = r => r && r.inl >= 20 && r.ratio >= 0.3;
    let r = estimate(P, this.K, init || I3(), boxes, !init);
    if (!ok(r) && init) r = estimate(P, this.K, I3(), boxes, true); // 予想が外れた時は、横に大きくずらして探し直す
    if (!ok(r)) r = null;
    if (!r) { this.lastH = null; return null; }
    this.lastH = r.H; this.lastT = T;
    const Hi = inv3(r.H);
    return { line: this.line.map(p => apply(Hi, p[0], p[1])), H: r.H, inl: r.inl };
  }
}
