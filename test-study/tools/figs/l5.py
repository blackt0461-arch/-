# 第5回 小信号等価回路と増幅のしくみ の図
# 使い方：python3 test-study/tools/figs/l5.py
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from figs_denshi1 import *


def circ(f, x, y, r, fill='#fff', stroke=INK, w=2, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    f.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"{d}/>')


def rect(f, x, y, w, h, fill='#fff', stroke=INK, sw=2, rx=8):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def csrc(f, x, top, bot, r=18, color=INK):
    """縦向きの電流源（下向き矢印）"""
    m = (top + bot) / 2
    f.line((x, top), (x, m - r))
    circ(f, x, m, r, stroke=color)
    f.arrow(x, m - r + 7, x, m + r - 7, color=color)
    f.line((x, m + r), (x, bot))


# ===== 1. 弱反転と強反転（log I_D–V_GS） =====
def weak_strong():
    f = Fig(440, 290)
    x0, y0 = 70, 240
    axes(f, x0, y0, 420, 30, 'V_{GS}', 'log I_{D}')
    vt = 210
    f.line((vt, y0), (vt, 40), color=SUB, w=1.6, dash='5 5')
    f.text(vt, y0 + 22, 'V_{T}', 'middle', 13)
    # 弱反転：直線、強反転：曲がって寝る
    pts = []
    for k in range(0, 111):
        x = x0 + 10 + k * 3.0
        if x <= vt:
            y = 225 - (x - x0 - 10) * 0.95
        else:
            d = x - vt
            y = (225 - (vt - x0 - 10) * 0.95) - 70 * (1 - math.exp(-d / 70)) * 1.36
        pts.append((x, y))
    f.line(*[p for p in pts if p[0] <= vt], color=ACC, w=3)
    f.line(*[p for p in pts if p[0] >= vt], color=RED, w=3)
    f.text(x0 + 12, 60, '弱反転', 'start', 14, ACC)
    f.text(x0 + 12, 78, '指数関数', 'start', 12, ACC)
    f.text(x0 + 12, 94, '→ 対数軸で直線', 'start', 12, ACC)
    f.text(325, 55, '強反転', 'middle', 14, RED)
    f.text(325, 73, '曲がって寝てくる', 'middle', 12, RED)
    f.text(325, 89, '（この授業で主に扱う）', 'middle', 12, SUB)
    f.save('l5-weak-strong')


# ===== 2. 坂道の上のボール =====
def slope_ball():
    f = Fig(440, 280)
    gx = lambda x: 255 - 0.0028 * (x - 40) ** 2   # 坂（放物線）
    pts = [(x, gx(x)) for x in range(40, 341, 4)]
    f.add('<polygon points="' + ' '.join(f'{x},{y:.1f}' for x, y in pts) + ' 340,262 40,262" fill="#e9eafc"/>')
    f.line(*pts, color=INK, w=3)
    f.text(330, 252, '坂 ＝ I_{D} のグラフ', 'end', 12, SUB)
    for (bx, c, lab1, lab2) in [(120, ACC, 'ゆるい所', '高さ 少し変わる'), (285, RED, '急な所', '高さ 大きく変わる')]:
        by = gx(bx)
        d = 22
        circ(f, bx, by - 11, 10, fill=c, stroke=c)
        f.arrow(bx, by - 30, bx - d, by - 30, color=SUB, w=1.8)
        f.arrow(bx, by - 30, bx + d, by - 30, color=SUB, w=1.8)
        y1, y2 = gx(bx - d), gx(bx + d)
        xr = bx + d + 18
        f.line((bx - d, y1), (xr + 6, y1), color=c, w=1.2, dash='3 3')
        f.line((bx + d, y2), (xr + 6, y2), color=c, w=1.2, dash='3 3')
        f.arrow(xr, (y1 + y2) / 2, xr, y2, color=c, w=2.2)
        f.arrow(xr, (y1 + y2) / 2, xr, y1, color=c, w=2.2)
    f.text(120, 165, 'ゆるい所 → 高さ', 'middle', 13, ACC)
    f.text(120, 183, '少し変わる', 'middle', 13, ACC)
    f.text(240, 70, '急な所 → 高さ', 'end', 13, RED)
    f.text(240, 88, '大きく変わる', 'end', 13, RED)
    f.text(20, 28, 'ボールを左右に同じだけ揺らす', 'start', 12, SUB)
    f.text(395, 140, '傾き', 'middle', 13, INK)
    f.text(395, 158, '＝ g_{m}', 'middle', 13, INK)
    f.save('l5-slope-ball')


# ===== 3. バイアス点 A<B<C と出力電流の振れ =====
def bias_abc():
    f = Fig(440, 300)
    x0, y0 = 50, 240
    axes(f, x0, y0, 420, 25, 'V_{GS}', 'I_{D}')
    sx, vt = 60, 1.0
    X = lambda v: x0 + v * sx
    Y = lambda v: y0 - 17 * (v - vt) ** 2
    pts = [(X(v), Y(v)) for v in [vt + k * 3.5 / 80 for k in range(81)]]
    f.line((x0, y0), (X(vt), y0), *pts, color=INK, w=2.5)
    f.line((X(vt), y0), (X(vt), y0 + 5)); f.text(X(vt), y0 + 20, 'V_{T}', 'middle', 12)
    d = 0.22
    for v, n, c in [(2.0, 'A', SUB), (3.0, 'B', ACC), (4.0, 'C', RED)]:
        f.line((X(v - d), Y(v - d)), *[(X(u), Y(u)) for u in [v - d + j * 2 * d / 10 for j in range(11)]], color=c, w=6)
        f.dot(X(v), Y(v), 4.5, c)
        f.text(X(v) - 10, Y(v) - 6, n, 'end', 14, c)
        # 同じ幅の入力
        f.line((X(v - d), y0 + 4), (X(v - d), y0 - 4), color=c, w=2)
        f.line((X(v + d), y0 + 4), (X(v + d), y0 - 4), color=c, w=2)
        f.line((X(v - d), y0), (X(v + d), y0), color=c, w=4)
        f.text(X(v), y0 + 20, f'V_{{{n}}}', 'middle', 12, c)
        # 出力電流の振れ
        xr = X(v + d) + 14
        f.line((X(v - d), Y(v - d)), (xr + 4, Y(v - d)), color=c, w=1, dash='3 3')
        f.line((X(v + d), Y(v + d)), (xr + 4, Y(v + d)), color=c, w=1, dash='3 3')
        f.line((xr, Y(v - d)), (xr, Y(v + d)), color=c, w=3)
    f.text(X(4.0) + 0.22 * sx + 26, Y(4.0) + 4, '大きく振れる', 'start', 12, RED)
    f.text(X(2.0) + 0.22 * sx + 22, Y(2.0) + 4, '小さい', 'start', 12, SUB)
    f.text(x0 + 10, 40, '入力の幅は同じ（色の太線）', 'start', 12, SUB)
    f.text(x0 + 10, 58, '右上ほど傾き g_{m} が急', 'start', 12, INK)
    f.save('l5-bias-abc')


# ===== 4. 直流＋小信号（I_D と i_d） =====
def dc_signal():
    f = Fig(460, 260)
    # 左：I_D + i_d
    x0, y0 = 40, 200
    f.arrow(x0, y0, 215, y0); f.arrow(x0, y0, x0, 40)
    f.text(210, y0 + 20, '時間', 'end', 12, SUB)
    f.text(x0 + 4, 32, 'I_{D}+i_{d}', 'start', 13)
    yI = 120
    t0 = 90
    f.line((x0, yI), (215, yI), color=ACC, w=1.4, dash='5 4')
    pts = [(x0, yI), (t0, yI)] + [(t0 + k, yI - 32 * math.sin(k / 120 * 2 * math.pi * 2)) for k in range(0, 121, 2)]
    f.line(*pts, color=INK, w=2.5)
    f.line((t0, y0), (t0, y0 + 5)); f.text(t0, y0 + 20, 't_{0}', 'middle', 12)
    f.text(x0 + 4, yI + 22, '直流 I_{D}', 'start', 12, ACC)
    f.text(x0 + 4, yI + 38, '（一定・大文字）', 'start', 12, ACC)
    # 右：i_d のみ
    x1, ym = 260, 120
    f.arrow(x1, ym, 440, ym); f.arrow(x1, 200, x1, 40)
    f.text(440, ym + 20, '時間', 'end', 12, SUB)
    f.text(x1 + 4, 32, 'i_{d}', 'start', 13)
    f.text(x1 - 6, ym + 18, '0', 'end', 12)
    pts = [(x1 + 10 + k, ym - 32 * math.sin(k / 160 * 2 * math.pi * 2.5)) for k in range(0, 161, 2)]
    f.line(*pts, color=RED, w=2.5)
    f.text(350, 190, '小信号 i_{d}（ゆれ・小文字）', 'middle', 12, RED)
    f.text(350, 210, '直流を取りのぞいた部分', 'middle', 12, SUB)
    f.save('l5-dc-signal')


# ===== 5. ずっと同じ音 vs 話し声 =====
def hum():
    f = Fig(440, 240)
    for k, (title, c, res) in enumerate([('ブーー（ずっと同じ）', SUB, '何も伝わらない'), ('話し声（変化する）', ACC, '情報が伝わる')]):
        x = 20 + k * 215
        rect(f, x, 30, 195, 130, fill='#f6f7fb', stroke='#c9cce0')
        f.text(x + 97, 52, title, 'middle', 13, c)
        ym = 105
        if k == 0:
            f.line((x + 15, ym), (x + 180, ym), color=c, w=3)
        else:
            pts = [(x + 15 + j, ym - 30 * math.sin(j / 20) * math.sin(j / 165 * math.pi) * (0.6 + 0.4 * math.sin(j / 7))) for j in range(0, 166, 1)]
            f.line(*pts, color=c, w=2.5)
        f.text(x + 97, 192, res, 'middle', 14, c)
    f.text(117, 220, '＝ 直流 I_{D}', 'middle', 13, SUB)
    f.text(332, 220, '＝ 小信号 i_{d}', 'middle', 13, ACC)
    f.save('l5-hum')


# ===== 6. 傾き × 横のずれ ＝ 縦のずれ =====
def gm_triangle():
    f = Fig(420, 290)
    x0, y0 = 50, 240
    axes(f, x0, y0, 400, 25, 'V_{GS}', 'I_{D}')
    sx, vt = 70, 0.8
    X = lambda v: x0 + v * sx
    Y = lambda v: y0 - 20 * (v - vt) ** 2
    pts = [(X(v), Y(v)) for v in [vt + k * 3.6 / 80 for k in range(81)] if Y(v) > 30]
    f.line((x0, y0), (X(vt), y0), *pts, color=INK, w=2.5)
    vb = 3.0
    g = 40 * (vb - vt)           # 傾き（画面上：縦px / V）
    dv = 0.7
    px, py = X(vb), Y(vb)
    f.line((px - 1.0 * sx, py + g * 1.0), (px + 1.2 * sx, py - g * 1.2), color=ACC, w=2, dash='6 4')
    f.line((px, py), (px + dv * sx, py), color=SUB, w=2.5)
    f.line((px + dv * sx, py), (px + dv * sx, py - g * dv), color=RED, w=3)
    f.dot(px, py, 5, INK)
    f.text(px + dv * sx / 2, py + 20, 'v_{gs}', 'middle', 14, SUB)
    f.text(px + dv * sx + 8, py - g * dv / 2 + 5, 'i_{d}＝g_{m}v_{gs}', 'start', 14, RED)
    f.text(px - 0.8 * sx, py + g * 0.8 + 4, '傾き g_{m}', 'end', 13, ACC)
    f.text(px - 6, py + 2, 'バイアス点', 'end', 12, INK)
    f.text(x0 + 10, 42, '縦のずれ ＝ 傾き × 横のずれ', 'start', 13, INK)
    f.save('l5-gm-triangle')


# ===== 7. 床・天井・ハードル（ソースが上がると電流が減る） =====
def floor_hurdle():
    f = Fig(440, 290)
    ceil = 50
    for k, (floor, vt, title) in enumerate([(230, 60, 'はじめ'), (180, 75, 'ソースが上がった')]):
        x = 40 + k * 210
        f.text(x + 85, 26, title, 'middle', 13, INK if k == 0 else RED)
        f.line((x, ceil), (x + 170, ceil), w=4)
        f.text(x + 170, ceil - 8, '天井＝ゲート（固定）', 'end', 12, SUB)
        f.add(f'<rect x="{x}" y="{floor}" width="170" height="{262 - floor}" fill="#e3e5f0"/>')
        f.line((x, floor), (x + 170, floor), w=4)
        f.text(x + 4, floor + 20, '床＝ソース', 'start', 12, SUB)
        # ハードル V_T
        hx = x + 120
        f.add(f'<rect x="{hx - 7}" y="{floor - vt}" width="14" height="{vt}" fill="{RED}" opacity="0.85"/>')
        f.text(hx + 12, floor - vt / 2 + 5, 'V_{T}', 'start', 13, RED)
        # V_GS
        ax = x + 30
        f.arrow(ax, floor, ax, ceil + 2, color=ACC, w=2)
        f.arrow(ax, ceil, ax, floor - 2, color=ACC, w=2)
        f.text(ax + 8, (ceil + floor) / 2 + 5, 'V_{GS}', 'start', 13, ACC)
        # すき間
        gx = hx
        top = floor - vt
        f.line((gx, ceil + 3), (gx, top - 3), color=GRN, w=5)
        f.text(gx - 6, (ceil + top) / 2 + 5, 'すき間' if k == 0 else 'せまい', 'end', 12, GRN)
    f.arrow(212, 150, 240, 150, color=SUB, w=2.5)
    f.text(220, 284, '緑のすき間（V_{GS}−V_{T}）がせまくなる → 電流が減る', 'middle', 12, INK)
    f.save('l5-floor-hurdle')


# ===== 8. g_mb を考える回路（ゲート固定・ソースがゆれる） =====
def gmb_setup():
    f = Fig(420, 290)
    x, y = 170, 140
    t = f.mos(x, y, 'n', None, None)
    f.line(t['G'], (t['G'][0] - 30, y))
    f.dot(t['G'][0] - 30, y, 4)
    f.text(t['G'][0] - 36, y - 4, 'V_{G}', 'end', 14)
    f.text(t['G'][0] - 36, y + 14, '（固定）', 'end', 12, SUB)
    f.line(t['D'], (t['D'][0], 60)); f.text(t['D'][0], 50, 'D', 'middle', 13)
    f.arrow(t['D'][0] + 14, 66, t['D'][0] + 14, 96, color=ACC); f.text(t['D'][0] + 22, 86, 'I_{D}+i_{d}', 'start', 13, ACC)
    # ソース
    sxp, syp = t['S']
    f.line((sxp, syp), (sxp, syp + 20)); f.dot(sxp, syp + 20, 4, RED)
    f.text(sxp - 10, syp + 26, 'V_{S}+v_{s}', 'end', 14, RED)
    f.text(sxp - 10, syp + 44, 'ソース（上下にゆれる）', 'end', 12, RED)
    # 基板
    f.line((x, y), (x + 70, y), (x + 70, 230), color=INK)
    f.ground(x + 70, 230)
    f.text(x + 80, y + 40, '基板 → GND', 'start', 12, SUB)
    f.text(250, 270, 'ソース↑ → 基板バイアス効果で V_{T}↑', 'middle', 12, INK)
    f.save('l5-gmb-setup')


# ===== 9. ソース↑ → V_T↑ → 電流↓ =====
def gmb_shift():
    f = Fig(420, 290)
    x0, y0 = 50, 240
    axes(f, x0, y0, 400, 25, 'V_{GS}', 'I_{D}')
    sx = 60
    X = lambda v: x0 + v * sx
    vg = 4.2
    for vt, c, lab in [(1.0, INK, 'はじめ'), (1.6, RED, 'ソース↑のあと')]:
        Y = lambda v, vt=vt: y0 - 14 * (v - vt) ** 2
        pts = [(X(v), Y(v)) for v in [vt + k * 4.0 / 80 for k in range(81)] if Y(v) > 35]
        f.line((x0, y0), (X(vt), y0), *pts, color=c, w=2.5)
        f.line((X(vt), y0), (X(vt), y0 + 5), color=c)
        f.dot(X(vg), Y(vg), 5, c)
    f.text(X(1.0), y0 + 20, 'V_{T}', 'middle', 12)
    f.text(X(1.6) + 4, y0 + 20, 'V_{T}′', 'start', 12, RED)
    f.arrow(X(1.15), y0 - 14, X(1.75), y0 - 14, color=RED, w=2)
    f.text(X(1.45), y0 - 22, 'V_{T}↑', 'middle', 12, RED)
    f.line((X(vg), y0), (X(vg), 40), color=SUB, w=1.4, dash='5 4')
    f.text(X(vg), y0 + 20, '同じ V_{GS}', 'middle', 12, SUB)
    y1, y2 = y0 - 14 * (vg - 1.0) ** 2, y0 - 14 * (vg - 1.6) ** 2
    f.arrow(X(vg) + 16, y1, X(vg) + 16, y2, color=RED, w=2.5)
    f.text(X(vg) + 24, (y1 + y2) / 2 + 5, '電流↓', 'start', 14, RED)
    f.text(x0 + 10, 42, '黒：はじめ', 'start', 12, INK)
    f.text(x0 + 10, 60, '赤：ソースが上がったあと', 'start', 12, RED)
    f.save('l5-gmb-shift')


# ===== 10. r_0 ＝ 傾きの逆数 =====
def r0_slope():
    f = Fig(440, 290)
    x0, y0 = 50, 240
    axes(f, x0, y0, 420, 25, 'V_{DS}', 'I_{D}')
    vk = 70     # ピンチオフの位置（px）
    lam = 0.0016
    def I(x):
        d = x - x0
        if d < vk:
            u = d / vk
            return 130 * (2 * u - u * u) * (1 + lam * d)
        return 130 * (1 + lam * d)
    pts = [(x, y0 - I(x)) for x in range(x0, 401, 3)]
    f.line(*pts, color=INK, w=2.5)
    xa, xb = 210, 360
    ya, yb = y0 - I(xa), y0 - I(xb)
    f.line((xa, ya), (xb, ya), color=SUB, w=2)
    f.line((xb, ya), (xb, yb), color=RED, w=3)
    f.text((xa + xb) / 2, ya + 20, 'ΔV_{DS}（大きく変えても）', 'middle', 12, SUB)
    f.text(xb + 6, yb - 6, 'ΔI_{D}', 'start', 13, RED)
    f.text(xb + 6, yb + 10, '（少し）', 'start', 12, RED)
    f.text(270, 160, 'r_{0}＝ΔV_{DS}÷ΔI_{D}', 'middle', 14, ACC)
    f.text(270, 180, '＝ 傾きの逆数（微分抵抗）', 'middle', 13, ACC)
    f.text(270, 200, '線が寝ているほど r_{0} は大きい', 'middle', 12, INK)
    f.text(270, 228, '飽和：少しだけ右上がり', 'middle', 12, SUB)
    f.save('l5-r0-slope')


# ===== 11. 水圧を変えても流れが変わらない蛇口 =====
def faucet():
    f = Fig(440, 290)
    for k, (lv, lab) in enumerate([(70, '水圧 小'), (25, '水圧 大')]):
        x = 30 + k * 200
        # タンク
        f.add(f'<rect x="{x}" y="{lv + 20}" width="70" height="{150 - lv}" fill="#bfe0ff"/>')
        f.line((x, 20), (x, 170), (x + 70, 170), (x + 70, 20), w=2.5)
        f.text(x + 35, lv + 12, lab, 'middle', 13, ACC)
        # 管と蛇口
        f.add(f'<rect x="{x + 70}" y="150" width="70" height="14" fill="#bfe0ff" stroke="{INK}" stroke-width="2"/>')
        f.add(f'<rect x="{x + 132}" y="150" width="16" height="34" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        f.add(f'<rect x="{x + 125}" y="140" width="30" height="8" rx="3" fill="{INK}"/>')
        # 流れ（同じ太さ）
        f.add(f'<rect x="{x + 135}" y="186" width="10" height="44" fill="#7cc0ff"/>')
        f.text(x + 155, 215, '同じ量', 'start', 13, GRN)
    f.text(220, 256, '水圧（V_{DS}）を変えても 流れ（I_{D}）はほぼ同じ', 'middle', 12, SUB)
    f.text(220, 278, '→ 変化に対しては抵抗が高い', 'middle', 13, INK)
    f.save('l5-faucet')


# ===== 12. オームの法則の直線と、飽和のMOSFET =====
def ohm_vs_sat():
    f = Fig(440, 300)
    x0, y0 = 50, 250
    axes(f, x0, y0, 420, 25, 'V', 'I')
    f.line((x0, y0), (x0 + 95, 45), color=SUB, w=2, dash='6 4')
    f.text(x0 + 100, 52, '抵抗 低い', 'start', 12, SUB)
    f.line((x0, y0), (400, 195), color=SUB, w=2, dash='6 4')
    f.text(400, 188, '抵抗 高い', 'end', 12, SUB)
    vk = 60
    def I(x):
        d = x - x0
        if d < vk:
            u = d / vk
            return 150 * (2 * u - u * u) * (1 + 0.0012 * d)
        return 150 * (1 + 0.0012 * d)
    pts = [(x, y0 - I(x)) for x in range(x0, 401, 3)]
    f.line(*pts, color=ACC, w=3)
    f.text(395, y0 - I(395) - 12, 'MOSFET（飽和）', 'end', 13, ACC)
    f.text(250, 128, '電流は多いのに線が寝ている', 'middle', 12, RED)
    f.text(250, 146, '→ 微分抵抗が高い', 'middle', 13, RED)
    f.text(x0 + 10, 280, '点線：オームの法則（傾き急＝抵抗低い）', 'start', 12, SUB)
    f.save('l5-ohm-vs-sat')


# ===== 13. g_m と r_0 はバイアス電流で決まる =====
def gm_r0_id():
    f = Fig(420, 280)
    x0, y0 = 50, 230
    axes(f, x0, y0, 400, 25, 'I_{D}（バイアス電流）', '')
    pts = [(x0 + 5 + t, y0 - 9 * math.sqrt(t)) for t in range(0, 331, 4)]
    f.line(*pts, color=ACC, w=3)
    f.text(390, y0 - 9 * math.sqrt(330) - 10, 'g_{m}≈√(2βI_{D})　増える', 'end', 13, ACC)
    pts = [(x0 + 5 + t, y0 - min(190, 2600 / (t + 12))) for t in range(4, 331, 3)]
    f.line(*pts, color=RED, w=3)
    f.text(385, y0 - 32, 'r_{0}≈1/(λI_{D})　減る', 'end', 13, RED)
    f.text(x0 + 10, 270, '動作点（I_{D}）を決めると g_{m} と r_{0} が決まる', 'start', 12, INK)
    f.save('l5-gm-r0-id')


# ===== 14. 等価回路の部品をひとつずつ足す =====
def ss_build():
    f = Fig(460, 290)
    top, bot = 70, 210
    panels = [
        (10, 110, '① ゲートの変化', [('g', 'g_{m}v_{gs}', ACC)]),
        (140, 140, '② ソースの変化', [('g', '', INK), ('b', '−g_{mb}v_{s}', RED)]),
        (300, 155, '③ ドレインの変化', [('g', '', INK), ('b', '', INK), ('r', 'r_{0}', GRN)]),
    ]
    for (px, pw, title, parts) in panels:
        f.text(px + pw / 2, 26, title, 'middle', 13, INK)
        rect(f, px, 38, pw, 230, fill='#f8f9fc', stroke='#d5d8e8', sw=1.5)
        n = len(parts)
        xs = [px + pw * (j + 1) / (n + 1) for j in range(n)]
        f.line((xs[0], top), (xs[-1], top)) if n > 1 else None
        f.line((xs[0], bot), (xs[-1], bot)) if n > 1 else None
        mx = (xs[0] + xs[-1]) / 2
        f.line((mx, top), (mx, top - 14)); f.text(mx, top - 18, 'D', 'middle', 12)
        f.line((mx, bot), (mx, bot + 14)); f.text(mx, bot + 30, 'S', 'middle', 12)
        f.dot(mx, top); f.dot(mx, bot)
        for (kind, lab, c), x in zip(parts, xs):
            if kind == 'r':
                f.resistor_v(x, top, bot)
            else:
                csrc(f, x, top, bot, 16, color=c)
            if lab:
                f.text(x, bot + 50, lab, 'middle', 13, c)
    f.text(130, 150, '＋', 'middle', 18, SUB)
    f.text(290, 150, '＋', 'middle', 18, SUB)
    f.save('l5-ss-build')


# ===== 15. 入力が上がると出力が下がる（逆相・大きく） =====
def inv_wave():
    f = Fig(440, 280)
    x0, x1 = 60, 420
    for ym, amp, c, lab, sgn in [(70, 14, ACC, '入力 v_{in}', 1), (190, 55, RED, '出力 v_{out}', -1)]:
        f.arrow(x0, ym, x1, ym)
        pts = [(x0 + t, ym - sgn * amp * math.sin(t / 340 * 2 * math.pi * 2)) for t in range(0, 341, 3)]
        f.line(*pts, color=c, w=2.5)
        f.text(x0 - 6, ym + 5, lab, 'end', 12, c)
    xp = x0 + 340 / 8
    f.line((xp, 40), (xp, 255), color=SUB, w=1.4, dash='5 4')
    f.text(xp + 6, 40, '入力が上がると', 'start', 12, SUB)
    f.text(xp + 6, 262, '出力は下がる（逆相）', 'start', 12, RED)
    f.text(x1, 112, '小さい', 'end', 12, ACC)
    f.text(x1, 130, '大きい', 'end', 12, RED)
    f.save('l5-inv-wave')


# ===== 16. 真性利得の三角形 =====
def gain_triangle():
    f = Fig(440, 290)
    x0, y0 = 40, 250
    axes(f, x0, y0, 420, 25, 'V_{DS}', 'I_{D}')
    I0 = 110
    s = 0.22                      # 特性線の傾き（px/px）= 1/r_0
    i = 46                        # 電流の増加分
    x1 = 340
    x2 = x1 - i / s
    L1 = lambda x: I0 - s * (x1 - x)        # 下の線（V_IN）
    L2 = lambda x: I0 + i - s * (x1 - x)    # 上の線（V_IN+v_in）
    xl, xr = 60, 410
    f.line((xl, y0 - L1(xl)), (xr, y0 - L1(xr)), color=INK, w=2.5)
    f.line((xl, y0 - L2(xl)), (xr - 50, y0 - L2(xr - 50)), color=ACC, w=2.5)
    f.line((x0, y0 - I0), (415, y0 - I0), color=RED, w=1.8)
    f.text(x0 + 6, y0 - I0 - 8, 'I_{D}＝I_{0}', 'start', 12, RED)
    f.text(xr, y0 - L1(xr) + 20, 'V_{IN}', 'end', 12, INK)
    f.text(xr - 54, y0 - L2(xr - 50) - 8, 'V_{IN}+v_{in}', 'end', 12, ACC)
    # 三角形
    tri = f'{x2},{y0 - I0} {x1},{y0 - I0 - i} {x1},{y0 - I0}'
    f.add(f'<polygon points="{tri}" fill="#ffe3e4" stroke="none"/>')
    f.line((x1, y0 - I0), (x1, y0 - I0 - i), color=GRN, w=3)
    f.line((x2, y0 - I0), (x1, y0 - I0), color=RED, w=4)
    f.dot(x1, y0 - I0, 5, INK); f.dot(x2, y0 - I0, 5, ACC)
    f.text(x1 + 6, y0 - I0 - i / 2 + 5, 'i＝g_{m}v_{in}', 'start', 13, GRN)
    f.text((x1 + x2) / 2, y0 - I0 + 50, '底辺 |v_{out}|', 'middle', 13, RED)
    f.text(x2 + 30, y0 - I0 - i - 14, '傾き 1/r_{0}', 'middle', 13, ACC)
    f.text(x0 + 10, 40, '高さ＝傾き×底辺 → i＝|v_{out}|/r_{0}', 'start', 13, INK)
    f.text(x0 + 10, 60, '→ |v_{out}|＝r_{0}g_{m}v_{in}', 'start', 13, INK)
    f.save('l5-gain-triangle')


# ===== 17. A_V = G_m × R_out =====
def gm_rout():
    f = Fig(460, 220)
    f.text(28, 84, 'v_{in}', 'middle', 15, ACC)
    f.arrow(48, 80, 85, 80)
    rect(f, 85, 45, 120, 70)
    f.text(145, 76, 'G_{m}', 'middle', 18, INK)
    f.text(145, 98, '電圧→電流', 'middle', 12, SUB)
    f.arrow(205, 80, 255, 80)
    f.text(230, 70, 'i_{out}', 'middle', 14, GRN)
    rect(f, 255, 45, 120, 70)
    f.text(315, 76, 'R_{out}', 'middle', 18, INK)
    f.text(315, 98, '電流→電圧', 'middle', 12, SUB)
    f.arrow(375, 80, 412, 80)
    f.text(435, 84, 'v_{out}', 'middle', 15, RED)
    f.text(230, 165, 'A_{V}＝G_{m}×R_{out}', 'middle', 20, INK)
    f.text(230, 195, '電圧利得 ＝ 変換係数 × 出力抵抗', 'middle', 13, SUB)
    f.save('l5-gm-rout')


# ===== 18. MOSFET 増幅回路（電流が流れるほど v_out が下がる） =====
def mos_rout():
    f = Fig(400, 300)
    x = 150
    f.vdd(x + 20, 30)
    t = f.mos(x, 200, 'n', None, 'v_{in}')
    f.resistor_v(x + 20, 30, 120, 'R_{out}')
    f.line((x + 20, 120), t['D'])
    f.line((x + 20, 140), (x + 80, 140)); f.dot(x + 20, 140); f.dot(x + 80, 140, 4)
    f.text(x + 88, 145, 'v_{out}', 'start', 14, RED)
    f.ground(*t['S'])
    f.arrow(x + 6, 82, x + 6, 112, color=GRN)
    f.text(x, 102, 'i＝G_{m}v_{in}', 'end', 13, GRN)
    f.text(390, 210, '電流 i が増える', 'end', 12, GRN)
    f.text(390, 228, '→ R_{out} での電圧降下が増える', 'end', 12, INK)
    f.text(390, 246, '→ v_{out} が下がる（逆位相）', 'end', 12, RED)
    f.save('l5-mos-rout')


# ===== 19. 各端子の電圧が電流に効く =====
def terminals():
    f = Fig(460, 300)
    x, y = 210, 150
    t = f.mos(x, y, 'n', None, None)
    f.line(t['G'], (t['G'][0] - 20, y)); f.dot(t['G'][0] - 20, y, 4.5, ACC)
    f.text(t['G'][0] - 28, y + 5, 'v_{g}', 'end', 15, ACC)
    f.line(t['D'], (t['D'][0], 80)); f.dot(t['D'][0], 80, 4.5, GRN)
    f.text(t['D'][0] + 10, 84, 'v_{d}', 'start', 15, GRN)
    f.line(t['S'], (t['S'][0], 220)); f.dot(t['S'][0], 220, 4.5, RED)
    f.text(t['S'][0] + 10, 224, 'v_{s}', 'start', 15, RED)
    f.arrow(t['D'][0] + 50, 108, t['D'][0] + 50, 190, color=INK, w=2.5)
    f.text(t['D'][0] + 58, 155, 'i_{d}', 'start', 15, INK)
    # 効き方
    f.text(20, 40, 'ゲート↑ → 電流↑', 'start', 13, ACC)
    f.text(20, 58, '＋g_{m}v_{g}', 'start', 13, ACC)
    f.text(440, 40, 'ドレイン↑ → 電流↑（少し）', 'end', 13, GRN)
    f.text(440, 58, '＋(1/r_{0})v_{d}', 'end', 13, GRN)
    f.text(230, 262, 'ソース↑ → 電流↓', 'middle', 13, RED)
    f.text(230, 282, '−(g_{m}*＋1/r_{0})v_{s}', 'middle', 13, RED)
    f.save('l5-terminals')


if __name__ == '__main__':
    for fn in [weak_strong, slope_ball, bias_abc, dc_signal, hum, gm_triangle, floor_hurdle, gmb_setup, gmb_shift,
               r0_slope, faucet, ohm_vs_sat, gm_r0_id, ss_build, inv_wave, gain_triangle, gm_rout, mos_rout, terminals]:
        fn()
