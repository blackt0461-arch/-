# 第6回（3つの接地増幅回路とカスコード）の図
import sys, math
sys.path.insert(0, '/home/user/-/test-study/tools')
from figs_denshi1 import *

BLUE = '#bfe3ff'


def box(f, x, y, w, h, color=INK, fill='#fff', rx=8, sw=2):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{color}" stroke-width="{sw}"/>')


def gnd_up(f, x, y):
    """上向きの接地記号（V_DD の代わり）"""
    f.line((x, y), (x, y - 8))
    f.line((x - 12, y - 8), (x + 12, y - 8))
    f.line((x - 7, y - 13), (x + 7, y - 13))
    f.line((x - 2, y - 18), (x + 2, y - 18))


def zig_h(f, cx, y, s=1.0, color=INK, w=2):
    """横向きの抵抗のギザギザだけ（大きさ s 倍）"""
    L, A = 44 * s, 8 * s
    l = cx - L / 2
    pts = [(l - 12 * s, y), (l, y)]
    for k in range(1, 8):
        pts.append((l + k * L / 8, y + (A if k % 2 else -A)))
    pts.append((l + L, y)); pts.append((l + L + 12 * s, y))
    f.line(*pts, color=color, w=w)


def wave(f, x0, x1, yc, amp, color, inv=False, w=2.5, cycles=2):
    pts = []
    for k in range(121):
        t = k / 120
        v = math.sin(2 * math.pi * cycles * t) * (-1 if inv else 1)
        pts.append((x0 + (x1 - x0) * t, yc - amp * v))
    f.line(*pts, color=color, w=w)


# ① 3つの端子（slide 1）
def terminals():
    f = Fig(400, 230)
    x, y = 140, 115
    t = f.mos(x, y, 'n')
    f.line(t['G'], (x - 60, y), w=2)
    f.line(t['D'], (x + 20, 40)); f.line(t['S'], (x + 20, 190))
    f.text(x - 64, y + 5, 'ゲート G', 'end', 14)
    f.text(x + 30, 46, 'ドレイン D', 'start', 14)
    f.text(x + 30, 194, 'ソース S', 'start', 14)
    f.text(310, 60, '3つの端子に', 'middle', 13, SUB)
    f.text(310, 80, '役わりを1つずつ', 'middle', 13, SUB)
    for k, (s, c) in enumerate([('入力', GRN), ('出力', RED), ('共通（接地）', ACC)]):
        box(f, 255, 98 + k * 38, 110, 30, c)
        f.text(310, 119 + k * 38, s, 'middle', 14, c)
    f.save('l6-terminals')


# ② 3つの接地回路の比較（slide 2）
def three():
    f = Fig(460, 270)
    data = [
        ('ソース接地', 'G', 'D', 'S'),
        ('ソースフォロア', 'G', 'S', 'D'),
        ('ゲート接地', 'S', 'D', 'G'),
    ]
    col = {'in': GRN, 'out': RED, 'com': ACC}
    for i, (name, ti, to, tc) in enumerate(data):
        cx = 92 + i * 150
        y = 135
        f.text(cx - 2, 28, name, 'middle', 14)
        t = f.mos(cx, y, 'n')
        role = {ti: 'in', to: 'out', tc: 'com'}
        word = {'in': '入力', 'out': '出力', 'com': '共通'}
        # ゲート
        c = col[role['G']]
        f.line((cx - 9, y), (cx - 52, y), color=c, w=3.5)
        f.text(cx - 56, y - 10, word[role['G']], 'end', 13, c)
        f.text(cx - 56, y + 10, 'G', 'end', 13, c)
        # ドレイン（上）
        c = col[role['D']]
        f.line((cx + 1, y - 12), (cx + 20, y - 12), (cx + 20, y - 58), color=c, w=3.5)
        f.text(cx + 20, y - 66, word[role['D']] + ' D', 'middle', 13, c)
        # ソース（下）
        c = col[role['S']]
        f.line((cx + 1, y + 12), (cx + 20, y + 12), (cx + 20, y + 58), color=c, w=3.5)
        f.text(cx + 20, y + 78, word[role['S']] + ' S', 'middle', 13, c)
    for k, (s, c) in enumerate([('入力', GRN), ('出力', RED), ('共通（接地）', ACC)]):
        xx = 70 + k * 120
        f.line((xx, 250), (xx + 22, 250), color=c, w=4)
        f.text(xx + 28, 255, s, 'start', 13, c)
    f.save('l6-three')


# ③ 端子の決まり：ゲートは出力にならない／ドレインは入力にならない（slide 3）
def io_rule():
    f = Fig(420, 230)
    x, y = 150, 115
    t = f.mos(x, y, 'n')
    f.line(t['G'], (x - 50, y)); f.line(t['D'], (x + 20, 40)); f.line(t['S'], (x + 20, 190))
    f.text(x - 54, y - 8, 'ゲート', 'end', 14)
    f.text(x - 54, y + 14, '入力○ 出力×', 'end', 13, ACC)
    f.text(x + 32, 40, 'ドレイン', 'start', 14)
    f.text(x + 32, 60, '入力× 出力○', 'start', 13, ACC)
    f.text(x + 32, 182, 'ソース', 'start', 14)
    f.text(x + 32, 202, '入力○ 出力○', 'start', 13, ACC)
    f.text(210, 224, '名前の端子は「どちらにも使わない」', 'middle', 12, SUB)
    f.save('l6-io-rule')


# ④ STEP の流れ（slide 6）
def steps():
    f = Fig(460, 240)
    def b(x, y, w, h, lines, c=INK):
        box(f, x, y, w, h, c)
        n = len(lines)
        for k, (s, cc) in enumerate(lines):
            f.text(x + w / 2, y + h / 2 + 5 + (k - (n - 1) / 2) * 20, s, 'middle', 13 if k else 13, cc)
    b(8, 92, 78, 56, [('STEP0', ACC), ('一般式', INK)], ACC)
    b(118, 18, 196, 56, [('STEP1 入力だけ残す', ACC), ('→ 変換係数 G_{m}', INK)])
    b(118, 150, 100, 74, [('STEP3', ACC), ('出力だけ残す', INK), ('→ 素子の抵抗', INK)])
    b(228, 150, 92, 74, [('STEP4', ACC), ('負荷と並列', INK), ('→ R_{out}', INK)])
    b(336, 74, 118, 92, [('STEP5', RED), ('A_{v}=±G_{m}R_{out}', RED), ('符号は', SUB), ('同相/逆相で', SUB)], RED)
    f.arrow(86, 108, 118, 52)
    f.arrow(86, 132, 118, 180)
    f.text(64, 196, 'STEP2', 'middle', 12, SUB)
    f.text(64, 212, '戻る', 'middle', 12, SUB)
    f.arrow(218, 187, 228, 187)
    f.arrow(314, 52, 360, 74)
    f.arrow(320, 187, 370, 166)
    f.save('l6-steps')


# ⑤ 小信号では V_DD は GND（slide 7）
def vdd_gnd():
    f = Fig(420, 260)
    def cs(x, small):
        if small:
            gnd_up(f, x + 20, 52)
        else:
            f.vdd(x + 20, 34)
        top = 52 if small else 34
        t = f.mos(x, 175, 'n', None, 'v_{in}')
        f.resistor_v(x + 20, top, t['D'][1], 'R_{L}')
        f.line(t['D'], (x + 64, t['D'][1])); f.dot(*t['D']); f.dot(x + 64, t['D'][1], 4)
        f.text(x + 64, t['D'][1] - 10, 'v_{out}', 'middle', 13)
        f.ground(*t['S'])
    cs(70, False)
    cs(290, True)
    f.arrow(170, 120, 236, 120, color=ACC, w=2.5)
    f.text(203, 108, '小信号', 'middle', 13, ACC)
    f.text(90, 252, 'ふつうの回路', 'middle', 13, SUB)
    f.text(320, 252, 'V_{DD} → GND（ゆれ0）', 'middle', 13, RED)
    f.add(f'<circle cx="310" cy="38" r="22" fill="none" stroke="{RED}" stroke-width="2" stroke-dasharray="4 4"/>')
    f.save('l6-vdd-gnd')


# ⑥ 並列の記号 //（slide 8）
def parallel():
    f = Fig(420, 220)
    xl, xr = 50, 210
    f.line((20, 115), (xl, 115)); f.line((xr, 115), (240, 115))
    f.line((xl, 60), (xl, 170)); f.line((xr, 60), (xr, 170))
    f.resistor_h(xl, xr, 60, None); f.resistor_h(xl, xr, 170, None)
    f.text(130, 40, 'r_{0} = 100 kΩ', 'middle', 13)
    f.text(130, 205, 'R_{L} = 100 kΩ', 'middle', 13)
    f.dot(xl, 115); f.dot(xr, 115)
    f.text(255, 120, '=', 'start', 20, INK)
    f.line((280, 115), (290, 115)); zig_h(f, 335, 115, 1.0, RED); f.line((380, 115), (400, 115))
    f.text(340, 95, '50 kΩ', 'middle', 14, RED)
    f.text(340, 150, '同じ2本なら', 'middle', 13, SUB)
    f.text(340, 168, '半分', 'middle', 13, SUB)
    f.save('l6-parallel')


# ⑦ ソース接地の小信号等価回路（slide 10）
def cs_ss():
    f = Fig(420, 270)
    yt, yb = 60, 200
    xs = [90, 200, 310]
    f.line((xs[0], yt), (380, yt)); f.line((xs[0], yb), (xs[-1], yb))
    f.dot(380, yt, 4); f.text(380, yt - 12, 'v_{out}', 'middle', 14)
    f.isrc(xs[0], yt, yb, None)
    f.text(xs[0] - 22, 136, 'g_{m}v_{in}', 'end', 13, GRN)
    f.resistor_v(xs[1], yt, yb, 'r_{0}')
    f.resistor_v(xs[2], yt, yb, 'R_{L}')
    for x in xs[1:]:
        f.dot(x, yt); f.dot(x, yb)
    f.ground(200, yb)
    f.text(310, 222, '（V_{DD} も GND）', 'middle', 12, SUB)
    f.text(210, 256, 'R_{out} = r_{0} // R_{L}（並列）', 'middle', 14, RED)
    f.save('l6-cs-ss')


def two_waves(name, inv, title, amp_out):
    f = Fig(420, 240)
    x0, x1 = 70, 400
    f.text(60, 70, 'v_{in}', 'end', 14, GRN)
    f.text(60, 165, 'v_{out}', 'end', 14, RED)
    f.line((x0, 65), (x1, 65), color='#d0d3e2', w=1.5)
    f.line((x0, 160), (x1, 160), color='#d0d3e2', w=1.5)
    wave(f, x0, x1, 65, 28, GRN)
    wave(f, x0, x1, 160, amp_out, RED, inv)
    xp = x0 + (x1 - x0) / 8
    f.line((xp, 30), (xp, 205), color=SUB, w=1.5, dash='4 4')
    f.text(xp + 6, 30, '入力が山のとき', 'start', 12, SUB)
    f.text(210, 230, title, 'middle', 14, INK)
    f.save(name)


# ⑨ 蛇口のたとえ（slide 15）
def faucet():
    f = Fig(420, 250)
    # 管と蛇口
    f.add(f'<rect x="20" y="60" width="150" height="26" fill="{BLUE}" stroke="{INK}" stroke-width="2"/>')
    f.add(f'<path d="M170 56 H210 Q230 56 230 80 V110 H204 V90 Q204 86 198 86 H170 Z" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    # ハンドル（固定）
    f.line((190, 56), (190, 30), w=3)
    f.line((168, 30), (212, 30), w=4)
    box(f, 168, 8, 44, 18, RED, '#fff', 4)
    f.text(190, 22, '固定', 'middle', 12, RED)
    # 水
    f.add(f'<rect x="209" y="112" width="16" height="96" fill="{BLUE}"/>')
    f.add(f'<path d="M180 230 Q217 206 254 230 Z" fill="{BLUE}" stroke="{INK}" stroke-width="1.5"/>')
    for yy in (130, 170):
        f.arrow(217, yy, 217, yy + 22, color=ACC)
    f.text(250, 30, 'ひねりを固定', 'start', 13, INK)
    f.text(250, 48, '＝ゲートを固定電位に', 'start', 13, ACC)
    f.text(244, 150, '水の量がいつも同じ', 'start', 13, INK)
    f.text(244, 168, '＝定電流源', 'start', 13, ACC)
    f.text(30, 110, '水道管', 'start', 12, SUB)
    f.save('l6-faucet')


# ⑩ 利得と電流（slide 16）
def gain_id():
    f = Fig(460, 280)
    x0, y0 = 40, 235
    axes(f, x0, y0, 310, 25, 'I_{D}', '')
    sx, sy = 260, 190
    def curve(fn, c):
        pts = []
        for k in range(101):
            i = 0.15 + 0.85 * k / 100
            pts.append((x0 + i * sx, y0 - fn(i) * sy))
        f.line(*pts, color=c, w=2.6)
        return pts
    curve(lambda i: math.sqrt(i), GRN)
    curve(lambda i: 0.15 / i, SUB)
    curve(lambda i: 0.387 / math.sqrt(i), RED)
    f.text(306, y0 - 1.0 * sy + 5, 'g_{m}（√I_{D} で増える）', 'start', 13, GRN)
    f.text(306, y0 - 0.15 * sy + 5, 'r_{0}（1/I_{D} で減る）', 'start', 13, SUB)
    f.text(306, y0 - 0.387 * sy + 5, '利得 |A_{v}|（1/√I_{D}）', 'start', 13, RED)
    f.text(60, 268, '電流を増やすと、利得は下がる', 'start', 13, INK)
    f.save('l6-gain-id')


# ⑪ ソース側から見た MOS は小さな抵抗（slide 20）
def sf_rout():
    f = Fig(460, 270)
    x = 80
    f.vdd(x + 20, 34)
    t = f.mos(x, 100, 'n', None, 'v_{g}=0')
    f.line((x + 20, 34), t['D'])
    f.line(t['S'], (x + 64, t['S'][1])); f.dot(*t['S']); f.dot(x + 64, t['S'][1], 4)
    f.arrow(x + 110, t['S'][1], x + 70, t['S'][1], color=ACC)
    f.text(x + 90, t['S'][1] - 10, '見る', 'middle', 12, ACC)
    f.resistor_v(x + 20, t['S'][1], 222, 'R_{L}'); f.ground(x + 20, 222)
    f.text(14, 262, '小信号でゲート・V_{DD} は 0', 'start', 12, SUB)
    # 右：同じもの
    f.text(224, 140, '=', 'middle', 20)
    yt, yb = 70, 200
    xs = [265, 335, 405]
    f.line((xs[0], yt), (xs[-1], yt)); f.line((xs[0], yb), (xs[-1], yb))
    f.dot(335, yt, 4); f.text(335, yt - 12, 'v_{out}', 'middle', 13)
    f.resistor_v(xs[0], yt, yb); f.text(xs[0] + 12, 140, '1/g_{m}*', 'start', 13, RED)
    f.resistor_v(xs[1], yt, yb); f.text(xs[1] + 14, 140, 'r_{0}', 'start', 13)
    f.resistor_v(xs[2], yt, yb); f.text(xs[2] + 14, 140, 'R_{L}', 'start', 13)
    f.ground(335, yb)
    f.text(335, 240, '1/g_{m}* がとても小さい', 'middle', 13, RED)
    f.text(335, 260, '→ R_{out} ≈ 1/g_{m}*', 'middle', 13, RED)
    f.save('l6-sf-rout')


# ⑬ レベルシフト（slide 22）
def level_shift():
    f = Fig(420, 250)
    x0, y0 = 60, 220
    axes(f, x0, y0, 400, 20, '時間', '電圧')
    f.text(x0 + 4, 16, '', 'start')
    wave(f, x0 + 10, 380, 64, 25, GRN, cycles=1.5)
    wave(f, x0 + 10, 380, 182, 25, RED, cycles=1.5)
    f.text(390, 60, 'V_{in}', 'end', 14, GRN)
    f.text(396, 160, 'V_{out}', 'end', 14, RED)
    for xx in (130, 260):
        # 同じ時刻の差
        t = (xx - (x0 + 10)) / (380 - x0 - 10)
        v = math.sin(2 * math.pi * 1.5 * t)
        ya, yb = 64 - 25 * v, 182 - 25 * v
        f.arrow(xx, ya + 4, xx, yb - 4, color=ACC)
        f.arrow(xx, yb - 4, xx, ya + 4, color=ACC)
    f.text(150, 118, '差はいつも一定', 'start', 13, ACC)
    f.text(150, 138, 'V_{T}+√(2I/β)', 'start', 13, ACC)
    f.save('l6-level-shift')


# ⑭ CMOS イメージセンサの画素（slide 23）
def cis():
    f = Fig(460, 310)
    yv = 40
    f.line((110, yv), (300, yv), w=2.5); f.text(120, yv - 10, 'V_{DD}', 'start', 13)
    # PD
    xp = 50
    f.line((xp, 130), (xp + 50, 130))
    f.add(f'<polygon points="{xp-12},150 {xp+12},150 {xp},168" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    f.line((xp - 12, 168), (xp + 12, 168), w=2.5)
    f.line((xp, 130), (xp, 150)); f.line((xp, 168), (xp, 180)); f.ground(xp, 180)
    f.arrow(14, 120, 30, 144, color='#e0a100'); f.arrow(24, 112, 40, 136, color='#e0a100')
    f.text(xp - 14, 220, 'PD', 'start', 13)
    f.text(xp - 30, 238, '光→電荷', 'start', 12, SUB)
    # TG
    box(f, 100, 118, 46, 24, INK, '#fff', 4); f.text(123, 135, 'TG', 'middle', 12)
    xf = 190
    f.line((146, 130), (214, 130)); f.dot(xf, 130, 4.5, ACC)
    f.text(xf - 4, 160, 'FD', 'middle', 13, ACC)
    f.text(xf - 4, 177, '電荷を', 'middle', 12, SUB)
    f.text(xf - 4, 192, 'ためる', 'middle', 12, SUB)
    # RST
    f.line((xf, yv), (xf, 70)); box(f, xf - 22, 70, 44, 24, INK, '#fff', 4); f.text(xf, 87, 'RST', 'middle', 12)
    f.line((xf, 94), (xf, 130))
    # SF
    x = 250
    t = f.mos(x, 130, 'n')
    f.text(x + 26, 135, 'SF', 'start', 13, RED)
    f.line((x + 20, yv), t['D'])
    f.line(t['S'], (x + 20, 200), (296, 200))
    box(f, 296, 188, 44, 24, INK, '#fff', 4); f.text(318, 205, 'SEL', 'middle', 12)
    xc = 390
    f.line((340, 200), (xc, 200)); f.dot(xc, 200)
    # 列線
    f.line((xc, 60), (xc, 200), w=3)
    f.isrc(xc, 200, 268, None)
    f.ground(xc, 268)
    f.text(xc - 22, 240, '電流源', 'end', 12)
    f.text(xc - 22, 256, '(SFの負荷)', 'end', 12, SUB)
    f.arrow(xc, 70, xc, 36, color=GRN, w=2.5)
    f.text(xc, 24, 'AMP へ', 'middle', 13, GRN)
    f.text(xc + 8, 120, '列線', 'start', 13)
    f.text(170, 296, 'FD の電圧を SF がそのまま列線へ（利得≈1）', 'middle', 12, SUB)
    f.save('l6-cis')


# ⑮ ゲート接地：ソースから電流を入れる（slide 27）
def cg_in():
    f = Fig(440, 280)
    x = 130
    f.vdd(x + 20, 30)
    t = f.mos(x, 140, 'n', None, '固定')
    f.resistor_v(x + 20, 30, t['D'][1], 'R_{L}')
    f.line(t['D'], (x + 70, t['D'][1])); f.dot(*t['D']); f.dot(x + 70, t['D'][1], 4)
    f.text(x + 78, t['D'][1] + 5, 'v_{out}（電圧で出る）', 'start', 13, RED)
    f.dot(*t['S'])
    f.isrc(x + 20, t['S'][1], 250, None)
    f.ground(x + 20, 250)
    f.text(x - 6, 215, 'i_{in}', 'end', 14, GRN)
    f.text(x - 6, 233, '電流を入れる', 'end', 12, GRN)
    f.arrow(x + 90, t['S'][1], x + 30, t['S'][1], color=ACC)
    f.text(x + 96, t['S'][1] - 4, 'ソースから見ると', 'start', 12, ACC)
    f.text(x + 96, t['S'][1] + 14, '≈ 1/g_{m}*（小さい）', 'start', 12, ACC)
    f.text(x + 96, t['S'][1] + 32, '→ 低入力インピーダンス', 'start', 12, ACC)
    f.save('l6-cg-in')


# ⑯ 30dB の注意（slide 28）
def db():
    f = Fig(440, 230)
    f.text(220, 30, 'ソース接地の利得：30dB 程度', 'middle', 14)
    box(f, 14, 50, 196, 130, GRN, '#effaf6')
    f.text(112, 78, '講師の定義', 'middle', 14, GRN)
    f.text(112, 104, '10 log_{10}(v_{out}/v_{in})', 'middle', 13)
    f.text(112, 136, '30dB = 10³', 'middle', 15)
    f.text(112, 162, '= 1000倍', 'middle', 16, GRN)
    box(f, 230, 50, 196, 130, SUB)
    f.text(328, 78, 'ふつうの電圧の dB', 'middle', 14, SUB)
    f.text(328, 104, '20 log_{10}(v_{out}/v_{in})', 'middle', 13, SUB)
    f.text(328, 136, '30dB ≈ 32倍', 'middle', 15, SUB)
    f.text(220, 212, 'テストでは左（30dB＝1000倍）で答える', 'middle', 13, RED)
    f.save('l6-db')


# ⑰ 利得を上げる 2 つの方法（slide 29）
def raise_gain():
    f = Fig(440, 240)
    box(f, 140, 14, 160, 40, INK)
    f.text(220, 40, 'A_{V} = g_{m} × R_{out}', 'middle', 15)
    f.arrow(180, 54, 110, 94); f.arrow(260, 54, 330, 94)
    box(f, 14, 96, 196, 100, RED, '#fdf0f0')
    f.text(112, 122, 'g_{m} を大きくする', 'middle', 14, RED)
    f.text(112, 146, '面積（W/L）と', 'middle', 13)
    f.text(112, 164, '電流が増える', 'middle', 13)
    f.text(112, 186, '× 不利', 'middle', 14, RED)
    box(f, 230, 96, 196, 100, GRN, '#effaf6')
    f.text(328, 122, 'R_{out} を大きくする', 'middle', 14, GRN)
    f.text(328, 146, 'MOS を通して', 'middle', 13)
    f.text(328, 164, '抵抗を大きく見せる', 'middle', 13)
    f.text(328, 186, '○ こちらを選ぶ', 'middle', 14, GRN)
    f.text(328, 224, '→ カスコード', 'middle', 14, ACC)
    f.save('l6-raise')


# ⑱ レンズのたとえ（slide 30）
def lens():
    f = Fig(460, 260)
    for i, (title, s, label, col) in enumerate([
        ('ドレイン側から見る', 1.7, '拡大', RED), ('ソース側から見る', 0.5, '縮小', ACC)]):
        ox = i * 230
        f.text(ox + 115, 28, title, 'middle', 14)
        zig_h(f, ox + 50, 130, 1.0)
        f.text(ox + 50, 112, 'R_{S}' if i == 0 else 'R_{L}', 'middle', 13)
        f.arrow(ox + 88, 130, ox + 108, 130, color=SUB)
        cx = ox + 162
        f.add(f'<circle cx="{cx}" cy="130" r="50" fill="#f3f6ff" stroke="{INK}" stroke-width="3"/>')
        f.line((cx + 35, 165), (cx + 58, 196), w=7)
        zig_h(f, cx, 130, s, col, 2.5 if s > 1 else 2)
        f.text(ox + 115, 230, label + 'して見える', 'middle', 15, col)
    f.line((230, 45), (230, 245), color='#d0d3e2', w=1.5)
    f.save('l6-lens')


# ⑲ 従来のソース接地とカスコード（slide 34）
def cascode_cmp():
    f = Fig(460, 340)
    # 左：従来
    x = 100
    f.text(x + 20, 22, '従来', 'middle', 14)
    f.vdd(x + 20, 50, '')
    m4 = f.mos(x, 98, 'p', 'M_{4}', '固定')
    f.line((x + 20, 50), m4['S'])
    m1 = f.mos(x, 250, 'n', 'M_{1}', 'v_{in}')
    f.line(m4['D'], m1['D'])
    yo = (m4['D'][1] + m1['D'][1]) / 2
    f.line((x + 20, yo), (x + 56, yo)); f.dot(x + 20, yo); f.dot(x + 56, yo, 4)
    f.text(x + 56, yo - 10, 'v_{out}', 'middle', 13)
    f.ground(*m1['S'])
    f.text(x + 20, 326, 'r_{o1} // r_{o4}', 'middle', 13, SUB)
    # 右：カスコード
    x = 290
    f.text(x + 20, 22, 'カスコード', 'middle', 14, ACC)
    f.vdd(x + 20, 34, '')
    m4 = f.mos(x, 68, 'p', 'M_{4}', '固定')
    m3 = f.mos(x, 136, 'p', 'M_{3}', '固定')
    m2 = f.mos(x, 204, 'n', 'M_{2}', '固定')
    m1 = f.mos(x, 272, 'n', 'M_{1}', 'v_{in}')
    yo = m3['D'][1]
    f.line((x + 20, yo), (x + 60, yo)); f.dot(x + 20, yo); f.dot(x + 60, yo, 4)
    f.text(x + 66, yo + 5, 'v_{out}', 'start', 13)
    f.ground(*m1['S'])
    # 大きく見える印
    f.text(x + 70, 110, 'r_{o4} を', 'start', 12, RED)
    f.text(x + 70, 126, '大きく見せる', 'start', 12, RED)
    f.text(x + 70, 228, 'r_{o1} を', 'start', 12, RED)
    f.text(x + 70, 244, '大きく見せる', 'start', 12, RED)
    f.line((230, 30), (230, 330), color='#d0d3e2', w=1.5)
    f.save('l6-cascode-cmp')


terminals(); three(); io_rule(); steps(); vdd_gnd(); parallel(); cs_ss()
two_waves('l6-cs-phase', True, '逆相：入力が上がると出力は下がる', 45)
two_waves('l6-sf-phase', False, '同相：いっしょに動く（大きさは1より少し小さい）', 24)
faucet(); gain_id(); sf_rout(); level_shift(); cis(); cg_in(); db(); raise_gain(); lens(); cascode_cmp()
