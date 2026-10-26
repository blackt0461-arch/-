"""進捗メッセージの出力先。既定は標準エラー出力、Web アプリ実行中はジョブごとの記録に送る。"""

from __future__ import annotations

import sys
import threading
from typing import Callable

_local = threading.local()


def set_sink(sink: Callable[[str], None] | None) -> None:
    """このスレッドの進捗メッセージの送り先を設定する (None で標準エラー出力に戻す)。"""
    _local.sink = sink


def log(msg: str) -> None:
    sink = getattr(_local, "sink", None)
    if sink is None:
        print(msg, file=sys.stderr)
    else:
        sink(msg)
