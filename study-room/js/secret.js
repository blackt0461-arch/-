// 表に出さない家具（ガチャ・図鑑・お店・ごほうび・お知らせには出ない）。管理者画面の「補填」で、選んだ人にだけ送る。
// 受け取った人は、持ち物・模様がえで、ふつうの家具と同じように置ける。
// 3Dモデルは study-room-beta/models/ に置き、loaders.js の LOCAL_MODELS で読む（最初の一括ダウンロードには入らない）。
export const SECRET_ITEMS = [
  // みゃくみゃくのぬいぐるみ（Meshy で作ったモデルを軽くした物。床にも、棚・テーブルの上にも置ける）
  { id: 'x-myaku-plush', name: 'みゃくみゃくのぬいぐるみ', genre: 'decor', styles: ['natural', 'modern', 'retro', 'industrial'], place: 'floor', src: { model: 'myaku-plush' }, size: 0.45, secret: true, series: 'secret' },
];
export const SECRET_BY_ID = new Map(SECRET_ITEMS.map((it) => [it.id, it]));
