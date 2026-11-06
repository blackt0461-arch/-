// 距離関数から三角形の網（メッシュ）を作る（Surface Nets 方式）。
// 返り値: { positions: Float32Array, normals: Float32Array, indices: Uint32Array }

export function meshSDF(shape, h) {
  const f = shape.f;
  const pad = 2 * h;
  const lo = shape.lo.map((v) => v - pad);
  const hi = shape.hi.map((v) => v + pad);
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  if (nx * ny * nz > 60e6) throw new Error(`grid too large ${nx}x${ny}x${nz}`);

  const val = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = lo[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = lo[1] + j * h;
      for (let i = 0; i < nx; i++) val[idx(i, j, k)] = f(lo[0] + i * h, y, z);
    }
  }

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float32Array(8);
  const grad = (x, y, z) => {
    const e = h * 0.35;
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };

  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = val[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      corner[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
      const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
      sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
    }
    let x = lo[0] + (i + sx / n) * h, y = lo[1] + (j + sy / n) * h, z = lo[2] + (k + sz / n) * h;
    // 表面にひきよせる
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      const g = grad(x, y, z);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    // セルから飛び出しすぎないように
    const cx0 = lo[0] + i * h, cy0 = lo[1] + j * h, cz0 = lo[2] + k * h;
    x = Math.min(Math.max(x, cx0 - h * 0.5), cx0 + h * 1.5);
    y = Math.min(Math.max(y, cy0 - h * 0.5), cy0 + h * 1.5);
    z = Math.min(Math.max(z, cz0 - h * 0.5), cz0 + h * 1.5);
    cellVert[cidx(i, j, k)] = pos.length / 3;
    pos.push(x, y, z);
  }

  const tris = [];
  const quad = (c0, c1, c2, c3) => {
    const v = [cellVert[c0], cellVert[c1], cellVert[c2], cellVert[c3]];
    if (v.some((q) => q < 0)) return;
    const P = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    const [a, b, c, d] = v.map(P);
    // 外向きかどうかを距離関数の傾きで確かめる
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const g = grad(m[0], m[1], m[2]);
    let order = v;
    if (fn[0] * g[0] + fn[1] * g[1] + fn[2] * g[2] < 0) order = [v[0], v[3], v[2], v[1]];
    const [p, q, r, s] = order;
    const dac = (pos[p * 3] - pos[r * 3]) ** 2 + (pos[p * 3 + 1] - pos[r * 3 + 1]) ** 2 + (pos[p * 3 + 2] - pos[r * 3 + 2]) ** 2;
    const dbd = (pos[q * 3] - pos[s * 3]) ** 2 + (pos[q * 3 + 1] - pos[s * 3 + 1]) ** 2 + (pos[q * 3 + 2] - pos[s * 3 + 2]) ** 2;
    if (dac < dbd) tris.push(p, q, r, p, r, s);
    else tris.push(p, q, s, q, r, s);
  };

  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = val[idx(i, j, k)] < 0;
    if (j > 0 && k > 0 && v0 !== (val[idx(i + 1, j, k)] < 0))
      quad(cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k));
    if (i > 0 && k > 0 && v0 !== (val[idx(i, j + 1, k)] < 0))
      quad(cidx(i - 1, j, k - 1), cidx(i - 1, j, k), cidx(i, j, k), cidx(i, j, k - 1));
    if (i > 0 && j > 0 && v0 !== (val[idx(i, j, k + 1)] < 0))
      quad(cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k));
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  for (let q = 0; q < pos.length / 3; q++) {
    const g = grad(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
    normals[q * 3] = g[0]; normals[q * 3 + 1] = g[1]; normals[q * 3 + 2] = g[2];
  }
  return { positions, normals, indices: new Uint32Array(tris) };
}

// 左右反転（x を逆に）。三角形の向きも直す。
export function mirrorX(m) {
  const positions = new Float32Array(m.positions);
  const normals = new Float32Array(m.normals);
  for (let i = 0; i < positions.length; i += 3) { positions[i] = -positions[i]; normals[i] = -normals[i]; }
  const indices = new Uint32Array(m.indices.length);
  for (let i = 0; i < indices.length; i += 3) { indices[i] = m.indices[i]; indices[i + 1] = m.indices[i + 2]; indices[i + 2] = m.indices[i + 1]; }
  return { positions, normals, indices };
}
