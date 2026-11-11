// 記録の保存（1.6.0〜）
//
// 「いつ・どの問題を・どう答えたか」を1回ずつ「できごと」として残し、問題ごとの状態（回数・正解数・
// 記憶の安定度 S など）は、できごとを古い順にたどって計算しなおす。
// こうしておくと、スマホとタブレットで別々に解いても、できごとを足し合わせるだけで記録が1つにまとまる。
//
// ぜんぶを1つの表 ALL（キー → 値）に入れる。値にはかならず t（最後に変えた時刻）があり、
// ドライブ（server/Code.gs）は「キーごとに t が新しいほう」を残してあわせる。キーの種類：
//   ev/<端末>/<番号>  できごと {q:問題, r:ok/mid/ng, at:答えた時刻, h:使ったヒント数, src}
//   ★/<問題>          ⭐あとで見る {on}
//   採/<答えのuid>     Claude の採点 {grade, score, comment, missing, better, q}
//   tg/<テスト>@<日>   その日の目標の問題数 {n}
//   dt/<テスト>        テストの日を変えたとき {date}
//   dy/<日>            1.6.0 より前に数えていた日ごとの問題数 {n:{テスト:数}}
//   ls/<授業>          授業をどこまで見たか {last:スライド番号, done:見終わったか, doneAt:見終わった時刻}
//   pl/<テスト>        成長グラフの目標の線（はじめて計画を出した日に決めて、動かさない）
//   <問題>（記号なし）  1.6.0 より前の問題ごとの状態。ここから先のできごとを足していく
//
// 記述の答え・写真は IndexedDB。ドライブとのやりとりは cloud.js（state()・merge()・sent()）。
import * as mem from './memory.js';

const AKEY = 'ts_all_v2', DKEY = 'ts_dirty_v2';
const PRE = ['ev/', '★/', '採/', 'tg/', 'dt/', 'dy/', 'ls/', 'pl/'];
const isLegacy = (k) => !PRE.some((p) => k.startsWith(p));
const testOf = (q) => q.split('/').slice(0, 2).join('/');
const dateKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const today = () => dateKey(Date.now());

function readLS(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* いっぱいでも動きは止めない */ } }

// この端末の名前（できごとのキーが端末どうしでぶつからないように）
const DEV = (() => {
  let d = null;
  try { d = localStorage.getItem('ts_dev'); } catch (e) { /* */ }
  if (!d) { d = Math.random().toString(36).slice(2, 8); try { localStorage.setItem('ts_dev', d); } catch (e) { /* */ } }
  return d;
})();

let ALL = readLS(AKEY, null);
const DIRTY = new Set(readLS(DKEY, []));
// ---- 1.6.0 より前の記録を引っ越す ----
if (!ALL) {
  ALL = {};
  const old = readLS('ts_records_v1', {});
  for (const [k, r] of Object.entries(old)) { const { prev, ...rest } = r; ALL[k] = rest; } // 問題の状態と ★/
  const plan = readLS('ts_plan_v1', {});
  for (const [day, tests] of Object.entries(plan.days || {})) ALL['dy/' + day] = { n: tests, t: 1 };
  for (const [tk, date] of Object.entries(plan.dates || {})) ALL['dt/' + tk] = { date, t: plan.datesAt || 1 };
  for (const [k, n] of Object.entries(plan.targets || {})) ALL['tg/' + k] = { n, t: 1 };
  Object.keys(ALL).forEach((k) => DIRTY.add(k));
  writeLS(AKEY, ALL); writeLS(DKEY, [...DIRTY]);
}
let seq = Object.keys(ALL).filter((k) => k.startsWith(`ev/${DEV}/`)).reduce((m, k) => Math.max(m, +k.split('/')[2] || 0), 0);

const listeners = [];
export const onChange = (f) => listeners.push(f);
const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { /* */ } });
function put(k, v) {
  ALL[k] = v; DIRTY.add(k); dirtyCalc = true;
  writeLS(AKEY, ALL); writeLS(DKEY, [...DIRTY]);
  notify();
}

// ---- できごとから、問題ごとの状態を計算しなおす ----
let REC = {}, EVENTS = [], dirtyCalc = true;
function step(r, res, at) {
  const old = r && r.n ? r : null;
  const n = old ? { ...old } : { n: 0, ok: 0, streak: 0, wrong: false };
  n.n++;
  if (res === 'ok') { n.ok++; n.streak++; n.wrong = false; }
  else { n.streak = 0; n.wrong = true; }
  n.S = mem.nextS(old, res, n, at);
  n.last = res; n.t = at; n.lt = at;
  return n;
}
function calc() {
  if (!dirtyCalc) return;
  dirtyCalc = false;
  REC = {};
  for (const [k, v] of Object.entries(ALL)) if (isLegacy(k) && v && v.n) REC[k] = { ...v };
  EVENTS = Object.entries(ALL).filter(([k, v]) => k.startsWith('ev/') && v && v.q).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.at - b.at);
  for (const e of EVENTS) {
    const base = ALL[e.q]; // 引っ越し前の状態。それより前のできごとは、もう数えてある
    if (base && base.n && e.at <= (base.t || 0)) continue;
    REC[e.q] = step(REC[e.q], e.r, e.at);
  }
}

// ---- 答えたとき ----
// opt.h：使ったヒントの数、opt.src：'claude'（Claude の採点の反映）など
const lastEvent = {};
export function record(key, res, opt = {}) {
  const at = Date.now();
  seq++;
  const id = `ev/${DEV}/${seq}`;
  const ev = { q: key, r: res, at, t: at };
  if (opt.h) ev.h = opt.h;
  if (opt.src) ev.src = opt.src;
  if (opt.solved) ev.s = 1; // ヒントを使って正解した
  lastEvent[key] = id;
  put(id, ev);
}
// 「じつは合っていた」：直前の答えを正解に直す（できごとを書きかえる。t を新しくするとドライブでも上書きされる）
export function fix(key) {
  const id = lastEvent[key];
  if (!id || !ALL[id]) return;
  put(id, { ...ALL[id], r: 'ok', t: Date.now() });
}

export const get = (key) => { calc(); return REC[key] || null; };
export const seen = (key) => { calc(); return !!(REC[key] && REC[key].n); };
export const isWrong = (key) => { calc(); return !!(REC[key] && REC[key].wrong); };
// 最後にまちがえた問題は、答えを見た直後でも「覚えている」とは言えないので、50% までしか数えない
export const recall = (key, at) => { calc(); const r = REC[key]; const v = mem.recall(r, at); return r && r.wrong ? Math.min(v, 0.5) : v; };
export const isDue = (key, at) => { calc(); return mem.isDue(REC[key], at); };
// 覚えている＝いま 90% 以上思い出せる／まちがい＝最後にまちがえた／まだ＝解いていない
export function summary(qs) {
  calc();
  let mastered = 0, wrong = 0, unseen = 0;
  for (const q of qs) {
    const r = REC[q.key];
    if (!r || !r.n) unseen++;
    else if (r.wrong) wrong++;
    else if (!mem.isDue(r)) mastered++;
  }
  return { mastered, wrong, unseen };
}
// できごとの一覧（ふりかえりレポート用）。Claude の採点の反映はふくめない
export function events() { calc(); return EVENTS.filter((e) => e.src !== 'claude'); }

// ---- ⭐あとで見る ----
export const starred = (key) => !!(ALL['★/' + key] && ALL['★/' + key].on);
export function toggleStar(key) { put('★/' + key, { on: !starred(key), t: Date.now() }); return starred(key); }

// ---- 授業をどこまで見たか ----
export const lesson = (key) => ALL['ls/' + key] || null;
export function setLesson(key, last, done) {
  const o = ALL['ls/' + key] || {};
  const d = !!(o.done || done);
  // 見終わった時刻は最初の1回だけ残す（あとで見直しても動かない）。古い記録は t を使う
  const doneAt = o.doneAt || (o.done ? o.t : d ? Date.now() : undefined);
  if (o.last === last && o.done === d && o.doneAt === doneAt) return;
  put('ls/' + key, { last, done: d, ...(doneAt ? { doneAt } : {}), t: Date.now() });
}
export const lessonDoneAt = (key) => { const o = ALL['ls/' + key]; return o && o.done ? o.doneAt || o.t || null : null; };

// ---- 成長グラフの目標の線 ----
export const planBase = (testKey) => ALL['pl/' + testKey] || null;
export function setPlanBase(testKey, v) { put('pl/' + testKey, { ...v, t: Date.now() }); }
// ある時刻に「覚えていた」（思い出せる確率 90% 以上）問題の数。できごとをその時刻までたどって計算する
export function rememberedAt(keys, T) {
  calc();
  const R = {};
  for (const [k, v] of Object.entries(ALL)) if (isLegacy(k) && v && v.n && (v.t || 0) <= T) R[k] = { ...v };
  for (const e of EVENTS) {
    if (e.at > T) break;
    const base = ALL[e.q];
    if (base && base.n && e.at <= (base.t || 0)) continue;
    R[e.q] = step(R[e.q], e.r, e.at);
  }
  let n = 0;
  for (const k of keys) { const r = R[k]; if (r && r.n && !r.wrong && mem.recall(r, T) >= mem.GOAL) n++; }
  return n;
}

// ---- Claude の採点（答えの uid ごと） ----
export const grade = (uid) => ALL['採/' + uid] || null;
export const grades = () => Object.entries(ALL).filter(([k]) => k.startsWith('採/')).map(([k, v]) => ({ uid: k.slice(2), ...v }));

// ---- 日ごとの問題数 ----
export function dayTotals() {
  calc();
  const out = {};
  for (const [k, v] of Object.entries(ALL)) if (k.startsWith('dy/')) out[k.slice(3)] = Object.values(v.n || {}).reduce((a, b) => a + b, 0);
  for (const e of EVENTS) if (e.src !== 'claude') { const d = dateKey(e.at); out[d] = (out[d] || 0) + 1; }
  return out;
}
export function todayCount(testKey) {
  calc();
  const d = today();
  let n = (ALL['dy/' + d]?.n || {})[testKey] || 0;
  for (const e of EVENTS) if (e.src !== 'claude' && dateKey(e.at) === d && testOf(e.q) === testKey) n++;
  return n;
}
// その日の目標は、その日はじめて計算した数で固定する（どの端末でも、先にドライブに入った数を使う）
export function todayTarget(testKey, compute) {
  const k = 'tg/' + testKey + '@' + today();
  if (!ALL[k]) put(k, { n: compute(), t: 1 });
  else if (ALL[k].n == null) put(k, { n: compute(), t: (ALL[k].t || 1) + 1 });
  return ALL[k].n;
}
// ---- テストの日を変えたとき（その日の目標も計算しなおす） ----
export const getDate = (testKey) => ALL['dt/' + testKey]?.date || null;
export const getDateAt = (testKey) => ALL['dt/' + testKey]?.t || 0; // テストの日を手で変えた時刻
export function setDate(testKey, date) {
  const now = Date.now();
  ALL['tg/' + testKey + '@' + today()] = { n: null, t: now }; DIRTY.add('tg/' + testKey + '@' + today());
  put('dt/' + testKey, { date: date || null, t: now });
}

// ---- ドライブとのやりとり用 ----
// 送るのは、まだドライブに入っていない（変えた）ものだけ
export function state() {
  const records = {};
  for (const k of DIRTY) if (ALL[k] !== undefined) records[k] = ALL[k];
  return { records, plan: {} };
}
// 送ったものが、送ったあとに変わっていなければ「送りずみ」にする
export function sent(st) {
  for (const [k, v] of Object.entries(st.records || {})) if (ALL[k] === v) DIRTY.delete(k);
  writeLS(DKEY, [...DIRTY]);
}
// ドライブの記録とあわせる（キーごとに t が新しいほう）
export function merge(remote) {
  if (!remote) return false;
  let changedAny = false;
  for (const [k, r] of Object.entries(remote.records || {})) {
    if (!r) continue;
    const mine = ALL[k];
    if (!mine || (r.t || 0) > (mine.t || 0) || (k.startsWith('tg/') && mine.n !== r.n && (r.t || 0) >= (mine.t || 0) && !DIRTY.has(k))) {
      ALL[k] = r; changedAny = true;
    }
  }
  if (changedAny) { dirtyCalc = true; writeLS(AKEY, ALL); }
  return changedAny;
}

// ---- 記述の答え（写真も入るので IndexedDB） ----
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const o = indexedDB.open('test-study', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
      o.onsuccess = () => res(o.result);
      o.onerror = () => rej(o.error);
    });
  }
  return dbp;
}
export async function saveAnswer(a) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('answers', 'readwrite');
      tx.objectStore('answers').add({ ...a, t: Date.now(), uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), synced: false });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { alert('答えを保存できませんでした'); }
  notify();
}
export async function markSynced(id) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const st = d.transaction('answers', 'readwrite').objectStore('answers');
      const g = st.get(id);
      g.onsuccess = () => { const a = g.result; if (a) { a.synced = true; st.put(a); } res(); };
      g.onerror = () => rej(g.error);
    });
  } catch (e) { /* 次の機会にもう一度送る */ }
}
export async function listAnswers() {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const rq = d.transaction('answers').objectStore('answers').getAll();
      rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
    });
  } catch (e) { return []; }
}

// 写真を小さくする（長い辺 1600px・JPEG）
export async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', 0.8));
  } catch (e) { return file; }
}
