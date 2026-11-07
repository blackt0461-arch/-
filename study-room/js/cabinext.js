// 山小屋（home = 'cabin'）の外：雪のつもったデッキ → 雪の原っぱと針葉樹の森 → 遠くの雪山。雪がちらつく。
// exterior.js の buildExterior から呼ぶ。room3d.js が { world, update } を受けとり、2階（level=1）は 3m 下げて置く。
// 木は Poly Haven（CC0）の fir_tree_01・pine_tree_01 の公式画像から1本ずつ切り出した絵（img/tree-fir-*.webp・tree-pine-*.webp）を板に貼る（モデルは1本数百MBで重すぎるため）。
// 山・雪・デッキは自作。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadTex } from './loaders.js';

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// 雪の地面の質感（ほんのり凸凹と、青い影）
let snowTex = null;
function snowTexture() {
  if (snowTex) return snowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f7fb'; x.fillRect(0, 0, 128, 128);
  const R = rng(7);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${150 + R() * 40},${170 + R() * 40},${210 + R() * 30},${0.05 + R() * 0.08})`; x.beginPath(); x.arc(R() * 128, R() * 128, 2 + R() * 9, 0, Math.PI * 2); x.fill(); }
  snowTex = new THREE.CanvasTexture(c); snowTex.colorSpace = THREE.SRGBColorSpace; snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
  return snowTex;
}

// 雪山1つ（地面の格子を持ち上げた山。高い所は白、低い所は岩と森の色）
function mountain(R, rad, h, seg = 56) {
  const geo = new THREE.PlaneGeometry(rad * 2, rad * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const rock = new THREE.Color('#8a94a2'), forest = new THREE.Color('#41564c'), snow = new THREE.Color('#f2f6fb'), c = new THREE.Color();
  const ph = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x), d = Math.hypot(x, z) / rad;
    const ridge = 1 + Math.sin(a * 3 + ph) * 0.14 + Math.sin(a * 5 + ph * 2) * 0.06;
    let t = Math.max(0, 1 - d / ridge);
    t = Math.pow(t, 1.25);
    const y = h * t + (t > 0 ? Math.sin(x * 0.7 + ph) * Math.sin(z * 0.6) * h * 0.02 : -0.5);
    p.setY(i, y);
    const sl = 0.32 + Math.sin(a * 4 + ph) * 0.07;
    if (t > sl + 0.14) c.copy(snow);
    else if (t > sl) c.copy(rock).lerp(snow, (t - sl) / 0.14);
    else if (t > 0.12) c.copy(forest).lerp(rock, (t - 0.12) / (sl - 0.12));
    else c.copy(forest).lerp(snow, 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  // 光の当たり方を色に焼きこむ（影の計算をしないので、ギザギザの影が出ない・軽い）
  const nrm = geo.attributes.normal, L = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
  for (let i = 0; i < p.count; i++) {
    const dd = Math.max(0, nrm.getX(i) * L.x + nrm.getY(i) * L.y + nrm.getZ(i) * L.z);
    const k = 0.6 + 0.45 * dd;
    col[i * 3] *= k; col[i * 3 + 1] *= k; col[i * 3 + 2] *= k * 1.02;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export async function buildMountain(mood) {
  const g = new THREE.Group();
  const night = mood.photo === 'night', dusk = mood.photo === 'sunset';
  const R = rng(41);
  const snowM = new THREE.MeshStandardMaterial({ map: snowTexture(), color: night ? '#9fb0cc' : '#ffffff', roughness: 0.9 });
  const plane = (w, d, x, y, z, mat = snowM, rep = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    if (mat.map && rep !== 1) { mat.map.repeat.set(rep, rep * d / w); }
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m;
  };
  // デッキ（木）に雪
  const deckM = new THREE.MeshStandardMaterial({ color: '#7a5a3e', roughness: 0.85 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 2.8), deckM); deck.position.set(0, -0.24, -4.0); deck.receiveShadow = true; g.add(deck);
  for (let x = -4.8; x <= 4.8; x += 0.32) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 2.8), new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.9 })); b.position.set(x, -0.177, -4.0); g.add(b); }
  const drift = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.9), snowM); drift.position.set(0, -0.15, -5.0); g.add(drift);
  // 丸太の手すり
  const logM = new THREE.MeshStandardMaterial({ color: '#6b4a30', roughness: 0.8 });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 10, 10), logM); rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.8, -5.35); rail.castShadow = true; g.add(rail);
  const railSnow = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 9.8, 8, 1, false, -Math.PI / 2, Math.PI), snowM); railSnow.rotation.z = Math.PI / 2; railSnow.position.set(0, 0.84, -5.35); g.add(railSnow);
  for (let x = -4.8; x <= 4.8; x += 1.2) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), logM); p.position.set(x, 0.3, -5.35); p.castShadow = true; g.add(p); }
  // 雪の原っぱ（ゆるい起伏）
  const fieldGeo = new THREE.PlaneGeometry(160, 110, 50, 30);
  const fp = fieldGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), y = fp.getY(i); const far = Math.max(0, (-y - 0) / 80); fp.setZ(i, Math.sin(x * 0.08) * 0.6 * far + Math.sin(y * 0.11 + x * 0.05) * 0.5 * far); }
  fieldGeo.computeVertexNormals();
  const field = new THREE.Mesh(fieldGeo, snowM); field.rotation.x = -Math.PI / 2; field.position.set(0, -0.5, -55); field.receiveShadow = true; g.add(field);
  plane(120, 60, 0, -0.52, 25);
  // 針葉樹の森（Poly Haven の木の絵を、家のほうへ向けた板に貼る）
  const TREE_IMG = [['fir-0', 0.34], ['fir-1', 0.42], ['fir-2', 0.43], ['pine-0', 0.38], ['pine-1', 0.46], ['pine-2', 0.43]]; // [名前, 幅/高さ]
  const texs = await Promise.all(TREE_IMG.map(([n]) => loadTex(`img/tree-${n}.webp`, true)));
  // 板は逆光で黒くつぶれやすいので、絵そのものの明るさを少し足す（夜は弱く）
  const treeMats = texs.map(t => { if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, roughness: 0.9, side: THREE.DoubleSide, color: night ? '#7d8aa8' : dusk ? '#e8c8b8' : '#ffffff', emissive: '#ffffff', emissiveMap: t, emissiveIntensity: night ? 0.08 : dusk ? 0.35 : 0.55 }); });
  const spots = [];
  for (const [x, z, s] of [[-6.5, -9, 1.0], [-9, -12, 1.25], [7.5, -10, 1.15], [10, -13.5, 0.9], [-12, -7, 0.95], [12.5, -8, 1.05]]) spots.push([x, z, s]);
  for (let i = 0; i < 70; i++) { const z = -16 - R() * 26, x = (R() - 0.5) * (50 + (-z) * 1.6); if (Math.abs(x) < 6 && z > -26) continue; spots.push([x, z, 0.8 + R() * 0.7]); }
  spots.sort((a, b) => a[1] - b[1]); // 遠い木から描く（すけた所の重なりがきれいに）
  for (const [x, z, sc] of spots) {
    const k = Math.floor(R() * TREE_IMG.length), [, asp] = TREE_IMG[k];
    const h = (7 + R() * 5) * sc, w = h * asp;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), treeMats[k]);
    m.position.set(x, -0.5 + h / 2 - 0.05, z); // 根もとの土は絵から切ってあるので、幹がそのまま雪に立つ
    m.lookAt(0, m.position.y, 0); m.castShadow = Math.abs(z) < 16; g.add(m);
    // 根もとの雪のくぼみ（青い影）
    const sh = new THREE.Mesh(new THREE.CircleGeometry(w * 0.35, 16), new THREE.MeshBasicMaterial({ color: '#9fb4d0', transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(x, -0.49, z); g.add(sh);
  }
  // 遠くの雪山
  const mtnM = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  if (night) mtnM.color.set('#5a6684'); else if (dusk) mtnM.color.set('#f2c6b0'); else mtnM.color.set('#dfe6f0'); // 遠くはうっすら空の色に
  // 部屋のカメラは 60m 先までしか描かないので、山は 45〜57m 先に小さめに置く（見た目の大きさは遠くの大きな山と同じ）
  for (const [x, z, r, h] of [[-22, -46, 19, 12], [4, -55, 27, 19], [30, -49, 21, 14], [-44, -56, 25, 16], [52, -57, 26, 17], [-8, -57, 30, 22]]) {
    const m = new THREE.Mesh(mountain(R, r, h), mtnM); m.position.set(x, -0.6, z); m.userData.noShadow = true; g.add(m);
  }
  // 遠くの丸太小屋（夜は窓に明かり）
  const winM = new THREE.MeshStandardMaterial({ color: night ? '#ffd28a' : '#3a4048', emissive: night ? '#ffb45a' : '#000000', emissiveIntensity: night ? 1.4 : 0, roughness: 0.3 });
  for (const [x, z, ry] of [[-17, -32, 0.3], [21, -38, -0.4]]) {
    const hut = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), logM); body.position.y = 1.0; hut.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.6, 2.2, 4, 1), snowM); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8); roof.position.y = 3.6; hut.add(roof);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), winM); w.position.set(-1, 1.3, 2.01); hut.add(w);
    const w2 = w.clone(); w2.position.x = 1; hut.add(w2);
    hut.position.set(x, -0.5, z); hut.rotation.y = ry; g.add(hut);
  }
  // 夜はデッキの灯り
  if (night) { const l = new THREE.PointLight('#ffcf90', 5, 9, 2); l.position.set(0, 2.2, -4.5); g.add(l); }
  // ちらつく雪（窓の前の箱の中を、ゆっくり落ちる）
  const N = 900, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 30; pos[i * 3 + 1] = R() * 10; pos[i * 3 + 2] = -3.5 - R() * 26; seeds[i] = R(); }
  const flakesGeo = new THREE.BufferGeometry(); flakesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  { const x = dot.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); }
  const flakeM = new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, color: night ? '#c9d6ee' : '#ffffff', opacity: 0.9 });
  const flakes = new THREE.Points(flakesGeo, flakeM); flakes.frustumCulled = false; g.add(flakes);
  let last = 0;
  const update = (t) => {
    const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
    const a = flakesGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      a[i * 3 + 1] -= dt * (0.45 + seeds[i] * 0.5);
      a[i * 3] += Math.sin(t * 0.7 + seeds[i] * 20) * dt * 0.25;
      if (a[i * 3 + 1] < -0.5) a[i * 3 + 1] += 10.5;
    }
    flakesGeo.attributes.position.needsUpdate = true;
  };
  return { world: g, update };
}
