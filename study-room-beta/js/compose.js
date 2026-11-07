// 1つの家具を、いくつかの部品（Poly Haven のモデル・自作の形）を並べて作る。
// 使い方：items.js / gacha.js の src に models: [部品…] を書く。または、ガチャの形の名前ごとに rewardfurn.js の PARTS に書く
//   （そのときは gacha.js の src: { gacha: '名前' } のままで、置いてある人のデータもそのまま使える）。
// 部品：{ model: 'Poly HavenのID' | proc: {...} | gacha: '形の名前', ...そのほかの引数 }
//   pos: [x, y, z]  部品の「底のまん中」を置く位置（m）。stackOn: n なら n 番目の部品のてっぺんの高さを足す
//   attach: '名前'  前の部品の中の、その名前のグループに付ける（いっしょに回る・揺れる）。pos はそのグループの中の位置
//   rx / ry: 傾き・向き（ラジアン）、size: 最大辺をこの長さ（m）にそろえる、tint / paint: 色（items.js と同じ）
// 同じ Poly Haven モデルは loaders.js が1回だけ読む（2つ目からは複製）。部品の合計は数MBまでにする。
import * as THREE from 'three';
import { loadModel } from './loaders.js';
import { buildProc } from './procfurn.js';
import { buildGacha } from './gachafurn.js';
import { PARTS } from './rewardfurn.js';

// その家具の部品の一覧（なければ null）
export function partsOf(item) {
  const src = item?.src || {};
  return src.models || (src.gacha && PARTS[src.gacha]) || null;
}

function recolor(obj, v) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => { const c = m.clone(); if (v.paint) { c.map = null; c.color.set(v.paint); } else c.color.multiply(new THREE.Color(v.tint)); c.needsUpdate = true; return c; });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

async function partObject(p) {
  if (p.model) {
    const o = await loadModel(p.model);
    if (o && (p.tint || p.paint)) recolor(o, p);
    return o;
  }
  const { model, proc, gacha, pos, rx, ry, size, stackOn, attach, tint, paint, ...rest } = p;
  if (proc) return buildProc(proc);
  if (gacha) return buildGacha({ type: gacha, ...rest });
  return null;
}

// 部品を読みこんで並べる。戻り値は THREE.Group（光る・動く部品の userData.light / tick も引きつぐ）
export async function buildParts(parts) {
  const root = new THREE.Group();
  const objs = await Promise.all(parts.map(partObject));
  const placed = [];
  const ticks = [];
  parts.forEach((p, i) => {
    const o = objs[i];
    if (!o) { placed.push(null); return; }
    const w = new THREE.Group();
    w.add(o);
    o.rotation.x += p.rx || 0;
    o.rotation.y += p.ry || 0;
    if (p.size) {
      const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      const big = Math.max(sz.x, sz.y, sz.z);
      if (big > 0) o.scale.multiplyScalar(p.size / big);
    }
    // 底のまん中を、部品のグループの原点に
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o);
    o.position.sub(new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2));
    const [x, y, z] = p.pos || [0, 0, 0];
    let yy = y;
    if (p.stackOn != null && placed[p.stackOn]) yy += new THREE.Box3().setFromObject(placed[p.stackOn]).max.y;
    w.position.set(x, yy, z);
    const parent = (p.attach && placed.find(q => q && q.getObjectByName(p.attach))?.getObjectByName(p.attach)) || root;
    parent.add(w);
    root.updateMatrixWorld(true);
    placed.push(w);
    if (o.userData.tick) ticks.push(o.userData.tick);
    if (o.userData.light && !root.userData.light) root.userData.light = o.userData.light;
  });
  if (ticks.length) root.userData.tick = (t, dt) => { for (const f of ticks) f(t, dt); };
  root.userData.parts = parts.length;
  return root;
}
