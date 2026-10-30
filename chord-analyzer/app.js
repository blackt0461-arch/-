// 画面の切り替えと、各部品のつなぎ込み

import { NOTE_NAMES, identifyFromNotes, identifyFromChroma, midiToPitchClass, parseChordName, frequencyToMidi } from './chord-engine.js';
import { startListening, startTuner } from './audio.js';
import { TUNINGS, parseShape, formatShape, soundingNotes, renderFretboard, findVoicings } from './fretboard.js';
import { playNotes } from './sound.js';
import { formatTime, assignTab, formatTab } from './song.js';

// version.json と同じ値にする（新しいバージョンを公開したら両方を上げる）
const APP_VERSION = '1.4.0';
const APP_FILES = ['index.html', 'style.css', 'app.js', 'chord-engine.js', 'audio.js', 'fretboard.js', 'sound.js', 'song.js', 'dsp.js', 'transcribe.js', 'transcribe-worker.js', 'sw.js', 'manifest.webmanifest'];
const HOLD_MS = 150;      // マイク：別のコードがこの時間続いたら表示を切り替える
const HISTORY_SIZE = 16;  // マイク：覚えておくコードの数
const HISTORY_STABLE_MS = 400; // マイク：この時間続いたコードを履歴に入れる
const HISTORY_MIN_NOTE_MS = 250; // マイク：これより短い音は履歴に入れない
const SETTLE_MS = 500;           // マイク：弾き始めてからこの時間は判定を自由に更新する

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 保存できなくても動作は続ける */ } },
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- タブ ----------
const tabs = ['fret', 'mic', 'song', 'tuner'].map((id) => ({
  id,
  tab: document.getElementById(`tab-${id}`),
  panel: document.getElementById(`panel-${id}`),
}));
tabs.forEach(({ id, tab }) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      t.tab.setAttribute('aria-selected', String(t.id === id));
      t.panel.hidden = t.id !== id;
    });
    // 別のタブに移ったらマイクを止める（電池の節約。マイクとチューナーは同時に使えない）
    if (id !== 'mic') stopMic();
    if (id !== 'song') pauseSongMedia();
    if (id !== 'tuner') stopTuner();
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
      <div class="chord-name">${top.approx ? '<small class="approx">近い形</small>' : ''}${top.name}</div>
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
const leftyInput = document.getElementById('lefty');
const searchInput = document.getElementById('chord-search');
const searchResults = document.getElementById('search-results');
// タブレットなどの横長の画面では、指板を横向き（タブ譜と同じ向き）にする
const wideQuery = window.matchMedia('(orientation: landscape) and (min-width: 700px)');

tuningSelect.innerHTML = TUNINGS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
capoSelect.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? 'カポなし' : `カポ${i}`}</option>`).join('');

let frets = parseShape(storage.get('shape') || '') || [null, 3, 2, 0, 1, 0];
let labelMode = storage.get('labelMode') === 'degree' ? 'degree' : 'note';
if (TUNINGS.some((t) => t.id === storage.get('tuning'))) tuningSelect.value = storage.get('tuning');
capoSelect.value = storage.get('capo') || '0';
leftyInput.checked = storage.get('lefty') === '1';

const currentTuning = () => TUNINGS.find((t) => t.id === tuningSelect.value);

function updateFret({ fromInput = false } = {}) {
  const tuning = currentTuning();
  const capo = Number(capoSelect.value);
  const notes = soundingNotes(frets, tuning, capo);
  const bass = notes.length ? midiToPitchClass(Math.min(...notes)) : null;
  const candidates = identifyFromNotes(notes.map(midiToPitchClass), bass, 4);
  const emptyText = new Set(notes.map(midiToPitchClass)).size < 2 ? '―' : '該当なし';
  renderResult(fretResult, candidates, { emptyText });

  // 丸の中の表示：音名（コードに合わせた書き方）、または度数
  const top = candidates[0];
  const labelFor = (s) => {
    if (frets[s] === null) return '';
    const pc = midiToPitchClass(tuning.strings[s] + capo + frets[s]);
    const i = top ? top.pcs.indexOf(pc) : -1;
    if (i < 0) return NOTE_NAMES[pc];
    return labelMode === 'note' ? top.notes[i] : top.degrees[i];
  };
  renderFretboard(fretboardEl, frets, (next) => {
    frets = next;
    shapeError.hidden = true;
    updateFret();
  }, { labelFor, horizontal: wideQuery.matches, lefty: leftyInput.checked });

  labelButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.label === labelMode)));
  if (!fromInput) shapeInput.value = formatShape(frets);
  storage.set('shape', formatShape(frets));
  storage.set('tuning', tuningSelect.value);
  storage.set('capo', capoSelect.value);
  storage.set('labelMode', labelMode);
  storage.set('lefty', leftyInput.checked ? '1' : '0');
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
document.getElementById('play-shape').addEventListener('click', () => {
  playNotes(soundingNotes(frets, currentTuning(), Number(capoSelect.value)));
});
labelButtons.forEach((b) => b.addEventListener('click', () => {
  labelMode = b.dataset.label;
  updateFret();
}));
tuningSelect.addEventListener('change', () => { updateFret(); updateSearch(); });
capoSelect.addEventListener('change', () => { updateFret(); updateSearch(); });
leftyInput.addEventListener('change', () => updateFret());
wideQuery.addEventListener('change', () => updateFret());

// コード名から押さえ方を探す
function updateSearch() {
  const text = searchInput.value.trim();
  if (!text) {
    searchResults.innerHTML = '';
    return;
  }
  const parsed = parseChordName(text);
  if (!parsed) {
    searchResults.innerHTML = '<p class="hint">コード名が読めませんでした（例：C、Am7、F#m7-5、D/F#）</p>';
    return;
  }
  const voicings = findVoicings(parsed.root, parsed.type, parsed.bass, currentTuning(), { capo: Number(capoSelect.value) });
  if (!voicings.length) {
    searchResults.innerHTML = '<p class="hint">押さえ方が見つかりませんでした</p>';
    return;
  }
  searchResults.innerHTML = voicings.map((v) => {
    const fretted = v.filter((f) => f !== null && f > 0);
    const position = fretted.length ? `${Math.min(...fretted)}フレット〜` : '開放弦';
    return `<button type="button" class="voicing" data-shape="${formatShape(v)}"><b>${formatShape(v)}</b><small>${position}</small></button>`;
  }).join('');
}
searchInput.addEventListener('input', updateSearch);
searchResults.addEventListener('click', (e) => {
  const button = e.target.closest('.voicing');
  if (!button) return;
  frets = parseShape(button.dataset.shape);
  shapeError.hidden = true;
  updateFret();
  playNotes(soundingNotes(frets, currentTuning(), Number(capoSelect.value)));
  fretResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

updateFret();

// ---------- マイク ----------
const micToggle = document.getElementById('mic-toggle');
const micStatus = document.getElementById('mic-status');
const micError = document.getElementById('mic-error');
const micResult = document.getElementById('mic-result');
const chromaEl = document.getElementById('chroma');
const historyEl = document.getElementById('history');
chromaEl.innerHTML = NOTE_NAMES.map((n) => `<div class="bar"><span class="fill"></span><small>${n}</small></div>`).join('');
const chromaFills = [...chromaEl.querySelectorAll('.fill')];
let listener = null;
renderResult(micResult, []);

// 一瞬だけ別のコードに見えても表示を変えないよう、同じ判定が HOLD_MS 続いたら切り替える
let shownName = null;
let pending = { name: null, since: 0 };
let wasPlaying = false;
let shownSince = 0;
let noteStart = 0;

// 判定したコードの履歴（新しいものが右）
let history = [];
try { history = JSON.parse(storage.get('history') || '[]').slice(-HISTORY_SIZE); } catch { history = []; }
function renderHistory() {
  historyEl.innerHTML = history.length
    ? history.map((name) => `<span class="history-chord">${escapeHtml(name)}</span>`).join('<span class="arrow">→</span>')
    : '<span class="hint">弾いたコードがここに並びます</span>';
  historyEl.scrollLeft = historyEl.scrollWidth;
}
function addHistory(name) {
  if (history[history.length - 1] === name) return;
  history = [...history, name].slice(-HISTORY_SIZE);
  storage.set('history', JSON.stringify(history));
  renderHistory();
}
document.getElementById('clear-history').addEventListener('click', () => {
  history = [];
  storage.set('history', '[]');
  renderHistory();
});
renderHistory();

function micErrorText() {
  return location.protocol === 'https:' || location.hostname === 'localhost'
    ? 'マイクを使えませんでした。ブラウザの設定でマイクを許可してください。'
    : 'マイクは https:// のページでのみ使えます。';
}

function stopMic() {
  if (!listener) return;
  listener.stop();
  listener = null;
  micToggle.textContent = 'マイクを開始';
  micToggle.classList.remove('active');
  micStatus.textContent = '';
  shownName = null;
  wasPlaying = false;
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

      const now = performance.now();
      if (state !== 'playing') {
        if (state === 'calibrating' || shownName === null) renderResult(micResult, []);
        // 鳴り終わったとき：最後に表示していたコードを履歴に入れる（ごく短い音は除く）
        if (wasPlaying && shownName && now - noteStart >= HISTORY_MIN_NOTE_MS) addHistory(shownName);
        wasPlaying = false;
        return; // 弾き終わって静かになっても、最後のコードは表示したままにする
      }
      if (!wasPlaying) noteStart = now;
      wasPlaying = true;
      const candidates = identifyFromChroma(chroma, bass, 3);
      const name = candidates[0]?.name ?? null;
      if (name !== pending.name) pending = { name, since: now };
      // 弾き始めは分析する音がそろっていく途中なので自由に更新し、
      // 鳴り続けている間の切り替えだけ慎重にする（一瞬の誤判定でチラつかないように）
      const settling = now - noteStart < SETTLE_MS;
      if (settling || name === shownName || now - pending.since >= HOLD_MS) {
        if (name !== shownName) shownSince = now;
        shownName = name;
        renderResult(micResult, candidates, { showConfidence: true });
      }
      // 長く鳴らしている間にコードを変えたときのために、しばらく同じだったコードも履歴に入れる
      if (!settling && shownName && now - shownSince >= HISTORY_STABLE_MS) addHistory(shownName);
    });
    micToggle.textContent = 'マイクを停止';
    micToggle.classList.add('active');
  } catch {
    micError.textContent = micErrorText();
    micError.hidden = false;
  }
});

// ---------- 曲（録画・音声ファイル）から ----------
const songFile = document.getElementById('song-file');
const songMode = document.getElementById('song-mode');
const songError = document.getElementById('song-error');
const songProgress = document.getElementById('song-progress');
const songProgressFill = document.getElementById('song-progress-fill');
const songProgressLabel = document.getElementById('song-progress-label');
const songResult = document.getElementById('song-result');
const songMedia = document.getElementById('song-media');
const songNow = document.getElementById('song-now');
const songInfo = document.getElementById('song-info');
const songChords = document.getElementById('song-chords');
const songTab = document.getElementById('song-tab');
const TAB_PER_LINE = 12;

let analysis = null; // { timeline, tabBlocks: [{ t, text }] }
let worker = null;

function showSongError(message) {
  songError.textContent = message;
  songError.hidden = !message;
}

// 録画（動画）からも音声だけを取り出して、左右のチャンネルの波形にする
async function decodeFile(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const data = await file.arrayBuffer();
    const buffer = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p?.then) p.then(resolve, reject);
    });
    const channels = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(new Float32Array(buffer.getChannelData(c)));
    return { channels, sampleRate: buffer.sampleRate, duration: buffer.duration };
  } finally {
    ctx.close?.();
  }
}

function runTranscription(channels, sampleRate, mode) {
  worker?.terminate();
  worker = new Worker('transcribe-worker.js', { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        songProgressFill.style.width = `${Math.round(msg.progress * 100)}%`;
        songProgressLabel.textContent = `${msg.label}…（${Math.round(msg.progress * 100)}%）`;
      } else if (msg.type === 'done') {
        resolve(msg.result);
      } else {
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => reject(new Error(e.message || '解析中にエラーが起きました'));
    worker.postMessage({ channels, sampleRate, mode }, channels.map((c) => c.buffer));
  });
}

function buildTabBlocks(events) {
  const tuning = currentTuning();
  const names = tuning.strings.map((m, s) => {
    const n = NOTE_NAMES[midiToPitchClass(m)];
    return s === 5 ? n.toLowerCase() : n;
  });
  const placed = assignTab(events, tuning, { capo: Number(capoSelect.value) });
  const blocks = [];
  for (let i = 0; i < placed.length; i += TAB_PER_LINE) {
    const chunk = placed.slice(i, i + TAB_PER_LINE);
    blocks.push({ t: chunk[0].t, end: chunk[chunk.length - 1].t, text: formatTab(chunk, { perLine: TAB_PER_LINE, stringNames: names }) });
  }
  return blocks;
}

function renderAnalysis() {
  const { timeline, tabBlocks } = analysis;
  songChords.innerHTML = timeline.length
    ? timeline.map((seg, i) => `
      <button type="button" class="song-chord" data-index="${i}">
        <small>${formatTime(seg.start)}</small><b>${escapeHtml(seg.name)}</b><span>${voicingFor(seg.name)}</span>
      </button>`).join('')
    : '<p class="hint">コードが見つかりませんでした</p>';
  songTab.innerHTML = tabBlocks.length
    ? tabBlocks.map((b, i) => `<pre class="tab-block" data-index="${i}">${escapeHtml(b.text)}</pre>`).join('')
    : '<p class="hint">ギターの音が見つかりませんでした</p>';
}

const voicingCache = new Map();
function voicingFor(name) {
  const key = `${name}|${tuningSelect.value}|${capoSelect.value}`;
  if (!voicingCache.has(key)) {
    const parsed = parseChordName(name);
    const v = parsed && findVoicings(parsed.root, parsed.type, parsed.bass, currentTuning(), { capo: Number(capoSelect.value), limit: 1 })[0];
    voicingCache.set(key, v ? formatShape(v) : '');
  }
  return voicingCache.get(key);
}

// 再生に合わせて、今のコードとタブ譜の段を光らせる
function highlightNow() {
  if (!analysis) return;
  const t = songMedia.currentTime;
  const index = analysis.timeline.findIndex((seg) => t >= seg.start && t <= seg.end + 0.3);
  songNow.textContent = index >= 0 ? analysis.timeline[index].name : '―';
  songChords.querySelectorAll('.song-chord').forEach((el) => el.classList.toggle('active', Number(el.dataset.index) === index));
  const blockIndex = analysis.tabBlocks.findLastIndex((b) => t >= b.t - 0.1);
  songTab.querySelectorAll('.tab-block').forEach((el) => el.classList.toggle('active', Number(el.dataset.index) === blockIndex));
}
songMedia.addEventListener('timeupdate', highlightNow);
songMedia.addEventListener('seeked', highlightNow);

function playFrom(t) {
  songMedia.currentTime = Math.max(0, t - 0.2);
  songMedia.play().catch(() => {});
}
songChords.addEventListener('click', (e) => {
  const button = e.target.closest('.song-chord');
  if (button) playFrom(analysis.timeline[Number(button.dataset.index)].start);
});
songTab.addEventListener('click', (e) => {
  const block = e.target.closest('.tab-block');
  if (block) playFrom(analysis.tabBlocks[Number(block.dataset.index)].t);
});

songFile.addEventListener('change', async () => {
  const file = songFile.files[0];
  if (!file) return;
  showSongError('');
  songResult.hidden = true;
  songProgress.hidden = false;
  songProgressFill.style.width = '0%';
  songProgressLabel.textContent = 'ファイルから音を取り出しています…';
  if (songMedia.src) URL.revokeObjectURL(songMedia.src);
  songMedia.src = URL.createObjectURL(file);
  try {
    const { channels, sampleRate, duration } = await decodeFile(file);
    const result = await runTranscription(channels, sampleRate, songMode.value);
    analysis = { timeline: result.timeline, tabBlocks: buildTabBlocks(result.events) };
    songInfo.textContent = `${file.name}（${formatTime(duration)}）・${result.useSide ? '歌を弱めて解析しました' : '左右を混ぜた音で解析しました'}`;
    renderAnalysis();
    songResult.hidden = false;
    highlightNow();
  } catch (err) {
    showSongError(err?.name === 'EncodingError' || /decode/i.test(err?.message || '')
      ? 'このファイルから音を取り出せませんでした。画面収録の動画か、音声ファイル（m4a・mp3 など）を選んでください。'
      : `解析できませんでした：${err?.message || err}`);
  } finally {
    songProgress.hidden = true;
    songFile.value = '';
  }
});

document.getElementById('song-copy').addEventListener('click', async (e) => {
  if (!analysis) return;
  const chords = analysis.timeline.map((seg) => `${formatTime(seg.start)} ${seg.name}`).join('\n');
  const text = `コード進行\n${chords}\n\nタブ譜\n${analysis.tabBlocks.map((b) => b.text).join('\n\n')}`;
  try {
    await navigator.clipboard.writeText(text);
    e.target.textContent = 'コピーしました';
    setTimeout(() => { e.target.textContent = 'コピー'; }, 1500);
  } catch { /* コピーできない環境では何もしない */ }
});

function pauseSongMedia() {
  songMedia.pause();
}

// ---------- チューナー ----------
const tunerToggle = document.getElementById('tuner-toggle');
const tunerError = document.getElementById('tuner-error');
const tunerNote = document.getElementById('tuner-note');
const tunerCents = document.getElementById('tuner-cents');
const tunerNeedle = document.getElementById('tuner-needle');
const tunerFreq = document.getElementById('tuner-freq');
const tunerStrings = document.getElementById('tuner-strings');
const IN_TUNE_CENTS = 5;
let tuner = null;
let recentFreqs = [];

function renderTunerStrings(activeString = -1) {
  const tuning = currentTuning();
  tunerStrings.innerHTML = tuning.strings.map((m, s) => `
    <span class="tuner-string${s === activeString ? ' active' : ''}"><small>${6 - s}弦</small>${NOTE_NAMES[midiToPitchClass(m)]}</span>`).join('');
}

function resetTuner() {
  tunerNote.textContent = '―';
  tunerCents.textContent = '';
  tunerFreq.textContent = '';
  tunerNeedle.style.setProperty('--cents', 0);
  tunerNeedle.parentElement.classList.remove('in-tune');
  renderTunerStrings();
}

function stopTuner() {
  if (!tuner) return;
  tuner.stop();
  tuner = null;
  tunerToggle.textContent = 'チューナーを開始';
  tunerToggle.classList.remove('active');
  resetTuner();
}

tunerToggle.addEventListener('click', async () => {
  if (tuner) {
    stopTuner();
    return;
  }
  tunerError.hidden = true;
  try {
    tuner = await startTuner(({ freq }) => {
      if (!freq) {
        recentFreqs = [];
        return; // 鳴り終わっても最後の表示を残す
      }
      // 直近の値の中央値で、針のふらつきを抑える
      recentFreqs = [...recentFreqs, freq].slice(-5);
      const f = [...recentFreqs].sort((a, b) => a - b)[Math.floor(recentFreqs.length / 2)];
      const midi = frequencyToMidi(f);
      const nearest = Math.round(midi);
      const cents = Math.round((midi - nearest) * 100);
      tunerNote.textContent = NOTE_NAMES[midiToPitchClass(nearest)];
      tunerCents.textContent = cents === 0 ? '±0' : `${cents > 0 ? '+' : ''}${cents}`;
      tunerFreq.textContent = `${f.toFixed(1)} Hz`;
      tunerNeedle.style.setProperty('--cents', Math.max(-50, Math.min(50, cents)));
      tunerNeedle.parentElement.classList.toggle('in-tune', Math.abs(cents) <= IN_TUNE_CENTS);
      // いちばん近い開放弦を光らせる
      const strings = currentTuning().strings;
      const closest = strings.reduce((best, m, s) => (Math.abs(m - midi) < Math.abs(strings[best] - midi) ? s : best), 0);
      renderTunerStrings(Math.abs(strings[closest] - midi) < 1 ? closest : -1);
    });
    tunerToggle.textContent = 'チューナーを停止';
    tunerToggle.classList.add('active');
  } catch {
    tunerError.textContent = micErrorText();
    tunerError.hidden = false;
  }
});
resetTuner();

// ---------- アップデートのお知らせ ----------
const banner = document.getElementById('update-banner');
const bannerText = document.getElementById('update-text');
const bannerAction = document.getElementById('update-action');

function showBanner(text, actionLabel, onAction) {
  bannerText.textContent = text;
  bannerAction.textContent = actionLabel;
  bannerAction.disabled = false;
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

// ---------- ホーム画面のアプリとして、電波が無くても開けるようにする ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
