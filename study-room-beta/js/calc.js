// 関数電卓（1.14.0）：数学・物理の問題で、画面の下半分に出す。上には問題と選択肢が残る。
// ・問題文の数字をタップすると、電卓に入る
// ・計算の履歴を見返せる（押すとその答えが入る）
// ・答えが選択肢と同じでも、光らせない（どれを選ぶかは自分で決める）
// eval は使わず、自分で式を読む（安全のため）。三角関数は「度」。log は常用対数（底10）、ln は自然対数。
import { icon } from './icons.js';

// ---------- 式を読んで計算する ----------
const FN = {
  sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180),
  log: x => Math.log10(x), ln: x => Math.log(x), '√': x => Math.sqrt(x),
};
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; t.push({ k: 'n', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
    if (s.startsWith('×10^', i)) { t.push({ k: 'o', v: 'E' }); i += 4; continue; }
    const f = ['sin', 'cos', 'tan', 'log', 'ln', '√'].find(n => s.startsWith(n, i));
    if (f) { t.push({ k: 'f', v: f }); i += f.length; continue; }
    if (s.startsWith('Ans', i)) { t.push({ k: 'ans' }); i += 3; continue; }
    if (c === 'π') { t.push({ k: 'n', v: Math.PI }); i++; continue; }
    if (c === '²') { t.push({ k: 'sq' }); i++; continue; }
    if ('+-−×÷*/^()'.includes(c)) { t.push({ k: 'o', v: c === '−' ? '-' : c === '*' ? '×' : c === '/' ? '÷' : c }); i++; continue; }
    throw new Error('bad');
  }
  return t;
}
// 再帰下降：expr = term (('+'|'-') term)* ／ term = unary (('×'|'÷'|かけ算の省略) unary)* ／ unary = '-' unary | power ／ power = postfix ('^' unary)?
function parse(tokens, ans) {
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const startsPrimary = (t) => t && (t.k === 'n' || t.k === 'f' || t.k === 'ans' || (t.k === 'o' && t.v === '('));
  function expr() {
    let v = term();
    while (peek()?.k === 'o' && (peek().v === '+' || peek().v === '-')) { const o = next().v; const r = term(); v = o === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.k === 'o' && (t.v === '×' || t.v === '÷')) { next(); const r = unary(); v = t.v === '×' ? v * r : v / r; }
      else if (startsPrimary(t)) { v *= unary(); } // 2π、3√2、2(1+3) など
      else break;
    }
    return v;
  }
  function unary() {
    if (peek()?.k === 'o' && peek().v === '-') { next(); return -unary(); }
    if (peek()?.k === 'o' && peek().v === '+') { next(); return unary(); }
    return power();
  }
  function power() {
    let v = postfix();
    if (peek()?.k === 'o' && peek().v === '^') { next(); v = Math.pow(v, unary()); }
    return v;
  }
  function postfix() {
    let v = primary();
    for (;;) {
      if (peek()?.k === 'sq') { next(); v = v * v; }
      else if (peek()?.k === 'o' && peek().v === 'E') { next(); v = v * Math.pow(10, unary()); }
      else break;
    }
    return v;
  }
  function primary() {
    const t = next();
    if (!t) throw new Error('end');
    if (t.k === 'n') return t.v;
    if (t.k === 'ans') return ans;
    if (t.k === 'f') {
      // 関数のあとは ( ) でも、数字だけでもよい（sin30、√2）
      const v = (peek()?.k === 'o' && peek().v === '(') ? primary() : power();
      return FN[t.v](v);
    }
    if (t.k === 'o' && t.v === '(') {
      const v = expr();
      if (peek()?.k === 'o' && peek().v === ')') next(); // 閉じかっこは省略してもよい
      return v;
    }
    throw new Error('bad');
  }
  const v = expr();
  if (i < tokens.length) throw new Error('rest');
  return v;
}
export function calc(s, ans = 0) {
  try {
    const v = parse(tokenize(s), ans);
    return Number.isFinite(v) ? v : null;
  } catch (e) { return null; }
}
// 見やすい形に（有効数字10けた。とても大きい・小さい数は ×10^）
export function fmtNum(v) {
  if (v === null || v === undefined) return '';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e10 || a < 1e-6) {
    const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    return `${+m.toPrecision(6)}×10^${e}`;
  }
  return String(+v.toPrecision(10));
}

// ---------- 画面 ----------
const KEYS = [
  ['sin', 'cos', 'tan', 'log', '√'],
  ['x²', '^', '(', ')', 'π'],
  ['7', '8', '9', '÷', 'del'],
  ['4', '5', '6', '×', 'AC'],
  ['1', '2', '3', '−', '×10ⁿ'],
  ['0', '.', 'Ans', '+', '='],
];
const INSERT = { sin: 'sin(', cos: 'cos(', tan: 'tan(', log: 'log(', '√': '√(', 'x²': '²', '×10ⁿ': '×10^' };
let cur = null; // 開いている電卓

export function isCalcOpen() { return !!cur; }
export function closeCalc() {
  if (!cur) return;
  const { el, problem, saved, screen } = cur;
  el.classList.add('out');
  setTimeout(() => el.remove(), 180);
  if (problem && saved !== null) problem.innerHTML = saved;
  screen?.classList.remove('calc-open');
  document.body.classList.remove('calc-on');
  cur.btn?.classList.remove('on');
  cur = null;
}
// screen：問題の画面。problem：問題文の要素（数字をタップできるようにする）。btn：開くボタン
export function openCalc({ screen, problem, btn, store }) {
  if (cur) { closeCalc(); return; }
  const st = store || { hist: [], ans: 0 };
  const el = document.createElement('div');
  el.className = 'calc';
  el.innerHTML = `
    <div class="calc-grip" aria-hidden="true"></div>
    <div class="calc-top">
      <div class="calc-hist" aria-label="計算の履歴"></div>
      <button class="calc-x" aria-label="電卓をとじる">${icon('x')}</button>
    </div>
    <div class="calc-disp"><div class="calc-expr" aria-live="polite"></div><div class="calc-prev"></div></div>
    <div class="calc-keys">${KEYS.flat().map(k => `<button class="ck ${/^[0-9.]$/.test(k) ? 'num' : ''} ${k === '=' ? 'eq' : ''} ${['sin', 'cos', 'tan', 'log', '√', 'x²', '^', '(', ')', 'π'].includes(k) ? 'fn' : ''}" data-k="${k}">${k === 'del' ? icon('back') : k}</button>`).join('')}</div>
    <p class="calc-hint">問題の数字をタップすると入ります・角度は「度」</p>`;
  document.body.append(el);
  document.body.classList.add('calc-on');
  screen?.classList.add('calc-open');
  btn?.classList.add('on');
  let expr = '';
  const exprEl = el.querySelector('.calc-expr'), prevEl = el.querySelector('.calc-prev'), histEl = el.querySelector('.calc-hist');
  const draw = () => {
    exprEl.textContent = expr || '0';
    exprEl.classList.toggle('empty', !expr);
    const v = expr ? calc(expr, st.ans) : null;
    prevEl.textContent = expr && v !== null ? `= ${fmtNum(v)}` : '';
    exprEl.scrollLeft = exprEl.scrollWidth;
  };
  const drawHist = () => {
    histEl.innerHTML = st.hist.length
      ? st.hist.slice(-12).map((h, i, a) => `<button class="ch" data-v="${h.v}" title="${h.e}"><small>${h.e.replace(/</g, '&lt;')}</small><b>${fmtNum(h.v)}</b></button>`).join('')
      : '<span class="ch-empty">「=」を押すと、ここに残ります</span>';
    histEl.scrollLeft = histEl.scrollWidth;
  };
  const put = (s) => { expr += s; draw(); };
  el.querySelectorAll('.ck').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) { /* なし */ } }
    if (k === 'AC') { expr = ''; draw(); return; }
    if (k === 'del') {
      const m = expr.match(/(sin\(|cos\(|tan\(|log\(|√\(|×10\^|Ans)$/);
      expr = m ? expr.slice(0, -m[1].length) : expr.slice(0, -1); draw(); return;
    }
    if (k === '=') {
      const v = calc(expr, st.ans);
      if (v === null) { exprEl.classList.remove('shake'); void exprEl.offsetWidth; exprEl.classList.add('shake'); return; }
      const open = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      st.hist.push({ e: expr + ')'.repeat(Math.max(0, open)), v }); if (st.hist.length > 30) st.hist.shift();
      st.ans = v; expr = ''; draw(); drawHist();
      prevEl.textContent = `= ${fmtNum(v)}`;
      exprEl.textContent = fmtNum(v); exprEl.classList.add('result');
      setTimeout(() => exprEl.classList.remove('result'), 10);
      return;
    }
    // 答えのすぐあとに記号を押したら、Ans から続ける
    if (!expr && st.hist.length && ['+', '−', '×', '÷', '^', 'x²'].includes(k)) expr = 'Ans';
    put(INSERT[k] || k);
  }));
  histEl.addEventListener('click', (e) => { const b = e.target.closest('.ch'); if (b) put(fmtNum(+b.dataset.v).replace(/×10\^(-?\d+)/, '×10^($1)')); });
  el.querySelector('.calc-x').onclick = () => closeCalc();
  // 下に引っぱってとじる
  let y0 = null;
  el.querySelector('.calc-grip').addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  window.addEventListener('pointerup', function up(e) { if (y0 !== null && e.clientY - y0 > 50) closeCalc(); y0 = null; if (!cur) window.removeEventListener('pointerup', up); });
  // 問題文の数字をタップできるように
  let saved = null;
  if (problem) {
    saved = problem.innerHTML;
    const walk = document.createTreeWalker(problem, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
    const RE = /(\d+(?:\.\d+)?(?:\s*×\s*10\s*[⁻\-]?[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)?)/g;
    for (const n of nodes) {
      if (!RE.test(n.nodeValue)) continue; RE.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = RE.exec(n.nodeValue))) {
        if (m.index > last) frag.append(n.nodeValue.slice(last, m.index));
        const s = document.createElement('span'); s.className = 'num-tap'; s.textContent = m[1]; s.dataset.v = toCalc(m[1]);
        frag.append(s); last = m.index + m[1].length;
      }
      if (last < n.nodeValue.length) frag.append(n.nodeValue.slice(last));
      n.parentNode.replaceChild(frag, n);
    }
    problem.addEventListener('click', onTap);
  }
  function onTap(e) { const s = e.target.closest('.num-tap'); if (!s || !cur) return; put(s.dataset.v); s.classList.remove('hit'); void s.offsetWidth; s.classList.add('hit'); }
  cur = { el, problem, saved, screen, btn };
  draw(); drawHist();
}
// 「2.0×10⁻⁴」→「2.0×10^(-4)」
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
function toCalc(s) {
  const m = s.match(/^(\d+(?:\.\d+)?)\s*×\s*10\s*([⁻\-]?[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)$/);
  if (!m) return s;
  const e = m[2].split('').map(c => SUP[c] ?? c).join('');
  return `${m[1]}×10^(${e})`;
}
