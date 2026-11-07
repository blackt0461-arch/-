# CLAUDE.md

**ユーザーへの返事は、どんな場合も必ず日本語で書く。** ユーザーは大学生で、コードは書かない。説明は専門用語を避けて短く。

## 進み具合の見せ方

ユーザーは、Claude が今なにをしているか、どこまで進んだかが画面からわかりにくいと感じている。毎回次のようにする。

- 3手以上かかりそうな作業では、始めに作業リスト（TaskCreate）を作る。項目は短い日本語にする（例「原因を調べる」「直す」「動くか確かめる」）。取りかかる項目は進行中に、終わったら完了にする（TaskUpdate）。
- 調べものや待ち時間が続くときは、ツールを使う合間に「いま〇〇を調べています」と1行で知らせる。黙って長く作業を続けない。
- 予定より長引きそうなときや、方針を変えるときは、その時点で理由をひと言伝える。

## アプリの更新のお知らせ（chord-analyzer/version.json の notes）

画面に出るので、シンプルで簡潔に書く。1つ15字くらいまで・3つまで。数字や細かい説明は入れない（例：「メニューを下のアイコンに」）。

## ROOMIN（study-room）の新しい版の出し方

**テスト版 → 管理者がためす → ユーザーの許可 → 本番** の順にする。いきなり本番を変えない。

- 変更はいつも `study-room-beta/`（テスト版。管理者だけが入れる）で作る。`study-room/`（本番）は直接さわらない。
- テスト版の version.json と js/main.js の APP_VERSION を上げ、プルリクエスト → main にマージ → テスト版に出る。ユーザーに「テスト版に出しました。メニュー →『テスト版を開く』でためしてください」と伝える。
- ユーザーが「許可」「OK」などと言ったら、`node study-room-beta/tools/release/release.js` で本番に写し、プルリクエスト → main にマージ → 本番に出る。
- テスト版：https://blackt0461-arch.github.io/-/study-room-beta/ ／ 本番：https://blackt0461-arch.github.io/-/study-room/
- くわしくは study-room-beta/SPEC.md の「23. 新しい版の出し方」。
- 本番に出すときは、前に本番に出した版からの変更を全部まとめてお知らせに書く（テスト版を何回か出していても、本番の人には1回分しか見えないため）。

## ROOMIN の更新のお知らせ（version.json の notes）の書き方

ほかの会社のアプリ（ストアの「新機能」欄、ゲームのアップデート告知など）にならう。

- **使う人から見て、何が変わったか**を書く。作る側の言葉（「実装」「対応」「調整」「リファクタ」など）は使わない。
  - よい例：「部屋でBGMが流れるようになりました」「パズル画面の「i」から遊び方を見られるようになりました」
  - だめな例：「BGMの実装」「パズルのヘルプ対応」
- 文の終わりは、内容に合わせて使い分ける。
  - 新しいこと：「〜を追加しました」「〜できるようになりました」
  - 良くしたこと：「〜を見やすくしました」「〜を軽くしました」「〜を改善しました」
  - 直したこと：「〜で、△△することがある不具合を修正しました」（どの場面で何が起きていたかを書く）
- 並べる順番は、いちばん大きな変更から。新しいこと → 良くしたこと → 直したこと。
- 1つ1文、25字くらいまで。数字や細かい手順は入れない。3つまで。書ききれない小さな変更は「そのほか、細かな改善を行いました」の1行にまとめる（4つ目として足してよい）。
- 本番に出す前に、ユーザーにお知らせの文を見せる。

## GitHub が止まっている間のこと（2026-11-07〜）

GitHub のアカウント（blackt0461-arch）が止められている。clone・push・プルリクエスト・GitHub Pages は使えない（403）。本人が GitHub に申し立て中。

- **公開の場所**：Cloudflare Pages のプロジェクト「kotetsuworks」＋ 独自ドメイン **kotetsuworks.com**（Cloudflare で購入）。
  - 入口ページ `index.html`（KOTETSU WORKS）、ROOMIN 本番 `/roomin`（= `/study-room/`）、テスト版 `/roomin-beta`（= `/study-room-beta/`）、ほかのアプリはフォルダ名のまま。`_redirects` で短い URL にしている。
- **更新のしかた**：
  - ふつうは `bash tools/gitlab/push.sh --deploy`（GitLab に送って「deploy-日時」のタグを付ける → GitLab の自動作業が Cloudflare に直接アップロード。Cloudflare の月500回のビルド回数は使わない）。2026-11-07 に初めて成功。鍵は GitLab の CI 変数 CLOUDFLARE_API_TOKEN（Protect variable はチェックなし。チェックするとタグの時に鍵が渡らない）。公開は本人の OK をとってから。
  - `node tools/deploy/deploy.js`（この環境から直接）は使えない：この環境の中継が Cloudflare の一時的な通行証を鍵で上書きしてしまい、ファイルを送る所で失敗する。
  - GitLab も使えない時は、`node tools/deploy/build.js --zip` で `_backup/kotetsuworks-site.zip` を作って本人に送り、本人が Cloudflare Pages の「Create deployment」でアップロードする。
  - どちらも、入れるもの・入れないものは tools/deploy/build.js にまとめてある（cat-model・docs・youtube_highlights・roomin-questions・各アプリの tools などはのぞく）。
- ROOMIN の「テスト版 → 許可 → 本番」の順番は変わらない。本番に写すのは `node study-room-beta/tools/release/release.js`。
- 作り手の名前は **KOTETSU WORKS**（こてつワークス）。アイコンは `assets/`。
- みんなの記録は Supabase にあり、GitHub とは関係なく無事。
- 予備の写しは、本人の Google ドライブ「ROOMIN バックアップ」フォルダに zip で置く。
- 目覚まし管理（alarm）は、データを GitHub（alarm-data）に読み書きするので、いまは動かない。
- GitHub が戻ったら：手元にたまっている変更を送り、Cloudflare Pages を GitHub につなぐ（つなぎかえで作り直しても、ドメインのおかげで URL は変わらない）。

## GitLab（コードの置き場所）と、止められないためのきまり（2026-11-07〜）

コードは GitLab の非公開グループ **kotetsu-works-group** にも置く：https://gitlab.com/kotetsu-works-group/kotetsuworks-site
鍵は環境「全部許可」の gitlab.com 宛てに保存してあり、通信の途中で自動で付く。送るときは `bash tools/gitlab/push.sh`（手元の写しは履歴が途中からなので、送る用に作り直してから送る。いまは cat-model/reference の参考写真を外している。GitLab の中身はこの作り直し版が正式（本人の決定）。公開は `bash tools/gitlab/push.sh --deploy`（GitLab の自動作業が kotetsuworks.com に出す。.gitlab-ci.yml）。

止められないためのきまり：
- GitLab・Cloudflare のアカウントは2段階認証を使う（本人が設定ずみ）。
- 鍵・トークン・.env はコードや履歴に入れない（URL にも書かない）。本人にもチャットに貼ってもらわない。
- 他の人が作った素材（写真・音楽・3Dモデルなど）は、GitLab を非公開のまま使う（本人の決定 2026-11-07：すでにあるものはそのまま送る）。新しく入れる時は出典を書き、なるべく非公開の Cloudflare R2 に置く。
- 100MB をこえるファイルは送らない（R2 に置く）。
- 大量の自動操作（短い間に何度も送る・たくさん作る）をしない。
