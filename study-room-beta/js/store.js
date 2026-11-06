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
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// --- 毎日の記録（勉強レポート用。1.12.0）---
// log['YYYY-MM-DD'] = { n: 解いた数, c: 正解, pz: パズルのクリア, u: { '科目|単元': [解いた, 正解] } }。400日より古い日は消す
export function logDay({ sid = null, unit = '', ok = false, pz = false } = {}) {
  const log = state.log || (state.log = {}), d = dayKey();
  const e = log[d] || (log[d] = { n: 0, c: 0, pz: 0, u: {} });
  if (pz) e.pz++;
  if (sid) { e.n++; if (ok) e.c++; const k = `${sid}|${unit || ''}`, a = e.u[k] || (e.u[k] = [0, 0]); a[0]++; if (ok) a[1]++; }
  const keys = Object.keys(log);
  if (keys.length > 400) { const cut = addDays(d, -400); for (const k of keys) if (k < cut) delete log[k]; }
}
export function dayLog() { return state.log || {}; }
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
// ほかの人の連続日数（プロフィールを見る時。streak = { count, last }）
export function streakOf(st) { const today = dayKey(); return st && (st.last === today || st.last === addDays(today, -1)) ? st.count || 0 : 0; }
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

// まちがえた問題（まだ克服していない）。3回続けて正解すると克服になり、外れる（1.12.0）
export function wrongList(sub, problems) {
  return problems.filter(p => { const r = sub.srs[p.id]; return r && r.wrongs > 0 && !r.mastered; });
}
// 1セット：期限の来た復習を優先、残りを新しい問題、それでも足りなければ解いたことのある問題
export function buildSet(sub, problems) {
  const due = shuffle(reviewDue(sub, problems));
  const fresh = shuffle(problems.filter(p => !sub.srs[p.id]?.seen));
  // 1.13.0：もう解いた問題は、今日まだ解いていないものを先に
  const today = dayKey();
  const rest0 = shuffle(problems.filter(p => sub.srs[p.id]?.seen && !due.includes(p)));
  const rest = [...rest0.filter(p => sub.srs[p.id].last !== today), ...rest0.filter(p => sub.srs[p.id].last === today)];
  const pick = [...due, ...fresh, ...rest].slice(0, SET_SIZE);
  return pick.map(p => ({ id: p.id, review: due.includes(p) }));
}

// 結果を記録する。perfect = 文字も公式も一度で正解。戻り値で「克服した」かを返す
export function recordResult(sub, id, perfect, wasReview) {
  const today = dayKey();
  const r = sub.srs[id] || (sub.srs[id] = { stage: -1, due: null, wrongs: 0, rights: 0, mastered: false, seen: false });
  r.seen = true;
  r.last = today;
  if (!perfect) {
    r.lastOk = null;
    r.wrongs++;
    r.stage = 0;
    r.mastered = false;
    r.due = addDays(today, REVIEW_GAPS[0]);
    return { mastered: false };
  }
  r.rights++;
  r.lastOk = today;
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
  // レベルの補填（管理者から。itemId = 'lv:16'）：そのLvのはじめまで経験値を上げる（下がることはない）。
  // Lvが上がった分の「Lvアップのごほうび」（レアチケット・5ごとの★4以上確定・Lv50/100の★5限定）もプレゼントBOXに届く
  if (g.kind === 'item' && /^lv:\d+$/.test(g.itemId || '')) {
    const L = Math.min(MAX_RANK, +g.itemId.slice(3)), p = profile(), before = rankInfo(p.xp || 0).rank;
    p.xp = Math.max(p.xp || 0, xpAtRank(L));
    const after = rankInfo(p.xp).rank;
    if (after > before) giveRankRewards(before, after);
  }
  else if (g.kind === 'item') { if (g.itemId) own(g.itemId, g.amount || 1); }
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
// サイド（1.11.0）：はじめに選んだ目的。'puzzle'＝パズルサイド（勉強とパズルを自由に行き来）、'study'＝スタディサイド（勉強をすると、パズルが遊べる）
export const STUDY_PER_PUZZLE = 5; // スタディサイドは、はじめは正解5問でパズル1回
// 1.12.3：数えるのは正解だけ。その日にパズルが1回ふえるごとに、次に必要な正解の数が5問ずつふえる（5→10→15…、朝6時にもどる）
// サイドは管理者だけが変えられる（「勉強｜パズル」の切りかえ＝mode では変わらない）。
// サイドがまだ記録されていない人は、スタディサイドにする（1.12.3。前は、その時のモードをサイドにしていたので、パズルに切りかえておくとパズルサイドになれた）
export function sideOf() { const p = profile(); if (!p.side) p.side = 'study'; return p.side; }
export const puzzleTickets = () => profile().puzzleTickets || 0;
function ticketDay() { const p = profile(), k = dayKey(); if (p.ticketDay !== k) { p.ticketDay = k; p.ticketsToday = 0; } return p; }
// 次のパズル1回に必要な正解の数（その日に、もう何回ふえたかで決まる）
export const studyNeed = () => STUDY_PER_PUZZLE * ((ticketDay().ticketsToday || 0) + 1);
export const studyToNextPuzzle = () => Math.max(1, studyNeed() - (profile().studyCount || 0));
// 1問答えたら呼ぶ（ok = 正解）。パズルが1回ふえたら 1 を返す
export function countStudyForPuzzle(ok = true) {
  if (!ok || sideOf() !== 'study') return 0;
  const p = ticketDay(), need = studyNeed();
  p.studyCount = (p.studyCount || 0) + 1;
  if (p.studyCount < need) return 0;
  p.studyCount = 0;
  p.ticketsToday = (p.ticketsToday || 0) + 1;
  p.puzzleTickets = (p.puzzleTickets || 0) + 1;
  return 1;
}
export function usePuzzleTicket() { const p = profile(); if (!(p.puzzleTickets > 0)) return false; p.puzzleTickets--; return true; }
// ランキングのポイント（勉強もパズルも、もらったゲージの数をそのまま足す）。週ごと（月曜の朝6時で区切る）と、これまでの合計
export function addPoints(pts) {
  if (!(pts > 0)) return;
  const p = profile(), wk = weekKey();
  if (!p.week || p.week.key !== wk) p.week = { key: wk, solved: 0, correct: 0 };
  p.week.points = (p.week.points || 0) + pts;
  p.points = (p.points || 0) + pts;
}
export const weekPoints = () => { const w = profile().week; return w && w.key === weekKey() ? w.points || 0 : 0; };

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
  logDay({ pz: true });
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
// ゲージ（1.12.3）：正解した問題に、かかった時間に比例してたまる（どの教科も、1分あたりはほぼ同じ）。
// 画面では「むずかしい問題ほど多くたまる」と出す。放っておいてもふえないよう、教科ごとに上限の秒数がある。
export const GAUGE_PER_SEC = 1.5;
export const GAUGE_MIN_SEC = 8;
export const GAUGE_CAP_SEC = { jp: 45, social: 45, english: 45, chem: 75, bio: 75, earth: 75, math: 120, physics4: 120, physics: 180 };
export function gaugePoints(perfect, step1Miss, seconds, sid) {
  const cap = GAUGE_CAP_SEC[sid] || 60;
  const t = Math.min(cap, Math.max(GAUGE_MIN_SEC, seconds || 0));
  const pts = t * GAUGE_PER_SEC;
  if (perfect) return Math.round(pts);
  if (step1Miss) return Math.round(pts / 2); // 物理（公式）で、とちゅうでまちがえた時は半分
  return Math.round(pts * WRONG_RATE); // まちがえても、考えた時間の3割（1.13.0）
}
export const WRONG_RATE = 0.3;

// ===== 教科ごとの倍率と「同じものを続けると減る」（1.13.0） =====
// 倍率：この7日間の記録で、教科ごとに決める（やっていない ×1.3・苦手 ×1.2・やりすぎ ×0.9。2つ当てはまればかけ合わせ）
export const MULT = { none: 1.3, weak: 1.2, over: 0.9 };
export function subjectMults(sids, today = dayKey()) {
  const log = state.log || {}, by = {}; let total = 0;
  for (let i = 0; i < 7; i++) {
    const e = log[addDays(today, -i)];
    if (!e?.u) continue;
    for (const [k, [n, c]] of Object.entries(e.u)) { const sid = k.split('|')[0], b = by[sid] || (by[sid] = [0, 0]); b[0] += n; b[1] += c; total += n; }
  }
  const out = {};
  for (const sid of sids) {
    const [n, c] = by[sid] || [0, 0];
    const why = [];
    let m = 1;
    if (!n) { m *= MULT.none; why.push('none'); }
    else if (total >= 30) {
      if (n >= 5 && c / n < 0.6) { m *= MULT.weak; why.push('weak'); }
      if (n / total >= 0.4) { m *= MULT.over; why.push('over'); }
    }
    out[sid] = { mult: Math.round(m * 100) / 100, why, n, rate: n ? c / n : null };
  }
  return out;
}
// 同じものを続けると減る：その日（朝6時区切り）に、その教科をやった時間・その単元で解いた数で決める。教科と単元はかけ合わせる
export function subjectDecay(min) { return min < 20 ? 1 : min < 40 ? 0.7 : 0.4; }
export function unitDecay(count) { return count < 15 ? 1 : count < 30 ? 0.7 : 0.4; }
// 今日の使い方（答える前の値）
export function todayUse(sid, unit) {
  const e = (state.log || {})[dayKey()] || {};
  return { min: ((e.t || {})[sid] || 0) / 60, count: ((e.u || {})[`${sid}|${unit || ''}`] || [0])[0] };
}
// その日にもう正解した問題を、もう一度正解した時は3割
export const REPEAT_RATE = 0.3;
// 1問のゲージの倍率をまとめて出す。戻り値 { f: かける数, decayed: 減っているか, mult: 教科の倍率, repeat }
export function gaugeFactor({ sid, unit, sub, id, sids }) {
  const u = todayUse(sid, unit);
  const sd = subjectDecay(u.min), ud = unitDecay(u.count);
  const ms = subjectMults(sids || [sid]);
  const mult = ms[sid]?.mult || 1;
  const r = sub?.srs?.[id];
  const repeat = !!(r && r.lastOk === dayKey());
  const f = mult * sd * ud * (repeat ? REPEAT_RATE : 1);
  return { f, mult, decayed: sd < 1 || ud < 1, subjDecayed: sd < 1, unitDecayed: ud < 1, repeat };
}
// 答えた時間を記録する（今日の教科ごとの秒数と、単元ごとの合計秒数・問題数）
export function logTime(sid, unit, secs) {
  const t = Math.min(600, Math.max(0, secs || 0));
  const log = state.log || (state.log = {}), d = dayKey();
  const e = log[d] || (log[d] = { n: 0, c: 0, pz: 0, u: {} });
  const tt = e.t || (e.t = {}); tt[sid] = Math.round((tt[sid] || 0) + t);
  const p = profile(), q = p.qtime || (p.qtime = {}), k = `${sid}|${unit || ''}`, a = q[k] || (q[k] = [0, 0]);
  a[0] = Math.round(a[0] + t); a[1]++;
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
