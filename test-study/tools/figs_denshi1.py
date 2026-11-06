# 電子回路I の図（回路図・グラフ）を SVG で作る。
# 使い方：python3 test-study/tools/figs_denshi1.py  → test-study/data/denshi1/fig/*.svg
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'denshi1', 'fig')
INK = '#1d2240'
ACC = '#5b5cf0'
RED = '#e5484d'
GRN = '#10a37f'
SUB = '#6a7092'


class Fig:
    def __init__(self, w, h):
        self.w, self.h, self.p = w, h, []

    def add(self, s):
        self.p.append(s)

    # ---- 線・文字 ----
    def line(self, *pts, color=INK, w=2, dash=None):
        d = ' '.join(f'{x},{y}' for x, y in pts)
        self.add(f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{f" stroke-dasharray=\"{dash}\"" if dash else ""}/>')

    def path(self, d, color=INK, w=2, fill='none', dash=None):
        self.add(f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{f" stroke-dasharray=\"{dash}\"" if dash else ""}/>')

    def dot(self, x, y, r=3.5, color=INK):
        self.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')

    def text(self, x, y, s, anchor='start', size=14, color=INK, weight=600):
        # s の中の _{..} を下つき文字にする
        out, i = '', 0
        while i < len(s):
            if s[i] == '_' and i + 1 < len(s) and s[i + 1] == '{':
                j = s.index('}', i)
                out += f'<tspan baseline-shift="sub" font-size="{size * 0.72:.0f}">{s[i + 2:j]}</tspan>'
                i = j + 1
            else:
                c = s[i]
                out += {'<': '&lt;', '>': '&gt;', '&': '&amp;'}.get(c, c)
                i += 1
        self.add(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" fill="{color}" font-weight="{weight}" font-family="Hiragino Sans, Noto Sans JP, sans-serif">{out}</text>')

    def arrow(self, x1, y1, x2, y2, color=INK, w=2):
        self.line((x1, y1), (x2, y2), color=color, w=w)
        a = math.atan2(y2 - y1, x2 - x1)
        L = 9
        p1 = (x2 - L * math.cos(a - .4), y2 - L * math.sin(a - .4))
        p2 = (x2 - L * math.cos(a + .4), y2 - L * math.sin(a + .4))
        self.add(f'<polygon points="{x2},{y2} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" fill="{color}"/>')

    # ---- 部品 ----
    def resistor_v(self, x, y1, y2, label=None, side='right'):
        m = (y1 + y2) / 2
        top, bot = m - 22, m + 22
        self.line((x, y1), (x, top))
        pts = [(x, top)]
        for k in range(1, 8):
            pts.append((x + (8 if k % 2 else -8), top + k * 44 / 8))
        pts.append((x, bot))
        self.line(*pts)
        self.line((x, bot), (x, y2))
        if label:
            self.text(x + 14 if side == 'right' else x - 14, m + 5, label, 'start' if side == 'right' else 'end')

    def resistor_h(self, x1, x2, y, label=None):
        m = (x1 + x2) / 2
        l, r = m - 22, m + 22
        self.line((x1, y), (l, y))
        pts = [(l, y)]
        for k in range(1, 8):
            pts.append((l + k * 44 / 8, y + (8 if k % 2 else -8)))
        pts.append((r, y))
        self.line(*pts)
        self.line((r, y), (x2, y))
        if label:
            self.text(m, y - 14, label, 'middle')

    def ground(self, x, y):
        self.line((x, y), (x, y + 8))
        self.line((x - 12, y + 8), (x + 12, y + 8))
        self.line((x - 7, y + 13), (x + 7, y + 13))
        self.line((x - 2, y + 18), (x + 2, y + 18))

    def vdd(self, x, y, label='V_{DD}'):
        self.line((x - 14, y), (x + 14, y), w=2.5)
        self.text(x, y - 8, label, 'middle')

    def mos(self, x, y, kind='n', label=None, gate_label=None):
        """x,y：チャネルの線の中央。G は左、D/S は右上・右下。戻り値は端子の座標"""
        self.line((x, y - 18), (x, y + 18), w=3)            # チャネル
        self.line((x - 8, y - 14), (x - 8, y + 14), w=2.5)  # ゲート電極
        if kind == 'p':
            self.add(f'<circle cx="{x - 13}" cy="{y}" r="5" fill="#fff" stroke="{INK}" stroke-width="2"/>')
            self.line((x - 36, y), (x - 18, y))
        else:
            self.line((x - 36, y), (x - 8, y))
        self.line((x, y - 12), (x + 20, y - 12), (x + 20, y - 34))
        self.line((x, y + 12), (x + 20, y + 12), (x + 20, y + 34))
        if kind == 'n':  # NMOS：ソース側に外向きの矢印
            self.arrow(x + 4, y + 12, x + 17, y + 12)
            top, bot = 'D', 'S'
        else:            # PMOS：ソース側に内向きの矢印（ソースは上）
            self.arrow(x + 17, y - 12, x + 4, y - 12)
            top, bot = 'S', 'D'
        if label:
            self.text(x + 28, y + 5, label, 'start', 13, SUB)
        if gate_label:
            self.text(x - 42, y + 5, gate_label, 'end')
        return {'G': (x - 36, y), top: (x + 20, y - 34), bot: (x + 20, y + 34)}

    def isrc(self, x, y1, y2, label=None, down=True):
        m = (y1 + y2) / 2
        self.line((x, y1), (x, m - 16))
        self.add(f'<circle cx="{x}" cy="{m}" r="16" fill="#fff" stroke="{INK}" stroke-width="2"/>')
        if down:
            self.arrow(x, m - 9, x, m + 9)
        else:
            self.arrow(x, m + 9, x, m - 9)
        self.line((x, m + 16), (x, y2))
        if label:
            self.text(x + 24, m + 5, label)

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}">'
                f'<rect width="{self.w}" height="{self.h}" fill="#fff"/>' + ''.join(self.p) + '</svg>')

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name + '.svg'), 'w') as f:
            f.write(self.svg())


def axes(f, x0, y0, x1, y1, xl, yl):
    f.arrow(x0, y0, x1, y0)
    f.arrow(x0, y0, x0, y1)
    f.text(x1 - 4, y0 + 22, xl, 'end')
    f.text(x0 - 8, y1 + 4, yl, 'end')


# ===== 1. I_D–V_DS 特性 =====
def id_vds():
    f = Fig(420, 290)
    x0, y0 = 60, 240
    axes(f, x0, y0, 400, 30, 'V_{DS}', 'I_{D}')
    sx = 300 / 5.0
    for vov, c in [(1.0, SUB), (1.5, ACC), (2.0, INK)]:
        pts = []
        for k in range(0, 101):
            v = 5.0 * k / 100
            i = (vov - v / 2) * v if v < vov else vov * vov / 2
            pts.append((x0 + v * sx, y0 - i * 95))
        f.line(*pts, color=c, w=2.5)
        f.text(x0 + 5 * sx + 6, y0 - vov * vov / 2 * 95 + 5, f'V_{{GS}}={["小", "中", "大"][[1.0, 1.5, 2.0].index(vov)]}', 'start', 12, c)
    # 境界 V_DS = V_GS - V_T
    pts = [(x0 + v * sx, y0 - v * v / 2 * 95) for v in [k * 2.2 / 40 for k in range(41)]]
    f.line(*pts, color=RED, w=1.8, dash='5 5')
    f.text(x0 + 2.25 * sx, y0 - 2.42 * 95 + 2, 'V_{DS}=V_{GS}−V_{T}', 'middle', 12, RED)
    f.text(x0 + 20, y0 - 20, '線形', 'start', 13, SUB)
    f.text(x0 + 3.2 * sx, y0 - 20, '飽和', 'middle', 13, SUB)
    f.save('id-vds')


# ===== 2. I_D–V_GS 特性（線形＝直線、飽和＝放物線） =====
def id_vgs():
    f = Fig(420, 280)
    x0, y0 = 50, 240
    axes(f, x0, y0, 400, 30, 'V_{GS}', 'I_{D}')
    sx = 330 / 5.0
    vt = 1.0
    f.line((x0 + vt * sx, y0), (x0 + vt * sx, y0 + 6))
    f.text(x0 + vt * sx, y0 + 22, 'V_{T}', 'middle', 13)
    f.line((x0, y0), (x0 + vt * sx, y0), (x0 + 5 * sx, y0 - 110), color=ACC, w=2.5)
    pts = [(x0 + v * sx, y0 - ((v - vt) ** 2) * 13) for v in [vt + k * 4 / 60 for k in range(61)] if ((v - vt) ** 2) * 13 < 205]
    f.line((x0, y0), (x0 + vt * sx, y0), *pts, color=RED, w=2.5)
    f.text(pts[-1][0] - 8, pts[-1][1] + 6, '飽和（2乗で増える）', 'end', 13, RED)
    f.text(x0 + 5 * sx - 4, y0 - 110 + 24, '線形（直線）', 'end', 13, ACC)
    f.save('id-vgs')


# ===== 3. 基板バイアス効果（V_T が右へずれる） =====
def body():
    f = Fig(420, 280)
    x0, y0 = 50, 240
    axes(f, x0, y0, 400, 30, 'V_{GS}', 'I_{D}')
    sx = 330 / 5.0
    for k, (vt, lab, c) in enumerate([(1.0, 'V_{sub}=0', INK), (1.6, 'V_{sub}=−1', ACC), (2.1, 'V_{sub}=−2', RED)]):
        pts = [(x0 + v * sx, y0 - ((v - vt) ** 2) * 22) for v in [vt + j * 3 / 60 for j in range(61)] if ((v - vt) ** 2) * 22 < 150]
        f.line((x0, y0), (x0 + vt * sx, y0), *pts, color=c, w=2.5)
        f.text(330, 40 + k * 20, lab, 'start', 12, c)
        f.line((316, 36 + k * 20), (326, 36 + k * 20), color=c, w=3)
    f.arrow(x0 + 1.3 * sx, y0 - 30, x0 + 2.4 * sx, y0 - 30, color=SUB)
    f.text(x0 + 1.85 * sx, y0 - 38, 'V_{T} が上がる', 'middle', 12, SUB)
    f.save('body')


# ===== 4. ソース接地（抵抗負荷） =====
def cs_res():
    f = Fig(300, 280)
    x = 140
    f.vdd(x + 20, 30)
    t = f.mos(x, 170, 'n', 'M', 'V_{in}')
    f.resistor_v(x + 20, 30, t['D'][1], 'R_{L}')
    f.line(t['D'], (x + 90, t['D'][1]))
    f.dot(*t['D']); f.dot(x + 90, t['D'][1], 4)
    f.text(x + 96, t['D'][1] + 5, 'V_{out}')
    f.ground(*t['S'])
    f.arrow(x + 2, 72, x + 2, 104, color=ACC)
    f.text(x - 4, 94, 'I_{D}', 'end', 13, ACC)
    f.save('cs-res')


# ===== 5. 伝達特性（遮断・飽和・線形） =====
def transfer():
    f = Fig(420, 290)
    x0, y0 = 60, 240
    axes(f, x0, y0, 400, 30, 'V_{in}', 'V_{out}')
    sx, sy = 320 / 3.0, 190 / 3.0
    vdd, vt = 2.8, 0.7
    pts = []
    for k in range(0, 121):
        vi = 3.0 * k / 120
        if vi <= vt:
            vo = vdd
        else:
            vo = max(0.12, vdd - 6.5 * (vi - vt) ** 2) if vi < 1.32 else max(0.12, 0.35 - 0.12 * (vi - 1.32))
        pts.append((x0 + vi * sx, y0 - vo * sy))
    f.line(*pts, color=ACC, w=2.8)
    f.line((x0, y0 - vdd * sy), (x0 - 5, y0 - vdd * sy)); f.text(x0 - 8, y0 - vdd * sy + 5, 'V_{DD}', 'end', 12)
    f.line((x0 + vt * sx, y0), (x0 + vt * sx, y0 + 5)); f.text(x0 + vt * sx, y0 + 20, 'V_{T}', 'middle', 12)
    f.line((x0 + vt * sx, y0), (x0 + 3 * sx, y0 - 2.3 * sy), color=RED, w=1.6, dash='5 5')
    f.text(x0 + 3 * sx - 4, y0 - 2.3 * sy - 8, 'V_{out}=V_{in}−V_{T}', 'end', 12, RED)
    f.text(x0 + 0.3 * sx, y0 - vdd * sy - 12, '遮断', 'middle', 13, SUB)
    f.text(x0 + 1.2 * sx, y0 - 1.6 * sy, '飽和（傾き大）', 'start', 13, SUB)
    f.text(x0 + 2.2 * sx, y0 - 0.25 * sy, '線形', 'middle', 13, SUB)
    f.save('transfer')


# ===== 6. 負帰還のブロック図 =====
def nfb():
    f = Fig(460, 230)
    f.text(20, 74, 'x_{in}')
    f.arrow(52, 70, 106, 70)
    f.add(f'<circle cx="120" cy="70" r="14" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    f.line((112, 70), (128, 70)); f.line((120, 62), (120, 78))
    f.text(100, 58, '+', 'middle', 13); f.text(136, 104, '−', 'middle', 16, RED)
    f.arrow(134, 70, 190, 70)
    f.add(f'<rect x="190" y="44" width="90" height="52" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    f.text(235, 76, 'A', 'middle', 18)
    f.line((280, 70), (360, 70)); f.dot(340, 70)
    f.arrow(360, 70, 400, 70); f.text(406, 75, 'x_{out}')
    f.line((340, 70), (340, 170))
    f.arrow(340, 170, 280, 170)
    f.add(f'<rect x="190" y="146" width="90" height="48" rx="8" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    f.text(235, 176, 'β', 'middle', 18)
    f.line((190, 170), (120, 170))
    f.arrow(120, 170, 120, 84, color=RED)
    f.text(235, 128, 'βx_{out}（帰還）', 'middle', 12, SUB)
    f.text(160, 36, 'x_{in}−βx_{out}', 'middle', 12, SUB)
    f.save('nfb')


# ===== 7. 反転増幅回路 =====
def inv_amp():
    f = Fig(440, 250)
    # OPアンプ
    f.add(f'<polygon points="230,70 230,170 320,120" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    f.text(240, 100, '−', 'start', 18); f.text(240, 156, '+', 'start', 16)
    f.text(30, 99, 'v_{in}')
    f.dot(60, 95)
    f.resistor_h(60, 170, 95, 'R_{1}')
    f.line((170, 95), (230, 95)); f.dot(190, 95)
    f.text(190, 120, 'v_{i}', 'middle', 13, SUB)
    f.line((190, 95), (190, 40)); f.resistor_h(190, 360, 40, 'R_{2}'); f.line((360, 40), (360, 120))
    f.line((320, 120), (400, 120)); f.dot(360, 120); f.dot(400, 120, 4); f.text(406, 125, 'v_{out}')
    f.line((230, 145), (200, 145), (200, 180)); f.ground(200, 180)
    f.text(220, 228, '反転入力（−）は仮想接地で 0 V になる', 'middle', 12, SUB)
    f.save('inv-amp')


# ===== 8. MOSFET の小信号等価回路 =====
def ss_model():
    f = Fig(460, 270)
    f.dot(50, 130); f.text(42, 135, 'G', 'end'); f.text(50, 160, '開放', 'middle', 12, SUB); f.text(50, 176, '（電流なし）', 'middle', 11, SUB)
    top, bot = 50, 220
    f.line((120, top), (380, top)); f.line((120, bot), (380, bot))
    f.dot(250, top); f.dot(250, bot)
    f.text(250, top - 12, 'D（v_{d}）', 'middle'); f.text(250, bot + 26, 'S（v_{s}）', 'middle')
    f.line((250, top - 2), (250, top))
    # 3つの並列
    f.line((150, top), (150, 103)); f.add(f'<circle cx="150" cy="135" r="20" fill="#fff" stroke="{INK}" stroke-width="2"/>'); f.arrow(150, 124, 150, 146); f.line((150, 155), (150, bot))
    f.text(150, 178, 'g_{m}v_{gs}', 'middle', 13, ACC)
    f.resistor_v(250, top, bot, 'r_{0}')
    f.line((350, top), (350, 103)); f.add(f'<circle cx="350" cy="135" r="20" fill="#fff" stroke="{INK}" stroke-width="2"/>'); f.arrow(350, 124, 350, 146); f.line((350, 155), (350, bot))
    f.text(350, 178, '−g_{mb}v_{s}', 'middle', 13, RED)
    f.save('ss-model')


# ===== 9. ソース接地（定電流負荷） =====
def cs_cur():
    f = Fig(300, 290)
    x = 140
    f.vdd(x + 20, 30)
    t = f.mos(x, 200, 'n', 'M', 'V_{IN}')
    f.isrc(x + 20, 30, t['D'][1], 'I_{0}')
    f.line(t['D'], (x + 90, t['D'][1])); f.dot(*t['D']); f.dot(x + 90, t['D'][1], 4)
    f.text(x + 96, t['D'][1] + 5, 'V_{OUT}')
    f.ground(*t['S'])
    f.save('cs-cur')


# ===== 10. ソース接地（PMOS 負荷） =====
def cs_pmos():
    f = Fig(320, 330)
    x = 150
    f.vdd(x + 20, 26)
    p = f.mos(x, 90, 'p', 'M_{2}', '固定電位')
    f.line((x + 20, 26), p['S'])
    n = f.mos(x, 240, 'n', 'M_{1}', 'v_{in}')
    f.line(p['D'], n['D'])
    ym = (p['D'][1] + n['D'][1]) / 2
    f.line((x + 20, ym), (x + 100, ym)); f.dot(x + 20, ym); f.dot(x + 100, ym, 4); f.text(x + 106, ym + 5, 'v_{out}')
    f.ground(*n['S'])
    f.text(x + 50, 130, 'r_{02}', 'start', 12, SUB); f.text(x + 50, 205, 'r_{01}', 'start', 12, SUB)
    f.save('cs-pmos')


# ===== 11. ソースフォロア（ドレイン接地） =====
def sf():
    f = Fig(300, 290)
    x = 140
    f.vdd(x + 20, 40)
    t = f.mos(x, 110, 'n', 'M', 'v_{in}')
    f.line((x + 20, 40), t['D'])
    f.resistor_v(x + 20, t['S'][1], 250, 'R_{L}')
    f.ground(x + 20, 250)
    f.line(t['S'], (x + 100, t['S'][1])); f.dot(*t['S']); f.dot(x + 100, t['S'][1], 4); f.text(x + 106, t['S'][1] + 5, 'v_{out}')
    f.text(150, 282, '出力はソースから（入力とおなじ向きに動く）', 'middle', 12, SUB)
    f.save('sf')


# ===== 12. ゲート接地 =====
def cg():
    f = Fig(320, 300)
    x = 150
    f.vdd(x + 20, 30)
    t = f.mos(x, 180, 'n', 'M', '固定電圧')
    f.resistor_v(x + 20, 30, t['D'][1], 'R_{L}')
    f.line(t['D'], (x + 100, t['D'][1])); f.dot(*t['D']); f.dot(x + 100, t['D'][1], 4); f.text(x + 106, t['D'][1] + 5, 'v_{out}')
    f.line(t['S'], (x + 20, 250), (x - 60, 250)); f.dot(x - 60, 250, 4); f.text(x - 66, 255, 'v_{in}', 'end')
    f.text(160, 288, '入力はソース、ゲートは固定', 'middle', 12, SUB)
    f.save('cg')


# ===== 13. 抵抗の見え方（ゲート接地 MOS の変換機能） =====
def rconv():
    f = Fig(460, 300)
    # 左：ドレイン側から見る（下に R_S）
    x = 90
    t = f.mos(x, 110, 'n', None, '固定')
    f.line(t['D'], (x + 20, 40)); f.dot(x + 20, 40, 4)
    f.arrow(x + 70, 40, x + 28, 40, color=ACC)
    f.text(x + 74, 45, '見ると', 'start', 12, ACC)
    f.resistor_v(x + 20, t['S'][1], 230, 'R_{S}'); f.ground(x + 20, 230)
    f.text(x + 20, 284, '(g_{m}*r_{0}+1)R_{S}（拡大）', 'middle', 13, RED)
    # 右：ソース側から見る（上に R_L）
    x = 320
    f.vdd(x + 20, 30)
    t = f.mos(x, 170, 'n', None, '固定')
    f.resistor_v(x + 20, 30, t['D'][1], 'R_{L}')
    f.line(t['S'], (x + 20, 240)); f.dot(x + 20, 240, 4)
    f.arrow(x + 70, 240, x + 28, 240, color=ACC)
    f.text(x + 74, 245, '見ると', 'start', 12, ACC)
    f.text(x + 10, 284, 'R_{L}/(g_{m}*r_{0})+1/g_{m}*（縮小）', 'middle', 13, RED)
    f.save('rconv')


# ===== 14. カスコード増幅回路 =====
def cascode():
    f = Fig(320, 470)
    x = 150
    f.vdd(x + 20, 24)
    m4 = f.mos(x, 80, 'p', 'M_{4}', '固定')
    f.line((x + 20, 24), m4['S'])
    m3 = f.mos(x, 160, 'p', 'M_{3}', '固定')
    f.line(m4['D'], m3['S'])
    m2 = f.mos(x, 290, 'n', 'M_{2}', '固定')
    ym = (m3['D'][1] + m2['D'][1]) / 2
    f.line(m3['D'], m2['D'])
    f.line((x + 20, ym), (x + 100, ym)); f.dot(x + 20, ym); f.dot(x + 100, ym, 4); f.text(x + 106, ym + 5, 'v_{out}')
    m1 = f.mos(x, 370, 'n', 'M_{1}', 'v_{in}')
    f.line(m2['S'], m1['D'])
    f.ground(*m1['S'])
    f.text(160, 462, 'M_{2}・M_{3} が抵抗を大きく見せる', 'middle', 12, SUB)
    f.save('cascode')


# ===== 15. j を掛けると π/2 回る（複素平面） =====
def jrot():
    f = Fig(320, 300)
    cx, cy, r = 160, 160, 100
    f.arrow(30, cy, 300, cy, color=SUB, w=1.5); f.arrow(cx, 290, cx, 20, color=SUB, w=1.5)
    f.text(296, cy + 20, '実部', 'end', 12, SUB); f.text(cx + 8, 30, '虚部', 'start', 12, SUB)
    f.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{SUB}" stroke-width="1" stroke-dasharray="4 4"/>')
    a = math.radians(25)
    p1 = (cx + r * math.cos(a), cy - r * math.sin(a))
    p2 = (cx + r * math.cos(a + math.pi / 2), cy - r * math.sin(a + math.pi / 2))
    f.arrow(cx, cy, *p1, color=ACC, w=2.5); f.text(p1[0] + 6, p1[1] - 4, 'x+jy', 'start', 13, ACC)
    f.arrow(cx, cy, *p2, color=RED, w=2.5); f.text(p2[0] - 6, p2[1] - 6, '(x+jy)×j = −y+jx', 'end', 13, RED)
    f.path(f'M {cx + 40 * math.cos(a):.1f} {cy - 40 * math.sin(a):.1f} A 40 40 0 0 0 {cx + 40 * math.cos(a + math.pi / 2):.1f} {cy - 40 * math.sin(a + math.pi / 2):.1f}', color=INK, w=1.5)
    f.text(cx + 30, cy - 52, 'π/2', 'start', 13)
    f.save('jrot')


# ===== 16. 矩形波のフーリエ級数 =====
def fourier():
    f = Fig(440, 240)
    x0, y0, W, A = 30, 120, 390, 70
    f.line((x0, y0), (x0 + W, y0), color=SUB, w=1)
    sq = [(x0, y0 - A), (x0 + W / 2, y0 - A), (x0 + W / 2, y0 + A), (x0 + W, y0 + A)]
    f.line(*sq, color=SUB, w=1.5, dash='4 4')
    for n_terms, c in [(1, ACC), (3, GRN), (15, RED)]:
        pts = []
        for k in range(401):
            t = 2 * math.pi * k / 400
            s = sum(math.sin((2 * m + 1) * t) / (2 * m + 1) for m in range(n_terms)) * 4 / math.pi
            pts.append((x0 + W * k / 400, y0 - A * s))
        f.line(*pts, color=c, w=2)
    f.text(x0, 228, '— 1項', 'start', 12, ACC); f.text(x0 + 80, 228, '— 3項', 'start', 12, GRN); f.text(x0 + 160, 228, '— 15項（矩形波に近づく）', 'start', 12, RED)
    f.save('fourier')


# ===== 17. ピンチオフ（断面図） =====
def pinch():
    f = Fig(440, 250)
    f.add(f'<rect x="20" y="90" width="400" height="140" fill="#eef0f8" stroke="{INK}" stroke-width="1.5"/>')
    f.text(400, 220, 'P 型基板', 'end', 12, SUB)
    for x, lab in [(40, 'N⁺（ソース）'), (300, 'N⁺（ドレイン）')]:
        f.add(f'<rect x="{x}" y="90" width="100" height="44" rx="6" fill="#dfe3ff" stroke="{INK}" stroke-width="1.5"/>')
        f.text(x + 50, 117, lab, 'middle', 12)
    f.add(f'<rect x="140" y="78" width="160" height="12" fill="#fff" stroke="{INK}" stroke-width="1.5"/>')
    f.add(f'<rect x="140" y="50" width="160" height="28" rx="4" fill="#c9cdf2" stroke="{INK}" stroke-width="1.5"/>')
    f.text(220, 69, 'ゲート', 'middle', 12)
    # チャネル（ドレイン側で細くなる）
    f.add(f'<path d="M140 90 L250 90 L262 91 L140 104 Z" fill="{ACC}" opacity=".85"/>')
    f.dot(262, 91, 4, RED)
    f.arrow(262, 160, 262, 98, color=RED)
    f.text(262, 178, 'ピンチオフ点（反転電荷 0）', 'middle', 12, RED)
    f.text(160, 124, 'チャネル', 'start', 12, ACC)
    f.text(220, 30, 'V_{DS} を上げるとピンチオフ点がソース側へ動く', 'middle', 12, SUB)
    f.save('pinch')


for fn in [id_vds, id_vgs, body, cs_res, transfer, nfb, inv_amp, ss_model, cs_cur, cs_pmos, sf, cg, rconv, cascode, jrot, fourier, pinch]:
    fn()
print('ok', len(os.listdir(OUT)))
