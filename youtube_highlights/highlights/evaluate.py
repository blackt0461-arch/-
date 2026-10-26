"""検出したタイムスタンプと、実際に切り抜かれた場面との照合 (正確性の評価)。

指標
  適合率 (precision) : 検出したシーンのうち、実際に切り抜かれていた割合
  再現率 (recall)    : 切り抜かれた場面のうち、検出できた割合
  F1                 : 適合率と再現率の調和平均
  ランダム比 (lift)  : 適合率 ÷ 「同じ件数をランダムな時刻に置いた時の期待適合率」
                       1.0 ならランダムと同じ、3.0 ならランダムの 3 倍当たっている
  タイミング誤差     : 当たったシーンで、出力時刻と切り抜き開始のずれ (中央値)
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Sequence

from .clips import Clip
from .detect import Highlight


@dataclass
class Scene:
    """実際に切り抜かれた場面 (複数の切り抜きが同じ場面を使っていれば 1 つにまとめる)。"""
    start: float
    end: float
    clips: list[Clip] = field(default_factory=list)

    @property
    def n_clips(self) -> int:
        return len({c.video_id or c.title for c in self.clips})

    @property
    def views(self) -> int:
        return sum(c.view_count for c in {id(c): c for c in self.clips}.values())


@dataclass
class HighlightResult:
    highlight: Highlight
    rank: int                       # スコア順位 (1 始まり)
    scenes: list[int]               # 当たった Scene の番号
    offset: float | None = None     # 出力時刻 − 切り抜き開始 (秒)


@dataclass
class Evaluation:
    results: list[HighlightResult]
    scenes: list[Scene]
    covered: list[bool]             # 各 Scene が検出されたか
    precision: float
    recall: float
    f1: float
    weighted_recall: float          # 切り抜き本数で重み付けした再現率
    baseline_precision: float
    lift: float
    median_abs_offset: float | None
    precision_at: dict[int, float]  # 上位 k 件の適合率
    tolerance: float
    time_precision: float = 0.0     # 検出区間の長さのうち、切り抜かれた区間と重なる割合
    time_recall: float = 0.0        # 切り抜かれた区間の長さのうち、検出区間と重なる割合
    excluded: list[Clip] = field(default_factory=list)  # 長すぎて評価から外した「まとめ動画」


def build_scenes(clips: Sequence[Clip], merge_gap: float = 20.0) -> list[Scene]:
    items = sorted(((s, e, c) for c in clips for s, e in c.intervals), key=lambda x: x[0])
    scenes: list[Scene] = []
    for s, e, c in items:
        if scenes and s <= scenes[-1].end + merge_gap:
            scenes[-1].end = max(scenes[-1].end, e)
            scenes[-1].clips.append(c)
        else:
            scenes.append(Scene(s, e, [c]))
    return scenes


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _union_length(intervals: list[tuple[float, float]]) -> float:
    total, cur_s, cur_e = 0.0, None, None
    for s, e in sorted(intervals):
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                total += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        total += cur_e - cur_s
    return total


# 元配信の合計この秒数より長い範囲を使った切り抜きは「まとめ動画」とみなし、評価に使わない。
# (数十分のまとめ動画が混ざると配信のほぼ全体が「切り抜かれた場面」になり、何でも当たりになるため)
MAX_CLIP_SPAN = 600.0


def _intersection(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> float:
    total = 0.0
    for s0, e0 in _union(a):
        for s1, e1 in _union(b):
            total += _overlap(s0, e0, s1, e1)
    return total


def _union(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def evaluate(
    highlights: Sequence[Highlight],
    clips: Sequence[Clip],
    duration: float,
    tolerance: float = 30.0,
    max_clip_span: float = MAX_CLIP_SPAN,
) -> Evaluation:
    """highlight の判定窓 [出力時刻 − tol, 区間終了 + tol] が切り抜き場面と重なれば「当たり」。"""
    excluded = [c for c in clips if sum(e - s for s, e in c.intervals) > max_clip_span]
    clips = [c for c in clips if c not in excluded]
    scenes = build_scenes(clips)
    by_score = sorted(range(len(highlights)), key=lambda i: highlights[i].score, reverse=True)
    rank = {i: r + 1 for r, i in enumerate(by_score)}

    results = []
    covered = [False] * len(scenes)
    for i, h in enumerate(highlights):
        w0, w1 = h.time - tolerance, h.end + tolerance
        hit = [j for j, sc in enumerate(scenes) if _overlap(w0, w1, sc.start, sc.end) > 0]
        offset = None
        if hit:
            best = max(hit, key=lambda j: _overlap(h.time, h.end, scenes[j].start, scenes[j].end))
            offset = h.time - scenes[best].start
            for j in hit:
                covered[j] = True
        results.append(HighlightResult(h, rank[i], hit, offset))

    n_hit = sum(1 for r in results if r.scenes)
    precision = n_hit / len(results) if results else 0.0
    recall = sum(covered) / len(scenes) if scenes else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    total_w = sum(sc.n_clips for sc in scenes)
    weighted_recall = sum(sc.n_clips for sc, c in zip(scenes, covered) if c) / total_w if total_w else 0.0

    # ランダムに置いた場合の期待適合率: 出力時刻 x が当たりになる x の範囲の総長 / 動画の長さ
    seg = statistics.mean(h.end - h.time for h in highlights) if highlights else 0.0
    hit_zone = [
        (max(0.0, sc.start - seg - tolerance), min(duration, sc.end + tolerance)) for sc in scenes
    ]
    baseline = min(1.0, _union_length(hit_zone) / duration) if duration and scenes else 0.0
    lift = precision / baseline if baseline > 0 else math.nan

    offsets = [abs(r.offset) for r in results if r.offset is not None]
    ranked = sorted(results, key=lambda r: r.rank)
    precision_at = {}
    for k in (3, 5, 10, 20):
        if k <= len(ranked):
            precision_at[k] = sum(1 for r in ranked[:k] if r.scenes) / k

    det = [(h.start, h.end) for h in highlights]
    truth = [(sc.start, sc.end) for sc in scenes]
    return Evaluation(
        results=results,
        scenes=scenes,
        covered=covered,
        precision=precision,
        recall=recall,
        f1=f1,
        weighted_recall=weighted_recall,
        baseline_precision=baseline,
        lift=lift,
        median_abs_offset=statistics.median(offsets) if offsets else None,
        precision_at=precision_at,
        tolerance=tolerance,
        time_precision=_intersection(det, truth) / max(1e-9, _union_length(det)) if det and truth else 0.0,
        time_recall=_intersection(det, truth) / max(1e-9, _union_length(truth)) if det and truth else 0.0,
        excluded=excluded,
    )


def to_text(ev: Evaluation, searched: int | None = None) -> str:
    from .report import fmt_time

    pct = lambda v: f"{v * 100:.0f}%"  # noqa: E731
    lines = ["", "===== 正確性の評価 (実際の切り抜きとの照合) ====="]
    if searched is not None:
        lines.append(f"切り抜き候補 {searched} 本を調べ、元配信上の位置が分かった切り抜き "
                     f"{len({id(c) for s in ev.scenes for c in s.clips})} 本 → 切り抜かれた場面 {len(ev.scenes)} か所")
    if not ev.scenes:
        lines.append("位置が分かる切り抜きが見つからなかったため評価できません。")
        lines.append("(--match-audio で音声照合を使うか、--truth で正解ファイルを指定してください)")
        return "\n".join(lines)
    n_hit = sum(1 for r in ev.results if r.scenes)
    lines += [
        f"適合率 : {pct(ev.precision)}  ({n_hit}/{len(ev.results)} 件が実際に切り抜かれていた)",
        f"再現率 : {pct(ev.recall)}  ({sum(ev.covered)}/{len(ev.scenes)} か所の切り抜き場面を検出)"
        f"  / 切り抜き本数で重み付け {pct(ev.weighted_recall)}",
        f"F1     : {ev.f1:.2f}",
        f"ランダム比: {ev.lift:.1f} 倍  (ランダムな時刻を選んだ場合の適合率 {pct(ev.baseline_precision)})"
        if not math.isnan(ev.lift) else "ランダム比: -",
    ]
    lines.append(f"時間の重なり: 検出区間の {pct(ev.time_precision)} が切り抜き区間と重なり、"
                 f"切り抜き区間の {pct(ev.time_recall)} を検出区間がカバー")
    if ev.median_abs_offset is not None:
        lines.append(f"タイミング誤差: 中央値 {ev.median_abs_offset:.0f} 秒")
    if ev.excluded:
        lines.append(f"(元配信の {MAX_CLIP_SPAN / 60:.0f} 分以上を使った「まとめ動画」{len(ev.excluded)} 本は評価から除外)")
    if ev.precision_at:
        lines.append("上位 k 件の適合率: " + "  ".join(f"@{k}={pct(v)}" for k, v in ev.precision_at.items()))
    lines.append(f"(判定: 検出区間の前後 {ev.tolerance:.0f} 秒以内に切り抜き場面があれば当たり)")
    lines.append("")
    for r in ev.results:
        mark = "✅" if r.scenes else "❌"
        h = r.highlight
        extra = ""
        if r.scenes:
            n = sum(ev.scenes[j].n_clips for j in r.scenes)
            extra = f"  切り抜き {n} 本"
        lines.append(f"{mark} {fmt_time(h.time)} {h.label}  (スコア {r.rank} 位){extra}")
    missed = [sc for sc, c in zip(ev.scenes, ev.covered) if not c]
    if missed:
        lines.append("")
        lines.append("見逃した切り抜き場面 (切り抜き本数の多い順):")
        for sc in sorted(missed, key=lambda s: -s.n_clips)[:10]:
            lines.append(f"   {fmt_time(sc.start)}-{fmt_time(sc.end)}  切り抜き {sc.n_clips} 本"
                         f"  例: {sc.clips[0].title[:40]}")
    return "\n".join(lines)
