// レアガチャ：勉強でもらえる「レアチケット」で引く、ガチャ限定の家具。
// 見た目は js/gachafurn.js の buildGacha({ type: src.gacha, ...そのほかの src }) で作る。
// このファイルは画面や保存にさわらない（純粋な関数だけ）。three.js も読みこまない。
import { GACHA_AVATARS } from './avatars.js';
//
// レア度：★3（70%）・★4（25%）・★5（5%）。10連は★4以上が1つ以上かならず出る。
// ★4・★5 がかぶったら「かけら」（★4のかけら・★5のかけら）になる。SHARD_COST 個で、同じレア度の好きな家具と交換できる。
// ★3 は少し豪華な単品、★4 は個性の強い物、★5 は「恒常」（いつでも出る最上級の定番）と
// 「限定」（期間限定ガチャのシリーズ。バンド・星空・ゴシック・和の雅）の2種類。
// 限定シリーズには ★5 だけでなく ★4 の家具もある（バンドシリーズ。壁紙・床・ドアもふくめ全ジャンル）。
// バナー：'standard'（★4・★5 は恒常だけ）／シリーズ id（★5・★4 の半分はそのシリーズ、残りは恒常）。

// 部屋の雰囲気（1文字の略 → 正式な名前）
const ST = { n: 'natural', i: 'industrial', r: 'retro', m: 'modern' };

export const RATES = { 3: 0.70, 4: 0.25, 5: 0.05 };
export const SHARD_COST = 5;

// 限定のシリーズ。start / end は開催期間（ISO 日付文字列。null = 未定）。いちばん上が今のピックアップ
// （もとの「ロックシリーズ」の家具は、id はそのままでバンドシリーズに入った）
export const SERIES = [
  { id: 'band', name: 'バンドシリーズ', title: 'OVERDRIVE', desc: 'アンプをいっぱいに上げて。ライブハウスの熱気を、自分の部屋に。', start: null, end: null },
  { id: 'starry', name: '星空シリーズ', desc: '濃紺と金に、またたく星。夜空の中で暮らすような部屋に。', start: '2099-01-01', end: null }, // お休み中（持っている家具はそのまま）
  { id: 'gothic', name: 'ゴシックシリーズ', desc: '黒檀と深紅のベルベット、ゆらめくろうそく。古城の一室のような部屋に。', start: '2099-01-01', end: null }, // まだ開いていない
  { id: 'wa', name: '和の雅シリーズ', desc: '黒漆と金箔、舞う桜。雅な日本の部屋に。', start: '2099-01-01', end: null }, // まだ開いていない
];

export const GACHA_ITEMS = [];

// 1行 = [id, 名前, ジャンル, 雰囲気の略, src(gacha=形の種類 + 引数), 大きさ(最大辺 m), その他]
// その他：{ place, surface(壁紙・床・ドア・窓のとき), light(照明の色), series }
function add(rarity, rows, def = {}) {
  for (const [id, name, genre, st, src, size, o = {}] of rows) {
    const item = {
      id, name, genre,
      styles: [...st].map((c) => ST[c]),
      place: o.place || 'floor',
      src, size,
      rare: true,
      rarity,
    };
    if (o.surface) item.surface = o.surface;
    if (o.light) item.light = o.light;
    const series = o.series || def.series;
    if (series) { item.series = series; item.limited = true; }
    GACHA_ITEMS.push(item);
  }
}
const W = { place: 'wall' };
const CE = { place: 'ceiling' };
const RUG = { place: 'rug' };
const SF = (surface) => ({ place: 'surface', surface });

// ───────── ★3：少し豪華な単品・上質な定番 ─────────
add(3, [
  ['g-arc-lamp-marble', '大理石と真ちゅうのアーチライト', 'light', 'rm', { gacha: 'arcLamp' }, 1.5, { light: '#ffd6a0' }],
  ['g-chester-velvet', 'ベルベットのチェスターフィールドチェア', 'chair', 'r', { gacha: 'chesterChair', fabric: '#1f4d3a' }, 1.0],
  ['g-peacock-chair', '籐のピーコックチェア', 'chair', 'nr', { gacha: 'peacockChair' }, 1.3],
  ['g-bar-cart', 'アールデコのバーカート', 'table', 'rm', { gacha: 'barCart' }, 1.0],
  ['g-marble-pedestal', '大理石の台座テーブル', 'table', 'm', { gacha: 'marbleSide' }, 0.6],
  ['g-gilded-mirror', '金のバロック鏡', 'wallart', 'r', { gacha: 'gildedMirror' }, 1.3, W],
  ['g-tiffany-lamp', 'ステンドグラスのランプ', 'light', 'r', { gacha: 'tiffanyLamp' }, 0.6, { light: '#ffc58a' }],
  ['g-gramophone', 'アンティークの蓄音機', 'hobby', 'r', { gacha: 'gramophone' }, 0.7],
  ['g-globe-bar', '地球儀のバーキャビネット', 'storage', 'r', { gacha: 'globeBar' }, 1.1],
  ['g-fern-stand', '鉄のらせんスタンドとシダ', 'plant', 'ni', { gacha: 'plantStand' }, 1.3],
  ['g-decanter-set', 'クリスタルのデキャンタセット', 'decor', 'rm', { gacha: 'decanterSet' }, 0.6],
  ['g-botanical-trio', '植物画の3枚組', 'wallart', 'nr', { gacha: 'botanical' }, 1.4, W],
  ['g-candelabra', '金の5本燭台', 'decor', 'r', { gacha: 'candelabra' }, 0.6, { light: '#ffb86b' }],
  ['g-lounge-chair', 'レザーのラウンジチェア', 'chair', 'mr', { gacha: 'loungeChair' }, 1.5],
  ['g-globe-pendant', 'ガラスと真ちゅうのペンダント', 'light', 'mi', { gacha: 'globePendant' }, 1.0, { ...CE, light: '#ffd29a' }],
  ['g-travertine-side', 'トラバーチンのサイドテーブル', 'table', 'nm', { gacha: 'travSide' }, 0.5],
  ['g-olive-tree', '大きなオリーブの木', 'plant', 'nm', { gacha: 'bigPlant', foliage: 'tree', size: 1.7 }, 2.2],
  ['g-big-palm', '大きなヤシの鉢植え', 'plant', 'nm', { gacha: 'bigPlant', foliage: 'palm', size: 1.6, pot: '#3a3633' }, 1.8],
  ['g-persian-rug', '手織りのペルシャ絨毯', 'textile', 'rn', { gacha: 'rug', pattern: 'persian' }, 2.1],
  ['g-berber-rug', 'ひし形もようのウールラグ', 'textile', 'nm', { gacha: 'rug', pattern: 'berber' }, 2.1],
  ['g-walnut-sideboard', 'ウォールナットのサイドボード', 'storage', 'mn', { gacha: 'sideboard' }, 1.6],
  ['g-boucle-sofa', 'もこもこのブークレソファ', 'sofa', 'mn', { gacha: 'boucleSofa' }, 2.1],
  ['g-tripod-lamp', 'ウォールナットの三脚ランプ', 'light', 'nm', { gacha: 'tripodLamp' }, 1.6, { light: '#ffd9a8' }],
  ['g-round-mirror', '真ちゅうの丸い鏡', 'wallart', 'mi', { gacha: 'roundMirror' }, 0.9, W],
  ['g-abstract-warm', '大きな抽象画（あたたかい色）', 'wallart', 'mn', { gacha: 'abstractArt', v: 0 }, 1.1, W],
  ['g-abstract-cool', '大きな抽象画（しずかな色）', 'wallart', 'm', { gacha: 'abstractArt', v: 1 }, 1.1, W],
  ['g-pampas-vases', '花瓶とパンパスグラス', 'decor', 'nm', { gacha: 'vaseSet' }, 1.6],
  ['g-opal-sconce', 'オパールガラスのウォールランプ', 'light', 'mr', { gacha: 'opalSconce' }, 0.35, { ...W, light: '#ffdcae' }],
  ['g-marble-coffee', '黒大理石のコーヒーテーブル', 'table', 'm', { gacha: 'marbleCoffee' }, 1.0],
  ['g-velvet-pouf', 'ひだのベルベットプフ', 'chair', 'rm', { gacha: 'pouf' }, 0.55],
  ['g-brass-etagere', '真ちゅうとガラスの飾り棚', 'storage', 'mi', { gacha: 'etagere' }, 1.7],
  ['g-banker-lamp', '緑のガラスのバンカーズランプ', 'light', 'ri', { gacha: 'bankerLamp' }, 0.4, { light: '#ffe0a8' }],
]);

// ───────── ★4：個性の強い物 ─────────
add(4, [
  ['g4-jukebox', '光るジュークボックス', 'hobby', 'r', { gacha: 'jukebox' }, 1.5, { light: '#ff8a6a' }],
  ['g4-neon-sunset', '夕日とヤシのネオンサイン', 'wallart', 'im', { gacha: 'neonSunset' }, 0.9, { ...W, light: '#ff6a6a' }],
  ['g4-hammock', '木のスタンドのハンモック', 'sofa', 'n', { gacha: 'hammock' }, 2.7],
  ['g4-arcade', 'レトロなアーケード筐体', 'hobby', 'ri', { gacha: 'arcade' }, 1.8, { light: '#9a8aff' }],
  ['g4-astronaut', '宇宙飛行士のオブジェ', 'decor', 'm', { gacha: 'astronaut' }, 1.2],
  ['g4-plant-tower', '観葉植物の塔', 'plant', 'n', { gacha: 'plantTower' }, 2.2],
  ['g4-egg-chair', '吊りさげ式のエッグチェア', 'chair', 'nm', { gacha: 'eggChair' }, 2.0],
  ['g4-lava-lamp', 'ラバランプ', 'light', 'r', { gacha: 'lavaLamp' }, 0.9, { light: '#ff4a6a' }],
  ['g4-disco-ball', 'まわるミラーボール', 'light', 'r', { gacha: 'discoBall' }, 0.9, { ...CE, light: '#ffd0f0' }],
  ['g4-retro-tv', '70年代のテレビ', 'hobby', 'r', { gacha: 'retroTV' }, 1.2, { light: '#9ac8ff' }],
  ['g4-surfboard', '壁かけのサーフボード', 'wallart', 'n', { gacha: 'surfboard' }, 1.95, W],
  ['g4-vending', '光る自動販売機', 'storage', 'im', { gacha: 'vending' }, 1.85, { light: '#eaf6ff' }],
  ['g4-punch-bag', 'サンドバッグ', 'hobby', 'i', { gacha: 'punchBag' }, 1.6, CE],
  ['g4-mushroom-lamp', '大きなきのこのランプ', 'light', 'n', { gacha: 'mushroomLamp' }, 1.35, { light: '#ffcf8a' }],
  ['g4-bubble-chair', '透明なバブルチェア', 'chair', 'm', { gacha: 'bubbleChair' }, 1.7, CE],
]);

// ───────── ★5 恒常：どの部屋にもなじむ最上級の定番 ─────────
add(5, [
  ['g5-crystal-chandelier', 'クリスタルのシャンデリア', 'light', 'rm', { gacha: 'crystalChandelier' }, 1.2, { ...CE, light: '#ffd9a8' }],
  ['g5-leather-sofa', 'キャメルレザーのソファ', 'sofa', 'mn', { gacha: 'leatherSofa' }, 2.3],
  ['g5-marble-fireplace', '大理石の暖炉', 'fixture', 'rm', { gacha: 'fireplace' }, 1.8, { light: '#ff9a4a' }],
  ['g5-grand-piano', 'グランドピアノ', 'hobby', 'mr', { gacha: 'grandPiano' }, 2.5],
  ['g5-aquarium', '大きなアクアリウム', 'storage', 'nm', { gacha: 'aquarium' }, 1.4, { light: '#bfefff' }],
  ['g5-canopy-bed', '天蓋つきのベッド', 'sofa', 'rn', { gacha: 'canopyBed' }, 2.3],
]);

// ───────── 限定：バンドシリーズ（★5 と ★4。12ジャンルすべてに1つ以上） ─────────
// （g5-neon-rock / g5-amp-stack / g5-neon-guitar / g5-stud-sofa は、もとロックシリーズ。id はそのまま）
add(5, [
  ['g5-drum-kit', '赤いドラムセット', 'hobby', 'ir', { gacha: 'drumKit' }, 1.8],
  ['g5-stage-truss', '銀色のステージ照明', 'light', 'i', { gacha: 'stageTruss' }, 2.5, { ...CE, light: '#ff6a5a' }],
  ['g5-amp-stack', '黒いアンプ', 'hobby', 'ir', { gacha: 'ampStack' }, 1.9, { light: '#ff9a4a' }],
  ['g5-neon-guitar', '赤いギター', 'hobby', 'i', { gacha: 'guitarStand' }, 1.4, { light: '#ff2e88' }],
  ['g5-neon-rock', 'ピンクのネオンサイン', 'wallart', 'i', { gacha: 'neonRock' }, 1.2, { ...W, light: '#ff5aa8' }],
  ['g5-stud-sofa', '黒い革のソファ', 'sofa', 'i', { gacha: 'studSofa' }, 2.0],
], { series: 'band' });
add(4, [
  ['g4-band-mic', '銀色のマイク', 'hobby', 'ir', { gacha: 'micStand' }, 1.6],
  ['g4-band-guitars', '黄色いギターと黒いベース', 'hobby', 'ir', { gacha: 'guitarRack' }, 1.4],
  ['g4-band-keys', '赤いキーボード', 'hobby', 'im', { gacha: 'keyboardRig' }, 1.3, { light: '#4adfff' }],
  ['g4-band-spot', '黒いスポットライト', 'light', 'i', { gacha: 'spotLamp' }, 1.6, { light: '#ffd29a' }],
  ['g4-band-throne', '黒い丸いす', 'chair', 'i', { gacha: 'drumThrone' }, 0.55],
  ['g4-band-case', '黒いケースのテーブル', 'table', 'i', { gacha: 'flightCase' }, 0.95],
  ['g4-band-shelf', '黒いレコード棚', 'storage', 'ir', { gacha: 'ampShelf' }, 1.05],
  ['g4-band-planter', '赤いドラムの鉢植え', 'plant', 'in', { gacha: 'kickPlanter' }, 1.4],
  ['g4-band-pedals', 'カラフルなエフェクター', 'decor', 'i', { gacha: 'pedalboard' }, 0.65],
  ['g4-band-posters', 'カラフルなポスター', 'wallart', 'ir', { gacha: 'posterWall' }, 1.2, W],
  ['g4-band-rug', '赤いラグ', 'textile', 'ri', { gacha: 'rug', pattern: 'stage', w: 2.3, d: 1.9 }, 2.3, RUG],
  ['g4-band-wall', '暗い赤レンガの壁', 'interior', 'i', { tex: 'red_brick_03', rep: 2, tint: '#8f7d7a' }, 6, SF('wall')],
  ['g4-band-floor', '黒い板の床', 'interior', 'i', { tex: 'black_painted_planks', rep: 3 }, 6, SF('floor')],
  ['g4-band-door', '赤いドア', 'fixture', 'ir', { proc: { type: 'door', style: 'panel4', color: '#8a1420', handle: 'chrome' } }, 2.1, SF('door')],
], { series: 'band' });

// ───────── ★5 限定：お休み中のシリーズ ─────────
add(5, [
  ['g5-star-pendant', '天球儀のペンダントライト', 'light', 'rm', { gacha: 'starPendant' }, 1.2, { ...CE, light: '#ffe2b8' }],
  ['g5-planetarium', '星を映すプラネタリウム', 'hobby', 'rm', { gacha: 'planetarium' }, 1.5, { light: '#aebcff' }],
  ['g5-moon-sofa', '三日月のソファ', 'sofa', 'm', { gacha: 'moonSofa' }, 2.3],
  ['g5-constellation', '星座の壁かざり', 'wallart', 'm', { gacha: 'constellation' }, 1.1, W],
  ['g5-moon-table', '月のランプテーブル', 'table', 'm', { gacha: 'moonTable' }, 0.8, { light: '#ffe6c0' }],
], { series: 'starry' });
add(5, [
  ['g5-goth-chandelier', 'ろうそくの鉄のシャンデリア', 'light', 'r', { gacha: 'gothChandelier' }, 1.2, { ...CE, light: '#ffad5c' }],
  ['g5-rose-window', 'ステンドグラスのバラ窓', 'wallart', 'r', { gacha: 'roseWindow' }, 1.3, { ...W, light: '#ff9a8a' }],
  ['g5-goth-throne', '黒檀の玉座', 'chair', 'r', { gacha: 'gothThrone' }, 2.4],
  ['g5-candle-tree', '鉄の大燭台', 'light', 'ri', { gacha: 'candleTree' }, 1.7, { light: '#ffad5c' }],
  ['g5-goth-cabinet', '光る薬びんの飾り棚', 'storage', 'r', { gacha: 'gothCabinet' }, 2.4, { light: '#b07aff' }],
], { series: 'gothic' });
add(5, [
  ['g5-sakura-tree', '花びらが舞う桜の木', 'plant', 'n', { gacha: 'sakuraTree' }, 2.2],
  ['g5-byobu', '波と鶴の金屏風', 'decor', 'nr', { gacha: 'byobu' }, 1.8],
  ['g5-andon', '桜もようの行灯', 'light', 'n', { gacha: 'andon' }, 1.0, { light: '#ffbe7a' }],
  ['g5-tsukubai', '筧のつくばい', 'plant', 'n', { gacha: 'tsukubai' }, 1.2],
  ['g5-makie-table', '蒔絵の座卓とお茶', 'table', 'nr', { gacha: 'lacquerTable' }, 1.1],
], { series: 'wa' });

// ───────── 着せ替え（画面の見た目）：★4 はいつでも、バンドの5つはバンドシリーズ限定 ─────────
const SK = { place: 'skin' };
add(4, [
  ['skin-b', '着せ替え：木のぬくもり', 'skin', 'n', { skin: 'b' }, 1, SK],
  ['skin-c', '着せ替え：ミニマル・ライト', 'skin', 'm', { skin: 'c' }, 1, SK],
  ['skin-d', '着せ替え：スタイリッシュ', 'skin', 'i', { skin: 'd' }, 1, SK],
]);
add(4, [
  ['skin-e1', '着せ替え：ネオン', 'skin', 'i', { skin: 'e1' }, 1, SK],
  ['skin-e2', '着せ替え：ヴィンテージアンプ', 'skin', 'r', { skin: 'e2' }, 1, SK],
  ['skin-e3', '着せ替え：ライブフライヤー', 'skin', 'i', { skin: 'e3' }, 1, SK],
  ['skin-e4', '着せ替え：フェスステージ', 'skin', 'm', { skin: 'e4' }, 1, SK],
], { series: 'band' });
add(5, [
  ['skin-e5', '着せ替え：バンドルーム', 'skin', 'i', { skin: 'e5' }, 1, SK],
], { series: 'band' });

// ───────── プロフィールのアイコン（夜の切り絵）：そのガチャを引いた回数のごほうび（ランダムには出ない） ─────────
const AV = { place: 'avatar' };
const avRow = (a) => ['av-' + a.id, 'アイコン：' + a.name, 'avatar', 'i', { avatar: a.id }, 1, AV];
add(4, GACHA_AVATARS.filter(a => a.r === 4 && a.series === 'band').map(avRow), { series: 'band' });
add(5, GACHA_AVATARS.filter(a => a.r === 5 && a.series === 'band').map(avRow), { series: 'band' });
add(4, GACHA_AVATARS.filter(a => a.r === 4 && !a.series).map(avRow));
add(5, GACHA_AVATARS.filter(a => a.r === 5 && !a.series).map(avRow));
// ───────── 期間限定イベントのごほうび（ガチャからは出ない。1.12.0） ─────────
add(5, [
  ['ev-xmas-tree', 'きらめくクリスマスツリー', 'decor', 'nmr', { gacha: 'xmasTree' }, 2.0, { light: '#ffcf8a', series: 'event' }],
], {});
add(4, [
  ['ev-snowman', 'マフラーの雪だるま', 'decor', 'nmr', { gacha: 'snowman' }, 1.2, { series: 'event' }],
  ['ev-gift-pile', 'プレゼントの山', 'decor', 'nmr', { gacha: 'giftPile' }, 0.7, { series: 'event' }],
], {});
for (const it of GACHA_ITEMS) if (it.series === 'event') it.reward = true;
for (const it of GACHA_ITEMS) if (it.place === 'avatar') it.reward = true; // 引いた回数のごほうび。ガチャからランダムには出ない

export const GACHA_BY_ID = Object.fromEntries(GACHA_ITEMS.map((it) => [it.id, it]));
export const gachaById = (id) => GACHA_BY_ID[id] || null;
export const seriesById = (id) => SERIES.find((s) => s.id === id) || null;
export const byRarity = (r) => GACHA_ITEMS.filter((it) => it.rarity === r);
// シリーズの家具（★5 が先）
export const bySeries = (id) => GACHA_ITEMS.filter((it) => it.series === id && !it.reward).sort((a, b) => b.rarity - a.rarity);
// 今ひらいている限定シリーズ（start〜end の間。null は「いつでも」）
export function activeSeries(now = new Date()) {
  const t = +now;
  return SERIES.filter((s) => (!s.start || t >= Date.parse(s.start)) && (!s.end || t <= Date.parse(s.end)));
}
// buildGacha に渡す spec（src.gacha → type）
export function gachaSpec(item) {
  const { gacha, ...rest } = item.src || {};
  return { type: gacha, ...rest };
}

// ───────── 引くしくみ ─────────
// いつでも出る物（限定シリーズの物は、そのシリーズのバナーでだけ出る）
const POOL = {
  3: GACHA_ITEMS.filter((it) => it.rarity === 3 && !it.limited && !it.reward),
  4: GACHA_ITEMS.filter((it) => it.rarity === 4 && !it.limited && !it.reward),
  5: GACHA_ITEMS.filter((it) => it.rarity === 5 && !it.limited && !it.reward), // ★5 恒常
};
// ふつうの家具リスト（items.js）の「レア」の物も、★3 としてガチャに入れる（items.js から呼ぶ）
export function addToPool(items, rarity = 3) {
  for (const it of items) {
    if (GACHA_BY_ID[it.id]) continue;
    it.rarity = rarity;
    GACHA_ITEMS.push(it); GACHA_BY_ID[it.id] = it; POOL[rarity].push(it);
  }
}
export const BANNER_LIMITED_SHARE = 0.5; // 限定バナーで、★5・★4 が限定シリーズから出る割合

// レア度を決める（min 以上だけで、割合はそのまま）
export function rollRarity(rng = Math.random, min = 3) {
  const rs = [5, 4, 3].filter((r) => r >= min);
  const total = rs.reduce((a, r) => a + RATES[r], 0);
  let x = rng() * total;
  for (const r of rs) { x -= RATES[r]; if (x < 0) return r; }
  return rs[rs.length - 1];
}
// そのバナーで、そのレア度の家具の候補
function poolFor(rarity, banner, rng) {
  if (rarity >= 4 && banner && banner !== 'standard') {
    const lim = bySeries(banner).filter((it) => it.rarity === rarity);
    if (lim.length && rng() < BANNER_LIMITED_SHARE) return lim;
  }
  return POOL[rarity];
}
// 1回引いた時の、家具ごとの出る確率（提供割合の表示用。1.12.0）。合計 1
export function oddsFor(banner = 'standard') {
  const out = [];
  for (const r of [5, 4, 3]) {
    const lim = r >= 4 && banner && banner !== 'standard' ? bySeries(banner).filter((it) => it.rarity === r) : [];
    const share = lim.length ? BANNER_LIMITED_SHARE : 0;
    for (const it of lim) out.push({ item: it, rarity: r, p: RATES[r] * share / lim.length, limited: true });
    for (const it of POOL[r]) out.push({ item: it, rarity: r, p: RATES[r] * (1 - share) / POOL[r].length });
  }
  return out;
}
function pick(rarity, owned, rng, banner) {
  const pool = poolFor(rarity, banner, rng);
  const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const dup = (owned(item.id) || 0) > 0;
  return { item, rarity, dup, shard: dup && rarity >= 4 ? rarity : null };
}
// owned = (itemId) => 持っている数。opts.banner = 'standard'（ふつう）| シリーズ id（限定）
export function pullOne(owned = () => 0, rng = Math.random, opts = {}) {
  return pick(rollRarity(rng), owned, rng, opts.banner);
}
// 10連（★4以上を1つかならず）。同じ10連の中でかぶった分もかぶりとして数える
export function pullTen(owned = () => 0, rng = Math.random, opts = {}) {
  const got = {};
  const own = (id) => (owned(id) || 0) + (got[id] || 0);
  const out = [];
  for (let i = 0; i < 10; i++) {
    let r = rollRarity(rng);
    if (i === 9 && r < 4 && !out.some((p) => p.rarity >= 4)) r = rollRarity(rng, 4);
    const p = pick(r, own, rng, opts.banner);
    got[p.item.id] = (got[p.item.id] || 0) + 1;
    out.push(p);
  }
  return out;
}
// チケットで引く（kind = 'ticket' ふつう | 'ticket4' ★4以上確定 | 'ticket5' ★5限定確定。★4 の限定は出ない）
// ticket5 のシリーズ：opts.banner がシリーズ id ならそれ、なければ opts.series、なければ今開催中のシリーズ（opts.now）
export const TICKET_KINDS = ['ticket', 'ticket4', 'ticket5'];
export function ticket5Series(opts = {}) {
  const ok = (id) => id && SERIES.some((s) => s.id === id);
  if (ok(opts.banner)) return opts.banner;
  if (ok(opts.series)) return opts.series;
  const act = activeSeries(opts.now || new Date());
  return act.length ? act[0].id : null;
}
export function pullWithTicket(kind = 'ticket', owned = () => 0, rng = Math.random, opts = {}) {
  if (kind === 'ticket4') return pick(rollRarity(rng, 4), owned, rng, opts.banner);
  if (kind === 'ticket5') {
    const id = ticket5Series(opts);
    const pool = (id ? bySeries(id) : GACHA_ITEMS.filter((it) => it.limited)).filter((it) => it.rarity === 5);
    const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const dup = (owned(item.id) || 0) > 0;
    return { item, rarity: 5, dup, shard: dup ? 5 : null };
  }
  return pullOne(owned, rng, opts);
}
// かけらで交換できる家具（まだ持っていない物。全部持っていたら全部）
// opts.series = 今開催中のシリーズ id → そのシリーズの限定（★4・★5）も候補に入れる
// opts.includeLimited = true（series なし）→ すべての限定を候補に入れる
export function exchangeable(rarity, owned = () => 0, opts = {}) {
  let pool = byRarity(rarity).filter((it) => !it.reward);
  if (opts.series) pool = pool.filter((it) => !it.limited || it.series === opts.series);
  else if (!opts.includeLimited) pool = pool.filter((it) => !it.limited);
  const left = pool.filter((it) => !(owned(it.id) > 0));
  return left.length ? left : pool.slice();
}

// ───────── チケットのもらい方 ─────────
// before / after = { solved, streak, mastered }（解いた数・連続日数・克服した問題の数）
// 50問ごと・連続7日ごとに1枚。新しく克服した問題1つにつき 30% で1枚。
// （ログインボーナスと Lv アップのごほうびは store.js で管理）
export const TICKET_RULES = { solvedEvery: 50, streakEvery: 7, masteredChance: 0.3 };
const crossed = (a = 0, b = 0, step) => Math.max(0, Math.floor(b / step) - Math.floor(a / step));
export function ticketsEarned(before = {}, after = {}, rng = Math.random) {
  let n = 0;
  n += crossed(before.solved, after.solved, TICKET_RULES.solvedEvery);
  // 連続日数は途切れると 0 に戻るので、のびたときだけ数える
  if ((after.streak || 0) > (before.streak || 0)) n += crossed(before.streak, after.streak, TICKET_RULES.streakEvery);
  const newly = Math.max(0, (after.mastered || 0) - (before.mastered || 0));
  for (let i = 0; i < newly; i++) if (rng() < TICKET_RULES.masteredChance) n++;
  return n;
}
