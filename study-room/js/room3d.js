// 立体の部屋。部屋の真ん中に立って、スワイプで見回す。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOM, WINDOW, kindsOf, variantsOf, SPECIALS } from './catalog.js';
import { loadTex, texturedMaterial, loadModel, fitMaterial, shadowAll } from './loaders.js';
import { buildExterior } from './exterior.js';

const HW = ROOM.w / 2, HD = ROOM.d / 2, H = ROOM.h;
const WALL_T = 0.14;

// 時間帯・天気ごとの光
// 時間帯・天気ごとの光。sky = 空の写真（Poly Haven の puresky を、太陽が窓の外に来るよう回したもの）
// dir = 日の光の進む向き（空の写真の太陽の位置から計算）
const MOODS = {
  morning: { photo: 'morning', sun: '#fff1dc', sunI: 6.5, dir: [-0.208, -0.741, 0.639], hemiSky: '#dce9ff', hemiGround: '#d9c6ad', hemiI: 0.9,
    env: 0.45, exp: 1.0, ray: '#fff4dc', rayI: 0.09, lampI: 0.6, bg: 1.0, fog: '#c9d8e8', hill: '#6f8a5c' },
  overcast: { photo: 'overcast', sun: '#e6edf6', sunI: 2.2, dir: [0.25, -0.75, 1], hemiSky: '#e3e8f0', hemiGround: '#bdb6ac', hemiI: 1.3,
    env: 0.5, exp: 1.05, ray: '#e8eef8', rayI: 0.03, lampI: 0.8, bg: 1.0, fog: '#c3c7cd', hill: '#6b7766' },
  sunset: { photo: 'sunset', sun: '#ffa65a', sunI: 7.5, dir: [0.365, -0.122, 0.923], hemiSky: '#ffd2a6', hemiGround: '#b98e6c', hemiI: 0.6,
    env: 0.3, exp: 0.95, ray: '#ffc27a', rayI: 0.15, lampI: 1.0, bg: 1.0, fog: '#e7b48e', hill: '#5c5a48' },
  night: { photo: 'night', sun: '#8fa8ff', sunI: 0.6, dir: [0.3, -0.5, 1], hemiSky: '#33405e', hemiGround: '#3a3026', hemiI: 0.3,
    env: 0.1, exp: 1.1, ray: '#9fb4ff', rayI: 0.02, lampI: 3.0, bg: 0.12, fog: '#0f1420', hill: '#1d2430' },
};

export class Room3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1714');
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 60);
    this.camera.position.set(0.2, 1.5, 1.2);
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0.25; this.pitch = -0.12;
    this.vyaw = 0; this.vpitch = 0;
    this.targetLook = null;

    // 光
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 0.5; sc.far = 80;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.shell = new THREE.Group();   // 壁・床・天井・窓
    this.items = new THREE.Group();   // 家具
    this.fx = new THREE.Group();      // 光の筋・ほこり
    this.scene.add(this.shell, this.items, this.fx);

    this.slotObjs = {};  // kindId → Object3D
    this.lamps = [];
    this.active = true;
    this.clock = new THREE.Clock();

    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 縦長の画面では横の視野が狭くなるので少し広げる
    this.baseFov = w < h ? 88 : 62;
    this.camera.fov = this.baseFov * (this.zoom || 1);
    this.camera.updateProjectionMatrix();
  }

  setActive(on) { this.active = on; }

  // --- 見回す操作 ---
  bindControls() {
    const el = this.canvas;
    const pts = new Map();
    let lastX = 0, lastY = 0, pinch0 = 0, zoom0 = 1;
    this.zoom = 1;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; lastY = e.clientY;
      this.targetLook = null;
      this.dragging = true; this.vyaw = this.vpitch = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.zoom;
      }
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom(zoom0 * pinch0 / Math.max(d, 1));
        return;
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const k = 0.0042 * this.zoom;
      this.yaw += dx * k; this.pitch += dy * k;  // 指の動きに部屋がついてくる向き
      this.vyaw = dx * k; this.vpitch = dy * k;
      this.clampPitch();
    });
    const up = e => { pts.delete(e.pointerId); if (!pts.size) this.dragging = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (1 + e.deltaY * 0.001)); }, { passive: false });
  }
  setZoom(z) {
    this.zoom = Math.min(1.15, Math.max(0.55, z));
    this.camera.fov = this.baseFov * this.zoom;
    this.camera.updateProjectionMatrix();
  }
  clampPitch() { this.pitch = Math.max(-1.1, Math.min(0.9, this.pitch)); }

  // ある場所のほうへ、ゆっくり振り向く
  lookAt(pos) {
    const c = this.camera.position;
    const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // いちばん近い回り方をえらぶ
    let y = yaw;
    while (y - this.yaw > Math.PI) y -= 2 * Math.PI;
    while (y - this.yaw < -Math.PI) y += 2 * Math.PI;
    this.targetLook = { yaw: y, pitch: Math.max(-0.9, Math.min(0.5, pitch)) };
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.active || document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.targetLook) {
      const k = 1 - Math.pow(0.02, dt);
      this.yaw += (this.targetLook.yaw - this.yaw) * k;
      this.pitch += (this.targetLook.pitch - this.pitch) * k;
      if (Math.abs(this.targetLook.yaw - this.yaw) < 0.002) this.targetLook = null;
    } else if (!this.dragging) {
      // 指をはなしたあとの慣性
      this.yaw += this.vyaw; this.pitch += this.vpitch;
      this.vyaw *= 0.9; this.vpitch *= 0.9;
      this.clampPitch();
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    // 新しく置いた物のアニメーション
    for (const o of this.items.children) {
      const a = o.userData.appear;
      if (a !== undefined && a < 1) {
        o.userData.appear = Math.min(1, a + dt * 2.2);
        const e = 1 - Math.pow(1 - o.userData.appear, 3);
        o.scale.setScalar(o.userData.baseScale * (0.82 + 0.18 * e));
        o.position.y = o.userData.baseY + (1 - e) * 0.25;
      }
    }
    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      const seeds = this.dust.userData.seeds;
      for (let i = 0; i < p.count; i++) {
        const s = seeds[i];
        p.setXYZ(i, s.x + Math.sin(t * 0.3 + s.p) * 0.05, s.y + Math.sin(t * 0.17 + s.p * 2) * 0.04, s.z + Math.cos(t * 0.23 + s.p) * 0.05);
      }
      p.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // --- 部屋の組み立て ---
  // roomDef: catalog の部屋 / st: { dir, items: {kindId: variantIndex}, specials: [] }
  async show(roomDef, st) {
    const token = (this.token = {});
    this.roomDef = roomDef;
    this.st = st;
    this.applyMood(MOODS[(roomDef.directions.find(d => d.id === st.dir) || {}).sun || 'morning']);
    await this.buildShell(st);
    if (token !== this.token) return;
    this.items.clear();
    this.slotObjs = {};
    this.lamps.forEach(l => l.parent && l.parent.remove(l));
    this.lamps = [];
    const kinds = st.dir ? kindsOf(roomDef, st.dir) : {};
    const jobs = [];
    for (const [kindId, vi] of Object.entries(st.items || {})) {
      const kind = kinds[kindId];
      if (!kind || kind.surface) continue; // 壁と床は buildShell で
      jobs.push(this.placeKind(kindId, kind, vi, false, token));
    }
    (st.specials || []).forEach((si, i) => jobs.push(this.placeSpecial(si, i, false, token)));
    if (!st.items?.ceilLight) this.addBareBulb();
    await Promise.all(jobs);
  }

  applyMood(m) {
    this.mood = m;
    this.renderer.toneMappingExposure = m.exp;
    this.scene.environmentIntensity = m.env;
    this.hemi.color.set(m.hemiSky); this.hemi.groundColor.set(m.hemiGround); this.hemi.intensity = m.hemiI;
    this.sun.color.set(m.sun); this.sun.intensity = m.sunI;
    const d = new THREE.Vector3(...m.dir).normalize();
    this.sunDir = d;
    const target = new THREE.Vector3(0, 0, -5);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(d, -40);
    this.sun.target.updateMatrixWorld();
    loadTex(`img/sky-${m.photo}.jpg`, true).then(t => {
      if (!t || this.mood !== m) return;
      t.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = t;
      this.scene.backgroundIntensity = m.bg;
    });
    this.scene.fog = new THREE.Fog(m.fog, 60, 520);
  }

  async buildShell(st) {
    const kinds = st.dir ? kindsOf(this.roomDef, st.dir) : {};
    const pick = (kindId) => {
      const k = kinds[kindId];
      const vi = st.items?.[kindId];
      return k && vi !== undefined ? variantsOf(k, st.dir)[vi] : null;
    };
    const wallV = pick('wall'), floorV = pick('floor');
    const plainWall = new THREE.MeshStandardMaterial({ color: '#e8e2d8', roughness: 0.95 });
    const plainFloor = new THREE.MeshStandardMaterial({ color: '#a8927a', roughness: 0.8 });
    const [wallM, floorM, ceilM] = await Promise.all([
      wallV ? (wallV.tex ? texturedMaterial(wallV.tex, { rep: wallV.rep, tint: wallV.tint }) : new THREE.MeshStandardMaterial({ color: wallV.color, roughness: 0.92 })) : plainWall,
      floorV ? texturedMaterial(floorV.tex, { rep: floorV.rep }) : plainFloor,
      new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.95 }),
    ]);
    // 天井は下からの照り返しが少ないので、ほんのり明るくしておく
    ceilM.emissive = new THREE.Color(this.mood.hemiGround).multiplyScalar(0.35);
    if (!wallV?.tex) wallM.userData.rep = 1;
    ceilM.userData.rep = 1;
    if (!floorV) floorM.userData.rep = 1;

    const g = this.shell;
    g.clear();
    const box = (w, h, d, x, y, z, mat, fw, fh) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fitMaterial(mat, fw ?? w, fh ?? h));
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // 床・天井
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), fitMaterial(floorM, ROOM.w, ROOM.d));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    box(ROOM.w + 0.4, WALL_T, ROOM.d + 0.4, 0, H + WALL_T / 2, 0, ceilM, ROOM.w, ROOM.d);
    // 左右と手前の壁
    box(WALL_T, H, ROOM.d + 0.3, -HW - WALL_T / 2, H / 2, 0, wallM, ROOM.d, H);
    box(WALL_T, H, ROOM.d + 0.3, HW + WALL_T / 2, H / 2, 0, wallM, ROOM.d, H);
    box(ROOM.w + 0.3, H, WALL_T, 0, H / 2, HD + WALL_T / 2, wallM, ROOM.w, H);
    // 奥の壁（窓の穴をあける）
    const x0 = WINDOW.x - WINDOW.w / 2, x1 = WINDOW.x + WINDOW.w / 2;
    const zb = -HD - WALL_T / 2;
    box(x0 + HW, H, WALL_T, (-HW + x0) / 2, H / 2, zb, wallM);
    box(HW - x1, H, WALL_T, (x1 + HW) / 2, H / 2, zb, wallM);
    box(WINDOW.w, WINDOW.y0, WALL_T, WINDOW.x, WINDOW.y0 / 2, zb, wallM);
    box(WINDOW.w, H - WINDOW.y1, WALL_T, WINDOW.x, (H + WINDOW.y1) / 2, zb, wallM);

    // 幅木（壁の下の板）
    const skirt = new THREE.MeshStandardMaterial({ color: wallV && /黒|コンクリ/.test(wallV.name) ? '#2b2724' : '#efe9df', roughness: 0.6 });
    const sk = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), skirt); m.position.set(x, 0.04, z); m.receiveShadow = true; g.add(m); };
    sk(0.015, ROOM.d, -HW + 0.008, 0); sk(0.015, ROOM.d, HW - 0.008, 0); sk(ROOM.w, 0.015, 0, HD - 0.008);
    sk(x0 + HW, 0.015, (-HW + x0) / 2, -HD + 0.008); sk(HW - x1, 0.015, (x1 + HW) / 2, -HD + 0.008);
    sk(WINDOW.w, 0.015, WINDOW.x, -HD + 0.008);

    // 窓わく・ガラス
    const frameM = new THREE.MeshStandardMaterial({ color: '#ece6dc', roughness: 0.45 });
    const fr = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameM); m.position.set(x, y, -HD - 0.02); m.castShadow = true; m.receiveShadow = true; g.add(m); };
    const ym = (WINDOW.y0 + WINDOW.y1) / 2;
    fr(WINDOW.w + 0.08, 0.05, WINDOW.x, WINDOW.y0); fr(WINDOW.w + 0.08, 0.05, WINDOW.x, WINDOW.y1);
    fr(0.05, WINDOW.y1 - WINDOW.y0, x0, ym); fr(0.05, WINDOW.y1 - WINDOW.y0, x1, ym);
    fr(0.04, WINDOW.y1 - WINDOW.y0, WINDOW.x, ym);
    fr(WINDOW.w, 0.03, WINDOW.x, WINDOW.y0 + (WINDOW.y1 - WINDOW.y0) * 0.62);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(WINDOW.w + 0.2, 0.04, 0.22), frameM);
    sill.position.set(WINDOW.x, WINDOW.y0 - 0.02, -HD + 0.06); sill.castShadow = sill.receiveShadow = true; g.add(sill);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.y1 - WINDOW.y0),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.08, metalness: 0 }));
    glass.position.set(WINDOW.x, ym, -HD - 0.03); g.add(glass);

    // 家の外（2階の部屋は3m上から見る）
    const level = this.roomDef.level || 0;
    const key = this.mood.photo + level;
    if (this.extKey !== key) {
      this.extKey = key;
      const mood = this.mood;
      buildExterior(mood, level).then(({ world, own }) => {
        if (this.extKey !== key) return;
        if (this.exterior) this.scene.remove(this.exterior.world, this.exterior.own);
        this.exterior = { world, own };
        this.scene.add(world, own);
      });
    }
    // 光の筋とほこり
    this.makeRays();
  }

  makeRays() {
    this.fx.clear();
    const d = this.sunDir;
    const x0 = WINDOW.x - WINDOW.w / 2, x1 = WINDOW.x + WINDOW.w / 2;
    const corners = [[x0, WINDOW.y0], [x1, WINDOW.y0], [x1, WINDOW.y1], [x0, WINDOW.y1]].map(([x, y]) => new THREE.Vector3(x, y, -HD));
    const proj = (p) => {
      let t = -p.y / d.y;
      t = Math.min(t, (HD - 0.05 - p.z) / d.z);
      return p.clone().addScaledVector(d, t);
    };
    const ends = corners.map(proj);
    const pos = [], fade = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], a2 = ends[i], b2 = ends[(i + 1) % 4];
      pos.push(...a.toArray(), ...b.toArray(), ...b2.toArray(), ...a.toArray(), ...b2.toArray(), ...a2.toArray());
      fade.push(1, 1, 0, 1, 0, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(this.mood.ray) }, uI: { value: this.mood.rayI } },
      vertexShader: 'attribute float fade; varying float vF; void main(){ vF=fade; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying float vF; void main(){ gl_FragColor=vec4(uColor*uI*pow(vF,1.6),1.0);} ',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.fx.add(new THREE.Mesh(geo, mat));

    // 光の中を舞うほこり
    const n = 220, seeds = [], arr = new Float32Array(n * 3);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd(), t = rnd() * 0.85;
      const start = new THREE.Vector3(x0 + (x1 - x0) * u, WINDOW.y0 + (WINDOW.y1 - WINDOW.y0) * v, -HD);
      const end = proj(start);
      const p = start.lerp(end, t);
      seeds.push({ x: p.x, y: p.y, z: p.z, p: rnd() * 10 });
      arr.set([p.x, p.y, p.z], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const spr = document.createElement('canvas'); spr.width = spr.height = 32;
    const sx = spr.getContext('2d'); const rg = sx.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = rg; sx.fillRect(0, 0, 32, 32);
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({
      size: 0.012, map: new THREE.CanvasTexture(spr), color: this.mood.ray, transparent: true,
      opacity: Math.min(1, this.mood.rayI * 6), blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.dust.userData.seeds = seeds;
    this.fx.add(this.dust);
  }

  addBareBulb() {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ emissive: '#ffd9a0', emissiveIntensity: 3, color: '#fff' }));
    bulb.position.set(0.6, H - 0.45, 0.3);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.4), new THREE.MeshStandardMaterial({ color: '#222' }));
    cord.position.set(0.6, H - 0.22, 0.3);
    const l = new THREE.PointLight('#ffd9a0', 2.5 * this.mood.lampI, 0, 2);
    l.position.copy(bulb.position).y -= 0.08;
    const g = new THREE.Group(); g.add(bulb, cord, l);
    g.userData.kind = 'bareBulb';
    this.items.add(g);
    this.lamps.push(l);
  }

  // 1つの種類の家具を置く（preview=true は「試しに置く」）
  async placeKind(kindId, kind, vi, animate, token = this.token) {
    const st = this.st;
    const v = variantsOf(kind, st.dir)[vi];
    if (kind.surface) {
      // 壁・床は部屋ごと作りなおす
      st.items = { ...st.items, [kindId]: vi };
      await this.buildShell(st);
      return;
    }
    const slot = { ...this.roomDef.slots[kind.slot], ...(v.at || {}) };
    let obj;
    if (v.proc === 'curtain') obj = makeCurtain(v);
    else if (v.proc === 'frame') obj = makeFrame(v);
    else if (v.proc === 'guitar') obj = makeGuitar(v.style);
    else if (v.tex) obj = await makeRug(v, slot);
    else obj = await loadModel(v.model);
    if (token !== this.token || !obj) return;
    if (v.model && (v.tint || v.paint)) recolor(obj, v);
    const wrap = new THREE.Group();
    wrap.add(obj);
    shadowAll(obj);
    if (slot.mount !== 'window' && slot.mount !== 'rug') this.mount(wrap, obj, slot, v);
    if (kindId === 'ceilLight') {
      this.items.children.filter(o => o.userData.kind === 'bareBulb').forEach(o => { this.items.remove(o); this.lamps = this.lamps.filter(l => l.parent !== o); });
      const bb = new THREE.Box3().setFromObject(wrap);
      const l = new THREE.PointLight(v.light || '#ffd9a8', 3 * this.mood.lampI, 0, 2);
      l.position.set((bb.min.x + bb.max.x) / 2, bb.min.y - 0.05, (bb.min.z + bb.max.z) / 2);
      wrap.add(l);
      this.lamps.push(l);
    }
    const old = this.slotObjs[kindId];
    if (old) this.items.remove(old);
    wrap.userData.kind = kindId;
    wrap.userData.baseScale = wrap.scale.x;
    wrap.userData.baseY = wrap.position.y;
    if (animate) wrap.userData.appear = 0;
    this.slotObjs[kindId] = wrap;
    this.items.add(wrap);
    return wrap;
  }

  async placeSpecial(specialIndex, slotIndex, animate, token = this.token) {
    const sp = SPECIALS[specialIndex % SPECIALS.length];
    const slot = this.roomDef.specialSlots[slotIndex % this.roomDef.specialSlots.length];
    const obj = await loadModel(sp.model);
    if (token !== this.token || !obj) return;
    const wrap = new THREE.Group(); wrap.add(obj); shadowAll(obj);
    this.mount(wrap, obj, slot, sp);
    wrap.userData.kind = 'special' + slotIndex;
    wrap.userData.baseScale = wrap.scale.x; wrap.userData.baseY = wrap.position.y;
    if (animate) wrap.userData.appear = 0;
    this.items.add(wrap);
    return wrap;
  }

  // 置き場所に合わせて、向き・大きさ・位置をそろえる
  mount(wrap, obj, slot, v) {
    obj.rotation.y = (slot.face || 0) + (v.rot || 0);
    let bb = new THREE.Box3().setFromObject(wrap);
    const size = bb.getSize(new THREE.Vector3());
    const big = Math.max(size.x, size.y, size.z);
    if (slot.max && big > slot.max * 1.3) wrap.scale.setScalar(slot.max / big);
    bb = new THREE.Box3().setFromObject(wrap);
    const c = bb.getCenter(new THREE.Vector3());
    wrap.position.x += (slot.x ?? 0) - c.x;
    wrap.position.z += (slot.z ?? 0) - c.z;
    if (slot.mount === 'floor') wrap.position.y += (slot.base || 0) - bb.min.y;
    else if (slot.mount === 'ceiling') wrap.position.y += (H - 0.005) - bb.max.y;
    else wrap.position.y += (slot.y ?? 1.5) - c.y;
    bb = new THREE.Box3().setFromObject(wrap);
    const gap = 0.015;
    if (slot.wall === '+x') wrap.position.x += (HW - gap) - bb.max.x;
    if (slot.wall === '-x') wrap.position.x += (-HW + gap) - bb.min.x;
    if (slot.wall === '-z') wrap.position.z += (-HD + gap) - bb.min.z;
    if (slot.wall === '+z') wrap.position.z += (HD - gap) - bb.max.z;
  }

  // 置いた物（または置き場所）の位置
  slotPosition(kindId, kind) {
    const o = this.slotObjs[kindId];
    if (o) return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    if (kind?.surface === 'floor') return new THREE.Vector3(0.6, 0, -0.6);
    if (kind?.surface === 'wall') return new THREE.Vector3(1.4, 1.5, -HD);
    const s = this.roomDef.slots[kind?.slot];
    if (!s) return new THREE.Vector3(0, 1.2, -2);
    if (s.mount === 'window') return new THREE.Vector3(WINDOW.x, 1.5, -HD);
    if (s.mount === 'ceiling') return new THREE.Vector3(s.x, H - 0.3, s.z);
    return new THREE.Vector3(s.x, s.y ?? 0.5, s.z);
  }
  specialPosition(slotIndex) {
    const s = this.roomDef.specialSlots[slotIndex % this.roomDef.specialSlots.length];
    return new THREE.Vector3(s.x, 0.8, s.z);
  }

  // 撮影（部屋の一覧のサムネイル用）
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.7);
  }
}

// 部屋の色に合わせて塗り直す。tint=元の色にかけ合わせる / paint=色を塗りかえる（木目などの凹凸は残す）
function recolor(obj, v) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      const c = m.clone();
      if (v.paint) { c.map = null; c.color.set(v.paint); }
      else c.color.multiply(new THREE.Color(v.tint));
      c.needsUpdate = true;
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// --- 自作の形 ---
function makeFrame(v) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: v.frame, roughness: 0.45 });
  const t = 0.05, d = 0.035;
  const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm); m.position.set(x, y, 0); g.add(m); };
  bar(v.w + 2 * t, t, 0, v.h / 2 + t / 2); bar(v.w + 2 * t, t, 0, -v.h / 2 - t / 2);
  bar(t, v.h, -v.w / 2 - t / 2, 0); bar(t, v.h, v.w / 2 + t / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
  loadTex(v.img, true).then(tx => { if (tx) { const c = tx.clone(); c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping; c.repeat.set(0.62, 0.62 * (v.h / v.w) * (1600 / 832)); c.offset.set(0.19, 0.18); c.needsUpdate = true; mat.map = c; mat.needsUpdate = true; } });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(v.w, v.h), mat);
  pic.position.z = -d / 2 + 0.004; g.add(pic);
  const back = new THREE.Mesh(new THREE.BoxGeometry(v.w, v.h, 0.01), new THREE.MeshStandardMaterial({ color: '#222' }));
  back.position.z = -d / 2 - 0.004; g.add(back);
  return g;
}

function makeCurtain(v) {
  const g = new THREE.Group();
  const top = WINDOW.y1 + 0.18, bottom = 0.06;
  const mat = new THREE.MeshStandardMaterial({
    color: v.color, roughness: 0.9, side: THREE.DoubleSide,
    transparent: v.opacity < 1, opacity: v.opacity, depthWrite: v.opacity >= 1,
  });
  const panel = (cx, w, folds) => {
    const geo = new THREE.PlaneGeometry(w, top - bottom, 60, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const yy = (y + (top - bottom) / 2) / (top - bottom); // 0=下 1=上
      p.setZ(i, Math.sin((x / w) * Math.PI * folds) * 0.035 * (0.7 + 0.3 * (1 - yy)));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, (top + bottom) / 2, -HD + 0.14);
    m.castShadow = v.opacity >= 0.9; m.receiveShadow = true;
    g.add(m);
  };
  const x0 = WINDOW.x - WINDOW.w / 2, x1 = WINDOW.x + WINDOW.w / 2;
  panel(x0 + 0.05, 0.6, 7);
  panel(x1 - 0.05, 0.6, 7);
  if (v.opacity < 0.7) panel(WINDOW.x, WINDOW.w * 0.9, 16); // レースは窓全体に
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, WINDOW.w + 0.6), new THREE.MeshStandardMaterial({ color: '#3a3330', metalness: 0.6, roughness: 0.4 }));
  rod.rotation.z = Math.PI / 2; rod.position.set(WINDOW.x, top + 0.01, -HD + 0.14);
  g.add(rod);
  return g;
}

async function makeRug(v, slot) {
  const mat = await texturedMaterial(v.tex, { rep: 1, tint: v.tint });
  const m = new THREE.Mesh(new THREE.BoxGeometry(slot.w, 0.012, slot.d), fitMaterial(mat, slot.w / (v.rep || 1) * 1.6, slot.d / (v.rep || 1) * 1.6));
  m.material.roughness = 1;
  m.position.set(slot.x, 0.006, slot.z);
  m.receiveShadow = true;
  return m;
}

function makeGuitar(style) {
  const g = new THREE.Group();
  const S = {
    acoustic: { body: '#c9843f', top: '#e2b06a', depth: 0.1, scale: 1, neck: '#4a2e1c', hole: true },
    electric: { body: '#a3161a', top: '#b81c22', depth: 0.045, scale: 0.86, neck: '#c8955a', pick: true },
    electric2: { body: '#2f6fb3', top: '#3a82cc', depth: 0.045, scale: 0.86, neck: '#c8955a', pick: true },
    bass: { body: '#151515', top: '#1d1d1d', depth: 0.045, scale: 0.9, neck: '#3a2618', pick: true, long: true },
    bass2: { body: '#d9b98a', top: '#e5c99c', depth: 0.045, scale: 0.9, neck: '#5a3a22', pick: true, long: true },
  }[style];
  const shape = new THREE.Shape();
  // ひょうたん形のボディ（下が大きい）
  const s = S.scale;
  shape.moveTo(0, -0.25 * s);
  shape.bezierCurveTo(0.26 * s, -0.25 * s, 0.24 * s, 0.02 * s, 0.13 * s, 0.05 * s);
  shape.bezierCurveTo(0.2 * s, 0.1 * s, 0.2 * s, 0.24 * s, 0, 0.24 * s);
  shape.bezierCurveTo(-0.2 * s, 0.24 * s, -0.2 * s, 0.1 * s, -0.13 * s, 0.05 * s);
  shape.bezierCurveTo(-0.24 * s, 0.02 * s, -0.26 * s, -0.25 * s, 0, -0.25 * s);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: S.depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 32 }),
    [new THREE.MeshPhysicalMaterial({ color: S.top, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
      new THREE.MeshPhysicalMaterial({ color: S.body, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 })]);
  body.position.z = -S.depth / 2;
  g.add(body);
  const front = S.depth / 2 + 0.007;
  if (S.hole) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.045, 32), new THREE.MeshBasicMaterial({ color: '#120b06' }));
    hole.position.set(0, 0.07, front + 0.001); g.add(hole);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.047, 0.056, 40), new THREE.MeshStandardMaterial({ color: '#2a1a10' }));
    ring.position.set(0, 0.07, front + 0.0012); g.add(ring);
  }
  if (S.pick) {
    for (const y of [-0.02, 0.07]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.012), new THREE.MeshStandardMaterial({ color: '#111', metalness: 0.3, roughness: 0.4 }));
      p.position.set(0, y * s, front + 0.004); g.add(p);
    }
    const guard = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.4 }));
    guard.position.set(0.06 * s, -0.08 * s, front + 0.001); g.add(guard);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.012), new THREE.MeshStandardMaterial({ color: '#1b120c' }));
  bridge.position.set(0, -0.15 * s, front + 0.004); g.add(bridge);
  const neckLen = S.long ? 0.78 : 0.56;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, neckLen, 0.025), new THREE.MeshStandardMaterial({ color: S.neck, roughness: 0.5 }));
  neck.position.set(0, 0.2 * s + neckLen / 2, front - 0.01); g.add(neck);
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.052, neckLen, 0.006), new THREE.MeshStandardMaterial({ color: '#21150e', roughness: 0.6 }));
  fb.position.set(0, 0.2 * s + neckLen / 2, front + 0.004); g.add(fb);
  for (let i = 1; i < 18; i++) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.002, 0.008), new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 1, roughness: 0.3 }));
    fr.position.set(0, 0.2 * s + neckLen - neckLen * (1 - Math.pow(0.944, i)) * 1.6, front + 0.005); g.add(fr);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.02), new THREE.MeshStandardMaterial({ color: S.top === '#e2b06a' ? '#2a1a10' : S.body, roughness: 0.3 }));
  head.position.set(0, 0.2 * s + neckLen + 0.085, front - 0.012); head.rotation.x = -0.2; g.add(head);
  const nStr = S.long ? 4 : 6;
  for (let i = 0; i < nStr; i++) {
    const x = (i - (nStr - 1) / 2) * 0.008;
    const len = neckLen + 0.2 * s + 0.15 * s;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, len), new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 1, roughness: 0.25 }));
    str.position.set(x, -0.15 * s + len / 2, front + 0.011); g.add(str);
  }
  // ギタースタンド
  const standM = new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.7, roughness: 0.4 });
  const leg = (rx, ry) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42), standM);
    l.position.set(0, -0.35, -0.12); l.rotation.set(rx, ry, 0); g.add(l);
  };
  leg(0.35, 0); leg(-0.4, 0.5); leg(-0.4, -0.5);
  const rest = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 24, Math.PI), standM);
  rest.rotation.x = Math.PI / 2; rest.rotation.z = Math.PI; rest.position.set(0, -0.24, 0.01); g.add(rest);
  g.rotation.x = -0.12; // 少し後ろにもたれる
  const outer = new THREE.Group(); outer.add(g);
  return outer;
}
