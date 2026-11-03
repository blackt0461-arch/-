/* ===== スクショから もちものを よみこむ（Gemini） =====
 * ゲームの一覧のスクショを Gemini に読ませて、メモリ・そうびの名前を取り出す。
 * 鍵は、同じサイトのアラームで入れた Gemini の鍵（alarm.geminiKey）をそのまま使う。
 */
const Scan = (() => {
  const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  const PER_CALL = 4;          // 1回に送る枚数
  const MAX_SIDE = 1600;       // 送る前に小さくする
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  };
  const apiKey = () => store.get('smagro.geminiKey') || store.get('alarm.geminiKey');
  const nz = s => q(String(s || '')).replace(/[\s・･]/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let pending = null; // {kind, results, unmatched}

  function sheet(html) { const sh = document.getElementById('sheet'); sh.innerHTML = `<div class="win"><span class="tag">スクショから よみこむ</span>${html}</div>`; sh.hidden = false; }

  function start(kind) {
    if (!apiKey()) return askKey(kind);
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => { if (inp.files && inp.files.length) run(kind, [...inp.files]); };
    inp.click();
  }

  function askKey(kind) {
    sheet(`<div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0">Gemini の かぎ</h2><button class="btn" data-act="close">とじる</button></div>
      <div class="note">スクショの 文字を よむのに Google の AI（Gemini）を つかいます。アラームの画面で 入れた かぎが あれば じどうで つかいますが、見つかりませんでした。</div>
      <ol class="note" style="padding-left:1.2em;margin:8px 0">
        <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--gold)">Google AI Studio</a> を ひらいて ログイン</li>
        <li>「APIキーを作成」を おして、できた かぎを コピー</li>
        <li>下に はりつけて「ほぞん」</li></ol>
      <input id="gemkey" type="password" placeholder="AIza…" autocomplete="off" style="margin-top:4px">
      <div class="row" style="margin-top:10px"><button class="btn big" data-act="scankey" data-k="${kind}">ほぞんして スクショを えらぶ</button></div>
      <div class="note" style="margin-top:6px">かぎは この スマホの ブラウザにだけ ほぞんします。</div>`);
  }

  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  function prompt(kind) {
    if (kind === 'mem') {
      return `これはスマホゲーム「ドラゴンクエスト スマッシュグロウ」の、メモリ一覧の画面のスクリーンショットです。
画面に写っているメモリを全部書き出してください。
- name は、下の「候補」の表記と同じ文字で書く（候補にないものは書かない。見切れて読めないものも書かない）
- ランク（S・A・B・C・D）が見えたら rank に入れる
- 同じメモリの個数が見えたら count に入れる
候補: ${MEMS.map(m => m.n).join('、')}`;
    }
    const all = Object.values(ITEMS).filter(i => i.kind !== 'm');
    return `これはスマホゲーム「ドラゴンクエスト スマッシュグロウ」の、そうび（武器・防具・アクセサリー）一覧の画面のスクリーンショットです。
画面に写っているそうびを全部書き出してください。
- name は、下の「候補」の表記と同じ文字で書く（候補にないものは書かない。見切れて読めないものも書かない）
- レベル（Lv）が見えたら level、凸（覚醒の回数）が見えたら totu に入れる
- 同じそうびが何個も写っていたら、そのぶん別々に書く
候補: ${all.map(i => i.n).join('、')}`;
  }

  const SCHEMA = {
    type: 'object', properties: {
      items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, rank: { type: 'string' }, count: { type: 'integer' }, level: { type: 'integer' }, totu: { type: 'integer' } }, required: ['name'] } }
    }, required: ['items']
  };

  async function callGemini(body) {
    let last;
    for (const m of [store.get('alarm.geminiModel'), ...MODELS].filter((x, i, a) => x && a.indexOf(x) === i)) {
      for (let t = 0; t < 2; t++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() }, body: JSON.stringify(body)
        });
        const js = await res.json().catch(() => ({}));
        if (res.ok) return js.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
        last = new Error(`Gemini ${res.status}: ${js.error?.message || res.statusText}`); last.status = res.status;
        if (res.status === 400 || res.status === 401 || res.status === 403) throw last;
        if (res.status === 404) break;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw last || new Error('Gemini に つながりませんでした');
  }

  function match(name, kind) {
    const pool = kind === 'mem' ? MEMS : Object.values(ITEMS).filter(i => i.kind !== 'm');
    const n = nz(name);
    return pool.find(i => nz(i.n) === n) || pool.find(i => n.length >= 3 && (nz(i.n).includes(n) || n.includes(nz(i.n))));
  }

  async function run(kind, files) {
    const total = files.length;
    sheet(`<div class="thinking" id="scanprog" style="margin-top:8px">よみこみちゅう… 0 / ${total}まい</div><div class="note">スクショは Google の AI（Gemini）に おくって 文字を よみます。</div>`);
    const found = new Map(); const unmatched = new Set(); let done = 0;
    try {
      for (let i = 0; i < files.length; i += PER_CALL) {
        const part = files.slice(i, i + PER_CALL);
        const imgs = await Promise.all(part.map(shrink));
        const text = await callGemini({
          contents: [{ role: 'user', parts: [...imgs.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d } })), { text: prompt(kind) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 }
        });
        let items = [];
        try { items = JSON.parse(text).items || []; } catch (e) { }
        const perCall = new Map();
        for (const x of items) {
          const it = match(x.name, kind);
          if (!it) { if (x.name) unmatched.add(x.name); continue; }
          const cur = perCall.get(it.id) || { it, n: 0, rank: '', lv: 0, t: 0 };
          cur.n += Math.max(1, x.count || 1);
          if (x.rank && /^[SABCD]$/i.test(x.rank)) cur.rank = x.rank.toUpperCase();
          cur.lv = Math.max(cur.lv, x.level || 0); cur.t = Math.max(cur.t, x.totu || 0);
          perCall.set(it.id, cur);
        }
        // 同じものが 何枚かの スクショに 重なって 写るので、個数は 枚をまたいで 足さずに 一番多い数を とる
        for (const [id, v] of perCall) {
          const f = found.get(id);
          if (!f) found.set(id, v);
          else { f.n = Math.max(f.n, v.n); f.rank = v.rank || f.rank; f.lv = Math.max(f.lv, v.lv); f.t = Math.max(f.t, v.t); }
        }
        done += part.length;
        const pr = document.getElementById('scanprog'); if (pr) pr.textContent = `よみこみちゅう… ${done} / ${total}まい`;
      }
    } catch (e) {
      const bad = e.status === 400 || e.status === 401 || e.status === 403;
      sheet(`<div class="banner" style="margin-top:8px">よみこめませんでした：${esc(e.message)}</div>
        <div class="note" style="margin-top:6px">${bad ? 'かぎが まちがっているかも しれません。' : 'しばらく たってから もう一度 ためしてください。'}</div>
        <div class="row" style="margin-top:10px">${bad ? `<button class="btn" data-act="scanreset" data-k="${kind}">かぎを 入れなおす</button>` : ''}<button class="btn" data-act="close">とじる</button></div>`);
      return;
    }
    pending = { kind, results: [...found.values()], unmatched: [...unmatched] };
    confirmView();
  }

  function confirmView() {
    const { kind, results, unmatched } = pending;
    const isMem = kind === 'mem';
    const rows = results.sort((a, b) => a.it.n.localeCompare(b.it.n, 'ja')).map(r => `<div class="line"><span class="k">${isMem ? (r.rank || 'S') : '×' + r.n}</span><span class="v">${esc(r.it.n)}${!isMem && r.lv ? ` <span class="sub">Lv${r.lv}${r.t ? ' ' + r.t + '凸' : ''}</span>` : ''}</span></div>`).join('');
    sheet(`<div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0">${results.length}こ よみとれました</h2><button class="btn" data-act="close">やめる</button></div>
      <div class="lines" style="margin:8px 0;max-height:34vh;overflow:auto">${rows || '<div class="note">見つかりませんでした</div>'}</div>
      ${unmatched.length ? `<div class="note">わからなかった 名前：${unmatched.map(esc).join('、')}</div>` : ''}
      <label class="row note" style="margin-top:8px;gap:6px"><input type="checkbox" id="scanall" checked style="width:20px;height:20px">
        ${isMem ? 'よみとれなかった メモリは「もっていない」にする（一覧を さいごまで 撮ったとき）' : 'よみとれなかった そうびは 0こにする（一覧を さいごまで 撮ったとき）'}</label>
      ${isMem ? '<label class="row note" style="gap:6px"><input type="checkbox" id="scanrank" checked style="width:20px;height:20px">見えた ランクも 入れる</label>' : ''}
      <button class="btn big" style="margin-top:10px" data-act="scanapply">この ないようで とうろく</button>`);
  }

  function apply() {
    if (!pending) return;
    const { kind, results } = pending;
    const all = document.getElementById('scanall')?.checked;
    if (kind === 'mem') {
      const got = new Set(results.map(r => r.it.id));
      const useRank = document.getElementById('scanrank')?.checked;
      for (const m of MEMS) {
        if (got.has(m.id)) S.memNo[m.id] = false;
        else if (all) S.memNo[m.id] = true;
      }
      if (useRank) for (const r of results) if (r.rank) S.memRank[r.it.id] = r.rank;
    } else {
      if (all) for (const id of Object.keys(S.eq)) if (ITEMS[id] && ITEMS[id].kind !== 'm') S.eq[id].n = 0;
      for (const r of results) {
        const s = S.eq[r.it.id] || { n: 0, lv: 1, t: 0 };
        s.n = Math.min(9, Math.max(s.n || 0, r.n));
        if (r.lv) s.lv = r.lv; if (r.t) s.t = r.t;
        S.eq[r.it.id] = s;
      }
    }
    S.example = false;
    pending = null;
    document.getElementById('sheet').hidden = true;
    invalidate(); save(); render();
  }

  function saveKey(kind) {
    const v = (document.getElementById('gemkey')?.value || '').trim();
    if (!v) return;
    store.set('smagro.geminiKey', v);
    start(kind);
  }
  function resetKey(kind) { store.set('smagro.geminiKey', ''); askKey(kind); }

  return { start, apply, saveKey, resetKey };
})();
