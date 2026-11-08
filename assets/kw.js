// KOTETSU WORKS アカウント（入口ページの右上）。2026-11-08
// ・ROOMIN とは別のアカウント。つなぐと、ここでログインするだけで ROOMIN にも入れる（同じ kotetsuworks.com なので合い鍵を渡せる）。
// ・ログインすると、アプリを「マイアプリ」と「持っていないアプリ」に分けて出す。自分だけのアプリは、持っている人にだけサーバーから届く。
// ・サーバーは ROOMIN と同じ Supabase（supabase/024・025 の kw_ の関数）。
const URL_ = 'https://zmteazudhtnzvfvmndqn.supabase.co';
const KEY = 'sb_publishable_0kgkan6JFFV-TMSLLTgiOQ_uwgeEfQf';
const SESSION = 'kw.session';
const ROOMIN_SESSION = 'studyroom.cloud';
const MSG = {
  name_length: 'ユーザー名は2〜16文字（文字・数字・_ - .）にしてください',
  password_short: 'パスワードは6文字以上にしてください',
  name_taken: 'そのユーザー名はもう使われています',
  bad_login: 'ユーザー名かパスワードがちがいます',
  too_many: 'まちがいが続いたので、15分ほど待ってからためしてください',
  already_linked: 'その ROOMIN アカウントは、ほかの KOTETSU WORKS アカウントとつながっています',
  bad_token: 'ログインが切れました。もう一度ログインしてください',
  not_admin: '管理者だけができます',
  not_found: '見つかりませんでした',
  offline: 'ネットにつながりませんでした',
};
const say = (e) => MSG[e?.code] || MSG[e?.message] || e?.message || 'うまくいきませんでした';

async function rpc(name, body, opts = {}) {
  let res;
  try {
    res = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', keepalive: !!opts.keepalive,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { throw Object.assign(new Error('offline'), { code: 'offline' }); }
  const t = await res.text(); const j = t ? JSON.parse(t) : null;
  if (!res.ok) throw Object.assign(new Error(j?.message || 'server'), { code: j?.message });
  return j;
}
const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* なし */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);

let me = null; // { username, admin, apps, private, links }
const session = () => get(SESSION);

// ---------- アプリの並べ方 ----------
function cardHTML(a) {
  const pic = a.icon ? `<img src="${esc(a.icon)}" alt="">` : `<span class="ph" style="background:linear-gradient(135deg,${esc(a.color || '#6b6f7a,#3d4049')})">${esc(a.ph || '・')}</span>`;
  return `<a class="app" data-id="${esc(a.id)}" data-c="${esc(a.c || '')}" href="${esc(a.href)}">${pic}<span class="t"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span><span class="cat">${esc(a.cat)}</span></a>`;
}
function layout() {
  const grid = $('.grid:not(.kw-grid)'), feat = $('.feature');
  // 入口に書いてあるカード（だれでも使えるアプリ）は、分けた欄からもとの一覧にもどしてから並べなおす
  document.querySelectorAll('a.app[data-static]').forEach(a => grid.appendChild(a));
  document.querySelectorAll('.kw-sec').forEach(e => e.remove());
  const pub = [...grid.querySelectorAll('a.app[data-static]')];
  if (!me) { grid.hidden = false; pub.forEach(a => grid.appendChild(a)); return; }
  grid.hidden = true;
  const all = pub.map(a => ({ el: a, id: a.dataset.id }));
  const mine = new Set(me.apps);
  const sec = (title, sub, items, cls) => {
    const s = document.createElement('section'); s.className = 'kw-sec ' + cls;
    s.innerHTML = `<h3>${title}<small>${sub}</small></h3><div class="grid kw-grid"></div>`;
    const g = $('.kw-grid', s);
    items.forEach(it => { if (it.el) g.appendChild(it.el); else g.insertAdjacentHTML('beforeend', cardHTML(it)); });
    if (!items.length) g.innerHTML = `<p class="kw-empty">${cls === 'kw-mine' ? '開いたアプリが、ここに入ります' : 'ぜんぶ持っています'}</p>`;
    grid.before(s);
  };
  const priv = (me.private || []).filter(Boolean).map(p => ({ ...p, c: 'mine' }));
  sec('マイアプリ', `${mine.size}`, [...all.filter(a => mine.has(a.id)), ...priv], 'kw-mine');
  sec('持っていないアプリ', '開くとマイアプリに入ります', all.filter(a => !mine.has(a.id)), 'kw-other');
  bindApps();
}
function bindApps() {
  document.querySelectorAll('a.app[data-id], a.feature[data-id]').forEach(a => {
    if (a._kw) return; a._kw = true;
    a.addEventListener('click', async (e) => {
      const s = session(); if (!s || !me) return;
      const id = a.dataset.id;
      if (id === 'roomin' || id === 'roomin-beta') { e.preventDefault(); await ensureRoomin(); location.href = a.href; return; }
      if (!me.apps.includes(id)) rpc('kw_app_add', { p_token: s.token, p_app: id }, { keepalive: true }).catch(() => {});
    });
  });
}
// つないだ ROOMIN に、ログインした状態で入る（この端末の ROOMIN のログインが生きていれば、そのまま）
async function ensureRoomin() {
  const s = session(); if (!s || !me?.links?.roomin) return;
  const cur = get(ROOMIN_SESSION);
  if (cur?.token && cur.name === me.links.roomin) {
    try { if (await rpc('sr_ping', { p_token: cur.token })) return; } catch (e) { /* 作りなおす */ }
  }
  try { const r = await rpc('kw_roomin_session', { p_token: s.token }); putRoomin(r); } catch (e) { /* ROOMIN のログイン画面へ */ }
}
const putRoomin = (r) => put(ROOMIN_SESSION, { token: r.token, id: r.username.normalize('NFKC').toLowerCase(), name: r.username, admin: !!r.is_admin });

// ---------- 右上のアカウント ----------
function drawButton() {
  const b = $('.acct');
  b.innerHTML = me ? `<span class="av">${esc([...me.username][0].toUpperCase())}</span>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
  b.classList.toggle('in', !!me);
  b.setAttribute('aria-label', me ? `アカウント（${me.username}）` : 'ログイン');
}
function openSheet(html) {
  closeSheet();
  const ov = document.createElement('div'); ov.className = 'kw-ov';
  ov.innerHTML = `<div class="kw-sheet" role="dialog" aria-modal="true"><button class="kw-x" aria-label="とじる">×</button>${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.kw-x')) closeSheet(); });
  document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
  return $('.kw-sheet', ov);
}
const closeSheet = () => document.querySelectorAll('.kw-ov').forEach(e => e.remove());
const busy = (form, on) => form.querySelectorAll('button, input, select').forEach(x => { x.disabled = on; });

function showLogin(mode = 'login') {
  const el = openSheet(`
    <h2>KOTETSU WORKS アカウント</h2>
    <div class="kw-seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">ログイン</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">新しく作る</button></div>
    <form class="kw-form">
      <label>ユーザー名<input name="u" autocomplete="username" required maxlength="16"></label>
      <label>パスワード<input name="p" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required></label>
      <p class="kw-err" role="alert"></p>
      <button class="kw-btn" type="submit">${mode === 'login' ? 'ログイン' : 'アカウントを作る'}</button>
    </form>
    <p class="kw-note">ROOMIN などのアプリのアカウントとは別です。作ったあとで、ROOMIN のアカウントとつなげます。つなぐと、ここでログインするだけで ROOMIN にも入れます。</p>`);
  el.querySelectorAll('.kw-seg button').forEach(b => b.onclick = () => showLogin(b.dataset.m));
  const f = $('form', el);
  f.onsubmit = async (e) => {
    e.preventDefault(); busy(f, true); $('.kw-err', el).textContent = '';
    try {
      const r = await rpc(mode === 'login' ? 'kw_login' : 'kw_signup', { p_username: f.u.value.trim(), p_password: f.p.value });
      put(SESSION, { token: r.token, name: r.username });
      await refresh(); closeSheet(); if (mode === 'signup') showAccount();
    } catch (er) { $('.kw-err', el).textContent = say(er); busy(f, false); }
  };
  setTimeout(() => f.u.focus(), 50);
}
function showAccount() {
  const linked = me.links?.roomin;
  const el = openSheet(`
    <div class="kw-me"><span class="av big">${esc([...me.username][0].toUpperCase())}</span><div><b>${esc(me.username)}</b><small>KOTETSU WORKS アカウント${me.admin ? '・管理者' : ''}</small></div></div>
    <h3>つないだアプリ</h3>
    <div class="kw-link">
      <img src="study-room/icon-192.png" alt=""><div class="t"><b>ROOMIN</b><small>${linked ? `「${esc(linked)}」とつないでいます` : 'まだつないでいません'}</small></div>
      ${linked ? '<button class="kw-btn ghost sm unlink">はずす</button>' : ''}
    </div>
    ${linked ? '' : `<form class="kw-form link-f">
      <p class="kw-note">ROOMIN のユーザー名とパスワードを入れると、つながります。</p>
      <label>ROOMIN のユーザー名<input name="u" required autocomplete="off"></label>
      <label>ROOMIN のパスワード<input name="p" type="password" required autocomplete="off"></label>
      <p class="kw-err" role="alert"></p>
      <button class="kw-btn" type="submit">ROOMIN とつなぐ</button></form>`}
    ${me.admin ? `<h3>アプリを渡す（管理者）</h3><form class="kw-form grant-f">
      <label>KOTETSU WORKS のユーザー名<input name="u" required autocomplete="off"></label>
      <label>アプリ<select name="a"><option value="test-study">テスト勉強</option><option value="class-reminder">授業リマインダー</option><option value="alarm">目覚まし管理</option></select></label>
      <p class="kw-err" role="alert"></p>
      <div class="kw-row"><button class="kw-btn" type="submit" data-on="1">渡す</button><button class="kw-btn ghost" type="submit" data-on="0">取り上げる</button></div></form>` : ''}
    <button class="kw-btn ghost out">ログアウト</button>`);
  const s = session();
  $('.unlink', el)?.addEventListener('click', async () => { try { await rpc('kw_unlink', { p_token: s.token, p_app: 'roomin' }); await refresh(); showAccount(); } catch (er) { alert(say(er)); } });
  const lf = $('.link-f', el);
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault(); busy(lf, true); $('.kw-err', lf).textContent = '';
    try { const r = await rpc('kw_link_roomin', { p_token: s.token, p_username: lf.u.value.trim(), p_password: lf.p.value }); putRoomin(r); await refresh(); showAccount(); }
    catch (er) { $('.kw-err', lf).textContent = say(er); busy(lf, false); }
  };
  const gf = $('.grant-f', el);
  if (gf) gf.onsubmit = async (e) => {
    e.preventDefault(); const on = e.submitter?.dataset.on === '1'; $('.kw-err', gf).textContent = '';
    try { await rpc('kw_admin_grant', { p_token: s.token, p_username: gf.u.value.trim(), p_app: gf.a.value, p_on: on }); await refresh(); $('.kw-err', gf).textContent = on ? '渡しました' : '取り上げました'; }
    catch (er) { $('.kw-err', gf).textContent = say(er); }
  };
  $('.out', el).onclick = async () => { rpc('kw_logout', { p_token: s.token }).catch(() => {}); put(SESSION, null); me = null; closeSheet(); drawButton(); layout(); };
}

async function refresh() {
  const s = session();
  if (!s) { me = null; } else {
    try { me = await rpc('kw_me', { p_token: s.token }); }
    catch (e) { if (e.code === 'bad_token') { put(SESSION, null); me = null; } else me = me || { username: s.name, admin: false, apps: [], private: [], links: {}, offline: true }; }
  }
  drawButton(); layout();
}
document.querySelectorAll('.grid a.app[data-id]').forEach(a => a.setAttribute('data-static', ''));
$('.acct').addEventListener('click', () => (me ? showAccount() : showLogin()));
bindApps();
refresh();
window.__kw = { refresh, get me() { return me; } };
