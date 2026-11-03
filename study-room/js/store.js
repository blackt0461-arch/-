// 記録の保存。端末の中（すぐ読める控え）とネット上（sync.js が送る）の両方に置く。
let KEY = null;
const DAY_START_HOUR = 6; // 1日の区切りは朝6時
export const REVIEW_GAPS = [1, 3, 7]; // 正解するごとに 1日後 → 3日後 → 7日後
export const SET_SIZE = 5;

function blank() {
  return {
    version: 1,
    streak: { count: 0, last: null, total: 0 },
    profile: blankProfile(),
    subjects: {},
    house: blankHouse(),
  };
}
// 経験値とランク
function blankProfile() {
  return { xp: 0, solved: 0, correct: 0, perfect: 0 };
}
// 家はどの科目でも共通（どの科目を解いても同じ家が育つ）
// 家具は「買う → 持ち物に入る → 部屋に置く」。置ける数はランクで決まる
function blankHouse() {
  return {
    v: 2,
    gauge: 0,
    unlocks: 0,       // これまでに買った数（ゲージの大きさに使う）
    tickets: 0,       // ゲージなしで1つ買える券（前の版で選んだ家具の分を返したもの）
    inventory: {},    // 持っている家具 { itemId: 個数 }
    rooms: [],        // [{ id, style, surf: { wall, floor, door, window, curtain }, placed: [配置] }]
    current: 0,       // いま見ている部屋
    nextUid: 1,
    specialsGiven: 0,
    pendingSpecials: 0, // まだ受け取っていない特別な家具
  };
}
// 配置：{ uid, item, x, z, y, rot, wall }  wall = '+x' '-x' '-z' '+z'（壁に掛ける物）
function blankSubject() {
  return {
    srs: {},        // 問題ID → { stage, due, wrongs, rights, mastered, seen }
    units: {},      // 分野 → { solved, correct, perfect }
    session: null,  // 途中のセット（アプリを閉じても続きから）
  };
}

let state = blank();

// ログインしたユーザーの記録に切り替える
export function useUser(name) {
  KEY = 'studyroom.v1.user.' + name;
  state = load();
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return migrate(s);
  } catch (e) { /* 読めないときは新しく作る */ }
  return blank();
}
// 以前は科目ごとに家があったので、1つの家にまとめる
function migrate(s) {
  if (!s.house) {
    const old = Object.values(s.subjects || {}).find(x => x.rooms && x.rooms.length);
    s.house = blankHouse();
    if (old) for (const k of Object.keys(s.house)) if (old[k] !== undefined) s.house[k] = old[k];
  }
  for (const x of Object.values(s.subjects || {})) {
    for (const k of ['gauge', 'unlocks', 'rooms', 'current', 'specialsGiven', 'pendingSpecials']) delete x[k];
    x.units = x.units || {};
  }
  s.profile = s.profile || blankProfile();
  // 家のしくみ v2（持ち物と自由配置）。前の版で選んだ家具の数だけ「1つ買える券」を返す
  const h = s.house;
  if (h && h.v !== 2) {
    const old = h;
    s.house = blankHouse();
    s.house.gauge = old.gauge || 0;
    s.house.tickets = old.unlocks || 0;
    s.house.specialsGiven = 0;
    s.house.pendingSpecials = (old.specialsGiven || 0) + (old.pendingSpecials || 0);
    const STYLE = { natural: 'natural', industrial: 'industrial', retro: 'retro', music: 'retro', manga: 'natural', game: 'industrial' };
    s.house.rooms = (old.rooms || []).map(r => ({ id: r.id, style: STYLE[r.dir] || null, surf: null, placed: [] }));
    s.house.current = Math.min(old.current || 0, Math.max(0, s.house.rooms.length - 1));
  }
  return s;
}
export function house() { return state.house || (state.house = blankHouse()); }
// ネットから受け取った記録に置きかえる（ネットへは送り返さない）
export function replaceState(s) {
  state = migrate(s);
  writeLocal();
}
function writeLocal() {
  if (!KEY) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境 */ }
}
let onSave = null;
export function setSaveHook(fn) { onSave = fn; }

export function save() {
  if (!KEY) return;
  state.savedAt = Date.now();
  writeLocal();
  onSave && onSave();
}
export function getState() { return state; }
export function subject(id) {
  if (!state.subjects[id]) state.subjects[id] = blankSubject();
  return state.subjects[id];
}

// 「今日」を朝6時区切りの日付文字列で返す
export function dayKey(d = new Date()) {
  const t = new Date(d.getTime() - DAY_START_HOUR * 3600e3);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// 連続日数：1問以上解いた日を数える
export function markPlayedToday() {
  const today = dayKey();
  const s = state.streak;
  if (s.last === today) return false;
  s.count = s.last === addDays(today, -1) ? s.count + 1 : 1;
  s.last = today;
  s.total += 1;
  return true;
}
export function currentStreak() {
  const s = state.streak;
  const today = dayKey();
  if (s.last === today || s.last === addDays(today, -1)) return s.count;
  return 0;
}
export function playedToday() { return state.streak.last === dayKey(); }

// --- 復習 ---
export function reviewDue(sub, problems) {
  const today = dayKey();
  return problems.filter(p => {
    const r = sub.srs[p.id];
    return r && !r.mastered && r.stage >= 0 && r.due && r.due <= today;
  });
}
export function stats(sub, problems) {
  let waiting = 0, mastered = 0, seen = 0;
  for (const p of problems) {
    const r = sub.srs[p.id];
    if (!r) continue;
    if (r.seen) seen++;
    if (r.mastered) mastered++;
    else if (r.due) waiting++;
  }
  return { waiting, mastered, seen, total: problems.length, due: reviewDue(sub, problems).length };
}

// 1セット：期限の来た復習を優先、残りを新しい問題、それでも足りなければ解いたことのある問題
export function buildSet(sub, problems) {
  const due = shuffle(reviewDue(sub, problems));
  const fresh = shuffle(problems.filter(p => !sub.srs[p.id]?.seen));
  const rest = shuffle(problems.filter(p => sub.srs[p.id]?.seen && !due.includes(p)));
  const pick = [...due, ...fresh, ...rest].slice(0, SET_SIZE);
  return pick.map(p => ({ id: p.id, review: due.includes(p) }));
}

// 結果を記録する。perfect = 文字も公式も一度で正解。戻り値で「克服した」かを返す
export function recordResult(sub, id, perfect, wasReview) {
  const today = dayKey();
  const r = sub.srs[id] || (sub.srs[id] = { stage: -1, due: null, wrongs: 0, rights: 0, mastered: false, seen: false });
  r.seen = true;
  if (!perfect) {
    r.wrongs++;
    r.stage = 0;
    r.mastered = false;
    r.due = addDays(today, REVIEW_GAPS[0]);
    return { mastered: false };
  }
  r.rights++;
  if (wasReview && r.stage >= 0 && !r.mastered) {
    r.stage++;
    if (r.stage >= 3) {
      r.mastered = true; r.due = null;
      return { mastered: true };
    }
    r.due = addDays(today, REVIEW_GAPS[r.stage]);
  }
  return { mastered: false };
}

// --- 経験値・ランク ---
// 正解のほうが多く入る。やり直し（確認）は入らない
export const XP = { perfect: 12, ok: 8, wrong: 4 };
// ランク L から L+1 に必要な経験値（だんだん増える）
export function xpToNext(rank) { return 30 + (rank - 1) * 20; }
export function rankInfo(xp = state.profile?.xp || 0) {
  let rank = 1, rest = xp;
  while (rest >= xpToNext(rank)) { rest -= xpToNext(rank); rank++; }
  return { rank, into: rest, need: xpToNext(rank), xp };
}
// 1つの部屋に置ける家具の数
export function capacity(rank = rankInfo().rank) { return 6 + (rank - 1) * 2; }
// 1問の結果を記録（分野ごとの数・経験値）。戻り値 { gained, rankUp, rank }
export function addAnswer(sub, unit, kind) {
  const p = state.profile || (state.profile = blankProfile());
  const before = rankInfo(p.xp).rank;
  const gained = XP[kind] || 0;
  p.xp += gained;
  p.solved += 1;
  if (kind !== 'wrong') p.correct += 1;
  if (kind === 'perfect') p.perfect += 1;
  const u = (sub.units || (sub.units = {}))[unit] || (sub.units[unit] = { solved: 0, correct: 0, perfect: 0 });
  u.solved += 1;
  if (kind !== 'wrong') u.correct += 1;
  if (kind === 'perfect') u.perfect += 1;
  const after = rankInfo(p.xp).rank;
  return { gained, rankUp: after > before, rank: after };
}
export function profile() { return state.profile || (state.profile = blankProfile()); }

// --- 持ち物・配置 ---
export function own(itemId, n = 1) {
  const inv = house().inventory;
  inv[itemId] = (inv[itemId] || 0) + n;
}
export function owned(itemId) { return house().inventory[itemId] || 0; }
// 部屋に置いている数（持ち物の個数より多くは置けない）
export function placedCount(itemId) {
  let n = 0;
  for (const r of house().rooms) for (const p of r.placed || []) if (p.item === itemId) n++;
  return n;
}
export function newUid() { const h = house(); return h.nextUid++; }

// --- ゲージ ---
export function gaugeMax(sub) {
  return Math.min(60 + sub.unlocks * 12, 150);
}
export function gaugePoints(perfect, step1Miss, seconds) {
  if (!perfect && !step1Miss) return 0; // 公式を間違えたら、たまらない（減りもしない）
  let pts = perfect ? 22 : 10;
  if (perfect && seconds <= 20) pts += 8;       // 早いとボーナス
  else if (perfect && seconds <= 35) pts += 4;
  return pts;
}

// 記録の書き出し・読み込み（予備）
export function exportJSON() { return JSON.stringify(state); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || s.version !== 1) throw new Error('形式がちがいます');
  state = s; save();
}
export function resetAll() { state = blank(); save(); }

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
export { shuffle };
