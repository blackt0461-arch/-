"""切り抜き動画を集め、「元配信のどこを切り抜いたか」を特定する (評価の正解データ)。

特定方法 (信頼度の高い順):
  1. link        : 概要欄の元配信リンクに付いた時刻 (youtu.be/ID?t=1234 など)
  2. description : 概要欄で元配信に言及した行にある「1:23:45」などの時刻
  3. audio       : 切り抜きの音声と元配信の音声の照合 (--match-audio 時のみ)
  4. manual      : 利用者が正解ファイルで直接指定したもの
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from .log import log as _log
from .signals import extract_timestamps

# 切り抜き 1 本が元配信のどのくらいの長さに対応すると見なすか (時刻リンクしか無い場合)
LINK_SPAN_MAX = 120.0


@dataclass
class Clip:
    video_id: str
    title: str
    url: str
    channel: str = ""
    duration: float = 0.0
    view_count: int = 0
    method: str = ""                                  # link / description / audio / manual
    intervals: list[tuple[float, float]] = field(default_factory=list)  # 元配信上の区間 (秒)


@dataclass
class ClipSearchResult:
    clips: list[Clip]          # 元配信上の位置が分かった切り抜き
    searched: int = 0          # 検索で見つかった候補数
    referencing: int = 0       # 元配信に言及していた候補数
    unlocated: list[Clip] = field(default_factory=list)  # 元配信に言及しているが位置不明



# ---------------------------------------------------------------------------
# 概要欄の解析
# ---------------------------------------------------------------------------
_T_PARAM = re.compile(r"[?&#]t=((?:\d+h)?(?:\d+m)?(?:\d+s?)?)", re.I)
_SOURCE_WORDS = re.compile(r"元配信|元動画|本編|元枠|配信元|アーカイブ|source|original|full stream|full vod", re.I)


def parse_t(value: str) -> float | None:
    """t パラメータ (1234 / 1234s / 1h2m3s) を秒に。"""
    if not value:
        return None
    if value.isdigit():
        return float(value)
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", value, re.I)
    if not m or not any(m.groups()):
        return None
    h, mi, s = (int(g or 0) for g in m.groups())
    return float(h * 3600 + mi * 60 + s)


def locate_from_text(text: str, stream_id: str, stream_duration: float) -> tuple[list[float], str]:
    """概要欄などのテキストから、元配信上の時刻を取り出す。

    Returns: (時刻のリスト, 方法)  方法は "link" / "description" / ""
    """
    times: list[float] = []
    # 1. 元配信 ID を含む URL の t パラメータ
    for m in re.finditer(r"\S*" + re.escape(stream_id) + r"\S*", text):
        tm = _T_PARAM.search(m.group(0))
        t = parse_t(tm.group(1)) if tm else None
        if t is not None and 0 <= t <= stream_duration:
            times.append(t)
    if times:
        return sorted(set(times)), "link"
    # 2. 元配信に言及している行 (ID を含む行 or「元配信」等の語を含む行) の時刻表記
    for line in text.splitlines():
        if stream_id in line or _SOURCE_WORDS.search(line):
            for t in extract_timestamps(line):
                if 0 <= t <= stream_duration:
                    times.append(float(t))
    if times:
        return sorted(set(times)), "description"
    return [], ""


def intervals_from_times(times: list[float], clip_duration: float, stream_duration: float) -> list[tuple[float, float]]:
    """時刻だけ分かっている場合、そこから切り抜きの長さ分 (上限 LINK_SPAN_MAX) を区間とする。"""
    span = min(clip_duration or LINK_SPAN_MAX, LINK_SPAN_MAX)
    if len(times) > 1:
        span = min(span, clip_duration / len(times) if clip_duration else span)
    return [(t, min(stream_duration, t + max(span, 15.0))) for t in times]


# ---------------------------------------------------------------------------
# 検索
# ---------------------------------------------------------------------------
def _clean_title(title: str) -> str:
    """【】や #タグ を除き、検索語として使いやすくする。"""
    t = re.sub(r"[【\[].*?[】\]]", " ", title)
    t = re.sub(r"#\S+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return (t or title)[:60]


def search_queries(stream_id: str, title: str, channel: str) -> list[str]:
    qs = [stream_id, f"{_clean_title(title)} 切り抜き"]
    if channel:
        qs.append(f"{channel} 切り抜き")
    return qs


def collect_clips(
    stream_id: str,
    title: str,
    channel: str,
    duration: float,
    upload_date: str,
    workdir: str,
    max_clips: int = 30,
    extra_urls: list[str] | None = None,
    match_audio: bool = False,
    stream_pcm: str | None = None,
) -> ClipSearchResult:
    """YouTube を検索して切り抜き動画を集め、元配信上の位置を特定する。"""
    from .fetch import _yt_dlp, fetch_audio

    yt_dlp = _yt_dlp()
    flat_opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    candidates: dict[str, dict] = {}
    with yt_dlp.YoutubeDL(flat_opts) as ydl:
        for q in search_queries(stream_id, title, channel):
            _log(f"切り抜きを検索中: {q}")
            try:
                res = ydl.extract_info(f"ytsearch{max_clips}:{q}", download=False)
            except Exception as e:  # 検索失敗は致命的ではない
                _log(f"  検索に失敗しました: {e}")
                continue
            for e in res.get("entries") or []:
                vid = e.get("id")
                if not vid or vid == stream_id or vid in candidates:
                    continue
                d = e.get("duration")
                if d and (d > min(duration, 3600) or d < 10):
                    continue  # 元配信より長い・短すぎる動画は切り抜きではない
                candidates[vid] = e
    for u in extra_urls or []:
        candidates.setdefault(u, {"id": u, "url": u, "manual": True})

    result = ClipSearchResult(clips=[], searched=len(candidates))
    full_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    audio_budget = max_clips
    with yt_dlp.YoutubeDL(full_opts) as ydl:
        for i, (vid, entry) in enumerate(candidates.items(), 1):
            url = entry.get("url") or f"https://www.youtube.com/watch?v={vid}"
            if not url.startswith("http"):
                url = f"https://www.youtube.com/watch?v={vid}"
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                _log(f"  [{i}/{len(candidates)}] 取得失敗: {e}")
                continue
            if info.get("id") == stream_id:
                continue
            if upload_date and (info.get("upload_date") or "99999999") < upload_date:
                continue  # 元配信より前の動画
            clip = Clip(
                video_id=info.get("id", vid),
                title=info.get("title", ""),
                url=info.get("webpage_url") or url,
                channel=info.get("channel") or info.get("uploader") or "",
                duration=float(info.get("duration") or 0),
                view_count=int(info.get("view_count") or 0),
            )
            text = (info.get("description") or "") + "\n" + clip.title
            mentions = stream_id in text
            if mentions or entry.get("manual"):
                result.referencing += 1
            times, method = locate_from_text(text, stream_id, duration)
            if times:
                clip.method = method
                clip.intervals = intervals_from_times(times, clip.duration, duration)
            elif match_audio and stream_pcm and audio_budget > 0 and (mentions or entry.get("manual") or clip.duration <= 1200):
                audio_budget -= 1
                clip.intervals = _match_by_audio(clip, workdir, stream_pcm, fetch_audio)
                clip.method = "audio" if clip.intervals else ""
            if clip.intervals:
                result.clips.append(clip)
                _log(f"  [{i}/{len(candidates)}] ✓ {clip.title[:40]} ({clip.method})")
            elif mentions:
                result.unlocated.append(clip)
    return result


def _match_by_audio(clip: Clip, workdir: str, stream_pcm: str, fetch_audio) -> list[tuple[float, float]]:
    from .audiomatch import load_features, match_clip

    clip_dir = os.path.join(workdir, "clips")
    os.makedirs(clip_dir, exist_ok=True)
    pcm = fetch_audio(clip.url, clip_dir, clip.video_id, quiet=True)
    if not pcm:
        return []
    try:
        return match_clip(load_features(stream_pcm), load_features(pcm))
    finally:
        try:
            os.remove(pcm)  # 切り抜きの音声は照合後に不要
        except OSError:
            pass


# ---------------------------------------------------------------------------
# 手動の正解ファイル
# ---------------------------------------------------------------------------
def _parse_time(s: str) -> float:
    s = s.strip()
    if ":" in s:
        parts = [float(p) for p in s.split(":")]
        v = 0.0
        for p in parts:
            v = v * 60 + p
        return v
    return float(s)


def load_truth_file(path: str, stream_duration: float) -> list[Clip]:
    """1 行 1 シーン:  開始[,終了][,メモ]  (時刻は 秒 or 1:23:45 形式)。# で始まる行は無視。"""
    clips = []
    with open(path, encoding="utf-8-sig") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cols = [c.strip() for c in line.split(",")]
            try:
                start = _parse_time(cols[0])
                end = _parse_time(cols[1]) if len(cols) > 1 and cols[1] else start + 30
            except ValueError:
                continue
            note = cols[2] if len(cols) > 2 else f"正解 {n} 行目"
            clips.append(
                Clip(video_id="", title=note, url="", method="manual",
                     intervals=[(start, min(end, stream_duration or end))])
            )
    return clips
