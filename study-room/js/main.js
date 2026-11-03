// 画面の流れ：ログイン →（一括ダウンロード）→ 部屋（ホーム）
// 下のアイコン：部屋／模様がえ／解く／図鑑／メニュー（記録・フレンド・設定・管理者）
import { Room3D, moodNow } from './room3d.js';
import { ROOMS, roomDef, STYLES, styleDef, homeOf, VILLA_MIN_ITEMS } from './rooms.js';
import { GENRES, ITEMS, itemById, itemsOf, SPECIAL_IDS, STARTER } from './items.js';
import { icon, GENRE_ICON, SUBJECT_ICON } from './icons.js';
import { thumbHTML, hydrateThumbs } from './thumbs.js';
import { loadModel } from './loaders.js';
import { validProblems, SYMBOLS } from './problems.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import * as DL from './download.js';
import * as Sync from './sync.js';
import { rpc } from './cloud.js';

const SUBJECTS = [
  { id: 'physics', name: '物理', ready: true },
  { id: 'math2b', name: '数学II・B' },
  { id: 'english', name: '英語コミュ' },
  { id: 'logic-en', name: '論理表現' },
  { id: 'chem', name: '化学' },
  { id: 'jp', name: '論理国語' },
  { id: 'classic', name: '古典探究' },
  { id: 'geo', name: '地理総合' },
];
const PROBLEMS = validProblems();
const byId = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));
const UNITS = ['力学', '熱', '波動', '電磁気'];
const COLORS = ['#ff8a5b', '#4fc3f7', '#c792ea', '#9ccc65', '#ffd54f', '#f06292', '#4db6ac'];
const SURFACE_KINDS = [['wall', '壁'], ['floor', '床'], ['door', 'ドア'], ['window', '窓'], ['curtain', 'カーテン']];

const app = document.getElementById('app');
const canvas = document.getElementById('room');
let room3d = null;
let user = null;
let subjectId = 'physics';
let visiting = null; // フレンドの部屋を見ているとき { username, house, current }

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* なし */ } }
function sub() { return S.subject(subjectId); }
const HS = () => S.house();
const isAdmin = () => Auth.isAdmin();
const rankNow = () => S.rankInfo();
function closeSheets() { app.querySelectorAll('.sheet, .float-bar').forEach(e => e.remove()); }
function sheet(html, cls = '') {
  closeSheets();
  const el = h(`<div class="sheet ${cls}"><div class="grab"></div>${html}</div>`);
  app.append(el);
  hydrateThumbs(el);
  return el;
}

// =========================== ログイン ===========================
function showLogin(mode = 'login') {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card login">
        <h1 class="brand">ROOMIN</h1>
        <p class="sub">問題を解くと、部屋ができていく</p>
        <form>
          <label>ユーザー名<input name="name" autocomplete="username" required maxlength="16"></label>
          <label>パスワード<input name="pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
          <p class="err"></p>
          <button class="btn primary big" type="submit">${mode === 'login' ? 'ログイン' : '登録してはじめる'}</button>
        </form>
        <button class="link swap">${mode === 'login' ? 'はじめての人は、こちらで登録' : 'もう登録している人は、ログイン'}</button>
        <p class="note">記録はネット上に保存されます。どのスマホ・パソコンからでも、同じユーザー名とパスワードで続きから遊べます。</p>
      </div>
    </div>`);
  app.append(el);
  el.querySelector('.swap').onclick = () => showLogin(mode === 'login' ? 'signup' : 'login');
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = el.querySelector('.err');
    err.textContent = '';
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = mode === 'login' ? await Auth.logIn(f.name.value, f.pw.value) : await Auth.signUp(f.name.value, f.pw.value);
      S.useUser(r.id);
      await Sync.adopt(r.data);
      if (r.moved) toast('この端末の記録を、ネットに引っ越しました', 3000);
      startAs(Auth.currentUser());
    } catch (ex) { err.textContent = ex.message; vibrate(80); btn.disabled = false; }
  };
}

function startAs(u) {
  user = u;
  S.useUser(u.id);
  visiting = null;
  if (room3d) room3d.roomDef = null; // 別の人の家を出しっぱなしにしない
  if (DL.canDownload() && !DL.downloadState()) showDownload(); else enterHouse();
}

// =========================== 下のアイコン列 ===========================
function tabbar(active) {
  const st = sub();
  const resume = st.session && st.session.idx < st.session.set.length;
  const due = S.stats(st, PROBLEMS).due;
  const tabs = [['room', 'home', '部屋'], ['edit', 'sofa', '模様がえ'], ['play', 'pencil', resume ? '続きから' : '解く'], ['zukan', 'book', '図鑑'], ['menu', 'gear', 'メニュー']];
  const el = h(`<nav class="tabbar">${tabs.map(([k, ic, n]) => `
    <button data-t="${k}" class="${k === active ? 'on' : ''} ${k === 'play' ? 'center' : ''}">
      <span class="ti">${icon(ic)}${k === 'play' && (resume || due || !S.playedToday()) ? '<i class="dot"></i>' : ''}${k === 'menu' && friendBadge ? '<i class="dot"></i>' : ''}</span><span class="tl">${n}</span>
    </button>`).join('')}</nav>`);
  el.querySelectorAll('button').forEach(b => b.onclick = () => goTab(b.dataset.t));
  return el;
}
function goTab(t) {
  if (visiting) leaveVisit(false);
  if (t === 'room') return showHome();
  if (t === 'edit') return showEdit();
  if (t === 'play') return chooseSubject();
  if (t === 'zukan') return showZukan();
  if (t === 'menu') return showMenu();
}

// =========================== 部屋（ホーム） ===========================
// 別荘が開く条件：家の部屋が全部開いていて、どの部屋にも家具を6個以上置いている
const MAIN_ROOMS = ROOMS.filter(r => r.home === 'main');
function villaLack(hs = HS()) {
  return MAIN_ROOMS.map(d => ({ d, n: (hs.rooms.find(x => x.id === d.id)?.placed || []).length, open: hs.rooms.some(x => x.id === d.id) }))
    .filter(x => !x.open || x.n < VILLA_MIN_ITEMS);
}
function ensureRooms() {
  const hs = HS();
  // ランクで開いた部屋を足す
  const rank = rankNow().rank;
  const added = [];
  const curId = hs.rooms[hs.current || 0]?.id;
  const has = (id) => hs.rooms.some(x => x.id === id);
  const addRoom = (d) => {
    // 部屋ごとの最初の壁・床（お風呂のタイルなど）は持ち物にも入れる
    for (const id of Object.values(d.surf || {})) if (id && !S.owned(id)) S.own(id);
    hs.rooms.push({ id: d.id, style: null, surf: { ...STARTER, ...(d.surf || {}) }, placed: [] });
    added.push(d);
  };
  for (const r of MAIN_ROOMS) if (r.unlock <= rank && !has(r.id)) addRoom(r);
  if (!hs.villa && !villaLack(hs).length) { hs.villa = true; hs.villaNew = true; }
  if (hs.villa) for (const r of ROOMS) if (r.home === 'villa' && !has(r.id)) addRoom(r);
  if (!hs.rooms.length) addRoom(ROOMS[0]);
  for (const r of hs.rooms) {
    r.surf = r.surf || { ...STARTER, ...(roomDef(r.id).surf || {}) };
    r.placed = r.placed || [];
  }
  // 並びは部屋の一覧の順（今いる部屋はそのまま）
  const order = (id) => { const i = ROOMS.findIndex(x => x.id === id); return i < 0 ? 999 : i; };
  hs.rooms.sort((x, y) => order(x.id) - order(y.id));
  // 最初から持っている物
  for (const id of Object.values(STARTER)) if (id && !S.owned(id)) S.own(id);
  if (!hs.started) {
    hs.started = true;
    hs.gauge = Math.max(hs.gauge, S.gaugeMax(hs)); // 最初の1つはプレゼント
  }
  const ci = hs.rooms.findIndex(x => x.id === curId);
  hs.current = ci >= 0 ? ci : Math.min(hs.current || 0, hs.rooms.length - 1);
  S.save();
  return added;
}
function curRoom() { return HS().rooms[HS().current]; }
function curDef() { return roomDef(curRoom().id); }

async function enterHouse() {
  const added = ensureRooms();
  if (!room3d) {
    room3d = new Room3D(canvas);
    setInterval(() => room3d.refreshMood(), 60e3);
  }
  room3d.onDoor = goThroughDoor;
  room3d.onSelect = onSelectItem;
  room3d.onPlacedChange = () => S.save();
  room3d.onInvalid = () => { toast('そこには置けません（ほかの家具や壁と重なります）'); vibrate(40); };
  canvas.classList.remove('dim');
  room3d.setActive(true);
  showHome();
  await room3d.show(curDef(), curRoom());
  receiveSpecials();
  showLoginBonus();
  if (added.length > 1) toast(`新しい部屋「${added.map(r => r.name).join('・')}」が開きました`, 3000);
  if (!curRoom().style) askStyle();
}

function remainCapacity(room = curRoom()) {
  return S.capacity() - (room.placed || []).length;
}

let notesChecked = false;
function showHome() {
  if (visiting) return showVisit();
  room3d?.setActive(true);
  room3d?.setEditMode(false);
  canvas.classList.remove('dim');
  const hs = HS();
  const r = curRoom(), def = curDef();
  const max = S.gaugeMax(hs);
  const canBuy = hs.gauge >= max || hs.tickets > 0;
  const need = Math.max(1, Math.ceil((max - hs.gauge) / 24));
  const rk = rankNow();
  const home = homeOf(r.id);
  const here = hs.rooms.map((rr, i) => ({ rr, i })).filter(x => homeOf(x.rr.id) === home);
  const locked = home === 'main' ? MAIN_ROOMS.filter(x => !hs.rooms.some(y => y.id === x.id)) : [];
  const homeBtn = home === 'villa'
    ? `<button class="homebtn" data-home="main">${icon('home')}家へ</button>`
    : hs.villa ? `<button class="homebtn villa" data-home="villa">${icon('palm')}別荘へ</button>`
      : `<button class="locked villa-lock">${icon('lock')}別荘<small>全部屋に${VILLA_MIN_ITEMS}個</small></button>`;
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <header class="hud">
        <div class="room-name">
          <span class="rn-ic">${icon(def.icon)}</span>
          <span class="rn-t">${def.name}<small>${r.style ? styleDef(r.style).name + '・' : ''}置いている ${r.placed.length} / ${S.capacity()}</small></span>
        </div>
        <button class="rankchip" aria-label="ランク">
          <span class="lv">Lv<b>${rk.rank}</b></span>
          <span class="xpbar"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></span>
        </button>
        <div class="streak ${S.playedToday() ? 'on' : ''}">${icon('flame')}<b>${S.currentStreak()}</b></div>
      </header>
      <div class="side-tools">
        <button class="round photo" aria-label="写真をとる">${icon('camera')}</button>
        <button class="round friends" aria-label="フレンド">${icon('users')}${friendBadge ? '<i class="dot"></i>' : ''}</button>
      </div>
      <nav class="rooms">${home === 'villa' ? homeBtn : ''}${here.map(({ rr, i }) => {
        const d = roomDef(rr.id);
        return `<button data-i="${i}" class="${i === hs.current ? 'on' : ''}">${icon(d.icon)}${d.name}</button>`;
      }).join('')}${locked.slice(0, 1).map(x => `<button class="locked next-lock" data-lv="${x.unlock}" data-n="${x.name}">${icon('lock')}${x.name}<small>Lv${x.unlock}</small></button>`).join('')}${home === 'main' ? homeBtn : ''}</nav>
      <div class="hint">なぞると見回す・床をタップで歩く・ドアで別の部屋へ</div>
      <div class="dock">
        ${canBuy ? `<button class="btn gold big buy">${icon('gift')}家具を買う${hs.tickets > 0 && hs.gauge < max ? `<small>引きかえ券 ${hs.tickets}枚</small>` : ''}</button>` : ''}
        <div class="gauge ${hs.gauge >= max ? 'full' : ''}">
          <div class="fill" style="width:${Math.min(100, hs.gauge / max * 100)}%"></div>
          <span>${hs.gauge >= max ? '満タン！ 家具を1つ買えます' : `次の家具まで あと${need}問くらい`}</span>
        </div>
        ${isAdmin() && hs.gauge < max ? `<button class="link testfill">${icon('sparkle')}管理者：ゲージを満タンにする</button>` : ''}
      </div>
    </div>`);
  el.querySelector('.buy')?.addEventListener('click', () => buyFlow());
  el.querySelector('.testfill')?.addEventListener('click', () => { hs.gauge = max; S.save(); showHome(); });
  el.querySelector('.photo').onclick = photoMode;
  el.querySelector('.friends').onclick = showFriends;
  el.querySelector('.rankchip').onclick = showRecords;
  el.querySelectorAll('.rooms button[data-i]').forEach(b => b.onclick = () => switchRoom(+b.dataset.i));
  el.querySelector('.next-lock')?.addEventListener('click', e => { const b = e.currentTarget; toast(`「${b.dataset.n}」は Lv${b.dataset.lv} で開きます`, 2600); });
  el.querySelector('.villa-lock')?.addEventListener('click', () => toast(villaHint(), 4200));
  el.querySelector('.homebtn')?.addEventListener('click', e => goHome(e.currentTarget.dataset.home));
  app.append(el, tabbar('room'));
  scrollRoomsNav(el);
  if (!notesChecked) { notesChecked = true; checkUpdateNotes(); }
  if (hs.villaNew) celebrateVilla();
}
// 部屋のボタンが多いので、今の部屋が見える所まで横に送る
function scrollRoomsNav(el) {
  const nav = el.querySelector('.rooms'), on = nav?.querySelector('.on');
  if (nav && on) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2;
}
function villaHint() {
  const lack = villaLack();
  const closed = lack.filter(x => !x.open);
  if (closed.length) return `家の部屋が全部開いて（Lv${Math.max(...closed.map(x => x.d.unlock))}）、どの部屋にも家具を${VILLA_MIN_ITEMS}個以上置くと、別荘が開きます`;
  return `あと少し！ 家具を${VILLA_MIN_ITEMS}個置くと別荘が開きます：${lack.map(x => `${x.d.name}（あと${VILLA_MIN_ITEMS - x.n}個）`).join('・')}`;
}
// 別荘が開いたお祝い（1回だけ）
function celebrateVilla() {
  const hs = HS();
  hs.villaNew = false; S.save();
  vibrate([40, 60, 40, 60, 120]);
  const vr = ROOMS.filter(r => r.home === 'villa');
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('palm')}</span><div><h3>別荘ができました！</h3><p>家の部屋を全部かざったごほうびです</p></div></div>
    <ul class="news-list">${vr.map(r => `<li>${icon(r.icon)}${esc(r.name)}</li>`).join('')}</ul>
    <button class="btn gold big go">${icon('palm')}別荘へ行く</button>
    <button class="btn ghost later">あとで</button>`, 'villa-sheet');
  el.querySelector('.go').onclick = () => { el.remove(); goHome('villa'); };
  el.querySelector('.later').onclick = () => el.remove();
}
// 家と別荘を行き来する（前にいた部屋へ）
async function goHome(home) {
  const hs = HS();
  if (room3d?.editMode) return;
  hs.lastIn = hs.lastIn || {};
  hs.lastIn[homeOf(curRoom().id)] = curRoom().id;
  let i = hs.rooms.findIndex(r => r.id === hs.lastIn[home]);
  if (i < 0) i = hs.rooms.findIndex(r => homeOf(r.id) === home);
  if (i < 0) return;
  canvas.classList.add('fade');
  await new Promise(r => setTimeout(r, 350));
  await switchRoom(i);
  canvas.classList.remove('fade');
  if (home === 'villa') toast('別荘に来ました。ドアで別荘の部屋をめぐれます', 2800);
}

async function switchRoom(i) {
  HS().current = i; S.save();
  showHome();
  await room3d.show(curDef(), curRoom());
  if (!curRoom().style) askStyle();
}

// ドアを通って、となりの部屋へ
async function goThroughDoor() {
  if (visiting) {
    const rooms = visiting.house.rooms;
    const home = homeOf(rooms[visiting.current].id);
    const idx = rooms.map((r, i) => i).filter(i => homeOf(rooms[i].id) === home);
    if (idx.length < 2) return toast('ほかの部屋はまだありません');
    canvas.classList.add('fade');
    await new Promise(r => setTimeout(r, 350));
    visiting.current = idx[(idx.indexOf(visiting.current) + 1) % idx.length];
    showVisit();
    canvas.classList.remove('fade');
    return;
  }
  const hs = HS();
  if (app.querySelector('.sheet') || room3d.editMode) return;
  // 同じ家（家 or 別荘）の部屋だけを順にめぐる
  const home = homeOf(curRoom().id);
  const idx = hs.rooms.map((r, i) => i).filter(i => homeOf(hs.rooms[i].id) === home);
  if (idx.length < 2) {
    const next = MAIN_ROOMS.find(x => !hs.rooms.some(y => y.id === x.id));
    toast(next ? `ドアの向こうは「${next.name}」。Lv${next.unlock}で開きます` : 'ほかの部屋はまだありません', 3000);
    return;
  }
  canvas.classList.add('fade');
  await new Promise(r => setTimeout(r, 350));
  await switchRoom(idx[(idx.indexOf(hs.current) + 1) % idx.length]);
  canvas.classList.remove('fade');
}

// 新しい部屋の雰囲気をえらぶ（選ぶと壁と床がその場で変わる）
function askStyle() {
  const r = curRoom(), def = curDef();
  let picked = null;
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon(def.icon)}</span><div><h3>${def.name}の雰囲気</h3><p>家具を買うとき、この雰囲気に合う物が出やすくなります</p></div></div>
    <div class="stylegrid">${STYLES.map(s => `
      <button class="stylecard" data-s="${s.id}">
        <span class="sw" style="${swatchCSS(s)}"></span>
        <b>${s.name}</b><span>${s.desc}</span>
      </button>`).join('')}</div>
    <button class="btn gold big ok" disabled>この雰囲気にする</button>`, 'style-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelectorAll('.stylecard').forEach(b => b.onclick = async () => {
    picked = b.dataset.s;
    el.querySelectorAll('.stylecard').forEach(x => x.classList.toggle('on', x === b));
    el.querySelector('.ok').disabled = false;
    // お風呂・和室などは、壁と床はそのまま（家具の選ばれ方だけ変わる）
    if (!def.keepSurf) await room3d.previewSurfaces(styleDef(picked).preview);
  });
  el.querySelector('.ok').onclick = async () => {
    r.style = picked;
    // 雰囲気の壁と床が図鑑にあれば、持ち物に入れてそのまま使う
    const pv = styleDef(picked).preview;
    for (const kind of def.keepSurf ? [] : ['wall', 'floor']) {
      const it = matchSurface(kind, pv[kind]);
      if (it) { S.own(it.id); r.surf[kind] = it.id; }
    }
    S.save();
    el.remove();
    await room3d.previewSurfaces(null);
    showHome();
    toast(`${styleDef(picked).name}の${def.name}にしました`);
  };
}
function swatchCSS(s) {
  const w = s.preview.wall.color || '#9a958d';
  const f = { oak_wood_planks: '#c79a63', old_wood_floor: '#6b5544', wood_floor_worn: '#7a5636', large_grey_tiles: '#a9a9a6' }[s.preview.floor.tex] || '#a8927a';
  return `background: linear-gradient(180deg, ${w} 0 62%, ${f} 62% 100%)`;
}
function matchSurface(kind, src) {
  if (!src) return null;
  return ITEMS.find(i => i.place === 'surface' && i.surface === kind && ((src.color && i.src.color === src.color) || (src.tex && i.src.tex === src.tex)));
}

// =========================== 家具を買う ===========================
function pickCandidates(genre, style) {
  const pool = itemsOf(genre).filter(i => !i.special && !i.rare && !S.owned(i.id)); // レアな物はガチャだけ
  const match = S.shuffle(pool.filter(i => style && i.styles?.includes(style)));
  const other = S.shuffle(pool.filter(i => !(style && i.styles?.includes(style))));
  // 3つのうち2つは部屋の雰囲気に合う物（足りなければほかから）
  const out = [...match.slice(0, 2)];
  for (const i of [...other, ...match.slice(2)]) { if (out.length >= 3) break; if (!out.includes(i)) out.push(i); }
  return S.shuffle(out);
}

// 買える1回分の候補：ジャンル3つ（その部屋にまだ無いジャンルほど出やすい）と、ジャンルごとの家具3つ。
// 画面を閉じたり開き直したりしても変わらない（買うまで保存しておく）
function buyable(i) { return !i.special && !i.rare && !S.owned(i.id); }
function currentOffer() {
  const hs = HS();
  const ok = (o) => o && o.genres?.length && o.genres.every(g => itemsOf(g).some(buyable));
  if (ok(hs.offer)) return hs.offer;
  const room = curRoom();
  const inRoom = new Set((room.placed || []).map(p => itemById(p.item)?.genre).concat(Object.values(room.surf || {}).filter(Boolean).map(id => itemById(id)?.genre)));
  let pool = GENRES.filter(g => itemsOf(g.id).some(buyable)).map(g => ({ g: g.id, w: inRoom.has(g.id) ? 1 : 3 }));
  const genres = [];
  while (genres.length < 3 && pool.length) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    const k = pool.findIndex(x => (r -= x.w) < 0);
    genres.push(pool[k].g);
    pool.splice(k, 1);
  }
  hs.offer = { genres, cands: {} };
  S.save();
  return hs.offer;
}
function offerCands(genre) {
  const o = currentOffer();
  let ids = (o.cands[genre] || []).filter(id => { const it = itemById(id); return it && buyable(it); });
  if (!ids.length) {
    ids = pickCandidates(genre, curRoom().style).map(i => i.id);
    o.cands[genre] = ids;
    S.save();
  }
  return ids.map(itemById);
}

function buyFlow() {
  const o = currentOffer();
  if (!o.genres.length) return toast('買える家具はもう全部そろっています');
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('gift')}</span><div><h3>何を買いますか？</h3><p>ジャンルを1つ選ぶと、3つの中から1つ選べます</p></div></div>
    <div class="genregrid three">${o.genres.map(gid => {
      const g = GENRES.find(x => x.id === gid);
      const all = itemsOf(gid).filter(i => !i.special && !i.rare);
      const have = all.filter(i => S.owned(i.id)).length;
      const fresh = !curRoom().placed.some(p => itemById(p.item)?.genre === gid);
      return `<button class="genre" data-g="${gid}">
        <span class="g-ic">${icon(GENRE_ICON[gid] || 'box')}</span><b>${g.name}</b><small>${have}/${all.length}</small>${fresh ? '<i class="g-new">この部屋にまだない</i>' : ''}</button>`;
    }).join('')}</div>
    <button class="link close">あとで</button>`, 'buy-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelectorAll('.genre').forEach(b => b.onclick = () => chooseCandidate(b.dataset.g));
}

function chooseCandidate(genreId) {
  const g = GENRES.find(x => x.id === genreId);
  const cands = offerCands(genreId);
  if (!cands.length) return toast('このジャンルは全部そろっています');
  // 選ぶ前から、3つのデータを裏で読み込んでおく（置くときに待たない）
  for (const it of cands) if (it.src.model) loadModel(it.src.model).catch(() => {});
  let picked = null;
  const el = sheet(`
    <div class="sh-head"><button class="sh-back">${icon('back')}</button><div><h3>${g.name}</h3><p>どれを買いますか？</p></div></div>
    <div class="candgrid">${cands.map(it => `
      <button class="cand ${it.rare ? 'rare' : ''}" data-id="${it.id}">
        <span class="thumb">${thumbHTML(it)}</span>
        ${it.rare ? `<span class="badge-rare">${icon('star')}レア</span>` : ''}
        <b>${esc(it.name)}</b>
        <span class="chips">${(it.styles || []).map(s => `<i>${styleDef(s).name}</i>`).join('')}</span>
      </button>`).join('')}</div>
    <button class="btn gold big ok" disabled>${icon('check')}これを買う</button>`, 'cand-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.sh-back').onclick = buyFlow;
  el.querySelectorAll('.cand').forEach(b => b.onclick = () => {
    picked = itemById(b.dataset.id);
    el.querySelectorAll('.cand').forEach(x => x.classList.toggle('on', x === b));
    el.querySelector('.ok').disabled = false;
  });
  el.querySelector('.ok').onclick = async () => {
    if (!picked) return;
    const hs = HS();
    const max = S.gaugeMax(hs);
    if (hs.gauge >= max) { hs.gauge -= max; hs.unlocks++; } else if (hs.tickets > 0) hs.tickets--; else return;
    hs.offer = null; // 次に買うときは、新しい候補
    S.own(picked.id);
    el.remove();
    vibrate([30, 40, 60]);
    await putIntoRoom(picked, true);
    S.save();
    showHome();
  };
}

// 持ち物から部屋へ（壁紙などはその場で変える）
async function putIntoRoom(item, justBought) {
  const r = curRoom();
  if (item.place === 'surface') {
    r.surf[item.surface] = item.id;
    S.save();
    await room3d.buildShell();
    toast(`${item.name}に変えました`);
    return true;
  }
  if (remainCapacity(r) <= 0) {
    toast(justBought ? `持ち物に入れました（この部屋に置ける数がいっぱい。Lvが上がると増えます）` : `置ける数がいっぱいです（Lv${rankNow().rank}：${S.capacity()}個）`, 3200);
    return false;
  }
  if (S.placedCount(item.id) >= S.owned(item.id)) { toast('もう全部置いています'); return false; }
  const p = { uid: S.newUid(), item: item.id, ...room3d.suggestPlacement(item) };
  r.placed.push(p);
  S.save();
  await room3d.addPlaced(p);
  S.save(); // 置いた位置を直した値で保存
  if (!HS().villa) ensureRooms(); // 家具がそろったら別荘が開く
  toast(justBought ? `${item.name}を置きました。模様がえで動かせます` : `${item.name}を置きました`, 2600);
  return true;
}

// ログインボーナス：その日はじめて開いたとき、30日のカレンダーを出してスタンプ
function showLoginBonus() {
  const got = S.claimLoginBonus();
  if (!got) return;
  S.save();
  const cells = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1, r = S.loginBonusDay(n);
    const cls = [n < got.day ? 'done' : '', n === got.day ? 'today' : '', r.kind !== 'gauge' ? 'big ' + r.kind : ''].join(' ');
    const ic = r.kind === 'ticket4' ? icon('trophy') : r.kind === 'ticket' ? icon('star') : icon('gift');
    return `<div class="lb-cell ${cls}"><small>${n}</small>${ic}${n <= got.day ? `<i class="stamp">${icon('check')}</i>` : ''}</div>`;
  }).join('');
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic gold">${icon('gift')}</span><div><h3>ログインボーナス ${got.day}日目</h3><p>5日ごとにレアチケット、30日目は★4以上確定チケット</p></div></div>
    <div class="lb-grid">${cells}</div>
    <div class="lb-get">${icon(got.reward.kind === 'gauge' ? 'gift' : got.reward.kind === 'ticket4' ? 'trophy' : 'star')}<b>${got.reward.label}</b>をもらいました</div>
    <button class="btn gold big ok">${icon('check')}受けとる</button>`, 'lb-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.ok').onclick = () => { el.remove(); showHome(); };
}

// 克服のごほうび（特別な家具）を持ち物に入れる
function receiveSpecials() {
  const hs = HS();
  while (hs.pendingSpecials > 0) {
    const id = SPECIAL_IDS[hs.specialsGiven % SPECIAL_IDS.length];
    hs.specialsGiven++; hs.pendingSpecials--;
    const it = itemById(id);
    if (it) { S.own(id); toast(`特別な家具「${it.name}」が届きました（持ち物）`, 3200); }
  }
  S.save();
}

// =========================== 模様がえ ===========================
function showEdit() {
  if (!room3d) return;
  closeSheets();
  showHome();
  app.querySelector('.dock')?.remove();
  app.querySelector('.side-tools')?.remove();
  app.querySelector('.hint')?.remove();
  app.querySelector('.tabbar .on')?.classList.remove('on');
  app.querySelector('.tabbar [data-t=edit]')?.classList.add('on');
  room3d.setEditMode(true);
  const bar = h(`
    <div class="editbar">
      <div class="eb-top"><b>${icon('sofa')}模様がえ</b><span class="cap">置いている <b>${curRoom().placed.length}</b> / ${S.capacity()}</span></div>
      <p class="eb-hint">家具をタップして選ぶ → そのまま指でなぞって動かす</p>
      <div class="eb-btns">
        <button class="btn ghost inv">${icon('box')}持ち物</button>
        <button class="btn ghost surf">${icon('brush')}壁・床・ドア・窓</button>
        <button class="btn primary done">${icon('check')}完了</button>
      </div>
    </div>`);
  bar.querySelector('.inv').onclick = showInventory;
  bar.querySelector('.surf').onclick = showSurfaces;
  bar.querySelector('.done').onclick = () => { room3d.setEditMode(false); S.save(); showHome(); };
  app.querySelector('.home').append(bar);
}
function refreshEditCount() {
  const c = app.querySelector('.editbar .cap b');
  if (c) c.textContent = curRoom().placed.length;
}
function onSelectItem(uid) {
  app.querySelector('.float-bar')?.remove();
  if (!uid || !room3d.editMode) return;
  const p = curRoom().placed.find(x => x.uid === uid);
  const it = p && itemById(p.item);
  if (!it) return;
  const fb = h(`
    <div class="float-bar">
      <span class="fb-name">${esc(it.name)}</span>
      ${it.place !== 'wall' ? `<button class="rot">${icon('rotate')}回す</button>` : ''}
      <button class="store">${icon('box')}しまう</button>
      <button class="x" aria-label="選ぶのをやめる">${icon('x')}</button>
    </div>`);
  fb.querySelector('.rot')?.addEventListener('click', () => room3d.rotateSelected());
  fb.querySelector('.store').onclick = () => {
    const r = curRoom();
    const riders = r.placed.filter(x => x.on === uid).map(x => x.uid);
    r.placed = r.placed.filter(x => x.uid !== uid && !riders.includes(x.uid));
    room3d.st = r;
    for (const u of [uid, ...riders]) room3d.removeObject(u);
    S.save();
    refreshEditCount();
    toast(`${it.name}を持ち物にしまいました`);
  };
  fb.querySelector('.x').onclick = () => room3d.select(null);
  app.querySelector('.home')?.append(fb);
}
function showInventory() {
  const inv = HS().inventory;
  const list = Object.keys(inv).map(itemById).filter(it => it && it.place !== 'surface' && S.owned(it.id) > S.placedCount(it.id));
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('box')}</span><div><h3>持ち物</h3><p>タップすると部屋に置きます（あと ${Math.max(0, remainCapacity())} 個置けます）</p></div></div>
    ${list.length ? `<div class="invgrid">${list.map(it => `
      <button class="inv-item" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b>
      ${S.owned(it.id) - S.placedCount(it.id) > 1 ? `<i class="cnt">×${S.owned(it.id) - S.placedCount(it.id)}</i>` : ''}</button>`).join('')}</div>`
      : '<p class="empty">置いていない家具はありません。問題を解いてゲージをためると、家具を買えます。</p>'}
    <button class="link close">とじる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.inv-item').forEach(b => b.onclick = async () => {
    const ok = await putIntoRoom(itemById(b.dataset.id), false);
    if (ok) { el.remove(); refreshEditCount(); room3d.select(curRoom().placed.at(-1).uid); }
  });
}
function showSurfaces(kind = 'wall') {
  const r = curRoom();
  const owned = ITEMS.filter(i => i.place === 'surface' && i.surface === kind && S.owned(i.id));
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('brush')}</span><div><h3>壁・床・ドア・窓</h3><p>持っている物から選べます</p></div></div>
    <div class="seg kinds">${SURFACE_KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="invgrid">${kind === 'curtain' ? `<button class="inv-item ${!r.surf.curtain ? 'on' : ''}" data-id=""><span class="thumb none">${icon('x')}</span><b>なし</b></button>` : ''}
      ${owned.map(it => `<button class="inv-item ${r.surf[kind] === it.id ? 'on' : ''}" data-id="${it.id}"><span class="thumb">${thumbHTML(it)}</span><b>${esc(it.name)}</b></button>`).join('')}</div>
    ${!owned.length && kind !== 'curtain' ? '<p class="empty">まだ持っていません。「家具を買う」で手に入ります。</p>' : ''}
    <button class="link close">とじる</button>`, 'inv-sheet');
  el.querySelector('.close').onclick = () => el.remove();
  el.querySelectorAll('.kinds button').forEach(b => b.onclick = () => showSurfaces(b.dataset.k));
  el.querySelectorAll('.inv-item').forEach(b => b.onclick = async () => {
    r.surf[kind] = b.dataset.id || null;
    S.save();
    el.querySelectorAll('.inv-item').forEach(x => x.classList.toggle('on', x === b));
    await room3d.buildShell();
  });
}

// =========================== 写真 ===========================
function photoMode() {
  document.body.classList.add('photo-mode');
  room3d.setEditMode(false);
  const ov = h(`
    <div class="photo-ui">
      <button class="round close" aria-label="もどる">${icon('x')}</button>
      <button class="shutter" aria-label="撮る"><i></i></button>
      <p class="ph-hint">なぞって構図を決めて、まるいボタンで撮影</p>
    </div>`);
  document.body.append(ov);
  ov.querySelector('.close').onclick = () => { ov.remove(); document.body.classList.remove('photo-mode'); };
  ov.querySelector('.shutter').onclick = async () => {
    const url = room3d.capture();
    ov.classList.add('flash'); setTimeout(() => ov.classList.remove('flash'), 300);
    const prev = h(`
      <div class="photo-preview">
        <img src="${url}" alt="撮った写真">
        <div class="pp-btns"><button class="btn primary save">${icon('download')}保存する</button><button class="btn ghost back">撮りなおす</button></div>
      </div>`);
    document.body.append(prev);
    prev.querySelector('.back').onclick = () => prev.remove();
    prev.querySelector('.save').onclick = async () => {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `heyadukuri-${Date.now()}.jpg`, { type: 'image/jpeg' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch (e) { /* 共有をやめたとき */ return; }
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
    };
  };
}

// =========================== 更新のお知らせ ===========================
async function checkUpdateNotes() {
  try {
    const v = await (await fetch('version.json', { cache: 'no-store' })).json();
    const seen = localStorage.getItem('studyroom.version');
    localStorage.setItem('studyroom.version', v.version);
    if (!seen || seen === v.version || !v.notes?.length) return;
    const el = sheet(`
      <div class="sh-head"><span class="sh-ic gold">${icon('sparkle')}</span><div><h3>新しくなりました</h3><p>バージョン ${esc(v.version)}</p></div></div>
      <ul class="news-list">${v.notes.map(n => `<li>${icon('check')}${esc(n)}</li>`).join('')}</ul>
      <button class="btn primary big ok">OK</button>`, 'news');
    el.querySelector('.ok').onclick = () => el.remove();
  } catch (e) { /* 読めなければ出さない */ }
}

// =========================== 一括ダウンロード ===========================
function showDownload() {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const mb = DL.totalMB();
  const el = h(`
    <div class="screen center">
      <div class="card dl">
        <div class="logo">${icon('download')}</div>
        <h2>家具のデータをまとめて保存</h2>
        <p>家具・壁・床などのデータ（約${mb}MB）を先にダウンロードしておくと、あとは待たずに遊べます。<br><b>Wi-Fi のときがおすすめです。</b></p>
        <div class="gauge big hide"><div class="fill" style="width:0%"></div><span>0%</span></div>
        <p class="dlnote"></p>
        <button class="btn primary big go">ダウンロードする</button>
        <button class="btn ghost later">あとで（使う分だけその場で読み込む）</button>
      </div>
    </div>`);
  app.append(el);
  const go = el.querySelector('.go'), later = el.querySelector('.later');
  const bar = el.querySelector('.gauge'), fill = bar.querySelector('.fill'), label = bar.querySelector('span');
  let job = null;
  later.onclick = () => { if (job) job.stop(); if (!DL.downloadState()) DL.setDownloadState('later'); enterHouse(); };
  go.onclick = async () => {
    go.classList.add('hide'); bar.classList.remove('hide');
    later.textContent = '中断する（続きはあとで）';
    job = DL.downloadAll((d, t, b, bt) => {
      const pct = Math.floor(b / bt * 100);
      fill.style.width = pct + '%';
      label.textContent = `${pct}%（${Math.round(b / 1e6)} / ${Math.round(bt / 1e6)}MB）`;
    });
    const r = await job.promise;
    if (r.stopped) return;
    el.querySelector('.dlnote').textContent = r.failed ? `${r.failed}個は保存できませんでした。遊ぶときにその場で読み込みます。` : '保存できました！';
    later.classList.add('hide');
    go.textContent = 'はじめる'; go.classList.remove('hide');
    go.onclick = () => enterHouse();
  };
}


// =========================== 解く：科目えらび ===========================
function chooseSubject() {
  if (!app.querySelector('.home')) showHome();
  const el = sheet(`
    <div class="sh-head"><span class="sh-ic">${icon('pencil')}</span><div><h3>どの科目を解く？</h3><p>どの科目を解いても、同じ家が育ちます</p></div></div>
    <div class="subjgrid">${SUBJECTS.map(s => {
      const st = s.ready ? S.subject(s.id) : null;
      const resume = st && st.session && st.session.idx < st.session.set.length;
      const stats = st ? S.stats(st, PROBLEMS) : null;
      const meta = !s.ready ? '準備中' : resume ? '続きから' : stats.due ? `復習 ${stats.due}問` : (!S.playedToday() ? 'ゲージ1.5倍' : '1セット5問');
      return `<button class="subj ${s.ready ? '' : 'soon'}" data-s="${s.id}" ${s.ready ? '' : 'disabled'}>
        <span class="s-ic">${icon(SUBJECT_ICON[s.id] || 'book')}</span><b>${s.name}</b><small>${meta}</small></button>`;
    }).join('')}</div>
    <button class="link close">とじる</button>`, 'subj-sheet');
  app.querySelector('.tabbar')?.classList.add('hide');
  el.querySelector('.close').onclick = () => { el.remove(); showHome(); };
  el.querySelectorAll('.subj:not(.soon)').forEach(b => b.onclick = () => { subjectId = b.dataset.s; el.remove(); startSet(); });
}

// =========================== メニュー ===========================
let friendBadge = 0;
function screenWithTabs(cls, title, active, body) {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`<div class="screen ${cls} with-tabs"><header class="bar">${title}</header>${body}</div>`);
  app.append(el, tabbar(active));
  hydrateThumbs(el);
  return el;
}
function showMenu() {
  const rk = rankNow();
  const el = screenWithTabs('menu', `<h2>メニュー</h2><span class="sync"></span>`, 'menu', `
    <section class="profile-card">
      <div class="pc-lv"><span>Lv</span><b>${rk.rank}</b></div>
      <div class="pc-main"><b>${esc(user.name)}</b>
        <div class="xpbar big"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></div>
        <small>次のLvまで ${rk.need - rk.into} XP ・ 置ける家具 ${S.capacity()}個</small></div>
    </section>
    <nav class="menu-list">
      <button data-m="records">${icon('chart')}<span>記録<small>分野ごとの成績・連続日数</small></span>${icon('chevronRight')}</button>
      <button data-m="ranking">${icon('trophy')}<span>週間ランキング<small>今週解いた問題の数（月曜の朝6時で区切り）</small></span>${icon('chevronRight')}</button>
      <button data-m="friends">${icon('users')}<span>フレンド<small>申請・フレンドの部屋を見に行く</small></span>${friendBadge ? `<i class="badge">${friendBadge}</i>` : ''}${icon('chevronRight')}</button>
      <button data-m="settings">${icon('gear')}<span>設定<small>画質・データ・ログアウト</small></span>${icon('chevronRight')}</button>
      ${isAdmin() ? `<button data-m="admin">${icon('shield')}<span>管理者<small>みんなの記録と部屋</small></span>${icon('chevronRight')}</button>` : ''}
    </nav>`);
  el.querySelectorAll('.menu-list button').forEach(b => b.onclick = () => ({ records: showRecords, ranking: showRanking, friends: showFriends, settings: showSettings, admin: showAdmin })[b.dataset.m]());
  paintSync();
}

// =========================== 記録 ===========================
function showRecords() {
  const rk = rankNow(), pf = S.profile(), st = sub();
  const s = S.stats(st, PROBLEMS);
  const today = S.dayKey();
  const units = UNITS.map(u => ({ u, ...(st.units?.[u] || { solved: 0, correct: 0, perfect: 0 }), total: PROBLEMS.filter(p => p.unit === u).length }));
  const maxSolved = Math.max(1, ...units.map(x => x.solved));
  const el = screenWithTabs('records', `<button class="icon back">${icon('back')}</button><h2>記録</h2><span></span>`, 'menu', `
    <section class="profile-card">
      <div class="pc-lv"><span>Lv</span><b>${rk.rank}</b></div>
      <div class="pc-main"><b>経験値 ${pf.xp} XP</b>
        <div class="xpbar big"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></div>
        <small>次のLvまで ${rk.need - rk.into} XP（正解 +${S.XP.perfect}・惜しい +${S.XP.ok}・まちがい +${S.XP.wrong}）</small></div>
    </section>
    <div class="stats4">
      <div>${icon('flame')}<b>${S.currentStreak()}</b><span>連続日数</span></div>
      <div>${icon('pencil')}<b>${pf.solved}</b><span>解いた数</span></div>
      <div>${icon('check')}<b>${pf.solved ? Math.round(pf.correct / pf.solved * 100) : 0}%</b><span>正解率</span></div>
      <div>${icon('trophy')}<b>${s.mastered}</b><span>克服</span></div>
    </div>
    <h3 class="sec">分野ごと（物理）</h3>
    <div class="unit-list">${units.map(x => `
      <div class="unit-row"><b>${x.u}</b>
        <div class="ubar"><i class="all" style="width:${x.solved / maxSolved * 100}%"></i><i class="ok" style="width:${x.correct / maxSolved * 100}%"></i></div>
        <span>${x.solved}問<small>正解 ${x.correct}</small></span></div>`).join('')}</div>
    <h3 class="sec">問題ごと</h3>
    <ul class="plist">${PROBLEMS.map(p => {
      const r = st.srs[p.id];
      let badge = '<i class="b new">まだ</i>';
      if (r?.mastered) badge = '<i class="b ok">克服</i>';
      else if (r?.due) badge = `<i class="b due">${r.due <= today ? '今日復習' : '復習 ' + r.due.slice(5).replace('-', '/')}</i>`;
      else if (r?.seen) badge = '<i class="b done">正解</i>';
      return `<li><span class="unit">${p.unit}</span><span class="tx">${esc(p.text)}</span>${badge}</li>`;
    }).join('')}</ul>`);
  el.querySelector('.back').onclick = showMenu;
}

// =========================== 週間ランキング ===========================
async function showRanking() {
  const wk = S.weekKey();
  const [y, mo, d] = wk.split('-').map(Number);
  const end = new Date(y, mo - 1, d + 6);
  const el = screenWithTabs('ranking', `<button class="icon back">${icon('back')}</button><h2>週間ランキング</h2><span></span>`, 'menu', `
    <p class="rk-term">${mo}/${d}（月）〜 ${end.getMonth() + 1}/${end.getDate()}（日）に解いた問題の数</p>
    <div class="rk-me"></div>
    <div class="rk-list"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showMenu;
  // 自分の最新の数をネットに送ってから見る
  try { await Sync.push(); } catch (e) { /* なし */ }
  let r;
  try { r = await rpc('sr_weekly_ranking', { p_token: Auth.currentUser().token, p_week: wk }); }
  catch (e) { el.querySelector('.rk-list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const mine = S.profile().week?.key === wk ? S.profile().week.solved : 0;
  el.querySelector('.rk-me').innerHTML = `<div class="rk-mecard"><span class="rk-pos">${r.me ? r.me.pos + '<small>位</small>' : '—'}</span>
    <div><b>あなた</b><small>${r.total || 0}人中 ・ 今週 ${mine}問</small></div>${icon('pencil')}</div>`;
  const medal = (p) => p <= 3 ? `<span class="medal m${p}">${p}</span>` : `<span class="rk-n">${p}</span>`;
  el.querySelector('.rk-list').innerHTML = (r.top || []).length ? r.top.map(x => `
    <div class="rk-row ${x.me ? 'me' : ''}">${medal(x.pos)}<b>${esc(x.username)}</b><span>${x.solved}問<small>正解 ${x.correct}</small></span></div>`).join('')
    : '<p class="empty">今週はまだだれも解いていません。いちばん乗りしよう！</p>';
}

// =========================== 図鑑 ===========================
function showZukan(genre = null) {
  const all = ITEMS.filter(i => !i.special || S.owned(i.id));
  const total = ITEMS.length, have = ITEMS.filter(i => S.owned(i.id)).length;
  const shown = genre ? (genre === 'special' ? ITEMS.filter(i => i.special) : all.filter(i => i.genre === genre && !i.special)) : null;
  const el = screenWithTabs('zukan', `<h2>図鑑</h2><span class="zk-total"><b>${have}</b> / ${total}</span>`, 'zukan', `
    <div class="zk-progress"><i style="width:${have / total * 100}%"></i></div>
    <div class="zk-tabs">
      <button data-g="" class="${!genre ? 'on' : ''}">すべて</button>
      ${GENRES.map(g => `<button data-g="${g.id}" class="${genre === g.id ? 'on' : ''}">${icon(GENRE_ICON[g.id] || 'box')}${g.name}</button>`).join('')}
      <button data-g="special" class="${genre === 'special' ? 'on' : ''}">${icon('trophy')}特別</button>
    </div>
    ${genre ? zukanGrid(shown) : GENRES.map(g => {
      const items = ITEMS.filter(i => i.genre === g.id && !i.special);
      const n = items.filter(i => S.owned(i.id)).length;
      return `<button class="zk-genre" data-g="${g.id}"><span class="g-ic">${icon(GENRE_ICON[g.id] || 'box')}</span><b>${g.name}</b>
        <span class="zk-bar"><i style="width:${n / items.length * 100}%"></i></span><small>${n} / ${items.length}${n >= items.length ? ' コンプリート' : ''}</small></button>`;
    }).join('')}`);
  el.querySelectorAll('.zk-tabs button, .zk-genre').forEach(b => b.onclick = () => showZukan(b.dataset.g || null));
  el.querySelectorAll('.zk-item.have').forEach(b => b.onclick = () => {
    const it = itemById(b.dataset.id);
    toast(`${it.name}（${(it.styles || []).map(s => styleDef(s).name).join('・')}）持っている数：${S.owned(it.id)}`);
  });
}
function zukanGrid(items) {
  return `<div class="zk-grid">${items.map(it => {
    const have = S.owned(it.id) > 0;
    return `<button class="zk-item ${have ? 'have' : 'locked'} ${it.rare ? 'rare' : ''}" data-id="${it.id}">
      <span class="thumb">${thumbHTML(it)}</span>${have ? '' : `<span class="lock">${icon('lock')}</span>`}
      <b>${have ? esc(it.name) : '？？？'}</b></button>`;
  }).join('')}</div>`;
}

// =========================== フレンド ===========================
async function refreshFriendBadge() {
  const u = Auth.currentUser();
  if (!u) return;
  try {
    const list = await rpc('sr_friend_list', { p_token: u.token });
    friendBadge = list.filter(f => f.status === 'incoming').length;
  } catch (e) { /* オフライン */ }
}
async function showFriends() {
  const el = screenWithTabs('friends', `<button class="icon back">${icon('back')}</button><h2>フレンド</h2><span></span>`, 'menu', `
    <form class="addf"><input name="n" placeholder="ユーザー名で申請" maxlength="16" autocomplete="off"><button class="btn primary">${icon('userPlus')}申請</button></form>
    <div class="flist"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showMenu;
  const u = Auth.currentUser();
  const listEl = el.querySelector('.flist');
  const load = async () => {
    let list = [];
    try { list = await rpc('sr_friend_list', { p_token: u.token }); } catch (e) { listEl.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
    friendBadge = list.filter(f => f.status === 'incoming').length;
    const sec = (title, arr, row) => arr.length ? `<h3 class="sec">${title}</h3>${arr.map(row).join('')}` : '';
    const lv = f => S.rankInfo(f.summary?.xp || 0).rank;
    listEl.innerHTML =
      sec('申請が来ています', list.filter(f => f.status === 'incoming'), f => `
        <div class="frow"><span class="av">${icon('user')}</span><b>${esc(f.username)}<small>Lv${lv(f)}</small></b>
          <button class="btn primary sm acc" data-u="${esc(f.username)}">${icon('check')}承認</button><button class="btn ghost sm dec" data-u="${esc(f.username)}">${icon('x')}</button></div>`) +
      sec('フレンド', list.filter(f => f.status === 'friend'), f => `
        <div class="frow"><span class="av">${icon('user')}</span><b>${esc(f.username)}<small>Lv${lv(f)} ・ ${icon('flame')}${f.summary?.streak || 0}日 ・ ${f.summary?.solved || 0}問</small></b>
          <button class="btn gold sm visit" data-u="${esc(f.username)}">${icon('eye')}部屋を見る</button><button class="btn ghost sm del" data-u="${esc(f.username)}">${icon('trash')}</button></div>`) +
      sec('申請中', list.filter(f => f.status === 'outgoing'), f => `
        <div class="frow"><span class="av">${icon('user')}</span><b>${esc(f.username)}<small>承認を待っています</small></b>
          <button class="btn ghost sm del" data-u="${esc(f.username)}">取り消す</button></div>`) ||
      '<p class="empty">まだフレンドがいません。相手のユーザー名を入れて申請してみましょう。</p>';
    listEl.querySelectorAll('.acc').forEach(b => b.onclick = async () => { await rpc('sr_friend_respond', { p_token: u.token, p_username: b.dataset.u, p_accept: true }); toast(`${b.dataset.u}さんとフレンドになりました`); load(); });
    listEl.querySelectorAll('.dec').forEach(b => b.onclick = async () => { await rpc('sr_friend_respond', { p_token: u.token, p_username: b.dataset.u, p_accept: false }); load(); });
    listEl.querySelectorAll('.del').forEach(b => b.onclick = async () => { if (!confirm(`${b.dataset.u}さんをフレンドから外しますか？`)) return; await rpc('sr_friend_remove', { p_token: u.token, p_username: b.dataset.u }); load(); });
    listEl.querySelectorAll('.visit').forEach(b => b.onclick = () => visitFriend(b.dataset.u));
  };
  el.querySelector('.addf').onsubmit = async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    try {
      const r = await rpc('sr_friend_request', { p_token: u.token, p_username: n });
      toast(r.status === 'accepted' ? `${n}さんとフレンドになりました` : `${n}さんに申請しました`);
      e.target.reset(); load();
    } catch (ex) { toast(ex.message); }
  };
  load();
}

// フレンド（管理者はだれでも）の部屋を見に行く（さわれない）
async function visitFriend(username, back = showFriends) {
  const u = Auth.currentUser();
  let r;
  try { r = await rpc('sr_friend_house', { p_token: u.token, p_username: username }); } catch (e) { return toast(e.message); }
  const house = r.house;
  if (!house || !house.rooms?.length || house.v !== 2) return toast(`${username}さんの部屋はまだ準備中です`);
  visiting = { username: r.username, house, current: 0, summary: r.summary, back };
  showVisit();
}
async function showVisit() {
  const v = visiting;
  const room = v.house.rooms[v.current];
  room.surf = room.surf || { ...STARTER };
  room.placed = room.placed || [];
  if (!room3d) room3d = new Room3D(canvas);
  room3d.setActive(true);
  canvas.classList.remove('dim');
  // 今いる家（家 or 別荘）の部屋と、もう一方への切りかえ
  const home = homeOf(room.id);
  const here = v.house.rooms.map((rr, i) => ({ rr, i })).filter(x => homeOf(x.rr.id) === home);
  const other = v.house.rooms.findIndex(rr => homeOf(rr.id) !== home);
  const navHTML = here.length > 1 || other >= 0 ? `<nav class="rooms">${here.map(({ rr, i }) => `<button data-i="${i}" class="${i === v.current ? 'on' : ''}">${icon(roomDef(rr.id).icon)}${roomDef(rr.id).name}</button>`).join('')}${other >= 0 ? `<button data-i="${other}" class="homebtn">${home === 'main' ? `${icon('palm')}別荘へ` : `${icon('home')}家へ`}</button>` : ''}</nav>` : '';
  app.innerHTML = '';
  const el = h(`
    <div class="home visiting">
      <header class="hud">
        <button class="round back" aria-label="もどる">${icon('back')}</button>
        <div class="room-name"><span class="rn-ic">${icon('user')}</span><span class="rn-t">${esc(v.username)}さんの${roomDef(room.id).name}<small>Lv${S.rankInfo(v.summary?.xp || 0).rank} ・ 家具 ${room.placed.length}個</small></span></div>
        <button class="round photo" aria-label="写真をとる">${icon('camera')}</button>
      </header>
      ${navHTML}
      <div class="hint">見るだけの部屋です。なぞって見回せます</div>
    </div>`);
  el.querySelector('.back').onclick = () => leaveVisit(true);
  el.querySelector('.photo').onclick = photoMode;
  el.querySelectorAll('.rooms button').forEach(b => b.onclick = () => { v.current = +b.dataset.i; showVisit(); });
  app.append(el);
  scrollRoomsNav(el);
  await room3d.show(roomDef(room.id), room, { readOnly: true });
}
async function leaveVisit(goBack) {
  const back = visiting?.back;
  visiting = null;
  if (room3d) { room3d.roomDef = null; await room3d.show(curDef(), curRoom()); }
  if (goBack && back) back();
}

// =========================== 管理者 ===========================
async function showAdmin() {
  if (!isAdmin()) return showMenu();
  const el = screenWithTabs('admin', `<button class="icon back">${icon('back')}</button><h2>管理者</h2><span></span>`, 'menu', `<div class="alist"><p class="empty">読み込み中…</p></div>`);
  el.querySelector('.back').onclick = showMenu;
  const u = Auth.currentUser();
  let list = [];
  try { list = await rpc('sr_admin_users', { p_token: u.token }); } catch (e) { el.querySelector('.alist').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const day = (t) => t ? new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  el.querySelector('.alist').innerHTML = `<p class="note">全 ${list.length} 人</p>` + list.map(a => {
    const s = a.summary || {};
    const units = a.units || {};
    return `<div class="acard">
      <div class="ac-top"><span class="av">${icon('user')}</span><b>${esc(a.username)}</b><span class="lvb">Lv${S.rankInfo(s.xp || 0).rank}</span></div>
      <div class="ac-stats"><span>${icon('pencil')}${s.solved || 0}問</span><span>${icon('check')}${s.solved ? Math.round((s.correct || 0) / s.solved * 100) : 0}%</span><span>${icon('flame')}${s.streak || 0}日（合計${s.days || 0}日）</span></div>
      <div class="ac-units">${UNITS.map(un => `<span>${un} ${units[un]?.solved || 0}問</span>`).join('')}</div>
      <div class="ac-foot"><small>登録 ${day(a.created_at)} ・ 最後 ${day(a.last_login)}</small><button class="btn ghost sm visit" data-u="${esc(a.username)}">${icon('eye')}部屋</button></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.visit').forEach(b => b.onclick = () => visitFriend(b.dataset.u, showAdmin));
}

// =========================== 設定 ===========================
function showSettings() {
  let q = 'high';
  try { q = localStorage.getItem('studyroom.quality') || 'high'; } catch (e) { /* なし */ }
  const ver = (() => { try { return localStorage.getItem('studyroom.version') || ''; } catch (e) { return ''; } })();
  const el = screenWithTabs('settings', `<button class="icon back">${icon('back')}</button><h2>設定</h2><span></span>`, 'menu', `
    <section class="group">
      <div class="row-item"><span class="lbl">ユーザー</span><span class="val">${esc(user.name)}${isAdmin() ? '（管理者）' : ''}</span></div>
      <div class="row-item"><span class="lbl">保存</span><span class="val sync"></span></div>
    </section>
    <section class="group">
      <div class="row-item col"><span class="lbl">画質</span>
        <div class="seg">${[['high', 'きれい'], ['mid', 'ふつう'], ['low', 'かるい']].map(([k, n]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${n}</button>`).join('')}</div>
        <small>カクカクするときは「ふつう」か「かるい」に</small></div>
      ${DL.canDownload() ? `<button class="row-item tap dl"><span class="lbl">家具のデータ</span><span class="val">${DL.downloadState() === 'done' ? '保存ずみ' : 'まとめて保存する'}</span></button>` : ''}
    </section>
    <section class="group">
      <button class="row-item tap logout"><span class="lbl danger">${icon('logout')}ログアウト</span></button>
    </section>
    ${isAdmin() ? `<section class="group">
      <button class="row-item tap reset-all"><span class="lbl danger">${icon('trash')}最初からやり直す（管理者）</span></button>
    </section>` : ''}
    <p class="ver">ROOMIN ${esc(ver)}</p>`);
  el.querySelector('.back').onclick = showMenu;
  el.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    try { localStorage.setItem('studyroom.quality', b.dataset.q); } catch (e) { /* なし */ }
    room3d?.setQuality(b.dataset.q);
    el.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('.dl')?.addEventListener('click', () => { if (DL.downloadState() !== 'done') showDownload(); });
  el.querySelector('.logout').onclick = async () => { await Sync.push(); Auth.logOut(); showLogin(); };
  // 管理者だけ：記録をすべて消して最初から（ログインはそのまま）
  el.querySelector('.reset-all')?.addEventListener('click', async () => {
    if (!isAdmin()) return;
    if (!confirm('本当に最初からやり直しますか？家具・ランク・記録がすべて消えます')) return;
    if (!confirm('もう一度確認：元に戻せません。やり直しますか？')) return;
    S.resetAll();
    try { await Sync.push(); } catch (e) { /* つながらなければ、あとで送られる */ }
    location.reload();
  });
  paintSync();
}

// =========================== 問題を解く ===========================
function startSet() {
  const st = sub();
  if (!(st.session && st.session.idx < st.session.set.length)) {
    st.session = { set: S.buildSet(st, PROBLEMS), idx: 0, results: [], gained: 0, xp: 0, rankUp: false, startedAt: Date.now(), bonus: !S.playedToday() };
    S.save();
  }
  room3d.setActive(false);
  canvas.classList.add('dim');
  nextProblem();
}

function nextProblem() {
  const st = sub();
  const ss = st.session;
  if (ss.idx >= ss.set.length) return finishSet();
  const item = ss.set[ss.idx];
  const p = byId[item.id];
  if (!p) { ss.idx++; return nextProblem(); }
  runProblem(p, item.review, false);
}

function symbolColors(p) {
  const syms = [];
  for (const q of [...p.quantities, p.target, ...p.formulaSymbols]) if (!syms.includes(q.symbol)) syms.push(q.symbol);
  return Object.fromEntries(syms.map((s, i) => [s, COLORS[i % COLORS.length]]));
}

// 問題文を、数値の部分ごとに区切る
function segments(p) {
  const marks = [...p.quantities.map((q, i) => ({ ...q, key: 'q' + i })), { ...p.target, key: 't', isTarget: true }]
    .map(q => ({ ...q, at: p.text.indexOf(q.phrase) }))
    .sort((a, b) => a.at - b.at);
  const segs = [];
  let pos = 0;
  for (const m of marks) {
    if (m.at < pos) continue;
    if (m.at > pos) segs.push({ text: p.text.slice(pos, m.at) });
    segs.push({ text: m.phrase, mark: m });
    pos = m.at + m.phrase.length;
  }
  if (pos < p.text.length) segs.push({ text: p.text.slice(pos) });
  return { segs, order: marks.filter(m => !m.isTarget).concat(marks.filter(m => m.isTarget)) };
}

function colorFormula(expr, colors) {
  const keys = Object.keys(colors).sort((a, b) => b.length - a.length);
  let out = '', i = 0;
  while (i < expr.length) {
    const k = keys.find(k => expr.startsWith(k, i));
    if (k) { out += `<b style="color:${colors[k]}">${esc(k)}</b>`; i += k.length; }
    else { out += esc(expr[i]); i++; }
  }
  return out;
}

function runProblem(p, isReview, retry) {
  const st = sub();
  const ss = st.session;
  const colors = symbolColors(p);
  const { segs, order } = segments(p);
  const assigned = {};
  let cur = 0, step1Miss = false, missesHere = 0;
  const t0 = Date.now();

  // 文字ボタン：正解の文字＋ダミー
  const need = [...new Set(order.map(m => m.symbol))];
  const pool = (SYMBOLS[p.unit] || []).filter(s => !need.includes(s));
  const palette = S.shuffle([...need, ...S.shuffle(pool).slice(0, Math.max(2, 7 - need.length))]);

  app.innerHTML = '';
  const el = h(`
    <div class="screen quiz">
      <header class="bar">
        <button class="icon back" aria-label="部屋にもどる">${icon('x')}</button>
        <div class="qprog"><i style="width:${ss.idx / ss.set.length * 100}%"></i></div>
        <span class="tag">${isReview ? `${icon('refresh')}復習` : p.unit}${retry ? '・確認' : ''}</span>
      </header>
      ${retry ? `<div class="hintbox">正しい公式：<span class="fx">${colorFormula(p.formula.expr, colors)}</span>　同じ色の部分が、問題文のどこにあたるか見ながら解いてください。</div>` : ''}
      ${p.verified ? '' : `<div class="warnbox">${icon('alert')}この問題は答えが未確認です。先生や友達に確認してみてください。</div>`}
      <div class="problem"></div>
      <div class="step"></div>
    </div>`);
  app.append(el);
  el.querySelector('.back').onclick = () => { S.save(); showHome(); };
  const probEl = el.querySelector('.problem');
  const stepEl = el.querySelector('.step');

  function renderText(showColors) {
    probEl.innerHTML = segs.map(s => {
      if (!s.mark) return esc(s.text);
      const m = s.mark;
      const active = !showColors && order[cur] === m;
      const a = assigned[m.key];
      const col = (showColors || retry) ? colors[m.symbol] : null;
      return `<span class="ph ${active ? 'active' : ''} ${m.hidden ? 'hidden-cond' : ''} ${a ? 'set' : ''}" data-k="${m.key}"
        ${col ? `style="--c:${col}"` : ''}>${esc(s.text)}${a ? `<sup>${esc(a)}</sup>` : ''}</span>`;
    }).join('');
  }

  function step1() {
    if (cur >= order.length) return step2();
    const m = order[cur];
    renderText(false);
    stepEl.innerHTML = `
      <p class="ask">${m.isTarget ? '<b>求めるもの</b>は、どの文字？' : m.hidden ? '<b>数字は書いてない</b>けど、文字があてはまる条件です。どの文字？' : '光っている部分は、どの文字？'}</p>
      <div class="palette">${palette.map(s => `<button class="sym">${esc(s)}</button>`).join('')}</div>
      <p class="hint2"></p>`;
    stepEl.querySelectorAll('.sym').forEach(b => b.onclick = () => {
      if (b.textContent === m.symbol) {
        assigned[m.key] = m.symbol;
        missesHere = 0;
        vibrate(15);
        cur++;
        step1();
      } else {
        step1Miss = true; missesHere++;
        b.classList.add('wrong');
        probEl.querySelector('.ph.active')?.classList.add('shake');
        setTimeout(() => probEl.querySelector('.ph.active')?.classList.remove('shake'), 400);
        vibrate(60);
        stepEl.querySelector('.hint2').textContent = missesHere >= 2 ? `ヒント：これは「${m.meaning}」です` : 'ちがうみたい。もう一度！';
      }
    });
  }

  function step2() {
    renderText(false);
    const cards = S.shuffle([p.formula.expr, ...p.distractors.slice(0, 3)]);
    stepEl.innerHTML = `
      <p class="ask">使う<b>公式</b>はどれ？</p>
      <div class="cards">${cards.map(c => `<button class="fcard">${esc(c)}</button>`).join('')}</div>`;
    stepEl.querySelectorAll('.fcard').forEach(b => b.onclick = () => {
      const ok = b.textContent === p.formula.expr;
      b.classList.add(ok ? 'right' : 'wrong');
      stepEl.querySelectorAll('.fcard').forEach(x => x.disabled = true);
      setTimeout(() => result(ok), ok ? 350 : 500);
    });
  }

  function result(ok) {
    const secs = (Date.now() - t0) / 1000;
    const perfect = ok && !step1Miss;
    let pts = 0, mastered = false, xp = null;
    if (!retry) {
      pts = S.gaugePoints(perfect, ok && step1Miss, secs);
      if (ss.bonus) pts = Math.round(pts * 1.5);
      HS().gauge += pts;
      ss.gained += pts;
      ({ mastered } = S.recordResult(st, p.id, perfect, isReview));
      if (mastered) HS().pendingSpecials++;
      xp = S.addAnswer(st, p.unit, perfect ? 'perfect' : ok ? 'ok' : 'wrong');
      ss.xp = (ss.xp || 0) + xp.gained;
      if (xp.rankUp) ss.rankUp = true;
      ss.results.push({ id: p.id, perfect, ok, mastered });
      const first = S.markPlayedToday();
      if (first) toast(`連続 ${S.currentStreak()}日目！`);
      S.save();
    }
    renderText(!ok || retry);
    const fx = colorFormula(p.formula.expr, colors);
    const xpLine = xp ? `<div class="xpgain">${icon('level')}+${xp.gained} XP${xp.rankUp ? `<b>Lv${xp.rank}にアップ！</b>` : ''}</div>` : '';
    if (ok) {
      vibrate(perfect ? [20, 30, 20] : 20);
      stepEl.innerHTML = `
        <div class="res ok">
          <div class="ttl">${retry ? '確認できました' : perfect ? '正解！' : '正解（文字は1回まちがい）'}</div>
          ${!retry ? `<div class="pts">+${pts}<small>ゲージ ${perfect && secs <= 20 ? '・早い！ボーナス' : ''}${ss.bonus && pts ? '・今日のはじめ ×1.5' : ''}</small></div>` : ''}
          ${xpLine}
          ${mastered ? `<div class="master">${icon('trophy')}克服しました！ 特別な家具がもらえます</div>` : ''}
          <div class="formula">${fx}<small>${esc(p.formula.name)}</small></div>
          <button class="link why">なぜこの公式？</button>
          <p class="reason hide">${esc(p.reason)}</p>
          <button class="btn primary big next">次へ</button>
        </div>`;
      stepEl.querySelector('.why').onclick = (e) => { stepEl.querySelector('.reason').classList.toggle('hide'); e.target.remove(); };
      stepEl.querySelector('.next').onclick = () => { ss.idx++; S.save(); nextProblem(); };
    } else {
      vibrate([60, 40, 60]);
      const legend = [...p.quantities, p.target, ...p.formulaSymbols]
        .map(q => `<li><b style="color:${colors[q.symbol]}">${esc(q.symbol)}</b> … ${esc(q.meaning)}${q.phrase ? `（「${esc(q.phrase)}」）` : ''}</li>`).join('');
      stepEl.innerHTML = `
        <div class="res ng">
          <div class="ttl">おしい！ 正しい公式はこれ</div>
          ${xpLine}
          <div class="formula">${fx}<small>${esc(p.formula.name)}</small></div>
          <ul class="legend">${legend}</ul>
          <p class="reason">${esc(p.reason)}</p>
          <button class="btn primary big again">見ながら もう一度</button>
        </div>`;
      stepEl.querySelector('.again').onclick = () => runProblem(p, isReview, true);
    }
  }

  step1();
}

function finishSet() {
  const st = sub();
  const ss = st.session;
  const perfect = ss.results.filter(r => r.perfect).length;
  const masters = ss.results.filter(r => r.mastered).length;
  const max = S.gaugeMax(HS());
  const rk = rankNow();
  st.session = null;
  const added = ensureRooms();
  S.save();
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card done">
        <h2>おつかれさま！</h2>
        <div class="score"><b>${perfect}</b> / ${ss.results.length} 問 ノーミス</div>
        ${ss.rankUp ? `<div class="rankup">${icon('level')}<b>Lv${rk.rank}</b>にアップ！<small>置ける家具が ${S.capacity()}個 に</small></div>` : ''}
        <div class="xp-line">${icon('level')}+${ss.xp || 0} XP<span class="xpbar"><i style="width:${Math.round(rk.into / rk.need * 100)}%"></i></span></div>
        <div class="gauge big ${HS().gauge >= max ? 'full' : ''}"><div class="fill" style="width:${Math.min(100, HS().gauge / max * 100)}%"></div>
          <span>ゲージ +${ss.gained}</span></div>
        ${HS().gauge >= max ? `<p class="gold-t">${icon('gift')}家具が買えます！</p>` : ''}
        ${masters ? `<p class="gold-t">${icon('trophy')}克服 ${masters}問！ 特別な家具が届きます</p>` : ''}
        ${added.length ? `<p class="gold-t">${icon('door')}新しい部屋「${added.map(r => r.name).join('・')}」が開きました</p>` : ''}
        <p class="streak-t">${icon('flame')}連続 ${S.currentStreak()}日</p>
        <button class="btn primary big home">部屋にもどる</button>
        <button class="btn ghost more">もう1セット</button>
      </div>
    </div>`);
  el.querySelector('.home').onclick = () => { showHome(); receiveSpecials(); };
  el.querySelector('.more').onclick = () => startSet();
  app.append(el);
}

// =========================== はじまり ===========================
let syncState = 'saved';
const SYNC_LABEL = { saved: ['cloud', '保存ずみ'], pending: ['cloud', '保存中…'], offline: ['cloudOff', 'オフライン（あとで保存）'] };
function paintSync() {
  document.querySelectorAll('.sync').forEach(e => {
    const [ic, t] = SYNC_LABEL[syncState] || SYNC_LABEL.saved;
    e.innerHTML = `${icon(ic)}${t}`; e.dataset.s = syncState;
  });
}
Sync.setHandlers({
  onStatus: (s) => { syncState = s; paintSync(); },
  onExpired: () => { Auth.logOut(); toast('ログインが切れました。もう一度ログインしてください', 3500); showLogin(); },
});

// =========================== タイトル画面 ===========================
// アプリを開いたとき：ROOMIN が浮かぶ → タップしてはじめる。
// 待っているあいだに、裏で記録の読み込みと部屋の準備をしておく（タップしたらすぐ部屋へ）
function showTitle() {
  const mood = moodNow();
  const u = Auth.currentUser();
  const el = h(`
    <div class="title-screen t-${mood}">
      <div class="t-glow"></div>
      <button class="t-gear" aria-label="設定">${icon('gear')}</button>
      <h1 class="t-logo">${'ROOMIN'.split('').map((c, i) => `<span style="animation-delay:${0.15 + i * 0.12}s">${c}</span>`).join('')}</h1>
      <p class="t-sub">問題を解くと、部屋ができていく</p>
      <div class="t-bottom">
        <p class="t-tap">タップしてはじめる</p>
        <div class="t-load"><i></i></div>
      </div>
    </div>`);
  document.body.append(el);
  const bar = el.querySelector('.t-load i');
  const setP = (v) => { bar.style.width = Math.round(v * 100) + '%'; };
  setP(0.08);
  // 裏で準備
  let ready = Promise.resolve();
  if (u) {
    ready = (async () => {
      S.useUser(u.id);
      await Promise.race([Sync.pull(), new Promise(r => setTimeout(r, 3000))]);
      setP(0.35);
      user = Auth.currentUser() || u;
      ensureRooms();
      if (!room3d) { room3d = new Room3D(canvas); setInterval(() => room3d.refreshMood(), 60e3); }
      room3d.setActive(true);
      setP(0.55);
      await Promise.race([room3d.show(curDef(), curRoom()), new Promise(r => setTimeout(r, 12000))]);
      setP(1);
    })().catch(() => setP(1));
  } else setP(1);
  let started = false;
  el.addEventListener('click', async (e) => {
    if (e.target.closest('.t-gear') || e.target.closest('.sheet') || started) return;
    started = true;
    el.classList.add('t-go');
    await ready;
    el.classList.add('t-out');
    setTimeout(() => el.remove(), 900);
    if (!u) return showLogin();
    startAs(Auth.currentUser() || u);
    refreshFriendBadge();
  });
  el.querySelector('.t-gear').onclick = () => titleSettings(el);
}
function titleSettings(host) {
  let q = 'high';
  try { q = localStorage.getItem('studyroom.quality') || 'high'; } catch (e) { /* なし */ }
  const sh = h(`<div class="sheet t-settings"><div class="grab"></div>
    <div class="sh-head"><span class="sh-ic">${icon('gear')}</span><div><h3>かんたん設定</h3><p>あとからメニューでも変えられます</p></div></div>
    <p class="lbl">画質</p>
    <div class="seg q3">${[['high', 'きれい'], ['mid', 'ふつう'], ['low', 'かるい']].map(([k, n]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${DL.canDownload() && DL.downloadState() !== 'done' ? `<button class="btn ghost big dl">${icon('download')}家具のデータをまとめて保存</button>` : ''}
    <button class="btn primary big close">とじる</button></div>`);
  host.append(sh);
  sh.querySelectorAll('.q3 button').forEach(b => b.onclick = () => {
    try { localStorage.setItem('studyroom.quality', b.dataset.q); } catch (e) { /* なし */ }
    room3d?.setQuality(b.dataset.q);
    sh.querySelectorAll('.q3 button').forEach(x => x.classList.toggle('on', x === b));
  });
  sh.querySelector('.dl')?.addEventListener('click', () => { DL.setDownloadState(null); try { localStorage.removeItem('studyroom.download'); } catch (e) { /* なし */ } sh.remove(); toast('はじめるときに、ダウンロードの画面が出ます'); });
  sh.querySelector('.close').onclick = () => sh.remove();
}

showTitle();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// テスト用
window.__app = { get room3d() { return room3d; }, S, sub, HS, switchRoom, ensureRooms, goHome, showHome, curRoom, visitFriend, leaveVisit };
