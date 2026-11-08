// LYRIC BOOK 本体：画面の切りかえと操作
import { rpc, LOCAL_TOKEN } from './cloud.js?v=2.6.1';
import * as N from './notes.js';
import * as L from './lyrics.js';
import * as R from './recorder.js';
import * as A from './analyze.js';
import * as E from './encode.js';

export const APP_VERSION = '2.6.1';
const NEED_SERVER = 3; // この版の受け口（server/Code.gs）の番号

// ---------- 小さな道具 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* 保存できない端末 */ } };
const jaCmp = (a, b) => a.localeCompare(b, 'ja');
function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
}

const svg = (body, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${body}</svg>`;
const I = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  piano: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v9M12 5v9M16 5v9"/>'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'),
  book: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  list: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  stage: svg('<path d="M4 18h16"/><path d="M7 18V9l5-4 5 4v9"/><path d="M10 18v-4h4v4"/>'),
  wave: svg('<path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  star: svg('<path d="M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>'),
};
const PLAY = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z"/></svg>';
const PAUSE = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1h2v8H2zM6 1h2v8H6z"/></svg>';

// ---------- はじめから入っているもの ----------
const DEFAULTS = {
  themes: [
    { id: 'love', name: '恋愛', color: '#c0607a' },
    { id: 'life', name: '人生', color: '#b0803a' },
    { id: 'family', name: '家族', color: '#5f8f5a' },
    { id: 'heartbreak', name: '失恋', color: '#5b7fa6' },
  ],
  marks: [
    { id: 'breath', label: 'V', name: 'ブレス', desc: 'ここで息を吸う' },
    { id: 'falsetto', label: '裏', name: '裏声', desc: '高く軽い声に切り替える' },
    { id: 'mix', label: 'ミ', name: 'ミックスボイス', desc: '地声と裏声の中間の声' },
    { id: 'ganari', label: 'ガ', name: 'がなり', desc: '声をわざとざらつかせる' },
    { id: 'vibrato', label: '〜', name: 'ビブラート', desc: 'のばす音を細かくゆらす' },
    { id: 'shakuri', label: '↗', name: 'しゃくり', desc: '下からずり上げて入る' },
    { id: 'fall', label: '↘', name: 'フォール', desc: '音の終わりを下げる' },
    { id: 'kobushi', label: 'こ', name: 'こぶし', desc: '音を小さく回す' },
  ],
  colors: [
    { id: 'strong', name: '強く', color: '#b8432f' },
    { id: 'soft', name: 'やさしく', color: '#3f7f8c' },
  ],
  dark: false,
  myTop: null,
  myLow: null,
  setlists: [],
  tabs: [],
  lyrSize: 'm',
  hintDone: false,
};
const SWATCHES = ['#b8432f', '#3f7f8c', '#c0607a', '#b0803a', '#5f8f5a', '#5b7fa6', '#8a5ab0', '#a5602f', '#7a6a3e', '#d08a3a', '#6e3b1c', '#9a4f6a'];
const ART_COLORS = ['#a4522a', '#7d5a3c', '#8c6a3a', '#6e3b1c', '#9a5a46', '#7a6a3e', '#8b4a22', '#6d4c3d'];

// ---------- 状態 ----------
const S = {
  token: null, username: '', settings: { ...DEFAULTS },
  artists: new Map(), songs: new Map(), recs: [],
  tab: lsGet('lb_tab') || 'real', themeFilter: 'all', query: '',
  sel: null, view: '', saveTimers: new Map(),
  backup: null, offline: false, lastRefresh: 0, isOwner: false, serverVersion: 2,
  prac: 'all', shared: null,
};
// ゴミ箱に入っていないもの
const alive = x => !x?.data?.deleted_at;
const liveSongs = () => Array.from(S.songs.values()).filter(alive);
const liveArtists = () => Array.from(S.artists.values()).filter(alive);
const PRAC = { learning: { label: '練習中', color: '#b0803a' }, can: { label: '歌える', color: '#3f7f8c' }, best: { label: '十八番', color: '#b8432f' } };
const app = $('#app');
['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, () => N.unlockAudio(), { passive: true, capture: true }));

// ---------- 知らせ・板 ----------
let toastTimer;
function toast(msg) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}
function fail(e) { console.error(e); toast(e?.message || 'うまくいきませんでした'); if (e?.code === 'bad_token') logout(true); }

let sheetClose = null;
function openSheet(html, handlers = {}, onClose) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const theme = app.firstElementChild?.className.match(/\b(\w+S|home)\b/)?.[1];
  if (theme) bg.classList.add(theme);
  document.body.appendChild(bg);
  const sheet = $('.sheet', bg);
  bg.addEventListener('click', e => {
    if (e.target === bg) { closeSheet(); return; }
    const t = e.target.closest('[data-s]');
    if (t && handlers[t.dataset.s]) handlers[t.dataset.s](t, sheet);
  });
  sheetClose = () => { bg.remove(); sheetClose = null; onClose?.(); };
  setTimeout(() => $('input,textarea', sheet)?.focus(), 50);
  return sheet;
}
function closeSheet() { sheetClose?.(); }

function askText({ title, value = '', placeholder = '', multiline = false, ok = '保存' }) {
  return new Promise(resolve => {
    let done = false;
    const sheet = openSheet(`<h3>${esc(title)}</h3>
      ${multiline ? `<textarea class="textarea" style="min-height:120px" id="ask-in" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input class="input" id="ask-in" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
      <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">${esc(ok)}</button></div>`, {
      no: () => closeSheet(),
      ok: (_, sh) => { done = true; const v = $('#ask-in', sh).value; closeSheet(); resolve(v); },
    }, () => { if (!done) resolve(null); });
    if (!multiline) $('#ask-in', sheet).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('[data-s="ok"]', sheet).click(); } });
  });
}
function confirmAsk(title, msg, ok = 'はい', danger = false) {
  return new Promise(resolve => {
    let done = false;
    openSheet(`<h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}
      <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn ${danger ? 'danger' : ''}" data-s="ok">${esc(ok)}</button></div>`, {
      no: () => closeSheet(),
      ok: () => { done = true; closeSheet(); resolve(true); },
    }, () => { if (!done) resolve(false); });
  });
}
function menu(title, items) {
  return new Promise(resolve => {
    let done = false;
    openSheet(`${title ? `<h3>${esc(title)}</h3>` : ''}<div class="menu-list">${items.map((it, i) => `<button data-s="pick" data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`).join('')}</div>
      <button class="btn sub" data-s="no">とじる</button>`, {
      pick: t => { done = true; closeSheet(); resolve(items[+t.dataset.i].value); },
      no: () => closeSheet(),
    }, () => { if (!done) resolve(null); });
  });
}

// ---------- 設定・色 ----------
function mergeSettings(saved) {
  const s = { ...DEFAULTS, ...(saved || {}) };
  for (const k of ['themes', 'marks', 'colors']) if (!Array.isArray(s[k]) || !s[k].length) s[k] = DEFAULTS[k].map(x => ({ ...x }));
  if (!Array.isArray(s.tabs)) s.tabs = [];
  return s;
}
function applyLook() {
  document.documentElement.dataset.theme = S.settings.dark ? 'dark' : 'light';
  const size = { s: '1.02rem', m: '1.18rem', l: '1.38rem' }[S.settings.lyrSize] || '1.18rem';
  document.documentElement.style.setProperty('--lyr-size', size);
}
function setBarColor(c) { $('meta[name="theme-color"]')?.setAttribute('content', c); }
let settingsTimer;
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => send('lb_save_settings', { p_token: S.token, p_settings: S.settings }).catch(fail), 400);
}
const themeOf = id => S.settings.themes.find(t => t.id === id);
function hashColor(s) { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) | 0; return ART_COLORS[Math.abs(h) % ART_COLORS.length]; }

// ---------- 端末の中に前回のデータを残す ----------
const CACHE_KEY = 'lb_cache', QUEUE_KEY = 'lb_queue';
function cacheNow() {
  if (!S.token) return;
  lsSet(CACHE_KEY, JSON.stringify({
    token: S.token, username: S.username, settings: S.settings, backup: S.backup, is_owner: S.isOwner, server_version: S.serverVersion,
    artists: Array.from(S.artists.values()), songs: Array.from(S.songs.values()), recordings: S.recs,
  }));
}
let cacheTimer;
function cacheSoon() { clearTimeout(cacheTimer); cacheTimer = setTimeout(cacheNow, 400); }
function loadCache() { try { return JSON.parse(lsGet(CACHE_KEY)); } catch (e) { return null; } }
function applyLoad(d) {
  S.username = d.username;
  S.settings = mergeSettings(d.settings);
  S.artists = new Map((d.artists || []).map(a => [a.id, a]));
  S.songs = new Map((d.songs || []).map(s => [s.id, s]));
  S.recs = d.recordings || [];
  S.backup = d.backup || null;
  S.isOwner = !!d.is_owner;
  S.serverVersion = d.server_version || 1;
  S.lastRefresh = Date.now();
  S.shared = null;
  for (const a of S.artists.values()) if (!a.data.photos && a.data.photo) a.data.photos = [a.data.photo];
}
function setOffline(on) {
  S.offline = on;
  let el = $('#offline');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'offline'; el.className = 'offline'; el.setAttribute('role', 'status');
    el.textContent = '電波なし・つながったら送ります';
    document.body.appendChild(el);
  } else if (!on) el?.remove();
}

// 電波がなくて送れなかった変更は、ためておいて、つながったら送る
function loadQueue() { try { return JSON.parse(lsGet(QUEUE_KEY)) || []; } catch (e) { return []; } }
function saveQueue(q) { lsSet(QUEUE_KEY, q.length ? JSON.stringify(q) : null); }
function enqueue(name, body) {
  const q = loadQueue();
  const same = (name === 'lb_save_song' || name === 'lb_save_artist') && q.find(x => x.name === name && x.body.p_id === body.p_id);
  if (same) same.body.p_data = body.p_data; // 最初に見た更新日時（p_base）はそのまま
  else q.push({ name, body });
  saveQueue(q);
}
// 「保存中…」「保存しました」を右上に小さく出す
let savingCount = 0;
function savingUi(d) {
  savingCount = Math.max(0, savingCount + d);
  let el = $('#saving');
  if (!el) { el = document.createElement('div'); el.id = 'saving'; el.className = 'saving'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  clearTimeout(el._t);
  if (savingCount > 0) { el.textContent = '保存中…'; el.className = 'saving show'; }
  else { el.textContent = S.offline ? 'この端末に保存しました' : '保存しました ✓'; el.className = 'saving show done'; el._t = setTimeout(() => { el.className = 'saving'; }, 1300); }
}
// 送っている途中の保存の数と、保存した回数（裏での読みこみが古い中身で上書きしないように）
let savesInFlight = 0, saveGen = 0;
async function send(name, body) {
  cacheSoon();
  savingUi(1);
  savesInFlight++; saveGen++;
  try { return await rpc(name, body); }
  catch (e) {
    if (e.code === 'offline' && S.token !== LOCAL_TOKEN) { enqueue(name, body); setOffline(true); return null; }
    throw e;
  } finally { savingUi(-1); savesInFlight--; saveGen++; }
}
let flushing = false;
async function flush() {
  if (flushing || !S.token || S.token === LOCAL_TOKEN) return;
  const q = loadQueue();
  if (!q.length) return;
  flushing = true;
  let both = false;
  try {
    while (q.length) {
      const it = q[0];
      it.body.p_token = S.token;
      try {
        const r = await rpc(it.name, it.body);
        if (r && it.name === 'lb_save_song') { const s = S.songs.get(it.body.p_id); if (s) Object.assign(s, r); }
        if (r && it.name === 'lb_save_artist') { const a = S.artists.get(it.body.p_id); if (a) Object.assign(a, r); }
      } catch (e) {
        if (e.code === 'offline') { setOffline(true); return; }
        if (e.code === 'bad_token') return;
        if (e.code === 'conflict' && it.name === 'lb_save_song') { await keepBoth(it.body.p_data); both = true; }
        else console.error(e);
      }
      q.shift(); saveQueue(q);
    }
    setOffline(false);
    cacheSoon();
    if (both) await refresh(true);
  } finally { flushing = false; }
}
async function flushAll() { await flush(); await flushRecs(); }
// 同じ曲が別の端末でも直されていたら、この端末の版を別の曲として残す
async function keepBoth(data) {
  const copy = JSON.parse(JSON.stringify(data));
  copy.title = (copy.title || '題名なし') + '（別の端末の版）';
  const id = uuid();
  const r = await rpc('lb_save_song', { p_token: S.token, p_id: id, p_data: copy });
  S.songs.set(id, { id, data: copy, ...r });
  toast('別の端末でも直されていたので、両方残しました（「別の端末の版」）');
}
// ほかの端末の変更を読みこみなおす
async function refresh(force = false) {
  if (!S.token || S.token === LOCAL_TOKEN) return;
  if (!force) { syncInBackground(); return; }
  try {
    const d = await rpc('lb_load', { p_token: S.token });
    applyLoad(d); await addPendingRecs(); applyLook(); cacheNow(); setOffline(false);
    const y = window.scrollY;
    route(true);
    window.scrollTo(0, y);
  } catch (e) { if (e.code === 'offline') setOffline(true); }
}
window.addEventListener('online', () => flushAll().then(() => refresh()));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.token && Date.now() - S.lastRefresh > 20000) flushAll().then(() => refresh());
});
setInterval(() => { if (navigator.onLine !== false) flushAll(); }, 30000);

// 裏で最新を読みこんで、変わっていたら画面をそっと入れかえる
const dataKey = d => JSON.stringify([d.settings, d.artists, d.songs, (d.recordings || []).map(r => [r.id, r.updated_at, r.name]), d.is_owner]);
async function syncInBackground() {
  if (!S.token || S.token === LOCAL_TOKEN) return;
  try {
    await flush();
    const gen = saveGen;
    const d = await rpc('lb_load', { p_token: S.token });
    setOffline(false);
    S.lastRefresh = Date.now();
    // 直している途中・送っていない変更・送っている途中の保存があるとき、読んでいる間に保存したときは、
    // 入れかえない（古い中身で上書きしてしまうため。あとでもう一度読む）
    if (S.saveTimers.size || saveChains.size || loadQueue().length || savesInFlight || gen !== saveGen) return;
    const before = loadCache();
    const changed = !before || dataKey(before) !== dataKey(d);
    S.backup = d.backup || S.backup;
    if (!changed) { cacheNow(); return; }
    applyLoad(d); await addPendingRecs(); applyLook(); cacheNow();
    if (S.view === 'edit' || S.view.startsWith('play:') || sheetClose || S.sel) return;
    const y = window.scrollY;
    route(true);
    window.scrollTo(0, y);
  } catch (e) {
    if (e.code === 'offline') setOffline(true);
    else if (e.code === 'bad_token') { lsSet('lb_token', null); lsSet(CACHE_KEY, null); S.token = null; renderLogin(); toast(e.message); }
  } finally {
    flushRecs();
    purgeTrash();
    pruneAudio();
  }
}

// ---------- 読みこみ ----------
async function boot() {
  S.token = lsGet('lb_token');
  const inviteParam = new URLSearchParams(location.search).get('invite') || '';
  if (!S.token) { renderLogin(inviteParam ? 'signup' : 'login', '', inviteParam); return; }
  if (inviteParam) history.replaceState(null, '', location.pathname + location.hash);
  // 端末に前回のデータがあれば、待たずにすぐ出す
  const c = loadCache();
  if (c && c.token === S.token && S.token !== LOCAL_TOKEN) {
    applyLoad(c);
    await addPendingRecs();
    applyLook();
    route();
    syncInBackground();
    return;
  }
  try {
    await flush();
    const d = await rpc('lb_load', { p_token: S.token });
    applyLoad(d);
    await addPendingRecs();
    applyLook();
    cacheNow();
    setOffline(false);
    route();
    flushRecs();
    purgeTrash();
  } catch (e) {
    const c = loadCache();
    if (e.code === 'offline' && c && c.token === S.token) { applyLoad(c); await addPendingRecs(); applyLook(); setOffline(true); route(); return; }
    if (e.code === 'bad_token') { lsSet('lb_token', null); renderLogin(); toast(e.message); return; }
    app.innerHTML = `<div class="screen home"><div class="wrap content" style="padding-top:30vh;text-align:center">
      <p>${esc(e.message)}</p><p><button class="btn" id="retry">もう一度</button></p>
      <p><button class="btn sub" id="tologin">ログイン画面へ</button></p></div></div>`;
    $('#retry').onclick = boot;
    $('#tologin').onclick = () => { lsSet('lb_token', null); renderLogin(); };
  }
}

async function logout(silent) {
  if (!silent && !(await confirmAsk('ログアウトしますか？', S.token === LOCAL_TOKEN ? 'ためしに入れたデータはこの端末に残ります。' : '', 'ログアウト'))) return;
  if (S.token && S.token !== LOCAL_TOKEN) rpc('lb_logout', { p_token: S.token }).catch(() => {});
  lsSet('lb_token', null); lsSet(CACHE_KEY, null); saveQueue([]); setOffline(false);
  S.token = null; S.artists = new Map(); S.songs = new Map(); S.recs = []; S.backup = null;
  S.settings = { ...DEFAULTS };
  applyLook();
  history.replaceState(null, '', location.pathname);
  renderLogin();
}

// ---------- ログイン ----------
function renderLogin(mode = 'login', err = '', invite = '') {
  S.view = 'login';
  setBarColor('#4a2c1a');
  document.documentElement.dataset.theme = 'light';
  const tab = (m, label) => `<button data-m="${m}" class="${mode === m ? 'on' : ''}">${label}</button>`;
  app.innerHTML = `<div class="screen loginS"><form class="wrap content" id="lf" autocomplete="on">
    <h1 class="logo">LYRIC BOOK<small>歌詞と歌い方のノート</small></h1>
    <div class="tabs">${tab('login', 'ログイン')}${tab('signup', 'はじめて')}${tab('reset', '忘れたとき')}</div>
    <label class="field"><span>ユーザー名</span><input class="input" id="lf-user" autocomplete="username" autocapitalize="off" required></label>
    ${mode === 'signup' ? `<label class="field"><span>招待の合言葉（2人目からいります。はじめての人は空のまま）</span><input class="input" id="lf-inv" autocapitalize="characters" placeholder="ABCD-EFGH" value="${esc(invite)}"></label>` : ''}
    ${invite && mode === 'signup' ? '<p class="muted" style="font-size:.82rem;margin:0">招待リンクから開きました。ユーザー名とパスワードを決めて「登録してはじめる」を押してください。</p>' : ''}
    ${mode === 'reset' ? `<label class="field"><span>復活用の合言葉</span><input class="input" id="lf-rec" autocapitalize="characters" placeholder="ABCD-EFGH-JKLM" required></label>` : ''}
    <label class="field"><span>${mode === 'reset' ? '新しいパスワード' : 'パスワード'}</span><input class="input" id="lf-pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
    <div class="err" role="alert">${esc(err)}</div>
    <button class="btn" type="submit">${{ login: 'ログイン', signup: '登録してはじめる', reset: 'パスワードを作り直す' }[mode]}</button>
  </form></div>`;
  $$('.tabs button', app).forEach(b => b.onclick = e => { e.preventDefault(); renderLogin(b.dataset.m, '', invite); });
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#lf button[type="submit"]'); btn.disabled = true;
    const u = $('#lf-user').value.trim(), p = $('#lf-pass').value;
    try {
      let r;
      if (mode === 'login') r = await rpc('lb_login', { p_username: u, p_password: p });
      else if (mode === 'signup') r = await rpc('lb_signup', { p_username: u, p_password: p, p_invite: $('#lf-inv').value.trim() });
      else r = await rpc('lb_reset', { p_username: u, p_recovery: $('#lf-rec').value, p_password: p });
      lsSet('lb_token', r.token);
      if (r.recovery) showRecovery(r.recovery, boot); else boot();
    } catch (er) { btn.disabled = false; $('.err', app).textContent = er.message; }
  };
}
function showRecovery(code, then) {
  openSheet(`<h3>復活用の合言葉</h3>
    <p>パスワードを忘れたときに使います。<b>スクショかメモで必ず残してください。</b>あとからは見られません。</p>
    <div class="recovery">${esc(code)}</div>
    <div class="acts"><button class="btn sub" data-s="copy">コピー</button><button class="btn" data-s="ok">残しました</button></div>`, {
    copy: () => navigator.clipboard?.writeText(code).then(() => toast('コピーしました'), () => toast('長押しでコピーしてください')),
    ok: () => closeSheet(),
  }, then);
}

// ---------- 画面の切りかえ ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', () => { if (S.token) route(); });

function route(keep = false) {
  if (!keep) { closeSheet(); hideAnno(); stopPlayback(); stopPerform(); }
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/');
  const q = new URLSearchParams(qs || '');
  if (!keep) window.scrollTo(0, 0);
  if (parts[0] === 'artist' && alive(S.artists.get(parts[1]))) return renderArtist(parts[1]);
  if (parts[0] === 'song' && alive(S.songs.get(parts[1]))) return renderSong(parts[1]);
  if (parts[0] === 'edit' && alive(S.songs.get(parts[1]))) return renderEdit(parts[1]);
  if (parts[0] === 'play' && alive(S.songs.get(parts[1]))) return renderPerform(parts[1], q);
  if (parts[0] === 'setlists') return renderSetlists();
  if (parts[0] === 'setlist' && (S.settings.setlists || []).some(x => x.id === parts[1])) return renderSetlist(parts[1]);
  if (parts[0] === 'trash') return renderTrash();
  if (parts[0] === 'shared') return renderShared(parts[1], parts[2]);
  if (parts[0] === 'new') return renderEdit(null, q);
  if (parts[0] === 'help') return renderHelp(q.get('tab') || 'marks');
  if (parts[0] === 'settings') return renderSettings();
  renderHome();
}

// 戻る：アプリの中で進んできたなら1つ前へ、そうでなければ決まった場所へ
let navDepth = 0;
function back(fallback) {
  if (navDepth > 0) { navDepth--; history.back(); }
  else { history.replaceState(null, '', fallback); route(); }
}
window.addEventListener('click', e => {
  const a = e.target.closest('[data-go]');
  if (!a) return;
  e.preventDefault();
  if (location.hash !== a.dataset.go) navDepth++;
  go(a.dataset.go);
});

// ---------- ホーム ----------
function renderHome() {
  if (S.tab.startsWith('t:') && !S.settings.tabs.some(t => 't:' + t.id === S.tab)) S.tab = 'real';
  if (S.tab === 'shared' && !S.shared?.length) S.tab = 'real';
  S.view = 'home';
  setBarColor(S.settings.dark ? '#120d0a' : '#4a2c1a');
  app.innerHTML = `<div class="screen home">
    <div class="band"><div class="wrap">
      <div class="topbar"><button class="pill-btn" data-go="#/setlists">${I.list}セットリスト</button><div class="acts">
        <button class="pill-btn" data-go="#/help">${I.help}解説</button>
        <button class="icon-btn" data-go="#/settings" aria-label="設定">${I.gear}</button>
      </div></div>
      <h1 class="logo">LYRIC BOOK<small>歌詞と歌い方のノート</small></h1>
      <div class="seg" role="tablist">
        <button data-tab="real" class="${S.tab === 'real' ? 'on' : ''}" role="tab">実在する曲</button>
        <button data-tab="own" class="${S.tab === 'own' ? 'on' : ''}" role="tab">自作</button>
        ${S.settings.tabs.map(t => `<button data-tab="t:${esc(t.id)}" class="${S.tab === 't:' + t.id ? 'on' : ''}" role="tab">${esc(t.name)}</button>`).join('')}
        ${S.shared?.length ? `<button data-tab="shared" class="${S.tab === 'shared' ? 'on' : ''}" role="tab">みんなの曲</button>` : ''}
        <button class="seg-add" id="addTab" aria-label="タブを足す">＋</button>
      </div>
    </div></div>
    <div class="wrap content">
      <label class="search">${I.search}<input id="q" type="search" placeholder="曲名・歌手・歌い出しで検索" value="${esc(S.query)}" enterkeyhint="search"></label>
      <div id="homeList"></div>
    </div>
    <button class="fab" id="fab" aria-label="新しく入れる">${I.plus}</button>
  </div>`;
  $$('.seg button[data-tab]', app).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; lsSet('lb_tab', S.tab); renderHome(); });
  $('#addTab').onclick = async () => {
    const name = await askText({ title: '新しいタブの名前', placeholder: '例：バンド', ok: '作る' });
    if (!name?.trim()) return;
    const t = { id: 'tb' + Date.now().toString(36), name: name.trim().slice(0, 12) };
    S.settings.tabs.push(t); saveSettings();
    S.tab = 't:' + t.id; lsSet('lb_tab', S.tab); renderHome();
    toast('右下の「＋」で、曲をこのタブに入れられます');
  };
  $('.seg .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#q').oninput = e => { S.query = e.target.value; renderHomeList(); };
  $('#fab').onclick = () => {
    if (S.tab.startsWith('t:')) pickTabSongs(S.tab.slice(2));
    else if (S.tab === 'real') newArtist();
    else go(`#/new?kind=own${S.themeFilter !== 'all' ? '&theme=' + S.themeFilter : ''}`);
  };
  renderHomeList();
  autoJackets();
  loadShared();
}

// メンバーが見せている曲を読みこむ（あればホームに「みんなの曲」が出る）
async function loadShared() {
  if (S.shared || S.token === LOCAL_TOKEN || S.serverVersion < NEED_SERVER || S.offline) return;
  try {
    S.shared = await rpc('lb_shared', { p_token: S.token }) || [];
    if (S.shared.length && S.view === 'home' && !$('[data-tab="shared"]')) renderHome();
  } catch (e) { S.shared = []; }
}

function songRow(s, showKind = false) {
  const d = s.data;
  const th = d.kind === 'own' ? themeOf(d.theme_id) : null;
  const artist = d.kind === 'real' ? S.artists.get(d.artist_id)?.data.name : '';
  const title = d.title || '題名なし';
  const sub = [showKind ? (d.kind === 'own' ? '自作' : artist) : '', d.release ? d.release + '年' : '', L.firstLine(d.text) || '（歌詞はまだありません）'].filter(Boolean).join('　');
  const k = d.keys || {};
  const keyTxt = k.orig ? `原 ${esc(k.orig)}<br>${k.shift ? (k.shift > 0 ? '+' : '−') + Math.abs(k.shift) : '±0'}` : '';
  const pr = PRAC[d.practice];
  return `<button class="item" data-go="#/song/${s.id}">
    ${th ? `<span class="dot" style="--c:${esc(th.color)}"></span>` : '<span class="nodot"></span>'}
    <b>${esc(title)}${pr ? ` <span class="pbadge" style="--c:${pr.color}">${pr.label}</span>` : ''}${d.shared ? ' <span class="pbadge" style="--c:#6e3b1c">見せている</span>' : ''}</b><span class="k">${keyTxt}</span><i>${esc(sub)}</i></button>`;
}

function searchSongs(q) {
  const n = s => (s || '').normalize('NFKC').toLowerCase();
  const kq = n(q);
  return liveSongs().filter(s => {
    const d = s.data;
    const a = d.kind === 'real' ? S.artists.get(d.artist_id)?.data : null;
    return [d.title, d.yomi, a?.name, a?.yomi, d.text].some(x => n(x).includes(kq));
  }).sort((a, b) => (L.firstLine(a.data.text).normalize('NFKC').toLowerCase().includes(kq) ? 0 : 1) - (L.firstLine(b.data.text).normalize('NFKC').toLowerCase().includes(kq) ? 0 : 1) || jaCmp(a.data.title || '', b.data.title || ''));
}

function renderHomeList() {
  const box = $('#homeList'); if (!box) return;
  if (S.query.trim()) {
    const hits = searchSongs(S.query.trim());
    box.innerHTML = (hits.length ? `<div class="list">${hits.map(s => songRow(s, true)).join('')}</div>`
      : `<div class="empty" style="padding:20px 10px">ノートの中には「${esc(S.query)}」はありません</div>`)
      + `<div id="appleSugg"></div>`;
    appleSuggest(S.query.trim(), $('#appleSugg'));
    return;
  }
  // 練習の印で絞りこみ
  const pracChips = `<div class="chips prac-chips">${[['all', 'すべて'], ...Object.entries(PRAC).map(([k, v]) => [k, v.label])].map(([k, n]) => `<button class="chip ${S.prac === k ? 'on' : ''}" data-pr="${k}">${n}</button>`).join('')}</div>`;
  const bindPrac = () => $$('[data-pr]', box).forEach(b => b.onclick = () => { S.prac = b.dataset.pr; renderHomeList(); });
  if (S.tab === 'shared') {
    const list = (S.shared || []).slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    box.innerHTML = list.length ? `<p class="muted" style="font-size:.82rem;margin:0">メンバーが「見せる」にした曲です。見るだけで、直すことはできません。</p><div class="list">${list.map(x => `<button class="item" data-go="#/shared/${esc(x.owner_id)}/${esc(x.id)}"><span class="nodot"></span><b>${esc(x.data.title || '題名なし')}</b><span class="k">${esc(x.owner)}</span><i>${esc([x.artist, L.firstLine(x.data.text)].filter(Boolean).join('　'))}</i></button>`).join('')}</div>`
      : '<div class="empty">まだ見せてもらっている曲はありません。</div>';
    return;
  }
  if (S.prac !== 'all') {
    const list = liveSongs().filter(s => s.data.practice === S.prac).sort((a, b) => jaCmp(a.data.title || '', b.data.title || ''));
    box.innerHTML = pracChips + (list.length ? `<div class="list">${list.map(s => songRow(s, true)).join('')}</div>` : `<div class="empty">「${PRAC[S.prac].label}」の曲はまだありません。<br>歌詞ページで印をつけられます。</div>`);
    bindPrac();
    return;
  }
  if (S.tab.startsWith('t:')) {
    const tid = S.tab.slice(2);
    const list = liveSongs().filter(s => (s.data.tags || []).includes(tid)).sort((a, b) => jaCmp(a.data.title || '', b.data.title || ''));
    box.innerHTML = pracChips + (list.length ? `<div class="list">${list.map(s => songRow(s, true)).join('')}</div>`
      : '<div class="empty">右下の「＋」で、<br>曲をこのタブに入れられます。</div>');
    bindPrac();
    return;
  }
  if (S.tab === 'real') {
    const arts = liveArtists().sort((a, b) => jaCmp(a.data.yomi || a.data.name, b.data.yomi || b.data.name));
    const count = id => liveSongs().filter(s => s.data.artist_id === id).length;
    box.innerHTML = pracChips + `<div class="grid">${arts.map(a => `<button class="art" data-go="#/artist/${a.id}">
        ${photoBox(a)}<b>${esc(a.data.name)}</b><i>${count(a.id)}曲</i></button>`).join('')}
      <button class="art" id="addArtist"><div class="ph add">＋ 歌手を追加</div></button></div>
      ${arts.length ? '' : '<div class="empty">まずは「＋ 歌手を追加」から、<br>好きな歌手を入れてみましょう。</div>'}`;
    $('#addArtist').onclick = newArtist;
    bindPrac();
  } else {
    const songs = liveSongs().filter(s => s.data.kind === 'own' && (S.themeFilter === 'all' || s.data.theme_id === S.themeFilter))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    box.innerHTML = pracChips + `<div class="chips" style="margin-bottom:6px">
        <button class="chip ${S.themeFilter === 'all' ? 'on' : ''}" data-th="all">すべて</button>
        ${S.settings.themes.map(t => `<button class="chip ${S.themeFilter === t.id ? 'on' : ''}" data-th="${esc(t.id)}"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.name)}</button>`).join('')}
      </div>
      ${songs.length ? `<div class="list">${songs.map(s => songRow(s)).join('')}</div>` : '<div class="empty">右下の「＋」から、<br>自分の歌詞を書いてみましょう。</div>'}`;
    $$('[data-th]', box).forEach(b => b.onclick = () => { S.themeFilter = b.dataset.th; renderHomeList(); });
    bindPrac();
  }
}

function photoBox(a, big = false) {
  const d = a.data;
  const init = Array.from((d.name || '?').trim())[0] || '?';
  const img = d.photo ? `background-image:url('${esc(d.photo)}');` : '';
  return `<div class="ph ${d.photo ? 'has-img' : ''}" style="--c:${esc(hashColor(d.name))};${img}">${big ? '' : ''}${esc(init)}</div>`;
}

async function newArtist() {
  const sheet = openSheet(`<h3>歌手を追加</h3>
    <label class="field"><span>歌手の名前</span><input class="input" id="na-name" placeholder="例：あいみょん"></label>
    <label class="field"><span>よみがな（並び順に使います・なくてもOK）</span><input class="input" id="na-yomi" placeholder="例：あいみょん"></label>
    <p class="muted" style="font-size:.8rem">写真は、ジャケットを自動で探して入れます。あとから好きな写真に変えられます。</p>
    <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">追加</button></div>`, {
    no: () => closeSheet(),
    ok: async (_, sh) => {
      const name = $('#na-name', sh).value.trim();
      if (!name) { toast('歌手の名前を入れてください'); return; }
      const dup = liveArtists().find(a => a.data.name.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase());
      if (dup) { closeSheet(); go(`#/artist/${dup.id}`); return; }
      const a = await createArtist(name, $('#na-yomi', sh).value.trim());
      closeSheet();
      if (a) { go(`#/artist/${a.id}`); setTimeout(() => { if (S.view === 'artist:' + a.id) pickArtistSongs(a); }, 450); }
    },
  });
  $('#na-name', sheet).focus();
}
async function createArtist(name, yomi = '') {
  const a = { id: uuid(), data: { name, yomi }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  S.artists.set(a.id, a);
  // Google の返事は待たずに先へ進む（保存は裏で）
  send('lb_save_artist', { p_token: S.token, p_id: a.id, p_data: a.data })
    .then(r => { if (r) Object.assign(a, r); cacheSoon(); fetchJacket(a); })
    .catch(e => { S.artists.delete(a.id); fail(e); route(true); });
  return a;
}
async function saveArtist(a) {
  try { const r = await send('lb_save_artist', { p_token: S.token, p_id: a.id, p_data: a.data }); if (r) Object.assign(a, r); }
  catch (e) { fail(e); }
}

// ---------- ジャケットを自動で探す（iTunes） ----------
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'lbcb' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const clean = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { clean(); reject(new Error('timeout')); }, 9000);
    window[cb] = d => { clean(); resolve(d); };
    s.onerror = () => { clean(); reject(new Error('jsonp')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}
const nkey = x => (x || '').normalize('NFKC').toLowerCase().replace(/[\s　・.]/g, '');
// その歌手のアルバムのジャケットを集める（歌手を特定してから、その人のアルバムだけ）
const albumCache = new Map();
const artistIds = new Map();
// 曲名の後ろの飾り（(Live)・［TV size］・- Remix - など）をとる
function baseTitle(t) {
  let x = String(t || '').trim(), prev;
  do {
    prev = x;
    x = x.replace(/\s*[\(（\[［【〈<][^\(（\[［【〈<]*[\)）\]］】〉>]\s*$/, '')
      .replace(/\s+[-－–—~〜]\s*[^-－–—~〜]+[-－–—~〜]?\s*$/, m => (/live|ライブ|remix|ver|version|size|edit|mix|instrumental|acoustic|demo|inst|カラオケ|off vocal|remaster|first take|from |session|cover|arrange/i.test(m) ? '' : m))
      .trim();
  } while (x !== prev && x);
  return x || String(t || '').trim();
}
// その歌手の曲（iTunes）。同じ曲名は、いちばん早く出たものを1つ
async function artistSongs(name) {
  await artistAlbums(name).catch(() => {});
  const id = artistIds.get(name);
  let list = [];
  if (id) {
    const r = await jsonp(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=200&country=JP&lang=ja_jp`);
    list = (r.results || []).filter(x => x.wrapperType === 'track');
  }
  if (!list.length) {
    const r = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=JP&lang=ja_jp&entity=song&attribute=artistTerm&limit=200`);
    list = (r.results || []).filter(x => nkey(x.artistName) === nkey(name) || nkey(x.artistName).includes(nkey(name)));
  }
  // 「(ライブ)」「(Instrumental)」「- TV size -」などの別バージョンは、元の曲名にまとめる
  const by = new Map();
  for (const x of list) {
    const base = baseTitle(x.trackName);
    const k = nkey(base);
    const plain = nkey(x.trackName) === k; // 飾りのない、元の曲
    const cur = by.get(k);
    const better = !cur || (plain && !cur.plain) || (plain === cur.plain && String(x.releaseDate || '') < String(cur.x.releaseDate || ''));
    if (better) by.set(k, { x, plain, base });
  }
  return Array.from(by.values()).map(({ x, base }) => ({
    title: base, year: String(x.releaseDate || '').slice(0, 4), date: x.releaseDate || '',
    art: (x.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/200x200bb.'), preview: x.previewUrl || '', album: x.collectionName || '',
  }));
}
async function artistAlbums(name) {
  if (albumCache.has(name)) return albumCache.get(name);
  const enc = encodeURIComponent(name);
  let albums = [];
  try {
    const r1 = await jsonp(`https://itunes.apple.com/search?term=${enc}&country=JP&lang=ja_jp&entity=musicArtist&limit=10`);
    const list = r1.results || [];
    const art = list.find(x => nkey(x.artistName) === nkey(name)) || list.find(x => nkey(x.artistName).includes(nkey(name)));
    if (art?.artistId) artistIds.set(name, art.artistId);
    if (art?.artistId) {
      const r2 = await jsonp(`https://itunes.apple.com/lookup?id=${art.artistId}&entity=album&limit=100&country=JP&lang=ja_jp`);
      albums = (r2.results || []).filter(x => x.wrapperType === 'collection' && x.artworkUrl100);
    }
  } catch (e) { /* 次の探し方へ */ }
  if (!albums.length) {
    const r3 = await jsonp(`https://itunes.apple.com/search?term=${enc}&country=JP&lang=ja_jp&entity=album&attribute=artistTerm&limit=50`);
    const all = (r3.results || []).filter(x => x.artworkUrl100);
    albums = all.filter(x => nkey(x.artistName) === nkey(name));
    if (!albums.length) albums = all.filter(x => nkey(x.artistName).includes(nkey(name)));
  }
  // アルバム（曲が多いもの）を先に、そのあと新しい順
  albums.sort((x, y) => ((y.trackCount >= 8) - (x.trackCount >= 8)) || String(y.releaseDate || '').localeCompare(String(x.releaseDate || '')));
  const out = [];
  const seen = new Set();
  for (const x of albums) {
    const src = x.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.');
    if (seen.has(x.collectionName)) continue;
    seen.add(x.collectionName);
    out.push({ src, title: x.collectionName || '', year: String(x.releaseDate || '').slice(0, 4) });
  }
  albumCache.set(name, out);
  return out;
}
const jacketBusy = new Set();
async function fetchJacket(a, force = false) {
  if (jacketBusy.has(a.id) || (!force && (a.data.photo || a.data.auto_tried))) return;
  jacketBusy.add(a.id);
  try {
    const albums = await artistAlbums(a.data.name);
    a.data.auto_tried = true;
    if (albums[0]) {
      a.data.photo = albums[0].src;
      a.data.photos = [albums[0].src, ...(a.data.photos || []).filter(x => x !== albums[0].src)];
      a.data.photo_auto = true;
      a.data.color = await pickColor(a.data.photo);
    }
    await saveArtist(a);
    if (S.view === 'home') renderHomeList();
    if (S.view === 'artist:' + a.id) renderArtist(a.id);
  } catch (e) { /* 見つからなくても頭文字のままでよい */ }
  finally { jacketBusy.delete(a.id); }
}
function autoJackets() {
  for (const a of S.artists.values()) if (!a.data.photo && !a.data.auto_tried) fetchJacket(a);
}

// 写真のいちばん目立つ色を拾って、茶色になじむように少し混ぜて暗くする
function pickColor(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
        const px = g.getImageData(0, 0, 24, 24).data;
        let r = 0, gg = 0, b = 0, w = 0;
        for (let i = 0; i < px.length; i += 4) {
          const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
          const wt = 0.15 + (mx - mn) / 255; // 色のこい所を重く
          r += px[i] * wt; gg += px[i + 1] * wt; b += px[i + 2] * wt; w += wt;
        }
        r /= w; gg /= w; b /= w;
        // こげ茶（#7a4321）と混ぜる
        r = r * 0.6 + 0x7a * 0.4; gg = gg * 0.6 + 0x43 * 0.4; b = b * 0.6 + 0x21 * 0.4;
        // 白い文字が読めるくらいまで暗くする
        let lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const k = lum > 105 ? 105 / lum : 1;
        resolve('#' + [r, gg, b].map(v => Math.round(v * k).toString(16).padStart(2, '0')).join(''));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function darker(hex, f = 0.62) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#6d2f12';
  const n = parseInt(m[1], 16);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('');
}

// 自分の写真（スクショなど）を小さくして入れる
function pickImage() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return resolve(null);
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const c = document.createElement('canvas'); c.width = c.height = 400;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 400, 400);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('その写真は読みこめませんでした'); resolve(null); };
      img.src = url;
    };
    inp.click();
  });
}

// ---------- 歌手の画面 ----------
function renderArtist(id) {
  const a = S.artists.get(id);
  S.view = 'artist:' + id;
  const hero = a.data.color || hashColor(a.data.name);
  setBarColor(hero);
  const songs = liveSongs().filter(s => s.data.artist_id === id)
    .sort((x, y) => jaCmp(x.data.yomi || x.data.title || '', y.data.yomi || y.data.title || ''));
  const extra = (a.data.photos || []).filter(x => x !== a.data.photo);
  let last = null, rows = '';
  for (const s of songs) {
    const g = L.kanaRow(s.data.yomi || s.data.title);
    if (g !== last) { rows += `<div class="idx">${esc(g)}</div>`; last = g; }
    rows += songRow(s);
  }
  app.innerHTML = `<div class="screen artistS" style="--hero:${esc(hero)};--hero-deep:${esc(darker(hero))}">
    <div class="hero"><div class="wrap">
      <div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><div class="acts">
        <button class="icon-btn" id="photo" aria-label="写真を変える">${I.image}</button>
        <button class="icon-btn" id="amenu" aria-label="そのほか">${I.more}</button></div></div>
      <div class="row">${photoBox(a)}<div style="min-width:0"><div class="eyebrow">歌手</div><h1 class="big">${esc(a.data.name)}</h1><div class="meta"><span>${songs.length}曲</span></div></div></div>
    </div></div>
    <div class="wrap content">
      ${extra.length ? `<div class="slides" id="slides">${extra.map(src => `<div class="slide" style="background-image:url('${esc(src)}')"></div>`).join('')}</div>` : ''}
      <button class="btn sub" id="a-songs">♪ この歌手の曲から選んで入れる</button>
      ${songs.length > 6 ? `<label class="search">${I.search}<input id="aq" type="search" placeholder="この歌手の曲を検索"></label>` : ''}
      <div class="list" id="alist">${rows || '<div class="empty">右下の「＋」から、<br>この歌手の曲を入れましょう。</div>'}</div>
    </div>
    <button class="fab" data-go="#/new?kind=real&artist=${id}" aria-label="曲を追加">${I.plus}</button>
  </div>`;
  $('#bk').onclick = () => back('#/');
  $('#photo').onclick = () => managePhotos(a);
  $('#amenu').onclick = () => artistMenu(a);
  $('#a-songs').onclick = () => pickArtistSongs(a);
  startSlides();
  $('#aq')?.addEventListener('input', e => {
    const q = e.target.value.normalize('NFKC').toLowerCase();
    $$('#alist .item', app).forEach(it => { it.hidden = q && !it.textContent.normalize('NFKC').toLowerCase().includes(q); });
    $$('#alist .idx', app).forEach(ix => { ix.hidden = !!q; });
  });
}
// 写真が自動で横に流れる
let slideTimer = null;
function startSlides() {
  clearInterval(slideTimer);
  const box = $('#slides'); if (!box || box.children.length < 2) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let paused = false;
  box.addEventListener('pointerdown', () => { paused = true; setTimeout(() => { paused = false; }, 6000); });
  slideTimer = setInterval(() => {
    if (!document.body.contains(box)) { clearInterval(slideTimer); return; }
    if (paused) return;
    const w = box.firstElementChild.offsetWidth + 10;
    const end = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
    box.scrollTo({ left: end ? 0 : box.scrollLeft + w, behavior: 'smooth' });
  }, 3200);
}

// 写真の管理：一覧に出す1枚（★）を選ぶ・足す・はずす
function managePhotos(a) {
  const draw = sh => {
    const photos = a.data.photos || [];
    $('#pm-grid', sh).innerHTML = photos.length ? photos.map((src, i) => `<div class="pm-item ${src === a.data.photo ? 'main' : ''}">
        <button class="pm-img" data-s="main" data-i="${i}" style="background-image:url('${esc(src)}')" aria-label="一覧に出す写真にする"></button>
        <span class="pm-star">${src === a.data.photo ? '★ 一覧に出す' : '★にする'}</span>
        <button class="pm-x" data-s="rm" data-i="${i}" aria-label="はずす">${I.close}</button></div>`).join('')
      : '<p class="muted">まだ写真がありません。下から足してください。</p>';
  };
  const save = async () => { cacheSoon(); await saveArtist(a); if (S.view === 'artist:' + a.id) renderArtist(a.id); };
  const sheet = openSheet(`<h3>写真の管理</h3>
    <p class="muted" style="font-size:.82rem">★の写真がホームの一覧に出ます。ほかの写真は、歌手の画面の上で自動で流れます。</p>
    <div class="pm-grid" id="pm-grid"></div>
    <div class="acts" style="justify-content:flex-start"><button class="btn small" data-s="jacket">＋ ジャケットから</button><button class="btn sub small" data-s="device">＋ 端末の写真から</button></div>
    <button class="btn sub" data-s="no">とじる</button>`, {
    main: async t => {
      a.data.photo = a.data.photos[+t.dataset.i];
      a.data.color = await pickColor(a.data.photo);
      draw(sheet); save();
    },
    rm: t => {
      const src = a.data.photos[+t.dataset.i];
      a.data.photos.splice(+t.dataset.i, 1);
      if (a.data.photo === src) { a.data.photo = a.data.photos[0] || null; a.data.color = null; if (a.data.photo) pickColor(a.data.photo).then(c => { a.data.color = c; save(); }); }
      a.data.auto_tried = true;
      draw(sheet); save();
    },
    device: async () => {
      const url = await pickImage(); if (!url) return;
      a.data.photos = [...(a.data.photos || []), url];
      if (!a.data.photo) { a.data.photo = url; a.data.color = await pickColor(url); }
      draw(sheet); save();
    },
    jacket: () => pickJackets(a, () => { draw(sheet); save(); }),
    no: () => closeSheet(),
  });
  draw(sheet);
}

// ジャケットの候補から選んで足す（別の板を上に重ねる）
async function pickJackets(a, done) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg picker';
  bg.innerHTML = `<div class="sheet"><h3>ジャケットから足す</h3><p class="muted" style="font-size:.82rem">タップした写真を足します（もう一度タップではずす）。</p><div class="jk-grid" id="jk"><p class="muted">探しています…</p></div><button class="btn" data-j="ok">できた</button></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); done(); };
  bg.addEventListener('click', async e => {
    if (e.target === bg || e.target.closest('[data-j="ok"]')) { close(); return; }
    const t = e.target.closest('[data-src]'); if (!t) return;
    const src = t.dataset.src;
    a.data.photos = a.data.photos || [];
    const i = a.data.photos.indexOf(src);
    if (i >= 0) { a.data.photos.splice(i, 1); if (a.data.photo === src) { a.data.photo = a.data.photos[0] || null; a.data.color = a.data.photo ? await pickColor(a.data.photo) : null; } }
    else { a.data.photos.push(src); if (!a.data.photo) { a.data.photo = src; a.data.color = await pickColor(src); } }
    t.classList.toggle('on', i < 0);
  });
  try {
    const list = await artistAlbums(a.data.name);
    $('#jk', bg).innerHTML = list.length ? list.map(x => `<button class="jk ${(a.data.photos || []).includes(x.src) ? 'on' : ''}" data-src="${esc(x.src)}"><span style="background-image:url('${esc(x.src)}')"></span><i>${esc(x.title)}${x.year ? `（${x.year}）` : ''}</i></button>`).join('')
      : '<p class="muted">ジャケットが見つかりませんでした。名前の書き方を変えると見つかることがあります。</p>';
  } catch (e) { $('#jk', bg).innerHTML = '<p class="muted">探せませんでした。電波のよい所でもう一度ためしてください。</p>'; }
}
async function artistMenu(a) {
  const v = await menu(a.data.name, [
    { label: '名前・よみがなを変える', value: 'rename' },
    { label: 'この歌手を消す', value: 'del', danger: true },
  ]);
  if (v === 'rename') {
    const sheet = openSheet(`<h3>名前・よみがな</h3>
      <label class="field"><span>歌手の名前</span><input class="input" id="ra-name" value="${esc(a.data.name)}"></label>
      <label class="field"><span>よみがな</span><input class="input" id="ra-yomi" value="${esc(a.data.yomi || '')}"></label>
      <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">保存</button></div>`, {
      no: () => closeSheet(),
      ok: async (_, sh) => {
        const name = $('#ra-name', sh).value.trim(); if (!name) return;
        a.data.name = name; a.data.yomi = $('#ra-yomi', sh).value.trim();
        closeSheet(); renderArtist(a.id); saveArtist(a);
      },
    });
    void sheet;
  } else if (v === 'del') {
    const songs = liveSongs().filter(s => s.data.artist_id === a.id);
    if (!(await confirmAsk(`「${a.data.name}」を消しますか？`, `${songs.length ? `この歌手の${songs.length}曲もいっしょに` : ''}「最近消した曲」に移します。30日たつと消えます。それまでは設定から戻せます。`, '消す', true))) return;
    try {
      const at = new Date().toISOString();
      a.data.deleted_at = at;
      for (const s of songs) { s.data.deleted_at = at; s.data.deleted_with_artist = true; }
      toast('「最近消した曲」に移しました');
      go('#/');
      // 保存は裏で1つずつ（画面は待たない）
      (async () => { await saveArtist(a); for (const s of songs) await queueSave(s, true); })();
    } catch (e) { fail(e); }
  }
}

// ---------- 歌詞ページ ----------
const NA = '<span class="na">測定不能</span>';
function keysBlock(d) {
  const k = d.keys || {};
  const sh = +k.shift || 0;
  const est = on => on ? '<small class="est">推定</small>' : '<small>&nbsp;</small>';
  const kt = k.rangeAuto ? '<small class="est kt">KEYTUBE</small>' : '';
  // 音は「自分のキー」で鳴らす（上げ下げしていれば、そのぶんずらす）
  const note = (label, m) => {
    const has = m != null && m !== '';
    return `<div>${label}<b>${has ? esc(N.noteName(m)) : NA}</b>${has ? `<button class="play-sm" data-play="${m + sh}">▶ ${sh ? '自分のキー' : '鳴らす'}</button>` : '<small>&nbsp;</small>'}${has && label !== '歌い出し' ? kt : ''}</div>`;
  };
  const shift = sh ? (sh > 0 ? '+' : '−') + Math.abs(sh) : '±0';
  return `<div class="keys" id="keys">
    <div>原キー<b>${k.orig ? esc(k.orig) : NA}</b>${est(k.orig && k.origEst)}</div>
    <div>自分<b>${shift}</b><small>${k.orig && sh ? esc(N.shiftKey(k.orig, sh)) : '&nbsp;'}</small></div>
    ${note('最高音', k.top)}${note('最低音', k.low)}${note('歌い出し', k.start)}
  </div>
  <div class="tempo-row"><span>テンポ <b>${k.tempo ? `♩=${esc(k.tempo)}` : '測定不能'}</b>${k.tempo && k.tempoSrc === 'KEYTUBE' ? '<small class="est kt">KEYTUBE</small>' : k.tempo && k.tempoEst ? '<small class="est">推定</small>' : ''}　<span class="muted">1行 ${esc(k.bars || 2)}小節</span></span>
    <button class="btn small" data-go="#/play/${d._id || ''}">${I.stage}本番モード</button></div>
  ${recKeyHtml(k)}
  ${d._id && d.kind === 'real' ? `<button class="btn sub small src-btn" data-src-audio="1">🎵 音源から合わせる</button>` : ''}
  ${k.rangeFrom ? `<p class="src">最高音・最低音${k.tempoSrc === 'KEYTUBE' ? '・テンポ' : ''}：<a href="${esc(k.rangeFrom.url)}" target="_blank" rel="noopener">KEYTUBE</a>${k.rangeFrom.supervised ? '' : '（監修されていない値）'}</p>` : ''}`;
}

function pracBlock(d) {
  const best = (d.scores || []).reduce((m, x) => Math.max(m, +x.v || 0), 0);
  return `<div class="prac" id="prac">
    <div class="chips">${Object.entries(PRAC).map(([k, v]) => `<button class="chip ${d.practice === k ? 'on' : ''}" data-pk="${k}" style="--c:${v.color}">${v.label}</button>`).join('')}</div>
    <button class="btn sub small" data-score="1">${best ? `点数 最高 ${best}` : '点数を記録'}</button>
  </div>`;
}

function lyricsHtml(song) {
  const d = song.data;
  const anno = L.ensureAnno(d);
  const parts = L.parse(d.text);
  if (!parts.length) return `<div class="empty">まだ歌詞がありません。<br>下の「編集」から入れてください。</div>`;
  return parts.map(p => `<div class="blk">${p.name ? `<p class="part">${esc(p.name)}</p>` : ''}
    ${p.lines.map(ln => {
      const a = anno[ln.idx] || { t: ln.t };
      return `<p class="ln" data-line="${ln.idx}">${L.renderLine(a, ln.idx, S.settings.marks, S.settings.colors)}</p>`
        + (a.memo ? `<button class="memo-ln" data-memo="${ln.idx}">${esc(a.memo)}</button>` : '');
    }).join('')}</div>`).join('');
}

function recsHtml(songId) {
  const list = S.recs.filter(r => r.song_id === songId);
  if (!list.length) return '';
  return `<div class="recs"><span class="sec-lbl">録音　<span style="letter-spacing:0">（長押しで上書き・名前・消す）</span></span>
    ${list.map(r => `<div class="rec" data-rec="${r.id}">
      <button class="pb" data-recplay="${r.id}" aria-label="再生">${PLAY}</button>
      <span class="nm">${esc(r.name)}${r.pending ? ' <span class="muted" style="font-size:.75rem">（送信待ち）</span>' : ''}</span><span class="bar-p"><span></span></span><span class="t">${R.fmtTime(r.duration)}</span>
    </div>`).join('')}</div>`;
}

function renderSong(id) {
  const s = S.songs.get(id);
  const d = s.data;
  S.view = 'song:' + id;
  const th = d.kind === 'own' ? themeOf(d.theme_id) : null;
  const artist = d.kind === 'real' ? S.artists.get(d.artist_id) : null;
  setBarColor(S.settings.dark ? '#2c2119' : '#f0dfc6');
  const hasAnno = (d.anno || []).some(a => (a.m || []).length || (a.c || []).length || a.memo);
  app.innerHTML = `<div class="screen lyricS">
    <div class="head ${d.artwork ? 'has-art' : ''}"><div class="wrap">
      ${d.artwork ? `<img class="song-art" src="${esc(d.artwork)}" alt="">` : ''}
      <div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><div class="acts">
        <button class="icon-btn" data-go="#/edit/${id}" aria-label="編集">${I.edit}</button>
        <button class="icon-btn" id="smenu" aria-label="そのほか">${I.more}</button></div></div>
      <div class="eyebrow">${th ? `<i class="dot" style="--c:${esc(th.color)}"></i>自作　${esc(th.name)}` : d.kind === 'own' ? '自作' : '実在する曲'}${d.shared ? '　・メンバーに見せています' : ''}</div>
      <h1 class="big">${esc(d.title || '題名なし')}</h1>
      ${artist ? `<button class="artist-link" data-go="#/artist/${artist.id}">${esc(artist.data.name)}</button>` : ''}
      <div class="meta">${d.release ? `<span>リリース ${esc(d.release)}年</span>` : ''}<span>作成 ${fmtDate(s.created_at)}</span><span>更新 ${fmtDate(s.updated_at)}</span></div>
    </div></div>
    <div class="wrap content">
      <div id="keysBox">${keysBlock({ ...d, _id: id })}</div>
      ${pracBlock(d)}
      ${!hasAnno && !S.settings.hintDone && d.text ? `<div class="hint" id="hint">歌詞の文字をタップ（続けて選ぶときは横になぞる）すると、下に記号・色・メモのボタンが出ます。</div>` : ''}
      <div class="lyr" id="lyr">${lyricsHtml(s)}</div>
      ${d.kind === 'real' && !(d.text || '').trim() ? `<button class="btn sub" id="getLyr">J-Lyric.net から歌詞を取ってくる</button>` : ''}
      ${d.lyricSource ? `<p class="src">歌詞：<a href="${esc(d.lyricSource.url)}" target="_blank" rel="noopener">${esc(d.lyricSource.site)}</a>${d.credits?.lyricist ? `　作詞 ${esc(d.credits.lyricist)}` : ''}${d.credits?.composer ? `　作曲 ${esc(d.credits.composer)}` : ''}</p>` : ''}
      <div id="recsBox">${recsHtml(id)}</div>
    </div>
    <div class="toolbar"><div class="wrap five">
      <button class="rec-b" id="tRec">${I.mic}録音</button>
      <button data-go="#/play/${id}">${I.stage}本番</button>
      <button id="tPitch">${I.wave}音程</button>
      <button id="tKb">${I.piano}鍵盤</button>
      <button data-go="#/edit/${id}">${I.edit}編集</button>
    </div></div>
  </div>`;
  $('#bk').onclick = () => back(artist ? `#/artist/${artist.id}` : '#/');
  $('#smenu').onclick = () => songMenu(s);
  $('#tRec').onclick = () => openRecorder(id);
  $('#tKb').onclick = () => openKeyboard();
  $('#tPitch').onclick = () => openPitch(s);
  $('#getLyr')?.addEventListener('click', () => fetchLyrics(s, false));
  $('#keysBox').onclick = e => {
    if (e.target.closest('[data-go]')) return;
    const sh = e.target.closest('[data-setshift]');
    if (sh) { s.data.keys = { ...(s.data.keys || {}), shift: +sh.dataset.setshift }; queueSave(s); refreshKeys(s); toast('自分のキーを変えました'); return; }
    if (e.target.closest('[data-src-audio]')) { fromAudio(s); return; }
    if (e.target.closest('[data-go-settings]')) { go('#/settings'); return; }
    const p = e.target.closest('[data-play]'); if (p) { N.playNote(+p.dataset.play); return; }
    if (e.target.closest('#keys')) openKeyEditor(s);
  };
  $('#prac').onclick = e => {
    const c = e.target.closest('[data-pk]');
    if (c) { s.data.practice = s.data.practice === c.dataset.pk ? '' : c.dataset.pk; $('#prac').outerHTML = pracBlock(s.data); renderSongPrac(s); queueSave(s); return; }
    if (e.target.closest('[data-score]')) openScores(s);
  };
  if (d.kind === 'real' && !(d.text || '').trim() && !d.lyricsTried) fetchLyrics(s, true);
  if (d.kind === 'real' && !(d.keys || {}).rangeTried) fetchRange(s);
  if (d.kind === 'real' && !(d.keys || {}).autoTried) autoEstimate(s);
  else if (d.kind === 'real' && !d.release && !d.releaseTried) fetchRelease(s);
  showMini();
  $('#lyr').onclick = e => { const m = e.target.closest('[data-memo]'); if (m) editMemo(s, +m.dataset.memo); };
  bindRecs(id);
}

function renderSongPrac(s) {
  $('#prac').onclick = e => {
    const c = e.target.closest('[data-pk]');
    if (c) { s.data.practice = s.data.practice === c.dataset.pk ? '' : c.dataset.pk; $('#prac').outerHTML = pracBlock(s.data); renderSongPrac(s); queueSave(s); return; }
    if (e.target.closest('[data-score]')) openScores(s);
  };
}
function refreshKeys(s) {
  const box = $('#keysBox'); if (box && S.view === 'song:' + s.id) box.innerHTML = keysBlock({ ...s.data, _id: s.id });
}

// 点数の記録
function openScores(s) {
  const list = (s.data.scores || []).slice().reverse();
  openSheet(`<h3>カラオケの点数</h3>
    <div class="row2"><label class="field"><span>点数</span><input class="input" id="sc-v" type="number" inputmode="decimal" step="0.001" min="0" max="100" placeholder="例：92.5"></label>
    <label class="field"><span>メモ（なくてもOK）</span><input class="input" id="sc-m" placeholder="例：DAM 精密採点"></label></div>
    <button class="btn" data-s="add">記録する</button>
    ${list.length ? `<div class="menu-list">${list.map(x => `<div class="score-row"><b>${esc(x.v)}</b><span>${esc(x.memo || '')}</span><span class="muted">${fmtDate(x.at, false)}</span></div>`).join('')}</div>` : '<p class="muted">まだ記録はありません。</p>'}
    <button class="btn sub" data-s="no">とじる</button>`, {
    add: (_, sh) => {
      const v = parseFloat($('#sc-v', sh).value);
      if (!isFinite(v)) { toast('点数を入れてください'); return; }
      s.data.scores = [...(s.data.scores || []), { v, memo: $('#sc-m', sh).value.trim(), at: new Date().toISOString() }].slice(-50);
      queueSave(s); closeSheet();
      $('#prac').outerHTML = pracBlock(s.data); renderSongPrac(s);
      toast('記録しました');
    },
    no: () => closeSheet(),
  });
}

function refreshLyrics(s) {
  const box = $('#lyr'); if (!box) return;
  box.innerHTML = lyricsHtml(s);
}

async function songMenu(s) {
  const v = await menu(s.data.title || '題名なし', [
    { label: '編集する', value: 'edit' },
    { label: 'タブに入れる・はずす', value: 'tab' },
    { label: '音源から合わせる（タイミング・キー・テンポ）', value: 'audio' },
    { label: 'パートを自動で分ける', value: 'parts' },
    { label: 'セットリストに入れる', value: 'set' },
    ...(s.data.kind === 'real' ? [{ label: '最高音・最低音・テンポを調べなおす（KEYTUBE）', value: 'rng' }, { label: '原キーを推定しなおす', value: 'est' }, { label: '歌詞を取ってきなおす（J-Lyric.net）', value: 'lyr' }] : []),
    { label: s.data.shared ? 'メンバーに見せるのをやめる' : 'メンバーに見せる', value: 'share' },
    { label: '書きこみ（記号・色・メモ）を全部消す', value: 'clear' },
    { label: 'この曲を消す', value: 'del', danger: true },
  ]);
  if (v === 'edit') go(`#/edit/${s.id}`);
  else if (v === 'set') addToSetlist(s);
  else if (v === 'tab') tabMenu(s);
  else if (v === 'audio') fromAudio(s);
  else if (v === 'parts') {
    const t = L.autoParts(s.data.text);
    if (t === s.data.text) { toast(/[\[［【]/.test(s.data.text || '') ? 'もうパートに分かれています' : 'くり返す所が見つからず、分けられませんでした'); return; }
    s.data.versions = [{ text: s.data.text, at: s.updated_at || new Date().toISOString() }, ...(s.data.versions || [])].slice(0, 20);
    s.data.text = t; s.data.anno = L.realign(s.data.anno, t); queueSave(s); renderSong(s.id);
    toast('パートを自動で分けました。ちがっていたら編集で直してください');
  }
  else if (v === 'est') { toast('調べています…'); autoEstimate(s, true); }
  else if (v === 'lyr') fetchLyrics(s, false);
  else if (v === 'rng') fetchRange(s, true);
  else if (v === 'share') {
    s.data.shared = !s.data.shared; queueSave(s);
    toast(s.data.shared ? 'メンバーの「みんなの曲」に出るようにしました' : 'メンバーに見せるのをやめました');
    renderSong(s.id);
  }
  else if (v === 'clear') {
    if (!(await confirmAsk('書きこみを全部消しますか？', '記号・色・メモが消えます。歌詞と録音は残ります。', '消す', true))) return;
    s.data.anno = L.realign([], s.data.text);
    refreshLyrics(s); queueSave(s);
  } else if (v === 'del') deleteSong(s);
}
async function deleteSong(s) {
  if (!(await confirmAsk('この曲を消しますか？', '「最近消した曲」に移します。30日たつと消えます。それまでは設定から戻せます。', '消す', true))) return;
  try {
    s.data.deleted_at = new Date().toISOString();
    queueSave(s, true); // 保存は裏で（画面は待たない）
    toast('「最近消した曲」に移しました');
    const aid = s.data.artist_id;
    history.replaceState(null, '', s.data.kind === 'real' && alive(S.artists.get(aid)) ? `#/artist/${aid}` : '#/');
    route();
  } catch (e) { fail(e); }
}

// 同じ曲の保存は1つずつ順番に送る。重なって送ると、前の保存で変わった更新日時を知らないまま送るので、
// 自分の保存なのに「別の端末で直された」とまちがえてしまう。更新日時（p_base）と中身は、送る直前に読む。
// 歌詞の保存（書きこみはまとめて少しあとに）
// 同じ曲の保存は、前の保存が終わってから次を送る（重なると「別の端末で直された」と勘ちがいするため）
const saveChains = new Map();
function chainSave(id, job) {
  const prev = saveChains.get(id) || Promise.resolve();
  const p = prev.then(job, job);
  saveChains.set(id, p);
  p.catch(() => {}).finally(() => { if (saveChains.get(id) === p) saveChains.delete(id); });
  return p;
}
// 更新日時（p_base）と中身は、送る直前に読む
function saveSongInOrder(id, makeBody) { return chainSave(id, () => send('lb_save_song', makeBody())); }
const pendingRuns = new Map();
function queueSave(s, now = false) {
  clearTimeout(S.saveTimers.get(s.id));
  const run = () => {
    S.saveTimers.delete(s.id); pendingRuns.delete(s.id);
    return chainSave(s.id, async () => {
      const cur = S.songs.get(s.id) || s;
      try {
        const r = await send('lb_save_song', { p_token: S.token, p_id: cur.id, p_data: cur.data, p_base: cur.updated_at || null });
        if (r) { Object.assign(cur, r); if (cur !== s) Object.assign(s, r); }
        cacheSoon();
      } catch (e) {
        if (e.code === 'conflict') { await keepBoth(cur.data).catch(fail); await refresh(true); }
        else fail(e);
      }
    });
  };
  if (now) return run();
  pendingRuns.set(s.id, run);
  S.saveTimers.set(s.id, setTimeout(run, 700));
}
// アプリを閉じる・ほかのアプリに切りかえるときは、待っている保存をすぐ送る
function saveNow() { for (const [id, run] of Array.from(pendingRuns)) { clearTimeout(S.saveTimers.get(id)); run(); } }
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

// ---------- なぞって書きこむ ----------
// iPhone の青い「選ぶ印」とコピーのメニューは出さず、アプリの中で文字を選ぶ。
// タップ＝1文字。横になぞる＝続けて選ぶ（なぞり始めたら下の行へも広げられる）。縦に動かしたときはふつうにスクロール。
let pick = null;
const posOf = sp => ({ l: +sp.dataset.l, i: +sp.dataset.i });
const cmpPos = (a, b) => a.l - b.l || a.i - b.i;
function markPick() {
  $$('#lyr .pick').forEach(x => x.classList.remove('pick'));
  if (!S.sel) return;
  const { from, to } = S.sel;
  for (const sp of $$('#lyr [data-i]')) { const p = posOf(sp); if (cmpPos(p, from) >= 0 && cmpPos(p, to) <= 0) sp.classList.add('pick'); }
}
function setPick(a, b) {
  const [from, to] = cmpPos(a, b) <= 0 ? [a, b] : [b, a];
  S.sel = { from, to };
  markPick();
}
document.addEventListener('pointerdown', e => {
  pick = null;
  if (!S.view.startsWith('song:') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sp = e.target.closest?.('#lyr [data-i]'); if (!sp) return;
  pick = { id: e.pointerId, x: e.clientX, y: e.clientY, start: posOf(sp), on: false };
});
document.addEventListener('pointermove', e => {
  if (!pick || e.pointerId !== pick.id) return;
  const dx = e.clientX - pick.x, dy = e.clientY - pick.y;
  if (!pick.on) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) { pick = null; return; } // 縦はスクロール
    pick.on = true;
  }
  const sp = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#lyr [data-i]');
  if (sp) setPick(pick.start, posOf(sp));
});
// なぞっている間は画面を動かさない
document.addEventListener('touchmove', e => { if (pick?.on) e.preventDefault(); }, { passive: false });
// なぞったときは指をはなしたときにボタンを出す。タップのときは click で出す
// （指をはなした時点で出すと、あとから来る click が、出てきたボタンを押してしまう）
let dragEnd = 0;
document.addEventListener('pointerup', e => {
  if (!pick || e.pointerId !== pick.id) return;
  const p = pick; pick = null;
  if (p.on) { dragEnd = Date.now(); showAnno(); }
});
document.addEventListener('click', e => {
  if (!S.view.startsWith('song:') || Date.now() - dragEnd < 500) return;
  const sp = e.target.closest?.('#lyr [data-i]'); if (!sp) return;
  setPick(posOf(sp), posOf(sp));
  showAnno();
});
document.addEventListener('pointercancel', e => {
  if (!pick || e.pointerId !== pick.id) return;
  const on = pick.on; pick = null;
  if (on) showAnno();
});
function showAnno() {
  const s = S.songs.get(S.view.slice(5)); if (!s) return;
  let bar = $('#annobar');
  const st = S.settings;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'annobar'; bar.id = 'annobar';
    bar.addEventListener('mousedown', e => e.preventDefault()); // パソコンで選んだ文字が消えないように
    bar.addEventListener('click', e => onAnno(e, s));
    $('.lyricS').appendChild(bar);
  }
  document.body.classList.add('anno-open');
  // 選んだ行が板の下にかくれていたら、上にずらす
  requestAnimationFrame(() => {
    const ln = $(`[data-line="${S.sel?.from.l}"]`);
    if (!ln || !bar.isConnected) return;
    const r = ln.getBoundingClientRect();
    const limit = innerHeight - bar.offsetHeight - 20;
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: 'smooth' });
  });
  bar.innerHTML = `<div class="wrap">
    <div class="lbl"><span>記号（選んだ最初の文字の上につく）</span><button class="icon-btn" data-a="close" aria-label="とじる" style="width:32px;height:32px">${I.close}</button></div>
    <div class="row">${st.marks.map(m => `<button class="tool" data-a="mark" data-k="${esc(m.id)}"><b>${esc(m.label)}</b>${esc(m.name)}</button>`).join('')}</div>
    <div class="lbl"><span>線（色とは別に2種類まで重ねられる）</span></div>
    <div class="row">${L.LINES.map(x => `<button class="tool" data-a="line" data-k="${x.id}"><span class="lsw ${x.id}"></span>${x.name}</button>`).join('')}</div>
    <div class="lbl"><span>色・メモ</span></div>
    <div class="row">${st.colors.map(c => `<button class="tool" data-a="color" data-k="${esc(c.id)}"><span class="sw" style="--c:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}
      <button class="tool wide" data-a="memo">メモ</button><button class="tool wide" data-a="clear">消す</button></div>
  </div>`;
}
function hideAnno() { $('#annobar')?.remove(); S.sel = null; markPick(); document.body.classList.remove('anno-open'); }
function onAnno(e, s) {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a;
  if (a === 'close') { getSelection()?.removeAllRanges(); hideAnno(); return; }
  if (!S.sel) return;
  const anno = L.ensureAnno(s.data);
  const { from, to } = S.sel;
  if (a === 'mark') L.toggleMark(anno, from, t.dataset.k);
  else if (a === 'color') L.toggleColor(anno, from, to, t.dataset.k);
  else if (a === 'line') L.toggleLine(anno, from, to, t.dataset.k);
  else if (a === 'clear') L.clearRange(anno, from, to);
  else if (a === 'memo') { getSelection()?.removeAllRanges(); hideAnno(); editMemo(s, from.l); return; }
  if (!S.settings.hintDone) { S.settings.hintDone = true; saveSettings(); $('#hint')?.remove(); }
  getSelection()?.removeAllRanges();
  hideAnno();
  refreshLyrics(s);
  queueSave(s);
}
async function editMemo(s, l) {
  const anno = L.ensureAnno(s.data);
  const a = anno[l]; if (!a) return;
  const v = await askText({ title: 'この行のメモ', value: a.memo || '', placeholder: '例：ここは息を多めに、弱く（空にすると消えます）', multiline: true });
  if (v == null) return;
  a.memo = v.trim();
  refreshLyrics(s); queueSave(s);
}

// ---------- キーの入力 ----------
function noteOptions(sel) {
  let o = '<option value="">—</option>';
  for (let m = N.NOTE_MAX; m >= N.NOTE_MIN; m--) o += `<option value="${m}" ${+sel === m && sel !== '' && sel != null ? 'selected' : ''}>${N.noteName(m)}（${N.doremi(m)}）</option>`;
  return o;
}
const noteLabel = v => (v != null && v !== '' ? `${N.noteName(v)}（${N.doremi(v)}）` : '測定不能');
function noteBtn(id, v, empty) { return `<button type="button" class="select note-btn" id="${id}" data-v="${v ?? ''}">${v == null || v === '' ? (empty || noteLabel(v)) : noteLabel(v)}</button>`; }

// 鍵盤で音を選ぶ（ほかの板の上に重ねて出す）。決めた音・null（測定不能）・undefined（やめた）を返す
function pickNote(cur, title) {
  return new Promise(resolve => {
    let sel = cur != null && cur !== '' ? +cur : null;
    const bg = document.createElement('div');
    bg.className = 'sheet-bg picker';
    bg.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>
      <div class="kb-name" id="pn-name">${sel != null ? noteLabel(sel) : '鍵盤をタップして選んでください'}</div>
      ${keyboardHtml(sel)}
      <div class="acts"><button class="btn sub" data-p="none">測定不能にする</button><button class="btn sub" data-p="cancel">やめる</button><button class="btn" data-p="ok">決める</button></div></div>`;
    document.body.appendChild(bg);
    const finish = v => { bg.remove(); resolve(v); };
    $('.kb', bg).addEventListener('pointerdown', e => {
      const k = e.target.closest('[data-k]'); if (!k) return;
      sel = +k.dataset.k;
      N.playNote(sel);
      $$('.kb .sel', bg).forEach(x => x.classList.remove('sel'));
      k.classList.add('sel');
      $('#pn-name', bg).textContent = noteLabel(sel);
    });
    bg.addEventListener('click', e => {
      if (e.target === bg) return finish(undefined);
      const t = e.target.closest('[data-p]'); if (!t) return;
      finish(t.dataset.p === 'ok' ? sel : t.dataset.p === 'none' ? null : undefined);
    });
    const w = $('.kb-wrap', bg);
    requestAnimationFrame(() => {
      const target = sel != null ? $(`[data-k="${sel}"]`, bg) : null;
      w.scrollLeft = target ? target.offsetLeft - w.clientWidth / 2 + 20 : 14 * 45 - 20;
    });
  });
}
function keyOptions(sel) {
  const ks = [...N.KEYS, ...N.KEYS.map(k => k + 'm')];
  return '<option value="">—</option>' + ks.map(k => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');
}
function shiftOptions(sel) {
  let o = '';
  for (let i = 7; i >= -7; i--) o += `<option value="${i}" ${+(sel || 0) === i ? 'selected' : ''}>${i > 0 ? '+' + i : i < 0 ? '−' + -i : '±0'}</option>`;
  return o;
}
function keyFields(k = {}) {
  return `<div class="row2">
      <label class="field"><span>原キー${k.origEst ? '（推定）' : ''}</span><select class="select" id="k-orig">${keyOptions(k.orig)}</select></label>
      <label class="field"><span>自分のキー（いくつ上げ下げ）</span><select class="select" id="k-shift">${shiftOptions(k.shift)}</select></label>
    </div>
    <div class="row3">
      <label class="field"><span>最高音</span>${noteBtn('k-top', k.top)}</label>
      <label class="field"><span>最低音</span>${noteBtn('k-low', k.low)}</label>
      <label class="field"><span>歌い出し</span>${noteBtn('k-start', k.start)}</label>
    </div>
    <div class="row2">
      <label class="field"><span>テンポ（♩=いくつ）${k.tempoEst ? '（推定）' : ''}</span><input class="input" id="k-tempo" type="number" inputmode="numeric" min="30" max="300" value="${esc(k.tempo || '')}" placeholder="例：120"></label>
      <label class="field"><span>本番モードで1行に使う小節</span><select class="select" id="k-bars">${[1, 1.5, 2, 3, 4].map(b => `<option value="${b}" ${+(k.bars || 2) === b ? 'selected' : ''}>${b}小節</option>`).join('')}</select></label>
    </div>`;
}
function readKeyFields(root, old = {}) {
  const num = id => { const v = $(id, root).dataset.v; return v === '' || v == null ? null : +v; };
  const orig = $('#k-orig', root).value;
  const tempo = +$('#k-tempo', root).value || null;
  return {
    ...old,
    orig, shift: +$('#k-shift', root).value || 0, top: num('#k-top'), low: num('#k-low'), start: num('#k-start'),
    tempo, bars: +$('#k-bars', root).value || 2,
    origEst: !!(old.origEst && orig === old.orig), tempoEst: !!(old.tempoEst && tempo === old.tempo),
    rangeAuto: !!(old.rangeAuto && num('#k-top') === old.top && num('#k-low') === old.low),
    tempoSrc: tempo === old.tempo ? old.tempoSrc || '' : '',
  };
}
function bindNotePreview(root) {
  const names = { 'k-top': '最高音', 'k-low': '最低音', 'k-start': '歌い出しの音' };
  $$('.note-btn', root).forEach(b => b.onclick = async e => {
    e.preventDefault();
    const v = await pickNote(b.dataset.v, names[b.id] || '音を選ぶ');
    if (v === undefined) return;
    b.dataset.v = v ?? '';
    b.textContent = noteLabel(v);
  });
}
function openKeyEditor(s) {
  const sheet = openSheet(`<h3>キーと音の高さ</h3>${keyFields(s.data.keys)}
    <p class="muted" style="font-size:.8rem">音のボタンを押すと鍵盤が出ます。わからない音は「測定不能」のままで大丈夫です。</p>
    <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">保存</button></div>`, {
    no: () => closeSheet(),
    ok: (_, sh) => { s.data.keys = readKeyFields(sh, s.data.keys || {}); closeSheet(); renderSong(s.id); queueSave(s, true); },
  });
  bindNotePreview(sheet);
}

// ---------- 原キーとテンポを、試聴の音から推定する ----------
const estBusy = new Set();
async function autoEstimate(s, force = false) {
  const d = s.data;
  if (d.kind !== 'real' || estBusy.has(s.id)) return;
  const k = d.keys || (d.keys = {});
  if (!force && k.autoTried) return;
  estBusy.add(s.id);
  k.autoTried = true;
  try {
    const artist = S.artists.get(d.artist_id)?.data.name || '';
    const res = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + d.title)}&country=JP&lang=ja_jp&entity=song&limit=15`);
    const list = res.results || [];
    const t = nkey(d.title), ar = nkey(artist);
    const hit = (d.preview ? { previewUrl: d.preview } : null)
      || list.find(r => nkey(r.trackName) === t && nkey(r.artistName) === ar)
      || list.find(r => nkey(r.trackName).includes(t) && nkey(r.artistName).includes(ar))
      || list.find(r => nkey(r.trackName).includes(t));
    const dated = list.find(r => nkey(r.trackName) === t && nkey(r.artistName) === ar) || list.find(r => nkey(r.trackName).includes(t) && r.releaseDate);
    if (!d.release && dated?.releaseDate) { d.release = String(dated.releaseDate).slice(0, 4); d.releaseTried = true; }
    if (!d.artwork && dated?.artworkUrl100) d.artwork = dated.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.');
    if (!hit?.previewUrl) { if (force) toast('試聴が見つからず、調べられませんでした'); queueSave(s); return; }
    let buf;
    try { const r = await fetch(hit.previewUrl); if (!r.ok) throw new Error('fetch'); buf = await r.arrayBuffer(); }
    catch (e) {
      const pv = await rpc('lb_preview', { p_token: S.token, p_url: hit.previewUrl });
      buf = await R.base64ToBlob(pv.audio, pv.mime).arrayBuffer();
    }
    const est = await A.estimateKeyTempo(buf);
    if (est.key && (force || !k.orig || k.origEst)) { k.orig = est.key; k.origEst = true; }
    if (est.tempo && (force || !k.tempo || k.tempoEst)) { k.tempo = est.tempo; k.tempoEst = true; }
    queueSave(s);
    refreshKeys(s);
    if (force) toast(`原キー ${k.orig || '測定不能'}・テンポ ${k.tempo || '測定不能'}（推定）`);
  } catch (e) {
    console.warn(e);
    queueSave(s);
    if (force) toast('調べられませんでした');
  } finally { estBusy.delete(s.id); }
}

// ---------- 録音 ----------
let player = null; // { id, audio }
const blobCache = new Map();
function stopPlayback() {
  if (player) { player.audio.pause(); player = null; }
  $$('.rec.playing').forEach(r => { r.classList.remove('playing'); const b = $('.pb', r); if (b) b.innerHTML = PLAY; });
  $('#mini')?.remove();
}
// 歌詞を見ながら聞けるように、下に小さな再生バーを出す
function showMini() {
  $('#mini')?.remove();
  if (!player || !S.view.startsWith('song:')) return;
  const r = S.recs.find(x => x.id === player.id); if (!r) return;
  const el = document.createElement('div');
  el.id = 'mini'; el.className = 'mini';
  el.innerHTML = `<div class="wrap"><button class="pb" id="mini-pb" aria-label="一時停止">${player.audio.paused ? PLAY : PAUSE}</button>
    <span class="nm">${esc(r.name)}</span><span class="bar-p"><span id="mini-bar"></span></span><span class="t" id="mini-t">${R.fmtTime(player.audio.currentTime)}</span>
    <button class="icon-btn" id="mini-x" aria-label="止める">${I.close}</button></div>`;
  document.body.appendChild(el);
  $('#mini-pb').onclick = () => togglePlay(player.id);
  $('#mini-x').onclick = () => stopPlayback();
}
function bindRecs(songId) {
  const box = $('#recsBox'); if (!box) return;
  let lpTimer = null, longFired = false;
  box.onpointerdown = e => {
    const row = e.target.closest('[data-rec]'); if (!row) return;
    longFired = false;
    lpTimer = setTimeout(() => { longFired = true; navigator.vibrate?.(15); recMenu(songId, row.dataset.rec); }, 550);
  };
  const cancel = () => clearTimeout(lpTimer);
  box.onpointerup = cancel; box.onpointercancel = cancel; box.onpointerleave = cancel;
  box.onpointermove = e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); };
  box.oncontextmenu = e => { if (e.target.closest('[data-rec]')) e.preventDefault(); };
  box.onclick = e => {
    if (longFired) { longFired = false; return; }
    const b = e.target.closest('[data-recplay]'); if (b) togglePlay(b.dataset.recplay);
  };
}
async function togglePlay(id) {
  if (player?.id === id) { if (player.audio.paused) { player.audio.play(); setPlayingUi(id, true); } else { player.audio.pause(); setPlayingUi(id, false); } return; }
  stopPlayback();
  const r = S.recs.find(x => x.id === id); if (!r) return;
  const row = $(`[data-rec="${id}"]`);
  try {
    if (row && !blobCache.get(id + r.updated_at)) $('.pb', row).innerHTML = '…';
    const url = await recUrl(r);
    const audio = new Audio(url);
    player = { id, audio };
    audio.ontimeupdate = () => {
      const dur = isFinite(audio.duration) && audio.duration ? audio.duration : r.duration;
      const pc = dur ? Math.min(100, audio.currentTime / dur * 100) + '%' : '0';
      const bar = $(`[data-rec="${id}"] .bar-p span`); if (bar) bar.style.width = pc;
      const mb = $('#mini-bar'); if (mb) mb.style.width = pc;
      const mt = $('#mini-t'); if (mt) mt.textContent = R.fmtTime(audio.currentTime);
    };
    audio.onended = () => { setPlayingUi(id, false); const bar = $(`[data-rec="${id}"] .bar-p span`); if (bar) bar.style.width = '0'; player = null; $('#mini')?.remove(); };
    await audio.play();
    setPlayingUi(id, true);
    showMini();
  } catch (e) { setPlayingUi(id, false); fail(e); }
}
function setPlayingUi(id, on) {
  const mp = $('#mini-pb'); if (mp) mp.innerHTML = on ? PAUSE : PLAY;
  const row = $(`[data-rec="${id}"]`); if (!row) return;
  row.classList.toggle('playing', on);
  $('.pb', row).innerHTML = on ? PAUSE : PLAY;
}
async function recMenu(songId, id) {
  const r = S.recs.find(x => x.id === id); if (!r) return;
  if (r.pending) {
    const v = await menu(r.name + '（送信待ち）', [{ label: 'この録音を消す', value: 'del', danger: true }]);
    if (v === 'del' && await confirmAsk(`「${r.name}」を消しますか？`, 'まだ送っていない録音です。元にはもどせません。', '消す', true)) {
      await idb('del', id); S.recs = S.recs.filter(x => x.id !== id); stopPlayback(); refreshRecs(songId);
    }
    return;
  }
  const v = await menu(r.name, [
    { label: '上書きして録り直す', value: 'over' },
    { label: '名前を変える', value: 'rename' },
    { label: 'この録音を消す', value: 'del', danger: true },
  ]);
  if (v === 'over') openRecorder(songId, id);
  else if (v === 'rename') {
    const name = await askText({ title: '録音の名前', value: r.name });
    if (!name?.trim()) return;
    const old = r.name;
    r.name = name.trim().slice(0, 40); refreshRecs(songId);
    send('lb_rename_recording', { p_token: S.token, p_id: id, p_name: name.trim() }).then(() => cacheSoon())
      .catch(e => { r.name = old; refreshRecs(songId); fail(e); });
  } else if (v === 'del') {
    if (!(await confirmAsk(`「${r.name}」を消しますか？`, '元にはもどせません。', '消す', true))) return;
    const before = S.recs;
    S.recs = S.recs.filter(x => x.id !== id); stopPlayback(); refreshRecs(songId);
    send('lb_delete_recording', { p_token: S.token, p_id: id }).then(() => cacheSoon())
      .catch(e => { S.recs = before; refreshRecs(songId); fail(e); });
  }
}
function refreshRecs(songId) { const b = $('#recsBox'); if (b) { b.innerHTML = recsHtml(songId); } }

function openRecorder(songId, replaceId = null) {
  stopPlayback();
  if (!R.canRecord()) { toast('この端末では録音できません'); return; }
  const target = replaceId ? S.recs.find(x => x.id === replaceId) : null;
  let rec = null, state = 'idle';
  const sheet = openSheet(`<h3>${target ? `「${esc(target.name)}」を録り直す` : '録音'}</h3>
    <p class="muted" id="rs-msg">${target ? '前の録音は消えて、新しい録音に入れかわります。' : '下のボタンで録音を始めます。'}</p>
    <div class="rec-time" id="rs-time">0:00</div>
    <button class="rec-big idle" data-s="toggle" aria-label="録音"><span></span></button>
    <div class="acts"><button class="btn sub" data-s="no">やめる</button></div>`, {
    no: () => closeSheet(),
    toggle: async () => {
      if (state === 'idle') {
        try {
          rec = await R.startRecording(sec => { const t = $('#rs-time', sheet); if (t) t.textContent = R.fmtTime(sec); });
          state = 'rec';
          $('.rec-big', sheet).classList.remove('idle');
          $('#rs-msg', sheet).innerHTML = '<span class="rec-dot"></span>録音しています。もう一度押すと止まって保存します。';
        } catch (e) { toast('マイクが使えませんでした。設定でマイクを許可してください'); }
      } else if (state === 'rec') {
        state = 'saving';
        $('#rs-msg', sheet).textContent = '保存しています…';
        $('.rec-big', sheet).disabled = true;
        try {
          const { blob, mime, duration } = await rec.stop();
          const audio = await R.blobToBase64(blob);
          let r;
          if (target) {
            r = await rpc('lb_replace_recording', { p_token: S.token, p_id: target.id, p_mime: mime, p_duration: duration, p_audio: audio });
            Object.assign(target, r);
            keepAudio(target, audio, mime);
          } else {
            const nums = S.recs.filter(x => x.song_id === songId).map(x => +(x.name.match(/^録音 (\d+)$/)?.[1] || 0));
            const name = `録音 ${Math.max(0, ...nums) + 1}`;
            savingUi(1);
            try {
              r = await rpc('lb_add_recording', { p_token: S.token, p_song_id: songId, p_name: name, p_mime: mime, p_duration: duration, p_audio: audio });
              S.recs.push(r);
              keepAudio(r, audio, mime);
            } catch (e) {
              if (e.code !== 'offline') throw e;
              const pid = 'pending-' + uuid();
              const at = new Date().toISOString();
              await idb('put', { id: pid, song_id: songId, name, mime, duration, audio, created_at: at });
              S.recs.push({ id: pid, song_id: songId, name, mime, duration, size: audio.length, created_at: at, updated_at: at, pending: true });
              setOffline(true);
            } finally { savingUi(-1); }
          }
          cacheSoon();
          state = 'done';
          closeSheet();
          refreshRecs(songId);
          toast(S.recs.some(x => x.pending && x.song_id === songId) && S.offline ? '電波がないので、この端末に録音を残しました。つながったら送ります' : '録音を保存しました');
        } catch (e) { state = 'idle'; closeSheet(); fail(e); }
      }
    },
  }, () => { if (state === 'rec') rec?.cancel(); N.resetAudio(); });
}

// ---------- 送信待ちの録音（IndexedDB） ----------
function idb(op, arg) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open('lyricbook', 2); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recs')) db.createObjectStore('recs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const store = typeof op === 'string' && op.startsWith('a:') ? 'audio' : 'recs';
      op = op.replace(/^a:/, '');
      const tx = db.transaction(store, op === 'get' || op === 'all' || op === 'keys' ? 'readonly' : 'readwrite');
      const st = tx.objectStore(store);
      if (op === 'keys') { const r = st.getAllKeys(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close(); return; }
      const r = op === 'get' ? st.get(arg) : op === 'all' ? st.getAll() : op === 'put' ? st.put(arg) : st.delete(arg);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      tx.oncomplete = () => db.close();
    };
  });
}
// 一度聞いた録音・自分で録った録音を、端末にとっておく（次からすぐ再生できる）
const audioKey = r => r.id + '@' + (r.updated_at || '');
async function keepAudio(r, audio, mime) { try { await idb('a:put', { id: audioKey(r), audio, mime }); } catch (e) { /* いっぱいなど */ } }
async function localAudio(r) { try { return await idb('a:get', audioKey(r)); } catch (e) { return null; } }
// もう使わない録音のとっておきを消す
async function pruneAudio() {
  try {
    const keep = new Set(S.recs.map(audioKey));
    for (const k of await idb('a:keys') || []) if (!keep.has(k)) await idb('a:del', k);
  } catch (e) { /* 使えない端末 */ }
}

async function addPendingRecs() {
  try {
    const list = await idb('all');
    for (const p of list || []) if (!S.recs.some(x => x.id === p.id)) S.recs.push({ id: p.id, song_id: p.song_id, name: p.name, mime: p.mime, duration: p.duration, size: p.audio.length, created_at: p.created_at, updated_at: p.created_at, pending: true });
  } catch (e) { /* 使えない端末 */ }
}
let recFlushing = false;
async function flushRecs() {
  if (recFlushing || !S.token || S.token === LOCAL_TOKEN) return;
  recFlushing = true;
  try {
    const list = await idb('all');
    for (const p of list || []) {
      if (!S.songs.has(p.song_id)) continue;
      try {
        const r = await rpc('lb_add_recording', { p_token: S.token, p_song_id: p.song_id, p_name: p.name, p_mime: p.mime, p_duration: p.duration, p_audio: p.audio });
        keepAudio(r, p.audio, p.mime);
        await idb('del', p.id);
        S.recs = S.recs.filter(x => x.id !== p.id);
        S.recs.push(r);
        const sg = S.songs.get(p.song_id);
        if (sg && sg.data.sourceRec === p.id) { sg.data.sourceRec = r.id; queueSave(sg); }
        if (S.view === 'song:' + p.song_id) refreshRecs(p.song_id);
      } catch (e) { if (e.code === 'offline') break; }
    }
  } catch (e) { /* 使えない端末 */ }
  finally { recFlushing = false; }
}

// ---------- 音程チェック（マイクで声の高さを測る） ----------
function openPitch(song) {
  let stream = null, ctx = null, raf = 0, hist = [], hi = null, lo = null, cur = null, first = null;
  const k = song?.data.keys || {};
  const sheet = openSheet(`<h3>音程チェック</h3>
    <p class="muted" style="font-size:.82rem">マイクに向かって歌うか、原曲を流すと、いまの音の高さが出ます。</p>
    <div class="pitch-now"><b id="pt-note">—</b><span id="pt-dore">声を出してください</span>
      <div class="cents"><span id="pt-needle"></span></div></div>
    <div class="pitch-range"><span>いちばん高い <b id="pt-hi">—</b></span><span>いちばん低い <b id="pt-lo">—</b></span><span>最初の音 <b id="pt-first">—</b></span><button class="btn sub small" data-s="reset">リセット</button></div>
    ${song ? '<p class="muted" style="font-size:.78rem;margin:0">原曲の歌い出しから流すと、「最初の音」が歌い出しの音の候補になります。</p>' : ''}
    ${song ? `<div class="acts" style="justify-content:flex-start">
      <button class="btn small" data-s="top">いちばん高い音を「最高音」に</button>
      <button class="btn small" data-s="low">いちばん低い音を「最低音」に</button>
      <button class="btn small" data-s="start">最初の音を「歌い出し」に</button></div>` : ''}
    <div class="acts" style="justify-content:flex-start">
      <button class="btn sub small" data-s="mytop">「自分の最高音」に</button>
      <button class="btn sub small" data-s="mylow">「自分の最低音」に</button></div>
    <button class="btn sub" data-s="no">とじる</button>`, {
    reset: () => { hi = lo = first = null; $('#pt-hi', sheet).textContent = '—'; $('#pt-lo', sheet).textContent = '—'; $('#pt-first', sheet).textContent = '—'; },
    top: () => setVal('top', hi), low: () => setVal('low', lo), start: () => setVal('start', first ?? cur),
    mytop: () => { if (hi == null) return toast('まだ音を聞きとれていません'); S.settings.myTop = hi; saveSettings(); toast(`自分の最高音を ${N.noteName(hi)} にしました`); },
    mylow: () => { if (lo == null) return toast('まだ音を聞きとれていません'); S.settings.myLow = lo; saveSettings(); toast(`自分の最低音を ${N.noteName(lo)} にしました`); },
    no: () => closeSheet(),
  }, () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); ctx?.close?.(); N.resetAudio(); });
  function setVal(key, v) {
    if (v == null) { toast('まだ音を聞きとれていません'); return; }
    song.data.keys = { ...k, [key]: v };
    queueSave(song); refreshKeys(song);
    toast(`${{ top: '最高音', low: '最低音', start: '歌い出し' }[key]}を ${N.noteName(v)} にしました`);
  }
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { $('#pt-dore', sheet).textContent = 'マイクが使えませんでした。設定でマイクを許可してください'; return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      an.getFloatTimeDomainData(buf);
      const f = A.detectPitch(buf, ctx.sampleRate);
      if (!sheet.isConnected) return;
      if (!f) return;
      const midi = A.freqToMidi(f);
      hist.push(midi); if (hist.length > 5) hist.shift();
      const med = hist.slice().sort((a, b) => a - b)[Math.floor(hist.length / 2)];
      const n = Math.round(med);
      if (n < N.NOTE_MIN - 12 || n > N.NOTE_MAX + 12) return;
      cur = n;
      $('#pt-note', sheet).textContent = N.noteName(n);
      $('#pt-dore', sheet).textContent = N.doremi(n);
      $('#pt-needle', sheet).style.left = (50 + (med - n) * 90) + '%';
      // 3回つづけて同じ音のときだけ、高い・低いに入れる（ノイズよけ）
      if (hist.length >= 3 && hist.slice(-3).every(x => Math.round(x) === n)) {
        if (hi == null || n > hi) { hi = n; $('#pt-hi', sheet).textContent = N.noteName(n); }
        if (lo == null || n < lo) { lo = n; $('#pt-lo', sheet).textContent = N.noteName(n); }
        if (first == null) { first = n; $('#pt-first', sheet).textContent = N.noteName(n); }
      }
    };
    loop();
  })();
}

// ---------- 鍵盤 ----------
function keyboardHtml(selected = null) {
  let whites = '', blacks = '', x = 0;
  for (let m = N.NOTE_MIN; m <= N.NOTE_MAX; m++) {
    if (N.isBlack(m)) {
      blacks += `<button class="b ${m === selected ? 'sel' : ''}" data-k="${m}" style="left:${x * 45 - 15}px" aria-label="${N.noteName(m)}"></button>`;
    } else {
      const nm = N.noteName(m);
      whites += `<button class="w ${m === selected ? 'sel' : ''}" data-k="${m}" aria-label="${nm}">${m % 12 === 0 || m % 12 === 9 ? `<b>${nm}</b>` : ''}${N.doremi(m)}</button>`;
      x++;
    }
  }
  return `<div class="kb-wrap" id="kbw"><div class="kb" style="width:${x * 45 + 1}px">${whites}${blacks}</div></div>`;
}
function openKeyboard() {
  const sheet = openSheet(`<h3>鍵盤</h3><div class="kb-name" id="kbn">押すと音が鳴ります</div>${keyboardHtml()}
    <div class="acts"><button class="btn sub" data-s="no">とじる</button></div>`, { no: () => closeSheet() });
  const kb = $('.kb', sheet);
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('[data-k]'); if (!k) return;
    const m = +k.dataset.k;
    N.playNote(m);
    k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 180);
    $('#kbn', sheet).textContent = `${N.noteName(m)}（${N.doremi(m)}）`;
  });
  // C4 あたりから見えるように
  const w = $('#kbw', sheet);
  requestAnimationFrame(() => { w.scrollLeft = 14 * 45 - 20; });
}

// ---------- 編集 ----------
function renderEdit(id, q = new URLSearchParams()) {
  const s = id ? S.songs.get(id) : null;
  const d = s ? JSON.parse(JSON.stringify(s.data)) : {
    kind: q.get('kind') === 'own' ? 'own' : 'real', title: '', yomi: '', artist_id: q.get('artist') || '', theme_id: q.get('theme') || '', text: '', anno: [], keys: {},
  };
  S.view = 'edit';
  setBarColor(S.settings.dark ? '#1c1511' : '#fbf4e8');
  const arts = liveArtists().sort((a, b) => jaCmp(a.data.yomi || a.data.name, b.data.yomi || b.data.name));
  const draw = () => {
    app.innerHTML = `<div class="screen lyricS editS">
      <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><strong style="color:var(--title)">${s ? '編集' : '新しい曲'}</strong>${s ? '<button class="btn danger small" id="e-del">この曲を消す</button>' : '<span></span>'}</div></div>
      <div class="wrap content">
        ${s ? '' : `<div class="seg2"><button data-kind="real" class="${d.kind === 'real' ? 'on' : ''}">実在する曲</button><button data-kind="own" class="${d.kind === 'own' ? 'on' : ''}">自作</button></div>`}
        ${d.kind === 'real' ? `
          <label class="field"><span>歌手</span><select class="select" id="e-artist">
            <option value="">選んでください</option>${arts.map(a => `<option value="${a.id}" ${a.id === d.artist_id ? 'selected' : ''}>${esc(a.data.name)}</option>`).join('')}
            <option value="__new">＋ 新しい歌手</option></select></label>
          <label class="field" id="e-newart" hidden><span>新しい歌手の名前</span><input class="input" id="e-artname" placeholder="例：あいみょん"></label>
          <label class="field"><span>曲名${s ? '' : '（打つと Apple の曲の候補が出ます）'}</span><input class="input" id="e-title" value="${esc(d.title)}" autocomplete="off"></label>
          ${s ? '' : '<div class="sugg" id="e-sugg"></div>'}
          <label class="field"><span>曲名のよみがな（あいうえお順に使います・なくてもOK）</span><input class="input" id="e-yomi" value="${esc(d.yomi || '')}" placeholder="ひらがなで"></label>`
        : `
          <label class="field"><span>曲名（まだ決まっていなければ空でOK）</span><input class="input" id="e-title" value="${esc(d.title)}" placeholder="題名なし"></label>
          <div class="field"><span>テーマ</span><div class="chips" id="e-themes">
            <button class="chip ${!d.theme_id ? 'on' : ''}" data-th="">なし</button>
            ${S.settings.themes.map(t => `<button class="chip ${d.theme_id === t.id ? 'on' : ''}" data-th="${esc(t.id)}"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.name)}</button>`).join('')}
          </div></div>`}
        <div class="field"><span>キーと音の高さ</span>${keyFields(d.keys)}</div>
        <div class="field"><span>歌詞（パートのボタンを押すと、その場所に区切りが入ります）</span>
          <div class="chips">${L.PART_NAMES.map(p => `<button class="chip" data-part="${esc(p)}">${esc(p)}</button>`).join('')}<button class="chip" data-part="?">＋ ほか</button></div>
          <textarea class="textarea" id="e-text" placeholder="[Aメロ]&#10;ここに歌詞を書くか、貼りつけます&#10;&#10;[間奏 8]&#10;&#10;[サビ]&#10;…">${esc(d.text)}</textarea>
          <div class="ed-tools">
            <label class="chk"><input type="checkbox" id="e-cnt" ${d.kind === 'own' ? 'checked' : ''}> 行ごとの文字数</label>
            ${(d.versions || []).length ? `<button class="btn sub small" id="e-ver">前の版（${d.versions.length}）</button>` : ''}
          </div>
          <div class="counts" id="e-counts"></div>
          <span class="muted" style="font-size:.78rem">「[間奏 8]」のように数字を入れると、本番モードでその小節ぶん待ちます。</span>
        </div>
        <div class="ocr">
          <strong>写真の歌詞を文字にする</strong>
          <ol>
            <li>下のボタンで歌詞の写真を選ぶ</li>
            <li>出てきた写真の文字を<b>長押し</b>して「すべてを選択」→「コピー」</li>
            <li>上の歌詞の欄を長押しして「ペースト」</li>
          </ol>
          <button class="btn sub small" id="e-photo" style="align-self:flex-start">${'写真を選ぶ'}</button>
          <div id="e-photo-box"></div>
          <span class="muted" style="font-size:.78rem">iPhone・iPad の「テキスト認識表示」を使います。写真は保存されません。</span>
        </div>
        ${S.settings.tabs.length ? `<div class="field"><span>タブ（いくつでも）</span><div class="chips" id="e-tabs">${S.settings.tabs.map(t => `<button class="chip ${(d.tags || []).includes(t.id) ? 'on' : ''}" data-tg="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div></div>` : ''}
      </div>
      <div class="save-bar"><div class="wrap"><button class="btn big-save" id="save">保存する</button></div>
      </div>
    </div>`;
    bind();
  };
  // 入力中の値を d に写す（種類を切りかえても消えないように）
  const collect = () => {
    const v = sel => $(sel)?.value;
    if ($('#e-title')) d.title = v('#e-title').trim();
    if ($('#e-yomi')) d.yomi = v('#e-yomi').trim();
    if ($('#e-artist') && v('#e-artist') !== '__new') d.artist_id = v('#e-artist');
    if ($('#e-text')) d.text = v('#e-text');
    if ($('#k-orig')) d.keys = readKeyFields(app);
  };
  const bind = () => {
    $('#bk').onclick = () => back(s ? `#/song/${s.id}` : '#/');
    $$('[data-kind]').forEach(b => b.onclick = () => { collect(); d.kind = b.dataset.kind; draw(); });
    $$('#e-themes [data-th]').forEach(b => b.onclick = () => { d.theme_id = b.dataset.th; $$('#e-themes .chip').forEach(c => c.classList.toggle('on', c === b)); });
    const artSel = $('#e-artist');
    if (artSel) artSel.onchange = () => { $('#e-newart').hidden = artSel.value !== '__new'; if (artSel.value === '__new') $('#e-artname').focus(); };
    bindNotePreview(app);
    const ta = $('#e-text');
    $$('[data-part]').forEach(b => b.onclick = async () => {
      let name = b.dataset.part;
      if (name === '?') { name = await askText({ title: 'パートの名前', placeholder: '例：Dメロ', ok: '入れる' }); if (!name?.trim()) return; name = name.trim(); }
      const pos = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, pos), after = ta.value.slice(pos);
      const ins = (before && !before.endsWith('\n') ? '\n' : '') + (before.trim() && !before.endsWith('\n\n') ? '\n' : '') + `[${name}]\n`;
      ta.value = before + ins + after;
      const c = (before + ins).length;
      ta.focus(); ta.setSelectionRange(c, c);
    });
    $('#e-photo').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => { const f = inp.files?.[0]; if (!f) return; $('#e-photo-box').innerHTML = `<img alt="歌詞の写真" src="${URL.createObjectURL(f)}">`; };
      inp.click();
    };
    $('#save').onclick = save;
    // 曲名を打つと候補（新しい実在の曲だけ）
    const sg = $('#e-sugg');
    if (sg) {
      let tmr;
      $('#e-title').addEventListener('input', e => {
        clearTimeout(tmr);
        const q = e.target.value.trim();
        if (d._picked && d._picked !== q) { d.preview = ''; d.artwork = ''; d.release = ''; d.releaseTried = false; d._picked = ''; }
        if (q.length < 2) { sg.innerHTML = ''; return; }
        tmr = setTimeout(async () => {
          const art = $('#e-artist')?.value && $('#e-artist').value !== '__new' ? S.artists.get($('#e-artist').value)?.data.name || '' : '';
          let list = [];
          try { list = await appleSongs((q + ' ' + art).trim(), 8); } catch (er) { return; }
          if ($('#e-title')?.value.trim() !== q) return;
          sg.innerHTML = list.length ? list.map((x, i) => `<button class="as-row" data-sg="${i}"><span class="as-art" style="background-image:url('${esc(x.art)}')"></span><span class="as-t"><b>${esc(x.title)}</b><i>${esc([x.artist, x.year && x.year + '年'].filter(Boolean).join('　'))}</i></span><span class="as-k">選ぶ</span></button>`).join('') : '';
          $$('[data-sg]', sg).forEach(b => b.onclick = () => {
            const x = list[+b.dataset.sg];
            $('#e-title').value = x.title;
            Object.assign(d, { release: x.year || d.release || '', releaseTried: true, preview: x.preview || '', artwork: x.art || '', _picked: x.title });
            const a = liveArtists().find(z => nkey(z.data.name) === nkey(x.artist));
            const sel = $('#e-artist');
            if (sel) {
              if (a) { sel.value = a.id; $('#e-newart').hidden = true; }
              else { sel.value = '__new'; $('#e-newart').hidden = false; $('#e-artname').value = x.artist; }
            }
            sg.innerHTML = `<p class="muted" style="font-size:.82rem;margin:0">「${esc(x.title)}／${esc(x.artist)}」を選びました。「保存する」を押すと、歌詞・最高音・最低音・テンポ・原キーを自動で入れます。</p>`;
          });
        }, 400);
      });
    }
    $$('#e-tabs [data-tg]').forEach(b => b.onclick = () => {
      const id = b.dataset.tg; d.tags = d.tags || [];
      const i = d.tags.indexOf(id); if (i >= 0) d.tags.splice(i, 1); else d.tags.push(id);
      b.classList.toggle('on', i < 0);
    });
    $('#e-del')?.addEventListener('click', () => deleteSong(s));
    const counts = () => {
      const box = $('#e-counts');
      if (!$('#e-cnt').checked) { box.innerHTML = ''; return; }
      box.innerHTML = L.parse(ta.value).map(p => (p.name ? `<div class="cn-part">${esc(p.name)}${p.bars ? `（${p.bars}小節）` : ''}</div>` : '')
        + p.lines.filter(l => l.t.trim()).map(l => `<div class="cn"><b>${L.charCount(l.t)}</b><span>${esc(l.t)}</span></div>`).join('')).join('');
    };
    ta.addEventListener('input', counts);
    $('#e-cnt').onchange = counts;
    counts();
    $('#e-ver')?.addEventListener('click', () => openVersions(d, ta, counts));
  };
  const save = async () => {
    collect();
    const btn = $('#save'); btn.disabled = true;
    try {
      if (d.kind === 'real') {
        if ($('#e-artist').value === '__new') {
          const name = $('#e-artname').value.trim();
          if (!name) { toast('新しい歌手の名前を入れてください'); btn.disabled = false; return; }
          const dup = liveArtists().find(a => a.data.name.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase());
          const a = dup || await createArtist(name);
          if (!a) { btn.disabled = false; return; }
          d.artist_id = a.id;
        }
        if (!d.artist_id) { toast('歌手を選んでください'); btn.disabled = false; return; }
        if (!d.title) { toast('曲名を入れてください'); btn.disabled = false; return; }
        delete d.theme_id;
      } else { delete d.artist_id; delete d.yomi; }
      delete d._picked;
      d.anno = L.realign(d.anno, d.text);
      // 歌詞を書き直したら、前の版を残す（20個まで）
      if (s && s.data.text && s.data.text !== d.text) d.versions = [{ text: s.data.text, at: s.updated_at || new Date().toISOString() }, ...(s.data.versions || [])].slice(0, 20);
      const sid = s?.id || uuid();
      const obj = s || { id: sid, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      clearTimeout(S.saveTimers.get(sid)); S.saveTimers.delete(sid); pendingRuns.delete(sid);
      const base = s?.updated_at || null;
      // 待っているあいだに自動で入った歌詞・音域などは、こちらにも写す（編集で空のままのとき）
      if (s) for (const key of ['lyricSource', 'credits', 'release', 'artwork', 'timing', 'sourceRec']) if (d[key] == null && s.data[key] != null) d[key] = s.data[key];
      obj.data = d;
      S.songs.set(sid, obj);
      // Google の返事は待たずに曲のページへ（保存は裏で。同じ曲のあとの保存は、この保存のあとに送られる）
      saveSongInOrder(sid, () => ({ p_token: S.token, p_id: sid, p_data: obj.data, p_base: s ? (obj.updated_at || base) : null }))
        .then(r => { if (r) Object.assign(obj, r); cacheSoon(); })
        .catch(async e => {
          if (e.code !== 'conflict') { fail(e); return; }
          await keepBoth(obj.data).catch(fail);
          await refresh(true);
        });
      cacheSoon();
      if (!s && d.kind === 'real') { autoEstimate(obj); fetchRange(obj); if (!(d.text || '').trim()) fetchLyrics(obj, true); }
      if (s && navDepth > 0 && location.hash === `#/edit/${sid}`) { navDepth--; history.back(); }
      else { history.replaceState(null, '', `#/song/${sid}`); route(); }
      toast('保存しました');
    } catch (e) { btn.disabled = false; fail(e); }
  };
  draw();
}

function openVersions(d, ta, after) {
  const list = d.versions || [];
  openSheet(`<h3>前の版</h3><p class="muted" style="font-size:.82rem">タップすると、その版を歌詞の欄に入れます（保存するまでは決まりません）。</p>
    <div class="menu-list">${list.map((v, i) => `<button data-s="pick" data-i="${i}"><b>${fmtDate(v.at)}</b><br><span class="muted" style="font-size:.82rem">${esc(L.firstLine(v.text).slice(0, 40))}</span></button>`).join('')}</div>
    <button class="btn sub" data-s="no">とじる</button>`, {
    pick: t => { ta.value = list[+t.dataset.i].text; closeSheet(); after(); toast('前の版を入れました。よければ「保存」を押してください'); },
    no: () => closeSheet(),
  });
}

// ---------- Apple の曲の候補 ----------
async function appleSongs(term, limit = 10) {
  const r = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=JP&lang=ja_jp&entity=song&limit=${limit * 2}`);
  const seen = new Set(), out = [];
  for (const x of r.results || []) {
    const title = baseTitle(x.trackName);
    const k = nkey(title) + '|' + nkey(x.artistName);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ title, artist: x.artistName, year: String(x.releaseDate || '').slice(0, 4), art: (x.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/300x300bb.'), preview: x.previewUrl || '' });
    if (out.length >= limit) break;
  }
  return out;
}
// ホームの検索：ノートにない曲を、Apple の曲から入れる
let appleTimer;
function appleSuggest(q, box) {
  clearTimeout(appleTimer);
  if (!box || q.length < 2) return;
  appleTimer = setTimeout(async () => {
    let list = [];
    try { list = await appleSongs(q, 8); } catch (e) { return; }
    if (S.query.trim() !== q || !box.isConnected) return;
    const has = x => liveSongs().some(z => z.data.kind === 'real' && nkey(z.data.title) === nkey(x.title) && nkey(S.artists.get(z.data.artist_id)?.data.name) === nkey(x.artist));
    const shown = list.filter(x => !has(x));
    if (!shown.length) return;
    box.innerHTML = `<p class="sec-lbl" style="margin:14px 0 4px">Apple の曲から入れる</p><div class="as-list">${shown.map((x, i) => `<button class="as-row" data-ap="${i}"><span class="as-art" style="background-image:url('${esc(x.art)}')"></span><span class="as-t"><b>${esc(x.title)}</b><i>${esc([x.artist, x.year && x.year + '年'].filter(Boolean).join('　'))}</i></span><span class="as-k">＋</span></button>`).join('')}</div>`;
    $$('[data-ap]', box).forEach(b => b.onclick = () => addAppleSong(shown[+b.dataset.ap]));
  }, 450);
}
async function addAppleSong(x) {
  try {
    let a = liveArtists().find(z => nkey(z.data.name) === nkey(x.artist));
    if (!a) a = await createArtist(x.artist);
    if (!a) return;
    const id = uuid();
    const data = { kind: 'real', artist_id: a.id, title: x.title, yomi: '', text: '', anno: [], keys: {}, release: x.year || '', releaseTried: true, preview: x.preview || '', artwork: x.art || '' };
    const obj = { id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    S.songs.set(id, obj);
    // Google の返事は待たずに曲のページへ（あとの自動の保存は、この保存のあとに送られる）
    saveSongInOrder(id, () => ({ p_token: S.token, p_id: id, p_data: obj.data }))
      .then(r => { if (r) Object.assign(obj, r); cacheSoon(); })
      .catch(e => { S.songs.delete(id); fail(e); route(true); });
    S.query = '';
    toast('入れました。歌詞・最高音・最低音・テンポを自動で調べています');
    go(`#/song/${id}`);
  } catch (e) { fail(e); }
}

// ---------- 自分に合うキー ----------
function recommendShift(k) {
  const myTop = S.settings.myTop, myLow = S.settings.myLow;
  if (k.top == null || myTop == null) return null;
  for (const s of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7]) {
    if (k.top + s <= myTop && (myLow == null || k.low == null || k.low + s >= myLow)) return { s, fit: true };
  }
  return { s: Math.max(-7, Math.min(7, myTop - k.top)), fit: false };
}
function recKeyHtml(k) {
  const fmt = s => (s ? (s > 0 ? '+' : '−') + Math.abs(s) : '±0');
  if (k.top == null) return '';
  if (S.settings.myTop == null) return `<p class="src">設定で「自分の最高音・最低音」を入れると、おすすめのキーが出ます　<button class="linkish" data-go-settings="1">設定へ</button></p>`;
  const r = recommendShift(k);
  if (!r) return '';
  const now = +k.shift || 0;
  return `<div class="rec-key"><span>あなたにおすすめ：<b>${fmt(r.s)}</b>${k.orig ? `（${esc(N.shiftKey(k.orig, r.s))}）` : ''}<br><span class="muted" style="font-size:.76rem">${r.fit ? '自分の音域に、曲の最高音・最低音がおさまるキー' : '曲の音域が広いので、最高音を自分の最高音に合わせたキー'}</span></span>${r.s !== now ? `<button class="btn small" data-setshift="${r.s}">これにする</button>` : '<span class="muted" style="font-size:.8rem">いまのキー</span>'}</div>`;
}

// ---------- おまかせセットリスト ----------
async function autoSetlist() {
  const v = await menu('おまかせで作る', [
    { label: '十八番から5曲', value: 'best' },
    { label: '歌える曲から5曲', value: 'can' },
    { label: '自分の音域で歌える曲（いまのキーのまま）', value: 'range' },
    { label: 'ぜんぶの曲からランダムに5曲', value: 'any' },
  ]);
  if (!v) return;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let pool = liveSongs(), name;
  if (v === 'best' || v === 'can') { pool = pool.filter(z => z.data.practice === v); name = v === 'best' ? '十八番' : '歌える曲'; }
  else if (v === 'range') {
    const myTop = S.settings.myTop, myLow = S.settings.myLow;
    if (myTop == null) { toast('設定で「自分の最高音」を入れてください'); return; }
    pool = pool.filter(z => { const k = z.data.keys || {}; const sh = +k.shift || 0; return k.top != null && k.top + sh <= myTop && (myLow == null || k.low == null || k.low + sh >= myLow); });
    name = '音域で歌える曲';
  } else name = 'ランダム';
  if (!pool.length) { toast('当てはまる曲がありませんでした'); return; }
  const pick = shuffle(pool.slice()).slice(0, v === 'range' ? 10 : 5);
  const d = new Date();
  const x = { id: 'sl' + Date.now().toString(36), name: `おまかせ：${name}（${d.getMonth() + 1}/${d.getDate()}）`, songs: pick.map(z => z.id) };
  setlists().push(x); saveSettings(); go(`#/setlist/${x.id}`);
  toast(`${pick.length}曲で作りました`);
}

// ---------- 音源から合わせる（音源は、えらべば軽くしてドライブに保存） ----------
// タップの仕方は2つ。「行が終わったら」（おすすめ）：歌い出しで1回、あとは行を歌い終えるたびに1回。
// 「行が始まったら」：行の頭でタップ。どちらも d.timing = { mode, lines, times(始まり), ends(終わり) } に入れる。
function timingFromTaps(mode, taps, lines) {
  const n = lines.length;
  if (mode !== 'end') return { times: lines.map((_, i) => taps[i] ?? null), ends: null };
  const ends = lines.map((_, i) => taps[i + 1] ?? null);
  const times = lines.map((_, i) => (i === 0 ? taps[0] ?? null : ends[i - 1]));
  // 間奏をはさんだ行は、前の行の終わりから始めると早すぎるので、文字の数から始まりを決める
  const rates = [];
  for (let i = 0; i < n; i++) if (times[i] != null && ends[i] != null) rates.push((ends[i] - times[i]) / Math.max(1, L.charCount(lines[i].t)));
  rates.sort((a, b) => a - b);
  const rate = rates.length ? rates[rates.length >> 1] : 0.3;
  for (let i = 1; i < n; i++) {
    if (times[i] == null || ends[i] == null) continue;
    const need = rate * Math.max(1, L.charCount(lines[i].t)) * 1.3 + 0.8;
    if (ends[i] - times[i] > need + 3) times[i] = +(ends[i] - need).toFixed(2);
  }
  return { times, ends };
}
const SRC_NAME = '原曲の音源';
function fromAudio(s) {
  const d = s.data;
  const lines = timeline(d).filter(it => it.type === 'line');
  if (!lines.length) { toast('先に歌詞を入れてください'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'audio/*,video/*';
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f) return;
    let pcm = null, mono = null, url = URL.createObjectURL(f), taps = [], audio = null, raf = 0, done = false;
    let mode = lsGet('lb_tap_mode') === 'start' ? 'start' : 'end';
    const keepDefault = lsGet('lb_keep_src') !== '0';
    const need = () => (mode === 'end' ? lines.length + 1 : lines.length);
    const sheet = openSheet(`<h3>音源から合わせる</h3>
      <p class="muted" id="fa-msg" style="font-size:.85rem">音を読みこんでいます…</p>
      <div class="fa-box" id="fa-box" hidden>
        <div class="fa-mode" role="group" aria-label="タップの仕方">
          <button class="chip" data-s="mEnd" id="fa-m-end">行が終わったらタップ</button>
          <button class="chip" data-s="mStart" id="fa-m-start">行が始まったらタップ</button>
        </div>
        <div class="fa-now"><span class="muted" id="fa-pos"></span><b id="fa-line"></b><span class="muted" id="fa-next"></span></div>
        <div class="fa-time" id="fa-time">0:00</div>
        <button class="btn fa-tap" data-s="tap" id="fa-tap" disabled>まず「▶ 流す」を押してください</button>
        <div class="fa-acts"><button class="btn sub small" data-s="play" id="fa-play">▶ 流す</button><button class="btn sub small" data-s="undo">1つもどる</button><button class="btn sub small" data-s="redo">最初から</button></div>
        <label class="fa-keep"><input type="checkbox" id="fa-keep" ${keepDefault ? 'checked' : ''}><span>この音源も保存する<small>軽くしてドライブに入れます。本番モードで、どの端末でも歌詞といっしょに流せます</small></span></label>
      </div>
      <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="save" id="fa-save" disabled>保存する</button></div>`, {
      play: () => { if (!audio) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); },
      tap: () => { if (!audio || audio.paused || taps.length >= need()) return; taps.push(+audio.currentTime.toFixed(2)); navigator.vibrate?.(8); show(); },
      undo: () => { taps.pop(); if (audio) audio.currentTime = Math.max(0, (taps.length ? taps[taps.length - 1] : 0) - 1.5); show(); },
      redo: () => { taps = []; if (audio) audio.currentTime = 0; show(); },
      mEnd: () => setMode('end'),
      mStart: () => setMode('start'),
      save: () => finish(),
      no: () => closeSheet(),
    }, () => { cancelAnimationFrame(raf); audio?.pause(); URL.revokeObjectURL(url); });
    const setMode = m => {
      if (m === mode) return;
      if (taps.length) { toast('「最初から」を押してから変えてください'); return; }
      mode = m; lsSet('lb_tap_mode', m === 'start' ? 'start' : null); taps = []; show();
    };
    const show = () => {
      $('#fa-m-end', sheet).classList.toggle('on', mode === 'end');
      $('#fa-m-start', sheet).classList.toggle('on', mode === 'start');
      const playing = audio && !audio.paused;
      $('#fa-play', sheet).textContent = playing ? '❚❚ 止める' : '▶ 流す';
      const full = taps.length >= need();
      const tapBtn = $('#fa-tap', sheet);
      tapBtn.disabled = !playing || full;
      // いま歌っている行
      const i = mode === 'end' ? Math.max(0, taps.length - 1) : Math.min(taps.length, lines.length - 1);
      if (full) {
        $('#fa-pos', sheet).textContent = `全部の行（${lines.length}行）を合わせました`;
        $('#fa-line', sheet).textContent = '「保存する」を押してください';
        $('#fa-next', sheet).textContent = '';
        tapBtn.textContent = 'おわり';
      } else if (mode === 'end' && !taps.length) {
        $('#fa-pos', sheet).textContent = '最初の行';
        $('#fa-line', sheet).textContent = lines[0].t;
        $('#fa-next', sheet).textContent = '歌い出しで1回タップ。そのあとは、行を歌い終えるたびにタップ';
        tapBtn.textContent = playing ? '歌い出しでタップ' : 'まず「▶ 流す」を押してください';
      } else {
        $('#fa-pos', sheet).textContent = `${i + 1} / ${lines.length}`;
        $('#fa-line', sheet).textContent = lines[i].t;
        $('#fa-next', sheet).textContent = lines[i + 1] ? '次：' + lines[i + 1].t : '（最後の行）';
        tapBtn.textContent = !playing ? (taps.length ? '止まっています。「▶ 流す」で続き' : 'まず「▶ 流す」を押してください') : mode === 'end' ? 'この行が終わったらタップ' : 'この行が始まったらタップ';
      }
      $('#fa-save', sheet).disabled = !mono && !taps.length;
    };
    const finish = async () => {
      if (done) return; done = true;
      const keep = !!$('#fa-keep', sheet)?.checked && !!pcm;
      lsSet('lb_keep_src', $('#fa-keep', sheet)?.checked ? null : '0');
      const cur = S.songs.get(s.id) || s, cd = cur.data;
      const k = cd.keys || (cd.keys = {});
      const msg = [];
      const usable = mode === 'end' ? Math.max(0, taps.length - 1) : taps.length;
      if (usable) {
        const { times, ends } = timingFromTaps(mode, taps, lines);
        cd.timing = { mode, lines: lines.map(it => it.t), times, ...(ends ? { ends } : {}), at: new Date().toISOString() };
        msg.push(`タイミング ${usable}行`);
      }
      const t0 = taps[0];
      if (mono && t0 != null && (k.start == null || k.startEst)) {
        const n = A.startNote(mono, t0, t0 + 1.6);
        if (n != null) { k.start = n; k.startEst = true; msg.push(`歌い出し ${N.noteName(n)}（推定）`); }
      }
      if (mono) {
        try {
          const est = A.estimateFromMono(mono);
          if (est.key && (!k.orig || k.origEst)) { k.orig = est.key; k.origEst = true; msg.push(`原キー ${est.key}`); }
          if (est.tempo && k.tempoSrc !== 'KEYTUBE' && (!k.tempo || k.tempoEst)) { k.tempo = est.tempo; k.tempoEst = true; msg.push(`テンポ ${est.tempo}`); }
        } catch (e) { /* 分析できなくてもタイミングは残す */ }
      }
      queueSave(cur);
      const keepPcm = keep ? pcm : null;
      pcm = null; mono = null;
      closeSheet();
      if (S.view === 'song:' + s.id) renderSong(s.id);
      if (keepPcm) { toast((msg.length ? msg.join('・') + 'を入れました。' : '') + '音源を保存しています…'); saveSource(s.id, keepPcm); }
      else toast(msg.length ? msg.join('・') + 'を入れました' : '変えたところはありません');
    };
    try {
      pcm = await E.decodeMono(await f.arrayBuffer());
      mono = E.half(pcm);
    } catch (e) {
      pcm = null; mono = null;
      $('#fa-msg', sheet).textContent = 'この音源は分析・保存ができませんでした（タイミングのタップだけできます）。音声ファイルにするとうまくいくことがあります。';
      const kp = $('#fa-keep', sheet); if (kp) { kp.checked = false; kp.disabled = true; kp.closest('label').classList.add('off'); }
    }
    if (!sheet.isConnected) return;
    if (mono) $('#fa-msg', sheet).textContent = '▶ で流して、大きいボタンをタップしていきます。タップしなくても「保存する」でキーとテンポだけ入れられます。';
    audio = new Audio(url);
    audio.setAttribute('playsinline', '');
    audio.onplay = audio.onpause = audio.onended = () => show();
    $('#fa-box', sheet).hidden = false;
    show();
    const tick = () => { raf = requestAnimationFrame(tick); const t = $('#fa-time', sheet); if (t && audio) t.textContent = R.fmtTime(audio.currentTime); };
    tick();
  };
  inp.click();
}
// 音源を軽くして「原曲の音源」という録音として保存する（前のがあれば入れかえ）
async function saveSource(songId, pcm) {
  savingUi(1);
  try {
    const { blob, mime, duration } = await E.encodeForSave(pcm);
    const audio = await R.blobToBase64(blob);
    const s = S.songs.get(songId); if (!s) return;
    const old = S.recs.find(x => x.id === s.data.sourceRec && x.song_id === songId);
    let r;
    try {
      if (old && !old.pending) {
        r = await rpc('lb_replace_recording', { p_token: S.token, p_id: old.id, p_mime: mime, p_duration: duration, p_audio: audio });
        Object.assign(old, r); r = old;
      } else {
        r = await rpc('lb_add_recording', { p_token: S.token, p_song_id: songId, p_name: SRC_NAME, p_mime: mime, p_duration: duration, p_audio: audio });
        S.recs.push(r);
      }
      keepAudio(r, audio, mime);
    } catch (e) {
      if (e.code !== 'offline') throw e;
      const pid = 'pending-' + uuid(), at = new Date().toISOString();
      await idb('put', { id: pid, song_id: songId, name: SRC_NAME, mime, duration, audio, created_at: at });
      r = { id: pid, song_id: songId, name: SRC_NAME, mime, duration, size: audio.length, created_at: at, updated_at: at, pending: true };
      S.recs.push(r);
      setOffline(true);
    }
    const cur = S.songs.get(songId);
    if (cur && cur.data.sourceRec !== r.id) { cur.data.sourceRec = r.id; queueSave(cur); }
    cacheSoon();
    if (S.view === 'song:' + songId) refreshRecs(songId);
    toast(r.pending ? '電波がないので、音源はこの端末に残しました。つながったら送ります' : '音源を保存しました。本番モードでいっしょに流せます');
  } catch (e) { fail(e); }
  finally { savingUi(-1); }
}
// 録音の音を、端末のとっておき → ドライブ の順で探して、再生できるURLにする
async function recUrl(r) {
  let url = blobCache.get(r.id + r.updated_at);
  if (url) return url;
  let got = null;
  if (r.pending) got = await idb('get', r.id).catch(() => null);
  if (!got) got = await localAudio(r);
  if (!got) { got = await rpc('lb_get_recording', { p_token: S.token, p_id: r.id }); keepAudio(r, got.audio, got.mime); }
  url = URL.createObjectURL(R.base64ToBlob(got.audio, got.mime));
  blobCache.set(r.id + r.updated_at, url);
  return url;
}

// ---------- 最高音・最低音・テンポを KEYTUBE から取ってくる（1曲ずつ） ----------
const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const sciToMidi = x => { const m = /^([A-G]#?)(-?\d)$/.exec(x || ''); return m ? (+m[2] + 1) * 12 + NOTE_IDX[m[1]] : null; };
const rangeBusy = new Set();
async function fetchRange(s, force = false) {
  const d = s.data;
  if (d.kind !== 'real' || rangeBusy.has(s.id) || S.token === LOCAL_TOKEN) return;
  const k = d.keys || (d.keys = {});
  if (!force && k.rangeTried) return;
  if (S.serverVersion < 5) { if (force) toast('Googleに貼ったコードを新しくすると使えます'); return; }
  rangeBusy.add(s.id);
  k.rangeTried = true;
  if (force) toast('KEYTUBE で調べています…');
  try {
    const artist = S.artists.get(d.artist_id)?.data.name || '';
    const r = await rpc('lb_range', { p_token: S.token, p_title: d.title, p_artist: artist });
    const kk = (S.songs.get(s.id)?.data || d).keys || k;
    const lo = sciToMidi(r.low), hi = sciToMidi(r.high);
    let set = false;
    // 自分で入れた値はさわらない（「調べなおす」のときは入れかえる）
    if (lo != null && (force || kk.low == null || kk.rangeAuto)) { kk.low = lo; set = true; }
    if (hi != null && (force || kk.top == null || kk.rangeAuto)) { kk.top = hi; set = true; }
    if (set) kk.rangeAuto = true;
    if (r.bpm && (force || !kk.tempo || kk.tempoEst || kk.tempoSrc === 'KEYTUBE')) { kk.tempo = r.bpm; kk.tempoEst = false; kk.tempoSrc = 'KEYTUBE'; }
    kk.rangeFrom = { site: 'KEYTUBE', url: r.url, supervised: !!r.supervised };
    if (!d.release && r.release) d.release = r.release;
    queueSave(s);
    refreshKeys(s);
    if (force) toast(`最高音 ${hi != null ? N.noteName(hi) : '測定不能'}・最低音 ${lo != null ? N.noteName(lo) : '測定不能'}${r.bpm ? `・テンポ ${r.bpm}` : ''}（KEYTUBE）`);
  } catch (e) {
    queueSave(s);
    if (force) toast(e.message);
  } finally { rangeBusy.delete(s.id); }
}

// ---------- 歌詞を J-Lyric.net から取ってくる（1曲ずつ） ----------
const lyrBusy = new Set();
async function fetchLyrics(s, auto = false) {
  const d = s.data;
  if (d.kind !== 'real' || lyrBusy.has(s.id) || S.token === LOCAL_TOKEN) return;
  if (S.serverVersion < 4) { if (!auto) toast('Googleに貼ったコードを新しくすると使えます'); return; }
  lyrBusy.add(s.id);
  const artist = S.artists.get(d.artist_id)?.data.name || '';
  if (!auto) toast('歌詞をさがしています…');
  try {
    const r = await rpc('lb_lyrics', { p_token: S.token, p_title: d.title, p_artist: artist });
    const cur = S.songs.get(s.id)?.data || d;
    if ((cur.text || '').trim()) {
      if (auto) return; // 自動のときは、入っている歌詞をさわらない
      if (!(await confirmAsk('歌詞を入れかえますか？', 'いまの歌詞は「前の版」に残ります（編集画面から戻せます）。', '入れかえる'))) return;
      cur.versions = [{ text: cur.text, at: s.updated_at || new Date().toISOString() }, ...(cur.versions || [])].slice(0, 20);
    }
    cur.text = L.autoParts(r.text);
    cur.anno = L.realign(cur.anno, cur.text);
    cur.lyricSource = { site: 'J-Lyric.net', url: r.url };
    if (r.lyricist || r.composer) cur.credits = { lyricist: r.lyricist || '', composer: r.composer || '' };
    cur.lyricsTried = true;
    queueSave(s);
    if (S.view === 'song:' + s.id) renderSong(s.id);
    if (!auto) toast('歌詞を入れました（J-Lyric.net）');
  } catch (e) {
    d.lyricsTried = true; queueSave(s);
    if (!auto) toast(e.message);
  } finally { lyrBusy.delete(s.id); }
}

// ---------- リリース年 ----------
async function fetchRelease(s) {
  const d = s.data;
  d.releaseTried = true;
  try {
    const artist = S.artists.get(d.artist_id)?.data.name || '';
    const res = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + d.title)}&country=JP&lang=ja_jp&entity=song&limit=15`);
    const t = nkey(d.title), ar = nkey(artist);
    const hits = (res.results || []).filter(r => nkey(r.trackName) === t && (nkey(r.artistName) === ar || nkey(r.artistName).includes(ar)) && r.releaseDate);
    const first = hits.sort((x, y) => String(x.releaseDate).localeCompare(String(y.releaseDate)))[0];
    if (first) d.release = String(first.releaseDate).slice(0, 4);
    if (first?.artworkUrl100 && !d.artwork) d.artwork = first.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.');
  } catch (e) { /* 見つからなくてもよい */ }
  queueSave(s);
  if (d.release && S.view === 'song:' + s.id) renderSong(s.id);
}

// ---------- 歌手の曲の一覧から選んで入れる ----------
async function pickArtistSongs(a) {
  let list = [], order = 'new', q = '';
  const mine = () => new Set(liveSongs().filter(x => x.data.artist_id === a.id).map(x => nkey(x.data.title)));
  const row = x => {
    const has = mine().has(nkey(x.title));
    return `<button class="as-row ${has ? 'on' : ''}" data-s="add" data-t="${esc(x.title)}"><span class="as-art" style="background-image:url('${esc(x.art)}')"></span>
      <span class="as-t"><b>${esc(x.title)}</b><i>${esc([x.year && x.year + '年', x.album].filter(Boolean).join('　'))}</i></span><span class="as-k">${has ? '✓' : '＋'}</span></button>`;
  };
  const draw = sh => {
    const nq = nkey(q);
    const shown = list.filter(x => !nq || nkey(x.title).includes(nq))
      .sort((x, y) => order === 'name' ? jaCmp(x.title, y.title) : order === 'old' ? x.date.localeCompare(y.date) : y.date.localeCompare(x.date));
    $('#as-list', sh).innerHTML = shown.length ? shown.map(row).join('') : '<p class="muted">見つかりませんでした。</p>';
    $$('[data-o]', sh).forEach(b => b.classList.toggle('on', b.dataset.o === order));
  };
  const sheet = openSheet(`<h3>${esc(a.data.name)} の曲</h3>
    <p class="muted" style="font-size:.82rem">タップした曲が入ります（もう一度タップしても消えません）。入れた曲は、原キーとテンポを自動で調べます。</p>
    <label class="search">${I.search}<input id="as-q" type="search" placeholder="曲名で探す"></label>
    <div class="chips"><button class="chip" data-s="ord" data-o="new">新しい順</button><button class="chip" data-s="ord" data-o="old">古い順</button><button class="chip" data-s="ord" data-o="name">名前順</button></div>
    <div class="as-list" id="as-list"><p class="muted">探しています…</p></div>
    <button class="btn" data-s="no">できた</button>`, {
    ord: (t, sh) => { order = t.dataset.o; draw(sh); },
    add: async (t, sh) => {
      const x = list.find(z => z.title === t.dataset.t); if (!x) return;
      if (mine().has(nkey(x.title))) { toast('もう入っています'); return; }
      const id = uuid();
      const data = { kind: 'real', artist_id: a.id, title: x.title, yomi: '', text: '', anno: [], keys: {}, release: x.year || '', releaseTried: true, preview: x.preview || '', artwork: x.art || '' };
      const obj = { id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      S.songs.set(id, obj);
      t.outerHTML = row(x);
      try { const r = await saveSongInOrder(id, () => ({ p_token: S.token, p_id: id, p_data: data })); if (r) Object.assign(obj, r); autoEstimate(obj); fetchRange(obj); fetchLyrics(obj, true); }
      catch (e) { S.songs.delete(id); fail(e); draw(sh); }
    },
    no: () => closeSheet(),
  }, () => { if (S.view === 'artist:' + a.id) renderArtist(a.id); });
  $('#as-q', sheet).oninput = e => { q = e.target.value; draw(sheet); };
  try {
    list = await artistSongs(a.data.name);
    if (sheet.isConnected) draw(sheet);
  } catch (e) { $('#as-list', sheet).innerHTML = '<p class="muted">探せませんでした。電波のよい所でもう一度ためしてください。</p>'; }
}

// ---------- 自分で足したタブ ----------
function pickTabSongs(tid) {
  const tab = S.settings.tabs.find(t => t.id === tid); if (!tab) return;
  const all = liveSongs().sort((a, b) => jaCmp(a.data.title || '', b.data.title || ''));
  const has = z => (z.data.tags || []).includes(tid);
  const row = z => `<button class="item ${has(z) ? 'picked' : ''}" data-s="pick" data-id="${z.id}"><span class="nodot"></span><b>${esc(z.data.title || '題名なし')}</b><span class="k">${has(z) ? '✓' : '＋'}</span><i>${esc(z.data.kind === 'real' ? S.artists.get(z.data.artist_id)?.data.name || '' : '自作')}</i></button>`;
  const sheet = openSheet(`<h3>「${esc(tab.name)}」に入れる曲</h3><label class="search">${I.search}<input id="tp-q" type="search" placeholder="曲名・歌手で検索"></label>
    <div class="list" id="tp-list">${all.length ? all.map(row).join('') : '<p class="muted">まだ曲がありません。</p>'}</div><button class="btn" data-s="no">できた</button>`, {
    pick: t => {
      const z = S.songs.get(t.dataset.id); if (!z) return;
      z.data.tags = z.data.tags || [];
      const i = z.data.tags.indexOf(tid); if (i >= 0) z.data.tags.splice(i, 1); else z.data.tags.push(tid);
      queueSave(z); t.outerHTML = row(z);
    },
    no: () => closeSheet(),
  }, () => { if (S.view === 'home') renderHomeList(); });
  $('#tp-q', sheet).oninput = e => {
    const q = e.target.value.normalize('NFKC').toLowerCase();
    $$('#tp-list .item', sheet).forEach(it => { it.hidden = q && !it.textContent.normalize('NFKC').toLowerCase().includes(q); });
  };
}
async function tabMenu(s) {
  const tabs = S.settings.tabs;
  const tags = s.data.tags || [];
  const v = await menu('タブに入れる・はずす', [...tabs.map(t => ({ label: `${tags.includes(t.id) ? '✓ ' : ''}${t.name}`, value: t.id })), { label: '＋ 新しいタブを作る', value: '__new' }]);
  if (!v) return;
  let id = v;
  if (v === '__new') {
    const name = await askText({ title: '新しいタブの名前', placeholder: '例：バンド', ok: '作る' });
    if (!name?.trim()) return;
    const t = { id: 'tb' + Date.now().toString(36), name: name.trim().slice(0, 12) };
    tabs.push(t); saveSettings(); id = t.id;
  }
  s.data.tags = s.data.tags || [];
  const i = s.data.tags.indexOf(id);
  if (i >= 0) s.data.tags.splice(i, 1); else s.data.tags.push(id);
  queueSave(s);
  toast(i >= 0 ? `「${tabs.find(t => t.id === id)?.name}」からはずしました` : `「${tabs.find(t => t.id === id)?.name}」に入れました`);
}

// ---------- 本番モード ----------
let perf = null; // { raf, wake, ... }
function stopPerform() {
  if (!perf) return;
  cancelAnimationFrame(perf.raf);
  if (perf.audio) { perf.audio.pause(); if (perf.ownAudio) try { URL.revokeObjectURL(perf.audio.src); } catch (e) { /* なし */ } }
  perf.wake?.release?.().catch(() => {});
  document.body.classList.remove('perform-on');
  perf = null;
}
// 歌詞を「行」と「待つところ（[間奏 8] など）」の並びにする
function timeline(d) {
  const items = [];
  for (const p of L.parse(d.text)) {
    const lines = p.lines.filter(l => l.t.trim());
    if (p.bars && !lines.length) { items.push({ type: 'wait', name: p.name || '間奏', bars: p.bars }); continue; }
    if (p.bars) items.push({ type: 'wait', name: p.name, bars: p.bars });
    lines.forEach((l, i) => items.push({ type: 'line', idx: l.idx, t: l.t, part: i === 0 ? p.name : '' }));
  }
  return items;
}
function renderPerform(id, q) {
  stopPerform();
  const s = S.songs.get(id);
  const d = s.data;
  const k = d.keys || {};
  S.view = 'play:' + id;
  setBarColor('#140f0c');
  const setId = q.get('set');
  const set = setId ? (S.settings.setlists || []).find(x => x.id === setId) : null;
  const setIdx = set ? set.songs.indexOf(id) : -1;
  const nextId = set ? set.songs.slice(setIdx + 1).find(x => alive(S.songs.get(x))) : null;
  let items = timeline(d);
  const anno = L.ensureAnno(d);
  // タップで合わせた時間があり、歌詞が変わっていなければ、その時間で進む
  const lineItems = items.filter(it => it.type === 'line');
  const tm = d.timing;
  const timed = !!(tm && tm.times?.length && tm.lines?.length === lineItems.length && tm.lines.every((t, i) => t === lineItems[i].t) && lsGet('lb_play_mode') !== 'tempo');
  const timingStale = !!(tm && tm.times?.length && !(tm.lines?.length === lineItems.length && tm.lines.every((t, i) => t === lineItems[i].t)));
  if (timed) items = lineItems.map((it, i) => ({ ...it, at: tm.times[i] == null ? Infinity : tm.times[i], end: tm.ends?.[i] ?? null }));
  // ドライブに保存した「原曲の音源」
  const srcRec = timed ? S.recs.find(x => x.id === d.sourceRec && x.song_id === id) : null;
  const srcOn = !!srcRec && lsGet('lb_play_src') !== '0';
  // 文字の多い行は長く、少ない行は短く（平均を 1 として 0.6〜1.7 倍）
  const cnts = items.filter(it => it.type === 'line').map(it => L.charCount(it.t)).filter(Boolean);
  const avg = cnts.length ? cnts.reduce((a, b) => a + b, 0) / cnts.length : 1;
  items.forEach(it => { if (it.type === 'line') it.w = Math.min(1.7, Math.max(0.6, (L.charCount(it.t) || avg) / avg)); });
  app.innerHTML = `<div class="screen playS">
    <div class="wrap play-top"><button class="icon-btn" id="bk" aria-label="とじる">${I.close}</button>
      <div class="play-title"><b>${esc(d.title || '題名なし')}</b><span>${set ? `${esc(set.name)}　${setIdx + 1}/${set.songs.length}` : ''}</span></div><span></span></div>
    <div class="play-body" id="pbody">
      <div class="play-pad"></div>
      ${items.map((it, i) => it.type === 'wait'
        ? `<div class="pl wait" data-i="${i}">♪ ${esc(it.name)}<small data-w="${i}">${it.bars}小節</small></div>`
        : `${it.part ? `<div class="pl-part">${esc(it.part)}</div>` : ''}<p class="pl" data-i="${i}">${L.renderLine(anno[it.idx] || { t: it.t }, it.idx, S.settings.marks, S.settings.colors)}<span class="pl-bar"></span></p>`).join('')}
      <div class="play-end">${nextId ? `<button class="btn" data-go="#/play/${nextId}?set=${setId}">次の曲：${esc(S.songs.get(nextId).data.title || '題名なし')} ▶</button>` : '<span class="muted">おわり</span>'}</div>
      <div class="play-pad"></div>
    </div>
    <div class="play-ctl"><div class="wrap">
      ${timed ? '' : k.tempo ? '' : '<div class="play-warn">テンポが入っていません。下で入れてください（キーの「テンポ」でも入れられます）</div>'}
      ${timingStale ? '<div class="play-warn">歌詞が変わったので、タップの時間は使えません。「音源から合わせる」でもう一度合わせてください</div>' : ''}
      ${tm && tm.times?.length && !timingStale ? `<div class="play-row small"><button class="chip ${timed ? 'on' : ''}" id="pm-time">タップの時間で進む</button><button class="chip ${timed ? '' : 'on'}" id="pm-tempo">テンポで進む</button></div>` : ''}
      <div class="play-row">
        <button class="icon-btn" id="pv" aria-label="前の行">${I.up}</button>
        <button class="play-big" id="pp" aria-label="スタート">${PLAY}</button>
        <button class="icon-btn" id="pn" aria-label="次の行">${I.down}</button>
      </div>
      ${timed ? `<div class="play-row small"><button class="btn sub small" id="nudge-back">−0.5秒</button><span class="bpm" id="clock">0:00</span><button class="btn sub small" id="nudge-fwd">＋0.5秒</button></div>
      <div class="play-row small">${srcRec ? `<button class="chip ${srcOn ? 'on' : ''}" id="psrc">${srcOn ? '🎵 原曲を流す：読みこみ中…' : '🎵 原曲を流さない'}</button>` : ''}<button class="chip" id="pa">${srcRec ? 'ほかの音源' : '🎵 音源を選んで流す'}</button></div>` : ''}
      <div class="play-row small" ${timed ? 'hidden' : ''}>
        <button class="btn sub small" id="slow">遅く</button>
        <span class="bpm">♩=<input id="bpm" type="number" inputmode="numeric" min="30" max="300" value="${esc(k.tempo || '')}" placeholder="?"></span>
        <button class="btn sub small" id="fast">速く</button>
        <select class="select" id="bars" style="width:auto">${[1, 1.5, 2, 3, 4].map(b => `<option value="${b}" ${+(k.bars || 2) === b ? 'selected' : ''}>1行 ${b}小節</option>`).join('')}</select>
      </div>
    </div></div>
  </div>`;
  document.body.classList.add('perform-on');
  perf = { i: -1, t: 0, playing: false, last: 0, raf: 0, wake: null, items };
  const lineSec = () => (+$('#bpm').value ? (+$('#bars').value || 2) * 4 * 60 / +$('#bpm').value : 0);
  const itemSec = it => (it.type === 'wait' ? it.bars * 4 * 60 / (+$('#bpm').value || 120) : lineSec() * (it.w || 1));
  // タップの時間で進むとき：時計（音源を流していれば、その再生位置）
  perf.clock = 0; perf.audio = null;
  const lineAt = c => { let j = -1; items.forEach((it, i) => { if (it.at <= c) j = i; }); return j; };
  const focus = (i, smooth = true) => {
    perf.i = Math.max(0, Math.min(items.length, i)); perf.t = 0;
    $$('.pl.cur', app).forEach(x => x.classList.remove('cur'));
    const el = $(`.pl[data-i="${perf.i}"]`, app) || $('.play-end', app);
    el?.classList.add('cur');
    $$('.pl', app).forEach(x => x.classList.toggle('done', +x.dataset.i < perf.i));
    el?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  };
  const setPlaying = on => {
    perf.playing = on;
    $('#pp').innerHTML = on ? PAUSE : PLAY;
    if (on && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { if (perf) perf.wake = w; }).catch(() => {});
  };
  const tick = now => {
    if (!perf) return;
    perf.raf = requestAnimationFrame(tick);
    const dt = perf.last ? (now - perf.last) / 1000 : 0;
    perf.last = now;
    if (timed) {
      if (perf.playing) perf.clock = perf.audio ? perf.audio.currentTime : perf.clock + dt;
      const ck = $('#clock'); if (ck) ck.textContent = R.fmtTime(perf.clock);
      const j = lineAt(perf.clock);
      if (j >= 0 && j !== perf.i) focus(j);
      const it2 = items[perf.i], nx = items[perf.i + 1];
      const el2 = $(`.pl[data-i="${perf.i}"]`, app);
      const b2 = el2 && $('.pl-bar', el2);
      const stop2 = it2?.end ?? (nx && isFinite(nx.at) ? nx.at : it2?.at + 4);
      if (b2 && it2) b2.style.width = Math.min(100, Math.max(0, (perf.clock - it2.at) / Math.max(0.5, stop2 - it2.at) * 100)) + '%';
      if (perf.playing && perf.audio?.ended) setPlaying(false);
      return;
    }
    if (!perf.playing || perf.i >= items.length) return;
    const it = items[perf.i];
    const len = itemSec(it);
    if (!len) return;
    perf.t += dt;
    const el = $(`.pl[data-i="${perf.i}"]`, app);
    if (it.type === 'wait') { const w = $(`[data-w="${perf.i}"]`, app); if (w) w.textContent = `あと ${Math.max(1, Math.ceil((len - perf.t) / (len / it.bars)))}小節`; }
    else { const b = el && $('.pl-bar', el); if (b) b.style.width = Math.min(100, perf.t / len * 100) + '%'; }
    if (perf.t >= len) {
      if (it.type === 'wait') { const w = $(`[data-w="${perf.i}"]`, app); if (w) w.textContent = `${it.bars}小節`; }
      focus(perf.i + 1);
      if (perf.i >= items.length) setPlaying(false);
    }
  };
  const save = () => {
    const t = +$('#bpm').value || null, b = +$('#bars').value || 2;
    if (t !== (k.tempo || null) || b !== (k.bars || 2)) { d.keys = { ...k, tempo: t, bars: b, tempoEst: t === k.tempo ? k.tempoEst : false }; Object.assign(k, d.keys); queueSave(s); }
  };
  $('#pp').onclick = () => {
    if (timed) {
      const on = !perf.playing;
      if (perf.audio) { if (on) perf.audio.play().catch(() => {}); else perf.audio.pause(); }
      perf.last = 0; setPlaying(on); return;
    }
    if (!+$('#bpm').value) { toast('テンポ（♩=いくつ）を入れてください'); $('#bpm').focus(); return; }
    if (perf.i < 0 || perf.i >= items.length) focus(0);
    perf.last = 0; setPlaying(!perf.playing);
  };
  const seek = i => { const it = items[Math.max(0, Math.min(items.length - 1, i))]; if (!it || !isFinite(it.at)) return; perf.clock = it.at; if (perf.audio) perf.audio.currentTime = it.at; focus(items.indexOf(it)); };
  $('#pv').onclick = () => (timed ? seek(perf.i - 1) : focus(Math.max(0, perf.i - 1)));
  $('#pn').onclick = () => (timed ? seek(perf.i + 1) : focus(perf.i + 1));
  if (timed) {
    $('#nudge-back').onclick = () => { perf.clock = Math.max(0, perf.clock - 0.5); if (perf.audio) perf.audio.currentTime = perf.clock; };
    $('#nudge-fwd').onclick = () => { perf.clock += 0.5; if (perf.audio) perf.audio.currentTime = perf.clock; };
    const useAudio = (a, own) => {
      if (perf.audio) { perf.audio.pause(); if (perf.ownAudio) URL.revokeObjectURL(perf.audio.src); }
      perf.audio = a; perf.ownAudio = own;
      if (a) { a.setAttribute('playsinline', ''); a.preload = 'auto'; try { a.currentTime = perf.clock; } catch (e) { /* 読みこみ前 */ } }
      if (perf.playing) { perf.last = 0; if (a) a.play().catch(() => {}); }
    };
    const loadSrc = async () => {
      const b = $('#psrc'); const me = perf;
      try {
        const u = await recUrl(srcRec);
        if (perf !== me || lsGet('lb_play_src') === '0') return;
        useAudio(new Audio(u), false);
        if (b) b.textContent = '🎵 原曲を流す';
      } catch (e) { if (b) { b.textContent = '🎵 原曲を読みこめませんでした'; b.classList.remove('on'); } }
    };
    if (srcOn) loadSrc();
    $('#psrc')?.addEventListener('click', () => {
      const on = lsGet('lb_play_src') === '0';
      lsSet('lb_play_src', on ? null : '0');
      $('#psrc').classList.toggle('on', on);
      if (on) { $('#psrc').textContent = '🎵 原曲を流す：読みこみ中…'; loadSrc(); }
      else { $('#psrc').textContent = '🎵 原曲を流さない'; useAudio(null, false); }
    });
    $('#pa').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*';
      inp.onchange = () => {
        const f = inp.files?.[0]; if (!f) return;
        useAudio(new Audio(URL.createObjectURL(f)), true);
        const b = $('#psrc'); if (b) { b.classList.remove('on'); b.textContent = '🎵 原曲を流さない'; }
        toast('▶ を押すと、選んだ音源と歌詞がいっしょに進みます（この音源は保存しません）');
      };
      inp.click();
    };
  }
  $('#pm-time')?.addEventListener('click', () => { lsSet('lb_play_mode', null); renderPerform(id, q); });
  $('#pm-tempo')?.addEventListener('click', () => { lsSet('lb_play_mode', 'tempo'); renderPerform(id, q); });
  $('#slow').onclick = () => { $('#bpm').value = Math.max(30, (+$('#bpm').value || 120) - 4); save(); };
  $('#fast').onclick = () => { $('#bpm').value = Math.min(300, (+$('#bpm').value || 120) + 4); save(); };
  $('#bpm').onchange = save; $('#bars').onchange = save;
  $('#pbody').onclick = e => {
    if (e.target.closest('[data-go]')) return;
    const el = e.target.closest('.pl'); if (!el) return;
    if (timed) { seek(+el.dataset.i); return; }
    focus(+el.dataset.i); // タップした行（間奏ならその次）から
    if (items[perf.i]?.type === 'wait' && el.classList.contains('cur') && perf.playing) focus(perf.i + 1);
  };
  $('#bk').onclick = () => { stopPerform(); back(`#/song/${id}`); };
  focus(0, false);
  perf.raf = requestAnimationFrame(tick);
}

// ---------- セットリスト ----------
function setlists() { if (!Array.isArray(S.settings.setlists)) S.settings.setlists = []; return S.settings.setlists; }
function renderSetlists() {
  S.view = 'setlists';
  setBarColor(S.settings.dark ? '#1c1511' : '#f4ebdf');
  const list = setlists();
  app.innerHTML = `<div class="screen setS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div></div>
    <div class="wrap content">
      <h1 class="big">セットリスト</h1>
      <p class="muted" style="font-size:.85rem;margin:0">「今日のカラオケ」のように、歌う曲を順番に並べておけます。本番モードで続けて通せます。</p>
      ${list.length ? `<div class="list">${list.map(x => `<button class="item" data-go="#/setlist/${x.id}"><span class="nodot"></span><b>${esc(x.name)}</b><span class="k">${x.songs.filter(id => alive(S.songs.get(id))).length}曲</span><i>${esc(x.songs.map(id => S.songs.get(id)).filter(alive).map(z => z.data.title || '題名なし').join('・'))}</i></button>`).join('')}</div>` : '<div class="empty">まだセットリストはありません。</div>'}
      <button class="btn" id="sl-new">＋ 新しいセットリスト</button>
      <button class="btn sub" id="sl-auto">おまかせで作る</button>
    </div></div>`;
  $('#bk').onclick = () => back('#/');
  $('#sl-auto').onclick = () => autoSetlist();
  $('#sl-new').onclick = async () => {
    const name = await askText({ title: 'セットリストの名前', placeholder: '例：今日のカラオケ', ok: '作る' });
    if (!name?.trim()) return;
    const x = { id: 'sl' + Date.now().toString(36), name: name.trim(), songs: [] };
    setlists().push(x); saveSettings(); go(`#/setlist/${x.id}`);
  };
}
function renderSetlist(sid) {
  const x = setlists().find(z => z.id === sid);
  S.view = 'setlist';
  const songs = x.songs.filter(id => alive(S.songs.get(id)));
  app.innerHTML = `<div class="screen setS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><button class="icon-btn" id="sl-menu" aria-label="そのほか">${I.more}</button></div></div>
    <div class="wrap content">
      <h1 class="big">${esc(x.name)}</h1>
      ${songs.length ? `<button class="btn" data-go="#/play/${songs[0]}?set=${sid}">${I.stage}本番モードで通す</button>` : ''}
      <div class="list">${songs.map((id, i) => { const z = S.songs.get(id); return `<div class="sl-row"><span class="sl-n">${i + 1}</span>
        <button class="sl-t" data-go="#/song/${id}"><b>${esc(z.data.title || '題名なし')}</b><i>${esc(z.data.kind === 'real' ? S.artists.get(z.data.artist_id)?.data.name || '' : '自作')}</i></button>
        <button class="icon-btn" data-mv="-1" data-i="${i}" aria-label="上へ">${I.up}</button><button class="icon-btn" data-mv="1" data-i="${i}" aria-label="下へ">${I.down}</button><button class="icon-btn" data-rm="${i}" aria-label="はずす">${I.close}</button></div>`; }).join('') || '<div class="empty">下の「＋ 曲を足す」から入れてください。</div>'}</div>
      <button class="btn sub" id="sl-add">＋ 曲を足す</button>
    </div></div>`;
  x.songs = songs;
  $('#bk').onclick = () => back('#/setlists');
  $$('[data-mv]', app).forEach(b => b.onclick = () => { const i = +b.dataset.i, j = i + +b.dataset.mv; if (j < 0 || j >= x.songs.length) return; [x.songs[i], x.songs[j]] = [x.songs[j], x.songs[i]]; saveSettings(); renderSetlist(sid); });
  $$('[data-rm]', app).forEach(b => b.onclick = () => { x.songs.splice(+b.dataset.rm, 1); saveSettings(); renderSetlist(sid); });
  $('#sl-add').onclick = () => pickSongs(x, () => renderSetlist(sid));
  $('#sl-menu').onclick = async () => {
    const v = await menu(x.name, [{ label: '名前を変える', value: 'rename' }, { label: 'このセットリストを消す', value: 'del', danger: true }]);
    if (v === 'rename') { const n = await askText({ title: '名前', value: x.name }); if (n?.trim()) { x.name = n.trim(); saveSettings(); renderSetlist(sid); } }
    else if (v === 'del' && await confirmAsk(`「${x.name}」を消しますか？`, '曲そのものは消えません。', '消す', true)) { S.settings.setlists = setlists().filter(z => z !== x); saveSettings(); go('#/setlists'); }
  };
}
function pickSongs(x, done) {
  const all = liveSongs().sort((a, b) => jaCmp(a.data.title || '', b.data.title || ''));
  const row = z => `<button class="item ${x.songs.includes(z.id) ? 'picked' : ''}" data-s="pick" data-id="${z.id}"><span class="nodot"></span><b>${esc(z.data.title || '題名なし')}</b><span class="k">${x.songs.includes(z.id) ? '✓' : '＋'}</span><i>${esc(z.data.kind === 'real' ? S.artists.get(z.data.artist_id)?.data.name || '' : '自作')}</i></button>`;
  const sheet = openSheet(`<h3>曲を足す</h3><label class="search">${I.search}<input id="ps-q" type="search" placeholder="曲名・歌手で検索"></label>
    <div class="list" id="ps-list">${all.map(row).join('')}</div><button class="btn" data-s="no">できた</button>`, {
    pick: t => { const id = t.dataset.id; const i = x.songs.indexOf(id); if (i >= 0) x.songs.splice(i, 1); else x.songs.push(id); saveSettings(); t.outerHTML = row(S.songs.get(id)); },
    no: () => closeSheet(),
  }, done);
  $('#ps-q', sheet).oninput = e => {
    const q = e.target.value.normalize('NFKC').toLowerCase();
    $$('#ps-list .item', sheet).forEach(it => { it.hidden = q && !it.textContent.normalize('NFKC').toLowerCase().includes(q); });
  };
}
async function addToSetlist(s) {
  const list = setlists();
  const v = await menu('どのセットリストに入れますか？', [...list.map(x => ({ label: `${x.name}${x.songs.includes(s.id) ? '（入っています）' : ''}`, value: x.id })), { label: '＋ 新しいセットリストを作る', value: '__new' }]);
  if (!v) return;
  let x = list.find(z => z.id === v);
  if (v === '__new') {
    const name = await askText({ title: 'セットリストの名前', placeholder: '例：今日のカラオケ', ok: '作る' });
    if (!name?.trim()) return;
    x = { id: 'sl' + Date.now().toString(36), name: name.trim(), songs: [] }; list.push(x);
  }
  if (!x.songs.includes(s.id)) x.songs.push(s.id);
  saveSettings(); toast(`「${x.name}」に入れました`);
}

// ---------- 最近消した曲（30日） ----------
const TRASH_DAYS = 30;
function renderTrash() {
  S.view = 'trash';
  setBarColor(S.settings.dark ? '#1c1511' : '#f4ebdf');
  const songs = Array.from(S.songs.values()).filter(x => x.data.deleted_at).sort((a, b) => b.data.deleted_at.localeCompare(a.data.deleted_at));
  const left = at => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(at)) / 86400000));
  app.innerHTML = `<div class="screen setS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div></div>
    <div class="wrap content">
      <h1 class="big">最近消した曲</h1>
      <p class="muted" style="font-size:.85rem;margin:0">消してから30日たつと、ほんとうに消えます（録音もいっしょに）。それまでは戻せます。</p>
      ${songs.length ? `<div class="card">${songs.map(x => `<div class="set-row"><span>${esc(x.data.title || '題名なし')}<br><span class="muted" style="font-size:.78rem">${esc(x.data.kind === 'real' ? S.artists.get(x.data.artist_id)?.data.name || '' : '自作')}・あと${left(x.data.deleted_at)}日</span></span>
        <span style="display:flex;gap:6px"><button class="btn small" data-back="${x.id}">戻す</button><button class="btn danger small" data-kill="${x.id}">消す</button></span></div>`).join('')}</div>` : '<div class="empty">消した曲はありません。</div>'}
    </div></div>`;
  $('#bk').onclick = () => back('#/settings');
  $$('[data-back]', app).forEach(b => b.onclick = async () => {
    const x = S.songs.get(b.dataset.back);
    delete x.data.deleted_at; delete x.data.deleted_with_artist;
    const a = S.artists.get(x.data.artist_id);
    toast('戻しました'); renderTrash();
    (async () => { if (a?.data.deleted_at) { delete a.data.deleted_at; await saveArtist(a); } await queueSave(x, true); })();
  });
  $$('[data-kill]', app).forEach(b => b.onclick = async () => {
    const x = S.songs.get(b.dataset.kill);
    if (!(await confirmAsk(`「${x.data.title || '題名なし'}」をすぐに消しますか？`, '録音もいっしょに消えます。元にはもどせません。', '消す', true))) return;
    const recs = S.recs;
    S.songs.delete(x.id); S.recs = S.recs.filter(r => r.song_id !== x.id); renderTrash();
    send('lb_delete_song', { p_token: S.token, p_id: x.id }).then(() => cacheSoon())
      .catch(e => { S.songs.set(x.id, x); S.recs = recs; if (S.view === 'trash') renderTrash(); fail(e); });
  });
}
// 30日すぎたものを、ほんとうに消す
async function purgeTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  try {
    for (const x of Array.from(S.songs.values())) {
      if (x.data.deleted_at && new Date(x.data.deleted_at).getTime() < limit) {
        await send('lb_delete_song', { p_token: S.token, p_id: x.id }); S.songs.delete(x.id); S.recs = S.recs.filter(r => r.song_id !== x.id);
      }
    }
    for (const a of Array.from(S.artists.values())) {
      if (a.data.deleted_at && new Date(a.data.deleted_at).getTime() < limit && !Array.from(S.songs.values()).some(x => x.data.artist_id === a.id)) {
        await send('lb_delete_artist', { p_token: S.token, p_id: a.id }); S.artists.delete(a.id);
      }
    }
    cacheSoon();
  } catch (e) { console.warn(e); }
}

// ---------- みんなの曲（メンバーが見せている曲） ----------
async function renderShared(ownerId, id) {
  S.view = 'shared';
  if (!S.shared) { app.innerHTML = '<div class="loading">読みこんでいます…</div>'; await loadShared(); }
  const x = (S.shared || []).find(z => z.owner_id === ownerId && z.id === id);
  if (!x) { history.replaceState(null, '', '#/'); route(); toast('その曲は見られなくなっています'); return; }
  const d = x.data;
  const anno = L.ensureAnno(JSON.parse(JSON.stringify(d)));
  setBarColor(S.settings.dark ? '#2c2119' : '#f0dfc6');
  app.innerHTML = `<div class="screen lyricS">
    <div class="head"><div class="wrap">
      <div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div>
      <div class="eyebrow">${esc(x.owner)} さんの曲</div>
      <h1 class="big">${esc(d.title || '題名なし')}</h1>
      ${x.artist ? `<div class="artist-link">${esc(x.artist)}</div>` : ''}
      <div class="meta"><span>更新 ${fmtDate(x.updated_at)}</span></div>
    </div></div>
    <div class="wrap content">
      ${keysBlock({ ...d, _id: '' }).replace(/<div class="tempo-row">[\s\S]*$/, '')}
      <div class="lyr">${L.parse(d.text).map(p => `<div class="blk">${p.name ? `<p class="part">${esc(p.name)}</p>` : ''}${p.lines.map(ln => `<p class="ln">${L.renderLine(anno[ln.idx] || { t: ln.t }, ln.idx, S.settings.marks, S.settings.colors)}</p>${anno[ln.idx]?.memo ? `<div class="memo-ln">${esc(anno[ln.idx].memo)}</div>` : ''}`).join('')}</div>`).join('')}</div>
      <button class="btn sub" id="copy-mine">自分のノートにコピーする</button>
    </div></div>`;
  $('#bk').onclick = () => back('#/');
  $('#keys')?.addEventListener('click', e => { const p = e.target.closest('[data-play]'); if (p) N.playNote(+p.dataset.play); });
  $('#copy-mine').onclick = async () => {
    const copy = { kind: 'own', title: (d.title || '題名なし') + `（${x.owner}さんの曲）`, text: d.text, anno: d.anno || [], keys: d.keys || {}, theme_id: '' };
    const sid = uuid();
    const obj = { id: sid, data: copy, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    S.songs.set(sid, obj);
    toast('自作のノートにコピーしました'); go(`#/song/${sid}`);
    saveSongInOrder(sid, () => ({ p_token: S.token, p_id: sid, p_data: obj.data })).then(r => { if (r) Object.assign(obj, r); cacheSoon(); }).catch(fail);
  };
}

// ---------- 解説 ----------
function renderHelp(tab) {
  S.view = 'help';
  setBarColor(S.settings.dark ? '#241a13' : '#e4cfb1');
  const st = S.settings;
  let body = '';
  if (tab === 'marks') {
    body = `<p class="help-p">歌詞の文字をタップ（続けて選ぶときは横になぞる）すると、下にボタンが出ます。記号は選んだ最初の文字の上に、色は選んだ文字全部につきます。同じボタンをもう一度押すと消えます。</p>
      <div class="card">${st.marks.map(m => `<div class="g"><span class="m">${esc(m.label)}</span><b>${esc(m.name)}</b><i>${esc(m.desc || '')}</i></div>`).join('')}</div>
      <p class="sec-lbl" style="margin:6px 0 -4px">色</p>
      <div class="card">${st.colors.map(c => `<div class="g"><span class="sw" style="--c:${esc(c.color)}"></span><b>${esc(c.name)}</b><i>${esc(c.desc || '選んだ文字がこの色になって、下に線が引かれます')}</i></div>`).join('')}</div>
      <p class="sec-lbl" style="margin:6px 0 -4px">線</p>
      <div class="card"><div class="g"><span class="m"><span class="lsw line"></span></span><b>線</b><i>まっすぐな線。意味は自由に（例：大事なところ）</i></div><div class="g"><span class="m"><span class="lsw wave"></span></span><b>波線</b><i>波の線。意味は自由に（例：リズムに注意）</i></div></div>
      <p class="help-p muted" style="font-size:.8rem">記号や色は、設定から足したり変えたりできます。線は色と同じ文字に重ねられます。</p>`;
  } else if (tab === 'parts') {
    const P = [
      ['🎬', 'イントロ', '#8a6a3e', '歌が始まる前の、楽器だけの部分。歌い出しの音を確かめておくと安心。'],
      ['🅰️', 'Aメロ', '#3f7f8c', '1番の最初に歌うところ。落ち着いたメロディが多く、曲のお話が始まる部分。'],
      ['🅱️', 'Bメロ', '#5b7fa6', 'Aメロとサビをつなぐところ。少しずつ盛り上げていく部分。'],
      ['⭐', 'サビ', '#b8432f', 'いちばん盛り上がる、曲の中心。題名の言葉が入っていることも多い。'],
      ['🎸', '間奏', '#8a6a3e', '歌と歌の間の、楽器だけの部分。息を整えるところ。「[間奏 8]」と書くと本番モードで8小節待つ。'],
      ['🌉', 'Cメロ', '#8a5ab0', '2番のサビのあとなどに1回だけ出てくる、ちがう雰囲気のメロディ。「Dメロ」と呼ぶこともある。'],
      ['🤫', '落ちサビ', '#6e3b1c', '楽器が静かになって、しっとり歌うサビ。大サビの前に来ることが多い。'],
      ['🔥', '大サビ', '#c0607a', '最後に歌う、いちばん大きなサビ。キーが上がる（転調する）こともある。'],
      ['🏁', 'ラスサビ', '#b0803a', '「ラストのサビ」の略。大サビと同じ意味で使われることも多い。'],
      ['🎼', 'アウトロ', '#8a6a3e', '歌が終わったあとの、楽器だけの部分。'],
    ];
    body = `<p class="help-p">歌の中の「場所」の呼び方です。歌詞の編集画面のボタンで、その場所に区切りを入れられます。</p>
      <div class="part-cards">${P.map(([ic, n, c, t]) => `<div class="pcard" style="--c:${c}"><span class="pc-ic">${ic}</span><div><b>${n}</b><p>${t}</p></div></div>`).join('')}</div>
      <div class="tipbox">💡 よくある並び：イントロ → Aメロ → Bメロ → サビ → 間奏 → Aメロ → Bメロ → サビ → Cメロ → 大サビ → アウトロ</div>`;
  } else if (tab === 'notes') {
    let rows = '';
    for (let m = 81; m >= 43; m--) {
      rows += `<div class="n-row ${N.isBlack(m) ? 'black' : ''} ${st.myTop === m ? 'me' : ''} ${st.myLow === m ? 'me-low' : ''}"><b>${N.noteName(m)}</b><i>${N.doremi(m)}</i><button class="play" data-play="${m}" aria-label="${N.noteName(m)}を鳴らす">${PLAY}</button></div>`;
    }
    body = `<p class="help-p">カラオケでよく使う音の高さの呼び方です。hiA が「ラ」（ピアノの真ん中のドから上のラ）。A（ラ）から上がるごとに low → mid1 → mid2 → hi → hihi と名前が変わります。▶ で音を鳴らせます。</p>
      <div class="card">${rows}</div>`;
  } else {
    const H = [
      ['🎵', '曲を入れる', ['ホームの「実在する曲」で歌手を選ぶ（いなければ「＋ 歌手を追加」）', '右下の「＋」→ 曲名と歌詞を入れて「保存」', '自作の曲は「自作」→ 右下の「＋」'], '実在する曲は、原キーとテンポを試聴から自動で推定します（「推定」と出ます）。'],
      ['✂️', 'パートに分ける', ['編集画面で、区切りたい場所にカーソルを置く', '「Aメロ」「サビ」などのボタンを押す', '「[間奏 8]」のように数字を書くと、本番モードでその小節ぶん待つ'], 'パートの意味は「パート」のタブで見られます。'],
      ['🖍️', '歌い方を書きこむ', ['歌詞の文字をタップする（続けて選ぶときは横になぞる。長押しはいらない）', '下に出たボタンで、記号（ブレスなど）や色（強く・やさしく）をつける', '同じボタンをもう一度押すと消える。「メモ」で行ごとのメモも書ける'], '記号の意味は「記号と色」のタブで見られます。'],
      ['🎹', 'キーと音の高さ', ['歌詞ページのキーの表をタップすると直せる', '音のボタンを押すと鍵盤が出るので、タップして選ぶ', '▶ を押すと、自分のキー（上げ下げしたぶん）で音が鳴る'], 'わからない音は「測定不能」のままで大丈夫です。'],
      ['🎤', '音程チェック', ['歌詞ページの下の「音程」を押す', 'マイクに向かって歌うか、原曲を流す', '出た音を「最高音」「最低音」などにボタンで入れられる'], '設定の「自分の最高音・最低音」もここから入れられます。'],
      ['🎬', '本番モード', ['歌詞ページの「本番」を押す', 'テンポ（♩=いくつ）を確かめて ▶', '歌詞が自動で進む。速く・遅く、1行の小節数で合わせる。行をタップするとそこへ飛ぶ'], '本番中は画面が暗くなりにくいようにしています。'],
      ['🎵', '音源から合わせる', ['曲の「…」→「音源から合わせる」で、画面録画の動画や音声ファイルを選ぶ', '▶ で流して、歌い出しで1回タップ。あとは行を歌い終えるたびにタップ（「行が始まったらタップ」にも切りかえられる）', '「保存する」で、本番モードが音源の時間どおりに進む。原キー・テンポ・歌い出しも自動で入る'], '「この音源も保存する」にチェックを入れておくと、音を軽くしてドライブに入れます（録音の欄に「原曲の音源」として出ます）。本番モードで、どの端末でも歌詞といっしょに流せます。'],
      ['✨', '曲をかんたんに入れる', ['新しい曲の画面で曲名を打つと、候補が出るので選ぶ', 'ホームの検索で見つからない曲は「Apple の曲から入れる」から', '入れると、歌詞（J-Lyric.net）・最高音・最低音・テンポ（KEYTUBE）が自動で入る'], '歌詞はくり返す所を見て、パートも自動で分けます。'],
      ['🔴', '録音', ['歌詞ページの下の「録音」→ 赤いボタンで開始・停止', '録音は何個でも残せる。長押しで上書き・名前・削除', '再生中は下に小さなバーが出るので、歌詞を見ながら聞ける'], '電波がないときは端末に残して、つながったら送ります。'],
      ['📋', 'セットリスト・練習の記録', ['ホームの「セットリスト」で、歌う曲を順番に並べる', '「本番モードで通す」で続けて歌える', '歌詞ページで「練習中・歌える・十八番」の印や、点数を記録できる'], 'ホームの印のボタンで、印のついた曲だけを出せます。'],
      ['📷', '写真の歌詞を文字にする', ['編集画面の「写真を選ぶ」で歌詞の写真を出す', '写真の文字を長押し →「すべてを選択」→「コピー」', '歌詞の欄を長押しして「ペースト」'], 'iPhone・iPad の「テキスト認識表示」を使います。'],
      ['🗑️', '消した曲を戻す', ['設定 →「最近消した曲」', '「戻す」を押す'], '消してから30日は戻せます。'],
      ['👥', 'メンバーに見せる', ['自作の曲の「…」→「メンバーに見せる」', 'メンバーのホームの「みんなの曲」に出る'], '見せた人は見るだけで、直すことはできません。'],
      ['📱', 'ホーム画面に置く', ['Safari の共有ボタンを押す', '「ホーム画面に追加」'], 'アプリのように開けます。'],
    ];
    body = `<div class="how-list">${H.map(([ic, t, steps, tip]) => `<section class="how"><h2><span class="how-ic">${ic}</span>${t}</h2>
      <ol>${steps.map(x => `<li>${x}</li>`).join('')}</ol>${tip ? `<p class="how-tip">💡 ${tip}</p>` : ''}</section>`).join('')}</div>`;
  }
  app.innerHTML = `<div class="screen helpS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div></div>
    <div class="wrap content">
      <h1 class="big">解説</h1>
      <div class="tabs">${[['marks', '記号と色'], ['parts', 'パート'], ['notes', '音の高さ'], ['how', '使い方']].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${body}
    </div></div>`;
  $('#bk').onclick = () => back('#/');
  $$('[data-t]', app).forEach(b => b.onclick = () => { history.replaceState(history.state, '', `#/help?tab=${b.dataset.t}`); renderHelp(b.dataset.t); });
  app.onclick = null;
  $$('[data-play]', app).forEach(b => b.onclick = () => N.playNote(+b.dataset.play));
}

// ---------- 設定 ----------
function renderSettings() {
  S.view = 'settings';
  setBarColor(S.settings.dark ? '#1c1511' : '#f4ebdf');
  const st = S.settings;
  const used = S.recs.reduce((n, r) => n + (r.size || 0), 0);
  const local = S.token === LOCAL_TOKEN;
  app.innerHTML = `<div class="screen setS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div></div>
    <div class="wrap content">
      <h1 class="big">設定</h1>
      <p class="sec-lbl">表示</p>
      <div class="card">
        <div class="set-row"><span>夜用の暗い画面</span><button class="switch ${st.dark ? 'on' : ''}" id="sw-dark" aria-pressed="${st.dark}" aria-label="夜用の暗い画面"></button></div>
        <div class="set-row"><span>歌詞の文字の大きさ</span><div class="chips">${[['s', '小'], ['m', '中'], ['l', '大']].map(([k, n]) => `<button class="chip ${st.lyrSize === k ? 'on' : ''}" data-size="${k}">${n}</button>`).join('')}</div></div>
        <div class="set-row"><span>自分の最高音</span><span style="min-width:150px">${noteBtn('my-top', st.myTop, 'まだ入れていません')}</span></div>
        <div class="set-row"><span>自分の最低音</span><span style="min-width:150px">${noteBtn('my-low', st.myLow, 'まだ入れていません')}</span></div>
        <div class="set-row"><span class="muted" style="font-size:.8rem">歌詞ページの「音程」で、歌って測ることもできます。</span></div>
      </div>
      <p class="sec-lbl">自作のテーマ</p>
      <div class="card">${st.themes.map((t, i) => `<div class="set-row"><span class="l"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.name)}</span><button class="btn sub small" data-ed="themes" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">テーマを足す</span><button class="btn small" data-add="themes">＋ 追加</button></div></div>
      <p class="sec-lbl">ホームのタブ（「実在する曲」「自作」のほか）</p>
      <div class="card">${st.tabs.map((t, i) => `<div class="set-row"><span class="l">${esc(t.name)}<span class="muted" style="font-size:.78rem">　${liveSongs().filter(s => (s.data.tags || []).includes(t.id)).length}曲</span></span><button class="btn sub small" data-ed="tabs" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">タブを足す（例：バンド）</span><button class="btn small" data-add="tabs">＋ 追加</button></div></div>
      <p class="sec-lbl">歌い方の記号</p>
      <div class="card">${st.marks.map((m, i) => `<div class="set-row"><span class="l"><span class="mk-badge">${esc(m.label)}</span>${esc(m.name)}</span><button class="btn sub small" data-ed="marks" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">記号を足す</span><button class="btn small" data-add="marks">＋ 追加</button></div></div>
      <p class="sec-lbl">色</p>
      <div class="card">${st.colors.map((c, i) => `<div class="set-row"><span class="l"><i class="dot" style="--c:${esc(c.color)}"></i>${esc(c.name)}</span><button class="btn sub small" data-ed="colors" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">色を足す</span><button class="btn small" data-add="colors">＋ 追加</button></div></div>
      <p class="sec-lbl">消した曲</p>
      <div class="card"><div class="set-row"><span>最近消した曲（30日）<br><span class="muted" style="font-size:.78rem">${Array.from(S.songs.values()).filter(x => x.data.deleted_at).length}曲</span></span><button class="btn sub small" data-go="#/trash">見る</button></div></div>
      ${S.isOwner ? `<p class="sec-lbl">メンバー（管理している人だけに見えます）</p><div class="card" id="members"><div class="set-row"><span class="muted">読みこんでいます…</span></div></div>` : ''}
      <p class="sec-lbl">グーグルドライブへのバックアップ</p>
      <div class="card">${backupRows()}</div>
      <p class="sec-lbl">アカウント</p>
      <div class="card">
        <div class="set-row"><span>${local ? 'ためし中（この端末だけに保存）' : `ユーザー名：${esc(S.username)}`}</span></div>
        <div class="set-row"><span>録音で使っている量</span><span class="muted">${(used / 1024 / 1024).toFixed(1)} MB</span></div>
        <div class="set-row"><span class="muted" style="font-size:.8rem">バージョン ${APP_VERSION}</span><button class="btn danger small" id="logout">${local ? 'ログイン画面へ' : 'ログアウト'}</button></div>
      </div>
    </div></div>`;
  $('#bk').onclick = () => back('#/');
  $('#sw-dark').onclick = () => { st.dark = !st.dark; applyLook(); saveSettings(); renderSettings(); };
  $$('[data-size]', app).forEach(b => b.onclick = () => { st.lyrSize = b.dataset.size; applyLook(); saveSettings(); renderSettings(); });
  [['#my-top', 'myTop', '自分の最高音'], ['#my-low', 'myLow', '自分の最低音']].forEach(([sel, key, title]) => $(sel).onclick = async () => {
    const v = await pickNote(st[key], title);
    if (v === undefined) return;
    st[key] = v; saveSettings(); renderSettings();
  });
  $$('[data-ed]', app).forEach(b => b.onclick = () => editListItem(b.dataset.ed, +b.dataset.i));
  $$('[data-add]', app).forEach(b => b.onclick = () => editListItem(b.dataset.add, -1));
  $('#logout').onclick = () => logout(false);
  $('#bk-restore')?.addEventListener('click', restoreFromFile);
  if (S.isOwner) loadMembers();
}

// ---------- メンバーの管理（管理している人だけ） ----------
async function loadMembers() {
  const box = $('#members'); if (!box) return;
  let d;
  try { d = await rpc('lb_admin', { p_token: S.token }); }
  catch (e) { box.innerHTML = `<div class="set-row"><span class="muted">${esc(e.message)}</span></div>`; return; }
  if (!$('#members')) return;
  box.innerHTML = `<div class="set-row"><span>招待の合言葉<br><b class="invite">${esc(d.invite)}</b><br><span class="muted" style="font-size:.78rem">使ってほしい人にだけ教えてください。登録のときに入れてもらいます。</span></span>
      <span style="display:flex;flex-direction:column;gap:6px"><button class="btn small" id="inv-link">招待リンクをコピー</button><button class="btn sub small" id="inv-copy">合言葉だけコピー</button><button class="btn sub small" id="inv-new">作りなおす</button></span></div>
    ${d.members.length ? d.members.map(m => `<div class="set-row"><span>${esc(m.username)}<br><span class="muted" style="font-size:.78rem">曲 ${m.songs}・録音 ${m.recordings}${m.changed_at ? `・最後に使った日 ${fmtDate(m.changed_at, false)}` : ''}</span></span><button class="btn danger small" data-out="${esc(m.id)}" data-nm="${esc(m.username)}">外す</button></div>`).join('')
      : '<div class="set-row"><span class="muted">まだメンバーはいません。招待の合言葉を教えると、その人が「はじめて」から登録できます。</span></div>'}
    <div class="set-row"><span class="muted" style="font-size:.78rem">メンバーの歌詞や録音も、あなたのドライブの「LYRIC BOOK / メンバー」に保存されます。</span></div>`;
  $('#inv-copy').onclick = () => navigator.clipboard?.writeText(d.invite).then(() => toast('コピーしました'), () => toast('長押しでコピーしてください'));
  $('#inv-link').onclick = () => {
    const url = location.origin + location.pathname + '?invite=' + encodeURIComponent(d.invite);
    navigator.clipboard?.writeText(url).then(() => toast('招待リンクをコピーしました。LINEなどで送ってください'), () => askText({ title: '招待リンク（長押しでコピー）', value: url, ok: 'とじる' }));
  };
  $('#inv-new').onclick = async () => {
    if (!(await confirmAsk('招待の合言葉を作りなおしますか？', '前の合言葉では登録できなくなります。登録ずみのメンバーはそのまま使えます。', '作りなおす'))) return;
    try { await rpc('lb_new_invite', { p_token: S.token }); loadMembers(); } catch (e) { fail(e); }
  };
  $$('[data-out]', box).forEach(b => b.onclick = async () => {
    if (!(await confirmAsk(`「${b.dataset.nm}」を外しますか？`, 'その人はログインできなくなり、アプリの中の歌詞も消えます。ドライブのその人のフォルダ（バックアップ・録音）は残ります。', '外す', true))) return;
    try { await rpc('lb_remove_member', { p_token: S.token, p_uid: b.dataset.out }); toast('外しました'); loadMembers(); } catch (e) { fail(e); }
  });
}

// ---------- グーグルドライブへのバックアップ ----------
function backupRows() {
  if (S.token === LOCAL_TOKEN) return `<div class="set-row"><span class="muted">ためし中はこの端末だけに保存しています。ログインすると、グーグルドライブに保存されます。</span></div>`;
  const b = S.backup || {};
  if (!S.isOwner && S.serverVersion >= 2) return `<div class="set-row"><span>歌詞・録音は、管理している人のグーグルドライブに保存されています。</span></div>
    <div class="set-row"><span>${b.at ? `最後のバックアップ：${fmtDate(b.at)}` : '<span class="muted">バックアップは、変えてから10分以内に作られます</span>'}<br><span class="muted" style="font-size:.8rem">1日1つ、30日分残します。戻したいときは、管理している人に頼んでください。</span></span></div>`;
  return `<div class="set-row"><span>歌詞・録音は、あなたのグーグルドライブの「LYRIC BOOK」フォルダに保存しています。</span></div>
    <div class="set-row"><span>${b.at ? `最後のバックアップ：${fmtDate(b.at)}${b.info?.songs != null ? `<br><span class="muted" style="font-size:.8rem">曲 ${b.info.songs}・録音 ${b.info.recordings}　1日1つ、30日分残します</span>` : ''}` : '<span class="muted">バックアップは、変えてから10分以内に作られます</span>'}</span></div>
    ${b.info?.folder ? `<div class="set-row"><span>ドライブのフォルダ</span><a class="btn sub small" href="${esc(b.info.folder)}" target="_blank" rel="noopener">開く</a></div>` : ''}
    <div class="set-row"><span class="muted" style="font-size:.85rem">「日ごと」フォルダのファイルから戻す</span><button class="btn sub small" id="bk-restore">戻す</button></div>`;
}

// バックアップのファイルから戻す。今のデータは消さない。
function restoreFromFile() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch (e) { toast('そのファイルは読めませんでした'); return; }
    if (d?.app !== 'LYRIC BOOK' || !Array.isArray(d.songs)) { toast('LYRIC BOOK のバックアップではないようです'); return; }
    const when = d.exported_at ? fmtDate(d.exported_at) : '';
    if (!(await confirmAsk(`${when} のバックアップから戻しますか？`,
      `曲 ${d.songs.length}・歌手 ${(d.artists || []).length}。今のデータは消えません。ここにない曲は足して、中身がちがう曲は「（バックアップの版）」として残します。録音はドライブの「録音」フォルダにあります。`, '戻す'))) return;
    let added = 0, copies = 0;
    try {
      for (const a of d.artists || []) {
        if (S.artists.has(a.id)) continue;
        const obj = { id: a.id, data: a.data, created_at: a.created_at, updated_at: a.updated_at };
        S.artists.set(a.id, obj);
        const r = await send('lb_save_artist', { p_token: S.token, p_id: a.id, p_data: a.data });
        if (r) Object.assign(obj, r);
      }
      for (const b of d.songs) {
        const cur = S.songs.get(b.id);
        if (cur && JSON.stringify(cur.data) === JSON.stringify(b.data)) continue;
        const id = cur ? uuid() : b.id;
        const data = JSON.parse(JSON.stringify(b.data));
        if (cur) { data.title = (data.title || '題名なし') + '（バックアップの版）'; copies++; } else added++;
        const obj = { id, data, created_at: b.created_at, updated_at: b.updated_at };
        S.songs.set(id, obj);
        const r = await send('lb_save_song', { p_token: S.token, p_id: id, p_data: data });
        if (r) Object.assign(obj, r);
      }
      // テーマ・記号・色は、ないものだけ足す
      let st = false;
      for (const k of ['themes', 'marks', 'colors']) for (const it of d.settings?.[k] || []) {
        if (!S.settings[k].some(x => x.id === it.id)) { S.settings[k].push(it); st = true; }
      }
      if (st) saveSettings();
      cacheSoon();
      toast(added || copies ? `戻しました（足した曲 ${added}・バックアップの版 ${copies}）` : '今のデータと同じでした');
      go('#/');
    } catch (e) { fail(e); }
  };
  inp.click();
}

function editListItem(kind, i) {
  const st = S.settings;
  const list = st[kind];
  const it = i >= 0 ? { ...list[i] } : { id: kind.slice(0, 2) + Date.now().toString(36), name: '', label: '', desc: '', color: SWATCHES[list.length % SWATCHES.length] };
  const title = { themes: 'テーマ', marks: '歌い方の記号', colors: '色', tabs: 'タブ' }[kind];
  const sheet = openSheet(`<h3>${i >= 0 ? `${title}を変える` : `${title}を足す`}</h3>
    ${kind === 'marks' ? `<label class="field"><span>歌詞の上に出す文字（1〜2文字）</span><input class="input" id="li-label" maxlength="2" value="${esc(it.label)}" placeholder="例：シ"></label>` : ''}
    <label class="field"><span>名前</span><input class="input" id="li-name" value="${esc(it.name)}" placeholder="${kind === 'themes' ? '例：友情' : kind === 'marks' ? '例：しゃくり上げ' : kind === 'tabs' ? '例：バンド' : '例：ささやく'}"></label>
    ${kind === 'marks' ? `<label class="field"><span>説明（解説に出ます）</span><input class="input" id="li-desc" value="${esc(it.desc || '')}"></label>` : ''}
    ${kind !== 'marks' && kind !== 'tabs' ? `<div class="field"><span>色</span><div class="chips" id="li-colors">${SWATCHES.map(c => `<button class="chip ${c === it.color ? 'on' : ''}" data-s="col" data-c="${c}" aria-label="${c}"><i class="dot" style="--c:${c};width:18px;height:18px"></i></button>`).join('')}</div></div>` : ''}
    <div class="acts">${i >= 0 ? '<button class="btn danger" data-s="del">消す</button>' : ''}<button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">保存</button></div>`, {
    col: t => { it.color = t.dataset.c; $$('#li-colors .chip', sheet).forEach(c => c.classList.toggle('on', c === t)); },
    no: () => closeSheet(),
    del: async () => {
      closeSheet();
      if (kind !== 'tabs' && list.length <= 1) { toast('1つは残してください'); return; }
      if (!(await confirmAsk(`「${it.name}」を消しますか？`, kind === 'tabs' ? 'タブだけ消えます。入れていた曲は消えません。' : kind === 'themes' ? 'このテーマの曲は「テーマなし」になります。' : 'この印をつけていた所からも消えます。', '消す', true))) return;
      list.splice(i, 1); saveSettings(); renderSettings();
    },
    ok: (_, sh) => {
      it.name = $('#li-name', sh).value.trim();
      if (kind === 'marks') { it.label = $('#li-label', sh).value.trim(); it.desc = $('#li-desc', sh).value.trim(); if (!it.label) { toast('上に出す文字を入れてください'); return; } }
      if (!it.name) { toast('名前を入れてください'); return; }
      if (i >= 0) list[i] = it; else list.push(it);
      closeSheet(); saveSettings(); renderSettings();
    },
  });
}

boot();
