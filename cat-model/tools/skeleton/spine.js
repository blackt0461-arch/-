// 脊椎（頸椎・胸椎・腰椎・仙骨・尾椎）、椎間板、血道弓
import { add, mul, sub, norm, cone, ellipsoid, box, plate, sphere, smoothUnion, union, subtract, smoothSubtract, intersect, deg } from './sdf.js';

// 椎骨の局所座標。a=頭の向き、d=背中の向き、s=左(+)
function local(v) {
  const l = [1, 0, 0];
  const P = (a, d = 0, s = 0) => add(v.c, add(mul(v.t, a), add(mul(v.u, d), mul(l, s))));
  const D = (a, d, s) => norm(add(mul(v.t, a), add(mul(v.u, d), mul(l, s))));
  return { P, D, axes: [v.t, v.u, l] };
}

// 椎体：平らな両端をもつ楕円の柱
function body(v, L, hw, hh, P, waist = 0.9) {
  const half = L / 2;
  const core = smoothUnion(0.8,
    cone(P(-half - 2, 0, 0), P(half + 2, 0, 0), hw, hw, { dir: v.u, ratio: hh / hw }),
  );
  const slab = box(v.c, [half, hh * 3, hw * 3], [v.t, v.u, [1, 0, 0]], 0);
  let b = intersect(core, slab, 0.7);
  // まん中が少しくびれる
  if (waist < 1) b = smoothSubtract(1.2, b, ellipsoid(P(0, -hh * 1.05, 0), [half * 0.75, hh * (1 - waist) * 2.2 + 0.4, hw * 1.4], [v.t, v.u, [1, 0, 0]]));
  return b;
}

// 一般的な椎骨
export function vertebra(v, o) {
  const { P, D } = local(v);
  const L = v.L, h = L / 2;
  const parts = [];
  parts.push(body(v, L, o.bw, o.bh, P, o.waist ?? 0.9));
  const canalY = o.bh + o.ch * 0.85;
  // 椎弓（脊髄の通る輪）
  const archLen = h * (o.archFrac ?? 0.82);
  parts.push(cone(P(-archLen, canalY, 0), P(archLen, canalY, 0), o.cw + o.wall, o.cw + o.wall, { dir: v.u, ratio: (o.ch + o.wall) / (o.cw + o.wall) }));
  const top = canalY + o.ch + o.wall * 0.6;

  // 棘突起
  if (o.spine) {
    const sp = o.spine;
    const tipShift = sp.h * Math.tan(deg(sp.tilt || 0));
    const bl = sp.base ?? h * 0.7;
    const tw = sp.tip ?? Math.max(1.5, bl * 0.5);
    const pts = [[-bl, -1], [bl, -1], [tipShift + tw * 0.5 + (sp.tipFwd || 0), sp.h], [tipShift - tw * 0.5 + (sp.tipFwd || 0), sp.h]];
    parts.push(plate(P(sp.a || 0, top - 1, 0), v.t, v.u, pts, sp.t ?? 1.4, null, sp.thick || null));
    // 先端の小さなふくらみ
    if (sp.knob) parts.push(ellipsoid(P((sp.a || 0) + tipShift + (sp.tipFwd || 0), top - 1 + sp.h, 0), [tw * 0.6, 1.2, sp.knob], [v.t, v.u, [1, 0, 0]]));
  }
  // 横突起
  if (o.trans) for (const s of [1, -1]) {
    const tr = o.trans;
    const a0 = tr.a ?? 0, d0 = tr.d ?? canalY * 0.4;
    const dir = D(tr.dir[0], tr.dir[1], tr.dir[2] * s);
    const start = P(a0, d0, s * (o.bw * 0.6));
    const end = add(start, mul(dir, tr.len + o.bw * 0.4));
    parts.push(cone(start, end, tr.r0, tr.r1, tr.flat ? { dir: tr.flatDir === 'a' ? v.t : v.u, ratio: tr.flat } : null));
    if (tr.knob) parts.push(sphere(end, tr.knob));
  }
  // 関節突起（頭側・尾側）
  const zx = o.zyg ?? o.cw * 0.95;
  const zr = o.zr ?? Math.max(1.1, o.cw * 0.42);
  for (const s of [1, -1]) {
    // 頭側の関節突起：上（内側）を向いた関節面をもつ、前へのびる板
    parts.push(cone(P(h * 0.45, top - zr * 1.2, s * zx * 0.9), P(h * 1.02, top - zr * 0.7, s * zx), zr * 0.75, zr * 0.6, { dir: norm(add(v.u, [s * 0.6, 0, 0])), ratio: 0.55 }));
    // 尾側の関節突起：下（外側）を向いた関節面
    parts.push(cone(P(-h * 0.45, top - zr * 0.6, s * zx * 0.75), P(-h * 1.02, top - zr * 0.8, s * zx * 0.85), zr * 0.7, zr * 0.55, { dir: norm(add(v.u, [s * 0.6, 0, 0])), ratio: 0.55 }));
    if (o.mammillary) parts.push(ellipsoid(P(h * 0.8, top + zr * 0.1, s * (zx + zr * 0.35)), [zr * 0.9, zr * 0.7, zr * 0.5], [v.t, v.u, [1, 0, 0]]));
    if (o.accessory) parts.push(cone(P(-h * 0.3, canalY, s * (o.cw + o.wall * 0.8)), P(-h * 1.05, canalY - 0.5, s * (o.cw + o.wall * 1.2)), 0.9, 0.5));
  }
  // そのほかの形（呼び出し側から足す）
  if (o.extra) parts.push(...o.extra(P, D, v));

  let shape = smoothUnion(o.k ?? 0.9, ...parts);
  // 脊柱管をくりぬく
  const cuts = [cone(P(-h - 6, canalY, 0), P(h + 6, canalY, 0), o.cw, o.cw, { dir: v.u, ratio: o.ch / o.cw })];
  // 椎間孔のくぼみ
  for (const s of [1, -1]) for (const e of [1, -1]) cuts.push(sphere(P(e * h * 1.02, o.bh * 0.9, s * (o.cw + o.wall * 0.5)), Math.min(L * 0.15, o.ch * 0.7)));
  if (o.cuts) cuts.push(...o.cuts(P, D, v));
  shape = smoothSubtract(0.5, shape, ...cuts);
  return shape;
}

// ---- 各部 ----

export function buildSpine(api, lm) {
  const V = lm.vert;
  const reg = (id, ja, la, region, parent, joint, shape, extra = {}) => api.bone({ id, ja, la, region, parent, joint, shape, ...extra });

  // 環椎（C1）
  {
    const v = V.C1; const { P, D } = local(v);
    const ring = smoothUnion(0.8,
      cone(P(-3.5, 9.5, 0), P(3.5, 9.5, 0), 2.0, 2.0, { dir: v.t, ratio: 1.4 }), // 背側弓の中央
    );
    const parts = [ring];
    // 背側弓と腹側弓（輪）
    for (const s of [1, -1]) {
      parts.push(cone(P(0, 9.5, 0), P(0, 6, s * 7.5), 1.8, 2.2, { dir: v.t, ratio: 2.0 }));
      parts.push(cone(P(0, 6, s * 7.5), P(0, -1.5, s * 6.5), 2.4, 2.4, { dir: v.t, ratio: 2.2 }));
      parts.push(cone(P(0, -1.5, s * 6.5), P(0, -3.2, 0), 2.0, 1.8, { dir: v.t, ratio: 2.0 }));
      // 環椎翼（大きな平たい翼）
      parts.push(plate(P(0, 2.5, s * 6), v.t, [s, 0, 0], [[-5.5, 0], [4.5, 0], [6.5, 6], [3.5, 11.5], [-2, 12], [-6.5, 8]], 2.0, 0.9));
      // 頭側の関節窩のふち（後頭顆を受ける）
      parts.push(ellipsoid(P(3.5, 3.5, s * 6.5), [2.4, 4.6, 3.0], [v.t, v.u, [1, 0, 0]]));
      parts.push(ellipsoid(P(-3.5, 2.5, s * 5.5), [2, 3.6, 2.6], [v.t, v.u, [1, 0, 0]]));
    }
    parts.push(ellipsoid(P(-0.5, -3.6, 0), [3, 1.6, 2.2], [v.t, v.u, [1, 0, 0]])); // 腹側結節
    let atlas = smoothUnion(0.8, ...parts);
    atlas = smoothSubtract(0.4, atlas,
      ellipsoid(P(0, 3.8, 0), [9, 5.2, 4.6], [v.t, v.u, [1, 0, 0]]),       // 椎孔
      ...[1, -1].flatMap((s) => [
        ellipsoid(P(6.0, 3.5, s * 5.6), [2.8, 4.2, 2.6], [v.t, v.u, [1, 0, 0]]), // 頭側関節窩（後頭顆の受け）
        cone(P(-6, 4, s * 10), P(6, 4, s * 10), 1.0, 1.0),                    // 横突孔
        cone(P(3, 8, s * 8.8), P(3, 0, s * 9.4), 0.9, 0.9),                   // 外側椎孔
      ]),
    );
    reg('C1', '環椎（第1頸椎）', 'Atlas', 'spine', 'C2', v.ca, atlas);
  }
  // 軸椎（C2）
  {
    const v = V.C2; const h = v.L / 2;
    const shape = vertebra(v, {
      bw: 4.2, bh: 3.2, cw: 4.2, ch: 3.4, wall: 1.4, archFrac: 0.95,
      spine: { h: 8.5, base: h * 0.9, tilt: 0, tip: h * 2.0, tipFwd: 1.5, t: 2.4, knob: 1.8 },
      trans: { dir: [-1, -0.3, 0.7], len: 4.5, r0: 1.6, r1: 1.0, flat: 0.6, d: 0.6, a: -h * 0.6 },
      zyg: 4.5, zr: 1.8,
      extra: (P, D) => [
        cone(P(h, 0.2, 0), P(h + 6.5, 0.8, 0), 2.6, 1.9),                    // 歯突起（環椎の輪の中へ）
        ...[1, -1].map((s) => ellipsoid(P(h - 1.2, 0.8, s * 4.2), [1.6, 3.2, 2.6], [v.t, v.u, [1, 0, 0]])), // 頭側関節面
      ],
      cuts: (P) => [1, -1].map((s) => cone(P(-h * 0.9, 1.2, s * 5.6), P(h * 0.4, 1.2, s * 5.6), 0.8, 0.8)), // 横突孔
    });
    reg('C2', '軸椎（第2頸椎）', 'Axis', 'spine', 'C3', v.ca, shape);
  }
  // C3〜C7
  for (let i = 3; i <= 7; i++) {
    const v = V['C' + i]; const h = v.L / 2;
    const isC6 = i === 6, isC7 = i === 7;
    const shape = vertebra(v, {
      bw: 4.3, bh: 3.0, cw: 4.6 - (i - 3) * 0.15, ch: 3.3, wall: 1.3, archFrac: 0.95,
      spine: { h: isC7 ? 6.5 : 1.6 + (i - 3) * 0.8, base: h * 0.5, tilt: isC7 ? -5 : 0, tip: isC7 ? 1.8 : h * 0.9, t: 1.3 },
      zyg: 5.4, zr: 2.0,
      extra: (P, D) => {
        const out = [];
        for (const s of [1, -1]) {
          if (!isC7) {
            // 横突起（腹外側にのびる板）。C6 は大きな腹側板をもつ
            out.push(plate(P(0, 0.8, s * 4.2), v.t, norm(add([s, 0, 0], mul(v.u, -0.9))),
              isC6 ? [[-h * 1.0, 0], [h * 0.9, 0], [h * 1.1, 5.5], [-h * 0.2, 8.5], [-h * 1.15, 6]] : [[-h * 1.0, 0], [h * 0.8, 0], [h * 0.7, 4.0], [-h * 1.1, 5.0]],
              1.4, 0.6));
            out.push(cone(P(-h * 0.2, 1.5, s * 4.5), P(-h * 0.2, 1.8, s * 7.5), 1.3, 1.0));
          } else {
            out.push(cone(P(0, 2.0, s * 4.5), P(-1, 2.2, s * 9), 1.5, 1.0, { dir: v.t, ratio: 0.7 }));
          }
        }
        return out;
      },
      cuts: isC7 ? null : (P) => [1, -1].map((s) => cone(P(-h - 1, 1.6, s * 5.8), P(h + 1, 1.6, s * 5.8), 0.85, 0.85)), // 横突孔
    });
    reg('C' + i, `第${i}頸椎`, `Vertebra cervicalis ${['', '', '', 'III', 'IV', 'V', 'VI', 'VII'][i]}`, 'spine', i === 7 ? 'T1' : 'C' + (i + 1), v.ca, shape);
  }
  // 胸椎
  const TS = [16, 17, 17, 16, 15, 14, 12.5, 11, 10, 8.5, 8, 8, 8];
  const TT = [-30, -30, -30, -28, -26, -24, -22, -20, -14, 0, 14, 18, 20];
  for (let i = 1; i <= 13; i++) {
    const v = V['T' + i]; const h = v.L / 2;
    const k = (i - 1) / 12;
    const caudal = i >= 11;
    const shape = vertebra(v, {
      bw: 3.6 + k * 1.2, bh: 2.8 + k * 0.6, cw: 3.4 - k * 0.3, ch: 2.6, wall: 1.2,
      spine: { h: TS[i - 1], base: h * (caudal ? 0.85 : 0.55), tilt: TT[i - 1], tip: caudal ? h * 1.2 : 1.8, t: 1.0, knob: caudal ? 0 : 0.8 },
      trans: caudal
        ? { dir: [0.2, -0.1, 1], len: 2.0, r0: 1.3, r1: 0.9, d: 3.6 }
        : { dir: [-0.1, 0.55, 1], len: 3.2 - k * 1.2, r0: 1.5, r1: 1.25, d: 3.8, flat: 0.7, flatDir: 'a' },
      zyg: 3.0 + k * 0.6, zr: 1.3 + k * 0.4,
      mammillary: i >= 10, accessory: i >= 11,
      cuts: (P) => [1, -1].flatMap((s) => [
        sphere(P(h, 0.6, s * (3.6 + k * 1.2)), 1.5), // 肋骨頭がはまる頭側の肋骨窩
        sphere(P(-h, 0.6, s * (3.6 + k * 1.2)), 1.3), // 尾側の肋骨窩
      ]),
    });
    reg('T' + i, `第${i}胸椎`, `Vertebra thoracica ${roman(i)}`, 'spine', i === 13 ? 'L1' : 'T' + (i + 1), v.ca, shape);
  }
  // 腰椎
  const LT = [8, 11, 14, 16, 18, 18, 13];
  for (let i = 1; i <= 7; i++) {
    const v = V['L' + i]; const h = v.L / 2;
    const k = (i - 1) / 6;
    const shape = vertebra(v, {
      bw: 4.8 + k * 1.2, bh: 3.3 + k * 0.4, cw: 3.5 + k * 0.6, ch: 2.6 + k * 0.2, wall: 1.4,
      spine: { h: 9 + Math.sin(k * Math.PI) * 2.5, base: h * 0.7, tilt: 22, tip: h * 0.9, t: 1.6, thick: null },
      trans: { dir: [0.55, -0.45, 1], len: LT[i - 1], r0: 3.0, r1: 2.0, flat: 0.3, d: 0.6, a: -h * 0.1 },
      zyg: 3.4 + k * 0.6, zr: 1.8, mammillary: true, accessory: i <= 5, waist: 0.86,
    });
    reg('L' + i, `第${i}腰椎`, `Vertebra lumbalis ${roman(i)}`, 'spine', i === 7 ? 'S' : 'L' + (i + 1), v.ca, shape);
  }
  // 仙骨（3つの仙椎が癒合）
  {
    const v = V.S; const { P, D } = local(v); const h = v.L / 2;
    const parts = [];
    for (let j = 0; j < 3; j++) {
      const a = h - 5 - j * 10;
      const w = 6.2 - j * 1.2;
      parts.push(cone(P(a + 5, 0, 0), P(a - 5, 0, 0), w, w - 0.6, { dir: v.u, ratio: 0.55 }));
      parts.push(cone(P(a + 4, 5.5, 0), P(a - 4, 5.2, 0), w - 1.5, w - 2, { dir: v.u, ratio: 0.55 })); // 椎弓
      parts.push(plate(P(a, 7, 0), v.t, v.u, [[-3.5, 0], [3.5, 0], [2, 5.5 - j * 0.8], [-2, 5.5 - j * 0.8]], 1.4)); // 正中仙骨稜
      for (const s of [1, -1]) parts.push(ellipsoid(P(a - 1, 6.8, s * 3), [2.2, 0.9, 1.0], [v.t, v.u, [1, 0, 0]])); // 中間仙骨稜
    }
    for (const s of [1, -1]) {
      // 仙骨翼（腸骨と関節する耳状面）
      parts.push(plate(P(h - 7, 1.0, s * 5), v.t, [s, 0, 0], [[-7, 0], [7.5, 0], [7.8, 5.5], [5, 8.5], [-2, 8], [-8, 3]], 5.5, 1.8));
      parts.push(cone(P(h - 14, 0.5, s * 7), P(-h + 6, 0, s * 5), 3.0, 1.8, { dir: v.u, ratio: 0.6 })); // 外側仙骨稜
      parts.push(cone(P(h - 3, 5.5, s * 4.2), P(h + 1.5, 6.5, s * 4.6), 1.6, 1.3, { dir: norm(add(v.u, [s * 0.6, 0, 0])), ratio: 0.55 })); // 頭側関節突起
    }
    let sac = smoothUnion(1.2, ...parts);
    sac = smoothSubtract(0.4, sac,
      cone(P(h + 3, 4.5, 0), P(-h - 3, 3.0, 0), 2.6, 1.6, { dir: v.u, ratio: 0.55 }), // 仙骨管
      ...[1, -1].flatMap((s) => [0, 1].flatMap((j) => [
        cone(P(h - 10 - j * 10, 8, s * 4.6), P(h - 10 - j * 10, -4, s * 4.6), 1.2, 1.2), // 背側・腹側仙骨孔
      ])),
    );
    reg('S', '仙骨', 'Os sacrum', 'spine', null, v.cr, sac);
  }
  // 尾椎
  const n = Object.keys(V).filter((k) => k.startsWith('Cd')).length;
  for (let i = 1; i <= n; i++) {
    const v = V['Cd' + i]; const h = v.L / 2; const { P, D } = local(v);
    const k = (i - 1) / (n - 1);
    const r = 3.6 * (1 - k) + 1.0 * k;
    let shape;
    if (i <= 6) {
      shape = vertebra(v, {
        bw: r, bh: r * 0.85, cw: Math.max(0.8, 2.0 - i * 0.22), ch: Math.max(0.6, 1.5 - i * 0.15), wall: 1.0,
        spine: i <= 4 ? { h: 3.5 - i * 0.6, base: h * 0.5, tilt: 0, tip: 1.5, t: 1.0 } : null,
        trans: { dir: [-0.25, -0.05, 1], len: Math.max(1.2, 6.5 - i * 1.0), r0: 1.5, r1: 1.0, flat: 0.5, d: 0, a: 0 },
        zyg: Math.max(1.2, 2.2 - i * 0.1), zr: 1.0, waist: 0.8,
      });
    } else {
      // 先のほうの尾椎は、両端がふくらんだ棒の形
      const parts = [
        cone(P(-h + 0.6, 0, 0), P(h - 0.6, 0, 0), r * 0.8, r * 0.8),
        ellipsoid(P(h - 1.0, 0, 0), [1.4, r * 1.05, r * 1.15], [v.t, v.u, [1, 0, 0]]),
        ellipsoid(P(-h + 1.0, 0, 0), [1.4, r * 1.05, r * 1.15], [v.t, v.u, [1, 0, 0]]),
      ];
      // 小さな突起のなごり（頭側・尾側）
      if (i < n - 2) for (const s of [1, -1]) {
        parts.push(sphere(P(h - 1.2, r * 0.3, s * r * 1.1), r * 0.38));
        parts.push(sphere(P(-h + 1.2, r * 0.25, s * r * 1.05), r * 0.33));
        parts.push(sphere(P(h - 1.6, r * 0.9, s * r * 0.5), r * 0.3));
      }
      shape = smoothUnion(0.6, ...parts);
      shape = intersect(shape, box(v.c, [h, r * 3, r * 3], [v.t, v.u, [1, 0, 0]], 0), 0.5);
    }
    reg('Cd' + i, `第${i}尾椎`, `Vertebra caudalis ${roman(i)}`, 'tail', i === 1 ? 'S' : 'Cd' + (i - 1), v.cr, shape);
  }
  // 血道弓（尾椎の腹側にある V 字の小さな骨）
  for (let i = 2; i <= 6; i++) {
    const a = V['Cd' + i], b = V['Cd' + (i + 1)];
    const c = mul(add(a.ca, b.cr), 0.5);
    const t = a.t, u = a.u;
    const r = 3.6 * (1 - (i - 1) / (n - 1)) + 1.0 * ((i - 1) / (n - 1));
    const top = add(c, mul(u, -r * 0.8));
    const parts = [];
    for (const s of [1, -1]) parts.push(cone(add(top, [s * 1.6, 0, 0]), add(add(top, mul(u, -4.5 + i * 0.4)), mul(t, -2.5)), 0.7, 0.6));
    parts.push(cone(add(top, mul(u, -4.5 + i * 0.4)), add(add(top, mul(u, -4.5 + i * 0.4)), mul(t, -4)), 0.8, 0.5));
    api.bone({ id: 'Hemal' + i, ja: `血道弓（第${i}・${i + 1}尾椎のあいだ）`, la: 'Arcus haemalis', region: 'tail', parent: 'Cd' + (i + 1), joint: b.cr, shape: smoothUnion(0.6, ...parts), h: 0.22 });
  }

  // 椎間板（軟骨）
  const order = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', ...Array.from({ length: 13 }, (_, i) => 'T' + (i + 1)), ...Array.from({ length: 7 }, (_, i) => 'L' + (i + 1)), 'S'];
  const size = (id) => {
    if (id.startsWith('C')) return [4.2, 3.0];
    if (id.startsWith('T')) { const k = (+id.slice(1) - 1) / 12; return [3.6 + k * 1.2, 2.8 + k * 0.6]; }
    if (id.startsWith('L')) { const k = (+id.slice(1) - 1) / 6; return [4.8 + k * 1.2, 3.3 + k * 0.4]; }
    return [6.2, 3.4];
  };
  for (let j = 0; j < order.length - 1; j++) {
    const a = V[order[j]], b = V[order[j + 1]];
    const [w, hh] = size(order[j]);
    const p0 = add(a.ca, mul(a.t, 0.5)), p1 = add(b.cr, mul(b.t, -0.5));
    api.bone({ id: 'Disc_' + order[j] + '_' + order[j + 1], ja: `椎間板（${order[j]}–${order[j + 1]}）`, la: 'Discus intervertebralis', region: 'spine', parent: order[j], joint: a.ca, shape: cone(p0, p1, w * 0.95, w * 0.95, { dir: a.u, ratio: hh / w }), mat: 'disc', h: 0.4 });
  }
  for (let i = 1; i < n; i++) {
    const a = V['Cd' + i], b = V['Cd' + (i + 1)];
    const r = 3.6 * (1 - (i - 1) / (n - 1)) + 1.0 * ((i - 1) / (n - 1));
    api.bone({ id: `Disc_Cd${i}_Cd${i + 1}`, ja: `椎間板（Cd${i}–Cd${i + 1}）`, la: 'Discus intervertebralis', region: 'tail', parent: 'Cd' + (i + 1), joint: b.cr, shape: cone(add(a.ca, mul(a.t, 0.4)), add(b.cr, mul(b.t, -0.4)), r * 0.85, r * 0.85), mat: 'disc', h: 0.3 });
  }
}

export function roman(n) {
  const R = [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
  let s = ''; for (const [c, v] of R) while (n >= v) { s += c; n -= v; }
  return s;
}
