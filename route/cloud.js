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

  // ---- 3つをくらべてまぜる（前にそろえた時・この端末・アカウント）----
  // 片方だけが変えたところはその変更を使い、両方が同じところを変えたときはこの端末を優先する。
  // 予定は日ごと、行き方は場所ごと、大会は大会ごと（「出る／出ない」はこの端末で押したものを残す）にまぜる。
  const DEF = { home: '', buffer: 5, days: {}, routes: {}, places: {}, ovr: {}, pass: null, meets: [] };
  // キーの並びをそろえて文字にする（アカウントから戻ると並びが変わるため）
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
  const J = (v) => JSON.stringify(sortKeys(v === undefined ? null : v));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const fill = (o) => { const r = Object.assign({}, DEF); for (const [k, v] of Object.entries(o || {})) if (!LOCAL_ONLY.includes(k) && v !== undefined) r[k] = v; return r; };
  function mergeObj(b, l, r) {
    const out = {};
    for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l || {}), ...Object.keys(r || {})])) {
      const v = J(l?.[k]) === J(b?.[k]) ? r?.[k] : J(r?.[k]) === J(b?.[k]) ? l?.[k] : l?.[k];
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  function mergeMeets(b, l, r) {
    const by = (a) => Object.fromEntries((a || []).map((m) => [m.id, m]));
    const B = by(b), L = by(l), R = by(r), out = [];
    for (const id of new Set([...Object.keys(R), ...Object.keys(L)])) {
      const bm = B[id], lm = L[id], rm = R[id];
      if (!rm) { out.push(lm); continue; }
      if (!lm) { out.push(rm); continue; }
      const st = J(lm.status) !== J(bm?.status) ? lm.status : rm.status; // この端末で押した「出る／出ない」を残す
      out.push(Object.assign({}, rm, { status: st }));
    }
    return out;
  }
  function merge3(base, local, remote) {
    const out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const b = base[k], l = local[k], r = remote[k];
      if (J(l) === J(b)) out[k] = r;
      else if (J(r) === J(b)) out[k] = l;
      else if (k === 'meets') out[k] = mergeMeets(b, l, r);
      else if (isObj(l) && isObj(r)) out[k] = mergeObj(b, l, r);
      else out[k] = l;
      if (out[k] === undefined) delete out[k];
    }
    return out;
  }
  function apply(data) {
    const keep = {}; for (const k of LOCAL_ONLY) if (k in S) keep[k] = S[k];
    S = Object.assign({ periods: S.periods }, fill(data), keep);
    save0();
    render(); if (typeof drawMeetBtn === 'function') drawMeetBtn(); if (typeof drawTT === 'function') drawTT();
  }

  async function pull() {
    const tok = token(); if (!tok) { show('off'); return; }
    show('saving');
    let remote;
    try { remote = await rpc('kw_data_get', { p_token: tok, p_app: APP }); }
    catch (e) { show(e.code === 'bad_token' ? 'expired' : 'offline'); return; }
    if (!remote) { push(true); return; }                                   // アカウントにまだ無い → この端末の分を送る
    const local = fill(pack());
    if (meta.at && remote.at <= meta.at) { if (J(local) !== meta.sent) push(true); else show('ok'); return; }
    let base = {};
    try { base = meta.sent ? JSON.parse(meta.sent) : {}; } catch (e) { base = {}; }
    const merged = merge3(fill(base), local, fill(remote.data));
    apply(merged);
    meta = { at: remote.at, sent: J(fill(remote.data)) }; put(META, meta);
    if (J(fill(merged)) !== J(fill(remote.data))) push(true); else { meta.sent = J(fill(merged)); put(META, meta); show('ok'); }
  }

  async function push(now) {
    const tok = token(); if (!tok) return;
    clearTimeout(timer);
    if (!now) { timer = setTimeout(() => push(true), 2000); return; }
    if (busy) { timer = setTimeout(() => push(true), 1500); return; }
    const body = fill(pack()), s = J(body);
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
