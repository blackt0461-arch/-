# 通信理論の授業（スライド）の作り方（作業役への指示）

テスト勉強アプリ（`/home/user/-/test-study`）に、授業「通信理論」の授業（スライド）を足す。
仕様は `/home/user/-/test-study/SPEC.md` の「1.7.0 授業（スライド）」「1.8.0」「1.16.0」の節。見本は電子回路I の `data/denshi1/lessons/l3.json` と図の `tools/figs/l3.py`。

## だれ向けか
- 使うのは大学生の本人ひとり（コードは書かない）。**中高生でも予備知識ゼロで、見終わればその回の問題がすべて解ける**ように。
- 中テストは 2026-11-12（明日）。マークシート式・電卓なし。計算（一致数・相関・確率・mod 2 の割り算・符号化と復号）の**手順を自分でできる**ようにするのが大事。例題はていねいに1ステップずつ。

## 書くもの（自分の回の分だけ。ほかのファイルはさわらない）
1. `data/tsushin/lessons/l<N>.json` … 授業1本
2. `tools/figs_tsushin/l<N>.py` … 図を作るスクリプト（`from common import *`。`common.py` を見ること）。出力は `data/tsushin/fig/l<N>-名前.svg`
- `data/tsushin/midterm.json`・`SPEC.md`・アプリのコード・ほかの回のファイルは**変えない**（あとでまとめ役が登録する）。git の commit / push もしない。

## 授業 JSON の形
```
{ "id": "l<N>", "lecture": "第<N>回", "title": "…", "sub": "…（1行の説明）", "minutes": 12,
  "slides": [ ... ], "covers": { "t001": [スライド番号, ...], ... } }
```
- スライドの type：`cover`（最初の1枚：title, sub）/ `text`（title, body）/ `analogy`（たとえ。title, body）/ `formula`（title, tex, body）/ `point`（ここを覚える。title, items）/ `flow`（title, items, body）/ `table`（title, head, rows, body）/ `steps`（導き方・手順。title, items, body）/ `quiz`（確認クイズ。q, choices, answer（0から）, explain）/ `summary`（最後の1枚：title, items）。どれにも `"fig": "fig/l<N>-名前.svg"` をつけられる。
- 本文の書き方：`**太字**`、`==マーカー==`、行頭 `- ` で箇条書き、改行は `\n`、数式は `$...$`（KaTeX）。JSON は **Python の json.dump で書く**（`\` のエスケープまちがいを防ぐ。ensure_ascii=False, indent=1）。
- **covers**：この回の問題（`data/tsushin/midterm.json` の `lecture` が「第<N>回」の問題 **全部**）について、その問題を説明しているスライドの番号（**0 から数える**）。1問も漏らさない。
- 枚数：**25〜35枚**。**確認クイズを 6〜9 枚おきに**（あとでクイズの所で 3〜5分ずつのパートに分けるため）。最後は summary。
- 1枚の文章は短く（スマホ1画面。本文 5〜8 行まで）。専門用語は初めて出るときに、ふつうの言葉で説明する。
- たとえ（analogy）は1本に 2〜3 枚まで。たとえのあとは必ず、ちゃんとした言葉の説明に戻る。
- 「講師が強調」「テストに出る」などは、レジュメに根拠があるときだけ書く。

## 図
- 1本に 8〜15 枚。ブロック図（シャノンの通信モデル、ARQ の流れ）、時間・周波数の図（FDD/TDD、FDMA/TDMA）、ビット列のマス目（同期語をずらす、パリティ、符号語）、通信路線図、割り算の筆算、シフトレジスタなど。
- `common.py` の `Fig`・`box`・`bits`・`rect`・`circle`・`f.line`・`f.arrow`・`f.text`（`_{..}` で下つき）を使う。白い背景・横 360〜480 くらい。文字は 13〜16。
- 描いたら `node /home/user/-/test-study/tools/figs/look.js /tmp/claude-0/-home-user/896c9d7f-d037-5cf5-b6a8-c1dc348d8cfd/scratchpad/look_l<N>.png data/tsushin/fig/l<N>-*.svg`（test-study の中で）で PNG にして**目で確かめる**（文字の重なり・はみ出しがないか）。

## 正しさ
- 計算の数字（例題・クイズ）は**必ず Python で確かめる**。道具：`/tmp/claude-0/-home-user/896c9d7f-d037-5cf5-b6a8-c1dc348d8cfd/scratchpad/tsushin/calc.py`（mod2div・enc・match・corr・conv・ham）。
- 中身は**レジュメが元**。レジュメは Google ドライブにある（Google Drive の read_file_content で読める。ファイル id は回ごとの指示に書く）。足りない所は一般的な教科書の内容で補ってよいが、レジュメとちがうことは書かない。

## 終わったら（返事）
- スライド枚数・クイズ数・図の枚数、covers が回の全問をカバーしているか（確かめた方法）、Python で確かめた数字、気になること。短く。
