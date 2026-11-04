// 記録の保存。端末の中（すぐ読める控え）とネット上（sync.js が送る）の両方に置く。
let KEY = null;
const DAY_START_HOUR = 6; // 1日の区切りは朝6時
export const REVIEW_GAPS = [1, 3, 7]; // 正解するごとに 1日後 → 3日後 → 7日後
export const SET_SIZE = 1; // 1問ずつ（手軽さ重視）
export const BONUS_PER_DAY = 5; // その日の最初の5問はゲージ1.5倍

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
// その週の月曜日（朝6時区切りの日付で）を返す
export function weekKey(d = new Date()) {
  const [y, m, dd] = dayKey(d).split('-').map(Number);
  const t = new Date(y, m - 1, dd);
  const back = (t.getDay() + 6) % 7; // 月曜=0
  return addDays(dayKey(d), -back);
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
// 今日解いた数（ゲージ1.5倍は最初の5問）
export function solvedToday() { const t = state.today; return t && t.day === dayKey() ? t.n : 0; }
function countToday() { const d = dayKey(); if (!state.today || state.today.day !== d) state.today = { day: d, n: 0 }; state.today.n++; }

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
export const MAX_RANK = 100; // いったん Lv100 で頭打ち
export function rankInfo(xp = state.profile?.xp || 0) {
  let rank = 1, rest = xp;
  while (rank < MAX_RANK && rest >= xpToNext(rank)) { rest -= xpToNext(rank); rank++; }
  if (rank >= MAX_RANK) return { rank: MAX_RANK, into: xpToNext(MAX_RANK), need: xpToNext(MAX_RANK), xp, max: true };
  return { rank, into: rest, need: xpToNext(rank), xp };
}
// Lv が上がったときのごほうび：毎回レアチケット、5ごとに★4以上確定、50と100で★5限定チケット
export function rankRewards(L) {
  const r = { ticket: 1, ticket4: 0, ticket5: 0 };
  if (L % 5 === 0) r.ticket4 = 1;
  if (L === 50 || L === 100) r.ticket5 = 1;
  return r;
}
// Lv が上がったごほうびは、プレゼントBOXに届く（自分で受け取る）
function giveRankRewards(from, to) {
  const sum = { ticket: 0, ticket4: 0, ticket5: 0 };
  for (let L = from + 1; L <= to; L++) {
    const r = rankRewards(L);
    sum.ticket += r.ticket; sum.ticket4 += r.ticket4; sum.ticket5 += r.ticket5;
    for (const k of ['ticket', 'ticket4', 'ticket5']) if (r[k]) addGift({ kind: k, amount: r[k], title: `Lv${L} のごほうび`, from: 'rank' });
  }
  return sum;
}

// --- プレゼントBOX ---
// gift = { id, kind: 'ticket'|'ticket4'|'ticket5'|'exchange'|'shards4'|'shards5'|'gauge'|'item', amount, itemId, title, from, at }
const GIFT_KEY = { ticket: 'rareTickets', ticket4: 'rareTickets4', ticket5: 'rareTickets5', exchange: 'tickets', shards4: 'shards4', shards5: 'shards5', gauge: 'gauge' };
export function gifts() { const h = house(); return h.gifts || (h.gifts = []); }
export function addGift(g) {
  const list = gifts();
  if (g.id && list.some(x => x.id === g.id)) return null;
  const gift = { id: g.id || 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: g.at || Date.now(), amount: 1, ...g };
  list.push(gift);
  return gift;
}
export function claimGift(id) {
  const list = gifts();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return null;
  const g = list[i];
  const h = house();
  if (g.kind === 'item') { if (g.itemId) own(g.itemId, g.amount || 1); }
  else if (GIFT_KEY[g.kind]) h[GIFT_KEY[g.kind]] = (h[GIFT_KEY[g.kind]] || 0) + (g.amount || 1);
  list.splice(i, 1);
  return g;
}
// 運営からのプレゼントで、もうBOXに入れた物（2回入らないように）
export function giftSeen(id) { const h = house(); h.giftSeen = h.giftSeen || []; return h.giftSeen.includes(id); }
export function markGiftSeen(id) { const h = house(); h.giftSeen = h.giftSeen || []; if (!h.giftSeen.includes(id)) h.giftSeen.push(id); if (h.giftSeen.length > 300) h.giftSeen.splice(0, h.giftSeen.length - 300); }
// ランク L のちょうど始まりの経験値（管理者がレベルを変えるときに使う）
export function xpAtRank(L) { let x = 0; for (let r = 1; r < L; r++) x += xpToNext(r); return x; }
export function setRank(L) { const p = profile(); p.xp = xpAtRank(Math.max(1, Math.min(MAX_RANK, L))); } // 管理者のためし用（ごほうびは出さない）
// 1つの部屋に置ける家具の数
export function capacity(rank = rankInfo().rank) { return 6 + (rank - 1) * 2; }
// 1問の結果を記録（分野ごとの数・経験値）。戻り値 { gained, rankUp, rank }
export function addAnswer(sub, unit, kind) {
  const p = state.profile || (state.profile = blankProfile());
  const before = rankInfo(p.xp).rank;
  const gained = XP[kind] || 0;
  p.xp += gained;
  p.solved += 1;
  countToday();
  if (kind !== 'wrong') p.correct += 1;
  if (kind === 'perfect') p.perfect += 1;
  const u = (sub.units || (sub.units = {}))[unit] || (sub.units[unit] = { solved: 0, correct: 0, perfect: 0 });
  u.solved += 1;
  if (kind !== 'wrong') u.correct += 1;
  if (kind === 'perfect') u.perfect += 1;
  // 週ごとの解いた数（ランキング用。月曜の朝6時で区切る）
  const wk = weekKey();
  if (!p.week || p.week.key !== wk) p.week = { key: wk, solved: 0, correct: 0 };
  p.week.solved += 1;
  if (kind !== 'wrong') p.week.correct += 1;
  const after = rankInfo(p.xp).rank;
  const rewards = after > before ? giveRankRewards(before, after) : null;
  return { gained, rankUp: after > before, rank: after, rewards };
}
export function profile() { return state.profile || (state.profile = blankProfile()); }

// --- パズルモード ---
// 種類ごとの記録。best＝クリアしたいちばん高い★（その1つ上まで選べる）、last＝前に選んだ★
export const PUZZLE_REWARD = { gauge: [20, 30, 42, 56, 72], xp: [6, 10, 14, 20, 26] };
export function puzzleState(id) {
  const p = profile(); const all = p.puzzle || (p.puzzle = {});
  const ps = all[id] || (all[id] = { best: 0, last: 1, clears: 0, perfect: 0 });
  if (ps.lv != null) { ps.best = Math.min(5, Math.max(ps.best || 0, ps.lv - 1)); ps.last = Math.max(1, ps.best); delete ps.lv; } // 1.4.0 の「レベル」から
  return ps;
}
export const puzzleOpen = (id) => Math.min(5, puzzleState(id).best + 1); // 選べるいちばん高い★
// ゲージ：★が高いほど多い。まちがうと少し減る（半分より下にはならない）
export function puzzleGauge(star, mistakes) { const b = PUZZLE_REWARD.gauge[star - 1]; return Math.max(Math.round(b / 2), b - mistakes * 6); }
// クリアの記録。戻り値は addAnswer と同じ形に { unlocked: 新しく選べるようになった★ } を足したもの
export function addPuzzleClear(id, star, mistakes) {
  const p = profile(), ps = puzzleState(id);
  const before = rankInfo(p.xp).rank;
  const gained = Math.max(2, PUZZLE_REWARD.xp[star - 1] - mistakes * 2);
  p.xp += gained;
  p.puzzleClears = (p.puzzleClears || 0) + 1;
  countToday();
  ps.clears++; if (!mistakes) ps.perfect++;
  const openBefore = puzzleOpen(id);
  if (star > ps.best) ps.best = star;
  const unlocked = puzzleOpen(id) > openBefore ? puzzleOpen(id) : 0;
  const wk = weekKey();
  if (!p.week || p.week.key !== wk) p.week = { key: wk, solved: 0, correct: 0 };
  p.week.puzzle = (p.week.puzzle || 0) + 1;
  if (!mistakes) p.week.perfectPuzzle = (p.week.perfectPuzzle || 0) + 1;
  const after = rankInfo(p.xp).rank;
  const rewards = after > before ? giveRankRewards(before, after) : null;
  return { gained, rankUp: after > before, rank: after, rewards, unlocked };
}

// --- ログインボーナス（30日で1周。5日ごとにレアチケット、30日目は★4以上確定チケット） ---
export function loginBonusDay(n) {
  if (n === 30) return { kind: 'ticket4', label: '★4以上確定チケット' };
  if (n % 5 === 0) return { kind: 'ticket', label: 'レアチケット' };
  return { kind: 'gauge', amount: 1, label: '家具の引きかえ券' };
}
// 今日まだもらっていなければもらう。戻り値 { day, reward } か null
export function claimLoginBonus() {
  const lb = state.loginBonus || (state.loginBonus = { count: 0, last: null });
  const today = dayKey();
  if (lb.last === today) return null;
  lb.count = (lb.count % 30) + 1;
  lb.last = today;
  const reward = loginBonusDay(lb.count);
  const h = house();
  if (reward.kind === 'ticket') h.rareTickets = (h.rareTickets || 0) + 1;
  if (reward.kind === 'ticket4') h.rareTickets4 = (h.rareTickets4 || 0) + 1;
  if (reward.kind === 'gauge') h.tickets = (h.tickets || 0) + reward.amount; // ふつうの日は家具の引きかえ券1枚
  return { day: lb.count, reward };
}

// --- 持ち物・配置 ---
export function own(itemId, n = 1) {
  const h = house();
  h.inventory[itemId] = (h.inventory[itemId] || 0) + n;
  // 図鑑：一度でも手に入れた物の記録（持ち物の数とは別に残す）
  const c = h.collected || (h.collected = {});
  if (!c[itemId]) c[itemId] = Date.now();
}
// 図鑑に載っているか（前の版の持ち物も、持っていれば載せる）
export function collected(itemId) { if (unlimited) return true; const h = house(); return !!(h.collected?.[itemId] || h.inventory[itemId]); }
export function owned(itemId) { return unlimited ? 99 : (house().inventory[itemId] || 0); }
// 管理者：すべての家具・壁紙などを、いくつでも持っている扱いにする（保存はしない）
let unlimited = false;
export function realOwned(itemId) { return house().inventory[itemId] || 0; } // 管理者の無限を除いた、本当に持っている数
export function setUnlimited(on) { unlimited = !!on; }
export function isUnlimited() { return unlimited; }
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
