// 猫の主な筋肉（左側を作り、右側は左右反転）。
// 名前・起始・停止・作用は、獣医解剖学（猫の解剖：Reighard & Jennings『Anatomy of the Cat』、
// Crouch『Text-Atlas of Cat Anatomy』など一般的な記載）にもとづく。
// layer: 1=表層（いちばん外）、2=中間層、3=深層
import { add, sub, mul, norm, lerp, spline } from './sdf.js';
import { profile as P } from './muscle.js';
import { buildFineMuscles } from './muscles_fine.js';

export function buildMuscles(api, lm) {
  const F = lm.F, V = lm.vert;
  const sc = F.scap.L, hu = F.hum.L, fa = F.fa.L, pw = F.paw.L;
  const il = F.ilium.L, fe = F.fem.L, ti = F.tib.L, pe = F.pes.L;
  const sk = F.Q;
  const { Lh, Lr, Lp, Li, Lf, Lt, Ltar } = F;
  // 椎骨の局所座標（a=頭の向き, d=背中の向き, s=左）
  const vt = (id, a = 0, d = 0, s = 0) => { const v = V[id]; return add(v.c, add(mul(v.t, a), add(mul(v.u, d), [s, 0, 0]))); };
  // 肋骨 i の、頭(0)〜肋軟骨との境(1) の割合 f の点を、外へ out だけ出したもの
  const rib = (i, f, out = 0) => {
    const R = F.ribs[i]; const x = f * (R.length - 1); const k = Math.min(R.length - 2, Math.floor(x));
    const p = lerp(R[k], R[k + 1], x - k);
    const o = norm([p[0], p[1] - 195, 0]);
    return add(p, mul(o, out));
  };
  const cart = (i, f) => { const C = F.carts[i]; const x = f * (C.length - 1); const k = Math.min(C.length - 2, Math.floor(x)); return lerp(C[k], C[k + 1], x - k); };
  const stern = (i, f = 0.5) => lerp(F.sternebrae[i].a, F.sternebrae[i].b, f);
  const up = (p, d) => add(p, [0, d, 0]);
  const at = (p, dx = 0, dy = 0, dz = 0) => add(p, [dx, dy, dz]);

  // 腹の壁の形（z の位置、θ=0 背中側〜1 腹のまん中、inset=内側へ）
  const zs = [260, 220, 180, 150, 100, 60, 30, 5];
  const Az = [38, 38.5, 37.5, 37, 33, 27, 20, 15];
  const Bz = [150, 140, 139, 141, 150, 168, 188, 204];
  const tab = (arr, z) => { for (let i = 0; i < zs.length - 1; i++) if (z <= zs[i] && z >= zs[i + 1]) { const t = (zs[i] - z) / (zs[i] - zs[i + 1]); return arr[i] + (arr[i + 1] - arr[i]) * t; } return z > zs[0] ? arr[0] : arr[arr.length - 1]; };
  const wall = (z, th, inset = 0) => {
    const A = tab(Az, z) - inset, B = tab(Bz, z) + inset;
    const ctrl = [[11 - inset * 0.5, 255], [A * 0.75, 246], [A, 226], [A * 0.88, B + 22], [A * 0.45, B + 4], [2, B]];
    const pts = spline(ctrl.map(([x, y]) => [x, y, z]), 8);
    const x = th * (pts.length - 1); const k = Math.min(pts.length - 2, Math.floor(x));
    return lerp(pts[k], pts[k + 1], x - k);
  };

  const list = [];
  const M = (id, ja, la, region, layer, info, strands, opts = {}) => list.push({ id, ja, la, region, layer, ...info, strands, pair: opts.pair ?? true, ...opts });
  const S = (pts, prof) => ({ pts, prof });

  // ===================== 頭 =====================
  M('Temporalis', '側頭筋', 'M. temporalis', 'head', 2, { origin: '頭骨の側頭窩', insertion: '下顎骨の筋突起', action: '口を閉じる（かむ）' }, [
    S([sk(8, 18, 16.5), sk(20, 14, 19.5), sk(30, 13, 18.5)], P(3.2, 0, 0.15, true)),
    S([sk(18, 26, 13.5), sk(25, 18, 18.5), sk(31, 15, 18)], P(3.2, 0, 0.15, true)),
    S([sk(32, 27, 11), sk(34, 20, 16.5), sk(32, 16, 17.5)], P(3.0, 0, 0.15, true)),
    S([sk(40, 21, 14.5), sk(37, 16, 17.5), sk(33, 14, 17.8)], P(2.6, 0, 0.15, true)),
  ], { bones: ['Skull', 'Mandible'] });
  M('Masseter', '咬筋', 'M. masseter', 'head', 1, { origin: '頬骨弓の下の面', insertion: '下顎骨の外側（咬筋窩）', action: '口を閉じる（強くかむ）' }, [
    S([sk(36, 1.5, 29), sk(32, -4, 23), sk(27, -8.5, 19.5)], P(3.2, 0.05, 0.05, true)),
    S([sk(46, 2.5, 31), sk(42, -4, 24), sk(37, -9.5, 19.5)], P(3.4, 0.05, 0.05, true)),
    S([sk(55, 4, 28.5), sk(50, -3, 22), sk(46, -10, 18)], P(3.0, 0.05, 0.05, true)),
  ], { bones: ['Skull', 'Mandible'] });
  M('Digastric', '顎二腹筋', 'M. digastricus', 'head', 1, { origin: '後頭骨の傍顆突起', insertion: '下顎骨の下の縁', action: '口を開ける' }, [
    S([sk(3, -1, 12.5), sk(18, -12, 10.5), sk(38, -15.5, 9.5), sk(58, -14, 8.5)], P(2.3, 0.08, 0.1)),
  ], { bones: ['Skull', 'Mandible'] });

  // ===================== 首 =====================
  M('Sternocephalicus', '胸骨頭筋（胸鎖乳突筋）', 'M. sternocephalicus', 'neck', 1, { origin: '胸骨柄', insertion: '頭骨の乳様突起・項稜', action: '頭と首を下げる・横に向ける' }, [
    S([at(stern(0, 0.2), 3, -2, 0), at(stern(0, 0), 9, 8, 18), [15, 248, 352], [18, 270, 375], sk(12, 1, 20)], P(2.8, 0.05, 0.1)),
  ]);
  M('Splenius', '板状筋', 'M. splenius', 'neck', 2, { origin: '第1〜3胸椎の棘突起・項靱帯', insertion: '頭骨の項稜', action: '頭と首を上げる' }, [
    S([vt('T3', 0, 19, 2), vt('C7', 0, 13, 7), vt('C4', 0, 9, 10.5), vt('C2', 0, 10, 11), sk(3, 20, 15)], P(3.2, 0.03, 0.08, true)),
    S([vt('T1', 0, 19, 2), vt('C6', 0, 14, 5), vt('C3', 0, 14, 6), sk(4, 25, 9)], P(3.0, 0.03, 0.08, true)),
  ]);
  M('LongusColli', '頸長筋', 'M. longus colli', 'neck', 3, { origin: '第1〜6胸椎の椎体の腹側', insertion: '頸椎の椎体と横突起・環椎', action: '首を下に曲げる' }, [
    S(['T5', 'T3', 'T1', 'C7', 'C5', 'C3', 'C2', 'C1'].map((id) => vt(id, 0, -5, 3.2)), P(2.0, 0.03, 0.06, true)),
  ]);
  M('Scalenus', '斜角筋', 'M. scalenus', 'neck', 3, { origin: '第1〜4肋骨', insertion: '第4〜7頸椎の横突起', action: '首を横・下に曲げる、息を吸うのを助ける' }, [
    S([rib(4, 0.5, 1.5), rib(2, 0.45, 2), vt('C7', 0, -1, 10), vt('C5', 0, 0, 10), vt('C4', 0, 0, 9)], P(2.0, 0.05, 0.08)),
  ]);

  // ===================== 背中・体幹 =====================
  const spineIds = ['S', 'L7', 'L6', 'L5', 'L4', 'L3', 'L2', 'L1', 'T13', 'T12', 'T11', 'T10', 'T9', 'T8', 'T7', 'T6', 'T5', 'T4', 'T3', 'T2', 'T1', 'C7', 'C6', 'C5', 'C4', 'C3', 'C2'];
  const lonR = (id) => id[0] === 'L' || id === 'S' ? 6.5 : id[0] === 'T' ? (+id.slice(1) > 9 ? 4.8 : 3.6) : 2.6;
  M('Longissimus', '最長筋（背最長筋）', 'M. longissimus', 'trunk', 3, { origin: '腸骨・仙骨・腰椎', insertion: '胸椎・頸椎・肋骨、頭骨の乳様突起', action: '背中を反らす・伸ばす（跳ぶ・走るときの主役）' }, [
    S([at(F.W, -3, 6, 6), ...spineIds.map((id) => vt(id, 0, 6.5, 9)), vt('C1', 0, 2, 12), sk(11, 2, 17.5)], [[3.5, 0.3], ...spineIds.map((id) => [lonR(id), 0]), [2.2, 0], [1.2, 1]]),
  ]);
  M('Iliocostalis', '腸肋筋', 'M. iliocostalis', 'trunk', 3, { origin: '腸骨の稜・腰椎の横突起', insertion: '肋骨の角・第7頸椎', action: '背中を反らす・横に曲げる、肋骨を引く' }, [
    S([at(F.W, 2, 3, 2), vt('L4', 0, 2, 17), vt('L1', 0, 3, 18), ...[13, 11, 9, 7, 5, 3, 1].map((i) => rib(i, 0.18, 3.2)), vt('C7', 0, 1, 10)], P(2.6, 0.03, 0.05, true)),
  ]);
  M('Spinalis', '棘筋・多裂筋', 'M. spinalis et multifidus', 'trunk', 3, { origin: '腰椎・胸椎の乳頭突起と棘突起', insertion: 'より頭側の椎骨の棘突起', action: '背骨を反らす・ねじる、背骨を安定させる' }, [
    S(['L7', 'L5', 'L3', 'L1', 'T12', 'T10', 'T8', 'T6', 'T4', 'T2', 'C7', 'C5', 'C3', 'C2'].map((id) => vt(id, 0, id[0] === 'L' ? 9 : id[0] === 'T' ? 11 : 9, 3.6)), P(2.0, 0.03, 0.05, true)),
  ]);
  M('Latissimus', '広背筋', 'M. latissimus dorsi', 'trunk', 1, { origin: '第5胸椎〜第4腰椎の棘突起（胸腰筋膜）', insertion: '上腕骨の大円筋粗面（内側）', action: '前足を後ろへ引く（走る・登るときに体を前へ引き上げる）' }, [
    S([vt('T6', 0, 19, 3), at(rib(5, 0.12, 6), 0, 6, 0), [37, 214, 268], hu(28, -3, -5)], P(1.8, 0, 0.12, true)),
    S([vt('T9', 0, 17, 3), at(rib(8, 0.15, 6), 0, 6, 0), [40, 212, 250], [37, 200, 262], hu(28, -3, -5)], P(1.8, 0, 0.14, true)),
    S([vt('T12', 0, 15, 3), at(rib(11, 0.2, 6), 0, 4, 0), [41, 210, 225], [38, 198, 255], hu(28, -3, -5)], P(1.7, 0, 0.16, true)),
    S([vt('L2', 0, 15, 3), [22, 252, 150], at(rib(13, 0.35, 5), 0, 0, 0), [41, 208, 205], [38, 196, 250], hu(28, -3, -5)], P(1.6, 0, 0.18, true)),
  ]);
  // 腹の壁
  const eo = [];
  for (let k = 0; k < 9; k++) {
    const z0 = 238 - k * 24;
    eo.push(S([wall(z0, 0.0, -2.5), wall(z0 - 14, 0.45, -2.5), wall(z0 - 26, 0.72, -2.5), wall(Math.max(4, z0 - 34), 0.92, -2.5)], P(1.3, 0, 0.25, true)));
  }
  M('ObliquusExt', '外腹斜筋', 'M. obliquus externus abdominis', 'trunk', 1, { origin: '第4〜13肋骨の外側・胸腰筋膜', insertion: '白線（お腹のまん中）・恥骨', action: 'お腹をしめる、体をまるめる・ひねる、息をはく' }, eo, { k: 2.4 });
  const io = [];
  for (let k = 0; k < 7; k++) {
    const z0 = 20 + k * 22;
    io.push(S([wall(z0, 0.06, 0.2), wall(z0 + 10, 0.4, 0.2), wall(z0 + 20, 0.7, 0.2), wall(z0 + 28, 0.92, 0.2)], P(1.2, 0, 0.2, true)));
  }
  M('ObliquusInt', '内腹斜筋', 'M. obliquus internus abdominis', 'trunk', 2, { origin: '胸腰筋膜・腸骨', insertion: '最後の数本の肋骨・白線', action: 'お腹をしめる、体をまるめる・ひねる' }, io, { k: 2.2 });
  M('RectusAbd', '腹直筋', 'M. rectus abdominis', 'trunk', 2, { origin: '恥骨（骨盤結合）', insertion: '胸骨と第1〜9肋軟骨', action: '体をまるめる（背中を丸める）、お腹をしめる' }, [
    S([at(F.P1, 3, 1, 4), [5, 186, 30], [6, tab(Bz, 70) + 3, 70], [6, tab(Bz, 130) + 3, 130], [7, 141, 190], [8, 146, 235], at(stern(3), 6, 3, 0), at(stern(1), 7, 4, 0)], P(2.3, 0.05, 0.05, true)),
  ]);
  // 肋間筋（肋骨のあいだ）
  const ic = [], icg = [];
  for (let i = 1; i <= 12; i++) {
    const g = [];
    for (let f = 0.12; f <= 0.95; f += 0.083) { g.push(ic.length); ic.push(S([rib(i, f, 0.2), rib(i + 1, Math.min(0.98, f + 0.05), 0.2)], P(0.7, 0, 0, true))); }
    icg.push(g);
  }
  M('Intercostales', '肋間筋', 'Mm. intercostales', 'trunk', 3, { origin: '肋骨の後ろの縁', insertion: 'うしろ隣の肋骨の前の縁', action: '肋骨を動かして息をする' }, ic, { groups: icg, sheetN: 4, noCarve: true });
  // 横隔膜（左右をまとめて1枚）
  {
    const C = [0, 196, 252];
    const rim = [vt('L1', 0, -6, 2), vt('L3', 0, -6, 3), rib(12, 0.5), rib(13, 0.7), rib(13, 0.95), cart(12, 0.5), cart(11, 0.5), cart(10, 0.5), cart(9, 0.7), cart(9, 0.35)];
    const strands = [];
    for (const [sgn, list] of [[1, rim], [-1, [...rim].reverse()]]) for (const r of list) {
      const p = [r[0] * sgn, r[1], r[2]];
      const mid = add(lerp(p, C, 0.5), [0, 0, 14]);
      strands.push(S([p, mid, add(lerp(mid, C, 0.6), [0, 0, 4]), C], P(1.0, 0, 0.45, true)));
    }
    M('Diaphragm', '横隔膜', 'Diaphragma', 'trunk', 3, { origin: '肋骨弓の内側・腰椎（腰椎部の脚）', insertion: 'まん中の腱（腱中心）', action: '息を吸う（いちばん大事な呼吸の筋肉）' }, strands, { pair: false, k: 1.6, noCarve: true });
  }

  // ===================== 肩と前足 =====================
  M('Trapezius', '僧帽筋（鎖骨部・肩峰部・棘部）', 'M. trapezius', 'forelimb', 1, { origin: '頭骨の項稜〜第10胸椎の棘突起', insertion: '鎖骨、肩甲骨の肩峰と肩甲棘', action: '肩甲骨を持ち上げ前後に引く、前足を前へ出す' }, [
    S([vt('C3', 0, 15, 2), vt('C6', 0, 16, 9), [22, 222, 312], [22, 210, 314]], P(1.7, 0, 0.1, true)),
    S([vt('C7', 0, 19, 2), [12, 262, 300], sc(30, 1, 10)], P(1.6, 0, 0.1, true)),
    S([vt('T2', 0, 22, 2), [10, 265, 280], sc(45, 1, 9.5)], P(1.6, 0, 0.1, true)),
    S([vt('T5', 0, 21, 2), [9, 263, 263], sc(60, 0.5, 9)], P(1.5, 0, 0.1, true)),
    S([vt('T8', 0, 18, 2), [9, 258, 243], sc(68, 0, 8)], P(1.4, 0, 0.12, true)),
  ], { k: 2.2 });
  M('Clavobrachialis', '鎖骨上腕筋（三角筋の鎖骨部）', 'M. clavobrachialis', 'forelimb', 1, { origin: '鎖骨', insertion: '尺骨の近位（前腕の前）', action: '前足を前へ振り出す、肘を曲げる' }, [
    S([[22, 210, 314], hu(5, 13, 1), hu(45, 10, 2), hu(Lh - 5, 7.5, 1), fa(5, 5, 0)], P(2.8, 0.05, 0.12)),
  ]);
  M('Rhomboideus', '菱形筋', 'M. rhomboideus', 'forelimb', 3, { origin: '第7頸椎〜第4胸椎の棘突起・項靱帯（頭部は後頭骨）', insertion: '肩甲骨の背側の縁（内側）', action: '肩甲骨を背骨のほうへ引きよせる' }, [
    S([vt('C6', 0, 13, 2), vt('C7', 0, 14, 5), sc(66, 18, -1.5)], P(2.2, 0, 0.05, true)),
    S([vt('T1', 0, 16, 2), sc(72, 6, -1.5)], P(2.2, 0, 0.05, true)),
    S([vt('T3', 0, 17, 2), sc(71, -6, -1.5)], P(2.2, 0, 0.05, true)),
    S([sk(3, 22, 8), vt('C3', 0, 12, 7), vt('C6', 0, 12, 9), sc(64, 21, -1)], P(1.5, 0, 0.05, true)),
  ]);
  const sv = [];
  for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) sv.push(S([rib(i, 0.5, 1.5), lerp(rib(i, 0.3, 4), sc(66, 0, -3), 0.4), sc(69, 12 - i * 3.5, -2.5)], P(2.3, 0, 0.05, true)));
  sv.push(S([vt('C5', 0, 1, 9), vt('C7', 0, 3, 13), sc(62, 21, -2)], P(2.2, 0.03, 0.05, true)));
  M('SerratusVentralis', '腹鋸筋', 'M. serratus ventralis', 'forelimb', 3, { origin: '第1〜9肋骨の外側・第3〜7頸椎の横突起', insertion: '肩甲骨の内側面（背側の縁の近く）', action: '胴体を前足のあいだにつり下げる、肩甲骨を回す' }, sv, { k: 2.0 });
  M('LevatorScapulaeV', '腹側肩甲挙筋', 'M. levator scapulae ventralis', 'forelimb', 2, { origin: '環椎の翼（横突起）', insertion: '肩甲骨の肩峰（鉤上突起）', action: '肩甲骨を前へ引く' }, [
    S([vt('C1', 0, 4, 15), vt('C3', 0, 0, 15), [26, 222, 318], sc(13, -5, 9)], P(2.0, 0.05, 0.1)),
  ]);
  M('Deltoideus', '三角筋（肩峰部・棘部）', 'M. deltoideus', 'forelimb', 1, { origin: '肩甲骨の肩峰と肩甲棘', insertion: '上腕骨の三角筋粗面', action: '肩を曲げる、前足を外へ上げる' }, [
    S([sc(8, 3, 9.5), hu(4, 5, 10), hu(22, 4.5, 6)], P(2.8, 0, 0.12)),
    S([sc(55, 0, 9), sc(35, -5, 9.5), sc(15, -6, 10), hu(22, 4, 6)], P(2.4, 0, 0.12, true)),
    S([sc(35, 0, 9.5), sc(20, -3, 10), hu(22, 4, 6)], P(2.2, 0, 0.12, true)),
  ]);
  M('Supraspinatus', '棘上筋', 'M. supraspinatus', 'forelimb', 2, { origin: '肩甲骨の棘上窩', insertion: '上腕骨の大結節', action: '肩をのばす、肩関節を安定させる' },
    [6, 12, 18].map((f) => S([sc(64, f, 3), sc(45, f * 0.9 + 1, 4), sc(25, f * 0.7 + 2, 4.5), sc(10, 6.5, 4.5), hu(-2, 6.5, 3.5)], P(3.0, 0, 0.08, true))), { k: 2.2 });
  M('Infraspinatus', '棘下筋', 'M. infraspinatus', 'forelimb', 2, { origin: '肩甲骨の棘下窩', insertion: '上腕骨の大結節の外側', action: '前足を外へ回す、肩関節を安定させる' },
    [-6, -12, -18].map((f) => S([sc(60, f, 3), sc(42, f * 0.9, 4), sc(22, f * 0.6, 4.5), sc(9, -3, 6), hu(1, 1, 8)], P(3.0, 0, 0.08, true))), { k: 2.2 });
  M('TeresMinor', '小円筋', 'M. teres minor', 'forelimb', 3, { origin: '肩甲骨の尾側の縁', insertion: '上腕骨の大結節の下', action: '肩を曲げる' }, [
    S([sc(28, -13, 1.8), sc(14, -8, 4), hu(6, -1, 7.5)], P(1.8, 0, 0.1)),
  ]);
  M('TeresMajor', '大円筋', 'M. teres major', 'forelimb', 2, { origin: '肩甲骨の尾側の角', insertion: '上腕骨の大円筋粗面（内側）', action: '肩を曲げる、前足を後ろへ引く' }, [
    S([sc(64, -23, 0), sc(45, -21, -1.5), sc(20, -12, -3), hu(27, -3, -4.5)], P(3.6, 0, 0.1)),
  ]);
  M('Subscapularis', '肩甲下筋', 'M. subscapularis', 'forelimb', 3, { origin: '肩甲骨の内側の面（肩甲下窩）', insertion: '上腕骨の小結節', action: '前足を内へ寄せる、肩関節を安定させる' },
    [12, 0, -14].map((f) => S([sc(62, f, -2.6), sc(35, f * 0.8, -3.6), sc(10, 1, -5), hu(3, 2.5, -7)], P(3.0, 0, 0.08, true))), { k: 2.2 });
  M('Triceps', '上腕三頭筋（長頭・外側頭・内側頭）', 'M. triceps brachii', 'forelimb', 1, { origin: '長頭：肩甲骨の関節窩の下／外側頭・内側頭：上腕骨', insertion: '尺骨の肘頭', action: '肘をのばす（着地や体重をささえる）、長頭は肩も曲げる' }, [
    S([sc(11, -9, 0), hu(25, -11, 1), hu(60, -10.5, 0), fa(-12, -9, 0.3)], P(6.5, 0.03, 0.08)),
    S([hu(10, -3, 6.5), hu(45, -6.5, 7), fa(-13, -8.5, 2.5)], P(4.2, 0.03, 0.08)),
    S([hu(20, -4, -5), hu(55, -6.5, -4.5), fa(-12, -8, -1.5)], P(3.4, 0.03, 0.08)),
  ], { k: 2.4 });
  M('Anconeus', '肘筋', 'M. anconeus', 'forelimb', 3, { origin: '上腕骨の外側上顆', insertion: '尺骨の肘頭の外側', action: '肘をのばす' }, [
    S([hu(Lh - 14, -5, 4.5), hu(Lh - 3, -6, 5), fa(-5, -6.5, 4)], P(1.6, 0, 0.05)),
  ]);
  M('Biceps', '上腕二頭筋', 'M. biceps brachii', 'forelimb', 2, { origin: '肩甲骨の関節上結節', insertion: '橈骨の橈骨粗面', action: '肘を曲げる' }, [
    S([sc(10, 7.5, 0.5), hu(-3, 9.5, 0.5), hu(12, 9, 0), hu(45, 8, -1), hu(Lh - 8, 6, -2.5), fa(9, 2.5, -2.5)], P(3.2, 0.2, 0.12)),
  ]);
  M('Brachialis', '上腕筋', 'M. brachialis', 'forelimb', 2, { origin: '上腕骨の外側（近位）', insertion: '尺骨・橈骨の近位の内側', action: '肘を曲げる' }, [
    S([hu(12, -2, 6), hu(40, 2.5, 6.5), hu(Lh - 12, 5.5, 3.5), fa(8, 0.5, -1.5)], P(2.8, 0.03, 0.12)),
  ]);
  {
    // 胸筋群：前腕胸筋（細い帯）・浅胸筋（膜）・深胸筋（膜）・剣状上腕筋（細い帯）
    const mid = (a, b, out, down) => { const m = lerp(a, b, 0.5); return [m[0] + out, m[1] - down, m[2]]; };
    const strands = [];
    const a0 = at(stern(0, 0.3), 3, -3, 0), b0 = fa(12, -1, -7);
    strands.push(S([a0, mid(a0, b0, 8, 6), b0], P(2.0, 0, 0.12, true)));
    for (let i = 0; i <= 3; i++) { const a = at(stern(i), 3, -3, 0), b = hu(18 + i * 8, 6.5, -1.5); strands.push(S([a, mid(a, b, 6, 5), b], P(2.2, 0, 0.1, true))); }
    for (let i = 2; i <= 6; i++) { const a = at(stern(i), 4, -1.5, 0), b = hu(6 + (i - 2) * 5, 6, -3.5); strands.push(S([a, mid(a, b, 3, 3), b], P(2.4, 0, 0.1, true))); }
    const ax = at(stern(7, 0.6), 3, -2, 0), bx = hu(15, 6, -3);
    strands.push(S([ax, mid(ax, bx, 9, 4), bx], P(1.8, 0, 0.12, true)));
    M('Pectoralis', '胸筋群（前腕胸筋・浅胸筋・深胸筋・剣状上腕筋）', 'Mm. pectorales', 'forelimb', 1, { origin: '胸骨（胸骨柄〜剣状突起）', insertion: '上腕骨の大結節稜・前腕の筋膜', action: '前足を体に引きよせる、体を前足の上へ引く' }, strands, { k: 2.0 });
  }
  // 前腕
  M('Brachioradialis', '腕橈骨筋', 'M. brachioradialis', 'forelimb', 1, { origin: '上腕骨の外側顆上稜', insertion: '橈骨の遠位（内側）', action: '前腕を外へ回す（手のひらを上へ）' }, [
    S([hu(Lh - 25, 1, 6.5), fa(25, 6.5, 3), fa(Lr - 15, 5.5, -3), fa(Lr - 5, 3.5, -6.5)], P(1.4, 0.03, 0.2)),
  ]);
  M('ExtCarpiRad', '橈側手根伸筋', 'M. extensor carpi radialis', 'forelimb', 1, { origin: '上腕骨の外側顆上稜', insertion: '第2・3中手骨の近位（背側）', action: '手首をのばす' }, [
    S([hu(Lh - 18, 1.5, 7.5), fa(15, 6.5, 2.5), fa(Lr * 0.6, 6, 0.5), fa(Lr - 6, 5, -0.5), pw(9, 3, -2)], P(3.0, 0.03, 0.45)),
  ]);
  M('ExtDigCom', '総指伸筋', 'M. extensor digitorum communis', 'forelimb', 1, { origin: '上腕骨の外側上顆', insertion: '第2〜5指の末節骨（背側）', action: '指と手首をのばす、爪を出すのを助ける' }, [
    S([hu(Lh - 4, 1, 10), fa(25, 4.5, 5.5), fa(Lr - 5, 4.5, 2.5), pw(12, 3.3, 0), pw(Lp, 2.6, 0), pw(Lp + 12, 2.2, 0)], P(2.8, 0.03, 0.55)),
  ]);
  M('ExtDigLat', '外側指伸筋', 'M. extensor digitorum lateralis', 'forelimb', 1, { origin: '上腕骨の外側上顆', insertion: '第3〜5指の背側', action: '指をのばす' }, [
    S([hu(Lh - 4, -1, 10.5), fa(30, 0, 7.5), fa(Lr - 4, 2, 6), pw(Lp, 2.3, 3), pw(Lp + 11, 2, 3)], P(2.2, 0.03, 0.55)),
  ]);
  M('ExtCarpiUln', '尺側手根伸筋', 'M. extensor carpi ulnaris', 'forelimb', 1, { origin: '上腕骨の外側上顆', insertion: '第5中手骨の近位', action: '手首を外へ曲げる・のばす' }, [
    S([hu(Lh - 3, -2, 10), fa(30, -4, 7), fa(Lr - 3, -2.5, 7), pw(10, 0, 6)], P(2.4, 0.03, 0.35)),
  ]);
  M('FlexCarpiUln', '尺側手根屈筋', 'M. flexor carpi ulnaris', 'forelimb', 1, { origin: '上腕骨の内側上顆・尺骨の肘頭', insertion: '副手根骨', action: '手首を曲げる' }, [
    S([hu(Lh - 3, -2.5, -11.5), fa(30, -8, -0.5), fa(Lr - 6, -6, 2.5), pw(1, -9, 3.8)], P(3.0, 0.03, 0.3)),
    S([fa(-10, -10, 1), fa(25, -9, 1.5), fa(Lr - 6, -6, 2.5)], P(2.0, 0.03, 0.2)),
  ]);
  M('FlexCarpiRad', '橈側手根屈筋', 'M. flexor carpi radialis', 'forelimb', 1, { origin: '上腕骨の内側上顆', insertion: '第2・3中手骨の近位（掌側）', action: '手首を曲げる' }, [
    S([hu(Lh - 3, -1, -11.5), fa(30, 1, -7), fa(Lr - 4, -1, -7), pw(10, -2.5, -3)], P(2.0, 0.03, 0.4)),
  ]);
  M('FlexDigSup', '浅指屈筋（長掌筋）', 'M. flexor digitorum superficialis', 'forelimb', 2, { origin: '上腕骨の内側上顆', insertion: '第2〜5指の中節骨（掌側）', action: '指と手首を曲げる' }, [
    S([hu(Lh - 3, -2.5, -11), fa(30, -7, -2.5), fa(Lr - 3, -6.5, 0), pw(4, -7.5, 0), pw(Lp, -3.8, 0), pw(Lp + 8, -3.5, 0)], P(2.6, 0.03, 0.5)),
  ]);
  M('FlexDigProf', '深指屈筋', 'M. flexor digitorum profundus', 'forelimb', 3, { origin: '上腕骨の内側上顆・尺骨・橈骨', insertion: '第1〜5指の末節骨（掌側）', action: '指を曲げる、爪を出す' }, [
    S([hu(Lh - 2, -3, -10), fa(30, -5, -3), fa(Lr - 3, -4.5, 0), pw(4, -4.5, 0), pw(Lp, -3.2, 0), pw(Lp + 12, -3, 0)], P(3.4, 0.03, 0.55)),
  ]);
  M('PronatorTeres', '円回内筋', 'M. pronator teres', 'forelimb', 2, { origin: '上腕骨の内側上顆', insertion: '橈骨の中ほど（内側）', action: '前腕を内へ回す（手のひらを下へ）' }, [
    S([hu(Lh - 3, 0, -11.5), fa(15, 3, -5), fa(35, 3.5, -3.5)], P(1.6, 0.03, 0.1)),
  ]);
  M('Supinator', '回外筋', 'M. supinator', 'forelimb', 3, { origin: '上腕骨の外側上顆', insertion: '橈骨の近位（前）', action: '前腕を外へ回す' }, [
    S([hu(Lh - 1, 1, 9), fa(8, 4.5, 4), fa(18, 4, 2)], P(1.4, 0.03, 0.08)),
  ]);

  // ===================== 腰と後ろ足 =====================
  M('GluteusMedius', '中殿筋', 'M. gluteus medius', 'hindlimb', 2, { origin: '腸骨の外側の面（殿筋面）', insertion: '大腿骨の大転子', action: '股をのばす（後ろへけり出す）' }, [
    S([il(Li - 2, 7, 3), il(30, 6, 5.5), il(14, 4, 7), fe(-2, -1, 11.5)], P(4.8, 0, 0.1)),
    S([il(Li + 2, -2, 3), il(32, 0, 5.5), il(14, 1, 7), fe(-1, -1.5, 11.5)], P(4.2, 0, 0.1)),
  ], { k: 2.4 });
  M('GluteusSup', '浅殿筋', 'M. gluteus superficialis', 'hindlimb', 1, { origin: '仙骨・第1尾椎（殿筋膜）', insertion: '大腿骨の大転子の下（第三転子）', action: '股をのばす、後ろ足を外へ開く' }, [
    S([vt('S', 4, 9, 4), [18, 252, 20], fe(-6, -3, 14.5), fe(14, -2, 11)], P(2.4, 0, 0.12, true)),
    S([vt('Cd1', 0, 6, 4), [20, 244, 0], fe(-4, -6, 14), fe(15, -3, 11)], P(2.2, 0, 0.12, true)),
  ]);
  M('Caudofemoralis', '尾大腿筋', 'M. caudofemoralis', 'hindlimb', 1, { origin: '第2・3尾椎の横突起', insertion: '大腿骨の遠位（膝蓋骨の外側へ腱）', action: '股をのばす、後ろ足を外へ開く（猫にある筋肉）' }, [
    S([vt('Cd2', 0, 1, 9), [21, 232, -16], fe(30, -7, 13), fe(60, -2, 11.5), fe(Lf - 6, 4, 8)], P(2.6, 0.03, 0.3)),
  ]);
  M('TensorFL', '大腿筋膜張筋', 'M. tensor fasciae latae', 'hindlimb', 1, { origin: '腸骨の腹側の稜（腸骨棘）', insertion: '大腿筋膜（膝の外側へ）', action: '股を曲げる、膝をのばす' }, [
    S([il(Li + 2, -5, 2), fe(12, 8, 11), fe(50, 6, 10), fe(Lf - 8, 7.5, 6)], P(2.4, 0, 0.25, true)),
  ]);
  M('Sartorius', '縫工筋', 'M. sartorius', 'hindlimb', 1, { origin: '腸骨の稜（腹側）', insertion: '膝の内側（膝蓋骨・脛骨）', action: '股を曲げる、後ろ足を前へ出す' }, [
    S([il(Li + 4, -1, 0), fe(10, 10, -4), fe(50, 9, -7), ti(8, 4, -9)], P(2.6, 0, 0.08, true)),
    S([il(Li + 2, -5, -1), fe(15, 7, -7), fe(55, 5, -9), ti(12, 2, -9)], P(2.4, 0, 0.08, true)),
  ], { k: 2.4 });
  M('BicepsFemoris', '大腿二頭筋', 'M. biceps femoris', 'hindlimb', 1, { origin: '坐骨結節', insertion: '膝蓋骨・脛骨の外側（下腿筋膜）', action: '股をのばす、膝を曲げる（けり出し）' }, [
    S([at(F.I, 2, 0, 0), fe(30, -9, 12.5), fe(65, -4, 12.5), ti(8, 2, 9.5)], P(4.6, 0, 0.06, true)),
    S([at(F.I, 2, -1, -1), fe(35, -13, 11), fe(75, -10, 11), ti(25, -1, 8.5)], P(4.4, 0, 0.06, true)),
    S([at(F.I, 1, -2, -2), fe(40, -16, 8), fe(85, -12, 7.5), ti(40, -3, 7.5)], P(3.8, 0, 0.08, true)),
  ], { k: 2.6 });
  M('Semitendinosus', '半腱様筋', 'M. semitendinosus', 'hindlimb', 1, { origin: '坐骨結節', insertion: '脛骨の内側（近位）', action: '股をのばす、膝を曲げる' }, [
    S([at(F.I, 0, -1, -3), fe(40, -18, 1), fe(80, -14, -3), ti(20, 0, -7.5)], P(3.6, 0, 0.15)),
  ]);
  M('Semimembranosus', '半膜様筋', 'M. semimembranosus', 'hindlimb', 2, { origin: '坐骨結節・坐骨の腹側', insertion: '大腿骨の内側顆・脛骨の内側', action: '股をのばす、膝を曲げる' }, [
    S([at(F.I, -3, -3, 1), fe(40, -15, -5), fe(Lf - 8, -6.5, -8)], P(4.2, 0, 0.08)),
    S([at(F.I, -5, -4, 3), fe(45, -13, -8), ti(4, -3, -8.5)], P(3.6, 0, 0.1)),
  ], { k: 2.2 });
  M('Gracilis', '薄筋', 'M. gracilis', 'hindlimb', 1, { origin: '骨盤結合（恥骨・坐骨）', insertion: '脛骨の内側（近位）', action: '後ろ足を内へ寄せる、膝を曲げる' },
    [0.1, 0.5, 0.9].map((f) => S([at(lerp(F.P1, F.P2, f), 2, -2, 0), fe(45, -9 + f * 4, -13), ti(15, 0, -9)], P(2.0, 0, 0.1, true))), { k: 2.4 });
  M('Adductor', '内転筋', 'M. adductor femoris', 'hindlimb', 2, { origin: '恥骨・坐骨の腹側', insertion: '大腿骨の後ろの面', action: '後ろ足を内へ寄せる、股をのばす' }, [
    S([at(F.P2, 3, -1, 2), fe(40, -9, -6), fe(70, -6, -3)], P(4.0, 0, 0.08)),
    S([at(F.P1, 4, -1, -4), fe(30, -6, -5), fe(55, -5, -3)], P(3.4, 0, 0.08)),
  ], { k: 2.2 });
  M('Pectineus', '恥骨筋', 'M. pectineus', 'hindlimb', 2, { origin: '恥骨の前の縁', insertion: '大腿骨の内側（近位）', action: '後ろ足を内へ寄せる' }, [
    S([at(F.P1, 5, 1, 5), fe(15, -2, -6), fe(30, -3, -4.5)], P(2.0, 0, 0.1)),
  ]);
  M('Iliopsoas', '腸腰筋（大腰筋・腸骨筋）', 'M. iliopsoas', 'hindlimb', 3, { origin: '腰椎の椎体（腹側）・腸骨の内側', insertion: '大腿骨の小転子', action: '股を曲げる（後ろ足を前へ）、背中を丸める' }, [
    S([vt('L2', 0, -6, 4), vt('L4', 0, -7, 6), vt('L6', 0, -8, 8), [13, 230, 26], fe(14, -4, -1)], P(3.6, 0, 0.1)),
    S([il(35, -4, -3), il(18, -6, -3), fe(14, -4, 1)], P(2.6, 0, 0.1)),
  ], { k: 2.0 });
  M('RectusFemoris', '大腿直筋（大腿四頭筋）', 'M. rectus femoris', 'hindlimb', 2, { origin: '腸骨（寛骨臼のすぐ前）', insertion: '膝蓋骨 →（膝蓋靱帯）→ 脛骨粗面', action: '膝をのばす、股を曲げる' }, [
    S([il(9, -4, 1), fe(10, 10, 3), fe(50, 10, 1), fe(Lf - 9, 9.5, 0)], P(4.0, 0.05, 0.1)),
  ]);
  M('VastusLat', '外側広筋（大腿四頭筋）', 'M. vastus lateralis', 'hindlimb', 2, { origin: '大腿骨の大転子の下・外側', insertion: '膝蓋骨', action: '膝をのばす（跳ぶときの主役）' }, [
    S([fe(2, 2, 10.5), fe(45, 4.5, 9.5), fe(Lf - 10, 8, 4.5)], P(4.6, 0, 0.1)),
  ]);
  M('VastusMed', '内側広筋（大腿四頭筋）', 'M. vastus medialis', 'hindlimb', 2, { origin: '大腿骨の内側', insertion: '膝蓋骨', action: '膝をのばす' }, [
    S([fe(12, 1, -6.5), fe(55, 4, -7.5), fe(Lf - 10, 8, -3.5)], P(4.0, 0, 0.1)),
  ]);
  M('VastusInt', '中間広筋（大腿四頭筋）', 'M. vastus intermedius', 'hindlimb', 3, { origin: '大腿骨の前の面', insertion: '膝蓋骨', action: '膝をのばす' }, [
    S([fe(12, 5.5, 0), fe(55, 7, 0), fe(Lf - 12, 8.5, 0)], P(3.4, 0, 0.1)),
  ]);
  M('PatellarLig', '膝蓋靱帯', 'Lig. patellae', 'hindlimb', 2, { origin: '膝蓋骨', insertion: '脛骨粗面', action: '大腿四頭筋の力を脛骨に伝える（腱）' }, [
    S([fe(Lf - 1, 8, 0), ti(2, 8.5, 0.3), ti(6, 7.8, 0.5)], [[1.6, 1], [1.5, 1], [1.4, 1]]),
  ], { kind: 'tendon' });
  M('Gastrocnemius', '腓腹筋（外側頭・内側頭）', 'M. gastrocnemius', 'hindlimb', 1, { origin: '大腿骨の顆の後ろ（ファベラ）', insertion: '踵骨隆起（アキレス腱）', action: '足首をのばす（跳ぶ・けり出す）、膝を曲げる' }, [
    S([fe(Lf - 8, -8, 5.5), ti(15, -10, 4), ti(45, -9, 2), ti(Lt - 25, -7, 1.5), pe(-12, -10, 2.5), pe(-17.5, -12.5, 2.5)], P(5.2, 0.04, 0.45)),
    S([fe(Lf - 8, -8, -5.5), ti(15, -10, -3), ti(45, -9.5, -1), ti(Lt - 25, -7, 1), pe(-17.5, -12.5, 2.5)], P(4.8, 0.04, 0.45)),
  ], { k: 2.4 });
  M('Soleus', 'ヒラメ筋', 'M. soleus', 'hindlimb', 2, { origin: '腓骨の頭', insertion: '踵骨隆起（アキレス腱）', action: '足首をのばす' }, [
    S([ti(8, -3.5, 11), ti(40, -7, 6.5), ti(Lt - 25, -6.5, 3), pe(-16, -11, 2.8)], P(2.6, 0.03, 0.35)),
  ]);
  M('FlexDigSupH', '浅趾屈筋（足底筋）', 'M. flexor digitorum superficialis (plantaris)', 'hindlimb', 2, { origin: '大腿骨の外側顆の後ろ', insertion: '踵骨の上を通って、第2〜5趾の中節骨', action: '足首をのばす、指を曲げる' }, [
    S([fe(Lf - 6, -8.5, 1.5), ti(20, -11.5, 0.5), ti(70, -9, 0.5), pe(-18, -14, 2.5), pe(0, -8.5, 1.5), pe(Ltar, -4.2, 0), pe(Ltar + 10, -3.5, 0)], P(3.2, 0.03, 0.6)),
  ]);
  M('FlexDigProfH', '深趾屈筋（長趾屈筋・長母趾屈筋）', 'M. flexor digitorum profundus', 'hindlimb', 3, { origin: '脛骨と腓骨の後ろの面', insertion: '第2〜5趾の末節骨', action: '指を曲げる、爪を出す、足首をのばす' }, [
    S([ti(15, -6.5, 4), ti(50, -6.5, 1), ti(Lt - 5, -5.5, -3), pe(5, -5.5, -2), pe(Ltar, -3.6, 0), pe(Ltar + 12, -3, 0)], P(3.0, 0.03, 0.5)),
  ]);
  M('TibialisCr', '前脛骨筋', 'M. tibialis cranialis', 'hindlimb', 1, { origin: '脛骨の外側（近位）', insertion: '第1・2中足骨の近位', action: '足首を曲げる（つま先を上げる）' }, [
    S([ti(10, 5.5, 5.5), ti(50, 5.5, 4), ti(Lt - 6, 5.5, 0), pe(8, 4.5, -3), pe(15, 3, -3.8)], P(3.2, 0.03, 0.35)),
  ]);
  M('ExtDigLongH', '長趾伸筋', 'M. extensor digitorum longus', 'hindlimb', 2, { origin: '大腿骨の外側顆', insertion: '第2〜5趾の末節骨（背側）', action: '指をのばす、足首を曲げる' }, [
    S([fe(Lf - 2, 3.5, 7), ti(15, 3.5, 7.5), ti(60, 4, 4.5), ti(Lt - 4, 4.5, 1.5), pe(10, 4.5, 0.5), pe(Ltar, 2.7, 0), pe(Ltar + 12, 2.2, 0)], P(2.6, 0.06, 0.5)),
  ]);
  M('PeroneusLong', '長腓骨筋', 'M. peroneus longus', 'hindlimb', 1, { origin: '腓骨・脛骨の外側（近位）', insertion: '足の裏を横切って第2中足骨', action: '足を外へ返す' }, [
    S([ti(10, -1, 11), ti(50, -1.5, 9), ti(Lt - 2, -1, 9.5), pe(6, -3, 6), pe(14, -3.5, 1)], P(2.2, 0.03, 0.45)),
  ]);
  M('PeroneusBrev', '短腓骨筋', 'M. peroneus brevis', 'hindlimb', 2, { origin: '腓骨の遠位', insertion: '第5中足骨の近位', action: '足を外へ返す' }, [
    S([ti(45, -2.5, 8.5), ti(Lt - 1, -2, 9.5), pe(14, 0, 5.5)], P(1.8, 0.03, 0.4)),
  ]);

  // ===================== しっぽ =====================
  const cds = Array.from({ length: 21 }, (_, i) => 'Cd' + (i + 1));
  const cr = (i) => (3.6 * (1 - i / 20) + 1.0 * (i / 20));
  const tailProf = (scale) => [[2.8 * scale, 0], ...cds.map((_, i) => [Math.max(0.5, cr(i) * 0.75 * scale), i > 17 ? 0.7 : 0])];
  M('SacrocaudDors', '背側仙尾筋', 'M. sacrocaudalis dorsalis', 'tail', 2, { origin: '仙骨・腰椎の背側', insertion: '尾椎（背側）', action: 'しっぽを上げる' }, [
    S([vt('L7', 0, 7, 3), ...cds.map((id, i) => vt(id, 0, cr(i) * 1.15, cr(i) * 0.55))], tailProf(1)),
  ], { k: 1.0 });
  M('SacrocaudVent', '腹側仙尾筋', 'M. sacrocaudalis ventralis', 'tail', 2, { origin: '仙骨の腹側', insertion: '尾椎（腹側）', action: 'しっぽを下げる' }, [
    S([vt('S', 0, -4, 3), ...cds.map((id, i) => vt(id, 0, -cr(i) * 1.15, cr(i) * 0.55))], tailProf(0.95)),
  ], { k: 1.0 });
  M('IntertransCaud', '尾の横突間筋', 'Mm. intertransversarii caudae', 'tail', 3, { origin: '尾椎の横突起', insertion: 'うしろの尾椎の横突起', action: 'しっぽを横に曲げる' }, [
    S([vt('S', 0, 0, 6), ...cds.map((id, i) => vt(id, 0, 0, cr(i) * 1.35))], tailProf(0.8)),
  ], { k: 1.0 });

  // 顔の筋肉と手足の先の筋肉・腱
  buildFineMuscles(lm, M, S);

  // 板（膜）のように広がる筋肉：となりあうすじのあいだを膜でうめる
  const SHEET = new Set(['Temporalis', 'Masseter', 'Splenius', 'Latissimus', 'ObliquusExt', 'ObliquusInt', 'Trapezius', 'Rhomboideus',
    'SerratusVentralis', 'Supraspinatus', 'Infraspinatus', 'Subscapularis', 'Pectoralis', 'GluteusSup', 'GluteusMedius', 'Sartorius',
    'BicepsFemoris', 'Gracilis', 'Deltoideus', 'Diaphragm']);
  for (const m of list) if (SHEET.has(m.id)) m.sheet = true;
  // 向きのちがう部分は別々の膜にする
  const G = { Pectoralis: [[0], [1, 2, 3, 4], [5, 6, 7, 8, 9], [10]], SerratusVentralis: [[0, 1, 2, 3, 4, 5, 6, 7], [8]], Rhomboideus: [[0, 1, 2], [3]],
    Triceps: null, Deltoideus: [[0], [1, 2]], GluteusSup: [[0, 1]], Temporalis: [[0, 1, 2, 3]] };
  for (const m of list) if (G[m.id]) m.groups = G[m.id];
  // 首から胸を通る管（気管・食道）も、首の動きにあわせて曲がるよう同じ作り方にする
  for (const t of lm.softTubes || []) list.push({ id: t.id, ja: t.ja, la: t.la, region: 'organ', layer: 3, kind: 'organ', color: t.color, pair: false, noCarve: true,
    origin: '—', insertion: '—', action: t.id === 'Trachea' ? '空気の通り道' : '食べ物の通り道', strands: [{ pts: t.pts, prof: t.r.map((r) => [r, 0]) }], scale: 1 });
  return list;
}
