// 歌本（歌詞の上にコードを載せる）と、コードの訂正のしくみ。画面に関係しない計算だけを置く（テストしやすいように）

/** 貼り付けた歌詞を行に分ける。空の行は「区切り」として残す（Aメロとサビの間など） */
export function parseLyrics(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.replace(/\s+$/, ''))
    .reduce((out, s) => {
      if (!s.trim()) { if (out.length && out[out.length - 1].text !== '') out.push({ text: '' }); return out; }
      out.push({ text: s });
      return out;
    }, [])
    .filter((l, i, a) => !(l.text === '' && i === a.length - 1));
}

/** 歌う行（空の行を除く）の番号の一覧 */
export const sungLines = (lines) => lines.map((l, i) => (l.text ? i : -1)).filter((i) => i >= 0);

/**
 * 各行が歌われる時間（始まり・終わり）。times[行番号] にタップした時刻が入っている。
 * 終わりは次にタップした行の始まり。最後の行は、ほかの行の長さの中ぐらい（無ければ4秒）
 */
export function lineSpans(lines, times, duration = Infinity) {
  const idx = sungLines(lines).filter((i) => typeof times[i] === 'number');
  const lens = idx.slice(1).map((i, k) => times[i] - times[idx[k]]).filter((x) => x > 0).sort((a, b) => a - b);
  const typical = lens.length ? lens[Math.floor(lens.length / 2)] : 4;
  return idx.map((i, k) => {
    const start = times[i];
    const end = k + 1 < idx.length ? times[idx[k + 1]] : Math.min(duration, start + typical);
    return { line: i, start, end: Math.max(end, start + 0.3) };
  });
}

/**
 * 読み取ったコード（timeline）を、歌詞の文字の上に載せる。
 * 行の中で変わったコードは、時間の割合で文字の位置を決める（行の長さの何割のところで変わったか）。
 * 行の頭では、そのとき鳴っているコードを必ず表示する（手書きのコード譜と同じ）。
 * 行と行の間（間奏など）で変わったコードは、前の行の後ろに並べる。
 * 戻り値：{ [行番号]: { marks: [{ pos, name, seg }], after: [{ name, seg }] } }
 */
export function placeChords(lines, times, timeline, { lead = 0.35, duration = Infinity } = {}) {
  const spans = lineSpans(lines, times, duration);
  const segs = timeline.map((s, i) => ({ ...s, i })).filter((s) => s.end - s.start > 0.05);
  const out = {};
  spans.forEach((sp, k) => {
    const len = Math.max(1, [...lines[sp.line].text].length);
    const marks = [];
    const at = (t) => segs.find((s) => t >= s.start && t < s.end);
    const first = at(sp.start + 0.01);
    if (first) marks.push({ pos: 0, name: first.name, seg: first.i });
    segs.forEach((s) => {
      // 行の始まりより少し前（lead 秒以内）に変わったコードは、行の頭のコードとみなす（歌より少し前に弾くことが多い）
      if (s.start <= sp.start - lead || s.start >= sp.end) return;
      // 行の始まりの少しあと（lead 秒以内）に変わったコードも、行の頭のコードにする（頭に2つ並ぶと読みにくい）
      const pos = s.start <= sp.start + lead ? 0 : Math.min(len - 1, Math.round(((s.start - sp.start) / (sp.end - sp.start)) * len));
      const same = marks.find((m) => m.pos === pos);
      if (same) { same.name = s.name; same.seg = s.i; } else marks.push({ pos, name: s.name, seg: s.i });
    });
    marks.sort((a, b) => a.pos - b.pos);
    // 同じコードが続けて並んだら、後ろのものは省く
    const cleaned = marks.filter((m, j) => j === 0 || m.name !== marks[j - 1].name);
    // 次の行が始まるまでの間に変わったコード（間奏など）
    const next = spans[k + 1];
    const gapEnd = next ? next.start - lead : duration;
    const after = next && next.start - sp.end < 0.5 ? [] : segs.filter((s) => s.start >= sp.end && s.start < gapEnd).map((s) => ({ name: s.name, seg: s.i }));
    out[sp.line] = { marks: cleaned, after };
  });
  return out;
}

/** 行の中の文字の位置 → その行での時刻（訂正でコードを動かすとき） */
export function timeAtPos(span, len, pos) {
  return span.start + (Math.max(0, Math.min(len, pos)) / Math.max(1, len)) * (span.end - span.start);
}

/**
 * コードの訂正を timeline に反映する（元の timeline は変えずに、新しいものを返す）。
 * edit：{ kind: 'rename', seg, name } / { kind: 'move', seg, start } / { kind: 'add', start, name } / { kind: 'remove', seg }
 */
export function applyEdit(timeline, edit) {
  const tl = timeline.map((s) => ({ ...s }));
  if (edit.kind === 'rename') {
    tl[edit.seg].name = edit.name;
  } else if (edit.kind === 'move') {
    const s = tl[edit.seg], prev = tl[edit.seg - 1];
    const start = Math.max(prev ? prev.start + 0.05 : 0, Math.min(s.end - 0.05, edit.start));
    s.start = start;
    if (prev) prev.end = start;
  } else if (edit.kind === 'add') {
    const k = tl.findIndex((s) => edit.start >= s.start && edit.start < s.end);
    if (k < 0) return tl;
    const s = tl[k];
    tl.splice(k + 1, 0, { ...s, start: edit.start, end: s.end, name: edit.name, added: true });
    s.end = edit.start;
  } else if (edit.kind === 'remove') {
    const s = tl[edit.seg], prev = tl[edit.seg - 1];
    if (prev) { prev.end = s.end; tl.splice(edit.seg, 1); }
  }
  // 隣どうしが同じコードになったら、ひとつにまとめる
  for (let i = tl.length - 1; i > 0; i--) if (tl[i].name === tl[i - 1].name) { tl[i - 1].end = tl[i].end; tl.splice(i, 1); }
  return tl;
}

/**
 * 訂正前と訂正後の timeline を比べて、「どの時間のコードが何から何に直されたか」の一覧を作る（送るデータ・くせの学習に使う）。
 * 0.1 秒ごとに比べて、同じ直し方が続く区間をひとまとめにする
 */
export function diffTimelines(before, after, step = 0.1) {
  const end = Math.max(before.at(-1)?.end ?? 0, after.at(-1)?.end ?? 0);
  const name = (tl, t) => tl.find((s) => t >= s.start && t < s.end)?.name ?? null;
  const out = [];
  for (let t = 0; t < end; t += step) {
    const a = name(before, t), b = name(after, t);
    if (a === b) continue;
    const last = out[out.length - 1];
    if (last && last.before === a && last.after === b && Math.abs(last.end - t) < step * 1.5) last.end = t + step;
    else out.push({ start: +t.toFixed(2), end: +(t + step).toFixed(2), before: a, after: b });
  }
  return out.map((d) => ({ ...d, start: +d.start.toFixed(2), end: +d.end.toFixed(2) }));
}

/**
 * 訂正のくせ（コードの種類の直し方）を数える。例：「maj7 → なし（Fmaj7→F）」「m → なし（Am→A）」。
 * ルートが同じで種類だけ直したものを数える（ルートごとの違いは気にしない）
 */
export function habitKey(before, after, parse) {
  const a = parse(before), b = parse(after);
  if (!a || !b || a.root !== b.root) return null;
  return `${a.type.suffix}→${b.type.suffix}`;
}
