"""白黒の切り抜き画像（mask）から、いちばん大きい形の輪郭を点の列にする（開発用）。

使い方: python3 contour.py mask.png 出力.json [--eps 1.5]
出力: {"w":幅, "h":高さ, "points":[[x,y],...]}（ピクセル。時計回り・間引き済み）
"""
import json
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('mask'); ap.add_argument('out')
ap.add_argument('--eps', type=float, default=1.5, help='間引きの細かさ（ピクセル）')
a = ap.parse_args()

m = Image.open(a.mask).convert('L')
W, H = m.size
pix = m.load()
on = lambda x, y: 0 <= x < W and 0 <= y < H and pix[x, y] > 127

# いちばん大きいかたまりを探す
seen = set(); best = None
for y in range(H):
    for x in range(W):
        if on(x, y) and (x, y) not in seen:
            comp = []; st = [(x, y)]; seen.add((x, y))
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if on(nx, ny) and (nx, ny) not in seen:
                        seen.add((nx, ny)); st.append((nx, ny))
            if best is None or len(comp) > len(best):
                best = comp
inside = set(best)
start = min(best, key=lambda p: (p[1], p[0]))
# ふちをたどる（ムーア近傍）
dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
contour = [start]; cur = start; prev_dir = 6
for _ in range(len(best) * 4):
    for k in range(8):
        d = (prev_dir + 6 + k) % 8
        nx, ny = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
        if (nx, ny) in inside:
            cur = (nx, ny); prev_dir = d; break
    if cur == start:
        break
    contour.append(cur)

# 間引き（Ramer-Douglas-Peucker）
def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1; L = (dx * dx + dy * dy) ** 0.5 or 1
    idx, dmax = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L
        if d > dmax:
            idx, dmax = i, d
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]

half = len(contour) // 2
pts = rdp(contour[:half + 1], a.eps)[:-1] + rdp(contour[half:] + [contour[0]], a.eps)[:-1]
json.dump({'w': W, 'h': H, 'points': pts}, open(a.out, 'w'))
print(f'輪郭 {len(contour)} 点 → {len(pts)} 点')
