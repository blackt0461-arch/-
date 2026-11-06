"""glb を読み、休んだ姿勢（バインドポーズ）での頂点・骨の位置を世界の座標で取り出す（開発用）。"""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    o = 20 + n
    blen = struct.unpack('<I', b[o:o + 4])[0]
    bin_ = b[o + 8:o + 8 + blen]
    return j, bin_

def accessor(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', dt.itemsize * nc)
    raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * nc, offset=off)
    out = np.lib.stride_tricks.as_strided(raw.view(dt) if stride == dt.itemsize * nc else np.frombuffer(bin_, dt, a['count'] * nc, off), shape=(a['count'], nc)) if stride == dt.itemsize * nc else \
        np.array([np.frombuffer(bin_, dt, nc, off + k * stride) for k in range(a['count'])])
    out = np.array(out, dtype=np.float64 if dt == np.float32 else dt)
    if a.get('normalized') and dt != np.float32:
        out = out / np.iinfo(dt).max
    return out

def trs(nd):
    if 'matrix' in nd:
        return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
    T = np.eye(4); T[:3, 3] = nd.get('translation', [0, 0, 0])
    x, y, z, w = nd.get('rotation', [0, 0, 0, 1])
    R = np.eye(4)
    R[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                 [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                 [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    S = np.diag(list(nd.get('scale', [1, 1, 1])) + [1])
    return T @ R @ S

def world_matrices(j):
    parent = {}
    for i, nd in enumerate(j['nodes']):
        for c in nd.get('children', []): parent[c] = i
    W = {}
    def get(i):
        if i in W: return W[i]
        m = trs(j['nodes'][i])
        if i in parent: m = get(parent[i]) @ m
        W[i] = m; return m
    for i in range(len(j['nodes'])): get(i)
    return W, parent

def bind_pose(path):
    j, bin_ = load(path)
    W, parent = world_matrices(j)
    mesh_node = next(i for i, nd in enumerate(j['nodes']) if 'mesh' in nd)
    nd = j['nodes'][mesh_node]
    prim = j['meshes'][nd['mesh']]['primitives'][0]
    P = accessor(j, bin_, prim['attributes']['POSITION'])
    I = accessor(j, bin_, prim['indices']).reshape(-1).astype(np.int64)
    M = W[mesh_node]
    Pw = (M @ np.c_[P, np.ones(len(P))].T).T[:, :3]
    joints = {}
    if 'skin' in nd:
        sk = j['skins'][nd['skin']]
        IBM = accessor(j, bin_, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        for k, ji in enumerate(sk['joints']):
            JW = M @ np.linalg.inv(IBM[k])           # 休んだ姿勢での骨の世界の行列
            joints[j['nodes'][ji].get('name')] = JW[:3, 3]
        J = accessor(j, bin_, prim['attributes']['JOINTS_0']).astype(int)
        Wt = accessor(j, bin_, prim['attributes']['WEIGHTS_0'])
        return dict(P=Pw, I=I, joints=joints, J=J, Wt=Wt, jnames=[j['nodes'][ji].get('name') for ji in sk['joints']], json=j, bin=bin_, prim=prim, mesh_node=mesh_node, M=M)
    return dict(P=Pw, I=I, joints=joints, json=j, bin=bin_, prim=prim, mesh_node=mesh_node, M=M)
