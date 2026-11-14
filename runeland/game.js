// ルーンランド：ルール（画面なし。スマホでも試験でも同じものを使う）
// 盤面の地形は「種」と人数から全員のスマホで同じものを作る。送るのは持ち主の並びなど小さいものだけ。

export const T = { PLAIN: 0, FOREST: 1, MOUNTAIN: 2, LAKE: 3, RUNE: 4, VILLAGE: 5, SHRINE: 6, MINE: 7, TOWER: 8 };
export const DEF = [0, 1, 2, 0, 2, 1, 1, 0, 2]; // 土地の守り
// マスの効果：村＝兵+1・守り+1／神殿＝配られるカード+1／金鉱＝毎ラウンド1点／見張りの塔＝守り+2・となりの自分のマスも守り+1
export const TILE_INFO = ['草原', '森（守り+1）', '山（守り+2）', '湖（取れない）', 'ルーンの石（3点・兵+1）', '村（兵+1・守り+1）', '神殿（カード+1枚）', '金鉱（毎ラウンド1点）', '見張りの塔（守り+2・となりも+1）'];
export const CASTLE_DEF = 3, CASTLE_PT = 2, RUNE_PT = 3, BONUS_PT = 2;
export const HAND_MAX = 8, HAND_DEAL = 3, START_CARDS = 3; // 手札は毎ラウンド3枚配りなおし（宝箱などで足されることがある）
export const COLORS = ['#e8483b', '#3a7be0', '#f2b631', '#3fae5a', '#a05ad6', '#f07fb4', '#22b5c4', '#f08a2c',
  '#7a5230', '#9bc53d', '#5b6ee1', '#d94f8c', '#2e8b74', '#c9a227', '#8c8c8c', '#4b3f9e'];
export const CARDS = {
  dragon: { short: 'マスを燃やす', name: '炎の竜', icon: 'dragon', w: 3, target: 'any', ask: '燃やしたい相手のマス', text: '選んだマスと、となりの同じ人のマス2つまでを、空き地にもどす（お城はのぞく）' },
  shield: { short: 'マスを守る', name: '守りの結界', icon: 'shield', w: 3, target: 'own', ask: '守りたい自分のマス', text: '選んだ自分のマスと、そのとなりの自分のマスは、このラウンド取られない' },
  portal: { short: 'どこでも置ける', name: '転移の門', icon: 'portal', w: 3, target: null, text: 'このラウンドは、どこにでも兵を置ける。兵 ＋2' },
  hero: { short: '兵+4', name: '勇者の加勢', icon: 'hero', w: 3, target: null, text: 'このラウンドの兵 ＋4' },
  dice: { short: '兵+1〜6', name: '運命のサイコロ', icon: 'dice', w: 4, target: null, text: 'このラウンドの兵 ＋1〜6' },
  storm: { short: 'みんなの兵-2', name: '大嵐', icon: 'storm', w: 2, target: null, text: 'ほかの全員の、いちばん多く兵を置いたマスで、兵が2減る' },
  treasure: { short: 'すぐ2点', name: '竜の宝', icon: 'treasure', w: 2, target: null, text: 'すぐに2点もらえる' },
  // 攻め
  thunder: { short: '守りを0に', name: '雷の槍', icon: 'thunder', w: 3, target: 'any', ask: '守りを0にしたいマス', text: '選んだマスの守り（持ち主+1・土地の守り）が、このラウンドだけ0になる' },
  knights: { short: '2マス先まで・兵+3', name: '騎士団', icon: 'knights', w: 3, target: null, text: 'このラウンドは、自分の土地から2マス先まで兵を置ける。兵 ＋3' },
  catapult: { short: '遠くを攻撃', name: '投石機', icon: 'catapult', w: 3, target: 'any', ask: '石を飛ばすマス', text: '選んだマスに、兵3人ぶんの攻撃がとどく（どこでも）' },
  // じゃま
  seal: { short: '相手を封印', name: '封印', icon: 'seal', w: 2, target: 'enemy', ask: '封印したい人のマス', text: '選んだマスの持ち主は、次のラウンドにカードを使えず、兵も2少ない' },
  thief: { short: '2点うばう', name: '盗賊', icon: 'thief', w: 2, target: 'enemy', ask: 'ぬすみたい人のマス', text: '選んだマスの持ち主から2点うばう' },
  swap: { short: 'マスを寝返らせる', name: '寝返り', icon: 'swap', w: 2, target: 'enemy', ask: 'ほしい相手のマス（お城以外）', text: '選んだ相手のマス（お城以外）の兵が寝返って、自分のものになる' },
  // 大逆転
  wrath: { short: '1位の3マスを燃やす', name: '龍王の怒り', icon: 'wrath', w: 1, target: null, text: 'いまの1位（自分以外）の土地が3マス、空き地にもどる（お城はのぞく）' },
  legend: { short: '兵+6', name: '英雄の誕生', icon: 'legend', w: 1, target: null, text: 'このラウンドの兵 ＋6' },
  quake: { short: '上の人の土地を減らす', name: '大地震', icon: 'quake', w: 1, target: null, text: '自分より順位が上の人みんなの土地が、2マスずつ空き地にもどる（お城はのぞく）' },
};
const CARD_KEYS = Object.keys(CARDS);
// イベント（予告なしで、ときどき結果の時に起きる）
export const EVENTS = {
  raid: { name: 'ドラゴンがあらわれた！', icon: 'raid', text: 'だれかの土地が3マス、空き地にもどった' },
  wave: { name: '大波がきた！', icon: 'wave', text: '海ぞいの土地が4マス、空き地にもどった' },
  meteor: { name: '隕石が落ちた！', icon: 'meteor', text: '落ちたマスと、そのまわりが空き地にもどった（お城はのぞく）' },
  volcano: { name: '火山の噴火！', icon: 'volcano', text: '山のまわりの土地が、空き地にもどった' },
  tornado: { name: '竜巻！', icon: 'tornado', text: '竜巻が通ったマスが、空き地にもどった' },
  blizzard: { name: '吹雪', icon: 'blizzard', text: '次のラウンドは、みんな兵が1少ない' },
  eclipse: { name: '日食', icon: 'eclipse', text: '次のラウンドは、だれもカードを使えない' },
  gold: { name: '金貨の雨', icon: 'gold', text: 'みんな1点もらえた' },
  glow: { name: 'ルーンが光った', icon: 'glow', text: 'ルーンの石を持っている人は、1つにつき1点' },
  fairy: { name: '妖精のおくりもの', icon: 'fairy', text: 'みんなカードを1枚もらえた' },
};
export const CHEST_PT = 2;
// バランスの数字（tests/balance.mjs で何千回も戦わせて決める）
export const BAL = {
  catchUp: 0.8,        // 順位が下の人ほど強いカードが出やすくなる強さ（0＝みんな同じ）
  strong: ['dragon', 'hero', 'portal', 'thunder', 'catapult', 'wrath', 'legend'],
  lateRounds: 2,       // 途中から入った人の兵が少ないラウンド数
  lateMinus: 1,        // そのあいだ減らす兵
  diceMax: 2,          // とりあいのマスで足されるサイコロ（0〜この数）
  eventRate: 0.2,      // 1ラウンドでイベントが起きる確率（3ラウンド目から。2回続けては起きない）
  chestRespawn: 0.35,  // 宝箱が足りない時、新しく出る確率
  landDiv: 6,          // 持っているマスいくつごとに兵が1増えるか
  underdog: 2,         // 点数が下半分の人に足す兵
};

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mix = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), 2654435761) >>> 0, 0x9e3779b9);
// t：順位（0＝1位 … 1＝ビリ）。ビリに近いほど強いカードが出やすい
export function cardWeights(t = 0.5) {
  return CARD_KEYS.map(k => { const w = CARDS[k].w; return BAL.strong.includes(k) ? w * (1 + BAL.catchUp * (t - 0.5) * 2) : w * (1 - BAL.catchUp * (t - 0.5) * 0.6); }).map(w => Math.max(0.05, w));
}
function drawCard(r, t) { const ws = cardWeights(t), sum = ws.reduce((a, b) => a + b, 0); let x = r() * sum; for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x < 0) return CARD_KEYS[i]; } return 'dice'; }
export function dealHand(r, t, n = HAND_DEAL) { const out = []; for (let k = 0; k < 40 && out.length < n; k++) { const c = drawCard(r, t); if (!out.includes(c) || k > 30) out.push(c); } return out; } // 同じ種類が重ならないように
export function diceRoll(seed, round, pi) { return 1 + Math.floor(rng(mix(seed, round, pi, 77))() * 6); }

export function radiusFor(n) { return n <= 3 ? 3 : n <= 5 ? 4 : n <= 8 ? 5 : n <= 12 ? 6 : 7; } // マスを大きく見せるため、盤面は小さめ
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

// 盤面を作る（同じ seed・同じ R なら必ず同じ）
const mapCache = new Map();
export function makeMap(seed, R) {
  const key = seed + ':' + R; if (mapCache.has(key)) return mapCache.get(key);
  const r = rng(mix(seed, R, 1));
  const tiles = [], at = new Map();
  for (let q = -R; q <= R; q++) for (let s = Math.max(-R, -q - R); s <= Math.min(R, -q + R); s++) { at.set(q + ',' + s, tiles.length); tiles.push({ q, r: s, t: T.PLAIN }); }
  const nb = tiles.map(h => DIRS.map(([dq, dr]) => at.get((h.q + dq) + ',' + (h.r + dr))).filter(i => i !== undefined));
  // まとまりのある地形：種のマスから少し広げる
  const grow = (type, seeds, size) => {
    for (let k = 0; k < seeds; k++) {
      let cur = Math.floor(r() * tiles.length);
      for (let j = 0; j < size; j++) { if (tiles[cur].t === T.PLAIN) tiles[cur].t = type; const ns = nb[cur]; cur = ns[Math.floor(r() * ns.length)]; }
    }
  };
  const N = tiles.length;
  grow(T.FOREST, Math.ceil(N / 22), 6);
  grow(T.MOUNTAIN, Math.ceil(N / 40), 5);
  grow(T.LAKE, Math.ceil(N / 60), 4);
  const m = { seed, R, tiles, nb, at, N };
  mapCache.set(key, m);
  return m;
}

// お城の場所：なるべく離れるように選ぶ（同じ seed なら同じ）
function pickSpread(m, count, taken, r) {
  const out = [], cand = [];
  for (let i = 0; i < m.N; i++) if (m.tiles[i].t !== T.LAKE && dist(m.tiles[i], { q: 0, r: 0 }) <= m.R - 1) cand.push(i);
  const used = [...taken];
  for (let k = 0; k < count; k++) {
    let best = -1, bd = -1;
    for (const i of cand) {
      if (used.includes(i)) continue;
      const d = used.length ? Math.min(...used.map(j => dist(m.tiles[i], m.tiles[j]))) + r() * 0.5 : r();
      if (d > bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    out.push(best); used.push(best);
  }
  return out;
}

export function newGame({ seed, players, rounds = 18, planMs = 35000 }) {
  const n = players.length, R = radiusFor(n), m = makeMap(seed, R);
  const r = rng(mix(seed, 2));
  const castles = pickSpread(m, n, [], r);
  const terrain = m.tiles.map(t => t.t);
  const owner = new Array(m.N).fill(-1);
  const ps = players.map((p, i) => {
    const c = castles[i];
    terrain[c] = T.PLAIN; owner[c] = i;
    for (const j of m.nb[c]) if (terrain[j] === T.LAKE) terrain[j] = T.PLAIN;
    const cr = rng(mix(seed, 3, i));
    return { id: p.id, name: p.name, color: p.color ?? COLORS[i % COLORS.length], castle: c, hand: dealHand(cr, 0.5), bonus: 0, joined: 1, ...(p.bot ? { bot: p.bot } : {}) };
  });
  // ルーンの石：お城から離れたところに、人数＋2こ
  const runes = pickSpread(m, n + 2, castles, r).filter(i => !castles.includes(i));
  for (const i of runes) terrain[i] = T.RUNE;
  // 特別なマス：村・神殿・金鉱・見張りの塔
  const taken = [...castles, ...runes];
  const special = [[T.VILLAGE, Math.max(2, Math.round(m.N / 20))], [T.SHRINE, Math.max(1, Math.ceil(n / 3))], [T.MINE, Math.max(1, Math.ceil(n / 2))], [T.TOWER, Math.max(1, Math.round(m.N / 40))]];
  for (const [t, cnt] of special) for (const i of pickSpread(m, cnt, taken, r)) { if (castles.includes(i) || terrain[i] === T.RUNE) continue; terrain[i] = t; taken.push(i); }
  // 宝箱：お城とルーンの石から離れたところに
  const chests = pickSpread(m, chestTarget(n), taken, r).filter(i => terrain[i] !== T.RUNE && owner[i] === -1);
  return { v: 1, seed, R, round: 1, rounds, planMs, phase: 'plan', players: ps, terrain, owner, chests, last: null, pending: [] };
}

export const mapOf = st => makeMap(st.seed, st.R);
export const chestTarget = n => Math.max(2, Math.ceil(n / 2) + 1);
export const diceFor = (seed, round, i, pi) => Math.floor(rng(mix(seed, round, i, pi, 31))() * (BAL.diceMax + 1));
export const isCastle = (st, i) => st.players.some(p => p.castle === i);
export function landOf(st, pi) { let n = 0; for (const o of st.owner) if (o === pi) n++; return n; }
export function runesOf(st, pi) { let n = 0; st.owner.forEach((o, i) => { if (o === pi && st.terrain[i] === T.RUNE) n++; }); return n; }
export const isOut = (st, pi) => !!(st.players[pi] && st.players[pi].out);
export const countOf = (st, pi, t) => { let n = 0; st.owner.forEach((o, i) => { if (o === pi && st.terrain[i] === t) n++; }); return n; };
// 終盤の盛り上がり：0＝ふつう／1＝終盤戦（のこり3分の1）／2＝最後の3ラウンド／3＝最終ラウンド
export function heat(st) { const left = st.rounds - st.round; return left <= 0 ? 3 : left < 3 ? 2 : st.round > st.rounds * 2 / 3 ? 1 : 0; }
// お城が包囲されているか（持ち主が、まわりのマスを1つも持っていない）。包囲されたお城だけ攻められる
export function besieged(st, i) { const o = st.owner[i]; return o < 0 || !mapOf(st).nb[i].some(j => st.owner[j] === o); }
export function baseTroops(st, pi) {
  if (isOut(st, pi)) return 0;
  const p = st.players[pi], late = (p && p.joined > 1 && st.round - p.joined < BAL.lateRounds ? BAL.lateMinus : 0) + (p && p.sealed === st.round ? 2 : 0);
  let ud = 0;
  if (BAL.underdog && st.players.length > 1) { const sc = score(st, pi); const below = st.players.filter((_, j) => score(st, j) > sc).length; if (below >= st.players.length / 2) ud = BAL.underdog; }
  const vil = countOf(st, pi, T.VILLAGE), cold = st.blizzard === st.round ? 1 : 0;
  return Math.max(1, 3 + Math.floor(landOf(st, pi) / BAL.landDiv) + runesOf(st, pi) + vil + heat(st) - late - cold + ud);
}
// 兵の数の内わけ（画面で説明する用）
export function troopParts(st, pi) {
  if (isOut(st, pi)) return [];
  const p = st.players[pi], a = [['基本', 3]];
  const ld = Math.floor(landOf(st, pi) / BAL.landDiv); if (ld) a.push([`土地${BAL.landDiv}マスごと`, ld]);
  const ru = runesOf(st, pi); if (ru) a.push(['ルーンの石', ru]);
  const vil = countOf(st, pi, T.VILLAGE); if (vil) a.push(['村', vil]);
  const h = heat(st); if (h) a.push(['終盤', h]);
  if (BAL.underdog && st.players.length > 1) { const sc = score(st, pi); if (st.players.filter((_, j) => score(st, j) > sc).length >= st.players.length / 2) a.push(['下位の助け', BAL.underdog]); }
  if (p.joined > 1 && st.round - p.joined < BAL.lateRounds) a.push(['途中参加', -BAL.lateMinus]);
  if (p.sealed === st.round) a.push(['封印', -2]);
  if (st.blizzard === st.round) a.push(['吹雪', -1]);
  return a;
}
export function cardTroops(st, pi, card) { return card === 'hero' ? 4 : card === 'portal' ? 2 : card === 'knights' ? 3 : card === 'legend' ? 6 : card === 'dice' ? diceRoll(st.seed, st.round, pi) : 0; }
export function score(st, pi) {
  let s = st.players[pi].bonus;
  st.owner.forEach((o, i) => { if (o !== pi) return; s += 1; if (st.terrain[i] === T.RUNE) s += RUNE_PT; if (isCastle(st, i)) s += CASTLE_PT; });
  return s;
}
export function defenseOf(st, i) { if (isCastle(st, i)) return CASTLE_DEF; const o = st.owner[i]; const tower = o >= 0 && st.terrain[i] !== T.TOWER && mapOf(st).nb[i].some(j => st.owner[j] === o && st.terrain[j] === T.TOWER) ? 1 : 0; return DEF[st.terrain[i]] + tower; }

// そのマスに兵を置けるか
export function canPlace(st, pi, i, portal, knights) {
  if (i < 0 || i >= st.owner.length || st.terrain[i] === T.LAKE || isOut(st, pi)) return false;
  if (isCastle(st, i) && st.owner[i] >= 0 && st.owner[i] !== pi && !besieged(st, i)) return false; // 包囲されていないお城は攻められない
  if (portal) return true;
  if (st.owner[i] === pi) return true;
  const m = mapOf(st);
  if (landOf(st, pi) === 0) return st.owner[i] === -1; // ふっかつ：だれのものでもない好きなマス
  if (m.nb[i].some(j => st.owner[j] === pi)) return true;
  return !!knights && m.nb[i].some(j => m.nb[j].some(k => st.owner[k] === pi)); // 騎士団：2マス先まで
}

// 作戦を正しい形に直す（多すぎる兵・置けないマスは捨てる）
export function cleanPlan(st, pi, plan) {
  const p = st.players[pi]; if (!p || !plan) return null;
  let card = null, target = null;
  if (plan.card != null && p.hand[plan.card.i] === plan.card.k) {
    card = plan.card.k; const def = CARDS[card];
    target = plan.card.target ?? null;
    if (def.target === 'any' && !(target >= 0 && target < st.owner.length && st.terrain[target] !== T.LAKE)) card = null;
    if (def.target === 'own' && !(target >= 0 && st.owner[target] === pi)) card = null;
    if (def.target === 'enemy' && !(target >= 0 && st.owner[target] >= 0 && st.owner[target] !== pi)) card = null;
    if (card === 'swap' && isCastle(st, target)) card = null;
    if (p.sealed === st.round || st.eclipse === st.round || p.out) card = null; // 封印・日食・落城
  }
  const portal = card === 'portal', knights = card === 'knights';
  let left = baseTroops(st, pi) + cardTroops(st, pi, card);
  const place = new Map();
  for (const [i, n0] of plan.place || []) {
    const n = Math.min(Math.floor(n0) || 0, left);
    if (n <= 0 || !canPlace(st, pi, i, portal, knights)) continue;
    place.set(i, (place.get(i) || 0) + n); left -= n;
  }
  return { card, cardIdx: card ? plan.card.i : -1, target, place };
}

// 1ラウンドの結果を出す。plans: { [playerIndex]: plan }
export function resolve(st0, plans) {
  const st = JSON.parse(JSON.stringify(st0));
  const n = st.players.length, log = [];
  const clean = []; for (let pi = 0; pi < n; pi++) clean[pi] = cleanPlan(st0, pi, plans[pi]);
  const shields = new Set(), stormers = [], thief = [], sealed = [], thunder = [], catapult = [], swapped = [];
  // カードを手札から出す
  clean.forEach((c, pi) => {
    if (!c || !c.card) return;
    st.players[pi].hand.splice(c.cardIdx, 1);
    const nm = st.players[pi].name, def = CARDS[c.card];
    if (c.card === 'shield') { shields.add(c.target); for (const j of mapOf(st).nb[c.target]) if (st0.owner[j] === pi) shields.add(j); }
    if (c.card === 'storm') stormers.push(pi);
    if (c.card === 'treasure') st.players[pi].bonus += BONUS_PT;
    if (c.card === 'thief') { const o = st0.owner[c.target]; st.players[o].bonus -= 2; st.players[pi].bonus += 2; thief.push([pi, o]); }
    if (c.card === 'seal') { const o = st0.owner[c.target]; st.players[o].sealed = st.round + 1; sealed.push([pi, o]); }
    if (c.card === 'thunder') thunder.push(c.target);
    if (c.card === 'catapult') catapult.push([pi, c.target]);
    log.push({ pi, card: c.card, target: c.target, text: `${nm}：${def.name}` + (c.card === 'dice' ? `（${diceRoll(st.seed, st.round, pi)}）` : '') });
  });
  // 寝返り：選んだ相手のマス（お城以外）が自分のものに
  clean.forEach((c, pi) => {
    if (!c || c.card !== 'swap') return;
    const i = c.target, o = st.owner[i]; if (o < 0 || o === pi || shields.has(i) || isCastle(st, i)) return;
    const m = mapOf(st), val = j => (st.terrain[j] === T.RUNE ? 10 : 0) + DEF[st.terrain[j]] - (m.nb[j].some(k => st.owner[k] === o) ? 3 : 0) + m.nb[j].filter(k => st.owner[k] === pi).length * 0.2;
    const mine = []; st.owner.forEach((x, j) => { if (x === pi && j !== i && !isCastle(st, j) && !shields.has(j)) mine.push(j); });
    st.owner[i] = pi; let j = -1;
    // 寝返り：相手のマスが自分のものになるだけ（かわりに渡すマスはない）
    swapped.push([pi, i, o, j]);
  });
  // 炎の竜（結界とお城には効かない）
  const burned = [];
  const burnRandom = (owner, nb, salt) => { const pool = []; st.owner.forEach((x, j) => { if (x === owner && !isCastle(st, j) && !shields.has(j)) pool.push(j); }); const r = rng(mix(st.seed, st.round, salt)); for (let k = 0; k < nb && pool.length; k++) { const j = pool.splice(Math.floor(r() * pool.length), 1)[0]; st.owner[j] = -1; burned.push(j); } };
  // 龍王の怒り：いまの1位（自分以外）の土地が3マス / 大地震：みんな2マスずつ
  clean.forEach((c, pi) => {
    if (!c) return;
    if (c.card === 'wrath') { const top = ranking(st0).find(x => x.pi !== pi); if (top) burnRandom(top.pi, 3, 70 + pi); }
    if (c.card === 'quake') { const rk0 = ranking(st0), me = rk0.findIndex(x => x.pi === pi); rk0.slice(0, me).forEach(x => burnRandom(x.pi, 2, 90 + pi * 31 + x.pi)); }
  });
  clean.forEach((c, pi) => {
    if (!c || c.card !== 'dragon') return;
    const i = c.target, o = st.owner[i];
    if (shields.has(i) || isCastle(st, i) || o === -1) return;
    st.owner[i] = -1; burned.push(i);
    let more = 2;
    for (const j of mapOf(st).nb[i]) { if (more <= 0) break; if (st.owner[j] === o && j !== i && !shields.has(j) && !isCastle(st, j)) { st.owner[j] = -1; burned.push(j); more--; } }
  });
  // マスごとに強さをくらべる
  const force = new Map(); // tile -> Map(pi -> n)
  clean.forEach((c, pi) => {
    if (!c) return;
    // 大嵐：ほかの人が使ったぶんだけ、いちばん多く置いたマスで2ずつ減る
    const minus = stormers.filter(s => s !== pi).length * 2;
    let big = -1, bk = 0; for (const [i, k] of c.place) if (k > bk) { bk = k; big = i; }
    for (const [i, k] of c.place) {
      const v = i === big ? k - minus : k; if (v <= 0) continue;
      if (!force.has(i)) force.set(i, new Map());
      force.get(i).set(pi, v);
    }
  });
  // 投石機：選んだマスに、兵3人ぶんの攻撃
  for (const [pi, i] of catapult) { if (st.terrain[i] === T.LAKE) continue; if (!force.has(i)) force.set(i, new Map()); const f = force.get(i); f.set(pi, (f.get(pi) || 0) + 3); }
  // サイコロ：何人かが同じマスに兵を置いた時だけ、それぞれに 0〜2 が足される
  const dice = [];
  for (const [i, f] of force) {
    if (f.size < 2) continue;
    const ds = [];
    for (const [pi, v] of f) { const d = diceFor(st.seed, st.round, i, pi); f.set(pi, v + d); ds.push([pi, d]); }
    dice.push([i, ds]);
  }
  const changed = [], fights = [];
  // 1マスごとの勝負。くわしい内訳を fights に残す（「なぜ取れなかったか」を画面で見せるため）
  //   o：持ち主 g：持ち主が置いた兵（サイコロこみ） b：持ち主の +1 d：土地の守り hold：守りの合計
  //   w：いちばん強い攻め手 v：その強さ tie：攻め手どうしの引き分け r：結果（take=取った keep=守った tie=引き分け shield=結界）
  for (const [i, f] of force) {
    const zap = thunder.includes(i); // 雷の槍：守りが0
    const o = st.owner[i], d = zap ? 0 : defenseOf(st, i), g = o >= 0 ? (f.get(o) || 0) : 0, b = o >= 0 && !zap ? 1 : 0;
    const hold = g + b + d;
    let best = -1, bv = 0, tie = false;
    for (const [pi, v] of f) { if (pi === o) continue; if (v > bv) { bv = v; best = pi; tie = false; } else if (v === bv) tie = true; }
    let r = 'keep';
    const guarded = isCastle(st, i) && o >= 0 && !besieged(st, i); // 包囲されていないお城
    if (shields.has(i)) r = 'shield';
    else if (guarded) r = 'guard';
    else if (best >= 0 && tie && bv > hold) r = 'tie';
    else if (best >= 0 && !tie && bv > hold) { r = 'take'; changed.push({ i, from: o, to: best }); st.owner[i] = best; }
    fights.push({ i, o, g, b, d, hold, w: best, v: bv, tie, r });
  }
  // 落城：お城を取られた人は、そのまま負け（あとは見学）。その人の土地は、お城を取った人のものに
  const fallen = [];
  for (const c of changed) {
    const o = c.from; if (o < 0 || st.players[o].castle !== c.i || st.players[o].out) continue;
    st.players[o].out = st.round; st.players[o].hand = [];
    st.owner.forEach((x, j) => { if (x === o) st.owner[j] = c.to; });
    fallen.push({ o, by: c.to });
  }
  // 宝箱：取った人が開ける（カード1枚か2点）
  const rkPos = new Map(ranking(st).map((x, k, a) => [x.pi, a.length > 1 ? k / (a.length - 1) : 0.5]));
  const opened = [], extra = {}; // extra：宝箱や妖精でもらったカード（配りなおしのあとで足す）
  st.chests ||= [];
  for (const c of changed) {
    const k = st.chests.indexOf(c.i); if (k < 0) continue;
    st.chests.splice(k, 1);
    const r = rng(mix(st.seed, st.round, c.i, 41)), p = st.players[c.to];
    if (r() < 0.5) { const card = drawCard(r, rkPos.get(c.to)); (extra[c.to] ||= []).push(card); opened.push({ i: c.i, pi: c.to, card }); }
    else { p.bonus += CHEST_PT; opened.push({ i: c.i, pi: c.to, pt: CHEST_PT }); }
  }
  // 天災・イベント（予告なしで起きる）
  const m2 = mapOf(st);
  const burn = (i, tiles) => { if (i < 0 || st.owner[i] < 0 || isCastle(st, i) || shields.has(i)) return; tiles.push([i, st.owner[i]]); st.owner[i] = -1; };
  const applyEvent = (k, target, salt) => {
    const er = rng(mix(st.seed, st.round, salt)), tiles = [];
    const pool = edgeOnly => { const out = []; st.owner.forEach((o, i) => { if (o >= 0 && !isCastle(st, i) && !shields.has(i) && (!edgeOnly || m2.nb[i].length < 6)) out.push(i); }); return out; };
    if (k === 'raid') { const who = target != null && st.owner[target] >= 0 ? st.owner[target] : -1; const pl = pool(false).filter(i => who < 0 || st.owner[i] === who); for (let n = 3; n > 0 && pl.length; n--) burn(pl.splice(Math.floor(er() * pl.length), 1)[0], tiles); }
    if (k === 'wave') { const pl = pool(true); for (let n = 4; n > 0 && pl.length; n--) burn(pl.splice(Math.floor(er() * pl.length), 1)[0], tiles); }
    if (k === 'meteor') { const c = target ?? Math.floor(er() * st.owner.length); burn(c, tiles); for (const j of m2.nb[c]) burn(j, tiles); }
    if (k === 'volcano') { const mt = []; st.terrain.forEach((t, i) => { if (t === T.MOUNTAIN) mt.push(i); }); if (mt.length) { const v = mt[Math.floor(er() * mt.length)]; burn(v, tiles); for (const j of m2.nb[v]) burn(j, tiles); } }
    if (k === 'tornado') { let c = target ?? Math.floor(er() * st.owner.length); const dir = Math.floor(er() * 6); for (let n = 0; n < 5 && c != null; n++) { burn(c, tiles); const h = m2.tiles[c], nx = m2.at.get((h.q + [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][dir][0]) + ',' + (h.r + [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][dir][1])); c = nx; } }
    if (k === 'blizzard') st.blizzard = st.round + 1;
    if (k === 'eclipse') st.eclipse = st.round + 1;
    if (k === 'gold') st.players.forEach(p => { if (!p.out) p.bonus += 1; });
    if (k === 'glow') st.players.forEach((p, pi) => { p.bonus += runesOf(st, pi); });
    if (k === 'fairy') st.players.forEach((p, pi) => { if (!p.out) (extra[pi] ||= []).push(drawCard(rng(mix(st.seed, st.round, pi, 77)), rkPos.get(pi))); });
    return tiles;
  };
  let event = null;
  const er0 = rng(mix(st.seed, st.round, 99));
  if (st.round >= 3 && st.lastEvent !== st.round - 1 && er0() < BAL.eventRate) {
    const keys = Object.keys(EVENTS), k = keys[Math.floor(er0() * keys.length)];
    event = { k, tiles: applyEvent(k, null, 99) };
    st.lastEvent = st.round;
  }
  // 金鉱：持っている人は毎ラウンド1点
  st.players.forEach((p, pi) => { if (!p.out) p.bonus += countOf(st, pi, T.MINE); });
  // 最終ラウンド：取ったマスは2点（1点おまけ）
  if (st.round === st.rounds) for (const c of changed) if (st.owner[c.i] === c.to) st.players[c.to].bonus += 1;
  // 宝箱が足りなければ、ときどき新しく出す
  const cr = rng(mix(st.seed, st.round, 55));
  if (st.chests.length < chestTarget(st.players.length) && cr() < BAL.chestRespawn) {
    const free = []; st.owner.forEach((o, i) => { if (o === -1 && st.terrain[i] !== T.LAKE && st.terrain[i] !== T.RUNE && !st.chests.includes(i)) free.push(i); });
    if (free.length) st.chests.push(free[Math.floor(cr() * free.length)]);
  }
  // カードを配りなおす：毎ラウンド手札を全部入れかえて3枚（なるべく別の種類。順位が下の人ほど強いカードが出やすい）
  const rk = ranking(st), np = Math.max(1, rk.length - 1);
  rk.forEach((x, pos) => {
    const p = st.players[x.pi], r = rng(mix(st.seed, st.round, x.pi, 5));
    const h = heat({ ...st, round: st.round + 1 }), size = HAND_DEAL + (h >= 1 ? 1 : 0) + (h >= 2 ? 1 : 0) + Math.min(2, countOf(st, x.pi, T.SHRINE)); // 終盤と神殿でカードが増える
    p.hand = p.out ? [] : dealHand(r, rk.length > 1 ? pos / np : 0.5, size).concat(extra[x.pi] || []).slice(0, HAND_MAX);
  });
  // 表彰のための記録
  st.stats ||= {};
  st.players.forEach((p, pi) => { st.stats[pi] ||= { gain: 0, lost: 0, cards: 0, best: 0, worst: 0 }; });
  const gainNow = {};
  for (const c of changed) { gainNow[c.to] = (gainNow[c.to] || 0) + 1; st.stats[c.to].gain++; if (c.from >= 0) st.stats[c.from].lost++; }
  for (const i of burned) { /* 燃やされた分も、取られた数に入れる */ const o = st0.owner[i]; if (o >= 0) st.stats[o].lost++; }
  if (event) for (const [, o] of event.tiles) st.stats[o].lost++;
  for (const l of log) st.stats[l.pi].cards++;
  for (const k in gainNow) st.stats[k].best = Math.max(st.stats[k].best, gainNow[k]);
  const forceOut = [...force].map(([i, f]) => [i, [...f]]);
  st.last = { round: st.round, changed, burned, shields: [...shields], log, force: forceOut, dice, opened, event, fights, thunder, catapult, thief, sealed, swapped, fallen };
  ranking(st).forEach((x, pos) => { st.stats[x.pi].worst = Math.max(st.stats[x.pi].worst, pos); });
  st.round++;
  if (st.round > st.rounds) st.phase = 'end';
  if (st.players.length > 1 && st.players.filter(p => !p.out).length <= 1) st.phase = 'end'; // 生き残りが1人になったら終わり
  return st;
}

// 途中から入った人：空いているところにお城をもらう
export function addLatePlayer(st, p) {
  const m = mapOf(st), pi = st.players.length;
  let best = -1, bd = -1;
  const owned = []; st.owner.forEach((o, i) => { if (o >= 0) owned.push(i); });
  for (let i = 0; i < m.N; i++) {
    if (st.owner[i] !== -1 || st.terrain[i] === T.LAKE || st.terrain[i] === T.RUNE || (st.chests || []).includes(i)) continue;
    const d = owned.length ? Math.min(...owned.map(j => dist(m.tiles[i], m.tiles[j]))) : 0;
    if (d > bd) { bd = d; best = i; }
  }
  if (best < 0) return false;
  st.owner[best] = pi; st.terrain[best] = T.PLAIN;
  const cr = rng(mix(st.seed, 3, pi, st.round));
  st.players.push({ id: p.id, name: p.name, color: COLORS[pi % COLORS.length], castle: best, hand: dealHand(cr, 0.5), bonus: 0, joined: st.round, ...(p.bot ? { bot: p.bot } : {}) });
  return true;
}

// 最後の表彰：記録から、なるべくいろいろな人に称号を配る
export function awards(st) {
  const rk = ranking(st), S = st.stats || {}, n = st.players.length, out = [], got = new Set();
  // まだ称号のない人を少しひいきする（いちばんの7割以上なら、その人に）
  const pick = (title, desc, val, minV = 1) => {
    const vs = st.players.map((_, pi) => val(pi)), top = Math.max(...vs);
    if (!(top >= minV)) return;
    let best = vs.indexOf(top);
    const alt = vs.map((v, pi) => [v, pi]).filter(([v, pi]) => !got.has(pi) && v >= minV && v >= top * 0.7).sort((x, y) => y[0] - x[0])[0];
    if (got.has(best) && alt) best = alt[1];
    out.push({ pi: best, title, desc: desc(vs[best]) }); got.add(best);
  };
  const s = pi => S[pi] || { gain: 0, lost: 0, cards: 0, best: 0, worst: 0 };
  pick('ひろい国の王', v => `${v}マスを持っていた`, pi => landOf(st, pi));
  pick('いっきの大攻め', v => `1ラウンドで${v}マス取った`, pi => s(pi).best, 2);
  pick('魔法つかい', v => `カードを${v}回使った`, pi => s(pi).cards, 2);
  pick('ルーンの守り手', v => `ルーンの石を${v}つ持っていた`, pi => runesOf(st, pi));
  const final = new Map(rk.map((x, i) => [x.pi, i]));
  if (n >= 3) pick('大逆転', v => `${v}位ぶん追い上げた`, pi => s(pi).worst - final.get(pi), 2);
  pick('かたい守り', v => `取られたのは${100 - v}マスだけ`, pi => (landOf(st, pi) > 0 ? 100 - s(pi).lost : -1), 0);
  return out.slice(0, Math.min(5, Math.max(2, n)));
}

export function ranking(st) {
  return st.players.map((p, pi) => ({ pi, name: p.name, color: p.color, score: score(st, pi), land: landOf(st, pi), out: p.out || 0 }))
    .sort((a, b) => ((a.out ? 1 : 0) - (b.out ? 1 : 0)) || (b.out - a.out) || b.score - a.score || b.land - a.land); // 生き残りが上。落城した人は、あとまで残った人が上
}

// 送る時は小さくする（持ち主の並びを文字に）
const ENC = '.abcdefghijklmnopqrstuvwxyz';
export function pack(st) { return { ...st, owner: st.owner.map(o => ENC[o + 1]).join(''), terrain: st.terrain.join('') }; }
export function unpack(s) { return { ...s, owner: [...s.owner].map(c => ENC.indexOf(c) - 1), terrain: [...s.terrain].map(Number) }; }

// 試験やにせプレイヤー用：かんたんな作戦を立てる
export function botPlan(st, pi, r = Math.random) {
  const p = st.players[pi]; if (!p) return null;
  let card = null;
  if (p.hand.length && r() < 0.5) {
    const i = Math.floor(r() * p.hand.length), k = p.hand[i], def = CARDS[k];
    let target = null;
    if (def.target === 'any') { const cs = []; st.owner.forEach((o, j) => { if (o >= 0 && o !== pi) cs.push(j); }); target = cs.length ? cs[Math.floor(r() * cs.length)] : null; }
    if (def.target === 'own') { const cs = []; st.owner.forEach((o, j) => { if (o === pi) cs.push(j); }); target = cs.length ? cs[Math.floor(r() * cs.length)] : null; }
    if (!def.target || target != null) card = { i, k, target };
  }
  const portal = card && card.k === 'portal';
  let left = baseTroops(st, pi) + cardTroops(st, pi, card && card.k);
  const cand = []; for (let i = 0; i < st.owner.length; i++) if (st.owner[i] !== pi && canPlace(st, pi, i, portal)) cand.push(i);
  const place = [];
  while (left > 0 && cand.length) { const i = cand[Math.floor(r() * cand.length)], k = Math.min(left, 1 + Math.floor(r() * 3)); place.push([i, k]); left -= k; }
  return { place, card };
}
