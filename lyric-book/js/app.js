// LYRIC BOOK 本体：画面の切りかえと操作
import { rpc, LOCAL_TOKEN } from './cloud.js';
import * as N from './notes.js';
import * as L from './lyrics.js';
import * as R from './recorder.js';

export const APP_VERSION = '1.3.0';

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
};
const app = $('#app');

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
async function send(name, body) {
  cacheSoon();
  try { return await rpc(name, body); }
  catch (e) {
    if (e.code === 'offline' && S.token !== LOCAL_TOKEN) { enqueue(name, body); setOffline(true); return null; }
    throw e;
  }
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
  if (!force && (S.saveTimers.size || loadQueue().length || S.view === 'edit' || sheetClose || S.sel)) return;
  try {
    const d = await rpc('lb_load', { p_token: S.token });
    applyLoad(d); applyLook(); cacheNow(); setOffline(false);
    const y = window.scrollY;
    route(true);
    window.scrollTo(0, y);
  } catch (e) { if (e.code === 'offline') setOffline(true); }
}
window.addEventListener('online', () => flush().then(() => refresh()));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.token && Date.now() - S.lastRefresh > 20000) flush().then(() => refresh());
});
setInterval(() => { if (loadQueue().length && navigator.onLine !== false) flush(); }, 30000);

// ---------- 読みこみ ----------
async function boot() {
  S.token = lsGet('lb_token');
  if (!S.token) { renderLogin(); return; }
  try {
    await flush();
    const d = await rpc('lb_load', { p_token: S.token });
    applyLoad(d);
    applyLook();
    cacheNow();
    setOffline(false);
    route();
  } catch (e) {
    const c = loadCache();
    if (e.code === 'offline' && c && c.token === S.token) { applyLoad(c); applyLook(); setOffline(true); route(); return; }
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
function renderLogin(mode = 'login', err = '') {
  S.view = 'login';
  setBarColor('#4a2c1a');
  document.documentElement.dataset.theme = 'light';
  const tab = (m, label) => `<button data-m="${m}" class="${mode === m ? 'on' : ''}">${label}</button>`;
  app.innerHTML = `<div class="screen loginS"><form class="wrap content" id="lf" autocomplete="on">
    <h1 class="logo">LYRIC BOOK<small>歌詞と歌い方のノート</small></h1>
    <div class="tabs">${tab('login', 'ログイン')}${tab('signup', 'はじめて')}${tab('reset', '忘れたとき')}</div>
    <label class="field"><span>ユーザー名</span><input class="input" id="lf-user" autocomplete="username" autocapitalize="off" required></label>
    ${mode === 'signup' ? `<label class="field"><span>招待の合言葉（2人目からいります。はじめての人は空のまま）</span><input class="input" id="lf-inv" autocapitalize="characters" placeholder="ABCD-EFGH"></label>` : ''}
    ${mode === 'reset' ? `<label class="field"><span>復活用の合言葉</span><input class="input" id="lf-rec" autocapitalize="characters" placeholder="ABCD-EFGH-JKLM" required></label>` : ''}
    <label class="field"><span>${mode === 'reset' ? '新しいパスワード' : 'パスワード'}</span><input class="input" id="lf-pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
    <div class="err" role="alert">${esc(err)}</div>
    <button class="btn" type="submit">${{ login: 'ログイン', signup: '登録してはじめる', reset: 'パスワードを作り直す' }[mode]}</button>
    <button class="link" type="button" id="trial">ログインせずにためす（この端末だけに保存）</button>
    <button class="link" type="button" id="first">はじめての準備（1回だけ・グーグルドライブ）</button>
  </form></div>`;
  $$('.tabs button', app).forEach(b => b.onclick = e => { e.preventDefault(); renderLogin(b.dataset.m); });
  $('#trial').onclick = () => { lsSet('lb_token', LOCAL_TOKEN); boot(); };
  $('#first').onclick = openFirstSetup;
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
  if (!keep) { closeSheet(); hideAnno(); stopPlayback(); }
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/');
  const q = new URLSearchParams(qs || '');
  if (!keep) window.scrollTo(0, 0);
  if (parts[0] === 'artist' && S.artists.has(parts[1])) return renderArtist(parts[1]);
  if (parts[0] === 'song' && S.songs.has(parts[1])) return renderSong(parts[1]);
  if (parts[0] === 'edit' && S.songs.has(parts[1])) return renderEdit(parts[1]);
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
  S.view = 'home';
  setBarColor(S.settings.dark ? '#120d0a' : '#4a2c1a');
  app.innerHTML = `<div class="screen home">
    <div class="band"><div class="wrap">
      <div class="topbar"><span></span><div class="acts">
        <button class="pill-btn" data-go="#/help">${I.help}解説</button>
        <button class="icon-btn" data-go="#/settings" aria-label="設定">${I.gear}</button>
      </div></div>
      <h1 class="logo">LYRIC BOOK<small>歌詞と歌い方のノート</small></h1>
      <div class="seg" role="tablist">
        <button data-tab="real" class="${S.tab === 'real' ? 'on' : ''}" role="tab">実在する曲</button>
        <button data-tab="own" class="${S.tab === 'own' ? 'on' : ''}" role="tab">自作</button>
      </div>
    </div></div>
    <div class="wrap content">
      <label class="search">${I.search}<input id="q" type="search" placeholder="曲名・歌手・歌い出しで検索" value="${esc(S.query)}" enterkeyhint="search"></label>
      <div id="homeList"></div>
    </div>
    <button class="fab" id="fab" aria-label="新しく入れる">${I.plus}</button>
  </div>`;
  $$('.seg button', app).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; lsSet('lb_tab', S.tab); renderHome(); });
  $('#q').oninput = e => { S.query = e.target.value; renderHomeList(); };
  $('#fab').onclick = () => {
    if (S.tab === 'real') newArtist();
    else go(`#/new?kind=own${S.themeFilter !== 'all' ? '&theme=' + S.themeFilter : ''}`);
  };
  renderHomeList();
  autoJackets();
}

function songRow(s, showKind = false) {
  const d = s.data;
  const th = d.kind === 'own' ? themeOf(d.theme_id) : null;
  const artist = d.kind === 'real' ? S.artists.get(d.artist_id)?.data.name : '';
  const title = d.title || '題名なし';
  const sub = [showKind ? (d.kind === 'own' ? '自作' : artist) : '', L.firstLine(d.text) || '（歌詞はまだありません）'].filter(Boolean).join('　');
  const k = d.keys || {};
  const keyTxt = k.orig ? `原 ${esc(k.orig)}<br>${k.shift ? (k.shift > 0 ? '+' : '−') + Math.abs(k.shift) : '±0'}` : '';
  return `<button class="item" data-go="#/song/${s.id}">
    ${th ? `<span class="dot" style="--c:${esc(th.color)}"></span>` : '<span class="nodot"></span>'}
    <b>${esc(title)}</b><span class="k">${keyTxt}</span><i>${esc(sub)}</i></button>`;
}

function searchSongs(q) {
  const n = s => (s || '').normalize('NFKC').toLowerCase();
  const kq = n(q);
  return Array.from(S.songs.values()).filter(s => {
    const d = s.data;
    const a = d.kind === 'real' ? S.artists.get(d.artist_id)?.data : null;
    return [d.title, d.yomi, a?.name, a?.yomi, d.text].some(x => n(x).includes(kq));
  }).sort((a, b) => (L.firstLine(a.data.text).normalize('NFKC').toLowerCase().includes(kq) ? 0 : 1) - (L.firstLine(b.data.text).normalize('NFKC').toLowerCase().includes(kq) ? 0 : 1) || jaCmp(a.data.title || '', b.data.title || ''));
}

function renderHomeList() {
  const box = $('#homeList'); if (!box) return;
  if (S.query.trim()) {
    const hits = searchSongs(S.query.trim());
    box.innerHTML = hits.length ? `<div class="list">${hits.map(s => songRow(s, true)).join('')}</div>`
      : `<div class="empty">「${esc(S.query)}」は見つかりませんでした</div>`;
    return;
  }
  if (S.tab === 'real') {
    const arts = Array.from(S.artists.values()).sort((a, b) => jaCmp(a.data.yomi || a.data.name, b.data.yomi || b.data.name));
    const count = id => Array.from(S.songs.values()).filter(s => s.data.artist_id === id).length;
    box.innerHTML = `<div class="grid">${arts.map(a => `<button class="art" data-go="#/artist/${a.id}">
        ${photoBox(a)}<b>${esc(a.data.name)}</b><i>${count(a.id)}曲</i></button>`).join('')}
      <button class="art" id="addArtist"><div class="ph add">＋ 歌手を追加</div></button></div>
      ${arts.length ? '' : '<div class="empty">まずは「＋ 歌手を追加」から、<br>好きな歌手を入れてみましょう。</div>'}`;
    $('#addArtist').onclick = newArtist;
  } else {
    const songs = Array.from(S.songs.values()).filter(s => s.data.kind === 'own' && (S.themeFilter === 'all' || s.data.theme_id === S.themeFilter))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    box.innerHTML = `<div class="chips" style="margin-bottom:6px">
        <button class="chip ${S.themeFilter === 'all' ? 'on' : ''}" data-th="all">すべて</button>
        ${S.settings.themes.map(t => `<button class="chip ${S.themeFilter === t.id ? 'on' : ''}" data-th="${esc(t.id)}"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.name)}</button>`).join('')}
      </div>
      ${songs.length ? `<div class="list">${songs.map(s => songRow(s)).join('')}</div>` : '<div class="empty">右下の「＋」から、<br>自分の歌詞を書いてみましょう。</div>'}`;
    $$('[data-th]', box).forEach(b => b.onclick = () => { S.themeFilter = b.dataset.th; renderHomeList(); });
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
      const dup = Array.from(S.artists.values()).find(a => a.data.name.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase());
      if (dup) { closeSheet(); go(`#/artist/${dup.id}`); return; }
      const a = await createArtist(name, $('#na-yomi', sh).value.trim());
      closeSheet();
      if (a) go(`#/artist/${a.id}`);
    },
  });
  $('#na-name', sheet).focus();
}
async function createArtist(name, yomi = '') {
  const a = { id: uuid(), data: { name, yomi }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  try {
    S.artists.set(a.id, a);
    const r = await send('lb_save_artist', { p_token: S.token, p_id: a.id, p_data: a.data });
    if (r) Object.assign(a, r);
    fetchJacket(a);
    return a;
  } catch (e) { S.artists.delete(a.id); fail(e); return null; }
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
const jacketBusy = new Set();
async function fetchJacket(a, force = false) {
  if (jacketBusy.has(a.id) || (!force && (a.data.photo || a.data.auto_tried))) return;
  jacketBusy.add(a.id);
  try {
    const term = encodeURIComponent(a.data.name);
    const d = await jsonp(`https://itunes.apple.com/search?term=${term}&country=JP&lang=ja_jp&entity=album&attribute=artistTerm&limit=10`);
    const nk = s => (s || '').normalize('NFKC').toLowerCase().replace(/\s/g, '');
    const list = d.results || [];
    const hit = list.find(r => nk(r.artistName) === nk(a.data.name)) || list[0];
    a.data.auto_tried = true;
    if (hit?.artworkUrl100) {
      a.data.photo = hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.');
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
  const songs = Array.from(S.songs.values()).filter(s => s.data.artist_id === id)
    .sort((x, y) => jaCmp(x.data.yomi || x.data.title || '', y.data.yomi || y.data.title || ''));
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
      ${songs.length > 6 ? `<label class="search">${I.search}<input id="aq" type="search" placeholder="この歌手の曲を検索"></label>` : ''}
      <div class="list" id="alist">${rows || '<div class="empty">右下の「＋」から、<br>この歌手の曲を入れましょう。</div>'}</div>
    </div>
    <button class="fab" data-go="#/new?kind=real&artist=${id}" aria-label="曲を追加">${I.plus}</button>
  </div>`;
  $('#bk').onclick = () => back('#/');
  $('#photo').onclick = () => changePhoto(a);
  $('#amenu').onclick = () => artistMenu(a);
  $('#aq')?.addEventListener('input', e => {
    const q = e.target.value.normalize('NFKC').toLowerCase();
    $$('#alist .item', app).forEach(it => { it.hidden = q && !it.textContent.normalize('NFKC').toLowerCase().includes(q); });
    $$('#alist .idx', app).forEach(ix => { ix.hidden = !!q; });
  });
}
async function changePhoto(a) {
  const v = await menu('写真を変える', [
    { label: '端末の写真から選ぶ（スクショなど）', value: 'pick' },
    { label: 'ジャケットを自動で探しなおす', value: 'auto' },
    ...(a.data.photo ? [{ label: '写真をはずす', value: 'none', danger: true }] : []),
  ]);
  if (v === 'pick') {
    const url = await pickImage(); if (!url) return;
    a.data.photo = url; a.data.photo_auto = false; a.data.color = await pickColor(url);
    await saveArtist(a); renderArtist(a.id);
  } else if (v === 'auto') {
    a.data.photo = null; a.data.auto_tried = false; renderArtist(a.id);
    await fetchJacket(a, true);
    if (!a.data.photo) toast('ジャケットが見つかりませんでした');
  } else if (v === 'none') {
    a.data.photo = null; a.data.color = null; a.data.auto_tried = true;
    await saveArtist(a); renderArtist(a.id);
  }
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
        closeSheet(); await saveArtist(a); renderArtist(a.id);
      },
    });
    void sheet;
  } else if (v === 'del') {
    const n = Array.from(S.songs.values()).filter(s => s.data.artist_id === a.id).length;
    if (!(await confirmAsk(`「${a.data.name}」を消しますか？`, n ? `この歌手の${n}曲と、その録音も消えます。元にはもどせません。` : '元にはもどせません。', '消す', true))) return;
    try {
      await send('lb_delete_artist', { p_token: S.token, p_id: a.id });
      for (const s of Array.from(S.songs.values())) if (s.data.artist_id === a.id) { S.songs.delete(s.id); S.recs = S.recs.filter(r => r.song_id !== s.id); }
      S.artists.delete(a.id);
      go('#/');
    } catch (e) { fail(e); }
  }
}

// ---------- 歌詞ページ ----------
function keysBlock(d) {
  const k = d.keys || {};
  const note = (label, m) => `<div>${label}<b>${m != null && m !== '' ? esc(N.noteName(m)) : '—'}</b>${m != null && m !== '' ? `<button class="play-sm" data-play="${m}">▶ 鳴らす</button>` : '<small>&nbsp;</small>'}</div>`;
  const shift = k.shift ? (k.shift > 0 ? '+' : '−') + Math.abs(k.shift) : '±0';
  return `<div class="keys" id="keys">
    <div>原キー<b>${esc(k.orig || '—')}</b><small>&nbsp;</small></div>
    <div>自分<b>${k.orig || k.shift ? shift : '—'}</b><small>${k.orig && k.shift ? esc(N.shiftKey(k.orig, k.shift)) : '&nbsp;'}</small></div>
    ${note('最高音', k.top)}${note('最低音', k.low)}${note('歌い出し', k.start)}
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
      <span class="nm">${esc(r.name)}</span><span class="bar-p"><span></span></span><span class="t">${R.fmtTime(r.duration)}</span>
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
    <div class="head"><div class="wrap">
      <div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><div class="acts">
        <button class="icon-btn" data-go="#/edit/${id}" aria-label="編集">${I.edit}</button>
        <button class="icon-btn" id="smenu" aria-label="そのほか">${I.more}</button></div></div>
      <div class="eyebrow">${th ? `<i class="dot" style="--c:${esc(th.color)}"></i>自作　${esc(th.name)}` : d.kind === 'own' ? '自作' : '実在する曲'}</div>
      <h1 class="big">${esc(d.title || '題名なし')}</h1>
      ${artist ? `<button class="artist-link" data-go="#/artist/${artist.id}">${esc(artist.data.name)}</button>` : ''}
      <div class="meta"><span>作成 ${fmtDate(s.created_at)}</span><span>更新 ${fmtDate(s.updated_at)}</span></div>
    </div></div>
    <div class="wrap content">
      ${keysBlock(d)}
      ${!hasAnno && !S.settings.hintDone && d.text ? `<div class="hint" id="hint">歌詞の文字を指でなぞって選ぶと、下に記号・色・メモのボタンが出ます。</div>` : ''}
      <div class="lyr" id="lyr">${lyricsHtml(s)}</div>
      <div id="recsBox">${recsHtml(id)}</div>
    </div>
    <div class="toolbar"><div class="wrap">
      <button class="rec-b" id="tRec">${I.mic}録音</button>
      <button id="tKb">${I.piano}鍵盤</button>
      <button data-go="#/help">${I.book}解説</button>
      <button data-go="#/edit/${id}">${I.edit}編集</button>
    </div></div>
  </div>`;
  $('#bk').onclick = () => back(artist ? `#/artist/${artist.id}` : '#/');
  $('#smenu').onclick = () => songMenu(s);
  $('#tRec').onclick = () => openRecorder(id);
  $('#tKb').onclick = () => openKeyboard();
  $('#keys').onclick = e => { const p = e.target.closest('[data-play]'); if (p) N.playNote(+p.dataset.play); else openKeyEditor(s); };
  $('#lyr').onclick = e => { const m = e.target.closest('[data-memo]'); if (m) editMemo(s, +m.dataset.memo); };
  bindRecs(id);
}

function refreshLyrics(s) {
  const box = $('#lyr'); if (!box) return;
  box.innerHTML = lyricsHtml(s);
}

async function songMenu(s) {
  const v = await menu(s.data.title || '題名なし', [
    { label: '編集する', value: 'edit' },
    { label: '書きこみ（記号・色・メモ）を全部消す', value: 'clear' },
    { label: 'この曲を消す', value: 'del', danger: true },
  ]);
  if (v === 'edit') go(`#/edit/${s.id}`);
  else if (v === 'clear') {
    if (!(await confirmAsk('書きこみを全部消しますか？', '記号・色・メモが消えます。歌詞と録音は残ります。', '消す', true))) return;
    s.data.anno = L.realign([], s.data.text);
    refreshLyrics(s); queueSave(s);
  } else if (v === 'del') deleteSong(s);
}
async function deleteSong(s) {
  const n = S.recs.filter(r => r.song_id === s.id).length;
  if (!(await confirmAsk('この曲を消しますか？', (n ? `録音${n}個も消えます。` : '') + '元にはもどせません。', '消す', true))) return;
  try {
    await send('lb_delete_song', { p_token: S.token, p_id: s.id });
    S.songs.delete(s.id); S.recs = S.recs.filter(r => r.song_id !== s.id);
    const aid = s.data.artist_id;
    go(s.data.kind === 'real' && S.artists.has(aid) ? `#/artist/${aid}` : '#/');
  } catch (e) { fail(e); }
}

// 歌詞の保存（書きこみはまとめて少しあとに）
function queueSave(s, now = false) {
  clearTimeout(S.saveTimers.get(s.id));
  const run = async () => {
    S.saveTimers.delete(s.id);
    try {
      const r = await send('lb_save_song', { p_token: S.token, p_id: s.id, p_data: s.data, p_base: s.updated_at || null });
      if (r) Object.assign(s, r);
      cacheSoon();
    } catch (e) {
      if (e.code === 'conflict') { await keepBoth(s.data).catch(fail); await refresh(true); }
      else fail(e);
    }
  };
  if (now) return run();
  S.saveTimers.set(s.id, setTimeout(run, 700));
}

// ---------- なぞって書きこむ ----------
let selRaf = 0;
document.addEventListener('selectionchange', () => {
  if (!S.view.startsWith('song:')) return;
  cancelAnimationFrame(selRaf);
  selRaf = requestAnimationFrame(readSelection);
});
function readSelection() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const lyr = $('#lyr'); if (!lyr) return;
  const range = sel.getRangeAt(0);
  if (!lyr.contains(range.commonAncestorContainer) && !range.intersectsNode(lyr)) return;
  let from = null, to = null;
  for (const sp of $$('[data-i]', lyr)) {
    if (!range.intersectsNode(sp)) continue;
    // 端の文字が「ふれているだけ」のときは入れない
    const p = { l: +sp.dataset.l, i: +sp.dataset.i };
    if (!from) from = p;
    to = p;
  }
  if (!from) return;
  S.sel = { from, to };
  showAnno();
}
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
  bar.innerHTML = `<div class="wrap">
    <div class="lbl"><span>記号（選んだ最初の文字の上につく）</span><button class="icon-btn" data-a="close" aria-label="とじる" style="width:32px;height:32px">${I.close}</button></div>
    <div class="row">${st.marks.map(m => `<button class="tool" data-a="mark" data-k="${esc(m.id)}"><b>${esc(m.label)}</b>${esc(m.name)}</button>`).join('')}</div>
    <div class="lbl"><span>色・メモ</span></div>
    <div class="row">${st.colors.map(c => `<button class="tool" data-a="color" data-k="${esc(c.id)}"><span class="sw" style="--c:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}
      <button class="tool wide" data-a="memo">メモ</button><button class="tool wide" data-a="clear">消す</button></div>
  </div>`;
}
function hideAnno() { $('#annobar')?.remove(); S.sel = null; }
function onAnno(e, s) {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a;
  if (a === 'close') { getSelection()?.removeAllRanges(); hideAnno(); return; }
  if (!S.sel) return;
  const anno = L.ensureAnno(s.data);
  const { from, to } = S.sel;
  if (a === 'mark') L.toggleMark(anno, from, t.dataset.k);
  else if (a === 'color') L.toggleColor(anno, from, to, t.dataset.k);
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
      <label class="field"><span>原キー</span><select class="select" id="k-orig">${keyOptions(k.orig)}</select></label>
      <label class="field"><span>自分のキー（いくつ上げ下げ）</span><select class="select" id="k-shift">${shiftOptions(k.shift)}</select></label>
    </div>
    <div class="row3">
      <label class="field"><span>最高音</span><select class="select" id="k-top">${noteOptions(k.top)}</select></label>
      <label class="field"><span>最低音</span><select class="select" id="k-low">${noteOptions(k.low)}</select></label>
      <label class="field"><span>歌い出し</span><select class="select" id="k-start">${noteOptions(k.start)}</select></label>
    </div>`;
}
function readKeyFields(root) {
  const num = id => { const v = $(id, root).value; return v === '' ? null : +v; };
  return { orig: $('#k-orig', root).value, shift: +$('#k-shift', root).value || 0, top: num('#k-top'), low: num('#k-low'), start: num('#k-start') };
}
function bindNotePreview(root) {
  ['#k-top', '#k-low', '#k-start'].forEach(id => $(id, root).addEventListener('change', e => { if (e.target.value !== '') N.playNote(+e.target.value); }));
}
function openKeyEditor(s) {
  const sheet = openSheet(`<h3>キーと音の高さ</h3>${keyFields(s.data.keys)}
    <p class="muted" style="font-size:.8rem">音を選ぶと、その音が鳴ります。</p>
    <div class="acts"><button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">保存</button></div>`, {
    no: () => closeSheet(),
    ok: (_, sh) => { s.data.keys = readKeyFields(sh); closeSheet(); queueSave(s, true).then(() => renderSong(s.id)); },
  });
  bindNotePreview(sheet);
}

// ---------- 録音 ----------
let player = null; // { id, audio }
const blobCache = new Map();
function stopPlayback() {
  if (player) { player.audio.pause(); player = null; }
  $$('.rec.playing').forEach(r => { r.classList.remove('playing'); const b = $('.pb', r); if (b) b.innerHTML = PLAY; });
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
    let url = blobCache.get(id + r.updated_at);
    if (!url) {
      if (row) $('.pb', row).innerHTML = '…';
      const d = await rpc('lb_get_recording', { p_token: S.token, p_id: id });
      url = URL.createObjectURL(R.base64ToBlob(d.audio, d.mime));
      blobCache.set(id + r.updated_at, url);
    }
    const audio = new Audio(url);
    player = { id, audio };
    audio.ontimeupdate = () => {
      const bar = $(`[data-rec="${id}"] .bar-p span`);
      const dur = isFinite(audio.duration) && audio.duration ? audio.duration : r.duration;
      if (bar && dur) bar.style.width = Math.min(100, audio.currentTime / dur * 100) + '%';
    };
    audio.onended = () => { setPlayingUi(id, false); const bar = $(`[data-rec="${id}"] .bar-p span`); if (bar) bar.style.width = '0'; player = null; };
    await audio.play();
    setPlayingUi(id, true);
  } catch (e) { setPlayingUi(id, false); fail(e); }
}
function setPlayingUi(id, on) {
  const row = $(`[data-rec="${id}"]`); if (!row) return;
  row.classList.toggle('playing', on);
  $('.pb', row).innerHTML = on ? PAUSE : PLAY;
}
async function recMenu(songId, id) {
  const r = S.recs.find(x => x.id === id); if (!r) return;
  const v = await menu(r.name, [
    { label: '上書きして録り直す', value: 'over' },
    { label: '名前を変える', value: 'rename' },
    { label: 'この録音を消す', value: 'del', danger: true },
  ]);
  if (v === 'over') openRecorder(songId, id);
  else if (v === 'rename') {
    const name = await askText({ title: '録音の名前', value: r.name });
    if (!name?.trim()) return;
    try { await rpc('lb_rename_recording', { p_token: S.token, p_id: id, p_name: name.trim() }); r.name = name.trim().slice(0, 40); refreshRecs(songId); }
    catch (e) { fail(e); }
  } else if (v === 'del') {
    if (!(await confirmAsk(`「${r.name}」を消しますか？`, '元にはもどせません。', '消す', true))) return;
    try { await rpc('lb_delete_recording', { p_token: S.token, p_id: id }); S.recs = S.recs.filter(x => x.id !== id); stopPlayback(); refreshRecs(songId); }
    catch (e) { fail(e); }
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
          } else {
            const nums = S.recs.filter(x => x.song_id === songId).map(x => +(x.name.match(/^録音 (\d+)$/)?.[1] || 0));
            r = await rpc('lb_add_recording', { p_token: S.token, p_song_id: songId, p_name: `録音 ${Math.max(0, ...nums) + 1}`, p_mime: mime, p_duration: duration, p_audio: audio });
            S.recs.push(r);
          }
          cacheSoon();
          state = 'done';
          closeSheet();
          refreshRecs(songId);
          toast('録音を保存しました');
        } catch (e) { state = 'idle'; closeSheet(); fail(e); }
      }
    },
  }, () => { if (state === 'rec') rec?.cancel(); });
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
  const arts = Array.from(S.artists.values()).sort((a, b) => jaCmp(a.data.yomi || a.data.name, b.data.yomi || b.data.name));
  const draw = () => {
    app.innerHTML = `<div class="screen lyricS editS">
      <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><strong style="color:var(--title)">${s ? '編集' : '新しい曲'}</strong><button class="btn small" id="save">保存</button></div></div>
      <div class="wrap content">
        ${s ? '' : `<div class="seg2"><button data-kind="real" class="${d.kind === 'real' ? 'on' : ''}">実在する曲</button><button data-kind="own" class="${d.kind === 'own' ? 'on' : ''}">自作</button></div>`}
        ${d.kind === 'real' ? `
          <label class="field"><span>歌手</span><select class="select" id="e-artist">
            <option value="">選んでください</option>${arts.map(a => `<option value="${a.id}" ${a.id === d.artist_id ? 'selected' : ''}>${esc(a.data.name)}</option>`).join('')}
            <option value="__new">＋ 新しい歌手</option></select></label>
          <label class="field" id="e-newart" hidden><span>新しい歌手の名前</span><input class="input" id="e-artname" placeholder="例：あいみょん"></label>
          <label class="field"><span>曲名</span><input class="input" id="e-title" value="${esc(d.title)}"></label>
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
          <textarea class="textarea" id="e-text" placeholder="[Aメロ]&#10;ここに歌詞を書くか、貼りつけます&#10;&#10;[サビ]&#10;…">${esc(d.text)}</textarea>
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
        ${s ? '<button class="btn danger" id="e-del">この曲を消す</button>' : ''}
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
    $('#e-del')?.addEventListener('click', () => deleteSong(s));
  };
  const save = async () => {
    collect();
    const btn = $('#save'); btn.disabled = true;
    try {
      if (d.kind === 'real') {
        if ($('#e-artist').value === '__new') {
          const name = $('#e-artname').value.trim();
          if (!name) { toast('新しい歌手の名前を入れてください'); btn.disabled = false; return; }
          const dup = Array.from(S.artists.values()).find(a => a.data.name.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase());
          const a = dup || await createArtist(name);
          if (!a) { btn.disabled = false; return; }
          d.artist_id = a.id;
        }
        if (!d.artist_id) { toast('歌手を選んでください'); btn.disabled = false; return; }
        if (!d.title) { toast('曲名を入れてください'); btn.disabled = false; return; }
        delete d.theme_id;
      } else { delete d.artist_id; delete d.yomi; }
      d.anno = L.realign(d.anno, d.text);
      const sid = s?.id || uuid();
      const obj = s || { id: sid, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const base = s?.updated_at || null;
      obj.data = d;
      S.songs.set(sid, obj);
      let r;
      try { r = await send('lb_save_song', { p_token: S.token, p_id: sid, p_data: d, p_base: base }); }
      catch (e) {
        if (e.code !== 'conflict') throw e;
        await keepBoth(d);
        await refresh(true);
        history.replaceState(null, '', '#/'); route();
        return;
      }
      if (r) Object.assign(obj, r);
      cacheSoon();
      if (s && navDepth > 0 && location.hash === `#/edit/${sid}`) { navDepth--; history.back(); }
      else { history.replaceState(null, '', `#/song/${sid}`); route(); }
      toast('保存しました');
    } catch (e) { btn.disabled = false; fail(e); }
  };
  draw();
}

// ---------- 解説 ----------
function renderHelp(tab) {
  S.view = 'help';
  setBarColor(S.settings.dark ? '#241a13' : '#e4cfb1');
  const st = S.settings;
  let body = '';
  if (tab === 'marks') {
    body = `<p class="help-p">歌詞の文字をなぞって選ぶと、下にボタンが出ます。記号は選んだ最初の文字の上に、色は選んだ文字全部につきます。同じボタンをもう一度押すと消えます。</p>
      <div class="card">${st.marks.map(m => `<div class="g"><span class="m">${esc(m.label)}</span><b>${esc(m.name)}</b><i>${esc(m.desc || '')}</i></div>`).join('')}</div>
      <p class="sec-lbl" style="margin:6px 0 -4px">色</p>
      <div class="card">${st.colors.map(c => `<div class="g"><span class="sw" style="--c:${esc(c.color)}"></span><b>${esc(c.name)}</b><i>${esc(c.desc || '選んだ文字がこの色になって、下に線が引かれます')}</i></div>`).join('')}</div>
      <p class="help-p muted" style="font-size:.8rem">記号や色は、設定から足したり変えたりできます。</p>`;
  } else if (tab === 'notes') {
    let rows = '';
    for (let m = 81; m >= 43; m--) {
      rows += `<div class="n-row ${N.isBlack(m) ? 'black' : ''} ${st.myTop === m ? 'me' : ''}"><b>${N.noteName(m)}</b><i>${N.doremi(m)}</i><button class="play" data-play="${m}" aria-label="${N.noteName(m)}を鳴らす">${PLAY}</button></div>`;
    }
    body = `<p class="help-p">カラオケでよく使う音の高さの呼び方です。hiA が「ラ」（ピアノの真ん中のドから上のラ）。A（ラ）から上がるごとに low → mid1 → mid2 → hi → hihi と名前が変わります。▶ で音を鳴らせます。</p>
      <div class="card">${rows}</div>`;
  } else {
    body = `<div class="card" style="padding:14px 16px"><p class="help-p"><b>写真の歌詞を文字にするには</b><br>
      1. 歌詞の編集画面の「写真を選ぶ」で、歌詞の写真を選びます。<br>
      2. 出てきた写真の文字を長押しすると、文字が選べます。「すべてを選択」→「コピー」。<br>
      3. 歌詞の欄を長押しして「ペースト」。<br>
      まちがって読みとった字は、そのまま直してください。</p></div>
      <div class="card" style="padding:14px 16px"><p class="help-p"><b>パートの分け方</b><br>
      歌詞の中に <b>[サビ]</b> のような行を入れると、そこからがそのパートになります。編集画面のボタンで入れられます。</p></div>
      <div class="card" style="padding:14px 16px"><p class="help-p"><b>録音</b><br>
      歌詞ページの下の「録音」で録れます。何個でも残せます。録音を長押しすると、上書き・名前の変更・削除ができます。</p></div>
      <div class="card" style="padding:14px 16px"><p class="help-p"><b>ホーム画面に置く</b><br>
      Safari の共有ボタン →「ホーム画面に追加」で、アプリのように開けます。</p></div>`;
  }
  app.innerHTML = `<div class="screen helpS">
    <div class="wrap"><div class="topbar"><button class="icon-btn" id="bk" aria-label="もどる">${I.back}</button><span></span></div></div>
    <div class="wrap content">
      <h1 class="big">解説</h1>
      <div class="tabs"><button data-t="marks" class="${tab === 'marks' ? 'on' : ''}">記号と色</button><button data-t="notes" class="${tab === 'notes' ? 'on' : ''}">音の高さ</button><button data-t="how" class="${tab === 'how' ? 'on' : ''}">使い方</button></div>
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
        <div class="set-row"><span>自分の最高音</span><select class="select" id="my-top" style="width:auto">${noteOptions(st.myTop)}</select></div>
      </div>
      <p class="sec-lbl">自作のテーマ</p>
      <div class="card">${st.themes.map((t, i) => `<div class="set-row"><span class="l"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.name)}</span><button class="btn sub small" data-ed="themes" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">テーマを足す</span><button class="btn small" data-add="themes">＋ 追加</button></div></div>
      <p class="sec-lbl">歌い方の記号</p>
      <div class="card">${st.marks.map((m, i) => `<div class="set-row"><span class="l"><span class="mk-badge">${esc(m.label)}</span>${esc(m.name)}</span><button class="btn sub small" data-ed="marks" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">記号を足す</span><button class="btn small" data-add="marks">＋ 追加</button></div></div>
      <p class="sec-lbl">色</p>
      <div class="card">${st.colors.map((c, i) => `<div class="set-row"><span class="l"><i class="dot" style="--c:${esc(c.color)}"></i>${esc(c.name)}</span><button class="btn sub small" data-ed="colors" data-i="${i}">変える</button></div>`).join('')}
        <div class="set-row"><span class="muted">色を足す</span><button class="btn small" data-add="colors">＋ 追加</button></div></div>
      ${S.token !== LOCAL_TOKEN && S.serverVersion < 2 ? `<div class="hint">Googleの画面に貼ったコードが古い版です。ログイン画面の「はじめての準備」でコードをコピーして貼りかえ、「デプロイ」→「デプロイを管理」→ えんぴつ →「新バージョン」→「デプロイ」をしてください。</div>` : ''}
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
  $('#my-top').onchange = e => { st.myTop = e.target.value === '' ? null : +e.target.value; if (st.myTop != null) N.playNote(st.myTop); saveSettings(); };
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
      <span style="display:flex;flex-direction:column;gap:6px"><button class="btn small" id="inv-copy">コピー</button><button class="btn sub small" id="inv-new">作りなおす</button></span></div>
    ${d.members.length ? d.members.map(m => `<div class="set-row"><span>${esc(m.username)}<br><span class="muted" style="font-size:.78rem">曲 ${m.songs}・録音 ${m.recordings}${m.changed_at ? `・最後に使った日 ${fmtDate(m.changed_at, false)}` : ''}</span></span><button class="btn danger small" data-out="${esc(m.id)}" data-nm="${esc(m.username)}">外す</button></div>`).join('')
      : '<div class="set-row"><span class="muted">まだメンバーはいません。招待の合言葉を教えると、その人が「はじめて」から登録できます。</span></div>'}
    <div class="set-row"><span class="muted" style="font-size:.78rem">メンバーの歌詞や録音も、あなたのドライブの「LYRIC BOOK / メンバー」に保存されます。</span></div>`;
  $('#inv-copy').onclick = () => navigator.clipboard?.writeText(d.invite).then(() => toast('コピーしました'), () => toast('長押しでコピーしてください'));
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

// はじめての準備：Googleの画面に受け口のコードを貼ってもらう
async function openFirstSetup() {
  let code = '';
  try { code = await (await fetch('server/Code.gs?v=' + APP_VERSION)).text(); }
  catch (e) { toast('コードを読みこめませんでした。電波のよい所でもう一度ためしてください'); return; }
  openSheet(`<h3>はじめての準備（1回だけ）</h3>
    <p>あなたのグーグルドライブに、LYRIC BOOK の置き場所を作ります。<b>パソコンかiPadでやるのがおすすめです。</b></p>
    <ol class="steps">
      <li>下の「コードをコピー」を押す</li>
      <li>「Googleの画面を開く」を押す（使いたいGoogleアカウントで）</li>
      <li>最初から書いてある文字を全部消して、コピーしたコードを貼る → 保存のマーク（フロッピー）を押す</li>
      <li>上の「実行する関数」で <b>setup</b> を選んで「実行」<br>「承認が必要です」→ 権限を確認 → 自分のアカウント →「詳細」→「（安全ではないページ）に移動」→「許可」<br><span class="muted">自分で作ったものなので大丈夫です</span></li>
      <li>右上の「デプロイ」→「新しいデプロイ」→ 歯車のマークで「ウェブアプリ」を選ぶ<br>「次のユーザーとして実行」は<b>自分</b>、「アクセスできるユーザー」は<b>全員</b> →「デプロイ」</li>
      <li>出てきた「ウェブアプリ」のURL（https://script.google.com/macros/s/…/exec）をコピーして、アプリを作っている人に送る</li>
    </ol>
    <textarea class="textarea code" id="fs-code" readonly>${esc(code)}</textarea>
    <div class="acts"><a class="btn sub" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">Googleの画面を開く</a><button class="btn" data-s="copy">コードをコピー</button></div>
    <button class="btn sub" data-s="no">とじる</button>`, {
    copy: (_, sh) => {
      const ta = $('#fs-code', sh);
      const done = () => toast('コピーしました。Googleの画面に貼りつけてください');
      navigator.clipboard?.writeText(code).then(done, () => { ta.focus(); ta.select(); document.execCommand('copy') ? done() : toast('コードを長押しして「すべてを選択」→「コピー」してください'); });
    },
    no: () => closeSheet(),
  });
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
  const title = { themes: 'テーマ', marks: '歌い方の記号', colors: '色' }[kind];
  const sheet = openSheet(`<h3>${i >= 0 ? `${title}を変える` : `${title}を足す`}</h3>
    ${kind === 'marks' ? `<label class="field"><span>歌詞の上に出す文字（1〜2文字）</span><input class="input" id="li-label" maxlength="2" value="${esc(it.label)}" placeholder="例：シ"></label>` : ''}
    <label class="field"><span>名前</span><input class="input" id="li-name" value="${esc(it.name)}" placeholder="${kind === 'themes' ? '例：友情' : kind === 'marks' ? '例：しゃくり上げ' : '例：ささやく'}"></label>
    ${kind === 'marks' ? `<label class="field"><span>説明（解説に出ます）</span><input class="input" id="li-desc" value="${esc(it.desc || '')}"></label>` : ''}
    ${kind !== 'marks' ? `<div class="field"><span>色</span><div class="chips" id="li-colors">${SWATCHES.map(c => `<button class="chip ${c === it.color ? 'on' : ''}" data-s="col" data-c="${c}" aria-label="${c}"><i class="dot" style="--c:${c};width:18px;height:18px"></i></button>`).join('')}</div></div>` : ''}
    <div class="acts">${i >= 0 ? '<button class="btn danger" data-s="del">消す</button>' : ''}<button class="btn sub" data-s="no">やめる</button><button class="btn" data-s="ok">保存</button></div>`, {
    col: t => { it.color = t.dataset.c; $$('#li-colors .chip', sheet).forEach(c => c.classList.toggle('on', c === t)); },
    no: () => closeSheet(),
    del: async () => {
      closeSheet();
      if (list.length <= 1) { toast('1つは残してください'); return; }
      if (!(await confirmAsk(`「${it.name}」を消しますか？`, kind === 'themes' ? 'このテーマの曲は「テーマなし」になります。' : 'この印をつけていた所からも消えます。', '消す', true))) return;
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
