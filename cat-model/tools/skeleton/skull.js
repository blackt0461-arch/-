// 頭：頭骨、下顎骨（左右）、歯30本、舌骨装置、耳小骨（ツチ骨・キヌタ骨・アブミ骨）
// 猫の歯式：上 I3 C1 P3 M1 ／ 下 I3 C1 P2 M1（片側15本 × 2 = 30本）
import { add, sub, mul, norm, cross, cone, ellipsoid, sphere, plate, tube, torus, smoothUnion, smoothSubtract, spline, union } from './sdf.js';
import { buildCranium, buildJaw } from './skull_core.js';

export function buildSkull(api, lm) {
  const O = lm.fit ? lm.fit.skull.O : lm.occiput.p; // 後頭顆のあいだ（頭の回転の中心）
  const u = norm(lm.fit ? lm.fit.skull.u : [0, -0.12, 0.99]); // 鼻先の向き
  const v = norm(cross(u, [1, 0, 0]));            // 頭のてっぺんの向き
  const w = [1, 0, 0];                             // 左
  const AX = [u, v, w];
  const Q = (a, b, c = 0) => add(O, add(mul(u, a), add(mul(v, b), mul(w, c))));
  const E = (a, b, c, r) => ellipsoid(Q(a, b, c), r, AX);
  lm.F ||= {};
  lm.F.Q = Q; lm.F.skullAxes = AX;
  const both = (fn) => [1, -1].flatMap((s) => [].concat(fn(s)));

  // ---- 頭骨（成長すると癒合する多くの骨をひとつにまとめる） ----
  // 形は解剖書の図（横・上・下）からなぞったデータで作る（skull_core.js）
  {
    const cr = buildCranium(Q, AX);
    const skull = cr.skull;
    lm.F.cranium = cr;
    api.bone({ id: 'Skull', ja: '頭蓋（頭骨）', la: 'Cranium', region: 'skull', parent: 'C1', joint: O, shape: skull, h: 0.42,
      rom: { joint: '環椎後頭関節（うなずく動き）', flexion: 0, extension: 0 } });
  }

  // ---- 下顎骨（左右）と歯：解剖書の図 36・40 から（skull_core.js の buildJaw） ----
  const jaw = buildJaw(Q, AX);
  const condyle = jaw.condyle;
  api.bone({ id: 'Mandible', pair: true, ja: '下顎骨', la: 'Mandibula', region: 'skull', parent: 'Skull', joint: condyle(1), shape: jaw.mandible, h: 0.3,
    rom: { joint: '顎関節', flexion: 0, extension: 0 } });
  for (const [list, jw] of [[jaw.upper, 'U'], [jaw.lower, 'L']]) for (const t of list) {
    api.bone({ id: t.id, pair: true, ja: t.ja, la: 'Dens', region: 'skull', parent: jw === 'U' ? 'Skull' : 'Mandible', joint: jw === 'U' ? O : condyle(1),
      shape: t.shape, mat: 'tooth', h: 0.14 });
  }
  lm.F.jaw = jaw;

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
