// 皮ふ：骨・筋肉・内臓・詰め物をまとめて包む面を作り、茶トラ柄と毛の長さを塗る。
// 方法：細かい立方体の格子（1mm）に体を描きこむ → 外側から空気をみたす → すきまを閉じる（クロージング）
//       → 少し外へふくらませた面を取り出す → なめらかにする
import { meshGrid } from './mesher.js';
import { add, sub, mul, dot, norm, cross, len } from './sdf.js';

const INF = 1e20;

// 1次元の距離変換（Felzenszwalb）
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
// 3次元の距離変換：mask が 1 の場所からの距離（格子の目の数）
function edt3d(mask, nx, ny, nz) {
  const N = nx * ny * nz, D = new Float32Array(N);
  for (let i = 0; i < N; i++) D[i] = mask[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const pass = (len, count, at) => {
    for (let c = 0; c < count; c++) {
      for (let q = 0; q < len; q++) f[q] = D[at(c, q)];
      edt1d(f, len, d, v, z);
      for (let q = 0; q < len; q++) D[at(c, q)] = d[q];
    }
  };
  pass(nx, ny * nz, (c, q) => c * nx + q);
  pass(ny, nx * nz, (c, q) => { const i = c % nx, k = (c / nx) | 0; return i + nx * (q + ny * k); });
  pass(nz, nx * ny, (c, q) => c + nx * ny * q);
  for (let i = 0; i < N; i++) D[i] = Math.sqrt(D[i]);
  return D;
}

// 3次元のなめらかな乱数（柄のゆらぎ用）
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  return r;
}

export function buildSkin({ sources, lm, nodeName, h = 1.0, closeR = 4.5, bigR = 15, thick = 2.0, log = console.log }) {
  // closeR/bigR＝すきまを閉じる大きさ（手足の先／胴）、thick＝閉じた体から皮ふまでの外向きのずれではなく、内向きの戻り幅
  // ---- 格子 ----
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of sources) for (let i = 0; i < s.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.positions[i + k]); hi[k] = Math.max(hi[k], s.positions[i + k]); }
  for (let k = 0; k < 3; k++) { lo[k] -= 12; hi[k] += 12; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const N = nx * ny * nz;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  log(`皮ふの格子 ${nx}×${ny}×${nz}`);
  const solid = new Uint8Array(N);
  const mark = (x, y, z) => {
    const i = Math.round((x - lo[0]) / h), j = Math.round((y - lo[1]) / h), k = Math.round((z - lo[2]) / h);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) solid[idx(i, j, k)] = 1;
  };
  // 三角形を格子に描きこむ
  for (const s of sources) {
    const P = s.positions, I = s.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]], b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]], c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
      const n = Math.max(1, Math.ceil(Math.max(len(sub(b, a)), len(sub(c, a)), len(sub(c, b))) / (h * 0.5)));
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
        const wa = 1 - (u + v) / n, wb = u / n, wc = v / n;
        mark(a[0] * wa + b[0] * wb + c[0] * wc, a[1] * wa + b[1] * wb + c[1] * wc, a[2] * wa + b[2] * wb + c[2] * wc);
      }
    }
  }
  // 詰め物（距離関数の中）を描きこむ（左右とも）
  for (const sh of lm.softFill) for (const sx of [1, -1]) {
    const L = [sx > 0 ? sh.lo[0] : -sh.hi[0], sh.lo[1], sh.lo[2]], H = [sx > 0 ? sh.hi[0] : -sh.lo[0], sh.hi[1], sh.hi[2]];
    for (let k = Math.max(0, Math.floor((L[2] - lo[2]) / h)); k <= Math.min(nz - 1, Math.ceil((H[2] - lo[2]) / h)); k++)
      for (let j = Math.max(0, Math.floor((L[1] - lo[1]) / h)); j <= Math.min(ny - 1, Math.ceil((H[1] - lo[1]) / h)); j++)
        for (let i = Math.max(0, Math.floor((L[0] - lo[0]) / h)); i <= Math.min(nx - 1, Math.ceil((H[0] - lo[0]) / h)); i++) {
          const x = lo[0] + i * h;
          if (sh.f(x * sx, lo[1] + j * h, lo[2] + k * h) < 0) solid[idx(i, j, k)] = 1;
        }
  }
  // ---- すきまを閉じて、外側を見つける ----
  const D = edt3d(solid, nx, ny, nz);
  // 包む大きさを場所で変える：胴（上腕・太ももをふくむ）は大きく、手足の先・しっぽは細かく
  const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const rcAt = (q) => {
    const j = ((q / nx) | 0) % ny, k = (q / (nx * ny)) | 0;
    const y = lo[1] + j * h, z = lo[2] + k * h;
    return (closeR + (bigR - closeR) * sm(80, 128, y) * sm(-28, -6, z)) / h;
  };
  const out = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const push = (q) => { if (!out[q] && D[q] > rcAt(q)) { out[q] = 1; queue[qt++] = q; } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(idx(i, j, k));
  while (qh < qt) {
    const q = queue[qh++];
    const i = q % nx, j = ((q / nx) | 0) % ny, k = (q / (nx * ny)) | 0;
    if (i > 0) push(q - 1); if (i < nx - 1) push(q + 1);
    if (j > 0) push(q - nx); if (j < ny - 1) push(q + nx);
    if (k > 0) push(q - nx * ny); if (k < nz - 1) push(q + nx * ny);
  }
  const E = edt3d(out, nx, ny, nz);
  // 皮ふの面：閉じた体の表面から thick だけ外。値は 負＝中
  const val = new Float32Array(N);
  // 皮ふの下の脂肪の厚さ：胴は厚め、手足の先・しっぽはうすめ
  const fatAt = (q) => {
    const j = ((q / nx) | 0) % ny, k = (q / (nx * ny)) | 0;
    const y = lo[1] + j * h, z = lo[2] + k * h;
    return thick + 2.6 * sm(100, 150, y) * sm(-25, -5, z);
  };
  for (let q = 0; q < N; q++) val[q] = (rcAt(q) - fatAt(q) / h - E[q]) * h;
  // ぼかしてなめらかに（1方向ずつ）
  const blur = (arr) => {
    const tmp = new Float32Array(N), kw = [0.25, 0.5, 0.25];
    const along = (src, dst, st, n, at) => {
      for (let c = 0; c < st; c++) for (let q = 0; q < n; q++) {
        let s = 0; for (let o = -1; o <= 1; o++) s += src[at(c, Math.min(n - 1, Math.max(0, q + o)))] * kw[o + 1];
        dst[at(c, q)] = s;
      }
    };
    along(arr, tmp, ny * nz, nx, (c, q) => c * nx + q);
    along(tmp, arr, nx * nz, ny, (c, q) => { const i = c % nx, k = (c / nx) | 0; return i + nx * (q + ny * k); });
    along(arr, tmp, nx * ny, nz, (c, q) => c + nx * ny * q);
    arr.set(tmp);
  };
  for (let b = 0; b < 6; b++) blur(val);
  // まぶたのすきま（目が見えるように）と鼻の穴を切る
  const cutters = [];
  for (const sx of [1, -1]) {
    const e = lm.eyeOpen;
    cutters.push({ c: [e.c[0] * sx, e.c[1], e.c[2]], axes: e.axes.map((a) => [a[0] * sx, a[1], a[2]]), r: e.r });
    const n = lm.nostril;
    cutters.push({ c: [n.c[0] * sx, n.c[1], n.c[2]], axes: n.axes.map((a) => [a[0] * sx, a[1], a[2]]), r: n.r });
  }
  for (const ct of cutters) {
    const R = Math.max(...ct.r);
    for (let k = Math.floor((ct.c[2] - R - lo[2]) / h); k <= Math.ceil((ct.c[2] + R - lo[2]) / h); k++)
      for (let j = Math.floor((ct.c[1] - R - lo[1]) / h); j <= Math.ceil((ct.c[1] + R - lo[1]) / h); j++)
        for (let i = Math.floor((ct.c[0] - R - lo[0]) / h); i <= Math.ceil((ct.c[0] + R - lo[0]) / h); i++) {
          const p = [lo[0] + i * h - ct.c[0], lo[1] + j * h - ct.c[1], lo[2] + k * h - ct.c[2]];
          const a = dot(p, ct.axes[0]) / ct.r[0], b = dot(p, ct.axes[1]) / ct.r[1], c = dot(p, ct.axes[2]) / ct.r[2];
          const d = (Math.sqrt(a * a + b * b + c * c) - 1) * Math.min(...ct.r);
          const q = idx(i, j, k);
          val[q] = Math.max(val[q], -d);
        }
  }
  // ---- 面を取り出す ----
  const mesh = meshGrid(val, nx, ny, nz, lo, h);
  log(`皮ふの面 三角形 ${(mesh.indices.length / 3).toLocaleString()} 枚`);
  return mesh;
}

// ---- 骨と一緒に動くための重み ----
// sources の頂点（重みつき）から近いものを集め、皮ふの上でならす
export function skinWeightsFromSources(mesh, sources, cell = 3) {
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const s of sources) {
    const P = s.positions;
    for (let v = 0; v < P.length / 3; v += s.stride || 1) {
      const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      let a = grid.get(k); if (!a) grid.set(k, (a = []));
      a.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2], s, v]);
    }
  }
  const n = mesh.positions.length / 3;
  let W = new Array(n);
  for (let v = 0; v < n; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let found = [];
    for (let r = 1; r <= 8 && found.length < 6; r++) {
      found = [];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        const arr = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!arr) continue;
        for (const e of arr) found.push(e);
      }
    }
    found.sort((p, q) => ((p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2) - ((q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2));
    const m = new Map();
    for (const e of found.slice(0, 6)) {
      const dd = Math.hypot(e[0] - x, e[1] - y, e[2] - z) + 0.5, wgt = 1 / dd;
      const [js, ws] = e[3].weightsOf(e[4]);
      for (let k = 0; k < js.length; k++) m.set(js[k], (m.get(js[k]) || 0) + ws[k] * wgt);
    }
    W[v] = m;
  }
  // 皮ふの上でならす（ひだや段差ができないように）
  const nb = Array.from({ length: n }, () => new Set());
  const I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) for (let a = 0; a < 3; a++) { const p = I[i + a], q = I[i + (a + 1) % 3]; nb[p].add(q); nb[q].add(p); }
  for (let it = 0; it < 8; it++) {
    const next = new Array(n);
    for (let v = 0; v < n; v++) {
      const m = new Map();
      const add = (src, f) => { let s = 0; for (const x of src.values()) s += x; for (const [k, x] of src) m.set(k, (m.get(k) || 0) + f * x / (s || 1)); };
      add(W[v], 1);
      for (const q of nb[v]) add(W[q], 1 / nb[v].size);
      next[v] = m;
    }
    W = next;
  }
  // 大きい順に4つ
  const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), dominant = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const arr = [...W[v].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = arr.reduce((t, e) => t + e[1], 0) || 1;
    arr.forEach(([j, w], k) => { joints[v * 4 + k] = j; weights[v * 4 + k] = w / s; });
    dominant[v] = arr.length ? arr[0][0] : 0;
  }
  return { joints, weights, dominant };
}

// ---- 茶トラの柄と毛の長さ ----
// 返り値：RGBA（A＝毛の長さ 0〜1。1 が 12mm）
export function tabbyColor(p, n, bone, lm) {
  const GIN = [0.84, 0.46, 0.16], DARK = [0.52, 0.22, 0.06], LIGHT = [0.95, 0.7, 0.42], CREAM = [0.98, 0.89, 0.74];
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * Math.max(0, Math.min(1, t)));
  const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const nz = noise3(p[0] * 0.12, p[1] * 0.12, p[2] * 0.12), nz2 = noise3(p[0] * 0.35 + 9, p[1] * 0.35, p[2] * 0.35);
  const x = Math.abs(p[0]);
  let col = mix(GIN, LIGHT, 0.04 + 0.16 * nz2), fur = 0.62;

  const isHead = /^(Skull|Mandible|Ear|Eye)/.test(bone);
  const isTail = /^Cd\d/.test(bone) || /^Hemal/.test(bone);
  const isLeg = /^(Humerus|Radius|Ulna|Carpal|RadialCarpal|UlnarCarpal|AccessoryCarpal|MC\d|MT\d|P\d|Ses|Claw|Femur|Tibia|Fibula|Patella|Fabella|Talus|Calcaneus|Tarsal|CentralTarsal|Meniscus)/.test(bone);

  // 下側（おなか・胸・のど・足の内側）はクリーム色で毛が長め
  const under = sm(-0.35, -0.75, n[1]);
  if (isHead) {
    const O = lm.F.Q(0, 0, 0), [u, v, w] = lm.F.skullAxes, d = sub(p, O);
    const a = dot(d, u), b = dot(d, v), c = Math.abs(dot(d, w));
    fur = 0.28;
    // おでこの「M」：縦の細い線
    if (b > 20 && a > 22 && a < 60) {
      const lines = [0, 4.5, 9.5].map((c0) => Math.abs(c - c0 - (60 - a) * 0.04));
      const lineD = Math.min(...lines);
      col = mix(col, DARK, sm(1.6, 0.7, lineD) * sm(22, 30, a) * 0.95);
    }
    // ほおの線（目じりから後ろへ）
    {
      const t = Math.max(0, Math.min(1, (52 - a) / 22));
      const q = [52 - 22 * t, 12 - 3 * t, 25 + 4 * t];
      const dd = Math.hypot(a - q[0], b - q[1], c - q[2]);
      col = mix(col, DARK, sm(2.2, 1.0, dd) * 0.85);
      const q2 = [48 - 18 * t, 4 - 2 * t, 26 + 3 * t];
      col = mix(col, DARK, sm(2.0, 0.9, Math.hypot(a - q2[0], b - q2[1], c - q2[2])) * 0.7);
    }
    // 鼻づら・あご・目のまわりは明るい
    col = mix(col, CREAM, sm(70, 80, a) * sm(12, 4, b) * 0.9);
    col = mix(col, CREAM, sm(-6, -12, b) * 0.9);
    const eye = lm.eyeFront; const de = Math.hypot(x - eye[0], p[1] - eye[1], p[2] - eye[2]);
    col = mix(col, LIGHT, sm(15, 12.5, de) * 0.7);
    // ほおの後ろはふさふさ
    fur = 0.28 + 0.3 * sm(30, 10, a) * sm(10, 22, c);
    // 鼻（鼻鏡）：毛のないピンク
    const nt = lm.noseTip; const dn = Math.hypot(x - nt[0], p[1] - nt[1], p[2] - nt[2]);
    if (dn < 6.5 && a > 84) { col = [0.9, 0.56, 0.55]; fur = 0; }
    // まぶたのふち：黒っぽい
    if (de < 11.8) { col = [0.3, 0.18, 0.14]; fur = 0; }
    // 唇のふち
    if (a > 58 && a < 86 && b < -4.5 && b > -9 && c > 3 && Math.abs(b - (-6.5 + (a - 70) * 0.02)) < 0.9) { col = [0.45, 0.25, 0.22]; fur = 0.05; }
  } else if (isTail) {
    // しっぽ：輪の縞、先は濃い
    const m = /^Cd(\d+)/.exec(bone); const i = m ? +m[1] : 2;
    const cum = [0, 9, 20, 33, 48, 65, 83, 101.5, 120, 138, 155.5, 172.5, 188.5, 203.5, 217.5, 230.5, 242.5, 253, 262, 269.5, 275.5, 280.5];
    const tz = (cum[i - 1] ?? 0) + (noise3(p[0] * 0.2, p[1] * 0.2, p[2] * 0.2) - 0.5) * 3 + (p[2] < 0 ? 0 : 0);
    const ring = 0.5 + 0.5 * Math.sin((tz + Math.hypot(p[1], p[2]) * 0.0) / 15 * Math.PI * 2);
    col = mix(col, DARK, sm(0.55, 0.85, ring) * 0.85);
    if (i >= 19) col = mix(col, DARK, 0.8);
    col = mix(col, LIGHT, under * 0.5);
    fur = 0.66;
  } else if (isLeg) {
    // 足：横の縞、内側と足先は明るい
    const ring = 0.5 + 0.5 * Math.sin((p[1] + nz * 6) / 13 * Math.PI * 2);
    const outer = sm(-0.1, 0.5, n[0] * Math.sign(p[0] || 1) + n[2] * 0.3);
    col = mix(col, DARK, sm(0.6, 0.88, ring) * 0.8 * outer * sm(10, 30, p[1]));
    col = mix(col, CREAM, sm(0.2, -0.4, n[0] * Math.sign(p[0] || 1)) * 0.6);
    col = mix(col, LIGHT, sm(18, 6, p[1]) * 0.7);
    fur = 0.48 - 0.25 * sm(20, 5, p[1]);
    // 肉球
    for (const pad of lm.pads) for (const sx of [1, -1]) {
      const c = [pad.c[0] * sx, pad.c[1], pad.c[2]];
      const dd = Math.hypot((p[0] - c[0]) / (pad.r[0] + 1.6), (p[1] - c[1]) / (pad.r[1] + 1.6), (p[2] - c[2]) / (pad.r[2] + 1.6));
      if (dd < 1) { col = [0.88, 0.55, 0.58]; fur = 0; }
    }
  } else {
    // 胴：背骨にそった濃い線と、横向きの縞（サバトラ風に波うつ）
    const dorsal = sm(-0.1, 0.6, n[1]);
    const band = 0.5 + 0.5 * Math.sin((p[2] + 3 * Math.sin(p[1] * 0.05) + (nz - 0.5) * 10) / 17 * Math.PI * 2);
    col = mix(col, DARK, sm(0.62, 0.9, band) * 0.85 * sm(0.75, -0.2, -n[1]) * (1 - under));
    col = mix(col, DARK, sm(7, 3, x) * dorsal * 0.85);
    fur = 0.7 + 0.12 * under;
  }
  col = mix(col, CREAM, under * (isHead ? 0.6 : 0.85));
  // 少しのむら
  const k = 0.93 + 0.12 * nz2;
  return [Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k), fur];
}
