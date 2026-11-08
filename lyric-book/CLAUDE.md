# CLAUDE.md（LYRIC BOOK）

**ユーザーへの返事は、どんな場合も必ず日本語で書く。** ユーザーは大学生で、コードは書かない。説明は専門用語を避けて短く。表やボタン（選択肢）を使ってわかりやすく。3手以上の作業は作業リスト（TaskCreate）を作る。

- このフォルダ（`lyric-book/`）が LYRIC BOOK（歌詞と歌い方のノート）。仕様は SPEC.md。ROOMIN などほかのフォルダはさわらない。
- 保存先は本人のグーグルドライブ（Google Apps Script の受け口 `server/Code.gs`）。Code.gs を変えたら、本人が script.google.com に貼りかえて「デプロイを管理 → 新しいバージョン」をする必要がある。そのときは手順を画面に沿って案内し、`SERVER_VERSION` を上げる。
- 作業は GitLab の kotetsuworks-site の `claude/lyric-book` ブランチ。公開（kotetsuworks.com/lyric-book/ に出す）は、本人の OK をもらってから窓口（ROOMIN の会話）がやるので、できたら send_message で知らせる。
- 公開の OK は、本人に**窓口（ROOMIN）の会話で**「公開していい」と言ってもらう（窓口の会話に本人の OK がないと、安全のしくみで公開が止まる）。こちらは直した中身を send_message で窓口に知らせ、本人には窓口の会話で OK を出すよう案内する。
- 確かめ：`lyric-book/tests/`（Code.gs を Node でまねして動かす。README を読む。2.6.2 から gas.mjs が Code.gs を見つけなおすので、`lyric-book/tests` のままでも、親フォルダに lyric-book と tests を並べても動く。先に `/home/user/work` などで `python3 -m http.server 8765`）。
- 歌詞を取ってくるのは J-Lyric.net だけ（本人が個人利用は可と確認ずみ）。1曲ずつ、本人の操作のときだけ。まとめて集めない。歌ネットなど機械のアクセスを止めているサイトはすり抜けない。

## 止められないためのきまり
- 鍵・トークン・.env はコードや履歴に入れない。本人にもチャットに貼ってもらわない。
- 100MB をこえるファイルは送らない。大量の自動操作（短い間に何度も送る・たくさん作る）をしない。
