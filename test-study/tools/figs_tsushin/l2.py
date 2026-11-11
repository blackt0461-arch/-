# 通信理論 第2回（複信方式／多元接続と交換機）の図
#   python3 test-study/tools/figs_tsushin/l2.py  → data/tsushin/fig/l2-*.svg
import math
from common import *

LIGHT = '#ebeafe'
PINK = '#fde8e8'
MINT = '#e3f6ef'
YEL = '#fff4d6'


def phone(f, x, y, label, color=INK):
    """端末（小さな四角＋名前）"""
    rect(f, x - 16, y - 22, 32, 44, stroke=color, rx=6)
    rect(f, x - 11, y - 16, 22, 26, stroke=color, fill=LIGHT, rx=2, sw=1)
    f.text(x, y + 40, label, 'middle', 13, color)


def tower(f, x, y, label='基地局'):
    """基地局（鉄塔）"""
    f.line((x - 18, y + 40), (x, y - 20), (x + 18, y + 40), w=2.5)
    f.line((x - 12, y + 20), (x + 12, y + 20), w=1.5)
    f.line((x - 6, y), (x + 6, y), w=1.5)
    f.dot(x, y - 22, 5, ACC)
    for r in (12, 20):
        f.path(f'M {x - r * .7} {y - 22 - r * .7} A {r} {r} 0 0 0 {x - r * .7} {y - 22 + r * .7}', color=ACC, w=1.5)
        f.path(f'M {x + r * .7} {y - 22 - r * .7} A {r} {r} 0 0 1 {x + r * .7} {y - 22 + r * .7}', color=ACC, w=1.5)
    f.text(x, y + 60, label, 'middle', 14)


# ---- 1. 交換機：多対多をつなぎかえる ----
def switch():
    f = Fig(440, 250)
    box(f, 170, 85, 100, 70, '交換機', stroke=ACC, fill=LIGHT, size=16)
    L = [('Aさん', 50), ('Bさん', 125), ('Cさん', 200)]
    R = [('Dさん', 50), ('Eさん', 125), ('Fさん', 200)]
    for n, y in L:
        phone(f, 40, y - 10, '')
        f.text(75, y - 4, n, 'start', 13)
        f.line((58, y + 4), (170, 120), color=SUB, w=1.5)
    for n, y in R:
        phone(f, 400, y - 10, '')
        f.text(365, y - 4, n, 'end', 13)
        f.line((270, 120), (382, y + 4), color=SUB, w=1.5)
    # A と F をつないでいる
    f.line((58, 54), (170, 112), color=RED, w=3.5)
    f.line((270, 128), (382, 204), color=RED, w=3.5)
    f.line((205, 112), (235, 128), color=RED, w=3.5, dash='5 4')
    f.text(220, 185, 'A→F を今つないでいる', 'middle', 13, RED)
    f.text(220, 240, '発信者の求めに応じて、相手との接続を切り替える', 'middle', 13, SUB)
    f.save('l2-switch')


# ---- 2. 回線交換：回線を占有 ----
def circuit():
    f = Fig(440, 220)
    phone(f, 40, 70, 'A')
    phone(f, 400, 70, 'B')
    box(f, 120, 45, 70, 50, '交換機', size=13)
    box(f, 250, 45, 70, 50, '交換機', size=13)
    f.line((56, 70), (120, 70), color=RED, w=5)
    f.line((190, 70), (250, 70), color=RED, w=5)
    f.line((320, 70), (384, 70), color=RED, w=5)
    f.text(220, 30, 'A と B だけの専用の道（占有）', 'middle', 14, RED)
    # 時間の帯：使っている時と使っていない時
    y = 150
    f.text(20, y + 18, '回線', 'start', 13)
    segs = [(60, 120, True), (120, 230, False), (230, 280, True), (280, 400, False)]
    for a, b, used in segs:
        rect(f, a, y, b - a, 26, stroke=INK, fill=RED if used else '#fff', rx=0, sw=1.5)
    f.text(175, y + 18, '送っていない', 'middle', 12, SUB)
    f.text(340, y + 18, '送っていない', 'middle', 12, SUB)
    f.arrow(60, y + 40, 410, y + 40, w=1.5)
    f.text(410, y + 58, '時間', 'end', 13)
    f.text(60, y + 58, '開始', 'start', 13)
    f.text(330, y + 58, '終了', 'middle', 13)
    f.save('l2-circuit')


# ---- 3. パケット交換：小さく分けて共有 ----
def packet():
    f = Fig(440, 230)
    phone(f, 36, 50, 'A')
    phone(f, 36, 150, 'C')
    phone(f, 404, 50, 'B')
    phone(f, 404, 150, 'D')
    box(f, 90, 75, 60, 50, '交換機', size=12)
    box(f, 290, 75, 60, 50, '交換機', size=12)
    f.line((52, 50), (90, 90), color=SUB, w=1.5)
    f.line((52, 150), (90, 110), color=SUB, w=1.5)
    f.line((350, 90), (388, 50), color=SUB, w=1.5)
    f.line((350, 110), (388, 150), color=SUB, w=1.5)
    f.line((150, 100), (290, 100), w=2)
    pk = [('A1', LIGHT), ('C1', MINT), ('A2', LIGHT), ('C2', MINT)]
    for i, (s, c) in enumerate(pk):
        x = 158 + i * 32
        rect(f, x, 88, 28, 24, fill=c, rx=3, sw=1.5)
        f.text(x + 14, 105, s, 'middle', 12)
    f.text(220, 75, '1本の回線をみんなで共有', 'middle', 13, ACC)
    f.text(220, 200, 'データを小さな「パケット」に分け、', 'middle', 13)
    f.text(220, 220, '宛先などの札をつけて、すき間に詰めて送る', 'middle', 13)
    f.save('l2-packet')


# ---- 4. 搬送波 y(t)=A_c cos(2πf_c t+φ0) ----
def carrier():
    f = Fig(440, 220)
    x0, y0 = 40, 110
    f.arrow(x0, y0, 420, y0, w=1.5)
    f.arrow(x0, 200, x0, 20, w=1.5)
    f.text(420, y0 + 22, '時間 t', 'end', 13)
    f.text(x0 + 8, 26, 'y(t)', 'start', 13)
    A, T = 60, 90
    pts = [(x0 + i, y0 - A * math.cos(2 * math.pi * i / T)) for i in range(0, 361, 2)]
    f.line(*pts, color=ACC, w=2.5)
    # 振幅
    f.line((x0 + 90, y0), (x0 + 90, y0 - A), color=RED, w=2)
    f.text(x0 + 98, y0 - A - 12, 'A_{c}（振幅）', 'start', 13, RED)
    # 周期
    yy = 190
    f.line((x0 + 180, yy), (x0 + 270, yy), color=GRN, w=2)
    f.line((x0 + 180, yy - 6), (x0 + 180, yy + 6), color=GRN, w=2)
    f.line((x0 + 270, yy - 6), (x0 + 270, yy + 6), color=GRN, w=2)
    f.line((x0 + 180, y0 - A), (x0 + 180, yy), color=GRN, w=1, dash='3 3')
    f.line((x0 + 270, y0 - A), (x0 + 270, yy), color=GRN, w=1, dash='3 3')
    f.text(x0 + 170, yy + 5, '1回くり返す時間＝1/f_{c}', 'end', 12, GRN)
    f.save('l2-carrier')


# ---- 5. 3種類の変調 ----
def mod3():
    f = Fig(440, 330)
    bitsq = [1, 0, 1, 1]
    W, x0 = 320, 100
    seg = W / 4
    rows = [('もとの情報', 40), ('振幅変調', 110), ('周波数変調', 190), ('位相変調', 270)]
    for name, y in rows:
        f.text(10, y + 5, name, 'start', 13, INK if name == 'もとの情報' else ACC)
        f.line((x0, y), (x0 + W, y), color='#d0d3e4', w=1)
    # もとの情報
    y = 40
    pts = []
    for i, b in enumerate(bitsq):
        yy = y - 16 if b else y + 16
        pts += [(x0 + i * seg, yy), (x0 + (i + 1) * seg, yy)]
        f.text(x0 + i * seg + seg / 2, y - 22 if b else y + 32, str(b), 'middle', 12, SUB)
    f.line(*pts, color=INK, w=2)
    for i in range(1, 4):
        for _, yy in rows[1:]:
            f.line((x0 + i * seg, yy - 30), (x0 + i * seg, yy + 30), color='#d0d3e4', w=1, dash='3 3')

    def wave(y, fn):
        pts = []
        for k in range(0, W + 1):
            pts.append((x0 + k, y - fn(k)))
        f.line(*pts, color=ACC, w=1.8)

    cyc = 20.0
    wave(110, lambda k: (26 if bitsq[min(int(k // seg), 3)] else 9) * math.sin(2 * math.pi * k / cyc))
    # 周波数変調：位相を連続につなぐ
    ph = [0.0]
    vals = []
    p = 0.0
    for k in range(0, W + 1):
        b = bitsq[min(int(k // seg), 3)]
        vals.append(24 * math.sin(p))
        p += 2 * math.pi / (12 if b else 30)
    wave(190, lambda k: vals[k])
    wave(270, lambda k: 24 * math.sin(2 * math.pi * k / cyc + (0 if bitsq[min(int(k // seg), 3)] else math.pi)))
    f.text(x0 + W / 2, 148, '大きさが変わる', 'middle', 12, SUB)
    f.text(x0 + W / 2, 228, '波の細かさが変わる', 'middle', 12, SUB)
    f.text(x0 + W / 2, 312, '波の出だし（山と谷）が入れかわる', 'middle', 12, SUB)
    f.save('l2-mod3')


# ---- 6. 占有帯域幅と搬送波を離す ----
def band():
    f = Fig(440, 220)
    x0, y0 = 30, 160
    f.arrow(x0, y0, 420, y0, w=1.5)
    f.text(420, y0 + 22, '周波数', 'end', 13)

    def hump(c, w, h, color, fill):
        d = f'M {c - w} {y0} C {c - w * .5} {y0}, {c - w * .5} {y0 - h}, {c} {y0 - h} C {c + w * .5} {y0 - h}, {c + w * .5} {y0}, {c + w} {y0} Z'
        f.path(d, color=color, w=2, fill=fill)
        f.line((c, y0), (c, y0 - h - 12), color=color, w=1.5, dash='4 3')

    hump(120, 45, 90, ACC, LIGHT)
    hump(300, 70, 70, GRN, MINT)
    f.text(120, 52, 'f_{c1}', 'middle', 14, ACC)
    f.text(300, 72, 'f_{c2}', 'middle', 14, GRN)
    # 帯域幅
    for c, w, col, lab in [(120, 45, ACC, 'ゆっくり送る'), (300, 70, GRN, '速く送る＝広い')]:
        f.line((c - w, y0 + 12), (c + w, y0 + 12), color=col, w=2)
        f.line((c - w, y0 + 6), (c - w, y0 + 18), color=col, w=2)
        f.line((c + w, y0 + 6), (c + w, y0 + 18), color=col, w=2)
        f.text(c, y0 + 36, lab, 'middle', 12, col)
    f.text(210, y0 + 58, '↔ の幅＝占有帯域幅', 'middle', 13)
    f.text(212, 120, '重ならない', 'middle', 12, RED)
    f.text(212, 136, '→干渉しない', 'middle', 12, RED)
    f.save('l2-band')


# ---- 7. 上りリンクと下りリンク ----
def updown():
    f = Fig(420, 200)
    tower(f, 70, 80)
    phone(f, 350, 90, '端末')
    f.arrow(110, 70, 320, 70, color=ACC, w=3)
    f.text(215, 58, '下りリンク（基地局→端末）', 'middle', 14, ACC)
    f.arrow(320, 115, 110, 115, color=GRN, w=3)
    f.text(215, 140, '上りリンク（端末→基地局）', 'middle', 14, GRN)
    f.text(210, 190, '行きと帰り、2つの向きが必要', 'middle', 13, SUB)
    f.save('l2-updown')


# ---- 8. FDD と TDD ----
def fdd_tdd():
    f = Fig(460, 230)
    for ox, title in [(40, '(a) FDD'), (260, '(b) TDD')]:
        f.arrow(ox, 180, ox + 180, 180, w=1.5)
        f.arrow(ox, 180, ox, 30, w=1.5)
        f.text(ox + 180, 200, '時間', 'end', 12)
        f.text(ox - 4, 26, '周波数', 'start', 12)
        f.text(ox + 90, 222, title, 'middle', 14)
    # FDD：上下2本の帯
    rect(f, 50, 50, 160, 40, stroke=ACC, fill=LIGHT, rx=2)
    f.text(130, 75, '下りリンク', 'middle', 13, ACC)
    rect(f, 50, 120, 160, 40, stroke=GRN, fill=MINT, rx=2)
    f.text(130, 145, '上りリンク', 'middle', 13, GRN)
    # TDD：同じ周波数で交互
    for i in range(4):
        dn = i % 2 == 0
        rect(f, 268 + i * 40, 85, 38, 40, stroke=ACC if dn else GRN, fill=LIGHT if dn else MINT, rx=2)
        f.text(287 + i * 40, 110, '下' if dn else '上', 'middle', 14, ACC if dn else GRN)
    f.text(350, 70, '同じ周波数を交代で使う', 'middle', 12, SUB)
    f.save('l2-fdd-tdd')


# ---- 9. FDMA ----
def fdma():
    f = Fig(420, 230)
    ox = 60
    f.arrow(ox, 190, 390, 190, w=1.5)
    f.arrow(ox, 190, ox, 20, w=1.5)
    f.text(390, 212, '時間', 'end', 13)
    f.text(ox - 6, 26, '周波数', 'end', 13)
    cols = [(ACC, LIGHT, '端末1', 'f_{1}'), (GRN, MINT, '端末2', 'f_{2}'), (RED, PINK, '端末3', 'f_{3}')]
    for i, (c, fl, n, fn) in enumerate(cols):
        y = 140 - i * 50
        rect(f, ox + 10, y, 260, 34, stroke=c, fill=fl, rx=2)
        f.text(ox + 140, y + 23, n + '（ずっと使える）', 'middle', 13, c)
        f.text(ox - 8, y + 22, fn, 'end', 13, c)
    # ガードバンド
    f.arrow(ox + 285, 108, ox + 285, 124, color=SUB, w=1.5)
    f.arrow(ox + 285, 156, ox + 285, 140, color=SUB, w=1.5)
    f.text(ox + 296, 130, 'ガード', 'start', 12, SUB)
    f.text(ox + 296, 146, 'バンド', 'start', 12, SUB)
    f.save('l2-fdma')


# ---- 10. TDMA ----
def tdma():
    f = Fig(440, 220)
    ox = 50
    f.arrow(ox, 170, 420, 170, w=1.5)
    f.arrow(ox, 170, ox, 30, w=1.5)
    f.text(420, 192, '時間', 'end', 13)
    f.text(ox - 6, 32, '周波数', 'start', 13)
    cols = [(ACC, LIGHT, '1'), (GRN, MINT, '2'), (RED, PINK, '3')]
    x = ox + 8
    for k in range(6):
        c, fl, n = cols[k % 3]
        rect(f, x, 90, 48, 44, stroke=c, fill=fl, rx=2)
        f.text(x + 24, 118, '端末' + n, 'middle', 12, c)
        x += 58
    f.text(ox - 6, 118, 'f', 'end', 14)
    # ガードタイム
    f.arrow(ox + 66, 70, ox + 66, 88, color=SUB, w=1.5)
    f.text(ox + 70, 62, 'ガードタイム（時間のすき間）', 'start', 12, SUB)
    # フレーム
    f.line((ox + 8, 150), (ox + 182, 150), color=INK, w=1.5)
    f.line((ox + 8, 144), (ox + 8, 156), w=1.5)
    f.line((ox + 182, 144), (ox + 182, 156), w=1.5)
    f.text(ox + 95, 162, '', 'middle', 12)
    f.text(ox + 270, 152, '決まった順にくり返す', 'middle', 12, SUB)
    f.text(ox + 95, 205, '1フレーム（1周分）', 'middle', 12)
    f.line((ox + 95, 192), (ox + 95, 156), color=INK, w=1, dash='3 3')
    f.save('l2-tdma')


# ---- 11. CDMA ----
def cdma():
    f = Fig(420, 230)
    ox = 60
    f.arrow(ox, 190, 390, 190, w=1.5)
    f.arrow(ox, 190, ox, 20, w=1.5)
    f.text(390, 212, '時間', 'end', 13)
    f.text(ox - 6, 26, '周波数', 'end', 13)
    cols = [(RED, PINK, 'C_{3}'), (GRN, MINT, 'C_{2}'), (ACC, LIGHT, 'C_{1}')]
    for i, (c, fl, n) in enumerate(cols):
        d = i * 22
        f.add(f'<rect x="{ox + 10 + d}" y="{40 + d}" width="250" height="100" fill="{fl}" stroke="{c}" stroke-width="2" rx="2"/>')
    for i, (c, fl, n) in enumerate(cols):
        d = i * 22
        f.text(ox + 252 + d, 57 + d, n, 'end', 14, c)
    f.text(ox + 179, 130, '全員が同じ広い帯域を', 'middle', 13)
    f.text(ox + 179, 150, '同じ時間に使う', 'middle', 13)
    f.text(ox + 160, 186, '', 'middle', 12)
    f.text(210, 222, '拡散コード C_{1}・C_{2}・C_{3} で区別する', 'middle', 13, SUB)
    f.save('l2-cdma')


# ---- 12. 逆拡散のしくみ（かんたんな例） ----
def despread():
    f = Fig(440, 250)
    # 端末1のコード ++-- と端末2のコード +-+- （直交）
    f.text(10, 30, '端末1のコード C_{1}', 'start', 13, ACC)
    f.text(10, 105, '端末2のコード C_{2}', 'start', 13, GRN)
    c1 = '++--'
    c2 = '+-+-'

    def row(x, y, s, col, fill):
        for i, ch in enumerate(s):
            rect(f, x + i * 34, y, 32, 30, stroke=col, fill=fill, rx=3, sw=1.5)
            f.text(x + i * 34 + 16, y + 21, ch.replace('+', '＋1').replace('-', '－1'), 'middle', 12, col)

    row(170, 12, c1, ACC, LIGHT)
    row(170, 87, c2, GRN, MINT)
    f.text(10, 180, '受信機で C_{1} をかけて足すと…', 'start', 13)
    f.text(30, 210, '端末1の信号 → 1+1+1+1 ＝ 4（取り出せる）', 'start', 13, ACC)
    f.text(30, 236, '端末2の信号 → 1−1−1+1 ＝ 0（消える）', 'start', 13, GRN)
    f.save('l2-despread')


# ---- 13. スケジューリング（TDMA との比較） ----
def sched():
    f = Fig(440, 220)
    ox = 110
    labels = [('TDMA', [1, 2, 3, 1, 2, 3]), ('スケジュー', [1, 1, 3, 1, 2, 1])]
    cols = {1: (ACC, LIGHT), 2: (GRN, MINT), 3: (RED, PINK)}
    for r, (name, seq) in enumerate(labels):
        y = 40 + r * 80
        f.text(10, y + 26, name, 'start', 14)
        if r == 1:
            f.text(10, y + 44, 'リング', 'start', 14)
        for k, u in enumerate(seq):
            c, fl = cols[u]
            rect(f, ox + k * 50, y, 46, 40, stroke=c, fill=fl, rx=2)
            f.text(ox + k * 50 + 23, y + 26, 'U' + str(u), 'middle', 13, c)
    f.text(ox + 150, 30, '決まった順にくり返す', 'middle', 12, SUB)
    f.text(ox + 150, 180, 'スロットの直前に、だれに渡すか決める', 'middle', 12, RED)
    f.arrow(ox, 200, ox + 300, 200, w=1.5)
    f.text(ox + 300, 216, '時間', 'end', 12)
    f.save('l2-sched')


# ---- 14. CSMA と衝突 ----
def csma():
    f = Fig(460, 250)
    ox = 80
    names = ['端末1', '端末2', '端末3']
    for i, n in enumerate(names):
        y = 50 + i * 60
        f.text(10, y + 6, n, 'start', 13)
        f.arrow(ox, y + 15, 440, y + 15, color='#c4c7d8', w=1)
    # 端末1が送信中
    rect(f, ox + 10, 42, 150, 22, stroke=ACC, fill=LIGHT, rx=2)
    f.text(ox + 85, 58, '送信中', 'middle', 12, ACC)
    # 端末2,3 は途中でデータ発生→CSで待つ
    for i, x in [(1, ox + 60), (2, ox + 100)]:
        y = 50 + i * 60
        f.text(x, y - 2, 'CS', 'middle', 12, SUB)
        f.line((x, y + 4), (ox + 160, y + 4), color=SUB, w=1.5, dash='4 3')
        f.text((x + ox + 160) / 2, y + 30, '待つ', 'middle', 11, SUB)
        rect(f, ox + 162, y - 6, 110, 22, stroke=RED, fill=PINK, rx=2)
        f.text(ox + 217, y + 10, '送信', 'middle', 12, RED)
    f.line((ox + 162, 30), (ox + 162, 190), color=RED, w=1.5, dash='3 3')
    f.text(ox + 290, 140, '同時に送り出す', 'start', 12, RED)
    f.text(ox + 290, 158, '→ 衝突！', 'start', 13, RED)
    f.text(230, 232, 'CS（搬送波検知）：だれか送っていないか聞いてから送る', 'middle', 12)
    f.save('l2-csma')


# ---- 15. 隠れ端末問題 ----
def hidden():
    f = Fig(440, 250)
    # 電波の届く範囲
    f.add(f'<circle cx="110" cy="112" r="105" fill="{LIGHT}" fill-opacity="0.5" stroke="{ACC}" stroke-dasharray="5 4" stroke-width="1.5"/>')
    f.add(f'<circle cx="330" cy="112" r="105" fill="{MINT}" fill-opacity="0.5" stroke="{GRN}" stroke-dasharray="5 4" stroke-width="1.5"/>')
    phone(f, 70, 107, '端末1', ACC)
    phone(f, 370, 107, '端末2', GRN)
    box(f, 185, 92, 70, 36, 'AP', stroke=INK, fill='#fff', size=14)
    f.text(220, 147, 'アクセスポイント', 'middle', 12)
    f.arrow(90, 110, 183, 110, color=ACC, w=2.5)
    f.arrow(350, 110, 257, 110, color=GRN, w=2.5)
    f.text(220, 82, '衝突！', 'middle', 15, RED)
    f.text(220, 190, '端末1と2はおたがいの電波が届かない', 'middle', 13, RED)
    f.text(220, 210, '→ CS しても相手の送信に気づけない', 'middle', 13, RED)
    f.text(220, 242, '点線の円＝それぞれの電波が届く範囲', 'middle', 12, SUB)
    f.save('l2-hidden')


for fn in [switch, circuit, packet, carrier, mod3, band, updown, fdd_tdd, fdma, tdma, cdma, despread, sched, csma, hidden]:
    fn()
print('ok')
