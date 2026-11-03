// ログイン。ユーザー名とパスワードは Supabase で確かめ、もらった合い鍵（token）を端末に覚えておく。
// 合い鍵があるあいだはログインしたまま（ログアウトするまで）。
// 以前の「この端末の中だけのアカウント」は、最初にログインしたとき自動でネットへ引っ越す。
import { rpc, CloudError } from './cloud.js';

const SESSION = 'studyroom.cloud';
const LOCAL_USERS = 'studyroom.users'; // 以前の端末内アカウント
const LOCAL_SESSION = 'studyroom.session';

function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function localHash(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
function localUsers() { try { return JSON.parse(localStorage.getItem(LOCAL_USERS)) || {}; } catch (e) { return {}; } }

function remember(r) {
  const s = { token: r.token, id: r.username.toLowerCase(), name: r.username };
  localStorage.setItem(SESSION, JSON.stringify(s));
  localStorage.removeItem(LOCAL_SESSION);
  return s;
}

export function validName(name) {
  return /^[\p{L}\p{N}_\-.]{2,16}$/u.test(name.trim());
}

// 戻り値：{ id, name, data, updated_at }
export async function signUp(name, password) {
  if (!validName(name)) throw new CloudError('name_length');
  if (password.length < 4) throw new CloudError('password_short');
  const r = await rpc('sr_signup', { p_username: name.trim(), p_password: password });
  return { ...remember(r), data: r.data, updated_at: r.updated_at };
}

export async function logIn(name, password) {
  try {
    const r = await rpc('sr_login', { p_username: name.trim(), p_password: password });
    return { ...remember(r), data: r.data, updated_at: r.updated_at };
  } catch (e) {
    if (e.code !== 'bad_login') throw e;
    // 以前この端末で作ったアカウントなら、同じ名前とパスワードでネットに作り直す
    const u = localUsers()[name.trim().toLowerCase()];
    if (u && (await localHash(password, u.salt)) === u.hash) {
      const r = await rpc('sr_signup', { p_username: u.name, p_password: password });
      return { ...remember(r), data: r.data, updated_at: r.updated_at, moved: true };
    }
    throw e;
  }
}

export function logOut() {
  const s = currentUser();
  if (s) rpc('sr_logout', { p_token: s.token }).catch(() => {});
  localStorage.removeItem(SESSION);
}

export function currentUser() {
  try { return JSON.parse(localStorage.getItem(SESSION)); } catch (e) { return null; }
}
