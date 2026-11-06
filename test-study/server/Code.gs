// テスト勉強の受け口（Google Apps Script）
// あなたのグーグルドライブの「テスト勉強」フォルダに、勉強の記録と記述の答え（写真も）を保存する。
//
// はじめに1回だけ：
//   1. 上の「実行する関数」で setup を選んで「実行」→ 許可する
//   2. 右上の「デプロイ」→「新しいデプロイ」→ 種類は「ウェブアプリ」
//      次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員 →「デプロイ」
//   3. 出てきた「ウェブアプリ」のURLを、アプリの「ドライブ連携」に貼る
//
// アプリで最初に決めた「合言葉」を知っている人だけが読み書きできる。
// 新しい版のコードに貼りかえたときは、「デプロイ」→「デプロイを管理」→ えんぴつ →「新バージョン」→「デプロイ」。

const ROOT_NAME = 'テスト勉強';
const DB_NAME = '記録（さわらないでください）.json';
const ANSWERS = '記述の答え';
const SERVER_VERSION = 1;

function setup() {
  root_();
  Logger.log('準備ができました。次は右上の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」です。');
}

function doGet() { return out_({ ok: true, app: 'test-study', version: SERVER_VERSION }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ error: 'server' }); }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (x) { return out_({ error: 'busy' }); }
  try {
    const fn = API[req.fn];
    if (!fn) throw err_('server');
    check_(req.key);
    return out_({ ok: true, result: fn(req.args || {}) });
  } catch (x) {
    return out_({ error: x.code || 'server', detail: String(x && x.message || x) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code) { const e = new Error(code); e.code = code; return e; }

// ---------- 合言葉 ----------
// 最初に送られてきた合言葉を登録し、以後はそれと同じものだけ受けつける。10回まちがえると10分止める。
function hash_(text) {
  let h = 'test-study|' + text;
  for (let i = 0; i < 200; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}
function check_(key) {
  key = String(key || '');
  if (key.length < 4) throw err_('bad_key');
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const fails = +(cache.get('fails') || 0);
  if (fails >= 10) throw err_('too_many');
  const saved = props.getProperty('keyHash');
  const h = hash_(key);
  if (!saved) { props.setProperty('keyHash', h); return; }
  if (saved !== h) { cache.put('fails', String(fails + 1), 600); throw err_('bad_key'); }
}

// ---------- ドライブ ----------
function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function root_() { return folder_(DriveApp.getRootFolder(), ROOT_NAME); }
function dbFile_() {
  const r = root_();
  const it = r.getFilesByName(DB_NAME);
  return it.hasNext() ? it.next() : r.createFile(DB_NAME, JSON.stringify({ records: {}, plan: {} }), MimeType.PLAIN_TEXT);
}
function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40); }

// 問題ごとに、新しく解いたほうを残す（2台の端末で使っても消えないように）
function merge_(a, b) {
  const out = { records: Object.assign({}, a.records || {}), plan: { days: {}, dates: {}, datesAt: 0 } };
  Object.keys(b.records || {}).forEach(function (k) {
    const r = b.records[k], m = out.records[k];
    if (!m || (r.t || 0) > (m.t || 0)) out.records[k] = r;
  });
  [a.plan || {}, b.plan || {}].forEach(function (p) {
    Object.keys(p.days || {}).forEach(function (day) {
      const d = out.plan.days[day] = out.plan.days[day] || {};
      Object.keys(p.days[day]).forEach(function (tk) { d[tk] = Math.max(d[tk] || 0, p.days[day][tk]); });
    });
    if ((p.datesAt || 0) >= out.plan.datesAt) { out.plan.dates = p.dates || {}; out.plan.datesAt = p.datesAt || 0; }
  });
  out.updated = new Date().toISOString();
  return out;
}

const API = {
  hello: function () { root_(); return { version: SERVER_VERSION }; },
  // アプリの記録を受けとって、ドライブの記録とあわせ、あわせた結果を返す
  sync: function (args) {
    const f = dbFile_();
    const saved = JSON.parse(f.getBlob().getDataAsString('UTF-8') || '{}');
    const merged = merge_(saved, args.state || {});
    f.setContent(JSON.stringify(merged));
    return merged;
  },
  // 記述の答え1件（写真つきもある）。授業ごとのフォルダに、答え（.json）と写真（.jpg）を置く
  answer: function (args) {
    const a = args.answer || {};
    const dir = folder_(folder_(root_(), ANSWERS), safe_(a.course + '・' + a.test));
    const stamp = Utilities.formatDate(new Date(a.t || Date.now()), 'Asia/Tokyo', 'yyyy-MM-dd_HHmm');
    const base = stamp + '_' + safe_(a.uid);
    if (dir.getFilesByName(base + '.json').hasNext()) return { dup: true };
    let photo = '';
    if (a.photo) {
      const blob = Utilities.newBlob(Utilities.base64Decode(a.photo), 'image/jpeg', base + '.jpg');
      photo = dir.createFile(blob).getName();
    }
    const body = { 授業: a.course, テスト: a.test, 問題: a.q, 答え: a.text || '', 写真: photo, 自己採点: a.self, 書けたポイント: a.points || [], 日時: stamp, 問題id: a.key };
    dir.createFile(base + '.json', JSON.stringify(body, null, 1), MimeType.PLAIN_TEXT);
    return { ok: true };
  },
};
