// 自作家具：基本の形（箱・円柱・回転体・チューブ）を組み合わせて、家具・照明・小物を作る。
// buildProc(spec) は THREE.Group をすぐ返す。布や石の質感（テクスチャ）は、あとから読み込んで差しこむ。
// 正面は +Z。壁に掛ける物は背中が -Z（z=0 が壁の面）。単位はメートル。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { texturedMaterial, loadTex } from './loaders.js';

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
// くり返しても継ぎ目が出ない（px, py ごとに一周する）ノイズ
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
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
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

const WOOD = {
  oak: ['#cfa36b', '#9b6a39'], walnut: ['#74492b', '#3b2112'],
  pine: ['#ead4ab', '#c8a271'], ash: ['#c3b8a6', '#8d8170'],
};
// 木目（横に流れる）。1枚で 0.8m 四方
function woodTex(kind) {
  return canvasTex('wood-' + kind, 512, 512, (ctx, w, h) => {
    const L = hexRGB(WOOD[kind][0]), D = hexRGB(WOOD[kind][1]);
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 2, v * 6, 2, 6, 3, 7);
      const n2 = fbm(u * 1, v * 24, 1, 24, 2, 13);
      let ring = 0.5 + 0.5 * Math.sin((v * 30 + n * 1.6 + n2 * 0.8) * TAU);
      ring = ring * ring * ring;
      const pore = vn(u * 4, v * 360, 4, 360, 3);
      const f = clamp(ring * 0.45 + pore * 0.25 + (n - 0.5) * 0.5 + 0.12, 0, 1);
      const c = mixRGB(L, D, f);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1.25 });
}
// 大理石（白 / 黒）
function marbleTex(dark) {
  return canvasTex('marble-' + dark, 512, 512, (ctx, w, h) => {
    const base = hexRGB(dark ? '#1d1d1f' : '#eeece8'), vein = hexRGB(dark ? '#d8d4cc' : '#8f8c88');
    const base2 = hexRGB(dark ? '#2b2a2c' : '#dcd8d2');
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 4, v * 4, 4, 4, 5, 11);
      const s = 1 - Math.abs(Math.sin((u * 2 + v + n * 2.2) * PI));
      const s2 = 1 - Math.abs(Math.sin((u - v * 2 + n * 3.1) * TAU));
      const vv = Math.pow(s, 18) * 0.9 + Math.pow(s2, 30) * 0.5;
      let c = mixRGB(base, base2, fbm(u * 8, v * 8, 8, 8, 3, 5));
      c = mixRGB(c, vein, clamp(vv, 0, 1));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1 });
}
// 籐の編み目。1枚で 0.12m
function rattanTex() {
  return canvasTex('rattan', 256, 256, (ctx, w, h) => {
    const A = hexRGB('#c79c5e'), B = hexRGB('#7d5629');
    pixels(ctx, w, h, (u, v, o) => {
      const cu = Math.floor(u * 8), cv = Math.floor(v * 8);
      const fu = u * 8 - cu, fv = v * 8 - cv;
      const over = (cu + cv) % 2 === 0;
      const t = over ? Math.sin(fv * PI) : Math.sin(fu * PI);
      const edge = over ? Math.sin(fu * PI) : Math.sin(fv * PI);
      const c = mixRGB(B, A, clamp(t * 0.6 + edge * 0.5 + (h2(u * 999, v * 999) - 0.5) * 0.15, 0, 1));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 8 });
}
// 木の切り口（年輪）
function ringsTex() {
  return canvasTex('rings', 256, 256, (ctx, w, h) => {
    const L = hexRGB('#d9b382'), D = hexRGB('#9c6b3e'), bark = hexRGB('#4a3020');
    pixels(ctx, w, h, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
      const n = fbm(u * 6, v * 6, 6, 6, 3, 2);
      let ring = 0.5 + 0.5 * Math.sin((r * 16 + n * 1.5) * TAU);
      ring = ring ** 3;
      let c = mixRGB(L, D, ring * 0.7 + n * 0.2);
      if (r > 0.93) c = bark;
      // 割れ目
      const ang = Math.atan2(dy, dx);
      if (r > 0.25 && Math.abs(Math.sin(ang * 3 + 1)) < 0.015 * (r * 2)) c = mixRGB(c, D, 0.8);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1 });
}
// 木の皮（縦の割れ目）
function barkTex() {
  return canvasTex('bark', 256, 256, (ctx, w, h) => {
    const A = hexRGB('#6b4a33'), B = hexRGB('#2e2018');
    pixels(ctx, w, h, (u, v, o) => {
      const n = fbm(u * 16, v * 3, 16, 3, 4, 9);
      const c = mixRGB(A, B, clamp(Math.pow(1 - Math.abs(n - 0.5) * 2, 6) + (n - 0.5) * 0.3, 0, 1));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1 });
}

// ---------- 材質 ----------
export const MATS = {
  oak: '明るい木', walnut: 'こげ茶の木', pine: '白っぽい木', ash: '灰色がかった木',
  white: '白塗装', black: '黒塗装/黒鉄', brass: '真ちゅう', chrome: 'クローム', gunmetal: '鉄', copper: '銅',
  marble: '白大理石', blackMarble: '黒大理石', glass: 'ガラス', smoked: 'スモークガラス',
  rattan: '籐', concrete: 'コンクリート', ceramic: '白い陶器', terracotta: '素焼き',
  linen: '生成りの布', leather: '茶色の革', blackLeather: '黒い革', velvet: 'ベルベット（色は fabric で）',
};
const UPHOL = ['linen', 'leather', 'blackLeather', 'velvet', 'fabric'];
const MC = new Map();
const cm = (k, make) => { let m = MC.get(k); if (!m) { m = make(); MC.set(k, m); } return m; };
const std = o => new THREE.MeshStandardMaterial(o);

// Poly Haven の質感を、あとから材質に差しこむ（法線・粗さだけ使うと色は自由に決められる）
const texP = new Map();
function applyTex(m, id, { map = false, normal = true, rough = true, tile = 0.5, nScale = 1 } = {}) {
  if (!texP.has(id)) texP.set(id, texturedMaterial(id).catch(() => null));
  texP.get(id).then(src => {
    if (!src) return;
    const set = (k, on) => {
      if (!on || !src[k]) return;
      const t = src[k].clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / tile, 1 / tile);
      t.needsUpdate = true;
      m[k] = t;
    };
    set('map', map); set('normalMap', normal); set('roughnessMap', rough);
    if (m.normalMap) m.normalScale.set(nScale, nScale);
    if (map && m.map) m.color.set('#ffffff');
    m.needsUpdate = true;
  });
}

export function paint(hex, rough = 0.5, metal = 0) {
  return cm('p' + hex + rough + metal, () => std({ color: hex, roughness: rough, metalness: metal }));
}
function upholMat(kind, color) {
  const def = { linen: '#d9d0c0', leather: '#6b3d22', blackLeather: '#1f1d1c', velvet: '#2f5a4c', fabric: '#8d8f8a' };
  color = color || def[kind] || def.fabric;
  return cm('u' + kind + color, () => {
    let m;
    if (kind === 'velvet') {
      m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.82, sheen: 1, sheenRoughness: 0.4,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4),
      });
      applyTex(m, 'poly_wool_herringbone', { tile: 0.25, nScale: 0.25, rough: false });
    } else if (kind === 'leather' || kind === 'blackLeather') {
      m = std({ color, roughness: 0.5 });
      applyTex(m, 'fabric_leather_02', { tile: 0.35, nScale: 0.7, rough: false });
    } else {
      m = std({ color, roughness: 0.96 });
      applyTex(m, kind === 'linen' ? 'denim_fabric' : 'poly_wool_herringbone', { tile: 0.3, nScale: 0.7 });
    }
    return m;
  });
}
function baseMat(key) {
  return cm('m' + key, () => {
    switch (key) {
      case 'oak': case 'walnut': case 'pine': case 'ash': {
        const map = woodTex(key);
        return std({ color: map ? '#ffffff' : WOOD[key][0], map, roughness: key === 'walnut' ? 0.5 : 0.6 });
      }
      case 'white': return std({ color: '#f1eee8', roughness: 0.5 });
      case 'black': return std({ color: '#1d1d1d', roughness: 0.42, metalness: 0.45 });
      case 'brass': return std({ color: '#d0a85c', roughness: 0.3, metalness: 1 });
      case 'chrome': return std({ color: '#f2f2f2', roughness: 0.07, metalness: 1 });
      case 'gunmetal': return std({ color: '#4b4e52', roughness: 0.42, metalness: 0.85 });
      case 'copper': return std({ color: '#c97e57', roughness: 0.3, metalness: 1 });
      case 'marble': case 'blackMarble': {
        const map = marbleTex(key === 'blackMarble');
        return std({ color: map ? '#ffffff' : (key === 'marble' ? '#eeece8' : '#1e1e20'), map, roughness: 0.16 });
      }
      case 'glass': return new THREE.MeshPhysicalMaterial({ color: '#eef5f3', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
      case 'smoked': return new THREE.MeshPhysicalMaterial({ color: '#2c2b29', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      case 'rattan': { const map = rattanTex(); return std({ color: map ? '#ffffff' : '#b98d55', map, roughness: 0.85 }); }
      case 'concrete': { const m = std({ color: '#a4a29d', roughness: 0.95 }); applyTex(m, 'concrete_floor_02', { map: true, tile: 1.2 }); return m; }
      case 'ceramic': return std({ color: '#f2efe8', roughness: 0.25 });
      case 'terracotta': return std({ color: '#b4613d', roughness: 0.92 });
      default: return upholMat(key);
    }
  });
}
// 材質キー / '#色' / 材質そのもの → 材質
function matOf(v, def = 'oak') {
  if (v && v.isMaterial) return v;
  if (typeof v === 'string') {
    if (MATS[v] || v === 'fabric') return baseMat(v);
    if (v[0] === '#') return paint(v);
  }
  return def && def !== v ? matOf(def, null) : baseMat('oak');
}
const isWoodKey = k => k in WOOD;
// 布張りの材質（spec.mat / spec.cover が革やベルベットならそれ、色は fabric）
function uphol(s, defColor, defKind = 'fabric') {
  const kind = UPHOL.includes(s.cover) ? s.cover : UPHOL.includes(s.mat) ? s.mat : defKind;
  return upholMat(kind, s.fabric || (kind === defKind ? defColor : undefined));
}
const glow = (color = '#ffd9a8', i = 2.5) => cm('g' + color + i, () => std({ color: '#ffffff', emissive: color, emissiveIntensity: i, roughness: 0.4 }));
const BULB = () => glow('#ffd29a', 2.6);
const OPAL = () => cm('opal', () => std({ color: '#fffaf2', emissive: '#ffe3bf', emissiveIntensity: 1.4, roughness: 0.25 }));
// かさの内側（少し光る）
const innerMat = c => cm('in' + c, () => std({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.3, side: THREE.BackSide }));
// 布や紙のかさ（外側も少し透けて光る）
const shadeMat = c => cm('sh' + c, () => std({ color: c, roughness: 0.92, emissive: c, emissiveIntensity: 0.22, side: THREE.DoubleSide }));
const paperMat = (i = 0.9) => cm('paper' + i, () => std({ color: '#f6f0e3', roughness: 0.9, emissive: '#ffdcaa', emissiveIntensity: i, side: THREE.DoubleSide }));
const CORD = () => paint('#151515', 0.6);
const MIRROR = () => cm('mirror', () => std({ color: '#e6edf0', metalness: 1, roughness: 0.04, emissive: '#3a4246', emissiveIntensity: 0.5 }));

// ---------- 形（使い回す） ----------
const GC = new Map();
const cg = (k, make) => { let g = GC.get(k); if (!g) { g = make(); GC.set(k, g); } return g; };
const r4 = v => Math.round(v * 10000);
// 面の向きに合わせて、メートル単位の UV を作る（木目は長い辺の向きに流れる）
function worldUV(g) {
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
    uv[i * 2] = p[i * 3 + a]; uv[i * 2 + 1] = p[i * 3 + b];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// 角の丸い箱
function B(w, h, d, r) {
  r = r ?? Math.min(0.01, Math.min(w, h, d) * 0.3);
  r = Math.min(r, Math.min(w, h, d) * 0.49);
  return cg(`b${r4(w)},${r4(h)},${r4(d)},${r4(r)}`, () => worldUV(r > 0.0006 ? new RoundedBoxGeometry(w, h, d, r >= 0.008 ? 2 : 1, r) : new THREE.BoxGeometry(w, h, d)));
}
const C = (rt, rb, h, seg = 16, open = false) =>
  cg(`c${r4(rt)},${r4(rb)},${r4(h)},${seg},${open}`, () => worldUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)));
const S = (r, ws = 16, hs = 12) => cg(`s${r4(r)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const T = (R, r, rs = 8, ts = 32, arc = TAU) => cg(`t${r4(R)},${r4(r)},${rs},${ts},${r4(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
// 回転体：pts = [[半径, 高さ], ...]（下から上へ）
const LA = (pts, seg = 32, wuv = false) => cg('l' + seg + wuv + pts.map(p => r4(p[0]) + ',' + r4(p[1])).join(';'), () => {
  const g = new THREE.LatheGeometry(pts.map(p => V2(Math.max(p[0], 0.0001), p[1])), seg);
  return wuv ? worldUV(g) : g;
});
// 点をなめらかにつないだ輪郭
function smooth(pts, n = 24) {
  return new THREE.SplineCurve(pts.map(p => V2(p[0], p[1]))).getPoints(n).map(v => [v.x, v.y]);
}
// ふちの丸い円盤（天板など）
const DISC = (r, t, seg = 48) => {
  const e = Math.min(t * 0.35, 0.006);
  return LA([[0, -t / 2], [r - e, -t / 2], [r - e * 0.3, -t / 2 + e * 0.3], [r, -t / 2 + e], [r, t / 2 - e], [r - e * 0.3, t / 2 - e * 0.3], [r - e, t / 2], [0, t / 2]], seg, true);
};
// ふっくらしたクッション
// axis='z' のときは、前後（厚み）の方向にふくらむ（立てたクッション・背もたれ）
function cushionGeo(w, h, d, bulge = 0.25, seed = 1, axis = 'y') {
  return cg(`cu${r4(w)},${r4(h)},${r4(d)},${r4(bulge)},${seed}${axis}`, () => {
    if (axis === 'z') { const t = h; h = d; d = t; }
    let g = new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) > 1.0 ? 3 : 2, Math.min(w, h, d) * 0.32);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const nx = clamp(2 * x / w, -1, 1), ny = clamp(2 * y / h, -1, 1), nz = clamp(2 * z / d, -1, 1);
      const k = (1 - nx * nx) * (1 - nz * nz);
      const side = 1 + (1 - ny * ny) * 0.03;
      const wr = n3(x * 9, y * 9, z * 9, seed) * 0.004 + n3(x * 25, y * 25, z * 25, seed + 3) * 0.0015;
      p.setXYZ(i, x * side + wr, y + Math.sign(y) * k * h * bulge * 0.5 + wr, z * side + wr);
    }
    if (axis === 'z') g.rotateX(PI / 2);
    g.computeVertexNormals();
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
// a から b へ伸びる棒（r1 が a 側、r2 が b 側の太さ）
function rod(parent, a, b, r1, mat, r2 = r1, seg = 10) {
  const d = b.clone().sub(a), len = d.length();
  const m = mk(parent, C(r2, r1, 1, seg), mat);
  m.scale.y = len;
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
function tube(parent, pts, r, mat, seg = 32, rs = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : V3(p[0], p[1], p[2])), closed);
  return mk(parent, new THREE.TubeGeometry(curve, seg, r, rs, closed), mat);
}
// 小さな部品をまとめて1つの形にする（描く回数を減らす）
class Bag {
  constructor() { this.list = []; }
  add(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.clone() : geo.clone();
    const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.list.push(g.index ? g : g);
    return g;
  }
  addRod(a, b, r, seg = 6) {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, V3(1, 1, 1)));
    this.list.push(g);
  }
  mesh(parent, mat) {
    if (!this.list.length) return null;
    const idx = this.list.every(g => g.index), all = this.list.map(g => (idx ? g : (g.index ? g.toNonIndexed() : g)));
    const hasColor = all.some(g => g.attributes.color);
    for (const g of all) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (hasColor && !g.attributes.color) {
        const c = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
    }
    const merged = mergeGeometries(all);
    return mk(parent, merged, mat);
  }
}
function setLight(g, y, intensity = 1, color = '#ffd9a8') { g.userData.light = { color, intensity, y }; }
function bulb(g, x, y, z, r = 0.03) {
  mk(g, S(r, 14, 10), BULB(), x, y, z).castShadow = false;
  mk(g, C(r * 0.45, r * 0.45, r * 1.2, 10), paint('#c9b48a', 0.35, 1), x, y + r * 1.1, z);
}
const vc = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function colorGeo(g, faceColors) {
  // faceColors: BoxGeometry の 6面（+x,-x,+y,-y,+z,-z）の色
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) c.set(faceColors[f], (f * 4 + k) * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// =====================================================================
// 照明
// =====================================================================
const SOFT_KEYS = ['linen', 'velvet', 'fabric'];
function shadeColor(s, def = '#efe7d8') {
  return s.fabric || s.shade || (typeof s.mat === 'string' && s.mat[0] === '#' ? s.mat : def);
}
// 回転体のかさ（外側＋光る内側）
function shell(g, pts, outer, inner, y, seg = 32, x = 0, z = 0) {
  const geo = LA(pts, seg);
  mk(g, geo, outer, x, y, z);
  const m = mk(g, geo, inner, x, y, z); m.castShadow = false;
  return geo;
}
function rim(g, r, y, mat, t = 0.004, x = 0, z = 0) {
  mk(g, T(r, t, 6, 48), mat, x, y, z, PI / 2);
}
// 紙ちょうちん形（横のひだ付き）
function lanternGeo(R, H, ribs = 12, seg = 24) {
  const pts = [];
  const n = ribs * 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = R * Math.sin(PI * (0.1 + 0.8 * t));
    r *= 1 - 0.03 * Math.pow(Math.sin(t * PI * ribs), 2);
    pts.push([r, -H + H * t]);
  }
  return LA(pts, seg);
}
// ひだ付きのかさ
function pleatGeo(rt, rb, h, pleats = 32) {
  return cg(`pl${r4(rt)},${r4(rb)},${r4(h)},${pleats}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, pleats * 2, 1, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(x, z) / TAU * pleats;
      const f = Math.abs((((a % 1) + 1) % 1) - 0.5) * 2;
      const k = 1 + 0.06 * f;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}
// エジソン電球
function edison(g, x, y, z, s = 1) {
  const pts = smooth([[0.001, -0.13], [0.03, -0.125], [0.042, -0.1], [0.04, -0.07], [0.022, -0.035], [0.016, 0]], 16).map(p => [p[0] * s, p[1] * s]);
  const m = mk(g, LA(pts, 20), glow('#ffb35c', 2.2), x, y, z); m.castShadow = false;
  mk(g, C(0.017 * s, 0.017 * s, 0.03 * s, 12), paint('#b89a5e', 0.35, 1), x, y + 0.012 * s, z);
}

function pendant(s) {
  const g = new THREE.Group();
  const shape = s.shape || 'dome';
  const defM = { cone: 'black', dome: 'brass', globe: 'brass', drum: 'linen', bell: 'white', cage: 'black', cylinder: 'black', cluster: 'brass', lantern: 'white', disc: 'white', pleated: 'linen', industrial: 'gunmetal' }[shape] || 'black';
  const mkey = s.mat || defM;
  const soft = SOFT_KEYS.includes(mkey) || shape === 'lantern';
  const metal = soft ? baseMat('white') : matOf(mkey, defM);
  const inner = innerMat(s.inner || '#f6f1e7');
  const drop = s.drop ?? (shape === 'cluster' ? 0.7 : 0.6);
  // 天井の受け皿
  mk(g, DISC(shape === 'cluster' ? 0.14 : 0.065, 0.028), metal, 0, -0.014, 0);
  if (shape !== 'cluster') mk(g, C(0.0035, 0.0035, 1, 6), CORD(), 0, -0.028 - drop / 2, 0).scale.y = drop;
  const y = -0.028 - drop; // かさの上端
  let ly = y - 0.15;
  switch (shape) {
    case 'cone': {
      mk(g, C(0.035, 0.035, 0.06, 20), metal, 0, y - 0.03, 0);
      shell(g, [[0.21, -0.29], [0.2, -0.27], [0.038, -0.06], [0.035, -0.05]], metal, inner, y);
      rim(g, 0.2075, y - 0.284, metal, 0.0035);
      bulb(g, 0, y - 0.15, 0, 0.032); ly = y - 0.17; break;
    }
    case 'dome': {
      const pts = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push([Math.max(0.03, 0.24 * Math.cos(t * PI / 2)), -0.23 + 0.23 * Math.sin(t * PI / 2)]); }
      shell(g, [[0.245, -0.235], ...pts], metal, inner, y);
      mk(g, C(0.03, 0.035, 0.05, 20), metal, 0, y + 0.0, 0);
      rim(g, 0.243, y - 0.233, metal, 0.004);
      bulb(g, 0, y - 0.11, 0, 0.04); ly = y - 0.13; break;
    }
    case 'bell': {
      const pts = smooth([[0.19, -0.33], [0.17, -0.3], [0.125, -0.22], [0.095, -0.13], [0.075, -0.05], [0.045, 0]], 22);
      shell(g, pts, metal, inner, y);
      rim(g, 0.19, y - 0.33, metal, 0.004);
      mk(g, C(0.022, 0.03, 0.04, 16), metal, 0, y + 0.01, 0);
      bulb(g, 0, y - 0.17, 0, 0.035); ly = y - 0.19; break;
    }
    case 'industrial': {
      const pts = smooth([[0.25, -0.24], [0.235, -0.225], [0.17, -0.165], [0.095, -0.11], [0.075, -0.07], [0.07, -0.02], [0.04, 0]], 22);
      shell(g, pts, metal, innerMat(s.inner || '#f3f3ef'), y);
      rim(g, 0.25, y - 0.24, metal, 0.005);
      mk(g, C(0.02, 0.025, 0.06, 12), metal, 0, y + 0.01, 0);
      edison(g, 0, y - 0.04, 0, 1.0); ly = y - 0.14; break;
    }
    case 'cylinder': {
      mk(g, C(0.075, 0.075, 0.34, 32, true), metal, 0, y - 0.17, 0);
      mk(g, C(0.074, 0.074, 0.34, 32, true), inner, 0, y - 0.17, 0).castShadow = false;
      mk(g, DISC(0.075, 0.008, 32), metal, 0, y - 0.004, 0);
      mk(g, new THREE.CircleGeometry(0.068, 24).rotateX(PI / 2), glow('#ffe1b5', 1.6), 0, y - 0.3, 0).castShadow = false;
      ly = y - 0.3; break;
    }
    case 'drum': {
      const col = shadeColor(s);
      mk(g, C(0.24, 0.24, 0.26, 48, true), shadeMat(col), 0, y - 0.13, 0);
      mk(g, new THREE.CircleGeometry(0.235, 40).rotateX(PI / 2), glow('#ffe7c4', 1.1), 0, y - 0.255, 0).castShadow = false;
      rim(g, 0.24, y, paint('#c9a05a', 0.3, 1), 0.003); rim(g, 0.24, y - 0.26, paint('#c9a05a', 0.3, 1), 0.003);
      bulb(g, 0, y - 0.12, 0, 0.035); ly = y - 0.14; break;
    }
    case 'globe': {
      mk(g, C(0.04, 0.05, 0.04, 20), metal, 0, y - 0.02, 0);
      mk(g, S(0.15, 32, 20), OPAL(), 0, y - 0.17, 0).castShadow = false;
      ly = y - 0.17; break;
    }
    case 'cage': {
      mk(g, C(0.022, 0.022, 0.05, 12), metal, 0, y - 0.025, 0);
      edison(g, 0, y - 0.04, 0, 1.0);
      const prof = [[0.03, -0.03], [0.08, -0.07], [0.095, -0.13], [0.085, -0.19], [0.04, -0.235], [0.001, -0.245]];
      const bag = new Bag();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU;
        const curve = new THREE.CatmullRomCurve3(prof.map(([r, yy]) => V3(Math.cos(a) * r, yy, Math.sin(a) * r)));
        bag.list.push(new THREE.TubeGeometry(curve, 16, 0.0025, 5));
      }
      for (const [r, yy] of [[0.095, -0.13], [0.032, -0.03]]) bag.add(T(r, 0.003, 5, 40), 0, yy, 0, PI / 2);
      bag.mesh(g, metal).position.y = y;
      ly = y - 0.11; break;
    }
    case 'cluster': {
      const R = rng(strHash(JSON.stringify(s)));
      const pos = [[0, 0]];
      for (let k = 0; k < 5; k++) pos.push([Math.cos(k / 5 * TAU) * 0.09, Math.sin(k / 5 * TAU) * 0.09]);
      let sum = 0;
      pos.forEach(([x, z], i) => {
        const d = drop * (0.55 + R() * 0.5) + (i === 0 ? 0.15 : 0);
        mk(g, C(0.003, 0.003, 1, 6), CORD(), x, -0.028 - d / 2, z).scale.y = d;
        const r = 0.065 + R() * 0.03;
        mk(g, C(0.018, 0.022, 0.035, 14), metal, x, -0.028 - d - 0.015, z);
        mk(g, S(r, 24, 16), OPAL(), x, -0.028 - d - 0.03 - r * 0.95, z).castShadow = false;
        sum += -0.028 - d - 0.03 - r;
      });
      ly = sum / pos.length; break;
    }
    case 'lantern': {
      const H = 0.44;
      mk(g, lanternGeo(0.21, H), paperMat(0.95), 0, y - 0.01, 0).castShadow = false;
      const ring = paint('#1a1a1a', 0.5);
      mk(g, C(0.068, 0.068, 0.025, 24), ring, 0, y - 0.005, 0);
      mk(g, C(0.068, 0.068, 0.02, 24), ring, 0, y - H + 0.0, 0);
      ly = y - H / 2; break;
    }
    case 'disc': {
      mk(g, DISC(0.26, 0.028), metal, 0, y - 0.014, 0);
      mk(g, C(0.03, 0.03, 0.03, 16), metal, 0, y + 0.0, 0);
      mk(g, new THREE.CircleGeometry(0.245, 48).rotateX(PI / 2), glow('#ffe7c4', 1.6), 0, y - 0.0285, 0).castShadow = false;
      ly = y - 0.06; break;
    }
    case 'pleated': {
      const col = shadeColor(s, '#efe6d6');
      mk(g, pleatGeo(0.11, 0.22, 0.26), shadeMat(col), 0, y - 0.13, 0);
      rim(g, 0.115, y, paint('#c9a05a', 0.3, 1), 0.003);
      bulb(g, 0, y - 0.13, 0, 0.035); ly = y - 0.15; break;
    }
  }
  setLight(g, ly, s.intensity ?? 1);
  return g;
}

function floorlamp(s) {
  const g = new THREE.Group();
  const shape = s.shape || 'arc';
  const defM = { arc: 'chrome', tripod: 'walnut', column: 'oak', drum: 'brass', globe: 'black', paper: 'black', torch: 'brass' }[shape] || 'black';
  const m = matOf(s.mat, defM);
  const col = s.shade || s.fabric || '#efe7d8';
  const baseDisc = (r = 0.15, t = 0.025) => mk(g, DISC(r, t), m, 0, t / 2, 0);
  let ly = 1.5;
  switch (shape) {
    case 'arc': {
      mk(g, B(0.3, 0.07, 0.3, 0.012), baseMat('marble'), 0, 0.035, 0);
      mk(g, C(0.02, 0.02, 0.06, 16), m, 0, 0.1, 0);
      tube(g, [[0, 0.1, 0], [0, 0.9, 0], [0.05, 1.6, 0], [0.35, 2.02, 0], [0.8, 2.12, 0], [1.2, 2.0, 0], [1.38, 1.82, 0]], 0.012, m, 64, 8);
      // かさ（ドーム）
      const pts = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([Math.max(0.02, 0.2 * Math.cos(t * PI / 2)), -0.18 + 0.18 * Math.sin(t * PI / 2)]); }
      shell(g, pts, m, innerMat('#f5f1ea'), 1.84, 40, 1.4, 0);
      bulb(g, 1.4, 1.73, 0, 0.035);
      ly = 1.7; break;
    }
    case 'tripod': {
      const top = V3(0, 1.32, 0);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + PI / 2;
        rod(g, V3(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36), top, 0.012, m, 0.02, 8);
      }
      mk(g, C(0.025, 0.025, 0.06, 12), paint('#1a1a1a', 0.4, 0.5), 0, 1.33, 0);
      mk(g, C(0.006, 0.006, 0.12, 6), paint('#1a1a1a', 0.4, 0.5), 0, 1.4, 0);
      mk(g, C(0.21, 0.24, 0.32, 48, true), shadeMat(col), 0, 1.55, 0);
      bulb(g, 0, 1.47, 0, 0.035);
      ly = 1.5; break;
    }
    case 'column': {
      // 行灯（あんどん）風の柱の明かり
      const W = 0.22, H = 1.25;
      mk(g, B(W + 0.04, 0.04, W + 0.04, 0.006), m, 0, 0.02, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, B(0.022, H, 0.022, 0.003), m, sx * W / 2, 0.04 + H / 2, sz * W / 2);
      for (const yy of [0.12, H * 0.5 + 0.04, H + 0.03]) {
        for (const sz of [-1, 1]) mk(g, B(W, 0.018, 0.018, 0.003), m, 0, yy, sz * W / 2);
        for (const sx of [-1, 1]) mk(g, B(0.018, 0.018, W, 0.003), m, sx * W / 2, yy, 0);
      }
      mk(g, B(W - 0.01, H - 0.12, W - 0.01, 0.001), paperMat(0.9), 0, 0.12 + (H - 0.12) / 2 + 0.01, 0).castShadow = false;
      mk(g, B(W + 0.03, 0.025, W + 0.03, 0.005), m, 0, H + 0.06, 0);
      ly = 0.75; break;
    }
    case 'drum': {
      baseDisc(0.16, 0.025);
      mk(g, C(0.009, 0.009, 1.28, 10), m, 0, 0.66, 0);
      mk(g, C(0.26, 0.26, 0.34, 48, true), shadeMat(col), 0, 1.42, 0);
      mk(g, new THREE.CircleGeometry(0.255, 40).rotateX(PI / 2), glow('#ffe7c4', 0.9), 0, 1.252, 0).castShadow = false;
      rim(g, 0.26, 1.25, m, 0.003); rim(g, 0.26, 1.59, m, 0.003);
      bulb(g, 0, 1.4, 0, 0.035);
      ly = 1.42; break;
    }
    case 'globe': {
      baseDisc(0.15, 0.03);
      mk(g, C(0.01, 0.01, 1.22, 10), m, 0, 0.64, 0);
      mk(g, C(0.035, 0.045, 0.05, 16), m, 0, 1.27, 0);
      mk(g, S(0.18, 32, 20), OPAL(), 0, 1.46, 0).castShadow = false;
      ly = 1.46; break;
    }
    case 'paper': {
      // 細い脚の上の、紙の縦長ランプ
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + PI / 2;
        rod(g, V3(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17), V3(Math.cos(a) * 0.05, 0.36, Math.sin(a) * 0.05), 0.005, m, 0.005, 6);
      }
      mk(g, C(0.004, 0.004, 1.0, 6), m, 0, 0.82, 0);
      const pts = [];
      const n = 64, H = 1.05;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        let r = 0.07 + 0.15 * Math.pow(Math.sin(PI * t), 0.7);
        r *= 1 - 0.035 * Math.pow(Math.sin(t * PI * 22), 2);
        pts.push([r, 0.35 + H * t]);
      }
      mk(g, LA(pts, 28), paperMat(0.95), 0, 0, 0).castShadow = false;
      ly = 0.9; break;
    }
    case 'torch': {
      baseDisc(0.17, 0.03);
      mk(g, C(0.011, 0.011, 1.62, 10), m, 0, 0.84, 0);
      mk(g, C(0.016, 0.016, 0.04, 12), m, 0, 0.85, 0);
      const pts = smooth([[0.02, -0.02], [0.08, 0.0], [0.18, 0.06], [0.24, 0.13], [0.25, 0.14]], 18);
      const geo = LA(pts, 40);
      mk(g, geo, m, 0, 1.66, 0);
      mk(g, geo, innerMat('#fbf2e2'), 0, 1.66, 0).castShadow = false;
      mk(g, new THREE.CircleGeometry(0.1, 24).rotateX(-PI / 2), glow('#ffe1b0', 2.2), 0, 1.69, 0);
      ly = 1.82; break;
    }
  }
  setLight(g, ly, s.intensity ?? 1);
  return g;
}

function sconce(s) {
  const g = new THREE.Group();
  const shape = s.shape || 'cone';
  const defM = { cone: 'black', globe: 'brass', arm: 'brass', box: 'gunmetal', candle: 'brass' }[shape] || 'brass';
  const m = matOf(s.mat, defM);
  const plate = (r = 0.06, y = 0) => mk(g, C(r, r, 0.016, 28), m, 0, y, 0.008, PI / 2);
  let ly = 0;
  switch (shape) {
    case 'cone': {
      plate(0.055, 0);
      rod(g, V3(0, 0, 0.015), V3(0, 0, 0.14), 0.008, m);
      mk(g, C(0.03, 0.03, 0.05, 16), m, 0, 0.0, 0.15);
      shell(g, [[0.12, -0.2], [0.115, -0.19], [0.032, -0.02], [0.03, 0]], m, innerMat('#f6f1e7'), 0.03, 32, 0, 0.15);
      bulb(g, 0, -0.07, 0.15, 0.028);
      ly = -0.09; break;
    }
    case 'globe': {
      plate(0.06, 0);
      rod(g, V3(0, 0, 0.015), V3(0, 0, 0.1), 0.01, m);
      mk(g, C(0.035, 0.04, 0.035, 16), m, 0, 0.02, 0.13);
      mk(g, S(0.095, 28, 18), OPAL(), 0, 0.12, 0.13).castShadow = false;
      ly = 0.12; break;
    }
    case 'arm': {
      mk(g, B(0.05, 0.14, 0.02, 0.006), m, 0, 0, 0.01);
      rod(g, V3(0, 0.02, 0.02), V3(0, 0.02, 0.42), 0.006, m);
      mk(g, S(0.012, 10, 8), m, 0, 0.02, 0.42);
      rod(g, V3(0, 0.02, 0.42), V3(0, -0.04, 0.44), 0.006, m);
      shell(g, [[0.085, -0.15], [0.082, -0.14], [0.03, -0.02], [0.025, 0]], m, innerMat('#f6f1e7'), -0.03, 32, 0, 0.45);
      bulb(g, 0, -0.1, 0.45, 0.025);
      ly = -0.12; break;
    }
    case 'box': {
      mk(g, B(0.1, 0.2, 0.08, 0.008), m, 0, 0, 0.045);
      const gm = glow('#ffe0b0', 2.2);
      mk(g, new THREE.PlaneGeometry(0.084, 0.064).rotateX(-PI / 2), gm, 0, 0.1005, 0.045).castShadow = false;
      mk(g, new THREE.PlaneGeometry(0.084, 0.064).rotateX(PI / 2), gm, 0, -0.1005, 0.045).castShadow = false;
      ly = 0; break;
    }
    case 'candle': {
      mk(g, B(0.06, 0.14, 0.014, 0.006), m, 0, 0, 0.007);
      tube(g, [[0, -0.04, 0.012], [0, -0.06, 0.07], [0, -0.03, 0.12], [0, 0.01, 0.13]], 0.006, m, 24, 6);
      const cup = smooth([[0.001, -0.01], [0.03, -0.005], [0.04, 0.015], [0.042, 0.02]], 12);
      mk(g, LA(cup, 24), m, 0, 0.01, 0.13);
      mk(g, C(0.014, 0.014, 0.11, 16), paint('#f3eee2', 0.6), 0, 0.085, 0.13);
      const flame = smooth([[0.001, 0], [0.008, 0.008], [0.009, 0.018], [0.004, 0.03], [0.001, 0.036]], 12);
      mk(g, LA(flame, 12), glow('#ffcb7a', 3), 0, 0.14, 0.13).castShadow = false;
      ly = 0.16; break;
    }
  }
  setLight(g, ly, s.intensity ?? 0.6);
  return g;
}

// =====================================================================
// ソファ・ベッド・椅子
// =====================================================================
// 木の脚（先細り）。y0 から y1 まで
function taperLeg(g, x, z, y0, y1, mat, r = 0.022, splay = 0) {
  const a = V3(x + Math.sign(x) * splay, y0, z + Math.sign(z) * splay);
  return rod(g, a, V3(x, y1, z), r * 0.6, mat, r, 12);
}
function bunFoot(g, x, z, mat, r = 0.04) {
  mk(g, LA(smooth([[0.001, 0], [r * 0.7, 0.002], [r, r * 0.6], [r * 0.85, r * 1.3], [r * 0.6, r * 1.6]], 10), 16, true), mat, x, 0, z);
}

function sofa(s) {
  const g = new THREE.Group();
  const style = s.style || 'modern';
  const P = {
    modern: { W: 2.0, legH: 0.14, baseH: 0.2, cush: 0.14, backTop: 0.82, armTop: 0.62, armW: 0.16, D: 0.92, col: '#8b8e8a', leg: 'walnut', n: 3 },
    roll: { W: 2.0, legH: 0.1, baseH: 0.22, cush: 0.15, backTop: 0.86, armTop: 0.64, armW: 0.2, D: 0.94, col: '#c9bfae', leg: 'walnut', n: 3 },
    low: { W: 2.1, legH: 0.03, baseH: 0.17, cush: 0.13, backTop: 0.64, armTop: 0.46, armW: 0.22, D: 0.98, col: '#d8d1c4', leg: 'black', n: 3 },
    chester: { W: 2.0, legH: 0.1, baseH: 0.24, cush: 0.12, backTop: 0.76, armTop: 0.76, armW: 0.2, D: 0.92, col: null, leg: 'walnut', n: 3 },
    loveseat: { W: 1.5, legH: 0.15, baseH: 0.2, cush: 0.14, backTop: 0.82, armTop: 0.6, armW: 0.15, D: 0.88, col: '#5d7889', leg: 'oak', n: 2 },
    bench: { W: 1.75, legH: 0.18, baseH: 0.05, cush: 0.15, backTop: 0.78, armTop: 0.62, armW: 0.06, D: 0.84, col: '#c4b8a3', leg: 'oak', n: 1 },
    corner: { W: 2.4, legH: 0.12, baseH: 0.2, cush: 0.14, backTop: 0.8, armTop: 0.6, armW: 0.16, D: 0.94, col: '#9a9a96', leg: 'black', n: 2 },
  }[style] || {};
  const W = s.w || P.W, D = P.D, n = s.n || (style === 'modern' && W < 1.2 ? 1 : style === 'modern' && W < 1.75 ? 2 : P.n);
  const fab = style === 'chester' && !s.fabric && !UPHOL.includes(s.mat) ? upholMat('leather') : uphol(s, P.col);
  const legM = matOf(s.leg, P.leg);
  const R = rng(strHash(JSON.stringify(s)));
  const baseY = P.legH, seatY = P.legH + P.baseH; // 座面の下（クッションを置く高さ）
  const backT = style === 'bench' ? 0.06 : 0.2;
  const chaise = style === 'corner' ? 0.75 : 0;
  const ext = (z0, z1) => [z0, z1];
  const armX = W / 2 - P.armW / 2;
  // --- 土台
  if (style === 'bench') {
    // 木の枠のベンチソファ
    const wm = legM;
    mk(g, B(W - 0.1, 0.05, D - 0.06, 0.008), wm, 0, seatY - 0.025, 0);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.03);
      for (const sz of [-1, 1]) rod(g, V3(x, 0, sz * (D / 2 - 0.05)), V3(x, sz < 0 ? P.backTop : P.armTop, sz * (D / 2 - 0.05) + (sz < 0 ? -0.04 : 0)), 0.02, wm, 0.018, 12);
      mk(g, B(0.06, 0.035, D + 0.02, 0.01), wm, x, P.armTop, 0.0);
      mk(g, B(0.03, 0.04, D - 0.1), wm, x, 0.12, 0);
    }
    for (const yy of [P.backTop - 0.03, P.backTop - 0.3]) mk(g, B(W - 0.04, 0.05, 0.03, 0.008), wm, 0, yy, -D / 2 + 0.02 - (yy > 0.6 ? 0.03 : 0.015));
    mk(g, cushionGeo(W - 0.12, P.cush, D - 0.14, 0.25, 3), fab, 0, seatY + P.cush / 2, 0.02);
    const bc = mk(g, cushionGeo(W - 0.14, 0.4, 0.13, 0.35, 4, 'z'), fab, 0, seatY + P.cush + 0.2, -D / 2 + 0.12);
    bc.rotation.x = -0.14;
    // 小さなクッション
    mk(g, cushionGeo(0.4, 0.4, 0.12, 0.6, 9, 'z'), upholMat('linen', '#e8e1d3'), -W / 2 + 0.38, seatY + P.cush + 0.2, -D / 2 + 0.24, -0.25, 0.2, 0.08);
    return g;
  }
  // 脚
  const legs = [];
  const lx = W / 2 - 0.06, lz = D / 2 - 0.06;
  legs.push([-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]);
  if (W > 2.1) legs.push([0, -lz], [0, lz]);
  if (chaise) legs.push([lx, D / 2 + chaise - 0.06], [lx - 0.85, D / 2 + chaise - 0.06]);
  if (style === 'low') {
    mk(g, B(W - 0.1, P.legH, D - 0.1 + 0, 0.004), paint('#151515', 0.6), 0, P.legH / 2, 0);
  } else if (style === 'roll' || style === 'chester') {
    for (const [x, z] of legs) bunFoot(g, x, z, legM, 0.045);
  } else {
    for (const [x, z] of legs) taperLeg(g, x, z, 0, baseY + 0.01, legM, 0.022, 0.015);
  }
  // 座の土台
  mk(g, B(W - 0.02, P.baseH, D, 0.03), fab, 0, baseY + P.baseH / 2, 0);
  if (chaise) mk(g, B(0.92, P.baseH, chaise + 0.02, 0.03), fab, W / 2 - 0.47, baseY + P.baseH / 2, D / 2 + chaise / 2 - 0.01);
  // 背もたれ
  const backH = P.backTop - seatY;
  mk(g, cushionGeo(W - 0.02, backH, backT, 0.08, 2, 'z'), fab, 0, seatY + backH / 2, -D / 2 + backT / 2);
  // ひじ掛け
  const innerW = W - 2 * P.armW;
  const arm = (sx, len, zc) => {
    const x = sx * armX;
    const h = P.armTop - baseY;
    if (style === 'roll' || style === 'chester') {
      mk(g, B(P.armW * 0.85, h - P.armW * 0.4, len, 0.02), fab, x - sx * P.armW * 0.07, baseY + (h - P.armW * 0.4) / 2, zc);
      const r = P.armW * 0.6;
      mk(g, C(r, r, len, 24), fab, x + sx * 0.01, P.armTop - r * 0.75, zc, PI / 2);
      mk(g, DISC(r + 0.004, 0.02, 24), fab, x + sx * 0.01, P.armTop - r * 0.75, zc + len / 2, PI / 2);
    } else {
      mk(g, cushionGeo(P.armW, h, len, 0.06, 5), fab, x, baseY + h / 2, zc);
    }
  };
  if (style === 'corner') {
    arm(-1, D, 0);
    arm(1, D + chaise, chaise / 2);
  } else {
    arm(-1, D, 0); arm(1, D, 0);
  }
  // 座のクッション
  const cd = D - backT - 0.02;
  const cz = -D / 2 + backT + cd / 2 + 0.01;
  const mainW = style === 'corner' ? innerW - 0.85 : innerW;
  const x0 = -innerW / 2;
  const cw = mainW / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + cw * (i + 0.5);
    mk(g, cushionGeo(cw - 0.01, P.cush, cd, 0.28, 10 + i), fab, x, seatY + P.cush / 2, cz);
    if (style !== 'chester') {
      const bh = Math.min(0.48, P.backTop - seatY - P.cush + 0.06);
      const b = mk(g, cushionGeo(cw - 0.02, bh, 0.17, 0.35, 20 + i, 'z'), fab, x, seatY + P.cush + bh / 2 - 0.02, -D / 2 + backT + 0.07);
      b.rotation.x = -0.13;
    }
  }
  if (style === 'corner') {
    const x = innerW / 2 - 0.425;
    mk(g, cushionGeo(0.84, P.cush, cd + chaise, 0.22, 30), fab, x, seatY + P.cush / 2, cz + chaise / 2);
    const bh = Math.min(0.46, P.backTop - seatY - P.cush + 0.06);
    mk(g, cushionGeo(0.83, bh, 0.17, 0.35, 31, 'z'), fab, x, seatY + P.cush + bh / 2 - 0.02, -D / 2 + backT + 0.07, -0.13);
  }
  // チェスターフィールドのボタン留め
  if (style === 'chester') {
    const bag = new Bag();
    const by0 = seatY + P.cush + 0.08, bz = -D / 2 + backT + 0.004;
    for (let r = 0; r < 3; r++) for (let c = 0; c <= 9; c++) {
      const x = -innerW / 2 + 0.06 + (innerW - 0.12) * (c + (r % 2) * 0.5) / 9.5;
      if (Math.abs(x) > innerW / 2 - 0.04) continue;
      bag.add(S(0.009, 6, 4), x, by0 + r * 0.12, bz);
    }
    for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++)
      bag.add(S(0.009, 6, 4), sx * (W / 2 - P.armW - 0.002), seatY + P.cush + 0.08 + r * 0.12, -D / 2 + backT + 0.07 + c * 0.13 + (r % 2) * 0.065);
    bag.mesh(g, fab.color.getHSL({}).l < 0.15 ? paint('#0d0c0c', 0.4) : paint('#3a2012', 0.45));
    // 背もたれの上の丸み
    const r = 0.1;
    mk(g, C(r, r, W - 0.02, 24), fab, 0, P.backTop - 0.06, -D / 2 + backT / 2, 0, 0, PI / 2);
  }
  // 飾りクッション
  if (style !== 'chester' && s.pillows !== false) {
    const pc = upholMat('linen', s.pillow || (R() < 0.5 ? '#e7dfcf' : '#b9845a'));
    const py = seatY + P.cush + 0.2;
    mk(g, cushionGeo(0.42, 0.42, 0.12, 0.6, 40, 'z'), pc, -innerW / 2 + 0.26, py, -D / 2 + backT + 0.2, -0.3, 0.25, 0.06);
    if (W > 1.3) mk(g, cushionGeo(0.4, 0.4, 0.12, 0.6, 41, 'z'), pc, innerW / 2 - 0.26 - (style === 'corner' ? 0 : 0), py, -D / 2 + backT + 0.2, -0.3, -0.25, -0.06);
  }
  return g;
}

function bed(s) {
  const g = new THREE.Group();
  const style = s.style || 'platform';
  const W = s.w || 1.6, L = 2.1;
  const fm = matOf(s.mat, { platform: 'oak', frame: 'walnut', low: 'pine', metal: 'black' }[style] || 'oak');
  const throwM = upholMat('linen', s.fabric || '#b98f6a');
  const sheet = upholMat('linen', '#f2efe9');
  const duvetM = upholMat('linen', s.duvet || '#ebe7df');
  let mTop; // マットレス上面
  const head = -L / 2;
  if (style === 'platform') {
    mk(g, B(W - 0.2, 0.06, L - 0.2, 0.004), paint('#151515', 0.7), 0, 0.03, 0);
    mk(g, B(W + 0.1, 0.24, L + 0.06, 0.012), fm, 0, 0.06 + 0.12, 0.03);
    mk(g, B(W + 0.1, 0.6, 0.06, 0.012), fm, 0, 0.3 + 0.3 - 0.02, head - 0.03);
    // 布張りのヘッドボード
    mk(g, cushionGeo(W - 0.06, 0.42, 0.07, 0.15, 7, 'z'), upholMat('linen', s.headboard || '#cfc6b8'), 0, 0.68, head + 0.03);
    mTop = 0.3 + 0.22;
  } else if (style === 'frame') {
    for (const sx of [-1, 1]) {
      mk(g, B(0.06, 1.02, 0.06, 0.008), fm, sx * (W / 2 + 0.03), 0.51, head - 0.03);
      mk(g, B(0.06, 0.48, 0.06, 0.008), fm, sx * (W / 2 + 0.03), 0.24, L / 2 + 0.03);
      mk(g, B(0.03, 0.16, L, 0.006), fm, sx * (W / 2 + 0.015), 0.32, 0);
    }
    for (const yy of [0.4, 0.98]) mk(g, B(W + 0.04, 0.07, 0.035, 0.008), fm, 0, yy, head - 0.03);
    for (let i = 0; i < 9; i++) mk(g, B(0.05, 0.52, 0.02, 0.004), fm, -W / 2 + 0.1 + i * (W - 0.2) / 8, 0.69, head - 0.03);
    mk(g, B(W + 0.04, 0.16, 0.035, 0.008), fm, 0, 0.36, L / 2 + 0.03);
    mk(g, B(W, 0.02, L, 0.004), fm, 0, 0.32, 0);
    mTop = 0.33 + 0.22;
  } else if (style === 'low') {
    mk(g, B(W + 0.3, 0.12, L + 0.2, 0.01), fm, 0, 0.06, 0.05);
    mTop = 0.12 + 0.2;
    mk(g, B(W + 0.3, 0.32, 0.04, 0.01), fm, 0, 0.12 + 0.16, head - 0.02);
  } else { // metal
    const r = 0.017, mm = fm;
    for (const sx of [-1, 1]) {
      mk(g, C(r, r, 1.1, 12), mm, sx * (W / 2 + 0.02), 0.55, head - 0.02);
      mk(g, S(r * 1.6, 12, 8), mm, sx * (W / 2 + 0.02), 1.11, head - 0.02);
      mk(g, C(r, r, 0.78, 12), mm, sx * (W / 2 + 0.02), 0.39, L / 2 + 0.02);
      mk(g, S(r * 1.6, 12, 8), mm, sx * (W / 2 + 0.02), 0.79, L / 2 + 0.02);
      mk(g, B(0.03, 0.05, L, 0.004), mm, sx * (W / 2 + 0.02), 0.3, 0);
    }
    const bag = new Bag();
    for (const [z, y0, y1] of [[head - 0.02, 0.3, 1.0], [L / 2 + 0.02, 0.3, 0.7]]) {
      for (const yy of [y0, y1]) bag.add(new THREE.CylinderGeometry(0.012, 0.012, W + 0.04, 8, 1), 0, yy, z, 0, 0, PI / 2);
      const nB = Math.round(W / 0.12);
      for (let i = 1; i < nB; i++) bag.add(new THREE.CylinderGeometry(0.007, 0.007, y1 - y0, 6, 1), -W / 2 - 0.02 + i * (W + 0.04) / nB, (y0 + y1) / 2, z);
    }
    bag.mesh(g, mm);
    mk(g, B(W, 0.02, L, 0.004), paint('#2a2a2a', 0.6), 0, 0.31, 0);
    mTop = 0.32 + 0.22;
  }
  // マットレス
  const mh = style === 'low' ? 0.2 : 0.22;
  mk(g, cushionGeo(W - 0.04, mh, L - 0.06, 0.06, 1), sheet, 0, mTop - mh / 2, 0);
  // 掛け布団（横に垂れる）
  const dl = L - 0.55;
  mk(g, cushionGeo(W + 0.06, 0.26, dl, 0.25, 2), duvetM, 0, mTop - 0.09, L / 2 - dl / 2 - 0.01);
  // 折り返し
  mk(g, cushionGeo(W + 0.07, 0.08, 0.2, 0.4, 3), sheet, 0, mTop + 0.06, L / 2 - dl - 0.0);
  // 足元のブランケット
  mk(g, cushionGeo(W + 0.1, 0.27, 0.55, 0.15, 4), throwM, 0, mTop - 0.075, L / 2 - 0.42);
  // 枕
  const pw = W > 1.3 ? 0.62 : 0.55, px = W > 1.3 ? W / 4 : 0;
  for (const sx of W > 1.3 ? [-1, 1] : [0]) {
    mk(g, cushionGeo(pw, 0.13, 0.42, 0.7, 5 + sx), sheet, sx * px, mTop + 0.1, head + 0.3, -0.35);
  }
  mk(g, cushionGeo(0.45, 0.42, 0.12, 0.6, 8, 'z'), throwM, 0.1, mTop + 0.22, head + 0.46, -0.3, 0.1, 0.04);
  return g;
}

function chair(s) {
  const g = new THREE.Group();
  const style = s.style || 'dining';
  const wood = matOf(s.mat, { bar: 'black', gamechair: 'black' }[style] || 'oak');
  const fab = uphol(s, { arm: '#7d8a74', lounge: '#6b3d22', beanbag: '#c5b9a6', pouf: '#d8cbb3', bar: '#5a3a24', dining: '#c8bba6' }[style] || '#9a9488', style === 'lounge' && !s.fabric ? 'leather' : 'fabric');
  switch (style) {
    case 'stool': {
      mk(g, DISC(0.17, 0.035), wood, 0, 0.445, 0);
      const top = [], bot = [];
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + PI / 2;
        top.push(V3(Math.cos(a) * 0.1, 0.43, Math.sin(a) * 0.1));
        bot.push(V3(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2));
        rod(g, bot[k], top[k], 0.014, wood, 0.019, 12);
      }
      for (let k = 0; k < 3; k++) {
        const p = bot[k].clone().lerp(top[k], 0.4), q = bot[(k + 1) % 3].clone().lerp(top[(k + 1) % 3], 0.4);
        rod(g, p, q, 0.009, wood);
      }
      break;
    }
    case 'dining': case 'rocking': {
      const rock = style === 'rocking';
      const sw = rock ? 0.5 : 0.44, sd = rock ? 0.46 : 0.42, sy = 0.45, bt = rock ? 1.05 : 0.88;
      const lift = rock ? 0.05 : 0;
      mk(g, B(sw, 0.03, sd, 0.008), wood, 0, sy + lift - 0.015, 0);
      // 前脚・後ろ脚
      for (const sx of [-1, 1]) {
        const x = sx * (sw / 2 - 0.03);
        rod(g, V3(x, lift, sd / 2 - 0.03), V3(x, sy + lift - 0.03, sd / 2 - 0.03), 0.014, wood, 0.019, 12);
        rod(g, V3(x, lift, -sd / 2 + 0.03), V3(x, bt + lift, -sd / 2 - 0.04), 0.016, wood, 0.017, 12);
        mk(g, B(0.02, 0.04, sd - 0.06, 0.005), wood, x, sy + lift - 0.05, 0);
        mk(g, B(0.016, 0.016, sd - 0.06, 0.004), wood, x, 0.16 + lift, 0);
      }
      mk(g, B(sw - 0.06, 0.04, 0.02, 0.005), wood, 0, sy + lift - 0.05, sd / 2 - 0.03);
      // 背もたれ
      const zb = y => -sd / 2 + 0.03 - 0.07 * (y - lift) / bt;
      mk(g, B(sw - 0.02, 0.07, 0.022, 0.008), wood, 0, bt + lift - 0.05, zb(bt + lift - 0.05), -0.08);
      const ns = rock ? 7 : 4;
      for (let i = 0; i < ns; i++) {
        const x = -sw / 2 + 0.07 + i * (sw - 0.14) / (ns - 1);
        rod(g, V3(x, sy + lift + 0.01, zb(sy + lift)), V3(x, bt + lift - 0.08, zb(bt + lift - 0.08)), 0.007, wood);
      }
      if (rock) {
        for (const sx of [-1, 1]) {
          const x = sx * (sw / 2 - 0.03);
          const R0 = 1.4, pts = [];
          for (let i = 0; i <= 16; i++) { const a = -0.42 + 0.84 * i / 16; pts.push(V3(x, R0 - R0 * Math.cos(a) + 0.015, Math.sin(a) * R0 - 0.05)); }
          const t = tube(g, pts, 0.016, wood, 32, 8);
          t.scale.x = 1;
          // ひじ掛け
          rod(g, V3(x + sx * 0.02, sy + lift, sd / 2 - 0.03), V3(x + sx * 0.03, sy + lift + 0.22, sd / 2 - 0.03), 0.012, wood);
          mk(g, B(0.06, 0.025, sd + 0.04, 0.008), wood, x + sx * 0.03, sy + lift + 0.23, -0.0);
        }
      }
      if (s.fabric || rock) mk(g, cushionGeo(sw - 0.04, 0.045, sd - 0.04, 0.3, 4), fab, 0, sy + lift + 0.02, 0.0);
      break;
    }
    case 'arm': {
      const c = sofa({ style: 'modern', w: 0.86, n: 1, fabric: s.fabric || '#7d8a74', mat: s.cover, leg: s.mat || 'walnut', pillows: false });
      g.add(c);
      break;
    }
    case 'lounge': {
      // 木の枠に厚いクッションを置いたラウンジチェア
      const W = 0.78, D = 0.82;
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.02);
        rod(g, V3(x, 0, D / 2 - 0.06), V3(x, 0.56, D / 2 - 0.1), 0.02, wood, 0.022, 12);
        rod(g, V3(x, 0, -D / 2 + 0.08), V3(x, 0.56, -D / 2 + 0.12), 0.02, wood, 0.022, 12);
        mk(g, B(0.07, 0.03, D + 0.04, 0.012), wood, x, 0.575, 0);
        mk(g, B(0.03, 0.05, D - 0.1, 0.008), wood, x, 0.22, 0);
      }
      const sp = new THREE.Group(); g.add(sp);
      sp.position.set(0, 0.24, 0.02); sp.rotation.x = -0.1;
      mk(sp, B(W - 0.06, 0.03, D - 0.1, 0.008), wood, 0, 0, 0);
      mk(sp, cushionGeo(W - 0.08, 0.14, D - 0.14, 0.25, 3), fab, 0, 0.085, 0.02);
      const bk = new THREE.Group(); g.add(bk);
      bk.position.set(0, 0.36, -D / 2 + 0.1); bk.rotation.x = -0.32;
      mk(bk, B(W - 0.08, 0.6, 0.03, 0.008), wood, 0, 0.3, -0.02);
      mk(bk, cushionGeo(W - 0.1, 0.56, 0.13, 0.3, 4, 'z'), fab, 0, 0.3, 0.06);
      break;
    }
    case 'bar': {
      mk(g, LA(smooth([[0.001, 0], [0.18, 0.0], [0.195, 0.02], [0.19, 0.05], [0.15, 0.07], [0.001, 0.075]], 16), 32, true), fab, 0, 0.71, 0);
      mk(g, DISC(0.17, 0.02), wood, 0, 0.7, 0);
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU + PI / 4;
        const top = V3(Math.cos(a) * 0.12, 0.69, Math.sin(a) * 0.12), bot = V3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
        rod(g, bot, top, 0.011, wood);
        pts.push(bot.clone().lerp(top, 0.38));
        mk(g, C(0.014, 0.014, 0.012, 10), paint('#111', 0.7), bot.x, 0.006, bot.z);
      }
      const rr = Math.hypot(pts[0].x, pts[0].z);
      mk(g, T(rr, 0.009, 8, 40), wood, 0, pts[0].y, 0, PI / 2);
      break;
    }
    case 'beanbag': {
      const geo = cg('beanbag', () => {
        let b = new THREE.SphereGeometry(0.45, 40, 28);
        const p = b.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          y *= 0.7;
          if (y < -0.2) y = -0.2 - (y + 0.2) * 0.15;
          const d = Math.exp(-((x * x) / 0.05 + ((z - 0.08) ** 2) / 0.06));
          if (y > 0) y -= d * 0.14;
          const back = Math.exp(-((x * x) / 0.08 + ((z + 0.3) ** 2) / 0.04));
          y += back * 0.08;
          const wr = n3(x * 6, y * 6, z * 6, 2) * 0.012 + n3(x * 14, y * 14, z * 14, 5) * 0.005;
          const k = 1 + wr / 0.45;
          p.setXYZ(i, x * k * 1.05, y + 0.2 + wr, z * k);
        }
        b.computeVertexNormals();
        return b;
      });
      mk(g, geo, fab, 0, 0.003, 0);
      break;
    }
    case 'pouf': {
      const pts = smooth([[0.001, 0], [0.22, 0.0], [0.255, 0.04], [0.265, 0.2], [0.255, 0.36], [0.22, 0.4], [0.001, 0.405]], 28);
      mk(g, LA(pts, 40, true), fab, 0, 0, 0);
      const pip = paint(new THREE.Color(fab.color).multiplyScalar(0.8).getStyle ? '#' + fab.color.clone().multiplyScalar(0.8).getHexString() : '#999', 0.9);
      mk(g, T(0.238, 0.008, 6, 48), pip, 0, 0.39, 0, PI / 2);
      mk(g, T(0.238, 0.008, 6, 48), pip, 0, 0.018, 0, PI / 2);
      break;
    }
    case 'bench': {
      const W = s.w || 1.2;
      mk(g, B(W, 0.045, 0.36, 0.01), wood, 0, 0.43, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        rod(g, V3(sx * (W / 2 - 0.06), 0, sz * 0.15), V3(sx * (W / 2 - 0.12), 0.41, sz * 0.11), 0.015, wood, 0.021, 12);
      }
      for (const sx of [-1, 1]) mk(g, B(0.03, 0.03, 0.26, 0.005), wood, sx * (W / 2 - 0.1), 0.16, 0);
      mk(g, B(W - 0.2, 0.03, 0.03, 0.005), wood, 0, 0.16, 0);
      break;
    }
  }
  return g;
}

// =====================================================================
// テーブル
// =====================================================================
function sqLeg(g, x, z, y0, y1, mat, rTop = 0.022, rBot = 0.015) {
  // 先細りの角脚
  const m = mk(g, C(rTop, rBot, y1 - y0, 4), mat, x, (y0 + y1) / 2, z);
  m.rotation.y = PI / 4;
  return m;
}
function ovalGeo(w, d, t) {
  return cg(`ov${r4(w)},${r4(d)},${r4(t)}`, () => {
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, w / 2 - 0.006, d / 2 - 0.006, 0, TAU, false, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 48 });
    g.translate(0, 0, -(t - 0.012) / 2);
    g.rotateX(-PI / 2);
    return worldUV(g);
  });
}
function table(s) {
  const g = new THREE.Group();
  const style = s.style || 'rect';
  const D0 = {
    round: [1.05, 1.05, 0.75, 'oak', 'oak'], rect: [1.6, 0.9, 0.75, 'oak', 'oak'], oval: [1.2, 0.65, 0.42, 'walnut', 'walnut'],
    nest: [0.6, 0.6, 0.5, 'marble', 'brass'], trunk: [0.42, 0.42, 0.45, 'oak', 'oak'], pedestal: [1.0, 1.0, 0.74, 'marble', 'white'],
    lowJapanese: [1.2, 0.75, 0.33, 'walnut', 'walnut'], side: [0.45, 0.45, 0.55, 'oak', 'black'], console: [1.2, 0.35, 0.78, 'walnut', 'black'], desk: [1.2, 0.6, 0.74, 'oak', 'white'],
  }[style] || [1.2, 0.7, 0.75, 'oak', 'oak'];
  const W = s.w || D0[0], D = s.d || D0[1], H = s.h || D0[2];
  const topM = matOf(s.top, D0[3]), legM = matOf(s.leg, s.top && isWoodKey(s.top) && isWoodKey(D0[4]) ? s.top : D0[4]);
  const t = 0.035;
  switch (style) {
    case 'round': {
      const r = W / 2;
      mk(g, DISC(r, t, 64), topM, 0, H - t / 2, 0);
      mk(g, C(r * 0.6, r * 0.6, 0.07, 48, true), legM, 0, H - t - 0.035, 0);
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU + PI / 4;
        rod(g, V3(Math.cos(a) * r * 0.66, 0, Math.sin(a) * r * 0.66), V3(Math.cos(a) * r * 0.58, H - t, Math.sin(a) * r * 0.58), 0.016, legM, 0.024, 12);
      }
      break;
    }
    case 'rect': case 'lowJapanese': case 'desk': {
      const jt = style === 'lowJapanese' ? 0.04 : t;
      mk(g, B(W, jt, D, 0.008), topM, 0, H - jt / 2, 0);
      const inset = style === 'lowJapanese' ? 0.05 : 0.06;
      const ah = style === 'lowJapanese' ? 0.05 : 0.08;
      const lw = style === 'lowJapanese' ? 0.032 : 0.026;
      let legX = [-1, 1];
      if (style === 'desk') {
        // 左に引き出し3段
        const pw = 0.4, ph = H - jt - 0.02;
        mk(g, B(pw, ph, D - 0.04, 0.006), legM, -W / 2 + pw / 2 + 0.01, ph / 2 + 0.01, 0);
        for (let i = 0; i < 3; i++) {
          const fh = (ph - 0.04) / 3;
          const yy = 0.03 + fh * (i + 0.5);
          mk(g, B(pw - 0.02, fh - 0.006, 0.018, 0.004), legM, -W / 2 + pw / 2 + 0.01, yy, D / 2 - 0.02);
          mk(g, B(0.12, 0.012, 0.012, 0.004), matOf(s.handle, 'brass'), -W / 2 + pw / 2 + 0.01, yy + fh * 0.2, D / 2 - 0.004);
        }
        mk(g, B(W - pw - 0.04, 0.3, 0.018, 0.004), legM, pw / 2 - 0.01, H - jt - 0.17, -D / 2 + 0.05);
        legX = [1];
      }
      for (const sx of legX) for (const sz of [-1, 1]) {
        const x = sx * (W / 2 - inset), z = sz * (D / 2 - inset);
        if (style === 'lowJapanese') mk(g, B(lw * 2, H - jt, lw * 2, 0.005), legM, x, (H - jt) / 2, z);
        else sqLeg(g, x, z, 0, H - jt, legM, lw * 1.2, lw * 0.75);
      }
      const ax = W - 2 * inset, az = D - 2 * inset;
      mk(g, B(ax, ah, 0.02, 0.004), legM, 0, H - jt - ah / 2, D / 2 - inset);
      mk(g, B(ax, ah, 0.02, 0.004), legM, 0, H - jt - ah / 2, -D / 2 + inset);
      if (style !== 'desk') mk(g, B(0.02, ah, az, 0.004), legM, -W / 2 + inset, H - jt - ah / 2, 0);
      mk(g, B(0.02, ah, az, 0.004), legM, W / 2 - inset, H - jt - ah / 2, 0);
      break;
    }
    case 'oval': {
      mk(g, ovalGeo(W, D, 0.04), topM, 0, H - 0.02, 0);
      mk(g, ovalGeo(W * 0.82, D * 0.78, 0.02), topM, 0, 0.15, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        rod(g, V3(sx * W * 0.34, 0, sz * D * 0.33), V3(sx * W * 0.3, H - 0.04, sz * D * 0.28), 0.013, legM, 0.02, 12);
      }
      break;
    }
    case 'nest': {
      const one = (r, h, x, z, rot) => {
        mk(g, DISC(r, 0.022, 48), topM, x, h - 0.011, z);
        for (let k = 0; k < 3; k++) {
          const a = k / 3 * TAU + rot;
          rod(g, V3(x + Math.cos(a) * r * 0.85, 0, z + Math.sin(a) * r * 0.85), V3(x + Math.cos(a) * r * 0.75, h - 0.022, z + Math.sin(a) * r * 0.75), 0.007, legM, 0.009, 8);
        }
        mk(g, T(r * 0.79, 0.006, 6, 40), legM, x, h * 0.35, z, PI / 2);
      };
      one(W / 2, H, -0.08, -0.06, PI / 2);
      one(W / 2 * 0.72, H * 0.82, W * 0.35, W * 0.28, 0.3);
      break;
    }
    case 'trunk': {
      const r = W / 2;
      const geo = cg('trunk' + r4(r) + r4(H), () => {
        const b = new THREE.CylinderGeometry(r * 0.96, r * 1.04, H - 0.01, 28, 8, true);
        const p = b.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const a = Math.atan2(x, z);
          const k = 1 + 0.05 * vn(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + y * 3, 1e6, 1e6, 4) + 0.02 * Math.sin(a * 9 + y * 4);
          p.setX(i, x * k); p.setZ(i, z * k);
        }
        b.computeVertexNormals();
        return b;
      });
      const bark = cm('barkmat', () => std({ color: barkTex() ? '#ffffff' : '#5a3d2a', map: barkTex(), roughness: 0.95 }));
      mk(g, geo, bark, 0, (H - 0.01) / 2, 0);
      const endM = cm('rings', () => std({ color: ringsTex() ? '#ffffff' : '#c9a170', map: ringsTex(), roughness: 0.7 }));
      const top = new THREE.CircleGeometry(r * 0.97, 40).rotateX(-PI / 2);
      mk(g, top, endM, 0, H - 0.008, 0);
      break;
    }
    case 'pedestal': {
      const r = W / 2;
      mk(g, DISC(r, 0.03, 64), topM, 0, H - 0.015, 0);
      const pts = smooth([[0.28, 0], [0.28, 0.012], [0.2, 0.03], [0.08, 0.15], [0.05, 0.38], [0.06, 0.6], [0.11, H - 0.04], [0.11, H - 0.03], [0.001, H - 0.03]], 40);
      mk(g, LA([[0.001, 0], ...pts], 48), legM, 0, 0, 0);
      break;
    }
    case 'side': case 'console': {
      mk(g, B(W, 0.03, D, 0.006), topM, 0, H - 0.015, 0);
      mk(g, B(W - 0.04, 0.02, D - 0.04, 0.004), topM, 0, style === 'side' ? 0.16 : 0.18, 0);
      const r = style === 'side' ? 0.011 : 0.01;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (W / 2 - 0.025), z = sz * (D / 2 - 0.025);
        mk(g, B(r * 2, H - 0.03, r * 2, 0.003), legM, x, (H - 0.03) / 2, z);
      }
      break;
    }
  }
  return g;
}

// =====================================================================
// 本（色付きの箱をまとめて1つにする）
// =====================================================================
const BOOK_COLORS = ['#7b2d26', '#2f4858', '#c9a66b', '#3d5a40', '#8c6f5a', '#d8cfc0', '#2b2b2b', '#a14a2e', '#506c84', '#e2d6b5', '#6b4e71', '#9a8f5e', '#b7472a', '#1f3a5f', '#efe9dc'];
const PAGE = vc('#eee6d2');
function bookGeo(bag, w, h, d, x, y, z, color, ry = 0, rz = 0) {
  // 背表紙が +Z、上と後ろは紙の色
  const g = new THREE.BoxGeometry(w, h, d);
  const c = vc(color);
  colorGeo(g, [c, c, PAGE, PAGE, c, PAGE]);
  g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
  bag.list.push(g);
}
// 棚の1段を本で埋める（x0〜x1、底 y、奥行 zf は手前の位置）
function fillShelf(bag, R, x0, x1, y, zf, maxH, maxD, colors = BOOK_COLORS, fill = 0.85) {
  let x = x0 + 0.01;
  const end = x0 + (x1 - x0) * fill;
  let leaned = false;
  while (x < end) {
    const r = R();
    if (r < 0.1 && end - x > 0.2) {
      // 横に積んだ本
      const n = 2 + Math.floor(R() * 3);
      let yy = y;
      const w0 = 0.16 + R() * 0.05;
      for (let i = 0; i < n; i++) {
        const th = 0.02 + R() * 0.025, dd = Math.min(maxD, 0.13 + R() * 0.05);
        bookGeo(bag, w0 + R() * 0.03, th, dd, x + w0 / 2 + 0.01, yy + th / 2, zf - dd / 2 - 0.01, colors[Math.floor(R() * colors.length)], (R() - 0.5) * 0.15);
        yy += th;
      }
      x += w0 + 0.04;
      continue;
    }
    const th = 0.018 + R() * 0.035, h = Math.min(maxH - 0.02, 0.17 + R() * 0.11), d = Math.min(maxD, 0.13 + R() * 0.07);
    bookGeo(bag, th, h, d, x + th / 2, y + h / 2, zf - d / 2 - 0.005, colors[Math.floor(R() * colors.length)]);
    x += th + 0.001;
    if (!leaned && x >= end && end < x1 - 0.12 && R() < 0.6) {
      // 最後の1冊を立てかける
      const a = 0.35;
      const th2 = 0.025, h2 = Math.min(maxH - 0.03, 0.22);
      bookGeo(bag, th2, h2, d, x + Math.sin(a) * h2 / 2 + th2 / 2, y + Math.cos(a) * h2 / 2 + 0.004, zf - d / 2 - 0.005, colors[Math.floor(R() * colors.length)], 0, -a);
      leaned = true;
    }
  }
}
const bookMat = () => cm('books', () => std({ vertexColors: true, roughness: 0.75 }));

// 小さな飾り（棚の上など）
function decoVase(parent, x, y, z, R, scale = 0.6) {
  const shapes = ['bottle', 'round', 'tall', 'jug'];
  const cols = ['#e9e4da', '#2b2b2b', '#a8b5a2', '#c97b55', '#4b6a88'];
  const v = vase({ shape: shapes[Math.floor(R() * shapes.length)], color: cols[Math.floor(R() * cols.length)], gloss: R(), flowers: false, low: true });
  v.scale.setScalar(scale);
  v.position.set(x, y, z);
  parent.add(v);
}
function decoPlant(parent, x, y, z, scale = 1) {
  const p = plant({ pot: 'round', foliage: 'bush', size: 0.3, potColor: '#efe9df', leaves: 70 });
  p.scale.setScalar(scale);
  p.position.set(x, y, z);
  parent.add(p);
}

// =====================================================================
// 棚
// =====================================================================
function shelf(s) {
  const g = new THREE.Group();
  const style = s.style || 'bookcase';
  const R = rng(strHash(JSON.stringify(s)));
  const DEF = {
    bookcase: [0.9, 1.8, 0.32, 'oak'], cube: [1.12, 1.12, 0.39, 'white'], ladder: [0.7, 1.8, 0.42, 'walnut'],
    sideboard: [1.6, 0.75, 0.45, 'walnut'], cabinet: [0.9, 1.9, 0.42, 'white'], display: [0.9, 1.8, 0.4, 'black'], low: [1.6, 0.45, 0.4, 'oak'],
  }[style] || [0.9, 1.8, 0.32, 'oak'];
  const W = s.w || DEF[0], H = s.h || DEF[1], D = DEF[2];
  const m = matOf(s.mat, DEF[3]);
  const books = s.books !== false;
  const bag = new Bag();
  const t = 0.02;
  const handleM = matOf(s.handle, 'brass');
  switch (style) {
    case 'bookcase': case 'low': {
      const low = style === 'low';
      const kick = low ? 0.06 : 0.07;
      for (const sx of [-1, 1]) mk(g, B(t, H, D, 0.004), m, sx * (W / 2 - t / 2), H / 2, 0);
      mk(g, B(W, t, D, 0.004), m, 0, H - t / 2, 0);
      mk(g, B(W - 2 * t, kick, t, 0.003), m, 0, kick / 2, D / 2 - t / 2 - 0.01);
      const back = mk(g, B(W - 2 * t, H - 0.01, 0.008, 0.002), m, 0, H / 2, -D / 2 + 0.006);
      back.receiveShadow = true;
      const n = low ? 1 : Math.max(3, Math.round((H - kick) / 0.34));
      const levels = [];
      for (let i = 0; i <= n; i++) {
        const y = kick + (H - kick - t) * i / n;
        mk(g, B(W - 2 * t, t, D - 0.01, 0.003), m, 0, y + t / 2, 0.004);
        if (i < n) levels.push([y + t, (H - kick - t) / n - t]);
      }
      if (low) {
        for (const x of [-W / 6, W / 6]) mk(g, B(t, H - kick - t * 2, D - 0.02, 0.003), m, x, kick + t + (H - kick - 2 * t) / 2, 0);
      }
      if (books) {
        levels.forEach(([y, gap], i) => {
          if (low) {
            fillShelf(bag, R, -W / 2 + t, -W / 6 - t / 2, y, D / 2 - 0.02, gap, D - 0.04, BOOK_COLORS, 0.9);
            decoVase(g, 0, y, 0.0, R, 0.7);
            fillShelf(bag, R, W / 6 + t / 2, W / 2 - t, y, D / 2 - 0.02, gap, D - 0.04, BOOK_COLORS, 0.5);
          } else {
            const f = 0.45 + R() * 0.5;
            fillShelf(bag, R, -W / 2 + t, W / 2 - t, y, D / 2 - 0.02, gap, D - 0.04, BOOK_COLORS, f);
            if (f < 0.7 && R() < 0.7) decoVase(g, W / 2 - 0.13, y, 0, R, 0.55);
          }
        });
        if (!low) decoPlant(g, -W / 4, H, 0, 0.9);
      }
      if (low) for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.015, 0.012, kick, 10), paint('#151515', 0.5, 0.4), sx * (W / 2 - 0.05), kick / 2, sz * (D / 2 - 0.05));
      break;
    }
    case 'cube': {
      const nx = Math.max(1, Math.round(W / 0.37)), ny = Math.max(1, Math.round(H / 0.37));
      const cw = (W - t) / nx, ch = (H - t) / ny;
      for (let i = 0; i <= nx; i++) mk(g, B(t, H, D, 0.003), m, -W / 2 + t / 2 + i * cw, H / 2, 0);
      for (let j = 0; j <= ny; j++) mk(g, B(W, t, D, 0.003), m, 0, t / 2 + j * ch, 0);
      mk(g, B(W - 0.01, H - 0.01, 0.006, 0.002), m, 0, H / 2, -D / 2 + 0.003);
      const boxCols = ['#c9b79a', '#4d5a63', '#ece6da', '#8a6d52'];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x0 = -W / 2 + t + i * cw, y0 = t + j * ch;
        const r = R();
        if (r < 0.3) {
          // 布の箱
          const bw = cw - t - 0.03;
          mk(g, cushionGeo(bw, ch - t - 0.04, D - 0.06, 0.03, 6 + i + j), upholMat('linen', boxCols[(i + j) % 4]), x0 + (cw - t) / 2, y0 + (ch - t - 0.04) / 2 + 0.002, 0.01);
          mk(g, B(0.08, 0.025, 0.006, 0.006), paint('#2a2522', 0.8), x0 + (cw - t) / 2, y0 + ch - t - 0.09, D / 2 - 0.035 + 0.01);
        } else if (r < 0.75 && books) {
          fillShelf(bag, R, x0, x0 + cw - t, y0, D / 2 - 0.02, ch - t, D - 0.05, BOOK_COLORS, 0.55 + R() * 0.4);
        } else if (r < 0.88 && books) {
          decoVase(g, x0 + (cw - t) / 2, y0, 0, R, 0.7);
        } else if (books) {
          // 籐のかご
          mk(g, LA([[0.001, 0], [0.12, 0], [0.14, 0.2], [0.135, 0.2], [0.115, 0.004], [0.001, 0.004]], 28), baseMat('rattan'), x0 + (cw - t) / 2, y0, 0);
        }
      }
      break;
    }
    case 'ladder': {
      // 壁に立てかける、はしご形の棚
      const tilt = 0.12;
      const top = V3(0, H, -D / 2 + 0.02), bot = V3(0, 0, -D / 2 + 0.02 + Math.tan(tilt) * H);
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.02);
        rod(g, V3(x, 0, bot.z), V3(x, H, top.z), 0.02, m, 0.018, 12);
      }
      const n = 5;
      for (let i = 0; i < n; i++) {
        const y = 0.12 + i * (H - 0.25) / (n - 1);
        const zf = lerp(bot.z, top.z, y / H) + 0.02;
        const d = zf - (-D / 2) + 0.0;
        const depth = Math.max(0.18, d);
        mk(g, B(W - 0.07, 0.022, depth, 0.004), m, 0, y, zf - depth / 2);
        for (const sx of [-1, 1]) mk(g, B(0.015, 0.06, depth - 0.02, 0.003), m, sx * (W / 2 - 0.04), y - 0.04, zf - depth / 2);
        if (books && i < n - 1) {
          if (i % 2 === 0) fillShelf(bag, R, -W / 2 + 0.05, W / 2 - 0.05, y + 0.011, zf - 0.01, 0.3, depth - 0.03, BOOK_COLORS, 0.55);
          else decoVase(g, -W / 4 + R() * 0.2, y + 0.011, zf - depth / 2, R, 0.6);
        }
        if (books && i === n - 1) decoPlant(g, 0, y + 0.011, zf - depth / 2, 0.7);
      }
      break;
    }
    case 'sideboard': {
      const legH = 0.17;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(g, sx * (W / 2 - 0.07), sz * (D / 2 - 0.07), 0, legH + 0.01, m, 0.022, 0.012);
      const bh = H - legH;
      mk(g, B(W, bh, D, 0.008), m, 0, legH + bh / 2, 0);
      const nf = 4, fw = (W - 0.04) / nf;
      for (let i = 0; i < nf; i++) {
        const x = -W / 2 + 0.02 + fw * (i + 0.5);
        if (i < 2) {
          mk(g, B(fw - 0.006, bh - 0.05, 0.016, 0.003), m, x, legH + bh / 2, D / 2 + 0.004);
          mk(g, B(0.012, 0.12, 0.014, 0.004), handleM, x + (i === 0 ? 1 : -1) * (fw / 2 - 0.04), legH + bh / 2 + 0.05, D / 2 + 0.018);
        } else {
          for (let j = 0; j < 3; j++) {
            const fh = (bh - 0.05) / 3;
            const y = legH + 0.025 + fh * (j + 0.5);
            mk(g, B(fw - 0.006, fh - 0.006, 0.016, 0.003), m, x, y, D / 2 + 0.004);
            mk(g, B(0.1, 0.01, 0.014, 0.004), handleM, x, y + fh * 0.25, D / 2 + 0.018);
          }
        }
      }
      if (books) {
        decoVase(g, -W / 2 + 0.2, H, 0, R, 0.9);
        fillShelf(bag, R, W / 2 - 0.5, W / 2 - 0.2, H, D / 2 - 0.08, 0.3, 0.2, BOOK_COLORS, 1);
      }
      break;
    }
    case 'cabinet': case 'display': {
      const disp = style === 'display';
      const kick = disp ? 0.12 : 0.08;
      const ft = disp ? 0.025 : t;
      if (disp) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, B(0.025, H, 0.025, 0.003), m, sx * (W / 2 - 0.0125), H / 2, sz * (D / 2 - 0.0125));
        mk(g, B(W, 0.03, D, 0.004), m, 0, H - 0.015, 0);
        mk(g, B(W, 0.025, D, 0.004), m, 0, kick, 0);
        mk(g, B(W - 0.02, H - kick - 0.04, D - 0.02, 0.0), baseMat('glass'), 0, kick + (H - kick) / 2 - 0.005, 0);
        mk(g, B(0.012, H - kick - 0.04, 0.012, 0.002), m, 0, kick + (H - kick) / 2, D / 2 - 0.006);
        mk(g, B(W - 0.04, 0.018, D - 0.04, 0.004), m, 0, kick - 0.03, 0);
      } else {
        mk(g, B(W, H - kick, D, 0.008), m, 0, kick + (H - kick) / 2, 0);
        mk(g, B(W - 0.04, kick, D - 0.04, 0.004), paint('#1a1a1a', 0.6), 0, kick / 2, -0.01);
        mk(g, B(W + 0.03, 0.03, D + 0.02, 0.008), m, 0, H + 0.015, 0);
        for (const sx of [-1, 1]) {
          mk(g, B(W / 2 - 0.01, H - kick - 0.03, 0.02, 0.004), m, sx * W / 4, kick + (H - kick) / 2, D / 2 + 0.006);
          mk(g, B(W / 2 - 0.1, H - kick - 0.2, 0.006, 0.002), m, sx * W / 4, kick + (H - kick) / 2, D / 2 + 0.017);
          mk(g, B(0.012, 0.2, 0.016, 0.004), handleM, sx * 0.04, kick + (H - kick) * 0.52, D / 2 + 0.03);
        }
      }
      if (disp) {
        const n = 4;
        for (let i = 1; i < n; i++) {
          const y = kick + (H - kick) * i / n;
          mk(g, B(W - 0.05, 0.008, D - 0.05, 0.0), baseMat('glass'), 0, y, 0);
          if (books) {
            if (i % 2) { decoVase(g, -W / 4, y + 0.004, 0, R, 0.65); decoVase(g, W / 5, y + 0.004, 0, R, 0.55); }
            else fillShelf(bag, R, -W / 2 + 0.05, W / 2 - 0.05, y + 0.004, D / 2 - 0.04, 0.4, D - 0.08, BOOK_COLORS, 0.6);
          }
        }
        if (books) decoVase(g, 0.1, kick + 0.0125, 0, R, 0.8);
      }
      break;
    }
  }
  bag.mesh(g, bookMat());
  return g;
}

function books(s) {
  const g = new THREE.Group();
  const R = rng(strHash(JSON.stringify(s)));
  const n = s.n || 7, cols = s.colors && s.colors.length ? s.colors : BOOK_COLORS;
  const bag = new Bag();
  const stand = s.stand !== false;
  if (stand) {
    let x = 0;
    for (let i = 0; i < n; i++) {
      const th = 0.02 + R() * 0.03, h = 0.2 + R() * 0.08, d = 0.15 + R() * 0.05;
      bookGeo(bag, th, h, d, x + th / 2, h / 2, d / 2, cols[i % cols.length]);
      x += th + 0.001;
    }
    bag.list.forEach(gg => gg.translate(-x / 2, 0, -0.1));
    const em = matOf(s.holder || s.mat, 'black');
    for (const sx of [-1, 1]) {
      mk(g, B(0.006, 0.16, 0.12, 0.002), em, sx * (x / 2 + 0.006), 0.08, -0.02);
      mk(g, B(0.1, 0.004, 0.12, 0.001), em, sx * (x / 2 - 0.044), 0.002, -0.02);
    }
    bag.list.forEach(gg => gg.translate(0, 0.004, 0));
  } else {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const th = 0.025 + R() * 0.03, w = 0.22 + R() * 0.08, d = 0.16 + R() * 0.06;
      bookGeo(bag, w, th, d, (R() - 0.5) * 0.03, y + th / 2, 0, cols[i % cols.length], PI / 2 + (R() - 0.5) * 0.3);
      y += th;
    }
  }
  bag.mesh(g, bookMat());
  return g;
}
function bookstack(s) {
  const g = new THREE.Group();
  const R = rng(strHash(JSON.stringify(s)));
  const n = s.n || 9, cols = s.colors && s.colors.length ? s.colors : BOOK_COLORS;
  const bag = new Bag();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const th = 0.03 + R() * 0.035, w = 0.3 - i * 0.008 + R() * 0.05, d = 0.22 + R() * 0.06;
    bookGeo(bag, w, th, d, (R() - 0.5) * 0.04, y + th / 2, (R() - 0.5) * 0.04, cols[Math.floor(R() * cols.length)], (R() - 0.5) * 0.5);
    y += th;
  }
  bag.mesh(g, bookMat());
  if (s.top !== false) {
    // 上にマグカップ
    const mug = smooth([[0.001, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.09], [0.037, 0.09], [0.037, 0.012], [0.001, 0.012]], 16);
    const cm2 = paint(s.mugColor || '#e8e2d6', 0.3);
    mk(g, LA(mug, 28), cm2, 0.03, y, 0.02);
    mk(g, T(0.025, 0.006, 6, 16, PI), cm2, 0.075, y + 0.045, 0.02, 0, 0, -PI / 2);
    mk(g, new THREE.CircleGeometry(0.037, 20).rotateX(-PI / 2), paint('#3b2414', 0.15), 0.03, y + 0.07, 0.02);
  }
  return g;
}

// =====================================================================
// 植物
// =====================================================================
// 葉の形（透明な背景に緑の葉）
function leafTex(kind) {
  return canvasTex('leaf-' + kind, 128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, h, w, 0);
    const pal = { leaf: ['#2f5a24', '#5f8f3a'], narrow: ['#3a6a2a', '#7aa04a'], monstera: ['#1f4a1f', '#3f7a33'], fig: ['#244d1e', '#4f8536'] }[kind];
    grad.addColorStop(0, pal[0]); grad.addColorStop(1, pal[1]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (kind === 'narrow') {
      ctx.moveTo(w / 2, h);
      ctx.quadraticCurveTo(w * 0.95, h * 0.5, w / 2, 0);
      ctx.quadraticCurveTo(w * 0.05, h * 0.5, w / 2, h);
    } else if (kind === 'fig') {
      ctx.moveTo(w / 2, h);
      ctx.bezierCurveTo(w * 0.1, h * 0.85, w * -0.05, h * 0.25, w * 0.35, h * 0.05);
      ctx.quadraticCurveTo(w / 2, 0, w * 0.65, h * 0.05);
      ctx.bezierCurveTo(w * 1.05, h * 0.25, w * 0.9, h * 0.85, w / 2, h);
    } else if (kind === 'monstera') {
      // ハート形の広い葉
      ctx.moveTo(w / 2, h * 0.9);
      ctx.bezierCurveTo(w * 0.3, h * 1.02, w * -0.02, h * 0.85, w * 0.01, h * 0.5);
      ctx.bezierCurveTo(w * 0.03, h * 0.15, w * 0.3, h * 0.0, w / 2, 0);
      ctx.bezierCurveTo(w * 0.7, h * 0.0, w * 0.97, h * 0.15, w * 0.99, h * 0.5);
      ctx.bezierCurveTo(w * 1.02, h * 0.85, w * 0.7, h * 1.02, w / 2, h * 0.9);
      ctx.lineTo(w / 2, h);
    } else {
      ctx.moveTo(w / 2, h);
      ctx.bezierCurveTo(w * 0.02, h * 0.75, w * 0.1, h * 0.2, w / 2, 0);
      ctx.bezierCurveTo(w * 0.9, h * 0.2, w * 0.98, h * 0.75, w / 2, h);
    }
    ctx.fill();
    if (kind === 'monstera') {
      // 切れこみと穴
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        const y = h * (0.2 + i * 0.14);
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(w / 2 + sx * w * 0.55, y - h * 0.1);
          ctx.quadraticCurveTo(w / 2 + sx * w * 0.32, y - h * 0.02, w / 2 + sx * w * 0.14, y + h * 0.01);
          ctx.stroke();
          if (i > 0 && i < 4) { ctx.beginPath(); ctx.ellipse(w / 2 + sx * w * 0.1, y + h * 0.07, 3, 6, sx * 0.4, 0, TAU); ctx.fill(); }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 葉脈
    ctx.strokeStyle = 'rgba(200,230,150,0.45)';
    ctx.lineWidth = kind === 'narrow' ? 1.5 : 2.5;
    ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, h * 0.04); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190,220,140,0.25)';
    if (kind !== 'narrow') for (let i = 1; i < 8; i++) {
      const y = h * (1 - i / 8.5);
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(w / 2, y + h * 0.06); ctx.quadraticCurveTo(w / 2 + sx * w * 0.2, y, w / 2 + sx * w * 0.4, y - h * 0.04); ctx.stroke(); }
    }
  }, { rep: 1 });
}
const leafMat = kind => cm('leafm' + kind, () => std({ color: '#ffffff', map: leafTex(kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
// 葉の板（根もとが原点、+Y に伸びる、真ん中で少し折れる）
const leafGeo = (bend = 0.25) => cg('leafgeo' + bend, () => {
  const g = new THREE.PlaneGeometry(1, 1, 2, 3);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, (Math.abs(x) < 0.01 ? 0.08 : 0) - bend * y * y);
  }
  g.computeVertexNormals();
  return g;
});
// 葉をたくさん並べる（1回で描く）
function leafCloud(g, kind, list, bend) {
  const im = new THREE.InstancedMesh(leafGeo(bend), leafMat(kind), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), c = new THREE.Color();
  list.forEach((L, i) => {
    q.setFromUnitVectors(UP, L.dir.clone().normalize());
    q2.setFromAxisAngle(UP, L.spin);
    q.multiply(q2);
    m.compose(L.pos, q, V3(L.w, L.len, L.w));
    im.setMatrixAt(i, m);
    c.setHSL(0.25 + (L.hue || 0), 0.35, 0.75 + (L.light || 0));
    im.setColorAt(i, c);
  });
  im.castShadow = true; im.receiveShadow = true;
  g.add(im);
  return im;
}
const stemMat = () => paint('#4b5e2c', 0.7);
const trunkMat = () => cm('trunkm', () => std({ color: barkTex() ? '#b8a690' : '#5a4636', map: barkTex(), roughness: 0.9 }));

function potMat(s, def) {
  const v = s.potColor;
  if (v && MATS[v]) return baseMat(v);
  if (v && v[0] === '#') return cm('pot' + v, () => std({ color: v, roughness: 0.4 }));
  return baseMat(def);
}
// 鉢を作って、土の高さを返す
function makePot(g, s, size) {
  const pot = s.pot || 'round';
  const k = clamp(size / 1.0, 0.45, 1.6);
  const def = { round: 'ceramic', tall: '#2e2e2c', bowl: 'terracotta', basket: 'rattan', square: 'concrete', stand: 'ceramic' }[pot] || 'ceramic';
  const m = potMat(s, def);
  const soil = paint('#3a2a1e', 1);
  let top = 0, rTop = 0.12, y0 = 0;
  const lathePot = (outer, wall = 0.012) => {
    // 外側→ふち→内側（土の少し下まで）
    const o = smooth(outer, 14);
    const last = o[o.length - 1];
    const pts = [[0.001, 0], ...o, [last[0] - wall, last[1]], [last[0] - wall * 1.3, last[1] - 0.04 * k]];
    mk(g, LA(pts, 32), m, 0, y0, 0);
    top = y0 + last[1] - 0.025 * k; rTop = last[0] - wall;
  };
  switch (pot) {
    case 'round': lathePot([[0.1 * k, 0], [0.15 * k, 0.05 * k], [0.165 * k, 0.15 * k], [0.15 * k, 0.24 * k], [0.13 * k, 0.27 * k]]); break;
    case 'tall': lathePot([[0.1 * k, 0], [0.12 * k, 0.15 * k], [0.14 * k, 0.4 * k], [0.145 * k, 0.45 * k]]); break;
    case 'bowl': lathePot([[0.09 * k, 0], [0.16 * k, 0.04 * k], [0.21 * k, 0.12 * k], [0.225 * k, 0.16 * k]], 0.015); break;
    case 'basket': {
      lathePot([[0.13 * k, 0], [0.15 * k, 0.12 * k], [0.165 * k, 0.28 * k], [0.167 * k, 0.3 * k]], 0.008);
      mk(g, T(0.167 * k, 0.008, 6, 40), baseMat('rattan'), 0, 0.3 * k, 0, PI / 2);
      break;
    }
    case 'square': {
      const w = 0.3 * k, h = 0.32 * k;
      mk(g, B(w, h, w, 0.012), m, 0, h / 2, 0);
      top = h - 0.02; rTop = w / 2 - 0.02;
      mk(g, B(w - 0.03, 0.004, w - 0.03, 0.001), soil, 0, top, 0);
      return { top, r: rTop };
    }
    case 'stand': {
      // 木の台の上の鉢
      const wm = matOf(s.standMat, 'walnut'), sh = 0.3 * k;
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + PI / 4;
        rod(g, V3(Math.cos(a) * 0.2 * k, 0, Math.sin(a) * 0.2 * k), V3(Math.cos(a) * 0.12 * k, sh, Math.sin(a) * 0.12 * k), 0.011, wm, 0.014, 10);
      }
      mk(g, T(0.13 * k, 0.012, 8, 40), wm, 0, sh - 0.01, 0, PI / 2);
      y0 = sh - 0.03;
      lathePot([[0.09 * k, 0], [0.13 * k, 0.04 * k], [0.15 * k, 0.15 * k], [0.15 * k, 0.22 * k]]);
      break;
    }
    default: lathePot([[0.1 * k, 0], [0.15 * k, 0.05 * k], [0.165 * k, 0.15 * k], [0.15 * k, 0.24 * k], [0.13 * k, 0.27 * k]]);
  }
  mk(g, new THREE.CircleGeometry(rTop, 32).rotateX(-PI / 2), soil, 0, top, 0);
  return { top, r: rTop };
}

function plant(s) {
  const g = new THREE.Group();
  const fol = s.foliage || 'bush';
  const size = s.size || { bush: 0.7, tree: 1.6, cactus: 0.9, palm: 1.5, grass: 0.8, monstera: 1.0 }[fol] || 0.8;
  const R = rng(strHash(JSON.stringify(s)));
  const potSize = fol === 'tree' || fol === 'palm' ? size * 0.6 : size;
  const { top, r } = makePot(g, s, clamp(potSize, 0.35, 1.1));
  const hAbove = Math.max(0.15, size - top);
  switch (fol) {
    case 'bush': {
      const list = [];
      const nC = 5;
      const centers = [];
      for (let i = 0; i < nC; i++) {
        const a = i / nC * TAU + R();
        const rr = i === 0 ? 0 : r * 0.7;
        centers.push(V3(Math.cos(a) * rr, top + hAbove * (i === 0 ? 0.6 : 0.35 + R() * 0.25), Math.sin(a) * rr));
      }
      const nL = s.leaves || Math.round(160 + size * 120);
      const ls = clamp(size * 0.13, 0.04, 0.13);
      for (let i = 0; i < nL; i++) {
        const c = centers[i % nC];
        const dir = V3(R() - 0.5, R() * 0.9 - 0.15, R() - 0.5).normalize();
        const rad = hAbove * 0.38 * (0.4 + R() * 0.6);
        const pos = c.clone().addScaledVector(dir, rad);
        if (pos.y < top + 0.02) pos.y = top + 0.02 + R() * 0.03;
        dir.y += 0.35;
        list.push({ pos, dir, spin: R() * TAU, w: ls * (0.45 + R() * 0.2), len: ls * (0.8 + R() * 0.4), hue: (R() - 0.5) * 0.04, light: (R() - 0.5) * 0.15 });
      }
      for (const c of centers) tube(g, [V3(c.x * 0.2, top, c.z * 0.2), V3(c.x * 0.7, (top + c.y) / 2, c.z * 0.7), c], 0.005, stemMat(), 8, 5);
      leafCloud(g, 'leaf', list, 0.25);
      break;
    }
    case 'tree': {
      const tm = trunkMat();
      const th = top + hAbove * 0.55;
      const trunkPts = [V3(0, top - 0.02, 0), V3(0.02, top + hAbove * 0.2, 0), V3(-0.02, top + hAbove * 0.4, 0.01), V3(0.01, th, 0)];
      tube(g, trunkPts, 0.022 * clamp(size, 0.8, 2), tm, 20, 8);
      const list = [];
      const tips = [];
      const nb = 5;
      for (let i = 0; i < nb; i++) {
        const a = i / nb * TAU + R() * 0.8;
        const y0b = top + hAbove * (0.45 + i * 0.08);
        const tip = V3(Math.cos(a) * hAbove * 0.22, top + hAbove * (0.72 + R() * 0.22), Math.sin(a) * hAbove * 0.22);
        tube(g, [V3(0, y0b, 0), V3(tip.x * 0.5, (y0b + tip.y) / 2 + 0.02, tip.z * 0.5), tip], 0.008, tm, 10, 6);
        tips.push(tip);
      }
      tips.push(V3(0, top + hAbove * 0.95, 0));
      const nL = s.leaves || Math.round(130 + size * 50);
      const ls = clamp(size * 0.09, 0.08, 0.16);
      for (let i = 0; i < nL; i++) {
        const c = tips[i % tips.length];
        const dir = V3(R() - 0.5, R() - 0.35, R() - 0.5).normalize();
        const pos = c.clone().addScaledVector(dir, hAbove * 0.16 * (0.3 + R() * 0.7));
        dir.y += 0.5;
        list.push({ pos, dir, spin: R() * TAU, w: ls * (0.6 + R() * 0.2), len: ls * (0.8 + R() * 0.4), hue: (R() - 0.5) * 0.03, light: (R() - 0.5) * 0.15 });
      }
      leafCloud(g, 'fig', list, 0.2);
      break;
    }
    case 'cactus': {
      const cmat = cm('cactus', () => {
        const map = canvasTex('cactusdots', 64, 64, (ctx, w, h) => {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#f1edd8';
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w / 2, (i + 0.5) * h / 4, 2.2, 0, TAU); ctx.fill(); }
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, 3, h); ctx.fillRect(w - 3, 0, 3, h);
        }, { srgb: true });
        if (map) map.repeat.set(8, 6);
        return std({ color: '#5d8a4a', map, roughness: 0.55 });
      });
      const capsule = (rad, len) => cg(`cap${r4(rad)},${r4(len)}`, () => {
        const c = new THREE.CapsuleGeometry(rad, len, 4, 16);
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i);
          const a = Math.atan2(x, z);
          const k = 1 + 0.08 * Math.cos(a * 8);
          p.setX(i, x * k); p.setZ(i, z * k);
        }
        c.computeVertexNormals();
        return c;
      });
      const H = hAbove;
      const r0 = clamp(H * 0.11, 0.04, 0.09);
      mk(g, capsule(r0, H - r0 * 2), cmat, 0, top + H / 2 - r0 * 0.6, 0);
      const arms = [[1, 0.35, 0.3], [-1, 0.5, 0.22]];
      for (const [sx, hy, len] of arms) {
        const ar = r0 * 0.7, y = top + H * hy;
        const ex = sx * (r0 + ar * 1.6);
        mk(g, capsule(ar, ar * 1.6), cmat, sx * (r0 + ar * 0.4), y, 0, 0, 0, PI / 2);
        mk(g, capsule(ar, H * len), cmat, ex, y + H * len / 2, 0);
      }
      // 小さな花
      mk(g, S(r0 * 0.25, 10, 8), paint('#e85a7a', 0.6), 0, top + H - r0 * 0.4, 0).scale.y = 0.6;
      break;
    }
    case 'palm': {
      const list = [];
      const nF = 9;
      const sm = stemMat();
      for (let f = 0; f < nF; f++) {
        const a = f / nF * TAU + R() * 0.5;
        const reach = hAbove * (0.35 + R() * 0.2);
        const peak = top + hAbove * (0.65 + R() * 0.35);
        const base = V3(Math.cos(a) * r * 0.3, top, Math.sin(a) * r * 0.3);
        const p1 = V3(Math.cos(a) * reach * 0.25, peak * 0.85 + top * 0.15, Math.sin(a) * reach * 0.25);
        const p2 = V3(Math.cos(a) * reach * 0.7, peak, Math.sin(a) * reach * 0.7);
        const p3 = V3(Math.cos(a) * reach, peak - hAbove * 0.15, Math.sin(a) * reach);
        const curve = new THREE.CatmullRomCurve3([base, p1, p2, p3]);
        mk(g, new THREE.TubeGeometry(curve, 12, 0.005, 5), sm);
        const nl = 16;
        for (let i = 3; i < nl; i++) {
          const t = i / nl;
          const p = curve.getPoint(t), tan = curve.getTangent(t);
          const side = V3(-Math.sin(a), 0, Math.cos(a));
          for (const sd of [-1, 1]) {
            const dir = side.clone().multiplyScalar(sd).addScaledVector(tan, 0.6).add(V3(0, -0.35, 0));
            const L = hAbove * 0.22 * Math.sin(PI * (0.25 + t * 0.7));
            list.push({ pos: p, dir, spin: sd * 1.2 + a, w: L * 0.14, len: L, hue: (R() - 0.5) * 0.03, light: (R() - 0.5) * 0.1 });
          }
        }
      }
      leafCloud(g, 'narrow', list, 0.15);
      break;
    }
    case 'grass': {
      const bag = new Bag();
      const nB = s.blades || 90;
      for (let i = 0; i < nB; i++) {
        const a = R() * TAU, rr = Math.sqrt(R()) * r * 0.8;
        const L = hAbove * (0.5 + R() * 0.5), lean = 0.15 + R() * 0.55, w = 0.008 + R() * 0.006;
        const seg = 5, pos = [], col = [];
        const c0 = vc('#3d5a24'), c1 = new THREE.Color().setHSL(0.18 + R() * 0.06, 0.45, 0.45 + R() * 0.15);
        const dx = Math.cos(a), dz = Math.sin(a);
        for (let j = 0; j <= seg; j++) {
          const t = j / seg;
          const out = Math.sin(t * PI / 2) * lean * L * t;
          const y = top + L * t * (1 - lean * 0.4 * t);
          const ww = w * (1 - t * 0.9);
          const cx = Math.cos(a) * rr + dx * out, cz = Math.sin(a) * rr + dz * out;
          pos.push(cx - dz * ww, y, cz + dx * ww, cx + dz * ww, y, cz - dx * ww);
          const cc = [lerp(c0[0], c1.r, t), lerp(c0[1], c1.g, t), lerp(c0[2], c1.b, t)];
          col.push(...cc, ...cc);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const idx = [];
        for (let j = 0; j < seg; j++) { const k = j * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
        bag.list.push(geo);
      }
      bag.mesh(g, cm('grassm', () => std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })));
      break;
    }
    case 'monstera': {
      const list = [];
      const nL = s.leaves || 9;
      const sm = stemMat();
      for (let i = 0; i < nL; i++) {
        const a = i / nL * TAU + R() * 0.6;
        const reach = hAbove * (0.25 + R() * 0.3);
        const hy = top + hAbove * (0.45 + R() * 0.45);
        const tip = V3(Math.cos(a) * reach, hy, Math.sin(a) * reach);
        tube(g, [V3(Math.cos(a) * 0.02, top, Math.sin(a) * 0.02), V3(Math.cos(a) * reach * 0.4, (top + hy) / 2 + 0.05, Math.sin(a) * reach * 0.4), tip], 0.007, sm, 10, 5);
        const L = hAbove * (0.42 + R() * 0.15);
        const dir = V3(Math.cos(a), 0.55 + R() * 0.4, Math.sin(a));
        list.push({ pos: tip, dir, spin: PI + (R() - 0.5) * 0.4, w: L * 0.85, len: L, hue: (R() - 0.5) * 0.02, light: (R() - 0.5) * 0.08 });
      }
      leafCloud(g, 'monstera', list, 0.3);
      break;
    }
  }
  return g;
}

// =====================================================================
// 花びん・ろうそく
// =====================================================================
const VASE_PROFILES = {
  bottle: [[0.06, 0], [0.075, 0.02], [0.078, 0.12], [0.07, 0.17], [0.035, 0.21], [0.02, 0.24], [0.019, 0.3], [0.023, 0.31]],
  round: [[0.05, 0], [0.095, 0.03], [0.115, 0.1], [0.1, 0.17], [0.05, 0.215], [0.038, 0.23], [0.042, 0.24]],
  tall: [[0.055, 0], [0.06, 0.01], [0.068, 0.2], [0.08, 0.38], [0.085, 0.42]],
  bowl: [[0.06, 0], [0.11, 0.02], [0.155, 0.07], [0.17, 0.11], [0.172, 0.115]],
  amphora: [[0.045, 0], [0.06, 0.01], [0.1, 0.09], [0.115, 0.16], [0.09, 0.24], [0.045, 0.29], [0.04, 0.33], [0.06, 0.36], [0.062, 0.365]],
  jug: [[0.065, 0], [0.085, 0.03], [0.095, 0.1], [0.08, 0.18], [0.06, 0.22], [0.065, 0.25], [0.07, 0.26]],
};
function vase(s) {
  const g = new THREE.Group();
  const shape = VASE_PROFILES[s.shape] ? s.shape : 'bottle';
  const R = rng(strHash(JSON.stringify(s)));
  const gloss = s.gloss ?? 0.6;
  const col = s.color && s.color[0] === '#' ? s.color : null;
  const m = s.color && MATS[s.color] ? baseMat(s.color) : cm('vase' + (col || shape) + gloss, () => new THREE.MeshPhysicalMaterial({
    color: col || { bottle: '#5a7a8c', round: '#e6e0d4', tall: '#2a2a2a', bowl: '#c46a42', amphora: '#b5643d', jug: '#e9e3d6' }[shape],
    roughness: lerp(0.85, 0.15, gloss), clearcoat: gloss, clearcoatRoughness: 0.15,
  }));
  const prof = smooth(VASE_PROFILES[shape], s.low ? 10 : 20);
  const last = prof[prof.length - 1];
  const pts = [[0.001, 0.002], [prof[0][0] * 0.9, 0], ...prof, [last[0] - 0.006, last[1] - 0.004], [last[0] - 0.008, last[1] - 0.04], [0.001, last[1] - 0.06]];
  mk(g, LA(pts, s.low ? 20 : 32), m, 0, 0, 0);
  if (shape === 'amphora') {
    for (const sx of [-1, 1]) tube(g, [[sx * 0.045, 0.31, 0], [sx * 0.1, 0.3, 0], [sx * 0.11, 0.24, 0], [sx * 0.09, 0.2, 0]], 0.008, m, 16, 6);
  }
  if (shape === 'jug') {
    tube(g, [[0.075, 0.22, 0], [0.13, 0.21, 0], [0.13, 0.12, 0], [0.093, 0.08, 0]], 0.01, m, 16, 6);
  }
  if (s.flowers) {
    const top = last[1], rr = Math.max(0.012, last[0] - 0.01);
    const n = shape === 'bowl' ? 9 : 6;
    const palette = s.flowerColors || ['#f2d0d6', '#e8a1a8', '#fff4e3', '#f6c35b', '#d5636e'];
    const sm = stemMat();
    const leaves = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + R() * 0.6;
      const h = shape === 'bowl' ? 0.06 + R() * 0.05 : 0.18 + R() * 0.16;
      const spread = shape === 'bowl' ? 0.1 + R() * 0.06 : 0.06 + R() * 0.08;
      const base = V3(Math.cos(a) * rr * 0.4, top - 0.05, Math.sin(a) * rr * 0.4);
      const tip = V3(Math.cos(a) * spread, top + h, Math.sin(a) * spread);
      tube(g, [base, V3(Math.cos(a) * rr * 0.8, top + 0.01, Math.sin(a) * rr * 0.8), V3(tip.x * 0.8, top + h * 0.6, tip.z * 0.8), tip], 0.003, sm, 12, 4);
      // 花（チューリップ形）
      const fm = cm('flower' + palette[i % palette.length], () => std({ color: palette[i % palette.length], roughness: 0.6, side: THREE.DoubleSide }));
      const cup = LA(smooth([[0.001, 0], [0.015, 0.006], [0.022, 0.02], [0.02, 0.038], [0.014, 0.05]], 10), 10);
      const f = mk(g, cup, fm, tip.x, tip.y - 0.004, tip.z);
      f.rotation.set((R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5);
      for (let j = 0; j < 2; j++) {
        const t = 0.35 + j * 0.25;
        const p = base.clone().lerp(tip, t);
        leaves.push({ pos: p, dir: V3(Math.cos(a + j * 2), 0.9, Math.sin(a + j * 2)), spin: R() * TAU, w: 0.02, len: 0.07 + R() * 0.03 });
      }
    }
    leafCloud(g, 'narrow', leaves, 0.2);
  }
  return g;
}

function candle(s) {
  const g = new THREE.Group();
  const R = rng(strHash(JSON.stringify(s)));
  const n = s.n || 3;
  const hk = s.holder || 'brass';
  const hm = matOf(hk, 'brass');
  const wax = paint(s.color || '#f4efe4', 0.55);
  const flameM = glow('#ffbe6a', 3);
  const flame = LA(smooth([[0.001, 0], [0.006, 0.006], [0.0075, 0.015], [0.004, 0.026], [0.001, 0.034]], 12), 12);
  const wick = paint('#1a1410', 0.9);
  let maxY = 0;
  const lit = (x, y, z) => {
    mk(g, C(0.001, 0.001, 0.008, 4), wick, x, y + 0.004, z);
    mk(g, flame, flameM, x, y + 0.006, z).castShadow = false;
    maxY = Math.max(maxY, y + 0.02);
  };
  const metal = ['brass', 'chrome', 'black', 'gunmetal', 'copper'].includes(hk);
  const glassy = hk === 'glass' || hk === 'smoked';
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (metal ? 0.1 : 0.12), z = (i % 2) * 0.04 - 0.02;
    if (metal) {
      const h = 0.12 + ((i * 7) % 3) * 0.06;
      const prof = smooth([[0.05, 0], [0.05, 0.008], [0.025, 0.02], [0.012, 0.05], [0.014, h * 0.6], [0.01, h - 0.02], [0.025, h - 0.008], [0.025, h]], 24);
      mk(g, LA([[0.001, 0], ...prof, [0.001, h]], 24), hm, x, 0, z);
      const ch = 0.16 + R() * 0.06;
      mk(g, C(0.0105, 0.0115, ch, 14), wax, x, h + ch / 2, z);
      lit(x, h + ch, z);
    } else if (glassy) {
      const h = 0.09;
      mk(g, C(0.04, 0.038, h, 24, true), baseMat(hk), x, h / 2, z);
      mk(g, C(0.036, 0.036, 0.05, 20), wax, x, 0.025, z);
      lit(x, 0.05, z);
    } else {
      const h = 0.08 + ((i * 5) % 3) * 0.05, r = 0.035 + ((i * 3) % 2) * 0.01;
      mk(g, LA([[0.001, 0], [r, 0], [r, h - 0.006], [r - 0.004, h], [0.001, h - 0.004]], 28), wax, x, 0.012, z);
      lit(x, h + 0.008, z);
    }
  }
  if (!metal && !glassy) mk(g, DISC((n * 0.12) / 2 + 0.04, 0.012, 40), hm, 0, 0.006, 0);
  setLight(g, maxY, s.intensity ?? 0.3, '#ffb36b');
  return g;
}

// =====================================================================
// 壁に掛ける物（背中が z=0、正面 +Z）
// =====================================================================
// 画像を読み込んで、面の縦横比に合わせて切り抜く
function imageMaterial(path, w, h, rough = 0.6) {
  const m = std({ color: '#c8c2b8', roughness: rough });
  if (path) loadTex(path, true).then(t => {
    if (!t) return;
    const c = t.clone();
    const ia = (t.image && t.image.width / t.image.height) || 1, pa = w / h;
    c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping;
    if (ia > pa) { c.repeat.set(pa / ia, 1); c.offset.set((1 - pa / ia) / 2, 0); } else { c.repeat.set(1, ia / pa); c.offset.set(0, (1 - ia / pa) / 2); }
    c.needsUpdate = true;
    m.map = c; m.color.set('#ffffff'); m.needsUpdate = true;
  });
  return m;
}
// 四角い枠（内側 w×h、太さ fw、奥行 fd）
function rectFrame(g, w, h, fw, fd, m, z = 0) {
  mk(g, B(w + fw * 2, fw, fd, 0.004), m, 0, h / 2 + fw / 2, z + fd / 2);
  mk(g, B(w + fw * 2, fw, fd, 0.004), m, 0, -h / 2 - fw / 2, z + fd / 2);
  mk(g, B(fw, h, fd, 0.004), m, -w / 2 - fw / 2, 0, z + fd / 2);
  mk(g, B(fw, h, fd, 0.004), m, w / 2 + fw / 2, 0, z + fd / 2);
}
function frame(s) {
  const g = new THREE.Group();
  const w = s.w || 0.5, h = s.h || 0.7;
  const fm = matOf(s.frame, 'black');
  const fw = 0.028, fd = 0.028;
  const ow = w - fw * 2, oh = h - fw * 2; // 枠の内側
  rectFrame(g, ow, oh, fw, fd, fm);
  mk(g, B(ow, oh, 0.006, 0.0), paint('#3a342c', 0.9), 0, 0, 0.003);
  const hasMat = s.mat !== false;
  const mw = hasMat ? Math.min(ow, oh) * 0.13 : 0;
  const iw = ow - mw * 2, ih = oh - mw * 2;
  mk(g, new THREE.PlaneGeometry(iw, ih), imageMaterial(s.img || 'img/out-sunset.jpg', iw, ih), 0, 0, 0.008);
  if (hasMat) {
    const mm = paint('#f5f2ea', 0.85);
    mk(g, B(ow, mw, 0.004, 0), mm, 0, oh / 2 - mw / 2, 0.011);
    mk(g, B(ow, mw, 0.004, 0), mm, 0, -oh / 2 + mw / 2, 0.011);
    mk(g, B(mw, ih, 0.004, 0), mm, -ow / 2 + mw / 2, 0, 0.011);
    mk(g, B(mw, ih, 0.004, 0), mm, ow / 2 - mw / 2, 0, 0.011);
  }
  // ガラスの映りこみ
  mk(g, new THREE.PlaneGeometry(ow, oh), cm('frameglass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, depthWrite: false })), 0, 0, 0.0175);
  return g;
}

function mirror(s) {
  const g = new THREE.Group();
  const shape = s.shape || 'round';
  const fm = matOf(s.frame, { round: 'brass', rect: 'black', arch: 'oak', sunburst: 'brass' }[shape]);
  const mm = MIRROR();
  switch (shape) {
    case 'round': {
      const R0 = s.r || 0.4;
      mk(g, C(R0, R0, 0.012, 64), paint('#222', 0.8), 0, 0, 0.006, PI / 2);
      mk(g, new THREE.CircleGeometry(R0 - 0.005, 64), mm, 0, 0, 0.0125);
      mk(g, T(R0, 0.016, 10, 72), fm, 0, 0, 0.016);
      break;
    }
    case 'rect': {
      const w = s.w || 0.6, h = s.h || 1.0, fw = 0.035;
      rectFrame(g, w, h, fw, 0.035, fm);
      mk(g, new THREE.PlaneGeometry(w, h), mm, 0, 0, 0.012);
      mk(g, B(w, h, 0.01, 0), paint('#222', 0.8), 0, 0, 0.005);
      break;
    }
    case 'arch': {
      const w = s.w || 0.6, h = s.h || 1.1, fw = 0.04;
      const archShape = (ww, hh) => {
        const sh = new THREE.Shape();
        const r = ww / 2;
        sh.moveTo(-r, -hh / 2); sh.lineTo(r, -hh / 2); sh.lineTo(r, hh / 2 - r);
        sh.absarc(0, hh / 2 - r, r, 0, PI, false);
        sh.lineTo(-r, -hh / 2);
        return sh;
      };
      const outer = archShape(w + fw * 2, h + fw * 2);
      outer.holes.push(archShape(w, h));
      const fg = new THREE.ExtrudeGeometry(outer, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 40 });
      mk(g, worldUV(fg), fm, 0, 0, 0.004);
      mk(g, new THREE.ShapeGeometry(archShape(w + 0.01, h + 0.01), 40), mm, 0, 0, 0.012);
      break;
    }
    case 'sunburst': {
      const r0 = 0.17;
      mk(g, C(r0, r0, 0.012, 48), paint('#222', 0.8), 0, 0, 0.012, PI / 2);
      mk(g, new THREE.CircleGeometry(r0 - 0.005, 48), mm, 0, 0, 0.0185);
      mk(g, T(r0, 0.014, 8, 56), fm, 0, 0, 0.02);
      const bag = new Bag();
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, L = i % 2 ? 0.2 : 0.29;
        const p0 = V3(Math.cos(a) * (r0 + 0.01), Math.sin(a) * (r0 + 0.01), 0.02), p1 = V3(Math.cos(a) * (r0 + L), Math.sin(a) * (r0 + L), 0.02);
        bag.addRod(p0, p1, i % 2 ? 0.003 : 0.0045, 6);
        bag.add(S(i % 2 ? 0.008 : 0.012, 8, 6), p1.x, p1.y, p1.z);
      }
      bag.mesh(g, fm);
      break;
    }
  }
  return g;
}

function clockFace(style) {
  return canvasTex('clock-' + style, 512, 512, (ctx, w) => {
    const c = w / 2;
    const bg = { simple: '#fbfaf6', station: '#ffffff', wood: null, minimal: '#ecebe7' }[style];
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, w); } else ctx.clearRect(0, 0, w, w);
    const ink = style === 'wood' ? '#2a1d14' : '#1b1b1b';
    ctx.fillStyle = ink; ctx.strokeStyle = ink;
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, big = i % 5 === 0;
      if (style === 'minimal' && i % 15) continue;
      if (style === 'wood' && !big) continue;
      ctx.save(); ctx.translate(c, c); ctx.rotate(a);
      if (style === 'station') ctx.fillRect(big ? -9 : -3, -c * 0.95, big ? 18 : 6, big ? 62 : 20);
      else if (style === 'wood') { ctx.beginPath(); ctx.arc(0, -c * 0.82, i % 15 ? 7 : 11, 0, TAU); ctx.fill(); }
      else if (style === 'minimal') ctx.fillRect(-5, -c * 0.92, 10, 60);
      else ctx.fillRect(big ? -4 : -1.5, -c * 0.95, big ? 8 : 3, big ? 28 : 14);
      ctx.restore();
    }
    if (style === 'simple') {
      ctx.font = '600 62px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU; ctx.fillText(String(i), c + Math.sin(a) * c * 0.7, c - Math.cos(a) * c * 0.7); }
    }
  });
}
function clock(s) {
  const g = new THREE.Group();
  const style = s.style || 'simple';
  const R0 = { simple: 0.15, station: 0.22, wood: 0.17, minimal: 0.16 }[style] || 0.15;
  const rimM = matOf(s.rim, { simple: 'black', station: 'black', wood: 'oak', minimal: 'brass' }[style]);
  let fz;
  if (style === 'wood') {
    mk(g, DISC(R0, 0.022, 64), rimM, 0, 0, 0.011, PI / 2);
    fz = 0.0225;
    const face = new THREE.CircleGeometry(R0 * 0.98, 48);
    mk(g, face, cm('clockface-wood', () => std({ map: clockFace('wood'), transparent: true, roughness: 0.6 })), 0, 0, fz);
  } else {
    const depth = style === 'station' ? 0.06 : 0.035;
    const rw = style === 'minimal' ? 0.006 : style === 'station' ? 0.02 : 0.012;
    // 枠（回転体）
    const prof = [[R0 - 0.004, 0], [R0 + rw, 0], [R0 + rw, depth - rw * 0.5], [R0 + rw * 0.5, depth], [R0, depth], [R0 - 0.002, depth - 0.004]];
    mk(g, LA(prof, 64), rimM, 0, 0, 0, PI / 2);
    fz = depth - 0.01;
    mk(g, new THREE.CircleGeometry(R0, 48), cm('clockface-' + style, () => std({ color: clockFace(style) ? '#ffffff' : '#f6f4ef', map: clockFace(style), roughness: 0.5 })), 0, 0, fz);
    mk(g, new THREE.CircleGeometry(R0, 48), cm('clockglass', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false })), 0, 0, depth - 0.003);
  }
  // 針（10時10分）
  const handM = style === 'wood' || style === 'minimal' ? paint('#c9a05a', 0.3, 1) : paint('#151515', 0.5);
  const hand = (len, wdt, ang, z) => {
    const m = mk(g, B(wdt, len, 0.002, 0), handM, Math.sin(ang) * len * 0.4, Math.cos(ang) * len * 0.4, fz + z, 0, 0, -ang);
    return m;
  };
  const k = style === 'station' ? 1.6 : 1;
  hand(R0 * 0.62, 0.008 * k, (10 + 10 / 60) / 12 * TAU, 0.003);
  hand(R0 * 0.9, 0.005 * k, 10 / 60 * TAU, 0.005);
  if (style !== 'minimal') {
    const sec = mk(g, B(0.0018, R0 * 1.0, 0.0015, 0), paint('#c8231c', 0.5), Math.sin(4.2) * R0 * 0.35, Math.cos(4.2) * R0 * 0.35, fz + 0.007, 0, 0, -4.2);
    if (style === 'station') mk(g, C(0.012, 0.012, 0.002, 16), paint('#c8231c', 0.5), Math.sin(4.2) * R0 * 0.62, Math.cos(4.2) * R0 * 0.62, fz + 0.007, PI / 2);
  }
  mk(g, C(0.007, 0.007, 0.01, 12), handM, 0, 0, fz + 0.006, PI / 2);
  return g;
}

function wallshelf(s) {
  const g = new THREE.Group();
  const style = s.style || 'plank';
  const m = matOf(s.mat, style === 'box' ? 'white' : 'oak');
  const R = rng(strHash(JSON.stringify(s)));
  const W = s.w || (style === 'box' ? 0.6 : 0.8), D = 0.2, t = 0.035;
  let y = 0; // 物を置く面の高さ
  if (style === 'plank') {
    mk(g, B(W, t, D, 0.006), m, 0, -t / 2, D / 2);
  } else if (style === 'box') {
    const H = 0.26, tt = 0.02;
    mk(g, B(W, tt, D, 0.004), m, 0, -H / 2 + tt / 2, D / 2);
    mk(g, B(W, tt, D, 0.004), m, 0, H / 2 - tt / 2, D / 2);
    for (const sx of [-1, 1]) mk(g, B(tt, H - tt * 2, D, 0.003), m, sx * (W / 2 - tt / 2), 0, D / 2);
    mk(g, B(W - tt * 2, H - tt * 2, 0.006, 0.001), m, 0, 0, 0.003);
    y = -H / 2 + tt;
  } else {
    const bm = paint('#1b1b1b', 0.45, 0.5);
    mk(g, B(W, 0.028, D + 0.02, 0.005), m, 0, -0.014, (D + 0.02) / 2);
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.32;
      mk(g, B(0.025, 0.16, 0.005, 0.001), bm, x, -0.11, 0.0025);
      mk(g, B(0.025, 0.005, D - 0.02, 0.001), bm, x, -0.0305, (D - 0.02) / 2);
      rod(g, V3(x, -0.17, 0.005), V3(x, -0.033, D - 0.06), 0.004, bm);
    }
  }
  if (s.items !== false) {
    const bag = new Bag();
    if (style === 'box') {
      fillShelf(bag, R, -W / 2 + 0.02, 0.05, y, D - 0.01, 0.22, D - 0.03, BOOK_COLORS, 1);
      decoVase(g, W / 2 - 0.12, y, D / 2, R, 0.55);
    } else {
      fillShelf(bag, R, -W / 2 + 0.05, -W / 2 + 0.25, y, D - 0.01, 0.28, D - 0.03, BOOK_COLORS, 1);
      decoPlant(g, 0.02, y, D / 2, 0.7);
      decoVase(g, W / 2 - 0.12, y, D / 2, R, 0.55);
    }
    bag.mesh(g, bookMat());
  }
  return g;
}

// =====================================================================
// ドア・窓
// =====================================================================
function door(s) {
  const g = new THREE.Group();
  const style = s.style || 'flat';
  const col = s.color || (style === 'barn' ? '#7a5a3e' : '#f4f2ee');
  const dm = MATS[col] ? baseMat(col) : paint(col, 0.45);
  const hm = matOf(s.handle, style === 'barn' ? 'black' : 'chrome');
  const OW = 0.86, OH = 2.05, jt = 0.03, cw = 0.07; // 開口・枠の厚み・額縁の幅
  const frameM = MATS[col] && isWoodKey(col) ? dm : paint(s.frameColor || (MATS[col] ? '#f2f0ec' : col), 0.45);
  // 額縁（部屋側の壁に付く）
  mk(g, B(cw, OH + cw, 0.018, 0.004), frameM, -OW / 2 - cw / 2, (OH + cw) / 2, 0.009);
  mk(g, B(cw, OH + cw, 0.018, 0.004), frameM, OW / 2 + cw / 2, (OH + cw) / 2, 0.009);
  mk(g, B(OW + cw * 2 + 0.01, cw, 0.02, 0.004), frameM, 0, OH + cw / 2, 0.01);
  // 枠（開口の内側）
  const jd = 0.14;
  mk(g, B(jt, OH, jd, 0.002), frameM, -OW / 2 + jt / 2, OH / 2, -jd / 2 + 0.005);
  mk(g, B(jt, OH, jd, 0.002), frameM, OW / 2 - jt / 2, OH / 2, -jd / 2 + 0.005);
  mk(g, B(OW, jt, jd, 0.002), frameM, 0, OH - jt / 2, -jd / 2 + 0.005);
  const LW = OW - jt * 2 - 0.006, LH = OH - jt - 0.012, LT = 0.04;
  const lz = -0.03; // 扉の中心
  const leaf = new THREE.Group();
  leaf.position.set(0, 0.008 + LH / 2, lz);
  g.add(leaf);
  const zf = LT / 2; // 扉の表
  // 框（かまち）と鏡板：厚い枠＋へこんだ板
  const stileRail = (rails, opts = {}) => {
    const sw = opts.sw || 0.11, core = LT - 0.014;
    mk(leaf, B(LW, LH, core, 0.002), dm, 0, 0, 0);
    for (const sx of [-1, 1]) mk(leaf, B(sw, LH, LT, 0.004), dm, sx * (LW / 2 - sw / 2), 0, 0);
    for (const [y, h] of rails) mk(leaf, B(LW - sw * 2, h, LT, 0.003), dm, 0, y, 0);
    if (opts.mid) mk(leaf, B(opts.mid, LH, LT, 0.003), dm, 0, 0, 0);
  };
  const raisedPanel = (x, y, w, h) => {
    // 少し盛り上がった鏡板（面取り）
    for (const sz of [1, -1]) mk(leaf, B(w - 0.04, h - 0.04, 0.008, 0.006), dm, x, y, sz * (LT - 0.014) / 2);
  };
  switch (style) {
    case 'flat': mk(leaf, B(LW, LH, LT, 0.004), dm); break;
    case 'panel2': {
      const rails = [[LH / 2 - 0.06, 0.12], [-LH / 2 + 0.1, 0.2], [-0.15, 0.14]];
      stileRail(rails);
      raisedPanel(0, (LH / 2 - 0.12 + -0.08) / 2, LW - 0.22, LH / 2 - 0.12 + 0.08);
      raisedPanel(0, (-0.22 + -LH / 2 + 0.2) / 2, LW - 0.22, -0.22 + LH / 2 - 0.2);
      break;
    }
    case 'panel4': {
      stileRail([[LH / 2 - 0.06, 0.12], [-LH / 2 + 0.1, 0.2], [0.05, 0.14]], { mid: 0.09 });
      const pw = (LW - 0.22 - 0.09) / 2;
      for (const sx of [-1, 1]) {
        const x = sx * (0.045 + pw / 2);
        raisedPanel(x, (LH / 2 - 0.12 + 0.12) / 2, pw, LH / 2 - 0.12 - 0.12);
        raisedPanel(x, (-0.02 + -LH / 2 + 0.2) / 2, pw, -0.02 + LH / 2 - 0.2);
      }
      break;
    }
    case 'shaker': {
      const r = [[LH / 2 - 0.06, 0.12], [-LH / 2 + 0.1, 0.2], [0.28, 0.1], [-0.3, 0.1]];
      stileRail(r);
      break;
    }
    case 'glass': {
      stileRail([[LH / 2 - 0.06, 0.12], [-LH / 2 + 0.12, 0.24], [-0.38, 0.12]]);
      // くもりガラス
      const gl = cm('doorglass', () => new THREE.MeshPhysicalMaterial({ color: '#e9f0ee', roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.08 }));
      const gy0 = -0.32, gy1 = LH / 2 - 0.12;
      mk(leaf, new THREE.PlaneGeometry(LW - 0.22, gy1 - gy0), gl, 0, (gy0 + gy1) / 2, 0).castShadow = false;
      // 中の格子
      for (let i = 1; i < 4; i++) mk(leaf, B(LW - 0.22, 0.025, 0.025, 0.003), dm, 0, gy0 + (gy1 - gy0) * i / 4, 0);
      mk(leaf, B(0.025, gy1 - gy0, 0.025, 0.003), dm, 0, (gy0 + gy1) / 2, 0);
      raisedPanel(0, (-0.44 + -LH / 2 + 0.24) / 2, LW - 0.22, -0.44 + LH / 2 - 0.24);
      break;
    }
    case 'louver': {
      stileRail([[LH / 2 - 0.06, 0.12], [-LH / 2 + 0.1, 0.2], [0, 0.12]]);
      const bag = new Bag();
      for (const [y0, y1] of [[0.07, LH / 2 - 0.12], [-LH / 2 + 0.2, -0.07]]) {
        const n = Math.floor((y1 - y0) / 0.04);
        for (let i = 0; i < n; i++) bag.add(new THREE.BoxGeometry(LW - 0.22, 0.045, 0.008), 0, y0 + 0.02 + i * (y1 - y0 - 0.02) / n, 0, -0.75);
      }
      mk(leaf, B(LW - 0.22, LH - 0.2, 0.004, 0), paint('#2b2b2b', 0.9), 0, 0, -0.01);
      bag.mesh(leaf, dm);
      break;
    }
    case 'barn': {
      // 引き戸：壁の前に吊る板の扉
      leaf.position.z = 0.05;
      const BW = OW + 0.12, BH = OH + 0.06;
      leaf.position.y = BH / 2 + 0.005;
      const wood = MATS[col] ? dm : cm('barn' + col, () => std({ color: col, map: woodTex('oak'), roughness: 0.75 }));
      const n = 6, pw = BW / n;
      for (let i = 0; i < n; i++) mk(leaf, B(pw - 0.004, BH, 0.03, 0.004), wood, -BW / 2 + pw * (i + 0.5), 0, 0);
      for (const y of [BH / 2 - 0.1, -BH / 2 + 0.1]) mk(leaf, B(BW, 0.12, 0.025, 0.005), wood, 0, y, 0.026);
      const diag = Math.hypot(BW - 0.1, BH - 0.32), ang = Math.atan2(BW - 0.1, BH - 0.32);
      mk(leaf, B(0.12, diag, 0.024, 0.005), wood, 0, 0, 0.025, 0, 0, ang);
      // レールと戸車
      const rail = paint('#1b1b1b', 0.4, 0.6);
      mk(g, B(OW * 2 + 0.3, 0.035, 0.012, 0.004), rail, OW / 2, OH + 0.14, 0.03);
      for (const sx of [-1, 1]) {
        mk(g, C(0.045, 0.045, 0.018, 24), rail, sx * BW * 0.32, OH + 0.14, 0.05, PI / 2);
        mk(g, B(0.03, 0.18, 0.006, 0.002), rail, sx * BW * 0.32, OH + 0.08, 0.068);
      }
      mk(leaf, B(0.025, 0.3, 0.025, 0.006), hm, BW / 2 - 0.12, 0, 0.06);
      mk(leaf, B(0.025, 0.02, 0.04, 0.003), hm, BW / 2 - 0.12, 0.14, 0.042);
      mk(leaf, B(0.025, 0.02, 0.04, 0.003), hm, BW / 2 - 0.12, -0.14, 0.042);
      g.traverse(o => { if (o.isMesh) o.userData.door = true; });
      return g;
    }
  }
  // 取っ手（両側）とちょうつがい
  const hx = LW / 2 - 0.07, hy = 1.0 - (0.008 + LH / 2);
  for (const sz of [1, -1]) {
    mk(leaf, C(0.028, 0.028, 0.01, 24), hm, hx, hy, sz * (zf + 0.005), PI / 2);
    mk(leaf, C(0.009, 0.009, 0.05, 12), hm, hx, hy, sz * (zf + 0.03), PI / 2);
    mk(leaf, B(0.13, 0.018, 0.016, 0.007), hm, hx - 0.055, hy, sz * (zf + 0.053));
    mk(leaf, B(0.012, 0.05, 0.004, 0.002), hm, hx, hy - 0.08, sz * (zf + 0.002));
  }
  for (const y of [LH / 2 - 0.2, 0, -LH / 2 + 0.2]) mk(leaf, C(0.007, 0.007, 0.1, 10), hm, -LW / 2 - 0.002, y, zf - 0.004);
  g.traverse(o => { if (o.isMesh) o.userData.door = true; });
  return g;
}

function windowFrame(s) {
  const g = new THREE.Group();
  const style = s.style || 'grid4';
  const fv = s.frame || (style === 'slim' ? 'black' : 'white');
  const fm = MATS[fv] ? baseMat(fv) : paint(fv, 0.45);
  const W = 2.2, H = 1.75;
  const slim = style === 'slim';
  const ft = slim ? 0.035 : 0.06;     // 外枠の太さ
  const mt = slim ? 0.018 : 0.035;    // 桟の太さ
  const fd = 0.1, gz = -0.04;         // 枠の奥行・ガラスの位置
  // 外枠（開口の内側にはまる）
  mk(g, B(W, ft, fd, 0.004), fm, 0, H / 2 - ft / 2, -fd / 2 + 0.005);
  mk(g, B(W, ft, fd, 0.004), fm, 0, -H / 2 + ft / 2, -fd / 2 + 0.005);
  mk(g, B(ft, H - ft * 2, fd, 0.004), fm, -W / 2 + ft / 2, 0, -fd / 2 + 0.005);
  mk(g, B(ft, H - ft * 2, fd, 0.004), fm, W / 2 - ft / 2, 0, -fd / 2 + 0.005);
  // 額縁（部屋側の壁の面、上と左右）
  const trim = MATS[fv] && !['black', 'gunmetal'].includes(fv) ? fm : paint(MATS[fv] ? '#f2f0ec' : fv, 0.45);
  const tw = 0.07;
  mk(g, B(W + tw * 2, tw, 0.018, 0.004), trim, 0, H / 2 + tw / 2, 0.009);
  mk(g, B(tw, H, 0.018, 0.004), trim, -W / 2 - tw / 2, 0, 0.009);
  mk(g, B(tw, H, 0.018, 0.004), trim, W / 2 + tw / 2, 0, 0.009);
  // 窓台（部屋側に出っぱる）と下の飾り板
  mk(g, B(W + 0.2, 0.03, 0.2, 0.006), trim, 0, -H / 2 - 0.015 + 0.0, 0.02);
  mk(g, B(W + tw, 0.06, 0.016, 0.004), trim, 0, -H / 2 - 0.06, 0.008);
  // ガラス
  const glass = cm('winglass', () => new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  const gm = mk(g, new THREE.PlaneGeometry(W - ft * 2, H - ft * 2), glass, 0, 0, gz);
  gm.castShadow = false; gm.renderOrder = 1;
  const iw = W - ft * 2, ih = H - ft * 2;
  const bars = new Bag();
  const vbar = (x, y0 = -ih / 2, y1 = ih / 2, t = mt) => bars.add(B(t, y1 - y0, slim ? 0.03 : 0.05, 0.003), x, (y0 + y1) / 2, gz);
  const hbar = (y, x0 = -iw / 2, x1 = iw / 2, t = mt) => bars.add(B(x1 - x0, t, slim ? 0.03 : 0.05, 0.003), (x0 + x1) / 2, y, gz);
  // サッシ（左右2枚）の縦の太い桟
  const sash = () => { vbar(0, -ih / 2, ih / 2, slim ? mt : 0.07); };
  switch (style) {
    case 'grid4': sash(); hbar(0.05); break;
    case 'grid6': vbar(-iw / 6); vbar(iw / 6); hbar(0.05); break;
    case 'single': break;
    case 'transom': {
      const ty = ih / 2 - 0.42;
      hbar(ty, -iw / 2, iw / 2, 0.06);
      vbar(-iw / 6, ty, ih / 2); vbar(iw / 6, ty, ih / 2);
      sash();
      bars.list.pop();
      vbar(0, -ih / 2, ty, 0.07);
      break;
    }
    case 'cross': vbar(0, -ih / 2, ih / 2, 0.06); hbar(ih / 2 - 0.55, -iw / 2, iw / 2, 0.05); break;
    case 'slim': {
      for (let i = 1; i < 4; i++) vbar(-iw / 2 + iw * i / 4);
      for (let j = 1; j < 3; j++) hbar(-ih / 2 + ih * j / 3);
      break;
    }
    case 'arched': {
      sash();
      const ry = ih / 2 - iw / 2; // 半円の中心（上が切れるので、低い楕円にする）
      const ah = 0.55, cy = ih / 2 - ah; // アーチの下端
      hbar(cy, -iw / 2, iw / 2, 0.04);
      // 半円形の飾り（楕円のアーチ）
      const pts = [];
      for (let i = 0; i <= 32; i++) { const a = PI * i / 32; pts.push(V3(Math.cos(a) * (iw / 2 - 0.02), cy + Math.sin(a) * (ah - 0.03), gz)); }
      tube(g, pts, 0.016, fm, 64, 8);
      for (let k = 1; k < 6; k++) {
        const a = PI * k / 6;
        bars.addRod(V3(0, cy, gz), V3(Math.cos(a) * (iw / 2 - 0.03), cy + Math.sin(a) * (ah - 0.04), gz), 0.01, 6);
      }
      // アーチの外側の角を埋める板
      const corner = new THREE.Shape();
      const hw = iw / 2;
      corner.moveTo(-hw, cy); corner.lineTo(-hw, ih / 2); corner.lineTo(hw, ih / 2); corner.lineTo(hw, cy);
      const hole = new THREE.Path();
      hole.moveTo(hw - 0.005, cy);
      for (let i = 0; i <= 32; i++) { const a = PI * i / 32; hole.lineTo(Math.cos(a) * (hw - 0.005), cy + Math.sin(a) * (ah - 0.015)); }
      corner.holes.push(hole);
      const cgeo = new THREE.ExtrudeGeometry(corner, { depth: 0.02, bevelEnabled: false });
      mk(g, cgeo, fm, 0, 0, gz - 0.01);
      void ry;
      break;
    }
  }
  bars.mesh(g, fm);
  return g;
}

// =====================================================================
// 趣味の物
// =====================================================================
const lacquer = (c, rough = 0.25) => cm('lq' + c + rough, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.12 }));
const CHROME = () => baseMat('chrome');
const BLACKP = () => paint('#141414', 0.45);

function guitarBody(style) {
  const sh = new THREE.Shape();
  if (style === 'electric' || style === 'bass') {
    // ストラト形（右の角が長い）
    const k = style === 'bass' ? 1.08 : 1;
    const P = (x, y) => [x * k, y * k];
    sh.moveTo(...P(0, -0.235));
    sh.bezierCurveTo(...P(0.19, -0.235), ...P(0.225, -0.07), ...P(0.145, -0.005));
    sh.bezierCurveTo(...P(0.115, 0.03), ...P(0.165, 0.13), ...P(0.15, 0.195));
    sh.bezierCurveTo(...P(0.135, 0.235), ...P(0.085, 0.21), ...P(0.05, 0.125));
    sh.lineTo(...P(-0.05, 0.125));
    sh.bezierCurveTo(...P(-0.07, 0.165), ...P(-0.12, 0.185), ...P(-0.14, 0.145));
    sh.bezierCurveTo(...P(-0.16, 0.1), ...P(-0.115, 0.03), ...P(-0.145, -0.005));
    sh.bezierCurveTo(...P(-0.225, -0.07), ...P(-0.19, -0.235), ...P(0, -0.235));
  } else {
    // アコースティックの胴（下が大きく、くびれはゆるやか）
    const k = style === 'classic' ? 0.93 : 1;
    const lb = 0.2 * k, ub = 0.15 * k, wa = 0.135 * k, L = 0.26 * k, U = 0.24 * k;
    sh.moveTo(0, -L);
    sh.bezierCurveTo(lb * 1.36, -L, wa * 1.02, -0.1 * k, wa, 0.0);
    sh.bezierCurveTo(wa, 0.07 * k, ub * 1.36, U, 0, U);
    sh.bezierCurveTo(-ub * 1.36, U, -wa, 0.07 * k, -wa, 0.0);
    sh.bezierCurveTo(-wa * 1.02, -0.1 * k, -lb * 1.36, -L, 0, -L);
  }
  return sh;
}
function guitar(s) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  const style = ['acoustic', 'electric', 'bass', 'classic'].includes(s.style) ? s.style : 'acoustic';
  const acoustic = style === 'acoustic' || style === 'classic';
  const depth = acoustic ? 0.1 : 0.045;
  const bodyCol = s.color || { acoustic: '#d9a35c', classic: '#e3be86', electric: '#a3161a', bass: '#1a1a1a' }[style];
  const sideCol = acoustic ? (style === 'classic' ? '#5a2f17' : '#7a3f1d') : bodyCol;
  const geo = cg('gbody' + style, () => {
    const e = new THREE.ExtrudeGeometry(guitarBody(style), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 28 });
    e.translate(0, 0, -depth / 2);
    return e;
  });
  const top = lacquer(bodyCol), side = lacquer(sideCol);
  mk(g, geo, [top, side]);
  const front = depth / 2 + 0.008;
  const neckCol = acoustic ? '#5a3a22' : '#c8955a';
  const neckM = lacquer(neckCol, 0.35);
  const fbM = paint(style === 'electric' ? '#5a3a22' : '#1f150f', 0.6);
  const bodyTop = style === 'electric' ? 0.12 : style === 'bass' ? 0.13 : 0.22;
  const neckLen = style === 'bass' ? 0.78 : style === 'classic' ? 0.46 : 0.5;
  const nw0 = style === 'classic' ? 0.052 : style === 'bass' ? 0.045 : 0.044, nw1 = nw0 + 0.012;
  // ネック（根元が太い）
  const ny0 = bodyTop - 0.06, ny1 = bodyTop + neckLen;
  const neckG = new THREE.CylinderGeometry(nw0 / 2, nw1 / 2, ny1 - ny0, 4, 1);
  neckG.rotateY(PI / 4); neckG.scale(1.41, 1, 0.5);
  mk(g, neckG, neckM, 0, (ny0 + ny1) / 2, front - 0.016);
  const fb = new THREE.CylinderGeometry(nw0 / 2, nw1 / 2, ny1 - bodyTop + (acoustic ? 0.02 : 0.06), 4, 1);
  fb.rotateY(PI / 4); fb.scale(1.41, 1, 0.08);
  const fbLen = ny1 - bodyTop + (acoustic ? 0.02 : 0.06);
  mk(g, fb, fbM, 0, ny1 - fbLen / 2, front - 0.004);
  // フレット
  const bag = new Bag();
  for (let i = 1; i < 20; i++) {
    const y = ny1 - (ny1 - bodyTop + 0.3) * (1 - Math.pow(2, -i / 12)) * 1.0;
    if (y < ny1 - fbLen + 0.01) break;
    const w = lerp(nw0, nw1, (ny1 - y) / (ny1 - ny0));
    bag.add(new THREE.BoxGeometry(w, 0.002, 0.004), 0, y, front - 0.001);
  }
  bag.mesh(g, paint('#d0d0d0', 0.3, 1));
  // ヘッド
  const headM = acoustic ? lacquer(style === 'classic' ? '#3a2416' : '#1d140e', 0.3) : style === 'electric' ? neckM : lacquer(bodyCol);
  const hw = style === 'bass' ? 0.07 : style === 'electric' ? 0.06 : 0.08, hh = style === 'bass' ? 0.2 : 0.18;
  const head = new THREE.Group(); g.add(head);
  head.position.set(style === 'electric' ? 0.012 : 0, ny1, front - 0.018);
  head.rotation.x = acoustic ? -0.22 : -0.05;
  mk(head, B(hw, hh, 0.018, 0.008), headM, 0, hh / 2, 0);
  const nStr = style === 'bass' ? 4 : 6;
  for (let i = 0; i < nStr; i++) {
    let x, y;
    if (acoustic) { x = (i < 3 ? -1 : 1) * (hw / 2 + 0.012); y = 0.04 + (i % 3) * 0.045; }
    else { x = hw / 2 + 0.01; y = 0.03 + i * (hh - 0.05) / nStr; }
    if (style === 'classic') { mk(head, C(0.004, 0.004, hw + 0.03, 8), CHROME(), 0, y, -0.002, 0, 0, PI / 2); mk(head, B(0.012, 0.02, 0.01, 0.003), paint('#efe6d2', 0.4), Math.sign(x) * (hw / 2 + 0.02), y, 0); continue; }
    const tm = CHROME();
    mk(head, C(0.006, 0.006, 0.02, 10), tm, Math.sign(x) * hw / 2 + Math.sign(x) * 0.008, y, -0.004, 0, 0, PI / 2);
    mk(head, B(0.012, style === 'bass' ? 0.03 : 0.02, 0.006, 0.003), tm, x + Math.sign(x) * 0.008, y, -0.004);
  }
  // 本体の飾り
  if (acoustic) {
    mk(g, new THREE.CircleGeometry(0.044, 32), paint('#0d0805', 0.9), 0, 0.07, front + 0.0005);
    mk(g, new THREE.RingGeometry(0.048, 0.06, 40), paint(style === 'classic' ? '#3b6b4a' : '#2a1a10', 0.5), 0, 0.07, front + 0.0006);
    if (style === 'acoustic') {
      const pg = new THREE.Shape(); pg.moveTo(0.05, 0.02); pg.quadraticCurveTo(0.11, 0.0, 0.1, -0.08); pg.quadraticCurveTo(0.06, -0.06, 0.045, 0.0);
      mk(g, new THREE.ShapeGeometry(pg, 10), lacquer('#2a140a', 0.3), 0, 0, front + 0.0007);
    }
    mk(g, B(0.13, 0.022, 0.01, 0.004), paint('#1b120c', 0.5), 0, -0.16, front + 0.005);
    mk(g, B(0.075, 0.003, 0.004, 0.001), paint('#efe6d2', 0.4), 0, -0.155, front + 0.011);
  } else {
    // ピックガード・ピックアップ・つまみ
    const pg = new THREE.Shape();
    pg.moveTo(-0.045, 0.12); pg.bezierCurveTo(-0.1, 0.06, -0.085, -0.1, 0.0, -0.11); pg.bezierCurveTo(0.1, -0.12, 0.115, -0.04, 0.085, 0.0); pg.lineTo(0.045, 0.12);
    mk(g, new THREE.ShapeGeometry(pg, 12), paint(style === 'bass' ? '#eeeae0' : '#f4f1ea', 0.35), 0, 0, front + 0.0006);
    const pk = style === 'bass' ? [[0, -0.02]] : [[0, 0.07], [0, 0.0], [0, -0.07]];
    for (const [x, y] of pk) mk(g, B(style === 'bass' ? 0.08 : 0.07, 0.018, 0.008, 0.005), paint('#f2efe6', 0.4), x, y, front + 0.004);
    for (let i = 0; i < 3; i++) mk(g, C(0.009, 0.01, 0.014, 14), paint('#ece8de', 0.4), 0.08 + i * 0.015, -0.1 - i * 0.03, front + 0.007, PI / 2);
    mk(g, B(0.08, 0.04, 0.008, 0.003), CHROME(), 0, -0.15, front + 0.004);
  }
  // 弦
  const sb = new Bag();
  const strTop = ny1 + 0.005, strBot = acoustic ? -0.16 : -0.15;
  for (let i = 0; i < nStr; i++) {
    const x0 = (i - (nStr - 1) / 2) * (nw0 - 0.012) / (nStr - 1), x1 = (i - (nStr - 1) / 2) * 0.01;
    sb.addRod(V3(x1, strBot, front + 0.009), V3(x0, strTop, front + 0.006), style === 'bass' ? 0.0011 : 0.0006, 3);
  }
  sb.mesh(g, paint('#dcdcdc', 0.25, 1));
  // スタンド
  const standM = paint('#1a1a1a', 0.4, 0.6);
  const yb = -0.25 - 0.08;
  g.position.y = -yb;
  const legTop = V3(0, 0.62, -0.13);
  rod(outer, V3(0, 0.0, -0.33), legTop, 0.008, standM);
  rod(outer, V3(-0.16, 0, 0.1), V3(0, 0.12, -0.04), 0.008, standM);
  rod(outer, V3(0.16, 0, 0.1), V3(0, 0.12, -0.04), 0.008, standM);
  rod(outer, V3(0, 0.12, -0.04), legTop, 0.009, standM);
  mk(outer, T(0.12, 0.009, 6, 24, PI), standM, 0, 0.1, 0.02, PI / 2, 0, PI);
  for (const sx of [-1, 1]) mk(outer, C(0.012, 0.012, 0.04, 8), paint('#2a2a2a', 0.9), sx * 0.12, 0.1, 0.03, PI / 2);
  const neckRest = mk(outer, T(0.035, 0.006, 6, 16, PI), standM, 0, legTop.y - 0.02, legTop.z + 0.02, PI / 2, 0, PI);
  void neckRest;
  // 少し後ろにもたれる
  g.rotation.x = -0.15;
  g.position.z = 0.02;
  outer.add(g);
  return outer;
}

function keyboard(s) {
  const g = new THREE.Group();
  const piano = s.style === 'piano';
  const bodyM = s.mat ? matOf(s.mat) : lacquer(s.color || (piano ? '#1c1916' : '#1d1d1f'), 0.4);
  const whites = piano ? 52 : 36;
  const kw = 0.0235, KW = whites * kw;
  const bw = KW + 0.1, bd = piano ? 0.36 : 0.3, kh = piano ? 0.76 : 0.8;
  const deckY = kh;
  const bag = new Bag(), black = new Bag();
  const notes = piano ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const kz = bd / 2 - 0.075;
  for (let i = 0; i < whites; i++) {
    const x = -KW / 2 + kw * (i + 0.5);
    bag.add(new THREE.BoxGeometry(kw - 0.0012, 0.02, 0.145), x, deckY + 0.01, kz);
    const n = notes[i % 7];
    if (i < whites - 1 && ['C', 'D', 'F', 'G', 'A'].includes(n)) black.add(new THREE.BoxGeometry(0.012, 0.014, 0.09), x + kw / 2, deckY + 0.025, kz - 0.027);
  }
  if (piano) {
    // 木の箱型（家庭用の電子ピアノ）
    mk(g, B(bw, 0.12, bd, 0.008), bodyM, 0, deckY - 0.05, 0);
    mk(g, B(bw, 0.1, bd - 0.16, 0.008), bodyM, 0, deckY + 0.05, -0.08);
    mk(g, B(bw - 0.06, 0.035, 0.03, 0.004), bodyM, 0, deckY + 0.04, kz - 0.09 + 0.01);
    for (const sx of [-1, 1]) mk(g, B(0.04, deckY + 0.11, bd, 0.006), bodyM, sx * (bw / 2 - 0.02), (deckY + 0.11) / 2, 0);
    mk(g, B(bw - 0.08, 0.5, 0.015, 0.004), bodyM, 0, 0.35, -bd / 2 + 0.03);
    mk(g, B(0.9, 0.24, 0.015, 0.004), bodyM, 0, deckY + 0.22, -0.1, -0.2);
    for (let i = -1; i <= 1; i++) mk(g, B(0.03, 0.012, 0.08, 0.004), baseMat('brass'), i * 0.06, 0.05, 0.02);
    mk(g, B(0.3, 0.03, 0.12, 0.004), bodyM, 0, 0.035, 0.0);
  } else {
    // X スタンドの上のキーボード
    mk(g, B(bw, 0.09, bd, 0.012), bodyM, 0, deckY - 0.025, 0);
    mk(g, B(bw - 0.02, 0.01, 0.07, 0.003), paint('#0d0d0d', 0.6), 0, deckY + 0.022, -bd / 2 + 0.06);
    for (let i = 0; i < 4; i++) mk(g, C(0.009, 0.009, 0.012, 12), paint('#d0d0d0', 0.3, 1), -bw / 2 + 0.1 + i * 0.04, deckY + 0.025, -bd / 2 + 0.06);
    mk(g, B(0.16, 0.01, 0.05, 0.003), glow('#9fd3ff', 0.6), 0.1, deckY + 0.027, -bd / 2 + 0.06);
    const sm = paint('#1a1a1a', 0.45, 0.6);
    for (const sx of [-1, 1]) {
      const x = sx * 0.3;
      rod(g, V3(x, 0, 0.25), V3(x, deckY - 0.08, -0.12), 0.014, sm);
      rod(g, V3(x, 0, -0.25), V3(x, deckY - 0.08, 0.12), 0.014, sm);
      mk(g, B(0.035, 0.03, 0.4, 0.008), sm, x, deckY - 0.08, 0);
      for (const sz of [-1, 1]) mk(g, C(0.016, 0.016, 0.03, 10), paint('#111', 0.9), x, 0.015, sz * 0.25, PI / 2);
    }
    mk(g, C(0.016, 0.016, 0.6, 12), sm, 0, deckY * 0.48, 0, 0, 0, PI / 2);
  }
  bag.mesh(g, paint('#f7f5ef', 0.35));
  black.mesh(g, paint('#0f0f0f', 0.3));
  return g;
}

function woofer(g, r, x, y, z) {
  const cone = LA(smooth([[0.001, -0.02 * r / 0.08], [r * 0.25, -0.022 * r / 0.08], [r * 0.85, -0.004], [r, 0]], 10), 28);
  mk(g, cone, paint('#1a1a1a', 0.8), x, y, z, PI / 2);
  mk(g, T(r * 0.93, r * 0.07, 6, 32), paint('#111', 0.95), x, y, z + 0.001);
  mk(g, S(r * 0.25, 16, 8, ), paint('#222', 0.5), x, y, z - r * 0.1).scale.z = 0.4;
  mk(g, T(r + 0.006, 0.006, 6, 32), paint('#333', 0.4, 0.6), x, y, z);
}
function speaker(s) {
  const g = new THREE.Group();
  const style = s.style || 'tower';
  const m = matOf(s.mat, 'walnut');
  const baf = paint(s.color || '#151515', 0.6);
  if (style === 'smart') {
    const fab = upholMat('fabric', s.color || '#9a9894');
    mk(g, LA(smooth([[0.001, 0], [0.06, 0], [0.068, 0.02], [0.07, 0.17], [0.065, 0.19], [0.001, 0.19]], 18), 36), fab, 0, 0, 0);
    mk(g, T(0.045, 0.004, 6, 32), glow('#7ad0ff', 1.5), 0, 0.19, 0, PI / 2);
    return g;
  }
  let W, H, D, y0 = 0;
  if (style === 'bookshelf') {
    W = 0.18; H = 0.3; D = 0.24; y0 = 0.62;
    const sm = paint('#1a1a1a', 0.45, 0.5);
    mk(g, B(0.25, 0.02, 0.28, 0.004), sm, 0, 0.01, 0);
    mk(g, B(0.06, 0.58, 0.06, 0.006), sm, 0, 0.31, 0);
    mk(g, B(0.2, 0.012, 0.22, 0.003), sm, 0, 0.606, 0);
  } else if (style === 'studio') {
    W = 0.2; H = 0.32; D = 0.26; y0 = 0;
  } else {
    W = 0.22; H = 1.0; D = 0.3; y0 = 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.01, 0.002, 0.03, 8), CHROME(), sx * (W / 2 - 0.03), 0.015, sz * (D / 2 - 0.03));
  }
  const body = style === 'studio' ? paint('#1b1b1b', 0.6) : m;
  mk(g, B(W, H, D, 0.012), body, 0, y0 + H / 2, 0);
  mk(g, B(W - 0.006, H - 0.006, 0.01, 0.005), baf, 0, y0 + H / 2, D / 2 - 0.003);
  const fz = D / 2 + 0.003;
  if (style === 'tower') {
    woofer(g, 0.075, 0, y0 + 0.25, fz); woofer(g, 0.075, 0, y0 + 0.47, fz);
    woofer(g, 0.05, 0, y0 + 0.66, fz);
    mk(g, S(0.018, 16, 8), paint('#c9c9c9', 0.3, 1), 0, y0 + 0.83, fz).scale.z = 0.5;
    mk(g, C(0.03, 0.03, 0.01, 24), paint('#111', 0.5), 0, y0 + 0.83, fz - 0.002, PI / 2);
  } else if (style === 'studio') {
    woofer(g, 0.07, 0, y0 + 0.1, fz);
    mk(g, B(0.15, 0.06, 0.01, 0.01), paint('#111', 0.4), 0, y0 + 0.24, fz);
    mk(g, S(0.016, 16, 8), paint('#d8d8d8', 0.3, 1), 0, y0 + 0.24, fz + 0.004).scale.z = 0.5;
    mk(g, T(0.072, 0.004, 6, 32), paint(s.accent || '#f2c500', 0.5), 0, y0 + 0.1, fz + 0.002);
    mk(g, S(0.004, 8, 6), glow('#7cf', 2), 0.07, y0 + 0.02, fz);
  } else {
    woofer(g, 0.06, 0, y0 + 0.1, fz);
    mk(g, S(0.015, 16, 8), paint('#c9c9c9', 0.3, 1), 0, y0 + 0.22, fz).scale.z = 0.5;
  }
  return g;
}

function turntable(s) {
  const g = new THREE.Group();
  const m = matOf(s.mat, 'walnut');
  let y = 0;
  if (s.stand !== false) {
    // レコード棚つきの台
    const W = 0.8, H = 0.55, D = 0.42;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) taperLeg(g, sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0, 0.16, m, 0.018, 0.01);
    mk(g, B(W, 0.025, D, 0.004), m, 0, H - 0.0125, 0);
    mk(g, B(W, 0.025, D, 0.004), m, 0, 0.16, 0);
    for (const sx of [-1, 0, 1]) mk(g, B(0.02, H - 0.17, D, 0.003), m, sx * (W / 2 - 0.01), 0.16 + (H - 0.17) / 2, 0);
    mk(g, B(W, H - 0.15, 0.008, 0.002), m, 0, 0.16 + (H - 0.15) / 2, -D / 2 + 0.004);
    const bag = new Bag();
    const R = rng(77);
    const cols = ['#c23b22', '#1f3a5f', '#e8d8b0', '#2b2b2b', '#6d8f6a', '#e0a030', '#7b4b8a', '#f2efe6'];
    for (let i = 0; i < 26; i++) {
      const x = -W / 2 + 0.03 + i * 0.0135;
      if (x > -0.03) break;
      bookGeo(bag, 0.006, 0.31, 0.31, x, 0.172 + 0.155, 0, cols[Math.floor(R() * cols.length)], 0, (i > 22 ? -0.1 : 0));
    }
    for (let i = 0; i < 20; i++) {
      const x = 0.03 + i * 0.0135;
      bookGeo(bag, 0.006, 0.31, 0.31, x, 0.172 + 0.155, 0, cols[Math.floor(R() * cols.length)]);
    }
    bag.mesh(g, cm('sleeves', () => std({ vertexColors: true, roughness: 0.55 })));
    y = H;
  }
  // プレーヤー本体
  const pm = s.color ? lacquer(s.color, 0.35) : m;
  mk(g, B(0.45, 0.07, 0.35, 0.01), pm, 0, y + 0.035 + 0.012, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.022, 0.025, 0.012, 16), paint('#1a1a1a', 0.5), sx * 0.19, y + 0.006, sz * 0.14);
  const top = y + 0.082;
  mk(g, C(0.15, 0.15, 0.014, 48), paint('#bcbcbc', 0.25, 1), -0.05, top + 0.007, 0.0);
  mk(g, C(0.148, 0.148, 0.003, 48), paint('#0c0c0c', 0.25), -0.05, top + 0.0155, 0.0);
  const label = mk(g, C(0.044, 0.044, 0.0012, 32), paint(s.label || '#d9502d', 0.5), -0.05, top + 0.0175, 0.0);
  void label;
  mk(g, C(0.003, 0.003, 0.012, 8), CHROME(), -0.05, top + 0.02, 0.0);
  // アーム
  const am = CHROME();
  mk(g, C(0.022, 0.025, 0.025, 20), paint('#1a1a1a', 0.4), 0.16, top + 0.012, -0.1);
  tube(g, [[0.16, top + 0.035, -0.1], [0.14, top + 0.035, 0.0], [0.09, top + 0.03, 0.08], [0.06, top + 0.026, 0.1]], 0.0035, am, 20, 6);
  mk(g, B(0.016, 0.006, 0.03, 0.002), paint('#111', 0.4), 0.055, top + 0.024, 0.105, 0, 0.5);
  mk(g, C(0.012, 0.012, 0.03, 16), am, 0.162, top + 0.035, -0.135, PI / 2);
  for (let i = 0; i < 2; i++) mk(g, C(0.01, 0.01, 0.01, 12), am, 0.17 - i * 0.04, top + 0.003, 0.15);
  return g;
}

function drum(s) {
  const g = new THREE.Group();
  const shellM = cm('drumshell' + (s.color || ''), () => new THREE.MeshPhysicalMaterial({ color: s.color || '#7a1f1f', roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const head = paint('#efece4', 0.6);
  const ch = CHROME();
  const cym = cm('cymbal', () => std({ color: '#c9a24c', metalness: 1, roughness: 0.32, side: THREE.DoubleSide }));
  const st = paint('#9a9a9a', 0.3, 1);
  // 胴（円柱）+ 打面 + フープ
  const shell = (r, h, x, y, z, rx = 0, ry = 0) => {
    const d = new THREE.Group(); d.position.set(x, y, z); d.rotation.set(rx, ry, 0); g.add(d);
    mk(d, C(r, r, h, 28, true), shellM);
    for (const sy of [-1, 1]) {
      mk(d, new THREE.CircleGeometry(r, 28).rotateX(-sy * PI / 2), head, 0, sy * (h / 2 + 0.002), 0).castShadow = false;
      mk(d, T(r + 0.003, 0.006, 5, 28), ch, 0, sy * h / 2, 0, PI / 2);
    }
    const nl = Math.round(r * 36);
    const lb = new Bag();
    for (let i = 0; i < nl; i++) { const a = i / nl * TAU; lb.add(new THREE.BoxGeometry(0.012, h * 0.35, 0.012), Math.cos(a) * (r + 0.006), 0, Math.sin(a) * (r + 0.006), 0, -a); }
    lb.mesh(d, ch);
    return d;
  };
  const stand = (x, z, h) => {
    rod(g, V3(x, 0.02, z), V3(x, h, z), 0.008, st);
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; rod(g, V3(x + Math.cos(a) * 0.2, 0, z + Math.sin(a) * 0.2), V3(x, 0.25, z), 0.006, st); }
  };
  const cymbal = (r, x, y, z, tilt) => {
    const c = mk(g, LA([[0.001, 0.02 * r / 0.2], [0.04, 0.012], [r, 0]], 40), cym, x, y, z, tilt, 0, tilt * 0.5);
    mk(g, C(0.008, 0.008, 0.03, 8), st, x, y + 0.01, z);
    return c;
  };
  // バスドラム（前の面が +Z）
  shell(0.28, 0.42, 0, 0.29, 0, PI / 2);
  mk(g, new THREE.CircleGeometry(0.12, 32), paint('#151515', 0.6), 0, 0.29, 0.213).castShadow = false;
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.25, 0.17, 0.1), V3(sx * 0.36, 0, 0.22), 0.007, st);
  // タム
  shell(0.12, 0.2, -0.15, 0.75, -0.02, -0.35);
  shell(0.135, 0.22, 0.16, 0.76, -0.02, -0.35);
  rod(g, V3(0, 0.56, 0), V3(0, 0.68, -0.05), 0.01, st);
  // スネア
  shell(0.18, 0.13, 0.32, 0.6, -0.45, -0.1);
  stand(0.32, -0.45, 0.53);
  // フロアタム
  shell(0.2, 0.36, -0.52, 0.45, -0.4);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.3; rod(g, V3(-0.52 + Math.cos(a) * 0.23, 0, -0.4 + Math.sin(a) * 0.23), V3(-0.52 + Math.cos(a) * 0.21, 0.5, -0.4 + Math.sin(a) * 0.21), 0.006, st); }
  // ハイハット
  stand(0.62, -0.25, 0.92);
  cymbal(0.18, 0.62, 0.9, -0.25, 0); cymbal(0.18, 0.62, 0.925, -0.25, 0).rotation.x = PI;
  // シンバル
  stand(-0.45, 0.05, 1.18); cymbal(0.23, -0.45, 1.2, 0.05, -0.25);
  stand(0.5, 0.15, 1.05); cymbal(0.26, 0.5, 1.07, 0.15, -0.2);
  // いす
  mk(g, LA(smooth([[0.001, 0], [0.16, 0], [0.175, 0.03], [0.165, 0.07], [0.001, 0.08]], 12), 28), paint('#151515', 0.6), 0, 0.5, -0.75);
  stand(0, -0.75, 0.5);
  return g;
}

function easel(s) {
  const g = new THREE.Group();
  const m = matOf(s.mat, 'pine');
  const tilt = 0.18;
  const topY = 1.75, botZ = 0.18, topZ = botZ - Math.tan(tilt) * topY;
  for (const sx of [-1, 1]) rod(g, V3(sx * 0.32, 0, botZ), V3(sx * 0.05, topY, topZ), 0.016, m, 0.014, 8);
  mk(g, B(0.05, topY + 0.1, 0.03, 0.006), m, 0, (topY + 0.1) / 2, (botZ + topZ) / 2, -tilt);
  rod(g, V3(0, 0, -0.55), V3(0, 1.45, topZ - 0.03), 0.015, m, 0.013, 8);
  // 絵を置く棚
  const ly = 0.72, lz = botZ - Math.tan(tilt) * ly + 0.03;
  mk(g, B(0.7, 0.025, 0.07, 0.005), m, 0, ly, lz);
  mk(g, B(0.7, 0.04, 0.01, 0.003), m, 0, ly + 0.02, lz + 0.035);
  // キャンバス
  const cw = s.w || 0.6, chh = s.h || 0.75;
  const cv = new THREE.Group(); g.add(cv);
  cv.position.set(0, ly + 0.012 + chh / 2, lz + 0.0); cv.rotation.x = -tilt;
  mk(cv, B(cw, chh, 0.025, 0.002), paint('#f3efe6', 0.9), 0, 0, -0.005);
  mk(cv, new THREE.PlaneGeometry(cw - 0.004, chh - 0.004), imageMaterial(s.img || 'img/out-morning.jpg', cw, chh, 0.8), 0, 0, 0.0081);
  // 上の押さえ
  mk(g, B(0.08, 0.04, 0.05, 0.005), m, 0, ly + chh + 0.04, lz - Math.tan(tilt) * (chh + 0.03));
  return g;
}

function telescope(s) {
  const g = new THREE.Group();
  const tm = lacquer(s.color || '#f2f2ef', 0.3);
  const lm = paint('#2a2a2a', 0.4, 0.6);
  const apex = V3(0, 1.0, 0);
  const feet = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + PI / 2;
    const f = V3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    feet.push(f);
    rod(g, f, apex, 0.012, matOf(s.leg, 'chrome'), 0.016, 8);
    mk(g, S(0.016, 8, 6), paint('#111', 0.9), f.x, 0.01, f.z);
  }
  // 小物皿
  const tray = feet.map(f => f.clone().lerp(apex, 0.55));
  mk(g, C(0.12, 0.12, 0.008, 3), lm, 0, tray[0].y, 0, 0, PI / 2);
  mk(g, B(0.1, 0.12, 0.1, 0.01), lm, 0, 1.06, 0);
  mk(g, C(0.03, 0.03, 0.08, 16), lm, 0, 1.14, 0, 0, 0, PI / 2);
  const tg = new THREE.Group(); g.add(tg);
  tg.position.set(0, 1.2, 0); tg.rotation.x = -0.6;
  mk(tg, C(0.065, 0.065, 0.85, 32), tm, 0, 0, 0.05, PI / 2);
  mk(tg, C(0.075, 0.07, 0.2, 32, true), lm, 0, 0, 0.55, PI / 2);
  mk(tg, new THREE.CircleGeometry(0.066, 32), paint('#0a0d14', 0.05, 0.2), 0, 0, 0.47).castShadow = false;
  for (const z of [-0.12, 0.18]) mk(tg, T(0.07, 0.01, 6, 32), lm, 0, 0, z);
  mk(tg, C(0.04, 0.035, 0.1, 20), lm, 0, 0, -0.42, PI / 2);
  mk(tg, C(0.012, 0.012, 0.09, 12), lm, 0, -0.04, -0.44, PI / 2 + 0.7);
  mk(tg, C(0.018, 0.016, 0.06, 12), paint('#111', 0.4), 0, -0.075, -0.48, PI / 2 + 0.7);
  mk(tg, C(0.018, 0.018, 0.22, 16), lm, 0, 0.09, -0.1, PI / 2);
  return g;
}

function globeTex() {
  return canvasTex('globe', 512, 256, (ctx, w, h) => {
    const sea = hexRGB('#2f5f80'), sea2 = hexRGB('#3c7395'), land = hexRGB('#c9b585'), land2 = hexRGB('#7f9a5c');
    pixels(ctx, w, h, (u, v, o) => {
      const lat = (v - 0.5) * PI;
      const n = fbm(u * 6, v * 3, 6, 1e6, 5, 21);
      const ice = Math.abs(lat) > 1.35;
      let c;
      if (ice) c = [238, 240, 240];
      else if (n > 0.53) c = mixRGB(land2, land, clamp((n - 0.53) * 8 + Math.abs(lat) * 0.3, 0, 1));
      else c = mixRGB(sea, sea2, clamp((0.53 - n) * 4, 0, 1));
      // 緯線・経線
      if (Math.abs(((u * 12) % 1) - 0.5) > 0.49 || Math.abs(((v * 6) % 1) - 0.5) > 0.485) c = mixRGB(c, [240, 235, 220], 0.4);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
  }, { rep: 1 });
}
function globe(s) {
  const g = new THREE.Group();
  const wm = matOf(s.mat, 'walnut');
  const bm = matOf(s.ring, 'brass');
  const desk = s.style === 'desk';
  const R0 = desk ? 0.15 : 0.22;
  const cy = desk ? 0.3 : 0.75;
  if (desk) {
    mk(g, LA(smooth([[0.001, 0], [0.11, 0], [0.11, 0.02], [0.05, 0.04], [0.025, 0.1], [0.02, 0.12]], 16), 32), wm, 0, 0, 0);
  } else {
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + PI / 2;
      rod(g, V3(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), V3(Math.cos(a) * 0.2, cy - 0.12, Math.sin(a) * 0.2), 0.018, wm, 0.022, 10);
    }
    mk(g, T(0.25, 0.022, 8, 48), wm, 0, cy - 0.08, 0, PI / 2);
    mk(g, T(0.2, 0.012, 8, 40), wm, 0, 0.22, 0, PI / 2);
  }
  const tilt = new THREE.Group(); tilt.position.y = cy; tilt.rotation.z = 0.41; g.add(tilt);
  const gm = cm('globem', () => std({ color: globeTex() ? '#ffffff' : '#3a6a88', map: globeTex(), roughness: 0.35 }));
  mk(tilt, S(R0, 40, 24), gm);
  mk(tilt, T(R0 + 0.015, 0.006, 6, 64), bm, 0, 0, 0);
  mk(tilt, C(0.005, 0.005, R0 * 2 + 0.06, 8), bm);
  if (desk) mk(g, C(0.006, 0.006, cy - R0 * 0.9 - 0.11, 8), bm, 0, 0.11 + (cy - R0 * 0.9 - 0.11) / 2, 0);
  return g;
}

function gamechair(s) {
  const g = new THREE.Group();
  const acc = s.color || '#c0262b';
  const blackL = upholMat('blackLeather');
  const accM = upholMat('leather', acc);
  const base = paint('#151515', 0.4, 0.5);
  // 5本脚とキャスター
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU + PI / 2;
    const end = V3(Math.cos(a) * 0.33, 0.085, Math.sin(a) * 0.33);
    const l = mk(g, B(0.33, 0.04, 0.05, 0.01), base, Math.cos(a) * 0.165, 0.09, Math.sin(a) * 0.165, 0, -a, -0.05);
    void l;
    mk(g, C(0.028, 0.028, 0.025, 14), base, end.x, 0.032, end.z, PI / 2, 0, 0).rotation.set(0, -a, PI / 2);
    mk(g, C(0.008, 0.008, 0.04, 8), base, end.x, 0.065, end.z);
  }
  mk(g, C(0.05, 0.05, 0.05, 20), base, 0, 0.1, 0);
  mk(g, C(0.025, 0.025, 0.28, 16), CHROME(), 0, 0.27, 0);
  mk(g, C(0.04, 0.035, 0.1, 16), base, 0, 0.18, 0);
  mk(g, B(0.3, 0.04, 0.3, 0.01), base, 0, 0.42, 0);
  // 座面
  const sy = 0.48;
  mk(g, cushionGeo(0.38, 0.09, 0.48, 0.25, 1), blackL, 0, sy, 0.02);
  for (const sx of [-1, 1]) mk(g, cushionGeo(0.09, 0.13, 0.48, 0.2, 2), accM, sx * 0.23, sy + 0.02, 0.02, 0, 0, sx * 0.25);
  // 背もたれ
  const bk = new THREE.Group(); g.add(bk);
  bk.position.set(0, sy + 0.04, -0.23); bk.rotation.x = -0.18;
  mk(bk, cushionGeo(0.34, 0.78, 0.09, 0.2, 3, 'z'), blackL, 0, 0.42, 0.0);
  for (const sx of [-1, 1]) mk(bk, cushionGeo(0.09, 0.72, 0.12, 0.2, 4), accM, sx * 0.21, 0.38, 0.0, 0, sx * 0.3, 0);
  mk(bk, cushionGeo(0.42, 0.18, 0.1, 0.2, 5), blackL, 0, 0.8, -0.005);
  mk(bk, cushionGeo(0.24, 0.12, 0.08, 0.6, 6, 'z'), blackL, 0, 0.7, 0.07);
  for (const sx of [-1, 1]) mk(bk, B(0.07, 0.03, 0.01, 0.004), accM, sx * 0.1, 0.83, 0.05);
  mk(bk, cushionGeo(0.26, 0.14, 0.07, 0.6, 7, 'z'), accM, 0, 0.18, 0.06);
  // ひじ掛け
  for (const sx of [-1, 1]) {
    mk(g, B(0.04, 0.2, 0.06, 0.01), base, sx * 0.25, sy + 0.08, -0.02);
    mk(g, B(0.08, 0.03, 0.25, 0.012), paint('#202020', 0.8), sx * 0.25, sy + 0.195, 0.0);
  }
  return g;
}

function amp(s) {
  const g = new THREE.Group();
  const W = 0.55, H = 0.45, D = 0.26;
  const tol = cm('tolex' + (s.color || ''), () => { const m = std({ color: s.color || '#1b1b1b', roughness: 0.75 }); applyTex(m, 'fabric_leather_02', { tile: 0.12, nScale: 1.2, rough: false }); return m; });
  mk(g, B(W, H, D, 0.02), tol, 0, H / 2 + 0.015, 0);
  const grille = cm('grille' + (s.grille || ''), () => std({ color: s.grille || '#c9b58c', roughness: 0.95, map: canvasTex('grillecloth', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke(); }
  }) }));
  if (grille.map) grille.map.repeat.set(30, 30);
  mk(g, B(W - 0.05, H - 0.14, 0.006, 0.004), grille, 0, 0.015 + (H - 0.12) / 2 + 0.01, D / 2 + 0.001);
  mk(g, B(W - 0.04, H - 0.12, 0.004, 0.002), paint('#e9e3d0', 0.6), 0, 0.015 + (H - 0.12) / 2 + 0.01, D / 2 - 0.001);
  // つまみの板
  mk(g, B(W - 0.06, 0.07, 0.006, 0.003), paint('#c8c4ba', 0.25, 1), 0, H - 0.035 + 0.01, D / 2 + 0.002);
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 0.09 + i * 0.06;
    mk(g, C(0.012, 0.014, 0.018, 16), paint('#121212', 0.4), x, H - 0.025, D / 2 + 0.012, PI / 2);
    mk(g, B(0.002, 0.008, 0.002, 0), paint('#eee', 0.4), x, H - 0.018, D / 2 + 0.022);
  }
  mk(g, S(0.005, 8, 6), glow('#ff3b2a', 2), W / 2 - 0.05, H - 0.025, D / 2 + 0.008);
  mk(g, B(0.11, 0.03, 0.004, 0.003), paint('#d8c79a', 0.3, 1), -0.14, H - 0.12 + 0.015, D / 2 + 0.006);
  // 持ち手
  tube(g, [[-0.08, H + 0.015, 0], [-0.06, H + 0.05, 0], [0.06, H + 0.05, 0], [0.08, H + 0.015, 0]], 0.012, paint('#141414', 0.6), 16, 8).scale.z = 0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, C(0.02, 0.02, 0.015, 12), paint('#111', 0.9), sx * (W / 2 - 0.05), 0.0075, sz * (D / 2 - 0.04));
  return g;
}

function micstand(s) {
  const g = new THREE.Group();
  const m = matOf(s.mat, 'black');
  mk(g, LA(smooth([[0.001, 0], [0.14, 0], [0.145, 0.008], [0.12, 0.02], [0.03, 0.03], [0.015, 0.035]], 14), 40), m, 0, 0, 0);
  mk(g, C(0.011, 0.011, 0.6, 12), m, 0, 0.33, 0);
  mk(g, C(0.008, 0.008, 0.5, 12), CHROME(), 0, 0.85, 0);
  mk(g, C(0.016, 0.016, 0.04, 12), m, 0, 0.64, 0);
  // ブーム
  const pivot = V3(0, 1.1, 0);
  mk(g, S(0.025, 12, 8), m, pivot.x, pivot.y, pivot.z);
  const a = V3(0, 0.95, -0.25), b = V3(0, 1.38, 0.35);
  rod(g, a, b, 0.008, m);
  mk(g, C(0.028, 0.028, 0.06, 16), m, a.x, a.y, a.z, 0.6);
  // マイク
  const mg = new THREE.Group(); g.add(mg);
  mg.position.copy(b); mg.rotation.x = 0.4 + PI / 2;
  mk(mg, C(0.022, 0.016, 0.15, 20), paint('#1c1c1c', 0.35, 0.5), 0, -0.075, 0);
  mk(mg, C(0.026, 0.023, 0.025, 20), paint('#999', 0.3, 1), 0, 0.012, 0);
  const meshM = cm('micmesh', () => std({ color: '#c8c8c8', metalness: 1, roughness: 0.4, map: canvasTex('micgrid', 32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#555';
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) ctx.fillRect(x + 1, y + 1, 2, 2);
  }) }));
  if (meshM.map) meshM.map.repeat.set(10, 6);
  mk(mg, S(0.03, 24, 16), meshM, 0, 0.045, 0);
  // ケーブル
  tube(g, [b.clone().add(V3(0, 0.03, -0.06)), V3(0, 1.0, 0.25), V3(0.03, 0.6, 0.12), V3(0.05, 0.25, 0.06), V3(0.15, 0.01, 0.15), V3(0.4, 0.008, 0.2)], 0.0035, paint('#111', 0.6), 48, 5);
  return g;
}

// =====================================================================
// 一覧と入口
// =====================================================================
const MATKEY = '材質キー（MATS）または #色';
export const PROC_TYPES = {
  pendant: { place: 'ceiling', params: { shape: ['cone', 'dome', 'globe', 'drum', 'bell', 'cage', 'cylinder', 'cluster', 'lantern', 'disc', 'pleated', 'industrial'], mat: MATKEY, inner: 'かさの内側の色', drop: '吊る長さ m（0.6）', fabric: '布のかさの色（drum / pleated）' } },
  floorlamp: { place: 'floor', params: { shape: ['arc', 'tripod', 'column', 'drum', 'globe', 'paper', 'torch'], mat: MATKEY, shade: 'かさの色' } },
  sconce: { place: 'wall', params: { shape: ['cone', 'globe', 'arm', 'box', 'candle'], mat: MATKEY } },
  sofa: { place: 'floor', params: { style: ['modern', 'roll', 'low', 'chester', 'loveseat', 'bench', 'corner'], fabric: '布の色 #hex', mat: '張り地 linen|leather|blackLeather|velvet（省略で布）', leg: MATKEY, w: '幅 m', pillow: '飾りクッションの色', pillows: 'false で飾りクッションなし' } },
  bed: { place: 'floor', params: { style: ['platform', 'frame', 'low', 'metal'], fabric: 'ブランケット・クッションの色', mat: '枠の' + MATKEY, duvet: '掛け布団の色', headboard: '布のヘッドボードの色（platform）', w: '幅 m（1.6）' } },
  chair: { place: 'floor', params: { style: ['stool', 'dining', 'arm', 'lounge', 'bar', 'beanbag', 'pouf', 'bench', 'rocking'], mat: '木や脚の' + MATKEY, fabric: '布の色', cover: '張り地 linen|leather|blackLeather|velvet' } },
  table: { place: 'floor', params: { style: ['round', 'rect', 'oval', 'nest', 'trunk', 'pedestal', 'lowJapanese', 'side', 'console', 'desk'], top: MATKEY, leg: MATKEY, w: '幅 m', d: '奥行 m', h: '高さ m', handle: '引き出しの取っ手（desk）' } },
  shelf: { place: 'floor', params: { style: ['bookcase', 'cube', 'ladder', 'sideboard', 'cabinet', 'display', 'low'], mat: MATKEY, books: 'true/false（本や小物を飾る）', w: '幅 m', h: '高さ m', handle: '取っ手の材質' } },
  plant: { place: 'floor', params: { pot: ['round', 'tall', 'bowl', 'basket', 'square', 'stand'], potColor: '#色 または ceramic|terracotta|concrete|rattan など', foliage: ['bush', 'tree', 'cactus', 'palm', 'grass', 'monstera'], size: '高さの目安 m' } },
  vase: { place: 'floor', params: { shape: ['bottle', 'round', 'tall', 'bowl', 'amphora', 'jug'], color: '#色 または材質キー', gloss: '0〜1', flowers: 'true/false', flowerColors: '花の色の配列' } },
  books: { place: 'floor', params: { n: '冊数', colors: '色の配列', stand: 'true=立ててブックエンド / false=横に積む', holder: 'ブックエンドの材質' } },
  candle: { place: 'floor', params: { n: '本数', holder: '金属=燭台 / glass,smoked=グラス / その他=トレイ', color: 'ろうの色' } },
  frame: { place: 'wall', params: { img: '画像パス', frame: MATKEY, w: '幅 m', h: '高さ m', mat: '余白 true/false' } },
  mirror: { place: 'wall', params: { shape: ['round', 'rect', 'arch', 'sunburst'], frame: MATKEY } },
  clock: { place: 'wall', params: { style: ['simple', 'station', 'wood', 'minimal'], rim: MATKEY } },
  wallshelf: { place: 'wall', params: { style: ['plank', 'box', 'bracket'], mat: MATKEY, items: 'true/false', w: '幅 m' } },
  door: { place: 'surface', surface: 'door', params: { style: ['flat', 'panel2', 'panel4', 'glass', 'barn', 'louver', 'shaker'], color: '#色 または木の材質キー', handle: MATKEY, frameColor: '枠の色' } },
  window: { place: 'surface', surface: 'window', params: { style: ['grid4', 'grid6', 'single', 'transom', 'cross', 'slim', 'arched'], frame: '#色 または材質キー' } },
  guitar: { place: 'floor', params: { style: ['acoustic', 'electric', 'bass', 'classic'], color: '本体の色' } },
  keyboard: { place: 'floor', params: { style: ['stand', 'piano'], color: '本体の色', mat: '本体の材質（piano を木にするとき）' } },
  speaker: { place: 'floor', params: { style: ['tower', 'bookshelf', 'studio', 'smart'], mat: '箱の' + MATKEY, color: '前面の色' } },
  turntable: { place: 'floor', params: { mat: MATKEY, color: 'プレーヤーの色', stand: 'true/false（レコード棚つきの台）', label: 'レコードのラベルの色' } },
  drum: { place: 'floor', params: { color: '胴の色' } },
  easel: { place: 'floor', params: { img: '画像パス', mat: MATKEY, w: 'キャンバス幅', h: 'キャンバス高さ' } },
  telescope: { place: 'floor', params: { color: '筒の色', leg: MATKEY } },
  globe: { place: 'floor', params: { style: ['floor', 'desk'], mat: '台の' + MATKEY, ring: '輪の' + MATKEY } },
  gamechair: { place: 'floor', params: { color: 'アクセントの色' } },
  amp: { place: 'floor', params: { color: '外側の色', grille: '前の布の色' } },
  micstand: { place: 'floor', params: { mat: MATKEY } },
  bookstack: { place: 'floor', params: { n: '冊数', colors: '色の配列', top: 'false でマグカップなし' } },
};

const BUILDERS = {
  pendant, floorlamp, sconce, sofa, bed, chair, table, shelf, plant, vase, books, candle,
  frame, mirror, clock, wallshelf, door, window: windowFrame, guitar, keyboard, speaker,
  turntable, drum, easel, telescope, globe, gamechair, amp, micstand, bookstack,
};

// spec = { type, ...引数 } → THREE.Group（すぐ返す）
export function buildProc(spec = {}) {
  const fn = BUILDERS[spec.type];
  let g;
  try {
    g = fn ? fn(spec) : null;
  } catch (e) {
    console.warn('buildProc', spec, e);
    g = null;
  }
  if (!g) {
    // 知らない種類：目印の箱
    g = new THREE.Group();
    mk(g, B(0.3, 0.3, 0.3, 0.02), paint('#c9c2b5'), 0, 0.15, 0);
  }
  g.userData.proc = { ...spec };
  g.name = 'proc-' + (spec.type || 'unknown');
  return g;
}
