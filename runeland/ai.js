// ルーンランド：コンピューターの作戦（やさしい・ふつう・つよい）
// 親のスマホが、コンピューターの分の作戦を立てて出す。バランス試験（tests/balance.mjs）でも使う。
import * as G from './game.js';

export const LEVELS = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
// コンピューターのアイコン（名前に近い動物）
export const BOT_AV = { いのしし: 'pig', ふくろう: 'owl', きつね: 'fox', こぐま: 'bear', うさぎ: 'rabbit', たぬき: 'panda', ひつじ: 'mouse', かめ: 'frog', からす: 'chick', しか: 'dog', ねこ: 'cat', いぬ: 'dog', りす: 'mouse', かえる: 'frog', はりねずみ: 'mouse', ペンギン: 'penguin' };
export const BOT_NAMES = ['いのしし', 'ふくろう', 'きつね', 'こぐま', 'うさぎ', 'たぬき', 'ひつじ', 'かめ', 'からす', 'しか', 'ねこ', 'いぬ', 'りす', 'かえる', 'はりねずみ', 'ペンギン'];

// 盤面のようすをまとめて調べる（何度も数えないように）
function survey(st) {
  const m = G.mapOf(st), n = st.players.length;
  const land = new Array(n).fill(0), front = new Array(n).fill(0);
  st.owner.forEach((o, i) => { if (o >= 0) { land[o]++; if (m.nb[i].some(j => st.owner[j] !== o && st.terrain[j] !== G.T.LAKE)) front[o]++; } });
  const troops = st.players.map((_, pi) => G.baseTroops(st, pi));
  const scores = st.players.map((_, pi) => G.score(st, pi));
  const leader = scores.indexOf(Math.max(...scores));
  return { m, land, front, troops, scores, leader };
}

function tileValue(st, i, me, sv, level) {
  let v = 1;
  const o = st.owner[i];
  if (st.terrain[i] === G.T.RUNE) v += G.RUNE_PT + 2.5; // 点＋毎ラウンドの兵
  if (G.isCastle(st, i)) v += G.CASTLE_PT + (o >= 0 && o !== me && G.besieged(st, i) ? 8 : 0); // 包囲したお城は大チャンス
  if (st.terrain[i] === G.T.VILLAGE) v += 1.5; if (st.terrain[i] === G.T.SHRINE) v += 1; if (st.terrain[i] === G.T.MINE) v += 2; if (st.terrain[i] === G.T.TOWER) v += 1;
  if (o >= 0 && o !== me && level !== 'easy') { const c = st.players[o].castle; if (sv.m.nb[c].includes(i)) v += 1.2; } // お城のまわりをくずす
  if (st.chests && st.chests.includes(i)) v += level === 'easy' ? 1 : 2.2; // 宝箱
  if (o >= 0) v += 0.6;                                  // 相手が1マス減る分
  if (level === 'hard' && o >= 0 && o === sv.leader && o !== me) v += 1.2;
  if (level !== 'easy') { // つながりやすいマスは少し高く（あとで広げやすい）
    const mine = sv.m.nb[i].filter(j => st.owner[j] === me).length; v += mine * 0.15;
  }
  return v;
}
// そのマスを取るのに要りそうな兵
function need(st, i, me, sv, level) {
  const o = st.owner[i], def = G.defenseOf(st, i);
  if (o < 0) {
    let h = def;
    if (level === 'hard') { const rivals = new Set(sv.m.nb[i].map(j => st.owner[j]).filter(x => x >= 0 && x !== me)); h += rivals.size * (st.terrain[i] === G.T.RUNE ? 1.5 : 0.6); }
    return Math.floor(h) + 1;
  }
  // 持ち主が守りに来るかもしれない分
  const guard = level === 'hard' ? Math.min(3, sv.troops[o] / Math.max(1, sv.front[o]) * (st.terrain[i] === G.T.RUNE || G.isCastle(st, i) ? 2.2 : 0.8)) : 0.6;
  return Math.floor(1 + def + guard) + 1;
}

export function aiPlan(st, pi, level = 'normal', r = Math.random) {
  const p = st.players[pi]; if (!p) return null;
  const sv = survey(st), m = sv.m;
  if (p.out) return { place: [], card: null }; // 落城した人は見学
  const hasLand = sv.land[pi] > 0;
  const placeable = (i, portal) => {
    if (st.terrain[i] === G.T.LAKE) return false;
    if (G.isCastle(st, i) && st.owner[i] >= 0 && st.owner[i] !== pi && !G.besieged(st, i)) return false;
    if (portal) return true;
    if (st.owner[i] === pi) return true;
    if (!hasLand) return st.owner[i] === -1;
    if (m.nb[i].some(j => st.owner[j] === pi)) return true;
    return !!knightsOn && m.nb[i].some(j => m.nb[j].some(k => st.owner[k] === pi));
  };
  let knightsOn = false;
  // カードを選ぶ
  let card = null;
  const hand = p.hand.map((k, i) => ({ k, i }));
  const find = k => hand.find(h => h.k === k);
  const myTiles = []; st.owner.forEach((o, i) => { if (o === pi) myTiles.push(i); });
  const threat = i => { let t = 0; for (const j of m.nb[i]) { const o = st.owner[j]; if (o >= 0 && o !== pi) t = Math.max(t, sv.troops[o]); } return t; };
  const skip = (level === 'normal' && r() < 0.2) || (level === 'easy' && r() < 0.5);
  if (!skip && hand.length) {
    if (find('treasure')) card = { ...find('treasure'), target: null };
    if (!card && find('dragon')) {
      let best = -1, bv = 2.5;
      st.owner.forEach((o, i) => { if (o < 0 || o === pi || G.isCastle(st, i)) return; const v = tileValue(st, i, pi, sv, level) + (o === sv.leader ? 1 : 0); if (v > bv) { bv = v; best = i; } });
      if (best >= 0) card = { ...find('dragon'), target: best };
    }
    if (!card && find('portal')) {
      const far = st.owner.findIndex((o, i) => o === -1 && st.terrain[i] === G.T.RUNE && !placeable(i, false) && need(st, i, pi, sv, level) <= sv.troops[pi]);
      if ((far >= 0 && level === 'hard' && r() < 0.3) || !hasLand) card = { ...find('portal'), target: null, far: true };
    }
    if (!card && find('shield')) {
      let best = -1, bt = 2;
      for (const i of myTiles) { const val = (st.terrain[i] === G.T.RUNE ? 4 : 0) + (G.isCastle(st, i) ? 3 : 0); const t = threat(i) * (val ? 1 : 0); if (t > bt) { bt = t; best = i; } }
      if (best >= 0) card = { ...find('shield'), target: best };
    }
    // 新しいカード
    const myRank = G.ranking(st).findIndex(x => x.pi === pi), n = st.players.length;
    const leaderTile = (filter = () => true) => { let best = -1, bv = -1; st.owner.forEach((o, i) => { if (o !== sv.leader || o === pi || !filter(i)) return; const v = tileValue(st, i, pi, sv, level) + (m.nb[i].some(j => st.owner[j] === pi) ? 2 : 0); if (v > bv) { bv = v; best = i; } }); return best; };
    if (!card && find('legend')) card = { ...find('legend'), target: null };
    if (!card && find('wrath') && sv.leader !== pi) card = { ...find('wrath'), target: null };
    if (!card && find('quake') && myRank >= 1 && n > 1) card = { ...find('quake'), target: null };
    if (!card && find('swap') && sv.leader !== pi) { const t = leaderTile(i => !G.isCastle(st, i)); if (t >= 0) card = { ...find('swap'), target: t }; }
    if (!card && find('thief') && sv.leader !== pi) { const t = leaderTile(); if (t >= 0) card = { ...find('thief'), target: t }; }
    if (!card && find('thunder')) { let best = -1, bv = 0; st.owner.forEach((o, i) => { if (o === pi || st.terrain[i] === G.T.LAKE || !placeable(i, false)) return; const v = tileValue(st, i, pi, sv, level) * (G.defenseOf(st, i) + (o >= 0 ? 1 : 0)); if (v > bv) { bv = v; best = i; } }); if (best >= 0) card = { ...find('thunder'), target: best }; }
    if (!card && find('catapult')) { let best = -1, bv = 0; st.owner.forEach((o, i) => { if (o === pi || st.terrain[i] === G.T.LAKE) return; const v = tileValue(st, i, pi, sv, level) / Math.max(1, need(st, i, pi, sv, level) - 3); if (v > bv) { bv = v; best = i; } }); if (best >= 0) card = { ...find('catapult'), target: best }; }
    if (!card && find('knights')) card = { ...find('knights'), target: null };
    if (!card && find('seal') && sv.leader !== pi) { const t = leaderTile(); if (t >= 0) card = { ...find('seal'), target: t }; }
    if (!card && find('hero')) card = { ...find('hero'), target: null };
    if (!card && find('dice')) card = { ...find('dice'), target: null };
    if (!card && find('portal')) card = { ...find('portal'), target: null }; // 兵 +2 として使う
    if (!card && find('storm') && st.players.length >= 3) card = { ...find('storm'), target: null };
  }
  const portal = card && card.k === 'portal' && (!hasLand || card.far);
  knightsOn = !!(card && card.k === 'knights');
  let left = sv.troops[pi] + G.cardTroops(st, pi, card && card.k);
  const place = new Map();
  const put = (i, n) => { n = Math.min(n, left); if (n <= 0) return; place.set(i, (place.get(i) || 0) + n); left -= n; };
  // 守り：ねらわれそうな大事なマス（ルーンの石・お城）
  const shielded = card && card.k === 'shield' ? card.target : -1;
  const ring = m.nb[p.castle].filter(j => st.owner[j] === pi), thin = ring.length <= 2 && level !== 'easy'; // お城のまわりが少ない：包囲されそう
  const keep = myTiles.filter(i => i !== shielded && (st.terrain[i] === G.T.RUNE || G.isCastle(st, i) || (thin && ring.includes(i))) && threat(i) > 0)
    .sort((a, b) => (ring.includes(b) && thin) - (ring.includes(a) && thin) || threat(b) - threat(a));
  if (thin) { for (const j of m.nb[p.castle]) if (st.owner[j] !== pi && placeable(j, portal) && left > 0) put(j, Math.min(left, need(st, j, pi, sv, level))); } // まわりを取りかえす
  const defShare = level === 'hard' ? 0.35 : level === 'easy' ? 0 : 0.2;
  let defBudget = Math.floor(left * (thin ? Math.max(defShare, 0.4) : defShare));
  for (const i of keep) { if (defBudget <= 0) break; const n = Math.min(defBudget, level === 'hard' ? Math.ceil(threat(i) / 2) : 1); put(i, n); defBudget -= n; }
  // 攻め：値打ち÷要る兵 が大きいところから
  const cand = [];
  for (let i = 0; i < st.owner.length; i++) {
    if (st.owner[i] === pi || !placeable(i, portal)) continue;
    if (card && card.k === 'dragon' && card.target === i) { cand.push({ i, v: tileValue(st, i, pi, sv, level), n: G.defenseOf(st, i) + 1 }); continue; }
    if (card && card.k === 'thunder' && card.target === i) { cand.push({ i, v: tileValue(st, i, pi, sv, level) + 1, n: Math.max(1, need(st, i, pi, sv, level) - G.defenseOf(st, i) - (st.owner[i] >= 0 ? 1 : 0)) }); continue; }
    if (card && card.k === 'catapult' && card.target === i) { cand.push({ i, v: tileValue(st, i, pi, sv, level) + 1, n: Math.max(1, need(st, i, pi, sv, level) - 3) }); continue; }
    const n = need(st, i, pi, sv, level);
    cand.push({ i, v: tileValue(st, i, pi, sv, level), n });
  }
  for (const c of cand) c.s = c.v / c.n + (level === 'easy' ? r() * 2 : level === 'normal' ? r() * 0.4 : r() * 0.05);
  cand.sort((a, b) => b.s - a.s);
  for (const c of cand) { if (left <= 0) break; if (c.n <= left) put(c.i, c.n); }
  // 余った兵：いちばん近い取れそうなマスか、守りに足す
  if (left > 0 && cand.length) put(cand[0].i, left);
  if (left > 0 && myTiles.length) put(myTiles[Math.floor(r() * myTiles.length)], left);
  return { place: [...place], card: card ? { i: card.i, k: card.k, target: card.target } : null };
}
