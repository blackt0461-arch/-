// 物理の新しい出し方（1.17.0）。main.js の runTyped から使う。
//   type: 'num'   … 数値を入れる計算。{ ans: 13, unitText: 'm/s', tol: 0.03 }（tol は「何割までのずれを正解にするか」。ふつう 3%）
//   type: 'build' … 公式・単位を組み立てる。{ kind: 'formula'|'unit', parts: ['K', '=', '½', { a: 'm' }, { a: 'v', sup: '²' }], pool: ['g', 'h'] }
//                   { a, g } の g が同じ空らんどうしは、入れる順番を問わない（F = m a の m と a など）
//   type: 'order' … 並べかえ。{ items: [正しい順], ends: ['短い', '長い'] }
//   fig            … どの出し方にも付けられるグラフ。{ x: [0, 4], y: [0, 8], xl: 't [s]', yl: 'v [m/s]', xt: [..], yt: [..], lines: [{ pts: [[0,0],[4,8]], fill: true }], dots: [[4, 8]] }
//                   波の形は lines の代わりに wave: { A, lam, x0 }（y = A sin(2π(x − x0)/λ)）
export const TYPES = ['num', 'build', 'order'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 問題として使えるか（形のチェック）
export function validTyped(p) {
  if (!p || !p.id || !p.text) return false;
  if (p.type === 'num') return Number.isFinite(p.ans);
  if (p.type === 'build') return Array.isArray(p.parts) && p.parts.some(x => x && typeof x === 'object' && x.a);
  if (p.type === 'order') return Array.isArray(p.items) && p.items.length >= 3;
  return false;
}
// 物理のゲージの時間の分け方（store.js の STD_SEC）
export function timeKey(p) {
  if (p.type === 'num') return 'physics:n';
  if (p.type === 'build') return 'physics:b';
  if (p.type === 'order') return 'physics:o';
  if (p.quantities) return 'physics:f';
  return 'physics';
}

// ---------- 数の見せ方 ----------
const SUPD = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const supNum = (s) => String(s).split('').map(c => SUPD[c] || c).join('');
// 正解の数値を見せる形（1.6e-19 → 1.6×10⁻¹⁹。ans_text があればそれ）
export function numText(p) {
  if (p.ansText) return p.ansText;
  const v = p.ans, a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) { const e = Math.floor(Math.log10(a)); const m = +(v / 10 ** e).toPrecision(3); return `${m}×10${supNum(e)}`; }
  return String(+v.toPrecision(4));
}
export function answerText(p) {
  if (p.type === 'num') return `${numText(p)}${p.unitText ? ' ' + p.unitText : ''}`;
  if (p.type === 'build') return partsText(p.parts, (x) => x.a, p.kind === 'unit');
  if (p.type === 'order') return p.items.join(' → ');
  return '';
}
function partsText(parts, fill, unit) {
  return parts.map(x => typeof x === 'string' ? x : `${fill(x) || '□'}${x.sup || ''}`).join(unit ? '' : ' ').replace(/\s+([²³⁻])/g, '$1');
}

// ---------- グラフ ----------
export function figSVG(fig) {
  if (!fig) return '';
  const W = 300, H = 190, L = 44, R = 16, T = 16, B = 34;
  const [x0, x1] = fig.x, [y0, y1] = fig.y;
  const X = (x) => L + (x - x0) / (x1 - x0) * (W - L - R), Y = (y) => H - B - (y - y0) / (y1 - y0) * (H - T - B);
  const fmt = (v) => String(+(+v).toPrecision(3));
  let s = '';
  // 目もり
  for (const t of fig.yt || []) { s += `<line class="pf-grid" x1="${L}" y1="${Y(t)}" x2="${W - R}" y2="${Y(t)}"/><text class="pf-t" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`; }
  for (const t of fig.xt || []) { s += `<line class="pf-grid" x1="${X(t)}" y1="${T}" x2="${X(t)}" y2="${H - B}"/><text class="pf-t" x="${X(t)}" y="${H - B + 15}" text-anchor="middle">${fmt(t)}</text>`; }
  // 軸（0 の位置。範囲に0がなければ下・左のはし）
  const ay = Y(y0 <= 0 && y1 >= 0 ? 0 : y0), ax = X(x0 <= 0 && x1 >= 0 ? 0 : x0);
  s += `<line class="pf-ax" x1="${L}" y1="${ay}" x2="${W - R + 6}" y2="${ay}"/><line class="pf-ax" x1="${ax}" y1="${H - B + 4}" x2="${ax}" y2="${T - 8}"/>`;
  s += `<text class="pf-l" x="${W - R + 4}" y="${ay - 6}" text-anchor="end">${esc(fig.xl || '')}</text><text class="pf-l" x="${ax + 6}" y="${T - 2}">${esc(fig.yl || '')}</text>`;
  const lines = (fig.lines || []).slice();
  if (fig.wave) {
    const { A, lam, x0: sh = 0 } = fig.wave, pts = [];
    for (let i = 0; i <= 120; i++) { const x = x0 + (x1 - x0) * i / 120; pts.push([x, A * Math.sin(2 * Math.PI * (x - sh) / lam)]); }
    lines.push({ pts });
  }
  for (const ln of lines) {
    const d = ln.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
    if (ln.fill) s += `<polygon class="pf-fill" points="${X(ln.pts[0][0])},${ay} ${d} ${X(ln.pts[ln.pts.length - 1][0])},${ay}"/>`;
    s += `<polyline class="pf-line${ln.dash ? ' dash' : ''}" points="${d}"/>`;
    if (ln.label) { const [lx, ly] = ln.pts[ln.pts.length - 1]; s += `<text class="pf-l" x="${X(lx) + 4}" y="${Y(ly) - 4}">${esc(ln.label)}</text>`; }
  }
  for (const [x, y] of fig.dots || []) s += `<line class="pf-guide" x1="${X(x)}" y1="${Y(y)}" x2="${X(x)}" y2="${ay}"/><line class="pf-guide" x1="${X(x)}" y1="${Y(y)}" x2="${ax}" y2="${Y(y)}"/><circle class="pf-dot" cx="${X(x)}" cy="${Y(y)}" r="3"/>`;
  return `<figure class="pfig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(fig.alt || 'グラフ')}">${s}</svg></figure>`;
}

// ---------- 数値を入れる ----------
// 入力の文字列 → 数。「1.5e-3」の形（画面では ×10⁻³）
export function parseInput(m, e) {
  if (!m || m === '-' || m === '.') return NaN;
  const v = parseFloat(m) * (e !== null && e !== '' && e !== '-' ? 10 ** parseInt(e, 10) : 1);
  return v;
}
export function checkNum(p, v) {
  if (!Number.isFinite(v)) return false;
  const tol = p.tol ?? 0.03;
  if (p.ans === 0) return Math.abs(v) < 1e-9;
  return Math.abs(v - p.ans) <= Math.abs(p.ans) * tol + 1e-12;
}
export function mountNum(stepEl, p, done) {
  let m = '', e = null; // e が null でない時は「×10の何乗」を入れている
  stepEl.innerHTML = `
    <p class="ask">答えを<b>数字で</b>入れよう${p.tol === 0 ? '' : '<small class="pt-tol">（四捨五入のちがいくらいは正解）</small>'}</p>
    <div class="pt-ans" aria-live="polite"><span class="pt-v"></span><span class="pt-u">${esc(p.unitText || '')}</span></div>
    <div class="pt-keys">${['7', '8', '9', 'del', '4', '5', '6', 'exp', '1', '2', '3', 'neg', '0', '.', 'clr', 'go'].map(k => `<button class="pt-k ${k === 'go' ? 'go' : ''}" data-k="${k}">${{ del: '⌫', exp: '×10ⁿ', neg: '−', clr: 'C', go: '決定' }[k] || k}</button>`).join('')}</div>`;
  const vEl = stepEl.querySelector('.pt-v'), go = stepEl.querySelector('[data-k=go]');
  const draw = () => {
    vEl.innerHTML = (m ? esc(m.replace('-', '−')) : '<i class="pt-ph">?</i>') + (e !== null ? `<span class="pt-e">×10<sup>${esc((e || '□').replace('-', '−'))}</sup></span>` : '');
    go.disabled = !Number.isFinite(parseInput(m, e));
  };
  stepEl.querySelectorAll('.pt-k').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === 'go') { const v = parseInput(m, e); if (Number.isFinite(v)) { stepEl.querySelectorAll('.pt-k').forEach(x => { x.disabled = true; }); done(checkNum(p, v), `${vEl.textContent} ${p.unitText || ''}`.trim()); } return; }
    if (k === 'clr') { m = ''; e = null; }
    else if (k === 'del') { if (e !== null) { if (e === '') e = null; else e = e.slice(0, -1); } else m = m.slice(0, -1); }
    else if (k === 'exp') { if (e === null && m && m !== '-') e = ''; }
    else if (k === 'neg') { if (e !== null) e = e.startsWith('-') ? e.slice(1) : '-' + e; else m = m.startsWith('-') ? m.slice(1) : '-' + m; }
    else if (e !== null) { if (k !== '.' && e.replace('-', '').length < 3) e += k; }
    else if (k === '.') { if (!m.includes('.')) m = (m === '' || m === '-' ? m + '0' : m) + '.'; }
    else if (m.replace(/[-.]/g, '').length < 9) m = (m === '0' ? '' : m === '-0' ? '-' : m) + k;
    draw();
  });
  draw();
}

// ---------- 組み立てる（公式・単位） ----------
export function mountBuild(stepEl, p, done) {
  const slots = p.parts.map((x, i) => (x && typeof x === 'object' ? i : -1)).filter(i => i >= 0);
  const pool = shuffle([...slots.map(i => p.parts[i].a), ...(p.pool || [])]).map((t, k) => ({ t, k, used: false }));
  const fill = {}; // 部品の番号 → pool の番号
  const unit = p.kind === 'unit';
  stepEl.innerHTML = `
    <p class="ask">${unit ? '<b>単位</b>のボタンを入れて、答えを完成させよう' : '文字のボタンを空らんに入れて、<b>式</b>を完成させよう'}</p>
    <div class="pb-eq ${unit ? 'unit' : ''}"></div>
    <div class="pb-pool ${unit ? 'unit' : ''}"></div>
    <button class="btn primary big pb-go" disabled>決定</button>`;
  const eqEl = stepEl.querySelector('.pb-eq'), poolEl = stepEl.querySelector('.pb-pool'), go = stepEl.querySelector('.pb-go');
  const draw = () => {
    eqEl.innerHTML = p.parts.map((x, i) => {
      if (typeof x === 'string') return `<span class="pb-fix">${esc(x)}</span>`;
      const f = fill[i];
      return `<button class="pb-slot ${f !== undefined ? 'set' : ''}" data-i="${i}">${f !== undefined ? esc(pool[f].t) : ''}</button>${x.sup ? `<span class="pb-sup">${esc(x.sup)}</span>` : ''}`;
    }).join('');
    poolEl.innerHTML = pool.map(o => `<button class="pb-chip ${o.used ? 'used' : ''}" data-k="${o.k}" ${o.used ? 'disabled' : ''}>${esc(o.t)}</button>`).join('');
    go.disabled = slots.some(i => fill[i] === undefined);
    eqEl.querySelectorAll('.pb-slot.set').forEach(b => b.onclick = () => { const i = +b.dataset.i; pool[fill[i]].used = false; delete fill[i]; draw(); });
    poolEl.querySelectorAll('.pb-chip').forEach(b => b.onclick = () => {
      const i = slots.find(j => fill[j] === undefined); if (i === undefined) return;
      const o = pool[+b.dataset.k]; o.used = true; fill[i] = o.k; draw();
    });
  };
  go.onclick = () => {
    const got = Object.fromEntries(slots.map(i => [i, pool[fill[i]].t]));
    go.disabled = true; poolEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
    eqEl.querySelectorAll('.pb-slot').forEach(b => { b.disabled = true; });
    done(checkBuild(p, got), partsText(p.parts, (x) => got[p.parts.indexOf(x)], unit));
  };
  draw();
}
// got：部品の番号 → 入れた文字。g が同じ空らんは、まとめて同じ文字の組なら正解
export function checkBuild(p, got) {
  const groups = {};
  for (const [i, x] of p.parts.entries()) {
    if (!x || typeof x !== 'object') continue;
    if (x.g) { (groups[x.g] ||= { want: [], have: [] }).want.push(x.a); groups[x.g].have.push(got[i]); }
    else if (got[i] !== x.a) return false;
  }
  return Object.values(groups).every(({ want, have }) => want.slice().sort().join('\u0001') === have.slice().sort().join('\u0001'));
}

// ---------- 並べかえ ----------
export function mountOrder(stepEl, p, done) {
  let order = shuffle(p.items.map((_, i) => i));
  for (let k = 0; k < 5 && order.every((v, i) => v === i); k++) order = shuffle(order);
  const picked = [];
  stepEl.innerHTML = `
    <p class="ask">押した順に番号がつきます${p.ends ? `（<b>${esc(p.ends[0])}</b> → <b>${esc(p.ends[1])}</b>）` : ''}。もう一度押すと外せます</p>
    <div class="po-list"></div>
    <button class="btn primary big po-go" disabled>決定</button>`;
  const list = stepEl.querySelector('.po-list'), go = stepEl.querySelector('.po-go');
  const draw = () => {
    list.innerHTML = order.map(i => { const n = picked.indexOf(i); return `<button class="po-item ${n >= 0 ? 'set' : ''}" data-i="${i}"><b class="po-n">${n >= 0 ? n + 1 : ''}</b><span>${esc(p.items[i])}</span></button>`; }).join('');
    go.disabled = picked.length !== p.items.length;
    list.querySelectorAll('.po-item').forEach(b => b.onclick = () => { const i = +b.dataset.i, n = picked.indexOf(i); if (n >= 0) picked.splice(n, 1); else picked.push(i); draw(); });
  };
  go.onclick = () => {
    go.disabled = true; list.querySelectorAll('button').forEach(b => { b.disabled = true; });
    done(picked.every((v, k) => v === k), picked.map(i => p.items[i]).join(' → '));
  };
  draw();
}
