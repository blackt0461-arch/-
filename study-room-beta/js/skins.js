// 画面の着せ替え。見た目そのものは theme.css（A）と skins.css（ほか）にある。
// ここは名前・レア度・小さな絵（サムネイル）の色だけ。
// c = [背景, 板, ボタン, アクセント]
export const SKINS = [
  { id: 'a', name: '静かな上質', rarity: 0, desc: '基本の見た目。すりガラスの黒と白いボタン', c: ['#1a1a1d', '#2c2c31', '#f2efe9', '#d8c3a0'] },
  { id: 'b', name: '木のぬくもり', rarity: 4, desc: 'クリーム色と丸い文字。やさしい手ざわり', c: ['#fff8ee', '#f3e6d2', '#7fb069', '#ffb85c'] },
  { id: 'c', name: 'ミニマル・ライト', rarity: 4, desc: '白いすりガラスと黒い文字。いちばんシンプル', c: ['#f2f2f4', '#ffffff', '#111111', '#111111'] },
  { id: 'd', name: 'スタイリッシュ', rarity: 4, desc: '黒・白・赤と斜めの形。強いコントラスト', c: ['#0b0b0b', '#1d1d1d', '#e5322d', '#ffffff'] },
  { id: 'e1', name: 'ネオン', rarity: 4, series: 'band', desc: 'ライブハウスの夜。ピンクと水色のネオン', c: ['#0c0c10', '#17171e', '#ff3d8b', '#33e1ff'] },
  { id: 'e2', name: 'ヴィンテージアンプ', rarity: 4, series: 'band', desc: 'こげ茶の革と電球色。落ち着いたロック', c: ['#33210f', '#3f2a19', '#f1e2c0', '#ffb347'] },
  { id: 'e3', name: 'ライブフライヤー', rarity: 4, series: 'band', desc: '白黒コピーの紙と黄色いテープ。パンク', c: ['#f4f1ea', '#ffffff', '#111111', '#ffd400'] },
  { id: 'e4', name: 'フェスステージ', rarity: 4, series: 'band', desc: '夕焼け色のグラデーション。いちばん派手', c: ['#140a28', '#24113f', '#ff3d8b', '#ff9f2e'] },
  { id: 'e5', name: 'バンドルーム', rarity: 5, series: 'band', desc: 'モデルハウスの赤いドラムとネオン', c: ['#0e0c0d', '#1c1718', '#d4202f', '#ff4fa3'] },
];
export const skinById = (id) => SKINS.find(s => s.id === id) || SKINS[0];
export const skinItemId = (id) => 'skin-' + id;

// 小さな絵：スマホの画面に、スロットと「解く」の丸を描いたもの
export function skinThumbURL(id) {
  const [bg, panel, btn, ac] = skinById(id).c;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="26" y="6" width="48" height="88" rx="9" fill="${bg}" stroke="${ac}" stroke-opacity=".5" stroke-width="1.2"/>
<rect x="31" y="12" width="26" height="7" rx="2.5" fill="${panel}"/><rect x="59" y="12" width="10" height="7" rx="2.5" fill="${panel}"/>
<rect x="31" y="24" width="38" height="40" rx="3" fill="${ac}" fill-opacity=".14"/>
${[0, 1, 2, 3].map(i => `<rect x="${31 + i * 6.6}" y="80" width="5.4" height="5.4" rx="1.2" fill="${i ? panel : ac}"/>`).join('')}
<circle cx="62" cy="80" r="6.5" fill="none" stroke="${ac}" stroke-width="1.6"/><circle cx="62" cy="80" r="4.6" fill="${btn}"/>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
