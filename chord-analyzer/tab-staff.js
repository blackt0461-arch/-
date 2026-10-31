// タブ譜を、楽譜のような形（6本の線・小節線・コード名・リズムの棒）で描く

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * 拍の位置から小節の区切り（[{ start, end }]）を作る。拍が分からないときは 4 秒ずつに区切る
 */
export function makeBars(beats, downbeat, duration) {
  const bars = [];
  if (beats && beats.length >= 4) {
    const period = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
    const first = ((downbeat % 4) + 4) % 4;
    // 最初の小節頭より前に音があるときのために、前に 1 小節足す
    const starts = [];
    for (let k = first; k < beats.length; k += 4) starts.push(beats[k]);
    if (starts[0] > 0.05) starts.unshift(Math.max(0, starts[0] - 4 * period));
    starts.forEach((s, i) => bars.push({ start: s, end: i + 1 < starts.length ? starts[i + 1] : s + 4 * period }));
    while (bars[bars.length - 1].end < duration) { const last = bars[bars.length - 1]; bars.push({ start: last.end, end: last.end + 4 * period }); }
  } else {
    for (let s = 0; s < duration; s += 4) bars.push({ start: s, end: s + 4 });
  }
  return bars;
}

/**
 * 1段ぶん（何小節か）を SVG にする。
 * tabEvents：[{ t, positions: [{ string, fret }] }]（string 0 が 6弦）
 * 戻り値：{ svg, xAt(t) }（xAt は再生位置の線を引くための、時刻 → 横の位置）
 */
export function staffRowSvg(bars, tabEvents, timeline, { stringNames = ['E', 'A', 'D', 'G', 'B', 'e'], width = 360, firstBarNumber = 1 } = {}) {
  const left = 26, right = 6, top = 34, gap = 11, bottom = 22;
  const staffH = gap * 5;
  const height = top + staffH + bottom;
  // 小節の幅は、音の多さに合わせて広げる（音の多い小節が窮屈にならないように）
  // 2けたのフレット（10 以上）を含む音は幅を多めに取る
  const weights = bars.map((b) => Math.max(4, tabEvents.filter((e) => e.t >= b.start - 0.02 && e.t < b.end - 0.02)
    .reduce((a, e) => a + (e.positions.some((p) => p.fret >= 10) ? 1.6 : 1), 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  const barX = [left];
  weights.forEach((w) => barX.push(barX[barX.length - 1] + ((width - left - right) * w) / total));
  const pad = 9;
  const xAt = (t) => {
    const i = bars.findIndex((b) => t < b.end);
    const k = i < 0 ? bars.length - 1 : i;
    const b = bars[k];
    const f = Math.max(0, Math.min(1, (t - b.start) / (b.end - b.start)));
    return barX[k] + pad + f * (barX[k + 1] - barX[k] - 2 * pad);
  };
  const yOf = (string) => top + (5 - string) * gap; // 上が 1弦
  const parts = [];
  // 6本の線と、左の弦の名前・「TAB」
  for (let s = 0; s < 6; s++) {
    parts.push(`<line x1="${left}" y1="${yOf(s)}" x2="${width - right}" y2="${yOf(s)}" class="ts-line"/>`);
    parts.push(`<text x="${left - 6}" y="${yOf(s) + 3.5}" class="ts-name">${esc(stringNames[s])}</text>`);
  }
  // 小節線と小節番号
  for (let k = 0; k <= bars.length; k++) {
    const x = barX[k];
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + staffH}" class="ts-bar"/>`);
    if (k < bars.length) parts.push(`<text x="${x + 2}" y="${top - 24}" class="ts-num">${firstBarNumber + k}</text>`);
  }
  // コード名：小節の頭で鳴っているコードと、小節の途中で変わったコード
  const rowStart = bars[0].start, rowEnd = bars[bars.length - 1].end;
  let lastX = -100;
  timeline.forEach((seg) => {
    if (seg.end <= rowStart || seg.start >= rowEnd) return;
    const atStart = seg.start <= rowStart;
    const x = atStart ? left + pad : xAt(seg.start);
    if (x < lastX) return; // 前のコード名と重なるときは省く
    lastX = x + seg.name.length * 6 + 4;
    parts.push(`<text x="${x}" y="${top - 12}" class="ts-chord">${esc(seg.name)}</text>`);
  });
  // 音（フレット番号）とリズムの棒
  tabEvents.forEach((e) => {
    if (e.t < rowStart - 0.02 || e.t >= rowEnd - 0.02) return;
    const x = xAt(e.t);
    e.positions.forEach((p) => {
      const label = String(p.fret);
      const w = label.length > 1 ? 13 : 8;
      parts.push(`<rect x="${x - w / 2}" y="${yOf(p.string) - 5.5}" width="${w}" height="11" class="ts-bg"/>`);
      parts.push(`<text x="${x}" y="${yOf(p.string) + 3.5}" class="ts-fret">${label}</text>`);
    });
    // 棒の長さで音の長さの目安を示す（長く鳴らす音ほど長い棒。和音は太い棒）
    const len = e.dur ? Math.max(6, Math.min(16, 6 + e.dur * 10)) : 10;
    parts.push(`<line x1="${x}" y1="${top + staffH + 4}" x2="${x}" y2="${top + staffH + 4 + len}" class="ts-stem${e.positions.length >= 3 ? ' ts-strum' : ''}"/>`);
  });
  // 再生位置の線（最初は隠しておく）
  parts.push(`<line x1="0" y1="${top - 4}" x2="0" y2="${top + staffH + 4}" class="ts-cursor" visibility="hidden"/>`);
  const svg = `<svg class="tab-staff" viewBox="0 0 ${width} ${height}" role="img" aria-label="タブ譜">${parts.join('')}</svg>`;
  return { svg, xAt };
}

/**
 * 曲全体を、楽譜のような段に分ける。1段に入る小節の数は、音の多さに合わせて 1〜4（スマホの幅に合わせる）
 * 戻り値：[{ t, end, svg, xAt, events }]
 */
export function buildStaffRows(tabEvents, { beats, downbeat = 0, duration, timeline = [], stringNames, maxNotesPerRow = 18, maxBars = 4 }) {
  const end = Math.max(duration ?? 0, ...tabEvents.map((e) => e.t + 0.1));
  const bars = makeBars(beats, downbeat, end).filter((b) => tabEvents.some((e) => e.t >= b.start - 0.02 && e.t < b.end - 0.02) || timeline.some((s) => s.start < b.end && s.end > b.start));
  const rows = [];
  let i = 0;
  while (i < bars.length) {
    const row = [bars[i]];
    let notes = tabEvents.filter((e) => e.t >= bars[i].start - 0.02 && e.t < bars[i].end - 0.02).length;
    let j = i + 1;
    while (j < bars.length && row.length < maxBars && Math.abs(bars[j].start - row[row.length - 1].end) < 0.05) {
      const n = tabEvents.filter((e) => e.t >= bars[j].start - 0.02 && e.t < bars[j].end - 0.02).length;
      if (notes + n > maxNotesPerRow) break;
      row.push(bars[j]); notes += n; j++;
    }
    const events = tabEvents.filter((e) => e.t >= row[0].start - 0.02 && e.t < row[row.length - 1].end - 0.02);
    const { svg, xAt } = staffRowSvg(row, events, timeline, { stringNames, firstBarNumber: i + 1 });
    rows.push({ t: row[0].start, end: row[row.length - 1].end, svg, xAt, events });
    i = j;
  }
  return rows;
}
