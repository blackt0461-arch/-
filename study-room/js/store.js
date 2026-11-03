// 記録の保存（いまは端末の中にユーザーごと。あとでネット上に切り替える）
let KEY = null;
const DAY_START_HOUR = 6; // 1日の区切りは朝6時
export const REVIEW_GAPS = [1, 3, 7]; // 正解するごとに 1日後 → 3日後 → 7日後
export const SET_SIZE = 5;

function blank() {
  return {
    version: 1,
    streak: { count: 0, last: null, total: 0 },
    subjects: {},
    house: blankHouse(),
  };
}
// 家はどの科目でも共通（どの科目を解いても同じ家が育つ）
function blankHouse() {
  return {
    gauge: 0,
    unlocks: 0,     // これまでに解放した数（ゲージの大きさに使う）
    rooms: [],      // [{ id, dir, items: { kindId: variantIndex }, specials: [index] }]
    current: 0,     // いま見ている部屋
    specialsGiven: 0,
    pendingSpecials: 0, // まだ置いていない特別な家具
  };
}
function blankSubject() {
  return {
    srs: {},        // 問題ID → { stage, due, wrongs, rights, mastered, seen }
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
  }
  return s;
}
export function house() { return state.house || (state.house = blankHouse()); }
export function replaceState(s) { state = migrate(s); save(); }

export function save() {
  if (!KEY) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境 */ }
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
