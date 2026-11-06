// 猫の全身（骨格＋筋肉）を作って models/cat-anatomy.glb に書き出す。
// 使い方: node cat-model/tools/skeleton/build.js [--only=spine,skull,...] [--out=ファイル名] [--fast] [--muscles=0] [--mus=Biceps,Triceps] [--threads=4]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { ROM } from './landmarks.js';
import { mirrorX } from './mesher.js';
import { writeGLB } from './glb.js';
import { prepare, taubin } from './jobs.js';
import { buildSkin, skinWeightsFromSources, tabbyColor } from './skin.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const opts = {
  only: args.only ? String(args.only).split(',') : null,
  fast: !!args.fast,
  err: Number(args.err || 0.06), // 形のずれの許容（mm）
  mus: args.mus ? String(args.mus).split(',') : null,
};
opts.withMuscles = !opts.only && args.muscles !== '0';
const outPath = resolve(here, '../../models', args.out || 'cat-anatomy.glb');
const threads = Number(args.threads || Math.min(4, availableParallelism()));

export const MATERIALS = [
  { key: 'bone', name: '骨', color: [0.90, 0.86, 0.76, 1], roughness: 0.62 },
  { key: 'tooth', name: '歯', color: [0.97, 0.96, 0.91, 1], roughness: 0.3 },
  { key: 'cartilage', name: '軟骨', color: [0.72, 0.82, 0.86, 1], roughness: 0.35 },
  { key: 'disc', name: '椎間板', color: [0.62, 0.76, 0.84, 1], roughness: 0.4 },
  { key: 'claw', name: '爪', color: [0.86, 0.82, 0.72, 1], roughness: 0.4 },
  { key: 'muscle', name: '筋肉', color: [1, 1, 1, 1], roughness: 0.5 },
  { key: 'organ', name: '内臓', color: [1, 1, 1, 1], roughness: 0.4 },
  { key: 'eye', name: '目', color: [1, 1, 1, 1], roughness: 0.06 },
  { key: 'skin', name: '皮ふ', color: [1, 1, 1, 1], roughness: 0.8 },
  { key: 'whisker', name: 'ひげ', color: [0.96, 0.95, 0.92, 1], roughness: 0.35 },
];
const matIndex = Object.fromEntries(MATERIALS.map((m, i) => [m.key, i]));

const t0 = Date.now();
const { defs, mdefs, lm } = prepare(opts);

// ---- 写真と比べるための目印（mm、左側）を書き出す ----
if (!opts.only) {
  const F = lm.F, V = lm.vert, Q = F.Q, r1 = (p) => p.map((v) => Math.round(v * 10) / 10);
  const e = lm.eyeOpen;
  const marks = {
    nose_tip: lm.noseTip, eye_center: lm.eyeFront,
    eye_medial: e ? e.c.map((q, k) => q - e.axes[1][k] * e.r[1]) : null, eye_lateral: e ? e.c.map((q, k) => q + e.axes[1][k] * e.r[1]) : null,
    skull_occiput: Q(0, 0, 0), skull_vertex: Q(22, 31, 0), mouth_corner: Q(62, -7.5, 14.5), chin: Q(80, -15, 0),
    ear_base_front: Q(26, 27, 13), ear_base_back: Q(13, 27, 17),
    withers: [0, V.T3.c[1] + 18, V.T3.c[2]], tail_base: V.Cd1.cr, tail_tip: V.Cd21.ca,
    shoulder: lm.fore.shoulder, elbow: lm.fore.elbow, carpus: lm.fore.carpus, fore_mcp: lm.fore.mcp,
    hip: lm.hind.hip, stifle: lm.hind.stifle, hock: lm.hind.hock, hind_mtp: lm.hind.mtp,
    calcaneus_tip: F.pes ? F.pes.L(-17.4, -12, 2.5) : null, olecranon: F.fa ? F.fa.L(-14.5, -7.5, 0.3) : null,
    sternum_front: F.sternebrae ? F.sternebrae[0].a : null, iliac_crest: F.ilium ? F.ilium.L(F.Li + 4, 2, 0) : null, ischial_tuber: F.I || null,
  };
  for (const k in marks) if (marks[k]) marks[k] = r1(marks[k]); else delete marks[k];
  writeFileSync(resolve(here, '../../models/landmarks.json'), JSON.stringify(marks, null, 1));
}

// 同じ名前が2つないか確かめる
{
  const seen = new Set();
  for (const d of [...defs, ...mdefs]) { if (seen.has(d.id)) throw new Error('名前が重なっています: ' + d.id); seen.add(d.id); }
}

// ---- 手分けして形を作る ----
const jobs = [...defs.filter((d) => d.shape || d.mesh).map((d) => ({ type: 'bone', id: d.id })), ...mdefs.map((m) => ({ type: 'muscle', id: m.id }))];
// 重い仕事（筋肉・大きな骨）から順に、空いている作業員へ
const weight = (j) => (j.type === 'muscle' ? 10 : 1);
jobs.sort((a, b) => weight(b) - weight(a));
const buckets = Array.from({ length: threads }, () => ({ load: 0, jobs: [] }));
for (const j of jobs) { const b = buckets.reduce((x, y) => (y.load < x.load ? y : x)); b.jobs.push(j); b.load += weight(j); }
const results = new Map();
await Promise.all(buckets.map((b) => new Promise((ok, ng) => {
  const w = new Worker(resolve(here, 'worker.js'), { workerData: { opts, jobs: b.jobs } });
  w.on('message', (msg) => { if (msg.done) { w.terminate(); ok(); } else results.set(msg.type + ':' + msg.id, msg); });
  w.on('error', ng);
})));
console.log(`形づくり ${jobs.length} 件・${((Date.now() - t0) / 1000).toFixed(1)} 秒（${threads} 人で手分け）`);

// ---- 左右ペアの骨を2本に分ける ----
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

let tris = 0;
const nodes = items.map((it) => {
  let mesh = null;
  if (it.shape || it.mesh) {
    let m = results.get('bone:' + it.baseId).m;
    if (it.side === 'R') m = mirrorX(m);
    const j = jointOf(it);
    const p = new Float32Array(m.positions.length);
    for (let q = 0; q < p.length; q += 3) {
      p[q] = (m.positions[q] - j[0]) / 1000; p[q + 1] = (m.positions[q + 1] - j[1]) / 1000; p[q + 2] = (m.positions[q + 2] - j[2]) / 1000;
    }
    mesh = { positions: p, normals: m.normals, indices: m.indices, ...(m.colors ? { colors: m.colors } : {}) };
    tris += m.indices.length / 3;
  }
  const j = jointOf(it);
  const parent = it.parentId ? byId.get(it.parentId) : -1;
  const pj = parent >= 0 ? jointOf(items[parent]) : [0, 0, 0];
  return {
    name: it.id, parent,
    translation: [(j[0] - pj[0]) / 1000, (j[1] - pj[1]) / 1000, (j[2] - pj[2]) / 1000],
    mesh, material: matIndex[it.mat || 'bone'],
    extras: { ja: it.ja, la: it.la, region: it.region, side: it.side, kind: it.mat || 'bone', ...(it.rom ? { rom: it.rom } : {}) },
  };
});
const counts = {};
for (const it of items) { const k = it.mat || 'bone'; counts[k] = (counts[k] || 0) + 1; }

// ---- 筋肉 ----
let skin = null;
if (mdefs.length) {
  const layerColor = [null, [0.66, 0.2, 0.17], [0.58, 0.16, 0.14], [0.5, 0.13, 0.12]];
  const tendonColor = [0.8, 0.84, 0.9]; // 腱は少し青みのある銀白色
  const boneNode = (key, side) => {
    const [id, s] = key.split('|');
    const ss = side === 'R' ? (s === 'L' ? 'R' : 'L') : s; // 右の筋肉は左右を入れかえる
    return byId.get(paired.has(id) ? `${id}_${ss}` : id);
  };
  for (const md of mdefs) {
    const r = results.get('muscle:' + md.id)?.r;
    if (!r) { console.warn('筋肉の形が空です:', md.id); continue; }
    for (const side of md.pair ? ['L', 'R'] : [null]) {
      const mm = side === 'R' ? mirrorX(r.m) : r.m;
      const n = mm.positions.length / 3;
      const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), colors = new Uint8Array(n * 4);
      const base = md.color || (md.kind === 'tendon' ? tendonColor : layerColor[md.layer]);
      for (let v = 0; v < n; v++) {
        const js = r.joints[v], ws = r.weights[v];
        let sum = 0;
        for (let k = 0; k < Math.min(4, js.length); k++) {
          const ni = boneNode(js[k], side);
          joints[v * 4 + k] = ni ?? 0; weights[v * 4 + k] = ni == null ? 0 : ws[k]; sum += weights[v * 4 + k];
        }
        if (sum <= 0) { weights[v * 4] = 1; sum = 1; }
        for (let k = 0; k < 4; k++) weights[v * 4 + k] /= sum;
        const t = Math.min(1, r.tendon[v]);
        for (let k = 0; k < 3; k++) colors[v * 4 + k] = Math.round((base[k] + (tendonColor[k] - base[k]) * t) * 255);
        colors[v * 4 + 3] = 255;
      }
      const p = new Float32Array(mm.positions.length);
      for (let q = 0; q < p.length; q++) p[q] = mm.positions[q] / 1000;
      nodes.push({
        name: 'M_' + md.id + (side ? '_' + side : ''), parent: -1, translation: [0, 0, 0],
        mesh: { positions: p, normals: mm.normals, indices: mm.indices, colors, joints, weights },
        material: md.kind === 'organ' ? matIndex.organ : matIndex.muscle,
        extras: { ja: md.ja, la: md.la, region: md.kind === 'organ' ? 'organ' : 'muscle', group: md.region, layer: md.layer, side, kind: md.kind || 'muscle', origin: md.origin, insertion: md.insertion, action: md.action },
      });
      tris += mm.indices.length / 3;
      counts[md.kind || 'muscle'] = (counts[md.kind || 'muscle'] || 0) + 1;
    }
  }
  // ---- 皮ふ ----
  if (args.skin !== '0') {
    const ts = Date.now();
    const skip = new Set(['claw', 'tooth', 'whisker', 'skin', 'eye']);
    const sources = [];
    items.forEach((it, i) => {
      if (!(it.shape || it.mesh) || skip.has(it.mat || 'bone')) return;
      let m = results.get('bone:' + it.baseId).m;
      if (it.side === 'R') m = mirrorX(m);
      sources.push({ positions: m.positions, indices: m.indices, weightsOf: () => [[i], [1]], stride: 2 });
    });
    for (const nd of nodes) if (nd.mesh && nd.mesh.joints) {
      const P = new Float32Array(nd.mesh.positions.length); for (let q = 0; q < P.length; q++) P[q] = nd.mesh.positions[q] * 1000;
      const J = nd.mesh.joints, Wt = nd.mesh.weights;
      sources.push({ positions: P, indices: nd.mesh.indices, weightsOf: (v) => [[J[v * 4], J[v * 4 + 1], J[v * 4 + 2], J[v * 4 + 3]], [Wt[v * 4], Wt[v * 4 + 1], Wt[v * 4 + 2], Wt[v * 4 + 3]]], stride: 1 });
    }
    let sm = buildSkin({ sources, lm, h: Number(args.skinh || 1.0) });
    taubin(sm, 4);
    await MeshoptSimplifier.ready;
    {
      const target = Math.min(sm.indices.length, 3 * Number(args.skintris || 170000));
      const [ind] = MeshoptSimplifier.simplify(sm.indices, sm.positions, 3, target, 0.0006, []);
      const remap = new Int32Array(sm.positions.length / 3).fill(-1); const P = [], Nn = [];
      const out = new Uint32Array(ind.length);
      for (let q = 0; q < ind.length; q++) { const v = ind[q]; if (remap[v] < 0) { remap[v] = P.length / 3; P.push(sm.positions[v * 3], sm.positions[v * 3 + 1], sm.positions[v * 3 + 2]); Nn.push(sm.normals[v * 3], sm.normals[v * 3 + 1], sm.normals[v * 3 + 2]); } out[q] = remap[v]; }
      sm = { positions: new Float32Array(P), normals: new Float32Array(Nn), indices: out };
      taubin(sm, 1);
    }
    const sw = skinWeightsFromSources(sm, sources);
    const n = sm.positions.length / 3;
    const colors = new Uint8Array(n * 4);
    for (let v = 0; v < n; v++) {
      const p = [sm.positions[v * 3], sm.positions[v * 3 + 1], sm.positions[v * 3 + 2]], nn = [sm.normals[v * 3], sm.normals[v * 3 + 1], sm.normals[v * 3 + 2]];
      const c = tabbyColor(p, nn, items[sw.dominant[v]]?.baseId || '', lm);
      for (let k = 0; k < 4; k++) colors[v * 4 + k] = Math.round(Math.max(0, Math.min(1, c[k])) * 255);
    }
    const p = new Float32Array(sm.positions.length); for (let q = 0; q < p.length; q++) p[q] = sm.positions[q] / 1000;
    nodes.push({ name: 'Skin', parent: -1, translation: [0, 0, 0], material: matIndex.skin,
      mesh: { positions: p, normals: sm.normals, indices: sm.indices, colors, joints: sw.joints, weights: sw.weights },
      extras: { ja: '皮ふと毛', la: 'Cutis et pili', region: 'skin', kind: 'skin', furMaxMM: 12, note: '頂点の色＝毛の色、A＝毛の長さ（1 で 12mm）' } });
    counts.skin = (counts.skin || 0) + 1;
    tris += sm.indices.length / 3;
    console.log(`皮ふ 三角形 ${(sm.indices.length / 3).toLocaleString()} 枚・${((Date.now() - ts) / 1000).toFixed(1)} 秒`);
  }
  // 骨格を「骨組み（スキン）」として登録する。休んだ姿勢では回転がないので、逆行列は平行移動だけ
  const ibm = new Float32Array(items.length * 16);
  items.forEach((it, i) => {
    const j = jointOf(it), o = i * 16;
    ibm[o] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
    ibm[o + 12] = -j[0] / 1000; ibm[o + 13] = -j[1] / 1000; ibm[o + 14] = -j[2] / 1000;
  });
  skin = { joints: items.map((_, i) => i), ibm };
}

const glb = writeGLB(nodes, MATERIALS, { units: 'meter', up: 'Y', forward: '+Z', rom: ROM, counts }, skin);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, glb);
console.log(`部品 ${nodes.length} 個（${JSON.stringify(counts)}）・三角形 ${tris.toLocaleString()} 枚・${(glb.length / 1e6).toFixed(1)} MB・${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
console.log('→', outPath);
