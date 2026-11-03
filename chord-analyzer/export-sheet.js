// 直した譜面を、印刷できる白い紙（A4）の画像にする。
// 題名・キー/カポ・テンポ、使うコードの押さえ方図、歌詞の上にコード（歌詞が無いときは小節ごとのコード）を描く
const W = 1240, H = 1754, M = 90; // A4 を 150dpi で描いた大きさと、余白
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif';
const INK = '#111', SUB = '#666', CHORD = '#c0392b', LINE = '#bbb';

/**
 * sheet：{ title, info, chords: [{ name, frets }], lines: [{ text, marks: [{ pos, name }], after: [name] }] | null, bars: [[name…]] }
 * 戻り値：ページごとの canvas の配列
 */
export function renderSheetPages(sheet) {
  const pages = [];
  let ctx = null, y = 0;
  const newPage = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    pages.push(c);
    y = M;
  };
  const need = (h) => { if (y + h > H - M - 30) newPage(); };
  newPage();

  // 題名と曲の情報
  ctx.fillStyle = INK; ctx.font = `700 52px ${FONT}`;
  y += 52; ctx.fillText(sheet.title || '無題', M, y);
  ctx.fillStyle = SUB; ctx.font = `400 26px ${FONT}`;
  y += 44; ctx.fillText(sheet.info || '', M, y);
  y += 26;
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 30;

  // 使うコードの押さえ方図
  const cellW = 132, cellH = 190;
  const perRow = Math.floor((W - 2 * M) / cellW);
  (sheet.chords ?? []).forEach((c, i) => {
    if (i % perRow === 0) { if (i) y += cellH; need(cellH); }
    drawDiagram(ctx, M + (i % perRow) * cellW, y, c.name, c.frets);
  });
  if (sheet.chords?.length) y += cellH + 10;

  if (sheet.lines?.length) {
    // 歌詞の上にコード
    const lyricFont = `400 34px ${FONT}`, chordFont = `700 28px ${FONT}`;
    const maxW = W - 2 * M;
    sheet.lines.forEach((line) => {
      if (!line.text) { y += 26; return; }
      // 長い行は折り返す（文字の位置でコードも分ける）
      ctx.font = lyricFont;
      const chars = [...line.text];
      const pieces = [];
      let from = 0;
      while (from < chars.length) {
        let to = from + 1;
        while (to < chars.length && ctx.measureText(chars.slice(from, to + 1).join('')).width <= maxW) to++;
        pieces.push([from, to]);
        from = to;
      }
      pieces.forEach(([a, b], k) => {
        need(90);
        const text = chars.slice(a, b).join('');
        const marks = line.marks.filter((m) => m.pos >= a && m.pos < b);
        let prevEnd = -Infinity;
        ctx.font = chordFont; ctx.fillStyle = CHORD;
        marks.forEach((m) => {
          ctx.font = lyricFont;
          let x = M + ctx.measureText(chars.slice(a, m.pos).join('')).width;
          ctx.font = chordFont;
          if (x < prevEnd + 10) x = prevEnd + 10; // コード名どうしが重ならないように
          ctx.fillText(m.name, x, y + 30);
          prevEnd = x + ctx.measureText(m.name).width;
        });
        if (k === pieces.length - 1 && line.after?.length) {
          ctx.font = lyricFont;
          let x = Math.max(prevEnd + 24, M + ctx.measureText(text).width + 30);
          ctx.font = chordFont;
          line.after.forEach((n) => { ctx.fillText(n, x, y + 30); x += ctx.measureText(n).width + 22; });
        }
        ctx.font = lyricFont; ctx.fillStyle = INK;
        ctx.fillText(text, M, y + 76);
        y += 94;
      });
    });
  } else if (sheet.bars?.length) {
    // 小節ごとのコード（4小節で1行）
    const rowH = 84, barW = (W - 2 * M) / 4;
    sheet.bars.forEach((names, i) => {
      if (i % 4 === 0) { if (i) y += rowH; need(rowH); }
      const x = M + (i % 4) * barW;
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y + 66); ctx.stroke();
      if (i % 4 === 3 || i === sheet.bars.length - 1) { ctx.beginPath(); ctx.moveTo(x + barW, y + 10); ctx.lineTo(x + barW, y + 66); ctx.stroke(); }
      ctx.fillStyle = INK; ctx.font = `700 ${names.length > 2 ? 24 : 30}px ${FONT}`;
      ctx.fillText(names.length ? names.join('  ') : '%', x + 14, y + 50, barW - 20);
    });
    y += rowH;
  }

  // ページ番号
  pages.forEach((c, i) => {
    const g = c.getContext('2d');
    g.fillStyle = SUB; g.font = `400 20px ${FONT}`;
    g.fillText(`${i + 1} / ${pages.length}`, W / 2 - 20, H - 40);
  });
  return pages;
}

/** コードの押さえ方図（6本の弦・5フレット分） */
function drawDiagram(ctx, x, y, name, frets) {
  ctx.fillStyle = INK; ctx.font = `700 28px ${FONT}`;
  ctx.fillText(name, x + 6, y + 30, 120);
  if (!frets) return;
  const left = x + 18, top = y + 62, gw = 90, gh = 100, rows = 5;
  const fretted = frets.filter((f) => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const maxF = fretted.length ? Math.max(...fretted) : 1;
  const base = maxF <= rows ? 1 : minF; // 高い位置の押さえ方は、何フレット目からかを書く
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  for (let s = 0; s < 6; s++) { const sx = left + (s * gw) / 5; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx, top + gh); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { const ry = top + (r * gh) / rows; ctx.lineWidth = r === 0 && base === 1 ? 5 : 1.6; ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(left + gw, ry); ctx.stroke(); }
  if (base > 1) { ctx.font = `400 18px ${FONT}`; ctx.fillText(`${base}`, left - 18, top + gh / rows - 2); }
  frets.forEach((f, s) => {
    const sx = left + (s * gw) / 5;
    if (f === null) { ctx.font = `400 18px ${FONT}`; ctx.fillText('×', sx - 6, top - 8); return; }
    if (f === 0) { ctx.beginPath(); ctx.arc(sx, top - 14, 6, 0, Math.PI * 2); ctx.lineWidth = 1.6; ctx.stroke(); return; }
    const r = f - base;
    if (r < 0 || r >= rows) return;
    ctx.beginPath(); ctx.arc(sx, top + ((r + 0.5) * gh) / rows, 8, 0, Math.PI * 2); ctx.fill();
  });
}

/** 画像（PNG）にする */
export const toPng = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));
