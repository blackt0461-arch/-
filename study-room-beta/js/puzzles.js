// パズルモードの頭脳パズル4種（平面的なデザイン）。
//   akari   … あかりの間取り：色の部屋・たて・横に照明1つずつ、照明どうしはとなり合わない
//   aburi   … 家具あぶりだし：数字のヒントでマスをぬると家具の絵
//   rokujo  … 六畳ロジック：6×6 に6種類の家具を、たて・横・ブロックに1つずつ
//   hikkoshi… おひっこし：家具をすべらせて、ソファを出口へ（何回でもやり直せる。手数が少ないほどポイント）
// どの問題も答えが1つに決まり、勘にたよらず解けることを確かめてある（akari・rokujo はその場で作って確かめる）。
// むずかしさは ★1〜★5 を自分で選ぶ（★をクリアすると次の★が選べるようになる）。★が高いほどごほうびが多い。
// まちがいは3回まで（★5 は2回まで）。

export const PUZZLES = [
  { id: 'akari', name: 'あかりの間取り', icon: 'lamp', short: '部屋ごとに照明を1つ', rule: '色の部屋・たての列・横の列に、照明はちょうど1つずつ。照明どうしは、ななめもふくめてとなり合いません。マスを押すと「×」→「照明」→「なし」。' },
  { id: 'aburi', name: '家具あぶりだし', icon: 'image', short: '数字からぬって絵を出す', rule: '列と行の数字は、ぬるマスが何個つづくか（「2 1」は2個つづき、あけて1個）。全部ぬると家具の絵があらわれます。「ぬる」と「×」を切りかえて使います。' },
  { id: 'rokujo', name: '六畳ロジック', icon: 'grid', short: '6種類の家具を1つずつ', rule: '6×6のマスに6種類の家具。たての列・横の列・太い線のブロック（2×3）に、同じ家具は1つずつ。マスを選んでから、下の家具を押します。' },
  { id: 'hikkoshi', name: 'おひっこし', icon: 'sofa', short: 'ソファを出口へ運ぶ', rule: '家具をたて・横にすべらせて、赤いソファを下の出口（緑）から出します。家具を押してから、行きたい方向の空きマスか矢印を押します。少ない手数ほどポイントが多くなります。' },
];
export const puzzleById = (id) => PUZZLES.find(p => p.id === id);

export const STARS = 5;
export const livesOf = (star) => star >= 5 ? 2 : 3;
// ★ごとのむずかしさの説明
export function levelInfo(id, star) {
  if (id === 'akari') { const n = akariSize(star); return `${n}×${n}`; }
  if (id === 'aburi') { const n = ABURI_SIZE[star - 1]; return `${n}×${n}` + ['・少しぬってある', '・少しぬってある', '', '', '・まちがい2回まで'][star - 1]; }
  if (id === 'rokujo') return `ヒント ${rokujoGiven(star)}個`;
  if (id === 'hikkoshi') { const p = SLIDE_POOL[star - 1].map(i => SLIDES[i][0]); return `最短 ${Math.min(...p)}〜${Math.max(...p)}手`; }
  return '';
}
const akariSize = (star) => 4 + star;                                   // ★1:5×5 〜 ★5:9×9
const rokujoGiven = (star) => [18, 15, 13, 11, 9][star - 1];            // ヒントの数（少ないほどむずかしい）
const ABURI_REVEAL = [0.3, 0.15, 0, 0, 0];                             // はじめからぬってあるマスの割合（★1・★2 だけ）

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------- あかりの間取り：問題を作る ----------------
// 人がふつうに使う推理（1つしか置けない・小さい部屋をつぶすマスを消す・部屋が列の中に収まる）だけで
// 最後まで解けて、答えが1つの問題だけを出す。部屋は2マス以上（★4・★5 は3マス以上）。2026-11-08
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function akariCount(N, reg, limit = 2) {
  let n = 0; const col = Array(N).fill(false), used = Array(N).fill(false), pos = [];
  (function row(r) { if (n >= limit) return; if (r === N) { n++; return; }
    for (let c = 0; c < N; c++) { if (col[c] || used[reg[r][c]] || (r && Math.abs(pos[r - 1] - c) < 2)) continue;
      col[c] = used[reg[r][c]] = true; pos[r] = c; row(r + 1); col[c] = used[reg[r][c]] = false; } })(0);
  return n;
}
// 推理だけで解く。maxK：いくつの部屋（列）をまとめて考えるか。解けたら true
export function akariLogic(N, reg, maxK, small = 3, score = false) {
  const cand = Array.from({ length: N }, () => Array(N).fill(true));
  const lampR = Array(N).fill(-1), doneC = Array(N).fill(false), doneG = Array(N).fill(false);
  let placed = 0;
  const kill = (r, c) => { if (cand[r][c]) { cand[r][c] = false; return true; } return false; };
  const place = (r, c) => {
    lampR[r] = c; doneC[c] = true; doneG[reg[r][c]] = true; placed++;
    for (let i = 0; i < N; i++) { kill(r, i); kill(i, c); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (reg[y][x] === reg[r][c]) kill(y, x);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const y = r + dy, x = c + dx; if (y >= 0 && x >= 0 && y < N && x < N) kill(y, x); }
  };
  // まだ照明がない「たて・横・部屋」ごとの候補
  const units = () => {
    const U = [];
    for (let r = 0; r < N; r++) if (lampR[r] < 0) { const cs = []; for (let c = 0; c < N; c++) if (cand[r][c]) cs.push([r, c]); U.push(cs); }
    for (let c = 0; c < N; c++) if (!doneC[c]) { const cs = []; for (let r = 0; r < N; r++) if (cand[r][c]) cs.push([r, c]); U.push(cs); }
    const G = Array.from({ length: N }, () => []);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cand[r][c] && !doneG[reg[r][c]]) G[reg[r][c]].push([r, c]);
    for (let g = 0; g < N; g++) if (!doneG[g]) U.push(G[g]);
    return { U, G };
  };
  const combos = (arr, k, f) => { const pick = []; (function go(s) { if (pick.length === k) { f(pick); return; } for (let i = s; i < arr.length; i++) { pick.push(arr[i]); go(i + 1); pick.pop(); } })(0); };
  for (let guard = 0; guard < 500; guard++) {
    if (placed === N) return true;
    const { U, G } = units();
    if (U.some(u => !u.length)) return score ? -1 : false;
    // 1) 候補が1つだけ → そこに照明
    const one = U.find(u => u.length === 1);
    if (one) { place(one[0][0], one[0][1]); continue; }
    let changed = false;
    // 2) そこに置くと、どこかの「たて・横・部屋」の候補がなくなる → 置けない
    for (let r = 0; r < N && !changed; r++) for (let c = 0; c < N && !changed; c++) {
      if (!cand[r][c]) continue;
      const hit = (y, x) => y === r || x === c || reg[y][x] === reg[r][c] || (Math.abs(y - r) <= 1 && Math.abs(x - c) <= 1);
      if (U.some(u => u.length <= small && !u.some(([y, x]) => y === r && x === c) && u.every(([y, x]) => hit(y, x)))) { kill(r, c); changed = true; }
    }
    if (changed) continue;
    // 3) k個の部屋が、k本のたて（横）の中だけにある → その列のほかのマスは置けない（逆も）
    const openG = [...Array(N).keys()].filter(g => !doneG[g]);
    const openR = [...Array(N).keys()].filter(r => lampR[r] < 0), openC = [...Array(N).keys()].filter(c => !doneC[c]);
    for (let k = 1; k <= maxK && !changed; k++) {
      for (const axis of [0, 1]) {
        combos(openG, k, (gs) => { if (changed) return; const lines = new Set(); gs.forEach(g => G[g].forEach(p => lines.add(p[axis]))); if (lines.size !== k) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cand[r][c] && lines.has(axis ? c : r) && !gs.includes(reg[r][c])) { kill(r, c); changed = true; } });
        if (changed) break;
        combos(axis ? openC : openR, k, (ls) => { if (changed) return; const gs = new Set(); for (const l of ls) for (let i = 0; i < N; i++) { const r = axis ? i : l, c = axis ? l : i; if (cand[r][c]) gs.add(reg[r][c]); } if (gs.size !== k) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (cand[r][c] && gs.has(reg[r][c]) && !ls.includes(axis ? c : r)) { kill(r, c); changed = true; } });
        if (changed) break;
      }
    }
    if (!changed) break;
  }
  if (placed === N) return true;
  if (!score) return false;
  let k = placed * N * 2; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!cand[r][c]) k++;
  return k;
}

function genAkariTry(N, minSize, maxK, small) {
  const t0 = Date.now();
  for (let tries = 0; tries < 400 && Date.now() - t0 < 2500; tries++) {
    const p = [];
    const ok = (function place(r, used) { if (r === N) return true; for (const c of shuffle([...Array(N).keys()])) { if (used.has(c) || (r && Math.abs(p[r - 1] - c) < 2)) continue; p[r] = c; used.add(c); if (place(r + 1, used)) return true; used.delete(c); } return false; })(0, new Set());
    if (!ok) continue;
    const g = Array.from({ length: N }, () => Array(N).fill(-1)), size = Array(N).fill(1);
    p.forEach((c, r) => { g[r][c] = r; });
    const frontier = (k) => { const cs = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === k) for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && g[ny][nx] < 0) cs.push([nx, ny]); } return cs; };
    let left = N * N - N, stuck = false;
    // まず小さい部屋から大きくして、どの部屋も minSize 以上に
    for (let round = 0; round < minSize - 1 && !stuck; round++) for (const k of shuffle([...Array(N).keys()])) { const cs = frontier(k); if (!cs.length) { stuck = true; break; } const [x, y] = cs[Math.floor(Math.random() * cs.length)]; g[y][x] = k; size[k]++; left--; }
    if (stuck) continue;
    for (let guard = 0; left && guard < 20000; guard++) { const k = Math.floor(Math.random() * N), cs = frontier(k); if (!cs.length) continue; const [x, y] = cs[Math.floor(Math.random() * cs.length)]; g[y][x] = k; size[k]++; left--; }
    if (left) continue;
    const conn = (k) => { const cells = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === k) cells.push(y * N + x); const seen = new Set([cells[0]]), st = [cells[0]]; while (st.length) { const q = st.pop(), y = Math.floor(q / N), x = q % N; for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy, nq = ny * N + nx; if (nx >= 0 && ny >= 0 && nx < N && ny < N && g[ny][nx] === k && !seen.has(nq)) { seen.add(nq); st.push(nq); } } } return seen.size === cells.length; };
    let cur = akariLogic(N, g, maxK, small, true); if (cur === true) return { reg: g, sol: p };
    // さかい目のマスをとなりの部屋に付けかえて、推理だけで解ける形をさがす
    for (let step = 0; step < 1500 && Date.now() - t0 < 2500; step++) {
      const x = Math.floor(Math.random() * N), y = Math.floor(Math.random() * N);
      if (p[y] === x) continue;
      const [dx, dy] = D4[Math.floor(Math.random() * 4)], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || g[ny][nx] === g[y][x]) continue;
      const old = g[y][x]; if (size[old] <= minSize) continue;
      g[y][x] = g[ny][nx];
      if (!conn(old)) { g[y][x] = old; continue; }
      const nw = akariLogic(N, g, maxK, small, true);
      if (nw === true) return { reg: g, sol: p };
      if (nw >= cur) { cur = nw; size[old]--; size[g[y][x]]++; } else g[y][x] = old;
    }
  }
  return null;
}

// ★ごとの決まり：部屋の最小マス数・まとめて考える部屋の数。1マスの部屋は作らない
const AKARI_MIN = [2, 2, 2, 3, 3], AKARI_K = [1, 1, 1, 2, 2];
export function genAkari(N, star = N - 4) {
  const i = Math.max(0, Math.min(4, star - 1));
  // 推理だけで解けて、答えが1つの問題ができるまで（まれに作れない時は、決まりを少しゆるめる）
  for (const [min, k] of [[AKARI_MIN[i], AKARI_K[i]], [2, 2], [2, 3]]) {
    for (let t = 0; t < 3; t++) { const r = genAkariTry(N, min, k, 3); if (r && akariCount(N, r.reg, 2) === 1) return r; }
  }
  return genAkariOld(N);
}
function genAkariOld(N) {
  for (let tries = 0; tries < 40; tries++) {
    const p = [];
    const ok = (function place(r, used) { if (r === N) return true; for (const c of shuffle([...Array(N).keys()])) { if (used.has(c) || (r && Math.abs(p[r - 1] - c) < 2)) continue; p[r] = c; used.add(c); if (place(r + 1, used)) return true; used.delete(c); } return false; })(0, new Set());
    if (!ok) continue;
    const g = Array.from({ length: N }, () => Array(N).fill(-1));
    p.forEach((c, r) => { g[r][c] = r; });
    let left = N * N - N, guard = 0;
    while (left && guard++ < 20000) {
      const r = Math.floor(Math.random() * N), cs = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === r) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && g[ny][nx] < 0) cs.push([nx, ny]); }
      if (!cs.length) continue; const [x, y] = cs[Math.floor(Math.random() * cs.length)]; g[y][x] = r; left--;
    }
    if (left) continue;
    // 答えが1つになるまで、部屋のさかい目のマスをとなりの部屋に付けかえていく
    let cnt = akariCount(N, g, 60);
    const conn = (r) => { const cells = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === r) cells.push(y * N + x); if (!cells.length) return false; const seen = new Set([cells[0]]), st = [cells[0]]; while (st.length) { const k = st.pop(), y = Math.floor(k / N), x = k % N; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = ny * N + nx; if (nx >= 0 && ny >= 0 && nx < N && ny < N && g[ny][nx] === r && !seen.has(nk)) { seen.add(nk); st.push(nk); } } } return seen.size === cells.length; };
    for (let step = 0; step < 3000 && cnt > 1; step++) {
      const x = Math.floor(Math.random() * N), y = Math.floor(Math.random() * N);
      if (p[y] === x) continue;
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || g[ny][nx] === g[y][x]) continue;
      const old = g[y][x]; g[y][x] = g[ny][nx];
      if (!conn(old)) { g[y][x] = old; continue; }
      const c2 = akariCount(N, g, 60);
      if (c2 <= cnt) cnt = c2; else g[y][x] = old;
    }
    if (cnt === 1) return { reg: g, sol: p };
  }
  return null;
}

// ---------------- 家具あぶりだし：絵（25枚・左右対称でない形） ----------------
// s＝★、n＝名前、p＝クリアした時に出る色（文字ごと）、m＝絵（. は空き。ほかの文字はぬるマス）
// ★1 10×10・★2 11×11・★3 13×13・★4 14×14・★5 15×15。どれも「行と列の数字だけで、当てずっぽうなしに解ける」ことを
// js/nonosolve.js で確かめてある（tools/check/puzzle.js でも毎回確かめる）。2026-11-07
export const PICS = [
  // ---------- ★1 10×10 ----------
  { s: 1, n: 'マグカップ', p: { a: '#c9c3b5', b: '#e86f5a', c: '#e4ddcf' }, m: [
    '.a..a.....',
    '..a..a....',
    '.a..a.....',
    '..........',
    'bbbbbbb...',
    'bbbbbbbbb.',
    'bcbbbbb.b.',
    'bcbbbbb.b.',
    'bbbbbbbbb.',
    '.bbbbb....'] },
  { s: 1, n: 'デスクライト', p: { a: '#5b8def', c: '#f2c14e' }, m: [
    '.....aaaa.',
    '....aaaaaa',
    '...aa.aaaa',
    '..aa...cc.',
    '.aa.......',
    '.aa.......',
    '..aa......',
    '...aa.....',
    '..aaaa....',
    'aaaaaaaa..'] },
  { s: 1, n: 'じょうろ', p: { a: '#3fa66b', b: '#6cbf8a' }, m: [
    '...aaa....',
    '.a....a...',
    '.a....a..a',
    'bbbbbbbbaa',
    'bbbbbbbba.',
    'bbbbbbba..',
    'bbbbbbb...',
    'bbbbbbb...',
    'bbbbbbb...',
    '.bbbbb....'] },
  { s: 1, n: 'スリッパ', p: { a: '#f29bb4', b: '#b28ad6' }, m: [
    '..........',
    '..........',
    '......aaa.',
    '....aaaaaa',
    '..aaaaaaaa',
    '.aaaaa.aaa',
    'bbbbbbbbbb',
    'bbbbbbbbbb',
    '..........',
    '..........'] },
  { s: 1, n: 'ティーポット', p: { a: '#5cc4c9', b: '#2b2a33' }, m: [
    '....bb....',
    '...aaaa...',
    '.aaaaaaaa.',
    'a.aaaaaaaa',
    'a.aaaaaaa.',
    '.aaaaaaa..',
    '..aaaaaaa.',
    '..aaaaaa.a',
    '...aaaa...',
    '..aaaaaa..'] },
  // ---------- ★2 11×11 ----------
  { s: 2, n: 'ロッキングチェア', p: { a: '#a0703e', b: '#e86f5a' }, m: [
    'aa.........',
    'aa.........',
    '.aa........',
    '.aa........',
    '.abb.......',
    '..abbbbbb..',
    '..aaaaaaaa.',
    '..a.....a..',
    '..a.....a..',
    'aaaaaaaaaaa',
    '.aaaaaaaaa.'] },
  { s: 2, n: 'せんぷうき', p: { a: '#5b8def', b: '#c9c3b5' }, m: [
    '....aa.....',
    '...aaaa.a..',
    '..a.aa.aaa.',
    '.aaa.aaaa..',
    '..aaaa.aa..',
    '...aaa.....',
    '.....b.....',
    '.....b.....',
    '.....b.....',
    '...bbbbb...',
    '..bbbbbbbb.'] },
  { s: 2, n: '鉢植え', p: { a: '#3fa66b', b: '#e8a06a', c: '#6cbf8a' }, m: [
    '.......cc..',
    '.aa...ccc..',
    'aaaa..cc...',
    '.aaaa.c..c.',
    '..aaac.cccc',
    '....acc.cc.',
    '....ac.....',
    '..bbbbbbb..',
    '...bbbbb...',
    '...bbbbb...',
    '....bbb....'] },
  { s: 2, n: 'ラジオ', p: { a: '#e8a06a', b: '#2b2a33', c: '#f2c14e' }, m: [
    '........b..',
    '.......b...',
    '......bb...',
    'aaaaaaaaaaa',
    'abbbbba.c.a',
    'abbbbba...a',
    'abbbbba.c.a',
    'abbbbba...a',
    'aaaaaaaaaaa',
    '.a.......a.',
    '...........'] },
  { s: 2, n: 'アームチェア', p: { a: '#6cbf8a', b: '#3fa66b' }, m: [
    '.aaaa......',
    'aaaaaa.....',
    'aaaaaa.....',
    'aaaaaa.....',
    'aaaaaabbbb.',
    'aaaaaabbbbb',
    'aaaaaaaaaaa',
    'aaaaaaaaaaa',
    '.aaaaaaaaa.',
    '.a.......a.',
    '.a.......a.'] },
  // ---------- ★3 13×13 ----------
  { s: 3, n: 'グランドピアノ', p: { a: '#2b2a33', b: '#e4ddcf', c: '#a6a08f' }, m: [
    '...........a.',
    '..........aa.',
    '.........aa..',
    '........aa...',
    '.......aa....',
    '.aaaaaaaaaaaa',
    'aaaaaaaaaaaaa',
    'abababababaaa',
    'aaaaaaaaaaaaa',
    '.a...c....a..',
    '.a..ccc...a..',
    '.a........a..',
    '.a........a..'] },
  { s: 3, n: 'テレビ', p: { a: '#2b2a33', c: '#a0703e', d: '#5cc4c9' }, m: [
    '..a......a...',
    '..aa.....a...',
    '....a....a...',
    'aaaaaaaaaaaaa',
    'a.........aaa',
    'a.dd......a.a',
    'a..d......aaa',
    'a.........a.a',
    'a.........aaa',
    'aaaaaaaaaaaaa',
    '.cccccccccc..',
    '.c..cc....c..',
    '.c........c..'] },
  { s: 3, n: 'そうじき', p: { a: '#e86f5a', b: '#2b2a33', c: '#c9c3b5' }, m: [
    '.....cccc....',
    '....c...cc...',
    '...c......c..',
    '...c......c..',
    '...c.......c.',
    '...cc......c.',
    '.aaaaa.....c.',
    'aaaaaaa....c.',
    'aaaaaaaa...c.',
    'aaaaaaaa..cc.',
    '.aaaaaa..cc..',
    '.bb..bb.cccc.',
    '.bb..bb.cccc.'] },
  { s: 3, n: '鳥かご', p: { a: '#f2c14e', b: '#5b8def', c: '#e86f5a' }, m: [
    '......a......',
    '.....aaa.....',
    '...aaaaaaa...',
    '..a.a.a.a.a..',
    '.a..a.a.a..a.',
    '.a..a.a.a..a.',
    '.a..bbb.a..a.',
    '.a.bbbbbc..a.',
    '.a..bbbba..a.',
    '.a..a.bba..a.',
    '.aaaaaaaaaaa.',
    'aaaaaaaaaaaaa',
    '...a.....a...'] },
  { s: 3, n: 'ミシン', p: { a: '#5cc4c9', b: '#2b2a33', c: '#f29bb4', d: '#a0703e' }, m: [
    '..aaaaaaaaaa.',
    '.aaaaaaaaaaaa',
    '.aa......aaaa',
    '.aa......aaba',
    '.aa......aaaa',
    '.bb......aaa.',
    '.b.......aaa.',
    'ccc......aaa.',
    'aaaaaaaaaaaa.',
    'aaaaaaaaaaaaa',
    'ddddddddddddd',
    '.d.........d.',
    '.d.........d.'] },
  // ---------- ★4 14×14 ----------
  { s: 4, n: 'せんたくき', p: { a: '#c9c3b5', b: '#5b8def', c: '#2b2a33', d: '#e4ddcf' }, m: [
    'aaaaaaaaaaaaaa',
    'a.cc.c.c.....a',
    'aaaaaaaaaaaaaa',
    'a............a',
    'a...cccccc...a',
    'a..cccccccc..a',
    'a.cc.dd...cc.a',
    'a.cc..dd..cc.a',
    'a.cc......cc.a',
    'a.cc......cc.a',
    'a..cccccccc..a',
    'a..ccccccc...a',
    'aaaaaaaaaaaaaa',
    '.cc.......cc..'] },
  { s: 4, n: 'だんろ', p: { a: '#a0703e', b: '#e86f5a', c: '#f2c14e', d: '#2b2a33' }, m: [
    '.........d....',
    'aaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaa',
    '.aaaaaaaaaaaa.',
    '.aa........aa.',
    '.aa.....b..aa.',
    '.aa....bb..aa.',
    '.aa..b.bcb.aa.',
    '.aa.bbbccb.aa.',
    '.aa.bccccb.aa.',
    '.aa.ddddddd.a.',
    '.aaaaaaaaaaaa.',
    'aaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaa'] },
  { s: 4, n: 'トースター', p: { a: '#c9c3b5', b: '#2b2a33', c: '#e86f5a', d: '#e8a06a' }, m: [
    '..dddd........',
    '..d..d..dddd..',
    '..d..d..d..d..',
    '.aaaaaaaaaaaa.',
    'aaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaa',
    'aa........aaab',
    'aaaaaaaaaaaaab',
    'aaaaaaaaaaaaa.',
    'aa.cc.cc..aaa.',
    'aaaaaaaaaaaaa.',
    'aaaaaaaaaaaaa.',
    '.aaaaaaaaaaa..',
    '.b.........b..'] },
  { s: 4, n: 'レコードプレーヤー', p: { a: '#a0703e', b: '#2b2a33', c: '#e86f5a', d: '#c9c3b5' }, m: [
    '..............',
    '...bbbbb...d..',
    '..bbbbbbb..d..',
    '.bbbbbbbbb.d..',
    '.bbbbcbbbb.d..',
    '.bbbcccbbbd...',
    '.bbbbcbbbdd...',
    '.bbbbbbbbb....',
    '..bbbbbbb.....',
    '...bbbbb......',
    'aaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaa',
    '.a..........a.'] },
  { s: 4, n: 'コーヒーメーカー', p: { a: '#2b2a33', b: '#e86f5a', c: '#e4ddcf', d: '#a0703e' }, m: [
    'aaaaaaaaaaaa..',
    'aaaaaaaaaaaa..',
    'aa.......aaa..',
    'aa.......aaa..',
    'aa..b....aaa..',
    'aa.......aaa..',
    'aa.cccccc.aa..',
    'aa.c....cccc..',
    'aa.cddddc..c..',
    'aa.cddddcccc..',
    'aa.cddddc.aa..',
    'aa..cccc..aa..',
    'aaaaaaaaaaaa..',
    'aaaaaaaaaaaaa.'] },
  // ---------- ★5 15×15 ----------
  { s: 5, n: '本棚', p: { a: '#a0703e', b: '#e86f5a', c: '#5b8def', d: '#f2c14e', e: '#6cbf8a' }, m: [
    'aaaaaaaaaaaaaaa',
    'a.............a',
    'abccdde..eebb.a',
    'abccd..e.eebb.a',
    'abccdd..eeebb.a',
    'aaaaaaaaaaaaaaa',
    'a.............a',
    'a.dd....ccebb.a',
    'a.dd..b.ccebb.a',
    'a.ddcbbbccebb.a',
    'aaaaaaaaaaaaaaa',
    'a.ee..........a',
    'a.eebb..dddd..a',
    'a.eebb.ccccccca',
    'aaaaaaaaaaaaaaa'] },
  { s: 5, n: 'パソコンづくえ', p: { a: '#a0703e', b: '#2b2a33', c: '#5cc4c9', d: '#e86f5a' }, m: [
    '..bbbbbbbb.....',
    '..bccccccb.....',
    '..bccccccb.....',
    '..bccccccb.....',
    '..bbbbbbbb.....',
    '.....bb.....d..',
    '...bbbbbb..ddd.',
    'aaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaa',
    '.a......aaaaaa.',
    '.a......a....a.',
    '.a......aaaaaa.',
    '.a......a....a.',
    '.a......aaaaaa.',
    '.a......a....a.'] },
  { s: 5, n: 'コンロとやかん', p: { a: '#c9c3b5', b: '#2b2a33', c: '#5cc4c9', d: '#e86f5a' }, m: [
    '.....bbbb......',
    '....b....b.....',
    '....b....b.....',
    '...cccccccc.c..',
    '..cccccccccc.c.',
    '..ccccccccccc..',
    '..cccccccccc...',
    '...cccccccc....',
    '.....dddd......',
    'aaaaaaaaaaaaaaa',
    'abbbbbbbbbbbbba',
    'aaaaaaaaaaaaaaa',
    'a.bb.bb.bb..d.a',
    'aaaaaaaaaaaaaaa',
    'a.bbbbbbbbbbb.a'] },
  { s: 5, n: 'おふろ', p: { a: '#e4ddcf', b: '#5cc4c9', c: '#f2c14e', d: '#c9c3b5', e: '#e86f5a' }, m: [
    'dd.............',
    'dddd...........',
    '.d.dd..........',
    '.d..d..........',
    '.d..........c..',
    '.d.........cce.',
    '.d...b.b...ccc.',
    '.d....b.bbcccc.',
    'aaaaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaa',
    '.aaaaaaaaaaaaa.',
    '.aaaaaaaaaaaaa.',
    '..aaaaaaaaaaa..',
    '..d.........d..',
    '.dd.........dd.'] },
  { s: 5, n: 'まどべのねこ', p: { a: '#5b8def', c: '#2b2a33', d: '#f2c14e', e: '#e86f5a' }, m: [
    'aaaaaaaaaaaaaaa',
    'a......a......a',
    'a.dd...a......a',
    'a.dd...a......a',
    'a......a......a',
    'aaaaaaaaaaaaaaa',
    'a......a......a',
    'a......a.c..c.a',
    'a......a.cccc.a',
    'a......a.c.cc.a',
    'aaaaaaaaacccc.a',
    '.........cccccc',
    'eeeeeeeeecccccc',
    'eeeeeeeeeeeeeee',
    '.e...........e.'] },
];
const cluesOf = (line) => { const out = []; let n = 0; for (const v of line) { if (v) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; };
export const ABURI_SIZE = [10, 11, 13, 14, 15];
// その★の絵から1枚。さいきん出た絵はなるべく出さない（この端末で覚えておく）
function pickPic(star) {
  const pool = PICS.filter(p => p.s === star); let recent = [];
  try { recent = JSON.parse(localStorage.getItem('studyroom.aburiRecent') || '[]'); } catch (e) { /* なし */ }
  const fresh = pool.filter(p => !recent.includes(p.n)), from = fresh.length ? fresh : pool;
  const pic = from[Math.floor(Math.random() * from.length)];
  try { localStorage.setItem('studyroom.aburiRecent', JSON.stringify([pic.n, ...recent.filter(n => n !== pic.n)].slice(0, 12))); } catch (e) { /* なし */ }
  return pic;
}

// ---------------- 六畳ロジック：問題を作る ----------------
const SD = 6;
const sdCan = (g, r, c, v) => { for (let i = 0; i < SD; i++) if (g[r][i] === v || g[i][c] === v) return false; const br = Math.floor(r / 2) * 2, bc = Math.floor(c / 3) * 3; for (let y = br; y < br + 2; y++) for (let x = bc; x < bc + 3; x++) if (g[y][x] === v) return false; return true; };
function sdFill(g) { for (let i = 0; i < SD * SD; i++) { const r = Math.floor(i / SD), c = i % SD; if (g[r][c] >= 0) continue; for (const v of shuffle([0, 1, 2, 3, 4, 5])) if (sdCan(g, r, c, v)) { g[r][c] = v; if (sdFill(g)) return true; g[r][c] = -1; } return false; } return true; }
function sdCount(g, lim = 2) { let n = 0; (function go() { if (n >= lim) return; let best = null, bc = 9; for (let i = 0; i < SD * SD; i++) { const r = Math.floor(i / SD), c = i % SD; if (g[r][c] >= 0) continue; let k = 0; for (let v = 0; v < SD; v++) if (sdCan(g, r, c, v)) k++; if (k < bc) { bc = k; best = [r, c]; } } if (!best) { n++; return; } const [r, c] = best; for (let v = 0; v < SD; v++) if (sdCan(g, r, c, v)) { g[r][c] = v; go(); g[r][c] = -1; if (n >= lim) return; } })(); return n; }
export function genRokujo(target) {
  let best = null;
  for (let t = 0; t < 6; t++) {
    const sol = Array.from({ length: SD }, () => Array(SD).fill(-1)); sdFill(sol);
    const g = sol.map(r => [...r]);
    for (const i of shuffle([...Array(SD * SD).keys()])) { const r = Math.floor(i / SD), c = i % SD, keep = g[r][c]; g[r][c] = -1; if (sdCount(g.map(x => [...x])) !== 1) g[r][c] = keep; if (g.flat().filter(v => v >= 0).length <= target) break; }
    const n = g.flat().filter(v => v >= 0).length;
    if (!best || Math.abs(n - target) < Math.abs(best.n - target)) best = { sol, puzzle: g, n };
    if (n <= target) break;
  }
  return best;
}

// ---------------- おひっこし：段階（最短手数はコンピューターで確かめ済み） ----------------
const SLIDES = [
  [8, [["S",1,1,2,2],["V",2,3,1,2],["V",3,0,1,2],["V",1,3,1,2],["H",0,0,2,1],["s",0,4,1,1],["s",0,3,1,1]]],
  [10, [["S",2,1,2,2],["V",0,3,1,2],["V",3,3,1,2],["V",1,2,1,2],["H",1,0,2,1],["s",2,3,1,1],["s",0,2,1,1]]],
  [16, [["S",0,0,2,2],["V",0,2,1,2],["V",3,0,1,2],["V",1,3,1,2],["H",2,4,2,1],["s",2,0,1,1],["s",2,1,1,1]]],
  [19, [["S",1,0,2,2],["V",0,1,1,2],["V",3,1,1,2],["H",1,3,2,1],["s",0,3,1,1],["s",3,3,1,1],["s",0,0,1,1],["s",3,0,1,1]]],
  [21, [["S",2,0,2,2],["V",2,2,1,2],["V",1,0,1,2],["V",0,2,1,2],["H",2,4,2,1],["s",1,3,1,1],["s",3,3,1,1]]],
  [24, [["S",1,1,2,2],["V",3,1,1,2],["V",0,3,1,2],["V",1,3,1,2],["H",2,3,2,1],["s",3,0,1,1],["s",2,0,1,1],["s",1,0,1,1],["s",2,4,1,1]]],
  [29, [["S",1,0,2,2],["V",1,2,1,2],["V",2,2,1,2],["V",0,3,1,2],["H",1,4,2,1],["s",3,1,1,1],["s",3,2,1,1],["s",0,2,1,1],["s",0,1,1,1]]],
  [31, [["S",1,0,2,2],["V",3,0,1,2],["V",3,3,1,2],["V",0,1,1,2],["H",1,2,2,1],["s",0,4,1,1],["s",2,4,1,1],["s",1,4,1,1],["s",3,2,1,1]]],
  [34, [["S",0,1,2,2],["V",1,3,1,2],["V",2,3,1,2],["V",3,0,1,2],["H",2,2,2,1],["s",3,4,1,1],["s",3,3,1,1],["s",0,0,1,1],["s",0,4,1,1]]],
];
// ★ごとに使う段階（SLIDES の番号）。1.15.0 で手数の上限はなくした
const SLIDE_POOL = [[0, 1], [2, 3], [4, 5], [6, 7], [8]];
function slideLevel(star) {
  const pool = SLIDE_POOL[star - 1], [min, st] = SLIDES[pool[Math.floor(Math.random() * pool.length)]];
  return { min, st };
}
// 手数で決まるポイントの割合：最短なら100%、最短の2倍で50%、それより多くても50%
export const slideRate = (moves, min) => moves <= min ? 1 : Math.max(0.5, 1 - 0.5 * (moves - min) / min);
const UNDO_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';
const RESET_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';

// ================= 画面に組み立てる =================
// mountPuzzle(id, star, host, { onWin({ mistakes, moves }), onLose(), onChange() })
const FUR = [['ソファ', '#e86f5a', 'sofa'], ['ベッド', '#5b8def', 'bed'], ['つくえ', '#f2b84b', 'desk'], ['植物', '#6cbf8a', 'plant'], ['いす', '#b28ad6', 'chair'], ['たな', '#5cc4c9', 'shelf']];
// 平面的な家具のイラスト（白い面と、こい線）。w×h は形の比（1×1・1×2・2×1）
export const INK = '#2b2a33';
const ART = {
  sofa: [40, 40, `<rect x="7" y="9" width="26" height="13" rx="4"/><rect x="3" y="16" width="8" height="15" rx="3"/><rect x="29" y="16" width="8" height="15" rx="3"/><rect x="9" y="21" width="22" height="9" rx="2"/><rect x="6" y="30" width="3" height="4" fill="${INK}"/><rect x="31" y="30" width="3" height="4" fill="${INK}"/>`],
  bed: [40, 40, `<rect x="4" y="8" width="5" height="26" rx="2"/><rect x="6" y="19" width="31" height="9" rx="2"/><rect x="11" y="13" width="9" height="6" rx="2.5"/><rect x="21" y="16" width="16" height="5" rx="2" fill-opacity=".7"/><rect x="33" y="27" width="3" height="7" fill="${INK}"/>`],
  desk: [40, 40, `<rect x="3" y="13" width="34" height="5" rx="1.5"/><rect x="6" y="18" width="3" height="16"/><rect x="22" y="18" width="12" height="16" rx="1"/><rect x="25" y="22" width="6" height="2" fill="${INK}"/><rect x="25" y="28" width="6" height="2" fill="${INK}"/><rect x="9" y="6" width="9" height="7" rx="1" fill-opacity=".7"/>`],
  plant: [40, 40, `<path d="M13 24h14l-2 11H15z"/><ellipse cx="14" cy="15" rx="5" ry="9" transform="rotate(-25 14 15)"/><ellipse cx="26" cy="15" rx="5" ry="9" transform="rotate(25 26 15)"/><ellipse cx="20" cy="11" rx="4.5" ry="9"/><rect x="19" y="18" width="2" height="7" fill="${INK}"/>`],
  chair: [40, 40, `<rect x="11" y="5" width="5" height="20" rx="2"/><rect x="11" y="20" width="19" height="5" rx="2"/><rect x="12" y="25" width="3" height="11"/><rect x="26" y="25" width="3" height="11"/>`],
  shelf: [40, 40, `<rect x="8" y="4" width="24" height="32" rx="1.5" fill="none" stroke="#fff" stroke-width="3"/><rect x="8" y="14" width="24" height="2.5"/><rect x="8" y="25" width="24" height="2.5"/><rect x="11" y="7" width="3" height="7"/><rect x="15" y="8" width="3" height="6" fill-opacity=".7"/><rect x="22" y="18" width="3" height="7"/><rect x="26" y="19" width="3" height="6" fill-opacity=".7"/>`],
  tallshelf: [40, 80, `<rect x="5" y="4" width="30" height="72" rx="2" fill="none" stroke="#fff" stroke-width="3.5"/><rect x="5" y="22" width="30" height="3"/><rect x="5" y="40" width="30" height="3"/><rect x="5" y="58" width="30" height="3"/><rect x="9" y="9" width="4" height="13"/><rect x="14" y="11" width="4" height="11" fill-opacity=".7"/><rect x="24" y="27" width="4" height="13"/><rect x="9" y="45" width="4" height="13" fill-opacity=".7"/><rect x="14" y="47" width="5" height="11"/><rect x="22" y="63" width="9" height="9" rx="1" fill-opacity=".7"/>`],
  bench: [80, 40, `<rect x="6" y="12" width="68" height="9" rx="3"/><rect x="10" y="21" width="5" height="13"/><rect x="65" y="21" width="5" height="13"/><rect x="10" y="27" width="60" height="3" fill-opacity=".7"/>`],
  bigsofa: [80, 80, `<rect x="12" y="14" width="56" height="28" rx="7"/><rect x="4" y="30" width="16" height="32" rx="6"/><rect x="60" y="30" width="16" height="32" rx="6"/><rect x="18" y="42" width="44" height="18" rx="4"/><rect x="38" y="42" width="3" height="18" fill="${INK}" fill-opacity=".35"/><rect x="10" y="62" width="5" height="8" fill="${INK}"/><rect x="65" y="62" width="5" height="8" fill="${INK}"/>`],
  lamp: [40, 40, `<path d="M12 16 L28 16 L32 26 L8 26 Z" fill="${INK}"/><rect x="19" y="4" width="2" height="12" fill="${INK}"/><circle cx="20" cy="29" r="4" fill="#fff7c2" stroke="${INK}" stroke-width="2"/>`],
};
export const art = (k, cls = 'pz-art') => { const [w, h, body] = ART[k]; return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" fill="#fff" aria-hidden="true">${body}</svg>`; };
const REG = ['#e86f5a', '#5b8def', '#f2b84b', '#6cbf8a', '#b28ad6', '#f29bb4', '#5cc4c9', '#a6a08f', '#e8a06a'];
export function mountPuzzle(id, lv, host, cb = {}) {
  host.innerHTML = '';
  const LIVES = livesOf(lv), life = { n: LIVES };
  const h = (t) => { const d = document.createElement('div'); d.innerHTML = t.trim(); return d.firstChild; };
  const shake = (el) => { el.classList.remove('pz-shake'); void el.offsetWidth; el.classList.add('pz-shake'); };
  let over = false;
  const miss = (el) => { life.n--; shake(el); cb.onChange?.(life.n); if (!life.n) { over = true; cb.onLose?.(); } };
  const win = (extra = {}) => { over = true; cb.onWin?.({ mistakes: LIVES - life.n, ...extra }); };

  if (id === 'akari') {
    const N = akariSize(lv); const { reg, sol } = genAkari(N, lv);
    const st = Array.from({ length: N }, () => Array(N).fill(0));
    const board = h(`<div class="pz-board pz-akari" style="grid-template-columns:repeat(${N},1fr)"></div>`); host.appendChild(board);
    const draw = () => {
      board.innerHTML = '';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const b = document.createElement('button'); b.className = 'pz-cell'; b.style.background = REG[reg[y][x]];
        const bd = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= N || ny >= N || reg[ny][nx] !== reg[y][x]; };
        b.style.boxShadow = [bd(0, -1) && 'inset 0 3px 0 #2b2a33', bd(0, 1) && 'inset 0 -3px 0 #2b2a33', bd(-1, 0) && 'inset 3px 0 0 #2b2a33', bd(1, 0) && 'inset -3px 0 0 #2b2a33'].filter(Boolean).join(',');
        b.innerHTML = st[y][x] === 2 ? art('lamp', 'pz-art pz-lampart') : st[y][x] === 1 ? '<span class="pz-x">×</span>' : '';
        b.setAttribute('aria-label', `${y + 1}行${x + 1}列`);
        b.onclick = () => {
          if (over) return;
          const nv = (st[y][x] + 1) % 3;
          if (nv === 2 && sol[y] !== x) { st[y][x] = 1; draw(); miss(board); return; }
          st[y][x] = nv; draw();
          if (st.every((row, r) => row[sol[r]] === 2)) win();
        };
        board.appendChild(b);
      }
    };
    draw();
    host._solve = () => { for (let r = 0; r < N; r++) { const c = sol[r]; for (let k = 0; k < 3 && !board.children[r * N + c].querySelector('svg'); k++) board.children[r * N + c].click(); } };
  }

  if (id === 'aburi') {
    const pic = pickPic(lv), G = pic.m.map(r => [...r].map(ch => ch === '.' ? 0 : 1)), Hn = G.length, Wn = G[0].length;
    const mark = G.map(r => r.map(() => 0)); let mode = 1;
    // ★1・★2 だけ、はじめからいくつかぬってある
    const filled = []; G.forEach((r, y) => r.forEach((v, x) => { if (v) filled.push([y, x]); }));
    shuffle(filled).slice(0, Math.round(filled.length * (ABURI_REVEAL[lv - 1] || 0))).forEach(([y, x]) => { mark[y][x] = 1; });
    const wrap = h(`<div class="pz-aburi n${Wn}"><div class="pz-nono"></div><div class="pz-tools"><button class="pz-tool on" data-m="1">ぬる</button><button class="pz-tool" data-m="2">×</button></div><p class="pz-tip">指でなぞると、まとめてぬれます</p></div>`); host.appendChild(wrap);
    const board = wrap.querySelector('.pz-nono');
    wrap.querySelectorAll('.pz-tool').forEach(b => b.onclick = () => { mode = +b.dataset.m; wrap.querySelectorAll('.pz-tool').forEach(x => x.classList.toggle('on', x === b)); });
    const rc = G.map(cluesOf), cc = G[0].map((_, x) => cluesOf(G.map(r => r[x])));
    const cells = [], rowClue = [], colClue = [];
    board.style.gridTemplateColumns = `auto repeat(${Wn}, 1fr)`;
    board.appendChild(document.createElement('div'));
    cc.forEach((c) => { const d = document.createElement('div'); d.className = 'pz-clue c'; d.innerHTML = c.map(v => `<span>${v}</span>`).join(''); board.appendChild(d); colClue.push(d); });
    for (let y = 0; y < Hn; y++) {
      const d = document.createElement('div'); d.className = 'pz-clue r'; d.textContent = rc[y].join(' '); board.appendChild(d); rowClue.push(d);
      cells.push([]);
      for (let x = 0; x < Wn; x++) {
        const b = document.createElement('button'); b.className = 'pz-cell'; b.dataset.y = y; b.dataset.x = x;
        const sh = [(x + 1) % 5 === 0 && x < Wn - 1 && 'inset -2px 0 0 #2b2a33', (y + 1) % 5 === 0 && y < Hn - 1 && 'inset 0 -2px 0 #2b2a33'].filter(Boolean);
        if (sh.length) b.style.boxShadow = sh.join(',');
        board.appendChild(b); cells[y].push(b);
      }
    }
    const paint = (y, x) => {
      const b = cells[y][x], m = mark[y][x];
      b.style.background = m === 1 ? (over && life.n ? pic.p[pic.m[y][x]] || '#2b2a33' : '#2b2a33') : '#fff';
      b.innerHTML = m === 2 ? '<span class="pz-x">×</span>' : '';
    };
    const doneRow = (y) => G[y].every((v, x) => !v || mark[y][x] === 1), doneCol = (x) => G.every((r, y) => !r[x] || mark[y][x] === 1);
    const lines = (y, x) => { rowClue[y].classList.toggle('done', doneRow(y)); colClue[x].classList.toggle('done', doneCol(x)); };
    const paintAll = () => { for (let y = 0; y < Hn; y++) for (let x = 0; x < Wn; x++) paint(y, x); for (let y = 0; y < Hn; y++) rowClue[y].classList.toggle('done', doneRow(y)); for (let x = 0; x < Wn; x++) colClue[x].classList.toggle('done', doneCol(x)); };
    // 1マスに印をつける。まちがいなら false（なぞるのをやめる）
    const act = (y, x) => {
      if (over || mark[y][x]) return true;
      if (mode === 1 && !G[y][x]) { mark[y][x] = 2; paint(y, x); miss(board); return false; }
      if (mode === 2 && G[y][x]) { mark[y][x] = 1; paint(y, x); lines(y, x); miss(board); return false; }
      mark[y][x] = mode; paint(y, x); lines(y, x);
      if (G.every((r, yy) => r.every((v, xx) => !v || mark[yy][xx] === 1))) {
        over = true; G.forEach((r, yy) => r.forEach((v, xx) => { if (!v) mark[yy][xx] = 0; }));
        paintAll(); board.classList.add('reveal'); win({ picture: pic.n }); return false;
      }
      return true;
    };
    // 指でなぞる：さいしょのマスと同じ「たて」か「横」の列だけをぬる（ずれてとなりの列をぬらないように）
    let drag = null;
    const cellAt = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); const b = t && t.closest && t.closest('.pz-nono .pz-cell'); return b ? [+b.dataset.y, +b.dataset.x] : null; };
    board.addEventListener('pointerdown', (e) => {
      const c = cellAt(e); if (!c || over) return;
      e.preventDefault();
      drag = { y: c[0], x: c[1], cy: c[0], cx: c[1], axis: null, ok: act(c[0], c[1]) };
      try { board.setPointerCapture(e.pointerId); } catch (er) { /* なし */ }
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag || !drag.ok) return; const c = cellAt(e); if (!c) return;
      if (!drag.axis) { if (c[0] === drag.y && c[1] !== drag.x) drag.axis = 'x'; else if (c[1] === drag.x && c[0] !== drag.y) drag.axis = 'y'; else return; }
      const ty = drag.axis === 'x' ? drag.y : c[0], tx = drag.axis === 'y' ? drag.x : c[1];
      // 間をとばさないよう、1マスずつ
      while ((drag.cy !== ty || drag.cx !== tx) && drag.ok) { drag.cy += Math.sign(ty - drag.cy); drag.cx += Math.sign(tx - drag.cx); drag.ok = act(drag.cy, drag.cx); }
    });
    const end = () => { drag = null; };
    board.addEventListener('pointerup', end); board.addEventListener('pointercancel', end);
    // キーボード・ためし用（指やマウスは pointerdown で受けるので、detail が 0 のクリックだけ）
    board.addEventListener('click', (e) => { if (e.detail !== 0) return; const b = e.target.closest('.pz-cell'); if (b) act(+b.dataset.y, +b.dataset.x); });
    paintAll();
    host._solve = () => { wrap.querySelector('.pz-tool[data-m="1"]').click(); for (let y = 0; y < Hn; y++) for (let x = 0; x < Wn; x++) if (G[y][x] && !over) cells[y][x].click(); };
    host._pic = pic.n; host._G = G;
  }

  if (id === 'rokujo') {
    const { sol, puzzle } = genRokujo(rokujoGiven(lv));
    const cur = puzzle.map(r => [...r]), given = puzzle.map(r => r.map(v => v >= 0)); let sel = null;
    const wrap = h(`<div class="pz-rokujo"><div class="pz-board pz-sd"></div><div class="pz-pal"></div></div>`); host.appendChild(wrap);
    const board = wrap.querySelector('.pz-sd'), pal = wrap.querySelector('.pz-pal');
    const draw = () => {
      board.innerHTML = '';
      for (let r = 0; r < SD; r++) for (let c = 0; c < SD; c++) {
        const e = document.createElement('button'), v = cur[r][c];
        e.className = 'pz-cell' + (given[r][c] ? ' given' : '') + (sel && sel[0] === r && sel[1] === c ? ' sel' : '');
        e.style.background = v >= 0 ? FUR[v][1] : '#fff'; e.innerHTML = v >= 0 ? art(FUR[v][2]) : ''; if (v >= 0) e.setAttribute('aria-label', FUR[v][0]);
        const sh = [c === 2 && 'inset -3px 0 0 #2b2a33', c === 3 && 'inset 3px 0 0 #2b2a33', r % 2 === 1 && r < SD - 1 && 'inset 0 -3px 0 #2b2a33', r % 2 === 0 && r > 0 && 'inset 0 3px 0 #2b2a33'].filter(Boolean);
        if (sh.length) e.style.boxShadow = sh.join(',');
        e.onclick = () => { if (over || given[r][c] || v >= 0) return; sel = [r, c]; draw(); };
        board.appendChild(e);
      }
    };
    FUR.forEach(([n, col, k], v) => { const b = document.createElement('button'); b.style.background = col; b.innerHTML = art(k) + `<small>${n}</small>`; b.onclick = () => {
      if (over || !sel) return; const [r, c] = sel;
      if (sol[r][c] !== v) { miss(board); return; }
      cur[r][c] = v; sel = null; draw();
      if (cur.flat().every(x => x >= 0)) win();
    }; pal.appendChild(b); });
    draw();
    host._solve = () => { for (let r = 0; r < SD; r++) for (let c = 0; c < SD; c++) if (cur[r][c] < 0) { board.children[r * SD + c].click(); pal.children[sol[r][c]].click(); } };
  }

  if (id === 'hikkoshi') {
    // 1.15.0：手数の上限と「失敗」はなし。「1手戻る」「最初から」で何回でもやり直せる。ポイントは手数で決まる
    const L = slideLevel(lv), W = 4, H = 5;
    const NAME = { S: ['ソファ', '#e86f5a', 'bigsofa'], V: ['本棚', '#6cbf8a', 'tallshelf'], H: ['ベンチ', '#b28ad6', 'bench'], s: ['植物', '#f2b84b', 'plant'] };
    const ps = L.st.map(p => [...p]); let sel = 0, moves = 0; const hist = [];
    const wrap = h(`<div class="pz-slide-wrap"><div class="pz-slide"></div><div class="pz-arrows"><button data-d="0,-1" aria-label="上">↑</button><button data-d="-1,0" aria-label="左">←</button><button data-d="1,0" aria-label="右">→</button><button data-d="0,1" aria-label="下">↓</button></div><div class="pz-undo"><button class="pz-back" disabled>${UNDO_IC}1手戻る</button><button class="pz-reset" disabled>${RESET_IC}最初から</button></div></div>`); host.appendChild(wrap);
    const board = wrap.querySelector('.pz-slide'), backB = wrap.querySelector('.pz-back'), resetB = wrap.querySelector('.pz-reset');
    const done = () => ps[0][1] === 1 && ps[0][2] === 3;
    const free = (i, nx, ny) => { const p = ps[i]; if (nx < 0 || ny < 0 || nx + p[3] > W || ny + p[4] > H) return false; return !ps.some((q, j) => j !== i && nx < q[1] + q[3] && nx + p[3] > q[1] && ny < q[2] + q[4] && ny + p[4] > q[2]); };
    const told = () => { backB.disabled = resetB.disabled = !hist.length || over; cb.onMoves?.(moves, 0, L.min); };
    const move = (dx, dy) => {
      if (over || sel == null) return; const p = ps[sel];
      if (!free(sel, p[1] + dx, p[2] + dy)) { shake(board); return; }
      hist.push([sel, dx, dy]);
      p[1] += dx; p[2] += dy; moves++; draw(); told();
      if (done()) { over = true; told(); win({ moves, min: L.min, best: moves <= L.min }); }
    };
    backB.onclick = () => { if (over || !hist.length) return; const [i, dx, dy] = hist.pop(); ps[i][1] -= dx; ps[i][2] -= dy; sel = i; moves--; draw(); told(); };
    resetB.onclick = () => { if (over || !hist.length) return; L.st.forEach((p, i) => { ps[i] = [...p]; }); hist.length = 0; moves = 0; sel = 0; draw(); told(); };
    const draw = () => {
      const U = Math.min(64, Math.floor((Math.min(host.clientWidth || 300, 320)) / W));
      board.style.width = W * U + 'px'; board.style.height = H * U + 'px';
      board.innerHTML = `<div class="pz-exit" style="left:${U + 4}px;width:${2 * U - 8}px"></div>`;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!ps.some(q => x >= q[1] && x < q[1] + q[3] && y >= q[2] && y < q[2] + q[4])) {
        const e = document.createElement('div'); e.className = 'pz-empty'; e.style.cssText = `left:${x * U + 3}px;top:${y * U + 3}px;width:${U - 6}px;height:${U - 6}px`;
        e.onclick = () => { if (sel == null) return; const p = ps[sel]; const dx = x < p[1] ? -1 : x >= p[1] + p[3] ? 1 : 0, dy = y < p[2] ? -1 : y >= p[2] + p[4] ? 1 : 0; if (!dx !== !dy) move(dx, dy); };
        board.appendChild(e);
      }
      ps.forEach((p, i) => { const b = document.createElement('button'); b.className = 'pz-blk' + (sel === i ? ' sel' : ''); b.style.cssText = `left:${p[1] * U + 3}px;top:${p[2] * U + 3}px;width:${p[3] * U - 6}px;height:${p[4] * U - 6}px;background:${NAME[p[0]][1]}`; b.innerHTML = art(NAME[p[0]][2]); b.setAttribute('aria-label', NAME[p[0]][0]); b.onclick = () => { sel = i; draw(); }; board.appendChild(b); });
    };
    wrap.querySelectorAll('.pz-arrows button').forEach(b => b.onclick = () => { const [dx, dy] = b.dataset.d.split(',').map(Number); move(dx, dy); });
    requestAnimationFrame(draw);
    // ためし用：最短の手順で解く（コンピューターで探す）
    host._solve = () => {
      const key = (q) => q.map(p => p[0] + p[1] + ',' + p[2]).sort().join('|') + '#' + q[0][1] + q[0][2];
      const start = ps.map(p => [...p]); const seen = new Map([[key(start), null]]); let qu = [start], goal = null;
      while (qu.length && !goal) { const nq = []; for (const cur of qu) { if (cur[0][1] === 1 && cur[0][2] === 3) { goal = cur; break; }
        cur.forEach((p, i) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = p[1] + dx, ny = p[2] + dy; if (nx < 0 || ny < 0 || nx + p[3] > W || ny + p[4] > H) continue; if (cur.some((q, j) => j !== i && nx < q[1] + q[3] && nx + p[3] > q[1] && ny < q[2] + q[4] && ny + p[4] > q[2])) continue; const n = cur.map(x => [...x]); n[i][1] = nx; n[i][2] = ny; const k = key(n); if (!seen.has(k)) { seen.set(k, [cur, i, dx, dy]); nq.push(n); } } }); } qu = nq; }
      const path = []; for (let c = goal; seen.get(key(c)); c = seen.get(key(c))[0]) path.unshift(seen.get(key(c)).slice(1));
      for (const [i, dx, dy] of path) { sel = i; move(dx, dy); }
    };
    host._move = (i, dx, dy) => { sel = i; move(dx, dy); };
    told();
  }
  return life;
}
