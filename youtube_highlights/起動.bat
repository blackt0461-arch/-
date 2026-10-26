@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 配信ハイライト抽出
where python > nul 2> nul
if errorlevel 1 (
  echo Python が見つかりません。https://www.python.org/downloads/ からインストールしてください。
  pause
  exit /b 1
)
echo 準備中です (初回は数分かかります)...
python -m pip install -q -U --disable-pip-version-check -r requirements.txt
if errorlevel 1 echo yt-dlp の更新に失敗しました。ネット接続を確認してください。
python -m pip install -q --disable-pip-version-check -r requirements-audio.txt > nul 2> nul
if errorlevel 1 echo (音声照合の部品は入れられませんでした。音声照合以外は使えます)
python app.py
pause
