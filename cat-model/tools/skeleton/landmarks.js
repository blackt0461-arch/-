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
function makeCurve() {
  const pts = spline(CENTER_ZY.map(([z, y]) => [0, y, z]), 12);
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

export function computeLandmarks() {
  const curve = makeCurve();
  const S1z = 48;
  const sS1 = curve.sAtZ(S1z);
  const out = { curve, vert: {} };

  // 仙骨
  out.vert.S = vertAt(curve, sS1 + VERT.S / 2, VERT.S);
  // 腰椎（L7 から頭側へ）
  let s = sS1 - VERT.gap.L;
  for (let i = 7; i >= 1; i--) {
    const L = VERT.L[i - 1];
    out.vert['L' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 1 ? VERT.gap.T : VERT.gap.L);
  }
  for (let i = 13; i >= 1; i--) {
    const L = VERT.T[i - 1];
    out.vert['T' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 1 ? VERT.gap.C : VERT.gap.T);
  }
  for (let i = 7; i >= 1; i--) {
    const L = VERT.C[i - 1];
    out.vert['C' + i] = vertAt(curve, s - L / 2, L);
    s -= L + (i === 2 ? 1.0 : VERT.gap.C);
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
  const S = [30, 205, T1.cr[2] + 2];               // 肩関節（上腕骨頭の中心）
  out.fore = {
    shoulder: S,
    scapDorsal: add(S, [-16, 50, -42]),           // 肩甲骨の背側縁の中ほど
    elbow: add(S, [0, -71, -56]),                 // 肘関節（上腕骨顆の中心）
  };
  out.fore.carpus = add(out.fore.elbow, [-3, -94, 14]);  // 橈骨手根関節
  out.fore.mcp = add(out.fore.carpus, [0, -31, 12]);     // 第3指の中手指節関節

  // ---- 後ろ足（左） ----
  const H = [17, out.vert.S.c[1] - 28, 8];         // 股関節（大腿骨頭の中心）
  out.hind = { hip: H };
  out.hind.stifle = add(H, [8, -82, 52]);           // 膝関節
  out.hind.hock = add(out.hind.stifle, [-2, -76, -66]); // 足根関節（距骨の滑車）
  out.hind.mtp = [out.hind.hock[0], 9, out.hind.hock[2] + 18]; // 第3趾の中足趾節関節
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
