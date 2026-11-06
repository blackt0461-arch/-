"""写真から猫の部分を切り抜いた白黒の画像（mask）を作る（開発用）。
背景が単色に近い写真向け：まわりの色を背景とみなし、ちがう色の大きなかたまりを猫とする。

使い方: python3 mask.py 写真 出力.png [--th 38] [--erode 1]
"""
import argparse
from collections import deque
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('photo'); ap.add_argument('out')
ap.add_argument('--th', type=float, default=38, help='背景とのちがいのしきい値')
ap.add_argument('--erode', type=int, default=1)
a = ap.parse_args()

im = Image.open(a.photo).convert('RGB')
W, H = im.size
px = im.load()
# 背景の色：画面のふちの色の中央値
border = [px[x, 0] for x in range(W)] + [px[x, H - 1] for x in range(W)] + [px[0, y] for y in range(H)] + [px[W - 1, y] for y in range(H)]
bg = tuple(sorted(c[k] for c in border)[len(border) // 2] for k in range(3))
diff = lambda c: ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5
# ふちから背景をたどって広げる（背景に似た色だけ）
bgmask = [[False] * W for _ in range(H)]
q = deque()
for x in range(W):
    for y in (0, H - 1):
        q.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        q.append((x, y))
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= W or y >= H or bgmask[y][x]:
        continue
    if diff(px[x, y]) > a.th:
        continue
    bgmask[y][x] = True
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
m = Image.new('L', (W, H))
mp = m.load()
for y in range(H):
    for x in range(W):
        mp[x, y] = 0 if bgmask[y][x] else 255
m = m.filter(ImageFilter.MedianFilter(5))
for _ in range(a.erode):
    m = m.filter(ImageFilter.MinFilter(3))
m.save(a.out)
print('背景の色', bg)
