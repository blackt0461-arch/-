# 第4回 道具としての数学 の図
import sys, math
sys.path.insert(0, '/home/user/-/test-study/tools')
from figs_denshi1 import *

LBLUE = '#dfe6ff'
LRED = '#fde0e1'
LGRN = '#d6f3ea'


def plot(f, fn, xr, yr, box, color=INK, w=2.5, dash=None, n=300, clip=True):
    """box=(px0,py0,px1,py1)：グラフの範囲（左下→右上の画面座標）"""
    (xa, xb), (ya, yb) = xr, yr
    px0, py0, px1, py1 = box
    X = lambda x: px0 + (x - xa) / (xb - xa) * (px1 - px0)
    Y = lambda y: py0 - (y - ya) / (yb - ya) * (py0 - py1)
    seg = []
    segs = []
    for k in range(n + 1):
        x = xa + (xb - xa) * k / n
        try:
            y = fn(x)
        except (ZeroDivisionError, ValueError, OverflowError):
            y = None
        if y is None or (clip and not (ya <= y <= yb)):
            if len(seg) > 1:
                segs.append(seg)
            seg = []
            continue
        seg.append((round(X(x), 1), round(Y(y), 1)))
    if len(seg) > 1:
        segs.append(seg)
    for s in segs:
        f.line(*s, color=color, w=w, dash=dash)
    return X, Y


def sup(f):
    """直前の text の §..¤ を上つき文字にする"""
    f.p[-1] = f.p[-1].replace('§', '<tspan baseline-shift="super" font-size="70%">').replace('¤', '</tspan>')


def legend(f, x, y, items, size=13):
    for k, (lab, c, dash) in enumerate(items):
        yy = y + k * 20
        f.line((x, yy - 4), (x + 22, yy - 4), color=c, w=3, dash=dash)
        f.text(x + 28, yy + 1, lab, 'start', size, c)
        sup(f)


# 1. 大きな波の上のさざ波（直流＋小信号）
def ripple():
    f = Fig(440, 250)
    x0, x1, base = 30, 420, 215
    lvl = 110
    pts = [(x, lvl + 7 * math.sin((x - x0) / 9)) for x in range(x0, x1 + 1, 2)]
    d = 'M%d,%d ' % (x0, base) + ' '.join('L%.1f,%.1f' % p for p in pts) + ' L%d,%d Z' % (x1, base)
    f.path(d, color=ACC, w=0, fill=LBLUE)
    f.line(*pts, color=ACC, w=2.5)
    f.line((x0, base), (x1, base), w=2.5)
    f.line((x0, lvl), (x1, lvl), color=INK, w=1.5, dash='6 5')
    # 直流の高さ
    f.arrow(70, base, 70, lvl + 2, color=INK, w=2.5)
    f.text(80, 175, '大きな部分＝直流', 'start', 14)
    f.text(80, 195, 'V_{GS}, I_{D}（大文字）', 'start', 13, SUB)
    # さざ波の拡大
    f.add(f'<circle cx="300" cy="{lvl}" r="22" fill="none" stroke="{RED}" stroke-width="2"/>')
    f.line((300, lvl - 22), (300, 62), color=RED, w=1.5)
    f.text(300, 38, '小さな揺れ＝小信号', 'middle', 14, RED)
    f.text(300, 56, 'v_{gs}, i_{d}（小文字）', 'middle', 13, RED)
    f.save('l4-ripple')


# 2. I_D の放物線と g_m（傾き）
def id_gm():
    f = Fig(420, 270)
    box = (50, 230, 390, 30)
    axes(f, 50, 230, 400, 28, 'V_{GS}', 'I_{D}')
    vt = 1.0
    X, Y = plot(f, lambda v: 0.5 * (v - vt) ** 2 if v > vt else 0, (0, 4), (0, 4), box, color=ACC, w=3)
    v0 = 2.6
    i0 = 0.5 * (v0 - vt) ** 2
    gm = v0 - vt
    plot(f, lambda v: i0 + gm * (v - v0), (1.9, 3.5), (0, 4), box, color=RED, w=2.2)
    f.dot(X(v0), Y(i0), 5, RED)
    f.line((X(v0), Y(i0)), (X(v0), 230), color=SUB, w=1.2, dash='4 4')
    f.line((X(v0), Y(i0)), (50, Y(i0)), color=SUB, w=1.2, dash='4 4')
    f.text(X(v0) + 8, Y(i0) + 22, 'いまの点', 'start', 13, RED)
    f.text(X(vt), 250, 'V_{T}', 'middle', 13)
    f.line((X(vt), 230), (X(vt), 236))
    f.text(410, Y(i0 + gm * 0.5) + 30, '接線の傾き＝g_{m}', 'end', 14, RED)
    f.text(X(1.2), Y(3.4), '飽和領域の I_{D}（放物線）', 'start', 13, ACC)
    f.save('l4-id-gm')


# 3. 小信号：入口のさざ波 → 電流のさざ波
def smallsig():
    f = Fig(440, 300)
    ox, oy = 150, 200
    box = (ox, oy, 420, 20)
    f.arrow(ox, oy, 425, oy)
    f.arrow(ox, oy, ox, 18)
    f.text(425, oy + 20, 'V_{GS}', 'end', 13)
    f.text(ox - 6, 26, 'I_{D}', 'end', 13)
    vt = 1.0
    X, Y = plot(f, lambda v: 0.5 * (v - vt) ** 2 if v > vt else 0, (0, 4), (0, 4.2), box, color=ACC, w=3)
    v0 = 2.6; i0 = 0.5 * (v0 - vt) ** 2; gm = v0 - vt
    plot(f, lambda v: i0 + gm * (v - v0), (2.1, 3.1), (0, 4.2), box, color=RED, w=2)
    f.dot(X(v0), Y(i0), 5, INK)
    f.line((X(v0), Y(i0)), (X(v0), oy), color=SUB, w=1.2, dash='4 4')
    f.line((X(v0), Y(i0)), (ox, Y(i0)), color=SUB, w=1.2, dash='4 4')
    # 入口の揺れ（下向きに時間）
    a = 0.3
    pts = [(X(v0 + a * math.sin(t / 9)), oy + 8 + t) for t in range(0, 85, 2)]
    f.line(*pts, color=GRN, w=2.5)
    f.text(X(v0) - 26, oy + 62, 'v_{gs}（入口の揺れ）', 'end', 13, GRN)
    # 出口の揺れ（左向きに時間）
    b = gm * a
    pts = [(ox - 8 - t, Y(i0 + b * math.sin(t / 9))) for t in range(0, 125, 2)]
    f.line(*pts, color=RED, w=2.5)
    f.text(10, Y(i0) - 46, 'i_{d}（電流の揺れ）', 'start', 13, RED)
    f.text(10, Y(i0) + 62, 'i_{d}≒g_{m}v_{gs}', 'start', 14, RED)
    f.text(432, Y(i0 + gm * 0.5) + 34, '接線で近似', 'end', 12, RED)
    f.save('l4-smallsig')


# 4. 0.01 と 0.0001 の長さくらべ
def square_small():
    f = Fig(440, 200)
    L = 360
    x0 = 40
    f.text(x0, 40, 'v_{gs}＝0.01', 'start', 15, ACC)
    f.add(f'<rect x="{x0}" y="52" width="{L}" height="26" rx="4" fill="{ACC}"/>')
    f.text(x0, 118, 'v_{gs}×v_{gs}＝0.0001', 'start', 15, RED)
    f.add(f'<rect x="{x0}" y="130" width="{L / 100:.1f}" height="26" fill="{RED}"/>')
    f.arrow(x0 + 60, 143, x0 + 12, 143, color=RED)
    f.text(x0 + 66, 148, 'たったこれだけ（100分の1）', 'start', 14, RED)
    f.text(x0, 186, '→ 2乗の項は無視してよい', 'start', 14, INK)
    f.save('l4-square-small')


# 5. e^x と 1+x、1+x+x²/2
def approx_exp():
    f = Fig(420, 290)
    box = (40, 250, 400, 20)
    xr, yr = (-2, 2), (-1, 6)
    X, Y = plot(f, lambda x: 0, xr, yr, box, color='#fff', w=0)
    f.arrow(40, Y(0), 405, Y(0)); f.arrow(X(0), 255, X(0), 18)
    f.text(402, Y(0) + 20, 'x', 'end', 14); f.text(X(0) - 8, 28, 'y', 'end', 14)
    plot(f, lambda x: 1 + x, xr, yr, box, color=RED, w=2.2)
    plot(f, lambda x: 1 + x + x * x / 2, xr, yr, box, color=GRN, w=2.2, dash='7 5')
    plot(f, math.exp, xr, yr, box, color=INK, w=3)
    f.add(f'<rect x="{X(-0.45):.0f}" y="{Y(1.75):.0f}" width="{X(0.45) - X(-0.45):.0f}" height="{Y(0.3) - Y(1.75):.0f}" rx="6" fill="none" stroke="{SUB}" stroke-width="1.5" stroke-dasharray="4 3"/>')
    f.text(X(0.1), Y(-0.6), 'x が小さい所ではほぼ重なる', 'start', 12, SUB)
    legend(f, 60, 40, [('本物 e§x¤', INK, None), ('1次 1+x', RED, None), ('2次 1+x+x²/2', GRN, '7 5')])
    f.save('l4-approx-exp')


# 6. cos x と 1、1−x²/2
def approx_cos():
    f = Fig(420, 260)
    box = (30, 230, 400, 20)
    xr, yr = (-3, 3), (-1.6, 1.6)
    X, Y = plot(f, lambda x: 0, xr, yr, box, color='#fff', w=0)
    f.arrow(30, Y(0), 405, Y(0)); f.arrow(X(0), 235, X(0), 18)
    f.text(402, Y(0) + 20, 'x', 'end', 14)
    plot(f, lambda x: 1, xr, yr, box, color=RED, w=2.2)
    plot(f, lambda x: 1 - x * x / 2, xr, yr, box, color=GRN, w=2.2, dash='7 5')
    plot(f, math.cos, xr, yr, box, color=INK, w=3)
    legend(f, 250, Y(-0.55), [('本物 cos x', INK, None), ('1次 1', RED, None), ('2次 1−x²/2', GRN, '7 5')])
    f.save('l4-approx-cos')


# 10. 1次近似の式の各部分
def linear_approx():
    f = Fig(420, 290)
    box = (50, 250, 400, 20)
    xr, yr = (0, 3.2), (0, 3.2)
    fn = lambda x: 0.25 * x * x + 0.3
    a = 1.0
    fa, d = fn(a), 0.5 * a
    axes(f, 50, 250, 405, 18, 'x', 'y')
    X, Y = plot(f, fn, xr, yr, box, color=INK, w=3)
    plot(f, lambda x: fa + d * (x - a), (0.2, 3.2), yr, box, color=RED, w=2.2)
    x1 = 2.6
    f.dot(X(a), Y(fa), 5, INK)
    f.line((X(a), Y(fa)), (X(a), 250), color=SUB, w=1.2, dash='4 4')
    f.line((X(x1), Y(fn(x1))), (X(x1), 250), color=SUB, w=1.2, dash='4 4')
    f.text(X(a), 270, 'a', 'middle', 14); f.text(X(x1), 270, 'x', 'middle', 14)
    # f(a)
    f.arrow(X(a) - 14, 250, X(a) - 14, Y(fa) + 2, color=ACC)
    f.text(X(a) - 20, (250 + Y(fa)) / 2 + 5, 'f(a)', 'end', 14, ACC)
    # 横の移動
    f.line((X(a), Y(fa)), (X(x1), Y(fa)), color=SUB, w=1.5, dash='4 4')
    f.text((X(a) + X(x1)) / 2, Y(fa) + 20, 'x−a（進んだ距離）', 'middle', 13, SUB)
    # 上がる分
    f.arrow(X(x1) + 12, Y(fa), X(x1) + 12, Y(fa + d * (x1 - a)) + 2, color=GRN)
    f.text(X(x1) + 18, (Y(fa) + Y(fa + d * (x1 - a))) / 2 + 8, "f'(a)(x−a)", 'start', 13, GRN)
    # ずれ
    f.line((X(x1), Y(fa + d * (x1 - a))), (X(x1), Y(fn(x1))), color=RED, w=4)
    f.text(X(x1) - 8, Y(fn(x1)) + 2, 'ずれ', 'end', 13, RED)
    f.text(X(2.9), Y(fa + d * 1.9) + 22, '接線', 'middle', 13, RED)
    f.text(X(2.1), Y(fn(2.1)) - 10, 'f(x)', 'end', 14, INK)
    f.save('l4-linear-approx')


# 11/12. sin x に項を足していく
def taylor_sin():
    f = Fig(440, 305)
    box = (20, 250, 420, 20)
    xr, yr = (-6.3, 6.3), (-2.2, 2.2)
    X, Y = plot(f, lambda x: 0, xr, yr, box, color='#fff', w=0)
    f.arrow(20, Y(0), 425, Y(0)); f.arrow(X(0), 255, X(0), 18)
    f.text(422, Y(0) + 20, 'x', 'end', 14)
    s1 = lambda x: x
    s3 = lambda x: x - x ** 3 / 6
    s5 = lambda x: s3(x) + x ** 5 / 120
    s7 = lambda x: s5(x) - x ** 7 / 5040
    s9 = lambda x: s7(x) + x ** 9 / 362880
    plot(f, s1, xr, yr, box, color=RED, w=2)
    plot(f, s3, xr, yr, box, color='#f59e0b', w=2)
    plot(f, s5, xr, yr, box, color=GRN, w=2)
    plot(f, s9, xr, yr, box, color=ACC, w=2.2)
    plot(f, math.sin, xr, yr, box, color=INK, w=3)
    for k, (lab, c) in enumerate([('本物 sin x', INK), ('1項', RED), ('2項', '#f59e0b'), ('3項', GRN), ('5項', ACC)]):
        x = [14, 128, 196, 264, 332][k]
        f.line((x, 286), (x + 18, 286), color=c, w=3)
        f.text(x + 22, 291, lab, 'start', 13, c)
    f.text(30, 40, '項を足すほど、本物に重なる範囲が広がる', 'start', 13, SUB)
    f.save('l4-taylor-sin')


# 15. 収束半径
def conv_radius():
    f = Fig(420, 290)
    box = (30, 250, 400, 40)
    xr, yr = (-2, 2), (-2, 6)
    X, Y = plot(f, lambda x: 0, xr, yr, box, color='#fff', w=0)
    f.add(f'<rect x="{X(-1):.0f}" y="40" width="{X(1) - X(-1):.0f}" height="210" fill="{LGRN}"/>')
    f.arrow(30, Y(0), 405, Y(0)); f.arrow(X(0), 255, X(0), 32)
    f.text(402, Y(0) + 20, 'x', 'end', 14)
    for v in (-1, 1):
        f.line((X(v), Y(0) - 4), (X(v), Y(0) + 4))
        f.text(X(v), Y(0) + 20, str(v).replace('-', '−'), 'middle', 13)
    s = lambda x: sum(x ** k for k in range(7))
    plot(f, s, xr, yr, box, color=RED, w=2.2, dash='7 5')
    plot(f, lambda x: 1 / (1 - x) if x < 0.995 else None, xr, yr, box, color=INK, w=3)
    f.text(X(0), 30, '使える範囲（|x|<1）', 'middle', 14, GRN)
    f.text(X(1.7), Y(2.2), '発散', 'middle', 14, RED)
    f.text(X(-1.7), Y(2.2), '発散', 'middle', 14, RED)
    legend(f, X(-1.95), Y(-1.1), [('1/(1−x)', INK, None), ('1+x+…+x⁶', RED, '7 5')], 12)
    f.save('l4-conv-radius')


# 16. オイラーの公式（単位円の上の点）
def euler():
    f = Fig(400, 300)
    cx, cy, r = 180, 160, 110
    f.arrow(40, cy, 330, cy); f.arrow(cx, 290, cx, 20)
    f.text(330, cy + 22, '実部', 'end', 13, SUB); f.text(cx + 8, 30, '虚部', 'start', 13, SUB)
    f.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{SUB}" stroke-width="2"/>')
    t = math.radians(50)
    px, py = cx + r * math.cos(t), cy - r * math.sin(t)
    f.line((cx, cy), (px, py), color=ACC, w=3)
    f.line((px, py), (px, cy), color=RED, w=3)
    f.line((cx, cy + 1), (px, cy + 1), color=GRN, w=4)
    f.dot(px, py, 6, ACC)
    f.text(px + 10, py - 8, 'e§jx¤', 'start', 18, ACC); sup(f)
    f.text((cx + px) / 2, cy + 22, 'cos x', 'middle', 14, GRN)
    f.add(f'<rect x="{px + 5:.0f}" y="{(py + cy) / 2 - 10:.0f}" width="42" height="20" fill="#fff"/>'); f.text(px + 8, (py + cy) / 2 + 5, 'sin x', 'start', 14, RED)
    f.path(f'M{cx + 30},{cy} A30,30 0 0,0 {cx + 30 * math.cos(t):.1f},{cy - 30 * math.sin(t):.1f}', color=INK, w=1.8)
    f.text(cx + 36, cy - 12, 'x', 'start', 14)
    f.text(cx - 50, cy - 78, '1', 'middle', 13, SUB)
    f.text(20, 290, '半径1の円の上を、角度 x の所にある点', 'start', 13, SUB)
    f.save('l4-euler')


# 17. 実部と虚部に分ける
def euler_sort():
    f = Fig(450, 230)
    terms = ['1', 'jx', '−x²/2!', '−jx³/3!', 'x⁴/4!', 'jx⁵/5!']
    w = 70
    for k, s in enumerate(terms):
        im = 'j' in s
        c = RED if im else GRN
        x = 18 + k * w
        f.add(f'<rect x="{x}" y="20" width="{w - 8}" height="34" rx="6" fill="{LRED if im else LGRN}" stroke="{c}" stroke-width="2"/>')
        f.text(x + (w - 8) / 2, 43, s, 'middle', 13, INK)
    f.text(440, 43, '…', 'end', 15)
    for k in range(6):
        x = 18 + k * w + (w - 8) / 2
        if k % 2 == 0:
            f.arrow(x, 56, 110, 130, color=GRN, w=1.6)
        else:
            f.arrow(x, 56, 340, 130, color=RED, w=1.6)
    f.add(f'<rect x="30" y="132" width="160" height="70" rx="8" fill="{LGRN}" stroke="{GRN}" stroke-width="2"/>')
    f.text(110, 158, 'j がない項', 'middle', 13, GRN)
    f.text(110, 186, '＝ cos x', 'middle', 16, INK)
    f.add(f'<rect x="260" y="132" width="160" height="70" rx="8" fill="{LRED}" stroke="{RED}" stroke-width="2"/>')
    f.text(340, 158, 'j がつく項', 'middle', 13, RED)
    f.text(340, 186, '＝ j sin x', 'middle', 16, INK)
    f.text(225, 222, 'e§jx¤ の展開を2つの組に分ける', 'middle', 13, SUB); sup(f)
    f.save('l4-euler-sort')


def grid(f, ox, oy, s, nx, ny):
    for i in range(nx + 1):
        f.line((ox + i * s, oy), (ox + i * s, oy - ny * s), color='#e3e6f0', w=1)
    for j in range(ny + 1):
        f.line((ox, oy - j * s), (ox + nx * s, oy - j * s), color='#e3e6f0', w=1)


# 18. ベクトル (2,1)
def vec21():
    f = Fig(400, 240)
    ox, oy, s = 70, 200, 70
    grid(f, ox, oy, s, 4, 2)
    f.arrow(ox, oy, ox + 4 * s + 15, oy, color=SUB); f.arrow(ox, oy, ox, oy - 2 * s - 15, color=SUB)
    f.text(ox + 4 * s + 15, oy + 22, '東', 'end', 13, SUB); f.text(ox - 8, oy - 2 * s - 6, '北', 'end', 13, SUB)
    f.line((ox, oy + 2), (ox + 2 * s, oy + 2), color=GRN, w=3, dash='6 4')
    f.line((ox + 2 * s, oy), (ox + 2 * s, oy - s), color=GRN, w=3, dash='6 4')
    f.text(ox + s, oy + 22, '東に2歩', 'middle', 13, GRN)
    f.text(ox + 2 * s + 8, oy - s / 2 + 5, '北に1歩', 'start', 13, GRN)
    f.arrow(ox, oy, ox + 2 * s, oy - s, color=ACC, w=3.5)
    f.dot(ox, oy, 4)
    f.text(ox + 2 * s + 6, oy - s - 8, '(2, 1)', 'start', 16, ACC)
    f.save('l4-vec21')


# 19. 標準基底
def basis():
    f = Fig(400, 260)
    ox, oy, s = 60, 210, 70
    grid(f, ox, oy, s, 4, 2)
    f.arrow(ox, oy, ox + 4 * s + 10, oy, color=SUB); f.arrow(ox, oy, ox, oy - 2 * s - 15, color=SUB)
    f.arrow(ox, oy, ox + s, oy, color=RED, w=3.5)
    f.arrow(ox + s, oy, ox + 2 * s, oy, color=RED, w=3.5)
    f.arrow(ox + 2 * s, oy, ox + 2 * s, oy - s, color=GRN, w=3.5)
    f.text(ox + s / 2, oy + 22, 'e_{1}', 'middle', 15, RED)
    f.text(ox + 1.5 * s, oy + 22, 'e_{1}', 'middle', 15, RED)
    f.text(ox + 2 * s + 8, oy - s / 2 + 5, 'e_{2}', 'start', 15, GRN)
    f.arrow(ox, oy, ox + 2 * s, oy - s, color=ACC, w=2.5)
    f.text(ox + 2 * s + 10, oy - s - 10, '(2,1)＝2e_{1}＋1e_{2}', 'start', 14, ACC)
    f.text(ox + 4 * s + 10, 34, '長さ1の矢印 e_{1}＝(1,0)、e_{2}＝(0,1)', 'end', 12, SUB)
    f.save('l4-basis')


# 20. 内積＝影の長さ×長さ
def dot_shadow():
    f = Fig(420, 260)
    ox, oy = 50, 200
    ax, ay = 330, 0           # a は横向き
    bx, by = 190, -130
    f.arrow(ox, oy, ox + ax, oy + ay, color=ACC, w=3.5)
    f.arrow(ox, oy, ox + bx, oy + by, color=GRN, w=3.5)
    f.text(ox + ax, oy + 24, 'a', 'end', 16, ACC)
    f.text(ox + bx - 6, oy + by - 6, 'b', 'end', 16, GRN)
    f.line((ox + bx, oy + by), (ox + bx, oy), color=SUB, w=1.6, dash='5 4')
    f.add(f'<rect x="{ox + bx - 10}" y="{oy - 10}" width="10" height="10" fill="none" stroke="{SUB}" stroke-width="1.4"/>')
    f.line((ox, oy + 30), (ox + bx, oy + 30), color=RED, w=5)
    f.line((ox, oy + 24), (ox, oy + 36), color=RED, w=2); f.line((ox + bx, oy + 24), (ox + bx, oy + 36), color=RED, w=2)
    f.text(ox + bx / 2, oy + 54, 'b の影の長さ ＝ |b|cosθ', 'middle', 13, RED)
    f.path(f'M{ox + 40},{oy} A40,40 0 0,0 {ox + 40 * math.cos(math.atan2(130, 190)):.1f},{oy - 40 * math.sin(math.atan2(130, 190)):.1f}', w=1.8)
    f.text(ox + 48, oy - 10, 'θ', 'start', 14)
    f.text(ox + 210, 40, '内積 ＝ |a| × 影の長さ', 'start', 14, INK)
    f.text(ox + 210, 60, '（同じ向きほど大きい）', 'start', 12, SUB)
    f.save('l4-dot-shadow')


# 21. 直交：影が0
def orthogonal():
    f = Fig(400, 260)
    ox, oy, s = 170, 200, 60
    grid(f, ox - 2 * s, oy, s, 5, 3)
    f.arrow(ox, oy, ox + 2 * s, oy - s, color=ACC, w=3.5)
    f.arrow(ox, oy, ox - s, oy - 2 * s, color=GRN, w=3.5)
    f.text(ox + 2 * s + 6, oy - s + 4, 'a＝(2,1)', 'start', 14, ACC)
    f.text(ox - s - 6, oy - 2 * s - 6, 'b＝(−1,2)', 'end', 14, GRN)
    # 直角マーク
    u = (2 / math.sqrt(5), -1 / math.sqrt(5)); v = (-1 / math.sqrt(5), -2 / math.sqrt(5)); m = 14
    f.line((ox + u[0] * m, oy + u[1] * m), (ox + (u[0] + v[0]) * m, oy + (u[1] + v[1]) * m), (ox + v[0] * m, oy + v[1] * m), color=RED, w=2)
    f.text(ox + 10, oy - 30, '90°', 'start', 13, RED)
    f.dot(ox, oy, 4)
    f.text(200, 236, '2×(−1)＋1×2＝0 → 直交', 'middle', 14, RED)
    f.save('l4-orthogonal')


# 23. クロネッカーのデルタの表
def delta():
    f = Fig(340, 250)
    x0, y0, c = 110, 60, 56
    f.text(x0 + 1.5 * c, 26, 'j', 'middle', 15, SUB)
    f.text(60, y0 + 1.5 * c + 5, 'i', 'middle', 15, SUB)
    for k in range(3):
        f.text(x0 + k * c + c / 2, y0 - 10, str(k + 1), 'middle', 14, SUB)
        f.text(x0 - 12, y0 + k * c + c / 2 + 5, str(k + 1), 'end', 14, SUB)
    for i in range(3):
        for j in range(3):
            on = i == j
            f.add(f'<rect x="{x0 + j * c}" y="{y0 + i * c}" width="{c}" height="{c}" fill="{LBLUE if on else "#fff"}" stroke="{INK}" stroke-width="1.5"/>')
            f.text(x0 + j * c + c / 2, y0 + i * c + c / 2 + 7, '1' if on else '0', 'middle', 20, ACC if on else SUB)
    f.text(170, 244, '同じ番号どうしだけ 1、ほかは 0', 'middle', 13, INK)
    f.save('l4-delta')


# 25. 関数を細かく区切って数の組に
def func_vector():
    f = Fig(420, 260)
    box = (40, 200, 400, 30)
    xr, yr = (0, 6), (0, 3)
    fn = lambda x: 1.4 + 0.9 * math.sin(x * 1.1) + 0.3 * math.sin(2.7 * x)
    X, Y = plot(f, fn, xr, yr, box, color=ACC, w=3)
    f.arrow(40, 200, 405, 200); f.arrow(40, 200, 40, 26)
    f.text(402, 220, 'x', 'end', 14)
    for k in range(1, 7):
        x = k * 0.85
        f.line((X(x), 200), (X(x), Y(fn(x))), color=RED, w=2.5)
        f.dot(X(x), Y(fn(x)), 4.5, RED)
        f.text(X(x), 220, f'x_{{{k}}}', 'middle', 12, SUB)
    f.text(210, 250, '(f(x_{1}), f(x_{2}), f(x_{3}), …) という長い組', 'middle', 13, RED)
    f.text(395, 44, 'f(x)', 'end', 14, ACC)
    f.save('l4-func-vector')


def prod_panel(f, fn, top, h, title, color, note):
    """0〜2π の積のグラフと面積の色ぬり"""
    x0, x1 = 40, 410
    mid = top + h / 2
    A = h / 2 - 6
    X = lambda x: x0 + x / (2 * math.pi) * (x1 - x0)
    n = 400
    pts = [(X(2 * math.pi * k / n), mid - A * fn(2 * math.pi * k / n)) for k in range(n + 1)]
    # 正（上）と負（下）でぬり分け
    for sign, col in ((1, LBLUE), (-1, LRED)):
        d = f'M{x0},{mid} ' + ' '.join(f'L{px:.1f},{(min(py, mid) if sign > 0 else max(py, mid)):.1f}' for px, py in pts) + f' L{x1},{mid} Z'
        f.path(d, color='none', w=0, fill=col)
    f.line(*[(round(a, 1), round(b, 1)) for a, b in pts], color=color, w=2.5)
    f.line((x0, mid), (x1 + 8, mid), w=1.5)
    f.line((x0, top), (x0, top + h), w=1.5)
    f.text(x1, mid + 18, '2π', 'middle', 12, SUB)
    f.text(x0 + 4, top - 6, title, 'start', 14, color)
    f.text(x1 + 6, top - 6, note, 'end', 13, INK)


# 26/28. cos2x·cos5x（打ち消して0）
def cos25():
    f = Fig(440, 230)
    prod_panel(f, lambda x: math.cos(2 * x) * math.cos(5 * x), 40, 150, 'cos2x×cos5x', ACC, '')
    f.text(220, 218, '青（＋）と赤（−）の面積がちょうど打ち消す → 0', 'middle', 13, INK)
    f.save('l4-cos25')


def cos33():
    f = Fig(440, 230)
    prod_panel(f, lambda x: math.cos(3 * x) ** 2, 40, 150, 'cos3x×cos3x', GRN, '')
    f.text(220, 218, 'いつも0以上（青だけ）→ 面積は π', 'middle', 13, INK)
    f.save('l4-cos33')


# 27. cos kx を 0〜2π で積分すると0
def cos_cancel():
    f = Fig(440, 230)
    prod_panel(f, lambda x: math.cos(2 * x), 40, 150, 'cos2x', ACC, '')
    f.text(220, 218, '山（＋）と谷（−）の面積が同じ → 合計 0', 'middle', 13, INK)
    f.save('l4-cos-cancel')


# 30. 和音：いくつかの波を足す
def chord():
    f = Fig(440, 300)
    x0, x1 = 90, 420
    rows = [('ド', 4, ACC), ('ミ', 5, GRN), ('ソ', 6, '#f59e0b')]
    for k, (nm, fr, c) in enumerate(rows):
        y = 34 + k * 52
        pts = [(x0 + t, y - 15 * math.sin(2 * math.pi * fr * t / 330)) for t in range(0, 331, 2)]
        f.line(*pts, color=c, w=2)
        f.text(x0 - 14, y + 5, nm, 'end', 15, c)
    f.text(x0 - 14, 186, '＋', 'end', 18, SUB)
    f.line((x0, 178), (x1, 178), color=SUB, w=1.5)
    y = 240
    pts = [(x0 + t, y - 13 * sum(math.sin(2 * math.pi * fr * t / 330) for _, fr, _ in rows)) for t in range(0, 331, 2)]
    f.line(*pts, color=RED, w=2.5)
    f.text(x0 - 14, y + 5, '和音', 'end', 15, RED)
    f.text(255, 296, '複雑な波も、単純な波（cos・sin）の足し算', 'middle', 13, INK)
    f.save('l4-chord')


# 35. 周期 T→∞ でフーリエ変換
def t_inf():
    f = Fig(450, 300)
    # 上段：周期的なパルス列
    f.text(10, 22, '周期 T でくり返す波', 'start', 13, ACC)
    base = 100
    f.line((10, base), (210, base), w=1.5)
    for k in range(4):
        x = 20 + k * 50
        f.line((x, base), (x, base - 50), (x + 16, base - 50), (x + 16, base), color=ACC, w=2.5)
    f.line((20, base + 12), (70, base + 12), color=SUB, w=1.5)
    f.text(45, base + 28, 'T', 'middle', 13, SUB)
    f.text(240, 22, '周波数：とびとび（線）', 'start', 13, ACC)
    sinc = lambda w: 1 if w == 0 else abs(math.sin(w) / w)
    f.line((240, base), (440, base), w=1.5)
    for k in range(-6, 7):
        w = k * 0.8
        x = 340 + k * 15
        f.line((x, base), (x, base - 60 * sinc(w)), color=ACC, w=3)
    # 下段：単発
    f.text(10, 160, 'T→∞：1回きりの波', 'start', 13, RED)
    base = 250
    f.line((10, base), (210, base), w=1.5)
    f.line((95, base), (95, base - 50), (111, base - 50), (111, base), color=RED, w=2.5)
    f.text(240, 160, '周波数：なめらか（曲線）', 'start', 13, RED)
    f.line((240, base), (440, base), w=1.5)
    pts = [(340 + w * 15 / 0.8, base - 60 * sinc(w)) for w in [k * 0.02 - 5.2 for k in range(521)]]
    f.line(*pts, color=RED, w=2.5)
    f.text(225, 292, 'Σ（足し算）→ ∫（積分）', 'middle', 13, INK)
    f.save('l4-t-inf')


# 36/37. e^{-γt} を掛けて小さくする
def damp():
    f = Fig(420, 270)
    box = (50, 220, 400, 40)
    xr, yr = (0, 6), (0, 1.4)
    axes(f, 50, 220, 405, 34, 't', '')
    X, Y = plot(f, lambda t: math.exp(-0.7 * t), xr, yr, box, color=GRN, w=0)
    d = f'M{X(0)},{Y(0)} ' + ' '.join(f'L{X(6 * k / 100):.1f},{Y(math.exp(-0.7 * 6 * k / 100)):.1f}' for k in range(101)) + f' L{X(6)},{Y(0)} Z'
    f.path(d, color='none', w=0, fill=LGRN)
    plot(f, lambda t: 1, xr, yr, box, color=RED, w=3)
    plot(f, lambda t: math.exp(-0.7 * t), xr, yr, box, color=GRN, w=3)
    f.text(X(6), Y(1) - 10, 'f(t)＝1（ずっと1：面積が無限）', 'end', 13, RED)
    f.text(X(1.0) + 6, Y(0.62), 'f(t)e§−γt¤', 'start', 15, GRN); sup(f)
    f.text(X(3.2), Y(0.45) - 6, '面積が有限 → 積分できる', 'start', 13, GRN)
    f.text(46, Y(1) + 5, '1', 'end', 13)
    f.save('l4-damp')


if __name__ == '__main__':
    for fn in [ripple, id_gm, smallsig, square_small, approx_exp, approx_cos, linear_approx, taylor_sin,
               conv_radius, euler, euler_sort, vec21, basis, dot_shadow, orthogonal, delta, func_vector,
               cos25, cos33, cos_cancel, chord, t_inf, damp]:
        fn()
