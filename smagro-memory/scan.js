/* ===== スクショから もちものを よみこむ（AIなし・絵の見比べ） =====
 * 1. スクショの中から、名前の帯（こげ茶）を目じるしに アイコンの位置を見つける
 * 2. アイコンのまん中の絵を、feats.json（毎日の自動更新で作る「見分けるための特徴」）と見比べる
 * 3. メモリは 左上の文字の色で ランクも見分ける
 * 特徴の計算は tools/iconfeat.py と同じにすること。
 */
const Scan = (() => {
  const LABEL = [65, 55, 47], BG = [131, 106, 70];
  let FE = null;          // {n, blur, baseW, m:[{id,v}], e:[{id,v}]}
  let pending = null;

  function sheet(html) { const sh = document.getElementById('sheet'); sh.innerHTML = `<div class="win"><span class="tag">スクショから よみこむ</span>${html}</div>`; sh.hidden = false; }
  const setProg = t => { const p = document.getElementById('scanprog'); if (p) p.textContent = t; };

  async function loadFeats() {
    if (FE) return FE;
    const js = await (await fetch('feats.json', { cache: 'no-cache' })).json();
    FE = { n: js.n, blur: js.blur, baseW: js.base_w, m: [], e: [] };
    for (const [id, b64] of Object.entries(js.items)) {
      if (!ITEMS[id]) continue;
      const bin = atob(b64), v = new Float32Array(bin.length);
      let s = 0;
      for (let i = 0; i < bin.length; i++) { const q = bin.charCodeAt(i); v[i] = q > 127 ? q - 256 : q; s += v[i] * v[i]; }
      s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s;
      (ITEMS[id].kind === 'm' ? FE.m : FE.e).push({ id, v, nn: normName(ITEMS[id].n) });
    }
    FE.mask = { m: makeMask('m', FE.n), e: makeMask('e', FE.n) };
    return FE;
  }

  function makeMask(kind, N) {
    const m = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N, y = (j + 0.5) / N; let bad;
      if (kind === 'm') { const r = Math.hypot(x - 0.5, y - 0.5); bad = r > 0.36 || (x < 0.32 && y < 0.32) || (x < 0.6 && y > 0.58) || (x > 0.68 && y > 0.68) || (x > 0.6 && y < 0.34); }
      else bad = y < 0.2 || y > 0.74 || (x > 0.6 && y < 0.42) || (x < 0.34 && y > 0.56) || (x > 0.74 && y > 0.62) || x < 0.08 || x > 0.92;
      m[j * N + i] = bad ? 0 : 1;
    }
    return m;
  }

  // 64x64 RGB(Float32 3ch) -> N x N の平均（マスクの中だけ並べる）
  function cells(a, N, mask) {
    const out = [];
    for (let j = 0; j < N; j++) {
      const y0 = Math.floor(j * 64 / N), y1 = Math.floor((j + 1) * 64 / N);
      for (let i = 0; i < N; i++) {
        if (!mask[j * N + i]) continue;
        const x0 = Math.floor(i * 64 / N), x1 = Math.floor((i + 1) * 64 / N);
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * 64 + x) * 3; r += a[k]; g += a[k + 1]; b += a[k + 2]; n++; }
        out.push(r / n, g / n, b / n);
      }
    }
    return out;
  }
  function boxBlur(a, r) {   // はしは いちばん外の色を のばす（iconfeat.py と同じ）
    const tmp = new Float32Array(a.length), out = new Float32Array(a.length), cl = v => v < 0 ? 0 : v > 63 ? 63 : v, k = 2 * r + 1;
    for (let y = 0; y < 64; y++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let d = -r; d <= r; d++) s += a[(y * 64 + cl(d)) * 3 + c];
      for (let x = 0; x < 64; x++) { tmp[(y * 64 + x) * 3 + c] = s / k; s += a[(y * 64 + cl(x + r + 1)) * 3 + c] - a[(y * 64 + cl(x - r)) * 3 + c]; }
    }
    for (let x = 0; x < 64; x++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let d = -r; d <= r; d++) s += tmp[(cl(d) * 64 + x) * 3 + c];
      for (let y = 0; y < 64; y++) { out[(y * 64 + x) * 3 + c] = s / k; s += tmp[(cl(y + r + 1) * 64 + x) * 3 + c] - tmp[(cl(y - r) * 64 + x) * 3 + c]; }
    }
    return out;
  }
  // 正方形の場所を 64x64 に縮める（マスの中の平均）。iconfeat.py の resize64 と同じ計算なので、どの機種でも同じ結果になる
  function resize64(d, W, H, x0, y0, side) {
    const a = new Float32Array(64 * 64 * 3);
    for (let v = 0; v < 64; v++) {
      const ya = Math.min(H - 1, Math.max(0, Math.floor(y0 + v * side / 64))), yb = Math.min(H, Math.max(ya + 1, Math.floor(y0 + (v + 1) * side / 64)));
      for (let u = 0; u < 64; u++) {
        const xa = Math.min(W - 1, Math.max(0, Math.floor(x0 + u * side / 64))), xb = Math.min(W, Math.max(xa + 1, Math.floor(x0 + (u + 1) * side / 64)));
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = ya; y < yb; y++) for (let x = xa, i = (y * W + xa) * 4; x < xb; x++, i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const k = (v * 64 + u) * 3; a[k] = r / n; a[k + 1] = g / n; a[k + 2] = b / n;
      }
    }
    return a;
  }
  function iconFeat(a, kind) {
    const N = FE.n, mask = FE.mask[kind];
    let v;
    if (kind === 'm') v = cells(a, N, mask);
    else {
      const bl = boxBlur(a, FE.blur), hp = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) hp[i] = a[i] - bl[i];
      const h = cells(hp, N, mask), base = cells(a, N, mask);
      const bm = base.reduce((s, x) => s + x, 0) / base.length;
      v = h.concat(base.map(x => (x - bm) * FE.baseW));
    }
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    let s = 0; const f = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) { f[i] = v[i] - mean; s += f[i] * f[i]; }
    s = Math.sqrt(s) || 1; for (let i = 0; i < f.length; i++) f[i] /= s;
    return f;
  }

  // アイコンの位置を見つける（名前の帯の上にある正方形）
  function findTiles(d, W, H) {
    const lab = i => Math.abs(d[i] - LABEL[0]) + Math.abs(d[i + 1] - LABEL[1]) + Math.abs(d[i + 2] - LABEL[2]) < 30;
    const nbg = i => Math.abs(d[i] - BG[0]) + Math.abs(d[i + 1] - BG[1]) + Math.abs(d[i + 2] - BG[2]) > 45;
    const frac = new Float32Array(H);
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0, i = y * W * 4; x < W; x++, i += 4) if (lab(i)) c++; frac[y] = c / W; }
    const groups = [];
    for (let y = 0; y < H; y++) if (frac[y] > 0.12) { const g = groups[groups.length - 1]; if (g && y - g[g.length - 1] <= 0.05 * W) g.push(y); else groups.push([y]); }
    const tiles = [];
    for (const g of groups) {
      const top = g[0], bot = g[g.length - 1];
      if (!(bot - top >= 0.025 * W && bot - top <= 0.07 * W)) continue;
      let r = top; for (let yy = top; yy < top + Math.max(2, Math.floor((bot - top) / 3)); yy++) if (frac[yy] > frac[r]) r = yy;
      const L = x => lab((r * W + x) * 4);
      for (let x = 0; x < W; x++) {
        if (!L(x)) continue;
        let x2 = x, miss = 0;
        while (x2 < W && miss <= 3) { miss = L(x2) ? 0 : miss + 1; x2++; }
        x2 -= miss;
        if (x2 - x > 0.10 * W) {
          const tw = x2 - x, sx0 = x + Math.floor(2 * tw / 5), sx1 = x + Math.floor(3 * tw / 5);
          const row = y => { let c = 0; for (let xx = sx0; xx < sx1; xx++) if (nbg((y * W + xx) * 4)) c++; return c / (sx1 - sx0) > 0.5; };
          let yb = top - 1;
          while (yb > top - 0.06 * W && !row(yb)) yb--;
          const yt = yb - tw;
          if (yt >= 0) {
            let c = 0, n = 0; for (let y = yt + Math.floor(tw / 4); y < yb - Math.floor(tw / 4); y++) { n++; if (row(y)) c++; }
            if (n && c / n > 0.6) tiles.push({ x, y: yt, w: tw, lab: { x, y: top, w: tw, h: Math.max(4, bot - top + 1) } });
          }
        }
        x = x2;
      }
    }
    return tiles.sort((a, b) => Math.round(a.y / 50) - Math.round(b.y / 50) || a.x - b.x);
  }

  // メモリのランク（左上の文字の色）
  const RANKC = { S: [208, 190, 238], A: [249, 227, 103], B: [194, 209, 233], C: [219, 195, 161], D: [188, 181, 169] };
  function rankOf(d, W, t) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.max(0, Math.round(t.y - 0.02 * t.w)); y < t.y + 0.24 * t.w; y++) for (let x = t.x; x < t.x + 0.24 * t.w; x++) {
      const i = (y * W + x) * 4; if (d[i] + d[i + 1] + d[i + 2] > 420) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    if (!n) return '';
    r /= n; g /= n; b /= n;
    let best = '', bd = 1e9;
    for (const [k, c] of Object.entries(RANKC)) { const dd = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
    return best;
  }

  // 絵の見くらべ：少しずらしながら いちばん合う 位置での 点数を、見本ごとに 返す
  function imageScores(d, W, H, t, kind) {
    const refs = FE[kind], best = new Float32Array(refs.length).fill(-9);
    for (const dx of [-0.05, 0, 0.05]) for (const dy of [-0.05, 0, 0.05]) for (const sc of [0.94, 1, 1.06]) {
      const side = t.w * sc, cx = t.x + t.w / 2 + dx * t.w, cy = t.y + t.w / 2 + dy * t.w;
      const f = iconFeat(resize64(d, W, H, cx - side / 2, cy - side / 2, side), kind);
      for (let k = 0; k < refs.length; k++) {
        const v = refs[k].v; if (v.length !== f.length) continue;
        let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * v[i];
        if (s > best[k]) best[k] = s;
      }
    }
    return best;
  }
  // 名前の文字（読めたとき）と 絵の点数を あわせて 決める
  function decide(kind, img, text) {
    const refs = FE[kind], tot = new Float32Array(refs.length);
    const tn = normName(text || '');
    for (let k = 0; k < refs.length; k++) tot[k] = img[k] + (tn.length >= 2 ? 0.6 * nameSim(tn, refs[k].nn) : 0);
    let i1 = -1, i2 = -1;
    for (let k = 0; k < refs.length; k++) { if (i1 < 0 || tot[k] > tot[i1]) { i2 = i1; i1 = k; } else if (i2 < 0 || tot[k] > tot[i2]) i2 = k; }
    return { id: refs[i1].id, score: img[i1], text: tn, textSim: tn.length >= 2 ? nameSim(tn, refs[i1].nn) : 0, margin: tot[i1] - (i2 >= 0 ? tot[i2] : 0) };
  }
  function normName(s) { return String(s).normalize('NFKC').replace(/[\s・･\.。、,|｜_\-—ー〜~'"`]/g, m => m === 'ー' ? 'ー' : '').replace(/？/g, '?'); }
  function nameSim(a, b) {
    if (!a || !b) return 0;
    const m = a.length, n = b.length, dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) { let prev = dp[0]; dp[0] = i; for (let j = 1; j <= n; j++) { const t = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
    return 1 - dp[n] / Math.max(m, n);
  }

  // ===== 文字の読み取り（Tesseract.js・スマホの中で動く。初回だけ 部品を ダウンロード） =====
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
  const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
  const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0_best_int';
  let ocrWorker = null;
  async function getOcr() {
    if (ocrWorker) return ocrWorker;
    if (!window.Tesseract) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = TESS + 'tesseract.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('文字読み取りの部品を ダウンロードできませんでした')); document.head.append(sc); });
    ocrWorker = await window.Tesseract.createWorker('jpn', 1, { workerPath: TESS + 'worker.min.js', corePath: CORE, langPath: LANG });
    return ocrWorker;
  }
  // 名前の帯を ぬき出して 白地に黒い文字にし、3倍にして 読む
  function labelCanvas(d, W, t) {
    const lx = t.lab.x, ly = t.lab.y, lw = t.lab.w, lh = t.lab.h, S = 3;
    const c = document.createElement('canvas'); c.width = lw * S; c.height = lh * S;
    const g = c.getContext('2d'); const im = g.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const i = ((ly + y) * W + lx + x) * 4, j = (y * lw + x) * 4;
      const v = 255 - Math.min(255, Math.max(0, (d[i] + d[i + 1] + d[i + 2]) / 3 * 1.4 - 60));
      im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = lw; tmp.height = lh; tmp.getContext('2d').putImageData(im, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, lw * S, lh * S);
    return c;
  }
  // アイコンの中の 一部分（割合で指定）を、色で 文字だけ 黒にして 4倍にする
  function regionCanvas(d, W, t, box, isInk, nearDark) {
    const x0 = Math.round(t.x + box[0] * t.w), y0 = Math.round(t.y + box[1] * t.w), w = Math.round((box[2] - box[0]) * t.w), h = Math.round((box[3] - box[1]) * t.w), S = 4, P = 8;
    const im = new ImageData(w + 2 * P, h + 2 * P); im.data.fill(255);
    let ink = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4, j = ((y + P) * (w + 2 * P) + x + P) * 4;
      let ok = isInk(d[i], d[i + 1], d[i + 2]);
      if (ok && nearDark) {   // 黒い ふちどりの 近く（左右 上下 5ドット以内）に ある 黄色だけを 文字とみなす
        ok = false;
        for (const [ax, ay] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { for (let k = 1; k <= 5 && !ok; k++) { const ii = ((y0 + y + ay * k) * W + x0 + x + ax * k) * 4; if (DARK(d[ii], d[ii + 1], d[ii + 2])) ok = true; } }
      }
      if (ok) { im.data[j] = im.data[j + 1] = im.data[j + 2] = 0; ink++; }
    }
    const tmp = document.createElement('canvas'); tmp.width = w + 2 * P; tmp.height = h + 2 * P; tmp.getContext('2d').putImageData(im, 0, 0);
    const c = document.createElement('canvas'); c.width = tmp.width * S; c.height = tmp.height * S;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, c.width, c.height);
    return { c, ink: ink / (w * h) };
  }
  const YELLOW = (r, g, b) => r > 190 && g > 150 && b < 140 && r - b > 80;
  const DARK = (r, g, b) => r + g + b < 260;
  const ORANGE = (r, g, b) => r > 200 && g > 105 && g < 195 && b < 140 && r - b > 95;
  // 凸の数字（1〜5）の 形を 10x14 マスの 白黒にする
  function digitVec(d, W, t) {
    const x0 = Math.round(t.x + 0.13 * t.w), y0 = Math.round(t.y + 0.57 * t.w), w = Math.round(0.17 * t.w), h = Math.round(0.20 * t.w);
    const ink = new Uint8Array(w * h); let minx = w, maxx = -1, miny = h, maxy = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4;
      if (!ORANGE(d[i], d[i + 1], d[i + 2])) continue;
      let ok = false;
      for (const [ax, ay] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let k = 1; k <= 5 && !ok; k++) { const ii = ((y0 + y + ay * k) * W + x0 + x + ax * k) * 4; if (DARK(d[ii], d[ii + 1], d[ii + 2])) ok = true; }
      if (!ok) continue;
      ink[y * w + x] = 1; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    if (maxx < 0) return null;
    const GX = 10, GY = 14, v = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const xa = minx + Math.floor(i * (maxx - minx + 1) / GX), xb = Math.max(xa + 1, minx + Math.floor((i + 1) * (maxx - minx + 1) / GX));
      const ya = miny + Math.floor(j * (maxy - miny + 1) / GY), yb = Math.max(ya + 1, miny + Math.floor((j + 1) * (maxy - miny + 1) / GY));
      let c = 0, n = 0; for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { c += ink[y * w + x]; n++; }
      v.push(n ? c / n : 0);
    }
    return v;
  }
  // 1〜5 の 見本（ゲームのスクショから作った 10x14 マスの 形）
  const DIGITS = {"1":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.78,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.22,0.78,1.0,1.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,1.0,1.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.0,0.22,0.0,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.78,1.0,0.22,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.22,1.0,0.78,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.0,0.56,1.0,0.56,0.0,0.0,0.0,0.56,1.0,1.0,1.0,1.0,1.0,0.78,0.0,0.0,0.0,0.56,1.0,1.0,1.0,1.0,1.0,1.0,0.15,0.0,0.0,0.56,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0],"2":[0.0,0.0,0.0,0.0,0.0,0.5,1.0,1.0,0.5,0.17,0.0,0.0,0.0,0.0,0.28,0.94,0.89,0.78,1.0,0.44,0.0,0.0,0.0,0.0,0.78,0.83,0.28,0.28,0.78,0.94,0.0,0.0,0.0,0.0,1.0,0.5,0.0,0.0,0.28,1.0,0.0,0.0,0.0,0.0,1.0,0.33,0.0,0.0,0.11,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,0.11,0.39,0.0,0.0,0.0,0.0,0.0,0.22,1.0,0.78,0.0,1.0,0.28,0.0,0.0,0.0,0.0,0.67,1.0,0.5,0.0,0.78,0.89,0.0,0.0,0.0,0.5,1.0,0.67,0.11,0.28,0.94,0.56,0.0,0.0,0.61,1.0,0.72,0.0,0.0,1.0,1.0,0.0,0.0,0.11,1.0,0.89,0.0,0.0,0.0,1.0,0.89,0.0,0.0,0.89,1.0,0.11,0.0,0.0,0.0,0.0,0.0,0.0,0.22,1.0,1.0,0.67,0.56,0.56,0.56,0.0,0.0,0.0,0.11,1.0,1.0,1.0,1.0,1.0,1.0],"3":[0.0,0.0,0.0,0.0,0.0,0.94,1.0,1.0,0.78,0.11,0.0,0.0,0.0,0.0,0.83,0.89,0.5,0.56,1.0,0.44,0.0,0.0,0.0,0.11,0.83,0.39,0.0,0.11,0.78,0.67,0.0,0.0,0.0,0.17,0.5,0.17,0.0,0.11,1.0,0.67,0.0,0.22,0.0,0.0,0.0,0.0,0.33,0.5,1.0,0.39,0.28,0.5,0.11,0.0,0.0,0.0,0.0,0.22,0.94,0.72,0.5,0.44,0.0,0.06,0.33,0.06,0.39,0.5,0.5,0.5,0.78,0.83,0.0,0.11,0.5,0.28,0.28,0.44,0.78,0.78,0.39,0.44,0.0,0.0,0.28,0.5,0.33,0.39,0.89,0.78,0.5,0.33,0.0,0.0,0.0,0.11,0.17,0.17,0.44,0.5,0.5,0.28,0.0,0.17,0.5,0.0,0.0,0.0,0.28,0.5,0.5,0.28,0.0,0.17,0.5,0.17,0.0,0.0,0.39,0.5,0.0,0.0,0.0,0.0,0.5,0.44,0.28,0.33,0.5,0.33,0.0,0.0,0.0,0.0,0.11,0.44,0.5,0.56,0.39,0.11],"4":[0.0,0.0,0.0,0.0,0.0,0.11,0.33,0.67,0.67,0.22,0.0,0.0,0.0,0.0,0.0,0.3,0.41,0.78,0.67,0.22,0.0,0.0,0.0,0.0,0.04,0.33,0.93,0.78,0.67,0.22,0.0,0.0,0.0,0.0,0.19,0.3,1.0,0.41,0.67,0.22,0.0,0.0,0.0,0.0,0.22,0.48,0.78,0.33,0.67,0.22,0.0,0.0,0.0,0.0,0.22,0.59,0.41,0.33,0.67,0.22,0.19,0.37,0.0,0.07,0.33,0.44,0.33,0.33,0.67,0.41,0.93,0.63,0.0,0.22,0.67,0.22,0.33,0.33,0.67,0.22,1.0,0.56,0.0,0.44,0.7,0.0,0.33,0.33,0.67,0.22,1.0,0.56,0.0,0.56,0.93,0.67,0.63,0.48,0.44,0.63,1.0,0.56,0.0,0.52,1.0,0.89,0.78,0.56,0.37,0.67,1.0,0.56,0.0,0.11,0.37,0.37,0.41,0.41,0.59,0.33,0.0,0.0,0.0,0.0,0.0,0.0,0.33,0.33,0.67,0.22,0.0,0.0,0.0,0.0,0.0,0.0,0.33,0.3,0.67,0.22],"5":[0.0,0.0,0.0,0.0,0.56,1.0,1.0,1.0,1.0,0.67,0.0,0.0,0.0,0.0,1.0,0.89,0.56,0.56,0.56,0.0,0.0,0.0,0.0,0.0,1.0,0.56,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.33,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.33,0.56,0.56,0.0,0.0,0.0,0.22,0.0,0.0,1.0,1.0,1.0,1.0,1.0,0.22,1.0,0.89,0.0,0.22,1.0,0.67,0.0,0.33,1.0,0.67,1.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,1.0,1.0,0.89,0.0,0.0,0.0,0.0,0.0,0.0,0.56,1.0,1.0,0.67,0.0,0.0,0.22,0.0,0.0,0.0,0.56,1.0,1.0,0.67,0.0,0.33,1.0,0.0,0.0,0.0,0.56,1.0,0.56,0.33,0.0,0.33,1.0,0.56,0.0,0.22,1.0,0.89,0.0,0.0,0.0,0.0,0.78,1.0,0.78,1.0,1.0,0.56,0.0,0.0,0.0,0.0,0.0,0.56,0.78,0.67,0.22,0.0]};
  function readDigit(v) {
    if (!v) return 0;
    let best = 0, bs = -1;
    const nv = Math.hypot(...v) || 1;
    for (const [k, tv] of Object.entries(DIGITS)) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * tv[i]; s /= nv * (Math.hypot(...tv) || 1); if (s > bs) { bs = s; best = +k; } }
    return bs > 0.75 ? best : 0;
  }
  // そうびの Lv（左下の 黄色い文字）と 凸（△の右の 数字）
  async function readLevels(d, W, tiles) {
    let w; try { w = await getOcr(); } catch (e) { return null; }
    const out = [];
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'Lv.0123456789' });
    for (const t of tiles) {
      const r = regionCanvas(d, W, t, [0.02, 0.79, 0.64, 0.99], YELLOW, true);
      let lv = 0, raw = '';
      const tryRead = async c => { try { raw = ((await w.recognize(c)).data.text || '').replace(/\s/g, ''); const m = raw.match(/[Lv]\.?(\d{1,2})$/); return m ? +m[1] : 0; } catch (e) { return 0; } };
      if (r.ink > 0.03) lv = await tryRead(r.c);
      if (!lv) { const r2 = regionCanvas(d, W, t, [0.02, 0.79, 0.64, 0.99], YELLOW, false); if (r2.ink > 0.03) lv = await tryRead(r2.c); }
      out.push({ lv: lv >= 1 && lv <= 99 ? lv : 0, t: 0, raw });
    }
    for (let i = 0; i < tiles.length; i++) {
      const tri = regionCanvas(d, W, tiles[i], [0.02, 0.58, 0.14, 0.76], ORANGE, true);
      out[i].tri = Math.round(tri.ink * 100);
      if (tri.ink < 0.12) continue;                     // △が ない ＝ 凸なし
      const v = digitVec(d, W, tiles[i]);
      out[i].dv = v ? v.map(x => Math.round(x * 9)).join('') : '';
      out[i].t = readDigit(v);
    }
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
    return out;
  }
  async function readNames(d, W, tiles, onProg) {
    let w; try { w = await getOcr(); } catch (e) { return null; }
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
    const out = [];
    for (let i = 0; i < tiles.length; i++) {
      onProg && onProg(i, tiles.length);
      try { const r = await w.recognize(labelCanvas(d, W, tiles[i])); out.push((r.data.text || '').trim()); } catch (e) { out.push(''); }
    }
    return out;
  }

  // iPhone では、画面に置いていない 写真えらびは「えらんだあと」が 届かないことがあるので、画面の中に 置いたままにする
  let inp = null, curKind = 'mem';
  function picker() {
    if (inp) return inp;
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.id = 'scanfile';
    inp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    inp.addEventListener('change', () => {
      const files = inp.files ? [...inp.files] : [];
      if (files.length) run(curKind, files).catch(showError);
    });
    document.body.appendChild(inp);
    return inp;
  }
  function start(kind) {
    curKind = kind;
    const i = picker();
    i.value = '';
    i.click();
  }
  function showError(e) {
    sheet(`<div class="banner" style="margin-top:8px">よみこみの とちゅうで しっぱいしました。</div>
      <div class="note" style="margin-top:6px">この 文を スクショして 教えてください：${esc(String(e && (e.message || e)))}</div>
      <button class="btn" style="margin-top:10px" data-act="close">とじる</button>`);
  }
  // 写真を 絵として ひらく（だめなら べつの方法で）
  async function openImage(file) {
    try { return await createImageBitmap(file); } catch (e) { }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  async function run(kind, files) {
    sheet(`<div class="thinking" id="scanprog" style="margin-top:8px">じゅんびちゅう…</div><div class="note">スクショは この スマホの 中だけで 見くらべます（どこにも おくりません）。</div>`);
    try { await loadFeats(); } catch (e) { sheet(`<div class="banner" style="margin-top:8px">見本の データを よみこめませんでした。つうしんを たしかめてください。</div><button class="btn" data-act="close">とじる</button>`); return; }
    const k2 = kind === 'mem' ? 'm' : 'e';
    const found = new Map(); let tilesAll = 0, bad = 0, ocrNG = false;
    const thumb = (cv, t) => { const c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(cv, t.x, t.y, t.w, t.w + (t.lab ? t.lab.h + (t.lab.y - t.y - t.w) : 0), 0, 0, 48, 48 * (1 + (t.lab ? (t.lab.h + t.lab.y - t.y - t.w) / t.w : 0))); return c.toDataURL('image/jpeg', 0.8); };
    for (let fi = 0; fi < files.length; fi++) {
      setProg(`よみこみちゅう… ${fi + 1} / ${files.length}まい`);
      await new Promise(r => setTimeout(r, 20));
      let bmp; try { bmp = await openImage(files[fi]); } catch (e) { bad++; continue; }
      const bw = bmp.naturalWidth || bmp.width, bh = bmp.naturalHeight || bmp.height;
      const sc = Math.min(1, 1400 / bw), W = Math.round(bw * sc), H = Math.round(bh * sc);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const tiles = findTiles(d, W, H); tilesAll += tiles.length;
      const per = new Map();
      const names = await readNames(d, W, tiles, (i, n) => setProg(`${fi + 1} / ${files.length}まいめ：名前を よんでいます ${i + 1} / ${n}`));
      if (!names) ocrNG = true;
      const lvs = k2 === 'e' && names ? (setProg(`${fi + 1} / ${files.length}まいめ：Lvと凸を よんでいます`), await readLevels(d, W, tiles)) : null;
      try { if (localStorage.getItem('smagro.debug')) console.log('SCAN', JSON.stringify({ names, lvs })); } catch (e) { }
      for (let ti = 0; ti < tiles.length; ti++) {
        const t = tiles[ti];
        setProg(`${fi + 1} / ${files.length}まいめ：絵を くらべています ${ti + 1} / ${tiles.length}`);
        const m = decide(k2, imageScores(d, W, H, t, k2), names ? names[ti] : '');
        const cur = per.get(m.id) || { it: ITEMS[m.id], n: 0, rank: '', unsure: false, score: 1, thumb: thumb(cv, t), read: m.text, lv: 0, t: 0 };
        cur.n++;
        if (lvs && lvs[ti] && lvs[ti].lv >= cur.lv) { cur.lv = lvs[ti].lv; cur.t = Math.max(cur.t, lvs[ti].t); }
        if (k2 === 'm') { const rk = rankOf(d, W, t); if (rk && (!cur.rank || 'SABCD'.indexOf(rk) < 'SABCD'.indexOf(cur.rank))) cur.rank = rk; }
        if (m.textSim < 0.5 && (m.score < 0.45 || m.margin < 0.03)) cur.unsure = true;
        cur.score = Math.min(cur.score, m.score);
        per.set(m.id, cur);
        await new Promise(r => setTimeout(r, 0));
      }
      // 同じものが 何枚かの スクショに 重なって 写るので、数は 枚をまたいで 足さずに 一番多い数を とる
      for (const [id, v] of per) {
        const f = found.get(id);
        if (!f) found.set(id, v);
        else { f.n = Math.max(f.n, v.n); if (v.lv > f.lv) { f.lv = v.lv; f.t = v.t; } if (v.rank && (!f.rank || 'SABCD'.indexOf(v.rank) < 'SABCD'.indexOf(f.rank))) f.rank = v.rank; f.unsure = f.unsure && v.unsure; }
      }
    }
    pending = { kind, results: [...found.values()], tilesAll, bad, files: files.length, ocrNG };
    confirmView();
  }

  function confirmView() {
    const { kind, results, tilesAll, bad, files, ocrNG } = pending;
    const isMem = kind === 'mem';
    const rows = results.sort((a, b) => a.unsure - b.unsure || a.it.n.localeCompare(b.it.n, 'ja')).map((r, i) => `<label class="line" style="align-items:center"><span class="k"><input type="checkbox" data-scanrow="${i}" checked style="width:20px;height:20px;vertical-align:middle"> ${isMem ? (r.rank || 'S') : '×' + r.n}</span><span class="v vi">${r.thumb ? `<img src="${r.thumb}" alt="" width="32" height="32" style="border-radius:4px;object-fit:cover;object-position:top">` : ''}<span class="sub">→</span>${ico(r.it, 32)}<span>${esc(r.it.n)}${!isMem && r.lv ? ` <span class="sub">Lv${r.lv}${r.t ? ' ' + r.t + '凸' : ''}</span>` : ''}${r.unsure ? ' <span style="color:var(--gold)">？たしかめて</span>' : ''}</span></span></label>`).join('');
    sheet(`<div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0">${results.length}しゅるい 見つかりました</h2><button class="btn" data-act="close">やめる</button></div>
      <div class="note">${files}まいの 写真から アイコン ${tilesAll}こ を 見くらべました。${bad ? `（${bad}まいは ひらけませんでした）` : ''}ちがうものは チェックを はずしてください。左が スクショから 切りだした絵、右が 見つけたものです。${ocrNG ? '<br>（文字の読み取りが つかえなかったので、絵だけで くらべました）' : ''}</div>
      <div class="lines" style="margin:8px 0;max-height:38vh;overflow:auto">${rows || '<div class="note">アイコンが 見つかりませんでした。ゲームの「もちもの」の一覧画面を そのまま スクショしてください。</div>'}</div>
      <label class="row note" style="margin-top:8px;gap:6px"><input type="checkbox" id="scanall" checked style="width:20px;height:20px">
        ${isMem ? 'よみとれなかった メモリは「もっていない」にする（一覧を さいごまで 撮ったとき）' : '写っていた しゅるい（武器・盾など）で、よみとれなかった そうびは 0こにする（その一覧を さいごまで 撮ったとき）'}</label>
      ${isMem ? '<label class="row note" style="gap:6px"><input type="checkbox" id="scanrank" checked style="width:20px;height:20px">ランクも 入れる（いちばん 高いもの）</label>' : '<div class="note">Lvと 凸も 読みとって 入れます（同じそうびが 何こか あるときは いちばん 高いもの）。</div>'}
      <button class="btn big" style="margin-top:10px" data-act="scanapply">この ないようで とうろく</button>`);
  }

  function apply() {
    if (!pending) return;
    const { kind } = pending;
    const results = pending.results.filter((r, i) => { const cb = document.querySelector(`[data-scanrow="${i}"]`); return cb ? cb.checked : true; });
    const all = document.getElementById('scanall')?.checked;
    if (S.example) { S.eq = {}; S.example = false; }   // 「れい」の もちものは 先に 消す
    if (kind === 'mem') {
      const got = new Set(results.map(r => r.it.id));
      const useRank = document.getElementById('scanrank')?.checked;
      for (const m of MEMS) { if (got.has(m.id)) S.memNo[m.id] = false; else if (all) S.memNo[m.id] = true; }
      // こ数を 自分で 入れていない メモリは ランクを 入れかえる。入れてある メモリは、そのランクが 0こ なら 1こに する
      if (useRank) for (const r of results) if (r.rank) {
        const c = S.memCnt[r.it.id];
        if (!c) S.memRank[r.it.id] = r.rank; else if (!(c[r.rank] > 0)) { if (!RANKS.some(k => c[k] > 0)) S.memCnt[r.it.id] = {}; S.memCnt[r.it.id][r.rank] = 1; }
      }
    } else {
      // 写っていた 種類（武器・盾など）の中だけ 入れかえる
      const cat = it => it.kind === 'w' ? 'w' : it.kind === 'c' ? 'c' : it.t;
      const cats = new Set(results.map(r => cat(r.it)));
      if (all) for (const id of Object.keys(S.eq)) if (ITEMS[id] && ITEMS[id].kind !== 'm' && cats.has(cat(ITEMS[id]))) S.eq[id].n = 0;
      for (const r of results) { const s = S.eq[r.it.id] || { n: 0, lv: 1, t: 0 }; s.n = Math.min(9, Math.max(s.n || 0, r.n)); if (r.lv) { s.lv = r.lv; s.t = r.t || 0; } S.eq[r.it.id] = s; }
    }
    S.example = false; pending = null;
    document.getElementById('sheet').hidden = true;
    invalidate(); save(); render();
  }

  function runFiles(kind, files) { sheet('<div class="thinking" style="margin-top:8px">よみこみちゅう…</div>'); run(kind, files).catch(showError); }
  return { start, apply, runFiles };
})();
