# 第5回（ブロック符号・ハミング符号）の図。python3 test-study/tools/figs_tsushin/l5.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

PALE = '#ebeafe'
PINK = '#fde8e8'
GPALE = '#e2f5ef'


def longdiv(name, dividend, g, caption, title=None):
    """mod 2 の割り算の筆算。先頭が1なら g、0なら 0000 を引く（XOR）。最後の余りを赤で囲む"""
    cell, rh = 24, 26
    n, m = len(dividend), len(g)
    steps = n - m + 1
    top = 40 if title else 14
    W, H = 470, top + rh * (2 + 2 * steps) + 44
    f = Fig(W, H)
    if title:
        f.text(W / 2, 26, title, 'middle', 15)
    xd = 136  # 割られる数の左端
    cx = lambda c: xd + c * cell + cell / 2
    yq = top + rh - 6          # 商の行（文字の下端）
    yd = top + 2 * rh - 6      # 割られる数の行
    a = list(map(int, dividend)); gg = list(map(int, g))
    # 商
    q = []
    w = a[:m]
    for i in range(steps):
        q.append(w[0])
        if w[0]:
            w = [x ^ y for x, y in zip(w, gg)]
        if i < steps - 1:
            w = w[1:] + [a[i + m]]
    for i, b in enumerate(q):
        f.text(cx(i + m - 1), yq, str(b), 'middle', 15, SUB)
    f.text(xd + n * cell + 10, yq, '← 商（気にしなくてよい）', 'start', 12, SUB)
    # 割る数・かっこ・割られる数
    for j, ch in enumerate(g):
        f.text(xd - 12 - (m - j) * 22 + 11, yd, ch, 'middle', 16, ACC)
    f.path(f'M {xd - 8} {yd - 20} Q {xd + 2} {yd - 6} {xd - 8} {yd + 8}', w=2)
    f.line((xd - 8, yd - 20), (xd + n * cell + 2, yd - 20), w=2)
    for j, ch in enumerate(dividend):
        f.text(cx(j), yd, ch, 'middle', 16)
    # 手順
    w = a[:m]
    y = yd
    for i in range(steps):
        y += rh
        lead = w[0]
        sub = gg if lead else [0] * m
        for j, b in enumerate(sub):
            f.text(cx(i + j), y, str(b), 'middle', 16, ACC if lead else SUB)
        f.line((xd + i * cell + 2, y + 6), (xd + (i + m) * cell - 2, y + 6), w=1.5)
        f.text(xd + n * cell + 10, y, ('先頭1 → ' + g + ' を引く') if lead else '先頭0 → 0000 を引く', 'start', 12, ACC if lead else SUB)
        w = [x ^ yv for x, yv in zip(w, sub)][1:]
        y += rh
        if i < steps - 1:
            w = w + [a[i + m]]
            for j, b in enumerate(w):
                f.text(cx(i + 1 + j), y, str(b), 'middle', 16, GRN if j == m - 1 else INK)
            f.text(xd + n * cell + 10, y, '↑ 緑＝下ろした桁', 'start', 12, GRN)
        else:
            rect(f, xd + (i + 1) * cell - 2, y - 19, (m - 1) * cell + 4, 26, stroke=RED, fill=PINK, rx=5, sw=2)
            for j, b in enumerate(w):
                f.text(cx(i + 1 + j), y, str(b), 'middle', 16, RED)
            f.text(xd + n * cell + 10, y, '← 余り ' + ''.join(map(str, w)), 'start', 13, RED)
    f.text(W / 2, H - 14, caption, 'middle', 14)
    f.save('l5-' + name)


def block():
    f = Fig(460, 230)
    f.text(20, 28, '送信データ', 'start', 14)
    data = '1000110001011010'
    x0 = 20
    for k in range(4):
        bits(f, x0 + k * 106, 40, data[k * 4:k * 4 + 4], cell=24, fill=PALE if k % 2 == 0 else '#fff')
    for k in range(4):
        f.text(x0 + k * 106 + 48, 92, f'ブロック{k + 1}', 'middle', 12, SUB)
    for k in range(2):
        xc = x0 + k * 106 + 48
        f.arrow(xc, 100, xc, 128)
    box(f, 20, 130, 200, 30, 'ブロックごとに別々に符号化', size=13, fill='#fff3d6')
    f.arrow(68, 162, 68, 180); f.arrow(190, 162, 190, 180)
    f.text(310, 152, '…同じことを', 'start', 13, SUB)
    f.text(310, 170, 'くり返す', 'start', 13, SUB)
    from_cw = ['1000101', '1100010']
    bits(f, 6, 184, from_cw[0], cell=17, size=13, hl={4, 5, 6}, hlfill=PINK)
    bits(f, 136, 184, from_cw[1], cell=17, size=13, hl={4, 5, 6}, hlfill=PINK)
    f.text(270, 202, '符号語', 'start', 13)
    f.text(270, 220, '（4ビット → 7ビット）', 'start', 12, SUB)
    f.save('l5-block')


def nk():
    f = Fig(440, 210)
    c = 44; x0 = 66
    bits(f, x0, 70, '1000101', cell=c, hl={0, 1, 2, 3}, hlfill=PALE, size=18)
    for i in range(4, 7):
        rect(f, x0 + i * c, 70, c, c, fill=PINK, rx=3, sw=1.5)
        f.text(x0 + i * c + c / 2, 70 + c / 2 + 6, '1000101'[i], 'middle', 18)
    # 上のかっこ
    f.line((x0 + 2, 60), (x0 + 2, 52), (x0 + 4 * c - 2, 52), (x0 + 4 * c - 2, 60), color=ACC)
    f.text(x0 + 2 * c, 42, '情報ビット k = 4', 'middle', 14, ACC)
    f.line((x0 + 4 * c + 2, 60), (x0 + 4 * c + 2, 52), (x0 + 7 * c - 2, 52), (x0 + 7 * c - 2, 60), color=RED)
    f.text(x0 + 5.5 * c, 42, '冗長ビット n−k = 3', 'middle', 14, RED)
    # 下のかっこ
    f.line((x0 + 2, 124), (x0 + 2, 132), (x0 + 7 * c - 2, 132), (x0 + 7 * c - 2, 124))
    f.text(x0 + 3.5 * c, 154, '符号長 n = 7　→　(7, 4) 符号', 'middle', 15)
    f.text(220, 190, '符号化率 = k / n = 4 / 7', 'middle', 15, GRN)
    f.save('l5-nk')


def hamming_eq():
    f = Fig(440, 230)
    c = 40; x0 = 150; y0 = 30
    for j in range(4):
        f.text(x0 + j * c + c / 2, y0 + 16, f'x_{{{j}}}', 'middle', 15, ACC)
    rows = [('x_{4}', [1, 1, 1, 0]), ('x_{5}', [0, 1, 1, 1]), ('x_{6}', [1, 1, 0, 1])]
    for r, (lab, use) in enumerate(rows):
        y = y0 + 26 + r * c
        f.text(x0 - 14, y + c / 2 + 6, lab + ' =', 'end', 15, RED)
        for j in range(4):
            rect(f, x0 + j * c, y, c, c, fill=PALE if use[j] else '#fff', rx=3, sw=1.5)
            if use[j]:
                f.dot(x0 + j * c + c / 2, y + c / 2, 7, ACC)
        terms = ' + '.join(f'x_{{{j}}}' for j in range(4) if use[j])
        f.text(x0 + 4 * c + 14, y + c / 2 + 6, terms, 'start', 14)
    f.text(220, 200, '● の情報ビットを mod 2 で足す', 'middle', 14)
    f.text(220, 220, '（1+1=0。1の個数が奇数なら1、偶数なら0）', 'middle', 12, SUB)
    f.save('l5-hamming-eq')


def cyclic():
    f = Fig(440, 310)
    cw = ['0001011', '0010110', '0101100', '1011000', '0110001', '1100010', '1000101']
    c = 24; x0 = 120
    for r, w in enumerate(cw):
        y = 14 + r * 38
        bits(f, x0, y, w, cell=c, hl={0}, hlfill=PINK)
        if r < 6:
            f.arrow(x0 + 7 * c + 20, y + 14, x0 + 7 * c + 20, y + 38, color=SUB)
            f.text(x0 + 7 * c + 30, y + 31, '左へ1つずらす', 'start', 12, SUB)
    f.text(20, 32, '赤いマス', 'start', 12, RED)
    f.text(20, 48, '＝次で右端へ', 'start', 12, RED)
    f.text(220, 300, '7つとも符号語！ → 巡回符号', 'middle', 15, ACC)
    f.save('l5-cyclic')


def poly():
    f = Fig(440, 220)
    c = 40
    labs = ['x^3', 'x^2', 'x', '1']
    for r, (g, expr) in enumerate([('1011', 'x³ + x + 1'), ('1101', 'x³ + x² + 1')]):
        y = 20 + r * 100
        x0 = 30
        bits(f, x0, y, g, cell=c, size=18, hl={i for i, ch in enumerate(g) if ch == '1'}, hlfill=PALE)
        for j, L in enumerate(['x³', 'x²', 'x', '1']):
            f.text(x0 + j * c + c / 2, y + c + 20, L, 'middle', 14, ACC if g[j] == '1' else SUB)
        f.arrow(x0 + 4 * c + 14, y + c / 2, x0 + 4 * c + 54, y + c / 2)
        f.text(x0 + 4 * c + 64, y + c / 2 + 7, expr, 'start', 20, RED)
    f.text(220, 212, '左から x³・x²・x・1（1のところだけ書く）', 'middle', 13)
    f.save('l5-poly')


def dist():
    f = Fig(440, 250)
    words = ['0000000', '0000001', '0000011', '0001011']
    xs = [70, 170, 270, 370]; y = 124
    f.add(f'<circle cx="{(xs[0]+xs[1])/2 - 10}" cy="{y}" r="78" fill="{GPALE}" stroke="{GRN}" stroke-width="1.5" stroke-dasharray="5 4"/>')
    f.add(f'<circle cx="{(xs[2]+xs[3])/2 + 10}" cy="{y}" r="78" fill="{PALE}" stroke="{ACC}" stroke-width="1.5" stroke-dasharray="5 4"/>')
    for i in range(3):
        f.line((xs[i] + 8, y), (xs[i + 1] - 8, y), w=1.5)
        f.text((xs[i] + xs[i + 1]) / 2, y - 10, '1ビット', 'middle', 11, SUB)
    for i, (x, w) in enumerate(zip(xs, words)):
        big = i in (0, 3)
        f.dot(x, y, 7 if big else 5, GRN if i == 0 else ACC if i == 3 else (GRN if i == 1 else ACC))
        f.text(x, y + 26, w, 'middle', 13 if big else 12, INK if big else SUB)
    f.text(70, y + 46, '符号語A', 'middle', 13, GRN)
    f.text(370, y + 46, '符号語B', 'middle', 13, ACC)
    f.text(220, 20, '最小符号間距離 = 3', 'middle', 15)
    f.text(220, 238, '1ビットの誤りなら、いちばん近い符号語に戻せる', 'middle', 13)
    f.save('l5-dist')


def crc():
    f = Fig(460, 220)
    f.text(20, 24, '送る側', 'start', 13, SUB)
    box(f, 20, 34, 120, 40, 'データ', fill=PALE)
    box(f, 140, 34, 80, 40, 'CRC', fill=PINK)
    f.text(180, 92, '割った余り', 'middle', 12, RED)
    f.arrow(230, 54, 290, 54)
    f.text(260, 44, '送る', 'middle', 12, SUB)
    f.text(300, 24, '受け取る側', 'start', 13, SUB)
    box(f, 296, 34, 150, 40, '生成多項式で割る', size=13, fill='#fff3d6')
    f.arrow(330, 76, 260, 128); f.arrow(412, 76, 412, 128)
    box(f, 170, 130, 180, 40, '余り 0 → 誤りなし', size=13, stroke=GRN, fill=GPALE, color=GRN)
    box(f, 360, 130, 90, 40, '0 以外', size=13, stroke=RED, fill=PINK, color=RED)
    f.text(405, 190, '→ 誤りあり', 'middle', 13, RED)
    f.text(20, 200, 'CRC＝巡回符号を「誤り検出」に使う', 'start', 13)
    f.save('l5-crc')


if __name__ == '__main__':
    block(); nk(); hamming_eq(); cyclic(); poly(); dist(); crc()
    longdiv('div-1111111', '1111111', '1011', '1111111 ÷ 1011 → 余り 000（割り切れる）', '例題8：1111111 ÷ 1011')
    longdiv('div-1000', '1000000', '1011', '余り 101 → 符号語 1000101', '1000 の符号化：1000000 ÷ 1011')
    longdiv('div-1100', '1100000', '1011', '余り 010 → 符号語 1100010', '例題9：1100000 ÷ 1011')
    longdiv('g2-div-1010', '1010000', '1101', '余り 001 → 符号語 1010001', '1101 で符号化：1010000 ÷ 1101')
    longdiv('div-1110010', '1110010', '1011', 'シンドローム 110 → y₂ が誤り', '復号：1110010 ÷ 1011')
    longdiv('div-1010001', '1010001', '1011', 'シンドローム 010 → y₅ が誤り', '例題10：1010001 ÷ 1011')
    longdiv('g2-syn-y0', '1000000', '1101', 'y₀ のシンドローム = 110', '1101 の表づくり：1000000 ÷ 1101')
    longdiv('g2-div-1110001', '1110001', '1101', 'シンドローム 011 → y₁ が誤り', '1101 で復号：1110001 ÷ 1101')
