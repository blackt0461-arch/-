"""コマンドラインエントリポイント。"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

from .chat import load_live_chat
from .detect import DEFAULT_WEIGHTS, Config, analyze
from .fetch import fetch, from_info
from .report import to_csv_curve, to_json, to_text


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="highlights",
        description="YouTube 配信アーカイブから「面白かったシーン」のタイムスタンプを抽出します。",
    )
    p.add_argument("url", nargs="?", help="YouTube の動画/配信 URL")
    p.add_argument("-n", "--top", type=int, help="出力件数 (既定: 10 分に 1 件程度)")
    p.add_argument("-f", "--format", choices=["text", "json"], default="text")
    p.add_argument("-v", "--verbose", action="store_true", help="スコア・根拠・リンクも表示")
    p.add_argument("--audio", action="store_true", help="音声もダウンロードして音量の急上昇を使う (ffmpeg, numpy 必須)")
    p.add_argument("--no-chat", action="store_true", help="ライブチャットを使わない")
    p.add_argument("--max-comments", type=int, default=500, help="取得するコメント数 (0 で無効, 既定 500)")
    p.add_argument("--workdir", help="取得データの保存先 (既定: 一時ディレクトリ)")
    p.add_argument("--info-json", help="オフライン解析: yt-dlp の info.json")
    p.add_argument("--chat-file", help="オフライン解析: yt-dlp の live_chat.json")
    p.add_argument("--duration", type=float, help="動画の長さ(秒)。info.json が無い場合に指定")
    p.add_argument("--curve", help="スコア曲線を CSV で書き出すパス")

    g = p.add_argument_group("アルゴリズムの調整")
    g.add_argument("--bin", type=float, default=5.0, help="時間分解能 秒 (既定 5)")
    g.add_argument("--chat-delay", type=float, default=8.0, help="チャット反応の遅延 秒 (既定 8)")
    g.add_argument("--min-gap", type=float, default=60.0, help="ハイライト間の最小間隔 秒 (既定 60)")
    g.add_argument("--pre-roll", type=float, default=10.0, help="タイムスタンプを前倒しする秒数 (既定 10)")
    g.add_argument("--threshold", type=float, default=1.5, help="統合スコアの閾値 (既定 1.5)")
    g.add_argument(
        "--weight", action="append", default=[], metavar="NAME=W",
        help=f"シグナルの重みを変更 (例: --weight heatmap=0.4). 名前: {', '.join(DEFAULT_WEIGHTS)}",
    )
    args = p.parse_args(argv)
    if not args.url and not (args.info_json or args.chat_file):
        p.error("URL か --info-json / --chat-file を指定してください")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    weights = dict(DEFAULT_WEIGHTS)
    for item in args.weight:
        name, _, val = item.partition("=")
        if name not in weights:
            sys.exit(f"未知のシグナル名: {name}")
        weights[name] = float(val)
    cfg = Config(
        bin_size=args.bin,
        chat_delay=args.chat_delay,
        min_gap=args.min_gap,
        pre_roll=args.pre_roll,
        threshold=args.threshold,
        top=args.top,
        weights=weights,
    )

    if args.info_json or args.chat_file:
        # オフラインモード
        if args.info_json:
            with open(args.info_json, encoding="utf-8") as f:
                data = from_info(json.load(f), args.url)
        else:
            from .fetch import VideoData
            data = VideoData(url=args.url or "", video_id="", title="", duration=0)
        if args.chat_file and not args.no_chat:
            data.messages = load_live_chat(args.chat_file)
        if args.duration:
            data.duration = args.duration
        if not data.duration and data.messages:
            data.duration = data.messages[-1].time + 1
    else:
        workdir = args.workdir or tempfile.mkdtemp(prefix="yt_highlights_")
        data = fetch(
            args.url,
            workdir,
            use_chat=not args.no_chat,
            max_comments=args.max_comments,
            use_audio=args.audio,
        )

    if not data.duration:
        sys.exit("動画の長さが分かりません (--duration を指定してください)")

    sources = []
    if data.messages:
        sources.append(f"チャット {len(data.messages)} 件")
    if data.heatmap:
        sources.append("Most Replayed")
    if data.comments:
        sources.append(f"コメント {len(data.comments)} 件")
    if data.audio_pcm:
        sources.append("音声")
    if not sources:
        sys.exit("解析に使えるデータがありません (チャット・ヒートマップ・コメントのいずれも取得できませんでした)")
    print("使用データ: " + ", ".join(sources), file=sys.stderr)

    result = analyze(
        data.duration,
        cfg,
        messages=data.messages,
        heatmap=data.heatmap,
        comments=data.comments,
        audio_pcm=data.audio_pcm,
    )

    if args.curve:
        with open(args.curve, "w", encoding="utf-8") as f:
            f.write(to_csv_curve(result))

    if args.format == "json":
        print(to_json(result, data.title, data.url, data.video_id))
    else:
        print(to_text(result, data.title, data.url, data.video_id, verbose=args.verbose))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
