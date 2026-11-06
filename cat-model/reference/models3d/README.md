# 集めた3Dモデル

## cats/ … 普通の猫の全身モデル 28個
- Objaverse 1.0（Hugging Face の allenai/objaverse）から、ログインなしで取得。元はすべて Sketchfab の公開モデル
- 一覧（名前・作者・ライセンス・元のページ）は `cats/index.json`、見本は `contact_1-14.png` / `contact_15-28.png`
- `.glb` 本体は大きいので git には入れない。取り直すときは index.json の uid から
  `https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/<フォルダ>/<uid>.glb`（フォルダは object-paths.json.gz で引く）
- `view.html?f=<id>.glb&yaw=40&pitch=15` で大きさをそろえて映せる（開発用）
- 使うときは各モデルのライセンス（CC BY なら作者名の表示）を守る

## mripas_skulls/ … 本物の猫の頭骨の3Dスキャン（研究所の公開データ）
- ポーランド科学アカデミー哺乳類研究所（Open Forest Data、CC BY 4.0）。標本 51370・603・51372
- `.stl` 本体は git に入れない。dataverse.openforestdata.pl の API から取り直せる
