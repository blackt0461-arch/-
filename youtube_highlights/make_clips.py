#!/usr/bin/env python3
"""配信の URL から、面白いシーンの切り抜き動画 (字幕・効果音付き) を作る。

使い方:
  python make_clips.py "https://www.youtube.com/watch?v=XXXX"            # 上位 3 シーン
  python make_clips.py URL -n 5 --vertical                              # 縦型 (ショート) で 5 本
  python make_clips.py URL --video-file 配信.mp4                         # 手元の動画ファイルから作る
"""

import argparse
import os
import sys

from highlights.clipmaker import ClipOptions, make_clips
from highlights.detect import Config, analyze
from highlights.fetch import fetch
from highlights.learn import load_model, rank_highlights
from highlights.pipeline import data_sources

BASE = os.path.dirname(os.path.abspath(__file__))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("url")
    p.add_argument("-n", "--count", type=int, default=3, help="作る本数 (スコアの高い順, 既定 3)")
    p.add_argument("--vertical", action="store_true", help="縦型 (1080x1920, ショート用)")
    p.add_argument("--no-captions", action="store_true", help="字幕を付けない")
    p.add_argument("--sfx", action="store_true", help="控えめな効果音を付ける (既定: なし)")
    p.add_argument("--no-chat", action="store_true", help="コメントを流さない")
    p.add_argument("--asr", choices=["auto", "whisper", "youtube", "off"], default="auto",
                   help="字幕の文字起こし (auto: Whisper があれば Whisper)")
    p.add_argument("--no-compile", action="store_true", help="まとめ動画を作らない")
    p.add_argument("--title", default="", help="上部のタイトルテロップ (既定: 反応の種類から自動)")
    p.add_argument("--video-file", help="元配信の動画ファイル (指定するとダウンロードしない)")
    p.add_argument("--out", default=os.path.join(BASE, "clips"), help="保存先 (既定: clips)")
    p.add_argument("--workdir", default=os.path.join(BASE, "data"))
    args = p.parse_args(argv)

    data = fetch(args.url, args.workdir)
    if not data_sources(data):
        sys.exit("解析に使えるデータがありません")
    result = analyze(data.duration, Config(), messages=data.messages, heatmap=data.heatmap, comments=data.comments)
    model = load_model(os.path.join(BASE, "model.json"))
    if model:
        chosen = [h for _p, h in rank_highlights(model, result, data.messages, data.duration)[: args.count]]
    else:
        chosen = sorted(result.highlights, key=lambda h: h.score, reverse=True)[: args.count]
    chosen.sort(key=lambda h: h.start)
    opts = ClipOptions(vertical=args.vertical, captions=not args.no_captions, sfx=args.sfx,
                       chat=not args.no_chat, custom_title=args.title, asr=args.asr)
    made = make_clips(data, chosen, args.out, args.workdir, opts, source_file=args.video_file,
                      compile_all=not args.no_compile, se_dir=os.path.join(BASE, "se"), model=model)
    print("\n作成した切り抜き動画:")
    for m in made:
        print("  " + os.path.join(args.out, m["file"]))
        if m.get("suggested_title"):
            print("     タイトル案: " + m["suggested_title"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
