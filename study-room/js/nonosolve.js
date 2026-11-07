// 家具あぶりだし（ノノグラム）の「数字だけで解けるか」を確かめる道具。
// 行・列の数字だけを見て、1本ずつ「ここは必ずぬる／必ずぬらない」を決めていく（人がする推理と同じ）。
// 当てずっぽうなしに全部のマスが決まれば true。tools/check/puzzle.js と、絵を作る時に使う。

export const cluesOf = (line) => { const out = []; let n = 0; for (const v of line) { if (v) n++; else if (n) { out.push(n); n = 0; } } if (n) out.push(n); return out.length ? out : [0]; };

// 1本の列：known[i] = -1（まだ）/ 0（ぬらない）/ 1（ぬる）。矛盾したら null、そうでなければ決まった結果
export function solveLine(clue, known) {
  const n = known.length, blocks = clue[0] === 0 ? [] : clue, k = blocks.length;
  // canEmpty[i]：i より前に、ブロック b 個を置き終えられるか（前から）
  // f[b][i] = 先頭 i マスにブロック b 個をおさめられる
  const f = Array.from({ length: k + 1 }, () => new Uint8Array(n + 2));
  f[0][0] = 1;
  for (let i = 1; i <= n; i++) f[0][i] = f[0][i - 1] && known[i - 1] !== 1 ? 1 : 0;
  for (let b = 1; b <= k; b++) {
    const L = blocks[b - 1];
    for (let i = 1; i <= n; i++) {
      // マス i-1 をあける
      if (known[i - 1] !== 1 && f[b][i - 1]) { f[b][i] = 1; continue; }
      // マス i-L .. i-1 にブロック b を置く（その前は空き）
      if (i >= L) {
        let ok = true; for (let j = i - L; j < i; j++) if (known[j] === 0) { ok = false; break; }
        if (ok && (i - L === 0 ? b === 1 : (known[i - L - 1] !== 1 && f[b - 1][i - L - 1]))) f[b][i] = 1;
      }
    }
  }
  if (!f[k][n]) return null;
  // うしろからも同じ
  const g = Array.from({ length: k + 2 }, () => new Uint8Array(n + 2)); // g[b][i] = マス i..n-1 にブロック b..k-1 をおさめられる
  g[k][n] = 1;
  for (let i = n - 1; i >= 0; i--) g[k][i] = g[k][i + 1] && known[i] !== 1 ? 1 : 0;
  for (let b = k - 1; b >= 0; b--) {
    const L = blocks[b];
    for (let i = n - 1; i >= 0; i--) {
      if (known[i] !== 1 && g[b][i + 1]) { g[b][i] = 1; continue; }
      if (i + L <= n) {
        let ok = true; for (let j = i; j < i + L; j++) if (known[j] === 0) { ok = false; break; }
        if (ok && (i + L === n ? b === k - 1 : (known[i + L] !== 1 && g[b + 1][i + L + 1]))) g[b][i] = 1;
      }
    }
  }
  const canFill = new Uint8Array(n), canEmpty = new Uint8Array(n);
  // 空き：前に b 個・うしろに残り
  for (let i = 0; i < n; i++) if (known[i] !== 1) for (let b = 0; b <= k; b++) if (f[b][i] && g[b][i + 1]) { canEmpty[i] = 1; break; }
  // ぬる：ブロック b を s..s+L-1 に置く
  for (let b = 0; b < k; b++) {
    const L = blocks[b];
    for (let s = 0; s + L <= n; s++) {
      let ok = true; for (let j = s; j < s + L; j++) if (known[j] === 0) { ok = false; break; }
      if (!ok) continue;
      const before = s === 0 ? b === 0 : (known[s - 1] !== 1 && f[b][s - 1]);
      if (!before) continue;
      const after = s + L === n ? b === k - 1 : (known[s + L] !== 1 && g[b + 1][s + L + 1]);
      if (!after) continue;
      for (let j = s; j < s + L; j++) canFill[j] = 1;
    }
  }
  const out = known.slice();
  for (let i = 0; i < n; i++) {
    if (!canFill[i] && !canEmpty[i]) return null;
    if (canFill[i] && !canEmpty[i]) out[i] = 1; else if (!canFill[i] && canEmpty[i]) out[i] = 0;
  }
  return out;
}

// 盤 G（0/1 の2次元）を、数字だけで解く。戻り値 { solved, grid, passes, decided }
export function solveNono(rows, cols, given = null) {
  const H = rows.length, W = cols.length;
  const g = given ? given.map(r => r.slice()) : Array.from({ length: H }, () => Array(W).fill(-1));
  let passes = 0, changed = true;
  while (changed) {
    changed = false; passes++;
    for (let y = 0; y < H; y++) { const r = solveLine(rows[y], g[y]); if (!r) return { solved: false, contradiction: true, grid: g, passes }; for (let x = 0; x < W; x++) if (r[x] !== g[y][x]) { g[y][x] = r[x]; changed = true; } }
    for (let x = 0; x < W; x++) { const col = g.map(r => r[x]); const r = solveLine(cols[x], col); if (!r) return { solved: false, contradiction: true, grid: g, passes }; for (let y = 0; y < H; y++) if (r[y] !== g[y][x]) { g[y][x] = r[y]; changed = true; } }
    if (passes > 200) break;
  }
  const decided = g.flat().filter(v => v >= 0).length;
  return { solved: decided === H * W, grid: g, passes, decided };
}
// 絵（文字列の配列。'.' は空き）が数字だけで解けるか
export function picSolvable(m) {
  const G = m.map(r => [...r].map(ch => ch === '.' ? 0 : 1)); // . 以外はぬるマス
  const rows = G.map(cluesOf), cols = G[0].map((_, x) => cluesOf(G.map(r => r[x])));
  return solveNono(rows, cols);
}
