// 後肢：寛骨（腸骨・坐骨・恥骨）、大腿骨、膝蓋骨、ファベラ2、半月板2、脛骨、腓骨、足根骨7、中足骨5、趾骨、種子骨、爪
import { add, sub, mul, norm, cross, dot, len, lerp, frame, cone, ellipsoid, sphere, plate, tube, torus, smoothUnion, smoothSubtract, intersect, box } from './sdf.js';
import { ROM } from './landmarks.js';
import { buildDigit, rotate } from './forelimb.js';

export function buildHindlimb(api, lm) {
  const Hd = lm.hind;
  const H = Hd.hip, K = Hd.stifle, T = Hd.hock, MTP = Hd.mtp;
  const Sv = lm.vert.S;
  const reg = (d) => api.bone({ region: 'hindlimb', pair: true, ...d });

  // ---- 寛骨 ----
  {
    const W = [13.5, Sv.cr[1] + 4, Sv.cr[2] + 4];         // 腸骨翼の中ほど（仙腸関節の外側）
    const fi = frame(H, sub(W, H), [0, 1, 0], 1);
    const Li = len(sub(W, H));
    const iliumOutline = [[6, -3.8], [20, -4.2], [36, -5.0], [Li - 4, -7.5], [Li + 4, -4.5], [Li + 6, 1.5], [Li + 3, 7.5], [Li - 8, 8.5], [Li - 22, 5.0], [14, 4.0], [6, 4.0]];
    const I = add(H, [-5, 1, -42]);                         // 坐骨結節
    const P1 = [1.2, H[1] - 13, H[2] - 4];                  // 骨盤結合の頭側
    const P2 = [1.2, H[1] - 12, H[2] - 34];                 // 骨盤結合の尾側
    const e1 = norm(sub(I, H));
    let e2 = sub(lerp(P1, P2, 0.5), H); e2 = norm(sub(e2, mul(e1, dot(e2, e1))));
    const proj = (p) => { const d = sub(p, H); return [dot(d, e1), dot(d, e2)]; };
    const floorPts = [H, add(H, [-2, 5, -10]), add(I, [0, 3, 2]), add(I, [2, 1, -3]), add(I, [-3, -3, -2]), add(P2, [3, -1, -3]), add(P2, [-0.6, 0, 0]), add(P1, [-0.6, 0, 0]), add(P1, [4, 1, 5]), add(H, [-6, -6, 4])].map(proj);
    const parts = [
      plate(H, fi.ax, fi.fw, iliumOutline, 2.4, 1.0),                                       // 腸骨（体と翼）
      tube([fi.L(10, 4.2, 0), fi.L(Li - 6, 8.3, 0.2), fi.L(Li + 3, 7.0, 0.2)], [1.8, 1.6, 1.8], null, 0.8), // 腸骨の背側縁
      ellipsoid(fi.L(Li - 4, 1.0, -2.2), [8, 5.5, 2.4], fi.axes),                           // 耳状面（仙骨と関節する面）
      ellipsoid(fi.L(Li + 3.5, 3.0, 0), [2.5, 5.8, 2.2], fi.axes),                          // 腸骨稜
      ellipsoid(H, [8.8, 8.8, 8.8]),                                                       // 寛骨臼のまわり
      plate(H, e1, e2, floorPts, 2.2, 0.9),                                                // 坐骨と恥骨（骨盤の床）
      ellipsoid(add(I, [1, 0, 0]), [3.6, 3.4, 4.2]),                                        // 坐骨結節
      tube([add(H, [-1, 8, -2]), add(H, [-3, 7, -12]), add(H, [-4, 4, -20])], [1.8, 1.4, 1.0], null, 0.8), // 坐骨棘
      cone(add(P1, [-0.6, 0, 0]), add(P2, [-0.6, 0, 0]), 1.8, 1.6),                          // 骨盤結合のふち
      ellipsoid(add(H, [-3, -5, 9]), [2.2, 2.2, 3.2]),                                       // 腸恥隆起
    ];
    let cox = smoothUnion(1.1, ...parts);
    const obt = lerp(lerp(H, I, 0.45), lerp(P1, P2, 0.5), 0.5);
    cox = smoothSubtract(0.6, cox,
      sphere(add(H, [5.2, -0.5, 0]), 7.4),                                                // 寛骨臼（外を向いたくぼみ）
      sphere(add(H, [4.5, -6.5, -1]), 2.8),                                               // 寛骨臼切痕
      ellipsoid(obt, [5.5, 4.8, 9.0], [norm(cross(e1, e2)), e2, e1]),                     // 閉鎖孔
    );
    lm.F ||= {};
    Object.assign(lm.F, { ilium: fi, Li, W, I, P1, P2 });
    reg({ id: 'OsCoxae', ja: '寛骨（腸骨・坐骨・恥骨）', la: 'Os coxae', parent: 'S', joint: W, shape: cox, h: 0.42 });
  }

  // ---- 大腿骨 ----
  const Lf = len(sub(K, H));
  const ff = frame(H, sub(K, H), [0, 0, 1], 1);
  Object.assign(lm.F, { fem: ff, Lf });
  {
    const { L } = ff;
    const parts = [
      sphere(H, 6.3),                                                                       // 大腿骨頭
      cone(H, L(7.5, 0.3, 6.8), 4.0, 4.6),                                                 // 大腿骨頸
      ellipsoid(L(-1.0, -0.6, 9.6), [5.2, 4.2, 3.0], ff.axes),                             // 大転子
      ellipsoid(L(14, -3.6, 3.0), [3.2, 2.3, 2.2], ff.axes),                               // 小転子
      tube([L(7, 0, 7), L(18, 0.6, 5.0), L(45, 1.0, 2.6), L(Lf - 20, 0.4, 0.4)], [5.0, 4.4, 4.0, 4.4], null, 1.2), // 骨幹
      cone(L(Lf - 22, 0.2, 0.2), L(Lf - 6, -0.6, 0), 4.3, 6.8, { dir: ff.fw, ratio: 0.75 }),
      ellipsoid(L(Lf - 2.5, -2.2, -5.0), [5.4, 5.0, 3.9], ff.axes),                        // 内側顆
      ellipsoid(L(Lf - 2.5, -2.2, 5.0), [5.4, 5.0, 3.9], ff.axes),                         // 外側顆
      ellipsoid(L(Lf - 5.5, 3.0, 0), [6.5, 3.0, 5.6], ff.axes),                            // 滑車（膝蓋骨がすべる面）
      ellipsoid(L(Lf - 6, -1, -7.6), [3, 2.5, 1.8], ff.axes),                              // 内側上顆
      ellipsoid(L(Lf - 6, -1, 7.6), [3, 2.5, 1.8], ff.axes),                               // 外側上顆
    ];
    const fem = smoothSubtract(0.5, smoothUnion(1.0, ...parts),
      ellipsoid(L(2.5, -3.8, 7.0), [3.2, 2.2, 2.2], ff.axes),                              // 転子窩
      ellipsoid(L(Lf + 0.5, -3.8, 0), [5.5, 3.6, 1.9], ff.axes),                           // 顆間窩
      cone(L(Lf - 12, 6.2, 0), L(Lf + 0.5, 5.4, 0), 1.6, 1.6),                             // 滑車溝
      sphere(add(H, mul(ff.sd, -5.8)), 1.3),                                               // 大腿骨頭窩
    );
    reg({ id: 'Femur', ja: '大腿骨', la: 'Femur', parent: 'OsCoxae', joint: H, shape: fem, h: 0.4, rom: { joint: '股関節', ...ROM.hip } });
    reg({ id: 'Patella', ja: '膝蓋骨（膝のお皿）', la: 'Patella', parent: 'Femur', joint: L(Lf - 6.5, 7.6, 0),
      shape: smoothUnion(0.6, ellipsoid(L(Lf - 6.5, 7.6, 0), [6.2, 2.5, 4.0], ff.axes), cone(L(Lf - 4, 7.4, 0), L(Lf + 1.5, 6.8, 0), 2.2, 1.0, { dir: ff.fw, ratio: 0.6 })), h: 0.2 });
    for (const [sg, nm] of [[1, '外側'], [-1, '内側']]) {
      const c = L(Lf - 7.5, -6.8, sg * 4.6);
      reg({ id: sg > 0 ? 'FabellaL' : 'FabellaM', ja: `ファベラ（腓腹筋種子骨・${nm}）`, la: 'Os sesamoideum m. gastrocnemii', parent: 'Femur', joint: c, shape: ellipsoid(c, sg > 0 ? [2.4, 1.7, 1.6] : [2.0, 1.5, 1.4], ff.axes), h: 0.14 });
    }
  }

  // ---- 脛骨・腓骨・半月板 ----
  const Lt = len(sub(T, K));
  const ft = frame(K, sub(T, K), [0, 0, 1], 1);
  Object.assign(lm.F, { tib: ft, Lt });
  {
    const { L } = ft;
    const parts = [
      ellipsoid(L(3.0, -0.5, 0), [3.8, 7.0, 10.0], ft.axes),                               // 脛骨の上の面（顆）
      ellipsoid(L(5.5, 7.2, 0.5), [4.5, 2.6, 3.0], ft.axes),                               // 脛骨粗面
      tube([L(6, 7.0, 0.5), L(28, 4.6, 0), L(46, 3.0, -0.5)], [1.6, 1.3, 0.7], null, 0.8), // 脛骨稜
      tube([L(6, 0, 0), L(Lt * 0.5, 1.0, -0.6), L(Lt - 9, 0.4, -1.4)], [5.0, 3.5, 3.7], null, 1.4), // 骨幹
      ellipsoid(L(Lt - 3.6, 0, -0.6), [4.2, 5.0, 6.8], ft.axes),                           // 遠位端
      ellipsoid(L(Lt + 0.4, 0.4, -6.4), [3.2, 2.6, 2.0], ft.axes),                         // 内果
      ellipsoid(L(4.0, -5.0, 0), [2.5, 2.4, 3.0], ft.axes),                                // 膝窩切痕のふち
    ];
    const tib = smoothSubtract(0.5, smoothUnion(1.0, ...parts),
      ...[2.4, -2.4].map((s) => ellipsoid(L(Lt + 2.6, 0, s), [2.6, 5.2, 1.7], ft.axes)),   // 脛骨のらせん（距骨滑車を受ける溝）
      ...[4.2, -4.2].map((s) => ellipsoid(L(-1.2, -0.5, s), [1.6, 4.5, 3.5], ft.axes)),     // 関節面の浅いくぼみ
    );
    reg({ id: 'Tibia', ja: '脛骨', la: 'Tibia', parent: 'Femur', joint: K, shape: tib, h: 0.4, rom: { joint: '膝関節', ...ROM.stifle } });
    const fib = smoothUnion(0.8,
      ellipsoid(L(6.5, -2.4, 9.6), [3.0, 2.6, 2.4], ft.axes),                              // 腓骨頭
      tube([L(8, -2.2, 9.6), L(Lt * 0.5, -1.6, 7.6), L(Lt - 5, -0.6, 7.2)], [1.6, 1.0, 1.4], null, 0.6),
      ellipsoid(L(Lt + 0.6, -0.6, 7.6), [3.6, 2.6, 2.0], ft.axes),                         // 外果
    );
    reg({ id: 'Fibula', ja: '腓骨', la: 'Fibula', parent: 'Tibia', joint: K, shape: fib, h: 0.3 });
    // 半月板（三日月形の軟骨）
    for (const [sg, nm] of [[1, '外側'], [-1, '内側']]) {
      const c = L(-0.4, -0.5, sg * 4.6);
      const ring = torus(c, ft.ax, 3.3, 1.0);
      const men = smoothSubtract(0.3, intersect(ring, box(c, [0.9, 6, 6], ft.axes, 0)), sphere(L(-0.4, -0.5, 0), 2.6));
      reg({ id: sg > 0 ? 'MeniscusL' : 'MeniscusM', ja: `${nm}半月板`, la: `Meniscus ${sg > 0 ? 'lateralis' : 'medialis'}`, parent: 'Tibia', joint: c, shape: men, mat: 'cartilage', h: 0.15 });
    }
  }

  // ---- 足根骨・中足骨・趾 ----
  const Ltar = len(sub(MTP, T));
  const pf = frame(T, sub(MTP, T), [0, 0, 1], 1);
  const { L } = pf;
  Object.assign(lm.F, { pes: pf, Ltar });
  {
    const talus = smoothSubtract(0.4, smoothUnion(0.8,
      ellipsoid(L(1.4, 1.0, 0), [3.2, 4.6, 4.4], pf.axes),                                 // 距骨滑車
      cone(L(3, 1.2, -0.4), L(6.8, 2.0, -1.4), 3.0, 2.6),                                  // 距骨頸
      ellipsoid(L(7.0, 2.0, -1.4), [2.2, 2.8, 2.8], pf.axes),                              // 距骨頭
    ), ellipsoid(L(-1.6, 1.0, 0), [2.4, 5.5, 1.1], pf.axes));                              // 滑車の溝
    reg({ id: 'Talus', ja: '距骨', la: 'Talus', parent: 'Tibia', joint: T, shape: talus, h: 0.2, rom: { joint: '足根関節', ...ROM.tarsus } });
    const calc = smoothUnion(0.9,
      ellipsoid(L(4.8, -2.4, 3.0), [3.8, 3.0, 2.6], pf.axes),
      tube([L(4, -3.6, 3.0), L(-6, -6.5, 2.8), L(-16, -9.4, 2.5)], [2.7, 2.5, 2.9], { dir: pf.sd, ratio: 0.8 }, 0.8), // 踵骨隆起へのびる部分
      ellipsoid(L(-17.4, -9.8, 2.5), [2.6, 3.4, 3.0], pf.axes),                            // 踵骨隆起（かかとの先）
      ellipsoid(L(3.0, -1.4, -2.0), [2.4, 1.8, 2.2], pf.axes),                             // 載距突起
      ellipsoid(L(8.8, -1.6, 3.3), [1.8, 2.2, 2.0], pf.axes),
    );
    reg({ id: 'Calcaneus', ja: '踵骨（かかとの骨）', la: 'Calcaneus', parent: 'Talus', joint: L(4.8, -2.4, 3.0), shape: calc, h: 0.22 });
    const tars = [
      { id: 'CentralTarsal', ja: '中心足根骨', la: 'Os tarsi centrale', c: [9.4, 1.6, -1.2], r: [1.9, 3.4, 3.3] },
      { id: 'Tarsal1', ja: '第1足根骨', la: 'Os tarsale I', c: [13.0, -0.6, -4.4], r: [1.6, 2.0, 1.3] },
      { id: 'Tarsal2', ja: '第2足根骨', la: 'Os tarsale II', c: [13.0, 1.6, -2.6], r: [1.4, 2.4, 1.3] },
      { id: 'Tarsal3', ja: '第3足根骨', la: 'Os tarsale III', c: [13.1, 1.6, 0.2], r: [1.6, 2.6, 1.6] },
      { id: 'Tarsal4', ja: '第4足根骨', la: 'Os tarsale IV', c: [11.0, 0.4, 3.6], r: [4.2, 2.8, 2.1] },
    ];
    for (const t of tars) {
      const c = L(...t.c);
      reg({ id: t.id, ja: t.ja, la: t.la, parent: 'Talus', joint: c, shape: ellipsoid(c, t.r, pf.axes), h: 0.16 });
    }
  }
  const MT = [
    { d: 2, base: [15.0, 1.2, -2.9], head: [Ltar - 1.6, -0.2, -4.6], r: 1.4 },
    { d: 3, base: [15.0, 1.3, -0.9], head: [Ltar, 0, -1.5], r: 1.55 },
    { d: 4, base: [15.0, 1.1, 1.2], head: [Ltar, 0, 1.6], r: 1.55 },
    { d: 5, base: [15.0, 0.6, 3.4], head: [Ltar - 2.0, -0.2, 4.6], r: 1.4 },
  ];
  // 第1中足骨（小さななごり）
  {
    const c = L(16.5, -1.2, -5.0);
    reg({ id: 'MT1', ja: '第1中足骨（なごり）', la: 'Os metatarsale I', parent: 'Talus', joint: c, shape: smoothUnion(0.5, ellipsoid(c, [2.6, 1.3, 1.1], pf.axes), sphere(L(18.5, -1.6, -5.4), 0.8)), h: 0.12 });
  }
  const names = ['', '', '第2趾', '第3趾', '第4趾', '第5趾'];
  for (const m of MT) {
    const a = L(...m.base), b = L(...m.head);
    const fm = frame(a, sub(b, a), pf.fw, 1);
    const l = len(sub(b, a));
    reg({ id: 'MT' + m.d, ja: `第${m.d}中足骨`, la: `Os metatarsale ${['', '', 'II', 'III', 'IV', 'V'][m.d]}`, parent: 'Talus', joint: a, h: 0.24,
      shape: smoothUnion(0.7,
        ellipsoid(fm.L(1.4, 0, 0), [1.8, m.r * 1.5, m.r * 1.3], fm.axes),
        cone(fm.L(1.2, 0, 0), fm.L(l - 1.2, 0, 0), m.r * 0.95, m.r * 0.82, { dir: fm.fw, ratio: 0.85 }),
        ellipsoid(fm.L(l, 0, 0), [1.6, m.r * 1.3, m.r * 1.2], fm.axes),
        cone(fm.L(l - 0.5, -m.r * 0.9, 0), fm.L(l + 0.6, -m.r * 1.2, 0), 0.5, 0.45),
      ) });
    for (const sg of [1, -1]) {
      const c = add(add(b, mul(pf.fw, -m.r * 1.75)), mul(fm.sd, sg * m.r * 0.75));
      reg({ id: `SesH${m.d}${sg > 0 ? 'l' : 'm'}`, ja: `${names[m.d]}の近位種子骨（${sg > 0 ? '外側' : '内側'}）`, la: 'Os sesamoideum proximale', parent: 'MT' + m.d, joint: c, shape: ellipsoid(c, [1.5, 0.9, 0.8], fm.axes), h: 0.12 });
    }
    const head = add(b, mul(fm.ax, 1.2));
    const splay = [0, 0, -0.12, -0.04, 0.04, 0.12][m.d];
    const dirP = norm(rotate([0, -0.5, 0.87], [0, 1, 0], splay));
    const dirM = norm(rotate([0, -0.12, 0.99], [0, 1, 0], splay * 1.3));
    const lens = { 2: [10.5, 6.5, 6.5], 3: [12, 7.5, 7], 4: [12, 7.5, 7], 5: [10.5, 6.5, 6.5] }[m.d];
    const bones = buildDigit({ name: 'H' + m.d, base: head, dirP, dirM, lens, r: m.r * 0.92, side: 1, prefix: '', parentId: 'MT' + m.d, label: names[m.d] });
    for (const b2 of bones) reg({ ...b2, h: b2.h ?? 0.15 });
  }
}
