# 物理の新しい出し方（1.17.0〜）

ROOMIN の「物理」（1.17.0 で「物理（公式）」と「物理（4択）」を1つにした）に、4択・公式（文字→公式）といっしょにランダムにまざって出る問題です。

| type | 出し方 | 中身 |
|---|---|---|
| `num` | 数値を入れる計算 | `ans`（正解の数）・`unitText`（単位）・`tol`（何割までのずれを正解にするか。ふつう 0.03）・`ansText`（見せ方。5.0×10³ など） |
| `build` | 公式を組み立てる／`kind: 'unit'` で単位を組み立てる | `parts`（文字は固定、`{ a: 正解, g: 同じ番号は順番自由, sup: '²' }` が空らん）・`pool`（ダミー） |
| `order` | 並べかえ | `items`（正しい順）・`ends`（はじめ／あと などの見出し） |
| なし＋`fig` | グラフつき4択 | `choices`・`answer`（ふつうの4択は roomin-questions/src に書く） |

`fig`（グラフ）はどの出し方にも付けられる：`{ x, y, xl, yl, xt, yt, lines: [{ pts, fill }], dots, alt }`（波は `wave: { A, lam, x0 }`）。

## 作り方

1. `src/<番号>_<単元>.js` に書く（1ファイル1単元）。`num` には、問題文の数字だけで答えを計算する `calc: () => …` を必ず付ける。
2. `node roomin-questions/physics-x/build.js` … 1問ずつ確かめて（calc と ans が合うか・ダミーが答えとかぶらないか など）`data/` に書き出す。まちがいがあると書き出さない。
3. `node study-room-beta/tools/bank/build.js` … アプリの `data/bank/physics.json` に入る（番号は出し方と問題文から作るので、足しても前の記録とずれない）。
4. 画面の確かめ：`node study-room-beta/tools/check/physics.js`

AI が作った問題なので、作ったら別の目（ほかのエージェントなど）で1問ずつ解き直す。

## いまある単元

- 物理基礎／運動の表し方 32問、物理基礎／運動の法則 29問（2026-11-08）
