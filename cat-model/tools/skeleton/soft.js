// やわらかい部分：内臓（形と位置）、目、耳、ひげ、そして皮ふの下を埋める詰め物（ひげのふくらみ・唇・鼻・肉球）
import { add, sub, mul, norm, cross, lerp, cone, ellipsoid, sphere, plate, smoothUnion, smoothSubtract, intersect, spline } from './sdf.js';

export function buildSoft(api, lm) {
  const F = lm.F, V = lm.vert, Q = F.Q;
  const [u, v, w] = F.skullAxes;
  const E = (a, b, c, r, axes = F.skullAxes) => ellipsoid(Q(a, b, c), r, axes);
  const vt = (id, a = 0, d = 0, s = 0) => { const q = V[id]; return add(q.c, add(mul(q.t, a), add(mul(q.u, d), [s, 0, 0]))); };
  const organ = (d) => api.bone({ region: 'organ', mat: 'organ', ...d });

  // ===================== 内臓（形と位置だけ） =====================
  organ({ id: 'Brain', ja: '脳', la: 'Encephalon', parent: 'Skull', joint: Q(0, 0, 0), color: [0.86, 0.74, 0.72],
    shape: smoothUnion(2, E(25, 14, 0, [17.5, 12.5, 15.5]), E(4, 9, 0, [7, 8, 11]), E(42, 10, 0, [6, 5, 5])) });
  {
    // 肺：背側の大きな葉と、腹側・頭側の葉
    const lung = smoothUnion(4, ellipsoid([12, 221, 238], [10.5, 17, 46]), ellipsoid([15, 193, 272], [12, 20, 24]), ellipsoid([10, 212, 290], [8, 14, 14]));
    organ({ id: 'Lung', pair: true, ja: '肺', la: 'Pulmo', parent: 'T6', joint: [12, 215, 255], color: [0.9, 0.62, 0.64], shape: smoothSubtract(3, lung, ellipsoid([2, 182, 268], [15, 18, 20])) });
  }
  {
    const ax = norm([0.25, -0.6, -0.75]); const ay = norm(cross(ax, [1, 0, 0])); const az = norm(cross(ax, ay));
    organ({ id: 'Heart', ja: '心臓', la: 'Cor', parent: 'T5', joint: [2, 182, 268], color: [0.6, 0.13, 0.13],
      shape: smoothUnion(2, ellipsoid([2, 182, 268], [19, 13, 13], [ax, ay, az]), cone([0, 196, 274], [-1, 214, 262], 4, 3.2)) }); // 大動脈弓のつけね
  }
  organ({ id: 'Liver', ja: '肝臓', la: 'Hepar', parent: 'T11', joint: [0, 182, 234], color: [0.42, 0.13, 0.1],
    shape: smoothSubtract(4, smoothUnion(3, ellipsoid([0, 180, 236], [29, 25, 12]), ellipsoid([-12, 195, 230], [12, 15, 10]), ellipsoid([12, 170, 238], [14, 12, 9])), sphere([0, 196, 285], 38)) });
  organ({ id: 'Stomach', ja: '胃', la: 'Ventriculus', parent: 'T12', joint: [12, 198, 214], color: [0.86, 0.6, 0.56],
    shape: smoothUnion(3, ellipsoid([13, 199, 214], [12, 14, 15]), cone([10, 196, 205], [-6, 190, 196], 7, 4)) });
  organ({ id: 'Spleen', ja: '脾臓', la: 'Lien', parent: 'T13', joint: [27, 192, 196], color: [0.5, 0.12, 0.2], shape: ellipsoid([27, 190, 196], [4, 15, 14]) });
  {
    // 小腸：くねくねした腸のかたまり
    const balls = [];
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 34; i++) {
      const t = rnd() * Math.PI * 2, r = Math.sqrt(rnd()), h = rnd() * 2 - 1;
      balls.push(sphere([Math.cos(t) * r * 18, 178 + Math.sin(t) * r * 20, 140 + h * 36], 6.5 + rnd() * 2.5));
    }
    organ({ id: 'Intestine', ja: '小腸', la: 'Intestinum tenue', parent: 'L3', joint: [0, 178, 140], color: [0.9, 0.68, 0.6], shape: smoothUnion(2.5, ...balls), h: 0.6 });
  }
  organ({ id: 'Colon', ja: '大腸（結腸・直腸）', la: 'Intestinum crassum', parent: 'L6', joint: [6, 205, 100], color: [0.78, 0.56, 0.46],
    shape: smoothUnion(2, ...spline([[-8, 190, 112], [6, 205, 100], [9, 218, 78], [4, 228, 50], [0, 229, 22], [0, 226, 0], [0, 222, -14]], 3).slice(0, -1).map((p, i, a) => cone(p, a[i + 1] || [0, 222, -14], 5, 5))) });
  organ({ id: 'Kidney', pair: true, ja: '腎臓', la: 'Ren', parent: 'L2', joint: [14, 236, 166], color: [0.46, 0.13, 0.13],
    shape: smoothSubtract(2, ellipsoid([14, 236, 166], [7, 9.5, 12.5]), sphere([7, 236, 166], 4)) });
  organ({ id: 'Bladder', ja: '膀胱', la: 'Vesica urinaria', parent: 'S', joint: [0, 193, 42], color: [0.93, 0.84, 0.62], shape: ellipsoid([0, 193, 42], [9.5, 9.5, 14]) });

  // 首から胸を通る管（気管・食道）：首の動きにあわせて曲がるよう、筋肉と同じ作り方にする
  lm.softTubes = [
    { id: 'Trachea', ja: '気管（と喉頭）', la: 'Trachea et larynx', color: [0.86, 0.84, 0.8],
      pts: [Q(-1, -24, 0), vt('C3', 0, -9, 0), vt('C5', 0, -10, 0), vt('C7', 0, -12, 0), [0, 207, 290], [0, 205, 268]], r: [6, 3.6, 3.6, 3.6, 3.4, 3.2] },
    { id: 'Esophagus', ja: '食道', la: 'Oesophagus', color: [0.82, 0.58, 0.55],
      pts: [Q(-6, -19, 0), vt('C3', 0, -6, 1.5), vt('C6', 0, -7, 2), vt('T2', 0, -9, 2), vt('T6', 0, -12, 2), [6, 210, 232], [10, 202, 222]], r: [3, 2.6, 2.6, 2.6, 2.6, 2.8, 3.2] },
  ];

  // ===================== 目 =====================
  // 眼球：直径 約20.7mm（Aust Vet J の測定）、両目の中心の間 約33.6mm（Tollin & Koka 2009）。眼窩の中、前と少し外を向く
  const EYE_C = Q(51.0, 20.0, 16.8), EYE_R = 10.3;
  {
    const C = EYE_C;
    const g = norm(add(mul(u, 0.93), mul(w, 0.37)));                         // 目の向き（前と少し外）
    const hv = norm(cross(v, g)), vv = norm(cross(g, hv));
    const R = EYE_R;
    lm.eyeOpen = { c: add(C, mul(g, R + 1.2)), axes: [g, hv, vv], r: [3.0, 8.6, 7.4] };     // まぶたのすきま（横 約17mm・縦 約12mm）
    lm.eyeCut = { c: add(C, mul(g, R + 2.0)), axes: [g, hv, vv], r: [14, 8.6, 7.4] };       // 皮ふを切る範囲（角膜の面でほぼこの大きさ）
    lm.eyeAxes = { C, g, hv, vv, R };
    lm.nostril = { c: Q(88.4, 4.6, 2.6), axes: [u, v, w], r: [1.8, 1.1, 0.9] };            // 鼻の穴
    api.bone({ id: 'Eye', pair: true, ja: '眼球', la: 'Bulbus oculi', region: 'organ', mat: 'eye', parent: 'Skull', joint: C, h: 0.13, noSimplify: true,
      shape: smoothUnion(1.5, sphere(C, R), sphere(add(C, mul(g, 4.0)), 7.6)), // 角膜のふくらみ
      colorFn: (p) => {
        const d = norm(sub(p, C));
        const c = d[0] * g[0] + d[1] * g[1] + d[2] * g[2];
        if (c < 0.6) return [0.5, 0.4, 0.3];
        const x = d[0] * hv[0] + d[1] * hv[1] + d[2] * hv[2], y = d[0] * vv[0] + d[1] * vv[1] + d[2] * vv[2];
        const rr = Math.hypot(x, y) / Math.sqrt(1 - 0.6 * 0.6);
        if (Math.abs(x) < 0.08 * Math.sqrt(Math.max(0, 1 - (y / 0.8) ** 2)) && Math.abs(y) < 0.78) return [0.03, 0.02, 0.02]; // 縦長のひとみ
        const ring = 0.55 + 0.45 * rr;
        return [0.62 * ring + 0.15, 0.68 * ring + 0.1 * rr, 0.28 + 0.1 * rr];               // 黄緑の虹彩
      } });
    // 眼窩の脂肪（目の後ろのクッション）・第三眼瞼（瞬膜）
    organ({ id: 'OrbitalFat', pair: true, ja: '眼窩の脂肪', la: 'Corpus adiposum orbitae', parent: 'Skull', joint: C, color: [0.95, 0.85, 0.55], h: 0.3,
      shape: smoothSubtract(1.0, ellipsoid(add(C, mul(g, -6)), [7, 9, 8.5], [g, hv, vv]), sphere(C, R + 0.3)) });
    organ({ id: 'ThirdEyelid', pair: true, ja: '第三眼瞼（瞬膜）', la: 'Plica semilunaris conjunctivae', parent: 'Skull', joint: C, color: [0.82, 0.6, 0.58], h: 0.15,
      shape: smoothSubtract(0.5, intersect(sphere(C, R + 0.9), ellipsoid(add(add(C, mul(g, R)), mul(hv, -7.5)), [3, 3.2, 6.5], [g, hv, vv])), sphere(C, R + 0.2)) });
  }

  // ===================== 耳（耳介） =====================
  // 耳の高さ（外側）約48mm・半分の高さでの幅 約25mm（Tollin & Koka 2009）。側頭筋の上の外寄りにつく
  {
    const B = Q(21, 29.5, 21.5);
    const up = norm(add(mul(v, 0.8), mul(w, 0.6)));                  // 外へ約37°かたむく（正面写真）
    const f = norm(add(mul(u, 0.72), mul(w, 0.7)));                  // 耳の穴は前と外を向く
    const ew = norm(cross(up, f));
    const C = add(B, add(mul(f, 40), mul(up, 14)));
    const RR = Math.hypot(40, 14);
    const shell = { f: (x, y, z) => Math.abs(Math.hypot(x - C[0], y - C[1], z - C[2]) - RR) - 1.1, lo: C.map((q) => q - RR - 2), hi: C.map((q) => q + RR + 2) };
    const tri = plate(add(B, mul(f, -10)), ew, up, [[-20, -4], [20, -4], [3, 46], [-2, 46]], 60, 3);
    lm.earBase = B;
    api.bone({ id: 'Ear', pair: true, ja: '耳（耳介）', la: 'Auricula', region: 'skin', mat: 'skin', parent: 'Skull', joint: B, h: 0.3,
      // 耳のつけねより下には出ないようにする
      shape: intersect(smoothUnion(1.5, intersect(shell, tri), ellipsoid(B, [12, 5, 7], [ew, up, f])),
        { f: (x, y, z) => -((x - B[0]) * up[0] + (y - B[1]) * up[1] + (z - B[2]) * up[2]) - 2.5, lo: B.map((q) => q - 60), hi: B.map((q) => q + 60) }),
      furFn: (p, n) => {
        const inner = (n[0] * (C[0] - p[0]) + n[1] * (C[1] - p[1]) + n[2] * (C[2] - p[2])) > 0;
        return inner ? { color: [0.93, 0.7, 0.66], fur: 0.12 } : { color: [0.55, 0.45, 0.35], fur: 0.2 };
      } });
  }

  // ===================== ひげ =====================
  {
    const whiskers = [];
    for (let row = 0; row < 4; row++) for (let k = 0; k < 3; k++) {
      const base = Q(72 + k * 3.2, -0.5 + row * 2.0, 13.0 - k * 1.1);
      const dir = norm(add(add(mul(w, 0.72), mul(u, 0.35 - k * 0.15)), mul(v, -0.25 + row * 0.12)));
      const L = 48 + (3 - row) * 5 - k * 6;
      whiskers.push({ base, dir, L, r: 0.22 });
    }
    // まゆの上のひげ・ほおのひげ
    for (let k = 0; k < 3; k++) whiskers.push({ base: Q(53 + k * 2, 30, 11 + k), dir: norm(add(add(mul(v, 0.55), mul(w, 0.6)), mul(u, 0.3))), L: 28 - k * 4, r: 0.15 });
    whiskers.push({ base: Q(38, 8, 27), dir: norm(add(add(mul(w, 0.8), mul(v, 0.1)), mul(u, -0.4))), L: 25, r: 0.15 });
    const meshes = whiskers.map(({ base, dir, L, r }) => {
      const side = norm(cross(dir, v)), droop = mul(v, -1);
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(add(add(base, mul(dir, L * t)), mul(add(droop, mul(u, -0.3)), L * 0.12 * t * t))); }
      return tubeMesh(pts, (t) => r * (1 - t * 0.92));
    });
    api.bone({ id: 'Whiskers', pair: true, ja: 'ひげ（洞毛）', la: 'Pili tactiles', region: 'skin', mat: 'whisker', parent: 'Skull', joint: Q(76, 1.5, 12), mesh: mergeMeshes(meshes) });
  }

  // ===================== 皮ふの下の詰め物（皮ふの形を作るためだけに使う） =====================
  const fill = [];
  // 顔のやわらかい部分（脂肪・唇・ひげのふくらみ・鼻）。頭骨と筋肉の上にのる
  for (const s of [1, -1]) {
    fill.push(E(76, 1.5, s * 9.0, [8.0, 6.5, 6.0]));      // ひげのふくらみ（洞毛の毛包と脂肪）
    fill.push(E(66, -5.0, s * 12.0, [12, 4.5, 5.0]));     // 上唇
    fill.push(E(73, -11.0, s * 5.5, [8, 3.5, 4.0]));      // 下唇
    fill.push(E(53, -3.0, s * 16.5, [9, 6, 5]));          // ほおの脂肪（頬脂肪体）
    fill.push(E(47, 30.5, s * 11, [8, 3, 6]));            // まゆの上の脂肪
    fill.push(E(14, -3, s * 20, [6, 8, 4]));              // 耳下腺（だ液腺）
    fill.push(E(4, -14, s * 12, [6, 5, 5]));              // 下顎腺（だ液腺）
    // まぶた：目のまわりをかこむ
    const e = lm.eyeAxes, ss = (q) => [q[0] * s, q[1], q[2]];
    fill.push(ellipsoid(ss(add(e.C, mul(e.g, e.R - 5.5))), [5.5, 11.4, 10.2], [ss(e.g), ss(e.hv), ss(e.vv)]));
  }
  fill.push(ellipsoid(Q(85.2, 6.0, 0), [3.0, 4.0, 4.4], [norm(add(u, mul(v, -0.35))), norm(add(v, mul(u, 0.35))), w])); // 鼻（鼻鏡）：前と少し下を向く
  fill.push(cone(Q(76, 11, 0), Q(85, 8.5, 0), 4.5, 4.0)); // 鼻の軟骨（鼻すじの先）
  fill.push(E(79, -12.5, 0, [5, 4, 6]));                  // あご（オトガイ）
  fill.push(E(5, 20, 0, [12, 8, 16]));                    // 後頭部の筋肉のふくらみ
  // 首：のどと首の筋肉をまとめた太さ
  fill.push(cone(Q(2, -7, 0), vt('C4', 0, -2, 0), 11.5, 16));
  fill.push(cone(vt('C4', 0, -2, 0), vt('T1', 0, -16, 0), 19, 24));
  // おなか（内臓と脂肪のふくらみ）
  fill.push(ellipsoid([0, 185, 135], [31, 34, 72]));
  fill.push(ellipsoid([0, 200, 230], [33, 38, 55]));
  // 肉球
  const pads = [];
  const fore = lm.fore.mcp, hind = lm.hind.mtp;
  for (const [mcp, isFore] of [[fore, true], [hind, false]]) {
    for (const s of [1]) {
      pads.push({ c: add(mcp, [0, -6.2, isFore ? 3 : 4]), r: [7.5, 3.6, 6.2] });            // 掌球・足底球
      const dx = [-6.6, -2.2, 2.2, 6.6], dz = [11.5, 14, 14, 11.5];
      dx.forEach((x, i) => pads.push({ c: add(mcp, [x * s, -6.3, dz[i]]), r: [2.6, 2.5, 3.1] })); // 指球
    }
  }
  pads.push({ c: F.paw.L(2, -12.5, 2.5), r: [2.6, 2.6, 2.4] });                                   // 手根球
  for (const p of pads) fill.push(ellipsoid(p.c, p.r));
  lm.softFill = fill;
  lm.pads = pads;
  lm.noseTip = Q(89.0, 6.5, 0);
  lm.eyeFront = EYE_C;
}

// 曲線に沿った細い管のメッシュ（ひげ用）
export function tubeMesh(pts, rf, sides = 5) {
  const P = [], N = [], I = [];
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const d = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    let a = norm(cross(d, [0, 1, 0])); if (!isFinite(a[0])) a = [1, 0, 0];
    const b = norm(cross(d, a));
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2, n = add(mul(a, Math.cos(th)), mul(b, Math.sin(th)));
      const p = add(pts[i], mul(n, Math.max(0.01, rf(t))));
      P.push(...p); N.push(...n);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    I.push(a, c, b, b, c, d);
  }
  return { positions: P, normals: N, indices: I };
}
export function mergeMeshes(list) {
  const P = [], N = [], I = [];
  for (const m of list) { const o = P.length / 3; P.push(...m.positions); N.push(...m.normals); for (const i of m.indices) I.push(i + o); }
  return { positions: new Float32Array(P), normals: new Float32Array(N), indices: new Uint32Array(I) };
}
