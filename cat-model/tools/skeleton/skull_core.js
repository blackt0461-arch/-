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
  const core = sectionShape(Q, AX, top, base, wCore, aMin, aMax);
  // 頬骨のアーチ：上から見た中心と厚み、横から見た上下の帯
  const archLat = D.arch_lateral.map(([a, t, b]) => { const p = rot([a, (t + b) / 2]); return [p[0], p[1], (t - b) / 2]; });
  const archMid = sampler(archLat, 1), archHalfH = sampler(archLat, 2);
  const ad = D.arch_dorsal.map((r) => [r[0] * cosT, (r[1] + r[2]) / 2, (r[2] - r[1]) / 2]).sort((p, q) => p[0] - q[0]);
  const step = Math.max(1, Math.floor(ad.length / 14));
  const cr0 = sampler(ad.map((r) => [r[0], r[1]]));
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
  // 頬骨のアーチの前の付け根（上顎骨・涙骨）：アーチの前端を鼻づらの横へつなぐ
  const aF = Math.max(...ad.map((r) => r[0]));
  const roots = [1, -1].map((s) => smoothUnion(1.5,
    cone(Q(aF - 2, archMid(aF - 2), s * cr0(aF - 2)), Q(aF + 4, archMid(aF) - 1, s * (wCore(aF + 4) - 1.5)), 3.4, 3.0, { dir: w, ratio: 0.6 }),
    cone(Q(aF - 1, archMid(aF) + 2.5, s * (cr0(aF) - 1)), Q(aF + 3, archMid(aF) + 6, s * (wCore(aF + 3) - 2)), 2.2, 2.0),
  ));
  let skull = smoothUnion(1.6, core, ...arches, ...roots, ...procs, ...bits);
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
  const archC = sampler(ad.map((r) => [r[0], r[1]]));
  const archHalfW = sampler(ad.map((r) => [r[0], r[2]]));
  const grown = (grow) => sectionShape(Q, AX, top, base, wCore, aMin, aMax, grow);
  return { skull, core, grown, wCore, wOut, top, base, archMid, archHalfH, archC, archHalfW, aMin, aMax };
}

// ---- 下あごと歯（解剖書の図 36 と 40 から） ----
function polyDist(px, py, V) {
  let d = (px - V[0][0]) ** 2 + (py - V[0][1]) ** 2, s = 1;
  for (let i = 0, j = V.length - 1; i < V.length; j = i, i++) {
    const ex = V[j][0] - V[i][0], ey = V[j][1] - V[i][1], wx = px - V[i][0], wy = py - V[i][1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
    const c1 = py >= V[i][1], c2 = py < V[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

export function buildJaw(Q, AX) {
  const M = SKULL_DATA.mandible, T = Object.fromEntries(Object.entries(M.teeth).map(([k, v]) => [k, rot(v)]));
  const poly = M.poly.map(rot);
  const [u, v, w] = AX, O = Q(0, 0, 0);
  const cond = T.condyle;
  // 下あごの左半分がのる面：枝（後ろ）は外側、体（前）は前へ行くほど内側へ寄る
  const C_RAMUS = 16.8, C_SYM = 2.6, A_BEND = 40, A_SYM = T.LI_base[0];
  const c0 = (a) => (a <= A_BEND ? C_RAMUS : C_RAMUS + (C_SYM - C_RAMUS) * Math.pow((a - A_BEND) / (A_SYM - A_BEND), 0.9));
  // 厚み（半分）：体は太く、筋突起はうすい板
  const half = (a, b) => (a > 34 ? 2.3 - Math.max(0, b - 0) * 0.15 : b > 1 ? 0.8 : 1.4);
  const plateShape = {
    f: (x, y, z) => {
      const px = x - O[0], py = y - O[1], pz = z - O[2];
      const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], c = px * w[0] + py * w[1] + pz * w[2];
      const t = Math.max(0.6, half(a, b));
      const r = Math.min(t * 0.9, 1.0);
      const dx = polyDist(a, b, poly) + r, dy = Math.abs(c - c0(a)) - t + r;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
    },
    lo: [O[0] - 30, O[1] - 30, O[2] - 10], hi: [O[0] + 30, O[1] + 30, O[2] + 100],
  };
  const condC = c0(cond[0]);
  const mand = smoothUnion(1.0,
    plateShape,
    cone(Q(cond[0], cond[1], condC - 4.2), Q(cond[0], cond[1], condC + 4.4), 2.3, 2.3),                     // 下顎頭（横長の円柱）
    ellipsoid(Q(A_SYM - 1.5, T.LI_base[1] - 4, C_SYM - 0.8), [3, 4.2, 1.4], AX),                             // 下顎結合
  );
  const mandible = smoothSubtract(0.6, mand,
    ellipsoid(Q(31, -2, C_RAMUS + 2.6), [7, 6, 1.4], AX),                                                    // 咬筋窩
    cone(Q(70, T.LC_base[1] - 5, c0(70) + 3), Q(70, T.LC_base[1] - 5, c0(70) - 3), 0.6, 0.6),               // オトガイ孔
  );

  // 歯の形
  const tooth = (base, tip, r, root, ratio = 0.75) => {
    const dir = norm3(sub3(tip, base)), rootEnd = sub3(base, mul3(dir, root));
    return smoothUnion(0.5, cone(rootEnd, base, r * 0.55, r, { dir: w, ratio }), cone(base, tip, r, 0.18, { dir: w, ratio }));
  };
  const blade = (a0, a1, bBase, tips, c, up, width = 1.7) => {
    const parts = [ellipsoid(Q((a0 + a1) / 2, bBase + up * 0.6, c), [(a1 - a0) / 2, 1.4, width], AX)];
    for (const [ta, tb, r] of tips) parts.push(cone(Q(ta, bBase + up * 0.6, c), Q(ta, tb, c), r, 0.25, { dir: w, ratio: 0.55 }));
    for (const ra of [a0 + (a1 - a0) * 0.25, a0 + (a1 - a0) * 0.75]) parts.push(cone(Q(ra, bBase, c), Q(ra, bBase - up * 5, c), 1.2, 0.5));
    return smoothUnion(0.7, ...parts);
  };
  const Ld = L;
  const it = Ld.incisor_tip, cr = Ld.canine_root, ct = Ld.canine_tip;
  const baseU = (a) => sampler(SKULL_DATA.base.map(rot))(a);   // 上の歯ぐきの線
  const upper = [
    { id: 'UI1', ja: '上顎第1切歯', shape: tooth(Q(it[0] - 0.5, baseU(it[0] - 0.5), 1.2), Q(it[0], it[1], 1.2), 0.75, 4) },
    { id: 'UI2', ja: '上顎第2切歯', shape: tooth(Q(it[0] - 1.0, baseU(it[0] - 1), 3.0), Q(it[0] - 0.6, it[1] - 0.2, 3.1), 0.85, 4) },
    { id: 'UI3', ja: '上顎第3切歯', shape: tooth(Q(it[0] - 2.2, baseU(it[0] - 2.2), 5.2), Q(it[0] - 2.0, it[1] - 1.2, 5.4), 1.15, 5) },
    { id: 'UC', ja: '上顎犬歯', shape: smoothUnion(0.6, tooth(Q(cr[0], cr[1], 8.6), Q((cr[0] + ct[0]) / 2, (cr[1] + ct[1]) / 2, 8.9), 2.3, 9), cone(Q((cr[0] + ct[0]) / 2, (cr[1] + ct[1]) / 2, 8.9), Q(ct[0], ct[1], 9.1), 1.8, 0.2, { dir: w, ratio: 0.75 })) },
    { id: 'UP2', ja: '上顎第2前臼歯', shape: tooth(Q(Ld.p2[0], baseU(Ld.p2[0]), 11), Q(Ld.p2[0], Ld.p2[1] - 1.2, 11), 0.9, 3) },
    { id: 'UP3', ja: '上顎第3前臼歯', shape: blade(Ld.p3_tip[0] - 3.4, Ld.p3_tip[0] + 3.2, baseU(Ld.p3_tip[0]), [[Ld.p3_tip[0] - 2.4, baseU(Ld.p3_tip[0]) - 2.2, 1.0], [Ld.p3_tip[0], Ld.p3_tip[1], 1.7], [Ld.p3_tip[0] + 2.4, baseU(Ld.p3_tip[0]) - 2.2, 1.0]], 13.0, -1) },
    { id: 'UP4', ja: '上顎第4前臼歯（裂肉歯）', shape: smoothUnion(0.6, blade(Ld.p4_back[0], Ld.p4_front[0], baseU(Ld.p4_tip[0]), [[Ld.p4_front[0] - 1, baseU(Ld.p4_front[0]) - 3, 1.2], [Ld.p4_tip[0], Ld.p4_tip[1], 2.0], [Ld.p4_back[0] + 2, Ld.p4_tip[1] + 1.4, 1.7]], 15.5, -1, 2.2), cone(Q(Ld.p4_front[0] - 2, baseU(Ld.p4_front[0]), 12.5), Q(Ld.p4_front[0] - 2, baseU(Ld.p4_front[0]) - 2.4, 12.6), 1.5, 0.4)) },
    { id: 'UM1', ja: '上顎第1後臼歯', shape: smoothUnion(0.5, ellipsoid(Q(Ld.m1[0], baseU(Ld.m1[0]) - 0.6, 12.8), [1.1, 1.2, 2.6], AX), cone(Q(Ld.m1[0], baseU(Ld.m1[0]) - 0.6, 12.8), Q(Ld.m1[0], baseU(Ld.m1[0]) + 3, 12.8), 0.9, 0.5)) },
  ];
  const lc = (a) => c0(a) - 0.3;
  const lower = [
    { id: 'LI1', ja: '下顎第1切歯', shape: tooth(Q(T.LI_base[0], T.LI_base[1], 1.1), Q(T.LI1_tip[0], T.LI1_tip[1], 1.1), 0.65, 4) },
    { id: 'LI2', ja: '下顎第2切歯', shape: tooth(Q(T.LI_base[0] - 0.4, T.LI_base[1], 2.6), Q(T.LI2_tip[0], T.LI2_tip[1], 2.7), 0.7, 4) },
    { id: 'LI3', ja: '下顎第3切歯', shape: tooth(Q(T.LI_base[0] - 1.0, T.LI_base[1], 4.1), Q(T.LI3_tip[0], T.LI3_tip[1], 4.2), 0.8, 4) },
    { id: 'LC', ja: '下顎犬歯', shape: smoothUnion(0.6, tooth(Q(T.LC_base[0], T.LC_base[1], 6.6), Q((T.LC_base[0] + T.LC_tip[0]) / 2, (T.LC_base[1] + T.LC_tip[1]) / 2, 6.8), 2.1, 9), cone(Q((T.LC_base[0] + T.LC_tip[0]) / 2, (T.LC_base[1] + T.LC_tip[1]) / 2, 6.8), Q(T.LC_tip[0], T.LC_tip[1], 7.0), 1.6, 0.2, { dir: w, ratio: 0.75 })) },
    { id: 'LP3', ja: '下顎第3前臼歯', shape: blade(T.LP3_base[0] - 3.2, T.LP3_base[0] + 3.2, T.LP3_base[1], [[T.LP3_tip[0] - 2.3, T.LP3_base[1] + 1.8, 1.0], [T.LP3_tip[0], T.LP3_tip[1], 1.6], [T.LP3_tip[0] + 2.4, T.LP3_base[1] + 1.6, 0.9]], lc(T.LP3_base[0]), 1) },
    { id: 'LP4', ja: '下顎第4前臼歯', shape: blade(T.LP4_base[0] - 3.8, T.LP4_base[0] + 3.8, T.LP4_base[1], [[T.LP4_tip[0] - 2.7, T.LP4_base[1] + 2.0, 1.1], [T.LP4_tip[0], T.LP4_tip[1], 1.8], [T.LP4_tip[0] + 2.8, T.LP4_base[1] + 1.8, 1.0]], lc(T.LP4_base[0]), 1) },
    { id: 'LM1', ja: '下顎第1後臼歯（裂肉歯）', shape: blade(T.LM1_tip_a[0] - 1.8, T.LM1_tip_b[0] + 1.6, T.LM1_base[1], [[T.LM1_tip_a[0], T.LM1_tip_a[1], 1.8], [T.LM1_tip_b[0], T.LM1_tip_b[1], 1.9]], lc(T.LM1_base[0]), 1, 2.0) },
  ];
  return { mandible, condyle: (s) => Q(cond[0], cond[1], s * condC), coronoidTip: Q(T.coronoid_tip[0], T.coronoid_tip[1], c0(T.coronoid_tip[0])), upper, lower, c0 };
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm3 = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// 前後の各位置で、上の線・下の線・幅に合う断面（上は丸く・下は平たい・鼻づらは上ほど細い）の立体。
// grow(a,b) を渡すと、その厚みだけ外へふくらませた形になる（筋肉の外側の面に使う）
export function sectionShape(Q, AX, top, base, wf, aMin, aMax, grow = null) {
  const [u, v, w] = AX, O = Q(0, 0, 0);
  return {
    f: (x, y, z) => {
      const px = x - O[0], py = y - O[1], pz = z - O[2];
      const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], c = px * w[0] + py * w[1] + pz * w[2];
      let t0 = top(a), b0 = base(a);
      let wc0 = wf(a);
      // 鼻先は丸くおさめる
      const R = 3.5;
      if (a > aMax - R) { const k = Math.sqrt(Math.max(0.05, 1 - ((a - (aMax - R)) / R) ** 2)); const m = (t0 + b0) / 2; t0 = m + (t0 - m) * k; b0 = m + (b0 - m) * k; wc0 *= k; }
      const g = grow ? grow(a, b, c) : [0, 0];                  // [上と横へ, 下へ]
      t0 += g[0]; b0 -= g[1]; wc0 += g[0];
      const hh = Math.max(0.5, (t0 - b0) / 2), bm = (t0 + b0) / 2;
      const yy = (b - bm) / hh;
      const face = Math.max(0, Math.min(1, (a - 48) / 10));
      const taper = 1 - (0.12 + 0.3 * face) * Math.max(0, Math.min(1.5, yy));
      const wc = Math.max(0.5, wc0 * taper);
      const p = yy > 0 ? 2.3 : 3.2;
      const k = Math.pow(Math.pow(Math.abs(c) / wc, p) + Math.pow(Math.abs(yy), p), 1 / p);
      const dSec = (k - 1) * Math.min(wc, hh);
      const dEnd = Math.max(aMin - a, a - aMax);
      return Math.max(dSec, dEnd);
    },
    lo: [O[0] - 45, O[1] - 35, O[2] - 45], hi: [O[0] + 45, O[1] + 65, O[2] + 105],
  };
}
