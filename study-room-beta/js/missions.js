// ミッション（毎日3つ・毎週3つ）とメダル交換所。
// ・スタディサイドとパズルサイドで中身が変わる（sideOf）。
// ・ごほうびは「ミッション専用メダル」と、全部終わった時のレアチケット。回数で決まるので稼ぎ放題にならない。
//   毎日：1つ メダル10、3つ全部で +メダル10・レアチケット1／毎週：1つ メダル50、3つ全部で +メダル50・レアチケット2
// ・メダルは house.medals。交換所の「月ごとの上限」は house.medalShop = { m: 'YYYY-MM', b: { 品物id: 回数 } }。
// ・ミッションの進み具合は profile.mission（下の state()）。古い記録になくても、ここで初期値を作る。
// 画面にはさわらない（main.js が呼ぶ）。
import * as S from './store.js';

const DAILY = {
  study: [
    { id: 'ok10', name: '問題に10問正解する', key: 'ok', goal: 10 },
    { id: 'sub2', name: '2つの教科を解く', key: 'sids', goal: 2 },
    { id: 'run3', name: '3問続けて正解する', key: 'run', goal: 3 },
  ],
  puzzle: [
    { id: 'pz3', name: 'パズルを3回クリアする', key: 'pz', goal: 3 },
    { id: 'kind2', name: '2種類のパズルをクリアする', key: 'pzk', goal: 2 },
    { id: 'clean1', name: 'ノーミスで1回クリアする', key: 'pzp', goal: 1 },
  ],
};
const WEEKLY = {
  study: [
    { id: 'days5', name: '5日 勉強する', key: 'days', goal: 5 },
    { id: 'ok80', name: '問題に80問正解する', key: 'ok', goal: 80 },
    { id: 'sub3x10', name: '3つの教科で10問ずつ正解する', key: 'subOk', goal: 3 },
  ],
  puzzle: [
    { id: 'days5', name: '5日 パズルで遊ぶ', key: 'days', goal: 5 },
    { id: 'pz20', name: 'パズルを20回クリアする', key: 'pz', goal: 20 },
    { id: 'star3x5', name: '★3以上を5回クリアする', key: 'pz3', goal: 5 },
  ],
};
export const REWARD = {
  daily: { each: 10, all: { medals: 10, ticket: 1 } },
  weekly: { each: 50, all: { medals: 50, ticket: 2 } },
};

// ---------------- 交換所 ----------------
// kind：'item'（家具など1つだけ）・'shards4'・'shards5'・'ticket'（レアチケット）・'exchange'（家具の引きかえ券）
// monthly：その月に交換できる回数（家具は1つだけ）
export const SHOP = [
  { id: 'm-chester-wine', kind: 'item', item: 'm-chester-wine', cost: 600 },
  { id: 'm-boucle-sage', kind: 'item', item: 'm-boucle-sage', cost: 900 },
  { id: 'm-door-navy', kind: 'item', item: 'm-door-navy', cost: 600 },
  { id: 'm-door-mint', kind: 'item', item: 'm-door-mint', cost: 600 },
  { id: 'exchange', kind: 'exchange', amount: 1, cost: 60, monthly: 10, name: '家具の引きかえ券' },
  { id: 'shards4', kind: 'shards4', amount: 1, cost: 150, monthly: 5, name: '★4のかけら' },
  { id: 'ticket', kind: 'ticket', amount: 1, cost: 300, monthly: 3, name: 'レアチケット' },
  { id: 'shards5', kind: 'shards5', amount: 1, cost: 600, monthly: 1, name: '★5のかけら' },
];
const HOUSE_KEY = { shards4: 'shards4', shards5: 'shards5', ticket: 'rareTickets', exchange: 'tickets' };

const monthKey = () => S.dayKey().slice(0, 7);
export const medals = () => S.house().medals || 0;

// ---------------- 進み具合 ----------------
function blankDay(d) { return { d, ok: 0, sids: [], run: 0, runNow: 0, pz: 0, pzk: [], pzp: 0, claimed: [], all: false }; }
function blankWeek(w) { return { w, days: [], ok: 0, subOk: {}, pz: 0, pz3: 0, claimed: [], all: false }; }
export function state() {
  const p = S.profile();
  const m = p.mission || (p.mission = {});
  const d = S.dayKey(), w = S.weekKey();
  if (!m.day || m.day.d !== d) m.day = blankDay(d);
  if (!m.week || m.week.w !== w) m.week = blankWeek(w);
  return m;
}
export const sideKey = () => (S.sideOf() === 'puzzle' ? 'puzzle' : 'study');
export const dailyList = () => DAILY[sideKey()];
export const weeklyList = () => WEEKLY[sideKey()];

function value(rec, key) {
  const v = rec[key];
  if (Array.isArray(v)) return v.length;
  if (key === 'subOk') return Object.values(v || {}).filter(n => n >= 10).length;
  return v || 0;
}
// 一覧：[{ id, name, goal, now, done, claimed, i }]
function listOf(defs, rec) {
  return defs.map((m, i) => { const now = Math.min(m.goal, value(rec, m.key)); return { ...m, i, now, done: now >= m.goal, claimed: rec.claimed.includes(m.id) }; });
}
export function daily() { return listOf(dailyList(), state().day); }
export function weekly() { return listOf(WEEKLY[sideKey()], state().week); }
const allDone = (list) => list.every(x => x.claimed);
// 受け取れる数（部屋のボタンの赤丸）
export function readyCount() {
  const st = state(), d = daily(), w = weekly();
  let n = d.filter(x => x.done && !x.claimed).length + w.filter(x => x.done && !x.claimed).length;
  if (allDone(d) && !st.day.all) n++;
  if (allDone(w) && !st.week.all) n++;
  return n;
}

// ---------------- 記録する（main.js から） ----------------
function markDay(st) { const d = S.dayKey(); if (!st.week.days.includes(d)) st.week.days.push(d); }
// 終わったばかりのミッションの名前を返す（知らせに使う）
function diff(before) {
  const after = [...daily(), ...weekly()].filter(x => x.done).map(x => x.name);
  return after.filter(n => !before.includes(n));
}
const doneNames = () => [...daily(), ...weekly()].filter(x => x.done).map(x => x.name);

// 問題を1問答えた
export function onAnswer({ sid, ok }) {
  const before = doneNames(), st = state(), D = st.day, W = st.week;
  markDay(st);
  if (sid && !D.sids.includes(sid)) D.sids.push(sid);
  if (ok) {
    D.ok++; W.ok++;
    D.runNow = (D.runNow || 0) + 1; D.run = Math.max(D.run || 0, D.runNow);
    if (sid) W.subOk[sid] = (W.subOk[sid] || 0) + 1;
  } else D.runNow = 0;
  return diff(before);
}
// パズルをクリアした
export function onPuzzle({ id, star, mistakes }) {
  const before = doneNames(), st = state(), D = st.day, W = st.week;
  markDay(st);
  D.pz++; W.pz++;
  if (id && !D.pzk.includes(id)) D.pzk.push(id);
  if (!mistakes) D.pzp++;
  if (star >= 3) W.pz3++;
  return diff(before);
}

// ---------------- 受け取る ----------------
function giveMedals(n) { const h = S.house(); h.medals = (h.medals || 0) + n; }
// 1つのミッション。戻り値 { medals } か null
export function claim(kind, id) {
  const st = state(), rec = kind === 'weekly' ? st.week : st.day;
  const m = (kind === 'weekly' ? weekly() : daily()).find(x => x.id === id);
  if (!m || !m.done || m.claimed) return null;
  rec.claimed.push(id);
  const n = REWARD[kind].each;
  giveMedals(n);
  return { medals: n };
}
// 3つ全部のボーナス
export function claimAll(kind) {
  const st = state(), rec = kind === 'weekly' ? st.week : st.day;
  const list = kind === 'weekly' ? weekly() : daily();
  if (rec.all || !allDone(list)) return null;
  rec.all = true;
  const r = REWARD[kind].all;
  giveMedals(r.medals);
  const h = S.house(); h.rareTickets = (h.rareTickets || 0) + r.ticket;
  return { ...r };
}
// 受け取れる物を全部受け取る。戻り値 { medals, ticket }
export function claimEverything() {
  const sum = { medals: 0, ticket: 0 };
  for (const kind of ['daily', 'weekly']) {
    for (const m of kind === 'weekly' ? weekly() : daily()) { const r = claim(kind, m.id); if (r) sum.medals += r.medals; }
    const a = claimAll(kind); if (a) { sum.medals += a.medals; sum.ticket += a.ticket; }
  }
  return sum;
}
// のこり時間（毎日：次の朝6時まで／毎週：次の月曜の朝6時まで）
export function timeLeft(kind, now = new Date()) {
  const [y, m, d] = (kind === 'weekly' ? S.addDays(S.weekKey(now), 7) : S.addDays(S.dayKey(now), 1)).split('-').map(Number);
  const ms = new Date(y, m - 1, d, 6).getTime() - now.getTime();
  const hrs = Math.max(0, Math.floor(ms / 3600e3));
  return hrs >= 24 ? `${Math.floor(hrs / 24)}日` : hrs >= 1 ? `${hrs}時間` : `${Math.max(1, Math.ceil(ms / 60e3))}分`;
}

// ---------------- 交換所 ----------------
function shopState() {
  const h = S.house(), m = monthKey();
  const s = h.medalShop || (h.medalShop = { m, b: {} });
  if (s.m !== m) { s.m = m; s.b = {}; }
  return s;
}
// その品物を、あと何回交換できるか（家具は持っていれば0）
export function shopLeft(entry) {
  if (entry.kind === 'item') return S.realOwned(entry.item) > 0 ? 0 : 1;
  return Math.max(0, (entry.monthly || 1) - (shopState().b[entry.id] || 0));
}
// 交換する。戻り値：true / 'medals'（足りない）/ 'limit'（上限）
export function buy(id, { free = false } = {}) {
  const e = SHOP.find(x => x.id === id);
  if (!e) return false;
  if (shopLeft(e) <= 0) return 'limit';
  const h = S.house();
  if (!free && (h.medals || 0) < e.cost) return 'medals';
  if (!free) h.medals -= e.cost;
  const s = shopState(); s.b[e.id] = (s.b[e.id] || 0) + 1;
  if (e.kind === 'item') S.own(e.item, 1);
  else h[HOUSE_KEY[e.kind]] = (h[HOUSE_KEY[e.kind]] || 0) + (e.amount || 1);
  return true;
}

// ---------------- 管理者のためし ----------------
// 今日と今週のミッションを、全部「達成」にする（受け取りは自分で）
export function adminCompleteAll() {
  const st = state();
  for (const m of dailyList()) st.day[m.key] = m.key === 'sids' || m.key === 'pzk' ? ['a', 'b', 'c'].slice(0, m.goal) : m.goal;
  for (const m of WEEKLY[sideKey()]) {
    if (m.key === 'days') st.week.days = Array.from({ length: m.goal }, (_, i) => S.addDays(S.weekKey(), i));
    else if (m.key === 'subOk') st.week.subOk = { a: 10, b: 10, c: 10 };
    else st.week[m.key] = m.goal;
  }
}
// ためしの受け取りを元にもどす（もう一度ためせるように）
export function adminReset() { const p = S.profile(); delete p.mission; }
