"""アイコンの「見分けるための特徴」を作る。

scan.js の iconFeat と まったく同じ計算をする（どちらかを変えたら、もう片方も変える）。
  1. 64x64 に縮める
  2. メモリ: N x N のマスに平均して、ランクの文字・コスト・顔などが重なる場所をよけた RGB
     そうび: なだらかな背景（虹色など）を引いたもの ＋ もとの色を少し
  3. 平均を引いて長さ1にする
絵そのものは保存せず、この小さな数字の並びだけを保存する。
"""
import base64
import numpy as np
from PIL import Image

N = 20
BLUR = 8
BASE_W = 0.6


def make_mask(kind):
    m = np.ones((N, N), bool)
    for j in range(N):
        for i in range(N):
            x, y = (i + 0.5) / N, (j + 0.5) / N
            if kind == 'm':
                r = ((x - 0.5) ** 2 + (y - 0.5) ** 2) ** 0.5
                bad = r > 0.36 or (x < 0.32 and y < 0.32) or (x < 0.6 and y > 0.58) or (x > 0.68 and y > 0.68) or (x > 0.6 and y < 0.34)
            else:
                bad = y < 0.2 or y > 0.74 or (x > 0.6 and y < 0.42) or (x < 0.34 and y > 0.56) or (x > 0.74 and y > 0.62) or x < 0.08 or x > 0.92
            m[j, i] = not bad
    return m


MASK = {'m': make_mask('m'), 'e': make_mask('e')}


def cells(a):
    """64x64x3 -> N x N x3（マスの中の平均）"""
    out = np.zeros((N, N, 3))
    for j in range(N):
        y0, y1 = j * 64 // N, (j + 1) * 64 // N
        for i in range(N):
            x0, x1 = i * 64 // N, (i + 1) * 64 // N
            out[j, i] = a[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0)
    return out


def box_blur(a, r):
    p = np.pad(a, ((r, r), (r, r), (0, 0)), mode='edge')
    c = p.cumsum(axis=0).cumsum(axis=1)
    c = np.pad(c, ((1, 0), (1, 0), (0, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def feat_from64(a, kind):
    a = a.astype(float)
    m = MASK[kind]
    if kind == 'm':
        v = cells(a)[m].reshape(-1)
    else:
        hp = cells(a - box_blur(a, BLUR))[m].reshape(-1)
        base = cells(a)[m].reshape(-1)
        v = np.concatenate([hp, (base - base.mean()) * BASE_W])
    v = v - v.mean()
    return v / (np.linalg.norm(v) + 1e-9)


def feat_image(img, kind):
    img = img.convert('RGB')
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((64, 64), Image.BILINEAR)
    return feat_from64(np.asarray(img), kind)


def pack(v):
    q = np.clip(np.round(v / (np.abs(v).max() + 1e-9) * 127), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode()
