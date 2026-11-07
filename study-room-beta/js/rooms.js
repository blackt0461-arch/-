// 部屋の形と、部屋の種類・雰囲気。
// 家具そのものの一覧は items.js。

// 形の指定がない部屋の形（＝リビング）。古い部屋のデータもこれで開く
export const ROOM = { w: 6, d: 5, h: 2.8 };
export const WINDOW = { x: -0.7, w: 2.2, y0: 0.6, y1: 2.35 }; // 奥の壁(-z)の窓
export const DOOR = { x: 1.75, w: 0.86, h: 2.05 };             // 手前の壁(+z)のドア

// 部屋の種類。
//   home   = 'main'（家）| 'villa'（別荘）
//   unlock = 開くランク（別荘の部屋は、別荘が開いたときにまとめて開く）
//   level  = 階（1 なら2階で、窓の外を3m上から見る）
//   shape  = 部屋の形（下の roomShape を参照）。書かない所はリビングと同じ
//     w, d, h          : 幅(x)・奥行(z)・天井の高さ（m）
//     windows          : [{ wall, a, w, y0, y1, open }] 1つ目が「窓のデザイン・カーテン・光の筋」の窓（奥の壁 -z に置く）
//                        wall = '-z' | '+z' | '-x' | '+x'、a = 壁にそった位置（-z/+z の壁なら x、-x/+x の壁なら z）
//                        open = ガラスなし（露天風呂の大きな開口）
//     door             : { wall, a } ドア（大きさは 0.86×2.05 で共通）
//     notch            : { corner: '+x+z' など, w, d } 部屋の角を切り取って L 字にする
//     slope            : { start, low } 屋根裏の斜めの天井（x が start より右(+x)で、右の壁で low の高さまで下がる）
//     skylight         : { u, z, len, wid } 斜めの天井の天窓（u = 斜めの面にそった中心の位置 0〜1）
//     built            : 最初から備え付けの物（roomfix.js）。買えない・数に入らない・家具は重ねて置けない
//     cam              : [x, z] 入ったときに立つ位置
//     ceil             : 天井の色、plain: true ならエアコン・コンセント・火災報知器なし
//   surf    = 最初の壁・床（items.js の id）。keepSurf なら雰囲気を選んでも壁と床は変えない
export const ROOMS = [
  { id: 'living', name: 'リビング', icon: 'sofa', home: 'main', level: 0, unlock: 1 },
  { id: 'kitchen', name: 'キッチン', icon: 'cook', home: 'main', level: 0, unlock: 3,
    shape: { w: 5.4, d: 5.8, h: 2.6,
      windows: [{ wall: '-z', a: -0.9, w: 2.0, y0: 0.85, y1: 2.15 }],
      door: { wall: '-x', a: 1.7 }, cam: [-0.7, 1.7],
      ac: { wall: '-x', a: -1.2 },
      built: [{ kind: 'kitchen', wall: '+x', a0: -2.9, len: 3.0 }, { kind: 'fridge', wall: '+x', a: 0.55 }] } },
  { id: 'hobby', name: '趣味部屋', icon: 'music', home: 'main', level: 1, unlock: 4,
    shape: { w: 6.4, d: 5.0, h: 3.0,
      windows: [{ wall: '-z', a: -0.6, w: 2.6, y0: 0.5, y1: 2.5 }],
      door: { wall: '-x', a: 1.5 }, notch: { corner: '+x+z', w: 1.6, d: 1.3 }, cam: [-0.4, 0.9],
      ac: { wall: '-x', a: -1.2 } } },
  { id: 'bath', name: 'お風呂', icon: 'bath', home: 'main', level: 0, unlock: 6, keepSurf: true,
    surf: { wall: 'wall-white-tile', floor: 'floor-mosaic-tile' },
    shape: { w: 2.8, d: 3.2, h: 2.4, plain: true,
      windows: [{ wall: '-z', a: -0.6, w: 1.2, y0: 1.25, y1: 2.0 }],
      door: { wall: '+z', a: 0.75 }, cam: [0.1, 1.15],
      built: [{ kind: 'bathtub', x: -0.6, z: -1.2, w: 1.6, d: 0.8 }, { kind: 'shower', wall: '+x', a: -0.25 }, { kind: 'washarea', x: 0.75, z: -0.25 }] } },
  { id: 'bedroom', name: '寝室', icon: 'moon', home: 'main', level: 1, unlock: 7,
    shape: { w: 5.6, d: 5.4, h: 2.7,
      windows: [{ wall: '-z', a: 0.3, w: 1.8, y0: 0.7, y1: 2.2 }, { wall: '-x', a: -0.8, w: 1.2, y0: 0.9, y1: 2.1 }],
      door: { wall: '+z', a: -1.9 }, cam: [0.6, 1.4], ac: { wall: '+x', a: 0 } } },
  { id: 'washroom', name: '洗面所', icon: 'drop', home: 'main', level: 0, unlock: 9, keepSurf: true,
    surf: { wall: 'wall-white-paint', floor: 'floor-grey-tiles' },
    shape: { w: 3.2, d: 3.0, h: 2.4, plain: true,
      windows: [{ wall: '-z', a: 0.75, w: 0.9, y0: 1.3, y1: 2.0 }],
      door: { wall: '+z', a: 0.8 }, cam: [0.4, 0.8],
      built: [{ kind: 'vanity', wall: '-x', a: -0.2 }, { kind: 'washer', x: -0.95, z: -1.15 }] } },
  { id: 'study', name: '書斎', icon: 'book', home: 'main', level: 1, unlock: 10,
    shape: { w: 4.2, d: 5.6, h: 3.2,
      windows: [{ wall: '-z', a: 0, w: 1.4, y0: 0.8, y1: 2.7 }],
      door: { wall: '+z', a: 1.3 }, cam: [-0.3, 1.6], ac: { wall: '-x', a: 0.2 } } },
  { id: 'attic', name: '屋根裏部屋', icon: 'attic', home: 'main', level: 2, unlock: 12,
    shape: { w: 5.6, d: 5.0, h: 2.7, plain: true,
      windows: [{ wall: '-z', a: -1.6, w: 1.2, y0: 0.8, y1: 2.0 }],
      door: { wall: '-x', a: 1.4 }, slope: { start: -0.4, low: 1.1 },
      skylight: { u: 0.45, z: 0.3, len: 1.1, wid: 0.9 }, cam: [-1.2, 0.6] } },
  { id: 'sunroom', name: 'サンルーム', icon: 'sun', home: 'main', level: 0, unlock: 14,
    shape: { w: 5.0, d: 4.0, h: 2.7, plain: true,
      windows: [{ wall: '-z', a: 0, w: 4.2, y0: 0.3, y1: 2.4 }, { wall: '-x', a: -0.3, w: 2.6, y0: 0.3, y1: 2.4 }, { wall: '+x', a: -0.3, w: 2.6, y0: 0.3, y1: 2.4 }],
      door: { wall: '+z', a: 1.6 }, cam: [-0.2, 1.0] } },
  { id: 'closet', name: 'クローゼット', icon: 'hanger', home: 'main', level: 1, unlock: 16,
    shape: { w: 3.2, d: 3.6, h: 2.5, plain: true,
      windows: [{ wall: '-z', a: 0, w: 0.8, y0: 1.5, y1: 2.15 }],
      door: { wall: '+z', a: 0 }, cam: [0, 1.0],
      built: [{ kind: 'closet', wall: '-x', a0: -1.8, len: 2.6 }, { kind: 'closet', wall: '+x', a0: -1.8, len: 2.6 }] } },
  { id: 'washitsu', name: '和室', icon: 'tatami', home: 'main', level: 0, unlock: 18, keepSurf: true,
    surf: { wall: 'wall-juraku', floor: 'floor-tatami' },
    shape: { w: 4.6, d: 4.6, h: 2.5, ceil: '#cdb08a',
      windows: [{ wall: '-z', a: 0.5, w: 2.6, y0: 0.4, y1: 2.1 }],
      door: { wall: '+z', a: -1.5 }, cam: [0.4, 1.0], ac: { wall: '+z', a: 0.9 },
      built: [{ kind: 'shoji', win: 0 }, { kind: 'tokonoma', wall: '-x', a0: -2.3, len: 1.6 }, { kind: 'fusuma', wall: '+x', a0: -1.2, len: 2.8 }] } },
  { id: 'atelier', name: 'アトリエ', icon: 'palette', home: 'main', level: 0, unlock: 21, keepSurf: true,
    surf: { wall: 'wall-white-brick', floor: 'floor-concrete' },
    shape: { w: 6.6, d: 6.0, h: 3.4,
      windows: [{ wall: '-z', a: 1.0, w: 3.0, y0: 0.9, y1: 2.9 }],
      door: { wall: '+x', a: 2.0 }, notch: { corner: '-x-z', w: 1.8, d: 1.6 }, cam: [0.6, 1.4],
      ac: { wall: '+z', a: -1.0 },
      built: [{ kind: 'shutter', wall: '-x', a: 0.9 }, { kind: 'workbench', wall: '+z', a: 1.0 }] } },

  // ---- 別荘（家の部屋が全部開いて、どの部屋にも家具を6個以上置くと開く） ----
  { id: 'v-living', name: '海のリビング', icon: 'wave', home: 'villa', level: 0, unlock: 0,
    shape: { w: 7.0, d: 5.6, h: 3.0,
      windows: [{ wall: '-z', a: 0, w: 5.0, y0: 0.15, y1: 2.7 }],
      door: { wall: '+z', a: 2.4 }, cam: [0, 1.6], ac: { wall: '-x', a: 0 } } },
  { id: 'v-bedroom', name: 'テラス寝室', icon: 'moon', home: 'villa', level: 1, unlock: 0,
    shape: { w: 5.4, d: 4.8, h: 2.8,
      windows: [{ wall: '-z', a: -0.3, w: 3.4, y0: 0.1, y1: 2.45 }, { wall: '+x', a: -0.6, w: 1.4, y0: 0.8, y1: 2.2 }],
      door: { wall: '+z', a: 1.8 }, cam: [0.2, 1.2], ac: { wall: '-x', a: 0 } } },
  { id: 'v-bath', name: '露天風呂', icon: 'bath', home: 'villa', level: 0, unlock: 0, keepSurf: true,
    surf: { wall: 'wall-stone', floor: 'floor-hinoki' },
    shape: { w: 4.4, d: 3.8, h: 2.6, plain: true, ceil: '#b89268',
      windows: [{ wall: '-z', a: 0, w: 3.4, y0: 0.7, y1: 2.35, open: true }],
      door: { wall: '+z', a: 1.3 }, cam: [0.4, 1.1],
      built: [{ kind: 'hinoki', x: -0.6, z: -1.2, w: 2.2, d: 1.1 }, { kind: 'shower', wall: '+x', a: 0.2 }, { kind: 'washarea', x: 1.3, z: 0.5 }] } },

  // ---- 山小屋（雪山の中の丸太小屋。開く条件・行き来のボタンは main.js 側）----
  { id: 'c-living', name: '暖炉のリビング', icon: 'flame', home: 'cabin', level: 0, unlock: 0,
    surf: { wall: 'wall-raw-plank', floor: 'floor-worn-wood' },
    shape: { w: 6.4, d: 5.6, h: 3.0, plain: true, ceil: '#8a6a4c',
      windows: [{ wall: '-z', a: 0.6, w: 3.6, y0: 0.45, y1: 2.6 }],
      door: { wall: '+z', a: 2.2 }, cam: [0.4, 1.5],
      built: [{ kind: 'fireplace', wall: '-x', a: 0.2, len: 1.7 }, { kind: 'beams', zs: [-1.3, 1.3] }] } },
  { id: 'c-loft', name: 'ロフトの寝室', icon: 'moon', home: 'cabin', level: 1, unlock: 0,
    surf: { wall: 'wall-cedar', floor: 'floor-old-wood' },
    shape: { w: 5.6, d: 4.8, h: 2.8, plain: true, ceil: '#a07e5a',
      windows: [{ wall: '-z', a: -1.4, w: 1.4, y0: 0.7, y1: 2.1 }],
      door: { wall: '-x', a: 1.4 }, slope: { start: -0.2, low: 1.2 },
      skylight: { u: 0.45, z: 0.2, len: 1.1, wid: 0.9 }, cam: [-1.2, 0.6] } },
  { id: 'c-study', name: '薪ストーブの書斎', icon: 'book', home: 'cabin', level: 0, unlock: 0,
    surf: { wall: 'wall-wood-plank', floor: 'floor-dark-planks' },
    shape: { w: 4.6, d: 5.0, h: 2.9, plain: true, ceil: '#7a5a40',
      windows: [{ wall: '-z', a: -0.6, w: 1.4, y0: 0.7, y1: 2.5 }],
      door: { wall: '+z', a: 1.4 }, cam: [-0.4, 1.4],
      built: [{ kind: 'woodstove', wall: '+x', a: -1.2 }, { kind: 'beams', zs: [-1.0, 1.0] }] } },
];
export const HOMES = {
  main: { id: 'main', name: '家', icon: 'home' },
  villa: { id: 'villa', name: '別荘', icon: 'palm' },
  cabin: { id: 'cabin', name: '山小屋', icon: 'snow' },
};
export function roomDef(id) { return ROOMS.find(r => r.id === id) || ROOMS[0]; }
export function homeOf(id) { return roomDef(id).home || 'main'; }
export const VILLA_MIN_ITEMS = 6; // 別荘が開く：家のどの部屋にも家具をこれだけ置く

// 部屋の形を、使いやすい形にそろえる（書いていない所はリビングと同じ）
const SHAPES = new Map();
export function roomShape(def) {
  if (def && SHAPES.has(def.id)) return SHAPES.get(def.id);
  const s0 = def?.shape || {};
  const w = s0.w || ROOM.w, d = s0.d || ROOM.d, h = s0.h || ROOM.h;
  const hw = w / 2, hd = d / 2;
  const windows = (s0.windows || [{ wall: '-z', a: WINDOW.x, w: WINDOW.w, y0: WINDOW.y0, y1: WINDOW.y1 }])
    .map((o, i) => ({ ...o, main: i === 0 }));
  const door = { wall: '+z', a: DOOR.x, ...(s0.door || {}), w: DOOR.w, h: DOOR.h };
  let notch = null;
  if (s0.notch) {
    const c = s0.notch.corner;
    const sx = c.includes('+x') ? 1 : -1, sz = c.includes('+z') ? 1 : -1;
    const x0 = sx > 0 ? hw - s0.notch.w : -hw, x1 = sx > 0 ? hw : -hw + s0.notch.w;
    const z0 = sz > 0 ? hd - s0.notch.d : -hd, z1 = sz > 0 ? hd : -hd + s0.notch.d;
    notch = { sx, sz, x0, x1, z0, z1 };
  }
  const slope = s0.slope ? { start: s0.slope.start, low: s0.slope.low } : null;
  const sh = {
    id: def?.id, w, d, h, hw, hd, windows, door, notch, slope,
    skylight: s0.skylight || null,
    built: s0.built || [],
    cam: s0.cam || [0.2, 1.2],
    ceil: s0.ceil || '#f3f0ea',
    plain: !!s0.plain,
    ac: s0.plain ? null : (s0.ac || { wall: '-x', a: -1.0 }),
    outlets: s0.outlets || (def?.shape ? null : [['+z', -1.6], ['-x', -1.4], ['+x', 1.6], ['-z', 1.0]]),
  };
  sh.walls = wallsOf(sh);
  if (def) SHAPES.set(def.id, sh);
  return sh;
}

// 壁の一覧。壁ごとに { id, axis, c, n, a0, a1, e0, e1 }
//   axis 'z' = z が一定の壁（-z/+z）、'x' = x が一定の壁（-x/+x）。c = その座標、n = 部屋の内側への向き(+1/-1)
//   a0〜a1 = 壁にそった範囲、e0/e1 = 角で壁の厚みぶんのばすか（外向きの角だけ）
export function wallsOf(sh) {
  const { hw, hd, notch: nt } = sh;
  const W = [
    { id: '-z', axis: 'z', c: -hd, n: 1, a0: -hw, a1: hw },
    { id: '+z', axis: 'z', c: hd, n: -1, a0: -hw, a1: hw },
    { id: '-x', axis: 'x', c: -hw, n: 1, a0: -hd, a1: hd },
    { id: '+x', axis: 'x', c: hw, n: -1, a0: -hd, a1: hd },
  ].map(w => ({ ...w, e0: true, e1: true }));
  if (nt) {
    // 切り取った角に接する2つの壁を短くして、切り口に2つの壁を足す
    const zw = W.find(w => w.id === (nt.sz > 0 ? '+z' : '-z'));
    if (nt.sx > 0) zw.a1 = nt.x0; else zw.a0 = nt.x1;
    const xw = W.find(w => w.id === (nt.sx > 0 ? '+x' : '-x'));
    if (nt.sz > 0) xw.a1 = nt.z0; else xw.a0 = nt.z1;
    // 切り口の壁（内側の角は、のばさない）
    const nxC = nt.sx > 0 ? nt.x0 : nt.x1, nzC = nt.sz > 0 ? nt.z0 : nt.z1;
    W.push({ id: 'nx', axis: 'x', c: nxC, n: -nt.sx, a0: nt.z0, a1: nt.z1, e0: nt.sz > 0 ? false : true, e1: nt.sz > 0 ? true : false });
    W.push({ id: 'nz', axis: 'z', c: nzC, n: -nt.sz, a0: nt.x0, a1: nt.x1, e0: nt.sx > 0 ? false : true, e1: nt.sx > 0 ? true : false });
  }
  return W;
}

// その場所の天井の高さ（屋根裏は右へ行くほど低い）
export function ceilAt(sh, x) {
  const s = sh.slope;
  if (!s || x <= s.start) return sh.h;
  return sh.h - (sh.h - s.low) * Math.min(1, (x - s.start) / (sh.hw - s.start));
}

// 部屋の雰囲気。家具を買うときの候補の出やすさに使う。
// preview = 選ぶ前に部屋に映して見せる壁と床（items.js に依存しない書き方）
export const STYLES = [
  { id: 'natural', name: 'ナチュラル', desc: '明るい木・白・グリーン',
    preview: { wall: { color: '#eeeae3' }, floor: { tex: 'oak_wood_planks', rep: 3 } } },
  { id: 'industrial', name: 'インダストリアル', desc: '黒い鉄・革・コンクリート',
    preview: { wall: { tex: 'concrete_wall_008', rep: 1.5 }, floor: { tex: 'old_wood_floor', rep: 3 } } },
  { id: 'retro', name: 'レトロ', desc: 'こげ茶の木・真ちゅう・あたたかい色',
    preview: { wall: { tex: 'raw_plank_wall', rep: 1.1 }, floor: { tex: 'wood_floor_worn', rep: 3 } } },
  { id: 'modern', name: 'モダン', desc: '白・グレー・すっきりした形',
    preview: { wall: { color: '#e9e9e7' }, floor: { tex: 'large_grey_tiles', rep: 3 } } },
];
export function styleDef(id) { return STYLES.find(s => s.id === id) || STYLES[0]; }
