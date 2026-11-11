# 通信理論 第6回（畳込み符号）の図
#   python3 test-study/tools/figs_tsushin/l6.py  → data/tsushin/fig/l6-*.svg
from common import *


def adder(f, x, y, r=9, stroke=INK):
    circle(f, x, y, r, stroke=stroke)
    f.line((x - r + 3, y), (x + r - 3, y), color=stroke)
    f.line((x, y - r + 3), (x, y + r - 3), color=stroke)


def dbox(f, x, y, w=46, h=34, label='D'):
    box(f, x, y - h / 2, w, h, label, size=16)


# ===== 図6.1：畳込み符号の概要 =====
def overview():
    f = Fig(440, 200)
    f.text(20, 92, '情報ビット', 'start', 14)
    s = '01110010'
    x0, y0, c = 110, 70, 30
    bits(f, x0, y0, s, cell=c, hl={0, 1, 2, 3}, hlfill='#ebeafe')
    # 拘束長の矢印
    f.line((x0, 40), (x0, 62), color=ACC)
    f.line((x0 + 4 * c, 40), (x0 + 4 * c, 62), color=ACC)
    f.arrow(x0 + 2 * c, 50, x0 + 4, 50, color=ACC)
    f.arrow(x0 + 2 * c, 50, x0 + 4 * c - 4, 50, color=ACC)
    f.text(x0 + 2 * c, 34, '拘束長（ここでは4）', 'middle', 14, ACC)
    # 4ビット → 符号語1ビット
    for i in range(4):
        f.line((x0 + i * c + c / 2, y0 + c), (x0 + i * c + c / 2, 120), color=SUB, w=1.5)
    f.line((x0 + c / 2, 120), (x0 + 3.5 * c, 120), color=SUB, w=1.5)
    f.arrow(x0 + 3.5 * c, 120, x0 + 3.5 * c, 146, color=SUB, w=1.5)
    f.text(20, 168, '符号語', 'start', 14)
    bits(f, x0 + 3 * c, 148, '101', cell=c)
    f.text(x0 + 6 * c + 6, 168, '…', 'start', 15)
    f.text(x0 + 8 * c + 6, 92, '…', 'start', 15)
    f.text(300, 135, '現在＋過去3ビットを', 'start', 13, SUB)
    f.text(300, 152, '使って1ビット作る', 'start', 13, SUB)
    f.save('l6-overview')


# ===== 図6.2：D フリップフロップの動き =====
def dff():
    f = Fig(440, 190)
    for k, (xo, t, inp, held) in enumerate([(20, 't = 0', 'u_{0}', '（まだ空）'), (240, 't = 1', 'u_{1}', 'u_{0}')]):
        f.text(xo + 90, 30, t, 'middle', 15, ACC)
        f.text(xo, 96, inp, 'start', 15)
        f.arrow(xo + 28, 91, xo + 70, 91)
        dbox(f, xo + 70, 91)
        f.arrow(xo + 116, 91, xo + 150, 91)
        f.text(xo + 156, 96, held if k else '', 'start', 15)
        f.text(xo + 93, 135, '中身：' + ('u_{0}' if k else '0'), 'middle', 14, SUB)
    f.text(220, 175, 'クロックが来るたびに、入力を1つ取りこんで1つ進む', 'middle', 13, SUB)
    f.save('l6-dff')


# ===== 図6.3：D を3個つないで拘束長4 =====
def sr3():
    f = Fig(440, 170)
    y = 70
    f.text(20, y + 5, 'u_{3}', 'start', 15)
    f.line((48, y), (72, y))
    xs = [72]
    x = 92
    for i in range(3):
        f.arrow(xs[-1], y, x, y)
        dbox(f, x, y)
        x2 = x + 46
        jx = x2 + 22
        f.line((x2, y), (jx, y))
        xs.append(jx)
        x = jx + 20
    labels = ['u_{3}', 'u_{2}', 'u_{1}', 'u_{0}']
    for jx, lb in zip(xs, labels):
        f.dot(jx, y)
        f.arrow(jx, y, jx, y + 40)
        f.text(jx, y + 62, lb, 'middle', 15, ACC)
    f.text(220, 24, '時刻 t = 3 のようす', 'middle', 14, SUB)
    f.text(220, 160, '4つ（現在＋過去3つ）を同時に取り出せる → 拘束長4', 'middle', 13, SUB)
    f.save('l6-sr3')


# ===== 図6.4：授業の符号器（拘束長3） =====
def encoder(name, vals=None, outs=None, title=None):
    f = Fig(440, 220)
    yo = 10 if title else 0
    ym, yt, yb = 110 + yo, 48 + yo, 172 + yo
    j0, j1, j2 = 70, 182, 294
    if title:
        f.text(220, 22, title, 'middle', 14, ACC)
    f.text(14, ym + 5, 'u', 'start', 16)
    circle(f, 36, ym, 4)
    f.line((40, ym), (j0, ym))
    f.arrow(j0, ym, 104, ym)
    dbox(f, 104, ym)
    f.line((150, ym), (j1, ym))
    f.arrow(j1, ym, 216, ym)
    dbox(f, 216, ym)
    f.line((262, ym), (j2, ym))
    for j in (j0, j1, j2):
        f.dot(j, ym)
    # 上：x0 = u(t) + u(t-2)
    f.line((j0, ym), (j0, yt))
    f.arrow(j0, yt, j2 - 10, yt)
    f.arrow(j2, ym, j2, yt + 10)
    adder(f, j2, yt)
    f.arrow(j2 + 10, yt, 360, yt)
    # 下：x1 = u(t) + u(t-1) + u(t-2)
    f.line((j0, ym), (j0, yb))
    f.arrow(j0, yb, j1 - 10, yb)
    f.arrow(j1, ym, j1, yb - 10)
    adder(f, j1, yb)
    f.arrow(j1 + 10, yb, j2 - 10, yb)
    f.arrow(j2, ym, j2, yb - 10)
    adder(f, j2, yb)
    f.arrow(j2 + 10, yb, 360, yb)
    f.text(366, yt + 5, 'x_{0}', 'start', 16)
    f.text(366, yb + 5, 'x_{1}', 'start', 16)
    if vals is None:
        f.text(j0 + 6, ym - 12, 'u(t)', 'start', 13, ACC)
        f.text(j1 + 6, ym - 12, 'u(t−1)', 'start', 13, ACC)
        f.text(j2 + 6, ym - 12, 'u(t−2)', 'start', 13, ACC)
    else:
        for j, v in zip((j0, j1, j2), vals):
            f.text(j + 8, ym - 10, v, 'start', 16, RED)
        f.text(404, yt + 5, '＝' + outs[0], 'start', 16, RED)
        f.text(404, yb + 5, '＝' + outs[1], 'start', 16, RED)
    f.save(name)


# ===== 手順：初期化 → 情報 → 終端 =====
def flow():
    f = Fig(440, 170)
    c = 52
    x0 = 46
    inp = ['', '1', '1', '0', '0', '0']
    col = ['#eef0f6', '#ebeafe', '#ebeafe', '#ebeafe', '#e6f6f1', '#e6f6f1']
    for t in range(6):
        x = x0 + t * c
        f.text(x + c / 2, 30, f't={t}', 'middle', 14, SUB)
        rect(f, x, 40, c, 40, fill=col[t], rx=3, sw=1.5)
        f.text(x + c / 2, 67, inp[t] if t else '—', 'middle', 16)
    f.text(x0 - 6, 66, 'u', 'end', 16)
    for (a, b, lb, cl) in [(0, 1, '初期化', SUB), (1, 4, '情報ビット', ACC), (4, 6, '終端', GRN)]:
        xa, xb = x0 + a * c + 4, x0 + b * c - 4
        f.line((xa, 96), (xb, 96), color=cl, w=3)
        f.text((xa + xb) / 2, 118, lb, 'middle', 14, cl)
    f.text(x0 + c / 2, 140, '全部0に', 'middle', 12, SUB)
    f.text(x0 + 5 * c, 140, '0を2回', 'middle', 12, GRN)
    f.text(x0 + 2.5 * c, 140, '例：110', 'middle', 12, ACC)
    f.text(220, 162, 'D が2個なので、終端は 0 を2回入れて全部0にもどす', 'middle', 12, SUB)
    f.save('l6-flow')


# ===== 交互に並べる =====
def interleave(name, x0s, x1s, title):
    f = Fig(440, 215)
    c = 30
    f.text(220, 20, title, 'middle', 14, ACC)
    xa = 90
    f.text(xa - 10, 74, 'x_{0}', 'end', 16)
    f.text(xa - 10, 114, 'x_{1}', 'end', 16)
    for i in range(5):
        f.text(xa + i * 2 * c + c, 44, f't={i + 1}', 'middle', 12, SUB)
    for i, (a, b) in enumerate(zip(x0s, x1s)):
        bits(f, xa + i * 2 * c + c / 2, 54, a, cell=c, hl={0}, hlfill='#ebeafe')
        bits(f, xa + i * 2 * c + c / 2, 94, b, cell=c, hl={0}, hlfill='#e6f6f1')
    cw = ''.join(a + b for a, b in zip(x0s, x1s))
    f.arrow(220, 132, 220, 152)
    xs = 220 - 5 * c
    for i, ch in enumerate(cw):
        rect(f, xs + i * c, 158, c, c, fill='#ebeafe' if i % 2 == 0 else '#e6f6f1', rx=3, sw=1.5)
        f.text(xs + i * c + c / 2, 158 + c / 2 + 5, ch, 'middle', 15)
    f.text(xs - 10, 178, '符号語', 'end', 13)
    f.save(name)


# ===== ハミング距離（ちがう所を数える） =====
def hamming(name, a, b, la, lb, title):
    f = Fig(440, 170)
    c = 30
    xs = 220 - len(a) * c / 2 + 30
    f.text(220, 22, title, 'middle', 14, ACC)
    diff = {i for i in range(len(a)) if a[i] != b[i]}
    f.text(xs - 10, 62, la, 'end', 14)
    f.text(xs - 10, 102, lb, 'end', 14)
    bits(f, xs, 42, a, cell=c, hl=diff, hlfill='#fde8e8')
    bits(f, xs, 82, b, cell=c, hl=diff, hlfill='#fde8e8')
    for i in diff:
        f.text(xs + i * c + c / 2, 134, '×', 'middle', 15, RED)
    f.text(220, 160, f'ちがう所は {len(diff)} か所 → ハミング距離 {len(diff)}', 'middle', 14, RED)
    f.save(name)


# ===== 候補の数が増える =====
def grow():
    f = Fig(440, 210)
    rows = [('3', '8'), ('10', '1024'), ('20', '約100万'), ('100', '約10の30乗')]
    f.text(110, 30, '情報ビット長 k', 'middle', 14, SUB)
    f.text(320, 30, '候補の数 2ᵏ', 'middle', 14, SUB)
    for i, (k, n) in enumerate(rows):
        y = 50 + i * 34
        box(f, 60, y, 100, 28, k, size=15)
        f.arrow(170, y + 14, 220, y + 14, color=SUB)
        w = [60, 90, 110, 130][i]
        box(f, 320 - w / 2 - 20, y, w + 40, 28, n, stroke=RED if i == 3 else INK, size=15, color=RED if i == 3 else INK)
    f.text(220, 200, '1ビット長くなるたびに、候補は2倍', 'middle', 13, RED)
    f.save('l6-grow')


# ===== 例題12 の入力 =====
def rei12():
    f = Fig(440, 150)
    c = 40
    xs = 220 - 3 * c
    s = ['0', '1', 'x', 'y', '0', '0']
    for i, ch in enumerate(s):
        fill = '#ebeafe' if i < 2 else ('#fff4d6' if i < 4 else '#e6f6f1')
        rect(f, xs + i * c, 40, c, c, fill=fill, rx=3, sw=1.5)
        f.text(xs + i * c + c / 2, 66, ch, 'middle', 18, RED if ch in 'xy' else INK)
        f.text(xs + i * c + c / 2, 32, f't={i + 1}', 'middle', 12, SUB)
    for (a, b, lb, cl) in [(0, 2, 'わかっている', ACC), (2, 4, '求める', RED), (4, 6, '終端', GRN)]:
        xa, xb = xs + a * c + 4, xs + b * c - 4
        f.line((xa, 94), (xb, 94), color=cl, w=3)
        f.text((xa + xb) / 2, 116, lb, 'middle', 14, cl)
    f.text(220, 142, 'xy の候補は 00・01・10・11 の4通り', 'middle', 13, SUB)
    f.save('l6-rei12')


# ===== 携帯電話の世代と誤り訂正符号 =====
def gen():
    f = Fig(440, 230)
    rows = [('2G', '畳込み符号', '畳込み符号'), ('3G', 'Turbo 符号', '畳込み符号'),
            ('4G', 'Turbo 符号', '畳込み符号'), ('5G', 'LDPC 符号', 'Polar 符号')]
    f.text(170, 28, 'データ', 'middle', 14, SUB)
    f.text(330, 28, '制御', 'middle', 14, SUB)
    for i, (g, d, c) in enumerate(rows):
        y = 40 + i * 44
        box(f, 20, y, 60, 34, g, fill='#eef0f6', size=16)
        hl = i == 3
        box(f, 100, y, 140, 34, d, stroke=RED if hl else INK, size=14, color=RED if hl else INK)
        box(f, 260, y, 140, 34, c, size=14)
    f.text(220, 222, '世代ごとに、そのときの最新の符号が使われてきた', 'middle', 13, SUB)
    f.save('l6-gen')


overview()
dff()
sr3()
encoder('l6-encoder')
encoder('l6-enc-t1', vals=['1', '0', '0'], outs=['1', '1'], title='例 110：t=1（入力1、中身は0,0）')
encoder('l6-enc-t3', vals=['0', '1', '1'], outs=['1', '0'], title='例 110：t=3（入力0、中身は1,1）')
flow()
interleave('l6-inter110', '11110', '10010', '例 110：x₀＝11110、x₁＝10010')
interleave('l6-inter101', '10001', '11011', '練習 101：x₀＝10001、x₁＝11011')
hamming('l6-ham', '0011100011', '0011101011', '受信', '011の符号語', '受信信号と候補 011 をくらべる')
grow()
rei12()
gen()
