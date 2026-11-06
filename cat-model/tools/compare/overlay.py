"""写真とモデルを重ねる（開発用）。

使い方:
  python3 overlay.py 写真 モデルの描画.png 出力.png [--alpha 0.55] [--flip]
  - モデルの描画は render.html を写真と同じ大きさで撮ったもの（背景は透明）
  - 出力：左＝写真に半透明で重ねた絵、右＝写真に輪郭（シアン）だけ重ねた絵
  - 写真の猫の輪郭（mask）があれば --mask で渡すと、ずれ（重なりの割合）を数字で出す
"""
import sys
import argparse
from PIL import Image, ImageFilter, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('photo'); ap.add_argument('render'); ap.add_argument('out')
ap.add_argument('--alpha', type=float, default=0.55)
ap.add_argument('--flip', action='store_true', help='写真を左右反転する')
ap.add_argument('--mask', help='写真の猫の部分を白・背景を黒にした画像')
a = ap.parse_args()

photo = Image.open(a.photo).convert('RGBA')
if a.flip:
    photo = photo.transpose(Image.FLIP_LEFT_RIGHT)
ren = Image.open(a.render).convert('RGBA').resize(photo.size)
alpha = ren.split()[3].point(lambda v: 255 if v > 10 else 0)

# 半透明で重ねる
ghost = ren.copy(); ghost.putalpha(alpha.point(lambda v: int(v * a.alpha)))
left = Image.alpha_composite(photo, ghost)
# 輪郭だけ
edge = alpha.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 0 else 0).filter(ImageFilter.MaxFilter(3))
line = Image.new('RGBA', photo.size, (0, 255, 255, 255)); line.putalpha(edge)
right = Image.alpha_composite(photo, line)

out = Image.new('RGBA', (photo.width * 2, photo.height))
out.paste(left, (0, 0)); out.paste(right, (photo.width, 0))
out.convert('RGB').save(a.out)

if a.mask:
    m = Image.open(a.mask).convert('L').resize(photo.size)
    if a.flip:
        m = m.transpose(Image.FLIP_LEFT_RIGHT)
    m = m.point(lambda v: 255 if v > 127 else 0)
    inter = ImageChops.multiply(m, alpha)
    union = ImageChops.lighter(m, alpha)
    ci = sum(1 for v in inter.getdata() if v)
    cu = sum(1 for v in union.getdata() if v)
    only_photo = sum(1 for p, q in zip(m.getdata(), alpha.getdata()) if p and not q)
    only_model = sum(1 for p, q in zip(m.getdata(), alpha.getdata()) if q and not p)
    print(f'重なり（IoU） {ci / max(cu, 1):.3f}  写真だけ {only_photo}px  モデルだけ {only_model}px')
