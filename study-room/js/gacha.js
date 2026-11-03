// レアガチャ：勉強でもらえる「レアチケット」で引く、ガチャ限定の家具。
// 見た目は js/gachafurn.js の buildGacha({ type: src.gacha, ...そのほかの src }) で作る。
// このファイルは画面や保存にさわらない（純粋な関数だけ）。three.js も読みこまない。
//
// レア度：★3（70%）・★4（25%）・★5（5%）。10連は★4以上が1つ以上かならず出る。
// ★4・★5 がかぶったら「かけら」（★4のかけら・★5のかけら）になる。SHARD_COST 個で、同じレア度の好きな家具と交換できる。
// ★3 は少し豪華な単品、★4 は個性の強い物、★5 は「恒常」（いつでも出る最上級の定番）と
// 「限定」（期間限定ガチャのシリーズ。星空・ロック・ゴシック・和の雅）の2種類。
// バナー：'standard'（★5 は恒常だけ）／シリーズ id（★5 の半分はそのシリーズ、残りは恒常）。

// 部屋の雰囲気（1文字の略 → 正式な名前）
const ST = { n: 'natural', i: 'industrial', r: 'retro', m: 'modern' };

export const RATES = { 3: 0.70, 4: 0.25, 5: 0.05 };
export const SHARD_COST = 5;

// ★5 限定のシリーズ。start / end は開催期間（ISO 日付文字列。null = 未定）
export const SERIES = [
  { id: 'starry', name: '星空シリーズ', desc: '濃紺と金に、またたく星。夜空の中で暮らすような部屋に。', start: null, end: null },
  { id: 'rock', name: 'ロックシリーズ', desc: '黒い革とクローム、ネオンの光。ライブハウスのような部屋に。', start: null, end: null },
  { id: 'gothic', name: 'ゴシックシリーズ', desc: '黒檀と深紅のベルベット、ゆらめくろうそく。古城の一室のような部屋に。', start: null, end: null },
  { id: 'wa', name: '和の雅シリーズ', desc: '黒漆と金箔、舞う桜。雅な日本の部屋に。', start: null, end: null },
];

export const GACHA_ITEMS = [];

// 1行 = [id, 名前, ジャンル, 雰囲気の略, src(gacha=形の種類 + 引数), 大きさ(最大辺 m), その他]
// その他：{ place, light(照明の色), series }
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
    if (o.light) item.light = o.light;
    const series = o.series || def.series;
    if (series) { item.series = series; item.limited = true; }
    GACHA_ITEMS.push(item);
  }
}
const W = { place: 'wall' };
const CE = { place: 'ceiling' };

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

// ───────── ★5 限定：シリーズ ─────────
add(5, [
  ['g5-star-pendant', '天球儀のペンダントライト', 'light', 'rm', { gacha: 'starPendant' }, 1.2, { ...CE, light: '#ffe2b8' }],
  ['g5-planetarium', '星を映すプラネタリウム', 'hobby', 'rm', { gacha: 'planetarium' }, 1.5, { light: '#aebcff' }],
  ['g5-moon-sofa', '三日月のソファ', 'sofa', 'm', { gacha: 'moonSofa' }, 2.3],
  ['g5-constellation', '星座の壁かざり', 'wallart', 'm', { gacha: 'constellation' }, 1.1, W],
  ['g5-moon-table', '月のランプテーブル', 'table', 'm', { gacha: 'moonTable' }, 0.8, { light: '#ffe6c0' }],
], { series: 'starry' });
add(5, [
  ['g5-neon-rock', 'ROCK のネオンサイン', 'wallart', 'i', { gacha: 'neonRock' }, 1.2, { ...W, light: '#ff5aa8' }],
  ['g5-amp-stack', '真空管アンプのスタック', 'hobby', 'ir', { gacha: 'ampStack' }, 1.9, { light: '#ff9a4a' }],
  ['g5-neon-guitar', 'ネオン台のエレキギター', 'hobby', 'i', { gacha: 'guitarStand' }, 1.4, { light: '#ff2e88' }],
  ['g5-stud-sofa', '鋲打ちの黒革ソファ', 'sofa', 'i', { gacha: 'studSofa' }, 2.0],
], { series: 'rock' });
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

export const GACHA_BY_ID = Object.fromEntries(GACHA_ITEMS.map((it) => [it.id, it]));
export const gachaById = (id) => GACHA_BY_ID[id] || null;
export const seriesById = (id) => SERIES.find((s) => s.id === id) || null;
export const byRarity = (r) => GACHA_ITEMS.filter((it) => it.rarity === r);
export const bySeries = (id) => GACHA_ITEMS.filter((it) => it.series === id);
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
const POOL = {
  3: byRarity(3),
  4: byRarity(4),
  5: GACHA_ITEMS.filter((it) => it.rarity === 5 && !it.limited), // ★5 恒常
};
export const BANNER_LIMITED_SHARE = 0.5; // 限定バナーで、★5 が限定シリーズから出る割合

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
  if (rarity === 5 && banner && banner !== 'standard') {
    const lim = bySeries(banner);
    if (lim.length && rng() < BANNER_LIMITED_SHARE) return lim;
  }
  return POOL[rarity];
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
// チケットで引く（kind = 'ticket' ふつう | 'ticket4' ★4以上確定 | 'ticket5' ★5限定確定）
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
    const pool = id ? bySeries(id) : GACHA_ITEMS.filter((it) => it.limited);
    const item = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    const dup = (owned(item.id) || 0) > 0;
    return { item, rarity: 5, dup, shard: dup ? 5 : null };
  }
  return pullOne(owned, rng, opts);
}
// かけらで交換できる家具（まだ持っていない物。全部持っていたら全部）
// opts.includeLimited = true で ★5 限定も交換の候補に入れる（opts.series でシリーズをしぼれる）
export function exchangeable(rarity, owned = () => 0, opts = {}) {
  let pool = byRarity(rarity);
  if (!opts.includeLimited) pool = pool.filter((it) => !it.limited);
  else if (opts.series) pool = pool.filter((it) => !it.limited || it.series === opts.series);
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
