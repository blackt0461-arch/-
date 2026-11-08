// 物理の統合（1.17.0）：前の「物理（公式）」100問を、教科書の ジャンル・単元（物理基礎6・物理7）に入れなおす。
// main.js（問題の分け方）と store.js（前の記録の数えなおし）の両方で使う。
import { PROBLEMS } from './problems.js';

const KISO = '物理基礎', BUTSURI = '物理';
function unitOf(p) {
  const n = p.formula?.name || '', hs1 = p.grade === 'hs1';
  if (p.unit === '力学') {
    if (/水平投射/.test(n)) return [BUTSURI, '平面内の運動と剛体'];
    if (/運動量|力積/.test(n)) return [BUTSURI, '運動量と力積'];
    if (/円運動/.test(n)) return [BUTSURI, '円運動と単振動'];
    if (/仕事|エネルギー/.test(n)) return [KISO, '仕事と力学的エネルギー'];
    if (/等加速度|自由落下|鉛直投げ/.test(n)) return [KISO, '運動の表し方'];
    return [KISO, '運動の法則']; // 運動方程式・摩擦・斜面・フックの法則・浮力
  }
  if (p.unit === '熱') return hs1 ? [KISO, '熱'] : [BUTSURI, '気体の性質と熱力学'];
  if (p.unit === '波動') {
    if (hs1) return [KISO, '波'];
    return /単振動/.test(n) ? [BUTSURI, '円運動と単振動'] : [BUTSURI, '音と光'];
  }
  if (p.unit === '電磁気') return hs1 ? [KISO, '電気'] : [BUTSURI, '電気と磁気'];
  return [KISO, p.unit];
}
// 問題ID → [ジャンル, 単元]
export const PHY_UNIT = Object.fromEntries(PROBLEMS.map(p => [p.id, unitOf(p)]));
// 前の分け方（力学・熱・波動・電磁気）の名前
export const OLD_PHY_UNITS = ['力学', '熱', '波動', '電磁気'];
