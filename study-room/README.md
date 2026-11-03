# へやづくり勉強

問題を解くと部屋の家具が増えていく、勉強ゲーム（いまは物理だけ）。仕様は [SPEC.md](SPEC.md)。

- 公開先: https://blackt0461-arch.github.io/-/study-room/
- 3D表示: three.js 0.169（jsDelivr から読み込み）
- 家具・壁・床・窓の外の景色: [Poly Haven](https://polyhaven.com)（CC0）。3Dデータは実行時に Poly Haven から直接読み込む
  - 素材を足したら `python3 study-room/tools/resolve_assets.py` で `js/assets.js` を作り直す
  - 窓の外の写真 `img/out-*.jpg` は Poly Haven の HDRI（meadow_2 / potsdamer_platz / venice_sunset / shanghai_bund）から切り抜いたもの
- 記録: Supabase（プロジェクト `study-room`、`https://ytvocegvtlgrnxupmbnf.supabase.co`）。`js/cloud.js` に公開してよい値（URL と Publishable key）だけを書く
  - 表 `sr_users`（ユーザー・パスワードの bcrypt・記録の JSON）と `sr_sessions`（合い鍵）。RLS 有効・ポリシーなしで、関数 `sr_signup / sr_login / sr_load / sr_save / sr_logout` からだけ読み書き（`supabase/setup.sql`）
  - 端末にも控え（localStorage `studyroom.v1.user.<名前>`）。`js/sync.js` が新しいほうを使い、変更を2.5秒ためて送る
  - 休止よけ：`.github/workflows/study-room-keepalive.yml`
  - 確認用アカウント `claude-test` / `claude-old` は消してよい（SQL Editor で `delete from sr_users where username_key in ('claude-test','claude-old');`）

## ファイル
- `js/problems.js` 問題データ
- `js/catalog.js` 部屋・家具・置き場所
- `js/room3d.js` 立体の部屋
- `js/store.js` 記録・復習・ゲージ
- `js/auth.js` ログイン（いまは端末内）
- `js/main.js` 画面の流れ
