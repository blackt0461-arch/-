# 第1回（序論）の図。python3 test-study/tools/figs_tsushin/l1.py
import math
from common import *

LIGHT = '#ebeafe'
PINK = '#fde8e8'
MINT = '#e3f6ef'
SKY = '#e6f1ff'


# ① シャノンの通信モデル（上段：送る側 → 右で通信路 → 下段：受ける側）
def shannon():
    f = Fig(480, 300)
    f.text(240, 22, '送る側', 'middle', 14, SUB)
    box(f, 10, 36, 100, 44, '情報源', fill=LIGHT)
    box(f, 136, 36, 120, 44, '情報源符号化')
    box(f, 282, 36, 120, 44, '通信路符号化')
    f.arrow(110, 58, 134, 58)
    f.arrow(256, 58, 280, 58)
    # 通信路
    box(f, 360, 120, 110, 50, '通信路', stroke=RED, fill=PINK)
    f.line((402, 80), (402, 100), (415, 100))
    f.arrow(415, 100, 415, 118)
    f.text(300, 140, '外乱（雑音）', 'middle', 14, RED)
    f.arrow(345, 145, 358, 145, color=RED)
    # 下段
    box(f, 282, 210, 120, 44, '通信路復号')
    box(f, 136, 210, 120, 44, '情報源復号')
    box(f, 10, 210, 100, 44, '受信者', fill=LIGHT)
    f.line((415, 172), (415, 190), (402, 190))
    f.arrow(402, 190, 402, 208)
    f.arrow(282, 232, 258, 232)
    f.arrow(136, 232, 112, 232)
    f.text(240, 285, '受ける側（逆の順にもどす）', 'middle', 14, SUB)
    f.save('l1-shannon')


# ② 晴れ・雨を 3回くり返して送る
def repeat():
    f = Fig(460, 270)
    f.text(20, 30, '晴れ', 'start', 15)
    f.arrow(62, 25, 92, 25)
    bits(f, 98, 12, '0')
    f.text(140, 30, '情報源符号化（短く）', 'start', 13, ACC)
    f.arrow(110, 42, 110, 66)
    bits(f, 72, 70, '000')
    f.text(160, 88, '通信路符号化（3回くり返す）', 'start', 13, ACC)
    f.arrow(110, 100, 110, 128, color=RED)
    f.text(124, 120, '雑音で 1か所まちがえた！', 'start', 13, RED)
    bits(f, 72, 132, '010', hl={1}, hlfill=PINK)
    f.text(160, 150, '受け取った信号', 'start', 13, SUB)
    f.arrow(110, 162, 110, 188)
    f.text(124, 180, '0 が2つ、1 が1つ → 多い方は 0', 'start', 13, GRN)
    bits(f, 98, 192, '0')
    f.arrow(126, 205, 156, 205)
    f.text(164, 210, '晴れ（正しく届いた）', 'start', 15, GRN)
    f.text(230, 255, '多い方で決める（多数決）ので、1つの誤りなら直せる', 'middle', 13)
    f.save('l1-repeat')


# ③ 有線と無線
def wired_wireless():
    f = Fig(460, 220)
    # 有線
    rect(f, 10, 10, 210, 200, fill='#fafaff', stroke=SUB, sw=1.5)
    f.text(115, 36, '有線（ケーブル）', 'middle', 15, ACC)
    rect(f, 26, 80, 40, 60, rx=6)
    rect(f, 164, 80, 40, 60, rx=6)
    f.line((66, 110), (164, 110), color=ACC, w=4)
    f.line((66, 120), (164, 120), color=ACC, w=4, dash='2 0')
    f.text(115, 158, 'ケーブルを増やせば回線も増える', 'middle', 12, SUB)
    f.text(115, 178, '品質が安定', 'middle', 13, GRN)
    f.text(115, 198, '工事費が高い・動けない', 'middle', 13, RED)
    # 無線
    rect(f, 240, 10, 210, 200, fill='#fafaff', stroke=SUB, sw=1.5)
    f.text(345, 36, '無線（電波）', 'middle', 15, ACC)
    rect(f, 256, 80, 40, 60, rx=6)
    rect(f, 394, 80, 40, 60, rx=6)
    for r in (14, 26, 38):
        f.path(f'M {300} {110 - r} A {r} {r} 0 0 1 {300} {110 + r}', color=ACC, w=2.5)
        f.path(f'M {390} {110 - r} A {r} {r} 0 0 0 {390} {110 + r}', color=ACC, w=2.5)
    f.text(345, 178, '工事不要・動ける・放送向き', 'middle', 13, GRN)
    f.text(345, 198, '不安定なことも・周波数に限り', 'middle', 13, RED)
    f.save('l1-wired-wireless')


# ④ 波長と周波数
def wave():
    f = Fig(460, 230)
    x0, x1, yc, A = 30, 430, 100, 40
    cyc = 4
    pts = []
    for k in range(201):
        t = k / 200
        pts.append((round(x0 + (x1 - x0) * t, 1), round(yc - A * math.sin(2 * math.pi * cyc * t), 1)))
    f.line((x0, yc), (x1 + 10, yc), color=SUB, w=1)
    f.line(*pts, color=ACC, w=3)
    lam = (x1 - x0) / cyc
    # 波長の矢印（山から山）
    p1 = x0 + lam / 4
    p2 = p1 + lam
    f.line((p1, 52), (p1, 40), color=RED, w=1.5)
    f.line((p2, 52), (p2, 40), color=RED, w=1.5)
    f.arrow(p1 + (p2 - p1) / 2, 44, p2, 44, color=RED)
    f.arrow(p1 + (p2 - p1) / 2, 44, p1, 44, color=RED)
    f.text((p1 + p2) / 2, 32, '波長 λ（1回分の長さ）', 'middle', 13, RED)
    f.text(230, 172, '1秒間に f 回くり返す（周波数 f）', 'middle', 14)
    f.arrow(30, 195, 430, 195, color=GRN)
    f.text(230, 220, '1秒間に進む距離＝光速 c ＝ f × λ', 'middle', 14, GRN)
    f.save('l1-wave')


# ⑤ 1GHz＝30cm を基準に比で考える
def ratio():
    f = Fig(460, 250)
    rows = [('800 MHz', '37.5 cm', 0.8), ('1 GHz', '30 cm', 1), ('2 GHz', '15 cm', 2), ('4 GHz', '7.5 cm', 4), ('30 GHz', '1 cm', 30)]
    f.text(70, 24, '周波数', 'middle', 14, SUB)
    f.text(390, 24, '波長', 'middle', 14, SUB)
    for i, (a, b, k) in enumerate(rows):
        y = 50 + i * 40
        hl = (k == 1)
        box(f, 20, y - 16, 100, 30, a, fill=LIGHT if hl else '#fff', size=14)
        box(f, 340, y - 16, 100, 30, b, fill=LIGHT if hl else '#fff', size=14)
        w = 144 / k  # 波長に比例した長さ
        f.line((140, y), (140 + w, y), color=ACC, w=8)
    f.text(230, 248, '周波数が2倍 → 波長は半分（反比例）', 'middle', 14, RED)
    f.save('l1-ratio')


# ⑥ 単位の倍率
def units():
    f = Fig(470, 150)
    items = [('p', 'ピコ', '-12'), ('n', 'ナノ', '-9'), ('μ', 'マイクロ', '-6'), ('m', 'ミリ', '-3'),
             ('k', 'キロ', '3'), ('M', 'メガ', '6'), ('G', 'ギガ', '9'), ('T', 'テラ', '12')]
    f.arrow(10, 80, 462, 80, color=SUB)
    for i, (s, n, e) in enumerate(items):
        x = 32 + i * 57
        fill = SKY if i < 4 else LIGHT
        box(f, x - 24, 30, 48, 34, s, fill=fill, size=18)
        f.text(x, 104, n, 'middle', 12, SUB)
        f.add(f'<text x="{x}" y="130" text-anchor="middle" font-size="14" fill="{INK}" font-weight="600" font-family="Hiragino Sans, Noto Sans JP, sans-serif">10<tspan baseline-shift="super" font-size="10">{e.replace("-", "−")}</tspan></text>')
    f.text(120, 20, '小さい（1000分の1ずつ）', 'middle', 12, SUB)
    f.text(350, 20, '大きい（1000倍ずつ）', 'middle', 12, SUB)
    f.save('l1-units')


# ⑦ 周波数帯の帯グラフ
def bands():
    f = Fig(480, 250)
    names = ['超長波', '長波', '中波', '短波', '超短波', '極超短波', 'マイクロ波', 'ミリ波', 'サブミリ波']
    freq = ['3k', '30k', '300k', '3M', '30M', '300M', '3G', '30G', '300G', '3T']
    use = ['海底探査', '電波時計', 'ラジオ', '国際放送', '防災無線', '携帯電話', '衛星・無線LAN', '車のレーダー', '天文観測']
    w = 50
    x0 = 15
    for i, n in enumerate(names):
        x = x0 + i * w
        fill = PINK if n in ('極超短波',) else (LIGHT if i % 2 == 0 else '#fff')
        rect(f, x, 60, w, 44, fill=fill, rx=2, sw=1.5)
        two = {'極超短波': ('極超', '短波'), 'マイクロ波': ('マイクロ', '波'), 'サブミリ波': ('サブ', 'ミリ波')}
        if n in two:
            f.text(x + w / 2, 80, two[n][0], 'middle', 11)
            f.text(x + w / 2, 96, two[n][1], 'middle', 11)
        else:
            f.text(x + w / 2, 87, n, 'middle', 12)
        f.add(f'<text transform="translate({x + w / 2 + 4},128) rotate(60)" font-size="12" fill="{SUB}" font-weight="600" font-family="Hiragino Sans, Noto Sans JP, sans-serif">{use[i]}</text>')
    for i, s in enumerate(freq):
        x = x0 + i * w
        f.line((x, 54), (x, 60), color=INK, w=1.5)
        f.text(x, 48, s, 'middle', 11, INK)
    f.text(15, 22, '周波数 [Hz] →　高いほど　波長は短く・まっすぐ進む', 'start', 13, ACC)
    f.text(240, 240, '下のことば＝主な使い道（携帯電話は極超短波）', 'middle', 13, SUB)
    f.save('l1-bands')


def phone(f, x, y, label=None, color=INK):
    rect(f, x - 10, y - 16, 20, 32, rx=4, stroke=color)
    f.line((x - 4, y + 10), (x + 4, y + 10), color=color, w=1.5)
    if label:
        f.text(x, y + 34, label, 'middle', 13, color)


def tower(f, x, y, label=None, color=INK):
    # y は根もと
    f.line((x - 12, y), (x, y - 44), (x + 12, y), color=color, w=2.5)
    f.line((x - 7, y - 18), (x + 7, y - 18), color=color, w=1.5)
    f.dot(x, y - 46, 4, color)
    if label:
        f.text(x, y + 18, label, 'middle', 13, color)


# ⑧ トランシーバと基地局
def transceiver():
    f = Fig(460, 295)
    f.text(10, 22, 'トランシーバ：端末どうしで直接（0.01W まで）', 'start', 13, ACC)
    phone(f, 50, 60)
    phone(f, 150, 60)
    f.arrow(64, 60, 136, 60, color=GRN)
    f.text(100, 100, '近いと届く', 'middle', 12, GRN)
    phone(f, 260, 60)
    phone(f, 430, 60)
    f.line((274, 60), (330, 60), color=RED, w=2, dash='5 4')
    f.text(350, 66, '×', 'middle', 20, RED)
    f.text(345, 100, '遠いと届かない', 'middle', 12, RED)
    f.line((10, 122), (450, 122), color=SUB, w=1, dash='3 4')
    f.text(10, 146, '基地局を通す（基地局は 10W 以上）', 'start', 13, ACC)
    circle(f, 170, 226, 62, stroke=ACC, fill='none', sw=1.5)
    tower(f, 170, 240)
    phone(f, 128, 228, 'A')
    phone(f, 212, 228, 'B')
    f.arrow(138, 216, 162, 200, color=GRN)
    f.arrow(178, 200, 202, 216, color=GRN)
    phone(f, 320, 226, 'C', RED)
    f.text(395, 232, '範囲の外は×', 'middle', 13, RED)
    f.save('l1-transceiver')


# ⑨ 複数の基地局で面的に覆う
def cells():
    f = Fig(460, 290)
    centers = [(90, 105), (200, 90), (310, 105), (140, 190), (260, 190), (370, 185)]
    for (x, y) in centers:
        circle(f, x, y, 62, stroke=ACC, fill='none', sw=1.5)
    for (x, y) in centers:
        tower(f, x, y + 10)
    # 有線網
    core = (230, 265)
    for (x, y) in centers:
        f.line((x, y + 12), (x, y + 22), core, color=SUB, w=1.2, dash='4 3')
    rect(f, 175, 263, 110, 22, fill=LIGHT, rx=4, sw=1.5)
    f.text(230, 279, '有線網でつなぐ', 'middle', 12)
    f.text(10, 20, 'サービスエリアを基地局の円で敷きつめる', 'start', 13, ACC)
    f.save('l1-cells')


# ⑩ ハンドオーバ
def handover():
    f = Fig(460, 240)
    circle(f, 130, 110, 90, stroke=ACC, fill='none', sw=1.5)
    circle(f, 330, 110, 90, stroke=GRN, fill='none', sw=1.5)
    tower(f, 110, 140, '基地局X', ACC)
    tower(f, 350, 140, '基地局Y', GRN)
    phone(f, 190, 80)
    f.arrow(206, 80, 262, 80, color=INK)
    phone(f, 280, 80)
    f.text(235, 50, '通話中に移動', 'middle', 13)
    f.line((180, 86), (118, 100), color=ACC, w=2, dash='4 3')
    f.line((290, 86), (342, 100), color=GRN, w=2.5)
    f.text(230, 230, 'つなぐ基地局を X → Y に切り替える＝ハンドオーバ', 'middle', 13, RED)
    f.save('l1-handover')


# ⑪ 位置登録とページング
def location():
    f = Fig(460, 260)
    rect(f, 150, 12, 160, 40, fill=LIGHT)
    f.text(230, 30, 'ネットワーク', 'middle', 13)
    f.text(230, 46, '「Bさんは Y の近く」', 'middle', 12, ACC)
    tower(f, 90, 150, '基地局X')
    tower(f, 230, 150, '基地局Y')
    tower(f, 370, 150, '基地局Z')
    for x in (90, 230, 370):
        f.line((x, 102), (230, 52), color=SUB, w=1, dash='3 3')
    phone(f, 275, 215, '待受中のB')
    f.arrow(270, 195, 242, 120, color=ACC)
    f.text(300, 200, '①位置登録', 'start', 13, ACC)
    f.text(300, 217, '（ここにいます）', 'start', 12, ACC)
    f.arrow(218, 120, 246, 200, color=RED)
    f.text(30, 205, '②着信 → Y から', 'start', 13, RED)
    f.text(30, 222, '呼び出す（ページング）', 'start', 13, RED)
    f.save('l1-location')


# ⑫ 衛星の3つの軌道
def orbits():
    f = Fig(460, 290)
    cx, cy = 150, 150
    circle(f, cx, cy, 40, stroke=ACC, fill=SKY)
    f.text(cx, cy + 5, '地球', 'middle', 13)
    for r, c, lab in ((58, GRN, 'LEO'), (95, ACC, 'MEO'), (135, RED, 'GEO')):
        circle(f, cx, cy, r, stroke=c, fill='none', sw=1.8)
        f.dot(cx + r * 0.71, cy - r * 0.71, 6, c)
    rows = [(GRN, '低軌道 LEO', '〜2,000km', 'Starlink・ISS'),
            (ACC, '中軌道 MEO', '2,000〜36,000km', 'GPS・みちびき'),
            (RED, '静止軌道 GEO', '36,000km', '止まって見える')]
    for i, (c, a, b, d) in enumerate(rows):
        y = 50 + i * 70
        f.dot(302, y - 5, 6, c)
        f.text(314, y, a, 'start', 14, c)
        f.text(314, y + 19, b, 'start', 13)
        f.text(314, y + 37, d, 'start', 12, SUB)
    f.text(314, 262, '高いほど遅く回る', 'start', 14, RED)
    f.save('l1-orbits')


# ⑬ 衛星経由の通信（必ず地上局を通る）
def sat_route():
    f = Fig(460, 230)
    # 衛星
    rect(f, 210, 20, 40, 26, fill=LIGHT, rx=4)
    rect(f, 180, 27, 26, 12, fill=SKY, rx=1, sw=1.5)
    rect(f, 254, 27, 26, 12, fill=SKY, rx=1, sw=1.5)
    f.text(288, 38, '通信衛星', 'start', 13)
    f.line((10, 190), (450, 190), color=SUB, w=1.5)
    phone(f, 50, 168, '端末A')
    phone(f, 410, 168, '端末B')
    # 地上局（パラボラ）
    f.path('M 205 160 A 28 28 0 0 0 255 160 Z', color=INK, w=2, fill='#fff')
    f.line((230, 172), (230, 190), w=2.5)
    f.text(230, 214, '地上局', 'middle', 14, RED)
    f.arrow(62, 150, 196, 50, color=ACC)
    f.text(96, 92, '①', 'middle', 14, ACC)
    f.arrow(222, 52, 222, 150, color=ACC)
    f.text(206, 108, '②', 'middle', 14, ACC)
    f.arrow(238, 150, 238, 52, color=ACC)
    f.text(254, 108, '③', 'middle', 14, ACC)
    f.arrow(266, 50, 398, 150, color=ACC)
    f.text(364, 92, '④', 'middle', 14, ACC)
    f.save('l1-sat-route')


# ⑭ 万有引力が向心力
def gravity():
    f = Fig(440, 220)
    cx, cy = 140, 115
    circle(f, cx, cy, 45, stroke=ACC, fill=SKY)
    f.text(cx, cy + 5, '地球 M', 'middle', 13)
    circle(f, cx, cy, 90, stroke=SUB, fill='none', sw=1.2)
    sx, sy = cx + 90, cy
    f.dot(sx, sy, 7, RED)
    f.text(sx + 10, sy + 24, '衛星 m', 'start', 13, RED)
    f.arrow(sx - 8, sy, sx - 40, sy, color=GRN)
    f.text(sx - 26, sy - 10, '引力', 'middle', 12, GRN)
    f.arrow(sx, sy - 8, sx, sy - 52, color=ACC)
    f.text(sx + 8, sy - 40, '速さ v', 'start', 13, ACC)
    f.line((cx, cy), (cx + 63, cy - 63), color=INK, w=1.2, dash='4 3')
    f.text(cx + 46, cy - 42, 'R+h', 'start', 13)
    f.text(340, 60, '地球の半径 R', 'middle', 13)
    f.text(340, 82, '＋ 高度 h', 'middle', 13)
    f.text(340, 130, '引力が円運動を', 'middle', 13, GRN)
    f.text(340, 150, 'させる力になる', 'middle', 13, GRN)
    f.save('l1-gravity')


for fn in (shannon, repeat, wired_wireless, wave, ratio, units, bands, transceiver, cells,
           handover, location, orbits, sat_route, gravity):
    fn()
print('ok')
