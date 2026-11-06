// 猫の骨格の設計図（立っている姿勢）。単位は mm。
// 体重 4kg ほどの大人の短毛の猫を想定。
// x=左(+)、y=上、z=前。左側を作り、右側は左右反転で作る。
//
// 参考にした数字
// - 脊椎の数：頸椎7・胸椎13・腰椎7・仙椎3（癒合して仙骨）・尾椎20〜23（ここでは21）
// - 上腕骨の長さ ÷ 大腿骨の長さ ≒ 0.94（Medycyna Weterynaryjna 82(2), 2026 の 55 匹の平均）
// - (上腕骨+橈骨) ÷ (大腿骨+脛骨) ≒ 0.90（同上）
// - 関節の動く範囲：Jaeger ら「Goniometry in normal cats」AJVR 2007

import { spline, sub, norm, add, mul, len } from './sdf.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 別の猫の体に合わせるときの位置（data/fit_<名前>.json）
export function loadFit(name) {
  if (!name) return null;
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(resolve(here, `data/fit_${name}.json`), 'utf8'));
}

// 椎体の長さ（mm）と、椎間板のすきま
export const VERT = {
  C: [9, 19, 12, 12, 11.5, 11, 10],
  T: [8, 8, 8.2, 8.3, 8.5, 8.6, 8.8, 9, 9.2, 9.5, 9.8, 10.2, 10.6],
  L: [15, 16, 17, 17.5, 18, 17.5, 14],
  S: 30,
  Cd: [9, 11, 13, 15, 17, 18, 18.5, 18.5, 18, 17.5, 17, 16, 15, 14, 13, 12, 10.5, 9, 7.5, 6, 5],
  gap: { C: 1.4, T: 0.8, L: 1.6, Cd: 1.0 },
};

// 背骨の中心線（頭側 → しっぽの先）。(z, y)
const CENTER_ZY = [
  [430, 335], [400, 305], [378, 281], [357, 260], [337, 245], [316, 237], [290, 235], [250, 238], [215, 244],
  [185, 250], [150, 257], [110, 259], [75, 255], [48, 250], [20, 244], [0, 238], [-20, 226], [-45, 205],
  [-80, 172], [-125, 135], [-175, 103], [-225, 85], [-270, 82], [-305, 92], [-335, 108], [-360, 125],
];

// 中心線をなめらかにして、長さで位置を引けるようにする
function makeCurve(czy = CENTER_ZY) {
  const pts = spline(czy.map(([z, y]) => [0, y, z]), 12);
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])));
  const at = (s) => {
    s = Math.max(0, Math.min(acc[acc.length - 1], s));
    let i = 1;
    while (i < acc.length - 1 && acc[i] < s) i++;
    const t = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    const p = add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), t));
    const tan = norm(sub(pts[i - 1], pts[i])); // 頭の向き
    return { p, t: tan };
  };
  // z がある値になる長さを探す（頭側から）
  const sAtZ = (z) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][2] <= z) {
      const t = (pts[i - 1][2] - z) / (pts[i - 1][2] - pts[i][2]);
      return acc[i - 1] + (acc[i] - acc[i - 1]) * t;
    }
    return acc[acc.length - 1];
  };
  return { at, sAtZ, total: acc[acc.length - 1] };
}

// 1つの椎骨の位置と向き
// c=中心, t=頭の向き, u=背中の向き, L=長さ, cr=頭側の端, ca=尾側の端
function vertAt(curve, sMid, L) {
  const { p, t } = curve.at(sMid);
  const u = [0, t[2], -t[1]];
  return { c: p, t, u: norm(u), L, cr: add(p, mul(t, L / 2)), ca: add(p, mul(t, -L / 2)) };
}

export function computeLandmarks(fitName = null) {
  const fit = typeof fitName === 'string' ? loadFit(fitName) : fitName;
  const curve = makeCurve(fit ? fit.center_zy : CENTER_ZY);
  const S1z = fit ? fit.s1_z : 48;
  const sS1 = curve.sAtZ(S1z);
  const out = { curve, vert: {}, fit };
  // 合わせる体があるときは、頸椎〜腰椎の長さを、仙骨から後頭顆までの長さにそろえて少しのばす（ちぢめる）
  let k = 1;
  if (fit) {
    const sO = curve.sAtZ(fit.skull.O[2]);
    const nominal = VERT.gap.L + VERT.L.reduce((a, b) => a + b) + 6 * VERT.gap.L + VERT.gap.T + VERT.T.reduce((a, b) => a + b) + 12 * VERT.gap.T + VERT.gap.C + VERT.C.reduce((a, b) => a + b) + 5 * VERT.gap.C + 1.0 + 1.4 + 0.5;
    k = (sS1 - sO) / nominal;
  }
  out.spineScale = k;

  // 仙骨
  out.vert.S = vertAt(curve, sS1 + VERT.S / 2, VERT.S);
  // 腰椎（L7 から頭側へ）
  let s = sS1 - VERT.gap.L * k;
  for (let i = 7; i >= 1; i--) {
    const L = VERT.L[i - 1] * k;
    out.vert['L' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 1 ? VERT.gap.T : VERT.gap.L) * k;
  }
  for (let i = 13; i >= 1; i--) {
    const L = VERT.T[i - 1] * k;
    out.vert['T' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 1 ? VERT.gap.C : VERT.gap.T) * k;
  }
  for (let i = 7; i >= 1; i--) {
    const L = VERT.C[i - 1] * k;
    out.vert['C' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 2 ? 1.0 : VERT.gap.C) * k;
  }
  // 頭骨のつけね（後頭顆）
  out.occiput = curve.at(s + 1.0 - 1.5);
  // 尾椎
  s = sS1 + VERT.S + VERT.gap.Cd;
  VERT.Cd.forEach((L, k) => {
    out.vert['Cd' + (k + 1)] = vertAt(curve, s + L / 2, L);
    s += L + VERT.gap.Cd;
  });

  // ---- 前足（左） ----
  const T1 = out.vert.T1;
  const S = fit ? fit.fore.shoulder : [30, 205, T1.cr[2] + 2]; // 肩関節（上腕骨頭の中心）
  out.fore = {
    shoulder: S,
    scapDorsal: add(S, [-16, 50, -42]),           // 肩甲骨の背側縁の中ほど
    elbow: add(S, [0, -71, -56]),                 // 肘関節（上腕骨顆の中心）
  };
  out.fore.carpus = add(out.fore.elbow, [-3, -94, 14]);  // 橈骨手根関節
  out.fore.mcp = add(out.fore.carpus, [0, -31, 12]);     // 第3指の中手指節関節
  if (fit) Object.assign(out.fore, fit.fore);

  // ---- 後ろ足（左） ----
  const H = [17, out.vert.S.c[1] - 28, 8];         // 股関節（大腿骨頭の中心）
  out.hind = { hip: H };
  out.hind.stifle = add(H, [8, -82, 52]);           // 膝関節
  out.hind.hock = add(out.hind.stifle, [-2, -76, -66]); // 足根関節（距骨の滑車）
  out.hind.mtp = [out.hind.hock[0], 9, out.hind.hock[2] + 18]; // 第3趾の中足趾節関節
  if (fit) Object.assign(out.hind, fit.hind);
  if (fit) attachRemap(out); else { out.remap = (p) => p; out.place = (sh) => sh; }
  return out;
}

// 関節が動く範囲（度。関節の内側の角度）Jaeger ら 2007
export const ROM = {
  shoulder: { flexion: 32, extension: 163 },
  elbow: { flexion: 22, extension: 163 },
  carpus: { flexion: 22, extension: 198 },
  hip: { flexion: 33, extension: 164 },
  stifle: { flexion: 24, extension: 164 },
  tarsus: { flexion: 21, extension: 167 },
};

// ---- 古い（標準の）骨格の座標を、合わせた体の座標へ写す ----
// いちばん近い2つの椎骨を手がかりに、その椎骨から見た位置（前後・上下・左右）を保ったまま移す。
// 左右は肋骨の広がりと同じ割合でのばす。
const SPINE_ORDER = [...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'], ...Array.from({ length: 13 }, (_, i) => 'T' + (i + 1)), ...Array.from({ length: 7 }, (_, i) => 'L' + (i + 1)), 'S', ...Array.from({ length: 21 }, (_, i) => 'Cd' + (i + 1))];
export function attachRemap(lm) {
  if (!lm.fit) { lm.remap = (p) => p; lm.place = (shape) => shape; return lm; }
  const old = computeLandmarks(null);
  const sx = lm.fit.ribScale ?? 1;
  const ids = SPINE_ORDER.filter((k) => old.vert[k] && lm.vert[k]);
  const frameAt = (p) => {
    // いちばん近い2つ
    const ds = ids.map((k) => [len(sub(p, old.vert[k].c)), k]).sort((a, b) => a[0] - b[0]);
    const [[d0, k0], [d1, k1]] = ds;
    return [[k0, d1 / (d0 + d1 + 1e-9)], [k1, d0 / (d0 + d1 + 1e-9)]];
  };
  const one = (p, k) => {
    const o = old.vert[k], n = lm.vert[k];
    const d = sub(p, o.c);
    const a = d[0] * 0 + d[1] * o.t[1] + d[2] * o.t[2], b = d[1] * o.u[1] + d[2] * o.u[2], x = d[0];
    return add(n.c, add(mul(n.t, a), add(mul(n.u, b), [x * sx, 0, 0])));
  };
  lm.remap = (p) => {
    const f = frameAt(p);
    return f.reduce((acc, [k, w]) => add(acc, mul(one(p, k), w)), [0, 0, 0]);
  };
  // 形（距離関数）ごと動かす：基準点の近くの写し方（平行移動＋回転）を形全体にあてる
  lm.place = (shape, anchor) => {
    const A = anchor, B = lm.remap(A);
    const [[k]] = frameAt(A);
    const o = old.vert[k], n = lm.vert[k];
    // 古い→新しいの回転（横軸まわり）
    const ang = Math.atan2(n.t[1], n.t[2]) - Math.atan2(o.t[1], o.t[2]);
    const c = Math.cos(ang), s = Math.sin(ang);
    const inv = (x, y, z) => {           // 新しい点 → 古い点
      const dx = (x - B[0]) / sx, dy = y - B[1], dz = z - B[2];
      return [A[0] + dx, A[1] + c * dy - s * dz, A[2] + s * dy + c * dz];
    };
    const corners = [];
    for (const i of [0, 1]) for (const j of [0, 1]) for (const k2 of [0, 1]) corners.push(lm.remap([i ? shape.hi[0] : shape.lo[0], j ? shape.hi[1] : shape.lo[1], k2 ? shape.hi[2] : shape.lo[2]]));
    const lo = [0, 1, 2].map((q) => Math.min(...corners.map((p) => p[q])) - 6), hi = [0, 1, 2].map((q) => Math.max(...corners.map((p) => p[q])) + 6);
    return { f: (x, y, z) => { const p = inv(x, y, z); return shape.f(p[0], p[1], p[2]); }, lo, hi };
  };
  return lm;
}
