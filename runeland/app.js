// ルーンランド：画面
import * as G from './game.js';
import { Room, MAX_PLAYERS } from './net.js';
import { RELAY_URL, RELAY_KEY } from './relay-config.js';

const $ = s => document.querySelector(s);
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const store = { get(k, d) { try { return localStorage.getItem('runeland:' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('runeland:' + k, v); } catch {} } };
let myId = store.get('id'); if (!myId) { myId = Math.random().toString(36).slice(2, 10); store.set('id', myId); }
let room = null, sound = store.get('sound', '1') === '1';

// ---------- 音（その場で作る） ----------
let ac = null;
function beep(f = 660, d = 0.08, type = 'triangle', v = 0.08, when = 0) {
  if (!sound) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  } catch {}
}
const sfx = {
  tap: () => beep(720, 0.05), undo: () => beep(420, 0.06), card: () => { beep(880, 0.08, 'sine'); beep(1320, 0.12, 'sine', 0.06, 0.07); },
  go: () => { beep(523, 0.08); beep(784, 0.12, 'triangle', 0.08, 0.08); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.18, 'triangle', 0.09, i * 0.12)),
  lose: () => beep(300, 0.15, 'sawtooth', 0.05), tick: () => beep(1000, 0.03, 'square', 0.03),
  end: () => [784, 659, 523, 659, 784, 1046].forEach((f, i) => beep(f, 0.2, 'triangle', 0.08, i * 0.14)),
};

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
async function enter(code, creating) {
  const name = nick(); if (!name) return;
  $('#homeMsg').textContent = 'つないでいます…';
  try {
    const sb = await supa();
    for (let tries = 0; tries < 4; tries++) {
      const r = new Room({ code, id: myId, name, sb, onChange: render, onStatus: t => { $('#homeMsg').textContent = t; } });
      await r.connect();
      if (creating) { // 作る時：もう人がいる番号なら、べつの番号にする
        await new Promise(res => setTimeout(res, 1200));
        if (r.members.some(m => m.id !== myId)) { r.leave(); code = randCode(); continue; }
      }
      room = r; break;
    }
    if (!room) throw new Error('部屋を作れませんでした。もう一度ためしてください');
    history.replaceState(null, '', '?r=' + code);
    $('#homeMsg').textContent = '';
    wake();
    render();
  } catch (e) { $('#homeMsg').textContent = e.message || 'つなげませんでした'; }
}
const randCode = () => String(1000 + Math.floor(Math.random() * 9000));
function leave() { if (room) room.leave(); room = null; plan = null; history.replaceState(null, '', location.pathname); show('home'); }
const shareUrl = () => location.origin + location.pathname + '?r=' + room.code;
async function share() {
  const url = shareUrl(), text = `ルーンランドで遊ぼう！ 部屋の番号は ${room.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'ルーンランド', text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('招待リンクをコピーしました'); } catch { prompt('このリンクを送ってください', url); }
}
let lock = null;
async function wake() { try { lock = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && room) wake(); });

// ---------- 作戦（自分のスマホの中だけ） ----------
let plan = null; // { key, place: Map, order: [], card: {i,k,target}|null, sent, dirty, targeting }
function planFor(st) {
  const key = st.gid + ':' + st.round;
  if (!plan || plan.key !== key) plan = { key, place: new Map(), order: [], card: null, sent: false, dirty: false, targeting: false };
  return plan;
}
const used = () => [...plan.place.values()].reduce((a, b) => a + b, 0);
function totalTroops(st, pi) { return G.baseTroops(st, pi) + G.cardTroops(st, pi, plan.card && plan.card.k); }
function fixPlan(st, pi) { // カードを変えた時、置けなくなった兵・多すぎる兵を戻す
  const portal = plan.card && plan.card.k === 'portal';
  plan.order = plan.order.filter(i => G.canPlace(st, pi, i, portal));
  while (plan.order.length > totalTroops(st, pi)) plan.order.pop();
  plan.place = new Map(); for (const i of plan.order) plan.place.set(i, (plan.place.get(i) || 0) + 1);
}
function touched() { plan.dirty = true; }
function canAct() { const st = room?.state; return st && st.phase === 'plan' && st.step === 'plan' && room.meIndex() >= 0; }
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
  if (!G.canPlace(st, pi, i, portal)) { toast(G.landOf(st, pi) === 0 ? 'だれのものでもないマスに置けます' : '自分のマスか、そのとなりに置けます'); return; }
  if (used() >= totalTroops(st, pi)) { toast('兵を使いきりました。「1つ戻す」で戻せます'); return; }
  plan.order.push(i); plan.place.set(i, (plan.place.get(i) || 0) + 1); sfx.tap(); touched(); render();
}
function undo() {
  if (!canAct()) return;
  if (plan.targeting) { plan.targeting = false; plan.card = null; render(); return; }
  const i = plan.order.pop(); if (i === undefined) return;
  const n = plan.place.get(i) - 1; if (n) plan.place.set(i, n); else plan.place.delete(i);
  sfx.undo(); touched(); render();
}
function tapCard(hi) {
  if (!canAct()) return;
  const st = room.state, pi = room.meIndex(), k = st.players[pi].hand[hi];
  if (plan.card && plan.card.i === hi) { plan.card = null; plan.targeting = false; }
  else { plan.card = { i: hi, k, target: null }; plan.targeting = !!G.CARDS[k].target; sfx.card(); }
  fixPlan(st, pi); touched(); render();
}
function go() {
  if (!canAct()) return;
  if (plan.targeting) { toast('カードを使うマスを選んでください'); return; }
  room.submit({ place: [...plan.place], card: plan.card });
  plan.sent = true; plan.dirty = false; sfx.go(); render();
}

// ---------- 盤面をかく ----------
const S = 10, SQ = Math.sqrt(3);
const BASE = ['#9cc46e', '#5d9450', '#a69a82', '#1f3b52', '#b7a3ec'];
const hexPts = (x, y, s) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return (x + s * Math.cos(a)).toFixed(1) + ',' + (y + s * Math.sin(a)).toFixed(1); }).join(' ');
function mix(c1, c2, t) { const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16); const ch = sh => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; }
function icon(t, castle, x, y) {
  if (castle) return `<path d="M${x - 4.5} ${y + 4}v-6h2v2h1.5v-2h2v2h1.5v-2h2v6z" fill="#fff8e0" stroke="#3a2a10" stroke-width=".8"/>`;
  if (t === G.T.FOREST) return `<path d="M${x - 4} ${y + 3}l2.5-6l2.5 6zM${x} ${y + 3.5}l2.5-6l2.5 6z" fill="#1f4d26" opacity=".75"/>`;
  if (t === G.T.MOUNTAIN) return `<path d="M${x - 5} ${y + 3.5}l5-8l5 8z" fill="#5d5546" opacity=".8"/><path d="M${x - 1.6} ${y - 1.9}l1.6-2.6l1.6 2.6z" fill="#fff"/>`;
  if (t === G.T.RUNE) return `<path d="M${x} ${y - 5}l3.5 5l-3.5 5l-3.5-5z" fill="#efe6ff" stroke="#6a3fd0" stroke-width="1.2"/><path d="M${x} ${y - 2.5}v5M${x - 1.5} ${y - 1}l3 2" stroke="#6a3fd0" stroke-width=".9"/>`;
  if (t === G.T.LAKE) return `<path d="M${x - 4} ${y}q2-2 4 0t4 0" fill="none" stroke="#7fb4e0" stroke-width="1.2"/><path d="M${x - 3} ${y + 3.5}q1.5-1.5 3 0t3 0" fill="none" stroke="#7fb4e0" stroke-width="1"/>`;
  return '';
}
let boardKey = '';
function drawBoard() {
  const st = room.state, m = G.mapOf(st), pi = room.meIndex();
  const acting = canAct(), reveal = st.step === 'reveal' || st.step === 'end';
  const portal = acting && plan.card && plan.card.k === 'portal';
  const last = reveal ? st.last : null;
  const chg = new Set(last ? last.changed.map(c => c.i) : []), burn = new Set(last ? last.burned : []);
  const force = new Map(last ? last.force : []);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, out = '';
  m.tiles.forEach((h, i) => {
    const x = S * SQ * (h.q + h.r / 2), y = S * 1.5 * h.r;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    const t = st.terrain[i], o = st.owner[i], castle = G.isCastle(st, i);
    const fill = o >= 0 ? mix(st.players[o].color, BASE[t], t === G.T.PLAIN ? 0.12 : 0.3) : BASE[t];
    let cls = 'hex';
    if (acting && !plan.targeting && t !== G.T.LAKE && G.canPlace(st, pi, i, portal) && o !== pi) cls += ' can';
    if (acting && plan.card && plan.card.target === i) cls += ' tgt';
    if (chg.has(i)) cls += ' chg'; if (burn.has(i)) cls += ' burn';
    out += `<polygon class="${cls}" data-i="${i}" points="${hexPts(x, y, S - 0.4)}" fill="${fill}"/>`;
    out += icon(t, castle, x, y);
    if (acting && plan.place.has(i)) out += `<circle cx="${x}" cy="${y}" r="5.6" fill="${st.players[pi].color}" stroke="#fff" stroke-width="1.2"/><text class="cnt" x="${x}" y="${y + 0.3}" font-size="7.5">${plan.place.get(i)}</text>`;
    else if (force.has(i)) { // 結果の時：だれが何人置いたか（いちばん多い人だけ）
      const f = force.get(i).sort((a, b) => b[1] - a[1])[0];
      out += `<circle cx="${x + 5}" cy="${y - 5}" r="3.6" fill="${st.players[f[0]].color}" stroke="#000" stroke-width=".6"/><text class="fc" x="${x + 5}" y="${y - 4.8}" font-size="5">${f[1]}</text>`;
    }
  });
  const pad = S + 2;
  const svg = $('#board');
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
  const key = out; if (key !== boardKey) { svg.innerHTML = out; boardKey = key; }
}
$('#board').addEventListener('click', e => { const p = e.target.closest('polygon'); if (p) tapTile(+p.dataset.i); });

// ---------- 画面の切りかえ ----------
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }
let toastT = [];
function toast(t, ms = 2600) { const d = document.createElement('div'); d.textContent = t; $('#toast').append(d); while ($('#toast').children.length > 5) $('#toast').firstChild.remove(); toastT.push(setTimeout(() => d.remove(), ms)); }
let seenReveal = '', seenEnd = '', lastTick = -1;
function render() {
  if (!room) { show('home'); return; }
  const st = room.state;
  if (!st) return renderLobby();
  if (st.phase === 'end') return renderEnd();
  show('game');
  const pi = room.meIndex();
  if (pi >= 0) planFor(st);
  // 結果が出た時
  if (st.step === 'reveal' && st.last && seenReveal !== st.gid + ':' + st.last.round) {
    seenReveal = st.gid + ':' + st.last.round; $('#toast').innerHTML = '';
    for (const l of st.last.log) toast(l.text, 4500);
    const won = {}, lost = {};
    for (const c of st.last.changed) { won[c.to] = (won[c.to] || 0) + 1; if (c.from >= 0) lost[c.from] = (lost[c.from] || 0) + 1; }
    if (pi >= 0) {
      if (won[pi]) toast(`🎉 ${won[pi]}マス取りました！`, 4500);
      if (lost[pi]) toast(`😱 ${lost[pi]}マス取られました…`, 4500);
      (won[pi] ? sfx.win : lost[pi] ? sfx.lose : sfx.tap)();
    }
  }
  drawBoard();
  renderTop(); renderChips(); renderPanel();
}
function renderTop() {
  const st = room.state, pi = room.meIndex();
  $('#gRound').textContent = `${Math.min(st.round, st.rounds)}/${st.rounds}`;
  $('#gStep').textContent = st.step === 'reveal' ? '結果' : '作戦';
  const sec = Math.ceil(room.remain() / 1000);
  $('#gTime').textContent = sec;
  $('.timer').classList.toggle('hurry', st.step === 'plan' && sec <= 5);
  if (pi >= 0) {
    $('#gTroops').textContent = canAct() ? `${totalTroops(st, pi) - used()}` : G.baseTroops(st, pi);
    $('#gScore').textContent = G.score(st, pi);
  } else { $('#gTroops').textContent = '-'; $('#gScore').textContent = '-'; }
}
function renderChips() {
  const st = room.state;
  const rk = G.ranking(st);
  $('#players').innerHTML = rk.map(r => {
    const p = st.players[r.pi], off = !room.online(p.id), done = st.step === 'plan' && room.got.includes(p.id);
    return `<span class="${p.id === myId ? 'me' : ''} ${off ? 'off' : ''}"><i class="dot" style="background:${p.color}"></i>${esc(p.name)} ${r.score}${done ? ' ✓' : ''}</span>`;
  }).join('');
}
function renderPanel() {
  const st = room.state, pi = room.meIndex();
  const hint = $('#hint'), hand = $('#hand'), btn = $('#btnGo');
  if (pi < 0) {
    hint.textContent = room.members.findIndex(m => m.id === myId) >= MAX_PLAYERS + 4 ? '満員なので見学しています' : '次のラウンドから参加します。お城がもらえます！';
    hand.innerHTML = ''; btn.disabled = true; btn.textContent = '待っています'; $('#btnUndo').disabled = true; return;
  }
  const p = st.players[pi], acting = canAct();
  hand.innerHTML = p.hand.length ? p.hand.map((k, i) => { const c = G.CARDS[k]; return `<button data-h="${i}" class="${plan.card && plan.card.i === i ? 'sel' : ''}" ${acting ? '' : 'disabled'}><span class="ic">${c.icon}</span>${c.name}</button>`; }).join('') : '<div class="empty">カードはありません</div>';
  $('#btnUndo').disabled = !acting;
  if (!acting) {
    btn.disabled = true; btn.classList.remove('done'); btn.textContent = '結果発表中';
    const top = G.ranking(st)[0];
    hint.textContent = st.step === 'reveal' ? `光ったマスが変わったところ。いま1位：${top.name}（${top.score}点）` : '';
    return;
  }
  btn.disabled = false;
  btn.classList.toggle('done', plan.sent && !plan.dirty);
  btn.textContent = plan.sent ? (plan.dirty ? '決定しなおす' : '決定ずみ ✓') : '決定';
  const left = totalTroops(st, pi) - used();
  if (plan.targeting) hint.textContent = `${G.CARDS[plan.card.k].icon} ${G.CARDS[plan.card.k].name}：${G.CARDS[plan.card.k].target === 'own' ? '守りたい自分のマス' : '燃やしたいマス'}をタップ`;
  else if (plan.card) hint.textContent = `${G.CARDS[plan.card.k].icon} ${G.CARDS[plan.card.k].text}` + (plan.card.k === 'dice' ? `（出た目：${G.diceRoll(st.seed, st.round, pi)}）` : '') + `／のこり兵 ${left}`;
  else if (G.landOf(st, pi) === 0) hint.textContent = `ふっかつ！ だれのものでもない好きなマスに兵を置けます（のこり ${left}）`;
  else if (left > 0) hint.textContent = `光っているマスをタップして兵を置こう（のこり ${left}）。カードをタップすると使えます`;
  else hint.textContent = plan.sent ? 'ほかの人を待っています…' : '兵を置ききりました。「決定」を押そう';
}
function renderLobby() {
  show('lobby');
  $('#lobbyCode').textContent = room.code;
  const host = room.isHost(), ms = room.members;
  $('#lobbyCount').textContent = `${ms.length}人` + (ms.length > MAX_PLAYERS ? `（${MAX_PLAYERS}人まで。ほかの人は見学）` : '');
  $('#lobbyList').innerHTML = ms.map((m, i) => `<li><i class="dot" style="background:${G.COLORS[i % G.COLORS.length]}"></i>${esc(m.name)}${m.id === room.hostId() ? ' 👑' : ''}${m.id === myId ? '（自分）' : ''}</li>`).join('');
  $('#hostBox').hidden = !host; $('#lobbyWait').hidden = host;
  for (const b of $('#roundsSeg').children) b.classList.toggle('on', +b.dataset.r === room.lobby.rounds);
  $('#btnStart').textContent = ms.length < 2 ? 'はじめる（1人で練習）' : `${Math.min(ms.length, MAX_PLAYERS)}人ではじめる`;
}
function renderEnd() {
  show('end');
  const st = room.state, rk = G.ranking(st);
  const k = st.gid; if (seenEnd !== k) { seenEnd = k; sfx.end(); }
  $('#rank').innerHTML = rk.map((r, i) => `<li><span class="no">${i === 0 ? '👑' : i + 1}</span><i class="dot" style="background:${r.color}"></i><span class="nm">${esc(r.name)}${st.players[r.pi].id === myId ? '（自分）' : ''}</span><span class="sc">${r.score}点</span></li>`).join('');
  $('#btnAgain').hidden = !room.isHost(); $('#endWait').hidden = room.isHost();
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 時間の表示と、時間切れ前の自動決定
setInterval(() => {
  if (!room || !room.state || room.state.phase === 'end') return;
  renderTop();
  if (canAct()) {
    const sec = Math.ceil(room.remain() / 1000);
    if (sec <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; sfx.tick(); }
    if (room.remain() < 900 && (plan.dirty || (!plan.sent && plan.order.length))) go(); // 置いた兵を、時間切れでむだにしない
  }
}, 250);

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
$('#btnStart').onclick = () => { room.start(); sfx.go(); };
$('#btnAgain').onclick = () => room.backToLobby();
$('#btnUndo').onclick = undo; $('#btnGo').onclick = go;
$('#hand').onclick = e => { const b = e.target.closest('button'); if (b) tapCard(+b.dataset.h); };
$('#btnZoom').onclick = () => { const z = $('#boardWrap').classList.toggle('zoom'); $('#btnZoom').textContent = z ? '全体' : '拡大'; };
$('#helpCards').innerHTML = Object.values(G.CARDS).map(c => `<li>${c.icon} <b>${c.name}</b>：${c.text}</li>`).join('');
$('#btnHelp').onclick = () => $('#help').showModal();
$('#btnMHelp').onclick = () => { $('#menu').close(); $('#help').showModal(); };
$('#btnMenu').onclick = () => { $('#menuCode').textContent = room?.code || ''; $('#btnSound').textContent = '音：' + (sound ? 'オン' : 'オフ'); $('#menu').showModal(); };
$('#btnSound').onclick = () => { sound = !sound; store.set('sound', sound ? '1' : '0'); $('#btnSound').textContent = '音：' + (sound ? 'オン' : 'オフ'); };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__rl = { get room() { return room; }, render }; // 試験用
