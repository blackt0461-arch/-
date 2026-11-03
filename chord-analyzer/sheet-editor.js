// 歌詞にコードを置く画面（全画面）。手書きのコード譜と同じく、歌詞の「変わる文字」の上にコードを置いていく。
// 下のトレーのコードを指でスライドして文字の上で離すと置ける。置いたコードはスライドで動かし、トレーに戻すと消える。
// 「文字を押す → コードを押す」でも置ける。置いたコードを押すと、名前の変更・音を鳴らす・消すができる。
import { parseChordName, NOTE_NAMES } from './chord-engine.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DIATONIC = [[0, ''], [2, 'm'], [4, 'm'], [5, ''], [7, ''], [9, 'm'], [11, 'm7-5']];

/**
 * app：{ getLines() → [{ text }], getSheet() → { [行]: { marks:[{pos,name}], after:[name] } } | null,
 *        autoSheet() → 同じ形（曲のコードから自動で置いたもの）| null, setSheet(sheet), songChords() → [name],
 *        keyOf() → { root, minor } | null, playChord(name), shapeName(name) }
 */
export function initSheetEditor(app) {
  const root = document.createElement('div');
  root.className = 'se-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="se-head">
      <button type="button" class="se-hb" data-act="close">✕</button>
      <b>歌詞にコードを置く</b>
      <button type="button" class="se-hb" data-act="undo">↶</button>
      <button type="button" class="se-hb se-done" data-act="done">完了</button>
    </div>
    <div class="se-help">下のコードを<b>指でスライド</b>して、変わる文字の上で離します。<br>置いたコードはスライドで動かせます（下に戻すと消えます）。文字を押してからコードを押しても置けます。</div>
    <div class="se-actions"><button type="button" class="se-auto" data-act="auto">🎵 曲から自動で置く</button><button type="button" class="se-auto" data-act="clear">すべて消す</button></div>
    <div class="se-lines"></div>
    <div class="se-tray"><div class="se-tray-label">コード（スライドして置く）</div><div class="se-chips"></div></div>
    <div class="se-pop" hidden></div>`;
  document.body.append(root);
  const linesEl = root.querySelector('.se-lines'), chipsEl = root.querySelector('.se-chips'), tray = root.querySelector('.se-tray'), pop = root.querySelector('.se-pop');
  let sheet = {}, history = [], selectedChar = null, drag = null;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const push = () => { history.push(clone(sheet)); if (history.length > 100) history.shift(); };
  const marksOf = (line) => (sheet[line] ??= { marks: [], after: [] }).marks;

  function open() {
    sheet = clone(app.getSheet() ?? app.autoSheet() ?? {});
    history = [];
    selectedChar = null;
    root.hidden = false;
    document.body.classList.add('se-open');
    render();
  }
  function close(saveIt) {
    if (saveIt) app.setSheet(sheet);
    root.hidden = true;
    document.body.classList.remove('se-open');
    hidePop();
  }

  function render() {
    const lines = app.getLines();
    linesEl.innerHTML = lines.map((l, i) => {
      if (!l.text) return '<div class="se-gap"></div>';
      const marks = new Map((sheet[i]?.marks ?? []).map((m) => [m.pos, m]));
      const chars = [...l.text].map((c, k) => {
        const m = marks.get(k);
        const sel = selectedChar && selectedChar.line === i && selectedChar.pos === k;
        return `<span class="se-ch${sel ? ' sel' : ''}" data-line="${i}" data-pos="${k}"><span class="se-slot">${m ? `<span class="se-chip placed" data-line="${i}" data-pos="${k}">${esc(m.name)}</span>` : ''}</span><span class="se-t">${esc(c)}</span></span>`;
      }).join('');
      const after = (sheet[i]?.after ?? []).map((n) => `<span class="se-after">${esc(n)}</span>`).join('');
      return `<div class="se-line">${chars}${after ? `<span class="se-tail">${after}</span>` : ''}</div>`;
    }).join('');
    // トレー：この曲で使うコード → キーに合うコード → 自分で入力
    const key = app.keyOf();
    const tonic = key ? (key.minor ? (key.root + 3) % 12 : key.root) : 0;
    const dia = DIATONIC.map(([iv, q]) => `${NOTE_NAMES[(tonic + iv) % 12]}${q}`);
    const used = Object.values(sheet).flatMap((s) => s.marks.map((m) => m.name));
    const names = [...new Set([...app.songChords(), ...used, ...dia])];
    chipsEl.innerHTML = names.map((n) => `<span class="se-chip tray" data-name="${esc(n)}">${esc(n)}</span>`).join('') + '<span class="se-chip tray se-plus" data-plus="1">＋ほか</span>';
  }

  // ---- ポップアップ（置いたコードを押したとき・自分で入力するとき） ----
  function showPop(html, x, y) {
    pop.innerHTML = html;
    pop.hidden = false;
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2))}px`;
    pop.style.top = `${Math.max(60, y - r.height - 12)}px`;
  }
  const hidePop = () => { pop.hidden = true; };
  function editPlaced(line, pos, x, y) {
    const m = marksOf(line).find((q) => q.pos === pos);
    if (!m) return;
    const p = parseChordName(m.name);
    const rt = m.name.match(/^[A-G][#♯b♭]?/)?.[0] ?? '';
    const minor = p && p.type.suffix.startsWith('m') && !p.type.suffix.startsWith('maj');
    const vars = p ? [...new Set([minor ? rt : `${rt}m`, `${rt}7`, minor ? `${rt}m7` : `${rt}maj7`, `${rt}sus4`, `${rt}add9`])].filter((v) => v !== m.name) : [];
    showPop(`<div class="se-pop-row"><b>${esc(m.name)}</b><button type="button" data-pop="play">🔊</button><button type="button" data-pop="del">🗑 消す</button></div>
      <div class="se-pop-row">${vars.map((v) => `<button type="button" data-pop="rename" data-name="${esc(v)}">${esc(v)}</button>`).join('')}<button type="button" data-pop="input">入力…</button></div>`, x, y);
    pop.dataset.line = line; pop.dataset.pos = pos;
  }
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const line = Number(pop.dataset.line), pos = Number(pop.dataset.pos);
    const m = marksOf(line).find((q) => q.pos === pos);
    if (b.dataset.pop === 'play' && m) app.playChord(m.name);
    if (b.dataset.pop === 'del' && m) { push(); sheet[line].marks = sheet[line].marks.filter((q) => q !== m); hidePop(); render(); }
    if (b.dataset.pop === 'rename' && m) { push(); m.name = b.dataset.name; app.playChord(m.name); hidePop(); render(); }
    if (b.dataset.pop === 'input' && m) {
      const name = prompt('コード名を入力してください（例：C、Am7、F/G）', m.name);
      if (name && parseChordName(name.trim())) { push(); m.name = name.trim(); app.playChord(m.name); render(); }
      hidePop();
    }
    if (b.dataset.pop === 'custom') {
      const name = prompt('コード名を入力してください（例：C、Am7、F/G）', '');
      if (name && parseChordName(name.trim())) placeAtSelected(name.trim());
      hidePop();
    }
  });

  function place(line, pos, name) {
    push();
    const marks = marksOf(line).filter((q) => q.pos !== pos);
    marks.push({ pos, name });
    marks.sort((a, b) => a.pos - b.pos);
    sheet[line].marks = marks;
    app.playChord(name);
    render();
  }
  function placeAtSelected(name) {
    if (!selectedChar) return false;
    place(selectedChar.line, selectedChar.pos, name);
    // 次に置きやすいよう、選んだ文字は外す
    selectedChar = null;
    render();
    return true;
  }

  // ---- 指でスライドして置く・動かす ----
  function charAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest('.se-ch');
    return el ? { line: Number(el.dataset.line), pos: Number(el.dataset.pos), el } : null;
  }
  root.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.se-chip');
    if (!chip || chip.dataset.plus) return;
    e.preventDefault();
    hidePop();
    const placed = chip.classList.contains('placed');
    const name = placed ? marksOf(Number(chip.dataset.line)).find((q) => q.pos === Number(chip.dataset.pos))?.name : chip.dataset.name;
    drag = { name, from: placed ? { line: Number(chip.dataset.line), pos: Number(chip.dataset.pos) } : null, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, target: null };
    chip.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'se-ghost';
      drag.ghost.textContent = drag.name;
      root.append(drag.ghost);
    }
    // 指の少し上に見せる（指で隠れないように）
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY - 46}px`;
    const hit = charAt(e.clientX, e.clientY - 30);
    root.querySelectorAll('.se-ch.target').forEach((n) => n.classList.remove('target'));
    if (hit) hit.el.classList.add('target');
    drag.target = hit;
    tray.classList.toggle('drop-del', Boolean(drag.from) && e.clientY > tray.getBoundingClientRect().top);
    // 端に近づいたら自動でスクロール
    const r = linesEl.getBoundingClientRect();
    if (e.clientY < r.top + 40) linesEl.scrollTop -= 12; else if (e.clientY > r.bottom - 40 && e.clientY < tray.getBoundingClientRect().top) linesEl.scrollTop += 12;
  });
  root.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost?.remove();
    tray.classList.remove('drop-del');
    root.querySelectorAll('.se-ch.target').forEach((n) => n.classList.remove('target'));
    if (!d.moved) {
      // スライドせずに押しただけ
      if (d.from) editPlaced(d.from.line, d.from.pos, e.clientX, e.clientY);
      else if (!placeAtSelected(d.name)) app.playChord(d.name);
      return;
    }
    const overTray = e.clientY > tray.getBoundingClientRect().top;
    if (d.from && overTray) { push(); sheet[d.from.line].marks = sheet[d.from.line].marks.filter((q) => q.pos !== d.from.pos); render(); return; }
    if (!d.target) return;
    if (d.from) {
      // 動かす：元の場所から外して、新しい場所に置く（もどすときは1回で元に戻るように、まとめて記録する）
      const before = clone(sheet);
      sheet[d.from.line].marks = sheet[d.from.line].marks.filter((q) => q.pos !== d.from.pos);
      const marks = marksOf(d.target.line).filter((q) => q.pos !== d.target.pos);
      marks.push({ pos: d.target.pos, name: d.name });
      sheet[d.target.line].marks = marks.sort((a, b) => a.pos - b.pos);
      history.push(before);
      app.playChord(d.name);
      render();
      return;
    }
    place(d.target.line, d.target.pos, d.name);
  });

  // 文字を押して選ぶ（そのあとトレーのコードを押すと置ける）
  linesEl.addEventListener('click', (e) => {
    if (e.target.closest('.se-chip')) return;
    const ch = e.target.closest('.se-ch');
    if (!ch) return;
    const line = Number(ch.dataset.line), pos = Number(ch.dataset.pos);
    selectedChar = selectedChar && selectedChar.line === line && selectedChar.pos === pos ? null : { line, pos };
    render();
  });
  chipsEl.addEventListener('click', (e) => {
    const plus = e.target.closest('[data-plus]');
    if (!plus) return;
    if (!selectedChar) { alert('先に、コードを置きたい文字を押してください'); return; }
    const r = plus.getBoundingClientRect();
    showPop('<div class="se-pop-row"><button type="button" data-pop="custom">コード名を入力して置く</button></div>', r.left + r.width / 2, r.top);
  });

  root.querySelector('.se-head').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') { if (!history.length || confirm('置いたコードを保存せずに閉じますか？')) close(false); }
    if (act === 'done') close(true);
    if (act === 'undo') { const prev = history.pop(); if (prev) { sheet = prev; render(); } }
  });
  root.querySelector('.se-actions').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'auto') {
      const auto = app.autoSheet();
      if (!auto) { alert('先に歌本で「タイミングを合わせる」をすると、曲から読み取ったコードを自動で置けます'); return; }
      push(); sheet = clone(auto); render();
    }
    if (act === 'clear' && confirm('置いたコードをすべて消しますか？')) { push(); sheet = {}; render(); }
  });

  return { open };
}
