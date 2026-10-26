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
echo 準備中です (初回は 1 分ほどかかります)...
python -m pip install -q -U --disable-pip-version-check -r requirements.txt
python app.py
pause
