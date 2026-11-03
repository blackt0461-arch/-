// 部屋の形と、部屋の種類・雰囲気。
// 家具そのものの一覧は items.js。

export const ROOM = { w: 6, d: 5, h: 2.8 };
export const WINDOW = { x: -0.7, w: 2.2, y0: 0.6, y1: 2.35 }; // 奥の壁(-z)の窓
export const DOOR = { x: 1.75, w: 0.86, h: 2.05 };             // 手前の壁(+z)のドア

// 部屋の種類。unlock = 開くランク。level = 階（1 なら2階で、窓の外を3m上から見る）
export const ROOMS = [
  { id: 'living', name: 'リビング', icon: 'sofa', level: 0, unlock: 1 },
  { id: 'hobby', name: '趣味部屋', icon: 'music', level: 1, unlock: 4 },
  { id: 'bedroom', name: '寝室', icon: 'moon', level: 1, unlock: 7 },
  { id: 'study', name: '書斎', icon: 'book', level: 1, unlock: 10 },
];
export function roomDef(id) { return ROOMS.find(r => r.id === id) || ROOMS[0]; }

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
