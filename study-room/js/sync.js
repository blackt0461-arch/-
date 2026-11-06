// 記録をネット（Supabase）と合わせる。
// ・ログインした直後／アプリを開いたとき：新しいほうの記録を使う（savedAt をくらべる）
// ・遊んでいるあいだ：変わってから少し待ってまとめて送る。画面を閉じるときはすぐ送る
// ・ネットにつながらないときは端末に置いておき、つながったら送る
import { rpc } from './cloud.js';
import * as S from './store.js';
import * as Auth from './auth.js';

let timer = null, dirty = false, sending = false;
// ready：このログインで、ネットの記録をまだ見ていない間は送らない（古い端末の記録で、ほかの端末の新しい記録を上書きしないため。1.11.0）
let ready = false;
let onExpired = null, onStatus = null, onReplaced = null;
export function setHandlers(h) { onExpired = h.onExpired; onStatus = h.onStatus; onReplaced = h.onReplaced || null; }
export function reset() { ready = false; } // ログインしなおした時
function status(s) { onStatus && onStatus(s); }

function hasData(d) { return d && d.version === 1; }

// どれだけ進んでいるか：経験値（ふえるだけ）→ 解いた数＋パズルの回数 → 保存した時刻 の順にくらべる
function progress(d) { const p = d?.profile || {}; return [p.xp || 0, (p.solved || 0) + (p.puzzleClears || 0), d?.savedAt || 0]; }
function ahead(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; }
// ネットの記録と端末の記録の、進んでいるほうを使う（1.11.0 から。前は保存した時刻だけでくらべていて、
// 電波が悪いと古い端末の記録が「新しい」ことになり、ほかの端末の記録を上書きしてしまった）
// 戻り値：ネットの記録に置きかえたら true
export async function adopt(cloudData) {
  const local = S.getState();
  ready = true;
  // 管理者が「元に戻す」をした記録（restoredAt が端末より新しい）は、進み具合にかかわらず使う（1.12.0）
  const restored = hasData(cloudData) && (cloudData.restoredAt || 0) > (local.restoredAt || 0);
  if (hasData(cloudData) && (restored || !ahead(progress(local), progress(cloudData)))) {
    // 置きかえる前に、端末の記録を1つとっておく（もしもの時に戻せるように）
    try { if (local.savedAt) localStorage.setItem('studyroom.backup.' + (Auth.currentUser()?.id || 'x'), JSON.stringify(local)); } catch (e) { /* 入りきらない時は、とっておかない */ }
    const changed = (local.savedAt || 0) !== (cloudData.savedAt || 0);
    S.replaceState(cloudData);
    status('saved');
    if (changed && onReplaced) onReplaced();
    return true;
  }
  // 端末のほうが進んでいる（またはネットが空）なら送る
  if (local.savedAt) await push();
  return false;
}

export async function pull() {
  const u = Auth.currentUser();
  if (!u) return false;
  ready = false;
  try {
    const r = await rpc('sr_load', { p_token: u.token });
    if (r.is_admin !== undefined) Auth.setAdmin(r.is_admin);
    return await adopt(r.data);
  } catch (e) {
    if (e.code === 'bad_token') { onExpired && onExpired(); return false; }
    status('offline');
    // ネットにつながらない：つながったら、まずネットの記録を見てから送る
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
  if (!ready) { dirty = true; status('pending'); return; } // ネットの記録を見てから送る
  clearTimeout(timer);
  sending = true; dirty = false;
  try {
    await rpc('sr_save', { p_token: u.token, p_data: S.getState() }, { keepalive });
    status(dirty ? 'pending' : 'saved');
  } catch (e) {
    dirty = true;
    if (e.code === 'bad_token') onExpired && onExpired();
    else if (e.code === 'restored') { dirty = false; sending = false; await pull(); return; } // 元に戻された記録を読みなおす
    else status('offline');
  } finally {
    sending = false;
    if (dirty && !keepalive) { clearTimeout(timer); timer = setTimeout(push, 8000); }
  }
}

S.setSaveHook(schedule);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) push(true); });
window.addEventListener('pagehide', () => { if (dirty) push(true); });
window.addEventListener('online', () => { if (!ready) pull(); else if (dirty) push(); });

// ほかの端末でログインされたら、この端末はログアウトする（1分ごと・画面に戻ったときに確かめる）
async function ping() {
  const u = Auth.currentUser();
  if (!u || document.visibilityState !== 'visible') return;
  try { await rpc('sr_ping', { p_token: u.token }); }
  catch (e) { if (e.code === 'bad_token') onExpired && onExpired('other'); }
}
setInterval(ping, 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ping(); });
