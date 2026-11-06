// 筋肉を形にする道具
// 筋肉＝何本かの「すじ（strand）」の束。すじは骨の上の点をつないだ線で、
// 太さは起始（はじまり）から停止（付く所）へ向けて、腱 → 筋腹（ふくらみ）→ 腱 と変わる。
import { add, sub, mul, len, dot, lerp, cone, smoothUnion, smoothSubtract, spline } from './sdf.js';

// 太さの決め方
// r=筋腹の太さ(mm), tO/tI=起始側・停止側で腱になっている長さの割合, sheet=板のように太さがあまり変わらない
export function profile(r, tO = 0.06, tI = 0.12, sheet = false) {
  const rt = Math.max(0.45, r * 0.22);
  return (t) => {
    if (t < tO) return [rt + (r * 0.35 - rt) * (t / Math.max(tO, 1e-6)) * 0.4, 1];
    if (t > 1 - tI) return [rt + (r * 0.35 - rt) * ((1 - t) / Math.max(tI, 1e-6)) * 0.4, 1];
    const u = (t - tO) / Math.max(1e-6, 1 - tO - tI);
    const bulge = sheet ? 0.75 + 0.25 * Math.sin(Math.PI * u) : Math.pow(Math.sin(Math.PI * u), 0.55);
    const edge = Math.min(u, 1 - u);
    return [rt + (r - rt) * bulge, edge < 0.08 ? 0.5 - edge * 6 : 0];
  };
}

// すじを細かい点の列にする：{ pts, r, tendon }
function sample(strand) {
  const pts = spline(strand.pts, 5);
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = acc[acc.length - 1] || 1;
  const prof = strand.prof;
  const out = pts.map((p, i) => {
    const t = acc[i] / total;
    const [r, tendon] = typeof prof === 'function' ? prof(t) : interp(prof, t);
    return { p, r, tendon: Math.max(0, tendon), t };
  });
  return out;
}
function interp(arr, t) {
  const x = t * (arr.length - 1), k = Math.min(arr.length - 2, Math.floor(x)), f = x - k;
  const a = arr[k], b = arr[k + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// 同じ数の点にそろえる（長さの割合で）
function resample(L, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    let i = 1; while (i < L.length - 1 && L[i].t < t) i++;
    const a = L[i - 1], b = L[i], f = (t - a.t) / ((b.t - a.t) || 1);
    out.push({ p: lerp(a.p, b.p, f), r: a.r + (b.r - a.r) * f, tendon: a.tendon + (b.tendon - a.tendon) * f, t });
  }
  return out;
}

// 厚みのある三角形（3つの角で厚さがちがう）までの距離
function thickTri(A, B, C) {
  const lo = [0, 1, 2].map((k) => Math.min(A.p[k] - A.r, B.p[k] - B.r, C.p[k] - C.r));
  const hi = [0, 1, 2].map((k) => Math.max(A.p[k] + A.r, B.p[k] + B.r, C.p[k] + C.r));
  const a = A.p, ab = sub(B.p, a), ac = sub(C.p, a);
  return {
    lo, hi,
    f: (x, y, z) => {
      // 三角形の上でいちばん近い点（Ericson の方法）
      const ap = [x - a[0], y - a[1], z - a[2]];
      const d1 = dot(ab, ap), d2 = dot(ac, ap);
      let u, v;
      if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; }
      else {
        const bp = sub(ap, ab), d3 = dot(ab, bp), d4 = dot(ac, bp);
        if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; }
        else {
          const vc = d1 * d4 - d3 * d2;
          if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; }
          else {
            const cp = sub(ap, ac), d5 = dot(ab, cp), d6 = dot(ac, cp);
            if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; }
            else {
              const vb = d5 * d2 - d1 * d6;
              if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); }
              else {
                const va = d3 * d6 - d5 * d4;
                if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; v = w; }
                else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
              }
            }
          }
        }
      }
      const qx = a[0] + ab[0] * u + ac[0] * v, qy = a[1] + ab[1] * u + ac[1] * v, qz = a[2] + ab[2] * u + ac[2] * v;
      const r = A.r * (1 - u - v) + B.r * u + C.r * v;
      return Math.sqrt((x - qx) ** 2 + (y - qy) ** 2 + (z - qz) ** 2) - r;
    },
  };
}

// 筋肉の距離関数と、重みづけに使う中心線を作る
// def.sheet=true のときは、となりあうすじのあいだを膜でうめる（広背筋・腹斜筋など）
export function muscleShape(def, boneShapes) {
  let lines = def.strands.map(sample);
  const sc = def.scale ?? (def.sheet || def.groups ? 1 : 1.3);
  if (sc !== 1) for (const L of lines) for (const q of L) q.r *= sc;
  let shape;
  const groups = def.groups || (def.sheet && lines.length > 1 ? [lines.map((_, i) => i)] : null);
  if (groups) {
    const N = def.sheetN ?? 14;
    const tris = [], fill = [];
    for (const g of groups) {
      const R = g.map((i) => resample(lines[i], N));
      for (let s = 0; s < R.length - 1; s++) for (let k = 0; k < N - 1; k++) {
        const a = R[s][k], b = R[s][k + 1], c = R[s + 1][k], d = R[s + 1][k + 1];
        tris.push(thickTri(a, b, d), thickTri(a, d, c));
      }
      // 重みづけ用に、あいだの線もつくる
      for (let s = 0; s < R.length - 1; s++) for (let m = 0; m < 3; m++) fill.push(R[s].map((q, k) => ({ ...q, p: lerp(q.p, R[s + 1][k].p, m / 3) })));
      fill.push(R[R.length - 1]);
    }
    shape = smoothUnion(0.4, ...tris);
    lines = fill;
  } else {
    const tubes = lines.map((L) => smoothUnion(def.kTube ?? 0.6, ...L.slice(0, -1).map((a, i) => cone(a.p, L[i + 1].p, Math.max(0.35, a.r), Math.max(0.35, L[i + 1].r)))));
    shape = smoothUnion(def.k ?? 1.6, ...tubes);
  }
  // 骨（と軟骨）にめりこまないように削る
  const near = boneShapes.filter((b) => b.shape.lo.every((v, i) => v < shape.hi[i] + 1) && b.shape.hi.every((v, i) => v > shape.lo[i] - 1));
  if (near.length && !def.noCarve) {
    const pads = near.map((b) => ({ f: (x, y, z) => b.shape.f(x, y, z) - 0.3, lo: b.shape.lo.map((v) => v - 0.3), hi: b.shape.hi.map((v) => v + 0.3) }));
    shape = smoothSubtract(0.5, shape, ...pads);
  }
  return { shape, lines };
}

// 頂点ごとに、いちばん近い中心線の場所を探して、骨の重みと腱らしさを決める
export function skinWeights(positions, lines, boneOf) {
  const n = positions.length / 3;
  const joints = new Array(n), weights = new Array(n), tendon = new Float32Array(n);
  const segs = [];
  for (const L of lines) for (let i = 0; i < L.length - 1; i++) segs.push([L[i], L[i + 1]]);
  for (let v = 0; v < n; v++) {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    let best = Infinity, bs = null, bt = 0;
    for (const s of segs) {
      const ab = sub(s[1].p, s[0].p);
      const t = Math.max(0, Math.min(1, dot(sub(p, s[0].p), ab) / (dot(ab, ab) || 1)));
      const q = add(s[0].p, mul(ab, t));
      const d = len(sub(p, q)) - (s[0].r + (s[1].r - s[0].r) * t);
      if (d < best) { best = d; bs = s; bt = t; }
    }
    const b0 = boneOf(bs[0]), b1 = boneOf(bs[1]);
    const w = new Map();
    w.set(b0, (w.get(b0) || 0) + (1 - bt));
    w.set(b1, (w.get(b1) || 0) + bt);
    joints[v] = [...w.keys()]; weights[v] = [...w.values()];
    tendon[v] = bs[0].tendon + (bs[1].tendon - bs[0].tendon) * bt;
  }
  return { joints, weights, tendon };
}
