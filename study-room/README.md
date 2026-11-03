# へやづくり勉強

問題を解くと部屋の家具が増えていく、勉強ゲーム（いまは物理だけ）。仕様は [SPEC.md](SPEC.md)。

- 公開先: https://blackt0461-arch.github.io/-/study-room/
- 3D表示: three.js 0.169（jsDelivr から読み込み）
- 家具・壁・床・窓の外の景色: [Poly Haven](https://polyhaven.com)（CC0）。3Dデータは実行時に Poly Haven から直接読み込む
  - 素材を足したら `python3 study-room/tools/resolve_assets.py` で `js/assets.js` を作り直す
  - 窓の外の写真 `img/out-*.jpg` は Poly Haven の HDRI（meadow_2 / potsdamer_platz / venice_sunset / shanghai_bund）から切り抜いたもの
- 記録: いまは端末の localStorage にユーザーごと（`studyroom.v1.user.<名前>`）。あとで Supabase に移す予定

## ファイル
- `js/problems.js` 問題データ
- `js/catalog.js` 部屋・家具・置き場所
- `js/room3d.js` 立体の部屋
- `js/store.js` 記録・復習・ゲージ
- `js/auth.js` ログイン（いまは端末内）
- `js/main.js` 画面の流れ
