"""字幕照合: YouTube の自動字幕を使って、切り抜きが元配信のどこから来たかを特定する。

音声照合と違い、音声のダウンロードも ffmpeg も numpy も要らない (字幕テキストを取るだけ)。

方法
  1. 元配信と切り抜きの自動字幕 (json3 形式) を取得し、文字ごとの時刻付きの列にする。
     NFKC 正規化し、空白・記号は除く。
  2. 元配信の文字 N-gram (N=5) → 出現位置 の索引を作る。
  3. 切り抜きの N-gram ごとに元配信での出現位置を引き、
     「元配信の時刻 − 切り抜きの時刻」(オフセット) に投票する。
     ありふれた N-gram (元配信に 10 回より多く出る) は投票しない。
  4. 同じオフセット (±OFFSET_BIN 秒) に MIN_VOTES 票以上集まれば、その票の元配信上の
     時刻の範囲を切り抜き区間とする。切り抜きは編集で場面が飛ぶので、票を取り除きながら
     最大 5 区間まで繰り返し探す。
  同じ音声に対する自動字幕は、BGM などで多少崩れても長い文字列が一致しやすく、
  偶然の一致はオフセットがばらばらになるので、ほとんど票が集まらない。
"""

from __future__ import annotations

import json
import os
import unicodedata
from collections import defaultdict

from .log import log

N = 5
MAX_POSITIONS = 10
OFFSET_BIN = 3.0
MIN_VOTES = 8
MAX_SEGMENTS = 5


# ---------------------------------------------------------------------------
# 字幕の取得
# ---------------------------------------------------------------------------
def _pick_track(info: dict) -> dict | None:
    """元の言語の自動字幕 (無ければ手動字幕) の json3 トラックを選ぶ。"""
    lang = (info.get("language") or "ja").split("-")[0]
    auto = info.get("automatic_captions") or {}
    manual = info.get("subtitles") or {}
    keys = [k for k in auto if k.endswith("-orig")]
    keys += [k for k in (lang, f"{lang}-orig", "ja", "en") if k in auto]
    pools = [(auto, k) for k in keys] + [(manual, k) for k in manual if k.split("-")[0] == lang and k != "live_chat"]
    for pool, key in pools:
        for fmt in pool.get(key) or []:
            if fmt.get("ext") == "json3" and fmt.get("url"):
                return fmt
    return None


def parse_json3(raw: str | bytes) -> list[tuple[float, str]]:
    """json3 字幕を (秒, テキスト) のリストに。"""
    data = json.loads(raw)
    out = []
    for ev in data.get("events") or []:
        base = (ev.get("tStartMs") or 0) / 1000.0
        for seg in ev.get("segs") or []:
            text = seg.get("utf8") or ""
            if text.strip():
                out.append((base + (seg.get("tOffsetMs") or 0) / 1000.0, text))
    return out


def fetch_transcript(ydl, info: dict) -> list[tuple[float, str]] | None:
    """info (extract_info の結果) から字幕を取得する。無ければ None。"""
    track = _pick_track(info)
    if not track:
        return None
    try:
        with ydl.urlopen(track["url"]) as r:
            return parse_json3(r.read())
    except Exception as e:
        log(f"  字幕の取得に失敗しました: {e}")
        return None


def stream_transcript(ydl, url: str, video_id: str, workdir: str) -> list[tuple[float, str]] | None:
    """元配信の字幕 (workdir にキャッシュ)。"""
    cache = os.path.join(workdir, f"{video_id}.transcript.json")
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            data = json.load(f)
        return [tuple(x) for x in data] if data else None
    log("元配信の自動字幕を取得中...")
    try:
        info = ydl.extract_info(url, download=False)
    except Exception as e:
        log(f"  元配信の情報を取得できませんでした: {e}")
        return None
    tr = fetch_transcript(ydl, info)
    os.makedirs(workdir, exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(tr or [], f, ensure_ascii=False)
    if not tr:
        log("  元配信に自動字幕がありませんでした (字幕照合は使えません)")
    return tr


# ---------------------------------------------------------------------------
# 照合
# ---------------------------------------------------------------------------
def _chars(transcript: list[tuple[float, str]]) -> tuple[str, list[float]]:
    chars, times = [], []
    for t, text in transcript:
        for ch in unicodedata.normalize("NFKC", text).lower():
            cat = unicodedata.category(ch)
            if cat[0] in "LN":  # 文字と数字だけ
                chars.append(ch)
                times.append(t)
    return "".join(chars), times


class TranscriptIndex:
    def __init__(self, transcript: list[tuple[float, str]]):
        self.text, self.times = _chars(transcript)
        idx: dict[str, list[int]] = defaultdict(list)
        for i in range(len(self.text) - N + 1):
            lst = idx[self.text[i : i + N]]
            if len(lst) <= MAX_POSITIONS:
                lst.append(i)
        self.index = idx

    def match(self, clip_transcript: list[tuple[float, str]]) -> list[tuple[float, float]]:
        """切り抜きが対応する元配信上の区間 (秒) のリスト。"""
        text, times = _chars(clip_transcript)
        votes: list[tuple[float, float]] = []  # (オフセット, 元配信の時刻)
        for i in range(0, len(text) - N + 1, 2):
            pos = self.index.get(text[i : i + N])
            if not pos or len(pos) > MAX_POSITIONS:
                continue
            for p in pos:
                votes.append((self.times[p] - times[i], self.times[p]))
        intervals = []
        for _ in range(MAX_SEGMENTS):
            if len(votes) < MIN_VOTES:
                break
            bins: dict[int, int] = defaultdict(int)
            for off, _t in votes:
                bins[int(off // OFFSET_BIN)] += 1
            best = max(bins, key=lambda b: bins[b] + bins.get(b - 1, 0) + bins.get(b + 1, 0))
            lo, hi = (best - 1) * OFFSET_BIN, (best + 2) * OFFSET_BIN
            members = [v for v in votes if lo <= v[0] < hi]
            if len(members) < MIN_VOTES:
                break
            ts = sorted(t for _o, t in members)
            # 外れ値を除く (前後 10% を捨てる)
            k = len(ts) // 10
            start, end = ts[k], ts[-1 - k]
            if end - start >= 3.0:
                intervals.append((start, end + 3.0))
            votes = [v for v in votes if not (lo <= v[0] < hi)]
        return _merge(intervals)


def _merge(intervals: list[tuple[float, float]], gap: float = 5.0) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1] + gap:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out
