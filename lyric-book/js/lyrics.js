// 歌詞のパート分けと、歌い方の書きこみ（記号・色・メモ）。
// 歌詞の文章は「[サビ]」のような行でパートを分ける。
// 書きこみ（anno）は、パート名の行を除いた歌詞の行ごとに1つ：
//   { t: その行の文字, m: [{ i: 何文字目, k: 記号のid }], c: [{ s, e, k: 色のid }], memo: '' }

export const PART_NAMES = ['イントロ', 'Aメロ', 'Bメロ', 'サビ', 'Cメロ', '間奏', '大サビ', 'ラスサビ', 'アウトロ'];
const PART_RE = /^\s*[\[［【](.+?)[\]］】]\s*$/;

export function parse(text) {
  const parts = [];
  let cur = null;
  let li = 0;
  for (const raw of (text || '').replace(/\r/g, '').split('\n')) {
    const m = raw.match(PART_RE);
    if (m) { cur = { name: m[1].trim(), lines: [] }; parts.push(cur); continue; }
    if (!cur) { cur = { name: '', lines: [] }; parts.push(cur); }
    cur.lines.push({ t: raw, idx: li++ });
  }
  // 中身のないパート（名前もない）は消す。最後の空行も消す
  for (const p of parts) while (p.lines.length && !p.lines[p.lines.length - 1].t.trim()) p.lines.pop();
  return parts.filter(p => p.name || p.lines.some(l => l.t.trim()));
}

// 歌詞の行だけ（パート名の行を除く）
export function lyricLines(text) {
  return (text || '').replace(/\r/g, '').split('\n').filter(l => !PART_RE.test(l));
}

export function firstLine(text) {
  return lyricLines(text).find(l => l.trim())?.trim() || '';
}

// 歌詞を書き直したあと、前の書きこみをできるだけ残す
export function realign(oldAnno, newText) {
  const lines = lyricLines(newText);
  const old = (oldAnno || []).map((a, i) => ({ a, i, used: false }));
  const out = [];
  let ptr = 0;
  for (let j = 0; j < lines.length; j++) {
    const t = lines[j];
    let hit = null;
    for (let k = ptr; k < old.length; k++) if (!old[k].used && old[k].a.t === t) { hit = old[k]; break; }
    if (!hit) for (let k = 0; k < ptr && k < old.length; k++) if (!old[k].used && old[k].a.t === t) { hit = old[k]; break; }
    if (hit) { hit.used = true; ptr = hit.i + 1; out.push({ ...hit.a, t }); continue; }
    // 同じ位置の行が少しだけ変わった場合：はみ出さない書きこみとメモは残す
    const same = old[j] && !old[j].used && t.trim() && old[j].a.t.trim() ? old[j] : null;
    if (same) {
      same.used = true;
      out.push({
        t,
        m: (same.a.m || []).filter(x => x.i < [...t].length),
        c: (same.a.c || []).filter(x => x.s < [...t].length).map(x => ({ ...x, e: Math.min(x.e, [...t].length) })),
        memo: same.a.memo || '',
      });
    } else out.push({ t, m: [], c: [], memo: '' });
  }
  return out;
}

export function ensureAnno(song) {
  const lines = lyricLines(song.text);
  if (!Array.isArray(song.anno) || song.anno.length !== lines.length || song.anno.some((a, i) => a.t !== lines[i])) {
    song.anno = realign(song.anno, song.text);
  }
  return song.anno;
}

// 選んだ範囲に色をつける／同じ色がもうついていれば消す
export function toggleColor(anno, from, to, k) {
  const rangesIn = [];
  for (let l = from.l; l <= to.l; l++) {
    const a = anno[l]; if (!a) continue;
    const s = l === from.l ? from.i : 0;
    const e = l === to.l ? to.i + 1 : [...a.t].length;
    if (e > s) rangesIn.push({ a, s, e });
  }
  const allHave = rangesIn.length && rangesIn.every(({ a, s, e }) => {
    for (let i = s; i < e; i++) if (colorAt(a, i) !== k) return false;
    return true;
  });
  for (const { a, s, e } of rangesIn) {
    a.c = cut(a.c || [], s, e);
    if (!allHave) a.c.push({ s, e, k });
    a.c.sort((x, y) => x.s - y.s);
  }
}
function cut(list, s, e) {
  const out = [];
  for (const r of list) {
    if (r.e <= s || r.s >= e) { out.push(r); continue; }
    if (r.s < s) out.push({ ...r, e: s });
    if (r.e > e) out.push({ ...r, s: e });
  }
  return out;
}
export function colorAt(a, i) {
  let k = null;
  for (const r of a.c || []) if (i >= r.s && i < r.e) k = r.k;
  return k;
}

// 選んだ範囲の最初の文字に記号をつける／もうついていれば消す
export function toggleMark(anno, at, k) {
  const a = anno[at.l]; if (!a) return;
  a.m = a.m || [];
  const j = a.m.findIndex(x => x.i === at.i && x.k === k);
  if (j >= 0) a.m.splice(j, 1); else a.m.push({ i: at.i, k });
  a.m.sort((x, y) => x.i - y.i);
}

// 選んだ範囲の書きこみを全部消す
export function clearRange(anno, from, to) {
  for (let l = from.l; l <= to.l; l++) {
    const a = anno[l]; if (!a) continue;
    const s = l === from.l ? from.i : 0;
    const e = l === to.l ? to.i + 1 : [...a.t].length;
    a.c = cut(a.c || [], s, e);
    a.m = (a.m || []).filter(x => x.i < s || x.i >= e);
  }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 1行を HTML にする。1文字ずつ data-l / data-i をつけて、なぞった場所がわかるようにする
export function renderLine(a, l, marks, colors) {
  const chars = Array.from(a.t);
  if (!chars.length) return '<span class="blank">&nbsp;</span>';
  const mk = new Map();
  for (const m of a.m || []) {
    const def = marks.find(x => x.id === m.k); if (!def) continue;
    if (!mk.has(m.i)) mk.set(m.i, []);
    mk.get(m.i).push(def.label);
  }
  let html = '';
  let open = null;
  // 文字の位置は UTF-16 ではなく「1文字ずつ」で数える
  chars.forEach((ch, i) => {
    const ck = colorAt(a, i);
    if (ck !== open) {
      if (open) html += '</span>';
      const def = ck && colors.find(x => x.id === ck);
      html += def ? `<span class="col" style="--c:${esc(def.color)}">` : '';
      open = def ? ck : null;
    }
    const inner = `<span data-l="${l}" data-i="${i}">${esc(ch)}</span>`;
    html += mk.has(i) ? `<ruby>${inner}<rt>${esc(mk.get(i).join(''))}</rt></ruby>` : inner;
  });
  if (open) html += '</span>';
  return html;
}

// 「あいうえお順」の見出し（あ・か・さ…）
const ROWS = 'あかさたなはまやらわ';
const ROW_START = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', 'ん'];
export function kanaRow(s) {
  let c = (s || '').trim().charAt(0);
  if (!c) return 'その他';
  const code = c.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60); // カタカナ→ひらがな
  c = c.normalize('NFKC');
  if (/[a-z]/i.test(c)) return c.toUpperCase();
  if (/[0-9]/.test(c)) return '0-9';
  if (c >= 'ぁ' && c <= 'ゖ') {
    // 濁点などをとってから行を決める
    const base = c.normalize('NFD').charAt(0);
    for (let i = ROW_START.length - 2; i >= 0; i--) if (base >= ROW_START[i]) return ROWS[i];
  }
  return 'その他';
}
