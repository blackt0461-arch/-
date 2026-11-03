// 画面の流れ：ログイン → 科目えらび → 部屋（ホーム）→ 問題 → 結果 → 部屋
import { Room3D } from './room3d.js';
import { ROOMS, SPECIALS, kindsOf, orderOf, variantsOf } from './catalog.js';
import { validProblems, SYMBOLS } from './problems.js';
import * as S from './store.js';
import * as Auth from './auth.js';

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
        <p class="note">いまは、この端末の中だけに保存されます。</p>
      </div>
    </div>`);
  app.append(el);
  el.querySelector('.swap').onclick = () => showLogin(mode === 'login' ? 'signup' : 'login');
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = el.querySelector('.err');
    err.textContent = '';
    try {
      const id = mode === 'login' ? await Auth.logIn(f.name.value, f.pw.value) : await Auth.signUp(f.name.value, f.pw.value);
      startAs(Auth.currentUser() || { id, name: f.name.value });
    } catch (ex) { err.textContent = ex.message; vibrate(80); }
  };
}

function startAs(u) {
  user = u;
  S.useUser(u.id);
  showSubjects();
}

// =========================== 科目えらび ===========================
function showSubjects() {
  room3d?.setActive(false);
  canvas.classList.add('dim');
  const streak = S.currentStreak();
  app.innerHTML = '';
  const el = h(`
    <div class="screen subjects">
      <header class="bar">
        <div class="who">👤 ${esc(user.name)}</div>
        <div class="streak ${S.playedToday() ? 'on' : ''}">🔥 ${streak}日</div>
      </header>
      <h2>どの家に行く？</h2>
      <div class="grid"></div>
      <button class="link logout">ログアウト</button>
    </div>`);
  const grid = el.querySelector('.grid');
  for (const s of SUBJECTS) {
    const st = s.ready ? S.subject(s.id) : null;
    const done = st ? st.rooms.reduce((n, r) => n + Object.keys(r.items).length, 0) : 0;
    const b = h(`<button class="subject ${s.ready ? '' : 'soon'}">
      <span class="ic">${s.icon}</span><span class="nm">${s.name}</span>
      <span class="meta">${s.ready ? (done ? `家具 ${done}こ` : 'はじめる') : '準備中'}</span></button>`);
    if (s.ready) b.onclick = () => { subjectId = s.id; enterHouse(); };
    grid.append(b);
  }
  el.querySelector('.logout').onclick = () => { Auth.logOut(); showLogin(); };
  app.append(el);
}

// =========================== 部屋（ホーム） ===========================
function ensureRoom() {
  const st = sub();
  if (!st.rooms.length) {
    st.rooms.push({ id: ROOMS[0].id, dir: null, items: {}, specials: [] });
    st.current = 0;
    st.gauge = S.gaugeMax(st); // 最初の1つはプレゼント
    S.save();
  }
  return st;
}
function curRoom() { const st = sub(); return st.rooms[st.current]; }
function curDef() { return ROOMS.find(r => r.id === curRoom().id); }

async function enterHouse() {
  ensureRoom();
  if (!room3d) room3d = new Room3D(canvas);
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

function showHome() {
  room3d?.setActive(true);
  canvas.classList.remove('dim');
  const st = sub();
  const r = curRoom(), def = curDef();
  const max = S.gaugeMax(st);
  const full = st.gauge >= max;
  const stats = S.stats(st, PROBLEMS);
  const left = remainingKinds();
  const total = r.dir ? orderOf(def, r.dir).length : 0;
  const placed = total - left.length;
  const need = Math.max(1, Math.ceil((max - st.gauge) / 26));
  const resume = st.session && st.session.idx < st.session.set.length;
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <header class="hud">
        <button class="icon back" aria-label="科目えらびへ">‹</button>
        <div class="room-name">${def.icon} ${def.name}${r.dir ? `・${esc(def.directions.find(d => d.id === r.dir).name)}` : ''}
          <small>${r.dir ? `家具 ${placed} / ${total}` : ''}</small></div>
        <div class="streak ${S.playedToday() ? 'on' : ''}">🔥 ${S.currentStreak()}</div>
      </header>
      ${st.rooms.length > 1 ? `<nav class="rooms">${st.rooms.map((rr, i) => {
        const d = ROOMS.find(x => x.id === rr.id);
        return `<button data-i="${i}" class="${i === st.current ? 'on' : ''}">${d.icon} ${d.name}</button>`;
      }).join('')}</nav>` : ''}
      <div class="hint">指でなぞって、部屋を見回せます</div>
      <footer class="dock">
        <div class="gauge ${full ? 'full' : ''}">
          <div class="fill" style="width:${Math.min(100, st.gauge / max * 100)}%"></div>
          <span>${full ? '満タン！ 家具を選べます' : `次の家具まで あと${need}問くらい`}</span>
        </div>
        ${full && left.length ? `<button class="btn gold big unlock">🎁 家具を選ぶ</button>` : ''}
        <button class="btn primary big play">${resume ? '▶ 続きから解く' : '✏️ 問題を解く'}
          <small>${!S.playedToday() && !resume ? '☀️ 今日のはじめのセットはゲージ1.5倍' : stats.due ? `復習 ${stats.due}問あり` : '1セット5問'}</small></button>
        <div class="row">
          <button class="btn ghost edit">🎨 模様がえ</button>
          <button class="btn ghost list">📋 問題と記録</button>
        </div>
        <div class="mini">復習待ち ${stats.waiting} ・ 克服 ${stats.mastered} ・ 問題 ${stats.total}</div>
        ${TEST_MODE && left.length && !full ? '<button class="link testfill">🧪 テスト用：ゲージを満タンにする</button>' : ''}
      </footer>
    </div>`);
  el.querySelector('.back').onclick = showSubjects;
  el.querySelector('.play').onclick = () => startSet();
  el.querySelector('.edit').onclick = showEdit;
  el.querySelector('.list').onclick = showList;
  el.querySelector('.unlock')?.addEventListener('click', () => unlockFlow());
  el.querySelector('.testfill')?.addEventListener('click', () => { st.gauge = max; S.save(); showHome(); });
  el.querySelectorAll('.rooms button').forEach(b => b.onclick = async () => {
    st.current = +b.dataset.i; S.save();
    showHome();
    await room3d.show(curDef(), curRoom());
    if (!curRoom().dir) askDirection();
  });
  app.append(el);
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
      st.gauge = Math.max(0, st.gauge - S.gaugeMax(st));
      st.unlocks++;
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
  const have = st.rooms.some(r => next && r.id === next.id);
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
      st.rooms.push({ id: next.id, dir: null, items: {}, specials: [] });
      st.current = st.rooms.length - 1;
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
  while (st.pendingSpecials > 0) {
    const r = st.rooms.find(rr => (rr.specials || []).length < ROOMS.find(x => x.id === rr.id).specialSlots.length);
    if (!r) break;
    r.specials = r.specials || [];
    const si = st.specialsGiven++;
    r.specials.push(si);
    st.pendingSpecials--;
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
    <div class="screen list">
      <header class="bar"><button class="icon back">‹</button><h2>問題と記録</h2><span></span></header>
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
  el.querySelector('.back').onclick = showHome;
  app.append(el);
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
      st.gauge += pts;
      ss.gained += pts;
      ({ mastered } = S.recordResult(st, p.id, perfect, isReview));
      if (mastered) st.pendingSpecials++;
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
  const max = S.gaugeMax(st);
  st.session = null;
  S.save();
  app.innerHTML = '';
  const el = h(`
    <div class="screen center">
      <div class="card done">
        <h2>おつかれさま！</h2>
        <div class="score"><b>${perfect}</b> / ${ss.results.length} 問 ノーミス</div>
        <div class="gauge big ${st.gauge >= max ? 'full' : ''}"><div class="fill" style="width:${Math.min(100, st.gauge / max * 100)}%"></div>
          <span>ゲージ +${ss.gained}</span></div>
        ${st.gauge >= max ? '<p class="gold-t">🎁 家具が選べます！</p>' : ''}
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
const u = Auth.currentUser();
if (u) startAs(u); else showLogin();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// テスト用
window.__app = { get room3d() { return room3d; }, S, sub };
