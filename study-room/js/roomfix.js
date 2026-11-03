// 部屋に最初から備え付けの物（浴槽・シャワー・キッチン・洗面台・床の間 など）。
// 買えない・置ける数に入らない。部屋の殻（壁・床）の一部として room3d.js が作る。
// どれも「壁の内側の面が z=0、部屋の中が +z」の向きで作って、壁に合わせて回す。
import * as THREE from 'three';
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
    return putOnWall(g, seg, b.a);
  },
};

// 備え付けの物を作る。戻り値 { obj, block }（block = 'all' 家具を重ねない / 'wall' 壁の物だけ重ねない）
// 備え付けの物の「種類」（色・素材）。模様がえでいつでも取りかえられる（買わなくてよい）。
// tint = 金属・ガラス・水以外の部分にかける色。null は元のまま
export const FIX_NAMES = { kitchen: 'キッチン', fridge: '冷蔵庫', bathtub: '浴槽', hinoki: '湯船', shower: 'シャワー', washarea: '洗い場', vanity: '洗面台', washer: '洗たく機', closet: '押し入れ・収納', shoji: '障子', tokonoma: '床の間', fusuma: 'ふすま', shutter: 'シャッター', workbench: '作業台' };
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

export async function buildFixture(b, sh, variant) {
  const fn = BUILD[b.kind];
  if (!fn) return null;
  const seg = b.wall ? sh.walls.find(w => w.id === b.wall) : (b.kind === 'shoji' ? sh.walls.find(w => w.id === sh.windows[b.win || 0].wall) : null);
  if ((b.wall || b.kind === 'shoji') && !seg) return null;
  const obj = await fn(b, seg, sh);
  obj.userData.fixture = b.kind;
  if (variant) applyFixVariant(obj, b.kind, variant);
  const block = { fusuma: 'wall', shutter: 'wall' }[b.kind] || 'all';
  return { obj, block };
}
