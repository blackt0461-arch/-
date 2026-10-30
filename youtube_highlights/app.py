#!/usr/bin/env python3
"""ブラウザで操作するアプリを起動する: python app.py  (Windows は「起動.bat」をダブルクリック)"""

from highlights.webapp import serve

if __name__ == "__main__":
    serve()
