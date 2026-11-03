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
      { name: '白いしっくい', tex: 'white_plaster_rough_01', rep: 2 },
      { name: '木の板張り', tex: 'wood_plank_wall', rep: 1.2 },
      { name: '淡いグリーンの塗り壁', tex: 'white_plaster_rough_02', tint: '#d5e6cf', rep: 2 },
    ],
    industrial: [
      { name: 'コンクリート打ちっぱなし', tex: 'concrete_wall_008', rep: 1.5 },
      { name: '白いレンガ', tex: 'white_bricks', rep: 2 },
      { name: '黒い板張り', tex: 'black_painted_planks', rep: 1.2 },
    ],
    retro: [
      { name: '古い木の壁', tex: 'raw_plank_wall', rep: 1.1 },
      { name: '赤レンガ', tex: 'red_brick_03', rep: 2 },
      { name: 'クリーム色のしっくい', tex: 'yellow_plaster', rep: 2 },
    ],
    music: [
      { name: '古い木の壁', tex: 'raw_plank_wall', rep: 1.1 },
      { name: 'コンクリート', tex: 'concrete_wall_008', rep: 1.5 },
      { name: '黒い板張り', tex: 'black_painted_planks', rep: 1.2 },
    ],
    manga: [
      { name: '白いしっくい', tex: 'white_plaster_rough_01', rep: 2 },
      { name: 'クリーム色のしっくい', tex: 'yellow_plaster', rep: 2 },
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
const CURTAIN = {
  name: 'カーテン', icon: '🪟', slot: 'curtain',
  variants: [
    { name: '白いレース', proc: 'curtain', color: '#f4efe6', opacity: 0.55 },
    { name: 'リネンのベージュ', proc: 'curtain', color: '#cdb89a', opacity: 0.92 },
    { name: '深いグリーン', proc: 'curtain', color: '#3f5a45', opacity: 0.97 },
  ],
};
const CEIL_LIGHT = {
  name: '天井の照明', icon: '💡', slot: 'ceil',
  variants: [
    { name: 'モダンなペンダント', model: 'modern_ceiling_lamp_01', light: '#ffd9a8' },
    { name: '工場風のランプ', model: 'hanging_industrial_lamp', light: '#ffcf8f' },
    { name: 'パイプのランプ', model: 'industrial_pipe_lamp', light: '#ffc98a' },
  ],
};

// 壁の絵（自作の額縁に、窓の外と同じ Poly Haven の写真を入れる）
const PICTURES = [
  { name: '夕日の海の写真', proc: 'frame', img: 'img/out-sunset.jpg', frame: '#3b2a1e', w: 0.9, h: 0.6 },
  { name: '草原の写真', proc: 'frame', img: 'img/out-morning.jpg', frame: '#d8cbb6', w: 0.7, h: 0.5 },
  { name: '夜景の写真', proc: 'frame', img: 'img/out-night.jpg', frame: '#111111', w: 1.0, h: 0.55 },
];

// 部屋のテーマ。directions = 最初に選ぶ「部屋の方向性」。
export const ROOMS = [
  {
    id: 'living', name: 'リビング', icon: '🛋️',
    question: 'どんなリビングにしますか？',
    directions: [
      { id: 'natural', name: 'ナチュラル', desc: '木と緑、朝のやわらかい光', sun: 'morning' },
      { id: 'industrial', name: 'インダストリアル', desc: 'コンクリートと鉄、くもり空の光', sun: 'overcast' },
      { id: 'retro', name: 'レトロ', desc: '古い木と夕日、あたたかい光', sun: 'sunset' },
    ],
    slots: {
      curtain: { mount: 'window' },
      ceil: { mount: 'ceiling', x: 0.9, z: -0.4, max: 0.7 },
      sofa: { mount: 'floor', wall: '+x', x: 2.5, z: 0.3, face: -P / 2, max: 2.3 },
      table: { mount: 'floor', x: 1.15, z: 0.3, face: -P / 2, max: 1.3 },
      rug: { mount: 'rug', x: 1.3, z: 0.3, w: 2.6, d: 1.9 },
      shelf: { mount: 'floor', wall: '-x', x: -2.7, z: 0.9, face: P / 2, max: 2.0 },
      plant: { mount: 'floor', x: -2.45, z: -2.0, face: 0, max: 1.6 },
      plant2: { mount: 'floor', x: 2.55, z: -2.05, face: 0, max: 1.4 },
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
      sofa: { name: 'ソファ', icon: '🛋️', slot: 'sofa', variants: [
        { name: '革のソファ', model: 'sofa_02' },
        { name: '布のソファ', model: 'sofa_03' },
        { name: '木わくのソファ', model: 'painted_wooden_sofa' },
      ] },
      ceilLight: CEIL_LIGHT,
      curtain: CURTAIN,
      table: { name: 'ローテーブル', icon: '☕', slot: 'table', variants: [
        { name: '丸い木のテーブル', model: 'coffee_table_round_01' },
        { name: 'モダンなテーブル', model: 'modern_coffee_table_01' },
        { name: '工場風のテーブル', model: 'industrial_coffee_table' },
      ] },
      rug: { name: 'ラグ', icon: '🧶', slot: 'rug', variants: [
        { name: 'ウールのヘリンボーン', tex: 'poly_wool_herringbone', rep: 2 },
        { name: '模様の織物', tex: 'fabric_pattern_05', rep: 2 },
        { name: 'ジャカード織り', tex: 'quatrefoil_jacquard_fabric', rep: 2 },
      ] },
      shelf: { name: '棚', icon: '📚', slot: 'shelf', variants: [
        { name: '古い木の本棚', model: 'wooden_bookshelf_worn' },
        { name: 'スチールの棚', model: 'steel_frame_shelves_02' },
        { name: 'アンティークの戸棚', model: 'vintage_cabinet_01' },
      ] },
      plant: { name: '観葉植物', icon: '🪴', slot: 'plant', variants: [
        { name: '大きな観葉植物', model: 'potted_plant_01' },
        { name: '鉢植えの木', model: 'potted_plant_02' },
        { name: 'すらっとした植物', model: 'potted_plant_04' },
      ] },
      chair: { name: 'ひとりがけ椅子', icon: '🪑', slot: 'chair', variants: [
        { name: 'ラウンジチェア', model: 'mid_century_lounge_chair' },
        { name: 'アームチェア', model: 'modern_arm_chair_01' },
        { name: 'ロッキングチェア', model: 'Rockingchair_01' },
      ] },
      picture: { name: '壁の絵', icon: '🖼️', slot: 'picture', variants: PICTURES },
      clock: { name: '時計', icon: '🕰️', slot: 'clock', variants: [
        { name: 'シンプルな壁掛け時計', model: 'wall_clock' },
        { name: '電話つきの古い時計', model: 'vintage_telephone_wall_clock' },
        { name: '窓辺の置き時計', model: 'mantel_clock_01', at: { mount: 'floor', wall: null, x: -1.45, z: -2.4, base: 0.62, face: 0 } },
      ] },
      side: { name: 'サイドテーブル', icon: '🕯️', slot: 'side', variants: [
        { name: '小さな木のテーブル', model: 'side_table_01' },
        { name: '背の高いテーブル', model: 'side_table_tall_01' },
        { name: '丸い木の台', model: 'round_wooden_table_01' },
      ] },
      plant2: { name: '小さな植物', icon: '🌿', slot: 'plant2', variants: [
        { name: 'イラクサの鉢', model: 'nettle_plant' },
        { name: 'ツルニチニチソウ', model: 'periwinkle_plant' },
        { name: '素焼きの鉢', model: 'planter_pot_clay' },
      ] },
    },
    order: ['wall', 'floor', 'sofa', 'ceilLight', 'curtain', 'table', 'rug', 'shelf', 'plant', 'chair', 'picture', 'clock', 'side', 'plant2'],
  },
  {
    id: 'hobby', name: '趣味部屋', icon: '🎸',
    question: '何の趣味部屋にしますか？',
    directions: [
      { id: 'music', name: '音楽の部屋', desc: 'ギターやオーディオに囲まれる', sun: 'sunset' },
      { id: 'manga', name: '漫画の部屋', desc: '本棚と、ごろごろできる場所', sun: 'morning' },
      { id: 'game', name: 'ゲームの部屋', desc: 'テレビとゲーム機、夜の明かり', sun: 'night' },
    ],
    slots: {
      curtain: { mount: 'window' },
      ceil: { mount: 'ceiling', x: 0.5, z: -0.5, max: 0.7 },
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
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN,
        guitar: { name: 'ギター', icon: '🎸', slot: 'a', variants: [
          { name: 'アコースティックギター', proc: 'guitar', style: 'acoustic' },
          { name: 'エレキギター（赤）', proc: 'guitar', style: 'electric' },
          { name: 'ベース（黒）', proc: 'guitar', style: 'bass' },
        ] },
        audio: { name: 'オーディオ', icon: '📻', slot: 'b', variants: [
          { name: 'ラジカセ', model: 'boombox' },
          { name: 'カセットプレーヤー', model: 'portable_cassette_player' },
          { name: '古い無線機', model: 'vintage_radio_transceiver' },
        ] },
        seat: { name: '練習用の椅子', icon: '🪑', slot: 'c', variants: [
          { name: '木の椅子', model: 'WoodenChair_01' },
          { name: '丸いバーチェア', model: 'bar_chair_round_01' },
          { name: '学校の椅子', model: 'SchoolChair_01' },
        ] },
        main: { name: 'くつろぐ場所', icon: '🛏️', slot: 'main', variants: [
          { name: '古いベッド', model: 'old_bed_frame' },
          { name: 'デイベッド', model: 'vintage_day_bed' },
          { name: '革のソファ', model: 'sofa_02' },
        ] },
        shelf: { name: 'レコード棚', icon: '💿', slot: 'shelf', variants: [
          { name: '古い木の棚', model: 'wooden_bookshelf_worn' },
          { name: 'スチールの棚', model: 'steel_frame_shelves_03' },
          { name: '引き出しの棚', model: 'drawer_cabinet' },
        ] },
        rug: { name: 'ラグ', icon: '🧶', slot: 'rug', variants: [
          { name: 'ウールのヘリンボーン', tex: 'poly_wool_herringbone', rep: 2 },
          { name: '模様の織物', tex: 'fabric_pattern_07', rep: 2 },
          { name: 'デニム', tex: 'denim_fabric', rep: 2 },
        ] },
        guitar2: { name: '2本目のギター', icon: '🎸', slot: 'd', variants: [
          { name: 'アコースティックギター', proc: 'guitar', style: 'acoustic' },
          { name: 'エレキギター（青）', proc: 'guitar', style: 'electric2' },
          { name: 'ベース（白木）', proc: 'guitar', style: 'bass2' },
        ] },
        picture: { name: '壁の絵', icon: '🖼️', slot: 'picture', variants: PICTURES },
      },
      manga: {
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN,
        shelf: { name: '本棚', icon: '📚', slot: 'shelf', variants: [
          { name: '古い木の本棚', model: 'wooden_bookshelf_worn' },
          { name: 'シンプルな棚', model: 'Shelf_01' },
          { name: 'スチールの棚', model: 'steel_frame_shelves_01' },
        ] },
        main: { name: 'ごろごろする場所', icon: '🛏️', slot: 'main', variants: [
          { name: 'デイベッド', model: 'vintage_day_bed' },
          { name: '古いベッド', model: 'old_bed_frame' },
          { name: '布のソファ', model: 'sofa_03' },
        ] },
        books: { name: '本と小物', icon: '📖', slot: 'c', variants: [
          { name: '百科事典セット', model: 'book_encyclopedia_set_01' },
          { name: 'フォトフレーム', model: 'standing_picture_frame_01' },
          { name: 'バインダー', model: 'binder_notebook' },
        ] },
        cushion: { name: 'クッション', icon: '🛋️', slot: 'd', variants: [
          { name: 'クッションの山', model: 'throw_pillows_01' },
          { name: 'ラウンジチェア', model: 'mid_century_lounge_chair' },
          { name: 'アームチェア', model: 'ArmChair_01' },
        ] },
        lamp: { name: '読書灯', icon: '🔦', slot: 'a', variants: [
          { name: 'アームのランプ', model: 'desk_lamp_arm_01' },
          { name: 'オイルランプ', model: 'vintage_oil_lamp' },
          { name: '木のろうそく立て', model: 'wooden_candlestick' },
        ] },
        rug: { name: 'ラグ', icon: '🧶', slot: 'rug', variants: [
          { name: 'ウールのヘリンボーン', tex: 'poly_wool_herringbone', rep: 2 },
          { name: 'ジャカード織り', tex: 'quatrefoil_jacquard_fabric', rep: 2 },
          { name: '模様の織物', tex: 'fabric_pattern_05', rep: 2 },
        ] },
        basket: { name: 'かご', icon: '🧺', slot: 'b', variants: [
          { name: '編みかご', model: 'wicker_basket_01' },
          { name: '大きな編みかご', model: 'wicker_basket_02' },
          { name: '木箱', model: 'wooden_crate_01' },
        ] },
        picture: { name: '壁の絵', icon: '🖼️', slot: 'picture', variants: PICTURES },
      },
      game: {
        wall: WALLS, floor: FLOORS, ceilLight: CEIL_LIGHT, curtain: CURTAIN,
        tv: { name: 'テレビ', icon: '📺', slot: 'shelf', variants: [
          { name: 'ブラウン管テレビ', model: 'Television_01' },
          { name: '古いテレビ', model: 'television_02' },
          { name: 'テレビ台つき', model: 'modern_wooden_cabinet' },
        ] },
        console: { name: 'ゲーム機', icon: '🎮', slot: 'c', variants: [
          { name: 'ゲーム機', model: 'gaming_console' },
          { name: 'レトロなゲーム機', model: 'ClassicConsole_01' },
          { name: 'コントローラー', model: 'gamepad' },
        ] },
        main: { name: 'ソファ', icon: '🛋️', slot: 'main', variants: [
          { name: '布のソファ', model: 'sofa_03' },
          { name: '革のソファ', model: 'sofa_02' },
          { name: '中国風のソファ', model: 'chinese_sofa' },
        ] },
        seat: { name: 'ゲーム用の椅子', icon: '🪑', slot: 'd', variants: [
          { name: '緑の椅子', model: 'GreenChair_01' },
          { name: 'アームチェア', model: 'ArmChair_01' },
          { name: '床屋の椅子', model: 'BarberShopChair_01' },
        ] },
        rug: { name: 'ラグ', icon: '🧶', slot: 'rug', variants: [
          { name: 'デニム', tex: 'denim_fabric', rep: 2 },
          { name: '模様の織物', tex: 'fabric_pattern_07', rep: 2 },
          { name: 'ウールのヘリンボーン', tex: 'poly_wool_herringbone', rep: 2 },
        ] },
        box: { name: '収納', icon: '📦', slot: 'a', variants: [
          { name: 'プラスチックケース', model: 'plastic_crate_01' },
          { name: '木箱', model: 'wooden_crate_02' },
          { name: 'ダンボール', model: 'cardboard_box_01' },
        ] },
        snack: { name: 'ミニテーブル', icon: '🍿', slot: 'b', variants: [
          { name: '小さな木のテーブル', model: 'small_wooden_table_01' },
          { name: '丸い木の台', model: 'round_wooden_table_02' },
          { name: 'サイドテーブル', model: 'side_table_01' },
        ] },
        picture: { name: '壁の絵', icon: '🖼️', slot: 'picture', variants: PICTURES },
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
  { name: '真ちゅうの花びん', model: 'brass_vase_03' },
  { name: '古いオイルランプ', model: 'vintage_oil_lamp' },
  { name: 'ロッキングチェア', model: 'Rockingchair_01' },
  { name: '中国風の飾り棚', model: 'chinese_cabinet' },
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
