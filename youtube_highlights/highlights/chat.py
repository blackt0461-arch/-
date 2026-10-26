"""ライブチャット(リプレイ)の読み込みと、メッセージの反応分類。

yt-dlp が `--sub-langs live_chat` で書き出す JSON Lines 形式
(1行 = 1つの replayChatItemAction) を解析する。
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable, Iterator


@dataclass
class ChatMessage:
    time: float                 # 動画内の秒数
    author: str                 # 投稿者 ID (無ければ名前)
    text: str                   # 正規化前の本文 (絵文字はショートカット表記)
    amount: float = 0.0         # スーパーチャット等の金額 (通貨は無視した数値)
    kind: str = "text"          # text / paid / member
    reactions: dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 反応語辞書
#   カテゴリ -> 正規表現のリスト。本文は NFKC 正規化 + 小文字化してから照合する
#   (NFKC により全角「ｗ」「！」なども半角に揃う)。
# ---------------------------------------------------------------------------
LEXICON: dict[str, list[str]] = {
    "laugh": [
        r"草", r"笑", r"(?:^|[^a-z])w{1,}(?:$|[^a-z])", r"ワロ", r"わろ", r"ﾜﾛ",
        r"lol", r"lmao", r"lmfao", r"haha", r"kusa", r"腹筋", r"爆笑",
        r"🤣", r"😂", r"face-with-tears-of-joy", r"rolling-on-the-floor-laughing",
        r"ふふ", r"くさ",
    ],
    "surprise": [
        r"!\?", r"\?!", r"え[ぇえっー]+", r"ええ", r"^は\?", r"まじ", r"マジ", r"うそ",
        r"嘘", r"wtf", r"omg", r"what", r"😱", r"😳", r"😮", r"!!+\?", r"びっくり", r"ファッ",
    ],
    "hype": [
        r"うお[おぉー]+", r"きた", r"キタ", r"神", r"つよ", r"強すぎ", r"うま", r"上手",
        r"nice", r"ナイス", r"ないす", r"すげ", r"すご", r"やば", r"ヤバ", r"\bgg\b",
        r"pog", r"🔥", r"!!!", r"天才", r"最強", r"かっこ",
    ],
    "applause": [r"888", r"パチパチ", r"ぱちぱち", r"👏", r"clap", r"おめ", r"congrat"],
    "cute": [r"てぇてぇ", r"てえてえ", r"尊", r"かわい", r"可愛", r"cute", r"kawaii", r"💕", r"❤", r"♡"],
    "clip": [r"切り抜", r"ここすき", r"ここ好き", r"\bclip", r"保存"],
}

# 「面白さ」への寄与の重み。笑いと「切り抜き希望」を最も重視する。
CATEGORY_WEIGHT: dict[str, float] = {
    "laugh": 1.0,
    "clip": 1.2,
    "surprise": 0.8,
    "hype": 0.7,
    "cute": 0.6,
    "applause": 0.5,
}

CATEGORY_LABEL: dict[str, str] = {
    "laugh": "😂 爆笑",
    "clip": "✂️ 切り抜き候補",
    "surprise": "😲 驚き",
    "hype": "🔥 盛り上がり",
    "cute": "💕 てぇてぇ",
    "applause": "👏 拍手",
}

_COMPILED = {cat: [re.compile(p) for p in pats] for cat, pats in LEXICON.items()}
_REPEAT = re.compile(r"(w{2,}|草{2,}|8{3,}|!{2,}|笑{2,})")


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).lower().strip()


def classify(text: str) -> dict[str, float]:
    """本文をカテゴリ別の反応強度に変換する。

    強度 = 1 + 0.15 * (繰り返し文字の余剰数, 上限 10)
    「草草草草」「wwwwww」のように長いほど少しだけ強い反応とみなす。
    """
    norm = normalize(text)
    if not norm:
        return {}
    extra = 0
    for m in _REPEAT.finditer(norm):
        extra += len(m.group(0)) - 1
    intensity = 1.0 + 0.15 * min(extra, 10)
    result: dict[str, float] = {}
    for cat, pats in _COMPILED.items():
        if any(p.search(norm) for p in pats):
            result[cat] = intensity
    return result


def reaction_value(reactions: dict[str, float]) -> float:
    """カテゴリ別強度を「面白さ」スカラーに。最も強いカテゴリ + 他の 30%。"""
    if not reactions:
        return 0.0
    vals = sorted((CATEGORY_WEIGHT[c] * v for c, v in reactions.items()), reverse=True)
    return vals[0] + 0.3 * sum(vals[1:])


# ---------------------------------------------------------------------------
# live_chat.json パーサ
# ---------------------------------------------------------------------------
_AMOUNT = re.compile(r"[\d,]+(?:\.\d+)?")


def _runs_to_text(message: dict) -> str:
    if not message:
        return ""
    if "simpleText" in message:
        return message["simpleText"]
    out = []
    for run in message.get("runs", []):
        if "text" in run:
            out.append(run["text"])
        elif "emoji" in run:
            emoji = run["emoji"]
            shortcuts = emoji.get("shortcuts") or []
            # 標準絵文字は emojiId がそのまま文字。カスタム絵文字はショートカット名。
            eid = emoji.get("emojiId", "")
            if eid and len(eid) <= 4:
                out.append(eid)
            elif shortcuts:
                out.append(shortcuts[0])
            else:
                out.append(eid)
    return "".join(out)


def _parse_amount(text: str) -> float:
    m = _AMOUNT.search(text or "")
    if not m:
        return 0.0
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return 0.0


def _iter_actions(obj: dict) -> Iterator[tuple[float, dict]]:
    replay = obj.get("replayChatItemAction")
    if replay is not None:
        offset = float(replay.get("videoOffsetTimeMsec", 0)) / 1000.0
        for action in replay.get("actions", []):
            yield offset, action
    elif "addChatItemAction" in obj:  # 一部ツールの出力形式
        yield float(obj.get("videoOffsetTimeMsec", 0)) / 1000.0, obj


def parse_live_chat_lines(lines: Iterable[str]) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        for offset, action in _iter_actions(obj):
            item = (action.get("addChatItemAction") or {}).get("item") or {}
            for key, renderer in item.items():
                if key == "liveChatTextMessageRenderer":
                    kind, amount = "text", 0.0
                elif key in ("liveChatPaidMessageRenderer", "liveChatPaidStickerRenderer"):
                    kind = "paid"
                    amount = _parse_amount(_runs_to_text(renderer.get("purchaseAmountText", {})))
                elif key == "liveChatMembershipItemRenderer":
                    kind, amount = "member", 0.0
                else:
                    continue
                text = _runs_to_text(renderer.get("message", {}))
                author = renderer.get("authorExternalChannelId") or _runs_to_text(
                    renderer.get("authorName", {})
                )
                if offset < 0:  # 配信開始前の待機チャット
                    continue
                messages.append(
                    ChatMessage(
                        time=offset,
                        author=author,
                        text=text,
                        amount=amount,
                        kind=kind,
                        reactions=classify(text),
                    )
                )
    messages.sort(key=lambda m: m.time)
    return messages


def load_live_chat(path: str) -> list[ChatMessage]:
    with open(path, encoding="utf-8") as f:
        return parse_live_chat_lines(f)


def amount_weight(amount: float) -> float:
    """スパチャ金額を対数で圧縮 (高額 1 件で全体が支配されないように)。"""
    return math.log1p(max(amount, 0.0) / 100.0)
