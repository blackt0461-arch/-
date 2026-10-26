"""コマンドラインと Web アプリで共通の処理の流れ。"""

from __future__ import annotations

from .clips import Clip, collect_clips, load_truth_file
from .fetch import VideoData, fetch_audio
from .log import log


def data_sources(data: VideoData) -> list[str]:
    """解析に使えるデータの説明 (空なら解析不能)。"""
    sources = []
    if data.messages:
        sources.append(f"チャット {len(data.messages)} 件")
    if data.heatmap:
        sources.append("よく再生された部分")
    if data.comments:
        sources.append(f"コメント {len(data.comments)} 件")
    if data.audio_pcm:
        sources.append("音声")
    return sources


def gather_clips(
    data: VideoData,
    workdir: str,
    *,
    search: bool = True,
    max_clips: int = 20,
    match_audio: bool = False,
    extra_urls: list[str] | None = None,
    truth: str | None = None,
) -> tuple[list[Clip], int | None]:
    """評価の正解データ (切り抜き) を集める。Returns: (切り抜き, 調べた候補数)"""
    clips: list[Clip] = []
    searched = None
    if truth:
        clips += load_truth_file(truth, data.duration)
    if (search or extra_urls) and data.video_id:
        stream_pcm = None
        if match_audio:
            stream_pcm = data.audio_pcm or fetch_audio(data.url, workdir, data.video_id)
        found = collect_clips(
            data.video_id, data.title, data.channel, data.duration, data.upload_date,
            workdir, max_clips=max_clips, extra_urls=extra_urls,
            match_audio=match_audio, stream_pcm=stream_pcm,
        )
        clips += found.clips
        searched = found.searched
        if found.unlocated and not match_audio:
            log(f"(元配信に言及しているが位置が書かれていない切り抜きが {len(found.unlocated)} 本ありました。"
                "音声照合を使うと位置を特定できます)")
    elif search:
        log("動画 ID が分からないため切り抜き検索をスキップしました")
    return clips, searched
