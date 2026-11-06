// 距離関数（SDF）で骨の形を組み立てるための道具。
// 単位は mm。座標は x=左(+)・右(-)、y=上、z=前（頭の方向）。
// 形は { f:(x,y,z)=>距離, lo:[..], hi:[..] } で表す（lo/hi は外枠）。

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const deg = (d) => d * Math.PI / 180;

// 点の集まりの外枠
function boundsOf(points, pad) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - pad); hi[i] = Math.max(hi[i], p[i] + pad); }
  return { lo, hi };
}

// 外枠までの距離（外枠の中なら 0）
function boxDist(lo, hi, x, y, z) {
  const dx = Math.max(lo[0] - x, 0, x - hi[0]);
  const dy = Math.max(lo[1] - y, 0, y - hi[1]);
  const dz = Math.max(lo[2] - z, 0, z - hi[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---- 基本の形 ----

export function sphere(c, r) {
  const [cx, cy, cz] = c;
  return { f: (x, y, z) => Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r, ...boundsOf([c], r) };
}

// 向きつき楕円体。axes は直交する3本の単位ベクトル、r はそれぞれの半径。
export function ellipsoid(c, r, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const [u, v, w] = axes;
  const rr = Math.max(r[0], r[1], r[2]);
  return {
    f: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const a = (px * u[0] + py * u[1] + pz * u[2]) / r[0];
      const b = (px * v[0] + py * v[1] + pz * v[2]) / r[1];
      const d = (px * w[0] + py * w[1] + pz * w[2]) / r[2];
      const k0 = Math.sqrt(a * a + b * b + d * d);
      const k1 = Math.sqrt((a / r[0]) ** 2 + (b / r[1]) ** 2 + (d / r[2]) ** 2);
      if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
      return k0 * (k0 - 1) / k1;
    },
    ...boundsOf([c], rr),
  };
}

// 太さが変わる円柱（両端が丸い）。flat を渡すと、その向きにつぶれた断面になる。
// flat = { dir:[..], ratio:0.6 }
export function cone(a, b, r1, r2 = r1, flat = null) {
  const fn = flat ? norm(flat.dir) : null;
  const fs = flat ? 1 / flat.ratio : 1;
  // つぶす向きにのばした空間で考える（両端の位置がずれないように軸ものばす）
  let ba = sub(b, a);
  if (fn) ba = add(ba, mul(fn, dot(ba, fn) * (fs - 1)));
  const l2 = dot(ba, ba);
  let rr = r1 - r2;
  if (Math.abs(rr) > Math.sqrt(l2) * 0.98) { rr = Math.sign(rr) * Math.sqrt(l2) * 0.98; r2 = r1 - rr; }
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const fmin = flat ? Math.min(1, flat.ratio) : 1;
  const f = (x, y, z) => {
    let px = x - a[0], py = y - a[1], pz = z - a[2];
    if (fn) {
      const t = (px * fn[0] + py * fn[1] + pz * fn[2]) * (fs - 1);
      px += fn[0] * t; py += fn[1] * t; pz += fn[2] * t;
    }
    const yy = px * ba[0] + py * ba[1] + pz * ba[2];
    const zz = yy - l2;
    const qx = px * l2 - ba[0] * yy, qy = py * l2 - ba[1] * yy, qz = pz * l2 - ba[2] * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    let d;
    if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - r2;
    else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - r1;
    else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    return d * fmin;
  };
  const pad = Math.max(r1, r2);
  return { f, ...boundsOf([a, b], pad) };
}

// 点の列をなめらかにつなぐ管。radii は各点の半径（数でも配列でも）。
export function tube(points, radii, flat = null, k = 0.6) {
  let rs = Array.isArray(radii) ? radii : points.map(() => radii);
  // 太さの数が点の数とちがうときは、なめらかに割りふる
  if (rs.length !== points.length) {
    const src = rs;
    rs = points.map((_, i) => {
      const t = (i / (points.length - 1)) * (src.length - 1);
      const k = Math.min(src.length - 2, Math.floor(t));
      return src[k] + (src[k + 1] - src[k]) * (t - k);
    });
  }
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const fl = flat ? (typeof flat === 'function' ? flat(i) : flat) : null;
    parts.push(cone(points[i], points[i + 1], rs[i], rs[i + 1], fl));
  }
  return k > 0 ? smoothUnion(k, ...parts) : union(...parts);
}

// 角の丸い箱。axes は3本の単位ベクトル、h は半分の大きさ。
export function box(c, h, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], round = 0) {
  const [u, v, w] = axes;
  const hx = h[0] - round, hy = h[1] - round, hz = h[2] - round;
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    corners.push(add(c, add(mul(u, sx * h[0]), add(mul(v, sy * h[1]), mul(w, sz * h[2])))));
  return {
    f: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const qx = Math.abs(px * u[0] + py * u[1] + pz * u[2]) - hx;
      const qy = Math.abs(px * v[0] + py * v[1] + pz * v[2]) - hy;
      const qz = Math.abs(px * w[0] + py * w[1] + pz * w[2]) - hz;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    ...boundsOf(corners, 0),
  };
}

// 2次元の多角形までの符号つき距離
function polyDist(px, py, V) {
  let d = (px - V[0][0]) ** 2 + (py - V[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = V.length - 1; i < V.length; j = i, i++) {
    const ex = V[j][0] - V[i][0], ey = V[j][1] - V[i][1];
    const wx = px - V[i][0], wy = py - V[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= V[i][1], c2 = py < V[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

// 板。origin を原点、e1/e2 を面の向き、2次元の輪郭 pts（mm）を厚さ t でのばす。
// thick を関数にすると、場所によって厚さを変えられる (s,t)=>厚さ。
export function plate(origin, e1, e2, pts, t, round = null, thick = null) {
  const n = norm(cross(e1, e2));
  const r = round ?? t * 0.45;
  const world = pts.map(([s, q]) => add(origin, add(mul(e1, s), mul(e2, q))));
  return {
    f: (x, y, z) => {
      const px = x - origin[0], py = y - origin[1], pz = z - origin[2];
      const s = px * e1[0] + py * e1[1] + pz * e1[2];
      const q = px * e2[0] + py * e2[1] + pz * e2[2];
      const h = px * n[0] + py * n[1] + pz * n[2];
      const tt = thick ? thick(s, q) : t;
      const rr = Math.min(r, tt * 0.49);
      const dx = polyDist(s, q, pts) + rr;
      const dy = Math.abs(h) - tt / 2 + rr;
      const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
      return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy) - rr;
    },
    ...boundsOf(world, (thick ? 6 : t) + 1),
  };
}

// 輪（ドーナツ）。中心 c、軸 axis、大きい半径 R、太さ r
export function torus(c, axis, R, r) {
  const n = norm(axis);
  return {
    f: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const h = px * n[0] + py * n[1] + pz * n[2];
      const qx = px - n[0] * h, qy = py - n[1] * h, qz = pz - n[2] * h;
      const rad = Math.sqrt(qx * qx + qy * qy + qz * qz) - R;
      return Math.sqrt(rad * rad + h * h) - r;
    },
    ...boundsOf([c], R + r),
  };
}

// ---- 組み合わせ ----

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

function mergeBounds(items, pad = 0) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const it of items) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], it.lo[i] - pad); hi[i] = Math.max(hi[i], it.hi[i] + pad); }
  return { lo, hi };
}

export function union(...items) { return smoothUnion(0, ...items); }

export function smoothUnion(k, ...items) {
  items = items.flat().filter(Boolean);
  if (items.length === 1 && k === 0) return items[0];
  const n = items.length;
  return {
    f: (x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < n; i++) {
        const it = items[i];
        if (boxDist(it.lo, it.hi, x, y, z) > d + k) continue;
        const di = it.f(x, y, z);
        d = k > 0 ? smin(d, di, k) : Math.min(d, di);
      }
      return d;
    },
    ...mergeBounds(items, k * 0.25),
  };
}

// a から b たちを削る
export function subtract(a, ...bs) { return smoothSubtract(0, a, ...bs); }

export function smoothSubtract(k, a, ...bs) {
  bs = bs.flat().filter(Boolean);
  return {
    f: (x, y, z) => {
      let d = a.f(x, y, z);
      for (const b of bs) {
        if (boxDist(b.lo, b.hi, x, y, z) > Math.max(0, -d) + k + 0.01) continue;
        const db = b.f(x, y, z);
        d = k > 0 ? smax(d, -db, k) : Math.max(d, -db);
      }
      return d;
    },
    lo: a.lo, hi: a.hi,
  };
}

export function intersect(a, b, k = 0) {
  return {
    f: (x, y, z) => { const da = a.f(x, y, z), db = b.f(x, y, z); return k > 0 ? smax(da, db, k) : Math.max(da, db); },
    lo: a.lo.map((v, i) => Math.max(v, b.lo[i])), hi: a.hi.map((v, i) => Math.min(v, b.hi[i])),
  };
}

// 表面をふくらませる／やせさせる
export function inflate(a, r) {
  return { f: (x, y, z) => a.f(x, y, z) - r, lo: a.lo.map((v) => v - Math.max(r, 0)), hi: a.hi.map((v) => v + Math.max(r, 0)) };
}

// ---- 骨ごとの向き（フレーム） ----
// origin から axis の向きに骨がのびる。fwd は「前（頭側・手の甲側）」のめやす。
// L(a, f, s) は、軸ぞいに a、前に f、外側（左なら +x）に s 進んだ点。
export function frame(origin, axisDir, fwdHint, sideSign = 1) {
  const ax = norm(axisDir);
  let fw = sub(fwdHint, mul(ax, dot(fwdHint, ax)));
  fw = norm(fw);
  let sd = norm(cross(fw, ax)); // 右手系で外側
  if (dot(sd, [sideSign, 0, 0]) < 0) sd = mul(sd, -1);
  const L = (a, f = 0, s = 0) => add(origin, add(mul(ax, a), add(mul(fw, f), mul(sd, s))));
  return { L, ax, fw, sd, o: origin, axes: [ax, fw, sd] };
}

// Catmull-Rom 曲線で点の列をなめらかにする
export function spline(points, perSeg = 6) {
  const out = [];
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
