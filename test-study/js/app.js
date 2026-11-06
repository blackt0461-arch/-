// テスト勉強アプリ。授業 → テスト → 勉強（今日の勉強・ぜんぶ・カード・小テスト・記述・まちがい・⭐・模擬テスト）
// 問題は data/ の JSON（Claude がレジュメから作る）。記録は端末（localStorage・IndexedDB）とドライブ（cloud.js）。
import * as store from './store.js';
import * as cloud from './cloud.js';

const APP_VERSION = '1.7.0';
const $app = document.getElementById('app');
let COURSES = [];
const testCache = {};

// ---------- 小さな道具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (x) => Math.round(x * 100);
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } };
// 数式（KaTeX）は、はじめに必要になったときに読みこむ。読みこみ中に来た画面は、読めたらまとめて表示しなおす
const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
let katexP = null;
const pendingMath = new Set();
function loadKatex() {
  if (!katexP) {
    katexP = new Promise((res) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = KATEX + 'katex.min.css'; document.head.appendChild(css);
      const add = (src, next) => { const sc = document.createElement('script'); sc.src = src; sc.onload = next; sc.onerror = () => res(false); document.head.appendChild(sc); };
      add(KATEX + 'katex.min.js', () => add(KATEX + 'contrib/auto-render.min.js', () => res(true)));
    }).then((ok) => { if (ok) { pendingMath.forEach((el) => el.isConnected && math(el)); } pendingMath.clear(); });
  }
  return katexP;
}
function math(el) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
      });
    } catch (e) { /* 数式が読めなくても文字のまま出す */ }
  } else if (el.textContent.includes('$')) {
    pendingMath.add(el);
    loadKatex();
  }
}

// 線のアイコン
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-3-6 0 4-5 6-5 12 0 4 4 7 9 7z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  tri: '<path d="M12 4l9 16H3z"/>',
  star: '<path d="M12 3l2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.2-.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sheet: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  cards: '<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 4h12a2 2 0 012 2v11"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>',
  mix: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  redo: '<path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  home: '<path d="M3 11l9-8 9 8v10H3z"/><path d="M9 21v-7h6v7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  brain: '<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V4a3 3 0 00-3 0zM15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 0"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

// 円のメーター
let ringId = 0;
function ring(v, { big = false, label = '', color } = {}) {
  const id = 'rg' + ++ringId, r = 42, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, v));
  const stops = color === 'ok' ? ['#10b981', '#3dd6a3'] : color === 'ng' ? ['#ef4444', '#f59e0b'] : ['#5b5cf0', '#a78bfa'];
  return `<div class="ring ${big ? 'big' : ''}"><svg viewBox="0 0 100 100"><defs><linearGradient id="${id}"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--soft)" stroke-width="9"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="url(#${id})" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>
    <div class="v"><div><b>${pct(p)}<span style="font-size:.5em">%</span></b>${label ? `<small>${label}</small>` : ''}</div></div></div>`;
}

// 画面の入れ物。hero：グラデーションの見出し、tab：下のタブ、dock：下に固定するボタン
function screen(title, { back, hero, tab, side } = {}) {
  $app.innerHTML = `
    ${hero ? '' : `<div class="bar">${back ? `<button class="back" data-back aria-label="もどる">${icon('back')}</button>` : ''}<h1>${esc(title)}</h1>${side ? `<span class="side">${side}</span>` : ''}</div>`}
    ${hero ? `${back ? `<div class="bar clear"><button class="back" data-back aria-label="もどる">${icon('back')}</button><h1></h1></div>` : ''}<div class="hero ${back ? 'sub' : ''}"><div class="in">${hero}</div></div>` : ''}
    <div class="wrap"></div>
    ${tab ? `<nav class="tabbar"><button class="${tab === 'home' ? 'on' : ''}" data-tab="home">${icon('home')}ホーム</button><button class="${tab === 'stats' ? 'on' : ''}" data-tab="stats">${icon('chart')}記録</button></nav>` : ''}`;
  if (back) $app.querySelector('[data-back]').onclick = back;
  $app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => (b.dataset.tab === 'home' ? home() : stats())));
  window.scrollTo(0, 0);
  math($app);
  return $app.querySelector('.wrap');
}
function dock(html) {
  const d = document.createElement('div');
  d.className = 'dock'; d.innerHTML = `<div class="in">${html}</div>`;
  $app.appendChild(d);
  return d;
}
// データは端末にもとっておき、2回目からはそれですぐ画面を出す（新しいデータは裏で確かめる）
const JKEY = 'ts_json:';
function cachedJSON(path) {
  try { const t = localStorage.getItem(JKEY + path); return t ? JSON.parse(t) : null; } catch (e) { return null; }
}
const freshPaths = new Set(); // この起動ですでにネットから読んだもの
async function getJSON(path) {
  freshPaths.add(path);
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(path);
  const text = await r.text();
  let old = null;
  try { old = localStorage.getItem(JKEY + path); localStorage.setItem(JKEY + path, text); } catch (e) { /* いっぱいでも動く */ }
  return { data: JSON.parse(text), changed: old !== text };
}
function prepTest(key, d) {
  d.questions = (d.questions || []).map((q) => ({ ...q, key: key + '/' + q.id }));
  return d;
}
async function loadTest(course, test) {
  const key = course.id + '/' + test.id;
  if (!testCache[key]) {
    const path = `data/${course.id}/${test.id}.json`;
    const c = cachedJSON(path);
    testCache[key] = prepTest(key, c || (await getJSON(path)).data);
  }
  return testCache[key];
}
// 裏で新しいデータを確かめる。変わっていたら入れかえて、ホームなら表示しなおす
async function refreshData() {
  let changed = false;
  try {
    const cs = freshPaths.has('data/courses.json') ? { changed: false } : await getJSON('data/courses.json');
    if (cs.changed) { COURSES = cs.data.courses || []; changed = true; }
    for (const c of COURSES) for (const t of c.tests || []) {
      const key = c.id + '/' + t.id;
      try {
        const path = `data/${c.id}/${t.id}.json`;
        if (freshPaths.has(path)) continue;
        const r = await getJSON(path);
        if (r.changed || !testCache[key]) { testCache[key] = prepTest(key, r.data); changed = true; }
      } catch (e) { /* 問題がまだない */ }
    }
  } catch (e) { /* 電波がないときは、とってあるデータのまま */ }
  if (changed && onHome()) home();
}
const onHome = () => !!$app.querySelector('.tabbar [data-tab="home"].on') && !document.querySelector('.dock');

async function allTests() {
  const out = [];
  for (const c of COURSES) for (const t of c.tests || []) {
    try { out.push({ c, t, d: await loadTest(c, t) }); } catch (e) { /* 問題がまだない */ }
  }
  return out;
}
function daysLeft(date) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00'); const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const courseColor = (c) => COLORS[Math.max(0, COURSES.indexOf(c)) % COLORS.length];

// ---------- 勉強計画（memory.js の記憶モデルを使う） ----------
// ・まだ解いていない問題は、テスト前日までの日数で割って毎日少しずつ「新しい問題」として出す（授業の回の順）。
// ・解いた問題は、思い出せる確率が 90% を下回ったら「復習」として出す（忘れかけたころに復習＝間隔反復）。
// ・前日は、テストの日に 90% を下回りそうな問題を総復習。当日は忘れかけている問題だけ見直し。
const tkey = (c, t) => c.id + '/' + t.id;
const testDate = (c, t) => store.getDate(tkey(c, t)) || t.date;
const examTime = (c, t) => { const s = testDate(c, t); return s ? new Date(s + 'T09:00:00').getTime() : null; };
function memStats(qs, at) {
  const now = Date.now();
  let sumNow = 0, sumEx = 0, safe = 0;
  for (const q of qs) {
    sumNow += store.recall(q.key, now);
    const e = store.recall(q.key, at || now); sumEx += e; if (e >= 0.9) safe++;
  }
  const n = Math.max(1, qs.length);
  return { now: sumNow / n, exam: sumEx / n, safe };
}
function plan(c, t, d) {
  const dl = daysLeft(testDate(c, t));
  if (dl === null || dl < 0) return null;
  const qs = d.questions;
  const ex = examTime(c, t);
  const byRecall = (a, b) => store.recall(a.key) - store.recall(b.key);
  const unseen = qs.filter((q) => !store.seen(q.key));
  const due = qs.filter((q) => store.seen(q.key) && store.isDue(q.key)).sort(byRecall);
  let phase, pool;
  if (dl === 0) {
    pool = due;
    phase = `テスト当日：忘れかけている ${due.length}問だけ見直し`;
  } else if (dl === 1) {
    pool = [...due, ...qs.filter((q) => store.seen(q.key) && !store.isDue(q.key) && store.recall(q.key, ex) < 0.9).sort(byRecall), ...unseen];
    phase = `テスト前日：忘れていそうな ${pool.length}問を総復習`;
  } else {
    const quota = Math.ceil(unseen.length / (dl - 1));
    const fresh = unseen.slice(0, quota);
    pool = [...due, ...fresh];
    phase = `復習 ${due.length}問 ＋ 新しい問題 ${fresh.length}問`;
  }
  const done = store.todayCount(tkey(c, t));
  const target = store.todayTarget(tkey(c, t), () => pool.length);
  return { dl, total: qs.length, done, target, rest: pool.length ? Math.max(0, target - done) : 0, pool, phase, mem: memStats(qs, ex) };
}
function startToday(c, t, d) {
  const p = plan(c, t, d);
  if (!p || !p.pool.length) { alert('いまやる問題はありません'); return home(); }
  const mode = {
    id: 'today', name: '今日の勉強', back: home, keepOrder: true,
    // 1回は10問ずつ。今日の目標が残っていれば「続ける」を出す
    refill: () => { const n = plan(c, t, d); return n && n.rest > 0 && n.pool.length ? { pool: n.pool, limit: Math.min(10, n.rest), rest: n.rest } : null; },
  };
  startQuiz(c, t, d, p.pool, mode, { limit: Math.min(10, p.rest || 10) });
}
function countLabel(dl) {
  if (dl === 0) return '<div class="count today"><b>当日</b></div>';
  if (dl === 1) return '<div class="count today"><b>明日</b></div>';
  return `<div class="count"><span class="muted">あと</span><b>${dl}</b><span class="muted">日</span></div>`;
}

// 続けて勉強した日数（今日まだなら昨日まで）
function streak() {
  const days = store.dayTotals();
  const d = new Date(); let n = 0;
  if (!days[dateKey(d)]) d.setDate(d.getDate() - 1);
  while (days[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const TYPE_NAME = { choice: '選択', fill: '穴うめ', calc: '計算', card: 'カード', written: '記述・説明' };
// 問題の上に出す「この問題でやること」
const HOWTO = {
  card: '答えを頭の中で思い浮かべてから「答えを見る」→ 覚えていたかを自分で選ぶ',
  choice: '正しいものを1つ選ぶ',
  fill: '（　）に入る言葉を入れる',
  calc: '計算して、答えの数字を入れる（紙で計算してOK）',
  written: '説明を書く（スマホで打つか、紙に書いて写真）→ お手本と見くらべる',
};
const howto = (q, asCard) => `<div class="howto">${icon('quiz')}${esc(q.howto || HOWTO[asCard ? 'card' : q.type] || '')}</div>`;
const figHTML = (c, q) => q.fig ? `<figure class="fig"><img src="data/${c.id}/${q.fig}" alt="図" loading="lazy"></figure>` : '';

// ---------- ホーム ----------
async function home() {
  if (window.__reloadOnHome) { location.reload(); return; }
  const todayN = store.dayTotals()[dateKey(new Date())] || 0;
  const st = streak();
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'おそくまでおつかれさま' : hour < 11 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const w = screen('テスト勉強', {
    tab: 'home',
    hero: `<div class="hello">${hello}</div><h1>テスト勉強</h1>
      <div class="pills"><span class="pill">${icon('flame')}<b>${st}</b>日連続</span><span class="pill">${icon('check')}今日 <b>${todayN}</b>問</span></div>`,
  });
  w.innerHTML = '<div class="loading">読みこんでいます…</div>';
  const todays = [];
  for (const { c, t, d } of await allTests()) { const p = plan(c, t, d); if (p) todays.push({ c, t, d, p }); }
  todays.sort((a, b) => a.p.dl - b.p.dl);
  let html = '';
  todays.forEach(({ c, t, p }, k) => {
    const fin = p.rest === 0;
    html += `<div class="card exam">
      <div class="exam-top">
        <div class="info"><span class="badge">${esc(c.name)}</span><div class="name" style="margin-top:6px">${esc(t.name)}</div>${countLabel(p.dl)}</div>
        ${ring(p.mem.exam, { label: 'テスト日の予想' })}
      </div>
      <div class="phase">${icon('brain')}${esc(p.phase)}</div>
      <div class="today-row"><span class="t">${fin ? (p.target ? '🎉 今日の分はおわり！' : '今日やる問題はありません') : '今日の目標'}</span>
        ${p.target ? `<span class="n"><b>${Math.min(p.done, p.target)}</b> / ${p.target}問</span>` : ''}</div>
      ${p.target ? `<div class="meter ${fin ? 'ok' : ''}"><i style="width:${Math.min(100, (p.done / p.target) * 100)}%"></i></div>` : ''}
      <button class="btn ${fin ? 'sub' : ''}" data-today="${k}">${icon(fin ? 'redo' : 'play')}${fin ? 'もっとやる（10問）' : p.dl === 0 ? '見直しをはじめる' : p.done ? '続きをやる' : '今日の分をはじめる'}</button>
    </div>`;
  });
  const ng = newGrades();
  if (ng.length) {
    const g0 = ng[0];
    html += `<button class="row notice" data-grades="${esc(g0.q)}"><span class="av c1">${icon('spark')}</span><div class="t"><div class="name">Claude の採点が届きました</div><div class="meta">${ng.length}件・タップして見る</div></div><span class="arrow">${icon('next')}</span></button>`;
  }
  html += '<h2>授業</h2>';
  for (const c of COURSES) {
    const next = (c.tests || []).map((t) => ({ t, d: daysLeft(testDate(c, t)) })).filter((x) => x.d !== null && x.d >= 0).sort((a, b) => a.d - b.d)[0];
    html += `<button class="row" data-c="${esc(c.id)}"><span class="av ${courseColor(c)}">${esc(c.name.slice(0, 1))}</span>
      <div class="t"><div class="name">${esc(c.name)}</div><div class="meta">${next ? `${esc(next.t.name)}まで あと${next.d}日` : (c.tests || []).length ? '' : 'まだ問題がありません'}</div></div><span class="arrow">${icon('next')}</span></button>`;
  }
  if (!COURSES.length) html += '<div class="empty">まだ授業がありません</div>';
  html += `<div class="card flat muted small">問題は Claude がドライブのレジュメから作ります。ふやしたいときは Claude に「〇〇の期末の問題を作って」と頼んでください。</div>`;
  const cc = cloud.config();
  html += `<div class="cloud-line">${cc.error ? '⚠️ ドライブに保存できませんでした（電波のよい所で開くと、また保存します）' : cc.last ? '☁️ ドライブに保存：' + new Date(cc.last).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '☁️ ドライブに保存します'}　v${APP_VERSION}</div>`;
  w.innerHTML = html;
  w.querySelectorAll('[data-today]').forEach((b) => (b.onclick = () => {
    const x = todays[+b.dataset.today];
    const p = plan(x.c, x.t, x.d);
    if (p.rest > 0) startToday(x.c, x.t, x.d);
    else startQuiz(x.c, x.t, x.d, x.d.questions, { id: 'more', name: 'もっとやる', back: home }, { limit: 10 });
  }));
  w.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => course(COURSES.find((c) => c.id === b.dataset.c))));
  const gb = w.querySelector('[data-grades]');
  if (gb) gb.onclick = async () => {
    const [cid, tid] = gb.dataset.grades.split('/');
    const c = COURSES.find((x) => x.id === cid); const t = c && (c.tests || []).find((x) => x.id === tid);
    if (c && t) answers(c, t, await loadTest(c, t));
  };
}

// ---------- 授業：テストの一覧 ----------
async function course(c) {
  const tests = c.tests || [];
  if (tests.length === 1) return testMenu(c, tests[0]); // テストが1つなら、すぐテストの画面へ
  const w = screen(c.name, { back: home });
  let html = '<h2>テスト</h2>';
  for (const t of tests) {
    let stat = '';
    try {
      const d = await loadTest(c, t);
      const s = store.summary(d.questions);
      stat = `<div class="meta">${d.questions.length}問・覚えている ${s.mastered}問</div><div class="meter"><i style="width:${(s.mastered / Math.max(1, d.questions.length)) * 100}%"></i></div>`;
    } catch (e) { stat = '<div class="meta">まだ問題がありません</div>'; }
    const dl = daysLeft(testDate(c, t));
    html += `<button class="row" data-t="${esc(t.id)}"><div class="t"><div class="name">${esc(t.name)} ${dl !== null && dl >= 0 ? `<span class="badge ${dl <= 7 ? 'soon' : ''}">あと${dl}日</span>` : ''}</div>${stat}</div><span class="arrow">${icon('next')}</span></button>`;
  }
  if (!tests.length) html += '<div class="empty">まだテストがありません</div>';
  w.innerHTML = html;
  w.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => testMenu(c, tests.find((t) => t.id === b.dataset.t))));
}

// ---------- テスト：勉強のしかたを選ぶ ----------
const MODES = [
  { id: 'all', name: 'ぜんぶ混ぜる', desc: '忘れかけている問題から', ic: 'mix', wide: true, pick: () => true },
  { id: 'card', name: '単語カード', desc: '用語と意味', ic: 'cards', col: 'c2', pick: (q) => q.type === 'card' || q.type === 'fill' },
  { id: 'auto', name: '小テスト', desc: '選択・穴うめ・計算', ic: 'quiz', col: 'c3', pick: (q) => ['choice', 'fill', 'calc'].includes(q.type) },
  { id: 'written', name: '記述・説明', desc: '書いて答え合わせ', ic: 'pen', col: 'c1', pick: (q) => q.type === 'written' },
  { id: 'wrong', name: 'まちがい復習', desc: 'まちがえた問題だけ', ic: 'redo', col: 'c5', pick: (q) => store.isWrong(q.key) },
  { id: 'star', name: 'あとで見る', desc: '⭐をつけた問題', ic: 'star', col: 'c6', pick: (q) => store.starred(q.key) },
  { id: 'mock', name: '模擬テスト', desc: '時間を計って本番練習', ic: 'timer', col: 'c4', pick: (q) => ['choice', 'fill', 'calc'].includes(q.type) },
];
const UI = { count: 10, lectures: null };

async function testMenu(c, t) {
  let d;
  try { d = await loadTest(c, t); } catch (e) { screen(t.name, { back: home }).innerHTML = '<div class="empty">まだ問題がありません</div>'; return; }
  const back = (c.tests || []).length > 1 ? () => course(c) : home;
  const qs = d.questions;
  const lectures = [...new Set(qs.map((q) => q.lecture).filter(Boolean))];
  const sel = new Set(UI.lectures && UI.lectures.key === tkey(c, t) ? UI.lectures.set : lectures);
  const s = store.summary(qs);
  const dl = daysLeft(testDate(c, t));
  const m = memStats(qs, examTime(c, t));
  const w = screen(t.name, {
    back,
    hero: `<span class="pill">${esc(c.name)}</span><h1 style="margin-top:8px">${esc(t.name)}</h1>
      <div class="pills"><span class="pill">${icon('cal')}${dl === null ? '日付なし' : dl < 0 ? 'おわり' : dl === 0 ? '今日' : `あと <b>${dl}</b> 日`}</span>
      <span class="pill">${icon('brain')}いま <b>${pct(m.now)}</b>%</span><span class="pill">${icon('check')}覚えている <b>${s.mastered}</b>/${qs.length}</span></div>`,
  });
  const render = () => {
    const inRange = qs.filter((q) => !q.lecture || sel.has(q.lecture));
    w.innerHTML = `
      <div class="card" style="z-index:2">
        <div style="display:flex;align-items:center;gap:10px"><span class="muted" style="flex:1">テストの日</span><input type="date" class="date-in" data-date value="${esc(testDate(c, t) || '')}"></div>
        ${store.getDate(tkey(c, t)) ? '<button class="link" data-date-reset>もとの日にもどす</button>' : ''}
        ${d.note ? `<div class="muted small" style="margin-top:8px">${esc(d.note)}</div>` : ''}
      </div>
      ${lessonsCard(c, t, d)}
      <h2>勉強のしかた</h2>
      <div class="tiles">${MODES.map((md) => {
        const n = md.id === 'mock' ? Math.min(15, inRange.filter(md.pick).length) : inRange.filter(md.pick).length;
        return `<button class="tile ${md.wide ? 'wide' : ''}" data-m="${md.id}" ${n ? '' : 'disabled'}><span class="ic ${md.col || ''}">${icon(md.ic)}</span>
          <div><b>${md.name}</b><span>${md.id === 'mock' ? `${n}問・${n}分` : md.desc}</span></div><span class="cnt">${md.id === 'mock' ? '' : n + '問'}</span></button>`;
      }).join('')}</div>
      <h2>1回に解く数</h2>
      <div class="seg">${[5, 10, 20, 0].map((n) => `<button class="${UI.count === n ? 'on' : ''}" data-n="${n}">${n ? n + '問' : 'ぜんぶ'}</button>`).join('')}</div>
      ${lectures.length > 1 ? `<h2>範囲</h2><div class="chips">${lectures.map((l) => `<button class="chip ${sel.has(l) ? 'on' : ''}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div>` : ''}
      <h2>道具</h2>
      <div class="tools">
        <button class="tool" data-list>${icon('list')}問題一覧</button>
        <button class="tool" data-sheet ${d.sheet ? '' : 'disabled'}>${icon('sheet')}まとめシート</button>
        <button class="tool" data-answers>${icon('pen')}書いた答え</button>
      </div>
      ${memoryHTML(c, t, qs, lectures)}`;
    math(w);
    w.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
      const md = MODES.find((x) => x.id === b.dataset.m);
      const pool = inRange.filter(md.pick);
      if (md.id === 'mock') mockExam(c, t, d, pool);
      else startQuiz(c, t, d, pool, md);
    }));
    w.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { UI.count = +b.dataset.n; render(); }));
    w.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => {
      const l = b.dataset.l;
      if (sel.has(l)) { if (sel.size > 1) sel.delete(l); } else sel.add(l);
      UI.lectures = { key: tkey(c, t), set: [...sel] }; render();
    }));
    w.querySelector('[data-date]').onchange = (e) => { store.setDate(tkey(c, t), e.target.value); testMenu(c, t); };
    const dr = w.querySelector('[data-date-reset]'); if (dr) dr.onclick = () => { store.setDate(tkey(c, t), null); testMenu(c, t); };
    w.querySelector('[data-sheet]').onclick = () => sheet(c, t, d);
    w.querySelector('[data-answers]').onclick = () => answers(c, t, d);
    w.querySelector('[data-list]').onclick = () => qlist(c, t, d);
    const lb = w.querySelector('[data-lessons]'); if (lb) lb.onclick = () => lessonList(c, t, d);
  };
  render();
}

// 回ごとの「覚えている度」と、しくみの説明
function memoryHTML(c, t, qs, lectures) {
  const rows = (lectures.length ? lectures : ['ぜんぶ']).map((l) => {
    const sub = lectures.length ? qs.filter((q) => q.lecture === l) : qs;
    const m = memStats(sub);
    return `<div class="lrow"><span class="lname">${esc(l)}</span><div class="meter ${m.now >= 0.9 ? 'ok' : ''}"><i style="width:${pct(m.now)}%"></i></div><span class="lpct">${pct(m.now)}%</span></div>`;
  }).join('');
  return `<h2>いま覚えている度（回ごと）</h2><div class="card">${rows}
    <details class="how"><summary>しくみ（記憶曲線）</summary>
      <p>人は覚えたことを時間とともに忘れます（エビングハウスの忘却曲線）。このアプリは問題ごとに「いま思い出せる確率」を計算しています。</p>
      <p>・思い出せる確率が 90% を下回ったころに復習として出します（間隔反復）。忘れかけたころに思い出すほど、記憶は長持ちするようになります。<br>
      ・正解すると忘れにくくなり、まちがえると忘れやすい状態にもどります。何度もまちがえる問題は、短い間隔でくり返し出ます（正解率を使用）。<br>
      ・テストの日の予想は、いまのままテストの日をむかえたときに思い出せる確率の平均です。</p>
    </details></div>`;
}

// 出す順番：忘れかけている問題（思い出せる確率が低い順）→ まだ解いていない問題 → まだ覚えている問題
function order(qs) {
  const score = (q) => {
    if (!store.seen(q.key)) return 0.95;
    const r = store.recall(q.key);
    return store.isDue(q.key) ? r : 1 + r;
  };
  return qs.map((q) => ({ q, s: score(q) + Math.random() * 0.15 })).sort((a, b) => a.s - b.s).map((x) => x.q);
}

function starBtn(q) {
  return `<button class="star ${store.starred(q.key) ? 'on' : ''}" data-star="${esc(q.key)}" aria-label="あとで見る">${icon('star')}</button>`;
}
function bindStars(root) {
  root.querySelectorAll('[data-star]').forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    b.classList.toggle('on', store.toggleStar(b.dataset.star)); buzz(10);
  }));
}
function steps(n, i, results) {
  if (n > 30) return `<div class="meter"><i style="width:${(i / n) * 100}%"></i></div>`;
  return `<div class="steps">${Array.from({ length: n }, (_, k) => `<i class="${results[k] ? results[k].res : k < i ? 'done' : ''}"></i>`).join('')}</div>`;
}

// ---------- 問題を解く ----------
let fixResult = () => {};
function startQuiz(c, t, d, pool, mode, opt = {}) {
  let list = mode.keepOrder ? pool.slice() : order(pool);
  const limit = opt.limit ?? UI.count;
  if (limit) list = list.slice(0, limit);
  const results = [];
  fixResult = (q) => { const r = results.find((x) => x.q === q); if (r) r.res = 'ok'; };
  let i = 0;
  const backToMenu = mode.back || (() => testMenu(c, t));
  const next = () => { i++; if (i < list.length) show(); else finish(); };
  const show = () => {
    const q = list[i];
    const asCard = mode.id === 'card' || q.type === 'card';
    const w = screen(`${mode.name}`, { back: () => { if (!results.length || confirm('とちゅうでやめますか？（ここまでの記録は残ります）')) backToMenu(); } });
    w.innerHTML = `
      <div class="qtop"><span class="p">${i + 1}<small> / ${list.length}</small></span><span class="lec">${esc(q.lecture || '')}</span></div>
      ${steps(list.length, i, results)}
      <div class="card qcard">${starBtn(q)}<span class="qtype">${asCard ? 'カード' : TYPE_NAME[q.type] || ''}</span>${howto(q, asCard)}<div class="qtext">${esc(q.q)}</div>${q.figAfter ? '' : figHTML(c, q)}<div data-body></div></div>
      <div data-after></div>`;
    bindStars(w);
    const body = w.querySelector('[data-body]');
    const after = w.querySelector('[data-after]');
    // res: ok / mid / ng。opt.extra：判定の下に足すもの。opt.quiet：判定と解説を出さない（自分で出したとき）
    const done = (res, o = {}) => {
      store.record(q.key, res, { h: o.h, solved: o.solved });
      results.push({ q, res, h: o.h });
      buzz(res === 'ok' ? 15 : [30, 40, 30]);
      const label = o.label || { ok: '正解！', mid: 'おしい', ng: 'まちがい' }[res];
      const ic = { ok: 'check', mid: 'tri', ng: 'x' }[res];
      const html = o.quiet ? '' : `<div class="verdict ${res}">${icon(ic)}${label}</div>${o.extra || ''}${explainHTML(q)}`;
      after.insertAdjacentHTML('beforeend', html + (q.figAfter ? `<div class="card">${figHTML(c, q)}</div>` : '') + lessonLink(c, t, d, q));
      bindLessonLink(after, c, t, d);
      math(after);
      const dk = dock(`<button class="btn" data-next>${i + 1 < list.length ? '次へ' : '結果を見る'}${icon('next')}</button>`);
      dk.querySelector('[data-next]').onclick = next;
      if (o.onShown) o.onShown();
      setTimeout(() => after.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };
    if (asCard) cardBody(q, body, after, done);
    else if (q.type === 'choice') choiceBody(q, body, done);
    else if (q.type === 'fill') fillBody(q, body, after, done);
    else if (q.type === 'calc') calcBody(q, body, after, done);
    else if (q.type === 'written') writtenBody(q, body, after, done, c, t);
    math(w);
  };
  const finish = () => {
    const ok = results.filter((r) => r.res === 'ok').length;
    const rate = ok / Math.max(1, results.length);
    const w = screen('結果', { back: backToMenu });
    const msg = rate === 1 ? 'ぜんぶ正解！🎉' : rate >= 0.8 ? 'いい調子！' : rate >= 0.5 ? 'あと少し！' : 'くり返せば覚えられる！';
    w.innerHTML = `<div class="card result">${ring(rate, { big: true, label: `${ok} / ${results.length}問`, color: rate >= 0.8 ? 'ok' : rate < 0.5 ? 'ng' : '' })}
        <div class="msg">${msg}</div><div class="muted small" data-sub>まちがえた問題は、忘れかけたころにまた出ます</div>
        <button class="btn" data-again>${icon('redo')}もう一度（同じ形式）</button><button class="btn sub" data-menu>もどる</button></div>
      <h2>ふりかえり</h2><div class="rlist">${results.map((r) => resultRow(r.q, r.res)).join('')}</div>`;
    math(w); bindStars(w);
    const again = w.querySelector('[data-again]');
    w.querySelector('[data-menu]').onclick = backToMenu;
    if (mode.refill) {
      const r = mode.refill();
      if (r) { again.innerHTML = `${icon('play')}続ける（今日あと${r.rest}問）`; again.onclick = () => startQuiz(c, t, d, r.pool, mode, { limit: r.limit }); }
      else { again.hidden = true; w.querySelector('[data-sub]').textContent = '🎉 今日の分はおわりです。おつかれさま！'; }
      return;
    }
    again.onclick = () => startQuiz(c, t, d, mode.id === 'wrong' ? pool.filter((q) => store.isWrong(q.key)) : pool, mode, opt);
    if (mode.id === 'wrong' && !pool.some((q) => store.isWrong(q.key))) again.hidden = true;
  };
  if (!list.length) { alert('この形式の問題がありません'); return backToMenu(); }
  show();
}
function resultRow(q, res, yours) {
  const ic = { ok: 'check', mid: 'tri', ng: 'x' }[res];
  return `<div class="card"><span class="mark ${res}">${icon(ic)}</span><div style="flex:1;min-width:0"><div class="muted small">${esc(q.lecture || '')}</div><div class="qq">${esc(q.q)}</div>
    ${yours !== undefined ? `<div class="ya">あなた：${esc(yours || '（無回答）')}　／　答え：${esc(answerText(q))}</div>` : ''}</div>${starBtn(q).replace('class="star', 'style="position:static;flex:none" class="star')}</div>`;
}

function answerText(q) {
  if (q.type === 'choice') return q.choices[q.answer];
  if (q.type === 'fill') return q.answers[0];
  if (q.type === 'calc') return `${q.answerText || q.answer}${q.unit ? ' ' + q.unit : ''}`;
  if (q.type === 'written') return q.model;
  return q.a;
}
function explainHTML(q) {
  const ans = q.type === 'written' || q.type === 'choice' ? '' : `<span class="label">答え</span>${esc(answerText(q))}`;
  const ex = q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : '';
  if (!ans && !ex) return '';
  return `<div class="card explain">${ans}${ex}</div>`;
}

function cardBody(q, body, after, done) {
  body.innerHTML = `<button class="btn sub" data-show style="margin-top:18px">答えを見る</button>`;
  body.querySelector('[data-show]').onclick = () => {
    body.innerHTML = `<div class="card flat explain" style="margin-top:16px"><span class="label">答え</span>${esc(answerText(q))}${q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : ''}</div>
      <div class="grade two"><button class="g-ok" data-g="ok">覚えた</button><button class="g-ng" data-g="ng">まだ</button></div>`;
    math(body);
    body.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
      body.querySelector('.grade').remove();
      done(b.dataset.g, { quiet: true });
    }));
  };
}

const KEYS = 'ABCDEFG';
function choiceBody(q, body, done) {
  const idx = shuffle(q.choices.map((_, k) => k));
  body.innerHTML = `<div class="choices">${idx.map((k, n) => `<button class="choice" data-k="${k}"><span class="k">${KEYS[n]}</span><span>${esc(q.choices[k])}</span></button>`).join('')}</div>`;
  body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
    const k = +b.dataset.k;
    body.querySelectorAll('[data-k]').forEach((x) => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add('ok'); });
    if (k !== q.answer) b.classList.add('ng');
    done(k === q.answer ? 'ok' : 'ng');
  }));
}

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s　・,，、。.()（）「」]/g, '');
function fillBody(q, body, after, done) {
  body.innerHTML = `<input class="input" data-in placeholder="答えを入れる" autocomplete="off" enterkeyhint="done">
    <button class="btn" data-go>答える</button><button class="btn ghost" data-skip>わからない</button>`;
  const inp = body.querySelector('[data-in]');
  const lock = () => { body.querySelectorAll('button').forEach((b) => (b.hidden = true)); inp.disabled = true; };
  const go = () => {
    const v = norm(inp.value);
    if (!v) return;
    const ok = q.answers.some((a) => norm(a) === v);
    lock();
    done(ok ? 'ok' : 'ng', {
      extra: ok ? '' : `<button class="link" data-fix>じつは合っていた（正解にする）</button>`,
      onShown: () => {
        const fx = after.querySelector('[data-fix]');
        if (fx) fx.onclick = () => { store.fix(q.key); fixResult(q); fx.replaceWith(Object.assign(document.createElement('div'), { className: 'verdict ok', textContent: '正解にしました' })); };
      },
    });
  };
  body.querySelector('[data-go]').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  body.querySelector('[data-skip]').onclick = () => { lock(); done('ng'); };
  setTimeout(() => inp.focus(), 50);
}

// 数字を読む（1.5e3、1/2、2×10^3、√2、π もいちおう読む）
function parseNum(s) {
  s = String(s).normalize('NFKC').replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!s) return NaN;
  if (!/^[0-9+\-*/^().eπ√pi]+$/i.test(s)) return NaN;
  s = s.replace(/π|pi/gi, '(Math.PI)').replace(/√\(?([0-9.]+)\)?/g, 'Math.sqrt($1)').replace(/\^/g, '**');
  try { const v = Function('"use strict";return (' + s + ')')(); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
}
const calcOk = (q, v) => Math.abs(v - q.answer) <= Math.max(Math.abs(q.answer) * (q.tol ?? 0.01), 1e-9);
// ヒントの扱い：自分の力で思い出せなかった分だけ「覚えた」とは数えない
//   ヒントなしで正解 → 正解 ／ ヒント1つで正解 → おしい ／ ヒント2つ以上で正解 → まちがい（表示は「ヒントで解けた」）
function hintResult(ok, h) {
  if (!ok) return { res: 'ng' };
  if (!h) return { res: 'ok' };
  if (h === 1) return { res: 'mid', label: 'ヒント1つで正解（おしい扱い）' };
  return { res: 'ng', label: `ヒント${h}つで解けた（もう一度出ます）` };
}
function calcBody(q, body, after, done) {
  const hints = q.hints || [];
  let h = 0;
  body.innerHTML = `<input class="input num" data-in inputmode="decimal" placeholder="答え（数字）" autocomplete="off">
    ${q.unit ? `<div class="unit">単位：${esc(q.unit)}</div>` : ''}
    <div data-hints></div>
    <button class="btn" data-go>答える</button>
    ${hints.length ? `<button class="btn sub" data-hint>${icon('spark')}ヒントを見る（1/${hints.length}）</button><div class="muted small" data-hnote style="text-align:center;margin-top:6px">ヒントを見て正解すると「おしい」扱いになります</div>` : ''}
    <button class="btn ghost" data-skip>わからない・解き方を見る</button>`;
  const inp = body.querySelector('[data-in]');
  const lock = () => { body.querySelectorAll('button').forEach((b) => (b.hidden = true)); inp.disabled = true; const hn = body.querySelector('[data-hnote]'); if (hn) hn.hidden = true; };
  const go = () => {
    const v = parseNum(inp.value);
    if (Number.isNaN(v)) { alert('数字で入れてください（例：0.5、1/2、2*10^3）'); return; }
    lock();
    const okv = calcOk(q, v);
    const r = hintResult(okv, h);
    done(r.res, { h, label: r.label, solved: okv && h > 0 });
  };
  const hb = body.querySelector('[data-hint]');
  if (hb) hb.onclick = () => {
    const box = body.querySelector('[data-hints]');
    box.insertAdjacentHTML('beforeend', `<div class="hint"><b>ヒント${h + 1}</b>${esc(hints[h])}</div>`);
    math(box);
    h++;
    if (h >= hints.length) hb.hidden = true; else hb.innerHTML = `${icon('spark')}ヒントを見る（${h + 1}/${hints.length}）`;
    buzz(8);
  };
  body.querySelector('[data-go]').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  body.querySelector('[data-skip]').onclick = () => { lock(); done('ng', { h }); };
}

function writtenBody(q, body, after, done, c, t) {
  let photo = null;
  body.innerHTML = `
    <textarea class="input" data-in placeholder="ここに書く（紙に書いて写真でもOK）"></textarea>
    <label class="photo-btn">${icon('camera')}紙に書いた答えを写真で入れる<input type="file" accept="image/*" capture="environment" data-photo hidden></label>
    <img class="photo-prev" data-prev hidden alt="">
    <button class="btn" data-go>答え合わせ</button>`;
  const inp = body.querySelector('[data-in]');
  body.querySelector('[data-photo]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    photo = await store.shrinkImage(f);
    const img = body.querySelector('[data-prev]'); img.src = URL.createObjectURL(photo); img.hidden = false;
  };
  body.querySelector('[data-go]').onclick = () => {
    const text = inp.value.trim();
    inp.disabled = true; body.querySelector('.photo-btn').hidden = true; body.querySelector('[data-go]').hidden = true;
    after.innerHTML = `
      <div class="card explain"><span class="label">お手本</span>${esc(q.model)}
        ${q.points?.length ? `<span class="label">入れるべきポイント（書けたものをタップ）</span><ul class="points">${q.points.map((p, k) => `<li data-p="${k}">${esc(p)}</li>`).join('')}</ul>` : ''}
        ${q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : ''}</div>
      <div class="muted small" style="margin:14px 4px 0">自分でつけてみよう</div>
      <div class="grade"><button class="g-ok" data-g="ok">できた</button><button class="g-mid" data-g="mid">おしい</button><button class="g-ng" data-g="ng">できなかった</button></div>`;
    math(after);
    after.querySelectorAll('[data-p]').forEach((li) => (li.onclick = () => li.classList.toggle('on')));
    after.querySelectorAll('[data-g]').forEach((b) => (b.onclick = async () => {
      const g = b.dataset.g;
      const got = [...after.querySelectorAll('[data-p].on')].map((li) => +li.dataset.p);
      after.querySelector('.grade').remove();
      if (text || photo) await store.saveAnswer({ key: q.key, course: c.name, test: t.name, q: q.q, text, photo, self: g, points: got });
      after.insertAdjacentHTML('beforeend', `<div class="verdict ${g}">${icon({ ok: 'check', mid: 'tri', ng: 'x' }[g])}${{ ok: 'できた', mid: 'おしい', ng: 'できなかった' }[g]}${text || photo ? '<span class="small" style="font-weight:500">（答えを保存しました）</span>' : ''}</div>`);
      done(g, { quiet: true });
    }));
    after.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// ---------- 模擬テスト（時間を計る。答えは最後にまとめて） ----------
function mockExam(c, t, d, pool) {
  const list = shuffle(pool).slice(0, 15);
  if (!list.length) return;
  const limit = list.length * 60 * 1000; // 1問1分
  const start = Date.now();
  const ans = new Array(list.length).fill(null);
  let i = 0, tick = null;
  const quit = () => { clearInterval(tick); testMenu(c, t); };
  const left = () => Math.max(0, limit - (Date.now() - start));
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const show = () => {
    const q = list[i];
    const w = screen('模擬テスト', { back: () => { if (confirm('模擬テストをやめますか？（記録は残りません）')) quit(); } });
    w.innerHTML = `<div class="qtop"><span class="p">${i + 1}<small> / ${list.length}</small></span><span class="timer" data-timer>${fmt(left())}</span></div>
      ${steps(list.length, i, [])}
      <div class="card qcard"><span class="qtype">${TYPE_NAME[q.type]}</span>${howto(q)}<div class="qtext">${esc(q.q)}</div>${q.figAfter ? '' : figHTML(c, q)}<div data-body></div></div>`;
    const body = w.querySelector('[data-body]');
    if (q.type === 'choice') {
      const idx = shuffle(q.choices.map((_, k) => k));
      body.innerHTML = `<div class="choices">${idx.map((k, n) => `<button class="choice ${ans[i] === k ? 'pick' : ''}" data-k="${k}"><span class="k">${KEYS[n]}</span><span>${esc(q.choices[k])}</span></button>`).join('')}</div>`;
      body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        ans[i] = +b.dataset.k;
        body.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('pick', x === b));
        buzz(8);
      }));
    } else {
      body.innerHTML = `<input class="input ${q.type === 'calc' ? 'num' : ''}" data-in ${q.type === 'calc' ? 'inputmode="decimal"' : ''} placeholder="答えを入れる" autocomplete="off" value="${esc(ans[i] ?? '')}">${q.unit ? `<div class="unit">単位：${esc(q.unit)}</div>` : ''}`;
      body.querySelector('[data-in]').oninput = (e) => { ans[i] = e.target.value; };
    }
    math(w);
    const dk = dock(`<div style="display:flex;gap:10px">${i ? '<button class="btn sub" data-prev style="flex:1">もどる</button>' : ''}<button class="btn" data-next style="flex:2">${i + 1 < list.length ? '次へ' : '提出する'}${icon('next')}</button></div>`);
    dk.querySelector('[data-next]').onclick = () => { if (i + 1 < list.length) { i++; show(); } else if (confirm('提出しますか？')) finish(); };
    const pv = dk.querySelector('[data-prev]'); if (pv) pv.onclick = () => { i--; show(); };
  };
  const finish = () => {
    clearInterval(tick);
    const used = Date.now() - start;
    const res = list.map((q, k) => {
      const a = ans[k];
      let ok = false, yours = '';
      if (q.type === 'choice') { ok = a === q.answer; yours = a === null ? '' : q.choices[a]; }
      else if (q.type === 'fill') { ok = !!a && q.answers.some((x) => norm(x) === norm(a)); yours = a || ''; }
      else { const v = parseNum(a ?? ''); ok = !Number.isNaN(v) && calcOk(q, v); yours = a || ''; }
      store.record(q.key, ok ? 'ok' : 'ng');
      return { q, res: ok ? 'ok' : 'ng', yours };
    });
    const ok = res.filter((r) => r.res === 'ok').length;
    const score = Math.round((ok / list.length) * 100);
    const w = screen('模擬テストの結果', { back: () => testMenu(c, t) });
    w.innerHTML = `<div class="card result">${ring(ok / list.length, { big: true, label: `${ok} / ${list.length}問`, color: score >= 80 ? 'ok' : score < 60 ? 'ng' : '' })}
        <div class="msg">${score}点</div><div class="muted small">かかった時間 ${fmt(used)}（制限 ${fmt(limit)}）</div>
        <button class="btn" data-again>${icon('redo')}もう一度（ちがう問題で）</button><button class="btn sub" data-menu>もどる</button></div>
      <h2>答え合わせ</h2><div class="rlist">${res.map((r) => resultRow(r.q, r.res, r.yours)).join('')}</div>`;
    math(w); bindStars(w);
    w.querySelector('[data-again]').onclick = () => mockExam(c, t, d, pool);
    w.querySelector('[data-menu]').onclick = () => testMenu(c, t);
  };
  tick = setInterval(() => {
    const el = document.querySelector('[data-timer]');
    const l = left();
    if (el) { el.textContent = fmt(l); el.classList.toggle('low', l < 60000); }
    if (l <= 0) { clearInterval(tick); alert('時間です！'); finish(); }
  }, 500);
  show();
}

// ---------- 問題一覧（さがす・⭐・覚えている度） ----------
function qlist(c, t, d) {
  const w = screen(`${t.name}・問題一覧`, { back: () => testMenu(c, t) });
  let word = '', filter = 'all';
  const FILTERS = [['all', 'ぜんぶ'], ['star', '⭐'], ['wrong', 'まちがい'], ['weak', '忘れかけ'], ['unseen', 'まだ']];
  w.innerHTML = `<div class="search" style="margin-top:14px">${icon('search')}<input class="input" data-q placeholder="ことばでさがす（例：仮想接地）" autocomplete="off"></div>
    <div class="chips" style="margin-top:12px" data-f>${FILTERS.map(([k, n]) => `<button class="chip ${k === filter ? 'on' : ''}" data-fk="${k}">${n}</button>`).join('')}</div>
    <div class="muted small" style="margin:12px 4px 0" data-n></div><div data-items></div>`;
  const items = w.querySelector('[data-items]');
  const draw = () => {
    const nw = norm(word);
    const hits = d.questions.filter((q) => {
      if (filter === 'star' && !store.starred(q.key)) return false;
      if (filter === 'wrong' && !store.isWrong(q.key)) return false;
      if (filter === 'weak' && !(store.seen(q.key) && store.isDue(q.key))) return false;
      if (filter === 'unseen' && store.seen(q.key)) return false;
      if (!nw) return true;
      return norm([q.q, answerText(q), q.explain, ...(q.choices || [])].join(' ')).includes(nw);
    });
    w.querySelector('[data-n]').textContent = `${hits.length}問`;
    items.innerHTML = hits.slice(0, 200).map((q) => {
      const seen = store.seen(q.key), r = store.recall(q.key);
      return `<details class="card qitem"><summary>${starBtn(q)}<span class="qq">${esc(q.q)}</span><span class="rp ${seen ? (r >= 0.9 ? 'good' : 'bad') : ''}">${seen ? pct(r) + '%' : 'まだ'}</span></summary>
        <div class="body explain">${figHTML(c, q)}<span class="label">${esc(q.lecture || '')}・${TYPE_NAME[q.type]}</span><span class="label">答え</span>${esc(answerText(q))}${q.type === 'written' && q.points ? `<span class="label">ポイント</span>${q.points.map((p) => '・' + esc(p)).join('\n')}` : ''}${q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : ''}</div></details>`;
    }).join('') || '<div class="empty">見つかりませんでした</div>';
    bindStars(items);
    math(items);
  };
  w.querySelector('[data-q]').oninput = (e) => { word = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(draw, 200); };
  w.querySelectorAll('[data-fk]').forEach((b) => (b.onclick = () => {
    filter = b.dataset.fk;
    w.querySelectorAll('[data-fk]').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));
  draw();
}

// ---------- 記録（連続日数・カレンダー・苦手な問題） ----------
async function stats() {
  const days = store.dayTotals();
  const total = Object.values(days).reduce((a, b) => a + b, 0);
  const st = streak();
  const w = screen('記録', {
    tab: 'stats',
    hero: `<div class="hello">がんばりの記録</div><h1>記録</h1><div class="pills"><span class="pill">${icon('flame')}<b>${st}</b>日連続</span><span class="pill">${icon('check')}合計 <b>${total}</b>問</span></div>`,
  });
  const tests = await allTests();
  const all = tests.flatMap((x) => x.d.questions);
  const recs = all.map((q) => store.get(q.key)).filter((r) => r && r.n);
  const n = recs.reduce((a, r) => a + r.n, 0), ok = recs.reduce((a, r) => a + r.ok, 0);
  const remember = all.filter((q) => store.seen(q.key) && !store.isDue(q.key)).length;
  // カレンダー：今日をふくむ週から 15 週さかのぼる
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startD = new Date(today); startD.setDate(startD.getDate() - startD.getDay() - 7 * 14);
  const max = Math.max(1, ...Object.values(days));
  let cells = '';
  for (let k = 0; k < 15 * 7; k++) {
    const dd = new Date(startD); dd.setDate(startD.getDate() + k);
    const v = days[dateKey(dd)] || 0;
    const lv = v === 0 ? '' : v < max * 0.25 ? 'l1' : v < max * 0.5 ? 'l2' : v < max * 0.85 ? 'l3' : 'l4';
    cells += `<i class="${dd > today ? 'future' : lv} ${+dd === +today ? 'today' : ''}" title="${dateKey(dd)}：${v}問"></i>`;
  }
  // 苦手な問題：2回以上解いて、正解率が低い順
  const weak = all.filter((q) => { const r = store.get(q.key); return r && r.n >= 2 && r.ok < r.n; })
    .sort((a, b) => { const ra = store.get(a.key), rb = store.get(b.key); return ra.ok / ra.n - rb.ok / rb.n || rb.n - ra.n; }).slice(0, 10);
  w.innerHTML = `
    <button class="row notice" data-report style="position:relative;z-index:2;margin-top:0"><span class="av c4">${icon('chart')}</span><div class="t"><div class="name">ふりかえりレポート</div><div class="meta">今までの勉強をまとめて見る</div></div><span class="arrow">${icon('next')}</span></button>
    <div class="stats">
      <div class="stat"><b>${n ? pct(ok / n) : 0}<span style="font-size:.5em">%</span></b><span>正解率</span></div>
      <div class="stat"><b>${remember}</b><span>覚えている問題</span></div>
      <div class="stat"><b>${days[dateKey(new Date())] || 0}</b><span>今日の問題</span></div>
    </div>
    <h2>勉強したカレンダー</h2>
    <div class="card"><div class="heat">${cells}</div>
      <div class="legend">少<i style="background:var(--soft)"></i><i class="l1" style="background:color-mix(in srgb,var(--acc) 35%,var(--soft))"></i><i style="background:color-mix(in srgb,var(--acc) 60%,var(--soft))"></i><i style="background:var(--acc)"></i><i style="background:var(--acc2)"></i>多</div></div>
    <h2>テストごと</h2>
    ${tests.map(({ c, t, d }) => { const m = memStats(d.questions, examTime(c, t)); const s = store.summary(d.questions); return `<div class="card" style="display:flex;gap:14px;align-items:center">${ring(m.now, { label: 'いま' })}
      <div style="flex:1;min-width:0"><b>${esc(c.name)}・${esc(t.name)}</b><div class="muted small">覚えている ${s.mastered}・まちがい ${s.wrong}・まだ ${s.unseen}</div>${daysLeft(testDate(c, t)) >= 0 ? `<div class="muted small">テストの日の予想 ${pct(m.exam)}%</div>` : ''}</div></div>`; }).join('')}
    <h2>苦手な問題 トップ10</h2>
    ${weak.length ? `<div class="rlist">${weak.map((q) => { const r = store.get(q.key); return `<div class="card"><span class="mark ng">${icon('x')}</span><div style="flex:1;min-width:0"><div class="muted small">${esc(q.lecture || '')}・正解 ${r.ok}/${r.n}回</div><div class="qq">${esc(q.q)}</div></div>${starBtn(q).replace('class="star', 'style="position:static;flex:none" class="star')}</div>`; }).join('')}</div>
      <button class="btn sub" data-weak>${icon('redo')}苦手な問題をまとめて解く</button>` : '<div class="card flat muted small">2回以上まちがえた問題がここに出ます</div>'}
    <div class="cloud-line">v${APP_VERSION}</div>`;
  math(w); bindStars(w);
  w.querySelector('[data-report]').onclick = report;
  const wb = w.querySelector('[data-weak]');
  if (wb) wb.onclick = () => {
    const { c, t, d } = tests.find((x) => x.d.questions.includes(weak[0]));
    startQuiz(c, t, d, weak.filter((q) => d.questions.includes(q)), { id: 'weak', name: '苦手な問題', back: stats, keepOrder: true }, { limit: 0 });
  };
}

// ---------- ふりかえりレポート（今までの全部） ----------
function bars(rows, { max = 1, fmt = (v) => pct(v) + '%' } = {}) {
  return rows.map((r) => `<div class="lrow"><span class="lname">${esc(r.name)}</span><div class="meter ${r.v >= 0.85 ? 'ok' : ''}"><i style="width:${Math.min(100, (r.v / max) * 100)}%"></i></div><span class="lpct">${fmt(r.v)}</span></div>
    ${r.note ? `<div class="muted small" style="margin:-2px 0 4px 4.6em">${esc(r.note)}</div>` : ''}`).join('');
}
async function report() {
  const w = screen('ふりかえりレポート', { back: stats });
  w.innerHTML = '<div class="loading">まとめています…</div>';
  const tests = await allTests();
  const qmap = {};
  tests.forEach(({ c, t, d }) => d.questions.forEach((q) => (qmap[q.key] = { q, c, t })));
  const ev = store.events().filter((e) => qmap[e.q]);
  if (!ev.length) { w.innerHTML = '<div class="empty">まだ記録がありません。問題を解くと、ここにまとめが出ます。</div>'; return; }
  const okOf = (list) => list.length ? list.filter((e) => e.r === 'ok').length / list.length : 0;
  const days = store.dayTotals();
  const dayList = Object.keys(days).filter((d) => days[d] > 0).sort();
  // いちばん長く続いた日数
  let best = 0, run = 0, prev = null;
  for (const d of dayList) { const cur = new Date(d + 'T00:00:00'); run = prev && (cur - prev) / 86400000 === 1 ? run + 1 : 1; best = Math.max(best, run); prev = cur; }
  const first = new Date(ev[0].at), span = Math.max(1, Math.round((Date.now() - first.setHours(0, 0, 0, 0)) / 86400000) + 1);
  const totalAns = Object.values(days).reduce((a, b) => a + b, 0);
  // 正解率の移り変わり（週ごと。記録が2週間より短いときは日ごと）
  const byDay = span <= 14;
  const bucketOf = (at) => { const d = new Date(at); if (byDay) return `${d.getMonth() + 1}/${d.getDate()}`; const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${m.getMonth() + 1}/${m.getDate()}週`; };
  const buckets = [];
  for (const e of ev) { const b = bucketOf(e.at); let x = buckets.find((y) => y.name === b); if (!x) { x = { name: b, list: [] }; buckets.push(x); } x.list.push(e); }
  // 回ごと・形式ごと・時間帯ごと
  const group = (keyFn) => { const m = {}; for (const e of ev) { const k = keyFn(e); if (k) (m[k] = m[k] || []).push(e); } return m; };
  const byLec = group((e) => qmap[e.q].q.lecture ? `${qmap[e.q].c.name.slice(0, 4)} ${qmap[e.q].q.lecture}` : null);
  const lecRows = Object.entries(byLec).map(([name, list]) => {
    const qs = [...new Set(list.map((e) => e.q))];
    return { name, v: okOf(list), n: list.length, mem: qs.reduce((a, k) => a + store.recall(k), 0) / qs.length };
  });
  const byType = group((e) => TYPE_NAME[qmap[e.q].q.type]);
  const HOURS = [['深夜', 0, 5], ['朝', 5, 11], ['昼', 11, 17], ['夕方', 17, 20], ['夜', 20, 24]];
  const byHour = group((e) => { const h = new Date(e.at).getHours(); return HOURS.find(([, a, b]) => h >= a && h < b)[0]; });
  // まちがえたあと、覚えられた問題
  const wrongOnce = [...new Set(ev.filter((e) => e.r !== 'ok').map((e) => e.q))];
  const recovered = wrongOnce.filter((k) => { const r = store.get(k); return r && r.last === 'ok' && !store.isDue(k); });
  const stillWeak = wrongOnce.filter((k) => !recovered.includes(k));
  // ヒント
  const hinted = ev.filter((e) => e.h);
  // Claude の採点
  const gs = store.grades().filter((g) => qmap[g.q]);
  const avgScore = gs.length ? Math.round(gs.reduce((a, g) => a + (g.score || 0), 0) / gs.length) : null;
  const rank = { ng: 0, mid: 1, ok: 2 };
  const lenient = gs.filter((g) => g.self && rank[g.self] > rank[g.grade]).length;
  // アドバイス
  const tips = [];
  const lecSorted = lecRows.filter((r) => r.n >= 3).sort((a, b) => a.v - b.v);
  if (lecSorted.length >= 2) tips.push(`いちばん苦手なのは「${lecSorted[0].name}」（正解率 ${pct(lecSorted[0].v)}%）。この回の問題を「範囲」でしぼって、まとめて解き直すと効果的です。`);
  const typeSorted = Object.entries(byType).filter(([, l]) => l.length >= 3).map(([k, l]) => [k, okOf(l)]).sort((a, b) => a[1] - b[1]);
  if (typeSorted.length >= 2 && typeSorted[0][1] < 0.7) tips.push(`形式では「${typeSorted[0][0]}」の正解率が低め（${pct(typeSorted[0][1])}%）。答えを見る前に、自分の言葉で一度言ってみましょう。`);
  const hourSorted = Object.entries(byHour).filter(([, l]) => l.length >= 5).map(([k, l]) => [k, okOf(l)]).sort((a, b) => b[1] - a[1]);
  if (hourSorted.length >= 2) tips.push(`「${hourSorted[0][0]}」に解いたときの正解率がいちばん高いです（${pct(hourSorted[0][1])}%）。むずかしい問題はこの時間に。`);
  if (dayList.length / span < 0.6 && span >= 4) tips.push(`勉強した日は ${span}日中 ${dayList.length}日。記憶は「少しずつ毎日」のほうが残ります。1日10問でも続けましょう。`);
  if (lenient >= 2) tips.push(`記述の自己採点が、Claude の採点より甘めになりがちです（${lenient}件）。お手本の「ポイント」が全部入っているかで判断してみてください。`);
  if (hinted.length >= 3 && okOf(hinted) < 0.5) tips.push('ヒントを使っても正解できない計算問題があります。まず解説を見て、翌日にヒントなしで解き直しましょう。');
  if (stillWeak.length) tips.push(`まちがえたまま、まだ覚えきれていない問題が ${stillWeak.length}問あります。「まちがい復習」でくり返しましょう。`);
  if (!tips.length) tips.push('いい調子です。この調子で「今日の勉強」を続けましょう。');
  // 正解率の移り変わり（棒グラフ）
  const chart = (() => {
    const W = 320, H = 120, n = buckets.length, bw = Math.min(28, (W - 20) / n - 4);
    return `<svg viewBox="0 0 ${W} ${H + 24}" class="trend">${[0.5, 1].map((y) => `<line x1="0" x2="${W}" y1="${H - y * H}" y2="${H - y * H}" stroke="var(--line)"/>`).join('')}
      ${buckets.map((b, i) => { const v = okOf(b.list), x = 10 + i * ((W - 20) / n) + ((W - 20) / n - bw) / 2; return `<rect x="${x}" y="${H - v * H}" width="${bw}" height="${v * H}" rx="4" fill="url(#tg)"/><text x="${x + bw / 2}" y="${H + 16}" text-anchor="middle" font-size="9" fill="var(--sub)">${esc(b.name)}</text><text x="${x + bw / 2}" y="${H - v * H - 4}" text-anchor="middle" font-size="9" fill="var(--fg)">${pct(v)}</text>`; }).join('')}
      <defs><linearGradient id="tg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5b5cf0"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs></svg>`;
  })();
  w.innerHTML = `
    <div class="muted small" style="margin:14px 4px 0">${first.getMonth() + 1}/${first.getDate()} 〜 今日（${span}日間）のまとめ</div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><b>${dayList.length}</b><span>勉強した日</span></div>
      <div class="stat"><b>${totalAns}</b><span>解いた問題</span></div>
      <div class="stat"><b>${pct(okOf(ev))}<span style="font-size:.5em">%</span></b><span>正解率</span></div>
      <div class="stat"><b>${best}</b><span>最長の連続日数</span></div>
      <div class="stat"><b>${dayList.length ? Math.round(totalAns / dayList.length) : 0}</b><span>1日の平均</span></div>
      <div class="stat"><b>${recovered.length}</b><span>まちがいから覚えた</span></div>
    </div>
    <h2>次にやるとよいこと</h2><div class="card">${tips.map((t) => `<div class="tip">${icon('spark')}<span>${esc(t)}</span></div>`).join('')}</div>
    <h2>正解率の移り変わり（${byDay ? '日ごと' : '週ごと'}）</h2><div class="card">${chart}</div>
    <h2>回ごと（正解率・いま覚えている度）</h2><div class="card">${bars(lecRows.map((r) => ({ name: r.name.split(' ')[1] || r.name, v: r.v, note: `${r.n}回解いた・いま覚えている度 ${pct(r.mem)}%` })))}</div>
    <h2>形式ごとの正解率</h2><div class="card">${bars(Object.entries(byType).map(([k, l]) => ({ name: k.slice(0, 4), v: okOf(l), note: `${l.length}回` })))}</div>
    <h2>時間帯ごと</h2><div class="card">${bars(HOURS.map(([k]) => ({ name: k, v: okOf(byHour[k] || []), note: `${(byHour[k] || []).length}回解いた` })))}</div>
    <h2>ヒントと採点</h2><div class="card">
      <div class="kv"><span>ヒントを使った計算問題</span><b>${hinted.length}回（そのうち正解 ${hinted.filter((e) => e.s).length}回）</b></div>
      <div class="kv"><span>Claude が採点した記述</span><b>${gs.length}件${avgScore !== null ? `・平均 ${avgScore}点` : ''}</b></div>
      <div class="kv"><span>自己採点が Claude より甘かった</span><b>${lenient}件</b></div></div>
    ${stillWeak.length ? `<h2>まだ覚えきれていない問題（まちがえたことがある）</h2><div class="rlist">${stillWeak.slice(0, 8).map((k) => resultRow(qmap[k].q, 'ng')).join('')}</div>` : ''}
    <div class="cloud-line">v${APP_VERSION}</div>`;
  math(w); bindStars(w);
}

// ---------- 授業（スライド） ----------
// テストの JSON の lessons：[{id, lecture, title, sub, minutes, file}]。授業の中身は data/<授業>/lessons/<id>.json
const lessonCache = {};
async function loadLesson(c, L) {
  const path = `data/${c.id}/${L.file}`;
  if (!lessonCache[path]) lessonCache[path] = cachedJSON(path) || (await getJSON(path)).data;
  return lessonCache[path];
}
const lkey = (c, t, L) => `${c.id}/${t.id}/${L.id}`;
// この問題を説明している授業とスライド（授業の covers から）
function lessonFor(d, q) {
  for (const L of d.lessons || []) { const s = L.covers && L.covers[q.id]; if (s && s.length) return { L, slide: s[0] }; }
  return null;
}
function lessonLink(c, t, d, q) {
  const f = lessonFor(d, q);
  return f ? `<button class="btn ghost lesson-link" data-lesson-go="${esc(f.L.id)}:${f.slide}">${icon('play')}この問題の授業を見る（${esc(f.L.lecture || '')}）</button>` : '';
}
function bindLessonLink(root, c, t, d) {
  root.querySelectorAll('[data-lesson-go]').forEach((b) => (b.onclick = () => {
    const [id, n] = b.dataset.lessonGo.split(':');
    const L = (d.lessons || []).find((x) => x.id === id);
    if (L) playLesson(c, t, d, L, +n, { from: 'question' });
  }));
}
function lessonsCard(c, t, d) {
  const ls = d.lessons || [];
  if (!ls.length) return '';
  const done = ls.filter((L) => store.lesson(lkey(c, t, L))?.done).length;
  return `<button class="row lessons-card" data-lessons style="position:relative;z-index:2"><span class="av c3">${icon('cards')}</span>
    <div class="t"><div class="name">授業で学ぶ</div><div class="meta">${ls.length}本・見終わった ${done}本　知識ゼロからでもわかる</div>
    <div class="meter ok"><i style="width:${(done / ls.length) * 100}%"></i></div></div><span class="arrow">${icon('next')}</span></button>`;
}
function lessonList(c, t, d) {
  const w = screen('授業', { back: () => testMenu(c, t) });
  w.innerHTML = `<div class="card flat muted small" style="margin-top:14px">上から順に見ると、テストの問題がぜんぶ解けるようになります。1本 10〜15分。とちゅうでやめても、続きから見られます。</div>` +
    (d.lessons || []).map((L, i) => {
      const st = store.lesson(lkey(c, t, L));
      const qs = d.questions.filter((q) => L.lecture && q.lecture === L.lecture);
      const m = qs.length ? memStats(qs).now : null;
      return `<button class="row" data-l="${i}"><span class="av ${COLORS[i % COLORS.length]}">${st?.done ? icon('check') : esc(String(i))}</span>
        <div class="t"><div class="meta">${esc(L.lecture || '')}・${L.minutes || 10}分${st?.done ? '・見終わった' : st ? '・とちゅう' : ''}</div><div class="name">${esc(L.title)}</div>
        ${L.sub ? `<div class="meta">${esc(L.sub)}</div>` : ''}${m !== null ? `<div class="meta">この回の問題 ${qs.length}問・いま覚えている度 ${pct(m)}%</div>` : ''}</div><span class="arrow">${icon('next')}</span></button>`;
    }).join('');
  math(w);
  w.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => {
    const L = d.lessons[+b.dataset.l];
    const st = store.lesson(lkey(c, t, L));
    playLesson(c, t, d, L, st && !st.done ? st.last || 0 : 0);
  }));
}
// 本文の書き方：**太字** ==マーカー== 行頭「- 」で箇条書き、改行。$...$ は数式
function md(s) {
  const lines = esc(s || '').split('\n');
  let out = '', inList = false;
  for (const ln of lines) {
    const li = ln.match(/^\s*[-・]\s+(.*)$/);
    if (li && !inList) { out += '<ul>'; inList = true; }
    if (!li && inList) { out += '</ul>'; inList = false; }
    const x = (li ? li[1] : ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');
    out += li ? `<li>${x}</li>` : x ? `<p>${x}</p>` : '';
  }
  return out + (inList ? '</ul>' : '');
}
function slideHTML(c, s) {
  const fig = s.fig ? `<figure class="fig"><img src="data/${c.id}/${s.fig}" alt="図"></figure>` : '';
  switch (s.type) {
    case 'cover': return `<div class="sl cover"><div class="kicker">授業</div><h2>${esc(s.title)}</h2>${s.sub ? `<p>${esc(s.sub)}</p>` : ''}</div>`;
    case 'analogy': return `<div class="sl analogy"><div class="kicker">${icon('spark')}たとえるなら</div><h3>${esc(s.title || '')}</h3>${md(s.body)}${fig}</div>`;
    case 'formula': return `<div class="sl formula"><div class="kicker">大事な式</div><h3>${esc(s.title || '')}</h3><div class="tex">$$${esc(s.tex)}$$</div>${md(s.body)}</div>`;
    case 'point': return `<div class="sl point"><div class="kicker">${icon('check')}ここを覚える</div><h3>${esc(s.title || '')}</h3><ul class="pts">${(s.items || []).map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>`;
    case 'flow': return `<div class="sl flow"><h3>${esc(s.title || '')}</h3><div class="fl">${(s.items || []).map((x) => `<div class="fb">${md(x)}</div>`).join('<div class="fa">↓</div>')}</div>${md(s.body)}</div>`;
    case 'steps': return `<div class="sl steps"><h3>${esc(s.title || '')}</h3><ol class="st">${(s.items || []).map((x) => `<li>${md(x)}</li>`).join('')}</ol>${md(s.body)}</div>`;
    case 'table': return `<div class="sl"><h3>${esc(s.title || '')}</h3><div class="tw"><table><thead><tr>${(s.head || []).map((h) => `<th>${md(h)}</th>`).join('')}</tr></thead><tbody>${(s.rows || []).map((r) => `<tr>${r.map((x) => `<td>${md(String(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${md(s.body)}</div>`;
    case 'quiz': return `<div class="sl quiz"><div class="kicker">${icon('quiz')}確認クイズ</div><h3>${md(s.q)}</h3><div class="choices">${(s.choices || []).map((x, k) => `<button class="choice" data-qk="${k}"><span class="k">${KEYS[k]}</span><span>${md(x)}</span></button>`).join('')}</div><div data-qres></div></div>`;
    case 'summary': return `<div class="sl summary"><div class="kicker">${icon('check')}まとめ</div><h3>${esc(s.title || 'この回のまとめ')}</h3><ul class="pts">${(s.items || []).map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>`;
    default: return `<div class="sl"><h3>${esc(s.title || '')}</h3>${md(s.body)}${fig}</div>`;
  }
}
async function playLesson(c, t, d, L, start = 0, opt = {}) {
  let data;
  try { data = await loadLesson(c, L); } catch (e) { alert('授業を読みこめませんでした'); return; }
  const slides = data.slides || [];
  const key = lkey(c, t, L);
  let i = Math.max(0, Math.min(start, slides.length - 1));
  const answered = {};
  const show = () => {
    store.setLesson(key, i, i === slides.length - 1);
    const s = slides[i];
    const w = screen(`${L.lecture || ''} ${L.title}`, { back: () => lessonList(c, t, d) });
    w.innerHTML = `<div class="qtop"><span class="p">${i + 1}<small> / ${slides.length}</small></span><span class="lec">${esc(L.lecture || '')}</span></div>
      <div class="meter"><i style="width:${((i + 1) / slides.length) * 100}%"></i></div>
      <div class="card slide" data-slide>${slideHTML(c, s)}</div>
      ${i === slides.length - 1 ? lessonEnd(c, t, d, L) : ''}`;
    math(w);
    if (s.type === 'quiz') {
      const res = w.querySelector('[data-qres]');
      const mark = (k) => {
        w.querySelectorAll('[data-qk]').forEach((b) => { b.disabled = true; if (+b.dataset.qk === s.answer) b.classList.add('ok'); });
        if (k !== s.answer) w.querySelector(`[data-qk="${k}"]`).classList.add('ng');
        res.innerHTML = `<div class="verdict ${k === s.answer ? 'ok' : 'ng'}">${icon(k === s.answer ? 'check' : 'x')}${k === s.answer ? '正解！' : 'ざんねん'}</div>${s.explain ? `<div class="explain qexp">${md(s.explain)}</div>` : ''}`;
        math(res);
      };
      if (answered[i] !== undefined) mark(answered[i]);
      w.querySelectorAll('[data-qk]').forEach((b) => (b.onclick = () => { answered[i] = +b.dataset.qk; mark(answered[i]); buzz(answered[i] === s.answer ? 15 : [30, 40, 30]); }));
    }
    if (i === slides.length - 1) bindLessonEnd(w, c, t, d, L);
    const dk = dock(`<div style="display:flex;gap:10px">${i ? `<button class="btn sub" data-prev style="flex:1">${icon('back')}</button>` : ''}<button class="btn" data-next style="flex:3">${i + 1 < slides.length ? '次へ' : '授業の一覧へ'}${icon('next')}</button></div>`);
    dk.querySelector('[data-next]').onclick = () => { if (i + 1 < slides.length) { i++; show(); } else lessonList(c, t, d); };
    const pv = dk.querySelector('[data-prev]'); if (pv) pv.onclick = () => { i--; show(); };
    // 横にスワイプでめくる
    const card = w.querySelector('[data-slide]');
    let x0 = null, y0 = null;
    card.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    card.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && i + 1 < slides.length) { i++; show(); } else if (dx > 0 && i > 0) { i--; show(); }
    });
  };
  show();
}
function lessonEnd(c, t, d, L) {
  const qs = d.questions.filter((q) => L.lecture && q.lecture === L.lecture);
  const idx = (d.lessons || []).indexOf(L);
  const nextL = (d.lessons || [])[idx + 1];
  return `<div class="card result" style="text-align:center"><div class="msg">🎉 授業おわり！</div><div class="muted small">見たことを、問題で確かめよう</div>
    ${qs.length ? `<button class="btn" data-lq>${icon('play')}この回の問題を解く（${qs.length}問）</button>` : ''}
    ${nextL ? `<button class="btn sub" data-ln>次の授業：${esc(nextL.lecture || '')} ${esc(nextL.title)}</button>` : ''}</div>`;
}
function bindLessonEnd(w, c, t, d, L) {
  const qb = w.querySelector('[data-lq]');
  if (qb) qb.onclick = () => startQuiz(c, t, d, d.questions.filter((q) => q.lecture === L.lecture), { id: 'lesson', name: `${L.lecture}の問題`, back: () => lessonList(c, t, d) }, { limit: 0 });
  const nb = w.querySelector('[data-ln]');
  if (nb) nb.onclick = () => { const n = d.lessons[d.lessons.indexOf(L) + 1]; playLesson(c, t, d, n, 0); };
}

// ---------- まとめシート ----------
async function sheet(c, t, d) {
  if (!d.sheet) return;
  const w = screen(`まとめシート`, { back: () => testMenu(c, t) });
  w.innerHTML = '<div class="loading">読みこんでいます…</div>';
  try {
    const r = await fetch(`data/${c.id}/${d.sheet}?t=${Date.now()}`);
    const html = await r.text();
    w.innerHTML = `<div class="noprint"><button class="btn" data-print style="margin:14px 0">${icon('sheet')}印刷する（A4・片面1枚。PDFにも保存できます）</button></div><div class="sheet">${html}</div>`;
    math(w);
    w.querySelector('[data-print]').onclick = () => window.print();
  } catch (e) { w.innerHTML = '<div class="empty">読みこめませんでした</div>'; }
}

// ---------- 書いた記述の答え ----------
const SELF = { ok: 'できた', mid: 'おしい', ng: 'できなかった' };
const GRADE = { ok: '合格', mid: 'あと少し', ng: 'もう一度' };
function gradeHTML(g) {
  return `<div class="graded ${g.grade || ''}"><div class="gtop">${icon('spark')}<b>Claude の採点</b><span class="gscore num">${g.score ?? '-'}<small>点</small></span><span class="badge">${GRADE[g.grade] || ''}</span></div>
    ${g.comment ? `<div class="gtext">${esc(g.comment)}</div>` : ''}
    ${g.missing?.length ? `<span class="label">足りなかったポイント</span><ul class="gmiss">${g.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${g.better ? `<span class="label">こう書くとよい</span><div class="gtext">${esc(g.better)}</div>` : ''}</div>`;
}
// まだ見ていない採点の数（最初の画面のお知らせ用）
const SEEN_KEY = 'ts_grades_seen';
const seenAt = () => { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } };
const newGrades = () => store.grades().filter((g) => (g.t || 0) > seenAt());

async function answers(c, t, d) {
  const w = screen(`書いた答え`, { back: () => testMenu(c, t) });
  const byKey = Object.fromEntries(d.questions.map((q) => [q.key, q]));
  const local = (await store.listAnswers()).filter((a) => byKey[a.key]);
  const localUids = new Set(local.map((a) => a.uid));
  // ほかの端末で書いた答えも、採点があれば出す
  const others = store.grades().filter((g) => byKey[g.q] && !localUids.has(g.uid)).map((g) => ({ uid: g.uid, key: g.q, q: byKey[g.q].q, text: g.yours || '', self: g.self, t: g.at || g.t, other: true }));
  const list = [...local, ...others].sort((x, y) => (y.t || 0) - (x.t || 0));
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) { /* */ }
  if (!list.length) { w.innerHTML = '<div class="empty">まだ記述の答えはありません</div>'; return; }
  const waiting = list.filter((a) => !store.grade(a.uid)).length;
  w.innerHTML = `<div class="card flat muted small">${waiting ? `まだ採点していない答えが <b>${waiting}件</b> あります。Claude に「記述の答えを採点して」と言うと、ドライブの答え（写真も）を読んで採点し、ここに結果が出ます。` : 'すべて採点ずみです。'}</div>` +
    list.map((a) => {
      const g = store.grade(a.uid);
      return `<div class="card"><div class="muted small">${new Date(a.t).toLocaleString('ja-JP')}${a.self ? '・自己採点 ' + (SELF[a.self] || '') : ''}${a.other ? '・ほかの端末' : ''}</div>
      <div class="qtext" style="font-size:15px">${esc(a.q)}</div>
      ${a.text ? `<div class="explain" style="margin-top:6px">${esc(a.text)}</div>` : ''}
      ${a.photo ? `<img class="photo-prev" src="${URL.createObjectURL(a.photo)}" alt="答えの写真">` : ''}
      ${g ? gradeHTML(g) : '<div class="muted small" style="margin-top:8px">⏳ 採点まち</div>'}</div>`;
    }).join('');
  math(w);
}

// ---------- はじめ ----------
(async () => {
  try {
    const cached = cachedJSON('data/courses.json');
    COURSES = (cached || (await getJSON('data/courses.json')).data).courses || [];
    await home();
    refreshData();
    // ドライブの記録をとりこむ。変わっていて、ホームのままなら表示しなおす
    cloud.onSynced((changed) => { if (changed && onHome()) home(); });
    cloud.sync();
    // 数式の道具は、画面が出たあとで先に読んでおく
    setTimeout(loadKatex, 300);
    // アプリをスマホにとっておく。新しい版に入れかわったら、ホームにいるときに開きなおす
    if ('serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) return; // はじめて入ったときは開きなおさない
        if (onHome()) location.reload(); else window.__reloadOnHome = true;
      });
    }
  } catch (e) {
    $app.innerHTML = '<div class="loading">読みこめませんでした。電波のよい所でもう一度開いてください。</div>';
  }
})();
