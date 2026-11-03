// 歌本の画面：歌詞を貼り付け、曲に合わせて行のタイミングをタップし、歌詞の上にコードを載せて表示する。
// コード名を押すと訂正できる。訂正のくせはスマホの中で覚え、同意した人の訂正データは精度アップのために送る
import { parseLyrics, sungLines, lineSpans, placeChords, timeAtPos, applyEdit, diffTimelines, habitKey } from './lyrics.js';
import { parseChordName } from './chord-engine.js';
import { FEEDBACK_URL, sendFeedback } from './feedback.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境 */ } },
};

/**
 * app：{ getAnalysis(), media, rerender(), playFrom(t), appVersion }
 */
export function initSongbook(app) {
  const input = $('lyrics-input'), useBtn = $('lyrics-use'), setup = $('lyrics-setup'), sync = $('lyrics-sync');
  const view = $('songbook-view'), nextLabel = $('sync-next-line'), tapBtn = $('sync-tap');
  const tools = $('songbook-tools'), fixMode = $('fix-mode'), consent = $('feedback-consent'), fbStatus = $('feedback-status');
  const dialog = $('chord-edit'), editName = $('chord-edit-name'), editCands = $('chord-edit-cands');
  let song = null; // { key, id, lines, times, original, edits }
  let syncing = false, moving = null, editing = null, sendTimer = null;
  // 画面に出すコード名（カポを付けているときは押さえ方の名前）
  const show = (name) => (app.displayName ? app.displayName(name) : name);

  const save = () => { if (song) store.set(`songbook:${song.key}`, { id: song.id, text: song.text, times: song.times, edits: song.edits }); };
  const timeline = () => app.getAnalysis()?.timeline ?? [];

  // 曲を読み込んだとき（解析が終わったとき）に呼ぶ。同じ曲なら、前に貼った歌詞・タイミング・訂正を戻す
  function onAnalysis(fileKey) {
    const a = app.getAnalysis();
    const saved = store.get(`songbook:${fileKey}`, null);
    song = { key: fileKey, id: saved?.id ?? Math.random().toString(36).slice(2, 10), text: saved?.text ?? '', times: saved?.times ?? {}, original: a.timeline.map((s) => ({ ...s })), edits: [] };
    // 訂正のくせ（何度も同じ直し方をしたもの）を、新しい解析結果に反映する
    const applied = applyHabits(a);
    // 前に訂正した内容を、もう一度反映する
    (saved?.edits ?? []).forEach((e) => { a.timeline = applyEdit(a.timeline, e); song.edits.push(e); });
    input.value = song.text;
    syncing = false;
    render();
    if (applied) $('songbook-habit').textContent = `これまでの訂正のくせを反映しました（${applied}）`;
  }

  function applyHabits(a) {
    const habits = store.get('chordHabits', {});
    const rules = Object.entries(habits).filter(([, n]) => n >= 3).map(([k]) => k.split('→'));
    if (!rules.length) { $('songbook-habit').textContent = ''; return ''; }
    const used = new Set();
    a.timeline = a.timeline.map((s) => {
      const p = parseChordName(s.name);
      const r = p && rules.find(([from]) => from === p.type.suffix);
      if (!r) return s;
      used.add(`${r[0] || 'メジャー'}→${r[1] || 'メジャー'}`);
      const root = s.name.match(/^[A-G][#♯b♭]?/)?.[0] ?? '';
      const bass = s.name.includes('/') ? `/${s.name.split('/')[1]}` : '';
      return { ...s, name: `${root}${r[1]}${bass}` };
    });
    return [...used].join('、');
  }

  function render() {
    const a = app.getAnalysis();
    if (!a || !song) return;
    song.lines = parseLyrics(song.text);
    const hasLyrics = song.lines.some((l) => l.text);
    setup.hidden = hasLyrics && !$('lyrics-edit').dataset.open;
    sync.hidden = !syncing;
    tools.hidden = !hasLyrics;
    if (!hasLyrics) { view.innerHTML = ''; return; }
    const timed = sungLines(song.lines).filter((i) => typeof song.times[i] === 'number').length;
    if (!timed && !syncing) {
      view.innerHTML = `<p class="hint">歌詞を入れました。次に「タイミングを合わせる」を押して、曲に合わせて歌の各行の始まりをタップしてください。</p>`;
      return;
    }
    const placed = placeChords(song.lines, song.times, a.timeline, { duration: a.duration });
    view.innerHTML = song.lines.map((l, i) => {
      if (!l.text) return '<div class="sb-gap"></div>';
      const p = placed[i];
      const chars = [...l.text];
      // 手書きのコード譜と同じく、コードが変わる文字ごとに区切り、コード名を上に載せる。
      // コード名どうしが重ならないよう、区切りの幅はコード名の幅より狭くしない
      const marks = (p?.marks ?? []).slice().sort((x, y) => x.pos - y.pos);
      const cuts = [...new Set([0, ...marks.map((m) => m.pos)])].sort((x, y) => x - y);
      const body = cuts.map((from, k) => {
        const to = k + 1 < cuts.length ? cuts[k + 1] : chars.length;
        const m = marks.find((x) => x.pos === from);
        const text = chars.slice(from, to).map((c, j) => `<span class="sb-char" data-line="${i}" data-pos="${from + j}">${esc(c)}</span>`).join('');
        return `<span class="sb-seg">${m ? `<button type="button" class="sb-chord" data-seg="${m.seg}">${esc(show(m.name))}</button>` : '<span class="sb-chord sb-none"></span>'}<span class="sb-text">${text}</span></span>`;
      }).join('');
      const after = (p?.after ?? []).map((m) => `<button type="button" class="sb-chord sb-after" data-seg="${m.seg}">${esc(show(m.name))}</button>`).join('');
      return `<div class="sb-line${p ? '' : ' untimed'}" data-line="${i}">${body}${after ? `<span class="sb-tail">${after}</span>` : ''}</div>`;
    }).join('');
    highlight(app.media.currentTime);
  }

  function highlight(t) {
    if (!song?.lines) return;
    const spans = lineSpans(song.lines, song.times, app.getAnalysis()?.duration);
    const cur = spans.find((s) => t >= s.start - 0.2 && t < s.end);
    view.querySelectorAll('.sb-line.now').forEach((el) => el.classList.remove('now'));
    if (cur) view.querySelector(`.sb-line[data-line="${cur.line}"]`)?.classList.add('now');
    if (syncing) {
      const next = sungLines(song.lines).find((i) => typeof song.times[i] !== 'number');
      nextLabel.textContent = next === undefined ? 'すべての行のタイミングが決まりました' : `次の行：${song.lines[next].text}`;
      tapBtn.disabled = next === undefined;
    }
  }

  // ---- 歌詞の入力 ----
  useBtn.addEventListener('click', () => {
    if (!song) return;
    song.text = input.value;
    delete $('lyrics-edit').dataset.open;
    save();
    render();
  });
  $('lyrics-edit').addEventListener('click', () => { $('lyrics-edit').dataset.open = '1'; render(); input.focus(); });

  // ---- 行のタイミングを合わせる ----
  $('sync-start').addEventListener('click', () => {
    if (!song) return;
    syncing = true;
    song.times = {};
    save();
    render();
    app.media.currentTime = 0;
    app.media.play().catch(() => {});
    sync.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  tapBtn.addEventListener('click', () => {
    const next = sungLines(song.lines).find((i) => typeof song.times[i] !== 'number');
    if (next === undefined) return;
    song.times[next] = Math.max(0, app.media.currentTime - 0.15); // 押すのは歌い出しより少し遅れがちなので、少し戻す
    save();
    render();
    if (sungLines(song.lines).every((i) => typeof song.times[i] === 'number')) { syncing = false; render(); }
  });
  $('sync-undo').addEventListener('click', () => {
    const done = sungLines(song.lines).filter((i) => typeof song.times[i] === 'number');
    const last = done[done.length - 1];
    if (last === undefined) return;
    delete song.times[last];
    app.media.currentTime = Math.max(0, (song.times[done[done.length - 2]] ?? 0));
    save();
    render();
  });
  $('sync-done').addEventListener('click', () => { syncing = false; app.media.pause(); render(); });

  // ---- 再生位置に合わせて今の行を光らせる ----
  app.media.addEventListener('timeupdate', () => highlight(app.media.currentTime));

  // ---- コードの訂正 ----
  const chordList = () => [...new Set(timeline().map((s) => s.name))];
  function variants(name) {
    const p = parseChordName(name);
    if (!p) return [];
    const root = name.match(/^[A-G][#♯b♭]?/)?.[0] ?? '';
    const isMinor = p.type.suffix.startsWith('m') && !p.type.suffix.startsWith('maj');
    return [root, `${root}m`, `${root}7`, `${root}m7`, `${root}maj7`, isMinor ? root : `${root}m`].filter((x) => x !== name);
  }
  view.addEventListener('click', (e) => {
    const chordBtn = e.target.closest('.sb-chord');
    const charEl = e.target.closest('.sb-char');
    if (moving !== null && charEl) {
      // 位置を動かす：押した文字のところで、そのコードに変わるようにする
      const line = Number(charEl.dataset.line), pos = Number(charEl.dataset.pos);
      const span = lineSpans(song.lines, song.times, app.getAnalysis().duration).find((s) => s.line === line);
      if (span) commit({ kind: 'move', seg: moving, start: +timeAtPos(span, [...song.lines[line].text].length, pos).toFixed(2) });
      moving = null;
      view.classList.remove('moving');
      return;
    }
    if (chordBtn) {
      e.stopPropagation();
      if (!fixMode.checked) { app.playFrom(timeline()[Number(chordBtn.dataset.seg)]?.start ?? 0); return; }
      openEditor(Number(chordBtn.dataset.seg));
      return;
    }
    if (charEl && fixMode.checked) {
      // コードの無い文字を押した：ここで新しいコードに変わるようにする
      const line = Number(charEl.dataset.line), pos = Number(charEl.dataset.pos);
      const span = lineSpans(song.lines, song.times, app.getAnalysis().duration).find((s) => s.line === line);
      if (span) openEditor(null, +timeAtPos(span, [...song.lines[line].text].length, pos).toFixed(2));
    } else if (charEl) {
      const line = Number(charEl.dataset.line);
      const span = lineSpans(song.lines, song.times, app.getAnalysis().duration).find((s) => s.line === line);
      if (span) app.playFrom(span.start);
    }
  });

  function openEditor(seg, addAt = null) {
    editing = { seg, addAt };
    const cur = seg !== null ? timeline()[seg]?.name : '';
    $('chord-edit-title').textContent = seg !== null ? `「${cur}」を直す` : 'ここにコードを追加';
    editName.value = cur;
    const cands = [...new Set([...(cur ? variants(cur) : []), ...chordList()])].filter((x) => x && x !== cur).slice(0, 12);
    editCands.innerHTML = cands.map((c) => `<button type="button" class="secondary-button" data-name="${esc(c)}">${esc(c)}</button>`).join('');
    $('chord-edit-move').hidden = seg === null || seg === 0;
    $('chord-edit-remove').hidden = seg === null || seg === 0;
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
  }
  const closeEditor = () => { dialog.close ? dialog.close() : dialog.removeAttribute('open'); editing = null; };
  editCands.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { editName.value = b.dataset.name; } });
  $('chord-edit-ok').addEventListener('click', () => {
    const name = editName.value.trim();
    if (!editing || !name) return closeEditor();
    if (!parseChordName(name)) { $('chord-edit-error').textContent = 'コード名として読めませんでした（例：C、Am7、F/G）'; return; }
    $('chord-edit-error').textContent = '';
    const ed = editing.seg !== null ? { kind: 'rename', seg: editing.seg, name } : { kind: 'add', start: editing.addAt, name };
    closeEditor();
    commit(ed);
  });
  $('chord-edit-move').addEventListener('click', () => {
    moving = editing.seg;
    closeEditor();
    view.classList.add('moving');
    $('songbook-habit').textContent = '動かしたい先の文字を押してください';
  });
  $('chord-edit-remove').addEventListener('click', () => { const seg = editing.seg; closeEditor(); commit({ kind: 'remove', seg }); });
  $('chord-edit-cancel').addEventListener('click', closeEditor);

  function commit(edit) {
    const a = app.getAnalysis();
    const before = a.timeline;
    a.timeline = applyEdit(a.timeline, edit);
    song.edits.push(edit);
    // くせを数える（名前を直したときだけ）
    if (edit.kind === 'rename') {
      const k = habitKey(before[edit.seg]?.name, edit.name, parseChordName);
      if (k) { const h = store.get('chordHabits', {}); h[k] = (h[k] ?? 0) + 1; store.set('chordHabits', h); }
    }
    save();
    app.rerender();
    render();
    $('songbook-habit').textContent = '直しました';
    scheduleSend();
  }

  // ---- 訂正データを送る（同意した人だけ） ----
  consent.checked = store.get('feedbackConsent', false) === true;
  consent.addEventListener('change', () => { store.set('feedbackConsent', consent.checked); if (consent.checked) scheduleSend(); updateStatus(); });
  function updateStatus(msg) {
    fbStatus.textContent = msg ?? (!FEEDBACK_URL ? '（送り先の準備中です。今は送られません）' : consent.checked ? '訂正すると、少したってから自動で送られます' : '');
  }
  updateStatus();
  function scheduleSend() {
    clearTimeout(sendTimer);
    if (!consent.checked || !FEEDBACK_URL || !song) return;
    sendTimer = setTimeout(async () => {
      const a = app.getAnalysis();
      const corrections = diffTimelines(song.original, a.timeline);
      if (!corrections.length) return;
      const ok = await sendFeedback({ app: app.appVersion, song: song.id, analysis: a, corrections, original: song.original });
      updateStatus(ok ? '訂正データを送りました。ご協力ありがとうございます' : '送れませんでした（電波のよいところで、もう一度直すと送られます）');
    }, 15000);
  }

  // 帯やコード一覧から直すとき
  const editSeg = (i) => { if (song) openEditor(i); };
  const editAt = (t) => { const i = timeline().findIndex((s) => t >= s.start && t < s.end); if (i >= 0) editSeg(i); };
  // 印刷・画像用：歌詞の各行と、その上に載せるコード（表示する名前で）。タイミングが無ければ null
  function getSheet() {
    const a = app.getAnalysis();
    if (!a || !song?.lines?.some((l) => l.text)) return null;
    if (!sungLines(song.lines).some((i) => typeof song.times[i] === 'number')) return null;
    const placed = placeChords(song.lines, song.times, a.timeline, { duration: a.duration });
    return song.lines.map((l, i) => ({ text: l.text, marks: (placed[i]?.marks ?? []).map((m) => ({ pos: m.pos, name: show(m.name) })), after: (placed[i]?.after ?? []).map((m) => show(m.name)) }));
  }
  // 編集画面から：直す操作をひとつ加える／ひとつ前に戻す
  const commitEdit = (edit) => commit(edit);
  function undo(prevTimeline) {
    const a = app.getAnalysis();
    if (!song || !song.edits.length) return false;
    song.edits.pop();
    a.timeline = prevTimeline;
    save();
    app.rerender();
    render();
    return true;
  }
  // 歌詞の各行が歌われる時間（編集画面の歌詞トラック用）
  const lyricSpans = () => (song?.lines ? lineSpans(song.lines, song.times, app.getAnalysis()?.duration).map((sp) => ({ ...sp, text: song.lines[sp.line].text })) : []);
  return { onAnalysis, render, editSeg, editAt, getSheet, commitEdit, undo, lyricSpans };
}
