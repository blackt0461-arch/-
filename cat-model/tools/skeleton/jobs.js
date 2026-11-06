// 形を作る仕事（骨1本・筋肉1本ずつ）。build.js と worker.js の両方から使う。
import { computeLandmarks } from './landmarks.js';
import { meshSDF } from './mesher.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { buildSpine } from './spine.js';
import { buildThorax } from './thorax.js';
import { buildSkull } from './skull.js';
import { buildForelimb } from './forelimb.js';
import { buildHindlimb } from './hindlimb.js';
import { buildMuscles } from './muscles.js';
import { muscleShape, skinWeights } from './muscle.js';

export const BUILDERS = { spine: buildSpine, thorax: buildThorax, skull: buildSkull, forelimb: buildForelimb, hindlimb: buildHindlimb };

// 設計図からすべての骨と筋肉の定義を作る（何度呼んでも同じ結果）
export function prepare(opts) {
  const defs = [];
  const api = { bone(def) { defs.push(def); } };
  const lm = computeLandmarks();
  for (const [name, fn] of Object.entries(BUILDERS)) {
    if (opts.only && !opts.only.includes(name)) continue;
    fn(api, lm);
  }
  let mdefs = [];
  if (opts.withMuscles) {
    mdefs = buildMuscles(api, lm);
    if (opts.mus) mdefs = mdefs.filter((m) => opts.mus.includes(m.id));
  }
  return { defs, mdefs, lm };
}

// 形を保ったまま三角形を減らし、使われない頂点を捨てる
export function simplify(m, size, errMM) {
  if (m.indices.length < 300) return m;
  const [ind] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, 0, errMM / size, []);
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const pos = [], nor = [];
  const out = new Uint32Array(ind.length);
  for (let i = 0; i < ind.length; i++) {
    const v = ind[i];
    if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]); nor.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]); }
    out[i] = remap[v];
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: out };
}

const sizeOf = (s) => Math.max(s.hi[0] - s.lo[0], s.hi[1] - s.lo[1], s.hi[2] - s.lo[2]);

export async function meshBone(def, opts) {
  await MeshoptSimplifier.ready;
  const size = sizeOf(def.shape);
  let h = def.h ?? Math.min(0.55, Math.max(0.16, size / 90));
  if (opts.fast) h *= 2;
  return simplify(meshSDF(def.shape, h), size, opts.err);
}

// 筋肉：形・重み（骨の名前は左側の名前）・腱らしさ
export async function meshMuscle(md, ctx, opts) {
  await MeshoptSimplifier.ready;
  const { boneDefs, carveDefs } = ctx;
  const { shape, lines } = muscleShape(md, carveDefs);
  const cache = new Map();
  const nearestBone = (p, allow) => {
    const key = p.map((v) => Math.round(v)).join(',');
    if (cache.has(key)) return cache.get(key);
    const cand = [];
    for (const d of boneDefs) {
      if (allow && !allow.includes(d.id)) continue;
      const lo = d.shape.lo, hi = d.shape.hi;
      cand.push([Math.hypot(Math.max(lo[0] - p[0], 0, p[0] - hi[0]), Math.max(lo[1] - p[1], 0, p[1] - hi[1]), Math.max(lo[2] - p[2], 0, p[2] - hi[2])), d]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    let best = Infinity, id = null;
    for (const [bd, d] of cand) { if (bd > best) break; const dd = d.shape.f(p[0], p[1], p[2]); if (dd < best) { best = dd; id = d.id; } }
    cache.set(key, id);
    return id;
  };
  for (const L of lines) for (const q of L) {
    const left = q.p[0] < -0.5 ? [-q.p[0], q.p[1], q.p[2]] : q.p;
    q.bone = nearestBone(left, md.bones || null);
    q.side = q.p[0] < -0.5 ? 'R' : 'L';
  }
  const size = sizeOf(shape);
  let h = md.h ?? Math.min(0.75, Math.max(0.3, size / 110));
  if (opts.fast) h *= 2;
  const raw = meshSDF(shape, h);
  if (!raw.indices.length) return null;
  taubin(raw, 6);
  const m = simplify(raw, size, opts.err * 3.5);
  // 頂点ごとの重み（骨の名前と左右）
  const sw = skinWeights(m.positions, lines, (q) => q.bone + '|' + q.side);
  return { m, joints: sw.joints, weights: sw.weights, tendon: Array.from(sw.tendon) };
}

// 表面をならす（Taubin 法：縮まずになめらかにする）。そのあと法線を作り直す
export function taubin(m, iters) {
  const n = m.positions.length / 3, P = m.positions, I = m.indices;
  const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < I.length; i += 3) for (let a = 0; a < 3; a++) { const u = I[i + a], v = I[i + (a + 1) % 3]; nb[u].add(v); nb[v].add(u); }
  const tmp = new Float32Array(P.length);
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 === 0 ? 0.5 : -0.53;
    for (let v = 0; v < n; v++) {
      let x = 0, y = 0, z = 0, c = 0;
      for (const w of nb[v]) { x += P[w * 3]; y += P[w * 3 + 1]; z += P[w * 3 + 2]; c++; }
      if (!c) { tmp[v * 3] = P[v * 3]; tmp[v * 3 + 1] = P[v * 3 + 1]; tmp[v * 3 + 2] = P[v * 3 + 2]; continue; }
      tmp[v * 3] = P[v * 3] + f * (x / c - P[v * 3]); tmp[v * 3 + 1] = P[v * 3 + 1] + f * (y / c - P[v * 3 + 1]); tmp[v * 3 + 2] = P[v * 3 + 2] + f * (z / c - P[v * 3 + 2]);
    }
    P.set(tmp);
  }
  const N = new Float32Array(P.length);
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const q of [a, b, c]) { N[q] += fn[0]; N[q + 1] += fn[1]; N[q + 2] += fn[2]; }
  }
  for (let v = 0; v < n; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l; }
  m.normals = N;
  return m;
}
