// ドライブ連携。グーグルドライブ側の受け口は server/Code.gs（Google Apps Script）。
// 記録はいつもこの端末に先に保存し、つながっているときにドライブとあわせる（電波がなくても勉強できる）。
import * as store from './store.js';

// 受け口のURLと鍵はアプリに入れておく（本人の希望で、URLの入力も合言葉もなし）。
// 鍵は受け口に最初に登録されたものと同じでないと読み書きできない（server/Code.gs の check_）。
const BUILTIN = {
  url: 'https://script.google.com/macros/s/AKfycbyea0Gsfce0Ew9m5dkyaJGPqhq95pzdZbOgFMfmQZPpPChuvUbxXO-hlUKdiR8gqJsw/exec',
  key: 'test-study-builtin-key',
};
const CKEY = 'ts_cloud_v1';
let CFG = (() => { try { return JSON.parse(localStorage.getItem(CKEY)) || {}; } catch (e) { return {}; } })();
// いつもつなぐ（切るボタンはない）
CFG = { ...CFG, ...BUILTIN }; delete CFG.off;
function saveCfg() { try { localStorage.setItem(CKEY, JSON.stringify(CFG)); } catch (e) { /* */ } }

const MESSAGES = {
  bad_key: '合言葉がちがいます',
  too_many: 'まちがいが続いたので、10分ほど待ってからためしてください',
  busy: '混みあっています。もう一度ためしてください',
  no_access: 'つなげません。Googleの画面の「デプロイを管理」で「アクセスできるユーザー」を「全員」にしてください',
  bad_url: 'URLがちがうようです。「https://script.google.com/macros/s/…/exec」の形のURLを貼ってください',
  offline: 'ネットにつながりませんでした',
  server: 'うまくいきませんでした。少ししてからもう一度ためしてください',
};
export class CloudError extends Error { constructor(code) { super(MESSAGES[code] || MESSAGES.server); this.code = code; } }

async function call(fn, args, cfg = CFG) {
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(cfg.url || '')) throw new CloudError('bad_url');
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 余分な確認通信をさせない形
      body: JSON.stringify({ fn, key: cfg.key, args }),
      redirect: 'follow',
    });
  } catch (e) { throw new CloudError('offline'); }
  const type = res.headers.get('content-type') || '';
  if (res.ok && !type.includes('json')) throw new CloudError('no_access');
  let j;
  try { j = await res.json(); } catch (e) { throw new CloudError(res.ok ? 'server' : 'offline'); }
  if (!j || j.error) throw new CloudError(MESSAGES[j?.error] ? j.error : 'server');
  return j.result;
}

export const connected = () => !!(CFG.url && CFG.key);
export const config = () => ({ url: CFG.url || '', last: CFG.last || 0, error: CFG.error || '' });

export async function connect(url = BUILTIN.url, key = BUILTIN.key) {
  const cfg = { url: String(url || '').trim(), key: String(key || '').trim() };
  if (cfg.key.length < 4) throw new CloudError('bad_key');
  await call('hello', {}, cfg);
  CFG = { ...cfg }; saveCfg();
  await sync();
}

// ---- あわせる ----
let running = null, again = false;
const listeners = [];
export const onSynced = (f) => listeners.push(f);

export function sync() {
  if (!connected()) return Promise.resolve(false);
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const merged = await call('sync', { state: store.state() });
      const changed = store.merge(merged);
      await sendAnswers();
      CFG.last = Date.now(); CFG.error = ''; saveCfg();
      listeners.forEach((f) => f(changed));
      return changed;
    } catch (e) {
      CFG.error = e.message; saveCfg();
      return false;
    } finally {
      running = null;
      if (again) { again = false; setTimeout(sync, 500); }
    }
  })();
  return running;
}

function toBase64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => res('');
    r.readAsDataURL(blob);
  });
}
async function sendAnswers() {
  const list = (await store.listAnswers()).filter((a) => !a.synced);
  for (const a of list) {
    const { photo, synced, id, ...rest } = a;
    const body = { ...rest, uid: a.uid || String(a.id), photo: photo ? await toBase64(photo) : '' };
    await call('answer', { answer: body });
    await store.markSynced(a.id);
  }
}

// 記録が変わったら、少し待ってからまとめて送る。アプリを閉じるときにも送る
let timer = null;
store.onChange(() => {
  if (!connected()) return;
  clearTimeout(timer);
  timer = setTimeout(sync, 4000);
});
document.addEventListener('visibilitychange', () => {
  if (!connected()) return;
  if (document.visibilityState === 'hidden') { clearTimeout(timer); sync(); }
  else sync();
});
