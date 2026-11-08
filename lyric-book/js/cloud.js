// データのやりとり。グーグルドライブ（Google Apps Script の受け口）と、ためし用（この端末だけ）の2つ。
// 受け口のURLは公開されても大丈夫（中身はユーザー名とパスワードで守る。登録できるのは1人だけ）。
// 受け口のコードは server/Code.gs。
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzN57EXhrxu32rM7Br4RZeXzmDhzZQJE3Ws0oHOGIv2F98fmjaEYW2CMreTRSlrPnMLjA/exec';

const MESSAGES = {
  name_taken: 'そのユーザー名はもう使われています',
  name_length: 'ユーザー名は2〜20文字にしてください',
  password_short: 'パスワードは4文字以上にしてください',
  bad_login: 'ユーザー名かパスワードがちがいます',
  bad_recovery: 'ユーザー名か合言葉がちがいます',
  bad_token: 'ログインが切れました。もう一度ログインしてください',
  not_found: '見つかりませんでした',
  too_big: '録音が長すぎます（10分まで）',
  conflict: '別の端末でも直されていました',
  missing: 'まだ準備ができていません。ログイン画面の「はじめての準備」をしてください',
  closed: 'このアプリは、もう登録されています。ログインしてください',
  bad_invite: '招待の合言葉がちがいます。管理している人に聞いてください',
  no_lyrics: 'J-Lyric.net に、この曲の歌詞が見つかりませんでした',
  not_owner: '管理している人だけができます',
  too_many_users: 'これ以上は登録できません（20人まで）',
  too_many: 'まちがいが続いたので、10分ほど待ってからためしてください',
  busy: '混みあっています。もう一度ためしてください',
  no_access: 'グーグルドライブにつなげません。Googleの画面の「デプロイを管理」で「アクセスできるユーザー」を「全員」にしてください',
  server: 'うまくいきませんでした。少ししてからもう一度ためしてください',
  offline: 'ネットにつながりませんでした。電波のよい所でもう一度ためしてください',
};

export class CloudError extends Error {
  constructor(code) { super(MESSAGES[code] || MESSAGES.server); this.code = code; }
}

async function remote(name, body) {
  if (!SCRIPT_URL) throw new CloudError('missing');
  let res;
  try {
    res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 余分な確認通信をさせない形
      body: JSON.stringify({ fn: name, args: body }),
      redirect: 'follow',
    });
  } catch (e) { throw new CloudError('offline'); }
  let j = null;
  // Googleのログイン画面（HTML）が返ってきたら、公開の設定が「全員」になっていない
  const type = res.headers.get('content-type') || '';
  if (res.ok && !type.includes('json')) throw new CloudError('no_access');
  try { j = await res.json(); } catch (e) { throw new CloudError(res.ok ? 'server' : 'offline'); }
  if (!j || j.error) throw new CloudError(MESSAGES[j?.error] ? j.error : 'server');
  return j.result;
}

// ---- ためし用：同じ関数を localStorage で真似する ----
const LKEY = 'lb_local_db';
function ldb() {
  try { return JSON.parse(localStorage.getItem(LKEY)) || null; } catch (e) { return null; }
}
function lsave(db) {
  try { localStorage.setItem(LKEY, JSON.stringify(db)); }
  catch (e) { throw new CloudError('server'); }
}
const now = () => new Date().toISOString();
function blank() { return { settings: {}, artists: {}, songs: {}, recordings: {} }; }

const local = {
  lb_load() {
    const db = ldb() || blank();
    return {
      username: 'ためし',
      settings: db.settings,
      artists: Object.entries(db.artists).map(([id, a]) => ({ id, ...a })),
      songs: Object.entries(db.songs).map(([id, s]) => ({ id, ...s })),
      recordings: Object.entries(db.recordings).map(([id, r]) => ({ id, song_id: r.song_id, name: r.name, mime: r.mime, duration: r.duration, size: r.audio.length, created_at: r.created_at, updated_at: r.updated_at })),
    };
  },
  lb_save_settings({ p_settings }) { const db = ldb() || blank(); db.settings = p_settings; lsave(db); return null; },
  lb_save_artist({ p_id, p_data }) {
    const db = ldb() || blank(); const o = db.artists[p_id];
    db.artists[p_id] = { data: p_data, created_at: o?.created_at || now(), updated_at: now() }; lsave(db);
    return { created_at: db.artists[p_id].created_at, updated_at: db.artists[p_id].updated_at };
  },
  lb_delete_artist({ p_id }) {
    const db = ldb() || blank(); delete db.artists[p_id];
    for (const [id, s] of Object.entries(db.songs)) if (s.data.artist_id === p_id) local.lb_delete_song({ p_id: id }, db);
    lsave(db); return null;
  },
  lb_save_song({ p_id, p_data }) {
    const db = ldb() || blank(); const o = db.songs[p_id];
    db.songs[p_id] = { data: p_data, created_at: o?.created_at || now(), updated_at: now() }; lsave(db);
    return { created_at: db.songs[p_id].created_at, updated_at: db.songs[p_id].updated_at };
  },
  lb_delete_song({ p_id }, given) {
    const db = given || ldb() || blank(); delete db.songs[p_id];
    for (const [id, r] of Object.entries(db.recordings)) if (r.song_id === p_id) delete db.recordings[id];
    if (!given) lsave(db); return null;
  },
  lb_add_recording({ p_song_id, p_name, p_mime, p_duration, p_audio }) {
    const db = ldb() || blank(); const id = crypto.randomUUID();
    db.recordings[id] = { song_id: p_song_id, name: p_name, mime: p_mime, duration: p_duration, audio: p_audio, created_at: now(), updated_at: now() };
    lsave(db); const r = db.recordings[id];
    return { id, song_id: r.song_id, name: r.name, mime: r.mime, duration: r.duration, size: r.audio.length, created_at: r.created_at, updated_at: r.updated_at };
  },
  lb_replace_recording({ p_id, p_mime, p_duration, p_audio }) {
    const db = ldb() || blank(); const r = db.recordings[p_id]; if (!r) throw new CloudError('not_found');
    Object.assign(r, { mime: p_mime, duration: p_duration, audio: p_audio, updated_at: now() }); lsave(db);
    return { id: p_id, song_id: r.song_id, name: r.name, mime: r.mime, duration: r.duration, size: r.audio.length, created_at: r.created_at, updated_at: r.updated_at };
  },
  lb_rename_recording({ p_id, p_name }) { const db = ldb() || blank(); if (db.recordings[p_id]) db.recordings[p_id].name = p_name; lsave(db); return null; },
  lb_delete_recording({ p_id }) { const db = ldb() || blank(); delete db.recordings[p_id]; lsave(db); return null; },
  lb_get_recording({ p_id }) { const r = (ldb() || blank()).recordings[p_id]; if (!r) throw new CloudError('not_found'); return { mime: r.mime, audio: r.audio }; },
  lb_logout() { return null; },
};

export const LOCAL_TOKEN = 'local';

export async function rpc(name, body = {}) {
  if (body.p_token === LOCAL_TOKEN) {
    const fn = local[name];
    if (!fn) throw new CloudError('server');
    return fn(body);
  }
  return remote(name, body);
}
