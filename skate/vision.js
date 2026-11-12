// スケートラップ：人を見つける・追いかける・赤いラインの通過を測る（すべて端末の中で計算）
// 座標はすべて 0〜1（動画の幅・高さを1とする）で持つ。
import { grabGray, MotionChain, estimate, apply, inv3, mul3, I3 } from './motion.js';
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
const HB = 9, SB = 3, GB = 4, NH = HB * SB + GB, NB = NH * 3; // 胴・脚・頭（ヘルメット）の3か所
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
  const n1 = regionHist(h, 0, b, 0.12, 0.55, 0.25), n2 = regionHist(h, NH, b, 0.58, 0.9, 0.2), n3 = regionHist(h, NH * 2, b, 0, 0.11, 0.3);
  return n1 && n2 && n3 ? h : null;
}
// 1 に近いほど似ている（胴・脚・頭の平均）。古い記録（2か所）とは比べない
export function histSim(a, b) {
  if (!a || !b || a.length !== NB || b.length !== NB) return 0;
  let s = 0; for (let i = 0; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s / 3;
}
// 頭（ヘルメット）だけの近さ
export function headSim(a, b) {
  if (!a || !b || a.length !== NB || b.length !== NB) return 0;
  let s = 0; for (let i = NH * 2; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s;
}

// ---------- 赤いラインの色と、壁と氷の境目 ----------
// 氷の上の赤いラインは、氷を通して見るので「とても薄い赤（灰色に近いピンク）」。緑と青がほぼ同じ量なのが特徴。
// 壁の下の黄色〜オレンジの帯は緑が青よりずっと多いので入れない（2026-11-09 本人の指摘：境目を赤い線とまちがえる）。
export function isLineRed(r, g, b) {
  const red = r - Math.max(g, b);
  return r > 60 && red >= 10 && Math.abs(g - b) <= Math.max(10, red * 0.6);
}
// 壁と氷の境目：各列で、壁らしい色（黄色い帯・青いマット）のいちばん下を集め、直線を当てはめる。
// 返り値：x（0〜w）→ 境目の y（ピクセル）。見つからなければ null（その時は境目で切らない）
export function wallEdge(data, w, h) {
  const pts = [];
  for (let x = 0; x < w; x += 2) {
    let low = -1, run = 0;
    for (let y = 0; y < Math.floor(h * 0.85); y++) {
      const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      const yellow = r > 140 && g > 110 && b < g * 0.6, blue = b > r + 40 && b > g + 5 && b > 90;
      if (yellow || blue) { run++; if (run >= 3) low = y; } else run = 0;
    }
    if (low >= 0) pts.push([x, low]);
  }
  if (pts.length < w / 2 * 0.25) return null;
  // RANSAC で直線（マットの切れ目や人の服の色に引っぱられないように）
  let best = null, bn = 0;
  for (let k = 0; k < 200; k++) {
    const a = pts[(Math.random() * pts.length) | 0], c = pts[(Math.random() * pts.length) | 0];
    if (Math.abs(c[0] - a[0]) < w * 0.15) continue;
    const m = (c[1] - a[1]) / (c[0] - a[0]); let n = 0;
    for (const p of pts) if (Math.abs(a[1] + m * (p[0] - a[0]) - p[1]) < 3) n++;
    if (n > bn) { bn = n; best = [a, m]; }
  }
  if (!best || bn < pts.length * 0.4) return null;
  const [a, m] = best;
  return x => a[1] + m * (x - a[0]);
}

// ---------- 赤いラインを、いまのコマの中で探して合わせ直す ----------
// 予想した線（計算で出した位置）の近くだけで赤っぽい画素を集め、直線を当てはめ直す。
// 人の枠の中は使わない（赤い服を線とまちがえないように）。見つからなければ null。
export function snapRedLine(line, boxes = []) {
  if (!line || !smallData) return null;
  const P0 = [line[0][0] * sW, line[0][1] * sH], P1 = [line[1][0] * sW, line[1][1] * sH];
  let dx = P1[0] - P0[0], dy = P1[1] - P0[1]; const L = Math.hypot(dx, dy); if (L < 12) return null;
  dx /= L; dy /= L;
  const inBox = (x, y) => boxes.some(b => x >= b.x1 * sW && x <= b.x2 * sW && y >= b.y1 * sH && y <= b.y2 * sH);
  const edge = wallEdge(smallData, sW, sH); // 壁の側（境目より上）は探さない
  const margin = Math.max(4, sH * 0.05); // 境目のすぐ下は、氷に映った壁の帯（写り込み）なので見ない
  const onWall = (x, y) => edge && y <= edge(x) + margin;
  const collect = (a, ux, uy, band) => {
    const pts = [], nx = -uy, ny = ux;
    const xs = [a[0], a[0] + ux * L], ys = [a[1], a[1] + uy * L];
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - band - L * 0.1)), x1 = Math.min(sW - 1, Math.ceil(Math.max(...xs) + band + L * 0.1));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - band - L * 0.1)), y1 = Math.min(sH - 1, Math.ceil(Math.max(...ys) + band + L * 0.1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x - a[0], qy = y - a[1], u = (qx * ux + qy * uy) / L, d = qx * nx + qy * ny;
      if (u < 0.02 || u > 1.02 || Math.abs(d) > band) continue; // 線のはしより外（壁の側）の赤は見ない
      const i = (y * sW + x) * 4, r = smallData[i], g = smallData[i + 1], b = smallData[i + 2];
      if (isLineRed(r, g, b) && !inBox(x, y) && !onWall(x, y)) pts.push([x, y, u]);
    }
    return pts;
  };
  const fit = pts => { // 主成分で直線
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    let a = 0, b = 0, c = 0; for (const p of pts) { const X = p[0] - mx, Y = p[1] - my; a += X * X; b += X * Y; c += Y * Y; }
    const th = 0.5 * Math.atan2(2 * b, a - c); return { mx, my, ux: Math.cos(th), uy: Math.sin(th) };
  };
  let pts = collect(P0, dx, dy, Math.max(4, sW * 0.03));
  if (pts.length < 12) return null;
  let f = fit(pts);
  if (f.ux * dx + f.uy * dy < 0) { f.ux = -f.ux; f.uy = -f.uy; }
  // もう一度、当てはめた線のすぐ近くだけで
  const a2 = [f.mx - f.ux * ((f.mx - P0[0]) * f.ux + (f.my - P0[1]) * f.uy), f.my - f.uy * ((f.mx - P0[0]) * f.ux + (f.my - P0[1]) * f.uy)];
  pts = collect(a2, f.ux, f.uy, 2.5);
  if (pts.length < 10) return null;
  const us = pts.map(p => p[2]); if (Math.max(...us) - Math.min(...us) < 0.25) return null; // 線の一部分にしか赤がない
  f = fit(pts); if (f.ux * dx + f.uy * dy < 0) { f.ux = -f.ux; f.uy = -f.uy; }
  if (f.ux * dx + f.uy * dy < Math.cos(12 * Math.PI / 180)) return null; // 向きが違いすぎる
  const proj = Q => { const k = (Q[0] - f.mx) * f.ux + (Q[1] - f.my) * f.uy; return [(f.mx + f.ux * k) / sW, (f.my + f.uy * k) / sH]; };
  return [proj(P0), proj(P1)];
}
// 毎コマの線の位置：線のコマ（K）に重ねて計算 → 写っている赤い線で合わせ直す。
// K に重ならない時は、前のコマの線をカメラの動きで動かして予想し、赤い線が見つかった時だけ使う。
export class LineTracker {
  // stripe：線を「壁の赤い帯の真下」に引いた時の、その帯の大きさ { h }。景色で重ねられない時の手がかりにする
  constructor(anchor, stripe) { this.anchor = anchor; this.stripe = stripe || null; this.lastHk = null; this.lastT = null; this.lastAt = -1; }
  step(t, P, T, dets, src) {
    const loc = this.anchor.locate(P, T, dets);
    let Hk = loc ? loc.H : null, direct = !!loc;
    // ぶれたコマなどで重ねられない時：直前に重なったコマから、カメラの動いた分だけ動かす（1秒まで）
    if (!Hk && this.lastHk && t - this.lastAt < 0.5) Hk = mul3(this.lastHk, mul3(inv3(this.lastT), T));
    if (direct) { this.lastHk = Hk; this.lastT = T; this.lastAt = t; }
    if (!Hk) {
      // 手前を横切る人や立っている人で景色がかくれ、線のコマに重ねられない時：
      // 壁の赤い帯そのものを探し、その真下に線を引く（人の上の赤・大きさがちがいすぎる赤は使わない）
      if (this.stripe && src) {
        const st = findWallStripe(src, src.videoWidth || src.width, src.videoHeight || src.height, true);
        if (st && st.x > 0.03 && st.x < 0.97) {
          const hh = st.bottom - st.top, y = (st.top + st.bottom) / 2;
          const onP = (dets || []).some(d => { const mx = (d.x2 - d.x1) * 0.25, my = (d.y2 - d.y1) * 0.1; return st.x > d.x1 - mx && st.x < d.x2 + mx && y > d.y1 - my && y < d.y2 + my; });
          if (!onP && hh > this.stripe.h * 0.33 && hh < this.stripe.h * 3 && sameWall(this.stripe.ctx, st.ctx)) return { Hk: null, line: lineFromStripe(st), snapped: true, byStripe: true };
        }
      }
      return { Hk: null, line: null, snapped: false };
    }
    const Hi = inv3(Hk), pred = this.anchor.line.map(q => apply(Hi, q[0], q[1]));
    // 写っている赤い線での合わせ直しは、計算した位置のすぐ近く（画面の幅の1.5%以内）の時だけ使う。
    // 線は氷の上の決まった1本でないと、ラップがコマごとにずれるため
    let sn = snapRedLine(pred, dets);
    if (sn && Math.max(Math.hypot(sn[0][0] - pred[0][0], sn[0][1] - pred[0][1]), Math.hypot(sn[1][0] - pred[1][0], sn[1][1] - pred[1][1])) > 0.015) sn = null;
    return { Hk, line: sn || pred, snapped: !!sn };
  }
}

// 帯の左右の色が、最初に見つけた時とほぼ同じか（明るさの変わりは少し許す）
function sameWall(a, b) {
  if (!a || !b) return false;
  for (let k = 0; k < 2; k++) { const p = a[k], q = b[k]; if (!p || !q) return false;
    const lp = (p[0] + p[1] + p[2]) / 3, lq = (q[0] + q[1] + q[2]) / 3, s = lp > 1 ? lq / lp : 1;
    if (s < 0.6 || s > 1.6) return false;
    for (let c = 0; c < 3; c++) if (Math.abs(p[c] * s - q[c]) > 28) return false; }
  return true;
}
// ---------- 壁の赤い帯（ゴールラインが壁に当たる所の目印）----------
// はっきりした赤で、細くて縦に長いかたまりを探す。返り値：{x, top, bottom}（0〜1）。なければ null
// loose：解析中の引き直し用。ズームを引いた画では帯が小さく写るので、小さい帯も拾う（人の上の赤は呼ぶ側で外す）
export function findWallStripe(src, W, H, loose = false) {
  const w = 320, h = Math.round(320 * H / W);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(src, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, col = new Int32Array(w), top = new Int32Array(w).fill(h), bot = new Int32Array(w).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 130 && r > g * 1.9 && r > b * 1.6) { col[x]++; if (y < top[x]) top[x] = y; if (y > bot[x]) bot[x] = y; }
  }
  const need = loose ? Math.max(3, h * 0.02) : Math.max(6, h * 0.045), minH = loose ? 0.03 : 0.06; let best = null;
  for (let x = 0; x < w; x++) {
    if (col[x] < need) continue;
    let x2 = x, sum = 0, t0 = h, b0 = -1;
    while (x2 < w && col[x2] >= need) { sum += col[x2]; t0 = Math.min(t0, top[x2]); b0 = Math.max(b0, bot[x2]); x2++; }
    const bw = x2 - x, bh = b0 - t0 + 1;
    // 細い・縦長・中がほぼ赤で埋まっている（服やヘルメットは形がちがう）
    if (bw <= w * 0.05 && bh >= bw * 2 && bh >= h * minH && sum >= bw * bh * 0.7 && (!best || sum > best.sum)) best = { x: (x + x2) / 2 / w, top: t0 / h, bottom: (b0 + 1) / h, sum, px: [x, x2, t0, b0] };
    x = x2;
  }
  if (!best) return null;
  const edge = wallEdge(d, w, h); // 壁の下のはしの近くまで届いていること
  if (edge && Math.abs(edge(best.x * w) / h - best.bottom) > 0.08) return null;
  // 帯のすぐ左と右の色（＝壁の色）。解析中に帯を探し直す時、同じ壁の上の帯かどうかを見分けるのに使う
  const [bx0, bx1, by0, by1] = best.px, side = (xa, xb) => { let r = 0, g = 0, b = 0, n = 0;
    for (let y = by0; y <= by1; y++) for (let x = Math.max(0, xa); x <= Math.min(w - 1, xb); x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n, g / n, b / n] : null; };
  best.ctx = [side(bx0 - 5, bx0 - 2), side(bx1 + 1, bx1 + 4)]; delete best.px;
  return best;
}
// 壁の赤い帯の真下に、氷の上の線の候補を引く（手前に向かってまっすぐ下へ）
export function lineFromStripe(st) {
  // 長い・画面の下まで届く赤い縦線は、それ自体が氷の上の線
  if (st.bottom - st.top > 0.3 || st.bottom > 0.85) return [[st.x, st.top], [st.x, st.bottom]];
  return [[st.x, Math.min(0.97, st.bottom + 0.01)], [st.x, 0.98]];
}

// ---------- 追いかけ ----------
export class Tracker {
  constructor(W, H) { this.W = W; this.H = H; this.aspect = W / H; this.active = []; this.done = []; this.next = 1; }
  // T：いまのコマ→基準 の変換。カメラの動きを差し引くのに使うが、「基準の座標」には直さない
  // （カメラがぐるっと回る動画では、基準から離れるほど座標がゆがむため）。
  // 前に見たコマの位置と速さを、そのコマ→いまのコマ の変換で「いまのコマの座標」に写してから比べる。
  update(t, dets, src, T) {
    const A = this.aspect, cand = [], Tinv = T ? inv3(T) : null; this.Tcur = T;
    const dhs = dets.map(d => colorHist(d)); // 服とヘルメットの色（取り違え防止）
    for (const tr of this.active) {
      const th = tr.hn >= 3 ? norm(tr.hist, tr.hn) : null;
      const I0 = tr.s[tr.s.length - 1], dt = t - I0[0];
      const R = Tinv && tr.T0 ? mul3(Tinv, tr.T0) : null; // 前に見たコマ → いまのコマ
      const c0 = [(I0[1] + I0[3]) / 2, (I0[2] + I0[4]) / 2];
      const pc = R ? apply(R, c0[0], c0[1]) : c0, pe = R ? apply(R, c0[0] + tr.vx * 0.1, c0[1] + tr.vy * 0.1) : [c0[0] + tr.vx * 0.1, c0[1] + tr.vy * 0.1];
      const pv = [(pe[0] - pc[0]) / 0.1, (pe[1] - pc[1]) / 0.1];
      const pb = R ? mapBox(R, { x1: I0[1], y1: I0[2], x2: I0[3], y2: I0[4] }) : null;
      const lh = pb ? pb.y2 - pb.y1 : I0[4] - I0[2], cx = pc[0] + pv[0] * dt, cy = pc[1] + pv[1] * dt;
      tr._pc = pc; tr._pv = pv;
      // 画面の中の位置でも比べる（カメラがその人を追っている時は、画面の中ではあまり動かない。
      // ぶれたコマで画面の動きの計算が外れても、見失わないように）
      const I = tr.s[tr.s.length - 1], ih = I[4] - I[2];
      const icx = (I[1] + I[3]) / 2 + (tr.ivx || 0) * dt, icy = (I[2] + I[4]) / 2 + (tr.ivy || 0) * dt;
      dets.forEach((d, j) => {
        const dh = d.y2 - d.y1, r = dh / lh;
        let cost = Infinity;
        if (isFinite(cx) && r >= 0.55 && r <= 1.8) {
          const dx = ((d.x1 + d.x2) / 2 - cx) * A, dy = (d.y1 + d.y2) / 2 - cy;
          cost = Math.hypot(dx, dy) / Math.max(lh, dh);
        }
        const o = dets[j], oh = o.y2 - o.y1, ir = oh / ih;
        if (ir >= 0.6 && ir <= 1.7) {
          const dx = ((o.x1 + o.x2) / 2 - icx) * A, dy = (o.y1 + o.y2) / 2 - icy;
          cost = Math.min(cost, Math.hypot(dx, dy) / Math.max(ih, oh) * 1.15);
        }
        if (th && dhs[j]) { // 色が違う人には乗り移らない
          const sim = histSim(th, dhs[j]);
          if (sim < 0.8) return;
          cost += Math.max(0, 0.95 - sim) * 5;
        }
        if (cost < 1.1) cand.push([cost, tr, j]);
      });
    }
    cand.sort((a, b) => a[0] - b[0]);
    // 重なっていて見分けにくい時は結ばない（別の人に乗り移るより、いったん見失う方がよい）
    const amb = new Set();
    for (const tr of this.active) {
      const cs = cand.filter(c => c[1] === tr);
      if (cs.length >= 2 && cs[1][0] - cs[0][0] < 0.25 && iou(dets[cs[0][2]], dets[cs[1][2]]) > 0.2) amb.add(tr);
    }
    const usedT = new Set(amb), usedD = new Set();
    for (const [, tr, j] of cand) {
      if (usedT.has(tr) || usedD.has(j)) continue;
      usedT.add(tr); usedD.add(j); this._add(tr, t, dets[j], src, dhs[j]);
    }
    dets.forEach((d, j) => {
      if (usedD.has(j)) return;
      // 周りの人の枠と大きく重なる新しい枠は、重なりの見まちがいとして作らない
      if (this.active.some(tr => usedT.has(tr) && !amb.has(tr) && iou(lastBox(tr), d) > 0.5)) return;
      const tr = { id: this.next++, s: [], spd: [], vx: 0, vy: 0, hist: new Float32Array(NB), hn: 0, thumbArea: 0, thumb: null };
      this.active.push(tr); this._add(tr, t, d, src, dhs[j]);
    });
    this.active = this.active.filter(tr => {
      if (t - tr.s[tr.s.length - 1][0] > 0.8) { this.done.push(tr); return false; }
      return true;
    });
  }
  _add(tr, t, d, src, h) {
    const q = tr.s[tr.s.length - 1];
    if (q && tr._pc) { // カメラの動きを差し引いた速さ（いまのコマの座標で）
      const dt = Math.max(1e-3, t - q[0]);
      const vx = ((d.x1 + d.x2) / 2 - tr._pc[0]) / dt, vy = ((d.y1 + d.y2) / 2 - tr._pc[1]) / dt;
      if (isFinite(vx) && isFinite(vy)) {
        tr.vx = tr.s.length > 1 ? tr._pv[0] * 0.5 + vx * 0.5 : vx; tr.vy = tr.s.length > 1 ? tr._pv[1] * 0.5 + vy * 0.5 : vy;
        if (dt < 0.5) tr.spd.push(Math.hypot(vx * this.aspect, vy) / Math.max(1e-3, d.y2 - d.y1));
      }
    }
    tr.T0 = this.Tcur;
    if (q) { // 画面の中での動き
      const dt = Math.max(1e-3, t - q[0]);
      const vx = ((d.x1 + d.x2) / 2 - (q[1] + q[3]) / 2) / dt, vy = ((d.y1 + d.y2) / 2 - (q[2] + q[4]) / 2) / dt;
      tr.ivx = tr.s.length > 1 ? tr.ivx * 0.5 + vx * 0.5 : vx; tr.ivy = tr.s.length > 1 ? tr.ivy * 0.5 + vy * 0.5 : vy;
    }
    tr.s.push([t, d.x1, d.y1, d.x2, d.y2, d.score]);
    if (h) { for (let i = 0; i < NB; i++) tr.hist[i] += h[i]; tr.hn++; }
    const area = (d.x2 - d.x1) * (d.y2 - d.y1) * d.score;
    if (area > tr.thumbArea * 1.15 && d.x1 > 0.003 && d.x2 < 0.997) { tr.thumbArea = area; tr.thumb = cropThumb(src, d, this.W, this.H); }
  }
  finish() { this.done.push(...this.active); this.active = []; return this.done; }
}
const lastBox = tr => { const L = tr.s[tr.s.length - 1]; return { x1: L[1], y1: L[2], x2: L[3], y2: L[4] }; };
function mapBox(T, d) {
  const ps = [apply(T, d.x1, d.y1), apply(T, d.x2, d.y1), apply(T, d.x1, d.y2), apply(T, d.x2, d.y2)];
  const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), score: d.score };
}
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
// anchor：線を合わせたコマ（LineAnchor）。毎回そのコマに重ねて、いまのコマでの線の位置を求める。
// motion：各コマの [時刻, いまのコマ→基準(9), いまのコマ→線のコマ(9 または null)]
export async function scanVideo(video, { tiles = 1, step: gap = 0.1, anchor, stripe, onFrame, onProgress, isStopped }) {
  const W = video.videoWidth, H = video.videoHeight;
  const tracker = new Tracker(W, H), chain = new MotionChain(), motion = [], lt = anchor ? new LineTracker(anchor, stripe) : null;
  await seekTo(video, 0);
  video.muted = true;
  let rate = 2; video.playbackRate = rate;
  let lastT = -1, gaps = [], frames = 0, slow = false;
  const work = t => {
    grabSmall(video, W, H);
    const dets = detectFrame(video, W, H, tiles);
    const P = grabGray(video, W, H), T = chain.step(P, dets);
    const loc = lt ? lt.step(t, P, T, dets, video) : null;
    motion.push([t, T, loc ? loc.Hk : null, loc ? loc.line : null, loc ? loc.snapped : false]);
    tracker.update(t, dets, video, T);
    frames++;
    if (lastT >= 0 && !slow) {
      gaps.push(t - lastT);
      if (gaps.length >= 6) { // 1回の間に進む動画の時間を 0.07 秒くらいにする
        const g = gaps.reduce((a, b) => a + b) / gaps.length; gaps = [];
        if (g > gap * 1.2 && rate <= 1) slow = true; // 等倍でも追いつかない端末：止めて gap 秒ずつ送る
        else if (g > gap && rate > 1) rate = Math.max(1, rate - 0.5);
        else if (g < gap * 0.55 && rate < 4) rate = Math.min(4, rate + 0.25);
        video.playbackRate = rate;
      }
    }
    lastT = t;
    onFrame && onFrame(t, dets, slow ? 0 : rate, loc ? loc.line : null);
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
        if (slow) return end(meta.mediaTime + gap);
        video.requestVideoFrameCallback(step);
      };
      video.onended = () => setTimeout(() => end(video.duration), 50);
      video.requestVideoFrameCallback(step);
      video.play().catch(rej);
    });
  }
  // 古いブラウザや遅い端末：0.1 秒ずつ送って解析
  for (let t = from; t < video.duration - 0.02; t += gap) {
    if (isStopped && isStopped()) break;
    const mt = await seekTo(video, t); work(mt);
  }
  video.onended = null; video.playbackRate = 1;
  return { tracks: tracker.finish(), frames, motion };
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
// 赤い画素を集め、多くの赤い画素が乗る直線を探す（RANSAC）。
// 壁（フェンス）の赤い帯は使わない：短くてほぼ縦の線・画面の上半分だけにある線は外す（氷の上のラインは手前まで長く伸びる）。
export function findRedLine(src, W, H) {
  const w = 320, h = Math.round(320 * H / W);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(src, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, pts = [], edge = wallEdge(d, w, h), margin = Math.max(4, h * 0.05);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (isLineRed(r, g, b) && !(edge && y <= edge(x) + margin)) pts.push([x, y]); // 薄い赤だけ・壁の側と写り込みは入れない
  }
  if (pts.length < 30) return null;
  const inl = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); let n = 0;
    for (let i = 0; i < pts.length; i += 2) { const p = pts[i]; if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1.6) n++; } return n; };
  const cands = [];
  for (let k = 0; k < 800; k++) {
    const a = pts[(Math.random() * pts.length) | 0], b = pts[(Math.random() * pts.length) | 0];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 20) continue;
    cands.push({ a, b, n: inl(a, b) });
  }
  cands.sort((x, y) => y.n - x.n);
  for (const { a, b, n } of cands.slice(0, 40)) {
    if (n < 20) break;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), us = [];
    for (const p of pts) if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1.6) us.push(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L);
    us.sort((x, y) => x - y);
    const u1 = us[Math.floor(us.length * 0.02)], u2 = us[Math.floor(us.length * 0.98)];
    const P = u => [(a[0] + dx / L * u) / w, (a[1] + dy / L * u) / h];
    const e1 = P(u1), e2 = P(u2), vert = Math.abs(dx) / L < 0.26, span = Math.abs(e2[1] - e1[1]), low = Math.max(e1[1], e2[1]);
    if (vert && span < 0.35) continue;   // 短い縦の帯＝壁の赤い帯
    if (low < 0.5) continue;              // 画面の上半分だけ＝壁や観客席
    if (Math.hypot((e2[0] - e1[0]) * w, (e2[1] - e1[1]) * h) < 40) continue; // 短すぎる
    // 本物の線は「とぎれずに・ぎっしり」赤い。氷のうすい色むらを拾っただけの線（まばら・とぎれとぎれ）は線としない
    const segL = Math.max(1, u2 - u1), bins = new Uint8Array(12); let inSeg = 0;
    for (const u of us) if (u >= u1 && u <= u2) { inSeg++; bins[Math.min(11, Math.floor((u - u1) / segL * 12))] = 1; }
    const filled = bins.reduce((s, x) => s + x, 0), dens = inSeg / segL;
    if (globalThis.__RL) globalThis.__RL.push({ dens: +dens.toFixed(2), filled, n, e1, e2 });
    if (filled < 10 || dens < 1.2) continue;
    if (Math.min(e1[1], e2[1]) > 0.93) continue; // 画面のいちばん下にはりついた横線＝写り込みや氷の色むら
    if (edge) { // 境目と平行で、境目に近い線は、壁の帯の写り込み
      const d1 = e1[1] * h - edge(e1[0] * w), d2 = e2[1] * h - edge(e2[0] * w);
      if (Math.abs(d1 - d2) < h * 0.05 && Math.max(d1, d2) < h * 0.2) continue;
    }
    return e1[1] < e2[1] ? [e1, e2] : [e2, e1];
  }
  return null;
}

// ---------- ライン通過 ----------
// 足もと（枠の下のまん中）とラインの、ゆがみを考えた符号つき距離（ピクセル）と、線のどのあたりか（0〜1）
export function lineMetric(line, W, H, x1, y2, x2) {
  const ax = line[0][0] * W, ay = line[0][1] * H, bx = line[1][0] * W, by = line[1][1] * H;
  const px = (x1 + x2) / 2 * W, py = y2 * H, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
  return { s: ((px - ax) * dy - (py - ay) * dx) / L, u: ((px - ax) * dx + (py - ay) * dy) / L2 };
}
// 足もとを「線のコマ」の位置に置き直してから比べる（カメラが振れても、止まっている人は線を越えない）
export function footMetric(line, W, H, Hk, x1, y2, x2) {
  const q = apply(Hk, (x1 + x2) / 2, y2);
  return lineMetric(line, W, H, q[0], q[1], q[0]);
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
// measure(t, x1, y2, x2)：その時刻のコマで、足もととラインの符号つき距離 {s, u}。線の位置が分からないコマは null
export function trackCrossings(tr, measure) {
  const m = [];
  for (const r of tr.s) { const q = measure(r[0], r[1], r[4], r[3]); if (q) m.push({ t: r[0], ...q }); }
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
// ctx：{ line（線のコマでの線）, K（線のコマの白黒ピラミッド）, HkNear(t)（予想用）, lineNear(t)（近いコマの線。予想用）, measure(t,…), tiles }
export async function refineCrossing(video, cr, tr, ctx) {
  const W = video.videoWidth, H = video.videoHeight;
  const boxAt = t => interpBox(tr.s, t, 0.8);
  const pts = [], seen = new Set();
  for (let k = -9; k <= 9; k++) {
    const mt = await seekTo(video, cr.t + k / 30);
    const key = Math.round(mt * 1000); if (seen.has(key)) continue; seen.add(key);
    const ref = boxAt(mt); if (!ref) continue;
    const dets = detectFrame(video, W, H, ctx.tiles || 1);
    let best = null, bi = 0.3;
    for (const d of dets) { const v = iou(d, ref); if (v > bi) { bi = v; best = d; } }
    if (!best) continue;
    // このコマを線のコマに直接重ねて、このコマでの線の位置を求める
    let Hk = null;
    if (ctx.K) {
      const P = grabGray(video, W, H), init = ctx.HkNear(mt);
      const r = estimate(P, ctx.K, init || I3(), dets, !init);
      if (r && r.inl >= 20 && r.ratio >= 0.3) Hk = r.H;
    } else Hk = I3();
    // 写っている赤い線で合わせ直す
    grabSmall(video, W, H);
    const pred = Hk ? ctx.line.map(q => apply(inv3(Hk), q[0], q[1])) : ctx.lineNear(mt);
    const sn = pred ? snapRedLine(pred, dets) : null;
    if (sn) pts.push([mt, lineMetric(sn, W, H, best.x1, best.y2, best.x2).s]);
    else if (Hk) pts.push([mt, footMetric(ctx.line, W, H, Hk, best.x1, best.y2, best.x2).s]);
  }
  // 解析の時に取れた位置も合わせる（見直しで見失ったコマを補う）
  for (const r of tr.s) {
    if (Math.abs(r[0] - cr.t) >= 0.35 || pts.some(p => Math.abs(p[0] - r[0]) < 0.012)) continue;
    const q = ctx.measure(r[0], r[1], r[4], r[3]); if (q) pts.push([r[0], q.s]);
  }
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
// 同じ人をまとめる。まちがえて別の人をまとめると、追いかけ動画が別の人に乗り移るので厳しめにする。
// ・すぐ後（1.5秒以内）に近い場所に出てきて、色が似ている → まとめる
// ・離れた時間 → 服もヘルメットも、とてもよく似ている時だけ（登録した部員は app.js で別にまとめる）
export function groupTracks(tracks) {
  const groups = tracks.map(tr => ({ ids: [tr.id], segs: [{ a: tr.s[0], b: tr.s[tr.s.length - 1] }], hist: norm(tr.hist, tr.hn), n: tr.hn }));
  const overlap = (g, h) => g.segs.some(x => h.segs.some(y => Math.min(x.b[0], y.b[0]) - Math.max(x.a[0], y.a[0]) > 0.2));
  const near = (g, h) => { // g の終わり → h の始まり（またはその逆）が、時間も場所も近いか
    for (const x of g.segs) for (const y of h.segs) for (const [e, st] of [[x.b, y.a], [y.b, x.a]]) {
      const gap = st[0] - e[0]; if (gap < 0 || gap > 1.5) continue;
      const eh = e[4] - e[2], d = Math.hypot((e[1] + e[3]) / 2 - (st[1] + st[3]) / 2, ((e[2] + e[4]) - (st[2] + st[4])) / 2);
      if (d < eh * (1.5 + gap * 2)) return true;
    }
    return false;
  };
  for (;;) {
    let best = null, bv = 0;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const g = groups[i], h = groups[j];
      if (overlap(g, h)) continue;
      const v = histSim(g.hist, h.hist);
      let ok = false, sc = v;
      if (v >= 0.9 && headSim(g.hist, h.hist) >= 0.85 && near(g, h)) { ok = true; sc = v + 0.1; }
      else if (v >= 0.95 && headSim(g.hist, h.hist) >= 0.92 && g.n >= 8 && h.n >= 8) ok = true;
      if (ok && sc > bv) { bv = sc; best = [i, j]; }
    }
    if (!best) break;
    const [i, j] = best, g = groups[i], h = groups[j], ni = g.n || 1, nj = h.n || 1;
    const hist = new Float32Array(NB); for (let k = 0; k < NB; k++) hist[k] = (g.hist[k] * ni + h.hist[k] * nj) / (ni + nj);
    groups[i] = { ids: [...g.ids, ...h.ids], segs: [...g.segs, ...h.segs], hist, n: ni + nj };
    groups.splice(j, 1);
  }
  return groups.map(g => g.ids);
}
function norm(h, n) { const o = new Float32Array(NB); for (let i = 0; i < NB; i++) o[i] = n ? h[i] / n : 0; return o; }

// ---------- その場で測る（撮影しながら）----------
// 追いかけ中の人の、いちばん新しい2つの位置の間でラインを越えたかを調べる。越えていれば通過を返す。
export function liveCrossing(tr, measure) {
  const n = tr.s.length; if (n < 2) return null;
  const A = tr.s[n - 2], B = tr.s[n - 1];
  if (B[0] - A[0] > 0.6) return null;
  const a = measure(A[0], A[1], A[4], A[3]), b = measure(B[0], B[1], B[4], B[3]); if (!a || !b) return null;
  if (!(a.s < 0 && b.s >= 0) && !(a.s > 0 && b.s <= 0)) return null;
  const um = (a.u + b.u) / 2; if (um < -0.15 || um > 1.15) return null;
  const t = A[0] + (B[0] - A[0]) * (a.s / (a.s - b.s));
  if (tr.lastCross != null && t - tr.lastCross < 3) return null;
  tr.lastCross = t;
  return { t, dir: b.s > a.s ? 1 : -1, track: tr.id, refined: false, ds: Math.abs(b.s - a.s) / Math.max(0.03, B[0] - A[0]), bh: B[4] - B[2] };
}
export function normHist(h, n) { const o = new Float32Array(h.length); for (let i = 0; i < h.length; i++) o[i] = n ? h[i] / n : 0; return o; }
