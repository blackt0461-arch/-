/* ===== KOTETSU WORKS アカウントに 持ち物を 保存する（2026-11-10） =====
 * ・入口（kotetsuworks.com）で ログインしていると、持ち物（パーティ・メモリ・そうびなど）を アカウントに 置く。
 *   ほかの端末で 開いても 同じ 持ち物になる。ログインしていなければ 今までどおり この端末だけ。
 * ・サーバーは Supabase の kw_data_get / kw_data_put（study-room-beta/supabase/028）。
 * ・画面だけの 設定（開いているタブ・検索の文字など）は 端末ごと。
 */
const Cloud = (() => {
  const URL_ = 'https://zmteazudhtnzvfvmndqn.supabase.co';
  const KEY = 'sb_publishable_0kgkan6JFFV-TMSLLTgiOQ_uwgeEfQf';
  const APP = 'smagro-memory';
  const META = 'smagro-cloud';     // { at: 前に そろえた時の サーバーの 時刻, sent: 前に 送った 中身 }
  const LOCAL_ONLY = ['tab', 'eqTab', 'memColor', 'memQ', 'eqQ', 'eqOwned', 'memSrc'];
  const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const token = () => (get('kw.session') || {}).token || '';
  const name = () => (get('kw.session') || {}).name || '';
  let meta = get(META) || {}, timer = null, busy = false, state = 'off';

  async function rpc(fn, body) {
    let res;
    try {
      res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { throw Object.assign(new Error('offline'), { code: 'offline' }); }
    const t = await res.text(); const j = t ? JSON.parse(t) : null;
    if (!res.ok) throw Object.assign(new Error(j?.message || 'server'), { code: j?.message });
    return j;
  }
  const pack = () => { const o = {}; for (const [k, v] of Object.entries(S)) if (!LOCAL_ONLY.includes(k)) o[k] = v; return o; };
  function adopt(data) {
    const keep = {}; for (const k of LOCAL_ONLY) if (k in S) keep[k] = S[k];
    S = Object.assign(defaults(), data, keep);
    for (const p of S.party) { p.base = p.base || { atk: 100, matk: 100 }; p.w = p.w || [0, 0, 0, 0, 0, 0, 0]; }
    S.main = 0;
    try { localStorage.setItem('smagro-saitekika-v1', JSON.stringify(S)); } catch (e) { }   // ui.js の 保存先
    invalidate(); render();
  }

  function show(s) {
    state = s;
    const el = document.getElementById('cloud'); if (!el) return;
    const t = {
      off: '<a href="/" style="color:inherit">KOTETSU WORKS に ログイン</a>すると、もちものを どの端末でも 同じに できます',
      ok: `☁ ${esc(name())} の アカウントに ほぞんずみ`,
      saving: `☁ ${esc(name())} の アカウントに ほぞんちゅう…`,
      offline: '☁ いまは つながらないので この端末に ほぞんしました',
      expired: '<a href="/" style="color:inherit">ログインが 切れました。入口で もう一度 ログイン</a>してください',
      err: '☁ アカウントに ほぞん できませんでした',
    }[s];
    el.innerHTML = t || '';
  }

  // ほかの端末と ちがう ときに どちらを 使うか 聞く
  function ask(remote) {
    const sh = document.getElementById('sheet');
    sh.innerHTML = `<div class="win"><span class="tag">アカウント</span>
      <h2 style="margin-top:6px">ほかの端末の もちものと ちがいます</h2>
      <div class="note">アカウントには ほかの端末で かえた もちものが 入っています（${esc(new Date(remote.at).toLocaleString('ja-JP'))}）。どちらを つかいますか？ えらばなかった方は 消えます。</div>
      <div class="row" style="margin-top:10px"><button class="btn big" data-cloud="remote">アカウントの方</button><button class="btn big" data-cloud="local">この端末の方</button></div></div>`;
    sh.hidden = false;
    sh.querySelectorAll('[data-cloud]').forEach(b => b.onclick = () => {
      sh.hidden = true;
      if (b.dataset.cloud === 'remote') { adopt(remote.data); meta = { at: remote.at, sent: JSON.stringify(remote.data) }; put(META, meta); show('ok'); }
      else { meta.at = remote.at; put(META, meta); push(true); }
    });
  }

  async function pull() {
    const tok = token(); if (!tok) { show('off'); return; }
    show('saving');
    let remote;
    try { remote = await rpc('kw_data_get', { p_token: tok, p_app: APP }); }
    catch (e) { show(e.code === 'bad_token' ? 'expired' : 'offline'); return; }
    const local = JSON.stringify(pack());
    const localChanged = !S.example && local !== meta.sent;
    if (!remote) { if (S.example) show('ok'); else push(true); return; }
    if (meta.at && remote.at <= meta.at) { if (localChanged) push(true); else show('ok'); return; }
    // アカウントの方が 新しい
    if (!localChanged || JSON.stringify(remote.data) === local || !meta.at && S.example) {
      adopt(remote.data); meta = { at: remote.at, sent: JSON.stringify(remote.data) }; put(META, meta); show('ok'); return;
    }
    ask(remote);
  }

  async function push(now) {
    const tok = token(); if (!tok || S.example) return;
    clearTimeout(timer);
    if (!now) { timer = setTimeout(() => push(true), 2500); return; }
    if (busy) { timer = setTimeout(() => push(true), 1500); return; }
    const body = pack(), s = JSON.stringify(body);
    if (s === meta.sent && meta.at) { show('ok'); return; }
    busy = true; show('saving');
    try {
      const r = await rpc('kw_data_put', { p_token: tok, p_app: APP, p_data: body, p_base: meta.at || null });
      meta = { at: r.at, sent: s }; put(META, meta); show('ok');
    } catch (e) {
      if (e.code === 'conflict') { busy = false; pull(); return; }
      show(e.code === 'bad_token' ? 'expired' : e.code === 'offline' ? 'offline' : 'err');
    } finally { busy = false; }
  }

  // ui.js の save() の あとに アカウントにも 送る
  const save0 = save;
  save = function () { save0(); if (token()) push(false); };
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); push(true); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && token()) pull(); });
  pull();
  return { pull, push, get state() { return state; } };
})();
