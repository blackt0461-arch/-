// LYRIC BOOK の受け口（Google Apps Script）
// あなたのグーグルドライブの「LYRIC BOOK」フォルダに、歌詞・録音・バックアップを保存する。
//
// はじめに1回だけ：
//   1. 上の「実行する関数」で setup を選んで「実行」→ 許可する
//   2. 右上の「デプロイ」→「新しいデプロイ」→ 種類は「ウェブアプリ」
//      次のユーザーとして実行：自分 ／ アクセスできるユーザー：全員 →「デプロイ」
//   3. 出てきた「ウェブアプリ」のURLを、アプリを作っている人に送る
//
// 最初に登録した人が「管理する人」。2人目からは、管理する人が決めた「招待の合言葉」がないと登録できない。
// 新しい版のコードに貼りかえたときは、「デプロイ」→「デプロイを管理」→ えんぴつ →「新バージョン」→「デプロイ」。

const ROOT_NAME = 'LYRIC BOOK';
const DB_NAME = 'データ（さわらないでください）.json';
const KEEP_DAYS = 30;
const SERVER_VERSION = 3;

// ---------- はじめの準備 ----------
function setup() {
  root_();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backup').timeBased().everyMinutes(10).create();
  Logger.log('準備ができました。次は右上の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」です。');
}

// ---------- 入口 ----------
function doGet() { return out_({ ok: true, app: 'LYRIC BOOK', version: SERVER_VERSION }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ error: 'server' }); }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (x) { return out_({ error: 'busy' }); }
  try {
    const fn = API[req.fn];
    if (!fn) throw err_('missing');
    const db = load_();
    const result = fn(db, req.args || {});
    if (db._dirty) { delete db._dirty; save_(db); }
    return out_({ ok: true, result: result === undefined ? null : result });
  } catch (x) {
    return out_({ error: x.code || 'server', detail: String(x && x.message || x) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code) { const e = new Error(code); e.code = code; return e; }
const now_ = () => new Date().toISOString();

// ---------- ドライブ ----------
function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function root_() { return folder_(DriveApp.getRootFolder(), ROOT_NAME); }
function dbFile_() {
  const r = root_();
  const it = r.getFilesByName(DB_NAME);
  return it.hasNext() ? it.next() : r.createFile(DB_NAME, JSON.stringify({ users: {}, sessions: {} }), MimeType.PLAIN_TEXT);
}
function load_() {
  const db = JSON.parse(dbFile_().getBlob().getDataAsString('UTF-8') || '{}');
  db.users = db.users || {}; db.sessions = db.sessions || {};
  return db;
}
function save_(db) { dbFile_().setContent(JSON.stringify(db)); }
function put_(folder, name, text) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, MimeType.PLAIN_TEXT);
}
function safe_(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60); }

// ---------- 合言葉・パスワード ----------
function hash_(text, salt) {
  let h = salt + '|' + text;
  for (let i = 0; i < 300; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}
function nameKey_(s) { return String(s || '').trim().normalize('NFKC').toLowerCase(); }
function recKey_(s) { return String(s || '').normalize('NFKC').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function token_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function makeRecovery_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
  for (let i = 0; i < 12; i++) { r += abc[(bytes[i] + 256) % 32]; if (i === 3 || i === 7) r += '-'; }
  return r;
}
// 何回もまちがえたら、しばらく止める
function guard_(key) {
  const c = CacheService.getScriptCache();
  const n = +(c.get('fail_' + key) || 0);
  if (n >= 10) throw err_('too_many');
}
function failed_(key) {
  const c = CacheService.getScriptCache();
  c.put('fail_' + key, String(+(c.get('fail_' + key) || 0) + 1), 600);
}
function session_(db, uid) {
  const t = token_();
  db.sessions[t] = { uid: uid, last: now_() };
  db._dirty = true;
  return t;
}
function who_(db, token) {
  const s = db.sessions[token];
  if (!s || !db.users[s.uid]) throw err_('bad_token');
  return db.users[s.uid];
}
function touch_(db, u) { u.changed_at = now_(); db._dirty = true; }
// 管理する人（最初に登録した人）
function owner_(db) {
  const ids = Object.keys(db.users);
  for (const id of ids) if (db.users[id].owner) return db.users[id];
  if (!ids.length) return null;
  const first = ids.map(id => db.users[id]).sort((a, b) => String(a.changed_at || '') < String(b.changed_at || '') ? -1 : 1)[0];
  first.owner = true; db._dirty = true;
  return first;
}
function needOwner_(db, token) {
  const u = who_(db, token);
  if (owner_(db) !== u) throw err_('not_owner');
  return u;
}
function inviteCode_() { return makeRecovery_().slice(0, 9); }
function userByName_(db, name) {
  const k = nameKey_(name);
  for (const id in db.users) if (db.users[id].key === k) return db.users[id];
  return null;
}

// ---------- 録音のファイル ----------
// 管理する人は「LYRIC BOOK」直下、メンバーは「LYRIC BOOK/メンバー/名前」
function userRoot_(u) { return u.owner ? root_() : folder_(folder_(root_(), 'メンバー'), safe_(u.username)); }
function recFolder_(u) { return folder_(userRoot_(u), '録音'); }
function removedFolder_(u) { return folder_(recFolder_(u), '消した録音'); }
function extOf_(mime) { return /mp4|aac|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'; }
function writeAudio_(u, r, b64) {
  const song = u.songs[r.song_id];
  const name = safe_(song && song.data.title || '題名なし') + '　' + safe_(r.name) + '　' + r.id.slice(0, 8) + '.' + extOf_(r.mime);
  return recFolder_(u).createFile(Utilities.newBlob(Utilities.base64Decode(b64), r.mime, name)).getId();
}
function retire_(u, fileId) {
  try { const f = DriveApp.getFileById(fileId); f.moveTo(removedFolder_(u)); } catch (x) { /* もうない */ }
}
function recMeta_(id, r) {
  return { id: id, song_id: r.song_id, name: r.name, mime: r.mime, duration: r.duration, size: r.size, created_at: r.created_at, updated_at: r.updated_at };
}
function list_(obj) {
  return Object.keys(obj || {}).map(id => ({ id: id, data: obj[id].data, created_at: obj[id].created_at, updated_at: obj[id].updated_at }));
}

// ---------- アプリから呼ぶもの ----------
const API = {
  lb_signup(db, a) {
    const owner = owner_(db);
    if (owner) {
      guard_('invite');
      if (!owner.invite || recKey_(a.p_invite) !== recKey_(owner.invite)) { failed_('invite'); throw err_('bad_invite'); }
    }
    const k = nameKey_(a.p_username);
    if (k.length < 2 || k.length > 20) throw err_('name_length');
    if (String(a.p_password || '').length < 4) throw err_('password_short');
    if (userByName_(db, a.p_username)) throw err_('name_taken');
    if (Object.keys(db.users).length >= 20) throw err_('too_many_users');
    const uid = Utilities.getUuid();
    const salt = Utilities.getUuid(), rsalt = Utilities.getUuid();
    const rec = makeRecovery_();
    db.users[uid] = {
      id: uid, username: String(a.p_username).trim().normalize('NFKC'), key: k,
      salt: salt, pass: hash_(a.p_password, salt), rsalt: rsalt, rec: hash_(recKey_(rec), rsalt),
      settings: {}, changed_at: now_(), artists: {}, songs: {}, recordings: {},
      owner: !owner, invite: owner ? null : inviteCode_(), created_at: now_(),
    };
    db._dirty = true;
    return { token: session_(db, uid), username: db.users[uid].username, recovery: rec };
  },
  lb_login(db, a) {
    const k = nameKey_(a.p_username);
    guard_(k);
    const u = userByName_(db, a.p_username);
    if (!u || u.pass !== hash_(a.p_password, u.salt)) { failed_(k); throw err_('bad_login'); }
    return { token: session_(db, u.id), username: u.username };
  },
  lb_reset(db, a) {
    const k = nameKey_(a.p_username);
    guard_(k);
    const u = userByName_(db, a.p_username);
    if (!u || u.rec !== hash_(recKey_(a.p_recovery), u.rsalt)) { failed_(k); throw err_('bad_recovery'); }
    if (String(a.p_password || '').length < 4) throw err_('password_short');
    u.salt = Utilities.getUuid(); u.pass = hash_(a.p_password, u.salt);
    for (const t in db.sessions) if (db.sessions[t].uid === u.id) delete db.sessions[t];
    db._dirty = true;
    return { token: session_(db, u.id), username: u.username };
  },
  lb_logout(db, a) { if (db.sessions[a.p_token]) { delete db.sessions[a.p_token]; db._dirty = true; } },
  lb_load(db, a) {
    const u = who_(db, a.p_token);
    const p = PropertiesService.getScriptProperties();
    const info = JSON.parse(p.getProperty('backup_info_' + u.id) || 'null');
    const isOwner = owner_(db) === u;
    return {
      username: u.username, settings: u.settings, is_owner: isOwner, server_version: SERVER_VERSION,
      artists: list_(u.artists), songs: list_(u.songs),
      recordings: Object.keys(u.recordings).map(id => recMeta_(id, u.recordings[id])).sort((x, y) => x.created_at < y.created_at ? -1 : 1),
      backup: { enabled: true, at: p.getProperty('backup_at_' + u.id), info: info, changed_at: u.changed_at },
    };
  },
  lb_save_settings(db, a) { const u = who_(db, a.p_token); u.settings = a.p_settings || {}; touch_(db, u); },
  lb_save_artist(db, a) {
    const u = who_(db, a.p_token);
    const cur = u.artists[a.p_id];
    const t = now_();
    u.artists[a.p_id] = { data: a.p_data, created_at: cur ? cur.created_at : t, updated_at: t };
    touch_(db, u);
    return { created_at: u.artists[a.p_id].created_at, updated_at: t };
  },
  lb_delete_artist(db, a) {
    const u = who_(db, a.p_token);
    for (const id in u.songs) if (u.songs[id].data && u.songs[id].data.artist_id === a.p_id) API.lb_delete_song(db, { p_token: a.p_token, p_id: id });
    delete u.artists[a.p_id];
    touch_(db, u);
  },
  // p_base：この端末が最後に見た更新日時。こちらのほうが新しければ、別の端末で直されている
  lb_save_song(db, a) {
    const u = who_(db, a.p_token);
    const cur = u.songs[a.p_id];
    if (cur && a.p_base && new Date(cur.updated_at).getTime() > new Date(a.p_base).getTime() + 1000) throw err_('conflict');
    const t = now_();
    u.songs[a.p_id] = { data: a.p_data, created_at: cur ? cur.created_at : t, updated_at: t };
    touch_(db, u);
    return { created_at: u.songs[a.p_id].created_at, updated_at: t };
  },
  lb_delete_song(db, a) {
    const u = who_(db, a.p_token);
    for (const id in u.recordings) if (u.recordings[id].song_id === a.p_id) { retire_(u, u.recordings[id].file); delete u.recordings[id]; }
    delete u.songs[a.p_id];
    touch_(db, u);
  },
  lb_add_recording(db, a) {
    const u = who_(db, a.p_token);
    if (!u.songs[a.p_song_id]) throw err_('not_found');
    const id = Utilities.getUuid(), t = now_();
    const r = { song_id: a.p_song_id, name: String(a.p_name || '録音').slice(0, 40), mime: a.p_mime, duration: a.p_duration || 0, size: String(a.p_audio || '').length, created_at: t, updated_at: t };
    r.id = id;
    r.file = writeAudio_(u, r, a.p_audio);
    delete r.id;
    u.recordings[id] = r;
    touch_(db, u);
    return recMeta_(id, r);
  },
  lb_replace_recording(db, a) {
    const u = who_(db, a.p_token);
    const r = u.recordings[a.p_id];
    if (!r) throw err_('not_found');
    retire_(u, r.file);
    r.mime = a.p_mime; r.duration = a.p_duration || 0; r.size = String(a.p_audio || '').length; r.updated_at = now_();
    r.id = a.p_id; r.file = writeAudio_(u, r, a.p_audio); delete r.id;
    touch_(db, u);
    return recMeta_(a.p_id, r);
  },
  lb_rename_recording(db, a) {
    const u = who_(db, a.p_token);
    const r = u.recordings[a.p_id];
    if (!r) throw err_('not_found');
    r.name = String(a.p_name || '').slice(0, 40); r.updated_at = now_();
    try { DriveApp.getFileById(r.file).setName(safe_(u.songs[r.song_id] && u.songs[r.song_id].data.title || '題名なし') + '　' + safe_(r.name) + '　' + a.p_id.slice(0, 8) + '.' + extOf_(r.mime)); } catch (x) { /* 名前は変えられなくてもよい */ }
    touch_(db, u);
  },
  lb_delete_recording(db, a) {
    const u = who_(db, a.p_token);
    const r = u.recordings[a.p_id];
    if (r) { retire_(u, r.file); delete u.recordings[a.p_id]; touch_(db, u); }
  },
  // ---- 管理する人だけ ----
  lb_admin(db, a) {
    const me = needOwner_(db, a.p_token);
    if (!me.invite) { me.invite = inviteCode_(); db._dirty = true; }
    return {
      invite: me.invite,
      members: Object.keys(db.users).map(id => db.users[id]).filter(x => x !== me).map(x => ({
        id: x.id, username: x.username, songs: Object.keys(x.songs || {}).length, recordings: Object.keys(x.recordings || {}).length,
        created_at: x.created_at || null, changed_at: x.changed_at,
      })),
    };
  },
  lb_new_invite(db, a) {
    const me = needOwner_(db, a.p_token);
    me.invite = inviteCode_(); db._dirty = true;
    return me.invite;
  },
  // メンバーを外す。歌詞は消すが、そのメンバーのフォルダ（バックアップ・録音）はドライブに残す
  lb_remove_member(db, a) {
    const me = needOwner_(db, a.p_token);
    const u = db.users[a.p_uid];
    if (!u || u === me) throw err_('not_found');
    for (const id in u.recordings) retire_(u, u.recordings[id].file);
    for (const t in db.sessions) if (db.sessions[t].uid === u.id) delete db.sessions[t];
    delete db.users[a.p_uid];
    db._dirty = true;
  },
  // メンバーに見せている曲（自分以外の人の、shared の曲）
  lb_shared(db, a) {
    const me = who_(db, a.p_token);
    const out = [];
    Object.keys(db.users).forEach(id => {
      const u = db.users[id];
      if (u === me) return;
      Object.keys(u.songs || {}).forEach(sid => {
        const s = u.songs[sid];
        if (!s.data || !s.data.shared || s.data.deleted_at) return;
        const artist = s.data.artist_id && u.artists[s.data.artist_id] ? u.artists[s.data.artist_id].data.name : '';
        out.push({ owner_id: u.id, owner: u.username, id: sid, data: s.data, artist: artist, updated_at: s.updated_at });
      });
    });
    return out;
  },
  // 試聴の音を取りよせる（Apple の試聴だけ。キーとテンポの推定に使う）
  lb_preview(db, a) {
    who_(db, a.p_token);
    const url = String(a.p_url || '');
    if (!/^https:\/\/[a-z0-9.-]+\.(apple\.com|mzstatic\.com)\//.test(url)) throw err_('not_found');
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw err_('not_found');
    const blob = res.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length > 4000000) throw err_('too_big');
    return { mime: blob.getContentType() || 'audio/mp4', audio: Utilities.base64Encode(bytes) };
  },
  lb_get_recording(db, a) {
    const u = who_(db, a.p_token);
    const r = u.recordings[a.p_id];
    if (!r) throw err_('not_found');
    return { mime: r.mime, audio: Utilities.base64Encode(DriveApp.getFileById(r.file).getBlob().getBytes()) };
  },
};

// ---------- 自動バックアップ（10分ごと。変わっていたときだけ） ----------
function backup() {
  const db = load_();
  owner_(db);
  if (db._dirty) { delete db._dirty; save_(db); }
  Object.keys(db.users).forEach(id => { try { backupUser_(db.users[id]); } catch (x) { Logger.log(x); } });
}

function backupUser_(u) {
  const p = PropertiesService.getScriptProperties();
  if (u.changed_at === p.getProperty('backup_changed_' + u.id)) return;
  const root = userRoot_(u);
  const days = folder_(root, '日ごと');
  const exp = {
    app: 'LYRIC BOOK', format: 1, exported_at: now_(), username: u.username, changed_at: u.changed_at, settings: u.settings,
    artists: list_(u.artists), songs: list_(u.songs),
    recordings: Object.keys(u.recordings).map(id => recMeta_(id, u.recordings[id])),
  };
  const json = JSON.stringify(exp);
  const day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  put_(root, 'LYRIC BOOK 最新.json', json);
  put_(days, 'LYRIC BOOK ' + day + '.json', json);

  const names = {};
  exp.artists.forEach(a => { names[a.id] = a.data.name; });
  const songs = exp.songs.slice().sort((x, y) => {
    const ax = x.data.kind === 'real' ? (names[x.data.artist_id] || '') : '～自作';
    const ay = y.data.kind === 'real' ? (names[y.data.artist_id] || '') : '～自作';
    return ax.localeCompare(ay, 'ja') || String(x.data.title || '').localeCompare(String(y.data.title || ''), 'ja');
  });
  const txt = songs.map(s => '■ ' + (s.data.title || '題名なし') + '　／　' + (s.data.kind === 'real' ? (names[s.data.artist_id] || '') : '自作') + '\n\n' + (s.data.text || '') + '\n').join('\n――――――――――\n\n');
  put_(root, '歌詞まとめ.txt', 'LYRIC BOOK 歌詞まとめ（' + u.username + '・' + day + '）\n\n' + txt);

  const limit = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  const it = days.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getDateCreated().getTime() < limit) f.setTrashed(true); }

  p.setProperty('backup_changed_' + u.id, u.changed_at);
  p.setProperty('backup_at_' + u.id, now_());
  p.setProperty('backup_info_' + u.id, JSON.stringify({ songs: exp.songs.length, recordings: exp.recordings.length, folder: u.owner ? root.getUrl() : null }));
}
