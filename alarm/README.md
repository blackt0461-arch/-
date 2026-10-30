# 目覚まし管理

Claude（メッセージ）とWeb画面で起床時刻を管理し、iPhoneのショートカットで標準アラームに反映する仕組みです。

```
Claude ─┐
        ├─▶ alarm-data/alarms.json（非公開リポジトリ）─▶ iPhoneショートカット ─▶ 時計アプリ
Web画面 ┘
```

- `index.html` … Web画面（GitHub Pagesで公開）。トークンは端末のブラウザにだけ保存します。
- `schedule.js` … 共通ロジック。Web画面と `tools/regen.mjs` の両方で使います。
- `tools/regen.mjs` … `alarms.json` を検証し、`schedule` を作り直して、14日分を表示します。
- `SHORTCUT.md` … iPhoneショートカットの作り方です。
- `assistant.js` … チャット欄のAI（Gemini）。文章を変更案に変換し、ユーザーが「保存する」を押したときだけ保存します。
- `icon.svg` / `*.png` / `manifest.webmanifest` … ホーム画面用のアイコンとWebアプリ設定です。
- `version.json` / `tools/bump.mjs` … 版の番号です。Webアプリのファイルを変更したら `node alarm/tools/bump.mjs "更新内容"` を実行してからプッシュしてください。開いているアプリに「新しい版があります」と表示されます。

## alarms.json

```jsonc
{
  "weekly": {                       // 曜日ごとの基本パターン（null = 鳴らさない）
    "mon": { "time": "06:30", "extra": 2, "interval": 5 },  // 6:30, 6:35, 6:40
    "sun": null
  },
  "overrides": {                    // 例外の日（null = その日は鳴らさない）
    "2026-11-03": { "time": "05:00", "extra": 0, "interval": 5 },
    "2026-11-06": null
  },
  "schedule": { ... }               // 自動生成（今日から60日分）。ショートカットはここだけを読みます
}
```

`weekly` や `overrides` を変更したら、**必ず `schedule` を作り直してください**（Web画面は保存時に自動で作り直します）。

## Claudeが編集するときの手順

```sh
git clone <alarm-data> /tmp/alarm-data
# weekly / overrides を編集する
node alarm/tools/regen.mjs /tmp/alarm-data/alarms.json   # 検証・再生成・14日分の確認
cd /tmp/alarm-data && git commit -am "..." && git push
```

- 時刻は24時間表記の `"HH:MM"` で書きます。日付は日本時間（JST）です。
- 7日以上前の例外は、再生成のときに自動で消えます。
- 予定は60日先までしか作られません。60日以上だれも保存しないと、ショートカットが「期限切れ」と通知します。そのあいだも、曜日ごとの繰り返しアラームは鳴り続けます。
