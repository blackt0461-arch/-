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
      (ITEMS[id].kind === 'm' ? FE.m : FE.e).push({ id, v });
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
  function iconFeat(rgba, kind) {
    const a = new Float32Array(64 * 64 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { a[j] = rgba[i]; a[j + 1] = rgba[i + 1]; a[j + 2] = rgba[i + 2]; }
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
            if (n && c / n > 0.6) tiles.push({ x, y: yt, w: tw });
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

  function matchTile(src, t, kind) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    const refs = FE[kind], best = new Float32Array(refs.length).fill(-9);
    for (const dx of [-0.05, 0, 0.05]) for (const dy of [-0.05, 0, 0.05]) for (const sc of [0.94, 1, 1.06]) {
      const side = t.w * sc, ccx = t.x + t.w / 2 + dx * t.w, ccy = t.y + t.w / 2 + dy * t.w;
      cx.clearRect(0, 0, 64, 64);
      cx.drawImage(src, Math.round(ccx - side / 2), Math.round(ccy - side / 2), Math.round(side), Math.round(side), 0, 0, 64, 64);
      const f = iconFeat(cx.getImageData(0, 0, 64, 64).data, kind);
      for (let k = 0; k < refs.length; k++) {
        const v = refs[k].v; if (v.length !== f.length) continue;
        let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * v[i];
        if (s > best[k]) best[k] = s;
      }
    }
    let i1 = -1, i2 = -1;
    for (let k = 0; k < refs.length; k++) { if (i1 < 0 || best[k] > best[i1]) { i2 = i1; i1 = k; } else if (i2 < 0 || best[k] > best[i2]) i2 = k; }
    return { id: refs[i1].id, score: best[i1], margin: best[i1] - (i2 >= 0 ? best[i2] : 0) };
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
    const found = new Map(); let tilesAll = 0, bad = 0;
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
      for (const t of tiles) {
        const m = matchTile(cv, t, k2);
        const cur = per.get(m.id) || { it: ITEMS[m.id], n: 0, rank: '', unsure: false, score: 1 };
        cur.n++;
        if (k2 === 'm') { const rk = rankOf(d, W, t); if (rk && (!cur.rank || 'SABCD'.indexOf(rk) < 'SABCD'.indexOf(cur.rank))) cur.rank = rk; }
        if (m.score < 0.45 || m.margin < 0.03) cur.unsure = true;
        cur.score = Math.min(cur.score, m.score);
        per.set(m.id, cur);
        await new Promise(r => setTimeout(r, 0));
      }
      // 同じものが 何枚かの スクショに 重なって 写るので、数は 枚をまたいで 足さずに 一番多い数を とる
      for (const [id, v] of per) {
        const f = found.get(id);
        if (!f) found.set(id, v);
        else { f.n = Math.max(f.n, v.n); if (v.rank && (!f.rank || 'SABCD'.indexOf(v.rank) < 'SABCD'.indexOf(f.rank))) f.rank = v.rank; f.unsure = f.unsure && v.unsure; }
      }
    }
    pending = { kind, results: [...found.values()], tilesAll, bad, files: files.length };
    confirmView();
  }

  function confirmView() {
    const { kind, results, tilesAll, bad, files } = pending;
    const isMem = kind === 'mem';
    const rows = results.sort((a, b) => a.unsure - b.unsure || a.it.n.localeCompare(b.it.n, 'ja')).map((r, i) => `<label class="line" style="align-items:center"><span class="k"><input type="checkbox" data-scanrow="${i}" checked style="width:20px;height:20px;vertical-align:middle"> ${isMem ? (r.rank || 'S') : '×' + r.n}</span><span class="v vi">${ico(r.it, 32)}<span>${esc(r.it.n)}${r.unsure ? ' <span style="color:var(--gold)">？たしかめて</span>' : ''}</span></span></label>`).join('');
    sheet(`<div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0">${results.length}しゅるい 見つかりました</h2><button class="btn" data-act="close">やめる</button></div>
      <div class="note">${files}まいの 写真から アイコン ${tilesAll}こ を 見くらべました。${bad ? `（${bad}まいは ひらけませんでした）` : ''}ちがうものは チェックを はずしてください。</div>
      <div class="lines" style="margin:8px 0;max-height:38vh;overflow:auto">${rows || '<div class="note">アイコンが 見つかりませんでした。ゲームの「もちもの」の一覧画面を そのまま スクショしてください。</div>'}</div>
      <label class="row note" style="margin-top:8px;gap:6px"><input type="checkbox" id="scanall" checked style="width:20px;height:20px">
        ${isMem ? 'よみとれなかった メモリは「もっていない」にする（一覧を さいごまで 撮ったとき）' : '写っていた しゅるい（武器・盾など）で、よみとれなかった そうびは 0こにする（その一覧を さいごまで 撮ったとき）'}</label>
      ${isMem ? '<label class="row note" style="gap:6px"><input type="checkbox" id="scanrank" checked style="width:20px;height:20px">ランクも 入れる（いちばん 高いもの）</label>' : '<div class="note">レベルと 凸は よみとれないので、強化したものは あとで 入れてください。</div>'}
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
      if (useRank) for (const r of results) if (r.rank) S.memRank[r.it.id] = r.rank;
    } else {
      // 写っていた 種類（武器・盾など）の中だけ 入れかえる
      const cat = it => it.kind === 'w' ? 'w' : it.kind === 'c' ? 'c' : it.t;
      const cats = new Set(results.map(r => cat(r.it)));
      if (all) for (const id of Object.keys(S.eq)) if (ITEMS[id] && ITEMS[id].kind !== 'm' && cats.has(cat(ITEMS[id]))) S.eq[id].n = 0;
      for (const r of results) { const s = S.eq[r.it.id] || { n: 0, lv: 1, t: 0 }; s.n = Math.min(9, Math.max(s.n || 0, r.n)); S.eq[r.it.id] = s; }
    }
    S.example = false; pending = null;
    document.getElementById('sheet').hidden = true;
    invalidate(); save(); render();
  }

  function runFiles(kind, files) { sheet('<div class="thinking" style="margin-top:8px">よみこみちゅう…</div>'); run(kind, files).catch(showError); }
  return { start, apply, runFiles };
})();
