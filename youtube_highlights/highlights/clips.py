"""切り抜き動画を集め、「元配信のどこを切り抜いたか」を特定する (評価の正解データ)。

特定方法 (信頼度の高い順):
  1. link        : 概要欄の元配信リンクに付いた時刻 (youtu.be/ID?t=1234 など)
  2. description : 概要欄で元配信に言及した行 (とその前後の行) にある「1:23:45」などの時刻
  3. transcript  : 切り抜きと元配信の自動字幕の照合 (追加のインストール不要)
  4. audio       : 切り抜きと元配信の音声の照合 (音声照合を有効にした時のみ)
  5. manual      : 利用者が正解ファイルで直接指定したもの

候補 1 本ごとに「採用した / 除外した理由」を Candidate として記録し、
レポートの「切り抜き検索の内訳」に表示する (切り抜きが見つからない原因の特定用)。
"""

from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass, field
from urllib.parse import quote

from .log import log as _log
from .signals import extract_timestamps

# 切り抜き 1 本が元配信のどのくらいの長さに対応すると見なすか (時刻リンクしか無い場合)
LINK_SPAN_MAX = 120.0
_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


@dataclass
class Clip:
    video_id: str
    title: str
    url: str
    channel: str = ""
    duration: float = 0.0
    view_count: int = 0
    method: str = ""                                  # link / description / transcript / audio / manual
    intervals: list[tuple[float, float]] = field(default_factory=list)  # 元配信上の区間 (秒)


STATUS_LABEL = {
    "located": "位置を特定",
    "unlocated": "元配信へのリンクはあるが位置が分からない",
    "no_mention": "元配信へのリンクが無く、字幕・音声でも一致しない",
    "older": "元配信より前に投稿された動画",
    "length": "長さが切り抜きらしくない",
    "fetch_error": "動画情報の取得に失敗",
}

METHOD_LABEL = {
    "link": "概要欄の時刻リンク",
    "description": "概要欄の時刻",
    "transcript": "字幕照合",
    "audio": "音声照合",
    "manual": "正解ファイル",
}


@dataclass
class Candidate:
    video_id: str
    title: str
    url: str
    channel: str = ""
    status: str = ""
    detail: str = ""
    query: str = ""


@dataclass
class ClipSearchResult:
    clips: list[Clip] = field(default_factory=list)          # 元配信上の位置が分かった切り抜き
    candidates: list[Candidate] = field(default_factory=list)
    queries: list[tuple[str, int]] = field(default_factory=list)  # (検索語, 件数 or -1=失敗)
    stream_transcript: bool | None = None                    # 元配信に字幕があったか (None=未確認)
    audio: bool = False                                       # 音声照合を使ったか

    @property
    def searched(self) -> int:
        return len(self.candidates)

    @property
    def unlocated(self) -> list[Candidate]:
        return [c for c in self.candidates if c.status == "unlocated"]

    def counts(self) -> Counter:
        return Counter(c.status for c in self.candidates)

    def summary(self) -> str:
        cnt = self.counts()
        parts = [f"{STATUS_LABEL[k]} {cnt[k]} 本" for k in STATUS_LABEL if cnt.get(k)]
        return f"切り抜き候補 {self.searched} 本: " + ("、".join(parts) or "なし")

    def diagnosis(self) -> list[str]:
        """切り抜きが見つからない時に考えられる原因 (利用者向けの説明)。"""
        cnt = self.counts()
        out = []
        if self.queries and all(n <= 0 for _q, n in self.queries):
            out.append("YouTube の検索結果を取得できませんでした (ネット接続または YouTube 側の制限)。")
        if cnt.get("fetch_error") and cnt["fetch_error"] >= max(1, self.searched // 2):
            out.append("多くの候補で動画情報の取得に失敗しました。YouTube にボット判定されている可能性があります。"
                       "時間をおいて試すか、アプリを開き直して取得ツールを更新してください。")
        if cnt.get("unlocated"):
            no_caption = sum(1 for c in self.unlocated if c.detail == "切り抜きに字幕が無い")
            msg = f"元配信へのリンクはあるのに時刻が書かれていない切り抜きが {cnt['unlocated']} 本あります。"
            if self.stream_transcript is False and not self.audio:
                msg += "元配信に自動字幕が無いため字幕照合が使えませんでした。音声照合を有効にすると特定できます。"
            elif no_caption and not self.audio:
                msg += f"うち {no_caption} 本は切り抜き側に字幕が無いため字幕照合できませんでした。音声照合を有効にすると特定できます。"
            else:
                msg += "字幕・音声でも一致しませんでした (切り抜き側が無音・BGM のみ・別撮りの可能性)。"
            out.append(msg)
        if not cnt.get("located") and not cnt.get("unlocated") and self.searched:
            out.append("検索で見つかった動画の中に、この配信の切り抜きが見つかりませんでした。"
                       "知っている切り抜きがあれば、その URL を「切り抜き動画の URL」欄に入れると直接調べます。")
        return out


# ---------------------------------------------------------------------------
# 概要欄の解析
# ---------------------------------------------------------------------------
_T_PARAM = re.compile(r"[?&#](?:t|start)=((?:\d+h)?(?:\d+m)?(?:\d+s?)?)", re.I)
_SOURCE_WORDS = re.compile(r"元配信|元動画|本編|元枠|配信元|source|original|full stream|full vod", re.I)
_RANGE_MARK = re.compile(r"\d:\d{2}\s*(?:[~〜～]|-|から|より)")


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


def locate_from_text(
    text: str, stream_id: str, stream_duration: float, clip_duration: float = 0.0
) -> tuple[list[float], str]:
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
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if stream_id in line or _SOURCE_WORDS.search(line):
            for t in extract_timestamps(line):
                if 0 <= t <= stream_duration:
                    times.append(float(t))
            # 前後の行 (「元配信」の次の行に「1:23:45〜」と書く形式)。切り抜き自身の目次と
            # 区別するため、切り抜きより長い時刻か「〜」などの範囲表記があるものだけ。
            for j in (i - 1, i + 1):
                if 0 <= j < len(lines) and stream_id not in lines[j]:
                    for t in extract_timestamps(lines[j]):
                        if 0 <= t <= stream_duration and (
                            (clip_duration and t > clip_duration + 5) or _RANGE_MARK.search(lines[j])
                        ):
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


def _clean_channel(channel: str) -> str:
    """「○○ Ch. 名前」「名前 / 所属」などからチャンネルの飾りを除く。"""
    c = re.split(r"[/／|｜]", channel)[0]
    c = re.sub(r"[【\[(（].*?[】\])）]", " ", c)
    c = re.sub(r"(?i)\bch\b\.?|\bchannel\b|\bofficial\b|チャンネル|ちゃんねる", " ", c)
    c = re.sub(r"\s+", " ", c).strip()
    return c or channel


def search_queries(stream_id: str, title: str, channel: str) -> list[tuple[str, str]]:
    """(検索語, 並び順) のリスト。date は新しい順 (配信後に投稿された切り抜きを拾いやすい)。"""
    qs = [(stream_id, "relevance"), (f"{_clean_title(title)} 切り抜き", "relevance")]
    if channel:
        name = _clean_channel(channel)
        qs += [(f"{name} 切り抜き", "date"), (f"{name} 切り抜き", "relevance")]
    return qs


def collect_clips(
    stream_id: str,
    title: str,
    channel: str,
    duration: float,
    upload_date: str,
    workdir: str,
    max_clips: int = 20,
    extra_urls: list[str] | None = None,
    match_audio: bool = False,
    stream_pcm: str | None = None,
    stream_url: str | None = None,
    use_transcript: bool = True,
) -> ClipSearchResult:
    """YouTube を検索して切り抜き動画を集め、元配信上の位置を特定する。"""
    from .fetch import _yt_dlp, fetch_audio

    yt_dlp = _yt_dlp()
    result = ClipSearchResult(audio=bool(match_audio and stream_pcm))
    flat_opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    entries: dict[str, dict] = {}
    with yt_dlp.YoutubeDL(flat_opts) as ydl:
        for q, order in search_queries(stream_id, title, channel) if max_clips > 0 else []:
            n = max_clips * (2 if order == "date" else 1)
            try:
                if order == "date":
                    # yt-dlp の ytsearchdate は廃止されたため、検索結果ページを「アップロード日順」(sp=CAI=) で読む
                    url = f"https://www.youtube.com/results?search_query={quote(q)}&sp=CAI%253D"
                    with yt_dlp.YoutubeDL({**flat_opts, "playlistend": n}) as ydl_date:
                        res = ydl_date.extract_info(url, download=False)
                else:
                    res = ydl.extract_info(f"ytsearch{n}:{q}", download=False)
            except Exception as e:  # 検索失敗は致命的ではない
                _log(f"  検索「{q}」に失敗しました: {e}")
                result.queries.append((q, -1))
                continue
            found = [e for e in res.get("entries") or [] if _VIDEO_ID.match(e.get("id") or "")]
            result.queries.append((q, len(found)))
            _log(f"切り抜きを検索「{q}」({'新しい順' if order == 'date' else '関連順'}): {len(found)} 件")
            for e in found:
                if e["id"] != stream_id and e["id"] not in entries:
                    e["_query"] = q
                    entries[e["id"]] = e
    for u in extra_urls or []:
        from .fetch import video_id_from_url
        vid = video_id_from_url(u)
        url = f"https://www.youtube.com/watch?v={vid}" if vid else u
        entries[vid or u] = {"id": vid or u, "url": url, "manual": True, "_query": "手動で追加"}

    index = None
    # 候補を続けて取得するので、YouTube に負担をかけないよう 1 リクエストごとに少し待つ
    full_opts = {"quiet": True, "no_warnings": True, "skip_download": True, "sleep_interval_requests": 0.5}
    audio_budget = max_clips
    errors = 0
    with yt_dlp.YoutubeDL(full_opts) as ydl:
        if use_transcript and entries:
            from .transcript import TranscriptIndex, stream_transcript
            tr = stream_transcript(ydl, stream_url or f"https://www.youtube.com/watch?v={stream_id}",
                                   stream_id, workdir)
            result.stream_transcript = bool(tr)
            index = TranscriptIndex(tr) if tr else None
        total = len(entries)
        for i, (vid, entry) in enumerate(entries.items(), 1):
            url = entry.get("url") or ""
            if not url.startswith("http"):
                url = f"https://www.youtube.com/watch?v={vid}"
            cand = Candidate(video_id=vid, title=entry.get("title") or "", url=url,
                             channel=entry.get("channel") or "", query=entry.get("_query", ""))
            result.candidates.append(cand)
            d = entry.get("duration")
            if not entry.get("manual") and d and (d > max(min(duration, 3600), 60) or d < 5):
                cand.status, cand.detail = "length", f"{int(d)} 秒"
                continue
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                errors += 1
                cand.status, cand.detail = "fetch_error", str(e).replace("ERROR: ", "")[:200]
                continue
            cand.title = info.get("title") or cand.title
            cand.channel = info.get("channel") or info.get("uploader") or cand.channel
            if info.get("id") == stream_id:
                result.candidates.pop()
                continue
            if upload_date and (info.get("upload_date") or "99999999") < upload_date and not entry.get("manual"):
                cand.status, cand.detail = "older", info.get("upload_date") or ""
                continue
            clip = Clip(
                video_id=info.get("id", vid), title=cand.title, url=info.get("webpage_url") or url,
                channel=cand.channel, duration=float(info.get("duration") or 0),
                view_count=int(info.get("view_count") or 0),
            )
            text = (info.get("description") or "") + "\n" + clip.title
            mentions = stream_id in text
            times, method = locate_from_text(text, stream_id, duration, clip.duration)
            if times:
                clip.method, clip.intervals = method, intervals_from_times(times, clip.duration, duration)
            if not clip.intervals and index is not None:
                from .transcript import fetch_transcript
                ctr = fetch_transcript(ydl, info)
                if ctr:
                    clip.intervals = index.match(ctr)
                    clip.method = "transcript" if clip.intervals else ""
                elif mentions:
                    cand.detail = "切り抜きに字幕が無い"
            if not clip.intervals and match_audio and stream_pcm and audio_budget > 0 and (mentions or entry.get("manual")):
                audio_budget -= 1
                clip.intervals = _match_by_audio(clip, workdir, stream_pcm, fetch_audio)
                clip.method = "audio" if clip.intervals else ""
            if clip.intervals:
                result.clips.append(clip)
                cand.status = "located"
                cand.detail = METHOD_LABEL.get(clip.method, clip.method)
                _log(f"  [{i}/{total}] ✓ {clip.title[:40]} ({cand.detail})")
            else:
                cand.status = "unlocated" if mentions else "no_mention"
    if errors:
        _log(f"  {errors} 本の動画情報の取得に失敗しました")
    _log(result.summary())
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
