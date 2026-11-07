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
  la([[0.001, 0], [0.08, 0], [0.085, 0.012], [0.03, 0.03], [0.015, 0.05]], BRASS(), 0, 0, 0, 24);
  cy(0.008, 0.008, 0.07, BRASS(), 0, 0.04, 0, 8);
  const map = faceMat('globemap', (x, w, h) => {
    x.fillStyle = '#2f6fa0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8d9a8';
    const blobs = [[60, 50, 30, 22], [70, 85, 14, 26], [130, 45, 38, 20], [140, 80, 18, 22], [200, 60, 24, 16], [215, 100, 14, 10], [100, 115, 50, 8]];
    for (const [a, b, c, d] of blobs) { x.beginPath(); x.ellipse(a, b, c, d, 0.3, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,0.25)'; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); }
  }, 256, 128);
  map.emissive = new THREE.Color('#ffffff'); map.emissiveMap = map.map; map.emissiveIntensity = 0.55;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), map);
  const tilt = new THREE.Group(); tilt.rotation.z = 0.41; tilt.position.y = 0.27; g.add(tilt); tilt.add(globe);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.006, 6, 48, PI * 1.2), BRASS()); ring.rotation.set(0, PI / 2, -PI * 0.6); tilt.add(ring);
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
  // 中の飾り（つぼ・石・模型・メダル）
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
  const top = new THREE.Group(); top.position.y = 0.81; g.add(top);
  const back = pushGroup(top);
  cy(0.25, 0.25, 0.02, P('#1d1d1f', 0.25), 0, 0, 0, 40);
  // 金のオブジェ（ねじれた輪と球）
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.09, 0.025, 96, 12, 2, 3), GOLD()); knot.position.y = 0.17; knot.castShadow = true; top.add(knot);
  cy(0.05, 0.06, 0.05, MET('#2a2a2a', 0.3), 0, 0.02, 0, 20);
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

// gachafurn.js の BUILDERS に入れる（名前: [作る関数, 置き方]）
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
};
