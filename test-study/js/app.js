// テスト勉強アプリ。授業 → テスト → 勉強（ぜんぶ・カード・自動採点・記述・まちがい復習）
// 問題は data/ の JSON（Claude がレジュメから作る）。記録はこの端末（localStorage と IndexedDB）。
import * as store from './store.js';

const APP_VERSION = '1.0.0';
const $app = document.getElementById('app');
let COURSES = [];
const testCache = {};

// ---------- 小さな道具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function math(el) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
      });
    } catch (e) { /* 数式が読めなくても文字のまま出す */ }
  } else {
    setTimeout(() => window.renderMathInElement && math(el), 300);
  }
}
function screen(title, body, { back, side } = {}) {
  $app.innerHTML = `
    <div class="bar">${back ? '<button class="back" data-back aria-label="もどる">‹</button>' : ''}
      <h1>${esc(title)}</h1>${side ? `<span class="side">${side}</span>` : ''}</div>
    <div class="wrap">${body}</div>`;
  if (back) $app.querySelector('[data-back]').onclick = back;
  window.scrollTo(0, 0);
  math($app);
  return $app.querySelector('.wrap');
}
async function getJSON(path) {
  const r = await fetch(path + '?t=' + Date.now());
  if (!r.ok) throw new Error(path);
  return r.json();
}
async function loadTest(course, test) {
  const key = course.id + '/' + test.id;
  if (!testCache[key]) {
    const d = await getJSON(`data/${course.id}/${test.id}.json`);
    d.questions = (d.questions || []).map((q) => ({ ...q, key: key + '/' + q.id }));
    testCache[key] = d;
  }
  return testCache[key];
}
function daysLeft(date) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00'); const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
const TYPE_NAME = { choice: '選択', fill: '穴うめ', calc: '計算', card: 'カード', written: '記述・説明' };

// ---------- ホーム：授業の一覧 ----------
async function home() {
  const w = screen('テスト勉強', '<div class="loading">読みこんでいます…</div>', { side: 'v' + APP_VERSION });
  let html = '<h2>授業</h2>';
  for (const c of COURSES) {
    const next = (c.tests || []).map((t) => ({ t, d: daysLeft(t.date) })).filter((x) => x.d !== null && x.d >= 0).sort((a, b) => a.d - b.d)[0];
    html += `<button class="item" data-c="${esc(c.id)}"><div class="t"><div class="name">${esc(c.name)}</div>
      <div class="meta">${next ? `<span class="badge ${next.d <= 7 ? 'soon' : ''}">${esc(next.t.name)}まで あと${next.d}日</span>` : ''}${(c.tests || []).length ? '' : 'まだ問題がありません'}</div></div><span class="arrow">›</span></button>`;
  }
  if (!COURSES.length) html += '<div class="empty">まだ授業がありません</div>';
  html += `<h2>使い方</h2><div class="card muted">問題は Claude がドライブのレジュメから作ります。ふやしたいときは Claude に「〇〇の期末の問題を作って」と頼んでください。</div>`;
  w.innerHTML = html;
  w.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => course(COURSES.find((c) => c.id === b.dataset.c))));
}

// ---------- 授業：テストの一覧 ----------
async function course(c) {
  const w = screen(c.name, '', { back: home });
  let html = '<h2>テスト</h2>';
  for (const t of c.tests || []) {
    let stat = '';
    try {
      const d = await loadTest(c, t);
      const s = store.summary(d.questions);
      stat = `<div class="meta">${d.questions.length}問・できた ${s.mastered}問</div><div class="meter"><i style="width:${d.questions.length ? (s.mastered / d.questions.length) * 100 : 0}%"></i></div>`;
    } catch (e) { stat = '<div class="meta">まだ問題がありません</div>'; }
    const dl = daysLeft(t.date);
    html += `<button class="item" data-t="${esc(t.id)}"><div class="t"><div class="name">${esc(t.name)}
      ${dl !== null && dl >= 0 ? `<span class="badge ${dl <= 7 ? 'soon' : ''}">あと${dl}日</span>` : ''}</div>${stat}</div><span class="arrow">›</span></button>`;
  }
  if (!(c.tests || []).length) html += '<div class="empty">まだテストがありません</div>';
  w.innerHTML = html;
  w.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => testMenu(c, c.tests.find((t) => t.id === b.dataset.t))));
}

// ---------- テスト：勉強のしかたを選ぶ ----------
const MODES = [
  { id: 'all', name: 'ぜんぶ混ぜる', desc: 'いろいろな形式で', wide: true, pick: (q) => true },
  { id: 'card', name: '単語カード', desc: '用語と意味を覚える', pick: (q) => q.type === 'card' || q.type === 'fill' },
  { id: 'auto', name: '小テスト', desc: '選択・穴うめ・計算', pick: (q) => ['choice', 'fill', 'calc'].includes(q.type) },
  { id: 'written', name: '記述・説明', desc: '書いて答え合わせ', pick: (q) => q.type === 'written' },
  { id: 'wrong', name: 'まちがい復習', desc: 'まちがえた問題だけ', pick: (q) => store.isWrong(q.key) },
];
const UI = { count: 10, lectures: null };

async function testMenu(c, t) {
  const w = screen(t.name, '<div class="loading">読みこんでいます…</div>', { back: () => course(c) });
  let d;
  try { d = await loadTest(c, t); } catch (e) { w.innerHTML = '<div class="empty">まだ問題がありません</div>'; return; }
  const qs = d.questions;
  const lectures = [...new Set(qs.map((q) => q.lecture).filter(Boolean))];
  const sel = new Set(UI.lectures && UI.lectures.key === t.id ? UI.lectures.set : lectures);
  const s = store.summary(qs);
  const render = () => {
    const inRange = qs.filter((q) => !q.lecture || sel.has(q.lecture));
    w.innerHTML = `
      ${d.note ? `<div class="card muted">${esc(d.note)}</div>` : ''}
      <div class="card"><b>${qs.length}問</b>　<span class="muted">できた ${s.mastered}・まちがい ${s.wrong}・まだ ${s.unseen}</span>
        <div class="meter"><i style="width:${qs.length ? (s.mastered / qs.length) * 100 : 0}%"></i></div></div>
      <h2>勉強のしかた</h2>
      <div class="modes">${MODES.map((m) => {
        const n = inRange.filter(m.pick).length;
        return `<button class="mode ${m.wide ? 'wide' : ''}" data-m="${m.id}" ${n ? '' : 'disabled'}><b>${m.name} <small>${n}問</small></b><span>${m.desc}</span></button>`;
      }).join('')}</div>
      <h2>1回に解く数</h2>
      <div class="chips">${[5, 10, 20, 0].map((n) => `<button class="chip ${UI.count === n ? 'on' : ''}" data-n="${n}">${n ? n + '問' : 'ぜんぶ'}</button>`).join('')}</div>
      ${lectures.length > 1 ? `<h2>範囲</h2><div class="chips">${lectures.map((l) => `<button class="chip ${sel.has(l) ? 'on' : ''}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${d.sheet ? `<h2>持ち込み用</h2><button class="btn sub" data-sheet>まとめシートを見る・印刷する</button>` : ''}
      <h2>書いた答え</h2><button class="btn sub" data-answers>記述の答えを見る</button>`;
    math(w);
    w.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
      const m = MODES.find((x) => x.id === b.dataset.m);
      startQuiz(c, t, d, inRange.filter(m.pick), m);
    }));
    w.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { UI.count = +b.dataset.n; render(); }));
    w.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => {
      const l = b.dataset.l;
      if (sel.has(l)) { if (sel.size > 1) sel.delete(l); } else sel.add(l);
      UI.lectures = { key: t.id, set: [...sel] }; render();
    }));
    const sb = w.querySelector('[data-sheet]'); if (sb) sb.onclick = () => sheet(c, t, d);
    w.querySelector('[data-answers]').onclick = () => answers(c, t, d);
  };
  render();
}

// 出す順番：まちがい → まだ解いていない → 正解が少ない、の順に出やすく
function order(qs) {
  const score = (q) => {
    const r = store.get(q.key);
    if (store.isWrong(q.key)) return 0;
    if (!r) return 1;
    return 2 + r.ok / Math.max(1, r.n);
  };
  return shuffle(qs).map((q) => ({ q, s: score(q) + Math.random() * 0.8 })).sort((a, b) => a.s - b.s).map((x) => x.q);
}

// ---------- 問題を解く ----------
let fixResult = () => {};
function startQuiz(c, t, d, pool, mode) {
  let list = order(pool);
  if (UI.count) list = list.slice(0, UI.count);
  const results = [];
  fixResult = (q) => { const r = results.find((x) => x.q === q); if (r) r.res = 'ok'; };
  let i = 0;
  const backToMenu = () => testMenu(c, t);
  const next = () => { i++; if (i < list.length) show(); else finish(); };
  const show = () => {
    const q = list[i];
    const asCard = mode.id === 'card';
    const w = screen(`${t.name}・${mode.name}`, '', { back: () => { if (!results.length || confirm('とちゅうでやめますか？')) backToMenu(); } });
    w.innerHTML = `
      <div class="qhead"><span>${i + 1} / ${list.length}</span><span>${esc(q.lecture || '')}</span></div>
      <div class="progress"><i style="width:${(i / list.length) * 100}%"></i></div>
      <div class="card"><span class="qtype">${asCard ? 'カード' : TYPE_NAME[q.type] || ''}</span><div class="qtext">${esc(q.q)}</div><div data-body></div></div>
      <div data-after></div>`;
    const body = w.querySelector('[data-body]');
    const after = w.querySelector('[data-after]');
    // res: ok / mid / ng。opt.extra：判定の下に足すもの。opt.quiet：判定と解説を出さない（自分で出したとき）
    const done = (res, opt = {}) => {
      store.record(q.key, res);
      results.push({ q, res });
      const label = { ok: '⭕ 正解', mid: '🔺 おしい', ng: '❌ まちがい' }[res];
      const html = opt.quiet ? '' : `<div class="verdict ${res}">${label}</div>${opt.extra || ''}${explainHTML(q)}`;
      after.insertAdjacentHTML('beforeend', `${html}<button class="btn" data-next>${i + 1 < list.length ? '次へ' : '結果を見る'}</button>`);
      math(after);
      after.querySelector('[data-next]').onclick = next;
      if (opt.onShown) opt.onShown();
      after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (asCard) cardBody(q, body, after, done);
    else if (q.type === 'choice') choiceBody(q, body, done);
    else if (q.type === 'fill') fillBody(q, body, after, done);
    else if (q.type === 'calc') calcBody(q, body, after, done);
    else if (q.type === 'written') writtenBody(q, body, after, done, c, t);
    else cardBody(q, body, after, done);
    math(w);
  };
  const finish = () => {
    const ok = results.filter((r) => r.res === 'ok').length;
    const w = screen(`${t.name}・結果`, '', { back: backToMenu });
    w.innerHTML = `<div class="score"><b>${ok}</b> / ${results.length}<div class="muted">${ok === results.length ? 'ぜんぶ正解！' : 'まちがえた問題は「まちがい復習」でくり返せます'}</div></div>
      ${results.map((r) => `<div class="card ${r.res === 'ok' ? 'okitem' : 'wrongitem'}"><div class="muted">${{ ok: '⭕', mid: '🔺', ng: '❌' }[r.res]} ${esc(r.q.lecture || '')}</div><div>${esc(r.q.q)}</div></div>`).join('')}
      <button class="btn" data-again>もう一度（同じ形式）</button><button class="btn sub" data-menu>もどる</button>`;
    math(w);
    w.querySelector('[data-again]').onclick = () => startQuiz(c, t, d, mode.id === 'wrong' ? pool.filter((q) => store.isWrong(q.key)) : pool, mode);
    w.querySelector('[data-menu]').onclick = backToMenu;
    if (mode.id === 'wrong' && !pool.some((q) => store.isWrong(q.key))) w.querySelector('[data-again]').hidden = true;
  };
  if (!list.length) { alert('この形式の問題がありません'); return backToMenu(); }
  show();
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
  body.innerHTML = `<button class="btn sub" data-show>答えを見る</button>`;
  body.querySelector('[data-show]').onclick = () => {
    body.innerHTML = `<div class="card explain"><span class="label">答え</span>${esc(answerText(q))}${q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : ''}</div>
      <div class="grade" style="grid-template-columns:1fr 1fr"><button class="g-ok" data-g="ok">覚えた</button><button class="g-ng" data-g="ng">まだ</button></div>`;
    math(body);
    body.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
      body.querySelector('.grade').remove();
      done(b.dataset.g, { quiet: true });
    }));
  };
}

function choiceBody(q, body, done) {
  const idx = shuffle(q.choices.map((_, k) => k));
  body.innerHTML = `<div class="choices">${idx.map((k) => `<button class="choice" data-k="${k}">${esc(q.choices[k])}</button>`).join('')}</div>`;
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
    <button class="btn" data-go>答える</button><button class="btn sub" data-skip>わからない</button>`;
  const inp = body.querySelector('[data-in]');
  const go = () => {
    const v = norm(inp.value);
    if (!v) return;
    const ok = q.answers.some((a) => norm(a) === v);
    body.querySelectorAll('button').forEach((b) => (b.disabled = true)); inp.disabled = true;
    done(ok ? 'ok' : 'ng', {
      extra: ok ? '' : `<button class="link" data-fix>じつは合っていた（⭕にする）</button>`,
      onShown: () => {
        const fx = after.querySelector('[data-fix]');
        if (fx) fx.onclick = () => { store.fix(q.key); fixResult(q); fx.replaceWith(Object.assign(document.createElement('div'), { className: 'verdict ok', textContent: '⭕ 正解にしました' })); };
      },
    });
  };
  body.querySelector('[data-go]').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  body.querySelector('[data-skip]').onclick = () => { body.querySelectorAll('button').forEach((b) => (b.disabled = true)); done('ng'); };
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
function calcBody(q, body, after, done) {
  body.innerHTML = `<input class="input" data-in inputmode="decimal" placeholder="答え（数字）" autocomplete="off">
    ${q.unit ? `<div class="unit">単位：${esc(q.unit)}</div>` : ''}
    <button class="btn" data-go>答える</button><button class="btn sub" data-skip>わからない・解き方を見る</button>`;
  const inp = body.querySelector('[data-in]');
  const go = () => {
    const v = parseNum(inp.value);
    if (Number.isNaN(v)) { alert('数字で入れてください（例：0.5、1/2、2*10^3）'); return; }
    const tol = q.tol ?? 0.01;
    const ok = Math.abs(v - q.answer) <= Math.max(Math.abs(q.answer) * tol, 1e-9);
    body.querySelectorAll('button').forEach((b) => (b.disabled = true)); inp.disabled = true;
    done(ok ? 'ok' : 'ng');
  };
  body.querySelector('[data-go]').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  body.querySelector('[data-skip]').onclick = () => { body.querySelectorAll('button').forEach((b) => (b.disabled = true)); done('ng'); };
}

function writtenBody(q, body, after, done, c, t) {
  let photo = null;
  body.innerHTML = `
    <textarea class="input" data-in placeholder="ここに書く（紙に書いて写真でもOK）"></textarea>
    <label class="btn sub" style="text-align:center">📷 紙に書いた答えを写真で入れる<input type="file" accept="image/*" capture="environment" data-photo hidden></label>
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
    inp.disabled = true; body.querySelectorAll('button,label').forEach((b) => { b.disabled = true; if (b.tagName === 'LABEL') b.hidden = true; });
    body.querySelector('[data-go]').hidden = true;
    after.innerHTML = `
      <div class="card explain"><span class="label">お手本</span>${esc(q.model)}
        ${q.points?.length ? `<span class="label">入れるべきポイント（書けたものをタップ）</span><ul class="points">${q.points.map((p, k) => `<li data-p="${k}">${esc(p)}</li>`).join('')}</ul>` : ''}
        ${q.explain ? `<span class="label">解説</span>${esc(q.explain)}` : ''}</div>
      <div class="muted">自分でつけてみよう</div>
      <div class="grade"><button class="g-ok" data-g="ok">⭕</button><button class="g-mid" data-g="mid">🔺</button><button class="g-ng" data-g="ng">❌</button></div>`;
    math(after);
    after.querySelectorAll('[data-p]').forEach((li) => (li.onclick = () => li.classList.toggle('on')));
    after.querySelectorAll('[data-g]').forEach((b) => (b.onclick = async () => {
      const g = b.dataset.g;
      const got = [...after.querySelectorAll('[data-p].on')].map((li) => +li.dataset.p);
      after.querySelector('.grade').remove();
      if (text || photo) await store.saveAnswer({ key: q.key, course: c.name, test: t.name, q: q.q, text, photo, self: g, points: got });
      after.insertAdjacentHTML('beforeend', `<div class="verdict ${g}">${{ ok: '⭕ できた', mid: '🔺 おしい', ng: '❌ できなかった' }[g]}${text || photo ? '（答えを保存しました）' : ''}</div>`);
      done(g, { quiet: true });
    }));
    after.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// ---------- まとめシート ----------
async function sheet(c, t, d) {
  const w = screen(`${t.name}・まとめシート`, '<div class="loading">読みこんでいます…</div>', { back: () => testMenu(c, t) });
  try {
    const r = await fetch(`data/${c.id}/${d.sheet}?t=${Date.now()}`);
    const html = await r.text();
    w.innerHTML = `<div class="noprint"><button class="btn" data-print>印刷する（PDFにも保存できます）</button></div><div class="sheet">${html}</div>`;
    math(w);
    w.querySelector('[data-print]').onclick = () => window.print();
  } catch (e) { w.innerHTML = '<div class="empty">読みこめませんでした</div>'; }
}

// ---------- 書いた記述の答え ----------
async function answers(c, t, d) {
  const w = screen(`${t.name}・書いた答え`, '<div class="loading">読みこんでいます…</div>', { back: () => testMenu(c, t) });
  const keys = new Set(d.questions.map((q) => q.key));
  const list = (await store.listAnswers()).filter((a) => keys.has(a.key)).reverse();
  if (!list.length) { w.innerHTML = '<div class="empty">まだ記述の答えはありません</div>'; return; }
  w.innerHTML = `<div class="card muted">ここに保存した答えは、あとで Claude に採点してもらえます（ドライブに残す仕組みは次の版で入ります）。</div>` +
    list.map((a) => `<div class="card"><div class="muted">${new Date(a.t).toLocaleString('ja-JP')}・自己採点 ${{ ok: '⭕', mid: '🔺', ng: '❌' }[a.self] || ''}</div>
      <div class="qtext" style="font-size:15px">${esc(a.q)}</div>
      ${a.text ? `<div class="explain" style="margin-top:6px">${esc(a.text)}</div>` : ''}
      ${a.photo ? `<img class="photo-prev" src="${URL.createObjectURL(a.photo)}" alt="答えの写真">` : ''}</div>`).join('');
  math(w);
}

// ---------- はじめ ----------
(async () => {
  try {
    const d = await getJSON('data/courses.json');
    COURSES = d.courses || [];
    home();
  } catch (e) {
    $app.innerHTML = '<div class="loading">読みこめませんでした。電波のよい所でもう一度開いてください。</div>';
  }
})();
