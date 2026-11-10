// いどうナビ：1日の予定から、移動（出発時刻・かかる時間・乗りかえ）と、すき間を出す
'use strict';
const KEY = 'idounavi-v1';
const $ = (id) => document.getElementById(id);

// ---- 保存データ ----
// { home, buffer, days: { 'YYYY-MM-DD': [ {id,name,start,end,place} ] }, routes: { 'A→B': {min, steps:[], at} } }
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.days) return d; } catch (e) {}
  return { home: '', buffer: 5, days: {}, routes: {} };
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// ---- 時刻の道具 ----
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHM = (n) => { n = Math.round(n); const h = Math.floor(n / 60), m = ((n % 60) + 60) % 60; return `${h}:${String(m).padStart(2, '0')}`; };
const dur = (n) => n >= 60 ? `${Math.floor(n / 60)}時間${n % 60 ? (n % 60) + '分' : ''}` : `${n}分`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (p) => (p || '').trim().replace(/\s+/g, ' ');
const rkey = (a, b) => `${norm(a)}→${norm(b)}`;

let day = ymd(new Date());

// ---- 乗りかえ案内 ----
// Yahoo!乗換案内を、到着時刻つきで開くリンク（開くだけ）
function yahooUrl(from, to, date, arrive, type = '4') {
  const [y, mo, d] = date.split('-');
  const [hh, mm] = arrive.split(':');
  const q = new URLSearchParams({ from, to, y, m: mo, d, hh: hh.padStart(2, '0'), m1: mm[0], m2: mm[1], type });
  return 'https://transit.yahoo.co.jp/search/result?' + q.toString();
}
// ---- 自動で調べる（Supabase の route-yahoo が Yahoo!乗換案内を読んで返す）----
const API = 'https://zmteazudhtnzvfvmndqn.supabase.co/functions/v1/route-yahoo';
const AUTO_OK = /(^|\.)kotetsuworks\.com$/.test(location.hostname); // ほかの場所からは受け付けてもらえない
const pending = new Set(), failed = new Map();
if (!S.auto) S.auto = {};
const akey = (from, to, date, type, time) => `${rkey(from, to)}|${date}|${type}|${time}`;
function stepsText(a) { // Yahoo!の結果 → 「06:39 須磨 発 ＪＲ神戸線・高槻行」の並び
  const st = a.steps || [], out = [];
  st.forEach((s, i) => {
    if (i === st.length - 1) out.push(`${s.dep || s.arr} ${s.station} 着`);
    else out.push(`${s.arr ? s.arr + '着・' : ''}${s.dep} ${s.station} 発　${s.line}`);
  });
  return out;
}
async function autoFill(list) {
  if (!AUTO_OK) return;
  for (const q of list) {
    const k = akey(q.from, q.to, q.date, q.type, q.time);
    if (S.auto[k] || pending.has(k) || failed.has(k)) continue;
    pending.add(k); render();
    try {
      const u = API + '?' + new URLSearchParams({ from: q.from, to: q.to, date: q.date, time: q.time, type: q.type });
      const r = await fetch(u);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.routes && j.routes.length) {
        // 到着指定：いちばん遅く出られる案（1番目）／出発指定：いちばん早く着く案
        const best = q.type === '4' ? j.routes[0] : j.routes.slice().sort((x, y) => toMin(x.arr) - toMin(y.arr))[0];
        S.auto[k] = { ...best, at: Date.now() };
        S.routes[rkey(q.from, q.to)] = S.routes[rkey(q.from, q.to)]?.by === 'hand' ? S.routes[rkey(q.from, q.to)] : { min: best.min, steps: stepsText(best), at: Date.now(), by: 'auto' };
        save();
      } else failed.set(k, j.error || r.status);
    } catch (e) { failed.set(k, 'network'); }
    pending.delete(k); render();
  }
}

// ---- 1日の流れを組み立てる ----
function moveInfo(from, to, date, type, time) {
  const k = akey(from, to, date, type, time);
  const r0 = S.routes[rkey(from, to)];
  const a = r0 && r0.by === 'hand' ? null : S.auto[k];
  const buf = Number(S.buffer || 0);
  if (a) {
    // 電車の発車時刻より「余裕」の分だけ前に出る
    return { qtime: time, from, to, a, min: a.min, steps: stepsText(a), depart: toMin(a.dep) - buf, arriveAt: a.arr, train: a.dep, price: a.price, state: 'auto' };
  }
  const r = S.routes[rkey(from, to)];
  const st = pending.has(k) ? 'loading' : failed.has(k) ? 'failed' : (AUTO_OK ? 'loading' : 'none');
  if (r) {
    const depart = type === '4' ? toMin(time) - r.min - buf : toMin(time);
    return { qtime: time, from, to, r, min: r.min, steps: r.steps, depart, arriveAt: type === '4' ? time : toHM(depart + r.min), state: 'learned', sub: st };
  }
  return { qtime: time, from, to, depart: null, arriveAt: type === '4' ? time : null, state: st };
}
let want = [];
function buildDay(evs) {
  const list = evs.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
  const out = [];
  want = [];
  let prevPlace = S.home, prevEnd = null;
  list.forEach((e) => {
    const from = norm(prevPlace), to = norm(e.place);
    let mv = null;
    if (from && to && from !== to) {
      want.push({ from, to, date: day, type: '4', time: e.start });
      mv = moveInfo(from, to, day, '4', e.start);
    }
    // すき間：前の予定の終わりから、移動の出発（または次の予定）まで
    if (prevEnd != null) {
      const until = mv && mv.depart != null ? mv.depart : toMin(e.start);
      const gap = until - prevEnd;
      if (gap >= 10) out.push({ kind: 'gap', from: prevEnd, to: until, min: gap });
      else if (gap < 0) out.push({ kind: 'late', min: -gap, before: e.name });
    }
    if (mv) out.push({ kind: 'move', ...mv });
    out.push({ kind: 'ev', e });
    prevPlace = e.place || prevPlace;
    prevEnd = Math.max(prevEnd ?? 0, toMin(e.end));
  });
  // 最後に家へ帰る（予定が終わった時刻に出発）
  if (list.length && S.home && norm(prevPlace) && norm(prevPlace) !== norm(S.home)) {
    const from = norm(prevPlace), to = norm(S.home), t = toHM(prevEnd).padStart(5, '0');
    want.push({ from, to, date: day, type: '1', time: t });
    out.push({ kind: 'move', home: true, ...moveInfo(from, to, day, '1', t) });
  }
  return out;
}

// ---- 画面 ----
function render() {
  $('day').value = day;
  $('homeName').textContent = S.home || '未設定';
  $('bufName').textContent = S.buffer;
  const evs = S.days[day] || [];
  const L = $('list');
  if (!evs.length) { L.innerHTML = '<div class="empty">この日の予定はまだありません。<br>下のボタンから入れてください。</div>'; return; }
  const parts = buildDay(evs).map((b) => {
    if (b.kind === 'ev') {
      const e = b.e;
      return `<div class="blk ev" data-ev="${e.id}"><div><span class="t">${e.start}〜${e.end}</span> ${esc(e.name)}</div>` +
        `<div class="sub">${e.place ? '📍 ' + esc(e.place) : '場所なし'}</div></div>`;
    }
    if (b.kind === 'gap') {
      return `<div class="blk gp"><span class="t">${toHM(b.from)}〜${toHM(b.to)}</span> すき間 <b>${dur(b.min)}</b>` +
        `<div class="sub">${b.min >= 60 ? '休憩やご飯に使えます' : 'ひと休みできます'}</div></div>`;
    }
    if (b.kind === 'late') {
      return `<div class="blk mv"><span class="warn">⚠ ${esc(b.before)} に ${b.min}分 まにあいません</span></div>`;
    }
    // 移動
    let head;
    if (b.state === 'auto') head = `<span class="t">${toHM(b.depart)} 出発</span> → ${b.arriveAt} 着（${dur(b.min)}${b.price ? '・' + esc(b.price) + '円' : ''}）`;
    else if (b.min != null) head = `<span class="t">${toHM(b.depart)} 出発</span> → ${b.arriveAt} 着（${dur(b.min)}）` + (b.sub === 'loading' ? ' <span class="sub">しらべ中…</span>' : '');
    else if (b.state === 'loading') head = '<span class="sub">乗りかえをしらべています…</span>';
    else if (b.state === 'failed') head = '<span class="warn">自動でしらべられませんでした</span>';
    else head = '<span class="warn">移動時間がまだわかりません</span>';
    const note = b.state === 'auto' ? `<div class="sub">${b.train} の電車に乗る（出発は余裕${S.buffer}分をふくむ）</div>` : '';
    const steps = b.steps && b.steps.length ? `<ol class="steps">${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '';
    const arr = b.qtime;
    return `<div class="blk mv"><div>🚃 ${head}</div><div class="sub">${esc(b.from)} → ${esc(b.to)}</div>${note}${steps}` +
      `<div class="acts"><a href="${esc(yahooUrl(b.from, b.to, day, arr, b.home ? '1' : '4'))}" target="_blank" rel="noopener"><button type="button">Yahoo!で見る</button></a>` +
      `<button type="button" data-mv="1" data-from="${esc(b.from)}" data-to="${esc(b.to)}">${b.min != null ? '直す' : '時間を入れる'}</button></div></div>`;
  });
  L.innerHTML = parts.join('');
  autoFill(want);
}

// ---- 予定の入力 ----
let editing = null;
function openEv(e) {
  editing = e || null;
  $('evTitle').textContent = e ? '予定を直す' : '予定を入れる';
  $('evName').value = e ? e.name : '';
  $('evStart').value = e ? e.start : '';
  $('evEnd').value = e ? e.end : '';
  $('evPlace').value = e ? e.place : '';
  $('evDel').style.display = e ? '' : 'none';
  $('evDlg').showModal();
}
$('evDlg').addEventListener('close', () => {
  if ($('evDlg').returnValue !== 'ok') return;
  const v = { name: $('evName').value.trim(), start: $('evStart').value, end: $('evEnd').value, place: norm($('evPlace').value) };
  if (!v.name || !v.start || !v.end) return;
  if (toMin(v.end) < toMin(v.start)) v.end = v.start;
  const arr = S.days[day] || (S.days[day] = []);
  if (editing) Object.assign(editing, v); else arr.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...v });
  save(); render();
});
$('evDel').addEventListener('click', () => {
  if (!editing) return;
  S.days[day] = (S.days[day] || []).filter((x) => x !== editing);
  save(); $('evDlg').close('cancel'); render();
});

// ---- 文字から読み取る ----
// 「9:00-10:30 1限 @大学」「13時〜17時 バイト @なんば」「19:00 夕ご飯 @家」など
function parseLines(text) {
  const t2m = (s) => { const m = s.match(/(\d{1,2})(?:[:：時](\d{1,2})?分?)?/); return m ? `${m[1].padStart(2, '0')}:${(m[2] || '0').padStart(2, '0')}` : null; };
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/[０-９：＠]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?|半)?)?)\s*(?:[-〜~ー–]\s*(\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?|半)?)?))?\s*(.*)$/);
    if (!m || !/\d/.test(m[1])) continue;
    const fix = (s) => s && s.replace('半', '30');
    const start = t2m(fix(m[1]));
    let end = m[2] ? t2m(fix(m[2])) : null;
    let rest = m[3] || '', place = '';
    const at = rest.match(/[@＠](.+)$/) || rest.match(/[（(]([^）)]+)[）)]\s*$/);
    if (at) { place = at[1].trim(); rest = rest.slice(0, at.index).trim(); }
    if (!end) end = toHM(toMin(start) + 60);
    out.push({ name: rest || '予定', start, end, place: norm(place) });
  }
  return out;
}
$('pasteDlg').addEventListener('close', () => {
  if ($('pasteDlg').returnValue !== 'ok') return;
  const got = parseLines($('pasteText').value);
  if (!got.length) { alert('読み取れる予定がありませんでした。例のように「時刻 名前 @場所」で書いてください。'); return; }
  const arr = S.days[day] || (S.days[day] = []);
  got.forEach((v, i) => arr.push({ id: Date.now().toString(36) + i, ...v }));
  save(); render();
  $('pasteText').value = '';
});

// ---- 移動を直す ----
let mvKey = null;
$('list').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mv]');
  if (b) {
    mvKey = rkey(b.dataset.from, b.dataset.to);
    const r = S.routes[mvKey];
    $('mvWhere').textContent = `${b.dataset.from} → ${b.dataset.to}`;
    $('mvMin').value = r ? r.min : '';
    $('mvSteps').value = r ? r.steps.join('\n') : '';
    $('mvDlg').showModal();
    return;
  }
  const e = ev.target.closest('[data-ev]');
  if (e) openEv((S.days[day] || []).find((x) => x.id === e.dataset.ev));
});
$('mvDlg').addEventListener('close', () => {
  if ($('mvDlg').returnValue !== 'ok' || !mvKey) return;
  const min = Math.max(0, Math.round(Number($('mvMin').value) || 0));
  S.routes[mvKey] = { min, steps: $('mvSteps').value.split('\n').map((s) => s.trim()).filter(Boolean), at: Date.now(), by: 'hand' };
  save(); render();
});

// ---- 設定・日付 ----
$('homeBtn').addEventListener('click', () => { $('homeIn').value = S.home; $('bufIn').value = S.buffer; $('homeDlg').showModal(); });
$('homeDlg').addEventListener('close', () => {
  if ($('homeDlg').returnValue !== 'ok') return;
  S.home = norm($('homeIn').value); S.buffer = Math.max(0, Number($('bufIn').value) || 0); save(); render();
});
const shift = (n) => { const d = new Date(day + 'T00:00'); d.setDate(d.getDate() + n); day = ymd(d); render(); };
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('day').onchange = () => { if ($('day').value) { day = $('day').value; render(); } };
$('addBtn').onclick = () => openEv(null);
$('pasteBtn').onclick = () => $('pasteDlg').showModal();

render();
if (!S.home) setTimeout(() => $('homeBtn').click(), 300);
