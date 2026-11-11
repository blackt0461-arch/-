# 第4回（誤り制御）の図。python3 test-study/tools/figs_tsushin/l4.py → data/tsushin/fig/l4-*.svg
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

LIGHT = '#ebeafe'
PINK = '#fde3e4'
MINT = '#dcf5ec'


# ① 再送要求（ARQ）と誤り訂正符号（FEC）のブロック図
def arq_fec():
    f = Fig(460, 330)
    f.text(10, 22, '(a) 再送要求（ARQ）', 'start', 14, ACC)
    box(f, 10, 40, 92, 40, '送信バッファ', size=13)
    f.arrow(102, 60, 176, 60)
    box(f, 176, 40, 90, 40, '通信路', fill='#f3f4f8')
    f.arrow(266, 60, 340, 60)
    box(f, 340, 40, 110, 40, '誤り検出器', size=13)
    f.text(221, 30, '外乱（雑音）', 'middle', 12, RED)
    f.line((395, 80), (395, 120), (56, 120), color=GRN, w=2.5)
    f.arrow(56, 120, 56, 82, color=GRN, w=2.5)
    f.text(225, 140, 'フィードバック通信路（ACK／NACK を返す）', 'middle', 13, GRN)
    f.line((5, 162), (455, 162), color='#d8dae6', w=1)
    f.text(10, 190, '(b) 誤り訂正符号（FEC）', 'start', 14, ACC)
    box(f, 10, 210, 80, 40, '符号器')
    f.arrow(90, 230, 176, 230)
    box(f, 176, 210, 90, 40, '通信路', fill='#f3f4f8')
    f.arrow(266, 230, 352, 230)
    box(f, 352, 210, 90, 40, '復号器')
    f.text(221, 202, '外乱（雑音）', 'middle', 12, RED)
    f.text(225, 285, '戻る道はいらない（片方向だけ）', 'middle', 14, INK)
    f.text(225, 310, '受信側で誤りを直す', 'middle', 13, SUB)
    f.save('l4-arq-fec')


# 時間の図の共通：送信側と受信側の2本の時間軸
def timeline(f, title):
    f.text(230, 22, title, 'middle', 15, ACC)
    f.text(8, 66, '送信', 'start', 13); f.text(8, 176, '受信', 'start', 13)
    f.arrow(44, 60, 450, 60, color=SUB, w=1.5)
    f.arrow(44, 170, 450, 170, color=SUB, w=1.5)
    f.text(450, 86, '時間 →', 'end', 12, SUB)


def pkt(f, x, y, n, fill='#fff', stroke=INK):
    rect(f, x - 13, y - 13, 26, 26, fill=fill, stroke=stroke, rx=4, sw=1.8)
    f.text(x, y + 5, str(n), 'middle', 14)


def cross(f, x, y):
    f.line((x - 7, y - 7), (x + 7, y + 7), color=RED, w=3)
    f.line((x - 7, y + 7), (x + 7, y - 7), color=RED, w=3)


# ② Stop-and-Wait
def saw():
    f = Fig(460, 250)
    timeline(f, 'Stop-and-Wait：1つ送るごとに返事を待つ')
    seq = [(1, 'ACK', False), (2, 'NACK', True), (2, 'ACK', False), (3, None, False)]
    x = 70
    for n, ans, err in seq:
        pkt(f, x, 46, n)
        f.arrow(x, 62, x + 34, 154, color=INK, w=1.5)
        pkt(f, x + 40, 186, n, fill=PINK if err else '#fff')
        if err: cross(f, x + 40, 186)
        if ans:
            c = RED if ans == 'NACK' else GRN
            f.arrow(x + 46, 156, x + 80, 66, color=c, w=1.5)
            f.text(x + 74, 120, ans, 'start', 12, c)
        x += 102
    f.text(230, 232, '待っている間は送れない → 効率が悪い', 'middle', 13)
    f.save('l4-saw')


# ③ Go-Back-N と ④ Selective-Repeat
def cont(name, title, send, recv, note):
    f = Fig(460, 260)
    timeline(f, title)
    dx = 38
    for i, (n, st) in enumerate(send):
        pkt(f, 72 + i * dx, 46, n, fill=LIGHT if st == 're' else '#fff', stroke=ACC if st == 're' else INK)
    for i, (n, st) in enumerate(recv):
        x = 92 + i * dx
        pkt(f, x, 186, n, fill=PINK if st in ('err', 'drop') else '#fff')
        if st == 'err': cross(f, x, 186)
        if st == 'drop': f.line((x - 13, 186), (x + 13, 186), color=RED, w=2)
    # NACK の矢印（受信の 2 から、送り直しの位置へ）
    f.arrow(92 + dx, 168, 72 + 4 * dx + dx - 6, 64, color=RED, w=1.5)
    f.text(92 + dx + 34, 128, 'NACK 2', 'start', 12, RED)
    f.text(230, 226, note[0], 'middle', 13)
    f.text(230, 248, note[1], 'middle', 12, SUB)
    f.save(name)


def gbn():
    send = [(1, ''), (2, ''), (3, ''), (4, ''), (5, ''), (2, 're'), (3, 're'), (4, 're'), (5, 're'), (6, '')]
    recv = [(1, ''), (2, 'err'), (3, 'drop'), (4, 'drop'), (5, 'drop'), (2, ''), (3, ''), (4, ''), (5, '')]
    cont('l4-gbn', 'Go-Back-N：誤った所から後ろを全部送り直す', send, recv,
         ('2 が誤り → 2・3・4・5 をもう一度送る', '（受け取った 3〜5 も捨てる）'))


def sr():
    send = [(1, ''), (2, ''), (3, ''), (4, ''), (5, ''), (2, 're'), (6, ''), (7, ''), (8, ''), (9, '')]
    recv = [(1, ''), (2, 'err'), (3, ''), (4, ''), (5, ''), (2, ''), (6, ''), (7, ''), (8, '')]
    cont('l4-sr', 'Selective-Repeat：誤ったものだけ送り直す', send, recv,
         ('2 が誤り → 2 だけもう一度送る', '（3〜5 は取っておく → 並べ直しが必要）'))


# ⑤ 2元対称通信路
def bsc():
    f = Fig(400, 230)
    f.text(90, 28, '入力', 'middle', 14); f.text(310, 28, '出力', 'middle', 14)
    for y, b in ((70, '0'), (180, '1')):
        circle(f, 90, y, 18); f.text(90, y + 6, b, 'middle', 16)
        circle(f, 310, y, 18); f.text(310, y + 6, b, 'middle', 16)
    f.arrow(110, 70, 290, 70, color=GRN, w=2.5); f.text(200, 60, '1−p（正しく届く）', 'middle', 13, GRN)
    f.arrow(110, 180, 290, 180, color=GRN, w=2.5); f.text(200, 205, '1−p（正しく届く）', 'middle', 13, GRN)
    f.arrow(108, 80, 292, 168, color=RED, w=2)
    f.arrow(108, 170, 292, 82, color=RED, w=2)
    f.text(140, 106, 'p', 'middle', 15, RED); f.text(140, 160, 'p', 'middle', 15, RED)
    f.text(250, 128, '反転（誤り）', 'start', 12, RED)
    f.save('l4-bsc')


# ⑥ 3回くり返し符号 ＋ 多数決（補足資料の例）
def rep3():
    f = Fig(460, 290)
    c = 22
    f.text(10, 34, '情報', 'start', 13)
    for i, b in enumerate('010'):
        bits(f, 100 + i * 3 * c + c, 18, b, cell=c, size=14)
    f.text(10, 92, '符号化', 'start', 13)
    bits(f, 100, 76, '000111000', cell=c, size=14)
    f.text(310, 92, '3回くり返す', 'start', 12, ACC)
    f.text(10, 150, '受信', 'start', 13)
    bits(f, 100, 134, '000101010', cell=c, hl={4, 7}, hlfill=PINK, size=14)
    f.text(310, 150, '2か所が反転', 'start', 12, RED)
    for k in range(3):
        rect(f, 100 + k * 3 * c, 130, 3 * c, c + 8, stroke=ACC, fill='none', rx=4, sw=1.5)
    f.text(10, 208, '多数決', 'start', 13)
    for k, (blk, r) in enumerate((('000', '0'), ('101', '1'), ('010', '0'))):
        f.arrow(100 + k * 3 * c + 1.5 * c, 166, 100 + k * 3 * c + 1.5 * c, 188, color=ACC, w=1.5)
        bits(f, 100 + k * 3 * c + c, 192, r, cell=c, fill=MINT, size=14)
    f.text(310, 208, '多い方を選ぶ', 'start', 12, GRN)
    f.text(230, 255, '元の 010 が正しく戻った', 'middle', 14, GRN)
    f.text(230, 278, '（1つのまとまりの中で誤りが1つまでなら直せる）', 'middle', 12, SUB)
    f.save('l4-rep3')


# ⑦ 000 を送ったときの確率（p=0.1）
def prob():
    f = Fig(440, 250)
    data = [('0ビット', '0.729'), ('1ビット', '0.243'), ('2ビット', '0.027'), ('3ビット', '0.001')]
    base = 190
    for i, (lab, v) in enumerate(data):
        x = 50 + i * 95
        h = float(v) * 200
        col = GRN if i < 2 else RED
        rect(f, x, base - h, 60, max(h, 2), stroke=col, fill=MINT if i < 2 else PINK, rx=3, sw=1.5)
        f.text(x + 30, base - h - 8, v, 'middle', 14, col)
        f.text(x + 30, base + 20, lab + '誤り', 'middle', 12)
    f.line((30, base), (430, base), color=SUB, w=1.5)
    f.text(220, 24, '「000」を送ったとき（p=0.1）', 'middle', 14)
    f.text(220, 238, '多数決なら 緑＝正しく復号 ／ 赤＝誤る', 'middle', 13)
    f.save('l4-prob')


# ⑧ 1ビット誤り訂正の復号 と ⑨ 2ビット誤り検出の復号
def decode_fig(name, title, groups):
    f = Fig(460, 260)
    f.text(230, 22, title, 'middle', 15, ACC)
    x = 12
    ly = 40 + 34 + 28 * max(len(g[0]) for g in groups)
    for words, label, col, fill in groups:
        w = 102 if len(words) > 1 else 92
        h = 34 + 28 * len(words)
        rect(f, x, 40, w, h, stroke=col, fill=fill, sw=1.8)
        for j, wd in enumerate(words):
            f.text(x + w / 2, 66 + 28 * j, wd, 'middle', 15)
        f.text(x + w / 2, ly + 22, label[0], 'middle', 13, col)
        f.text(x + w / 2, ly + 42, label[1], 'middle', 13, col)
        x += w + 12
    f.save(name)


def dec_correct():
    decode_fig('l4-dec-correct', '1ビット誤り訂正：多い方に復号', [
        (['000'], ('→ 0', '（正しい）'), GRN, MINT),
        (['001', '010', '100'], ('→ 0', '0が多い'), GRN, MINT),
        (['011', '101', '110'], ('→ 1', '1が多い'), ACC, LIGHT),
        (['111'], ('→ 1', '（正しい）'), ACC, LIGHT)])


def dec_detect():
    decode_fig('l4-dec-detect', '2ビット誤り検出：符号語以外は「誤り」', [
        (['000'], ('→ 0', '誤りなし'), GRN, MINT),
        (['001', '010', '100'], ('誤りを', '検出'), RED, PINK),
        (['011', '101', '110'], ('誤りを', '検出'), RED, PINK),
        (['111'], ('→ 1', '誤りなし'), ACC, LIGHT)])


# ⑩ ハミング距離（例題6）
def hamming():
    f = Fig(400, 200)
    a, b = '100110', '101011'
    c = 34
    x0 = 110
    for i in range(6):
        f.text(x0 + i * c + c / 2, 30, str(i + 1), 'middle', 12, SUB)
    diff = {i for i in range(6) if a[i] != b[i]}
    f.text(20, 64, 'x', 'start', 16); bits(f, x0, 42, a, cell=c, hl=diff, hlfill=PINK, size=16)
    f.text(20, 112, 'y', 'start', 16); bits(f, x0, 90, b, cell=c, hl=diff, hlfill=PINK, size=16)
    for i in diff:
        f.text(x0 + i * c + c / 2, 148, '≠', 'middle', 16, RED)
    f.text(200, 186, 'ちがう場所は 3・4・6 → ハミング距離 3', 'middle', 14, RED)
    f.save('l4-hamming')


# ⑪ 訂正の条件 ⑫ 検出の条件（符号間距離の図）
def dist_correct():
    f = Fig(460, 220)
    y = 110
    xa, xb = 50, 410
    f.line((xa, y), (xb, y), color=SUB, w=2)
    circle(f, xa, y, 9, fill=ACC, stroke=ACC); circle(f, xb, y, 9, fill=ACC, stroke=ACC)
    f.text(xa, y + 34, 'c_{0}', 'middle', 16); f.text(xb, y + 34, 'c_{1}', 'middle', 16)
    t1, t2 = 175, 285
    for x in (t1, t2):
        f.line((x, y - 12), (x, y + 12), color=INK, w=2)
    rect(f, xa, y - 30, t1 - xa, 14, stroke=GRN, fill=MINT, rx=3, sw=1)
    rect(f, t2, y - 30, xb - t2, 14, stroke=GRN, fill=MINT, rx=3, sw=1)
    f.text((xa + t1) / 2, y - 40, 't', 'middle', 16, GRN)
    f.text((t2 + xb) / 2, y - 40, 't', 'middle', 16, GRN)
    f.text((t1 + t2) / 2, y - 22, '1 以上', 'middle', 14, RED)
    f.text((xa + t1) / 2, y + 58, '→ c_{0} に直す', 'middle', 12, GRN)
    f.text((t2 + xb) / 2, y + 58, 'c_{1} に直す ←', 'middle', 12, GRN)
    f.text(230, 26, '2つの符号語の距離 d', 'middle', 14)
    f.arrow(230, 34, xa + 4, 34, color=SUB, w=1); f.arrow(230, 34, xb - 4, 34, color=SUB, w=1)
    f.text(230, 200, 't + 1 + t ≦ d　つまり　2t + 1 ≦ d', 'middle', 16, ACC)
    f.save('l4-dist-correct')


def dist_detect():
    f = Fig(460, 220)
    y = 110
    xa, xb = 50, 410
    f.line((xa, y), (xb, y), color=SUB, w=2)
    circle(f, xa, y, 9, fill=ACC, stroke=ACC); circle(f, xb, y, 9, fill=ACC, stroke=ACC)
    f.text(xa, y + 34, 'c_{0}', 'middle', 16); f.text(xb, y + 34, 'c_{1}', 'middle', 16)
    s = 330
    rect(f, xa, y - 30, s - xa, 14, stroke=RED, fill=PINK, rx=3, sw=1)
    f.line((s, y - 12), (s, y + 12), color=INK, w=2)
    f.text((xa + s) / 2, y - 40, 's（ここまでの誤りは「誤り」と分かる）', 'middle', 13, RED)
    f.text((s + xb) / 2, y - 22, '1 以上', 'middle', 13, GRN)
    f.text(230, 26, '2つの符号語の距離 d', 'middle', 14)
    f.arrow(230, 34, xa + 4, 34, color=SUB, w=1); f.arrow(230, 34, xb - 4, 34, color=SUB, w=1)
    f.text(230, 160, 'となりの符号語にとどかなければよい', 'middle', 13)
    f.text(230, 192, 's + 1 ≦ d', 'middle', 16, ACC)
    f.save('l4-dist-detect')


# ⑬ 偶パリティ（2ビット情報の符号語）
def parity():
    f = Fig(420, 250)
    c = 30
    f.text(110, 26, 'x_{0} x_{1}', 'middle', 14); f.text(175, 26, 'p', 'middle', 14, RED)
    f.text(300, 26, '1の数', 'middle', 14)
    for i, w in enumerate(['000', '011', '101', '110']):
        y = 40 + i * 46
        bits(f, 80, y, w[:2], cell=c, size=16)
        bits(f, 80 + 2 * c + 10, y, w[2], cell=c, fill=PINK, size=16)
        f.text(300, y + 21, f'{w.count("1")} 個（偶数）', 'middle', 14, GRN)
    f.text(210, 238, 'p = x_{0} + x_{1}（排他的論理和）', 'middle', 15, ACC)
    f.save('l4-parity')


# ⑭ パリティで分かる誤り・分からない誤り
def parity_err():
    f = Fig(440, 210)
    c = 30
    f.text(10, 30, '送信', 'start', 13); bits(f, 90, 10, '011', cell=c, size=16)
    f.text(200, 30, '1の数 2（偶数）', 'start', 13, GRN)
    f.text(10, 92, '1ビット誤り', 'start', 13); bits(f, 90, 72, '111', cell=c, hl={0}, hlfill=PINK, size=16)
    f.text(200, 92, '1の数 3（奇数）→ 検出', 'start', 13, RED)
    f.text(10, 154, '2ビット誤り', 'start', 13); bits(f, 90, 134, '101', cell=c, hl={0, 1}, hlfill=PINK, size=16)
    f.text(200, 154, '1の数 2（偶数）→ 気づけない', 'start', 13, SUB)
    f.text(220, 198, 'どこが誤ったかは分からない → 訂正はできない', 'middle', 13)
    f.save('l4-parity-err')


for fn in (arq_fec, saw, gbn, sr, bsc, rep3, prob, dec_correct, dec_detect, hamming,
           dist_correct, dist_detect, parity, parity_err):
    fn()
