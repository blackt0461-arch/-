// 画面の流れ：ログイン → 科目えらび → 部屋（ホーム）→ 問題 → 結果 → 部屋
import { Room3D } from './room3d.js';
import { ROOMS, SPECIALS, kindsOf, orderOf, variantsOf } from './catalog.js';
import { validProblems, SYMBOLS } from './problems.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import * as DL from './download.js';
import * as Sync from './sync.js';

const SUBJECTS = [
  { id: 'physics', name: '物理', icon: '🧲', ready: true },
  { id: 'math2b', name: '数学II・B', icon: '📐' },
  { id: 'english', name: '英語コミュ', icon: '💬' },
  { id: 'logic-en', name: '論理表現', icon: '✍️' },
  { id: 'chem', name: '化学', icon: '⚗️' },
  { id: 'jp', name: '論理国語', icon: '📘' },
  { id: 'classic', name: '古典探究', icon: '📜' },
  { id: 'geo', name: '地理総合', icon: '🗺️' },
];
const PROBLEMS = validProblems();
// テスト用：問題を解かなくても家具を選べるボタンを出す（妹さんに渡すときは false にする）
const TEST_MODE = true;
const byId = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));
const COLORS = ['#ff8a5b', '#4fc3f7', '#c792ea', '#9ccc65', '#ffd54f', '#f06292', '#4db6ac'];

const app = document.getElementById('app');
const canvas = document.getElementById('room');
let room3d = null;
let user = null;
let subjectId = 'physics';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* なし */ } }
function sub() { return S.subject(subjectId); }
const HS = () => S.house();

// =========================== ログイン ===========================
function showLogin(mode = 'login') {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card login">
        <div class="logo">🏠</div>
        <h1>へやづくり勉強</h1>
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
  room3d && (room3d.roomDef = null); // 別の人の家を出しっぱなしにしない
  if (DL.canDownload() && !DL.downloadState()) showDownload(); else enterHouse();
}

// =========================== 下のアイコン列 ===========================
const ICON = {
  room: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 13V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4"/><path d="M3 13h18v4H3z"/><path d="M5 17v3M19 17v3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
function tabbar(active) {
  const st = sub();
  const resume = st.session && st.session.idx < st.session.set.length;
  const due = S.stats(st, PROBLEMS).due;
  const tabs = [['room', '部屋'], ['edit', '模様がえ'], ['play', resume ? '続きから' : '解く'], ['list', '記録'], ['settings', '設定']];
  const el = h(`<nav class="tabbar">${tabs.map(([k, n]) => `
    <button data-t="${k}" class="${k === active ? 'on' : ''} ${k === 'play' ? 'center' : ''}">
      <span class="ti">${ICON[k]}${k === 'play' && (resume || due || !S.playedToday()) ? '<i class="dot"></i>' : ''}</span><span class="tl">${n}</span>
    </button>`).join('')}</nav>`);
  el.querySelectorAll('button').forEach(b => b.onclick = () => goTab(b.dataset.t));
  return el;
}
function goTab(t) {
  if (t === 'room') return showHome();
  if (t === 'edit') { if (!app.querySelector('.home')) showHome(); return showEdit(); }
  if (t === 'play') return chooseSubject();
  if (t === 'list') return showList();
  if (t === 'settings') return showSettings();
}

// 「解く」：科目をえらんで、そのまま1セット
function chooseSubject() {
  if (!app.querySelector('.home')) showHome();
  app.querySelector('.sheet')?.remove();
  const sheet = h(`
    <div class="sheet subjects-sheet">
      <h3>どの科目を解く？</h3>
      <p>どの科目を解いても、同じ家が育ちます</p>
      <div class="grid"></div>
      <button class="link close">とじる</button>
    </div>`);
  const grid = sheet.querySelector('.grid');
  for (const s of SUBJECTS) {
    const st = s.ready ? S.subject(s.id) : null;
    const resume = st && st.session && st.session.idx < st.session.set.length;
    const stats = st ? S.stats(st, PROBLEMS) : null;
    const meta = !s.ready ? '準備中' : resume ? '▶ 続きから' : stats.due ? `復習 ${stats.due}問` : (!S.playedToday() ? '☀️ ゲージ1.5倍' : '1セット5問');
    const b = h(`<button class="subject ${s.ready ? '' : 'soon'}"><span class="ic">${s.icon}</span><span class="nm">${s.name}</span><span class="meta">${meta}</span></button>`);
    if (s.ready) b.onclick = () => { subjectId = s.id; sheet.remove(); startSet(); };
    grid.append(b);
  }
  sheet.querySelector('.close').onclick = () => sheet.remove();
  app.append(sheet);
}

// =========================== 設定 ===========================
function showSettings() {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  app.innerHTML = '';
  let q = 'high';
  try { q = localStorage.getItem('studyroom.quality') || 'high'; } catch (e) { /* なし */ }
  const ver = (() => { try { return localStorage.getItem('studyroom.version') || ''; } catch (e) { return ''; } })();
  const el = h(`
    <div class="screen settings with-tabs">
      <header class="bar"><h2>設定</h2><span></span></header>
      <section class="group">
        <div class="row-item"><span class="lbl">ユーザー</span><span class="val">${esc(user.name)}</span></div>
        <div class="row-item"><span class="lbl">保存</span><span class="val sync"></span></div>
        <div class="row-item"><span class="lbl">連続日数</span><span class="val">🔥 ${S.currentStreak()}日（合計 ${S.getState().streak.total}日）</span></div>
      </section>
      <section class="group">
        <div class="row-item col"><span class="lbl">画質</span>
          <div class="seg">${[['high', 'きれい'], ['mid', 'ふつう'], ['low', 'かるい']].map(([k, n]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${n}</button>`).join('')}</div>
          <small>カクカクするときは「ふつう」か「かるい」に</small></div>
        ${DL.canDownload() ? `<button class="row-item tap dl"><span class="lbl">家具のデータ</span><span class="val">${DL.downloadState() === 'done' ? '保存ずみ' : 'まとめて保存する ›'}</span></button>` : ''}
      </section>
      <section class="group">
        <button class="row-item tap logout"><span class="lbl danger">ログアウト</span></button>
      </section>
      <p class="ver">へやづくり勉強 ${esc(ver)}</p>
    </div>`);
  el.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    try { localStorage.setItem('studyroom.quality', b.dataset.q); } catch (e) { /* なし */ }
    room3d?.setQuality(b.dataset.q);
    el.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('.dl')?.addEventListener('click', () => { if (DL.downloadState() !== 'done') showDownload(); });
  el.querySelector('.logout').onclick = async () => { await Sync.push(); Auth.logOut(); showLogin(); };
  app.append(el, tabbar('settings'));
  paintSync();
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
        <div class="logo">📦</div>
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

// =========================== 更新のお知らせ ===========================
async function checkUpdateNotes() {
  try {
    const v = await (await fetch('version.json', { cache: 'no-store' })).json();
    const seen = localStorage.getItem('studyroom.version');
    localStorage.setItem('studyroom.version', v.version);
    if (!seen || seen === v.version || !v.notes?.length) return;
    const sheet = h(`<div class="sheet news">
      <h3>✨ 新しくなりました</h3>
      <ul>${v.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
      <button class="btn primary big ok">OK</button></div>`);
    app.append(sheet);
    sheet.querySelector('.ok').onclick = () => sheet.remove();
  } catch (e) { /* 読めなければ出さない */ }
}

// =========================== 部屋（ホーム） ===========================
function ensureRoom() {
  const st = sub();
  if (!HS().rooms.length) {
    HS().rooms.push({ id: ROOMS[0].id, dir: null, items: {}, specials: [] });
    HS().current = 0;
    HS().gauge = S.gaugeMax(HS()); // 最初の1つはプレゼント
    S.save();
  }
  return st;
}
function curRoom() { const st = sub(); return HS().rooms[HS().current]; }
function curDef() { return ROOMS.find(r => r.id === curRoom().id); }

async function enterHouse() {
  ensureRoom();
  if (!room3d) room3d = new Room3D(canvas);
  room3d.onDoor = goThroughDoor;
  canvas.classList.remove('dim');
  room3d.setActive(true);
  showHome();
  await room3d.show(curDef(), curRoom());
  placePendingSpecials();
  if (!curRoom().dir) askDirection();
}

function remainingKinds() {
  const r = curRoom(), def = curDef();
  if (!r.dir) return [];
  return orderOf(def, r.dir).filter(k => r.items[k] === undefined);
}

let notesChecked = false;
function showHome() {
  room3d?.setActive(true);
  canvas.classList.remove('dim');
  const r = curRoom(), def = curDef();
  const max = S.gaugeMax(HS());
  const full = HS().gauge >= max;
  const left = remainingKinds();
  const total = r.dir ? orderOf(def, r.dir).length : 0;
  const placed = total - left.length;
  const need = Math.max(1, Math.ceil((max - HS().gauge) / 26));
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <header class="hud">
        <div class="room-name">${def.icon} ${def.name}${r.dir ? `・${esc(def.directions.find(d => d.id === r.dir).name)}` : ''}
          <small>${r.dir ? `家具 ${placed} / ${total}` : ''}</small></div>
        <div class="streak ${S.playedToday() ? 'on' : ''}">🔥 ${S.currentStreak()}</div>
      </header>
      ${HS().rooms.length > 1 ? `<nav class="rooms">${HS().rooms.map((rr, i) => {
        const d = ROOMS.find(x => x.id === rr.id);
        return `<button data-i="${i}" class="${i === HS().current ? 'on' : ''}">${d.icon} ${d.name}</button>`;
      }).join('')}</nav>` : ''}
      <div class="hint">なぞると見回す・床をタップで歩く・ドアで別の部屋へ</div>
      <div class="dock">
        ${full && left.length ? `<button class="btn gold big unlock">🎁 家具を選ぶ</button>` : ''}
        <div class="gauge ${full ? 'full' : ''}">
          <div class="fill" style="width:${Math.min(100, HS().gauge / max * 100)}%"></div>
          <span>${full ? (left.length ? '満タン！ 家具を選べます' : 'この部屋は完成！') : `次の家具まで あと${need}問くらい`}</span>
        </div>
        ${TEST_MODE && left.length && !full ? '<button class="link testfill">🧪 テスト用：ゲージを満タンにする</button>' : ''}
      </div>
    </div>`);
  el.querySelector('.unlock')?.addEventListener('click', () => unlockFlow());
  el.querySelector('.testfill')?.addEventListener('click', () => { HS().gauge = max; S.save(); showHome(); });
  el.querySelectorAll('.rooms button').forEach(b => b.onclick = async () => {
    HS().current = +b.dataset.i; S.save();
    showHome();
    await room3d.show(curDef(), curRoom());
    if (!curRoom().dir) askDirection();
  });
  app.append(el, tabbar('room'));
  if (!notesChecked) { notesChecked = true; checkUpdateNotes(); }
}

// ドアを通って、となりの部屋へ
async function goThroughDoor() {
  const st = sub();
  if (app.querySelector('.sheet')) return;
  if (HS().rooms.length < 2) {
    toast('ドアの向こうは準備中。この部屋を完成させると次の部屋が開きます', 3000);
    return;
  }
  canvas.classList.add('fade');
  await new Promise(r => setTimeout(r, 350));
  HS().current = (HS().current + 1) % HS().rooms.length;
  S.save();
  showHome();
  await room3d.show(curDef(), curRoom());
  canvas.classList.remove('fade');
  if (!curRoom().dir) askDirection();
}

// 新しい部屋の方向性をえらぶ
function askDirection() {
  const def = curDef();
  const sheet = h(`
    <div class="sheet">
      <h3>${def.icon} 新しい部屋：${def.name}</h3>
      <p>${def.question}</p>
      <div class="choices">${def.directions.map((d, i) => `
        <button class="choice" data-i="${i}"><b>${esc(d.name)}</b><span>${esc(d.desc)}</span></button>`).join('')}
      </div>
      <p class="note">あとから変えられません。じっくり選んでください。</p>
    </div>`);
  app.querySelector('.dock')?.classList.add('hide');
  app.querySelector('.tabbar')?.classList.add('hide');
  app.append(sheet);
  sheet.querySelectorAll('.choice').forEach(b => b.onclick = async () => {
    const d = def.directions[+b.dataset.i];
    curRoom().dir = d.id;
    S.save();
    sheet.remove();
    showHome();
    await room3d.show(def, curRoom());
    toast(`${d.name}の${def.name}にしました`);
  });
}

// ===================== 家具の解放（3段階） =====================
function unlockFlow() {
  const r = curRoom(), def = curDef();
  const kinds = kindsOf(def, r.dir);
  const cands = remainingKinds().slice(0, 3);
  app.querySelector('.dock')?.classList.add('hide');
  app.querySelector('.tabbar')?.classList.add('hide');
  const sheet = h(`
    <div class="sheet">
      <h3>🎁 何を増やしますか？</h3>
      <div class="choices">${cands.map(k => `
        <button class="choice kind" data-k="${k}"><span class="ic">${kinds[k].icon}</span><b>${kinds[k].name}</b></button>`).join('')}
      </div>
      <button class="link cancel">あとで</button>
    </div>`);
  app.append(sheet);
  sheet.querySelector('.cancel').onclick = () => { sheet.remove(); showHome(); };
  sheet.querySelectorAll('.kind').forEach(b => b.onclick = () => { sheet.remove(); chooseVariant(b.dataset.k, true); });
}

// 見た目を3つから選ぶ（選ぶとその場で部屋に置いて見せる）
function chooseVariant(kindId, isUnlock) {
  const r = curRoom(), def = curDef();
  const kind = kindsOf(def, r.dir)[kindId];
  const vs = variantsOf(kind, r.dir);
  const before = r.items[kindId];
  let picked = null;
  app.querySelector('.dock')?.classList.add('hide');
  app.querySelector('.tabbar')?.classList.add('hide');
  const sheet = h(`
    <div class="sheet low">
      <h3>${kind.icon} ${kind.name}：どれにしますか？</h3>
      <div class="choices three">${vs.map((v, i) => `
        <button class="choice var ${i === before ? 'on' : ''}" data-i="${i}"><b>${esc(v.name)}</b></button>`).join('')}
      </div>
      <p class="loading"></p>
      <div class="row">
        <button class="btn ghost cancel">${isUnlock ? 'もどる' : 'やめる'}</button>
        <button class="btn gold ok" disabled>これにする</button>
      </div>
    </div>`);
  app.append(sheet);
  room3d.lookAt(room3d.slotPosition(kindId, kind));
  const loading = sheet.querySelector('.loading');
  sheet.querySelectorAll('.var').forEach(b => b.onclick = async () => {
    picked = +b.dataset.i;
    sheet.querySelectorAll('.var').forEach(x => x.classList.toggle('on', x === b));
    sheet.querySelector('.ok').disabled = false;
    loading.textContent = '読み込み中…';
    const tmp = { ...r, items: { ...r.items, [kindId]: picked } };
    room3d.st = tmp;
    await room3d.placeKind(kindId, kind, picked, true);
    if (picked === +b.dataset.i) loading.textContent = '';
    room3d.lookAt(room3d.slotPosition(kindId, kind));
  });
  sheet.querySelector('.cancel').onclick = async () => {
    sheet.remove();
    room3d.st = r;
    await room3d.show(def, r);
    if (isUnlock) unlockFlow(); else showEdit();
  };
  sheet.querySelector('.ok').onclick = async () => {
    if (picked === null) return;
    sheet.remove();
    r.items[kindId] = picked;
    room3d.st = r;
    if (isUnlock) {
      const st = sub();
      HS().gauge = Math.max(0, HS().gauge - S.gaugeMax(HS()));
      HS().unlocks++;
      vibrate([30, 40, 60]);
      toast(`${kind.name}を置きました！`);
      S.save();
      if (!remainingKinds().length) return roomCompleted();
    } else {
      S.save();
      toast('模様がえしました');
    }
    showHome();
  };
}

function roomCompleted() {
  const st = sub(), def = curDef();
  const idx = ROOMS.findIndex(x => x.id === def.id);
  const next = ROOMS[idx + 1];
  const have = HS().rooms.some(r => next && r.id === next.id);
  const sheet = h(`
    <div class="sheet">
      <h3>🎉 ${def.name}が完成しました！</h3>
      <p>${next && !have ? `新しい部屋「${next.icon} ${next.name}」が開きました。` : 'ほかの部屋は準備中です。お楽しみに。'}</p>
      <button class="btn gold big go">${next && !have ? `${next.name}へ行く` : '部屋にもどる'}</button>
    </div>`);
  app.append(sheet);
  sheet.querySelector('.go').onclick = async () => {
    sheet.remove();
    if (next && !have) {
      HS().rooms.push({ id: next.id, dir: null, items: {}, specials: [] });
      HS().current = HS().rooms.length - 1;
      S.save();
      showHome();
      await room3d.show(curDef(), curRoom());
      askDirection();
    } else showHome();
  };
}

// 克服のごほうび（特別な家具）を置く
async function placePendingSpecials() {
  const st = sub();
  while (HS().pendingSpecials > 0) {
    const r = HS().rooms.find(rr => (rr.specials || []).length < ROOMS.find(x => x.id === rr.id).specialSlots.length);
    if (!r) break;
    r.specials = r.specials || [];
    const si = HS().specialsGiven++;
    r.specials.push(si);
    HS().pendingSpecials--;
    S.save();
    if (r === curRoom()) {
      await room3d.placeSpecial(si, r.specials.length - 1, true);
      room3d.lookAt(room3d.specialPosition(r.specials.length - 1));
    }
    toast(`🏆 特別な家具「${SPECIALS[si % SPECIALS.length].name}」が届きました！`, 3200);
  }
}

// 模様がえ（解放した物の見た目を変える）
function showEdit() {
  const r = curRoom(), def = curDef();
  if (!r.dir) return askDirection();
  const kinds = kindsOf(def, r.dir);
  const have = orderOf(def, r.dir).filter(k => r.items[k] !== undefined);
  app.querySelector('.dock')?.classList.add('hide');
  app.querySelector('.tabbar')?.classList.add('hide');
  const sheet = h(`
    <div class="sheet">
      <h3>🎨 模様がえ</h3>
      ${have.length ? `<div class="choices grid3">${have.map(k => `
        <button class="choice kind" data-k="${k}"><span class="ic">${kinds[k].icon}</span><b>${kinds[k].name}</b></button>`).join('')}</div>`
        : '<p>まだ家具がありません。問題を解いてゲージをためましょう。</p>'}
      <button class="link close">とじる</button>
    </div>`);
  app.append(sheet);
  sheet.querySelector('.close').onclick = () => { sheet.remove(); showHome(); };
  sheet.querySelectorAll('.kind').forEach(b => b.onclick = () => { sheet.remove(); chooseVariant(b.dataset.k, false); });
}

// =========================== 問題一覧 ===========================
function showList() {
  room3d.setActive(false);
  canvas.classList.add('dim');
  const st = sub();
  const today = S.dayKey();
  app.innerHTML = '';
  const el = h(`
    <div class="screen list with-tabs">
      <header class="bar"><h2>記録</h2><span class="streak on">🔥 ${S.currentStreak()}日</span></header>
      <div class="stats"></div>
      <ul class="plist"></ul>
    </div>`);
  const s = S.stats(st, PROBLEMS);
  el.querySelector('.stats').innerHTML = `
    <div><b>${S.currentStreak()}</b><span>連続日数</span></div>
    <div><b>${s.waiting}</b><span>復習待ち</span></div>
    <div><b>${s.mastered}</b><span>克服</span></div>
    <div><b>${s.seen}/${s.total}</b><span>解いた</span></div>`;
  const ul = el.querySelector('.plist');
  for (const p of PROBLEMS) {
    const r = st.srs[p.id];
    let badge = '<i class="b new">まだ</i>';
    if (r?.mastered) badge = '<i class="b ok">克服</i>';
    else if (r?.due) badge = `<i class="b due">${r.due <= today ? '今日復習' : '復習 ' + r.due.slice(5).replace('-', '/')}</i>`;
    else if (r?.seen) badge = '<i class="b done">正解</i>';
    ul.append(h(`<li><span class="unit">${p.unit}</span><span class="tx">${esc(p.text)}</span>${badge}
      ${p.verified ? '' : '<i class="b warn">未確認</i>'}</li>`));
  }
  app.append(el, tabbar('list'));
}

// =========================== 問題を解く ===========================
function startSet() {
  const st = sub();
  if (!(st.session && st.session.idx < st.session.set.length)) {
    st.session = { set: S.buildSet(st, PROBLEMS), idx: 0, results: [], gained: 0, startedAt: Date.now(), bonus: !S.playedToday() };
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
        <button class="icon back" aria-label="部屋にもどる">‹</button>
        <div class="dots">${ss.set.map((_, i) => `<i class="${i < ss.idx ? 'done' : i === ss.idx ? 'now' : ''}"></i>`).join('')}</div>
        <span class="tag">${isReview ? '🔁 復習' : p.unit}${retry ? '・確認' : ''}</span>
      </header>
      ${retry ? `<div class="hintbox">正しい公式：<span class="fx">${colorFormula(p.formula.expr, colors)}</span>　同じ色の部分が、問題文のどこにあたるか見ながら解いてください。</div>` : ''}
      ${p.verified ? '' : '<div class="warnbox">⚠ この問題は答えが未確認です。先生や友達に確認してみてください。</div>'}
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
    let pts = 0, mastered = false;
    if (!retry) {
      pts = S.gaugePoints(perfect, ok && step1Miss, secs);
      if (ss.bonus) pts = Math.round(pts * 1.5);
      HS().gauge += pts;
      ss.gained += pts;
      ({ mastered } = S.recordResult(st, p.id, perfect, isReview));
      if (mastered) HS().pendingSpecials++;
      ss.results.push({ id: p.id, perfect, ok, mastered });
      const first = S.markPlayedToday();
      if (first) toast(`🔥 連続 ${S.currentStreak()}日目！`);
      S.save();
    }
    renderText(!ok || retry);
    const fx = colorFormula(p.formula.expr, colors);
    if (ok) {
      vibrate(perfect ? [20, 30, 20] : 20);
      stepEl.innerHTML = `
        <div class="res ok">
          <div class="ttl">${retry ? '確認できました' : perfect ? '正解！' : '正解（文字は1回まちがい）'}</div>
          ${!retry ? `<div class="pts">+${pts} <small>${perfect && secs <= 20 ? '⚡ 早い！ボーナス ' : ''}${ss.bonus && pts ? '☀️ 今日のはじめのセット ×1.5' : ''}</small></div>` : ''}
          ${mastered ? '<div class="master">🏆 克服しました！ 特別な家具がもらえます</div>' : ''}
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
  st.session = null;
  S.save();
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card done">
        <h2>おつかれさま！</h2>
        <div class="score"><b>${perfect}</b> / ${ss.results.length} 問 ノーミス</div>
        <div class="gauge big ${HS().gauge >= max ? 'full' : ''}"><div class="fill" style="width:${Math.min(100, HS().gauge / max * 100)}%"></div>
          <span>ゲージ +${ss.gained}</span></div>
        ${HS().gauge >= max ? '<p class="gold-t">🎁 家具が選べます！</p>' : ''}
        ${masters ? `<p class="gold-t">🏆 克服 ${masters}問！ 特別な家具が届きます</p>` : ''}
        <p class="streak-t">🔥 連続 ${S.currentStreak()}日</p>
        <button class="btn primary big home">部屋にもどる</button>
        <button class="btn ghost more">もう1セット</button>
      </div>
    </div>`);
  el.querySelector('.home').onclick = async () => { showHome(); await placePendingSpecials(); };
  el.querySelector('.more').onclick = () => startSet();
  app.append(el);
}

// =========================== はじまり ===========================
let syncState = 'saved';
const SYNC_LABEL = { saved: '☁️ 保存ずみ', pending: '☁️ 保存中…', offline: '⚠️ オフライン（あとで保存）' };
function paintSync() { document.querySelectorAll('.sync').forEach(e => { e.textContent = SYNC_LABEL[syncState] || ''; e.dataset.s = syncState; }); }
Sync.setHandlers({
  onStatus: (s) => { syncState = s; paintSync(); },
  onExpired: () => { Auth.logOut(); toast('ログインが切れました。もう一度ログインしてください', 3500); showLogin(); },
});
new MutationObserver(paintSync).observe(app, { childList: true, subtree: false });

(async () => {
  const u = Auth.currentUser();
  if (!u) return showLogin();
  // 前に使っていた端末内の記録をすぐ出しつつ、ネットの新しい記録を取りにいく（最大3秒待つ）
  S.useUser(u.id);
  await Promise.race([Sync.pull(), new Promise(r => setTimeout(r, 3000))]);
  startAs(u);
  // 3秒で間に合わなかったときは、届いたら家に反映する
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// テスト用
window.__app = { get room3d() { return room3d; }, S, sub };
