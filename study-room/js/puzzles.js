// パズルモードの頭脳パズル4種（平面的なデザイン）。
//   akari   … あかりの間取り：色の部屋・たて・横に照明1つずつ、照明どうしはとなり合わない
//   aburi   … 家具あぶりだし：数字のヒントでマスをぬると家具の絵
//   rokujo  … 六畳ロジック：6×6 に6種類の家具を、たて・横・ブロックに1つずつ
//   hikkoshi… おひっこし：家具をすべらせて、ソファを出口へ（手数の上限つき）
// どの問題も答えが1つに決まり、勘にたよらず解けることを確かめてある（akari・rokujo はその場で作って確かめる）。
// まちがいは3回まで。クリアするとレベル（強化）が上がって、むずかしくなる。

export const PUZZLES = [
  { id: 'akari', name: 'あかりの間取り', icon: 'light', short: '部屋ごとに照明を1つ', rule: '色の部屋・たての列・横の列に、照明はちょうど1つずつ。照明どうしは、ななめもふくめてとなり合いません。マスを押すと「×」→「照明」→「なし」。' },
  { id: 'aburi', name: '家具あぶりだし', icon: 'image', short: '数字からぬって絵を出す', rule: '列と行の数字は、ぬるマスが何個つづくか（「2 1」は2個つづき、あけて1個）。全部ぬると家具の絵があらわれます。「ぬる」と「×」を切りかえて使います。' },
  { id: 'rokujo', name: '六畳ロジック', icon: 'grid', short: '6種類の家具を1つずつ', rule: '6×6のマスに6種類の家具。たての列・横の列・太い線のブロック（2×3）に、同じ家具は1つずつ。マスを選んでから、下の家具を押します。' },
  { id: 'hikkoshi', name: 'おひっこし', icon: 'sofa', short: 'ソファを出口へ運ぶ', rule: '家具をたて・横にすべらせて、赤いソファを下の出口（緑）から出します。家具を押してから、行きたい方向の空きマスか矢印を押します。手数の上限をこえると失敗。' },
];
export const puzzleById = (id) => PUZZLES.find(p => p.id === id);

// レベル（強化）ごとのむずかしさの説明
export function levelInfo(id, lv) {
  if (id === 'akari') { const n = akariSize(lv); return `${n}×${n}`; }
  if (id === 'aburi') return `${PICS[(lv - 1) % PICS.length].m.length}×${PICS[(lv - 1) % PICS.length].m.length}`;
  if (id === 'rokujo') return `ヒント ${rokujoGiven(lv)}個`;
  if (id === 'hikkoshi') { const L = slideLevel(lv); return `最短 ${L.min}手・上限 ${L.limit}手`; }
  return '';
}
const akariSize = (lv) => Math.min(9, 5 + Math.ceil(lv / 2));          // Lv1-2:6 Lv3-4:7 Lv5-6:8 Lv7〜:9
const rokujoGiven = (lv) => Math.max(9, 17 - lv);                       // ヒントの数（少ないほどむずかしい）

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------- あかりの間取り：問題を作る ----------------
function akariCount(N, reg, limit = 2) {
  let n = 0; const col = Array(N).fill(false), used = Array(N).fill(false), pos = [];
  (function row(r) { if (n >= limit) return; if (r === N) { n++; return; }
    for (let c = 0; c < N; c++) { if (col[c] || used[reg[r][c]] || (r && Math.abs(pos[r - 1] - c) < 2)) continue;
      col[c] = used[reg[r][c]] = true; pos[r] = c; row(r + 1); col[c] = used[reg[r][c]] = false; } })(0);
  return n;
}
export function genAkari(N) {
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

// ---------------- 家具あぶりだし：絵（どれも勘なしで解けることを確かめ済み。やさしい順） ----------------
export const PICS = [
  { n: 'テーブル', c: '#f2b84b', m: ['..........', '##########', '##########', '.#......#.', '.#......#.', '.#......#.', '.#......#.', '.#......#.', '.#......#.', '##......##'] },
  { n: 'ベッド', c: '#5b8def', m: ['#........#', '#........#', '#.##.....#', '#.##.....#', '##########', '##########', '#........#', '#........#', '..........', '..........'] },
  { n: 'ソファ', c: '#e86f5a', m: ['..........', '.########.', '.########.', '##.####.##', '##########', '##########', '##########', '##########', '.#......#.', '.#......#.'] },
  { n: 'フロアランプ', c: '#f2b84b', m: ['..######..', '.########.', '##########', '..######..', '....##....', '....##....', '....##....', '....##....', '..######..', '.########.'] },
  { n: 'いす', c: '#b28ad6', m: ['..######..', '..#....#..', '..#....#..', '..#....#..', '..######..', '..######..', '.########.', '.#......#.', '.#......#.', '.#......#.'] },
  { n: '本棚', c: '#6cbf8a', m: ['##########', '#.#.##.#.#', '#.#.##.#.#', '##########', '#..#.##..#', '#..#.##..#', '##########', '#.##..#..#', '#.##..#..#', '##########'] },
  { n: '鉢植え', c: '#3fa66b', m: ['...#..#...', '..##.###..', '.###.####.', '..##.##...', '....##....', '...####...', '.########.', '..######..', '..######..', '...####...'] },
  { n: '時計', c: '#5cc4c9', m: ['...####...', '.########.', '.###.####.', '####.#####', '####.#####', '####...###', '##########', '.########.', '.########.', '...####...'] },
];
const clues = (line) => { const out = []; let n = 0; for (const v of line) { if (v) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; };

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
function slideLevel(lv) {
  const i = Math.min(SLIDES.length - 1, lv - 1), extra = Math.max(0, lv - SLIDES.length); // 最後の問題のあとは、上限が少しずつきびしく
  const [min, st] = SLIDES[i];
  return { min, st, limit: min + Math.max(2, 8 - Math.floor(lv / 2) - extra) };
}

// ================= 画面に組み立てる =================
// mountPuzzle(id, lv, host, { onWin({ mistakes, moves }), onLose(), onChange() })
const FUR = [['ソファ', '#e86f5a'], ['ベッド', '#5b8def'], ['つくえ', '#f2b84b'], ['植物', '#6cbf8a'], ['いす', '#b28ad6'], ['たな', '#5cc4c9']];
const REG = ['#e86f5a', '#5b8def', '#f2b84b', '#6cbf8a', '#b28ad6', '#f29bb4', '#5cc4c9', '#a6a08f', '#e8a06a'];
export function mountPuzzle(id, lv, host, cb = {}) {
  host.innerHTML = '';
  const life = { n: 3 };
  const h = (t) => { const d = document.createElement('div'); d.innerHTML = t.trim(); return d.firstChild; };
  const shake = (el) => { el.classList.remove('pz-shake'); void el.offsetWidth; el.classList.add('pz-shake'); };
  let over = false;
  const miss = (el) => { life.n--; shake(el); cb.onChange?.(life.n); if (!life.n) { over = true; cb.onLose?.(); } };
  const win = (extra = {}) => { over = true; cb.onWin?.({ mistakes: 3 - life.n, ...extra }); };

  if (id === 'akari') {
    const N = akariSize(lv); const { reg, sol } = genAkari(N);
    const st = Array.from({ length: N }, () => Array(N).fill(0));
    const board = h(`<div class="pz-board pz-akari" style="grid-template-columns:repeat(${N},1fr)"></div>`); host.appendChild(board);
    const draw = () => {
      board.innerHTML = '';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const b = document.createElement('button'); b.className = 'pz-cell'; b.style.background = REG[reg[y][x]];
        const bd = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= N || ny >= N || reg[ny][nx] !== reg[y][x]; };
        b.style.boxShadow = [bd(0, -1) && 'inset 0 3px 0 #2b2a33', bd(0, 1) && 'inset 0 -3px 0 #2b2a33', bd(-1, 0) && 'inset 3px 0 0 #2b2a33', bd(1, 0) && 'inset -3px 0 0 #2b2a33'].filter(Boolean).join(',');
        b.innerHTML = st[y][x] === 2 ? '<i class="pz-lamp"></i>' : st[y][x] === 1 ? '<span class="pz-x">×</span>' : '';
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
    host._solve = () => { for (let r = 0; r < N; r++) { const c = sol[r]; for (let k = 0; k < 2; k++) board.children[r * N + c].click(); } };
  }

  if (id === 'aburi') {
    const pic = PICS[(lv - 1) % PICS.length], G = pic.m.map(r => [...r].map(ch => ch === '#' ? 1 : 0)), Hn = G.length, Wn = G[0].length;
    const mark = G.map(r => r.map(() => 0)); let mode = 1;
    const wrap = h(`<div class="pz-aburi"><div class="pz-nono"></div><div class="pz-tools"><button class="pz-tool on" data-m="1">ぬる</button><button class="pz-tool" data-m="2">×</button></div></div>`); host.appendChild(wrap);
    const board = wrap.querySelector('.pz-nono');
    wrap.querySelectorAll('.pz-tool').forEach(b => b.onclick = () => { mode = +b.dataset.m; wrap.querySelectorAll('.pz-tool').forEach(x => x.classList.toggle('on', x === b)); });
    const rc = G.map(clues), cc = G[0].map((_, x) => clues(G.map(r => r[x])));
    const draw = () => {
      board.style.gridTemplateColumns = `auto repeat(${Wn}, 1fr)`; board.innerHTML = '';
      board.appendChild(document.createElement('div'));
      cc.forEach((c, x) => { const d = document.createElement('div'); d.className = 'pz-clue c' + (G.every((r, y) => !r[x] || mark[y][x] === 1) ? ' done' : ''); d.innerHTML = c.map(v => `<span>${v}</span>`).join(''); board.appendChild(d); });
      for (let y = 0; y < Hn; y++) {
        const d = document.createElement('div'); d.className = 'pz-clue r' + (G[y].every((v, x) => !v || mark[y][x] === 1) ? ' done' : ''); d.textContent = rc[y].join(' '); board.appendChild(d);
        for (let x = 0; x < Wn; x++) {
          const b = document.createElement('button'); b.className = 'pz-cell'; const m = mark[y][x];
          b.style.background = m === 1 ? (over && life.n ? pic.c : '#2b2a33') : '#fff';
          if (m === 2) b.innerHTML = '<span class="pz-x">×</span>';
          const sh = [(x + 1) % 5 === 0 && x < Wn - 1 && 'inset -2px 0 0 #2b2a33', (y + 1) % 5 === 0 && y < Hn - 1 && 'inset 0 -2px 0 #2b2a33'].filter(Boolean);
          if (sh.length) b.style.boxShadow = sh.join(',');
          b.onclick = () => {
            if (over || m) return;
            if (mode === 1 && !G[y][x]) { mark[y][x] = 2; draw(); miss(board); return; }
            if (mode === 2 && G[y][x]) { mark[y][x] = 1; draw(); miss(board); return; }
            mark[y][x] = mode;
            if (G.every((r, yy) => r.every((v, xx) => !v || mark[yy][xx] === 1))) { over = true; draw(); win({ picture: pic.n }); return; }
            draw();
          };
          board.appendChild(b);
        }
      }
    };
    draw();
    host._solve = () => { wrap.querySelector('.pz-tool[data-m="1"]').click(); for (let y = 0; y < Hn; y++) for (let x = 0; x < Wn; x++) if (G[y][x] && !over) board.children[(Wn + 1) * (y + 1) + 1 + x].click(); };
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
        e.style.background = v >= 0 ? FUR[v][1] : '#fff'; e.textContent = v >= 0 ? FUR[v][0] : '';
        const sh = [c === 2 && 'inset -3px 0 0 #2b2a33', c === 3 && 'inset 3px 0 0 #2b2a33', r % 2 === 1 && r < SD - 1 && 'inset 0 -3px 0 #2b2a33', r % 2 === 0 && r > 0 && 'inset 0 3px 0 #2b2a33'].filter(Boolean);
        if (sh.length) e.style.boxShadow = sh.join(',');
        e.onclick = () => { if (over || given[r][c] || v >= 0) return; sel = [r, c]; draw(); };
        board.appendChild(e);
      }
    };
    FUR.forEach(([n, col], v) => { const b = document.createElement('button'); b.style.background = col; b.textContent = n; b.onclick = () => {
      if (over || !sel) return; const [r, c] = sel;
      if (sol[r][c] !== v) { miss(board); return; }
      cur[r][c] = v; sel = null; draw();
      if (cur.flat().every(x => x >= 0)) win();
    }; pal.appendChild(b); });
    draw();
    host._solve = () => { for (let r = 0; r < SD; r++) for (let c = 0; c < SD; c++) if (cur[r][c] < 0) { board.children[r * SD + c].click(); pal.children[sol[r][c]].click(); } };
  }

  if (id === 'hikkoshi') {
    const L = slideLevel(lv), W = 4, H = 5;
    const NAME = { S: ['ソファ', '#e86f5a'], V: ['本棚', '#6cbf8a'], H: ['ベンチ', '#b28ad6'], s: ['植物', '#f2b84b'] };
    const ps = L.st.map(p => [...p]); let sel = 0, moves = 0;
    const wrap = h(`<div class="pz-slide-wrap"><div class="pz-slide"></div><div class="pz-arrows"><button data-d="0,-1" aria-label="上">↑</button><button data-d="-1,0" aria-label="左">←</button><button data-d="1,0" aria-label="右">→</button><button data-d="0,1" aria-label="下">↓</button></div></div>`); host.appendChild(wrap);
    const board = wrap.querySelector('.pz-slide');
    const done = () => ps[0][1] === 1 && ps[0][2] === 3;
    const free = (i, nx, ny) => { const p = ps[i]; if (nx < 0 || ny < 0 || nx + p[3] > W || ny + p[4] > H) return false; return !ps.some((q, j) => j !== i && nx < q[1] + q[3] && nx + p[3] > q[1] && ny < q[2] + q[4] && ny + p[4] > q[2]); };
    const move = (dx, dy) => {
      if (over || sel == null) return; const p = ps[sel];
      if (!free(sel, p[1] + dx, p[2] + dy)) { shake(board); return; }
      p[1] += dx; p[2] += dy; moves++; draw(); cb.onMoves?.(moves, L.limit);
      if (done()) win({ moves, best: moves <= L.min });
      else if (moves >= L.limit) { over = true; cb.onLose?.('moves'); }
    };
    const draw = () => {
      const U = Math.min(64, Math.floor((Math.min(host.clientWidth || 300, 320)) / W));
      board.style.width = W * U + 'px'; board.style.height = H * U + 'px';
      board.innerHTML = `<div class="pz-exit" style="left:${U + 4}px;width:${2 * U - 8}px"></div>`;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!ps.some(q => x >= q[1] && x < q[1] + q[3] && y >= q[2] && y < q[2] + q[4])) {
        const e = document.createElement('div'); e.className = 'pz-empty'; e.style.cssText = `left:${x * U + 3}px;top:${y * U + 3}px;width:${U - 6}px;height:${U - 6}px`;
        e.onclick = () => { if (sel == null) return; const p = ps[sel]; const dx = x < p[1] ? -1 : x >= p[1] + p[3] ? 1 : 0, dy = y < p[2] ? -1 : y >= p[2] + p[4] ? 1 : 0; if (!dx !== !dy) move(dx, dy); };
        board.appendChild(e);
      }
      ps.forEach((p, i) => { const b = document.createElement('button'); b.className = 'pz-blk' + (sel === i ? ' sel' : ''); b.style.cssText = `left:${p[1] * U + 3}px;top:${p[2] * U + 3}px;width:${p[3] * U - 6}px;height:${p[4] * U - 6}px;background:${NAME[p[0]][1]}`; b.textContent = NAME[p[0]][0]; b.onclick = () => { sel = i; draw(); }; board.appendChild(b); });
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
    cb.onMoves?.(0, L.limit);
  }
  return life;
}
