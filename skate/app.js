// スケートラップ：画面と記録
import { grabGray, LineAnchor, MotionChain, apply, inv3 } from './motion.js';
import { loadDetector, usedDelegate, scanVideo, seekTo, findRedLine, trackCrossings, refineCrossing, interpBox, groupTracks, Tracker, detectFrame, grabSmall, liveCrossing, histSim, normHist } from './vision.js';

const $ = id => document.getElementById(id);
const S = { session: null, videoURL: null, videoFile: null, person: null, line: null, live: false, stream: null, recBlob: null };

// ---------- 小さな道具 ----------
function go(id) { document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === id)); window.scrollTo(0, 0); if (id !== 'sPerson') stopPlayer(); if (id !== 'sLine' && id !== 'sLive') stopCamera(); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if (b.dataset.go === 'sResult') showResult(); else { go(b.dataset.go); if (b.dataset.go === 'sHome') showHome(); } });
let toastTm; function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => t.classList.remove('on'), 2200); }
const fmt = s => { if (s == null || !isFinite(s)) return '—'; const m = Math.floor(s / 60), r = s - m * 60; return m ? `${m}:${r.toFixed(2).padStart(5, '0')}` : r.toFixed(2); };
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- 端末に保存（IndexedDB）----------
const dbP = new Promise((res, rej) => {
  const r = indexedDB.open('skate-lap', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sessions', { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function dbDo(mode, fn) { const db = await dbP; return new Promise((res, rej) => { const tx = db.transaction('sessions', mode); const q = fn(tx.objectStore('sessions')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
const saveSession = s => dbDo('readwrite', st => st.put(s));
const allSessions = () => dbDo('readonly', st => st.getAll());
const delSession = id => dbDo('readwrite', st => st.delete(id));

// ---------- ホーム ----------
async function showHome() {
  const list = (await allSessions()).sort((a, b) => b.date - a.date);
  $('recEmpty').classList.toggle('hide', list.length > 0);
  const box = $('recList'); box.innerHTML = '';
  for (const s of list) {
    const el = document.createElement('div'); el.className = 'rec';
    const d = new Date(s.date), main = topPersons(s).slice(0, 4);
    el.innerHTML = `<div class="t"><b></b><span>${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}・${clock(s.duration)}・選手 ${main.length ? countMain(s) : 0}人</span></div><div class="faces"></div><button class="btn small" aria-label="消す">🗑</button>`;
    el.querySelector('b').textContent = s.title || s.videoName;
    const f = el.querySelector('.faces');
    for (const p of main) { const im = new Image(); im.src = personThumb(s, p); f.append(im); }
    el.querySelector('button').onclick = async e => { e.stopPropagation(); if (confirm('この記録を消しますか？')) { await delSession(s.id); showHome(); } };
    el.onclick = () => { S.session = s; if (!S.videoFile || S.videoFile.name !== s.videoName || S.videoFile.size !== s.videoSize) { S.videoURL = null; } showResult(); };
    box.append(el);
  }
}

// ---------- 動画を入れる ----------
async function setVideo(file) {
  if (S.videoURL) URL.revokeObjectURL(S.videoURL);
  S.videoFile = file; S.videoURL = URL.createObjectURL(file);
  for (const v of [$('vScan'), $('vPlay'), $('vWork')]) v.src = S.videoURL;
  await new Promise((res, rej) => { const v = $('vWork'); if (v.readyState >= 1) return res(); v.onloadedmetadata = res; v.onerror = () => rej(new Error('この動画は開けませんでした')); });
}
$('file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { await setVideo(f); } catch (err) { return toast(err.message); }
  S.session = null; S.live = false; S.recBlob = null;
  openLine();
  loadDetector().catch(() => {}); // 線を合わせている間に準備しておく
};
$('file2').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const s = S.session;
  if (s && (f.name !== s.videoName || Math.abs(f.size - s.videoSize) > 0) && !confirm('記録した時と違う動画のようです。このまま使いますか？')) return;
  try { await setVideo(f); } catch (err) { return toast(err.message); }
  showResult();
};

// ---------- 赤いラインを合わせる ----------
const lineCv = $('lineCv'), lineCx = lineCv.getContext('2d');
const lineSrc = () => S.live ? $('vLive') : $('vWork');
async function openLine() {
  go('sLine');
  const v = lineSrc();
  lineCv.width = v.videoWidth; lineCv.height = v.videoHeight;
  S.line = lsGet(S.live ? 'skate-line-live' : 'skate-line', null) || lsGet('skate-line', null);
  $('optTiles').checked = lsGet('skate-tiles', 1) === 2;
  $('lineTime').classList.toggle('hide', S.live);
  $('lineNote').textContent = S.live ? '赤いラインが写る向きで線を合わせてください。撮影中に選手を追って首を振っても大丈夫です（立つ場所は変えないでください）。' : '下の帯を動かして、赤いラインがはっきり見えて人が重なっていない場面を選んでください。カメラが動く動画でも大丈夫です。';
  $('startScan').textContent = S.live ? '⏺ この線で撮影スタート' : 'この線で解析する';
  if (!S.live) await seekTo(v, 0.5);
  if (!S.line) S.line = findRedLine(v, v.videoWidth, v.videoHeight) || [[0.3, 0.75], [0.7, 0.6]];
  drawLine();
  if (S.live) { const loop = () => { if (!$('sLine').classList.contains('on')) return; drawLine(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
}
function drawLine() {
  const v = lineSrc(), W = lineCv.width, H = lineCv.height;
  lineCx.drawImage(v, 0, 0, W, H);
  const [a, b] = S.line, r = Math.max(10, W / 50);
  lineCx.lineWidth = Math.max(3, W / 300); lineCx.strokeStyle = '#ffffff'; lineCx.setLineDash([W / 60, W / 90]);
  lineCx.beginPath(); lineCx.moveTo(a[0] * W, a[1] * H); lineCx.lineTo(b[0] * W, b[1] * H); lineCx.stroke(); lineCx.setLineDash([]);
  for (const p of [a, b]) { lineCx.beginPath(); lineCx.arc(p[0] * W, p[1] * H, r, 0, 7); lineCx.fillStyle = 'rgb(255 59 79 / .55)'; lineCx.fill(); lineCx.lineWidth = Math.max(2, W / 400); lineCx.strokeStyle = '#fff'; lineCx.stroke(); }
}
$('lineTime').oninput = async e => { const v = $('vWork'); await seekTo(v, v.duration * e.target.value / 1000); drawLine(); };
$('lineAuto').onclick = () => { const v = lineSrc(); const l = findRedLine(v, v.videoWidth, v.videoHeight); if (l) { S.line = l; drawLine(); toast('赤い線を見つけました'); } else toast('赤い線が見つかりません。丸を動かしてください'); };
{
  let drag = -1;
  const pos = e => { const r = lineCv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  lineCv.addEventListener('pointerdown', e => {
    const p = pos(e), r = lineCv.getBoundingClientRect(), asp = r.width / r.height;
    const d = S.line.map(q => Math.hypot((q[0] - p[0]) * asp, q[1] - p[1]));
    drag = d[0] < d[1] ? 0 : 1; if (d[drag] > 0.15) { drag = -1; return; }
    lineCv.setPointerCapture(e.pointerId);
  });
  lineCv.addEventListener('pointermove', e => { if (drag < 0) return; const p = pos(e); S.line[drag] = [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]; drawLine(); });
  lineCv.addEventListener('pointerup', () => drag = -1);
}

// ---------- 解析 ----------
let stopFlag = false;
$('stopScan').onclick = () => { stopFlag = true; };
$('startScan').onclick = async () => {
  if (S.live) return startLive();
  lsSet('skate-line', S.line);
  const tiles = $('optTiles').checked ? 2 : 1; lsSet('skate-tiles', tiles);
  // 線を合わせたコマを覚える（カメラが動いても、毎回このコマに重ねて線の位置を求める）
  const lw = $('vWork');
  if (!S.lineK) { S.lineK = grabGray(lw, lw.videoWidth, lw.videoHeight); S.lineImg = frameImage(lw); }
  const anchor = new LineAnchor(S.lineK, S.line.map(p => p.slice()));
  go('sScan'); stopFlag = false;
  $('scanInfo').textContent = '準備しています…'; $('scanBar').style.width = '0%'; $('scanPct').textContent = '0%';
  let wake = null; try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  const v = $('vScan'), cv = $('scanCv'), cx = cv.getContext('2d');
  try {
    await loadDetector();
    const W = v.videoWidth, H = v.videoHeight; cv.width = W; cv.height = H;
    const t0 = performance.now();
    const { tracks, frames, motion } = await scanVideo(v, {
      tiles, anchor,
      isStopped: () => stopFlag,
      onProgress: p => { const n = Math.min(100, Math.round(p * 100)); $('scanBar').style.width = n + '%'; $('scanPct').textContent = n + '%'; },
      onFrame: (t, dets, rate, ln) => {
        cx.clearRect(0, 0, W, H);
        if (ln) { cx.lineWidth = Math.max(3, W / 300); cx.strokeStyle = '#ff3b4f'; cx.beginPath(); cx.moveTo(ln[0][0] * W, ln[0][1] * H); cx.lineTo(ln[1][0] * W, ln[1][1] * H); cx.stroke(); }
        cx.strokeStyle = '#3fb4ff'; cx.lineWidth = Math.max(2, W / 500);
        for (const d of dets) cx.strokeRect(d.x1 * W, d.y1 * H, (d.x2 - d.x1) * W, (d.y2 - d.y1) * H);
        $('scanInfo').textContent = `${rate ? rate.toFixed(2).replace(/0$/, '') + '倍' : 'コマ送り'}で解析中（${usedDelegate() === 'GPU' ? '速いモード' : 'ふつうモード'}）`;
      },
    });
    const sec = (performance.now() - t0) / 1000;
    $('scanInfo').textContent = 'まとめています…';
    await new Promise(r => setTimeout(r, 30));
    const s = buildSession(tracks, W, H, v.duration, tiles, null, motion);
    s.scanStats = { frames, sec: Math.round(sec), delegate: usedDelegate(), stopped: stopFlag };
    await saveSession(s); S.session = s;
    toast(`解析が終わりました（${Math.round(sec)}秒）`);
    showResult();
  } catch (err) {
    console.error(err); toast('解析できませんでした：' + (err.message || err)); go('sHome'); showHome();
  } finally { try { wake?.release(); } catch {} S.lineK = null; }
};
// 線を合わせたコマを、記録に残せる小さい写真にする
function frameImage(v) {
  const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85);
}
// 各コマの「いま→線のコマ」の変換から、その時刻のコマでの線の位置を出す
function makeLineAt(s) {
  const map = new Map(), rows = s.motion || [];
  for (const r of rows) map.set(Math.round(r[0] * 1000), r);
  const lineOf = r => { if (!r || !r[10]) return null; const Hi = inv3(r.slice(11, 20)); return s.line.map(p => apply(Hi, p[0], p[1])); };
  const near = (t, tol) => { // 近い時刻のコマ（二分探索）
    if (!rows.length) return null;
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
    const r = Math.abs(rows[lo][0] - t) <= Math.abs(rows[hi][0] - t) ? rows[lo] : rows[hi];
    return Math.abs(r[0] - t) <= tol ? r : null;
  };
  const hkOf = r => r && r[10] ? r.slice(11, 20) : null;
  if (!rows.length) return { exact: () => s.line, near: () => s.line, Hk: () => null, toK: () => [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  return {
    toK: t => hkOf(map.get(Math.round(t * 1000)) || near(t, 0.002)),
    exact: t => lineOf(map.get(Math.round(t * 1000)) || near(t, 0.002)),
    near: (t, tol = 0.2) => lineOf(near(t, tol)),
    Hk: t => { const r = near(t, 0.6); return r && r[10] ? r.slice(11, 20) : null; },
  };
}
async function lineKOf(s) {
  if (!s.lineImg) return null;
  if (S.kCache && S.kCache.id === s.id) return S.kCache.K;
  const im = new Image(); im.src = s.lineImg; await im.decode();
  const K = grabGray(im, im.naturalWidth, im.naturalHeight); S.kCache = { id: s.id, K }; return K;
}

function buildSession(rawTracks, W, H, duration, tiles, preset, motion) {
  const line = S.line;
  const r5 = x => Math.round(x * 1e5) / 1e5;
  const mrows = (motion || []).map(([t, T, Hk]) => [r5(t), ...T.map(r5), Hk ? 1 : 0, ...(Hk ? Hk.map(r5) : [])]);
  const toK = makeLineAt({ line, motion: mrows }).toK;
  // 短すぎる切れはし（見まちがい）は外す。ただしラインを越えたものは残す
  const tracks = [], crossings = [];
  for (const tr of rawTracks) {
    const cr = trackCrossings(tr, toK, line, W, H);
    const dur = tr.s[tr.s.length - 1][0] - tr.s[0][0];
    if (!cr.length && (tr.s.length < 4 || dur < 0.5)) continue;
    crossings.push(...cr);
    tracks.push({ id: tr.id, s: tr.s.map(r => r.map(x => Math.round(x * 10000) / 10000)), hist: Array.from(tr.hist), hn: tr.hn, thumbArea: tr.thumbArea, thumb: tr.thumb ? tr.thumb.toDataURL('image/jpeg', 0.8) : null });
  }
  // 前向き＝いちばん多い通過の向き
  const plus = crossings.filter(c => c.dir > 0).length, dir = plus >= crossings.length - plus ? 1 : -1;
  let groups;
  if (preset) { // その場で分けた人はそのまま。残りは服の色でまとめる
    const kept = new Set(tracks.map(t => t.id));
    groups = preset.map(g => g.filter(id => kept.has(id))).filter(g => g.length);
    const used = new Set(groups.flat());
    groups.push(...groupTracks(tracks.filter(t => !used.has(t.id)).map(t => ({ ...t, hist: Float32Array.from(t.hist) }))));
  } else groups = groupTracks(tracks.map(t => ({ ...t, hist: Float32Array.from(t.hist) })));
  const s = {
    id: 's' + Date.now(), date: Date.now(), videoName: S.videoFile.name, videoSize: S.videoFile.size, duration, W, H, line, tiles, dir, motion: mrows, lineImg: S.lineImg,
    minLap: lsGet('skate-minlap', 15), tracks, crossings, persons: groups.map(ids => ({ id: 'p' + ids[0], name: '', tracks: ids })),
  };
  // 名前の仮番号：ラインを越えた回数が多い順
  topPersons(s).forEach((p, i) => p.name = `選手${i + 1}`);
  s.persons.forEach(p => { if (!p.name) p.name = ''; });
  return s;
}

// ---------- ラップの計算 ----------
function personCrossings(s, p) {
  const set = new Set(p.tracks);
  const cs = s.crossings.filter(c => set.has(c.track) && c.dir === s.dir).sort((a, b) => a.t - b.t);
  const out = [];
  for (const c of cs) if (!out.length || c.t - out[out.length - 1].t >= s.minLap) out.push(c);
  return out;
}
function laps(s, p) {
  const cs = personCrossings(s, p), L = [];
  for (let i = 1; i < cs.length; i++) L.push({ n: i, lap: cs[i].t - cs[i - 1].t, total: cs[i].t - cs[0].t, at: cs[i].t, from: cs[i - 1].t, refined: cs[i].refined && cs[i - 1].refined });
  return { cs, L };
}
const trackById = (s, id) => s.tracks.find(t => t.id === id);
function personThumb(s, p) {
  let best = null; for (const id of p.tracks) { const t = trackById(s, id); if (t && t.thumb && (!best || t.thumbArea > best.thumbArea)) best = t; }
  return best ? best.thumb : 'icon.svg';
}
function personTime(s, p) { return p.tracks.reduce((a, id) => { const t = trackById(s, id); return a + (t ? t.s[t.s.length - 1][0] - t.s[0][0] : 0); }, 0); }
function topPersons(s) {
  return s.persons.map(p => ({ p, n: personCrossings(s, p).length, tm: personTime(s, p) }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n || b.tm - a.tm).map(x => x.p);
}
const countMain = s => topPersons(s).length;

// ---------- 選手一覧 ----------
function showResult() {
  const s = S.session; if (!s) return go('sHome');
  go('sResult');
  const d = new Date(s.date);
  $('resTitle').innerHTML = `選手一覧<small></small>`; $('resTitle').querySelector('small').textContent = `${d.getMonth() + 1}/${d.getDate()}・${s.videoName}`;
  $('needVideo').classList.toggle('hide', !!S.videoURL);
  $('recSave').classList.toggle('hide', !(S.recBlob && S.session.live && S.session.videoName === S.videoFile?.name));
  $('minLap').value = s.minLap;
  const main = topPersons(s), mainSet = new Set(main);
  const others = s.persons.filter(p => !mainSet.has(p)).sort((a, b) => personTime(s, b) - personTime(s, a)).slice(0, 60);
  fillFaces($('faces'), s, main, p => openPerson(p));
  fillFaces($('facesOther'), s, others, p => openPerson(p));
  if (!main.length) $('faces').innerHTML = '<p class="note">ラインを越えた人が見つかりませんでした。赤い線の位置を確かめてください。</p>';
}
function fillFaces(box, s, list, onTap) {
  box.innerHTML = '';
  for (const p of list) {
    const el = document.createElement('button'); el.className = 'face';
    const n = Math.max(0, personCrossings(s, p).length - 1);
    el.innerHTML = `<img alt=""><b></b>${n ? `<span class="laps">${n}周</span>` : ''}`;
    el.querySelector('img').src = personThumb(s, p);
    el.querySelector('b').textContent = p.name || '（名前なし）';
    el.onclick = () => onTap(p);
    box.append(el);
  }
}
$('minLap').onchange = async e => { const s = S.session; s.minLap = Math.max(3, +e.target.value || 15); lsSet('skate-minlap', s.minLap); await saveSession(s); showResult(); };

// ---------- 選手の画面 ----------
const P = { mode: 'chase', shape: 'v', rate: 1, path: null, raf: 0, refining: false, check: null };
const playCv = $('playCv'), playCx = playCv.getContext('2d');
function openPerson(p) {
  S.person = p; go('sPerson'); P.lineAt = null;
  $('pName').textContent = p.name || '（名前なし）';
  P.path = buildPath(S.session, p);
  renderLaps(); renderScenes();
  const has = !!S.videoURL;
  for (const id of ['playBtn', 'seek', 'saveVideo']) $(id).disabled = !has;
  $('playStage').classList.toggle('hide', !has);
  if (has) {
    const v = $('vPlay'); v.pause(); v.playbackRate = P.rate;
    const seg = P.path.segs[0]; seekTo(v, seg ? seg.a : 0);
    startPlayer(); refinePerson(p);
  } else { $('refineInfo').classList.remove('hide'); $('refineInfo').textContent = '動画を選ぶと、追いかけ動画が見られます（一覧の画面の「動画を選ぶ」）。'; }
}
$('rename').onclick = async () => {
  const p = S.person, n = prompt('名前', p.name || ''); if (n == null) return;
  p.name = n.trim(); $('pName').textContent = p.name || '（名前なし）'; await saveSession(S.session);
};

// 通過をコマ送りで見直して、ラップをさらに正確にする（選手を開いた時に、その人の分だけ）
async function refinePerson(p) {
  const s = S.session, info = $('refineInfo');
  const todo = personCrossings(s, p).filter(c => !c.refined);
  if (!todo.length || P.refining) { info.classList.add('hide'); return; }
  P.refining = true; info.classList.remove('hide');
  try {
    await loadDetector();
    const v = $('vWork'), la = makeLineAt(s);
    const ctx = { line: s.line, K: await lineKOf(s), HkNear: la.Hk, toK: la.toK, tiles: s.tiles };
    for (let i = 0; i < todo.length; i++) {
      if (S.person !== p) break;
      info.textContent = `ラップを細かく見直しています… ${i + 1}/${todo.length}`;
      const c = todo[i], tr = trackById(s, c.track);
      const nc = await refineCrossing(v, c, tr, ctx);
      Object.assign(c, nc);
      renderLaps();
    }
    await saveSession(s);
  } catch (e) { console.error(e); }
  P.refining = false; info.classList.add('hide');
}

function renderLaps() {
  const s = S.session, { cs, L } = laps(s, S.person), tb = $('lapTable');
  if (cs.length < 2) { tb.innerHTML = `<tr><td class="note" style="font-family:var(--font);font-size:14px">${cs.length ? 'ラインを越えたのは1回だけです（1周分のタイムには2回必要）。' : 'この人はラインを越えていません。'}</td></tr>`; return; }
  const best = Math.min(...L.map(x => x.lap));
  tb.innerHTML = '<tr><th>周</th><th>ラップ</th><th>合計</th></tr>';
  for (const x of L) {
    const tr = document.createElement('tr'); tr.className = 'tap';
    tr.innerHTML = `<td>${x.n}</td><td class="${x.lap === best && L.length > 1 ? 'best' : ''}">${fmt(x.lap)}${x.refined ? '' : '<span class="pill">見直し前</span>'}</td><td>${fmt(x.total)}</td>`;
    tr.onclick = () => checkCrossing(x.at);
    tb.append(tr);
  }
  const t = document.createElement('tr'); t.className = 'total';
  t.innerHTML = `<td>合計</td><td>${L.length}周</td><td>${fmt(L[L.length - 1].total)}</td>`; tb.append(t);
  const st = document.createElement('tr'); st.className = 'tap';
  st.innerHTML = `<td colspan="3" class="note" style="font-family:var(--font);font-size:13px;text-align:left">スタート（1回目の通過）${clock(cs[0].t)} をスローで見る</td>`;
  st.onclick = () => checkCrossing(cs[0].t); tb.append(st);
}
$('copyLaps').onclick = async () => {
  const s = S.session, p = S.person, { L } = laps(s, p); if (!L.length) return toast('ラップがありません');
  const d = new Date(s.date);
  const txt = [`${p.name || '選手'}（${d.getMonth() + 1}/${d.getDate()}）`, ...L.map(x => `${x.n}周 ${fmt(x.lap)}（${fmt(x.total)}）`), `合計 ${fmt(L[L.length - 1].total)}`].join('\n');
  try { await navigator.clipboard.writeText(txt); toast('コピーしました'); } catch { prompt('コピーしてください', txt); }
};

function renderScenes() {
  const s = S.session, p = S.person, box = $('scenes'); box.innerHTML = '';
  const ts = p.tracks.map(id => trackById(s, id)).filter(Boolean).sort((a, b) => a.s[0][0] - b.s[0][0]);
  for (const t of ts) {
    const el = document.createElement('div'); el.className = 'scene';
    el.innerHTML = `<img alt=""><span>${clock(t.s[0][0])}</span>${ts.length > 1 ? '<button>別の人にする</button>' : ''}`;
    el.querySelector('img').src = t.thumb || 'icon.svg';
    el.querySelector('img').onclick = () => { if (S.videoURL) seekTo($('vPlay'), t.s[0][0]); };
    const b = el.querySelector('button');
    if (b) b.onclick = async () => {
      p.tracks = p.tracks.filter(x => x !== t.id);
      s.persons.push({ id: 'p' + t.id + '_' + Date.now(), name: '', tracks: [t.id] });
      await saveSession(s); toast('別の人にしました'); openPerson(p);
    };
    box.append(el);
  }
}
$('mergeBtn').onclick = () => {
  const s = S.session, me = S.person;
  const list = [...topPersons(s), ...s.persons.filter(x => !topPersons(s).includes(x)).sort((a, b) => personTime(s, b) - personTime(s, a)).slice(0, 40)].filter(x => x !== me);
  fillFaces($('mergeFaces'), s, list, async other => {
    me.tracks.push(...other.tracks);
    if (!me.name && other.name) me.name = other.name;
    s.persons = s.persons.filter(x => x !== other);
    await saveSession(s); $('mergeDlg').close(); toast('まとめました'); openPerson(me);
  });
  $('mergeDlg').showModal();
};
$('mergeCancel').onclick = () => $('mergeDlg').close();

// ---------- 追いかけの道すじ ----------
const STEP = 0.04;
function buildPath(s, p) {
  const all = p.tracks.map(id => trackById(s, id)).filter(Boolean).flatMap(t => t.s).sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cur = null;
  for (const r of all) {
    if (!cur || r[0] - cur.last > 1.0) { cur = { s: [], last: r[0] }; segs.push(cur); }
    cur.s.push(r); cur.last = r[0];
  }
  return {
    all, segs: segs.map(g => {
      const a = Math.max(0, g.s[0][0] - 0.4), b = Math.min(s.duration, g.last + 0.4), n = Math.max(1, Math.ceil((b - a) / STEP));
      const cx = new Float32Array(n), cy = new Float32Array(n), h = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = a + i * STEP, bx = interpBox(g.s, Math.min(Math.max(t, g.s[0][0]), g.last), 1.0) || boxOf(g.s[0]);
        cx[i] = (bx.x1 + bx.x2) / 2; cy[i] = (bx.y1 + bx.y2) / 2; h[i] = bx.y2 - bx.y1;
      }
      return { a, b, cx: smooth(cx, 0.25 / STEP), cy: smooth(cy, 0.3 / STEP), h: smooth(h, 0.7 / STEP) };
    }),
  };
}
const boxOf = r => ({ x1: r[1], y1: r[2], x2: r[3], y2: r[4] });
function smooth(arr, sigma) {
  const n = arr.length, out = new Float32Array(n), R = Math.ceil(sigma * 2.5), w = [];
  for (let k = -R; k <= R; k++) w.push(Math.exp(-k * k / (2 * sigma * sigma)));
  for (let i = 0; i < n; i++) { let s = 0, ws = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j < 0 || j >= n) continue; s += arr[j] * w[k + R]; ws += w[k + R]; } out[i] = s / ws; }
  return out;
}
function segAt(t) { return P.path.segs.find(g => t >= g.a && t <= g.b); }
function cropAt(t, W, H, outAsp) {
  const g = segAt(t); if (!g) return null;
  const i = Math.min(g.cx.length - 1, Math.max(0, Math.round((t - g.a) / STEP)));
  let ch = Math.min(1, Math.max(0.2, g.h[i] * 2.4)), cw = ch * H * outAsp / W;
  if (cw > 1) { ch /= cw; cw = 1; }
  const x = Math.min(1 - cw, Math.max(0, g.cx[i] - cw / 2)), y = Math.min(1 - ch, Math.max(0, g.cy[i] - ch / 2));
  return { x, y, w: cw, h: ch };
}

// ---------- 再生 ----------
function startPlayer() { cancelAnimationFrame(P.raf); const loop = () => { drawFrame(); P.raf = requestAnimationFrame(loop); }; loop(); }
function stopPlayer() { cancelAnimationFrame(P.raf); $('vPlay').pause(); }
function drawFrame() {
  const v = $('vPlay'), s = S.session; if (!s || v.readyState < 2) return;
  const W = v.videoWidth, H = v.videoHeight, t = v.currentTime;
  // 写っている所だけ：場面の終わりで次の場面へ飛ぶ
  if (!v.paused && $('onlyMe').checked && !P.check && P.path.segs.length) {
    if (!segAt(t)) {
      const nx = P.path.segs.find(g => g.a > t);
      if (nx) { v.currentTime = nx.a; } else { v.pause(); v.currentTime = P.path.segs[0].a; }
    }
  }
  if (P.check && t >= P.check.end) { v.pause(); P.check = null; }
  const chase = P.mode === 'chase' && !P.check;
  const asp = chase ? (P.shape === 'v' ? 9 / 16 : 16 / 9) : W / H;
  const ow = chase ? (P.shape === 'v' ? 540 : 960) : Math.min(1280, W), oh = Math.round(ow / asp);
  if (playCv.width !== ow || playCv.height !== oh) { playCv.width = ow; playCv.height = oh; }
  const c = playCx;
  let crop = chase ? cropAt(t, W, H, asp) : null;
  if (chase && !crop) { // 写っていない時は全体を縮めて出す
    c.fillStyle = '#000'; c.fillRect(0, 0, ow, oh);
    const sh = ow * H / W; c.drawImage(v, 0, (oh - sh) / 2, ow, sh);
    c.fillStyle = 'rgb(0 0 0 / .5)'; c.fillRect(0, 0, ow, oh);
    label(c, 'この人は画面の外', ow / 2, oh / 2, 'center');
  } else if (crop) {
    c.drawImage(v, crop.x * W, crop.y * H, crop.w * W, crop.h * H, 0, 0, ow, oh);
  } else {
    c.drawImage(v, 0, 0, ow, oh);
    const sx = ow, sy = oh;
    c.lineWidth = Math.max(2, ow / 400); c.strokeStyle = '#ff3b4f';
    const ln = (P.lineAt || (P.lineAt = makeLineAt(s))).near(t);
    if (ln) { c.beginPath(); c.moveTo(ln[0][0] * sx, ln[0][1] * sy); c.lineTo(ln[1][0] * sx, ln[1][1] * sy); c.stroke(); }
    const b = interpBox(P.path.all, t, 1.0);
    if (b) {
      c.strokeStyle = '#3fb4ff'; c.lineWidth = Math.max(3, ow / 300); c.strokeRect(b.x1 * sx, b.y1 * sy, (b.x2 - b.x1) * sx, (b.y2 - b.y1) * sy);
      c.fillStyle = '#ffe14d'; c.beginPath(); c.arc((b.x1 + b.x2) / 2 * sx, b.y2 * sy, Math.max(4, ow / 160), 0, 7); c.fill();
    }
  }
  // いまの周と時間
  const { cs, L } = laps(s, S.person);
  if (cs.length && t >= cs[0].t) {
    let k = 0; while (k + 1 < cs.length && cs[k + 1].t <= t) k++;
    const run = t - cs[k].t, fs = Math.round(ow / 22);
    c.font = `800 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
    const txt = k > 0 && run < 4 ? `${k}周 ${fmt(L[k - 1].lap)}` : `${k + 1}周目 ${fmt(run)}`;
    if (k < cs.length - 1 || run < 4) label(c, txt, fs * 0.6, fs * 1.4, 'left', fs);
  }
  if (P.check) label(c, 'スロー確認', ow - 10, Math.round(ow / 22) * 1.4, 'right');
  $('playBtn').textContent = v.paused ? '▶' : '❚❚';
  if (!seeking) $('seek').value = Math.round(t / v.duration * 1000);
  $('tNow').textContent = clock(t);
}
function label(c, text, x, y, align, fs) {
  fs = fs || Math.round(c.canvas.width / 26);
  c.font = `800 ${fs}px ${getComputedStyle(document.body).fontFamily}`; c.textAlign = align; c.textBaseline = 'middle';
  const w = c.measureText(text).width, pad = fs * 0.35, x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  c.fillStyle = 'rgb(8 24 43 / .75)'; c.fillRect(x0 - pad, y - fs * 0.7, w + pad * 2, fs * 1.4);
  c.fillStyle = '#fff'; c.fillText(text, x, y);
}
let seeking = false;
$('seek').addEventListener('input', e => { seeking = true; const v = $('vPlay'); v.currentTime = v.duration * e.target.value / 1000; });
$('seek').addEventListener('change', () => seeking = false);
$('playBtn').onclick = () => { const v = $('vPlay'); P.check = null; v.playbackRate = P.rate; if (v.paused) v.play(); else v.pause(); };
function segBtns(id, key, after) {
  $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    P[key] = key === 'rate' ? +b.dataset.v : b.dataset.v; after && after();
  });
}
segBtns('modeSeg', 'mode', () => $('shapeSeg').classList.toggle('hide', P.mode !== 'chase'));
segBtns('shapeSeg', 'shape');
segBtns('rateSeg', 'rate', () => { $('vPlay').playbackRate = P.rate; });
async function checkCrossing(t) {
  if (!S.videoURL) return toast('動画を選ぶと確かめられます');
  const v = $('vPlay'); v.pause();
  await seekTo(v, Math.max(0, t - 1.2));
  P.check = { end: t + 0.8 }; v.playbackRate = 0.25; v.play();
  $('playStage').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 追いかけ動画を保存 ----------
$('saveVideo').onclick = async () => {
  const v = $('vPlay'), segs = P.path.segs; if (!segs.length) return;
  if (!window.MediaRecorder || !playCv.captureStream) return toast('この端末では保存できません');
  const btn = $('saveVideo'); btn.disabled = true;
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const P0 = { mode: P.mode, only: $('onlyMe').checked, rate: P.rate };
  P.mode = 'chase'; $('onlyMe').checked = true; P.rate = 1; P.check = null;
  const rec = new MediaRecorder(playCv.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 5e6 } : {});
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const total = segs.reduce((a, g) => a + g.b - g.a, 0);
  await seekTo(v, segs[0].a); v.playbackRate = 1;
  rec.start(500); v.play();
  await new Promise(res => {
    const tm = setInterval(() => {
      const t = v.currentTime, doneT = segs.filter(g => g.b < t).reduce((a, g) => a + g.b - g.a, 0) + (segAt(t) ? t - segAt(t).a : 0);
      btn.textContent = `保存しています… ${Math.min(99, Math.round(doneT / total * 100))}%`;
      if (v.paused || v.ended) { clearInterval(tm); res(); }
    }, 300);
  });
  rec.stop(); await new Promise(r => rec.onstop = r);
  const blob = new Blob(chunks, { type: type || 'video/webm' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${S.person.name || '選手'}_${new Date(S.session.date).toISOString().slice(0, 10)}.${(type || 'webm').includes('mp4') ? 'mp4' : 'webm'}`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  P.mode = P0.mode; $('onlyMe').checked = P0.only; P.rate = P0.rate;
  btn.disabled = false; btn.textContent = '追いかけ動画を保存'; toast('保存しました');
};

// ---------- その場で撮る ----------
function stopCamera() {
  if (L.rec && L.rec.state !== 'inactive') return; // 撮影中は止めない
  if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
}
$('liveBtn').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('この端末ではアプリで撮影できません。カメラで撮って「撮った動画を入れる」を使ってください');
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
  } catch (e) { return toast('カメラを使えませんでした（カメラの許可を確かめてください）'); }
  const v = $('vLive'); v.srcObject = S.stream; v.muted = true;
  await v.play().catch(() => {});
  if (!v.videoWidth) await new Promise(r => v.onloadedmetadata = r);
  S.live = true; S.session = null;
  loadDetector().catch(() => {});
  await openLine();
};

const L = { rec: null, chunks: [], t0: 0, tracker: null, persons: [], byTrack: new Map(), crossings: [], lastDet: 0, timer: 0, tiles: 1, newId: null };
async function startLive() {
  lsSet('skate-line-live', S.line); lsSet('skate-line', S.line);
  const v = $('vLive'), W = v.videoWidth, H = v.videoHeight;
  const cv = $('liveCv'), cx = cv.getContext('2d'); cv.width = W; cv.height = H;
  go('sLive');
  $('liveCards').innerHTML = ''; $('liveInfo').textContent = '準備しています…';
  try { await loadDetector(); } catch (e) { toast('準備できませんでした（はじめの1回は電波が必要です）'); go('sHome'); return; }
  try { L.wake = await navigator.wakeLock?.request('screen'); } catch {}
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  L.type = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  L.rec = new MediaRecorder(S.stream, L.type ? { mimeType: L.type, videoBitsPerSecond: 6e6 } : {});
  L.chunks = []; L.rec.ondataavailable = e => e.data.size && L.chunks.push(e.data);
  L.tracker = new Tracker(W, H); L.persons = []; L.byTrack = new Map(); L.crossings = []; L.lastDet = 0;
  // いま写っているコマを「線のコマ」にする。首を振っても、毎回このコマに重ねて線の位置を求める
  S.lineImg = frameImage(v);
  L.anchor = new LineAnchor(grabGray(v, W, H), S.line.map(p => p.slice())); L.chain = new MotionChain(); L.motion = []; L.toK = new Map();
  const toK = t => L.toK.get(Math.round(t * 1000)) || null;
  L.minLap = lsGet('skate-minlap', 15); L.tiles = lsGet('skate-tiles', 1);
  await new Promise(r => { L.rec.onstart = r; L.rec.start(1000); });
  L.t0 = performance.now();
  $('liveInfo').textContent = 'ラインを越えた人がここに出ます';
  L.timer = setInterval(() => { const t = clock((performance.now() - L.t0) / 1000); $('liveTime').textContent = t; $('darkTime').textContent = t; }, 500);
  const step = (now, meta) => {
    if (!L.rec || L.rec.state === 'inactive') return;
    const at = (meta && meta.captureTime) || now;
    // 1秒に10回くらいだけ調べる（電池と熱のため）
    if (at - L.lastDet >= 95) {
      L.lastDet = at;
      const t = (at - L.t0) / 1000;
      if (t >= 0) {
        grabSmall(v, W, H);
        const dets = detectFrame(v, W, H, L.tiles);
        const P = grabGray(v, W, H), T = L.chain.step(P, dets), loc = L.anchor.locate(P, T, dets);
        L.motion.push([t, T, loc ? loc.H : null]); if (loc) L.toK.set(Math.round(t * 1000), loc.H);
        L.tracker.update(t, dets, v, T);
        for (const tr of L.tracker.active) { const c = liveCrossing(tr, toK, S.line, W, H); if (c) onLiveCross(c, tr); }
        if ($('dark').classList.contains('hide')) {
          cx.clearRect(0, 0, W, H); cx.lineWidth = Math.max(3, W / 300); cx.strokeStyle = '#ff3b4f';
          const ln = loc ? loc.line : null;
          if (ln) { cx.beginPath(); cx.moveTo(ln[0][0] * W, ln[0][1] * H); cx.lineTo(ln[1][0] * W, ln[1][1] * H); cx.stroke(); }
          cx.strokeStyle = '#3fb4ff'; cx.lineWidth = Math.max(2, W / 500);
          for (const d of dets) cx.strokeRect(d.x1 * W, d.y1 * H, (d.x2 - d.x1) * W, (d.y2 - d.y1) * H);
        }
      }
    }
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(step); else requestAnimationFrame(t => step(t));
  };
  if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(step); else requestAnimationFrame(t => step(t));
}
// 前向き＝いちばん多い通過の向き
const liveDir = () => { const p = L.crossings.filter(c => c.dir > 0).length; return p >= L.crossings.length - p ? 1 : -1; };
function onLiveCross(c, tr) {
  L.crossings.push(c);
  let p = L.byTrack.get(tr.id);
  if (!p) { // 服の色がいちばん似ていて、少し前に通った人を探す
    const h = normHist(tr.hist, tr.hn); let best = null, bv = 0.9;
    const busy = new Set(L.tracker.active.filter(x => x !== tr).map(x => L.byTrack.get(x.id)).filter(Boolean));
    for (const q of L.persons) {
      if (busy.has(q)) continue;
      const last = q.cs.length ? q.cs[q.cs.length - 1].t : -1e9;
      if (c.t - last < L.minLap * 0.6) continue;
      const v = histSim(h, normHist(q.hist, q.hn)); if (v > bv) { bv = v; best = q; }
    }
    p = best || { id: 'p' + tr.id, name: String.fromCharCode(65 + L.persons.length % 26) + (L.persons.length >= 26 ? Math.floor(L.persons.length / 26) : ''), tracks: [], cs: [], hist: new Float32Array(tr.hist.length), hn: 0, thumb: null };
    if (!best) L.persons.push(p);
    p.tracks.push(tr.id); L.byTrack.set(tr.id, p);
    for (let i = 0; i < tr.hist.length; i++) p.hist[i] += tr.hist[i]; p.hn += tr.hn;
  }
  if (tr.thumb) p.thumb = tr.thumb.toDataURL('image/jpeg', 0.7);
  p.cs.push(c); L.newId = p.id;
  renderLiveCards();
}
function liveLaps(p) {
  const d = liveDir(), cs = p.cs.filter(c => c.dir === d).sort((a, b) => a.t - b.t), out = [];
  for (const c of cs) if (!out.length || c.t - out[out.length - 1].t >= L.minLap) out.push(c);
  const laps = []; for (let i = 1; i < out.length; i++) laps.push(out[i].t - out[i - 1].t);
  return laps;
}
function renderLiveCards() {
  const box = $('liveCards'); box.innerHTML = '';
  const list = L.persons.map(p => ({ p, laps: liveLaps(p), last: p.cs[p.cs.length - 1].t })).sort((a, b) => b.laps.length - a.laps.length || b.last - a.last);
  let total = 0;
  for (const { p, laps } of list) {
    total += laps.length;
    const el = document.createElement('div'); el.className = 'lcard' + (p.id === L.newId ? ' new' : '');
    el.innerHTML = `<img alt=""><div><div class="n"></div><div class="last">${laps.length ? fmt(laps[laps.length - 1]) : '—'}</div><div class="hist">${laps.slice(0, -1).reverse().slice(0, 12).map(fmt).join(' ')}</div></div>`;
    el.querySelector('img').src = p.thumb || 'icon.svg';
    el.querySelector('.n').textContent = `${p.name}・${laps.length}周`;
    box.append(el);
  }
  $('darkInfo').textContent = `${list.length}人・${total}周`;
}
$('darkBtn').onclick = () => $('dark').classList.remove('hide');
$('dark').onclick = () => $('dark').classList.add('hide');
$('stopLive').onclick = async () => {
  if (!L.rec || L.rec.state === 'inactive') return;
  if (!confirm('撮影を止めますか？')) return;
  $('stopLive').disabled = true;
  clearInterval(L.timer);
  const v = $('vLive'), W = v.videoWidth, H = v.videoHeight, dur = (performance.now() - L.t0) / 1000;
  await new Promise(r => { L.rec.onstop = r; L.rec.stop(); });
  try { L.wake?.release(); } catch {}
  const ext = (L.type || 'webm').includes('mp4') ? 'mp4' : 'webm';
  const d = new Date(), name = `スケート_${d.getMonth() + 1}月${d.getDate()}日_${d.getHours()}時${String(d.getMinutes()).padStart(2, '0')}分.${ext}`;
  S.recBlob = new Blob(L.chunks, { type: L.type || 'video/webm' }); L.chunks = [];
  const file = new File([S.recBlob], name, { type: S.recBlob.type });
  L.rec = null; stopCamera(); $('stopLive').disabled = false;
  try { await setVideo(file); } catch (e) { toast('撮った動画を開けませんでした'); }
  const vd = $('vWork').duration;
  const s = buildSession(L.tracker.finish(), W, H, isFinite(vd) && vd > 0 ? vd : dur, L.tiles, L.persons.map(p => p.tracks), L.motion);
  // その場で付けた名前（A・B…）を引きつぐ
  for (const lp of L.persons) { const sp = s.persons.find(x => x.tracks.includes(lp.tracks[0])); if (sp) sp.name = lp.name; }
  s.live = true; s.title = name.replace(/\.\w+$/, '');
  await saveSession(s); S.session = s; S.live = false;
  showResult();
};
$('saveRec').onclick = () => {
  if (!S.recBlob) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(S.recBlob); a.download = S.videoFile.name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast('保存しました（ダウンロードを確かめてください）');
};
$('deepScan').onclick = async () => {
  if (!S.session) return;
  if (!confirm('撮った動画を最初から解析し直します（数分かかります）。新しい記録として追加されます。')) return;
  S.line = S.session.line; S.live = false;
  S.lineK = await lineKOf(S.session); S.lineImg = S.session.lineImg;
  $('startScan').onclick();
};

// ---------- はじめ ----------
showHome();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
