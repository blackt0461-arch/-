// ルーンランド：3Dのジオラマ盤面（three.js）
// 木のお盆の上に島があり、上からななめに見おろす。光と影、地形の高さ。
// 画面（app.js）からは、build / paint / overlay / pick / カメラ操作 / fx（演出）だけを使う。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as G from './game.js';

const SQ = Math.sqrt(3);
const TILT = 70; // カメラの角度（90＝真上）
const H = [0.30, 0.36, 0.44, 0.10, 0.38]; // マスの高さ（草原・森・山・湖・ルーン）
const TOP = ['#b9d585', '#8fbf6e', '#c9b48e', '#6fb2c8', '#cdbff0'];
const TILE_TINT = ['#ffffff', '#b8d898', '#e8cfa0', '#cfe6f0', '#ece4ff']; // 草の地面モデルに掛ける色（地形ごと）
const C = c => new THREE.Color(c);
const ease = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// ---- Meshy のモデル（あれば使う。なければ自作の形） ----
const MODEL_H = { tile: 0, castle: 0.9, soldier: 0.75, dragon: 1.1, tree: 0.8, chest: 0.6, runestone: 1.0, fairy: 0.3, mountain: 0.65 };
// 盤面の上で見えやすく：明るさ（色の倍率）と、横の太さ
const MODEL_TUNE = { tree: { light: 1, wide: 1 }, chest: { light: 1, wide: 1 }, runestone: { light: 1, wide: 1 }, castle: { light: 1, wide: 1 }, soldier: { light: 1.1, wide: 1 } };
// 模様の画像を、画面に出る大きさに合わせて小さくする（盤面の物は画面で数十〜数百ピクセルなので、1024 あれば見た目は変わらない。スマホの画像用メモリが大きく減る）
const MAXTEX = 1024;
function fitTextures(obj) {
  const done = new Set();
  obj.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap']) {
    const t = m[k]; if (!t || done.has(t) || !t.image) continue; done.add(t);
    const im = t.image, w = im.width, h = im.height; if (!w || Math.max(w, h) <= MAXTEX) continue;
    const sc = MAXTEX / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); t.image = c; t.needsUpdate = true;
  } });
}
const BOARD_MODELS = ['tile', 'castle', 'soldier', 'tree', 'chest', 'runestone', 'mountain'], FX_MODELS = ['dragon', 'fairy'];
async function loadModels(quality, names) {
  const loader = new GLTFLoader(), out = {};
  // かるい画質：たくさん並ぶ物（お城・兵・木）は自作の軽い形にする
  const skip = quality === 'light' ? ['castle', 'soldier', 'tree'] : [];
  await Promise.all(names.filter(n => !skip.includes(n)).map(async name => {
    try {
      const g = await loader.loadAsync(`models/${name}.glb`);
      const obj = g.scene; fitTextures(obj); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; m.roughness = 0.85; if (/crystal/i.test(m.name + ' ' + o.name)) { m.emissive = new THREE.Color('#8a4fff'); m.emissiveIntensity = 1.4; m.roughness = 0.3; } if (/snow/i.test(m.name + ' ' + o.name)) m.roughness = 0.6; if (MODEL_TUNE[name]) m.color.multiplyScalar(MODEL_TUNE[name].light); m.needsUpdate = true; } } }); // 金属あつかいだと暗く見えるので、木や石らしく
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
      const k = name === 'tile' ? 1 : name === 'castle' ? 1.35 / Math.max(0.001, size.x, size.z) : name === 'mountain' ? 1.8 / Math.max(0.001, size.z) : MODEL_H[name] / Math.max(0.001, name === 'dragon' ? Math.max(size.x, size.z) / 2.6 : size.y); // お城は城壁がマスに収まる幅で
      obj.scale.setScalar(k); if (MODEL_TUNE[name]) { obj.scale.x *= MODEL_TUNE[name].wide; obj.scale.z *= MODEL_TUNE[name].wide; }
      const box2 = new THREE.Box3().setFromObject(obj), c = box2.getCenter(new THREE.Vector3());
      obj.position.set(-c.x, -box2.min.y, -c.z);
      const wrap = new THREE.Group(); wrap.add(obj); wrap.userData.anims = g.animations;
      out[name] = wrap;
    } catch { /* ない時は自作の形 */ }
  }));
  return out;
}
// 色を付ける部品（flag / roof / banner / shield）と、それ以外に分けて、同じ物をたくさん並べる形にする
const TINT_RE = /flag|roof|banner|shield/i;
function toInstancedSplit(obj, count) {
  const tintObj = new THREE.Group(), plainObj = new THREE.Group();
  obj.updateMatrixWorld(true);
  obj.traverse(o => { if (!o.isMesh) return; const nm = o.name + ' ' + [].concat(o.material).map(m => m.name).join(' '); const c = o.clone(); c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); c.matrixWorld.copy(o.matrixWorld); (TINT_RE.test(nm) ? tintObj : plainObj).add(c); });
  const mk = g => { if (!g.children.length) return null; g.updateMatrixWorld = () => {}; return toInstanced(g, count); };
  const tint = mk(tintObj); if (tint) for (const m of [].concat(tint.material)) { m.map = null; m.color.set('#ffffff'); }
  return { plain: mk(plainObj), tint };
}
// 同じ物をたくさん並べるため、1つの形にまとめる（兵・木）
function toInstanced(obj, count) {
  const geos = [], mats = [];
  obj.updateMatrixWorld(true);
  obj.traverse(o => { if (o.isMesh) { const g = o.geometry.clone();
    if (o.isSkinnedMesh) { // 骨組みで動くモデル：いまの姿勢の形を取り出す
      o.skeleton.update(); const pos = g.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) { o.getVertexPosition(k, v); pos.setXYZ(k, v.x, v.y, v.z); }
      g.computeVertexNormals();
    }
    g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); geos.push(g.index ? g.toNonIndexed() : g); mats.push(o.material); } });
  if (!geos.length) return null;
  const geo = mergeGeometries(geos, true);
  const m = new THREE.InstancedMesh(geo, mats.length > 1 ? mats : mats[0], count); m.castShadow = true;
  return m;
}

// ---- 自作の形 ----
function hexShape(r) { const s = new THREE.Shape(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); const x = r * Math.cos(a), y = r * Math.sin(a); k ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
function hexRing(ro, ri) { const s = hexShape(ro); s.holes.push(new THREE.Path(hexShape(ri).getPoints().reverse())); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; }
function procTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6), new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 1 }));
  trunk.position.y = 0.07; g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: '#3f8a46', roughness: 0.9, flatShading: true });
  [[0.16, 0.22, 0.2], [0.12, 0.18, 0.33], [0.08, 0.14, 0.44]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leaf); c.position.y = y; g.add(c); });
  return g;
}
function procSoldier() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 12), m); base.position.y = 0.02; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.18, 10), m); body.position.y = 0.13; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m); head.position.y = 0.26; g.add(head);
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), m); spear.position.set(0.07, 0.18, 0); g.add(spear);
  return g;
}
function procCastle() {
  const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.85, flatShading: true }), roof = new THREE.MeshStandardMaterial({ color: '#a8654a', roughness: 0.8, flatShading: true });
  const keep = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), stone); keep.position.y = 0.17; g.add(keep);
  [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].forEach(([x, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.5, 8), stone); t.position.set(x, 0.25, z); g.add(t);
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), roof); r.position.set(x, 0.6, z); g.add(r);
  });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 4), roof); top.position.y = 0.48; top.rotation.y = Math.PI / 4; g.add(top);
  return g;
}
function procChest() {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#b9773a', roughness: 0.8 }), gold = new THREE.MeshStandardMaterial({ color: '#f2c25a', metalness: 0.6, roughness: 0.35 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), wood); box.position.y = 0.08; g.add(box);
  const lid = new THREE.Group(); lid.position.set(0, 0.16, -0.11); g.add(lid); g.userData.lid = lid;
  const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10, 1, false, 0, Math.PI), wood); lm.rotation.z = Math.PI / 2; lm.position.z = 0.11; lid.add(lm);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), gold); lock.position.set(0, 0.14, 0.115); g.add(lock);
  return g;
}
function procRune() {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.42, 6), new THREE.MeshStandardMaterial({ color: '#9a90a8', roughness: 0.9, flatShading: true })); stone.position.y = 0.21; g.add(stone);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#c9a8ff', emissive: '#7a4fd6', emissiveIntensity: 1.2, roughness: 0.3 })); gem.position.y = 0.55; g.add(gem); g.userData.gem = gem;
  return g;
}
function procDragon() {
  const g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: '#e0623a', roughness: 0.6, flatShading: true }), wingM = new THREE.MeshStandardMaterial({ color: '#f2a24a', roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), red); body.rotation.x = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 6), red); head.rotation.x = Math.PI / 2; head.position.z = 0.6; g.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 6), red); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.7; g.add(tail);
  const wshape = new THREE.Shape(); wshape.moveTo(0, 0); wshape.lineTo(1.0, 0.15); wshape.lineTo(0.8, -0.2); wshape.lineTo(0.5, -0.1); wshape.lineTo(0.3, -0.3); wshape.lineTo(0, -0.2);
  const wg = new THREE.ShapeGeometry(wshape); wg.rotateX(-Math.PI / 2);
  const wl = new THREE.Group(), wr = new THREE.Group();
  const ml = new THREE.Mesh(wg, wingM); wl.add(ml); wl.position.set(0.1, 0.05, 0.1);
  const mr = new THREE.Mesh(wg, wingM); mr.scale.x = -1; wr.add(mr); wr.position.set(-0.1, 0.05, 0.1);
  g.add(wl, wr); g.userData.wings = [wl, wr];
  return g;
}
function procFairy() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#fde3f0', emissive: '#f7a8d8', emissiveIntensity: 0.8 })); g.add(b);
  const wm = new THREE.MeshStandardMaterial({ color: '#d8f4ff', emissive: '#9fe0ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const w = new THREE.CircleGeometry(0.1, 10); const l = new THREE.Mesh(w, wm), r = new THREE.Mesh(w, wm); l.position.set(0.08, 0.04, 0); r.position.set(-0.08, 0.04, 0); l.rotation.y = 0.6; r.rotation.y = -0.6; g.add(l, r); g.userData.wings = [l, r];
  return g;
}
function dieTexture(v) { // サイコロの目の絵
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fffaf0'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#5b4636'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
  const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[32, 32], [64, 64], [96, 96]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] }[v];
  x.fillStyle = v === 1 ? '#d9573f' : '#5b4636'; for (const [a, b] of P) { x.beginPath(); x.arc(a, b, 11, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Board3D {
  constructor(host, { quality = 'high' } = {}) {
    this.host = host; this.quality = quality;
    const hi = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: hi, alpha: true, powerPreference: hi ? 'high-performance' : 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hi ? 3 : 1.5)); // スマホの細かさそのままで描く
    this.renderer.shadowMap.enabled = hi; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement; this.canvas.className = 'b3';
    host.prepend(this.canvas);
    this.labels = document.createElement('div'); this.labels.className = 'b3labels'; host.append(this.labels);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#7a8a6a', 1.1));
    const sun = this.sun = new THREE.DirectionalLight('#fff1d6', 2.2); sun.position.set(-7, 16, 5); sun.castShadow = hi;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.cam = { tx: 0, tz: 0, dist: 20, fit: 20, yaw: 0, shift: 0 };
    this.fx = []; this.lbl = new Map(); this.key = ''; this.models = {}; this.dirty = true; this.lastT = 0;
    this.ray = new THREE.Raycaster(); this.v2 = new THREE.Vector2();
    // 盤面に並ぶ物を先に読み、演出だけで使う物（ドラゴン・妖精）はあとから読む
    this.ready = loadModels(quality, BOARD_MODELS).then(m => { Object.assign(this.models, m); this.key = ''; this.dirty = true; if (this.st) this.build(this.st); return loadModels(quality, FX_MODELS); }).then(m => Object.assign(this.models, m));
    // 画面の大きさが変わったら（はじめて見えた時も）、正しい大きさで描きなおす
    this.resize(); this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    const loop = t => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }
  dispose() { cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); this.renderer.dispose(); this.canvas.remove(); this.labels.remove(); }
  resize() { const r = this.host.getBoundingClientRect(); if (!r.width) return; this.renderer.setSize(r.width, r.height, false); this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix(); this.fitDist(); this.dirty = true; this.shadowDirty = true; }
  hp(i) { const h = this.m.tiles[i]; return [SQ * (h.q + h.r / 2), 1.5 * h.r]; }
  topY(i) { return this.isCastle(i) ? H[0] + 0.06 : H[this.st.terrain[i]]; }
  isCastle(i) { return this.castles.has(i); }

  // ---- 盤面を作る（ゲームが変わった時・お城がふえた時だけ） ----
  build(st) {
    this.st = st;
    const key = st.gid + ':' + st.R + ':' + st.players.map(p => p.castle).join(',') + ':' + BOARD_MODELS.filter(n => this.models[n]).join(',');
    if (this.key === key) return;
    const fresh = !this.key.startsWith(st.gid + ':');
    this.key = key;
    if (this.world) { this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const W = this.world = new THREE.Group(); this.scene.add(W);
    const m = this.m = G.mapOf(st), N = m.N;
    this.castles = new Map(st.players.map((p, pi) => [p.castle, pi]));
    let R = 0; for (let i = 0; i < N; i++) { const [x, z] = this.hp(i); R = Math.max(R, Math.hypot(x, z)); }
    this.R = R + 1;
    // 木のお盆と海
    const trayR = this.R + 1.6;
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(trayR + 0.5, trayR + 0.7, 0.6, 48), new THREE.MeshStandardMaterial({ color: '#a97a4e', roughness: 0.75 }));
    tray.position.y = -0.3; tray.receiveShadow = true; W.add(tray);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(trayR + 0.35, 0.22, 8, 64), new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.7 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; W.add(rim);
    const sea = this.sea = new THREE.Mesh(new THREE.CircleGeometry(trayR + 0.3, 64), new THREE.MeshStandardMaterial({ color: '#7cc3d4', roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0.06; sea.receiveShadow = true; W.add(sea);
    const shallow = new THREE.Mesh(new THREE.CircleGeometry(this.R + 0.4, 48), new THREE.MeshStandardMaterial({ color: '#a8dde2', roughness: 0.4, transparent: true, opacity: 0.7 }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.065; W.add(shallow);
    // マス：側面（土）と上面（色）
    const side = new THREE.CylinderGeometry(0.97, 1.0, 1, 6, 1, true); side.translate(0, -0.5, 0);
    this.sides = new THREE.InstancedMesh(side, new THREE.MeshStandardMaterial({ color: '#9b7650', roughness: 1 }), N);
    const cap = new THREE.ShapeGeometry(hexShape(0.965)); cap.rotateX(-Math.PI / 2);
    this.caps = new THREE.InstancedMesh(cap, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), N);
    this.sides.castShadow = this.caps.receiveShadow = this.sides.receiveShadow = true;
    const mt = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const [x, z] = this.hp(i), h = this.topY(i);
      mt.makeScale(1, h, 1).setPosition(x, h, z); this.sides.setMatrixAt(i, mt);
      mt.makeTranslation(x, h + 0.001, z); this.caps.setMatrixAt(i, mt);
      this.caps.setColorAt(i, C(TOP[st.terrain[i]]));
    }
    W.add(this.sides, this.caps);
    // 草の生えた地面のモデル（あれば、自作の上面・側面のかわりに使う）
    this.tileModel = !!this.models.tile;
    if (this.tileModel) {
      W.remove(this.sides, this.caps);
      const t = toInstanced(this.models.tile, N); t.castShadow = t.receiveShadow = true;
      for (let i = 0; i < N; i++) { const [x, z] = this.hp(i), h = this.topY(i); mt.makeScale(1.94, h / 0.16, 1.94).setPosition(x, 0, z); t.setMatrixAt(i, mt); t.setColorAt(i, C(TILE_TINT[st.terrain[i]])); }
      this.caps = this.sides = t; W.add(t);
      // 色ののせ板：だれの土地か・湖・ルーンの石が、草の上でも分かるように
      const tg = new THREE.ShapeGeometry(hexShape(0.93)); tg.rotateX(-Math.PI / 2);
      this.tint = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.9 }), N);
      this.tint.renderOrder = 1; this.tint.frustumCulled = false; this.tint.receiveShadow = true;
      for (let i = 0; i < N; i++) { this.tint.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.tint.setColorAt(i, C('#ffffff')); }
      W.add(this.tint);
    }
    // 持ち主のふち・光るマス（兵を置ける所）
    const ring = hexRing(0.95, 0.74);
    this.rings = new THREE.InstancedMesh(ring, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), N);
    this.glow = new THREE.InstancedMesh(hexRing(0.9, 0.62), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.75, depthWrite: false }), N);
    this.glow.renderOrder = 2;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) { this.rings.setMatrixAt(i, hide); this.glow.setMatrixAt(i, hide); this.rings.setColorAt(i, C('#ffffff')); }
    W.add(this.rings, this.glow);
    this.rings.frustumCulled = this.glow.frustumCulled = this.caps.frustumCulled = this.sides.frustumCulled = false;
    // 地形の物：山・木・ルーン・お城
    const mtn = [], trees = [], runes = [];
    for (let i = 0; i < N; i++) { const t = st.terrain[i]; if (this.isCastle(i)) continue; if (t === G.T.MOUNTAIN) mtn.push(i); if (t === G.T.FOREST) trees.push(i); if (t === G.T.RUNE) runes.push(i); }
    if (mtn.length && this.models.mountain) { // 山のモデル（あれば）
      const mi = toInstanced(this.models.mountain, mtn.length); mtn.forEach((i, k) => { const [x, z] = this.hp(i); mt.makeRotationY(0).setPosition(x, this.topY(i), z); mi.setMatrixAt(k, mt); }); W.add(mi);
    } else if (mtn.length) {
      const mg = new THREE.ConeGeometry(0.62, 0.8, 6); mg.translate(0, 0.4, 0);
      const mm = new THREE.InstancedMesh(mg, new THREE.MeshStandardMaterial({ color: '#a8957a', roughness: 1, flatShading: true }), mtn.length);
      const sg = new THREE.ConeGeometry(0.24, 0.3, 6); sg.translate(0, 0.66, 0);
      const sm = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true }), mtn.length);
      mtn.forEach((i, k) => { const [x, z] = this.hp(i); mt.makeRotationY(0).setPosition(x, this.topY(i), z); mm.setMatrixAt(k, mt); sm.setMatrixAt(k, mt); });
      mm.castShadow = sm.castShadow = true; W.add(mm, sm);
    }
    if (trees.length) {
      const per = this.models.tree ? 2 : (this.quality === 'high' ? 3 : 2), inst = this.models.tree ? toInstanced(this.models.tree, trees.length * per) : toInstanced(procTree(), trees.length * per);
      const r = G.rng(st.seed ^ 7);
      trees.forEach((i, k) => { const [x, z] = this.hp(i); for (let j = 0; j < per; j++) { const a = j * 2.1 + r(), d = per === 1 ? 0.15 : per === 2 ? 0.32 + r() * 0.08 : 0.42 + r() * 0.12, sc = 0.85 + r() * 0.3; mt.makeRotationY(r() * 6).scale(new THREE.Vector3(sc, sc, sc)).setPosition(x + Math.cos(a) * d, this.topY(i), z + Math.sin(a) * d); inst.setMatrixAt(k * per + j, mt); } });
      W.add(inst);
    }
    // ルーンの石もまとめて描く
    this.runeObjs = runes.map(i => ({ i }));
    if (runes.length) { const ri = toInstanced(this.models.runestone || procRune(), runes.length); runes.forEach((i, k) => { const [x, z] = this.hp(i); ri.setMatrixAt(k, new THREE.Matrix4().makeRotationY(i * 2.3).setPosition(x, this.topY(i), z)); }); ri.frustumCulled = false; W.add(ri); }
    // お城：同じ形をまとめて描く（1回で全部描くので軽い）。旗と、色を付ける部品はプレイヤーの色
    this.castleObjs = new Map();
    const cs = [...this.castles], nC = cs.length;
    const src = this.models.castle || procCastle();
    const ch = new THREE.Box3().setFromObject(src).max.y;
    const parts = toInstancedSplit(src, nC);
    const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#5b4636' }), nC);
    const fg = new THREE.PlaneGeometry(0.5, 0.32); fg.translate(0.25, 0, 0);
    this.flags = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.12 }), nC);
    this.castleTint = parts.tint;
    const rot = this.models.castle ? 0.35 : -0.4; // Meshy のお城は城壁の角が x 向きなので、マスの六角形に合わせて30度回す
    cs.forEach(([i, pi], k) => {
      const [x, z] = this.hp(i), y = this.topY(i), base = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
      if (parts.plain) parts.plain.setMatrixAt(k, base);
      if (parts.tint) { parts.tint.setMatrixAt(k, base); parts.tint.setColorAt(k, C(st.players[pi].color)); }
      poleM.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, y + ch + 0.25, z));
      this.flags.setMatrixAt(k, new THREE.Matrix4().makeRotationX(-0.5).setPosition(x, y + ch + 0.38, z)); this.flags.setColorAt(k, C(st.players[pi].color));
      this.castleObjs.set(i, k);
    });
    // モデルに旗・屋根の部品がある時は、こちらで足す旗は出さない
    const extra = parts.tint ? [] : [poleM, this.flags];
    if (parts.tint) this.flags = null;
    for (const m of [parts.plain, parts.tint, ...extra]) if (m) { m.castShadow = true; m.frustumCulled = false; W.add(m); }
    // 宝箱・兵のコマ（あとで並べかえる）
    this.chestObjs = new Map();
    const sp = this.models.soldier ? toInstancedSplit(this.models.soldier, 240) : { plain: toInstanced(procSoldier(), 240), tint: null };
    this.soldiers = sp.plain; this.shields = sp.tint; if (this.shields) { this.shields.count = 0; this.shields.frustumCulled = false; this.shields.castShadow = true; W.add(this.shields); } // 盾はプレイヤーの色
    this.soldiers.count = 0; W.add(this.soldiers);
    // 兵の足もとの色の台（だれの兵か分かるように）
    const bg = new THREE.CylinderGeometry(0.24, 0.26, 0.05, 18); bg.translate(0, 0.02, 0);
    this.bases = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), 240); this.bases.count = 0; this.bases.castShadow = true; W.add(this.bases);
    this.soldiers.frustumCulled = this.bases.frustumCulled = false; // 数が変わるので、見えない判定をしない
    // 影の範囲
    const s = this.sun.shadow.camera; s.left = s.bottom = -this.R - 2; s.right = s.top = this.R + 2; s.near = 1; s.far = 50; s.updateProjectionMatrix();
    this.owners = null;
    this.fitDist();
    this.dirty = true; this.shadowDirty = true;
  }
  fitDist() { if (!this.R) return; const fov = THREE.MathUtils.degToRad(this.camera.fov), a = this.camera.aspect, need = (this.R + 0.7) / Math.tan(fov / 2) / Math.min(1, a); /* 島が画面いっぱいに入る大きさ（お盆のふちは少し切れてよい） */ this.cam.fit = this.cam.dist = need * 1.06; this.cam.min = need; this.cam.shift = 0.25; this.updateCamera(); this.camera.far = need + 20; this.camera.updateProjectionMatrix(); }

  // ---- 色をぬる（持ち主） ----
  paint(st, owners) {
    this.st = st;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0), mt = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < owners.length; i++) {
      const o = owners[i], t = st.terrain[i];
      if (this.owners && this.owners[i] === o) continue;
      c.set(TOP[t]); if (o >= 0) c.lerp(C(st.players[o].color), t === G.T.PLAIN ? 0.62 : 0.5);
      if (this.tileModel) {
        const tc = o >= 0 ? st.players[o].color : t === G.T.LAKE ? '#5fb0d0' : t === G.T.RUNE ? '#b49cf2' : null;
        const [x, z] = this.hp(i);
        if (tc) { mt.makeTranslation(x, this.topY(i) + 0.004, z); this.tint.setMatrixAt(i, mt); this.tint.setColorAt(i, C(tc)); } else this.tint.setMatrixAt(i, hide);
        c.set(TILE_TINT[t]);
      }
      this.caps.setColorAt(i, c);
      if (o >= 0) { const [x, z] = this.hp(i); mt.makeTranslation(x, this.topY(i) + 0.006, z); this.rings.setMatrixAt(i, mt); this.rings.setColorAt(i, C(st.players[o].color).multiplyScalar(0.62)); }
      else this.rings.setMatrixAt(i, hide);
    }
    this.caps.instanceColor.needsUpdate = true; if (this.tint) { this.tint.instanceMatrix.needsUpdate = true; this.tint.instanceColor.needsUpdate = true; } this.rings.instanceMatrix.needsUpdate = true; if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    // お城の旗の色（取られたら取った人の色に）
    for (const [i, k] of this.castleObjs || []) { const o = owners[i], col = C(o >= 0 ? st.players[o].color : '#ffffff'); if (this.flags) this.flags.setColorAt(k, col); if (this.castleTint) this.castleTint.setColorAt(k, col); }
    if (this.flags) this.flags.instanceColor.needsUpdate = true; if (this.castleTint && this.castleTint.instanceColor) this.castleTint.instanceColor.needsUpdate = true;
    this.owners = owners.slice(); this.dirty = true;
  }

  // ---- 上にのせる物：光るマス・兵のコマ・数字の札・宝箱 ----
  overlay(d) {
    const st = this.st; if (!st || !this.glow) return;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0), mt = new THREE.Matrix4();
    const can = new Set(d.can.map(x => x.i));
    for (let i = 0; i < this.m.N; i++) { if (can.has(i)) { const [x, z] = this.hp(i); mt.makeTranslation(x, this.topY(i) + 0.012, z); this.glow.setMatrixAt(i, mt); } else this.glow.setMatrixAt(i, hide); }
    this.glow.instanceMatrix.needsUpdate = true;
    this.glow.material.color.set(d.targeting ? '#ff8ad8' : '#fff3a0');
    // 兵のコマ（1マス最大5こ並べ、数は札で）
    let k = 0; const col = new THREE.Color();
    const put = (i, n, color) => { const [x, z] = this.hp(i), y = this.topY(i), shown = Math.min(n, this.models.soldier ? 1 : 3); for (let j = 0; j < shown && k < (this.models.soldier ? 60 : 240); j++) { const a = j / shown * Math.PI * 2 + 0.5, r = shown === 1 ? 0 : 0.3; mt.makeRotationY(-a).setPosition(x + Math.cos(a) * r, y, z + Math.sin(a) * r); this.bases.setMatrixAt(k, mt); this.bases.setColorAt(k, col.set(color)); mt.makeRotationY(-a + Math.PI / 2).setPosition(x + Math.cos(a) * r, y + 0.04, z + Math.sin(a) * r); this.soldiers.setMatrixAt(k, mt); this.soldiers.setColorAt(k, this.models.soldier ? col.set('#ffffff') : col.set(color)); if (this.shields) { this.shields.setMatrixAt(k, mt); this.shields.setColorAt(k, col.set(color)); } k++; } };
    for (const p of d.placed) put(p.i, p.n, p.color);
    for (const f of d.force) put(f.i, f.n, f.color);
    this.soldiers.count = this.bases.count = k; if (this.shields) { this.shields.count = k; this.shields.instanceMatrix.needsUpdate = true; if (this.shields.instanceColor) this.shields.instanceColor.needsUpdate = true; } this.bases.instanceMatrix.needsUpdate = true; if (this.bases.instanceColor) this.bases.instanceColor.needsUpdate = true; this.soldiers.instanceMatrix.needsUpdate = true; if (this.soldiers.instanceColor) this.soldiers.instanceColor.needsUpdate = true;
    // 宝箱
    const want = new Set(d.chests);
    for (const [i, o] of this.chestObjs) if (!want.has(i)) { this.world.remove(o); this.chestObjs.delete(i); }
    for (const i of want) if (!this.chestObjs.has(i)) { const o = this.models.chest ? this.models.chest.clone() : procChest(); o.traverse(c => { if (c.isMesh) c.castShadow = true; }); const glow = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 24), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.012; o.add(glow); /* 宝箱の足もとに金色の輪（見つけやすく） */ const [x, z] = this.hp(i); o.position.set(x + 0.25, this.topY(i), z + 0.2); o.rotation.y = -0.5; this.world.add(o); this.chestObjs.set(i, o); }
    // 数字の札（HTML）
    const L = [];
    for (const c of d.can) if (c.need != null) L.push({ key: 'n' + c.i, i: c.i, cls: 'need', html: c.need, dy: 0 });
    for (const p of d.placed) { L.push({ key: 'p' + p.i, i: p.i, cls: 'cnt', html: p.n, color: p.color, dy: 0.5 }); if (p.pill) L.push({ key: 'q' + p.i, i: p.i, cls: 'pill ' + (p.ok ? 'ok' : 'ng'), html: p.pill, dy: -0.05 }); }
    for (const f of d.force) L.push({ key: 'f' + f.i, i: f.i, cls: 'cnt small', html: f.n, color: f.color, dy: 0.45 });
    if (d.target) L.push({ key: 't', i: d.target.i, cls: 'tgt', html: d.target.html, dy: 0.7 });
    this.setLabels(L);
    this.dirty = true; this.shadowDirty = true;
  }
  setLabels(list) {
    const seen = new Set();
    for (const l of list) {
      let e = this.lbl.get(l.key);
      if (!e) { e = document.createElement('div'); this.labels.append(e); this.lbl.set(l.key, e); }
      e.className = 'l ' + l.cls; if (e.__h !== String(l.html)) { e.innerHTML = l.html; e.__h = String(l.html); }
      e.style.background = l.color || ''; e.__i = l.i; e.__dy = l.dy; seen.add(l.key);
    }
    for (const [k, e] of this.lbl) if (!seen.has(k)) { e.remove(); this.lbl.delete(k); }
    this.placeLabels();
  }
  placeLabels() {
    if (!this.lbl.size) return;
    this.labels.classList.toggle('tiny', this.hexPx() < 34); // マスが小さい時は札も小さく
    const r = this.canvas.getBoundingClientRect(), v = new THREE.Vector3();
    for (const e of this.lbl.values()) {
      const [x, z] = this.hp(e.__i); v.set(x, this.topY(e.__i) + e.__dy, z).project(this.camera);
      const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height;
      e.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%)`;
      e.style.display = v.z > 1 ? 'none' : '';
    }
  }

  // ---- カメラ：真上から固定。盤面（お盆ごと）を画面にぴったり収める ----
  updateCamera() {
    const d = this.cam.dist, tilt = THREE.MathUtils.degToRad(TILT); // ほぼ真上（少しだけ斜め）から固定
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d + this.cam.shift); this.camera.lookAt(0, 0, this.cam.shift);
  }
  // 固定カメラなので、ずらす・広げる・カメラを動かす操作は何もしない
  panPixels() {} zoomBy() {} zoomToward() {} fit() {} flyTo() {} saveView() {} restoreView() {}
  isZoomed() { return false; }
  groundAt(px, py) { const r = this.canvas.getBoundingClientRect(); this.v2.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.v2, this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), p) ? p : null; }
  pick(px, py) { if (!this.caps) return -1; const r = this.canvas.getBoundingClientRect(); this.v2.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.v2, this.camera); const h = this.ray.intersectObjects(this.tileModel ? [this.caps] : [this.caps, this.sides], false)[0]; if (h && h.instanceId != null && this.st.terrain[h.instanceId] !== G.T.LAKE) return h.instanceId; const g = this.groundAt(px, py); if (!g) return -1; let best = -1, bd = 0.95; for (let i = 0; i < this.m.N; i++) { const [x, z] = this.hp(i), d = Math.hypot(x - g.x, z - g.z); if (d < bd) { bd = d; best = i; } } return best >= 0 && this.st.terrain[best] !== G.T.LAKE ? best : -1; }
  hexPx() { if (!this.m) return 40; const r = this.canvas.getBoundingClientRect(); const a = new THREE.Vector3(this.cam.tx, 0.3, this.cam.tz).project(this.camera), b = new THREE.Vector3(this.cam.tx + SQ, 0.3, this.cam.tz).project(this.camera); return Math.abs(b.x - a.x) / 2 * r.width; }

  // ---- 毎フレーム ----
  frame(t) {
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000); this.lastT = t;
    // 何も変わっていない時は描かない（カメラは固定なので、変わった時と演出中だけ描く）
    if (!this.fx.length && !this.dirty) return;
    this.fx = this.fx.filter(f => { const p = Math.min(1, (t - (f.t0 ??= t)) / f.dur); f.step(p, dt, t); if (p >= 1) { f.end && f.end(); return false; } return true; });
    const moving = this.fx.some(f => f.shadow); // 影のある物が動いている時だけ、影を計算し直す
    if (moving || this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = moving; }
    this.renderer.render(this.scene, this.camera);
    if (this.dirty) this.placeLabels();
    this.dirty = this.fx.length > 0;
  }
  addFx(dur, step, end, shadow = false) { this.fx.push({ dur, step, end, shadow }); }
  tmp(obj) { this.world.add(obj); return () => { this.world.remove(obj); obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }; }
  pos(i, dy = 0) { const [x, z] = this.hp(i); return new THREE.Vector3(x, this.topY(i) + dy, z); }

  // ---- 演出 ----
  particles(at, { n = 30, color = '#ffb347', size = 0.12, spread = 0.6, up = 1.5, life = 900, gravity = -2, cone = false, dir = null }) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
    for (let k = 0; k < n; k++) { p.set([at.x, at.y, at.z], k * 3); const a = Math.random() * 6.28, s = Math.random() * spread; v.push(dir ? new THREE.Vector3(dir.x + (Math.random() - .5) * spread, dir.y + (Math.random() - .5) * spread, dir.z + (Math.random() - .5) * spread) : new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random() * 0.5), Math.sin(a) * s)); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, mat), rm = this.tmp(pts);
    this.addFx(life, (q, dt) => { for (let k = 0; k < n; k++) { v[k].y += gravity * dt; p[k * 3] += v[k].x * dt; p[k * 3 + 1] += v[k].y * dt; p[k * 3 + 2] += v[k].z * dt; } g.attributes.position.needsUpdate = true; mat.opacity = 1 - q; }, rm);
  }
  flash(i, color = '#ffffff', dur = 700) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(hexShape(0.97)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.geometry.rotateX(-Math.PI / 2); m.position.copy(this.pos(i, 0.02)); m.renderOrder = 3; const rm = this.tmp(m);
    this.addFx(dur, q => { m.material.opacity = 0.9 * (1 - q); m.position.y = this.topY(i) + 0.02 + q * 0.2; }, rm);
  }
  pop(i) { // マスが取られた：ぽんっとはねる
    const mt = new THREE.Matrix4(), [x, z] = this.hp(i), h = this.topY(i);
    if (this.tileModel) { this.addFx(500, q => { const b = Math.sin(q * Math.PI) * 0.25; mt.makeScale(1.94, (h + b) / 0.16, 1.94).setPosition(x, 0, z); this.caps.setMatrixAt(i, mt); this.caps.instanceMatrix.needsUpdate = true; }); this.particles(this.pos(i, 0.05), { n: 14, color: '#e8d8b0', size: 0.1, spread: 0.9, up: 0.8, life: 600, gravity: -1.5 }); return; }
    this.addFx(500, q => { const b = Math.sin(q * Math.PI) * 0.25; mt.makeScale(1, h + b, 1).setPosition(x, h + b, z); this.sides.setMatrixAt(i, mt); this.sides.instanceMatrix.needsUpdate = true; mt.makeTranslation(x, h + b + 0.001, z); this.caps.setMatrixAt(i, mt); this.caps.instanceMatrix.needsUpdate = true; const r = new THREE.Matrix4(); this.rings.getMatrixAt(i, r); if (r.elements[0]) { r.makeTranslation(x, h + b + 0.006, z); this.rings.setMatrixAt(i, r); this.rings.instanceMatrix.needsUpdate = true; } });
    this.particles(this.pos(i, 0.05), { n: 14, color: '#e8d8b0', size: 0.1, spread: 0.9, up: 0.8, life: 600, gravity: -1.5 });
  }
  castleOf(pi) { return this.st.players[pi] ? this.st.players[pi].castle : 0; }
  dragonFly(tiles, done) { // ドラゴンが飛んできて、火をふく
    const d = this.models.dragon ? this.models.dragon.clone() : procDragon(); d.traverse(c => { if (c.isMesh) c.castShadow = true; }); if (!this.models.dragon) d.scale.setScalar(1.4);
    const rm = this.tmp(d), first = tiles.length ? this.pos(tiles[0]) : new THREE.Vector3();
    const a = new THREE.Vector3(-this.R - 6, 5, this.R + 3), b = first.clone().add(new THREE.Vector3(0, 2.2, 0)), c = new THREE.Vector3(this.R + 6, 6, -this.R - 3);
    let fired = false;
    const mixer = d.userData.anims && d.userData.anims.length && new THREE.AnimationMixer(d); if (mixer) mixer.clipAction(d.userData.anims[0]).play();
    this.addFx(2600, (q, dt, t) => {
      const p = q < 0.45 ? a.clone().lerp(b, ease(q / 0.45)) : q < 0.6 ? b.clone() : b.clone().lerp(c, (q - 0.6) / 0.4);
      const nx = q < 0.45 ? b : c; d.position.copy(p); d.lookAt(nx.x, p.y, nx.z);
      if (d.userData.wings) { const w = Math.sin(t / 90) * 0.6; d.userData.wings[0].rotation.z = w; d.userData.wings[1].rotation.z = -w; }
      if (mixer) mixer.update(dt);
      if (q > 0.45 && !fired) { fired = true; for (const i of tiles) { const to = this.pos(i).sub(b); this.particles(b.clone(), { n: 50, color: '#ff7a2a', size: 0.22, dir: to.multiplyScalar(1.6), spread: 0.6, life: 800, gravity: 0 }); setTimeout(() => { this.flash(i, '#ff5a1f', 900); this.particles(this.pos(i, 0.1), { n: 24, color: '#ffcf5a', size: 0.14, up: 1.6, life: 900 }); }, 380); } }
    }, () => { rm(); done && done(); }, true);
  }
  fxCard(k, pi, data = {}) {
    const home = this.pos(this.castleOf(pi));
    if (k === 'dragon') return this.dragonFly(data.tiles || []);
    if (k === 'shield') { for (const i of data.tiles || []) { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9fe0ff', emissive: '#4fb0e0', emissiveIntensity: 0.9, transparent: true, opacity: 0.6, depthWrite: false })); dome.position.copy(this.pos(i)); const rm = this.tmp(dome); this.addFx(1700, q => { dome.scale.setScalar(Math.min(1, q * 4)); dome.material.opacity = 0.6 * (q < 0.7 ? 1 : (1 - q) / 0.3); }, rm); } return; }
    if (k === 'portal') { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 32), new THREE.MeshStandardMaterial({ color: '#c9a8ff', emissive: '#8a5aff', emissiveIntensity: 1.5 })); ring.rotation.x = Math.PI / 2; ring.position.copy(home); const rm = this.tmp(ring); this.addFx(1600, (q, dt, t) => { ring.position.y = home.y + 0.1 + q * 1.4; ring.rotation.z = t / 150; ring.scale.setScalar(1 + Math.sin(q * Math.PI) * 0.5); ring.material.opacity = 1 - q; }, rm); this.particles(home.clone().add(new THREE.Vector3(0, 0.3, 0)), { n: 40, color: '#b98aff', size: 0.12, spread: 1.2, up: 2, life: 1400, gravity: -0.5 }); return; }
    if (k === 'hero') { for (let j = 0; j < 3; j++) { const sw = new THREE.Group(); const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.02), new THREE.MeshStandardMaterial({ color: '#e8eef5', metalness: 0.8, roughness: 0.2, emissive: '#fff3b0', emissiveIntensity: 0.4 })); bl.position.y = 0.35; const gd = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: '#c4862a', metalness: 0.5 })); gd.position.y = 0.72; sw.add(bl, gd); sw.rotation.z = Math.PI; sw.scale.setScalar(1.8); const off = new THREE.Vector3(Math.cos(j * 2.1) * 0.45, 0, Math.sin(j * 2.1) * 0.45); const rm = this.tmp(sw); this.addFx(1300 + j * 120, q => { const f = Math.min(1, q / 0.5); sw.position.copy(home).add(off).add(new THREE.Vector3(0, 0.8 + (1 - ease(f)) * 4, 0)); if (q > 0.5 && !sw.userData.hit) { sw.userData.hit = 1; this.particles(home.clone().add(off), { n: 16, color: '#fff1a0', size: 0.12, up: 1.2, life: 600 }); } }, rm, true); } this.flash(this.castleOf(pi), '#fff3b0', 1300); return; }
    if (k === 'dice') { const v = data.value || 1, faces = [1, 2, 3, 4, 5, 6].map(n => new THREE.MeshStandardMaterial({ map: dieTexture(n), roughness: 0.5 })); const cube = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [faces[1], faces[5], faces[v - 1], faces[3], faces[2], faces[4]]); cube.castShadow = true; const rm = this.tmp(cube); this.addFx(1500, q => { const f = Math.min(1, q / 0.6); cube.position.copy(home).add(new THREE.Vector3(0.5, 0.25 + Math.abs(Math.sin(f * Math.PI * 2.5)) * (1 - f) * 2.5, 0.5)); cube.rotation.set((1 - f) * 9, (1 - f) * 5, (1 - f) * 7); cube.material.forEach(m => { m.transparent = q > 0.85; m.opacity = q > 0.85 ? (1 - q) / 0.15 : 1; }); }, rm, true); return; }
    if (k === 'storm') { const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshStandardMaterial({ color: '#6b7380', transparent: true, opacity: 0.75, roughness: 1 })); cloud.scale.set(this.R * 0.7, 0.5, this.R * 0.7); cloud.position.set(0, 4, 0); const rm = this.tmp(cloud); this.addFx(1800, (q, dt, t) => { cloud.rotation.y = t / 500; cloud.material.opacity = 0.75 * Math.sin(q * Math.PI); }, rm); for (let j = 0; j < 4; j++) setTimeout(() => this.particles(new THREE.Vector3((Math.random() - .5) * this.R, 3.5, (Math.random() - .5) * this.R), { n: 60, color: '#bcd7e8', size: 0.08, spread: 2.5, up: -3, life: 900, gravity: -4 }), j * 250); return; }
    if (k === 'thunder') { const at = this.pos(data.target ?? this.castleOf(pi)); const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 9, 6), new THREE.MeshBasicMaterial({ color: '#fff6a0', transparent: true, opacity: 0.95 })); bolt.position.copy(at).add(new THREE.Vector3(0, 4.5, 0)); const rm = this.tmp(bolt); this.addFx(700, q => { bolt.material.opacity = (Math.sin(q * 40) > 0 ? 0.95 : 0.3) * (1 - q); bolt.scale.x = bolt.scale.z = 1 + Math.sin(q * 30) * 0.5; }, rm); this.flash(data.target, '#fff6a0', 900); this.particles(at.clone().add(new THREE.Vector3(0, 0.1, 0)), { n: 30, color: '#ffe066', size: 0.14, up: 2.2, spread: 1.2, life: 800 }); return; }
    if (k === 'knights') { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.copy(home).add(new THREE.Vector3(0, 0.1, 0)); const rm = this.tmp(ring); this.addFx(1300, q => { ring.scale.setScalar(1 + q * 4.2); ring.material.opacity = 0.9 * (1 - q); }, rm); this.particles(home.clone().add(new THREE.Vector3(0, 0.2, 0)), { n: 40, color: '#ffe8a0', size: 0.12, spread: 2.4, up: 0.8, life: 1000, gravity: -0.5 }); return; }
    if (k === 'catapult') { const from = home.clone().add(new THREE.Vector3(0, 0.6, 0)), to = this.pos(data.target ?? 0, 0.1); const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: '#9a9288', roughness: 1, flatShading: true })); stone.castShadow = true; const rm = this.tmp(stone); let hit = false; this.addFx(1300, (q, dt) => { const f = Math.min(1, q / 0.75); stone.position.lerpVectors(from, to, f); stone.position.y += Math.sin(f * Math.PI) * 3; stone.rotation.x += dt * 8; stone.visible = f < 1; if (f >= 1 && !hit) { hit = true; this.flash(data.target, '#ffcf8a', 800); this.particles(to.clone(), { n: 40, color: '#c9b48e', size: 0.14, up: 2, spread: 1.4, life: 900 }); } }, rm, true); return; }
    if (k === 'seal') { const at = this.pos(this.castleOf(data.owner ?? 0), 0.5); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: '#b48cff', emissive: '#7a4fd6', emissiveIntensity: 1.2, transparent: true })); ring.position.copy(at); ring.rotation.x = Math.PI / 2; const rm = this.tmp(ring); this.addFx(1500, (q, dt, t) => { ring.rotation.z = t / 200; ring.scale.setScalar(1.6 - Math.min(1, q * 2) * 0.6); ring.material.opacity = q > 0.8 ? (1 - q) / 0.2 : 1; }, rm); this.particles(at, { n: 30, color: '#c9a8ff', size: 0.12, up: 1, spread: 1, life: 1200, gravity: -0.3 }); return; }
    if (k === 'thief') { const from = this.pos(this.castleOf(data.owner ?? 0), 0.6), to = home.clone().add(new THREE.Vector3(0, 0.6, 0)); for (let j = 0; j < 6; j++) { const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), new THREE.MeshStandardMaterial({ color: '#f2c25a', metalness: 0.6, roughness: 0.3, emissive: '#7a5a10', emissiveIntensity: 0.3 })); const rm = this.tmp(coin); const d0 = j * 0.08; this.addFx(1500, (q, dt, t) => { const f = Math.max(0, Math.min(1, (q - d0) / 0.7)); coin.position.lerpVectors(from, to, ease(f)); coin.position.y += Math.sin(f * Math.PI) * 2; coin.rotation.x = t / 80; coin.visible = f > 0 && f < 1; }, rm, true); } return; }
    if (k === 'swap') { if (data.target != null) { this.flash(data.target, this.st.players[pi].color, 1200); this.particles(this.pos(data.target, 0.2), { n: 36, color: this.st.players[pi].color, size: 0.14, up: 1.8, spread: 1, life: 1000 }); } return; }
    if (k === 'wrath') return this.dragonFly(data.tiles || []);
    if (k === 'legend') { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })); beam.position.copy(home).add(new THREE.Vector3(0, 3, 0)); const rm = this.tmp(beam); this.addFx(1800, q => { beam.material.opacity = 0.6 * Math.sin(q * Math.PI); beam.scale.x = beam.scale.z = 0.5 + q; }, rm); this.particles(home.clone().add(new THREE.Vector3(0, 0.4, 0)), { n: 60, color: '#fff1a0', size: 0.14, up: 3, spread: 1.4, life: 1500, gravity: -0.4 }); return; }
    if (k === 'quake') { const W = this.world, y0 = W.position.clone(); this.addFx(1400, (q, dt, t) => { const a = (1 - q) * 0.12; W.position.set(y0.x + Math.sin(t / 25) * a, y0.y, y0.z + Math.cos(t / 31) * a); if (q >= 1) W.position.copy(y0); }, () => W.position.copy(y0)); for (const i of data.tiles || []) { this.flash(i, '#c9a27a', 1200); this.particles(this.pos(i, 0.1), { n: 16, color: '#b9a080', size: 0.12, up: 1.2, spread: 0.8, life: 900 }); } return; }
    if (k === 'treasure') { for (let j = 0; j < 3; j++) { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshStandardMaterial({ color: '#9ee0e4', emissive: '#2f8a96', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.2 })); const rm = this.tmp(gem); const a = j * 2.1; this.addFx(1400, (q, dt, t) => { gem.position.copy(home).add(new THREE.Vector3(Math.cos(a + q * 4) * 0.5 * q, 0.6 + Math.sin(q * Math.PI) * 1.4, Math.sin(a + q * 4) * 0.5 * q)); gem.rotation.y = t / 120; gem.scale.setScalar(q > 0.8 ? (1 - q) / 0.2 : 1); }, rm); } this.particles(home.clone().add(new THREE.Vector3(0, 0.5, 0)), { n: 30, color: '#bff4ff', size: 0.1, up: 2, life: 1100 }); return; }
  }
  fxEvent(k, data = {}) {
    if (k === 'raid') return this.dragonFly(data.tiles || []);
    if (k === 'wave') { const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#8fd0e0', transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: '#3f9fc0', emissiveIntensity: 0.2 })); const rm = this.tmp(wall); const r0 = this.R + 3, r1 = this.R - 1.2; this.addFx(1600, q => { const r = lerp(r0, r1, ease(q)); wall.scale.set(r, 1, r); wall.position.y = 0.4 + Math.sin(q * Math.PI) * 0.3; wall.material.opacity = 0.7 * (q < 0.8 ? 1 : (1 - q) / 0.2); }, rm); setTimeout(() => { for (const i of data.tiles || []) { this.flash(i, '#bfeaff', 900); this.particles(this.pos(i, 0.1), { n: 20, color: '#dff6ff', size: 0.1, up: 1.5, life: 800 }); } }, 1000); return; }
    if (k === 'gold') { const coinG = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), coinM = new THREE.MeshStandardMaterial({ color: '#f2c25a', metalness: 0.7, roughness: 0.3, emissive: '#7a5a10', emissiveIntensity: 0.3 }); const n = 40, inst = new THREE.InstancedMesh(coinG, coinM, n); const sd = []; for (let j = 0; j < n; j++) sd.push([(Math.random() - .5) * this.R * 1.8, (Math.random() - .5) * this.R * 1.8, Math.random() * 0.5, Math.random() * 6]); const rm = this.tmp(inst), mt = new THREE.Matrix4(), e = new THREE.Euler(); this.addFx(2000, (q, dt, t) => { sd.forEach(([x, z, d, r], j) => { const f = Math.max(0, Math.min(1, (q - d * 0.6) / 0.5)); const y = 3.6 - ease(f) * 3.2 + (f >= 1 ? Math.abs(Math.sin((q - d * 0.6 - 0.5) * 12)) * 0.2 : 0); e.set(t / 100 + r, r, 0); mt.makeRotationFromEuler(e).setPosition(x, y, z); inst.setMatrixAt(j, mt); }); inst.instanceMatrix.needsUpdate = true; coinM.transparent = q > 0.85; coinM.opacity = q > 0.85 ? (1 - q) / 0.15 : 1; }, rm, true); return; }
    if (k === 'glow') { for (const r of this.runeObjs || []) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#b48cff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); beam.position.copy(this.pos(r.i, 2.5)); const rm = this.tmp(beam); this.addFx(1700, q => { beam.material.opacity = 0.55 * Math.sin(q * Math.PI); beam.scale.x = beam.scale.z = 0.6 + q * 0.6; }, rm); this.particles(this.pos(r.i, 0.6), { n: 20, color: '#e0ccff', size: 0.1, up: 2.5, life: 1400, gravity: 0 }); } return; }
    if (k === 'fairy') { const f = this.models.fairy ? this.models.fairy.clone() : procFairy(); f.scale.setScalar(this.models.fairy ? 2 : 3); const rm = this.tmp(f); const stops = this.st.players.map((_, pi) => this.pos(this.castleOf(pi), 1.2)); if (!stops.length) return rm(); let last = 0; this.addFx(2400, (q, dt, t) => { const s = q * stops.length, k2 = Math.min(stops.length - 1, Math.floor(s)), a = stops[k2], b = stops[(k2 + 1) % stops.length]; f.position.copy(a).lerp(b, ease(s - k2)); f.position.y += Math.sin(t / 150) * 0.15; if (f.userData.wings) { const w = Math.sin(t / 40) * 0.8; f.userData.wings[0].rotation.y = 0.6 + w; f.userData.wings[1].rotation.y = -0.6 - w; } if (t - last > 70) { last = t; this.particles(f.position.clone(), { n: 4, color: '#ffe8a8', size: 0.09, spread: 0.3, up: -0.2, life: 700, gravity: -0.5 }); } }, rm); return; }
  }
  fxChest(i) {
    const o = this.chestObjs.get(i), at = this.pos(i, 0.3);
    if (o && o.userData.lid) { const lid = o.userData.lid; this.addFx(900, q => { lid.rotation.x = -ease(Math.min(1, q * 2)) * 1.6; }); }
    else if (o) { const y0 = o.position.y; this.addFx(700, q => { o.position.y = y0 + Math.sin(q * Math.PI) * 0.4; o.rotation.y = -0.5 + q * 6.28; }); }
    this.particles(at, { n: 40, color: '#ffe066', size: 0.12, up: 2.2, spread: 0.8, life: 1100 });
  }
  // ---- 合戦：兵がとなりの自分の土地から行進して、ぶつかり、取ったら旗を立てる ----
  marchSoldier(color) {
    const g = new THREE.Group(), src = this.models.soldier;
    const body = src ? src.clone() : procSoldier();
    body.traverse(c => { if (c.isMesh) { c.castShadow = true; if (!src || /shield/i.test(c.name + ' ' + [].concat(c.material).map(m => m.name).join(' '))) { c.material = [].concat(c.material).map(m => { const n = m.clone(); n.color.set(color); n.map = null; return n; }); if (c.material.length === 1) c.material = c.material[0]; } } });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 18), new THREE.MeshStandardMaterial({ color })); base.position.y = 0.025; g.add(base); body.position.y = 0.04; g.add(body);
    return g;
  }
  clearFlags() { for (const f of this.capFlags || []) this.world.remove(f); this.capFlags = []; this.dirty = true; this.shadowDirty = true; }
  plantFlag(i, color) {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), new THREE.MeshStandardMaterial({ color: '#5b4636' })); pole.position.y = 0.4; g.add(pole);
    const cg = new THREE.PlaneGeometry(0.42, 0.28); cg.translate(0.21, 0, 0); const cloth = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15 })); cloth.position.y = 0.66; cloth.rotation.x = -0.4; g.add(cloth);
    g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    const at = this.pos(i); g.position.copy(at); g.position.x -= 0.3; this.world.add(g); (this.capFlags ||= []).push(g);
    this.addFx(450, q => { g.position.y = at.y + (1 - ease(q)) * 2.5; g.scale.setScalar(0.6 + 0.4 * q); }, () => { this.particles(at.clone().add(new THREE.Vector3(-0.3, 0.05, 0)), { n: 14, color: '#e8d8b0', size: 0.1, up: 1, spread: 0.7, life: 600 }); }, true);
  }
  // fights：[{ i, w（攻め手）, r（結果）, from（行進を始めるマス）}]。ms：行進の長さ
  fxBattle(fights, ms = 900) {
    this.clearFlags();
    for (const f of fights) {
      const color = this.st.players[f.w].color, s = this.marchSoldier(color), rm = this.tmp(s);
      const from = this.pos(f.from), to = this.pos(f.i), dir = Math.atan2(to.x - from.x, to.z - from.z);
      s.rotation.y = dir; let clashed = false;
      this.addFx(ms + 700, (q, dt, t) => {
        const tt = q * (ms + 700), f1 = Math.min(1, tt / ms), p = from.clone().lerp(to, ease(f1) * 0.82);
        s.position.copy(p); s.position.y = lerp(from.y, to.y, f1) + Math.abs(Math.sin(tt / 70)) * 0.08 * (f1 < 1 ? 1 : 0);
        if (f1 >= 1 && !clashed) { clashed = true; this.particles(to.clone().add(new THREE.Vector3(0, 0.4, 0)), { n: 26, color: '#fff3c0', size: 0.12, up: 1.6, spread: 1.6, life: 500, gravity: -3 }); this.particles(to.clone().add(new THREE.Vector3(0, 0.05, 0)), { n: 14, color: '#c9b48e', size: 0.12, up: 0.6, spread: 1.2, life: 700 }); }
        if (f1 >= 1 && f.r !== 'take') { const k = Math.min(1, (tt - ms) / 400); s.rotation.x = -k * 1.4; } // 負けた兵は倒れる
        if (f1 >= 1 && f.r === 'take') s.position.y += Math.abs(Math.sin((tt - ms) / 90)) * 0.12; // 勝った兵はとびはねる
      }, () => { rm(); }, true);
    }
  }
  fxFocus(i) { // とりあいのマスに光の輪
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.copy(this.pos(i, 0.05)); const rm = this.tmp(ring);
    this.addFx(2200, (q, dt, t) => { ring.material.opacity = 0.9 * (0.5 + 0.5 * Math.sin(t / 120)) * (q > 0.85 ? (1 - q) / 0.15 : 1); ring.position.y = this.topY(i) + 0.05 + Math.sin(t / 200) * 0.03; }, rm);
  }
}
