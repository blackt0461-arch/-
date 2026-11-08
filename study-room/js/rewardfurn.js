// 称号・図鑑のごほうび家具（ガチャには出ない限定品）。gachafurn.js の BUILDERS に入る。
// 正面は +Z、床が y=0。壁かけは背中が -Z（z=0 が壁の面）。単位はメートル。
// 光る物は userData.light、動く物は userData.tick(t, dt)。
import * as THREE from 'three';
import { SF, buildWith, pushGroup, setWood } from './smallfurn.js';
import { matOf } from './procfurn.js';

const { bx, cy, la, las, sp, to, tb, pl, faced, faceMat, canvasMat, rnd, P, MET, BRASS, GL, CLOTH, GLOW, book } = SF;
const PI = Math.PI, TAU = PI * 2;
const W = (k) => matOf(k);
const GOLD = () => MET('#e0b75a', 0.18);
const make = (fn) => (spec) => { setWood(matOf); return buildWith(fn, spec); };

// 格子のあかりの間取りランプ：木の格子の箱が、間取り図のように仕切られて内側から光る
function akariLamp(s, g) {
  const wd = W('oak'), paper = P('#fff4dc', 0.9);
  paper.emissive = new THREE.Color('#ffcf8a'); paper.emissiveIntensity = 1.1;
  bx(0.38, 0.03, 0.38, W('walnut'), 0, 0, 0, 0.006);
  bx(0.34, 0.36, 0.34, paper, 0, 0.03, 0, 0);
  // 外の格子（間取りの壁のように、太い線と細い線）
  for (const [x, w] of [[-0.17, 0.016], [0.17, 0.016], [-0.05, 0.01], [0.07, 0.01]]) for (const z of [-0.171, 0.171]) bx(w, 0.36, 0.006, wd, x, 0.03, z, 0);
  for (const [z, w] of [[-0.17, 0.016], [0.17, 0.016], [0.02, 0.01]]) for (const x of [-0.171, 0.171]) bx(0.006, 0.36, w, wd, x, 0.03, z, 0);
  for (const y of [0.03, 0.15, 0.27, 0.385]) { bx(0.35, 0.012, 0.012, wd, 0, y, 0.172, 0); bx(0.35, 0.012, 0.012, wd, 0, y, -0.172, 0); bx(0.012, 0.012, 0.35, wd, 0.172, y, 0, 0); bx(0.012, 0.012, 0.35, wd, -0.172, y, 0, 0); }
  // 屋根（低い四角すい）
  const roof = cy(0.02, 0.27, 0.07, W('walnut'), 0, 0.395, 0, 4); roof.rotation.y = PI / 4;
  g.userData.light = { color: '#ffc98a', intensity: 0.9, y: 0.2 };
}

// 虫めがねと古い設計図の机
function aburiDesk(s, g) {
  const wd = W('walnut');
  bx(1.2, 0.04, 0.62, wd, 0, 0.72, 0, 0.008);
  for (const x of [-0.55, 0.55]) for (const z of [-0.26, 0.26]) { const l = cy(0.025, 0.018, 0.72, wd, x, 0, z, 10); }
  bx(1.08, 0.1, 0.02, wd, 0, 0.62, 0.28, 0.004);
  bx(0.4, 0.09, 0.5, wd, 0.35, 0.62, 0, 0.004); cy(0.012, 0.012, 0.01, BRASS(), 0.35, 0.665, 0.252, 10).rotation.x = PI / 2;
  // 設計図（青い紙に白い線）
  const bp = faceMat('blueprint', (x, w, h) => {
    x.fillStyle = '#21497a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1; for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = '#e8f1ff'; x.lineWidth = 3; x.strokeRect(30, 30, 190, 120); x.beginPath(); x.moveTo(110, 30); x.lineTo(110, 150); x.moveTo(30, 90); x.lineTo(110, 90); x.moveTo(160, 30); x.lineTo(160, 100); x.lineTo(220, 100); x.stroke();
    x.lineWidth = 1.5; x.beginPath(); x.arc(110, 90, 22, 0, PI / 2); x.stroke(); x.beginPath(); x.arc(160, 100, 18, PI, PI * 1.5); x.stroke();
    x.fillStyle = '#e8f1ff'; x.font = '12px "Courier New"'; x.fillText('PLAN  1:50', 30, 172); x.fillText('6.0m', 110, 24);
  }, 256, 192);
  const sheet = pl(0.62, 0.46, bp, -0.12, 0.761, 0.0); sheet.rotation.y = 0.06;
  // 丸めた設計図
  for (let i = 0; i < 3; i++) { const r = cy(0.025, 0.025, 0.5, P(['#d8cba8', '#e6dcc0', '#21497a'][i], 0.85), 0, 0, 0, 14); r.rotation.set(0, 0.2 + i * 0.1, PI / 2); r.position.set(0.32, 0.785 + (i === 2 ? 0.045 : 0), -0.2 + i * 0.05 - (i === 2 ? 0.025 : 0)); }
  // 真ちゅうの虫めがね（スタンドつき）
  cy(0.06, 0.07, 0.02, BRASS(), -0.42, 0.74, -0.15, 20);
  const arm = cy(0.008, 0.008, 0.26, BRASS(), -0.42, 0.76, -0.15, 8); arm.rotation.z = 0.5; arm.position.set(-0.36, 0.87, -0.15);
  const lens = new THREE.Group(); const back = pushGroup(lens);
  to(0.08, 0.009, BRASS(), 0, 0, 0, TAU, 8, 40).rotation.x = PI / 2.6;
  sp(0.078, GL('#eaf5ff', 0.25), 0, 0, 0, 1, 0.12, 1, 24, 8).rotation.x = PI / 2.6 - PI / 2;
  back(); lens.position.set(-0.26, 0.96, -0.08); lens.rotation.y = 0.3;
  // 製図の道具
  const tri = bx(0.16, 0.003, 0.1, GL('#d4e8f0', 0.5), 0.1, 0.762, 0.17, 0); tri.rotation.y = -0.4;
  const pen = cy(0.004, 0.004, 0.14, P('#1d1d1d', 0.4), 0, 0, 0, 8); pen.rotation.set(0, 0.3, PI / 2); pen.position.set(-0.05, 0.765, 0.2);
}

// 机の上の物だけ（PARTS で Poly Haven の机にのせる。y=0 が天板）
function aburiTop(s, g) {
  const inner = new THREE.Group(); const back0 = pushGroup(inner);
  // 設計図（青い紙に白い線）
  const bp = faceMat('blueprint', (x, w, h) => {
    x.fillStyle = '#21497a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1; for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.strokeStyle = '#e8f1ff'; x.lineWidth = 3; x.strokeRect(30, 30, 190, 120); x.beginPath(); x.moveTo(110, 30); x.lineTo(110, 150); x.moveTo(30, 90); x.lineTo(110, 90); x.moveTo(160, 30); x.lineTo(160, 100); x.lineTo(220, 100); x.stroke();
    x.lineWidth = 1.5; x.beginPath(); x.arc(110, 90, 22, 0, PI / 2); x.stroke(); x.beginPath(); x.arc(160, 100, 18, PI, PI * 1.5); x.stroke();
    x.fillStyle = '#e8f1ff'; x.font = '12px "Courier New"'; x.fillText('PLAN  1:50', 30, 172); x.fillText('6.0m', 110, 24);
  }, 256, 192);
  const sheet = pl(0.62, 0.46, bp, -0.12, 0.761, 0.0); sheet.rotation.y = 0.06;
  // 丸めた設計図
  for (let i = 0; i < 3; i++) { const r = cy(0.025, 0.025, 0.5, P(['#d8cba8', '#e6dcc0', '#21497a'][i], 0.85), 0, 0, 0, 14); r.rotation.set(0, 0.2 + i * 0.1, PI / 2); r.position.set(0.32, 0.785 + (i === 2 ? 0.045 : 0), -0.2 + i * 0.05 - (i === 2 ? 0.025 : 0)); }
  if (!s.noLens) {
  // 真ちゅうの虫めがね（スタンドつき）
  cy(0.06, 0.07, 0.02, BRASS(), -0.42, 0.74, -0.15, 20);
  const arm = cy(0.008, 0.008, 0.26, BRASS(), -0.42, 0.76, -0.15, 8); arm.rotation.z = 0.5; arm.position.set(-0.36, 0.87, -0.15);
  const lens = new THREE.Group(); const back = pushGroup(lens);
  to(0.08, 0.009, BRASS(), 0, 0, 0, TAU, 8, 40).rotation.x = PI / 2.6;
  sp(0.078, GL('#eaf5ff', 0.25), 0, 0, 0, 1, 0.12, 1, 24, 8).rotation.x = PI / 2.6 - PI / 2;
  back(); lens.position.set(-0.26, 0.96, -0.08); lens.rotation.y = 0.3;
  }
  // 製図の道具
  const tri = bx(0.16, 0.003, 0.1, GL('#d4e8f0', 0.5), 0.1, 0.762, 0.17, 0); tri.rotation.y = -0.4;
  const pen = cy(0.004, 0.004, 0.14, P('#1d1d1d', 0.4), 0, 0, 0, 8); pen.rotation.set(0, 0.3, PI / 2); pen.position.set(-0.05, 0.765, 0.2);
  back0(); inner.position.y = -0.74;
}

// たたみ六畳のミニチュア棚：低い木の棚の上に、ガラスのケースに入った六畳間の模型
function rokujoBoard(s, g) {
  const wd = W('oak');
  bx(0.9, 0.5, 0.42, wd, 0, 0, 0, 0.008);
  for (const x of [-0.22, 0.22]) bx(0.42, 0.42, 0.01, W('walnut'), x, 0.04, 0.21, 0.003);
  for (const x of [-0.05, 0.05]) bx(0.012, 0.08, 0.012, P('#2a2a2a', 0.4, 0.5), x, 0.25, 0.22, 0.003);
  // 六畳（3畳×2列）のたたみ
  const tatami = faceMat('tatami6', (x, w, h) => {
    x.fillStyle = '#c9c48a'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(90,85,40,0.25)'; for (let i = 0; i < h; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    x.fillStyle = '#3a4a3a';
    // 六畳の敷き方（へりの線）
    const L = [[0, 0, 128, 64], [128, 0, 128, 64], [0, 64, 64, 128], [64, 64, 128, 64], [64, 128, 128, 64], [192, 64, 64, 128]];
    for (const [a, b, c, d] of L) { x.fillRect(a, b, c, 3); x.fillRect(a, b + d - 3, c, 3); }
  }, 256, 192);
  pl(0.6, 0.36, tatami, 0, 0.512, 0.0);
  bx(0.62, 0.012, 0.38, W('walnut'), 0, 0.5, 0, 0);
  // 障子・床の間・ちゃぶ台
  const shoji = faceMat('minishoji', (x, w, h) => { x.fillStyle = '#f6efdc'; x.fillRect(0, 0, w, h); x.fillStyle = '#b9925a'; for (let i = 0; i <= 4; i++) x.fillRect(i * (w / 4) - 2, 0, 4, h); for (let j = 0; j <= 5; j++) x.fillRect(0, j * (h / 5) - 2, w, 4); }, 128, 160);
  faced(0.3, 0.2, 0.006, P('#b9925a', 0.5), shoji, -0.12, 0.512, -0.17);
  bx(0.2, 0.2, 0.006, P('#e9dfc4', 0.9), 0.17, 0.512, -0.17, 0);
  bx(0.16, 0.02, 0.08, W('walnut'), 0.17, 0.512, -0.13, 0);
  cy(0.06, 0.06, 0.01, W('walnut'), 0.02, 0.535, 0.04, 20); cy(0.006, 0.006, 0.025, W('walnut'), 0.02, 0.512, 0.04, 6);
  for (const [x, z] of [[-0.06, 0.04], [0.1, 0.04]]) bx(0.05, 0.008, 0.05, CLOTH('#7a3a3a'), x, 0.513, z, 0.003);
  // ガラスのケース
  bx(0.64, 0.24, 0.4, GL('#eef6f4', 0.18), 0, 0.506, 0, 0);
  for (const x of [-0.32, 0.32]) for (const z of [-0.2, 0.2]) bx(0.012, 0.24, 0.012, BRASS(), x, 0.506, z, 0);
}

// 積み上げた木箱の棚
function hikkoshiCrates(s, g) {
  const r = rnd(5);
  const crate = (x, y, z, w, h, d, ry = 0) => {
    const grp = new THREE.Group(); const back = pushGroup(grp);
    const wd = W(r() < 0.5 ? 'pine' : 'oak');
    for (const sx of [-1, 1]) bx(0.018, h, d, wd, sx * (w / 2 - 0.009), 0, 0, 0.002);
    bx(w, 0.018, d, wd, 0, 0, 0, 0.002); bx(w, 0.018, d, wd, 0, h - 0.018, 0, 0.002);
    for (let i = 0; i < 3; i++) bx(w - 0.03, h / 3 - 0.02, 0.012, wd, 0, 0.01 + i * h / 3, -d / 2 + 0.006, 0.002);
    back(); grp.position.set(x, y, z); grp.rotation.y = ry;
  };
  crate(-0.24, 0, 0, 0.46, 0.34, 0.32); crate(0.24, 0, 0, 0.46, 0.34, 0.32);
  crate(-0.22, 0.34, 0.0, 0.46, 0.34, 0.32, 0.03); crate(0.26, 0.34, 0.01, 0.44, 0.34, 0.32, -0.02);
  crate(0.02, 0.68, 0, 0.46, 0.34, 0.32, 0.02); crate(0.0, 1.02, 0.0, 0.42, 0.3, 0.3, -0.04);
  // 中の物（本・つぼ・植物）
  [['#7a2f2a', -0.36], ['#3f5a45', -0.33], ['#c9a04a', -0.3], ['#2f4a6b', -0.27]].forEach(([c, x]) => bx(0.024, 0.24, 0.2, P(c, 0.7), x, 0.02, 0.02, 0.003));
  las([[0.001, 0], [0.06, 0], [0.08, 0.1], [0.05, 0.18], [0.03, 0.2]], P('#b4613d', 0.8), 0.24, 0.358, 0.02, 20);
  la([[0.001, 0], [0.07, 0], [0.08, 0.1]], P('#d9d3c8', 0.85), 0.02, 0.698, 0.02, 20);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; const lf = sp(0.05, P('#4f7a4a', 0.6), 0.02 + Math.cos(a) * 0.05, 0.84, 0.02 + Math.sin(a) * 0.05, 0.5, 0.25, 1.2, 8, 6); lf.rotation.set(0.6, -a, 0); }
  // 札（引っ越しの貼り紙）
  const tag = faceMat('hktag', (x, w, h) => { x.fillStyle = '#f2e6c8'; x.fillRect(0, 0, w, h); x.fillStyle = '#b8322b'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.fillText('こわれもの', w / 2, 40); x.font = '14px sans-serif'; x.fillStyle = '#333'; x.fillText('→ 新しい部屋', w / 2, 70); }, 128, 96);
  faced(0.14, 0.1, 0.002, P('#f2e6c8'), tag, 0.0, 1.12, 0.151);
}

// 金のパズルピースのトロフィー
function pieceGeo(sz = 0.16, t = 0.035) {
  const s = new THREE.Shape(), h = sz / 2, k = sz * 0.17;
  s.moveTo(-h, -h); s.lineTo(-k, -h); s.absarc(0, -h, k, PI, 0, true); s.lineTo(h, -h);
  s.lineTo(h, -k); s.absarc(h, 0, k, -PI / 2, PI / 2, false); s.lineTo(h, h);
  s.lineTo(k, h); s.absarc(0, h, k, 0, PI, false); s.lineTo(-h, h);
  s.lineTo(-h, k); s.absarc(-h, 0, k, PI / 2, -PI / 2, true); s.lineTo(-h, -h);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -t / 2);
  return geo;
}
function pzCrown(s, g) {
  const mb = canvasMat('trmarble', 128, 128, (x, w, h) => { x.fillStyle = '#1d1e21'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(220,210,190,0.35)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(Math.random() * w, 0); x.bezierCurveTo(w * 0.3, h * 0.4, w * 0.7, h * 0.6, Math.random() * w, h); x.stroke(); } }, { rough: 0.15 });
  bx(0.2, 0.06, 0.2, mb, 0, 0, 0, 0.004);
  bx(0.15, 0.05, 0.15, mb, 0, 0.06, 0, 0.004);
  const plate = faceMat('pzplate', (x, w, h) => { x.fillStyle = '#d9b25c'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2a10'; x.font = 'bold 18px Georgia'; x.textAlign = 'center'; x.fillText('PUZZLE KING', w / 2, h / 2 + 6); }, 160, 40);
  faced(0.12, 0.03, 0.003, GOLD(), plate, 0, 0.068, 0.076);
  cy(0.012, 0.02, 0.05, GOLD(), 0, 0.11, 0, 14);
  const m = new THREE.Mesh(pieceGeo(), GOLD()); m.position.set(0, 0.255, 0); m.rotation.set(0, 0, 0.25); m.castShadow = true; g.add(m);
  const m2 = new THREE.Mesh(pieceGeo(0.07, 0.02), MET('#c9c9c9', 0.2)); m2.position.set(0.075, 0.13, 0.03); m2.rotation.set(-0.2, -0.3, -0.4); m2.castShadow = true; g.add(m2);
  g.userData.tick = (t) => { m.rotation.y = Math.sin(t * 0.8) * 0.35; };
}

// 百日の日めくりと金の砂時計
function streak100(s, g) {
  bx(0.32, 0.025, 0.14, W('walnut'), 0, 0, 0, 0.006);
  // 日めくり
  const pg = faceMat('himekuri', (x, w, h) => { x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, w, h); x.fillStyle = '#b8322b'; x.fillRect(0, 0, w, 26); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.textAlign = 'center'; x.fillText('連続', w / 2, 19); x.fillStyle = '#b8322b'; x.font = 'bold 64px Georgia'; x.fillText('100', w / 2, 100); x.fillStyle = '#555'; x.font = '14px sans-serif'; x.fillText('日', w / 2, 122); }, 128, 140);
  bx(0.13, 0.17, 0.035, P('#efe9dc', 0.9), -0.075, 0.025, 0, 0.003);
  faced(0.124, 0.16, 0.002, P('#fbf8f1', 0.9), pg, -0.075, 0.03, 0.0185);
  bx(0.13, 0.02, 0.04, P('#2a2a2a', 0.4, 0.4), -0.075, 0.19, 0, 0.003);
  for (let i = 0; i < 4; i++) { const p = bx(0.12, 0.002, 0.03, P('#fbf8f1', 0.9), -0.07 + i * 0.01, 0.026, 0.05 + i * 0.006, 0); p.rotation.y = i * 0.3; }
  // 金の砂時計
  for (const y of [0.025, 0.215]) cy(0.045, 0.045, 0.014, GOLD(), 0.08, y, 0, 24);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; cy(0.004, 0.004, 0.176, GOLD(), 0.08 + Math.cos(a) * 0.037, 0.039, Math.sin(a) * 0.037, 6); }
  las([[0.03, 0], [0.03, 0.02], [0.02, 0.07], [0.004, 0.088], [0.004, 0.09], [0.02, 0.108], [0.03, 0.156], [0.03, 0.176]], GL('#fff8ea', 0.3), 0.08, 0.039, 0, 18);
  const sand = P('#e9c46a', 0.6); sand.emissive = new THREE.Color('#5a3a00'); sand.emissiveIntensity = 0.3;
  las([[0.001, 0], [0.027, 0], [0.024, 0.02], [0.01, 0.045], [0.001, 0.05]], sand, 0.08, 0.04, 0, 16);
  las([[0.001, 0], [0.018, 0], [0.004, 0.025]], sand, 0.08, 0.14, 0, 12);
}

// 天井まで届く本の塔：本をらせんに積み上げた柱
function bookTower(s, g) {
  const r = rnd(17), H = 2.15;
  const cols = ['#7a2f2a', '#3f5a45', '#c9a04a', '#2f4a6b', '#e9e1cf', '#5a3a2a', '#8a6a9a', '#d98a5a', '#1f3c5a', '#a0aa8a'];
  let y = 0, k = 0;
  bx(0.5, 0.04, 0.5, W('walnut'), 0, 0, 0, 0.006); y = 0.04;
  while (y < H) {
    const t = 0.03 + r() * 0.035, w = 0.26 + r() * 0.1, d = 0.18 + r() * 0.06;
    const a = k * 0.55 + (r() - 0.5) * 0.2;
    book(w, t, d, cols[Math.floor(r() * cols.length)], Math.cos(a) * 0.03, y, Math.sin(a) * 0.03, a);
    y += t; k++;
  }
  // てっぺんにランプ
  la([[0.001, 0], [0.05, 0], [0.05, 0.01], [0.012, 0.02], [0.012, 0.1]], BRASS(), 0, y, 0, 18);
  const shade = las([[0.1, 0], [0.08, 0.06], [0.05, 0.1]], P('#2f5a45', 0.4), 0, y + 0.08, 0, 24); shade.material.side = THREE.DoubleSide;
  sp(0.025, GLOW('#ffd9a0', 2.2), 0, y + 0.1, 0, 1, 1, 1, 10, 8);
  g.userData.light = { color: '#ffd9a0', intensity: 0.7, y: y + 0.1 };
}

// 金の月桂樹の飾り額（壁かけ）
function legendLaurel(s, g) {
  const fr = MET('#c9a35a', 0.25);
  bx(0.72, 0.72, 0.04, fr, 0, -0.36, 0.02, 0.01);
  const vel = P('#1d2a3a', 0.9);
  bx(0.62, 0.62, 0.01, vel, 0, -0.31, 0.04, 0);
  const leaf = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), GOLD(), 44);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.45, 1, 0.25);
  let k = 0;
  for (const side of [-1, 1]) for (let i = 0; i < 22; i++) {
    const a = -PI / 2 + side * (0.35 + i * 0.12);
    const r0 = 0.2;
    const pos = new THREE.Vector3(Math.cos(a) * r0 + side * (i % 2 ? 0.02 : -0.01) * Math.cos(a), Math.sin(a) * r0, 0.055);
    q.setFromEuler(new THREE.Euler(0, 0, a + side * (i % 2 ? 0.7 : -0.7)));
    m4.compose(pos, q, sc); leaf.setMatrixAt(k++, m4);
  }
  leaf.position.y = 0; leaf.castShadow = true;
  const wreath = new THREE.Group(); wreath.add(leaf); wreath.position.y = 0.02; g.add(wreath);
  const back = pushGroup(wreath);
  to(0.2, 0.005, GOLD(), 0, 0, 0.05, PI * 1.6, 6, 40).rotation.z = -PI * 1.3;
  back();
  const num = faceMat('lv50', (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = '#e8c46a'; x.font = 'bold 64px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('50', w / 2, h / 2 - 6); x.font = 'bold 16px Georgia'; x.fillText('LEGEND', w / 2, h - 14); }, 128, 128);
  num.transparent = true;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), num); p.position.set(0, 0.0, 0.047); g.add(p);
  g.position.y = 0;
}

// 回る地球儀ランプ（図鑑25%）：内側から光る地球儀がゆっくり回る
function zukan25(s, g) {
  // 本物の地球儀：かたむいた半円の輪（子午線）が北と南の軸をはさみ、輪の下の端が台の軸につながる
  const R0 = 0.15, RR = 0.168, TILT = 0.41, CY = 0.27;
  const bxp = RR * Math.sin(TILT), byp = CY - RR * Math.cos(TILT); // 輪の下の端（南の軸受け）
  la([[0.001, 0], [0.08, 0], [0.085, 0.012], [0.03, 0.03], [0.015, 0.05]], BRASS(), bxp, 0, 0, 24);
  cy(0.008, 0.008, byp - 0.04, BRASS(), bxp, 0.04, 0, 8);
  const map = faceMat('globemap', (x, w, h) => {
    x.fillStyle = '#2f6fa0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8d9a8';
    const blobs = [[60, 50, 30, 22], [70, 85, 14, 26], [130, 45, 38, 20], [140, 80, 18, 22], [200, 60, 24, 16], [215, 100, 14, 10], [100, 115, 50, 8]];
    for (const [a, b, c, d] of blobs) { x.beginPath(); x.ellipse(a, b, c, d, 0.3, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,0.25)'; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); }
  }, 256, 128);
  map.emissive = new THREE.Color('#ffffff'); map.emissiveMap = map.map; map.emissiveIntensity = 0.55;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), map);
  const tilt = new THREE.Group(); tilt.rotation.z = TILT; tilt.position.y = CY; g.add(tilt); tilt.add(globe);
  // 半円の輪（北の端から南の端まで、地球儀のうしろ側をまわる）と、南北の軸
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RR, 0.006, 6, 48, PI), BRASS()); ring.rotation.set(0, PI / 2, -PI / 2); tilt.add(ring);
  for (const sy of [-1, 1]) { const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, RR - R0 + 0.01, 8), BRASS()); ax.position.y = sy * (R0 + (RR - R0) / 2); tilt.add(ax); }
  g.userData.light = { color: '#cfe4ff', intensity: 0.6, y: 0.27 };
  g.userData.tick = (t) => { globe.rotation.y = t * 0.3; };
}

// ガラスの陳列ケース（図鑑50%）
function zukan50(s, g) {
  const fr = P('#2a2420', 0.35, 0.3), gl = GL('#eef6f6', 0.16);
  bx(0.7, 0.12, 0.42, W('walnut'), 0, 0, 0, 0.006);
  bx(0.7, 0.05, 0.42, W('walnut'), 0, 1.68, 0, 0.006);
  for (const x of [-0.34, 0.34]) for (const z of [-0.2, 0.2]) bx(0.025, 1.56, 0.025, fr, x, 0.12, z, 0);
  bx(0.66, 1.56, 0.01, gl, 0, 0.12, 0.205, 0); bx(0.01, 1.56, 0.39, gl, -0.34, 0.12, 0, 0); bx(0.01, 1.56, 0.39, gl, 0.34, 0.12, 0, 0);
  const back = P('#3a2e4a', 0.9); bx(0.66, 1.56, 0.01, back, 0, 0.12, -0.2, 0);
  const shelfM = GL('#e6f0f0', 0.4);
  const r = rnd(8);
  for (const y of [0.5, 0.9, 1.3]) {
    bx(0.66, 0.01, 0.38, shelfM, 0, y, 0, 0);
    const lamp = bx(0.6, 0.006, 0.02, GLOW('#fff1d6', 1.4), 0, y + 0.37, 0.15, 0); lamp.castShadow = false;
  }
  // 中の飾り（つぼ・石・模型・メダル）。PARTS で Poly Haven の物を並べる時は空にする
  if (s.empty) { g.userData.light = { color: '#fff1d6', intensity: 0.6, y: 1.2 }; return; }
  las([[0.001, 0], [0.05, 0], [0.07, 0.08], [0.04, 0.18], [0.03, 0.2]], P('#2f6a8a', 0.2), -0.18, 0.13, 0, 20);
  sp(0.06, P('#9a7ab8', 0.25), 0.12, 0.18, 0, 1, 0.8, 1, 10, 6);
  sp(0.05, GOLD(), 0.0, 0.56, 0, 1, 1, 1, 6, 4);
  cy(0.04, 0.04, 0.008, GOLD(), -0.2, 0.51, 0.05, 20).rotation.x = -1.2;
  las([[0.001, 0], [0.04, 0], [0.04, 0.12], [0.02, 0.18]], P('#c94a3a', 0.4), 0.2, 0.51, 0, 16);
  for (let i = 0; i < 4; i++) bx(0.025, 0.2 + r() * 0.06, 0.15, P(['#7a2f2a', '#3f5a45', '#c9a04a', '#2f4a6b'][i], 0.7), -0.2 + i * 0.03, 0.91, 0, 0.003);
  las([[0.001, 0], [0.06, 0], [0.08, 0.04], [0.07, 0.08]], P('#e9e4da', 0.2), 0.15, 0.91, 0, 22);
  sp(0.04, P('#3aa58a', 0.15), -0.1, 1.35, 0, 1, 1.3, 1, 8, 6); sp(0.03, P('#e8c46a', 0.15), 0.12, 1.34, 0, 1, 1, 1, 6, 4);
  g.userData.light = { color: '#fff1d6', intensity: 0.6, y: 1.2 };
}

// 回転する展示台（図鑑75%）：丸い台の上で、金のオブジェがゆっくり回る
function zukan75(s, g) {
  const st = canvasMat('plinth', 64, 64, (x, w, h) => { x.fillStyle = '#efece6'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 200; i++) x.fillRect(Math.random() * w, Math.random() * h, 1, 1); }, { rough: 0.6 });
  cy(0.28, 0.3, 0.06, st, 0, 0, 0, 40);
  cy(0.22, 0.24, 0.72, st, 0, 0.06, 0, 40);
  cy(0.27, 0.27, 0.03, MET('#2a2a2a', 0.3), 0, 0.78, 0, 40);
  const top = new THREE.Group(); top.name = 'top'; top.position.y = 0.81; g.add(top);
  const back = pushGroup(top);
  cy(0.25, 0.25, 0.02, P('#1d1d1f', 0.25), 0, 0, 0, 40);
  // 金のオブジェ（ねじれた輪と球）
  if (!s.empty) {
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.09, 0.025, 96, 12, 2, 3), GOLD()); knot.position.y = 0.17; knot.castShadow = true; top.add(knot);
    cy(0.05, 0.06, 0.05, MET('#2a2a2a', 0.3), 0, 0.02, 0, 20);
  }
  back();
  // 足もとの明かり（下から照らす）
  const ring = to(0.29, 0.006, GLOW('#ffe6b0', 1.6), 0, 0.065, 0, TAU, 6, 48); ring.rotation.x = PI / 2; ring.castShadow = false;
  g.userData.light = { color: '#ffe6b0', intensity: 0.8, y: 1.1 };
  g.userData.tick = (t) => { top.rotation.y = t * 0.4; };
}

// 金の額のコレクターの間の飾り（図鑑100%・壁かけ）：額の中が小さな棚になっていて、ミニチュアの家具が並ぶ
function zukan100(s, g) {
  const W0 = 1.1, H0 = 0.8, D = 0.1;
  const gold = GOLD();
  // 額（太い金の枠）
  const t = 0.07;
  bx(W0 + 2 * t, t, D + 0.02, gold, 0, H0 / 2, 0.06, 0.01);
  bx(W0 + 2 * t, t, D + 0.02, gold, 0, -H0 / 2 - t, 0.06, 0.01);
  bx(t, H0, D + 0.02, gold, -W0 / 2 - t / 2, -H0 / 2, 0.06, 0.01);
  bx(t, H0, D + 0.02, gold, W0 / 2 + t / 2, -H0 / 2, 0.06, 0.01);
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) sp(0.03, gold, x * (W0 / 2 + t / 2), y * (H0 / 2 + t / 2), 0.13);
  bx(W0, H0, 0.01, P('#3a1f2a', 0.9), 0, -H0 / 2, 0.005, 0);
  // 中の棚（3段×4列）
  const wd = W('walnut');
  for (let r = 0; r <= 3; r++) bx(W0, 0.012, D, wd, 0, -H0 / 2 + r * (H0 / 3) - 0.006, 0.055, 0);
  for (let c = 1; c < 4; c++) bx(0.012, H0, D, wd, -W0 / 2 + c * (W0 / 4), -H0 / 2, 0.055, 0);
  const r0 = rnd(4);
  const cellX = (c) => -W0 / 2 + (c + 0.5) * W0 / 4, cellY = (r) => -H0 / 2 + r * H0 / 3 + 0.006;
  // ミニチュア（ソファ・ランプ・植物・椅子・時計・ピアノ…を簡単な形で）
  const minis = [
    (x, y) => { bx(0.16, 0.04, 0.06, CLOTH('#3f5a45'), x, y, 0.06, 0.01); bx(0.16, 0.06, 0.02, CLOTH('#3f5a45'), x, y + 0.03, 0.035, 0.008); },
    (x, y) => { cy(0.03, 0.03, 0.006, BRASS(), x, y, 0.06, 12); cy(0.003, 0.003, 0.12, BRASS(), x, y, 0.06, 6); cy(0.025, 0.04, 0.05, P('#f2e6c8', 0.8), x, y + 0.11, 0.06, 14); },
    (x, y) => { cy(0.03, 0.025, 0.05, P('#b4613d', 0.8), x, y, 0.06, 12); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; sp(0.03, P('#4f7a4a', 0.6), x + Math.cos(a) * 0.025, y + 0.09, 0.06 + Math.sin(a) * 0.02, 0.5, 1, 0.5, 6, 5); } },
    (x, y) => { bx(0.06, 0.006, 0.06, wd, x, y + 0.05, 0.06, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.006, 0.05, 0.006, wd, x + sx * 0.025, y, 0.06 + sz * 0.025, 0); bx(0.06, 0.06, 0.006, wd, x, y + 0.05, 0.033, 0); },
    (x, y) => { bx(0.06, 0.18, 0.04, wd, x, y, 0.06, 0.005); cy(0.022, 0.022, 0.004, P('#f6f0e2', 0.4), x, y + 0.14, 0.081, 16).rotation.x = PI / 2; },
    (x, y) => { bx(0.16, 0.08, 0.07, P('#111', 0.15), x, y + 0.03, 0.06, 0.01); bx(0.14, 0.006, 0.02, P('#f4f2ee', 0.3), x, y + 0.075, 0.09, 0); for (const sx of [-1, 1]) bx(0.008, 0.03, 0.008, P('#111'), x + sx * 0.07, y, 0.06, 0); },
    (x, y) => { sp(0.05, GL('#eaf5ff', 0.3), x, y + 0.06, 0.06, 1, 1, 1, 14, 10); cy(0.03, 0.035, 0.012, W('walnut'), x, y, 0.06, 14); },
    (x, y) => { la([[0.001, 0], [0.03, 0], [0.04, 0.05], [0.025, 0.1], [0.02, 0.12]], P('#2f6a8a', 0.2), x, y, 0.06, 16); },
    (x, y) => { book(0.1, 0.02, 0.07, '#7a2f2a', x, y, 0.06, 0); book(0.09, 0.02, 0.065, '#c9a04a', x, y + 0.02, 0.06, 0.2); },
    (x, y) => { sp(0.035, GOLD(), x, y + 0.035, 0.06, 1, 1, 1, 8, 6); },
    (x, y) => { bx(0.1, 0.1, 0.006, P('#e9e1cf', 0.6), x, y, 0.04, 0); bx(0.08, 0.06, 0.004, P('#7aa0c0', 0.5), x, y + 0.025, 0.045, 0); },
    (x, y) => { const tr = cy(0.001, 0.05, 0.14, P('#2f6a44', 0.7), x, y, 0.06, 8); sp(0.008, GOLD(), x, y + 0.145, 0.06); },
  ];
  let i = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) minis[i++ % minis.length](cellX(c), cellY(r));
  // 下の名札
  const plate = faceMat('collector', (x, w, h) => { x.fillStyle = '#d9b25c'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2a10'; x.font = 'bold 20px Georgia'; x.textAlign = 'center'; x.fillText('COMPLETE COLLECTION', w / 2, h / 2 + 7); }, 320, 40);
  faced(0.32, 0.04, 0.004, gold, plate, 0, -H0 / 2 - t - 0.06, 0.03);
  g.userData.light = { color: '#fff1d6', intensity: 0.5, y: 0 };
}

// ===================== 12月のイベント「冬のカフェ」 =====================
// ホットチョコのカウンター：小さな木のカウンター（左半分は小物を置ける）に、銅のポット・マグ・マシュマロのびん・メニュー
function cocoaCounter(s, g) {
  const wd = W('oak'), cream = P('#efe4cf', 0.6);
  // 本体（クリーム色の縦板の前板）
  bx(1.2, 0.08, 0.5, P('#5a4434', 0.8), 0, 0, 0, 0.004);
  bx(1.16, 0.82, 0.46, cream, 0, 0.08, 0, 0.006);
  for (let i = 0; i < 11; i++) bx(0.004, 0.76, 0.006, P('#d9ccb2', 0.6), -0.5 + i * 0.1, 0.11, 0.232, 0);
  bx(1.24, 0.045, 0.54, wd, 0, 0.9, 0, 0.008);
  bx(1.18, 0.03, 0.02, P('#a8323a', 0.6), 0, 0.84, 0.235, 0.004); // 赤い帯（少しだけ）
  // 銅のポット（湯気）
  const cu = MET('#c97e57', 0.28);
  las([[0.001, 0], [0.08, 0], [0.09, 0.05], [0.085, 0.13], [0.06, 0.16], [0.05, 0.17]], cu, 0.38, 0.945, -0.05, 24);
  las([[0.052, 0], [0.03, 0.02], [0.001, 0.03]], cu, 0.38, 1.115, -0.05, 18); sp(0.012, W('walnut'), 0.38, 1.15, -0.05);
  const spt = cy(0.008, 0.016, 0.08, cu, 0, 0, 0, 10); spt.rotation.z = -0.9; spt.position.set(0.48, 1.04, -0.05);
  tb([[0.3, 1.08, -0.05], [0.26, 1.06, -0.05], [0.26, 0.99, -0.05], [0.3, 0.97, -0.05]], 0.008, W('walnut'));
  const steam = [];
  const stM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false });
  for (let i = 0; i < 3; i++) { const m = sp(0.02 + i * 0.01, stM, 0.5, 1.12 + i * 0.05, -0.05, 0.6, 1.4, 0.6, 8, 6); m.castShadow = false; steam.push(m); }
  // マグ3つ（ココアと、マシュマロ）
  [[0.18, 0.08, '#f2ece2'], [0.08, 0.12, '#a8323a'], [0.22, 0.16, '#efe4cf']].forEach(([x, z, c], i) => {
    const m = P(c, 0.25);
    las([[0.001, 0], [0.035, 0], [0.037, 0.01], [0.037, 0.08], [0.033, 0.08], [0.033, 0.01], [0.001, 0.01]], m, x, 0.945, z, 22);
    const h = to(0.022, 0.005, m, x + 0.04, 0.985, z, PI, 6, 12); h.rotation.z = -PI / 2;
    cy(0.032, 0.032, 0.002, P('#5a3018', 0.15), x, 1.012, z, 18);
    if (i !== 1) for (let k = 0; k < 3; k++) bx(0.012, 0.01, 0.012, P('#fbf8f1', 0.9), x - 0.01 + k * 0.01, 1.012, z + (k % 2) * 0.01, 0.003);
  });
  // マシュマロのびん
  cy(0.05, 0.05, 0.16, GL('#f2f6f5', 0.3), 0.0, 0.945, -0.1, 20, true);
  cy(0.052, 0.052, 0.025, W('walnut'), 0.0, 1.105, -0.1, 20);
  const r = rnd(31);
  for (let i = 0; i < 16; i++) bx(0.022, 0.02, 0.022, P(i % 5 ? '#fbf8f1' : '#f3cfd4', 0.9), (r() - 0.5) * 0.06, 0.95 + (i % 5) * 0.022, -0.1 + (r() - 0.5) * 0.06, 0.006);
  // メニューの小さな黒板
  const menu = faceMat('cocoamenu', (x, w, h) => { x.fillStyle = '#2b2f2b'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2ece2'; x.textAlign = 'center'; x.font = 'bold 22px Georgia'; x.fillText('HOT', w / 2, 34); x.fillText('COCOA', w / 2, 60); x.font = '14px Georgia'; x.fillText('with marshmallow', w / 2, 86); x.strokeStyle = '#f2ece2'; x.beginPath(); x.moveTo(30, 98); x.lineTo(98, 98); x.stroke(); x.fillStyle = '#e6b8a0'; x.font = 'bold 18px Georgia'; x.fillText('♥', w / 2, 120); }, 128, 128);
  const board = new THREE.Group(); const back = pushGroup(board);
  bx(0.2, 0.22, 0.015, W('walnut'), 0, 0, 0, 0.004); faced(0.17, 0.19, 0.003, P('#2b2f2b'), menu, 0, 0.015, 0.009);
  back(); board.position.set(0.5, 0.945, 0.12); board.rotation.set(-0.2, -0.4, 0);
  g.userData.tick = (t) => { steam.forEach((m, i) => { const k = (t * 0.4 + i / 3) % 1; m.position.y = 1.1 + k * 0.18; m.material.opacity = 0.14 * (1 - k); m.scale.setScalar(0.6 + k * 0.8); }); };
}

// ジンジャークッキーの家（テーブルの上に置ける大きさ）
function gingerHouse(s, g) {
  const cookie = faceMat('gingerwall', (x, w, h) => {
    x.fillStyle = '#b8743c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(90,45,15,${Math.random() * 0.15})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    x.strokeStyle = '#fbf8f1'; x.lineWidth = 5; x.lineCap = 'round';
    x.strokeRect(40, 40, 48, 44); x.beginPath(); x.moveTo(64, 40); x.lineTo(64, 84); x.moveTo(40, 62); x.lineTo(88, 62); x.stroke();
    x.beginPath(); for (let i = 0; i <= 8; i++) { x.arc(8 + i * 14, 120, 7, Math.PI, 0); } x.stroke();
  });
  const iceM = P('#fbf8f1', 0.6), dough = P('#b8743c', 0.75);
  // 土台（雪のお皿）
  cy(0.16, 0.17, 0.015, P('#f4f1ea', 0.3), 0, 0, 0, 32);
  cy(0.15, 0.15, 0.008, P('#fbfbff', 0.9), 0, 0.015, 0, 28);
  // かべ
  const geo = new THREE.BoxGeometry(0.18, 0.12, 0.14);
  const house = new THREE.Mesh(geo, [dough, dough, dough, dough, cookie, cookie]); house.position.set(0, 0.083, 0); house.castShadow = true; g.add(house);
  // 屋根（2枚の板と、つららのアイシング）
  for (const sd of [-1, 1]) {
    const rf = bx(0.2, 0.012, 0.13, dough, 0, 0, 0, 0.004); rf.rotation.x = sd * 0.75; rf.position.set(0, 0.185, sd * 0.045);
    const ic = bx(0.21, 0.014, 0.02, iceM, 0, 0, 0, 0.006); ic.rotation.x = sd * 0.75; ic.position.set(0, 0.148, sd * 0.093);
    for (let i = 0; i < 6; i++) { const ca = sp(0.009, P(['#a8323a', '#3f6a4a', '#f2c84b'][i % 3], 0.3), -0.075 + i * 0.03, 0.2, sd * 0.045, 1, 1, 1, 8, 6); ca.position.y = 0.19 + (sd > 0 ? 0 : 0); ca.position.z = sd * 0.04; ca.position.y += 0.012; }
  }
  bx(0.2, 0.018, 0.02, iceM, 0, 0.232, 0, 0.008);
  // ドアと、えんとつ・キャンディの杖
  bx(0.04, 0.06, 0.004, P('#7a4a22', 0.7), 0.0, 0.023, 0.071, 0.004);
  bx(0.03, 0.06, 0.03, dough, 0.05, 0.2, -0.02, 0.003); bx(0.034, 0.012, 0.034, iceM, 0.05, 0.26, -0.02, 0.004);
  for (const sx of [-1, 1]) {
    const st = cy(0.006, 0.006, 0.1, P('#fbf8f1', 0.4), sx * 0.11, 0.02, 0.08, 8);
    to(0.015, 0.006, P('#fbf8f1', 0.4), sx * 0.11 - sx * 0.015, 0.12, 0.08, PI, 6, 10).rotation.z = sx > 0 ? 0 : PI;
    for (let k = 0; k < 4; k++) to(0.0062, 0.0015, P('#a8323a', 0.4), sx * 0.11, 0.035 + k * 0.022, 0.08, TAU, 4, 10).rotation.x = PI / 2;
  }
  // 雪の木（小さな円すい）
  for (const [x, z, h] of [[-0.12, -0.06, 0.08], [0.12, -0.08, 0.06]]) { cy(0.001, 0.025, h, P('#4f7a5a', 0.7), x, 0.023, z, 8); cy(0.001, 0.012, h * 0.4, iceM, x, 0.023 + h * 0.6, z, 8); }
}

// ランタンの冬のカフェ看板（壁かけ・光る）：木の看板、上に雪、横の腕木につるしたランタン
function cafeSign(s, g) {
  const wd = W('walnut');
  const face = faceMat('cafesign', (x, w, h) => {
    x.fillStyle = '#6b4a30'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(40,25,10,${0.1 + Math.random() * 0.15})`; x.beginPath(); const y = Math.random() * h; x.moveTo(0, y); x.bezierCurveTo(w / 3, y + 4, 2 * w / 3, y - 4, w, y); x.stroke(); }
    x.strokeStyle = '#efe4cf'; x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#efe4cf'; x.textAlign = 'center'; x.font = 'bold 44px Georgia'; x.fillText('WINTER', w / 2, 66); x.font = 'bold 30px Georgia'; x.fillText('~ CAFE ~', w / 2, 106);
    x.fillStyle = '#e8b4a0'; x.font = '18px Georgia'; x.fillText('hot cocoa · cookies', w / 2, 132);
  }, 320, 150);
  // 壁の金具と腕木
  const iron = P('#2a2928', 0.5, 0.5);
  bx(0.06, 0.18, 0.02, iron, 0, 0.12, 0.01, 0.004);
  bx(0.5, 0.025, 0.025, iron, 0.22, 0.2, 0.02, 0.004);
  tb([[0.02, 0.07, 0.02], [0.2, 0.12, 0.02], [0.4, 0.19, 0.02]], 0.006, iron);
  // 看板（鎖でつるす）
  for (const x of [0.04, 0.4]) cy(0.003, 0.003, 0.08, iron, x, 0.12, 0.02, 4);
  const sign = new THREE.Group(); const back = pushGroup(sign);
  faced(0.5, 0.24, 0.03, wd, face, 0, 0, 0);
  // 雪がのる
  bx(0.52, 0.025, 0.04, P('#f6f9fd', 0.9), 0, 0.24, 0, 0.012);
  for (let i = 0; i < 5; i++) sp(0.018, P('#f6f9fd', 0.9), -0.22 + i * 0.11, 0.262, 0, 1.4, 0.6, 1, 8, 6);
  back(); sign.position.set(0.22, -0.2, 0.025);
  // ランタン（腕木の先）。PARTS で Poly Haven のランタンを付ける時は、つるす所（hook）だけ
  const lan = new THREE.Group(); lan.name = 'hook'; const back2 = pushGroup(lan);
  const glow = GLOW('#ffc27a', 2.2);
  if (!s.noLantern) {
  cy(0.002, 0.002, 0.06, iron, 0, -0.06, 0, 4);
  bx(0.09, 0.012, 0.09, iron, 0, -0.072, 0, 0.003);
  bx(0.07, 0.11, 0.07, GL('#fff2dc', 0.35), 0, -0.185, 0, 0);
  sp(0.016, glow, 0, -0.14, 0, 1, 1.6, 1, 10, 8).castShadow = false;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.006, 0.11, 0.006, iron, sx * 0.035, -0.185, sz * 0.035, 0);
  bx(0.085, 0.012, 0.085, iron, 0, -0.197, 0, 0.003);
  const cap = cy(0.01, 0.055, 0.035, iron, 0, -0.07 - 0.0, 0, 4); cap.rotation.y = PI / 4; cap.position.y = -0.055;
  bx(0.03, 0.014, 0.03, P('#f6f9fd', 0.9), 0, -0.032, 0, 0.007);
  } else { cy(0.002, 0.002, 0.05, iron, 0, -0.05, 0, 4); sp(0.012, glow, 0, -0.17, 0, 1, 1.4, 1, 8, 6).castShadow = false; }
  back2(); lan.position.set(0.46, 0.2, 0.02);
  g.userData.light = { color: '#ffc27a', intensity: 0.9, y: 0.06 };
  g.userData.tick = (t) => { lan.rotation.z = Math.sin(t * 0.9) * 0.05; glow.emissiveIntensity = 2.0 + 0.3 * Math.sin(t * 6.1) * Math.sin(t * 2.3); };
}

// 雪の結晶のガーランド（壁かけ・横長。ゆっくり揺れて、ほのかに光る）
function snowGarland(s, g) {
  const W0 = 1.6, sag = 0.14;
  const cord = P('#8a6a4c', 0.8);
  const pts = []; for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push([-W0 / 2 + W0 * u, -Math.sin(u * PI) * sag, 0.03]); }
  tb(pts, 0.004, cord, 40, 5);
  for (const sx of [-1, 1]) sp(0.012, W('walnut'), sx * W0 / 2, 0, 0.02, 1, 1, 0.6, 8, 6);
  const flakeM = P('#d6e2f0', 0.3, 0.2); flakeM.emissive = new THREE.Color('#bcd2ff'); flakeM.emissiveIntensity = 0.35;
  const bulbM = GLOW('#ffd6a0', 1.8);
  const hangs = [];
  for (let i = 1; i < 12; i++) {
    const u = i / 12, x = -W0 / 2 + W0 * u, y = -Math.sin(u * PI) * sag;
    const h = new THREE.Group(); const back = pushGroup(h);
    if (i % 2) {
      const L = 0.06 + (i % 3) * 0.02;
      cy(0.0012, 0.0012, L, cord, 0, -L, 0.03, 4);
      const fl = new THREE.Group(); const back2 = pushGroup(fl);
      const r = 0.065 + (i % 3) * 0.01;
      for (let k = 0; k < 3; k++) { const a = bx(r * 2, r * 0.16, 0.008, flakeM, 0, -r * 0.08, 0, 0); a.rotation.z = k * PI / 3; a.position.y = 0; }
      for (let k = 0; k < 6; k++) { const a = k * PI / 3; for (const sd of [-1, 1]) { const b = bx(r * 0.45, r * 0.12, 0.008, flakeM, 0, 0, 0, 0); b.position.set(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 0); b.rotation.z = a + sd * 0.8; } }
      sp(r * 0.14, flakeM, 0, 0, 0, 1, 1, 0.3, 8, 6);
      back2(); fl.position.set(0, -L - r, 0.03);
    } else {
      cy(0.004, 0.004, 0.012, P('#5a4434', 0.6), 0, -0.012, 0.03, 6);
      sp(0.018, bulbM, 0, -0.03, 0.03, 1, 1.3, 1, 10, 8).castShadow = false;
    }
    back(); h.position.set(x, y, 0); hangs.push([h, i]);
  }
  g.userData.light = { color: '#ffd6a0', intensity: 0.35, y: -0.1 };
  g.userData.tick = (t) => { for (const [h, i] of hangs) h.rotation.z = Math.sin(t * 0.8 + i * 0.7) * 0.08; };
}

// gachafurn.js の BUILDERS に入れる（名前: [作る関数, 置き方]）

// ---------- 11月のイベント「物理強化月間」（理科室の実験道具。きれいで少しレトロに） ----------
// a から b へ伸びる細い棒（ひも・くさりにも使う）
function rodAB(a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = cy(r, r, len, mat, 0, 0, 0, seg);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// ニュートンのゆりかご：クロームの枠から、鋼の玉5つが2本の糸でつるされている。端の玉が交互にカチカチ揺れる
function newtonCradle(s, g) {
  const wd = W('walnut'), chrome = MET('#eef0f2', 0.06), steel = MET('#e9ecef', 0.04), thread = P('#e8e8e8', 0.6);
  // 台：くるみの木の板に、黒い面取り
  bx(0.24, 0.022, 0.15, wd, 0, 0, 0, 0.006);
  bx(0.226, 0.004, 0.136, P('#171514', 0.35), 0, 0.022, 0, 0.002);
  // 真ちゅうの名札
  const plate = faceMat('newtonplate', (x, w, h) => { x.fillStyle = '#c9a457'; x.fillRect(0, 0, w, h); x.strokeStyle = '#8a6a2a'; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8); x.fillStyle = '#5b4314'; x.font = 'bold 22px Georgia'; x.textAlign = 'center'; x.fillText('MOMENTUM', w / 2, h / 2 + 8); }, 192, 48);
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.0175), plate); pm.position.set(0, 0.011, 0.0752); g.add(pm);
  // 枠：前と後ろの、角の丸い門の形（クローム）
  const H = 0.175, X = 0.105, Z = 0.055, rr = 0.012;
  for (const z of [-Z, Z]) {
    tb([[-X, 0.024, z], [-X, H - rr, z], [-X + rr * 0.3, H - rr * 0.3, z], [-X + rr, H, z], [X - rr, H, z], [X - rr * 0.3, H - rr * 0.3, z], [X, H - rr, z], [X, 0.024, z]], 0.0028, chrome, 64, 8);
    for (const x of [-X, X]) cy(0.006, 0.007, 0.006, chrome, x, 0.024, z, 12);
  }
  // 玉：上の棒から2本の糸（V字）でつるす。揺れる軸は、糸の付け根を結ぶ線（z 方向）
  const r = 0.0125, L = 0.1, balls = [];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * r * 2.02;
    const piv = new THREE.Group(); piv.position.set(x, H, 0);
    const back = pushGroup(piv);
    const top = new THREE.Vector3(0, -L + r * 0.92, 0);
    for (const z of [-Z, Z]) rodAB(new THREE.Vector3(0, 0, z), top, 0.00045, thread, 4);
    cy(0.0016, 0.0016, 0.003, chrome, 0, -L + r * 0.92, 0, 8); // 玉の上の小さな留め金
    sp(r, steel, 0, -L, 0, 1, 1, 1, 28, 18);
    back();
    balls.push(piv);
  }
  // 糸の付け根（棒に巻いた小さな輪）
  for (let i = 0; i < 5; i++) for (const z of [-Z, Z]) cy(0.0034, 0.0034, 0.003, chrome, (i - 2) * r * 2.02, H - 0.0015, z, 10).rotation.z = PI / 2;
  // 左の玉が当たると右の玉が飛び出す（半周期ずつ交互）。少しずつ弱まって、また大きく
  const w = TAU / 1.05;
  g.userData.tick = (t) => {
    const a = 0.42 * (0.75 + 0.25 * Math.cos(t * 0.21)), sn = Math.sin(t * w);
    balls[0].rotation.z = a * Math.min(0, sn);
    balls[4].rotation.z = a * Math.max(0, sn);
    // まん中の3つも、ほんの少しだけふるえる
    for (let i = 1; i < 4; i++) balls[i].rotation.z = 0.004 * sn * (i - 2 || 0.5);
  };
}

// 振り子の柱時計：くるみの木の背の高い時計。ガラスの扉の中で、真ちゅうの振り子がゆっくり揺れる。針は今の時刻
function pendulumClock(s, g) {
  const wd = W('walnut'), dark = P('#3a2618', 0.55), brass = BRASS(), gold = GOLD(), glass = GL('#f2f6f4', 0.14);
  const Wd = 0.46, D = 0.28, zf = D / 2;
  // 台座（すそ広がりの段）
  bx(Wd + 0.08, 0.1, D + 0.06, wd, 0, 0, 0, 0.01);
  bx(Wd + 0.05, 0.025, D + 0.04, dark, 0, 0.1, 0, 0.004);
  bx(Wd + 0.02, 0.03, D + 0.02, wd, 0, 0.125, 0, 0.004);
  for (const x of [-1, 1]) for (const z of [-1, 1]) sp(0.022, wd, x * (Wd / 2 + 0.02), 0.0133, z * (D / 2 + 0.01), 1, 0.6, 1, 12, 8);
  // 胴（長いガラス扉の箱）：y 0.155〜1.36
  const y0 = 0.155, y1 = 1.36, hh = y1 - y0;
  bx(Wd, hh, 0.018, wd, 0, y0, -zf + 0.009);           // 背板
  for (const x of [-1, 1]) bx(0.022, hh, D, wd, x * (Wd / 2 - 0.011), y0, 0); // 側板
  // 背板の内側：深い赤の布張り（振り子が映える）
  bx(Wd - 0.06, hh - 0.08, 0.004, CLOTH('#5a1f22'), 0, y0 + 0.04, -zf + 0.02);
  // 扉の枠とガラス
  const st = 0.045;
  for (const x of [-1, 1]) bx(st, hh, 0.03, wd, x * (Wd / 2 - st / 2), y0, zf - 0.015, 0.004);
  bx(Wd, 0.06, 0.03, wd, 0, y0, zf - 0.015, 0.004);
  bx(Wd, 0.06, 0.03, wd, 0, y1 - 0.06, zf - 0.015, 0.004);
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(Wd - st * 2 + 0.01, hh - 0.11), glass); gp.position.set(0, y0 + hh / 2, zf - 0.012); g.add(gp);
  // 扉の細い飾り溝と、真ちゅうの鍵穴・取っ手
  for (const x of [-1, 1]) bx(0.004, hh - 0.14, 0.004, dark, x * (Wd / 2 - st / 2), y0 + 0.07, zf + 0.001);
  cy(0.006, 0.006, 0.01, brass, Wd / 2 - st / 2, y0 + hh * 0.55, zf + 0.004, 10).rotation.x = PI / 2;
  // 振り子の下の、揺れの大きさを読む目盛り板（理科室らしく）
  const scale = faceMat('pendscale', (x, w, h) => { x.fillStyle = '#d8b56a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#4a3410'; x.lineWidth = 2; x.beginPath(); x.arc(w / 2, -h * 2.6, h * 3.3, PI * 0.39, PI * 0.61); x.stroke(); for (let i = -6; i <= 6; i++) { const a = PI / 2 + i * 0.018; const r0 = h * 3.3, r1 = r0 + (i % 3 ? 7 : 14); x.beginPath(); x.moveTo(w / 2 + Math.cos(a) * r0, -h * 2.6 + Math.sin(a) * r0); x.lineTo(w / 2 + Math.cos(a) * r1, -h * 2.6 + Math.sin(a) * r1); x.stroke(); } }, 256, 64);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), scale); sc.position.set(0, 0.29, -zf + 0.025); g.add(sc);
  // おもり2本（真ちゅうの筒をくさりでつるす）
  for (const [x, yb] of [[-0.12, 0.86], [0.12, 0.98]]) {
    cy(0.026, 0.026, 0.2, brass, x, yb, -0.06, 24);
    cy(0.028, 0.028, 0.012, gold, x, yb + 0.2, -0.06, 24); cy(0.028, 0.028, 0.012, gold, x, yb - 0.004, -0.06, 24);
    cy(0.0025, 0.0025, y1 - (yb + 0.21), MET('#b9a06a', 0.4), x, yb + 0.21, -0.06, 6);
  }
  // 振り子（上で吊る。棒は木、おもりは真ちゅうのレンズ形）
  const pend = new THREE.Group(); pend.position.set(0, y1 - 0.02, -0.02);
  const back = pushGroup(pend);
  cy(0.005, 0.005, 0.86, P('#2a1c12', 0.5), 0, -0.86, 0, 8);
  sp(0.085, gold, 0, -0.9, 0, 1, 1, 0.28, 32, 16);
  to(0.085, 0.004, brass, 0, -0.9, 0, TAU, 6, 40);
  bx(0.012, 0.03, 0.008, brass, 0, -0.035, 0);
  back();
  // 頭（文字盤の箱）：y 1.36〜1.86
  const hy = y1, hH = 0.5;
  bx(Wd + 0.03, 0.035, D + 0.03, wd, 0, hy, 0, 0.004);
  bx(Wd, hH - 0.035, D, wd, 0, hy + 0.035, 0, 0.004);
  // 柱（両わきの細い円柱と、真ちゅうの頭）
  for (const x of [-1, 1]) { cy(0.016, 0.016, hH - 0.07, dark, x * (Wd / 2 - 0.005), hy + 0.05, zf + 0.012, 14); cy(0.02, 0.02, 0.012, brass, x * (Wd / 2 - 0.005), hy + hH - 0.032, zf + 0.012, 14); cy(0.02, 0.02, 0.012, brass, x * (Wd / 2 - 0.005), hy + 0.04, zf + 0.012, 14); }
  // 文字盤（クリーム色の紙にローマ数字）
  const cyc = hy + 0.035 + (hH - 0.035) / 2, R = 0.16;
  const dial = faceMat('pendialv2', (x, w, h) => {
    const c = w / 2; x.fillStyle = '#efe4c8'; x.fillRect(0, 0, w, h);
    const gr = x.createRadialGradient(c, c, c * 0.2, c, c, c); gr.addColorStop(0, 'rgba(255,250,235,0)'); gr.addColorStop(1, 'rgba(150,120,70,0.25)'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2a2018'; x.lineWidth = 3; x.beginPath(); x.arc(c, c, c * 0.93, 0, TAU); x.stroke(); x.lineWidth = 1.5; x.beginPath(); x.arc(c, c, c * 0.84, 0, TAU); x.stroke(); x.beginPath(); x.arc(c, c, c * 0.62, 0, TAU); x.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; const r0 = c * (i % 5 ? 0.89 : 0.86), r1 = c * 0.93; x.lineWidth = i % 5 ? 1.5 : 3; x.beginPath(); x.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); x.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); x.stroke(); }
    const ro = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    x.fillStyle = '#1f1812'; x.font = 'bold 38px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.save(); x.translate(c + Math.sin(a) * c * 0.73, c - Math.cos(a) * c * 0.73); x.rotate(a); x.fillText(ro[i], 0, 0); x.restore(); }
    x.font = 'italic 22px Georgia'; x.fillText('Physica', c, c * 1.32);
  }, 512, 512);
  const dm = new THREE.Mesh(new THREE.CircleGeometry(R, 64), dial); dm.position.set(0, cyc, zf + 0.002); g.add(dm);
  // 真ちゅうの縁と、ガラスのふた
  to(R + 0.008, 0.008, gold, 0, cyc, zf + 0.006, TAU, 10, 64);
  const cov = new THREE.Mesh(new THREE.CircleGeometry(R + 0.004, 48), GL('#ffffff', 0.08)); cov.position.set(0, cyc, zf + 0.012); g.add(cov);
  // 文字盤のまわりの四隅の金の飾り（スパンドレル）
  const fan = new THREE.CircleGeometry(0.05, 12, 0, PI / 2);
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    // 四隅の扇形の金の飾り（角に向かって開く）
    const f = new THREE.Mesh(fan, gold); f.position.set(x * (Wd / 2 - 0.03), cyc + y * 0.205, zf + 0.001);
    f.rotation.z = x > 0 ? (y > 0 ? PI : PI / 2) : (y > 0 ? -PI / 2 : 0); g.add(f);
  }
  // 針（黒い鉄。時と分）
  const mkHand = (len, wdt) => { const h = new THREE.Group(); h.position.set(0, cyc, zf + 0.009); const bk = pushGroup(h); bx(wdt, len, 0.002, P('#141210', 0.4, 0.5), 0, -0.02, 0); const tip = bx(wdt * 2.2, wdt * 2.2, 0.002, P('#141210', 0.4, 0.5), 0, len - 0.04, 0); tip.rotation.z = PI / 4; bk(); return h; };
  const hourH = mkHand(0.1, 0.007), minH = mkHand(0.14, 0.005);
  cy(0.008, 0.008, 0.006, brass, 0, cyc, zf + 0.011, 12).rotation.x = PI / 2;
  // 屋根：段になった軒と、まん中の真ちゅうの飾り
  const ty = hy + hH;
  bx(Wd + 0.06, 0.03, D + 0.05, wd, 0, ty, 0, 0.004);
  bx(Wd + 0.02, 0.025, D + 0.02, dark, 0, ty + 0.03, 0, 0.004);
  bx(Wd - 0.04, 0.02, D - 0.02, wd, 0, ty + 0.055, 0, 0.004);
  for (const x of [-1, 0, 1]) { cy(0.012, 0.018, 0.02, brass, x * (Wd / 2 - 0.03), ty + 0.075, 0.02, 12); sp(x ? 0.014 : 0.02, gold, x * (Wd / 2 - 0.03), ty + 0.11 + (x ? 0 : 0.006), 0.02, 1, 1.2, 1, 14, 10); }
  // 動き：振り子は1秒ごとに片道（長さ1mの振り子と同じ）。針は今の時刻
  g.userData.tick = (t) => {
    pend.rotation.z = 0.075 * Math.sin(t * PI);
    const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + m / 60;
    minH.rotation.z = -m / 60 * TAU; hourH.rotation.z = -hr / 12 * TAU;
  };
  g.userData.tick(0);
}

// プラズマボールのランプ：黒い台の上のガラス球。まん中の電極から、紫〜青の光の筋がゆらゆら伸びる
const PLASMA_VS = `uniform float uTime; uniform float uSeed; varying float vY;
void main() { vec3 p = position; float y = p.y; vY = y;
  float k = 2.6 * y * (1.0 - y); // 根もと（電極）と先（ガラスの内側）は動かさず、まん中だけゆらす
  p.x += (sin(y * 11.0 + uTime * 3.7 + uSeed) * 0.010 + sin(y * 27.0 - uTime * 6.3 + uSeed * 2.1) * 0.0035) * k;
  p.z += (cos(y * 9.0 - uTime * 3.1 + uSeed * 1.7) * 0.010 + cos(y * 23.0 + uTime * 5.9 + uSeed) * 0.0035) * k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const PLASMA_FS = `uniform vec3 uCore; uniform vec3 uTip; uniform float uFlick; varying float vY;
void main() { vec3 c = mix(uCore, uTip, smoothstep(0.1, 0.95, vY)); float a = (0.55 + 0.45 * vY) * uFlick; gl_FragColor = vec4(c * a, a); }`;
function plasmaLamp(s, g) {
  const black = P('#121214', 0.25, 0.2), chrome = MET('#e6e8ea', 0.1);
  // 台：つややかな黒の、すそ広がりの台。上に細いクロームの輪
  las([[0.095, 0], [0.098, 0.008], [0.09, 0.03], [0.072, 0.07], [0.062, 0.1], [0.064, 0.112]], black, 0, 0, 0, 40, 24);
  to(0.064, 0.003, chrome, 0, 0.112, 0, TAU, 8, 40).rotation.x = PI / 2;
  to(0.094, 0.0025, chrome, 0, 0.012, 0, TAU, 8, 48).rotation.x = PI / 2;
  // 前の小さなスイッチ
  const sw = cy(0.008, 0.008, 0.008, chrome, 0, 0.03, 0.088, 14); sw.rotation.x = PI / 2 - 0.5;
  // ガラス球（まん中が電極）
  const C = new THREE.Vector3(0, 0.235, 0), Rg = 0.125;
  sp(Rg, GL('#ece6ff', 0.1), C.x, C.y, C.z, 1, 1, 1, 48, 32);
  // 球の中のうすい紫のもや
  const haze = cm2('plasmahaze', () => new THREE.MeshBasicMaterial({ color: '#3a1a6a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
  sp(Rg - 0.004, haze, C.x, C.y, C.z, 1, 1, 1, 32, 20);
  // 電極（くもりガラスの小さな玉が、中から光る）と、支える黒い軸
  cy(0.006, 0.009, C.y - 0.112 - 0.02, P('#1b1b22', 0.3), 0, 0.112, 0, 12);
  sp(0.022, GLOW('#8a4dff', 1.1), C.x, C.y, C.z, 1, 1, 1, 24, 16);
  const core = new THREE.MeshBasicMaterial({ color: '#c9a2ff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  sp(0.032, core, C.x, C.y, C.z, 1, 1, 1, 20, 14);
  // 光の筋（電極からガラスの内側まで。形はシェーダーでゆらす）
  const fgeo = new THREE.CylinderGeometry(0.0022, 0.003, 1, 5, 24, true).translate(0, 0.5, 0);
  const tipGeo = new THREE.SphereGeometry(1, 10, 8);
  const N = 12, fil = [];
  for (let i = 0; i < N; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VS, fragmentShader: PLASMA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSeed: { value: i * 2.37 }, uCore: { value: new THREE.Color('#5a7dff') }, uTip: { value: new THREE.Color(i % 3 ? '#d070ff' : '#ff7ad9') }, uFlick: { value: 1 } },
    });
    const m = new THREE.Mesh(fgeo, mat); m.position.copy(C); m.scale.set(1, Rg - 0.006, 1); m.castShadow = false; g.add(m);
    // ガラスにふれる所の、小さな光の点
    const tm = new THREE.MeshBasicMaterial({ color: '#f0a8ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const tip = new THREE.Mesh(tipGeo, tm); tip.scale.setScalar(0.0028); tip.castShadow = false; g.add(tip);
    const a = i / N * TAU + i * 0.4, e = -0.15 + (i * 0.37 % 1) * 1.1;
    fil.push({ m, mat, tip, tm, a, e, sp: 0.35 + (i * 0.53 % 1) * 0.5 });
  }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  g.userData.tick = (t) => {
    for (const f of fil) {
      // 向きをゆっくりさまよわせる（下の台のほうには行かない）
      const az = f.a + Math.sin(t * f.sp + f.a) * 0.9 + t * 0.12;
      const el = Math.max(-0.35, Math.min(1.25, f.e + Math.sin(t * f.sp * 1.3 + f.a * 2) * 0.45));
      dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      f.m.quaternion.setFromUnitVectors(up, dir);
      f.mat.uniforms.uTime.value = t;
      const fl = 0.75 + 0.25 * Math.sin(t * 17 + f.a * 5) * Math.sin(t * 7.3 + f.a);
      f.mat.uniforms.uFlick.value = fl;
      f.tip.position.copy(C).addScaledVector(dir, Rg - 0.006);
      f.tm.opacity = 0.45 + 0.35 * fl;
    }
    core.opacity = 0.25 + 0.08 * Math.sin(t * 9.1);
  };
  g.userData.tick(1.5);
  g.userData.light = { color: '#b48aff', intensity: 0.35, y: C.y };
}
// 光の筋ごとの材質は家具ごとに持つ。共有してよい材質だけ、ここで覚えておく
const CM2 = new Map();
function cm2(k, make) { let m = CM2.get(k); if (!m) { m = make(); CM2.set(k, m); } return m; }

export const REWARD_BUILDERS = {
  akariLamp: [make(akariLamp), 'floor'],
  aburiDesk: [make(aburiDesk), 'floor'],
  rokujoBoard: [make(rokujoBoard), 'floor'],
  hikkoshiCrates: [make(hikkoshiCrates), 'floor'],
  pzCrown: [make(pzCrown), 'floor'],
  streak100: [make(streak100), 'floor'],
  bookTower: [make(bookTower), 'floor'],
  legendLaurel: [make(legendLaurel), 'wall'],
  zukan25: [make(zukan25), 'floor'],
  zukan50: [make(zukan50), 'floor'],
  zukan75: [make(zukan75), 'floor'],
  zukan100: [make(zukan100), 'wall'],
  aburiTop: [make(aburiTop), 'floor'],
  // 12月のイベント「冬のカフェ」
  cocoaCounter: [make(cocoaCounter), 'floor'],
  gingerHouse: [make(gingerHouse), 'floor'],
  cafeSign: [make(cafeSign), 'wall'],
  snowGarland: [make(snowGarland), 'wall'],
  // 11月のイベント「物理強化月間」
  newtonCradle: [make(newtonCradle), 'floor'],
  pendulumClock: [make(pendulumClock), 'floor'],
  plasmaLamp: [make(plasmaLamp), 'floor'],
};

// Poly Haven（CC0）のモデルと自作の形を組み合わせて作る家具（js/compose.js）。gacha.js の src: { gacha: '名前' } のままでよい
export const PARTS = {
  // 虫めがねと古い設計図の机：Poly Haven の木の机 ＋ 虫めがね ＋ 自作の設計図・丸めた図面・製図の道具
  aburiDesk: [
    { model: 'wooden_table_02', size: 1.15 }, // 高さ約80cmの木の机
    { gacha: 'aburiTop', noLens: true, stackOn: 0 },
    { model: 'magnifying_glass_01', size: 0.22, pos: [-0.38, 0, 0.06], rx: -Math.PI / 2, ry: 0.7, stackOn: 0 },
  ],
  // 積み上げた木箱の棚（おひっこし）：Poly Haven の木箱 ＋ 段ボール
  hikkoshiCrates: [
    { model: 'wooden_crate_02', size: 0.85 },
    { model: 'cardboard_box_01', size: 0.42, pos: [-0.12, 0, 0.02], ry: 0.25, stackOn: 0 },
  ],
  // ガラスの陳列ケース（図鑑50%）：自作のケース ＋ Poly Haven のつぼ・花瓶・馬の置物
  zukan50: [
    { gacha: 'zukan50', empty: true },
    { model: 'antique_ceramic_vase_01', size: 0.24, pos: [-0.14, 0.125, 0.02] },
    { model: 'horse_statue_01', size: 0.22, pos: [0.08, 0.505, 0.02], ry: -0.5 },
    { model: 'ceramic_vase_04', size: 0.2, pos: [-0.12, 0.905, 0.02] },
    { model: 'brass_vase_03', size: 0.18, pos: [0.12, 1.305, 0.02] },
  ],
  // 回転する展示台（図鑑75%）：自作の台 ＋ Poly Haven の大理石の胸像（台といっしょに回る）
  zukan75: [
    { gacha: 'zukan75', empty: true },
    { model: 'marble_bust_01', size: 0.46, attach: 'top', pos: [0, 0.02, 0] },
  ],
  // ランタンの冬のカフェ看板：自作の看板 ＋ Poly Haven のランタン（腕木につるす）
  cafeSign: [
    { gacha: 'cafeSign', noLantern: true },
    { model: 'Lantern_01', size: 0.26, attach: 'hook', pos: [0, -0.32, 0] },
  ],
};
