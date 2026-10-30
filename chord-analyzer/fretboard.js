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
 * 縦向きの指板（スマホの縦画面向け）を container に描画する。
 * 左が6弦、右が1弦。いちばん上の行は開放弦（○）とミュート（×）の切り替え。
 */
export function renderFretboard(container, frets, onChange) {
  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'board';

  for (let fret = 0; fret <= MAX_FRET; fret++) {
    const row = document.createElement('div');
    row.className = fret === 0 ? 'fret-row nut-row' : 'fret-row';

    const label = document.createElement('span');
    label.className = 'fret-number';
    label.textContent = fret === 0 ? '' : fret;
    row.appendChild(label);

    for (let s = 0; s < 6; s++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      const current = frets[s];

      if (fret === 0) {
        cell.textContent = current === MUTED ? '×' : current === 0 ? '○' : '';
        cell.classList.toggle('muted', current === MUTED);
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
          cell.appendChild(dot);
        }
        cell.setAttribute('aria-label', `${6 - s}弦 ${fret}フレット`);
        cell.addEventListener('click', () => {
          const next = [...frets];
          next[s] = current === fret ? 0 : fret;
          onChange(next);
        });
      }
      row.appendChild(cell);
    }
    if ([3, 5, 7, 9, 15].includes(fret)) row.classList.add('marker-single');
    if (fret === 12) row.classList.add('marker-double');
    board.appendChild(row);
  }

  const header = document.createElement('div');
  header.className = 'string-labels';
  header.innerHTML = '<span></span>' + [6, 5, 4, 3, 2, 1].map((n) => `<span>${n}</span>`).join('');
  container.append(header, board);
}
