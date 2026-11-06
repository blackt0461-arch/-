// 記録の保存。どの問題が何回・何回正解したか（localStorage）と、記述の答え・写真（IndexedDB）。
// ドライブへの保存は次の版で足す（このファイルの中だけを変えればよい形にしておく）。
const KEY = 'ts_records_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
let REC = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(REC)); } catch (e) { /* いっぱいでも動きは止めない */ }
}

// 1問ごとの記録：n=解いた回数, ok=正解回数, streak=続けて正解した回数, wrong=まちがい復習に入っているか
export function record(key, res) {
  const r = REC[key] || { n: 0, ok: 0, streak: 0, wrong: false };
  r.n++;
  if (res === 'ok') { r.ok++; r.streak++; if (r.streak >= 1) r.wrong = false; }
  else { r.streak = 0; r.wrong = true; }
  r.last = res; r.t = Date.now();
  REC[key] = r; save();
  countToday(key.split('/').slice(0, 2).join('/'));
}
// 「じつは合っていた」：直前のまちがいを正解に直す
export function fix(key) {
  const r = REC[key]; if (!r) return;
  r.ok++; r.streak = 1; r.wrong = false; r.last = 'ok'; save();
}
export const get = (key) => REC[key] || null;
export const isWrong = (key) => !!(REC[key] && REC[key].wrong);
// できた＝最後に正解していて、まちがい復習に入っていない
export function summary(qs) {
  let mastered = 0, wrong = 0, unseen = 0;
  for (const q of qs) {
    const r = REC[q.key];
    if (!r) unseen++;
    else if (r.wrong) wrong++;
    else if (r.last === 'ok') mastered++;
  }
  return { mastered, wrong, unseen };
}
export const all = () => REC;

// ---- 勉強計画のための記録（日ごとに解いた数・その日の目標・テストの日の変更） ----
const PKEY = 'ts_plan_v1';
let PLAN = (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } })();
PLAN.days = PLAN.days || {}; PLAN.targets = PLAN.targets || {}; PLAN.dates = PLAN.dates || {};
function savePlan() { try { localStorage.setItem(PKEY, JSON.stringify(PLAN)); } catch (e) { /* 動きは止めない */ } }
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
export function setDate(testKey, date) { if (date) PLAN.dates[testKey] = date; else delete PLAN.dates[testKey]; resetTarget(testKey); }

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
      tx.objectStore('answers').add({ ...a, t: Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { alert('答えを保存できませんでした'); }
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
