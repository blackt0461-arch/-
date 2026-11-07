// 小物（お風呂・台所・机・リビング）の形。procfurn.js の buildProc({ type: 'small', kind, ... }) から呼ぶ。
// 小さいので形はシンプルに、色・素材・ラベルで本物らしく見せる。実物の大きさ（m）で作る。
// 床（置く面）が y=0、手前が +z。どれもテーブル・棚・洗面台・キッチンの天板にのせて使う。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PI = Math.PI, TAU = PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- 材質（同じ物は使い回す） ----------
const MC = new Map();
const cm = (k, make) => { let m = MC.get(k); if (!m) { m = make(); MC.set(k, m); } return m; };
const std = (o) => new THREE.MeshStandardMaterial(o);
const P = (c, r = 0.45, m = 0) => cm(`p${c}${r}${m}`, () => std({ color: c, roughness: r, metalness: m })); // 塗り・樹脂
const CER = (c = '#f4f1ea') => P(c, 0.18); // 陶器
const MET = (c = '#d9d9d9', r = 0.22) => P(c, r, 1); // 金属
const CHROME = () => MET('#f0f0f0', 0.08);
const BRASS = () => MET('#cfa65a', 0.3);
const IRON = () => P('#2b2a29', 0.55, 0.6);
const GL = (c = '#e6f2ef', o = 0.28) => cm(`g${c}${o}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, metalness: 0, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }));
const LIQ = (c, o = 0.75) => cm(`q${c}${o}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, transparent: true, opacity: o, depthWrite: false }));
const CLOTH = (c) => P(c, 0.95);
const GLOW = (c = '#ffb45a', i = 2.6) => cm(`e${c}${i}`, () => std({ color: '#ffffff', emissive: c, emissiveIntensity: i, roughness: 0.5 }));
const SCREEN = (c = '#0f1418', e = '#000000', i = 0) => cm(`s${c}${e}${i}`, () => std({ color: c, roughness: 0.08, metalness: 0.2, emissive: e, emissiveIntensity: i }));
let WOOD = (k) => P({ oak: '#c49a64', walnut: '#6b4a32', pine: '#dcbf8e' }[k] || '#c49a64', 0.6);

// ---------- ラベル（キャンバスに描いた絵） ----------
const TX = new Map();
function canvasMat(key, w, h, draw, o = {}) {
  return cm('t' + key, () => {
    let tex = TX.get(key);
    if (!tex) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      TX.set(key, tex);
    }
    return std({ map: tex, roughness: o.rough ?? 0.4, metalness: o.metal ?? 0 });
  });
}
// ボトルなどのラベル：bg 地の色、band 帯の色、text 文字。円柱に巻くと、絵の真ん中が背中側に来る（mesh を半回転して前に向ける）
function label(key, { bg = '#ffffff', band = null, text = '', sub = '', fg = '#333', area = [0.36, 0.64], lbg = null, font = 30 } = {}) {
  return canvasMat('lb' + key, 256, 128, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    const x0 = w * area[0], x1 = w * area[1];
    if (lbg) { x.fillStyle = lbg; x.fillRect(x0, h * 0.18, x1 - x0, h * 0.64); }
    if (band) { x.fillStyle = band; x.fillRect(x0, h * 0.66, x1 - x0, h * 0.08); }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${font}px "Helvetica Neue", Arial, sans-serif`;
    if (text) x.fillText(text, (x0 + x1) / 2, h * 0.44, (x1 - x0) * 0.9);
    if (sub) { x.font = `${Math.round(font * 0.5)}px Arial, sans-serif`; x.fillText(sub, (x0 + x1) / 2, h * 0.58, (x1 - x0) * 0.9); }
  });
}
// 箱の正面の絵
function faceMat(key, draw, w = 128, h = 128) { return canvasMat('f' + key, w, h, draw); }

// ---------- 形 ----------
const GC = new Map();
const cg = (k, make) => { let g = GC.get(k); if (!g) { g = make(); GC.set(k, g); } return g; };
const r4 = (v) => Math.round(v * 10000);
let G = null; // 今つくっている物
function add(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  const mats = Array.isArray(mat) ? mat : [mat];
  m.castShadow = !mats.some(q => q.transparent); m.receiveShadow = true;
  G.add(m); return m;
}
// 箱（y は底の高さ）。r = 角の丸み
function bx(w, h, d, mat, x = 0, y = 0, z = 0, r = 0) {
  r = Math.min(r, Math.min(w, h, d) * 0.45);
  const geo = cg(`b${r4(w)},${r4(h)},${r4(d)},${r4(r)}`, () => r > 0.0005 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d));
  return add(geo, mat, x, y + h / 2, z);
}
// 円柱（y は底の高さ）
function cy(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20, open = false) {
  const geo = cg(`c${r4(rt)},${r4(rb)},${r4(h)},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return add(geo, mat, x, y + h / 2, z);
}
// 回転体：pts = [[半径, 高さ], ...] 下から上（y は底の高さ）
function la(pts, mat, x = 0, y = 0, z = 0, seg = 24) {
  const geo = cg('l' + seg + pts.map(p => r4(p[0]) + ',' + r4(p[1])).join(';'), () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1])), seg));
  const m = add(geo, mat, x, y, z);
  return m;
}
// なめらかな回転体
function las(pts, mat, x = 0, y = 0, z = 0, seg = 24, n = 20) {
  const s = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(n).map(v => [v.x, v.y]);
  return la(s, mat, x, y, z, seg);
}
// 球（中心）
function sp(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12) {
  const m = add(cg(`s${r4(r)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), mat, x, y, z);
  m.scale.set(sx, sy, sz); return m;
}
// 輪（中心）
function to(R, r, mat, x = 0, y = 0, z = 0, arc = TAU, rs = 8, ts = 24) {
  return add(cg(`t${r4(R)},${r4(r)},${r4(arc)},${rs},${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), mat, x, y, z);
}
// 曲がった管
function tb(pts, r, mat, seg = 20, rs = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
  return add(new THREE.TubeGeometry(curve, seg, r, rs, false), mat, 0, 0, 0);
}
// 平らな板（上向き。y は高さ）
function pl(w, d, mat, x = 0, y = 0, z = 0) {
  const m = add(cg(`pl${r4(w)},${r4(d)}`, () => new THREE.PlaneGeometry(w, d).rotateX(-PI / 2)), mat, x, y, z);
  m.castShadow = false; return m;
}
const R = (m, rx = 0, ry = 0, rz = 0) => { m.rotation.set(rx, ry, rz); return m; };
// ラベル付きの円柱（ラベルを前に向ける）
function labeled(rt, rb, h, side, cap, x = 0, y = 0, z = 0, seg = 24) {
  const geo = cg(`c${r4(rt)},${r4(rb)},${r4(h)},${seg},false`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, false));
  const m = add(geo, [side, cap, cap], x, y + h / 2, z);
  m.rotation.y = PI; return m;
}
// 正面に絵のある箱
function faced(w, h, d, body, front, x = 0, y = 0, z = 0, top = null) {
  const geo = cg(`b${r4(w)},${r4(h)},${r4(d)},0`, () => new THREE.BoxGeometry(w, h, d));
  return add(geo, [body, body, top || body, body, front, body], x, y + h / 2, z);
}
// 簡単な乱数
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- よく使う部品 ----------
// ポンプボトル
function pumpBottle(x, z, h, r, body, lab, pumpC = '#f2f2f2') {
  labeled(r, r, h, lab, body, x, 0, z);
  cy(r * 0.45, r * 0.55, 0.02, P(pumpC, 0.35), x, h, z, 14);
  cy(0.006, 0.006, 0.035, P(pumpC, 0.35), x, h + 0.02, z, 8);
  bx(0.016, 0.012, 0.04, P(pumpC, 0.35), x, h + 0.05, z + 0.012, 0.004);
}
// ふた付きのびん
function jar(x, z, r, h, glass, lid, fill, fillH) {
  if (fill) cy(r * 0.92, r * 0.92, fillH ?? h * 0.7, fill, x, 0.004, z, 18);
  cy(r, r, h, glass, x, 0, z, 20, true);
  cy(r, r, 0.004, glass, x, 0, z, 20);
  if (lid) cy(r * 1.03, r * 1.03, 0.022, lid, x, h, z, 20);
}
// 本1冊（横に寝かせる）
function book(w, t, d, color, x, y, z, ry = 0, pages = '#f3ecdc') {
  const cover = P(color, 0.7);
  const g = bx(w, t, d, cover, x, y, z, 0.002); g.rotation.y = ry;
  const pg = bx(w - 0.006, t * 0.8, d - 0.008, P(pages, 0.9), x, y + t * 0.1, z, 0); pg.rotation.y = ry;
  pg.position.x += Math.cos(ry) * 0.004; pg.position.z -= Math.sin(ry) * 0.004;
}
// かご（編み目の絵）
const wicker = (c = '#b98d55') => canvasMat('wick' + c, 64, 64, (x, w, h) => {
  x.fillStyle = c; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(60,35,10,0.45)'; x.lineWidth = 2;
  for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 8 + 4); x.lineTo(w, i * 8 + 4); x.stroke(); }
  x.strokeStyle = 'rgba(255,240,210,0.35)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.beginPath(); x.moveTo(i * 8 + (j % 2) * 4, j * 8); x.lineTo(i * 8 + (j % 2) * 4, j * 8 + 8); x.stroke(); }
}, { rough: 0.9 });
// 写真（img のパス）を貼る材質
const photoMat = (img) => cm('ph' + img, () => {
  const m = std({ color: '#ffffff', roughness: 0.35 });
  new THREE.TextureLoader().load(img, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.needsUpdate = true; });
  return m;
});
// ほのおの光
function flame(x, y, z, s = 1) {
  sp(0.006 * s, GLOW('#ffb04a', 3), x, y + 0.01 * s, z, 1, 2.2, 1, 10, 8).castShadow = false;
  // 本物の光は入れない（照明の数をとらない・大きな影を作らない）。光る芯だけ
}

// =====================================================================
// それぞれの小物
// =====================================================================
const K = {};

// ───────── お風呂・洗面所 ─────────
K.shampoo = (s) => {
  pumpBottle(-0.045, 0, 0.2, 0.034, P('#f4f1ea', 0.3), label('shampoo', { bg: '#f4f1ea', text: 'SHAMPOO', sub: 'botanical', band: '#7f9a7a', fg: '#4a5a48', font: 26 }));
  pumpBottle(0.045, 0, 0.2, 0.034, P('#d9c8ad', 0.3), label('condi', { bg: '#d9c8ad', text: 'CONDITIONER', sub: 'botanical', band: '#7f9a7a', fg: '#4a4030', font: 22 }));
};
K.bodysoap = () => {
  pumpBottle(0, 0, 0.23, 0.045, P('#5f7f73', 0.3), label('body', { bg: '#5f7f73', text: 'BODY SOAP', sub: 'eucalyptus', fg: '#f3efe6', font: 26 }), '#1f1f1f');
};
K.soapdish = () => {
  la([[0.001, 0], [0.05, 0], [0.065, 0.012], [0.068, 0.016], [0.062, 0.016], [0.05, 0.006], [0.001, 0.006]], CER('#e9e4da'), 0, 0, 0, 28).scale.set(1.3, 1, 0.9);
  bx(0.085, 0.026, 0.055, P('#efe0c4', 0.55), 0, 0.007, 0, 0.012);
};
K.toothbrush = () => {
  las([[0.001, 0], [0.034, 0], [0.036, 0.05], [0.038, 0.1], [0.034, 0.1], [0.032, 0.012], [0.001, 0.012]], CER('#cfdcd6'), 0, 0, 0, 24);
  const cols = ['#f2f2f2', '#e7a8a0'];
  [-1, 1].forEach((sg, i) => {
    const h = cy(0.005, 0.005, 0.17, P(cols[i], 0.35), sg * 0.012, 0.03, 0, 8); h.rotation.z = sg * 0.18;
    const head = bx(0.012, 0.03, 0.01, P('#ffffff', 0.9), sg * 0.012 + sg * 0.031, 0.18, 0.004, 0.003); head.rotation.z = sg * 0.18;
  });
};
K.etoothbrush = () => {
  cy(0.035, 0.038, 0.035, P('#f4f4f2', 0.3), 0, 0, 0, 24);
  cy(0.013, 0.015, 0.18, P('#f4f4f2', 0.3), 0, 0.035, 0, 16);
  bx(0.01, 0.025, 0.008, P('#dfe7ef', 0.3), 0, 0.12, 0.015, 0.002);
  cy(0.0035, 0.004, 0.05, P('#f4f4f2', 0.3), 0, 0.215, 0, 8);
  bx(0.012, 0.018, 0.012, P('#ffffff', 0.9), 0, 0.25, 0.006, 0.003);
  sp(0.003, GLOW('#66c7ff', 1.5), 0, 0.08, 0.015, 1, 1, 0.5, 8, 6);
};
K.toothpaste = () => {
  const lab = label('paste', { bg: '#ffffff', text: 'MINT', band: '#2e7fc1', fg: '#2e7fc1', area: [0.1, 0.9], font: 34 });
  // 横に寝かせたチューブ（つぶれて平たい）
  const t = cy(0.018, 0.024, 0.16, [lab, P('#fff'), P('#fff')], 0, 0.02, 0, 16); t.rotation.set(0, 0, PI / 2); t.position.y = 0.016; t.scale.set(1, 1, 0.6);
  const c = cy(0.012, 0.012, 0.018, P('#2e7fc1', 0.35), -0.089, 0.004, 0, 12); c.rotation.z = PI / 2; c.position.y = 0.016;
};
K.towels = (s) => {
  const cols = s.colors || ['#e9e4da', '#c9d6cf', '#e9e4da'];
  cols.forEach((c, i) => {
    bx(0.3, 0.045, 0.2, CLOTH(c), 0, i * 0.043, 0, 0.02);
    bx(0.3, 0.004, 0.012, CLOTH(i % 2 ? '#ffffff' : '#bfb6a6'), 0, i * 0.043 + 0.012, 0.101, 0);
  });
};
K.towelbasket = () => {
  const w = wicker('#b58a56');
  cy(0.13, 0.11, 0.13, w, 0, 0, 0, 20, true); cy(0.11, 0.11, 0.004, w, 0, 0, 0, 20);
  to(0.13, 0.008, w, 0, 0.13, 0, TAU, 6, 24).rotation.x = PI / 2;
  const cols = ['#ece7dc', '#c9d6cf', '#ece7dc', '#e8d6c8', '#d8d2c6'];
  cols.forEach((c, i) => {
    const a = i / cols.length * TAU;
    const r = cy(0.035, 0.035, 0.2, CLOTH(c), Math.cos(a) * 0.055, 0.1, Math.sin(a) * 0.055, 14);
    r.rotation.set(PI / 2, 0, a + PI / 2); r.position.y = 0.13 + (i % 2) * 0.02;
  });
};
K.handsoap = () => {
  pumpBottle(0, 0, 0.17, 0.035, LIQ('#9a5a22', 0.85), label('hand', { bg: '#7a4a22', lbg: '#f2ead8', text: 'HAND', sub: 'soap', fg: '#4a3020', font: 30 }), '#2a2a2a');
};
K.lotion = () => {
  labeled(0.028, 0.03, 0.15, label('lotion', { bg: '#e6eef0', lbg: '#ffffff', text: 'LOTION', sub: 'moist', fg: '#5a7080', font: 28 }), GL('#e6eef0', 0.6), -0.03, 0, 0);
  cy(0.02, 0.02, 0.035, P('#c9c3b8', 0.25, 0.4), -0.03, 0.15, 0, 16);
  labeled(0.022, 0.024, 0.11, label('milk', { bg: '#f6efe6', text: 'MILK', fg: '#a07a60', font: 34 }), P('#f6efe6', 0.3), 0.035, 0, 0.01);
  cy(0.016, 0.016, 0.03, P('#c9c3b8', 0.25, 0.4), 0.035, 0.11, 0.01, 16);
};
K.dryer = () => {
  const b = P('#e9e6e1', 0.3);
  const body = cy(0.04, 0.045, 0.2, b, 0, 0.03, 0, 20); body.rotation.z = PI / 2;
  const noz = cy(0.03, 0.04, 0.05, P('#4a4a4a', 0.5), 0.12, 0.105, 0, 16); noz.rotation.z = PI / 2;
  cy(0.042, 0.042, 0.006, P('#3a3a3a', 0.6), -0.1, 0.127, 0, 20).rotation.z = PI / 2;
  const hd = bx(0.035, 0.11, 0.03, b, -0.02, 0.0, 0, 0.012); hd.rotation.z = -0.25;
  tb([[-0.035, 0.005, 0], [-0.08, 0.004, 0.04], [-0.06, 0.004, 0.1], [0.02, 0.004, 0.09]], 0.004, P('#222', 0.6));
};
K.hairbrush = () => {
  const wd = WOOD('walnut');
  bx(0.075, 0.018, 0.12, wd, 0, 0.0, 0.05, 0.02);
  bx(0.025, 0.014, 0.12, wd, 0, 0.002, -0.07, 0.006);
  bx(0.065, 0.006, 0.105, P('#1d1d1d', 0.8), 0, 0.018, 0.05, 0.01);
  const pins = new THREE.InstancedMesh(cg('pin', () => new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 5)), P('#e2d7c5', 0.6), 48);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) { m4.makeTranslation(-0.025 + i * 0.01, 0.03, 0.01 + j * 0.011); pins.setMatrixAt(k++, m4); }
  G.add(pins);
};
K.razor = () => {
  bx(0.06, 0.008, 0.06, CHROME(), 0, 0, 0, 0.004);
  cy(0.004, 0.004, 0.1, CHROME(), 0, 0.008, -0.015, 8);
  to(0.018, 0.003, CHROME(), 0, 0.105, -0.015, PI, 6, 16);
  cy(0.008, 0.007, 0.1, P('#2c3e50', 0.4), 0.0, 0.03, 0.012, 12);
  const hd = bx(0.045, 0.014, 0.012, P('#2c3e50', 0.4), 0, 0.128, 0.012, 0.004);
  bx(0.04, 0.008, 0.004, CHROME(), 0, 0.131, 0.019, 0.001);
};
K.cottonswab = () => {
  jar(0, 0, 0.035, 0.1, GL('#eef4f2', 0.3), P('#d8d2c6', 0.3, 0.5));
  const st = new THREE.InstancedMesh(cg('swab', () => new THREE.CylinderGeometry(0.0015, 0.0015, 0.075, 5)), P('#f4f2ee', 0.8), 40);
  const tip = new THREE.InstancedMesh(cg('swabt', () => new THREE.SphereGeometry(0.004, 6, 5)), P('#ffffff', 0.95), 80);
  const r = rnd(3), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU, d = r() * 0.026, y = 0.01 + (i % 5) * 0.015;
    q.setFromEuler(new THREE.Euler(PI / 2, 0, a));
    m4.compose(V3(Math.cos(a) * d * 0.3, y, Math.sin(a) * d * 0.3), q, V3(1, 1, 1)); st.setMatrixAt(i, m4);
    const dir = V3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.037);
    m4.makeTranslation(Math.cos(a) * d * 0.3 + dir.x, y, Math.sin(a) * d * 0.3 + dir.z); tip.setMatrixAt(i * 2, m4);
    m4.makeTranslation(Math.cos(a) * d * 0.3 - dir.x, y, Math.sin(a) * d * 0.3 - dir.z); tip.setMatrixAt(i * 2 + 1, m4);
  }
  G.add(st, tip);
};
K.handmirror = () => {
  const fr = P('#e8d6c3', 0.35);
  // 立てた丸い鏡（うしろの脚で支える）
  const g = new THREE.Group(); G.add(g);
  const prev = G; G = g;
  cy(0.07, 0.07, 0.012, fr, 0, -0.006, 0, 32).rotation.x = PI / 2;
  const mir = cy(0.062, 0.062, 0.002, MET('#e8eef0', 0.04), 0, 0.001, 0, 32); mir.rotation.x = PI / 2;
  bx(0.02, 0.09, 0.012, fr, 0, -0.16, 0, 0.005);
  G = prev;
  g.rotation.x = -0.25; g.position.set(0, 0.16, 0.02);
  bx(0.01, 0.14, 0.01, fr, 0, 0, -0.04, 0.003).rotation.x = 0.35;
};
K.bathsalt = () => {
  jar(0, 0, 0.045, 0.11, GL('#f2f6f5', 0.25), WOOD('oak'), P('#e9b3b8', 0.8), 0.08);
  const sc = bx(0.012, 0.004, 0.07, WOOD('oak'), 0.07, 0, 0.02, 0.002); sc.rotation.y = 0.6;
  sp(0.012, WOOD('oak'), 0.05, 0.008, 0.048, 1, 0.5, 1);
};
K.duck = (s) => {
  const y = P(s.color || '#f7cf2e', 0.35);
  sp(0.045, y, 0, 0.035, 0, 1.15, 0.8, 0.95, 20, 14);
  sp(0.03, y, 0, 0.085, 0.025, 1, 1, 1, 18, 12);
  const bk = sp(0.016, P('#f08a24', 0.4), 0, 0.08, 0.055, 1.2, 0.5, 1, 12, 8);
  sp(0.004, P('#111', 0.2), -0.014, 0.093, 0.046); sp(0.004, P('#111', 0.2), 0.014, 0.093, 0.046);
  const tl = sp(0.02, y, 0, 0.06, -0.045, 0.8, 0.8, 1.1, 12, 8); tl.rotation.x = -0.6;
};
K.bathbomb = () => {
  const fr = faceMat('bomb', (x, w, h) => {
    x.fillStyle = '#e9dccb'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7d5a8c'; x.font = 'bold 24px Arial'; x.textAlign = 'center'; x.fillText('BATH', 64, 50);
    x.font = '14px Arial'; x.fillText('lavender', 64, 72);
    x.fillStyle = '#b79cc4'; x.beginPath(); x.arc(64, 100, 12, 0, TAU); x.fill();
  });
  faced(0.13, 0.05, 0.09, P('#e9dccb', 0.7), fr, 0, 0, 0);
  sp(0.025, P('#c7a6d4', 0.9), -0.03, 0.073, 0); sp(0.025, P('#f2c3c9', 0.9), 0.03, 0.073, 0.005);
};
K.diffuser = () => {
  las([[0.001, 0], [0.04, 0], [0.045, 0.04], [0.035, 0.09], [0.012, 0.11], [0.012, 0.12]], GL('#a8774a', 0.55), 0, 0, 0, 24);
  cy(0.036, 0.042, 0.03, LIQ('#a8641e', 0.6), 0, 0.004, 0, 18);
  const r = rnd(5);
  for (let i = 0; i < 7; i++) { const st = cy(0.0018, 0.0018, 0.28, P('#3d2a1c', 0.8), 0, 0.09, 0, 5); const a = i / 7 * TAU; st.rotation.set(Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22); st.position.set(Math.cos(a) * 0.02, 0.22, Math.sin(a) * 0.02); }
};
K.perfume = () => {
  bx(0.065, 0.075, 0.035, GL('#f3d9e2', 0.45), 0, 0, 0, 0.006);
  bx(0.055, 0.045, 0.026, LIQ('#f2a8c0', 0.5), 0, 0.005, 0, 0.004);
  cy(0.008, 0.008, 0.012, BRASS(), 0, 0.075, 0, 12);
  bx(0.03, 0.026, 0.03, BRASS(), 0, 0.087, 0, 0.004);
};
K.cottonjar = () => {
  jar(0, 0, 0.045, 0.12, GL('#eef4f2', 0.28), CHROME());
  const r = rnd(9);
  for (let i = 0; i < 14; i++) sp(0.016, P('#ffffff', 1), (r() - 0.5) * 0.05, 0.02 + (i % 5) * 0.018, (r() - 0.5) * 0.05, 1, 0.8, 1, 8, 6);
};
K.mouthwash = () => {
  labeled(0.035, 0.035, 0.2, label('mw', { bg: '#3a8fc9', lbg: '#ffffff', text: 'FRESH', sub: 'mouthwash', fg: '#1d5f8f', font: 28 }), LIQ('#2b86c9', 0.8), 0, 0, 0);
  las([[0.035, 0.2], [0.03, 0.22], [0.016, 0.235]], LIQ('#2b86c9', 0.8), 0, 0, 0, 20);
  cy(0.018, 0.018, 0.03, P('#ffffff', 0.35), 0, 0.235, 0, 16);
};
K.detergent = () => {
  const lab = faceMat('det', (x, w, h) => {
    x.fillStyle = '#e8eef3'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2e6db4'; x.beginPath(); x.arc(64, 54, 30, 0, TAU); x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('CLEAN', 64, 60);
    x.fillStyle = '#2e6db4'; x.font = 'bold 15px Arial'; x.fillText('LAUNDRY', 64, 110);
  });
  faced(0.13, 0.22, 0.08, P('#e8eef3', 0.3), lab, 0, 0, 0);
  bx(0.03, 0.06, 0.03, P('#e8eef3', 0.3), 0.04, 0.22, 0, 0.008);
  cy(0.022, 0.022, 0.035, P('#2e6db4', 0.35), -0.03, 0.22, 0, 16);
  to(0.025, 0.008, P('#e8eef3', 0.3), 0.04, 0.24, 0, PI, 8, 12).rotation.y = PI / 2;
};
K.softener = () => {
  const lab = faceMat('soft', (x, w, h) => {
    x.fillStyle = '#f6dfe6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8a5b9'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(64 + Math.cos(i * 1.26) * 16, 56 + Math.sin(i * 1.26) * 16, 10, 0, TAU); x.fill(); }
    x.fillStyle = '#9a4f66'; x.font = 'bold 16px Arial'; x.textAlign = 'center'; x.fillText('SOFT', 64, 108);
  });
  // 詰めかえのパウチ（下が広い）
  const g = faced(0.12, 0.2, 0.05, P('#f6dfe6', 0.4), lab, 0, 0, 0); g.scale.set(1, 1, 1);
  const tp = bx(0.12, 0.03, 0.01, P('#f6dfe6', 0.4), 0, 0.2, 0, 0.002);
  cy(0.012, 0.012, 0.02, P('#ffffff', 0.4), 0.035, 0.22, 0, 12);
};
K.pinbasket = () => {
  const w = wicker('#d9c3a0');
  bx(0.18, 0.07, 0.12, w, 0, 0, 0, 0.01);
  bx(0.17, 0.004, 0.11, P('#cdb48c', 0.9), 0, 0.03, 0, 0);
  const cols = ['#e86a5a', '#f2c84b', '#5ab4c9', '#8cc46a', '#f2f2f2'];
  const r = rnd(11);
  for (let i = 0; i < 16; i++) { const pin = bx(0.01, 0.055, 0.008, P(cols[i % 5], 0.4), -0.07 + r() * 0.14, 0.04, -0.045 + r() * 0.09, 0.002); pin.rotation.set(r() - 0.5, r() * PI, r() * 1.5 + 0.5); }
};

// ───────── 台所・食器 ─────────
K.plates = (s) => {
  const c = CER(s.color || '#f4f1ea');
  for (let i = 0; i < 6; i++) la([[0.001, 0], [0.07, 0], [0.09, 0.012], [0.12, 0.016], [0.125, 0.02], [0.118, 0.02], [0.088, 0.016], [0.07, 0.006], [0.001, 0.006]], c, 0, i * 0.017, 0, 32);
  if (s.rim) for (let i = 0; i < 6; i++) to(0.121, 0.0015, P(s.rim, 0.3), 0, i * 0.017 + 0.0195, 0, TAU, 4, 40).rotation.x = PI / 2;
};
K.chawan = () => {
  const bowl = (x, z, c, inC) => {
    las([[0.001, 0], [0.028, 0], [0.03, 0.008], [0.055, 0.03], [0.062, 0.06], [0.058, 0.06], [0.05, 0.03], [0.001, 0.012]], CER(c), x, 0, z, 28);
    cy(0.028, 0.03, 0.008, CER(inC), x, 0, z, 20);
  };
  bowl(-0.06, 0, '#3f4f63', '#3f4f63');
  bowl(0.065, 0.01, '#e9e2d3', '#c9b89b');
  to(0.06, 0.003, P('#2d3a4a', 0.3), -0.06, 0.059, 0, TAU, 4, 28).rotation.x = PI / 2;
};
K.mug = (s) => {
  const c = CER(s.color || '#e9e2d6');
  las([[0.001, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.095], [0.038, 0.095], [0.038, 0.012], [0.001, 0.012]], c, 0, 0, 0, 28);
  const h = to(0.026, 0.006, c, 0.045, 0.05, 0, PI, 6, 14); h.rotation.z = -PI / 2;
  cy(0.037, 0.037, 0.002, P('#3b2414', 0.1), 0, 0.075, 0, 20);
};
K.glasses = () => {
  for (const [x, z, h] of [[-0.04, 0, 0.11], [0.04, 0.02, 0.09]]) {
    las([[0.001, 0], [0.032, 0], [0.034, 0.01], [0.037, h]], GL('#eaf3f1', 0.3), x, 0, z, 24);
    cy(0.031, 0.031, 0.008, GL('#dfeeee', 0.6), x, 0, z, 20);
  }
  cy(0.033, 0.035, 0.05, LIQ('#cfe9ef', 0.35), 0.04, 0.008, 0.02, 20);
};
K.petbottle = () => {
  const lab = label('pet', { bg: '#dbe9f2', lbg: '#2f7fc0', text: 'WATER', sub: 'natural mineral', fg: '#ffffff', area: [0.05, 0.95], font: 34 });
  for (const [x, z] of [[-0.04, 0], [0.04, 0.01]]) {
    las([[0.001, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.15], [0.03, 0.19], [0.015, 0.21], [0.014, 0.215]], GL('#e8f4fa', 0.35), x, 0, z, 20);
    cy(0.034, 0.034, 0.18, LIQ('#d8eef8', 0.25), x, 0.004, z, 18);
    labeled(0.0365, 0.0365, 0.05, lab, GL('#e8f4fa', 0.05), x, 0.06, z, 20);
    cy(0.015, 0.015, 0.02, P('#2f7fc0', 0.4), x, 0.215, z, 14);
  }
};
K.tetsubin = () => {
  const ir = P('#2c2a28', 0.65, 0.4);
  las([[0.001, 0], [0.06, 0.004], [0.085, 0.04], [0.088, 0.07], [0.07, 0.11], [0.04, 0.125], [0.03, 0.125]], ir, 0, 0, 0, 28);
  cy(0.034, 0.034, 0.01, ir, 0, 0.125, 0, 18); sp(0.01, ir, 0, 0.14, 0, 1, 0.8, 1);
  const spt = cy(0.008, 0.014, 0.07, ir, 0.09, 0.07, 0, 10); spt.rotation.z = -0.9; spt.position.set(0.1, 0.095, 0);
  // あられ模様のつぶ
  const dots = new THREE.InstancedMesh(cg('arare', () => new THREE.SphereGeometry(0.003, 5, 4)), ir, 60);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 15; i++) { const a = i / 15 * TAU + j * 0.2, y = 0.05 + j * 0.016, r = 0.087 - Math.abs(j - 1) * 0.006; m4.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r); dots.setMatrixAt(k++, m4); }
  G.add(dots);
  tb([[-0.06, 0.12, 0], [-0.05, 0.2, 0], [0, 0.23, 0], [0.05, 0.2, 0], [0.06, 0.12, 0]], 0.006, ir);
};
K.kettle = () => {
  const st = MET('#d8d8d6', 0.18);
  las([[0.001, 0], [0.09, 0], [0.095, 0.02], [0.085, 0.12], [0.05, 0.16], [0.03, 0.165]], st, 0, 0, 0, 28);
  sp(0.015, P('#1d1d1d', 0.4), 0, 0.172, 0, 1, 0.6, 1);
  const spt = cy(0.008, 0.016, 0.1, st, 0, 0, 0, 10); spt.rotation.z = -1.0; spt.position.set(0.11, 0.1, 0);
  tb([[-0.05, 0.15, 0], [-0.03, 0.24, 0], [0.03, 0.24, 0], [0.05, 0.15, 0]], 0.008, P('#1d1d1d', 0.4));
};
K.fryingpan = () => {
  las([[0.001, 0], [0.1, 0], [0.12, 0.04], [0.113, 0.04], [0.095, 0.006], [0.001, 0.006]], P('#2a2a2b', 0.4, 0.5), 0, 0, 0, 32);
  cy(0.1, 0.1, 0.002, P('#3a3a3c', 0.6), 0, 0.006, 0, 28);
  const h = bx(0.18, 0.016, 0.026, WOOD('walnut'), 0.21, 0.03, 0, 0.007); h.rotation.z = 0.12;
  bx(0.04, 0.012, 0.02, MET('#bdbdbd'), 0.13, 0.03, 0, 0.003).rotation.z = 0.2;
};
K.saucepan = () => {
  const st = MET('#d2d2d0', 0.2);
  las([[0.001, 0], [0.08, 0], [0.082, 0.09], [0.078, 0.09], [0.076, 0.004], [0.001, 0.004]], st, 0, 0, 0, 28);
  las([[0.084, 0], [0.06, 0.02], [0.012, 0.03], [0.001, 0.03]], GL('#e6efee', 0.4), 0, 0.09, 0, 28);
  sp(0.012, P('#1f1f1f', 0.4), 0, 0.125, 0, 1.2, 0.6, 1.2);
  const h = bx(0.15, 0.018, 0.026, P('#1f1f1f', 0.45), 0.16, 0.07, 0, 0.008); h.rotation.z = 0.15;
};
K.donabe = () => {
  const clay = P('#4a3a30', 0.75), glaze = P('#d8c8a8', 0.6);
  las([[0.001, 0], [0.09, 0], [0.115, 0.05], [0.12, 0.08], [0.112, 0.08]], clay, 0, 0, 0, 28);
  for (const s of [-1, 1]) bx(0.03, 0.015, 0.05, clay, s * 0.13, 0.06, 0, 0.006);
  las([[0.118, 0], [0.105, 0.03], [0.06, 0.06], [0.02, 0.066], [0.001, 0.066]], glaze, 0, 0.08, 0, 28);
  cy(0.016, 0.02, 0.02, glaze, 0, 0.145, 0, 14);
};
K.saltpepper = () => {
  for (const [x, c, t] of [[-0.03, '#f2f2f2', 'S'], [0.03, '#3a3a3a', 'P']]) {
    las([[0.001, 0], [0.022, 0], [0.024, 0.07], [0.02, 0.08]], GL('#eef3f2', 0.35), x, 0, 0, 18);
    cy(0.021, 0.021, 0.055, P(c, 0.9), x, 0.004, 0, 16);
    las([[0.021, 0], [0.022, 0.015], [0.012, 0.03], [0.001, 0.032]], CHROME(), x, 0.078, 0, 18);
  }
};
K.soysauce = () => {
  las([[0.001, 0], [0.03, 0], [0.034, 0.03], [0.03, 0.07], [0.02, 0.085]], GL('#e8e4dc', 0.35), 0, 0, 0, 20);
  las([[0.001, 0], [0.028, 0], [0.032, 0.03], [0.028, 0.055]], LIQ('#2a120a', 0.9), 0, 0.003, 0, 18);
  las([[0.022, 0], [0.024, 0.02], [0.015, 0.035], [0.001, 0.04]], P('#c0392b', 0.35), 0, 0.083, 0, 18);
  const sp2 = cy(0.003, 0.005, 0.03, P('#c0392b', 0.35), 0.015, 0.1, 0, 8); sp2.rotation.z = -0.9; sp2.position.set(0.022, 0.11, 0);
};
K.oliveoil = () => {
  const lab = label('olive', { bg: '#2e3b20', lbg: '#efe6cc', text: 'OLIVE OIL', sub: 'extra virgin', fg: '#3c4a28', font: 24 });
  labeled(0.03, 0.032, 0.2, lab, LIQ('#6e7a1e', 0.85), 0, 0, 0, 20);
  las([[0.03, 0.2], [0.016, 0.24], [0.012, 0.27]], LIQ('#6e7a1e', 0.85), 0, 0, 0, 18);
  cy(0.011, 0.012, 0.025, P('#b88b5a', 0.8), 0, 0.27, 0, 12);
};
K.cuttingboard = () => {
  bx(0.34, 0.022, 0.22, WOOD('oak'), 0, 0, 0, 0.01);
  cy(0.012, 0.012, 0.023, P('#8a6a44', 0.8), -0.15, 0, -0.07, 12);
  const kn = bx(0.17, 0.003, 0.035, MET('#e2e2e2', 0.12), 0.0, 0.022, 0.03, 0.001); kn.rotation.y = 0.2;
  const hd = bx(0.11, 0.016, 0.024, P('#1d1d1d', 0.5), 0.13, 0.022, 0.003, 0.006); hd.rotation.y = 0.2;
  // 切りかけのトマト
  sp(0.03, P('#c8352a', 0.35), -0.08, 0.05, 0.03, 1, 0.85, 1);
};
K.fruitbasket = () => {
  const w = wicker('#a9824e');
  las([[0.001, 0], [0.09, 0], [0.13, 0.05], [0.14, 0.07]], w, 0, 0, 0, 24);
  to(0.14, 0.008, w, 0, 0.07, 0, TAU, 6, 28).rotation.x = PI / 2;
  sp(0.04, P('#b8282a', 0.35), -0.04, 0.07, 0.02); sp(0.04, P('#c93a2c', 0.35), 0.04, 0.07, -0.03);
  sp(0.038, P('#ef8a1e', 0.6), 0.035, 0.08, 0.05); sp(0.037, P('#e88a1a', 0.6), -0.03, 0.1, -0.04);
  const ban = tb([[-0.1, 0.11, 0.02], [-0.04, 0.09, 0.04], [0.03, 0.1, 0.05], [0.09, 0.13, 0.03]], 0.018, P('#f2cd4b', 0.5), 20, 8);
  sp(0.004, P('#4a3a1a'), 0.09, 0.13, 0.03);
};
K.breadbasket = () => {
  const w = wicker('#b58a56');
  bx(0.3, 0.07, 0.18, w, 0, 0, 0, 0.03);
  bx(0.28, 0.004, 0.16, CLOTH('#e9e1d2'), 0, 0.05, 0, 0);
  const crust = P('#b9773b', 0.75);
  const bg = cy(0.03, 0.03, 0.32, crust, 0, 0, 0, 14); bg.rotation.set(0, 0.3, PI / 2 - 0.25); bg.position.set(-0.02, 0.12, -0.02);
  sp(0.04, crust, 0.07, 0.08, 0.04, 1.2, 0.75, 1); sp(0.04, P('#c88b48', 0.75), -0.07, 0.08, 0.04, 1.2, 0.75, 1);
};
K.coffeemill = () => {
  const wd = WOOD('walnut');
  bx(0.1, 0.1, 0.1, wd, 0, 0, 0, 0.004);
  bx(0.05, 0.03, 0.006, BRASS(), 0, 0.03, 0.05, 0.002);
  las([[0.04, 0], [0.05, 0.02], [0.052, 0.04], [0.035, 0.05], [0.012, 0.055]], BRASS(), 0, 0.1, 0, 20);
  cy(0.004, 0.004, 0.04, BRASS(), 0, 0.15, 0, 8);
  bx(0.09, 0.006, 0.01, BRASS(), 0.04, 0.185, 0, 0.002);
  cy(0.008, 0.01, 0.03, wd, 0.085, 0.188, 0, 10);
};
K.drippot = () => {
  const st = P('#2b2b2b', 0.35, 0.6);
  las([[0.001, 0], [0.07, 0], [0.072, 0.1], [0.05, 0.13], [0.035, 0.13]], st, 0, 0, 0, 24);
  las([[0.04, 0], [0.03, 0.015], [0.001, 0.02]], st, 0, 0.13, 0, 20);
  sp(0.008, WOOD('walnut'), 0, 0.152, 0);
  tb([[0.06, 0.02, 0], [0.11, 0.06, 0], [0.12, 0.15, 0], [0.15, 0.17, 0]], 0.005, st, 24, 6);
  tb([[-0.065, 0.11, 0], [-0.11, 0.1, 0], [-0.11, 0.04, 0], [-0.068, 0.03, 0]], 0.008, WOOD('walnut'));
};
K.toaster = (s) => {
  const b = P(s.color || '#d9d3c8', 0.3, s.metal ? 0.8 : 0);
  bx(0.26, 0.17, 0.14, b, 0, 0, 0, 0.03);
  for (const z of [-0.025, 0.025]) bx(0.18, 0.004, 0.025, P('#1d1d1d', 0.5), 0, 0.169, z, 0.002);
  bx(0.02, 0.012, 0.02, P('#2a2a2a', 0.5), 0.12, 0.12, 0.07, 0.004);
  cy(0.012, 0.012, 0.01, CHROME(), 0.08, 0.05, 0.07, 14).rotation.x = PI / 2;
  bx(0.24, 0.012, 0.12, P('#2a2a2a', 0.5), 0, 0, 0, 0.004);
};
K.ricecooker = () => {
  const b = P('#f2f0ec', 0.3);
  las([[0.001, 0], [0.12, 0], [0.13, 0.02], [0.13, 0.15], [0.125, 0.16]], b, 0, 0, 0, 28);
  las([[0.126, 0], [0.11, 0.04], [0.06, 0.055], [0.001, 0.058]], b, 0, 0.16, 0, 28);
  bx(0.09, 0.05, 0.02, SCREEN('#1c2228', '#7fd0ff', 0.4), 0, 0.07, 0.125, 0.005).rotation.x = -0.15;
  bx(0.06, 0.02, 0.04, P('#c9c4bb', 0.4), 0, 0.2, -0.08, 0.008);
};
K.microwave = () => {
  const b = P('#e9e7e2', 0.35);
  bx(0.48, 0.28, 0.36, b, 0, 0, 0, 0.012);
  bx(0.34, 0.22, 0.01, SCREEN('#1b1f22'), -0.05, 0.03, 0.18, 0.006);
  bx(0.1, 0.22, 0.01, P('#d9d6d0', 0.4), 0.18, 0.03, 0.18, 0.004);
  bx(0.06, 0.02, 0.004, SCREEN('#1b1f22', '#5ae07a', 0.6), 0.18, 0.21, 0.186, 0.002);
  for (let i = 0; i < 3; i++) cy(0.012, 0.012, 0.006, P('#b8b4ac', 0.4), 0.18, 0.14 - i * 0.035, 0.186, 14).rotation.x = PI / 2;
  bx(0.012, 0.16, 0.02, CHROME(), 0.115, 0.06, 0.195, 0.004);
};
K.canisters = () => {
  const fills = [['#e3c48a', 0.17], ['#a9502c', 0.12], ['#f1ece0', 0.09]];
  fills.forEach(([c, h], i) => jar(-0.08 + i * 0.08, i === 1 ? 0.01 : 0, 0.035, h, GL('#eef3f2', 0.28), WOOD('oak'), P(c, 0.85), h * 0.75));
};
K.honey = () => {
  las([[0.001, 0], [0.04, 0], [0.046, 0.04], [0.04, 0.085], [0.03, 0.09]], GL('#f6e9c8', 0.35), 0, 0, 0, 22);
  las([[0.001, 0], [0.038, 0], [0.043, 0.04], [0.037, 0.07]], LIQ('#d9921c', 0.85), 0, 0.003, 0, 20);
  cy(0.035, 0.035, 0.008, CLOTH('#c94a3a'), 0, 0.09, 0, 20);
  const dp = cy(0.004, 0.004, 0.13, WOOD('oak'), 0, 0, 0, 8); dp.rotation.z = -0.5; dp.position.set(0.03, 0.12, 0);
  for (let i = 0; i < 3; i++) to(0.009, 0.003, WOOD('oak'), -0.002 + i * 0.006, 0.07 + i * 0.009, 0, TAU, 5, 10).rotation.set(PI / 2, 0.5, 0);
};
K.kyusu = () => {
  const c = CER('#6b7f5e');
  las([[0.001, 0], [0.04, 0], [0.058, 0.03], [0.055, 0.06], [0.035, 0.07]], c, 0, 0, 0, 24);
  las([[0.036, 0], [0.02, 0.012], [0.001, 0.016]], c, 0, 0.07, 0, 18); sp(0.007, c, 0, 0.088, 0);
  const sp2 = cy(0.006, 0.012, 0.05, c, 0, 0, 0, 10); sp2.rotation.z = -0.9; sp2.position.set(0.07, 0.045, 0);
  const hd = cy(0.01, 0.012, 0.08, c, 0, 0, 0, 10); hd.rotation.set(0, 0, PI / 2); hd.position.set(0, 0.04, 0); hd.rotation.y = PI / 2; hd.position.set(0, 0.04, -0.09);
  for (const x of [-0.07, 0.08]) { las([[0.001, 0], [0.028, 0], [0.032, 0.07], [0.029, 0.07], [0.026, 0.006], [0.001, 0.006]], CER('#e6dccb'), x, 0, 0.07, 20); cy(0.026, 0.026, 0.002, LIQ('#a8a03a', 0.8), x, 0.05, 0.07, 16); }
};
K.wine = () => {
  const lab = label('wine', { bg: '#2b1018', lbg: '#efe6d4', text: 'Vin Rouge', sub: '2019', fg: '#5a1a28', font: 26 });
  labeled(0.037, 0.037, 0.2, lab, P('#2b1018', 0.15), -0.03, 0, 0, 22);
  las([[0.037, 0.2], [0.03, 0.24], [0.014, 0.26], [0.014, 0.31]], P('#2b1018', 0.15), -0.03, 0, 0, 20);
  cy(0.015, 0.015, 0.04, P('#6a1020', 0.4, 0.4), -0.03, 0.28, 0, 14);
  for (const [x, z] of [[0.06, 0.03], [0.1, -0.03]]) {
    cy(0.03, 0.032, 0.003, GL('#eef4f2', 0.4), x, 0, z, 20);
    cy(0.003, 0.003, 0.09, GL('#eef4f2', 0.5), x, 0.003, z, 8);
    las([[0.003, 0], [0.03, 0.03], [0.035, 0.07], [0.03, 0.1]], GL('#eef4f2', 0.3), x, 0.09, z, 22);
    las([[0.003, 0], [0.026, 0.025], [0.029, 0.04]], LIQ('#5a0f1c', 0.85), x, 0.093, z, 18);
  }
};

// ───────── 机・勉強 ─────────
K.notebooks = () => {
  const cols = ['#2f4a6b', '#c9a04a', '#e9e4da', '#8a3a32', '#5d7a5a'];
  let y = 0;
  cols.forEach((c, i) => { const n = bx(0.18, 0.008, 0.25, P(c, 0.75), (i % 2 ? 0.006 : -0.004), y, (i % 3 - 1) * 0.004, 0.002); n.rotation.y = (i - 2) * 0.04; bx(0.176, 0.006, 0.244, P('#f6f2e8', 0.9), (i % 2 ? 0.008 : -0.002), y + 0.001, (i % 3 - 1) * 0.004).rotation.y = (i - 2) * 0.04; y += 0.008; });
};
K.penstand = (s) => {
  const c = s.mat === 'mesh' ? P('#1f1f1f', 0.5, 0.6) : CER(s.color || '#d8cfc0');
  cy(0.04, 0.038, 0.1, c, 0, 0, 0, 22, true); cy(0.038, 0.038, 0.004, c, 0, 0, 0, 22);
  const cols = ['#1d1d1d', '#c0392b', '#2e6db4', '#f2c84b', '#e9e4da', '#5a8a5a'];
  const r = rnd(21);
  cols.forEach((col, i) => {
    const a = i / cols.length * TAU, rr = 0.018;
    const p = cy(0.0045, 0.0045, 0.15, P(col, 0.35), Math.cos(a) * rr, 0.02, Math.sin(a) * rr, 8);
    p.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    if (i % 2) cy(0.0045, 0.0045, 0.03, P('#e2e2e2', 0.2, 0.8), Math.cos(a) * rr * 1.9, 0.165, Math.sin(a) * rr * 1.9, 8).rotation.copy(p.rotation);
  });
  const sc = bx(0.012, 0.13, 0.004, MET('#cfcfcf', 0.2), -0.02, 0.02, 0.012, 0.002); sc.rotation.z = 0.2;
};
K.handheld = (s) => {
  const b = P(s.color || '#d9d5ce', 0.35);
  bx(0.2, 0.022, 0.09, b, 0, 0, 0, 0.02);
  bx(0.1, 0.002, 0.062, SCREEN('#0e1216', '#24456a', 0.25), 0, 0.022, 0, 0);
  bx(0.024, 0.004, 0.008, P('#2a2a2a', 0.4), -0.075, 0.022, 0.01, 0.002); bx(0.008, 0.004, 0.024, P('#2a2a2a', 0.4), -0.075, 0.022, 0.01, 0.002);
  [[0.068, 0.012, '#c0392b'], [0.082, 0.0, '#2e6db4'], [0.068, -0.012, '#f2c84b'], [0.054, 0.0, '#5a8a5a']].forEach(([x, z, c]) => cy(0.0045, 0.0045, 0.004, P(c, 0.35), x, 0.022, z, 10));
  cy(0.007, 0.007, 0.005, P('#2a2a2a', 0.5), -0.075, 0.022, -0.022, 14);
};
K.smartphone = (s) => {
  bx(0.075, 0.008, 0.155, P(s.color || '#2a2c30', 0.3, 0.5), 0, 0, 0, 0.008);
  bx(0.069, 0.001, 0.149, SCREEN('#0b0d10', '#1d3550', 0.35), 0, 0.008, 0, 0);
  bx(0.02, 0.001, 0.004, P('#111', 0.4), 0, 0.009, -0.07, 0.0005);
};
const keyTex = (key, bg, kc) => faceMat('kb' + key, (x, w, h) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  const rows = 5, cols = 14, kw = w / cols, kh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r === 4 && c > 3 && c < 10) { if (c === 4) { x.fillStyle = kc; x.fillRect(4 * kw + 2, r * kh + 2, 6 * kw - 4, kh - 4); } continue; }
    x.fillStyle = kc; x.fillRect(c * kw + 2, r * kh + 2, kw - 4, kh - 4);
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(c * kw + 2, r * kh + kh - 5, kw - 4, 3);
  }
}, 448, 160);
K.keyboard = (s) => {
  const dark = s.color !== 'light';
  const top = keyTex(dark ? 'd' : 'l', dark ? '#1b1b1d' : '#d8d5cf', dark ? '#2e2e31' : '#f4f2ee');
  const body = P(dark ? '#1b1b1d' : '#d8d5cf', 0.4);
  const k = faced(0.36, 0.02, 0.12, body, body, 0, 0, 0, top); k.rotation.x = 0.04;
};
K.mouse = (s) => {
  const m = sp(0.035, P(s.color || '#efeeea', 0.35), 0, 0.0, 0, 0.9, 0.55, 1.5, 18, 12); m.position.y = 0.002;
  bx(0.002, 0.012, 0.03, P('#9a9a9a', 0.4), 0, 0.012, 0.025, 0.001);
  cy(0.003, 0.003, 0.008, P('#555', 0.4), 0, 0.016, 0.028, 8).rotation.x = PI / 2;
};
K.laptop = (s) => {
  const al = MET(s.color || '#c9cbcd', 0.3);
  bx(0.31, 0.012, 0.215, al, 0, 0, 0, 0.006);
  bx(0.27, 0.001, 0.09, keyTex('lap', '#c9cbcd', '#2a2b2d'), 0, 0.012, -0.03, 0);
  bx(0.1, 0.001, 0.06, P('#bfc1c3', 0.35, 0.6), 0, 0.012, 0.065, 0);
  const lid = new THREE.Group(); G.add(lid); const prev = G; G = lid;
  bx(0.31, 0.205, 0.006, al, 0, 0, 0, 0.005);
  bx(0.29, 0.18, 0.001, SCREEN('#0d1117', '#2b4b6e', 0.4), 0, 0.012, 0.0035, 0);
  G = prev;
  lid.position.set(0, 0.012, -0.105); lid.rotation.x = -0.32;
};
K.monitor = () => {
  const blk = P('#1f2022', 0.4, 0.3);
  bx(0.2, 0.008, 0.15, blk, 0, 0, 0, 0.004);
  bx(0.03, 0.22, 0.02, blk, 0, 0.008, -0.04, 0.006);
  bx(0.55, 0.33, 0.025, blk, 0, 0.11, -0.02, 0.006);
  bx(0.535, 0.305, 0.001, SCREEN('#0c1218', '#3a5f86', 0.45), 0, 0.122, -0.007, 0);
};
K.digiclock = () => {
  const disp = faceMat('clock', (x, w, h) => {
    x.fillStyle = '#121212'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff7a3c'; x.font = 'bold 44px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('07:30', w / 2, h / 2);
  }, 256, 96);
  disp.emissive = new THREE.Color('#ffffff'); disp.emissiveMap = disp.map; disp.emissiveIntensity = 0.6;
  faced(0.16, 0.06, 0.06, WOOD('oak'), disp, 0, 0, 0);
};
K.calculator = () => {
  bx(0.085, 0.012, 0.15, P('#2b2c2e', 0.45), 0, 0, 0, 0.006);
  bx(0.068, 0.001, 0.028, SCREEN('#b7c0a8'), 0, 0.012, -0.05, 0);
  const keys = new THREE.InstancedMesh(cg('ck', () => new RoundedBoxGeometry(0.013, 0.004, 0.011, 1, 0.002)), P('#e2e0dc', 0.5), 20);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { m4.makeTranslation(-0.025 + c * 0.0167, 0.014, -0.018 + r * 0.019); keys.setMatrixAt(k++, m4); }
  keys.castShadow = true; G.add(keys);
};
K.headphones = (s) => {
  const c = P(s.color || '#2a2a2c', 0.45);
  // スタンド
  cy(0.05, 0.055, 0.01, WOOD('walnut'), 0, 0, 0, 22);
  cy(0.007, 0.007, 0.22, WOOD('walnut'), 0, 0.01, 0, 10);
  bx(0.09, 0.012, 0.03, WOOD('walnut'), 0, 0.225, 0, 0.006);
  tb([[-0.075, 0.12, 0], [-0.078, 0.2, 0], [-0.05, 0.245, 0], [0, 0.255, 0], [0.05, 0.245, 0], [0.078, 0.2, 0], [0.075, 0.12, 0]], 0.009, c, 30);
  for (const sg of [-1, 1]) { const cup = cy(0.042, 0.042, 0.03, c, sg * 0.085, 0, 0, 22); cup.rotation.z = PI / 2; cup.position.set(sg * 0.085, 0.11, 0); const pad = cy(0.036, 0.036, 0.012, CLOTH('#3a3a3c'), sg * 0.068, 0, 0, 20); pad.rotation.z = PI / 2; pad.position.set(sg * 0.066, 0.11, 0); }
};
K.memo = () => {
  bx(0.09, 0.03, 0.09, P('#f7f3e8', 0.9), -0.05, 0, 0, 0.002);
  const cols = ['#f9e27a', '#f6a8b6', '#9ed3e8', '#b8e09a'];
  cols.forEach((c, i) => { const n = bx(0.075, 0.012, 0.075, P(c, 0.85), 0.06, i * 0.012, 0.0, 0.001); n.rotation.y = i * 0.12 - 0.2; });
  const pen = cy(0.004, 0.004, 0.14, P('#1d1d1d', 0.35), -0.05, 0.03, 0.06, 8); pen.rotation.set(0, 0.4, PI / 2); pen.position.y = 0.034;
};
K.refbooks = () => {
  const data = [['#1f3c5a', 0.045, 0.26], ['#e9e4da', 0.03, 0.24], ['#8a2a2a', 0.04, 0.25], ['#3d5a45', 0.035, 0.22], ['#c9a04a', 0.025, 0.21]];
  let y = 0;
  data.forEach(([c, t, w], i) => { book(w, t, 0.18, c, (i % 2 ? 0.01 : -0.008), y, 0, (i - 2) * 0.05); y += t; });
};
K.pencase = (s) => {
  const c = CLOTH(s.color || '#5a6a7a');
  const p = cy(0.035, 0.035, 0.2, c, 0, 0, 0, 18); p.rotation.z = PI / 2; p.position.y = 0.033; p.scale.set(1, 1, 1.25);
  const zp = bx(0.19, 0.004, 0.006, MET('#c9c9c9', 0.3), 0, 0.064, 0, 0.002);
  bx(0.018, 0.004, 0.01, MET('#c9c9c9', 0.3), 0.07, 0.066, 0.006, 0.002);
};
K.pencils = () => {
  const cols = ['#f2c84b', '#2f6f4f', '#c0392b'];
  cols.forEach((c, i) => {
    const p = cy(0.0038, 0.0038, 0.17, P(c, 0.5), 0, 0, 0, 6); p.rotation.set(0, (i - 1) * 0.15, PI / 2); p.position.set(0, 0.004, (i - 1) * 0.015);
    const t = cy(0.0038, 0.0005, 0.016, WOOD('pine'), 0, 0, 0, 6); t.rotation.copy(p.rotation); t.position.set(0.093 * Math.cos((i - 1) * 0.15), 0.004, (i - 1) * 0.015 - 0.093 * Math.sin((i - 1) * 0.15));
  });
  bx(0.045, 0.012, 0.022, P('#f4f2ee', 0.8), -0.04, 0, 0.05, 0.002); bx(0.034, 0.0125, 0.0225, P('#2e6db4', 0.5), -0.032, 0, 0.05, 0).scale.set(0.5, 1, 1.01);
};
K.rulers = () => {
  bx(0.3, 0.003, 0.035, GL('#e8f0ee', 0.55), 0, 0, -0.04, 0);
  const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0, 0.09)]);
  tri.holes.push(new THREE.Path([new THREE.Vector2(0.025, 0.02), new THREE.Vector2(0.08, 0.02), new THREE.Vector2(0.025, 0.053)]));
  const g = new THREE.ExtrudeGeometry(tri, { depth: 0.003, bevelEnabled: false });
  const m = add(g, GL('#cfe6f2', 0.6), -0.1, 0.003, 0.06); m.rotation.x = -PI / 2;
  const m2 = add(g, GL('#f2d6cf', 0.6), 0.02, 0.006, 0.07); m2.rotation.set(-PI / 2, 0, 0.4);
  const ruler = faceMat('ruler', (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); x.fillStyle = '#333'; for (let i = 0; i <= 30; i++) x.fillRect(i * (w / 30), 0, 1, i % 5 ? h * 0.25 : h * 0.5); }, 256, 32);
  ruler.transparent = true; const rl = pl(0.3, 0.035, ruler, 0, 0.0032, -0.04); rl.renderOrder = 3;
};
K.filebox = (s) => {
  const c = P(s.color || '#2b2b2d', 0.6);
  // 斜めに切った箱
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.25, 0), new THREE.Vector2(0.25, 0.3), new THREE.Vector2(0.1, 0.3), new THREE.Vector2(0, 0.14)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }); g.translate(-0.125, 0, -0.05);
  const m = add(g, c, 0, 0, 0); m.rotation.y = -PI / 2;
  const cols = ['#e86a5a', '#f2c84b', '#5ab4c9', '#e9e4da'];
  cols.forEach((col, i) => bx(0.004, 0.25 - i * 0.02, 0.22, P(col, 0.7), -0.03 + i * 0.018, 0.01, 0, 0));
};
K.tablet = () => {
  bx(0.12, 0.012, 0.09, P('#e9e6e1', 0.4), 0, 0, -0.03, 0.006);
  const t = new THREE.Group(); G.add(t); const prev = G; G = t;
  bx(0.25, 0.175, 0.007, MET('#bfc1c4', 0.3), 0, 0, 0, 0.008);
  bx(0.235, 0.16, 0.001, SCREEN('#0e1318', '#4a6f8e', 0.4), 0, 0.0075, 0.004, 0);
  G = prev;
  t.rotation.x = -0.35; t.position.set(0, 0.012, 0.0);
};
K.phonestand = () => {
  const al = MET('#c9cbcd', 0.3);
  bx(0.08, 0.008, 0.09, al, 0, 0, 0, 0.004);
  const b = bx(0.07, 0.12, 0.006, al, 0, 0.0, -0.01, 0.003); b.rotation.x = -0.35; b.position.set(0, 0.06, -0.02);
  const ph = new THREE.Group(); G.add(ph); const prev = G; G = ph;
  bx(0.075, 0.155, 0.008, P('#2a2c30', 0.3, 0.5), 0, 0, 0, 0.008);
  bx(0.069, 0.149, 0.001, SCREEN('#0b0d10', '#3d6a8a', 0.5), 0, 0.003, 0.0045, 0);
  G = prev;
  ph.rotation.x = -0.35; ph.position.set(0, 0.012, 0.01);
  bx(0.075, 0.012, 0.012, al, 0, 0.008, 0.03, 0.003);
};
K.deskcal = () => {
  const pg = faceMat('cal', (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c0392b'; x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText('11', 26, 28);
    x.fillStyle = '#333'; x.font = '10px Arial'; x.fillText('NOVEMBER', 80, 24);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { x.fillStyle = c === 0 ? '#c0392b' : '#555'; x.fillText(String(r * 7 + c + 1).slice(0, 2), 12 + c * 17, 50 + r * 15); }
  });
  const g = new THREE.Group(); G.add(g); const prev = G; G = g;
  bx(0.16, 0.11, 0.002, P('#2b2b2d', 0.6), 0, 0, -0.002, 0); faced(0.15, 0.1, 0.002, P('#ffffff', 0.9), pg, 0, 0.005, 0.001);
  G = prev; g.rotation.x = -0.3; g.position.set(0, 0, 0.02);
  const bk = bx(0.16, 0.11, 0.003, P('#2b2b2d', 0.6), 0, 0, -0.05, 0); bk.rotation.x = 0.3; bk.position.set(0, 0.052, -0.05);
  for (const x of [-0.05, 0, 0.05]) to(0.006, 0.0012, MET('#bbb', 0.3), x, 0.106, -0.015, TAU, 4, 10).rotation.y = PI / 2;
};
K.cube = () => {
  const cols = ['#ffffff', '#f2c84b', '#e8362a', '#f08a24', '#2e6db4', '#3aa55a'];
  const face = (c) => faceMat('cube' + c, (x, w, h) => { x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = c; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x.fillRect(4 + i * 41, 4 + j * 41, 37, 37); });
  const m = add(cg('cube', () => new THREE.BoxGeometry(0.057, 0.057, 0.057)), [face(cols[4]), face(cols[5]), face(cols[0]), face(cols[1]), face(cols[2]), face(cols[3])], 0, 0.0285, 0);
  m.rotation.y = 0.5;
};
K.hourglass = () => {
  const wd = WOOD('walnut');
  for (const y of [0, 0.15]) cy(0.045, 0.045, 0.012, wd, 0, y, 0, 6);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; cy(0.004, 0.004, 0.14, wd, Math.cos(a) * 0.036, 0.012, Math.sin(a) * 0.036, 6); }
  las([[0.03, 0], [0.03, 0.02], [0.02, 0.055], [0.004, 0.069], [0.004, 0.071], [0.02, 0.085], [0.03, 0.12], [0.03, 0.138]], GL('#f2f6f4', 0.3), 0, 0.012, 0, 18);
  las([[0.001, 0], [0.028, 0], [0.026, 0.02], [0.01, 0.04], [0.001, 0.045]], P('#e8cf9a', 0.95), 0, 0.012, 0, 16);
  las([[0.001, 0], [0.012, 0], [0.004, 0.018]], P('#e8cf9a', 0.95), 0, 0.105, 0, 12);
};
K.deskfan = (s) => {
  const c = P(s.color || '#e9e4da', 0.35);
  cy(0.06, 0.065, 0.02, c, 0, 0, 0, 22);
  cy(0.008, 0.008, 0.12, c, 0, 0.02, -0.01, 10);
  const head = new THREE.Group(); G.add(head); const prev = G; G = head;
  const mtr = cy(0.03, 0.035, 0.06, c, 0, -0.03, 0, 16); mtr.rotation.x = PI / 2; mtr.position.set(0, 0, -0.03);
  to(0.1, 0.004, CHROME(), 0, 0, 0.01, TAU, 6, 36);
  for (let i = 0; i < 8; i++) { const sp2 = bx(0.2, 0.002, 0.002, CHROME(), 0, 0, 0.03, 0); sp2.rotation.z = i * PI / 8; sp2.position.y = 0; }
  for (let i = 0; i < 3; i++) { const bl = sp(0.04, P('#cfd6d9', 0.3), 0, 0, 0.012, 1, 0.45, 0.12); bl.rotation.z = i * TAU / 3; bl.position.set(Math.cos(i * TAU / 3 + PI / 2) * 0.042, Math.sin(i * TAU / 3 + PI / 2) * 0.042, 0.012); }
  sp(0.014, c, 0, 0, 0.022);
  G = prev; head.position.set(0, 0.15, -0.01);
};
K.minispeaker = (s) => {
  cy(0.045, 0.045, 0.14, CLOTH(s.color || '#6b6f72'), 0, 0.008, 0, 24);
  cy(0.046, 0.046, 0.008, P('#2a2a2a', 0.5), 0, 0, 0, 24);
  cy(0.044, 0.044, 0.008, P('#3a3a3c', 0.5), 0, 0.148, 0, 24);
  sp(0.003, GLOW('#ffffff', 1), 0, 0.156, 0.02, 1, 0.4, 1, 8, 6);
};
K.bookstand = () => {
  const wd = WOOD('oak');
  bx(0.24, 0.012, 0.12, wd, 0, 0, 0, 0.004);
  const bk = bx(0.24, 0.17, 0.012, wd, 0, 0, 0, 0.004); bk.rotation.x = -0.4; bk.position.set(0, 0.085, -0.03);
  bx(0.24, 0.02, 0.012, wd, 0, 0.012, 0.035, 0.004);
  const pages = faceMat('openbook', (x, w, h) => { x.fillStyle = '#f6f1e4'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(60,50,40,0.5)'; for (let p = 0; p < 2; p++) for (let i = 0; i < 12; i++) x.fillRect(8 + p * 66, 14 + i * 9, 52 - (i % 4 === 3 ? 20 : 0), 3); x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(62, 0, 4, h); });
  const ob = faced(0.22, 0.15, 0.012, P('#f6f1e4', 0.9), pages, 0, 0, 0); ob.rotation.x = -0.4; ob.position.set(0, 0.11, 0.0);
};

// ───────── リビング・かざり ─────────
K.aromacandle = (s) => {
  jar(0, 0, 0.045, 0.09, GL(s.glass || '#c9b49a', 0.5), null, P(s.wax || '#efe6d6', 0.8), 0.07);
  const lab = label('aroma' + (s.wax || ''), { bg: 'rgba(0,0,0,0)', lbg: '#f4efe6', text: 'AROMA', sub: s.scent || 'fig & cedar', fg: '#5a4a3a', font: 26 });
  lab.transparent = true; lab.depthWrite = false;
  labeled(0.0455, 0.0455, 0.04, lab, GL('#fff', 0), 0, 0.025, 0, 24);
  cy(0.001, 0.001, 0.012, P('#222'), 0, 0.074, 0, 4);
  flame(0, 0.086, 0, 1);
};
K.tripleframe = () => {
  const fr = P('#d9cbb4', 0.5);
  const imgs = ['img/out-morning.jpg', 'img/out-sunset.jpg', 'img/sky-morning.jpg'];
  imgs.forEach((img, i) => {
    const g = new THREE.Group(); G.add(g); const prev = G; G = g;
    bx(0.11, 0.14, 0.012, fr, 0, 0, 0, 0.003);
    bx(0.085, 0.11, 0.001, photoMat(img), 0, 0.015, 0.0065, 0);
    G = prev;
    g.position.set((i - 1) * 0.112, 0, 0); g.rotation.set(-0.12, (i - 1) * -0.35, 0); g.position.z = Math.abs(i - 1) * 0.02;
  });
  for (const x of [-0.056, 0.056]) cy(0.003, 0.003, 0.13, BRASS(), x, 0, 0.012, 6);
};
K.teddy = (s) => {
  const f = CLOTH(s.color || '#b88a5a'), ln = CLOTH(s.light || '#e6d0b0');
  sp(0.075, f, 0, 0.08, 0, 1, 1.05, 0.9, 18, 14);
  sp(0.045, ln, 0, 0.07, 0.05, 1, 1.1, 0.5);
  sp(0.06, f, 0, 0.2, 0.01, 1, 0.95, 0.95, 18, 14);
  sp(0.026, ln, 0, 0.19, 0.06, 1, 0.8, 0.8); sp(0.008, P('#2a1a12', 0.4), 0, 0.2, 0.08);
  for (const sx of [-1, 1]) { sp(0.022, f, sx * 0.045, 0.25, 0, 1, 1, 0.6); sp(0.012, ln, sx * 0.045, 0.25, 0.008, 1, 1, 0.5); sp(0.006, P('#111', 0.2), sx * 0.022, 0.215, 0.06); const arm = sp(0.025, f, sx * 0.075, 0.1, 0.02, 0.8, 1.6, 0.8); arm.rotation.z = sx * 0.6; const lg = sp(0.03, f, sx * 0.04, 0.025, 0.06, 0.9, 0.8, 1.5); sp(0.02, ln, sx * 0.04, 0.025, 0.105, 1, 1, 0.3); }
  to(0.05, 0.008, CLOTH(s.ribbon || '#a8323a'), 0, 0.15, 0.01, TAU, 6, 20).rotation.x = PI / 2;
};
K.catplush = (s) => {
  const f = CLOTH(s.color || '#8d8a86'), w = CLOTH('#f2eee8');
  sp(0.07, f, 0, 0.055, 0, 1.1, 0.8, 1.3, 18, 12);
  sp(0.055, f, 0, 0.12, 0.07, 1.1, 0.95, 0.95, 18, 12);
  sp(0.03, w, 0, 0.105, 0.115, 1.1, 0.7, 0.5);
  for (const sx of [-1, 1]) { const ear = cy(0.001, 0.022, 0.035, f, sx * 0.032, 0.16, 0.06, 4); ear.rotation.z = -sx * 0.25; sp(0.008, P('#e9c84a', 0.2), sx * 0.022, 0.13, 0.118); sp(0.004, P('#111', 0.2), sx * 0.022, 0.13, 0.124); sp(0.018, w, sx * 0.04, 0.012, 0.09, 1, 0.6, 1.2); }
  sp(0.006, P('#d98a8a', 0.4), 0, 0.115, 0.123);
  tb([[0, 0.05, -0.08], [0.05, 0.03, -0.1], [0.09, 0.03, -0.04], [0.08, 0.03, 0.03]], 0.014, f);
};
K.bunko = () => {
  const cols = ['#e9e1cf', '#c8b28e', '#7a8c74', '#d6c1a8', '#9a5a4a', '#e9e1cf'];
  let y = 0;
  cols.forEach((c, i) => { book(0.105, 0.016, 0.15, c, (i % 2 ? 0.004 : -0.004), y, 0, (i % 3 - 1) * 0.12); y += 0.016; });
};
K.remote = () => {
  bx(0.045, 0.018, 0.17, P('#2a2a2c', 0.45), 0, 0, 0, 0.01);
  cy(0.006, 0.006, 0.004, P('#c0392b', 0.35), 0, 0.018, -0.065, 10);
  const keys = new THREE.InstancedMesh(cg('rk', () => new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 8)), P('#6a6a6e', 0.4), 12);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { m4.makeTranslation(-0.012 + c * 0.012, 0.019, 0.0 + r * 0.014); keys.setMatrixAt(k++, m4); }
  G.add(keys);
  cy(0.013, 0.013, 0.003, P('#4a4a4e', 0.4), 0, 0.018, -0.035, 18);
};
K.tissue = () => {
  const side = faceMat('tissue', (x, w, h) => { x.fillStyle = '#e9e1d2'; x.fillRect(0, 0, w, h); x.strokeStyle = '#b9ab92'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 20 + i * 18); x.bezierCurveTo(40, 10 + i * 18, 80, 30 + i * 18, 128, 20 + i * 18); x.stroke(); } });
  const top = faceMat('tissuetop', (x, w, h) => { x.fillStyle = '#e9e1d2'; x.fillRect(0, 0, w, h); x.fillStyle = '#8a7a64'; x.beginPath(); x.ellipse(64, 64, 44, 12, 0, 0, TAU); x.fill(); });
  const geo = cg('tbox', () => new THREE.BoxGeometry(0.24, 0.08, 0.12));
  add(geo, [side, side, top, side, side, side], 0, 0.04, 0);
  const t = bx(0.06, 0.05, 0.002, P('#ffffff', 1), 0, 0.075, 0, 0.001); t.rotation.set(0.1, 0, 0.2);
  const t2 = bx(0.05, 0.04, 0.002, P('#ffffff', 1), 0.01, 0.075, 0.003, 0.001); t2.rotation.set(-0.15, 0.3, -0.25);
};
K.succulent = (s) => {
  las([[0.001, 0], [0.04, 0], [0.05, 0.06], [0.052, 0.07], [0.047, 0.07], [0.045, 0.06], [0.001, 0.055]], P(s.pot || '#d9d3c8', 0.85), 0, 0, 0, 22);
  cy(0.046, 0.046, 0.004, P('#5a4434', 1), 0, 0.058, 0, 18);
  const leaf = P(s.leaf || '#8fae8a', 0.6);
  const r = rnd(7);
  for (const [cx, cz, n, rr] of [[0, 0, 12, 0.03], [0.025, 0.02, 7, 0.016], [-0.025, 0.015, 6, 0.014]]) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r(), ring = i < n / 2 ? 1 : 0.55;
      const lf = sp(rr * 0.55, leaf, cx + Math.cos(a) * rr * 0.6 * ring, 0.068 + (1 - ring) * rr * 0.6, cz + Math.sin(a) * rr * 0.6 * ring, 0.6, 0.35, 1.1, 8, 6);
      lf.rotation.set(0, -a + PI / 2, 0.0); lf.rotation.x = ring > 0.9 ? 0.5 : 0.9;
    }
  }
};
K.snowglobe = () => {
  cy(0.05, 0.055, 0.04, WOOD('walnut'), 0, 0, 0, 24);
  cy(0.044, 0.044, 0.01, P('#f4f4f6', 0.8), 0, 0.04, 0, 22);
  cy(0.01, 0.006, 0.05, P('#2f5a3a', 0.6), 0, 0.05, 0, 8); las([[0.022, 0], [0.012, 0.025], [0.016, 0.025], [0.006, 0.05], [0.001, 0.06]], P('#2f6a44', 0.7), 0, 0.055, 0, 10);
  bx(0.02, 0.018, 0.016, P('#c94a3a', 0.6), 0.022, 0.05, 0.01, 0.002);
  sp(0.055, GL('#f4fafc', 0.18), 0, 0.09, 0, 1, 1, 1, 24, 18);
  const r = rnd(4);
  for (let i = 0; i < 18; i++) sp(0.0018, P('#ffffff', 1), (r() - 0.5) * 0.07, 0.06 + r() * 0.07, (r() - 0.5) * 0.07, 1, 1, 1, 4, 3);
};
K.shelljar = () => {
  jar(0, 0, 0.05, 0.15, GL('#eef4f2', 0.25), P('#b89a6e', 0.8), P('#e9dcc0', 1), 0.04);
  const r = rnd(12);
  const cols = ['#f2e2d0', '#e9c9b4', '#f6efe6', '#d8b090'];
  for (let i = 0; i < 12; i++) { const sh = sp(0.012, P(cols[i % 4], 0.5), (r() - 0.5) * 0.06, 0.05 + (i % 4) * 0.015, (r() - 0.5) * 0.06, 1, 0.5, 1.3, 8, 6); sh.rotation.set(r() * 3, r() * 3, 0); }
  cy(0.002, 0.002, 0.18, P('#e8dcc4', 1), 0.03, 0.15, 0, 4).rotation.z = 0.4;
};
K.woodtray = () => {
  const wd = WOOD('walnut');
  bx(0.32, 0.01, 0.2, wd, 0, 0, 0, 0.004);
  for (const sz of [-1, 1]) bx(0.32, 0.025, 0.01, wd, 0, 0.01, sz * 0.095, 0.003);
  for (const sx of [-1, 1]) bx(0.01, 0.025, 0.2, wd, sx * 0.155, 0.01, 0, 0.003);
  // コースターとカップ
  cy(0.045, 0.045, 0.004, CLOTH('#cdb89a'), -0.07, 0.01, 0.01, 24);
  las([[0.001, 0], [0.03, 0], [0.04, 0.05], [0.036, 0.05], [0.027, 0.006], [0.001, 0.006]], CER('#f2eee6'), -0.07, 0.014, 0.01, 22);
  cy(0.034, 0.034, 0.002, P('#5a3416', 0.1), -0.07, 0.054, 0.01, 18);
  sp(0.012, P('#7a5a3a', 0.6), 0.06, 0.02, 0.02, 1.4, 0.7, 1); sp(0.012, P('#e9dcc0', 0.6), 0.09, 0.02, -0.02, 1.4, 0.7, 1);
};
K.incense = () => {
  bx(0.2, 0.01, 0.04, WOOD('walnut'), 0, 0, 0, 0.004);
  const st = cy(0.0012, 0.0012, 0.2, P('#5a3a2a', 0.8), 0, 0, 0, 4); st.rotation.z = -0.35; st.position.set(0.04, 0.1, 0);
  sp(0.0018, GLOW('#ff6a2a', 2), 0.074, 0.194, 0, 1, 1, 1, 6, 4);
  for (let i = 0; i < 3; i++) sp(0.012 + i * 0.006, cm('smoke', () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, depthWrite: false })), 0.076 + i * 0.006, 0.215 + i * 0.03, 0, 0.5, 1.5, 0.5, 8, 6);
};
K.musicbox = () => {
  const wd = WOOD('walnut');
  bx(0.14, 0.06, 0.1, wd, 0, 0, 0, 0.004);
  bx(0.12, 0.004, 0.08, CLOTH('#7a2030'), 0, 0.056, 0, 0);
  const lid = new THREE.Group(); G.add(lid); const prev = G; G = lid;
  bx(0.14, 0.012, 0.1, wd, 0, 0, 0.05, 0.004);
  bx(0.1, 0.002, 0.07, MET('#e8eef0', 0.05), 0, -0.001, 0.05, 0);
  G = prev; lid.position.set(0, 0.06, -0.05); lid.rotation.x = -1.9;
  cy(0.012, 0.012, 0.005, BRASS(), 0, 0.064, 0, 16);
  sp(0.01, P('#f2d0d8', 0.5), 0, 0.08, 0, 0.8, 1.2, 0.8);
  bx(0.04, 0.008, 0.008, BRASS(), 0.075, 0.03, 0, 0.002).rotation.y = PI / 2;
};
K.cards = () => {
  const back = faceMat('cardback', (x, w, h) => { x.fillStyle = '#8a2430'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2e6d0'; x.lineWidth = 3; x.strokeRect(6, 6, w - 12, h - 12); for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(6, 6 + i * 16); x.lineTo(w - 6, 22 + i * 16); x.stroke(); } });
  const front = (k, sym, col) => faceMat('card' + k, (x, w, h) => { x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, w, h); x.fillStyle = col; x.font = 'bold 30px serif'; x.fillText(k, 10, 36); x.font = '64px serif'; x.textAlign = 'center'; x.fillText(sym, w / 2, h / 2 + 22); });
  const deck = bx(0.063, 0.018, 0.088, P('#fbf8f1', 0.8), -0.06, 0, 0, 0.002);
  pl(0.063, 0.088, back, -0.06, 0.0185, 0);
  [['A', '♠', '#111'], ['K', '♥', '#c0392b'], ['Q', '♦', '#c0392b'], ['J', '♣', '#111']].forEach(([k, s, c], i) => { const p = pl(0.063, 0.088, front(k, s, c), 0.05, 0.001 + i * 0.0012, 0); p.rotation.y = (i - 1.5) * 0.25; p.position.x = 0.04 + i * 0.012; });
};
K.boardgame = () => {
  const lidTop = faceMat('bgtop', (x, w, h) => {
    x.fillStyle = '#2f5a6e'; x.fillRect(0, 0, w, h);
    const cols = ['#f2c84b', '#e86a5a', '#8cc46a', '#f2efe6'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { if ((i + j) % 2) continue; x.fillStyle = cols[(i * 3 + j) % 4]; x.beginPath(); x.moveTo(20 + i * 18, 24 + j * 16); x.lineTo(29 + i * 18, 16 + j * 16); x.lineTo(38 + i * 18, 24 + j * 16); x.lineTo(29 + i * 18, 32 + j * 16); x.fill(); }
    x.fillStyle = '#f2efe6'; x.font = 'bold 18px Georgia'; x.textAlign = 'center'; x.fillText('ISLANDS', w / 2, h - 12);
  });
  const side = P('#2f5a6e', 0.6);
  const geo = cg('bgbox', () => new THREE.BoxGeometry(0.3, 0.07, 0.3));
  const m = add(geo, [side, side, lidTop, side, side, side], 0, 0.035, 0); m.rotation.y = 0.1;
  sp(0.008, P('#e86a5a', 0.4), 0.17, 0.008, 0.12); cy(0.007, 0.007, 0.02, P('#f2c84b', 0.4), 0.19, 0, 0.09, 10);
};
K.keytray = () => {
  la([[0.001, 0], [0.06, 0], [0.075, 0.015], [0.078, 0.02], [0.072, 0.02], [0.058, 0.006], [0.001, 0.006]], BRASS(), 0, 0, 0, 28);
  const k = (x, z, a) => { to(0.012, 0.0025, MET('#c9c9c9'), x, 0.01, z, TAU, 5, 14).rotation.x = PI / 2; const s2 = bx(0.04, 0.003, 0.009, MET('#c9a35a', 0.3), x + Math.cos(a) * 0.03, 0.009, z - Math.sin(a) * 0.03, 0.001); s2.rotation.y = a; };
  k(-0.015, 0, 0.3); k(0.02, 0.012, 2.4);
  bx(0.035, 0.012, 0.022, P('#7a5a3a', 0.6), 0.02, 0.006, -0.03, 0.005);
};
K.watchstand = () => {
  const wd = WOOD('walnut');
  bx(0.08, 0.012, 0.06, wd, 0, 0, 0, 0.004);
  cy(0.006, 0.006, 0.08, wd, 0, 0.012, 0, 8);
  const pil = cy(0.028, 0.028, 0.05, CLOTH('#3a3a3c'), 0, 0, 0, 18); pil.rotation.z = PI / 2; pil.position.set(0, 0.1, 0); pil.scale.set(1, 1, 0.8);
  const band = to(0.034, 0.007, P('#6b4228', 0.6), 0, 0.1, 0, TAU, 6, 26); band.rotation.y = PI / 2;
  const face = cy(0.02, 0.02, 0.01, MET('#d8d8d8', 0.2), 0, 0.136, 0, 22);
  pl(0.032, 0.032, faceMat('watch', (x, w, h) => { x.fillStyle = '#f4f1ea'; x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill(); x.strokeStyle = '#222'; x.lineWidth = 6; x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 22); x.moveTo(64, 64); x.lineTo(94, 72); x.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.fillStyle = '#333'; x.fillRect(64 + Math.cos(a) * 50 - 2, 64 + Math.sin(a) * 50 - 2, 4, 4); } }), 0, 0.1465, 0);
};
K.sunglasses = (s) => {
  const fr = P(s.color || '#2a1a12', 0.25);
  for (const sx of [-1, 1]) {
    const l = sp(0.026, GL('#2a2a2a', 0.75), sx * 0.034, 0.025, 0.0, 1, 0.85, 0.15, 18, 10); l.rotation.x = -0.3;
    const rim = to(0.026, 0.003, fr, sx * 0.034, 0.025, 0, TAU, 5, 24); rim.scale.set(1, 0.85, 1); rim.rotation.x = -0.3;
    const arm = bx(0.004, 0.006, 0.13, fr, sx * 0.062, 0.006, -0.065, 0.002); arm.rotation.x = 0.0;
  }
  to(0.01, 0.003, fr, 0, 0.035, 0.004, PI, 5, 10).rotation.x = -0.3;
};
K.records = () => {
  const sleeves = [['#e86a5a', '#f2e6d0'], ['#1d1d1d', '#f2c84b'], ['#5ab4c9', '#ffffff']];
  sleeves.forEach(([c1, c2], i) => {
    const m = faceMat('rec' + i, (x, w, h) => { x.fillStyle = c1; x.fillRect(0, 0, w, h); x.fillStyle = c2; if (i === 0) { x.beginPath(); x.arc(64, 64, 34, 0, TAU); x.fill(); } else if (i === 1) { for (let k = 0; k < 5; k++) x.fillRect(0, 20 + k * 22, w, 8); } else { x.fillRect(20, 20, 88, 88); x.fillStyle = c1; x.fillRect(40, 40, 48, 48); } });
    const sl = faced(0.31, 0.31, 0.004, P(c1, 0.6), m, 0, 0, 0); sl.rotation.x = -0.18 - i * 0.04; sl.position.set(0, 0.152, -i * 0.012); sl.rotation.y = (i - 1) * 0.05;
  });
  cy(0.15, 0.15, 0.002, P('#111111', 0.25), 0, 0, 0, 40).rotation.x = PI / 2; G.children.at(-1).position.set(0.05, 0.155, -0.04); G.children.at(-1).rotation.x = PI / 2 - 0.25;
};
K.magazines = () => {
  const covers = [['#d94a3a', 'STYLE'], ['#2f5a6e', 'TRAVEL'], ['#f2e6d0', 'HOME'], ['#1d1d1d', 'MUSIC']];
  covers.forEach(([c, t], i) => {
    const cv = faceMat('mag' + i, (x, w, h) => { x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = i === 2 ? '#2a2a2a' : '#ffffff'; x.font = 'bold 22px Georgia'; x.textAlign = 'center'; x.fillText(t, w / 2, 26); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(20, 40, 88, 70); });
    const geo = cg('magb', () => new THREE.BoxGeometry(0.21, 0.006, 0.28));
    const m = add(geo, [P(c), P(c), cv, P(c), P('#f4f0e6', 0.9), P(c)], (i % 2 ? 0.01 : -0.006), 0.003 + i * 0.006, 0); m.rotation.y = (i - 1.5) * 0.12;
  });
};
K.sweetstin = (s) => {
  const t = faceMat('tin' + (s.color || ''), (x, w, h) => { x.fillStyle = s.color || '#2f4a7a'; x.fillRect(0, 0, w, h); x.fillStyle = '#e9c97a'; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(i * 32 + 16, h / 2, 10, 0, TAU); x.fill(); } x.fillRect(0, 8, w, 5); x.fillRect(0, h - 13, w, 5); }, 256, 64);
  t.metalness = 0.6; t.roughness = 0.3;
  add(cg('tinb', () => new THREE.CylinderGeometry(0.09, 0.09, 0.06, 32)), [t, MET('#c9a35a', 0.3), MET('#c9a35a', 0.3)], 0, 0.03, 0);
  cy(0.093, 0.093, 0.018, MET(s.color || '#2f4a7a', 0.3), 0, 0.058, 0, 32);
  cy(0.06, 0.06, 0.001, MET('#e9c97a', 0.3), 0, 0.076, 0, 28);
};
K.paperweight = () => {
  las([[0.001, 0], [0.04, 0], [0.042, 0.015], [0.03, 0.045], [0.001, 0.055]], GL('#e6f2f2', 0.35), 0, 0, 0, 26);
  sp(0.016, LIQ('#3a7ab8', 0.6), 0, 0.022, 0, 1, 0.6, 1, 12, 8); sp(0.012, LIQ('#d94a6a', 0.6), 0.008, 0.026, 0.006, 1, 0.5, 1, 10, 6);
};
K.woodbird = () => {
  const wd = WOOD(s_wood);
  sp(0.04, wd, 0, 0.045, 0, 1.4, 0.9, 0.8, 16, 12);
  sp(0.025, wd, 0.05, 0.075, 0, 1, 1, 0.9, 14, 10);
  const bk = cy(0.001, 0.008, 0.02, P('#4a3a2a', 0.6), 0.078, 0.075, 0, 8); bk.rotation.z = -PI / 2;
  const tl = bx(0.05, 0.008, 0.03, wd, -0.065, 0.06, 0, 0.004); tl.rotation.z = 0.4;
  for (const sz of [-1, 1]) sp(0.003, P('#111', 0.2), 0.062, 0.082, sz * 0.018);
  bx(0.02, 0.012, 0.02, wd, 0, 0, 0, 0.004);
};
const s_wood = 'oak';
K.kokeshi = () => {
  const body = faceMat('kokeshi', (x, w, h) => { x.fillStyle = '#efdcb8'; x.fillRect(0, 0, w, h); x.fillStyle = '#b8322b'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(32 + i * 64, 50, 18, 0, TAU); x.fill(); } x.fillStyle = '#2f6a44'; for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(i * 32 + 16, 82, 8, 4, 0.5, 0, TAU); x.fill(); } x.fillStyle = '#b8322b'; x.fillRect(0, 108, w, 6); x.fillRect(0, 10, w, 4); }, 256, 128);
  add(cg('kokb', () => new THREE.CylinderGeometry(0.022, 0.026, 0.13, 20)), [body, WOOD('pine'), WOOD('pine')], 0, 0.065, 0).rotation.y = PI;
  sp(0.033, P('#f2e2c6', 0.5), 0, 0.16, 0, 1, 0.95, 0.95, 18, 14);
  sp(0.034, P('#1d1d1d', 0.5), 0, 0.172, -0.006, 1, 0.75, 0.95, 18, 10);
  for (const sx of [-1, 1]) bx(0.008, 0.0015, 0.002, P('#1d1d1d'), sx * 0.011, 0.158, 0.032, 0);
  sp(0.003, P('#b8322b', 0.4), 0, 0.146, 0.032);
};
K.daruma = () => {
  const red = P('#c0282a', 0.35);
  sp(0.06, red, 0, 0.058, 0, 1, 1.05, 0.95, 22, 16);
  const face = sp(0.036, P('#f6efe2', 0.4), 0, 0.075, 0.035, 1, 1, 0.55, 18, 12);
  sp(0.009, P('#111', 0.3), -0.013, 0.08, 0.055, 1, 1, 0.4); // 片目だけ（願いがかなったら、もう片方）
  sp(0.01, P('#f6efe2', 0.4), 0.013, 0.08, 0.055, 1, 1, 0.3);
  bx(0.05, 0.016, 0.004, faceMat('daruma', (x, w, h) => { x.fillStyle = '#c0282a'; x.fillRect(0, 0, w, h); x.fillStyle = '#e9c97a'; x.font = 'bold 80px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('福', w / 2, h / 2); }), 0, 0.02, 0.058, 0.002);
  for (const sx of [-1, 1]) { const m = bx(0.016, 0.004, 0.003, P('#111'), sx * 0.016, 0.1, 0.052, 0.001); m.rotation.z = sx * 0.3; }
};

// ───────── バンド（OVERDRIVE） ─────────
K.picks = () => {
  la([[0.001, 0], [0.05, 0], [0.06, 0.012], [0.062, 0.015], [0.057, 0.015], [0.048, 0.005], [0.001, 0.005]], CER('#1d1d1d'), 0, 0, 0, 28);
  const pick = cg('pick', () => { const s = new THREE.Shape(); s.moveTo(0, -0.014); s.quadraticCurveTo(0.016, 0.002, 0.012, 0.01); s.quadraticCurveTo(0, 0.018, -0.012, 0.01); s.quadraticCurveTo(-0.016, 0.002, 0, -0.014); return new THREE.ExtrudeGeometry(s, { depth: 0.001, bevelEnabled: false }).rotateX(-PI / 2); });
  const cols = ['#e8362a', '#f2c84b', '#f2efe6', '#2e6db4', '#ff4fa0', '#1d1d1d'];
  cols.forEach((c, i) => { const a = i / cols.length * TAU; const m = add(pick, P(c, 0.3), Math.cos(a) * 0.025, 0.006 + (i % 2) * 0.0015, Math.sin(a) * 0.025); m.rotation.y = a * 1.7; });
  const m = add(pick, P('#c9a35a', 0.3, 0.6), 0.075, 0.0, 0.02); m.rotation.y = 0.8;
};
K.sticks = () => {
  for (const sz of [-1, 1]) {
    const s = cy(0.007, 0.0075, 0.4, WOOD('pine'), 0, 0, 0, 10); s.rotation.set(0, sz * 0.06, PI / 2); s.position.set(0, 0.008, sz * 0.012);
    const t = cy(0.003, 0.007, 0.03, WOOD('pine'), 0, 0, 0, 8); t.rotation.copy(s.rotation); t.position.set(0.215, 0.008, sz * 0.012 - sz * 0.013);
    sp(0.0045, WOOD('pine'), 0.232, 0.008, sz * 0.012 - sz * 0.014);
    const tape = cy(0.0078, 0.0078, 0.06, P('#1d1d1d', 0.9), 0, 0, 0, 10); tape.rotation.copy(s.rotation); tape.position.set(-0.14, 0.008, sz * 0.012 + sz * 0.008);
  }
};
K.tuner = () => {
  bx(0.06, 0.02, 0.1, P('#1d1d1d', 0.5), -0.07, 0, 0, 0.006);
  bx(0.045, 0.001, 0.035, SCREEN('#0a0f0c', '#3aff7a', 0.6), -0.07, 0.02, -0.02, 0);
  cy(0.012, 0.012, 0.012, P('#2a2a2a', 0.5), -0.07, 0.02, 0.025, 14);
  // まいたケーブル
  for (let i = 0; i < 4; i++) to(0.06 + i * 0.006, 0.005, P('#1a1a1a', 0.6), 0.05, 0.006 + i * 0.002, 0, TAU, 6, 32).rotation.x = PI / 2;
  const jack = cy(0.006, 0.006, 0.04, MET('#d9b45a', 0.25), 0, 0, 0, 10); jack.rotation.z = PI / 2; jack.position.set(-0.02, 0.006, 0.07);
};
K.setlist = () => {
  const sl = faceMat('setlist', (x, w, h) => { x.fillStyle = '#f6f1e4'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d1d1d'; x.font = 'bold 16px "Courier New"'; x.fillText('SET LIST', 14, 22); x.font = '12px "Courier New"'; ['1. OVERDRIVE', '2. NIGHT RUN', '3. STATIC', '4. NEON', '5. ENCORE'].forEach((t, i) => x.fillText(t, 14, 46 + i * 16)); x.fillStyle = '#e8362a'; x.fillRect(10, 30, 100, 2); }, 128, 160);
  const p = pl(0.15, 0.19, sl, -0.03, 0.001, 0); p.rotation.y = 0.1;
  const tk = faceMat('ticket', (x, w, h) => { x.fillStyle = '#1d1d1d'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff4fa0'; x.font = 'bold 22px Arial'; x.fillText('LIVE', 10, 28); x.fillStyle = '#f2efe6'; x.font = '11px Arial'; x.fillText('OVERDRIVE TOUR', 10, 46); x.setLineDash([3, 3]); x.strokeStyle = '#f2efe6'; x.beginPath(); x.moveTo(w * 0.75, 0); x.lineTo(w * 0.75, h); x.stroke(); }, 160, 64);
  const t = pl(0.12, 0.05, tk, 0.06, 0.003, 0.05); t.rotation.y = -0.3;
  const pk = cg('pick', () => null); if (pk) { const m = add(pk, P('#e8362a', 0.3), 0.04, 0.004, -0.04); m.rotation.y = 0.4; }
};

// =====================================================================
// 入口
// =====================================================================
export const SMALL_KINDS = Object.keys(K);
// spec = { type: 'small', kind, ... }。matOf = procfurn の材質（木目など）
export function buildSmall(spec, matOf) {
  const fn = K[spec.kind];
  if (!fn) return null;
  if (matOf) WOOD = (k) => matOf(k);
  const g = new THREE.Group();
  const prev = G; G = g;
  try { fn(spec); } finally { G = prev; }
  return g;
}
