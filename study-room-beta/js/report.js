// 勉強レポート（1.12.0）：毎日の記録（store の log）を、週・月ごとにまとめる。画像（PNG）にもする。
import { addDays, dayKey, weekKey } from './store.js';

// 期間：kind = 'week' | 'month'、offset = 0 が今、-1 が1つ前
export function period(kind, offset = 0, today = dayKey()) {
  if (kind === 'week') {
    const start = addDays(weekKey(), offset * 7);
    return { kind, start, end: addDays(start, 6), label: `${md(start)}〜${md(addDays(start, 6))}`, name: offset === 0 ? '今週' : offset === -1 ? '先週' : `${md(start)}の週` };
  }
  const [y, m] = today.split('-').map(Number);
  const t = new Date(y, m - 1 + offset, 1), ny = t.getFullYear(), nm = t.getMonth() + 1;
  const start = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const last = new Date(ny, nm, 0).getDate();
  return { kind, start, end: `${ny}-${String(nm).padStart(2, '0')}-${String(last).padStart(2, '0')}`, label: `${ny}年${nm}月`, name: offset === 0 ? '今月' : offset === -1 ? '先月' : `${nm}月` };
}
export const md = (k) => `${+k.slice(5, 7)}/${+k.slice(8, 10)}`;

// まとめる。units は「解いた数が3問以上」の単元だけを、得意・苦手に使う
export function summarize(log, p) {
  const days = [];
  for (let k = p.start; k <= p.end; k = addDays(k, 1)) days.push({ key: k, ...(log[k] || { n: 0, c: 0, pz: 0, u: {} }) });
  const by = {}, units = {};
  let n = 0, c = 0, pz = 0, studyDays = 0;
  for (const d of days) {
    n += d.n || 0; c += d.c || 0; pz += d.pz || 0;
    if ((d.n || 0) + (d.pz || 0) > 0) studyDays++;
    for (const [k, [un, uc]] of Object.entries(d.u || {})) {
      const [sid, unit] = k.split('|');
      const b = by[sid] || (by[sid] = [0, 0]); b[0] += un; b[1] += uc;
      const u = units[k] || (units[k] = { sid, unit, n: 0, c: 0 }); u.n += un; u.c += uc;
    }
  }
  const ranked = Object.values(units).filter(u => u.n >= 3 && u.unit).map(u => ({ ...u, rate: u.c / u.n }));
  const weak = ranked.filter(u => u.rate < 0.8).sort((a, b) => a.rate - b.rate || b.n - a.n).slice(0, 3);
  const strong = ranked.filter(u => u.rate >= 0.7 && !weak.includes(u)).sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 3);
  return { days, n, c, pz, studyDays, rate: n ? c / n : 0, bySid: by, weak, strong };
}

// ひとことコメント（前の期間とくらべる）
export function comment(cur, prev, p) {
  const unit = p.kind === 'week' ? '週' : '月';
  if (!cur.n && !cur.pz) return `この${unit}はまだ記録がありません。1問から始めてみましょう`;
  if (prev.n && cur.n > prev.n) return `前の${unit}より ${cur.n - prev.n}問 多く解きました`;
  if (prev.n && cur.n && cur.rate > prev.rate + 0.05) return `前の${unit}より正解率が ${Math.round((cur.rate - prev.rate) * 100)}ポイント上がりました`;
  if (cur.studyDays >= (p.kind === 'week' ? 5 : 20)) return `${cur.studyDays}日も勉強しました。よく続いています`;
  return `${cur.studyDays}日勉強して、${cur.n}問 解きました`;
}

// 画像にする（1080×1350、SNS やドライブに保存しやすい大きさ）
export function drawImage({ user, p, cur, prev, names, avatarColor = '#e6c068' }) {
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const F = (w, s) => `${w} ${s}px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#22212a'); bg.addColorStop(1, '#141318');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const card = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,0.06)'; rr(g, x, y, w, h, 28); g.fill(); };
  g.fillStyle = '#e6c068'; g.font = F(800, 34); g.fillText('ROOMIN', 72, 104);
  g.fillStyle = '#f4f1ea'; g.font = F(800, 64); g.fillText('勉強レポート', 72, 186);
  g.fillStyle = 'rgba(244,241,234,0.7)'; g.font = F(500, 34); g.fillText(`${user} ・ ${p.name}（${p.label}）`, 72, 240);
  // 数字4つ
  const nums = [['解いた数', `${cur.n}`, '問'], ['正解率', `${Math.round(cur.rate * 100)}`, '%'], ['勉強した日', `${cur.studyDays}`, '日'], ['パズル', `${cur.pz}`, '回']];
  nums.forEach(([lab, v, u], i) => {
    const x = 72 + i * 240, y = 290; card(x, y, 216, 190);
    g.fillStyle = 'rgba(244,241,234,0.65)'; g.font = F(600, 28); g.fillText(lab, x + 24, y + 52);
    g.fillStyle = '#f4f1ea'; g.font = F(800, 76); g.fillText(v, x + 24, y + 146);
    const vw = g.measureText(v).width; g.font = F(700, 30); g.fillStyle = 'rgba(244,241,234,0.7)'; g.fillText(u, x + 30 + vw, y + 146);
  });
  // 毎日の棒グラフ
  card(72, 510, 936, 380);
  g.fillStyle = '#f4f1ea'; g.font = F(700, 32); g.fillText('毎日の解いた数', 104, 566);
  const max = Math.max(5, ...cur.days.map(d => d.n || 0)), bx = 104, bw = 872, by = 840, bh = 220;
  const step = bw / cur.days.length, w = Math.max(6, step * 0.62);
  cur.days.forEach((d, i) => {
    const x = bx + i * step + (step - w) / 2, hh = (d.n || 0) / max * bh;
    g.fillStyle = 'rgba(255,255,255,0.08)'; rr(g, x, by - bh, w, bh, Math.min(10, w / 2)); g.fill();
    if (hh > 0) { g.fillStyle = '#e6c068'; rr(g, x, by - hh, w, hh, Math.min(10, w / 2)); g.fill(); }
    if (p.kind === 'week' || i % 5 === 0 || i === cur.days.length - 1) { g.fillStyle = 'rgba(244,241,234,0.6)'; g.font = F(500, 24); g.textAlign = 'center'; g.fillText(p.kind === 'week' ? '月火水木金土日'[i] : String(+d.key.slice(8)), x + w / 2, by + 34); g.textAlign = 'left'; }
  });
  // 得意・苦手
  const col = (x, title, list, color) => {
    card(x, 920, 456, 300);
    g.fillStyle = color; g.font = F(800, 32); g.fillText(title, x + 32, 976);
    if (!list.length) { g.fillStyle = 'rgba(244,241,234,0.5)'; g.font = F(500, 28); g.fillText('まだ集まっていません', x + 32, 1036); }
    list.forEach((u, i) => {
      const y = 1040 + i * 78;
      g.fillStyle = '#f4f1ea'; g.font = F(700, 30); g.fillText(clip(g, u.unit, 300), x + 32, y);
      g.fillStyle = 'rgba(244,241,234,0.6)'; g.font = F(500, 24); g.fillText(`${names[u.sid] || ''}・${Math.round(u.rate * 100)}%`, x + 32, y + 30);
    });
  };
  col(72, '得意な単元', cur.strong, '#8fd19e');
  col(552, 'のびしろの単元', cur.weak, '#f0a08c');
  g.fillStyle = 'rgba(244,241,234,0.8)'; g.font = F(600, 32); g.fillText(clip(g, comment(cur, prev, p), 936), 72, 1280);
  return cv;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function clip(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
