// 画面の切り替えと、各部品のつなぎ込み

import { NOTE_NAMES, identifyFromNotes, identifyFromChroma, midiToPitchClass, parseChordName, frequencyToMidi } from './chord-engine.js';
import { startListening, startTuner } from './audio.js';
import { TUNINGS, parseShape, formatShape, soundingNotes, renderFretboard, findVoicings } from './fretboard.js';
import { playNotes } from './sound.js';
import { parseYouTubeId, formatTime, buildChordTimeline, detectNoteEvents, assignTab, formatTab } from './song.js';

// version.json と同じ値にする（新しいバージョンを公開したら両方を上げる）
const APP_VERSION = '1.3.0';
const APP_FILES = ['index.html', 'style.css', 'app.js', 'chord-engine.js', 'audio.js', 'fretboard.js', 'sound.js', 'song.js', 'sw.js', 'manifest.webmanifest'];
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
    if (id !== 'song') stopSongListening();
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

// ---------- 曲（YouTube）から ----------
const songUrl = document.getElementById('song-url');
const songError = document.getElementById('song-error');
const songPlayerWrap = document.getElementById('song-player-wrap');
const songToggle = document.getElementById('song-toggle');
const songStatus = document.getElementById('song-status');
const songNow = document.getElementById('song-now');
const songChords = document.getElementById('song-chords');
const songTab = document.getElementById('song-tab');
const SONG_SAVE_MS = 5000;
const ONSET_LOOKBACK_MS = 150; // 曲：この時間の中で音量が
const ONSET_RATIO = 1.5;       //     これだけ大きくなったら「弾いた」とみなす
const ONSET_SETTLE_MS = 250;   //     分析する音がそろうまで待つ時間

let player = null;
let playerPlaying = false;
let videoId = null;
let songListener = null;
let songData = { chords: [], notes: [] }; // chords: [{ t, name, confidence }] / notes: [{ t, notes }]
let timeline = [];
let lastRender = 0;
let lastSave = 0;

// YouTube 公式の埋め込みプレーヤーを読み込む（1回だけ）
let youTubeApi = null;
function loadYouTubeApi() {
  youTubeApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { youTubeApi = null; reject(new Error('YouTube を読み込めませんでした')); };
    document.head.appendChild(script);
  });
  return youTubeApi;
}

const songKey = (id) => `song:${id}`;
function saveSong() {
  if (!videoId) return;
  const round = (t) => Math.round(t * 100) / 100;
  storage.set(songKey(videoId), JSON.stringify({
    chords: songData.chords.map((c) => [round(c.t), c.name, c.confidence]),
    notes: songData.notes.map((n) => (n.onset ? [round(n.t), n.notes, 1] : [round(n.t), n.notes])),
  }));
}
function loadSong(id) {
  try {
    const saved = JSON.parse(storage.get(songKey(id)) || 'null');
    if (saved) {
      return {
        chords: saved.chords.map(([t, name, confidence]) => ({ t, name, confidence })),
        notes: saved.notes.map(([t, notes, onset]) => ({ t, notes, ...(onset ? { onset: true } : {}) })),
      };
    }
  } catch { /* 壊れていたら新しく始める */ }
  return { chords: [], notes: [] };
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

function tabText() {
  const tuning = currentTuning();
  const names = tuning.strings.map((m, s) => {
    const n = NOTE_NAMES[midiToPitchClass(m)];
    return s === 5 ? n.toLowerCase() : n;
  });
  const events = detectNoteEvents(songData.notes);
  return formatTab(assignTab(events, tuning, { capo: Number(capoSelect.value) }), { stringNames: names });
}

let lastTabRender = 0;
function renderSong({ withTab = true } = {}) {
  timeline = buildChordTimeline(songData.chords);
  songChords.innerHTML = timeline.length
    ? timeline.map((seg, i) => `
      <button type="button" class="song-chord" data-index="${i}">
        <small>${formatTime(seg.start)}</small><b>${escapeHtml(seg.name)}</b><span>${voicingFor(seg.name)}</span>
      </button>`).join('')
    : '<p class="hint">解析するとここにコード進行が並びます</p>';
  if (withTab) {
    lastTabRender = performance.now();
    songTab.textContent = songData.notes.length ? tabText() : '';
  }
  highlightCurrentChord();
}

function highlightCurrentChord() {
  if (!player?.getCurrentTime) return;
  const t = player.getCurrentTime();
  const index = timeline.findIndex((seg) => t >= seg.start && t <= seg.end + 0.3);
  songChords.querySelectorAll('.song-chord').forEach((el) => el.classList.toggle('active', Number(el.dataset.index) === index));
}

songChords.addEventListener('click', (e) => {
  const button = e.target.closest('.song-chord');
  if (!button || !player?.seekTo) return;
  player.seekTo(timeline[Number(button.dataset.index)].start, true);
  player.playVideo();
});

document.getElementById('song-load').addEventListener('click', async () => {
  const id = parseYouTubeId(songUrl.value);
  songError.hidden = true;
  if (!id) {
    songError.textContent = 'YouTube のリンクが読めませんでした（例：https://youtu.be/…）';
    songError.hidden = false;
    return;
  }
  stopSongListening();
  videoId = id;
  storage.set('lastVideo', songUrl.value.trim());
  songData = loadSong(id);
  songPlayerWrap.hidden = false;
  try {
    const YT = await loadYouTubeApi();
    if (player) {
      player.cueVideoById(id);
    } else {
      player = new YT.Player('song-player', {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onStateChange: (e) => { playerPlaying = e.data === YT.PlayerState.PLAYING; },
        },
      });
    }
    songToggle.disabled = false;
    songStatus.textContent = songData.chords.length ? '前回の結果を表示しています。続きを解析することもできます。' : '「解析を開始」を押してください';
  } catch (err) {
    songError.textContent = `${err.message}。電波を確認してください。`;
    songError.hidden = false;
  }
  renderSong();
});

function stopSongListening() {
  if (!songListener) return;
  songListener.stop();
  songListener = null;
  songToggle.textContent = '🎤 解析を開始';
  songToggle.classList.remove('active');
  songStatus.textContent = '解析を止めました';
  songNow.textContent = '―';
  saveSong();
  renderSong();
}

songToggle.addEventListener('click', async () => {
  if (songListener) {
    stopSongListening();
    return;
  }
  songError.hidden = true;
  try {
    let levels = [];
    let pendingOnset = null;
    songListener = await startListening(({ chroma, bass, notes, level, state }) => {
      if (state === 'calibrating') {
        songStatus.textContent = '周りの雑音を覚えています。1秒ほど、動画を再生せずに待ってください…';
        return;
      }
      if (!playerPlaying) {
        songStatus.textContent = '準備OK。動画を再生してください（再生している間だけ記録します）';
        return;
      }
      songStatus.textContent = '解析中…';
      const t = player.getCurrentTime();
      const now = performance.now();
      if (state === 'playing') {
        const [top] = identifyFromChroma(chroma, bass, 1);
        if (top) {
          songData.chords.push({ t, name: top.name, confidence: top.confidence });
          songNow.textContent = top.name;
        }
        // 弾いた瞬間（音量が急に大きくなったところ）を見つけ、音がそろう少し後の音を「その瞬間の発音」として記録する
        levels = [...levels, { now, level }].filter((l) => now - l.now <= ONSET_LOOKBACK_MS);
        const quietest = Math.min(...levels.map((l) => l.level));
        if (!pendingOnset && level > quietest * ONSET_RATIO) pendingOnset = { t, at: now };
        const onset = pendingOnset && now - pendingOnset.at >= ONSET_SETTLE_MS;
        songData.notes.push({ t: onset ? pendingOnset.t : t, notes, ...(onset ? { onset: true } : {}) });
        if (onset) pendingOnset = null;
      }
      // コード進行は毎秒、タブ譜は計算が重めなので4秒ごとに描き直す
      if (now - lastRender > 1000) { lastRender = now; renderSong({ withTab: now - lastTabRender > 4000 }); }
      if (now - lastSave > SONG_SAVE_MS) { lastSave = now; saveSong(); }
    });
    songToggle.textContent = '解析を停止';
    songToggle.classList.add('active');
  } catch {
    songError.textContent = micErrorText();
    songError.hidden = false;
  }
});

document.getElementById('song-copy').addEventListener('click', async (e) => {
  const chords = timeline.map((seg) => `${formatTime(seg.start)} ${seg.name}`).join('\n');
  const text = `コード進行\n${chords}\n\nタブ譜\n${songTab.textContent}`;
  try {
    await navigator.clipboard.writeText(text);
    e.target.textContent = 'コピーしました';
    setTimeout(() => { e.target.textContent = 'コピー'; }, 1500);
  } catch { /* コピーできない環境では何もしない */ }
});

document.getElementById('song-clear').addEventListener('click', () => {
  if (!confirm('この曲の解析結果を消しますか？')) return;
  songData = { chords: [], notes: [] };
  if (videoId) storage.set(songKey(videoId), '');
  renderSong();
});

setInterval(() => { if (playerPlaying) highlightCurrentChord(); }, 300);
songUrl.value = storage.get('lastVideo') || '';

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
