// 部屋に最初から備え付けの物（浴槽・シャワー・キッチン・洗面台・床の間 など）。
// 買えない・置ける数に入らない。部屋の殻（壁・床）の一部として room3d.js が作る。
// どれも「壁の内側の面が z=0、部屋の中が +z」の向きで作って、壁に合わせて回す。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { texturedMaterial, fitMaterial } from './loaders.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const M = {
  ceramic: () => std({ color: '#f5f3ef', roughness: 0.18 }),
  chrome: () => std({ color: '#f0f0f0', roughness: 0.1, metalness: 1 }),
  water: () => new THREE.MeshPhysicalMaterial({ color: '#8fd0de', roughness: 0.04, transmission: 0, transparent: true, opacity: 0.55, depthWrite: false }),
  white: () => std({ color: '#f1efea', roughness: 0.42 }),
  dark: () => std({ color: '#232323', roughness: 0.35 }),
};

// 壁の向き・位置
export function segRot(seg) { return seg.axis === 'z' ? (seg.n > 0 ? 0 : Math.PI) : (seg.n > 0 ? Math.PI / 2 : -Math.PI / 2); }
export function segPoint(seg, a, y = 0, d = 0) {
  return seg.axis === 'z' ? new THREE.Vector3(a, y, seg.c + seg.n * d) : new THREE.Vector3(seg.c + seg.n * d, y, a);
}
export function putOnWall(obj, seg, a, y = 0, d = 0) {
  obj.rotation.y = segRot(seg);
  obj.position.copy(segPoint(seg, a, y, d));
  return obj;
}

function box(g, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = !mat.transparent; m.receiveShadow = true;
  g.add(m); return m;
}
function cyl(g, r1, r2, h, mat, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  g.add(m); return m;
}
function tube(g, pts, r, mat) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(c, 24, r, 8), mat);
  m.castShadow = true; g.add(m); return m;
}

// 湯船（箱の形。fill = 内側の色、rim = ふちの材質）
function tubShell(g, w, d, h, wall, rimMat, inMat, waterY) {
  box(g, w, 0.12, d, rimMat, 0, 0.06, 0);
  box(g, w, h, wall, rimMat, 0, h / 2, -d / 2 + wall / 2);
  box(g, w, h, wall, rimMat, 0, h / 2, d / 2 - wall / 2);
  box(g, wall, h, d - wall * 2, rimMat, -w / 2 + wall / 2, h / 2, 0);
  box(g, wall, h, d - wall * 2, rimMat, w / 2 - wall / 2, h / 2, 0);
  if (inMat) box(g, w - wall * 2, 0.01, d - wall * 2, inMat, 0, 0.125, 0);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - wall * 2, d - wall * 2), M.water());
  water.rotation.x = -Math.PI / 2; water.position.y = waterY; water.renderOrder = 2;
  g.add(water);
}

// キッチンの天板のうち、シンクをよけた所（小物を置ける）
function kitchenTops(L, sx, y, z0 = 0.12, z1 = 0.64) {
  return [{ x0: -L / 2 + 0.03, x1: sx - 0.38, z0, z1, y }, { x0: sx + 0.38, x1: L / 2 - 0.03, z0, z1, y }].filter(t => t.x1 - t.x0 > 0.12);
}

// --- それぞれの備え付け ---
const BUILD = {
  // 白い浴槽（奥の壁ぎわ）
  bathtub(b) {
    const g = new THREE.Group();
    const ce = M.ceramic();
    tubShell(g, b.w, b.d, 0.55, 0.08, ce, std({ color: '#e9eef0', roughness: 0.2 }), 0.42);
    // 蛇口（浴槽の右はし、壁ぎわ）
    const ch = M.chrome();
    const sp = new THREE.Group();
    tube(sp, [[0, 0.7, -b.d / 2 - 0.02], [0, 0.72, -b.d / 2 + 0.08], [0, 0.66, -b.d / 2 + 0.14]], 0.016, ch);
    box(sp, 0.26, 0.05, 0.06, ch, 0, 0.78, -b.d / 2 + 0.01);
    sp.position.x = b.w / 2 - 0.3; g.add(sp);
    // 奥のふちを広げた台（シャンプーなどの小物を置ける）
    box(g, b.w - 0.16, 0.04, 0.08, ce, 0, 0.53, -b.d / 2 + 0.12);
    g.userData.tops = [{ x0: -b.w / 2 + 0.06, x1: b.w / 2 - 0.46, z0: -b.d / 2 + 0.005, z1: -b.d / 2 + 0.16, y: 0.55 }];
    g.position.set(b.x, 0, b.z);
    return g;
  },
  // ひのきの湯船と、竹の湯口
  async hinoki(b) {
    const g = new THREE.Group();
    const wood = await texturedMaterial('hinoki_planks', { rep: 0.8, tint: '#f3d9ad' });
    const wm = fitMaterial(wood, 1, 0.6);
    tubShell(g, b.w, b.d, 0.62, 0.08, wm, null, 0.5);
    box(g, b.w - 0.16, 0.01, b.d - 0.16, std({ color: '#c9a678', roughness: 0.8 }), 0, 0.125, 0);
    // ふちの板（少し太く）
    for (const s of [-1, 1]) box(g, b.w + 0.04, 0.04, 0.12, wm, 0, 0.64, s * (b.d / 2 - 0.04));
    // 湯口とお湯の流れ
    const bamboo = std({ color: '#7f9a4c', roughness: 0.5 });
    const spout = cyl(g, 0.035, 0.035, 0.5, bamboo, -b.w / 2 + 0.35, 0.86, -b.d / 2 + 0.2, 12);
    spout.rotation.x = Math.PI / 2 - 0.25;
    const stream = cyl(g, 0.012, 0.02, 0.38, new THREE.MeshPhysicalMaterial({ color: '#cfeef5', transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false }), -b.w / 2 + 0.35, 0.68, -b.d / 2 + 0.44, 10);
    stream.castShadow = false;
    g.position.set(b.x, 0, b.z);
    return g;
  },
  // シャワー（壁）：スライドバー・ヘッド・ホース・水栓・鏡・小さな棚
  shower(b, seg) {
    const g = new THREE.Group();
    const ch = M.chrome();
    cyl(g, 0.012, 0.012, 0.95, ch, 0, 1.45, 0.05, 10);
    for (const y of [0.98, 1.92]) box(g, 0.03, 0.03, 0.06, ch, 0, y, 0.03);
    const head = cyl(g, 0.05, 0.035, 0.035, ch, 0, 1.82, 0.13, 20);
    head.rotation.x = 0.9;
    box(g, 0.03, 0.03, 0.09, ch, 0, 1.79, 0.08);
    tube(g, [[0, 1.76, 0.1], [0.05, 1.3, 0.16], [0.12, 0.88, 0.12], [0.2, 0.8, 0.06]], 0.011, std({ color: '#d8d8d8', roughness: 0.3, metalness: 0.6 }));
    box(g, 0.32, 0.06, 0.07, ch, 0.22, 0.82, 0.035);
    for (const x of [0.1, 0.34]) { const k = cyl(g, 0.025, 0.025, 0.05, ch, x, 0.82, 0.07, 14); k.rotation.x = Math.PI / 2; }
    // 鏡
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), std({ color: '#f2f6f8', roughness: 0.14, metalness: 0.75, emissive: '#5e666a', emissiveIntensity: 0.35 }));
    mirror.position.set(-0.42, 1.38, 0.006); g.add(mirror);
    // 棚とボトル
    box(g, 0.42, 0.02, 0.12, std({ color: '#f2f2f2', roughness: 0.3 }), -0.42, 0.98, 0.06);
    [['#f2f2f2', -0.55], ['#7fb3c9', -0.45], ['#e6c9a8', -0.35]].forEach(([c, x], i) => cyl(g, 0.03, 0.03, 0.18 - i * 0.02, std({ color: c, roughness: 0.4 }), x, 1.08 - i * 0.01, 0.06, 12));
    return putOnWall(g, seg, b.a);
  },
  // 洗い場：風呂いす・桶・排水口
  washarea(b) {
    const g = new THREE.Group();
    const pl = std({ color: '#f3efe8', roughness: 0.35 });
    box(g, 0.32, 0.04, 0.26, pl, 0, 0.26, 0);
    for (const s of [-1, 1]) box(g, 0.04, 0.24, 0.24, pl, s * 0.13, 0.12, 0);
    const wood = std({ color: '#d7b78a', roughness: 0.6 });
    const oke = cyl(g, 0.15, 0.13, 0.13, wood, 0.32, 0.065, 0.12, 20);
    oke.material = wood;
    cyl(g, 0.135, 0.135, 0.01, std({ color: '#9fd3df', roughness: 0.1 }), 0.32, 0.11, 0.12, 20);
    const drain = cyl(g, 0.08, 0.08, 0.006, M.chrome(), -0.1, 0.003, 0.4, 20);
    drain.castShadow = false;
    g.position.set(b.x, 0, b.z);
    return g;
  },
  // システムキッチン：下の収納・天板・シンク・IH・レンジフード・上の収納・壁のタイル
  kitchen(b, seg, sh) {
    const g = new THREE.Group();
    const L = b.len;
    const front = std({ color: '#efe9df', roughness: 0.45 });
    const top = std({ color: '#d9d6cf', roughness: 0.25 });
    const steel = std({ color: '#c9ccd0', roughness: 0.22, metalness: 0.9 });
    const handle = std({ color: '#3a3836', roughness: 0.4, metalness: 0.6 });
    // 下の収納
    box(g, L, 0.1, 0.58, M.dark(), 0, 0.05, 0.28);
    const n = Math.round(L / 0.6);
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n;
      box(g, L / n - 0.008, 0.74, 0.6, front, x, 0.47, 0.3);
      box(g, L / n - 0.12, 0.02, 0.02, handle, x, 0.78, 0.61);
    }
    box(g, L + 0.02, 0.04, 0.66, top, 0, 0.86, 0.33);
    // シンク（左寄り）と水栓
    const sx = -L / 2 + 0.75;
    box(g, 0.7, 0.012, 0.42, steel, sx, 0.87, 0.33);
    box(g, 0.64, 0.01, 0.36, std({ color: '#8f9398', roughness: 0.3, metalness: 0.8 }), sx, 0.876, 0.33);
    const ch = M.chrome();
    cyl(g, 0.02, 0.025, 0.3, ch, sx, 1.03, 0.08, 12);
    tube(g, [[sx, 1.17, 0.08], [sx, 1.25, 0.14], [sx, 1.17, 0.26]], 0.013, ch);
    // IH（右寄り）
    const cx = L / 2 - 0.65;
    box(g, 0.62, 0.01, 0.5, std({ color: '#141414', roughness: 0.08 }), cx, 0.885, 0.33);
    for (const [dx, r] of [[-0.15, 0.1], [0.15, 0.1], [0, 0.07]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r, 32), std({ color: '#777', roughness: 0.4 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx + dx, 0.891, dx === 0 ? 0.48 : 0.26); g.add(ring);
    }
    // 壁のタイル（天板と上の収納のあいだ）
    const tile = std({ color: '#f2f0ec', roughness: 0.3 });
    box(g, L, 0.6, 0.01, tile, 0, 1.18, 0.005);
    // レンジフード
    box(g, 0.75, 0.32, 0.55, M.white(), cx, sh.h - 0.62, 0.28);
    box(g, 0.3, 0.46, 0.3, M.white(), cx, sh.h - 0.23, 0.15);
    // 上の収納（フードのところ以外）
    const upY = sh.h - 0.45, upH = Math.min(0.7, sh.h - 1.55);
    const segs = [[-L / 2, cx - 0.4], [cx + 0.4, L / 2]];
    for (const [x0, x1] of segs) {
      if (x1 - x0 < 0.2) continue;
      const m = Math.max(1, Math.round((x1 - x0) / 0.6));
      for (let i = 0; i < m; i++) {
        const w = (x1 - x0) / m, x = x0 + (i + 0.5) * w;
        box(g, w - 0.008, upH, 0.35, front, x, upY - upH / 2 + 0.2, 0.175);
        box(g, 0.02, 0.12, 0.02, handle, x + w / 2 - 0.06, upY - upH + 0.3, 0.36);
      }
    }
    g.userData.tops = kitchenTops(L, sx, 0.88);
    return putOnWall(g, seg, b.a0 + L / 2);
  },
  // 冷蔵庫
  fridge(b, seg) {
    const g = new THREE.Group();
    const body = std({ color: '#d9dbdc', roughness: 0.3, metalness: 0.5 });
    box(g, 0.68, 1.82, 0.66, body, 0, 0.91, 0.34);
    box(g, 0.66, 0.006, 0.01, M.dark(), 0, 1.15, 0.675);
    const h = std({ color: '#9a9ea2', roughness: 0.2, metalness: 1 });
    box(g, 0.025, 0.4, 0.03, h, -0.28, 1.45, 0.69);
    box(g, 0.025, 0.3, 0.03, h, -0.28, 0.85, 0.69);
    return putOnWall(g, seg, b.a);
  },
  // 洗面台：収納・陶器のボウル・水栓・鏡の収納・あかり
  vanity(b, seg) {
    const g = new THREE.Group();
    const front = std({ color: '#f4f1ec', roughness: 0.4 });
    box(g, 0.9, 0.78, 0.52, front, 0, 0.39, 0.27);
    box(g, 0.004, 0.6, 0.01, std({ color: '#cfcac2' }), 0, 0.45, 0.535);
    box(g, 0.94, 0.06, 0.56, M.ceramic(), 0, 0.81, 0.28);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std({ color: '#ffffff', roughness: 0.15, side: THREE.DoubleSide }));
    bowl.scale.set(1.2, 0.5, 0.8); bowl.position.set(0, 0.84, 0.3); g.add(bowl);
    const ch = M.chrome();
    cyl(g, 0.018, 0.022, 0.18, ch, 0, 0.93, 0.1, 12);
    tube(g, [[0, 1.0, 0.1], [0, 1.03, 0.16], [0, 0.98, 0.22]], 0.011, ch);
    // 鏡の収納
    box(g, 0.9, 0.72, 0.13, front, 0, 1.62, 0.065);
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.68), std({ color: '#f2f6f8', roughness: 0.14, metalness: 0.75, emissive: '#5e666a', emissiveIntensity: 0.35 }));
    mir.position.set(0, 1.62, 0.131); g.add(mir);
    const lamp = box(g, 0.8, 0.05, 0.08, std({ color: '#fff', emissive: '#fff4de', emissiveIntensity: 1.2 }), 0, 2.02, 0.07);
    lamp.castShadow = false;
    // タオルかけ
    box(g, 0.02, 0.02, 0.06, ch, 0.5, 0.7, 0.03);
    const towel = box(g, 0.02, 0.4, 0.3, std({ color: '#cfdcd8', roughness: 1 }), 0.5, 0.52, 0.2);
    towel.castShadow = true;
    g.userData.tops = [{ x0: -0.45, x1: -0.26, z0: 0.06, z1: 0.54, y: 0.84 }, { x0: 0.26, x1: 0.45, z0: 0.06, z1: 0.54, y: 0.84 }];
    return putOnWall(g, seg, b.a);
  },
  // ドラム式の洗濯機
  washer(b) {
    const g = new THREE.Group();
    box(g, 0.62, 0.85, 0.62, M.white(), 0, 0.425, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 12, 32), std({ color: '#c8c8c8', roughness: 0.2, metalness: 0.6 }));
    ring.position.set(0, 0.42, 0.32); g.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), std({ color: '#2d3a42', roughness: 0.05, metalness: 0.3 }));
    glass.position.set(0, 0.42, 0.315); g.add(glass);
    box(g, 0.58, 0.1, 0.02, std({ color: '#e2e2e2', roughness: 0.3 }), 0, 0.76, 0.31);
    box(g, 0.08, 0.03, 0.01, std({ color: '#000', emissive: '#7fd6ff', emissiveIntensity: 1 }), 0.15, 0.76, 0.322);
    // かご
    box(g, 0.42, 0.22, 0.32, std({ color: '#b99b72', roughness: 0.9 }), 0, 0.96, -0.04);
    g.userData.tops = [{ x0: -0.3, x1: 0.3, z0: 0.13, z1: 0.3, y: 0.85 }];
    g.position.set(b.x, 0, b.z);
    return g;
  },
  // ウォークインクローゼットの棚とハンガーの服
  closet(b, seg) {
    const g = new THREE.Group();
    const L = b.len, D = 0.6;
    const wood = std({ color: '#e7dccb', roughness: 0.6 });
    box(g, L, 0.025, D, wood, 0, 1.86, D / 2);
    box(g, L, 0.025, D, wood, 0, 2.2, D / 2);
    for (const x of [-L / 2 + 0.012, L / 2 - 0.012]) box(g, 0.025, 2.2, D, wood, x, 1.1, D / 2);
    const rod = cyl(g, 0.014, 0.014, L - 0.04, M.chrome(), 0, 1.78, D / 2, 10);
    rod.rotation.z = Math.PI / 2;
    // 服（色ちがいをまとめて描く）
    const cols = ['#f2efe8', '#2f3a4d', '#b9a68c', '#7a8c74', '#d8c3b4', '#3b3b3d', '#a55b4b', '#dfe4ea', '#c9b28a', '#55607a'];
    const n = Math.floor((L - 0.2) / 0.075);
    const geo = new THREE.BoxGeometry(0.035, 1, 0.46);
    const inst = new THREE.InstancedMesh(geo, std({ color: '#ffffff', roughness: 0.95 }), n);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const len = 0.6 + rnd() * 0.45;
      mtx.compose(new THREE.Vector3(-L / 2 + 0.12 + i * 0.075, 1.74 - len / 2, D / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rnd() - 0.5) * 0.25, 0)), new THREE.Vector3(1, len, 1));
      inst.setMatrixAt(i, mtx);
      inst.setColorAt(i, col.set(cols[Math.floor(rnd() * cols.length)]));
    }
    inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);
    // 上の棚の箱と、下の引き出し
    for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.55) box(g, 0.42, 0.26, 0.4, std({ color: ['#d9cdb8', '#bfb39e', '#e9e2d4'][Math.round(x * 10) % 3 < 0 ? 0 : Math.round(x * 10) % 3], roughness: 0.9 }), x, 2.0, 0.28);
    for (let i = 0; i < 2; i++) {
      const x = -L / 2 + 0.45 + i * 0.95;
      box(g, 0.8, 0.5, 0.48, wood, x, 0.25, 0.26);
      for (const y of [0.13, 0.37]) box(g, 0.16, 0.02, 0.02, M.dark(), x, y, 0.51);
    }
    return putOnWall(g, seg, b.a0 + L / 2);
  },
  // 障子（窓の前）
  shoji(b, seg, sh) {
    const w = sh.windows[b.win || 0];
    const g = new THREE.Group();
    const wood = std({ color: '#e2c79c', roughness: 0.55 });
    const paper = std({ color: '#f8f3e6', roughness: 0.95, transparent: true, opacity: 0.82, emissive: '#fff3dc', emissiveIntensity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const H = w.y1 - w.y0 + 0.06, y0 = w.y0 - 0.03;
    box(g, w.w + 0.1, 0.05, 0.12, wood, 0, y0 + H + 0.025, 0.07);
    box(g, w.w + 0.1, 0.03, 0.12, wood, 0, y0 - 0.015, 0.07);
    const panelW = w.w / 2 + 0.03;
    [[-w.w / 4, 0.1], [w.w / 4, 0.05]].forEach(([x, z]) => {
      const p = new THREE.Group();
      const pp = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.04, H - 0.04), paper);
      pp.renderOrder = 1; p.add(pp);
      box(p, panelW, 0.03, 0.025, wood, 0, H / 2 - 0.015, 0);
      box(p, panelW, 0.03, 0.025, wood, 0, -H / 2 + 0.015, 0);
      box(p, 0.03, H, 0.025, wood, -panelW / 2 + 0.015, 0, 0);
      box(p, 0.03, H, 0.025, wood, panelW / 2 - 0.015, 0, 0);
      const cols = 3, rows = Math.max(4, Math.round(H / 0.32));
      for (let i = 1; i < cols; i++) box(p, 0.012, H - 0.04, 0.015, wood, -panelW / 2 + panelW * i / cols, 0, 0.004);
      for (let j = 1; j < rows; j++) box(p, panelW - 0.04, 0.012, 0.015, wood, 0, -H / 2 + H * j / rows, 0.004);
      p.position.set(x, y0 + H / 2, z);
      g.add(p);
    });
    return putOnWall(g, seg, w.a);
  },
  // 床の間：一段上がった板・床柱・落とし掛け・掛け軸
  tokonoma(b, seg, sh) {
    const g = new THREE.Group();
    const L = b.len, D = 0.72;
    const board = std({ color: '#8a5a33', roughness: 0.35 });
    const wood = std({ color: '#c79a62', roughness: 0.6 });
    box(g, L, 0.12, D, board, 0, 0.06, D / 2);
    // 床柱（皮むきの丸太）
    const post = cyl(g, 0.06, 0.065, sh.h, std({ color: '#b98f5e', roughness: 0.5 }), L / 2 - 0.06, sh.h / 2, D - 0.06, 16);
    post.castShadow = true;
    // 落とし掛けと小壁
    box(g, L, 0.08, 0.06, wood, 0, 1.95, D - 0.03);
    box(g, L, sh.h - 1.99, 0.04, std({ color: '#d8c7a4', roughness: 0.95 }), 0, (sh.h + 1.99) / 2, D - 0.02);
    // 掛け軸
    const c = document.createElement('canvas'); c.width = 128; c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#5b4a36'; x.fillRect(0, 0, 128, 320);
    x.fillStyle = '#efe6d2'; x.fillRect(12, 40, 104, 240);
    x.strokeStyle = '#2a2622'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.arc(64, 150, 34, -1.2, 4.6); x.stroke();
    x.fillStyle = '#b8322b'; x.fillRect(84, 232, 14, 14);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.05), std({ map: tex, roughness: 0.9 }));
    scroll.position.set(-0.1, 1.3, 0.012); g.add(scroll);
    const rodM = std({ color: '#2a1f17', roughness: 0.5 });
    const r = cyl(g, 0.012, 0.012, 0.5, rodM, -0.1, 0.77, 0.02, 8); r.rotation.z = Math.PI / 2;
    // 花入れ
    const vase = cyl(g, 0.05, 0.07, 0.24, std({ color: '#3b4a52', roughness: 0.3 }), -0.1, 0.24, D * 0.45, 16);
    vase.castShadow = true;
    const twig = cyl(g, 0.006, 0.006, 0.45, std({ color: '#4a3424' }), -0.08, 0.55, D * 0.45, 6);
    twig.rotation.z = 0.3;
    g.userData.tops = [{ x0: -L / 2 + 0.05, x1: -0.22, z0: 0.05, z1: D - 0.14, y: 0.12 }, { x0: 0.02, x1: L / 2 - 0.16, z0: 0.05, z1: D - 0.14, y: 0.12 }];
    return putOnWall(g, seg, b.a0 + L / 2);
  },
  // ふすま（壁の上に貼る）
  fusuma(b, seg) {
    const g = new THREE.Group();
    const L = b.len, H = 1.8;
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#efe5cf'; x.fillRect(0, 0, 128, 256);
    x.strokeStyle = 'rgba(160,140,100,0.35)'; x.lineWidth = 2;
    for (let r = 0; r < 12; r++) for (let k = 0; k < 6; k++) {
      const cx = k * 24 + (r % 2) * 12, cy = r * 24 + 12;
      for (const rr of [10, 6, 2]) { x.beginPath(); x.arc(cx, cy, rr, Math.PI, 0); x.stroke(); }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const paper = std({ map: tex, roughness: 0.9 });
    const frame = std({ color: '#1e1a17', roughness: 0.35 });
    const n = 4, pw = L / n;
    for (let i = 0; i < n; i++) {
      const px = -L / 2 + (i + 0.5) * pw;
      const pnl = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.04, H - 0.04), paper);
      pnl.position.set(px, H / 2, 0.012); pnl.receiveShadow = true; g.add(pnl);
      box(g, pw, 0.02, 0.02, frame, px, H - 0.01, 0.01);
      box(g, pw, 0.02, 0.02, frame, px, 0.01, 0.01);
      box(g, 0.02, H, 0.02, frame, px - pw / 2 + 0.01, H / 2, 0.01);
      box(g, 0.02, H, 0.02, frame, px + pw / 2 - 0.01, H / 2, 0.01);
      const hk = cyl(g, 0.03, 0.03, 0.01, std({ color: '#7a6034', roughness: 0.3, metalness: 0.8 }), px + (i % 2 ? -1 : 1) * (pw / 2 - 0.1), 0.9, 0.016, 16);
      hk.rotation.x = Math.PI / 2;
    }
    box(g, L + 0.1, 0.06, 0.05, std({ color: '#c79a62', roughness: 0.6 }), 0, H + 0.03, 0.02);
    return putOnWall(g, seg, b.a0 + L / 2);
  },
  // ガレージのシャッター（壁）
  shutter(b, seg) {
    const g = new THREE.Group();
    const W = 2.6, H = 2.4;
    const c = document.createElement('canvas'); c.width = 8; c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#9ea2a5'); gr.addColorStop(0.45, '#c9ccce'); gr.addColorStop(0.55, '#c3c6c8'); gr.addColorStop(1, '#7f8386');
    x.fillStyle = gr; x.fillRect(0, 0, 8, 64);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, H / 0.09); tex.colorSpace = THREE.SRGBColorSpace;
    const slats = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std({ map: tex, roughness: 0.45, metalness: 0.6 }));
    slats.position.set(0, H / 2, 0.012); slats.receiveShadow = true; g.add(slats);
    const rail = std({ color: '#5d6063', roughness: 0.4, metalness: 0.7 });
    for (const s of [-1, 1]) box(g, 0.08, H + 0.1, 0.04, rail, s * (W / 2 + 0.04), (H + 0.1) / 2, 0.02);
    box(g, W + 0.24, 0.3, 0.12, rail, 0, H + 0.2, 0.06);
    box(g, 0.3, 0.04, 0.04, std({ color: '#2b2b2b' }), 0, 0.08, 0.03);
    return putOnWall(g, seg, b.a);
  },
  // 作業台と有孔ボード
  workbench(b, seg) {
    const g = new THREE.Group();
    const wood = std({ color: '#b58a5a', roughness: 0.7 });
    const W = 2.0, D = 0.7;
    box(g, W, 0.06, D, wood, 0, 0.88, D / 2);
    for (const sx of [-1, 1]) for (const sz of [0.06, D - 0.06]) box(g, 0.07, 0.85, 0.07, wood, sx * (W / 2 - 0.06), 0.425, sz);
    box(g, W - 0.1, 0.03, D - 0.1, wood, 0, 0.2, D / 2);
    box(g, 1.8, 0.9, 0.02, std({ color: '#c9a777', roughness: 0.85 }), 0, 1.55, 0.01);
    const tool = std({ color: '#3d3d3d', roughness: 0.4, metalness: 0.6 });
    const red = std({ color: '#b5382d', roughness: 0.5 });
    box(g, 0.04, 0.3, 0.02, tool, -0.6, 1.55, 0.04);
    box(g, 0.12, 0.05, 0.03, red, -0.6, 1.72, 0.04);
    box(g, 0.03, 0.26, 0.02, tool, -0.35, 1.5, 0.04);
    box(g, 0.25, 0.02, 0.02, tool, 0.1, 1.75, 0.04);
    cyl(g, 0.05, 0.05, 0.1, red, 0.5, 1.45, 0.06, 14);
    box(g, 0.35, 0.18, 0.25, red, 0.55, 1.0, 0.25);
    g.userData.tops = [{ x0: -0.95, x1: 0.3, z0: 0.1, z1: 0.65, y: 0.91 }];
    return putOnWall(g, seg, b.a);
  },
};

// ===================== 備え付けの「形」（いつもの形のほかに、買える形・ガチャの形） =====================
// どれも、いつもの形と同じ場所・同じくらいの大きさにおさまるように作る（家具の配置がくずれないように）
const TXC = new Map();
function cvMat(key, w, h, draw, o = {}) {
  let t = TXC.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TXC.set(key, t);
  }
  const tex = o.rep ? Object.assign(t.clone(), { repeat: new THREE.Vector2(o.rep[0], o.rep[1]) }) : t;
  if (o.rep) tex.needsUpdate = true;
  return std({ map: tex, roughness: o.rough ?? 0.4, metalness: o.metal ?? 0 });
}
// 木目（色・すじの濃さ）
const woodM = (base, dark, key = base) => cvMat('wd' + key, 256, 256, (x, w, h) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) { x.strokeStyle = dark; x.globalAlpha = 0.08 + rnd() * 0.18; x.lineWidth = 1 + rnd() * 3; const y0 = rnd() * h; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * 0.3, y0 + (rnd() - 0.5) * 20, w * 0.7, y0 + (rnd() - 0.5) * 20, w, y0 + (rnd() - 0.5) * 10); x.stroke(); }
  x.globalAlpha = 1;
}, { rough: 0.55 });
// 大理石（白 / 黒）
const marbleM = (dark) => cvMat('mb' + dark, 256, 256, (x, w, h) => {
  x.fillStyle = dark ? '#26272a' : '#f1efea'; x.fillRect(0, 0, w, h);
  let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) { x.strokeStyle = dark ? '#d8d4cc' : '#9a968e'; x.globalAlpha = 0.15 + rnd() * 0.35; x.lineWidth = 0.6 + rnd() * 1.8; let px = rnd() * w, py = 0; x.beginPath(); x.moveTo(px, py); while (py < h) { px += (rnd() - 0.4) * 30; py += 10 + rnd() * 20; x.lineTo(px, py); } x.stroke(); }
  x.globalAlpha = 1;
}, { rough: 0.12 });
// 小さなタイル
const tileM = (c, grout = '#f4f2ee', n = 8) => cvMat('tl' + c + n, 128, 128, (x, w, h) => {
  x.fillStyle = grout; x.fillRect(0, 0, w, h); const t = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = c; x.globalAlpha = 0.85 + ((i * 7 + j * 3) % 5) * 0.03; x.fillRect(i * t + 1, j * t + 1, t - 2, t - 2); }
  x.globalAlpha = 1;
}, { rough: 0.25, rep: [3, 2] });
const gold = () => std({ color: '#d9b25c', roughness: 0.22, metalness: 1 });
const steelM = () => std({ color: '#c9ccd0', roughness: 0.24, metalness: 0.9 });
const brushed = () => std({ color: '#b9bdc1', roughness: 0.35, metalness: 0.85 });
// 壁つけの水栓
function faucet(g, x, y, z, mat, tall = false) {
  cyl(g, 0.018, 0.022, tall ? 0.28 : 0.16, mat, x, y + (tall ? 0.14 : 0.08), z, 12);
  tube(g, [[x, y + (tall ? 0.28 : 0.16), z], [x, y + (tall ? 0.34 : 0.2), z + 0.06], [x, y + (tall ? 0.28 : 0.15), z + 0.13]], 0.012, mat);
}
// 浴槽の形（だ円の湯船）。sx/sz = 横・奥の半径、h = 高さ
function ovalTub(g, sx, sz, h, outM, inM, y0) {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.62 + 0.38 * Math.sin(t * Math.PI / 2) ** 0.6, t * h)); }
  pts.push(new THREE.Vector2(1.02, h), new THREE.Vector2(0.94, h - 0.01));
  for (let i = 10; i >= 0; i--) { const t = i / 10; pts.push(new THREE.Vector2(Math.max(0.01, (0.58 + 0.36 * Math.sin(t * Math.PI / 2) ** 0.6) * (t < 0.05 ? 0.2 : 1)), 0.04 + t * (h - 0.05))); }
  const geo = new THREE.LatheGeometry(pts, 40);
  outM.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, outM); m.scale.set(sx, 1, sz); m.position.y = y0; m.castShadow = true; m.receiveShadow = true; g.add(m);
  // 内側の色（白）とお湯
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 40), inM); inner.rotation.x = -Math.PI / 2; inner.scale.set(sx * 0.8, sz * 0.8, 1); inner.position.y = y0 + 0.05; g.add(inner);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), M.water()); water.rotation.x = -Math.PI / 2; water.scale.set(sx * 0.92, sz * 0.92, 1); water.position.y = y0 + h - 0.12; water.renderOrder = 2; g.add(water);
}
function clawFeet(g, sx, sz, mat) {
  for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.Group();
    cyl(f, 0.03, 0.045, 0.1, mat, 0, 0.07, 0, 12);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), mat); ball.position.y = 0.035; ball.castShadow = true; f.add(ball);
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat); c.position.set(Math.cos(k * 2.1) * 0.04, 0.012, Math.sin(k * 2.1) * 0.04); f.add(c); }
    f.position.set(fx * sx * 0.68, 0, fz * sz * 0.62); g.add(f);
  }
}

export const SHAPES = {
  kitchen: {
    // 木のカントリーキッチン：かまち扉・木の天板・白い陶器のシンク・真ちゅうの水栓・木の飾り棚
    country(b, seg, sh) {
      const g = new THREE.Group(); const L = b.len;
      const front = std({ color: '#d8c7a6', roughness: 0.6 }), frame = std({ color: '#c8b48e', roughness: 0.6 });
      const top = woodM('#b98a55', '#6e4a2a', 'butcher'), br = gold();
      box(g, L, 0.1, 0.56, std({ color: '#6e5a44', roughness: 0.8 }), 0, 0.05, 0.28);
      const n = Math.round(L / 0.5);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * L / n, w = L / n - 0.01;
        box(g, w, 0.74, 0.6, frame, x, 0.47, 0.3);
        box(g, w - 0.1, 0.6, 0.01, front, x, 0.45, 0.605);
        cyl(g, 0.012, 0.012, 0.02, br, x + w / 2 - 0.07, 0.7, 0.62, 10).rotation.x = Math.PI / 2;
      }
      box(g, L + 0.04, 0.05, 0.68, top, 0, 0.865, 0.34);
      const sx = -L / 2 + 0.75;
      box(g, 0.62, 0.24, 0.5, M.ceramic(), sx, 0.73, 0.33);
      box(g, 0.56, 0.01, 0.42, std({ color: '#e9e6df', roughness: 0.2 }), sx, 0.892, 0.33);
      faucet(g, sx, 0.89, 0.1, br, true);
      // ガスコンロ（黒い五徳）
      const cx = L / 2 - 0.65, iron = std({ color: '#1e1e1e', roughness: 0.5, metalness: 0.4 });
      box(g, 0.6, 0.02, 0.48, std({ color: '#2a2a2a', roughness: 0.4 }), cx, 0.9, 0.33);
      for (const [dx, dz] of [[-0.14, 0.22], [0.14, 0.22], [-0.14, 0.44], [0.14, 0.44]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 6, 20), iron); r.rotation.x = Math.PI / 2; r.position.set(cx + dx, 0.93, dz); g.add(r); }
      box(g, L, 0.55, 0.01, tileM('#e9e3d6', '#cfc7b8', 6), 0, 1.17, 0.005);
      // 飾り棚（板2枚）とびん
      const shelf = woodM('#c9a070', '#7a5432', 'shelf');
      for (const y of [1.6, 1.95]) { box(g, L * 0.9, 0.03, 0.24, shelf, 0, y, 0.12); }
      const jars = ['#e9dcc0', '#c9a06a', '#f1ece0', '#8aa07a', '#d8b48a', '#e9dcc0'];
      jars.forEach((c, i) => { const x = -L * 0.4 + i * L * 0.16; cyl(g, 0.045, 0.045, 0.14, std({ color: c, roughness: 0.5 }), x, 1.685, 0.12, 14); cyl(g, 0.06, 0.06, 0.02, M.ceramic(), x + 0.06, 2.0, 0.12, 14); });
      // フード（白いしっくい風）
      box(g, 0.75, 0.3, 0.5, M.white(), cx, sh.h - 0.6, 0.26);
      box(g, 0.32, 0.5, 0.3, M.white(), cx, sh.h - 0.2, 0.15);
      g.userData.tops = kitchenTops(L, sx, 0.89, 0.14, 0.66);
      return putOnWall(g, seg, b.a0 + L / 2);
    },
    // ステンレスの業務用キッチン：全部ステンレス・ガスの五徳・壁の棚とバー
    steel(b, seg, sh) {
      const g = new THREE.Group(); const L = b.len;
      const st = steelM(), bru = brushed(), dk = M.dark();
      // 脚と下の棚（オープン）
      for (const x of [-L / 2 + 0.03, L / 2 - 0.03, -L / 6, L / 6]) for (const z of [0.05, 0.6]) box(g, 0.035, 0.84, 0.035, st, x, 0.42, z);
      box(g, L, 0.02, 0.6, bru, 0, 0.18, 0.32);
      for (let i = 0; i < 4; i++) box(g, 0.3, 0.2, 0.3, std({ color: ['#c9ccd0', '#2b2b2b', '#c9ccd0', '#b8a888'][i], roughness: 0.4, metalness: i === 1 || i === 3 ? 0 : 0.8 }), -L / 2 + 0.4 + i * (L - 0.8) / 3, 0.29, 0.3);
      box(g, L + 0.02, 0.05, 0.68, st, 0, 0.865, 0.34);
      box(g, L + 0.02, 0.12, 0.02, st, 0, 0.95, 0.01);
      const sx = -L / 2 + 0.7;
      box(g, 0.6, 0.012, 0.44, std({ color: '#8f9398', roughness: 0.3, metalness: 0.8 }), sx, 0.887, 0.34);
      faucet(g, sx, 0.89, 0.08, M.chrome(), true);
      const cx = L / 2 - 0.62, iron = std({ color: '#151515', roughness: 0.55, metalness: 0.4 });
      for (const [dx, dz] of [[-0.15, 0.22], [0.15, 0.22], [-0.15, 0.46], [0.15, 0.46]]) {
        box(g, 0.24, 0.015, 0.2, iron, cx + dx, 0.9, dz);
        for (const k of [-1, 1]) box(g, 0.22, 0.015, 0.012, iron, cx + dx, 0.915, dz + k * 0.05);
      }
      for (let i = 0; i < 4; i++) cyl(g, 0.016, 0.016, 0.03, dk, cx - 0.22 + i * 0.15, 0.78, 0.69, 12).rotation.x = Math.PI / 2;
      box(g, L, 0.62, 0.01, st, 0, 1.2, 0.005);
      // 壁の棚とつり下げのバー
      box(g, L * 0.95, 0.025, 0.3, st, 0, 1.75, 0.15);
      const bar = cyl(g, 0.008, 0.008, L * 0.7, M.chrome(), 0, 1.5, 0.05, 8); bar.rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const x = -L * 0.3 + i * L * 0.12; box(g, 0.004, 0.14, 0.004, M.chrome(), x, 1.43, 0.05); cyl(g, 0.035, 0.035, 0.012, i % 2 ? st : dk, x, 1.33, 0.05, 14).rotation.x = Math.PI / 2; }
      // 業務用のフード
      box(g, 0.9, 0.35, 0.6, st, cx, sh.h - 0.62, 0.3);
      box(g, 0.34, 0.45, 0.3, st, cx, sh.h - 0.22, 0.15);
      g.userData.tops = kitchenTops(L, sx, 0.89);
      return putOnWall(g, seg, b.a0 + L / 2);
    },
    // 大理石の天板のキッチン（★4）：ネイビーの扉・金の取っ手・白い大理石・ガラス扉の上の収納
    marble(b, seg, sh) {
      const g = new THREE.Group(); const L = b.len;
      const front = std({ color: '#2e3a52', roughness: 0.45 }), gd = gold(), mb = marbleM(false);
      box(g, L, 0.1, 0.56, std({ color: '#1e2534', roughness: 0.5 }), 0, 0.05, 0.28);
      const n = Math.round(L / 0.6);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * L / n, w = L / n - 0.008;
        box(g, w, 0.74, 0.6, front, x, 0.47, 0.3);
        box(g, w - 0.08, 0.6, 0.012, std({ color: '#33405a', roughness: 0.4 }), x, 0.45, 0.603);
        box(g, w - 0.2, 0.014, 0.02, gd, x, 0.79, 0.62);
      }
      box(g, L + 0.04, 0.05, 0.68, mb, 0, 0.865, 0.34);
      box(g, L, 0.6, 0.012, mb, 0, 1.18, 0.006);
      const sx = -L / 2 + 0.75;
      box(g, 0.66, 0.012, 0.42, std({ color: '#2a2a2a', roughness: 0.25 }), sx, 0.887, 0.33);
      faucet(g, sx, 0.89, 0.08, gd, true);
      const cx = L / 2 - 0.65;
      box(g, 0.62, 0.01, 0.5, std({ color: '#0d0d0d', roughness: 0.06 }), cx, 0.895, 0.33);
      for (const [dx, r] of [[-0.15, 0.1], [0.15, 0.1], [0, 0.07]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r, 32), std({ color: '#c9a35a', roughness: 0.4, metalness: 0.8 })); ring.rotation.x = -Math.PI / 2; ring.position.set(cx + dx, 0.901, dx === 0 ? 0.48 : 0.26); g.add(ring); }
      // 金のフード
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, 0.42, 4, 1), gd); hood.rotation.y = Math.PI / 4; hood.scale.set(1, 1, 0.7); hood.position.set(cx, sh.h - 0.58, 0.27); hood.castShadow = true; g.add(hood);
      box(g, 0.24, 0.42, 0.24, gd, cx, sh.h - 0.2, 0.14);
      // ガラス扉の上の収納（中に食器）
      const upY = sh.h - 0.45, upH = Math.min(0.7, sh.h - 1.55);
      for (const [x0, x1] of [[-L / 2, cx - 0.45], [cx + 0.45, L / 2]]) {
        if (x1 - x0 < 0.25) continue;
        const m = Math.max(1, Math.round((x1 - x0) / 0.5));
        for (let i = 0; i < m; i++) {
          const w = (x1 - x0) / m, x = x0 + (i + 0.5) * w, yc = upY - upH / 2 + 0.2;
          box(g, w - 0.008, upH, 0.34, front, x, yc, 0.17);
          box(g, w - 0.1, upH - 0.1, 0.01, std({ color: '#cfdde0', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }), x, yc, 0.345);
          box(g, w - 0.1, 0.012, 0.28, std({ color: '#e9e4da', roughness: 0.5 }), x, yc, 0.17);
          for (let k = 0; k < 3; k++) cyl(g, 0.035, 0.03, 0.09, M.ceramic(), x - w * 0.25 + k * w * 0.25, yc + 0.05, 0.18, 12);
          box(g, 0.012, 0.1, 0.02, gd, x + w / 2 - 0.06, yc - upH / 2 + 0.12, 0.36);
        }
      }
      g.userData.tops = kitchenTops(L, sx, 0.89);
      return putOnWall(g, seg, b.a0 + L / 2);
    },
  },
  bathtub: {
    // タイル張りのレトロ浴槽：外側はミントの小さなタイル
    retro(b) {
      const g = new THREE.Group();
      const tl = tileM('#9fcfc0', '#f4f2ee', 10), ce = M.ceramic();
      tubShell(g, b.w, b.d, 0.55, 0.1, tl, std({ color: '#f2f4f2', roughness: 0.2 }), 0.42);
      for (const s of [-1, 1]) box(g, b.w, 0.03, 0.1, ce, 0, 0.55, s * (b.d / 2 - 0.05));
      for (const s of [-1, 1]) box(g, 0.1, 0.03, b.d, ce, s * (b.w / 2 - 0.05), 0.55, 0);
      box(g, b.w - 0.2, 0.04, 0.08, ce, 0, 0.53, -b.d / 2 + 0.13);
      // 2つハンドルの水栓
      const ch = M.chrome(), sp = new THREE.Group();
      tube(sp, [[0, 0.72, -b.d / 2 - 0.02], [0, 0.74, -b.d / 2 + 0.08], [0, 0.68, -b.d / 2 + 0.14]], 0.016, ch);
      for (const s of [-1, 1]) { cyl(sp, 0.012, 0.012, 0.06, ch, s * 0.1, 0.76, -b.d / 2 + 0.02, 10).rotation.x = Math.PI / 2; const k = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 4), ch); k.position.set(s * 0.1, 0.76, -b.d / 2 + 0.06); sp.add(k); }
      sp.position.x = b.w / 2 - 0.3; g.add(sp);
      g.userData.tops = [{ x0: -b.w / 2 + 0.06, x1: b.w / 2 - 0.46, z0: -b.d / 2 + 0.005, z1: -b.d / 2 + 0.17, y: 0.565 }];
      g.position.set(b.x, 0, b.z);
      return g;
    },
    // 猫足の浴槽（★4）：白いホーローのだ円の湯船・黒い猫足・床から立ち上がる水栓
    clawfoot(b) { return clawTub(b, std({ color: '#f4f2ee', roughness: 0.15 }), std({ color: '#222222', roughness: 0.35, metalness: 0.7 }), M.chrome()); },
    // 金の猫足浴槽（★5）：外側が金・内側が白・金の猫足と金の水栓
    goldclaw(b) { return clawTub(b, std({ color: '#d4a94e', roughness: 0.2, metalness: 1 }), gold(), gold(), true); },
  },
  fridge: {
    // 丸いレトロ冷蔵庫：角の丸いクリーム色・クロームのレバー
    retro(b, seg) {
      const g = new THREE.Group();
      const body = std({ color: '#f1e3c4', roughness: 0.25 });
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.55, 0.68, 6, 0.12), body); m.position.set(0, 0.85, 0.34); m.castShadow = true; m.receiveShadow = true; g.add(m);
      box(g, 0.6, 0.08, 0.6, std({ color: '#3a3836', roughness: 0.6 }), 0, 0.04, 0.32);
      box(g, 0.64, 0.006, 0.01, std({ color: '#cdbb98' }), 0, 1.22, 0.684);
      const ch = M.chrome();
      box(g, 0.05, 0.16, 0.05, ch, -0.26, 1.05, 0.7);
      box(g, 0.05, 0.12, 0.05, ch, -0.26, 1.35, 0.7);
      box(g, 0.2, 0.04, 0.012, ch, 0, 0.3, 0.684);
      return putOnWall(g, seg, b.a);
    },
    // 両開きの大型冷蔵庫：ステンレス・上が両開き・下が引き出し・縦の取っ手
    french(b, seg) {
      const g = new THREE.Group();
      const st = brushed(), dk = M.dark(), h = std({ color: '#8f9398', roughness: 0.2, metalness: 1 });
      box(g, 0.8, 1.85, 0.7, st, 0, 0.925, 0.35);
      box(g, 0.004, 1.1, 0.01, dk, 0, 1.3, 0.705);
      box(g, 0.78, 0.006, 0.01, dk, 0, 0.72, 0.705);
      for (const s of [-1, 1]) box(g, 0.025, 0.7, 0.04, h, s * 0.05, 1.3, 0.73);
      box(g, 0.5, 0.025, 0.04, h, 0, 0.66, 0.73);
      box(g, 0.08, 0.12, 0.006, std({ color: '#111', emissive: '#6fc6ff', emissiveIntensity: 0.4 }), -0.2, 1.45, 0.704);
      return putOnWall(g, seg, b.a);
    },
    // ガラス扉の冷蔵庫（★4）：黒い枠・中にびんが並んで、ほんのり光る
    glass(b, seg) {
      const g = new THREE.Group();
      const blk = std({ color: '#1a1a1c', roughness: 0.35, metalness: 0.5 });
      box(g, 0.7, 1.82, 0.04, blk, 0, 0.91, 0.02);
      for (const s of [-1, 1]) box(g, 0.04, 1.82, 0.68, blk, s * 0.33, 0.91, 0.34);
      box(g, 0.7, 0.1, 0.68, blk, 0, 0.05, 0.34); box(g, 0.7, 0.12, 0.68, blk, 0, 1.76, 0.34);
      const inner = std({ color: '#e8eef2', roughness: 0.4, emissive: '#cfe6ff', emissiveIntensity: 0.35 });
      box(g, 0.62, 1.6, 0.01, inner, 0, 0.9, 0.045);
      const cols = ['#2a6a3a', '#c9a35a', '#7a1f2a', '#e9e4da', '#3a6ab0', '#f2c84b'];
      for (let r = 0; r < 4; r++) {
        const y = 0.2 + r * 0.38;
        box(g, 0.62, 0.01, 0.6, std({ color: '#dfe8ec', roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false }), 0, y, 0.34);
        for (let k = 0; k < 6; k++) cyl(g, 0.03, 0.03, r === 3 ? 0.12 : 0.24, std({ color: cols[(k + r) % 6], roughness: 0.15 }), -0.24 + k * 0.096, y + 0.005, 0.3, 10);
      }
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 1.6), std({ color: '#cfdde3', roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false }));
      door.position.set(0, 0.92, 0.68); g.add(door);
      box(g, 0.025, 1.0, 0.04, std({ color: '#c9a35a', roughness: 0.25, metalness: 1 }), -0.27, 0.95, 0.71);
      const lt = new THREE.PointLight('#d6ecff', 0.6, 1.4, 2); lt.position.set(0, 1.4, 0.4); g.add(lt);
      return putOnWall(g, seg, b.a);
    },
  },
  vanity: {
    // 木のカウンターと置き型ボウル：オークの台・白い器の洗面ボウル・丸い鏡・真ちゅうの壁の水栓
    woodbowl(b, seg) {
      const g = new THREE.Group();
      const wd = woodM('#c49a64', '#7a5432', 'vanity'), br = gold();
      box(g, 0.94, 0.06, 0.52, wd, 0, 0.8, 0.27);
      box(g, 0.94, 0.03, 0.46, wd, 0, 0.25, 0.25);
      for (const sx of [-1, 1]) box(g, 0.04, 0.8, 0.5, wd, sx * 0.45, 0.4, 0.26);
      for (let i = 0; i < 3; i++) { const t = box(g, 0.24, 0.12, 0.3, std({ color: ['#e9e4da', '#cfdcd8', '#e9e4da'][i], roughness: 1 }), -0.28 + i * 0.28, 0.27 + 0.06, 0.25); }
      const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.13, 0], [0.18, 0.05], [0.2, 0.13], [0.19, 0.13], [0.17, 0.06], [0.001, 0.015]].map(p => new THREE.Vector2(p[0], p[1])), 32), M.ceramic());
      bowl.position.set(0, 0.86, 0.27); bowl.castShadow = true; g.add(bowl);
      cyl(g, 0.017, 0.017, 0.12, br, 0, 1.12, 0.06, 10).rotation.x = Math.PI / 2;
      // 丸い鏡（真ちゅうの枠）
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 48), br); ring.position.set(0, 1.62, 0.02); g.add(ring);
      const mir = new THREE.Mesh(new THREE.CircleGeometry(0.29, 40), std({ color: '#f2f6f8', roughness: 0.14, metalness: 0.75, emissive: '#5e666a', emissiveIntensity: 0.35 })); mir.position.set(0, 1.62, 0.012); g.add(mir);
      g.userData.tops = [{ x0: -0.45, x1: -0.22, z0: 0.04, z1: 0.52, y: 0.86 }, { x0: 0.22, x1: 0.45, z0: 0.04, z1: 0.52, y: 0.86 }];
      return putOnWall(g, seg, b.a);
    },
    // 脚つき陶器のレトロ洗面台：柱の上の白い洗面ボウル・だ円の鏡・ガラスの小さな棚
    pedestal(b, seg) {
      const g = new THREE.Group();
      const ce = M.ceramic(), ch = M.chrome();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.72, 20), ce); col.position.set(0, 0.36, 0.22); col.castShadow = true; g.add(col);
      const basin = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 0.46, 4, 0.06), ce); basin.position.set(0, 0.8, 0.24); basin.castShadow = true; g.add(basin);
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#e9eef0', roughness: 0.2, side: THREE.BackSide })); hole.scale.set(1.2, 0.4, 0.9); hole.position.set(0, 0.885, 0.27); g.add(hole);
      for (const s of [-1, 1]) { cyl(g, 0.012, 0.014, 0.08, ch, s * 0.18, 0.92, 0.07, 10); const k = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 4), ch); k.rotation.x = Math.PI / 2; k.position.set(s * 0.18, 0.97, 0.07); g.add(k); }
      tube(g, [[0, 0.88, 0.05], [0, 0.98, 0.08], [0, 0.94, 0.15]], 0.012, ch);
      // だ円の鏡
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 8, 40), std({ color: '#e8e2d6', roughness: 0.4 })); ring.scale.set(1, 1.3, 1); ring.position.set(0, 1.6, 0.02); g.add(ring);
      const mir = new THREE.Mesh(new THREE.CircleGeometry(0.25, 36), std({ color: '#f2f6f8', roughness: 0.14, metalness: 0.75, emissive: '#5e666a', emissiveIntensity: 0.35 })); mir.scale.set(1, 1.3, 1); mir.position.set(0, 1.6, 0.012); g.add(mir);
      box(g, 0.5, 0.012, 0.12, std({ color: '#dfe9ec', roughness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }), 0, 1.18, 0.06);
      for (const s of [-1, 1]) box(g, 0.02, 0.03, 0.12, ch, s * 0.24, 1.165, 0.06);
      g.userData.tops = [{ x0: -0.25, x1: 0.25, z0: 0.005, z1: 0.12, y: 1.186 }];
      return putOnWall(g, seg, b.a);
    },
    // 大理石の二つボウル（★5）：大理石のカウンター・器のボウル2つ・金の水栓・大きな鏡と明かり
    marble2(b, seg) {
      const g = new THREE.Group();
      const mb = marbleM(false), gd = gold(), W = 1.1;
      box(g, W, 0.1, 0.54, mb, 0, 0.78, 0.27);
      box(g, W - 0.04, 0.5, 0.5, std({ color: '#2a2a2c', roughness: 0.35 }), 0, 0.26, 0.26);
      for (const sx of [-0.27, 0.27]) { box(g, 0.48, 0.42, 0.012, std({ color: '#34343a', roughness: 0.3 }), sx, 0.27, 0.512); box(g, 0.2, 0.012, 0.02, gd, sx, 0.46, 0.525); }
      for (const sx of [-0.28, 0.28]) {
        const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.1, 0], [0.16, 0.05], [0.17, 0.11], [0.16, 0.11], [0.15, 0.05], [0.001, 0.012]].map(p => new THREE.Vector2(p[0], p[1])), 32), M.ceramic());
        bowl.position.set(sx, 0.83, 0.29); bowl.castShadow = true; g.add(bowl);
        cyl(g, 0.016, 0.02, 0.3, gd, sx, 0.98, 0.07, 12);
        tube(g, [[sx, 1.13, 0.07], [sx, 1.17, 0.13], [sx, 1.1, 0.2]], 0.011, gd);
      }
      const frame = std({ color: '#c9a35a', roughness: 0.25, metalness: 1 });
      box(g, W, 0.8, 0.03, frame, 0, 1.62, 0.015);
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, 0.74), std({ color: '#f2f6f8', roughness: 0.12, metalness: 0.8, emissive: '#5e666a', emissiveIntensity: 0.35 })); mir.position.set(0, 1.62, 0.032); g.add(mir);
      for (const sx of [-0.4, 0, 0.4]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), std({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 1.3 })); l.position.set(sx, 2.1, 0.08); g.add(l); box(g, 0.02, 0.02, 0.06, frame, sx, 2.1, 0.03); }
      g.userData.tops = [{ x0: -0.54, x1: -0.46, z0: 0.06, z1: 0.52, y: 0.83 }, { x0: -0.1, x1: 0.1, z0: 0.12, z1: 0.52, y: 0.83 }, { x0: 0.46, x1: 0.54, z0: 0.06, z1: 0.52, y: 0.83 }];
      return putOnWall(g, seg, b.a);
    },
  },
  washer: {
    // 縦型の洗たく機：上にふた・奥に操作パネル
    top(b) {
      const g = new THREE.Group();
      box(g, 0.6, 0.9, 0.6, M.white(), 0, 0.45, 0);
      box(g, 0.52, 0.02, 0.4, std({ color: '#dfe6ea', roughness: 0.1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.91, 0.06);
      box(g, 0.6, 0.16, 0.12, M.white(), 0, 0.98, -0.24);
      box(g, 0.4, 0.06, 0.01, std({ color: '#1c2228', emissive: '#7fd0ff', emissiveIntensity: 0.4 }), 0, 1.0, -0.175);
      box(g, 0.56, 0.06, 0.02, std({ color: '#e2e2e2', roughness: 0.3 }), 0, 0.06, 0.3);
      g.userData.tops = [{ x0: -0.3, x1: 0.3, z0: 0.12, z1: 0.3, y: 0.92 }];
      g.position.set(b.x, 0, b.z);
      return g;
    },
    // レトロな二槽式：水色・ふたが2つ・つまみ
    twin(b) {
      const g = new THREE.Group();
      const body = std({ color: '#a8d0d8', roughness: 0.35 });
      box(g, 0.62, 0.86, 0.5, body, 0, 0.43, 0.05);
      box(g, 0.6, 0.02, 0.44, M.white(), 0, 0.87, 0.06);
      for (const s of [-1, 1]) box(g, 0.27, 0.02, 0.32, std({ color: '#f4f2ee', roughness: 0.3 }), s * 0.15, 0.885, 0.1);
      box(g, 0.62, 0.12, 0.1, body, 0, 0.92, -0.17);
      for (let i = 0; i < 3; i++) { const k = cyl(g, 0.025, 0.025, 0.03, std({ color: '#f4f2ee', roughness: 0.3 }), -0.18 + i * 0.18, 0.95, -0.115, 14); k.rotation.x = Math.PI / 2; }
      box(g, 0.5, 0.05, 0.01, std({ color: '#e9e4da', roughness: 0.5 }), 0, 0.15, 0.305);
      g.userData.tops = [];
      g.position.set(b.x, 0, b.z);
      return g;
    },
  },
};
// 猫足の浴槽（だ円）
function clawTub(b, outM, footM, tapM, rich) {
  const g = new THREE.Group();
  const sx = b.w / 2 - 0.08, sz = b.d / 2 - 0.04;
  ovalTub(g, sx, sz, 0.5, outM, std({ color: '#f6f6f4', roughness: 0.15 }), 0.12);
  // ふちの金・白
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 8, 48), rich ? gold() : std({ color: '#f6f6f4', roughness: 0.15 }));
  rim.rotation.x = Math.PI / 2; rim.scale.set(sx, sz, 1); rim.position.y = 0.62; g.add(rim);
  clawFeet(g, sx, sz, footM);
  // 床から立ち上がる水栓（奥の右）
  const tx = sx * 0.55, tz = -sz - 0.02;
  cyl(g, 0.018, 0.018, 0.85, tapM, tx, 0.425, tz, 10);
  tube(g, [[tx, 0.85, tz], [tx, 0.92, tz + 0.06], [tx, 0.86, tz + 0.15]], 0.016, tapM);
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), tapM); k.position.set(tx + s * 0.06, 0.8, tz); g.add(k); }
  // お風呂のトレイ（湯船にわたす木の板。小物をのせられる）
  const tray = std({ color: rich ? '#6b4a32' : '#c49a64', roughness: 0.55 });
  box(g, 0.2, 0.02, sz * 2 + 0.12, tray, -sx * 0.25, 0.64, 0);
  g.userData.tops = [{ x0: -sx * 0.25 - 0.09, x1: -sx * 0.25 + 0.09, z0: -sz * 0.75, z1: sz * 0.75, y: 0.65 }];
  g.position.set(b.x, 0, b.z);
  return g;
}

// エアコン（いつもの / 壁かけスリム / 木目パネル）。壁の面が z=0
export function buildAircon(shape, variant) {
  const ac = new THREE.Group();
  const white = std({ color: '#f4f2ee', roughness: 0.35 });
  const add = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; ac.add(m); return m; };
  if (shape === 'slim') {
    add(0.86, 0.25, 0.17, white, 0, 0, 0.085);
    add(0.86, 0.22, 0.008, std({ color: '#e9e7e3', roughness: 0.6 }), 0, 0.01, 0.172);
    add(0.78, 0.02, 0.03, std({ color: '#cfccc6', roughness: 0.5 }), 0, -0.115, 0.15, 0.5);
    add(0.2, 0.004, 0.004, std({ color: '#000', emissive: '#7fd0ff', emissiveIntensity: 1.2 }), 0, -0.08, 0.177);
  } else if (shape === 'wood') {
    add(0.82, 0.28, 0.21, white, 0, 0, 0.105);
    add(0.82, 0.2, 0.012, woodM('#b98a55', '#6e4a2a', 'acwood'), 0, 0.035, 0.214);
    add(0.74, 0.03, 0.03, std({ color: '#3a3836', roughness: 0.5 }), 0, -0.11, 0.19, 0.4);
    add(0.03, 0.006, 0.004, std({ color: '#000', emissive: '#ffcf7a', emissiveIntensity: 1.5 }), 0.32, -0.07, 0.217);
  } else {
    add(0.8, 0.28, 0.22, white, 0, 0, 0.11);
    add(0.78, 0.2, 0.01, std({ color: '#fbfaf8', roughness: 0.2 }), 0, 0.03, 0.222);
    add(0.7, 0.04, 0.02, std({ color: '#c9c6c0', roughness: 0.5 }), 0, -0.115, 0.2, 0.4);
    add(0.03, 0.006, 0.004, std({ color: '#000', emissive: '#58e07a', emissiveIntensity: 1.5 }), 0.3, -0.07, 0.228);
  }
  if (variant) applyFixVariant(ac, 'aircon', variant);
  return ac;
}

// 部屋にある、形や色を変えられる備え付けの種類（エアコンもふくむ）
export function fixKindsOf(sh) {
  const out = [...new Set((sh.built || []).map(b => b.kind))].filter(k => FIX_VARIANTS[k]);
  if (sh.ac && !sh.plain) out.push('aircon');
  return out;
}
// その種類で選べる形（いつもの + 買える形 + ガチャの形）。id は SHAPES の名前
export const FIX_SHAPE_NAMES = {
  kitchen: { country: '木のカントリー', steel: 'ステンレスの業務用', marble: '大理石の天板' },
  bathtub: { retro: 'タイル張りのレトロ', clawfoot: '猫足', goldclaw: '金の猫足' },
  fridge: { retro: '丸いレトロ', french: '両開きの大型', glass: 'ガラス扉' },
  vanity: { woodbowl: '木のカウンターと置き型ボウル', pedestal: '脚つき陶器のレトロ', marble2: '大理石の二つボウル' },
  washer: { top: '縦型', twin: 'レトロな二槽式' },
  aircon: { slim: '壁かけスリム', wood: '木目パネル' },
};
// 一覧の見本・ガチャの演出用：備え付けの形を、部屋の外で1つだけ作る（壁の面が z=0、部屋の中が +z）
export async function fixturePreview(kind, shape) {
  if (kind === 'aircon') { const g = buildAircon(shape); g.position.y = 0.2; return g; }
  const seg = { axis: 'z', n: 1, c: 0, id: 'pv' };
  const sh = { h: 2.4, walls: [seg], windows: [] };
  const dims = { kitchen: { len: 2.4, a0: -1.2 }, bathtub: { w: 1.6, d: 0.8, x: 0, z: 0.4 }, washer: { x: 0, z: 0.31 }, fridge: { a: 0 }, vanity: { a: 0 } }[kind] || {};
  const b = { kind, wall: 'pv', ...dims };
  const fn = SHAPES[kind]?.[shape] || BUILD[kind];
  return fn ? await fn(b, seg, sh) : null;
}

// ===================== 山小屋の備え付け（暖炉・薪ストーブ・天井の丸太の梁） =====================
// 石積みの質感
const stoneM = (base = '#8f8a82') => cvMat('stone' + base, 256, 256, (x, w, h) => {
  x.fillStyle = '#4a4640'; x.fillRect(0, 0, w, h);
  let r = 5; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const b = new THREE.Color(base);
  // 大きさのちがう石を、すこしずつずらして積む（形はでこぼこの多角形）
  let y = 0;
  while (y < h) {
    const rh = 18 + rnd() * 22; let cx = -rnd() * 40;
    while (cx < w) {
      const sw = 26 + rnd() * 46, c = b.clone().offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.18);
      x.fillStyle = '#' + c.getHexString();
      x.beginPath();
      const n = 7, cxm = cx + sw / 2, cym = y + rh / 2;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 0.82 + rnd() * 0.18; x.lineTo(cxm + Math.cos(a) * (sw / 2 - 2) * k, cym + Math.sin(a) * (rh / 2 - 2) * k); }
      x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(cx + sw * 0.25, y + 3, sw * 0.4, 3);
      for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`; x.fillRect(cx + rnd() * sw, y + rnd() * rh, 2, 2); }
      cx += sw;
    }
    y += rh;
  }
}, { rough: 0.92, rep: [1.5, 2] });
// ゆらめく炎（光る円すい）と、熾火の光
function fire(g, x, y, z, w, n = 6) {
  const flames = [];
  const outer = std({ color: '#000000', emissive: '#ff7a1a', emissiveIntensity: 2.4, transparent: true, opacity: 0.85, depthWrite: false });
  const inner = std({ color: '#000000', emissive: '#ffd27a', emissiveIntensity: 3, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < n; i++) {
    const fx = x - w / 2 + (i + 0.5) * w / n;
    const o = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 8, 1, true), outer); o.position.set(fx, y + 0.13, z); o.castShadow = false; g.add(o);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.15, 8, 1, true), inner); c.position.set(fx, y + 0.08, z + 0.01); c.castShadow = false; g.add(c);
    flames.push([o, c, i * 1.7]);
  }
  const ember = std({ color: '#2a0d04', emissive: '#ff5a1a', emissiveIntensity: 1.3, roughness: 0.9 });
  box(g, w, 0.025, 0.18, ember, x, y + 0.012, z).castShadow = false;
  const light = new THREE.PointLight('#ff9a4a', 1.6, 6, 2); light.position.set(x, y + 0.35, z + 0.35); g.add(light);
  g.userData.tick = (t) => {
    for (const [o, c, ph] of flames) {
      const k = 0.8 + 0.3 * Math.sin(t * 7 + ph) * Math.sin(t * 3.1 + ph * 2);
      o.scale.set(1, k, 1); o.position.y = y + 0.13 * k; c.scale.set(1, 0.9 + 0.25 * Math.sin(t * 9 + ph), 1);
    }
    ember.emissiveIntensity = 1.2 + 0.35 * Math.sin(t * 2.3) * Math.sin(t * 3.7);
    light.intensity = 1.5 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.9);
  };
}
function logs(g, x, y, z, w) {
  const bark = std({ color: '#5a3d28', roughness: 0.95 }), cut = std({ color: '#c99a68', roughness: 0.8 });
  for (const [dx, dy, ry] of [[-0.12, 0, 0.25], [0.12, 0, -0.2], [0, 0.07, 0.05]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, w * 0.8, 10, 1, false), [bark, cut, cut]);
    l.rotation.set(0, ry, Math.PI / 2); l.position.set(x + dx * 0.4, y + 0.05 + dy, z + dx * 0.3); l.castShadow = true; g.add(l);
  }
}
Object.assign(BUILD, {
  // 石積みの暖炉：壁から出た石の胸壁・炉・木の梁のマントル（上に小物を置ける）・石の炉台
  fireplace(b, seg, sh) {
    const g = new THREE.Group();
    const W0 = b.len || 1.7, D = 0.45, st = stoneM('#9a948a');
    // 胸壁（炉の口をあけて、左右と上）
    box(g, (W0 - 0.9) / 2, 1.0, D, st, -W0 / 2 + (W0 - 0.9) / 4, 0.5, D / 2);
    box(g, (W0 - 0.9) / 2, 1.0, D, st, W0 / 2 - (W0 - 0.9) / 4, 0.5, D / 2);
    box(g, W0, sh.h - 1.0, D, st, 0, 1.0 + (sh.h - 1.0) / 2, D / 2);
    // 炉の中（すすけた奥）
    const soot = std({ color: '#1a1614', roughness: 1 });
    box(g, 0.9, 1.0, 0.04, soot, 0, 0.5, 0.02);
    box(g, 0.9, 0.04, D, soot, 0, 0.98, D / 2);
    // 炉台
    box(g, W0 + 0.3, 0.12, 0.55, stoneM('#7f7a72'), 0, 0.06, D + 0.15);
    // 鉄の薪台と薪・炎
    const iron = std({ color: '#222', roughness: 0.5, metalness: 0.6 });
    for (const sx of [-1, 1]) { box(g, 0.03, 0.12, 0.3, iron, sx * 0.25, 0.18, 0.25); }
    logs(g, 0, 0.18, 0.25, 0.7);
    fire(g, 0, 0.26, 0.25, 0.5, 6);
    // 木の梁のマントル
    const beam = std({ color: '#6b4a30', roughness: 0.75 });
    box(g, W0 + 0.2, 0.16, 0.24, beam, 0, 1.18, D + 0.02);
    // 火かき棒のスタンド
    const tl = new THREE.Group();
    cyl(tl, 0.08, 0.09, 0.02, iron, 0, 0.01, 0, 12); cyl(tl, 0.008, 0.008, 0.7, iron, 0, 0.36, 0, 6);
    for (let i = 0; i < 3; i++) { const t = cyl(tl, 0.006, 0.006, 0.62, std({ color: '#3a3a3a', roughness: 0.4, metalness: 0.7 }), Math.cos(i * 2.1) * 0.03, 0.42, Math.sin(i * 2.1) * 0.03, 6); t.rotation.z = 0.06; }
    tl.position.set(W0 / 2 + 0.05, 0.12, D + 0.2); g.add(tl);
    g.userData.tops = [{ x0: -W0 / 2 - 0.08, x1: W0 / 2 + 0.08, z0: D - 0.08, z1: D + 0.13, y: 1.34 }];
    return putOnWall(g, seg, b.a);
  },
  // 鉄の薪ストーブ：脚つきの箱・ガラスの扉の炎・煙突・石の炉台・薪かご（ストーブの上に小物を置ける）
  woodstove(b, seg, sh) {
    const g = new THREE.Group();
    const iron = std({ color: '#2a2928', roughness: 0.55, metalness: 0.4 });
    const z0 = 0.45;
    box(g, 1.1, 0.04, 1.0, stoneM('#6f6b66'), 0, 0.02, 0.5);
    box(g, 1.1, 1.3, 0.03, stoneM('#8a857d'), 0, 0.65, 0.015); // 壁の石の板（熱よけ）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.16, 0.04, iron, sx * 0.24, 0.12, z0 + sz * 0.2);
    box(g, 0.56, 0.52, 0.48, iron, 0, 0.46, z0);
    box(g, 0.6, 0.03, 0.52, iron, 0, 0.735, z0);
    // ガラスの扉と炎
    const fr = std({ color: '#1a1918', roughness: 0.4, metalness: 0.5 });
    box(g, 0.42, 0.34, 0.02, fr, 0, 0.45, z0 + 0.245);
    logs(g, 0, 0.3, z0 + 0.05, 0.4);
    fire(g, 0, 0.36, z0 + 0.08, 0.3, 4);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), std({ color: '#2a1408', emissive: '#ff8a3a', emissiveIntensity: 0.35, transparent: true, opacity: 0.35, depthWrite: false }));
    glass.position.set(0, 0.45, z0 + 0.257); g.add(glass);
    const hd = cyl(g, 0.012, 0.012, 0.12, std({ color: '#c9a35a', roughness: 0.3, metalness: 1 }), 0.17, 0.45, z0 + 0.27, 8);
    // 煙突（上へ、天井まで）
    cyl(g, 0.075, 0.075, sh.h - 0.75, iron, 0, 0.75 + (sh.h - 0.75) / 2, z0 - 0.08, 16);
    // 薪かご
    const bk = new THREE.Group();
    box(bk, 0.4, 0.22, 0.3, std({ color: '#7a5a3a', roughness: 0.9 }), 0, 0.11, 0);
    for (let i = 0; i < 5; i++) { const l = cyl(bk, 0.04, 0.045, 0.36, std({ color: '#6b4a30', roughness: 0.95 }), -0.12 + i * 0.06, 0.25 + (i % 2) * 0.03, 0, 8); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; }
    bk.position.set(0.85, 0.04, 0.4); g.add(bk);
    g.userData.tops = [{ x0: -0.28, x1: 0.28, z0: z0 - 0.02, z1: z0 + 0.24, y: 0.75 }];
    return putOnWall(g, seg, b.a);
  },
  // 天井の丸太の梁（家具の置き方のじゃまはしない）
  beams(b, seg, sh) {
    const g = new THREE.Group();
    const wood = std({ color: '#6b4a30', roughness: 0.8 });
    for (const z of b.zs || [-1.2, 1.2]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, sh.w, 12), wood);
      m.rotation.z = Math.PI / 2; m.position.set(0, sh.h - 0.1, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    return g;
  },
});

// 備え付けの物を作る。戻り値 { obj, block }（block = 'all' 家具を重ねない / 'wall' 壁の物だけ重ねない）
// 備え付けの物の「種類」（色・素材）。模様がえでいつでも取りかえられる（買わなくてよい）。
// tint = 金属・ガラス・水以外の部分にかける色。null は元のまま
export const FIX_NAMES = { kitchen: 'キッチン', fridge: '冷蔵庫', bathtub: '浴槽', hinoki: '湯船', shower: 'シャワー', washarea: '洗い場', vanity: '洗面台', washer: '洗たく機', closet: '押し入れ・収納', shoji: '障子', tokonoma: '床の間', fusuma: 'ふすま', shutter: 'シャッター', workbench: '作業台', aircon: 'エアコン', fireplace: '暖炉', woodstove: '薪ストーブ', beams: '天井の梁' };
const V = (id, name, tint) => ({ id, name, tint });
const BASIC = [V('std', 'いつもの', null), V('wood', '木目', '#c99a68'), V('dark', 'ブラック', '#3a3836'), V('sage', 'セージ', '#a9bea0'), V('navy', 'ネイビー', '#5c6f93')];
export const FIX_VARIANTS = {
  kitchen: BASIC, closet: BASIC, workbench: [V('std', 'いつもの', null), V('dark', 'こげ茶', '#5b4636'), V('grey', 'グレー', '#8d8d8d')],
  fridge: [V('std', 'ホワイト', null), V('silver', 'シルバー', '#b8bcc2'), V('dark', 'ブラック', '#3a3a3c'), V('mint', 'ミント', '#b9dccb'), V('cream', 'クリーム', '#efe0bf')],
  bathtub: [V('std', 'ホワイト', null), V('beige', 'ベージュ', '#e8d8bd'), V('dark', 'ブラック', '#4a4847'), V('blue', 'ブルー', '#a9c6d8')],
  vanity: BASIC, washer: [V('std', 'ホワイト', null), V('dark', 'ブラック', '#3a3a3c'), V('silver', 'シルバー', '#b8bcc2')],
  washarea: [V('std', 'いつもの', null), V('dark', 'ブラック', '#4a4847'), V('wood', '木目', '#c99a68')],
  shower: [V('std', 'いつもの', null), V('gold', 'ゴールド', '#d8b46a'), V('dark', 'ブラック', '#3a3a3c')],
  hinoki: [V('std', 'ひのき', null), V('dark', 'こげ茶', '#7a5a40')],
  tokonoma: [V('std', 'いつもの', null), V('dark', 'こげ茶', '#6b5240')],
  fusuma: [V('std', 'いつもの', null), V('blue', '藍色', '#7f93b5'), V('green', 'うぐいす', '#b3bd8c'), V('pink', '桜', '#e9c6c6')],
  shoji: [V('std', 'いつもの', null), V('dark', 'こげ茶の桟', '#8a7262')],
  shutter: [V('std', 'いつもの', null), V('dark', 'ブラック', '#3a3a3c'), V('red', 'レッド', '#b5574b')],
  aircon: [V('std', 'ホワイト', null), V('dark', 'ブラック', '#3a3a3c'), V('beige', 'ベージュ', '#e6d6b8')],
  fireplace: [V('std', '石積み', null), V('white', '白いしっくい', '#f2ece2'), V('dark', '黒い石', '#5a5650')],
  woodstove: [V('std', 'ブラック', null), V('red', 'えんじ', '#c45a4a'), V('green', '深緑', '#5e8a6e')],
  beams: [V('std', 'こげ茶', null), V('light', '明るい木', '#d8b48a')],
};
// 種類の色をかける（金属・ガラス・水は元のまま）
export function applyFixVariant(obj, kind, vid) {
  const v = (FIX_VARIANTS[kind] || []).find(x => x.id === vid);
  if (!v || !v.tint) return;
  const tint = new THREE.Color(v.tint);
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      if (!m || !m.color || m.metalness > 0.5 || m.transparent || m.transmission > 0) return m;
      const c = m.clone(); c.color.multiply(tint); return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

export async function buildFixture(b, sh, variant, shape) {
  const fn = (shape && SHAPES[b.kind]?.[shape]) || BUILD[b.kind];
  if (!fn) return null;
  const seg = b.wall ? sh.walls.find(w => w.id === b.wall) : (b.kind === 'shoji' ? sh.walls.find(w => w.id === sh.windows[b.win || 0].wall) : null);
  if ((b.wall || b.kind === 'shoji') && !seg) return null;
  const obj = await fn(b, seg, sh);
  obj.userData.fixture = b.kind;
  if (variant) applyFixVariant(obj, b.kind, variant);
  const block = { fusuma: 'wall', shutter: 'wall', beams: 'none' }[b.kind] || 'all';
  return { obj, block };
}
