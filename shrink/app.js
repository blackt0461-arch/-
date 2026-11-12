// 動画かるく：Claude に渡す動画・画像を、この機械の中だけで軽くする。
// まとめ画像は video と canvas だけで作る。「動画のまま軽く」だけ Mediabunny（MPL-2.0）を使う。
const MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/dist/bundles/mediabunny.min.mjs';

// Claude の画像の上限（https://platform.claude.com/docs/en/build-with-claude/vision 2026-11-12 確認）
// 新しいモデルは長い辺 2,576px・4,784 トークン（28px 四方で1トークン）まで。これを超えると Claude 側で縮められる。
const MAX_EDGE = 2576;
const MAX_TOKENS = 4700; // 少し余裕をもたせる
const JPEG_Q = 0.85;

const $ = (id) => document.getElementById(id);
const state = {
  tab: 'sheet', files: [], kind: null, url: null, duration: 0, vw: 0, vh: 0,
  start: 0, end: null, opts: { pick: 'auto', count: 'auto', per: '9', q: 'm' },
  outputs: [], busy: false,
};

// ---------- 小さな道具 ----------
const mb = (n) => (n / 1048576 < 0.1 ? (n / 1024).toFixed(0) + 'KB' : (n / 1048576).toFixed(1) + 'MB');
function fmtTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 1800); }
function setProgress(p, text) { $('progress').hidden = false; $('barFill').style.width = Math.round(p * 100) + '%'; $('progText').textContent = text; }
function showErr(msg) { $('err').hidden = !msg; $('err').textContent = msg || ''; }
function baseName() { const n = state.files[0]?.name || 'file'; return n.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'file'; }
const canvasToBlob = (c, type = 'image/jpeg', q = JPEG_Q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), type, q));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 長い辺とトークンの上限に収まる倍率
function fitScale(w, h) {
  let s = Math.min(1, MAX_EDGE / Math.max(w, h));
  while (Math.ceil((w * s) / 28) * Math.ceil((h * s) / 28) > MAX_TOKENS) s *= 0.98;
  return s;
}

// ---------- タブと設定 ----------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  if (state.busy) return;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  state.tab = b.dataset.tab;
  updateUI();
  clearResult();
}));
document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  state.opts[seg.dataset.key] = b.dataset.v;
  $('evenOpt').hidden = state.opts.pick !== 'even';
}));

function updateUI() {
  const video = state.tab === 'video';
  $('dropTitle').textContent = state.files.length ? '別のファイルを選ぶ' : video ? '動画を選ぶ' : '動画か画像を選ぶ';
  $('dropSub').textContent = video ? '画質を下げ、音を消して、動画のまま軽くします' : '選ぶと自動で、大事な場面を数枚のまとめ画像にします';
  $('file').accept = video ? 'video/*' : 'video/*,image/*';
  const isVideo = state.kind === 'video';
  $('moreSheet').hidden = video || !isVideo;
  $('moreVideo').hidden = !video;
  $('moreRange').hidden = !isVideo;
  $('preview').hidden = !isVideo;
  $('run').textContent = video ? '軽くする' : (state.files.length && !isVideo ? '軽くする' : 'まとめ画像を作る');
}

// ---------- ファイルを選ぶ ----------
const drop = $('drop');
$('file').addEventListener('change', (e) => { if (e.target.files.length) loadFiles([...e.target.files]); e.target.value = ''; });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });

const work = document.createElement('video'); // 場面を取り出す用（画面には出さない）
work.muted = true; work.playsInline = true; work.preload = 'auto';
work.setAttribute('playsinline', ''); work.setAttribute('muted', '');

function isVideoFile(f) { return f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(f.name); }

async function loadFiles(files) {
  if (state.busy) return;
  clearResult(); showErr('');
  const vid = files.find(isVideoFile);
  if (state.tab === 'video' && !vid) { showErr('動画を選んでください。'); return; }
  if (state.url) URL.revokeObjectURL(state.url);
  drop.classList.add('compact'); $('dropTitle').textContent = '別のファイルを選ぶ';
  state.url = null; state.start = 0; state.end = null;
  if (vid) {
    state.files = [vid]; state.kind = 'video';
    state.url = URL.createObjectURL(vid);
    $('preview').src = state.url;
    $('filePanel').hidden = false;
    $('fname').textContent = vid.name; $('fmeta').textContent = mb(vid.size) + ' ・ 読み込み中…';
    updateUI();
    try {
      await openWork();
    } catch (e) {
      $('fmeta').textContent = mb(vid.size);
      showErr('この動画はこのブラウザで開けませんでした。\n別のブラウザ（iPhone なら Safari、パソコンなら Edge や Safari）でためしてください。');
      return;
    }
    $('fmeta').textContent = `${mb(vid.size)} ・ ${fmtTime(state.duration)} ・ ${state.vw}×${state.vh}`;
    showRange();
    if (state.tab === 'sheet') run(); // おまかせ：選んだらすぐ作る
  } else {
    const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
    if (!imgs.length) { showErr('動画か画像を選んでください。'); return; }
    state.files = imgs; state.kind = 'image';
    $('filePanel').hidden = false;
    $('fname').textContent = imgs.length > 1 ? `画像 ${imgs.length} 枚` : imgs[0].name;
    $('fmeta').textContent = mb(imgs.reduce((a, f) => a + f.size, 0));
    $('preview').removeAttribute('src');
    updateUI();
    run();
  }
}

function openWork() {
  return new Promise((resolve, reject) => {
    const done = async () => {
      work.removeEventListener('error', fail);
      state.vw = work.videoWidth; state.vh = work.videoHeight;
      let d = work.duration;
      if (!isFinite(d)) { // 長さが入っていない動画（録画したものなど）
        work.currentTime = 1e9; await once(work, 'seeked', 4000).catch(() => {}); d = work.duration;
        if (!isFinite(d)) d = work.currentTime || 0;
      }
      state.duration = d;
      if (!state.vw || !d) return reject(new Error('meta'));
      resolve();
    };
    const fail = () => reject(new Error('load'));
    work.addEventListener('loadedmetadata', done, { once: true });
    work.addEventListener('error', fail, { once: true });
    work.src = state.url;
    work.load();
  });
}
function once(el, ev, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error('timeout')); }, ms);
    const h = () => { clearTimeout(t); res(); };
    el.addEventListener(ev, h, { once: true });
  });
}

// ---------- 使う範囲 ----------
function rangeEnd() { return state.end ?? state.duration; }
function showRange() { $('startVal').textContent = fmtTime(state.start); $('endVal').textContent = fmtTime(rangeEnd()); }
$('setStart').addEventListener('click', () => { const t = $('preview').currentTime; if (t >= rangeEnd() - 0.5) return toast('終わりより前にしてください'); state.start = t; showRange(); });
$('setEnd').addEventListener('click', () => { const t = $('preview').currentTime; if (t <= state.start + 0.5) return toast('始めより後にしてください'); state.end = t; showRange(); });
$('resetRange').addEventListener('click', () => { state.start = 0; state.end = null; showRange(); });

// ---------- 作る ----------
$('run').addEventListener('click', () => run());
async function run() {
  if (state.busy || !state.files.length) return;
  state.busy = true; $('run').disabled = true; showErr(''); clearResult();
  try {
    if (state.kind === 'image') await makeImages();
    else if (state.tab === 'video') await makeVideo();
    else await makeSheets();
  } catch (e) {
    console.error(e);
    showErr(e.userMsg || 'うまく作れませんでした。もう一度ためすか、範囲を短くしてみてください。\n（' + (e.message || e) + '）');
  } finally {
    state.busy = false; $('run').disabled = false; $('progress').hidden = true;
  }
}

// 指定の時間に動かして、その場面が描けるまで待つ
async function seekTo(t) {
  t = Math.min(Math.max(0, t), Math.max(0, state.duration - 0.05));
  if (Math.abs(work.currentTime - t) < 0.001) t += 0.001;
  const frame = work.requestVideoFrameCallback
    ? new Promise((r) => { work.requestVideoFrameCallback(() => r()); setTimeout(r, 400); }) : null;
  work.currentTime = t;
  await once(work, 'seeked', 8000);
  if (frame) await frame; else await sleep(30);
}

async function primeWork() {
  // iPhone は一度再生しないと場面を描けないことがある
  if (work.readyState < 2) {
    try { await work.play(); work.pause(); } catch (_) {}
    if (work.readyState < 2) await once(work, 'loadeddata', 8000).catch(() => {});
  }
}

async function makeSheets() {
  await primeWork();
  const start = state.start, end = rangeEnd(), len = Math.max(0.1, end - start);
  let times;
  if (state.opts.pick === 'even') {
    const iv = Math.max(0.5, parseFloat($('interval').value) || 5);
    times = [];
    for (let t = start; t <= end - 0.05 && times.length < 144; t += iv) times.push(t);
    if (!times.length) times = [start];
  } else {
    const n = state.opts.count === 'auto' ? Math.min(36, Math.max(4, Math.round(len / 10) + 6)) : +state.opts.count;
    times = await pickScenes(start, len, n);
  }

  // まとめ画像の形を決める
  const per = +state.opts.per, cols = Math.round(Math.sqrt(per));
  const gap = 6;
  const fullRows = Math.ceil(per / cols);
  const natW = cols * state.vw + (cols + 1) * gap, natH = fullRows * state.vh + (fullRows + 1) * gap;
  const s = fitScale(natW, natH);
  const tw = Math.floor(state.vw * s), th = Math.floor(state.vh * s);
  const nSheets = Math.ceil(times.length / per);
  const gray = $('gray').checked, stamp = $('stamp').checked;
  const outs = [];
  let done = 0;
  for (let si = 0; si < nSheets; si++) {
    const part = times.slice(si * per, (si + 1) * per);
    const c = Math.min(cols, part.length), r = Math.ceil(part.length / cols);
    const cv = document.createElement('canvas');
    cv.width = c * tw + (c + 1) * gap; cv.height = r * th + (r + 1) * gap;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < part.length; i++) {
      setProgress(0.5 + 0.5 * (done / times.length), `まとめ画像を作っています（${done + 1}/${times.length}）`);
      await seekTo(part[i]);
      const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + gap);
      ctx.drawImage(work, x, y, tw, th);
      if (stamp) drawStamp(ctx, x, y, th, `${si * per + i + 1}  ${fmtTime(part[i])}`);
      done++;
    }
    if (gray) toGray(ctx, cv.width, cv.height);
    const blob = await canvasToBlob(cv);
    const name = `${baseName()}_matome${nSheets > 1 ? `_${si + 1}of${nSheets}` : ''}.jpg`;
    outs.push({ file: new File([blob], name, { type: 'image/jpeg' }), canvas: cv, label: `${si + 1}枚目 ・ ${part.length}場面 ・ ${fmtTime(part[0])}〜${fmtTime(part[part.length - 1])}` });
  }
  const total = outs.reduce((a, o) => a + o.file.size, 0);
  const how = state.opts.pick === 'even' ? `${parseFloat($('interval').value) || 5}秒ごとに` : '画面が変わった所を中心に';
  const explain = `この画像は、動画（${fmtTime(start)}〜${fmtTime(end)}、長さ ${fmtTime(len)}）から${how}${times.length}場面を取り出し、${nSheets}枚に並べたものです。` +
    `各まとめ画像の中は、左上から右へ、上の段から下の段へと時間が進みます。` + (stamp ? '各場面の左上の数字は「場面の番号」と「動画の中の時間」です。' : '');
  showResult({
    title: `まとめ画像 ${nSheets}枚（${times.length}場面）`,
    summary: `${mb(state.files[0].size)} → <b>${mb(total)}</b>`,
    outs, explain,
    note: 'Claude に渡すときは、「説明文をコピー」した文をいっしょに貼ると、場面の順番や時間が伝わりやすくなります。',
  });
}

function drawStamp(ctx, x, y, th, text) {
  const fs = Math.max(14, Math.round(th * 0.075));
  ctx.font = `700 ${fs}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`;
  const w = ctx.measureText(text).width + fs * 0.8, h = fs * 1.45;
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 4, y + 4, w, h, fs * 0.3) : ctx.rect(x + 4, y + 4, w, h); ctx.fill();
  ctx.fillStyle = '#ffd25e'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 4 + fs * 0.4, y + 4 + h / 2);
}
function toGray(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const l = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114; p[i] = p[i + 1] = p[i + 2] = l; }
  ctx.putImageData(d, 0, 0);
}

// おまかせ：細かく見て、画面が大きく変わった所を優先し、足りない所は間をうめる
async function pickScenes(start, len, n) {
  const S = Math.max(2, Math.min(160, Math.ceil(len / 0.5)));
  if (n >= S) { const t = []; for (let i = 0; i < n; i++) t.push(start + (i + 0.5) * len / n); return t; }
  const times = [], thumbs = [];
  const sw = 96, sh = Math.max(8, Math.round(96 * state.vh / state.vw));
  const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < S; i++) {
    setProgress(0.5 * (i / S), `大事な場面を探しています（${i + 1}/${S}）`);
    const t = start + (i + 0.5) * len / S;
    await seekTo(t);
    ctx.drawImage(work, 0, 0, sw, sh);
    const p = ctx.getImageData(0, 0, sw, sh).data, g = new Uint8Array(sw * sh);
    for (let j = 0; j < g.length; j++) g[j] = (p[j * 4] * 0.299 + p[j * 4 + 1] * 0.587 + p[j * 4 + 2] * 0.114) | 0;
    times.push(t); thumbs.push(g);
  }
  const diff = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) s += Math.abs(a[j] - b[j]); return s / a.length; };
  const d = thumbs.map((g, i) => (i ? diff(g, thumbs[i - 1]) : 0));
  const sorted = [...d].slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const sel = new Set([0]);
  const minGap = Math.max(1, Math.floor(S / (n * 1.5)));
  const near = (i) => [...sel].some((k) => Math.abs(k - i) < minGap);
  const order = d.map((v, i) => i).slice(1).sort((a, b) => d[b] - d[a]);
  for (const i of order) {
    if (sel.size >= Math.ceil(n * 0.6)) break;
    if (d[i] < Math.max(median * 2.5, 4)) break;
    if (!near(i)) sel.add(i);
  }
  // ほとんど同じ画面（止まっている所）はもう選ばない
  // 少しでもはっきり変わった所（文字が1行ふえた等）があれば「ちがう場面」とみなす
  const changed = (a, b) => { let c = 0; for (let j = 0; j < a.length; j++) if (Math.abs(a[j] - b[j]) > 24) c++; return c / a.length; };
  const dup = (i) => [...sel].some((k) => changed(thumbs[i], thumbs[k]) < 0.003);
  const skip = new Set();
  while (sel.size < n) { // いちばん離れている所をうめる
    let best = -1, bestDist = -1;
    for (let i = 0; i < S; i++) {
      if (sel.has(i) || skip.has(i)) continue;
      let m = Infinity; for (const k of sel) m = Math.min(m, Math.abs(k - i));
      if (m > bestDist) { bestDist = m; best = i; }
    }
    if (best < 0) break;
    if (dup(best)) { skip.add(best); continue; }
    sel.add(best);
  }
  return [...sel].sort((a, b) => a - b).map((i) => times[i]);
}

// ---------- 画像を軽く ----------
async function makeImages() {
  const outs = [];
  let before = 0;
  for (let i = 0; i < state.files.length; i++) {
    const f = state.files[i]; before += f.size;
    setProgress(i / state.files.length, `画像を軽くしています（${i + 1}/${state.files.length}）`);
    let bmp;
    try { bmp = await createImageBitmap(f); } catch (_) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(Object.assign(new Error('image'), { userMsg: `「${f.name}」はこのブラウザで開けませんでした。` })); im.src = URL.createObjectURL(f); });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const s = fitScale(w, h);
    const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    let blob = await canvasToBlob(cv);
    let file;
    if (blob.size >= f.size && /^image\/(jpeg|png|webp|gif)$/.test(f.type) && s === 1) file = f; // 元の方が軽いときはそのまま
    else file = new File([blob], f.name.replace(/\.[^.]+$/, '') + '_small.jpg', { type: 'image/jpeg' });
    outs.push({ file, canvas: cv, label: `${cv.width}×${cv.height} ・ ${mb(file.size)}` });
  }
  const total = outs.reduce((a, o) => a + o.file.size, 0);
  showResult({ title: `画像 ${outs.length}枚`, summary: `${mb(before)} → <b>${mb(total)}</b>`, outs,
    note: 'Claude が読みやすい大きさ（長い辺 2,576px まで）にそろえました。' });
}

// ---------- 動画のまま軽く ----------
async function makeVideo() {
  if (!('VideoEncoder' in window)) {
    throw Object.assign(new Error('no WebCodecs'), { userMsg: 'この機械のブラウザでは「動画のまま軽く」が使えません。\nブラウザを新しくするか、「まとめ画像にする」を使ってください。' });
  }
  setProgress(0, '準備しています…');
  const M = await import(MEDIABUNNY_URL).catch(() => { throw Object.assign(new Error('load'), { userMsg: '部品を読み込めませんでした。ネットにつながっているか確かめてください（動画は送られません）。' }); });
  const preset = { s: { side: 480, fps: 15, q: M.QUALITY_VERY_LOW }, m: { side: 720, fps: 24, q: M.QUALITY_LOW }, l: { side: 1080, fps: 30, q: M.QUALITY_MEDIUM } }[state.opts.q];
  const input = new M.Input({ formats: M.ALL_FORMATS, source: new M.BlobSource(state.files[0]) });
  const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
  const video = { bitrate: preset.q, frameRate: preset.fps, codec: 'avc' };
  const short = Math.min(state.vw, state.vh);
  if (short > preset.side) { // 短い辺をそろえる（もとより大きくはしない）
    if (state.vw >= state.vh) video.height = preset.side; else video.width = preset.side;
  }
  const opts = { input, output, video, audio: { discard: true }, showWarnings: false };
  const end = rangeEnd();
  if (state.start > 0 || end < state.duration - 0.05) opts.trim = { start: state.start, end };
  let conv = await M.Conversion.init(opts);
  if (!conv.isValid) { // avc で作れないときは、選べるものにまかせる
    delete video.codec;
    conv = await M.Conversion.init({ ...opts, input: new M.Input({ formats: M.ALL_FORMATS, source: new M.BlobSource(state.files[0]) }), output: new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() }) });
  }
  if (!conv.isValid) throw Object.assign(new Error('invalid'), { userMsg: 'この動画はこのブラウザでは変換できませんでした。別のブラウザでためしてください。' });
  conv.onProgress = (p) => setProgress(p, `軽くしています（${Math.round(p * 100)}%）`);
  await conv.execute();
  const buf = conv.output.target.buffer;
  const file = new File([buf], `${baseName()}_small.mp4`, { type: 'video/mp4' });
  showResult({ title: '軽い動画', summary: `${mb(state.files[0].size)} → <b>${mb(file.size)}</b>（音なし）`, outs: [{ file, video: true }],
    note: '公式の資料では、Claude が動画を直接読めるとは書かれていません。うまく伝わらないときは「まとめ画像にする」を使ってください。' });
}

// ---------- できあがり ----------
function clearResult() {
  $('result').hidden = true; $('sheets').innerHTML = '';
  const ov = $('outVideo'); if (ov.src) { URL.revokeObjectURL(ov.src); ov.removeAttribute('src'); } ov.hidden = true;
  for (const o of state.outputs) if (o.url) URL.revokeObjectURL(o.url);
  state.outputs = [];
  const ex = document.getElementById('copyExplain'); if (ex) ex.remove();
}

const canCopyImage = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
function canShareFiles(files) { try { return !!(navigator.canShare && navigator.canShare({ files })); } catch (_) { return false; } }

function showResult({ title, summary, outs, note, explain }) {
  state.outputs = outs;
  $('resTitle').textContent = title;
  $('resSummary').innerHTML = summary;
  $('resNote').textContent = note || '';
  const files = outs.map((o) => o.file);
  $('shareAll').hidden = !canShareFiles(files);
  $('shareAll').textContent = files.length > 1 ? `Claude に送る・保存する（${files.length}枚まとめて）` : 'Claude に送る・保存する';
  $('downloadAll').textContent = files.length > 1 ? `ダウンロード（${files.length}つ）` : 'ダウンロード';
  if (explain) {
    const b = document.createElement('button'); b.className = 'btn sub'; b.id = 'copyExplain'; b.textContent = '説明文をコピー';
    b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(explain); toast('説明文をコピーしました'); } catch (_) { prompt('この文をコピーしてください', explain); } });
    $('downloadAll').parentElement.appendChild(b);
  }
  const box = $('sheets');
  for (const o of outs) {
    o.url = URL.createObjectURL(o.file);
    if (o.video) { const v = $('outVideo'); v.src = o.url; v.hidden = false; continue; }
    const el = document.createElement('div'); el.className = 'sheet';
    const img = document.createElement('img'); img.src = o.url; img.alt = o.label;
    const bar = document.createElement('div'); bar.className = 'bar2';
    const sp = document.createElement('span'); sp.textContent = `${o.label} ・ ${mb(o.file.size)}`;
    bar.appendChild(sp);
    if (canCopyImage) {
      const cb = document.createElement('button'); cb.className = 'btn small sub'; cb.textContent = 'コピー';
      cb.addEventListener('click', () => copyImage(o));
      bar.appendChild(cb);
    }
    el.append(img, bar); box.appendChild(el);
  }
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('shareAll').addEventListener('click', async () => {
  const files = state.outputs.map((o) => o.file);
  try { await navigator.share({ files }); } catch (e) { if (e.name !== 'AbortError') toast('送れませんでした。ダウンロードをためしてください'); }
});
$('downloadAll').addEventListener('click', async () => {
  for (const o of state.outputs) {
    const a = document.createElement('a'); a.href = o.url; a.download = o.file.name;
    document.body.appendChild(a); a.click(); a.remove();
    await sleep(400);
  }
});
async function copyImage(o) {
  try {
    // 貼り付けは PNG しか受け付けないブラウザが多い
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToBlob(o.canvas, 'image/png') })]);
    toast('コピーしました。Claude に貼り付けできます');
  } catch (e) { console.error(e); toast('コピーできませんでした。ダウンロードを使ってください'); }
}

updateUI();
