#!/usr/bin/env python3
"""伸びた切り抜き動画と、その元配信 (チャット・コメントの盛り上がり方など) から学習する。

使い方:
  python learn_clips.py 兎田ぺこら 宝鐘マリン 葛葉              # 名前ごとに 40 本の切り抜きを調べる
  python learn_clips.py --names-file names.txt --per-name 60
  python learn_clips.py --train-only                              # 集めたデータで学習し直すだけ

集めたデータは learn/dataset.jsonl に追記されていく (何度でも追加できる)。
学習結果は model.json に保存され、ブラウザのアプリと make_clips.py が自動で使う:
  - 検出した場面を「切り抜かれやすさ」の高い順に選ぶ
  - 切り抜きの前振り・余韻の長さを、伸びた切り抜きに合わせる
時間がかかります (元配信のチャットを取得するため、配信 1 本あたり 1〜3 分)。
"""

import argparse
import os

from highlights.learn import build_dataset, load_dataset, merge_datasets, report_text, save_model, train

BASE = os.path.dirname(os.path.abspath(__file__))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("names", nargs="*")
    p.add_argument("--names-file")
    p.add_argument("--per-name", type=int, default=40, help="名前ごとに調べる切り抜き数 (既定 40)")
    p.add_argument("--train-only", action="store_true")
    p.add_argument("--import", dest="imports", nargs="+", default=[], metavar="FILE",
                   help="ほかの人が集めた学習データ (dataset.jsonl) を取り込んでから学習")
    p.add_argument("--dataset", default=os.path.join(BASE, "learn", "dataset.jsonl"))
    p.add_argument("--model", default=os.path.join(BASE, "model.json"))
    p.add_argument("--workdir", default=os.path.join(BASE, "data"))
    args = p.parse_args(argv)
    names = list(args.names)
    if args.names_file:
        with open(args.names_file, encoding="utf-8") as f:
            names += [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    os.makedirs(os.path.dirname(args.dataset), exist_ok=True)
    if args.imports:
        print(f"取り込み: {merge_datasets(args.dataset, args.imports)} 件")
    if not args.train_only and not (args.imports and not names):
        if not names:
            p.error("配信者名を指定してください")
        n = build_dataset(names, args.workdir, args.dataset, per_name=args.per_name)
        print(f"切り抜き {n} 本ぶんのデータを追加しました")
    model = train(load_dataset(args.dataset))
    save_model(model, args.model)
    print(report_text(model))
    print(f"\nモデルを保存しました: {args.model}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
