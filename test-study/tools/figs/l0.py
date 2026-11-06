# 第0回（準備：電気と数学のきほん）の図。python3 test-study/tools/figs/l0.py
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from figs_denshi1 import *

LBLUE = '#bfe3ff'
LACC = '#dcdcfd'


def rect(f, x, y, w, h, fill='#fff', stroke=INK, sw=2, rx=0, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')


def circle(f, x, y, r, fill='#fff', stroke=INK, sw=2):
    f.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def battery_v(f, x, ytop, ybot):
    """縦向きの電池。上が＋（長い板）"""
    m = (ytop + ybot) / 2
    f.line((x, ytop), (x, m - 8))
    f.line((x - 20, m - 8), (x + 20, m - 8), w=3)
    f.line((x - 10, m + 6), (x + 10, m + 6), w=5)
    f.line((x, m + 6), (x, ybot))
    f.text(x + 24, m - 6, '+', 'start', 16, RED)
    f.text(x + 18, m + 18, '−', 'start', 16, SUB)


# 1. オームの法則
def ohm():
    f = Fig(420, 230)
    battery_v(f, 60, 50, 180)
    f.line((60, 50), (200, 50))
    f.resistor_v(200, 50, 180, 'R', 'right')
    f.line((200, 180), (60, 180))
    f.arrow(100, 50, 150, 50, color=ACC, w=2.5)
    f.text(125, 40, '電流 I', 'middle', 14, ACC)
    f.text(30, 120, 'V', 'middle', 18)
    f.text(130, 210, '電池が押して、抵抗を通って流れる', 'middle', 12, SUB)
    # 三角の覚え方
    f.add(f'<polygon points="330,40 260,175 400,175" fill="{LACC}" stroke="{INK}" stroke-width="2"/>')
    f.line((295, 108), (365, 108))
    f.line((330, 108), (330, 175))
    f.text(330, 95, 'V', 'middle', 22)
    f.text(305, 155, 'I', 'middle', 22, ACC)
    f.text(355, 155, 'R', 'middle', 22, RED)
    f.text(330, 200, 'V = I × R', 'middle', 15)
    f.text(330, 220, 'I = V ÷ R　R = V ÷ I', 'middle', 12, SUB)
    f.save('l0-ohm')


# 2. m と k のものさし
def prefix():
    f = Fig(440, 230)
    y = 100
    f.line((40, y), (400, y), w=2.5)
    xs = [(80, 'm（ミリ）', '0.001', GRN), (220, 'そのまま', '1', INK), (360, 'k（キロ）', '1000', RED)]
    for x, name, val, c in xs:
        f.line((x, y - 8), (x, y + 8), w=2.5, color=c)
        f.dot(x, y, 5, c)
        f.text(x, y + 30, val, 'middle', 16, c)
        f.text(x, y + 50, name, 'middle', 13, c)
    f.path('M210 82 Q150 40 92 82', color=GRN, w=2)
    f.arrow(100, 76, 91, 83, color=GRN)
    f.text(150, 48, '÷1000', 'middle', 13, GRN)
    f.path('M230 82 Q290 40 348 82', color=RED, w=2)
    f.arrow(340, 76, 349, 83, color=RED)
    f.text(290, 48, '×1000', 'middle', 13, RED)
    f.text(80, 175, '1 mA = 0.001 A', 'middle', 12, GRN)
    f.text(360, 175, '10 kΩ = 10000 Ω', 'middle', 12, RED)
    rect(f, 60, 190, 320, 30, fill='#fff7d6', stroke='#c9a227', sw=1.5, rx=6)
    f.text(220, 211, 'mA × kΩ = V（÷1000 と ×1000 で打ち消す）', 'middle', 13)
    f.save('l0-prefix')


# 3. 同じ抵抗の並列は半分
def parallel_half():
    f = Fig(420, 200)
    f.line((20, 95), (70, 95))
    f.line((70, 55), (70, 135))
    f.line((170, 55), (170, 135))
    f.line((170, 95), (205, 95))
    f.resistor_h(70, 170, 55, '100 kΩ')
    f.resistor_h(70, 170, 135)
    f.text(120, 165, '100 kΩ', 'middle', 14)
    f.dot(70, 95); f.dot(170, 95)
    f.text(232, 103, '=', 'middle', 26)
    f.line((260, 95), (270, 95))
    f.resistor_h(270, 390, 95)
    f.text(330, 75, '50 kΩ', 'middle', 16, RED)
    f.text(330, 130, '同じ大きさなら半分', 'middle', 13, RED)
    f.text(210, 192, '道が2本になって、流れやすくなる', 'middle', 12, SUB)
    f.save('l0-parallel-half')


# 4. 正弦波の式の記号
def sine_params():
    f = Fig(440, 270)
    x0, y0, A, P = 40, 140, 70, 160
    f.arrow(x0, y0, x0 + 390, y0, color=SUB, w=1.5)
    f.text(x0 + 390, y0 + 20, '時間 t', 'end', 12, SUB)
    phi = math.pi / 2
    pts = [(x0 + k * 2, y0 - A * math.cos(2 * math.pi * (k * 2) / P)) for k in range(0, 143)]
    f.line(*pts, color=SUB, w=2, dash='6 5')
    pts = [(x0 + k * 2, y0 - A * math.cos(2 * math.pi * (k * 2) / P + phi)) for k in range(0, 143)]
    f.line(*pts, color=ACC, w=3)
    # 位相：点線の山（x0+160）→ 実線の山（x0+120）
    f.arrow(x0 + P, y0 - A - 12, x0 + P - 40 + 2, y0 - A - 12, color=RED, w=2)
    f.text(x0 + P - 20, y0 - A - 22, 'φ（位相）', 'middle', 13, RED)
    # 振幅
    xa = x0 + P + 120
    f.arrow(xa, y0, xa, y0 - A + 2, color=INK, w=2)
    f.arrow(xa, y0 - A, xa, y0 - 2, color=INK, w=2)
    f.text(xa + 10, y0 - A / 2 + 5, 'V_{0}', 'start', 14)
    f.text(xa + 10, y0 - A / 2 + 23, '（振幅）', 'start', 12)
    # 周期
    yb = y0 + A + 22
    f.line((x0, yb), (x0 + P, yb), w=1.5)
    f.line((x0, yb - 6), (x0, yb + 6)); f.line((x0 + P, yb - 6), (x0 + P, yb + 6))
    f.text(x0 + P / 2, yb + 22, '1周期（1秒に f 回くり返す）', 'middle', 12)
    f.text(430, 22, '実線：V_{0} cos(ωt+φ)', 'end', 13, ACC)
    f.text(430, 40, '点線：φ=0 のとき', 'end', 12, SUB)
    f.save('l0-sine-params')


# 5. よく出る回路の記号
def symbols():
    f = Fig(450, 300)
    W, H = 150, 150
    cells = ['抵抗 R', '電流源', 'キャパシタ C', 'GND（0 V）', '増幅器', '電源 V_{DD}']
    for i, name in enumerate(cells):
        cx, cy = (i % 3) * W, (i // 3) * H
        rect(f, cx + 4, cy + 4, W - 8, H - 8, fill='#f7f8fc', stroke='#d5d8e8', sw=1.5, rx=8)
        f.text(cx + W / 2, cy + H - 18, name, 'middle', 14, ACC)
    # 抵抗
    f.resistor_h(25, 125, 65)
    # 電流源
    f.isrc(225, 25, 105)
    # キャパシタ
    f.line((320, 65), (367, 65)); f.line((383, 65), (430, 65))
    f.line((367, 40), (367, 90), w=3.5); f.line((383, 40), (383, 90), w=3.5)
    # GND
    f.line((75, 175), (75, 205)); f.ground(75, 205)
    # 増幅器
    f.add(f'<polygon points="195,175 195,235 250,205" fill="#fff" stroke="{INK}" stroke-width="2.5"/>')
    f.line((170, 205), (195, 205)); f.line((250, 205), (280, 205))
    f.text(212, 211, 'A', 'middle', 16)
    # 電源
    f.vdd(375, 195, '')
    f.line((375, 195), (375, 235))
    f.text(375, 182, '＋の一番高い電圧', 'middle', 12, SUB)
    f.save('l0-symbols')


# 6. キャパシタ（電気をためる）
def capacitor():
    f = Fig(450, 290)
    # 左：板2枚
    f.text(105, 26, '電気をためるバケツ', 'middle', 14)
    f.line((105, 45), (105, 85))
    f.line((45, 85), (165, 85), w=4)
    f.line((45, 125), (165, 125), w=4)
    f.line((105, 125), (105, 165))
    for k in range(5):
        x = 57 + k * 24
        f.text(x, 101, '+', 'middle', 15, RED)
        f.text(x, 121, '−', 'middle', 15, ACC)
    f.text(175, 110, 'v', 'start', 16)
    f.text(105, 195, 'q = C v', 'middle', 18)
    f.text(105, 218, '電圧が高いほど', 'middle', 12, SUB)
    f.text(105, 236, 'たくさんためる', 'middle', 12, SUB)
    # 右：v と i のグラフ
    x0, x1 = 240, 430
    xr = 330
    y0 = 115
    f.arrow(x0, y0, x1, y0, color=SUB, w=1.5); f.arrow(x0, y0, x0, 30, color=SUB, w=1.5)
    f.text(x0 - 6, 40, 'v', 'end', 14)
    f.line((x0, y0), (xr, 45), (x1 - 10, 45), color=ACC, w=3)
    f.text(x1 - 6, y0 + 18, 't', 'end', 12, SUB)
    y1 = 230
    f.arrow(x0, y1, x1, y1, color=SUB, w=1.5); f.arrow(x0, y1, x0, 150, color=SUB, w=1.5)
    f.text(x0 - 6, 160, 'i', 'end', 14)
    f.line((x0, 185), (xr, 185), (xr, y1), (x1 - 10, y1), color=RED, w=3)
    f.text(x1 - 6, y1 + 18, 't', 'end', 12, SUB)
    f.line((xr, 40), (xr, y1), color=SUB, w=1, dash='4 4')
    f.text((x0 + xr) / 2, 175, '流れる', 'middle', 12, RED)
    f.text((xr + x1) / 2, 220, '0', 'middle', 13, RED)
    f.text((x0 + xr) / 2, 140, '増えている', 'middle', 12, ACC)
    f.text((xr + x1) / 2, 75, '止まった', 'middle', 12, ACC)
    f.text(225, 278, 'i = C dv/dt：電圧が変わる間だけ電流が流れる', 'middle', 13)
    f.save('l0-capacitor')


# 7. N型とP型
def np_types():
    f = Fig(450, 240)
    import random
    rnd = random.Random(3)
    for k, (title, c) in enumerate([('N型', ACC), ('P型', RED)]):
        ox = 20 + k * 220
        rect(f, ox, 40, 190, 140, fill='#f7f8fc', stroke=c, sw=2.5, rx=10)
        f.text(ox + 95, 28, title, 'middle', 16, c)
        for i in range(4):
            for j in range(3):
                x = ox + 30 + i * 43 + rnd.uniform(-6, 6)
                y = 72 + j * 40 + rnd.uniform(-5, 5)
                if k == 0:
                    circle(f, x, y, 12, fill=ACC, stroke=ACC)
                    f.text(x, y + 6, '−', 'middle', 18, '#fff', 700)
                else:
                    circle(f, x, y, 12, fill='#fff', stroke=RED, sw=2)
                    f.text(x, y + 6, '+', 'middle', 16, RED, 700)
    f.text(115, 205, '動ける電子（−）が多い', 'middle', 13, ACC)
    f.text(115, 225, '＝人が多い部屋', 'middle', 12, SUB)
    f.text(335, 205, '電子が抜けた穴（＋）が多い', 'middle', 13, RED)
    f.text(335, 225, '＝空席が多い部屋', 'middle', 12, SUB)
    f.save('l0-np')


# 8. トランジスタ＝蛇口
def faucet():
    f = Fig(440, 270)
    rect(f, 20, 70, 140, 26, fill=LBLUE)
    rect(f, 150, 58, 70, 48, fill='#e8eaf3', rx=6)
    rect(f, 192, 106, 26, 28, fill='#e8eaf3')
    f.line((185, 58), (185, 38), w=4)
    f.line((155, 36), (215, 36), w=7)
    f.path('M150 20 Q185 2 220 20', color=RED, w=2.5)
    f.arrow(214, 15, 221, 21, color=RED)
    rect(f, 196, 134, 18, 82, fill=LBLUE, stroke=LBLUE)
    for yy in (150, 175, 200):
        f.arrow(205, yy, 205, yy + 14, color=ACC, w=2)
    f.add(f'<polygon points="160,205 250,205 240,255 170,255" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    rect(f, 174, 230, 62, 23, fill=LBLUE, stroke=LBLUE)
    f.text(90, 120, '水道から', 'middle', 12, SUB)
    f.arrow(258, 30, 222, 34, color=INK, w=1.5)
    f.text(262, 28, 'ハンドル', 'start', 14)
    f.text(262, 47, '＝ゲートの電圧', 'start', 14, RED)
    f.arrow(258, 170, 218, 170, color=INK, w=1.5)
    f.text(262, 168, '水の流れ', 'start', 14)
    f.text(262, 187, '＝ドレイン電流 I_{D}', 'start', 14, ACC)
    f.text(262, 236, '少し回すだけで', 'start', 12, SUB)
    f.text(262, 254, '大きな流れが変わる', 'start', 12, SUB)
    f.save('l0-faucet')


# 9. 増幅のイメージ
def amp_flow():
    f = Fig(450, 210)
    yc = 95

    def wave(xa, xb, a, c):
        pts = [(xa + (xb - xa) * k / 60, yc - a * math.sin(2 * math.pi * 2 * k / 60)) for k in range(61)]
        f.line(*pts, color=c, w=2.5)

    wave(12, 72, 8, ACC)
    f.arrow(78, yc, 98, yc)
    rect(f, 102, yc - 30, 76, 60, fill=LACC, rx=8)
    f.text(140, yc - 4, 'トランジ', 'middle', 13)
    f.text(140, yc + 14, 'スタ', 'middle', 13)
    f.arrow(182, yc, 200, yc)
    wave(204, 264, 28, GRN)
    f.arrow(270, yc, 284, yc)
    f.resistor_h(286, 336, yc)
    f.text(311, yc - 18, 'R', 'middle', 14)
    f.arrow(340, yc, 356, yc)
    wave(362, 438, -45, RED)  # 出力は V_DD − R·I なので、電流と逆向き（逆相）
    f.text(42, 165, '入力', 'middle', 13, ACC)
    f.text(42, 183, '（小さい）', 'middle', 12, ACC)
    f.text(140, 165, '蛇口', 'middle', 13)
    f.text(234, 165, '電流が', 'middle', 13, GRN)
    f.text(234, 183, '大きく変わる', 'middle', 12, GRN)
    f.text(311, 165, 'V_{DD}−RI', 'middle', 13)
    f.text(400, 165, '出力', 'middle', 13, RED)
    f.text(400, 183, '（大きく・逆向き）', 'middle', 12, RED)
    f.save('l0-amp-flow')


# 10. 2乗と√
def square_root():
    f = Fig(380, 310)
    x0, y0, s = 50, 270, 52
    axes(f, x0, y0, 345, 25, 'x', 'y')
    for k in range(1, 5):
        f.line((x0 + k * s, y0), (x0 + k * s, y0 + 5), w=1.5)
        f.text(x0 + k * s, y0 + 20, str(k), 'middle', 12, SUB)
        f.line((x0, y0 - k * s), (x0 - 5, y0 - k * s), w=1.5)
        f.text(x0 - 10, y0 - k * s + 5, str(k), 'end', 12, SUB)
    f.line((x0, y0), (x0 + 4.4 * s, y0 - 4.4 * s), color=SUB, w=1.2, dash='4 5')
    pts = [(x0 + x * s, y0 - x * x * s) for x in [k * 2.1 / 60 for k in range(61)]]
    f.line(*pts, color=RED, w=3)
    pts = [(x0 + x * s, y0 - math.sqrt(x) * s) for x in [(k / 80) ** 2 * 4.6 for k in range(81)]]
    f.line(*pts, color=ACC, w=3)
    f.line((x0 + 2 * s, y0 - 4 * s), (x0 + 2 * s, y0), color=RED, w=1, dash='3 4')
    f.line((x0 + 4 * s, y0 - 2 * s), (x0 + 4 * s, y0), color=ACC, w=1, dash='3 4')
    f.dot(x0 + 2 * s, y0 - 4 * s, 5, RED)
    f.dot(x0 + 4 * s, y0 - 2 * s, 5, ACC)
    f.text(x0 + 2 * s + 10, y0 - 4 * s + 5, '2² = 4', 'start', 14, RED)
    f.text(x0 + 4 * s - 4, y0 - 2 * s - 12, '√4 = 2', 'end', 14, ACC)
    f.text(x0 + 1.3 * s, y0 - 1.15 * s - 50, 'y = x²', 'end', 14, RED)
    f.text(x0 + 3.0 * s, y0 - 1.73 * s + 24, 'y = √x', 'start', 14, ACC)
    f.save('l0-square-root')


# 11. dy/dx：Δx を小さくすると接線になる
def limit():
    f = Fig(420, 290)
    x0, y0, sx, sy = 50, 260, 140, 46
    axes(f, x0, y0, 400, 20, 'x', 'y')
    P = lambda x: (x0 + x * sx, y0 - x * x * sy)
    f.line(*[P(k * 2.15 / 60) for k in range(61)], color=INK, w=2.5)
    px, py = P(1)
    # 大きい Δx（x=2）
    qx, qy = P(2)
    f.line((px - (qx - px) * 0.25, py - (qy - py) * 0.25), (qx + (qx - px) * 0.1, qy + (qy - py) * 0.1), color=SUB, w=1.8)
    f.line((px, py), (qx, py), color=ACC, w=1.5, dash='4 4')
    f.line((qx, py), (qx, qy), color=ACC, w=1.5, dash='4 4')
    f.text((px + qx) / 2, py + 20, 'Δx', 'middle', 14, ACC)
    f.text(qx + 8, (py + qy) / 2, 'Δy', 'start', 14, ACC)
    f.dot(qx, qy, 4, SUB)
    # 中くらい（x=1.5）
    mx, my = P(1.5)
    f.line((px - (mx - px) * 0.4, py - (my - py) * 0.4), (mx + (mx - px) * 0.3, my + (my - py) * 0.3), color=SUB, w=1.5, dash='5 4')
    f.dot(mx, my, 4, SUB)
    # 接線（傾き 2）
    t = lambda x: (x0 + x * sx, y0 - (1 + 2 * (x - 1)) * sy)
    f.line(t(0.5), t(2.1), color=RED, w=2.5)
    f.dot(px, py, 5, RED)
    f.text(250, 204, '接線', 'start', 13, RED)
    f.text(60, 34, 'Δx を小さくしていくと、', 'start', 13)
    f.text(60, 54, '灰色の線 → 赤い接線に近づく', 'start', 13)
    f.text(60, 76, '接線の傾き ＝ dy/dx', 'start', 14, RED)
    f.save('l0-limit')


# 12. 偏微分：1つだけ動かし、ほかは止める
def partial():
    f = Fig(440, 250)

    def knob(x, y, ang, c):
        circle(f, x, y, 26, fill='#fff', stroke=c, sw=3)
        a = math.radians(ang)
        f.line((x, y), (x + 20 * math.cos(a), y - 20 * math.sin(a)), color=c, w=3.5)

    knob(60, 70, 60, ACC)
    f.path('M30 34 Q60 14 92 36', color=ACC, w=2.5)
    f.arrow(86, 31, 93, 37, color=ACC)
    f.text(60, 120, 'V_{GS}：動かす', 'middle', 13, ACC)
    knob(60, 180, 120, SUB)
    rect(f, 82, 160, 32, 16, fill=RED, stroke=RED, rx=3)
    f.text(98, 173, '固定', 'middle', 12, '#fff')
    f.text(60, 232, 'V_{DS}：止める', 'middle', 13, SUB)
    f.arrow(120, 75, 160, 115, color=INK)
    f.arrow(120, 175, 160, 135, color=INK)
    rect(f, 162, 105, 56, 40, fill=LACC, rx=8)
    f.text(190, 131, 'I_{D}', 'middle', 16)
    f.arrow(222, 125, 244, 125)
    # グラフ
    gx, gy = 262, 210
    f.arrow(gx, gy, 430, gy, color=SUB, w=1.5); f.arrow(gx, gy, gx, 40, color=SUB, w=1.5)
    f.text(430, gy + 20, 'V_{GS}', 'end', 13)
    f.text(gx + 6, 50, 'I_{D}', 'start', 13)
    g = lambda u: gy - u * u * 140
    f.line(*[(gx + u * 160, g(u)) for u in [k / 50 for k in range(51)]], color=ACC, w=2.5)
    u = 0.65
    m = 2 * u * 140 / 160
    f.line((gx + 70, g(u) + m * (gx + u * 160 - gx - 70)), (gx + 165, g(u) - m * (gx + 165 - gx - u * 160)), color=RED, w=2)
    f.dot(gx + u * 160, g(u), 5, RED)
    f.text(gx + 4, 82, 'この傾きが', 'start', 12, RED)
    f.text(gx + 4, 100, '∂I_{D}/∂V_{GS}', 'start', 14, RED)
    f.save('l0-partial')


# 13. 近似：(1+x)² の小さな角
def approx():
    f = Fig(460, 300)
    o, L, s = 40, 200, 34
    rect(f, o, o, L, L, fill=LACC)
    rect(f, o + L, o, s, L, fill='#d4f2e8', stroke=GRN)
    rect(f, o, o + L, L, s, fill='#d4f2e8', stroke=GRN)
    rect(f, o + L, o + L, s, s, fill='#fde0e0', stroke=RED)
    f.text(o + L / 2, o + L / 2 + 8, '1', 'middle', 24)
    f.text(o + L + s / 2, o + L / 2 + 6, 'x', 'middle', 16, GRN)
    f.text(o + L / 2, o + L + s / 2 + 6, 'x', 'middle', 16, GRN)
    f.text(o + L + s / 2, o + L + s / 2 + 5, 'x²', 'middle', 12, RED)
    f.text(o + L / 2, o - 10, '1', 'middle', 14, SUB)
    f.text(o + L + s / 2, o - 10, 'x', 'middle', 14, SUB)
    tx = 292
    f.text(tx, 60, '(1+x)² の面積', 'start', 14)
    f.text(tx, 90, '= 1　大きな四角', 'start', 13, ACC)
    f.text(tx, 115, '+ 2x　細い帯2本', 'start', 13, GRN)
    f.text(tx, 140, '+ x²　小さな角', 'start', 13, RED)
    f.text(tx, 180, 'x が小さいと', 'start', 13)
    f.text(tx, 200, 'x² はもっと小さい', 'start', 13, RED)
    f.text(tx, 230, '→ 捨てて ≈ 1+2x', 'start', 14)
    f.save('l0-approx')


# 14. 複素数 x+jy
def complex_plane():
    f = Fig(380, 290)
    ox, oy = 70, 230
    f.arrow(20, oy, 355, oy, color=INK)
    f.arrow(ox, 275, ox, 20, color=INK)
    f.text(355, oy + 22, '実部', 'end', 13)
    f.text(ox + 8, 30, '虚部（j の向き）', 'start', 13)
    px, py = ox + 220, oy - 150
    f.line((px, py), (px, oy), color=GRN, w=1.8, dash='5 4')
    f.line((px, py), (ox, py), color=RED, w=1.8, dash='5 4')
    f.arrow(ox, oy, px - 4, py + 3, color=ACC, w=2.5)
    f.dot(px, py, 6, ACC)
    f.text(px + 10, py - 6, 'x + jy', 'start', 16, ACC)
    f.text(px, oy + 22, 'x', 'middle', 16, GRN)
    f.text(ox - 10, py + 6, 'y', 'end', 16, RED)
    f.text((ox + px) / 2, oy - 8, '実部 x', 'middle', 12, GRN)
    f.text(px + 8, (py + oy) / 2 + 20, '虚部 y', 'start', 12, RED)
    f.line((ox - 5, oy - 50), (ox + 5, oy - 50), w=2)
    f.text(ox - 10, oy - 45, 'j', 'end', 15)
    f.text(ox - 8, oy + 20, '0', 'end', 13, SUB)
    f.text(190, 280, '横に x、縦に y 進んだ点', 'middle', 12, SUB)
    f.save('l0-complex')


# 15. 指数関数 e^x
def exp_graph():
    f = Fig(420, 300)
    x0, y0, sx, sy = 190, 260, 80, 42
    f.arrow(20, y0, 405, y0, color=INK)
    f.arrow(x0, 290, x0, 20, color=INK)
    f.text(405, y0 + 22, 'x', 'end', 14)
    f.text(x0 + 8, 30, 'y', 'start', 14)
    P = lambda x: (x0 + x * sx, y0 - math.exp(x) * sy)
    f.line(*[P(-2.1 + k * 3.65 / 80) for k in range(81)], color=ACC, w=3)
    f.text(P(1.55)[0] - 10, P(1.55)[1] + 4, 'y = eˣ', 'end', 15, ACC)
    # x=0 で 1
    f.dot(*P(0), 5, INK)
    f.text(x0 - 8, P(0)[1] - 6, '1', 'end', 14)
    # x=1 の高さと傾き
    e = math.e
    px, py = P(1)
    f.line((px, py), (px, y0), color=GRN, w=2, dash='5 4')
    f.text(px + 8, y0 - 30, '高さ e', 'start', 13, GRN)
    t = lambda x: (x0 + x * sx, y0 - (e + e * (x - 1)) * sy)
    f.line(t(0.35), t(1.45), color=RED, w=2.5)
    f.dot(px, py, 5, RED)
    f.text(t(1.45)[0] + 6, t(1.45)[1] + 16, '傾きも e', 'start', 13, RED)
    f.text(30, 50, 'どの点でも', 'start', 13)
    f.text(30, 70, '傾き ＝ 高さ', 'start', 14, RED)
    f.text(30, 90, '（微分しても同じ形）', 'start', 12, SUB)
    f.text(30, 120, 'e ≈ 2.718', 'start', 13, SUB)
    f.save('l0-exp')


# 16. Σ と ∫
def sum_integral():
    f = Fig(450, 250)
    # Σ
    f.text(105, 26, 'Σ：全部足す', 'middle', 15)
    by, u = 190, 38
    for n in (1, 2, 3):
        x = 30 + (n - 1) * 52
        rect(f, x, by - n * u, 40, n * u, fill=LACC, stroke=ACC)
        f.text(x + 20, by - n * u + 22, str(n), 'middle', 16, ACC)
        f.text(x + 20, by + 20, f'n={n}', 'middle', 12, SUB)
    f.line((20, by), (190, by), w=2)
    f.text(105, 236, '1 + 2 + 3 = 6', 'middle', 15)
    f.line((222, 20), (222, 240), color='#d5d8e8', w=1.5)
    # ∫
    f.text(340, 26, '∫：面積', 'middle', 15)
    gx, gy = 245, 190
    g = lambda x: gy - (40 + 60 * math.sin(math.pi * x / 180 * 0.9 + 0.3))
    for k in range(10):
        xa = gx + 15 + k * 16
        rect(f, xa, g(xa - gx + 8), 16, gy - g(xa - gx + 8), fill='#d4f2e8', stroke=GRN, sw=1.2)
    f.line(*[(gx + x, g(x)) for x in range(0, 191, 3)], color=INK, w=3)
    f.arrow(gx, gy, 440, gy, color=INK, w=2)
    f.text(340, 214, '細く区切って足す', 'middle', 12, GRN)
    f.text(340, 236, '＝なめらかな Σ', 'middle', 13)
    f.save('l0-sum-integral')


# 17. 大文字（直流）＋小文字（小さな変化）
def dc_ac():
    f = Fig(440, 260)
    x0, y0 = 50, 225
    axes(f, x0, y0, 425, 25, '時間 t', '')
    f.text(x0 - 8, y0 + 5, '0', 'end', 13, SUB)
    lev, A = 130, 30
    f.line((x0, lev), (410, lev), color=ACC, w=2.5, dash='7 5')
    pts = [(x0 + k * 3, lev - A * math.sin(2 * math.pi * k * 3 / 120)) for k in range(0, 121)]
    f.line(*pts, color=RED, w=3)
    # 大文字：0 からの高さ
    xl = 90
    f.arrow(xl, y0, xl, lev + 2, color=ACC, w=2)
    f.text(xl + 8, 185, 'I_{D}（大文字）', 'start', 14, ACC)
    f.text(xl + 8, 204, '一定の直流（バイアス）', 'start', 12, ACC)
    # 小文字：変化の幅
    xs = x0 + 30
    xp = x0 + 30  # 山の位置
    f.arrow(xp, lev, xp, lev - A + 2, color=RED, w=2)
    f.text(xp + 26, lev - A - 32, 'i_{d}（小文字）：小さな変化', 'start', 14, RED)
    f.line((xp + 6, lev - A + 4), (xp + 24, lev - A - 26), color=RED, w=1.2)
    f.text(412, 70, '全体 ＝ I_{D} ＋ i_{d}', 'end', 14)
    f.save('l0-dc-ac')


# 18. 添字の読み方（MOSFET の V_GS, V_DS, I_D）
def subscripts():
    f = Fig(380, 270)
    t = f.mos(170, 130, 'n')
    gx, gy = t['G']; dx, dy = t['D']; sx_, sy_ = t['S']
    f.line((gx, gy), (70, gy))
    f.line((dx, dy), (dx, 40), (290, 40))
    f.line((sx_, sy_), (sx_, 215))
    f.line((70, 215), (290, 215))
    for p in [(70, gy), (70, 215), (290, 40), (290, 215)]:
        circle(f, p[0], p[1], 4.5, fill='#fff', stroke=INK, sw=2)
    f.dot(sx_, 215)
    f.text(gx + 2, gy - 10, 'G', 'end', 15)
    f.text(dx + 10, 62, 'D', 'start', 15)
    f.text(dx + 10, 200, 'S', 'start', 15)
    # V_GS
    f.text(62, gy + 6, '+', 'end', 15, RED)
    f.text(62, 220, '−', 'end', 15, RED)
    f.arrow(70, 205, 70, gy + 12, color=RED, w=1.8)
    f.text(60, 178, 'V_{GS}', 'end', 15, RED)
    # V_DS
    f.text(298, 46, '+', 'start', 15, GRN)
    f.text(298, 221, '−', 'start', 15, GRN)
    f.arrow(290, 205, 290, 52, color=GRN, w=1.8)
    f.text(300, 133, 'V_{DS}', 'start', 15, GRN)
    # I_D
    f.arrow(dx + 14, 70, dx + 14, 92, color=ACC, w=2.2)
    f.text(dx + 14, 88, '', 'start')
    f.text(232, 86, 'I_{D}', 'start', 15, ACC)
    f.text(190, 258, '下つき文字＝どこの電圧・電流か', 'middle', 12, SUB)
    f.save('l0-subscripts')


if __name__ == '__main__':
    for fn in [ohm, prefix, parallel_half, sine_params, symbols, capacitor, np_types, faucet, amp_flow,
               square_root, limit, partial, approx, complex_plane, exp_graph, sum_integral, dc_ac, subscripts]:
        fn()
    print('ok')
