---
name: clip-trend-analysis
description: YouTube の切り抜き動画が伸びる傾向を分析・学習する手順。「切り抜きの傾向を分析して」「どんな切り抜きが伸びるか調べて」「学習データを増やして」「分析結果を更新して」など、youtube_highlights の analyze_trends.py / learn_clips.py / analysis_kit を使う依頼で使う。
---

# 切り抜き動画の伸び方の分析

方法・定義・過去の結果は `youtube_highlights/analysis_kit/README.md` にある。**作業の前に必ず読む**。
ここには実行手順と判断の決まりだけを書く。

## 0. 環境の確認
- `cd youtube_highlights && pip install -r requirements.txt`
- YouTube に届くか: `python -c "import yt_dlp; yt_dlp.YoutubeDL({'quiet':1,'extract_flat':1}).extract_info('ytsearch1:test', download=False)"`
- 動画の詳細取得で「Sign in to confirm you're not a bot」が出る環境(クラウドのサーバーなど)では、段階 B は実行できない。
  **Cookie の流用・取得方式の変更などでボット判定を回避しない。** その旨を利用者に伝え、段階 A だけ行うか、
  家庭の回線の PC で実行してもらう。

## 1. 段階 A: 傾向分析(動画の一覧情報だけ・数分)
```
python analyze_trends.py 配信者1 配信者2 ... --channels 50
```
- 結果は `trends/result_日時.txt`。チャンネル数 30 以上・動画 2,000 本以上を目安に、足りなければ配信者を増やす。
- 前回の結果と比べるときは `python analysis_kit/reproduce.py trends/channels_*.json analysis_kit/data/channel_rows_*.json`。

## 2. 段階 B: 配信からの学習(家庭の回線で・時間がかかる)
```
python learn_clips.py 配信者1 配信者2 ... --per-name 40
```
- 学習データは `learn/dataset.jsonl` に追記され、`model.json` が更新される。
- ほかの人のデータを合流: `python learn_clips.py --import 相手の/dataset.jsonl`
- 正例が 50 件未満のうちは結果を「参考」として扱う。

## 3. 結果の読み方(決まり)
- 倍率は「同じチャンネルの普段の動画の何倍か」。★(95% 区間が 1 をまたがない)の特徴だけを「差がある」と言う。
  ★ でない特徴を「効果がある」と書かない。
- 本数(n)が 30 未満の特徴は、★でも「サンプルが少ない」と添える。
- 相関であって因果ではない、と必ず添える。
- 段階 B は、交差検証 AUC が「盛り上がりスコアだけの AUC」を上回っているかを確認し、上回っていなければ
  「学習の上積みなし」と報告する。
- 合成データでの検証を変えずに方法を変更しない。方法を変えたら `tests/test_learn.py` の検証テストを通し、
  README の「方法の検証」を更新する。

## 4. 報告と記録
- 利用者への報告: 対象(配信者・チャンネル数・本数・収集日)、★の特徴と倍率・区間、注意点、前回からの変化。
- `analysis_kit/README.md` の結果の表に、日付・対象・本数と一緒に **追記**する(古い結果は消さない)。
- 収集したデータは `analysis_kit/data/` に `種類_YYYYMMDD.json`(`{"meta": {...}, "rows": [...]}`)で保存してよい。
  チャットの本文などの個人の発言は保存しない(B のデータは特徴量のみなので問題ない)。
