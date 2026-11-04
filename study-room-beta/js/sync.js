// 記録をネット（Supabase）と合わせる。
// ・ログインした直後／アプリを開いたとき：新しいほうの記録を使う（savedAt をくらべる）
// ・遊んでいるあいだ：変わってから少し待ってまとめて送る。画面を閉じるときはすぐ送る
// ・ネットにつながらないときは端末に置いておき、つながったら送る
import { rpc } from './cloud.js';
import * as S from './store.js';
import * as Auth from './auth.js';

let timer = null, dirty = false, sending = false;
let onExpired = null, onStatus = null;
export function setHandlers(h) { onExpired = h.onExpired; onStatus = h.onStatus; }
function status(s) { onStatus && onStatus(s); }

function hasData(d) { return d && d.version === 1; }

// ネットの記録と端末の記録の、新しいほうを使う。戻り値：ネットの記録に置きかえたら true
export async function adopt(cloudData) {
  const local = S.getState();
  if (hasData(cloudData) && (cloudData.savedAt || 0) >= (local.savedAt || 0)) {
    S.replaceState(cloudData);
    status('saved');
    return true;
  }
  // 端末のほうが新しい（またはネットが空）なら送る
  if (local.savedAt) await push();
  return false;
}

export async function pull() {
  const u = Auth.currentUser();
  if (!u) return false;
  try {
    const r = await rpc('sr_load', { p_token: u.token });
    if (r.is_admin !== undefined) Auth.setAdmin(r.is_admin);
    return await adopt(r.data);
  } catch (e) {
    if (e.code === 'bad_token') { onExpired && onExpired(); return false; }
    status('offline');
    return false;
  }
}

export function schedule() {
  dirty = true;
  status('pending');
  clearTimeout(timer);
  timer = setTimeout(push, 2500);
}

export async function push(keepalive = false) {
  const u = Auth.currentUser();
  if (!u || sending) return;
  clearTimeout(timer);
  sending = true; dirty = false;
  try {
    await rpc('sr_save', { p_token: u.token, p_data: S.getState() }, { keepalive });
    status(dirty ? 'pending' : 'saved');
  } catch (e) {
    dirty = true;
    if (e.code === 'bad_token') onExpired && onExpired();
    else status('offline');
  } finally {
    sending = false;
    if (dirty && !keepalive) { clearTimeout(timer); timer = setTimeout(push, 8000); }
  }
}

S.setSaveHook(schedule);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) push(true); });
window.addEventListener('pagehide', () => { if (dirty) push(true); });
window.addEventListener('online', () => { if (dirty) push(); });

// ほかの端末でログインされたら、この端末はログアウトする（1分ごと・画面に戻ったときに確かめる）
async function ping() {
  const u = Auth.currentUser();
  if (!u || document.visibilityState !== 'visible') return;
  try { await rpc('sr_ping', { p_token: u.token }); }
  catch (e) { if (e.code === 'bad_token') onExpired && onExpired('other'); }
}
setInterval(ping, 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ping(); });
