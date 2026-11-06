// 記録の保存。どの問題が何回・何回正解したか（localStorage）と、記述の答え・写真（IndexedDB）。
// ドライブとのやりとりは cloud.js（state() と merge() を使う）。
import * as mem from './memory.js';
const KEY = 'ts_records_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
let REC = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(REC)); } catch (e) { /* いっぱいでも動きは止めない */ }
  changed();
}
// 記録が変わったらドライブへ送る（cloud.js が登録する）
let listeners = [];
export const onChange = (f) => listeners.push(f);
function changed() { listeners.forEach((f) => { try { f(); } catch (e) { /* */ } }); }

// 1問ごとの記録：n=解いた回数, ok=正解回数, streak=続けて正解した回数, wrong=まちがい復習に入っているか,
// S=記憶の安定度（日）, lt=最後に解いた時（memory.js を参照）
export function record(key, res) {
  const old = REC[key] || null;
  const r = old ? { ...old } : { n: 0, ok: 0, streak: 0, wrong: false };
  r.prev = old ? { ...old, prev: undefined } : null; // 「じつは合っていた」で直せるように
  r.n++;
  if (res === 'ok') { r.ok++; r.streak++; r.wrong = false; }
  else { r.streak = 0; r.wrong = true; }
  const now = Date.now();
  r.S = mem.nextS(old, res, r, now);
  r.last = res; r.t = now; r.lt = now;
  REC[key] = r; save();
  countToday(key.split('/').slice(0, 2).join('/'));
}
// 「じつは合っていた」：直前の答えを正解として記録しなおす
export function fix(key) {
  const r = REC[key]; if (!r) return;
  const old = r.prev || null;
  const n = { ...(old || { n: 0, ok: 0, streak: 0 }) };
  n.n++; n.ok++; n.streak = (old?.streak || 0) + 1; n.wrong = false;
  n.S = mem.nextS(old, 'ok', n, r.t); n.last = 'ok'; n.t = r.t; n.lt = r.t; n.prev = old;
  REC[key] = n; save(); changed();
}
export const get = (key) => REC[key] || null;
export const isWrong = (key) => !!(REC[key] && REC[key].wrong);
export const recall = (key, at) => mem.recall(REC[key], at);
export const isDue = (key, at) => mem.isDue(REC[key], at);
// 覚えている＝いま 90% 以上思い出せる／まちがい＝最後にまちがえた／まだ＝解いていない
export function summary(qs) {
  let mastered = 0, wrong = 0, unseen = 0;
  for (const q of qs) {
    const r = REC[q.key];
    if (!r) unseen++;
    else if (r.wrong) wrong++;
    else if (!mem.isDue(r)) mastered++;
  }
  return { mastered, wrong, unseen };
}
export const all = () => REC;

// ---- ドライブとのやりとり用 ----
export function state() {
  const rec = {};
  for (const [k, r] of Object.entries(REC)) { const { prev, ...rest } = r; rec[k] = rest; }
  return { records: rec, plan: { days: PLAN.days, dates: PLAN.dates, datesAt: PLAN.datesAt || 0 } };
}
// ドライブの記録とこの端末の記録をあわせる（問題ごとに、新しく解いたほうを残す）
export function merge(remote) {
  if (!remote) return;
  let changedAny = false;
  for (const [k, r] of Object.entries(remote.records || {})) {
    const mine = REC[k];
    if (!mine || (r.t || 0) > (mine.t || 0)) { REC[k] = r; changedAny = true; }
  }
  const rp = remote.plan || {};
  for (const [day, tests] of Object.entries(rp.days || {})) {
    const d = (PLAN.days[day] = PLAN.days[day] || {});
    for (const [tk, n] of Object.entries(tests)) if ((d[tk] || 0) < n) { d[tk] = n; changedAny = true; }
  }
  if ((rp.datesAt || 0) > (PLAN.datesAt || 0)) { PLAN.dates = rp.dates || {}; PLAN.datesAt = rp.datesAt; changedAny = true; }
  try { localStorage.setItem(KEY, JSON.stringify(REC)); localStorage.setItem(PKEY, JSON.stringify(PLAN)); } catch (e) { /* */ }
  return changedAny;
}

// ---- 勉強計画のための記録（日ごとに解いた数・その日の目標・テストの日の変更） ----
const PKEY = 'ts_plan_v1';
let PLAN = (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } })();
PLAN.days = PLAN.days || {}; PLAN.targets = PLAN.targets || {}; PLAN.dates = PLAN.dates || {};
function savePlan() { try { localStorage.setItem(PKEY, JSON.stringify(PLAN)); } catch (e) { /* 動きは止めない */ } changed(); }
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function countToday(testKey) {
  const day = (PLAN.days[today()] = PLAN.days[today()] || {});
  day[testKey] = (day[testKey] || 0) + 1; savePlan();
}
export const todayCount = (testKey) => (PLAN.days[today()] || {})[testKey] || 0;
// その日の目標は、その日はじめて計算した数で固定する（解くたびに目標が動かないように）
export function todayTarget(testKey, compute) {
  const k = testKey + '@' + today();
  if (PLAN.targets[k] === undefined) { PLAN.targets[k] = compute(); savePlan(); }
  return PLAN.targets[k];
}
export function resetTarget(testKey) { delete PLAN.targets[testKey + '@' + today()]; savePlan(); }
export const getDate = (testKey) => PLAN.dates[testKey] || null;
export function setDate(testKey, date) { if (date) PLAN.dates[testKey] = date; else delete PLAN.dates[testKey]; PLAN.datesAt = Date.now(); resetTarget(testKey); }

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
  changed();
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
