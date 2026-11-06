// 胸郭：肋骨13対（真肋9・仮肋3・浮遊肋1）、肋軟骨、胸骨（胸骨片8個）、胸骨片のあいだの軟骨
import { add, sub, mul, lerp, norm, len, cone, ellipsoid, sphere, plate, tube, smoothUnion, spline, mix } from './sdf.js';

// 肋骨ごとの胸の半分の幅（mm）と、腹側へのずれの強さ
const W = [13, 19, 24, 28, 31, 33, 35, 36, 36, 35.5, 34, 32, 29];
const SHIFT = [0.2, 0.4, 0.6, 0.75, 0.9, 1.0, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4];

// 点の列に沿って長さで位置を取る
function along(pts, f) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])));
  const s = f * acc[acc.length - 1];
  let i = 1; while (i < pts.length - 1 && acc[i] < s) i++;
  return lerp(pts[i - 1], pts[i], (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1));
}

export function buildThorax(api, lm) {
  const V = lm.vert;

  // ---- 胸骨 ----
  const M0 = [0, 192, V.T1.c[2] + 24];      // 胸骨柄の頭側の端
  const X0 = [0, 138, V.T9.c[2] + 2];       // 剣状突起の尾側の端
  const SL = [14, 11, 11, 11, 11, 11, 10, 14];
  const gap = 1.5;
  const total = SL.reduce((a, b) => a + b, 0) + gap * 7;
  // 少し腹側にふくらむ弓なりの線
  const sternPt = (s) => {
    const t = s / total;
    const p = lerp(M0, X0, t);
    return add(p, [0, -Math.sin(t * Math.PI) * 6, 0]);
  };
  const sternebrae = [];
  let s = 0;
  for (let i = 0; i < 8; i++) {
    const a = sternPt(s), b = sternPt(s + SL[i]);
    sternebrae.push({ a, b });
    s += SL[i] + gap;
  }
  const junction = (j) => lerp(sternebrae[j - 1].b, sternebrae[j].a, 0.5); // j=1..7
  sternebrae.forEach(({ a, b }, i) => {
    let shape;
    const flat = { dir: [1, 0, 0], ratio: 0.72 };
    if (i === 0) {
      // 胸骨柄：頭側へとがる
      shape = smoothUnion(1.0,
        cone(add(a, [0, 1.5, 2.5]), lerp(a, b, 0.5), 1.8, 3.0, flat),
        cone(lerp(a, b, 0.5), b, 3.0, 2.8, flat),
        ...[1, -1].map((sd) => ellipsoid(lerp(a, b, 0.55), [1.6, 1.8, 2.2])),
      );
    } else if (i === 7) {
      // 剣状突起：細く尾側へのびる
      shape = smoothUnion(0.8, cone(a, lerp(a, b, 0.3), 2.6, 1.7, flat), cone(lerp(a, b, 0.3), b, 1.7, 1.3, flat));
    } else {
      // 胸骨片：両端が少しふくらむ柱
      const d = norm(sub(b, a));
      shape = smoothUnion(0.8,
        cone(add(a, mul(d, 0.8)), sub(b, mul(d, 0.8)), 2.3, 2.3, flat),
        ellipsoid(add(a, mul(d, 1.2)), [3.0, 3.0, 1.3]),
        ellipsoid(sub(b, mul(d, 1.2)), [3.0, 3.0, 1.3]),
      );
    }
    api.bone({
      id: 'Sternebra' + (i + 1),
      ja: i === 0 ? '胸骨柄（第1胸骨片）' : i === 7 ? '剣状突起（第8胸骨片）' : `第${i + 1}胸骨片`,
      la: i === 0 ? 'Manubrium sterni' : i === 7 ? 'Processus xiphoideus' : 'Sternebra',
      region: 'thorax', parent: i === 0 ? 'T4' : 'Sternebra' + i, joint: a, shape,
    });
    if (i < 7) {
      const j = junction(i + 1);
      api.bone({ id: 'SternCart' + (i + 1), ja: `胸骨片間軟骨（${i + 1}–${i + 2}）`, la: 'Cartilago intersternebralis', region: 'thorax', parent: 'Sternebra' + (i + 1), joint: b,
        shape: cone(sub(j, mul(norm(sub(b, a)), 1.2)), add(j, mul(norm(sub(b, a)), 1.2)), 2.2, 2.2, { dir: [1, 0, 0], ratio: 0.72 }), mat: 'cartilage', h: 0.25 });
    }
  });
  // 剣状軟骨（平たいへら）
  {
    const { a, b } = sternebrae[7];
    const d = norm(sub(b, a));
    const e2 = [1, 0, 0];
    api.bone({ id: 'XiphoidCart', ja: '剣状軟骨', la: 'Cartilago xiphoidea', region: 'thorax', parent: 'Sternebra8', joint: b,
      shape: plate(b, d, e2, [[-1, -1.5], [3, -3.5], [11, -5.5], [15, -3], [15, 3], [11, 5.5], [3, 3.5], [-1, 1.5]], 1.0, 0.45), mat: 'cartilage', h: 0.3 });
  }

  // ---- 肋骨 ----
  const sternalAttach = (i) => {
    // 肋骨 i が胸骨につく場所
    if (i === 1) return lerp(sternebrae[0].a, sternebrae[0].b, 0.55);
    if (i <= 7) return junction(i - 1);
    if (i === 8) return lerp(junction(7), sternebrae[7].a, -0.2);
    return lerp(junction(7), sternebrae[7].a, 0.5);
  };
  const cartPaths = {};
  lm.F ||= {};
  lm.F.ribs = {}; lm.F.carts = cartPaths; lm.F.sternebrae = sternebrae;
  for (let i = 1; i <= 13; i++) {
    const v = V['T' + i];
    const k = (i - 1) / 12;
    const bw = 3.6 + k * 1.2;
    const y0 = v.cr[1] + 0.8, z0 = v.cr[2];
    const head = [bw + 1.0, y0, z0];
    const tub = [bw + 4.2, y0 + 4.6, z0 - 1.0];
    const w = W[i - 1], f = SHIFT[i - 1];
    const sAtt = i <= 9 ? sternalAttach(i) : null;
    // 胸の深さ（背骨から胸骨・または肋骨弓まで）
    const ys = sAtt ? sAtt[1] : mix(150, 175, (i - 10) / 3);
    const D = y0 - ys;
    const cc = i === 1 ? 0.8 : i >= 10 ? 0.7 + (i - 10) * 0.05 : 0.62;
    const back = 3 + 20 * f;
    const ctrl = [
      head, tub,
      [w * 0.55, y0 + 2.0, z0 - 2.5],
      [w * 0.9, y0 - D * 0.22, z0 - back * 0.45],
      [w, y0 - D * 0.45, z0 - back * 0.75],
      [w * 0.93, y0 - D * 0.65, z0 - back * 0.95],
      [w * 0.8, y0 - D * cc, z0 - back],
    ].map((p, idx) => (idx < 2 ? p : [p[0], p[1], p[2]]));
    // 第1肋骨は短く、まっすぐ腹側へ
    if (i === 1) { ctrl[3] = [w * 0.9, y0 - D * 0.3, z0 - 1]; ctrl[4] = [w, y0 - D * 0.55, z0 - 1.5]; ctrl[5] = [w * 0.95, y0 - D * 0.7, z0 - 1.5]; }
    const ccPt = ctrl[ctrl.length - 1];
    let ribPts = spline(ctrl.slice(0, ctrl.length - (i === 1 ? 1 : 0)).concat(i === 1 ? [[w * 0.85, y0 - D * cc, z0 - 1.5]] : []), 5);
    const n = ribPts.length;
    const radii = ribPts.map((_, q) => {
      const t = q / (n - 1);
      return t < 0.1 ? 1.4 : mix(1.75, 1.35, t) * (i === 1 ? 1.25 : 1);
    });
    lm.F.ribs[i] = ribPts;
    const rib = smoothUnion(0.7,
      tube(ribPts, radii, null, 0.5),
      sphere(head, 1.85),           // 肋骨頭
      ellipsoid(tub, [1.5, 1.2, 1.5]), // 肋骨結節
    );
    api.bone({ id: 'Rib' + i, pair: true, ja: `第${i}肋骨${i <= 9 ? '（真肋）' : i <= 12 ? '（仮肋）' : '（浮遊肋）'}`, la: `Costa ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'][i]}`,
      region: 'thorax', parent: 'T' + i, joint: head, shape: rib });

    // 肋軟骨
    const endBone = ribPts[n - 1];
    let cart;
    if (i <= 9) {
      const st = add(sAtt, [3.2, 0, 0]);
      cart = [endBone, [ccPt[0] * 0.8, mix(endBone[1], st[1], 0.55), mix(endBone[2], st[2], 0.35) - 2], [mix(endBone[0], st[0], 0.75), st[1] + 3, mix(endBone[2], st[2], 0.8)], st];
    } else if (i <= 12) {
      const prev = cartPaths[i - 1];
      const target = add(along(prev, i === 10 ? 0.45 : 0.5), [0.6, 1.0, -0.5]);
      cart = [endBone, [mix(endBone[0], target[0], 0.5), mix(endBone[1], target[1], 0.55) - 2, mix(endBone[2], target[2], 0.5)], target];
    } else {
      cart = [endBone, add(endBone, [-2.5, -6, 3])];
    }
    const cartS = spline(cart, 5);
    cartPaths[i] = cartS;
    api.bone({ id: 'CostalCart' + i, pair: true, ja: `第${i}肋軟骨`, la: 'Cartilago costalis', region: 'thorax', parent: 'Rib' + i, joint: endBone,
      shape: tube(cartS, cartS.map((_, q) => mix(1.35, i >= 10 ? 0.8 : 1.15, q / (cartS.length - 1))), null, 0.5), mat: 'cartilage', h: 0.3 });
  }
}
