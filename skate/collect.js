// LAPS：参考動画を撮るモード
// ラップの計算はせず、撮ることだけに専念する（熱くなりにくい・長く撮っても止まりにくい）。
// はじめから送りやすい小さめの画質で撮り、2分ごとに区切ってこのスマホの中（IndexedDB）に保存する。
// 動画はどこにも送らない。本人が「共有・保存」を押した時だけ、本人の選んだ先へ渡す。
const $ = id => document.getElementById(id);
const SEG = 120; // 1本の長さ（秒）
const QUAL = { small: { w: 854, h: 480, bps: 900e3, label: '送りやすい' }, mid: { w: 1280, h: 720, bps: 2200e3, label: 'きれい' } };
let ui = { toast: () => {}, go: () => {}, use: null };
let dbP = null, stream = null, rec = null, running = false, segTm = 0, tick = 0, wake = null;
let startAt = 0, segAt = 0, seq = 0, mime = '', urls = [];

function db() {
  if (!dbP) dbP = new Promise((res, rej) => { const r = indexedDB.open('skate-clips', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbP;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('clips', mode), q = fn(t.objectStore('clips')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + 'MB';
const clock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const p2 = n => String(n).padStart(2, '0');
const qual = () => QUAL[$('colQual').value] || QUAL.small;

async function camera() {
  stopCamera();
  const q = qual();
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: 30 } } });
  const v = $('colVideo'); v.srcObject = stream; await v.play().catch(() => {});
}
function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } const v = $('colVideo'); if (v) v.srcObject = null; }

function startSeg() {
  const chunks = [], at = Date.now(), n = ++seq, q = qual();
  rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: q.bps } : { videoBitsPerSecond: q.bps });
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    const type = mime || rec.mimeType || 'video/webm', blob = new Blob(chunks, { type }), d = new Date(at);
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const name = `LAPS_${d.getMonth() + 1}月${d.getDate()}日_${p2(d.getHours())}${p2(d.getMinutes())}_${p2(n)}.${ext}`;
    try { if (blob.size) await tx('readwrite', s => s.put({ id: startAt + '-' + p2(n), at, dur: (Date.now() - at) / 1000, size: blob.size, type, name, blob })); }
    catch (e) { ui.toast('保存できませんでした（スマホの空きが足りないかもしれません）'); running = false; }
    if (running && stream) startSeg(); else finish();
    list();
  };
  segAt = at; rec.start(1000);
  clearTimeout(segTm); segTm = setTimeout(() => { if (rec && rec.state !== 'inactive') rec.stop(); }, SEG * 1000);
}
function finish() {
  clearInterval(tick); clearTimeout(segTm); rec = null;
  try { wake && wake.release(); } catch (e) {} wake = null;
  $('colStart').classList.remove('hide'); $('colStop').classList.add('hide'); $('colQual').disabled = false;
  $('colState').textContent = '止まっています'; $('colDarkBtn').classList.add('hide');
}
async function start() {
  if (!window.MediaRecorder) return ui.toast('この端末ではアプリで撮影できません');
  if (!stream) { try { await camera(); } catch (e) { return ui.toast('カメラを使えませんでした'); } }
  mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  running = true; startAt = Date.now(); seq = 0;
  try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
  $('colStart').classList.add('hide'); $('colStop').classList.remove('hide'); $('colQual').disabled = true; $('colDarkBtn').classList.remove('hide');
  startSeg();
  tick = setInterval(() => {
    const t = clock((Date.now() - startAt) / 1000);
    $('colState').textContent = `● 撮影中 ${t}（${seq}本目・次の区切りまで ${clock(SEG - (Date.now() - segAt) / 1000)}）`;
    $('darkTime').textContent = t; $('darkInfo').textContent = `参考動画・${seq}本目`;
  }, 500);
}
function stop() { running = false; clearTimeout(segTm); if (rec && rec.state !== 'inactive') rec.stop(); else finish(); }

async function list() {
  const box = $('colList'); if (!box) return;
  let all = []; try { all = (await tx('readonly', s => s.getAll())) || []; } catch (e) {}
  all.sort((a, b) => b.at - a.at);
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  box.innerHTML = '';
  $('colEmpty').classList.toggle('hide', all.length > 0); $('colClear').classList.toggle('hide', all.length < 2);
  let total = 0;
  for (const c of all) {
    total += c.size;
    const d = new Date(c.at), el = document.createElement('div'); el.className = 'rec';
    el.innerHTML = `<div class="t"><b></b><span>${clock(c.dur)}・${mb(c.size)}</span></div><button class="btn small" data-a="share">送る・保存</button><button class="btn small" data-a="use">読み取る</button><button class="btn small" data-a="del" aria-label="消す">🗑</button>`;
    el.querySelector('b').textContent = `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} から`;
    const file = () => new File([c.blob], c.name, { type: c.type });
    el.querySelector('[data-a=share]').onclick = async () => {
      const f = file();
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const u = URL.createObjectURL(f); urls.push(u); const a = document.createElement('a'); a.href = u; a.download = c.name; document.body.append(a); a.click(); a.remove();
    };
    el.querySelector('[data-a=use]').onclick = () => { if (running) return ui.toast('撮影を止めてから使えます'); ui.use && ui.use(file()); };
    el.querySelector('[data-a=del]').onclick = async () => { if (!confirm('この動画をスマホから消しますか？')) return; await tx('readwrite', s => s.delete(c.id)); list(); };
    box.append(el);
  }
  let free = ''; try { const e = await navigator.storage.estimate(); if (e && e.quota) free = `・あと約 ${mb(Math.max(0, e.quota - e.usage))} 入ります`; } catch (e) {}
  $('colTotal').textContent = all.length ? `${all.length}本・合わせて ${mb(total)}${free}` : '';
}

export function init(opts) {
  ui = Object.assign(ui, opts);
  $('colStart').onclick = start; $('colStop').onclick = () => { if (confirm('撮影を止めますか？')) stop(); };
  $('colQual').onchange = async () => { try { localStorage.setItem('skate-colqual', $('colQual').value); } catch (e) {} if (!running) { try { await camera(); } catch (e) {} } };
  $('colClear').onclick = async () => { if (!confirm('撮った参考動画を、ぜんぶスマホから消しますか？')) return; await tx('readwrite', s => s.clear()); list(); };
  $('colDarkBtn').onclick = () => $('dark').classList.remove('hide');
  try { const q = localStorage.getItem('skate-colqual'); if (q && QUAL[q]) $('colQual').value = q; } catch (e) {}
  // 画面をはなれた・アプリを閉じた時：いまの区切りまでを保存して止める
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
}
export async function open() {
  ui.go('sCollect'); list();
  if (!navigator.mediaDevices?.getUserMedia) return ui.toast('この端末ではアプリで撮影できません');
  try { await camera(); } catch (e) { ui.toast('カメラを使えませんでした。カメラの許可を確かめてください'); }
}
export function leave() { if (running) stop(); stopCamera(); }
export const isRunning = () => running;
