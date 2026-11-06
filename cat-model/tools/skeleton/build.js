// 猫の全身骨格を作って models/cat-skeleton.glb に書き出す。
// 使い方: node cat-model/tools/skeleton/build.js [--only=spine,skull,...] [--out=ファイル名] [--fast]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLandmarks, ROM } from './landmarks.js';
import { meshSDF, mirrorX } from './mesher.js';
import { writeGLB } from './glb.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { buildSpine } from './spine.js';
import { buildThorax } from './thorax.js';
import { buildSkull } from './skull.js';
import { buildForelimb } from './forelimb.js';
import { buildHindlimb } from './hindlimb.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const only = args.only ? String(args.only).split(',') : null;
const fast = !!args.fast;
const outPath = resolve(here, '../../models', args.out || 'cat-skeleton.glb');

export const MATERIALS = [
  { key: 'bone', name: '骨', color: [0.90, 0.86, 0.76, 1], roughness: 0.62 },
  { key: 'tooth', name: '歯', color: [0.97, 0.96, 0.91, 1], roughness: 0.3 },
  { key: 'cartilage', name: '軟骨', color: [0.72, 0.82, 0.86, 1], roughness: 0.35 },
  { key: 'disc', name: '椎間板', color: [0.62, 0.76, 0.84, 1], roughness: 0.4 },
  { key: 'claw', name: '爪', color: [0.86, 0.82, 0.72, 1], roughness: 0.4 },
];
const matIndex = Object.fromEntries(MATERIALS.map((m, i) => [m.key, i]));

await MeshoptSimplifier.ready;
const ERR_MM = Number(args.err || 0.06); // 形のずれの許容（mm）

// 形を保ったまま三角形を減らし、使われない頂点を捨てる
function simplify(m, size) {
  if (m.indices.length < 300) return m;
  const [ind] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, 0, ERR_MM / size, []);
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

const defs = [];
const api = {
  bone(def) { defs.push(def); },
};

const lm = computeLandmarks();
const builders = { spine: buildSpine, thorax: buildThorax, skull: buildSkull, forelimb: buildForelimb, hindlimb: buildHindlimb };
for (const [name, fn] of Object.entries(builders)) {
  if (only && !only.includes(name)) continue;
  fn(api, lm);
}

// 同じ名前の骨が2つないか確かめる
{
  const seen = new Set();
  for (const d of defs) { if (seen.has(d.id)) throw new Error('骨の名前が重なっています: ' + d.id); seen.add(d.id); }
}
// 左右ペアの骨を2本に分ける
const paired = new Set(defs.filter((d) => d.pair).map((d) => d.id));
const items = [];
for (const d of defs) {
  if (d.pair) {
    for (const side of ['L', 'R']) items.push({ ...d, id: `${d.id}_${side}`, side, baseId: d.id, parentId: d.parent ? (paired.has(d.parent) ? `${d.parent}_${side}` : d.parent) : null });
  } else items.push({ ...d, side: null, baseId: d.id, parentId: d.parent || null });
}
const byId = new Map(items.map((it, i) => [it.id, i]));
for (const it of items) if (it.parentId && !byId.has(it.parentId)) it.parentId = null; // 部分だけ作るとき

const jointOf = (it) => (it.side === 'R' ? [-it.joint[0], it.joint[1], it.joint[2]] : it.joint);

// 形 → 三角形
const meshCache = new Map();
let tris = 0;
const t0 = Date.now();
const nodes = items.map((it, i) => {
  let mesh = null;
  if (it.shape) {
    const key = it.baseId;
    let m = meshCache.get(key);
    if (!m) {
      const s = it.shape;
      const size = Math.max(s.hi[0] - s.lo[0], s.hi[1] - s.lo[1], s.hi[2] - s.lo[2]);
      let h = it.h ?? Math.min(0.55, Math.max(0.16, size / 90));
      if (fast) h *= 2;
      m = simplify(meshSDF(s, h), size);
      meshCache.set(key, m);
    }
    if (it.side === 'R') m = mirrorX(m);
    const j = jointOf(it);
    const p = new Float32Array(m.positions.length);
    for (let q = 0; q < p.length; q += 3) {
      p[q] = (m.positions[q] - j[0]) / 1000; p[q + 1] = (m.positions[q + 1] - j[1]) / 1000; p[q + 2] = (m.positions[q + 2] - j[2]) / 1000;
    }
    mesh = { positions: p, normals: m.normals, indices: m.indices };
    tris += m.indices.length / 3;
  }
  const j = jointOf(it);
  const parent = it.parentId ? byId.get(it.parentId) : -1;
  const pj = parent >= 0 ? jointOf(items[parent]) : [0, 0, 0];
  return {
    name: it.id,
    parent,
    translation: [(j[0] - pj[0]) / 1000, (j[1] - pj[1]) / 1000, (j[2] - pj[2]) / 1000],
    mesh,
    material: matIndex[it.mat || 'bone'],
    extras: { ja: it.ja, la: it.la, region: it.region, side: it.side, kind: it.mat || 'bone', ...(it.rom ? { rom: it.rom } : {}) },
  };
});

const counts = {};
for (const it of items) { const k = it.mat || 'bone'; counts[k] = (counts[k] || 0) + 1; }
const glb = writeGLB(nodes, MATERIALS, { units: 'meter', up: 'Y', forward: '+Z', rom: ROM, counts });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, glb);
console.log(`部品 ${items.length} 個（${JSON.stringify(counts)}）・三角形 ${tris.toLocaleString()} 枚・${(glb.length / 1e6).toFixed(1)} MB・${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
console.log('→', outPath);
