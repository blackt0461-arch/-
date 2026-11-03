// 部屋・家具のカタログ。
// 3Dデータと質感は Poly Haven（CC0、無料・クレジット不要）のものを読み込む。
// model: Poly Haven のモデルID / tex: Poly Haven のテクスチャID / proc: 自作の形
// rot: 向きの補正（ラジアン）

const P = Math.PI;

// 置き場所。mount: floor（床に置く）/ wall（壁に掛ける）/ ceiling（天井から吊る）
// wall: その物が背中をつける壁（'+x' '-x' '-z' '+z'）
// face: 正面を向ける方向（Y軸回転）
export const ROOM = { w: 6, d: 5, h: 2.8 };
export const WINDOW = { x: -0.7, w: 2.2, y0: 0.6, y1: 2.35 }; // 奥の壁(-z)の窓

// どの部屋でも共通の基本の種類（壁・床・カーテン・天井の照明）
const WALLS = {
  name: '壁', icon: '🧱', surface: 'wall',
  variants: {
    natural: [
      { name: '白い塗り壁', color: '#eeeae3' },
      { name: '木の板張り', tex: 'wood_plank_wall', rep: 1.2 },
      { name: '淡いグリーンの塗り壁', color: '#cfdcc6' },
    ],
    industrial: [
      { name: 'コンクリート打ちっぱなし', tex: 'concrete_wall_008', rep: 1.5 },
      { name: '白いレンガ', tex: 'white_bricks', rep: 2 },
      { name: '黒い板張り', tex: 'black_painted_planks', rep: 1.2 },
    ],
    retro: [
      { name: '古い木の壁', tex: 'raw_plank_wall', rep: 1.1 },
      { name: '赤レンガ', tex: 'red_brick_03', rep: 2 },
      { name: 'クリーム色の塗り壁', color: '#efe2c4' },
    ],
    music: [
      { name: '古い木の壁', tex: 'raw_plank_wall', rep: 1.1 },
      { name: 'コンクリート', tex: 'concrete_wall_008', rep: 1.5 },
      { name: '黒い板張り', tex: 'black_painted_planks', rep: 1.2 },
    ],
    manga: [
      { name: '白い塗り壁', color: '#eeeae3' },
      { name: 'クリーム色の塗り壁', color: '#efe2c4' },
      { name: '木の板張り', tex: 'wood_plank_wall', rep: 1.2 },
    ],
    game: [
      { name: '黒い板張り', tex: 'black_painted_planks', rep: 1.2 },
      { name: 'コンクリート', tex: 'concrete_wall_008', rep: 1.5 },
      { name: '白いレンガ', tex: 'white_bricks', rep: 2 },
    ],
  },
};
const FLOORS = {
  name: '床', icon: '🪵', surface: 'floor',
  variants: {
    natural: [
      { name: '明るいオーク', tex: 'oak_wood_planks', rep: 3 },
      { name: 'ヘリンボーン', tex: 'herringbone_parquet', rep: 3 },
      { name: '白っぽい板', tex: 'white_planks_clean', rep: 3 },
    ],
    industrial: [
      { name: 'コンクリート', tex: 'concrete_floor_02', rep: 2 },
      { name: '古い木の床', tex: 'old_wood_floor', rep: 3 },
      { name: 'グレーのタイル', tex: 'large_grey_tiles', rep: 3 },
    ],
    retro: [
      { name: '使い込んだ木の床', tex: 'wood_floor_worn', rep: 3 },
      { name: 'こげ茶の板', tex: 'dark_wooden_planks', rep: 3 },
      { name: 'テラコッタタイル', tex: 'terracotta_floor_tiles', rep: 3 },
    ],
    music: [
      { name: '使い込んだ木の床', tex: 'wood_floor_worn', rep: 3 },
      { name: 'こげ茶の板', tex: 'dark_wooden_planks', rep: 3 },
      { name: 'コンクリート', tex: 'concrete_floor_02', rep: 2 },
    ],
    manga: [
      { name: '明るいオーク', tex: 'oak_wood_planks', rep: 3 },
      { name: 'ヘリンボーン', tex: 'herringbone_parquet', rep: 3 },
      { name: 'ひのきの板', tex: 'hinoki_planks', rep: 3 },
    ],
    game: [
      { name: 'こげ茶の板', tex: 'dark_wooden_planks', rep: 3 },
      { name: 'グレーのタイル', tex: 'large_grey_tiles', rep: 3 },
      { name: '明るいオーク', tex: 'oak_wood_planks', rep: 3 },
    ],
  },
};
// 方向性ごとに候補を分ける（部屋の雰囲気に合う物だけを出す）
// tint: 部屋の色に合わせて塗り直す色（元の色にかけ合わせる）
const CURTAIN = {
  name: 'カーテン', icon: '🪟', slot: 'curtain',
  variants: {
    natural: [
      { name: '白いレース', proc: 'curtain', color: '#f4efe6', opacity: 0.55 },
      { name: 'リネンのベージュ', proc: 'curtain', color: '#d8c7ab', opacity: 0.92 },
      { name: 'セージグリーン', proc: 'curtain', color: '#9fae92', opacity: 0.95 },
    ],
    industrial: [
      { name: 'グレーのリネン', proc: 'curtain', color: '#9a9a96', opacity: 0.93 },
      { name: 'チャコール', proc: 'curtain', color: '#3b3b3d', opacity: 0.97 },
      { name: '白いレース', proc: 'curtain', color: '#eceae6', opacity: 0.55 },
    ],
    retro: [
      { name: 'からし色', proc: 'curtain', color: '#b98a3a', opacity: 0.95 },
      { name: 'えんじ色', proc: 'curtain', color: '#7a2f2a', opacity: 0.97 },
      { name: 'クリームのレース', proc: 'curtain', color: '#efe0c2', opacity: 0.6 },
    ],
    music: [
      { name: 'からし色', proc: 'curtain', color: '#b98a3a', opacity: 0.95 },
      { name: '深いグリーン', proc: 'curtain', color: '#3f5a45', opacity: 0.97 },
      { name: 'えんじ色', proc: 'curtain', color: '#7a2f2a', opacity: 0.97 },
    ],
    manga: [
      { name: '白いレース', proc: 'curtain', color: '#f4efe6', opacity: 0.55 },
      { name: 'リネンのベージュ', proc: 'curtain', color: '#d8c7ab', opacity: 0.92 },
      { name: 'うすい水色', proc: 'curtain', color: '#b9cbd3', opacity: 0.93 },
    ],
    game: [
      { name: '遮光のネイビー', proc: 'curtain', color: '#23304a', opacity: 0.98 },
      { name: 'チャコール', proc: 'curtain', color: '#3b3b3d', opacity: 0.97 },
      { name: '深いワインレッド', proc: 'curtain', color: '#4e1f2a', opacity: 0.98 },
    ],
  },
};
const CEIL_LIGHT = {
  name: '天井の照明', icon: '💡', slot: 'ceil',
  variants: {
    natural: [
      { name: '白いペンダント', model: 'modern_ceiling_lamp_01', light: '#ffe2bd' },
      { name: 'シーリングファン', model: 'ceiling_fan', light: '#ffe6c8' },
      { name: '裸電球のソケット', model: 'pull_chain_light_socket', light: '#ffd9a0' },
    ],
    industrial: [
      { name: '工場のランプ', model: 'hanging_industrial_lamp', light: '#ffcf8f' },
      { name: 'かご付きライト', model: 'caged_hanging_light', light: '#ffd49a' },
      { name: '黒いペンダント', model: 'modern_ceiling_lamp_01', paint: '#2a2a2a', light: '#ffd9a8' },
    ],
    retro: [
      { name: 'シャンデリア', model: 'Chandelier_01', light: '#ffc98a' },
      { name: '真ちゅうのシャンデリア', model: 'Chandelier_02', light: '#ffc98a' },
      { name: 'ランタンのシャンデリア', model: 'lantern_chandelier_01', light: '#ffbf7a' },
    ],
  },
};
CEIL_LIGHT.variants.music = CEIL_LIGHT.variants.retro;
CEIL_LIGHT.variants.manga = CEIL_LIGHT.variants.natural;
CEIL_LIGHT.variants.game = CEIL_LIGHT.variants.industrial;

// 壁の絵（自作の額縁に、窓の外と同じ Poly Haven の写真を入れる）。額の色は部屋に合わせる
const pics = (a, b, c) => [
  { name: '夕日の海の写真', proc: 'frame', img: 'img/out-sunset.jpg', frame: a, w: 0.9, h: 0.6 },
  { name: '草原の写真', proc: 'frame', img: 'img/out-morning.jpg', frame: b, w: 0.7, h: 0.5 },
  { name: '夜景の写真', proc: 'frame', img: 'img/out-night.jpg', frame: c, w: 1.0, h: 0.55 },
];
const PICTURES = {
  name: '壁の絵', icon: '🖼️', slot: 'picture',
  variants: {
    natural: pics('#c9a77c', '#f1ece3', '#b08a5e'),
    industrial: pics('#1d1d1d', '#2b2b2b', '#5a5a5a'),
    retro: pics('#7a5a2a', '#4a3020', '#8c6b2e'),
    music: pics('#4a3020', '#7a5a2a', '#1d1d1d'),
    manga: pics('#c9a77c', '#f1ece3', '#b08a5e'),
    game: pics('#1d1d1d', '#2b2b2b', '#111111'),
  },
};
const RUG = (slot) => ({
  name: 'ラグ', icon: '🧶', slot,
  variants: {
    natural: [
      { name: 'ウールのヘリンボーン', tex: 'poly_wool_herringbone', rep: 2 },
      { name: '生成りのジャカード', tex: 'quatrefoil_jacquard_fabric', rep: 2 },
      { name: 'セージのウール', tex: 'poly_wool_herringbone', rep: 2, tint: '#b9c7ae' },
    ],
    industrial: [
      { name: 'デニム', tex: 'denim_fabric', rep: 2 },
      { name: 'グレーのウール', tex: 'poly_wool_herringbone', rep: 2, tint: '#8f8f8f' },
      { name: '黒い革', tex: 'fabric_leather_02', rep: 2, tint: '#4a4a4a' },
    ],
    retro: [
      { name: '模様の織物', tex: 'fabric_pattern_05', rep: 2 },
      { name: '幾何学の織物', tex: 'fabric_pattern_07', rep: 2 },
      { name: 'えんじのジャカード', tex: 'quatrefoil_jacquard_fabric', rep: 2, tint: '#b4664e' },
    ],
  },
});
const RUG_H = RUG('rug');
RUG_H.variants.music = RUG_H.variants.retro;
RUG_H.variants.manga = RUG_H.variants.natural;
RUG_H.variants.game = RUG_H.variants.industrial;

// 部屋のテーマ。directions = 最初に選ぶ「部屋の方向性」。
export const ROOMS = [
  {
    id: 'living', name: 'リビング', icon: '🛋️',
    question: 'どんなリビングにしますか？',
    directions: [
      { id: 'natural', name: 'ナチュラル', desc: '明るい木と白と緑、朝のやわらかい光', sun: 'morning' },
      { id: 'industrial', name: 'インダストリアル', desc: '黒い鉄と革とコンクリート、くもり空の光', sun: 'overcast' },
      { id: 'retro', name: 'レトロ', desc: 'こげ茶の木と真ちゅう、夕日のあたたかい光', sun: 'sunset' },
    ],
    slots: {
      curtain: { mount: 'window' },
      ceil: { mount: 'ceiling', x: 0.9, z: -0.4, max: 0.8 },
      sofa: { mount: 'floor', wall: '+x', x: 2.5, z: 0.3, face: -P / 2, max: 2.3 },
      table: { mount: 'floor', x: 1.15, z: 0.3, face: -P / 2, max: 1.3 },
      rug: { mount: 'rug', x: 1.3, z: 0.3, w: 2.6, d: 1.9 },
      shelf: { mount: 'floor', wall: '-x', x: -2.7, z: 0.9, face: P / 2, max: 2.0 },
      plant: { mount: 'floor', x: -2.45, z: -2.0, face: 0, max: 1.6 },
      plant2: { mount: 'floor', x: 2.55, z: -2.05, face: 0, max: 1.0 },
      chair: { mount: 'floor', x: -0.9, z: 1.75, face: P * 0.8, max: 1.1 },
      picture: { mount: 'wall', wall: '+x', x: 2.98, y: 1.7, z: 0.3, face: -P / 2, max: 1.0 },
      clock: { mount: 'wall', wall: '-z', x: 1.7, y: 1.95, z: -2.48, face: 0, max: 0.6 },
      side: { mount: 'floor', x: 2.55, z: 1.75, face: -P / 2, max: 0.8 },
    },
    // 特別な家具（克服のごほうび）を置く場所
    specialSlots: [
      { mount: 'floor', wall: '-z', x: 2.2, z: -2.3, face: 0, max: 2.1 },
      { mount: 'floor', x: -2.4, z: 2.0, face: P * 0.75, max: 1.3 },
      { mount: 'floor', x: -2.55, z: -0.6, face: P / 2, max: 1.0 },
    ],
    kinds: {
      wall: WALLS,
      floor: FLOORS,
      sofa: { name: 'ソファ', icon: '🛋️', slot: 'sofa', variants: {
        natural: [
          { name: '生成りのソファ', model: 'Sofa_01', tint: '#f3eee4' },
          { name: '白い木わくのソファ', model: 'painted_wooden_sofa', paint: '#ece5d6' },
          { name: 'セージのソファ', model: 'Sofa_01', tint: '#c3cfb5' },
        ],
        industrial: [
          { name: '黒い革のソファ', model: 'sofa_02' },
          { name: 'グレーのソファ', model: 'Sofa_01', tint: '#8d8d8d' },
          { name: 'チャコールの木わくソファ', model: 'painted_wooden_sofa', paint: '#454545' },
        ],
        retro: [
          { name: '彫刻のソファ', model: 'sofa_03' },
          { name: '中国風の長いす', model: 'chinese_sofa' },
          { name: '花がらのデイベッド', model: 'vintage_day_bed' },
        ],
      } },
      ceilLight: CEIL_LIGHT,
      curtain: CURTAIN,
      table: { name: 'ローテーブル', icon: '☕', slot: 'table', variants: {
        natural: [
          { name: '木とコンクリのテーブル', model: 'modern_coffee_table_01' },
          { name: 'シンプルな木のテーブル', model: 'wooden_table_02' },
          { name: '白い木のテーブル', model: 'painted_wooden_table', paint: '#ece6da' },
        ],
        industrial: [
          { name: '鉄わくのテーブル', model: 'industrial_coffee_table' },
          { name: '大理石の丸テーブル', model: 'coffee_table_round_01' },
          { name: '黒い幾何学テーブル', model: 'modern_coffee_table_02' },
        ],
        retro: [
          { name: '彫刻のテーブル', model: 'gothic_coffee_table' },
          { name: '中国風の茶卓', model: 'chinese_tea_table' },
          { name: '低い丸木のテーブル', model: 'WoodenTable_02' },
        ],
      } },
      rug: RUG('rug'),
      shelf: { name: '棚', icon: '📚', slot: 'shelf', variants: {
        natural: [
          { name: '明るい木の飾り棚', model: 'wooden_display_shelves_01' },
          { name: '木と黒鉄の棚', model: 'steel_frame_shelves_01' },
          { name: '白い戸棚', model: 'painted_wooden_cabinet' },
        ],
        industrial: [
          { name: 'スチールの棚', model: 'steel_frame_shelves_02' },
          { name: '引き出しつきスチール棚', model: 'steel_frame_shelves_03' },
          { name: '使い込んだ鉄のラック', model: 'worn_metal_rack' },
        ],
        retro: [
          { name: 'アンティークの戸棚', model: 'vintage_cabinet_01' },
          { name: 'ゴシックのタンス', model: 'GothicCommode_01' },
          { name: '中国風の飾り棚', model: 'chinese_cabinet' },
        ],
      } },
      plant: { name: '観葉植物', icon: '🪴', slot: 'plant', variants: {
        natural: [
          { name: '大きな観葉植物', model: 'potted_plant_01' },
          { name: '素焼き鉢の植物', model: 'potted_plant_02' },
          { name: '白い鉢の多肉植物', model: 'potted_plant_04' },
        ],
        industrial: [
          { name: '白い鉢の多肉植物', model: 'potted_plant_04' },
          { name: '大きな観葉植物', model: 'potted_plant_01' },
          { name: 'ミルク缶', model: 'metal_jug' },
        ],
        retro: [
          { name: '素焼き鉢の植物', model: 'potted_plant_02' },
          { name: '大きな観葉植物', model: 'potted_plant_01' },
          { name: '木のプランター', model: 'planter_box_02' },
        ],
      } },
      chair: { name: 'ひとりがけ椅子', icon: '🪑', slot: 'chair', variants: {
        natural: [
          { name: '木と革のアームチェア', model: 'modern_arm_chair_01' },
          { name: '白い木の椅子', model: 'painted_wooden_chair_01' },
          { name: '木のスツール', model: 'wooden_stool_01' },
        ],
        industrial: [
          { name: 'ラウンジチェア', model: 'mid_century_lounge_chair' },
          { name: '革のオットマン', model: 'Ottoman_01' },
          { name: '鉄のスツール', model: 'metal_stool_01' },
        ],
        retro: [
          { name: 'ロッキングチェア', model: 'Rockingchair_01' },
          { name: 'クラシックなアームチェア', model: 'ArmChair_01' },
          { name: '緑のアームチェア', model: 'GreenChair_01' },
        ],
      } },
      picture: PICTURES,
      clock: { name: '時計', icon: '🕰️', slot: 'clock', variants: {
        natural: [
          { name: 'シンプルな壁掛け時計', model: 'wall_clock' },
          { name: '窓辺の置き時計', model: 'mantel_clock_01', at: { mount: 'floor', wall: null, x: -1.45, z: -2.4, base: 0.62, face: 0 } },
          { name: '窓辺の目覚まし時計', model: 'alarm_clock_01', at: { mount: 'floor', wall: null, x: -1.45, z: -2.4, base: 0.62, face: 0 } },
        ],
        industrial: [
          { name: 'シルバーの壁掛け時計', model: 'wall_clock' },
          { name: 'ダークな壁掛け時計', model: 'wall_clock', tint: '#5a5a5a' },
          { name: '窓辺の目覚まし時計', model: 'alarm_clock_01', at: { mount: 'floor', wall: null, x: -1.45, z: -2.4, base: 0.62, face: 0 } },
        ],
        retro: [
          { name: '電話つきの古い時計', model: 'vintage_telephone_wall_clock' },
          { name: '窓辺の置き時計', model: 'mantel_clock_01', at: { mount: 'floor', wall: null, x: -1.45, z: -2.4, base: 0.62, face: 0 } },
          { name: '真ちゅう色の壁掛け時計', model: 'wall_clock', tint: '#c9a35a' },
        ],
      } },
      side: { name: 'サイドテーブル', icon: '🕯️', slot: 'side', variants: {
        natural: [
          { name: '明るい木の台', model: 'side_table_01' },
          { name: '木のスツール', model: 'wooden_stool_02' },
          { name: '編みかご', model: 'wicker_basket_02' },
        ],
        industrial: [
          { name: '鉄のスツール', model: 'metal_stool_02' },
          { name: '工具ワゴン', model: 'industrial_storage_cart' },
          { name: 'ミルク缶', model: 'metal_jug' },
        ],
        retro: [
          { name: '丸い木の台', model: 'round_wooden_table_02' },
          { name: '背の高い丸テーブル', model: 'side_table_tall_01' },
          { name: '中国風のスツール', model: 'chinese_stool' },
        ],
      } },
      plant2: { name: '飾り', icon: '🏺', slot: 'plant2', variants: {
        natural: [
          { name: '白い花びん', model: 'ceramic_vase_03' },
          { name: '白いつぼ', model: 'ceramic_vase_02' },
          { name: '編みかご', model: 'wicker_basket_01' },
        ],
        industrial: [
          { name: '古いスーツケース', model: 'vintage_suitcase' },
          { name: 'ラジカセ', model: 'boombox' },
          { name: '白い花びん', model: 'ceramic_vase_03' },
        ],
        retro: [
          { name: '真ちゅうの花びん', model: 'brass_vase_01' },
          { name: '宝箱', model: 'treasure_chest' },
          { name: '古いランタン', model: 'Lantern_01' },
        ],
      } },
    },
    order: ['wall', 'floor', 'sofa', 'ceilLight', 'curtain', 'table', 'rug', 'shelf', 'plant', 'chair', 'picture', 'clock', 'side', 'plant2'],
  },
  {
    id: 'hobby', name: '趣味部屋', icon: '🎸',
    question: '何の趣味部屋にしますか？',
    directions: [
      { id: 'music', name: '音楽の部屋', desc: 'こげ茶の木とギター、夕日の光', sun: 'sunset' },
      { id: 'manga', name: '漫画の部屋', desc: '明るい木の本棚と、ごろごろできる場所', sun: 'morning' },
      { id: 'game', name: 'ゲームの部屋', desc: '黒と鉄、テレビとゲーム機、夜の明かり', sun: 'night' },
    ],
    slots: {
      curtain: { mount: 'window' },
      ceil: { mount: 'ceiling', x: 0.5, z: -0.5, max: 0.8 },
      main: { mount: 'floor', wall: '+x', x: 2.4, z: 0.2, face: -P / 2, max: 2.3 },
      shelf: { mount: 'floor', wall: '-x', x: -2.7, z: 0.6, face: P / 2, max: 2.0 },
      a: { mount: 'floor', x: -1.4, z: -1.95, face: P * 0.1, max: 1.3 },
      b: { mount: 'floor', x: 0.9, z: -1.9, face: -P * 0.1, max: 1.3 },
      c: { mount: 'floor', x: 1.0, z: 0.4, face: -P / 2, max: 1.2 },
      d: { mount: 'floor', x: -0.6, z: 1.7, face: P * 0.9, max: 1.1 },
      rug: { mount: 'rug', x: 0.8, z: 0.3, w: 2.4, d: 1.8 },
      picture: { mount: 'wall', wall: '+x', x: 2.98, y: 1.75, z: 0.2, face: -P / 2, max: 1.0 },
    },
    specialSlots: [
      { mount: 'floor', wall: '-z', x: 2.3, z: -2.3, face: 0, max: 2.1 },
      { mount: 'floor', x: -2.5, z: 2.0, face: P * 0.75, max: 1.2 },
      { mount: 'floor', x: -2.55, z: -0.9, face: P / 2, max: 1.0 },
    ],
    kindsByDirection: {
      music: {
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN, rug: RUG_H, picture: PICTURES,
        guitar: { name: 'ギター', icon: '🎸', slot: 'a', variants: [
          { name: 'アコースティックギター', proc: 'guitar', style: 'acoustic' },
          { name: 'エレキギター（赤）', proc: 'guitar', style: 'electric' },
          { name: 'ベース（黒）', proc: 'guitar', style: 'bass' },
        ] },
        audio: { name: 'オーディオ', icon: '📻', slot: 'b', variants: [
          { name: 'ラジカセ', model: 'boombox' },
          { name: 'カセットプレーヤー', model: 'cassette_player' },
          { name: '古い無線機', model: 'vintage_radio_transceiver' },
        ] },
        seat: { name: '練習用の椅子', icon: '🪑', slot: 'c', variants: [
          { name: '木のスツール', model: 'wooden_stool_02' },
          { name: '丸いバーチェア', model: 'bar_chair_round_01' },
          { name: '古い木のスツール', model: 'wooden_stool_01' },
        ] },
        main: { name: 'くつろぐ場所', icon: '🛏️', slot: 'main', variants: [
          { name: '古い鉄のベッド', model: 'old_bed_frame' },
          { name: '彫刻のソファ', model: 'sofa_03' },
          { name: '花がらのデイベッド', model: 'vintage_day_bed' },
        ] },
        shelf: { name: 'レコード棚', icon: '💿', slot: 'shelf', variants: [
          { name: '木の引き出し棚', model: 'vintage_wooden_drawer_01' },
          { name: 'アンティークの戸棚', model: 'vintage_cabinet_01' },
          { name: 'ゴシックのタンス', model: 'GothicCommode_01' },
        ] },
        guitar2: { name: '2本目のギター', icon: '🎸', slot: 'd', variants: [
          { name: 'アコースティックギター', proc: 'guitar', style: 'acoustic' },
          { name: 'エレキギター（青）', proc: 'guitar', style: 'electric2' },
          { name: 'ベース（白木）', proc: 'guitar', style: 'bass2' },
        ] },
      },
      manga: {
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN, rug: RUG_H, picture: PICTURES,
        shelf: { name: '本棚', icon: '📚', slot: 'shelf', variants: [
          { name: '明るい木の飾り棚', model: 'wooden_display_shelves_01' },
          { name: '木と黒鉄の棚', model: 'steel_frame_shelves_01' },
          { name: '白い棚', model: 'painted_wooden_shelves', paint: '#ece5d6' },
        ] },
        main: { name: 'ごろごろする場所', icon: '🛏️', slot: 'main', variants: [
          { name: '生成りのソファ', model: 'Sofa_01', tint: '#f3eee4' },
          { name: '白い木わくのソファ', model: 'painted_wooden_sofa', paint: '#ece5d6' },
          { name: 'セージのソファ', model: 'Sofa_01', tint: '#c3cfb5' },
        ] },
        books: { name: '本と小物', icon: '📖', slot: 'c', variants: [
          { name: '百科事典セット', model: 'book_encyclopedia_set_01' },
          { name: 'フォトフレーム', model: 'standing_picture_frame_02' },
          { name: '白いつぼ', model: 'ceramic_vase_01' },
        ] },
        cushion: { name: 'クッション', icon: '🛋️', slot: 'd', variants: [
          { name: 'クッションの山', model: 'throw_pillows_01' },
          { name: '木と革のアームチェア', model: 'modern_arm_chair_01' },
          { name: '白い木の椅子', model: 'painted_wooden_chair_01' },
        ] },
        lamp: { name: '読書灯', icon: '🔦', slot: 'a', variants: [
          { name: 'オレンジのアームランプ', model: 'desk_lamp_arm_01' },
          { name: '木のランタン', model: 'wooden_lantern_01' },
          { name: '木のろうそく立て', model: 'wooden_candlestick' },
        ] },
        basket: { name: 'かご', icon: '🧺', slot: 'b', variants: [
          { name: '編みかご', model: 'wicker_basket_01' },
          { name: 'ふたつきの編みかご', model: 'wicker_basket_02' },
          { name: '素焼き鉢の植物', model: 'potted_plant_02' },
        ] },
      },
      game: {
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN, rug: RUG_H, picture: PICTURES,
        tv: { name: 'テレビ', icon: '📺', slot: 'shelf', variants: [
          { name: 'ブラウン管テレビ', model: 'Television_01' },
          { name: '古いテレビ', model: 'television_02' },
          { name: 'テレビ台', model: 'modern_wooden_cabinet' },
        ] },
        console: { name: 'ゲーム機', icon: '🎮', slot: 'c', variants: [
          { name: 'ゲーム機', model: 'gaming_console' },
          { name: 'コントローラー', model: 'gamepad' },
          { name: '古いノートパソコン', model: 'classic_laptop' },
        ] },
        main: { name: 'ソファ', icon: '🛋️', slot: 'main', variants: [
          { name: '黒い革のソファ', model: 'sofa_02' },
          { name: 'グレーのソファ', model: 'Sofa_01', tint: '#7d7d7d' },
          { name: 'チャコールの木わくソファ', model: 'painted_wooden_sofa', paint: '#3e3e3e' },
        ] },
        seat: { name: 'ゲーム用の椅子', icon: '🪑', slot: 'd', variants: [
          { name: 'ラウンジチェア', model: 'mid_century_lounge_chair' },
          { name: '革のオットマン', model: 'Ottoman_01' },
          { name: '鉄のスツール', model: 'metal_stool_01' },
        ] },
        box: { name: '収納', icon: '📦', slot: 'a', variants: [
          { name: '工具ワゴン', model: 'industrial_storage_cart' },
          { name: '緑のワゴン', model: 'tool_cart' },
          { name: '使い込んだ鉄のラック', model: 'worn_metal_rack' },
        ] },
        snack: { name: 'ミニテーブル', icon: '🍿', slot: 'b', variants: [
          { name: '鉄のスツール', model: 'metal_stool_02' },
          { name: '黒い幾何学テーブル', model: 'modern_coffee_table_02' },
          { name: '大理石の丸テーブル', model: 'coffee_table_round_01' },
        ] },
      },
    },
    orderByDirection: {
      music: ['wall', 'floor', 'guitar', 'ceilLight', 'audio', 'curtain', 'main', 'seat', 'shelf', 'rug', 'guitar2', 'picture'],
      manga: ['wall', 'floor', 'shelf', 'ceilLight', 'main', 'curtain', 'books', 'lamp', 'cushion', 'rug', 'basket', 'picture'],
      game: ['wall', 'floor', 'tv', 'ceilLight', 'console', 'curtain', 'main', 'seat', 'rug', 'box', 'snack', 'picture'],
    },
  },
];

// 苦手を克服したときにもらえる特別な家具（順番にもらえる）
export const SPECIALS = [
  { name: '大きな柱時計', model: 'vintage_grandfather_clock_01' },
  { name: 'アンティークの花びん', model: 'antique_ceramic_vase_01' },
  { name: '白い馬の像', model: 'horse_statue_01' },
  { name: '古いオイルランプ', model: 'vintage_oil_lamp' },
  { name: '地球儀のような羅針盤', model: 'seadogs_compass' },
  { name: '宝箱', model: 'treasure_chest' },
];

export function kindsOf(room, dir) {
  return room.kinds || room.kindsByDirection[dir];
}
export function orderOf(room, dir) {
  return room.order || room.orderByDirection[dir];
}
export function variantsOf(kind, dir) {
  return Array.isArray(kind.variants) ? kind.variants : kind.variants[dir];
}
