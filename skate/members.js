// スケートラップ：部員の登録と、見分け
// 服（胴・脚）とヘルメットの色の分布を、1人につき何回分か覚えておき、いちばん似ている部員を探す。
// 保存は端末の中（localStorage）だけ。
import { histSim, headSim } from './vision.js';

const KEY = 'skate-members';
export function loadMembers() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveMembers(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }
const MAX_SAMPLES = 16;

// 同じ大学のそろいの服だと胴と脚は似るので、ヘルメット（頭）を重く見る
export function score(h, sample) {
  const body = histSim(h, sample), head = headSim(h, sample);
  return (body * 3 + head * 2) / 5; // histSim は頭も 1/3 含む
}
// いちばん似ている部員。似ていない・2番目と差がない時は null
export function matchMember(h, members = loadMembers(), th = 0.86) {
  if (!h || !members.length) return null;
  const sc = members.map(m => ({ m, v: Math.max(0, ...m.samples.map(s => score(h, s))) })).sort((a, b) => b.v - a.v);
  if (sc[0].v < th) return null;
  if (sc[1] && sc[0].v - sc[1].v < 0.015) return null;
  return { member: sc[0].m, score: sc[0].v };
}
export function addMember({ name, kind, hist, thumb }) {
  const list = loadMembers();
  const m = { id: 'm' + Date.now(), name, kind, order: list.length, samples: [Array.from(hist, x => Math.round(x * 1e4) / 1e4)], thumb };
  list.push(m); saveMembers(list); return m;
}
export function addSample(id, hist, thumb) {
  const list = loadMembers(), m = list.find(x => x.id === id); if (!m) return;
  m.samples.push(Array.from(hist, x => Math.round(x * 1e4) / 1e4));
  if (m.samples.length > MAX_SAMPLES) m.samples.shift();
  if (thumb) m.thumb = thumb;
  saveMembers(list); return m;
}
// 追いかけの優先順：自分 → 部員（並べた順）
export function priorityOf(m) { return (m.kind === 'me' ? 0 : 1000) + (m.order || 0); }
