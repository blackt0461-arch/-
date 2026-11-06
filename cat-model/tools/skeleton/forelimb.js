// 前肢：鎖骨、肩甲骨、上腕骨、橈骨、尺骨、手根骨7、中手骨5、指骨（第1指2・第2〜5指3）、種子骨、爪
import { add, sub, mul, norm, cross, dot, len, lerp, frame, cone, ellipsoid, sphere, plate, tube, torus, smoothUnion, smoothSubtract, subtract, spline, deg } from './sdf.js';
import { ROM } from './landmarks.js';

// ベクトルを軸 k のまわりに回す
export function rotate(v, k, ang) {
  k = norm(k);
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, v), kd = dot(k, v);
  return add(add(mul(v, c), mul(kv, s)), mul(k, kd * (1 - c)));
}

// 指（または趾）1本ぶん。base=中手（中足）指節関節の中心、dirs=各節の向き
// 返り値：各骨の { id, shape, joint } のリスト
export function buildDigit(opt) {
  const { name, base, dirP, dirM, lens, r, side, hasMiddle = true, prefix, region, parentId, label } = opt;
  const out = [];
  const up = [0, 1, 0];
  // 基節骨
  const p1a = base, p1b = add(base, mul(dirP, lens[0]));
  const fP = frame(p1a, dirP, up, side);
  out.push({
    id: `${prefix}P1_${name}`, ja: `${label}の基節骨`, la: 'Phalanx proximalis', joint: p1a, parent: parentId,
    shape: smoothSubtract(0.4, smoothUnion(0.7,
      ellipsoid(fP.L(1.6, 0, 0), [1.7, r * 1.35, r * 1.35], fP.axes),
      cone(fP.L(1.5, 0, 0), fP.L(lens[0] - 1.5, 0.1, 0), r * 0.95, r * 0.8, { dir: fP.fw, ratio: 0.85 }),
      ellipsoid(fP.L(lens[0] - 1.1, 0, 0), [1.4, r * 1.05, r * 1.15], fP.axes),
      ...[1, -1].map((sg) => sphere(fP.L(1.4, -r * 0.7, sg * r * 0.8), r * 0.45)), // 掌側の結節
    ), ellipsoid(fP.L(-0.6, 0, 0), [1.0, r * 0.9, r * 0.6], fP.axes)), // 関節のくぼみ
  });
  let last = p1b, lastId = `${prefix}P1_${name}`;
  if (hasMiddle) {
    const p2b = add(p1b, mul(dirM, lens[1]));
    const fM = frame(p1b, dirM, up, side);
    out.push({
      id: `${prefix}P2_${name}`, ja: `${label}の中節骨`, la: 'Phalanx media', joint: p1b, parent: lastId,
      shape: smoothUnion(0.6,
        ellipsoid(fM.L(1.2, 0, 0), [1.3, r * 1.15, r * 1.2], fM.axes),
        // 末節骨がおさまる側が少しくぼんだ、非対称な骨幹
        cone(fM.L(1.0, 0, -r * 0.1), fM.L(lens[1] - 1.0, 0, -r * 0.15), r * 0.8, r * 0.7, { dir: fM.sd, ratio: 0.8 }),
        ellipsoid(fM.L(lens[1] - 0.9, 0.1, 0), [1.1, r * 0.95, r * 1.05], fM.axes),
      ),
    });
    last = p2b; lastId = `${prefix}P2_${name}`;
  }
  // 末節骨（引っこめた状態：背側外側へ折りたたまれている）
  const fwd = norm(sub(last, base));
  const sideV = [side, 0, 0];
  // 引っこめた爪：末節骨は上（背側）へ立ち、爪の先は前下へ曲がる
  const dd = norm(add(add(mul(sideV, 0.32), mul(up, 0.9)), mul(fwd, -0.05)));
  let pp = sub(fwd, mul(dd, dot(fwd, dd)));
  pp = norm(pp);
  const lat = norm(cross(dd, pp));
  const Lc = lens[2];
  const curve = (t) => add(add(last, mul(dd, 1.2 + t * Lc * 0.85)), mul(pp, 3.2 * t * t));
  const bonePts = [0, 0.2, 0.4, 0.6, 0.75].map(curve);
  out.push({
    id: `${prefix}P3_${name}`, ja: `${label}の末節骨`, la: 'Phalanx distalis', joint: last, parent: lastId,
    shape: smoothUnion(0.6,
      ellipsoid(add(last, mul(dd, 1.2)), [1.3, r * 1.25, r * 1.1], [dd, pp, lat]),
      sphere(add(add(last, mul(dd, 0.9)), mul(pp, -r * 0.9)), r * 0.55),              // 伸筋突起
      sphere(add(add(last, mul(dd, 1.1)), mul(pp, r * 1.15)), r * 0.6),               // 屈筋結節
      ellipsoid(add(last, mul(dd, 2.6)), [0.7, r * 1.45, r * 1.3], [dd, pp, lat]),     // 爪稜（爪のつけねをおおうふち）
      tube(bonePts, [r * 0.9, r * 0.78, r * 0.6, r * 0.42, r * 0.3], { dir: lat, ratio: 0.62 }, 0.4), // 爪突起
    ),
  });
  // 爪（ケラチンのさや）
  const clawPts = [0.18, 0.4, 0.6, 0.8, 0.95, 1.08].map(curve);
  out.push({
    id: `${prefix}Claw_${name}`, ja: `${label}の爪`, la: 'Unguicula', joint: last, parent: `${prefix}P3_${name}`, mat: 'claw',
    shape: tube(clawPts, [r * 1.05, r * 0.92, r * 0.72, r * 0.48, r * 0.25, r * 0.06], { dir: lat, ratio: 0.58 }, 0.4), h: 0.12,
  });
  return out;
}

export function buildForelimb(api, lm) {
  const F = lm.fore;
  const S = F.shoulder, D = F.scapDorsal, E = F.elbow, R = F.carpus, MCP = F.mcp;
  const reg = (d) => api.bone({ region: 'forelimb', pair: true, ...d });
  // 筋肉づくりで使う骨ごとの座標（左）
  lm.F ||= {};
  Object.assign(lm.F, {
    scap: frame(S, sub(D, S), [0, 0, 1], 1),
    hum: frame(S, sub(E, S), [0, 0, 1], 1), Lh: len(sub(E, S)),
    fa: frame(E, sub(R, E), [0, 0, 1], 1), Lr: len(sub(R, E)),
    paw: frame(R, sub(MCP, R), [0, 0, 1], 1), Lp: len(sub(MCP, R)),
  });

  // ---- 肩甲骨 ----
  {
    const fr = frame(S, sub(D, S), [0, 0, 1], 1);
    const { L } = fr;
    const outline = [[8, -6.5], [14, -8.5], [30, -14.5], [50, -20.5], [63, -24], [69, -18], [71.5, -6], [72, 6], [70, 14], [63, 20], [52, 24], [38, 22.5], [24, 15.5], [14, 8.5], [8, 7.5]];
    const parts = [
      plate(L(0, 0, 0), fr.ax, fr.fw, outline, 1.3, 0.6),
      // 尾側縁の厚み
      tube([[10, -6.5], [30, -14.5], [50, -20.5], [63, -24]].map(([a, c]) => L(a, c, -0.3)), [2.2, 1.6, 1.3, 1.1], null, 0.6),
      // 関節窩のまわり（頸）
      ellipsoid(L(10.5, 0.5, 0), [4.0, 7.0, 5.0], fr.axes),
      cone(L(10, 0.5, 0), L(18, 0, 0), 5.0, 2.0, { dir: fr.sd, ratio: 0.6 }),
      ellipsoid(L(10.5, 7.0, 0.5), [2.2, 2.0, 2.0], fr.axes),                              // 関節上結節
      cone(L(11.5, 6.5, -2.5), L(9, 8.5, -5.0), 1.6, 1.0),                                  // 烏口突起
      // 肩甲棘
      plate(L(0, 1.0, 0), fr.ax, fr.sd, [[14, 0], [71, 0], [71, 1.3], [55, 4.5], [35, 7.2], [22, 8.2], [15, 8.0], [12, 6.5]], 1.5, 0.7),
      ellipsoid(L(22, 1.0, 8.0), [8, 1.2, 1.2], fr.axes),                                    // 棘の縁の厚み
      // 肩峰（鉤突起と鉤上突起）
      cone(L(16, 1.2, 7.8), L(5.5, 2.5, 7.0), 1.7, 1.1, { dir: fr.fw, ratio: 0.6 }),
      cone(L(16, 0.8, 8.0), L(19, -10, 7.0), 1.5, 1.2, { dir: fr.sd, ratio: 0.6 }),
    ];
    let scap = smoothUnion(1.0, ...parts);
    scap = smoothSubtract(0.6, scap, sphere(S, 8.3)); // 関節窩（上腕骨頭を受ける浅いくぼみ）
    reg({ id: 'Scapula', ja: '肩甲骨', la: 'Scapula', parent: 'T3', joint: lerp(S, D, 0.55), shape: scap, h: 0.42 });
  }
  // ---- 鎖骨（筋肉の中に浮いている小さな骨） ----
  {
    const a = add(S, [-16, -3, 11]), m = add(S, [-8, 3, 12]), b = add(S, [-1, 8, 8]);
    reg({ id: 'Clavicle', ja: '鎖骨', la: 'Clavicula', parent: 'Scapula', joint: m, shape: tube(spline([a, m, b], 4), 0.9, { dir: [0, 1, 0], ratio: 0.7 }, 0.4), h: 0.2 });
  }
  // ---- 上腕骨 ----
  {
    const Lh = len(sub(E, S));
    const fr = frame(S, sub(E, S), [0, 0, 1], 1);
    const { L } = fr;
    const parts = [
      ellipsoid(L(0.3, -1.2, 0), [7.4, 7.6, 7.2], fr.axes),                                   // 上腕骨頭
      cone(L(2, 0.5, 0), L(16, 1.2, 0), 7.0, 4.6),
      ellipsoid(L(-1.0, 5.8, 3.0), [5.5, 3.4, 3.4], fr.axes),                                 // 大結節
      ellipsoid(L(3.5, 2.0, -5.2), [3.8, 2.6, 2.2], fr.axes),                                 // 小結節
      tube([L(8, 5.2, 3.2), L(22, 4.8, 3.0), L(40, 3.4, 2.0)], [1.6, 1.4, 0.8], null, 0.6),   // 三角筋粗面
      tube([L(10, 5.6, 0.5), L(28, 4.8, 0.2), L(48, 3.0, 0)], [1.5, 1.3, 0.7], null, 0.6),    // 大結節稜
      tube([L(15, 1.4, 0), L(35, 1.8, 0), L(58, 0.8, 0), L(Lh - 22, -0.2, 0)], [4.3, 3.8, 3.6, 3.8], null, 1.2), // 骨幹
      cone(L(Lh - 24, -0.2, 0), L(Lh - 6, 0, 0), 3.9, 6.5, { dir: fr.fw, ratio: 0.55 }),     // 遠位の平たい部分
      cone(L(Lh, 0.4, -8.2), L(Lh, 0.4, 7.0), 4.6, 4.3),                                       // 上腕骨顆（滑車＋小頭）
      ellipsoid(L(Lh - 3.5, -1.0, -10.6), [4.8, 3.0, 2.6], fr.axes),                           // 内側上顆
      ellipsoid(L(Lh - 4.0, -1.0, 8.8), [4.0, 2.6, 2.0], fr.axes),                             // 外側上顆
      tube([L(Lh - 20, -0.5, 3.5), L(Lh - 6, -1.0, 8.8)], [1.2, 1.8], null, 0.8),              // 外側顆上稜
      tube([L(Lh - 27, 0.5, -2.8), L(Lh - 16, 0.6, -9.8), L(Lh - 5, -0.4, -11.0)], [1.5, 1.4, 1.8], null, 0.6), // 顆上孔の橋
    ];
    let hum = smoothUnion(1.0, ...parts);
    hum = smoothSubtract(0.6, hum,
      cone(L(-6, 7.6, 0.6), L(10, 6.4, 0.4), 1.5, 1.4),                                        // 結節間溝
      torus(L(Lh, 0.4, -2.2), fr.sd, 4.9, 0.9),                                                 // 滑車の溝
      ellipsoid(L(Lh - 7.5, -4.6, -0.5), [5.0, 2.4, 4.4], fr.axes),                            // 肘頭窩
      ellipsoid(L(Lh - 7.0, 4.6, 1.5), [3.4, 1.4, 3.0], fr.axes),                              // 橈骨窩
      cone(L(Lh - 21, 0.6, -6.6), L(Lh - 11, 0.6, -7.8), 1.5, 1.5),                            // 顆上孔（猫の特徴）
    );
    reg({ id: 'Humerus', ja: '上腕骨', la: 'Humerus', parent: 'Scapula', joint: S, shape: hum, h: 0.4, rom: { joint: '肩関節', ...ROM.shoulder } });
  }
  // ---- 尺骨・橈骨 ----
  const Lr = len(sub(R, E));
  const fa = frame(E, sub(R, E), [0, 0, 1], 1);
  const condyle = cone(add(E, mul(fa.sd, -8.6)), add(E, mul(fa.sd, 7.4)), 4.85, 4.55);
  {
    const { L } = fa;
    const parts = [
      cone(L(-1, -6.5, 0), L(-13.5, -7.8, 0.3), 3.6, 3.2, { dir: fa.sd, ratio: 0.75 }),        // 肘頭
      ellipsoid(L(-14.5, -7.5, 0.3), [2.8, 4.2, 3.2], fa.axes),                                 // 肘頭隆起
      ellipsoid(L(-1.0, -3.6, -0.5), [5.5, 4.2, 4.0], fa.axes),                                 // 滑車切痕のまわり
      ellipsoid(L(-4.8, -3.2, 0), [1.8, 2.0, 2.4], fa.axes),                                    // 肘突起
      ellipsoid(L(4.0, 1.0, -3.6), [2.4, 2.2, 2.0], fa.axes),                                   // 内側鉤状突起
      tube([L(6, -3.8, 0.5), L(30, -3.9, 1.2), L(Lr * 0.55, -3.5, 2.4), L(Lr - 5, -2.8, 4.4)], [3.1, 2.4, 2.0, 1.9], null, 1.0),
      ellipsoid(L(Lr + 0.5, -2.4, 5.2), [3.0, 2.2, 2.0], fa.axes),                              // 茎状突起
    ];
    const ulna = smoothSubtract(0.4, smoothUnion(1.0, ...parts), inflateCyl(condyle, 0.35));
    reg({ id: 'Ulna', ja: '尺骨', la: 'Ulna', parent: 'Humerus', joint: E, shape: ulna, h: 0.35, rom: { joint: '肘関節', ...ROM.elbow } });
  }
  {
    const { L } = fa;
    const parts = [
      ellipsoid(L(4.6, 1.8, 2.4), [2.2, 4.0, 5.2], fa.axes),                                    // 橈骨頭
      cone(L(5.5, 1.6, 2.0), L(15, 2.6, 1.4), 3.2, 2.6),
      tube([L(15, 2.6, 1.4), L(Lr * 0.55, 3.2, -0.2), L(Lr - 8, 2.4, -2.0)], [2.6, 2.7, 3.2], { dir: fa.fw, ratio: 0.72 }, 1.0),
      ellipsoid(L(Lr - 3.0, 1.0, -1.2), [4.0, 3.8, 7.2], fa.axes),                              // 遠位端
      ellipsoid(L(Lr + 0.3, 0.6, -7.6), [3.0, 2.4, 2.0], fa.axes),                              // 内側茎状突起
      cone(L(Lr - 12, 3.8, 0.5), L(Lr - 2.5, 4.2, 0.8), 0.8, 1.0),                              // 伸筋の腱が通る溝のふち
    ];
    const rad = smoothSubtract(0.5, smoothUnion(1.0, ...parts),
      inflateCyl(condyle, 0.35),                                                                // 橈骨頭窩
      ellipsoid(L(Lr + 4.2, 0, -0.8), [3.4, 4.6, 6.6], fa.axes),                                // 手根関節面
    );
    reg({ id: 'Radius', ja: '橈骨', la: 'Radius', parent: 'Humerus', joint: E, shape: rad, h: 0.35 });
  }
  // ---- 手根骨・中手骨・指 ----
  const pf = frame(R, sub(MCP, R), [0, 0, 1], 1);
  const { L } = pf;
  const Lp = len(sub(MCP, R));
  const carp = [
    { id: 'RadialCarpal', ja: '橈側手根骨（舟状月状骨）', la: 'Os carpi intermedioradiale', c: [2.9, 0.3, -2.2], r: [2.5, 3.3, 4.6] },
    { id: 'UlnarCarpal', ja: '尺側手根骨', la: 'Os carpi ulnare', c: [2.9, -0.5, 4.0], r: [2.4, 2.8, 2.4] },
    { id: 'Carpal1', ja: '第1手根骨', la: 'Os carpale I', c: [7.6, -1.0, -5.7], r: [1.5, 1.8, 1.4] },
    { id: 'Carpal2', ja: '第2手根骨', la: 'Os carpale II', c: [7.6, 0.6, -3.0], r: [1.5, 2.4, 1.3] },
    { id: 'Carpal3', ja: '第3手根骨', la: 'Os carpale III', c: [7.7, 0.6, 0.0], r: [1.7, 2.6, 1.6] },
    { id: 'Carpal4', ja: '第4手根骨', la: 'Os carpale IV', c: [7.6, 0.0, 3.4], r: [1.8, 2.6, 1.9] },
  ];
  for (const c of carp) {
    const center = L(...c.c);
    reg({ id: c.id, ja: c.ja, la: c.la, parent: c.id === 'RadialCarpal' ? 'Radius' : 'RadialCarpal', joint: c.id === 'RadialCarpal' ? R : center,
      shape: smoothUnion(0.6, ellipsoid(center, c.r, pf.axes), ellipsoid(L(c.c[0] + 0.3, c.c[1] + c.r[1] * 0.5, c.c[2]), [c.r[0] * 0.8, c.r[1] * 0.5, c.r[2] * 0.8], pf.axes)), h: 0.18,
      ...(c.id === 'RadialCarpal' ? { rom: { joint: '手根関節', ...ROM.carpus } } : {}) });
  }
  // 副手根骨（手首の後ろにつき出す）
  reg({ id: 'AccessoryCarpal', ja: '副手根骨', la: 'Os carpi accessorium', parent: 'RadialCarpal', joint: L(2.8, -3.0, 3.4),
    shape: smoothUnion(0.8, cone(L(2.8, -2.5, 3.4), L(1.2, -8.8, 3.8), 2.0, 2.2, { dir: pf.sd, ratio: 0.7 }), ellipsoid(L(1.0, -9.8, 3.8), [2.4, 1.8, 2.2], pf.axes)), h: 0.2 });

  // 中手骨（第1〜5）と指
  const MC = [
    { d: 1, base: [9.7, -0.6, -6.0], head: [16.5, -2.8, -8.2], r: 1.1 },
    { d: 2, base: [9.6, 0.5, -3.3], head: [Lp - 2.0, -0.2, -5.2], r: 1.3 },
    { d: 3, base: [9.7, 0.6, -0.6], head: [Lp, 0, -1.7], r: 1.45 },
    { d: 4, base: [9.7, 0.4, 2.0], head: [Lp, 0, 1.8], r: 1.45 },
    { d: 5, base: [9.6, 0.0, 4.4], head: [Lp - 3.0, -0.2, 5.3], r: 1.3 },
  ];
  const names = ['', '第1指（狼爪）', '第2指', '第3指', '第4指', '第5指'];
  for (const m of MC) {
    const a = L(...m.base), b = L(...m.head);
    const fm = frame(a, sub(b, a), pf.fw, 1);
    const l = len(sub(b, a));
    const shape = smoothUnion(0.7,
      ellipsoid(fm.L(1.2, 0, 0), [1.6, m.r * 1.5, m.r * 1.3], fm.axes),
      cone(fm.L(1.0, 0, 0), fm.L(l - 1.2, 0, 0), m.r * 0.95, m.r * 0.85, { dir: fm.fw, ratio: 0.85 }),
      ellipsoid(fm.L(l, 0, 0), [1.6, m.r * 1.3, m.r * 1.25], fm.axes),
      cone(fm.L(l - 0.5, -m.r * 0.9, 0), fm.L(l + 0.6, -m.r * 1.2, 0), 0.5, 0.45),             // 掌側の稜
    );
    reg({ id: 'MC' + m.d, ja: `第${m.d}中手骨`, la: `Os metacarpale ${['', 'I', 'II', 'III', 'IV', 'V'][m.d]}`, parent: 'RadialCarpal', joint: a, shape, h: m.d === 1 ? 0.15 : 0.22 });
    // 種子骨（第2〜5の掌側に2個ずつ）
    if (m.d >= 2) for (const sg of [1, -1]) {
      const c = add(add(b, mul(pf.fw, -m.r * 1.75)), mul(fm.sd, sg * m.r * 0.75));
      reg({ id: `SesF${m.d}${sg > 0 ? 'l' : 'm'}`, ja: `${names[m.d]}の近位種子骨（${sg > 0 ? '外側' : '内側'}）`, la: 'Os sesamoideum proximale', parent: 'MC' + m.d, joint: c, shape: ellipsoid(c, [1.5, 0.9, 0.8], fm.axes), h: 0.12 });
    }
    // 指
    const head = add(b, mul(fm.ax, 1.2));
    const splay = [0, 0, -0.14, -0.05, 0.05, 0.14][m.d];
    const fwd = [0, 0, 1];
    let dirP, dirM, lens;
    if (m.d === 1) {
      dirP = norm(add(fm.ax, [0, -0.2, 0.3])); dirM = dirP; lens = [5.5, 0, 5.0];
    } else {
      dirP = norm(rotate([0, -0.48, 0.88], [0, 1, 0], splay));
      dirM = norm(rotate([0, -0.12, 0.99], [0, 1, 0], splay * 1.3));
      lens = { 2: [9.5, 6.0, 6.5], 3: [11, 7, 7], 4: [11, 7, 7], 5: [9, 6, 6.2] }[m.d];
    }
    const bones = buildDigit({ name: 'F' + m.d, base: head, dirP, dirM, lens, r: m.d === 1 ? 1.0 : m.r * 0.92, side: 1, hasMiddle: m.d !== 1, prefix: '', region: 'forelimb', parentId: 'MC' + m.d, label: names[m.d] });
    for (const b2 of bones) reg({ ...b2, id: b2.id, h: b2.h ?? 0.15 });
  }
}

// 円柱を少し太らせる（関節のすきま）
function inflateCyl(c, r) { return { f: (x, y, z) => c.f(x, y, z) - r, lo: c.lo.map((v) => v - r), hi: c.hi.map((v) => v + r) }; }
