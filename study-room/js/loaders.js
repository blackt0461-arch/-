// 素材の読み込み（部屋の中・家の外で共通）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS } from './assets.js';

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const texCache = new Map();
const modelCache = new Map();

export function loadTex(url, srgb) {
  const k = url + srgb;
  if (!texCache.has(k)) {
    texCache.set(k, new Promise((res) => {
      texLoader.load(url, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, () => res(null));
    }));
  }
  return texCache.get(k);
}

// Poly Haven の質感を読み込んで材質を作る。repeat は 1m あたりの繰り返し
export async function texturedMaterial(texId, opts = {}) {
  const t = ASSETS.textures[texId];
  const mat = new THREE.MeshStandardMaterial({ color: opts.tint || '#ffffff', roughness: 1, metalness: 0 });
  if (!t) return mat;
  const [map, normal, rough] = await Promise.all([
    t.map ? loadTex(t.map, true) : null,
    t.normal ? loadTex(t.normal, false) : null,
    t.rough ? loadTex(t.rough, false) : null,
  ]);
  mat.map = map; mat.normalMap = normal; mat.roughnessMap = rough;
  mat.userData.rep = opts.rep || 1;
  mat.needsUpdate = true;
  return mat;
}

export function loadModel(id) {
  const a = ASSETS.models[id];
  if (!a) return Promise.resolve(null);
  if (!modelCache.has(id)) {
    modelCache.set(id, new Promise(res => {
      // gltf の中の「textures/○○.jpg」を、Poly Haven の本当の置き場所に読みかえる
      const mgr = new THREE.LoadingManager();
      const base = a.url.slice(0, a.url.lastIndexOf('/') + 1);
      mgr.setURLModifier(u => {
        const rel = u.startsWith(base) ? u.slice(base.length) : u;
        return (a.inc && a.inc[rel]) || u;
      });
      new GLTFLoader(mgr).load(a.url, g => res(g.scene), undefined, () => res(null));
    }));
  }
  return modelCache.get(id).then(s => s && s.clone(true));
}

// テクスチャの繰り返しを、面の大きさ（m）に合わせる
export function fitMaterial(mat, wMeters, hMeters) {
  const m = mat.clone();
  const rep = mat.userData.rep || 1;
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (mat[k]) {
      m[k] = mat[k].clone();
      m[k].repeat.set(wMeters / rep, hMeters / rep);
      m[k].needsUpdate = true;
    }
  }
  return m;
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = cast; o.receiveShadow = receive;
      if (o.material && o.material.transparent) o.castShadow = false;
    }
  });
}

