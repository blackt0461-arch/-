// バンドシリーズを全部そろえた部屋の見本（ガチャ画面の「全部そろえた部屋を見る」で、見るだけで開く）。
// 部屋は「趣味部屋」（天井が高い 6.4m×5m、奥に大きな窓、左の壁にドア、右手前の角が欠けた L 字）。
// 奥の右すみがドラムのステージ、その上にトラス照明。右の壁にアンプ、左の壁にソファとポスター。
// 置き方は room3d の決まり（壁・ドアの前・窓・重なり）に合うことを確かめてある。
export const BAND_SAMPLE = {
  id: 'hobby',
  style: 'industrial',
  surf: {
    wall: 'g4-band-wall',
    floor: 'g4-band-floor',
    door: 'g4-band-door',
    window: 'window-grid6-black',
    curtain: 'curtain-charcoal',
  },
  placed: [
    // 天井・壁
    { uid: 'bs-truss', item: 'g5-stage-truss', x: 1.35, z: -0.55, rot: Math.PI },
    { uid: 'bs-neon', item: 'g5-neon-rock', wall: '+x', a: 0.4, y: 2.45 },
    { uid: 'bs-posters', item: 'g4-band-posters', wall: '-x', a: -0.05, y: 1.62 },
    // ステージ（奥の右すみ）
    { uid: 'bs-rug', item: 'g4-band-rug', x: 2.0, z: -1.5, rot: -0.3 },
    { uid: 'bs-drums', item: 'g5-drum-kit', x: 2.2, z: -1.6, rot: -0.3 },
    { uid: 'bs-mic', item: 'g4-band-mic', x: 0.85, z: -0.15, rot: -0.6 },
    { uid: 'bs-spot', item: 'g4-band-spot', x: 0.35, z: -2.05, rot: 1.35 },
    // 右の壁：アンプとギター
    { uid: 'bs-amp', item: 'g5-amp-stack', x: 3.0, z: 0.4, rot: -Math.PI / 2 },
    { uid: 'bs-guitar', item: 'g5-neon-guitar', x: 2.3, z: 0.72, rot: -0.9 },
    { uid: 'bs-pedals', item: 'g4-band-pedals', x: 1.42, z: 0.78, rot: -0.35 },
    // 窓の前：キーボード
    { uid: 'bs-keys', item: 'g4-band-keys', x: -0.75, z: -2.05, rot: 0 },
    { uid: 'bs-throne', item: 'g4-band-throne', x: -0.75, z: -1.2, rot: 0 },
    // 左の壁：くつろぐ所
    { uid: 'bs-shelf', item: 'g4-band-shelf', x: -2.65, z: -2.25, rot: 0 },
    { uid: 'bs-sofa', item: 'g5-stud-sofa', x: -2.7, z: -0.3, rot: Math.PI / 2 },
    { uid: 'bs-case', item: 'g4-band-case', x: -1.7, z: -0.3, rot: Math.PI / 2 },
    // 手前の壁
    { uid: 'bs-planter', item: 'g4-band-planter', x: -0.6, z: 2.1, rot: 0 },
  ],
};
