// 旅館シリーズ（限定ガチャ「YUKEMURI」）の家具。gachafurn.js の BUILDERS に入る。gacha.js の行は series: 'ryokan'。
// 雰囲気：湯けむり・畳・木のぬくもり。和の雅シリーズ（黒漆と金）とかぶらないように、白木・藍染め・土壁の素朴であたたかい感じ。
// 正面は +Z、床が y=0。壁かけは背中が -Z（z=0 が壁の面）。単位はメートル。光る物は userData.light、動く物は userData.tick(t, dt)。
import * as THREE from 'three';
import { SF, buildWith, pushGroup, setWood } from './smallfurn.js';
import { matOf } from './procfurn.js';

const { bx, cy, la, las, sp, to, tb, pl, faced, faceMat, canvasMat, rnd, P, MET, GL, CLOTH, GLOW } = SF;
const PI = Math.PI, TAU = PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const make = (fn) => (spec) => { setWood(matOf); return buildWith(fn, spec); };
// 木：ひのき（白っぽい）・杉／けやき（中くらい）・こげ茶
const HINOKI = () => matOf('pine'), KEYAKI = () => matOf('oak'), KOGE = () => matOf('walnut');
const IRON = () => P('#2a2826', 0.6, 0.55);
const AI = '#26365e'; // 藍色
const MC = new Map();
const cm = (k, f) => { let m = MC.get(k); if (!m) { m = f(); MC.set(k, m); } return m; };

// 光る絵（和紙・窓の外の景色など）：絵の色のまま、うっすら光る
function glowMat(key, draw, w, h, glow = '#ffffff', i = 0.6) {
  return cm('gl' + key, () => {
    const m = canvasMat('rk' + key, w, h, draw).clone();
    m.emissive = new THREE.Color(glow); m.emissiveMap = m.map; m.emissiveIntensity = i; m.roughness = 0.9; m.side = THREE.DoubleSide;
    return m;
  });
}
// やわらかい丸い湯気の絵
function steamTex() {
  return cm('steamtex', () => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
// 湯気：ふわっと上って消える板（いつもカメラを向く）。n 個、(x0..x1, z0..z1) の範囲から
function steam(g, n, x0, x1, z0, z1, y0, rise = 0.5, size = 0.35, op = 0.22, seed = 3) {
  const r = rnd(seed), list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: steamTex(), transparent: true, opacity: 0, depthWrite: false, color: '#ffffff' });
    const s = new THREE.Sprite(m); s.castShadow = false;
    const p = { x: x0 + r() * (x1 - x0), z: z0 + r() * (z1 - z0), ph: r(), sp: 0.12 + r() * 0.1, dr: (r() - 0.5) * 0.12 };
    g.add(s); list.push([s, p]);
  }
  return (t) => {
    for (const [s, p] of list) {
      const k = (t * p.sp + p.ph) % 1;
      s.position.set(p.x + p.dr * k + Math.sin(t * 0.7 + p.ph * 9) * 0.03, y0 + k * rise, p.z);
      const sc = size * (0.55 + k * 0.9); s.scale.set(sc, sc, 1);
      s.material.opacity = op * Math.sin(k * PI) * (k < 0.15 ? k / 0.15 : 1);
    }
  };
}
// 板目の線を描いた、白木の板（縦板の継ぎ目が見える）
function plankMat(key, base, line, n, w = 256, h = 256) {
  return canvasMat('pl' + key, w, h, (x) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const r = rnd(7);
    for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(150,110,60,${0.05 + r() * 0.07})`; x.lineWidth = 0.6 + r(); const xx = r() * w; x.beginPath(); x.moveTo(xx, 0); x.bezierCurveTo(xx + (r() - 0.5) * 8, h * 0.3, xx + (r() - 0.5) * 8, h * 0.7, xx + (r() - 0.5) * 6, h); x.stroke(); }
    x.strokeStyle = line; x.lineWidth = 2; for (let i = 1; i < n; i++) { x.beginPath(); x.moveTo(i * w / n, 0); x.lineTo(i * w / n, h); x.stroke(); }
  }, { rough: 0.7 });
}
// 和紙（すこし繊維の見える白）
function washiDraw(x, w, h, base = '#f8f1e0') {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = rnd(11);
  for (let i = 0; i < 900; i++) { x.strokeStyle = `rgba(190,160,110,${r() * 0.12})`; x.lineWidth = 0.5; const a = r() * TAU, xx = r() * w, yy = r() * h, l = 3 + r() * 9; x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); x.stroke(); }
}
// 障子の格子（cols×rows のます目）
function shojiDraw(x, w, h, cols, rows, frame = '#c9a46e') {
  washiDraw(x, w, h);
  x.fillStyle = frame;
  for (let i = 0; i <= cols; i++) x.fillRect(i * w / cols - 2, 0, 4, h);
  for (let j = 0; j <= rows; j++) x.fillRect(0, j * h / rows - 2, w, 4);
}
// 丸い石（少しつぶれて、色がまだら）
function stone(x, y, z, r, s = 1, c = '#8d8a84') { const m = sp(r, P(c, 0.85), x, y, z, 1.1 * s, 0.55, 0.95, 14, 10); m.rotation.y = x * 7; return m; }

// ─────────────────────────── ★5 ───────────────────────────

// ひのきの露天風呂：白木の湯船にお湯がなみなみ。竹の筧（かけい）から湯が落ち、湯けむりが上る。うしろに竹垣、わきに石と湯桶
function rotenburo(s, g) {
  const hin = HINOKI(), W = 1.5, D = 0.95, H = 0.55, t = 0.06;
  const side = plankMat('hinokiside', '#e8cfa2', 'rgba(140,100,55,0.45)', 7);
  // 湯船の4枚の壁（板の継ぎ目つき）と底
  for (const z of [-1, 1]) faced(W, H, t, hin, side, 0, 0, z * (D / 2 - t / 2)).rotation.y = z < 0 ? PI : 0;
  for (const x of [-1, 1]) { const m = faced(D - t * 2, H, t, hin, side, x * (W / 2 - t / 2), 0, 0); m.rotation.y = x * PI / 2; }
  bx(W - t * 2, 0.04, D - t * 2, hin, 0, 0.02, 0);
  // 縁の厚い板（少し外にはり出す）と、角のたが
  for (const z of [-1, 1]) bx(W + 0.04, 0.035, 0.1, hin, 0, H, z * (D / 2 - 0.03), 0.006);
  for (const x of [-1, 1]) bx(0.1, 0.035, D - 0.12, hin, x * (W / 2 - 0.03), H, 0, 0.006);
  for (const x of [-1, 1]) for (const z of [-1, 1]) bx(0.07, H - 0.06, 0.07, KEYAKI(), x * (W / 2 + 0.005), 0.02, z * (D / 2 + 0.005), 0.01);
  // お湯（うすい緑がかった透明。縁のすぐ下まで）
  const water = cm('onsenwater', () => new THREE.MeshPhysicalMaterial({ color: '#9fcfc4', roughness: 0.05, transparent: true, opacity: 0.72, depthWrite: false, clearcoat: 1 }));
  const wm = pl(W - t * 2, D - t * 2, water, 0, H - 0.06, 0); wm.castShadow = false;
  // 床の石と、すのこ
  const r = rnd(5);
  for (let i = 0; i < 9; i++) stone(-W / 2 - 0.12 + r() * 0.2, 0.02, -D / 2 + r() * D, 0.07 + r() * 0.05, 1, ['#8d8a84', '#7a7670', '#9a958c'][i % 3]);
  for (let i = 0; i < 6; i++) bx(0.07, 0.03, 0.5, hin, W / 2 + 0.08 + i * 0.085, 0, 0.12, 0.006);
  for (const z of [-0.08, 0.32]) bx(0.5, 0.025, 0.04, KEYAKI(), W / 2 + 0.29, -0.0, z, 0.004);
  // 湯桶（ひのきの手おけ）を、すのこの上に
  const ok = new THREE.Group(); const back = pushGroup(ok);
  cy(0.11, 0.1, 0.12, hin, 0, 0, 0, 24, true); cy(0.1, 0.1, 0.012, hin, 0, 0.005, 0, 24);
  for (const y of [0.025, 0.09]) to(0.107, 0.004, MET('#b88a4a', 0.4), 0, y, 0, TAU, 6, 32).rotation.x = PI / 2;
  back(); ok.position.set(W / 2 + 0.3, 0.03, 0.2);
  // 竹垣（うしろの目かくし）
  const bam = cm('bamboo', () => P('#b7a46a', 0.5));
  const bamD = cm('bambooD', () => P('#8f7d48', 0.55));
  const fz = -D / 2 - 0.12, FW = W + 0.6, FH = 1.25;
  for (let i = 0; i < 26; i++) { const x = -FW / 2 + (i + 0.5) * FW / 26; cy(0.026, 0.026, FH - (i % 3) * 0.03, i % 4 ? bam : bamD, x, 0, fz, 10); }
  for (const y of [0.25, 0.75, 1.1]) { cy(0.018, 0.018, FW + 0.06, KOGE(), 0, 0, 0, 8).rotation.z = PI / 2; G_last(g).position.set(0, y, fz + 0.035); }
  for (const x of [-1, 1]) cy(0.045, 0.045, FH + 0.08, KOGE(), x * (FW / 2 + 0.02), 0, fz, 12);
  // 竹の筧（かけい）と、落ちる湯
  const kak = V3(-W / 2 + 0.22, H + 0.32, fz + 0.03), tip = V3(-W / 2 + 0.36, H + 0.24, -D / 2 + 0.2);
  rodBetween(g, kak, tip, 0.022, bam);
  cy(0.03, 0.03, H + 0.35, bamD, kak.x, 0, kak.z, 10);
  const fall = cm('onsenfall', () => new THREE.MeshPhysicalMaterial({ color: '#e8f6f4', roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }));
  const st = cy(0.008, 0.012, tip.y - (H - 0.06), fall, tip.x, H - 0.06, tip.z, 8); st.castShadow = false;
  const ring = to(0.04, 0.004, fall, tip.x, H - 0.055, tip.z, TAU, 6, 24); ring.rotation.x = PI / 2; ring.castShadow = false;
  // 湯けむり
  const tk = steam(g, 16, -W / 2 + 0.12, W / 2 - 0.12, -D / 2 + 0.12, D / 2 - 0.12, H - 0.05, 0.7, 0.3, 0.2, 9);
  g.userData.tick = (t) => { tk(t); const k = (t * 1.6) % 1; ring.scale.setScalar(0.6 + k * 1.4); ring.material.opacity = 0.45; };
  g.userData.tick(1.5);
}
// 直前に足した物
function G_last(g) { let o = g; while (o.children.length) o = o.children[o.children.length - 1]; return o; }
function rodBetween(g, a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = cy(r, r, len, mat, 0, 0, 0, 10);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return m;
}

// 囲炉裏と自在かぎ：炭がちらちら赤く光り、自在かぎに鉄びん。灰に刺した川魚の串焼き。天井の梁から吊る
function irori(s, g) {
  const S = 0.92, Hf = 0.12, rim = 0.11;
  // 炉ぶち（太いこげ茶の木）と、まわりの板の間
  bx(S + 0.5, 0.03, S + 0.5, plankMat('irofloor', '#b98d5c', 'rgba(70,40,20,0.5)', 6), 0, 0, 0, 0.004);
  for (const z of [-1, 1]) bx(S, Hf, rim, KOGE(), 0, 0.03, z * (S / 2 - rim / 2), 0.008);
  for (const x of [-1, 1]) bx(rim, Hf, S - rim * 2, KOGE(), x * (S / 2 - rim / 2), 0.03, 0, 0.008);
  // 灰（まんなかが少しくぼむ）
  const ash = cm('ash', () => P('#9c968c', 0.98));
  bx(S - rim * 2, 0.06, S - rim * 2, ash, 0, 0.03, 0, 0);
  las([[0.001, 0.09], [0.15, 0.1], [0.28, 0.095], [0.34, 0.09]], ash, 0, 0, 0, 24);
  // 炭（黒い角材に、赤く光る芯）
  const coal = cm('coal', () => P('#1b1a19', 0.9));
  const ember = cm('ember', () => new THREE.MeshStandardMaterial({ color: '#3a1a10', emissive: '#ff5a1a', emissiveIntensity: 1.6, roughness: 0.9 }));
  const r = rnd(4);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, rr = 0.05 + r() * 0.05;
    const m = bx(0.11, 0.035, 0.04, i % 2 ? coal : ember, Math.cos(a) * rr, 0.1, Math.sin(a) * rr, 0.01);
    m.rotation.set((r() - 0.5) * 0.4, a + 0.5, (r() - 0.5) * 0.3);
  }
  sp(0.05, ember, 0, 0.1, 0, 1, 0.35, 1, 12, 8);
  // 串にさした川魚（灰に斜めに刺す）
  const fish = cm('iwana', () => P('#8c7a5a', 0.45, 0.1));
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, R = 0.26;
    const k = new THREE.Group(); const back = pushGroup(k);
    cy(0.004, 0.004, 0.42, P('#d9c39a', 0.7), 0, -0.1, 0, 6);
    sp(0.026, fish, 0, 0.17, 0, 0.6, 2.6, 1.0, 12, 10);
    const tail = cy(0.0, 0.022, 0.04, fish, 0, 0.21, 0, 4); tail.scale.z = 0.3;
    back();
    k.position.set(Math.cos(a) * R, 0.1, Math.sin(a) * R); k.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
  // 自在かぎ：天井の梁 → 竹の筒 → 木の魚（横木）→ 鉤 → 鉄びん
  const top = 2.32;
  bx(1.3, 0.14, 0.14, KOGE(), 0, top, 0, 0.012);
  const bam = cm('bamboo2', () => P('#7a5a32', 0.5));
  cy(0.006, 0.006, 0.3, P('#5a4630', 0.8), 0, top - 0.3, 0, 6); // 縄
  cy(0.028, 0.028, 0.95, bam, 0, top - 1.25, 0, 12);
  for (let i = 1; i < 4; i++) to(0.03, 0.004, bam, 0, top - 1.25 + i * 0.24, 0, TAU, 6, 16).rotation.x = PI / 2;
  // 木の魚（鯉の形の横木）
  const koi = new THREE.Group(); const kb = pushGroup(koi);
  sp(0.09, KEYAKI(), 0, 0, 0, 1.9, 0.75, 0.32, 18, 12);
  const tl = cy(0.0, 0.07, 0.1, KEYAKI(), 0.2, -0.05, 0, 4); tl.rotation.z = PI / 2; tl.scale.z = 0.3;
  sp(0.012, P('#151413', 0.3), -0.12, 0.015, 0.03, 1, 1, 0.5, 8, 6); sp(0.012, P('#151413', 0.3), -0.12, 0.015, -0.03, 1, 1, 0.5, 8, 6);
  kb(); koi.position.set(0, top - 1.18, 0);
  // 鉤と鉄びん
  cy(0.008, 0.008, 0.5, IRON(), 0, top - 1.75, 0, 8);
  const kettle = new THREE.Group(); const eb = pushGroup(kettle);
  las([[0.001, 0], [0.09, 0.005], [0.125, 0.05], [0.13, 0.09], [0.11, 0.135], [0.06, 0.155], [0.045, 0.16]], IRON(), 0, 0, 0, 28);
  cy(0.048, 0.05, 0.02, IRON(), 0, 0.155, 0, 20); sp(0.014, IRON(), 0, 0.18, 0, 1, 1, 1, 8, 6);
  const sp1 = cy(0.012, 0.02, 0.1, IRON(), 0.14, 0.07, 0, 10); sp1.rotation.z = -1.0;
  const hd = to(0.1, 0.007, IRON(), 0, 0.17, 0, PI, 6, 24); void hd;
  eb(); kettle.position.set(0, top - 1.98, 0);
  // 鉄びんの口から、細い湯気
  const tk = steam(g, 4, 0.18, 0.22, -0.02, 0.02, top - 1.88, 0.35, 0.12, 0.18, 21);
  // ざぶとん2枚
  for (const [x, z, ry] of [[0, S / 2 + 0.35, 0], [-(S / 2 + 0.35), 0, PI / 2]]) { const m = bx(0.5, 0.06, 0.55, CLOTH('#7c3b2e'), x, 0.03, z, 0.025); m.rotation.y = ry; }
  g.userData.light = { color: '#ff9a4a', intensity: 0.8, y: 0.25 };
  g.userData.tick = (t) => { ember.emissiveIntensity = 1.3 + 0.35 * Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1) + 0.15 * Math.sin(t * 11); tk(t); kettle.rotation.z = Math.sin(t * 0.6) * 0.01; };
  g.userData.tick(1.5);
}

// 雪見障子の丸窓：こげ茶の丸い枠。上は障子、下はガラスで、雪の庭（灯籠と松）が見える。うっすら光る
function yukimiWindow(s, g) {
  const R = 0.56;
  // 壁の板（丸窓の入った土壁の小さな面）
  const clay = cm('yukimiclay', () => P('#c9b48e', 0.95));
  bx(1.36, 1.36, 0.03, clay, 0, -0.68, 0.015, 0.004);
  // 雪の庭の絵（光る）
  const view = glowMat('yukimiview', (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9c8dc'); gr.addColorStop(0.55, '#dde5ee'); gr.addColorStop(1, '#f4f6f8'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    // 遠くの山と木々
    x.fillStyle = '#9fb0c4'; x.beginPath(); x.moveTo(0, h * 0.5); for (let i = 0; i <= 10; i++) x.lineTo(i * w / 10, h * (0.42 + 0.06 * Math.sin(i * 1.7))); x.lineTo(w, h * 0.62); x.lineTo(0, h * 0.62); x.fill();
    const r = rnd(8);
    for (let i = 0; i < 14; i++) { const xx = r() * w, hh = h * (0.12 + r() * 0.1), yy = h * 0.6; x.fillStyle = '#5d6e64'; x.beginPath(); x.moveTo(xx, yy - hh); x.lineTo(xx - hh * 0.35, yy); x.lineTo(xx + hh * 0.35, yy); x.fill(); x.fillStyle = '#f4f7fa'; x.beginPath(); x.moveTo(xx, yy - hh); x.lineTo(xx - hh * 0.15, yy - hh * 0.6); x.lineTo(xx + hh * 0.15, yy - hh * 0.6); x.fill(); }
    // 雪の庭
    x.fillStyle = '#f7f9fb'; x.fillRect(0, h * 0.6, w, h * 0.4);
    // 雪見灯籠
    const lx = w * 0.66, ly = h * 0.86;
    x.fillStyle = '#6d6a64'; x.fillRect(lx - 8, ly - 70, 16, 70); x.fillRect(lx - 30, ly - 96, 60, 30);
    x.fillStyle = '#ffd98a'; x.fillRect(lx - 16, ly - 92, 32, 22);
    x.fillStyle = '#6d6a64'; x.beginPath(); x.moveTo(lx - 62, ly - 96); x.lineTo(lx, ly - 136); x.lineTo(lx + 62, ly - 96); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(lx, ly - 112, 52, 12, 0, PI, TAU); x.fill(); x.fillRect(lx - 60, ly - 100, 120, 6);
    // 松の枝（左から）
    x.strokeStyle = '#3b2e22'; x.lineWidth = 9; x.beginPath(); x.moveTo(0, h * 0.28); x.bezierCurveTo(w * 0.15, h * 0.3, w * 0.25, h * 0.22, w * 0.38, h * 0.26); x.stroke();
    for (const [cx, cy2, rr] of [[w * 0.12, h * 0.25, 40], [w * 0.26, h * 0.2, 46], [w * 0.38, h * 0.23, 34]]) { x.fillStyle = '#3f5a46'; x.beginPath(); x.ellipse(cx, cy2, rr * 1.4, rr * 0.55, 0, 0, TAU); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(cx, cy2 - rr * 0.3, rr * 1.25, rr * 0.28, 0, 0, TAU); x.fill(); }
    // ふる雪
    x.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 120; i++) { x.beginPath(); x.arc(r() * w, r() * h * 0.8, 1 + r() * 2, 0, TAU); x.fill(); }
  }, 512, 512, '#ffffff', 0.32);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 64), view); disc.position.set(0, 0, 0.032); g.add(disc);
  // 障子（上の半分）：円の上を切りとった形
  const shoji = glowMat('yukimishoji', (x, w, h) => shojiDraw(x, w, h, 6, 4, '#b48a56'), 256, 192, '#ffe7c2', 0.55);
  const half = new THREE.CircleGeometry(R, 64, 0.22, PI - 0.44); // 上の弓形
  const uv = half.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) - 0.5) * 2 * 0.85 + 0.0);
  const sh = new THREE.Mesh(half, shoji); sh.position.set(0, 0, 0.036); g.add(sh);
  // 障子の下の桟（横に1本）とガラスの桟
  const kumi = cm('kumiko', () => P('#7a5a3a', 0.6));
  bx(2 * R * Math.cos(0.22) * 0.98, 0.03, 0.02, kumi, 0, R * Math.sin(0.22) - 0.015, 0.04);
  for (const x of [-0.18, 0.18]) { const h2 = Math.sqrt(R * R - x * x) + R * Math.sin(0.22); bx(0.018, h2 - 0.03, 0.016, kumi, x, -Math.sqrt(R * R - x * x) + 0.01, 0.04); }
  // ガラス（下）
  const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 64, PI + 0.0, PI), GL('#eaf2f6', 0.12)); glass.position.set(0, 0, 0.045); g.add(glass);
  // 丸い枠（太いこげ茶の木）と、下の小さな台
  to(R + 0.02, 0.045, KOGE(), 0, 0, 0.05, TAU, 10, 80);
  bx(0.9, 0.04, 0.12, KOGE(), 0, -R - 0.12, 0.06, 0.008);
  // 枠の中心が y=0 になっているので、全体を上げる（底が y=0）
  for (const c of g.children) c.position.y += 0.68;
  g.userData.light = { color: '#e9f0ff', intensity: 0.5, y: 0.68 };
}

// ひのきの座卓と座椅子：白木の大きな座卓に、えんじの座椅子2つ。上にお茶のセット
function zatakuSet(s, g) {
  const hin = HINOKI(), top = plankMat('zataku', '#e6cb9c', 'rgba(150,105,55,0.35)', 3, 512, 256);
  const W = 1.2, D = 0.75, H = 0.33;
  faced(W, 0.04, D, hin, hin, 0, H - 0.04, 0, top).rotation.y = 0;
  bx(W - 0.08, 0.05, D - 0.08, hin, 0, H - 0.09, 0, 0.004);
  for (const x of [-1, 1]) for (const z of [-1, 1]) bx(0.07, H - 0.05, 0.07, hin, x * (W / 2 - 0.08), 0, z * (D / 2 - 0.08), 0.006);
  // 座椅子（えんじの布、背もたれは少し後ろに倒す）
  for (const z of [-1, 1]) {
    const c = new THREE.Group(); const back = pushGroup(c);
    zaisuShape('#6e2a26');
    back(); c.position.set(0, 0, z * (D / 2 + 0.38)); c.rotation.y = z > 0 ? PI : 0;
  }
  // お茶のセット（盆・急須・湯のみ2つ・菓子皿）
  teaSet(0.1, H, 0.05);
}
// 座椅子の形（前が +Z。座面の前のふちが z=+0.24）
function zaisuShape(col) {
  const fab = CLOTH(col), base = KOGE();
  bx(0.48, 0.035, 0.5, base, 0, 0, 0, 0.006);
  bx(0.46, 0.08, 0.48, fab, 0, 0.035, 0.0, 0.035);
  const bk = new THREE.Group(); const back = pushGroup(bk);
  bx(0.48, 0.5, 0.035, base, 0, 0, -0.02, 0.006);
  bx(0.46, 0.46, 0.07, fab, 0, 0.02, 0.025, 0.035);
  back(); bk.position.set(0, 0.06, -0.22); bk.rotation.x = -0.35;
}
// 盆にのったお茶のセット（中心 x,z、y は置く面の高さ）
function teaSet(x0, y0, z0) {
  const tray = cm('tray', () => P('#5a3220', 0.35));
  bx(0.36, 0.015, 0.24, tray, x0, y0, z0, 0.006);
  for (const sx of [-1, 1]) bx(0.36, 0.02, 0.012, tray, x0, y0 + 0.012, z0 + sx * 0.115, 0.004);
  const clay = cm('tokoname', () => P('#9a4a2a', 0.45)); // 常滑の朱泥
  // 急須（横に取っ手）
  las([[0.001, 0], [0.045, 0.004], [0.06, 0.03], [0.058, 0.06], [0.04, 0.078], [0.025, 0.082]], clay, x0 - 0.08, y0 + 0.015, z0, 24);
  cy(0.026, 0.028, 0.012, clay, x0 - 0.08, y0 + 0.095, z0, 16); sp(0.008, clay, x0 - 0.08, y0 + 0.112, z0, 1, 1, 1, 8, 6);
  const sp1 = cy(0.006, 0.012, 0.05, clay, x0 - 0.13, y0 + 0.05, z0, 8); sp1.rotation.z = 0.9;
  const hd = cy(0.009, 0.011, 0.07, clay, 0, 0, 0, 8); hd.rotation.x = PI / 2 - 0.25; hd.position.set(x0 - 0.08, y0 + 0.06, z0 + 0.085); // 横手
  // 湯のみ2つ（白い器に、緑茶）
  const cup = cm('yunomi', () => P('#ece6d8', 0.25)), tea = cm('ryokucha', () => P('#a8b85a', 0.15));
  for (const [dx, dz] of [[0.05, -0.05], [0.11, 0.04]]) {
    las([[0.001, 0], [0.026, 0], [0.03, 0.01], [0.033, 0.07], [0.03, 0.07], [0.027, 0.012], [0.001, 0.012]], cup, x0 + dx, y0 + 0.015, z0 + dz, 22);
    cy(0.029, 0.029, 0.002, tea, x0 + dx, y0 + 0.07, z0 + dz, 18);
  }
}

// のれんの入口かざり：藍染めの3枚ののれんに白で「ゆ」。木の竿に吊って、ゆらゆら揺れる（壁かけ）
function norenEntrance(s, g) {
  const Wn = 1.05, Hn = 0.95, n = 3, pw = Wn / n;
  // 竿と、壁から出る金具
  cy(0.022, 0.022, Wn + 0.2, KOGE(), 0, 0, 0, 14).rotation.z = PI / 2; G_last(g).position.set(0, Hn + 0.02, 0.09);
  for (const x of [-1, 1]) { bx(0.03, 0.06, 0.09, IRON(), x * (Wn / 2 + 0.05), Hn - 0.03, 0.045, 0.006); }
  // 上の木の小さな屋根（ひさし）
  bx(Wn + 0.3, 0.035, 0.24, KOGE(), 0, Hn + 0.12, 0.12, 0.006);
  for (const x of [-1, 1]) { const b = bx(0.03, 0.09, 0.2, KOGE(), x * (Wn / 2 + 0.12), Hn + 0.04, 0.1, 0.004); void b; }
  // のれんの布（3枚。全体で1つの絵）
  const panels = [];
  for (let i = 0; i < n; i++) {
    const mat = canvasMat('noren' + i, 128, 256, (x, w, h) => {
      x.fillStyle = AI; x.fillRect(0, 0, w, h);
      const r = rnd(20 + i); for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(10,20,40,${r() * 0.18})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 6); }
      // 全体の絵（幅 w*3）の、この部分だけ描く
      x.save(); x.translate(-i * w, 0);
      x.fillStyle = '#f4efe2'; x.font = 'bold 190px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('ゆ', w * 1.5, h * 0.48);
      // 下の白い波もよう
      x.strokeStyle = '#f4efe2'; x.lineWidth = 4;
      for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(k * w * 3 / 8, h * 0.95, 18, PI, TAU); x.stroke(); x.beginPath(); x.arc(k * w * 3 / 8, h * 0.95, 10, PI, TAU); x.stroke(); }
      x.restore();
      // 上の竿を通す輪
      x.fillStyle = '#1b2746'; x.fillRect(0, 0, w, 14);
    }, { rough: 0.95 });
    mat.side = THREE.DoubleSide;
    const geo = new THREE.PlaneGeometry(pw - 0.01, Hn - 0.04, 1, 8).translate(0, -(Hn - 0.04) / 2, 0);
    const m = new THREE.Mesh(geo, mat); m.position.set(-Wn / 2 + pw * (i + 0.5), Hn, 0.09); m.castShadow = true; g.add(m);
    panels.push(m);
  }
  g.userData.tick = (t) => { panels.forEach((m, i) => { m.rotation.x = 0.05 + 0.04 * Math.sin(t * 0.9 + i * 0.8) + 0.015 * Math.sin(t * 2.3 + i); }); };
  g.userData.tick(1.5);
  // 下の端を床から 1.0m に（壁の絵と同じく、置いた高さで調整できる）
}

// 床の間：一段高い床板、天然木の床柱、土壁に「湯」の書の掛け軸、竹の花入れに椿
function tokonoma(s, g) {
  const W = 1.25, D = 0.5, Ht = 1.95;
  // 床かまち（こげ茶）と床板（けやき）
  bx(W, 0.11, 0.05, KOGE(), 0, 0, D / 2 - 0.025, 0.006);
  bx(W, 0.1, D - 0.05, KEYAKI(), 0, 0, -0.025, 0.004);
  // 土壁（うしろと左右）
  const clay = cm('tokoclay', () => P('#c7ab7c', 0.96));
  bx(W, Ht, 0.04, clay, 0, 0, -D / 2 + 0.02);
  bx(0.04, Ht, D, clay, -W / 2 + 0.02, 0, 0);
  // 床柱（皮をむいた丸太。少し曲がって、こぶがある）
  const post = cm('tokopost', () => P('#b48d5e', 0.55));
  tb([[W / 2 - 0.05, 0, D / 2 - 0.05], [W / 2 - 0.045, 0.6, D / 2 - 0.05], [W / 2 - 0.06, 1.3, D / 2 - 0.05], [W / 2 - 0.05, Ht + 0.15, D / 2 - 0.05]], 0.055, post, 24, 14);
  for (const y of [0.5, 1.15, 1.6]) sp(0.03, post, W / 2 - 0.08, y, D / 2 - 0.03, 1, 1.4, 0.7, 10, 8);
  // 上の落とし掛け（横木）と小壁
  bx(W, 0.06, 0.05, KOGE(), 0, Ht - 0.32, D / 2 - 0.05, 0.004);
  bx(W - 0.04, 0.26, 0.03, clay, 0, Ht - 0.26, D / 2 - 0.05);
  // 掛け軸「湯」
  const jiku = new THREE.Group(); const back = pushGroup(jiku);
  const kake = faceMat('kakeyu', (x, w, h) => {
    x.fillStyle = '#6b5a3c'; x.fillRect(0, 0, w, h);                         // 表装の布
    x.fillStyle = '#8a7650'; x.fillRect(0, h * 0.1, w, h * 0.03); x.fillRect(0, h * 0.84, w, h * 0.03);
    x.fillStyle = '#f1e8d2'; x.fillRect(w * 0.12, h * 0.16, w * 0.76, h * 0.64);
    x.fillStyle = '#1c1915'; x.font = 'bold 200px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('湯', w / 2, h * 0.47);
    x.fillStyle = '#b8322a'; x.fillRect(w * 0.62, h * 0.7, 16, 16); // 落款
  }, 192, 512);
  faced(0.34, 0.9, 0.004, P('#6b5a3c', 0.8), kake, 0, 0, 0);
  cy(0.012, 0.012, 0.42, KOGE(), 0, 0, 0, 10).rotation.z = PI / 2; G_last(g).position.set(0, 0.0, 0.006);
  cy(0.008, 0.008, 0.38, KOGE(), 0, 0, 0, 8).rotation.z = PI / 2; G_last(g).position.set(0, 0.9, 0.004);
  back(); jiku.position.set(-0.1, 0.5, -D / 2 + 0.045);
  // 竹の花入れと椿（赤い花と濃い緑の葉）
  const bam = cm('bamboo3', () => P('#a8935a', 0.45));
  cy(0.045, 0.045, 0.32, bam, 0.3, 0.1, 0.0, 14);
  to(0.046, 0.005, bam, 0.3, 0.26, 0, TAU, 6, 18).rotation.x = PI / 2;
  const leaf = cm('tsubakiL', () => P('#1f3a26', 0.3)), flower = cm('tsubakiF', () => P('#b3222e', 0.4)), stem = cm('tsubakiS', () => P('#4a3a28', 0.7));
  tb([[0.3, 0.38, 0], [0.26, 0.55, 0.02], [0.18, 0.7, 0.04], [0.1, 0.78, 0.05]], 0.006, stem, 12, 5);
  tb([[0.3, 0.38, 0], [0.34, 0.5, 0.02], [0.4, 0.6, 0.03]], 0.005, stem, 10, 5);
  const r = rnd(12);
  for (let i = 0; i < 9; i++) { const t2 = r(), p = i < 6 ? [0.3 - t2 * 0.2, 0.42 + t2 * 0.35, 0.02 + t2 * 0.03] : [0.3 + t2 * 0.1, 0.42 + t2 * 0.18, 0.02]; const l = sp(0.032, leaf, p[0], p[1], p[2], 1, 0.22, 0.5, 10, 6); l.rotation.set(r() * 2, r() * 3, r() * 2); }
  for (const [x, y, z] of [[0.12, 0.76, 0.07], [0.4, 0.61, 0.05]]) { sp(0.035, flower, x, y, z, 1, 0.75, 1, 14, 10); sp(0.012, P('#f2c94a', 0.6), x, y + 0.02, z + 0.012, 1, 1, 1, 8, 6); }
  // 香炉
  las([[0.001, 0], [0.04, 0.005], [0.05, 0.03], [0.045, 0.05], [0.035, 0.055]], P('#3a3833', 0.5, 0.4), -0.42, 0.1, 0.08, 18);
  g.userData.light = null;
}

// ─────────────────────────── ★4 ───────────────────────────

// 木の角行灯：白木の枠に和紙。中のあかりがゆれる
function kakuAndon(s, g) {
  const hin = HINOKI(), Wd = 0.3, H = 0.62;
  bx(0.4, 0.04, 0.4, KEYAKI(), 0, 0, 0, 0.008);
  for (const x of [-1, 1]) for (const z of [-1, 1]) bx(0.026, H, 0.026, hin, x * Wd / 2, 0.04, z * Wd / 2, 0.004);
  for (const y of [0.1, 0.38, H + 0.02]) for (const k of [-1, 1]) { bx(Wd + 0.026, 0.02, 0.02, hin, 0, y, k * Wd / 2, 0.003); bx(0.02, 0.02, Wd, hin, k * Wd / 2, y, 0, 0.003); }
  const paper = glowMat('kakuandon', (x, w, h) => { washiDraw(x, w, h); x.fillStyle = '#c9a46e'; x.fillRect(0, h * 0.52, w, 5); }, 128, 256, '#ffc77a', 1.1);
  const pg = new THREE.PlaneGeometry(Wd - 0.02, H - 0.1);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; const m = new THREE.Mesh(pg, paper); m.position.set(Math.sin(a) * (Wd / 2 - 0.004), 0.1 + (H - 0.1) / 2, Math.cos(a) * (Wd / 2 - 0.004)); m.rotation.y = a; g.add(m); }
  // 上の取っ手
  bx(0.02, 0.12, 0.02, hin, -0.06, H + 0.04, 0, 0.003); bx(0.02, 0.12, 0.02, hin, 0.06, H + 0.04, 0, 0.003); bx(0.16, 0.025, 0.025, hin, 0, H + 0.16, 0, 0.004);
  g.userData.light = { color: '#ffc98a', intensity: 0.8, y: 0.38 };
  g.userData.tick = (t) => { paper.emissiveIntensity = 1.05 + 0.08 * Math.sin(t * 5.3) * Math.sin(t * 2.1); };
}

// ふかふかの布団：白い敷き布団に、藍のかすりの掛け布団。そば殻の枕
function futon(s, g) {
  const sheet = cm('futonsheet', () => P('#f4f1ea', 0.9));
  bx(1.0, 0.1, 2.05, sheet, 0, 0, 0, 0.045);
  const kasuri = canvasMat('kasuri', 256, 256, (x, w, h) => {
    x.fillStyle = '#2a3b66'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(240,236,226,0.9)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const cx = (i + (j % 2) * 0.5) * w / 8 + 8, cy2 = j * h / 8 + 10; x.fillRect(cx - 7, cy2 - 1.5, 14, 3); x.fillRect(cx - 1.5, cy2 - 7, 3, 14); }
    x.strokeStyle = 'rgba(10,15,30,0.25)'; for (let k = 0; k < 60; k++) { x.beginPath(); const yy = Math.random() * h; x.moveTo(0, yy); x.lineTo(w, yy + 2); x.stroke(); }
  }, { rough: 0.95 });
  kasuri.map.wrapS = kasuri.map.wrapT = THREE.RepeatWrapping; kasuri.map.repeat.set(2, 3);
  // 掛け布団：ふくらんだ形、足もとに向かって少しずれて、手前の角を折り返す
  bx(1.06, 0.13, 1.5, kasuri, 0, 0.09, 0.28, 0.06);
  const fold = bx(1.06, 0.05, 0.3, sheet, 0, 0.215, -0.32, 0.024); void fold;
  // 枕（そば殻。少しつぶれた丸い形）
  sp(0.13, CLOTH('#efe6cf'), 0, 0.15, -0.78, 2.2, 0.5, 1.0, 18, 10);
  sp(0.13, CLOTH('#7c3b2e'), 0, 0.15, -0.78, 2.25, 0.18, 1.02, 18, 6);
}

// えんじの座椅子
function zaisuOne(s, g) { zaisuShape(s.fabric || '#6e2a26'); }

// 広縁の籐のテーブルセット：窓辺の小さなガラスのテーブルと、籐の椅子2つ（旅館の窓ぎわの、あの一角）
function engawaSet(s, g) {
  const weave = canvasMat('rattan', 128, 128, (x, w, h) => {
    x.fillStyle = '#c9a065'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#b3884e' : '#dcb57a'; x.fillRect(i * 8 + 1, j * 8 + 1, 6, 6); }
    x.strokeStyle = 'rgba(90,60,25,0.5)'; x.lineWidth = 1; for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 8, 0); x.lineTo(i * 8, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 8); x.lineTo(w, i * 8); x.stroke(); }
  }, { rough: 0.8 });
  weave.map.wrapS = weave.map.wrapT = THREE.RepeatWrapping; weave.map.repeat.set(3, 3);
  const cane = cm('cane', () => P('#a87c45', 0.5));
  // テーブル（籐の脚に、丸いガラスの天板）
  cy(0.3, 0.3, 0.012, GL('#dfeee8', 0.35), 0, 0.5, 0, 40);
  to(0.3, 0.012, cane, 0, 0.506, 0, TAU, 8, 48).rotation.x = PI / 2;
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; cy(0.016, 0.016, 0.5, cane, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 10); }
  to(0.2, 0.01, cane, 0, 0.18, 0, TAU, 6, 40).rotation.x = PI / 2;
  // 椅子2つ（向かい合わせ、少し内向き）
  for (const sx of [-1, 1]) {
    const c = new THREE.Group(); const back = pushGroup(c);
    // 座面・背・ひじ（籐の編み目）と、四角い枠
    bx(0.56, 0.08, 0.52, weave, 0, 0.32, 0, 0.02);
    bx(0.58, 0.42, 0.06, weave, 0, 0.36, -0.25, 0.02);
    for (const x of [-1, 1]) { bx(0.06, 0.24, 0.5, weave, x * 0.29, 0.36, 0.0, 0.02); cy(0.022, 0.022, 0.62, cane, x * 0.29, 0.0, 0.24, 10); cy(0.022, 0.022, 0.78, cane, x * 0.29, 0.0, -0.25, 10); }
    for (const x of [-1, 1]) { const b = cy(0.022, 0.022, 0.5, cane, x * 0.29, 0.6, 0.0, 10); b.rotation.x = PI / 2; b.position.set(x * 0.29, 0.61, 0.0); }
    // 白い座布団
    bx(0.5, 0.07, 0.46, CLOTH('#efe8d8'), 0, 0.4, 0.02, 0.03);
    back(); c.position.set(sx * 0.62, 0, 0.0); c.rotation.y = -sx * (PI / 2 - 0.35);
  }
  // テーブルの上：湯上がりの牛乳びん
  for (const dx of [-0.05, 0.06]) { cy(0.025, 0.028, 0.11, GL('#ffffff', 0.85), dx, 0.512, 0.02, 16); cy(0.026, 0.026, 0.012, P('#e8d7a8', 0.5), dx, 0.62, 0.02, 16); }
}

// 茶だんす：けやきの小さな茶だんす。上は違い棚、下は引き戸、小さな引き出しに金の輪の取っ手
function chadansu(s, g) {
  const kz = KOGE(), dk = matOf('#3a2416'), W = 0.9, H = 0.88, D = 0.38;
  bx(W, 0.03, D, dk, 0, 0, 0, 0.004);                                     // 台輪
  bx(0.03, H - 0.03, D, kz, -W / 2 + 0.015, 0.03, 0); bx(0.03, H - 0.03, D, kz, W / 2 - 0.015, 0.03, 0);
  bx(W, 0.03, D + 0.02, kz, 0, H, 0.01, 0.004);                            // 天板
  bx(W - 0.06, H - 0.03, 0.015, kz, 0, 0.03, -D / 2 + 0.008);              // 背板
  // 下：引き戸2枚（板の框）
  for (const x of [-1, 1]) { const dz = x < 0 ? D / 2 - 0.012 : D / 2 - 0.03; bx((W - 0.06) / 2 + 0.01, 0.32, 0.018, kz, x * (W - 0.06) / 4, 0.04, dz, 0.003); bx((W - 0.06) / 2 - 0.08, 0.24, 0.006, dk, x * (W - 0.06) / 4, 0.08, dz + 0.009, 0.002); sp(0.012, MET('#b8955a', 0.35), x * (W - 0.06) / 4 + (x < 0 ? 0.15 : -0.15), 0.2, dz + 0.012, 1, 1, 0.4, 10, 8); }
  bx(W - 0.06, 0.02, D - 0.03, kz, 0, 0.37, 0.0);
  // 中：違い棚
  bx(0.48, 0.02, D - 0.06, kz, -0.18, 0.55, 0.0, 0.003); bx(0.42, 0.02, D - 0.06, kz, 0.21, 0.63, 0.0, 0.003);
  bx(0.02, 0.08, 0.02, dk, 0.0, 0.55, 0.05, 0.002);
  // 上：小さな引き出し2つ
  for (const x of [-1, 1]) { bx((W - 0.06) / 2 - 0.01, 0.12, 0.02, kz, x * (W - 0.06) / 4, 0.75, D / 2 - 0.01, 0.003); to(0.016, 0.003, MET('#b8955a', 0.35), x * (W - 0.06) / 4, 0.8, D / 2 + 0.006, TAU, 6, 16); }
  bx(W - 0.06, 0.02, D - 0.03, kz, 0, 0.73, 0.0);
  // 中の物：茶筒と、湯のみの箱
  cy(0.035, 0.035, 0.13, P('#2f4a3a', 0.4, 0.2), -0.3, 0.57, 0.0, 18); cy(0.036, 0.036, 0.03, MET('#b8955a', 0.35), -0.3, 0.67, 0.0, 18);
  bx(0.16, 0.08, 0.12, P('#e9dcc0', 0.8), 0.2, 0.65, 0.0, 0.004);
}

// 松の盆栽：低い長方形の鉢に、くねった幹と平たい葉の雲。小さな木の台つき
function bonsai(s, g) {
  bx(0.5, 0.04, 0.32, KOGE(), 0, 0.12, 0, 0.006);
  for (const x of [-1, 1]) for (const z of [-1, 1]) bx(0.04, 0.12, 0.04, KOGE(), x * 0.21, 0, z * 0.12, 0.004);
  const pot = cm('bonsaipot', () => P('#5a3a2c', 0.55));
  bx(0.38, 0.08, 0.22, pot, 0, 0.16, 0, 0.012);
  bx(0.34, 0.012, 0.18, P('#4a4236', 0.95), 0, 0.236, 0, 0);
  for (let i = 0; i < 6; i++) sp(0.02, P('#5d7a3a', 0.9), -0.1 + i * 0.04, 0.24, (i % 2 - 0.5) * 0.08, 1, 0.4, 1, 8, 6);
  const bark = cm('pinebark', () => P('#4a3a2a', 0.85));
  tb([[-0.04, 0.24, 0], [0.02, 0.32, 0.01], [-0.06, 0.42, 0.0], [0.03, 0.5, -0.02], [0.08, 0.58, 0.0]], 0.022, bark, 32, 10);
  tb([[-0.04, 0.4, 0.0], [-0.14, 0.44, 0.03], [-0.22, 0.43, 0.04]], 0.012, bark, 12, 6);
  tb([[0.02, 0.5, -0.01], [0.13, 0.52, -0.03], [0.2, 0.5, -0.02]], 0.01, bark, 12, 6);
  const nd = cm('pineneedle', () => P('#2f4d2c', 0.75)), nd2 = cm('pineneedle2', () => P('#3e6236', 0.75));
  const r = rnd(9);
  for (const [cx, cy2, cz, rr] of [[-0.22, 0.46, 0.04, 0.09], [0.2, 0.53, -0.02, 0.08], [0.08, 0.62, 0.0, 0.1], [-0.06, 0.52, -0.03, 0.06]]) {
    for (let k = 0; k < 6; k++) sp(rr * (0.55 + r() * 0.3), k % 2 ? nd : nd2, cx + (r() - 0.5) * rr * 1.4, cy2 + (r() - 0.3) * rr * 0.4, cz + (r() - 0.5) * rr, 1.2, 0.42, 1, 12, 8);
  }
}

// 衣桁と浴衣：木の衣桁に、白地に藍の浴衣と帯をかける
function ikoYukata(s, g) {
  const hin = KEYAKI(), W = 1.2, H = 1.5;
  for (const x of [-1, 1]) { bx(0.05, 0.05, 0.4, hin, x * W / 2, 0, 0, 0.008); bx(0.04, H, 0.04, hin, x * W / 2, 0.05, 0, 0.004); }
  bx(W + 0.2, 0.045, 0.045, hin, 0, H + 0.02, 0, 0.006); bx(W, 0.035, 0.035, hin, 0, 0.55, 0, 0.004);
  for (const x of [-1, 1]) { const e = bx(0.08, 0.04, 0.05, hin, x * (W / 2 + 0.12), H + 0.03, 0, 0.004); e.rotation.z = x * 0.25; }
  // 浴衣（両そでを広げてかける）
  const yu = canvasMat('yukata', 256, 256, (x, w, h) => {
    x.fillStyle = '#f5f2ea'; x.fillRect(0, 0, w, h);
    // 藍のよろけ縞（旅館の浴衣の定番）
    x.fillStyle = AI;
    for (let i = 0; i < 11; i++) { const x0 = i * w / 11 + 6; x.beginPath(); x.moveTo(x0, 0); for (let y = 0; y <= h; y += 16) x.lineTo(x0 + Math.sin(y * 0.05 + i) * 3, y); for (let y = h; y >= 0; y -= 16) x.lineTo(x0 + 7 + Math.sin(y * 0.05 + i + 0.5) * 3, y); x.fill(); }
  }, { rough: 0.95 });
  yu.side = THREE.DoubleSide;
  const body = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.25, 1, 6), yu); body.position.set(0, H + 0.02 - 0.63, 0.03); g.add(body);
  for (const x of [-1, 1]) { const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.48), yu); sl.position.set(x * 0.52, H - 0.22, 0.03); g.add(sl); }
  // えり（藍）と帯（からし色）
  for (const x of [-1, 1]) { const e = bx(0.06, 0.7, 0.006, CLOTH(AI), x * 0.08, H - 0.68, 0.035); e.rotation.z = -x * 0.22; }
  const obi = bx(0.62, 0.11, 0.012, CLOTH('#c89a3a'), 0, H - 0.72, 0.038, 0.004); void obi;
}

// 将棋盤：厚いかやの盤に、駒をならべた対局の途中。駒台つき
function shogiBan(s, g) {
  const kaya = cm('kaya', () => P('#e2b86e', 0.5));
  const board = canvasMat('shogiban', 512, 512, (x, w, h) => {
    x.fillStyle = '#e4bb72'; x.fillRect(0, 0, w, h);
    const r = rnd(3); for (let i = 0; i < 120; i++) { x.strokeStyle = `rgba(150,100,40,${r() * 0.12})`; x.beginPath(); const yy = r() * h; x.moveTo(0, yy); x.bezierCurveTo(w * 0.3, yy + 4, w * 0.6, yy - 4, w, yy + 2); x.stroke(); }
    x.strokeStyle = '#2a1d10'; x.lineWidth = 2; const m = 26, c = (w - m * 2) / 9;
    for (let i = 0; i <= 9; i++) { x.beginPath(); x.moveTo(m + i * c, m); x.lineTo(m + i * c, h - m); x.stroke(); x.beginPath(); x.moveTo(m, m + i * c); x.lineTo(w - m, m + i * c); x.stroke(); }
    x.fillStyle = '#2a1d10'; for (const [i, j] of [[3, 3], [6, 3], [3, 6], [6, 6]]) { x.beginPath(); x.arc(m + i * c, m + j * c, 4, 0, TAU); x.fill(); }
  });
  const S = 0.34, T = 0.1;
  faced(S, T, S, kaya, kaya, 0, 0.1, 0, board);
  for (const x of [-1, 1]) for (const z of [-1, 1]) { las([[0.001, 0], [0.03, 0.005], [0.025, 0.05], [0.032, 0.085], [0.02, 0.1], [0.001, 0.1]], kaya, x * 0.11, 0, z * 0.11, 14); }
  // 駒（五角形）
  const kgeo = cm('komageo', () => { const sh = new THREE.Shape(); sh.moveTo(-0.0085, 0); sh.lineTo(0.0085, 0); sh.lineTo(0.0075, 0.02); sh.lineTo(0, 0.026); sh.lineTo(-0.0075, 0.02); sh.closePath(); const ge = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false }); ge.rotateX(-PI / 2); return ge; });
  const koma = cm('koma', () => P('#f0d79a', 0.45));
  const cell = (S * (1 - 52 / 512)) / 9, x0 = -S / 2 + S * 26 / 512;
  const r = rnd(5);
  const put = (i, j, flip) => { const m = new THREE.Mesh(kgeo, koma); m.position.set(x0 + (i + 0.5) * cell, 0.2, x0 + (j + 0.5) * cell + (flip ? -0.012 : 0.012)); m.rotation.y = flip ? PI : 0; m.castShadow = true; g.add(m); };
  for (let i = 0; i < 9; i++) { if (r() > 0.25) put(i, 6, false); if (r() > 0.25) put(i, 2, true); }
  for (const [i, j, f] of [[1, 7, 0], [7, 7, 0], [1, 1, 1], [7, 1, 1], [4, 8, 0], [4, 0, 1], [3, 8, 0], [5, 8, 0], [3, 0, 1], [5, 0, 1], [4, 4, 0], [2, 5, 0], [6, 3, 1]]) put(i, j, !!f);
  // 駒台
  for (const x of [-1, 1]) { bx(0.12, 0.1, 0.12, kaya, x * 0.27, 0, 0.05, 0.004); put(0, 0, false); G_last(g).position.set(x * 0.27, 0.1, 0.05); }
}

// 湯けむりの掛け軸：雪山のふもとの湯の里の水墨画
function yukemuriScroll(s, g) {
  const mat = faceMat('yukemuriscroll', (x, w, h) => {
    x.fillStyle = '#3e4a5a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#56667a'; x.fillRect(0, h * 0.08, w, h * 0.025); x.fillRect(0, h * 0.86, w, h * 0.025);
    const px = w * 0.1, py = h * 0.13, pw = w * 0.8, ph = h * 0.7;
    x.fillStyle = '#efe6cf'; x.fillRect(px, py, pw, ph);
    x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
    // 山（墨のぼかし）
    for (const [a, b, c2, col] of [[0.1, 0.42, 0.45, 'rgba(40,40,45,0.35)'], [0.45, 0.32, 0.6, 'rgba(30,30,35,0.55)'], [0.75, 0.46, 0.4, 'rgba(50,50,55,0.3)']]) { x.fillStyle = col; x.beginPath(); x.moveTo(px + pw * (a - c2 / 2), py + ph * 0.7); x.quadraticCurveTo(px + pw * a, py + ph * (b - 0.12), px + pw * (a + c2 / 2), py + ph * 0.7); x.fill(); }
    // 雪の山の頂（白く残す）
    x.fillStyle = '#efe6cf'; x.beginPath(); x.moveTo(px + pw * 0.38, py + ph * 0.36); x.quadraticCurveTo(px + pw * 0.45, py + ph * 0.22, px + pw * 0.52, py + ph * 0.36); x.fill();
    // 湯の里の屋根と湯けむり
    x.fillStyle = 'rgba(25,25,30,0.8)'; for (const xx of [0.25, 0.4, 0.58, 0.72]) { x.beginPath(); x.moveTo(px + pw * (xx - 0.07), py + ph * 0.8); x.lineTo(px + pw * xx, py + ph * 0.74); x.lineTo(px + pw * (xx + 0.07), py + ph * 0.8); x.fill(); x.fillRect(px + pw * (xx - 0.05), py + ph * 0.8, pw * 0.1, ph * 0.05); }
    x.strokeStyle = 'rgba(80,80,90,0.35)'; x.lineWidth = 3; for (const xx of [0.3, 0.5, 0.66]) { x.beginPath(); x.moveTo(px + pw * xx, py + ph * 0.74); x.bezierCurveTo(px + pw * (xx - 0.05), py + ph * 0.66, px + pw * (xx + 0.05), py + ph * 0.6, px + pw * xx, py + ph * 0.52); x.stroke(); }
    x.fillStyle = '#b8322a'; x.fillRect(px + pw * 0.8, py + ph * 0.86, 12, 12);
    x.restore();
  }, 192, 512);
  const S2 = 0.5;
  faced(S2, S2 * 2.6, 0.004, P('#3e4a5a', 0.8), mat, 0, 0, 0.004);
  cy(0.013, 0.013, S2 + 0.08, KOGE(), 0, 0, 0, 10).rotation.z = PI / 2; G_last(g).position.set(0, 0.0, 0.012);
  cy(0.009, 0.009, S2 + 0.02, KOGE(), 0, 0, 0, 8).rotation.z = PI / 2; G_last(g).position.set(0, S2 * 2.6, 0.01);
  tb([[-0.15, S2 * 2.6, 0.01], [0, S2 * 2.6 + 0.12, 0.004], [0.15, S2 * 2.6, 0.01]], 0.002, P('#c8a86a', 0.6), 10, 4);
  for (const c of g.children) c.position.y += 0.02;
}

// い草のラグ（花ござ）：い草色に、えんじと藍のふち
function igusaRug(s, g) {
  const W = s.w || 2.0, D = s.d || 1.4;
  const m = canvasMat('igusa', 512, 384, (x, w, h) => {
    x.fillStyle = '#b9b27a'; x.fillRect(0, 0, w, h);
    const r = rnd(2); for (let j = 0; j < h; j += 3) { x.fillStyle = `rgba(${120 + r() * 40},${115 + r() * 30},${60 + r() * 20},0.5)`; x.fillRect(0, j, w, 2); }
    for (let i = 0; i < w; i += 24) { x.fillStyle = 'rgba(90,80,40,0.25)'; x.fillRect(i, 0, 1, h); }
    // ふち（えんじ）と内側の藍の線、四隅の小さな麻の葉
    x.fillStyle = '#7c3b2e'; x.fillRect(0, 0, w, 22); x.fillRect(0, h - 22, w, 22); x.fillRect(0, 0, 22, h); x.fillRect(w - 22, 0, 22, h);
    x.fillStyle = AI; x.fillRect(34, 34, w - 68, 5); x.fillRect(34, h - 39, w - 68, 5); x.fillRect(34, 34, 5, h - 68); x.fillRect(w - 39, 34, 5, h - 68);
    // ところどころに、織りこんだ小さな花
    for (const [cx, cy2] of [[w * 0.3, h * 0.35], [w * 0.7, h * 0.65], [w * 0.5, h * 0.5], [w * 0.25, h * 0.72], [w * 0.75, h * 0.28]]) for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; x.fillStyle = k % 2 ? 'rgba(124,59,46,0.7)' : 'rgba(124,59,46,0.55)'; x.beginPath(); x.ellipse(cx + Math.cos(a) * 9, cy2 + Math.sin(a) * 9, 7, 4, a, 0, TAU); x.fill(); }
  }, { rough: 0.95 });
  const mesh = bx(W, 0.012, D, m, 0, 0, 0, 0); mesh.castShadow = false;
}

export const RYOKAN_BUILDERS = {
  // ★5
  rotenburo: [make(rotenburo), 'floor'],
  irori: [make(irori), 'floor'],
  yukimiWindow: [make(yukimiWindow), 'wall'],
  zatakuSet: [make(zatakuSet), 'floor'],
  norenEntrance: [make(norenEntrance), 'wall'],
  tokonoma: [make(tokonoma), 'floor'],
  // ★4
  kakuAndon: [make(kakuAndon), 'floor'],
  futon: [make(futon), 'floor'],
  zaisu: [make(zaisuOne), 'floor'],
  engawaSet: [make(engawaSet), 'floor'],
  chadansu: [make(chadansu), 'floor'],
  bonsai: [make(bonsai), 'floor'],
  ikoYukata: [make(ikoYukata), 'floor'],
  shogiBan: [make(shogiBan), 'floor'],
  yukemuriScroll: [make(yukemuriScroll), 'wall'],
  igusaRug: [make(igusaRug), 'floor'],
};
