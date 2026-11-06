# 第2回（増幅のしくみと交流理論）の図
# 使い方：python3 test-study/tools/figs/l2.py → test-study/data/denshi1/fig/l2-*.svg
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from figs_denshi1 import *

WATER = '#bfe3ff'
WATERL = '#4a9fe0'
FONT = 'Hiragino Sans, Noto Sans JP, sans-serif'


def t2(f, x, y, s, anchor='start', size=14, color=INK, weight=600):
    """_{..} を下つき、^{..} を上つきにする文字"""
    out, i = '', 0
    while i < len(s):
        if s[i] in '_^' and i + 1 < len(s) and s[i + 1] == '{':
            j = s.index('}', i)
            sh = 'sub' if s[i] == '_' else 'super'
            out += f'<tspan baseline-shift="{sh}" font-size="{size * 0.72:.0f}">{s[i + 2:j]}</tspan>'
            i = j + 1
        else:
            c = s[i]
            out += {'<': '&lt;', '>': '&gt;', '&': '&amp;'}.get(c, c)
            i += 1
    f.add(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" fill="{color}" font-weight="{weight}" font-family="{FONT}">{out}</text>')


def box(f, x, y, w, h, stroke=INK, fill='#fff', rx=8, sw=2):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def arc(f, cx, cy, r, a0, a1, color=INK, w=2, arrow=False):
    """角度は度（数学の向き：反時計回り＝正）。画面では y が下向きなので符号を反転"""
    n = 30
    pts = []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
    f.line(*[(round(x, 1), round(y, 1)) for x, y in pts], color=color, w=w)
    if arrow:
        (xa, ya), (xb, yb) = pts[-3], pts[-1]
        f.arrow(round(xa, 1), round(ya, 1), round(xb, 1), round(yb, 1), color=color, w=w)


# ===== たとえ：蛇口のハンドル =====
def faucet():
    f = Fig(440, 270)

    def one(x, ang, sw, lab):
        # 管
        box(f, x, 70, 120, 22, rx=4, fill='#e8eaf3')
        box(f, x + 96, 70, 24, 52, rx=4, fill='#e8eaf3')
        # ハンドル（軸＋棒）
        f.line((x + 50, 70), (x + 50, 54), w=3)
        a = math.radians(ang)
        L = 26
        f.line((x + 50 - L * math.cos(a), 54 + L * math.sin(a)), (x + 50 + L * math.cos(a), 54 - L * math.sin(a)), color=ACC, w=5)
        # 水
        f.add(f'<rect x="{x + 108 - sw / 2}" y="122" width="{sw}" height="96" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
        f.text(x + 60, 245, lab, 'middle', 13, SUB)

    one(30, 8, 6, '少し開く')
    one(250, 38, 22, 'もう少し回す')
    f.arrow(170, 40, 240, 40, color=ACC, w=2.5)
    f.text(205, 30, '回す', 'middle', 13, ACC)
    f.text(80, 28, 'ハンドル＝V_{GS}', 'middle', 14, ACC)
    f.text(400, 160, '水の量', 'middle', 13, WATERL)
    f.text(400, 178, '＝I_{D}', 'middle', 13, WATERL)
    f.text(220, 140, '水がどれだけ', 'middle', 13, RED)
    f.text(220, 158, '増えるか＝g_{m}', 'middle', 13, RED)
    f.save('l2-faucet')


# ===== 飽和の I_D–V_GS と接線（g_m＝傾き） =====
def sat_curve(f, x0, y0, sx, k, vt, vmax):
    pts = [(x0 + v * sx, y0 - k * (v - vt) ** 2) for v in [vt + j * (vmax - vt) / 60 for j in range(61)]]
    f.line((x0, y0), (x0 + vt * sx, y0), *[(round(a, 1), round(b, 1)) for a, b in pts], color=ACC, w=2.8)


def tangent(f, x0, y0, sx, k, vt, v, half, color=RED, w=2):
    """v での接線を ±half(V) の範囲で描く。戻り値は点の画面座標と傾き(画面)"""
    yv = y0 - k * (v - vt) ** 2
    s = 2 * k * (v - vt) / sx  # 画面の傾き（px/px, 上向き正）
    xa, xb = x0 + (v - half) * sx, x0 + (v + half) * sx
    xv = x0 + v * sx
    f.line((round(xa, 1), round(yv + s * (xv - xa), 1)), (round(xb, 1), round(yv - s * (xb - xv), 1)), color=color, w=w)
    return xv, yv, s


def gm_tangent():
    f = Fig(420, 290)
    x0, y0, sx, k, vt = 50, 250, 66, 30, 1.0
    axes(f, x0, y0, 400, 30, 'V_{GS}', 'I_{D}')
    sat_curve(f, x0, y0, sx, k, vt, 3.3)
    f.line((x0 + vt * sx, y0), (x0 + vt * sx, y0 + 6)); f.text(x0 + vt * sx, y0 + 22, 'V_{T}', 'middle', 13)
    v = 2.5
    xv, yv, s = tangent(f, x0, y0, sx, k, vt, v, 0.85)
    f.dot(xv, yv, 5, RED)
    # 小さな三角形
    dx = 40
    f.line((xv, yv), (xv + dx, yv), color=INK, w=1.8, dash='4 3')
    f.line((xv + dx, yv), (xv + dx, yv - s * dx), color=INK, w=1.8, dash='4 3')
    f.text(xv + dx / 2, yv + 20, 'ΔV_{GS}', 'middle', 13)
    f.text(xv + dx + 8, yv - s * dx / 2 + 5, 'ΔI_{D}', 'start', 13)
    f.text(70, 50, '接線の傾き ＝ ΔI_{D}÷ΔV_{GS} ＝ g_{m}', 'start', 14, RED)
    f.save('l2-gm-tangent')


def gm_lin():
    f = Fig(420, 290)
    x0, y0, sx = 50, 250, 66
    axes(f, x0, y0, 400, 30, 'V_{GS}', 'I_{D}')
    vt = 1.0
    sl = 40  # px / V
    f.line((x0, y0), (x0 + vt * sx, y0), (x0 + 5 * sx, y0 - sl * 4), color=ACC, w=2.8)
    f.line((x0 + vt * sx, y0), (x0 + vt * sx, y0 + 6)); f.text(x0 + vt * sx, y0 + 22, 'V_{T}', 'middle', 13)
    for v in [2.0, 4.0]:
        xv, yv = x0 + v * sx, y0 - sl * (v - vt)
        dx = 44
        f.dot(xv, yv, 5, RED)
        f.line((xv, yv), (xv + dx, yv), color=RED, w=2, dash='4 3')
        f.line((xv + dx, yv), (xv + dx, yv - sl * dx / sx), color=RED, w=2, dash='4 3')
        f.text(xv + dx + 6, yv - 2, '同じ', 'start', 12, RED)
    f.text(70, 54, '線形：どこでも傾きは同じ', 'start', 14, INK)
    f.text(70, 76, '→ g_{m}＝βV_{DS}（一定）', 'start', 14, RED)
    f.save('l2-gm-lin')


def gm_sat():
    f = Fig(420, 290)
    x0, y0, sx, k, vt = 50, 250, 66, 30, 1.0
    axes(f, x0, y0, 400, 30, 'V_{GS}', 'I_{D}')
    sat_curve(f, x0, y0, sx, k, vt, 3.3)
    f.line((x0 + vt * sx, y0), (x0 + vt * sx, y0 + 6)); f.text(x0 + vt * sx, y0 + 22, 'V_{T}', 'middle', 13)
    xa, ya, _ = tangent(f, x0, y0, sx, k, vt, 1.6, 0.55, GRN, 2.2)
    f.dot(xa, ya, 5, GRN)
    f.text(xa - 8, ya - 18, 'ゆるい＝g_{m} 小', 'end', 13, GRN)
    xb, yb, _ = tangent(f, x0, y0, sx, k, vt, 2.8, 0.4, RED, 2.2)
    f.dot(xb, yb, 5, RED)
    f.text(xb - 34, yb - 4, '急＝g_{m} 大', 'end', 13, RED)
    f.text(70, 54, '飽和：V_{GS} が大きいほど急', 'start', 14, INK)
    f.text(70, 76, '→ g_{m}＝β(V_{GS}−V_{T})', 'start', 14, RED)
    f.save('l2-gm-sat')


# ===== たとえ：滝の高さの取り合い =====
def waterfall():
    f = Fig(440, 290)
    G = 250
    # 地面・崖（灰色の岩）
    rock = '#d9dbe6'
    f.add(f'<path d="M20 {G} L20 60 L150 60 L150 150 L270 150 L270 {G} Z" fill="{rock}" stroke="{INK}" stroke-width="2"/>')
    f.line((20, G), (420, G), w=2)
    # 上の池の水
    f.add(f'<rect x="20" y="50" width="130" height="10" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    # 1段目の滝（R_L）
    f.add(f'<path d="M150 50 Q172 52 176 80 L176 150 L160 150 L160 80 Q158 62 150 60 Z" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    # 真ん中の段の水
    f.add(f'<rect x="176" y="140" width="94" height="10" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    # 2段目の滝（MOSFET）
    f.add(f'<path d="M270 140 Q292 142 296 170 L296 {G} L280 {G} L280 170 Q278 152 270 150 Z" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    f.add(f'<rect x="296" y="{G - 10}" width="120" height="10" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    # ラベル
    f.text(85, 40, '崖の上＝V_{DD}', 'middle', 14)
    f.text(186, 106, 'R_{L} の段', 'start', 14, ACC)
    f.text(306, 200, 'MOSFET', 'start', 14, ACC)
    f.text(306, 218, 'の段', 'start', 14, ACC)
    f.text(223, 132, 'V_{out}', 'middle', 14, RED)
    f.text(360, 272, '0 V（GND）', 'middle', 13, SUB)
    f.text(230, 40, '水が多い → R_{L} で大きく落ちる', 'start', 12, RED)
    f.text(230, 58, '→ V_{out} は低くなる', 'start', 12, RED)
    f.save('l2-waterfall')


# ===== 入力↑ → 出力↓（回路の上で） =====
def antiphase():
    f = Fig(400, 290)
    x = 150
    f.vdd(x + 20, 30)
    t = f.mos(x, 180, 'n', None, 'V_{in}')
    f.resistor_v(x + 20, 30, t['D'][1], 'R_{L}')
    f.line(t['D'], (x + 90, t['D'][1]))
    f.dot(*t['D']); f.dot(x + 90, t['D'][1], 4)
    f.text(x + 98, t['D'][1] + 5, 'V_{out}')
    f.ground(*t['S'])
    # 矢印
    f.text(x - 60, 212, '① 上げる ↑', 'middle', 13, ACC)
    f.arrow(x + 2, 74, x + 2, 112, color=GRN, w=2.5)
    f.text(x - 4, 88, '② I_{D} ↑', 'end', 13, GRN)
    f.text(x - 4, 106, '③ R_{L}I_{D} ↑', 'end', 13, GRN)
    f.text(x + 98, t['D'][1] + 30, '④ 下がる ↓', 'start', 14, RED)
    f.text(200, 280, '入力と出力が逆向き＝逆相', 'middle', 14, INK)
    f.save('l2-antiphase')


# ===== 伝達特性 =====
VDD, VT = 2.8, 0.7


def vout(vi):
    if vi <= VT:
        return VDD
    if vi < 1.32:
        return max(0.12, VDD - 6.5 * (vi - VT) ** 2)
    return max(0.12, 0.35 - 0.12 * (vi - 1.32))


def gain_slope():
    f = Fig(420, 290)
    x0, y0 = 60, 240
    axes(f, x0, y0, 400, 30, 'V_{in}', 'V_{out}')
    sx, sy = 320 / 3.0, 190 / 3.0
    pts = [(round(x0 + vi * sx, 1), round(y0 - vout(vi) * sy, 1)) for vi in [3.0 * k / 150 for k in range(151)]]
    f.line(*pts, color=ACC, w=2.8)
    f.line((x0, y0 - VDD * sy), (x0 - 5, y0 - VDD * sy)); f.text(x0 - 8, y0 - VDD * sy + 5, 'V_{DD}', 'end', 12)
    # 飽和での接線
    v = 1.05
    xv, yv = x0 + v * sx, y0 - vout(v) * sy
    s = 13 * (v - VT) * sy / sx  # 画面の傾き（下向き）
    h = 32
    f.line((round(xv - h, 1), round(yv - s * h, 1)), (round(xv + h, 1), round(yv + s * h, 1)), color=RED, w=2.2)
    f.dot(xv, yv, 5, RED)
    dx = 26
    f.line((xv, yv), (xv + dx, yv), color=INK, w=1.8, dash='4 3')
    f.line((xv + dx, yv), (xv + dx, yv + s * dx), color=INK, w=1.8, dash='4 3')
    f.text(xv + dx + 6, yv - 4, 'ΔV_{in}', 'start', 12)
    f.text(xv + dx + 6, yv + s * dx / 2 + 14, 'ΔV_{out}（大）', 'start', 12)
    # 線形での傾き
    v2 = 2.3
    f.dot(x0 + v2 * sx, y0 - vout(v2) * sy, 5, GRN)
    f.text(x0 + v2 * sx, y0 - vout(v2) * sy - 14, 'ゆるい＝利得 小', 'middle', 12, GRN)
    f.text(390, 60, '利得 ＝ 傾き ＝ ΔV_{out}÷ΔV_{in}', 'end', 14, RED)
    f.text(390, 80, '急な坂（飽和）ほど大きい', 'end', 13, RED)
    f.save('l2-gain-slope')


def sine_amp():
    f = Fig(460, 320)
    x0, y0 = 60, 196
    sx, sy = 80, 54
    axes(f, x0, y0, 285, 26, '', 'V_{out}')
    f.text(285, y0 + 18, 'V_{in}', 'end', 13)
    pts = [(round(x0 + vi * sx, 1), round(y0 - vout(vi) * sy, 1)) for vi in [2.6 * k / 130 for k in range(131)]]
    f.line(*pts, color=ACC, w=2.8)
    f.line((x0, y0 - VDD * sy), (x0 - 5, y0 - VDD * sy)); f.text(x0 - 8, y0 - VDD * sy + 5, 'V_{DD}', 'end', 12)
    vb, a = 1.164, 0.12
    qx, qy = x0 + vb * sx, y0 - vout(vb) * sy
    # 入力（下向きに時間）
    ty0, P = 212, 48
    ipts = []
    for k in range(97):
        tt = 2 * k / 96
        ipts.append((round(qx + a * sx * math.sin(2 * math.pi * tt), 1), round(ty0 + tt * P, 1)))
    f.line((qx, qy), (qx, ty0 + 2 * P), color=SUB, w=1.4, dash='4 4')
    f.line(*ipts, color=GRN, w=2.6)
    f.text(qx + 22, 268, '入力（小さい波）', 'start', 13, GRN)
    f.arrow(qx - 30, 236, qx - 30, 300, color=SUB, w=1.6)
    f.text(qx - 36, 270, '時間', 'end', 12, SUB)
    # 出力（右向きに時間）
    tx0, Q = 300, 72
    opts = []
    for k in range(97):
        tt = 2 * k / 96
        vi = vb + a * math.sin(2 * math.pi * tt)
        opts.append((round(tx0 + tt * Q, 1), round(y0 - vout(vi) * sy, 1)))
    ymax = min(p[1] for p in opts); ymin = max(p[1] for p in opts)
    f.line((x0 + (vb - a) * sx, ymax), (tx0, ymax), color=SUB, w=1.2, dash='3 4')
    f.line((x0 + (vb + a) * sx, ymin), (tx0, ymin), color=SUB, w=1.2, dash='3 4')
    f.line(*opts, color=RED, w=2.6)
    f.text(372, 54, '出力（大きい波）', 'middle', 13, RED)
    f.text(372, 72, '上下が逆＝逆相', 'middle', 13, RED)
    # 山と谷
    ix, iy = qx + a * sx, ty0 + 0.25 * P
    f.dot(ix, iy, 5, INK)
    f.text(ix + 8, iy + 4, '山', 'start', 13, INK)
    ox, oy = tx0 + 0.25 * Q, ymin
    f.dot(ox, oy, 5, INK)
    f.text(ox, oy + 20, '谷', 'middle', 13, INK)
    # 動作点
    f.dot(qx, qy, 5, INK)
    f.text(qx + 10, qy - 8, '動作点', 'start', 12, INK)
    f.save('l2-sine-amp')


# ===== キャパシタ =====
def cap():
    f = Fig(380, 270)
    x = 110
    f.line((x, 20), (x, 112))
    f.line((x - 40, 112), (x + 40, 112), w=4)
    f.line((x - 40, 136), (x + 40, 136), w=4)
    f.line((x, 136), (x, 240))
    for k in range(5):
        f.text(x - 32 + k * 16, 104, '+', 'middle', 13, RED)
        f.text(x - 32 + k * 16, 156, '−', 'middle', 13, ACC)
    f.text(x + 50, 108, '+q', 'start', 14, RED)
    f.text(x + 50, 150, '−q', 'start', 14, ACC)
    f.arrow(x - 12, 34, x - 12, 76, color=GRN, w=2.5)
    f.text(x - 18, 60, 'i', 'end', 16, GRN)
    # 電圧
    f.line((40, 70), (40, 180), color=SUB, w=1.6)
    f.text(40, 64, '+', 'middle', 14, SUB)
    f.text(40, 198, '−', 'middle', 14, SUB)
    f.text(32, 130, 'v', 'end', 16, SUB)
    f.text(x + 50, 129, 'C', 'start', 15)
    # 式
    box(f, 220, 60, 150, 150, stroke=SUB, fill='#f6f7fb')
    f.text(295, 92, 'q ＝ C v', 'middle', 16)
    f.text(295, 114, 'たまる量＝C×電圧', 'middle', 12, SUB)
    f.text(295, 152, 'i ＝ q の増える速さ', 'middle', 13, GRN)
    f.text(295, 176, '＝ C × v の変わる速さ', 'middle', 12, GRN)
    f.text(295, 198, '（微分）', 'middle', 12, SUB)
    f.save('l2-cap')


# ===== たとえ：バケツ =====
def bucket():
    f = Fig(440, 290)
    bx, by, bw, bh = 120, 90, 150, 160
    wl = 170  # 水面
    f.add(f'<rect x="{bx}" y="{wl}" width="{bw}" height="{by + bh - wl}" fill="{WATER}"/>')
    f.line((bx, by), (bx, by + bh), (bx + bw, by + bh), (bx + bw, by), w=3)
    f.line((bx, wl), (bx + bw, wl), color=WATERL, w=2)
    # 蛇口と流れ込む水
    box(f, 40, 30, 120, 18, rx=4, fill='#e8eaf3')
    box(f, 142, 30, 18, 34, rx=4, fill='#e8eaf3')
    f.add(f'<rect x="146" y="64" width="10" height="{wl - 64}" fill="{WATER}" stroke="{WATERL}" stroke-width="1.5"/>')
    f.text(170, 90, 'i ＝ 流れ込む勢い', 'start', 13, GRN)
    # 水位の上がる速さ
    f.arrow(225, wl - 2, 225, wl - 30, color=GRN, w=2.5)
    f.text(208, wl - 38, '水位の上がる速さ', 'middle', 12, GRN)
    # 水位 v
    f.line((bx + bw + 14, by + bh), (bx + bw + 14, wl), color=RED, w=2)
    f.line((bx + bw + 8, wl), (bx + bw + 20, wl), color=RED, w=2)
    f.line((bx + bw + 8, by + bh), (bx + bw + 20, by + bh), color=RED, w=2)
    f.text(bx + bw + 24, (wl + by + bh) / 2 + 5, '水位＝v', 'start', 14, RED)
    # 広さ C
    f.line((bx, by + bh + 14), (bx + bw, by + bh + 14), color=ACC, w=2)
    f.line((bx, by + bh + 8), (bx, by + bh + 20), color=ACC, w=2)
    f.line((bx + bw, by + bh + 8), (bx + bw, by + bh + 20), color=ACC, w=2)
    f.text(bx + bw / 2, by + bh + 34, '大きさ（広さ）＝C', 'middle', 13, ACC)
    f.text(bx + bw / 2, 222, '水の量 q', 'middle', 14, INK)
    f.text(bx + bw / 2, 240, '＝ C × v', 'middle', 13, INK)
    f.save('l2-bucket')


# ===== 振幅と位相 =====
def amp_phase():
    f = Fig(440, 260)
    x0, y0, x1 = 30, 130, 420
    f.arrow(x0, y0, x1, y0, color=SUB, w=1.6)
    f.text(x1 - 2, y0 + 20, '時間', 'end', 12, SUB)
    P = 160  # 1周期の px
    A1, A2, sh = 80, 50, 34

    def wave(A, d, c):
        pts = [(round(x0 + k, 1), round(y0 - A * math.cos(2 * math.pi * (k - d) / P), 1)) for k in range(0, x1 - x0 - 10, 2)]
        f.line(*pts, color=c, w=2.6)
    wave(A1, 40, ACC)
    wave(A2, 40 + sh, RED)
    # 振幅
    px = x0 + 40 + P
    f.line((px, y0), (px, y0 - A1), color=ACC, w=1.6, dash='4 3')
    f.text(px - 6, y0 - A1 / 2 - 14, '振幅', 'end', 13, ACC)
    f.text(px - 6, y0 - A1 / 2 + 4, '（高さ）', 'end', 12, ACC)
    # 位相のずれ
    f.line((px + sh, y0), (px + sh, y0 - A2), color=RED, w=1.6, dash='4 3')
    f.arrow(px, y0 - A1 - 12, px + sh, y0 - A1 - 12, color=INK, w=1.8)
    f.text(px + sh / 2 + 22, y0 - A1 - 20, '位相（ずれ）', 'start', 13, INK)
    f.text(220, 248, '周波数が同じなら、ちがいは「振幅」と「位相」だけ', 'middle', 13, INK)
    f.save('l2-amp-phase')


# ===== 微分 → jω のかけ算 =====
def diff_box():
    f = Fig(440, 250)
    f.text(20, 30, '時間の世界', 'start', 14, SUB)
    f.text(30, 82, 'v(t)', 'start', 16)
    f.arrow(80, 76, 150, 76)
    box(f, 150, 50, 140, 52, stroke=SUB)
    f.text(220, 74, 'C × d/dt', 'middle', 15)
    f.text(220, 94, '微分（めんどう）', 'middle', 12, SUB)
    f.arrow(290, 76, 360, 76)
    f.text(368, 82, 'i(t)', 'start', 16)
    f.line((20, 124), (420, 124), color=SUB, w=1.2, dash='5 5')
    f.text(20, 152, 'フェーザ（複素数）の世界', 'start', 14, RED)
    f.text(36, 204, 'V', 'start', 16)
    f.arrow(80, 198, 150, 198)
    box(f, 150, 172, 140, 52, stroke=RED, fill='#fff3f3')
    f.text(220, 196, 'C × jω', 'middle', 16, RED)
    f.text(220, 216, 'かけ算だけ！', 'middle', 12, RED)
    f.arrow(290, 198, 360, 198)
    f.text(372, 204, 'I', 'start', 16)
    f.save('l2-diff-box')


# ===== j を4回で一周 =====
def jturn():
    f = Fig(400, 300)
    cx, cy, L = 200, 150, 90
    f.line((cx - 120, cy), (cx + 120, cy), color=SUB, w=1.2)
    f.line((cx, cy - 120), (cx, cy + 120), color=SUB, w=1.2)
    cols = [INK, ACC, RED, GRN]
    ends = [(cx + L, cy), (cx, cy - L), (cx - L, cy), (cx, cy + L)]
    labs = [('1', 14, -8, 'start'), ('j', 8, -6, 'start'), ('−1', -14, -8, 'end'), ('−j', 12, 2, 'start')]
    for (ex, ey), c, (s, dx, dy, an) in zip(ends, cols, labs):
        f.arrow(cx, cy, ex, ey, color=c, w=3)
        f.text(ex + dx, ey + dy, s, an, 16, c)
    for k in range(4):
        arc(f, cx, cy, 116, 90 * k + 12, 90 * k + 78, color=SUB, w=1.8, arrow=True)
        a = math.radians(90 * k + 45)
        f.text(round(cx + 132 * math.cos(a), 1), round(cy - 132 * math.sin(a) + 5, 1), '×j', 'middle', 13, SUB)
    f.text(cx, cy + 32, '4回で', 'middle', 13, INK)
    f.text(cx, cy + 50, '元の向き', 'middle', 13, INK)
    f.save('l2-jturn')


# ===== オイラーの公式 =====
def euler():
    f = Fig(420, 310)
    cx, cy, R = 170, 165, 110
    f.arrow(cx - 140, cy, cx + 150, cy, color=SUB, w=1.6)
    f.arrow(cx, cy + 135, cx, cy - 145, color=SUB, w=1.6)
    f.text(cx + 150, cy + 20, '実部', 'end', 12, SUB)
    f.text(cx + 8, cy - 132, '虚部', 'start', 12, SUB)
    f.add(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
    th = math.radians(40)
    px, py = cx + R * math.cos(th), cy - R * math.sin(th)
    f.arrow(cx, cy, round(px, 1), round(py, 1), color=ACC, w=3)
    f.line((px, py), (px, cy), color=RED, w=2, dash='5 4')
    f.line((cx, cy), (px, cy), color=GRN, w=4)
    arc(f, cx, cy, 30, 0, 40, color=INK, w=1.6)
    f.text(cx + 36, cy - 8, 'θ', 'start', 14)
    t2(f, px + 8, py - 6, 'e^{jθ}', 'start', 18, ACC)
    f.text((cx + px) / 2, cy + 22, 'cos θ', 'middle', 14, GRN)
    f.text(px + 8, (py + cy) / 2 + 12, 'sin θ', 'start', 14, RED)
    # j の点
    f.dot(cx, cy - R, 5, RED)
    t2(f, cx - 10, cy - R - 10, 'j ＝ e^{jπ/2}', 'end', 15, RED)
    f.text(cx - 10, cy - R + 10, '（θ＝90°）', 'end', 12, RED)
    f.save('l2-euler')


# ===== フェーザ：回る矢印と、その影（実部）＝ cos =====
def phasor():
    f = Fig(440, 320)
    cx, cy, R = 120, 105, 62
    f.arrow(cx - 85, cy, cx + 90, cy, color=SUB, w=1.6)
    f.line((cx, cy + 80), (cx, cy - 85), color=SUB, w=1.2)
    f.text(cx + 92, cy + 5, '実部', 'start', 12, SUB)
    f.add(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{INK}" stroke-width="1.4" stroke-dasharray="4 4"/>')
    th0 = 50
    a = math.radians(th0)
    px, py = cx + R * math.cos(a), cy - R * math.sin(a)
    f.arrow(cx, cy, round(px, 1), round(py, 1), color=ACC, w=3.2)
    arc(f, cx, cy, R + 12, 60, 115, color=ACC, w=2, arrow=True)
    f.text(cx - 40, cy - R + 4, '回る', 'end', 13, ACC)
    # 影
    f.line((px, py), (px, cy), color=RED, w=1.8, dash='4 4')
    f.dot(px, cy, 5, RED)
    # 下へ時間
    ty0, P = 195, 66
    f.line((px, cy), (px, ty0), color=RED, w=1.4, dash='2 4')
    pts = []
    for k in range(91):
        tt = 1.8 * k / 90
        pts.append((round(cx + R * math.cos(a + 2 * math.pi * tt), 1), round(ty0 + tt * P, 1)))
    f.line((cx, ty0), (cx, ty0 + 1.8 * P), color=SUB, w=1.2)
    f.line(*pts, color=RED, w=2.6)
    f.arrow(cx - 80, ty0, cx - 80, ty0 + 110, color=SUB, w=1.6)
    f.text(cx - 86, ty0 + 60, '時間', 'end', 12, SUB)
    # 説明
    f.text(250, 50, '矢印＝フェーザ', 'start', 14, ACC)
    f.text(250, 70, '長さ＝振幅、角度＝位相', 'start', 13, ACC)
    f.text(250, 128, '影（実部）が', 'start', 14, RED)
    f.text(250, 148, '左右に動く', 'start', 14, RED)
    f.text(250, 230, '影の動き ＝', 'start', 14, RED)
    f.text(250, 252, 'V_{0}cos(ωt＋φ)', 'start', 14, RED)
    f.save('l2-phasor')


# ===== 微分＝jω を掛ける（回る点の速さの向き） =====
def jw_vel():
    f = Fig(420, 300)
    cx, cy, R = 150, 160, 100
    f.arrow(cx - 125, cy, cx + 135, cy, color=SUB, w=1.4)
    f.arrow(cx, cy + 125, cx, cy - 145, color=SUB, w=1.4)
    f.text(cx + 133, cy + 20, '実部', 'end', 12, SUB)
    f.text(cx + 8, cy - 132, '虚部', 'start', 12, SUB)
    f.add(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{INK}" stroke-width="1.4" stroke-dasharray="4 4"/>')
    a = math.radians(30)
    px, py = cx + R * math.cos(a), cy - R * math.sin(a)
    f.arrow(cx, cy, round(px, 1), round(py, 1), color=ACC, w=3)
    # 接線方向（反時計回り）＝ 90°先
    L = 80
    vx, vy = -math.sin(a), -math.cos(a)
    qx, qy = px + L * vx, py + L * vy
    f.arrow(round(px, 1), round(py, 1), round(qx, 1), round(qy, 1), color=RED, w=3)
    # 直角マーク
    s = 10
    ux, uy = -math.cos(a), math.sin(a)
    f.line((round(px + s * ux, 1), round(py + s * uy, 1)), (round(px + s * ux + s * vx, 1), round(py + s * uy + s * vy, 1)), (round(px + s * vx, 1), round(py + s * vy, 1)), w=1.4)
    t2(f, px + 8, py + 22, 'e^{jωt}', 'start', 16, ACC)
    f.text(px + 10, py + 40, '（回る点）', 'start', 12, ACC)
    f.text(qx + 4, qy - 20, '微分＝動く向き', 'start', 13, RED)
    t2(f, qx + 4, qy - 2, '＝ jω × e^{jωt}', 'start', 14, RED)
    f.text(275, 250, 'j：90°先へ回す', 'start', 13, INK)
    f.text(275, 270, 'ω：速さの分だけ伸ばす', 'start', 13, INK)
    f.save('l2-jw-vel')


# ===== V と I のフェーザ（I が π/2 先） =====
def phasor_ci():
    f = Fig(420, 290)
    cx, cy = 200, 210
    f.arrow(cx - 170, cy, cx + 190, cy, color=SUB, w=1.4)
    f.arrow(cx, cy + 60, cx, cy - 200, color=SUB, w=1.4)
    f.text(cx + 188, cy + 20, '実部', 'end', 12, SUB)
    f.text(cx + 8, cy - 188, '虚部', 'start', 12, SUB)
    phi = math.radians(25)
    vx, vy = cx + 150 * math.cos(phi), cy - 150 * math.sin(phi)
    ia = phi + math.pi / 2
    ix, iy = cx + 120 * math.cos(ia), cy - 120 * math.sin(ia)
    f.arrow(cx, cy, round(vx, 1), round(vy, 1), color=ACC, w=3)
    f.arrow(cx, cy, round(ix, 1), round(iy, 1), color=RED, w=3)
    arc(f, cx, cy, 40, 0, 25, color=INK, w=1.6)
    f.text(cx + 46, cy - 6, 'φ', 'start', 14)
    arc(f, cx, cy, 62, 27, 113, color=GRN, w=2, arrow=True)
    f.text(cx - 42, cy - 56, 'π/2 進む', 'end', 14, GRN)
    t2(f, vx - 20, vy - 14, 'V ＝ V_{0}e^{jφ}', 'middle', 15, ACC)
    t2(f, ix - 8, iy - 10, 'I ＝ jωC V', 'end', 15, RED)
    f.text(ix - 8, iy + 10, '（長さ ωC 倍）', 'end', 12, RED)
    f.save('l2-phasor-ci')


# ===== 交流理論・フーリエ・ラプラスの関係 =====
def theory_map():
    f = Fig(460, 310)
    box(f, 130, 14, 200, 46, stroke=SUB, fill='#f6f7fb')
    f.text(230, 36, '複素数', 'middle', 14)
    f.text(230, 53, '（オイラーの公式）', 'middle', 12, SUB)
    box(f, 14, 108, 170, 74, stroke=ACC, fill='#f1f1fe')
    f.text(99, 132, '交流理論 jω', 'middle', 15, ACC)
    f.text(99, 154, '1つの周波数の波', 'middle', 12, ACC)
    f.text(99, 171, 'だけ', 'middle', 12, ACC)
    box(f, 276, 108, 170, 74, stroke=RED, fill='#fff3f3')
    f.text(361, 132, 'フーリエ変換 ω', 'middle', 15, RED)
    f.text(361, 154, 'どんな波も', 'middle', 12, RED)
    f.text(361, 171, '周波数の足し算で', 'middle', 12, RED)
    box(f, 276, 236, 170, 58, stroke=GRN, fill='#effaf6')
    f.text(361, 260, 'ラプラス変換', 'middle', 15, GRN)
    f.text(361, 282, 's ＝ γ ＋ jω', 'middle', 14, GRN)
    f.arrow(190, 60, 120, 110, color=SUB)
    f.arrow(270, 60, 340, 110, color=SUB)
    f.arrow(361, 182, 361, 234, color=SUB)
    f.text(351, 213, 'jω を s に広げる', 'end', 12, SUB)
    # 橋渡し
    f.arrow(200, 144, 268, 144, color=INK, w=2)
    f.arrow(260, 144, 192, 144, color=INK, w=2)
    f.text(230, 132, '橋渡し', 'middle', 13, INK)
    f.save('l2-theory-map')


if __name__ == '__main__':
    for fn in [faucet, gm_tangent, gm_lin, gm_sat, waterfall, antiphase, gain_slope, sine_amp, cap, bucket,
               amp_phase, diff_box, jturn, euler, phasor, jw_vel, phasor_ci, theory_map]:
        fn()
    print('ok')
