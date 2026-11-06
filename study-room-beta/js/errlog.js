// アプリで起きたエラーを、自動でサーバーに記録する（1.12.0）。管理者画面の「エラーの記録」で見られる。
// 同じエラーは1回だけ、1回開くあいだに10件まで送る。個人を特定する情報は送らない（版・エラーの文・場所・ブラウザの種類だけ）。
import { rpc } from './cloud.js';
import * as Auth from './auth.js';

let version = '', sent = new Set(), count = 0;
export function setVersion(v) { version = v; }
const IGNORE = /ResizeObserver loop|Script error\.?$|chrome-extension|moz-extension|safari-extension|Load failed|NetworkError|Failed to fetch|AbortError/i;
export function report(msg, stack = '', place = '') {
  msg = String(msg || '').slice(0, 500);
  if (!msg || IGNORE.test(msg) || IGNORE.test(stack || '')) return;
  const key = msg + '|' + place;
  if (sent.has(key) || count >= 10) return;
  sent.add(key); count++;
  const where = place || (location.pathname.includes('-beta') ? 'beta' : 'main');
  rpc('sr_log_error', { p_token: Auth.currentUser()?.token || null, p_version: version, p_msg: msg, p_stack: String(stack || '').slice(0, 2000), p_place: where, p_ua: navigator.userAgent.slice(0, 300) }).catch(() => {});
}
window.addEventListener('error', (e) => report(e.message || e.error?.message, e.error?.stack || `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`));
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r && r.code) return; /* サーバーのよくある返事（ログイン切れなど）は記録しない */ report(r?.message || String(r), r?.stack || ''); });
