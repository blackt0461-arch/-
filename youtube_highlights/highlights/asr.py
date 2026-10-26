"""音声認識 (文字起こし)。faster-whisper (Whisper) を使う。

YouTube の自動字幕より精度が高く、切り抜きの音声そのものから単語ごとの時刻を取るので字幕がずれない。
faster-whisper が無い環境では available() が False になり、呼び出し側は YouTube の自動字幕で代用する。

インストール (Python 3.15 では onnxruntime がまだ無いので、無音検出を使わずに入れる):
  pip install ctranslate2 tokenizers av huggingface-hub tqdm
  pip install --no-deps faster-whisper
初回はモデル (large-v3-turbo で約 1.6GB) を自動でダウンロードする。
"""

from __future__ import annotations

import importlib.util
import re
from functools import lru_cache

from .log import log

# 無音・BGM の所で Whisper が作りがちな、実際には話していない文
HALLUCINATIONS = re.compile(
    r"ご視聴ありがとうございました|チャンネル登録|高評価|お疲れ様でした。?$|字幕[はを]|"
    r"Thank you for watching|ご清聴|最後までご覧いただき"
)

MODELS = {
    "large-v3-turbo": "高精度 (おすすめ・初回 1.6GB)",
    "medium": "中くらい (1.5GB)",
    "small": "速い (500MB・精度は低め)",
}


def available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


@lru_cache(maxsize=1)
def _model(name: str, device: str):
    from faster_whisper import WhisperModel
    log(f"音声認識モデル ({name}) を読み込み中... (初回はダウンロードに数分かかります)")
    return WhisperModel(name, device=device, compute_type="int8" if device == "cpu" else "float16")


def transcribe(wav_path: str, model: str = "large-v3-turbo", language: str = "ja",
               device: str = "cpu", prompt: str | None = None) -> list[tuple[float, float, str]]:
    """単語 (日本語では数文字のかたまり) ごとの (開始, 終了, 文字) のリスト。時刻は音声ファイルの先頭から。"""
    m = _model(model, device)
    segments, _info = m.transcribe(
        wav_path, language=language, word_timestamps=True, vad_filter=False, beam_size=5,
        condition_on_previous_text=False, initial_prompt=prompt,
    )
    words: list[tuple[float, float, str]] = []
    for seg in segments:
        if getattr(seg, "no_speech_prob", 0) > 0.6 and getattr(seg, "avg_logprob", 0) < -1.0:
            continue
        if HALLUCINATIONS.search(seg.text or ""):
            continue
        for w in seg.words or []:
            text = (w.word or "").strip()
            if text and w.end > w.start:
                words.append((float(w.start), float(w.end), text))
    return words
