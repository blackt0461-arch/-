#!/bin/bash
cd "$(dirname "$0")"
echo "準備中です (初回は 1 分ほどかかります)..."
python3 -m pip install -q -U --disable-pip-version-check -r requirements.txt
python3 app.py
