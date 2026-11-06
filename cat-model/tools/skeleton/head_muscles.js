// 頭の筋肉（あごを動かす筋肉）。頭骨のデータ（skull_core.js）の形にそって作る。
// 参考：Reighard & Jennings 1901, Fig.63（頭の背側）・Fig.64（頭の外側）・Fig.65（頭の腹側）
// 頭の外形（ほお・こめかみのふくらみ）は、ほとんどこの筋肉の大きさで決まる。
import { ellipsoid, cone, smoothUnion, smoothSubtract, intersect } from './sdf.js';

export function buildHeadMuscles(lm, M, S, P) {
  const F = lm.F, Q = F.Q, AX = F.skullAxes, cr = F.cranium, jaw = F.jaw;
  const [u, v, w] = AX, O = Q(0, 0, 0);
  const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const local = (x, y, z) => { const px = x - O[0], py = y - O[1], pz = z - O[2]; return [px * u[0] + py * u[1] + pz * u[2], px * v[0] + py * v[1] + pz * v[2], px * w[0] + py * w[1] + pz * w[2]]; };
  const archTop = (a) => cr.archMid(a) + cr.archHalfH(a);
  const archBot = (a) => cr.archMid(a) - cr.archHalfH(a);

  // ---- 側頭筋：頭の横（側頭窩）を厚くおおい、頬骨のアーチの内側を通って下あごの筋突起へ ----
  {
    // 厚さ：こめかみのまん中でいちばん厚く（約 7mm）、頭のてっぺん（側頭線）・目の後ろ・後頭部でうすい
    const tk = (a) => 7.0 * sm(0, 12, a) * sm(43, 30, a) + 0.3;
    const outer = cr.grown((a) => [tk(a), 0]);
    const shell = {
      f: (x, y, z) => {
        const [a, b, c] = local(x, y, z);
        const dOut = outer.f(x, y, z), dIn = cr.core.f(x, y, z);
        // 左右の側頭筋のあいだ（頭のてっぺんのまん中）に 1.5mm のすき間、下はアーチの下の縁まで
        return Math.max(dOut, -dIn - 0.2, 1.5 - c, archBot(a) - 3 - b, -a - 1, a - 44);
      },
      lo: outer.lo, hi: outer.hi,
    };
    // 頬骨のアーチの内側を下りて筋突起をつつむ部分
    const cp = jaw.condyle(1), ct = jaw.coronoidTip;
    const down = smoothUnion(2.0,
      ellipsoid(Q(27, 9, cr.archC(27) - cr.archHalfW(27) - 3.5), [9, 6, 3.5], AX),
      ellipsoid(Q(25, 4, jaw.c0(25) + 0.5), [6.5, 7, 2.8], AX),
    );
    const vol = smoothUnion(2.5, shell, down);
    M('Temporalis', '側頭筋', 'M. temporalis', 'head', 2, { origin: '頭骨の側頭窩（頭の横の大きなくぼみ）と側頭線', insertion: '下顎骨の筋突起', action: '口を閉じる（かむ）。猫でいちばん大きいあごの筋肉' },
      [S([Q(20, 22, 14), Q(25, 12, 16), ct], [[3, 0], [3, 0]]), S([Q(8, 18, 14), Q(22, 8, 15), ct], [[3, 0], [3, 0]]), S([Q(38, 22, 12), Q(30, 12, 15), ct], [[3, 0], [3, 0]])],
      { volume: vol, bones: ['Skull', 'Mandible'], h: 0.35 });
  }

  // ---- 咬筋：頬骨のアーチの下の縁から、下あごの外側（咬筋窩）と角突起へ ----
  {
    const sup = [], deep = [];
    for (let k = 0; k <= 6; k++) {
      const ao = 30 + k * 4.6;                                       // 起始：アーチの下の縁
      const ai = 18 + k * 4.4;                                       // 停止：下あごの下の縁（後ろ寄り）
      const o = Q(ao, archBot(ao) + 0.5, cr.archC(ao) + cr.archHalfW(ao) * 0.4);
      const m = Q((ao + ai) / 2 - 1, (archBot(ao) - 9) / 2, (cr.archC(ao) + jaw.c0(ai)) / 2 + 3.4);
      const i = Q(ai, -9.5 + k * 0.25, jaw.c0(ai) + 1.6);
      sup.push(S([o, m, i], P(2.6, 0.05, 0.08, true)));
      const ad = 26 + k * 3.8, aid = 22 + k * 3.6;
      deep.push(S([Q(ad, archBot(ad) + 1, cr.archC(ad) - 0.8), Q(aid + 2, -1.5, jaw.c0(aid) + 2.6), Q(aid, -6, jaw.c0(aid) + 1.5)], P(2.2, 0.05, 0.08, true)));
    }
    M('Masseter', '咬筋', 'M. masseter', 'head', 1, { origin: '頬骨弓（ほおの骨のアーチ）の下の縁と内側', insertion: '下顎骨の外側の咬筋窩・角突起', action: '口を強く閉じる（かむ）。ほおのふくらみを作る' },
      [...sup, ...deep], { groups: [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12, 13]], bones: ['Skull', 'Mandible'], h: 0.3 });
  }

  // ---- 翼突筋（内側・外側）：頭骨の下から下あごの内側へ ----
  {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const a0 = 36 + k * 3;
      pts.push(S([Q(a0, -2, 6.5), Q(a0 - 7, -5, 11), Q(a0 - 12, -7.5, jaw.c0(a0 - 12) - 1.8)], P(1.8, 0.05, 0.1, true)));
    }
    M('Pterygoideus', '翼突筋（内側・外側）', 'Mm. pterygoidei', 'head', 3, { origin: '翼状骨・蝶形骨（頭骨の下の面）', insertion: '下顎骨の内側（角突起・関節突起）', action: '口を閉じる、あごを左右に動かす' },
      pts, { sheet: true, bones: ['Skull', 'Mandible'], h: 0.3 });
  }

  // ---- 顎二腹筋：耳の下の突起から下あごの下の縁へ（口を開ける） ----
  {
    const jp = Q(F.jugularA ?? 3, -3.5, 12);
    M('Digastric', '顎二腹筋', 'M. digastricus', 'head', 1, { origin: '後頭骨の頸静脈突起（耳の下）', insertion: '下顎骨の下の縁（中ほど）', action: '口を開ける' },
      [S([jp, Q(16, -10.5, 11.5), Q(34, -12.5, jaw.c0(34) - 2.4), Q(54, -12.0, jaw.c0(54) - 1.8)], P(2.8, 0.06, 0.12))], { bones: ['Skull', 'Mandible'], h: 0.3 });
  }
}
