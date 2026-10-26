"""検出結果の出力 (YouTube コメントにそのまま貼れるテキスト / JSON)。"""

from __future__ import annotations

import json
import re

from .detect import Analysis


def fmt_time(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def link(url: str, video_id: str, seconds: float) -> str:
    base = f"https://youtu.be/{video_id}" if video_id else re.sub(r"[?&]t=\d+s?", "", url)
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}t={int(seconds)}"


def to_text(analysis: Analysis, title: str, url: str, video_id: str, verbose: bool = False) -> str:
    lines = []
    if title:
        lines.append(f"■ {title}")
    if not analysis.highlights:
        lines.append("目立った盛り上がりは見つかりませんでした (--threshold を下げてみてください)")
        return "\n".join(lines)
    lines.append(f"面白かったシーン {len(analysis.highlights)} 件")
    lines.append("")
    for h in analysis.highlights:
        line = f"{fmt_time(h.time)} {h.label}"
        if h.samples:
            line += "「" + "」「".join(h.samples) + "」"
        lines.append(line)
        if verbose:
            lines.append(
                f"    score={h.score:.2f}  区間 {fmt_time(h.start)}-{fmt_time(h.end)}"
                f"  根拠: {', '.join(h.reasons) or '-'}"
            )
            if url or video_id:
                lines.append(f"    {link(url, video_id, h.time)}")
    return "\n".join(lines)


def to_json(analysis: Analysis, title: str, url: str, video_id: str) -> str:
    return json.dumps(
        {
            "title": title,
            "url": url,
            "highlights": [
                {
                    "timestamp": fmt_time(h.time),
                    "seconds": round(h.time, 1),
                    "peak_seconds": round(h.peak, 1),
                    "segment": [round(h.start, 1), round(h.end, 1)],
                    "score": round(h.score, 3),
                    "label": h.label,
                    "reasons": h.reasons,
                    "sample_chat": h.samples,
                    "link": link(url, video_id, h.time) if (url or video_id) else None,
                }
                for h in analysis.highlights
            ],
        },
        ensure_ascii=False,
        indent=2,
    )


def to_csv_curve(analysis: Analysis) -> str:
    """スコア曲線 (デバッグ・可視化用)。"""
    keys = sorted(analysis.components)
    rows = ["seconds,score," + ",".join(keys)]
    for i, s in enumerate(analysis.score):
        vals = [f"{analysis.components[k][i]:.3f}" for k in keys]
        rows.append(f"{i * analysis.bin_size:.0f},{s:.3f}," + ",".join(vals))
    return "\n".join(rows)
