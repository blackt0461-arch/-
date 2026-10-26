#!/bin/bash
cd "$(dirname "$0")"
echo "準備中です (初回は数分かかります)..."
python3 -m pip install -q -U --disable-pip-version-check -r requirements.txt
python3 -m pip install -q --disable-pip-version-check -r requirements-audio.txt > /dev/null 2>&1 || echo "(音声照合の部品は入れられませんでした。音声照合以外は使えます)"
python3 app.py
