// スケートラップ：画面と記録
import * as stand from './stand.js';
import * as share from './share.js';
import { loadMembers, saveMembers, matchMember, addMember, addSample, priorityOf } from './members.js';
import { grabGray, LineAnchor, MotionChain, apply, inv3, mul3, homFrom4 } from './motion.js';
import { loadDetector, usedDelegate, scanVideo, seekTo, findRedLine, trackCrossings, refineCrossing, interpBox, groupTracks, Tracker, detectFrame, grabSmall, liveCrossing, lineMetric, footMetric, LineTracker, findWallStripe, lineFromStripe, histSim, headSim, normHist } from './vision.js';

const $ = id => document.getElementById(id);
const S = { session: null, videoURL: null, videoFile: null, person: null, line: null, live: false, stream: null, recBlob: null };

// ---------- 小さな道具 ----------
function go(id) { document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === id)); window.scrollTo(0, 0); if (id !== 'sPerson') stopPlayer(); if (id !== 'sLine' && id !== 'sLive') stopCamera(); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if (b.dataset.go === 'sPerson') openPerson(S.person); else if (b.dataset.go === 'sResult') showResult(); else { go(b.dataset.go); if (b.dataset.go === 'sHome') showHome(); } });
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
function showMembers() {
  const list = loadMembers().sort((a, b) => priorityOf(a) - priorityOf(b)), box = $('memList');
  $('memEmpty').classList.toggle('hide', list.length > 0);
  box.innerHTML = '';
  list.forEach((m, i) => {
    const el = document.createElement('div'); el.className = 'mem';
    el.innerHTML = `<img alt=""><div class="t"><b></b><br><span>${m.kind === 'me' ? '自分' : '部員'}・覚えた回数 ${m.samples.length}</span></div><button aria-label="上へ">↑</button><button aria-label="消す">🗑</button>`;
    el.querySelector('img').src = m.thumb || 'icon.svg'; el.querySelector('b').textContent = m.name;
    const [up, del] = el.querySelectorAll('button');
    up.disabled = i === 0;
    up.onclick = () => { const all = loadMembers(), me = all.find(x => x.id === m.id), prev = all.find(x => x.id === list[i - 1].id); [me.order, prev.order] = [prev.order, me.order]; if (me.kind !== prev.kind) [me.kind, prev.kind] = [prev.kind, me.kind]; saveMembers(all); showMembers(); };
    del.onclick = () => { if (confirm(`${m.name} の登録を消しますか？`)) { saveMembers(loadMembers().filter(x => x.id !== m.id)); showMembers(); } };
    box.append(el);
  });
}
async function showHome() {
  showMembers();
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
  const v = $('vWork');
  const ready = new Promise((res, rej) => {
    v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('この動画は開けませんでした'));
    setTimeout(() => rej(new Error('動画を読みこめませんでした（時間切れ）。もう一度選んでください')), 20000);
  });
  for (const x of [$('vScan'), $('vPlay'), $('vThumb'), v]) { x.preload = 'auto'; x.src = S.videoURL; try { x.load(); } catch {} }
  await ready;
  if (!v.videoWidth) await new Promise(r => { v.onloadeddata = r; setTimeout(r, 3000); });
}
$('file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  toast('動画を読みこんでいます…');
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
  $('standCard').classList.toggle('hide', !S.live); $('shareCard').classList.toggle('hide', !S.live);
  $('menuText').value = lsGet('skate-menu', ''); $('teamPass').value = lsGet('skate-team', ''); $('menuList').value = lsGet('skate-menulist', ''); $('optShare').checked = lsGet('skate-share', 0) === 1;
  $('optFine').checked = lsGet('skate-fine', 1) === 1;
  if (!S.live) {
    // カメラが動く動画では、前に合わせた線の位置は使えない。壁の赤い帯（ゴールラインの目印）が写る場面を自動で探す
    await seekTo(v, 0.5); S.line = null;
    const found = await findLineScene(v);
    if (found) { S.line = found.line; $('lineTime').value = Math.round(found.t / v.duration * 1000); toast('ゴールの目印（壁の赤い帯）が写る場面を選びました。線を確かめてください'); }
    else { await seekTo(v, 0.5); toast('ゴールラインが写る場面を下の帯で選び、線を合わせてください'); }
  }
  if (!S.line) S.line = autoLine(v) || lsGet('skate-line', null) || [[0.5, 0.6], [0.5, 0.95]];
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
// 線の候補：壁の赤い帯があれば、その真下の氷の上に引く。なければ氷の上の赤い線を探す
function autoLine(v) {
  const st = findWallStripe(v, v.videoWidth, v.videoHeight);
  return st ? lineFromStripe(st) : findRedLine(v, v.videoWidth, v.videoHeight);
}
// 壁の赤い帯が、画面のまん中あたりに写っている場面を探す（0.5秒ごと・最初の60秒まで）
async function findLineScene(v) {
  let best = null;
  for (let t = 0.5; t < Math.min(v.duration, 60); t += 0.5) {
    if (!$('sLine').classList.contains('on')) return null;
    await seekTo(v, t);
    const st = findWallStripe(v, v.videoWidth, v.videoHeight);
    if (!st) continue;
    const sc = st.sum * (1 - Math.abs(st.x - 0.5) * 1.6);
    if (st.x > 0.2 && st.x < 0.8 && (!best || sc > best.sc)) best = { t, st, sc };
    if (best && t - best.t > 4) break; // 最初に見えたひとかたまりの中で、いちばんよい場面
  }
  if (!best) return null;
  await seekTo(v, best.t);
  return { t: best.t, line: lineFromStripe(best.st) };
}
$('lineAuto').onclick = () => { const v = lineSrc(); const l = autoLine(v); if (l) { S.line = l; drawLine(); toast('線の候補を引きました。ずれていたら丸を動かしてください'); } else toast('赤い線が見つかりません。丸を動かしてください'); };
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
  const fine = $('optFine').checked; lsSet('skate-fine', fine ? 1 : 0);
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
      tiles, anchor, step: fine ? 0.05 : 0.1,
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
  const map = new Map(), rows = (s.motion || []).filter(r => r.length >= 26); // 古い形の記録は使わない
  for (const r of rows) map.set(Math.round(r[0] * 1000), r);
  const W = s.W, H = s.H;
  const hkOf = r => r && r[10] ? r.slice(11, 20) : null;
  // そのコマでの線：赤い線で合わせ直した線（なければ K に重ねて計算した線）
  const lineOf = r => r && r[20] ? [[r[21], r[22]], [r[23], r[24]]] : null;
  const near = (t, tol) => { // 近い時刻のコマ（二分探索）
    if (!rows.length) return null;
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) lo = m; else hi = m; }
    const r = Math.abs(rows[lo][0] - t) <= Math.abs(rows[hi][0] - t) ? rows[lo] : rows[hi];
    return Math.abs(r[0] - t) <= tol ? r : null;
  };
  const exactRow = t => map.get(Math.round(t * 1000)) || near(t, 0.002);
  if (!rows.length) return { exact: () => s.line, near: () => s.line, Hk: () => null, toK: () => [1, 0, 0, 0, 1, 0, 0, 0, 1], measure: (t, x1, y2, x2) => lineMetric(s.line, W, H, x1, y2, x2) };
  return {
    exact: t => lineOf(exactRow(t)),
    toK: t => hkOf(exactRow(t)),
    near: (t, tol = 0.2) => lineOf(near(t, tol)),
    Hk: t => hkOf(near(t, 0.6)),
    // 足もととラインの符号つき距離。赤い線で合わせ直せたコマはその線で、だめなら K に置き直して比べる
    measure: (t, x1, y2, x2) => {
      const r = exactRow(t); if (!r) return null;
      if (r[25]) return lineMetric(lineOf(r), W, H, x1, y2, x2);
      const Hk = hkOf(r); return Hk ? footMetric(s.line, W, H, Hk, x1, y2, x2) : null;
    },
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
  // 1行：[時刻, いま→基準(9), K に重なったか, いま→K(9), 線が分かったか, 線(4), 赤い線で合わせ直したか]
  const Z9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  // 線のコマに重ねられなかったコマ：すぐ後（1秒以内）に重なったコマから、カメラの動いた分だけ戻して求める
  if (motion) for (let i = motion.length - 2, src = -1; i >= 0; i--) {
    const m = motion[i], nx = motion[i + 1];
    if (m[2]) { if (!m.filled) src = i; continue; }
    if (!nx[2] || src < 0 || motion[src][0] - m[0] > 0.5) continue;
    m[2] = mul3(nx[2], mul3(inv3(nx[1]), m[1])); m.filled = true;
    const Hi = inv3(m[2]); m[3] = line.map(q => apply(Hi, q[0], q[1])); m[4] = false;
  }
  const mrows = (motion || []).map(([t, T, Hk, ln, sn]) => [r5(t), ...T.map(r5), Hk ? 1 : 0, ...(Hk ? Hk.map(r5) : Z9), ln ? 1 : 0, ...(ln ? ln.flat().map(r5) : [0, 0, 0, 0]), sn ? 1 : 0]);
  const measure = makeLineAt({ line, motion: mrows, W, H }).measure;
  // 短すぎる切れはし（見まちがい）は外す。ただしラインを越えたものは残す
  const tracks = [], crossings = [];
  for (const tr of rawTracks) {
    const cr = trackCrossings(tr, measure);
    const dur = tr.s[tr.s.length - 1][0] - tr.s[0][0];
    if (!cr.length && (tr.s.length < 4 || dur < 0.5)) continue;
    crossings.push(...cr);
    tracks.push({ id: tr.id, mv: moveRate(tr), s: tr.s.map(r => r.map(x => Math.round(x * 10000) / 10000)), hist: Array.from(tr.hist), hn: tr.hn, thumbArea: tr.thumbArea, thumb: tr.thumb ? tr.thumb.toDataURL('image/jpeg', 0.8) : null });
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
    minLap: lsGet('skate-minlap2', 6), tracks, crossings, persons: groups.map(ids => ({ id: 'p' + ids[0], name: '', tracks: ids })),
  };
  // 名前の仮番号：ラインを越えた回数が多い順
  topPersons(s).forEach((p, i) => p.name = `選手${i + 1}`);
  s.persons.forEach(p => { if (!p.name) p.name = ''; });
  applyMembers(s);
  autoChain(s);
  return s;
}

// ---------- 登録した部員を見つけて名前を付ける ----------
function personHist(s, p) {
  let out = null, n = 0;
  for (const id of p.tracks) {
    const t = trackById(s, id); if (!t || !t.hn || !t.hist) continue;
    if (!out) out = new Float32Array(t.hist.length);
    for (let i = 0; i < out.length; i++) out[i] += t.hist[i]; n += t.hn;
  }
  if (!out || !n) return null;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}
function spansOverlap(s, a, b) {
  const sp = p => p.tracks.map(id => trackById(s, id)).filter(Boolean).map(t => [t.s[0][0], t.s[t.s.length - 1][0]]);
  return sp(a).some(x => sp(b).some(y => Math.min(x[1], y[1]) - Math.max(x[0], y[0]) > 0.2));
}
function applyMembers(s) {
  const members = loadMembers(); if (!members.length) return;
  const byMember = new Map();
  for (const p of s.persons) {
    const m = matchMember(personHist(s, p), members); if (!m) continue;
    const prev = byMember.get(m.member.id);
    if (prev && !spansOverlap(s, prev, p)) { prev.tracks.push(...p.tracks); p.tracks = []; continue; } // 分かれていた同じ人をまとめる
    if (prev) continue; // 同じ時に2人いる：似ているだけの別の人
    p.member = m.member.id; p.name = m.member.name; byMember.set(m.member.id, p);
  }
  s.persons = s.persons.filter(p => p.tracks.length);
}

// ---------- 1人を通しでつなぐ ----------
// 切れはし（追いかけが切れた所で分かれた部分）を「動きの続き方」と「服・ヘルメットの色」で、
// 動画全体として一番筋が通るようにつなぐ（一本道の最適化）。人の山に隠れた間は 3 秒までつなぐ。
const GAP_MAX = 3.0, LONG_GAP = 8.0;
function fragInfo(s) {
  const rows = (s.motion || []).filter(r => r.length >= 26), map = new Map();
  for (const r of rows) map.set(Math.round(r[0] * 1000), r);
  const toRef = (t, x, y) => { const r = map.get(Math.round(t * 1000)); return r ? apply(r.slice(1, 10), x, y) : [x, y]; };
  return s.tracks.filter(t => t.s.length >= 3 && t.hn).map(t => {
    const a = t.s[0], b = t.s[t.s.length - 1], c = t.s[Math.max(0, t.s.length - 4)], d = t.s[Math.min(3, t.s.length - 1)];
    const ref = r => toRef(r[0], (r[1] + r[3]) / 2, r[4]);
    const ra = ref(a), rb = ref(b), rc = ref(c), rd = ref(d);
    const vEnd = b[0] > c[0] ? [(rb[0] - rc[0]) / (b[0] - c[0]), (rb[1] - rc[1]) / (b[0] - c[0])] : [0, 0];
    const vStart = d[0] > a[0] ? [(rd[0] - ra[0]) / (d[0] - a[0]), (rd[1] - ra[1]) / (d[0] - a[0])] : [0, 0];
    const hist = Float32Array.from(t.hist, v => v / t.hn);
    return { id: t.id, t0: a[0], t1: b[0], ra, rb, vEnd, vStart, h: ((a[4] - a[2]) + (b[4] - b[2])) / 2, hist, n: t.hn };
  }).sort((x, y) => x.t0 - y.t0);
}
function looks(hist, model) { return (histSim(hist, model) * 3 + headSim(hist, model) * 2) / 5; }
function chainFrom(s, seedId, model, exclude = new Set()) {
  const F = fragInfo(s).filter(f => f.id === seedId || !exclude.has(f.id)), si = F.findIndex(f => f.id === seedId); if (si < 0) return null;
  const A = s.W / s.H;
  const w = F.map(f => { const v = looks(f.hist, model); return (f.t1 - f.t0 + 0.1) * Math.max(-2, (v - 0.86) * 12); });
  const lk = F.map(f => looks(f.hist, model));
  const link = (i, j) => { // i のあとに j が続く時の、つながりの悪さ（つながらなければ null）
    const a = F[i], b = F[j], gap = b.t0 - a.t1;
    if (gap < -0.3 || gap > LONG_GAP) return null;
    const g = Math.max(0, gap);
    if (g > GAP_MAX) { // 長く見えなかった後：色がとてもよく合う時だけ。場所はゆるく（向きと速さが変わるので）
      if (lk[j] < 0.92) return null;
      const d = Math.hypot((a.rb[0] - b.ra[0]) * A, a.rb[1] - b.ra[1]) / Math.max(a.h, b.h, 0.02);
      if (d > 4 + g * 3) return null;
      return 1.5 + g * 0.3 + d * 0.1;
    }
    const p = [a.rb[0] + a.vEnd[0] * g, a.rb[1] + a.vEnd[1] * g];
    const d = Math.hypot((p[0] - b.ra[0]) * A, p[1] - b.ra[1]) / Math.max(a.h, b.h, 0.02);
    if (d > 1.5 + g * 1.5) return null;
    return d * 0.6 + g * 0.4;
  };
  // 前へ
  const fw = new Array(F.length).fill(-Infinity), fp = new Array(F.length).fill(-1); fw[si] = w[si];
  for (let j = si + 1; j < F.length; j++) for (let i = si; i < j; i++) {
    if (fw[i] === -Infinity) continue; const c = link(i, j); if (c == null) continue;
    const v = fw[i] + w[j] - c; if (v > fw[j]) { fw[j] = v; fp[j] = i; }
  }
  // 後ろへ
  const bw = new Array(F.length).fill(-Infinity), bp = new Array(F.length).fill(-1); bw[si] = w[si];
  for (let j = si - 1; j >= 0; j--) for (let i = si; i > j; i--) {
    if (bw[i] === -Infinity) continue; const c = link(j, i); if (c == null) continue;
    const v = bw[i] + w[j] - c; if (v > bw[j]) { bw[j] = v; bp[j] = i; }
  }
  let fe = si; for (let j = si; j < F.length; j++) if (fw[j] > fw[fe]) fe = j;
  let be = si; for (let j = 0; j <= si; j++) if (bw[j] > bw[be]) be = j;
  const ids = [];
  for (let j = fe; j !== -1 && j !== si; j = fp[j]) ids.push(F[j].id);
  ids.push(F[si].id);
  for (let j = be; j !== -1 && j !== si; j = bp[j]) ids.push(F[j].id);
  return ids;
}
// person を、いちばん長い切れはしから通しにする。ほかの人に入っていた切れはしは移す
function makeChain(s, person, model) {
  const own = person.tracks.map(id => trackById(s, id)).filter(t => t && t.hn);
  if (!own.length) return false;
  const seed = own.sort((a, b) => (b.s[b.s.length - 1][0] - b.s[0][0]) - (a.s[a.s.length - 1][0] - a.s[0][0]))[0];
  if (!model) { model = Float32Array.from(seed.hist, v => v / seed.hn); }
  const exclude = new Set(s.persons.filter(q => q !== person && q.chain).flatMap(q => q.tracks)); // ほかの通しの人の分は取らない
  const ids = chainFrom(s, seed.id, model, exclude); if (!ids) return false;
  const set = new Set(ids);
  for (const q of s.persons) if (q !== person) q.tracks = q.tracks.filter(id => !set.has(id));
  person.tracks = [...new Set([...ids, ...person.tracks.filter(id => {
    // もとの切れはしのうち、通しの道と時間が重なるものは外す（別の人の可能性）
    const t = trackById(s, id); if (!t || set.has(id)) return false;
    return !ids.some(j => { const u = trackById(s, j); return Math.min(u.s[u.s.length - 1][0], t.s[t.s.length - 1][0]) - Math.max(u.s[0][0], t.s[0][0]) > 0.3; });
  })])];
  person.chain = true;
  s.persons = s.persons.filter(q => q.tracks.length);
  return true;
}
// 解析のあと自動で：カメラがいちばん長く追っていた人と、登録した部員を通しにする
function autoChain(s) {
  const members = loadMembers();
  for (const p of s.persons.filter(p => p.member)) {
    const m = members.find(x => x.id === p.member);
    let model = null;
    if (m && m.samples.length) { model = new Float32Array(m.samples[0].length); for (const smp of m.samples) for (let i = 0; i < model.length; i++) model[i] += smp[i] / m.samples.length; }
    follow(s, p, { model });
  }
  const top = topPersons(s)[0];
  if (top && !top.follow) follow(s, top, { fromCenter: true }); // カメラが追っていた人：まずまん中だけで選び、その色を覚えて選び直す
  topPersons(s).forEach((p, i) => { if (!p.member) p.name = `選手${i + 1}`; });
}

// ---------- 1コマごとに「この人はどの枠か」を選んで通しにする ----------
// まん中に近い（カメラが追っている）・前のコマから動きが続く・色が続く、の3つで、動画全体として一番筋が通る選び方（ビタビ）。
// 本人がタップした「これが自分」（pins）と「これは違う」（bans）を必ず守る。結果は「通しの枠」1本として記録に入れる。
function followPath(s, { model, pins = [], bans = [] }) {
  const A = s.W / s.H, LOOK = 3.0, MISS = 1.5; // 見失ってよいのは3秒まで。見失い1秒あたりの重さ 1.5
  const hist = new Map(s.tracks.filter(t => t.hn && !t.virtual).map(t => [t.id, Float32Array.from(t.hist, v => v / t.hn)]));
  const banned = (id, t) => bans.some(b => b.tr === id && (b.all || Math.abs(b.t - t) < 0.6));
  const byT = new Map();
  // カメラの動きを差し引いた位置（基準の座標）と、そこでの速さ・向き。「この速さなら次はここ」の予想に使う
  const Tmap = new Map(); for (const m of (s.motion || [])) if (m.length >= 10) Tmap.set(Math.round(m[0] * 1000), m);
  // 答え合わせで選んだ値：速さからの予想は「予想から背の高さ2倍より離れた枠へは移らない」という決まりとして使う
  // ov：同じ時刻に別々に写っていた枠（＝別の人）へ移る時の重さ。8 にすると乗っ取りが 19回→3回（本人の動画）
  const FP = Object.assign({ wp: 0, wv: 0, wi: 0.3, cw: 2, sw: 0.5, gate: 2, ov: 8 }, globalThis.__FP || {});
  // 同じ時刻に別々に写っていた2つの切れはしは、別の人
  const span = new Map(s.tracks.filter(t => !t.virtual && t.s.length).map(t => [t.id, [t.s[0][0], t.s[t.s.length - 1][0]]]));
  const OVc = new Map(), together = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!OVc.has(k)) { const x = span.get(a), y = span.get(b); OVc.set(k, Math.min(x[1], y[1]) - Math.max(x[0], y[0])); } return OVc.get(k); };
  for (const t of s.tracks) {
    if (!hist.has(t.id)) continue;
    // 各コマの「そのコマ→基準」と、その逆。位置や速さは基準の座標には直さず、いつも「そのコマの座標」で持つ
    const Tm = t.s.map(r => { const m = Tmap.get(Math.round(r[0] * 1000)); return m ? m.slice(1, 10) : null; }), Ti = Tm.map(T => T ? inv3(T) : null);
    const foot = r => [(r[1] + r[3]) / 2, r[4]];
    const into = (n, a) => { const f = foot(t.s[a]); return Tm[a] && Ti[n] ? apply(mul3(Ti[n], Tm[a]), f[0], f[1]) : f; }; // コマ a の足もとを、コマ n の座標で
    t.s.forEach((r, n) => {
      if (banned(t.id, r[0])) return;
      // 前後 0.3 秒の動きから速さ（1秒あたり・コマ n の座標で）
      let a = n, b = n; while (a > 0 && r[0] - t.s[a - 1][0] <= 0.3) a--; while (b < t.s.length - 1 && t.s[b + 1][0] - r[0] <= 0.3) b++;
      const dtv = t.s[b][0] - t.s[a][0], pa = into(n, a), pb = into(n, b);
      let vx = dtv > 0.05 ? (pb[0] - pa[0]) / dtv : 0, vy = dtv > 0.05 ? (pb[1] - pa[1]) / dtv : 0;
      const hasV = dtv > 0.05 && isFinite(vx) && isFinite(vy); if (!hasV) vx = vy = 0;
      const k = Math.round(r[0] * 1000); if (!byT.has(k)) byT.set(k, []);
      byT.get(k).push({ tr: t.id, t: r[0], cx: (r[1] + r[3]) / 2, y2: r[4], h: r[4] - r[2], r, vx, vy, hasV, T: Tm[n], Ti: Ti[n] });
    });
  }
  const times = [...byT.keys()].sort((a, b) => a - b); if (!times.length) return null;
  const fr = times.map(k => byT.get(k));
  // コマの間かく（細かい解析なら 0.05 秒）。1コマの点数は時間に合わせる（細かくしても全体のつり合いが変わらないように）
  const gaps = []; for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 1000);
  gaps.sort((a, b) => a - b); const stepT = gaps.length ? gaps[gaps.length >> 1] : 0.1, wS = stepT / 0.1;
  // 「これが自分」のコマは、その枠だけにする
  for (const pn of pins) {
    let i = 0, bd = Infinity; fr.forEach((cs, k) => { const d = Math.abs(cs[0].t - pn.t); if (d < bd) { bd = d; i = k; } });
    const keep = fr[i].filter(c => c.tr === pn.tr); if (keep.length) fr[i] = keep;
  }
  const pinTr = new Set(pins.map(p => p.tr));
  const PLc = new Map(), PL = (a, b) => { if (a === b) return 1; const k = a < b ? a + ',' + b : b + ',' + a; if (!PLc.has(k)) PLc.set(k, looks(hist.get(a), hist.get(b))); return PLc.get(k); };
  let path = null;
  for (let it = 0; it < 3; it++) {
    // まん中に近い（×2）＋ この人らしい色（×6）。この人らしい人がいないコマは、だれも選ばない（-0.6）
    const em = fr.map(cs => cs.map(c => wS * ((model ? FP.cw : 2) * (1 - Math.abs(c.cx - 0.5) * 2.2) + (model ? 6 * (looks(hist.get(c.tr), model) - 0.88) - 0.6 : 0) + (pinTr.has(c.tr) ? 1.5 : 0))));
    const best = em.map(r => r.slice()), back = fr.map(cs => cs.map(() => null));
    const forced = new Set(); for (const pn of pins) fr.forEach((cs, k) => { if (cs.length === 1 && cs[0].tr === pn.tr && Math.abs(cs[0].t - pn.t) < 0.06) forced.add(k); });
    for (let i = 1; i < fr.length; i++) for (let j = 0; j < fr[i].length; j++) {
      const q = fr[i][j];
      for (let k = i - 1; k >= 0 && q.t - fr[k][0].t <= LOOK; k--) {
        // 「これが自分」のコマは飛ばせない
        let jumpsPin = false; for (const f of forced) if (f > k && f < i) { jumpsPin = true; break; }
        if (jumpsPin) continue;
        const dt = q.t - fr[k][0].t, skip = Math.max(0, dt - stepT * 1.5);
        for (let m = 0; m < fr[k].length; m++) {
          const p = fr[k][m]; let cost;
          if (p.tr === q.tr) cost = skip * MISS;
          else {
            // 別の枠へ移る：遠すぎる時だけ禁止し、あとは距離と色の違いを少しずつ重く見る（厳しすぎると正しい枠へ移れない）
            const hh = Math.max(p.h, q.h, 0.03);
            const d = Math.hypot((p.cx - q.cx) * A, p.y2 - q.y2) / hh;
            if (d > 4 + dt * 2) continue;
            // 速さから予想した位置とのずれ（背の高さの何倍か）と、速さ・向きの変わり方（1秒あたり背の高さの何倍か）
            // p の「予想した位置」と速さを、q のコマの座標に写してから比べる
            let dp = d, dv = 1;
            if (p.hasV && p.T && q.Ti) {
              const R = mul3(q.Ti, p.T), e0 = apply(R, p.cx, p.y2), e1 = apply(R, p.cx + p.vx * 0.1, p.y2 + p.vy * 0.1);
              const pvx = (e1[0] - e0[0]) / 0.1, pvy = (e1[1] - e0[1]) / 0.1;
              const v1 = Math.hypot((e0[0] + pvx * dt - q.cx) * A, e0[1] + pvy * dt - q.y2) / hh;
              if (isFinite(v1)) { dp = v1; if (q.hasV) dv = Math.min(4, Math.hypot((pvx - q.vx) * A, pvy - q.vy) / hh); }
            }
            if (p.hasV && dp > FP.gate * (1 + dt)) continue; // 人は瞬間移動しない：予想から離れすぎた枠へは移らない
            const pl = PL(p.tr, q.tr);
            cost = FP.sw + (together(p.tr, q.tr) > 0.25 ? FP.ov : 0) + d * FP.wi + dp * FP.wp + dv * FP.wv + Math.max(0, 0.92 - pl) * 4 + skip * MISS;
          }
          const v = best[k][m] - cost + em[i][j];
          if (v > best[i][j]) { best[i][j] = v; back[i][j] = [k, m]; }
        }
      }
      if (forced.has(i)) { /* 前のどこからもつながらなくても、ここから始められる */ }
    }
    // 終わり：「これが自分」のコマをすべて通る道の中で一番よいもの
    let bi = -1, bj = 0, bv = -Infinity;
    const lastPin = forced.size ? Math.max(...forced) : -1;
    for (let i = Math.max(0, lastPin); i < fr.length; i++) for (let j = 0; j < fr[i].length; j++) if (best[i][j] > bv) { bv = best[i][j]; bi = i; bj = j; }
    if (bi < 0) return null;
    path = []; for (let cur = [bi, bj]; cur; cur = back[cur[0]][cur[1]]) path.unshift(fr[cur[0]][cur[1]]);
    if (!model || it > 0) { // 通しの道の色の平均を「この人らしさ」にして、もう一度
      const m = new Float32Array(93); for (const c of path) { const h = hist.get(c.tr); for (let k = 0; k < 93; k++) m[k] += h[k] / path.length; }
      model = m;
    }
  }
  return { path, model };
}
function follow(s, person, { model = null, pins = person.pins || [], bans = person.bans || [], fromCenter = false }) {
  if (!model && person.model) model = Float32Array.from(person.model);
  if (!model && !fromCenter) { // この人のいちばん長い切れはしの色から始める
    const own = person.tracks.map(id => trackById(s, id)).filter(t => t && t.hn && !t.virtual).sort((a, b) => b.s.length - a.s.length)[0];
    if (own) model = Float32Array.from(own.hist, v => v / own.hn);
  }
  const r = followPath(s, { model, pins, bans }); if (!r) return false;
  // 前の「通しの枠」を消して、新しく作る
  const vid = 'v' + person.id;
  s.tracks = s.tracks.filter(t => t.id !== vid); s.crossings = s.crossings.filter(c => c.track !== vid);
  const rows = r.path.map(c => c.r);
  const src = new Map(); for (const c of r.path) src.set(c.tr, (src.get(c.tr) || 0) + 1);
  const main = [...src.entries()].sort((a, b) => b[1] - a[1])[0][0], mt = trackById(s, main);
  const vt = { id: vid, virtual: true, s: rows, from: r.path.map(c => [c.t, c.tr]), hist: Array.from(r.model), hn: 1, thumb: mt && mt.thumb, thumbArea: mt ? mt.thumbArea : 0, mv: mt ? mt.mv : 1 };
  s.tracks.push(vt);
  const measure = makeLineAt(s).measure;
  s.crossings.push(...trackCrossings(vt, measure));
  // 追いかけが外れていた周：線の所で拾えた通過（だれのものでも）の中から、この人のものを選んで埋める
  const mine = s.crossings.filter(c => c.track === vid && c.dir === s.dir).map(c => c.t);
  for (const a of missedCrossings(s, mine)) s.crossings.push({ t: a.t, dir: s.dir, track: vid, refined: true, est: true });
  person.tracks = [vid]; person.follow = true; person.chain = true; person.pins = pins; person.bans = bans;
  person.model = Array.from(r.model, x => Math.round(x * 1e4) / 1e4);
  return true;
}

// ---------- ラップの計算 ----------
// 線を通る「ひとかたまり」（集団の通過）のうち、この人の通過が入っていないものを探し、
// その中から、画面のまん中にいちばん近い人（カメラが追っていた人）で、周の長さがいちばん自然な通過を選ぶ
function missedCrossings(s, mine) {
  const ev = s.crossings.filter(c => !String(c.track).startsWith('v') && c.dir === s.dir).sort((a, b) => a.t - b.t);
  if (!ev.length) return [];
  const groups = []; for (const e of ev) { const g = groups[groups.length - 1]; if (g && e.t - g[g.length - 1].t < 3) g.push(e); else groups.push([e]); }
  const have = mine.slice().sort((a, b) => a - b);
  // 1周の長さの目安：となり合う通過の間かくのうち、短い方から（見のがしで2倍・3倍になったものを除く）
  const gaps = []; for (let i = 1; i < have.length; i++) gaps.push(have[i] - have[i - 1]); gaps.sort((a, b) => a - b);
  const lap = gaps.length ? gaps[Math.floor((gaps.length - 1) * 0.25)] : null;
  const out = [];
  for (const g of groups) {
    const t0 = g[0].t, t1 = g[g.length - 1].t;
    if (have.some(t => t > t0 - 1 && t < t1 + 1)) continue;
    let best = null;
    for (const e of g) {
      const tr = trackById(s, e.track); if (!tr) continue;
      const r = tr.s.reduce((a, x) => Math.abs(x[0] - e.t) < Math.abs(a[0] - e.t) ? x : a);
      let sc = -Math.abs((r[1] + r[3]) / 2 - 0.5) * 2;
      if (lap) { // 前後の通過から数えて、周の長さの整数倍に近いほどよい
        const near = have.reduce((a, t) => a == null || Math.abs(t - e.t) < Math.abs(a - e.t) ? t : a, null);
        if (near != null) { const k = Math.max(1, Math.round(Math.abs(e.t - near) / lap)); sc -= Math.min(1, Math.abs(Math.abs(e.t - near) - k * lap) / 1.0); }
      }
      if (!best || sc > best.sc) best = { t: e.t, sc };
    }
    if (best) out.push(best);
  }
  return out;
}
function personCrossings(s, p) {
  const set = new Set(p.tracks);
  const cs = s.crossings.filter(c => set.has(c.track) && c.dir === s.dir).sort((a, b) => a.t - b.t);
  const out = [];
  for (const c of cs) if (!out.length || c.t - out[out.length - 1].t >= s.minLap) out.push(c);
  return out;
}
function laps(s, p) {
  const cs = personCrossings(s, p), L = [];
  for (let i = 1; i < cs.length; i++) L.push({ n: i, lap: cs[i].t - cs[i - 1].t, total: cs[i].t - cs[0].t, at: cs[i].t, from: cs[i - 1].t, refined: cs[i].refined && cs[i - 1].refined, est: !!(cs[i].est || cs[i - 1].est) });
  return { cs, L };
}
const trackById = (s, id) => s.tracks.find(t => t.id === id);
function personThumb(s, p) {
  let best = null; for (const id of p.tracks) { const t = trackById(s, id); if (t && t.thumb && (!best || t.thumbArea > best.thumbArea)) best = t; }
  return best ? best.thumb : 'icon.svg';
}
function personTime(s, p) { return p.tracks.reduce((a, id) => { const t = trackById(s, id); return a + (t ? t.s[t.s.length - 1][0] - t.s[0][0] : 0); }, 0); }
// 滑っている速さ（自分の背の高さの何倍/秒）。立っている人は小さい。カメラの動きは差し引いた座標（r）で測る
function moveRate(tr) {
  if (tr.spd && tr.spd.length) { const v = tr.spd.slice().sort((x, y) => x - y); return Math.round(v[v.length >> 1] * 100) / 100; }
  const r = tr.s, v = [];
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i], dt = b[0] - a[0], h = (b[4] - b[2]) || 1e-3;
    if (dt > 0 && dt < 0.5) v.push(Math.hypot((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2, (a[2] + a[4]) / 2 - (b[2] + b[4]) / 2) / h / dt);
  }
  if (!v.length) return 0;
  v.sort((x, y) => x - y); return Math.round(v[v.length >> 1] * 100) / 100;
}
// 「まん中に長く写っていた」度合い（カメラが追いかけていた人ほど大きい）。立ち止まっている人は小さく数える
function personFocus(s, p) {
  let f = 0;
  for (const id of p.tracks) {
    const t = trackById(s, id); if (!t) continue;
    const w = t.mv == null ? 1 : Math.min(1, Math.max(0.1, (t.mv - 0.3) / 1.0));
    for (let i = 1; i < t.s.length; i++) {
      const r = t.s[i], dt = Math.min(0.3, r[0] - t.s[i - 1][0]), cx = (r[1] + r[3]) / 2;
      f += dt * w * Math.max(0.1, 1 - Math.abs(cx - 0.5) * 2);
    }
  }
  return f;
}
// 一覧に出す人：まん中に長く写っていた人（上位）と、ラインを越えた人。まん中に長く写っていた順
function topPersons(s) {
  const all = s.persons.map(p => ({ p, n: personCrossings(s, p).length, f: personFocus(s, p) })).sort((a, b) => b.f - a.f);
  const fmax = all.length ? all[0].f : 0;
  return all.filter((x, i) => x.n > 0 || (i < 6 && x.f >= Math.max(1, fmax * 0.15))).map(x => x.p);
}
const countMain = s => topPersons(s).length;

// ---------- 選手一覧 ----------
function showResult() {
  const s = S.session; if (!s) return go('sHome');
  go('sResult');
  const d = new Date(s.date);
  $('resTitle').innerHTML = `選手一覧<small></small>`; $('resTitle').querySelector('small').textContent = `${d.getMonth() + 1}/${d.getDate()}・${s.videoName}`;
  renderPast($('resSets'), s.liveSets || []);
  $('needVideo').classList.toggle('hide', !!S.videoURL);
  $('recSave').classList.toggle('hide', !(S.recBlob && S.session.live && S.session.videoName === S.videoFile?.name));
  $('minLap').value = s.minLap;
  const main = topPersons(s), mainSet = new Set(main);
  const others = s.persons.filter(p => !mainSet.has(p)).sort((a, b) => personTime(s, b) - personTime(s, a)).slice(0, 60);
  fillFaces($('faces'), s, main, p => openPerson(p));
  fillFaces($('facesOther'), s, others, p => openPerson(p));
  if (!main.length) $('faces').innerHTML = '<p class="note">人が見つかりませんでした。</p>';
}
function fillFaces(box, s, list, onTap) {
  box.innerHTML = '';
  for (const p of list) {
    const el = document.createElement('button'); el.className = 'face';
    const n = Math.max(0, personCrossings(s, p).length - 1);
    el.innerHTML = `<img alt=""><b></b>${n ? `<span class="laps">${n}周</span>` : ''}${p.member ? '<span class="star">部員</span>' : ''}`;
    el.querySelector('img').src = personThumb(s, p);
    el.querySelector('b').textContent = p.name || '（名前なし）';
    el.onclick = () => onTap(p);
    box.append(el);
  }
}
$('minLap').onchange = async e => { const s = S.session; s.minLap = Math.max(3, +e.target.value || 6); lsSet('skate-minlap2', s.minLap); await saveSession(s); showResult(); };

// ---------- 選手の画面 ----------
const P = { mode: 'chase', shape: 'h', zoom: 'tv', rate: 1, path: null, raf: 0, refining: false, check: null };
const playCv = $('playCv'), playCx = playCv.getContext('2d');
function openPerson(p) {
  S.person = p; go('sPerson'); P.lineAt = null; P.map = null;
  P.zoom = p.zoom || autoZoom(S.session, p);
  $('zoomSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === P.zoom));
  $('shapeSeg').classList.toggle('hide', P.mode !== 'chase' || P.zoom === 'wide'); if (P.mode === 'map') setTimeout(prepMap);
  $('pName').textContent = p.name || '（名前なし）';
  P.path = buildPath(S.session, p);
  renderLaps(); renderScenes(); renderFollow();
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
    const ctx = { line: s.line, K: await lineKOf(s), HkNear: la.Hk, lineNear: t => la.near(t, 0.5), measure: la.measure, tiles: s.tiles };
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
  // 1周の目安（短い方の4分の1の所）。その2倍・3倍に近いラップは、通過の見のがしの疑い
  const sorted = L.map(x => x.lap).sort((a, b) => a - b), base = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const multi = x => { const k = Math.round(x.lap / base); return k >= 2 && Math.abs(x.lap / k - base) < base * 0.18 ? k : 0; };
  tb.innerHTML = '<tr><th>周</th><th>ラップ</th><th>合計</th></tr>';
  for (const x of L) {
    const tr = document.createElement('tr'); tr.className = 'tap';
    tr.innerHTML = `<td>${x.n}</td><td class="${x.lap === best && L.length > 1 ? 'best' : ''}">${fmt(x.lap)}${x.refined ? '' : '<span class="pill">見直し前</span>'}${x.est ? '<span class="pill">推定</span>' : ''}${multi(x) ? `<span class="pill" style="background:var(--red);color:#fff">${multi(x)}周分？</span>` : ''}</td><td>${fmt(x.total)}</td>`;
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
// ---------- 通しの確認（2秒ごとの写真）と、タップで直す ----------
let followTok = 0;
async function renderFollow() {
  const s = S.session, p = S.person, card = $('followCard'), box = $('followStrip');
  const vt = p && p.follow ? trackById(s, 'v' + p.id) : null;
  card.classList.toggle('hide', !vt || !S.videoURL); box.innerHTML = '';
  if (!vt || !S.videoURL) return;
  const tok = ++followTok, v = $('vThumb'), W = s.W, H = s.H; // 見直し（vWork）とぶつからないよう別の動画で
  for (let T = 0; T < s.duration; T += 2) {
    if (tok !== followTok) return;
    let r = null; for (const x of vt.s) if (Math.abs(x[0] - T) < 0.4 && (!r || Math.abs(x[0] - T) < Math.abs(r[0] - T))) r = x;
    const el = document.createElement('div'); el.className = 'scene';
    const cv = document.createElement('canvas'); cv.width = 84; cv.height = 112; cv.style.borderRadius = '10px'; cv.style.display = 'block';
    const c = cv.getContext('2d'); c.fillStyle = '#132f50'; c.fillRect(0, 0, 84, 112);
    el.append(cv); const lb = document.createElement('span'); lb.textContent = clock(T) + (r ? '' : ' 見失い'); el.append(lb);
    el.onclick = () => openPick(r ? r[0] : T, r);
    box.append(el);
    const mt = await seekTo(v, r ? r[0] : T);
    if (tok !== followTok) return;
    if (r) {
      const bh = (r[4] - r[2]) * H * 1.9, bw = bh * 84 / 112, cx = (r[1] + r[3]) / 2 * W, cy = (r[2] + r[4]) / 2 * H;
      c.drawImage(v, cx - bw / 2, cy - bh / 2, bw, bh, 0, 0, 84, 112);
    } else { c.globalAlpha = 0.5; c.drawImage(v, 0, 0, W, H, 0, 28, 84, 84 * H / W); c.globalAlpha = 1; }
  }
}
const pick = { t: 0, cands: [], cur: null };
async function openPick(t, cur) {
  const s = S.session, v = $('vThumb'); followTok++; // 写真づくりを止める
  // そのコマに写っている全員の枠
  let ft = t, bd = Infinity;
  for (const tr of s.tracks) if (!tr.virtual) for (const r of tr.s) { const d = Math.abs(r[0] - t); if (d < bd) { bd = d; ft = r[0]; } }
  pick.t = ft; pick.cur = cur; pick.cands = [];
  for (const tr of s.tracks) if (!tr.virtual) for (const r of tr.s) if (Math.abs(r[0] - ft) < 0.002) pick.cands.push({ tr: tr.id, r });
  await seekTo(v, ft);
  const cv = $('pickCv'), c = cv.getContext('2d'); cv.width = 960; cv.height = Math.round(960 * s.H / s.W);
  c.drawImage(v, 0, 0, cv.width, cv.height);
  for (const k of pick.cands) {
    const r = k.r, isCur = cur && Math.abs(cur[1] - r[1]) < 1e-4 && Math.abs(cur[2] - r[2]) < 1e-4;
    c.strokeStyle = isCur ? '#ffe14d' : '#3fb4ff'; c.lineWidth = isCur ? 6 : 4;
    c.strokeRect(r[1] * cv.width, r[2] * cv.height, (r[3] - r[1]) * cv.width, (r[4] - r[2]) * cv.height);
  }
  $('pickTitle').textContent = `${clock(ft)} の場面：本人の枠をタップ（黄色がいまの選び方）`;
  $('pickDlg').showModal();
}
$('pickCv').addEventListener('click', async e => {
  const cv = $('pickCv'), rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height;
  const hit = pick.cands.filter(k => x >= k.r[1] && x <= k.r[3] && y >= k.r[2] && y <= k.r[4]).sort((a, b) => (a.r[3] - a.r[1]) * (a.r[4] - a.r[2]) - (b.r[3] - b.r[1]) * (b.r[4] - b.r[2]))[0];
  if (!hit) return toast('枠の中をタップしてください');
  const p = S.person; p.pins = (p.pins || []).filter(q => Math.abs(q.t - pick.t) > 0.3); p.pins.push({ t: pick.t, tr: hit.tr });
  p.bans = (p.bans || []).filter(b => b.tr !== hit.tr);
  await refollow('つなぎ直しました');
});
$('pickNone').onclick = async () => {
  const p = S.person, cur = pick.cur && pick.cands.find(k => Math.abs(k.r[1] - pick.cur[1]) < 1e-4 && Math.abs(k.r[2] - pick.cur[2]) < 1e-4);
  if (cur) { p.bans = p.bans || []; p.bans.push({ t: pick.t, tr: cur.tr }); p.pins = (p.pins || []).filter(q => q.tr !== cur.tr || Math.abs(q.t - pick.t) > 0.6); }
  await refollow('この場面を外しました');
};
$('pickCancel').onclick = () => $('pickDlg').close();
async function refollow(msg) {
  $('pickDlg').close();
  const s = S.session, p = S.person;
  if (!follow(s, p, {})) return toast('つなげませんでした');
  await saveSession(s); toast(msg); openPerson(p);
}
$('chainBtn').onclick = async () => {
  const s = S.session, p = S.person;
  if (!follow(s, p, {})) return toast('つなげませんでした');
  await saveSession(s); toast('通しでつなぎました。下の写真で確かめてください'); openPerson(p);
};
$('regBtn').onclick = () => {
  const s = S.session, p = S.person, h = personHist(s, p);
  if (!h || h.length !== 93) return toast('この記録は古い形なので登録できません。動画を解析し直してください');
  const box = $('regExisting'); box.innerHTML = '';
  for (const m of loadMembers().sort((a, b) => priorityOf(a) - priorityOf(b))) {
    const b = document.createElement('button'); b.className = 'mem'; b.style.width = '100%';
    b.innerHTML = '<img alt=""><div class="t" style="text-align:left"><b></b><br><span>この人に追加して覚える</span></div>';
    b.querySelector('img').src = m.thumb || 'icon.svg'; b.querySelector('b').textContent = m.name;
    b.onclick = async () => { addSample(m.id, h, personThumb(s, p)); p.member = m.id; p.name = m.name; await saveSession(s); $('regDlg').close(); toast(`${m.name} として覚えました`); openPerson(p); };
    box.append(b);
  }
  $('regName').value = /^選手\d+$/.test(p.name) ? '' : p.name;
  $('regDlg').showModal();
};
$('regKind').querySelectorAll('button').forEach(b => b.onclick = () => $('regKind').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)));
$('regNew').onclick = async () => {
  const name = $('regName').value.trim(); if (!name) return toast('名前を入れてください');
  const kind = $('regKind').querySelector('.on').dataset.v;
  const s = S.session, p = S.person, m = addMember({ name, kind, hist: personHist(s, p), thumb: personThumb(s, p) });
  p.member = m.id; p.name = name; await saveSession(s); $('regDlg').close(); toast(`${name} を登録しました`); openPerson(p);
};
$('regCancel').onclick = () => $('regDlg').close();
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
  const segs = [], bridge = p.chain ? GAP_MAX + 0.2 : 0.4; // 通しの人は、隠れた間もつなぐ
  let cur = null;
  for (const r of all) {
    if (!cur || r[0] - cur.last > bridge) { cur = { s: [], last: r[0] }; segs.push(cur); }
    cur.s.push(r); cur.last = r[0];
  }
  return {
    all, segs: segs.map(g => {
      const a = Math.max(0, g.s[0][0] - 0.15), b = Math.min(s.duration, g.last + 0.15), n = Math.max(1, Math.ceil((b - a) / STEP));
      const cx = new Float32Array(n), cy = new Float32Array(n), h = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = a + i * STEP, bx = interpBox(g.s, Math.min(Math.max(t, g.s[0][0]), g.last), bridge + 0.1) || boxOf(g.s[0]);
        cx[i] = (bx.x1 + bx.x2) / 2; cy[i] = (bx.y1 + bx.y2) / 2; h[i] = bx.y2 - bx.y1;
      }
      // 中継：カメラの動きはゆっくり（中心 0.7秒・高さ 0.9秒）、寄り具合はもっとゆっくり（2.5秒）
      return { a, b, cx: smooth(cx, 0.25 / STEP), cy: smooth(cy, 0.3 / STEP), h: smooth(h, 0.7 / STEP),
        tcx: smooth(cx, 0.7 / STEP), tcy: smooth(cy, 0.9 / STEP), th: smooth(h, 2.5 / STEP) };
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
  // 中継：背の6倍の広さ（その人と周りのコース）を、なめらかに保つ。寄る：背の2.4倍
  const tv = P.zoom === 'tv', hh = tv ? g.th[i] : g.h[i], gx = tv ? g.tcx[i] : g.cx[i], gy = tv ? g.tcy[i] : g.cy[i];
  let ch = Math.min(1, Math.max(0.2, hh * (tv ? 6 : 2.4))), cw = ch * H * outAsp / W;
  if (cw > 1) { ch /= cw; cw = 1; }
  const x = Math.min(1 - cw, Math.max(0, gx - cw / 2)), y = Math.min(1 - ch, Math.max(0, gy - ch / 2));
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
  // 画角「そのまま」：切り抜かず、動画全体にこの人の枠と名前を出す（コース上の位置が見えるように）
  const wideChase = P.mode === 'chase' && P.zoom === 'wide' && !P.check;
  const chase = P.mode === 'chase' && P.zoom !== 'wide' && !P.check;
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
    if (P.zoom === 'tv') { // 中継は周りの人も映るので、この人に枠を付ける
      const b = interpBox(P.path.all, t, S.person && S.person.chain ? 3.3 : 1.0);
      if (b) {
        const X = x => (x - crop.x) / crop.w * ow, Y = y => (y - crop.y) / crop.h * oh;
        c.strokeStyle = '#ffe14d'; c.lineWidth = Math.max(3, ow / 260); c.strokeRect(X(b.x1), Y(b.y1), X(b.x2) - X(b.x1), Y(b.y2) - Y(b.y1));
      }
    }
  } else {
    c.drawImage(v, 0, 0, ow, oh);
    const sx = ow, sy = oh;
    c.lineWidth = Math.max(2, ow / 400); c.strokeStyle = '#ff3b4f';
    const ln = (P.lineAt || (P.lineAt = makeLineAt(s))).near(t);
    if (ln) { c.beginPath(); c.moveTo(ln[0][0] * sx, ln[0][1] * sy); c.lineTo(ln[1][0] * sx, ln[1][1] * sy); c.stroke(); }
    const b = interpBox(P.path.all, t, S.person && S.person.chain ? 3.3 : 1.0);
    if (b) {
      c.strokeStyle = wideChase ? '#ffe14d' : '#3fb4ff'; c.lineWidth = Math.max(3, ow / (wideChase ? 220 : 300)); c.strokeRect(b.x1 * sx, b.y1 * sy, (b.x2 - b.x1) * sx, (b.y2 - b.y1) * sy);
      if (wideChase && S.person.name) label(c, S.person.name, (b.x1 + b.x2) / 2 * sx, Math.max(ow / 40, b.y1 * sy - ow / 40), 'center', Math.round(ow / 40));
      c.fillStyle = '#ffe14d'; c.beginPath(); c.arc((b.x1 + b.x2) / 2 * sx, b.y2 * sy, Math.max(4, ow / 160), 0, 7); c.fill();
    }
  }
  if (P.mode === 'map') drawMap(t);
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
segBtns('modeSeg', 'mode', () => { $('shapeSeg').classList.toggle('hide', P.mode !== 'chase' || P.zoom === 'wide'); $('zoomRow').classList.toggle('hide', P.mode !== 'chase'); $('mapBox').classList.toggle('hide', P.mode !== 'map'); if (P.mode === 'map') prepMap(); });
segBtns('shapeSeg', 'shape');
segBtns('zoomSeg', 'zoom', () => { $('shapeSeg').classList.toggle('hide', P.mode !== 'chase' || P.zoom === 'wide'); if (S.person) { S.person.zoom = P.zoom; saveSession(S.session); } });
// 画角の最初の設定：いつも「中継」（本人の希望：練習の動画全体で、ちょうどいい画角を保つ）
function autoZoom() { return 'tv'; }
segBtns('rateSeg', 'rate', () => { $('vPlay').playbackRate = P.rate; });
async function checkCrossing(t) {
  if (!S.videoURL) return toast('動画を選ぶと確かめられます');
  const v = $('vPlay'); v.pause();
  await seekTo(v, Math.max(0, t - 1.2));
  P.check = { end: t + 0.8 }; v.playbackRate = 0.25; v.play();
  $('playStage').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- マップ（上から見た図）----------
// 線を合わせたコマ（K）の上で、氷の上の四角の4つの角を決めておき、K → 上から見た図 の変換を作る。
// 選手の足もとを、各コマ → K → 上から見た図 と置きかえて点にする。
const MAP_COLORS = ['#3fb4ff', '#3ee08f', '#ff8a3d', '#c77dff', '#ff5fa2', '#4dd9e8', '#b5e550', '#f2f2f2'];
function mapRect(cal) { const w = cal.w || 1, h = cal.h || (cal.w ? cal.w * 0.5 : 0.5); return [[0, 0], [w, 0], [w, h], [0, h]]; }
function prepMap() {
  const s = S.session; if (!s) return;
  if (!s.mapCal) {
    const last = lsGet('skate-mapcal', null);
    if (last) { s.mapCal = last; saveSession(s); } else { $('mapNote').textContent = 'はじめに「マップの設定」で、氷の上の四角の4つの角を合わせてください。'; P.map = null; return; }
  }
  const cal = s.mapCal, Hm = homFrom4(cal.quad, mapRect(cal)); if (!Hm) return;
  const la = makeLineAt(s), persons = topPersons(s).slice(0, MAP_COLORS.length);
  if (!persons.includes(S.person)) persons.unshift(S.person);
  const paths = persons.map((p, i) => {
    const pts = [];
    for (const id of p.tracks) { const tr = trackById(s, id); if (!tr) continue;
      for (const r of tr.s) { const Hk = la.toK(r[0]); if (!Hk) continue;
        const k = apply(Hk, (r[1] + r[3]) / 2, r[4]), m = apply(Hm, k[0], k[1]); pts.push([r[0], m[0], m[1]]); } }
    pts.sort((a, b) => a[0] - b[0]);
    return { p, pts, color: p === S.person ? '#ffe14d' : MAP_COLORS[i % MAP_COLORS.length] };
  });
  const line = s.line.map(q => apply(Hm, q[0], q[1]));
  P.map = { cal, paths, line, rect: mapRect(cal) };
  $('mapNote').textContent = '上から見た図です。点が選手（黄色がこの人）、赤い線がゴールのライン。ラインの場面に重なる向きの時だけ出ます。';
}
function mapAt(pts, t) {
  if (!pts.length) return null;
  let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  if (t < a[0] - 0.3 || t > b[0] + 0.3) return null;
  if (b[0] - a[0] > 0.8 || t <= a[0]) return Math.abs(t - a[0]) < 0.3 ? a : (Math.abs(t - b[0]) < 0.3 ? b : null);
  const f = (t - a[0]) / (b[0] - a[0]); return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function drawMap(t) {
  const cv = $('mapCv'), c = cv.getContext('2d'), M = P.map;
  const Wc = 720; if (!M) { cv.width = Wc; cv.height = 200; c.fillStyle = '#0b2240'; c.fillRect(0, 0, Wc, 200); return; }
  const [w, h] = M.rect[2], pad = Math.max(w, h) * 0.35;
  const x0 = -pad, x1 = w + pad, y0 = -pad, y1 = h + pad, sc = Wc / (x1 - x0), Hc = Math.round((y1 - y0) * sc);
  if (cv.width !== Wc || cv.height !== Hc) { cv.width = Wc; cv.height = Hc; }
  const X = x => (x - x0) * sc, Y = y => (y - y0) * sc;
  c.fillStyle = '#0b2240'; c.fillRect(0, 0, Wc, Hc);
  c.fillStyle = '#dfeefa'; c.globalAlpha = 0.12; c.fillRect(X(0), Y(0), w * sc, h * sc); c.globalAlpha = 1;
  c.strokeStyle = '#9fc0df'; c.lineWidth = 2; c.strokeRect(X(0), Y(0), w * sc, h * sc);
  if (M.cal.w) { // 5m ごとの目盛り
    c.strokeStyle = 'rgb(159 192 223 / .18)'; c.lineWidth = 1;
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), Hc); c.stroke(); }
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) { c.beginPath(); c.moveTo(0, Y(y)); c.lineTo(Wc, Y(y)); c.stroke(); }
    c.fillStyle = '#9fc0df'; c.font = '20px sans-serif'; c.textAlign = 'left'; c.fillText('マス＝5m', 10, Hc - 10);
  }
  c.strokeStyle = '#ff3b4f'; c.lineWidth = 4; c.beginPath(); c.moveTo(X(M.line[0][0]), Y(M.line[0][1])); c.lineTo(X(M.line[1][0]), Y(M.line[1][1])); c.stroke();
  c.textAlign = 'center'; c.font = '800 22px sans-serif';
  for (const pa of M.paths) {
    // 3秒分の通った跡
    c.strokeStyle = pa.color; c.globalAlpha = 0.45; c.lineWidth = 3; c.beginPath(); let first = true;
    for (const q of pa.pts) { if (q[0] < t - 3 || q[0] > t) continue; if (first) { c.moveTo(X(q[1]), Y(q[2])); first = false; } else c.lineTo(X(q[1]), Y(q[2])); }
    c.stroke(); c.globalAlpha = 1;
    const q = mapAt(pa.pts, t); if (!q) continue;
    const me = pa.p === S.person, r = me ? 13 : 9;
    c.fillStyle = pa.color; c.beginPath(); c.arc(X(q[1]), Y(q[2]), r, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.fillText(pa.p.name || '', X(q[1]), Y(q[2]) - r - 6);
  }
}
// マップの設定画面
const ms = { quad: null, img: null, drag: -1 };
$('mapSetBtn').onclick = async () => {
  const s = S.session; if (!s || !s.lineImg) return toast('この記録にはラインの場面がありません');
  ms.img = new Image(); ms.img.src = s.lineImg; await ms.img.decode();
  const cal = s.mapCal || lsGet('skate-mapcal', null);
  ms.quad = cal ? cal.quad.map(q => q.slice()) : [[0.3, 0.55], [0.7, 0.55], [0.85, 0.85], [0.15, 0.85]];
  $('mapW').value = cal && cal.w ? cal.w : ''; $('mapH').value = cal && cal.h ? cal.h : '';
  const cv = $('mapSetCv'); cv.width = ms.img.naturalWidth; cv.height = ms.img.naturalHeight;
  stopPlayer(); document.querySelectorAll('.scr').forEach(x => x.classList.toggle('on', x.id === 'sMapSet')); window.scrollTo(0, 0);
  drawMapSet();
};
function drawMapSet() {
  const cv = $('mapSetCv'), c = cv.getContext('2d'), W = cv.width, H = cv.height, q = ms.quad;
  c.drawImage(ms.img, 0, 0, W, H);
  c.fillStyle = 'rgb(63 180 255 / .2)'; c.strokeStyle = '#3fb4ff'; c.lineWidth = Math.max(2, W / 300);
  c.beginPath(); q.forEach((p, i) => i ? c.lineTo(p[0] * W, p[1] * H) : c.moveTo(p[0] * W, p[1] * H)); c.closePath(); c.fill(); c.stroke();
  const ln = S.session.line; c.strokeStyle = '#ff3b4f'; c.beginPath(); c.moveTo(ln[0][0] * W, ln[0][1] * H); c.lineTo(ln[1][0] * W, ln[1][1] * H); c.stroke();
  const r = Math.max(10, W / 45); c.font = `800 ${Math.round(r * 1.1)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  q.forEach((p, i) => { c.fillStyle = 'rgb(255 225 77 / .85)'; c.beginPath(); c.arc(p[0] * W, p[1] * H, r, 0, 7); c.fill(); c.fillStyle = '#0b2240'; c.fillText('①②③④'[i], p[0] * W, p[1] * H); });
}
{
  const cv = $('mapSetCv'), pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  cv.addEventListener('pointerdown', e => {
    const p = pos(e), r = cv.getBoundingClientRect(), asp = r.width / r.height;
    const d = ms.quad.map(q => Math.hypot((q[0] - p[0]) * asp, q[1] - p[1])), i = d.indexOf(Math.min(...d));
    if (d[i] > 0.12) return; ms.drag = i; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => { if (ms.drag < 0) return; const p = pos(e); ms.quad[ms.drag] = [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]; drawMapSet(); });
  cv.addEventListener('pointerup', () => ms.drag = -1);
}
$('mapSave').onclick = async () => {
  const w = parseFloat($('mapW').value) || null, h = parseFloat($('mapH').value) || null;
  const cal = { quad: ms.quad, w, h: w ? h : null };
  if (!homFrom4(cal.quad, mapRect(cal))) return toast('4つの丸の位置を確かめてください');
  S.session.mapCal = cal; lsSet('skate-mapcal', cal); await saveSession(S.session);
  toast('マップを作りました'); openPerson(S.person);
  $('modeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'map')); P.mode = 'map';
  $('mapBox').classList.remove('hide'); $('shapeSeg').classList.add('hide'); prepMap();
};

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

$('standBtn').onclick = async () => {
  try {
    const name = await stand.connect(() => { $('standState').textContent = '台が切れました'; });
    $('standState').textContent = `${name} につながりました`; toast('台につながりました');
  } catch (e) { if (e.name !== 'NotFoundError') toast(e.message || '台につなげませんでした'); }
};
// 撮影中、どの人に向けるかを決める：登録した部員（自分→部員の順）。いなければ、さっきまでの人を少し待つ
function pickTarget(t) {
  const members = loadMembers(); if (!members.length) return null;
  let best = null;
  for (const tr of L.tracker.active) {
    const last = tr.s[tr.s.length - 1]; if (t - last[0] > 0.25) continue;
    if (!tr.memberT || t - tr.memberT > 1) { // 1秒に1回だけ見分け直す
      tr.memberT = t;
      const m = tr.hn >= 3 ? matchMember(normHist(tr.hist, tr.hn), members) : null;
      if (m) tr.member = m.member; else if (tr.hn > 15) tr.member = null;
    }
    if (!tr.member) continue;
    const pr = priorityOf(tr.member), size = last[4] - last[2];
    if (!best || pr < best.pr || (pr === best.pr && size > best.size)) best = { tr, pr, size };
  }
  if (best) { L.target = { id: best.tr.id, t }; }
  else if (L.target && t - L.target.t < 1) { const tr = L.tracker.active.find(x => x.id === L.target.id); if (tr) best = { tr }; }
  if (!best) return null;
  const last = best.tr.s[best.tr.s.length - 1];
  return { tr: best.tr, name: best.tr.member ? best.tr.member.name : '', x: (last[1] + last[3]) / 2, box: last, vx: best.tr.vx };
}

const L = { sets: [], list: [], rec: null, chunks: [], t0: 0, tracker: null, persons: [], byTrack: new Map(), crossings: [], lastDet: 0, timer: 0, tiles: 1, newId: null };
async function startLive() {
  if ($('optShare').checked && $('teamPass').value.trim().length < 4) return toast('チームの合い言葉を4文字以上で入れてください');
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
  L.lt = new LineTracker(new LineAnchor(grabGray(v, W, H), S.line.map(p => p.slice()))); L.chain = new MotionChain(); L.motion = []; L.meas = new Map();
  const measure = (t, x1, y2, x2) => { const m = L.meas.get(Math.round(t * 1000)); if (!m) return null; return m.sn ? lineMetric(m.line, W, H, x1, y2, x2) : footMetric(S.line, W, H, m.Hk, x1, y2, x2); };
  L.minLap = lsGet('skate-minlap2', 6); L.tiles = lsGet('skate-tiles', 1);
  // ほかのスマホに出す（名前・練習メニュー・ラップの数字だけ）
  L.menu = $('menuText').value.trim(); lsSet('skate-menu', L.menu);
  lsSet('skate-menulist', $('menuList').value); L.list = menuLines($('menuList').value); L.sets = [];
  $('liveSets').innerHTML = ''; setBtn($('liveSetBtn'), L.list, -1); lsSet('skate-share', $('optShare').checked ? 1 : 0);
  $('shareLive').classList.toggle('hide', !$('optShare').checked); L.share = null;
  L.team = null; L.recId = crypto.randomUUID(); L.dirty = false; L.day = Date.now();
  if ($('optShare').checked) {
    const pass = $('teamPass').value.trim(); lsSet('skate-team', pass); teamUI();
    const code = L.team = await share.teamKey(pass); $('shareCode').textContent = '「' + pass + '」'; $('shareState').textContent = 'つないでいます…';
    share.host(code, liveState, st => { $('shareState').textContent = st; }, i => armSet(i)).then(h => { L.share = h; }).catch(e => { $('shareState').textContent = e.message; });
  }
  await new Promise(r => { L.rec.onstart = r; L.rec.start(1000); });
  L.t0 = performance.now();
  $('liveInfo').textContent = 'ラインを越えた人がここに出ます';
  L.saveTm = setInterval(() => { if (L.dirty) saveLive(); }, 60000);
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
        const P = grabGray(v, W, H), T = L.chain.step(P, dets), loc = L.lt.step(t, P, T, dets);
        L.motion.push([t, T, loc.Hk, loc.line, loc.snapped]);
        if (loc.snapped || loc.Hk) L.meas.set(Math.round(t * 1000), { sn: loc.snapped, line: loc.line, Hk: loc.Hk });
        L.tracker.update(t, dets, v, T);
        for (const tr of L.tracker.active) { const c = liveCrossing(tr, measure); if (c) onLiveCross(c, tr); }
        const tg = pickTarget(t);
        stand.setSpeed(stand.aimSpeed(tg));
        if ($('dark').classList.contains('hide')) {
          cx.clearRect(0, 0, W, H); cx.lineWidth = Math.max(3, W / 300); cx.strokeStyle = '#ff3b4f';
          const ln = loc ? loc.line : null;
          if (ln) { cx.beginPath(); cx.moveTo(ln[0][0] * W, ln[0][1] * H); cx.lineTo(ln[1][0] * W, ln[1][1] * H); cx.stroke(); }
          cx.strokeStyle = '#3fb4ff'; cx.lineWidth = Math.max(2, W / 500);
          for (const d of dets) cx.strokeRect(d.x1 * W, d.y1 * H, (d.x2 - d.x1) * W, (d.y2 - d.y1) * H);
          if (tg) drawAim(cx, W, H, tg);
        }
      }
    }
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(step); else requestAnimationFrame(t => step(t));
  };
  if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(step); else requestAnimationFrame(t => step(t));
}
// 追いかける人に黄色い枠と名前。まん中から外れていたら、向ける方向に矢印
function drawAim(cx, W, H, tg) {
  const b = tg.box, lw = Math.max(4, W / 200);
  cx.strokeStyle = '#ffe14d'; cx.lineWidth = lw; cx.strokeRect(b[1] * W, b[2] * H, (b[3] - b[1]) * W, (b[4] - b[2]) * H);
  const fs = Math.round(W / 30); cx.font = `800 ${fs}px sans-serif`; cx.fillStyle = '#ffe14d'; cx.textAlign = 'center';
  if (tg.name) cx.fillText(tg.name, (b[1] + b[3]) / 2 * W, b[2] * H - fs * 0.4);
  const ex = tg.x - 0.5;
  if (Math.abs(ex) > 0.15 && !stand.connected()) {
    const dir = ex > 0 ? 1 : -1, cxp = W / 2 + dir * W * 0.3, cy = H * 0.12, a = W / 18;
    cx.fillStyle = 'rgb(255 225 77 / .9)'; cx.beginPath();
    cx.moveTo(cxp + dir * a, cy); cx.lineTo(cxp - dir * a * 0.2, cy - a * 0.7); cx.lineTo(cxp - dir * a * 0.2, cy + a * 0.7); cx.closePath(); cx.fill();
    cx.fillText(dir > 0 ? '右に向けて' : '左に向けて', W / 2, cy + fs * 0.35);
  }
}
// 前向き＝いちばん多い通過の向き
const liveDir = () => { const p = L.crossings.filter(c => c.dir > 0).length; return p >= L.crossings.length - p ? 1 : -1; };
const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
// 練習でない通過（歩いて横切る・ゆっくり流している人）を見分けるための速さの境目。
// 速い方から4分の1あたりの速さの 35% より遅い通過は数えない（通過が6回たまってから）
function liveSlow() {
  const d = liveDir(), v = L.crossings.filter(c => c.dir === d && c.v > 0).map(c => c.v).sort((x, y) => y - x);
  return v.length >= 6 ? v[Math.floor(v.length / 4)] * 0.35 : 0;
}
const liveOk = (c, d, slow) => c.dir === d && !(c.v > 0 && c.v < slow);
// みんなのふつうの1周（その人のラップがまだ無い時の予想に使う）
function liveTypical() { const a = []; for (const p of L.persons) a.push(...liveLaps(p)); return a.length ? median(a) : 0; }
// ---------- 練習メニュー（1本ごとにラップを分ける） ----------
const menuLines = txt => String(txt || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60);
// メニューの1行から、予定の周の数と指定タイムを読み取る（読めない時は 0）。111.12m のリンクとして数える
function menuInfo(list, i) {
  const s = list[i] || '', nx = list.slice(i + 1, i + 4).find(x => /指定/.test(x)) || ''; let exp = 0, tgt = 0; // 指定は少し下の行に書かれることがある
  const m = s.match(/(\d{3,4})\s*m/);
  if (m) exp = Math.round(+m[1] / 111.12 * 2) / 2;
  else { const ls = [...s.matchAll(/(\d+(?:\.\d+)?)\s*L(?![a-zA-Z])/g)];
    if (ls.length) exp = ls.reduce((a, x) => a + +x[1], 0);
    else { const d = s.match(/(\d)-(\d)(?:-(\d))?/); if (d) exp = +d[1] + +d[2] + +(d[3] || 0); } }
  const g = (s.match(/^\s*([ABC])(?![A-Za-z])/) || [])[1];
  const src = s + ' ' + (/指定/.test(nx) ? nx : '');
  const a = g && src.match(new RegExp(g + '\\s*Last\\s*lap\\s*指定\\s*(\\d{1,2}\\.\\d)', 'i'));
  const nums = a ? [a[1]] : [...src.matchAll(/(?:指定|[(（])\s*(\d{1,2}\.\d)(?!\s*L)/g)].map(x => x[1]);
  if (nums.length) { const x = +nums[0]; tgt = x < 5 ? 10 + x : x < 60 ? x : 0; } // 「0.7」は10.7秒、「2.5」は12.5秒の略（本人に確認 2026-11-12）。9.8 はそのまま
  return { exp, tgt };
}
function setWin(k) { // k 番目の「本」の時間のはんい。メニューを使っていない時は全部
  if (k == null) k = L.sets.length - 1;
  if (k < 0 || !L.sets.length) return [-1e9, 1e9];
  return [L.sets[k].t, k + 1 < L.sets.length ? L.sets[k + 1].t : 1e9];
}
function armSet(i) {
  if (!L.rec || !L.list || !(i >= 0 && i < L.list.length)) return;
  const t = (performance.now() - L.t0) / 1000, last = L.sets[L.sets.length - 1];
  // まちがえてタップした時：まだだれも通っていなければ、前のタップを取り消して入れかえる
  if (last && !L.crossings.some(c => c.t >= last.t)) L.sets.pop();
  L.sets.push({ i, name: L.list[i], t, ...menuInfo(L.list, i) });
  for (const p of L.persons) p.sentK = -1;
  L.newId = null; renderLiveCards(); if (L.share) L.share.full(); saveLive();
  toast('「' + L.list[i] + '」のラップを記録します');
}
// 記録をネットに残す（名前・練習メニュー・ラップの数字だけ）。メニューを切りかえた時・1分ごと（変わった時だけ）・止めた時
async function saveLive() {
  if (!L.team) return;
  const sets = (L.sets.length ? L.sets.map((_, k) => setSummary(k)) : [setSummary(-1)]).filter(x => x.persons.length);
  if (!sets.length) return;
  const d = new Date(L.day), title = L.menu || `${d.getMonth() + 1}月${d.getDate()}日の練習`;
  L.dirty = false;
  try { await share.saveRecord(L.team, L.recId, title, { at: L.day, menu: L.menu || '', sets }); } catch (e) { L.dirty = true; }
}
function setSummary(k) {
  const st = L.sets[k];
  return { name: st ? st.name : '', exp: st ? st.exp : 0, tgt: st ? st.tgt : 0,
    persons: L.persons.map(p => ({ name: p.name, laps: liveLaps(p, k).map(x => Math.round(x * 100) / 100), last: Math.round(p.cs[p.cs.length - 1].t * 10) / 10 })).filter(p => p.laps.length) };
}
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const diffHtml = (lap, tgt) => tgt ? `<small class="diff">指定${tgt.toFixed(1)} ${lap - tgt >= 0 ? '+' : '−'}${Math.abs(lap - tgt).toFixed(2)}</small>` : '';
const cntText = (n, exp, done) => `${n}周` + (exp ? `／予定${exp}` + (done && n < exp - 1.5 ? ' ⚠' : '') : '');
// 終わった「本」を、新しい順に並べる
function renderPast(box, past) {
  box.innerHTML = '';
  for (const st of past.slice().reverse()) {
    if (!st.persons.length) continue;
    const el = document.createElement('div'); el.className = 'card past';
    const typ = median(st.persons.flatMap(q => q.laps));
    el.innerHTML = `<b>${esc(st.name || 'メニューなし')}</b>` + st.persons.slice().sort((a, b) => b.laps.length - a.laps.length).map(p =>
      `<div class="pr"><b>${esc(p.name)}</b> ${cntText(p.laps.length, st.exp, true)}${diffHtml(p.laps[p.laps.length - 1], st.tgt)}<br>${p.laps.map((x, i) => fmt(x) + (lapMark(p.laps, i, typ) ? '？' : '')).join(' ')}</div>`).join('');
    box.append(el);
  }
}
function setBtn(btn, list, cur, name) {
  btn.classList.toggle('hide', !(list && list.length));
  btn.textContent = cur >= 0 || name ? `今：${name || list[cur]}　▸ 切りかえる` : '▸ 始めるメニューをタップで選ぶ';
}
let setPick = null;
function openSetDlg(list, cur, pick) {
  const box = $('setList'); box.innerHTML = ''; setPick = pick;
  list.forEach((x, i) => { const b = document.createElement('button'); b.className = 'setrow' + (i === cur ? ' cur' : ''); b.textContent = x; b.onclick = () => { $('setDlg').close(); setPick && setPick(i); }; box.append(b); });
  $('setDlg').showModal(); const c = box.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
}
$('setCancel').onclick = () => $('setDlg').close();
$('liveSetBtn').onclick = () => openSetDlg(L.list, L.sets.length ? L.sets[L.sets.length - 1].i : -1, armSet);
// メニューの写真を文字にする（このスマホの中で読む。写真は送らない。読むための部品と辞書は、はじめの1回だけネットから取る）
$('menuPhoto').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const btn = $('menuPhotoBtn'), old = btn.textContent; btn.textContent = '読み取っています…（はじめは1分ほど）';
  try {
    if (!window.Tesseract) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('net')); document.head.append(sc); });
    const im = await createImageBitmap(f), k = Math.min(3, Math.max(1, 1600 / im.width)), c = document.createElement('canvas');
    c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const w = await window.Tesseract.createWorker(['jpn', 'eng']); const r = await w.recognize(c); await w.terminate();
    const txt = cleanMenu(r.data.text);
    if (!txt) toast('文字を読み取れませんでした'); else { $('menuList').value = txt; lsSet('skate-menulist', txt); toast('読み取りました。まちがいがあれば直してください'); }
  } catch (err) { toast('読み取れませんでした（はじめの1回は電波が必要です）'); }
  btn.textContent = old;
};
// 読み取った文字の後しまつ：日本語のあいだの空白を取る・準備や製氷の行は外す
function cleanMenu(t) {
  return String(t || '').split('\n').map(x => x.replace(/\s+(?=[^\x00-\x7f])|(?<=[^\x00-\x7f])\s+/g, '').replace(/\s+/g, ' ').trim())
    .filter(x => x.length >= 3 && /[0-9A-Za-z\u3040-\u30ff\u4e00-\u9fff]{2}/.test(x) && !/マット|製氷|^\W*$/.test(x)).join('\n');
}
function onLiveCross(c, tr) {
  const H = $('vLive').videoHeight || 1; c.v = c.ds && c.bh ? c.ds / (c.bh * H) : 0; // 1秒に体いくつ分進むか
  L.crossings.push(c);
  let p = L.byTrack.get(tr.id);
  if (!p) {
    // だれの通過かを決める：①服の色がどれだけ似ているか ②その人が「そろそろ来る時刻」にどれだけ近いか
    const h = normHist(tr.hist, tr.hn), typ = liveTypical(); let best = null, bv = 0;
    const busy = new Set(L.tracker.active.filter(x => x !== tr).map(x => L.byTrack.get(x.id)).filter(Boolean));
    for (const q of L.persons) {
      if (busy.has(q) || !q.cs.length) continue;
      const last = q.cs[q.cs.length - 1].t, gap = c.t - last;
      if (gap < Math.max(3, L.minLap * 0.6)) continue;
      const qh = normHist(q.hist, q.hn), sim = histSim(h, qh), hd = headSim(h, qh);
      const ql = liveLaps(q), exp = ql.length ? median(ql.slice(-3)) : typ;
      // 予想とのずれ（1周分・2周分のどちらか近い方。2周分は少し不利にする）
      let te = 1; if (exp > 0) { const k = Math.max(1, Math.min(3, Math.round(gap / exp))); te = Math.abs(gap - k * exp) / exp + (k - 1) * 0.12; }
      const due = te < 0.2;
      // 色だけで決めてよいのは、とてもよく似ている時だけ。時刻が合っていれば、色は「まあ似ている」でよい
      if (!(sim > 0.95 && hd >= 0.92) && !(due && sim > 0.82)) continue;
      const sc = sim - Math.min(te, 1) * 0.35;
      if (!best || sc > bv) { bv = sc; best = q; }
    }
    const mm = matchMember(h);
    if (!best && mm) best = L.persons.find(q => q.member === mm.member.id && !busy.has(q)) || null;
    p = best || { id: 'p' + tr.id, member: mm ? mm.member.id : null, name: mm ? mm.member.name : String.fromCharCode(65 + L.persons.length % 26) + (L.persons.length >= 26 ? Math.floor(L.persons.length / 26) : ''), tracks: [], cs: [], hist: new Float32Array(tr.hist.length), hn: 0, thumb: null };
    if (!best) L.persons.push(p);
    p.tracks.push(tr.id); L.byTrack.set(tr.id, p);
    for (let i = 0; i < tr.hist.length; i++) p.hist[i] += tr.hist[i]; p.hn += tr.hn;
  }
  if (tr.thumb) p.thumb = tr.thumb.toDataURL('image/jpeg', 0.7);
  p.cs.push(c); L.newId = p.id;
  renderLiveCards();
}
function liveLaps(p, k) {
  const d = liveDir(), slow = liveSlow(), w = setWin(k), cs = p.cs.filter(c => c.t >= w[0] && c.t < w[1] && liveOk(c, d, slow)).sort((a, b) => a.t - b.t), out = [];
  for (const c of cs) if (!out.length || c.t - out[out.length - 1].t >= L.minLap) out.push(c);
  const laps = []; for (let i = 1; i < out.length; i++) laps.push(out[i].t - out[i - 1].t);
  return laps;
}
// 2周分がつながっていそうなラップ（その人のふつうの1.7倍より長い）に印をつける
function lapMark(laps, i, typ) { const m = laps.length >= 3 ? median(laps) : typ; if (!m) return ''; const k = Math.round(laps[i] / m); return laps[i] > m * 1.7 && k >= 2 ? `<small class="multi">${k}周分？</small>` : ''; }
const lapHist = (laps, typ) => laps.map((x, i) => fmt(x) + (lapMark(laps, i, typ) ? '？' : '')).slice(0, -1).reverse().slice(0, 12).join(' ');
// ほかのスマホへ届ける中身：練習メニュー・たった時間・人ごとの名前とラップ
function liveState() {
  const n = L.sets.length, cur = n ? setSummary(n - 1) : null;
  return { menu: L.menu || '', elapsed: Math.round((performance.now() - L.t0) / 1000), newest: L.newName || '',
    list: L.list || [], cur: n ? L.sets[n - 1].i : -1, sn: n, set: cur ? cur.name : '', exp: cur ? cur.exp : 0, tgt: cur ? cur.tgt : 0,
    persons: cur ? cur.persons : setSummary(-1).persons,
    past: L.sets.slice(0, -1).map((_, k) => setSummary(k)).filter(x => x.persons.length) };
}
function lapCards(box, list, newest, info) { // list: [{name, laps, last}]。周の多い順 → 新しい順
  box.innerHTML = ''; const typ = median(list.flatMap(q => q.laps));
  for (const p of list.filter(q => q.laps.length).sort((a, b) => b.laps.length - a.laps.length || b.last - a.last)) {
    const el = document.createElement('div'); el.className = 'lcard' + (p.name === newest ? ' new' : '');
    el.innerHTML = `<div><div class="n"></div><div class="last">${p.laps.length ? fmt(p.laps[p.laps.length - 1]) + lapMark(p.laps, p.laps.length - 1, typ) : '—'}</div><div class="hist">${lapHist(p.laps, typ)}</div></div>`;
    el.querySelector('.n').textContent = `${p.name}・${cntText(p.laps.length, info && info.exp)}`;
    if (info && info.tgt) el.querySelector('.last').insertAdjacentHTML('afterend', diffHtml(p.laps[p.laps.length - 1], info.tgt));
    box.append(el);
  }
}
let watching = null;
async function openWatch() {
  const code = await share.teamKey(lsGet('skate-team', ''));
  go('sWatch'); $('watchMenu').firstChild.textContent = 'ラップ'; $('watchCards').innerHTML = ''; $('watchEmpty').classList.remove('hide'); $('watchTime').textContent = '';
  // 撮影側のデータ量を小さくするため、届くのは「全部」（見始めた時・ずれた時だけ）と「1周分」（ラップが出るたび）
  let st = null, last = 0, startAt = 0;
  const show = () => {
    $('watchMenu').firstChild.textContent = st.set || st.menu || 'ラップ';
    setBtn($('watchSetBtn'), st.list, st.cur, st.set); renderPast($('watchSets'), st.past || []);
    lsSet('skate-watch-last', { at: Date.now(), st }); $('watchLast').classList.remove('hide');
    $('watchState').textContent = `撮影中・${st.persons.filter(q => q.laps.length).length}人`;
    $('watchEmpty').classList.toggle('hide', st.persons.some(q => q.laps.length));
    lapCards($('watchCards'), st.persons, st.newest, st);
  };
  try {
    watching = await share.watch(code, {
      state: x => { last = Date.now(); st = x; startAt = Date.now() - (x.elapsed || 0) * 1000; show(); },
      lap: d => { // d: {n 名前, k その人の周の数（この通過のあと）, l いま出たラップ（最初の通過は null）, t 通過の時刻}
        last = Date.now(); if (!st || (d.s || 0) !== (st.sn || 0)) return watching.hello();
        let p = st.persons.find(q => q.name === d.n); if (!p) { p = { name: d.n, laps: [], last: 0 }; st.persons.push(p); }
        if (d.l != null) { if (p.laps.length !== d.k - 1) return watching.hello(); p.laps.push(d.l); } // 取りこぼしていたら全部もらい直す
        p.last = d.t; st.newest = d.n; show();
      },
      end: () => { $('watchState').textContent = '撮影は終わりました'; $('watchSetBtn').classList.add('hide'); },
    }, s2 => { if (!last) $('watchState').textContent = s2; });
    $('watchSetBtn').onclick = () => st && openSetDlg(st.list, st.cur, i => { if (confirm('「' + st.list[i] + '」を始めますか？')) { if (watching && watching.arm(i)) toast('撮影側に伝えました'); else toast('つながっていません'); } });
    const tm = setInterval(() => {
      if (!$('sWatch').classList.contains('on')) { clearInterval(tm); watching && watching.stop(); watching = null; return; }
      if (startAt) $('watchTime').textContent = clock((Date.now() - startAt) / 1000);
    }, 1000);
  } catch (e) { $('watchState').textContent = e.message; }
}
// ---------- チームの記録（合い言葉は最初の1回だけ） ----------
function teamUI() { const has = !!lsGet('skate-team', ''); $('teamRow').classList.toggle('hide', has); $('teamChange').classList.toggle('hide', !has); }
teamUI();
$('teamChange').onclick = () => { $('watchCode').value = lsGet('skate-team', ''); lsSet('skate-team', ''); teamUI(); };
$('watchBtn').onclick = () => {
  if (!lsGet('skate-team', '')) { const pass = $('watchCode').value.trim(); if (pass.length < 4) return toast('チームの合い言葉を4文字以上で入れてください'); lsSet('skate-team', pass); teamUI(); }
  openTeam();
};
let teamProbe = null;
async function openTeam() {
  go('sTeam'); $('teamLive').classList.add('hide'); $('teamList').innerHTML = ''; $('teamEmpty').classList.add('hide'); $('teamState').textContent = '読みこんでいます…';
  let team; try { team = await share.teamKey(lsGet('skate-team', '')); } catch (e) { $('teamState').textContent = 'このスマホでは使えません'; return; }
  // いま撮影しているスマホがあれば、上に出す
  share.watch(team, { state: st => { $('teamLive').classList.remove('hide'); $('teamLiveNote').textContent = (st.set || st.menu || 'ラップ') + '・' + st.persons.length + '人'; }, lap: () => {}, end: () => $('teamLive').classList.add('hide') }, () => {})
    .then(w => { teamProbe = w; const tm = setInterval(() => { if (!$('sTeam').classList.contains('on')) { clearInterval(tm); w.stop(); if (teamProbe === w) teamProbe = null; } }, 500); }).catch(() => {});
  try {
    const list = await share.listRecords(team);
    $('teamState').textContent = `${list.length}回分`; $('teamEmpty').classList.toggle('hide', list.length > 0);
    for (const r of list) {
      const d = new Date(r.started_at), sets = (r.data && r.data.sets) || [], names = new Set(sets.flatMap(x => x.persons.map(p => p.name)));
      const el = document.createElement('div'); el.className = 'rec';
      el.innerHTML = `<div class="t"><b></b><span>${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}・${sets.length}本・${names.size}人</span></div><button class="btn small" aria-label="消す">🗑</button>`;
      el.querySelector('b').textContent = r.title || '練習';
      el.querySelector('button').onclick = async e => { e.stopPropagation(); if (!confirm('この記録を、みんなのスマホから消しますか？')) return; try { await share.deleteRecord(team, r.id); openTeam(); } catch (err) { toast('消せませんでした'); } };
      el.onclick = () => showRecord(r);
      $('teamList').append(el);
    }
  } catch (e) { $('teamState').textContent = '読みこめませんでした（電波を確かめてください）'; }
}
$('teamLive').onclick = () => openWatch();
function showRecord(r) {
  const d = new Date(r.started_at), sets = (r.data && r.data.sets) || [];
  go('sWatch'); $('watchMenu').firstChild.textContent = r.title || '練習'; $('watchTime').textContent = '';
  $('watchState').textContent = `${d.getMonth() + 1}/${d.getDate()} の記録`; $('watchSetBtn').classList.add('hide');
  $('watchCards').innerHTML = ''; $('watchEmpty').classList.add('hide'); renderPast($('watchSets'), sets);
}
// 前に見たラップ（このスマホに残してある最後の表示）をもう一度見る
$('watchLast').classList.toggle('hide', !lsGet('skate-watch-last', null));
$('watchLast').onclick = () => {
  const sv = lsGet('skate-watch-last', null); if (!sv) return; const st = sv.st, d = new Date(sv.at);
  go('sWatch'); $('watchMenu').firstChild.textContent = st.set || st.menu || 'ラップ'; $('watchTime').textContent = '';
  $('watchState').textContent = `${d.getMonth() + 1}/${d.getDate()} に見た記録`; $('watchSetBtn').classList.add('hide');
  $('watchEmpty').classList.toggle('hide', st.persons.some(q => q.laps.length));
  lapCards($('watchCards'), st.persons, '', st); renderPast($('watchSets'), st.past || []);
};
function renderLiveCards() {
  const box = $('liveCards'); box.innerHTML = '';
  const n = L.sets.length, cs = n ? L.sets[n - 1] : null;
  setBtn($('liveSetBtn'), L.list, cs ? cs.i : -1); renderPast($('liveSets'), L.sets.slice(0, -1).map((_, k) => setSummary(k)));
  const all = L.persons.map(p => ({ p, laps: liveLaps(p), last: p.cs[p.cs.length - 1].t })).filter(x => !cs || x.last >= cs.t);
  // 1周もしていない人（横切っただけ・まだ1回目）は出さない。数だけ下に出す
  const list = all.filter(x => x.laps.length).sort((a, b) => b.laps.length - a.laps.length || b.last - a.last);
  let total = 0; const typ = liveTypical();
  for (const { p, laps } of list) {
    total += laps.length;
    const el = document.createElement('div'); el.className = 'lcard' + (p.id === L.newId ? ' new' : '');
    el.innerHTML = `<img alt=""><div><div class="n"></div><div class="last">${fmt(laps[laps.length - 1])}${lapMark(laps, laps.length - 1, typ)}</div><div class="hist">${lapHist(laps, typ)}</div></div>`;
    el.querySelector('img').src = p.thumb || 'icon.svg';
    el.querySelector('.n').textContent = `${p.name}・${cntText(laps.length, cs && cs.exp)}`;
    if (cs && cs.tgt) el.querySelector('.last').insertAdjacentHTML('afterend', diffHtml(laps[laps.length - 1], cs.tgt));
    box.append(el);
  }
  const once = all.length - list.length;
  $('liveInfo').textContent = list.length ? (once ? `ほかに${once}人が1回通過（2回目からラップが出ます）` : '') : once ? `${once}人が1回通過。2回目からラップが出ます` : 'ラインを越えた人がここに出ます';
  $('darkInfo').textContent = `${list.length}人・${total}周`;
  const np = L.persons.find(p => p.id === L.newId); L.newName = np ? np.name : '';
  // ほかのスマホへは、ラップが出た1人分だけを小さく送る（データ量をおさえる）
  if (L.share && np) {
    const lp = liveLaps(np);
    if (lp.length && np.sentK !== lp.length) {
      // 周の数が1つずつ増えた時だけ「1周分」。そうでない時（数え直しで変わった時）は、見る側が全部をもらい直す
      L.dirty = true; L.share.lap({ n: np.name, s: L.sets.length, k: lp.length, l: Math.round(lp[lp.length - 1] * 100) / 100, t: Math.round(np.cs[np.cs.length - 1].t * 10) / 10 }); np.sentK = lp.length;
    }
  }
}
$('darkBtn').onclick = () => $('dark').classList.remove('hide');
$('dark').onclick = () => $('dark').classList.add('hide');
$('stopLive').onclick = async () => {
  if (!L.rec || L.rec.state === 'inactive') return;
  if (!confirm('撮影を止めますか？')) return;
  $('stopLive').disabled = true;
  clearInterval(L.timer);
  const v = $('vLive'), W = v.videoWidth, H = v.videoHeight, dur = (performance.now() - L.t0) / 1000;
  clearInterval(L.saveTm); saveLive().then(() => { L.team = null; });
  stand.stop(); if (L.share) { L.share.end(); L.share.stop(); L.share = null; }
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
  if (L.sets.length) s.liveSets = L.sets.map((_, k) => setSummary(k)); // メニューごとのラップ（その場で測ったもの）
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

// ---------- 思わぬエラーを画面に出す（スクショで原因が分かるように）----------
window.addEventListener('error', e => toast('エラー：' + (e.message || e.error)));
window.addEventListener('unhandledrejection', e => toast('エラー：' + ((e.reason && e.reason.message) || e.reason)));

// 試験用：いまの線と記録を外から見られるようにする
window.__skateDebug = () => ({ line: S.line, session: S.session, live: L });

// ---------- はじめ ----------
showHome();
if (new URLSearchParams(location.search).has('watch') && lsGet('skate-team', '')) openTeam();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
