// LYRIC BOOK バックアップ係（Google Apps Script）
// 5分ごとに LYRIC BOOK を見て、変わっていたらグーグルドライブに保存する。
// ドライブの「LYRIC BOOK バックアップ」フォルダに：
//   LYRIC BOOK 最新.json … いちばん新しいデータ（アプリの「バックアップから戻す」で使う）
//   歌詞まとめ.txt       … 全部の歌詞を読める形で
//   日ごと/              … 1日1つ、30日分
//   録音/                … 録音のファイル
// はじめに上のメニューで「setup」を選んで「実行」を押す（1回だけ）。

const SUPABASE_URL = '{{SUPABASE_URL}}';
const SUPABASE_KEY = '{{SUPABASE_KEY}}';
const BACKUP_KEY = '{{BACKUP_KEY}}';
const FOLDER_NAME = 'LYRIC BOOK バックアップ';
const KEEP_DAYS = 30;

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backup').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().deleteAllProperties();
  backup(true);
  Logger.log('準備ができました。これから5分ごとに自動でバックアップします。');
}

function rpc_(name, body) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'post', contentType: 'application/json',
    headers: { apikey: SUPABASE_KEY },
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  const text = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error(name + ': ' + text);
  return text ? JSON.parse(text) : null;
}

function folder_(parent, name) {
  const p = parent || DriveApp.getRootFolder();
  const it = p.getFoldersByName(name);
  return it.hasNext() ? it.next() : p.createFolder(name);
}

function put_(folder, name, text) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, MimeType.PLAIN_TEXT);
}

function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60); }

function backup(force) {
  const props = PropertiesService.getScriptProperties();
  const state = rpc_('lb_backup_state', { p_key: BACKUP_KEY });
  if (force !== true && state.changed_at && state.changed_at === props.getProperty('last')) return;

  const d = rpc_('lb_backup_export', { p_key: BACKUP_KEY });
  const root = folder_(null, FOLDER_NAME);
  const days = folder_(root, '日ごと');
  const recs = folder_(root, '録音');
  const json = JSON.stringify(d);
  const day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  put_(root, 'LYRIC BOOK 最新.json', json);
  put_(days, 'LYRIC BOOK ' + day + '.json', json);

  // 読める形の歌詞まとめ
  const artists = {};
  (d.artists || []).forEach(a => { artists[a.id] = a.data.name; });
  const songs = (d.songs || []).slice().sort((x, y) => {
    const ax = x.data.kind === 'real' ? (artists[x.data.artist_id] || '') : '～自作';
    const ay = y.data.kind === 'real' ? (artists[y.data.artist_id] || '') : '～自作';
    return ax.localeCompare(ay, 'ja') || String(x.data.title || '').localeCompare(String(y.data.title || ''), 'ja');
  });
  const txt = songs.map(s => {
    const who = s.data.kind === 'real' ? (artists[s.data.artist_id] || '') : '自作';
    return '■ ' + (s.data.title || '題名なし') + '　／　' + who + '\n\n' + (s.data.text || '') + '\n';
  }).join('\n――――――――――\n\n');
  put_(root, '歌詞まとめ.txt', 'LYRIC BOOK 歌詞まとめ（' + day + '）\n\n' + txt);

  // 録音：新しいもの・録り直したものだけ送る（消した録音のファイルは念のため残す）
  const done = JSON.parse(props.getProperty('recs') || '{}');
  const now = {};
  const titles = {};
  songs.forEach(s => { titles[s.id] = s.data.title || '題名なし'; });
  (d.recordings || []).forEach(r => {
    now[r.id] = r.updated_at;
    if (done[r.id] === r.updated_at) return;
    const a = rpc_('lb_backup_recording', { p_key: BACKUP_KEY, p_id: r.id });
    const ext = /mp4|aac|m4a/.test(a.mime) ? 'm4a' : /ogg/.test(a.mime) ? 'ogg' : 'webm';
    const tag = r.id.slice(0, 8);
    const old = recs.searchFiles('title contains "' + tag + '"');
    while (old.hasNext()) old.next().setTrashed(true);
    const name = safe_(titles[r.song_id]) + '　' + safe_(r.name) + '　' + tag + '.' + ext;
    recs.createFile(Utilities.newBlob(Utilities.base64Decode(a.audio), a.mime, name));
  });
  props.setProperty('recs', JSON.stringify(now));

  // 30日より前の「日ごと」を消す
  const limit = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  const it = days.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getDateCreated().getTime() < limit) f.setTrashed(true); }

  props.setProperty('last', state.changed_at || '');
  rpc_('lb_backup_done', { p_key: BACKUP_KEY, p_info: { songs: songs.length, recordings: (d.recordings || []).length, folder: root.getUrl() } });
}
