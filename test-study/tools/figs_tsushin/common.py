# 通信理論の図の共通部品。各回の図は tools/figs_tsushin/l<N>.py に書いて実行する（出力：data/tsushin/fig/l<N>-*.svg）
#   python3 test-study/tools/figs_tsushin/l1.py
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import figs_denshi1 as _F
from figs_denshi1 import *  # Fig, INK, ACC, RED, GRN, SUB, axes など

_F.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'tsushin', 'fig')


def rect(f, x, y, w, h, stroke=INK, fill='#fff', rx=8, sw=2):
    f.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def circle(f, x, y, r, stroke=INK, fill='#fff', sw=2):
    f.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def box(f, x, y, w, h, label, stroke=INK, fill='#fff', size=14, color=INK):
    """文字入りの四角（ブロック図の箱）。中心に label"""
    rect(f, x, y, w, h, stroke=stroke, fill=fill)
    f.text(x + w / 2, y + h / 2 + size * 0.35, label, 'middle', size, color)


def bits(f, x, y, s, cell=26, fill='#fff', hl=None, hlfill='#ebeafe', size=15):
    """0/1 の列をマス目で描く。hl はぬりつぶすマスの番号の集合"""
    for i, ch in enumerate(s):
        rect(f, x + i * cell, y, cell, cell, fill=hlfill if hl and i in hl else fill, rx=3, sw=1.5)
        f.text(x + i * cell + cell / 2, y + cell / 2 + size * 0.35, ch, 'middle', size)
