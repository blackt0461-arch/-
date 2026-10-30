// 画面の切り替えと、各部品のつなぎ込み

import { NOTE_NAMES, identifyFromNotes, identifyFromChroma, midiToPitchClass } from './chord-engine.js';
import { startListening } from './audio.js';
import { TUNINGS, parseShape, formatShape, soundingNotes, renderFretboard } from './fretboard.js';

const SILENCE_LEVEL = 0.006; // これより小さい音量のときは「―」を表示

// ---------- タブ ----------
const tabs = [
  { tab: document.getElementById('tab-mic'), panel: document.getElementById('panel-mic') },
  { tab: document.getElementById('tab-fret'), panel: document.getElementById('panel-fret') },
];
tabs.forEach(({ tab }, i) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t, j) => {
      t.tab.setAttribute('aria-selected', String(i === j));
      t.panel.hidden = i !== j;
    });
  });
});

// ---------- 結果の表示 ----------
function renderResult(container, candidates, { showConfidence = false, emptyText = '―' } = {}) {
  if (candidates.length === 0) {
    container.innerHTML = `<div class="chord-name empty">${emptyText}</div>`;
    return;
  }
  const [top, ...others] = candidates;
  const tones = (c) => c.notes.map((n, i) => `<span class="tone"><b>${n}</b><small>${c.degrees[i]}</small></span>`).join('');
  container.innerHTML = `
    <div class="top">
      <div class="chord-name">${top.name}</div>
      ${showConfidence ? `<div class="confidence">${top.confidence}%</div>` : ''}
    </div>
    <div class="tones">${tones(top)}</div>
    ${others.length ? `<ol class="others" start="2">${others.map((c) => `
      <li><span class="other-name">${c.name}</span>
        <span class="other-notes">${c.notes.join(' ')}</span>
        ${showConfidence ? `<span class="other-confidence">${c.confidence}%</span>` : ''}</li>`).join('')}</ol>` : ''}
  `;
}

// ---------- マイク ----------
const micToggle = document.getElementById('mic-toggle');
const micError = document.getElementById('mic-error');
const micResult = document.getElementById('mic-result');
const chromaEl = document.getElementById('chroma');
chromaEl.innerHTML = NOTE_NAMES.map((n) => `<div class="bar"><span class="fill"></span><small>${n}</small></div>`).join('');
const chromaFills = [...chromaEl.querySelectorAll('.fill')];
let listener = null;
renderResult(micResult, [], { emptyText: '―' });

micToggle.addEventListener('click', async () => {
  if (listener) {
    listener.stop();
    listener = null;
    micToggle.textContent = 'マイクを開始';
    micToggle.classList.remove('active');
    renderResult(micResult, []);
    chromaFills.forEach((f) => { f.style.height = '0%'; });
    return;
  }
  micError.hidden = true;
  try {
    listener = await startListening(({ chroma, bass, level }) => {
      const max = Math.max(...chroma) || 1;
      chromaFills.forEach((f, i) => { f.style.height = `${level < SILENCE_LEVEL ? 0 : (chroma[i] / max) * 100}%`; });
      const candidates = level < SILENCE_LEVEL ? [] : identifyFromChroma(chroma, bass, 3);
      renderResult(micResult, candidates, { showConfidence: true });
    });
    micToggle.textContent = 'マイクを停止';
    micToggle.classList.add('active');
  } catch (err) {
    micError.textContent = location.protocol === 'https:' || location.hostname === 'localhost'
      ? 'マイクを使えませんでした。ブラウザの設定でマイクを許可してください。'
      : 'マイクは https:// のページでのみ使えます。';
    micError.hidden = false;
  }
});

// ---------- 指板 ----------
const tuningSelect = document.getElementById('tuning');
const capoSelect = document.getElementById('capo');
const shapeInput = document.getElementById('shape-input');
const shapeError = document.getElementById('shape-error');
const fretResult = document.getElementById('fret-result');
const fretboardEl = document.getElementById('fretboard');

tuningSelect.innerHTML = TUNINGS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
capoSelect.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? 'なし' : i + 'フレット'}</option>`).join('');

let frets = [null, 3, 2, 0, 1, 0];

function updateFret({ fromInput = false } = {}) {
  const tuning = TUNINGS.find((t) => t.id === tuningSelect.value);
  const notes = soundingNotes(frets, tuning, Number(capoSelect.value));
  const bass = notes.length ? midiToPitchClass(Math.min(...notes)) : null;
  const candidates = identifyFromNotes(notes.map(midiToPitchClass), bass, 4);
  const emptyText = new Set(notes.map(midiToPitchClass)).size < 2 ? '―' : '該当なし';
  renderResult(fretResult, candidates, { emptyText });
  if (!fromInput) shapeInput.value = formatShape(frets);
  renderFretboard(fretboardEl, frets, (next) => {
    frets = next;
    shapeError.hidden = true;
    updateFret();
  });
}

shapeInput.addEventListener('input', () => {
  const parsed = parseShape(shapeInput.value);
  shapeError.hidden = parsed !== null || shapeInput.value.trim() === '';
  if (parsed) {
    frets = parsed;
    updateFret({ fromInput: true });
  }
});
document.getElementById('clear-shape').addEventListener('click', () => {
  frets = [0, 0, 0, 0, 0, 0];
  shapeError.hidden = true;
  updateFret();
});
tuningSelect.addEventListener('change', () => updateFret());
capoSelect.addEventListener('change', () => updateFret());

updateFret();
