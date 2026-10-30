#!/usr/bin/env python3
"""人気の切り抜き動画の傾向を分析する (動画の情報だけを使う。速い)。

使い方:
  python analyze_trends.py 兎田ぺこら 宝鐘マリン 葛葉          # 配信者名を並べる
  python analyze_trends.py --names-file names.txt --channels 50

手順: 「名前 切り抜き」を検索 → 切り抜きチャンネルを見つける → 各チャンネルの動画一覧 (投稿日付き) を取得
      → チャンネル規模と投稿日数を差し引いた回帰で、長さ・タイトルの特徴ごとの再生数の倍率を推定。
結果: trends/ フォルダに データ (JSON) と結果 (テキスト・JSON) を保存。
"""

import argparse
import collections
import json
import os
import time

from highlights.trends import analyze, collect, collect_channels, regress, regress_text, save, to_text

BASE = os.path.dirname(os.path.abspath(__file__))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("names", nargs="*", help="配信者名")
    p.add_argument("--names-file", help="配信者名を 1 行 1 人で書いたファイル")
    p.add_argument("--per-name", type=int, default=100, help="名前ごとの検索件数 (既定 100)")
    p.add_argument("--channels", type=int, default=50, help="動画一覧を取る切り抜きチャンネル数 (既定 50)")
    p.add_argument("--per-channel", type=int, default=100, help="チャンネルごとの動画数 (既定 100)")
    p.add_argument("--out", default=os.path.join(BASE, "trends"))
    args = p.parse_args(argv)
    names = list(args.names)
    if args.names_file:
        with open(args.names_file, encoding="utf-8") as f:
            names += [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    if not names:
        p.error("配信者名を指定してください")
    os.makedirs(args.out, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M")

    rows = collect(names, limit=args.per_name)
    save(rows, os.path.join(args.out, f"search_{stamp}.json"))
    cnt = collections.Counter(r["channel_id"] for r in rows if r["channel_id"])
    official = {r["channel_id"] for r in rows
                if any(k in r["channel"] for k in ("Ch.", "ch.", "Channel", "公式"))
                and not any(k in r["channel"] for k in ("切り抜き", "切抜", "clip", "Clip"))}
    ids = [c for c, _n in cnt.most_common() if c not in official][: args.channels]
    ch_rows = collect_channels(ids, limit=args.per_channel)
    save(ch_rows, os.path.join(args.out, f"channels_{stamp}.json"))

    res = regress(ch_rows)
    text = regress_text(res) + "\n\n----- 参考: 検索結果だけでの集計 (偏りあり) -----\n" + to_text(analyze(rows))
    with open(os.path.join(args.out, f"result_{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, f"result_{stamp}.txt"), "w", encoding="utf-8") as f:
        f.write(text)
    print(text)
    print(f"\n保存先: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
