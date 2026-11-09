// スケートラップ：人を見つける・追いかける・赤いラインの通過を測る（すべて端末の中で計算）
// 座標はすべて 0〜1（動画の幅・高さを1とする）で持つ。
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = new URL('./models/efficientdet_lite0.tflite', import.meta.url).href;

let detector = null, delegateUsed = '';
export async function loadDetector() {
  if (detector) return detector;
  const forceCpu = new URLSearchParams(location.search).has('cpu');
  const { FilesetResolver, ObjectDetector } = await import(`${MP}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const opts = d => ({
    baseOptions: { modelAssetPath: MODEL, delegate: d },
    runningMode: 'IMAGE', scoreThreshold: 0.3, categoryAllowlist: ['person'], maxResults: 40,
  });
  try { if (forceCpu) throw 0; detector = await ObjectDetector.createFromOptions(fileset, opts('GPU')); delegateUsed = 'GPU'; }
  catch (e) { detector = await ObjectDetector.createFromOptions(fileset, opts('CPU')); delegateUsed = 'CPU'; }
  return detector;
}
export const usedDelegate = () => delegateUsed;

// ---------- 1コマから人を探す ----------
const tileCv = document.createElement('canvas');
const tileCx = tileCv.getContext('2d', { willReadFrequently: false });
function toBoxes(res, ox, oy, W, H) {
  return (res.detections || []).map(d => {
    const b = d.boundingBox;
    return { x1: (b.originX + ox) / W, y1: (b.originY + oy) / H, x2: (b.originX + b.width + ox) / W, y2: (b.originY + b.height + oy) / H, score: d.categories[0].score };
  });
}
export function iou(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i);
}
function nms(boxes, th) {
  boxes.sort((a, b) => b.score - a.score);
  const out = [];
  for (const b of boxes) if (!out.some(o => iou(o, b) > th)) out.push(b);
  return out;
}
// tiles=1：画面全体を1回（速い）。tiles=2：左右に分けて2回（遠くの小さい人も見つけやすいが遅い）
export function detectFrame(src, W, H, tiles = 1) {
  if (tiles === 1) return toBoxes(detector.detect(src), 0, 0, W, H).filter(okBox);
  const tw = Math.round(W * 0.58), out = [];
  tileCv.width = tw; tileCv.height = H;
  for (const x0 of [0, W - tw]) {
    tileCx.drawImage(src, x0, 0, tw, H, 0, 0, tw, H);
    out.push(...toBoxes(detector.detect(tileCv), x0, 0, W, H));
  }
  return nms(out, 0.45).filter(okBox);
}
// 横長すぎる枠（人ではないもの）を外す
const okBox = b => (b.y2 - b.y1) > 0.025 && (b.x2 - b.x1) > 0.004;

// ---------- 服の色（胴の色の分布）----------
const HB = 9, SB = 3, GB = 4, NH = HB * SB + GB, NB = NH * 2; // 胴と脚の2か所
const smallCv = document.createElement('canvas');
const smallCx = smallCv.getContext('2d', { willReadFrequently: true });
let smallData = null, sW = 0, sH = 0;
export function grabSmall(src, W, H) {
  sW = 256; sH = Math.max(1, Math.round(256 * H / W));
  smallCv.width = sW; smallCv.height = sH;
  smallCx.drawImage(src, 0, 0, sW, sH);
  smallData = smallCx.getImageData(0, 0, sW, sH).data;
}
function regionHist(h, off, b, f1, f2, side) {
  const bw = b.x2 - b.x1, bh = b.y2 - b.y1;
  const x1 = Math.max(0, Math.floor((b.x1 + bw * side) * sW)), x2 = Math.min(sW - 1, Math.ceil((b.x2 - bw * side) * sW));
  const y1 = Math.max(0, Math.floor((b.y1 + bh * f1) * sH)), y2 = Math.min(sH - 1, Math.ceil((b.y1 + bh * f2) * sH));
  let n = 0;
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    const i = (y * sW + x) * 4, r = smallData[i] / 255, g = smallData[i + 1] / 255, bl = smallData[i + 2] / 255;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn, s = mx ? d / mx : 0;
    if (s < 0.22 || mx < 0.12) { h[off + HB * SB + Math.min(GB - 1, Math.floor(mx * GB))]++; }
    else {
      let hu = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
      if (hu < 0) hu += 6;
      h[off + Math.min(HB - 1, Math.floor(hu / 6 * HB)) * SB + Math.min(SB - 1, Math.floor((s - 0.22) / 0.78 * SB))]++;
    }
    n++;
  }
  if (n) for (let i = 0; i < NH; i++) h[off + i] /= n;
  return n;
}
export function colorHist(b) {
  const h = new Float32Array(NB);
  const n1 = regionHist(h, 0, b, 0.12, 0.55, 0.25), n2 = regionHist(h, NH, b, 0.58, 0.9, 0.2);
  return n1 && n2 ? h : null;
}
export function histSim(a, b) { // 1 に近いほど似ている（胴と脚の平均）
  let s = 0; for (let i = 0; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s / 2;
}

// ---------- 追いかけ ----------
export class Tracker {
  constructor(W, H) { this.W = W; this.H = H; this.aspect = W / H; this.active = []; this.done = []; this.next = 1; }
  update(t, dets, src) {
    const A = this.aspect, cand = [];
    for (const tr of this.active) {
      const L = tr.s[tr.s.length - 1], dt = t - L[0];
      const lh = L[4] - L[2], cx = (L[1] + L[3]) / 2 + tr.vx * dt, cy = (L[2] + L[4]) / 2 + tr.vy * dt;
      dets.forEach((d, j) => {
        const dh = d.y2 - d.y1, r = dh / lh;
        if (r < 0.55 || r > 1.8) return;
        const dx = ((d.x1 + d.x2) / 2 - cx) * A, dy = (d.y1 + d.y2) / 2 - cy;
        const cost = Math.hypot(dx, dy) / Math.max(lh, dh);
        if (cost < 1.1) cand.push([cost, tr, j]);
      });
    }
    cand.sort((a, b) => a[0] - b[0]);
    const usedT = new Set(), usedD = new Set();
    for (const [, tr, j] of cand) {
      if (usedT.has(tr) || usedD.has(j)) continue;
      usedT.add(tr); usedD.add(j); this._add(tr, t, dets[j], src);
    }
    dets.forEach((d, j) => {
      if (usedD.has(j)) return;
      // 周りの人の枠と大きく重なる新しい枠は、重なりの見まちがいとして作らない
      if (this.active.some(tr => usedT.has(tr) && iou(lastBox(tr), d) > 0.5)) return;
      const tr = { id: this.next++, s: [], vx: 0, vy: 0, hist: new Float32Array(NB), hn: 0, thumbArea: 0, thumb: null };
      this.active.push(tr); this._add(tr, t, d, src);
    });
    this.active = this.active.filter(tr => {
      if (t - tr.s[tr.s.length - 1][0] > 0.8) { this.done.push(tr); return false; }
      return true;
    });
  }
  _add(tr, t, d, src) {
    const p = tr.s[tr.s.length - 1];
    if (p) {
      const dt = Math.max(1e-3, t - p[0]);
      const vx = ((d.x1 + d.x2) / 2 - (p[1] + p[3]) / 2) / dt, vy = ((d.y1 + d.y2) / 2 - (p[2] + p[4]) / 2) / dt;
      tr.vx = tr.s.length > 1 ? tr.vx * 0.5 + vx * 0.5 : vx; tr.vy = tr.s.length > 1 ? tr.vy * 0.5 + vy * 0.5 : vy;
    }
    tr.s.push([t, d.x1, d.y1, d.x2, d.y2, d.score]);
    const h = colorHist(d);
    if (h) { for (let i = 0; i < NB; i++) tr.hist[i] += h[i]; tr.hn++; }
    const area = (d.x2 - d.x1) * (d.y2 - d.y1) * d.score;
    if (area > tr.thumbArea * 1.15 && d.x1 > 0.003 && d.x2 < 0.997) { tr.thumbArea = area; tr.thumb = cropThumb(src, d, this.W, this.H); }
  }
  finish() { this.done.push(...this.active); this.active = []; return this.done; }
}
const lastBox = tr => { const L = tr.s[tr.s.length - 1]; return { x1: L[1], y1: L[2], x2: L[3], y2: L[4] }; };
function cropThumb(src, d, W, H) {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 128;
  const bw = (d.x2 - d.x1) * W, bh = (d.y2 - d.y1) * H, s = Math.max(bw / 96, bh / 128) * 1.1;
  const cx = (d.x1 + d.x2) / 2 * W, cy = (d.y1 + d.y2) / 2 * H;
  const c = cv.getContext('2d'); c.fillStyle = '#0b1a2e'; c.fillRect(0, 0, 96, 128);
  c.drawImage(src, cx - 48 * s, cy - 64 * s, 96 * s, 128 * s, 0, 0, 96, 128);
  return cv;
}

// ---------- 動画を流しながら解析する ----------
// onFrame(t, dets) は画面の表示用。速さは検出にかかる時間に合わせて 1〜4 倍で自動調整。
export async function scanVideo(video, { tiles = 1, onFrame, onProgress, isStopped }) {
  const W = video.videoWidth, H = video.videoHeight;
  const tracker = new Tracker(W, H);
  await seekTo(video, 0);
  video.muted = true;
  let rate = 2; video.playbackRate = rate;
  let lastT = -1, gaps = [], frames = 0, slow = false;
  const work = t => {
    grabSmall(video, W, H);
    const dets = detectFrame(video, W, H, tiles);
    tracker.update(t, dets, video);
    frames++;
    if (lastT >= 0 && !slow) {
      gaps.push(t - lastT);
      if (gaps.length >= 6) { // 1回の間に進む動画の時間を 0.07 秒くらいにする
        const g = gaps.reduce((a, b) => a + b) / gaps.length; gaps = [];
        if (g > 0.12 && rate <= 1) slow = true; // 等倍でも追いつかない端末：止めて 0.1 秒ずつ送る
        else if (g > 0.1 && rate > 1) rate = Math.max(1, rate - 0.5);
        else if (g < 0.055 && rate < 4) rate = Math.min(4, rate + 0.25);
        video.playbackRate = rate;
      }
    }
    lastT = t;
    onFrame && onFrame(t, dets, slow ? 0 : rate);
    onProgress && onProgress(t / video.duration);
  };
  let from = 0;
  if ('requestVideoFrameCallback' in video) {
    from = await new Promise((res, rej) => {
      let ended = false;
      const end = t => { if (!ended) { ended = true; video.pause(); res(t); } };
      const step = (now, meta) => {
        if (ended) return;
        if (isStopped && isStopped()) return end(video.duration);
        try { work(meta.mediaTime); } catch (e) { ended = true; video.pause(); return rej(e); }
        if (video.ended) return end(video.duration);
        if (slow) return end(meta.mediaTime + 0.1);
        video.requestVideoFrameCallback(step);
      };
      video.onended = () => setTimeout(() => end(video.duration), 50);
      video.requestVideoFrameCallback(step);
      video.play().catch(rej);
    });
  }
  // 古いブラウザや遅い端末：0.1 秒ずつ送って解析
  for (let t = from; t < video.duration - 0.02; t += 0.1) {
    if (isStopped && isStopped()) break;
    const mt = await seekTo(video, t); work(mt);
  }
  video.onended = null; video.playbackRate = 1;
  return { tracks: tracker.finish(), frames };
}

// 決まった時刻へ移動し、本当に出ているコマの時刻を返す
export function seekTo(video, t) {
  return new Promise(res => {
    let done = false;
    const fin = mt => { if (!done) { done = true; res(mt ?? video.currentTime); } };
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback((n, m) => fin(m.mediaTime));
        setTimeout(() => fin(), 250);
      } else fin();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, Math.min(t, (video.duration || t) - 0.001));
  });
}

// ---------- 赤いラインを自動で探す ----------
// 赤い画素を集め、いちばん多くの赤い画素が乗る直線を探す（RANSAC）。見つからなければ null。
export function findRedLine(src, W, H) {
  const w = 320, h = Math.round(320 * H / W);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(src, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 110 && r > g * 1.7 && r > b * 1.5) pts.push([x, y]);
  }
  if (pts.length < 30) return null;
  let best = null, bestN = 0;
  for (let k = 0; k < 600; k++) {
    const a = pts[(Math.random() * pts.length) | 0], b = pts[(Math.random() * pts.length) | 0];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 20) continue;
    let n = 0;
    for (let i = 0; i < pts.length; i += 2) { const p = pts[i]; if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1.6) n++; }
    if (n > bestN) { bestN = n; best = [a, b]; }
  }
  if (!best || bestN < 20) return null;
  const [a, b] = best, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const us = [];
  for (const p of pts) if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1.6) us.push(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L);
  us.sort((x, y) => x - y);
  const u1 = us[Math.floor(us.length * 0.02)], u2 = us[Math.floor(us.length * 0.98)];
  const P = u => [(a[0] + dx / L * u) / w, (a[1] + dy / L * u) / h];
  return [P(u1), P(u2)];
}

// ---------- ライン通過 ----------
// 足もと（枠の下のまん中）とラインの、ゆがみを考えた符号つき距離（ピクセル）と、線のどのあたりか（0〜1）
export function lineMetric(line, W, H, x1, y2, x2) {
  const ax = line[0][0] * W, ay = line[0][1] * H, bx = line[1][0] * W, by = line[1][1] * H;
  const px = (x1 + x2) / 2 * W, py = y2 * H, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
  return { s: ((px - ax) * dy - (py - ay) * dx) / L, u: ((px - ax) * dx + (py - ay) * dy) / L2 };
}
// 直線を当てはめて s=0 の時刻を求める
function fitZero(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let st = 0, ss = 0; for (const [t, s] of pts) { st += t; ss += s; }
  const mt = st / n, ms = ss / n;
  let num = 0, den = 0; for (const [t, s] of pts) { num += (t - mt) * (s - ms); den += (t - mt) * (t - mt); }
  if (!den || !num) return null;
  const b = num / den; return mt - ms / b;
}
export function trackCrossings(tr, line, W, H) {
  const m = tr.s.map(r => ({ t: r[0], ...lineMetric(line, W, H, r[1], r[4], r[3]) }));
  const out = [];
  for (let i = 0; i + 1 < m.length; i++) {
    const a = m[i], b = m[i + 1];
    if (!(a.s < 0 && b.s >= 0) && !(a.s > 0 && b.s <= 0)) continue;
    if (b.t - a.t > 0.6) continue;
    const um = (a.u + b.u) / 2; if (um < -0.15 || um > 1.15) continue;
    const t0 = a.t + (b.t - a.t) * (a.s / (a.s - b.s));
    const near = m.filter(p => Math.abs(p.t - t0) < 0.3).map(p => [p.t, p.s]);
    let t = fitZero(near); if (t == null || Math.abs(t - t0) > 0.3) t = t0;
    if (out.length && t - out[out.length - 1].t < 3) continue; // ラインの上でうろうろしているだけ
    out.push({ t, dir: b.s > a.s ? 1 : -1, track: tr.id, refined: false });
  }
  return out;
}
// 選手を開いた時に、通過の前後をコマ送りで見直してさらに正確にする
export async function refineCrossing(video, cr, tr, line, tiles = 1) {
  const W = video.videoWidth, H = video.videoHeight;
  const boxAt = t => interpBox(tr.s, t, 0.8);
  const pts = [], seen = new Set();
  for (let k = -9; k <= 9; k++) {
    const mt = await seekTo(video, cr.t + k / 30);
    const key = Math.round(mt * 1000); if (seen.has(key)) continue; seen.add(key);
    const ref = boxAt(mt); if (!ref) continue;
    const dets = detectFrame(video, W, H, tiles);
    let best = null, bi = 0.3;
    for (const d of dets) { const v = iou(d, ref); if (v > bi) { bi = v; best = d; } }
    if (best) pts.push([mt, lineMetric(line, W, H, best.x1, best.y2, best.x2).s]);
  }
  // 解析の時に取れた位置も合わせる（見直しで見失ったコマを補う）
  for (const r of tr.s) if (Math.abs(r[0] - cr.t) < 0.35 && !pts.some(p => Math.abs(p[0] - r[0]) < 0.012)) pts.push([r[0], lineMetric(line, W, H, r[1], r[4], r[3]).s]);
  pts.sort((a, b) => a[0] - b[0]);
  if (self.SKATE_DEBUG) console.log('refine', cr.t.toFixed(3), seen.size, JSON.stringify(pts.map(p => [+p[0].toFixed(3), +p[1].toFixed(1)])));
  // 符号が変わる所（いちばん元の時刻に近い所）の前後 4 コマずつで直線を当てはめる
  let ci = -1;
  for (let i = 0; i + 1 < pts.length; i++) if (Math.sign(pts[i][1]) !== Math.sign(pts[i + 1][1]) && (ci < 0 || Math.abs(pts[i][0] - cr.t) < Math.abs(pts[ci][0] - cr.t))) ci = i;
  if (ci < 0) return { ...cr, refined: true };
  const t = fitZero(pts.slice(Math.max(0, ci - 3), ci + 5));
  if (t != null && Math.abs(t - cr.t) < 0.3) return { ...cr, t, refined: true };
  return { ...cr, refined: true };
}
export function interpBox(s, t, maxGap = 0.6) {
  if (!s.length || t < s[0][0] - 0.05 || t > s[s.length - 1][0] + 0.05) return null;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m][0] <= t) lo = m; else hi = m; }
  const a = s[lo], b = s[hi];
  if (b[0] - a[0] > maxGap) return null;
  const f = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  return { x1: a[1] + (b[1] - a[1]) * f, y1: a[2] + (b[2] - a[2]) * f, x2: a[3] + (b[3] - a[3]) * f, y2: a[4] + (b[4] - a[4]) * f };
}

// ---------- 同じ人をまとめる ----------
// 時間が重ならず、服の色がよく似ている切れはしを1人にまとめる。
export function groupTracks(tracks, th = 0.93) {
  const groups = tracks.map(tr => ({ ids: [tr.id], spans: [[tr.s[0][0], tr.s[tr.s.length - 1][0]]], hist: norm(tr.hist, tr.hn) }));
  const overlap = (g, h) => g.spans.some(a => h.spans.some(b => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.2));
  for (;;) {
    let best = null, bv = th;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const v = histSim(groups[i].hist, groups[j].hist);
      if (v > bv && !overlap(groups[i], groups[j])) { bv = v; best = [i, j]; }
    }
    if (!best) break;
    const [i, j] = best, g = groups[i], h = groups[j], ni = g.ids.length, nj = h.ids.length;
    const hist = new Float32Array(NB); for (let k = 0; k < NB; k++) hist[k] = (g.hist[k] * ni + h.hist[k] * nj) / (ni + nj);
    groups[i] = { ids: [...g.ids, ...h.ids], spans: [...g.spans, ...h.spans], hist };
    groups.splice(j, 1);
  }
  return groups.map(g => g.ids);
}
function norm(h, n) { const o = new Float32Array(NB); for (let i = 0; i < NB; i++) o[i] = n ? h[i] / n : 0; return o; }

// ---------- その場で測る（撮影しながら）----------
// 追いかけ中の人の、いちばん新しい2つの位置の間でラインを越えたかを調べる。越えていれば通過を返す。
export function liveCrossing(tr, line, W, H) {
  const n = tr.s.length; if (n < 2) return null;
  const A = tr.s[n - 2], B = tr.s[n - 1];
  if (B[0] - A[0] > 0.6) return null;
  const a = lineMetric(line, W, H, A[1], A[4], A[3]), b = lineMetric(line, W, H, B[1], B[4], B[3]);
  if (!(a.s < 0 && b.s >= 0) && !(a.s > 0 && b.s <= 0)) return null;
  const um = (a.u + b.u) / 2; if (um < -0.15 || um > 1.15) return null;
  const t = A[0] + (B[0] - A[0]) * (a.s / (a.s - b.s));
  if (tr.lastCross != null && t - tr.lastCross < 3) return null;
  tr.lastCross = t;
  return { t, dir: b.s > a.s ? 1 : -1, track: tr.id, refined: false };
}
export function normHist(h, n) { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) o[i] = n ? h[i] / n : 0; return o; }
