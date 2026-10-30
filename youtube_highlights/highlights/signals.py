"""時系列シグナルの生成と正規化。

すべてのシグナルは「bin_size 秒ごとの値の配列」として扱う。
外部依存を避けるため純 Python で実装している (配信 3 時間 / 5 秒 bin でも 2160 点なので十分高速)。
"""

from __future__ import annotations

import bisect
import math
import re
from typing import Sequence

from .chat import ChatMessage, amount_weight, classify, reaction_value

Series = list[float]


# ---------------------------------------------------------------------------
# 基本演算
# ---------------------------------------------------------------------------
def n_bins(duration: float, bin_size: float) -> int:
    return max(1, int(math.ceil(duration / bin_size)))


def smooth(xs: Sequence[float], radius: int) -> Series:
    """中心移動平均 (半径 radius bin)。"""
    if radius <= 0:
        return list(xs)
    n = len(xs)
    prefix = [0.0]
    for x in xs:
        prefix.append(prefix[-1] + x)
    out = []
    for i in range(n):
        lo, hi = max(0, i - radius), min(n, i + radius + 1)
        out.append((prefix[hi] - prefix[lo]) / (hi - lo))
    return out


def shift(xs: Sequence[float], bins: int) -> Series:
    """配列を bins だけ過去方向へずらす (チャット遅延の補正)。"""
    if bins <= 0:
        return list(xs)
    return list(xs[bins:]) + [0.0] * min(bins, len(xs))


def _median(sorted_xs: Sequence[float]) -> float:
    n = len(sorted_xs)
    if n == 0:
        return 0.0
    m = n // 2
    return sorted_xs[m] if n % 2 else 0.5 * (sorted_xs[m - 1] + sorted_xs[m])


def rolling_robust_z(xs: Sequence[float], window: int, count_like: bool = True) -> Series:
    """局所ベースラインに対するロバスト z スコア。

    z_i = (x_i - median_W(i)) / scale_W(i)
      median_W : 前後 window bin の中央値 (=その時間帯の「普段」の盛り上がり)
      scale_W  : max(1.4826 * MAD_W, sqrt(median_W + 1))   ※ count_like の場合
                 1.4826*MAD は正規分布の σ 相当。sqrt(μ+1) はポアソン揺らぎの下限で、
                 チャットが少ない時間帯に 0→2 件程度の変化で z が暴れるのを防ぐ。
    負の値 (普段より静か) は 0 に切り詰める。
    """
    n = len(xs)
    if n == 0:
        return []
    half = max(1, window // 2)
    out: Series = []
    # スライディングウィンドウを sorted list で保持 (O(n * window) だが十分速い)
    lo, hi = 0, min(n, half + 1)
    win = sorted(xs[lo:hi])
    for i in range(n):
        new_lo, new_hi = max(0, i - half), min(n, i + half + 1)
        while hi < new_hi:
            bisect.insort(win, xs[hi])
            hi += 1
        while lo < new_lo:
            del win[bisect.bisect_left(win, xs[lo])]
            lo += 1
        med = _median(win)
        mad = _median(sorted(abs(v - med) for v in win))
        scale = 1.4826 * mad
        if count_like:
            scale = max(scale, math.sqrt(med + 1.0))
        else:
            scale = max(scale, 1e-6)
        out.append(max(0.0, (xs[i] - med) / scale))
    return out


def global_robust_z(xs: Sequence[float]) -> Series:
    s = sorted(xs)
    med = _median(s)
    mad = _median(sorted(abs(v - med) for v in s))
    scale = 1.4826 * mad
    if scale <= 1e-9:
        # 値がほぼ一定 -> 標準偏差で代用
        mean = sum(xs) / len(xs)
        var = sum((v - mean) ** 2 for v in xs) / len(xs)
        scale = math.sqrt(var) or 1.0
    return [max(0.0, (v - med) / scale) for v in xs]


# ---------------------------------------------------------------------------
# チャット由来のシグナル
# ---------------------------------------------------------------------------
def chat_series(messages: Sequence[ChatMessage], duration: float, bin_size: float) -> dict[str, Series]:
    """チャットから 3 種類の時系列を作る。

    activity : bin 内のユニーク投稿者数 (連投スパムに強い「チャット速度」)
    reaction : 投稿者ごとに bin 内最大の反応値を取り、合計したもの
    money    : スパチャ・メンバー加入の重み (金額は対数圧縮)
    """
    nb = n_bins(duration, bin_size)
    authors: list[set[str]] = [set() for _ in range(nb)]
    best: list[dict[str, float]] = [{} for _ in range(nb)]
    money = [0.0] * nb
    for m in messages:
        b = int(m.time // bin_size)
        if b < 0 or b >= nb:
            continue
        authors[b].add(m.author)
        r = reaction_value(m.reactions)
        if r > best[b].get(m.author, 0.0):
            best[b][m.author] = r
        if m.kind == "paid":
            money[b] += 1.0 + amount_weight(m.amount)
        elif m.kind == "member":
            money[b] += 1.0
    return {
        "activity": [float(len(a)) for a in authors],
        "reaction": [sum(d.values()) for d in best],
        "money": money,
    }


# ---------------------------------------------------------------------------
# Most Replayed (再生回数ヒートマップ)
# ---------------------------------------------------------------------------
def heatmap_series(heatmap: Sequence[dict], duration: float, bin_size: float) -> Series:
    """yt-dlp の info['heatmap'] (start_time/end_time/value) を bin に展開する。"""
    nb = n_bins(duration, bin_size)
    out = [0.0] * nb
    for seg in heatmap:
        s, e, v = float(seg["start_time"]), float(seg["end_time"]), float(seg["value"])
        for b in range(int(s // bin_size), min(nb, int(math.ceil(e / bin_size)))):
            out[b] = max(out[b], v)
    return out


# ---------------------------------------------------------------------------
# コメント欄のタイムスタンプ
# ---------------------------------------------------------------------------
_TS = re.compile(r"(?<![\d:])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?![\d:])")


def extract_timestamps(text: str) -> list[float]:
    out = []
    for h, m, s in _TS.findall(text or ""):
        mm, ss = int(m), int(s)
        if ss >= 60 or (h and mm >= 60):
            continue
        out.append(int(h or 0) * 3600 + mm * 60 + ss)
    return out


def comment_series(
    comments: Sequence[dict], duration: float, bin_size: float, sigma: float = 10.0
) -> Series:
    """視聴者コメント中の「12:34」等の言及を、ガウス核で時系列に変換する。

    重み = (1 + log(1 + いいね数)) / sqrt(1 コメント内のタイムスタンプ数)
           × 1.5 (コメント本文に笑い・驚き等の反応語がある場合)
    タイムスタンプを大量に並べた「目次コメント」は 1 件あたりの重みが下がる。
    """
    nb = n_bins(duration, bin_size)
    out = [0.0] * nb
    radius = int(math.ceil(3 * sigma / bin_size))
    for c in comments:
        text = c.get("text") or ""
        stamps = [t for t in extract_timestamps(text) if 0 <= t <= duration]
        if not stamps:
            continue
        likes = c.get("like_count") or 0
        w = (1.0 + math.log1p(max(likes, 0))) / math.sqrt(len(stamps))
        if classify(text):
            w *= 1.5
        for t in stamps:
            center = t / bin_size
            cb = int(center)
            for b in range(max(0, cb - radius), min(nb, cb + radius + 1)):
                d = (b + 0.5 - center) * bin_size
                out[b] += w * math.exp(-0.5 * (d / sigma) ** 2)
    return out


# ---------------------------------------------------------------------------
# 音声 (任意)
# ---------------------------------------------------------------------------
def audio_series(pcm_path: str, duration: float, bin_size: float, sample_rate: int = 8000) -> Series:
    """16bit mono PCM (raw) から bin ごとのラウドネス (dB) を求める。numpy が必要。

    単純な音量ではなく「短時間の音量 - 直前 60 秒の音量」を後段の rolling z で
    評価するため、ここでは dB 値をそのまま返す。
    """
    import numpy as np  # 音声解析を使う時だけ必要

    data = np.fromfile(pcm_path, dtype="<i2").astype(np.float32) / 32768.0
    per_bin = int(sample_rate * bin_size)
    nb = n_bins(duration, bin_size)
    out = [0.0] * nb
    for b in range(nb):
        chunk = data[b * per_bin : (b + 1) * per_bin]
        if chunk.size == 0:
            break
        rms = float(np.sqrt(np.mean(chunk * chunk)) + 1e-9)
        out[b] = 20.0 * math.log10(rms) + 90.0  # 正の範囲に寄せる
    return out
