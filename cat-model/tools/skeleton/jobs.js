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
  const m = simplify(raw, size, opts.err * 3.5);
  // 頂点ごとの重み（骨の名前と左右）
  const sw = skinWeights(m.positions, lines, (q) => q.bone + '|' + q.side);
  return { m, joints: sw.joints, weights: sw.weights, tendon: Array.from(sw.tendon) };
}
