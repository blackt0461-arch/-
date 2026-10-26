"""効果音。著作権の心配がないよう、すべてプログラムで合成する (標準ライブラリのみ)。

利用者が se/ フォルダに「種類名.wav / .mp3 / .ogg」(例: don.mp3) を置けば、そちらを優先して使う。
"""

from __future__ import annotations

import math
import os
import random
import struct
import wave

SR = 44100

# 種類 → 説明
KINDS = {
    "pop": "ポン (軽いツッコミ)",
    "boing": "ボヨン (笑い)",
    "don": "ドン (驚き・衝撃)",
    "whoosh": "シュッ (盛り上がり)",
    "kira": "キラキラ (かわいい・てぇてぇ)",
    "chime": "チーン (拍手・お祝い)",
}

# 反応の種類 → 効果音
CATEGORY_SFX = {
    "laugh": "boing",
    "surprise": "don",
    "hype": "whoosh",
    "cute": "kira",
    "applause": "chime",
    "clip": "pop",
}


def _render(dur: float, fn) -> list[float]:
    return [fn(i / SR) for i in range(int(dur * SR))]


def _pop() -> list[float]:
    phase = 0.0
    out = []
    for i in range(int(0.15 * SR)):
        t = i / SR
        f = 600 + 1400 * (1 - math.exp(-t * 40))
        phase += 2 * math.pi * f / SR
        out.append(math.sin(phase) * math.exp(-t * 25))
    return out


def _boing() -> list[float]:
    phase = 0.0
    out = []
    for i in range(int(0.6 * SR)):
        t = i / SR
        f = 180 + 250 * math.exp(-6 * t) + 120 * math.sin(2 * math.pi * 6 * t) * math.exp(-3 * t)
        phase += 2 * math.pi * f / SR
        out.append((math.sin(phase) + 0.3 * math.sin(2 * phase)) * math.exp(-4 * t))
    return out


def _don() -> list[float]:
    rnd = random.Random(1)
    return _render(0.8, lambda t: math.tanh(1.5 * (
        math.sin(2 * math.pi * 55 * t) * math.exp(-5 * t)
        + 0.5 * math.sin(2 * math.pi * 110 * t) * math.exp(-7 * t)
        + 0.5 * rnd.uniform(-1, 1) * math.exp(-60 * t))))


def _whoosh() -> list[float]:
    rnd = random.Random(2)
    dur = 0.45
    y = 0.0
    out = []
    for i in range(int(dur * SR)):
        t = i / SR
        cutoff = 300 + 5000 * (t / dur)                 # 低い音から高い音へ
        a = 1 - math.exp(-2 * math.pi * cutoff / SR)    # 1 次ローパス
        y += a * (rnd.uniform(-1, 1) - y)
        out.append(y * math.sin(math.pi * t / dur) * 2.5)
    return out


def _kira() -> list[float]:
    notes = [(2093, 0.0), (2637, 0.06), (3136, 0.12), (4186, 0.18)]

    def fn(t):
        v = 0.0
        for f, st in notes:
            if t >= st:
                u = t - st
                v += math.sin(2 * math.pi * f * u) * math.exp(-8 * u) * (0.7 + 0.3 * math.sin(2 * math.pi * 30 * u))
        return v
    return _render(0.7, fn)


def _chime() -> list[float]:
    partials = [(1.0, 1.0, 3), (2.76, 0.5, 5), (5.4, 0.25, 8)]
    return _render(1.2, lambda t: sum(a * math.sin(2 * math.pi * 880 * r * t) * math.exp(-d * t) for r, a, d in partials))


_SYNTH = {"pop": _pop, "boing": _boing, "don": _don, "whoosh": _whoosh, "kira": _kira, "chime": _chime}


def write_wav(path: str, samples: list[float], peak: float = 0.8) -> None:
    m = max((abs(x) for x in samples), default=1.0) or 1.0
    # 立ち上がり・終わりのプチッという音を防ぐ短いフェード
    fade = min(len(samples) // 2, int(0.003 * SR))
    data = bytearray()
    for i, x in enumerate(samples):
        g = 1.0
        if i < fade:
            g = i / fade
        elif i >= len(samples) - fade:
            g = (len(samples) - i) / fade
        data += struct.pack("<h", int(max(-1.0, min(1.0, x / m * peak * g)) * 32767))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(data))


def sfx_path(kind: str, cache_dir: str, user_dir: str | None = None) -> str:
    """効果音ファイルのパス。利用者のファイルがあればそれ、無ければ合成して保存する。"""
    if user_dir and os.path.isdir(user_dir):
        for ext in (".wav", ".mp3", ".ogg", ".m4a"):
            p = os.path.join(user_dir, kind + ext)
            if os.path.exists(p):
                return p
    os.makedirs(cache_dir, exist_ok=True)
    p = os.path.join(cache_dir, f"{kind}.wav")
    if not os.path.exists(p):
        write_wav(p, _SYNTH[kind]())
    return p
