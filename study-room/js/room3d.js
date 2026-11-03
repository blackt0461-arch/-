// 立体の部屋。部屋の真ん中に立って、スワイプで見回す。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ROOM, WINDOW, DOOR } from './rooms.js';
import { itemById, STARTER } from './items.js';
import { buildProc } from './procfurn.js';
import { loadTex, texturedMaterial, loadModel, fitMaterial, shadowAll } from './loaders.js';
import { buildExterior } from './exterior.js';

const HW = ROOM.w / 2, HD = ROOM.d / 2, H = ROOM.h;
const WALL_T = 0.14;

// 時間帯・天気ごとの光
// 時間帯・天気ごとの光。sky = 空の写真（Poly Haven の puresky を、太陽が窓の外に来るよう回したもの）
// dir = 日の光の進む向き（空の写真の太陽の位置から計算）
const MOODS = {
  morning: { photo: 'morning', sun: '#fff1dc', sunI: 6.5, dir: [-0.208, -0.741, 0.639], hemiSky: '#dce9ff', hemiGround: '#d9c6ad', hemiI: 0.9,
    env: 0.45, exp: 1.0, ray: '#fff4dc', rayI: 0.14, lampI: 0.6, bg: 1.0, fog: '#c9d8e8', hill: '#6f8a5c',
    gradeWarm: '#ffc890', gradeCool: '#46688c', split: 0.12, sat: 1.12, vig: 0.28, bloom: 0.5, bloomTh: 0.85 },
  day: { photo: 'morning', sun: '#fff6ea', sunI: 7.0, dir: [-0.12, -0.86, 0.5], hemiSky: '#dfeaff', hemiGround: '#d9c9b3', hemiI: 1.0,
    env: 0.5, exp: 1.0, ray: '#fff8ea', rayI: 0.08, lampI: 0.4, bg: 1.0, fog: '#cfdcea', hill: '#6f8a5c',
    gradeWarm: '#ffd8a8', gradeCool: '#4a6a8a', split: 0.08, sat: 1.08, vig: 0.24, bloom: 0.42, bloomTh: 0.88 },
  overcast: { photo: 'overcast', sun: '#e6edf6', sunI: 2.2, dir: [0.25, -0.75, 1], hemiSky: '#e3e8f0', hemiGround: '#bdb6ac', hemiI: 1.3,
    env: 0.5, exp: 1.05, ray: '#e8eef8', rayI: 0.03, lampI: 0.8, bg: 1.0, fog: '#c3c7cd', hill: '#6b7766',
    gradeWarm: '#f0d8b8', gradeCool: '#4a6078', split: 0.1, sat: 1.0, vig: 0.3, bloom: 0.35, bloomTh: 0.9 },
  sunset: { photo: 'sunset', sun: '#ffa65a', sunI: 7.5, dir: [0.365, -0.122, 0.923], hemiSky: '#ffd2a6', hemiGround: '#b98e6c', hemiI: 0.6,
    env: 0.3, exp: 0.95, ray: '#ffc27a', rayI: 0.22, lampI: 1.0, bg: 1.0, fog: '#e7b48e', hill: '#5c5a48',
    gradeWarm: '#ff9a50', gradeCool: '#40507a', split: 0.2, sat: 1.18, vig: 0.38, bloom: 0.75, bloomTh: 0.72 },
  night: { photo: 'night', sun: '#8fa8ff', sunI: 0.6, dir: [0.3, -0.5, 1], hemiSky: '#33405e', hemiGround: '#3a3026', hemiI: 0.3,
    env: 0.1, exp: 1.1, ray: '#9fb4ff', rayI: 0.02, lampI: 3.0, bg: 0.12, fog: '#0f1420', hill: '#1d2430',
    gradeWarm: '#ffb86a', gradeCool: '#2a4070', split: 0.22, sat: 1.1, vig: 0.42, bloom: 0.9, bloomTh: 0.6 },
};

// 現実の時刻で時間帯を決める
export function moodNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 9.5) return 'morning';
  if (h >= 9.5 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'sunset';
  return 'night';
}
const WALL_ROT = { '-z': 0, '+z': Math.PI, '-x': Math.PI / 2, '+x': -Math.PI / 2 };
const MAX_LIGHTS = 4;

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

    this.objByUid = {};  // 置いた家具 uid → Object3D
    this.lamps = [];
    this.active = true;
    this.clock = new THREE.Clock();

    this.setupEffects();
    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
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
    let tap = null;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      tap = pts.size === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; lastY = e.clientY;
      this.targetLook = null;
      this.dragging = true; this.vyaw = this.vpitch = 0;
      // 模様がえ中、選んでいる家具の上から指を置いたら、その家具を動かす
      this.itemDrag = null;
      if (this.editMode && pts.size === 1 && this.selected) {
        const hit = this.pickItem(e.clientX, e.clientY);
        if (hit && hit.userData.uid === this.selected) {
          this.itemDrag = { moved: false };
          this.lastValid = { ...(this.lastValid || {}), [hit.userData.uid]: { ...hit.userData.p } };
        }
      }
      if (pts.size === 2) {
        this.itemDrag = null;
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
      if (this.itemDrag) {
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) this.itemDrag.moved = true;
        if (this.itemDrag.moved) this.dragSelectedTo(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const k = 0.0042 * this.zoom;
      this.yaw += dx * k; this.pitch += dy * k;  // 指の動きに部屋がついてくる向き
      this.vyaw = dx * k; this.vpitch = dy * k;
      this.clampPitch();
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (!pts.size) this.dragging = false;
      if (this.itemDrag) {
        const moved = this.itemDrag.moved;
        this.itemDrag = null;
        if (moved) { this.endDrag(); this.onPlacedChange && this.onPlacedChange(); tap = null; return; }
      }
      // 動かさずに短く触った = タップ
      if (tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 9 && performance.now() - tap.t < 350) {
        this.vyaw = this.vpitch = 0;
        this.handleTap(e.clientX, e.clientY);
      }
      tap = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (1 + e.deltaY * 0.001)); }, { passive: false });
  }
  ray(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray;
  }
  // 指の下にある、置いた家具（いちばん外の入れ物）を返す
  pickItem(cx, cy) {
    const hits = this.ray(cx, cy).intersectObjects(this.items.children, true).filter(h => h.object.visible);
    for (const h of hits) {
      let o = h.object;
      while (o && o.parent !== this.items) o = o.parent;
      if (o && o.userData.uid) return o;
    }
    return null;
  }
  // タップした所へ歩く／ドアなら onDoor を呼ぶ
  handleTap(cx, cy) {
    if (this.editMode) {
      const o = this.pickItem(cx, cy);
      this.select(o ? o.userData.uid : null);
      return;
    }
    const ray = this.ray(cx, cy);
    const hits = ray.intersectObjects([this.shell, this.items], true).filter(h => h.object.visible && !h.object.isPoints);
    const h = hits[0];
    if (!h) return;
    if (h.object.userData.door) { this.onDoor && this.onDoor(); return; }
    // 床なら当たった所、家具なら家具の足もと
    const p = h.point.clone(); p.y = 0;
    this.walkTo(p);
  }
  walkTo(p) {
    const m = 0.35;
    p.x = Math.max(-HW + m, Math.min(HW - m, p.x));
    p.z = Math.max(-HD + m, Math.min(HD - m, p.z));
    // 家具の中に入らないように押し出す
    for (const o of this.items.children) {
      const bb = new THREE.Box3().setFromObject(o);
      if (bb.max.y < 0.15 || bb.min.y > 1.6) continue; // ラグや天井の照明は気にしない
      bb.expandByScalar(0.3);
      if (p.x > bb.min.x && p.x < bb.max.x && p.z > bb.min.z && p.z < bb.max.z) {
        const opts = [[bb.min.x - p.x, 0], [bb.max.x - p.x, 0], [0, bb.min.z - p.z], [0, bb.max.z - p.z]];
        opts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
    p.x = Math.max(-HW + m, Math.min(HW - m, p.x));
    p.z = Math.max(-HD + m, Math.min(HD - m, p.z));
    const from = this.camera.position.clone();
    const to = new THREE.Vector3(p.x, 1.5, p.z);
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    this.walk = { from, to, t: 0, dur: Math.max(0.35, dist / 1.3) };
    this.showMarker(p);
  }
  showMarker(p) {
    if (!this.marker) {
      this.marker = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
      this.marker.rotation.x = -Math.PI / 2;
      this.scene.add(this.marker);
    }
    this.marker.position.set(p.x, 0.012, p.z);
    this.marker.userData.life = 1;
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
    if (this.walk) {
      const w = this.walk;
      w.t = Math.min(1, w.t + dt / w.dur);
      const e = w.t < 0.5 ? 2 * w.t * w.t : 1 - Math.pow(-2 * w.t + 2, 2) / 2;
      this.camera.position.lerpVectors(w.from, w.to, e);
      this.camera.position.y = 1.5 + Math.sin(w.t * Math.PI * 2 * Math.max(1, w.dur * 1.6)) * 0.015 * Math.sin(w.t * Math.PI);
      if (w.t >= 1) this.walk = null;
    }
    if (this.marker && this.marker.userData.life > 0) {
      this.marker.userData.life -= dt * 1.2;
      this.marker.material.opacity = Math.max(0, this.marker.userData.life) * 0.8;
      this.marker.scale.setScalar(1 + (1 - this.marker.userData.life) * 0.6);
    }
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
    if (this.composer && this.effectsOn !== false) {
      this.grade.uniforms.uTime.value = t;
      this.composer.render(dt);
      this.watchSpeed(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  // --- 画面の雰囲気（影MODのような、光のにじみ・すき間の影・色の味付け） ---
  setupEffects() {
    let q = 'high';
    try { q = localStorage.getItem('studyroom.quality') || 'high'; } catch (e) { /* なし */ }
    this.quality = q;
    const c = this.composer = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.ao = new GTAOPass(this.scene, this.camera, w, h);
    this.ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    this.ao.enabled = q === 'high';
    this.effectsOn = q !== 'low';
    c.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.45, 0.65, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 },
        uWarm: { value: new THREE.Color('#ffb070') }, uCool: { value: new THREE.Color('#3a5a80') },
        uSplit: { value: 0.12 }, uSat: { value: 1.12 }, uVig: { value: 0.32 }, uGrain: { value: 0.025 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime, uSplit, uSat, uVig, uGrain; uniform vec3 uWarm, uCool; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299,0.587,0.114));
          // 明るい所はあたたかく、暗い所は青っぽく（スプリットトーン）
          c = mix(c, c * mix(uCool * 1.6, uWarm * 1.25, smoothstep(0.15, 0.85, l)), uSplit);
          // 彩度を少し上げる
          c = mix(vec3(l), c, uSat);
          // 画面のふちを暗く
          vec2 d = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.25, 0.85, length(d * vec2(1.0, 1.25)));
          // フィルムの粒
          c += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    c.addPass(this.grade);
    this.slowTime = 0;
  }
  // 時間帯ごとの味付け
  applyGrade(m) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    u.uWarm.value.set(m.gradeWarm || '#ffb070');
    u.uCool.value.set(m.gradeCool || '#3a5a80');
    u.uSplit.value = m.split ?? 0.12;
    u.uSat.value = m.sat ?? 1.12;
    u.uVig.value = m.vig ?? 0.32;
    this.bloom.strength = m.bloom ?? 0.45;
    this.bloom.threshold = m.bloomTh ?? 0.82;
  }
  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('studyroom.quality', q); } catch (e) { /* なし */ }
    if (this.ao) this.ao.enabled = q === 'high';
    this.effectsOn = q !== 'low';
  }
  // 重くてカクカクするときは、すき間の影を自動で切る
  watchSpeed(dt) {
    if (this.quality !== 'high' || !this.ao.enabled) return;
    this.slowTime = dt > 1 / 24 ? this.slowTime + dt : Math.max(0, this.slowTime - dt);
    if (this.slowTime > 3) { this.ao.enabled = false; this.autoLowered = true; }
  }

  // --- 部屋の組み立て ---
  // roomDef: rooms.js の部屋 / st: { id, style, surf: {wall, floor, door, window, curtain}, placed: [...] }
  // opts.readOnly: フレンドの部屋を見るとき（さわれない）
  async show(roomDef, st, opts = {}) {
    const token = (this.token = {});
    if (this.roomDef !== roomDef || this.st !== st) { this.camera.position.set(0.2, 1.5, 1.2); this.walk = null; }
    this.roomDef = roomDef;
    this.st = st;
    this.readOnly = !!opts.readOnly;
    this.previewSurf = null;
    this.select(null);
    this.applyMood(MOODS[moodNow()]);
    await this.buildShell();
    if (token !== this.token) return;
    await this.placeAll(token);
  }
  // 時刻が変わって時間帯が変わったら、光と空を変える
  refreshMood() {
    const id = moodNow();
    if (this.mood === MOODS[id] || !this.st) return;
    this.applyMood(MOODS[id]);
    this.buildShell().then(() => this.placeAll(this.token));
  }
  // 雰囲気を選ぶ前に、壁と床だけ試しに変えて見せる（null で元に戻す）
  async previewSurfaces(surf) {
    this.previewSurf = surf;
    await this.buildShell();
  }

  surfItem(kind) {
    const id = this.st?.surf?.[kind] ?? STARTER?.[kind];
    return id ? itemById(id) : null;
  }
  async placeAll(token = this.token) {
    this.items.clear();
    this.lamps = [];
    this.objByUid = {};
    const placed = this.st.placed || [];
    await Promise.all(placed.filter(p => !p.on).map(p => this.placeOne(p, false, token)));
    if (token !== this.token) return;
    await Promise.all(placed.filter(p => p.on).map(p => this.placeOne(p, false, token)));
    if (token !== this.token) return;
    this.updateLights();
  }

  // 家具1つの見た目を作る（置く位置は mountPlaced で）
  async buildItem(item) {
    const src = item.src || {};
    let obj = null;
    if (src.proc) {
      try { obj = buildProc(src.proc); } catch (e) { console.warn('proc', item.id, e); }
    } else if (src.model) {
      obj = await loadModel(src.model);
      if (obj && (src.tint || src.paint)) recolor(obj, src);
    } else if (src.tex && item.place === 'rug') {
      obj = await makeRug(item);
    }
    if (!obj) return null;
    shadowAll(obj);
    // 大きすぎるモデルは目安の大きさに縮める
    if (item.size && !src.proc) {
      const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      const big = Math.max(sz.x, sz.y, sz.z);
      if (big > item.size * 1.3) obj.scale.multiplyScalar(item.size / big);
    }
    return obj;
  }

  async placeOne(p, animate, token = this.token) {
    const item = itemById(p.item);
    if (!item) return null;
    const obj = await this.buildItem(item);
    if (token !== this.token || !obj) return null;
    const wrap = new THREE.Group();
    wrap.add(obj);
    wrap.userData = { uid: p.uid, item, p, baseScale: 1 };
    this.mountPlaced(wrap, p);
    if (animate) { wrap.userData.baseY = wrap.position.y; wrap.userData.appear = 0; }
    const old = this.objByUid?.[p.uid];
    if (old) this.items.remove(old);
    this.objByUid = this.objByUid || {};
    this.objByUid[p.uid] = wrap;
    this.items.add(wrap);
    return wrap;
  }

  // 配置 p に合わせて、向きと位置をそろえる。部屋からはみ出さないように直し、p も直した値にする
  mountPlaced(wrap, p) {
    const item = wrap.userData.item;
    const obj = wrap.children[0];
    wrap.position.set(0, 0, 0);
    if (item.place === 'wall') obj.rotation.y = WALL_ROT[p.wall || '-z'];
    else obj.rotation.y = p.rot || 0;
    obj.position.set(0, 0, 0);
    let bb = new THREE.Box3().setFromObject(obj);
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    const m = 0.01;
    if (item.place === 'wall') {
      const w = p.wall || '-z';
      const along = p.a ?? 0, y = p.y ?? 1.6;
      // 壁の上で、はみ出さない範囲
      const half = (w === '-z' || w === '+z') ? HW : HD;
      const ext = (w === '-z' || w === '+z') ? sz.x / 2 : sz.z / 2;
      const a2 = Math.max(-half + ext + 0.05, Math.min(half - ext - 0.05, along));
      const y2 = Math.max(sz.y / 2 + 0.3, Math.min(H - sz.y / 2 - 0.05, y));
      p.a = +a2.toFixed(3); p.y = +y2.toFixed(3);
      if (w === '-z') obj.position.set(a2 - c.x, y2 - c.y, -HD + m - bb.min.z);
      if (w === '+z') obj.position.set(a2 - c.x, y2 - c.y, HD - m - bb.max.z);
      if (w === '-x') obj.position.set(-HW + m - bb.min.x, y2 - c.y, a2 - c.z);
      if (w === '+x') obj.position.set(HW - m - bb.max.x, y2 - c.y, a2 - c.z);
    } else {
      let x = p.x ?? 0, z = p.z ?? 0;
      x = Math.max(-HW + sz.x / 2 + m, Math.min(HW - sz.x / 2 - m, x));
      z = Math.max(-HD + sz.z / 2 + m, Math.min(HD - sz.z / 2 - m, z));
      // 壁に近ければ、ぴったり寄せる
      const snap = 0.14;
      if (x - sz.x / 2 < -HW + snap) x = -HW + sz.x / 2 + m;
      if (x + sz.x / 2 > HW - snap) x = HW - sz.x / 2 - m;
      if (z - sz.z / 2 < -HD + snap) z = -HD + sz.z / 2 + m;
      if (z + sz.z / 2 > HD - snap) z = HD - sz.z / 2 - m;
      p.x = +x.toFixed(3); p.z = +z.toFixed(3);
      let y;
      if (item.place === 'ceiling') y = (H - 0.005) - bb.max.y;
      else if (item.place === 'rug') y = 0.004 - bb.min.y;
      else y = (p.on ? (p.y || 0) : 0) - bb.min.y;
      obj.position.set(x - c.x, y, z - c.z);
    }
    wrap.userData.baseY = wrap.position.y;
  }

  // --- 重なりのチェック ---
  // 家具の上にのせられる小物か / 上に物をのせられる家具か
  static canStack(item) { return item.place === 'floor' && (item.genre === 'decor' || (item.size || 1) <= 0.7); }
  static isSupport(item) { return item.place === 'floor' && (item.genre === 'table' || item.genre === 'storage'); }
  boxOf(o) { return new THREE.Box3().setFromObject(o); }
  // 置き方が決まりに合っているか。合っていれば true（家具の上にのせたときは p.on / p.y を決める）
  checkPlacement(o) {
    const item = o.userData.item, p = o.userData.p;
    if (item.place === 'rug') return true;
    const others = this.items.children.filter(x => x !== o && x.userData.uid && x.userData.item?.place !== 'rug');
    const shrink = 0.01;
    const bb = this.boxOf(o).expandByScalar(-shrink);
    if (item.place === 'wall' || item.place === 'ceiling') {
      // 同じ種類どうしで重ならない。壁の物はドアと窓にもかからない
      if (others.some(x => x.userData.item.place === item.place && bb.intersectsBox(this.boxOf(x)))) return false;
      if (item.place === 'wall') {
        const openings = [
          new THREE.Box3(new THREE.Vector3(WINDOW.x - WINDOW.w / 2 - 0.1, WINDOW.y0 - 0.1, -HD - 0.5), new THREE.Vector3(WINDOW.x + WINDOW.w / 2 + 0.1, WINDOW.y1 + 0.25, -HD + 0.5)),
          new THREE.Box3(new THREE.Vector3(DOOR.x - DOOR.w / 2 - 0.1, 0, HD - 0.5), new THREE.Vector3(DOOR.x + DOOR.w / 2 + 0.1, DOOR.h + 0.1, HD + 0.5)),
        ];
        if (openings.some(b => b.intersectsBox(bb))) return false;
        // 壁の前の床の家具（高い棚など）とも重ならない
        if (others.some(x => x.userData.item.place === 'floor' && bb.intersectsBox(this.boxOf(x)))) return false;
      }
      return true;
    }
    // 床の物：真上から見て重なる家具をさがす
    const hits = others.filter(x => {
      const xi = x.userData.item;
      if (xi.place === 'ceiling') return false;
      const b = this.boxOf(x);
      if (xi.place === 'wall') return bb.intersectsBox(b);
      return bb.max.x > b.min.x && bb.min.x < b.max.x && bb.max.z > b.min.z && bb.min.z < b.max.z;
    });
    // ドアの前はふさがない
    const doorZone = new THREE.Box3(new THREE.Vector3(DOOR.x - DOOR.w / 2, 0, HD - 0.6), new THREE.Vector3(DOOR.x + DOOR.w / 2, 2, HD + 0.2));
    if (!p.on && doorZone.intersectsBox(bb)) return false;
    if (!hits.length) { if (p.on) { delete p.on; delete p.y; this.mountPlaced(o, p); } return true; }
    // 1つの家具の上に、小物がまるごとのる場合だけ OK
    if (hits.length === 1 && Room3D.canStack(item) && Room3D.isSupport(hits[0].userData.item)) {
      const sb = this.boxOf(hits[0]);
      const fb = this.boxOf(o);
      const cx = (fb.min.x + fb.max.x) / 2, cz = (fb.min.z + fb.max.z) / 2;
      if (cx > sb.min.x && cx < sb.max.x && cz > sb.min.z && cz < sb.max.z) {
        const top = +sb.max.y.toFixed(3);
        if (p.on !== hits[0].userData.uid || p.y !== top) { p.on = hits[0].userData.uid; p.y = top; this.mountPlaced(o, p); }
        return true;
      }
    }
    return false;
  }
  // 新しく置いた物が重なっていたら、近くの空いている所をさがす。見つからなければ false
  findFreeSpot(o) {
    const p = o.userData.p, item = o.userData.item;
    if (this.checkPlacement(o)) return true;
    const start = { ...p };
    for (let r = 1; r <= 10; r++) {
      for (let k = 0; k < 12; k++) {
        const ang = k * Math.PI / 6;
        if (item.place === 'wall') {
          for (const w of [start.wall, '-x', '+x', '+z', '-z']) {
            Object.assign(p, start, { wall: w, a: (start.a || 0) + Math.cos(ang) * r * 0.35, y: 1.6 + Math.sin(ang) * 0.4 });
            this.mountPlaced(o, p);
            if (this.checkPlacement(o)) return true;
          }
        } else {
          Object.assign(p, start, { x: start.x + Math.cos(ang) * r * 0.35, z: start.z + Math.sin(ang) * r * 0.35 });
          delete p.on; delete p.y;
          this.mountPlaced(o, p);
          if (this.checkPlacement(o)) return true;
        }
      }
    }
    Object.assign(p, start);
    this.mountPlaced(o, p);
    return false;
  }

  // 照明の光（重くならないように、近いものから最大4つ）
  updateLights() {
    for (const l of this.lamps) l.parent && l.parent.remove(l);
    this.lamps = [];
    this.items.children.filter(o => o.userData.kind === 'bareBulb').forEach(o => this.items.remove(o));
    const lit = this.items.children.filter(o => {
      const obj = o.children[0];
      return obj && (obj.userData.light || o.userData.item?.light);
    });
    if (!lit.length) { this.addBareBulb(); return; }
    lit.slice(0, MAX_LIGHTS).forEach(o => {
      const obj = o.children[0];
      const il = o.userData.item.light;
      const L = obj.userData.light || (typeof il === 'string' ? { color: il } : il) || {};
      const bb = new THREE.Box3().setFromObject(o);
      const l = new THREE.PointLight(L.color || '#ffd9a8', (L.intensity || 1) * 3 * this.mood.lampI, 0, 2);
      const center = bb.getCenter(new THREE.Vector3());
      l.position.set(center.x, o.userData.item.place === 'ceiling' ? bb.min.y - 0.05 : center.y + (L.y || 0) * 0 + 0.1, center.z);
      this.scene.add(l);
      this.lamps.push(l);
    });
  }

  // --- 模様がえ ---
  setEditMode(on) {
    this.editMode = !!on && !this.readOnly;
    if (!this.editMode) this.select(null);
  }
  select(uid) {
    this.selected = uid || null;
    if (this.selBox) { this.scene.remove(this.selBox); this.selBox = null; }
    const o = uid && this.objByUid?.[uid];
    if (o) {
      this.selBox = new THREE.BoxHelper(o, 0xffcf7a);
      this.selBox.material.depthTest = false; this.selBox.material.transparent = true; this.selBox.renderOrder = 10;
      this.scene.add(this.selBox);
    }
    this.onSelect && this.onSelect(this.selected);
  }
  selectedPlacement() { return this.selected ? this.objByUid?.[this.selected]?.userData.p : null; }
  // 指の位置まで、選んでいる家具を動かす
  dragSelectedTo(cx, cy) {
    const o = this.objByUid?.[this.selected];
    if (!o) return;
    const p = o.userData.p, item = o.userData.item;
    const ray = this.ray(cx, cy).ray;
    if (item.place === 'wall') {
      // 4つの壁の面と交わる所
      let best = null;
      for (const [w, n, d] of [['-z', [0, 0, 1], HD], ['+z', [0, 0, -1], HD], ['-x', [1, 0, 0], HW], ['+x', [-1, 0, 0], HW]]) {
        const plane = new THREE.Plane(new THREE.Vector3(...n), d);
        const hit = ray.intersectPlane(plane, new THREE.Vector3());
        if (!hit) continue;
        const dist = hit.distanceTo(ray.origin);
        const inside = Math.abs(hit.x) <= HW + 0.01 && Math.abs(hit.z) <= HD + 0.01 && hit.y > 0 && hit.y < H;
        if (inside && (!best || dist < best.dist)) best = { w, hit, dist };
      }
      if (!best) return;
      p.wall = best.w;
      p.a = (best.w === '-z' || best.w === '+z') ? best.hit.x : best.hit.z;
      p.y = best.hit.y;
    } else {
      const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(p.on ? p.y || 0 : 0)), new THREE.Vector3());
      if (!hit) return;
      p.x = hit.x; p.z = hit.z;
    }
    this.mountPlaced(o, p);
    const ok = this.checkPlacement(o);
    this.markValid(ok);
    if (ok) {
      // のっている小物も一緒に
      const last = this.lastValid?.[p.uid];
      if (last && last.x !== undefined) this.moveRiders(p.uid, p.x - last.x, p.z - last.z);
      this.lastValid = { ...(this.lastValid || {}), [p.uid]: { ...p } };
    }
    this.selBox && this.selBox.update();
  }
  moveRiders(uid, dx, dz) {
    if (!dx && !dz) return;
    for (const r of this.items.children) {
      const rp = r.userData.p;
      if (rp && rp.on === uid) { rp.x += dx; rp.z += dz; this.mountPlaced(r, rp); }
    }
  }
  markValid(ok) {
    if (this.selBox) this.selBox.material.color.set(ok ? 0xffcf7a : 0xff5a4a);
  }
  // 指をはなしたとき：重なっていたら最後の正しい位置へもどす
  endDrag() {
    const o = this.objByUid?.[this.selected];
    if (!o) return;
    const p = o.userData.p;
    if (!this.checkPlacement(o)) {
      const last = this.lastValid?.[p.uid];
      if (last) { Object.assign(p, last); if (!last.on) { delete p.on; delete p.y; } this.mountPlaced(o, p); }
      this.onInvalid && this.onInvalid();
    }
    this.markValid(true);
    this.selBox && this.selBox.update();
  }
  rotateSelected(step = Math.PI / 4) {
    const o = this.objByUid?.[this.selected];
    if (!o || o.userData.item.place === 'wall') return;
    const p = o.userData.p;
    const before = { ...p };
    p.rot = ((p.rot || 0) + step) % (Math.PI * 2);
    this.mountPlaced(o, p);
    if (!this.checkPlacement(o)) {
      Object.assign(p, before); this.mountPlaced(o, p);
      this.onInvalid && this.onInvalid();
    }
    this.selBox && this.selBox.update();
    this.onPlacedChange && this.onPlacedChange();
  }
  removeObject(uid) {
    const o = this.objByUid?.[uid];
    if (o) this.items.remove(o);
    delete this.objByUid[uid];
    if (this.selected === uid) this.select(null);
    this.updateLights();
  }
  async addPlaced(p) {
    const o = await this.placeOne(p, true);
    if (!o) return null;
    if (!this.findFreeSpot(o)) { this.removeObject(p.uid); return null; }
    o.userData.baseY = o.position.y;
    this.updateLights();
    this.lookAt(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
    return o;
  }

  // 新しく買った物を置く場所の候補（見ている方向の、空いていそうな所）
  suggestPlacement(item) {
    const cam = this.camera.position;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (item.place === 'wall') {
      // 見ている方向の壁
      const w = Math.abs(fwd.x) > Math.abs(fwd.z) ? (fwd.x > 0 ? '+x' : '-x') : (fwd.z > 0 ? '+z' : '-z');
      const along = (w === '-z' || w === '+z') ? cam.x + fwd.x * 1.5 : cam.z + fwd.z * 1.5;
      return { wall: w, a: along, y: 1.6 };
    }
    const base = { x: cam.x + fwd.x * 1.6, z: cam.z + fwd.z * 1.6, rot: Math.round(Math.atan2(-fwd.x, -fwd.z) / (Math.PI / 4)) * (Math.PI / 4) };
    // ほかの家具と重なっていたら、少しずつずらす
    const taken = this.items.children.map(o => new THREE.Box3().setFromObject(o));
    for (let r = 0; r < 6; r++) {
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4;
        const x = base.x + Math.cos(ang) * r * 0.5, z = base.z + Math.sin(ang) * r * 0.5;
        if (Math.abs(x) > HW - 0.3 || Math.abs(z) > HD - 0.3) continue;
        const pt = new THREE.Vector3(x, 0.3, z);
        if (!taken.some(b => b.clone().expandByScalar(0.15).containsPoint(pt))) return { ...base, x, z };
      }
    }
    return base;
  }

  // 写真：画面の文字を消した状態で、今の部屋を1枚
  capture() {
    if (this.selBox) this.selBox.visible = false;
    if (this.marker) this.marker.visible = false;
    if (this.composer && this.effectsOn !== false) this.composer.render(0); else this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/jpeg', 0.92);
    if (this.selBox) this.selBox.visible = true;
    if (this.marker) this.marker.visible = true;
    return url;
  }

  applyMood(m) {
    this.mood = m;
    this.applyGrade(m);
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

  async buildShell() {
    const ps = this.previewSurf;
    const wallI = this.surfItem('wall'), floorI = this.surfItem('floor');
    const wallSrc = ps?.wall || wallI?.src, floorSrc = ps?.floor || floorI?.src;
    const plainWall = new THREE.MeshStandardMaterial({ color: '#e8e2d8', roughness: 0.95 });
    const plainFloor = new THREE.MeshStandardMaterial({ color: '#a8927a', roughness: 0.8 });
    const [wallM, floorM, ceilM] = await Promise.all([
      wallSrc ? (wallSrc.tex ? texturedMaterial(wallSrc.tex, { rep: wallSrc.rep, tint: wallSrc.tint }) : new THREE.MeshStandardMaterial({ color: wallSrc.color || '#e8e2d8', roughness: 0.92 })) : plainWall,
      floorSrc?.tex ? texturedMaterial(floorSrc.tex, { rep: floorSrc.rep || 3, tint: floorSrc.tint }) : (floorSrc?.color ? new THREE.MeshStandardMaterial({ color: floorSrc.color, roughness: 0.7 }) : plainFloor),
      new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.95 }),
    ]);
    // 天井は下からの照り返しが少ないので、ほんのり明るくしておく
    ceilM.emissive = new THREE.Color(this.mood.hemiGround).multiplyScalar(0.35);
    if (!wallSrc?.tex) wallM.userData.rep = 1;
    ceilM.userData.rep = 1;
    if (!floorSrc?.tex) floorM.userData.rep = 1;
    const darkWall = new THREE.Color(wallM.color).getHSL({}).l < 0.35 || /concrete|black/.test(wallSrc?.tex || '');
    const wallV = { name: darkWall ? '黒' : '' };

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
    // 手前の壁（ドアの穴をあける）
    const dx0 = DOOR.x - DOOR.w / 2, dx1 = DOOR.x + DOOR.w / 2, zf = HD + WALL_T / 2;
    box(dx0 + HW + 0.15, H, WALL_T, (-HW - 0.15 + dx0) / 2, H / 2, zf, wallM);
    box(HW + 0.15 - dx1, H, WALL_T, (dx1 + HW + 0.15) / 2, H / 2, zf, wallM);
    box(DOOR.w, H - DOOR.h, WALL_T, DOOR.x, (H + DOOR.h) / 2, zf, wallM);
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
    sk(0.015, ROOM.d, -HW + 0.008, 0); sk(0.015, ROOM.d, HW - 0.008, 0);
    sk(dx0 + HW, 0.015, (-HW + dx0) / 2, HD - 0.008); sk(HW - dx1, 0.015, (dx1 + HW) / 2, HD - 0.008);
    sk(x0 + HW, 0.015, (-HW + x0) / 2, -HD + 0.008); sk(HW - x1, 0.015, (x1 + HW) / 2, -HD + 0.008);
    sk(WINDOW.w, 0.015, WINDOW.x, -HD + 0.008);

    // 窓（選んだデザイン）とカーテン
    const ym = (WINDOW.y0 + WINDOW.y1) / 2;
    const winI = this.surfItem('window');
    let win = null;
    try { win = winI?.src?.proc ? buildProc(winI.src.proc) : null; } catch (e) { console.warn('window', e); }
    if (win) { win.position.set(WINDOW.x, ym, -HD - 0.03); shadowAll(win); g.add(win); }
    else {
      const frameM = new THREE.MeshStandardMaterial({ color: '#ece6dc', roughness: 0.45 });
      const fr = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameM); m.position.set(x, y, -HD - 0.02); m.castShadow = true; m.receiveShadow = true; g.add(m); };
      fr(WINDOW.w + 0.08, 0.05, WINDOW.x, WINDOW.y0); fr(WINDOW.w + 0.08, 0.05, WINDOW.x, WINDOW.y1);
      fr(0.05, WINDOW.y1 - WINDOW.y0, x0, ym); fr(0.05, WINDOW.y1 - WINDOW.y0, x1, ym);
      fr(0.04, WINDOW.y1 - WINDOW.y0, WINDOW.x, ym);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(WINDOW.w + 0.2, 0.04, 0.22), frameM);
      sill.position.set(WINDOW.x, WINDOW.y0 - 0.02, -HD + 0.06); sill.castShadow = sill.receiveShadow = true; g.add(sill);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.y1 - WINDOW.y0),
        new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.08 }));
      glass.position.set(WINDOW.x, ym, -HD - 0.03); g.add(glass);
    }
    const curI = this.surfItem('curtain');
    if (curI?.src?.curtain) g.add(makeCurtain(curI.src.curtain));

    // ドア・スイッチ・コンセント・エアコン・天井の縁
    const doorI = this.surfItem('door');
    let door = null;
    try { door = doorI?.src?.proc ? buildProc(doorI.src.proc) : null; } catch (e) { console.warn('door', e); }
    if (door) {
      door.rotation.y = Math.PI; door.position.set(DOOR.x, 0, HD + 0.03);
      shadowAll(door); door.traverse(o => { if (o.isMesh) o.userData.door = true; });
    } else door = makeDoor(darkWall ? '#3a3633' : '#ddd5c8');
    this.door = door;
    g.add(door);
    g.add(makeFixtures(skirt.color));
    this.floorMesh = floor;
    floor.userData.floor = true;

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

// --- 家のつくり ---
// ドア（木目の凹凸を残した塗装の開き戸・枠・レバーハンドル）
function makeDoor(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const zIn = HD;
  // 枠
  const frame = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL_T + 0.04), paint); m.position.set(x, y, zIn + WALL_T / 2); m.castShadow = m.receiveShadow = true; g.add(m); };
  frame(0.05, DOOR.h + 0.05, DOOR.x - DOOR.w / 2 - 0.02, DOOR.h / 2);
  frame(0.05, DOOR.h + 0.05, DOOR.x + DOOR.w / 2 + 0.02, DOOR.h / 2);
  frame(DOOR.w + 0.14, 0.05, DOOR.x, DOOR.h + 0.02);
  // 扉の板（ふちの溝つき）
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR.w - 0.02, DOOR.h - 0.02, 0.04), paint);
  leaf.position.set(DOOR.x, DOOR.h / 2, zIn + 0.03); leaf.castShadow = leaf.receiveShadow = true;
  leaf.userData.door = true; g.add(leaf);
  const groove = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.6 });
  for (const [w, h, y] of [[DOOR.w - 0.24, 0.9, 1.45], [DOOR.w - 0.24, 0.8, 0.55]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), groove);
    p.position.set(DOOR.x, y, zIn + 0.008); p.userData.door = true; g.add(p);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, h - 0.03, 0.008), paint);
    p2.position.set(DOOR.x, y, zIn + 0.006); p2.userData.door = true; g.add(p2);
  }
  // レバーハンドル
  const metal = new THREE.MeshStandardMaterial({ color: '#b9b6b0', metalness: 1, roughness: 0.25 });
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 24), metal);
  rose.rotation.x = Math.PI / 2; rose.position.set(DOOR.x - DOOR.w / 2 + 0.08, 0.95, zIn + 0.004); g.add(rose);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), metal);
  lever.position.set(DOOR.x - DOOR.w / 2 + 0.13, 0.95, zIn - 0.035); lever.castShadow = true; g.add(lever);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 12), metal);
  neck.rotation.x = Math.PI / 2; neck.position.set(DOOR.x - DOOR.w / 2 + 0.08, 0.95, zIn - 0.018); g.add(neck);
  // ちょうつがい
  for (const y of [0.25, 1.8]) {
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.012), metal);
    hg.position.set(DOOR.x + DOOR.w / 2 - 0.005, y, zIn - 0.002); g.add(hg);
  }
  // 敷居
  const sill = new THREE.Mesh(new THREE.BoxGeometry(DOOR.w + 0.1, 0.012, WALL_T + 0.04), new THREE.MeshStandardMaterial({ color: '#8b735a', roughness: 0.5 }));
  sill.position.set(DOOR.x, 0.006, zIn + WALL_T / 2); sill.receiveShadow = true; g.add(sill);
  g.traverse(o => { if (o.isMesh) o.userData.door = true; });
  return g;
}

// スイッチ・コンセント・エアコン・天井の縁（廻り縁）
function makeFixtures(trimColor) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 });
  // 壁に付ける小物：wall = 'x-' / 'x+' / 'z-' / 'z+'
  const onWall = (mesh, wall, a, y) => {
    const o = new THREE.Group(); o.add(mesh);
    if (wall === 'z+') { o.position.set(a, y, HD); o.rotation.y = Math.PI; }
    if (wall === 'z-') { o.position.set(a, y, -HD); }
    if (wall === 'x-') { o.position.set(-HW, y, a); o.rotation.y = Math.PI / 2; }
    if (wall === 'x+') { o.position.set(HW, y, a); o.rotation.y = -Math.PI / 2; }
    g.add(o); return o;
  };
  // 照明スイッチ（ドアの横）
  const sw = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.008), white); plate.position.z = 0.004; sw.add(plate);
  for (const y of [0.022, -0.022]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), grey); r.position.set(0, y, 0.01); r.rotation.x = y > 0 ? 0.08 : -0.08; sw.add(r);
  }
  onWall(sw, 'z+', DOOR.x - DOOR.w / 2 - 0.22, 1.2);
  // コンセント
  const outlet = () => {
    const o = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.115, 0.007), white); p.position.z = 0.0035; o.add(p);
    for (const y of [0.025, -0.025]) for (const x of [-0.0065, 0.0065]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.011, 0.002), dark); slot.position.set(x, y, 0.0075); o.add(slot);
    }
    return o;
  };
  onWall(outlet(), 'z+', -1.6, 0.25);
  onWall(outlet(), 'x-', -1.4, 0.25);
  onWall(outlet(), 'x+', 1.6, 0.25);
  onWall(outlet(), 'z-', 1.0, 0.25);
  // エアコン（左の壁の上）
  const ac = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.22), white); body.position.z = 0.11; body.castShadow = true; ac.add(body);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.01), new THREE.MeshStandardMaterial({ color: '#fbfaf8', roughness: 0.2 }));
  front.position.set(0, 0.03, 0.222); ac.add(front);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: '#c9c6c0', roughness: 0.5 }));
  vent.position.set(0, -0.115, 0.2); vent.rotation.x = 0.4; ac.add(vent);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#58e07a', emissiveIntensity: 1.5 }));
  led.position.set(0.3, -0.07, 0.228); ac.add(led);
  onWall(ac, 'x-', -1.0, 2.45);
  // エアコンの配管カバー
  const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), white);
  pipe.position.set(-HW + 0.03, 2.4, -1.47); g.add(pipe);
  // 天井の縁（廻り縁）
  const trim = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.6 });
  const t = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), trim); m.position.set(x, H - 0.018, z); g.add(m); };
  t(ROOM.w, 0.02, 0, -HD + 0.01); t(ROOM.w, 0.02, 0, HD - 0.01); t(0.02, ROOM.d, -HW + 0.01, 0); t(0.02, ROOM.d, HW - 0.01, 0);
  // 火災報知器
  const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 32), white);
  smoke.position.set(-0.8, H - 0.018, 0.9); g.add(smoke);
  return g;
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

async function makeRug(item) {
  const src = item.src;
  const w = src.w || 2.4, d = src.d || 1.7;
  const mat = await texturedMaterial(src.tex, { rep: 1, tint: src.tint });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), fitMaterial(mat, w / (src.rep || 1) * 1.6, d / (src.rep || 1) * 1.6));
  m.material.roughness = 1;
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
