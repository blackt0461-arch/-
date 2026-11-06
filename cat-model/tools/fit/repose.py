"""2番（Bengal Cat）の皮ふを、元の骨組みを使って左右対称のまっすぐな立ち姿に直し、本物の大きさにそろえる（開発用）。
出力: models/bengal_rest.npz（頂点・三角形・UV・骨の位置・皮ふの重み）"""
import re, sys, json
import numpy as np
from gltf_read import bind_pose, accessor

SRC = '/home/user/-/cat-model/reference/models3d/cats/ad996702.glb'
d = bind_pose(SRC)
j = d['json']
names = d['jnames']
short = [re.sub(r'_\d+_\d+$', '', n) for n in names]
idx = {s: k for k, s in enumerate(short)}
# 骨組みの親子（skin の joints の中で）
node_of = j['skins'][0]['joints']
parent_node = {}
for i, nd in enumerate(j['nodes']):
    for c in nd.get('children', []): parent_node[c] = i
k_of_node = {n: k for k, n in enumerate(node_of)}
par = [k_of_node.get(parent_node.get(n), -1) for n in node_of]
kids = {k: [] for k in range(len(names))}
for k, p in enumerate(par):
    if p >= 0: kids[p].append(k)
def subtree(k):
    out = [k]; st = [k]
    while st:
        x = st.pop()
        for c in kids[x]: out.append(c); st.append(c)
    return out

# 休んだ姿勢の骨の世界行列
from gltf_read import load
j_, bin_ = d['json'], d['bin']
sk = j['skins'][0]
IBM = accessor(j, bin_, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
M0 = np.array([d['M'] @ np.linalg.inv(IBM[k]) for k in range(len(names))])   # 元の姿勢
Mp = M0.copy()                                                                  # 直した姿勢
pos = lambda k: Mp[k][:3, 3]

def rot_about(R, c):
    T = np.eye(4); T[:3, :3] = R; T[:3, 3] = c - R @ c; return T
def align(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); s = np.linalg.norm(v); cth = np.dot(a, b)
    if s < 1e-9: return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * ((1 - cth) / s ** 2)
def apply(k, T):
    for x in subtree(k): Mp[x] = T @ Mp[x]
def yaw(ang):
    c, s = np.cos(ang), np.sin(ang); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

# 1) 頭と首をまっすぐに
cx = (M0[idx['Chest_M']][0, 3] + M0[idx['Root_M']][0, 3]) / 2
nk, hd = idx['Neck_M'], idx['Head_M']
def translate(k, dv):
    T = np.eye(4); T[:3, 3] = dv; apply(k, T)
# 首：付け根から頭への向きを、左右にふれないように（横から見た向きはそのまま）
v = pos(hd) - pos(nk); ang = np.arctan2(v[0], v[2]); apply(nk, rot_about(yaw(-ang), pos(nk)))
# 頭：両目を結ぶ線を真横に（ヨー）、高さをそろえる（ロール）
for _ in range(3):
    e = pos(idx['Eye_L']) - pos(idx['Eye_R'])
    apply(hd, rot_about(yaw(np.arctan2(e[2], e[0])), pos(hd)))
    e = pos(idx['Eye_L']) - pos(idx['Eye_R']); r = np.arctan2(e[1], e[0])
    c_, s_ = np.cos(-r), np.sin(-r); apply(hd, rot_about(np.array([[c_, -s_, 0], [s_, c_, 0], [0, 0, 1]]), pos(hd)))
# 首から先を、体のまん中（cx）にそろえる
mid = (pos(idx['Eye_L'])[0] + pos(idx['Eye_R'])[0]) / 2
translate(nk, np.array([cx - mid, 0, 0]))

# 2) 手足：左右の平均の位置へ（関節の向きを合わせ、骨の長さは変えない）
chains = [['Scapula', 'Shoulder', 'Elbow', 'Wrist', 'Fingers1', 'MiddleFinger1', 'MiddleFinger2'],
          ['Hip', 'Knee', 'Ankle', 'Toes1', 'MiddleToe1', 'MiddleToe2']]
for ch in chains:
    tgt = {}
    for nm in ch:
        L, R = M0[idx[nm + '_L']][:3, 3], M0[idx[nm + '_R']][:3, 3]
        avg = np.array([((L[0] - cx) - (R[0] - cx)) / 2, (L[1] + R[1]) / 2, (L[2] + R[2]) / 2])
        tgt[nm + '_L'] = avg; tgt[nm + '_R'] = avg * np.array([-1, 1, 1])
    for side in ['L', 'R']:
        first = ch[0] + '_' + side
        apply(idx[first], (lambda T: (T.__setitem__((slice(0, 3), 3), tgt[first] - pos(idx[first])), T)[1])(np.eye(4)))
        for a, b in zip(ch[:-1], ch[1:]):
            ka, kb = idx[a + '_' + side], idx[b + '_' + side]
            R = align(pos(kb) - pos(ka), tgt[b + '_' + side] - pos(ka))
            apply(ka, rot_about(R, pos(ka)))
# 背骨のまん中を x=0 に
for nm in ['Root_M']:
    pass

# 3) 皮ふを動かす（線形ブレンド）
P = d['P']; J = d['J']; Wt = d['Wt']
S = np.einsum('kij,kjl->kil', Mp, np.linalg.inv(M0))
Ph = np.c_[P, np.ones(len(P))]
newP = np.zeros_like(P)
for c in range(J.shape[1]):
    newP += Wt[:, c:c + 1] * np.einsum('nij,nj->ni', S[J[:, c]], Ph)[:, :3]
# まん中を x=0 に、本物の大きさへ（頭の長さで決める：後頭部の骨組み〜鼻先 → 95mm）
newP[:, 0] -= cx
joints = {short[k]: Mp[k][:3, 3] - np.array([cx, 0, 0]) for k in range(len(names))}
nose = newP[np.argmax(newP[:, 2])]
headlen = nose[2] - joints['Head_M'][2]
scale = 0.095 / headlen
newP *= scale
joints = {k: v * scale for k, v in joints.items()}
uv = accessor(j, d['bin'], d['prim']['attributes']['TEXCOORD_0'])
np.savez('/home/user/-/cat-model/models/bengal_rest.npz', P=newP, I=d['I'], UV=uv, J=J, W=Wt, scale=scale,
         jn=np.array(short), jp=np.array([joints[s] for s in short]))
print('scale', round(scale, 4), 'bbox mm', (newP.min(0) * 1000).round(1), (newP.max(0) * 1000).round(1))
for nm in ['Root_M', 'Chest_M', 'Neck_M', 'Head_M', 'Eye_L', 'Eye_R', 'Shoulder_L', 'Shoulder_R', 'Elbow_L', 'Wrist_L', 'Fingers1_L', 'Hip_L', 'Hip_R', 'Knee_L', 'Knee_R', 'Ankle_L', 'Ankle_R', 'Toes1_L', 'Tail0_M']:
    print(f'{nm:12s}', (joints[nm] * 1000).round(1))
