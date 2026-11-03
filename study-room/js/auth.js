// ログイン（第1段階：この端末の中だけ）
// パスワードはそのまま保存せず、PBKDF2 で変換した値だけを保存する。
// 第2段階で Supabase に切り替えるときは、この3つの関数の中身を差し替える。
const USERS = 'studyroom.users';
const SESSION = 'studyroom.session';

function users() {
  try { return JSON.parse(localStorage.getItem(USERS)) || {}; } catch (e) { return {}; }
}
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function hash(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

export function validName(name) {
  return /^[\p{L}\p{N}_\-.]{2,16}$/u.test(name);
}

export async function signUp(name, password) {
  name = name.trim();
  if (!validName(name)) throw new Error('ユーザー名は2〜16文字（記号は _ - . のみ）にしてください');
  if (password.length < 4) throw new Error('パスワードは4文字以上にしてください');
  const u = users();
  if (u[name.toLowerCase()]) throw new Error('そのユーザー名はもう使われています');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  u[name.toLowerCase()] = { name, salt, hash: await hash(password, salt), createdAt: new Date().toISOString() };
  localStorage.setItem(USERS, JSON.stringify(u));
  localStorage.setItem(SESSION, name.toLowerCase());
  return name.toLowerCase();
}

export async function logIn(name, password) {
  const u = users()[name.trim().toLowerCase()];
  if (!u || (await hash(password, u.salt)) !== u.hash) throw new Error('ユーザー名かパスワードがちがいます');
  localStorage.setItem(SESSION, name.trim().toLowerCase());
  return name.trim().toLowerCase();
}

export function logOut() { localStorage.removeItem(SESSION); }

export function currentUser() {
  const id = localStorage.getItem(SESSION);
  const u = id && users()[id];
  return u ? { id, name: u.name } : null;
}
