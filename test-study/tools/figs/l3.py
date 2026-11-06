# 第3回（OPアンプと負帰還）の図。python3 test-study/tools/figs/l3.py
import sys, math
sys.path.insert(0, '/home/user/-/test-study/tools')
from figs_denshi1 import *

WATER = '#cfe8ff'


def rect(f, x, y, w, h, stroke=INK, fill='#fff', rx=8, sw=2):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def circle(f, x, y, r, stroke=INK, fill='#fff', sw=2):
    f.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def poly(f, pts, stroke=INK, fill='#fff', sw=2):
    d = ' '.join(f'{x},{y}' for x, y in pts)
    f.add(f'<polygon points="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>')


def opamp(f, x, y, h=100, w=90, signs=True):
    """x,y：三角形の左上。戻り値：−入力、＋入力、出力の座標"""
    poly(f, [(x, y), (x, y + h), (x + w, y + h / 2)])
    m, p = (x, y + h * 0.25), (x, y + h * 0.75)
    if signs:
        f.text(x + 8, m[1] + 6, '−', 'start', 18)
        f.text(x + 8, p[1] + 6, '+', 'start', 16)
    return m, p, (x + w, y + h / 2)


def summer(f, x, y, sign, sc=INK):
    circle(f, x, y, 14)
    f.line((x - 8, y), (x + 8, y)); f.line((x, y - 8), (x, y + 8))


def wave(f, x0, x1, yc, amp, color, cycles=2, w=2.5, inv=False):
    pts = []
    for k in range(81):
        t = k / 80
        s = math.sin(2 * math.pi * cycles * t) * (-1 if inv else 1)
        pts.append((round(x0 + (x1 - x0) * t, 1), round(yc - amp * s, 1)))
    f.line(*pts, color=color, w=w)


# ① 増幅器の記号（小さな波 → A倍の波）
def amp_symbol():
    f = Fig(440, 220)
    wave(f, 20, 120, 100, 10, ACC)
    f.text(70, 150, '小さい v_{in}', 'middle', 13, ACC)
    f.arrow(126, 100, 168, 100)
    poly(f, [(170, 55), (170, 145), (260, 100)])
    f.text(200, 107, 'A', 'middle', 20)
    f.arrow(262, 100, 300, 100)
    wave(f, 310, 420, 100, 38, RED)
    f.text(365, 170, '大きい v_{out}', 'middle', 13, RED)
    f.text(220, 200, '形はそのまま、大きさだけ A 倍', 'middle', 14)
    f.text(220, 34, 'v_{out} = A × v_{in}', 'middle', 15)
    f.save('l3-amp-symbol')


# ② メガホン
def megaphone():
    f = Fig(440, 230)
    # 顔
    circle(f, 60, 100, 30)
    f.dot(68, 92, 3)
    f.line((78, 108), (90, 106))
    # 小さな声
    for r in (10, 18):
        f.path(f'M {96 + r * .3} {100 - r} A {r} {r} 0 0 1 {96 + r * .3} {100 + r}', color=ACC, w=2.5)
    # メガホン
    poly(f, [(130, 88), (130, 112), (240, 150), (240, 50)], fill='#fff3d6')
    rect(f, 120, 86, 12, 28, rx=3)
    # 大きな声
    for r in (30, 48, 66):
        f.path(f'M {250} {100 - r} A {r * 1.1} {r} 0 0 1 {250} {100 + r}', color=RED, w=3)
    f.text(100, 150, '小さな声', 'middle', 13, ACC)
    f.text(345, 196, '大きな声', 'middle', 13, RED)
    f.text(220, 220, '増幅器も同じ：小さい電圧を A 倍に', 'middle', 14)
    f.save('l3-megaphone')


# ③ GND は高さの基準
def gnd_height():
    f = Fig(440, 250)
    f.text(110, 26, '山の高さ', 'middle', 14)
    f.text(330, 26, '電圧', 'middle', 14)
    # 山と海
    f.add(f'<rect x="20" y="180" width="180" height="30" fill="{WATER}"/>')
    poly(f, [(50, 180), (110, 60), (170, 180)], stroke=GRN, fill='#dff3ea')
    f.line((20, 180), (200, 180), color=ACC, w=2.5)
    f.text(110, 232, '海面＝0 m', 'middle', 13, ACC)
    f.arrow(185, 178, 185, 64, color=RED); f.line((110, 60), (192, 60), color=RED, w=1.5, dash='4 4')
    f.text(178, 120, '高さ', 'end', 13, RED)
    # 電圧
    f.line((250, 180), (420, 180), color=ACC, w=2.5)
    f.ground(335, 180)
    f.text(250, 232, 'GND＝0 V', 'start', 13, ACC)
    f.dot(300, 80, 5, INK); f.text(310, 76, 'この点', 'start', 13)
    f.arrow(300, 178, 300, 86, color=RED)
    f.text(306, 136, 'GND から何 V', 'start', 13, RED)
    f.save('l3-gnd-height')


# ④ 負帰還と正帰還
def feedback_pm():
    f = Fig(440, 270)
    for row, (sign, col, name, res) in enumerate([('−', RED, '負帰還', '引き算で戻す → 落ち着く'), ('+', GRN, '正帰還', '足し算で戻す → ふくらむ')]):
        y = 50 + row * 120
        f.text(20, y + 5, '入力', 'start', 13)
        f.arrow(52, y, 86, y)
        summer(f, 100, y, sign)
        f.text(108, y + 40, sign, 'middle', 20, col)
        f.arrow(114, y, 150, y)
        rect(f, 150, y - 20, 60, 40)
        f.text(180, y + 7, 'A', 'middle', 16)
        f.line((210, y), (260, y)); f.dot(240, y)
        f.arrow(260, y, 280, y); f.text(284, y + 5, '出力', 'start', 13)
        f.line((240, y), (240, y + 42), (100, y + 42))
        f.arrow(100, y + 42, 100, y + 14, color=col)
        f.text(330, y - 12, name, 'start', 15, col)
        f.text(434, y + 62, res, 'end', 13, col)
    f.save('l3-feedback-pm')


# ⑤ シャワーの温度（負帰還のたとえ）
def shower():
    f = Fig(440, 270)
    # シャワーヘッドと管
    f.line((60, 150), (60, 50), (150, 50), w=5)
    poly(f, [(140, 50), (190, 40), (190, 70)], fill='#e8eaf3')
    for k, (dx, dy) in enumerate([(0, 0), (14, 8), (-12, 12), (6, 24), (-4, 38), (16, 40)]):
        f.add(f'<ellipse cx="{205 + dx}" cy="{88 + dy}" rx="3" ry="6" fill="{ACC}"/>')
    # 蛇口のハンドル
    circle(f, 60, 170, 20, fill='#fff3d6')
    f.line((44, 170), (76, 170), w=4)
    f.text(88, 168, '蛇口', 'start', 13)
    f.text(88, 186, '（入力を直す）', 'start', 12, SUB)
    f.text(210, 160, 'お湯の温度', 'middle', 13)
    f.text(210, 176, '（出てきた結果）', 'middle', 12, SUB)
    # 温度計
    rect(f, 330, 40, 18, 100, rx=9)
    circle(f, 339, 150, 14, stroke=INK, fill=RED)
    f.add(f'<rect x="334" y="80" width="10" height="64" fill="{RED}"/>')
    f.text(339, 190, '温度を見る', 'middle', 13)
    # ループの矢印
    f.arrow(238, 110, 318, 110, color=ACC)
    f.path('M 339 200 L 339 256 L 22 256 L 22 170', color=RED, w=2.5)
    f.arrow(22, 170, 38, 170, color=RED)
    f.text(190, 246, '熱い→水を足す　冷たい→お湯を足す', 'middle', 13, RED)
    f.text(420, 30, 'ずれを打ち消す', 'end', 12, RED)
    f.text(420, 46, '＝負帰還', 'end', 12, RED)
    f.save('l3-shower')


# ⑥ 閉ループ利得の導出：線ごとの信号の大きさ
def closed_derive():
    f = Fig(460, 260)
    f.text(14, 84, 'x_{in}', 'start', 15, ACC)
    f.arrow(48, 80, 96, 80)
    summer(f, 110, 80, '−')
    f.text(92, 66, '+', 'middle', 14); f.text(128, 116, '−', 'middle', 18, RED)
    f.arrow(124, 80, 186, 80)
    f.text(155, 66, 'x_{in}−βx_{out}', 'middle', 13, GRN)
    rect(f, 186, 56, 60, 48)
    f.text(216, 87, 'A', 'middle', 18)
    f.line((246, 80), (360, 80)); f.dot(340, 80)
    f.arrow(360, 80, 390, 80); f.text(394, 85, 'x_{out}', 'start', 15, ACC)
    f.text(298, 66, 'A(x_{in}−βx_{out})', 'middle', 13, GRN)
    f.line((340, 80), (340, 170))
    f.arrow(340, 170, 246, 170)
    rect(f, 186, 148, 60, 44)
    f.text(216, 177, 'β', 'middle', 18)
    f.line((186, 170), (110, 170))
    f.arrow(110, 170, 110, 94, color=RED)
    f.text(150, 162, 'βx_{out}', 'middle', 13, RED)
    f.text(230, 228, 'A(x_{in}−βx_{out}) と x_{out} は同じ線', 'middle', 13)
    f.text(230, 248, '→ A(x_{in}−βx_{out}) = x_{out}', 'middle', 14, GRN)
    f.save('l3-closed-derive')


# ⑦ 開ループと閉ループ
def open_closed():
    f = Fig(440, 280)
    # 開ループ
    f.text(20, 26, '開ループ（輪が開いている）', 'start', 14)
    f.text(20, 69, 'x_{in}', 'start', 14)
    f.arrow(54, 64, 140, 64)
    rect(f, 140, 42, 64, 44); f.text(172, 71, 'A', 'middle', 17)
    f.arrow(204, 64, 290, 64); f.text(296, 69, 'x_{out}', 'start', 14)
    f.text(420, 106, '利得 A_{open} = A', 'end', 14, ACC)
    f.line((20, 124), (420, 124), color='#dde', w=1.5)
    # 閉ループ
    f.text(20, 152, '閉ループ（輪が閉じている）', 'start', 14)
    y = 190
    f.text(20, y + 5, 'x_{in}', 'start', 14)
    f.arrow(54, y, 86, y)
    summer(f, 100, y, '−'); f.text(122, y + 30, '−', 'middle', 18, RED)
    f.arrow(114, y, 140, y)
    rect(f, 140, y - 22, 64, 44); f.text(172, y + 7, 'A', 'middle', 17)
    f.line((204, y), (280, y)); f.dot(250, y)
    f.arrow(280, y, 300, y); f.text(304, y + 5, 'x_{out}', 'start', 14)
    f.line((250, y), (250, y + 56), (210, y + 56))
    rect(f, 160, y + 40, 50, 32); f.text(185, y + 62, 'β', 'middle', 15)
    f.line((160, y + 56), (100, y + 56))
    f.arrow(100, y + 56, 100, y + 14, color=RED)
    f.text(420, y + 66, 'A_{closed} = A/(1+Aβ)', 'end', 14, GRN)
    f.save('l3-open-closed')


def logx(a):
    return math.log10(a)


# ⑧ A を大きくすると閉ループ利得は 1/β に落ち着く（β=0.1）
def stable_graph():
    f = Fig(440, 290)
    x0, y0 = 60, 240
    axes(f, x0, y0, 420, 30, '', 'A_{closed}')
    f.text(420, y0 - 10, 'A（対数）', 'end', 13)
    sx = 340 / 6.0   # 10^0〜10^6
    sy = 180 / 12.0
    beta = 0.1
    # 1/β の線
    f.line((x0, y0 - 10 * sy), (x0 + 6 * sx, y0 - 10 * sy), color=RED, w=1.6, dash='6 5')
    f.text(x0 - 6, y0 - 10 * sy + 5, '1/β', 'end', 13, RED)
    # 帰還なし（A そのもの）
    pts = [(x0 + logx(a) * sx, y0 - a * sy) for a in [10 ** (k / 40) for k in range(0, 46)] if a <= 12.5]
    f.line(*pts, color=SUB, w=2, dash='3 4')
    f.text(x0 + 1.1 * sx + 6, 52, '帰還なし（A のまま）', 'start', 12, SUB)
    pts = [(x0 + logx(a) * sx, y0 - a / (1 + a * beta) * sy) for a in [10 ** (k / 40) for k in range(0, 241)]]
    f.line(*pts, color=ACC, w=3)
    for k, lab in enumerate(['1', '10', '100', '1000', '1万', '10万', '100万']):
        x = x0 + k * sx
        f.line((x, y0), (x, y0 + 5)); f.text(x, y0 + 20, lab, 'middle', 12, SUB)
    f.line((x0, y0 - 5 * sy), (x0 - 5, y0 - 5 * sy)); f.text(x0 - 8, y0 - 5 * sy + 5, '5', 'end', 12, SUB)
    f.text(x0 + 4.2 * sx, y0 - 10 * sy + 26, 'Aβ≫1 ではほぼ 1/β', 'middle', 13, ACC)
    f.text(x0 + 4.2 * sx, y0 - 10 * sy + 44, '（β=0.1 の例）', 'middle', 12, SUB)
    f.save('l3-stable-graph')


# ⑨ A がばらついても全体の利得はほぼ同じ
def a_vary():
    f = Fig(440, 250)
    f.text(110, 28, '増幅器の A（ばらつく）', 'middle', 13, SUB)
    f.text(345, 28, '全体の利得', 'middle', 13, SUB)
    for k, (lab, L) in enumerate([('A = 10万', 90), ('A = 20万', 180)]):
        y = 66 + k * 70
        f.add(f'<rect x="20" y="{y}" width="{L}" height="26" rx="4" fill="{ACC}"/>')
        f.text(20 + L + 6 if L < 150 else 24, y + 19, lab, 'start', 13, INK if L < 150 else '#fff')
        f.arrow(212, y + 13, 262, y + 13, color=SUB)
        f.add(f'<rect x="275" y="{y}" width="60" height="26" rx="4" fill="{GRN}"/>')
        f.text(342, y + 19, '約 10', 'start', 14, GRN)
    f.text(237, 120, '負帰還（β=0.1）', 'middle', 12, SUB)
    f.text(220, 222, 'A が倍になっても、全体はほとんど変わらない', 'middle', 13)
    f.save('l3-a-vary')


# ⑩ 負帰還の効用3つ
def merits():
    f = Fig(460, 240)
    for i, t in enumerate(['① 利得の安定化', '② 帯域の拡大', '③ インピーダンス']):
        cx = 78 + i * 152
        f.text(cx, 28, t, 'middle', 13, ACC)
        rect(f, cx - 70, 40, 140, 150, stroke='#dde', sw=1.5)
    # ① ぶれない
    cx = 78
    f.line((cx - 55, 110), (cx - 40, 80), (cx - 25, 135), (cx - 10, 90), (cx, 120), color=SUB, w=2)
    f.arrow(cx + 4, 110, cx + 22, 110, color=INK)
    f.line((cx + 28, 110), (cx + 60, 110), color=GRN, w=3)
    f.text(cx - 28, 165, 'A', 'middle', 13, SUB)
    f.text(cx + 44, 165, '全体', 'middle', 13, GRN)
    f.text(cx, 214, 'ぶれない', 'middle', 13)
    # ② 帯域：利得–周波数
    cx = 230
    bx, by = cx - 58, 170
    f.arrow(bx, by, bx + 120, by); f.arrow(bx, by, bx, 52)
    f.text(bx + 118, by + 16, '周波数', 'end', 12, SUB)
    f.line((bx, 70), (bx + 40, 70), (bx + 62, 120), color=SUB, w=2)
    f.line((bx, 130), (bx + 86, 130), (bx + 104, 160), color=GRN, w=3)
    f.arrow(bx + 44, 144, bx + 84, 144, color=GRN)
    f.text(cx, 214, '使える範囲が広い', 'middle', 13)
    # ③ 入口・出口
    cx = 382
    rect(f, cx - 26, 80, 52, 60); f.text(cx, 116, 'A', 'middle', 15)
    f.line((cx - 60, 110), (cx - 26, 110)); f.line((cx + 26, 110), (cx + 60, 110))
    f.text(cx - 44, 98, '入口', 'middle', 12, SUB); f.text(cx + 44, 98, '出口', 'middle', 12, SUB)
    f.arrow(cx - 44, 150, cx - 44, 124, color=RED); f.arrow(cx + 44, 150, cx + 44, 124, color=RED)
    f.text(cx, 172, '抵抗の見え方', 'middle', 12, RED)
    f.text(cx, 214, 'を変えられる', 'middle', 13)
    f.save('l3-merits')


# ⑪ ハウリング（正帰還）
def howling():
    f = Fig(440, 285)
    # マイク
    circle(f, 60, 110, 18, fill='#e8eaf3')
    f.line((60, 128), (60, 170), w=4)
    f.text(60, 192, 'マイク', 'middle', 13)
    # アンプ
    f.arrow(80, 110, 160, 110)
    poly(f, [(160, 85), (160, 135), (210, 110)])
    f.text(172, 116, 'A', 'start', 14)
    f.line((210, 110), (270, 110))
    # スピーカー
    rect(f, 270, 96, 16, 28, rx=2, fill='#e8eaf3')
    poly(f, [(286, 96), (310, 76), (310, 144), (286, 124)], fill='#e8eaf3')
    for r in (16, 28, 40):
        f.path(f'M {316} {110 - r} A {r} {r} 0 0 1 {316} {110 + r}', color=RED, w=2.5)
    f.text(298, 172, 'スピーカー', 'middle', 13)
    # 戻る矢印
    f.path('M 300 64 C 260 40 110 40 70 84', color=RED, w=2.5)
    f.arrow(76, 74, 70, 86, color=RED)
    f.text(185, 30, '出た音がまたマイクへ（プラスで戻る）', 'middle', 13, RED)
    # ふくらむ波
    pts = []
    for k in range(161):
        t = k / 160
        pts.append((round(40 + 360 * t, 1), round(228 - (3 + 22 * t * t) * math.sin(2 * math.pi * 9 * t), 1)))
    f.line(*pts, color=RED, w=2)
    f.text(420, 276, 'どんどん大きく →「キーン」', 'end', 13, RED)
    f.save('l3-howling')


# ⑫ OPアンプの式：＋側と−側で出力の動く向き
def opamp_sign():
    f = Fig(440, 260)
    m, p, o = opamp(f, 160, 40, 110, 100)
    f.line((110, m[1]), m); f.line((110, p[1]), p); f.line(o, (320, o[1]))
    f.text(104, m[1] + 5, '−側', 'end', 14, RED)
    f.text(104, p[1] + 5, '＋側', 'end', 14, GRN)
    f.text(326, o[1] + 5, '出力', 'start', 14)
    f.arrow(132, m[1] - 4, 132, m[1] - 26, color=RED)
    f.arrow(132, p[1] + 26, 132, p[1] + 4, color=GRN)
    f.arrow(296, o[1] - 6, 296, o[1] - 30, color=GRN)
    f.arrow(296, o[1] + 6, 296, o[1] + 30, color=RED)
    f.text(220, 202, '＋側が上がる → 出力が上がる', 'middle', 14, GRN)
    f.text(220, 226, '−側が上がる → 出力が下がる（反転）', 'middle', 14, RED)
    f.text(220, 250, '出力 ＝ A_{d} ×（＋側 − −側）', 'middle', 13, SUB)
    f.save('l3-opamp-sign')


# ⑬ 理想OPアンプの3つの特徴
def ideal3():
    f = Fig(460, 240)
    for i, t in enumerate(['① 入力に電流ゼロ', '② 増幅率が∞', '③ 2入力が同じ電圧']):
        cx = 78 + i * 152
        f.text(cx, 28, t, 'middle', 13, ACC)
        rect(f, cx - 70, 40, 140, 160, stroke='#dde', sw=1.5)
    # ①
    cx = 78
    m, p, o = opamp(f, cx - 20, 70, 80, 64)
    f.line((cx - 62, m[1]), m); f.line((cx - 62, p[1]), p); f.line(o, (cx + 62, o[1]))
    f.arrow(cx - 58, m[1] - 12, cx - 28, m[1] - 12, color=RED)
    f.line((cx - 50, m[1] - 20), (cx - 36, m[1] - 4), color=RED, w=2.5)
    f.text(cx, 186, '電流 = 0', 'middle', 13, RED)
    # ②
    cx = 230
    m, p, o = opamp(f, cx - 32, 70, 80, 64)
    f.line((cx - 62, m[1]), m); f.line((cx - 62, p[1]), p); f.line(o, (cx + 62, o[1]))
    f.text(cx - 8, o[1] + 5, 'A_{d}', 'middle', 12)
    f.text(cx, 186, 'A_{d} → ∞', 'middle', 14, RED)
    # ③
    cx = 382
    m, p, o = opamp(f, cx - 20, 70, 80, 64)
    f.line((cx - 62, m[1]), m); f.line((cx - 62, p[1]), p); f.line(o, (cx + 62, o[1]))
    f.line((cx - 40, m[1]), (cx - 40, p[1]), color=RED, w=2, dash='4 4')
    f.text(cx - 46, (m[1] + p[1]) / 2 + 5, '＝', 'end', 16, RED)
    f.text(cx, 186, '電圧が等しい', 'middle', 13, RED)
    f.save('l3-ideal3')


# ⑭ なぜ同じ電圧？（仮想ショート）
def virtual_short():
    f = Fig(440, 260)
    m, p, o = opamp(f, 160, 60, 110, 100)
    f.line((90, m[1]), m); f.line((60, p[1]), p)
    f.line(o, (340, o[1])); f.dot(330, o[1]); f.text(346, o[1] + 5, '出力（有限）', 'start', 13)
    # 負帰還の線
    f.line((330, o[1]), (330, 30), (110, 30), (110, m[1]))
    f.dot(110, m[1])
    f.text(220, 22, '負帰還', 'middle', 12, SUB)
    # 差
    f.line((128, m[1] + 4), (128, p[1] - 4), color=RED, w=2.5, dash='4 4')
    f.text(122, (m[1] + p[1]) / 2 - 2, '差', 'end', 13, RED)
    f.text(122, (m[1] + p[1]) / 2 + 15, '≈ 0 V', 'end', 13, RED)
    f.text(220, 212, '出力 ＝ A_{d}（∞）× 差 が有限', 'middle', 14)
    f.text(220, 236, '→ 差はほぼ 0（仮想ショート）', 'middle', 14, RED)
    f.save('l3-virtual-short')


def inv_base(f, x0=40):
    """反転増幅回路。戻り値：主な座標"""
    m, p, o = opamp(f, 240, 80, 100, 90)
    f.dot(x0, 105)
    f.resistor_h(x0, 180, 105, None)
    f.line((180, 105), m); f.dot(200, 105)
    f.line((200, 105), (200, 50)); f.resistor_h(200, 370, 50, None); f.line((370, 50), (370, o[1]))
    f.line(o, (410, o[1])); f.dot(370, o[1]); f.dot(410, o[1], 4)
    f.line(p, (215, p[1]), (215, 172)); f.ground(215, 172)
    return m, p, o


# ⑮ 反転増幅：R1 と R2 に同じ電流
def inv_current():
    f = Fig(460, 260)
    m, p, o = inv_base(f)
    f.text(36, 100, 'v_{in}', 'end', 14)
    f.text(110, 130, 'R_{1}', 'middle', 14)
    f.text(285, 32, 'R_{2}', 'middle', 14)
    f.text(414, o[1] - 10, 'v_{out}', 'start', 14)
    f.arrow(80, 82, 140, 82, color=ACC); f.text(110, 74, 'i', 'middle', 15, ACC)
    f.arrow(250, 74, 320, 74, color=ACC); f.text(328, 79, 'i', 'start', 15, ACC)
    # OPアンプへは流れない
    f.arrow(208, 92, 236, 92, color=RED)
    f.line((214, 84), (228, 100), color=RED, w=2.5)
    f.text(222, 80, '0', 'middle', 14, RED)
    f.text(230, 222, 'OPアンプに流れこまない', 'middle', 13, RED)
    f.text(230, 244, '→ R_{1} と R_{2} を同じ電流 i が流れる', 'middle', 14, ACC)
    f.save('l3-inv-current')


# ⑯ 仮想接地：−端子も 0 V
def virtual_ground():
    f = Fig(460, 260)
    m, p, o = inv_base(f)
    f.text(36, 100, 'v_{in}', 'end', 14)
    f.text(110, 130, 'R_{1}', 'middle', 14)
    f.text(285, 32, 'R_{2}', 'middle', 14)
    f.text(414, o[1] - 10, 'v_{out}', 'start', 14)
    circle(f, 200, 105, 9, stroke=RED, fill='none', sw=2.5)
    f.text(194, 132, 'v_{i} = 0 V', 'end', 14, RED)
    f.text(206, 160, '0 V', 'end', 13, GRN)
    f.text(230, 222, '−端子は GND につないでいないのに 0 V', 'middle', 13)
    f.text(230, 244, '＝ 仮想接地', 'middle', 15, RED)
    f.save('l3-virtual-ground')


# ⑰ 反転増幅の入出力の波形
def inv_wave():
    f = Fig(440, 250)
    x0, y0 = 50, 125
    f.arrow(x0, y0, 420, y0); f.arrow(x0, 215, x0, 30)
    f.text(420, 236, '時間 →', 'end', 12, SUB)
    wave(f, x0, 400, y0, 12, ACC, cycles=1.75, w=3)
    wave(f, x0, 400, y0, 80, RED, cycles=1.75, w=3, inv=True)
    f.line((330, 18), (350, 18), color=ACC, w=3); f.text(356, 23, 'v_{in}', 'start', 13, ACC)
    f.line((60, 18), (80, 18), color=RED, w=3); f.text(86, 23, 'v_{out}（逆向き・R_{2}/R_{1} 倍）', 'start', 13, RED)
    f.save('l3-inv-wave')


# ⑱ 計算例
def inv_calc():
    f = Fig(460, 260)
    m, p, o = inv_base(f)
    f.text(36, 100, '0.2 V', 'end', 14, ACC)
    f.text(110, 130, 'R_{1}=1 kΩ', 'middle', 13)
    f.text(285, 32, 'R_{2}=10 kΩ', 'middle', 13)
    f.text(414, o[1] - 10, '−2 V', 'start', 14, RED)
    f.text(194, 132, '0 V', 'end', 13, GRN)
    f.text(230, 222, 'v_{out} = −(10/1) × 0.2 = −2 V', 'middle', 14)
    f.text(230, 244, '10倍に大きく、向きは逆', 'middle', 13, RED)
    f.save('l3-inv-calc')


ALL = [amp_symbol, megaphone, gnd_height, feedback_pm, shower, closed_derive, open_closed,
       stable_graph, a_vary, merits, howling, opamp_sign, ideal3, virtual_short,
       inv_current, virtual_ground, inv_wave, inv_calc]
if __name__ == '__main__':
    for fn in ALL:
        fn()
