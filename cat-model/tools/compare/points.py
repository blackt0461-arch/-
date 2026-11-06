"""写真の目印とモデルの目印を比べて、ずれを mm で出す（開発用）。

使い方: python3 points.py 写真の目印.json モデルの目印.json --s ピクセル/mm --view left|front|top \
          --anchor 目印の名前   （この目印を写真とモデルで重ねてから、ほかのずれを測る）
  写真の目印.json : {"nose_tip":[x,y], "eye_center":[x,y], ...}（写真のピクセル）
  モデルの目印.json: build.js が書き出す models/landmarks.json（mm、x=左 y=上 z=前）
"""
import json
import argparse

ap = argparse.ArgumentParser()
ap.add_argument('photo'); ap.add_argument('model')
ap.add_argument('--s', type=float, required=True)
ap.add_argument('--view', default='left')
ap.add_argument('--anchor', default='nose_tip')
ap.add_argument('--flip', action='store_true')
a = ap.parse_args()

ph = json.load(open(a.photo))
md = json.load(open(a.model))


def proj(p):
    x, y, z = p
    if a.view == 'left':   # 頭が画面の右（写真を合わせる）。画面の右＝+z、上＝+y
        return (z, -y)
    if a.view == 'right':
        return (-z, -y)
    if a.view == 'front':  # 画面の右＝猫の右（-x）
        return (-x, -y)
    if a.view == 'top':    # 画面の上＝前（+z）、右＝猫の右（-x）
        return (-x, -z)
    raise SystemExit('view が不明')


W = ph.get('_w', 0)
pts = {k: v for k, v in ph.items() if not k.startswith('_')}
if a.flip:
    pts = {k: [W - v[0], v[1]] for k, v in pts.items()}
if a.anchor not in pts or a.anchor not in md:
    raise SystemExit('基準の目印が両方にありません: ' + a.anchor)
ax, ay = pts[a.anchor]
mx, my = proj(md[a.anchor])
rows = []
for k, (x, y) in pts.items():
    if k not in md:
        rows.append((k, None)); continue
    px, py = proj(md[k])
    dx = (x - ax) / a.s - (px - mx)
    dy = (y - ay) / a.s - (py - my)
    rows.append((k, (dx, dy)))
print(f'{"目印":<22} {"右(+)":>8} {"下(+)":>8} {"ずれ":>7}  （mm。写真の位置 − モデルの位置）')
for k, d in rows:
    if d is None:
        print(f'{k:<22}   モデルに目印がありません')
    else:
        print(f'{k:<22} {d[0]:8.1f} {d[1]:8.1f} {((d[0] ** 2 + d[1] ** 2) ** 0.5):7.1f}')
