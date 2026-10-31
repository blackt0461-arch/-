// 指板の表示とタップ操作、押さえ方の文字列（例: x32010）の変換

// 開放弦の高さ（MIDIノート番号）。並びは 6弦 → 1弦
export const TUNINGS = [
  { id: 'standard', label: '標準 (EADGBE)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'half-down', label: '半音下げ (E♭A♭D♭G♭B♭E♭)', strings: [39, 44, 49, 54, 58, 63] },
  { id: 'drop-d', label: 'Drop D (DADGBE)', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', label: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', label: 'オープンG (DGDGBD)', strings: [38, 43, 50, 55, 59, 62] },
  { id: 'open-d', label: 'オープンD (DADF#AD)', strings: [38, 45, 50, 54, 57, 62] },
];

export const MAX_FRET = 15;
const MUTED = null;

/** "x32010" や "x-3-2-0-1-0" / "x 10 12 12 11 10" を [null,3,2,0,1,0] に変換。不正なら null */
export function parseShape(text) {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;
  const tokens = /[\s,\-]/.test(trimmed) ? trimmed.split(/[\s,\-]+/).filter(Boolean) : [...trimmed];
  if (tokens.length !== 6) return null;
  const frets = [];
  for (const t of tokens) {
    if (t === 'x') frets.push(MUTED);
    else if (/^\d+$/.test(t) && Number(t) <= MAX_FRET) frets.push(Number(t));
    else return null;
  }
  return frets;
}

/** [null,3,2,0,1,0] → "x32010"（10フレット以上を含むときは "x-10-12-..." の形） */
export function formatShape(frets) {
  const tokens = frets.map((f) => (f === MUTED ? 'x' : String(f)));
  return frets.some((f) => f !== MUTED && f >= 10) ? tokens.join('-') : tokens.join('');
}

/** 鳴っている弦の音の高さ（MIDI）を 6弦 → 1弦 の順で返す。フレット番号はカポからの数え方 */
export function soundingNotes(frets, tuning, capo = 0) {
  return frets
    .map((f, i) => (f === MUTED ? null : tuning.strings[i] + capo + f))
    .filter((n) => n !== null);
}

/**
 * 押さえ方の候補を探す（コード名 → 押さえ方の辞書）。
 * 4フレットの幅に収まり、指4本（セーハは1本と数える）で押さえられ、
 * いちばん低い音が bass になる形を、弾きやすい順に返す。フレット番号はカポからの数え方。
 */
export function findVoicings(root, type, bass, tuning, { capo = 0, maxFret = 12, limit = 6 } = {}) {
  const mod12 = (n) => ((n % 12) + 12) % 12;
  const tones = type.intervals.map((i) => mod12(root + i));
  const required = tones.filter((t) => !(type.optional5 && t === mod12(root + 7)));
  const minStrings = type.suffix === '5' ? 2 : Math.min(4, tones.length + 1);
  const isTone = (s, f) => tones.includes(mod12(tuning.strings[s] + capo + f));
  const found = new Map();

  for (let base = 0; base <= maxFret - 3; base++) {
    // 弦ごとに置ける場所：ミュート、開放弦（低いポジションのみ）、base〜base+3 フレット
    const options = tuning.strings.map((_, s) => {
      const list = [MUTED];
      if (base <= 4 && isTone(s, 0)) list.push(0);
      for (let f = Math.max(1, base); f <= base + 3; f++) if (isTone(s, f)) list.push(f);
      return list;
    });
    const shape = new Array(6);
    const visit = (s) => {
      if (s === 6) return consider([...shape]);
      for (const f of options[s]) { shape[s] = f; visit(s + 1); }
    };
    visit(0);
  }

  function consider(frets) {
    const sounding = frets.map((f, s) => (f === MUTED ? -1 : s)).filter((s) => s >= 0);
    if (sounding.length < minStrings) return;
    // ミュートは低音側と高音側だけ（間の弦を消す押さえ方は難しいので除く）
    const first = sounding[0], last = sounding[sounding.length - 1];
    if (last - first + 1 !== sounding.length) return;
    const pcs = sounding.map((s) => mod12(tuning.strings[s] + capo + frets[s]));
    if (pcs[0] !== bass) return;
    if (!required.every((t) => pcs.includes(t))) return;

    const fretted = frets.filter((f) => f !== MUTED && f > 0);
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    // セーハ：いちばん低いフレットを複数の弦で押さえ、その間に開放弦が無ければ人差し指1本で押さえられる
    const atMin = sounding.filter((s) => frets[s] === minF && minF > 0);
    const barre = atMin.length >= 2 && sounding.every((s) => s < atMin[0] || s > atMin[atMin.length - 1] || frets[s] > 0);
    const fingers = barre ? 1 + fretted.filter((f) => f > minF).length : fretted.length;
    if (fingers > 4) return;

    const opens = frets.filter((f) => f === 0).length;
    const span = maxF - minF;
    const score = sounding.length * 2
      + (maxF <= 3 ? opens * 0.5 : -opens * 1.5) // 開放弦は低いポジションでは弾きやすく、高いと不自然
      - minF * 0.2
      - span * 0.5 - (span >= 3 ? 1 : 0)         // 指を大きく広げる形は難しい
      - fingers * 0.3 - (fingers === 4 ? 0.5 : 0)
      + (pcs.filter((p) => p === root).length > 1 ? 0.3 : 0);
    const key = formatShape(frets);
    if (!found.has(key)) found.set(key, { frets, score, position: minF });
  }

  // 弾きやすいものから選ぶ。すでに選んだ形の弦を減らしただけの形は、ほぼ同じなので除く
  const picked = [];
  for (const v of [...found.values()].sort((a, b) => b.score - a.score)) {
    const isSubset = picked.some((p) => v.frets.every((f, s) => f === MUTED || f === p.frets[s]));
    if (!isSubset) picked.push(v);
    if (picked.length === limit) break;
  }
  return picked.sort((a, b) => a.position - b.position).map((v) => v.frets);
}

const MARKERS = { 3: [0.5], 5: [0.5], 7: [0.5], 9: [0.5], 12: [1 / 3, 2 / 3], 15: [0.5] };

/**
 * 指板を container に描画する。
 * - 縦向き（スマホの縦画面）：左が6弦、右が1弦、上がヘッド側
 * - 横向き（タブレットの横画面）：上が1弦、下が6弦、左がヘッド側（タブ譜と同じ向き）
 * - 左利き：縦向きは弦の左右を、横向きはヘッドの左右を入れ替える
 * いちばんヘッド側の列（0フレット）は開放弦（○）とミュート（×）の切り替え。
 * labelFor(弦の番号) は、その弦で鳴っている音の表示（音名や度数）を返す。
 */
export function renderFretboard(container, frets, onChange, { labelFor = () => '', horizontal = false, lefty = false } = {}) {
  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = `board ${horizontal ? 'horizontal' : 'vertical'}${lefty ? ' lefty' : ''}`;

  // 弦 s（0 = 6弦）とフレット fret の、グリッド上の位置
  const place = (el, s, fret) => {
    const stringPos = horizontal ? 1 + (5 - s) : 2 + (lefty ? 5 - s : s);
    const fretPos = horizontal ? 2 + (lefty ? MAX_FRET - fret : fret) : 2 + fret;
    el.style.gridRow = horizontal ? stringPos : fretPos;
    el.style.gridColumn = horizontal ? fretPos : stringPos;
  };
  const placeLabel = (el, { s = null, fret = null }) => {
    if (s !== null) {
      el.style.gridRow = horizontal ? 1 + (5 - s) : 1;
      el.style.gridColumn = horizontal ? 1 : 2 + (lefty ? 5 - s : s);
    } else {
      el.style.gridRow = horizontal ? 7 : 2 + fret;
      el.style.gridColumn = horizontal ? 2 + (lefty ? MAX_FRET - fret : fret) : 1;
    }
  };

  for (let s = 0; s < 6; s++) {
    const label = document.createElement('span');
    label.className = 'string-label';
    label.textContent = `${6 - s}弦`;
    placeLabel(label, { s });
    board.appendChild(label);
  }

  for (let fret = 0; fret <= MAX_FRET; fret++) {
    const number = document.createElement('span');
    number.className = 'fret-number';
    number.textContent = fret === 0 ? '' : fret;
    placeLabel(number, { fret });
    board.appendChild(number);

    for (let s = 0; s < 6; s++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = fret === 0 ? 'cell nut' : 'cell';
      place(cell, s, fret);
      const current = frets[s];

      if (fret === 0) {
        if (current === MUTED) {
          cell.textContent = '×';
          cell.classList.add('muted');
        } else if (current === 0) {
          const open = document.createElement('span');
          open.className = 'open';
          open.textContent = labelFor(s);
          cell.appendChild(open);
        }
        cell.setAttribute('aria-label', `${6 - s}弦 ${current === MUTED ? 'ミュート' : '開放'}`);
        cell.addEventListener('click', () => {
          const next = [...frets];
          next[s] = current === MUTED ? 0 : current === 0 ? MUTED : 0;
          onChange(next);
        });
      } else {
        if (current === fret) {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.textContent = labelFor(s);
          cell.appendChild(dot);
        }
        cell.setAttribute('aria-label', `${6 - s}弦 ${fret}フレット`);
        cell.addEventListener('click', () => {
          const next = [...frets];
          next[s] = current === fret ? 0 : fret;
          onChange(next);
        });
      }
      board.appendChild(cell);
    }

    // ポジションマーク：弦をまたぐ帯を置き、その中に丸を描く
    if (MARKERS[fret]) {
      const band = document.createElement('span');
      band.className = 'marker-band';
      const fretPos = horizontal ? 2 + (lefty ? MAX_FRET - fret : fret) : 2 + fret;
      band.style.gridRow = horizontal ? '1 / 7' : fretPos;
      band.style.gridColumn = horizontal ? fretPos : '2 / 8';
      MARKERS[fret].forEach((pos) => {
        const mark = document.createElement('span');
        mark.className = 'marker';
        mark.style.setProperty('--pos', `${pos * 100}%`);
        band.appendChild(mark);
      });
      board.appendChild(band);
    }
  }

  container.appendChild(board);
}

/**
 * 押さえ方の小さなコード図（SVG）を作る。縦向き：左が6弦、右が1弦、上がヘッド側。
 * 押さえるところに丸、鳴らさない弦に ×、開放弦に ○。高いポジションでは左にフレット番号を書く。
 */
export function chordDiagramSvg(frets, { width = 64 } = {}) {
  if (!frets) return '';
  const fretted = frets.filter((f) => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const rows = 4;
  const start = maxF <= rows ? 1 : minF; // 4フレット以内に収まれば、ナット（ヘッド側の太い線）から描く
  const left = 12, top = 14, gapX = (width - left - 6) / 5, gapY = 13;
  const height = top + gapY * rows + 4;
  const x = (s) => left + gapX * s;
  const parts = [];
  for (let s = 0; s < 6; s++) parts.push(`<line x1="${x(s)}" y1="${top}" x2="${x(s)}" y2="${top + gapY * rows}" class="cd-line"/>`);
  for (let r = 0; r <= rows; r++) parts.push(`<line x1="${x(0)}" y1="${top + gapY * r}" x2="${x(5)}" y2="${top + gapY * r}" class="${r === 0 && start === 1 ? 'cd-nut' : 'cd-line'}"/>`);
  if (start > 1) parts.push(`<text x="2" y="${top + gapY * 0.5 + 4}" class="cd-fret">${start}</text>`);
  // セーハ（同じフレットを人差し指でまとめて押さえる）
  const atMin = frets.map((f, s) => (f === minF && minF > 0 ? s : -1)).filter((s) => s >= 0);
  const opens = frets.filter((f) => f === 0).length;
  if (atMin.length >= 3 && opens === 0) {
    const y = top + gapY * (minF - start + 0.5);
    parts.push(`<rect x="${x(atMin[0]) - 4}" y="${y - 4}" width="${x(atMin[atMin.length - 1]) - x(atMin[0]) + 8}" height="8" rx="4" class="cd-dot"/>`);
  }
  frets.forEach((f, s) => {
    if (f === null) parts.push(`<text x="${x(s)}" y="${top - 4}" class="cd-mark">×</text>`);
    else if (f === 0) parts.push(`<circle cx="${x(s)}" cy="${top - 7}" r="3" class="cd-open"/>`);
    else parts.push(`<circle cx="${x(s)}" cy="${top + gapY * (f - start + 0.5)}" r="4.5" class="cd-dot"/>`);
  });
  return `<svg class="chord-diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${parts.join('')}</svg>`;
}
