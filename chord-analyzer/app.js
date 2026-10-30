// 画面の切り替えと、各部品のつなぎ込み

import { NOTE_NAMES, identifyFromNotes, identifyFromChroma, midiToPitchClass } from './chord-engine.js';
import { startListening } from './audio.js';
import { TUNINGS, parseShape, formatShape, soundingNotes, renderFretboard } from './fretboard.js';

// version.json と同じ値にする（新しいバージョンを公開したら両方を上げる）
const APP_VERSION = '1.1.0';
const APP_FILES = ['index.html', 'style.css', 'app.js', 'chord-engine.js', 'audio.js', 'fretboard.js'];
const HOLD_MS = 150; // マイク：別のコードがこの時間続いたら表示を切り替える

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 保存できなくても動作は続ける */ } },
};

// ---------- タブ ----------
const tabs = [
  { tab: document.getElementById('tab-fret'), panel: document.getElementById('panel-fret') },
  { tab: document.getElementById('tab-mic'), panel: document.getElementById('panel-mic') },
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
  const tones = top.notes.map((n, i) => `<span class="tone"><b>${n}</b><small>${top.degrees[i]}</small></span>`).join('');
  container.innerHTML = `
    <div class="top">
      <div class="chord-name">${top.name}</div>
      ${showConfidence ? `<div class="confidence">${top.confidence}%</div>` : ''}
    </div>
    <div class="tones">${tones}</div>
    ${others.length ? `<div class="others">ほかの呼び方：${others.map((c) => `<span class="other">${c.name}${showConfidence ? `<small> ${c.confidence}%</small>` : ''}</span>`).join('')}</div>` : ''}
  `;
}

// ---------- 指板 ----------
const tuningSelect = document.getElementById('tuning');
const capoSelect = document.getElementById('capo');
const shapeInput = document.getElementById('shape-input');
const shapeError = document.getElementById('shape-error');
const fretResult = document.getElementById('fret-result');
const fretboardEl = document.getElementById('fretboard');
const labelButtons = [...document.querySelectorAll('.segmented [data-label]')];

tuningSelect.innerHTML = TUNINGS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
capoSelect.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? 'なし' : i}</option>`).join('');

let frets = parseShape(storage.get('shape') || '') || [null, 3, 2, 0, 1, 0];
let labelMode = storage.get('labelMode') === 'degree' ? 'degree' : 'note';
if (TUNINGS.some((t) => t.id === storage.get('tuning'))) tuningSelect.value = storage.get('tuning');
capoSelect.value = storage.get('capo') || '0';

function updateFret({ fromInput = false } = {}) {
  const tuning = TUNINGS.find((t) => t.id === tuningSelect.value);
  const capo = Number(capoSelect.value);
  const notes = soundingNotes(frets, tuning, capo);
  const bass = notes.length ? midiToPitchClass(Math.min(...notes)) : null;
  const candidates = identifyFromNotes(notes.map(midiToPitchClass), bass, 4);
  const emptyText = new Set(notes.map(midiToPitchClass)).size < 2 ? '―' : '該当なし';
  renderResult(fretResult, candidates, { emptyText });

  // 丸の中の表示：音名、または いちばん有力なコードでの度数
  const top = candidates[0];
  const labelFor = (s) => {
    if (frets[s] === null) return '';
    const name = NOTE_NAMES[midiToPitchClass(tuning.strings[s] + capo + frets[s])];
    if (labelMode === 'note' || !top) return name;
    return top.degrees[top.notes.indexOf(name)] ?? name;
  };
  renderFretboard(fretboardEl, frets, (next) => {
    frets = next;
    shapeError.hidden = true;
    updateFret();
  }, labelFor);

  labelButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.label === labelMode)));
  if (!fromInput) shapeInput.value = formatShape(frets);
  storage.set('shape', formatShape(frets));
  storage.set('tuning', tuningSelect.value);
  storage.set('capo', capoSelect.value);
  storage.set('labelMode', labelMode);
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
labelButtons.forEach((b) => b.addEventListener('click', () => {
  labelMode = b.dataset.label;
  updateFret();
}));
tuningSelect.addEventListener('change', () => updateFret());
capoSelect.addEventListener('change', () => updateFret());

updateFret();

// ---------- マイク ----------
const micToggle = document.getElementById('mic-toggle');
const micStatus = document.getElementById('mic-status');
const micError = document.getElementById('mic-error');
const micResult = document.getElementById('mic-result');
const chromaEl = document.getElementById('chroma');
chromaEl.innerHTML = NOTE_NAMES.map((n) => `<div class="bar"><span class="fill"></span><small>${n}</small></div>`).join('');
const chromaFills = [...chromaEl.querySelectorAll('.fill')];
let listener = null;
renderResult(micResult, []);

// 一瞬だけ別のコードに見えても表示を変えないよう、同じ判定が HOLD_MS 続いたら切り替える
let shownName = null;
let pending = { name: null, since: 0 };
let wasPlaying = false;

function stopMic() {
  listener?.stop();
  listener = null;
  micToggle.textContent = 'マイクを開始';
  micToggle.classList.remove('active');
  micStatus.textContent = '';
  shownName = null;
  renderResult(micResult, []);
  chromaFills.forEach((f) => { f.style.height = '0%'; });
}

micToggle.addEventListener('click', async () => {
  if (listener) {
    stopMic();
    return;
  }
  micError.hidden = true;
  try {
    listener = await startListening(({ chroma, bass, state }) => {
      micStatus.textContent = state === 'calibrating' ? '周りの雑音を覚えています。1秒ほど弾かずに待ってください…'
        : state === 'quiet' && shownName === null ? 'ギターを弾いてください' : '';
      const max = Math.max(...chroma) || 1;
      chromaFills.forEach((f, i) => { f.style.height = `${state === 'playing' ? (chroma[i] / max) * 100 : 0}%`; });

      if (state !== 'playing') {
        if (state === 'calibrating' || shownName === null) renderResult(micResult, []);
        wasPlaying = false;
        return; // 弾き終わって静かになっても、最後のコードは表示したままにする
      }
      const candidates = identifyFromChroma(chroma, bass, 3);
      const name = candidates[0]?.name ?? null;
      const now = performance.now();
      if (name !== pending.name) pending = { name, since: now };
      // 弾き始めはすぐ表示し、鳴っている途中の切り替えだけ慎重にする
      const onset = !wasPlaying;
      wasPlaying = true;
      if (onset || name === shownName || now - pending.since >= HOLD_MS) {
        shownName = name;
        renderResult(micResult, candidates, { showConfidence: true });
      }
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

// ---------- アップデートのお知らせ ----------
const banner = document.getElementById('update-banner');
const bannerText = document.getElementById('update-text');
const bannerAction = document.getElementById('update-action');

function showBanner(text, actionLabel, onAction) {
  bannerText.textContent = text;
  bannerAction.textContent = actionLabel;
  bannerAction.onclick = onAction;
  banner.hidden = false;
}

// 更新したあと最初に開いたときだけ、変わったところを知らせる
async function announceIfUpdated() {
  const seen = storage.get('seenVersion');
  storage.set('seenVersion', APP_VERSION);
  if (!seen || seen === APP_VERSION) return; // 初めて開いたときは知らせない
  try {
    const info = await (await fetch('version.json', { cache: 'no-store' })).json();
    if (info.version !== APP_VERSION) return;
    showBanner(`バージョン ${APP_VERSION} に更新しました：${info.notes.join(' / ')}`, '閉じる', () => { banner.hidden = true; });
  } catch { /* 取得できなければ何もしない */ }
}

// 新しいバージョンが公開されていたら、更新ボタンを出す
async function checkForUpdate() {
  try {
    const info = await (await fetch('version.json', { cache: 'no-store' })).json();
    if (info.version === APP_VERSION) return;
    showBanner(`新しいバージョン ${info.version} があります`, '更新する', async () => {
      bannerAction.disabled = true;
      bannerAction.textContent = '更新中…';
      // 古いファイルがブラウザに残らないよう、取り直してから再読み込みする
      await Promise.all(APP_FILES.map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
      location.reload();
    });
  } catch { /* オフラインなどで確認できなければ何もしない */ }
}

announceIfUpdated();
checkForUpdate();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
