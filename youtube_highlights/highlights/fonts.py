"""字幕用の日本語フォントを探す。

ffmpeg の字幕描画 (libass) にはフォントのファミリー名が必要なので、フォントファイルの
name テーブルを読んでファミリー名を取り出す (外部ライブラリ不要)。
アプリの fonts/ フォルダに .ttf / .otf / .ttc を置けば、それを優先して使う。
"""

from __future__ import annotations

import glob
import os
import struct
import sys

CANDIDATES = {
    "win32": [
        r"C:\Windows\Fonts\BIZ-UDGothicB.ttc",
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\meiryob.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
    ],
    "darwin": [
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    ],
    "linux": [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
        "/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ],
}


def font_family(path: str) -> str | None:
    """TTF / OTF / TTC の英語のファミリー名 (name ID 1)。読めなければ None。"""
    try:
        with open(path, "rb") as f:
            data = f.read()
        off = struct.unpack(">I", data[12:16])[0] if data[:4] == b"ttcf" else 0
        num = struct.unpack(">H", data[off + 4 : off + 6])[0]
        toff = None
        for i in range(num):
            rec = off + 12 + 16 * i
            if data[rec : rec + 4] == b"name":
                toff = struct.unpack(">I", data[rec + 8 : rec + 12])[0]
                break
        if toff is None:
            return None
        _fmt, count, stroff = struct.unpack(">HHH", data[toff : toff + 6])
        best, best_rank = None, -1
        for i in range(count):
            p = toff + 6 + 12 * i
            pid, eid, lid, nid, ln, o = struct.unpack(">HHHHHH", data[p : p + 12])
            if nid != 1:
                continue
            raw = data[toff + stroff + o : toff + stroff + o + ln]
            if pid in (0, 3):
                name, rank = raw.decode("utf-16-be", "ignore"), (3 if lid == 0x409 else 2)
            elif pid == 1 and eid == 0:
                name, rank = raw.decode("latin-1", "ignore"), 1
            else:
                continue
            if rank > best_rank and name.strip():
                best, best_rank = name.strip(), rank
        return best
    except (OSError, struct.error, IndexError):
        return None


def find_font(app_dir: str | None = None) -> tuple[str, str] | None:
    """(フォントファイル, ファミリー名)。見つからなければ None。"""
    paths: list[str] = []
    if app_dir:
        for ext in ("ttf", "otf", "ttc"):
            paths += sorted(glob.glob(os.path.join(app_dir, "fonts", f"*.{ext}")))
    key = "win32" if sys.platform.startswith("win") else "darwin" if sys.platform == "darwin" else "linux"
    paths += CANDIDATES[key]
    if key == "linux":
        for pat in ("**/*NotoSansCJK*", "**/*NotoSansJP*", "**/*ipag*", "**/*wqy*"):
            paths += sorted(glob.glob(os.path.join("/usr/share/fonts", pat), recursive=True))
    for p in paths:
        if os.path.isfile(p):
            fam = font_family(p)
            if fam:
                return p, fam
    return None
