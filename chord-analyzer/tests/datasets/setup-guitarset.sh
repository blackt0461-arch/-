#!/bin/bash
# GuitarSet（研究用のギター演奏データ・CC BY 4.0）をダウンロードして、採点用に変換する
#   bash tests/datasets/setup-guitarset.sh [保存先（既定 /tmp/claude-0/guitarset）]
set -e
DIR="${1:-/tmp/claude-0/guitarset}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR" && cd "$DIR"
[ -f annotation.zip ] || curl -sSL -o annotation.zip https://zenodo.org/api/records/3371780/files/annotation.zip/content
[ -f audio_mono-mic.zip ] || curl -sSL -o audio_mono-mic.zip https://zenodo.org/api/records/3371780/files/audio_mono-mic.zip/content
[ -d ann ] || { mkdir -p ann && unzip -q -o annotation.zip -d ann; }
[ -d audio ] || { mkdir -p audio && unzip -q -o audio_mono-mic.zip -d audio; }
# zip の中にフォルダがあれば平らにする
find ann -mindepth 2 -name '*.jams' -exec mv {} ann/ \; 2>/dev/null || true
find audio -mindepth 2 -name '*.wav' -exec mv {} audio/ \; 2>/dev/null || true
rm -f audio_mono-mic.zip
python3 "$HERE/guitarset-convert.py" ann guitarset.json
echo "GuitarSet の準備ができました：$(ls audio | wc -l) 個の音声"
