// 立体の部屋。部屋の真ん中に立って、スワイプで見回す。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { roomShape, ceilAt } from './rooms.js';
import { buildFixture, buildAircon, segRot, segPoint, putOnWall } from './roomfix.js';
import { layoutSpots } from './layouts.js';
import { itemById, STARTER } from './items.js';
import { buildProc } from './procfurn.js';
import { buildGacha } from './gachafurn.js';
import { gachaSpec } from './gacha.js';
import { loadTex, texturedMaterial, loadModel, fitMaterial, shadowAll, isLite } from './loaders.js';
import { buildExterior } from './exterior.js';

// 部屋の大きさ・形は部屋ごとにちがう（rooms.js の roomShape）。this.sh に入れて使う
const WALL_T = 0.14;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function segOf(sh, id) { return sh.walls.find(w => w.id === id) || null; }
// 壁 seg にある開口（窓・ドア）。{ a, w, y0, y1, door }
function openingsOn(sh, segId) {
  const list = sh.windows.filter(o => o.wall === segId).map(o => ({ a: o.a, w: o.w, y0: o.y0, y1: o.y1 }));
  if (sh.door.wall === segId) list.push({ a: sh.door.a, w: sh.door.w, y0: 0, y1: sh.door.h, door: true });
  return list.sort((p, q) => p.a - q.a);
}
// 壁にそった範囲 a0〜a1・高さ y0〜y1・壁から内側 d0〜d1 の箱
function wallBox(seg, a0, a1, y0, y1, d0, d1) {
  const p = segPoint(seg, a0, y0, d0), q = segPoint(seg, a1, y1, d1);
  return new THREE.Box3(p.clone().min(q), p.clone().max(q));
}

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
    env: 0.1, exp: 1.1, ray: '#9fb4ff', rayI: 0.02, lampI: 2.2, bg: 0.12, fog: '#0f1420', hill: '#1d2430',
    gradeWarm: '#ffb86a', gradeCool: '#2a4070', split: 0.22, sat: 1.1, vig: 0.42, bloom: 0.5, bloomTh: 0.88 },
};

// 現実の時刻で時間帯を決める
// 今日の天気：日にちで決まる（みんな同じ日は同じ天気）。晴れ6・くもり2・雨2 の割合
export function weatherToday(d = new Date()) {
  const k = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let x = (k * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  const n = x % 10;
  return n < 6 ? 'sunny' : n < 8 ? 'cloudy' : 'rain';
}
export function moodNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  const wet = weatherToday(d) !== 'sunny';
  if (h >= 5 && h < 9.5) return wet ? 'overcast' : 'morning';
  if (h >= 9.5 && h < 16) return wet ? 'overcast' : 'day';
  if (h >= 16 && h < 19) return 'sunset';
  return 'night';
}
const MAX_LIGHTS = 4;

// 部屋を出る・作りなおす時に、前の物のメモリ（形・材質・絵）を返す（1.12.0）。
// 前は返していなかったため、部屋を行き来するたびにメモリがたまり、スマホでアプリが強制終了されることがあった。
// three.js は、返した物をまた使うと自動で作りなおすので、同じ家具が次の部屋にあっても大丈夫。
function freeTree(root) {
  if (!root) return;
  const mats = new Set(), geos = new Set();
  root.traverse(o => {
    if (o.geometry) geos.add(o.geometry);
    const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => mats.add(x));
  });
  for (const g of geos) g.dispose?.();
  for (const m of mats) {
    for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
    m.uniforms && Object.values(m.uniforms).forEach(u => { if (u?.value?.isTexture) u.value.dispose(); });
    m.dispose?.();
  }
}
function clearFree(group) { const kids = [...group.children]; group.clear(); for (const k of kids) freeTree(k); }
export class Room3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // 画質「かるい」では、画面のきめを少し落としてメモリを減らす（1.12.0）
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, isLite() ? 1.5 : 2));
    // 絵を描くしくみ（WebGL）がこわれた時（メモリが足りない時など）は、記録を保存して読みこみなおす
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost && this.onContextLost(); });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // 影の地図は1コマに1回だけ作る（後処理の中で作り直すと、画面が斜めに暗くなることがある）
    r.shadowMap.autoUpdate = false;

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
    this.sun.shadow.mapSize.set(isLite() ? 1024 : 2048, isLite() ? 1024 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 5;
    this.sun.shadow.blurSamples = 16;
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
    // iPhone では、キーボードを閉じた時や画面の向きを変えた時に resize が来ないことがある。
    // 見えている大きさと絵の大きさがずれると縦にのびるので、こまめに確かめて合わせる
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.resize(); });
    setInterval(() => {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && h && (w !== this._sw || h !== this._sh)) this.resize();
    }, 700);
    this.loop();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this._sw = w; this._sh = h;
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
        // 選んでいる家具の上、または画面でそのまわり（指1本ぶん）なら、つかむ。小さい物・遠い物もつかみやすく（1.12.0）
        if ((hit && hit.userData.uid === this.selected) || (!hit && this.nearSelected(e.clientX, e.clientY))) {
          const so = this.objByUid?.[this.selected];
          this.itemDrag = { moved: false, grab: this.grabOffset(e.clientX, e.clientY) };
          if (so) this.lastValid = { ...(this.lastValid || {}), [so.userData.uid]: { ...so.userData.p } };
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
      if (this.topView) return;
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
      if (o && o.userData.uid && o.visible) return o;
    }
    return null;
  }
  // タップした所へ歩く／ドアなら onDoor を呼ぶ
  handleTap(cx, cy) {
    if (this.editMode) {
      const o = this.pickItem(cx, cy);
      if (o || !this.walkEdit || this.topView) { this.select(o ? o.userData.uid : null); return; }
      // 模様がえの「歩く」：家具でない所をタップしたら、選ぶのをやめて、そこへ歩く（ドアでは部屋を移らない）（1.15）
      if (this.selected) { this.select(null); return; }
    }
    const ray = this.ray(cx, cy);
    const hits = ray.intersectObjects([this.shell, this.items], true).filter(h => (h.object.visible || h.object.userData.lightSwitch) && !h.object.isPoints);
    const h = hits[0];
    if (!h) return;
    if (h.object.userData.lightSwitch) { this.toggleLights(); return; }
    if (h.object.userData.door) { if (!this.editMode) this.onDoor && this.onDoor(); return; }
    // 床なら当たった所、家具なら家具の足もと
    const p = h.point.clone(); p.y = 0;
    this.walkTo(p);
  }
  walkTo(p) {
    this.clampWalk(p);
    const from = this.camera.position.clone();
    const to = new THREE.Vector3(p.x, 1.5, p.z);
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    this.walk = { from, to, t: 0, dur: Math.max(0.35, dist / 1.3) };
    this.showMarker(p);
  }
  // 歩ける所に直す（壁・家具・備え付けの物・切り取った角・低い天井をよける）
  clampWalk(p) {
    const sh = this.sh, m = 0.35;
    const inRoom = () => {
      p.x = clamp(p.x, -sh.hw + m, sh.hw - m);
      p.z = clamp(p.z, -sh.hd + m, sh.hd - m);
      // 斜めの天井：頭がつかえない所まで
      if (sh.slope) p.x = Math.min(p.x, sh.slope.start + (sh.h - 1.8) / (sh.h - sh.slope.low) * (sh.hw - sh.slope.start));
    };
    inRoom();
    const boxes = [];
    for (const o of this.items.children) {
      const bb = new THREE.Box3().setFromObject(o);
      if (bb.max.y < 0.15 || bb.min.y > 1.6) continue; // ラグや天井の照明は気にしない
      boxes.push(bb);
    }
    for (const s of this.solids || []) if (s.block === 'all' && s.box.min.y < 1.6) boxes.push(s.box.clone());
    for (let k = 0; k < 2; k++) {
      for (const b0 of boxes) {
        const bb = b0.clone().expandByScalar(0.3);
        if (p.x > bb.min.x && p.x < bb.max.x && p.z > bb.min.z && p.z < bb.max.z) {
          const opts = [[bb.min.x - p.x, 0], [bb.max.x - p.x, 0], [0, bb.min.z - p.z], [0, bb.max.z - p.z]];
          opts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
          p.x += opts[0][0]; p.z += opts[0][1];
        }
      }
      inRoom();
    }
    return p;
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
    if (this.topView) return;
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
    // 文字の見えにくさを調べるとき（tools/check/contrast.js）は、部屋は1回描いたら止めて速くする
    if (window.__ccFreeze && this.__ccFrames > 30) return;
    if (window.__ccFreeze) this.__ccFrames = (this.__ccFrames || 0) + 1;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.targetLook) {
      const k = 1 - Math.pow(0.02, dt);
      this.yaw += (this.targetLook.yaw - this.yaw) * k;
      this.pitch += (this.targetLook.pitch - this.pitch) * k;
      if (Math.abs(this.targetLook.yaw - this.yaw) < 0.002 && Math.abs(this.targetLook.pitch - this.pitch) < 0.002) this.targetLook = null;
    } else if (!this.dragging) {
      // 指をはなしたあとの慣性
      this.yaw += this.vyaw; this.pitch += this.vpitch;
      this.vyaw *= 0.9; this.vpitch *= 0.9;
      this.clampPitch();
    }
    if (!this.topView) this.camera.rotation.set(this.pitch, this.yaw, 0);
    else if (this._topKey !== this.shell?.uuid + this.items.children.length) { this._topKey = this.shell?.uuid + this.items.children.length; this.applyTopHide(); }
    if (this.walk && !this.topView) {
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
    this.updateRain(dt);
    if (this.stars && this.stars.visible) { this.stars.position.copy(this.camera.position); this.stars.material.uniforms.uTime.value = t; }
    // ガチャの家具の動き（炎・星・水など）
    for (const o of this.items.children) { const f = o.children[0]?.userData.tick; if (f) f(t, dt); }
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
    if (this.exterior?.update) this.exterior.update(t);
    for (const f of this.shellTicks || []) f(t, dt); // 備え付けの動き（暖炉の炎など）
    // 何も動いていない時は、描きかえを1秒に30回に減らす（スマホが熱くならない・電池が長もち）
    let appearing = false;
    const busy = this.dragging || this.targetLook || this.walk || this.itemDrag || this.preview ||
      Math.abs(this.vyaw) + Math.abs(this.vpitch) > 1e-5 ||
      (this.marker && this.marker.userData.life > 0) || this.rain?.visible ||
      (appearing = this.items.children.some(o => o.userData.appear !== undefined && o.userData.appear < 1));
    this._idleAcc = (this._idleAcc || 0) + dt;
    if (!busy && this._idleAcc < 1 / 30 - 0.002) return;
    const frameDt = this._idleAcc; this._idleAcc = 0;
    // 影は、家具が動いた・増えた時だけ描きなおす（向きを変えるだけなら同じ影でよい。1.12.0 で軽く）。念のため1秒ごとにも
    const sk = `${this.items.children.length}|${this.shell?.uuid}|${this.lightsOff ? 1 : 0}`;
    if (this.itemDrag || this.preview || appearing || sk !== this._shadowKey || t - (this._shadowAt || 0) > 1) {
      this.renderer.shadowMap.needsUpdate = true; this._shadowKey = sk; this._shadowAt = t;
    }
    if (this.composer && this.effectsOn !== false) {
      this.grade.uniforms.uTime.value = t;
      this.composer.render(frameDt);
      if (busy) this.watchSpeed(dt); // 間引いている時の間隔を「重い」と数えない
    } else this.renderer.render(this.scene, this.camera);
  }

  // --- 画面の雰囲気（影MODのような、光のにじみ・すき間の影・色の味付け） ---
  setupEffects() {
    let q = 'low';
    try { q = localStorage.getItem('studyroom.quality') || 'low'; } catch (e) { /* なし */ }
    this.quality = q;
    const c = this.composer = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.ao = new GTAOPass(this.scene, this.camera, w, h);
    this.ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 });
    this.ao.blendIntensity = 0.6; // 1.7.0：強すぎたので弱めた
    this.ao.enabled = q === 'high';
    this.effectsOn = q !== 'low';
    c.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.22, 0.4, 0.88);
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
    // 光のにじみ：1.7.0 で「光が強すぎる」とのことで、半分にして、にじみはじめる明るさも上げた
    this.bloom.strength = (m.bloom ?? 0.45) * 0.5;
    this.bloom.threshold = Math.min(0.95, (m.bloomTh ?? 0.82) + 0.06);
  }
  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('studyroom.quality', q); } catch (e) { /* なし */ }
    if (this.ao) this.ao.enabled = q === 'high';
    this.effectsOn = q !== 'low';
    if (this.sh && this.items) this.updateLights();
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
    if (this.topView) this.setTopView(false);
    this.sh = roomShape(roomDef);
    if (this.grid) this.setGrid(false);
    if (this.roomDef !== roomDef || this.st !== st) {
      // 部屋ごとの立つ位置から、窓のほうを向いて始める
      this.camera.position.set(this.sh.cam[0], 1.5, this.sh.cam[1]);
      this.walk = null;
      if (this.roomDef && this.roomDef !== roomDef) { this.yaw = 0.25; this.pitch = -0.12; this.vyaw = this.vpitch = 0; }
    }
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
  // 確かめ用：時間帯を指定して光を変える
  setMoodId(id) { if (MOODS[id]) this.applyMood(MOODS[id]); }
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

  // 買う前に、ドア・窓・カーテン・壁・床をためしに部屋に映す（null で元に戻す）。そのほうへ振り向く
  async previewSurfaceItem(item) {
    this.surfPreview = item || null;
    await this.buildShell();
    if (!item) return;
    const sh = this.sh;
    // 下半分は買う画面でかくれるので、選んだ物が画面の上のほうに来るよう少し下を向く
    const look = (pt) => { this.lookAt(pt); if (this.targetLook) this.targetLook.pitch = Math.max(-0.9, this.targetLook.pitch - 0.3); };
    if (item.surface === 'door') { const s = segOf(sh, sh.door.wall); if (s) look(segPoint(s, sh.door.a, 1.05, 0)); }
    else if (item.surface === 'window' || item.surface === 'curtain') { const w = sh.windows[0], s = w && segOf(sh, w.wall); if (s) look(segPoint(s, w.a, 1.4, 0)); }
    else if (item.surface === 'floor') this.targetLook = { yaw: this.yaw, pitch: -0.7 };
    else if (item.surface === 'wall') this.targetLook = { yaw: this.yaw, pitch: 0.05 };
    else if (item.surface?.startsWith('fix-')) {
      // 備え付けの形：その備え付けのほうを向く
      const kind = item.surface.slice(4);
      if (kind === 'aircon') { const s = sh.ac && segOf(sh, sh.ac.wall); if (s) look(segPoint(s, sh.ac.a, sh.h - 0.35, 0)); }
      else { const sd = (this.solids || []).find(x => x.kind === kind); if (sd) look(sd.box.getCenter(new THREE.Vector3())); }
    }
  }
  // 備え付けの形（模様がえで選んだ物。買う前のためし映しもふくむ）
  fixShape(kind) { return this.surfItem('fix-' + kind)?.src?.fixshape?.shape || null; }
  surfItem(kind) {
    if (this.surfPreview && this.surfPreview.surface === kind) return this.surfPreview;
    const id = this.st?.surf?.[kind] ?? STARTER?.[kind];
    return id ? itemById(id) : null;
  }
  async placeAll(token = this.token) {
    clearFree(this.items);
    if (this.blobs) clearFree(this.blobs);
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
    } else if (src.gacha) {
      try { obj = buildGacha(gachaSpec(item)); } catch (e) { console.warn('gacha', item.id, e); }
    } else if (src.model) {
      obj = await loadModel(src.model);
      if (obj && (src.tint || src.paint)) recolor(obj, src);
    } else if (src.tex && item.place === 'rug') {
      obj = await makeRug(item);
    }
    if (!obj) return null;
    shadowAll(obj);
    // 大きすぎるモデルは目安の大きさに縮める
    if (item.size && !src.proc && !src.gacha) {
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
    this.refitFixRider(p);
    this.mountPlaced(wrap, p);
    if (animate) { wrap.userData.baseY = wrap.position.y; wrap.userData.appear = 0; }
    const old = this.objByUid?.[p.uid];
    if (old) this.items.remove(old);
    this.objByUid = this.objByUid || {};
    this.objByUid[p.uid] = wrap;
    this.items.add(wrap);
    this.updateBlob(wrap);
    return wrap;
  }

  // 家具の足もとに落ちる、やわらかい影（どの時間帯でも家具が浮いて見えないように）
  updateBlob(wrap) {
    if (!this.blobs) { this.blobs = new THREE.Group(); this.scene.add(this.blobs); }
    const uid = wrap.userData.uid, item = wrap.userData.item, p = wrap.userData.p;
    let b = this.blobs.children.find(x => x.userData.uid === uid);
    if (item.place !== 'floor') { if (b) this.blobs.remove(b); return; }
    if (!Room3D.blobMat) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
      // 足もとにだけ、くっきりめの接地の影（大きくぼかすと浮いて見えるので小さく）
      gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.62, 'rgba(0,0,0,0.34)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      Room3D.blobMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
      Room3D.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    }
    if (!b) { b = new THREE.Mesh(Room3D.blobGeo, Room3D.blobMat); b.userData.uid = uid; b.renderOrder = 1; this.blobs.add(b); }
    const bb = new THREE.Box3().setFromObject(wrap.children[0]);
    const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    // 照明（アーム付きのスタンドなど）は足もとの台だけに小さく。ほかは家具の大きさに合わせる
    const lamp = item.genre === 'light';
    const fx = lamp ? Math.min(0.45, sz.x) : sz.x * 1.08, fz = lamp ? Math.min(0.45, sz.z) : sz.z * 1.08;
    const minB = Room3D.canStack(item) && Math.max(sz.x, sz.z) < 0.4 ? 0.05 : 0.2; // 小物は小さな影
    b.scale.set(Math.max(minB, fx), 1, Math.max(minB, fz));
    b.position.set(c.x, bb.min.y + 0.004, c.z);
    b.visible = true;
  }

  // 配置 p に合わせて、向きと位置をそろえる。部屋からはみ出さないように直し、p も直した値にする
  mountPlaced(wrap, p) {
    const item = wrap.userData.item;
    const obj = wrap.children[0];
    const sh = this.sh;
    const { hw: HW, hd: HD } = sh;
    wrap.position.set(0, 0, 0);
    let seg = null;
    if (item.place === 'wall') {
      seg = segOf(sh, p.wall || '-z') || segOf(sh, '-z');
      p.wall = seg.id;
      obj.rotation.y = segRot(seg);
    } else obj.rotation.y = p.rot || 0;
    obj.position.set(0, 0, 0);
    let bb = new THREE.Box3().setFromObject(obj);
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    const m = 0.01;
    if (item.place === 'wall') {
      const along = p.a ?? 0, y = p.y ?? 1.6;
      // 壁の上で、はみ出さない範囲
      const ext = seg.axis === 'z' ? sz.x / 2 : sz.z / 2;
      const a2 = Math.max(seg.a0 + ext + 0.05, Math.min(seg.a1 - ext - 0.05, along));
      // 斜めの天井の下では、低いほうに合わせる
      const top = seg.axis === 'z' ? Math.min(ceilAt(sh, a2 - ext), ceilAt(sh, a2 + ext)) : ceilAt(sh, seg.c);
      const y2 = Math.max(sz.y / 2 + 0.3, Math.min(top - sz.y / 2 - 0.05, y));
      p.a = +a2.toFixed(3); p.y = +y2.toFixed(3);
      if (seg.axis === 'z') obj.position.set(a2 - c.x, y2 - c.y, seg.n > 0 ? seg.c + m - bb.min.z : seg.c - m - bb.max.z);
      else obj.position.set(seg.n > 0 ? seg.c + m - bb.min.x : seg.c - m - bb.max.x, y2 - c.y, a2 - c.z);
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
      // L字の部屋：切り取った角に入っていたら、近いほうへ押し出す
      const nt = sh.notch;
      if (nt) {
        const hx = sz.x / 2 + m, hz = sz.z / 2 + m;
        if (x + hx > nt.x0 && x - hx < nt.x1 && z + hz > nt.z0 && z - hz < nt.z1) {
          const px = nt.sx > 0 ? nt.x0 - hx : nt.x1 + hx, pz = nt.sz > 0 ? nt.z0 - hz : nt.z1 + hz;
          if (Math.abs(px - x) < Math.abs(pz - z)) x = px; else z = pz;
        }
      }
      p.x = +x.toFixed(3); p.z = +z.toFixed(3);
      let y;
      if (item.place === 'ceiling') y = (Math.min(ceilAt(sh, x - sz.x / 2), ceilAt(sh, x + sz.x / 2)) - 0.005) - bb.max.y;
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
  // 備え付けの物・切り取った角・低い天井にかかっていないか
  hitsShell(item, bb, skip) {
    const sh = this.sh;
    if (item.place !== 'ceiling' && item.place !== 'rug' && sh.slope && bb.max.y > Math.min(ceilAt(sh, bb.min.x), ceilAt(sh, bb.max.x)) + 0.02) return true;
    for (const s of this.solids || []) {
      if (s === skip) continue;
      if (s.block === 'none') continue; // 天井の梁など、置き方のじゃまをしない物
      if (s.block === 'wall' && item.place !== 'wall') continue;
      if (bb.intersectsBox(s.box)) return true;
    }
    return false;
  }
  // 置き方が決まりに合っているか。合っていれば true（家具の上にのせたときは p.on / p.y を決める）
  checkPlacement(o) {
    const item = o.userData.item, p = o.userData.p;
    const sh = this.sh;
    const shrink = 0.01;
    let bb = this.boxOf(o).expandByScalar(-shrink);
    // 小物：備え付けの天板（洗面台・キッチンなど）の上なら、そこにのせる
    if (Room3D.canStack(item) && !Room3D.isSupport(item)) {
      const top = this.fixTopAt(bb);
      if (top) {
        if (p.on !== top.id || p.y !== top.y) { p.on = top.id; p.y = top.y; this.mountPlaced(o, p); bb = this.boxOf(o).expandByScalar(-shrink); }
        if (this.hitsShell(item, bb, top.solid)) return false;
        // 同じ天板の物・壁の物・ほかの家具と重ならない
        return !this.items.children.some(x => x !== o && x.userData.uid && x.userData.item?.place !== 'rug' && x.userData.item?.place !== 'ceiling' && bb.intersectsBox(this.boxOf(x)));
      }
      if (typeof p.on === 'string' && p.on.startsWith('fix:')) { delete p.on; delete p.y; this.mountPlaced(o, p); bb = this.boxOf(o).expandByScalar(-shrink); }
    }
    if (this.hitsShell(item, bb)) return false;
    if (item.place === 'rug') return true;
    const others = this.items.children.filter(x => x !== o && x.userData.uid && x.userData.item?.place !== 'rug');
    if (item.place === 'wall' || item.place === 'ceiling') {
      // 同じ種類どうしで重ならない。壁の物はドアと窓にもかからない
      if (others.some(x => x.userData.item.place === item.place && bb.intersectsBox(this.boxOf(x)))) return false;
      if (item.place === 'wall') {
        const openings = [];
        for (const seg of sh.walls) {
          for (const op of openingsOn(sh, seg.id)) {
            openings.push(op.door
              ? wallBox(seg, op.a - op.w / 2 - 0.1, op.a + op.w / 2 + 0.1, 0, op.y1 + 0.1, -0.5, 0.5)
              : wallBox(seg, op.a - op.w / 2 - 0.1, op.a + op.w / 2 + 0.1, op.y0 - 0.1, op.y1 + 0.25, -0.5, 0.5));
          }
        }
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
    const dseg = segOf(sh, sh.door.wall);
    const doorZone = wallBox(dseg, sh.door.a - sh.door.w / 2, sh.door.a + sh.door.w / 2, 0, 2, -0.2, 0.6);
    if (!p.on && doorZone.intersectsBox(bb)) return false;
    if (!hits.length) { if (p.on) { delete p.on; delete p.y; this.mountPlaced(o, p); } return true; }
    // 1つの家具の上に、小物がまるごとのる場合だけ OK
    // 家具（テーブル・棚）の上や、棚の中の段にのせる。同じ家具にのっている物とは、段がちがうか、横に重ならなければよい
    const sup = hits.find(x => Room3D.isSupport(x.userData.item));
    const riders = hits.filter(x => x !== sup);
    if (sup && Room3D.canStack(item) && riders.every(x => x.userData.p?.on === sup.userData.uid)) {
      const sb = this.boxOf(sup);
      const fb = this.boxOf(o);
      const cx = (fb.min.x + fb.max.x) / 2, cz = (fb.min.z + fb.max.z) / 2;
      if (cx > sb.min.x && cx < sb.max.x && cz > sb.min.z && cz < sb.max.z) {
        const h = fb.max.y - fb.min.y;
        const levels = this.stackLevels(sup, h);
        // その段が、ほかの物で横にふさがっていないか
        const free = (y) => !riders.some(x => Math.abs((x.userData.p.y || 0) - y) < 0.02 && (() => { const b2 = this.boxOf(x); return fb.max.x > b2.min.x && fb.min.x < b2.max.x && fb.max.z > b2.min.z && fb.min.z < b2.max.z; })());
        const cur = p.on === sup.userData.uid ? levels.find(l => Math.abs(l - (p.y || 0)) < 0.02) : undefined;
        // 指で動かしているときは、指がさしている段（その高さに近い段）から。
        // そうでなければ今の段、だめなら目の高さ（1.2m）に近い段から順に
        const hint = this.levelHint;
        const order = hint !== undefined
          ? [...levels].sort((a2, b2) => Math.abs(a2 - hint) - Math.abs(b2 - hint))
          : [...(cur !== undefined ? [cur] : []), ...levels.filter(l => l !== cur).sort((a2, b2) => Math.abs(a2 - 1.2) - Math.abs(b2 - 1.2))];
        const y = order.find(free);
        if (y === undefined) return false;
        const top = +y.toFixed(3);
        if (p.on !== sup.userData.uid || p.y !== top) { p.on = sup.userData.uid; p.y = top; this.mountPlaced(o, p); }
        return true;
      }
    }
    return false;
  }
  // 備え付けの天板にのっている物（p.on = 'fix:…'）の高さを、今の天板に合わせる。天板がなくなっていたら床へ
  refitFixRider(p, o) {
    if (!p || typeof p.on !== 'string' || !p.on.startsWith('fix:')) return;
    const t = (this.fixTops || []).find(x => x.id === p.on) || (this.fixTops || []).find(x => p.x > x.x0 && p.x < x.x1 && p.z > x.z0 && p.z < x.z1);
    if (t) { p.on = t.id; p.y = t.y; } else { delete p.on; delete p.y; }
    if (o) { this.mountPlaced(o, p); this.updateBlob(o); }
  }
  // 真上から見て、小物がまるごとおさまる備え付けの天板（なければ null）
  fixTopAt(bb, pad = 0.015) {
    return (this.fixTops || []).find(t => bb.min.x > t.x0 - pad && bb.max.x < t.x1 + pad && bb.min.z > t.z0 - pad && bb.max.z < t.z1 + pad) || null;
  }
  // 家具の「物をのせられる面」の高さを、上から光線を当てて見つける（棚の中の板もふくむ）
  shelfLevels(sup) {
    if (sup.userData.levels) return sup.userData.levels;
    sup.updateMatrixWorld(true);
    const bb = this.boxOf(sup), sz = bb.getSize(new THREE.Vector3());
    const ray = new THREE.Raycaster();
    const hs = [];
    for (const fx of [0.3, 0.5, 0.7]) for (const fz of [0.35, 0.5, 0.65]) {
      ray.set(new THREE.Vector3(bb.min.x + sz.x * fx, bb.max.y + 0.5, bb.min.z + sz.z * fz), new THREE.Vector3(0, -1, 0));
      for (const hit of ray.intersectObject(sup, true)) {
        if (!hit.face) continue;
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (n.y > 0.7 && hit.point.y > bb.min.y + 0.08) hs.push(hit.point.y);
      }
    }
    // 近い高さはまとめる。上の面は必ず入れる
    hs.push(bb.max.y);
    hs.sort((a, b) => a - b);
    const lv = [];
    for (const y of hs) if (!lv.length || y - lv[lv.length - 1] > 0.06) lv.push(y); else lv[lv.length - 1] = Math.max(lv[lv.length - 1], y);
    sup.userData.levels = lv.map(y => +y.toFixed(3));
    return sup.userData.levels;
  }
  // 高さ h の物をのせられる段（上の段との間に h より広いすき間がある段。いちばん上の面は天井まで）
  stackLevels(sup, h) {
    const lv = this.shelfLevels(sup);
    const ceil = (this.sh?.h || 2.6) - 0.05;
    return lv.filter((y, i) => ((i + 1 < lv.length ? lv[i + 1] : ceil) - y) >= h + 0.02);
  }
  // 模様がえ：棚の上の物を、上の段・下の段へ
  moveLevel(uid, dir) {
    const o = this.objByUid?.[uid], p = o?.userData.p;
    const sup = p?.on != null && this.objByUid?.[p.on];
    if (!sup) return false;
    const fb = this.boxOf(o);
    const levels = this.stackLevels(sup, fb.max.y - fb.min.y);
    const i = levels.findIndex(l => Math.abs(l - (p.y || 0)) < 0.02);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= levels.length) return false;
    p.y = levels[j];
    this.mountPlaced(o, p);
    this.updateBlob(o);
    if (this.selBox) this.selBox.update();
    return true;
  }
  levelInfo(uid) {
    const o = this.objByUid?.[uid], p = o?.userData.p;
    const sup = p?.on != null && this.objByUid?.[p.on];
    if (!sup) return null;
    const fb = this.boxOf(o);
    const levels = this.stackLevels(sup, fb.max.y - fb.min.y);
    return { count: levels.length, index: levels.findIndex(l => Math.abs(l - (p.y || 0)) < 0.02) };
  }
  // 新しく置いた物が重なっていたら、近くの空いている所をさがす。見つからなければ false
  findFreeSpot(o) {
    const p = o.userData.p, item = o.userData.item;
    if (this.checkPlacement(o)) return true;
    const start = { ...p };
    const walls = this.sh.walls.map(w => w.id);
    for (let r = 1; r <= 10; r++) {
      for (let k = 0; k < 12; k++) {
        const ang = k * Math.PI / 6;
        if (item.place === 'wall') {
          for (const w of [start.wall, ...walls]) {
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

  // 種類に合った「良い場所」の候補を順にためして、最初に空いていた所に置く
  autoSpots(item, self) {
    const sh = this.sh, out = [];
    const others = this.items.children.filter(o => o !== self && o.userData.p && o.userData.item);
    const centerOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const byGenre = (...g) => others.filter(o => g.includes(o.userData.item.genre) && o.userData.item.place === 'floor');
    const busy = (seg) => openingsOn(sh, seg.id).reduce((n, op) => n + op.w, 0) / Math.max(0.1, seg.a1 - seg.a0);
    const walls = [...sh.walls].sort((a, b) => busy(a) - busy(b) || (b.a1 - b.a0) - (a.a1 - a.a0));
    const alongs = (seg) => { const m = (seg.a0 + seg.a1) / 2, L = seg.a1 - seg.a0; return [m, m - L * 0.25, m + L * 0.25, seg.a0 + 0.6, seg.a1 - 0.6, m - L * 0.4, m + L * 0.4]; };
    const corners = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push({ x: sx * (sh.hw - 0.35), z: sz * (sh.hd - 0.35), rot: Math.atan2(-sx, -sz) });
    // 家具の奥行き（正面向きの時の z の厚み）。壁ぎわに置く時に、背中を壁にぴったり付けるのに使う
    let halfD = 0.25;
    if (self) {
      const p0 = self.userData.p, keep = { ...p0 };
      Object.assign(p0, { x: 0, z: 0, rot: 0 }); delete p0.on; delete p0.y;
      this.mountPlaced(self, p0);
      const sz = new THREE.Box3().setFromObject(self).getSize(new THREE.Vector3());
      halfD = Math.min(1.2, Math.max(0.1, sz.z / 2));
      for (const k of Object.keys(p0)) if (!(k in keep)) delete p0[k];
      Object.assign(p0, keep); this.mountPlaced(self, p0);
    }
    const wallSide = (depth) => { for (const seg of walls) for (const a of alongs(seg)) { const q = segPoint(seg, a, 0, depth ?? halfD + 0.03); out.push({ x: q.x, z: q.z, rot: segRot(seg) }); } };
    const g = item.genre;
    // 部屋ごとの「決まった配置」（layouts.js）を先にためす。小物はテーブルや棚の上がいちばん先
    const designed = layoutSpots(this.roomDef?.id, item);
    if (!(Room3D.canStack(item) && !Room3D.isSupport(item))) out.push(...designed);
    if (item.place === 'wall') {
      for (const seg of walls) for (const a of alongs(seg)) for (const y of [1.55, 1.25, 1.85]) out.push({ wall: seg.id, a, y });
      return out;
    }
    if (item.place === 'ceiling') {
      out.push({ x: 0, z: 0, rot: 0 });
      for (const [x, z] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]]) out.push({ x, z, rot: 0 });
      return out;
    }
    if (item.place === 'rug') {
      const sofa = byGenre('sofa')[0];
      if (sofa) { const c = centerOf(sofa), r = sofa.userData.p.rot || 0; out.push({ x: c.x + Math.sin(r) * 1.1, z: c.z + Math.cos(r) * 1.1, rot: r }); }
      out.push({ x: 0, z: 0, rot: 0 }, { x: 0.5, z: 0.5, rot: 0 }, { x: -0.5, z: -0.5, rot: 0 });
      return out;
    }
    // 小物：テーブルや棚の上
    if (Room3D.canStack(item) && !Room3D.isSupport(item)) {
      // テーブル・棚の「上」だけ（needOn：上にのらなければ使わない。すぐ横の床に落ちないように）
      // 備え付けの天板（洗面台・キッチンなど）。お風呂・台所の小物はこちらを先に
      const fix = [];
      for (const t of this.fixTops || []) {
        const n = Math.max(1, Math.round((t.x1 - t.x0) / 0.12)), m = Math.max(1, Math.round((t.z1 - t.z0) / 0.12));
        const rot = this.fixRotAt(t);
        for (let i = 0; i < n; i++) for (let j = m - 1; j >= 0; j--) fix.push({ x: t.x0 + (t.x1 - t.x0) * (i + 0.5) / n, z: t.z0 + (t.z1 - t.z0) * (j + 0.5) / m, rot, needOn: true });
      }
      const wet = item.zone === 'bath' || item.zone === 'kitchen';
      if (wet) out.push(...fix);
      for (const s of byGenre('table', 'storage')) { const c = centerOf(s), rr = s.userData.p.rot || 0; for (const [dx, dz] of [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) out.push({ x: c.x + dx, z: c.z + dz, rot: rr, needOn: true }); }
      if (!wet) out.push(...fix);
      out.push(...designed);
    }
    if (g === 'table') {
      for (const s of byGenre('sofa')) { const c = centerOf(s), r = s.userData.p.rot || 0; for (const d of [1.0, 1.3, 0.8]) out.push({ x: c.x + Math.sin(r) * d, z: c.z + Math.cos(r) * d, rot: r }); }
      out.push({ x: 0, z: 0, rot: 0 }, { x: 0.6, z: 0, rot: 0 }, { x: -0.6, z: 0, rot: 0 });
    } else if (g === 'chair') {
      for (const t of byGenre('table')) { const c = centerOf(t); for (const [dx, dz] of [[0, 0.75], [0, -0.75], [0.75, 0], [-0.75, 0]]) out.push({ x: c.x + dx, z: c.z + dz, rot: Math.atan2(-dx, -dz) }); }
      wallSide();
    } else if (g === 'plant' || (g === 'light' && item.place === 'floor')) {
      for (const s of byGenre('sofa')) { const c = centerOf(s), r = s.userData.p.rot || 0; for (const d of [-1.3, 1.3]) out.push({ x: c.x + Math.cos(r) * d, z: c.z - Math.sin(r) * d, rot: r }); }
      out.push(...corners);
    } else wallSide(); // ソファ・ベッド・棚・趣味の物などは壁ぎわ（背中を壁に付ける）
    out.push(...corners);
    return out;
  }
  // 天板の前（部屋の中）を向く角度。備え付けは壁ぎわなので、近い壁から部屋の中へ
  fixRotAt(t) {
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, sh = this.sh;
    const d = [[sh.hw - cx, -Math.PI / 2], [cx + sh.hw, Math.PI / 2], [sh.hd - cz, Math.PI], [cz + sh.hd, 0]].sort((a, b) => a[0] - b[0]);
    return d[0][1];
  }
  autoPlace(o) {
    const p = o.userData.p, item = o.userData.item;
    const start = { ...p };
    // 向きを問わない物（照明・植物・小物・趣味の物）は、良い場所で向きを変えてもおさまるか試す
    const turnable = item.place === 'floor' && ['plant', 'light', 'decor', 'hobby'].includes(item.genre);
    for (const c of this.autoSpots(item, o)) {
      const { needOn, ...spot } = c;
      const rots = turnable && spot.rot !== undefined ? [spot.rot, spot.rot + Math.PI / 2, spot.rot - Math.PI / 2, spot.rot + Math.PI] : [spot.rot];
      for (const rot of rots) {
        if (item.place !== 'wall') { delete p.on; delete p.y; }
        Object.assign(p, spot, rot !== undefined ? { rot } : {});
        this.mountPlaced(o, p);
        if (this.checkPlacement(o) && (!needOn || p.on)) return true;
      }
    }
    for (const k of Object.keys(p)) if (!(k in start)) delete p[k];
    Object.assign(p, start);
    this.mountPlaced(o, p);
    return false;
  }

  // ===================== 自動で並べる =====================
  // 家具を役わり（ソファ・ローテーブル・いす・テレビ台・食卓…）に分け、並べ方（style）どおりに置く。
  // 位置は「ソファの正面から42cm先にテーブル」のように家具どうしの関係で決めるので、どの部屋の形でも使える。
  // インテリアの目安：通り道75〜90cm／ソファとローテーブル40〜45cm／テレビとソファ1.5〜2m／ラグは座る家具の前脚がのる
  // style: 'talk'（団らん）| 'tv'（テレビ中心）| 'window'（窓辺）| 'cafe'（カフェ）| 'auto'（おまかせ）
  // 戻り値：{ style, failed: [置けなかった物の uid] }
  async arrangeRoom(ps, style = 'auto') {
    const sh = this.sh;
    // 今ある物はいったん全部どける
    for (const uid of Object.keys(this.objByUid || {})) this.removeObject(uid);
    const objs = [];
    for (const p of ps) {
      Object.assign(p, { x: 0, z: 0, rot: 0 }); delete p.on; delete p.y;
      const o = await this.placeOne(p, false);
      if (!o) continue;
      o.userData.sz = this.sizeAt0(o);
      o.userData.role = this.roleOf(o);
      this.items.remove(o); // まだ置いていない物は、ぶつかりの判定に入れない
      objs.push(o);
    }
    const pick = (role, cond = () => true) => { const i = objs.findIndex(o => !o.userData.done && o.userData.role === role && cond(o)); return i < 0 ? null : objs[i]; };
    const all = (role) => objs.filter(o => !o.userData.done && o.userData.role === role);
    const biggest = (role) => all(role).sort((a, b) => b.userData.sz.w * b.userData.sz.d - a.userData.sz.w * a.userData.sz.d)[0] || null;
    if (style === 'auto') {
      const nChairs = all('chair').length;
      style = all('dining').length && nChairs >= 2 ? 'cafe' : all('tv').length && (all('low').length || all('coffee').length) ? 'tv' : all('sofa').length && nChairs >= 2 ? 'talk' : all('sofa').length ? 'window' : 'talk';
    }
    const put = (o, x, z, rot) => { this.items.add(o); const p = o.userData.p; delete p.on; delete p.y; Object.assign(p, { x, z, rot }); this.mountPlaced(o, p); if (this.checkPlacement(o)) { o.userData.done = true; return true; } this.items.remove(o); return false; };
    const freeWalls = () => [...sh.walls].map(seg => ({ seg, free: (seg.a1 - seg.a0) - openingsOn(sh, seg.id).reduce((n, op) => n + op.w, 0), door: sh.door.wall === seg.id, win: sh.windows.some(w => w.wall === seg.id) }));
    // 壁にぴったり（背中を壁に）。a のまわりを少しずつずらして試す
    const onWall = (o, seg, a) => {
      if (!o || !seg) return false;
      const half = o.userData.sz.w / 2, rot = segRot(seg);
      for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3]) {
        const aa = Math.max(seg.a0 + half + 0.02, Math.min(seg.a1 - half - 0.02, a + da));
        const q = segPoint(seg, aa, 0, o.userData.sz.d / 2 + 0.03);
        if (put(o, q.x, q.z, rot)) return true;
      }
      return false;
    };
    // 家具どうしの関係：anchor の side（front/back/left/right）へ gap はなし、off だけ横へ。facing は 'same' か 'toward'
    const rel = (o, A, side, gap, off = 0, facing = 'same') => {
      if (!o || !A || !A.userData.done) return false;
      const ap = A.userData.p, ar = ap.rot || 0, as = A.userData.sz, is = o.userData.sz;
      const f = { x: Math.sin(ar), z: Math.cos(ar) }, perp = { x: Math.cos(ar), z: -Math.sin(ar) };
      const dir = side === 'front' ? f : side === 'back' ? { x: -f.x, z: -f.z } : side === 'left' ? perp : { x: -perp.x, z: -perp.z };
      const along = side === 'front' || side === 'back', s2 = along ? perp : f;
      const rot = facing === 'toward' ? Math.atan2(-dir.x, -dir.z) : ar;
      // 置く物の、dir の向きの厚み（向きによって幅か奥行き）
      const turned = Math.abs(Math.sin(rot - ar)) > 0.7;
      const iExt = along ? (turned ? is.w : is.d) : (turned ? is.d : is.w);
      for (const [dg, doff] of [[0, 0], [0.1, 0], [0, 0.25], [0, -0.25], [0.25, 0], [0.2, 0.3], [0.2, -0.3]]) {
        const dist = (along ? as.d : as.w) / 2 + gap + dg + iExt / 2;
        if (put(o, ap.x + dir.x * dist + s2.x * (off + doff), ap.z + dir.z * dist + s2.z * (off + doff), rot)) return true;
      }
      return false;
    };
    const corner = (o) => {
      if (!o) return false;
      const m = Math.max(o.userData.sz.w, o.userData.sz.d) / 2 + 0.06;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (put(o, sx * (sh.hw - m), sz * (sh.hd - m), Math.atan2(-sx, -sz))) return true;
      return false;
    };
    const opposite = (seg) => sh.walls.find(w => w.axis === seg.axis && w.n === -seg.n) || null;
    // 壁の中で、窓やドアからいちばんはなれた所（同じくらいなら真ん中に近い所）
    const mid = (seg) => {
      const ops = openingsOn(sh, seg.id), m = (seg.a0 + seg.a1) / 2;
      if (!ops.length) return m;
      let best = m, score = -Infinity;
      for (let a = seg.a0 + 0.8; a <= seg.a1 - 0.8 + 1e-6; a += 0.1) {
        const d = Math.min(...ops.map(op => Math.abs(a - op.a) - op.w / 2));
        const sc = Math.min(d, 1.5) - Math.abs(a - m) * 0.2;
        if (sc > score) { score = sc; best = a; }
      }
      return best;
    };
    const W = freeWalls();
    const wallFor = (avoidWin = true) => (W.filter(w => !w.door && (!avoidWin || !w.win)).sort((a, b) => b.free - a.free)[0] || W.filter(w => !w.door).sort((a, b) => b.free - a.free)[0] || W[0]).seg;
    let sofa = null, focus = null; // focus：照明や絵を合わせる中心の家具
    const loungeAround = (table) => {
      // いすを2つまで、テーブルの向こう側にテーブル向きで
      const chairs = all('chair').slice(0, 2);
      if (chairs.length === 2) { rel(chairs[0], table, 'front', 0.45, -0.42, 'toward'); rel(chairs[1], table, 'front', 0.45, 0.42, 'toward'); }
      else if (chairs.length === 1) rel(chairs[0], table, 'front', 0.45, 0, 'toward');
    };
    if (style === 'cafe') {
      const t = biggest('dining') || biggest('coffee') || biggest('desk');
      if (t) {
        const rot = sh.w >= sh.d ? 0 : Math.PI / 2;
        for (const [x, z] of [[0, 0], [-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4], [-0.8, -0.3], [0.8, 0.3]]) if (put(t, x, z, rot)) break;
        focus = t;
        const ch = all('chair').slice(0, 6), q = t.userData.sz.w / 4;
        const spots = [['front', -q], ['front', q], ['back', -q], ['back', q], ['left', 0], ['right', 0]];
        ch.forEach((c, i) => rel(c, t, spots[i][0], 0.05, spots[i][1], 'toward'));
        const sb = biggest('low') || biggest('tall');
        if (sb) { const seg = wallFor(true); onWall(sb, seg, mid(seg)); }
        const rug = pick('rug'); if (rug) put(rug, t.userData.p.x, t.userData.p.z, rot);
      }
    } else if (style === 'tv') {
      const stand = biggest('low') || pick('side') || pick('coffee');
      const seg = wallFor(true);
      if (stand && onWall(stand, seg, mid(seg))) {
        const tv = pick('tv'); if (tv) { for (const [dx] of [[0], [0.25], [-0.25]]) { const sp = stand.userData.p; if (put(tv, sp.x + Math.cos(sp.rot) * dx, sp.z - Math.sin(sp.rot) * dx, sp.rot)) break; } }
        sofa = biggest('sofa');
        if (sofa && !rel(sofa, stand, 'front', 1.75, 0, 'toward')) rel(sofa, stand, 'front', 1.4, 0, 'toward');
        focus = stand;
      }
    } else if (style === 'window') {
      const win = sh.windows[0], seg = win && sh.walls.find(w => w.id === win.wall);
      sofa = biggest('sofa');
      if (seg && sofa) {
        const depth = seg.axis === 'z' ? sh.d : sh.w, d = Math.max(1.6, Math.min(3.0, depth * 0.55));
        const q = segPoint(seg, win.a, 0, d);
        put(sofa, q.x, q.z, segRot(seg) + Math.PI) || put(sofa, q.x, q.z - 0.3 * seg.n, segRot(seg) + Math.PI);
        // 窓のわきに大きな植物
        for (const side of [-1, 1]) { const pl = pick('bigplant'); if (!pl) break; const a = win.a + side * (win.w / 2 + pl.userData.sz.w / 2 + 0.1); const q2 = segPoint(seg, a, 0, pl.userData.sz.d / 2 + 0.06); put(pl, q2.x, q2.z, segRot(seg)); }
      }
    }
    // 団らん（ほかの並べ方でソファが置けなかった時も）
    if (!sofa || !sofa.userData.done) {
      sofa = biggest('sofa');
      if (sofa) { const seg = wallFor(true); onWall(sofa, seg, mid(seg)); }
    }
    if (sofa && sofa.userData.done) {
      const coffee = biggest('coffee') || (style !== 'cafe' ? pick('side') : null);
      if (coffee) rel(coffee, sofa, 'front', 0.42, 0, 'same');
      const rug = pick('rug'); if (rug) rel(rug, sofa, 'front', -0.3, 0, 'same');
      if (style === 'window') {
        const ch = all('chair').slice(0, 2);
        if (coffee && coffee.userData.done) { if (ch[0]) rel(ch[0], coffee, 'left', 0.45, 0, 'toward'); if (ch[1]) rel(ch[1], coffee, 'right', 0.45, 0, 'toward'); }
      } else if (coffee && coffee.userData.done) {
        // 2つ目のソファは向かい合わせ。いすは残りに
        const sofa2 = pick('sofa'); if (sofa2) rel(sofa2, coffee, 'front', 0.45, 0, 'toward');
        if (style === 'tv') { const ch = all('chair').slice(0, 2); if (ch[0]) rel(ch[0], coffee, 'left', 0.45, 0, 'toward'); if (ch[1]) rel(ch[1], coffee, 'right', 0.45, 0, 'toward'); }
        else loungeAround(coffee);
      }
      const side = pick('side'); if (side) rel(side, sofa, 'right', 0.06, 0, 'same');
      const lamp = pick('floorlamp'); if (lamp) rel(lamp, sofa, 'left', 0.1, 0, 'same');
      focus = focus || coffee || sofa;
      // 本棚は、ソファと反対の壁（テレビ中心ならソファのうしろ側の壁）
      const tall = biggest('tall');
      if (tall) { const sseg = sh.walls.find(w => Math.cos(segRot(w) - (sofa.userData.p.rot || 0)) > 0.99); const seg = (style === 'tv' ? sseg : sseg && opposite(sseg)) || wallFor(false); if (!onWall(tall, seg, mid(seg))) onWall(tall, wallFor(false), 0); }
    }
    // 天井の照明：中心の家具の上
    for (const [i, c] of all('ceil').entries()) {
      const fp = focus?.userData.p, off = (i - (all('ceil').length - 1) / 2) * 0.8;
      if (fp) { if (put(c, fp.x + Math.cos(fp.rot || 0) * off, fp.z - Math.sin(fp.rot || 0) * off, 0)) continue; }
      this.items.add(c); if (!this.autoPlace(c)) this.items.remove(c); else c.userData.done = true;
    }
    // 絵などの壁の物：ソファの上 → ほかは自動
    const art = pick('wall');
    if (art && sofa?.userData.done) {
      const sp = sofa.userData.p, seg = sh.walls.find(w => Math.abs(Math.cos(segRot(w) - (sp.rot || 0)) - 1) < 0.01);
      if (seg) { this.items.add(art); Object.assign(art.userData.p, { wall: seg.id, a: seg.axis === 'z' ? sp.x : sp.z, y: 1.65 }); this.mountPlaced(art, art.userData.p); if (this.checkPlacement(art)) art.userData.done = true; else this.items.remove(art); }
    }
    // 大きな植物・照明はすみ
    for (const o of [...all('bigplant'), ...all('floorlamp')]) corner(o);
    // 残りの家具（いす・棚・小物など）は、種類に合う場所へ（小物はテーブルや棚の上）
    const rest = objs.filter(o => !o.userData.done).sort((a, b) => (a.userData.role === 'small') - (b.userData.role === 'small'));
    const failed = [];
    for (const o of rest) {
      this.items.add(o);
      if (this.autoPlace(o) || this.findFreeSpot(o)) o.userData.done = true;
      else { this.items.remove(o); failed.push(o.userData.uid); }
    }
    for (const o of objs) if (o.userData.done) { o.userData.baseY = o.position.y; this.updateBlob(o); } else delete this.objByUid[o.userData.uid];
    this.updateLights();
    return { style, failed };
  }
  // 並べたあと、部屋を見わたせる所（ソファからいちばん遠いすみの上のほう）から見る
  overview() {
    const sh = this.sh, sofa = this.items.children.find(o => o.userData.role === 'sofa');
    const sp = sofa ? sofa.position : new THREE.Vector3(-sh.hw, 0, 0);
    // 家具の中にカメラが入らない所をえらぶ（すみから少しずつ内側へ）
    const boxes = this.items.children.filter(o => o.userData.uid && o.userData.item?.place !== 'rug' && o.userData.item?.place !== 'ceiling').map(o => this.boxOf(o));
    const clear = (x, z) => !boxes.some(b => x > b.min.x - 0.45 && x < b.max.x + 0.45 && z > b.min.z - 0.45 && z < b.max.z + 0.45 && b.max.y > 0.9);
    let best = null;
    for (const inset of [0.9, 1.2, 1.5]) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx * (sh.hw - inset), z = sz * (sh.hd - inset), d = Math.hypot(x - sp.x, z - sp.z);
        if (clear(x, z) && (!best || d > best.d)) best = { x, z, d };
      }
      if (best) break;
    }
    best = best || { x: sh.hw - 0.9, z: sh.hd - 0.9 };
    this.walk = null; this.targetLook = null; this.vyaw = this.vpitch = 0;
    if (this.topView) this.setTopView(false);
    this.camera.position.set(best.x, 1.5, best.z);
    this.yaw = Math.atan2(best.x, best.z); this.pitch = -0.32;
  }
  // 正面向き（rot 0）の時の幅 w（x）・奥行き d（z）・高さ h
  sizeAt0(o) {
    const p = o.userData.p, keep = { ...p };
    Object.assign(p, { x: 0, z: 0, rot: 0 }); delete p.on; delete p.y;
    this.mountPlaced(o, p);
    const b = new THREE.Box3().setFromObject(o);
    for (const k of Object.keys(p)) if (!(k in keep)) delete p[k];
    Object.assign(p, keep); this.mountPlaced(o, p);
    return { w: b.max.x - b.min.x, d: b.max.z - b.min.z, h: b.max.y - b.min.y };
  }
  roleOf(o) {
    const it = o.userData.item, s = o.userData.sz, id = it.id;
    if (it.place === 'rug') return 'rug';
    if (it.place === 'ceiling') return 'ceil';
    if (it.place === 'wall') return 'wall';
    if (/(^|-)tv(-|$)|television/.test(id)) return 'tv';
    if (it.genre === 'sofa') return /bed/.test(id) ? 'bed' : 'sofa';
    if (it.genre === 'chair') return 'chair';
    if (it.genre === 'table') {
      if (/desk/.test(id)) return 'desk';
      if (s.w < 0.66 && s.d < 0.66) return 'side';
      if (s.h < 0.56) return 'coffee';
      return Math.max(s.w, s.d) >= 0.8 ? 'dining' : 'side';
    }
    if (it.genre === 'storage') return Room3D.canStack(it) ? 'small' : s.h < 0.85 ? 'low' : 'tall';
    if (it.genre === 'light') return s.h > 1.0 ? 'floorlamp' : 'small';
    if (it.genre === 'plant') return s.h > 0.9 ? 'bigplant' : 'small';
    if (Room3D.canStack(it)) return 'small';
    return 'other';
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
    if (!lit.length) { this.addBareBulb(); this.addLampShadow(); this.applyLightsOff(); return; }
    lit.slice(0, MAX_LIGHTS).forEach(o => {
      const obj = o.children[0];
      const il = o.userData.item.light;
      const L = obj.userData.light || (typeof il === 'string' ? { color: il } : il) || {};
      const bb = new THREE.Box3().setFromObject(o);
      const l = new THREE.PointLight(L.color || '#ffd9a8', (L.intensity || 1) * 3 * this.mood.lampI, 0, 2);
      // 照明の影は「すき間の影」とぶつかって、部屋が斜めに暗くなるので使わない（足もとの影で代わりにする）
      const center = bb.getCenter(new THREE.Vector3());
      l.position.set(center.x, o.userData.item.place === 'ceiling' ? bb.min.y - 0.05 : center.y + (L.y || 0) * 0 + 0.1, center.z);
      this.scene.add(l);
      this.lamps.push(l);
    });
    this.addLampShadow();
    this.applyLightsOff();
  }

  // いちばん高い照明（天井の照明）から、本物の影を落とす
  addLampShadow() {
    // 夕方・夜（照明が主役の時間）だけ。すき間の影（GTAO）とは同時に使えないので、そのあいだは切る
    const want = this.quality !== 'low' && this.lamps.length && (this.mood?.lampI || 0) >= 1;
    if (this.ao) this.ao.enabled = this.quality === 'high' && !this.autoLowered && !want;
    if (!want) return;
    const main = this.lamps.reduce((a, b) => (b.position.y > a.position.y ? b : a));
    main.castShadow = true;
    const ms = this.quality === 'high' ? 1024 : 512;
    main.shadow.mapSize.set(ms, ms);
    main.shadow.camera.near = 0.05; main.shadow.camera.far = 10;
    main.shadow.bias = -0.002; main.shadow.normalBias = 0.03; main.shadow.radius = 3;
  }
  // 照明スイッチ：部屋の明かりを消す／つける（部屋ごとに覚えておく）
  toggleLights() {
    if (!this.st) return;
    this.st.lightsOff = !this.st.lightsOff;
    this.applyLightsOff();
    this.onLights && this.onLights(this.st.lightsOff);
  }
  applyLightsOff() {
    const off = !!this.st?.lightsOff;
    for (const l of this.lamps) l.visible = !off;
    // 光っている部分（電球・かさの内側など）も暗くする
    const seen = new Set();
    this.items.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || !m.emissive || seen.has(m)) continue;
        seen.add(m);
        if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissiveIntensity;
        if (m.userData.baseEmissive > 0) m.emissiveIntensity = off ? 0 : m.userData.baseEmissive;
      }
    });
  }

  // --- 模様がえ ---
  setEditMode(on) {
    this.editMode = !!on && !this.readOnly;
    if (!this.editMode) { this.select(null); this.setTopView(false); this.walkEdit = false; }
    this.setGrid(this.editMode);
  }
  // 床の薄い格子（50cmごと）。模様がえのあいだだけ
  setGrid(on) {
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); this.grid = null; }
    if (!on || !this.sh) return;
    const sh = this.sh, st = 0.5, pts = [], nt = sh.notch;
    const inside = (x, z) => !(nt && x > nt.x0 && x < nt.x1 && z > nt.z0 && z < nt.z1);
    const xs = [], zs = [];
    for (let x = -Math.floor(sh.hw / st) * st; x <= sh.hw + 1e-6; x += st) xs.push(x);
    for (let z = -Math.floor(sh.hd / st) * st; z <= sh.hd + 1e-6; z += st) zs.push(z);
    const zb = [-sh.hd, ...zs.filter(z => Math.abs(z) < sh.hd - 1e-3), sh.hd], xb = [-sh.hw, ...xs.filter(x => Math.abs(x) < sh.hw - 1e-3), sh.hw];
    for (const x of xs) for (let i = 0; i < zb.length - 1; i++) if (inside(x, (zb[i] + zb[i + 1]) / 2)) pts.push(x, 0, zb[i], x, 0, zb[i + 1]);
    for (const z of zs) for (let i = 0; i < xb.length - 1; i++) if (inside((xb[i] + xb[i + 1]) / 2, z)) pts.push(xb[i], 0, z, xb[i + 1], 0, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
    this.grid.position.y = 0.006;
    this.grid.renderOrder = 2;
    this.scene.add(this.grid);
  }
  // 模様がえ中に歩く（床をタップするとそこへ歩く）
  setWalkEdit(on) { this.walkEdit = !!on; if (this.walkEdit) this.setTopView(false); }
  // 上から見る（俯瞰）。天井と天井の照明を隠して、真上から部屋全体を見る
  setTopView(on) {
    on = !!on && !!this.sh;
    if (on === !!this.topView) return;
    if (on) {
      this.topView = { pos: this.camera.position.clone(), fov: this.camera.fov };
      this.walk = null; this.targetLook = null; this.vyaw = this.vpitch = 0;
      const sh = this.sh, a = this.camera.aspect || 1;
      this.camera.fov = 50;
      const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const hgt = Math.max((sh.hd + 0.3) / t, (sh.hw + 0.3) / (t * a)) + (sh.h || 2.6) * 0.5;
      this.camera.position.set(0, hgt, 0);
      this.camera.rotation.set(-Math.PI / 2, 0, 0);
      // 天井より上（屋根・天井）は切り取って、断面のように見せる
      this.topView.near = this.camera.near;
      this.camera.near = Math.max(0.05, hgt - (sh.h || 2.6) + 0.02);
    } else {
      this.camera.position.copy(this.topView.pos);
      this.camera.fov = this.topView.fov;
      this.camera.near = this.topView.near;
      this.topView = null;
    }
    this.camera.updateProjectionMatrix();
    this.applyTopHide();
  }
  applyTopHide() {
    const hide = !!this.topView;
    // 上から見るときは、外の景色や建物の裏側（裏世界）が見えないよう、まわりを暗い色でぬりつぶす
    if (this.exterior?.world) this.exterior.world.visible = !hide;
    if (hide) {
      if (!this.topBg) {
        this.topBg = { bg: this.scene.background, fog: this.scene.fog };
        this.scene.background = new THREE.Color('#14110e');
        this.scene.fog = null;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#14110e' }));
        m.position.y = -0.3; this.topFloor = m; this.scene.add(m);
      }
    } else if (this.topBg) {
      if (this.scene.background?.isColor) this.scene.background = this.topBg.bg;
      if (!this.scene.fog) this.scene.fog = this.topBg.fog;
      this.topBg = null;
      if (this.topFloor) { this.scene.remove(this.topFloor); this.topFloor = null; }
    }
    this.shell?.traverse(o => { if (o.isMesh && (o.material === this.ceilMat || o.userData.ceiling)) o.visible = !hide; });
    for (const o of this.items.children) if (o.userData.item?.place === 'ceiling' || o.userData.kind === 'bareBulb') o.visible = !hide;
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
  // 画面の上での、家具の四角い範囲（指1本ぶん広げる）に入っているか
  screenRect(o) {
    const bb = this.boxOf(o), r = this.canvas.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, front = false;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      if (v.z < 1) front = true;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return front ? { x0, y0, x1, y1 } : null;
  }
  nearSelected(cx, cy, pad = 28) {
    const o = this.selected && this.objByUid?.[this.selected];
    const q = o && this.screenRect(o);
    return !!q && cx > q.x0 - pad && cx < q.x1 + pad && cy > q.y0 - pad && cy < q.y1 + pad;
  }
  // つかんだ所と家具の中心のずれ（床・天井の物）。指の下に家具がついてくるように
  grabOffset(cx, cy) {
    const o = this.selected && this.objByUid?.[this.selected], p = o?.userData.p, item = o?.userData.item;
    if (!o || !item || item.place === 'wall' || p.on != null) return null;
    const planeY = item.place === 'ceiling' ? this.boxOf(o).max.y : 0;
    const hit = this.ray(cx, cy).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3());
    if (!hit || hit.distanceTo(this.camera.position) > 30) return null;
    const dx = hit.x - (p.x || 0), dz = hit.z - (p.z || 0);
    return Math.hypot(dx, dz) < 1.5 ? { dx, dz } : null;
  }
  // 矢印ボタンで少しずつ動かす（1.12.0）。right / up は画面の向き（右・奥（壁の物は上））。step はメートル
  nudgeSelected(right, up, step = 0.05) {
    const o = this.selected && this.objByUid?.[this.selected];
    if (!o) return false;
    const p = o.userData.p, item = o.userData.item, before = { ...p };
    if (item.place === 'wall') {
      const seg = this.sh.walls.find(w => w.id === p.wall);
      // 壁の右向き：カメラから見て右が、壁の a の増える向きか
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const along = seg?.axis === 'z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const sgn = camRight.dot(along) >= 0 ? 1 : -1;
      p.a = (p.a || 0) + right * step * sgn;
      p.y = (p.y || 1.5) + up * step;
    } else {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); f.y = 0;
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
      const rt = new THREE.Vector3(-f.z, 0, f.x);
      p.x = (p.x || 0) + (rt.x * right + f.x * up) * step;
      p.z = (p.z || 0) + (rt.z * right + f.z * up) * step;
      // 棚・テーブルの上の物は、その上からはみ出さない
      const sup = p.on != null && this.objByUid?.[p.on];
      if (sup) { const sb = this.boxOf(sup); if (p.x < sb.min.x + 0.03 || p.x > sb.max.x - 0.03 || p.z < sb.min.z + 0.03 || p.z > sb.max.z - 0.03) { Object.assign(p, before); return false; } }
      const ft = typeof p.on === 'string' && (this.fixTops || []).find(t => t.id === p.on);
      if (ft && (p.x < ft.x0 || p.x > ft.x1 || p.z < ft.z0 || p.z > ft.z1)) { Object.assign(p, before); return false; }
    }
    this.mountPlaced(o, p);
    if (!this.checkPlacement(o)) { Object.assign(p, before); if (before.on == null) { delete p.on; } this.mountPlaced(o, p); this.selBox && this.selBox.update(); return false; }
    if (item.place !== 'wall') this.moveRiders(p.uid, p.x - before.x, p.z - before.z);
    this.updateBlob(o);
    this.selBox && this.selBox.update();
    return true;
  }
  // 選んだ家具のほうを向く（一覧からえらんだ時）
  focusSelected() {
    const o = this.selected && this.objByUid?.[this.selected];
    if (!o || this.topView) return;
    this.lookAt(this.boxOf(o).getCenter(new THREE.Vector3()));
  }
  // 指の位置まで、選んでいる家具を動かす
  dragSelectedTo(cx, cy) {
    const o = this.objByUid?.[this.selected];
    if (!o) return;
    const p = o.userData.p, item = o.userData.item;
    const ray = this.ray(cx, cy).ray;
    if (item.place === 'wall') {
      // 壁の面と交わる所（いちばん近い壁）
      let best = null;
      const sh = this.sh;
      for (const seg of sh.walls) {
        const n = seg.axis === 'z' ? new THREE.Vector3(0, 0, seg.n) : new THREE.Vector3(seg.n, 0, 0);
        const plane = new THREE.Plane(n, -seg.n * seg.c);
        const hit = ray.intersectPlane(plane, new THREE.Vector3());
        if (!hit) continue;
        const dist = hit.distanceTo(ray.origin);
        const al = seg.axis === 'z' ? hit.x : hit.z;
        const inside = al >= seg.a0 - 0.01 && al <= seg.a1 + 0.01 && hit.y > 0 && hit.y < ceilAt(sh, hit.x);
        if (inside && (!best || dist < best.dist)) best = { w: seg.id, axis: seg.axis, hit, dist };
      }
      if (!best) return;
      p.wall = best.w;
      p.a = best.axis === 'z' ? best.hit.x : best.hit.z;
      p.y = best.hit.y;
    } else {
      // 指の下に、物をのせられる家具の段（棚の板・テーブルの上）があれば、そこに置く。なければ床。
      // 段の高さの水平な面と指の光線が、その家具の上（真上から見た範囲）で交わる所のうち、いちばん手前
      this.levelHint = undefined;
      let top = null;
      if (Room3D.canStack(item)) {
        const ob = this.boxOf(o), h = ob.max.y - ob.min.y;
        let best = Infinity;
        for (const x of this.items.children) {
          if (x === o || !x.userData.uid || !x.visible || !Room3D.isSupport(x.userData.item) || x.userData.p?.on === p.uid) continue;
          const sb = this.boxOf(x);
          for (const y of this.stackLevels(x, h)) {
            const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
            if (!hit || hit.x < sb.min.x + 0.02 || hit.x > sb.max.x - 0.02 || hit.z < sb.min.z + 0.02 || hit.z > sb.max.z - 0.02) continue;
            const d = hit.distanceTo(ray.origin);
            if (d < best) { best = d; top = hit; }
          }
        }
      }
      if (Room3D.canStack(item) && !Room3D.isSupport(item)) {
        let best = top ? top.distanceTo(ray.origin) : Infinity;
        for (const t of this.fixTops || []) {
          const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -t.y), new THREE.Vector3());
          if (!hit || hit.x < t.x0 || hit.x > t.x1 || hit.z < t.z0 || hit.z > t.z1) continue;
          const d = hit.distanceTo(ray.origin);
          if (d < best) { best = d; top = hit; }
        }
      }
      if (top) { p.x = top.x; p.z = top.z; this.levelHint = top.y; }
      else if (p.on && Room3D.canStack(item) && this.items.children.some(x => x !== o && x.userData.uid && x.visible && Room3D.isSupport(x.userData.item) && ray.intersectsBox(this.boxOf(x)))) {
        // 棚にのっている物を、棚の段と段の間（前の板など）の上で動かしているあいだは、床に落とさずその場で待つ
        return;
      } else {
        // 天井の物は天井の高さ、ほかは床の高さで、指の光線と交わる所（1.12.0：天井の物は前は床で計算していて、見上げると動かなかった）
        const planeY = item.place === 'ceiling' ? this.boxOf(o).max.y : 0;
        const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3());
        if (!hit || hit.distanceTo(ray.origin) > 30) return;
        const g = this.itemDrag?.grab;
        p.x = hit.x - (g?.dx || 0); p.z = hit.z - (g?.dz || 0);
      }
    }
    this.mountPlaced(o, p);
    const ok = this.checkPlacement(o);
    this.updateBlob(o);
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
      if (rp && rp.on === uid) { rp.x += dx; rp.z += dz; this.mountPlaced(r, rp); this.updateBlob(r); }
    }
  }
  markValid(ok) {
    if (this.selBox) this.selBox.material.color.set(ok ? 0xffcf7a : 0xff5a4a);
  }
  // 指をはなしたとき：重なっていたら最後の正しい位置へもどす
  endDrag() {
    const o = this.objByUid?.[this.selected];
    this.levelHint = undefined;
    if (!o) return;
    const p = o.userData.p;
    if (!this.checkPlacement(o)) {
      const last = this.lastValid?.[p.uid];
      if (last) { Object.assign(p, last); if (!last.on) { delete p.on; delete p.y; } this.mountPlaced(o, p); }
      this.onInvalid && this.onInvalid();
    }
    this.markValid(true);
    this.updateBlob(o);
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
    if (o) { this.items.remove(o); freeTree(o); }
    const b = this.blobs?.children.find(x => x.userData.uid === uid);
    if (b) { this.blobs.remove(b); freeTree(b); }
    delete this.objByUid[uid];
    if (this.selected === uid) this.select(null);
    this.updateLights();
  }
  async addPlaced(p, auto = false) {
    const o = await this.placeOne(p, true);
    if (!o) return null;
    if (!(auto && this.autoPlace(o)) && !this.findFreeSpot(o)) { this.removeObject(p.uid); return null; }
    this.updateBlob(o); // 置き場所をさがした時に試した所の影を残さない
    o.userData.baseY = o.position.y;
    this.updateLights();
    this.lookAt(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
    return o;
  }

  // 買う前のおためし：決まった配置の場所に、実際に置いて見せる（まだ持ち物にも記録にも入れない）
  async showPreview(item) {
    this.clearPreview();
    const tok = (this.previewTok = {});
    const o = await this.addPlaced({ uid: '__preview', item: item.id }, true);
    if (this.previewTok !== tok) { if (o) this.removeObject('__preview'); return null; }
    if (!o) return null;
    this.preview = o;
    // 下半分は買う画面でかくれるので、家具が画面の上のほうに見えるよう、少し下をねらう
    const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    this.lookAt(new THREE.Vector3(c.x, c.y - 1.0, c.z));
    this.select('__preview'); // まわりに枠を出して、どこに置かれるか分かるように
    return o.userData.p;
  }
  clearPreview(keepSurf = false) {
    if (!keepSurf && this.surfPreview) this.previewSurfaceItem(null);
    this.previewTok = null;
    if (this.objByUid?.['__preview']) { this.removeObject('__preview'); }
    this.preview = null;
  }
  // おためしを、そのまま本当に置いた物にする（uid をつけかえる）
  commitPreview(uid) {
    const o = this.objByUid?.['__preview'];
    if (!o) return null;
    if (this.selected === '__preview') this.select(null);
    delete this.objByUid['__preview'];
    o.userData.uid = uid; o.userData.p.uid = uid;
    this.objByUid[uid] = o;
    const b = this.blobs?.children.find(x => x.userData.uid === '__preview');
    if (b) b.userData.uid = uid;
    this.preview = null;
    return o.userData.p;
  }

  // 新しく買った物を置く場所の候補（見ている方向の、空いていそうな所）
  suggestPlacement(item) {
    const sh = this.sh;
    const cam = this.camera.position;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (item.place === 'wall') {
      // 見ている方向の壁（目の前でいちばん近い壁）
      let best = null;
      for (const seg of sh.walls) {
        const pc = seg.axis === 'z' ? cam.z : cam.x, fd = seg.axis === 'z' ? fwd.z : fwd.x;
        if (Math.abs(fd) < 1e-3) continue;
        const t = (seg.c - pc) / fd;
        if (t <= 0.05) continue;
        const al = seg.axis === 'z' ? cam.x + fwd.x * t : cam.z + fwd.z * t;
        if (al < seg.a0 - 0.01 || al > seg.a1 + 0.01) continue;
        if (!best || t < best.t) best = { t, seg, al };
      }
      if (!best) return { wall: '-z', a: 0, y: 1.6 };
      const al = clamp(best.al, best.seg.a0 + 0.3, best.seg.a1 - 0.3);
      return { wall: best.seg.id, a: al, y: Math.min(1.6, ceilAt(sh, best.seg.axis === 'z' ? al : best.seg.c) - 0.6) };
    }
    const base = { x: cam.x + fwd.x * 1.6, z: cam.z + fwd.z * 1.6, rot: Math.round(Math.atan2(-fwd.x, -fwd.z) / (Math.PI / 4)) * (Math.PI / 4) };
    // ほかの家具・備え付けの物と重なっていたら、少しずつずらす
    const taken = [...this.items.children.map(o => new THREE.Box3().setFromObject(o)), ...(this.solids || []).filter(s => s.block === 'all').map(s => s.box)];
    for (let r = 0; r < 8; r++) {
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4;
        const x = base.x + Math.cos(ang) * r * 0.5, z = base.z + Math.sin(ang) * r * 0.5;
        if (Math.abs(x) > sh.hw - 0.3 || Math.abs(z) > sh.hd - 0.3) continue;
        const pt = new THREE.Vector3(x, 0.3, z);
        if (!taken.some(b => b.clone().expandByScalar(0.15).containsPoint(pt))) return { ...base, x, z };
      }
    }
    return { ...base, x: clamp(base.x, -sh.hw + 0.5, sh.hw - 0.5), z: clamp(base.z, -sh.hd + 0.5, sh.hd - 0.5) };
  }

  // 写真：画面の文字を消した状態で、今の部屋を1枚
  capture() {
    if (this.selBox) this.selBox.visible = false;
    if (this.marker) this.marker.visible = false;
    this.renderer.shadowMap.needsUpdate = true;
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
    this.setStars(m.photo === 'night' && weatherToday() === 'sunny');
    this.setRain(weatherToday() === 'rain');
    if (this.sh && this.items) this.updateLights(); // 時間帯で、照明の影を出す／出さないが変わる
  }
  // 夜だけ、窓の外にまたたく星
  // 雨の日：家のまわりに雨つぶ（部屋の中には降らない）
  setRain(on) {
    if (on && !this.rain) {
      const N = 1400, pos = new Float32Array(N * 6), seeds = [];
      for (let i = 0; i < N; i++) seeds.push(this.rainSpot({}));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.35, depthWrite: false }));
      this.rain.userData.seeds = seeds;
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = !!on;
  }
  rainSpot(d, top = false) {
    const sh = this.sh || { hw: 2, hd: 2 };
    for (let k = 0; k < 20; k++) {
      d.x = (Math.random() - 0.5) * 30; d.z = (Math.random() - 0.5) * 30 - 6;
      if (Math.abs(d.x) > sh.hw + 0.4 || Math.abs(d.z) > sh.hd + 0.4) break;
    }
    d.y = top ? 12 : Math.random() * 12 - 2; d.v = 9 + Math.random() * 4;
    return d;
  }
  updateRain(dt) {
    const r = this.rain; if (!r || !r.visible) return;
    const a = r.geometry.attributes.position.array, seeds = r.userData.seeds;
    for (let i = 0; i < seeds.length; i++) {
      const d = seeds[i];
      d.y -= d.v * dt;
      if (d.y < -3) this.rainSpot(d, true);
      a[i * 6] = d.x; a[i * 6 + 1] = d.y; a[i * 6 + 2] = d.z;
      a[i * 6 + 3] = d.x - 0.02; a[i * 6 + 4] = d.y + 0.35; a[i * 6 + 5] = d.z;
    }
    r.geometry.attributes.position.needsUpdate = true;
  }
  setStars(on) {
    if (on && !this.stars) {
      const n = 1400, pos = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n);
      let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < n; i++) {
        const az = rnd() * Math.PI * 2, el = Math.asin(0.06 + rnd() * 0.94); // 地平線より上
        const r = 380;
        pos.set([Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r], i * 3);
        seed[i] = rnd() * 10; size[i] = 1.2 + Math.pow(rnd(), 4) * 4.5;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('size', new THREE.BufferAttribute(size, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPR: { value: this.renderer.getPixelRatio() } },
        vertexShader: `attribute float seed; attribute float size; uniform float uTime; uniform float uPR; varying float vA;
          void main(){ vA = 0.55 + 0.45 * sin(uTime * (1.2 + fract(seed) * 2.5) + seed * 6.0);
            gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
            float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * vA * 1.6, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      this.stars = new THREE.Points(g, mat);
      this.stars.frustumCulled = false;
      this.stars.renderOrder = -1;
      this.scene.add(this.stars);
    }
    if (this.stars) this.stars.visible = on;
  }

  async buildShell() {
    const sh = this.sh;
    const { w: RW, d: RD, h: H, hw: HW, hd: HD } = sh;
    const ps = this.previewSurf;
    const wallI = this.surfItem('wall'), floorI = this.surfItem('floor');
    const wallSrc = ps?.wall || wallI?.src, floorSrc = ps?.floor || floorI?.src;
    const plainWall = new THREE.MeshStandardMaterial({ color: '#e8e2d8', roughness: 0.95 });
    const plainFloor = new THREE.MeshStandardMaterial({ color: '#a8927a', roughness: 0.8 });
    const [wallM, floorM, ceilM, fixtures] = await Promise.all([
      wallSrc ? (wallSrc.tex ? texturedMaterial(wallSrc.tex, { rep: wallSrc.rep, tint: wallSrc.tint }) : new THREE.MeshStandardMaterial({ color: wallSrc.color || '#e8e2d8', roughness: 0.92 })) : plainWall,
      floorSrc?.tex ? texturedMaterial(floorSrc.tex, { rep: floorSrc.rep || 3, tint: floorSrc.tint }) : (floorSrc?.color ? new THREE.MeshStandardMaterial({ color: floorSrc.color, roughness: 0.7 }) : plainFloor),
      new THREE.MeshStandardMaterial({ color: sh.ceil, roughness: 0.95 }),
      // 備え付けの物（浴槽・キッチンなど）
      Promise.all(sh.built.map(b => buildFixture(b, sh, this.st?.fix?.[b.kind], this.fixShape(b.kind)).catch(e => { console.warn('fixture', b.kind, e); return null; }))),
    ]);
    if (this.sh !== sh) return; // 作っているあいだに別の部屋へ移った
    // 天井は下からの照り返しが少ないので、ほんのり明るくしておく
    ceilM.emissive = new THREE.Color(this.mood.hemiGround).multiplyScalar(0.35);
    if (!wallSrc?.tex) wallM.userData.rep = 1;
    ceilM.userData.rep = 1;
    this.ceilMat = ceilM;
    if (!floorSrc?.tex) floorM.userData.rep = 1;
    const darkWall = new THREE.Color(wallM.color).getHSL({}).l < 0.35 || /concrete|black/.test(wallSrc?.tex || '');
    const wallV = { name: darkWall ? '黒' : '' };

    const g = this.shell;
    clearFree(g);
    const box = (w, h, d, x, y, z, mat, fw, fh) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fitMaterial(mat, fw ?? w, fh ?? h));
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // 床
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), fitMaterial(floorM, RW, RD));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    // 床の下に、壁の外までひとまわり大きい床をもう1枚。ドアの下（壁の厚み）などのすき間から、外の芝生が見えないように
    const under = new THREE.Mesh(new THREE.PlaneGeometry(RW + 1.2, RD + 1.2), fitMaterial(floorM, RW + 1.2, RD + 1.2));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.004; under.receiveShadow = true; g.add(under);
    // 天井（屋根裏は、途中から斜めに下がる）
    if (!sh.slope) box(RW + 0.4, WALL_T, RD + 0.4, 0, H + WALL_T / 2, 0, ceilM, RW, RD);
    else this.makeSlope(g, ceilM);

    // 壁：壁ごとに、窓とドアの穴をあけて箱を並べる
    const piece = (seg, a0, a1, y0, y1) => {
      // 斜めの天井の下の壁は、天井の上に突き出さないように低くする（天窓から見えるので）
      if (sh.slope && seg.axis === 'x' && seg.c > sh.slope.start) y1 = Math.min(y1, ceilAt(sh, seg.c) + WALL_T + 0.02);
      if (sh.slope && seg.axis === 'z' && a1 > sh.slope.start + 0.01) {
        const st = sh.slope.start;
        if (a0 < st) { piece(seg, a0, st, y0, y1); a0 = st; }
        for (let x = a0; x < a1 - 1e-4; x += 0.2) {
          const x2 = Math.min(a1, x + 0.2);
          const top = Math.min(y1, ceilAt(sh, x) + WALL_T + 0.02);
          if (top > y0) piece2(seg, x, x2, y0, top);
        }
        return;
      }
      piece2(seg, a0, a1, y0, y1);
    };
    const piece2 = (seg, a0, a1, y0, y1) => {
      const len = a1 - a0, hgt = y1 - y0;
      if (len < 0.002 || hgt < 0.002) return;
      const am = (a0 + a1) / 2, ym = (y0 + y1) / 2, off = seg.c - seg.n * WALL_T / 2;
      if (seg.axis === 'z') box(len, hgt, WALL_T, am, ym, off, wallM, len, hgt);
      else box(WALL_T, hgt, len, off, ym, am, wallM, len, hgt);
    };
    for (const seg of sh.walls) {
      const lo = seg.a0 - (seg.e0 ? WALL_T + 0.01 : 0), hi = seg.a1 + (seg.e1 ? WALL_T + 0.01 : 0);
      let cur = lo;
      for (const o of openingsOn(sh, seg.id)) {
        const l = o.a - o.w / 2, r = o.a + o.w / 2;
        piece(seg, cur, l, 0, H);
        piece(seg, l, r, 0, o.y0);
        piece(seg, l, r, o.y1, H);
        cur = r;
      }
      piece(seg, cur, hi, 0, H);
    }

    // 幅木（壁の下の板）。床までの開口（ドア・大きな窓）のところはなし
    const skirt = new THREE.MeshStandardMaterial({ color: wallV && /黒|コンクリ/.test(wallV.name) ? '#2b2724' : '#efe9df', roughness: 0.6 });
    for (const seg of sh.walls) {
      let cur = seg.a0;
      const sk = (a0, a1) => {
        if (a1 - a0 < 0.01) return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(seg.axis === 'z' ? a1 - a0 : 0.015, 0.08, seg.axis === 'z' ? 0.015 : a1 - a0), skirt);
        m.position.copy(segPoint(seg, (a0 + a1) / 2, 0.04, 0.008)); m.receiveShadow = true; g.add(m);
      };
      for (const o of openingsOn(sh, seg.id).filter(o => o.y0 < 0.1)) { sk(cur, o.a - o.w / 2); cur = o.a + o.w / 2; }
      sk(cur, seg.a1);
    }

    // 窓（1つ目の窓は選んだデザイン・カーテン付き）
    const winI = this.surfItem('window');
    for (const wd of sh.windows) {
      const seg = segOf(sh, wd.wall);
      if (!seg) continue;
      const wg = new THREE.Group();
      this.makeWindow(wg, wd, winI);
      putOnWall(wg, seg, wd.a);
      g.add(wg);
    }
    const curI = this.surfItem('curtain');
    const mainWin = sh.windows[0];
    if (curI?.src?.curtain && !mainWin.open) {
      const cg = makeCurtain(curI.src.curtain, mainWin);
      putOnWall(cg, segOf(sh, mainWin.wall), mainWin.a);
      g.add(cg);
    }
    // 窓の上のひさし（家の外）
    const eave = new THREE.Mesh(new THREE.BoxGeometry(Math.max(9, RW + 3), 0.12, 0.9), new THREE.MeshStandardMaterial({ color: '#5b5550', roughness: 0.7 }));
    eave.position.set(0, H + 0.18, -HD - 0.48); eave.castShadow = true; eave.receiveShadow = true;
    g.add(eave);

    // ドア
    const doorI = this.surfItem('door');
    const dseg = segOf(sh, sh.door.wall);
    let door = null;
    try { door = doorI?.src?.proc ? buildProc(doorI.src.proc) : null; } catch (e) { console.warn('door', e); }
    if (door) {
      door.position.set(0, 0, -0.03);
      shadowAll(door);
    } else door = makeDoor(darkWall ? '#3a3633' : '#ddd5c8');
    const dg = new THREE.Group(); dg.add(door);
    // ドアのうしろをふさぐ板：扉と枠のすき間から外（裏側）が見えないように
    const back = new THREE.Mesh(new THREE.BoxGeometry(sh.door.w + 0.02, sh.door.h + 0.02, WALL_T - 0.07), new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.9 }));
    back.position.set(0, (sh.door.h + 0.02) / 2 - 0.01, -0.07 - (WALL_T - 0.07) / 2);
    dg.add(back);
    // ドアの下の敷居（壁の厚みの床。木の板）
    const sill = new THREE.Mesh(new THREE.BoxGeometry(sh.door.w + 0.06, 0.018, WALL_T + 0.04), new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 0.6 }));
    sill.position.set(0, 0.009, -WALL_T / 2); sill.receiveShadow = true;
    dg.add(sill);
    dg.traverse(o => { if (o.isMesh) o.userData.door = true; });
    putOnWall(dg, dseg, sh.door.a);
    this.door = dg;
    g.add(dg);
    // スイッチ・コンセント・エアコン・天井の縁
    g.add(makeFixtures(sh, skirt.color, { shape: this.fixShape('aircon'), variant: this.st?.fix?.aircon }));
    this.floorMesh = floor;
    floor.userData.floor = true;

    // 備え付けの物と、家具を置けない所
    this.solids = [];
    if (sh.notch) {
      const nt = sh.notch;
      this.solids.push({ block: 'all', box: new THREE.Box3(new THREE.Vector3(nt.x0, -1, nt.z0), new THREE.Vector3(nt.x1, H + 1, nt.z1)) });
    }
    this.shellTicks = fixtures.filter(f => f?.obj.userData.tick).map(f => f.obj.userData.tick);
    for (const f of fixtures) {
      if (!f) continue;
      g.add(f.obj);
      f.obj.updateMatrixWorld(true);
      const solid = { block: f.block, box: new THREE.Box3().setFromObject(f.obj), kind: f.obj.userData.fixture };
      // 小物をのせられる天板（洗面台・キッチン・洗たく機の上など）。roomfix.js の userData.tops（その物の向きの長方形）を部屋の向きに直す
      solid.tops = (f.obj.userData.tops || []).map(t => {
        const a = new THREE.Vector3(t.x0, t.y, t.z0).applyMatrix4(f.obj.matrixWorld), b = new THREE.Vector3(t.x1, t.y, t.z1).applyMatrix4(f.obj.matrixWorld);
        return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), y: +a.y.toFixed(3) };
      });
      this.solids.push(solid);
    }
    this.fixTops = this.solids.flatMap((sd, si) => (sd.tops || []).map((t, ti) => ({ ...t, id: `fix:${sd.kind}:${si}:${ti}`, solid: sd })));
    // 備え付けの形が変わったら、天板にのっている小物の高さを合わせなおす
    for (const o of this.items?.children || []) this.refitFixRider(o.userData.p, o);

    // 家の外（別荘は海辺。2階の部屋は3m上から見る）
    const level = this.roomDef.level || 0;
    const home = this.roomDef.home || 'main';
    const key = this.mood.photo + level + home;
    const placeExt = () => { if (this.exterior) this.exterior.world.position.set(0, -3 * level, 2.5 - this.sh.hd); };
    if (this.extKey !== key) {
      this.extKey = key;
      const mood = this.mood;
      buildExterior(mood, level, home).then((ext) => {
        if (this.extKey !== key) return;
        if (this.exterior) { this.scene.remove(this.exterior.world); freeTree(this.exterior.world); }
        this.exterior = ext;
        this.scene.add(ext.world);
        placeExt();
      });
    } else placeExt();
    // 光の筋とほこり
    this.makeRays();
  }

  // 窓1つ（壁の内側の面が z=0、部屋の中が +z の向きで作る）
  makeWindow(wg, wd, winI) {
    const ww = wd.w, wh = wd.y1 - wd.y0, ym = (wd.y0 + wd.y1) / 2;
    const frameM = new THREE.MeshStandardMaterial({ color: wd.open ? '#9a7652' : '#ece6dc', roughness: 0.45 });
    const fr = (w, h, x, y, d = 0.07, z = -0.02) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameM); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; wg.add(m); };
    if (wd.open) {
      // ガラスなしの大きな開口（露天風呂）：木の枠だけ
      fr(ww + 0.16, 0.08, 0, wd.y1 + 0.04, WALL_T + 0.06, -WALL_T / 2);
      fr(0.08, wh, -ww / 2 - 0.04, ym, WALL_T + 0.06, -WALL_T / 2); fr(0.08, wh, ww / 2 + 0.04, ym, WALL_T + 0.06, -WALL_T / 2);
      fr(ww + 0.16, 0.05, 0, wd.y0 - 0.025, WALL_T + 0.12, -WALL_T / 2 + 0.03);
      return;
    }
    let made = false;
    if (winI?.src?.proc) {
      // 大きな窓は、同じデザインの窓を横に並べる
      const n = Math.max(1, Math.round(ww / 2.2));
      for (let i = 0; i < n; i++) {
        let win = null;
        try { win = buildProc(winI.src.proc); } catch (e) { console.warn('window', e); }
        if (!win) break;
        win.scale.set(ww / n / 2.2, wh / 1.75, 1);
        win.position.set(-ww / 2 + (i + 0.5) * ww / n, ym, -0.03);
        shadowAll(win); wg.add(win); made = true;
      }
    }
    if (made) return;
    fr(ww + 0.08, 0.05, 0, wd.y0); fr(ww + 0.08, 0.05, 0, wd.y1);
    fr(0.05, wh, -ww / 2, ym); fr(0.05, wh, ww / 2, ym);
    fr(0.04, wh, 0, ym);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.2, 0.04, 0.22), frameM);
    sill.position.set(0, wd.y0 - 0.02, 0.06); sill.castShadow = sill.receiveShadow = true; wg.add(sill);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.08 }));
    glass.position.set(0, ym, -0.03); wg.add(glass);
  }

  // 屋根裏の天井：平らな所と、+x の壁へ下がる斜めの面（天窓つき）
  makeSlope(g, ceilM) {
    const sh = this.sh, s = sh.slope, H = sh.h;
    const add = (parent, w, h, d, x, y, z, mat, fw, fh) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fitMaterial(mat, fw ?? w, fh ?? d));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData.ceiling = true; parent.add(m); return m;
    };
    const flatW = s.start + sh.hw + 0.2;
    add(g, flatW, WALL_T, sh.d + 0.4, (-sh.hw - 0.2 + s.start) / 2, H + WALL_T / 2, 0, ceilM);
    const run = sh.hw - s.start, drop = H - s.low;
    const L = Math.hypot(run, drop) + 0.35;
    const slab = new THREE.Group();
    slab.position.set(s.start, H, 0);
    slab.rotation.z = -Math.atan2(drop, run);
    g.add(slab);
    const z0 = -sh.hd - 0.2, z1 = sh.hd + 0.2, T = WALL_T;
    const k = sh.skylight;
    if (!k) add(slab, L, T, z1 - z0, L / 2, T / 2, 0, ceilM);
    else {
      const uc = k.u * (L - 0.35), u0 = uc - k.len / 2, u1 = uc + k.len / 2, w0 = k.z - k.wid / 2, w1 = k.z + k.wid / 2;
      add(slab, u0, T, z1 - z0, u0 / 2, T / 2, 0, ceilM);
      add(slab, L - u1, T, z1 - z0, (u1 + L) / 2, T / 2, 0, ceilM);
      add(slab, k.len, T, w0 - z0, uc, T / 2, (z0 + w0) / 2, ceilM);
      add(slab, k.len, T, z1 - w1, uc, T / 2, (w1 + z1) / 2, ceilM);
      // 天窓の枠とガラス
      const fm = new THREE.MeshStandardMaterial({ color: '#f0ece4', roughness: 0.5 });
      add(slab, k.len, T + 0.06, 0.04, uc, T / 2 - 0.03, w0 + 0.02, fm);
      add(slab, k.len, T + 0.06, 0.04, uc, T / 2 - 0.03, w1 - 0.02, fm);
      add(slab, 0.04, T + 0.06, k.wid, u0 + 0.02, T / 2 - 0.03, k.z, fm);
      add(slab, 0.04, T + 0.06, k.wid, u1 - 0.02, T / 2 - 0.03, k.z, fm);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(k.len - 0.08, k.wid - 0.08),
        new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      glass.rotation.x = -Math.PI / 2; glass.position.set(uc, T * 0.6, k.z); slab.add(glass);
    }
  }

  makeRays() {
    clearFree(this.fx);
    const d = this.sunDir;
    const HD = this.sh.hd;
    const WINDOW = this.sh.windows[0];
    if (WINDOW.wall !== '-z') { this.dust = null; return; }
    const x0 = WINDOW.a - WINDOW.w / 2, x1 = WINDOW.a + WINDOW.w / 2;
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
    const sh = this.sh;
    const bx = clamp(sh.cam[0] + 0.4, -sh.hw + 0.5, sh.hw - 0.5), bz = clamp(sh.cam[1] - 0.9, -sh.hd + 0.5, sh.hd - 0.5);
    const H = ceilAt(sh, bx);
    bulb.position.set(bx, H - 0.45, bz);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.4), new THREE.MeshStandardMaterial({ color: '#222' }));
    cord.position.set(bx, H - 0.22, bz);
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
// 壁の内側の面が z=0、部屋の中が +z、ドアの中心が x=0 の向きで作る
function makeDoor(color) {
  const g = new THREE.Group();
  const DW = 0.86, DH = 2.05;
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  // 枠
  const frame = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL_T + 0.04), paint); m.position.set(x, y, -WALL_T / 2); m.castShadow = m.receiveShadow = true; g.add(m); };
  frame(0.05, DH + 0.05, DW / 2 + 0.02, DH / 2);
  frame(0.05, DH + 0.05, -DW / 2 - 0.02, DH / 2);
  frame(DW + 0.14, 0.05, 0, DH + 0.02);
  // 扉の板（ふちの溝つき）
  // 扉は枠に少し食いこむ大きさにして、まわりにすき間ができないようにする
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.01, DH + 0.02, 0.04), paint);
  leaf.position.set(0, (DH + 0.02) / 2, -0.03); leaf.castShadow = leaf.receiveShadow = true;
  g.add(leaf);
  const groove = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.6 });
  for (const [w, h, y] of [[DW - 0.24, 0.9, 1.45], [DW - 0.24, 0.8, 0.55]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), groove);
    p.position.set(0, y, -0.008); g.add(p);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, h - 0.03, 0.008), paint);
    p2.position.set(0, y, -0.006); g.add(p2);
  }
  // レバーハンドル
  const metal = new THREE.MeshStandardMaterial({ color: '#b9b6b0', metalness: 1, roughness: 0.25 });
  const hx = DW / 2 - 0.08;
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 24), metal);
  rose.rotation.x = Math.PI / 2; rose.position.set(hx, 0.95, -0.004); g.add(rose);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), metal);
  lever.position.set(hx - 0.05, 0.95, 0.035); lever.castShadow = true; g.add(lever);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 12), metal);
  neck.rotation.x = Math.PI / 2; neck.position.set(hx, 0.95, 0.018); g.add(neck);
  // ちょうつがい
  for (const y of [0.25, 1.8]) {
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.012), metal);
    hg.position.set(-DW / 2 + 0.005, y, 0.002); g.add(hg);
  }
  // 敷居
  const sill = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.1, 0.012, WALL_T + 0.04), new THREE.MeshStandardMaterial({ color: '#8b735a', roughness: 0.5 }));
  sill.position.set(0, 0.006, -WALL_T / 2); sill.receiveShadow = true; g.add(sill);
  return g;
}

// スイッチ・コンセント・エアコン・天井の縁（廻り縁）
function makeFixtures(sh, trimColor, acOpt = {}) {
  const g = new THREE.Group();
  const H = sh.h;
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 });
  // 壁に付ける小物（壁の id と、壁にそった位置）
  const onWall = (mesh, wall, a, y) => {
    const seg = segOf(sh, wall);
    if (!seg) return null;
    const o = new THREE.Group(); o.add(mesh);
    putOnWall(o, seg, a, y);
    g.add(o); return o;
  };
  // 開口や備え付けの物と重ならないか
  const free = (wall, a, y) => {
    const seg = segOf(sh, wall);
    if (!seg || a < seg.a0 + 0.15 || a > seg.a1 - 0.15) return false;
    if (openingsOn(sh, wall).some(o => Math.abs(o.a - a) < o.w / 2 + 0.15 && y > o.y0 - 0.15 && y < o.y1 + 0.15)) return false;
    return !sh.built.some(b => b.wall === wall && (b.a0 !== undefined ? a > b.a0 - 0.2 && a < b.a0 + b.len + 0.2 : Math.abs((b.a ?? 0) - a) < 0.8));
  };
  // 照明スイッチ（ドアの横）
  const sw = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.008), white); plate.position.z = 0.004; sw.add(plate);
  for (const y of [0.022, -0.022]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), grey); r.position.set(0, y, 0.01); r.rotation.x = y > 0 ? 0.08 : -0.08; sw.add(r);
  }
  const D = sh.door;
  const swA = free(D.wall, D.a - D.w / 2 - 0.22, 1.2) ? D.a - D.w / 2 - 0.22 : D.a + D.w / 2 + 0.22;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.04), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.z = 0.02; sw.add(hit);
  sw.traverse(o => { o.userData.lightSwitch = true; });
  onWall(sw, D.wall, swA, 1.2);
  if (sh.plain) return g;
  // コンセント
  const outlet = () => {
    const o = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.115, 0.007), white); p.position.z = 0.0035; o.add(p);
    for (const y of [0.025, -0.025]) for (const x of [-0.0065, 0.0065]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.011, 0.002), dark); slot.position.set(x, y, 0.0075); o.add(slot);
    }
    return o;
  };
  let outs = sh.outlets;
  if (!outs) {
    outs = [];
    for (const id of ['+z', '-x', '+x', '-z']) {
      const seg = segOf(sh, id);
      const a = [0.3, 0.7, 0.5].map(f => seg.a0 + (seg.a1 - seg.a0) * f).find(a => free(id, a, 0.25));
      if (a !== undefined) outs.push([id, a]);
    }
  }
  for (const [w, a] of outs) onWall(outlet(), w, a, 0.25);
  // エアコン
  if (sh.ac && segOf(sh, sh.ac.wall)) {
    // 形（いつもの・壁かけスリム・木目パネル）と色は模様がえで選べる（roomfix.js の buildAircon）
    const ac = buildAircon(acOpt.shape, acOpt.variant);
    const acY = H - 0.35;
    onWall(ac, sh.ac.wall, sh.ac.a, acY);
    // エアコンの配管カバー
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.07), white);
    putOnWall(pipe, segOf(sh, sh.ac.wall), sh.ac.a - 0.47, acY - 0.05, 0.03); g.add(pipe);
  }
  // 天井の縁（廻り縁）。斜めの天井の下は、平らな所だけ
  const trim = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.6 });
  for (const seg of sh.walls) {
    let a0 = seg.a0, a1 = seg.a1, y = H;
    if (sh.slope) {
      if (seg.axis === 'x') y = ceilAt(sh, seg.c);
      else { a1 = Math.min(a1, sh.slope.start); if (a1 - a0 < 0.1) continue; }
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(seg.axis === 'z' ? a1 - a0 : 0.02, 0.035, seg.axis === 'z' ? 0.02 : a1 - a0), trim);
    m.position.copy(segPoint(seg, (a0 + a1) / 2, y - 0.018, 0.01)); g.add(m);
  }
  // 火災報知器
  const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 32), white);
  const sx = clamp(sh.cam[0] - 1.0, -sh.hw + 0.4, sh.hw - 0.4), sz = clamp(sh.cam[1] - 0.3, -sh.hd + 0.4, sh.hd - 0.4);
  smoke.position.set(sx, ceilAt(sh, sx) - 0.018, sz); g.add(smoke);
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

// 窓 win の前のカーテン（壁の内側の面が z=0、窓の中心が x=0）
function makeCurtain(v, WINDOW) {
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
    m.position.set(cx, (top + bottom) / 2, 0.14);
    m.castShadow = v.opacity >= 0.9; m.receiveShadow = true;
    g.add(m);
  };
  const x0 = -WINDOW.w / 2, x1 = WINDOW.w / 2;
  panel(x0 + 0.05, 0.6, 7);
  panel(x1 - 0.05, 0.6, 7);
  if (v.opacity < 0.7) panel(0, WINDOW.w * 0.9, 16); // レースは窓全体に
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, WINDOW.w + 0.6), new THREE.MeshStandardMaterial({ color: '#3a3330', metalness: 0.6, roughness: 0.4 }));
  rod.rotation.z = Math.PI / 2; rod.position.set(0, top + 0.01, 0.14);
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
