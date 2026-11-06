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

// 強制終了の見はり（1.12.0）：開いている間、5秒ごとに「いま開いている」と書いておく。
// 画面をとじた・ほかのアプリに切りかえた時は「ちゃんと閉じた」にする。
// 次に開いた時、「開いている」のまま残っていたら、前回は強制終了された（メモリ不足など）と考えて記録する。
const HB = 'studyroom.hb';
const screenNow = () => { const sc = document.querySelector('#app > .screen'); const sh = [...document.querySelectorAll('.sheet')].map(x => [...x.classList].filter(c => c !== 'sheet').join('.')).join('+'); return (sc ? [...sc.classList].filter(c => c !== 'screen' && c !== 'with-tabs').join('.') : document.querySelector('.home') ? (document.body.classList.contains('focus') ? 'home(focus)' : 'home') : 'start') + (sh ? ' / ' + sh : ''); };
const beat = (vis) => { try { localStorage.setItem(HB, JSON.stringify({ t: Date.now(), v: version, s: screenNow(), vis, mem: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576) })); } catch (e) { /* なし */ } };
try {
  const last = JSON.parse(localStorage.getItem(HB) || 'null');
  if (last && last.vis && Date.now() - last.t < 20 * 60e3) setTimeout(() => report('前回、強制終了された可能性', `screen=${last.s} mem=${last.mem}MB ver=${last.v}`, 'crash'), 4000);
} catch (e) { /* なし */ }
beat(document.visibilityState === 'visible');
setInterval(() => { if (document.visibilityState === 'visible') beat(true); }, 5000);
document.addEventListener('visibilitychange', () => beat(document.visibilityState === 'visible'));
window.addEventListener('pagehide', () => beat(false));
