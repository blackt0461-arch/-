// 頭骨の本体を、解剖書の図（横・上）から読み取ったデータで作る。
// データ：data/skull_profiles.json（Reighard & Jennings 1901, Fig.39-41 をなぞった値。mm、後頭顆の中心が原点）
//   top   … 横から見た上の線（鼻すじ〜おでこ〜頭のてっぺん〜後頭部）
//   base  … 横から見た下の線（口の天井〜頭の底。歯と鼓室胞は別）
//   width … 上から見た、全体の半分の幅と、本体（脳の部分・鼻づら）の半分の幅
//   arch_dorsal / arch_lateral … 頬骨のアーチの、上から見た内側と外側・横から見た上と下
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ellipsoid, cone, tube, sphere, smoothUnion, smoothSubtract } from './sdf.js';

const here = dirname(fileURLToPath(import.meta.url));
export const SKULL_DATA = JSON.parse(readFileSync(resolve(here, 'data/skull_profiles.json'), 'utf8'));

// 図の向き → 頭骨の向き（後頭顆→切歯の先 を前後の軸にする）
const P0 = SKULL_DATA.landmarks.prosthion;
const TH = Math.atan2(P0[1], P0[0]);
export const rot = ([a, b]) => [a * Math.cos(TH) + b * Math.sin(TH), -a * Math.sin(TH) + b * Math.cos(TH)];
export const L = Object.fromEntries(Object.entries(SKULL_DATA.landmarks).map(([k, v]) => [k, v.length === 2 && typeof v[0] === 'number' && !k.endsWith('_r') ? rot(v) : v]));

// 並んだ点 [[a,値...],...] から a の位置の値を引く
function sampler(rows, col = 1) {
  const r = [...rows].sort((p, q) => p[0] - q[0]);
  return (a) => {
    if (a <= r[0][0]) return r[0][col];
    if (a >= r[r.length - 1][0]) return r[r.length - 1][col];
    let i = 1; while (r[i][0] < a) i++;
    const t = (a - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
    return r[i - 1][col] + (r[i][col] - r[i - 1][col]) * t;
  };
}

export function buildCranium(Q, AX) {
  const D = SKULL_DATA;
  const cosT = Math.cos(TH);
  const top = sampler(D.top.map(rot));
  const base = sampler(D.base.map(rot));
  const wOut = sampler(D.width.map((r) => [r[0] * cosT, r[1]]));
  const wCore = sampler(D.width.map((r) => [r[0] * cosT, r[2]]));
  const aMin = Math.min(...D.top.map((p) => rot(p)[0])), aMax = Math.max(...D.top.map((p) => rot(p)[0]));
  const [u, v, w] = AX, O = Q(0, 0, 0);

  // 本体：前後の各位置で、上の線・下の線・幅に合う丸い断面（上は丸く、下は平たい）。鼻づらは上ほど細い
  const core = {
    f: (x, y, z) => {
      const px = x - O[0], py = y - O[1], pz = z - O[2];
      const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], c = px * w[0] + py * w[1] + pz * w[2];
      const t0 = top(a), b0 = base(a);
      const hh = Math.max(0.5, (t0 - b0) / 2), bm = (t0 + b0) / 2;
      const yy = (b - bm) / hh;                                  // -1（下）〜 1（上）
      const face = Math.max(0, Math.min(1, (a - 48) / 10));       // 鼻づららしさ
      const taper = 1 - (0.12 + 0.3 * face) * Math.max(0, yy);   // 上ほど細い
      const wc = Math.max(0.5, wCore(a) * taper);
      const p = yy > 0 ? 2.3 : 3.2;
      const k = Math.pow(Math.pow(Math.abs(c) / wc, p) + Math.pow(Math.abs(yy), p), 1 / p);
      const dSec = (k - 1) * Math.min(wc, hh);
      const dEnd = Math.max(aMin - a, a - aMax);
      return Math.max(dSec, dEnd);
    },
    lo: [O[0] - 40, O[1] - 30, O[2] - 40], hi: [O[0] + 40, O[1] + 60, O[2] + 100],
  };

  // 頬骨のアーチ：上から見た中心と厚み、横から見た上下の帯
  const archLat = D.arch_lateral.map(([a, t, b]) => { const p = rot([a, (t + b) / 2]); return [p[0], p[1], (t - b) / 2]; });
  const archMid = sampler(archLat, 1), archHalfH = sampler(archLat, 2);
  const ad = D.arch_dorsal.map((r) => [r[0] * cosT, (r[1] + r[2]) / 2, (r[2] - r[1]) / 2]).sort((p, q) => p[0] - q[0]);
  const step = Math.max(1, Math.floor(ad.length / 14));
  const archPts = [], archR = [], archFlat = [];
  for (let i = 0; i < ad.length; i += step) {
    const [a, cMid, halfW] = ad[i];
    archPts.push(Q(a, archMid(a), cMid));
    const hv = Math.max(1.2, archHalfH(a)), hw = Math.max(0.9, halfW);
    archR.push(hv); archFlat.push(hw / hv);
  }
  const arches = [1, -1].map((s) => tube(archPts.map((p) => [O[0] + (p[0] - O[0]) * s, p[1], p[2]]), archR, { dir: w, ratio: archFlat.reduce((x, y) => x + y) / archFlat.length }, 1.2));

  // 眼窩：横から見た大きなくぼみ。本体の横の面を内側へけずる
  const oc = L.orbit_center, orr = D.landmarks.orbit_r;
  const orbits = [1, -1].map((s) => ellipsoid(Q(oc[0], oc[1], s * (wCore(oc[0]) + 4)), [orr[0] * 0.95, orr[1] * 1.05, 11], AX));

  // 眼窩後突起（前頭骨の・頬骨の）
  const pf = L.postorb_frontal_tip, pm = L.postorb_malar_tip;
  // 前頭骨の突起は本体のふちから外下へ短く、頬骨の突起はアーチから上へ短くのびる（先どうしは少し離れている）
  const procs = [1, -1].flatMap((s) => {
    const cf = wCore(pf[0] - 4), co = wOut(pm[0]);
    return [
      cone(Q(pf[0] - 4, pf[1] + 3, s * (cf - 1.5)), Q(pf[0], pf[1], s * (cf + 4.5)), 2.6, 1.0),
      cone(Q(pm[0] + 0.5, archMid(pm[0]) + 1.5, s * (co - 2.5)), Q(pm[0], pm[1], s * (co - 4)), 2.4, 1.0),
    ];
  });
  // 鼓室胞・後頭顆・乳様突起・頸静脈突起
  const bc = L.bulla_center, br = D.landmarks.bulla_r;
  const bits = [1, -1].flatMap((s) => [
    ellipsoid(Q(bc[0], bc[1], s * 11.5), [br[0], br[1] * 1.15, 7.5], AX),
    ellipsoid(Q(0.5, 1.5, s * 7.0), [3.0, 4.2, 2.6], AX),                 // 後頭顆
    ellipsoid(Q(L.mastoid[0], L.mastoid[1] + 2, s * 17), [2.4, 2.8, 2.0], AX),
    ellipsoid(Q(L.jugular_proc[0], L.jugular_proc[1] + 1, s * 12.5), [2.3, 3.0, 2.2], AX),
  ]);
  let skull = smoothUnion(1.6, core, ...arches, ...procs, ...bits);
  // 中をけずる：眼窩、頭蓋腔、大後頭孔、鼻の穴、鼻腔、外耳道、下顎窩
  const ga = L.glenoid, me = L.meatus;
  const cav = {
    f: (x, y, z) => {
      const d = core.f(x, y, z) + 1.6;
      const px = x - O[0], py = y - O[1], pz = z - O[2];
      const a = px * u[0] + py * u[1] + pz * u[2];
      return Math.max(d, 3 - a, a - 44);
    },
    lo: core.lo, hi: core.hi,
  };
  const na = L.nasal_tip, nl = L.nasal_aperture_low;
  skull = smoothSubtract(1.0, skull,
    ...orbits, cav,
    ellipsoid(Q(-3, 6, 0), [5, 5.6, 5.4], AX),
    ellipsoid(Q((na[0] + nl[0]) / 2 + 2.5, (na[1] + nl[1]) / 2, 0), [4.5, Math.abs(na[1] - nl[1]) / 2 + 0.5, 5.2], AX),
    ...[1, -1].flatMap((s) => [
      cone(Q(ga[0], ga[1] - 1.5, s * 12), Q(ga[0], ga[1] - 1.5, s * 23), 2.7, 2.7),
      cone(Q(me[0], me[1], s * 13), Q(me[0], me[1], s * 21), 2.2, 2.2),
    ]),
  );
  return { skull, wCore, wOut, top, base, archMid };
}
