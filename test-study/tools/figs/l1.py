# 第1回 MOSFET の復習 の図。 python3 test-study/tools/figs/l1.py
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from figs_denshi1 import *

WATER = '#bfe3ff'


def rect(f, x, y, w, h, fill='#fff', stroke=INK, sw=1.5, rx=0, extra=''):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>')


def device(f, ox, oy, w=210, h=70, sd=58, d0=12, d1=12, p=1.0, chan=True, sub=True):
    """断面図。oy＝基板の上の線。d0/d1＝ソース側/ドレイン側のチャネルの厚さ。p＝チャネルが届く割合。"""
    rect(f, ox, oy, w, h, '#eef0f8')
    if sub:
        f.text(ox + w - 6, oy + h - 8, 'P 型基板', 'end', 12, SUB)
    rect(f, ox + 6, oy, sd, 30, '#dfe3ff', rx=5)
    rect(f, ox + w - 6 - sd, oy, sd, 30, '#dfe3ff', rx=5)
    f.text(ox + 6 + sd / 2, oy + 20, 'ソース', 'middle', 12)
    f.text(ox + w - 6 - sd / 2, oy + 20, 'ドレイン', 'middle', 12)
    g0, g1 = ox + 6 + sd, ox + w - 6 - sd
    rect(f, g0, oy - 7, g1 - g0, 7)
    rect(f, g0, oy - 29, g1 - g0, 22, '#c9cdf2', rx=3)
    f.text((g0 + g1) / 2, oy - 13, 'ゲート', 'middle', 12)
    if chan:
        xe = g0 + (g1 - g0) * p
        f.add(f'<path d="M{g0} {oy} L{xe} {oy} L{xe} {oy + d1} L{g0} {oy + d0} Z" fill="{ACC}" opacity=".85"/>')
        if d1 == 0:
            f.dot(xe, oy + 1, 4.5, RED)
    return g0, g1


# ===== 蛇口のたとえ =====
def faucet():
    f = Fig(440, 260)
    # 管
    f.add(f'<path d="M20 120 H190 V112 H250 V120 H330 V160 H250 V168 H190 V160 H20 Z" fill="{WATER}" stroke="{INK}" stroke-width="2"/>')
    # 蛇口の本体とハンドル
    rect(f, 196, 96, 48, 16, '#c9cdf2', sw=2, rx=3)
    f.line((220, 96), (220, 70), w=3)
    rect(f, 180, 58, 80, 14, '#c9cdf2', sw=2, rx=7)
    f.path('M262 50 A44 22 0 0 1 278 78', color=RED, w=2.5)
    f.add(f'<polygon points="278,78 268,70 281,67" fill="{RED}"/>')
    f.text(220, 38, 'ゲート＝ハンドル（V_{GS}）', 'middle', 13, RED)
    # 出口と水
    f.path('M330 120 Q370 120 370 150 V170 H350 V158 Q350 140 330 140', color=INK, w=2, fill=WATER)
    for k in range(3):
        f.add(f'<ellipse cx="360" cy="{186 + k * 16}" rx="4" ry="6" fill="{ACC}"/>')
    for x in (60, 120, 290):
        f.arrow(x - 18, 140, x + 18, 140, color=ACC)
    f.text(75, 196, 'ソース', 'middle', 14)
    f.text(75, 214, '水（電子）の出どころ', 'middle', 12, SUB)
    f.text(345, 248, 'ドレイン＝出口', 'middle', 14)
    f.text(190, 205, '強くひねるほど', 'middle', 13, ACC)
    f.text(190, 223, 'たくさん流れる', 'middle', 13, ACC)
    f.save('l1-faucet')


# ===== しきい値の前と後 =====
def vt():
    f = Fig(460, 250)
    for ox, ttl, on in [(12, 'V_{GS} < V_{T}', False), (238, 'V_{GS} > V_{T}', True)]:
        f.text(ox + 105, 24, ttl, 'middle', 15, ACC if on else SUB)
        device(f, ox, 82, chan=on, sub=False)
        if on:
            f.arrow(ox + 75, 172, ox + 135, 172, color=RED)
            f.text(ox + 105, 200, '道（チャネル）ができた', 'middle', 13, ACC)
            f.text(ox + 105, 222, '→ 電流が流れる（ON）', 'middle', 13, RED)
        else:
            f.text(ox + 105, 105, '？', 'middle', 16, SUB)
            f.text(ox + 105, 200, '道（チャネル）がない', 'middle', 13, SUB)
            f.text(ox + 105, 222, '→ 流れない（OFF）', 'middle', 13, SUB)
    f.line((228, 40), (228, 230), color='#d0d3e2', w=1.5, dash='4 4')
    f.save('l1-vt')


# ===== 線形の式＝上に凸の2次関数 =====
def parabola():
    f = Fig(420, 290)
    x0, y0 = 50, 240
    axes(f, x0, y0, 400, 30, 'V_{DS}', 'I_{D}')
    sx, sy = 75, 85        # a=2 → 頂点 (2, 2)
    a = 2.0
    pt = lambda v: (x0 + v * sx, y0 - (a - v / 2) * v * sy)
    f.line(*[pt(2 * k / 40) for k in range(41)], color=ACC, w=3)
    f.line(*[pt(2 + 2 * k / 40) for k in range(41)], color=SUB, w=2, dash='6 5')
    vx, vy = pt(2)
    f.line((vx, vy), (x0 + 4.5 * sx, vy), color=RED, w=3)
    f.dot(vx, vy, 5, INK)
    f.text(vx, vy - 12, '頂点', 'middle', 13)
    f.line((vx, vy + 8), (vx, y0), color=SUB, w=1.5, dash='3 4')
    f.text(vx, y0 + 20, 'V_{GS}−V_{T}', 'middle', 13)
    f.text(x0 + 3.2 * sx, vy - 12, '本当は水平（飽和）', 'middle', 13, RED)
    f.text(x0 + 2.1 * sx, y0 - 0.4 * sy, '式のままだと下がる', 'start', 12, SUB)
    f.text(x0 + 0.55 * sx, y0 - 0.5 * sy, '線形', 'middle', 13, ACC)
    f.save('l1-parabola')


# ===== 飽和の式：山のてっぺんの高さで一定 =====
def sat_top():
    f = Fig(420, 280)
    x0, y0 = 50, 235
    axes(f, x0, y0, 400, 30, 'V_{DS}', 'I_{D}')
    sx, sy = 70, 80
    a = 2.0
    pts = [(x0 + v * sx, y0 - (a - v / 2) * v * sy) for v in [2 * k / 40 for k in range(41)]]
    f.line(*pts, color=SUB, w=2.5)
    top = y0 - 2 * sy
    f.line((x0 + 2 * sx, top), (x0 + 4.8 * sx, top), color=RED, w=3.5)
    f.line((x0, top), (x0 + 2 * sx, top), color=SUB, w=1.5, dash='3 4')
    f.text(x0 + 3.4 * sx, top - 34, '(β/2)(V_{GS}−V_{T})²', 'middle', 14, RED)
    f.text(x0 + 3.4 * sx, top - 14, 'の高さで一定', 'middle', 13, RED)
    f.line((x0 + 2 * sx, top), (x0 + 2 * sx, y0), color=SUB, w=1.5, dash='3 4')
    f.text(x0 + 2 * sx, y0 + 20, 'V_{GS}−V_{T}', 'middle', 13)
    f.arrow(x0 + 2.6 * sx, top + 40, x0 + 4.4 * sx, top + 40, color=INK)
    f.text(x0 + 3.5 * sx, top + 64, 'V_{DS} を上げても', 'middle', 13)
    f.text(x0 + 3.5 * sx, top + 82, '電流は変わらない', 'middle', 13)
    f.text(x0 + 0.6 * sx, y0 - 14, '線形', 'middle', 12, SUB)
    f.save('l1-sat-top')


# ===== W と L（上から見た図） =====
def wl():
    f = Fig(420, 290)
    f.text(210, 24, '上から見た MOSFET', 'middle', 14, SUB)
    rect(f, 60, 70, 90, 140, '#dfe3ff', rx=6)
    rect(f, 250, 70, 90, 140, '#dfe3ff', rx=6)
    f.text(105, 145, 'ソース', 'middle', 13)
    f.text(295, 145, 'ドレイン', 'middle', 13)
    rect(f, 150, 60, 100, 160, '#c9cdf2', sw=2, rx=3)
    f.text(200, 145, 'ゲート', 'middle', 13)
    # L
    f.arrow(200, 246, 152, 246, color=RED); f.arrow(200, 246, 248, 246, color=RED)
    f.line((150, 222), (150, 254), color=RED, w=1.2); f.line((250, 222), (250, 254), color=RED, w=1.2)
    f.text(200, 276, 'L＝ゲート長（道の長さ）', 'middle', 13, RED)
    # W
    f.arrow(370, 140, 370, 62, color=ACC); f.arrow(370, 140, 370, 218, color=ACC)
    f.text(378, 145, 'W', 'start', 16, ACC)
    f.text(200, 50, 'W＝ゲート幅（道の横幅）', 'middle', 13, ACC)
    f.arrow(165, 100, 235, 100, color=INK)
    f.text(200, 118, '電子', 'middle', 12, INK)
    f.save('l1-wl')


# ===== β は道路の走りやすさ =====
def road():
    f = Fig(440, 280)

    def car(x, y):
        rect(f, x, y, 22, 12, ACC, ACC, 1, rx=3)

    # 広くて短い道
    f.text(20, 30, 'W 広い・L 短い → β 大きい', 'start', 14, GRN)
    rect(f, 120, 44, 180, 70, '#e6e8ee', sw=2)
    for r in range(3):
        for c in range(4):
            car(130 + c * 42, 52 + r * 21)
    f.arrow(305, 79, 345, 79, color=GRN, w=3)
    f.text(352, 85, 'たくさん通る', 'start', 13, GRN)
    # 狭くて長い道
    f.text(20, 158, 'W 狭い・L 長い → β 小さい', 'start', 14, RED)
    rect(f, 30, 178, 330, 26, '#e6e8ee', sw=2)
    for c in range(3):
        car(50 + c * 110, 185)
    f.arrow(365, 191, 385, 191, color=RED, w=2)
    f.text(392, 197, '少し', 'start', 13, RED)
    # 寸法
    f.arrow(195, 232, 32, 232, color=SUB); f.arrow(195, 232, 358, 232, color=SUB)
    f.text(195, 252, 'L（道の長さ）＝分母', 'middle', 13, SUB)
    f.arrow(110, 79, 110, 46, color=SUB); f.arrow(110, 79, 110, 112, color=SUB)
    f.text(100, 84, 'W', 'end', 14, SUB)
    f.text(220, 272, '車＝電子　速い車（μ_{n}）・たくさん集める（C_{ox}）でも β 大', 'middle', 12, INK)
    f.save('l1-road')


# ===== 飽和電圧 V_DSAT =====
def vdsat():
    f = Fig(420, 280)
    x0, y0 = 50, 220
    axes(f, x0, y0, 400, 30, 'V_{DS}', 'I_{D}')
    sx, sy = 70, 75
    bx = x0 + 2 * sx
    f.add(f'<rect x="{x0}" y="40" width="{bx - x0}" height="{y0 - 40}" fill="{ACC}" opacity=".08"/>')
    f.add(f'<rect x="{bx}" y="40" width="{385 - bx}" height="{y0 - 40}" fill="{RED}" opacity=".07"/>')
    pts = [(x0 + v * sx, y0 - (2 - v / 2) * v * sy) for v in [2 * k / 40 for k in range(41)]]
    f.line(*pts, (x0 + 4.7 * sx, y0 - 2 * sy), color=INK, w=3)
    f.line((bx, 40), (bx, y0), color=RED, w=2, dash='6 5')
    f.dot(bx, y0 - 2 * sy, 5, RED)
    f.text((x0 + bx) / 2, 60, '線形', 'middle', 14, ACC)
    f.text((bx + 385) / 2, 60, '飽和', 'middle', 14, RED)
    f.text(bx, y0 + 22, 'V_{DSAT}＝V_{GS}−V_{T}', 'middle', 13, RED)
    f.text(bx, y0 + 44, '（V_{P}、Δ_{OV} とも書く）', 'middle', 12, SUB)
    f.text(bx + 8, 92, '境目', 'start', 13, RED)
    f.save('l1-vdsat')


# ===== 出口で細くなる水路 =====
def water_channel():
    f = Fig(440, 260)
    f.text(220, 24, '横から見た水路（深さ＝電子の多さ）', 'middle', 13, SUB)
    xs, xd, top = 70, 370, 60
    rect(f, xs, top - 18, xd - xs, 14, '#c9cdf2', sw=2, rx=3)
    f.text((xs + xd) / 2, top - 7, 'ゲート（ふた）', 'middle', 12)
    # 水（ソース側 深い → ドレインでゼロ）
    f.add(f'<path d="M{xs} {top} L{xd} {top} L{xs} {top + 90} Z" fill="{WATER}" stroke="{INK}" stroke-width="2"/>')
    # V_DS が小さいとき
    f.line((xs, top + 90), (xd, top + 45), color=SUB, w=2, dash='6 5')
    f.text(xd, top + 108, '点線：V_{DS} が小さいとき', 'end', 12, SUB)
    for x in (110, 170, 230):
        f.arrow(x - 16, top + 18, x + 16, top + 18, color=ACC)
    f.dot(xd, top, 5, RED)
    f.text(xs, top + 112, 'ソース側：深い', 'middle', 13, ACC)
    f.text(xd + 8, top + 22, '出口で', 'start', 13, RED)
    f.text(xd + 8, top + 40, 'ゼロ', 'start', 13, RED)
    f.text(220, 205, 'V_{DS} を上げるほど出口側が浅くなり、', 'middle', 13)
    f.text(220, 227, 'ついに出口で水路がなくなる', 'middle', 13)
    f.save('l1-water-channel')


# ===== Q_D が 0 になる（V_DS を上げていく） =====
def qd_zero():
    f = Fig(440, 300)
    rows = [('V_{DS} 小', 22, ''), ('V_{DS} 中', 10, ''), ('V_{DS}＝V_{GS}−V_{T}', 0, 'Q_{D}＝0（ピンチオフ）')]
    for k, (lab, d1, note) in enumerate(rows):
        oy = 55 + k * 88
        f.text(12, oy + 18, lab, 'start', 13, RED if d1 == 0 else INK)
        g0, g1 = 150, 330
        rect(f, g0, oy - 22, g1 - g0, 18, '#c9cdf2', rx=3)
        f.line((g0 - 22, oy), (g1 + 22, oy), color=SUB, w=1.5)
        f.add(f'<path d="M{g0} {oy} L{g1} {oy} L{g1} {oy + d1} L{g0} {oy + 26} Z" fill="{ACC}" opacity=".85"/>')
        f.text(g0 - 6, oy + 22, 'S', 'end', 13, SUB)
        f.text(g1 + 6, oy + 18, 'D', 'start', 13, SUB)
        if d1 == 0:
            f.dot(g1, oy + 1, 5, RED)
            f.text(g1 - 4, oy + 46, note, 'end', 13, RED)
        else:
            f.text(g1 + 26, oy + 18, '← Q_{D}', 'start', 13, ACC)
    f.text(240, 22, 'ゲート', 'middle', 12, SUB)
    f.save('l1-qd-zero')


# ===== ピンチオフの前と後（ピンチオフ点がソース側へ） =====
def pinch_move():
    f = Fig(460, 275)
    for ox, ttl, p in [(12, 'V_{DS}＝V_{GS}−V_{T}', 1.0), (238, 'V_{DS} をもっと上げる', 0.72)]:
        f.text(ox + 105, 24, ttl, 'middle', 14)
        g0, g1 = device(f, ox, 108, d0=14, d1=0, p=p, sub=False)
        xe = g0 + (g1 - g0) * p
        if p < 1:
            f.arrow(g1 - 2, 198, xe + 2, 198, color=RED)
            f.text((xe + g1) / 2, 220, '少しソース側へ', 'middle', 12, RED)
        f.text(xe, 54, 'ピンチオフ点', 'middle', 12, RED)
        f.arrow(xe, 60, xe, 102, color=RED, w=1.5)
    f.text(230, 258, 'チャネルの形はほとんど同じ → 電流はほぼ一定', 'middle', 13, ACC)
    f.line((228, 40), (228, 232), color='#d0d3e2', w=1.5, dash='4 4')
    f.save('l1-pinch-move')


# ===== チャネル長変調（ロングL と ショートL） =====
def clm_cross():
    f = Fig(460, 270)
    for oy, ttl, g0, g1, col, note in [(40, 'ロングL', 70, 390, GRN, 'ずれは道全体の少しだけ → ほぼ変わらない'),
                                        (150, 'ショートL', 170, 290, RED, 'ずれが道の大きな割合 → 道が短くなって流れやすい')]:
        f.text(12, oy + 20, ttl, 'start', 14, col)
        rect(f, g0, oy, g1 - g0, 16, '#c9cdf2', rx=3)
        cy = oy + 22
        xe = g1 - 28
        f.add(f'<path d="M{g0} {cy} L{xe} {cy} L{g0} {cy + 16} Z" fill="{ACC}" opacity=".85"/>')
        f.line((xe, cy), (g1, cy), color=SUB, w=1.5, dash='3 3')
        f.dot(xe, cy + 1, 4, RED)
        f.text(g0 - 6, cy + 14, 'S', 'end', 13, SUB)
        f.text(g1 + 6, cy + 14, 'D', 'start', 13, SUB)
        f.arrow(g1, cy + 30, xe, cy + 30, color=RED, w=1.8)
        f.text(xe - 4, cy + 35, 'ずれ', 'end', 12, RED)
        f.text(230, cy + 66, note, 'middle', 12, col)
    f.save('l1-clm-cross')


# ===== チャネル長変調のグラフ =====
def clm_graph():
    f = Fig(420, 280)
    x0, y0 = 50, 235
    axes(f, x0, y0, 400, 30, 'V_{DS}', 'I_{D}')
    sx, sy = 65, 60
    lin = [(x0 + v * sx, y0 - (2 - v / 2) * v * sy) for v in [2 * k / 40 for k in range(41)]]
    f.line(*lin, color=INK, w=2.5)
    top = y0 - 2 * sy
    f.line((x0 + 2 * sx, top), (x0 + 5 * sx, top), color=GRN, w=3)
    f.line((x0 + 2 * sx, top), (x0 + 5 * sx, top - 75), color=RED, w=3)
    f.text(x0 + 5 * sx, top + 22, 'ロングL：水平', 'end', 13, GRN)
    f.text(x0 + 5 * sx - 6, top - 84, 'ショートL：右上がり', 'end', 13, RED)
    f.text(x0 + 5 * sx, top + 44, 'ショートL は ×(1+λV_{DS}) で少しずつ増える', 'end', 12, RED)
    f.text(x0 + 0.7 * sx, y0 - 14, '線形', 'middle', 12, SUB)
    f.text(x0 + 3.5 * sx, y0 - 14, '飽和', 'middle', 12, SUB)
    f.save('l1-clm-graph')


# ===== グラフの形まとめ（2×2） =====
def shapes():
    f = Fig(460, 325)
    f.text(165, 22, '線形', 'middle', 14, ACC)
    f.text(345, 22, '飽和', 'middle', 14, RED)
    f.text(14, 100, '横軸', 'start', 13); f.text(14, 118, 'V_{DS}', 'start', 13)
    f.text(14, 240, '横軸', 'start', 13); f.text(14, 258, 'V_{GS}', 'start', 13)
    for r in range(2):
        for c in range(2):
            ox, oy = 90 + c * 180, 160 + r * 140
            f.arrow(ox, oy, ox + 150, oy, color=SUB, w=1.5)
            f.arrow(ox, oy, ox, oy - 115, color=SUB, w=1.5)
            col = ACC if c == 0 else RED
            if r == 0 and c == 0:
                pts = [(ox + 130 * t, oy - 95 * (2 * t - t * t)) for t in [k / 30 for k in range(31)]]
                f.line(*pts, color=col, w=3)
                f.text(ox + 90, oy - 28, '山の左半分', 'middle', 12, col)
            elif r == 0 and c == 1:
                f.line((ox + 4, oy - 70), (ox + 140, oy - 70), color=col, w=3)
                f.line((ox + 4, oy - 70), (ox + 140, oy - 92), color=SUB, w=2, dash='5 4')
                f.text(ox + 72, oy - 46, '水平（一定）', 'middle', 12, col)
                f.text(ox + 72, oy - 100, 'L 短い：右上がり', 'middle', 12, SUB)
            elif r == 1 and c == 0:
                f.line((ox, oy), (ox + 35, oy), (ox + 140, oy - 90), color=col, w=3)
                f.text(ox + 35, oy + 16, 'V_{T}', 'middle', 12)
                f.text(ox + 120, oy - 40, '直線', 'middle', 12, col)
            else:
                pts = [(ox + 35 + 105 * t, oy - 100 * t * t) for t in [k / 30 for k in range(31)]]
                f.line((ox, oy), *pts, color=col, w=3)
                f.text(ox + 35, oy + 16, 'V_{T}', 'middle', 12)
                f.text(ox + 70, oy - 70, '放物線', 'end', 12, col)
    f.save('l1-shapes')


# ===== ベルトコンベア（電流＝電荷×速さ） =====
def belt():
    f = Fig(440, 240)
    f.add(f'<rect x="40" y="110" width="360" height="22" rx="11" fill="#e6e8ee" stroke="{INK}" stroke-width="2"/>')
    for x in (52, 388):
        f.add(f'<circle cx="{x}" cy="121" r="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    for k in range(6):
        rect(f, 70 + k * 55, 82, 30, 28, '#ffd9a8', '#b8741a', 1.8, rx=3)
    f.arrow(160, 60, 280, 60, color=RED, w=3)
    f.text(220, 46, '速さ（電子の進む速さ）', 'middle', 13, RED)
    f.text(220, 160, '荷物の量（チャネルの電荷）', 'middle', 13, ACC)
    f.text(220, 200, '1秒に運ぶ量 ＝ 荷物の量 × 速さ', 'middle', 14)
    f.text(220, 224, '電流 ＝ 電荷 × 速さ', 'middle', 14, ACC)
    f.save('l1-belt')


# ===== 平均の電荷（ソース側で厚く、ドレイン側で薄い） =====
def avg_charge():
    f = Fig(460, 290)
    g0, g1, top = 110, 350, 70
    rect(f, g0, top - 24, g1 - g0, 18, '#c9cdf2', rx=3)
    f.text((g0 + g1) / 2, top - 11, 'ゲート', 'middle', 12)
    f.line((g0 - 30, top), (g1 + 30, top), color=SUB, w=1.5)
    d0, d1 = 90, 36
    f.add(f'<path d="M{g0} {top} L{g1} {top} L{g1} {top + d1} L{g0} {top + d0} Z" fill="{ACC}" opacity=".75"/>')
    avg = top + (d0 + d1) / 2
    f.line((g0, avg), (g1, avg), color=RED, w=2.5, dash='7 5')
    f.text(g1 + 8, avg + 5, '平均', 'start', 13, RED)
    f.text(g0 - 8, top + 48, 'ソース側', 'end', 13)
    f.text(g0 - 8, top + 66, '厚い', 'end', 13, ACC)
    f.text(g1 + 8, top + 18, 'ドレイン側', 'start', 13)
    f.text(g1 + 8, top + 36, '薄い', 'start', 13, ACC)
    f.arrow((g0 + g1) / 2, top + 108, g0, top + 108, color=SUB); f.arrow((g0 + g1) / 2, top + 108, g1, top + 108, color=SUB)
    f.text((g0 + g1) / 2, top + 128, 'L', 'middle', 14, SUB)
    f.text(g0, 236, 'C_{ox}(V_{GS}−V_{T})', 'middle', 12, ACC)
    f.text(g1, 236, 'C_{ox}(V_{GS}−V_{T}−V_{DS})', 'middle', 12, ACC)
    f.text(230, 272, '平均 ＝（両はしの和）÷ 2 → V_{DS}/2 が出てくる', 'middle', 13, RED)
    f.save('l1-avg-charge')


# ===== ソースに抵抗があると V_S が上がる =====
def source_r():
    f = Fig(460, 290)
    for ox, ttl, withr in [(70, 'ソース接地', False), (300, 'ソースに抵抗', True)]:
        f.text(ox + 30, 22, ttl, 'middle', 14)
        t = f.mos(ox, 90, gate_label='G')
        dx, dy = t['D']; sx_, sy_ = t['S']
        f.line((dx, dy), (dx, 44)); f.text(dx + 6, 52, 'D', 'start', 12, SUB)
        if withr:
            f.dot(sx_, sy_ + 12, 4.5, RED)
            f.text(sx_ + 10, sy_ + 17, 'V_{S} > 0', 'start', 13, RED)
            f.resistor_v(sx_, sy_ + 12, 214, 'R', 'left')
            f.ground(sx_, 214)
            f.arrow(sx_ + 16, 150, sx_ + 16, 190, color=RED)
            f.text(sx_ + 22, 176, 'I_{D}', 'start', 13, RED)
        else:
            f.line((sx_, sy_), (sx_, 160))
            f.ground(sx_, 160)
            f.text(sx_ + 10, sy_ + 17, 'V_{S} = 0', 'start', 13, SUB)
    f.text(230, 262, '基板はどちらも 0 V', 'middle', 13, SUB)
    f.text(230, 282, '右はソースが基板より高くなる → V_{T} が上がる', 'middle', 13, RED)
    f.save('l1-source-r')


# ===== V_T と V_SB =====
def vt_vsb():
    f = Fig(420, 270)
    x0, y0 = 60, 225
    axes(f, x0, y0, 400, 30, 'V_{SB}', 'V_{T}')
    sx = 320 / 4.0
    phi = 0.7
    pts = [(x0 + v * sx, y0 - 70 - 95 * (math.sqrt(phi + v) - math.sqrt(phi))) for v in [4 * k / 60 for k in range(61)]]
    f.line(*pts, color=ACC, w=3)
    f.dot(x0, y0 - 70, 5, INK)
    f.text(x0 + 10, y0 - 48, 'V_{TH0}（V_{SB}＝0 のとき）', 'start', 13)
    f.line((x0, y0 - 70), (x0 + 320, y0 - 70), color=SUB, w=1.5, dash='4 4')
    f.text(x0 + 300, y0 - 112, 'V_{SB} が大きいほど', 'end', 13, ACC)
    f.text(x0 + 300, y0 - 94, 'V_{T} が大きくなる', 'end', 13, ACC)
    f.save('l1-vt-vsb')


if __name__ == '__main__':
    for fn in [faucet, vt, parabola, sat_top, wl, road, vdsat, water_channel, qd_zero, pinch_move,
               clm_cross, clm_graph, shapes, belt, avg_charge, source_r, vt_vsb]:
        fn()
    print('ok')
