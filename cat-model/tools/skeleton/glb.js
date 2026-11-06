// glTF 2.0 バイナリ（.glb）を書き出す。外部の道具は使わない。
// nodes: [{ name, parent(index|-1), translation:[m], mesh?:{positions,normals,indices}, material?, extras? }]
// materials: [{ name, color:[r,g,b,a], roughness, metallic }]

export function writeGLB(nodes, materials, sceneExtras = {}, skin = null) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];

  const pushView = (typed, target) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const gltfNodes = nodes.map((n) => {
    const out = { name: n.name };
    if (n.translation && n.translation.some((v) => v !== 0)) out.translation = n.translation;
    if (n.extras) out.extras = n.extras;
    if (n.mesh && n.mesh.indices.length) {
      const m = n.mesh;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], m.positions[i + k]); max[k] = Math.max(max[k], m.positions[i + k]);
      }
      const count = m.positions.length / 3;
      const pv = pushView(m.positions, 34962);
      accessors.push({ bufferView: pv, componentType: 5126, count, type: 'VEC3', min, max });
      const pa = accessors.length - 1;
      // 法線は 8bit に縮めてファイルを小さくする
      // （glTF の決まりで、1頂点あたり4バイトにそろえる）
      const nq4 = new Int8Array(count * 4);
      for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++)
        nq4[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, m.normals[i * 3 + k])) * 127);
      const nv = pushView(nq4, 34962);
      bufferViews[nv].byteStride = 4;
      accessors.push({ bufferView: nv, componentType: 5120, normalized: true, count, type: 'VEC3' });
      const na = accessors.length - 1;
      const attributes = { POSITION: pa, NORMAL: na };
      if (m.colors) {
        const cv = pushView(m.colors, 34962);
        accessors.push({ bufferView: cv, componentType: 5121, normalized: true, count, type: 'VEC4' });
        attributes.COLOR_0 = accessors.length - 1;
      }
      if (m.joints) {
        const jv = pushView(m.joints, 34962);
        accessors.push({ bufferView: jv, componentType: 5123, count, type: 'VEC4' });
        attributes.JOINTS_0 = accessors.length - 1;
        const wv = pushView(m.weights, 34962);
        accessors.push({ bufferView: wv, componentType: 5126, count, type: 'VEC4' });
        attributes.WEIGHTS_0 = accessors.length - 1;
      }
      const ind = count < 65536 ? new Uint16Array(m.indices) : m.indices;
      const iv = pushView(ind, 34963);
      accessors.push({ bufferView: iv, componentType: count < 65536 ? 5123 : 5125, count: ind.length, type: 'SCALAR' });
      meshes.push({ name: n.name, primitives: [{ attributes, indices: accessors.length - 1, material: n.material ?? 0 }] });
      out.mesh = meshes.length - 1;
      if (m.joints) out.skin = 0;
    }
    return out;
  });
  nodes.forEach((n, i) => {
    if (n.parent >= 0) (gltfNodes[n.parent].children ||= []).push(i);
  });
  const roots = nodes.map((n, i) => (n.parent < 0 ? i : -1)).filter((i) => i >= 0);

  let skins;
  if (skin) {
    const iv = pushView(skin.ibm, null);
    accessors.push({ bufferView: iv, componentType: 5126, count: skin.joints.length, type: 'MAT4' });
    skins = [{ name: 'skeleton', joints: skin.joints, inverseBindMatrices: accessors.length - 1, ...(skin.skeleton != null ? { skeleton: skin.skeleton } : {}) }];
  }
  const json = {
    asset: { version: '2.0', generator: 'cat-model skeleton builder' },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ name: 'cat', nodes: roots, extras: sceneExtras }],
    nodes: gltfNodes,
    meshes,
    ...(skins ? { skins } : {}),
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metallic ?? 0, roughnessFactor: m.roughness ?? 0.7 },
      ...(m.color[3] < 1 ? { alphaMode: 'BLEND' } : {}),
      ...(m.extras ? { extras: m.extras } : {}),
      doubleSided: false,
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.length + jpad); t.set(jsonBytes); t.fill(0x20, jsonBytes.length); jsonBytes = t; }
  const bpad = (4 - (byteLength % 4)) % 4;
  const binLen = byteLength + bpad;
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
