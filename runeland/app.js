// ルーンランド：画面
import * as G from './game.js';
import { Room, MAX_PLAYERS } from './net.js';
import { LEVELS } from './ai.js';
import { sfx, bgm, opt, setOpt, unlock } from './audio.js';
import { RELAY_URL, RELAY_KEY } from './relay-config.js';

const $ = s => document.querySelector(s);
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const store = { get(k, d) { try { return localStorage.getItem('runeland:' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('runeland:' + k, v); } catch {} } };
let myId = store.get('id'); if (!myId) { myId = Math.random().toString(36).slice(2, 10); store.set('id', myId); }
let room = null;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- つなぐ ----------
let sbP = null;
function supa() {
  sbP ||= new Promise((res, rej) => {
    const done = () => res(window.supabase.createClient(RELAY_URL, RELAY_KEY, { auth: { persistSession: false } }));
    if (window.supabase) return done();
    const s = document.createElement('script'); s.src = LIB; s.onload = done;
    s.onerror = () => { sbP = null; rej(new Error('ネットにつながっていないようです')); };
    document.head.append(s);
  });
  return sbP;
}
function nick() { const n = $('#nick').value.trim().slice(0, 12); if (!n) { $('#homeMsg').textContent = 'ニックネームを入れてください'; $('#nick').focus(); return null; } store.set('name', n); return n; }
const randCode = () => String(1000 + Math.floor(Math.random() * 9000));
async function enter(code, creating) {
  const name = nick(); if (!name) return;
  unlock(); bgm.start();
  $('#homeMsg').textContent = 'つないでいます…';
  try {
    const sb = await supa();
    for (let tries = 0; tries < 4 && !room; tries++) {
      const r = new Room({ code, id: myId, name, sb, onChange: render, onStatus: t => { $('#homeMsg').textContent = t; } });
      await r.connect();
      if (creating) { // 作る時：もう人がいる番号なら、べつの番号にする
        await new Promise(res => setTimeout(res, 1200));
        if (r.members.some(m => m.id !== myId)) { r.leave(); code = randCode(); continue; }
      }
      room = r;
    }
    if (!room) throw new Error('部屋を作れませんでした。もう一度ためしてください');
    history.replaceState(null, '', '?r=' + code);
    $('#homeMsg').textContent = '';
    wake(); render();
  } catch (e) { $('#homeMsg').textContent = e.message || 'つなげませんでした'; }
}
function leave() { if (room) room.leave(); room = null; plan = null; history.replaceState(null, '', location.pathname); show('home'); bgm.setMood('calm'); }
const shareUrl = () => location.origin + location.pathname + '?r=' + room.code;
async function share() {
  const url = shareUrl(), text = `ルーンランドで遊ぼう！ 部屋の番号は ${room.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'ルーンランド', text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('招待リンクをコピーしました'); } catch { prompt('このリンクを送ってください', url); }
}
async function wake() { try { await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && room) wake(); });

// ---------- 作戦（自分のスマホの中だけ） ----------
let plan = null; // { key, place: Map, order: [], card: {i,k,target}|null, sent, dirty, targeting }
function planFor(st) {
  const key = st.gid + ':' + st.round;
  if (!plan || plan.key !== key) plan = { key, place: new Map(), order: [], card: null, sent: false, dirty: false, targeting: false };
  return plan;
}
const used = () => plan ? plan.order.length : 0;
const totalTroops = (st, pi) => G.baseTroops(st, pi) + G.cardTroops(st, pi, plan.card && plan.card.k);
function rebuild() { plan.place = new Map(); for (const i of plan.order) plan.place.set(i, (plan.place.get(i) || 0) + 1); }
function fixPlan(st, pi) { // カードを変えた時、置けなくなった兵・多すぎる兵を戻す
  const portal = plan.card && plan.card.k === 'portal';
  plan.order = plan.order.filter(i => G.canPlace(st, pi, i, portal));
  while (plan.order.length > totalTroops(st, pi)) plan.order.pop();
  rebuild();
}
const canAct = () => { const st = room?.state; return !!(st && st.phase === 'plan' && st.step === 'plan' && room.meIndex() >= 0); };
let lastInput = Date.now();
function touched() { plan.dirty = true; lastInput = Date.now(); $('#board').classList.remove('nudge'); }
function tapTile(i) {
  if (!canAct()) return;
  const st = room.state, pi = room.meIndex();
  if (plan.targeting) {
    const def = G.CARDS[plan.card.k];
    if (def.target === 'own' && st.owner[i] !== pi) { toast('自分のマスを選んでください'); return; }
    if (st.terrain[i] === G.T.LAKE) return;
    plan.card.target = i; plan.targeting = false; sfx.card(); touched(); render(); return;
  }
  const portal = plan.card && plan.card.k === 'portal';
  if (!G.canPlace(st, pi, i, portal)) { toast(G.landOf(st, pi) === 0 ? 'だれのものでもないマスに置けます' : '光っているマス（自分のマスか、そのとなり）に置けます'); return; }
  if (used() >= totalTroops(st, pi)) { toast('兵を使いきりました。長押しか「戻す」で戻せます'); return; }
  plan.order.push(i); rebuild(); sfx.place(plan.place.get(i)); touched(); coachDone('place'); render();
}
function removeAt(i) {
  if (!canAct() || !plan.place.has(i)) return;
  const k = plan.order.lastIndexOf(i); plan.order.splice(k, 1); rebuild(); sfx.undo(); touched(); render();
}
function undo() {
  if (!canAct()) return;
  if (plan.targeting) { plan.targeting = false; plan.card = null; render(); return; }
  if (!plan.order.length) { if (plan.card) { plan.card = null; touched(); render(); } return; }
  plan.order.pop(); rebuild(); sfx.undo(); touched(); render();
}
function tapCard(hi) {
  if (!canAct()) return;
  const st = room.state, pi = room.meIndex(), k = st.players[pi].hand[hi];
  if (plan.card && plan.card.i === hi) { plan.card = null; plan.targeting = false; sfx.undo(); }
  else { plan.card = { i: hi, k, target: null }; plan.targeting = !!G.CARDS[k].target; sfx.card(); }
  fixPlan(st, pi); touched(); coachDone('card'); render();
}
function go() {
  if (!canAct()) return;
  if (plan.targeting) { toast('カードを使うマスを選んでください'); return; }
  room.submit({ place: [...plan.place], card: plan.card });
  plan.sent = true; plan.dirty = false; sfx.lock(); coachDone('go'); render();
}

// ---------- 盤面 ----------
const S = 10, SQ = Math.sqrt(3), NS = 'http://www.w3.org/2000/svg';
const BASE = ['#d3e2a2', '#a5c98a', '#d4c3a1', '#a9d3dc', '#d9cdf2'];
function mix(c1, c2, t) { const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16); const ch = sh => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; }
const center = h => [S * SQ * (h.q + h.r / 2), S * 1.5 * h.r];
// 角を少しだけゆらす（手がきっぽく）。となりのマスと同じ角は同じだけゆらすので、すき間ができない
function jit(x, y) { const k = Math.round(x * 10) * 7919 + Math.round(y * 10) * 104729; const r = G.rng(k >>> 0); return [x + (r() - 0.5) * 1.3, y + (r() - 0.5) * 1.3]; }
const corners = (x, y, s, j = true) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); const p = [x + s * Math.cos(a), y + s * Math.sin(a)]; return j ? jit(...p) : p; });
const pts = cs => cs.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; }
function icon(t, castle, x, y) {
  if (castle) return `<path d="M${x - 5} ${y + 4.5}v-6.5h2.2v2h1.6v-2h2.4v2h1.6v-2h2.2v6.5z" fill="#fffaf0" stroke="#5b4636" stroke-width=".9" stroke-linejoin="round"/><path d="M${x} ${y - 2}v-5l3 1.2l-3 1.2" fill="#e3a93b" stroke="#5b4636" stroke-width=".6"/>`;
  if (t === G.T.FOREST) return `<path d="M${x - 4.5} ${y + 3}l2.6-6.5l2.6 6.5zM${x - .3} ${y + 3.8}l2.6-6.5l2.6 6.5z" fill="#4f8a4a" stroke="#3d5f37" stroke-width=".6" stroke-linejoin="round"/>`;
  if (t === G.T.MOUNTAIN) return `<path d="M${x - 5.5} ${y + 3.8}l5.5-8.6l5.5 8.6z" fill="#a28d6e" stroke="#5b4636" stroke-width=".7" stroke-linejoin="round"/><path d="M${x - 1.8} ${y - 1}l1.8-2.8l1.8 2.8l-1 .6l-.8-.6l-.8.6z" fill="#fff"/>`;
  if (t === G.T.RUNE) return `<path d="M${x} ${y - 5.5}l3.8 5.5l-3.8 5.5l-3.8-5.5z" fill="#f4eeff" stroke="#7a4fd6" stroke-width="1.1" stroke-linejoin="round"/><path d="M${x} ${y - 2.8}v5.6M${x - 1.6} ${y - 1.2}l3.2 2" stroke="#7a4fd6" stroke-width=".9" stroke-linecap="round"/>`;
  if (t === G.T.LAKE) return `<path d="M${x - 4} ${y - 1}q2-2 4 0t4 0M${x - 3} ${y + 2.5}q1.5-1.5 3 0t3 0" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".8"/>`;
  return '';
}
const B = { key: '', tiles: [], cx: [], vb: null, view: { k: 1, x: 0, y: 0 }, anim: false };
function buildBoard(st) {
  const m = G.mapOf(st), key = st.gid + ':' + st.R + ':' + st.players.map(p => p.castle).join(',');
  if (B.key === key) return;
  const fresh = !B.key.startsWith(st.gid + ':');
  B.key = key;
  const coast = $('#lCoast'), tiles = $('#lTiles'), icons = $('#lIcons');
  coast.innerHTML = ''; tiles.innerHTML = ''; icons.innerHTML = '';
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, ic = '', sh = '';
  B.tiles = []; B.cx = [];
  m.tiles.forEach((h, i) => {
    const [x, y] = center(h); B.cx[i] = [x, y];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    const t = st.terrain[i];
    if (t !== G.T.LAKE) sh += `<polygon points="${pts(corners(x, y, S, false))}"/>`;
    const p = el('polygon', { class: 't', 'data-i': i, points: pts(corners(x, y, S - 0.2)) }, tiles);
    if (t === G.T.LAKE) { p.setAttribute('fill', BASE[3]); p.setAttribute('stroke-opacity', '.25'); }
    B.tiles[i] = p;
    ic += icon(t, G.isCastle(st, i), x, y);
  });
  // 海岸：太いふちどりを重ねて、やわらかい島の形にする（重いフィルターは使わない）
  coast.innerHTML = `<g fill="#cfe9ee" stroke="#cfe9ee" stroke-width="16" stroke-linejoin="round">${sh}</g><g fill="#efd9a6" stroke="#efd9a6" stroke-width="6" stroke-linejoin="round">${sh}</g>`;
  icons.innerHTML = ic;
  const pad = S + 6;
  B.vb = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  $('#board').setAttribute('viewBox', `${B.vb.x} ${B.vb.y} ${B.vb.w} ${B.vb.h}`);
  if (fresh) { B.view = { k: 1, x: 0, y: 0 }; applyView(); }
}
function paintTiles(st, owners) {
  for (let i = 0; i < B.tiles.length; i++) {
    const t = st.terrain[i]; if (t === G.T.LAKE) continue;
    const o = owners[i];
    const fill = o >= 0 ? mix(st.players[o].color, BASE[t], 0.38) : BASE[t];
    if (B.tiles[i].__f !== fill) { B.tiles[i].setAttribute('fill', fill); B.tiles[i].__f = fill; }
  }
}
function drawOverlay() {
  const st = room.state, pi = room.meIndex(), over = $('#lOver');
  const acting = canAct(), portal = acting && plan.card && plan.card.k === 'portal';
  let out = '';
  if (acting && !plan.targeting) {
    for (let i = 0; i < B.tiles.length; i++) if (st.terrain[i] !== G.T.LAKE && st.owner[i] !== pi && G.canPlace(st, pi, i, portal)) out += `<polygon class="can" points="${B.tiles[i].getAttribute('points')}"/>`;
  }
  if (acting && plan.targeting) { // カードの相手を選ぶ時：選べるマスを光らせる
    const own = G.CARDS[plan.card.k].target === 'own';
    for (let i = 0; i < B.tiles.length; i++) if (st.terrain[i] !== G.T.LAKE && (own ? st.owner[i] === pi : st.owner[i] >= 0 && st.owner[i] !== pi)) out += `<polygon class="can" points="${B.tiles[i].getAttribute('points')}"/>`;
  }
  if (acting && plan.card && plan.card.target != null) out += `<polygon class="tgt" points="${B.tiles[plan.card.target].getAttribute('points')}"/><text x="${B.cx[plan.card.target][0]}" y="${B.cx[plan.card.target][1] - 9}" font-size="8">${G.CARDS[plan.card.k].icon}</text>`;
  if (acting) for (const [i, n] of plan.place) { const [x, y] = B.cx[i]; out += `<circle cx="${x}" cy="${y}" r="5.4" fill="${st.players[pi].color}" stroke="#fff" stroke-width="1.3"/><text class="cnt" x="${x}" y="${y + 0.3}" font-size="7.2">${n}</text>`; }
  if (!acting && st.last && st.step === 'reveal' && !B.anim) for (const [i, f] of st.last.force) { // 結果：いちばん多く置いた人
    const top = [...f].sort((a, b) => b[1] - a[1])[0]; const [x, y] = B.cx[i];
    out += `<circle cx="${x + 5}" cy="${y - 5}" r="3.4" fill="${st.players[top[0]].color}" stroke="#5b4636" stroke-width=".6"/><text class="fc" x="${x + 5}" y="${y - 4.8}" font-size="4.6">${top[1]}</text>`;
  }
  if (over.__h !== out) { over.innerHTML = out; over.__h = out; }
}
function drawBoard() {
  const st = room.state;
  buildBoard(st);
  if (!B.anim) paintTiles(st, st.owner);
  drawOverlay();
}

// ---------- 指で広げる・ずらす・タップ ----------
const wrap = $('#boardWrap'), svg = $('#board');
function applyView() { $('#view').setAttribute('transform', `translate(${B.view.x} ${B.view.y}) scale(${B.view.k})`); $('#btnFit').hidden = B.view.k <= 1.01; }
function svgPt(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function clampView() {
  const v = B.view, b = B.vb; if (!b) return;
  v.k = Math.min(4, Math.max(1, v.k));
  if (v.k <= 1.01) { v.k = 1; v.x = 0; v.y = 0; return; }
  // 島が画面から出ていかないように（地図の端が、画面のまん中より内側に来ない）
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const lo = (c, half) => c - (c + half) * v.k, hi = (c, half) => c - (c - half) * v.k;
  v.x = Math.min(hi(cx, b.w / 2), Math.max(lo(cx, b.w / 2), v.x));
  v.y = Math.min(hi(cy, b.h / 2), Math.max(lo(cy, b.h / 2), v.y));
}
function zoomAt(px, py, k, smooth) {
  const p = svgPt(px, py), v = B.view;
  const ux = (p.x - v.x) / v.k, uy = (p.y - v.y) / v.k; // 指の下の地図の場所
  const to = { k, x: p.x - ux * k, y: p.y - uy * k };
  if (!smooth) { Object.assign(v, to); clampView(); applyView(); return; }
  const from = { ...v }, t0 = performance.now();
  const step = t => { const a = Math.min(1, (t - t0) / 250), e = 1 - Math.pow(1 - a, 3); v.k = from.k + (to.k - from.k) * e; v.x = from.x + (to.x - from.x) * e; v.y = from.y + (to.y - from.y) * e; clampView(); applyView(); if (a < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const hexPx = () => { const r = svg.getBoundingClientRect(); const ppu = Math.min(r.width / B.vb.w, r.height / B.vb.h); return S * SQ * ppu * B.view.k; };
const ptr = new Map(); let gest = null, pinchEnd = 0, pressT = 0;
wrap.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  try { wrap.setPointerCapture(e.pointerId); } catch {}
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1) {
    gest = { sx: e.clientX, sy: e.clientY, moved: false, vx: B.view.x, vy: B.view.y, tile: tileAt(e.clientX, e.clientY) };
    clearTimeout(pressT);
    pressT = setTimeout(() => { if (gest && !gest.moved && gest.tile >= 0 && plan && plan.place.has(gest.tile)) { removeAt(gest.tile); gest.done = true; } }, 480); // 長押しで1つ戻す
  } else if (ptr.size === 2) {
    clearTimeout(pressT);
    const [a, b] = [...ptr.values()];
    gest = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: B.view.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view0: { ...B.view } };
  }
});
wrap.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return;
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gest) return;
  if (gest.pinch && ptr.size === 2) {
    const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    Object.assign(B.view, gest.view0); zoomAt(gest.mx, gest.my, gest.k0 * d / gest.d0);
    return;
  }
  if (gest.pinch) return;
  const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
  if (!gest.moved && Math.hypot(dx, dy) > 10) { gest.moved = true; clearTimeout(pressT); }
  if (gest.moved && B.view.k > 1.01) {
    const r = svg.getBoundingClientRect(), upp = Math.max(B.vb.w / r.width, B.vb.h / r.height);
    B.view.x = gest.vx + dx * upp; B.view.y = gest.vy + dy * upp; clampView(); applyView();
  }
});
const endPtr = e => {
  if (!ptr.has(e.pointerId)) return;
  ptr.delete(e.pointerId); clearTimeout(pressT);
  if (gest && gest.pinch) { if (ptr.size < 2) { gest = null; pinchEnd = Date.now(); } return; }
  if (!gest) return;
  const g = gest; gest = null;
  if (g.moved || g.done || Date.now() - pinchEnd < 150 || e.type === 'pointercancel') return;
  if (B.anim) { skipAnim(); return; } // 結果の動きをとばす
  const i = g.tile; if (i < 0) return;
  // 小さすぎて押しにくい時は、まず広げる
  if (canAct() && hexPx() < 26) { zoomAt(e.clientX, e.clientY, Math.min(4, B.view.k * 40 / hexPx()), true); toast('広げました。もう一度タップして置こう'); return; }
  tapTile(i);
};
wrap.addEventListener('pointerup', endPtr); wrap.addEventListener('pointercancel', endPtr);
wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, B.view.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
function tileAt(x, y) { const t = document.elementFromPoint(x, y); const p = t && t.closest && t.closest('polygon.t'); return p ? +p.dataset.i : -1; }
$('#btnFit').onclick = () => { B.view = { k: 1, x: 0, y: 0 }; applyView(); };

// ---------- 結果の見せ方（順番に） ----------
let revealDone = '', prevOwners = null, prevGidRound = '', prevRanks = null, animTimers = [];
function later(ms, f) { animTimers.push(setTimeout(f, ms)); }
function skipAnim() { animTimers.forEach(clearTimeout); animTimers = []; B.anim = false; if (room?.state?.last) celebrate(room.state); render(); }
function flashTile(i, cls) { const p = el('polygon', { class: cls, points: B.tiles[i].getAttribute('points') }, $('#lOver')); $('#lOver').__h = null; setTimeout(() => p.remove(), 1600); }
function banner(text, sub = '') { const b = $('#banner'); b.innerHTML = `<div>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`; }
let celebrated = '';
function playReveal(st) {
  const L = st.last, pi = room.meIndex();
  animTimers.forEach(clearTimeout); animTimers = [];
  const from = prevOwners && prevGidRound === st.gid + ':' + L.round ? prevOwners.slice() : null;
  if (!from) { celebrate(st); return; }
  B.anim = true; $('#toast').innerHTML = '';
  const disp = from; paintTiles(st, disp); drawOverlay();
  sfx.hush();
  let t = 350;
  // 1) カードを1枚ずつ
  for (const l of L.log) {
    later(t, () => {
      banner(`${G.CARDS[l.card].icon} ${G.CARDS[l.card].name}`, st.players[l.pi].name + (l.card === 'dice' ? `（${G.diceRoll(st.seed, L.round, l.pi)}）` : ''));
      ({ dragon: sfx.dragon, shield: sfx.shield, storm: sfx.storm, treasure: sfx.coin }[l.card] || sfx.card)();
      if (l.card === 'dragon') for (const i of L.burned) { disp[i] = -1; flashTile(i, 'burn'); }
      if (l.card === 'shield') for (const i of L.shields) flashTile(i, 'shine');
      paintTiles(st, disp);
    });
    t += 650;
  }
  // 2) 取られたマスを、真ん中から順に
  const ch = [...L.changed].sort((a, b) => Math.hypot(...B.cx[a.i]) - Math.hypot(...B.cx[b.i]));
  const stepMs = ch.length ? Math.min(70, 1800 / ch.length) : 0;
  let k = 0;
  ch.forEach((c, n) => later(t + n * stepMs, () => {
    disp[c.i] = c.to; paintTiles(st, disp);
    const p = B.tiles[c.i]; p.classList.remove('pop'); void p.getBBox(); p.classList.add('pop'); flashTile(c.i, 'flash');
    if (c.to === pi || c.from === pi || ch.length < 10 || n % 3 === 0) sfx.capture(k++);
  }));
  t += ch.length * stepMs + 300;
  later(t, () => { B.anim = false; paintTiles(st, st.owner); celebrate(st); render(); });
}
// 3) 点数と順位の変化
function celebrate(st) {
  const L = st.last, pi = room.meIndex(), key = st.gid + ':' + L.round;
  if (celebrated === key) return; celebrated = key;
  const won = {}, lost = {};
  for (const c of L.changed) { won[c.to] = (won[c.to] || 0) + 1; if (c.from >= 0) lost[c.from] = (lost[c.from] || 0) + 1; }
  for (const i of L.burned) { const o = prevOwners ? prevOwners[i] : -1; if (o >= 0) lost[o] = (lost[o] || 0) + 1; }
  const rk = G.ranking(st), newRanks = new Map(rk.map((x, i) => [x.pi, i]));
  if (pi >= 0) {
    if (won[pi]) toast(`🎉 ${won[pi]}マス取りました！`, 3500);
    if (lost[pi]) toast(`😱 ${lost[pi]}マス取られました…`, 3500);
    if (prevRanks && prevRanks.has(pi) && newRanks.get(pi) < prevRanks.get(pi)) sfx.rankUp(); else if (lost[pi] && !won[pi]) sfx.lose();
  }
  const oldTop = prevRanks ? [...prevRanks].find(([, r]) => r === 0)?.[0] : undefined;
  const leaderChanged = oldTop !== undefined && rk[0] && oldTop !== rk[0].pi;
  const best = Object.entries(won).sort((a, b) => b[1] - a[1])[0];
  if (st.round === st.rounds) later(200, () => { banner('最終ラウンド！', 'ここで決まる！'); bgm.setMood('tense'); });
  else if (leaderChanged) later(200, () => banner(`👑 ${rk[0].name} が1位に！`));
  else if (best && best[1] >= 4) later(200, () => banner(`いっきに${best[1]}マス！`, st.players[best[0]].name));
  if (st.round >= st.rounds - 2) bgm.setMood('tense');
  chipDelta = prevRanks ? new Map(rk.map((x, i) => [x.pi, (prevRanks.get(x.pi) ?? i) - i])) : null;
  prevRanks = newRanks;
  renderChips(true);
}

// ---------- はじめての案内（1回だけ） ----------
const COACH = [
  { id: 'place', when: () => canAct() && !plan.order.length, el: '#boardWrap', text: '光っているマスをタップして、兵を置こう', sub: 'タップするたびに1つ。長押しで戻せます。2本指で広げられます' },
  { id: 'go', when: () => canAct() && plan.order.length >= totalTroops(room.state, room.meIndex()) && !plan.sent, el: '#btnGo', text: '置けたら「決定」！', sub: 'みんなが決定すると、結果が出ます' },
  { id: 'card', when: () => canAct() && room.state.round >= 2 && room.state.players[room.meIndex()].hand.length && !plan.card, el: '#hand', text: '魔法カードをタップすると使えます', sub: '1ラウンドに1枚。順位が下ほど強いカードが来ます' },
];
let coachSeen = new Set((store.get('coach', '') || '').split(',').filter(Boolean));
function coachDone(id) { if (!coachSeen.has(id)) { coachSeen.add(id); store.set('coach', [...coachSeen].join(',')); } updateCoach(); }
function updateCoach() {
  const c = room && room.state && room.state.phase === 'plan' && !B.anim ? COACH.find(c => !coachSeen.has(c.id) && c.when()) : null;
  const box = $('#coach');
  if (!c) { box.hidden = true; return; }
  const r = $(c.el).getBoundingClientRect();
  box.hidden = false;
  Object.assign(box.querySelector('.ring2').style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
  const b = box.querySelector('.bubble'); b.innerHTML = `${c.text}<small>${c.sub}</small>`;
  b.style.top = c.el === '#boardWrap' ? r.top + 12 + 'px' : Math.max(8, r.top - 96) + 'px';
}

// ---------- 画面 ----------
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }
function toast(t, ms = 2600) { const d = document.createElement('div'); d.textContent = t; $('#toast').append(d); while ($('#toast').children.length > 3) $('#toast').firstChild.remove(); setTimeout(() => d.remove(), ms); }
let seenEnd = '', chipDelta = null, lastRoundSeen = '', handSeen = '';
function render() {
  if (!room) { show('home'); return; }
  const st = room.state;
  if (!st) return renderLobby();
  if (st.phase === 'end') return renderEnd();
  show('game');
  const pi = room.meIndex();
  if (pi >= 0) planFor(st);
  drawBoard();
  // 作戦の始まり：いまの盤面をおぼえておく（結果の動きに使う）
  if (st.step === 'plan' && lastRoundSeen !== st.gid + ':' + st.round) {
    lastRoundSeen = st.gid + ':' + st.round;
    prevOwners = st.owner.slice(); prevGidRound = st.gid + ':' + st.round;
    if (!prevRanks || st.round === 1) prevRanks = new Map(G.ranking(st).map((x, i) => [x.pi, i]));
    banner(`ラウンド ${st.round}`, st.round === st.rounds ? '最終ラウンド！' : `のこり ${st.rounds - st.round + 1}`);
    if (st.round === 1) { bgm.setMood('calm'); chipDelta = null; }
  }
  if (st.step === 'reveal' && st.last && revealDone !== st.gid + ':' + st.last.round) { revealDone = st.gid + ':' + st.last.round; playReveal(st); }
  renderTop(); renderChips(); renderPanel(); updateCoach();
}
function renderTop() {
  const st = room.state, pi = room.meIndex();
  $('#gRound').textContent = `${Math.min(st.round, st.rounds)}/${st.rounds}`;
  const rem = room.remain(), sec = Math.ceil(rem / 1000), inPlan = st.step === 'plan';
  $('#gTime').textContent = inPlan ? sec : '結果';
  $('#gTime').style.fontSize = inPlan ? '' : '.8rem';
  const frac = inPlan ? Math.min(1, rem / st.planMs) : 0;
  $('#ringProg').style.strokeDashoffset = String(119.4 * (1 - frac));
  $('#ring').classList.toggle('warn', inPlan && sec <= 10 && sec > 5); $('#ring').classList.toggle('hurry', inPlan && sec <= 5);
  $('#gScore').textContent = pi >= 0 ? G.score(st, pi) : '-';
  const active = st.players.filter(p => room.online(p.id));
  $('#gReady').textContent = inPlan ? `${active.filter(p => room.got.includes(p.id)).length}/${active.length}` : '-';
}
function renderChips(animate) {
  const st = room.state, rk = G.ranking(st), box = $('#players');
  const before = new Map([...box.children].map(c => [c.dataset.id, c.getBoundingClientRect().left]));
  const html = rk.map((r, pos) => {
    const p = st.players[r.pi], off = !room.online(p.id), stt = st.step === 'plan' ? (room.got.includes(p.id) ? '<span class="st done">✓</span>' : '<span class="st think"></span>') : '';
    const d = chipDelta && chipDelta.get(r.pi), arrow = d > 0 ? `<span class="up">▲${d}</span>` : d < 0 ? `<span class="down">▼</span>` : '';
    return `<span class="chip ${p.id === myId ? 'me' : ''} ${off ? 'off' : ''} ${pos === 0 && r.score > 0 ? 'crown' : ''}" data-id="${p.id}"><i class="dot" style="background:${p.color}"></i>${esc(p.name)} <span class="sc">${r.score}</span>${arrow}${stt}</span>`;
  }).join('');
  if (box.__h === html) return; box.__h = html; box.innerHTML = html;
  if (animate) for (const c of box.children) { // 順位が入れかわった動き（FLIP）
    const b = before.get(c.dataset.id); if (b == null) continue;
    const dx = b - c.getBoundingClientRect().left; if (!dx) continue;
    c.style.transition = 'none'; c.style.transform = `translateX(${dx}px)`; void c.offsetWidth; c.style.transition = ''; c.style.transform = '';
  }
}
function renderPanel() {
  const st = room.state, pi = room.meIndex();
  const hint = $('#hint'), hand = $('#hand'), btn = $('#btnGo');
  btn.classList.remove('done', 'ready');
  if (pi < 0) {
    hint.textContent = st.players.length >= MAX_PLAYERS + 4 ? '満員なので見学しています' : '次のラウンドから参加します。お城がもらえます！';
    hand.innerHTML = ''; hand.__k = ''; btn.disabled = true; btn.textContent = '待っています'; $('#btnUndo').disabled = true; return;
  }
  const p = st.players[pi], acting = canAct();
  const hk = p.hand.join(',') + ':' + (plan.card ? plan.card.i : '') + ':' + acting;
  if (hand.__k !== hk) {
    const fresh = handSeen !== st.gid + ':' + st.round + ':' + p.hand.length;
    hand.innerHTML = p.hand.length ? p.hand.map((k, i) => { const c = G.CARDS[k]; return `<button data-h="${i}" class="${plan.card && plan.card.i === i ? 'sel' : ''} ${fresh && i === p.hand.length - 1 && st.round > 1 && acting ? 'new' : ''}" ${acting ? '' : 'disabled'}><span class="ic">${c.icon}</span>${c.name}</button>`; }).join('') : '<div class="empty">カードはありません</div>';
    hand.__k = hk; handSeen = st.gid + ':' + st.round + ':' + p.hand.length;
  }
  $('#btnUndo').disabled = !acting || (!plan.order.length && !plan.card);
  if (!acting) {
    btn.disabled = true; btn.textContent = '結果発表中…';
    const top = G.ranking(st)[0];
    hint.textContent = B.anim ? 'タップで結果をとばせます' : `光ったマスが変わったところ。いま1位：${top.name}（${top.score}点）`;
    return;
  }
  btn.disabled = false;
  const left = totalTroops(st, pi) - used();
  if (plan.sent && !plan.dirty) { btn.classList.add('done'); btn.textContent = '決定ずみ ✓'; }
  else if (plan.sent) btn.textContent = '決定しなおす';
  else if (left > 0) btn.textContent = `決定（兵あと${left}）`;
  else { btn.textContent = '決定！'; btn.classList.add('ready'); }
  const c = plan.card && G.CARDS[plan.card.k];
  if (plan.targeting) hint.textContent = `${c.icon} ${c.name}：${c.target === 'own' ? '守りたい自分のマス' : '燃やしたい相手のマス'}をタップ`;
  else if (c) hint.textContent = `${c.icon} ${c.text}` + (plan.card.k === 'dice' ? `（出た目：${G.diceRoll(st.seed, st.round, pi)}）` : '') + `　兵 のこり${left}`;
  else if (G.landOf(st, pi) === 0) hint.textContent = `ふっかつ！ だれのものでもない好きなマスに兵を置けます（のこり ${left}）`;
  else if (left > 0) hint.textContent = `兵 ${totalTroops(st, pi)}人。光っているマスをタップして置こう（のこり ${left}）`;
  else hint.textContent = plan.sent ? 'ほかの人を待っています…（変えたら、もう一度決定）' : '兵を置ききりました。「決定！」を押そう';
}
function renderLobby() {
  show('lobby'); bgm.setMood('calm');
  $('#lobbyCode').textContent = room.code;
  const host = room.isHost(), ms = room.members, bots = room.lobby.bots || [];
  const total = Math.min(ms.length, MAX_PLAYERS) + bots.length;
  $('#lobbyCount').textContent = `${total}人` + (ms.length > MAX_PLAYERS ? `（${MAX_PLAYERS}人まで。ほかの人は見学）` : '');
  $('#lobbyList').innerHTML = ms.map((m, i) => `<li class="${m.id === myId ? 'me' : ''}"><i class="dot" style="background:${G.COLORS[i % G.COLORS.length]}"></i><span class="nm">${m.id === room.hostId() ? '👑' : ''}${esc(m.name)}</span></li>`).join('')
    + bots.map((b, j) => `<li><i class="dot" style="background:${G.COLORS[(ms.length + j) % G.COLORS.length]}"></i><span class="nm">${esc(b.name)}<small> ${LEVELS[b.bot]}</small></span>${host ? `<button data-rm="${b.id}" aria-label="外す">✕</button>` : ''}</li>`).join('');
  $('#hostBox').hidden = !host; $('#botBox').hidden = !host; $('#lobbyWait').hidden = host; $('#btnStart').hidden = !host;
  for (const b of $('#roundsSeg').children) b.classList.toggle('on', +b.dataset.r === room.lobby.rounds);
  for (const b of $('#botSeg').children) b.disabled = total >= MAX_PLAYERS;
  $('#btnStart').textContent = total < 2 ? 'はじめる（1人で練習）' : `${total}人ではじめる`;
}
function renderEnd() {
  show('end');
  const st = room.state, rk = G.ranking(st);
  $('#btnAgain').hidden = !room.isHost(); $('#endWait').hidden = room.isHost();
  if (seenEnd === st.gid) return;
  seenEnd = st.gid; bgm.setMood('end'); prevRanks = null;
  const aw = G.awards(st), medals = ['🏰', '⚔️', '🪄', '💠', '🚀', '🛡️'];
  $('#awards').innerHTML = ''; $('#podium').innerHTML = ''; $('#rank').innerHTML = '';
  aw.forEach((a, i) => setTimeout(() => {
    const p = st.players[a.pi];
    $('#awards').insertAdjacentHTML('beforeend', `<div class="award"><span class="medal">${medals[i % medals.length]}</span><div><b>${esc(a.title)}：${esc(p.name)}</b><small>${esc(a.desc)}</small></div></div>`);
    sfx.pop();
  }, 500 + i * 1100));
  const t = 700 + aw.length * 1100;
  setTimeout(() => {
    const order = [rk[1], rk[0], rk[2]].filter(Boolean), h = { 0: 120, 1: 86, 2: 60 };
    $('#podium').innerHTML = order.map(r => { const pos = rk.indexOf(r); return `<div class="pl" style="animation-delay:${(2 - pos) * 0.35}s"><span>${pos === 0 ? '👑' : ''}</span><span class="nm">${esc(r.name)}</span><span>${r.score}点</span><div class="blk" style="height:${h[pos]}px;background:${r.color}">${pos + 1}</div></div>`; }).join('');
    $('#rank').innerHTML = rk.map((r, i) => `<li><span class="no">${i + 1}</span><i class="dot" style="background:${r.color}"></i><span class="nm">${esc(r.name)}${st.players[r.pi].id === myId ? '（自分）' : ''}</span><span class="sc">${r.score}点</span></li>`).join('');
    $('#podium').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { sfx.fanfare(); confetti(); }, 900);
  }, t);
}
function confetti() {
  const box = $('#confetti'), cs = G.COLORS;
  for (let i = 0; i < 70; i++) { const c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = cs[i % cs.length]; c.style.animationDuration = 2 + Math.random() * 2 + 's'; c.style.animationDelay = Math.random() * 0.8 + 's'; box.append(c); }
  setTimeout(() => { box.innerHTML = ''; }, 5000);
}

// 時間の表示・カウントダウンの音・時間切れ前の自動決定・何もしない時のヒント
let lastTick = -1;
setInterval(() => {
  if (!room || !room.state || room.state.phase === 'end') return;
  renderTop();
  if (canAct()) {
    const sec = Math.ceil(room.remain() / 1000);
    if (sec <= 10 && sec !== lastTick && sec > 0) { lastTick = sec; sfx.tick(sec); if (sec <= 5) setTimeout(() => sfx.tick(sec), 500); }
    if (room.remain() < 900 && (plan.dirty || (!plan.sent && plan.order.length))) go(); // 置いた兵を、時間切れでむだにしない
    if (!plan.sent && Date.now() - lastInput > 8000 && used() < totalTroops(room.state, room.meIndex())) $('#board').classList.add('nudge');
  }
}, 250);
addEventListener('resize', () => updateCoach());

// ---------- ボタン ----------
$('#nick').value = store.get('name', '');
const qs = new URLSearchParams(location.search).get('r'); if (qs) $('#code').value = qs.replace(/\D/g, '').slice(0, 4);
$('#btnCreate').onclick = () => enter(randCode(), true);
$('#btnJoin').onclick = () => { const c = $('#code').value.replace(/\D/g, ''); if (c.length !== 4) { $('#homeMsg').textContent = '4けたの番号を入れてください'; return; } enter(c, false); };
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });
$('#btnShare').onclick = share; $('#btnMShare').onclick = share;
$('#btnLeave').onclick = leave; $('#btnEndLeave').onclick = leave;
$('#btnMLeave').onclick = () => { $('#menu').close(); if (confirm('部屋を出ますか？')) leave(); };
$('#roundsSeg').onclick = e => { const b = e.target.closest('button'); if (b) room.setRounds(+b.dataset.r); };
$('#botSeg').onclick = e => { const b = e.target.closest('button'); if (b) { room.addBot(b.dataset.l); sfx.pop(); } };
$('#lobbyList').onclick = e => { const b = e.target.closest('button[data-rm]'); if (b) room.removeBot(b.dataset.rm); };
$('#btnStart').onclick = () => { room.start(); sfx.lock(); };
$('#btnAgain').onclick = () => room.backToLobby();
$('#btnUndo').onclick = undo; $('#btnGo').onclick = go;
$('#hand').onclick = e => { const b = e.target.closest('button'); if (b) tapCard(+b.dataset.h); };
$('#helpCards').innerHTML = Object.values(G.CARDS).map(c => `<li>${c.icon} <b>${c.name}</b>：${c.text}</li>`).join('');
$('#btnHelp').onclick = () => $('#help').showModal();
$('#btnMHelp').onclick = () => { $('#menu').close(); $('#help').showModal(); };
const optText = () => { $('#btnBgm').textContent = '音楽：' + (opt.bgm ? 'オン' : 'オフ'); $('#btnSound').textContent = '効果音：' + (opt.sfx ? 'オン' : 'オフ'); };
$('#btnMenu').onclick = () => { $('#menuCode').textContent = room?.code || ''; optText(); $('#menu').showModal(); };
$('#btnSound').onclick = () => { setOpt('sfx', !opt.sfx); optText(); };
$('#btnBgm').onclick = () => { unlock(); setOpt('bgm', !opt.bgm); optText(); };
document.addEventListener('pointerdown', () => unlock(), { once: true });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__rl = { get room() { return room; }, render, B }; // 試験用
