#!/bin/sh
# README.md の「入っている問題の数」を今の数に書きかえる
cd "$(dirname "$0")/.." || exit 1
TABLE=$(node tools/check.js | grep ' : ' | sed 's#^\([a-z]*\) / \(.*\) : \(.*\)$#| \1 | \2 | \3 |#')
TOTAL=$(node tools/check.js | grep '^合計' | sed 's/  エラー.*//')
python3 - "$TABLE" "$TOTAL" <<'PY'
import sys,re
t,total=sys.argv[1],sys.argv[2]
s=open('README.md').read()
block="<!-- COUNTS -->\n| subject | ジャンル | 問題数 |\n|---|---|---|\n"+t+"\n\n"+total+"\n<!-- /COUNTS -->"
s=re.sub(r"<!-- COUNTS -->.*?(<!-- /COUNTS -->|\Z)",block,s,flags=re.S)
open('README.md','w').write(s)
PY
