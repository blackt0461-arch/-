/* いどうナビ：KOTETSU WORKS アカウントに予定を保存する（2026-11-10）
 * ・入口（kotetsuworks.com）でログインしていると、予定・行き方・定期などをアカウントに置く。ほかの端末でも同じになる。
 * ・ログインしていなければ、今までどおりこの端末だけ。
 * ・サーバーは Supabase の kw_data_get / kw_data_put（study-room-beta/supabase/028・031）。
 * ・Yahoo! の検索結果（auto）は大きいので端末ごと。
 */
const Cloud = (() => {
  const URL_ = 'https://zmteazudhtnzvfvmndqn.supabase.co';
  const KEY_ = 'sb_publishable_0kgkan6JFFV-TMSLLTgiOQ_uwgeEfQf';
  const APP = 'route';
  const META = 'idounavi-cloud'; // { at: 前にそろえた時のサーバーの時刻, sent: 前に送った中身 }
  const LOCAL_ONLY = ['auto'];
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* なし */ } };
  const token = () => (get('kw.session') || {}).token || '';
  const name = () => (get('kw.session') || {}).name || '';
  let meta = get(META) || {}, timer = null, busy = false;

  async function rpc(fn, body) {
    let res;
    try {
      res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY_, Authorization: `Bearer ${KEY_}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { throw Object.assign(new Error('offline'), { code: 'offline' }); }
    const t = await res.text(); const j = t ? JSON.parse(t) : null;
    if (!res.ok) throw Object.assign(new Error(j?.message || 'server'), { code: j?.message });
    return j;
  }
  const pack = () => { const o = {}; for (const [k, v] of Object.entries(S)) if (!LOCAL_ONLY.includes(k)) o[k] = v; return o; };
  function adopt(data) {
    const keep = {}; for (const k of LOCAL_ONLY) if (k in S) keep[k] = S[k];
    S = Object.assign({ home: '', buffer: 5, days: {}, routes: {}, places: {}, ovr: {}, pass: null, periods: S.periods, auto: {}, meets: [] }, data, keep);
    save0();
    render(); if (typeof drawMeetBtn === 'function') drawMeetBtn();
  }
  function show(s) {
    const el = document.getElementById('cloud'); if (!el) return;
    el.innerHTML = {
      off: '<a href="/">KOTETSU WORKS にログイン</a>すると、予定をどの端末でも同じにできます',
      ok: `☁ ${esc(name())} のアカウントに保存ずみ`,
      saving: `☁ ${esc(name())} のアカウントに保存中…`,
      offline: '☁ いまはつながらないので、この端末に保存しました',
      expired: '<a href="/">ログインが切れました。入口でもう一度ログイン</a>してください',
      err: '☁ アカウントに保存できませんでした',
    }[s] || '';
  }

  async function pull() {
    const tok = token(); if (!tok) { show('off'); return; }
    show('saving');
    let remote;
    try { remote = await rpc('kw_data_get', { p_token: tok, p_app: APP }); }
    catch (e) { show(e.code === 'bad_token' ? 'expired' : 'offline'); return; }
    const local = JSON.stringify(pack());
    const localChanged = local !== meta.sent;
    if (!remote) { push(true); return; }                                  // アカウントにまだ無い → この端末の分を送る
    if (meta.at && remote.at <= meta.at) { if (localChanged) push(true); else show('ok'); return; }
    const empty = !Object.keys(S.days || {}).length;
    if (!localChanged || empty || JSON.stringify(remote.data) === local) {  // アカウントの方が新しい
      adopt(remote.data); meta = { at: remote.at, sent: JSON.stringify(remote.data) }; put(META, meta); show('ok'); return;
    }
    // 両方で変わっている
    const useRemote = confirm(`ほかの端末で変えた予定がアカウントに入っています（${new Date(remote.at).toLocaleString('ja-JP')}）。\n\nOK：アカウントの方を使う\nキャンセル：この端末の方を使う\n\n使わなかった方は消えます。`);
    if (useRemote) { adopt(remote.data); meta = { at: remote.at, sent: JSON.stringify(remote.data) }; put(META, meta); show('ok'); }
    else { meta.at = remote.at; put(META, meta); push(true); }
  }

  async function push(now) {
    const tok = token(); if (!tok) return;
    clearTimeout(timer);
    if (!now) { timer = setTimeout(() => push(true), 2000); return; }
    if (busy) { timer = setTimeout(() => push(true), 1500); return; }
    const body = pack(), s = JSON.stringify(body);
    if (s === meta.sent && meta.at) { show('ok'); return; }
    busy = true; show('saving');
    try {
      const r = await rpc('kw_data_put', { p_token: tok, p_app: APP, p_data: body, p_base: meta.at || null });
      meta = { at: r.at, sent: s }; put(META, meta); show('ok');
    } catch (e) {
      if (e.code === 'conflict') { busy = false; pull(); return; }
      show(e.code === 'bad_token' ? 'expired' : e.code === 'offline' ? 'offline' : e.code === 'too_big' ? 'err' : 'err');
    } finally { busy = false; }
  }

  // app.js の save() のあとに、アカウントにも送る
  const save0 = save;
  save = function () { save0(); if (token()) push(false); };
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); push(true); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && token()) pull(); });
  pull();
  return { pull, push };
})();
