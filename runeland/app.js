// ルーンランド：画面
import * as G from './game.js';
import { Room, MAX_PLAYERS } from './net.js';
import { LEVELS } from './ai.js';
import { sfx, bgm, opt, setOpt, unlock } from './audio.js';
import { RELAY_URL, RELAY_KEY } from './relay-config.js';
import { ic, icAt } from './icons.js';

const $ = s => document.querySelector(s);
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const store = { get(k, d) { try { return localStorage.getItem('runeland:' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('runeland:' + k, v); } catch {} } };
let myId = store.get('id'); if (!myId) { myId = Math.random().toString(36).slice(2, 10); store.set('id', myId); }
let room = null;
const nameHtml = p => (p.bot ? ic('bot', 'bot') : '') + esc(p.name);
// マスの守り（取るのに何人いるか）
const TNAME = ['草原', '森', '山', '湖', 'ルーンの石'];
const tileName = (st, i) => G.isCastle(st, i) ? 'お城' : TNAME[st.terrain[i]];
function guardOf(st, i, owners = st.owner) { const o = owners[i], d = G.defenseOf(st, i), b = o >= 0 ? 1 : 0; return { o, d, b, total: b + d }; }
function guardParts(st, i, g, oTroops = 0, oDice = 0) {
  const a = [];
  if (oTroops) a.push(`持ち主の兵${oTroops}`);
  if (g.b) a.push('持ち主+1');
  if (g.d) a.push(`${tileName(st, i)}+${g.d}`);
  if (oDice) a.push(`サイコロ+${oDice}`);
  return a.length ? a.join('＋') : '守りなし';
}
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
  plan.order.push(i); rebuild(); plan.last = i; sfx.place(plan.place.get(i)); touched(); coachDone('place'); render();
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
const chestIcon = (x, y) => `<g transform="translate(${x - 4.5} ${y - 3.5})"><rect x="0" y="2.5" width="9" height="5.5" rx="1" fill="#b9773a" stroke="#5b4636" stroke-width=".7"/><path d="M0 3.2q0-3 4.5-3t4.5 3z" fill="#d18f45" stroke="#5b4636" stroke-width=".7"/><rect x="3.6" y="2.2" width="1.8" height="2.4" fill="#f2c25a" stroke="#5b4636" stroke-width=".4"/></g>`;
let prevChests = null;
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
  for (const i of (B.anim && prevChests ? prevChests : st.chests) || []) { const [x, y] = B.cx[i]; out += chestIcon(x, y); }
  if (acting && !plan.targeting) {
    for (let i = 0; i < B.tiles.length; i++) if (st.terrain[i] !== G.T.LAKE && st.owner[i] !== pi && G.canPlace(st, pi, i, portal)) {
      out += `<polygon class="can" points="${B.tiles[i].getAttribute('points')}"/>`;
      if (!plan.place.has(i)) { const [x, y] = B.cx[i]; out += `<text class="need" x="${x + 5.2}" y="${y + 4.6}" font-size="4.4">${guardOf(st, i).total + 1}</text>`; } // 取るのに要る兵
    }
  }
  if (acting && plan.targeting) { // カードの相手を選ぶ時：選べるマスを光らせる
    const own = G.CARDS[plan.card.k].target === 'own';
    for (let i = 0; i < B.tiles.length; i++) if (st.terrain[i] !== G.T.LAKE && (own ? st.owner[i] === pi : st.owner[i] >= 0 && st.owner[i] !== pi)) out += `<polygon class="can" points="${B.tiles[i].getAttribute('points')}"/>`;
  }
  if (acting && plan.card && plan.card.target != null) out += `<polygon class="tgt" points="${B.tiles[plan.card.target].getAttribute('points')}"/>${icAt(G.CARDS[plan.card.k].icon, B.cx[plan.card.target][0], B.cx[plan.card.target][1] - 9, 9)}`;
  if (acting) for (const [i, n] of plan.place) {
    const [x, y] = B.cx[i]; out += `<circle cx="${x}" cy="${y}" r="5.4" fill="${st.players[pi].color}" stroke="#fff" stroke-width="1.3"/><text class="cnt" x="${x}" y="${y + 0.3}" font-size="7.2">${n}</text>`;
    if (st.owner[i] !== pi) { // 足りているか：あと何人
      const need = guardOf(st, i).total + 1, ok = n >= need;
      out += `<rect x="${x - 6}" y="${y + 4.6}" width="12" height="4.6" rx="2.3" fill="${ok ? '#5aa36a' : '#e3832f'}" stroke="#fff" stroke-width=".6"/><text class="pill" x="${x}" y="${y + 7}" font-size="3.4">${ok ? '取れる' : 'あと' + (need - n)}</text>`;
    }
  }
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
  if (!canAct() && room?.state?.step === 'reveal') { explain(i); return; } // 結果の時：そのマスの勝負の内訳
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
function skipAnim() { animTimers.forEach(clearTimeout); animTimers = []; duelTimers.forEach(clearInterval); duelTimers = []; $('#duel').hidden = true; B.anim = false; if (room?.state?.last) celebrate(room.state); render(); }
function flashTile(i, cls) { const p = el('polygon', { class: cls, points: B.tiles[i].getAttribute('points') }, $('#lOver')); $('#lOver').__h = null; setTimeout(() => p.remove(), 1600); }
function banner(text, sub = '', icon = '', subHtml = false) { const b = $('#banner'); b.innerHTML = `<div>${icon ? ic(icon) + ' ' : ''}${esc(text)}${sub ? `<small>${subHtml ? sub : esc(sub)}</small>` : ''}</div>`; }
let celebrated = '';
// ---- サイコロのとりあい（1人ずつ） ----
let duelTimers = [];
function duelRows(st, d) {
  const L = st.last, [i, ds] = d, f = (L.fights || []).find(x => x.i === i), force = new Map((L.force.find(x => x[0] === i) || [i, []])[1]);
  const rows = ds.map(([p, dv]) => ({ p, dice: dv, base: (force.get(p) || dv) - dv, own: f && f.o === p }));
  if (f && f.o >= 0 && !rows.some(r => r.own)) rows.push({ p: f.o, dice: null, base: 0, own: true });
  for (const r of rows) if (r.own && f) r.guard = f.b + f.d;
  if (f && f.o < 0 && f.d > 0) rows.push({ p: -1, land: true, dice: null, base: 0, guard: f.d }); // 空き地でも、森・山・ルーンは守りがある
  rows.sort((a, b) => (b.own || b.land ? 1 : 0) - (a.own || a.land ? 1 : 0));
  return { i, f, rows };
}
const duelMs = d => 500 + d.rows.length * 700 + 1300;
function pickDuels(st, pi) {
  const L = st.last; if (!L.dice || !L.dice.length) return [];
  const all = L.dice.map(d => duelRows(st, d));
  const mine = x => x.rows.some(r => r.p === pi);
  return all.sort((a, b) => (mine(b) ? 1 : 0) - (mine(a) ? 1 : 0) || b.rows.length - a.rows.length).slice(0, 3);
}
const dieSvg = v => `<svg class="die" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="7" fill="#fffaf0" stroke="#5b4636" stroke-width="2"/><text x="16" y="17.5" font-size="15" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${v ? '#d9573f' : '#8a735c'}">+${v}</text></svg>`;
function playDuel(st, d) {
  const box = $('#duel'), L = st.last, { i, f, rows } = d;
  const total = r => r.base + (r.dice || 0) + (r.guard || 0);
  box.innerHTML = `<div class="dhead">${ic('dice')} とりあい！<small>${tileName(st, i)}${f && f.o >= 0 ? `（${nameHtml(st.players[f.o])}の土地）` : '（空き地）'}</small></div>
    <ul>${rows.map((r, k) => r.land ? `<li data-k="${k}" class="land">${ic(st.terrain[i] === G.T.RUNE ? 'rune' : 'shield')}<span class="nm">土地の守り（${tileName(st, i)}）</span><span class="bs">これより多く必要</span><span class="die-sp"></span><b class="tot">= ${r.guard}</b></li>` : `<li data-k="${k}"><i class="dot" style="background:${st.players[r.p].color}"></i><span class="nm">${nameHtml(st.players[r.p])}${r.own ? '<small>守る</small>' : ''}</span>
      <span class="bs">${r.own ? `兵${r.base}＋守り${r.guard}` : `兵${r.base}`}</span>${r.dice == null ? '<span class="die-sp"></span>' : `<span class="dw">${dieSvg(0)}</span>`}<b class="tot">${r.dice == null ? '= ' + total(r) : ''}</b></li>`).join('')}</ul>
    <p class="res"></p>`;
  box.hidden = false; flashTile(i, 'shine');
  let tt = 500;
  rows.forEach((r, k) => {
    if (r.dice == null) return;
    later(tt, () => {
      const li = box.querySelector(`li[data-k="${k}"]`); if (!li) return; li.classList.add('turn');
      const dw = li.querySelector('.dw'); let n = 0;
      const iv = setInterval(() => { dw.innerHTML = dieSvg(Math.floor(Math.random() * 3)); dw.classList.toggle('shake'); if (n++ % 2 === 0) sfx.tick(10); }, 70);
      duelTimers.push(iv);
      setTimeout(() => { clearInterval(iv); dw.innerHTML = dieSvg(r.dice); dw.classList.remove('shake'); dw.classList.add('land'); li.querySelector('.tot').textContent = '= ' + total(r); li.classList.remove('turn'); sfx.place(r.dice * 3 + 1); }, 520);
    });
    tt += 700;
  });
  later(tt, () => {
    const res = box.querySelector('.res');
    let winner = -1, text = '';
    if (!f) text = '';
    else if (f.r === 'take') { winner = f.w; text = `${nameHtml(st.players[f.w])} が取った！`; }
    else if (f.r === 'tie') text = '引き分け！ だれも取れず';
    else if (f.r === 'shield') text = '結界で守られた！';
    else if (f.o >= 0) { winner = f.o; text = `${nameHtml(st.players[f.o])} が守った！`; }
    else text = '土地の守りより多くなくて、だれも取れず';
    rows.forEach((r, k) => { if (r.p === winner) box.querySelector(`li[data-k="${k}"]`).classList.add('win'); });
    res.innerHTML = text; sfx.rankUp();
  });
  later(duelMs(d) - 150, () => { box.hidden = true; });
}
// ---- 勝負の内訳（なぜ取れた／取れなかった） ----
function fightText(st, f, pi) {
  const L = st.last, dmap = new Map((L.dice || []).map(([i, ds]) => [i, new Map(ds)]));
  const force = new Map((L.force.find(x => x[0] === f.i) || [f.i, []])[1]);
  const dz = (p) => (dmap.get(f.i) && dmap.get(f.i).get(p)) || 0;
  const g = { b: f.b, d: f.d }, od = f.o >= 0 ? dz(f.o) : 0;
  const guardStr = `守り ${f.hold}（${guardParts(st, f.i, g, f.g - od, od)}）`;
  const where = `${tileName(st, f.i)}${f.o >= 0 && f.o !== pi ? `・${esc(st.players[f.o].name)}の土地` : f.o === pi ? '・自分の土地' : '・空き地'}`;
  const nm = p => p === pi ? 'あなた' : esc(st.players[p].name);
  const val = p => { const v = force.get(p) || 0, d = dz(p); return d ? `${v - d}＋サイコロ${d}＝${v}` : `${v}`; };
  if (f.o === pi) { // 守った側
    if (f.r === 'take') return { ok: false, t: `取られた（${where}）：${nm(f.w)} ${val(f.w)} が ${guardStr} より多かった` };
    if (f.w < 0) return null;
    return { ok: true, t: `守れた（${where}）：${guardStr} ≧ ${nm(f.w)} ${val(f.w)}` };
  }
  if (!force.has(pi)) return null;
  const mine = force.get(pi);
  if (f.r === 'take' && f.w === pi) return { ok: true, t: `取れた！（${where}）：あなた ${val(pi)} ＞ ${guardStr}` };
  if (f.r === 'shield') return { ok: false, t: `取れず（${where}）：守りの結界で守られていた` };
  if (mine <= f.hold) return { ok: false, t: `取れず（${where}）：あなた ${val(pi)} ${mine === f.hold ? '＝' : '＜'} ${guardStr}${mine === f.hold ? '。同じ数だと守る側の勝ち' : ''}` };
  if (f.tie && f.v === mine) { const other = [...force].find(([p, v]) => p !== pi && p !== f.o && v === mine); return { ok: false, t: `取れず（${where}）：${other ? nm(other[0]) : 'ほかの人'} と同じ ${mine} で引き分け。だれも取れない` }; }
  return { ok: false, t: `取れず（${where}）：${nm(f.w)} ${val(f.w)} の方が多かった（あなた ${val(pi)}）` };
}
function myFights(st, pi) { return (st.last && st.last.fights || []).map(f => ({ f, x: fightText(st, f, pi) })).filter(o => o.x); }
function explain(i) {
  const st = room.state, pi = room.meIndex(), f = (st.last && st.last.fights || []).find(x => x.i === i);
  if (!f) { toast(`${tileName(st, i)}：このラウンドはだれも兵を置かなかった`); return; }
  const x = pi >= 0 ? fightText(st, f, pi) : null;
  const force = (st.last.force.find(z => z[0] === i) || [i, []])[1];
  const lines = force.map(([p, v]) => `<li><i class="dot" style="background:${st.players[p].color}"></i>${nameHtml(st.players[p])}：${v}${p === f.o ? `＋守り${f.b + f.d}` : ''}</li>`).join('');
  openWhy(`${tileName(st, i)}の勝負`, (x ? `<p class="${x.ok ? 'ok' : 'ng'}">${x.ok ? '◯' : '✕'} ${x.t}</p>` : '') + `<ul class="plain">${lines}</ul><p class="note">守る側は「持ち主+1」と土地の守り（森+1・山+2・ルーン+2・お城+3）が足されます。攻める側は、守りより多くないと取れません。</p>`);
}
function openWhy(title, html) { $('#whyTitle').textContent = title; $('#whyBody').innerHTML = html; $('#why').showModal(); }
function showWhyAll() {
  const st = room.state, pi = room.meIndex(), list = myFights(st, pi);
  openWhy(`ラウンド${st.last.round}の結果`, list.length ? `<ul class="why">${list.map(o => `<li class="${o.x.ok ? 'ok' : 'ng'}">${o.x.ok ? '◯' : '✕'} ${o.x.t}</li>`).join('')}</ul><p class="note">盤面のマスをタップすると、そのマスの勝負も見られます。</p>` : '<p>このラウンドは、兵を置いたマスで勝負がありませんでした。</p>');
}
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
      banner(G.CARDS[l.card].name, nameHtml(st.players[l.pi]) + (l.card === 'dice' ? `（${G.diceRoll(st.seed, L.round, l.pi)}）` : ''), G.CARDS[l.card].icon, true);
      ({ dragon: sfx.dragon, shield: sfx.shield, storm: sfx.storm, treasure: sfx.coin }[l.card] || sfx.card)();
      if (l.card === 'dragon') for (const i of L.burned) { disp[i] = -1; flashTile(i, 'burn'); }
      if (l.card === 'shield') for (const i of L.shields) flashTile(i, 'shine');
      paintTiles(st, disp);
    });
    t += 650;
  }
  // 1.5) サイコロ：とりあいのマスを、1人ずつ転がして見せる（自分のマスを先に。3か所まで）
  for (const d of pickDuels(st, pi)) { const dur = duelMs(d); later(t, () => playDuel(st, d)); t += dur; }
  if (L.dice && L.dice.length > 3) later(t - 200, () => toast(`ほかに${L.dice.length - 3}か所でもサイコロ`, 2000, 'dice'));
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
  // 3) 宝箱を開ける
  for (const o of (L.opened || []).slice(0, 4)) {
    later(t, () => { banner('宝箱！', `${nameHtml(st.players[o.pi])}：${o.card ? ic(G.CARDS[o.card].icon) + esc(G.CARDS[o.card].name) : '+' + o.pt + '点'}`, 'chest', true); sfx.chest(); flashTile(o.i, 'shine'); });
    t += 800;
  }
  // 4) イベント（予告なし）
  if (L.event) {
    later(t, () => {
      const e = G.EVENTS[L.event.k]; banner(e.name, e.text, e.icon);
      ({ raid: sfx.dragon, wave: sfx.storm, gold: sfx.coin, glow: sfx.shield, fairy: sfx.card }[L.event.k] || sfx.card)();
      for (const [i] of L.event.tiles) { disp[i] = -1; flashTile(i, 'burn'); }
      paintTiles(st, disp);
    });
    t += 1400;
  }
  later(t, () => { B.anim = false; paintTiles(st, st.owner); celebrate(st); render(); });
}
// 3) 点数と順位の変化
function celebrate(st) {
  const L = st.last, pi = room.meIndex(), key = st.gid + ':' + L.round;
  if (celebrated === key) return; celebrated = key;
  const won = {}, lost = {};
  for (const c of L.changed) { won[c.to] = (won[c.to] || 0) + 1; if (c.from >= 0) lost[c.from] = (lost[c.from] || 0) + 1; }
  for (const i of L.burned) { const o = prevOwners ? prevOwners[i] : -1; if (o >= 0) lost[o] = (lost[o] || 0) + 1; }
  if (L.event) for (const [, o] of L.event.tiles) lost[o] = (lost[o] || 0) + 1;
  if (pi >= 0) for (const o of L.opened || []) if (o.pi === pi) toast(`宝箱から ${o.card ? G.CARDS[o.card].name : o.pt + '点'}！`, 3500, 'chest');
  const rk = G.ranking(st), newRanks = new Map(rk.map((x, i) => [x.pi, i]));
  if (pi >= 0) {
    if (won[pi]) toast(`${won[pi]}マス取りました！`, 3500, 'yay');
    if (lost[pi]) toast(`${lost[pi]}マス取られました…`, 3500, 'oops');
    if (prevRanks && prevRanks.has(pi) && newRanks.get(pi) < prevRanks.get(pi)) sfx.rankUp(); else if (lost[pi] && !won[pi]) sfx.lose();
  }
  const oldTop = prevRanks ? [...prevRanks].find(([, r]) => r === 0)?.[0] : undefined;
  const leaderChanged = oldTop !== undefined && rk[0] && oldTop !== rk[0].pi;
  const best = Object.entries(won).sort((a, b) => b[1] - a[1])[0];
  if (st.round === st.rounds) later(200, () => { banner('最終ラウンド！', 'ここで決まる！'); bgm.setMood('tense'); });
  else if (leaderChanged) later(200, () => banner(`${rk[0].name} が1位に！`, '', 'crown'));
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
function toast(t, ms = 2600, icon = '') { const d = document.createElement('div'); d.innerHTML = (icon ? ic(icon) + ' ' : '') + esc(t); $('#toast').append(d); while ($('#toast').children.length > 3) $('#toast').firstChild.remove(); setTimeout(() => d.remove(), ms); }
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
    prevOwners = st.owner.slice(); prevChests = (st.chests || []).slice(); prevGidRound = st.gid + ':' + st.round;
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
    return `<span class="chip ${p.id === myId ? 'me' : ''} ${off ? 'off' : ''}" data-id="${p.id}">${pos === 0 && r.score > 0 ? ic('crown') : ''}<i class="dot" style="background:${p.color}"></i>${nameHtml(p)} <span class="sc">${r.score}</span>${arrow}${stt}</span>`;
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
    hand.innerHTML = p.hand.length ? p.hand.map((k, i) => { const c = G.CARDS[k]; return `<button data-h="${i}" class="${plan.card && plan.card.i === i ? 'sel' : ''} ${fresh && i === p.hand.length - 1 && st.round > 1 && acting ? 'new' : ''}" ${acting ? '' : 'disabled'}><span class="ic">${ic(c.icon)}</span>${c.name}</button>`; }).join('') : '<div class="empty">カードはありません</div>';
    hand.__k = hk; handSeen = st.gid + ':' + st.round + ':' + p.hand.length;
  }
  $('#btnUndo').disabled = !acting || (!plan.order.length && !plan.card);
  if (!acting) {
    btn.disabled = true; btn.textContent = '結果発表中…';
    const top = G.ranking(st)[0];
    if (B.anim) { hint.textContent = 'タップで結果をとばせます'; return; }
    const list = st.last ? myFights(st, pi) : [], att = list.filter(o => o.f.o !== pi), ok = att.filter(o => o.x.ok).length;
    if (list.length) hint.innerHTML = `${att.length ? `攻めた${att.length}マス：<b>取れた${ok}</b>・取れず${att.length - ok}` : '守りの結果'}　<button id="btnWhy" class="mini">なぜ？</button>`;
    else hint.textContent = `いま1位：${top.name}（${top.score}点）。マスをタップすると勝負の内訳が見られます`;
    return;
  }
  btn.disabled = false;
  const left = totalTroops(st, pi) - used();
  if (plan.sent && !plan.dirty) { btn.classList.add('done'); btn.textContent = '決定ずみ ✓'; }
  else if (plan.sent) btn.textContent = '決定しなおす';
  else if (left > 0) btn.textContent = `決定（兵あと${left}）`;
  else { btn.textContent = '決定！'; btn.classList.add('ready'); }
  const c = plan.card && G.CARDS[plan.card.k];
  if (plan.targeting) hint.innerHTML = `${ic(c.icon)} ${c.name}：${c.target === 'own' ? '守りたい自分のマス' : '燃やしたい相手のマス'}をタップ`;
  else if (c) hint.innerHTML = `${ic(c.icon)} ${c.text}` + (plan.card.k === 'dice' ? `（出た目：${G.diceRoll(st.seed, st.round, pi)}）` : '') + `　兵 のこり${left}`;
  else if (G.landOf(st, pi) === 0) hint.textContent = `ふっかつ！ だれのものでもない好きなマスに兵を置けます（のこり ${left}）`;
  else if (plan.last != null && plan.place.has(plan.last) && st.owner[plan.last] !== pi) {
    const i = plan.last, g = guardOf(st, i), n = plan.place.get(i), need = g.total + 1;
    hint.innerHTML = `${tileName(st, i)}${g.o >= 0 ? `（${nameHtml(st.players[g.o])}の土地）` : ''}：守り${g.total}（${guardParts(st, i, g)}）→ <b>${need}人で取れる</b>。いま${n}人${n < need ? `（あと${need - n}）` : ' ✓'}<small>　相手が兵を足すともっと要る・兵のこり${left}</small>`;
  }
  else if (left > 0) hint.textContent = `兵 ${totalTroops(st, pi)}人。光っているマスをタップ（小さい数字＝取るのに要る兵）。のこり ${left}`;
  else hint.textContent = plan.sent ? 'ほかの人を待っています…（変えたら、もう一度決定）' : '兵を置ききりました。「決定！」を押そう';
}
function renderLobby() {
  show('lobby'); bgm.setMood('calm');
  $('#lobbyCode').textContent = room.code;
  const host = room.isHost(), ms = room.members, bots = room.lobby.bots || [];
  const total = Math.min(ms.length, MAX_PLAYERS) + bots.length;
  $('#lobbyCount').textContent = `${total}人` + (ms.length > MAX_PLAYERS ? `（${MAX_PLAYERS}人まで。ほかの人は見学）` : '');
  $('#lobbyList').innerHTML = ms.map((m, i) => `<li class="${m.id === myId ? 'me' : ''}"><i class="dot" style="background:${G.COLORS[i % G.COLORS.length]}"></i><span class="nm">${m.id === room.hostId() ? ic('crown') : ''}${esc(m.name)}</span></li>`).join('')
    + bots.map((b, j) => `<li><i class="dot" style="background:${G.COLORS[(ms.length + j) % G.COLORS.length]}"></i><span class="nm">${nameHtml(b)}<small> ${LEVELS[b.bot]}</small></span>${host ? `<button data-rm="${b.id}" aria-label="外す">✕</button>` : ''}</li>`).join('');
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
  const aw = G.awards(st), medals = ['castle', 'hero', 'wand', 'rune', 'rise', 'shield'];
  $('#awards').innerHTML = ''; $('#podium').innerHTML = ''; $('#rank').innerHTML = '';
  aw.forEach((a, i) => setTimeout(() => {
    const p = st.players[a.pi];
    $('#awards').insertAdjacentHTML('beforeend', `<div class="award"><span class="medal">${ic(medals[i % medals.length])}</span><div><b>${esc(a.title)}：${nameHtml(p)}</b><small>${esc(a.desc)}</small></div></div>`);
    sfx.pop();
  }, 500 + i * 1100));
  const t = 700 + aw.length * 1100;
  setTimeout(() => {
    const order = [rk[1], rk[0], rk[2]].filter(Boolean), h = { 0: 120, 1: 86, 2: 60 };
    $('#podium').innerHTML = order.map(r => { const pos = rk.indexOf(r); return `<div class="pl" style="animation-delay:${(2 - pos) * 0.35}s"><span>${pos === 0 ? ic('crown', 'big') : ''}</span><span class="nm">${nameHtml(st.players[r.pi])}</span><span>${r.score}点</span><div class="blk" style="height:${h[pos]}px;background:${r.color}">${pos + 1}</div></div>`; }).join('');
    $('#rank').innerHTML = rk.map((r, i) => `<li><span class="no">${i + 1}</span><i class="dot" style="background:${r.color}"></i><span class="nm">${nameHtml(st.players[r.pi])}${st.players[r.pi].id === myId ? '（自分）' : ''}</span><span class="sc">${r.score}点</span></li>`).join('');
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
$('#btnMenu').innerHTML = ic('menu'); $('#btnUndo').innerHTML = ic('undo') + ' 戻す';
$('#helpCards').innerHTML = Object.values(G.CARDS).map(c => `<li>${ic(c.icon)} <b>${c.name}</b>：${c.text}</li>`).join('');
$('#hint').addEventListener('click', e => { if (e.target.closest('#btnWhy')) showWhyAll(); });
$('#btnMWhy').onclick = () => { $('#menu').close(); if (room?.state?.last) showWhyAll(); else toast('まだ結果がありません'); };
$('#btnHelp').onclick = () => openIntro(0);
$('#btnMHelp').onclick = () => { $('#menu').close(); openIntro(0); };
// ---- はじめての紹介（どんなゲームか） ----
const hexes = (cells) => cells.map(([q, r, fill, label, glow]) => { const x = 40 + 17.3 * (q + r / 2), y = 34 + 15 * r; const c = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return (x + 10 * Math.cos(a)).toFixed(1) + ',' + (y + 10 * Math.sin(a)).toFixed(1); }).join(' '); return `<polygon points="${c}" fill="${fill}" stroke="#5b4636" stroke-width="1.2" ${glow ? 'stroke-dasharray="3 2"' : ''}/>${label ? `<text x="${x}" y="${y + .5}" font-size="9" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#5b4636">${label}</text>` : ''}`; }).join('');
const INTRO = [
  { t: 'ルーンランドへようこそ！', b: '島の土地を、みんなで取り合うゲームです。<br>最後に<b>点数がいちばん多い人</b>の勝ち！', a: `<svg viewBox="0 0 80 68">${hexes([[-1, -1, '#e9a3a0'], [0, -1, '#e9a3a0'], [1, -1, '#d3e2a2'], [-1, 0, '#e9a3a0'], [0, 0, '#d3e2a2'], [1, 0, '#9fb9ea'], [-1, 1, '#d3e2a2'], [0, 1, '#9fb9ea'], [1, 1, '#9fb9ea']])}</svg>` },
  { t: 'みんな同時に、兵を置く', b: '置けるのは<b>自分のマス</b>か、その<b>となり</b>（光っているマス）。<br>タップするたびに兵が1人。35秒のうちに「決定」！', a: `<svg viewBox="0 0 80 68">${hexes([[0, 0, '#e9a3a0', '自'], [1, 0, '#fff6c8', '2', 1], [-1, 0, '#fff6c8', '', 1], [0, -1, '#fff6c8', '', 1], [1, -1, '#fff6c8', '', 1], [0, 1, '#fff6c8', '1', 1], [-1, 1, '#fff6c8', '', 1]])}</svg>` },
  { t: '多い方が勝ち。でも守る側は強い', b: '守りより<b>多く</b>置けば取れます。<br>守り＝持ち主<b>+1</b>・森<b>+1</b>・山<b>+2</b>・お城<b>+3</b>。<br>光るマスの<b>小さい数字</b>が、取るのに要る兵です。', a: `<div class="vs"><div><b>3</b><small>あなたの兵</small></div><span>＞</span><div><b>2</b><small>守り（持ち主+1・森+1）</small></div></div><p class="res2">→ 取れる！ 同じ数だと守る側の勝ち</p>` },
  { t: '運で大逆転も！', b: '<b>魔法カード</b>（1ラウンド1枚）・<b>サイコロ</b>（とりあいの時）・<b>宝箱</b>・ときどき<b>イベント</b>。<br>順位が下の人ほど、強いカードが来ます。', a: `<div class="icons">${ic('dragon')}${ic('dice')}${ic('chest')}${ic('raid')}</div>` },
  { t: '点数のかぞえ方', b: 'マス <b>1点</b>・ルーンの石 <b>3点</b>（兵も増える）・お城 <b>2点</b>。<br>決まったラウンド数（ふつう18）で終わり。', a: `<div class="icons">${ic('rune')}${ic('castle')}${ic('crown')}</div>` },
];
let introPage = 0;
function openIntro(k) { introPage = k; drawIntro(); const d = $('#intro'); if (!d.open) d.showModal(); }
function drawIntro() {
  const p = INTRO[introPage];
  $('#introBody').innerHTML = `<div class="art">${p.a}</div><h2>${p.t}</h2><p>${p.b}</p>`;
  $('#introDots').innerHTML = INTRO.map((_, k) => `<i class="${k === introPage ? 'on' : ''}"></i>`).join('');
  $('#introPrev').style.visibility = introPage ? 'visible' : 'hidden';
  $('#introNext').textContent = introPage === INTRO.length - 1 ? 'はじめる！' : 'つぎへ';
}
$('#introPrev').onclick = () => { if (introPage > 0) { introPage--; drawIntro(); } };
$('#introNext').onclick = () => { if (introPage < INTRO.length - 1) { introPage++; drawIntro(); } else { $('#intro').close(); store.set('intro', '1'); } };
$('#introRules').onclick = () => { $('#intro').close(); store.set('intro', '1'); $('#help').showModal(); };
if (!store.get('intro', '')) setTimeout(() => openIntro(0), 300);
const optText = () => { $('#btnBgm').textContent = '音楽：' + (opt.bgm ? 'オン' : 'オフ'); $('#btnSound').textContent = '効果音：' + (opt.sfx ? 'オン' : 'オフ'); };
$('#btnMenu').onclick = () => { $('#menuCode').textContent = room?.code || ''; optText(); $('#menu').showModal(); };
$('#btnSound').onclick = () => { setOpt('sfx', !opt.sfx); optText(); };
$('#btnBgm').onclick = () => { unlock(); setOpt('bgm', !opt.bgm); optText(); };
document.addEventListener('pointerdown', () => unlock(), { once: true });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__rl = { get room() { return room; }, render, B }; // 試験用
