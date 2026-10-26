"""複数シグナルを統合して「面白かったシーン」を検出する。"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Sequence

from .chat import CATEGORY_LABEL, CATEGORY_WEIGHT, ChatMessage, normalize
from .signals import (
    Series,
    audio_series,
    chat_series,
    comment_series,
    global_robust_z,
    heatmap_series,
    rolling_robust_z,
    shift,
    smooth,
)

# シグナルごとの重み (存在するシグナルだけで再正規化して使う)
DEFAULT_WEIGHTS: dict[str, float] = {
    "reaction": 0.35,   # 笑い・驚きなどの反応コメント
    "comments": 0.25,   # コメント欄のタイムスタンプ言及
    "heatmap": 0.20,    # Most Replayed
    "activity": 0.10,   # チャット速度 (ユニーク投稿者数)
    "audio": 0.10,      # 音量の急上昇
    "money": 0.05,      # スパチャ
}

# z スコアの上限。1 つのシグナルだけが極端でも他を圧倒しないようにする。
Z_CAP = 8.0


@dataclass
class Config:
    bin_size: float = 5.0          # 秒
    chat_delay: float = 8.0        # 出来事からチャット反応までの平均遅延 (秒)
    baseline_window: float = 300.0 # ローカルベースラインの幅 (秒)
    min_gap: float = 60.0          # ハイライト同士の最小間隔 (秒)
    pre_roll: float = 10.0         # 出力タイムスタンプを前倒しする秒数 (前振りから見られるように)
    threshold: float = 1.5         # 統合スコアの最低値
    top: int | None = None         # 出力件数 (None なら動画の長さから自動)
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))


@dataclass
class Highlight:
    time: float          # 出力用タイムスタンプ (pre_roll 適用済み)
    peak: float          # スコアが最大の時刻
    start: float         # 盛り上がり区間の開始
    end: float           # 盛り上がり区間の終了
    score: float
    label: str
    reasons: list[str]   # どのシグナルが効いたか
    samples: list[str]   # 代表的なチャット


@dataclass
class Analysis:
    highlights: list[Highlight]
    score: Series
    components: dict[str, Series]
    bin_size: float


def build_components(
    duration: float,
    cfg: Config,
    messages: Sequence[ChatMessage] = (),
    heatmap: Sequence[dict] | None = None,
    comments: Sequence[dict] | None = None,
    audio_pcm: str | None = None,
) -> dict[str, Series]:
    """各シグナルを「ベースラインからの突出度 (z スコア)」に変換して返す。"""
    b = cfg.bin_size
    window = max(3, int(cfg.baseline_window / b))
    delay_bins = int(round(cfg.chat_delay / b))
    comps: dict[str, Series] = {}

    if messages:
        raw = chat_series(messages, duration, b)
        for key in ("reaction", "activity", "money"):
            series = smooth(raw[key], 1)            # ±1 bin (=15 秒窓) で平滑化
            series = shift(series, delay_bins)      # チャット遅延を補正
            if key == "money":
                if sum(series) > 0:
                    comps[key] = rolling_robust_z(series, window)
            else:
                comps[key] = rolling_robust_z(series, window)

    if heatmap:
        hm = heatmap_series(heatmap, duration, b)
        # 冒頭は「最初から再生」する人が多く常に高いので 1% 区間を無視する
        skip = int(len(hm) * 0.01) + 1
        for i in range(min(skip, len(hm))):
            hm[i] = 0.0
        comps["heatmap"] = global_robust_z(hm)

    if comments:
        cs = comment_series(comments, duration, b)
        if sum(cs) > 0:
            # 言及はまばら (ほとんど 0) で MAD が使えないため、対数で最大値基準に正規化する。
            # 分母の下限 log(1+7) により「言及 1 件」は z≈2.7 程度に留まる。
            denom = math.log1p(max(max(cs), 7.0))
            comps["comments"] = [Z_CAP * math.log1p(v) / denom for v in cs]

    if audio_pcm:
        au = audio_series(audio_pcm, duration, b)
        au = smooth(au, 1)
        comps["audio"] = rolling_robust_z(au, max(3, int(60 / b)), count_like=False)

    return {k: [min(Z_CAP, v) for v in s] for k, s in comps.items()}


def combine(components: dict[str, Series], weights: dict[str, float]) -> Series:
    keys = [k for k in components if weights.get(k, 0) > 0]
    if not keys:
        return []
    total = sum(weights[k] for k in keys)
    n = len(next(iter(components.values())))
    score = [0.0] * n
    for k in keys:
        w = weights[k] / total
        for i, v in enumerate(components[k]):
            score[i] += w * v
    # 複数のシグナルが同時に反応している時刻を優遇 (一致ボーナス)
    for i in range(n):
        agreeing = sum(1 for k in keys if components[k][i] >= 2.0)
        if agreeing >= 2:
            score[i] *= 1.0 + 0.15 * (agreeing - 1)
    return score


def pick_peaks(score: Series, cfg: Config, top: int) -> list[int]:
    """局所最大 → 閾値 → 非極大抑制 (NMS) で上位 top 件の bin を返す。"""
    n = len(score)
    cands = [
        i
        for i in range(n)
        if score[i] >= cfg.threshold
        and (i == 0 or score[i] >= score[i - 1])
        and (i == n - 1 or score[i] >= score[i + 1])
    ]
    cands.sort(key=lambda i: score[i], reverse=True)
    gap = max(1, int(cfg.min_gap / cfg.bin_size))
    chosen: list[int] = []
    for i in cands:
        if all(abs(i - j) >= gap for j in chosen):
            chosen.append(i)
            if len(chosen) >= top:
                break
    return sorted(chosen)


def expand_segment(score: Series, peak: int, ratio: float = 0.4, max_bins: int = 18) -> tuple[int, int]:
    """ピークから左右へ、スコアがピークの ratio 倍を下回るまで区間を広げる。"""
    limit = score[peak] * ratio
    lo = peak
    while lo > 0 and peak - lo < max_bins and score[lo - 1] >= limit:
        lo -= 1
    hi = peak
    while hi < len(score) - 1 and hi - peak < max_bins and score[hi + 1] >= limit:
        hi += 1
    return lo, hi


def describe(
    messages: Sequence[ChatMessage], start: float, end: float, delay: float
) -> tuple[str | None, list[str]]:
    """区間内 (チャットは遅延分だけ後ろにずらして見る) の反応から、ラベルと代表チャットを決める。"""
    cat_score: Counter[str] = Counter()
    texts: Counter[str] = Counter()
    for m in messages:
        if start <= m.time - delay <= end + 5 and m.reactions:
            for c, v in m.reactions.items():
                cat_score[c] += CATEGORY_WEIGHT[c] * v
            t = normalize(m.text)
            if 0 < len(t) <= 25:
                texts[t] += 1
    label = CATEGORY_LABEL[cat_score.most_common(1)[0][0]] if cat_score else None
    samples = [t for t, _ in texts.most_common(3)]
    return label, samples


REASON_LABEL = {
    "reaction": "チャットの反応",
    "activity": "チャット速度",
    "money": "スパチャ",
    "heatmap": "よく再生されている",
    "comments": "コメント欄で言及",
    "audio": "音量の急上昇",
}


def auto_top(duration: float) -> int:
    """10 分に 1 件程度、3〜20 件。"""
    return max(3, min(20, round(duration / 600)))


def analyze(
    duration: float,
    cfg: Config | None = None,
    messages: Sequence[ChatMessage] = (),
    heatmap: Sequence[dict] | None = None,
    comments: Sequence[dict] | None = None,
    audio_pcm: str | None = None,
) -> Analysis:
    cfg = cfg or Config()
    comps = build_components(duration, cfg, messages, heatmap, comments, audio_pcm)
    score = combine(comps, cfg.weights)
    if not score:
        return Analysis([], [], comps, cfg.bin_size)
    b = cfg.bin_size
    top = cfg.top or auto_top(duration)
    highlights = []
    for p in pick_peaks(score, cfg, top):
        lo, hi = expand_segment(score, p)
        start, end = lo * b, (hi + 1) * b
        reasons = sorted(
            (k for k in comps if comps[k][p] >= 1.5),
            key=lambda k: comps[k][p] * cfg.weights.get(k, 0),
            reverse=True,
        )
        label, samples = describe(messages, start, end, cfg.chat_delay)
        if label is None:
            label = "📈 注目シーン"
        highlights.append(
            Highlight(
                time=max(0.0, start - cfg.pre_roll),
                peak=p * b,
                start=start,
                end=min(duration, end),
                score=score[p],
                label=label,
                reasons=[REASON_LABEL[k] for k in reasons],
                samples=samples,
            )
        )
    return Analysis(highlights, score, comps, b)
