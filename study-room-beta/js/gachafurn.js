// ガチャ限定の豪華な家具：基本の形（箱・回転体・チューブ）と、光る・動く効果を組み合わせて作る。
// buildGacha(spec) は THREE.Group をすぐ返す（buildProc と同じ使い方）。spec = { type: 'piano', ... }
// 正面は +Z。壁に掛ける物は背中が -Z（z=0 が壁の面）。単位はメートル。
// 動く家具は group.userData.tick = (t, dt) => {} を持つ。部屋が毎フレーム呼ぶ（t = 経過秒、dt = 前回からの秒）。
// 光る家具は group.userData.light = { color, intensity, y } を持つ（置く側が PointLight を足す）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildProc } from './procfurn.js';
import { REWARD_BUILDERS } from './rewardfurn.js';
import { RYOKAN_BUILDERS } from './ryokanfurn.js';

// 植物・ギターは procfurn の形を使う
const PROC = buildProc;
const PI = Math.PI, TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 乱数・ノイズ ----------
function h2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, px = 1e6, py = 1e6, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const wx = a => ((a % px) + px) % px, wy = b => ((b % py) + py) % py;
  const a = h2(wx(xi), wy(yi), s), b = h2(wx(xi + 1), wy(yi), s);
  const c = h2(wx(xi), wy(yi + 1), s), d = h2(wx(xi + 1), wy(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, px, py, oct = 4, s = 0) {
  let t = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    t += a * vn(x, y, px, py, s + i); n += a;
    x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5;
  }
  return t / n;
}
const n3 = (x, y, z, s = 0) => vn(x + z * 1.71, y - z * 1.37, 1e6, 1e6, s) * 2 - 1;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hexRGB(hex) {
  const c = hex.replace('#', '');
  const f = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- 絵（キャンバス）で作る質感 ----------
const TC = new Map();
function canvasTex(key, w, h, draw, { srgb = true, rep = 1 } = {}) {
  if (TC.has(key)) return TC.get(key);
  let t = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = 4;
  }
  TC.set(key, t);
  return t;
}
function pixels(ctx, w, h, fn) {
  const im = ctx.createImageData(w, h), d = im.data, o = [0, 0, 0, 255];
  let i = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o[3] = 255; fn(x / w, y / h, o);
    d[i++] = o[0]; d[i++] = o[1]; d[i++] = o[2]; d[i++] = o[3];
  }
  ctx.putImageData(im, 0, 0);
}
// 木目（色の組み合わせごと）
const WOODS = {
  mahogany: ['#8a3f22', '#3f160b'], walnut: ['#7a4d2c', '#33190c'], rosewood: ['#5a2418', '#1e0a06'],
  oak: ['#c99b62', '#8c5e30'], ebony: ['#2a221d', '#0b0807'], burl: ['#a2683a', '#4a2611'],
};
function woodTex(kind) {
  const [l, d] = WOODS[kind] || WOODS.walnut;
  return canvasTex('gw-' + kind, 512, 512, (ctx, w, h) => {
    const L = hexRGB(l), D = hexRGB(d);
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 2, v * 6, 2, 6, 3, 7);
      const n2 = fbm(u * 1, v * 24, 1, 24, 2, 13);
      let ring = 0.5 + 0.5 * Math.sin((v * 26 + n * 1.8 + n2 * 0.8) * TAU);
      ring = ring * ring * ring;
      let f = ring * 0.42 + vn(u * 4, v * 360, 4, 360, 3) * 0.22 + (n - 0.5) * 0.55 + 0.15;
      if (kind === 'burl') f += (fbm(u * 10, v * 10, 10, 10, 4, 5) - 0.5) * 1.2;
      const c = mixRGB(L, D, clamp(f, 0, 1));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1.25 });
}
// 大理石（白・黒・緑・ピンク）
const MARBLES = {
  white: ['#f1efea', '#dedad3', '#8f8c88'], black: ['#141416', '#232226', '#d9d2c4'],
  green: ['#173a2c', '#24513f', '#cfe3d4'], rosa: ['#e8cfc6', '#d6b2a6', '#8d5e52'],
  gold: ['#f3eee6', '#e3ddd2', '#b58a3c'],
};
function marbleTex(kind) {
  const [a, b, c] = MARBLES[kind] || MARBLES.white;
  return canvasTex('gm-' + kind, 512, 512, (ctx, w, h) => {
    const base = hexRGB(a), base2 = hexRGB(b), vein = hexRGB(c);
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 4, v * 4, 4, 4, 5, 11);
      const s = 1 - Math.abs(Math.sin((u * 2 + v + n * 2.2) * PI));
      const s2 = 1 - Math.abs(Math.sin((u - v * 2 + n * 3.1) * TAU));
      const vv = Math.pow(s, 16) * 0.95 + Math.pow(s2, 28) * 0.55;
      let col = mixRGB(base, base2, fbm(u * 8, v * 8, 8, 8, 3, 5));
      col = mixRGB(col, vein, clamp(vv, 0, 1));
      o[0] = col[0]; o[1] = col[1]; o[2] = col[2];
    });
  });
}
// 籐の編み目
function rattanTex() {
  return canvasTex('g-rattan', 256, 256, (ctx, w, h) => {
    const A = hexRGB('#d2a868'), Bc = hexRGB('#7d5629');
    pixels(ctx, w, h, (u, v, o) => {
      const cu = Math.floor(u * 8), cv = Math.floor(v * 8);
      const fu = u * 8 - cu, fv = v * 8 - cv;
      const over = (cu + cv) % 2 === 0;
      const t = over ? Math.sin(fv * PI) : Math.sin(fu * PI);
      const e = over ? Math.sin(fu * PI) : Math.sin(fv * PI);
      const c = mixRGB(Bc, A, clamp(t * 0.6 + e * 0.5 + (h2(u * 999, v * 999) - 0.5) * 0.15, 0, 1));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1 });
}
// 籐の透かし編み（ピーコックチェアの背）。a が 0 のところは抜ける
function rattanLaceTex() {
  return canvasTex('g-rlace', 512, 512, (ctx, w, h) => {
    const A = hexRGB('#d8af70'), Bc = hexRGB('#86602f');
    pixels(ctx, w, h, (u, v, o) => {
      // u = 角度方向、v = 半径方向
      const cu = u * 24, cv = v * 7;
      const fu = cu - Math.floor(cu), fv = cv - Math.floor(cv);
      const off = Math.floor(cv) % 2 ? 0.5 : 0;
      const fu2 = (fu + off) % 1;
      const loop = Math.abs(Math.hypot(fu2 - 0.5, (fv - 0.5) * 1.3) - 0.36) < 0.08;
      const spoke = Math.abs(fu - 0.5) < 0.05;
      const ring = Math.abs(fv - 0.5) < 0.035 || v > 0.94;
      const on = loop || ring || (spoke && v < 0.3) || v < 0.14;
      const c = mixRGB(Bc, A, 0.55 + (h2(u * 777, v * 777) - 0.5) * 0.4 + Math.sin(fu * PI) * 0.2);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = on ? 255 : 0;
    });
  }, { rep: 1 });
}

// ---------- 材質 ----------
const MC = new Map();
const cm = (k, make) => { let m = MC.get(k); if (!m) { m = make(); MC.set(k, m); } return m; };
const std = o => new THREE.MeshStandardMaterial(o);
const phys = o => new THREE.MeshPhysicalMaterial(o);
export function paintG(hex, rough = 0.5, metal = 0) {
  return cm('p' + hex + rough + metal, () => std({ color: hex, roughness: rough, metalness: metal }));
}
const GOLD = () => cm('gold', () => phys({ color: '#f2c66d', metalness: 1, roughness: 0.17, clearcoat: 0.4, clearcoatRoughness: 0.1 }));
const BRASS = () => cm('brass', () => phys({ color: '#d4aa62', metalness: 1, roughness: 0.24 }));
const OLDBRASS = () => cm('oldbrass', () => phys({ color: '#a47d45', metalness: 1, roughness: 0.4 }));
const BRONZE = () => cm('bronze', () => phys({ color: '#6d4c30', metalness: 0.9, roughness: 0.42 }));
const CHROME = () => cm('chrome', () => phys({ color: '#f5f5f5', metalness: 1, roughness: 0.05 }));
const SILVER = () => cm('silver', () => phys({ color: '#dfe3e6', metalness: 1, roughness: 0.13 }));
const IRON = () => cm('iron', () => phys({ color: '#26272a', metalness: 0.75, roughness: 0.52 }));
const lacquer = (c, r = 0.18) => cm('lq' + c + r, () => phys({ color: c, roughness: r, clearcoat: 1, clearcoatRoughness: 0.03 }));
const PIANO_BLACK = () => lacquer('#050506', 0.22);
const velvet = c => cm('vv' + c, () => phys({
  color: c, roughness: 0.85, sheen: 1, sheenRoughness: 0.35,
  sheenColor: new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.45),
}));
const leather = c => cm('lt' + c, () => phys({ color: c, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
const cloth = c => cm('cl' + c, () => phys({ color: c, roughness: 0.92, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') }));
const wood = (kind, gloss = true) => cm('w' + kind + gloss, () => {
  const map = woodTex(kind);
  return phys({ color: map ? '#ffffff' : WOODS[kind][0], map, roughness: 0.45, clearcoat: gloss ? 0.8 : 0, clearcoatRoughness: 0.12 });
});
const marble = kind => cm('mb' + kind, () => {
  const map = marbleTex(kind);
  return phys({ color: map ? '#ffffff' : MARBLES[kind][0], map, roughness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.05 });
});
const RATTAN = () => cm('rattan', () => { const map = rattanTex(); return std({ color: map ? '#ffffff' : '#c49a5c', map, roughness: 0.8 }); });
// クリスタルガラス：透過は重いので、周りの映り込みを強くして薄く透かす
const CRYSTAL = () => cm('crystal', () => phys({
  color: '#ffffff', metalness: 0.0, roughness: 0.0, transparent: true, opacity: 0.32,
  envMapIntensity: 3.2, specularIntensity: 1, iridescence: 0.6, iridescenceIOR: 1.6,
  side: THREE.DoubleSide, depthWrite: false,
}));
// 粒のクリスタル（シャンデリアの飾り）：面がきらっと光る
const PRISM = () => cm('prism', () => phys({
  color: '#f4fbff', metalness: 0.15, roughness: 0.0, transparent: true, opacity: 0.78,
  envMapIntensity: 4, iridescence: 1, iridescenceIOR: 1.35, flatShading: true,
  emissive: '#ffffff', emissiveIntensity: 0.12,
}));
const glassT = (c, op = 0.35) => cm('gl' + c + op, () => phys({
  color: c, roughness: 0.02, metalness: 0, transparent: true, opacity: op, envMapIntensity: 2.2,
  specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false,
}));
const liquid = (c, op = 0.85) => cm('lq_' + c + op, () => phys({ color: c, roughness: 0.05, transparent: true, opacity: op, envMapIntensity: 1.5, emissive: c, emissiveIntensity: 0.12 }));
const MIRROR = () => cm('mirror', () => std({ color: '#e9eff2', metalness: 1, roughness: 0.03, emissive: '#3a4246', emissiveIntensity: 0.4 }));
const glow = (c, i = 2.5) => cm('glow' + c + i, () => std({ color: '#000000', emissive: c, emissiveIntensity: i, roughness: 0.5 }));
const BULB = () => glow('#ffd29a', 3);
const gem = c => cm('gem' + c, () => phys({ color: c, roughness: 0, metalness: 0.1, emissive: c, emissiveIntensity: 0.35, envMapIntensity: 3, clearcoat: 1, flatShading: true, iridescence: 0.4 }));

// ---------- 形（使い回す） ----------
const GC = new Map();
// 作った形はほかの家具と共有する（shared の印：サムネイルなどの片付けで捨てない）
const cg = (k, make) => { let g = GC.get(k); if (!g) { g = make(); g.userData.shared = true; GC.set(k, g); } return g; };
const r4 = v => Math.round(v * 10000);
// 面の向きに合わせて、メートル単位の UV を作る
function worldUV(g, scale = 1) {
  g.computeBoundingBox();
  const s = new THREE.Vector3(); g.boundingBox.getSize(s);
  const grain = s.x >= s.y && s.x >= s.z ? 0 : (s.y >= s.z ? 1 : 2);
  const p = g.attributes.position.array, n = g.attributes.normal.array, cnt = g.attributes.position.count;
  const uv = new Float32Array(cnt * 2);
  for (let i = 0; i < cnt; i++) {
    const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]), az = Math.abs(n[i * 3 + 2]);
    const dom = ax >= ay && ax >= az ? 0 : (ay >= az ? 1 : 2);
    let a = dom === 0 ? 1 : 0, b = dom === 2 ? 1 : 2;
    if (b === grain) { const t = a; a = b; b = t; }
    uv[i * 2] = p[i * 3 + a] * scale; uv[i * 2 + 1] = p[i * 3 + b] * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// 角の丸い箱
function B(w, h, d, r) {
  r = r ?? Math.min(0.008, Math.min(w, h, d) * 0.3);
  r = Math.min(r, Math.min(w, h, d) * 0.49);
  return cg(`b${r4(w)},${r4(h)},${r4(d)},${r4(r)}`, () => worldUV(r > 0.0006 ? new RoundedBoxGeometry(w, h, d, r >= 0.008 ? 2 : 1, r) : new THREE.BoxGeometry(w, h, d)));
}
const C = (rt, rb, h, seg = 16, open = false) =>
  cg(`c${r4(rt)},${r4(rb)},${r4(h)},${seg},${open}`, () => worldUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)));
const S = (r, ws = 16, hs = 12) => cg(`s${r4(r)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const T = (R, r, rs = 8, ts = 32, arc = TAU) => cg(`t${r4(R)},${r4(r)},${rs},${ts},${r4(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
// 回転体：pts = [[半径, 高さ], ...]（下から上へ）
const LA = (pts, seg = 32, wuv = false, phiLen = TAU, phi0 = 0) => cg('l' + seg + wuv + r4(phiLen) + r4(phi0) + pts.map(p => r4(p[0]) + ',' + r4(p[1])).join(';'), () => {
  const g = new THREE.LatheGeometry(pts.map(p => V2(Math.max(p[0], 0.0001), p[1])), seg, phi0, phiLen);
  return wuv ? worldUV(g) : g;
});
function smooth(pts, n = 24) {
  return new THREE.SplineCurve(pts.map(p => V2(p[0], p[1]))).getPoints(n).map(v => [v.x, v.y]);
}
// ふちの丸い円盤（天板など）
const DISC = (r, t, seg = 48) => {
  const e = Math.min(t * 0.35, 0.006);
  return LA([[0, -t / 2], [r - e, -t / 2], [r - e * 0.3, -t / 2 + e * 0.3], [r, -t / 2 + e], [r, t / 2 - e], [r - e * 0.3, t / 2 - e * 0.3], [r - e, t / 2], [0, t / 2]], seg, true);
};
// 平らな形を押し出す（xy の形 → 奥行 d、面取り bev）
function EX(key, shape, d, bev = 0.004, curveSeg = 24) {
  return cg('ex' + key + r4(d) + r4(bev), () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: curveSeg });
    g.translate(0, 0, -d / 2);
    return worldUV(g);
  });
}

// ---------- 置き方の道具 ----------
function mk(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// a から b へ伸びる棒
function rod(parent, a, b, r1, mat, r2 = r1, seg = 10) {
  const d = b.clone().sub(a), len = d.length();
  const m = mk(parent, C(r2, r1, 1, seg), mat);
  m.scale.y = len;
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
function curveOf(pts, closed = false) {
  return new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : V3(p[0], p[1], p[2])), closed);
}
function tube(parent, pts, r, mat, seg = 32, rs = 8, closed = false) {
  return mk(parent, new THREE.TubeGeometry(curveOf(pts, closed), seg, r, rs, closed), mat);
}
// 小さな部品をまとめて1つの形にする
class Bag {
  constructor() { this.list = []; }
  add(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz)));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (color) {
      const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    this.list.push(g);
    return g;
  }
  addM(geo, matrix, color = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (color) {
      const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    this.list.push(g);
  }
  rod(a, b, r, seg = 6, color = null) {
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), V3(1, 1, 1));
    this.addM(new THREE.CylinderGeometry(r, r, len, seg, 1, true), m, color);
  }
  mesh(parent, mat) {
    if (!this.list.length) return null;
    const hasColor = this.list.some(g => g.attributes.color);
    if (hasColor) for (const g of this.list) if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    return mk(parent, mergeGeometries(this.list), mat);
  }
}
function setLight(g, y, intensity = 1, color = '#ffd9a8') { g.userData.light = { color, intensity, y }; }
function bulb(g, x, y, z, r = 0.025) {
  const m = mk(g, S(r, 14, 10), BULB(), x, y, z); m.castShadow = false; return m;
}
// 動きを足す（いくつ足しても1つの tick にまとまる）
function addTick(g, fn) {
  const list = g.userData._ticks || (g.userData._ticks = []);
  list.push(fn);
  if (!g.userData.tick) g.userData.tick = (t, dt) => { for (const f of list) f(t, dt); };
}
const noRay = o => { o.raycast = () => {}; o.castShadow = false; return o; };

// =====================================================================
// 光る効果（シェーダー）
// =====================================================================
// きらめく星の粒：pts = [x,y,z,...]。大きさは m。t で明るさがまたたく
const SPARK_VS = `
uniform float uTime, uSize, uViewH, uSpeed, uBase;
attribute float aPhase; attribute float aSize; attribute vec3 aColor;
varying float vA; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = sin(uTime * uSpeed * (0.6 + aSize * 0.5) + aPhase);
  float tw = uBase + (1.0 - uBase) * pow(0.5 + 0.5 * s, 6.0);
  vA = tw; vC = aColor;
  gl_PointSize = uSize * aSize * (0.5 + tw) * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FS = `
uniform vec3 uColor; varying float vA; varying vec3 vC;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float core = exp(-d * d * 60.0);
  float rays = max(0.0, 1.0 - abs(p.x) * 28.0) * max(0.0, 1.0 - abs(p.y) * 2.1)
             + max(0.0, 1.0 - abs(p.y) * 28.0) * max(0.0, 1.0 - abs(p.x) * 2.1);
  float a = (core * 1.3 + rays * 0.7) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * vC * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function sparkles(parent, pts, { size = 0.05, color = '#ffffff', colors = null, speed = 1.5, base = 0.15, seed = 1 } = {}) {
  const n = pts.length / 3, R = rng(seed);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ph = new Float32Array(n), sz = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    ph[i] = R() * TAU * 4; sz[i] = 0.5 + R();
    c.set(colors ? colors[Math.floor(R() * colors.length)] : '#ffffff');
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.boundingBox = new THREE.Box3(); // 置く位置の計算に入れない
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: size }, uViewH: { value: 800 }, uSpeed: { value: speed }, uBase: { value: base }, uColor: { value: new THREE.Color(color) } },
    vertexShader: SPARK_VS, fragmentShader: SPARK_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = noRay(new THREE.Points(geo, mat));
  const vs = new THREE.Vector2();
  p.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(vs); mat.uniforms.uViewH.value = vs.y; };
  p.frustumCulled = false;
  parent.add(p);
  return p;
}
// 炎（ゆらめく）：flameGeo の上に重ねて使う
const FLAME_VS = `
uniform float uTime; uniform float uPhase;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec3 p = position;
  float h = uv.y;
  p.x += sin(h * 7.0 + uTime * 9.0 + uPhase) * 0.12 * h * h * 0.2;
  p.z += cos(h * 6.0 + uTime * 7.0 + uPhase * 1.3) * 0.10 * h * h * 0.2;
  p.y *= 1.0 + 0.12 * sin(uTime * 13.0 + uPhase * 2.0) * h;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = `
uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float h = vUv.y;
  float face = pow(abs(dot(vN, vV)), 1.6);
  vec3 c = mix(vec3(1.0, 0.95, 0.75), vec3(1.0, 0.55, 0.12), smoothstep(0.05, 0.55, h));
  c = mix(c, vec3(0.9, 0.18, 0.03), smoothstep(0.5, 1.0, h));
  float a = face * (1.0 - smoothstep(0.35, 1.0, h)) * smoothstep(0.0, 0.08, h) * uI;
  gl_FragColor = vec4(c * a * 2.2, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const flameGeo = (r = 0.03, h = 0.12) => LA(smooth([[0.0001, 0], [r * 0.8, h * 0.08], [r, h * 0.25], [r * 0.7, h * 0.55], [r * 0.25, h * 0.85], [0.0001, h]], 14), 14);
function flame(parent, x, y, z, r, h, phase = 0, intensity = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPhase: { value: phase }, uI: { value: intensity } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = noRay(new THREE.Mesh(flameGeo(r, h), mat));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// 流れる水（滝・噴水）。uv の v が上→下
const WATER_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FALL_FS = `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uCols;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
void main(){
  float col = floor(vUv.x * uCols);
  float r = hash(col);
  float flow = fract(vUv.y * (2.0 + r * 2.0) + uTime * (0.9 + r * 0.7) + r * 7.0);
  float streak = smoothstep(0.0, 0.25, flow) * (1.0 - smoothstep(0.5, 1.0, flow));
  float fx = fract(vUv.x * uCols);
  float line = 1.0 - abs(fx - 0.5) * 2.0;
  float s = streak * pow(line, 0.6) * (0.4 + 0.6 * r);
  float foam = smoothstep(0.82, 1.0, 1.0 - vUv.y);
  float fres = 1.0 - abs(dot(vN, vV));
  vec3 c = mix(uColor, vec3(1.0), s * 0.75 + foam * 0.6) + fres * 0.15;
  float a = uOpacity * (0.35 + s * 0.65 + foam * 0.4);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function fallMat(color = '#9fd4ee', opacity = 0.7, cols = 40) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uCols: { value: cols } },
    vertexShader: WATER_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
// 水面のゆらめき（池・水槽の上面）
const POOL_FS = `
uniform float uTime; uniform vec3 uColor; uniform float uScale;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec2 p = vUv * uScale;
  float w = 0.0;
  w += sin(p.x * 3.1 + uTime * 1.3 + sin(p.y * 2.3 + uTime));
  w += sin(p.y * 4.3 - uTime * 1.7 + sin(p.x * 1.7 - uTime * 0.6));
  w += sin((p.x + p.y) * 5.7 + uTime * 2.1);
  float c = pow(abs(sin(w * 1.6)), 9.0);
  vec3 col = uColor + vec3(0.75, 0.9, 1.0) * c * 0.65;
  gl_FragColor = vec4(col, 0.78 + c * 0.2);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function poolMat(color = '#1f6f8c', scale = 6) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uScale: { value: scale } },
    vertexShader: WATER_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false,
  });
}
// やわらかな光の輪（後光・オーロラの光だまり）
const HALO_FS = `
uniform float uTime; uniform vec3 uColor; uniform float uRays; uniform float uI;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec2 p = vUv - 0.5; float d = length(p) * 2.0; float a = atan(p.y, p.x);
  float rays = 0.55 + 0.45 * sin(a * uRays + uTime * 0.6) * sin(a * (uRays * 0.5 + 3.0) - uTime * 0.4);
  float g = exp(-d * d * 3.5) * (0.35 + 0.65 * rays) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(uColor * g * uI, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function haloMat(color = '#ffd27a', rays = 16, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uRays: { value: rays }, uI: { value: intensity } },
    vertexShader: WATER_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
// t を、動く材質（uTime を持つもの）に配る
function timeTick(g, mats, speed = 1) {
  addTick(g, t => { for (const m of mats) m.uniforms.uTime.value = t * speed; });
}

// ---------- よく使う部品 ----------
// ボタン留め（チェスターフィールド）の面：w×h の板、ボタンのくぼみつき。手前が +Z
function tuftGeo(w, h, nx, ny, depth = 0.025) {
  return cg(`tuft${r4(w)},${r4(h)},${nx},${ny},${r4(depth)}`, () => {
    const g = new THREE.PlaneGeometry(w, h, nx * 6, ny * 6);
    const p = g.attributes.position, sx = w / nx, sy = h / ny;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2;
      let best = 9;
      for (let j = 0; j <= ny; j++) {
        const off = j % 2 ? sx / 2 : 0;
        for (let k = -1; k <= nx + 1; k++) {
          const d = Math.hypot((x - (k * sx + off)) / sx, (y - j * sy) / sy);
          if (d < best) best = d;
        }
      }
      const edge = Math.min(x, w - x, y, h - y) / Math.min(sx, sy);
      const z = depth * Math.pow(clamp(best / 0.55, 0, 1), 0.6) * clamp(edge * 2.5, 0, 1);
      p.setZ(i, z + n3(x * 30, y * 30, 0, 3) * 0.0015);
    }
    g.computeVertexNormals();
    return worldUV(g, 1);
  });
}
function tuftButtons(w, h, nx, ny) {
  const out = [], sx = w / nx, sy = h / ny;
  for (let j = 1; j < ny; j++) {
    const off = j % 2 ? sx / 2 : 0;
    for (let k = 0; k <= nx; k++) {
      const x = k * sx + off;
      if (x > 0.02 && x < w - 0.02) out.push([x - w / 2, j * sy - h / 2]);
    }
  }
  return out;
}
function tufted(g, w, h, nx, ny, mat, x, y, z, rx = 0, ry = 0) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z); grp.rotation.set(rx, ry, 0);
  mk(grp, tuftGeo(w, h, nx, ny), mat);
  const bag = new Bag();
  for (const [bx, by] of tuftButtons(w, h, nx, ny)) bag.add(S(0.009, 8, 6), bx, by, 0.004, 0, 0, 0, 1, 1, 0.6);
  bag.mesh(grp, mat);
  g.add(grp);
  return grp;
}
// びん（ガラス＋中身＋ふた）
const BOTTLES = {
  whisky: [[0.001, 0], [0.045, 0], [0.048, 0.01], [0.048, 0.17], [0.042, 0.19], [0.016, 0.21], [0.014, 0.27], [0.016, 0.28]],
  wine: [[0.001, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.19], [0.03, 0.23], [0.014, 0.26], [0.013, 0.31], [0.015, 0.32]],
  gin: [[0.001, 0], [0.05, 0], [0.052, 0.012], [0.05, 0.14], [0.035, 0.17], [0.017, 0.18], [0.017, 0.22], [0.019, 0.225]],
  round: [[0.001, 0], [0.04, 0.003], [0.06, 0.05], [0.058, 0.1], [0.03, 0.14], [0.014, 0.16], [0.014, 0.2], [0.016, 0.205]],
};
function bottle(g, x, y, z, kind = 'whisky', glassC = '#c7d6d0', liq = '#a8521a', cap = 'gold', s = 1) {
  const pts = BOTTLES[kind].map(p => [p[0] * s, p[1] * s]);
  mk(g, LA(pts, 20), glassT(glassC, 0.42), x, y, z);
  const top = pts[pts.length - 1][1];
  if (liq) mk(g, LA(pts.slice(0, 5).map(p => [p[0] * 0.92, p[1] * 0.86 + 0.004]).concat([[0.001, pts[4][1] * 0.86]]), 18), liquid(liq), x, y, z);
  mk(g, C(pts[pts.length - 1][0] * 1.1, pts[pts.length - 1][0] * 1.1, 0.025 * s, 12), cap === 'gold' ? GOLD() : cap === 'cork' ? paintG('#b58a5a', 0.9) : paintG(cap, 0.4), x, y + top + 0.01 * s, z);
}
function rocksGlass(g, x, y, z, liq = null, s = 1) {
  mk(g, LA([[0.001, 0], [0.035 * s, 0], [0.036 * s, 0.012 * s], [0.04 * s, 0.085 * s], [0.037 * s, 0.085 * s], [0.032 * s, 0.014 * s], [0.001, 0.014 * s]], 12), cm('cutglass', () => phys({ color: '#ffffff', roughness: 0, transparent: true, opacity: 0.35, envMapIntensity: 3, flatShading: true, iridescence: 0.4, side: THREE.DoubleSide, depthWrite: false })), x, y, z);
  if (liq) mk(g, C(0.031 * s, 0.03 * s, 0.03 * s, 12), liquid(liq, 0.8), x, y + 0.03 * s, z);
}
// 布のかさの内側（光る）
const innerGlow = c => cm('ig' + c, () => std({ color: c, emissive: '#ffd9a8', emissiveIntensity: 0.7, roughness: 0.6, side: THREE.BackSide }));
const BRASS_DS = () => cm('brassds', () => phys({ color: '#d4aa62', metalness: 1, roughness: 0.22, side: THREE.DoubleSide }));

// =====================================================================
// ★3：少し豪華な単品
// =====================================================================
// 真ちゅうのアーチライト（大理石の台）
function arcLamp(s) {
  const g = new THREE.Group();
  mk(g, B(0.42, 0.075, 0.34, 0.014), marble(s.marble || 'white'), 0, 0.0375, 0);
  mk(g, C(0.03, 0.04, 0.03, 20), BRASS(), -0.08, 0.09, 0);
  tube(g, [V3(-0.08, 0.08, 0), V3(-0.08, 0.9, 0), V3(0.02, 1.62, 0.02), V3(0.42, 2.02, 0.06), V3(0.92, 1.98, 0.1), V3(1.18, 1.76, 0.14)], 0.012, BRASS(), 80, 10);
  const pts = smooth([[0.215, 0.0], [0.19, 0.07], [0.13, 0.15], [0.05, 0.195], [0.001, 0.2]], 20);
  const y = 1.53;
  mk(g, LA(pts, 40), BRASS(), 1.2, y, 0.14);
  mk(g, LA(pts.map(p => [p[0] * 0.985, p[1] - 0.002]), 40), innerGlow('#fff3dc'), 1.2, y, 0.14).castShadow = false;
  mk(g, T(0.214, 0.004, 6, 48), BRASS(), 1.2, y, 0.14, PI / 2);
  bulb(g, 1.2, y + 0.06, 0.14, 0.04);
  setLight(g, y, 1.3, '#ffd6a0');
  return g;
}
// ベルベットのチェスターフィールドチェア
function chesterChair(s) {
  const g = new THREE.Group();
  const v = velvet(s.fabric || '#1f4d3a');
  const W = 0.98, D = 0.86, H = 0.76;
  for (const [x, z] of [[-0.42, -0.36], [0.42, -0.36], [-0.42, 0.36], [0.42, 0.36]]) {
    mk(g, LA(smooth([[0.001, 0], [0.03, 0.005], [0.042, 0.03], [0.036, 0.06], [0.03, 0.07]], 10), 16), wood('walnut'), x, 0, z);
    mk(g, C(0.022, 0.022, 0.012, 12), BRASS(), x, 0.002, z);
  }
  mk(g, B(W, 0.3, D, 0.05), v, 0, 0.22, 0);
  // 背もたれ
  mk(g, B(W, H - 0.3, 0.2, 0.05), v, 0, 0.3 + (H - 0.3) / 2, -D / 2 + 0.1);
  tufted(g, W - 0.32, H - 0.42, 4, 3, v, 0, 0.42 + (H - 0.42) / 2 - 0.02, -D / 2 + 0.2);
  mk(g, C(0.085, 0.085, W, 24), v, 0, H, -D / 2 + 0.11, 0, 0, PI / 2);
  // ひじ掛け（丸く巻いた形）
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.08);
    mk(g, B(0.16, H - 0.36, D - 0.02, 0.04), v, x, 0.36 + (H - 0.36) / 2 - 0.02, 0.01);
    mk(g, C(0.09, 0.09, D - 0.04, 24), v, x + sx * 0.015, H - 0.02, 0.01, PI / 2);
    mk(g, S(0.012, 10, 8), BRASS(), x + sx * 0.015, H - 0.02, D / 2 - 0.01);
    tufted(g, D - 0.36, H - 0.48, 3, 2, v, x - sx * 0.081, 0.44 + (H - 0.48) / 2 - 0.02, 0.06, 0, -sx * PI / 2);
  }
  mk(g, B(W - 0.32, 0.15, D - 0.24, 0.06), v, 0, 0.43, 0.08);
  return g;
}
// 籐のピーコックチェア
function peacockGeo() {
  return cg('peacock', () => {
    const nr = 10, na = 40, R0 = 0.1, R = 0.66, a0 = -1.95, a1 = 1.95;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nr; j++) for (let i = 0; i <= na; i++) {
      const r = R0 + (R - R0) * j / nr, a = a0 + (a1 - a0) * i / na;
      const x = r * Math.sin(a), y = r * Math.cos(a);
      pos.push(x, y, 0.22 * Math.pow(x / R, 2) + 0.05 * (r / R) * (1 - Math.abs(Math.sin(a))));
      uv.push(i / na, j / nr);
    }
    for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) {
      const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  });
}
function peacockChair(s) {
  const g = new THREE.Group();
  const lace = cm('rlace', () => { const map = rattanLaceTex(); return std({ color: '#ffffff', map, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide }); });
  const fan = mk(g, peacockGeo(), lace, 0, 0.62, -0.26);
  fan.rotation.x = -0.12;
  // ふちの太い籐
  const rim = [];
  for (let i = 0; i <= 40; i++) {
    const a = -1.95 + 3.9 * i / 40, x = 0.66 * Math.sin(a);
    rim.push(V3(x, 0.62 + 0.66 * Math.cos(a) * Math.cos(0.12), -0.26 + 0.22 * (x / 0.66) ** 2 + 0.66 * Math.cos(a) * Math.sin(-0.12) * -1 * 0 + 0.05 * (1 - Math.abs(Math.sin(a)))));
  }
  tube(g, rim, 0.02, RATTAN(), 80, 8);
  // 座面・脚（砂時計の形）
  const base = smooth([[0.26, 0], [0.2, 0.06], [0.11, 0.2], [0.13, 0.3], [0.3, 0.4]], 20);
  mk(g, LA(base, 32), lace, 0, 0, 0);
  mk(g, T(0.26, 0.016, 6, 40), RATTAN(), 0, 0.012, 0, PI / 2);
  mk(g, T(0.11, 0.016, 6, 32), RATTAN(), 0, 0.2, 0, PI / 2);
  mk(g, DISC(0.33, 0.04), RATTAN(), 0, 0.42, 0);
  mk(g, T(0.33, 0.022, 8, 48), RATTAN(), 0, 0.42, 0, PI / 2);
  // ひじ掛け
  for (const sx of [-1, 1]) tube(g, [V3(sx * 0.3, 0.42, 0.12), V3(sx * 0.4, 0.55, 0.0), V3(sx * 0.48, 0.7, -0.15), V3(sx * 0.5, 0.85, -0.2)], 0.018, RATTAN(), 24, 8);
  // クッション
  const cu = cloth(s.fabric || '#efe6d4');
  mk(g, LA(smooth([[0.001, 0], [0.27, 0.0], [0.31, 0.035], [0.27, 0.075], [0.001, 0.08]], 12), 32), cu, 0, 0.44, 0.0);
  mk(g, B(0.42, 0.34, 0.12, 0.05), cu, 0, 0.66, -0.17, -0.2);
  return g;
}
// アールデコのバーカート
function barCart(s) {
  const g = new THREE.Group();
  const M = s.mat === 'chrome' ? CHROME() : GOLD();
  const W = 0.82, D = 0.44;
  for (const y of [0.24, 0.64]) {
    mk(g, B(W - 0.02, 0.008, D - 0.02, 0.002), glassT('#9ab0a8', 0.35), 0, y, 0);
    mk(g, B(W - 0.04, 0.006, D - 0.04, 0.002), MIRROR(), 0, y - 0.006, 0);
    tube(g, [V3(-W / 2, y, -D / 2), V3(W / 2, y, -D / 2), V3(W / 2, y, D / 2), V3(-W / 2, y, D / 2)], 0.008, M, 32, 6, true).geometry;
    tube(g, [V3(-W / 2, y + 0.04, -D / 2), V3(W / 2, y + 0.04, -D / 2), V3(W / 2, y + 0.04, D / 2), V3(-W / 2, y + 0.04, D / 2)], 0.005, M, 32, 6, true);
  }
  for (const [x, z] of [[-W / 2, -D / 2], [-W / 2, D / 2], [W / 2 - 0.06, -D / 2], [W / 2 - 0.06, D / 2]]) rod(g, V3(x, 0.06, z), V3(x, 0.7, z), 0.009, M);
  // 取っ手
  for (const z of [-D / 2, D / 2]) tube(g, [V3(-W / 2, 0.64, z), V3(-W / 2 - 0.06, 0.78, z), V3(-W / 2 - 0.1, 0.9, z)], 0.009, M, 16, 6);
  rod(g, V3(-W / 2 - 0.1, 0.9, -D / 2), V3(-W / 2 - 0.1, 0.9, D / 2), 0.012, M);
  // 大きな車輪
  for (const z of [-D / 2 - 0.02, D / 2 + 0.02]) {
    mk(g, T(0.16, 0.012, 8, 40), M, W / 2 - 0.06, 0.17, z);
    mk(g, T(0.155, 0.009, 6, 40), paintG('#151515', 0.6), W / 2 - 0.06, 0.17, z);
    mk(g, C(0.022, 0.022, 0.03, 16), M, W / 2 - 0.06, 0.17, z, PI / 2);
    const bag = new Bag();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; bag.rod(V3(0, 0, 0), V3(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0), 0.004, 6); }
    bag.mesh(g, M).position.set(W / 2 - 0.06, 0.17, z);
  }
  for (const z of [-D / 2, D / 2]) mk(g, S(0.025, 12, 8), M, -W / 2, 0.035, z);
  rod(g, V3(W / 2 - 0.06, 0.17, -D / 2), V3(W / 2 - 0.06, 0.17, D / 2), 0.008, M);
  // 上段：びんとグラス・アイスペール
  bottle(g, 0.25, 0.648, -0.1, 'whisky', '#d9e3df', '#9c4a15');
  bottle(g, 0.12, 0.648, -0.12, 'gin', '#b9d9cf', '#e8f2ee', '#2b4a3f');
  bottle(g, 0.31, 0.648, 0.06, 'wine', '#3a4a25', '#4a0d14', '#7a1020');
  mk(g, LA([[0.001, 0], [0.06, 0], [0.07, 0.13], [0.065, 0.13], [0.055, 0.008], [0.001, 0.008]], 24), SILVER(), -0.15, 0.648, -0.06);
  for (const [x, z] of [[-0.05, 0.1], [0.04, 0.12], [-0.15, 0.12]]) rocksGlass(g, x, 0.648, z, x > 0 ? '#b5651d' : null);
  // 下段
  bottle(g, -0.22, 0.248, 0.0, 'round', '#d6e0dc', '#c27a2c');
  bottle(g, -0.08, 0.248, -0.05, 'wine', '#2f3d20', '#3a0a10', 'cork');
  bottle(g, 0.06, 0.248, 0.02, 'gin', '#cfe8f2', null, '#1e3b5a');
  return g;
}
// 大理石の台座のサイドテーブル
function marbleSide(s) {
  const g = new THREE.Group();
  const M = marble(s.marble || 'white');
  mk(g, LA(smooth([[0.2, 0], [0.2, 0.02], [0.16, 0.05], [0.07, 0.14], [0.05, 0.3], [0.06, 0.44], [0.14, 0.5], [0.17, 0.52]], 30), 48, true), M, 0, 0, 0);
  mk(g, DISC(0.28, 0.03), M, 0, 0.535, 0);
  mk(g, T(0.28, 0.006, 8, 64), GOLD(), 0, 0.535, 0, PI / 2);
  mk(g, T(0.2, 0.004, 6, 48), GOLD(), 0, 0.02, 0, PI / 2);
  // 上：金の小皿と、クリスタルのボウル
  mk(g, LA([[0.001, 0], [0.11, 0], [0.13, 0.015], [0.125, 0.017], [0.105, 0.004], [0.001, 0.004]], 32), GOLD(), 0.05, 0.55, 0.03);
  mk(g, LA([[0.001, 0], [0.04, 0], [0.07, 0.04], [0.075, 0.07], [0.07, 0.07], [0.062, 0.042], [0.035, 0.008], [0.001, 0.008]], 12), CRYSTAL(), 0.05, 0.567, 0.03);
  for (let i = 0; i < 3; i++) mk(g, S(0.028, 14, 10), cm('fruit' + i, () => phys({ color: ['#e9c23a', '#d8452a', '#e9c23a'][i], roughness: 0.35, clearcoat: 0.6 })), 0.05 + Math.cos(i * 2.1) * 0.025, 0.6, 0.03 + Math.sin(i * 2.1) * 0.025);
  return g;
}
// 金の装飾の壁かけ鏡
function gildedMirror(s) {
  const g = new THREE.Group();
  const M = GOLD(), rx = 0.36, ry = 0.5;
  const ell = (a, k = 1, z = 0.03) => V3(Math.cos(a) * rx * k, Math.sin(a) * ry * k, z);
  const ring = []; for (let i = 0; i < 64; i++) ring.push(ell(i / 64 * TAU));
  tube(g, ring, 0.034, M, 96, 10, true);
  const ring2 = []; for (let i = 0; i < 64; i++) ring2.push(ell(i / 64 * TAU, 0.9, 0.028));
  tube(g, ring2, 0.012, M, 96, 6, true);
  const m = mk(g, cg('ovalmir', () => new THREE.CircleGeometry(1, 64)), MIRROR(), 0, 0, 0.02);
  m.scale.set(rx * 0.92, ry * 0.92, 1);
  mk(g, cg('ovalback', () => new THREE.CircleGeometry(1, 48)), paintG('#2a2018', 0.8), 0, 0, 0.005).scale.set(rx * 1.05, ry * 1.05, 1);
  // 玉の飾り
  const bag = new Bag();
  for (let i = 0; i < 56; i++) { const p = ell(i / 56 * TAU, 0.95, 0.05); bag.add(S(0.009, 6, 4), p.x, p.y, p.z); }
  // 外側の葉（アカンサス）
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU, p = ell(a, 1.1, 0.03);
    bag.add(S(0.03, 8, 6), p.x, p.y, p.z, 0, 0, a, 1.5, 0.55, 0.5);
  }
  bag.mesh(g, M);
  // 上の飾り（貝の形と渦巻き）
  mk(g, LA(smooth([[0.001, 0], [0.06, 0.01], [0.11, 0.05], [0.13, 0.1]], 10), 18, false, PI, -PI / 2), M, 0, ry + 0.02, 0.03, -PI / 2 + 0.3, 0, 0).scale.set(1, 1, 0.5);
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20, a = t * 4.5, r = 0.07 * (1 - t * 0.7); pts.push(V3(sx * (0.08 + t * 0.12 + Math.cos(a) * r * 0.5), ry + 0.04 + Math.sin(a) * r * 0.6, 0.04)); }
    tube(g, pts, 0.012, M, 40, 6);
    const pb = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * 4; pb.push(V3(sx * (0.05 + t * 0.1 + Math.cos(a) * 0.03), -ry - 0.03 - Math.sin(a) * 0.03, 0.04)); }
    tube(g, pb, 0.01, M, 30, 6);
  }
  mk(g, S(0.035, 14, 10), M, 0, -ry - 0.04, 0.04).scale.set(1, 1.3, 0.6);
  return g;
}
// ティファニー風ステンドグラスのランプ
function tiffanyTex() {
  return canvasTex('tiffany', 1024, 256, (ctx, w, h) => {
    const R = rng(77), pts = [];
    for (let i = 0; i < 260; i++) pts.push([R() * w, R() * h]);
    const im = ctx.createImageData(w, h), d = im.data;
    const band = v => v > 0.72 ? ['#c8401c', '#e07a1f', '#9a2412'] : v > 0.45 ? ['#2f7a3a', '#5aa04a', '#1f5a2c', '#d8b23a'] : v > 0.2 ? ['#e3a83a', '#f1c75a', '#c88a2a'] : ['#285a8c', '#3b7bb0', '#1d4570'];
    const col = pts.map(([x, y]) => { const b = band(1 - y / h); return hexRGB(b[Math.floor(R() * b.length)]); });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 1e9, b = 1e9, ai = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x - pts[i][0]); dx = Math.min(dx, w - dx);
        const dd = dx * dx + (y - pts[i][1]) ** 2;
        if (dd < a) { b = a; a = dd; ai = i; } else if (dd < b) b = dd;
      }
      const edge = Math.sqrt(b) - Math.sqrt(a);
      const k = (y * w + x) * 4;
      const c = edge < 2.2 ? [40, 32, 22] : col[ai];
      const f = 0.85 + 0.15 * vn(x / 9, y / 9, 1e6, 1e6, 2);
      d[k] = c[0] * f; d[k + 1] = c[1] * f; d[k + 2] = c[2] * f; d[k + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
  });
}
function tiffanyLamp(s) {
  const g = new THREE.Group();
  mk(g, LA(smooth([[0.13, 0], [0.13, 0.015], [0.1, 0.035], [0.05, 0.06], [0.03, 0.1], [0.022, 0.3], [0.028, 0.42], [0.012, 0.45]], 30), 32), BRONZE(), 0, 0, 0);
  const map = tiffanyTex();
  const sm = cm('tiffanyM', () => std({ color: '#ffffff', map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.75, roughness: 0.2, side: THREE.DoubleSide }));
  const prof = smooth([[0.25, 0], [0.245, 0.03], [0.21, 0.1], [0.14, 0.16], [0.04, 0.19]], 20);
  mk(g, LA(prof, 48), sm, 0, 0.4, 0);
  mk(g, T(0.25, 0.005, 6, 64), BRONZE(), 0, 0.4, 0, PI / 2);
  mk(g, LA([[0.045, 0], [0.04, 0.012], [0.015, 0.03], [0.006, 0.05]], 16), BRONZE(), 0, 0.585, 0);
  bulb(g, 0, 0.47, 0, 0.035);
  setLight(g, 0.47, 1, '#ffc58a');
  return g;
}
// 蓄音機
function gramophone(s) {
  const g = new THREE.Group();
  const W = mk(g, B(0.36, 0.16, 0.36, 0.01), wood('mahogany'), 0, 0.1, 0);
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) mk(g, S(0.022, 12, 8), BRASS(), x, 0.018, z);
  mk(g, B(0.37, 0.02, 0.37, 0.006), wood('mahogany'), 0, 0.03, 0);
  mk(g, B(0.38, 0.012, 0.38, 0.004), BRASS(), 0, 0.186, 0);
  mk(g, C(0.15, 0.15, 0.012, 48), paintG('#3a1a1a', 0.9), -0.02, 0.198, 0.03);
  mk(g, C(0.145, 0.145, 0.003, 48), paintG('#0b0b0b', 0.25), -0.02, 0.206, 0.03);
  mk(g, C(0.045, 0.045, 0.004, 32), paintG('#b8272a', 0.6), -0.02, 0.207, 0.03);
  // 横のハンドル
  rod(g, V3(0.18, 0.1, 0.05), V3(0.24, 0.1, 0.05), 0.006, BRASS());
  rod(g, V3(0.24, 0.1, 0.05), V3(0.24, 0.04, 0.05), 0.005, BRASS());
  mk(g, C(0.01, 0.01, 0.04, 10), wood('ebony'), 0.265, 0.04, 0.05, 0, 0, PI / 2);
  // ラッパ（首からあさがお形）
  tube(g, [V3(0.12, 0.2, -0.13), V3(0.12, 0.3, -0.14), V3(0.1, 0.38, -0.1), V3(0.06, 0.42, -0.04)], 0.016, BRASS(), 24, 10);
  const horn = smooth([[0.016, 0], [0.02, 0.08], [0.035, 0.17], [0.07, 0.25], [0.14, 0.3], [0.24, 0.32], [0.27, 0.32]], 30);
  const hm = mk(g, LA(horn, 40), BRASS_DS(), 0.06, 0.42, -0.04);
  hm.quaternion.setFromUnitVectors(UP, V3(-0.2, 0.55, 0.81).normalize());
  // 針のアーム
  tube(g, [V3(0.12, 0.2, -0.13), V3(0.08, 0.235, -0.04), V3(0.02, 0.23, 0.06)], 0.007, BRASS(), 16, 6);
  mk(g, B(0.03, 0.02, 0.04, 0.004), BRASS(), 0.02, 0.222, 0.07);
  return g;
}
// 地球儀のバー（上半分が開いて、中にお酒）
function globeTex() {
  return canvasTex('gglobe', 1024, 512, (ctx, w, h) => {
    const sea = hexRGB('#d7c193'), land = hexRGB('#9a6b3a'), land2 = hexRGB('#7a8a52'), ink = hexRGB('#4a3018');
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 6, v * 3, 6, 3, 5, 21);
      const lat = Math.abs(v - 0.5) * 2;
      let c = mixRGB(sea, hexRGB('#c4a771'), fbm(u * 20, v * 10, 20, 10, 3, 4) * 0.6);
      const isL = n > 0.53 + lat * 0.05;
      if (isL) c = mixRGB(land, land2, clamp((n - 0.53) * 6, 0, 1) * 0.6);
      if (Math.abs(n - 0.53 - lat * 0.05) < 0.006) c = ink;
      const gl = Math.min(Math.abs(((u * 24) % 1) - 0.5), Math.abs(((v * 12) % 1) - 0.5));
      if (gl > 0.485) c = mixRGB(c, ink, 0.5);
      const age = 0.85 + 0.15 * fbm(u * 3, v * 3, 3, 3, 3, 8);
      o[0] = c[0] * age; o[1] = c[1] * age; o[2] = c[2] * age;
    });
  });
}
function globeBar(s) {
  const g = new THREE.Group();
  const Wd = wood('walnut'), R = 0.32, Y = 0.72;
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + PI / 4, x = Math.cos(a), z = Math.sin(a);
    tube(g, [V3(x * 0.3, 0, z * 0.3), V3(x * 0.27, 0.2, z * 0.27), V3(x * 0.33, 0.45, z * 0.33), V3(x * 0.38, Y, z * 0.38)], 0.022, Wd, 20, 8);
    mk(g, S(0.03, 12, 8), BRASS(), x * 0.3, 0.02, z * 0.3);
  }
  mk(g, DISC(0.27, 0.025), Wd, 0, 0.2, 0);
  // 地平線の輪（木）
  mk(g, LA([[R + 0.015, -0.02], [R + 0.07, -0.02], [R + 0.075, 0.0], [R + 0.07, 0.02], [R + 0.015, 0.02]], 64, true), Wd, 0, Y, 0);
  const gm = cm('globeM', () => phys({ color: '#ffffff', map: globeTex(), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  const inner = paintG('#3b2414', 0.6);
  mk(g, cg('ghLow', () => new THREE.SphereGeometry(R, 48, 16, 0, TAU, PI / 2, PI / 2)), gm, 0, Y, 0);
  mk(g, cg('ghLowIn', () => new THREE.SphereGeometry(R * 0.97, 32, 12, 0, TAU, PI / 2, PI / 2)), cm('ghin', () => std({ color: '#5a3820', roughness: 0.5, side: THREE.BackSide })), 0, Y, 0);
  // 上半分（後ろの蝶番で開く）
  const lid = new THREE.Group(); lid.position.set(0, Y, -R); lid.rotation.x = -1.75; g.add(lid);
  mk(lid, cg('ghUp', () => new THREE.SphereGeometry(R, 48, 16, 0, TAU, 0, PI / 2)), gm, 0, 0, R);
  mk(lid, cg('ghUpIn', () => new THREE.SphereGeometry(R * 0.97, 32, 12, 0, TAU, 0, PI / 2)), cm('ghin', () => std({ color: '#5a3820', roughness: 0.5, side: THREE.BackSide })), 0, 0, R);
  mk(lid, T(R + 0.002, 0.006, 6, 64), BRASS(), 0, 0, R, PI / 2);
  // 子午線（真ちゅうの半円）
  mk(g, T(R + 0.03, 0.007, 6, 48, PI * 1.05), BRASS(), 0, Y, 0, 0, PI / 2, -PI / 2 - 0.08);
  mk(g, C(R * 0.9, R * 0.9, 0.012, 32), inner, 0, Y - 0.12, 0);
  bottle(g, -0.1, Y - 0.115, -0.06, 'whisky', '#d9e3df', '#9c4a15');
  bottle(g, 0.08, Y - 0.115, -0.1, 'wine', '#334422', '#3a0a10', 'cork');
  bottle(g, 0.12, Y - 0.115, 0.06, 'round', '#d6e0dc', '#c27a2c');
  rocksGlass(g, -0.08, Y - 0.115, 0.12, '#b5651d'); rocksGlass(g, 0.0, Y - 0.115, 0.15);
  return g;
}
// 鉄のらせんプランタースタンドとシダ
const LEAFG = () => cg('leaflet', () => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.5, 0.25, 1, 0); sh.quadraticCurveTo(0.5, -0.25, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 3); g.rotateX(-PI / 2); return g;
});
const FERN = () => cm('fern', () => std({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide }));
function fernInto(list, base, size, seed) {
  const R = rng(seed);
  const n = 8;
  for (let f = 0; f < n; f++) {
    const a = f / n * TAU + R() * 0.5, L = size * (0.75 + R() * 0.4);
    const dir = V3(Math.cos(a), 0, Math.sin(a)), side = V3(-dir.z, 0, dir.x);
    const P = s => base.clone().addScaledVector(dir, s * L * 0.85).add(V3(0, Math.sin(s * PI * 0.75) * L * 0.55 - s * s * L * 0.3, 0));
    const steps = 11;
    for (let i = 1; i <= steps; i++) {
      const s = i / steps, p = P(s), q = P(Math.min(1, s + 0.02));
      const tan = q.clone().sub(p).normalize();
      const len = size * 0.22 * Math.sin(PI * (0.15 + s * 0.85)) + 0.01;
      for (const sd of [-1, 1]) {
        const out = side.clone().multiplyScalar(sd).addScaledVector(tan, 0.4).normalize();
        const m = new THREE.Matrix4().makeBasis(out, out.clone().cross(tan).multiplyScalar(sd).normalize().negate(), tan);
        m.scale(V3(len, 1, len)); m.setPosition(p);
        list.push([m, 0.27 + R() * 0.05, 0.4 + R() * 0.1 - s * 0.08]);
      }
    }
  }
}
function plantStand(s) {
  const g = new THREE.Group();
  const I = IRON();
  rod(g, V3(0, 0, 0), V3(0, 1.2, 0), 0.012, I);
  mk(g, S(0.025, 12, 8), I, 0, 1.22, 0);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; tube(g, [V3(0, 0.12, 0), V3(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15), V3(Math.cos(a) * 0.26, 0.01, Math.sin(a) * 0.26), V3(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3)], 0.01, I, 16, 6); }
  const sp = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 2.2; sp.push(V3(Math.cos(a) * 0.09, 0.05 + t * 1.1, Math.sin(a) * 0.09)); }
  tube(g, sp, 0.007, I, 140, 5);
  const leaves = [];
  const pots = [[0.32, 0], [0.55, 2.1], [0.78, 4.2], [1.0, 0.9]];
  pots.forEach(([y, a], i) => {
    const x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24;
    rod(g, V3(0, y, 0), V3(x, y, z), 0.008, I);
    mk(g, T(0.1, 0.007, 6, 32), I, x, y, z, PI / 2);
    const bag = new Bag(); for (let k = 0; k < 8; k++) { const b = k / 8 * TAU; bag.add(T(0.025, 0.004, 4, 12), x + Math.cos(b) * 0.1, y - 0.02, z + Math.sin(b) * 0.1, 0, -b, 0); }
    bag.mesh(g, I);
    mk(g, LA(smooth([[0.001, 0], [0.07, 0], [0.085, 0.03], [0.095, 0.11], [0.1, 0.12], [0.088, 0.12]], 12), 24), i % 2 ? paintG('#e9e3d6', 0.3) : paintG('#b4613d', 0.9), x, y + 0.004, z);
    mk(g, C(0.085, 0.085, 0.01, 20), paintG('#3a2a1c', 1), x, y + 0.11, z);
    fernInto(leaves, V3(x, y + 0.115, z), 0.32, 11 + i);
  });
  const im = new THREE.InstancedMesh(LEAFG(), FERN(), leaves.length);
  const c = new THREE.Color();
  leaves.forEach(([m, h, l], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(h, 0.55, l * 0.6)); });
  im.castShadow = true; im.receiveShadow = true;
  g.add(im);
  return g;
}
// クリスタルのデキャンタセット（銀のトレイ）
function decanterSet(s) {
  const g = new THREE.Group();
  const tray = mk(g, LA([[0.001, 0], [0.2, 0], [0.21, 0.02], [0.22, 0.025], [0.205, 0.022], [0.195, 0.006], [0.001, 0.006]], 48), SILVER(), 0, 0, 0);
  tray.scale.set(1.35, 1, 1);
  for (const sx of [-1, 1]) mk(g, T(0.03, 0.005, 6, 16, PI), SILVER(), sx * 0.3, 0.025, 0, 0, sx > 0 ? PI / 2 : -PI / 2, 0);
  const cut = cm('cutcrys', () => phys({ color: '#ffffff', roughness: 0, transparent: true, opacity: 0.33, envMapIntensity: 3.5, flatShading: true, iridescence: 0.7, iridescenceIOR: 1.5, side: THREE.DoubleSide, depthWrite: false }));
  const dec = [[0.001, 0], [0.06, 0], [0.068, 0.02], [0.07, 0.13], [0.06, 0.16], [0.025, 0.19], [0.02, 0.23], [0.03, 0.24]];
  [[-0.12, '#a8521a'], [0.06, '#6a0e1c']].forEach(([x, lq], i) => {
    mk(g, LA(dec, 10), cut, x, 0.006, -0.04 - i * 0.02);
    mk(g, LA([[0.001, 0.008], [0.062, 0.008], [0.064, 0.02], [0.065, 0.1], [0.001, 0.1]], 10), liquid(lq, 0.88), x, 0.006, -0.04 - i * 0.02);
    const st = mk(g, cg('stopper', () => new THREE.IcosahedronGeometry(0.035, 0)), cut, x, 0.28, -0.04 - i * 0.02);
    st.scale.set(1, 1.2, 1);
    mk(g, C(0.012, 0.016, 0.04, 10), cut, x, 0.25, -0.04 - i * 0.02);
  });
  [[0.18, 0.06, '#a8521a'], [0.24, -0.06, null], [-0.04, 0.1, null], [0.12, 0.13, '#a8521a']].forEach(([x, z, l]) => rocksGlass(g, x, 0.006, z, l, 0.95));
  return g;
}
// 植物画の3枚組（壁かけ）
function botanicalTex(kind) {
  return canvasTex('bot' + kind, 384, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f2ead8'; ctx.fillRect(0, 0, w, h);
    const R = rng(kind * 31 + 5);
    for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(150,120,80,${R() * 0.05})`; ctx.fillRect(R() * w, R() * h, 2, 2); }
    ctx.lineCap = 'round';
    const leaf = (x, y, a, L, Wd, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -Wd, L, 0); ctx.quadraticCurveTo(L * 0.5, Wd, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(40,60,30,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.restore();
    };
    ctx.strokeStyle = '#4c5e2e'; ctx.lineWidth = 3;
    if (kind === 0) { // シダ
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.9); ctx.quadraticCurveTo(w * 0.45, h * 0.5, w * 0.55, h * 0.12); ctx.stroke();
      for (let i = 0; i < 22; i++) { const t = i / 22, y = h * (0.85 - t * 0.7), x = w * (0.5 - 0.02 * Math.sin(t * 3)) + t * 10; const L = 110 * Math.sin(PI * (0.15 + t * 0.8)); leaf(x, y, -PI - 0.5, L, 9, '#5f7f3b'); leaf(x, y, 0.5 - 0.0, L, 9, '#6b8c44'); }
    } else if (kind === 1) { // バラ
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.92); ctx.quadraticCurveTo(w * 0.55, h * 0.6, w * 0.5, h * 0.3); ctx.stroke();
      for (const [y, a] of [[0.75, -2.4], [0.62, -0.6], [0.5, -2.6], [0.42, -0.4]]) leaf(w * 0.52, h * y, a, 70, 20, '#5a7a3a');
      for (let r = 70; r > 6; r -= 7) { ctx.fillStyle = `hsl(${350 - r * 0.2},${60}%,${30 + (70 - r) * 0.5}%)`; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.26, r, r * 0.8, r * 0.1, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(80,10,20,0.4)'; ctx.lineWidth = 1; ctx.stroke(); }
    } else { // イチョウ
      ctx.beginPath(); ctx.moveTo(w * 0.4, h * 0.92); ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.62, h * 0.18); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const t = i / 7, x = w * (0.42 + t * 0.2), y = h * (0.85 - t * 0.65), a = (i % 2 ? -1 : 1) * 0.9 - PI / 2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = i % 3 ? '#c9a23a' : '#8aa04a';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -60); ctx.quadraticCurveTo(0, -80, 30, -60); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    ctx.fillStyle = '#5a4a36'; ctx.font = 'italic 18px serif'; ctx.textAlign = 'center';
    ctx.fillText(['Polypodium vulgare', 'Rosa gallica', 'Ginkgo biloba'][kind], w / 2, h * 0.97);
  });
}
function frameRect(g, w, h, fw, fd, mat, x = 0, y = 0, z = 0) {
  mk(g, B(w + fw * 2, fw, fd, 0.004), mat, x, y + h / 2 + fw / 2, z);
  mk(g, B(w + fw * 2, fw, fd, 0.004), mat, x, y - h / 2 - fw / 2, z);
  mk(g, B(fw, h, fd, 0.004), mat, x - w / 2 - fw / 2, y, z);
  mk(g, B(fw, h, fd, 0.004), mat, x + w / 2 + fw / 2, y, z);
}
function botanical(s) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.46;
    frameRect(g, 0.36, 0.48, 0.03, 0.035, GOLD(), x, 0, 0.0175);
    mk(g, B(0.36, 0.48, 0.01, 0.001), paintG('#f7f3ea', 0.9), x, 0, 0.012);
    const t = botanicalTex(i);
    mk(g, cg('botplane', () => new THREE.PlaneGeometry(0.27, 0.36)), cm('botm' + i, () => std({ color: '#ffffff', map: t, roughness: 0.85 })), x, 0, 0.018);
    mk(g, B(0.38, 0.5, 0.004, 0.001), glassT('#ffffff', 0.08), x, 0, 0.03);
  }
  return g;
}
// 真ちゅうの燭台（5本）
function candelabra(s) {
  const g = new THREE.Group();
  const M = s.mat === 'silver' ? SILVER() : GOLD();
  mk(g, LA(smooth([[0.1, 0], [0.1, 0.015], [0.06, 0.04], [0.03, 0.08], [0.02, 0.2], [0.028, 0.24], [0.015, 0.3], [0.02, 0.36], [0.03, 0.38]], 30), 32), M, 0, 0, 0);
  const tops = [V3(0, 0.46, 0)];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + PI / 4, x = Math.cos(a) * 0.17, z = Math.sin(a) * 0.17;
    tube(g, [V3(0, 0.3, 0), V3(x * 0.4, 0.27, z * 0.4), V3(x * 0.9, 0.3, z * 0.9), V3(x, 0.38, z)], 0.008, M, 20, 6);
    tops.push(V3(x, 0.38, z));
  }
  rod(g, V3(0, 0.36, 0), V3(0, 0.46, 0), 0.012, M);
  tops.forEach((p, i) => {
    mk(g, LA([[0.001, 0], [0.02, 0], [0.032, 0.02], [0.03, 0.025], [0.016, 0.01], [0.016, 0.03]], 20), M, p.x, p.y, p.z);
    mk(g, C(0.013, 0.013, 0.14, 14), paintG('#f4ede0', 0.6), p.x, p.y + 0.09, p.z);
    rod(g, V3(p.x, p.y + 0.16, p.z), V3(p.x, p.y + 0.172, p.z), 0.0015, paintG('#222', 0.8));
    flame(g, p.x, p.y + 0.165, p.z, 0.011, 0.045, i * 1.7, 1);
  });
  setLight(g, 0.55, 0.9, '#ffb86b');
  return g;
}

// =====================================================================
// ★3：上質な定番（どの部屋にもなじむ）
// =====================================================================
// ブークレ（もこもこ）の質感
function boucleTex() {
  return canvasTex('boucle', 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (u, v, o) => {
      let k = 0;
      for (let i = 0; i < 3; i++) k += Math.abs(Math.sin((u * 40 + fbm(u * 8, v * 8, 8, 8, 2, i) * 3) * PI) * Math.sin((v * 40 + fbm(u * 8, v * 8, 8, 8, 2, i + 5) * 3) * PI));
      const c = clamp(k / 3 * 255, 0, 255);
      o[0] = o[1] = o[2] = c;
    });
  }, { srgb: false, rep: 4 });
}
const boucle = c => cm('bc' + c, () => phys({ color: c, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff'), bumpMap: boucleTex(), bumpScale: 1.5 }));
// トラバーチン（穴のある石）
function travTex() {
  return canvasTex('trav', 512, 512, (ctx, w, h) => {
    const A = hexRGB('#e2d3bb'), Bc = hexRGB('#c9b391'), H = hexRGB('#9f8762');
    pixels(ctx, w, h, (u, v, o) => {
      const band = fbm(u * 2, v * 14, 2, 14, 4, 3);
      let c = mixRGB(A, Bc, band);
      const hole = fbm(u * 30, v * 60, 30, 60, 2, 9);
      const hole2 = fbm(u * 80, v * 160, 80, 160, 2, 19);
      if (hole > 0.7 && hole2 > 0.55) c = mixRGB(c, H, 0.75);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  });
}
const TRAV = () => cm('trav', () => std({ color: '#ffffff', map: travTex(), roughness: 0.55 }));

// レザーのラウンジチェア＋オットマン
function loungeChair(s) {
  const g = new THREE.Group();
  const L = leather(s.fabric || '#2a1a12'), P = wood(s.mat || 'rosewood'), A = paintG('#2b2b2d', 0.35, 0.9);
  // 5本脚の台
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + PI / 2; rod(g, V3(0, 0.12, 0), V3(Math.cos(a) * 0.36, 0.04, Math.sin(a) * 0.36), 0.016, A, 0.01); mk(g, C(0.018, 0.018, 0.02, 10), paintG('#111', 0.6), Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36); }
  mk(g, C(0.03, 0.035, 0.2, 16), A, 0, 0.2, 0);
  // 座（合板のシェル＋革のクッション）
  const seat = new THREE.Group(); seat.position.set(0, 0.36, 0.05); seat.rotation.x = -0.12; g.add(seat);
  mk(seat, B(0.74, 0.04, 0.62, 0.02), P, 0, 0, 0);
  mk(seat, B(0.66, 0.11, 0.58, 0.05), L, 0, 0.07, 0.01);
  for (const sx of [-1, 1]) {
    mk(seat, B(0.08, 0.05, 0.5, 0.02), A, sx * 0.34, 0.16, -0.02);
    mk(seat, B(0.1, 0.06, 0.48, 0.03), L, sx * 0.34, 0.2, -0.02);
    rod(seat, V3(sx * 0.34, 0.03, -0.1), V3(sx * 0.34, 0.14, -0.06), 0.012, A);
  }
  // 背もたれ（2段）とヘッドレスト
  const back = new THREE.Group(); back.position.set(0, 0.42, -0.26); back.rotation.x = -0.32; g.add(back);
  mk(back, B(0.72, 0.42, 0.04, 0.02), P, 0, 0.22, -0.04);
  mk(back, B(0.64, 0.4, 0.12, 0.05), L, 0, 0.22, 0.03);
  mk(back, B(0.62, 0.26, 0.04, 0.02), P, 0, 0.58, -0.04);
  mk(back, B(0.56, 0.24, 0.12, 0.05), L, 0, 0.58, 0.03);
  rod(back, V3(0, 0.0, -0.07), V3(0, 0.5, -0.07), 0.012, A);
  // オットマン
  const o = new THREE.Group(); o.position.set(0, 0, 0.75); g.add(o);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; rod(o, V3(0, 0.1, 0), V3(Math.cos(a) * 0.25, 0.03, Math.sin(a) * 0.25), 0.013, A, 0.009); }
  mk(o, C(0.025, 0.03, 0.14, 12), A, 0, 0.15, 0);
  mk(o, B(0.56, 0.04, 0.44, 0.02), P, 0, 0.24, 0, -0.08);
  mk(o, B(0.5, 0.1, 0.4, 0.045), L, 0, 0.3, 0.0, -0.08);
  return g;
}
// ガラスと真ちゅうのペンダント
function globePendant(s) {
  const g = new THREE.Group();
  const M = BRASS(), drop = s.drop || 0.7;
  mk(g, LA([[0.001, 0], [0.07, 0], [0.075, 0.01], [0.06, 0.03], [0.001, 0.035]], 24), M, 0, -0.035, 0);
  rod(g, V3(0, -0.035, 0), V3(0, -drop, 0), 0.006, M);
  const y = -drop - 0.2;
  mk(g, LA([[0.04, 0], [0.05, 0.03], [0.03, 0.05], [0.012, 0.06]], 20), M, 0, y + 0.17, 0);
  mk(g, S(0.2, 40, 28), cm('pglass', () => phys({ color: s.tint || '#f6efe2', roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 2.5, side: THREE.DoubleSide, depthWrite: false })), 0, y, 0).castShadow = false;
  mk(g, T(0.201, 0.004, 6, 64), M, 0, y, 0, PI / 2);
  // フィラメント電球
  mk(g, LA(smooth([[0.001, -0.06], [0.04, -0.05], [0.05, 0.0], [0.03, 0.05], [0.015, 0.08]], 16), 20), glow('#ffcf8a', 1.4), 0, y, 0).castShadow = false;
  mk(g, C(0.006, 0.006, 0.08, 6), glow('#ffb35c', 6), 0, y, 0).castShadow = false;
  rod(g, V3(0, y + 0.08, 0), V3(0, y + 0.17, 0), 0.012, M);
  setLight(g, y, 1.1, '#ffd29a');
  return g;
}
// トラバーチンのサイドテーブル
function travSide(s) {
  const g = new THREE.Group();
  mk(g, LA([[0.001, 0], [0.2, 0], [0.205, 0.01], [0.17, 0.05], [0.15, 0.2], [0.15, 0.36], [0.17, 0.4], [0.24, 0.43], [0.245, 0.45], [0.001, 0.45]], 48, true), TRAV(), 0, 0, 0);
  bookLow(g, -0.04, 0.45, 0.02, ['#b9ab90', '#33403a'], 0.3);
  mk(g, LA(smooth([[0.001, 0], [0.04, 0.0], [0.06, 0.05], [0.05, 0.12], [0.025, 0.16], [0.03, 0.19]], 16), 24), paintG('#2d2b28', 0.35), 0.1, 0.45, -0.06);
  return g;
}
// 本を横に重ねる
function bookLow(g, x, y, z, cols, ry = 0) {
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; g.add(grp);
  let h = 0;
  cols.forEach((c, i) => { const t = 0.025 + (i % 2) * 0.01; mk(grp, B(0.2 - i * 0.02, t, 0.15 - i * 0.01, 0.003), paintG(c, 0.8), 0, h + t / 2, 0, 0, i * 0.15, 0); h += t; });
  return h;
}
// 大きな観葉植物（procfurn の植物＋上質な鉢）
function bigPlant(s) {
  const g = new THREE.Group();
  const pot = s.pot || '#e9e2d4';
  mk(g, LA(smooth([[0.001, 0], [0.16, 0], [0.2, 0.05], [0.23, 0.2], [0.22, 0.36], [0.21, 0.4], [0.19, 0.4]], 20), 40), cm('potg' + pot, () => phys({ color: pot, roughness: 0.3, clearcoat: 0.6 })), 0, 0, 0);
  mk(g, C(0.19, 0.19, 0.01, 32), paintG('#3a2a1c', 1), 0, 0.37, 0);
  if (PROC) {
    const p = PROC({ type: 'plant', foliage: s.foliage || 'tree', pot: 'round', potColor: '#3a2a1c', size: s.size || 1.7 });
    p.position.y = 0.2; p.scale.setScalar(1);
    // procfurn の鉢は隠す（大きな鉢に植えかえ）
    p.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.position.y < 0.3 && o.geometry.type === 'LatheGeometry') o.visible = false; });
    g.add(p);
  }
  return g;
}
// 手織りのラグ（床に敷く）
const RUG_PAL = { persian: ['#7b1f24', '#1d2a44', '#e5d2b0', '#c39a4a'], stage: ['#4a0c12', '#111012', '#7a1a1c', '#c08a3a'] };
function rugTex(kind) {
  return canvasTex('rug' + kind, 1024, 768, (ctx, w, h) => {
    if (RUG_PAL[kind]) {
      const [R, N, C2, G] = RUG_PAL[kind].map(hexRGB);
      pixels(ctx, w, h, (u, v, o) => {
        const x = Math.abs(u - 0.5) * 2, y = Math.abs(v - 0.5) * 2;
        let c = R;
        const bd = Math.max(x, y * 0.98);
        if (bd > 0.86) c = N; if (bd > 0.88 && bd < 0.9) c = G; if (bd > 0.95) c = C2;
        if (bd > 0.9 && bd < 0.95 && Math.sin(u * 160) * Math.sin(v * 120) > 0.3) c = G;
        const md = x * 0.75 + y;
        if (md < 0.55) c = N; if (md < 0.5 && md > 0.46) c = G; if (md < 0.32) c = C2; if (md < 0.18) c = R;
        if (bd <= 0.86 && md > 0.55 && Math.sin(x * 40) * Math.sin(y * 30) > 0.65) c = mixRGB(c, G, 0.7);
        const f = 0.82 + 0.18 * vn(u * 400, v * 300, 1e6, 1e6, 1) + 0.08 * fbm(u * 8, v * 6, 8, 6, 3, 2);
        o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
      });
    } else {
      const A = hexRGB('#efe8da'), D = hexRGB('#2c2824');
      pixels(ctx, w, h, (u, v, o) => {
        const x = u * 6, y = v * 4.5;
        const fx = x - Math.floor(x), fy = y - Math.floor(y);
        const dia = Math.abs(Math.abs(fx - 0.5) + Math.abs(fy - 0.5) - 0.5);
        let c = A; if (dia < 0.025 + 0.01 * vn(u * 100, v * 100)) c = D;
        const f = 0.85 + 0.15 * vn(u * 500, v * 400, 1e6, 1e6, 3);
        o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f;
      });
    }
  });
}
function rug(s) {
  const g = new THREE.Group();
  const k = s.pattern || 'persian', W = s.w || 2.0, D = s.d || 1.4;
  const m = cm('rugm' + k, () => phys({ color: '#ffffff', map: rugTex(k), roughness: 1, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color('#d8c8b0') }));
  const geo = cg('rugg' + r4(W) + r4(D), () => { const gg = new THREE.BoxGeometry(W, 0.012, D); return gg; });
  mk(g, geo, m, 0, 0.006, 0).castShadow = false;
  // ふさ
  const bag = new Bag();
  for (const sx of [-1, 1]) for (let i = 0; i < 60; i++) bag.add(B(0.05, 0.003, 0.006, 0), sx * (W / 2 + 0.025), 0.003, -D / 2 + (i + 0.5) * D / 60, 0, (h2(i, sx) - 0.5) * 0.3, 0);
  bag.mesh(g, cloth('#efe6d4')).castShadow = false;
  return g;
}
// ウォールナットのサイドボード（たて溝の扉・真ちゅうの脚）
function sideboard(s) {
  const g = new THREE.Group();
  const W = 1.6, H = 0.6, D = 0.45, y0 = 0.18, Wd = wood(s.mat || 'walnut');
  mk(g, B(W, H, D, 0.012), Wd, 0, y0 + H / 2, 0);
  const bag = new Bag();
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + W / 8 + i * W / 4;
    for (let k = 0; k < 9; k++) bag.add(C(0.014, 0.014, H - 0.08, 10), x - 0.16 + k * 0.04, y0 + H / 2, D / 2, 0, 0, 0, 1, 1, 0.6);
  }
  bag.mesh(g, Wd);
  for (let i = 0; i < 4; i++) mk(g, B(0.006, 0.12, 0.012, 0.002), BRASS(), -W / 2 + W / 4 * (i + (i % 2 ? 0 : 1)) - (i % 2 ? 0 : 0.03) + (i % 2 ? 0.03 : 0), y0 + H / 2, D / 2 + 0.012);
  for (const [x, z] of [[-W / 2 + 0.08, -D / 2 + 0.06], [W / 2 - 0.08, -D / 2 + 0.06], [-W / 2 + 0.08, D / 2 - 0.06], [W / 2 - 0.08, D / 2 - 0.06]]) rod(g, V3(x, 0, z), V3(x, y0, z), 0.012, BRASS(), 0.018);
  // 上の小物
  mk(g, LA(smooth([[0.001, 0], [0.05, 0], [0.09, 0.08], [0.06, 0.2], [0.03, 0.26], [0.035, 0.3]], 20), 28), cm('vaseclay', () => phys({ color: '#b86f4a', roughness: 0.75 })), -0.5, y0 + H, 0);
  bookLow(g, 0.45, y0 + H, 0.0, ['#d9cfbf', '#5c3b2b', '#2f3b36'], -0.2);
  mk(g, LA([[0.001, 0], [0.08, 0], [0.12, 0.05], [0.118, 0.05], [0.078, 0.004], [0.001, 0.004]], 32), BRASS(), 0.0, y0 + H, 0.05);
  return g;
}
// 曲線のブークレソファ
function boucleSofa(s) {
  const g = new THREE.Group();
  const M = boucle(s.fabric || '#ece5d8');
  const W = s.w || 2.1;
  mk(g, B(W - 0.1, 0.12, 0.85, 0.05), paintG('#3a2a1e', 0.6), 0, 0.06, 0);
  mk(g, B(W, 0.3, 0.95, 0.14), M, 0, 0.27, 0);
  // 背もたれ：ゆるくカーブ
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, x = t * (W - 0.25), z = -0.36 + t * t * 0.35;
    mk(g, B((W - 0.2) / n + 0.08, 0.42, 0.26, 0.12), M, x, 0.55, z, 0, -t * 0.7, 0);
  }
  for (const sx of [-1, 1]) mk(g, B(0.26, 0.36, 0.86, 0.13), M, sx * (W / 2 - 0.11), 0.48, 0.02);
  for (let i = 0; i < 2; i++) mk(g, B(W / 2 - 0.25, 0.14, 0.62, 0.07), M, (i - 0.5) * (W / 2 - 0.25), 0.48, 0.1);
  mk(g, B(0.42, 0.4, 0.14, 0.07), velvet('#a6643f'), -W / 2 + 0.5, 0.62, -0.13, -0.25, 0.2, 0);
  mk(g, B(0.4, 0.38, 0.14, 0.07), velvet('#5b6b55'), W / 2 - 0.5, 0.62, -0.13, -0.25, -0.15, 0);
  return g;
}
// ウォールナットの三脚フロアランプ（麻のかさ）
function tripodLamp(s) {
  const g = new THREE.Group();
  const Wd = wood('walnut'), top = V3(0, 1.15, 0);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + PI / 2; rod(g, V3(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), top, 0.016, Wd, 0.011); mk(g, C(0.016, 0.016, 0.02, 12), BRASS(), Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32); }
  mk(g, C(0.025, 0.025, 0.06, 16), BRASS(), 0, 1.16, 0);
  rod(g, V3(0, 1.16, 0), V3(0, 1.32, 0), 0.008, BRASS());
  const sh = cm('linshade', () => std({ color: '#f1ead9', roughness: 0.92, emissive: '#ffdcb0', emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  mk(g, C(0.22, 0.25, 0.32, 48, true), sh, 0, 1.38, 0);
  mk(g, T(0.25, 0.003, 6, 64), BRASS(), 0, 1.22, 0, PI / 2);
  mk(g, T(0.22, 0.003, 6, 64), BRASS(), 0, 1.54, 0, PI / 2);
  bulb(g, 0, 1.36, 0, 0.035);
  setLight(g, 1.36, 1.1, '#ffd9a8');
  return g;
}
// 真ちゅうの丸い鏡（壁）
function roundMirror(s) {
  const g = new THREE.Group();
  const R = s.r || 0.42;
  mk(g, LA([[R - 0.01, 0], [R + 0.02, 0], [R + 0.025, 0.012], [R + 0.02, 0.03], [R - 0.005, 0.034], [R - 0.01, 0.03]], 96), BRASS(), 0, 0, 0, PI / 2);
  mk(g, cg('cir' + r4(R), () => new THREE.CircleGeometry(R, 64)), MIRROR(), 0, 0, 0.022);
  mk(g, cg('cir' + r4(R), () => new THREE.CircleGeometry(R, 64)), paintG('#222', 0.9), 0, 0, 0.004);
  return g;
}
// 抽象画（大きなキャンバス）
function abstractTex(kind) {
  return canvasTex('abs' + kind, 768, 576, (ctx, w, h) => {
    const pal = kind === 1 ? ['#e7ded0', '#2f3d4a', '#8aa0a8', '#c7a46a', '#f4f0e8'] : ['#efe5d3', '#c06a43', '#2d2a26', '#d9b98a', '#7c8a6a'];
    ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, w, h);
    const R = rng(kind * 9 + 3);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.45, h * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = pal[3]; ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.7, w * 0.22, h * 0.14, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = pal[4]; ctx.fillRect(w * 0.15, h * 0.12, w * 0.18, h * 0.4);
    ctx.strokeStyle = pal[2]; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.85); ctx.bezierCurveTo(w * 0.4, h * 0.3, w * 0.6, h * 0.95, w * 0.9, h * 0.2); ctx.stroke();
    ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.78, 18, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 20000; i++) { ctx.fillStyle = `rgba(${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},${R() > 0.5 ? 255 : 0},0.03)`; ctx.fillRect(R() * w, R() * h, 3, 1); }
  });
}
function abstractArt(s) {
  const g = new THREE.Group();
  const k = s.v || 0, W = 1.0, H = 0.75;
  mk(g, B(W, H, 0.035, 0.003), paintG('#f3efe8', 0.9), 0, 0, 0.0255);
  mk(g, cg('absp', () => new THREE.PlaneGeometry(W, H)), cm('absm' + k, () => std({ color: '#ffffff', map: abstractTex(k), roughness: 0.85 })), 0, 0, 0.0435);
  // 浮き枠（オーク）
  frameRect(g, W + 0.02, H + 0.02, 0.012, 0.05, wood('oak', false), 0, 0, 0.025);
  return g;
}
// 陶器の花瓶セットとパンパスグラス
function vaseSet(s) {
  const g = new THREE.Group();
  const cer = c => cm('cer' + c, () => phys({ color: c, roughness: 0.55, clearcoat: 0.2 }));
  mk(g, LA(smooth([[0.001, 0], [0.07, 0], [0.12, 0.12], [0.1, 0.3], [0.045, 0.42], [0.05, 0.46]], 24), 32), cer('#e8e1d4'), 0, 0, 0);
  mk(g, LA(smooth([[0.001, 0], [0.08, 0], [0.11, 0.07], [0.09, 0.15], [0.05, 0.19], [0.055, 0.2]], 18), 28), cer('#a75f3e'), 0.2, 0, 0.08);
  mk(g, LA(smooth([[0.001, 0], [0.05, 0], [0.065, 0.1], [0.04, 0.26], [0.03, 0.3]], 18), 24), cer('#3a3633'), -0.17, 0, 0.06);
  // パンパス
  const plume = cm('pampas', () => phys({ color: '#efe2c8', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#fff8e8'), sheenRoughness: 0.5 }));
  const stem = paintG('#c9b48a', 0.8);
  const R = rng(5);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, lean = 0.15 + R() * 0.25, L = 0.65 + R() * 0.35;
    const tip = V3(Math.cos(a) * lean * L, 0.42 + L, Math.sin(a) * lean * L * 0.6);
    tube(g, [V3(0, 0.35, 0), V3(tip.x * 0.4, 0.42 + L * 0.5, tip.z * 0.4), tip], 0.003, stem, 10, 4);
    const pm = mk(g, S(0.05, 10, 10), plume, tip.x, tip.y + 0.08, tip.z);
    pm.scale.set(0.8, 3.2, 0.8);
    pm.quaternion.setFromUnitVectors(UP, V3(tip.x, 1.6, tip.z).normalize());
  }
  return g;
}
// 真ちゅうとオパールガラスのウォールランプ
function opalSconce(s) {
  const g = new THREE.Group();
  mk(g, C(0.06, 0.06, 0.02, 32), BRASS(), 0, 0, 0.01, PI / 2);
  tube(g, [V3(0, 0, 0.02), V3(0, 0.0, 0.12), V3(0, 0.06, 0.2), V3(0, 0.12, 0.22)], 0.009, BRASS(), 20, 8);
  mk(g, C(0.03, 0.025, 0.04, 20), BRASS(), 0, 0.13, 0.22);
  mk(g, S(0.09, 32, 24), cm('opal', () => std({ color: '#fffaf2', emissive: '#ffe3bf', emissiveIntensity: 1.3, roughness: 0.25 })), 0, 0.23, 0.22).castShadow = false;
  setLight(g, 0.23, 0.8, '#ffdcae');
  return g;
}
// 黒大理石の丸いコーヒーテーブル（たて溝の脚）
function marbleCoffee(s) {
  const g = new THREE.Group();
  const M = marble(s.marble || 'black');
  const bag = new Bag();
  const R0 = 0.24, n = 28;
  for (let i = 0; i < n; i++) { const a = i / n * TAU; bag.add(C(0.028, 0.028, 0.33, 10), Math.cos(a) * R0, 0.165, Math.sin(a) * R0); }
  bag.mesh(g, M);
  mk(g, C(R0, R0, 0.33, 32), M, 0, 0.165, 0);
  mk(g, DISC(0.48, 0.04, 64), M, 0, 0.35, 0);
  bookLow(g, 0.15, 0.37, 0.05, ['#e5ddd0', '#8a5a3c'], 0.5);
  mk(g, LA([[0.001, 0], [0.05, 0], [0.11, 0.06], [0.108, 0.06], [0.048, 0.004], [0.001, 0.004]], 32), BRASS(), -0.18, 0.37, -0.05);
  return g;
}
// ひだのベルベットプフ
function pleatGeo(r, h, pleats = 24) {
  return cg(`gpleat${r4(r)},${r4(h)}`, () => {
    const pts = smooth([[0.001, 0], [r * 0.85, 0.005], [r, h * 0.3], [r * 0.98, h * 0.7], [r * 0.8, h * 0.96], [0.001, h]], 18);
    const g = new THREE.LatheGeometry(pts.map(p => V2(p[0], p[1])), pleats * 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const a = Math.atan2(z, x), rr = Math.hypot(x, z);
      const k = 1 + 0.05 * Math.cos(a * pleats) * Math.sin(PI * y / h) * (rr / r);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}
function pouf(s) {
  const g = new THREE.Group();
  mk(g, pleatGeo(0.27, 0.42), velvet(s.fabric || '#a8782a'), 0, 0, 0);
  mk(g, S(0.025, 12, 8), velvet(s.fabric || '#a8782a'), 0, 0.42, 0).scale.y = 0.5;
  return g;
}
// 真ちゅうとガラスの飾り棚
function etagere(s) {
  const g = new THREE.Group();
  const W = 0.8, D = 0.36, H = 1.7, M = BRASS();
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) rod(g, V3(x, 0, z), V3(x, H, z), 0.01, M);
  const ys = [0.08, 0.5, 0.92, 1.34, 1.7];
  for (const y of ys) {
    mk(g, B(W, 0.01, D, 0.002), glassT('#c9d4cf', 0.3), 0, y, 0);
    tube(g, [V3(-W / 2, y, -D / 2), V3(W / 2, y, -D / 2), V3(W / 2, y, D / 2), V3(-W / 2, y, D / 2)], 0.006, M, 16, 6, true);
  }
  // 飾り
  bookLow(g, -0.2, 0.51, 0, ['#2f3b36', '#d6cbb7', '#7a3b2e'], 0.1);
  mk(g, LA(smooth([[0.001, 0], [0.06, 0], [0.1, 0.1], [0.07, 0.22], [0.04, 0.26]], 18), 24), cm('cerw', () => phys({ color: '#efeae0', roughness: 0.4, clearcoat: 0.4 })), 0.2, 0.51, 0);
  mk(g, LA(smooth([[0.001, 0], [0.04, 0], [0.12, 0.06], [0.14, 0.08]], 12), 28), paintG('#1f1f1f', 0.4), 0.0, 0.93, 0);
  mk(g, S(0.06, 20, 14), GOLD(), 0.0, 0.99, 0);
  bookLow(g, 0.18, 1.35, 0, ['#c7b48c', '#3b4a5c'], -0.2);
  mk(g, LA(smooth([[0.001, 0], [0.04, 0], [0.05, 0.15], [0.02, 0.3]], 14), 20), cm('cerg', () => phys({ color: '#7c8a6a', roughness: 0.5, clearcoat: 0.3 })), -0.2, 1.35, 0.02);
  bottle(g, 0.25, 0.09, 0.0, 'round', '#cfe0dc', null, 'gold');
  mk(g, B(0.3, 0.2, 0.25, 0.01), wood('oak', false), -0.15, 0.19, 0);
  return g;
}
// 緑のガラスのバンカーズランプ
function bankerLamp(s) {
  const g = new THREE.Group();
  mk(g, B(0.2, 0.025, 0.14, 0.01), BRASS(), 0, 0.0125, 0);
  mk(g, LA([[0.04, 0], [0.03, 0.02]], 16), BRASS(), 0, 0.025, 0);
  rod(g, V3(0, 0.03, 0), V3(0, 0.3, 0), 0.008, BRASS());
  rod(g, V3(-0.12, 0.3, 0), V3(0.12, 0.3, 0), 0.006, BRASS());
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.12, 0.3, 0), V3(sx * 0.12, 0.34, 0.02), 0.005, BRASS());
  const sh = cg('banker', () => { const gg = new THREE.CylinderGeometry(0.11, 0.11, 0.3, 32, 1, true, PI / 2 - 1.2, 2.4); gg.rotateZ(PI / 2); return gg; });
  const green = cm('bankg', () => phys({ color: '#0f5a33', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.92, emissive: '#0f5a33', emissiveIntensity: 0.25, side: THREE.FrontSide }));
  mk(g, sh, green, 0, 0.32, 0.02);
  mk(g, sh, cm('bankin', () => std({ color: '#fff8e6', emissive: '#ffe0aa', emissiveIntensity: 0.9, side: THREE.BackSide })), 0, 0.32, 0.02).castShadow = false;
  bulb(g, 0, 0.32, 0.05, 0.025);
  rod(g, V3(0.02, 0.3, 0.02), V3(0.03, 0.18, 0.04), 0.002, GOLD());
  mk(g, S(0.008, 8, 6), GOLD(), 0.03, 0.17, 0.04);
  setLight(g, 0.3, 0.7, '#ffe0a8');
  return g;
}

// =====================================================================
// ★5：シリーズ（並べると部屋全体がそのコンセプトになる）。光る・動く演出つき
// =====================================================================
// 折れ線のチューブ（ネオン管など）
function polyTube(parent, pts, r, mat, closed = false, rs = 6) {
  const path = new THREE.CurvePath();
  const P = pts.map(p => p.isVector3 ? p : V3(p[0], p[1], p[2] || 0));
  for (let i = 0; i < P.length - 1; i++) path.add(new THREE.LineCurve3(P[i], P[i + 1]));
  if (closed) path.add(new THREE.LineCurve3(P[P.length - 1], P[0]));
  return mk(parent, new THREE.TubeGeometry(path, P.length * 10, r, rs, false), mat);
}
// 5つの角の星の形
function starShape(R = 1, r = 0.45) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? r : R; i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return sh;
}
// 球の表面（殻）にちらばる点
function shellPts(n, r0, r1, seed, yMin = -1) {
  const R = rng(seed), out = [];
  while (out.length < n * 3) {
    const v = V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
    v.normalize();
    if (v.y < yMin) continue;
    v.multiplyScalar(r0 + (r1 - r0) * R());
    out.push(v.x, v.y, v.z);
  }
  return out;
}
// 湯気・煙（ふわっと上る点）
const STEAM_VS = `
uniform float uTime, uViewH, uH; attribute float aPhase;
varying float vA;
void main(){
  float t = fract(aPhase + uTime * 0.18);
  vec3 p = position;
  p.y += t * uH;
  p.x += sin(t * 6.0 + aPhase * 20.0) * 0.02 * t;
  p.z += cos(t * 5.0 + aPhase * 13.0) * 0.02 * t;
  vA = sin(t * 3.14159) * (1.0 - t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.03 + t * 0.07) * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;
const STEAM_FS = `
uniform vec3 uColor; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA * 0.35; if (a < 0.005) discard; gl_FragColor = vec4(uColor, a); }`;
function steam(parent, x, y, z, n = 18, h = 0.25, color = '#ffffff') {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = x + (h2(i, 1) - 0.5) * 0.02; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (h2(i, 2) - 0.5) * 0.02; ph[i] = i / n; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.boundingBox = new THREE.Box3();
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uViewH: { value: 800 }, uH: { value: h }, uColor: { value: new THREE.Color(color) } }, vertexShader: STEAM_VS, fragmentShader: STEAM_FS, transparent: true, depthWrite: false });
  const p = noRay(new THREE.Points(geo, mat));
  const vs = new THREE.Vector2();
  p.onBeforeRender = r => { r.getDrawingBufferSize(vs); mat.uniforms.uViewH.value = vs.y; };
  p.frustumCulled = false;
  parent.add(p);
  return p;
}
// 光の輪は、家具の大きさ（バウンディングボックス）に入れない
const HALO_GEO = () => cg('haloPlane', () => { const gg = new THREE.PlaneGeometry(1, 1); gg.boundingBox = new THREE.Box3(); gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.71); return gg; });
const halo = (parent, w, h, mat, x, y, z, rx = 0) => { const m = noRay(new THREE.Mesh(HALO_GEO(), mat)); m.frustumCulled = false; m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.x = rx; parent.add(m); return m; };
// ろうそく（ろうのしずくつき）＋ゆらぐ炎
function candleWax(g, x, y, z, h = 0.14, r = 0.014, phase = 0, color = '#efe6d4') {
  const wax = cm('wax' + color, () => phys({ color, roughness: 0.55, sheen: 0.4, emissive: '#ff9a40', emissiveIntensity: 0.05 }));
  mk(g, C(r, r * 1.02, h, 14), wax, x, y + h / 2, z);
  const bag = new Bag();
  for (let i = 0; i < 3; i++) { const a = phase * 3 + i * 2.1, l = h * (0.25 + h2(i, phase * 10) * 0.4); bag.add(C(r * 0.25, r * 0.3, l, 6), x + Math.cos(a) * r, y + h - l / 2, z + Math.sin(a) * r); bag.add(S(r * 0.32, 6, 4), x + Math.cos(a) * r, y + h - l, z + Math.sin(a) * r); }
  bag.mesh(g, wax);
  rod(g, V3(x, y + h, z), V3(x, y + h + 0.012, z), 0.0015, paintG('#1a1a1a', 0.8));
  return flame(g, x, y + h + 0.004, z, r * 0.85, r * 3.6, phase, 1);
}
// 炎たちを揺らす tick
function flameTick(g, flames, glowMats = []) {
  addTick(g, t => {
    for (const f of flames) f.material.uniforms.uTime.value = t;
    const k = 0.85 + 0.1 * Math.sin(t * 11) * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 23);
    for (const m of glowMats) m.emissiveIntensity = (m.userData.base ?? 1) * k;
  });
}

// ---------------- 星空シリーズ（濃紺・金・星の光） ----------------
const NAVY = '#14204a';
function starOrbTex() {
  return canvasTex('starorb', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffe9c4'; ctx.fillRect(0, 0, w, h);
    const R = rng(3);
    for (let i = 0; i < 260; i++) { const r = R() * 2.5 + 0.6; ctx.fillStyle = `rgba(255,255,255,${0.6 + R() * 0.4})`; ctx.beginPath(); ctx.arc(R() * w, R() * h, r, 0, TAU); ctx.fill(); }
    const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,190,120,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,190,120,0.35)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
}
// 天球儀のペンダントライト（天井）
function starPendant(s) {
  const g = new THREE.Group();
  mk(g, LA([[0.001, 0], [0.09, 0], [0.095, 0.012], [0.07, 0.03], [0.001, 0.035]], 32), GOLD(), 0, -0.035, 0);
  rod(g, V3(0, -0.035, 0), V3(0, -0.55, 0), 0.006, GOLD());
  const y = -0.9;
  const rings = new THREE.Group(); rings.position.y = y; g.add(rings);
  const rs = [];
  [[0.3, 0.008], [0.27, 0.006], [0.24, 0.006]].forEach(([R, t], i) => {
    const pivot = new THREE.Group(); rings.add(pivot);
    const m = mk(pivot, T(R, t, 8, 96), GOLD());
    m.rotation.set(i === 0 ? PI / 2 : 0, i === 1 ? PI / 3 : 0, i === 2 ? PI / 4 : 0);
    rs.push(pivot);
  });
  // 黄道の帯（星座の帯）
  mk(rings, T(0.3, 0.02, 4, 96), cm('zod', () => phys({ color: '#1d2b5c', metalness: 0.4, roughness: 0.3, clearcoat: 1 })), 0, 0, 0, PI / 2 + 0.4, 0, 0).scale.z = 0.3;
  rod(g, V3(0, -0.55, 0), V3(0, y + 0.3, 0), 0.006, GOLD());
  const orbMat = cm('orb', () => std({ color: '#ffffff', emissive: '#ffffff', emissiveMap: starOrbTex(), emissiveIntensity: 1.6, roughness: 0.2 }));
  const orb = mk(g, S(0.11, 40, 28), orbMat, 0, y, 0); orb.castShadow = false;
  const sp = sparkles(g, shellPts(70, 0.14, 0.42, 5).map((v, i) => i % 3 === 1 ? v + y : v), { size: 0.035, colors: ['#ffffff', '#ffe6a8', '#cfe0ff'], speed: 2.2, base: 0.25 });
  addTick(g, (t, dt) => {
    rs[0].rotation.y = t * 0.12; rs[1].rotation.x = t * 0.09; rs[2].rotation.z = -t * 0.07;
    orb.rotation.y = t * 0.05;
    sp.material.uniforms.uTime.value = t;
    sp.rotation.y = t * 0.03;
  });
  setLight(g, y, 1.3, '#ffe2b8');
  return g;
}
// プラネタリウム（星を映す投影機）
function planetarium(s) {
  const g = new THREE.Group();
  const Wd = wood('walnut');
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + PI / 2; rod(g, V3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), V3(0, 0.7, 0), 0.016, Wd, 0.012); mk(g, S(0.02, 10, 8), GOLD(), Math.cos(a) * 0.3, 0.015, Math.sin(a) * 0.3); }
  mk(g, T(0.13, 0.008, 6, 40), GOLD(), 0, 0.38, 0, PI / 2);
  mk(g, LA([[0.06, 0], [0.08, 0.03], [0.05, 0.08], [0.03, 0.1]], 24), GOLD(), 0, 0.68, 0);
  const pm = cm('projector', () => phys({ color: '#1b1c2a', metalness: 0.8, roughness: 0.3, clearcoat: 1, emissive: '#ffffff', emissiveMap: canvasTex('projdots', 256, 128, (ctx, w, h) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); const R = rng(9); for (let i = 0; i < 180; i++) { ctx.fillStyle = `rgba(200,220,255,${0.5 + R() * 0.5})`; ctx.beginPath(); ctx.arc(R() * w, R() * h, R() * 1.4 + 0.5, 0, TAU); ctx.fill(); } }), emissiveIntensity: 2.2 }));
  const head = mk(g, S(0.14, 40, 28), pm, 0, 0.86, 0);
  mk(g, T(0.142, 0.01, 8, 64), GOLD(), 0, 0.86, 0, PI / 2);
  // 惑星の軌道
  const orbit = new THREE.Group(); orbit.position.y = 0.86; g.add(orbit);
  mk(orbit, T(0.28, 0.002, 4, 96), GOLD(), 0, 0, 0, PI / 2);
  mk(orbit, T(0.38, 0.002, 4, 96), GOLD(), 0, 0, 0, PI / 2 + 0.08);
  const p1 = new THREE.Group(); orbit.add(p1);
  mk(p1, S(0.035, 20, 14), cm('pl1', () => phys({ color: '#d98b4a', roughness: 0.5, emissive: '#5a2a10', emissiveIntensity: 0.3 })), 0.28, 0, 0);
  const p2 = new THREE.Group(); p2.rotation.x = 0.08; orbit.add(p2);
  mk(p2, S(0.03, 20, 14), cm('pl2', () => phys({ color: '#e8d2a0', roughness: 0.5 })), 0.38, 0, 0);
  mk(p2, T(0.05, 0.006, 4, 32), cm('pl2r', () => phys({ color: '#cbb48a', roughness: 0.4, metalness: 0.3 })), 0.38, 0, 0, PI / 2 + 0.3).scale.z = 0.2;
  // 星のドーム
  const stars = sparkles(g, shellPts(320, 0.5, 0.62, 8, -0.1).map((v, i) => i % 3 === 1 ? v + 0.86 : v), { size: 0.03, colors: ['#ffffff', '#cfe0ff', '#ffe6b0', '#b9c8ff'], speed: 1.8, base: 0.3, seed: 4 });
  const neb = halo(g, 1.3, 1.3, haloMat('#5f6fd8', 7, 0.35), 0, 0.86, -0.25);
  addTick(g, t => {
    stars.material.uniforms.uTime.value = t; stars.rotation.y = t * 0.04;
    head.rotation.y = t * 0.2; p1.rotation.y = t * 0.5; p2.rotation.y = -t * 0.3;
    neb.material.uniforms.uTime.value = t;
  });
  setLight(g, 0.86, 0.8, '#aebcff');
  return g;
}
// 三日月のソファ
function crescentPts(cx, cy, R, maxT, a0, a1, n = 40) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, th = maxT * Math.pow(Math.sin(PI * t), 0.8);
    outer.push(V2(cx + Math.cos(a) * R, cy + Math.sin(a) * R));
    inner.push(V2(cx + Math.cos(a) * (R - th), cy + Math.sin(a) * (R - th)));
  }
  return { outer, inner, all: outer.concat(inner.reverse()) };
}
function moonSofa(s) {
  const g = new THREE.Group();
  const V = velvet(s.fabric || '#1a2860');
  const cr = crescentPts(0, 1.22, 1.15, 0.5, PI * 1.08, PI * 1.92, 48);
  const sh = new THREE.Shape(cr.all);
  const geo = cg('crescentBack', () => { const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8 }); gg.translate(0, 0, -0.13); return worldUV(gg); });
  mk(g, geo, V, 0, 0, -0.32);
  // 金のふち
  const edge = cr.all.map(p => V3(p.x, p.y, -0.32 + 0.19));
  tube(g, edge.concat([edge[0]]), 0.012, GOLD(), 200, 6);
  // 座面と台
  mk(g, B(1.7, 0.16, 0.66, 0.05), paintG('#0c1230', 0.5), 0, 0.12, 0.05);
  mk(g, B(1.8, 0.2, 0.74, 0.09), V, 0, 0.3, 0.07);
  mk(g, B(1.66, 0.12, 0.64, 0.06), V, 0, 0.45, 0.1);
  for (const sx of [-1, 1]) mk(g, C(0.04, 0.03, 0.08, 16), GOLD(), sx * 0.75, 0.02, 0.05), mk(g, C(0.04, 0.03, 0.08, 16), GOLD(), sx * 0.75, 0.02, -0.35);
  // 星のクッション
  const st = cg('starCush', () => { const gg = new THREE.ExtrudeGeometry(starShape(0.2, 0.09), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 }); gg.translate(0, 0, -0.03); return worldUV(gg); });
  mk(g, st, velvet('#d8b25a'), -0.5, 0.68, -0.08, -0.25, 0.15, 0.2);
  mk(g, st, velvet('#e9dcc0'), 0.52, 0.66, -0.08, -0.25, -0.2, -0.3);
  mk(g, B(0.4, 0.36, 0.13, 0.06), velvet('#2f3f86'), 0.05, 0.65, -0.14, -0.25, 0, 0);
  // 背もたれの刺しゅうの星（またたく）
  const pts = [];
  const R = rng(12);
  while (pts.length < 45 * 3) {
    const x = (R() * 2 - 1) * 1.1, y = 0.2 + R() * 1.0;
    const d = Math.hypot(x, y - 1.22);
    if (d < 1.12 && d > 0.75 && y > 0.55) pts.push(x, y, -0.32 + 0.2);
  }
  const sp = sparkles(g, pts, { size: 0.04, colors: ['#ffffff', '#ffe6a8'], speed: 1.6, base: 0.2, seed: 3 });
  const bag = new Bag();
  for (let i = 0; i < pts.length; i += 3) bag.add(cg('stud', () => new THREE.OctahedronGeometry(0.008)), pts[i], pts[i + 1], pts[i + 2] - 0.005);
  bag.mesh(g, GOLD());
  addTick(g, t => { sp.material.uniforms.uTime.value = t; });
  return g;
}
// 星座の壁かざり
const CONST = [
  [[0.0, 0.32], [0.12, 0.25], [0.2, 0.28], [0.3, 0.2], [0.3, 0.08], [0.18, 0.06], [0.2, 0.18]], // 北斗七星
  [[-0.35, 0.05], [-0.28, -0.06], [-0.2, 0.02], [-0.12, -0.08], [-0.04, 0.0]], // カシオペヤ
  [[-0.05, -0.2], [0.05, -0.3], [0.15, -0.22], [0.1, -0.12], [-0.05, -0.2]],
];
function constellation(s) {
  const g = new THREE.Group();
  const R = 0.5;
  mk(g, C(R, R, 0.03, 96), lacquer(NAVY, 0.25), 0, 0, 0.015, PI / 2);
  mk(g, T(R, 0.012, 8, 128), GOLD(), 0, 0, 0.03);
  mk(g, T(R - 0.03, 0.004, 6, 128), GOLD(), 0, 0, 0.032);
  // 金の三日月
  const cr = crescentPts(0, 0, 0.1, 0.05, -PI * 0.35, PI * 0.55, 24);
  mk(g, cg('moonRelief', () => { const gg = new THREE.ExtrudeGeometry(new THREE.Shape(cr.all), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 }); return gg; }), GOLD(), 0.28, -0.22, 0.03);
  const pts = [];
  const bag = new Bag(), lines = new Bag();
  for (const c of CONST) {
    c.forEach(([x, y], i) => {
      pts.push(x, y, 0.045);
      bag.add(cg('stud2', () => new THREE.OctahedronGeometry(0.012)), x, y, 0.035);
      if (i) { const [px, py] = c[i - 1]; lines.rod(V3(px, py, 0.033), V3(x, y, 0.033), 0.0018, 4); }
    });
  }
  bag.mesh(g, GOLD()); lines.mesh(g, GOLD());
  // 小さな星くず
  const RR = rng(21);
  for (let i = 0; i < 70; i++) { const a = RR() * TAU, r = Math.sqrt(RR()) * (R - 0.05); pts.push(Math.cos(a) * r, Math.sin(a) * r, 0.034); }
  const sp = sparkles(g, pts, { size: 0.03, colors: ['#ffffff', '#ffe6a8', '#cfe0ff'], speed: 1.7, base: 0.25, seed: 6 });
  const hl = halo(g, 1.6, 1.6, haloMat('#4b63d8', 9, 0.4), 0, 0, 0.002);
  addTick(g, t => { sp.material.uniforms.uTime.value = t; hl.material.uniforms.uTime.value = t; });
  return g;
}
// 月のランプテーブル
function moonTex() {
  return canvasTex('moon', 512, 256, (ctx, w, h) => {
    const A = hexRGB('#f2ead8'), D = hexRGB('#a59c8a');
    const R = rng(2), cr = []; for (let i = 0; i < 60; i++) cr.push([R(), R(), 0.01 + R() * R() * 0.08]);
    pixels(ctx, w, h, (u, v, o) => {
      let f = fbm(u * 6, v * 3, 6, 3, 5, 31);
      let c = mixRGB(A, D, clamp((f - 0.45) * 2.2, 0, 1));
      for (const [x, y, r] of cr) { let dx = Math.abs(u - x); dx = Math.min(dx, 1 - dx); const d = Math.hypot(dx, (v - y) * 0.5) / r; if (d < 1) c = mixRGB(c, d > 0.8 ? A : D, d > 0.8 ? 0.4 : 0.35 * (1 - d)); }
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  });
}
function moonTable(s) {
  const g = new THREE.Group();
  mk(g, DISC(0.24, 0.03), marble('black'), 0, 0.015, 0);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; tube(g, [V3(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2), V3(Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12), V3(Math.cos(a) * 0.17, 0.52, Math.sin(a) * 0.17)], 0.008, GOLD(), 24, 6); }
  mk(g, T(0.17, 0.008, 6, 48), GOLD(), 0, 0.52, 0, PI / 2);
  mk(g, DISC(0.2, 0.012), glassT('#c9d2ff', 0.25), 0, 0.53, 0);
  const mm = new THREE.MeshStandardMaterial({ color: '#ffffff', map: moonTex(), emissive: '#ffe8c0', emissiveMap: moonTex(), emissiveIntensity: 0.9, roughness: 0.9 });
  const moon = mk(g, S(0.14, 48, 32), mm, 0, 0.68, 0); moon.castShadow = false;
  const sp = sparkles(g, shellPts(30, 0.18, 0.3, 14, -0.2).map((v, i) => i % 3 === 1 ? v + 0.68 : v), { size: 0.025, colors: ['#ffffff', '#ffe6a8'], speed: 2, base: 0.2 });
  addTick(g, t => { moon.rotation.y = t * 0.15; mm.emissiveIntensity = 0.85 + 0.15 * Math.sin(t * 0.8); sp.material.uniforms.uTime.value = t; });
  setLight(g, 0.68, 0.9, '#ffe6c0');
  return g;
}

// ---------------- バンドシリーズ（もとロックシリーズ。黒・クローム・ネオン） ----------------
const neonMat = (c, i = 3) => new THREE.MeshStandardMaterial({ color: '#000000', emissive: c, emissiveIntensity: i, roughness: 0.4 });
const LETTERS = {
  R: [[[0, 0], [0, 1], [0.5, 1], [0.72, 0.88], [0.72, 0.62], [0.5, 0.5], [0, 0.5]], [[0.32, 0.5], [0.75, 0]]],
  O: [Array.from({ length: 25 }, (_, i) => [0.4 + Math.cos(i / 24 * TAU) * 0.4, 0.5 + Math.sin(i / 24 * TAU) * 0.5])],
  C: [Array.from({ length: 19 }, (_, i) => { const a = PI * 0.28 + i / 18 * PI * 1.44; return [0.42 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.5]; })],
  K: [[[0, 0], [0, 1]], [[0.72, 1], [0.05, 0.42]], [[0.24, 0.6], [0.75, 0]]],
};
function neonRock(s) {
  const g = new THREE.Group();
  mk(g, B(1.2, 0.56, 0.012, 0.004), cm('acryl', () => phys({ color: '#0b0b0e', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 })), 0, 0, 0.03);
  for (const [x, y] of [[-0.56, 0.24], [0.56, 0.24], [-0.56, -0.24], [0.56, -0.24]]) rod(g, V3(x, y, 0), V3(x, y, 0.04), 0.008, CHROME());
  const pink = neonMat('#ff2e88', 3.2), cyan = neonMat('#2ee8ff', 3.2);
  const letterMats = [];
  'ROCK'.split('').forEach((ch, i) => {
    const m = i === 3 ? neonMat('#ff2e88', 3.2) : pink;
    if (i === 3) letterMats.push(m);
    for (const st of LETTERS[ch]) polyTube(g, st.map(([x, y]) => V3(-0.42 + i * 0.2 + x * 0.15, -0.14 + y * 0.28, 0.05)), 0.007, m);
  });
  letterMats.push(cyan);
  polyTube(g, [[0.38, 0.22], [0.31, 0.02], [0.37, 0.02], [0.32, -0.2], [0.47, 0.06], [0.4, 0.06], [0.46, 0.22]].map(([x, y]) => V3(x, y, 0.05)), 0.007, cyan, true);
  const h1 = halo(g, 1.5, 0.9, haloMat('#ff2e88', 4, 0.55), -0.1, 0, 0.004);
  const h2m = halo(g, 0.6, 0.7, haloMat('#2ee8ff', 4, 0.5), 0.4, 0, 0.005);
  addTick(g, t => {
    // ときどき「K」がチカチカ
    const fl = Math.sin(t * 0.7) > 0.93 ? (Math.sin(t * 60) > 0 ? 0.3 : 3.2) : 3.2;
    letterMats[0].emissiveIntensity = fl;
    cyan.emissiveIntensity = 2.8 + 0.5 * Math.sin(t * 2.2);
    h1.material.uniforms.uTime.value = t; h2m.material.uniforms.uTime.value = t;
  });
  setLight(g, 0, 0.9, '#ff5aa8');
  return g;
}
// アンプのスタック（真空管が光る）
function grillTex() {
  return canvasTex('grill', 256, 256, (ctx, w, h) => {
    pixels(ctx, w, h, (u, v, o) => {
      const a = Math.abs(Math.sin(u * 64 * PI)), b = Math.abs(Math.sin(v * 64 * PI));
      const k = ((Math.floor(u * 32) + Math.floor(v * 32)) % 2 ? a : b);
      const c = mixRGB([40, 34, 28], [150, 128, 96], k * 0.8 + h2(u * 999, v * 999) * 0.1);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 2 });
}
function ampStack(s) {
  const g = new THREE.Group();
  const tol = cm('tolex', () => phys({ color: '#141414', roughness: 0.75, sheen: 0.3 }));
  const grill = cm('grillm', () => std({ color: '#ffffff', map: grillTex(), roughness: 0.9 }));
  const piping = GOLD();
  for (let k = 0; k < 2; k++) {
    const y = 0.06 + k * 0.76;
    mk(g, B(0.78, 0.74, 0.36, 0.03), tol, 0, y + 0.37, 0);
    mk(g, B(0.68, 0.64, 0.01, 0.002), grill, 0, y + 0.37, 0.181);
    tube(g, [V3(-0.34, y + 0.05, 0.185), V3(0.34, y + 0.05, 0.185), V3(0.34, y + 0.69, 0.185), V3(-0.34, y + 0.69, 0.185)], 0.004, piping, 32, 6, true);
    mk(g, B(0.12, 0.035, 0.005, 0.002), paintG('#efe8da', 0.5), 0.22, y + 0.62, 0.188);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) mk(g, S(0.022, 10, 8), CHROME(), sx * 0.37, y + 0.02 + sy * 0.7, 0.17);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.025, 0.025, 0.06, 12), paintG('#111', 0.6), sx * 0.33, 0.03, sz * 0.13);
  // ヘッド
  const hy = 1.6;
  mk(g, B(0.8, 0.26, 0.3, 0.02), tol, 0, hy + 0.13, -0.02);
  mk(g, B(0.72, 0.08, 0.01, 0.002), GOLD(), 0, hy + 0.08, 0.131);
  const bag = new Bag();
  for (let i = 0; i < 10; i++) { bag.add(C(0.012, 0.014, 0.022, 14), -0.3 + i * 0.055, hy + 0.08, 0.142, PI / 2); }
  bag.mesh(g, paintG('#0d0d0d', 0.3));
  // 真空管の窓
  mk(g, B(0.3, 0.1, 0.008, 0.002), glassT('#2a1608', 0.4), -0.18, hy + 0.19, 0.132);
  const tubeMat = new THREE.MeshStandardMaterial({ color: '#2a1505', emissive: '#ff7a1a', emissiveIntensity: 2.2, roughness: 0.2 });
  for (let i = 0; i < 4; i++) mk(g, C(0.016, 0.016, 0.07, 12), tubeMat, -0.28 + i * 0.065, hy + 0.19, 0.105).castShadow = false;
  // VU メーター（針が揺れる）
  const vu = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb84a', emissiveIntensity: 1.3, roughness: 0.5 });
  mk(g, B(0.16, 0.09, 0.006, 0.002), vu, 0.2, hy + 0.19, 0.132);
  const needle = new THREE.Group(); needle.position.set(0.2, hy + 0.15, 0.137); g.add(needle);
  mk(needle, B(0.003, 0.07, 0.002, 0), paintG('#1a1a1a', 0.5), 0, 0.035, 0);
  const lamp = new THREE.MeshStandardMaterial({ color: '#300000', emissive: '#ff1a1a', emissiveIntensity: 3, roughness: 0.2 });
  mk(g, S(0.012, 12, 8), lamp, 0.36, hy + 0.08, 0.14);
  mk(g, B(0.7, 0.006, 0.006, 0), CHROME(), 0, hy + 0.27, 0.13);
  addTick(g, t => {
    const beat = Math.pow(Math.abs(Math.sin(t * 3.1)), 4) * 0.7 + 0.3 * Math.abs(Math.sin(t * 7.7 + 1));
    needle.rotation.z = 0.7 - beat * 1.3;
    tubeMat.emissiveIntensity = 1.8 + 0.6 * Math.sin(t * 1.3) + 0.3 * beat;
    vu.emissiveIntensity = 1.2 + 0.2 * beat;
  });
  setLight(g, hy + 0.2, 0.6, '#ff9a4a');
  return g;
}
// ギターとネオンの台
function guitarStand(s) {
  const g = new THREE.Group();
  mk(g, C(0.3, 0.32, 0.04, 48), lacquer('#0a0a0c', 0.15), 0, 0.02, 0);
  const ring = new THREE.MeshStandardMaterial({ color: '#000', emissive: s.neon || '#ff2e88', emissiveIntensity: 3, roughness: 0.4 });
  mk(g, T(0.31, 0.008, 8, 96), ring, 0, 0.03, 0, PI / 2).castShadow = false;
  const hl = halo(g, 1.2, 1.2, haloMat(s.neon || '#ff2e88', 6, 0.5), 0, 0.045, 0, -PI / 2);
  // A 字のスタンド
  for (const sx of [-1, 1]) { rod(g, V3(sx * 0.12, 0.04, 0.12), V3(0, 0.62, -0.06), 0.008, CHROME()); rod(g, V3(sx * 0.12, 0.04, -0.12), V3(0, 0.62, -0.06), 0.008, CHROME()); }
  tube(g, [V3(-0.14, 0.32, 0.1), V3(0, 0.26, 0.14), V3(0.14, 0.32, 0.1)], 0.01, paintG('#1a1a1a', 0.7), 16, 6);
  rod(g, V3(0, 0.62, -0.06), V3(0, 1.0, -0.12), 0.007, CHROME());
  {
    const gt = guitarModel('single');
    const bb = new THREE.Box3().setFromObject(gt), sz = bb.getSize(V3());
    gt.position.set(-(bb.min.x + bb.max.x) / 2, 0.24 - bb.min.y, -(bb.min.z + bb.max.z) / 2 + 0.06);
    const pivot = new THREE.Group(); pivot.rotation.x = -0.14; pivot.add(gt); g.add(pivot);
  }
  const sp = sparkles(g, shellPts(20, 0.2, 0.4, 3, 0.3).map((v, i) => i % 3 === 1 ? v * 2 + 0.2 : v), { size: 0.03, color: s.neon || '#ff6ab0', speed: 2, base: 0.1 });
  addTick(g, t => { ring.emissiveIntensity = 2.4 + 1.2 * Math.pow(Math.abs(Math.sin(t * 2.4)), 3); hl.material.uniforms.uTime.value = t; sp.material.uniforms.uTime.value = t; });
  setLight(g, 0.3, 0.8, s.neon || '#ff2e88');
  return g;
}
// 黒革の鋲打ちソファ（下が光る）
function studSofa(s) {
  const g = new THREE.Group();
  const L = leather('#121212'), W = 2.0, D = 0.9, H = 0.78;
  mk(g, B(W, 0.3, D, 0.04), L, 0, 0.25, 0);
  mk(g, B(W, H - 0.3, 0.2, 0.04), L, 0, 0.4 + (H - 0.4) / 2, -D / 2 + 0.1);
  tufted(g, W - 0.34, H - 0.45, 8, 3, L, 0, 0.45 + (H - 0.45) / 2 - 0.02, -D / 2 + 0.2);
  mk(g, C(0.08, 0.08, W, 24), L, 0, H, -D / 2 + 0.11, 0, 0, PI / 2);
  const studs = new Bag();
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.08);
    mk(g, B(0.16, H - 0.38, D - 0.02, 0.04), L, x, 0.38 + (H - 0.38) / 2 - 0.02, 0.01);
    mk(g, C(0.09, 0.09, D - 0.04, 24), L, x + sx * 0.015, H - 0.02, 0.01, PI / 2);
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; studs.add(S(0.007, 6, 4), x + sx * 0.015 + Math.cos(a) * 0.075, H - 0.02 + Math.sin(a) * 0.075, D / 2 - 0.005); }
    for (let i = 0; i < 7; i++) studs.add(S(0.007, 6, 4), x, 0.38 + i * 0.045, D / 2 + 0.005);
  }
  for (let i = 0; i < 40; i++) studs.add(S(0.007, 6, 4), -W / 2 + 0.05 + i * (W - 0.1) / 39, 0.13, D / 2 + 0.002);
  studs.mesh(g, CHROME());
  for (let i = 0; i < 2; i++) mk(g, B((W - 0.34) / 2, 0.15, D - 0.24, 0.06), L, (i - 0.5) * (W - 0.34) / 2, 0.47, 0.08);
  mk(g, B(0.42, 0.38, 0.12, 0.06), velvet('#7a0f1a'), -0.55, 0.66, -0.15, -0.25, 0.15, 0);
  for (const [x, z] of [[-W / 2 + 0.1, -D / 2 + 0.1], [W / 2 - 0.1, -D / 2 + 0.1], [-W / 2 + 0.1, D / 2 - 0.1], [W / 2 - 0.1, D / 2 - 0.1]]) rod(g, V3(x, 0, z), V3(x, 0.1, z), 0.018, CHROME(), 0.013);
  // 下の LED
  const led = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#2ee8ff', emissiveIntensity: 3, roughness: 0.4 });
  mk(g, B(W - 0.1, 0.01, 0.01, 0), led, 0, 0.09, D / 2 - 0.03).castShadow = false;
  const hl = halo(g, W + 0.6, 1.3, haloMat('#2ee8ff', 3, 0.5), 0, 0.005, 0.25, -PI / 2);
  const ca = new THREE.Color('#2ee8ff'), cb = new THREE.Color('#ff2e88');
  addTick(g, t => { const k = 0.5 + 0.5 * Math.sin(t * 0.6); led.emissive.copy(ca).lerp(cb, k); hl.material.uniforms.uColor.value.copy(led.emissive); hl.material.uniforms.uTime.value = t; });
  return g;
}
// ---------------- バンドシリーズの新しい家具（黒・クローム・スパークルレッド・ステージの光） ----------------
// 消灯中（部屋が emissiveIntensity を 0 にした材質）は、動きで光を戻さない
const setE = (m, v) => { if (m.userData.baseEmissive !== undefined && m.emissiveIntensity === 0) return; m.emissiveIntensity = Math.max(0.02, v); };
const VCOL = () => cm('vcol', () => std({ color: '#ffffff', vertexColors: true, roughness: 0.55 }));
const MATTE_BLACK = () => paintG('#141414', 0.55, 0.2);
const TOLEX = () => cm('tolex', () => phys({ color: '#141414', roughness: 0.75, sheen: 0.3 }));
const CIRC = (r, seg = 40) => cg('circ' + r4(r) + ',' + seg, () => new THREE.CircleGeometry(r, seg));
// ラメ入りの塗装（ドラムの胴）
function sparkleTex(base) {
  return canvasTex('spk' + base, 256, 256, (ctx, w, h) => {
    const B0 = hexRGB(base);
    pixels(ctx, w, h, (u, v, o) => {
      const n = h2(Math.floor(u * w), Math.floor(v * h), 9);
      const f = n > 0.9 ? 1.6 + (n - 0.9) * 14 : 0.72 + 0.35 * vn(u * 24, v * 24, 24, 24, 4);
      o[0] = clamp(B0[0] * f, 0, 255); o[1] = clamp(B0[1] * f + (n > 0.97 ? 60 : 0), 0, 255); o[2] = clamp(B0[2] * f + (n > 0.97 ? 50 : 0), 0, 255);
    });
  }, { rep: 3 });
}
const sparkle = c => cm('spl' + c, () => phys({ color: '#ffffff', map: sparkleTex(c), metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03 }));
// 文字や絵をキャンバスに描いた板（ポスター・ロゴ）
function drawTex(key, w, h, draw) { return canvasTex(key, w, h, (ctx) => draw(ctx, w, h)); }
const texMat = (key, w, h, draw, o = {}) => cm('tm' + key, () => std({ color: '#ffffff', map: drawTex(key, w, h, draw), roughness: 0.75, ...o }));
const FONT = (px, w = 900) => `${w} ${px}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
// シンバルの細い溝
function cymbalTex() {
  return canvasTex('cymt', 8, 512, (ctx, w, h) => pixels(ctx, w, h, (u, v, o) => {
    const f = 0.62 + 0.2 * Math.sin(v * TAU * 70) + 0.1 * vn(0, v * 220, 1e6, 1e6, 5) + (v > 0.86 ? 0.18 : 0);
    const c = mixRGB([105, 70, 22], [255, 214, 130], clamp(f, 0, 1));
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  }));
}
const CYM = () => cm('cym', () => phys({ color: '#ffffff', map: cymbalTex(), metalness: 1, roughness: 0.26, side: THREE.DoubleSide }));
const HEAD = () => cm('drumhead', () => std({ color: '#efebe2', roughness: 0.75 }));
// ドラムの胴（軸は y。上下に皮・クロームのフープ・ラグ）。rot は 'YXZ'（ry で向き、rx で傾き）
function drumShell(parent, r, h, shellM, x, y, z, rx = 0, ry = 0, o = {}) {
  const d = new THREE.Group(); d.position.set(x, y, z); d.rotation.set(rx, ry, 0, 'YXZ'); parent.add(d);
  mk(d, C(r, r, h, 40, true), shellM);
  mk(d, C(r - 0.004, r - 0.004, h - 0.004, 32, true), cm('drumin', () => std({ color: '#2a1a14', roughness: 0.8, side: THREE.BackSide })));
  mk(d, CIRC(r), o.top || HEAD(), 0, h / 2 + 0.003, 0, -PI / 2).castShadow = false;
  mk(d, CIRC(r), o.bottom || HEAD(), 0, -h / 2 - 0.003, 0, PI / 2).castShadow = false;
  const hoop = o.hoop || CHROME();
  for (const sy of [-1, 1]) mk(d, T(r + 0.004, o.hoopR || 0.007, 6, 48), hoop, 0, sy * (h / 2 + 0.002), 0, PI / 2);
  const nl = Math.max(5, Math.round(r * 34)), lb = new Bag();
  for (let i = 0; i < nl; i++) {
    const a = (i + 0.5) / nl * TAU, cx = Math.cos(a) * (r + 0.008), cz = Math.sin(a) * (r + 0.008);
    for (const sy of h > 0.3 ? [-1, 1] : [0]) lb.add(B(0.014, 0.05, 0.018, 0.005), cx, sy * h * 0.27, cz, 0, -a);
    lb.add(C(0.0025, 0.0025, h + 0.02, 5), Math.cos(a) * (r + 0.01), 0, Math.sin(a) * (r + 0.01));
  }
  lb.mesh(d, CHROME());
  return d;
}
// クロームのスタンド（三脚＋柱）
function tripodStand(g, x, z, h, legR = 0.2, mat = CHROME()) {
  const ty = Math.min(0.32, h * 0.45);
  rod(g, V3(x, 0.03, z), V3(x, h, z), 0.009, mat);
  const bag = new Bag();
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + 0.5, fx = x + Math.cos(a) * legR, fz = z + Math.sin(a) * legR;
    bag.rod(V3(fx, 0.012, fz), V3(x, ty, z), 0.007, 6);
    bag.rod(V3(x + Math.cos(a) * legR * 0.5, 0.006 + ty * 0.5, z + Math.sin(a) * legR * 0.5), V3(x, ty * 0.35, z), 0.005, 6);
    bag.add(S(0.012, 8, 6), fx, 0.012, fz, 0, 0, 0, 1, 0.6, 1);
  }
  bag.mesh(g, mat);
  mk(g, C(0.016, 0.016, 0.05, 12), MATTE_BLACK(), x, ty, z);
}
// シンバル（中心が y、傾きは tx / tz）
function cymbal(g, r, x, y, z, tx = 0, tz = 0) {
  const pts = [[0.002, 0.03], [0.022, 0.03], [0.034, 0.024], [0.045, 0.016], [r * 0.4, 0.01], [r * 0.8, 0.004], [r, 0]];
  const c = mk(g, LA(smooth(pts, 18), 48), CYM(), x, y, z, tx, 0, tz);
  mk(g, C(0.012, 0.012, 0.02, 10), paintG('#7a1220', 0.9), x, y + 0.035, z, tx, 0, tz).castShadow = false;
  return c;
}
// バスドラの前の皮（文字なし。赤と金の輪と穴）
function kickLogo() {
  return texMat('kicklogo', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0d0c0d'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4202c'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.42, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#d4a94a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.375, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(w * 0.66, h * 0.73, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 4; ctx.stroke();
  }, { roughness: 0.6 });
}

// スパークルレッドのドラムセット（叩く人は -Z 側に座り、+Z を向く）
function drumKit(s) {
  const g = new THREE.Group();
  const shellM = sparkle(s.color || '#8e0c18');
  const ch = CHROME();
  // バスドラム（前の皮にロゴ）
  const kr = 0.28, kd = 0.42, ky = kr + 0.025, kz = 0.12;
  drumShell(g, kr, kd, shellM, 0, ky, kz, PI / 2, 0, { top: kickLogo(), hoop: shellM, hoopR: 0.016 });
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.2, 0.2, kz + 0.12), V3(sx * 0.36, 0.005, kz + 0.3), 0.007, ch);
  // ペダル
  mk(g, B(0.09, 0.012, 0.26, 0.004), ch, 0, 0.04, kz - kd / 2 - 0.16, -0.22);
  mk(g, B(0.16, 0.02, 0.05, 0.005), MATTE_BLACK(), 0, 0.015, kz - kd / 2 - 0.04);
  rod(g, V3(0, 0.12, kz - kd / 2 - 0.05), V3(0, 0.3, kz - kd / 2 - 0.03), 0.004, ch);
  mk(g, S(0.022, 12, 8), paintG('#e8e2d6', 0.6), 0, 0.3, kz - kd / 2 - 0.025);
  // タム（バスドラの上に2つ）
  const ty = ky + kr + 0.17;
  rod(g, V3(0, ky + kr - 0.02, kz - 0.02), V3(0, ty - 0.05, kz - 0.06), 0.012, ch);
  for (const sx of [-1, 1]) {
    const r = sx > 0 ? 0.125 : 0.15, h = sx > 0 ? 0.2 : 0.23;
    rod(g, V3(0, ty - 0.05, kz - 0.06), V3(sx * 0.16, ty - 0.04, kz - 0.06), 0.009, ch);
    drumShell(g, r, h, shellM, sx * (0.13 + r), ty + 0.02, kz - 0.06, -0.42, sx * 0.4);
  }
  // スネア（左ひざの前・クロームの胴）とスタンド
  const snx = 0.36, snz = -0.3, sny = 0.62;
  drumShell(g, 0.178, 0.13, cm('snare', () => phys({ color: '#e8eaec', metalness: 1, roughness: 0.12 })), snx, sny, snz, -0.12, 0.6);
  tripodStand(g, snx, snz, sny - 0.07, 0.2);
  // フロアタム（右）
  const ftx = -0.5, ftz = -0.25, ftr = 0.2, fth = 0.38, fty = 0.46;
  drumShell(g, ftr, fth, shellM, ftx, fty, ftz);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.9; rod(g, V3(ftx + Math.cos(a) * (ftr + 0.03), 0.01, ftz + Math.sin(a) * (ftr + 0.03)), V3(ftx + Math.cos(a) * (ftr + 0.025), fty + 0.05, ftz + Math.sin(a) * (ftr + 0.025)), 0.006, ch); }
  // ハイハット（左）
  const hhx = 0.68, hhz = -0.26;
  tripodStand(g, hhx, hhz, 1.0, 0.2);
  cymbal(g, 0.18, hhx, 0.93, hhz); const top = cymbal(g, 0.18, hhx, 0.945, hhz); top.rotation.x = PI; top.position.y = 0.975;
  mk(g, B(0.08, 0.012, 0.24, 0.004), ch, hhx, 0.04, hhz - 0.2, -0.18);
  // クラッシュ（左上）とライド（右）：ブームのスタンド
  const boom = (x, z, h, cx, cy, cz, r, tx, tz) => {
    tripodStand(g, x, z, h, 0.24);
    rod(g, V3(x, h, z), V3(cx, cy - 0.04, cz), 0.007, ch);
    cymbal(g, r, cx, cy, cz, tx, tz);
  };
  boom(0.6, 0.18, 1.0, 0.42, 1.3, 0.05, 0.23, -0.3, 0.2);
  boom(-0.8, 0.25, 0.95, -0.55, 1.12, 0.02, 0.27, -0.25, -0.18);
  // いす（スローン）
  const thz = -0.78;
  tripodStand(g, 0, thz, 0.46, 0.22, MATTE_BLACK());
  mk(g, LA(smooth([[0.001, 0], [0.17, 0], [0.185, 0.03], [0.175, 0.075], [0.12, 0.095], [0.001, 0.1]], 14), 36), leather('#121212'), 0, 0.46, thz);
  mk(g, T(0.183, 0.006, 6, 48), paintG('#b0101c', 0.5), 0, 0.49, thz, PI / 2);
  // スティック（スネアの上で交差）
  const stick = cm('stick', () => phys({ color: '#e0c08a', roughness: 0.45, clearcoat: 0.6 }));
  rod(g, V3(snx - 0.17, sny + 0.09, snz - 0.07), V3(snx + 0.2, sny + 0.075, snz + 0.08), 0.0065, stick, 0.004);
  rod(g, V3(snx - 0.1, sny + 0.085, snz + 0.12), V3(snx + 0.17, sny + 0.09, snz - 0.15), 0.0065, stick, 0.004);
  return g;
}

// ---------------- エレキギター・ベース（定番の形と色に寄せた、ロゴなしの一般的なモデル） ----------------
// 'single' = シングルカット（厚いボディ・チェリーサンバースト・金のパーツ・2ハムバッカー）
// 'double' = ダブルカット（両側のホーン・3トーンサンバースト・白いピックガード・3シングルコイル）
// 'bass'   = エレキベース（黒いボディ・べっこう柄のピックガード・長いネック）
// 原点はボディの下はし、正面 +Z、ネックは +Y
const GT_SHAPES = {
  single: [[0, 0], [0.12, 0.015], [0.16, 0.07], [0.165, 0.15], [0.14, 0.23], [0.113, 0.28], [0.127, 0.33], [0.124, 0.378], [0.1, 0.398], [0.07, 0.385], [0.048, 0.36], [0.036, 0.4], [0.034, 0.43], [0, 0.437], [-0.034, 0.438], [-0.08, 0.441], [-0.122, 0.41], [-0.14, 0.355], [-0.12, 0.29], [-0.143, 0.23], [-0.165, 0.15], [-0.16, 0.07], [-0.12, 0.015]],
  double: [[0, 0], [0.11, 0.01], [0.155, 0.06], [0.162, 0.13], [0.135, 0.2], [0.115, 0.25], [0.135, 0.31], [0.132, 0.37], [0.112, 0.418], [0.088, 0.42], [0.065, 0.385], [0.042, 0.352], [0.0, 0.362], [-0.045, 0.352], [-0.068, 0.39], [-0.092, 0.448], [-0.118, 0.455], [-0.138, 0.41], [-0.137, 0.33], [-0.117, 0.255], [-0.14, 0.19], [-0.16, 0.12], [-0.152, 0.05], [-0.105, 0.008]],
  guard: [[0.0, 0.372], [0.045, 0.352], [0.072, 0.33], [0.1, 0.28], [0.115, 0.22], [0.12, 0.14], [0.1, 0.075], [0.062, 0.06], [0.03, 0.09], [-0.02, 0.118], [-0.075, 0.13], [-0.1, 0.17], [-0.106, 0.25], [-0.088, 0.31], [-0.05, 0.345]],
  lpguard: [[0.046, 0.352], [0.07, 0.35], [0.094, 0.335], [0.1, 0.31], [0.085, 0.285], [0.055, 0.28], [0.046, 0.31]],
};
function gShape(kind, k = 1) {
  const pts = GT_SHAPES[kind].map(([x, y]) => V2(x * k, y * k));
  const sh = new THREE.Shape(); sh.moveTo(pts[0].x, pts[0].y); sh.splineThru([...pts.slice(1), pts[0]]);
  return sh;
}
function planarUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const w = b.max.x - b.min.x || 1, h = b.max.y - b.min.y || 1;
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - b.min.x) / w; uv[i * 2 + 1] = (p.getY(i) - b.min.y) / h; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function gtGeo(kind, k, depth, bev) {
  return cg(`gtb${kind}${r4(k)},${r4(depth)},${r4(bev)}`, () => {
    const g = new THREE.ExtrudeGeometry(gShape(kind, k), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 3, curveSegments: 40 });
    g.translate(0, 0, -depth / 2);
    return planarUV(g);
  });
}
function polyGeo(key, pts, depth, bev = 0.001) {
  return cg('pg' + key + r4(depth), () => {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 12 });
    g.translate(0, 0, -depth / 2);
    return planarUV(g);
  });
}
// サンバーストの塗装（真ん中が明るく、ふちへ赤・黒）
function burstTex(kind) {
  return canvasTex('burst' + kind, 512, 512, (ctx, w, h) => {
    const cols = kind === 'cherry'
      ? [[0, '#f6c060'], [0.38, '#eaa040'], [0.6, '#c43a1c'], [0.8, '#8a0c14'], [1, '#3a0408']]
      : [[0, '#f8d058'], [0.4, '#eba634'], [0.6, '#b8381a'], [0.76, '#4a160a'], [1, '#140604']];
    ctx.save(); ctx.translate(w * 0.5, h * 0.66); ctx.scale(1, 1.3);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.56); cols.forEach(([s, c]) => gr.addColorStop(s, c));
    ctx.fillStyle = gr; ctx.fillRect(-w, -h, w * 2, h * 2); ctx.restore();
    // 木目（シングルカットは虎杢）
    const im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, i = (y * w + x) * 4;
      let f = 1 + (fbm(u * 3, v * 40, 3, 40, 3, 4) - 0.5) * 0.12;
      if (kind === 'cherry') f *= 1 + 0.07 * Math.sin((v * 38 + fbm(u * 3, v * 4, 3, 4, 3, 9) * 9 + u * 2) * TAU) * fbm(u * 5, v * 2, 5, 2, 2, 3);
      d[i] = clamp(d[i] * f, 0, 255); d[i + 1] = clamp(d[i + 1] * f, 0, 255); d[i + 2] = clamp(d[i + 2] * f, 0, 255);
    }
    ctx.putImageData(im, 0, 0);
  });
}
const burst = kind => cm('burstm' + kind, () => phys({ color: '#ffffff', map: burstTex(kind), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }));
function tortoiseTex() {
  return canvasTex('tortoise', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v, o) => {
    const n = fbm(u * 6, v * 6, 6, 6, 5, 21), m = fbm(u * 14, v * 14, 14, 14, 3, 5);
    const c = mixRGB([24, 8, 4], [178, 82, 26], clamp((n - 0.45) * 3 + (m - 0.5) * 0.6, 0, 1));
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  }), { rep: 1 });
}
const TORTOISE = () => cm('tortoisem', () => phys({ color: '#ffffff', map: tortoiseTex(), roughness: 0.25, clearcoat: 1 }));
const GTGOLD = () => cm('gtgold', () => phys({ color: '#e6c27a', metalness: 1, roughness: 0.22 }));
function guitarModel(kind) {
  const g = new THREE.Group();
  const lp = kind === 'single', bass = kind === 'bass';
  const k = bass ? 1.12 : 1;
  const metal = lp ? GTGOLD() : CHROME();
  let zf;
  if (lp) {
    const mah = lacquer('#3a160c', 0.25);
    mk(g, gtGeo('single', 1, 0.038, 0.004), [mah, mah], 0, 0, -0.006);
    mk(g, gtGeo('single', 1, 0.01, 0.007), [burst('cherry'), lacquer('#efe2c0', 0.3)], 0, 0, 0.02);
    zf = 0.033;
  } else {
    const blk = lacquer('#0b0b0c', 0.15);
    mk(g, gtGeo('double', k, 0.04, 0.007), bass ? [blk, blk] : [burst('three'), lacquer('#160804', 0.2)], 0, 0, 0);
    zf = 0.027;
  }
  // ネック・指板・フレット・ヘッド
  const yJ = (lp ? 0.43 : 0.36) * k, len = bass ? 0.6 : lp ? 0.4 : 0.43, yN = yJ + len;
  const yB = lp ? 0.335 : bass ? 0.33 : 0.3;
  const w0 = bass ? 0.042 : 0.043, w1 = bass ? 0.062 : 0.056;
  const neckM = lp ? lacquer('#4a1c0e', 0.3) : bass ? lacquer('#c99a5a', 0.35) : lacquer('#d8a868', 0.3);
  const boardM = lp || bass ? paintG('#2a1610', 0.55) : lacquer('#e2b878', 0.3);
  const tz = zf + 0.004;
  mk(g, polyGeo('neck' + kind, [[-w1 / 2, yJ - 0.06], [w1 / 2, yJ - 0.06], [w0 / 2, yN], [-w0 / 2, yN]], 0.02, 0.003), neckM, 0, 0, tz - 0.012);
  mk(g, polyGeo('board' + kind, [[-w1 / 2, yB], [w1 / 2, yB], [w0 / 2, yN], [-w0 / 2, yN]], 0.006, 0.0008), boardM, 0, 0, tz + 0.001);
  const fz = tz + 0.0045, frets = new Bag(), dots = new Bag();
  const SC = (yN - yB) / (1 - Math.pow(2, -(bass ? 20 : 22) / 12));
  const wAt = y => w0 + (w1 - w0) * (yN - y) / (yN - yB);
  for (let i = 1; i <= (bass ? 20 : 22); i++) {
    const y = yN - SC * (1 - Math.pow(2, -i / 12));
    frets.add(B(wAt(y) - 0.002, 0.0018, 0.002, 0), 0, y, fz);
    if ([3, 5, 7, 9, 12, 15, 17, 19, 21].includes(i)) {
      const yp = yN - SC * (1 - Math.pow(2, -(i - 0.5) / 12));
      if (lp) dots.add(B(wAt(yp) * 0.7, 0.012, 0.001, 0), 0, yp, fz - 0.0005);
      else if (i === 12) for (const sx of [-1, 1]) dots.add(C(0.003, 0.003, 0.001, 10), sx * 0.012, yp, fz - 0.0005, PI / 2);
      else dots.add(C(0.003, 0.003, 0.001, 10), 0, yp, fz - 0.0005, PI / 2);
    }
  }
  frets.add(B(w0, 0.004, 0.004, 0.001), 0, yN, fz + 0.0005);
  frets.mesh(g, SILVER());
  dots.mesh(g, lp ? paintG('#f1e6cc', 0.3) : bass ? paintG('#f1ece0', 0.4) : paintG('#111', 0.5));
  // ヘッド（ロゴなし）
  const hy = yN + 0.002, headM = lp ? lacquer('#0b0b0c', 0.18) : neckM;
  const hz = tz - 0.006;
  if (lp) {
    mk(g, polyGeo('head3', [[-0.026, 0], [0.026, 0], [0.045, 0.15], [0.034, 0.18], [0, 0.172], [-0.034, 0.18], [-0.045, 0.15]], 0.016, 0.002), headM, 0, hy, hz);
    const pegs = new Bag(), btn = new Bag();
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = hy + 0.05 + i * 0.045, x = sx * (0.024 + i * 0.006);
      pegs.add(C(0.0045, 0.0045, 0.014, 10), x, y, hz + 0.014, PI / 2);
      pegs.add(C(0.003, 0.003, 0.03, 8), sx * 0.05, y, hz - 0.012, 0, 0, PI / 2);
      btn.add(B(0.012, 0.016, 0.006, 0.002), sx * 0.068, y, hz - 0.012);
    }
    pegs.mesh(g, metal); btn.mesh(g, paintG('#efe4c8', 0.3));
  } else {
    const n = bass ? 4 : 6, step = bass ? 0.05 : 0.026, L = 0.04 + n * step;
    mk(g, polyGeo('head' + n, [[-0.022, 0], [0.022, 0], [0.026, 0.05], [0.022, L - 0.02], [0.0, L], [-0.03, L + 0.005], [-0.052, L - 0.01], [-0.048, L * 0.6], [-0.04, 0.05]], 0.015, 0.002), headM, 0, hy, hz);
    const pegs = new Bag(), btn = new Bag();
    for (let i = 0; i < n; i++) {
      const y = hy + 0.04 + i * step, x = -0.026 + (i / (n - 1)) * 0.012;
      pegs.add(C(bass ? 0.006 : 0.0045, bass ? 0.006 : 0.0045, 0.014, 10), x, y, hz + 0.013, PI / 2);
      pegs.add(C(0.003, 0.003, 0.03, 8), x - 0.035, y, hz - 0.012, 0, 0, PI / 2);
      btn.add(bass ? B(0.006, 0.026, 0.02, 0.003) : B(0.006, 0.016, 0.012, 0.002), x - 0.052, y, hz - 0.012);
    }
    pegs.mesh(g, metal); btn.mesh(g, metal);
  }
  // ピックアップ・ブリッジ・つまみ
  const pz = zf + 0.003;
  let yBr, yTail = 0;
  if (lp) {
    const ring = paintG('#efe2c0', 0.35);
    for (const y of [0.3, 0.2]) { mk(g, B(0.088, 0.052, 0.006, 0.006), ring, 0, y, pz); mk(g, B(0.072, 0.04, 0.012, 0.005), metal, 0, y, pz + 0.006); }
    mk(g, polyGeo('lpguard', GT_SHAPES.lpguard, 0.002, 0), paintG('#efe2c0', 0.3), 0, 0, pz + 0.012);
    yBr = 0.155; yTail = 0.115;
    mk(g, B(0.082, 0.01, 0.012, 0.003), metal, 0, yBr, pz + 0.008);
    mk(g, B(0.09, 0.012, 0.014, 0.005), metal, 0, yTail, pz + 0.008);
    const kn = new Bag();
    for (const [x, y] of [[0.065, 0.14], [0.11, 0.115], [0.06, 0.085], [0.105, 0.06]]) kn.add(LA([[0.001, 0], [0.012, 0], [0.011, 0.012], [0.009, 0.016], [0.001, 0.017]], 16), x, y, pz, PI / 2);
    kn.mesh(g, metal);
    mk(g, C(0.006, 0.006, 0.006, 12), CHROME(), -0.105, 0.39, pz, PI / 2);
    rod(g, V3(-0.105, 0.39, pz), V3(-0.105, 0.39, pz + 0.025), 0.0018, CHROME());
    mk(g, S(0.004, 8, 6), paintG('#efe2c0', 0.3), -0.105, 0.39, pz + 0.026);
  } else if (!bass) {
    mk(g, polyGeo('sguard', GT_SHAPES.guard.map(([x, y]) => [x * 0.92, 0.03 + y * 0.92]), 0.003, 0), paintG('#f4f2ec', 0.35), 0, 0, pz);
    const pk = paintG('#f4f2ec', 0.4);
    mk(g, B(0.072, 0.018, 0.012, 0.008), pk, 0, 0.29, pz + 0.006);
    mk(g, B(0.072, 0.018, 0.012, 0.008), pk, 0, 0.225, pz + 0.006, 0, 0, 0.04);
    mk(g, B(0.072, 0.018, 0.012, 0.008), pk, 0, 0.16, pz + 0.006, 0, 0, 0.14);
    yBr = 0.115;
    mk(g, B(0.075, 0.045, 0.004, 0.002), CHROME(), 0, yBr - 0.01, pz + 0.003);
    const sd = new Bag(); for (let i = 0; i < 6; i++) sd.add(B(0.009, 0.014, 0.008, 0.002), -0.028 + i * 0.0112, yBr, pz + 0.008); sd.mesh(g, CHROME());
    const kn = new Bag();
    for (const [x, y] of [[0.055, 0.15], [0.075, 0.115], [0.09, 0.08]]) kn.add(LA([[0.001, 0], [0.011, 0], [0.01, 0.015], [0.001, 0.016]], 16), x, y, pz + 0.002, PI / 2);
    kn.mesh(g, paintG('#f4f2ec', 0.35));
    mk(g, B(0.004, 0.012, 0.012, 0.002), paintG('#f4f2ec', 0.35), 0.06, 0.2, pz + 0.006, 0, 0, -0.6);
    mk(g, C(0.012, 0.012, 0.006, 16), CHROME(), 0.12, 0.08, zf - 0.002, PI / 2);
  } else {
    mk(g, polyGeo('bguard', GT_SHAPES.guard.map(([x, y]) => [x * k, y * k]), 0.003, 0), TORTOISE(), 0, 0, pz);
    const pk = paintG('#0d0d0d', 0.45);
    mk(g, B(0.045, 0.022, 0.014, 0.006), pk, -0.014, 0.265, pz + 0.007);
    mk(g, B(0.045, 0.022, 0.014, 0.006), pk, 0.014, 0.24, pz + 0.007);
    yBr = 0.105;
    mk(g, B(0.08, 0.06, 0.008, 0.003), CHROME(), 0, yBr - 0.015, pz + 0.003);
    mk(g, B(0.05, 0.11, 0.003, 0.02), CHROME(), 0.085, 0.14, pz + 0.004, 0, 0, 0.5);
    for (const [x, y] of [[0.07, 0.17], [0.1, 0.11]]) mk(g, C(0.012, 0.012, 0.016, 16), CHROME(), x, y, pz + 0.01, PI / 2);
  }
  // 弦
  const n = bass ? 4 : 6, sb = new Bag(), sz = fz + 0.003;
  const yS = lp ? yTail : yBr;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    sb.rod(V3(t * (bass ? 0.056 : 0.05), yS, sz), V3(t * (w0 - 0.008), yN, sz), bass ? 0.0011 : 0.0006, 4);
    if (!lp) sb.rod(V3(t * (w0 - 0.008), yN, sz), V3(-0.026 + (i / (n - 1)) * 0.012, hy + 0.04 + i * (bass ? 0.05 : 0.026), hz + 0.02), bass ? 0.0011 : 0.0006, 4);
  }
  sb.mesh(g, SILVER());
  return g;
}
// ギターとベースのスタンド（2本立て）
function guitarRack(s) {
  const g = new THREE.Group();
  const M = MATTE_BLACK(), foam = paintG('#1e1e1e', 0.95);
  for (const sx of [-1, 1]) {
    rod(g, V3(sx * 0.4, 0.02, -0.25), V3(sx * 0.4, 0.02, 0.2), 0.014, M);
    rod(g, V3(sx * 0.4, 0.02, -0.2), V3(sx * 0.4, 1.02, -0.2), 0.014, M);
    for (const z of [-0.25, 0.2]) mk(g, C(0.02, 0.02, 0.012, 10), foam, sx * 0.4, 0.006, z);
  }
  rod(g, V3(-0.4, 0.2, 0.08), V3(0.4, 0.2, 0.08), 0.016, M);
  rod(g, V3(-0.4, 0.2, 0.08), V3(-0.4, 0.2, -0.2), 0.012, M); rod(g, V3(0.4, 0.2, 0.08), V3(0.4, 0.2, -0.2), 0.012, M);
  rod(g, V3(-0.4, 1.0, -0.2), V3(0.4, 1.0, -0.2), 0.012, M);
  const put = (kind, x) => {
    const gt = guitarModel(kind);
    const pv = new THREE.Group(); pv.position.set(x, 0.18, 0.12); pv.rotation.x = -0.3; pv.add(gt); g.add(pv);
    // 下の受け（U 字）と上のネック受け
    tube(g, [V3(x - 0.07, 0.24, 0.16), V3(x - 0.06, 0.2, 0.12), V3(x + 0.06, 0.2, 0.12), V3(x + 0.07, 0.24, 0.16)], 0.012, foam, 16, 6);
    tube(g, [V3(x - 0.04, 1.03, -0.18), V3(x - 0.03, 0.995, -0.2), V3(x + 0.03, 0.995, -0.2), V3(x + 0.04, 1.03, -0.18)], 0.008, foam, 16, 6);
  };
  put('double', -0.2);
  put('bass', 0.2);
  return g;
}

// ステージのトラス照明（天井から吊る。色の光の筋が動く）
function beamTex() {
  return canvasTex('beamg', 16, 256, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(150,150,150,1)'); gr.addColorStop(0.7, 'rgba(40,40,40,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  });
}
// 光の筋（円すい）。家具の大きさには入れない。消灯で消えるように emissive で光らせる
function beamCone(parent, len, r0, r1, color, i = 0.55) {
  const geo = cg(`beam${r4(len)},${r4(r0)},${r4(r1)}`, () => {
    const gg = new THREE.CylinderGeometry(r0, r1, len, 28, 1, true); gg.translate(0, -len / 2, 0);
    gg.boundingBox = new THREE.Box3(); gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -len / 2, 0), len);
    return gg;
  });
  const mat = new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveMap: beamTex(), emissiveIntensity: i, roughness: 1, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  // ふちほど薄く（正面から見た所だけ光る）→ やわらかい光の筋に見える
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= pow(abs(dot(normal, normalize(vViewPosition))), 2.0);');
  };
  mat.customProgramCacheKey = () => 'beamfade';
  const m = noRay(new THREE.Mesh(geo, mat));
  m.frustumCulled = false; m.receiveShadow = false;
  parent.add(m);
  return m;
}
function stageTruss(s) {
  const g = new THREE.Group();
  const L = 2.4, Q = 0.29, ty = -0.62;
  const AL = cm('alu', () => phys({ color: '#d4d8db', metalness: 1, roughness: 0.3 }));
  const bag = new Bag();
  const ys = [ty - Q / 2, ty + Q / 2], zs = [-Q / 2, Q / 2];
  for (const y of ys) for (const z of zs) bag.add(C(0.022, 0.022, L, 10), 0, y, z, 0, 0, PI / 2);
  const n = 10, dx = L / n;
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + i * dx, x1 = x0 + dx, k0 = i % 2, k1 = 1 - k0;
    for (const y of ys) bag.rod(V3(x0, y, zs[k0]), V3(x1, y, zs[k1]), 0.008, 6);
    for (const z of zs) bag.rod(V3(x0, ys[k0], z), V3(x1, ys[k1], z), 0.008, 6);
  }
  for (const x of [-L / 2, L / 2]) bag.add(B(0.012, Q + 0.06, Q + 0.06, 0.004), x, ty, 0);
  bag.mesh(g, AL);
  // 吊りワイヤーと天井の金具
  for (const x of [-0.85, 0.85]) {
    mk(g, C(0.05, 0.05, 0.02, 16), MATTE_BLACK(), x, -0.01, 0);
    rod(g, V3(x, -0.02, 0), V3(x, ys[1], 0), 0.005, paintG('#2a2a2a', 0.4, 0.8));
    mk(g, B(0.06, 0.05, 0.08, 0.01), MATTE_BLACK(), x, ys[1] + 0.06, 0);
  }
  const beams = [], lenses = [];
  // PAR ライト（下の弦に吊る）
  const par = (x, color, rx, rz) => {
    const p = new THREE.Group(); p.position.set(x, ys[0] - 0.03, 0.02); p.rotation.set(rx, 0, rz); g.add(p);
    mk(p, B(0.02, 0.05, 0.05, 0.004), MATTE_BLACK(), 0, 0.02, 0);
    mk(p, T(0.1, 0.008, 6, 20, PI), MATTE_BLACK(), 0, -0.1, 0, 0, PI / 2, 0);
    const body = LA([[0.001, 0.0], [0.07, 0.0], [0.09, -0.06], [0.1, -0.26], [0.108, -0.27], [0.108, -0.29], [0.095, -0.29]], 24);
    mk(p, body, cm('parbody', () => phys({ color: '#0e0e0f', metalness: 0.6, roughness: 0.35 })), 0, -0.04, 0);
    const lm = new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: 3.2, roughness: 0.3 });
    mk(p, CIRC(0.094, 24), lm, 0, -0.325, 0, PI / 2).castShadow = false;
    lenses.push(lm);
    beams.push(beamCone(p, 2.1, 0.09, 0.42, color, 0.45));
    beams[beams.length - 1].position.y = -0.33;
  };
  par(-0.65, '#ff2a3a', -0.35, -0.15);
  par(-0.22, '#ffb030', -0.5, 0.05);
  par(0.22, '#ff3ab0', -0.5, -0.05);
  par(0.65, '#2ad0ff', -0.35, 0.15);
  // 動くムービングライト（両はし）
  const heads = [];
  for (const sx of [-1, 1]) {
    const base = new THREE.Group(); base.position.set(sx * 1.05, ys[0] - 0.02, 0); g.add(base);
    mk(base, B(0.2, 0.08, 0.2, 0.02), MATTE_BLACK(), 0, -0.04, 0);
    const yoke = new THREE.Group(); yoke.position.y = -0.08; base.add(yoke);
    for (const k of [-1, 1]) mk(yoke, B(0.025, 0.16, 0.06, 0.008), MATTE_BLACK(), k * 0.1, -0.08, 0);
    const head = new THREE.Group(); head.position.y = -0.15; yoke.add(head);
    mk(head, C(0.075, 0.08, 0.2, 20), cm('mhhead', () => phys({ color: '#141416', metalness: 0.4, roughness: 0.4 })), 0, 0, 0, PI / 2);
    const lm = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#fff0d8', emissiveIntensity: 3.5, roughness: 0.3 });
    mk(head, CIRC(0.06, 20), lm, 0, 0, 0.101).castShadow = false;
    lenses.push(lm);
    const bh = new THREE.Group(); bh.position.z = 0.1; bh.rotation.x = -PI / 2; head.add(bh);
    beams.push(beamCone(bh, 2.3, 0.05, 0.3, '#fff0d8', 0.32));
    heads.push({ yoke, head, sx });
  }
  for (const h of heads) { h.yoke.rotation.y = h.sx * 0.5; h.head.rotation.x = 0.9; }
  addTick(g, t => {
    for (const h of heads) { h.yoke.rotation.y = h.sx * (0.5 + 0.45 * Math.sin(t * 0.5 + h.sx)); h.head.rotation.x = 0.85 + 0.3 * Math.sin(t * 0.7 + h.sx * 2); }
    lenses.forEach((m, i) => { if (i < 4) setE(m, 2.6 + 0.9 * Math.sin(t * 1.7 + i * 1.3)); });
    beams.forEach((b, i) => setE(b.material, (i < 4 ? 0.45 : 0.32) + 0.12 * Math.sin(t * 1.7 + i * 1.3)));
  });
  setLight(g, ty, 1.1, '#ff6a5a');
  return g;
}

// ヴィンテージのスタンドマイク（ケーブルが床でとぐろを巻く）
function micGrill() {
  return canvasTex('micgrill', 128, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v, o) => {
    const a = Math.abs(Math.sin(u * 40 * PI)), b = Math.abs(Math.sin(v * 24 * PI));
    const f = 0.35 + 0.65 * Math.min(1, (a + b) * 0.7);
    o[0] = o[1] = o[2] = 70 + 170 * f;
  }));
}
function micStand(s) {
  const g = new THREE.Group();
  const ch = CHROME();
  mk(g, LA(smooth([[0.001, 0], [0.15, 0], [0.155, 0.01], [0.13, 0.03], [0.03, 0.04], [0.02, 0.045]], 16), 48), ch, 0, 0, 0);
  rod(g, V3(0, 0.04, 0), V3(0, 1.0, 0), 0.012, ch);
  mk(g, C(0.02, 0.02, 0.05, 14), MATTE_BLACK(), 0, 1.0, 0);
  rod(g, V3(0, 1.0, 0), V3(0, 1.38, 0), 0.0075, ch);
  // マイク（SM58 風：黒い持ち手と銀の網の頭）
  const mic = new THREE.Group(); mic.position.set(0, 1.42, 0.02); mic.rotation.x = 1.15; g.add(mic);
  mk(mic, B(0.012, 0.06, 0.03, 0.004), MATTE_BLACK(), 0, -0.02, -0.02);
  mk(mic, LA(smooth([[0.001, -0.1], [0.012, -0.1], [0.014, -0.08], [0.019, 0.02], [0.022, 0.05], [0.001, 0.05]], 16), 24), cm('michandle', () => phys({ color: '#1a1a1c', metalness: 0.3, roughness: 0.45 })), 0, 0, 0);
  mk(mic, C(0.0235, 0.0235, 0.01, 24), SILVER(), 0, 0.055, 0);
  mk(mic, S(0.03, 24, 16), cm('micgrillm', () => std({ color: '#ffffff', map: micGrill(), metalness: 0.9, roughness: 0.35 })), 0, 0.085, 0).scale.set(1, 1.05, 1);
  // ケーブル：マイクのおしりから柱にそって床へ。床で2重に巻く
  mic.updateMatrix();
  const tail = V3(0, -0.1, 0).applyMatrix4(mic.matrix);
  const pts = [tail, V3(0.0, tail.y - 0.06, tail.z - 0.03), V3(0.02, 1.2, -0.02), V3(0.022, 0.9, -0.018), V3(0.025, 0.5, -0.02), V3(0.04, 0.15, -0.03), V3(0.12, 0.012, -0.1)];
  const cx = 0.36, cz = 0.08;
  for (let i = 0; i <= 28; i++) { const a = -PI * 0.75 + i / 28 * TAU * 1.8, r = 0.13 + i * 0.0015; pts.push(V3(cx + Math.cos(a) * r, 0.007 + (i % 9 === 0 ? 0.004 : 0), cz + Math.sin(a) * r)); }
  pts.push(V3(cx + 0.2, 0.007, cz + 0.2));
  tube(g, pts, 0.0055, paintG('#0c0c0c', 0.45), 220, 6);
  mk(g, C(0.011, 0.011, 0.07, 12), SILVER(), cx + 0.23, 0.011, cz + 0.23, PI / 2, 0, -PI / 4);
  // 床にテープでとめたセットリスト
  mk(g, cg('setpl', () => new THREE.PlaneGeometry(0.21, 0.297)), setlistMat(), -0.24, 0.002, 0.16, -PI / 2, 0, 0.25).castShadow = false;
  return g;
}
function setlistMat() {
  return texMat('setlist', 256, 362, (ctx, w, h) => {
    ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111'; ctx.font = FONT(30); ctx.textAlign = 'center'; ctx.fillText('SET LIST', w / 2, 44);
    ctx.textAlign = 'left'; ctx.font = 'bold 22px "Comic Sans MS", "Marker Felt", cursive';
    ['1. Opening', '2. Neon Night', '3. Room 404', '4. Study Hard', '5. Red Sparkle', '6. Ballad', '7. Encore!'].forEach((t, i) => { ctx.fillStyle = i === 6 ? '#c01020' : '#1a1a1a'; ctx.fillText(t, 22, 92 + i * 38); });
    ctx.fillStyle = 'rgba(220,200,150,0.75)'; ctx.fillRect(w / 2 - 40, -6, 80, 26); ctx.fillRect(w / 2 - 40, h - 20, 80, 26);
  }, { roughness: 0.9 });
}

// 2段のキーボードスタンド（下は赤いステージピアノ、上は光る画面のシンセ）。弾く人は +Z 側
function keysInto(white, black, nw, kw, y, z, depth, startNote = 0) {
  const W = nw * kw;
  for (let i = 0; i < nw; i++) {
    const x = -W / 2 + (i + 0.5) * kw;
    white.add(B(kw - 0.0016, 0.016, depth, 0.0015), x, y, z);
    const n = (i + startNote) % 7;
    if (i < nw - 1 && n !== 2 && n !== 6) black.add(B(kw * 0.56, 0.014, depth * 0.62, 0.0015), x + kw / 2, y + 0.012, z - depth * 0.19);
  }
  return W;
}
function keyboard(g, W, nw, bodyM, x, y, z, rx, opts = {}) {
  const k = new THREE.Group(); k.position.set(x, y, z); k.rotation.x = rx; g.add(k);
  const D = 0.32, kw = 0.0228, kd = 0.15;
  mk(k, B(W, 0.07, D, 0.012), bodyM, 0, 0.035, 0);
  mk(k, B(W - 0.04, 0.012, kd + 0.02, 0.002), paintG('#0b0b0b', 0.6), 0, 0.066, D / 2 - kd / 2 - 0.01);
  const wb = new Bag(), bb = new Bag();
  keysInto(wb, bb, nw, kw, 0.078, D / 2 - kd / 2 - 0.004, kd);
  wb.mesh(k, cm('keyw', () => phys({ color: '#f4f2ec', roughness: 0.25, clearcoat: 0.5 })));
  bb.mesh(k, cm('keyb', () => phys({ color: '#0a0a0a', roughness: 0.3, clearcoat: 0.6 })));
  // つまみ・画面
  const kn = new Bag();
  for (let i = 0; i < opts.knobs; i++) kn.add(C(0.009, 0.01, 0.014, 12), -W / 2 + 0.2 + i * 0.045, 0.077, -D / 2 + 0.06);
  for (let i = 0; i < opts.knobs; i++) kn.add(C(0.007, 0.008, 0.012, 12), -W / 2 + 0.2 + i * 0.045, 0.076, -D / 2 + 0.1);
  kn.mesh(k, paintG('#1c1c1c', 0.4));
  const wave = drawTex('synscr', 128, 48, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= w; i += 2) { const yy = h / 2 + Math.sin(i * 0.196) * h * 0.32 * Math.sin(i * 0.049 + 1); i ? ctx.lineTo(i, yy) : ctx.moveTo(i, yy); } ctx.stroke();
  });
  const scr = new THREE.MeshStandardMaterial({ color: '#04090b', emissive: opts.screen || '#38d8ff', emissiveIntensity: 1.6, roughness: 0.3, emissiveMap: wave });
  mk(k, B(0.14, 0.004, 0.05, 0.001), scr, W / 2 - 0.12, 0.072, -D / 2 + 0.08).castShadow = false;
  // ロゴの白い文字の帯
  mk(k, B(0.12, 0.003, 0.02, 0.001), paintG('#f2f2f2', 0.4), -W / 2 + 0.09, 0.071, -D / 2 + 0.06);
  // ピッチホイール
  if (opts.wheels) for (const i of [0, 1]) mk(k, C(0.022, 0.022, 0.012, 16), paintG('#1a1a1a', 0.5), -W / 2 + 0.03 + i * 0.022 - 0.005, 0.07, D / 2 - 0.08, 0, 0, PI / 2);
  return { k, scr };
}
function keyboardRig(s) {
  const g = new THREE.Group();
  const M = MATTE_BLACK();
  // スタンド（両側にコの字の脚、2段の腕）
  for (const sx of [-1, 1]) {
    const x = sx * 0.48;
    rod(g, V3(x, 0.02, -0.26), V3(x, 0.02, 0.26), 0.016, M);
    rod(g, V3(x, 0.02, -0.18), V3(x, 1.06, -0.18), 0.016, M);
    rod(g, V3(x, 0.74, -0.2), V3(x, 0.74, 0.18), 0.014, M);
    rod(g, V3(x, 1.0, -0.22), V3(x, 1.08, 0.08), 0.012, M);
    for (const z of [-0.26, 0.26]) mk(g, C(0.02, 0.02, 0.012, 10), paintG('#222', 0.8), x, 0.006, z);
  }
  rod(g, V3(-0.48, 0.32, -0.18), V3(0.48, 0.32, -0.18), 0.014, M);
  const piano = keyboard(g, 1.12, 43, lacquer('#c4161c', 0.2), 0, 0.755, 0.0, 0, { knobs: 8, screen: '#ff7a3a', wheels: true });
  const synth = keyboard(g, 0.8, 29, cm('synthbody', () => phys({ color: '#18181a', metalness: 0.5, roughness: 0.35 })), 0, 1.06, -0.08, 0.32, { knobs: 7, screen: '#38d8ff' });
  // 木の側板（シンセ）
  for (const sx of [-1, 1]) mk(synth.k, B(0.02, 0.09, 0.33, 0.006), wood('walnut'), sx * 0.41, 0.04, 0);
  // サステインペダルとケーブル
  mk(g, B(0.08, 0.025, 0.17, 0.008), MATTE_BLACK(), 0.25, 0.013, 0.42, -0.08);
  tube(g, [V3(0.25, 0.015, 0.33), V3(0.3, 0.008, 0.2), V3(0.4, 0.05, 0.02), V3(0.45, 0.65, -0.05), V3(0.44, 0.76, -0.1)], 0.004, paintG('#0c0c0c', 0.5), 40, 5);
  addTick(g, t => { setE(synth.scr, 1.4 + 0.3 * Math.sin(t * 2.3));  });
  setLight(g, 1.1, 0.35, '#4adfff');
  return g;
}

// フライトケースのテーブル（黒い箱・アルミのふち・クロームの角）
function flightCase(s) {
  const g = new THREE.Group();
  const W = 0.95, H = 0.5, D = 0.6, y0 = 0.025;
  const body = cm('fcbody', () => phys({ color: '#161617', roughness: 0.6, clearcoat: 0.2 }));
  const AL = cm('alu2', () => phys({ color: '#c9ced2', metalness: 1, roughness: 0.38 }));
  mk(g, B(W, H, D, 0.006), body, 0, y0 + H / 2, 0);
  // アルミのふち
  const bag = new Bag(), e = 0.022;
  for (const y of [y0 + e / 2, y0 + H - e / 2]) for (const z of [-D / 2 + e / 2, D / 2 - e / 2]) bag.add(B(W, e, e, 0.003), 0, y, z);
  for (const y of [y0 + e / 2, y0 + H - e / 2]) for (const x of [-W / 2 + e / 2, W / 2 - e / 2]) bag.add(B(e, e, D, 0.003), x, y, 0);
  for (const x of [-W / 2 + e / 2, W / 2 - e / 2]) for (const z of [-D / 2 + e / 2, D / 2 - e / 2]) bag.add(B(e, H, e, 0.003), x, y0 + H / 2, z);
  // ふたの合わせ目
  const sy = y0 + H - 0.13;
  bag.add(B(W + 0.004, 0.018, 0.006, 0.002), 0, sy, D / 2 + 0.001); bag.add(B(W + 0.004, 0.018, 0.006, 0.002), 0, sy, -D / 2 - 0.001);
  bag.add(B(0.006, 0.018, D + 0.004, 0.002), W / 2 + 0.001, sy, 0); bag.add(B(0.006, 0.018, D + 0.004, 0.002), -W / 2 - 0.001, sy, 0);
  bag.mesh(g, AL);
  // 角の金具（下の角は足になる）
  const cb = new Bag();
  for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) { cb.add(S(0.028, 12, 8), x * (W / 2 - 0.01), y0 + y * H + (y ? -0.008 : 0.0), z * (D / 2 - 0.01)); }
  // 留め金とハンドル
  for (const x of [-0.28, 0.28]) { cb.add(B(0.07, 0.07, 0.012, 0.006), x, sy, D / 2 + 0.006); cb.add(C(0.02, 0.02, 0.012, 16), x, sy, D / 2 + 0.013, PI / 2); }
  for (const x of [-1, 1]) { cb.add(B(0.012, 0.06, 0.16, 0.004), x * (W / 2 + 0.006), y0 + H * 0.5, 0); cb.add(C(0.009, 0.009, 0.14, 10), x * (W / 2 + 0.03), y0 + H * 0.5 + 0.02, 0, PI / 2); }
  cb.mesh(g, CHROME());
  // 白いステンシル文字
  const stencil = (key, txt, sub) => cm('stc' + key, () => std({ color: '#ffffff', transparent: true, alphaTest: 0.3, roughness: 0.7, map: drawTex('stc' + key, 512, 192, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(240,236,228,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONT(84); ctx.fillText(txt, w / 2, h * 0.38); ctx.font = FONT(34, 700); ctx.fillText(sub, w / 2, h * 0.8);
    for (let i = 0; i < 260; i++) { ctx.clearRect(h2(i, 1) * w, h2(i, 2) * h, 3 + h2(i, 3) * 6, 2); }
  }) }));
  const fp = mk(g, cg('fcplane', () => new THREE.PlaneGeometry(0.7, 0.26)), stencil('f', 'ROOMIN', 'STAGE CREW · FRAGILE'), 0, y0 + 0.17, D / 2 + 0.002); fp.castShadow = false;
  const sp = mk(g, cg('fcplane2', () => new THREE.PlaneGeometry(0.45, 0.17)), stencil('s', 'TOUR 2026', '↑ THIS SIDE UP ↑'), W / 2 + 0.002, y0 + 0.17, -0.15, 0, PI / 2, 0); sp.castShadow = false;
  // 天板のステッカー
  mk(g, cg('fcstk', () => new THREE.CircleGeometry(0.06, 24)), paintG('#d4202c', 0.5), 0.3, y0 + H + 0.001, -0.18, -PI / 2).castShadow = false;
  mk(g, B(0.16, 0.001, 0.07, 0), paintG('#f2c230', 0.6), -0.3, y0 + H + 0.001, 0.2, 0, 0.3, 0).castShadow = false;
  return g;
}

// ドラムスローン（丸い革の座面・クロームの三脚）
function drumThrone(s) {
  const g = new THREE.Group();
  tripodStand(g, 0, 0, 0.44, 0.24);
  mk(g, C(0.05, 0.05, 0.03, 16), CHROME(), 0, 0.44, 0);
  mk(g, LA(smooth([[0.001, 0], [0.18, 0], [0.198, 0.035], [0.19, 0.085], [0.13, 0.108], [0.001, 0.113]], 16), 48), leather('#111111'), 0, 0.455, 0);
  mk(g, T(0.197, 0.007, 6, 48), paintG('#b0101c', 0.45), 0, 0.49, 0, PI / 2);
  const st = new Bag();
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; st.add(S(0.005, 6, 4), Math.cos(a) * 0.199, 0.47, Math.sin(a) * 0.199); }
  st.mesh(g, CHROME());
  return g;
}

// アンプ型のレコード棚（上はレコード、下はスピーカーの網）
function ampShelf(s) {
  const g = new THREE.Group();
  const W = 0.92, H = 1.0, D = 0.42, y0 = 0.05, t = 0.03, T_ = TOLEX();
  mk(g, B(W, t, D, 0.01), T_, 0, y0 + t / 2, 0);
  mk(g, B(W, t, D, 0.01), T_, 0, y0 + H - t / 2, 0);
  for (const sx of [-1, 1]) mk(g, B(t, H, D, 0.01), T_, sx * (W / 2 - t / 2), y0 + H / 2, 0);
  mk(g, B(W - 0.02, H - 0.02, 0.02), paintG('#0e0e0e', 0.8), 0, y0 + H / 2, -D / 2 + 0.01);
  const midY = y0 + 0.47;
  mk(g, B(W - 2 * t, 0.025, D - 0.02, 0.004), T_, 0, midY, 0.0);
  // 下：網とパイピングとロゴ
  mk(g, B(W - 2 * t, midY - y0 - t, 0.01, 0.002), cm('grillm', () => std({ color: '#ffffff', map: grillTex(), roughness: 0.9 })), 0, (y0 + t + midY) / 2, D / 2 - 0.02);
  tube(g, [V3(-W / 2 + t + 0.01, y0 + t + 0.01, D / 2 - 0.012), V3(W / 2 - t - 0.01, y0 + t + 0.01, D / 2 - 0.012), V3(W / 2 - t - 0.01, midY - 0.015, D / 2 - 0.012), V3(-W / 2 + t + 0.01, midY - 0.015, D / 2 - 0.012)], 0.004, GOLD(), 32, 6, true);
  mk(g, B(0.2, 0.05, 0.006, 0.003), GOLD(), W / 2 - 0.2, midY - 0.06, D / 2 - 0.012);
  mk(g, B(0.17, 0.028, 0.004, 0.002), paintG('#111', 0.4), W / 2 - 0.2, midY - 0.06, D / 2 - 0.008);
  // 上：レコード（背を手前に、少しかたむけて並べる）
  const rec = new Bag(), cols = ['#d4202c', '#f2c230', '#1a1a1a', '#2a5ad0', '#e8e2d6', '#7a3ab0', '#3a9a4a', '#e8752a', '#111111', '#c8a878'];
  let x = -W / 2 + t + 0.012, i = 0;
  const sh = midY + 0.0125;
  while (x < W / 2 - t - 0.35) {
    rec.add(B(0.007, 0.31, 0.31, 0.002), x, sh + 0.155, 0.02, 0, 0, 0, 1, 1, 1, cols[Math.floor(h2(i, 7) * cols.length)]);
    x += 0.0095 + (h2(i, 3) > 0.85 ? 0.004 : 0); i++;
  }
  // 右はしは横に寝かせたレコードの山
  for (let k = 0; k < 6; k++) rec.add(B(0.31, 0.007, 0.31, 0.002), W / 2 - t - 0.175, sh + 0.004 + k * 0.008, 0.02, 0, h2(k, 5) * 0.12 - 0.06, 0, 1, 1, 1, cols[(k * 3) % cols.length]);
  rec.mesh(g, VCOL());
  // 角の金具と足
  const cb = new Bag();
  for (const sx of [-1, 1]) for (const yy of [y0, y0 + H]) for (const sz of [-1, 1]) cb.add(B(0.05, 0.05, 0.05, 0.012), sx * (W / 2 - 0.02), yy + (yy > y0 ? -0.02 : 0.02), sz * (D / 2 - 0.02));
  cb.mesh(g, CHROME());
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.025, 0.03, y0, 12), paintG('#111', 0.6), sx * (W / 2 - 0.08), y0 / 2, sz * (D / 2 - 0.07));
  return g;
}

// バスドラムの鉢植え（立てたバスドラムにモンステラ）
function kickPlanter(s) {
  const g = new THREE.Group();
  const r = 0.26, h = 0.4;
  drumShell(g, r, h, sparkle('#8e0c18'), 0, h / 2 + 0.012, 0, 0, 0.3, { top: paintG('#2e2016', 1), hoop: sparkle('#8e0c18'), hoopR: 0.014 });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; mk(g, C(0.018, 0.022, 0.012, 10), paintG('#111', 0.6), Math.cos(a) * (r - 0.03), 0.006, Math.sin(a) * (r - 0.03)); }
  if (PROC) {
    const p = PROC({ type: 'plant', foliage: 'monstera', pot: 'round', potColor: '#2e2016', size: 0.8 });
    p.position.y = h - 0.05;
    p.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.position.y < 0.3 && o.geometry.type === 'LatheGeometry') o.visible = false; });
    g.add(p);
  }
  // 前に、クロームのバッジ
  mk(g, C(0.03, 0.03, 0.006, 20), CHROME(), 0, h / 2 + 0.012, r + 0.004, PI / 2);
  return g;
}

// 光るエフェクターボード（色とりどりのペダル・赤い LED・パッチケーブル）
function pedalboard(s) {
  const g = new THREE.Group();
  const W = 0.62, D = 0.3;
  mk(g, B(W, 0.04, D, 0.008), cm('pbboard', () => phys({ color: '#0f0f10', roughness: 0.8 })), 0, 0.03, 0, 0.12);
  for (const sx of [-1, 1]) mk(g, B(0.016, 0.06, D, 0.004), CHROME(), sx * (W / 2 + 0.008), 0.03, 0, 0.12);
  const led = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2020', emissiveIntensity: 3, roughness: 0.3 });
  const ledB = new THREE.MeshStandardMaterial({ color: '#002', emissive: '#40a0ff', emissiveIntensity: 3, roughness: 0.3 });
  const P = new THREE.Group(); P.position.y = 0.05; P.rotation.x = 0.12; g.add(P);
  const ped = [['#e8752a', -0.24, 0.05], ['#3a9a4a', -0.13, 0.05], ['#c81e28', -0.02, 0.05], ['#2a5ad0', 0.09, 0.05], ['#7a3ab0', 0.2, 0.05], ['#d8d8d8', -0.18, -0.09], ['#f2c230', 0.04, -0.09], ['#18181a', 0.22, -0.09]];
  const knobs = new Bag(), sw = new Bag();
  ped.forEach(([c, x, z], i) => {
    const w = i === 7 ? 0.13 : 0.075, d = i >= 5 ? 0.09 : 0.12;
    mk(P, B(w, 0.045, d, 0.006), lacquer(c, 0.3), x, 0.0225, z);
    for (let k = 0; k < (i === 7 ? 4 : 3); k++) knobs.add(C(0.008, 0.009, 0.012, 12), x - w / 2 + 0.017 + k * (w - 0.034) / ((i === 7 ? 4 : 3) - 1), 0.05, z - d / 2 + 0.022);
    sw.add(C(0.009, 0.009, 0.016, 12), x, 0.052, z + d / 2 - 0.022);
    mk(P, S(0.0045, 8, 6), i % 3 === 1 ? ledB : led, x, 0.047, z - d / 2 + 0.045).castShadow = false;
  });
  knobs.mesh(P, paintG('#f2ece0', 0.4));
  sw.mesh(P, CHROME());
  // パッチケーブル
  const cab = paintG('#1a1a1a', 0.5), cab2 = paintG('#f2c230', 0.5);
  for (let i = 0; i < 4; i++) { const x0 = -0.24 + i * 0.11 + 0.04, x1 = x0 + 0.03; tube(P, [V3(x0, 0.03, 0.0), V3((x0 + x1) / 2, 0.075, -0.01), V3(x1, 0.03, 0.0)], 0.0035, i % 2 ? cab2 : cab, 12, 5); }
  tube(g, [V3(-W / 2 - 0.01, 0.04, 0.05), V3(-W / 2 - 0.08, 0.01, 0.06), V3(-W / 2 - 0.05, 0.006, 0.16)], 0.004, cab, 16, 5);
  addTick(g, t => { setE(led, Math.sin(t * 4) > -0.6 ? 3 : 0.4); setE(ledB, 2.6 + Math.sin(t * 1.5)); });
  return g;
}

// ライブポスターとセットリスト（テープでとめた紙）
function posterMat(kind) {
  return texMat('poster' + kind, 360, 512, (ctx, w, h) => {
    if (kind === 0) {
      ctx.fillStyle = '#121012'; ctx.fillRect(0, 0, w, h);
      const gr = ctx.createRadialGradient(w / 2, h * 0.46, 10, w / 2, h * 0.46, w * 0.42); gr.addColorStop(0, '#ffb040'); gr.addColorStop(0.6, '#e0262e'); gr.addColorStop(1, '#5a0810');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(w / 2, h * 0.46, w * 0.36, 0, TAU); ctx.fill();
      // ギターのかげ
      ctx.save(); ctx.translate(w / 2, h * 0.5); ctx.rotate(-0.5); ctx.fillStyle = '#121012';
      ctx.beginPath(); ctx.ellipse(0, 50, 46, 56, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -4, 34, 40, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-7, -190, 14, 190); ctx.fillRect(-12, -226, 24, 40); ctx.restore();
      ctx.fillStyle = '#f4efe6'; ctx.textAlign = 'center'; ctx.font = FONT(70); ctx.fillText('LIVE', w / 2, 82);
      ctx.font = FONT(24, 700); ctx.fillStyle = '#ffb040'; ctx.fillText('ROOMIN TOUR 2026', w / 2, h - 58); ctx.fillStyle = '#ccc'; ctx.font = FONT(16, 700); ctx.fillText('OPEN 18:00 / START 18:30', w / 2, h - 30);
    } else if (kind === 1) {
      ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 14) { const r = 5.5 * (y / h); ctx.beginPath(); ctx.arc(x + (y / 14 % 2) * 7, y, r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f2c230'; ctx.fillRect(18, 40, w - 36, 150);
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = FONT(78); ctx.fillText('ROCK', w / 2, 112); ctx.font = FONT(58); ctx.fillText('FES', w / 2, 172);
      ctx.fillStyle = '#d4202c'; ctx.font = FONT(30); ctx.fillText('SAT · NIGHT', w / 2, 236);
      ctx.fillStyle = '#f2c230'; ctx.fillRect(18, h - 92, w - 36, 64); ctx.fillStyle = '#111'; ctx.font = FONT(22, 700); ctx.fillText('THE STUDY ROOMS', w / 2, h - 66); ctx.fillText('+ NEON KIDS', w / 2, h - 38);
    } else {
      ctx.fillStyle = '#e9e3d6'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b2a6a'; ctx.fillRect(0, 0, w, h * 0.55);
      ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 4;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(w / 2, h * 0.55, 30 + i * 22, PI, TAU); ctx.stroke(); }
      ctx.fillStyle = '#d4202c'; ctx.beginPath(); ctx.arc(w / 2, h * 0.55, 26, PI, TAU); ctx.fill();
      ctx.fillStyle = '#1b2a6a'; ctx.textAlign = 'center'; ctx.font = FONT(40); ctx.fillText('MIDNIGHT', w / 2, h * 0.68); ctx.fillText('SESSION', w / 2, h * 0.77);
      ctx.font = FONT(18, 700); ctx.fillStyle = '#d4202c'; ctx.fillText('ACOUSTIC & ELECTRIC', w / 2, h * 0.87);
    }
    // 紙の古び
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${h2(i, kind) * 0.06})`; ctx.fillRect(h2(i, 3) * w, h2(i, 4) * h, 2 + h2(i, 5) * 8, 1 + h2(i, 6) * 3); }
  }, { roughness: 0.85 });
}
function posterWall(s) {
  const g = new THREE.Group();
  const tape = cm('tape', () => std({ color: '#e8dcb8', roughness: 0.8, transparent: true, opacity: 0.85 }));
  const paper = (mat, w, h, x, y, rz, z = 0.004) => {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.z = rz; g.add(p);
    mk(p, cg('pp' + r4(w) + r4(h), () => new THREE.PlaneGeometry(w, h)), mat).castShadow = false;
    for (const [tx, ty, tr] of [[-w / 2 + 0.02, h / 2 - 0.01, 0.6], [w / 2 - 0.02, h / 2 - 0.01, -0.6], [-w / 2 + 0.02, -h / 2 + 0.01, -0.5], [w / 2 - 0.02, -h / 2 + 0.01, 0.5]]) mk(p, cg('tapeg', () => new THREE.PlaneGeometry(0.07, 0.022)), tape, tx, ty, 0.001, 0, 0, tr).castShadow = false;
  };
  paper(posterMat(0), 0.42, 0.6, -0.38, 0.04, 0.03);
  paper(posterMat(1), 0.4, 0.57, 0.08, 0.0, -0.035, 0.005);
  paper(posterMat(2), 0.3, 0.43, 0.46, 0.1, 0.05, 0.006);
  paper(setlistMat(), 0.2, 0.28, 0.43, -0.26, -0.08, 0.007);
  // ピック
  const pick = cg('pickg', () => { const sh = new THREE.Shape(); sh.moveTo(0, -0.016); sh.quadraticCurveTo(0.017, 0.006, 0.012, 0.013); sh.quadraticCurveTo(0, 0.019, -0.012, 0.013); sh.quadraticCurveTo(-0.017, 0.006, 0, -0.016); return new THREE.ShapeGeometry(sh, 6); });
  [['#d4202c', 0.24, -0.22, 0.4], ['#f2ece0', 0.29, -0.3, -0.3], ['#2a5ad0', 0.22, -0.34, 0.9]].forEach(([c, x, y, r]) => mk(g, pick, lacquer(c, 0.2), x, y, 0.009, 0, 0, r));
  // 裏の当たり（壁に付く面）
  mk(g, B(1.15, 0.86, 0.003, 0), cm('posterback', () => std({ color: '#000', transparent: true, opacity: 0, depthWrite: false })), 0, -0.02, 0.0015).castShadow = false;
  return g;
}

// 三脚のステージスポットライト（床置き）
function spotLamp(s) {
  const g = new THREE.Group();
  const M = MATTE_BLACK();
  tripodStand(g, 0, 0, 1.25, 0.34, M);
  rod(g, V3(0, 1.0, 0), V3(0, 1.3, 0), 0.012, CHROME());
  const yoke = new THREE.Group(); yoke.position.y = 1.36; g.add(yoke);
  mk(yoke, B(0.3, 0.02, 0.04, 0.006), M, 0, -0.06, 0);
  for (const sx of [-1, 1]) { mk(yoke, B(0.02, 0.14, 0.04, 0.006), M, sx * 0.14, 0, 0); mk(yoke, C(0.025, 0.025, 0.02, 14), CHROME(), sx * 0.16, 0.04, 0, 0, 0, PI / 2); }
  const head = new THREE.Group(); head.position.y = 0.04; head.rotation.x = 0.42; yoke.add(head);
  mk(head, LA([[0.001, -0.17], [0.07, -0.17], [0.11, -0.12], [0.12, 0.1], [0.125, 0.12], [0.12, 0.125]], 32), cm('spotbody', () => phys({ color: '#101012', metalness: 0.55, roughness: 0.32 })), 0, 0, 0, PI / 2);
  const bag = new Bag();
  for (let i = 0; i < 6; i++) bag.add(B(0.2, 0.004, 0.02, 0), 0, 0.09, -0.14 + i * 0.024, 0, 0, 0);
  bag.mesh(head, M);
  const lens = new THREE.MeshStandardMaterial({ color: '#2a2010', emissive: '#ffd9a0', emissiveIntensity: 3.5, roughness: 0.2 });
  mk(head, CIRC(0.105, 32), lens, 0, 0, 0.126).castShadow = false;
  // 四枚の羽根（バーンドア）
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Group(); f.rotation.z = k * PI / 2; head.add(f);
    const d = new THREE.Group(); d.position.set(0, 0.125, 0.13); d.rotation.x = -0.45; f.add(d);
    mk(d, B(0.2, 0.004, 0.13, 0.002), M, 0, 0, 0.065);
  }
  const bm = new THREE.Group(); bm.position.z = 0.13; bm.rotation.x = -PI / 2; head.add(bm);
  const beam = beamCone(bm, 1.3, 0.1, 0.34, '#ffd9a0', 0.35);
  // 床のケーブル
  tube(g, [V3(0.01, 1.3, -0.02), V3(0.02, 0.7, -0.03), V3(0.03, 0.3, -0.02), V3(0.1, 0.01, -0.1), V3(0.25, 0.006, -0.2)], 0.005, paintG('#0c0c0c', 0.5), 40, 5);
  addTick(g, t => { setE(lens, 3.3 + 0.2 * Math.sin(t * 1.1)); setE(beam.material, 0.34 + 0.04 * Math.sin(t * 1.1)); });
  setLight(g, 1.3, 1.0, '#ffd29a');
  return g;
}

// ジュークボックス（泡の管が色を変えて光る）
function jukebox(s) {
  const g = new THREE.Group();
  const W = 0.86, H = 1.5, D = 0.6, Wd = wood('rosewood');
  mk(g, B(W, 0.9, D, 0.02), Wd, 0, 0.45 + 0.04, 0);
  mk(g, B(W - 0.2, 0.08, D - 0.1, 0.02), paintG('#111', 0.5), 0, 0.04, 0);
  // アーチの上部（前から見て半円）
  const arch = new THREE.Shape(); arch.moveTo(-W / 2, 0); arch.lineTo(W / 2, 0); arch.absarc(0, 0, W / 2, 0, PI, false);
  mk(g, EX('jbarch', arch, D, 0.01), Wd, 0, 0.94, 0);
  // 光る管（アーチの内側にそって）
  const tubes = [];
  [0.4, 0.33].forEach((R, i) => {
    const m = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff4060', emissiveIntensity: 2.6, roughness: 0.2 });
    const pts = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * PI; pts.push(V3(Math.cos(a) * R, 0.94 + Math.sin(a) * R, D / 2 + 0.02)); }
    pts.unshift(V3(R, 0.35, D / 2 + 0.02)); pts.push(V3(-R, 0.35, D / 2 + 0.02));
    tube(g, pts, 0.022, m, 120, 10).castShadow = false;
    tubes.push(m);
  });
  mk(g, cg('jbwin', () => { const gg = new THREE.CircleGeometry(0.28, 48, 0, PI); return gg; }), cm('jbwinm', () => std({ color: '#1a120a', emissive: '#ffcc80', emissiveIntensity: 0.6, roughness: 0.3 })), 0, 0.98, D / 2 + 0.01);
  mk(g, cg('jbwin', () => new THREE.CircleGeometry(0.28, 48, 0, PI)), glassT('#ffffff', 0.12), 0, 0.98, D / 2 + 0.03);
  // レコードと腕
  mk(g, C(0.12, 0.12, 0.004, 40), paintG('#0b0b0b', 0.25), 0, 1.02, D / 2 + 0.0, PI / 2);
  mk(g, C(0.04, 0.04, 0.005, 24), paintG('#d03030', 0.5), 0, 1.02, D / 2 + 0.001, PI / 2);
  // 曲名パネルとクロームのグリル
  mk(g, B(0.56, 0.16, 0.01, 0.004), cm('jbsel', () => std({ color: '#fff4dc', emissive: '#ffe6b0', emissiveIntensity: 0.8, roughness: 0.5 })), 0, 0.84, D / 2 + 0.006);
  const bag = new Bag();
  for (let i = 0; i < 9; i++) bag.add(C(0.008, 0.008, 0.6, 8), 0, 0.3 + i * 0.045, D / 2 + 0.012, 0, 0, PI / 2);
  for (let i = 0; i < 6; i++) bag.add(B(0.012, 0.42, 0.02, 0.004), -0.25 + i * 0.1, 0.48, D / 2 + 0.008);
  bag.mesh(g, CHROME());
  for (const sx of [-1, 1]) mk(g, B(0.06, 0.8, 0.02, 0.008), cm('jbpil', () => std({ color: '#2a0a10', emissive: '#ff9a3a', emissiveIntensity: 1.2, roughness: 0.3 })), sx * (W / 2 - 0.02), 0.5, D / 2 + 0.02);
  mk(g, S(0.06, 20, 12), CHROME(), 0, 1.4, D / 2 - 0.05).scale.set(1.4, 0.6, 0.6);
  const sp = sparkles(g, (() => { const a = []; for (let k = 0; k < 40; k++) { const t = h2(k, 3) * PI, R = 0.4 - (k % 2) * 0.07; a.push(Math.cos(t) * R, 0.94 + Math.sin(t) * R, D / 2 + 0.045); } return a; })(), { size: 0.02, speed: 3, base: 0.0 });
  addTick(g, t => {
    tubes.forEach((m, i) => m.emissive.setHSL((t * 0.06 + i * 0.33) % 1, 1, 0.55));
    sp.material.uniforms.uTime.value = t;
  });
  setLight(g, 1.0, 0.8, '#ff8a6a');
  return g;
}

// ---------------- ゴシックシリーズ（黒檀・深紅のベルベット・鉄・ろうそく・ステンドグラス） ----------------
const EBONY = () => cm('ebony', () => phys({ color: '#ffffff', map: woodTex('ebony'), roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.15 }));
const CRIMSON = '#5c0d18';
// とがったアーチ（ゴシックアーチ）の形。幅 w、まっすぐな部分の高さ h、アーチの高さは w*0.85
function gothicArch(w, h, inset = 0) {
  const sh = new THREE.Shape();
  const r = w - inset * 2, x0 = -w / 2 + inset, x1 = w / 2 - inset, y0 = inset, y1 = h;
  sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1);
  sh.absarc(x0, y1, r, 0, Math.acos(0.5), false);
  sh.absarc(x1, y1, r, PI - Math.acos(0.5), PI, false);
  sh.lineTo(x0, y0);
  return sh;
}
// 小さな尖塔（ピナクル）
function pinnacle(g, x, y, z, h, mat) {
  mk(g, LA([[0.03, 0], [0.03, 0.04], [0.025, 0.05], [0.025, h * 0.4], [0.032, h * 0.45], [0.001, h]], 8), mat, x, y, z).rotation.y = PI / 8;
  const bag = new Bag();
  for (let i = 0; i < 4; i++) { const t = 0.55 + i * 0.1, a = i * PI / 2 + PI / 4; bag.add(S(0.01, 6, 4), x + Math.cos(a) * 0.03 * (1 - (t - 0.45) / 0.55), y + h * t, z + Math.sin(a) * 0.03 * (1 - (t - 0.45) / 0.55)); }
  bag.mesh(g, mat);
  mk(g, cg('fin', () => new THREE.OctahedronGeometry(0.018)), mat, x, y + h, z).scale.y = 1.6;
}
// 鉄の輪のシャンデリア（ろうそくが揺れる）
function gothChandelier(s) {
  const g = new THREE.Group();
  const I = IRON(), N = 8, R = 0.45, y = -0.95;
  mk(g, LA([[0.001, 0], [0.1, 0], [0.1, 0.012], [0.04, 0.035], [0.001, 0.04]], 24), I, 0, -0.04, 0);
  mk(g, T(0.03, 0.006, 6, 16), I, 0, -0.06, 0);
  // 鎖
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU, top = V3(0, -0.4, 0), bot = V3(Math.cos(a) * R, y, Math.sin(a) * R);
    const bag = new Bag();
    for (let k = 0; k < 14; k++) { const t = (k + 0.5) / 14, p = top.clone().lerp(bot, t); bag.add(T(0.016, 0.003, 3, 8), p.x, p.y, p.z, 0, a + (k % 2) * PI / 2, PI / 2 - Math.atan2(R, -y - 0.4) * 0); }
    bag.mesh(g, I);
  }
  const ch = new Bag(); for (let k = 0; k < 9; k++) ch.add(T(0.016, 0.003, 3, 8), 0, -0.07 - k * 0.036, 0, 0, (k % 2) * PI / 2, PI / 2); ch.mesh(g, I);
  mk(g, cg('fin', () => new THREE.OctahedronGeometry(0.018)), I, 0, -0.4, 0).scale.set(2, 2, 2);
  // 輪と飾り
  mk(g, T(R, 0.018, 8, 96), I, 0, y, 0, PI / 2);
  mk(g, T(R, 0.008, 6, 96), I, 0, y - 0.06, 0, PI / 2);
  const sc = new Bag();
  for (let i = 0; i < N * 2; i++) { const a = i / (N * 2) * TAU; sc.add(T(0.025, 0.004, 3, 12), Math.cos(a) * R, y - 0.03, Math.sin(a) * R, 0, -a + PI / 2, 0); }
  for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * TAU; sc.add(cg('fin', () => new THREE.OctahedronGeometry(0.018)), Math.cos(a) * R, y - 0.1, Math.sin(a) * R, 0, 0, 0, 0.6, 2.4, 0.6); }
  sc.mesh(g, I);
  const fl = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, x = Math.cos(a) * R, z = Math.sin(a) * R;
    mk(g, LA([[0.001, 0], [0.035, 0], [0.04, 0.012], [0.02, 0.012], [0.02, 0.03]], 12), I, x, y + 0.015, z);
    fl.push(candleWax(g, x, y + 0.04, z, 0.12 + h2(i, 9) * 0.06, 0.016, i * 1.3));
  }
  flameTick(g, fl);
  setLight(g, y + 0.2, 1.2, '#ffad5c');
  return g;
}
// ステンドグラスのバラ窓（壁）
function roseTex() {
  return canvasTex('rosewin', 512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    ctx.fillStyle = '#1a1414'; ctx.fillRect(0, 0, w, h);
    const pal = ['#b3122e', '#1d3fa8', '#e2a52a', '#1f7a4a', '#6a2a9a', '#d84a1a'];
    const Rn = rng(17);
    // 細かいガラス片
    for (let ring = 0; ring < 5; ring++) {
      const r0 = R * (0.12 + ring * 0.17), r1 = r0 + R * 0.17, n = 12 * (ring + 1);
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
        ctx.fillStyle = pal[(i + ring * 2 + (Rn() > 0.7 ? 1 : 0)) % pal.length];
        ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, TAU); ctx.fill();
    // 鉛の線
    ctx.strokeStyle = '#141010'; ctx.lineWidth = 3.5;
    for (let ring = 0; ring <= 5; ring++) { ctx.beginPath(); ctx.arc(cx, cy, R * (0.12 + ring * 0.17), 0, TAU); ctx.stroke(); }
    for (let ring = 0; ring < 5; ring++) { const n = 12 * (ring + 1), r0 = R * (0.12 + ring * 0.17), r1 = r0 + R * 0.17; for (let i = 0; i < n; i++) { const a = i / n * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); } }
    // ガラスのむら
    const im = ctx.getImageData(0, 0, w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4, f = 0.75 + 0.35 * vn(x / 14, y / 14, 1e6, 1e6, 4); d[k] *= f; d[k + 1] *= f; d[k + 2] *= f; }
    ctx.putImageData(im, 0, 0);
  });
}
function roseWindow(s) {
  const g = new THREE.Group();
  const R = 0.55;
  const stone = cm('gstone', () => phys({ color: '#8d867c', roughness: 0.85 }));
  mk(g, LA([[R - 0.02, 0], [R + 0.1, 0], [R + 0.12, 0.03], [R + 0.1, 0.08], [R + 0.02, 0.1], [R - 0.02, 0.08]], 96), stone, 0, 0, 0, PI / 2);
  const map = roseTex();
  const glassM = new THREE.MeshStandardMaterial({ color: '#ffffff', map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.3 });
  mk(g, cg('rosecir', () => new THREE.CircleGeometry(R, 96)), glassM, 0, 0, 0.04);
  // 石の飾り格子（花びら）
  const bag = new Bag();
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; bag.add(T(0.1, 0.012, 6, 24), Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, 0.05); bag.addM(new THREE.CylinderGeometry(0.012, 0.012, R * 0.42, 6), new THREE.Matrix4().makeRotationZ(a - PI / 2).setPosition(Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33, 0.05)); }
  bag.add(T(R * 0.22, 0.016, 6, 48), 0, 0, 0.05);
  bag.add(T(R * 0.97, 0.016, 6, 96), 0, 0, 0.05);
  bag.mesh(g, stone);
  const hl = halo(g, 2.0, 2.0, haloMat('#ff8a6a', 12, 0.4), 0, 0, 0.003);
  const beams = halo(g, 1.15, 1.15, haloMat('#ffe0b0', 24, 0.35), 0, 0, 0.06);
  addTick(g, t => {
    glassM.emissiveIntensity = 1.0 + 0.2 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 2.3);
    hl.material.uniforms.uTime.value = t * 0.5; beams.material.uniforms.uTime.value = t; beams.rotation.z = t * 0.05;
  });
  setLight(g, 0, 0.9, '#ff9a8a');
  return g;
}
// ゴシックの玉座
function gothThrone(s) {
  const g = new THREE.Group();
  const E = EBONY(), V = velvet(s.fabric || CRIMSON);
  const W = 0.72, D = 0.62;
  for (const [x, z] of [[-W / 2 + 0.05, -D / 2 + 0.05], [W / 2 - 0.05, -D / 2 + 0.05], [-W / 2 + 0.05, D / 2 - 0.05], [W / 2 - 0.05, D / 2 - 0.05]]) {
    mk(g, LA(smooth([[0.04, 0], [0.05, 0.03], [0.03, 0.1], [0.04, 0.2], [0.03, 0.32], [0.035, 0.38]], 16), 12, true), E, x, 0, z);
    mk(g, S(0.035, 10, 8), GOLD(), x, 0.015, z).scale.y = 0.5;
  }
  mk(g, B(W, 0.1, D, 0.015), E, 0, 0.42, 0);
  mk(g, B(W - 0.08, 0.1, D - 0.06, 0.04), V, 0, 0.5, 0.02);
  // 背もたれ（とがったアーチ）
  const BH = 1.0;
  mk(g, EX('thronBack', gothicArch(W, BH), 0.08, 0.008, 16), E, 0, 0.45, -D / 2 + 0.04);
  const inner = EX('thronIn', gothicArch(W - 0.14, BH - 0.06, 0), 0.03, 0.01, 16);
  mk(g, inner, V, 0, 0.52, -D / 2 + 0.09);
  // 背の前のボタン
  const bb = new Bag();
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3 - (j % 2); i++) bb.add(S(0.012, 8, 6), (i - (2 - (j % 2)) / 2) * 0.16, 0.65 + j * 0.2, -D / 2 + 0.115);
  bb.mesh(g, GOLD());
  // 柱と尖塔
  for (const sx of [-1, 1]) {
    mk(g, B(0.08, BH + 0.1, 0.1, 0.01), E, sx * (W / 2), 0.45 + (BH + 0.1) / 2, -D / 2 + 0.04);
    pinnacle(g, sx * W / 2, 0.45 + BH + 0.1, -D / 2 + 0.04, 0.32, E);
    // ひじ掛け
    mk(g, B(0.08, 0.05, D - 0.05, 0.015), E, sx * (W / 2 - 0.02), 0.72, 0.02);
    mk(g, B(0.07, 0.04, D - 0.12, 0.015), V, sx * (W / 2 - 0.02), 0.755, 0.0);
    mk(g, LA(smooth([[0.025, 0], [0.035, 0.05], [0.02, 0.12], [0.03, 0.2], [0.03, 0.25]], 10), 10, true), E, sx * (W / 2 - 0.02), 0.47, D / 2 - 0.06);
    mk(g, S(0.035, 12, 8), GOLD(), sx * (W / 2 - 0.02), 0.75, D / 2 - 0.03);
  }
  // てっぺんの飾りと赤い宝石
  const ay = 0.45 + BH + W * 0.86;
  pinnacle(g, 0, ay - 0.08, -D / 2 + 0.04, 0.3, E);
  const gm = new THREE.MeshPhysicalMaterial({ color: '#d0102a', emissive: '#ff1030', emissiveIntensity: 0.8, roughness: 0, flatShading: true, clearcoat: 1 });
  const jewel = mk(g, cg('jewel', () => new THREE.OctahedronGeometry(0.045, 0)), gm, 0, 0.45 + BH + 0.12, -D / 2 + 0.09);
  jewel.scale.set(1, 1.3, 0.6);
  mk(g, T(0.055, 0.008, 6, 24), GOLD(), 0, 0.45 + BH + 0.12, -D / 2 + 0.085);
  // 舞う火の粉
  const pts = shellPts(40, 0.2, 0.7, 31, -0.2).map((v, i) => (i % 3 === 1 ? v * 1.4 + 0.9 : v));
  const sp = sparkles(g, pts, { size: 0.02, colors: ['#ff6a3a', '#ffb04a', '#ff3050'], speed: 1.2, base: 0.1 });
  addTick(g, t => {
    gm.emissiveIntensity = 0.6 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.4), 3);
    sp.material.uniforms.uTime.value = t; sp.rotation.y = t * 0.08; sp.position.y = Math.sin(t * 0.3) * 0.05;
  });
  return g;
}
// 鉄の大きな燭台（床）
function candleTree(s) {
  const g = new THREE.Group();
  const I = IRON();
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; tube(g, [V3(0, 0.25, 0), V3(Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12), V3(Math.cos(a) * 0.24, 0.02, Math.sin(a) * 0.24), V3(Math.cos(a) * 0.28, 0.06, Math.sin(a) * 0.28)], 0.012, I, 20, 6); }
  rod(g, V3(0, 0.2, 0), V3(0, 1.35, 0), 0.016, I);
  for (const y of [0.3, 0.6, 0.95]) mk(g, S(0.035, 12, 8), I, 0, y, 0).scale.y = 0.7;
  const tops = [V3(0, 1.4, 0)];
  [[1.05, 0.34, 0], [1.2, 0.22, PI / 4]].forEach(([y, r, off]) => {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + off + (y > 1.1 ? PI / 3 : 0), x = Math.cos(a) * r, z = Math.sin(a) * r;
      tube(g, [V3(0, y - 0.1, 0), V3(x * 0.4, y - 0.14, z * 0.4), V3(x * 0.9, y - 0.06, z * 0.9), V3(x, y, z)], 0.008, I, 20, 6);
      // くるっと巻いた飾り
      const sp = []; for (let k = 0; k <= 12; k++) { const t = k / 12, b = t * 5; sp.push(V3(x * 0.55 + Math.cos(a) * Math.cos(b) * 0.03 * (1 - t), y - 0.17 + Math.sin(b) * 0.03 * (1 - t), z * 0.55 + Math.sin(a) * Math.cos(b) * 0.03 * (1 - t))); }
      tube(g, sp, 0.004, I, 20, 4);
      tops.push(V3(x, y, z));
    }
  });
  const fl = [];
  tops.forEach((p, i) => {
    mk(g, LA([[0.001, 0], [0.04, 0], [0.045, 0.012], [0.02, 0.012], [0.02, 0.025]], 12), I, p.x, p.y, p.z);
    fl.push(candleWax(g, p.x, p.y + 0.025, p.z, 0.16 + h2(i, 4) * 0.08, 0.016, i * 1.9));
  });
  flameTick(g, fl);
  setLight(g, 1.4, 1.1, '#ffad5c');
  return g;
}
// ゴシックの飾り棚（光る薬びん）
function gothCabinet(s) {
  const g = new THREE.Group();
  const E = EBONY(), W = 1.0, H = 1.9, D = 0.42;
  mk(g, B(W, 0.12, D, 0.01), E, 0, 0.06, 0);
  mk(g, B(W - 0.04, H - 0.12, 0.03, 0.005), E, 0, 0.06 + H / 2, -D / 2 + 0.015);
  for (const sx of [-1, 1]) mk(g, B(0.05, H, D, 0.008), E, sx * (W / 2 - 0.025), H / 2, 0);
  mk(g, B(W + 0.06, 0.06, D + 0.04, 0.01), E, 0, H + 0.03, 0.0);
  mk(g, B(W - 0.1, H - 0.2, 0.01, 0.002), cm('gcabin', () => std({ color: '#2a0f1a', roughness: 0.7 })), 0, H / 2 + 0.05, -D / 2 + 0.035);
  // 棚と薬びん
  const glowMats = [];
  const cols = ['#9a3cff', '#36ff8a', '#ff3a5a', '#3ac8ff'];
  [0.5, 0.95, 1.4].forEach((y, k) => {
    mk(g, B(W - 0.1, 0.02, D - 0.06, 0.004), E, 0, y, -0.01);
    for (let i = 0; i < 4; i++) {
      const c = cols[(i + k) % 4];
      const m = new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.05, transparent: true, opacity: 0.85 });
      m.userData.base = 1.2; m.userData.ph = i * 1.7 + k;
      glowMats.push(m);
      const x = -0.32 + i * 0.21, kind = ['round', 'gin', 'whisky', 'round'][(i + k) % 4];
      const pts = BOTTLES[kind].map(p => [p[0] * 0.9, p[1] * 0.9]);
      mk(g, LA(pts.slice(0, 5).map(p => [p[0] * 0.9, p[1]]).concat([[0.001, pts[4][1]]]), 14), m, x, y + 0.012, -0.02).castShadow = false;
      bottle(g, x, y + 0.01, -0.02, kind, '#d8d0e8', null, i % 2 ? 'cork' : 'gold', 0.9);
    }
  });
  // 扉（とがったアーチのガラス）
  for (const sx of [-1, 1]) {
    const fr = gothicArch(W / 2 - 0.06, H - 0.75);
    const hole = gothicArch(W / 2 - 0.06, H - 0.75, 0.04);
    fr.holes.push(new THREE.Path(hole.getPoints(24)));
    mk(g, EX('gdoor', fr, 0.03, 0.004, 16), E, sx * (W / 4 - 0.005), 0.14, D / 2 - 0.02);
    mk(g, EX('gdoorgl', gothicArch(W / 2 - 0.06, H - 0.75, 0.04), 0.004, 0, 16), glassT('#b8c0d0', 0.18), sx * (W / 4 - 0.005), 0.14, D / 2 - 0.02);
    mk(g, S(0.015, 10, 8), GOLD(), sx * 0.04, 0.95, D / 2);
  }
  for (const sx of [-1, 0, 1]) pinnacle(g, sx * (W / 2 - 0.03) * (sx ? 1 : 0), H + 0.06, 0.02, sx ? 0.25 : 0.35, E);
  const pts = []; for (let i = 0; i < 30; i++) pts.push((h2(i, 1) - 0.5) * (W - 0.2), 0.4 + h2(i, 2) * 1.2, (h2(i, 3) - 0.5) * 0.2);
  const sp = sparkles(g, pts, { size: 0.018, colors: ['#c79cff', '#9cffc8'], speed: 1.3, base: 0.05 });
  addTick(g, t => { for (const m of glowMats) m.emissiveIntensity = 0.7 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.1 + m.userData.ph)); sp.material.uniforms.uTime.value = t; });
  setLight(g, 1.0, 0.6, '#b07aff');
  return g;
}

// ---------------- 和の雅シリーズ（黒漆・金箔・朱・桜） ----------------
const URUSHI = () => lacquer('#0b0909', 0.12);
const SHU = () => lacquer('#a8261c', 0.2);
const GOLDLEAF = () => cm('goldleaf', () => phys({ color: '#e8bf62', metalness: 0.85, roughness: 0.35, map: canvasTex('gleaf', 256, 256, (ctx, w, h) => { pixels(ctx, w, h, (u, v, o) => { const sq = (Math.floor(u * 4) + Math.floor(v * 4)) % 2 ? 0.94 : 1; const f = (0.9 + 0.1 * vn(u * 40, v * 40, 40, 40, 2)) * sq; o[0] = 255 * f; o[1] = 240 * f; o[2] = 210 * f; }); }) }));
// 花びらの形
const PETAL = () => cg('petal', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.6, 0.3, 0.7, 0.9, 0.15, 1); sh.lineTo(0, 0.85); sh.lineTo(-0.15, 1); sh.bezierCurveTo(-0.7, 0.9, -0.6, 0.3, 0, 0); return new THREE.ShapeGeometry(sh, 2); });
const BLOSSOM = () => cg('blossom', () => {
  const parts = [];
  for (let i = 0; i < 5; i++) { const p = PETAL().clone(); p.rotateX(-1.1); p.rotateY(i / 5 * TAU); parts.push(p); }
  return mergeGeometries(parts.map(p => p.toNonIndexed()));
});
// 桜の木（花びらが舞う）
function sakuraTree(s) {
  const g = new THREE.Group();
  mk(g, LA(smooth([[0.001, 0], [0.32, 0], [0.36, 0.04], [0.36, 0.2], [0.34, 0.22]], 12), 6, true), URUSHI(), 0, 0, 0).rotation.y = PI / 6;
  mk(g, C(0.33, 0.33, 0.01, 6), paintG('#3a2e22', 1), 0, 0.215, 0).rotation.y = PI / 6;
  const R = rng(s.seed || 7);
  const bark = cm('sbark', () => std({ color: '#3a2a24', roughness: 0.9 }));
  const tips = [];
  const branch = (p, dir, len, r, depth) => {
    const pts = [p];
    let q = p.clone(), d = dir.clone();
    for (let i = 0; i < 4; i++) { d.add(V3((R() - 0.5) * 0.5, (R() - 0.3) * 0.3, (R() - 0.5) * 0.5)).normalize(); q = q.clone().addScaledVector(d, len / 4); pts.push(q); }
    tube(g, pts, r, bark, 12, 6);
    if (depth === 0) { tips.push(q); return; }
    const n = depth > 1 ? 3 : 2 + (R() > 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const nd = d.clone().add(V3((R() - 0.5) * 1.6, (R() - 0.2) * 0.8, (R() - 0.5) * 1.4)).normalize();
      branch(q, nd, len * 0.7, r * 0.62, depth - 1);
    }
    tips.push(q);
  };
  branch(V3(0, 0.2, 0), V3(0.1, 1, 0.05).normalize(), 0.75, 0.05, 3);
  // 花（雲のように）
  const list = [];
  for (const t of tips) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const v = V3(R() - 0.5, (R() - 0.35) * 0.8, R() - 0.5).normalize().multiplyScalar(0.06 + R() * 0.17);
      list.push(t.clone().add(v));
    }
  }
  const im = new THREE.InstancedMesh(BLOSSOM(), cm('sakura', () => std({ color: '#ffffff', emissive: '#ff9ab8', emissiveIntensity: 0.12, roughness: 0.6, side: THREE.DoubleSide })), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  list.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU));
    m.compose(p, q, V3(1, 1, 1).multiplyScalar(0.026 + R() * 0.014));
    im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(0.94 + R() * 0.04, 0.7, 0.82 + R() * 0.1));
  });
  im.castShadow = true; im.receiveShadow = true;
  g.add(im);
  // 舞う花びら
  const NF = 36;
  const fall = new THREE.InstancedMesh(PETAL(), cm('sakuraF', () => std({ color: '#ffc2d4', emissive: '#ff9ab8', emissiveIntensity: 0.15, side: THREE.DoubleSide, roughness: 0.6 })), NF);
  fall.castShadow = false; noRay(fall);
  const F = []; for (let i = 0; i < NF; i++) F.push({ x: (R() - 0.5) * 1.0, z: (R() - 0.5) * 0.9, ph: R(), sp: 0.12 + R() * 0.08, rot: R() * TAU });
  g.add(fall);
  const e = new THREE.Euler();
  const upd = t => {
    for (let i = 0; i < NF; i++) {
      const f = F[i], k = (f.ph + t * f.sp * 0.25) % 1;
      const y = 1.55 - k * 1.3;
      e.set(t * 1.3 + f.rot, t * 0.7 + f.rot, Math.sin(t + f.rot));
      q.setFromEuler(e);
      m.compose(V3(f.x + Math.sin(t * 0.9 + f.rot) * 0.08 + k * 0.15, y, f.z + Math.cos(t * 0.7 + f.rot) * 0.06), q, V3(0.02, 0.02, 0.02));
      fall.setMatrixAt(i, m);
    }
    fall.instanceMatrix.needsUpdate = true;
  };
  upd(0);
  addTick(g, upd);
  return g;
}
// 金屏風（波と鶴）
function byobuTex() {
  return canvasTex('byobu', 1536, 640, (ctx, w, h) => {
    // 金箔のます目
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { const f = 0.9 + h2(x, y) * 0.12; ctx.fillStyle = `rgb(${232 * f},${190 * f},${100 * f})`; ctx.fillRect(x, y, 64, 64); }
    // 金の雲（すやり霞）
    ctx.fillStyle = 'rgba(255,236,170,0.55)';
    for (const [x, y, l] of [[150, 90, 520], [820, 70, 600], [500, 420, 520], [1100, 360, 380]]) { ctx.beginPath(); ctx.roundRect(x, y, l, 50, 25); ctx.fill(); ctx.beginPath(); ctx.roundRect(x + 60, y + 30, l * 0.7, 46, 23); ctx.fill(); }
    // 波
    ctx.lineWidth = 6;
    for (let k = 0; k < 7; k++) {
      ctx.strokeStyle = k % 2 ? '#1f3d73' : '#2b5aa0';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) { const y = h * 0.62 + k * 26 + Math.sin(x / 90 + k) * 18 + Math.sin(x / 33 + k * 2) * 6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,60,120,0.85)'; ctx.fillRect(0, h * 0.62 + 7 * 26, w, h);
    // 鶴
    const crane = (x, y, s, f) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(s * f, s);
      ctx.fillStyle = '#fbfaf6'; ctx.beginPath(); ctx.ellipse(0, 0, 40, 14, -0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -5); ctx.quadraticCurveTo(-40, -70, -90, -60); ctx.quadraticCurveTo(-40, -40, 10, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -5); ctx.quadraticCurveTo(50, -80, 100, -70); ctx.quadraticCurveTo(50, -40, 20, 0); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(-90, -60); ctx.quadraticCurveTo(-70, -60, -60, -50); ctx.lineTo(-75, -55); ctx.fill();
      ctx.beginPath(); ctx.moveTo(100, -70); ctx.quadraticCurveTo(85, -68, 78, -58); ctx.lineTo(90, -62); ctx.fill();
      ctx.strokeStyle = '#fbfaf6'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(35, -5); ctx.quadraticCurveTo(60, -15, 70, -30); ctx.stroke();
      ctx.fillStyle = '#c8241c'; ctx.beginPath(); ctx.arc(70, -32, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-35, 5); ctx.lineTo(-75, 15); ctx.moveTo(-35, 8); ctx.lineTo(-75, 22); ctx.stroke();
      ctx.restore();
    };
    crane(380, 250, 1.1, 1); crane(980, 190, 0.9, -1); crane(1250, 290, 0.7, 1);
    // 赤い太陽
    ctx.fillStyle = '#c8241c'; ctx.beginPath(); ctx.arc(1320, 130, 70, 0, TAU); ctx.fill();
  });
}
function byobu(s) {
  const g = new THREE.Group();
  const N = 6, PW = 0.32, H = 1.5, ang = 0.42;
  const map = byobuTex();
  const gold = cm('byobuM', () => phys({ color: '#ffffff', map, metalness: 0.55, roughness: 0.32, emissive: '#3a2a10', emissiveIntensity: 0.25 }));
  let x = -N * PW * Math.cos(ang) / 2, z = 0;
  const glitter = [];
  for (let i = 0; i < N; i++) {
    const a = i % 2 ? -ang : ang;
    const dx = Math.cos(a) * PW, dz = Math.sin(a) * PW;
    const pnl = new THREE.Group(); pnl.position.set(x + dx / 2, 0, z + dz / 2); pnl.rotation.y = -a; g.add(pnl);
    const geo = cg('byP' + i, () => { const gg = new THREE.PlaneGeometry(PW - 0.03, H - 0.08); const uv = gg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / N); return gg; });
    mk(pnl, geo, gold, 0, H / 2 + 0.04, 0.012);
    mk(pnl, B(PW - 0.02, H - 0.07, 0.02, 0.002), paintG('#5b3a20', 0.8), 0, H / 2 + 0.04, 0);
    for (const sy of [0.025, H + 0.015]) mk(pnl, B(PW, 0.03, 0.03, 0.004), URUSHI(), 0, sy, 0);
    for (const sx of [-1, 1]) mk(pnl, B(0.015, H + 0.04, 0.03, 0.003), URUSHI(), sx * (PW / 2 - 0.0075), H / 2 + 0.02, 0);
    for (let k = 0; k < 8; k++) { const p = V3((h2(i, k) - 0.5) * PW, 0.2 + h2(k, i) * (H - 0.3), 0.02).applyEuler(pnl.rotation).add(pnl.position); glitter.push(p.x, p.y, p.z); }
    x += dx; z += dz;
  }
  // 飾り金具
  const sp = sparkles(g, glitter, { size: 0.035, colors: ['#fff2c0', '#ffffff'], speed: 1.1, base: 0.0 });
  addTick(g, t => { sp.material.uniforms.uTime.value = t; gold.emissiveIntensity = 0.22 + 0.06 * Math.sin(t * 0.8); });
  return g;
}
// 行灯（あんどん）
function andonTex() {
  return canvasTex('andon', 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f7efdc'; ctx.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(180,150,100,${R() * 0.06})`; ctx.fillRect(R() * w, R() * h, 1 + R() * 4, 1); }
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 5;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(i * w / 3, 0); ctx.lineTo(i * w / 3, h); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
    // 桜の影
    ctx.fillStyle = 'rgba(80,40,40,0.35)';
    for (let i = 0; i < 12; i++) { const x = 40 + R() * 180, y = 300 + R() * 180; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 0, TAU); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(60,30,30,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 470); ctx.quadraticCurveTo(120, 380, 240, 320); ctx.stroke();
  });
}
function andon(s) {
  const g = new THREE.Group();
  const U = URUSHI(), W = 0.32, H = 0.85;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, B(0.03, H, 0.03, 0.004), U, sx * W / 2, H / 2, sz * W / 2);
  for (const y of [0.1, H - 0.02]) for (const r of [0, 1]) { mk(g, B(W + 0.03, 0.025, 0.025, 0.004), U, 0, y, (r ? 1 : -1) * W / 2); mk(g, B(0.025, 0.025, W + 0.03, 0.004), U, (r ? 1 : -1) * W / 2, y, 0); }
  mk(g, B(W, 0.012, W, 0.002), U, 0, 0.1, 0);
  const map = andonTex();
  const paper = new THREE.MeshStandardMaterial({ color: '#ffffff', map, emissive: '#ffcf8a', emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.9, side: THREE.DoubleSide });
  const pg = cg('andonP', () => new THREE.PlaneGeometry(W - 0.02, H - 0.16));
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; mk(g, pg, paper, Math.sin(a) * (W / 2 - 0.004), 0.1 + (H - 0.12) / 2, Math.cos(a) * (W / 2 - 0.004), 0, a, 0).castShadow = false; }
  // 取っ手
  rod(g, V3(-W / 2, H, 0), V3(-0.05, H + 0.12, 0), 0.01, U); rod(g, V3(W / 2, H, 0), V3(0.05, H + 0.12, 0), 0.01, U); rod(g, V3(-0.05, H + 0.12, 0), V3(0.05, H + 0.12, 0), 0.01, U);
  const fl = [candleWax(g, 0, 0.11, 0, 0.12, 0.018, 0.5, '#f4ece0')];
  paper.userData.base = 1.1;
  flameTick(g, fl, [paper]);
  setLight(g, 0.4, 0.9, '#ffbe7a');
  return g;
}
// つくばい（竹の筧から水が流れる）
function tsukubai(s) {
  const g = new THREE.Group();
  const stone = cm('tstone', () => std({ color: '#ffffff', map: canvasTex('granite', 256, 256, (ctx, w, h) => pixels(ctx, w, h, (u, v, o) => { const n = fbm(u * 8, v * 8, 8, 8, 4, 3), sp = h2(u * 256, v * 256) > 0.93 ? 0.5 : 1; const c = mixRGB([120, 118, 112], [70, 68, 64], n) ; o[0] = c[0] * sp; o[1] = c[1] * sp; o[2] = c[2] * sp; })), roughness: 0.85 }));
  // 玉砂利の床
  mk(g, C(0.55, 0.58, 0.04, 48), paintG('#d8d2c6', 1), 0, 0.02, 0);
  const R = rng(4);
  const peb = new THREE.InstancedMesh(cg('pebble', () => new THREE.IcosahedronGeometry(0.02, 0)), cm('pebm', () => std({ color: '#ffffff', roughness: 0.6 })), 160);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < 160; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 0.54; q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, 0)); m.compose(V3(Math.cos(a) * r, 0.045, Math.sin(a) * r), q, V3(1 + R(), 0.6, 1 + R() * 0.5)); peb.setMatrixAt(i, m); peb.setColorAt(i, c.setHSL(0.08, 0.06, 0.4 + R() * 0.3)); }
  peb.receiveShadow = true; g.add(peb);
  // 石の手水鉢
  const bowl = smooth([[0.001, 0.02], [0.24, 0.02], [0.27, 0.12], [0.26, 0.3], [0.24, 0.34], [0.17, 0.34], [0.15, 0.27], [0.001, 0.25]], 24);
  const bm = mk(g, LA(bowl, 40), stone, 0.05, 0.03, 0.05);
  bm.geometry = cg('bowlrough', () => { const gg = LA(bowl, 40).clone(); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + n3(x * 8, y * 8, z * 8, 2) * 0.05; p.setXYZ(i, x * k, y, z * k); } gg.computeVertexNormals(); return gg; });
  const pool = poolMat('#1d5a6a', 7);
  mk(g, cg('tpool', () => new THREE.CircleGeometry(0.165, 40).rotateX(-PI / 2)), pool, 0.05, 0.32, 0.05);
  // 苔
  const moss = cm('moss', () => std({ color: '#4d6b2a', roughness: 1 }));
  for (let i = 0; i < 9; i++) { const a = R() * TAU; mk(g, S(0.06, 10, 6), moss, Math.cos(a) * 0.4, 0.04, Math.sin(a) * 0.4).scale.set(1 + R(), 0.35, 1 + R()); }
  // 竹の筧
  const bam = cm('bamboo', () => phys({ color: '#8d9a4a', roughness: 0.35, clearcoat: 0.6 }));
  const node = paintG('#6d7a35', 0.5);
  for (const [x, h] of [[-0.42, 0.62], [-0.3, 0.52]]) { mk(g, C(0.022, 0.024, h, 14), bam, x, h / 2, -0.32); for (let k = 1; k < 4; k++) mk(g, T(0.024, 0.004, 4, 16), node, x, h * k / 4, -0.32, PI / 2); }
  const pipe = new THREE.Group(); pipe.position.set(-0.42, 0.56, -0.32); pipe.rotation.y = -0.75; g.add(pipe);
  mk(pipe, C(0.018, 0.018, 0.55, 14), bam, 0.27, 0, 0, 0, 0, PI / 2 - 0.08);
  for (let k = 1; k < 3; k++) mk(pipe, T(0.019, 0.004, 4, 16), node, k * 0.18, 0.01 * (1.5 - k), 0, 0, PI / 2, 0);
  const tip = V3(0.54, -0.02, 0).applyEuler(pipe.rotation).add(pipe.position);
  // 水の流れ
  const wf = fallMat('#bfe6f2', 0.75, 6);
  const sg = cg('stream', () => { const gg = new THREE.CylinderGeometry(0.006, 0.01, 1, 8, 1, true); gg.translate(0, -0.5, 0); return gg; });
  const fall = noRay(new THREE.Mesh(sg, wf)); fall.position.copy(tip); fall.scale.y = tip.y - 0.32; g.add(fall);
  // ひしゃく
  mk(g, C(0.035, 0.032, 0.05, 16, true), cm('hishaku', () => phys({ color: '#d8c49a', roughness: 0.6, side: THREE.DoubleSide })), 0.18, 0.37, -0.03);
  rod(g, V3(0.15, 0.37, -0.03), V3(-0.15, 0.35, 0.1), 0.005, cm('hishaku', () => phys({ color: '#d8c49a', roughness: 0.6, side: THREE.DoubleSide })));
  const spl = sparkles(g, [tip.x, 0.33, tip.z, tip.x + 0.02, 0.335, tip.z + 0.01, tip.x - 0.02, 0.33, tip.z - 0.01, 0.05, 0.33, 0.05, 0.1, 0.33, 0.1], { size: 0.03, speed: 4, base: 0.0 });
  addTick(g, t => { wf.uniforms.uTime.value = t; pool.uniforms.uTime.value = t; spl.material.uniforms.uTime.value = t; });
  return g;
}
// 黒漆の座卓（金の蒔絵）と湯気の立つお茶
function makieTex() {
  return canvasTex('makie', 1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#0a0808'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d9a84a'; ctx.lineWidth = 4;
    // 流水
    for (let k = 0; k < 5; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 8) { const y = h * 0.75 + k * 14 + Math.sin(x / 70 + k * 0.7) * 22; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    // 桜の花
    const fl = (x, y, r) => { ctx.fillStyle = '#e6b85a'; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - PI / 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, r * 0.32, a, 0, TAU); ctx.fill(); } ctx.fillStyle = '#a8261c'; ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, TAU); ctx.fill(); };
    const R = rng(8);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(60, 80); ctx.quadraticCurveTo(300, 200, 520, 120); ctx.quadraticCurveTo(700, 70, 900, 180); ctx.stroke();
    for (let i = 0; i < 16; i++) fl(80 + R() * 840, 60 + R() * 200, 16 + R() * 14);
    ctx.fillStyle = 'rgba(230,190,100,0.35)'; for (let i = 0; i < 900; i++) ctx.fillRect(R() * w, R() * h * 0.6, 2, 2);
    ctx.strokeStyle = '#d9a84a'; ctx.lineWidth = 8; ctx.strokeRect(14, 14, w - 28, h - 28);
  });
}
function lacquerTable(s) {
  const g = new THREE.Group();
  const W = 1.05, D = 0.68, H = 0.33;
  const top = cm('makieM', () => phys({ color: '#ffffff', map: makieTex(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, metalness: 0.2 }));
  const geo = cg('lqTop', () => { const gg = new RoundedBoxGeometry(W, 0.035, D, 2, 0.012); const uv = gg.attributes.uv, p = gg.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, 0.5 - p.getZ(i) / D); return gg; });
  mk(g, geo, top, 0, H - 0.0175, 0);
  mk(g, B(W - 0.02, 0.04, D - 0.02, 0.006), SHU(), 0, H - 0.05, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mk(g, B(0.06, H - 0.05, 0.06, 0.008), URUSHI(), sx * (W / 2 - 0.06), (H - 0.05) / 2, sz * (D / 2 - 0.06));
    mk(g, B(0.065, 0.02, 0.065, 0.004), GOLD(), sx * (W / 2 - 0.06), 0.01, sz * (D / 2 - 0.06));
  }
  // 鉄瓶と湯のみ
  const iron = cm('tetsu', () => std({ color: '#2a2725', roughness: 0.7, metalness: 0.5 }));
  mk(g, LA(smooth([[0.001, 0], [0.07, 0.0], [0.095, 0.04], [0.09, 0.09], [0.05, 0.11], [0.02, 0.115]], 16), 24), iron, 0.2, H, -0.08);
  mk(g, S(0.015, 8, 6), iron, 0.2, H + 0.125, -0.08);
  tube(g, [V3(0.13, H + 0.08, -0.08), V3(0.2, H + 0.22, -0.08), V3(0.27, H + 0.08, -0.08)], 0.005, iron, 16, 5);
  tube(g, [V3(0.28, H + 0.05, -0.08), V3(0.33, H + 0.08, -0.07), V3(0.35, H + 0.1, -0.06)], 0.009, iron, 10, 6);
  mk(g, LA([[0.04, 0], [0.12, 0], [0.12, 0.012]], 4), cm('trivet', () => std({ color: '#3a2a1c', roughness: 0.8 })), 0.2, H - 0.003, -0.08).rotation.y = PI / 4;
  const cup = smooth([[0.001, 0], [0.025, 0], [0.033, 0.01], [0.04, 0.06], [0.036, 0.06], [0.03, 0.012], [0.001, 0.012]], 12);
  const raku = cm('raku', () => phys({ color: '#3a4a3a', roughness: 0.3, clearcoat: 0.8 }));
  for (const [x, z] of [[-0.12, 0.1], [0.02, 0.14]]) { mk(g, LA(cup, 20), raku, x, H, z); mk(g, C(0.034, 0.034, 0.003, 20), liquid('#8aa63a', 0.9), x, H + 0.045, z); }
  const st = [steam(g, -0.12, H + 0.05, 0.1, 14, 0.22), steam(g, 0.02, H + 0.05, 0.14, 14, 0.22), steam(g, 0.35, H + 0.1, -0.06, 16, 0.28)];
  const sp = sparkles(g, (() => { const a = []; for (let i = 0; i < 24; i++) a.push((h2(i, 7) - 0.5) * W * 0.9, H + 0.005, (h2(i, 8) - 0.5) * D * 0.9); return a; })(), { size: 0.02, colors: ['#ffe6a0'], speed: 1, base: 0.0 });
  addTick(g, t => { for (const p of st) p.material.uniforms.uTime.value = t; sp.material.uniforms.uTime.value = t; });
  return g;
}


// ---------------- ★5 恒常：どの部屋にもなじむ、最上級の定番 ----------------
// クリスタルのシャンデリア（天井）
function crystalChandelier(s) {
  const g = new THREE.Group();
  const M = s.mat === 'silver' ? SILVER() : GOLD();
  mk(g, LA([[0.001, 0], [0.12, 0], [0.125, 0.015], [0.09, 0.04], [0.02, 0.06], [0.001, 0.06]], 32), M, 0, -0.06, 0);
  // 中心の柱（ろくろの飾り）
  const stem = smooth([[0.012, 0], [0.03, 0.04], [0.05, 0.1], [0.02, 0.16], [0.018, 0.3], [0.04, 0.36], [0.07, 0.42], [0.03, 0.48], [0.016, 0.62], [0.03, 0.7], [0.012, 0.76]], 50);
  mk(g, LA(stem, 24), M, 0, -0.98, 0);
  mk(g, cg('cball', () => new THREE.IcosahedronGeometry(0.06, 1)), PRISM(), 0, -1.02, 0);
  const tiers = [[8, 0.42, -0.86, 0.1], [6, 0.24, -0.6, 0.07]];
  const cups = [], drops = [], beads = [];
  for (const [n, R, y, rise] of tiers) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, c = Math.cos(a), sn = Math.sin(a);
      tube(g, [V3(c * 0.04, y - 0.08, sn * 0.04), V3(c * R * 0.4, y - 0.12, sn * R * 0.4), V3(c * R * 0.85, y - 0.06, sn * R * 0.85), V3(c * R, y + rise * 0.3, sn * R)], 0.008, M, 24, 6);
      const p = V3(c * R, y + rise * 0.3, sn * R);
      cups.push(p);
      // 雫のクリスタル（3つ連なり）
      for (let k = 0; k < 5; k++) drops.push([p.x, p.y - 0.05 - k * 0.042, p.z, k === 4 ? 1.7 : 0.8]);
      for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) drops.push([p.x * 0.88 - sd * sn * 0.04, p.y - 0.06 - k * 0.04, p.z * 0.88 + sd * c * 0.04, k === 2 ? 1.4 : 0.7]);
    }
    // 腕のあいだのガーランド
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
      for (let k = 1; k < 13; k++) {
        const t = k / 13, a = a0 + (a1 - a0) * t, sag = Math.sin(PI * t) * 0.09;
        beads.push([Math.cos(a) * R * 0.98, y + rise * 0.3 - 0.03 - sag, Math.sin(a) * R * 0.98]);
      }
    }
  }
  // 中心から下がるクリスタルの房
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; for (let k = 0; k < 4; k++) beads.push([Math.cos(a) * (0.09 - k * 0.012), -1.0 - k * 0.04, Math.sin(a) * (0.09 - k * 0.012)]); drops.push([Math.cos(a) * 0.04, -1.18, Math.sin(a) * 0.04, 1.2]); }
  const crys = new THREE.Group(); g.add(crys);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const dm = new THREE.InstancedMesh(cg('prismDrop', () => new THREE.OctahedronGeometry(0.022, 0)), PRISM(), drops.length);
  drops.forEach(([x, y, z, k], i) => { q.setFromEuler(new THREE.Euler(0, i, 0)); m4.compose(V3(x, y, z), q, V3(1, 1.8 * k, 1)); dm.setMatrixAt(i, m4); });
  const bm = new THREE.InstancedMesh(cg('prismBead', () => new THREE.OctahedronGeometry(0.012, 0)), PRISM(), beads.length);
  beads.forEach(([x, y, z], i) => { m4.compose(V3(x, y, z), q.setFromEuler(new THREE.Euler(i, i * 2, 0)), V3(1, 1, 1)); bm.setMatrixAt(i, m4); });
  crys.add(dm, bm);
  // 燭台と電球（ろうそく形）
  for (const p of cups) {
    mk(g, LA([[0.001, 0], [0.03, 0], [0.04, 0.02], [0.035, 0.022], [0.016, 0.01], [0.016, 0.03]], 16), M, p.x, p.y, p.z);
    mk(g, C(0.012, 0.012, 0.08, 12), paintG('#f8f3ea', 0.4), p.x, p.y + 0.06, p.z);
    mk(g, LA(smooth([[0.001, 0], [0.012, 0.01], [0.01, 0.03], [0.001, 0.05]], 8), 10), BULB(), p.x, p.y + 0.1, p.z).castShadow = false;
  }
  const pts = []; for (const d of drops) pts.push(d[0], d[1], d[2]); for (let i = 0; i < beads.length; i += 3) pts.push(...beads[i]);
  const sp = sparkles(g, pts, { size: 0.045, colors: ['#ffffff', '#fff1d0', '#d8ecff', '#ffd8f0'], speed: 2.4, base: 0.05 });
  addTick(g, t => { sp.material.uniforms.uTime.value = t; crys.rotation.y = Math.sin(t * 0.4) * 0.015; });
  setLight(g, -0.8, 2, '#ffd9a8');
  return g;
}
// キャメルレザーのソファ（ブランケットつき）
function leatherSofa(s) {
  const g = new THREE.Group();
  const L = leather(s.fabric || '#8a4a22'), W = 2.3, D = 0.98;
  mk(g, B(W, 0.12, D, 0.02), wood('walnut'), 0, 0.17, 0);
  for (const [x, z] of [[-W / 2 + 0.08, -D / 2 + 0.08], [W / 2 - 0.08, -D / 2 + 0.08], [-W / 2 + 0.08, D / 2 - 0.08], [W / 2 - 0.08, D / 2 - 0.08]]) rod(g, V3(x, 0, z), V3(x, 0.12, z), 0.012, BRASS(), 0.02);
  mk(g, B(W, 0.14, D, 0.05), L, 0, 0.3, 0);
  mk(g, B(W, 0.42, 0.2, 0.06), L, 0, 0.55, -D / 2 + 0.1);
  for (const sx of [-1, 1]) mk(g, B(0.2, 0.32, D, 0.07), L, sx * (W / 2 - 0.1), 0.52, 0);
  const n = 3, cw = (W - 0.42) / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.21 + cw * (i + 0.5);
    mk(g, B(cw - 0.01, 0.15, D - 0.26, 0.06), L, x, 0.44, 0.08);
    mk(g, B(cw - 0.02, 0.44, 0.16, 0.07), L, x, 0.7, -D / 2 + 0.27, -0.18, 0, 0);
  }
  // ブランケット（ひじ掛けにかける）
  const ax = W / 2 - 0.2;
  const blanket = cg('blanket' + r4(W), () => {
    const gg = new THREE.PlaneGeometry(1, 1, 12, 36); const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i) + 0.5;
      let x, y;
      if (v < 0.3) { x = ax - 0.02; y = 0.53 + v / 0.3 * 0.17; } else if (v < 0.55) { x = ax - 0.02 + (v - 0.3) / 0.25 * 0.24; y = 0.7 + Math.sin((v - 0.3) / 0.25 * PI) * 0.015; } else { x = ax + 0.22; y = 0.7 - (v - 0.55) / 0.45 * 0.42; }
      p.setXYZ(i, x + Math.sin(u * 20 + v * 3) * 0.008 * (v > 0.55 ? 1 : 0.3), y, 0.12 + u * 0.55 + Math.sin(v * 25) * 0.006);
    }
    gg.computeVertexNormals(); return gg;
  });
  const knit = cm('knit', () => phys({ color: '#d9cdb8', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), bumpMap: boucleTex(), bumpScale: 2, side: THREE.DoubleSide }));
  mk(g, blanket, knit, 0, 0, 0);
  mk(g, B(0.44, 0.42, 0.14, 0.07), velvet('#2f4a3c'), -W / 2 + 0.45, 0.76, -0.2, -0.25, 0.25, 0);
  mk(g, B(0.4, 0.38, 0.13, 0.06), cloth('#e8dcc4'), -W / 2 + 0.8, 0.74, -0.18, -0.25, -0.1, 0);
  return g;
}
// 大理石の暖炉（炎がゆらめく）
function fireplace(s) {
  const g = new THREE.Group();
  const M = marble(s.marble || 'gold'), W = 1.5, H = 1.15, D = 0.38;
  mk(g, B(W + 0.3, 0.05, D + 0.25, 0.01), M, 0, 0.025, 0.1);
  for (const sx of [-1, 1]) {
    mk(g, B(0.3, H - 0.1, D, 0.01), M, sx * (W / 2 - 0.15), 0.05 + (H - 0.1) / 2, 0);
    mk(g, B(0.22, H - 0.25, 0.04, 0.008), M, sx * (W / 2 - 0.15), 0.12 + (H - 0.25) / 2, D / 2 + 0.02);
    mk(g, LA([[0.07, 0], [0.07, 0.02], [0.05, 0.04], [0.04, 0.05]], 16), GOLD(), sx * (W / 2 - 0.15), 0.06, D / 2 + 0.06);
  }
  mk(g, B(W - 0.6, 0.28, D, 0.01), M, 0, H - 0.19, 0);
  mk(g, B(W - 0.55, 0.06, 0.03, 0.008), GOLD(), 0, H - 0.28, D / 2 + 0.012);
  mk(g, B(W + 0.16, 0.06, D + 0.12, 0.012), M, 0, H + 0.03, 0.04);
  mk(g, B(W + 0.08, 0.04, D + 0.08, 0.01), M, 0, H - 0.02, 0.03);
  // 火室（すすで黒い）
  const soot = paintG('#121010', 0.9);
  mk(g, B(W - 0.6, H - 0.33, 0.02, 0), soot, 0, 0.05 + (H - 0.33) / 2, -D / 2 + 0.01);
  for (const sx of [-1, 1]) mk(g, B(0.02, H - 0.33, D, 0), soot, sx * (W / 2 - 0.31), 0.05 + (H - 0.33) / 2, 0);
  mk(g, B(W - 0.6, 0.02, D, 0), soot, 0, 0.06, 0);
  // 薪と炎
  const bark = cm('logbark', () => std({ color: '#3a2a1e', roughness: 0.95 }));
  const ember = new THREE.MeshStandardMaterial({ color: '#2a0d04', emissive: '#ff4a10', emissiveIntensity: 1.5, roughness: 0.8 });
  mk(g, C(0.05, 0.05, 0.6, 12), bark, -0.02, 0.14, 0.0, 0, 0.15, PI / 2);
  mk(g, C(0.045, 0.045, 0.55, 12), bark, 0.04, 0.14, -0.08, 0, -0.1, PI / 2);
  mk(g, C(0.04, 0.04, 0.5, 12), bark, 0.0, 0.22, -0.04, 0.4, 0.5, PI / 2);
  mk(g, B(0.5, 0.03, 0.22, 0.01), ember, 0, 0.09, 0).castShadow = false;
  // 鉄の薪台
  for (const sx of [-1, 1]) { rod(g, V3(sx * 0.2, 0.07, 0.12), V3(sx * 0.2, 0.07, -0.12), 0.01, IRON()); mk(g, S(0.025, 10, 8), BRASS(), sx * 0.2, 0.12, 0.13); }
  const fl = [];
  const R = rng(3);
  for (let i = 0; i < 7; i++) fl.push(flame(g, -0.22 + i * 0.075, 0.17, -0.02 + (R() - 0.5) * 0.1, 0.05 + R() * 0.03, 0.22 + R() * 0.15, i * 1.3, 1.2));
  const sparks = sparkles(g, (() => { const a = []; for (let i = 0; i < 25; i++) a.push((R() - 0.5) * 0.5, 0.2 + R() * 0.4, (R() - 0.5) * 0.15); return a; })(), { size: 0.018, colors: ['#ffb04a', '#ff7a2a'], speed: 3, base: 0.0 });
  // 真ちゅうのフェンダーと、上の飾り
  tube(g, [V3(-0.5, 0.1, 0.25), V3(-0.45, 0.1, 0.33), V3(0.45, 0.1, 0.33), V3(0.5, 0.1, 0.25)], 0.012, BRASS(), 24, 8);
  for (const sx of [-1, 1]) { mk(g, LA(smooth([[0.04, 0], [0.04, 0.01], [0.015, 0.04], [0.012, 0.18], [0.025, 0.2]], 12), 16), GOLD(), sx * 0.6, H + 0.06, 0.05); candleWax(g, sx * 0.6, H + 0.26, 0.05, 0.12, 0.012, sx + 2); }
  mk(g, cg('clockface', () => new THREE.CircleGeometry(0.07, 32)), paintG('#f6f0e2', 0.4), 0, H + 0.2, 0.087);
  mk(g, T(0.075, 0.008, 6, 32), GOLD(), 0, H + 0.2, 0.087);
  rod(g, V3(0, H + 0.2, 0.09), V3(0.03, H + 0.24, 0.09), 0.002, paintG('#111', 0.5)); rod(g, V3(0, H + 0.2, 0.09), V3(-0.045, H + 0.2, 0.09), 0.002, paintG('#111', 0.5));
  mk(g, B(0.22, 0.24, 0.07, 0.02), wood('walnut'), 0, H + 0.18, 0.05);
  mk(g, B(0.26, 0.03, 0.1, 0.006), GOLD(), 0, H + 0.075, 0.05);
  addTick(g, t => {
    for (const f of fl) f.material.uniforms.uTime.value = t;
    ember.emissiveIntensity = 1.2 + 0.4 * Math.sin(t * 2.1) * Math.sin(t * 3.7);
    sparks.material.uniforms.uTime.value = t; sparks.position.y = (t * 0.15) % 0.2;
  });
  setLight(g, 0.35, 1.6, '#ff9a4a');
  return g;
}
// グランドピアノ（黒い鏡面、ふたが開く）
function pianoShape() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.74, 0); sh.lineTo(0.74, 0); sh.lineTo(0.74, 0.3);
  sh.bezierCurveTo(0.74, 0.72, 0.14, 0.7, 0.12, 1.15);
  sh.bezierCurveTo(0.1, 1.55, -0.05, 1.82, -0.4, 1.82);
  sh.bezierCurveTo(-0.68, 1.8, -0.74, 1.66, -0.74, 1.5);
  sh.lineTo(-0.74, 0);
  return sh;
}
function grandPiano(s) {
  const g = new THREE.Group();
  const K = PIANO_BLACK();
  const flat = (key, sh, d, bev) => cg(key, () => { const gg = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 20 }); gg.rotateX(-PI / 2); return gg; });
  // 胴（shape の y が奥 → -z）
  const caseY = 0.66, caseH = 0.3;
  mk(g, flat('pianoCase', pianoShape(), caseH, 0.008), K, 0, caseY, 0);
  // 中：響板・金のフレーム・弦
  mk(g, flat('pianoIn', pianoShape(), 0.01, 0), wood('oak', false), 0, caseY + caseH - 0.06, 0).scale.set(0.95, 1, 0.96);
  const plate = mk(g, flat('pianoIn', pianoShape(), 0.01, 0), cm('harp', () => phys({ color: '#c8a25a', metalness: 0.9, roughness: 0.35 })), 0.01, caseY + caseH - 0.045, -0.1);
  plate.scale.set(0.82, 1, 0.82);
  const strings = new Bag();
  for (let i = 0; i < 30; i++) { const x = -0.62 + i * 0.04; const len = 1.5 - i * 0.03; strings.rod(V3(x, caseY + caseH - 0.03, -0.2), V3(x * 0.6 + 0.0, caseY + caseH - 0.03, -0.2 - len * 0.95 + Math.max(0, x) * 0.6), 0.0015, 3); }
  strings.mesh(g, CHROME());
  // 鍵盤
  const kb = new THREE.Group(); kb.position.set(0, caseY + 0.06, 0.0); g.add(kb);
  mk(kb, B(1.48, 0.1, 0.32, 0.01), K, 0, -0.04, 0.15);
  for (const sx of [-1, 1]) mk(kb, B(0.08, 0.12, 0.34, 0.012), K, sx * 0.7, 0.02, 0.16);
  const white = new Bag(), black = new Bag();
  const nW = 52, kw = 1.3 / nW;
  for (let i = 0; i < nW; i++) white.add(B(kw * 0.94, 0.02, 0.15, 0.002), -0.65 + kw * (i + 0.5), 0.02, 0.21);
  const pat = [1, 1, 0, 1, 1, 1, 0];
  for (let i = 0; i < nW - 1; i++) if (pat[(i + 5) % 7]) black.add(B(kw * 0.55, 0.02, 0.09, 0.002), -0.65 + kw * (i + 1), 0.04, 0.18);
  white.mesh(kb, cm('ivory', () => phys({ color: '#f6f2ea', roughness: 0.25, clearcoat: 0.5 })));
  black.mesh(kb, K);
  mk(kb, B(1.32, 0.12, 0.02, 0.004), K, 0, 0.1, 0.04, -0.1, 0, 0);
  mk(kb, B(0.1, 0.005, 0.005, 0), GOLD(), 0, 0.14, 0.05);
  // 譜面台
  mk(g, B(0.7, 0.28, 0.015, 0.004), K, 0, caseY + caseH + 0.1, -0.08, -0.3, 0, 0);
  // ふた（左側の蝶番、右側が上がる）
  const lid = new THREE.Group(); lid.position.set(-0.74, caseY + caseH + 0.012, 0); lid.rotation.z = 0.62; g.add(lid);
  mk(lid, flat('pianoLid', pianoShape(), 0.022, 0.004), K, 0.74, 0, 0);
  rod(g, V3(0.68, caseY + caseH, -0.55), V3(0.6, caseY + caseH + 0.86, -0.55), 0.008, K);
  // 脚
  const leg = LA(smooth([[0.04, 0], [0.05, 0.05], [0.055, 0.25], [0.065, 0.45], [0.07, 0.6], [0.08, 0.66]], 16), 16);
  for (const [x, z] of [[-0.62, 0.1], [0.62, 0.1], [-0.3, -1.6]]) { mk(g, leg, K, x, 0.04, z); mk(g, C(0.035, 0.035, 0.04, 12), BRASS(), x, 0.02, z); }
  // ペダル
  mk(g, B(0.22, 0.5, 0.05, 0.01), K, 0, 0.36, 0.0);
  const ped = new Bag(); for (let i = 0; i < 3; i++) ped.add(B(0.03, 0.01, 0.08, 0.003), -0.06 + i * 0.06, 0.1, 0.05); ped.mesh(g, GOLD());
  mk(g, B(0.24, 0.03, 0.12, 0.008), K, 0, 0.09, 0.0);
  // 椅子
  const bench = new THREE.Group(); bench.position.set(0, 0, 0.65); g.add(bench);
  mk(bench, B(0.76, 0.07, 0.36, 0.012), K, 0, 0.47, 0);
  mk(bench, B(0.72, 0.05, 0.32, 0.02), leather('#151515'), 0, 0.525, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(bench, C(0.025, 0.02, 0.44, 12), K, sx * 0.32, 0.22, sz * 0.13);
  return g;
}
// 大きなアクアリウム（魚が泳ぐ）
function aquarium(s) {
  const g = new THREE.Group();
  const W = 1.3, D = 0.45, cabH = 0.72, TH = 0.6, Wd = wood('walnut');
  mk(g, B(W, cabH, D, 0.01), Wd, 0, cabH / 2, 0);
  for (const sx of [-1, 1]) mk(g, B(W / 2 - 0.02, cabH - 0.1, 0.01, 0.003), Wd, sx * W / 4, cabH / 2, D / 2 + 0.005);
  for (const sx of [-1, 1]) mk(g, B(0.008, 0.18, 0.015, 0.002), BRASS(), sx * 0.03, cabH / 2, D / 2 + 0.015);
  const y0 = cabH;
  // ガラス
  mk(g, B(W - 0.02, TH, D - 0.02, 0.004), glassT('#e8f4f4', 0.12), 0, y0 + TH / 2, 0);
  const water = cm('water', () => phys({ color: '#5fb4c4', roughness: 0.05, transparent: true, opacity: 0.22, envMapIntensity: 1.5, emissive: '#0a3a48', emissiveIntensity: 0.4, depthWrite: false }));
  mk(g, B(W - 0.04, TH - 0.06, D - 0.04, 0), water, 0, y0 + (TH - 0.06) / 2, 0);
  const surf = poolMat('#3a9ab0', 9);
  mk(g, cg('aqsurf', () => new THREE.PlaneGeometry(W - 0.04, D - 0.04).rotateX(-PI / 2)), surf, 0, y0 + TH - 0.06, 0);
  // 砂利・石・水草
  mk(g, B(W - 0.04, 0.05, D - 0.04, 0.004), cm('gravel', () => std({ color: '#ffffff', map: canvasTex('gravel', 256, 128, (ctx, w, h) => pixels(ctx, w, h, (u, v, o) => { const n = h2(Math.floor(u * 90), Math.floor(v * 45)); const c = mixRGB([200, 186, 160], [110, 96, 80], n); o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; })), roughness: 0.9 })), 0, y0 + 0.03, 0);
  const rock = cm('aqrock', () => std({ color: '#5a5650', roughness: 0.9, flatShading: true }));
  mk(g, cg('rock1', () => new THREE.IcosahedronGeometry(0.1, 0)), rock, -0.35, y0 + 0.1, -0.06).scale.set(1.4, 0.9, 0.9);
  mk(g, cg('rock1', () => new THREE.IcosahedronGeometry(0.1, 0)), rock, 0.3, y0 + 0.08, -0.08).scale.set(0.9, 0.7, 0.8);
  const weed = cm('weed', () => std({ color: '#3f8a3a', roughness: 0.6, side: THREE.DoubleSide, emissive: '#0a2a08', emissiveIntensity: 0.3 }));
  const R = rng(6);
  const blades = [];
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * (W - 0.15), z = -D / 2 + 0.05 + R() * 0.15, h = 0.2 + R() * 0.3;
    const m = tube(g, [V3(x, y0 + 0.05, z), V3(x + (R() - 0.5) * 0.05, y0 + 0.05 + h * 0.5, z), V3(x + (R() - 0.5) * 0.1, y0 + 0.05 + h, z + (R() - 0.5) * 0.05)], 0.006, weed, 8, 4);
    m.scale.z = 0.4; blades.push(m);
  }
  // 魚
  const fishGeo = cg('fish', () => {
    const body = new THREE.SphereGeometry(0.02, 10, 6); body.scale(1.8, 1, 0.55);
    const tail = new THREE.ConeGeometry(0.016, 0.03, 4); tail.rotateZ(PI / 2); tail.scale(1, 1, 0.3); tail.translate(-0.045, 0, 0);
    return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
  });
  const fishes = [];
  const cols = ['#ff7a1a', '#2ad0ff', '#ffd23a', '#ff3a6a', '#2ad0ff', '#ff7a1a', '#ffffff', '#2ad0ff'];
  cols.forEach((c, i) => {
    const m = mk(g, fishGeo, cm('fish' + c, () => phys({ color: c, roughness: 0.3, clearcoat: 1, emissive: c, emissiveIntensity: 0.25, iridescence: 0.5 })));
    m.castShadow = false;
    fishes.push({ m, r: 0.25 + R() * 0.3, y: y0 + 0.15 + R() * 0.3, sp: (0.3 + R() * 0.3) * (i % 2 ? 1 : -1), ph: R() * TAU, s: 0.8 + R() * 0.6 });
  });
  // 泡
  const NB = 14, bubbles = new THREE.InstancedMesh(S(0.006, 6, 4), glassT('#ffffff', 0.5), NB); noRay(bubbles); g.add(bubbles);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
  // ふたとライト
  mk(g, B(W, 0.04, D, 0.006), Wd, 0, y0 + TH + 0.02, 0);
  const lightBar = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#bfefff', emissiveIntensity: 2, roughness: 0.5 });
  mk(g, B(W - 0.1, 0.005, 0.04, 0), lightBar, 0, y0 + TH - 0.002, 0).castShadow = false;
  const upd = t => {
    for (const f of fishes) {
      const a = f.ph + t * f.sp;
      const x = Math.cos(a) * f.r * (W / 1.0) * 0.8, z = Math.sin(a) * 0.12;
      f.m.position.set(clamp(x, -W / 2 + 0.08, W / 2 - 0.08), f.y + Math.sin(t * 0.7 + f.ph) * 0.03, z);
      f.m.rotation.set(0, Math.atan2(-Math.cos(a) * 0.12 * Math.sign(f.sp), -Math.sin(a) * f.r * Math.sign(f.sp)) + 0 * PI, Math.sin(t * 8 + f.ph) * 0.08);
      f.m.scale.setScalar(f.s);
    }
    for (let i = 0; i < NB; i++) { const k = (i / NB + t * 0.25) % 1; m4.compose(V3(0.42 + Math.sin(i * 7) * 0.02, y0 + 0.08 + k * (TH - 0.16), -0.1 + Math.cos(i * 3) * 0.02), qq, V3(1, 1, 1).multiplyScalar(0.6 + k)); bubbles.setMatrixAt(i, m4); }
    bubbles.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < blades.length; i++) blades[i].rotation.z = Math.sin(t * 0.8 + i) * 0.03;
    surf.uniforms.uTime.value = t;
  };
  upd(0); addTick(g, upd);
  setLight(g, y0 + TH, 0.8, '#bfefff');
  return g;
}
// 天蓋つきのベッド（薄いカーテンがゆれる）
function canopyBed(s) {
  const g = new THREE.Group();
  const Wd = wood(s.mat || 'walnut'), W = 1.7, L = 2.15, H = 2.15;
  const post = LA(smooth([[0.045, 0], [0.05, 0.05], [0.035, 0.12], [0.04, 0.35], [0.03, 0.5], [0.03, H - 0.1], [0.04, H - 0.05], [0.03, H]], 30), 16, true);
  const corners = [[-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2]];
  for (const [x, z] of corners) { mk(g, post, Wd, x, 0, z); mk(g, S(0.04, 12, 8), GOLD(), x, H + 0.03, z); }
  for (const z of [-L / 2, L / 2]) mk(g, B(W, 0.06, 0.05, 0.01), Wd, 0, H - 0.04, z);
  for (const x of [-W / 2, W / 2]) mk(g, B(0.05, 0.06, L, 0.01), Wd, x, H - 0.04, 0);
  mk(g, B(W, 0.28, L, 0.02), Wd, 0, 0.3, 0);
  mk(g, B(W - 0.06, 0.24, L - 0.08, 0.06), cloth('#f4f0e8'), 0, 0.56, 0.0);
  // ヘッドボード（ボタン留め）
  const V = velvet(s.fabric || '#c9b9a3');
  mk(g, B(W - 0.06, 0.9, 0.08, 0.04), V, 0, 0.95, -L / 2 + 0.05);
  tufted(g, W - 0.2, 0.7, 6, 3, V, 0, 1.0, -L / 2 + 0.09);
  // 掛け布団と枕
  const duvet = cg('duvet', () => { const gg = new RoundedBoxGeometry(W + 0.04, 0.1, L - 0.6, 3, 0.05); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setY(i, y + Math.sin(x * 9 + z * 3) * 0.01 + Math.cos(z * 7) * 0.008 - (Math.abs(x) > W / 2 - 0.02 ? 0.12 : 0)); } gg.computeVertexNormals(); return gg; });
  mk(g, duvet, cloth('#efe9df'), 0, 0.71, 0.27);
  mk(g, B(W + 0.04, 0.06, 0.5, 0.03), velvet('#7a5a3a'), 0, 0.74, L / 2 - 0.35);
  for (const sx of [-1, 1]) { mk(g, B(0.66, 0.16, 0.42, 0.07), cloth('#ffffff'), sx * 0.38, 0.78, -L / 2 + 0.35, -0.3); mk(g, B(0.56, 0.14, 0.34, 0.06), cloth('#ece2d0'), sx * 0.34, 0.8, -L / 2 + 0.5, -0.4); }
  // 薄いカーテン（四隅に寄せる）
  const sheer = cm('sheer', () => phys({ color: '#fbf8f2', roughness: 0.8, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, sheen: 1, sheenColor: new THREE.Color('#ffffff') }));
  const drape = cg('drape', () => {
    const hh = H - 0.08, gg = new THREE.PlaneGeometry(0.5, hh, 24, 20); const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + hh / 2, v = y / hh;
      const tie = 1 - Math.exp(-Math.pow((v - 0.45) / 0.12, 2)) * 0.7;
      p.setXYZ(i, x * tie * (0.7 + 0.3 * v), y, Math.sin(x * 40) * 0.025 * tie);
    }
    gg.computeVertexNormals(); return gg;
  });
  const drapes = [];
  for (const [x, z] of corners) {
    const d = mk(g, drape, sheer, x - Math.sign(x) * 0.25, 0, z + Math.sign(z) * 0.03, 0, z > 0 ? 0 : PI, 0);
    d.castShadow = false; drapes.push(d);
  }
  // 上の飾り布（バランス）
  const val = cg('valance', () => { const gg = new THREE.PlaneGeometry(1, 0.22, 40, 3); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setY(i, y - (0.11 - y) * 0 - Math.abs(Math.sin(x * PI * 3)) * 0.05 * (0.11 - y) / 0.22); p.setZ(i, Math.sin(x * 60) * 0.012); } gg.computeVertexNormals(); return gg; });
  for (const z of [-L / 2, L / 2]) mk(g, val, sheer, 0, H - 0.15, z + Math.sign(z) * 0.03, 0, 0, 0).scale.x = W;
  for (const x of [-W / 2, W / 2]) mk(g, val, sheer, x + Math.sign(x) * 0.03, H - 0.15, 0, 0, PI / 2, 0).scale.x = L;
  // 天蓋の小さな明かり
  const pts = []; for (let i = 0; i < 40; i++) { const t = i / 40; const [ax, az] = i < 20 ? [-W / 2 + W * t * 2, -L / 2] : [-W / 2 + W * (t - 0.5) * 2, L / 2]; pts.push(ax, H - 0.1 - Math.sin(t * PI * 4) * 0.04, az); }
  for (let i = 0; i < 30; i++) { const t = i / 30; pts.push(i % 2 ? W / 2 : -W / 2, H - 0.1 - Math.abs(Math.sin(t * PI * 3)) * 0.05, -L / 2 + L * t); }
  const sp = sparkles(g, pts, { size: 0.03, colors: ['#ffd9a0', '#fff0d0'], speed: 1.4, base: 0.35 });
  addTick(g, t => { drapes.forEach((d, i) => { d.rotation.z = Math.sin(t * 0.6 + i) * 0.015; }); sp.material.uniforms.uTime.value = t; });
  return g;
}

// =====================================================================
// ★4：ある程度とがった、個性の強い物
// =====================================================================
// ネオンサイン（夕日とヤシの木）
function neonSunset(s) {
  const g = new THREE.Group();
  mk(g, B(0.9, 0.7, 0.012, 0.004), cm('acryl2', () => phys({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false })), 0, 0, 0.03);
  for (const [x, y] of [[-0.42, 0.32], [0.42, 0.32], [-0.42, -0.32], [0.42, -0.32]]) rod(g, V3(x, y, 0), V3(x, y, 0.04), 0.007, CHROME());
  const orange = neonMat('#ff7a2a', 3), pink = neonMat('#ff3a8a', 3), green = neonMat('#3aff8a', 4);
  // 太陽（半円と横線）
  const sun = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * PI; sun.push(V3(Math.cos(a) * 0.26, -0.05 + Math.sin(a) * 0.26, 0.05)); }
  polyTube(g, sun.concat([V3(-0.26, -0.05, 0.05)]), 0.007, orange, true, 6);
  for (let k = 0; k < 3; k++) { const y = -0.12 - k * 0.06, w = 0.26 - k * 0.06; polyTube(g, [V3(-w, y, 0.05), V3(w, y, 0.05)], 0.006, pink, false, 6); }
  // ヤシ
  polyTube(g, [V3(0.2, -0.3, 0.06), V3(0.22, -0.05, 0.06), V3(0.18, 0.15, 0.06), V3(0.12, 0.28, 0.06)], 0.006, green, false, 6);
  for (const [dx, dy] of [[-0.2, -0.02], [-0.12, 0.08], [0.1, 0.06], [0.16, -0.06], [0.0, 0.12]]) {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V3(0.12 + dx * t, 0.28 + dy * t + Math.sin(t * PI) * 0.06, 0.06)); }
    polyTube(g, pts, 0.005, green, false, 6);
  }
  const hl = halo(g, 1.2, 1.0, haloMat('#ff5a6a', 5, 0.28), 0, 0, 0.004);
  addTick(g, t => { pink.emissiveIntensity = 2.6 + 0.5 * Math.sin(t * 1.7); hl.material.uniforms.uTime.value = t; });
  setLight(g, 0, 0.8, '#ff6a6a');
  return g;
}
// ハンモック（木の弓形スタンド）
function hammock(s) {
  const g = new THREE.Group();
  const Wd = wood('oak'), L = 2.6;
  // 弓形の2本の梁
  for (const z of [-0.35, 0.35]) {
    const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(V3(-L / 2 + L * t, 0.06 + Math.sin(t * PI) * 0.0 + (Math.abs(t - 0.5) > 0.38 ? (Math.abs(t - 0.5) - 0.38) * 9 : 0), z * (1 - Math.sin(t * PI) * 0.0))); }
    tube(g, [V3(-L / 2, 1.15, 0), V3(-L / 2 + 0.2, 0.5, z * 0.5), V3(-L / 2 + 0.6, 0.08, z), V3(0, 0.05, z), V3(L / 2 - 0.6, 0.08, z), V3(L / 2 - 0.2, 0.5, z * 0.5), V3(L / 2, 1.15, 0)], 0.04, Wd, 60, 10);
  }
  for (const x of [-0.6, 0, 0.6]) rod(g, V3(x, 0.05, -0.35), V3(x, 0.05, 0.35), 0.03, Wd);
  // 布（たるんだ面）
  const fab = cg('hammockFab', () => {
    const gg = new THREE.PlaneGeometry(1.7, 0.9, 30, 12); gg.rotateX(-PI / 2);
    const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const u = x / 0.85, v = z / 0.45; p.setY(i, -(1 - u * u) * 0.45 + v * v * 0.12 * (1 - u * u)); p.setZ(i, z * (0.45 + 0.55 * (1 - u * u))); }
    gg.computeVertexNormals(); return gg;
  });
  const stripe = cm('hamstripe', () => std({ color: '#ffffff', map: canvasTex('hamtex', 256, 128, (ctx, w, h) => { const c = ['#e9dcc6', '#c06a43', '#e9dcc6', '#2f5a6a', '#e9dcc6', '#d9a84a']; for (let i = 0; i < 24; i++) { ctx.fillStyle = c[i % c.length]; ctx.fillRect(0, i * h / 24, w, h / 24); } }), roughness: 0.95, side: THREE.DoubleSide }));
  mk(g, fab, stripe, 0, 0.95, 0);
  // 吊りひも
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { const z = -0.2 + k * 0.1; rod(g, V3(sx * L / 2 * 0.98, 1.12, 0), V3(sx * 0.85, 0.95, z * 0.5), 0.003, paintG('#e9dcc6', 0.9)); }
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.85, 0.95, -0.25), V3(sx * 0.85, 0.95, 0.25), 0.012, Wd);
  // ふさ
  const fr = new Bag(); for (const sz of [-1, 1]) for (let i = 0; i < 30; i++) { const x = -0.8 + i * 1.6 / 29, u = x / 0.85; fr.add(B(0.006, 0.08, 0.004, 0), x, 0.95 - (1 - u * u) * 0.45 + 0.12 * (1 - u * u) - 0.04, sz * 0.45 * (0.45 + 0.55 * (1 - u * u))); }
  fr.mesh(g, cloth('#e9dcc6'));
  mk(g, B(0.4, 0.14, 0.3, 0.06), cloth('#c06a43'), -0.55, 0.72, 0, 0, 0, 0.5);
  return g;
}
// アーケード筐体（画面が動く）
function arcadeTex() {
  return canvasTex('arcade', 256, 256, (ctx, w, h) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * 128;
      ctx.fillStyle = '#05061a'; ctx.fillRect(ox, 0, 128, 256);
      const R = rng(5);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + R() * 128, R() * 256, 1, 1); }
      const inv = [[0, 1, 0, 0, 0, 1, 0], [0, 0, 1, 1, 1, 0, 0], [0, 1, 1, 1, 1, 1, 0], [1, 1, 0, 1, 0, 1, 1], [1, 1, 1, 1, 1, 1, 1], f ? [1, 0, 1, 0, 1, 0, 1] : [0, 1, 0, 0, 0, 1, 0]];
      const cols = ['#ff3a8a', '#3affd0', '#ffd23a', '#7a8aff'];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        ctx.fillStyle = cols[r];
        inv.forEach((row, yy) => row.forEach((on, xx) => { if (on) ctx.fillRect(ox + 10 + c * 22 + xx * 2 + f * 3, 40 + r * 22 + yy * 2, 2, 2); }));
      }
      ctx.fillStyle = '#3aff6a'; ctx.fillRect(ox + 56 + f * 8, 220, 14, 6); ctx.fillRect(ox + 61 + f * 8, 216, 4, 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + 62 + f * 8, 150 + f * 30, 1, 8);
      ctx.fillStyle = '#ffd23a'; ctx.font = '10px monospace'; ctx.fillText('SCORE 0' + (1200 + f * 50), ox + 6, 14);
    }
  }, { rep: 1 });
}
function arcade(s) {
  const g = new THREE.Group();
  const body = lacquer(s.color || '#1a1a4a', 0.3), W = 0.66, D = 0.75, H = 1.75;
  // 横板（横から見た形）
  const side = new THREE.Shape();
  side.moveTo(0, 0); side.lineTo(D, 0); side.lineTo(D, 0.95); side.lineTo(D + 0.08, 1.0); side.lineTo(D * 0.75, 1.42); side.lineTo(D * 0.7, H); side.lineTo(0, H); side.lineTo(0, 0);
  const sideGeo = EX('arcSide', side, 0.025, 0.004);
  for (const sx of [-1, 1]) { const m = mk(g, sideGeo, body, sx * (W / 2 - 0.0125), 0, -D / 2, 0, -PI / 2, 0); }
  // 側面のもよう（ネオンの線）
  const art = neonMat('#ff3a8a', 2);
  for (const sx of [-1, 1]) polyTube(g, [V3(sx * (W / 2 + 0.002), 0.2, -0.3), V3(sx * (W / 2 + 0.002), 1.2, 0.2)], 0.005, art, false, 4);
  mk(g, B(W - 0.05, H - 0.05, 0.02, 0.003), body, 0, H / 2, -D / 2 + 0.01);
  mk(g, B(W - 0.05, 0.95, 0.02, 0.003), body, 0, 0.475, D / 2 - 0.02);
  // コイン口
  for (const sx of [-1, 1]) mk(g, B(0.06, 0.09, 0.01, 0.003), neonMat('#ff3a3a', 1.5), sx * 0.08, 0.6, D / 2 - 0.005);
  // 操作盤
  const panel = new THREE.Group(); panel.position.set(0, 1.0, D / 2 - 0.05); panel.rotation.x = -0.35; g.add(panel);
  mk(panel, B(W - 0.04, 0.03, 0.22, 0.008), paintG('#111', 0.4), 0, 0, 0);
  rod(panel, V3(-0.14, 0.015, 0.02), V3(-0.14, 0.08, 0.02), 0.006, CHROME()); mk(panel, S(0.02, 14, 10), lacquer('#d01a1a', 0.1), -0.14, 0.09, 0.02);
  const btn = new Bag(); for (let i = 0; i < 4; i++) btn.add(C(0.016, 0.016, 0.015, 14), 0.02 + (i % 2) * 0.05 + Math.floor(i / 2) * 0.05, 0.02, -0.01 + (i % 2) * 0.03); btn.mesh(panel, neonMat('#3affd0', 1.2));
  // 画面
  const map = arcadeTex(); map.repeat.set(0.5, 1);
  const scr = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 1.4, roughness: 0.2 });
  mk(g, B(W - 0.04, 0.42, 0.02, 0.004), paintG('#0a0a0a', 0.5), 0, 1.22, D * 0.75 - D / 2 - 0.02, -0.25, 0, 0);
  mk(g, cg('arcScr', () => new THREE.PlaneGeometry(0.46, 0.36)), scr, 0, 1.22, D * 0.75 - D / 2 - 0.005 + 0.005, -0.25, 0, 0);
  mk(g, B(W - 0.04, 0.42, 0.006, 0), glassT('#ffffff', 0.08), 0, 1.22, D * 0.75 - D / 2 + 0.012, -0.25, 0, 0);
  // 上の看板
  const mq = cm('marquee', () => std({ color: '#000', emissive: '#ffffff', emissiveMap: canvasTex('marq', 256, 64, (ctx, w, h) => { const gr = ctx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff3a8a'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(1, '#3affd0'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#10103a'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SPACE ★', w / 2, 46); }), emissiveIntensity: 1.6 }));
  mk(g, B(W - 0.04, 0.2, 0.02, 0.004), mq, 0, H - 0.13, D * 0.7 - D / 2 + 0.005);
  mk(g, B(W, 0.03, D * 0.7, 0.006), body, 0, H, -D / 2 + D * 0.35);
  addTick(g, t => { map.offset.x = Math.floor(t * 2) % 2 ? 0.5 : 0; scr.emissiveIntensity = 1.3 + 0.08 * Math.sin(t * 40); });
  setLight(g, 1.3, 0.6, '#9a8aff');
  return g;
}
// 宇宙飛行士のオブジェ
function astronaut(s) {
  const g = new THREE.Group();
  const suit = cm('suit', () => phys({ color: '#f2f2ee', roughness: 0.35, clearcoat: 0.7 }));
  const gray = paintG('#9a9a9a', 0.5, 0.3);
  const visor = cm('visor', () => phys({ color: '#d8a640', metalness: 1, roughness: 0.04, iridescence: 0.6, iridescenceIOR: 1.8 }));
  mk(g, C(0.22, 0.24, 0.08, 40), marble('black'), 0, 0.04, 0);
  mk(g, T(0.225, 0.006, 6, 64), GOLD(), 0, 0.08, 0, PI / 2);
  const cap = (a, b, r) => { rod(g, a, b, r, suit, r * 0.95, 12); mk(g, S(r, 12, 8), suit, a.x, a.y, a.z); mk(g, S(r * 0.95, 12, 8), suit, b.x, b.y, b.z); };
  // 足（ブーツ）
  for (const sx of [-1, 1]) {
    mk(g, B(0.09, 0.06, 0.15, 0.025), gray, sx * 0.07, 0.11, 0.02);
    cap(V3(sx * 0.07, 0.16, 0), V3(sx * 0.075, 0.33, 0.01), 0.048);
    cap(V3(sx * 0.075, 0.35, 0.01), V3(sx * 0.07, 0.52, -0.01), 0.055);
  }
  // 胴
  mk(g, cg('torso', () => { const gg = new RoundedBoxGeometry(0.28, 0.3, 0.2, 3, 0.08); return gg; }), suit, 0, 0.68, 0);
  mk(g, B(0.14, 0.1, 0.03, 0.01), gray, 0, 0.68, 0.11);
  const lights = new Bag(); for (let i = 0; i < 3; i++) lights.add(S(0.008, 8, 6), -0.04 + i * 0.04, 0.7, 0.127); lights.mesh(g, neonMat('#ff3a3a', 2));
  mk(g, B(0.26, 0.32, 0.12, 0.03), suit, 0, 0.7, -0.15);
  // 腕（片手を振る）
  cap(V3(-0.17, 0.78, 0), V3(-0.22, 0.6, 0.04), 0.045); cap(V3(-0.22, 0.58, 0.04), V3(-0.2, 0.45, 0.1), 0.042);
  mk(g, S(0.05, 12, 10), gray, -0.2, 0.42, 0.11);
  cap(V3(0.17, 0.78, 0), V3(0.28, 0.9, 0.02), 0.045); cap(V3(0.28, 0.92, 0.02), V3(0.3, 1.06, 0.04), 0.042);
  mk(g, S(0.05, 12, 10), gray, 0.3, 1.1, 0.05);
  // ヘルメット
  mk(g, S(0.15, 28, 18), suit, 0, 0.98, 0);
  const vg = cg('visorG', () => new THREE.SphereGeometry(0.152, 32, 20, -0.9 + PI / 2, 1.8, 0.75, 1.2));
  mk(g, vg, visor, 0, 0.98, 0.0);
  mk(g, T(0.12, 0.02, 8, 32), gray, 0, 0.86, 0, PI / 2);
  // 星のかけら
  const sp = sparkles(g, shellPts(14, 0.3, 0.45, 9, 0).map((v, i) => i % 3 === 1 ? v + 0.6 : v), { size: 0.03, speed: 1.6, base: 0.1 });
  addTick(g, t => { sp.material.uniforms.uTime.value = t; });
  return g;
}
// 巨大な観葉植物の塔
function plantTower(s) {
  const g = new THREE.Group();
  const I = paintG('#2a2a2a', 0.5, 0.6);
  const tiers = [[0.0, 0.42, 0.34], [0.55, 0.34, 0.3], [1.05, 0.27, 0.26], [1.5, 0.2, 0.24]];
  rod(g, V3(0, 0, 0), V3(0, 1.9, 0), 0.02, I);
  const pot = cm('towerpot', () => phys({ color: '#d9d2c4', roughness: 0.7 }));
  const leaves = [];
  tiers.forEach(([y, r, h], i) => {
    mk(g, LA([[0.02, 0], [r * 0.85, 0], [r, h * 0.9], [r * 1.02, h], [r * 0.95, h]], 32), pot, 0, y, 0);
    mk(g, C(r * 0.95, r * 0.95, 0.01, 32), paintG('#3a2a1c', 1), 0, y + h - 0.02, 0);
    fernInto(leaves, V3(0, y + h - 0.02, 0), r * 2.2 + 0.3, 40 + i);
    fernInto(leaves, V3(0, y + h - 0.02, 0), r * 1.6 + 0.2, 60 + i);
    // 垂れるつる
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + i; const x = Math.cos(a) * r, z = Math.sin(a) * r; ivyInto(g, V3(x, y + h, z), V3(Math.cos(a), 0, Math.sin(a)), 0.25 + (k % 3) * 0.1, i * 10 + k); }
  });
  flushIvy(g);
  const im = new THREE.InstancedMesh(LEAFG(), FERN(), leaves.length);
  const c = new THREE.Color();
  leaves.forEach(([m, hh, l], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(hh, 0.55, l * 0.6)); });
  im.castShadow = true; im.receiveShadow = true;
  g.add(im);
  return g;
}
const IVY = [];
function ivyInto(g, p, dir, len, seed) {
  const R = rng(seed);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const q = p.clone().addScaledVector(dir, 0.04 + t * 0.03).add(V3((R() - 0.5) * 0.03, -t * len, (R() - 0.5) * 0.03));
    const m = new THREE.Matrix4().compose(q, new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 6, R() * 3)), V3(0.05, 1, 0.05));
    IVY.push(m);
  }
}
function flushIvy(g) {
  const im = new THREE.InstancedMesh(LEAFG(), FERN(), IVY.length);
  const c = new THREE.Color();
  IVY.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(0.27, 0.5, 0.25 + h2(i, 4) * 0.1)); });
  IVY.length = 0;
  im.castShadow = true; g.add(im);
}
// 吊りさげ式のエッグチェア（籐）
function eggChair(s) {
  const g = new THREE.Group();
  const I = paintG('#1e1e1e', 0.45, 0.6);
  mk(g, C(0.32, 0.34, 0.04, 40), I, 0, 0.02, 0);
  tube(g, [V3(0, 0.04, -0.15), V3(0, 1.2, -0.3), V3(0, 1.85, -0.15), V3(0, 1.95, 0.1), V3(0, 1.88, 0.2)], 0.025, I, 40, 10);
  rod(g, V3(0, 1.88, 0.2), V3(0, 1.62, 0.2), 0.005, I);
  // 卵形（前が開いている）
  const lace = cm('rlace', () => { const map = rattanLaceTex(); return std({ color: '#ffffff', map, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide }); });
  const prof = smooth([[0.001, 0], [0.25, 0.08], [0.36, 0.38], [0.33, 0.7], [0.22, 0.95], [0.04, 1.08]], 24);
  const egg = mk(g, LA(prof, 40, false, PI * 1.35, PI * 0.325 + PI), lace, 0, 0.55, 0.2);
  egg.rotation.y = 0;
  mk(g, LA(prof.slice(0, 6), 32), RATTAN(), 0, 0.55, 0.2);
  // ふちの太い籐
  const rim = []; for (let i = 0; i <= 30; i++) { const t = i / 30, a = PI * 0.325 + PI + t * PI * 1.35; const pi = Math.floor(t * 0 + 0); rim.push(V3(Math.sin(a) * 0.36, 0.55 + 0.38, 0.2 + Math.cos(a) * 0.36)); }
  // 前の開口のふち（縦）
  for (const sx of [-1, 1]) { const a = sx > 0 ? PI * 0.325 + PI : PI * 0.325 + PI + PI * 1.35; tube(g, prof.map(([r, y]) => V3(Math.sin(a) * r, 0.55 + y, 0.2 + Math.cos(a) * r)), 0.015, RATTAN(), 30, 6); }
  mk(g, LA(smooth([[0.001, 0], [0.24, 0.0], [0.27, 0.05], [0.22, 0.1], [0.001, 0.1]], 10), 32), cloth(s.fabric || '#f1ebe0'), 0, 0.65, 0.22);
  mk(g, B(0.36, 0.3, 0.12, 0.06), cloth('#d9a84a'), 0, 0.9, 0.03, -0.2);
  return g;
}
// ラバランプ（ゆっくり浮き沈み）
function lavaLamp(s) {
  const g = new THREE.Group();
  const M = CHROME();
  mk(g, LA([[0.001, 0], [0.11, 0], [0.11, 0.02], [0.06, 0.2], [0.065, 0.22]], 32), M, 0, 0, 0);
  const glass = smooth([[0.065, 0], [0.09, 0.15], [0.07, 0.4], [0.04, 0.55]], 20);
  mk(g, LA(glass, 32), cm('lavaglass', () => phys({ color: s.liquid || '#ff9a3a', transparent: true, opacity: 0.4, roughness: 0.05, emissive: s.liquid || '#ff7a1a', emissiveIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide })), 0, 0.22, 0);
  mk(g, LA([[0.042, 0], [0.04, 0.1], [0.012, 0.13]], 24), M, 0, 0.76, 0);
  const wax = new THREE.MeshStandardMaterial({ color: s.wax || '#ff2a6a', emissive: s.wax || '#ff2a6a', emissiveIntensity: 1.3, roughness: 0.3 });
  const blobs = [];
  for (let i = 0; i < 5; i++) { const b = mk(g, S(0.03 + i % 2 * 0.012, 16, 12), wax, 0, 0.3, 0); b.castShadow = false; blobs.push({ b, ph: i * 1.3, sp: 0.12 + i * 0.03 }); }
  mk(g, S(0.07, 16, 10), wax, 0, 0.24, 0).scale.y = 0.4;
  const upd = t => { for (const o of blobs) { const k = 0.5 - 0.5 * Math.cos(t * o.sp + o.ph); const y = 0.26 + k * 0.42; const rr = lerp(0.07, 0.05, k) - 0.035; o.b.position.set(Math.sin(o.ph * 3) * rr, y, Math.cos(o.ph * 3) * rr); o.b.scale.set(1, 1.2 + Math.sin(t * 0.7 + o.ph) * 0.25, 1); } };
  upd(0); addTick(g, upd);
  setLight(g, 0.45, 0.6, s.wax || '#ff4a6a');
  return g;
}
// ミラーボール（天井、まわる）
function discoBall(s) {
  const g = new THREE.Group();
  mk(g, C(0.05, 0.05, 0.02, 20), CHROME(), 0, -0.01, 0);
  rod(g, V3(0, -0.02, 0), V3(0, -0.45, 0), 0.004, CHROME());
  const ball = new THREE.Group(); ball.position.y = -0.65; g.add(ball);
  const geo = cg('disco', () => { const gg = new THREE.SphereGeometry(0.2, 28, 18).toNonIndexed(); gg.computeVertexNormals(); const c = new Float32Array(gg.attributes.position.count * 3); for (let i = 0; i < c.length / 9; i++) { const k = 0.6 + h2(i, 3) * 0.4; for (let j = 0; j < 9; j++) c[i * 9 + j] = k; } gg.setAttribute('color', new THREE.BufferAttribute(c, 3)); return gg; });
  mk(ball, geo, cm('discoM', () => phys({ color: '#ffffff', metalness: 1, roughness: 0.08, flatShading: true, vertexColors: true, envMapIntensity: 2 })), 0, 0, 0);
  const sp = sparkles(ball, shellPts(60, 0.205, 0.21, 2), { size: 0.04, colors: ['#ffffff', '#ffd0f0', '#d0f0ff'], speed: 3, base: 0.0 });
  // 壁に散る光の粒（まわる）
  const dots = sparkles(g, shellPts(45, 0.7, 1.0, 4, -0.6).map((v, i) => i % 3 === 1 ? v - 0.65 : v), { size: 0.035, colors: ['#ff6ad0', '#6ad0ff', '#ffffff', '#ffe06a'], speed: 1.5, base: 0.5 });
  addTick(g, t => { ball.rotation.y = t * 0.5; dots.rotation.y = t * 0.5; sp.material.uniforms.uTime.value = t; dots.material.uniforms.uTime.value = t; });
  setLight(g, -0.65, 0.7, '#ffd0f0');
  return g;
}
// 70年代のテレビ（画面が光る）
const TV_FS = `
uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float bar = floor(uv.x * 7.0);
  vec3 c = vec3(0.0);
  if (bar < 1.0) c = vec3(0.9); else if (bar < 2.0) c = vec3(0.9, 0.9, 0.1); else if (bar < 3.0) c = vec3(0.1, 0.9, 0.9); else if (bar < 4.0) c = vec3(0.1, 0.9, 0.1); else if (bar < 5.0) c = vec3(0.9, 0.1, 0.9); else if (bar < 6.0) c = vec3(0.9, 0.1, 0.1); else c = vec3(0.1, 0.1, 0.9);
  if (uv.y < 0.25) c = vec3(0.05 + 0.85 * step(0.5, fract(uv.x * 4.0)));
  float n = hash(uv * 300.0 + floor(uTime * 20.0));
  c = mix(c, vec3(n), 0.12);
  c *= 0.85 + 0.15 * sin(uv.y * 400.0 + uTime * 10.0);
  float v = smoothstep(0.75, 0.35, length(uv - 0.5));
  gl_FragColor = vec4(c * v * 1.4, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function retroTV(s) {
  const g = new THREE.Group();
  const Wd = wood('walnut'), W = 0.9, H = 0.62, D = 0.5;
  for (const sx of [-1, 1]) { rod(g, V3(sx * 0.35, 0, 0.15), V3(sx * 0.3, 0.2, 0.1), 0.012, BRASS(), 0.014); rod(g, V3(sx * 0.35, 0, -0.15), V3(sx * 0.3, 0.2, -0.1), 0.012, BRASS(), 0.014); }
  mk(g, B(W, H, D, 0.03), Wd, 0, 0.2 + H / 2, 0);
  mk(g, B(0.58, 0.46, 0.02, 0.05), paintG('#151515', 0.4), -0.1, 0.2 + H / 2, D / 2);
  const scr = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: WATER_VS, fragmentShader: TV_FS });
  const sg = cg('tvscr', () => { const gg = new THREE.PlaneGeometry(0.5, 0.38, 8, 8); const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.03 - (x * x + y * y) * 0.12); } gg.computeVertexNormals(); return gg; });
  mk(g, sg, scr, -0.1, 0.2 + H / 2, D / 2 + 0.005).castShadow = false;
  mk(g, sg, glassT('#ffffff', 0.08), -0.1, 0.2 + H / 2, D / 2 + 0.008);
  mk(g, B(0.16, 0.46, 0.01, 0.004), cm('tvgrill', () => std({ color: '#ffffff', map: grillTex(), roughness: 0.9 })), 0.32, 0.2 + H / 2, D / 2 + 0.002);
  for (let i = 0; i < 2; i++) mk(g, C(0.025, 0.025, 0.03, 16), CHROME(), 0.32, 0.2 + H - 0.08 - i * 0.07, D / 2 + 0.01, PI / 2);
  for (const sx of [-1, 1]) rod(g, V3(0.1, 0.2 + H, -0.05), V3(0.1 + sx * 0.25, 0.2 + H + 0.4, -0.1), 0.003, CHROME());
  mk(g, S(0.03, 12, 8), CHROME(), 0.1, 0.2 + H + 0.01, -0.05).scale.y = 0.5;
  addTick(g, t => { scr.uniforms.uTime.value = t; });
  setLight(g, 0.5, 0.5, '#9ac8ff');
  return g;
}
// サーフボード（壁かけ）
function surfboard(s) {
  const g = new THREE.Group();
  const L = 1.9, Wd = 0.5;
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.bezierCurveTo(-L / 2 + 0.1, Wd * 0.45, -0.2, Wd / 2, 0.1, Wd / 2); sh.bezierCurveTo(0.5, Wd / 2, L / 2 - 0.05, Wd * 0.25, L / 2, 0); sh.bezierCurveTo(L / 2 - 0.05, -Wd * 0.25, 0.5, -Wd / 2, 0.1, -Wd / 2); sh.bezierCurveTo(-0.2, -Wd / 2, -L / 2 + 0.1, -Wd * 0.45, -L / 2, 0);
  const geo = cg('surf', () => { const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 4, curveSegments: 40 }); const uv = gg.attributes.uv, p = gg.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / L + 0.5, p.getY(i) / Wd + 0.5); return gg; });
  const tex = canvasTex('surftex', 512, 128, (ctx, w, h) => { const gr = ctx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2f9ab0'); gr.addColorStop(0.5, '#f4efe2'); gr.addColorStop(1, '#ff7a4a'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1d3a4a'; ctx.fillRect(0, h / 2 - 2, w, 4); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(w * 0.35, h / 2, 26, 0, TAU); ctx.fill(); });
  mk(g, geo, cm('surfM', () => phys({ color: '#ffffff', map: tex, roughness: 0.15, clearcoat: 1 })), 0, 0, 0.06);
  for (const x of [-0.5, 0.5]) { mk(g, B(0.04, 0.06, 0.08, 0.01), wood('oak', false), x, -0.26, 0.04); mk(g, B(0.04, 0.06, 0.08, 0.01), wood('oak', false), x, 0.26, 0.04); }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.12, 0); fin.quadraticCurveTo(0.02, 0.05, -0.02, 0.12); fin.lineTo(0, 0);
  mk(g, EX('fin', fin, 0.008, 0.002), paintG('#1d3a4a', 0.3), -L / 2 + 0.15, -0.0, 0.0, PI / 2, 0, 0);
  return g;
}
// 自動販売機（光る）
function vendingTex() {
  return canvasTex('vend', 256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#f4f8fa'; ctx.fillRect(0, 0, w, h);
    const cols = ['#d8242a', '#2a6ad8', '#2aa84a', '#f4a82a', '#8a3ad8', '#1a1a1a', '#e8e0c8', '#2ac8d8'];
    const R = rng(3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = 14 + c * 39, y = 18 + r * 90;
      ctx.fillStyle = cols[Math.floor(R() * cols.length)];
      ctx.beginPath(); ctx.roundRect(x, y, 26, 58, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 4, y + 20, 18, 10);
      ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.fillText('¥' + (100 + Math.floor(R() * 4) * 30), x - 1, y + 74);
      ctx.fillStyle = R() > 0.85 ? '#ff3a3a' : '#3aff6a'; ctx.fillRect(x + 18, y + 66, 8, 6);
    }
  });
}
function vending(s) {
  const g = new THREE.Group();
  const body = lacquer(s.color || '#c8242a', 0.25), W = 0.9, H = 1.83, D = 0.7;
  mk(g, B(W, H, D, 0.02), body, 0, H / 2, 0);
  const map = vendingTex();
  const disp = new THREE.MeshStandardMaterial({ color: '#ffffff', map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.9, roughness: 0.3 });
  mk(g, cg('vdisp', () => new THREE.PlaneGeometry(0.66, 0.99)), disp, -0.04, 1.2, D / 2 + 0.002);
  mk(g, B(0.68, 1.01, 0.01, 0.002), glassT('#ffffff', 0.12), -0.04, 1.2, D / 2 + 0.01);
  mk(g, B(0.6, 0.18, 0.06, 0.01), paintG('#1a1a1a', 0.5), -0.04, 0.2, D / 2);
  mk(g, B(0.12, 0.2, 0.01, 0.004), paintG('#222', 0.4), 0.35, 0.95, D / 2 + 0.005);
  const led = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#3aff6a', emissiveIntensity: 2, roughness: 0.5 });
  mk(g, B(0.1, 0.03, 0.01, 0), led, 0.35, 1.02, D / 2 + 0.012);
  mk(g, B(W - 0.04, 0.1, 0.01, 0.003), cm('vtop', () => std({ color: '#fff', emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.5 })), 0, H - 0.08, D / 2 + 0.002);
  addTick(g, t => { led.emissiveIntensity = Math.floor(t * 1.5) % 2 ? 2.4 : 0.6; });
  setLight(g, 1.2, 0.8, '#eaf6ff');
  return g;
}
// サンドバッグ（天井から）
function punchBag(s) {
  const g = new THREE.Group();
  const L = leather(s.color || '#9a1a1a');
  mk(g, C(0.06, 0.06, 0.02, 16), CHROME(), 0, -0.01, 0);
  const sw = new THREE.Group(); sw.position.y = -0.02; g.add(sw);
  const ch = new Bag(); for (let k = 0; k < 10; k++) ch.add(T(0.014, 0.003, 4, 10), 0, -0.02 - k * 0.028, 0, 0, (k % 2) * PI / 2, PI / 2); ch.mesh(sw, CHROME());
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; rod(sw, V3(0, -0.3, 0), V3(Math.cos(a) * 0.15, -0.5, Math.sin(a) * 0.15), 0.003, CHROME()); }
  mk(sw, LA(smooth([[0.001, 0], [0.13, 0.0], [0.17, 0.04], [0.17, 0.9], [0.13, 0.98], [0.001, 0.99]], 16), 32), L, 0, -1.5, 0);
  for (const y of [-0.62, -1.2]) mk(sw, T(0.171, 0.012, 6, 40), paintG('#111', 0.5), 0, y, 0, PI / 2);
  mk(sw, B(0.2, 0.12, 0.01, 0.004), paintG('#f2f0ea', 0.5), 0, -0.9, 0.172);
  addTick(g, t => { sw.rotation.z = Math.sin(t * 1.2) * 0.012; sw.rotation.x = Math.sin(t * 0.9) * 0.01; });
  return g;
}
// 大きなきのこのランプ
function mushroomLamp(s) {
  const g = new THREE.Group();
  const cap = cm('mushcap', () => phys({ color: '#ffffff', roughness: 0.35, clearcoat: 0.8, emissive: '#ff6a4a', emissiveIntensity: 0.25, map: canvasTex('mushtex', 512, 256, (ctx, w, h) => { ctx.fillStyle = '#d02a24'; ctx.fillRect(0, 0, w, h); const R = rng(2); ctx.fillStyle = '#fbf4e6'; for (let i = 0; i < 28; i++) { const y = R() * h * 0.85; ctx.beginPath(); ctx.ellipse(R() * w, y, 10 + R() * 18, (10 + R() * 18) * 0.7, 0, 0, TAU); ctx.fill(); } }) }));
  const stem = cm('mushstem', () => phys({ color: '#f4ecdc', roughness: 0.7, emissive: '#ffd8a0', emissiveIntensity: 0.25 }));
  mk(g, LA(smooth([[0.12, 0], [0.13, 0.05], [0.09, 0.2], [0.075, 0.6], [0.08, 0.95], [0.09, 1.02]], 20), 32), stem, 0, 0, 0);
  mk(g, LA(smooth([[0.38, 0.0], [0.39, 0.03], [0.35, 0.15], [0.24, 0.27], [0.001, 0.33]], 20), 48), cap, 0, 1.0, 0);
  const gill = new THREE.MeshStandardMaterial({ color: '#f8e8cc', emissive: '#ffcf8a', emissiveIntensity: 1.4, roughness: 0.7, side: THREE.DoubleSide });
  mk(g, cg('gill', () => new THREE.RingGeometry(0.09, 0.38, 48, 1).rotateX(PI / 2)), gill, 0, 1.0, 0).castShadow = false;
  // 小さなきのこ
  for (const [x, z, k] of [[0.2, 0.12, 0.35], [-0.18, 0.15, 0.25]]) { const sub = new THREE.Group(); sub.position.set(x, 0, z); sub.scale.setScalar(k); g.add(sub); mk(sub, LA(smooth([[0.12, 0], [0.09, 0.2], [0.08, 0.95]], 10), 16), stem, 0, 0, 0); mk(sub, LA(smooth([[0.38, 0.0], [0.35, 0.15], [0.001, 0.33]], 12), 24), cap, 0, 0.95, 0); }
  const sp = sparkles(g, shellPts(20, 0.4, 0.6, 7, -0.2).map((v, i) => i % 3 === 1 ? v * 0.6 + 0.8 : v), { size: 0.025, colors: ['#d0ff8a', '#ffe08a'], speed: 1.3, base: 0.1 });
  addTick(g, t => { sp.material.uniforms.uTime.value = t; gill.emissiveIntensity = 1.3 + 0.15 * Math.sin(t * 0.9); });
  setLight(g, 0.95, 1.0, '#ffcf8a');
  return g;
}
// 透明のバブルチェア（天井から吊る）
function bubbleChair(s) {
  const g = new THREE.Group();
  mk(g, C(0.06, 0.06, 0.02, 16), CHROME(), 0, -0.01, 0);
  const ch = new Bag(); for (let k = 0; k < 16; k++) ch.add(T(0.016, 0.0035, 4, 10), 0, -0.03 - k * 0.032, 0, 0, (k % 2) * PI / 2, PI / 2); ch.mesh(g, CHROME());
  const y = -1.1;
  const shellG = cg('bubble', () => new THREE.SphereGeometry(0.55, 40, 28, 0, TAU, 0, PI * 0.8).rotateX(-(PI / 2 - 0.15)));
  mk(g, shellG, cm('acrylBubble', () => phys({ color: '#ffffff', roughness: 0.02, transparent: true, opacity: 0.18, envMapIntensity: 3, side: THREE.DoubleSide, depthWrite: false })), 0, y, 0);
  const od = 0.55 * Math.cos(PI * 0.2);
  mk(g, T(0.55 * Math.sin(PI * 0.8), 0.02, 8, 64), CHROME(), 0, y - Math.sin(0.15) * od, Math.cos(0.15) * od, 0.15);
  mk(g, S(0.06, 12, 8), CHROME(), 0, y + 0.55, 0);
  const cu = cloth(s.fabric || '#f2f2f2');
  mk(g, LA(smooth([[0.001, 0], [0.36, 0.0], [0.4, 0.06], [0.33, 0.12], [0.001, 0.12]], 10), 32), cu, 0, y - 0.4, 0.05);
  mk(g, B(0.5, 0.45, 0.14, 0.07), cu, 0, y - 0.05, -0.32, -0.25);
  mk(g, B(0.32, 0.28, 0.12, 0.06), cloth('#ff8ab0'), 0.12, y - 0.12, -0.18, -0.3, 0.3);
  return g;
}

// ---------------- 期間限定イベント：ウィンターフェス（1.12.0）。ガチャには出ず、イベントのごほうびでもらう ----------------
const NEEDLE = () => cm('xneedle', () => std({ color: '#1d5a34', roughness: 0.85 }));
const SNOW = () => cm('xsnow', () => std({ color: '#f3f6fa', roughness: 0.92 }));
const CONE = (r, h, seg = 18) => cg(`xcone${r4(r)},${r4(h)},${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
// クリスマスツリー（オーナメントがまたたく）
function xmasTree(s) {
  const g = new THREE.Group();
  mk(g, LA(smooth([[0.001, 0], [0.2, 0], [0.24, 0.05], [0.24, 0.28], [0.26, 0.3], [0.001, 0.3]], 10), 24), cm('xpot', () => std({ color: '#8e1f24', roughness: 0.5 })), 0, 0, 0);
  rod(g, V3(0, 0.28, 0), V3(0, 0.5, 0), 0.05, cm('xtrunk', () => std({ color: '#5b3a22', roughness: 0.9 })));
  const tiers = [[0.62, 0.62, 0.45], [0.5, 0.56, 0.82], [0.38, 0.5, 1.15], [0.24, 0.42, 1.45]];
  for (const [r, h, y] of tiers) mk(g, CONE(r, h), NEEDLE(), 0, y + h / 2, 0);
  // オーナメント（らせん）
  const cols = ['#e23b3b', '#f2c66d', '#3b7be2', '#f5f5f5', '#e27b3b'], mats = [];
  for (let i = 0; i < 34; i++) {
    const t = i / 34, y = 0.55 + t * 1.25, rad = (0.6 - t * 0.48) * 0.92, a = t * TAU * 4.2;
    const c = cols[i % cols.length], m = phys({ color: c, emissive: c, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.2 });
    m.userData.ph = i * 1.37; mats.push(m);
    mk(g, S(0.032, 12, 8), m, Math.cos(a) * rad, y, Math.sin(a) * rad).castShadow = false;
  }
  const star = mk(g, EX('xstar', starShape(0.11, 0.045), 0.03, 0.006, 4), cm('xstarm', () => phys({ color: '#ffd76a', emissive: '#ffbb33', emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 })), 0, 1.95, 0);
  star.castShadow = false;
  addTick(g, t => { for (const m of mats) m.emissiveIntensity = 0.25 + 1.1 * Math.max(0, Math.sin(t * 1.6 + m.userData.ph)); star.rotation.y = Math.sin(t * 0.5) * 0.4; });
  setLight(g, 1.3, 0.9, '#ffcf8a');
  return g;
}
// 雪だるま（マフラーとバケツの帽子）
function snowman(s) {
  const g = new THREE.Group();
  mk(g, S(0.28, 24, 16), SNOW(), 0, 0.26, 0).scale.y = 0.92;
  mk(g, S(0.2, 24, 16), SNOW(), 0, 0.66, 0);
  mk(g, S(0.145, 24, 16), SNOW(), 0, 0.95, 0);
  const coal = cm('xcoal', () => std({ color: '#151515', roughness: 0.6 }));
  for (const sx of [-1, 1]) mk(g, S(0.018, 10, 8), coal, sx * 0.05, 0.99, 0.13);
  for (const y of [0.58, 0.68, 0.78]) mk(g, S(0.02, 10, 8), coal, 0, y, 0.19 - Math.abs(y - 0.68) * 0.4);
  mk(g, CONE(0.022, 0.13, 10), cm('xcarrot', () => std({ color: '#f07a1c', roughness: 0.6 })), 0, 0.95, 0.19, PI / 2, 0, 0);
  const red = cm('xscarf', () => std({ color: '#c8262c', roughness: 0.85 }));
  mk(g, T(0.15, 0.035, 8, 28), red, 0, 0.82, 0, PI / 2, 0, 0);
  mk(g, B(0.07, 0.2, 0.025, 0.008), red, 0.09, 0.72, 0.13, 0, 0, 0.25);
  mk(g, C(0.1, 0.12, 0.14, 20), cm('xbucket', () => std({ color: '#2f3b55', roughness: 0.4, metalness: 0.4 })), 0, 1.12, 0, -0.12, 0, 0.1);
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.17, 0.7, 0), V3(sx * 0.42, 0.88, 0.04), 0.012, cm('xtwig', () => std({ color: '#4a2f1c', roughness: 0.9 })), 0.006);
  return g;
}
// プレゼントの山（リボンつき）
function giftPile(s) {
  const g = new THREE.Group();
  const boxes = [[-0.18, 0, 0.34, 0.3, 0.3, '#c8262c', '#f2c66d', 0.2], [0.2, 0, 0.3, 0.22, 0.26, '#1f6b45', '#f5f5f5', -0.3], [0.0, 0.3, 0.24, 0.2, 0.22, '#2f5fb8', '#f2c66d', 0.5], [0.05, 0, 0.2, 0.16, 0.2, '#f2c66d', '#c8262c', 0.1]];
  boxes.forEach(([x, y0, w, h, d, c, rc, ry], i) => {
    const z = i === 3 ? 0.24 : 0;
    const box = new THREE.Group(); box.position.set(x, y0, z); box.rotation.y = ry; g.add(box);
    const bm = cm('xbox' + c, () => std({ color: c, roughness: 0.55 })), rm = cm('xrib' + rc, () => phys({ color: rc, roughness: 0.3, metalness: 0.3, sheen: 0.5 }));
    mk(box, B(w, h, d, 0.006), bm, 0, h / 2, 0);
    mk(box, B(w + 0.004, h + 0.004, 0.04, 0.002), rm, 0, h / 2, 0);
    mk(box, B(0.04, h + 0.004, d + 0.004, 0.002), rm, 0, h / 2, 0);
    for (const sx of [-1, 1]) mk(box, T(0.035, 0.01, 6, 16), rm, sx * 0.03, h + 0.025, 0, 0, PI / 2, sx * 0.5);
  });
  return g;
}

// =====================================================================
// 一覧と入口
// =====================================================================
const BUILDERS = {
  // ★3
  arcLamp: [arcLamp, 'floor'], chesterChair: [chesterChair, 'floor'], peacockChair: [peacockChair, 'floor'], barCart: [barCart, 'floor'],
  marbleSide: [marbleSide, 'floor'], gildedMirror: [gildedMirror, 'wall'], tiffanyLamp: [tiffanyLamp, 'floor'], gramophone: [gramophone, 'floor'],
  globeBar: [globeBar, 'floor'], plantStand: [plantStand, 'floor'], decanterSet: [decanterSet, 'floor'], botanical: [botanical, 'wall'], candelabra: [candelabra, 'floor'],
  loungeChair: [loungeChair, 'floor'], globePendant: [globePendant, 'ceiling'], travSide: [travSide, 'floor'], bigPlant: [bigPlant, 'floor'],
  rug: [rug, 'floor'], sideboard: [sideboard, 'floor'], boucleSofa: [boucleSofa, 'floor'], tripodLamp: [tripodLamp, 'floor'],
  roundMirror: [roundMirror, 'wall'], abstractArt: [abstractArt, 'wall'], vaseSet: [vaseSet, 'floor'], opalSconce: [opalSconce, 'wall'],
  marbleCoffee: [marbleCoffee, 'floor'], pouf: [pouf, 'floor'], etagere: [etagere, 'floor'], bankerLamp: [bankerLamp, 'floor'],
  // ★4
  jukebox: [jukebox, 'floor'], neonSunset: [neonSunset, 'wall'], hammock: [hammock, 'floor'], arcade: [arcade, 'floor'],
  astronaut: [astronaut, 'floor'], plantTower: [plantTower, 'floor'], eggChair: [eggChair, 'floor'], lavaLamp: [lavaLamp, 'floor'],
  discoBall: [discoBall, 'ceiling'], retroTV: [retroTV, 'floor'], surfboard: [surfboard, 'wall'], vending: [vending, 'floor'],
  punchBag: [punchBag, 'ceiling'], mushroomLamp: [mushroomLamp, 'floor'], bubbleChair: [bubbleChair, 'ceiling'],
  // ★5 恒常
  crystalChandelier: [crystalChandelier, 'ceiling'], leatherSofa: [leatherSofa, 'floor'], fireplace: [fireplace, 'floor'],
  grandPiano: [grandPiano, 'floor'], aquarium: [aquarium, 'floor'], canopyBed: [canopyBed, 'floor'],
  // ★5 限定：星空
  starPendant: [starPendant, 'ceiling'], planetarium: [planetarium, 'floor'], moonSofa: [moonSofa, 'floor'], constellation: [constellation, 'wall'], moonTable: [moonTable, 'floor'],
  // 限定：バンド（★5 ＋ ★4）
  neonRock: [neonRock, 'wall'], ampStack: [ampStack, 'floor'], guitarStand: [guitarStand, 'floor'], studSofa: [studSofa, 'floor'],
  drumKit: [drumKit, 'floor'], guitarRack: [guitarRack, 'floor'], stageTruss: [stageTruss, 'ceiling'], micStand: [micStand, 'floor'], keyboardRig: [keyboardRig, 'floor'],
  spotLamp: [spotLamp, 'floor'], drumThrone: [drumThrone, 'floor'], flightCase: [flightCase, 'floor'], ampShelf: [ampShelf, 'floor'],
  kickPlanter: [kickPlanter, 'floor'], pedalboard: [pedalboard, 'floor'], posterWall: [posterWall, 'wall'],
  // ★5 限定：ゴシック
  gothChandelier: [gothChandelier, 'ceiling'], roseWindow: [roseWindow, 'wall'], gothThrone: [gothThrone, 'floor'], candleTree: [candleTree, 'floor'], gothCabinet: [gothCabinet, 'floor'],
  // ★5 限定：和の雅
  // 期間限定イベント（ウィンターフェス）
  xmasTree: [xmasTree, 'floor'], snowman: [snowman, 'floor'], giftPile: [giftPile, 'floor'],
  sakuraTree: [sakuraTree, 'floor'], byobu: [byobu, 'floor'], andon: [andon, 'floor'], tsukubai: [tsukubai, 'floor'], lacquerTable: [lacquerTable, 'floor'],
  // 称号・図鑑のごほうび家具（js/rewardfurn.js。ガチャには出ない）
  ...REWARD_BUILDERS,
  // 限定：旅館シリーズ（js/ryokanfurn.js）
  ...RYOKAN_BUILDERS,
};
// 種類 → 置き方
export const GACHA_TYPES = Object.fromEntries(Object.entries(BUILDERS).map(([k, v]) => [k, { place: v[1] }]));

// spec = { type, ...引数 } → THREE.Group（すぐ返す）
// 動く家具は userData.tick(t, dt) を持つ。光る家具は userData.light を持つ。
export function buildGacha(spec = {}) {
  const b = BUILDERS[spec.type];
  let g = null;
  try { g = b ? b[0](spec) : null; } catch (e) { console.warn('buildGacha', spec, e); g = null; }
  if (!g) {
    g = new THREE.Group();
    mk(g, B(0.3, 0.3, 0.3, 0.02), paintG('#c9b07a', 0.3, 0.6), 0, 0.15, 0);
  }
  g.userData.gacha = { ...spec };
  g.name = 'gacha-' + (spec.type || 'unknown');
  return g;
}
