# スマグロ さいてきか

ドラゴンクエスト スマッシュグロウの「メモリ」と「そうび」から、メインのキャラの火力がいちばん高くなる組み合わせと、残り2人の編成を探すページです（kotetsuworks.com/smagro-memory/ で公開）。

- `index.html` … ページ本体（ドラクエ風の画面）
- `engine.js` … 計算。効果の読み取り、火力のめやす、組み合わせ探し
- `ui.js` … 画面の操作。サブ（2・3人目）は はじめ「こうげき力＋こうげき魔力」を たいせつにする設定。入力した持ち物は、その端末のブラウザに保存されます
- `scan.js` … ゲームの「もちもの」一覧のスクショから持ち物を登録する。AIは使わず、名前の帯を目じるしにアイコンを切り出し、`feats.json` の特徴と見くらべる。名前の帯の文字も Tesseract.js（スマホの中で動く文字読み取り。初回だけ部品をダウンロード）で読み、絵と文字の両方で決める。メモリはランクの文字の色、装備は Lv（黄色い文字）と凸（△の右の数字。1〜5の形の見本と見くらべ）も読む。スクショはスマホの外に出さない
- `feats.json` … アイコンを見分けるための特徴（絵そのものではなく小さな数字の並び）。`tools/iconfeat.py` で作る。計算は `scan.js` と同じにすること
- `cloud.js` … KOTETSU WORKS アカウント（入口でログイン）に持ち物を保存。どの端末でも同じ持ち物になる。サーバーは Supabase の kw_data_get / kw_data_put（study-room-beta/supabase/028）。ほかの端末と食いちがった時はどちらを使うか聞く
- `pip.js` … 「うかぶメモ」。結果を動画にして、ピクチャ・イン・ピクチャでゲームの上に浮かべる
- `data.json` … メモリ・そうび・ボスのデータ（絵は GameWith の画像の場所を入れていて、見えている分だけ読む）（自動で作られます。手で直さない）
- `icon.svg` / `*.png` / `manifest.webmanifest` … アイコン（ドット絵の剣・▶・メモリの宝石）とホーム画面用の設定
- `tools/update.py` … GameWith からデータを集めて `data.json` を作り直します（GameWith から公開・自動収集の許可あり）
- `tools/ci_update.py` … GitLab の毎日の作業から動かす（下の「データの毎日の更新」）
- `server/smagro-upload.ts` … データをバケットに置く Supabase の Edge Function（公開はされない。Supabase に入れて使う）
- `tools/iconfeat.py` … アイコンの特徴の作り方
- `tools/cache.json` … くわしいページの読み取り結果。毎日、新しいページと古いもの30件だけ読み直して、相手の負担を小さくしています

## データの毎日の更新（2026-11-10〜）

GitHub が止まったので、GitLab で動かす。サイトの公開とは別に動く。

1. GitLab の「予定（Pipeline schedules）」が毎日 日本時間4:17 に作業を動かす（予定から動いた時だけ smagro-update が動く。変数はいらない）（`.gitlab-ci.yml` の `smagro-update`）
2. `tools/ci_update.py` が、Supabase の公開バケット `smagro` からきのうの data.json・feats.json・cache.json を取り、`update.py` で集め直す（新しいページと古い30件だけ）
3. 3つのファイルを Edge Function `smagro-upload`（`server/smagro-upload.ts`）に送る。鍵は使わず、GitLab が作業ごとに出す ID トークンを確かめる（このリポジトリの予定・手動実行だけ通す）
4. ページ（index.html）はバケットの data.json を先に読む。読めない・サイトの方が新しい時は、サイトに入っている data.json を使う

手で動かすとき：GitLab の Build → Pipeline schedules →「スマグロ データ更新」の ▶。
`server/` の Edge Function を変えたら、Supabase の Management API（functions/deploy?slug=smagro-upload・verify_jwt false）で入れ直す。
サイトに入っている data.json は、ときどき手で `python3 tools/update.py` して新しくしておく（バケットが読めない時の予備）。

## 計算のめやす

- アクセサリーは2つまで付けられる（engine.js の ACC_SLOTS）
- メモリの入手先（data.json の src）：now＝開催中のイベント / hokora＝いつでも行けるほこら / story＝ストーリー / shop＝交換所 / past＝終わったイベント。メモリ画面でしぼりこんで、まとめて「もっている」にできる

火力 ＝ こうげき力 × 物理(呪文)ダメージ × ぞくせいダメージ × 系統とっこう × 弱点 × 会心のきたいち

- 得意武器のボーナスは、武器の特殊効果の【得】（Lv15/30/50 で +5/+30/+5 など）。得意武器の時だけ数える（GameWith「得意武器とは」で確認 2026-11-10）
- メモリはランクごとの個数を持てる（ui.js の S.memCnt。入れていないメモリは前と同じ「memRank のランクを1つ」）。3人で取りあい、1人に同じメモリは1つまで
- 枠と色が合ったメモリは のうりょく1.2倍（虹の枠はどの色でも）
- 超弱点 約1.7倍、弱点 約1.5倍、耐性 0.5倍
- S以外のランクは Sの数値 × A0.8 / B0.65 / C0.5 / D0.4 のめやす
- 装備ののうりょくは Lv1〜凸なしの最大（武器 ★3:50 ★2:40 ★1:30、防具 ★3:25 ★2:20 ★1:15。特殊効果の出るレベルから）のあいだを まっすぐ伸びるとして計算。凸で上がった上限（武器は1凸ごと+5、防具は+3のようす）までも同じ伸びで伸ばす
