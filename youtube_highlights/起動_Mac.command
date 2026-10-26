#!/bin/bash
cd "$(dirname "$0")"
echo "準備中です (初回は数分かかります)..."
python3 -m pip install -q -U --disable-pip-version-check -r requirements.txt
python3 -m pip install -q --disable-pip-version-check -r requirements-audio.txt > /dev/null 2>&1 || echo "(動画の書き出し用の部品を入れられませんでした)"
if ! python3 -c "import faster_whisper" > /dev/null 2>&1; then
  echo "音声認識 (Whisper) の部品を入れています (初回のみ)..."
  python3 -m pip install -q --disable-pip-version-check -r requirements-asr.txt > /dev/null 2>&1
  python3 -m pip install -q --disable-pip-version-check --no-deps faster-whisper > /dev/null 2>&1 || echo "(音声認識の部品を入れられませんでした)"
fi
python3 app.py
