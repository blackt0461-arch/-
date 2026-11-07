// 期間限定イベント（1.12.0）。期間中、問題やパズルで「ポイント」を集めると、集めた数に応じてごほうびがもらえる。
// ごほうびはプレゼントBOXに届く。イベントの家具はガチャからは出ない（gacha.js の series: 'event'）。
// 新しいイベントを足すときは、EVENTS に1つ足すだけ（期間は朝6時区切りの日付で、start〜end の両日をふくむ）。
import * as S from './store.js';

// 第1回の「ウィンターフェス」は取りやめ（1.12.1）。12月は「冬のカフェ」（企画担当。前の家具3つもごほうびに使う）。
// icon：部屋のボタンの線のアイコン（なければ雪の結晶）。title：ぜんぶ受け取ると手に入る記念の称号（profile.js の TITLES）。
// 足すときは、下の形で1つ入れる：
// { id: 'winter2026', name: 'ウィンターフェス', unit: '雪の結晶', desc: '…', start: '2026-12-01', end: '2026-12-25',
//   rewards: [{ at: 10, kind: 'ticket', amount: 2 }, { at: 30, kind: 'item', item: 'ev-gift-pile' }, …] }
export const EVENTS = [
  { id: 'wintercafe2026', name: '冬のカフェ', unit: 'マシュマロ', icon: 'mug', title: 'ev-wintercafe2026',
    desc: '雪の日の、あたたかいカフェ。問題やパズルでマシュマロを集めて、部屋をカフェのように飾ろう。',
    start: '2026-12-01', end: '2026-12-28',
    rewards: [
      { at: 10, kind: 'ticket', amount: 1 },
      { at: 30, kind: 'item', item: 'ev-gift-pile' },
      { at: 60, kind: 'item', item: 'ev-cocoa-counter' },
      { at: 100, kind: 'ticket4', amount: 1 },
      { at: 150, kind: 'item', item: 'ev-snowman' },
      { at: 200, kind: 'item', item: 'ev-ginger-house' },
      { at: 250, kind: 'ticket', amount: 3 },
      { at: 300, kind: 'item', item: 'ev-snow-garland' },
      { at: 350, kind: 'item', item: 'ev-xmas-tree' },
      { at: 400, kind: 'item', item: 'ev-cafe-sign' },
    ] },
];
// ポイント：問題は正解2・まちがい1、パズルはえらんだ★の数
export const POINTS = { right: 2, wrong: 1 };

// 管理者は、期間の前でも「ためす」で中身を見られる（その端末だけ）
let preview = null;
try { preview = localStorage.getItem('studyroom.eventPreview'); } catch (e) { /* なし */ }
export function setPreview(id) { preview = id || null; try { if (id) localStorage.setItem('studyroom.eventPreview', id); else localStorage.removeItem('studyroom.eventPreview'); } catch (e) { /* なし */ } }
export const previewing = () => preview;

export function activeEvent(today = S.dayKey()) {
  return EVENTS.find(e => e.id === preview) || EVENTS.find(e => today >= e.start && today <= e.end) || null;
}
export function upcomingEvent(today = S.dayKey()) { return EVENTS.filter(e => e.start > today).sort((a, b) => a.start < b.start ? -1 : 1)[0] || null; }
export function daysLeft(ev, today = S.dayKey()) {
  const d = (k) => { const [y, m, dd] = k.split('-').map(Number); return Date.UTC(y, m - 1, dd) / 864e5; };
  return Math.max(0, d(ev.end) - d(today) + 1);
}
export function stateOf(ev) {
  const p = S.profile(), all = p.events || (p.events = {});
  return all[ev.id] || (all[ev.id] = { pts: 0, claimed: [] });
}
// ポイントを足す。戻り値：{ ev, gained, ready: 新しく受け取れるようになったごほうびの数 }
export function addPoints(n) {
  const ev = activeEvent();
  if (!ev || n <= 0) return null;
  const st = stateOf(ev), before = readyCount(ev);
  st.pts += n;
  return { ev, gained: n, ready: readyCount(ev) - before };
}
export const readyCount = (ev) => { const st = stateOf(ev); return ev.rewards.filter((r, i) => st.pts >= r.at && !st.claimed.includes(i)).length; };
// ごほうびを受け取る → プレゼントBOXへ
export function claim(ev, i) {
  const st = stateOf(ev), r = ev.rewards[i];
  if (!r || st.pts < r.at || st.claimed.includes(i)) return false;
  st.claimed.push(i);
  if (ev.rewards.every((_, k) => st.claimed.includes(k))) st.done = true; // 記念の称号（イベントが終わっても残る）
  S.addGift({ id: `ev-${ev.id}-${i}`, kind: r.kind, amount: r.amount || 1, itemId: r.item || null, title: `${ev.name}：${r.at}${ev.unit}のごほうび`, from: 'event' });
  S.save();
  return true;
}
