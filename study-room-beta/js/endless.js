// 終わりのないパズル2種（1.15.0）。★はなく、進むほど自然にむずかしくなる。
//   pack  … おしいれパッキング：8×8 の押し入れに、3つずつ出てくる箱をつめる。たて・横の列がそろうと片づいて消える。置けなくなったら終わり
//   merge … インテリア・マージ：4×4 の部屋で、同じ家具をすべらせて合わせると、1つ上の家具になる。動かせなくなったら終わり
// スコアが区切り（MILESTONES）を越えるたびにゲージ。1回の上限は ★5 のパズル1回分（9 × 8 = 72）。
// スコアの上限（scoreCap）は supabase/021_endless_scores.sql と同じ式（ずるい高得点をはじく）。
import { art, INK } from './puzzles.js';

export const ENDLESS = [
  { id: 'pack', name: 'おしいれパッキング', icon: 'grid', short: '箱をつめて、列をそろえて片づける', rule: '下の3つの箱を、押し入れ（8×8）にドラッグしてつめます。たて・横の列がぜんぶうまると片づいて消えます。置ける場所がなくなったら終わり。' },
  { id: 'merge', name: 'インテリア・マージ', icon: 'sofa', short: '同じ家具を合わせて、良い家具に', rule: '盤を上下左右にスワイプすると、家具がすべります。同じ家具がぶつかると合わさって、1つ上の家具になります。動かせなくなったら終わり。' },
];
export const endlessById = (id) => ENDLESS.find(z => z.id === id);
export const isEndless = (id) => !!endlessById(id);

// ゲージの区切り：1つ越えるごとに MILESTONE_GAUGE。8つで 72（★5 のパズル1回分）
export const MILESTONE_GAUGE = 9;
export const MILESTONES = {
  pack: [100, 250, 450, 700, 1000, 1400, 1900, 2500],
  merge: [300, 800, 1500, 2500, 4000, 6000, 9000, 13000],
};
export const milestonesPassed = (id, score) => MILESTONES[id].filter(m => score >= m).length;
export const nextMilestone = (id, score) => MILESTONES[id].find(m => score < m) || null;

// 1手（箱1つ・スワイプ1回）でとれる点の上限から決める、スコアの上限（サーバーと同じ）
export const PACK_MOVE_MAX = 9 + 210 + 100;
export function scoreCap(id, moves) {
  if (id === 'pack') return moves * PACK_MOVE_MAX;
  const V = 4 * (moves + 2); return Math.floor(V * Math.log2(Math.max(2, V)));
}

const rnd = (n) => Math.floor(Math.random() * n);
const el = (t) => { const d = document.createElement('div'); d.innerHTML = t.trim(); return d.firstChild; };

// ======================= おしいれパッキング =======================
const PN = 8;
// 形のなかま：[マス, やさしい時の出やすさ, むずかしい時の出やすさ]。向きは自動で全部つくる（ゲーム中は回さない）
const FAMILIES = {
  o1: [[[0, 0]], 5, 1.5],
  i2: [[[0, 0], [0, 1]], 8, 3],
  i3: [[[0, 0], [0, 1], [0, 2]], 8, 5],
  i4: [[[0, 0], [0, 1], [0, 2], [0, 3]], 5, 6],
  i5: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], 1.5, 5],
  o2: [[[0, 0], [0, 1], [1, 0], [1, 1]], 6, 6],
  r23: [[[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], 1.5, 5],
  o3: [[[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], 0.6, 3.5],
  l3: [[[0, 0], [1, 0], [1, 1]], 8, 5],
  l4: [[[0, 0], [1, 0], [2, 0], [2, 1]], 4, 7],
  t4: [[[0, 0], [0, 1], [0, 2], [1, 1]], 3, 6],
  s4: [[[0, 1], [0, 2], [1, 0], [1, 1]], 1.5, 5],
  l5: [[[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], 0.8, 4],
  d2: [[[0, 0], [1, 1]], 1, 3],
};
const norm = (cs) => { const r0 = Math.min(...cs.map(c => c[0])), c0 = Math.min(...cs.map(c => c[1])); return cs.map(([r, c]) => [r - r0, c - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
const orients = (cells) => { const out = new Map(); let cur = cells; for (let m = 0; m < 2; m++) { for (let k = 0; k < 4; k++) { cur = cur.map(([r, c]) => [c, -r]); const n = norm(cur); out.set(JSON.stringify(n), n); } cur = cur.map(([r, c]) => [r, -c]); } return [...out.values()]; };
const SHAPES = Object.fromEntries(Object.entries(FAMILIES).map(([k, [cells, a, b]]) => [k, { all: orients(cells), a, b }]));
const BOX = ['#e8a06a', '#f2b84b', '#6cbf8a', '#5b8def', '#b28ad6', '#e86f5a', '#5cc4c9', '#f29bb4'];
const LINE_PTS = [0, 10, 30, 60, 100, 150, 210];

function pickPiece(score) {
  const t = Math.min(1, score / 2500), fam = Object.entries(SHAPES);
  const w = fam.map(([, f]) => f.a + (f.b - f.a) * t), tot = w.reduce((a, b) => a + b, 0);
  let x = Math.random() * tot, i = 0; while (x > w[i]) { x -= w[i]; i++; }
  const f = fam[Math.min(i, fam.length - 1)][1];
  return { cells: f.all[rnd(f.all.length)], color: BOX[rnd(BOX.length)] };
}
const dims = (cells) => [Math.max(...cells.map(c => c[0])) + 1, Math.max(...cells.map(c => c[1])) + 1];
const canPut = (g, cells, r, c) => cells.every(([dr, dc]) => { const y = r + dr, x = c + dc; return y >= 0 && x >= 0 && y < PN && x < PN && !g[y][x]; });
const fitsAny = (g, cells) => { for (let r = 0; r < PN; r++) for (let c = 0; c < PN; c++) if (canPut(g, cells, r, c)) return [r, c]; return null; };

export function mountPack(host, cb = {}) {
  host.innerHTML = '';
  const g = Array.from({ length: PN }, () => Array(PN).fill(null));
  let score = 0, moves = 0, lines = 0, combo = 0, over = false, tray = [], sel = -1;
  const wrap = el(`<div class="pk-wrap"><div class="pk-board" role="grid" aria-label="押し入れ"></div><div class="pk-tray"></div></div>`); host.appendChild(wrap);
  const board = wrap.querySelector('.pk-board'), trayEl = wrap.querySelector('.pk-tray');
  const cells = [];
  for (let r = 0; r < PN; r++) for (let c = 0; c < PN; c++) { const d = document.createElement('div'); d.className = 'pk-cell'; d.dataset.r = r; d.dataset.c = c; board.appendChild(d); cells.push(d); }
  const cellEl = (r, c) => cells[r * PN + c];
  const paint = () => { for (let r = 0; r < PN; r++) for (let c = 0; c < PN; c++) { const e = cellEl(r, c), v = g[r][c]; e.className = 'pk-cell' + (v ? ' box' : ''); e.style.background = v || ''; } };
  const deal = () => {
    // 3つ出す。少なくとも1つは置けるように（置ける形が1つもない時だけ、そのまま終わりになる）
    for (let t = 0; t < 30; t++) { tray = [pickPiece(score), pickPiece(score), pickPiece(score)]; if (tray.some(p => fitsAny(g, p.cells))) break; }
  };
  const drawTray = () => {
    trayEl.innerHTML = '';
    tray.forEach((p, i) => {
      const slot = document.createElement('button'); slot.className = 'pk-slot' + (sel === i ? ' sel' : '') + (p && !fitsAny(g, p.cells) ? ' nofit' : ''); slot.dataset.i = i;
      slot.setAttribute('aria-label', p ? `箱 ${i + 1}（${p.cells.length}マス）` : 'からっぽ');
      if (p) {
        const [h, w] = dims(p.cells), mini = document.createElement('div'); mini.className = 'pk-mini'; mini.style.gridTemplateColumns = `repeat(${w}, var(--m))`; mini.style.gridTemplateRows = `repeat(${h}, var(--m))`;
        p.cells.forEach(([r, c]) => { const q = document.createElement('i'); q.style.gridRow = r + 1; q.style.gridColumn = c + 1; q.style.background = p.color; mini.appendChild(q); });
        slot.appendChild(mini);
      }
      trayEl.appendChild(slot);
    });
  };
  const clearHint = () => cells.forEach(e => e.classList.remove('ghost', 'will'));
  // (r, c) に置いたら、どの列がそろうか
  const fullLines = (gg) => { const rows = [], cols = []; for (let i = 0; i < PN; i++) { if (gg[i].every(Boolean)) rows.push(i); if (gg.every(row => row[i])) cols.push(i); } return { rows, cols }; };
  const hint = (p, r, c) => {
    clearHint(); if (!p || !canPut(g, p.cells, r, c)) return false;
    const gg = g.map(row => row.slice()); p.cells.forEach(([dr, dc]) => { gg[r + dr][c + dc] = p.color; cellEl(r + dr, c + dc).classList.add('ghost'); cellEl(r + dr, c + dc).style.setProperty('--gc', p.color); });
    const { rows, cols } = fullLines(gg); rows.forEach(y => { for (let x = 0; x < PN; x++) cellEl(y, x).classList.add('will'); }); cols.forEach(x => { for (let y = 0; y < PN; y++) cellEl(y, x).classList.add('will'); });
    return true;
  };
  const put = (i, r, c) => {
    const p = tray[i]; if (over || !p || !canPut(g, p.cells, r, c)) return false;
    p.cells.forEach(([dr, dc]) => { g[r + dr][c + dc] = p.color; });
    tray[i] = null; sel = -1; moves++;
    const { rows, cols } = fullLines(g), n = rows.length + cols.length;
    let gain = p.cells.length;
    if (n) {
      combo++; gain += LINE_PTS[Math.min(n, 6)] + 10 * Math.min(combo, 10); lines += n;
      rows.forEach(y => { for (let x = 0; x < PN; x++) cellEl(y, x).classList.add('pop'); }); cols.forEach(x => { for (let y = 0; y < PN; y++) cellEl(y, x).classList.add('pop'); });
      rows.forEach(y => { for (let x = 0; x < PN; x++) g[y][x] = null; }); cols.forEach(x => { for (let y = 0; y < PN; y++) g[y][x] = null; });
      cb.onLines?.(n, combo);
    } else combo = 0;
    score += gain;
    clearHint();
    setTimeout(paint, n ? 220 : 0); if (!n) paint();
    if (tray.every(x => !x)) deal();
    drawTray(); cb.onScore?.(score, { moves, gain, lines: n, combo });
    if (!tray.some(x => x && fitsAny(g, x.cells))) { over = true; setTimeout(() => cb.onEnd?.({ score, moves, lines }), n ? 700 : 450); }
    return true;
  };
  // ---- 指で運ぶ ----
  let drag = null;
  // マスの位置と大きさ（すきまもふくめた1マス分の幅＝pitch）
  const geo = () => { const a = cellEl(0, 0).getBoundingClientRect(), b = cellEl(1, 1).getBoundingClientRect(); return { left: a.left, top: a.top, cell: a.width, pitch: b.left - a.left }; };
  trayEl.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.pk-slot'); if (!slot || over) return; const i = +slot.dataset.i, p = tray[i]; if (!p) return;
    e.preventDefault();
    const G = geo(), [h, w] = dims(p.cells), lift = Math.max(56, G.cell * 1.6);
    const ghost = el(`<div class="pk-drag" style="gap:${G.pitch - G.cell}px;grid-template-columns:repeat(${w},${G.cell}px);grid-template-rows:repeat(${h},${G.cell}px)"></div>`);
    p.cells.forEach(([r, c]) => { const q = document.createElement('i'); q.style.gridRow = r + 1; q.style.gridColumn = c + 1; q.style.background = p.color; ghost.appendChild(q); });
    document.body.appendChild(ghost);
    drag = { i, p, ghost, G, w, h, lift, x0: e.clientX, y0: e.clientY, moved: false, at: null, id: e.pointerId };
    slot.classList.add('lifting');
    try { trayEl.setPointerCapture(e.pointerId); } catch (er) { /* なし */ }
    moveDrag(e);
  });
  const moveDrag = (e) => {
    if (!drag) return; const { G, w, h, lift, ghost } = drag;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
    const left = e.clientX - w * G.pitch / 2, top = e.clientY - h * G.pitch - lift;
    const c = Math.round((left - G.left) / G.pitch), r = Math.round((top - G.top) / G.pitch);
    drag.at = hint(drag.p, r, c) ? [r, c] : null;
    // 置ける所では、箱をそのマスにぴったり合わせて見せる
    ghost.style.transform = drag.at ? `translate(${G.left + c * G.pitch}px, ${G.top + r * G.pitch}px)` : `translate(${left}px, ${top}px)`;
    ghost.classList.toggle('ok', !!drag.at);
  };
  trayEl.addEventListener('pointermove', moveDrag);
  const endDrag = () => {
    if (!drag) return; const d = drag; drag = null; d.ghost.remove(); trayEl.querySelector('.lifting')?.classList.remove('lifting');
    if (d.at) put(d.i, d.at[0], d.at[1]);
    else if (!d.moved) { sel = sel === d.i ? -1 : d.i; drawTray(); } // 押しただけ：えらぶ（そのあと盤を押して置く）
    else { clearHint(); drawTray(); }
  };
  trayEl.addEventListener('pointerup', endDrag); trayEl.addEventListener('pointercancel', endDrag);
  // えらんでから盤を押す：押したマスが箱の左上になるように置く（ためし用にも使う）
  board.addEventListener('click', (e) => { const t = e.target.closest('.pk-cell'); if (!t || sel < 0) return; if (!put(sel, +t.dataset.r, +t.dataset.c)) board.classList.remove('pz-shake'), void board.offsetWidth, board.classList.add('pz-shake'); });
  trayEl.addEventListener('click', (e) => { if (e.detail !== 0) return; const slot = e.target.closest('.pk-slot'); if (!slot || !tray[+slot.dataset.i]) return; sel = +slot.dataset.i; drawTray(); }); // キーボード
  deal(); paint(); drawTray(); cb.onScore?.(0, { moves: 0 });
  // ためし用
  host._state = () => ({ score, moves, lines, over, tray: tray.map(p => p && p.cells), grid: g.map(r => r.map(v => v ? 1 : 0)) });
  host._put = (i, r, c) => put(i, r, c);
  // ためし用の自動プレイ：いちばん多く列がそろう所、なければ端に近い所に置く
  host._auto = () => {
    let best = null;
    tray.forEach((p, i) => { if (!p) return; for (let r = 0; r < PN; r++) for (let c = 0; c < PN; c++) { if (!canPut(g, p.cells, r, c)) continue;
      const gg = g.map(row => row.slice()); p.cells.forEach(([dr, dc]) => { gg[r + dr][c + dc] = 1; }); const { rows, cols } = fullLines(gg);
      const sc = (rows.length + cols.length) * 100 - r - c; if (!best || sc > best.sc) best = { sc, i, r, c }; } });
    return best ? put(best.i, best.r, best.c) : false;
  };
  host._end = () => { if (!over) { over = true; cb.onEnd?.({ score, moves, lines, quit: true }); } };
  host._setTray = (list) => { tray = list.map(cs => cs && { cells: cs, color: BOX[0] }); drawTray(); };
  return { get score() { return score; } };
}

// ======================= インテリア・マージ =======================
const MN = 4;
// 家具のならび（1つ上ほど良い家具）。数字は小さく右下に出す
const MART = {
  zabuton: [40, 40, `<rect x="7" y="13" width="26" height="18" rx="4"/><circle cx="20" cy="22" r="2.2" fill="${INK}"/><path d="M7 15 4 12M33 15l3-3M7 29l-3 3M33 29l3 3" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`],
  stool: [40, 40, `<ellipse cx="20" cy="13" rx="12" ry="4.5"/><rect x="10" y="15" width="3" height="19" transform="rotate(8 11 15)"/><rect x="27" y="15" width="3" height="19" transform="rotate(-8 29 15)"/><rect x="12" y="25" width="16" height="2.5" fill-opacity=".7"/>`],
  piano: [40, 40, `<rect x="4" y="7" width="32" height="21" rx="2"/><rect x="6" y="20" width="28" height="6" fill="${INK}" fill-opacity=".2"/><path d="M10 20v6M14 20v6M18 20v6M22 20v6M26 20v6M30 20v6" stroke="${INK}" stroke-width="1.2"/><rect x="6" y="28" width="3" height="7"/><rect x="31" y="28" width="3" height="7"/><rect x="14" y="10" width="12" height="6" rx="1" fill="${INK}" fill-opacity=".25"/>`],
  fireplace: [40, 40, `<rect x="4" y="6" width="32" height="5" rx="1"/><rect x="6" y="11" width="28" height="24"/><path d="M12 35V21a8 8 0 0 1 16 0v14z" fill="${INK}"/><path d="M20 23c3 3 4 5 3 8h-6c-1-3 1-5 3-8z" fill="#f2c14e"/><path d="M20 27c1.5 1.5 2 2.5 1.5 4h-3c-.5-1.5.5-2.5 1.5-4z" fill="#e86f5a"/>`],
  chandelier: [40, 40, `<rect x="19" y="2" width="2" height="9"/><path d="M6 18q14 10 28 0" fill="none" stroke="#fff" stroke-width="3"/><rect x="15" y="11" width="10" height="5" rx="2"/><path d="M6 18v-5M14 21v-5M20 22v-6M26 21v-5M34 18v-5" stroke="#fff" stroke-width="2.4"/><circle cx="6" cy="11" r="2.4" fill="#fff7c2"/><circle cx="14" cy="14" r="2.4" fill="#fff7c2"/><circle cx="20" cy="14" r="2.4" fill="#fff7c2"/><circle cx="26" cy="14" r="2.4" fill="#fff7c2"/><circle cx="34" cy="11" r="2.4" fill="#fff7c2"/><path d="M14 24l6 12 6-12" fill="none" stroke="#fff" stroke-width="2"/>`],
  house: [40, 40, `<path d="M4 19 20 6l16 13v2H4z"/><rect x="8" y="20" width="24" height="15"/><rect x="17" y="25" width="6" height="10" fill="${INK}"/><rect x="11" y="23" width="4" height="4" fill="#fff7c2" stroke="${INK}" stroke-width="1.2"/><rect x="25" y="23" width="4" height="4" fill="#fff7c2" stroke="${INK}" stroke-width="1.2"/><rect x="27" y="8" width="4" height="7"/>`],
  castle: [40, 40, `<path d="M4 14h4v-3h3v3h4v-3h3v3h4v-3h3v3h4v-3h3v3h4v21H4z"/><rect x="16" y="24" width="8" height="11" rx="4" fill="${INK}"/><rect x="8" y="19" width="3" height="4" fill="${INK}"/><rect x="29" y="19" width="3" height="4" fill="${INK}"/><path d="M20 3v8M20 3l6 2-6 2" stroke="#fff" stroke-width="1.8" fill="#e86f5a"/>`],
};
const mart = (k) => { const [w, h, body] = MART[k]; return `<svg class="mg-art" viewBox="0 0 ${w} ${h}" fill="#fff" aria-hidden="true">${body}</svg>`; };
export const MERGE_ITEMS = [
  { n: 'ざぶとん', c: '#c9b79c', a: () => mart('zabuton') },
  { n: 'スツール', c: '#e8a06a', a: () => mart('stool') },
  { n: 'いす', c: '#f2b84b', a: () => art('chair', 'mg-art') },
  { n: 'ランプ', c: '#e8c45a', a: () => art('lamp', 'mg-art') },
  { n: 'つくえ', c: '#6cbf8a', a: () => art('desk', 'mg-art') },
  { n: 'たな', c: '#3fa66b', a: () => art('shelf', 'mg-art') },
  { n: 'ソファ', c: '#5cc4c9', a: () => art('bigsofa', 'mg-art') },
  { n: 'ベッド', c: '#5b8def', a: () => art('bed', 'mg-art') },
  { n: 'ピアノ', c: '#b28ad6', a: () => mart('piano') },
  { n: 'だんろ', c: '#e86f5a', a: () => mart('fireplace') },
  { n: 'シャンデリア', c: '#d0453a', a: () => mart('chandelier') },
  { n: 'ゆめの家', c: '#2b2a33', a: () => mart('house') },
  { n: 'お城', c: '#8a6d1f', a: () => mart('castle') },
];
const itemOf = (lv) => MERGE_ITEMS[Math.min(lv, MERGE_ITEMS.length) - 1];
export const mergeValue = (lv) => 2 ** lv;

export function mountMerge(host, cb = {}) {
  host.innerHTML = '';
  let g = Array.from({ length: MN }, () => Array(MN).fill(null)), score = 0, moves = 0, over = false, nid = 1, maxLv = 1, busy = false;
  const wrap = el(`<div class="mg-wrap"><div class="mg-board" aria-label="部屋（スワイプで動かす）"></div><div class="mg-pad"><button data-d="up" aria-label="上">↑</button><button data-d="left" aria-label="左">←</button><button data-d="down" aria-label="下">↓</button><button data-d="right" aria-label="右">→</button></div><p class="pz-tip">盤をスワイプ（矢印でも動かせます）</p></div>`);
  host.appendChild(wrap);
  const board = wrap.querySelector('.mg-board');
  for (let i = 0; i < MN * MN; i++) { const d = document.createElement('div'); d.className = 'mg-bg'; d.style.gridRow = Math.floor(i / MN) + 1; d.style.gridColumn = i % MN + 1; board.appendChild(d); }
  const layer = document.createElement('div'); layer.className = 'mg-layer'; board.appendChild(layer);
  const tiles = new Map(); // id → element
  const pos = (e, r, c) => { e.style.setProperty('--r', r); e.style.setProperty('--c', c); };
  const tileEl = (t) => { const it = itemOf(t.lv), e = el(`<div class="mg-tile lv${Math.min(t.lv, 13)}" style="background:${it.c}">${it.a()}<b>${mergeValue(t.lv)}</b></div>`); e.setAttribute('aria-label', `${it.n}（${mergeValue(t.lv)}）`); pos(e, t.r, t.c); return e; };
  const spawn = () => {
    const free = []; for (let r = 0; r < MN; r++) for (let c = 0; c < MN; c++) if (!g[r][c]) free.push([r, c]);
    if (!free.length) return; const [r, c] = free[rnd(free.length)];
    const t = { id: nid++, lv: Math.random() < 0.9 ? 1 : 2, r, c }; g[r][c] = t;
    const e = tileEl(t); e.classList.add('new'); layer.appendChild(e); tiles.set(t.id, e);
  };
  const canMove = () => { for (let r = 0; r < MN; r++) for (let c = 0; c < MN; c++) { const t = g[r][c]; if (!t) return true; if (c + 1 < MN && g[r][c + 1]?.lv === t.lv) return true; if (r + 1 < MN && g[r + 1][c]?.lv === t.lv) return true; } return false; };
  const VEC = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const move = (dir) => {
    if (over || busy) return false;
    const [dr, dc] = VEC[dir], gone = [], merged = [];
    let moved = false, gain = 0;
    const ng = Array.from({ length: MN }, () => Array(MN).fill(null));
    for (let k = 0; k < MN; k++) {
      // その列を、すべる向きの先頭から順にならべる
      const line = []; for (let j = 0; j < MN; j++) { const idx = (dr + dc > 0) ? MN - 1 - j : j; const r = dr ? idx : k, c = dr ? k : idx; if (g[r][c]) line.push(g[r][c]); }
      const out = [];
      for (const t of line) {
        const last = out[out.length - 1];
        if (last && !last.m && last.lv === t.lv) { last.lv++; last.m = true; gone.push([t, last]); gain += mergeValue(last.lv); merged.push(last); }
        else out.push(t);
      }
      out.forEach((t, j) => { const idx = (dr + dc > 0) ? MN - 1 - j : j; const r = dr ? idx : k, c = dr ? k : idx; if (t.r !== r || t.c !== c) moved = true; t.r = r; t.c = c; ng[r][c] = t; });
      if (gone.length) moved = true;
    }
    if (!moved) { board.classList.remove('pz-shake'); void board.offsetWidth; board.classList.add('pz-shake'); return false; }
    g = ng; moves++; score += gain; busy = true;
    for (const row of g) for (const t of row) if (t) { pos(tiles.get(t.id), t.r, t.c); }
    gone.forEach(([t, into]) => { const e = tiles.get(t.id); pos(e, into.r, into.c); e.classList.add('gone'); });
    setTimeout(() => {
      gone.forEach(([t]) => { tiles.get(t.id)?.remove(); tiles.delete(t.id); });
      merged.forEach(t => { delete t.m; const old = tiles.get(t.id), e = tileEl(t); e.classList.add('pop'); old.replaceWith(e); tiles.set(t.id, e); if (t.lv > maxLv) { maxLv = t.lv; if (t.lv >= 4) cb.onNew?.(itemOf(t.lv).n, t.lv); } });
      for (const row of g) for (const t of row) if (t) delete t.m;
      spawn(); busy = false;
      cb.onScore?.(score, { moves, gain, maxLv });
      if (!canMove()) { over = true; setTimeout(() => cb.onEnd?.({ score, moves, maxLv }), 600); }
    }, 130);
    return true;
  };
  wrap.querySelectorAll('.mg-pad button').forEach(b => b.onclick = () => move(b.dataset.d));
  // スワイプ
  let sw = null;
  board.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; try { board.setPointerCapture(e.pointerId); } catch (er) { /* なし */ } });
  board.addEventListener('pointerup', (e) => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); });
  board.addEventListener('pointercancel', () => { sw = null; });
  const key = (e) => { if (!wrap.isConnected) { document.removeEventListener('keydown', key); return; } const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (d) { e.preventDefault(); move(d); } };
  document.addEventListener('keydown', key);
  spawn(); spawn(); cb.onScore?.(0, { moves: 0, maxLv });
  host._state = () => ({ score, moves, over, maxLv, grid: g.map(r => r.map(t => t ? t.lv : 0)) });
  host._move = (d) => move(d);
  host._end = () => { if (!over) { over = true; cb.onEnd?.({ score, moves, maxLv, quit: true }); } };
  // ためし用：盤を決める（lv の2次元）
  host._set = (lvs) => { tiles.forEach(e => e.remove()); tiles.clear(); g = lvs.map((row, r) => row.map((lv, c) => lv ? { id: nid++, lv, r, c } : null)); for (const row of g) for (const t of row) if (t) { const e = tileEl(t); layer.appendChild(e); tiles.set(t.id, e); } };
  return { get score() { return score; } };
}

export function mountEndless(id, host, cb) { return id === 'pack' ? mountPack(host, cb) : mountMerge(host, cb); }
