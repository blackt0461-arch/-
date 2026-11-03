// 訂正データの受け取り口（Google Apps Script）。スプレッドシート「コード解析 訂正データ」に貼り付けて、ウェブアプリとして公開する。
// アプリから送られた訂正データ（コード名・時間・12音の強さの数字）を、1回の送信につき1行ずつ書き足す。
// 曲の音・歌詞・名前など、誰のデータかわかるものは受け取らない（アプリ側でも送らない）。
const MAX_BYTES = 60000;

function doPost(e) {
  try {
    const body = e && e.postData ? e.postData.contents : '';
    if (!body || body.length > MAX_BYTES) return reply({ ok: false, error: 'size' });
    const d = JSON.parse(body);
    if (d.kind !== 'chord-correction' || !Array.isArray(d.corrections) || d.corrections.length > 500) return reply({ ok: false, error: 'format' });
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : '');
    const str = (v) => String(v == null ? '' : v).slice(0, 64);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sheet.appendRow([new Date(), str(d.app), str(d.song), num(d.duration), num(d.bpm), d.corrections.length, body]);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: 'parse' });
  }
}

function doGet() {
  return reply({ ok: true, info: 'chord-analyzer feedback endpoint' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
