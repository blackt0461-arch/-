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
      const n = fbm(u * 3, v * 10, 3, 10, 3, 7);
      let ring = 0.5 + 0.5 * Math.sin((v * 22 + n * 5) * TAU);
      ring = ring * ring * ring;
      const pore = vn(u * 5, v * 320, 5, 320, 3);
      const f = clamp(ring * 0.5 + pore * 0.22 + (n - 0.5) * 0.6 + 0.12, 0, 1);
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
const MIRROR = () => cm('mirror', () => std({ color: '#dfe7ea', metalness: 1, roughness: 0.03 }));

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
  return cg(`b${r4(w)},${r4(h)},${r4(d)},${r4(r)}`, () => worldUV(r > 0.0006 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)));
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
function cushionGeo(w, h, d, bulge = 0.25, seed = 1) {
  return cg(`cu${r4(w)},${r4(h)},${r4(d)},${r4(bulge)},${seed}`, () => {
    let g = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.32);
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
function shell(g, pts, outer, inner, y, seg = 40, x = 0, z = 0) {
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
      mk(g, C(0.0012, 0.0012, 1, 4), CORD(), 0.18, y + 0.3, 0).scale.y = 0;
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
    const bc = mk(g, cushionGeo(W - 0.14, 0.4, 0.13, 0.35, 4), fab, 0, seatY + P.cush + 0.2, -D / 2 + 0.12);
    bc.rotation.x = -0.14;
    // 小さなクッション
    mk(g, cushionGeo(0.4, 0.4, 0.12, 0.6, 9), upholMat('linen', '#e8e1d3'), -W / 2 + 0.38, seatY + P.cush + 0.2, -D / 2 + 0.24, -0.25, 0.2, 0.08);
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
  mk(g, cushionGeo(W - 0.02, backH, backT, 0.08, 2), fab, 0, seatY + backH / 2, -D / 2 + backT / 2);
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
      const b = mk(g, cushionGeo(cw - 0.02, bh, 0.17, 0.35, 20 + i), fab, x, seatY + P.cush + bh / 2 - 0.02, -D / 2 + backT + 0.07);
      b.rotation.x = -0.13;
    }
  }
  if (style === 'corner') {
    const x = innerW / 2 - 0.425;
    mk(g, cushionGeo(0.84, P.cush, cd + chaise, 0.22, 30), fab, x, seatY + P.cush / 2, cz + chaise / 2);
    const bh = Math.min(0.46, P.backTop - seatY - P.cush + 0.06);
    mk(g, cushionGeo(0.83, bh, 0.17, 0.35, 31), fab, x, seatY + P.cush + bh / 2 - 0.02, -D / 2 + backT + 0.07, -0.13);
  }
  // チェスターフィールドのボタン留め
  if (style === 'chester') {
    const bag = new Bag();
    const by0 = seatY + P.cush + 0.08, bz = -D / 2 + backT + 0.004;
    for (let r = 0; r < 3; r++) for (let c = 0; c <= 9; c++) {
      const x = -innerW / 2 + 0.06 + (innerW - 0.12) * (c + (r % 2) * 0.5) / 9.5;
      if (Math.abs(x) > innerW / 2 - 0.04) continue;
      bag.add(S(0.009, 8, 6), x, by0 + r * 0.12, bz);
    }
    for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++)
      bag.add(S(0.009, 8, 6), sx * (W / 2 - P.armW - 0.002), seatY + P.cush + 0.08 + r * 0.12, -D / 2 + backT + 0.07 + c * 0.13 + (r % 2) * 0.065);
    bag.mesh(g, fab.color.getHSL({}).l < 0.15 ? paint('#0d0c0c', 0.4) : paint('#3a2012', 0.45));
    // 背もたれの上の丸み
    const r = 0.1;
    mk(g, C(r, r, W - 0.02, 24), fab, 0, P.backTop - 0.06, -D / 2 + backT / 2, 0, 0, PI / 2);
  }
  // 飾りクッション
  if (style !== 'chester' && s.pillows !== false) {
    const pc = upholMat('linen', s.pillow || (R() < 0.5 ? '#e7dfcf' : '#b9845a'));
    const py = seatY + P.cush + 0.2;
    mk(g, cushionGeo(0.42, 0.42, 0.12, 0.6, 40), pc, -innerW / 2 + 0.26, py, -D / 2 + backT + 0.2, -0.3, 0.25, 0.06);
    if (W > 1.3) mk(g, cushionGeo(0.4, 0.4, 0.12, 0.6, 41), pc, innerW / 2 - 0.26 - (style === 'corner' ? 0 : 0), py, -D / 2 + backT + 0.2, -0.3, -0.25, -0.06);
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
    mk(g, cushionGeo(W - 0.06, 0.42, 0.07, 0.15, 7), upholMat('linen', s.headboard || '#cfc6b8'), 0, 0.68, head + 0.03);
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
  mk(g, cushionGeo(0.45, 0.42, 0.12, 0.6, 8), throwM, 0.1, mTop + 0.22, head + 0.46, -0.3, 0.1, 0.04);
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
      mk(bk, cushionGeo(W - 0.1, 0.56, 0.13, 0.3, 4), fab, 0, 0.3, 0.06);
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
