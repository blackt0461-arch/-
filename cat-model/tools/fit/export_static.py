"""直した姿勢の皮ふを、元の模様（テクスチャ）つきの動かない glb として書き出す（確認用）。"""
import json, struct, sys
import numpy as np
from gltf_read import load, accessor

def export(src, npz, out, extra_nodes=None):
    j, bin_ = load(src)
    z = np.load(npz)
    P = z['P'].astype(np.float32); I = z['I'].astype(np.uint32); UV = z['UV'].astype(np.float32)
    # 法線を計算し直す
    N = np.zeros_like(P)
    tri = I.reshape(-1, 3); fn = np.cross(P[tri[:, 1]] - P[tri[:, 0]], P[tri[:, 2]] - P[tri[:, 0]])
    for c in range(3): np.add.at(N, tri[:, c], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    chunks = []; views = []; acc = []; off = 0
    def add(data, target=None):
        nonlocal off
        pad = (-off) % 4
        if pad: chunks.append(b'\0' * pad); off += pad
        b = data.tobytes() if hasattr(data, 'tobytes') else data
        views.append(dict(buffer=0, byteOffset=off, byteLength=len(b), **({'target': target} if target else {})))
        chunks.append(b); off += len(b); return len(views) - 1
    def accs(arr, ctype, typ, target):
        v = add(arr, target); a = dict(bufferView=v, componentType=ctype, count=len(arr), type=typ)
        if typ == 'VEC3' and ctype == 5126: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        acc.append(a); return len(acc) - 1
    pa = accs(P, 5126, 'VEC3', 34962); na = accs(N.astype(np.float32), 5126, 'VEC3', 34962); ua = accs(UV, 5126, 'VEC2', 34962)
    ia = accs(I, 5125, 'SCALAR', 34963)
    images = []
    for im in j.get('images', []):
        bv = j['bufferViews'][im['bufferView']]; data = bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        images.append(dict(bufferView=add(data), mimeType=im['mimeType']))
    prim = j['meshes'][0]['primitives'][0]
    mat = json.loads(json.dumps(j['materials'][prim.get('material', 0)]))
    # TEXCOORD_0 だけを使う
    def fix(o):
        if isinstance(o, dict):
            if 'texCoord' in o: o['texCoord'] = 0
            for v in o.values(): fix(v)
        elif isinstance(o, list):
            for v in o: fix(v)
    fix(mat)
    out_j = dict(asset=dict(version='2.0', generator='cat-model fit', extras=j['asset'].get('extras', {})),
                 scene=0, scenes=[dict(nodes=[0])], nodes=[dict(name='Bengal', mesh=0)],
                 meshes=[dict(name='Bengal', primitives=[dict(attributes=dict(POSITION=pa, NORMAL=na, TEXCOORD_0=ua), indices=ia, material=0)])],
                 materials=[mat], textures=j.get('textures', []), samplers=j.get('samplers', []), images=images,
                 accessors=acc, bufferViews=views, buffers=[dict(byteLength=off)])
    jb = json.dumps(out_j).encode(); jb += b' ' * ((-len(jb)) % 4)
    bb = b''.join(chunks); bb += b'\0' * ((-len(bb)) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)
    print('→', out, round(total / 1e6, 1), 'MB')

if __name__ == '__main__':
    export(sys.argv[1], sys.argv[2], sys.argv[3])
