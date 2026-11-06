// 細かい筋肉：顔（表情・耳・まぶた・口・ひげ）と、手足の先（指の筋肉・指ごとの腱・爪を引っこめるじん帯）
// 表情や手の動き（爪を出す・指を広げる）を後で動かすための土台。
// 参考：Crouch『Text-Atlas of Cat Anatomy』、Reighard & Jennings『Anatomy of the Cat』の顔面筋・耳介筋・手足の筋の記載
import { add, sub, mul, norm, cross, lerp } from './sdf.js';
import { profile as P } from './muscle.js';

export function buildFineMuscles(lm, M, S) {
  const F = lm.F, V = lm.vert, sk = F.Q;
  const [u, v, w] = F.skullAxes;
  const vt = (id, a = 0, d = 0, s = 0) => { const q = V[id]; return add(q.c, add(mul(q.t, a), add(mul(q.u, d), [s, 0, 0]))); };
  const T = (r) => [[r, 1], [r, 1]];                 // ぜんぶ腱（白いすじ）
  const fine = { h: 0.16, scale: 1 };
  const paw = { h: 0.15, scale: 1, noCarve: true };                  // 小さい筋肉は細かい格子で作る

  // ===================== 顔の筋肉（表情筋） =====================
  // 眼輪筋：まぶたのすきまをかこむ輪
  {
    const e = lm.eyeOpen, [g, hv, vv] = e.axes;
    const c = add(e.c, mul(g, -1.0));
    const ring = [];
    for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI * 2; ring.push(add(c, add(mul(hv, Math.cos(t) * 9.5), mul(vv, Math.sin(t) * 7)))); }
    M('OrbicularisOculi', '眼輪筋', 'M. orbicularis oculi', 'head', 1, { origin: 'まぶたのまわり（目頭の靱帯）', insertion: 'まぶたの皮ふ', action: '目を閉じる・まばたき・目を細める' },
      [S(ring, [[1.3, 0], [1.3, 0]])], { ...fine, bones: ['Skull'], noCarve: true });
    M('LevatorAnguliOculi', '内側眼角挙筋', 'M. levator anguli oculi medialis', 'head', 1, { origin: '前頭部（おでこのまん中）', insertion: '上まぶたの内側', action: '目の上（まゆ）を持ち上げる。「うるうるした目」の表情' },
      [S([sk(46, 27, 3), sk(52, 24, 7), add(c, add(mul(vv, 7.5), mul(hv, -4)))], P(1.0, 0.05, 0.15))], { ...fine, bones: ['Skull'] });
    M('RetractorAnguliOculi', '外側眼角後引筋', 'M. retractor anguli oculi lateralis', 'head', 1, { origin: '側頭部の筋膜', insertion: '目じり', action: '目じりを後ろへ引いて、目を細くする' },
      [S([sk(30, 12, 24), sk(42, 13, 25), add(c, mul(hv, 9.5))], P(0.9, 0.05, 0.15))], { ...fine, bones: ['Skull'] });
  }
  // 口のまわり
  M('OrbicularisOris', '口輪筋', 'M. orbicularis oris', 'head', 1, { origin: '口のまわりをかこむ', insertion: '唇の皮ふ', action: '口を閉じる・唇をすぼめる' }, [
    S([sk(87, -1, 0.8), sk(84, -3, 5), sk(78, -5, 9.5), sk(70, -6.5, 13), sk(62, -7.5, 14.5)], [[1.3, 0], [1.4, 0]]),
    S([sk(85, -9.5, 0.8), sk(81, -10, 5), sk(74, -10, 9.5), sk(66, -9, 13), sk(62, -7.8, 14.5)], [[1.2, 0], [1.3, 0]]),
  ], { ...fine, bones: ['Skull', 'Mandible'], noCarve: true });
  M('Buccinator', '頬筋', 'M. buccinator', 'head', 2, { origin: '上あごと下あごの歯ぐきの外側', insertion: '口のすみ・口輪筋', action: 'ほおを歯に押しつけ、食べ物を歯のあいだにもどす' },
    [56, 63, 70, 76].map((a) => S([sk(a, -1.5, 15 - (a - 56) * 0.18), sk(a + 2, -5, 16 - (a - 56) * 0.2), sk(a, -9.5, 14.5 - (a - 56) * 0.2)], [[0.9, 0], [0.9, 0]])),
    { ...fine, sheet: true, bones: ['Skull', 'Mandible'] });
  M('LevatorNasolabialis', '鼻唇挙筋', 'M. levator nasolabialis', 'head', 1, { origin: '鼻すじ・前頭部', insertion: '上唇と鼻の穴のまわり', action: '上唇と鼻を持ち上げる（においをかぐ・「シャー」と威嚇する顔）' },
    [S([sk(54, 25, 5), sk(70, 18, 8), sk(86, 7, 4)], [[0.8, 0], [0.9, 0]]), S([sk(56, 23, 8), sk(70, 14, 11), sk(82, 3, 9)], [[0.8, 0], [0.9, 0]])],
    { ...fine, sheet: true, bones: ['Skull'] });
  M('LevatorLabiiSup', '上唇挙筋（ひげを動かす筋）', 'M. levator labii superioris', 'head', 1, { origin: '目の下（上顎骨）', insertion: 'ひげのふくらみ（洞毛の毛包）', action: 'ひげを前に向ける・上唇を上げる。ひげの表情を作る' },
    [S([sk(60, 8, 15.5), sk(70, 5, 14), sk(79, 3, 12)], P(1.3, 0.05, 0.1))], { ...fine, bones: ['Skull'] });
  M('Caninus', '犬歯筋（口角挙筋）', 'M. caninus', 'head', 1, { origin: '上顎骨（犬歯の根の上）', insertion: 'ひげのふくらみの下・上唇', action: '上唇を引き上げて犬歯を見せる（怒った顔）' },
    [S([sk(70, 6, 13), sk(76, 0, 12.5), sk(79, -4, 11)], P(1.0, 0.05, 0.1))], { ...fine, bones: ['Skull'] });
  M('Zygomaticus', '頬骨筋', 'M. zygomaticus', 'head', 1, { origin: '耳のつけね（盾状軟骨）', insertion: '口のすみ', action: '口のすみを後ろ・上へ引く' },
    [S([sk(18, 20, 22), sk(35, 8, 26), sk(50, -1, 20), sk(62, -7, 15)], P(1.1, 0.05, 0.1))], { ...fine, bones: ['Skull'] });
  M('DepressorLabiiInf', '下唇下制筋', 'M. depressor labii inferioris', 'head', 1, { origin: '下顎骨の外側', insertion: '下唇', action: '下唇を下げる' },
    [S([sk(55, -12, 16.5), sk(66, -11.5, 14), sk(76, -10.5, 10)], P(0.9, 0.05, 0.1))], { ...fine, bones: ['Mandible'] });
  M('Mentalis', 'オトガイ筋', 'M. mentalis', 'head', 1, { origin: '下あごの先（オトガイ）', insertion: '下唇のまん中', action: '下唇を持ち上げる' },
    [S([sk(79, -14, 3), sk(82, -11.5, 2.5), sk(84, -9.8, 1.5)], P(0.8, 0.05, 0.1))], { ...fine, bones: ['Mandible'] });
  M('Frontoscutularis', '前頭盾状筋（前頭筋）', 'M. frontoscutularis', 'head', 1, { origin: '前頭部（目の上）', insertion: '耳のつけね（盾状軟骨）', action: '耳を前へ向ける・おでこにしわを寄せる' },
    [S([sk(52, 26, 6), sk(36, 29, 10), sk(23, 28, 14)], [[0.9, 0], [1.0, 0]]), S([sk(50, 23, 11), sk(36, 25, 15), sk(24, 25, 17)], [[0.9, 0], [1.0, 0]])],
    { ...fine, sheet: true, bones: ['Skull'] });
  // 耳を動かす筋肉（猫の耳は 30 以上の筋で動く。主な群を作る）
  M('Interscutularis', '盾間筋', 'M. interscutularis', 'head', 1, { origin: '反対側の耳のつけね', insertion: '耳のつけね（盾状軟骨）', action: '両耳を寄せる・耳を立てる' },
    [S([sk(20, 31, 0), sk(20, 30.5, 7), sk(20, 28.5, 13)], [[0.9, 0], [1.0, 0]]), S([sk(26, 31, 0), sk(25, 30.5, 7), sk(24, 28.5, 13)], [[0.9, 0], [1.0, 0]])],
    { ...fine, sheet: true, bones: ['Skull'] });
  M('Cervicoauricularis', '頸耳介筋（浅・中・深）', 'Mm. cervicoauriculares', 'head', 1, { origin: '首の背中側のまん中（項靱帯）', insertion: '耳介の後ろ', action: '耳を後ろへ倒す・横へ向ける（イカ耳）' }, [
    S([vt('C2', 0, 13, 2), sk(4, 26, 9), sk(14, 28, 15)], P(1.1, 0.03, 0.1)),
    S([vt('C3', 0, 12, 3), sk(2, 23, 12), sk(14, 26, 17)], P(1.1, 0.03, 0.1)),
    S([vt('C2', 0, 10, 6), sk(3, 18, 16), sk(15, 24, 19)], P(1.0, 0.03, 0.1)),
  ], { ...fine, bones: ['Skull', 'C2', 'C3'] });
  M('Zygomaticoauricularis', '頬骨耳介筋', 'M. zygomaticoauricularis', 'head', 1, { origin: '頬骨弓', insertion: '耳介の前の下', action: '耳を前・下へ向ける' },
    [S([sk(40, 6, 30), sk(30, 14, 26), sk(22, 23, 19)], P(1.0, 0.03, 0.1))], { ...fine, bones: ['Skull'] });
  M('Parotidoauricularis', '耳下腺耳介筋', 'M. parotidoauricularis', 'head', 1, { origin: 'のどの横の筋膜', insertion: '耳介の下', action: '耳を下・外へ倒す' },
    [S([sk(6, -16, 15), sk(10, 0, 20), sk(17, 21, 19)], P(1.0, 0.03, 0.1))], { ...fine, bones: ['Skull'] });
  M('Platysma', '広頸筋（頸括約筋）', 'M. platysma / sphincter colli', 'neck', 1, { origin: '首の背中側の筋膜', insertion: '口のすみ・ほおの皮ふ', action: '首とほおの皮ふを動かす（毛を逆立てる・口のすみを後ろへ）' },
    [S([vt('C3', 0, 11, 9), sk(25, -6, 22), sk(50, -6, 18), sk(61, -7.5, 15)], [[0.8, 0], [0.8, 0]]), S([vt('C5', 0, 7, 13), sk(15, -14, 18), sk(45, -10, 16), sk(60, -8, 15)], [[0.8, 0], [0.8, 0]])],
    { ...fine, h: 0.25, sheet: true });

  // ===================== 手足の先 =====================
  for (const [D, isFore, frm, Lx] of [[F.digF, true, F.paw, F.Lp], [F.digH, false, F.pes, F.Ltar]]) {
    const pre = isFore ? '手' : '足', reg = isFore ? 'forelimb' : 'hindlimb', dig = isFore ? '指' : '趾';
    const ds = isFore ? [2, 3, 4, 5] : [2, 3, 4, 5];
    const L = frm.L;
    const palmar = (d) => norm(mul(cross(d, [1, 0, 0]), -1));     // 指の腹の向き
    const dorsal = (d) => norm(cross(d, [1, 0, 0]));
    const lat = (p0, q) => [p0[0] + q, p0[1], p0[2]];
    // 骨間筋：中手骨（中足骨）のあいだの手のひら側
    M(isFore ? 'InterosseiF' : 'InterosseiH', `骨間筋（${pre}）`, 'Mm. interossei', reg, 3, { origin: `第2〜5${isFore ? '中手骨' : '中足骨'}の近位（${isFore ? '手のひら' : '足の裏'}側）`, insertion: `第2〜5${dig}の基節骨（種子骨を通って）`, action: `${dig}のつけねを曲げる、${dig}を広げる・閉じる` },
      ds.map((d) => { const q = D[d]; return S([add(lerp(q.mcBase, q.mcHead, 0.08), mul(palmar(q.dirP), q.r * 1.9)), add(lerp(q.mcBase, q.mcHead, 0.55), mul(palmar(q.dirP), q.r * 2.3)), add(q.head, add(mul(palmar(q.dirP), q.r * 2.4), mul(q.dirP, 1.5)))], P(1.1, 0.05, 0.3)); }),
      { ...paw, k: 0.6 });
    M(isFore ? 'LumbricalesF' : 'LumbricalesH', `虫様筋（${pre}）`, 'Mm. lumbricales', reg, 3, { origin: `深${dig}屈筋の腱`, insertion: `第3〜5${dig}の基節骨の内側`, action: `${dig}のつけねを曲げる` },
      [3, 4, 5].map((d) => { const q = D[d], qm = D[d - 1]; return S([add(lerp(lerp(q.mcBase, q.mcHead, 0.6), lerp(qm.mcBase, qm.mcHead, 0.6), 0.5), mul(palmar(q.dirP), q.r * 3.2)), lat(add(q.head, mul(palmar(q.dirP), q.r * 2.0)), -q.r * 0.9)], P(0.7, 0.05, 0.3)); }),
      { ...paw, h: 0.12 });
    // 指を広げる筋
    if (isFore) {
      const q1 = D[1];
      M('AbductorDigitiIF', '第1指外転筋（長第1指外転筋）', 'M. abductor digiti I longus', reg, 2, { origin: '橈骨と尺骨の遠位（前）', insertion: '第1中手骨（狼爪）', action: '狼爪（第1指）を外へ開く' },
        [S([F.fa.L(F.Lr * 0.6, 3.5, 2), F.fa.L(F.Lr - 6, 4.2, -4.5), L(4, 1.5, -6.5), lerp(q1.mcBase, q1.mcHead, 0.5)], P(1.4, 0.05, 0.45))], { ...paw });
      M('AbductorDigitiVF', '第5指外転筋（手）', 'M. abductor digiti V', reg, 2, { origin: '副手根骨', insertion: '第5指の基節骨の外側', action: '第5指を外へ開く' },
        [S([L(1, -9, 4.2), L(10, -3, 6.5), lat(D[5].head, D[5].r * 1.2)], P(1.2, 0.05, 0.3))], { ...paw });
      M('FlexorDigitiIF', '第1指屈筋群（短第1指屈筋・内転筋）', 'Mm. digiti I', reg, 3, { origin: '手根の手のひら側', insertion: '第1指（狼爪）の基節骨', action: '狼爪を曲げる・内へ寄せる' },
        [S([L(5, -4, -2.5), lerp(q1.mcBase, q1.mcHead, 0.4), q1.head], P(1.0, 0.05, 0.3))], { ...paw });
    } else {
      const c = F.pes;
      M('ExtDigBrevisH', '短趾伸筋', 'M. extensor digitorum brevis', reg, 2, { origin: '踵骨の背側', insertion: '第2〜4趾の伸筋の腱', action: '指をのばす' },
        [2, 3, 4].map((d) => S([c.L(6, 2.5, 3), c.L(20, 3.5, 1.5 - (d - 3) * 2), add(D[d].mcHead, mul(dorsal(D[d].dirP), D[d].r * 1.6))], P(1.0, 0.05, 0.45))), { ...paw });
      M('FlexDigBrevisH', '短趾屈筋', 'M. flexor digitorum brevis', reg, 2, { origin: '浅趾屈筋の腱（足の裏）', insertion: '第2〜5趾の中節骨', action: '指を曲げる' },
        ds.map((d) => S([c.L(10, -7, 1), c.L(30, -6, 1 - (d - 3.5) * 2.5), add(D[d].head, mul(palmar(D[d].dirP), D[d].r * 2.3))], P(0.9, 0.05, 0.45))), { ...paw });
      M('QuadratusPlantae', '足底方形筋', 'M. quadratus plantae', reg, 3, { origin: '踵骨の足の裏側', insertion: '深趾屈筋の腱', action: '指を曲げる力の向きを整える' },
        [S([c.L(2, -6, 3.5), c.L(14, -5.5, 1.5), c.L(24, -5, 0)], P(1.3, 0.05, 0.2))], { ...paw });
      M('AbductorDigitiVH', '第5趾外転筋（足）', 'M. abductor digiti V', reg, 2, { origin: '踵骨の外側', insertion: '第5趾の基節骨の外側', action: '第5趾を外へ開く' },
        [S([c.L(0, -5, 5), c.L(25, -3, 6.5), lat(D[5].head, D[5].r * 1.2)], P(1.0, 0.05, 0.4))], { ...paw });
    }
    // 指ごとの腱
    const flexT = [], extT = [], elast = [];
    for (const d of (isFore ? [1, 2, 3, 4, 5] : ds)) {
      const q = D[d]; if (!q) continue;
      const pa = palmar(q.dirP), pm = palmar(q.dirM), dp = dorsal(q.dirP), dm = dorsal(q.dirM);
      const fwd = norm(sub(q.p2b, q.head));
      const dd = norm(add(add([0.32, 0, 0], [0, 0.9, 0]), mul(fwd, -0.05)));     // 引っこめた末節骨の向き
      // 深い屈筋の腱：手のひら（足の裏）を通って末節骨の屈筋結節へ
      flexT.push(S([add(lerp(q.mcBase, q.mcHead, 0.55), mul(pa, q.r * 2.6)), add(q.head, mul(pa, q.r * 2.2)), add(lerp(q.head, q.p1b, 0.5), mul(pa, q.r * 1.3)), add(q.p1b, mul(pm, q.r * 1.2)), add(lerp(q.p1b, q.p2b, 0.5), mul(pm, q.r * 1.0)), add(q.p2b, add(mul(pm, q.r * 0.9), mul(dd, 1.2)))], T(0.42)));
      // 伸筋の腱：背中側を通って末節骨の伸筋突起へ
      extT.push(S([add(lerp(q.mcBase, q.mcHead, 0.6), mul(dp, q.r * 1.5)), add(q.head, mul(dp, q.r * 1.4)), add(lerp(q.head, q.p1b, 0.5), mul(dp, q.r * 1.0)), add(q.p1b, mul(dm, q.r * 0.95)), add(q.p2b, add(mul(dm, q.r * 0.7), mul(dd, 0.6)))], T(0.38)));
      // 背側弾性靱帯：中節骨の背中から末節骨へ。ふだんはこれで爪が引っこんでいる
      if (d !== 1) elast.push(S([add(lerp(q.p1b, q.p2b, 0.35), add(mul(dm, q.r * 0.8), [q.r * 0.6, 0, 0])), add(q.p2b, add(mul(dd, 2.4), [q.r * 0.3, 0, 0]))], T(0.5)));
      else elast.push(S([add(q.p1b, add(mul(dp, q.r * 0.6), mul(q.dirP, -2))), add(q.p1b, mul(dd, 2.2))], T(0.45)));
    }
    M(isFore ? 'FlexTendonsF' : 'FlexTendonsH', `${dig}の屈筋腱（深${dig}屈筋の腱）`, 'Tendines m. flexoris digitorum profundi', reg, 2, { origin: `深${dig}屈筋`, insertion: `各${dig}の末節骨（屈筋結節）`, action: `${dig}を曲げる。引くと末節骨が前へ回って爪が出る` },
      flexT, { ...fine, kind: 'tendon', h: 0.12, noCarve: true });
    M(isFore ? 'ExtTendonsF' : 'ExtTendonsH', `${dig}の伸筋腱`, 'Tendines m. extensoris digitorum', reg, 2, { origin: `総${dig}伸筋・外側${dig}伸筋`, insertion: `各${dig}の末節骨（伸筋突起）`, action: `${dig}をのばす（指を広げる）` },
      extT, { ...fine, kind: 'tendon', h: 0.12, noCarve: true });
    M(isFore ? 'ElasticLigF' : 'ElasticLigH', `背側弾性靱帯（${pre}・爪を引っこめる）`, 'Ligg. elastica dorsalia', reg, 2, { origin: '中節骨の背中側', insertion: '末節骨の背中側', action: 'ふだんは爪を引っこめておく。深い屈筋が引くとのびて爪が出る' },
      elast, { ...fine, kind: 'tendon', h: 0.12, noCarve: true });
  }
}
