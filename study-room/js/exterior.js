// 家の外。郊外の住宅街に建つ一軒家。
// 奥の壁(-z)の窓の外：ウッドデッキ → 芝生の庭 → 木の柵 → 歩道と道路（電柱・街灯）→ 向かいの家々 → 遠くの丘。
// 1階の部屋は地面の高さ、2階の部屋（level=1）は同じ景色を3m上から見る。
import * as THREE from 'three';
import { texturedMaterial, fitMaterial, loadModel, loadTex, shadowAll } from './loaders.js';

const TREES = {
  island_tree_01: { w: 4.76, h: 5.03 },
  island_tree_02: { w: 4.21, h: 3.41 },
  tree_small_02: { w: 2.92, h: 4.56 },
};

// 決まった乱数（毎回同じ街になる）
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export async function buildExterior(mood, level = 0) {
  const g = new THREE.Group();
  g.position.y = -3.0 * level;
  const night = mood.photo === 'night';
  const R = rng(11);

  const [deckM, grassM, walkM, roadM, fenceM, blockM, roofA, roofB, wallA, wallB, wallC] = await Promise.all([
    texturedMaterial('wood_floor_deck', { rep: 2 }),
    texturedMaterial('grass_ground', { rep: 3, tint: '#9cc46e' }),
    texturedMaterial('concrete_tiles', { rep: 2 }),
    texturedMaterial('asphalt_02', { rep: 4 }),
    texturedMaterial('weathered_planks', { rep: 2 }),
    texturedMaterial('concrete_block_wall', { rep: 2 }),
    texturedMaterial('grey_roof_tiles', { rep: 3 }),
    texturedMaterial('roof_tiles', { rep: 3 }),
    texturedMaterial('plastered_wall', { rep: 3, tint: '#f1ece2' }),
    texturedMaterial('white_bricks', { rep: 2 }),
    texturedMaterial('wood_plank_wall', { rep: 2, tint: '#cbb79a' }),
  ]);

  const plane = (mat, w, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fitMaterial(mat, w, d));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m;
  };
  const box = (mat, w, h, d, x, y, z, fw, fh) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fitMaterial(mat, fw ?? w, fh ?? h));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };

  // --- 自分の家のまわり ---
  // 窓の上のひさし
  const eaveM = new THREE.MeshStandardMaterial({ color: '#5b5550', roughness: 0.7 });
  const eave = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.9), eaveM);
  eave.position.set(0, 2.98, -2.98); eave.castShadow = true; eave.receiveShadow = true;
  // ひさしは自分の階にだけ（g の外に置く）
  const own = new THREE.Group(); own.add(eave);
  // ウッドデッキ（1階の前）
  plane(deckM, 9, 2.8, 0, -0.18, -4.0);
  box(deckM, 9, 0.18, 0.1, 0, -0.27, -5.4, 9, 0.18);
  // 芝生
  plane(grassM, 60, 50, 0, -0.45, -30);
  const shrubJobs = [];
  // 木の柵（横板）
  const fence = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const y = -0.25 + i * 0.16;
    const b = new THREE.Mesh(new THREE.BoxGeometry(26, 0.12, 0.03), fitMaterial(fenceM, 26, 0.12));
    b.position.set(0, y, -14); b.castShadow = true; b.receiveShadow = true; fence.add(b);
  }
  for (let x = -13; x <= 13; x += 2) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.09), new THREE.MeshStandardMaterial({ color: '#4a3b2f', roughness: 0.8 }));
    p.position.set(x, 0.2, -14.04); p.castShadow = true; fence.add(p);
  }
  // 横の柵
  for (const sx of [-13, 13]) {
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 8.5), fitMaterial(fenceM, 8.5, 0.12));
      b.position.set(sx, -0.25 + i * 0.16, -9.75); b.castShadow = true; fence.add(b);
    }
  }
  g.add(fence);

  // 庭の木（木の写真を立てる）
  const treeJobs = [
    billboardTree(g, 'island_tree_01', -7.5, -0.45, -10.5, 1.25),
    billboardTree(g, 'tree_small_02', 7.8, -0.45, -11.5, 1.15),
    billboardTree(g, 'island_tree_02', 10.5, -0.45, -7.5, 1.1),
    billboardTree(g, 'tree_small_02', -2.5, -0.45, -12.8, 0.9),
    billboardTree(g, 'island_tree_02', 3.5, -0.45, -12.6, 0.8),
    billboardTree(g, 'island_tree_01', -11.5, -0.45, -6.5, 1.0),
  ];

  // --- 道路 ---
  plane(walkM, 80, 1.6, 0, -0.38, -14.9);
  plane(roadM, 80, 6, 0, -0.46, -18.7);
  plane(walkM, 80, 1.4, 0, -0.38, -22.4);
  // 側溝のふち
  box(new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 }), 80, 0.12, 0.15, 0, -0.38, -15.75);
  box(new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 }), 80, 0.12, 0.15, 0, -0.38, -21.65);

  // 電柱と電線
  const poleM = new THREE.MeshStandardMaterial({ color: '#9b9790', roughness: 0.85 });
  const poles = [-16, 0.5, 17];
  const tops = [];
  for (const px of poles) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 10, 12), poleM);
    p.position.set(px, 4.6, -15.4); p.castShadow = true; g.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: '#3d3d3d', metalness: 0.5 }));
    arm.position.set(px, 9.0, -15.4); g.add(arm);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12), new THREE.MeshStandardMaterial({ color: '#7c8085', metalness: 0.4, roughness: 0.5 }));
    tr.position.set(px + 0.38, 7.9, -15.4); g.add(tr);
    tops.push(px);
  }
  const wireM = new THREE.LineBasicMaterial({ color: '#1c1c1c' });
  for (const off of [-0.7, 0, 0.7]) {
    for (let i = 0; i < tops.length - 1; i++) {
      const pts = [];
      for (let t = 0; t <= 20; t++) {
        const u = t / 20;
        pts.push(new THREE.Vector3(tops[i] + (tops[i + 1] - tops[i]) * u + off, 9.05 - Math.sin(u * Math.PI) * 0.45, -15.4));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
    }
    // 画面の外へのびる電線
    for (const [a, b] of [[-40, tops[0]], [tops[tops.length - 1], 40]]) {
      const pts = [];
      for (let t = 0; t <= 20; t++) { const u = t / 20; pts.push(new THREE.Vector3(a + (b - a) * u + off, 9.05 - Math.sin(u * Math.PI) * 0.5, -15.4)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM));
    }
  }
  // 街灯
  const lampJobs = [placeModel(g, 'street_lamp_01', -6.5, -0.38, -15.3, Math.PI / 2, 1)];
  if (night) {
    for (const lx of [-6.5]) {
      const glow = new THREE.PointLight('#ffd7a0', 30, 14, 2);
      glow.position.set(lx, 4.2, -15.6); g.add(glow);
    }
  }

  // --- 向かいの家々 ---
  const roofs = [roofA, roofB];
  const walls = [wallA, wallB, wallC];
  const houseXs = [-22, -11, 0, 11.5, 23];
  houseXs.forEach((hx, i) => {
    const w = 8 + R() * 1.5, d = 8, h = 5.6 + R() * 0.6;
    const z = -32 - R() * 1.5;
    const wall = walls[i % 3];
    const roof = roofs[i % 2];
    makeHouse(g, { x: hx, z, w, d, h, wall, roof, night, seed: i });
    // ブロック塀
    for (const side of [-1, 1]) {
      const bw = w / 2 - 0.8;
      box(blockM, bw, 1.0, 0.15, hx + side * (0.8 + bw / 2), 0.05, -24.0, bw, 1.0);
    }
  });
  // 2列目の家（低く簡単に）
  for (let i = 0; i < 9; i++) {
    const hx = -40 + i * 10 + R() * 3;
    makeHouse(g, { x: hx, z: -50 - R() * 4, w: 7 + R() * 2, d: 7, h: 5 + R() * 1.5, wall: walls[(i + 1) % 3], roof: roofs[i % 2], night, seed: 10 + i, simple: true });
  }
  // 遠くの木々（木の写真をたくさん）
  for (let i = 0; i < 14; i++) {
    const ids = Object.keys(TREES);
    treeJobs.push(billboardTree(g, ids[i % 3], -60 + i * 9 + R() * 4, -0.45, -42 - R() * 18, 1.3 + R() * 0.6, false));
  }

  // --- 遠くの丘 ---
  const hillM = new THREE.MeshStandardMaterial({ color: mood.hill || '#5d7a4a', roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hillM);
    hill.scale.set(120 + R() * 80, 22 + R() * 25, 60);
    hill.position.set(-300 + i * 120 + R() * 40, -6, -320 - R() * 80);
    g.add(hill);
  }
  // 遠くの地面
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1200, 800), new THREE.MeshStandardMaterial({ color: '#56704a', roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.set(0, -0.6, -420); g.add(far);

  await Promise.all([...shrubJobs, ...treeJobs, ...lampJobs]);
  return { world: g, own };
}

async function placeModel(g, id, x, y, z, rotY, scale) {
  const obj = await loadModel(id);
  if (!obj) return;
  obj.rotation.y = rotY; obj.scale.setScalar(scale);
  const bb = new THREE.Box3().setFromObject(obj);
  obj.position.set(x, y - bb.min.y, z);
  shadowAll(obj);
  g.add(obj);
}

// 木の写真を、家のほうに向けて立てる（足もとに影の円）
async function billboardTree(g, id, x, y, z, scale, shadow = true) {
  const t = TREES[id];
  const tex = await loadTex(`img/tree-${id}.webp`, true);
  if (!tex) return;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const w = t.w * scale, h = t.h * scale;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, roughness: 0.9, side: THREE.DoubleSide }));
  m.position.set(x, y + h / 2 - 0.05, z);
  m.lookAt(0, y + h / 2, 0); // 家のほうを向く
  m.castShadow = shadow; m.receiveShadow = false;
  g.add(m);
  if (shadow) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x2 = c.getContext('2d'); const gr = x2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x2.fillStyle = gr; x2.fillRect(0, 0, 64, 64);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2; s.position.set(x, y + 0.02, z); g.add(s);
  }
}

// 2階建ての家（切妻屋根・窓・玄関）
function makeHouse(g, { x, z, w, d, h, wall, roof, night, seed, simple }) {
  const R = rng(100 + seed);
  const house = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fitMaterial(wall, w, h));
  body.position.set(0, h / 2 - 0.45, 0); body.castShadow = body.receiveShadow = true; house.add(body);
  // 屋根（切妻）
  const rh = 1.8, over = 0.5;
  const slope = Math.hypot(w / 2 + over, rh);
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.14, d + over * 2), fitMaterial(roof, slope, d + over * 2));
    r.position.set(side * (w / 4 + over / 4), h - 0.45 + rh / 2, 0);
    r.rotation.z = -side * Math.atan2(rh, w / 2 + over);
    r.castShadow = r.receiveShadow = true; house.add(r);
  }
  // 妻側の三角の壁
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rh); tri.lineTo(-w / 2, 0);
  const triG = new THREE.ShapeGeometry(tri);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(triG, new THREE.MeshStandardMaterial({ color: '#d9d2c6', roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(0, h - 0.45, side * d / 2); house.add(m);
  }
  // 窓（こちら向きの面 = +z）
  const glassDay = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 0.15, metalness: 0.6 });
  const frameM = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.5 });
  const rows = [1.3, 4.0];
  const cols = simple ? 2 : 3;
  for (const wy of rows) {
    for (let c = 0; c < cols; c++) {
      const wx = -w / 2 + (w / (cols + 1)) * (c + 1);
      if (!simple && wy === 1.3 && c === 1) continue; // 玄関の場所
      const lit = night && R() < 0.55;
      const glass = lit ? new THREE.MeshStandardMaterial({ color: '#000', emissive: R() < 0.5 ? '#ffcf8a' : '#ffe2b8', emissiveIntensity: 1.6 }) : glassDay;
      const ww = 1.3, wh = 1.1;
      const f = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.12, wh + 0.12, 0.06), frameM);
      f.position.set(wx, wy, d / 2 + 0.02); house.add(f);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glass);
      gl.position.set(wx, wy, d / 2 + 0.056); house.add(gl);
      if (!lit && R() < 0.5) { // 雨戸・カーテンっぽく
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(ww * 0.45, wh), new THREE.MeshStandardMaterial({ color: '#d8cbb6', roughness: 1 }));
        cur.position.set(wx - ww * 0.27, wy, d / 2 + 0.06); house.add(cur);
      }
    }
  }
  if (!simple) {
    // 玄関
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.08), new THREE.MeshStandardMaterial({ color: ['#5a3d2b', '#2f3a44', '#7b6a58'][seed % 3], roughness: 0.6 }));
    door.position.set(0, 0.6, d / 2 + 0.03); house.add(door);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: '#3d3d3d' }));
    canopy.position.set(0, 1.9, d / 2 + 0.45); canopy.castShadow = true; house.add(canopy);
    if (night) {
      const pl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ emissive: '#ffd59a', emissiveIntensity: 3, color: '#000' }));
      pl.position.set(0.7, 1.75, d / 2 + 0.1); house.add(pl);
    }
  }
  house.position.set(x, 0, z);
  g.add(house);
}
