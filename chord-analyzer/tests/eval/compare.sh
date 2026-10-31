#!/bin/bash
# 基準（今の設定）を1回採点し、候補の設定をそれぞれ基準と比べる（候補は記録に残さない）
#   bash tests/eval/compare.sh '候補1の設定JSON' '候補1の名前' ['候補2の設定JSON' '候補2の名前' …]
cd "$(dirname "$0")/../.."
OPTIONS='{}' node tests/eval/eval.js --label="直す前" 2>&1 | grep -v "採点中"
while [ $# -ge 2 ]; do
  OPTIONS="$1" node tests/eval/eval.js --dry --label="$2" 2>&1 | grep -v "採点中"
  shift 2
done
