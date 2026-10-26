@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 配信ハイライト抽出
where python > nul 2> nul
if errorlevel 1 goto nopython
echo 準備中です。初回は数分かかります...
python -m pip install -q -U --disable-pip-version-check -r requirements.txt
if errorlevel 1 echo yt-dlp の更新に失敗しました。ネット接続を確認してください。
python -m pip install -q --disable-pip-version-check -r requirements-audio.txt > nul 2> nul
if errorlevel 1 echo 動画の書き出し用の部品を入れられませんでした。切り抜き動画の作成以外は使えます。
python -c "import faster_whisper" > nul 2> nul
if not errorlevel 1 goto start
echo 音声認識 Whisper の部品を入れています。初回のみ数分かかります...
python -m pip install -q --disable-pip-version-check -r requirements-asr.txt > nul 2> nul
python -m pip install -q --disable-pip-version-check --no-deps faster-whisper > nul 2> nul
python -c "import faster_whisper" > nul 2> nul
if errorlevel 1 echo 音声認識の部品を入れられませんでした。字幕は YouTube の自動字幕を使います。
:start
python app.py
pause
exit /b 0
:nopython
echo Python が見つかりません。https://www.python.org/downloads/ からインストールしてください。
pause
exit /b 1
