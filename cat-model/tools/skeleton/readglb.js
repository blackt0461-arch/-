// 1つのメッシュと画像だけの簡単な glb を読む（ベンガル猫の皮ふ用）
import { readFileSync } from 'node:fs';

export function readSimpleGLB(path) {
  const buf = readFileSync(path);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl + 8;
  const view = (i) => { const v = j.bufferViews[i]; return buf.subarray(bo + (v.byteOffset || 0), bo + (v.byteOffset || 0) + v.byteLength); };
  const acc = (i) => {
    const a = j.accessors[i], b = view(a.bufferView);
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * a.count;
    const C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    return new C(b.buffer.slice(b.byteOffset, b.byteOffset + n * C.BYTES_PER_ELEMENT));
  };
  const prim = j.meshes[0].primitives[0];
  const mat = j.materials[prim.material || 0];
  const img = (tex) => { if (!tex) return null; const im = j.images[j.textures[tex.index].source]; return { bytes: new Uint8Array(view(im.bufferView)), mime: im.mimeType }; };
  return {
    positions: acc(prim.attributes.POSITION), normals: acc(prim.attributes.NORMAL), uvs: acc(prim.attributes.TEXCOORD_0),
    indices: Uint32Array.from(acc(prim.indices)),
    textures: { base: img(mat.pbrMetallicRoughness?.baseColorTexture), mr: img(mat.pbrMetallicRoughness?.metallicRoughnessTexture), normal: img(mat.normalTexture) },
    credit: j.asset?.extras || {},
  };
}
