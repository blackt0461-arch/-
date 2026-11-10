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
const toHM = (n) => { n = Math.round(n); const h = ((Math.floor(n / 60) % 24) + 24) % 24, m = ((n % 60) + 60) % 60; return `${h}:${String(m).padStart(2, '0')}`; };
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
const AUTO_OK = location.protocol === 'https:'; // 公開したページならいつも調べる（サーバー側で kotetsuworks.com などだけ受け付ける）
const pending = new Set(), failed = new Map();
if (!S.auto) S.auto = {};      // 検索の答え：{ 'A→B|日付|種類|時刻': { routes:[...], at } }
if (!S.places) S.places = {};  // いつもの行き方：{ 場所: { in:{st,min,how}, out:{st,min,how} } }
if (!S.ovr) S.ovr = {};        // 「1本あと」「いまから」：{ '日付|移動id': {time} }
if (S.pass === undefined) S.pass = null; // 定期：{ a:'須磨', b:'南草津' }（JR）
if (!S.periods) S.periods = ['09:00-10:35', '10:45-12:20', '13:10-14:45', '14:55-16:30', '16:40-18:15', '18:25-20:00', '20:10-21:45'];
const akey = (from, to, date, type, time) => `${rkey(from, to)}|${date}|${type}|${time}`;
const pad = (t) => t.padStart(5, '0');

// 定期の区間か（JR西日本の東海道線・山陽線の本線で、定期の2駅の間）
const bare = (n) => norm(n).replace(/[（(].*[)）]$/, '').replace(/駅$/, '');
function lonOf(n) { const x = (STATIONS || []).find((s) => s.n === bare(n)); return x && x.m != null ? x.m : null; }
function inPass(a, b) {
  if (!S.pass) return false;
  const pa = lonOf(S.pass.a), pb = lonOf(S.pass.b), xa = lonOf(a), xb = lonOf(b);
  if ([pa, pb, xa, xb].some((v) => v == null)) return false;
  const lo = Math.min(pa, pb) - 0.0005, hi = Math.max(pa, pb) + 0.0005;
  return xa >= lo && xa <= hi && xb >= lo && xb <= hi;
}
// 定期を考えた、実際に払うお金
function payOf(r) {
  if (!r.fares || !r.fares.length) return Number(String(r.price || '0').replace(/[^\d]/g, '')) || 0;
  let sum = 0;
  for (const f of r.fares) {
    const st = r.steps || [];
    const jr = st.slice(f.a, f.b + 1).every((x) => /^(ＪＲ|JR)/.test(x.line));
    const covered = jr && st[f.a] && st[f.b + 1] && inPass(st[f.a].station, st[f.b + 1].station);
    sum += (covered ? 0 : f.price) + (f.exp || 0);
  }
  return sum;
}
// 案をえらぶ：ふだんは「払うお金が少ない」→「遅く出られる（到着指定）／早く着く（出発指定）」、急ぎは速さだけ
function choose(routes, type, hurry) {
  const later = (x, y) => type === '4' ? toMin(y.dep) - toMin(x.dep) : toMin(x.arr) - toMin(y.arr);
  return routes.slice().sort((x, y) => hurry ? later(x, y) : (payOf(x) - payOf(y)) || later(x, y))[0];
}
function stepsText(a) { // Yahoo!の結果 → 「06:39 須磨 発　ＪＲ神戸線・高槻行」の並び
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
        S.auto[k] = { routes: j.routes, at: Date.now() };
        const best = choose(j.routes, q.type, false);
        const rk = rkey(q.from, q.to);
        if (!(S.routes[rk] && S.routes[rk].by === 'hand')) S.routes[rk] = { min: best.min, steps: stepsText(best), at: Date.now(), by: 'auto' };
        // 古い検索の答えは消す（2週間）
        const old = Date.now() - 14 * 864e5;
        Object.keys(S.auto).forEach((x) => { if (S.auto[x].at < old) delete S.auto[x]; });
        save();
      } else failed.set(k, j.error || ('http' + r.status));
    } catch (e) { failed.set(k, 'network'); }
    pending.delete(k); render();
  }
}

// ---- 1日の流れを組み立てる ----
// P から Q への移動。type '4'＝time までに着く、'1'＝time 以降に出る（time は駅での時刻）
function moveInfo(id, P, Q, base, hurry, minLeave, target) {
  const buf = Number(S.buffer || 0);
  const out = (S.places[P] || {}).out, inn = (S.places[Q] || {}).in;
  const fromSt = norm((out && out.st) || P), toSt = norm((inn && inn.st) || Q);
  const outMin = out ? Number(out.min) || 0 : 0, inMin = inn ? Number(inn.min) || 0 : 0;
  const o = S.ovr[day + '|' + id];
  let type = base.type, time = base.type === '4' ? toHM(toMin(base.time) - inMin) : toHM(toMin(base.time) + outMin);
  if (o) { type = '1'; time = o.time; }
  time = pad(time);
  const m = { id, P, Q, fromSt, toSt, out, inn, outMin, inMin, type, time, ovr: !!o, hurry, target: target ?? null };
  const clampLeave = (v) => (type === '1' && minLeave != null ? Math.max(minLeave, v) : v);
  if (fromSt === toSt) { // 駅を使わない（歩くだけ など）
    m.state = 'walk'; m.min = outMin + inMin;
    m.leave = type === '4' ? toMin(base.time) - m.min - buf : clampLeave(toMin(time) - outMin);
    m.arrive = m.leave + m.min + (type === '4' ? buf : 0);
    return m;
  }
  const k = akey(fromSt, toSt, day, type, time);
  m.k = k;
  const hand = S.routes[rkey(fromSt, toSt)];
  const got = S.auto[k];
  if (got && !(hand && hand.by === 'hand')) {
    const a = choose(got.routes, type, hurry);
    m.state = 'auto'; m.a = a; m.steps = stepsText(a); m.pay = payOf(a); m.price = a.price;
    m.train = a.dep;
    m.leave = clampLeave(toMin(a.dep) - outMin - buf);
    m.arrive = toMin(a.arr) + inMin;
    if (toMin(a.arr) < toMin(a.dep)) m.arrive += 1440; // 夜12時をまたぐ
    m.min = m.arrive - m.leave;
    return m;
  }
  m.state = pending.has(k) ? 'loading' : failed.has(k) ? 'failed' : (AUTO_OK ? 'loading' : 'none');
  if (hand) {
    m.learned = true; m.steps = hand.steps;
    const total = hand.min + outMin + inMin;
    if (type === '4') { m.arrive = toMin(base.time); m.leave = m.arrive - total - buf; }
    else { m.leave = clampLeave(toMin(time) - outMin); m.arrive = m.leave + total; }
    m.min = total;
  }
  return m;
}
let want = [];
function buildDay(evs) {
  const list = evs.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
  const out = [];
  want = [];
  let prevPlace = S.home, prevEnd = null;
  const addMove = (m) => { if (m.k && !S.auto[m.k]) want.push({ from: m.fromSt, to: m.toSt, date: day, type: m.type, time: m.time }); };
  list.forEach((e) => {
    const from = norm(prevPlace), to = norm(e.place);
    let mv = null;
    if (from && to && from !== to) {
      // 「できるだけ早く」：前の予定が終わったら、いちばん早く着く行き方
      const base = e.asap && prevEnd != null ? { type: '1', time: toHM(prevEnd) } : { type: '4', time: e.start };
      mv = moveInfo('ev:' + e.id, from, to, base, !!e.hurry, prevEnd, toMin(e.start));
      addMove(mv);
    }
    // すき間：前の予定の終わりから、移動の出発（または次の予定）まで
    if (prevEnd != null) {
      const until = mv && mv.leave != null ? mv.leave : toMin(e.start);
      const gap = until - prevEnd;
      if (gap >= 10) out.push({ kind: 'gap', from: prevEnd, to: until, min: gap });
      else if (gap < 0 && !(mv && (mv.ovr || mv.type === '1'))) out.push({ kind: 'late', min: -gap, before: e.name });
    }
    if (mv) out.push({ kind: 'move', ...mv });
    out.push({ kind: 'ev', e });
    prevPlace = e.place || prevPlace;
    prevEnd = Math.max(prevEnd ?? 0, toMin(e.end));
  });
  // 最後に家へ帰る（予定が終わったら出る）
  if (list.length && S.home && norm(prevPlace) && norm(prevPlace) !== norm(S.home)) {
    const mv = moveInfo('home', norm(prevPlace), norm(S.home), { type: '1', time: toHM(prevEnd) }, false, prevEnd);
    addMove(mv);
    out.push({ kind: 'move', home: true, ...mv });
  }
  return out;
}

// ---- 画面 ----
const HOW = { walk: '🚶 歩き', shuttle: '🚌 シャトルバス', bus: '🚌 バス', bike: '🚲 自転車' };
function legText(dir, leg, place) {
  if (!leg) return '';
  const how = HOW[leg.how] || HOW.walk;
  return dir === 'out' ? `${how}　${place} → ${leg.st}（${leg.min}分）` : `${how}　${leg.st} → ${place}（${leg.min}分）`;
}
function render() {
  $('day').value = day;
  $('homeName').textContent = S.home || '未設定';
  $('bufName').textContent = S.buffer;
  const evs = S.days[day] || [];
  const L = $('list');
  if (!evs.length) { L.innerHTML = '<div class="empty">この日の予定はまだありません。<br>下のボタンから入れてください。</div>'; return; }
  const isToday = day === ymd(new Date());
  const parts = buildDay(evs).map((b) => {
    if (b.kind === 'ev') {
      const e = b.e;
      return `<div class="blk ev" data-ev="${e.id}"><div><span class="t">${e.start}〜${e.end}</span> ${esc(e.name)}${e.hurry ? ' <span class="tag">急ぎ</span>' : ''}${e.asap ? ' <span class="tag">早めに着く</span>' : ''}</div>` +
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
    const money = b.state === 'auto' ? (S.pass ? `・定期外 ${b.pay.toLocaleString()}円` : (b.price ? `・${esc(b.price)}円` : '')) : '';
    if (b.leave != null) head = `<span class="t">${toHM(b.leave)} 出発</span> → ${toHM(b.arrive)} 着（${dur(b.min)}${money}）`;
    else if (b.state === 'loading') head = '<span class="sub">乗りかえをしらべています…</span>';
    else if (b.state === 'failed') {
      const why = { daily_limit: '今日の検索の回数をこえました', no_route: '行き方が見つかりませんでした（場所の名前を駅名にすると見つかりやすいです）', upstream: 'Yahoo!から答えがありませんでした', network: 'ネットにつながりませんでした', http403: 'このページからは調べられません' }[failed.get(b.k)] || ('うまくいきませんでした：' + failed.get(b.k));
      head = `<span class="warn">自動でしらべられませんでした</span><div class="sub">${esc(why)}</div>`;
    }
    else head = '<span class="warn">移動時間がまだわかりません</span>';
    if (b.leave != null && b.state === 'loading') head += ' <span class="sub">しらべ中…</span>';
    const late = b.target != null && b.arrive != null && b.arrive > b.target ? `<div class="warn">⚠ ${b.arrive - b.target}分 おくれます</div>` : '';
    const note = b.state === 'auto' ? `<div class="sub">${b.train} の電車${b.hurry ? '（急ぎなので速さ優先）' : S.pass ? '（定期を考えて安い方）' : ''}${b.ovr ? '・ずらし中' : ''}</div>` : '';
    const lines = [legText('out', b.out, b.P), ...(b.steps || []), legText('in', b.inn, b.Q)].filter(Boolean);
    const steps = lines.length ? `<ol class="steps">${lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '';
    const shift = b.state === 'auto' ? `<button type="button" data-next="${esc(b.id)}" data-t="${esc(b.train)}">1本あと</button>` : '';
    const now = isToday && b.fromSt !== b.toSt ? `<button type="button" data-now="${esc(b.id)}" data-out="${b.outMin}">いまから出る</button>` : '';
    const retry = b.state === 'failed' ? `<button type="button" data-retry="${esc(b.k)}">もう一度しらべる</button>` : '';
    const back = b.ovr ? `<button type="button" data-back="${esc(b.id)}">もとにもどす</button>` : '';
    return `<div class="blk mv"><div>🚃 ${head}</div><div class="sub">${esc(b.P)} → ${esc(b.Q)}</div>${late}${note}${steps}` +
      `<div class="acts">${retry}${shift}${now}${back}` +
      (b.fromSt !== b.toSt ? `<a href="${esc(yahooUrl(b.fromSt, b.toSt, day, b.time, b.type))}" target="_blank" rel="noopener"><button type="button">Yahoo!で見る</button></a>` : '') +
      `<button type="button" data-place="${esc(b.home ? b.P : b.Q)}">行き方</button>` +
      (b.fromSt !== b.toSt ? `<button type="button" data-mv="1" data-from="${esc(b.fromSt)}" data-to="${esc(b.toSt)}">${b.learned || b.state === 'auto' ? '直す' : '時間を入れる'}</button>` : '') +
      `</div></div>`;
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
  $('evHurry').checked = !!(e && e.hurry);
  $('evAsap').checked = !!(e && e.asap);
  $('evDel').style.display = e ? '' : 'none';
  $('evDlg').showModal();
}
$('evDlg').addEventListener('close', () => {
  if ($('evDlg').returnValue !== 'ok') return;
  const v = { name: $('evName').value.trim(), start: $('evStart').value, end: $('evEnd').value, place: norm($('evPlace').value), hurry: $('evHurry').checked, asap: $('evAsap').checked };
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
// 「9:00-10:30 1限 @大学」「13時〜17時 バイト @なんば」「1-5限 授業 @立命館」「19:00 夕ご飯 @家 急ぎ」など
function periodTime(n) { const p = S.periods[n - 1]; return p ? p.split('-') : null; }
function parseLines(text) {
  const t2m = (s) => { const m = s.match(/(\d{1,2})(?:[:：時](\d{1,2})?分?)?/); return m ? `${m[1].padStart(2, '0')}:${(m[2] || '0').padStart(2, '0')}` : null; };
  const out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/[０-９：＠！]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
    if (!line) continue;
    let hurry = false, asap = false;
    for (let k = 0; k < 2; k++) {
      if (/(急ぎ|いそぎ|!)\s*$/.test(line)) { hurry = true; line = line.replace(/(急ぎ|いそぎ|!)\s*$/, '').trim(); }
      if (/(早めに?|はやめに?)\s*$/.test(line)) { asap = true; line = line.replace(/(早めに?|はやめに?)\s*$/, '').trim(); }
    }
    let start, end, rest;
    const pm = line.match(/^(\d)\s*(?:[-〜~ー–]\s*(\d))?\s*限\s*(.*)$/); // 「1限」「1-5限」
    if (pm && periodTime(+pm[1])) {
      start = periodTime(+pm[1])[0];
      end = periodTime(+(pm[2] || pm[1]))[1];
      rest = (pm[2] ? `${pm[1]}〜${pm[2]}限 ` : `${pm[1]}限 `) + pm[3];
    } else {
      const m = line.match(/^(\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?|半)?)?)\s*(?:[-〜~ー–]\s*(\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?|半)?)?))?\s*(.*)$/);
      if (!m || !/\d/.test(m[1])) continue;
      const fix = (s) => s && s.replace('半', '30');
      start = t2m(fix(m[1]));
      end = m[2] ? t2m(fix(m[2])) : null;
      rest = m[3] || '';
    }
    let place = '';
    const at = rest.match(/[@＠](.+)$/) || rest.match(/[（(]([^）)]+)[）)]\s*$/);
    if (at) { place = at[1].trim(); rest = rest.slice(0, at.index).trim(); }
    if (!end) end = toHM(toMin(start) + 60).padStart(5, '0');
    out.push({ name: rest.trim() || '予定', start, end, place: norm(place), hurry, asap });
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
  const nx = ev.target.closest('[data-next]');
  if (nx) { S.ovr[day + '|' + nx.dataset.next] = { time: pad(toHM(toMin(nx.dataset.t) + 1)) }; save(); render(); return; }
  const nw = ev.target.closest('[data-now]');
  if (nw) { const d = new Date(); S.ovr[day + '|' + nw.dataset.now] = { time: pad(toHM(d.getHours() * 60 + d.getMinutes() + Number(nw.dataset.out || 0))) }; save(); render(); return; }
  const rt = ev.target.closest('[data-retry]');
  if (rt) { failed.delete(rt.dataset.retry); render(); return; }
  const bk = ev.target.closest('[data-back]');
  if (bk) { delete S.ovr[day + '|' + bk.dataset.back]; save(); render(); return; }
  const pl = ev.target.closest('[data-place]');
  if (pl) { openPlace(pl.dataset.place); return; }
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
$('homeBtn').addEventListener('click', () => {
  $('homeIn').value = S.home; $('bufIn').value = S.buffer;
  $('passA').value = S.pass ? S.pass.a : ''; $('passB').value = S.pass ? S.pass.b : '';
  $('periodsIn').value = S.periods.map((p, i) => `${i + 1}限 ${p}`).join('\n');
  $('homeDlg').showModal();
});
$('homeDlg').addEventListener('close', () => {
  if ($('homeDlg').returnValue !== 'ok') return;
  S.home = norm($('homeIn').value); S.buffer = Math.max(0, Number($('bufIn').value) || 0);
  const pa = bare($('passA').value), pb = bare($('passB').value);
  S.pass = pa && pb ? { a: pa, b: pb } : null;
  const ps = $('periodsIn').value.split('\n').map((l) => (l.match(/(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2})/) || []).slice(1)).filter((x) => x.length === 2).map(([a, b]) => `${a.padStart(5, '0')}-${b.padStart(5, '0')}`);
  if (ps.length) S.periods = ps;
  save(); render();
});
const shift = (n) => { const d = new Date(day + 'T00:00'); d.setDate(d.getDate() + n); day = ymd(d); render(); };
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('day').onchange = () => { if ($('day').value) { day = $('day').value; render(); } };
$('addBtn').onclick = () => openEv(null);
$('pasteBtn').onclick = () => $('pasteDlg').showModal();

// ---- 場所の候補（前に入れた場所＋関西の駅名）----
let STATIONS = null;
function loadStations() {
  if (STATIONS) return;
  STATIONS = [];
  fetch('stations.json').then((r) => r.json()).then((j) => { STATIONS = j; if (S.pass) render(); }).catch(() => {});
}
function usedPlaces() {
  const c = {};
  const add = (p, w) => { p = norm(p); if (p) c[p] = (c[p] || 0) + w; };
  add(S.home, 5);
  Object.values(S.days).forEach((list) => list.forEach((e) => add(e.place, 1)));
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}
function suggest(q) {
  q = norm(q).replace(/駅$/, '');
  if (!q) return usedPlaces().slice(0, 6).map((p) => ({ v: p, tag: 'よく使う' }));
  const out = [], seen = new Set();
  const push = (v, tag) => { if (!seen.has(v) && out.length < 8) { seen.add(v); out.push({ v, tag }); } };
  const used = usedPlaces();
  used.filter((p) => p.startsWith(q)).forEach((p) => push(p, '前に使った'));
  used.filter((p) => p.includes(q)).forEach((p) => push(p, '前に使った'));
  const st = STATIONS || [];
  st.filter((x) => x.n === q).forEach((x) => push(x.n, '駅・' + x.l));
  st.filter((x) => x.n.startsWith(q)).forEach((x) => push(x.n, '駅・' + x.l));
  st.filter((x) => x.n.includes(q)).forEach((x) => push(x.n, '駅・' + x.l));
  return out;
}
function attachSuggest(input) {
  const ul = document.createElement('ul');
  ul.className = 'sugg'; ul.hidden = true;
  input.parentNode.appendChild(ul);
  let items = [], on = -1;
  const pick = (v) => { input.value = v; ul.hidden = true; };
  const show = () => {
    items = suggest(input.value); on = -1;
    if (!items.length || (items.length === 1 && items[0].v === norm(input.value))) { ul.hidden = true; return; }
    ul.innerHTML = items.map((it, i) => `<li data-i="${i}">${esc(it.v)}<small>${esc(it.tag)}</small></li>`).join('');
    ul.hidden = false;
  };
  input.addEventListener('focus', () => { loadStations(); show(); });
  input.addEventListener('input', show);
  input.addEventListener('blur', () => setTimeout(() => { ul.hidden = true; }, 150));
  // 押した瞬間に入力欄が閉じないように、pointerdown で選ぶ
  ul.addEventListener('pointerdown', (ev) => { const li = ev.target.closest('li'); if (li) { ev.preventDefault(); pick(items[+li.dataset.i].v); } });
  input.addEventListener('keydown', (ev) => {
    if (ul.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); on = (on + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...ul.children].forEach((li, i) => li.classList.toggle('on', i === on));
    } else if (ev.key === 'Enter' && on >= 0) { ev.preventDefault(); pick(items[on].v); }
    else if (ev.key === 'Escape') ul.hidden = true;
  });
  // 入力中に読みこみが終わったら出し直す
  let tries = 0;
  const wait = setInterval(() => { if (++tries > 60) clearInterval(wait); if (STATIONS && STATIONS.length) { clearInterval(wait); if (document.activeElement === input) show(); } }, 300);
}
attachSuggest($('evPlace'));
attachSuggest($('homeIn'));

// ---- いつもの行き方（駅から先・駅まで）----
let placeName = null;
function openPlace(name) {
  placeName = name;
  const p = S.places[name] || {};
  $('plName').textContent = name;
  for (const d of ['in', 'out']) {
    const l = p[d] || {};
    $(d + 'St').value = l.st || ''; $(d + 'Min').value = l.min ?? ''; $(d + 'How').value = l.how || 'walk';
  }
  $('plDlg').showModal();
}
$('plDlg').addEventListener('close', () => {
  if ($('plDlg').returnValue !== 'ok' || !placeName) return;
  const p = {};
  for (const d of ['in', 'out']) {
    const st = bare($(d + 'St').value), min = Math.max(0, Math.round(Number($(d + 'Min').value) || 0));
    if (st) p[d] = { st, min, how: $(d + 'How').value };
  }
  if (p.in || p.out) S.places[placeName] = p; else delete S.places[placeName];
  save(); render();
});
attachSuggest($('inSt'));
attachSuggest($('outSt'));

// ---- リンクで予定を入れる（#i=コード：Supabase に置いた予定／#import=…：リンクの中に入れた予定）----
const SB_KEY = 'sb_publishable_0kgkan6JFFV-TMSLLTgiOQ_uwgeEfQf'; // 公開してよい鍵（ほかのアプリと同じ）
async function importFromHash() {
  const short = location.hash.match(/^#i=([0-9a-f]{6,16})$/);
  const long = location.hash.match(/^#import=([A-Za-z0-9_-]+)/);
  if (!short && !long) return;
  history.replaceState(null, '', location.pathname);
  let d;
  try {
    if (short) {
      const r = await fetch('https://zmteazudhtnzvfvmndqn.supabase.co/rest/v1/rpc/idounavi_take', {
        method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: short[1] }),
      });
      d = r.ok ? await r.json() : null;
      if (!d) { alert('このリンクの予定は見つかりませんでした（7日たつと消えます）。'); return; }
    } else {
      const b = atob(long[1].replace(/-/g, '+').replace(/_/g, '/'));
      d = JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))));
    }
  } catch (e) { alert('リンクを読み取れませんでした。'); return; }
  const days = Object.keys(d.days || {});
  const msg = ['この内容をアプリに入れますか？'];
  days.forEach((k) => msg.push(`・${k} の予定 ${d.days[k].length}件（その日の予定は入れかえ）`));
  if (d.places) msg.push(`・いつもの行き方 ${Object.keys(d.places).length}か所`);
  if (d.pass) msg.push(`・定期 ${d.pass.a}〜${d.pass.b}`);
  if (d.home) msg.push(`・家 ${d.home}`);
  if (!confirm(msg.join('\n'))) return;
  days.forEach((k) => { S.days[k] = d.days[k].map((e, i) => ({ id: Date.now().toString(36) + i + k.slice(-2), ...e })); });
  if (d.places) Object.assign(S.places, d.places);
  if (d.pass !== undefined) S.pass = d.pass;
  if (d.home) S.home = d.home;
  if (d.periods) S.periods = d.periods;
  save();
  if (days[0]) day = days[0];
  render();
}
importFromHash();
window.addEventListener('hashchange', () => { importFromHash(); });
loadStations(); // 定期の判定に使う

render();
if (!S.home) setTimeout(() => $('homeBtn').click(), 300);
