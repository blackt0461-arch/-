// 頭：頭骨、下顎骨（左右）、歯30本、舌骨装置、耳小骨（ツチ骨・キヌタ骨・アブミ骨）
// 猫の歯式：上 I3 C1 P3 M1 ／ 下 I3 C1 P2 M1（片側15本 × 2 = 30本）
import { add, sub, mul, norm, cross, cone, ellipsoid, sphere, plate, tube, torus, smoothUnion, smoothSubtract, spline, union } from './sdf.js';

export function buildSkull(api, lm) {
  const O = lm.occiput.p;                          // 後頭顆のあいだ（頭の回転の中心）
  const u = norm([0, -0.12, 0.99]);                // 鼻先の向き
  const v = norm(cross(u, [1, 0, 0]));            // 頭のてっぺんの向き
  const w = [1, 0, 0];                             // 左
  const AX = [u, v, w];
  const Q = (a, b, c = 0) => add(O, add(mul(u, a), add(mul(v, b), mul(w, c))));
  const E = (a, b, c, r) => ellipsoid(Q(a, b, c), r, AX);
  lm.F ||= {};
  lm.F.Q = Q; lm.F.skullAxes = AX;
  const both = (fn) => [1, -1].flatMap((s) => [].concat(fn(s)));

  // ---- 頭骨（成長すると癒合する多くの骨をひとつにまとめる） ----
  {
    const parts = [
      E(23, 13, 0, [23, 17.5, 20]),                // 脳頭蓋（丸い）
      E(4, 14, 0, [5, 12, 17]),                    // 後頭部
      E(46, 18.5, 0, [12, 10, 12]),                // 前頭部（両目のあいだ・眼窩後部）
      E(24, 2, 0, [22, 5, 13]),                    // 頭蓋底
      E(68, 9, 0, [17, 9.5, 15.5]),                // 上顎と鼻づら
      E(81, 6.5, 0, [8, 8, 11]),                   // 鼻づらの先
      tube([Q(50, 25, 0), Q(66, 20.5, 0), Q(85, 14, 0)], [6, 6.5, 5], { dir: v, ratio: 0.55 }, 1.5), // 鼻背（鼻骨）
      E(84, 2.5, 0, [4, 6, 8.5]),                  // 切歯骨
      E(66, -1.2, 0, [21, 2.4, 14]),               // 硬口蓋
      tube([Q(4, 27, 0), Q(18, 30.8, 0), Q(32, 31.2, 0), Q(42, 29, 0)], [1.0, 1.2, 1.0, 0.5], { dir: w, ratio: 0.6 }, 0.8), // 矢状稜（猫では低い）
      ...both((s) => [
        E(14, -3, s * 11, [9.5, 7, 7.5]),                                                    // 鼓室胞（大きく丸い）
        E(-0.5, 3.8, s * 7.5, [3.6, 6.0, 3.0]),                                              // 後頭顆
        E(3, 0.5, s * 12.5, [2.5, 3.5, 2.5]),                                                // 傍顆突起
        E(12, 2.5, s * 18.5, [2.6, 3.0, 2.0]),                                               // 乳様突起
        tube([Q(3, 12, s * 18), Q(4, 22, s * 11), Q(5, 27.5, 0)], [1.3, 1.4, 1.2], null, 0.8), // 項稜
        tube(spline([Q(20, 2.5, s * 17.5), Q(31, 3.5, s * 27.5), Q(45, 5.5, s * 32), Q(56, 7.0, s * 29.5), Q(63.5, 8.5, s * 21.5)], 3), [2.4, 2.8, 3.0, 3.1, 3.6], { dir: w, ratio: 0.55 }, 2.0), // 頬骨弓
        E(19.5, 2.2, s * 16, [5, 3, 3.5]),                                                   // 頬骨弓のつけね（側頭骨）
        E(62, 6.5, s * 18, [5, 4, 4]),                                                       // 頬骨弓の前のつけね（上顎・涙骨）
        E(21, -0.6, s * 18.5, [1.6, 2.2, 3.4]),                                              // 関節後突起
        cone(Q(49, 24.5, s * 11), Q(53, 20.5, s * 17.5), 2.4, 0.9),                          // 前頭骨の眼窩後突起
        cone(Q(55.5, 7.5, s * 29.5), Q(54, 15.5, s * 25.5), 2.2, 0.9),                       // 頬骨の前頭突起
        E(38, -3.5, s * 5.5, [2.5, 2.2, 1.0]),                                               // 翼突鉤
        E(60, 2, s * 14, [10, 5.5, 6]),                                                      // 歯槽のふくらみ（臼歯）
        E(79, 0.5, s * 9, [4, 6, 3.4]),                                                      // 犬歯のふくらみ
      ]),
    ];
    let skull = smoothUnion(2.0, ...parts);
    skull = smoothSubtract(1.0, skull,
      E(23, 13.5, 0, [20.5, 15, 17.8]),                                                      // 頭蓋腔（脳が入る空間）
      E(-3, 8, 0, [5, 5.8, 5.6]),                                                            // 大後頭孔
      E(87.5, 9.5, 0, [5, 6.5, 5.5]),                                                        // 鼻の穴（梨状口）
      tube([Q(84, 9, 0), Q(70, 9, 0), Q(52, 6, 0)], [4.5, 6, 3.5], { dir: w, ratio: 0.7 }, 1.0), // 鼻腔
      E(41, 1.5, 0, [5, 2.6, 4.5]),                                                          // 後鼻孔
      ...both((s) => [
        sphere(Q(53, 15, s * 18), 11),                                                       // 眼窩（大きい）
        cone(Q(21.5, -2.2, s * 13), Q(21.5, -2.2, s * 23), 2.7, 2.7),                        // 下顎窩（顎関節のくぼみ）
        cone(Q(16, 0.5, s * 15), Q(16, 0.5, s * 21), 2.2, 2.2),                              // 外耳道
        cone(Q(60, 8, s * 15.5), Q(70, 8, s * 15.0), 1.3, 1.3),                              // 眼窩下孔
        E(84, -2.2, s * 2.5, [3, 1.0, 1.0]),                                                 // 切歯孔
      ]),
    );
    api.bone({ id: 'Skull', ja: '頭蓋（頭骨）', la: 'Cranium', region: 'skull', parent: 'C1', joint: O, shape: skull, h: 0.42,
      rom: { joint: '環椎後頭関節（うなずく動き）', flexion: 0, extension: 0 } });
  }

  // ---- 下顎骨（左右） ----
  const condyle = (s) => Q(21.5, -2.2, s * 18);
  {
    const s = 1;
    const parts = [
      tube(spline([Q(83, -9.5, 3.4), Q(74, -11, 8), Q(60, -11.2, 12), Q(46, -10.4, 14.8), Q(33, -9.0, 16.5)], 3), [3.6, 4.4, 4.6, 4.2, 3.8], { dir: w, ratio: 0.42 }, 1.0), // 下顎体
      plate(Q(0, 0, 16.6), u, v, [[47, -8], [36, -8.5], [27.5, -6], [25.5, 7], [28.5, 17.5], [33, 19.5], [38.5, 13], [44, 1]], 1.7, 0.7), // 筋突起（側頭筋がつく）
      tube([Q(32, -7, 17), Q(25.5, -4.5, 17.6), Q(22.5, -2.4, 18)], [2.6, 2.4, 2.4], { dir: w, ratio: 0.6 }, 0.8), // 関節突起の首
      cone(Q(21.5, -2.2, 13.8), Q(21.5, -2.2, 22.2), 2.35, 2.35),                                // 下顎頭（横長の円柱）
      tube([Q(30, -10, 16.6), Q(24, -10.6, 16.8), Q(20.5, -10.2, 16.9)], [2.4, 1.8, 1.3], { dir: w, ratio: 0.6 }, 0.6), // 角突起
      E(82.5, -8, 1.8, [3.2, 4.0, 1.6]),                                                     // 下顎結合
    ];
    let mand = smoothUnion(1.2, ...parts);
    mand = smoothSubtract(0.6, mand,
      E(36, 0, 19.0, [8, 8, 1.1]),                                                           // 咬筋窩
      cone(Q(74, -8.6, 10.6), Q(73, -8.8, 7.6), 0.7, 0.7),                                   // オトガイ孔
      cone(Q(66, -8.6, 13.2), Q(65, -8.8, 10.4), 0.55, 0.55),
      cone(Q(31, -1, 13), Q(31, -1, 20), 1.0, 1.0),                                          // 下顎孔（内側）
    );
    api.bone({ id: 'Mandible', pair: true, ja: '下顎骨', la: 'Mandibula', region: 'skull', parent: 'Skull', joint: condyle(s), shape: mand, h: 0.32,
      rom: { joint: '顎関節', flexion: 0, extension: 0 } });
  }

  // ---- 歯 ----
  // 歯をひとつ作る：base=歯ぐきの位置、tip=先、r=根元の太さ、root=根の長さ
  const tooth = (base, tip, r, root, flatDir = w, ratio = 0.75) => {
    const dir = norm(sub(tip, base));
    const rootEnd = sub(base, mul(dir, root));
    return smoothUnion(0.5,
      cone(rootEnd, base, r * 0.55, r, { dir: flatDir, ratio }),
      cone(base, tip, r, 0.18, { dir: flatDir, ratio }),
    );
  };
  // 刃のような臼歯：いくつかのとがり（咬頭）をもつ
  const blade = (center, len, height, cusps, down = -1, rootDepth = 5, width = 1.8) => {
    const parts = [E(center[0], center[1], center[2], [len / 2, 1.6, width])];
    for (const [da, h, r] of cusps) parts.push(cone(Q(center[0] + da, center[1], center[2]), Q(center[0] + da * 1.05, center[1] + down * h, center[2]), r, 0.25, { dir: w, ratio: 0.55 }));
    // 根（2本）
    for (const da of [-len * 0.3, len * 0.3]) parts.push(cone(Q(center[0] + da, center[1], center[2]), Q(center[0] + da * 1.1, center[1] - down * rootDepth, center[2]), 1.3, 0.6));
    return smoothUnion(0.7, ...parts);
  };
  const teeth = [];
  // 上顎（片側）
  teeth.push(
    { id: 'UI1', ja: '上顎第1切歯', jaw: 'U', shape: (s) => tooth(Q(86.4, -1.6, s * 1.3), Q(86.8, -5.0, s * 1.3), 0.75, 4) },
    { id: 'UI2', ja: '上顎第2切歯', jaw: 'U', shape: (s) => tooth(Q(86.0, -1.6, s * 3.2), Q(86.4, -5.2, s * 3.3), 0.85, 4) },
    { id: 'UI3', ja: '上顎第3切歯', jaw: 'U', shape: (s) => tooth(Q(84.8, -1.6, s * 5.6), Q(85.0, -6.4, s * 5.8), 1.15, 5) },
    { id: 'UC', ja: '上顎犬歯', jaw: 'U', shape: (s) => smoothUnion(0.6, tooth(Q(78.6, -1.6, s * 9.0), Q(78.0, -7.0, s * 9.2), 2.3, 12), cone(Q(78.0, -7.0, s * 9.2), Q(76.8, -12.5, s * 9.3), 1.75, 0.2, { dir: w, ratio: 0.75 })) },
    { id: 'UP2', ja: '上顎第2前臼歯', jaw: 'U', shape: (s) => tooth(Q(73.2, -2.4, s * 11.2), Q(73.2, -4.6, s * 11.2), 0.9, 3) },
    { id: 'UP3', ja: '上顎第3前臼歯', jaw: 'U', shape: (s) => blade([68.2, -3.4, s * 13.4], 7.2, 0, [[-2.6, 2.4, 1.0], [0, 5.4, 1.7], [2.6, 2.6, 1.0]]) },
    { id: 'UP4', ja: '上顎第4前臼歯（裂肉歯）', jaw: 'U', shape: (s) => smoothUnion(0.6, blade([59.2, -3.8, s * 16.0], 11, 0, [[3.8, 3.4, 1.2], [1.0, 6.2, 2.0], [-3.4, 4.6, 1.7]], -1, 6, 2.2), cone(Q(61.8, -3.6, s * 13.0), Q(62, -6.0, s * 13.2), 1.5, 0.4)) },
    { id: 'UM1', ja: '上顎第1後臼歯', jaw: 'U', shape: (s) => smoothUnion(0.5, E(53.6, -4.2, s * 13.2, [1.1, 1.2, 2.6]), cone(Q(53.6, -4.2, s * 13.2), Q(53.6, -0.5, s * 13.2), 0.9, 0.5)) },
  );
  // 下顎（片側）
  teeth.push(
    { id: 'LI1', ja: '下顎第1切歯', jaw: 'L', shape: (s) => tooth(Q(84.4, -6.0, s * 1.1), Q(84.9, -2.8, s * 1.1), 0.65, 4) },
    { id: 'LI2', ja: '下顎第2切歯', jaw: 'L', shape: (s) => tooth(Q(84.1, -6.0, s * 2.7), Q(84.6, -2.6, s * 2.8), 0.7, 4) },
    { id: 'LI3', ja: '下顎第3切歯', jaw: 'L', shape: (s) => tooth(Q(83.6, -6.0, s * 4.4), Q(84.1, -2.4, s * 4.5), 0.8, 4) },
    { id: 'LC', ja: '下顎犬歯', jaw: 'L', shape: (s) => smoothUnion(0.6, tooth(Q(81.0, -6.2, s * 7.3), Q(81.6, -1.0, s * 7.4), 2.1, 11), cone(Q(81.6, -1.0, s * 7.4), Q(81.0, 3.8, s * 7.6), 1.6, 0.2, { dir: w, ratio: 0.75 })) },
    { id: 'LP3', ja: '下顎第3前臼歯', jaw: 'L', shape: (s) => blade([66.6, -6.8, s * 11.2], 7, 0, [[-2.5, 2.2, 1.0], [0.2, 4.6, 1.6], [2.6, 2.0, 0.9]], 1) },
    { id: 'LP4', ja: '下顎第4前臼歯', jaw: 'L', shape: (s) => blade([59.2, -7.0, s * 12.8], 8, 0, [[-2.8, 2.6, 1.1], [0.2, 5.2, 1.8], [2.9, 2.4, 1.0]], 1) },
    { id: 'LM1', ja: '下顎第1後臼歯（裂肉歯）', jaw: 'L', shape: (s) => blade([50.6, -7.0, s * 14.2], 9.5, 0, [[2.8, 5.0, 1.8], [-2.4, 5.6, 1.9]], 1, 6, 2.0) },
  );
  for (const t of teeth) {
    api.bone({ id: t.id, pair: true, ja: t.ja, la: 'Dens', region: 'skull', parent: t.jaw === 'U' ? 'Skull' : 'Mandible', joint: t.jaw === 'U' ? O : condyle(1),
      shape: t.shape(1), mat: 'tooth', h: 0.14 });
  }

  // ---- 舌骨装置 ----
  {
    const base = Q(5, -24, 0);
    api.bone({ id: 'Basihyoid', ja: '底舌骨', la: 'Basihyoideum', region: 'skull', parent: 'Skull', joint: base, shape: cone(Q(5, -24, -4.5), Q(5, -24, 4.5), 1.3, 1.3, { dir: v, ratio: 0.7 }), h: 0.15 });
    const chain = [
      { id: 'Thyrohyoid', ja: '甲状舌骨', la: 'Thyrohyoideum', a: Q(5, -24, 4.3), b: Q(-6, -23, 7.5), r: 0.9 },
      { id: 'Ceratohyoid', ja: '角舌骨', la: 'Ceratohyoideum', a: Q(5.5, -23.5, 4.6), b: Q(9, -19, 6.2), r: 0.8 },
      { id: 'Epihyoid', ja: '上舌骨', la: 'Epihyoideum', a: Q(9.2, -18.6, 6.3), b: Q(13, -12.5, 8.2), r: 0.75 },
      { id: 'Stylohyoid', ja: '茎突舌骨', la: 'Stylohyoideum', a: Q(13.2, -12.0, 8.3), b: Q(14.5, -5.5, 10.0), r: 0.7 },
    ];
    let parent = 'Basihyoid';
    for (const c of chain) {
      api.bone({ id: c.id, pair: true, ja: c.ja, la: c.la, region: 'skull', parent: c.id === 'Thyrohyoid' ? 'Basihyoid' : parent, joint: c.a,
        shape: smoothUnion(0.4, cone(c.a, c.b, c.r, c.r * 0.85), sphere(c.b, c.r * 1.1)), h: 0.12 });
      if (c.id !== 'Thyrohyoid') parent = c.id;
    }
  }

  // ---- 耳小骨（鼓室胞の中） ----
  {
    const parts = [
      { id: 'Malleus', ja: 'ツチ骨', la: 'Malleus', shape: smoothUnion(0.3, ellipsoid(Q(16, 0.6, 14.2), [0.9, 1.1, 0.8], AX), cone(Q(16, 0.4, 14.2), Q(16.8, -2.6, 14.8), 0.35, 0.18)) },
      { id: 'Incus', ja: 'キヌタ骨', la: 'Incus', shape: smoothUnion(0.3, ellipsoid(Q(14.8, 1.4, 13.6), [0.8, 0.8, 0.7], AX), cone(Q(14.8, 1.3, 13.6), Q(14.4, -0.4, 13.0), 0.3, 0.2)) },
      { id: 'Stapes', ja: 'アブミ骨', la: 'Stapes', shape: smoothSubtract(0.1, smoothUnion(0.2, cone(Q(14.4, -0.4, 12.9), Q(14.6, -0.2, 11.4), 0.35, 0.5, { dir: v, ratio: 0.5 })), ellipsoid(Q(14.5, -0.3, 12.1), [0.2, 0.15, 0.4], AX)) },
    ];
    for (const p of parts) api.bone({ id: p.id, pair: true, ja: p.ja, la: p.la, region: 'skull', parent: 'Skull', joint: O, shape: p.shape, h: 0.06 });
  }
}
