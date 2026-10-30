#!/usr/bin/env python3
"""同梱データから分析を再現する (ネット不要)。

  python analysis_kit/reproduce.py                       # 同梱データで回帰を再計算
  python analysis_kit/reproduce.py trends/channels_*.json  # 自分で集めたデータで
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from highlights.trends import regress, regress_text  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data["rows"] if isinstance(data, dict) else data


if __name__ == "__main__":
    paths = sys.argv[1:] or [os.path.join(HERE, "data", "channel_rows_20261026.json")]
    rows = [r for p in paths for r in load(p)]
    print(regress_text(regress(rows, boot=300)))
