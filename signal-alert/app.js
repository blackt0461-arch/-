'use strict';

// ===== 設定(判定基準) =====
const CONFIG = {
  intervalMs: 3000,      // 何ミリ秒ごとに測るか
  timeoutMs: 3000,       // これを超えたら「通信できない」扱い
  slowMs: 1000,          // これを超えたら「遅い」(警告の基準)
  slowCount: 3,          // 「遅い」が何回連続したら警告するか
  failCount: 2,          // 通信失敗が何回連続したら「圏外」とするか
  recoverCount: 3,       // 正常が何回連続したら「回復」とするか
  historySize: 100,      // グラフに残す測定数(3秒×100=5分)
  logMax: 200,           // 記録の最大件数
  pingUrl: 'ping.txt',
};

// 応答時間を、分かりやすい「速さ」に置き換える(アンテナ本数と、何ができるか)
// 直近3回の中央値で判定し、1回だけの揺れで表示がちらつかないようにする
const LEVELS = [
  { max: 200,      bars: 4, word: '速い',     meaning: '動画・通話も快適' },
  { max: 500,      bars: 3, word: '普通',     meaning: 'SNS・LINEは快適' },
  { max: 1000,     bars: 2, word: 'やや遅い', meaning: '読み込みに少し待つ' },
  { max: Infinity, bars: 1, word: '遅い',     meaning: '途切れやすい' },
];
const OFFLINE = { bars: 0, word: '圏外', meaning: 'つながらない' };

const LOG_KEY = 'signal-alert-log-v1';

// ===== 状態 =====
let running = false;
let timer = null;
let state = 'idle';      // idle | good | slow | bad(警告・背景色に使う)
let slowStreak = 0, failStreak = 0, goodStreak = 0;
let badSince = null;
let history = [];        // {ms: number|null}
let audioCtx = null;
let wakeLock = null;

const $ = (id) => document.getElementById(id);
const els = {
  body: document.body, bars: $('bars'), speed: $('speed'), meaning: $('meaning'),
  latency: $('latency'), toggle: $('toggle'), chart: $('chart'),
  log: $('log'), clear: $('clear-log'),
};

// ===== 音(Web Audio) =====
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
}
function beep(freq, start, dur, vol = 0.4) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.setValueAtTime(vol, t + dur - 0.02);
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function playAlarm() { for (let i = 0; i < 3; i++) beep(1200, i * 0.3, 0.18); }
function playRecover() { beep(660, 0, 0.15, 0.3); beep(990, 0.18, 0.25, 0.3); }

// ===== 画面を点けたままにする(使えない環境では何もしない) =====
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {}
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// ===== 測定 =====
async function measure() {
  if (!navigator.onLine) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${CONFIG.pingUrl}?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    await res.text();
    if (!res.ok) return null;
    return Math.round(performance.now() - t0);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(to);
  }
}

// 測定ループは常に1本だけ。再開・停止のたびに世代番号を進め、古いループは結果を捨てて終わる
let loopId = 0;
function restartLoop() {
  clearTimeout(timer);
  const id = ++loopId;
  tick(id);
}
async function tick(id) {
  if (!running || id !== loopId) return;
  const ms = await measure();
  if (!running || id !== loopId) return;
  handleResult(ms);
  timer = setTimeout(() => tick(id), CONFIG.intervalMs);
}

function handleResult(ms) {
  history.push({ ms });
  if (history.length > CONFIG.historySize) history.shift();

  if (ms === null) { failStreak++; slowStreak = 0; goodStreak = 0; }
  else if (ms > CONFIG.slowMs) { slowStreak++; failStreak = 0; goodStreak = 0; }
  else { goodStreak++; slowStreak = 0; failStreak = 0; }

  let next = state;
  if (failStreak >= CONFIG.failCount) next = 'bad';
  else if (slowStreak >= CONFIG.slowCount) next = 'slow';
  else if (state === 'idle' && ms !== null && ms <= CONFIG.slowMs) next = 'good';
  else if ((state === 'slow' || state === 'bad') && goodStreak >= CONFIG.recoverCount) next = 'good';

  setState(next);
  render();
  if (window.SignalMap) window.SignalMap.onSample(ms);
}

function setState(next) {
  if (next === state) return;
  const prev = state;
  state = next;
  els.body.className = `state-${next}`;

  const wasBad = prev === 'slow' || prev === 'bad';
  const isBad = next === 'slow' || next === 'bad';
  if (isBad && !wasBad) { badSince = new Date(); playAlarm(); }
  else if (next === 'bad' && prev === 'slow') playAlarm();
  else if (!isBad && wasBad && next === 'good') {
    playRecover();
    addLog(badSince, new Date(), prev);
    badSince = null;
  }
}

// ===== 表示 =====
function currentLevel() {
  const recent = history.slice(-3).map((p) => p.ms);
  if (!recent.length) return null;
  if (state === 'bad') return OFFLINE;
  const vals = recent.filter((v) => v !== null).sort((a, b) => a - b);
  if (!vals.length) return OFFLINE;
  const median = vals[Math.floor(vals.length / 2)];
  return LEVELS.find((l) => median <= l.max);
}

function render() {
  const lv = currentLevel();
  const last = history.length ? history[history.length - 1].ms : undefined;
  if (!lv) {
    els.bars.className = 'lv-0';
    els.speed.textContent = '測定中';
    els.meaning.textContent = '';
    els.latency.textContent = '';
  } else {
    els.bars.className = `lv-${lv.bars}`;
    els.speed.textContent = lv.word;
    els.meaning.textContent = lv.meaning;
    els.latency.textContent = last === null ? '' : `応答 ${last} ms`;
  }
  drawChart();
}

function drawChart() {
  const c = els.chart;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = 160;
  if (!w) return;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const maxMs = 1500, left = 58;
  const plotW = w - left;
  // 4つの帯を同じ高さにする(速い側が潰れて見えないように)
  const edges = [0, 200, 500, 1000, maxMs];
  const y = (ms) => {
    const v = Math.min(Math.max(ms, 0), maxMs);
    let i = 0;
    while (i < 3 && v > edges[i + 1]) i++;
    const f = i + (v - edges[i]) / (edges[i + 1] - edges[i]);
    return h - 2 - (f / 4) * (h - 4);
  };

  // 速さの帯(上ほど遅い)と、その名前
  const bands = [
    { from: 0, to: 200, name: '速い', a: .10 },
    { from: 200, to: 500, name: '普通', a: .16 },
    { from: 500, to: 1000, name: 'やや遅い', a: .24 },
    { from: 1000, to: maxMs, name: '遅い', a: .34 },
  ];
  g.font = '12px -apple-system, sans-serif';
  g.textBaseline = 'middle';
  for (const b of bands) {
    g.fillStyle = `rgba(0,0,0,${b.a})`;
    g.fillRect(left, y(b.to), plotW, y(b.from) - y(b.to));
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText(b.name, 0, (y(b.from) + y(b.to)) / 2);
  }

  const step = plotW / (CONFIG.historySize - 1);
  const offset = CONFIG.historySize - history.length;

  // 圏外だった時間は赤い縦帯
  g.fillStyle = 'rgba(239,68,68,.9)';
  history.forEach((p, i) => {
    if (p.ms === null) g.fillRect(left + (offset + i) * step - step / 2, 0, Math.max(step, 3), h);
  });

  // 折れ線
  g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.lineJoin = 'round'; g.beginPath();
  let drawing = false;
  history.forEach((p, i) => {
    const x = left + (offset + i) * step;
    if (p.ms === null) { drawing = false; return; }
    if (!drawing) { g.moveTo(x, y(p.ms)); drawing = true; } else g.lineTo(x, y(p.ms));
  });
  g.stroke();

  // 最新の点
  const last = history[history.length - 1];
  if (last && last.ms !== null) {
    g.fillStyle = '#fff'; g.beginPath();
    g.arc(left + (CONFIG.historySize - 1) * step - 3, y(last.ms), 4.5, 0, Math.PI * 2); g.fill();
  }

  g.fillStyle = 'rgba(255,255,255,.6)'; g.textAlign = 'right';
  g.fillText('5分前', left + 34, h - 8); g.fillText('今', w - 2, h - 8);
  g.textAlign = 'left';
}

// ===== 記録 =====
function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { return []; }
}
function saveLog(list) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(list)); } catch (e) {}
}
function addLog(start, end, kind) {
  if (!start) return;
  const list = loadLog();
  list.unshift({ start: start.getTime(), end: end.getTime(), kind });
  saveLog(list.slice(0, CONFIG.logMax));
  renderLog();
}
const pad = (n) => String(n).padStart(2, '0');
function fmt(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dur(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ''}`;
}
function renderLog() {
  const list = loadLog();
  els.log.innerHTML = '';
  els.clear.hidden = !list.length;
  if (!list.length) {
    els.log.innerHTML = '<li class="empty">記録なし</li>';
    return;
  }
  for (const e of list) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = fmt(e.start);
    const right = document.createElement('span');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = e.kind === 'bad' ? '圏外' : '遅い';
    right.append(tag, ` ${dur(e.end - e.start)}`);
    li.append(left, right);
    els.log.appendChild(li);
  }
}

// ===== タブ =====
document.querySelectorAll('#tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === btn));
    for (const name of ['graph', 'map', 'log']) $(`tab-${name}`).hidden = btn.dataset.tab !== name;
    if (btn.dataset.tab === 'graph') drawChart();
    if (btn.dataset.tab === 'map' && window.SignalMap) window.SignalMap.draw();
  });
});

// ===== 開始・停止 =====
function start() {
  initAudio();
  running = true;
  slowStreak = failStreak = goodStreak = 0;
  history = [];
  state = 'idle';
  els.body.className = 'state-idle';
  els.toggle.textContent = '停止';
  els.toggle.classList.add('stop');
  render();
  requestWakeLock();
  restartLoop();
}
function stop() {
  running = false;
  loopId++;
  clearTimeout(timer);
  if (badSince) { addLog(badSince, new Date(), state); badSince = null; }
  state = 'idle';
  els.body.className = 'state-idle';
  els.bars.className = 'lv-0';
  els.speed.textContent = '--';
  els.meaning.textContent = '開始を押すと測定します';
  els.latency.textContent = '';
  els.toggle.textContent = '開始';
  els.toggle.classList.remove('stop');
  releaseWakeLock();
}

els.toggle.addEventListener('click', () => (running ? stop() : start()));
els.clear.addEventListener('click', () => { saveLog([]); renderLog(); });

// 他のアプリに切り替えると止まるので、戻ってきたら測り直す
document.addEventListener('visibilitychange', () => {
  if (!running) return;
  if (document.visibilityState === 'visible') {
    initAudio();
    requestWakeLock();
    slowStreak = failStreak = goodStreak = 0;
    restartLoop();
  } else {
    loopId++;
    clearTimeout(timer);
  }
});

// 通信が完全に切れたことをiPhoneが知らせてきたら、すぐ反映する
window.addEventListener('offline', () => {
  if (!running) return;
  failStreak = CONFIG.failCount - 1;
  handleResult(null);
});

window.addEventListener('resize', drawChart);
// iPhoneは他アプリから戻ると音が止まったままのことがある。画面に触れたら音を復帰させる
document.addEventListener('touchstart', () => { if (running) initAudio(); }, { passive: true });

try {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
} catch (e) { /* プレビュー環境などでは使えないので無視 */ }

renderLog();
drawChart();
