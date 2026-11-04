// テスト勉強用の問題集を、コードで暗号にする／開く（ブラウザでも node でも動く）
// コードそのものはどこにも保存しない。コードから鍵を作り（PBKDF2）、AES-GCM で暗号にする。
const ITER = 150000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// 打ちまちがいに強くする：全角→半角、大文字にそろえ、空白とハイフンを無視
export const normCode = (code) => String(code || '').normalize('NFKC').toUpperCase().replace(/[\s\-ー－]/g, '');

async function keyOf(code, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealPack(code, pack) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(code, salt), enc.encode(JSON.stringify(pack))));
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) };
}
// 合うコードなら中身（{ id, name, problems }）、合わなければ null
export async function openPack(code, sealed) {
  try {
    const key = await keyOf(code, unb64(sealed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
    return JSON.parse(dec.decode(plain));
  } catch (e) { return null; }
}
