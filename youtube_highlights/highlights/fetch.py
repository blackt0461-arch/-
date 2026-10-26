"""yt-dlp を使った動画情報・ライブチャット・コメント・音声の取得。"""

from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field

from .chat import ChatMessage, load_live_chat
from .log import log as _log


@dataclass
class VideoData:
    url: str
    video_id: str
    title: str
    duration: float
    channel: str = ""
    upload_date: str = ""       # YYYYMMDD
    messages: list[ChatMessage] = field(default_factory=list)
    heatmap: list[dict] | None = None
    comments: list[dict] | None = None
    audio_pcm: str | None = None



def _yt_dlp():
    try:
        import yt_dlp
    except ImportError:
        sys.exit("yt-dlp が必要です: pip install yt-dlp")
    return yt_dlp


_ID_PATTERNS = [
    re.compile(r"(?:v=|youtu\.be/|/live/|/shorts/|/embed/)([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),
]


def video_id_from_url(url: str) -> str | None:
    for pat in _ID_PATTERNS:
        m = pat.search(url.strip())
        if m:
            return m.group(1)
    return None


def fetch(
    url: str,
    workdir: str,
    use_chat: bool = True,
    max_comments: int = 500,
    use_audio: bool = False,
) -> VideoData:
    os.makedirs(workdir, exist_ok=True)
    vid = video_id_from_url(url)
    cached = os.path.join(workdir, f"{vid}.info.json") if vid else None
    if cached and os.path.exists(cached):
        # 2 回目以降は保存済みデータを使う (再取得したい時は workdir のファイルを消す)
        _log(f"保存済みデータを使用: {cached}")
        with open(cached, encoding="utf-8") as f:
            info = json.load(f)
    else:
        info = _download_info(url, workdir, use_chat, max_comments)
    return _assemble(info, url, workdir, use_chat, use_audio)


def _download_info(url: str, workdir: str, use_chat: bool, max_comments: int) -> dict:
    yt_dlp = _yt_dlp()
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "outtmpl": os.path.join(workdir, "%(id)s.%(ext)s"),
        "writesubtitles": use_chat,
        "subtitleslangs": ["live_chat"],
        "getcomments": max_comments > 0,
        "extractor_args": {
            "youtube": {"max_comments": [str(max_comments)], "comment_sort": ["top"]}
        },
    }
    _log("動画情報を取得中..." + (" (コメント取得のため時間がかかります)" if max_comments else ""))
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        info = ydl.sanitize_info(info)

    with open(os.path.join(workdir, f"{info['id']}.info.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False)
    return info


def _assemble(info: dict, url: str, workdir: str, use_chat: bool, use_audio: bool) -> VideoData:
    data = from_info(info, url)
    if use_chat:
        chat_files = glob.glob(os.path.join(workdir, f"{info['id']}*.live_chat.json"))
        if chat_files:
            _log("ライブチャットを解析中...")
            data.messages = load_live_chat(chat_files[0])
        else:
            _log("ライブチャットのリプレイが見つかりませんでした (通常動画 or チャット無効)")

    if use_audio:
        data.audio_pcm = fetch_audio(url, workdir, info["id"])
    return data


def from_info(info: dict, url: str | None = None) -> VideoData:
    """info.json (yt-dlp の -J / --write-info-json 出力) から VideoData を作る。"""
    duration = float(info.get("duration") or 0)
    comments = info.get("comments")
    return VideoData(
        url=url or info.get("webpage_url") or f"https://www.youtube.com/watch?v={info.get('id')}",
        video_id=info.get("id", ""),
        title=info.get("title", ""),
        duration=duration,
        channel=info.get("channel") or info.get("uploader") or "",
        upload_date=info.get("upload_date") or "",
        heatmap=info.get("heatmap"),
        comments=comments,
    )


def fetch_audio(
    url: str, workdir: str, video_id: str, sample_rate: int = 8000, quiet: bool = False
) -> str | None:
    """音声のみをダウンロードし、ffmpeg で 8kHz/mono/16bit の raw PCM に変換する。"""
    yt_dlp = _yt_dlp()
    pcm = os.path.join(workdir, f"{video_id}.pcm")
    if os.path.exists(pcm):
        return pcm
    if not quiet:
        _log("音声をダウンロード中...")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "worstaudio/bestaudio/worst",
        "outtmpl": os.path.join(workdir, f"{video_id}.audio.%(ext)s"),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    src = glob.glob(os.path.join(workdir, f"{video_id}.audio.*"))
    if not src:
        _log("音声の取得に失敗しました。音声解析をスキップします")
        return None
    if not quiet:
        _log("音声を解析用に変換中 (ffmpeg)...")
    try:
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", src[0],
             "-ac", "1", "-ar", str(sample_rate), "-f", "s16le", pcm],
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as e:
        _log(f"ffmpeg による変換に失敗しました ({e})。音声解析をスキップします")
        return None
    for f in src:  # 元の音声ファイルは不要なので消す
        os.remove(f)
    return pcm
