# 第3回（フレーム構成と同期）の図。python3 test-study/tools/figs_tsushin/l3.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

HL = '#ebeafe'   # うすい紫（目立たせるマス）
OK = '#dff5ec'   # うすい緑（一致）
NG = '#fde4e4'   # うすい赤（不一致）
RX = '0010100010111010'
SW = '0001'
MAP = {'0': 1, '1': -1}
NOISY = [1.1, 1.2, -0.5, 1.3, -1.2, 0.6, 0.7, 1.2, -0.7, 1.2, -1.2, -0.9, -1.3, 0.8, -1.2, 0.6]


def match(rx, sw):
    return [sum(a == b for a, b in zip(rx[i:i + len(sw)], sw)) for i in range(len(rx) - len(sw) + 1)]


def corr(rx, sw):
    return [round(sum(a * b for a, b in zip(rx[i:i + len(sw)], sw)), 2) for i in range(len(rx) - len(sw) + 1)]


def idx(f, x, y, n, cell=26, size=11):
    """マスの上に 0,1,2… の番号"""
    for i in range(n):
        f.text(x + i * cell + cell / 2, y, str(i), 'middle', size, SUB)


def cells(f, x, y, vals, cell=26, fills=None, size=13, color=INK, h=26):
    for i, v in enumerate(vals):
        rect(f, x + i * cell, y, cell, h, fill=(fills[i] if fills else '#fff'), rx=3, sw=1.5)
        f.text(x + i * cell + cell / 2, y + h / 2 + size * 0.35, v, 'middle', size, color)


def fmt(v):
    s = ('%g' % v)
    return s.replace('-', '−')


# ① TDMA：基地局は A→B→C の順に送るが、端末は自分の番がいつかわからない
def tdma():
    f = Fig(460, 230)
    box(f, 20, 80, 90, 50, '基地局', fill='#f4f4fb')
    x0 = 130
    for i, ch in enumerate('ABCABC'):
        c = HL if ch == 'B' else '#fff'
        rect(f, x0 + i * 34, 88, 34, 34, fill=c, rx=3, sw=1.5)
        f.text(x0 + i * 34 + 17, 111, ch, 'middle', 15)
    f.arrow(x0 + 6 * 34 + 6, 105, 360, 105)
    box(f, 365, 80, 80, 50, '端末B', stroke=ACC)
    f.text(x0 + 102, 76, '時間 →（順に送る）', 'middle', 12, SUB)
    rect(f, 250, 150, 200, 58, stroke=RED, fill='#fff7f7')
    f.text(350, 174, '自分の B は', 'middle', 14, RED)
    f.text(350, 196, 'いつ来るの？', 'middle', 14, RED)
    f.line((405, 132), (380, 150), color=RED, w=1.5)
    f.text(20, 30, '3スロットの TDMA（A→B→C のくり返し）', 'start', 14)
    f.save('l3-tdma')


# ② 時報のたとえ
def jiho():
    f = Fig(440, 170)
    xs = [40, 110, 180]
    for x in xs:
        circle(f, x, 70, 18, stroke=SUB)
        f.text(x, 76, 'ピッ', 'middle', 13, SUB)
    circle(f, 270, 70, 28, stroke=ACC, fill=HL)
    f.text(270, 76, 'ポーン', 'middle', 14, ACC)
    f.arrow(300, 70, 350, 70, color=ACC)
    f.text(395, 76, '正午！', 'middle', 16, RED)
    f.text(220, 130, '決まった合図を聞けば、正確な時刻がわかる', 'middle', 14)
    f.text(220, 155, '＝ 同期語を見つければ、自分の番の時刻がわかる', 'middle', 13, SUB)
    f.save('l3-jiho')


# ③ フレーム構成：同期語の直後・T後・2T後
def frame():
    f = Fig(460, 210)
    y = 80
    box(f, 20, y, 90, 50, '同期語', stroke=RED, fill='#fff1f1', color=RED)
    box(f, 110, y, 110, 50, 'スロット1')
    box(f, 220, y, 110, 50, 'スロット2')
    box(f, 330, y, 110, 50, 'スロット3')
    for x, lab in [(110, '直後'), (220, 'T 後'), (330, '2T 後')]:
        f.line((x, y - 4), (x, y - 26), color=ACC, w=1.5)
        f.text(x, y - 32, lab, 'middle', 13, ACC)
    f.arrow(20, 160, 445, 160, color=SUB)
    f.text(440, 182, '時刻', 'end', 12, SUB)
    f.text(165, 150, '端末A', 'middle', 13, SUB)
    f.text(275, 150, '端末B', 'middle', 13, SUB)
    f.text(385, 150, '端末C', 'middle', 13, SUB)
    f.text(230, 26, '1フレーム（これがくり返される）', 'middle', 14)
    f.save('l3-frame')


# ④ 受信信号の中から 0001 を探す
def find():
    f = Fig(460, 150)
    x, y = 22, 50
    idx(f, x, y - 8, 16)
    bits(f, x, y, RX, hl={5, 6, 7, 8})
    f.text(x + 5 * 26 + 52, y + 56, '↑ ここに 0001 がある', 'middle', 14, ACC)
    f.text(230, 130, '目で探す代わりに、決まった手順（一致数）で探す', 'middle', 13, SUB)
    f.text(x, 22, '受信信号', 'start', 13)
    f.save('l3-find')


# ⑤ シフト0の一致数（○×）
def match0():
    f = Fig(460, 200)
    x = 22
    f.text(x, 22, '受信信号', 'start', 13)
    idx(f, x, 42, 16)
    bits(f, x, 50, RX, hl={0, 1, 2, 3})
    f.text(x, 104, '同期語（シフト0）', 'start', 13)
    bits(f, x, 110, SW)
    for i in range(4):
        ok = RX[i] == SW[i]
        f.text(x + i * 26 + 13, 158, '○' if ok else '×', 'middle', 16, GRN if ok else RED)
    f.text(x + 4 * 26 + 14, 158, '→ 一致数 2', 'start', 15, ACC)
    f.text(x, 188, '一致数は、4ビットの先頭（ここでは 0）の所に書く', 'start', 12, SUB)
    f.save('l3-match0')


# ⑥ シフト 0・5・10
def match3():
    f = Fig(460, 250)
    x = 22
    idx(f, x, 22, 16)
    bits(f, x, 30, RX)
    m = match(RX, SW)
    for r, s in enumerate([0, 5, 10]):
        y = 80 + r * 56
        fills = [OK if RX[s + i] == SW[i] else NG for i in range(4)]
        cells(f, x + s * 26, y, list(SW), fills=fills, size=15)
        lab = f'シフト{s}：一致数 {m[s]}'
        if s == 10:
            f.text(x + s * 26 - 8, y + 18, lab, 'end', 13, ACC)
        else:
            f.text(x + s * 26 + 4 * 26 + 8, y + 18, lab, 'start', 13, RED if m[s] == 4 else ACC)
    f.text(x, 244, '緑＝同じ　赤＝ちがう', 'start', 12, SUB)
    f.save('l3-match3')


def bars(name, vals, best, title, ymax, ymin=0, fmtf=str):
    H = 250 if ymin == 0 else 280
    f = Fig(460, H)
    x0, y0, W = 52, 190 if ymin == 0 else 130, 31
    sc = (150 if ymin == 0 else 90) / ymax
    f.line((x0 - 6, y0), (x0 + len(vals) * W + 4, y0), color=SUB, w=1.5)
    for i, v in enumerate(vals):
        h = v * sc
        c = RED if i in best else ACC
        top = y0 - h if h > 0 else y0
        if abs(h) > 0.5:
            f.add(f'<rect x="{x0 + i * W + 5}" y="{top:.1f}" width="{W - 10}" height="{abs(h):.1f}" fill="{c}" opacity="{1 if i in best else 0.55}"/>')
        ty = (y0 - h - 6) if v >= 0 else (y0 - h + 16)
        f.text(x0 + i * W + W / 2, ty, fmtf(v), 'middle', 12, c)
        f.text(x0 + i * W + W / 2, H - 12, str(i), 'middle', 12, SUB)
    f.text(x0 - 6, H - 12, 'シフト', 'end', 11, SUB)
    f.text(230, 20, title, 'middle', 14)
    f.save(name)


# ⑦ 例題3の一致数の棒
def ex3bars():
    m = match(RX, SW)
    bars('l3-ex3-bars', m, {5}, '例題3：一致数（最大はシフト5の 4）', 4)


# ⑧ 練習①（同期語 1000、受信 101101000）
def q1():
    f = Fig(460, 230)
    rx, sw = '101101000', '1000'
    x = 30
    f.text(x, 22, '受信信号', 'start', 13)
    idx(f, x, 42, 9, cell=30)
    bits(f, x, 50, rx, cell=30)
    f.text(x, 108, '同期語', 'start', 13)
    bits(f, x, 114, sw, cell=30, fill=HL)
    f.arrow(x + 4 * 30 + 10, 127, x + 4 * 30 + 50, 127, color=ACC)
    f.text(x + 4 * 30 + 58, 132, '1つずつ右へずらす', 'start', 13, ACC)
    m = match(rx, sw)
    cells(f, x, 168, ['シフト'] + [str(i) for i in range(6)], cell=56, size=13, h=28)
    cells(f, x, 196, ['一致数'] + ['?'] * 6, cell=56, size=13, color=SUB, h=28)
    f.save('l3-q1')


# ⑨ BPSK：0001 → (1,1,1,−1)
def bpsk():
    f = Fig(440, 220)
    x0, y0, W = 70, 110, 80
    f.line((x0 - 10, y0), (x0 + 4 * W + 20, y0), color=SUB, w=1.5)
    f.text(x0 - 16, y0 - 46, '+1', 'end', 13, SUB)
    f.text(x0 - 16, y0 + 54, '−1', 'end', 13, SUB)
    pts = []
    for i, b in enumerate(SW):
        lv = y0 - 50 * MAP[b]
        pts += [(x0 + i * W, lv), (x0 + (i + 1) * W, lv)]
        f.text(x0 + i * W + W / 2, 30, f'"{b}"', 'middle', 15)
        f.text(x0 + i * W + W / 2, 200, fmt(MAP[b]), 'middle', 15, ACC)
    f.line(*pts, color=ACC, w=3)
    f.text(x0 - 16, 30, 'ビット', 'end', 12, SUB)
    f.text(x0 - 16, 200, '値', 'end', 12, SUB)
    f.save('l3-bpsk')


# ⑩ シフト0の相関（積の和）
def corr0():
    f = Fig(460, 290)
    r = [MAP[c] for c in RX]
    x = 22
    f.text(x, 20, '受信信号（±1）', 'start', 13)
    cells(f, x, 30, [fmt(v) for v in r], fills=[HL if i < 4 else '#fff' for i in range(16)], size=12)
    s = [MAP[c] for c in SW]
    W = 70
    xx = 90
    rows = [('受信', r[:4]), ('同期語', s), ('積', [a * b for a, b in zip(r[:4], s)])]
    for k, (lab, vals) in enumerate(rows):
        y = 84 + k * 44
        f.text(xx - 10, y + 22, lab, 'end', 13)
        fills = None
        if lab == '積':
            fills = [OK if v > 0 else NG for v in vals]
        cells(f, xx, y, [fmt(v) for v in vals], cell=W, fills=fills, size=15, h=32)
    f.text(xx + 4 * W + 12, 84 + 2 * 44 + 22, '足す', 'start', 13, SUB)
    f.text(230, 248, '1 + 1 + (−1) + (−1) = 0　→ 相関値 0', 'middle', 15, ACC)
    f.text(230, 276, '同じなら ＋1、ちがえば −1', 'middle', 12, SUB)
    f.save('l3-corr0')


# ⑪ 外乱があると受信値がずれる
def noisy():
    f = Fig(460, 230)
    ideal = [MAP[c] for c in RX]
    x0, y0, W, sc = 40, 110, 26, 55
    f.line((x0 - 6, y0), (x0 + 16 * W + 4, y0), color=SUB, w=1.5)
    f.text(x0 - 8, y0 - sc + 4, '+1', 'end', 11, SUB)
    f.text(x0 - 8, y0 + sc + 4, '−1', 'end', 11, SUB)
    for lv in (1, -1):
        f.line((x0, y0 - lv * sc), (x0 + 16 * W, y0 - lv * sc), color=SUB, w=1, dash='3 4')
    for i, (a, b) in enumerate(zip(ideal, NOISY)):
        cx = x0 + i * W + W / 2
        f.line((cx, y0), (cx, y0 - b * sc), color=ACC, w=6)
        f.dot(cx, y0 - a * sc, 3.5, RED)
    f.text(x0, 205, '● 本来の値（±1）', 'start', 13, RED)
    f.text(x0 + 170, 205, '▮ 実際に受け取った値', 'start', 13, ACC)
    f.text(230, 20, '外乱があると 1.2 や −0.5 のような値になる', 'middle', 14)
    f.save('l3-noisy')


# ⑫ 例題5の相関値の棒（1 と 5 が同じ 3.2）
def ex5bars():
    c = corr(NOISY, [1, 1, 1, -1])
    bars('l3-ex5-bars', c, {1, 5}, '例題5：相関値（シフト1と5がどちらも 3.2）', 4.4, ymin=-1, fmtf=fmt)


# ⑬ 同期語を長くする
def longer():
    f = Fig(460, 210)
    f.text(20, 34, '短い同期語', 'start', 14)
    bits(f, 140, 14, '0001', fill='#fff1f1')
    f.text(260, 34, '→ データとまちがえやすい', 'start', 13, RED)
    f.text(20, 104, '長い同期語', 'start', 14)
    bits(f, 140, 84, '00010011', cell=26, fill='#e9f7f1')
    f.text(360, 104, '→ 強い', 'start', 13, GRN)
    f.text(20, 160, '・足し合わせるビットが増え、外乱の影響が小さくなる', 'start', 13)
    f.text(20, 188, '・データの中にたまたま同じ並びが出ることが減る', 'start', 13)
    f.save('l3-long')


# ⑭ 複数の同期語（前後のフレーム）
def multi():
    f = Fig(460, 190)
    y = 70
    for k in range(2):
        x = 20 + k * 215
        box(f, x, y, 55, 44, '同期', stroke=RED, fill='#fff1f1', color=RED, size=13)
        for j in range(3):
            box(f, x + 55 + j * 50, y, 50, 44, f'S{j + 1}', size=13)
    f.text(230, 30, 'フレームはくり返す → 同期語も同じ間隔で何度も来る', 'middle', 13)
    f.path(f'M 47 {y + 50} Q 155 {y + 100} 262 {y + 50}', color=ACC, w=2)
    f.text(155, y + 100, '両方そろって見つかれば、より確か', 'middle', 13, ACC)
    f.save('l3-multi')


if __name__ == '__main__':
    for fn in [tdma, jiho, frame, find, match0, match3, ex3bars, q1, bpsk, corr0, noisy, ex5bars, longer, multi]:
        fn()
    print('ok')
