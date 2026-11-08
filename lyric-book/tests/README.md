# LYRIC BOOK のテスト（Google Apps Script のまね）

本物の受け口（Google）を使わずに、`server/Code.gs` をそのまま Node で動かして試すためのもの。

- `gas.mjs`：DriveApp・Utilities・PropertiesService などのまね
- `e2e2.mjs`：登録・録音・電波なし・かぶり・バックアップ・戻す・パスワードの作り直し
- `e2e3.mjs`：管理する人とメンバー（招待の合言葉・外す）
- `e2e4.mjs`：2.0 の機能（ジャケット・推定・本番モード・セットリスト・最近消した曲・みんなの曲）
- `e2e5.mjs`：速さ（受け口を2.5秒かかるまねにして、開く速さと録音の再生を測る）
- `e2e6.mjs`：2.2 の機能（自分のタブ・歌手の曲の一覧・リリース年・保存ボタンの位置・線）

## 動かし方
1. リポジトリの親フォルダで `python3 -m http.server 8765`（`http://localhost:8765/lyric-book/` が開けるように）
2. このフォルダで Playwright（chromium）を使えるようにして `node e2e5.mjs` など
   - 各ファイルの先頭の `createRequire(...)` と Code.gs のパスは、自分の環境に合わせて直す
   - e2e2〜e2e4 は画面写真の保存先を引数で受け取る（`node e2e4.mjs ./shots`）
- 本物の受け口の URL には lb_signup を送らないこと（データが空だと、その人が管理する人になってしまう）
- `e2e7.mjs`：2.3 の歌詞の取りこみ（J-Lyric.net に本当に1曲だけ問い合わせる）
