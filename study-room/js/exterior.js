// 家の外。郊外の住宅街に建つ一軒家。
// 奥の壁(-z)の窓の外：ウッドデッキ → 芝生の庭 → 木の柵 → 歩道と道路（電柱・街灯）→ 向かいの家々 → 遠くの丘。
// 1階の部屋は地面の高さ、2階の部屋（level=1）は同じ景色を3m上から見る（高さと前後の位置は room3d.js が合わせる）。
// 別荘（home = 'villa'）は海辺：テラス → 砂浜とヤシの木 → 波の立つ海 → 遠くの島。
import * as THREE from 'three';
import { texturedMaterial, fitMaterial, loadModel, loadTex, shadowAll } from './loaders.js';

const TREES = {
  island_tree_01: { w: 4.76, h: 5.03 },
  island_tree_02: { w: 4.21, h: 3.41 },
  tree_small_02: { w: 2.92, h: 4.56 },
};

// 決まった乱数（毎回同じ街になる）
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export async function buildExterior(mood, level = 0, home = 'main') {
  if (home === 'villa') return buildSeaside(mood);
  const g = new THREE.Group();
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

  // --- 自分の家のまわり ---（窓の上のひさしは room3d.js が部屋ごとに作る）
  // ウッドデッキ（1階の前）
  plane(deckM, 9, 2.8, 0, -0.18, -4.0);
  box(deckM, 9, 0.18, 0.1, 0, -0.27, -5.4, 9, 0.18);
  // 芝生
  plane(grassM, 60, 50, 0, -0.45, -30);
  // 家の横と後ろの芝生（横の窓から見える）
  plane(grassM, 60, 40, 0, -0.46, 15);
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
  return { world: g };
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

// ======================= 別荘：海辺 =======================
// 波は頂点シェーダーで動かす（スマホでも軽いように、面の数はひかえめ）
async function buildSeaside(mood) {
  const g = new THREE.Group();
  const night = mood.photo === 'night';
  const R = rng(29);
  const [deckM, sandM] = await Promise.all([
    texturedMaterial('wood_floor_deck', { rep: 2, tint: '#e9d9c2' }),
    texturedMaterial('aerial_beach_01', { rep: 6, tint: '#f3e3c4' }),
  ]);
  const plane = (mat, w, d, x, y, z, fit = true) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fit ? fitMaterial(mat, w, d) : mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m;
  };
  // テラス（ウッドデッキ）と手すり
  plane(deckM, 12, 3.2, 0, -0.16, -4.2);
  const railM = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.06), railM);
  rail.position.set(0, 0.84, -5.75); rail.castShadow = true; g.add(rail);
  for (let x = -5.9; x <= 6; x += 0.5) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), railM);
    p.position.set(x, 0.34, -5.75); g.add(p);
  }
  const stepM = new THREE.MeshStandardMaterial({ color: '#cbb796', roughness: 0.8 });
  const deckEdge = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 0.1), stepM);
  deckEdge.position.set(0, -0.33, -5.82); g.add(deckEdge);
  // 砂浜（家のまわりも砂）
  plane(sandM, 200, 32, 0, -0.5, -21.5);
  plane(sandM, 200, 60, 0, -0.52, 25);
  // 海：波の高さを時間で動かす
  const seaU = { uTime: { value: 0 } };
  const deep = night ? '#0b2233' : mood.photo === 'sunset' ? '#1f4a63' : '#14627e';
  const shallow = night ? '#1b4050' : mood.photo === 'sunset' ? '#5c8f8f' : '#3fb3b8';
  const seaM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.15, envMapIntensity: 1.4 });
  seaM.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = seaU.uTime;
    sh.uniforms.uDeep = { value: new THREE.Color(deep) };
    sh.uniforms.uShallow = { value: new THREE.Color(shallow) };
    sh.vertexShader = 'uniform float uTime;\nvarying float vDist;\nvarying float vCrest;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec2 q = position.xy;
        float t = uTime;
        float a1 = 0.12, k1 = 0.35, a2 = 0.07, k2 = 0.62, a3 = 0.04, k3 = 1.3;
        vec2 d1 = normalize(vec2(0.2, 1.0)), d2 = normalize(vec2(-0.6, 0.8)), d3 = normalize(vec2(0.9, 0.4));
        float p1 = dot(d1, q) * k1 + t * 0.9, p2 = dot(d2, q) * k2 + t * 1.3, p3 = dot(d3, q) * k3 + t * 2.1;
        float damp = smoothstep(0.0, 6.0, position.y + 150.0);
        float hgt = (a1 * sin(p1) + a2 * sin(p2) + a3 * sin(p3)) * damp;
        vec2 grad = (a1 * k1 * cos(p1) * d1 + a2 * k2 * cos(p2) * d2 + a3 * k3 * cos(p3) * d3) * damp;
        vec3 objectNormal = normalize(vec3(-grad.x, -grad.y, 1.0));
        vCrest = hgt;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position.xy, hgt);
        vDist = position.y + 150.0;
      `);
    sh.fragmentShader = 'uniform vec3 uDeep;\nuniform vec3 uShallow;\nvarying float vDist;\nvarying float vCrest;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 40.0, vDist));
        diffuseColor.rgb += vec3(0.08) * smoothstep(0.1, 0.2, vCrest);
      `);
  };
  // 海の板は、岸 (z=-37) から沖へ 300m。近い所ほど細かく
  const seaGeo = new THREE.PlaneGeometry(420, 300, 120, 90);
  const sea = new THREE.Mesh(seaGeo, seaM);
  sea.rotation.x = -Math.PI / 2;
  // 平面の y=-150 が岸側になるように置く
  sea.position.set(0, -0.62, -37 - 150);
  sea.receiveShadow = true;
  g.add(sea);
  // 遠くの海（波なし。地平線まで）
  const farSea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), new THREE.MeshStandardMaterial({ color: deep, roughness: 0.2, metalness: 0.1 }));
  farSea.rotation.x = -Math.PI / 2; farSea.position.set(0, -0.66, -330 - 700); g.add(farSea);
  // 波打ちぎわの白い泡（ゆっくり寄せては返す）
  const foamM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(200, 1.6), foamM);
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.49, -36.8); g.add(foam);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(200, 3), new THREE.MeshStandardMaterial({ color: '#b59b74', roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(0, -0.495, -36); g.add(wet);

  // ヤシの木
  const palmSpots = [[-7.5, -9, 1.0], [-10.5, -14, 1.2], [8.5, -10.5, 1.1], [12, -16, 0.9], [-16, -22, 1.3], [17, -24, 1.2], [5, -27, 0.8], [-4, -30, 0.9]];
  for (const [x, z, s] of palmSpots) g.add(makePalm(x, -0.5, z, s, R));
  // 岩
  const rockM = new THREE.MeshStandardMaterial({ color: '#8a857c', roughness: 0.95, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + R() * 0.9, 0), rockM);
    r.scale.y = 0.6; r.position.set(-30 + R() * 60, -0.4, -33 - R() * 6); r.rotation.y = R() * 3; r.castShadow = true; g.add(r);
  }
  // 遠くの島
  const islandM = new THREE.MeshStandardMaterial({ color: night ? '#16202a' : '#5f7d62', roughness: 1 });
  for (const [x, z, sx, sy] of [[-260, -520, 120, 26], [180, -620, 160, 38], [420, -480, 70, 18]]) {
    const isl = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), islandM);
    isl.scale.set(sx, sy, sx * 0.5); isl.position.set(x, -0.7, z); g.add(isl);
  }
  // 夜はテラスの灯り
  if (night) {
    const l = new THREE.PointLight('#ffcf90', 6, 10, 2); l.position.set(0, 2.2, -4.5); g.add(l);
  }
  const update = (t) => {
    seaU.uTime.value = t;
    const k = (Math.sin(t * 0.5) + 1) / 2;
    foam.position.z = -36.6 + k * 0.9;
    foamM.opacity = 0.25 + 0.35 * (1 - k);
  };
  return { world: g, update };
}

// ヤシの木（曲がった幹と、垂れた葉）
let palmLeafTex = null;
function leafTexture() {
  if (palmLeafTex) return palmLeafTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.strokeStyle = '#3f6b2a'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
  for (let i = 4; i < 250; i += 7) {
    const w = 30 * Math.sin((i / 256) * Math.PI) + 2;
    x.strokeStyle = i % 2 ? '#4f8a34' : '#5c9a3d'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(32, i); x.lineTo(32 - w, i + 12); x.moveTo(32, i); x.lineTo(32 + w, i + 12); x.stroke();
  }
  palmLeafTex = new THREE.CanvasTexture(c); palmLeafTex.colorSpace = THREE.SRGBColorSpace;
  return palmLeafTex;
}
function makePalm(x, y, z, s, R) {
  const g = new THREE.Group();
  const trunkM = new THREE.MeshStandardMaterial({ color: '#8b7255', roughness: 0.95 });
  const h = 5.5 + R() * 2, lean = (R() - 0.5) * 1.6;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push(new THREE.Vector3(lean * u * u, h * u, 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.16, 7), trunkM);
  trunk.castShadow = true; g.add(trunk);
  // 幹のふし
  for (let i = 1; i < 10; i++) {
    const p = curve.getPoint(i / 10);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 10), trunkM);
    ring.rotation.x = Math.PI / 2; ring.position.copy(p); g.add(ring);
  }
  const top = curve.getPoint(1);
  const leafM = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const n = 9;
  for (let i = 0; i < n; i++) {
    // 葉：先が垂れる細長い帯
    const L = 3.0 + R() * 0.8, segs = 8;
    const geo = new THREE.PlaneGeometry(0.9, L, 1, segs);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const v = (pos.getY(k) + L / 2) / L; // 0=根元 1=先
      pos.setY(k, v * L);
      pos.setZ(k, -Math.pow(v, 2) * 1.6 + v * 0.6);
    }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, leafM);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.y = (i / n) * Math.PI * 2 + R() * 0.3;
    leaf.rotation.x = -Math.PI / 2 + 0.35 + R() * 0.3;
    leaf.position.copy(top);
    leaf.castShadow = true;
    g.add(leaf);
  }
  // 実
  const nutM = new THREE.MeshStandardMaterial({ color: '#5a4a2a', roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), nutM);
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2.1) * 0.18, -0.2, Math.sin(i * 2.1) * 0.18)); g.add(nut);
  }
  g.scale.setScalar(s);
  g.position.set(x, y, z);
  return g;
}
