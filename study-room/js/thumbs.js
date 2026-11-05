import { skinThumbURL } from './skins.js';
import { avatarHTML } from './avatars.js';
// 家具のサムネイル（小さな絵）
// - Poly Haven のモデル（色を変えていない物）→ Poly Haven の CDN の画像をそのまま使う
// - 自作家具・色を変えたモデル・質感・単色・カーテン → 小さな 3D 画面で描いて dataURL にする
//   描いた絵はメモリと IndexedDB に覚えておくので、次に開いたときはすぐ出る
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadModel, texturedMaterial, fitMaterial } from './loaders.js';

// 描き方を変えたらここを上げる（古い絵は使われなくなる）
const VER = 'v1';
const SIZE = 256;

// ---------------------------------------------------------------
// CDN の画像
// ---------------------------------------------------------------
export function thumbURL(item) {
  const m = item && item.src && item.src.model;
  if (!m || item.src.tint || item.src.paint) return null;
  return `https://cdn.polyhaven.com/asset_img/thumbs/${m}.png?width=256&height=256`;
}

// ---------------------------------------------------------------
// 覚えておく場所（メモリ＋IndexedDB）
// ---------------------------------------------------------------
const memo = new Map(); // key → Promise<dataURL|null>
const doneURL = new Map(); // key → dataURL（描き終わった物。thumbHTML がすぐ使う）

// src の中身が変わったら別の絵になるように、短い目印を作る
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const keyOf = (item) => `${item.id}@${VER}:${hash(JSON.stringify(item.src || {}))}`;

let dbP = null;
function db() {
  if (!dbP) {
    dbP = new Promise((res) => {
      try {
        const req = indexedDB.open('study-room-thumbs', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('thumbs');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
        req.onblocked = () => res(null);
      } catch { res(null); }
    });
  }
  return dbP;
}
async function idbGet(key) {
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    try {
      const r = d.transaction('thumbs').objectStore('thumbs').get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function idbPut(key, val) {
  const d = await db();
  if (!d) return;
  try { d.transaction('thumbs', 'readwrite').objectStore('thumbs').put(val, key); } catch { /* 入らなくても困らない */ }
}

// ---------------------------------------------------------------
// 順番待ち（1つずつ描く。画面に見えている物を先に）
// ---------------------------------------------------------------
const queue = []; // { key, item, prio, resolve, els? }
let busy = false;

function enqueue(job) {
  queue.push(job);
  pump();
}
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    // いちばん優先度が高い物（同じなら先に来た物）
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].prio > queue[bi].prio) bi = i;
    const job = queue.splice(bi, 1)[0];
    // 一覧から消えた画像のためだけの仕事なら、描かずに飛ばす
    if (job.els && job.els.size && ![...job.els].some((e) => e.isConnected) && !job.wanted) {
      memo.delete(job.key);
      job.resolve(null);
      continue;
    }
    let url = null;
    try { url = await locked(() => drawItem(job.item)); } catch (e) { console.warn('thumb', job.item.id, e); }
    if (url) idbPut(job.key, url);
    else memo.delete(job.key); // 失敗したら次にまた試せるように
    job.resolve(url);
    await new Promise((r) => setTimeout(r, 0)); // 画面の動きを止めないよう少し休む
  }
  busy = false;
}

const jobs = new Map(); // key → job（まだ描いていない物）

// 小さな3D画面は1つしかないので、描くのは1つずつ
let lockP = Promise.resolve();
function locked(fn) { const p = lockP.then(fn, fn); lockP = p.catch(() => {}); return p; }

// ガチャの設計図の演出用：線（segs）・色つきの絵（url）・大きさ（dims, ミリ）
export function blueprintArt(item) {
  if (!item || item.place === 'skin' || item.src?.skin || item.src?.avatar) return Promise.resolve(null);
  return locked(() => drawItem(item, { blueprint: true, size: 512 })).catch(() => null);
}

function request(item, prio, el) {
  const key = keyOf(item);
  if (el) {
    const j = jobs.get(key);
    if (j) { j.els.add(el); j.prio = Math.max(j.prio, prio); }
  } else if (jobs.has(key)) {
    const j = jobs.get(key); j.wanted = true; j.prio = Math.max(j.prio, prio);
  }
  if (!memo.has(key)) {
    memo.set(key, (async () => {
      const saved = await idbGet(key);
      if (saved) return saved;
      return new Promise((resolve) => {
        const job = { key, item, prio, els: new Set(el ? [el] : []), wanted: !el, resolve };
        jobs.set(key, job);
        enqueue(job);
      }).finally(() => jobs.delete(key));
    })().then((url) => { if (url) doneURL.set(key, url); return url; }));
  }
  return memo.get(key);
}

// 描いた絵（dataURL）を返す。描けないときは null
export function renderThumb(item) {
  if (!item) return Promise.resolve(null);
  return request(item, 1, null);
}

// ---------------------------------------------------------------
// HTML に入れる
// ---------------------------------------------------------------
const known = new Map(); // id → item（hydrateThumbs で使う）

// 読み込み中のきらっと光る灰色の四角（SVG のアニメーション）
const SHIMMER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0.3">' +
  '<stop offset="0" stop-color="#8a8580" stop-opacity=".12"/>' +
  '<stop offset=".5" stop-color="#8a8580" stop-opacity=".28"/>' +
  '<stop offset="1" stop-color="#8a8580" stop-opacity=".12"/>' +
  '<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="1.3s" repeatCount="indefinite"/>' +
  '</linearGradient></defs>' +
  '<rect x="14" y="14" width="72" height="72" rx="14" fill="#8a8580" fill-opacity=".12"/>' +
  '<rect x="14" y="14" width="72" height="72" rx="14" fill="url(#g)"/></svg>'
);

const esc = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));

export function thumbHTML(item) {
  if (!item) return '';
  // 着せ替えは、色で描いた小さなスマホの絵
  // プロフィールのアイコン（ガチャの景品）は、アイコンの絵そのもの
  if (item.src?.avatar) return avatarHTML({ avatar: item.src.avatar }, 'thumb avatar-thumb');
  if (item.src?.skin) return `<img class="thumb skin-thumb" src="${skinThumbURL(item.src.skin)}" alt="${esc(item.name || '')}" draggable="false">`;
  const url = thumbURL(item);
  const alt = esc(item.name || '');
  if (url) return `<img class="thumb" src="${url}" alt="${alt}" loading="lazy" decoding="async" draggable="false">`;
  known.set(item.id, item);
  // もう描いてある絵があれば、すぐそれを出す
  const key = keyOf(item);
  const ready = doneURL.get(key);
  if (ready) return `<img class="thumb" src="${ready}" alt="${alt}" draggable="false">`;
  return `<img class="thumb thumb-wait" data-thumb-id="${esc(item.id)}" src="${SHIMMER}" alt="${alt}" draggable="false">`;
}

let io = null;
function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const item = known.get(e.target.dataset.thumbId);
      if (item) request(item, 2, e.target); // 見えた物を先頭へ
      io.unobserve(e.target);
    }
  }, { rootMargin: '150px' });
  return io;
}

function inView(el) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  return r.bottom > -150 && r.top < innerHeight + 150 && r.right > -150 && r.left < innerWidth + 150;
}

// root の中の「まだ描いていない画像」を埋める
export function hydrateThumbs(root = document) {
  const imgs = [...root.querySelectorAll('img[data-thumb-id]')];
  const vis = [], rest = [];
  for (const el of imgs) (inView(el) ? vis : rest).push(el);
  for (const el of [...vis, ...rest]) {
    const item = known.get(el.dataset.thumbId);
    if (!item) continue;
    const near = vis.includes(el);
    if (!near) observer()?.observe(el);
    request(item, near ? 2 : 0, el).then((url) => {
      if (!url) return;
      el.src = url;
      el.classList.remove('thumb-wait');
      el.removeAttribute('data-thumb-id');
      io?.unobserve(el);
    });
  }
}

// ---------------------------------------------------------------
// 小さな 3D 画面（1つだけ作って使い回す）
// ---------------------------------------------------------------
let R = null; // { renderer, scene, camera, key, fill, ground, stage }

function studio() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  // 主な光（左上手前）と、反対側からの弱い光
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  scene.add(fill, fill.target);

  // 床に落ちる影だけを描く板
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const stage = new THREE.Group();
  scene.add(stage);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  R = { renderer, scene, camera, key, fill, ground, stage };
  return R;
}

// ---------------------------------------------------------------
// 物を作る
// ---------------------------------------------------------------
let procMod = null;
async function buildProcObj(spec) {
  if (!procMod) procMod = await import('./procfurn.js');
  return procMod.buildProc(spec);
}

// 材質を複製してから色を変える（元のモデルの材質は共有なのでいじらない）
function recolor(obj, tint, paint) {
  const made = [];
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const conv = (m) => {
      const c = m.clone();
      made.push(c);
      if (paint) { c.map = null; c.color && c.color.set(paint); }
      else if (tint && c.color) c.color.multiply(new THREE.Color(tint));
      c.needsUpdate = true;
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return made;
}

// 材質見本のチップ（質感・単色用）
function chip(mat) {
  const g = new RoundedBoxGeometry(1, 1, 0.06, 3, 0.05);
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(-0.22, -0.5, 0);
  m.castShadow = true;
  return m;
}

// 小さなカーテン（ひだのある布2枚と棒）
function curtainObj({ color = '#e8e0d2', opacity = 1 } = {}) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.9, side: THREE.DoubleSide,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
  const W = 0.5, H = 1.3;
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(W, H, 48, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = (H / 2 - y) / H;           // 上0 → 下1
      const u = x / W + 0.5;               // 0〜1
      // 上はたっぷりのひだ、下に行くほど裾が外へ広がる
      const z = Math.sin(u * Math.PI * 7) * (0.03 + 0.025 * t);
      const flare = (s < 0 ? (1 - u) : u) * 0.12 * t * t;
      p.setXYZ(i, x * (1 - 0.18 * (1 - t)) + s * flare, y, z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.position.x = s * (W / 2 + 0.06);
    m.castShadow = true;
    grp.add(m);
  }
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.36, 16),
    new THREE.MeshStandardMaterial({ color: '#8a7a66', metalness: 0.6, roughness: 0.35 })
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.y = H / 2 + 0.02;
  grp.add(rod);
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), rod.material);
    knob.position.set(s * 0.69, H / 2 + 0.02, 0);
    grp.add(knob);
  }
  return grp;
}

// テクスチャが届くまで待つ（材質の数と画像がそろって落ち着くまで。長くても約1.5秒）
// minMs：材質を後から差しかえる作り方でも間に合うよう、最低これだけは待つ
async function settle(obj, maxMs = 1500, minMs = 0) {
  const t0 = performance.now();
  // 作る側が「準備できた」の約束（userData.ready）を持っていれば、それを待つ
  const ready = obj.userData && obj.userData.ready;
  if (ready && typeof ready.then === 'function') {
    await Promise.race([ready, new Promise((r) => setTimeout(r, maxMs))]);
    minMs = 0;
  }
  let last = '', same = 0;
  while (performance.now() - t0 < maxMs) {
    let sig = '', pending = false;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material || [])) {
        sig += m.uuid;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) {
          const t = m[k];
          if (!t) continue;
          sig += k[0];
          const img = t.image;
          if (!img || (img.complete === false) || (img.width === 0)) pending = true;
        }
      }
    });
    if (!pending && sig === last && performance.now() - t0 >= minMs) { if (++same >= 2) return; } else if (pending || sig !== last) same = 0;
    last = sig;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// 1つ描いて dataURL を返す
// 家具の 3D の形を作る（サムネイルと、くるくる回る画面で使う）
export async function itemObject(item) {
  const src = item.src || {};
  let obj = null, kind = 'object', own = []; // own: あとで捨てる材質
  let disposeGeo = true;

  if (src.proc) {
    obj = await buildProcObj(src.proc);
  } else if (src.gacha) {
    const [{ buildGacha }, { gachaSpec }] = await Promise.all([import('./gachafurn.js'), import('./gacha.js')]);
    obj = buildGacha(gachaSpec(item));
    obj.userData.tick?.(1.5, 0.016); // 動く物は少し進めた姿で撮る
    disposeGeo = false; // 形は部屋と共有しているので捨てない
  } else if (src.model) {
    obj = await loadModel(src.model);
    if (!obj) return null;
    own = recolor(obj, src.tint, src.paint);
    disposeGeo = false; // 形はほかと共有しているので捨てない
  } else if (src.tex) {
    const base = await texturedMaterial(src.tex, { tint: src.tint, rep: src.rep });
    const mat = fitMaterial(base, 1.6, 1.6);
    own = [mat];
    obj = chip(mat); kind = 'swatch';
  } else if (src.color) {
    const mat = new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.85 });
    own = [mat];
    obj = chip(mat); kind = 'swatch';
  } else if (src.curtain) {
    obj = curtainObj(src.curtain); kind = 'wall';
    obj.traverse((o) => o.isMesh && own.push(o.material));
  }
  return obj ? { obj, kind, own, disposeGeo } : null;
}

async function drawItem(item, opts = {}) {
  const src = item.src || {};
  const made = await itemObject(item);
  if (!made) return null;
  const { obj, kind, own, disposeGeo } = made;

  const { renderer, scene, camera, key, fill, ground, stage } = studio();
  const px = opts.size || SIZE;
  if (px !== SIZE) renderer.setSize(px, px, false);
  const wall = kind === 'wall' || item.place === 'wall' || (item.place === 'surface' && kind !== 'swatch');
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  await settle(obj, 1500, src.proc ? 700 : 0);
  stage.add(obj);

  // 照明の家具は小さな明かりをともす
  let lamp = null;
  const L = obj.userData && obj.userData.light;
  if (L) {
    lamp = new THREE.PointLight(L.color || '#ffd9a8', 1, 0, 2);
    obj.add(lamp);
    lamp.position.y = L.y || 0;
  }

  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) { cleanup(); return null; }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const rad = Math.max(size.x, size.y, size.z) || 1;
  if (lamp) lamp.intensity = (L.intensity ?? 1) * 1.2 * rad * rad;

  // カメラの向き（斜め前の上から。壁の物は正面から）
  let az = 0.6, el = 0.32;
  if (wall) { az = 0; el = 0.04; }
  if (kind === 'swatch') { az = 0; el = 0; }
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  fitCamera(camera, box, center, dir, kind === 'swatch' ? 0.8 : 0.84);

  // 光の位置は物の大きさに合わせる
  const kd = rad * 3;
  key.position.copy(center).add(new THREE.Vector3(-0.9, 1.6, 1.3).normalize().multiplyScalar(kd));
  key.target.position.copy(center);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -rad * 1.2; sc.right = sc.top = rad * 1.2;
  sc.near = 0.01; sc.far = kd * 3; sc.updateProjectionMatrix();
  fill.position.copy(center).add(new THREE.Vector3(1.2, 0.5, 0.8).normalize().multiplyScalar(kd));
  fill.target.position.copy(center);

  // 床置きの物だけ足もとに影
  ground.visible = !wall && kind !== 'swatch' && item.place !== 'ceiling';
  ground.position.set(center.x, box.min.y, center.z);
  ground.scale.setScalar(rad * 4);

  // 設計図用：形のふち（角ばった所）の線を、画面の上の位置（0〜1）にして集める
  let segs = null, dims = null;
  if (opts.blueprint) {
    camera.updateMatrixWorld(true);
    segs = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.visible === false) return;
      let eg = null;
      try { eg = new THREE.EdgesGeometry(o.geometry, 26); } catch { return; }
      const pa = eg.attributes.position;
      for (let i = 0; i + 1 < pa.count; i += 2) {
        a.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).project(camera);
        b.fromBufferAttribute(pa, i + 1).applyMatrix4(o.matrixWorld).project(camera);
        segs.push([(a.x + 1) / 2, (1 - a.y) / 2, (b.x + 1) / 2, (1 - b.y) / 2]);
      }
      eg.dispose();
    });
    // 多すぎるときは長い線を残す
    if (segs.length > 5000) segs = segs.map(q => [q, Math.hypot(q[2] - q[0], q[3] - q[1])]).sort((x, y) => y[1] - x[1]).slice(0, 5000).map(q => q[0]);
    const mm = (v) => Math.round(v * 100) * 10; // メートル → ミリ（10ミリ単位）
    dims = { w: mm(size.x), h: mm(size.y), d: mm(size.z) };
  }

  renderer.render(scene, camera);
  let url = renderer.domElement.toDataURL('image/webp', 0.9);
  if (!url.startsWith('data:image/webp')) url = renderer.domElement.toDataURL('image/png');
  cleanup();
  return opts.blueprint ? { url, segs, dims } : url;

  function cleanup() {
    if (px !== SIZE) renderer.setSize(SIZE, SIZE, false);
    stage.remove(obj);
    if (lamp) { obj.remove(lamp); lamp.dispose(); }
    obj.traverse((o) => {
      if (o.isMesh && disposeGeo) o.geometry?.dispose();
    });
    for (const m of own) {
      // 自分で複製した材質だけ捨てる（fitMaterial で複製したテクスチャも）
      if (kind === 'swatch') for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.dispose();
      m.dispose();
    }
    renderer.renderLists.dispose();
  }
}

// 箱の8つの角が画面に収まるようにカメラを置く（上下左右の真ん中もそろえる）
function fitCamera(camera, box, center, dir, fill) {
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fill;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z));
  }
  const target = center.clone();
  let d = 1;
  for (let pass = 0; pass < 3; pass++) {
    // カメラの座標で、各角に必要な距離を出す
    d = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      const v = c.clone().sub(target);
      const cx = v.dot(right), cy = v.dot(camUp), cz = v.dot(dir);
      d = Math.max(d, Math.abs(cx) / t + cz, Math.abs(cy) / t + cz);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    }
    // 画面上の中心を合わせる（遠近の分を大まかに調整）
    if (pass < 2) {
      let pminX = Infinity, pmaxX = -Infinity, pminY = Infinity, pmaxY = -Infinity;
      for (const c of corners) {
        const v = c.clone().sub(target);
        const k = d / (d - v.dot(dir));
        const px = v.dot(right) * k, py = v.dot(camUp) * k;
        pminX = Math.min(pminX, px); pmaxX = Math.max(pmaxX, px);
        pminY = Math.min(pminY, py); pmaxY = Math.max(pmaxY, py);
      }
      target.addScaledVector(right, (pminX + pmaxX) / 2 * 0.9);
      target.addScaledVector(camUp, (pminY + pmaxY) / 2 * 0.9);
    }
  }
  camera.position.copy(target).addScaledVector(dir, d);
  camera.up.copy(up);
  camera.near = Math.max(0.001, d / 100);
  camera.far = d * 10;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------
// くるくる回る画面（ガチャの「出る家具」を大きく見る）
// 指で横にドラッグすると回せる。はなすとまたゆっくり回る
// ---------------------------------------------------------------
export async function spinViewer(host, item) {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  scene.add(key, key.target, fill, fill.target, new THREE.HemisphereLight(0xffffff, 0x444033, 0.35));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const pivot = new THREE.Group(); scene.add(pivot);

  let alive = true, raf = 0, made = null, lamp = null;
  const size = () => {
    const w = host.clientWidth || 300, h = host.clientHeight || w;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size); ro.observe(host);

  // 指で回す
  let drag = null, spin = 0.6, angle = 0.6, lastT = performance.now();
  const down = (e) => { drag = { x: e.clientX, a: angle }; canvas.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!drag) return; angle = drag.a + (e.clientX - drag.x) * 0.012; };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.style.touchAction = 'none';

  try { made = await itemObject(item); } catch (e) { console.warn('spin', e); }
  if (!alive) return dispose;
  if (made) {
    const { obj, kind } = made;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    await settle(obj, 1500, item.src?.proc ? 700 : 0);
    if (!alive) return dispose;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); // 足もとの真ん中を回る中心に
    pivot.add(obj);
    const rad = Math.max(sz.x, sz.y, sz.z) || 1;
    const L = obj.userData && obj.userData.light;
    if (L) { lamp = new THREE.PointLight(L.color || '#ffd9a8', (L.intensity ?? 1) * 1.2 * rad * rad, 0, 2); obj.add(lamp); lamp.position.y = L.y || 0; }
    // 回してもはみ出さないように、横の広がりは対角線で見る
    const span = Math.hypot(sz.x, sz.z);
    const vb = new THREE.Box3(new THREE.Vector3(-span / 2, 0, -span / 2), new THREE.Vector3(span / 2, sz.y, span / 2));
    const center = vb.getCenter(new THREE.Vector3());
    const wall = kind === 'wall' || kind === 'swatch' || item.place === 'wall' || item.place === 'surface';
    const el = wall ? 0.08 : 0.3;
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    fitCamera(camera, vb, center, dir, 0.86);
    const kd = rad * 3;
    key.position.copy(center).add(new THREE.Vector3(-0.9, 1.6, 1.3).normalize().multiplyScalar(kd)); key.target.position.copy(center);
    const sc = key.shadow.camera; sc.left = sc.bottom = -rad * 1.4; sc.right = sc.top = rad * 1.4; sc.near = 0.01; sc.far = kd * 3; sc.updateProjectionMatrix();
    fill.position.copy(center).add(new THREE.Vector3(1.2, 0.5, 0.8).normalize().multiplyScalar(kd)); fill.target.position.copy(center);
    ground.visible = !wall && item.place !== 'ceiling';
    ground.scale.setScalar(rad * 2);
    if (wall) spin = 0; // 壁紙・床などは回さず正面から
    host.classList.add('ready');
  } else host.classList.add('failed');

  const loop = (t) => {
    if (!alive) return;
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (!drag) angle += spin * dt;
    pivot.rotation.y = angle;
    made?.obj.userData?.tick?.(t / 1000, dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function dispose() {
    if (!alive) return;
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    if (made) {
      const { obj, own, disposeGeo, kind } = made;
      pivot.remove(obj);
      if (lamp) { obj.remove(lamp); lamp.dispose(); }
      obj.traverse((o) => { if (o.isMesh && disposeGeo) o.geometry?.dispose(); });
      for (const m of own) { if (kind === 'swatch') for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.dispose(); m.dispose(); }
    }
    ground.geometry.dispose(); ground.material.dispose();
    scene.environment?.dispose();
    renderer.dispose(); renderer.forceContextLoss?.();
    canvas.remove();
  }
  return dispose;
}
