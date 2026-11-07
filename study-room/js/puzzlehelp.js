// パズルの遊び方（右上の「i」）。下からカードが出て、小さな盤の上で指が自動で操作してみせる（デザイン案A）。
// 手順ごとに1行の説明（です・ます）。点を押すと、その手順にもどれる。
import { art, INK } from './puzzles.js';
import { MERGE_ITEMS } from './endless.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const T = (ms) => reduce() ? Math.min(ms, 250) : ms;
const A = (k) => art(k, 'ph-art');
const FINGER = `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="M8 2.5a4 4 0 0 1 8 0V17l2-1.2a3.6 3.6 0 0 1 4.6 1.6l.4.8 1.6-.7a3.4 3.4 0 0 1 4.6 2.1l1.2-.3a3.2 3.2 0 0 1 3.9 3.1V31a12 12 0 0 1-12 12h-4.6a12 12 0 0 1-9.8-5.1L2.3 30a3.6 3.6 0 0 1 5.4-4.7L8 25.6z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
const hearts = (n) => `<div class="ph-hearts">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

// ---------------- 4つのパズルの「小さい盤」と手順 ----------------
const AK_REG = [[0, 0, 1, 1], [0, 2, 2, 1], [2, 2, 3, 1], [3, 3, 3, 3]];
const AK_COL = ['#e86f5a', '#5b8def', '#f2b84b', '#6cbf8a'];
const AK_SOL = [1, 3, 0, 2];
const akRegCells = (g) => { const o = []; AK_REG.forEach((row, r) => row.forEach((v, c) => { if (v === g) o.push(`${r},${c}`); })); return o; };
const NO_G = ['#####', '#####', '.#.#.', '.#.#.', '.#.#.'].map(r => [...r].map(ch => ch === '#'));
const clues = (line) => { const o = []; let n = 0; for (const v of line) { if (v) n++; else if (n) { o.push(n); n = 0; } } if (n) o.push(n); return o.length ? o : [0]; };
const RJ_SOL = [[0, 1, 2, 3], [2, 3, 0, 1], [1, 0, 3, 2], [3, 2, 1, 0]];
const RJ_EMPTY = ['0,3', '1,0', '2,2', '3,1', '2,0', '3,3'];
const RJ_FUR = [['sofa', '#e86f5a'], ['bed', '#5b8def'], ['desk', '#f2b84b'], ['plant', '#6cbf8a']];
const SL_W = 3, SL_H = 4;
const SL_NAME = { S: ['bigsofa', '#e86f5a'], V: ['tallshelf', '#6cbf8a'], s: ['plant', '#f2b84b'] };

const DEMOS = {
  akari: {
    init: () => ({ lamp: new Set(), x: new Set(), hl: new Set(), ng: new Set(), done: false, lives: 3 }),
    render(st, host) {
      let h = (st.showLives ? hearts(st.lives) : '') + `<div class="ph-bd ${st.done ? 'done' : ''}" style="grid-template-columns:repeat(4,1fr)">`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const k = `${r},${c}`, g = AK_REG[r][c];
        const bd = (dr, dc) => { const rr = r + dr, cc = c + dc; return rr < 0 || cc < 0 || rr > 3 || cc > 3 || AK_REG[rr][cc] !== g; };
        const sh = [bd(-1, 0) && `inset 0 3px 0 ${INK}`, bd(1, 0) && `inset 0 -3px 0 ${INK}`, bd(0, -1) && `inset 3px 0 0 ${INK}`, bd(0, 1) && `inset -3px 0 0 ${INK}`].filter(Boolean).join(',');
        h += `<div class="ph-cell ${st.hl.has(k) ? 'hl' : ''} ${st.ng.has(k) ? 'ng' : ''}" data-k="${k}" style="background:${AK_COL[g]};box-shadow:${sh}">${st.lamp.has(k) ? A('lamp') : st.x.has(k) ? '<span class="ph-x">×</span>' : ''}</div>`;
      }
      host.innerHTML = h + '</div>';
    },
    steps: [
      { cap: 'マスを1回押すと「×」になります。ここには置かない、というメモです', taps: [{ k: '0,0', act: st => st.x.add('0,0') }] },
      { cap: 'もう1回押すと、照明がつきます', taps: [{ k: '0,1', act: st => st.x.add('0,1') }, { k: '0,1', act: st => { st.x.delete('0,1'); st.lamp.add('0,1'); } }] },
      { cap: '同じ横の列・たての列・色の部屋には、もう置けません', show: st => { for (let i = 0; i < 4; i++) { st.hl.add(`0,${i}`); st.hl.add(`${i},1`); } akRegCells(0).forEach(k => st.hl.add(k)); }, after: st => st.hl.clear(), hold: 2600 },
      { cap: '照明どうしは、ななめでもとなりに置けません。まちがえるとハートが減ります', show: st => { st.showLives = true; }, taps: [{ k: '1,2', act: st => { st.lamp.add('1,2'); st.ng.add('1,2'); st.ng.add('0,1'); st.lives = 2; } }], after: st => { st.lamp.delete('1,2'); st.ng.clear(); }, hold: 2400 },
      { cap: 'すべての部屋に1つずつ置けたらクリアです！', taps: [1, 2, 3].map(r => ({ k: `${r},${AK_SOL[r]}`, act: st => st.lamp.add(`${r},${AK_SOL[r]}`) })), fin: st => { st.done = true; }, hold: 2000 },
    ],
  },
  aburi: {
    init: () => ({ f: new Set(), x: new Set(), tool: 'f', hlRow: -1, done: false }),
    render(st, host) {
      const rc = NO_G.map(clues), cc = NO_G[0].map((_, c) => clues(NO_G.map(r => r[c])));
      let h = `<div class="ph-nono ${st.done ? 'done' : ''}" style="grid-template-columns:auto repeat(5,1fr)"><div></div>`;
      cc.forEach(c => { h += `<div class="ph-clue c">${c.map(v => `<span>${v}</span>`).join('')}</div>`; });
      for (let r = 0; r < 5; r++) {
        h += `<div class="ph-clue ${st.hlRow === r ? 'hl' : ''}">${rc[r].join(' ')}</div>`;
        for (let c = 0; c < 5; c++) { const k = `${r},${c}`; h += `<div class="ph-cell ${st.f.has(k) ? 'f' : ''} ${st.hlRow === r ? 'hlrow' : ''}" data-k="${k}">${st.x.has(k) ? '<span class="ph-x">×</span>' : ''}</div>`; }
      }
      h += `</div><div class="ph-tools"><span data-k="tool-f" class="${st.tool === 'f' ? 'on' : ''}">ぬる</span><span data-k="tool-x" class="${st.tool === 'x' ? 'on' : ''}">×</span></div>`;
      host.innerHTML = h;
    },
    steps: [
      { cap: '左の数字は、その横の列で「続けてぬるマスの数」です', show: st => { st.hlRow = 0; }, hold: 2200 },
      { cap: '「5」なら、5マス全部ぬります', taps: [0, 1, 2, 3, 4].map(c => ({ k: `0,${c}`, act: st => st.f.add(`0,${c}`) })), after: st => { st.hlRow = -1; }, fast: true },
      { cap: '「1 1」は、1マス・すきま・1マスです', show: st => { st.hlRow = 2; }, taps: [1, 3].map(c => ({ k: `2,${c}`, act: st => st.f.add(`2,${c}`) })) },
      { cap: 'ぬらないマスは、「×」に切りかえてメモします', taps: [{ k: 'tool-x', act: st => { st.tool = 'x'; } }, ...[0, 2, 4].map(c => ({ k: `2,${c}`, act: st => st.x.add(`2,${c}`) }))], after: st => { st.hlRow = -1; } },
      { cap: '全部ぬると、家具の絵があらわれます！', taps: [{ k: 'tool-f', act: st => { st.tool = 'f'; } }, ...['1,0', '1,1', '1,2', '1,3', '1,4', '3,1', '3,3', '4,1', '4,3'].map(k => ({ k, act: st => st.f.add(k) }))], fin: st => { st.done = true; }, fast: true, hold: 2200 },
    ],
  },
  rokujo: {
    init: () => ({ g: RJ_SOL.map((row, r) => row.map((v, c) => RJ_EMPTY.includes(`${r},${c}`) ? -1 : v)), sel: null, ng: new Set(), lives: 3, done: false, wrong: null }),
    render(st, host) {
      let h = (st.showLives ? hearts(st.lives) : '') + `<div class="ph-bd ${st.done ? 'done' : ''}" style="grid-template-columns:repeat(4,1fr);gap:2px">`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const k = `${r},${c}`, v = st.wrong && st.wrong[0] === k ? st.wrong[1] : st.g[r][c];
        const sh = [c === 1 && `inset -3px 0 0 ${INK}`, c === 2 && `inset 3px 0 0 ${INK}`, r === 1 && `inset 0 -3px 0 ${INK}`, r === 2 && `inset 0 3px 0 ${INK}`].filter(Boolean).join(',');
        h += `<div class="ph-cell ${st.sel === k ? 'sel' : ''} ${st.ng.has(k) ? 'ng' : ''}" data-k="${k}" style="background:${v >= 0 ? RJ_FUR[v][1] : '#fff'};box-shadow:${sh || 'none'}">${v >= 0 ? A(RJ_FUR[v][0]) : ''}</div>`;
      }
      h += `</div><div class="ph-pal">${RJ_FUR.map(([a, col], i) => `<span data-k="pal-${i}" style="background:${col}">${A(a)}</span>`).join('')}</div>`;
      host.innerHTML = h;
    },
    steps: [
      { cap: '空いているマスを押して、えらびます', taps: [{ k: '0,3', act: st => { st.sel = '0,3'; } }] },
      { cap: '下の家具を押すと、そこに入ります', taps: [{ k: 'pal-3', act: st => { st.g[0][3] = 3; st.sel = null; } }] },
      { cap: '横・たて・太い線の中に、同じ家具は1つだけです。まちがえるとハートが減ります', show: st => { st.showLives = true; }, taps: [{ k: '1,0', act: st => { st.sel = '1,0'; } }, { k: 'pal-3', act: st => { st.wrong = ['1,0', 3]; st.ng.add('1,0'); st.ng.add('1,1'); st.lives = 2; } }], after: st => { st.wrong = null; st.ng.clear(); st.sel = null; }, hold: 2400 },
      { cap: '全部うまったらクリアです！', taps: RJ_EMPTY.filter(k => k !== '0,3').flatMap(k => { const [r, c] = k.split(',').map(Number); return [{ k, act: st => { st.sel = k; } }, { k: `pal-${RJ_SOL[r][c]}`, act: st => { st.g[r][c] = RJ_SOL[r][c]; st.sel = null; } }]; }), fin: st => { st.done = true; }, fast: true, hold: 2000 },
    ],
  },
  hikkoshi: {
    init: () => ({ ps: [['S', 0, 0, 2, 2], ['V', 0, 2, 1, 2], ['s', 2, 2, 1, 1]], sel: -1, moves: 0, done: false }),
    render(st, host) {
      const U = Math.floor(Math.min(host.clientWidth || 200, 200) / SL_W);
      const occ = (x, y) => st.ps.some(q => x >= q[1] && x < q[1] + q[3] && y >= q[2] && y < q[2] + q[4]);
      let h = `<div class="ph-mv">手数 <b>${st.moves}</b></div><div class="ph-sl" style="width:${SL_W * U}px;height:${SL_H * U}px"><div class="ph-exit" style="left:4px;width:${2 * U - 8}px"></div>`;
      for (let y = 0; y < SL_H; y++) for (let x = 0; x < SL_W; x++) if (!occ(x, y)) h += `<div class="ph-e" data-k="e-${x},${y}" style="left:${x * U + 3}px;top:${y * U + 3}px;width:${U - 6}px;height:${U - 6}px"></div>`;
      st.ps.forEach((p, i) => { const [a, col] = SL_NAME[p[0]]; h += `<div class="ph-b ${st.sel === i ? 'sel' : ''} ${st.done && i === 0 ? 'out' : ''}" data-k="b-${i}" style="left:${p[1] * U + 3}px;top:${p[2] * U + 3}px;width:${p[3] * U - 6}px;height:${p[4] * U - 6}px;background:${col};--out:${2.4 * U}px">${A(a)}</div>`; });
      h += `</div><div class="ph-arrows"><span data-k="arr-l">←</span><span data-k="arr-u">↑</span><span data-k="arr-d">↓</span><span data-k="arr-r">→</span></div><div class="ph-tools"><span data-k="undo">1手戻る</span><span>最初から</span></div>`;
      host.innerHTML = h;
    },
    steps: [
      { cap: '動かしたい家具を押して、えらびます', taps: [{ k: 'b-2', act: st => { st.sel = 2; } }] },
      { cap: '行きたい方の空きマスを押すと、すべって動きます（1手）', taps: [{ k: 'e-2,1', act: st => { st.ps[2][2] = 1; st.moves++; } }] },
      { cap: '矢印でも動かせます', taps: [{ k: 'b-1', act: st => { st.sel = 1; } }, { k: 'arr-r', act: st => { st.ps[1][1] = 1; st.moves++; } }, { k: 'arr-r', act: st => { st.ps[1][1] = 2; st.moves++; } }] },
      { cap: 'まちがえても「1手戻る」「最初から」で、何回でもやり直せます', taps: [{ k: 'undo', act: st => { st.ps[1][1] = 1; st.moves--; } }, { k: 'arr-r', act: st => { st.ps[1][1] = 2; st.moves++; } }] },
      { cap: 'ソファを緑の出口まで運べばクリアです！ 少ない手数ほどポイントが多くなります', taps: [{ k: 'b-0', act: st => { st.sel = 0; } }, { k: 'arr-d', act: st => { st.ps[0][2] = 1; st.moves++; } }, { k: 'arr-d', act: st => { st.ps[0][2] = 2; st.moves++; } }], fin: st => { st.done = true; st.sel = -1; }, hold: 2200 },
    ],
  },
  pack: {
    // 4×4 の小さい押し入れ。いちばん下の列があと2マスでそろう
    init: () => ({ g: { '3,0': '#e86f5a', '3,1': '#e86f5a', '2,0': '#f2b84b', '1,3': '#5b8def', '2,3': '#5b8def' }, tray: [[[0, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0]]], sel: -1, will: false, flash: false, done: false }),
    render(st, host) {
      let h = `<div class="ph-bd ph-pk ${st.done ? 'done' : ''}" style="grid-template-columns:repeat(4,1fr);gap:2px;background:#b9a888">`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const k = `${r},${c}`, v = st.g[k]; h += `<div class="ph-cell ${st.flash && r === 3 ? 'ng' : ''}" data-k="c-${k}" style="background:${v || '#efe6d2'};${v ? `box-shadow:inset 0 0 0 2px ${INK}` : ''}"></div>`; }
      h += '</div><div class="ph-pktray">' + st.tray.map((cs, i) => `<span data-k="t-${i}" class="${st.sel === i ? 'on' : ''}">${cs ? `<i style="grid-template-columns:repeat(${Math.max(...cs.map(x => x[1])) + 1},12px)">${cs.map(([r, c]) => `<b style="grid-row:${r + 1};grid-column:${c + 1}"></b>`).join('')}</i>` : ''}</span>`).join('') + '</div>';
      host.innerHTML = h;
    },
    steps: [
      { cap: '下の箱を、押し入れの空いている所へドラッグして置きます', taps: [{ k: 't-0', act: st => { st.sel = 0; } }, { k: 'c-0,0', act: st => { st.g['0,0'] = st.g['0,1'] = '#f29bb4'; st.tray[0] = null; st.sel = -1; } }] },
      { cap: '横か たての列がぜんぶうまると、片づいて消えます', taps: [{ k: 't-1', act: st => { st.sel = 1; } }, { k: 'c-2,2', act: st => { st.g['2,2'] = st.g['3,2'] = st.g['3,3'] = '#6cbf8a'; st.tray[1] = null; st.sel = -1; st.flash = true; } }], after: st => { st.flash = false; for (let c = 0; c < 4; c++) delete st.g[`3,${c}`]; }, hold: 1400 },
      { cap: '3つ置くと、次の3つが出ます。置ける場所がなくなったら終わりです', taps: [{ k: 't-2', act: st => { st.sel = 2; } }, { k: 'c-1,1', act: st => { st.g['1,1'] = '#b28ad6'; st.tray = [[[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]]]; st.sel = -1; } }], hold: 2000 },
      { cap: 'スコアが区切りを越えるたびに、ゲージがもらえます！', fin: st => { st.done = true; }, hold: 2200 },
    ],
  },
  merge: {
    init: () => ({ g: { '3,0': 1, '3,1': 1, '3,2': 2, '1,2': 2 }, done: false, hl: null }),
    render(st, host) {
      let h = `<div class="ph-bd ph-mg ${st.done ? 'done' : ''}" style="grid-template-columns:repeat(4,1fr);gap:3px;padding:3px;background:#b9a888">`;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const lv = st.g[`${r},${c}`], it = lv && MERGE_ITEMS[lv - 1]; h += `<div class="ph-cell ${st.hl === `${r},${c}` ? 'hl' : ''}" style="border-radius:6px;background:${it ? it.c : '#efe6d2'};${it ? `box-shadow:inset 0 0 0 2px ${INK}` : ''}">${it ? it.a().replace('mg-art', 'ph-art') + `<small class="ph-mgn">${2 ** lv}</small>` : ''}</div>`; }
      h += `</div><div class="ph-arrows"><span data-k="arr-l">←</span><span data-k="arr-u">↑</span><span data-k="arr-d">↓</span><span data-k="arr-r">→</span></div>`;
      host.innerHTML = h;
    },
    steps: [
      { cap: '盤をスワイプすると、家具がみんな同じ向きにすべります', taps: [{ k: 'arr-r', act: st => { st.g = { '3,3': 2, '3,2': 2, '1,3': 2, '0,0': 1 }; } }] },
      { cap: '同じ家具がぶつかると合わさって、1つ上の家具になります', taps: [{ k: 'arr-d', act: st => { st.g = { '3,3': 3, '3,2': 2, '3,0': 1, '0,1': 1 }; st.hl = '3,3'; } }], after: st => { st.hl = null; }, hold: 2200 },
      { cap: 'ざぶとん → スツール → いす … と、どんどん良い家具に', taps: [{ k: 'arr-l', act: st => { st.g = { '3,0': 1, '3,1': 2, '3,2': 3, '0,0': 1, '1,3': 1 }; } }] },
      { cap: 'スコアが区切りを越えるたびにゲージ。動かせなくなったら終わりです', fin: st => { st.done = true; }, hold: 2200 },
    ],
  },
};

// 手順 0..i-1 をすぐに進めた状態
function stateAt(D, i) { const st = D.init(); for (let s = 0; s < i; s++) { const S = D.steps[s]; S.show?.(st); (S.taps || []).forEach(t => t.act(st)); S.fin?.(st); S.after?.(st); } return st; }

let runId = 0;
// 遊び方のカードを開く。name はパズルの名前、onClose はとじた時
export function openPuzzleHelp(id, name, onClose) {
  const D = DEMOS[id]; if (!D) return;
  document.querySelector('.ph-sheet')?.remove();
  const run = ++runId;
  const sh = document.createElement('div'); sh.className = 'ph-sheet';
  sh.innerHTML = `<div class="ph-card" role="dialog" aria-label="${name} の遊び方">
    <div class="ph-head"><b>${name} の遊び方</b><button class="ph-close" aria-label="とじる">×</button></div>
    <div class="ph-stage"><div class="ph-board"></div><div class="ph-finger">${FINGER}</div></div>
    <p class="ph-cap" aria-live="polite"></p>
    <div class="ph-dots">${D.steps.map((_, i) => `<button aria-label="手順${i + 1}"></button>`).join('')}</div>
    <div class="ph-nav"><button class="ph-pv">もどる</button><button class="ph-nx">つぎへ</button></div></div>`;
  document.body.appendChild(sh);
  const stageEl = sh.querySelector('.ph-stage'), board = sh.querySelector('.ph-board'), finger = sh.querySelector('.ph-finger');
  const cap = sh.querySelector('.ph-cap'), dots = [...sh.querySelectorAll('.ph-dots button')];
  let cur = 0;
  const close = () => { runId++; sh.remove(); onClose?.(); };
  sh.querySelector('.ph-close').onclick = close;
  sh.onclick = (e) => { if (e.target === sh) close(); };
  dots.forEach((d, i) => d.onclick = () => go(i));
  sh.querySelector('.ph-pv').onclick = () => go(Math.max(0, cur - 1));
  sh.querySelector('.ph-nx').onclick = () => go((cur + 1) % D.steps.length);

  async function tap(k, alive, fast) {
    const el = board.querySelector(`[data-k="${k}"]`); if (!el) return;
    const a = el.getBoundingClientRect(), b = stageEl.getBoundingClientRect();
    const x = a.left - b.left + a.width / 2, y = a.top - b.top + a.height / 2;
    finger.style.opacity = '1'; finger.style.transform = `translate(${x - 12}px, ${y - 2}px)`;
    await sleep(T(fast ? 260 : 520)); if (!alive()) return;
    finger.classList.add('press');
    const rp = document.createElement('div'); rp.className = 'ph-ripple'; rp.style.left = x + 'px'; rp.style.top = y + 'px'; stageEl.appendChild(rp); setTimeout(() => rp.remove(), 520);
    await sleep(T(140)); finger.classList.remove('press');
  }
  async function play(from, alive) {
    let st = stateAt(D, from);
    while (alive()) {
      for (let i = from; i < D.steps.length; i++) {
        cur = i; const S = D.steps[i];
        dots.forEach((d, j) => d.classList.toggle('on', j === i));
        cap.innerHTML = `<span class="ph-n">${i + 1}</span>${S.cap}`;
        S.show?.(st); D.render(st, board);
        for (const t of S.taps || []) { await tap(t.k, alive, S.fast); if (!alive()) return; t.act(st); D.render(st, board); await sleep(T(S.fast ? 120 : 380)); if (!alive()) return; }
        S.fin?.(st); D.render(st, board);
        finger.style.opacity = '0';
        await sleep(T(S.hold || 1600)); if (!alive()) return;
        if (S.after) { S.after(st); D.render(st, board); }
      }
      await sleep(T(900)); if (!alive()) return;
      st = D.init(); from = 0;
    }
  }
  function go(i) { const r2 = ++runId; play(i, () => r2 === runId && sh.isConnected); }
  D.render(D.init(), board);
  requestAnimationFrame(() => play(0, () => run === runId && sh.isConnected));
  return close;
}
