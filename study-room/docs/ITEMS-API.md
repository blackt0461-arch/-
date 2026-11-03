# 家具まわりの共通ルール（並行作業用）

アプリ: `study-room/`（three.js 0.169、ES modules、import map で `three` / `three/addons/`）。
ブラウザで動く。ビルドなし。コメントは日本語。

## 座標・向き
- 単位はメートル。Y が上。家具の**正面は +Z**（部屋の中の人のほうを向く面）。
- 置き方 `place`：
  - `floor`：床に置く。原点は気にしなくてよい（置く側でバウンディングボックスから床に合わせる）
  - `wall`：壁に掛ける。**背中が -Z 側**、正面 +Z
  - `ceiling`：天井から吊る。上端が天井につく（置く側で合わせる）
  - `rug`：床に敷く平たい物（置く側で作る）
  - `surface`：部屋そのものの見た目（`surface` が `wall` / `floor` / `door` / `window` / `curtain`）
- 部屋：幅 6m（x: -3〜3）、奥行 5m（z: -2.5〜2.5）、天井 2.8m。
- ドアの開口：幅 0.86m・高さ 2.05m。窓の開口：幅 2.2m・高さ 1.75m（下端 0.6m）。

## 自作家具 `js/procfurn.js`（手伝い1）
```js
export function buildProc(spec) // → THREE.Group（同期で返す。テクスチャは中で非同期に読んでよい）
export const PROC_TYPES          // { type: { params: {...説明...} } } 一覧（items.js が参照）
export const MATS                // 共通の材質キー → 説明
```
- `spec = { type: 'pendant', shape: 'dome', mat: 'brass', ... }`
- 照明は `group.userData.light = { color: '#ffd9a8', intensity: 1, y: -0.3 }`（光の位置：グループ原点からの高さ）を付ける。置く側が PointLight を足す。
- 共通の材質キー（`mat` / `top` / `leg` などに使う）：
  `oak` 明るい木, `walnut` こげ茶の木, `pine` 白っぽい木, `ash` 灰色がかった木, `white` 白塗装, `black` 黒塗装/黒鉄, `brass` 真ちゅう, `chrome` クローム, `gunmetal` 鉄, `copper` 銅, `marble` 白大理石, `blackMarble` 黒大理石, `glass` ガラス, `smoked` スモークガラス, `rattan` 籐, `concrete` コンクリート, `ceramic` 白い陶器, `terracotta` 素焼き, `linen` 生成りの布, `leather` 茶色の革, `blackLeather` 黒い革, `velvet` ベルベット（色は fabric で）
- 布の色は `fabric: '#hex'`、塗装色は `color: '#hex'`。
- 型（type）と主な引数：
  - `pendant`（ceiling）: shape = cone|dome|globe|drum|bell|cage|cylinder|cluster|lantern|disc|pleated|industrial, mat, inner(色), drop(吊る長さ m)
  - `floorlamp`（floor）: shape = arc|tripod|column|drum|globe|paper|torch, mat, shade(色)
  - `sconce`（wall）: shape = cone|globe|arm|box|candle, mat
  - `sofa`（floor）: style = modern|roll|low|chester|loveseat|bench|corner, fabric, leg(材質), w(幅 m)
  - `bed`（floor）: style = platform|frame|low|metal, fabric, mat
  - `chair`（floor）: style = stool|dining|arm|lounge|bar|beanbag|pouf|bench|rocking, mat, fabric
  - `table`（floor）: style = round|rect|oval|nest|trunk|pedestal|lowJapanese|side|console|desk, top, leg, w, d, h
  - `shelf`（floor）: style = bookcase|cube|ladder|sideboard|cabinet|display|low, mat, books(true/false), w, h
  - `plant`（floor）: pot = round|tall|bowl|basket|square|stand, potColor, foliage = bush|tree|cactus|palm|grass|monstera, size(高さの目安 m)
  - `vase`（floor の小物）: shape = bottle|round|tall|bowl|amphora|jug, color, gloss(0〜1), flowers(true/false)
  - `books`（floor の小物）: n, colors[], stand(true/false)
  - `candle`（floor の小物）: n, holder(材質)
  - `frame`（wall）: img(画像パス), frame(材質 or 色), w, h, mat(余白 true/false)
  - `mirror`（wall）: shape = round|rect|arch|sunburst, frame(材質)
  - `clock`（wall）: style = simple|station|wood|minimal, rim(材質)
  - `wallshelf`（wall）: style = plank|box|bracket, mat, items(true/false)
  - `door`（surface door）: style = flat|panel2|panel4|glass|barn|louver|shaker, color, handle(材質)。開口 0.86×2.05 にぴったりの扉＋枠。下端が y=0、中心 x=0、部屋側の面が +Z
  - `window`（surface window）: style = grid4|grid6|single|transom|cross|slim|arched, frame(色 or 材質)。開口 2.2×1.75 の枠・桟・ガラス・窓台。中心 (0,0)、部屋側が +Z
  - `guitar` style = acoustic|electric|bass|classic、color
  - `keyboard` / `speaker`(style) / `turntable` / `drum` / `easel`(img) / `telescope` / `globe` / `gamechair` / `amp` / `micstand` / `bookstack`（いずれも floor、色や材質の引数は自由に）

## 家具リスト `js/items.js`（手伝い2）
```js
export const GENRES = [ { id, name, icon } ]   // icon は icons.js の名前
export const ITEMS = [ {
  id: 'light-dome-brass',        // 一意。英数字とハイフン
  name: '真ちゅうのドームライト',   // 日本語
  genre: 'light',
  styles: ['retro', 'industrial'],// natural | industrial | retro | modern（1〜2個）
  place: 'ceiling',              // floor | wall | ceiling | rug | surface
  surface: undefined,            // place が surface のとき wall|floor|door|window|curtain
  src: { proc: {type:'pendant', shape:'dome', mat:'brass'} }
     // または { model: 'sofa_02', tint?: '#hex', paint?: '#hex' }   Poly Haven のモデル
     // または { tex: 'oak_wood_planks', rep?: 3, tint?: '#hex' }     床・壁・ラグ（Poly Haven の質感）
     // または { color: '#hex' }                                      単色の壁
     // または { curtain: { color, opacity } }                       カーテン
  size: 1.0,                     // 大きさの目安（最大辺 m）。モデルが大きすぎるとき縮める
  rare: false,                   // 図鑑で「レア」
} ]
export const SPECIAL_IDS = [...] // 克服のごほうび専用（購入では出ない）
```
- ジャンル（id）：`light` 照明, `sofa` ソファ・ベッド, `chair` 椅子, `table` テーブル, `storage` 収納・棚, `plant` 植物, `decor` 小物, `wallart` 壁かけ, `textile` カーテン・ラグ, `interior` 壁紙・床, `fixture` ドア・窓, `hobby` 趣味
- 各ジャンル **20種類以上**。部屋の雰囲気（natural/industrial/retro/modern）がどれも偏らずに入っていること。
- 最初から持っている物：`STARTER = { wall, floor, door, window, curtain }` の id を export（無地の壁・ふつうの床・白いドア・白い窓・なし）。

## サムネイル `js/thumbs.js`・アイコン `js/icons.js`（手伝い3）
```js
// thumbs.js
export function thumbURL(item)          // モデル → Poly Haven の CDN 画像 URL。proc → null（renderThumb を使う）
export async function renderThumb(item) // → dataURL（proc や tex/color/curtain を小さく描く。結果は覚えておく）
// icons.js
export const ICONS = { name: '<svg ...>' } // 24×24、stroke=currentColor、塗りなし、線幅は CSS で
export function icon(name, cls='')       // → '<span class="ic ...">svg</span>'
```
