// ルーンランド：ルール（画面なし。スマホでも試験でも同じものを使う）
// 盤面の地形は「種」と人数から全員のスマホで同じものを作る。送るのは持ち主の並びなど小さいものだけ。

export const T = { PLAIN: 0, FOREST: 1, MOUNTAIN: 2, LAKE: 3, RUNE: 4 };
export const DEF = [0, 1, 2, 0, 2]; // 土地の守り
export const CASTLE_DEF = 3, CASTLE_PT = 2, RUNE_PT = 3, BONUS_PT = 3;
export const HAND_MAX = 3, START_CARDS = 2;
export const COLORS = ['#e8483b', '#3a7be0', '#f2b631', '#3fae5a', '#a05ad6', '#f07fb4', '#22b5c4', '#f08a2c',
  '#7a5230', '#9bc53d', '#5b6ee1', '#d94f8c', '#2e8b74', '#c9a227', '#8c8c8c', '#4b3f9e'];
export const CARDS = {
  dragon: { name: '炎の竜', icon: '🐉', w: 3, target: 'any', text: '選んだマスを、だれのものでもない土地にもどす（お城はのぞく）' },
  shield: { name: '守りの結界', icon: '🛡️', w: 3, target: 'own', text: '選んだ自分のマスは、このラウンド取られない' },
  portal: { name: '転移の門', icon: '🌀', w: 3, target: null, text: 'このラウンドは、どこにでも兵を置ける' },
  hero: { name: '勇者の加勢', icon: '⚔️', w: 3, target: null, text: 'このラウンドの兵 ＋4' },
  dice: { name: '運命のサイコロ', icon: '🎲', w: 4, target: null, text: 'このラウンドの兵 ＋1〜6' },
  storm: { name: '大嵐', icon: '🌪️', w: 2, target: null, text: 'ほかの全員が置いた兵が、どのマスでも1ずつ減る' },
  treasure: { name: '竜の宝', icon: '💎', w: 2, target: null, text: 'すぐに3点もらえる' },
};
const CARD_KEYS = Object.keys(CARDS);
const CARD_W = CARD_KEYS.reduce((s, k) => s + CARDS[k].w, 0);

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mix = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), 2654435761) >>> 0, 0x9e3779b9);
function drawCard(r) { let x = r() * CARD_W; for (const k of CARD_KEYS) { x -= CARDS[k].w; if (x < 0) return k; } return 'dice'; }
export function diceRoll(seed, round, pi) { return 1 + Math.floor(rng(mix(seed, round, pi, 77))() * 6); }

export function radiusFor(n) { return n <= 2 ? 4 : n <= 4 ? 5 : n <= 6 ? 6 : n <= 9 ? 7 : n <= 12 ? 8 : 9; }
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
    return { id: p.id, name: p.name, color: p.color ?? COLORS[i % COLORS.length], castle: c, hand: Array.from({ length: START_CARDS }, () => drawCard(cr)), bonus: 0 };
  });
  // ルーンの石：お城から離れたところに、人数＋2こ
  const runes = pickSpread(m, n + 2, castles, r).filter(i => !castles.includes(i));
  for (const i of runes) terrain[i] = T.RUNE;
  return { v: 1, seed, R, round: 1, rounds, planMs, phase: 'plan', players: ps, terrain, owner, last: null, pending: [] };
}

export const mapOf = st => makeMap(st.seed, st.R);
export const isCastle = (st, i) => st.players.some(p => p.castle === i);
export function landOf(st, pi) { let n = 0; for (const o of st.owner) if (o === pi) n++; return n; }
export function runesOf(st, pi) { let n = 0; st.owner.forEach((o, i) => { if (o === pi && st.terrain[i] === T.RUNE) n++; }); return n; }
export function baseTroops(st, pi) { return 3 + Math.floor(landOf(st, pi) / 4) + runesOf(st, pi); }
export function cardTroops(st, pi, card) { return card === 'hero' ? 4 : card === 'dice' ? diceRoll(st.seed, st.round, pi) : 0; }
export function score(st, pi) {
  let s = st.players[pi].bonus;
  st.owner.forEach((o, i) => { if (o !== pi) return; s += 1; if (st.terrain[i] === T.RUNE) s += RUNE_PT; if (isCastle(st, i)) s += CASTLE_PT; });
  return s;
}
export function defenseOf(st, i) { return isCastle(st, i) ? CASTLE_DEF : DEF[st.terrain[i]]; }

// そのマスに兵を置けるか
export function canPlace(st, pi, i, portal) {
  if (i < 0 || i >= st.owner.length || st.terrain[i] === T.LAKE) return false;
  if (portal) return true;
  if (st.owner[i] === pi) return true;
  const m = mapOf(st);
  if (landOf(st, pi) === 0) return st.owner[i] === -1; // ふっかつ：だれのものでもない好きなマス
  return m.nb[i].some(j => st.owner[j] === pi);
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
  }
  const portal = card === 'portal';
  let left = baseTroops(st, pi) + cardTroops(st, pi, card);
  const place = new Map();
  for (const [i, n0] of plan.place || []) {
    const n = Math.min(Math.floor(n0) || 0, left);
    if (n <= 0 || !canPlace(st, pi, i, portal)) continue;
    place.set(i, (place.get(i) || 0) + n); left -= n;
  }
  return { card, cardIdx: card ? plan.card.i : -1, target, place };
}

// 1ラウンドの結果を出す。plans: { [playerIndex]: plan }
export function resolve(st0, plans) {
  const st = JSON.parse(JSON.stringify(st0));
  const n = st.players.length, log = [];
  const clean = []; for (let pi = 0; pi < n; pi++) clean[pi] = cleanPlan(st0, pi, plans[pi]);
  const shields = new Set(), stormers = [];
  // カードを手札から出す
  clean.forEach((c, pi) => {
    if (!c || !c.card) return;
    st.players[pi].hand.splice(c.cardIdx, 1);
    const nm = st.players[pi].name, def = CARDS[c.card];
    if (c.card === 'shield') shields.add(c.target);
    if (c.card === 'storm') stormers.push(pi);
    if (c.card === 'treasure') st.players[pi].bonus += BONUS_PT;
    log.push({ pi, card: c.card, text: `${nm}：${def.icon}${def.name}` + (c.card === 'dice' ? `（${diceRoll(st.seed, st.round, pi)}）` : '') });
  });
  // 炎の竜（結界とお城には効かない）
  const burned = [];
  clean.forEach((c, pi) => {
    if (!c || c.card !== 'dragon') return;
    const i = c.target;
    if (shields.has(i) || isCastle(st, i) || st.owner[i] === -1) return;
    st.owner[i] = -1; burned.push(i);
  });
  // マスごとに強さをくらべる
  const force = new Map(); // tile -> Map(pi -> n)
  clean.forEach((c, pi) => {
    if (!c) return;
    const minus = stormers.filter(s => s !== pi).length;
    for (const [i, k] of c.place) {
      const v = k - minus; if (v <= 0) continue;
      if (!force.has(i)) force.set(i, new Map());
      force.get(i).set(pi, v);
    }
  });
  const changed = [];
  for (const [i, f] of force) {
    if (shields.has(i)) continue;
    const o = st.owner[i];
    const hold = o >= 0 ? (f.get(o) || 0) + 1 + defenseOf(st, i) : defenseOf(st, i);
    let best = -1, bv = 0, tie = false;
    for (const [pi, v] of f) { if (pi === o) continue; if (v > bv) { bv = v; best = pi; tie = false; } else if (v === bv) tie = true; }
    if (best >= 0 && !tie && bv > hold) { changed.push({ i, from: o, to: best }); st.owner[i] = best; }
  }
  // カードを配る
  st.players.forEach((p, pi) => {
    const r = rng(mix(st.seed, st.round, pi, 5));
    p.hand.push(drawCard(r)); while (p.hand.length > HAND_MAX) p.hand.shift();
  });
  const forceOut = [...force].map(([i, f]) => [i, [...f]]);
  st.last = { round: st.round, changed, burned, shields: [...shields], log, force: forceOut };
  st.round++;
  if (st.round > st.rounds) st.phase = 'end';
  return st;
}

// 途中から入った人：空いているところにお城をもらう
export function addLatePlayer(st, p) {
  const m = mapOf(st), pi = st.players.length;
  let best = -1, bd = -1;
  const owned = []; st.owner.forEach((o, i) => { if (o >= 0) owned.push(i); });
  for (let i = 0; i < m.N; i++) {
    if (st.owner[i] !== -1 || st.terrain[i] === T.LAKE || st.terrain[i] === T.RUNE) continue;
    const d = owned.length ? Math.min(...owned.map(j => dist(m.tiles[i], m.tiles[j]))) : 0;
    if (d > bd) { bd = d; best = i; }
  }
  if (best < 0) return false;
  st.owner[best] = pi; st.terrain[best] = T.PLAIN;
  const cr = rng(mix(st.seed, 3, pi, st.round));
  st.players.push({ id: p.id, name: p.name, color: COLORS[pi % COLORS.length], castle: best, hand: Array.from({ length: START_CARDS }, () => drawCard(cr)), bonus: 0 });
  return true;
}

export function ranking(st) {
  return st.players.map((p, pi) => ({ pi, name: p.name, color: p.color, score: score(st, pi), land: landOf(st, pi) }))
    .sort((a, b) => b.score - a.score || b.land - a.land);
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
