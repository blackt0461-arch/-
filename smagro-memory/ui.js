/* ===== 画面 ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('ja-JP');
const KEY = 'smagro-saitekika-v1';
const TABS = [['party', 'パーティ'], ['enemy', 'てき'], ['mem', 'メモリ'], ['eq', 'そうび'], ['result', 'さくせん'], ['help', 'せつめい']];
const STAT_KEYS = ['HP', 'こうげき力', 'こうげき魔力', 'かいふく魔力', 'しゅび力', '呪文しゅび力', 'きようさ'];
const EQTABS = [['w', '武器'], ['盾', '盾'], ['頭防具', '頭'], ['上防具', '上'], ['下防具', '下'], ['c', 'アクセ']];
const ALL_SKILLS = [...new Set(Object.values(ITEMS).flatMap(it => (it.kind === 'm' ? it.effs : [...it.lv.map(x => x[1]), ...it.totu.map(x => x[1]), ...(it.perf || [])]).filter(e => e.k === 'skill').map(e => e.skill)))].sort((a, b) => a.localeCompare(b, 'ja'));
// アイコン（GameWith の画像。見えている分だけ読む）
const ico = (it, size = 40, cls = '') => it && it.img ? `<img class="ico ${cls}" src="${esc(it.img)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="ico ico-none" style="width:${size}px;height:${size}px"></span>`;
const byName = n => Object.values(ITEMS).find(it => it.n === n);

function defaults() {
  const ex = {};
  for (const n of ['ロトのつるぎ', 'はやぶさの剣', 'りゅうおうの杖', 'メタスラの盾', 'ロトの盾', 'メタスラヘルム', 'メタスラよろい下', '炎のイヤリング', 'インテリのうでわ']) { const it = byName(n); if (it) ex[it.id] = { n: 1, lv: 1, t: 0 }; }
  return {
    v: 2, example: true, tab: 'result', eqTab: 'w', memColor: '', memQ: '', eqQ: '', eqOwned: false,
    party: [
      { job: '戦士', cap: 185, base: { atk: 150, matk: 150 }, w: [0, 1, 1, 0, 0, 0, 0] },
      { job: '僧侶', cap: 150, base: { atk: 100, matk: 100 }, w: [0, 1, 1, 0, 0, 0, 0] },
      { job: '魔法使い', cap: 150, base: { atk: 100, matk: 100 }, w: [0, 1, 1, 0, 0, 0, 0] }
    ],
    main: 0, fixW: '', need: [],
    enemy: { mode: 'boss', boss: (BOSSES.find(b => b.boss === 'スライムナイト') || BOSSES[0] || {}).n || '', fam: 'スライム系', weak: {} },
    memNo: {}, memRank: {}, memPin: {}, eq: ex
  };
}
let S = defaults();
try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(defaults(), JSON.parse(raw)); } catch (e) { }
// 1人目を いつも メインにする（前の保存で ちがう人が メインだったら 先頭へ）
if (S.main && S.party[S.main]) { const m = S.party.splice(S.main, 1)[0]; S.party.unshift(m); }
S.main = 0;
// v2: サブは「こうげき力＋こうげき魔力」を たいせつにするのが 初期設定
if (!(S.v >= 2)) { for (const p of S.party) p.w = [0, 1, 1, 0, 0, 0, 0]; S.v = 2; }
for (const p of S.party) { p.base = p.base || { atk: 100, matk: 100 }; p.w = p.w || [0, 0, 0, 0, 0, 0, 0]; }
let lastResult = null;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
}
function touch() { if (S.example) { S.example = false; } save(); }

/* ---------- 敵 ---------- */
function enemyCtx() {
  const e = S.enemy;
  if (e.mode === 'boss') {
    const b = BOSSES.find(x => x.n === e.boss);
    if (b) { const weak = {}; for (const [lab, els] of Object.entries(b.w || {})) for (const el of els) weak[el] = lab; return { name: b.boss, fam: b.f || e.fam, weak, label: b.n }; }
  }
  return { name: '', fam: e.fam, weak: e.weak || {}, label: e.fam || 'てき' };
}

/* ---------- 計算 ---------- */
function ownedEq() { return Object.entries(S.eq).filter(([id, x]) => x.n > 0 && ITEMS[id]).map(([id, x]) => ({ it: ITEMS[id], lv: x.lv || 1, t: x.t || 0, n: x.n, pin: !!x.pin })); }
function runAll() {
  const en = enemyCtx();
  const avail = {}; for (const x of ownedEq()) avail[x.it.id] = x.n;
  const pool = kind => ownedEq().filter(x => avail[x.it.id] > 0 && (kind === 'w' ? x.it.kind === 'w' : kind === 'c' ? x.it.kind === 'c' : x.it.t === kind)).map(x => ({ ...x, n: avail[x.it.id] }));
  const mems = cap => MEMS.filter(m => !S.memNo[m.id] && m.ct <= cap).map(m => ({ m, rank: S.memRank[m.id] || 'S' }));
  const out = { main: null, alts: [], subs: [] };
  const order = [S.main, ...[0, 1, 2].filter(i => i !== S.main)];
  for (const idx of order) {
    const p = S.party[idx], job = JOBS.find(j => j.n === p.job) || JOBS[0];
    const isMain = idx === S.main;
    const weapons = pool('w');
    let fixW = null;
    if (isMain && S.fixW) fixW = weapons.find(x => x.it.id === S.fixW) || null;
    const pins = isMain ? { eq: Object.fromEntries(ownedEq().filter(x => x.pin && x.it.kind !== 'w' && avail[x.it.id] > 0).map(x => [x.it.kind === 'c' ? 'c' : x.it.t, x])), mem: Object.keys(S.memPin).filter(k => S.memPin[k] && !S.memNo[k]) } : null;
    if (isMain && !fixW) { const pw = ownedEq().find(x => x.pin && x.it.kind === 'w'); if (pw) fixW = weapons.find(x => x.it.id === pw.it.id) || null; }
    const res = searchChar({
      job: p.job, cap: +p.cap || 0, slots: job.c, weapons, fixWeapon: fixW, eqAvail: pool, memAvail: mems(+p.cap || 0), pins,
      mode: isMain ? 'dmg' : 'stat', weights: p.w.map(Number), enemy: en, base: { atk: +p.base.atk || 0, matk: +p.base.matk || 0 }, needSkills: isMain ? S.need : []
    });
    const best = res[0];
    if (best.W) avail[best.W.it.id]--;
    for (const x of Object.values(best.eq)) if (x) avail[x.it.id]--;
    if (isMain) { out.main = { idx, p, r: best }; out.alts = res.slice(1, 5).map(r => ({ idx, p, r })); }
    else out.subs.push({ idx, p, r: best });
  }
  out.enemy = en;
  return out;
}

/* ---------- 描画 ---------- */
function render() {
  const cmd = $('#cmd');
  cmd.innerHTML = TABS.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" data-tab="${k}">${l}</button>`).join('');
  const v = $('#view');
  const f = { party: vParty, enemy: vEnemy, mem: vMem, eq: vEq, result: vResult, help: vHelp }[S.tab] || vResult;
  v.innerHTML = (S.example ? `<div class="banner">いまは「れい」の もちものが 入っています。じぶんの もちものに かえると 消えます。</div>` : '') + f();
  if (S.tab === 'result' && !lastResult) setTimeout(compute, 30);
}
function compute() {
  const box = document.getElementById('resbox'); if (!box) return;
  box.innerHTML = '<div class="win"><span class="thinking">かんがえちゅう…</span></div>';
  setTimeout(() => { try { lastResult = runAll(); } catch (e) { lastResult = { err: String(e) }; } if (S.tab === 'result') { const b = document.getElementById('resbox'); if (b) b.innerHTML = vResultBody(); } }, 30);
}
function invalidate() { lastResult = null; }

function slotDots(job) { const j = JOBS.find(x => x.n === job); return j ? `<span class="slots" title="メモリのわく">${j.c.map(c => c === '虹' ? '<span class="cdot c-虹"></span>' : [...c].map(x => `<span class="cdot c-${x}"></span>`).join('')).join('<span class="sub">/</span>')}</span>` : ''; }

function vParty() {
  return `<div class="win"><span class="tag">パーティ</span>
    <div class="note" style="margin-top:4px">1人目（★メイン）の 火力が いちばん高くなるように えらびます。2人目・3人目（サブ）は、のこりの そうびと メモリで、チェックした のうりょく（はじめは こうげき力＋こうげき魔力）の 合計が 高くなるように えらびます。「⇅ メインと入れかえ」で 入れかえられます。</div></div>` +
    S.party.map((p, i) => {
      const main = i === S.main;
      return `<section class="win member"><span class="tag">${i + 1}人め${main ? '　★メイン' : ''}</span>
      <div class="head" style="margin-top:6px"><div class="row">${slotDots(p.job)}</div>
        ${main ? '<span class="chip on">★ メインで たたかう</span>' : `<button class="chip" data-act="swap" data-i="${i}">⇅ メインと入れかえ</button>`}</div>
      <div class="grid2">
        <label class="f">しょくぎょう<select id="job${i}" data-act="job" data-i="${i}">${JOBS.map(j => `<option ${j.n === p.job ? 'selected' : ''}>${j.n}</option>`).join('')}</select></label>
        <label class="f">コストの じょうげん<input id="cap${i}" type="number" inputmode="numeric" min="0" max="999" value="${esc(p.cap)}" data-act="cap" data-i="${i}"></label>
      </div>
      ${main ? `<div class="grid2">
        <label class="f">もとの こうげき力<input id="ba${i}" type="number" inputmode="numeric" min="0" value="${esc(p.base.atk)}" data-act="base" data-k="atk" data-i="${i}"></label>
        <label class="f">もとの こうげき魔力<input id="bm${i}" type="number" inputmode="numeric" min="0" value="${esc(p.base.matk)}" data-act="base" data-k="matk" data-i="${i}"></label></div>
        <div class="note">そうびと メモリを ぜんぶ外したときの ステータスの数字です。わからなければ そのままで だいじょうぶ（くらべる じゅんばんは ほぼ変わりません）。</div>
        <label class="f">武器を こていする<select id="fixw" data-act="fixw"><option value="">じどうで えらぶ</option>${ownedEq().filter(x => x.it.kind === 'w').map(x => `<option value="${x.it.id}" ${S.fixW === x.it.id ? 'selected' : ''}>${esc(x.it.n)}</option>`).join('')}</select></label>
        <div><div class="note" style="margin-bottom:4px">かならず ほしい 冒険スキル（えらぶと それを持つ そうびか メモリを 入れます）</div>
        <div class="row">${S.need.map(s => `<button class="chip on" data-act="needdel" data-s="${esc(s)}">${esc(s)} ✕</button>`).join('')}
        <select id="needadd" data-act="needadd" style="width:auto"><option value="">＋ ついか</option>${ALL_SKILLS.filter(s => !S.need.includes(s)).map(s => `<option>${esc(s)}</option>`).join('')}</select></div></div>`
          : `<div><div class="note" style="margin-bottom:4px">たいせつな のうりょく</div><div class="row">${STAT_KEYS.map((k, j) => `<button class="chip ${p.w[j] ? 'on' : ''}" data-act="w" data-i="${i}" data-j="${j}" aria-pressed="${!!p.w[j]}">${k}</button>`).join('')}</div></div>`}
    </section>`;
    }).join('');
}

const WEAK_ORDER = ['', '弱点', '超弱', '耐性', '無効'];
function vEnemy() {
  const e = S.enemy, en = enemyCtx();
  const groups = {};
  for (const b of BOSSES) { const g = /ほこら/.test(b.n) ? 'ほこら' : /軍|防衛|攻防|殲滅|奇襲/.test(b.n) ? 'マルチ' : /遺跡/.test(b.n) ? '遺跡' : /ゴーレム|ベビーマジシャン|ひくいどり/.test(b.n) ? 'まものラッシュ' : '強敵マッチ'; (groups[g] = groups[g] || []).push(b); }
  return `<div class="win"><span class="tag">てき</span>
    <div class="row" style="margin-top:6px"><button class="btn ${e.mode === 'boss' ? 'on' : ''}" data-act="emode" data-m="boss">ボスから えらぶ</button><button class="btn ${e.mode === 'manual' ? 'on' : ''}" data-act="emode" data-m="manual">じぶんで きめる</button></div></div>
  <div class="win"><span class="tag">いまの てき</span>
    <h2 style="margin-top:6px">${esc(en.label)}</h2>
    <div class="lines"><div class="line"><span class="k">けいとう</span><span class="v">${esc(en.fam || 'わからない')}</span></div></div>
    <div class="weak" style="margin-top:8px">${ELS.map(el => `<button ${e.mode === 'manual' ? `data-act="weak" data-el="${el}"` : 'disabled'} data-s="${esc(en.weak[el] || '')}"><span>${el}</span><span>${esc(en.weak[el] || 'ー')}</span></button>`).join('')}</div>
    ${e.mode === 'manual' ? `<label class="f" style="margin-top:10px">けいとう<select id="efam" data-act="efam"><option value="">わからない</option>${FAMS.map(f => `<option ${f === e.fam ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label><div class="note">ぞくせいを タップすると ふつう→弱点→超弱→耐性→無効 と かわります。</div>` : '<div class="note" style="margin-top:6px">超弱は ダメージ約1.7倍、弱点は約1.5倍で けいさんします。</div>'}
  </div>
  ${e.mode === 'boss' ? Object.entries(groups).map(([g, bs]) => `<div class="win"><span class="tag">${g}</span><div class="bosslist" style="margin-top:6px">${bs.map(b => `<button class="chip ${b.n === e.boss ? 'on' : ''}" data-act="boss" data-n="${esc(b.n)}">${esc(b.n)}</button>`).join('')}</div></div>`).join('') : ''}`;
}

function vMem() {
  const qq = S.memQ.trim();
  const list = MEMS.filter(m => (!S.memColor || m.c === S.memColor) && (!qq || m.n.includes(qq) || m.effs.some(e => e.text.includes(qq)))).sort((a, b) => b.ct - a.ct);
  const nOff = MEMS.filter(m => S.memNo[m.id]).length;
  return `<div class="win"><span class="tag">メモリ</span>
    <div class="note" style="margin-top:6px">ぜんぶ もっている あつかいです。<b style="color:var(--line)">もっていない メモリを タップ</b>して はずしてください。右の ランクを おすと ランクや「かならず使う」を かえられます。</div>
    <label class="btn big scanbtn" style="margin-top:8px">スクショから よみこむ<input type="file" accept="image/*" multiple class="vh" id="scanfile-mem" data-act="scanfile" data-k="mem"></label>
    <div class="note">ゲームの メモリ一覧を スクロールしながら スクショを 何まいか 撮って、まとめて えらんでください。</div>
    <div class="row" style="margin-top:8px"><input id="memq" type="search" placeholder="なまえ・こうかで さがす" value="${esc(S.memQ)}" data-act="memq" style="flex:1 1 180px">
    <span class="sub">もってない ${nOff} / ${MEMS.length}</span></div>
    <div class="row" style="margin-top:8px"><button class="chip ${!S.memColor ? 'on' : ''}" data-act="mcol" data-c="">ぜんぶ</button>${['赤', '青', '黄', '緑', '紫'].map(c => `<button class="chip ${S.memColor === c ? 'on' : ''}" data-act="mcol" data-c="${c}"><span class="cdot c-${c}"></span> ${c}</button>`).join('')}</div></div>
  <div class="tiles">${list.map(m => `<div class="tile ${S.memNo[m.id] ? 'off' : ''} ${S.memPin[m.id] ? 'pin' : ''}" role="button" tabindex="0" data-act="memtog" data-id="${m.id}" aria-pressed="${!S.memNo[m.id]}">
      <span class="icow">${ico(m, 44)}<span class="cdot c-${m.c} icodot"></span></span><span class="nm">${esc(m.n)}</span>
      <button class="rk" data-act="memsheet" data-id="${m.id}" aria-label="${esc(m.n)}の くわしく">${S.memRank[m.id] || 'S'}</button>
      <span class="ct">コスト${m.ct}${S.memPin[m.id] ? '　★かならず' : ''}</span></div>`).join('')}</div>`;
}
function memSheet(id) {
  const m = ITEMS[id];
  const sh = $('#sheet');
  sh.innerHTML = `<div class="win"><span class="tag">メモリ</span>
    <div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:0;display:flex;gap:10px;align-items:center">${ico(m, 64)}<span><span class="cdot c-${m.c}"></span> ${esc(m.n)}</span></h2><button class="btn" data-act="close">とじる</button></div>
    <div class="sub">${esc(m.f || '')}　コスト${m.ct}　${esc(m.r)}</div>
    <div class="calc" style="margin:8px 0">${STAT_KEYS.map((k, i) => `<span>${k}</span><span>${Math.round(m.st[i] * (RANKF[S.memRank[id] || 'S']))}</span>`).join('')}</div>
    <div class="eff">${m.effs.map(e => esc(e.text)).join('<br>')}</div>
    <div class="note" style="margin-top:8px">ランク（S以外の数字は Sの数字からの めやす）</div>
    <div class="row">${['S', 'A', 'B', 'C', 'D'].map(r => `<button class="btn ${(S.memRank[id] || 'S') === r ? 'on' : ''}" data-act="rank" data-id="${id}" data-r="${r}">${r}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn ${S.memNo[id] ? '' : 'on'}" data-act="memtog2" data-id="${id}">${S.memNo[id] ? 'もっていない' : 'もっている'}</button>
    <button class="btn ${S.memPin[id] ? 'on' : ''}" data-act="mpin" data-id="${id}">★ メインに かならず使う</button></div></div>`;
  sh.hidden = false;
}

function eqEffText(it) {
  const a = it.lv.map(([L, e]) => (it.maxLv > 1 ? `Lv${L} ` : '') + e.text);
  const b = it.totu.map(([L, e]) => `${L}凸 ${e.text}`);
  const c = (it.perf || []).map(e => e.text);
  return [...c, ...a, ...b].join(' / ');
}
function vEq() {
  const t = S.eqTab, qq = S.eqQ.trim();
  let list = (EQ[t] || []).filter(it => (!qq || it.n.includes(qq)) && (!S.eqOwned || (S.eq[it.id] && S.eq[it.id].n > 0)));
  list = list.slice().sort((a, b) => ((S.eq[b.id]?.n || 0) > 0) - ((S.eq[a.id]?.n || 0) > 0) || b.rar - a.rar);
  const owned = ownedEq().length;
  return `<div class="win"><span class="tag">そうび</span>
    <div class="note" style="margin-top:6px"><b style="color:var(--line)">もっている そうびの 数</b>を ＋で ふやしてください（いまは ${owned}しゅるい）。強化したものは レベルと 凸を 入れます。入れなければ 強化していない あつかいです。</div>
    <label class="btn big scanbtn" style="margin-top:8px">スクショから よみこむ<input type="file" accept="image/*" multiple class="vh" id="scanfile-eq" data-act="scanfile" data-k="eq"></label>
    <div class="note">ゲームの そうび一覧を スクロールしながら スクショを 何まいか 撮って、まとめて えらんでください。</div>
    <div class="row" style="margin-top:8px">${EQTABS.map(([k, l]) => `<button class="btn ${t === k ? 'on' : ''}" data-act="eqtab" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input id="eqq" type="search" placeholder="なまえで さがす" value="${esc(S.eqQ)}" data-act="eqq" style="flex:1 1 160px"><button class="chip ${S.eqOwned ? 'on' : ''}" data-act="eqowned">もってるだけ</button></div></div>
  <div class="win"><span class="tag">${EQTABS.find(x => x[0] === t)[1]}</span><div style="margin-top:4px">${list.map(it => {
    const s = S.eq[it.id] || { n: 0, lv: 1, t: 0 };
    const st = eqStats(it, s.lv, s.t).st;
    const stat = it.kind === 'w' ? [st[1] ? 'こうげき' + st[1] : '', st[2] ? 'まりょく' + st[2] : ''].filter(Boolean).join(' ') : it.kind === 'a' ? `しゅび${st[4]} じゅもん${st[5]}` : '';
    return `<div class="eqrow"><div class="eqtop">${ico(it, 48)}<div class="nm" style="flex:1"><div>${'★'.repeat(it.rar || 0)} ${esc(it.n)}</div><div class="sub">${esc(it.kind === 'w' ? it.t + '・' + (it.el || '無') + 'ぞくせい' : it.t)}　${stat}</div></div>
      <div class="stepper"><button data-act="eqn" data-id="${it.id}" data-d="-1" aria-label="へらす">－</button><output>${s.n}</output><button data-act="eqn" data-id="${it.id}" data-d="1" aria-label="ふやす">＋</button></div></div>
      ${s.n > 0 ? `<div class="eqmore">${it.maxLv > 1 ? `<label>Lv <input id="lv_${it.id}" type="number" inputmode="numeric" min="1" max="99" value="${s.lv || 1}" data-act="eqlv" data-id="${it.id}"></label><label>凸 <input id="tt_${it.id}" type="number" inputmode="numeric" min="0" max="5" value="${s.t || 0}" data-act="eqt" data-id="${it.id}"></label>` : ''}<button class="chip ${s.pin ? 'on' : ''}" data-act="eqpin" data-id="${it.id}">★ メインに かならず使う</button></div>` : ''}
      <div class="eff">${esc(eqEffText(it))}</div></div>`;
  }).join('') || '<div class="note">見つかりません</div>'}</div></div>`;
}

function vResult() {
  return `<div class="win"><span class="tag">さくせん</span>
    <div class="note" style="margin-top:6px">てき：<b style="color:var(--line)">${esc(enemyCtx().label)}</b>　メイン：<b style="color:var(--line)">${esc(S.party[S.main].job)}</b></div>
    <button class="btn big" style="margin-top:8px" data-act="run">▶ さいてきかいを さがす</button></div><div id="resbox" class="wrap">${lastResult ? vResultBody() : ''}</div>`;
}
function itemLine(k, x) {
  if (!x) return `<div class="line"><span class="k">${k}</span><span class="v sub">なし</span></div>`;
  const s = S.eq[x.it.id] || {};
  const lv = x.it.maxLv > 1 ? ` <span class="sub">Lv${s.lv || 1}${s.t ? ' ' + s.t + '凸' : ''}</span>` : '';
  return `<div class="line"><span class="k">${k}</span><span class="v vi">${ico(x.it, 32)}<span>${esc(x.it.n)}${lv}</span></span></div>`;
}
function loadout(r, p) {
  const eqs = [['武器', r.W], ...PARTS.map(pt => [pt.replace('防具', ''), r.eq[pt]]), ...Array.from({ length: ACC_SLOTS }, (_, i) => ['アクセ', r.eq['c' + i]])];
  return `<div class="lines">${eqs.map(([k, x]) => itemLine(k, x)).join('')}</div>
    <h2 style="margin-top:12px">メモリ <span class="sub">コスト ${r.cost} / ${p.cap}</span></h2>
    <div class="lines">${r.slots.map((c, j) => { const x = r.mem[j]; return `<div class="memslot">${c === '虹' ? '<span class="cdot c-虹"></span>' : [...c].map(y => `<span class="cdot c-${y}"></span>`).join('')}
      <span class="vi">${x ? `${ico(x.m, 32)}<span>${esc(x.m.n)} <span class="sub">${x.rank}・コスト${x.m.ct}</span></span>` : '<span class="sub">あき</span>'}</span>
      <span class="sub">${x && x.matched ? '色いっち' : ''}</span></div>`; }).join('')}</div>`;
}
function statsLine(V) { return `<div class="calc" style="margin-top:10px">${STAT_KEYS.map((k, i) => `<span>${k}</span><span>＋${fmt(V[i])}</span>`).join('')}</div>`; }
function vResultBody() {
  const R = lastResult; if (!R) return '';
  if (R.err) return `<div class="win warn">けいさんで エラーが おきました：${esc(R.err)}</div>`;
  const M = R.main, r = M.r, pt = r.parts;
  const typ = r.ctx.type === 'phys' ? '物理' : '呪文';
  const weakLab = r.ctx.weakMul > 1 ? `${r.ctx.el}が ${r.ctx.weakMul >= 1.7 ? '超弱点' : '弱点'}` : r.ctx.weakMul < 1 ? `${r.ctx.el}は 効きにくい` : 'ふつう';
  let html = `<section class="win"><span class="tag">★ ${M.idx + 1}人め ${esc(M.p.job)}</span>
    <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="chip" data-act="pip" data-i="0">うかぶメモ</button></div>
    <div class="power" style="margin-top:4px"><span class="num">${fmt(pt.total)}</span><span class="sub">火力の めやす（${typ}・${esc(r.ctx.el || '無')}ぞくせい）</span></div>
    ${!r.skillOK ? '<div class="banner" style="margin-top:8px">かならず ほしい 冒険スキルを 入れられませんでした。もっている そうびか メモリを 見なおしてください。</div>' : ''}
    <div style="margin-top:10px">${loadout(r, M.p)}</div>
    <h2 style="margin-top:12px">火力の うちわけ</h2>
    <div class="calc"><span>こうげき${r.ctx.type === 'phys' ? '力' : '魔力'}（もと＋そうび＋メモリ）</span><span>${fmt(pt.base)}</span>
      <span>${typ}ダメージ</span><span>×${pt.mAll.toFixed(2)}</span>
      <span>${esc(r.ctx.el || '無')}ぞくせいダメージ</span><span>×${pt.mEl.toFixed(2)}</span>
      <span>${esc(R.enemy.fam || 'けいとう')}・あいてへの とっこう</span><span>×${pt.mFam.toFixed(2)}</span>
      <span>じゃくてん（${weakLab}）</span><span>×${pt.weak.toFixed(2)}</span>
      <span>${r.ctx.type === 'phys' ? '会心' : '暴走'}の きたいち（${Math.round(pt.rate)}%）</span><span>×${pt.crit.toFixed(2)}</span></div>
    ${statsLine(r.V)}
  </section>`;
  if (R.alts.length) html += `<section class="win"><span class="tag">べつの あん（武器ちがい）</span><div class="lines" style="margin-top:6px">${R.alts.map((a, i) => `<details class="alt-d"><summary class="alt" style="list-style:none"><span>${esc(a.r.W ? a.r.W.it.n : '武器なし')}</span><span class="altnum">${fmt(a.r.parts.total)} <span class="sub">(${Math.round(a.r.parts.total / pt.total * 100)}%)</span></span></summary><div style="padding:8px 4px">${loadout(a.r, a.p)}</div></details>`).join('')}</div></section>`;
  for (const s of R.subs) html += `<section class="win"><span class="tag">${s.idx + 1}人め ${esc(s.p.job)}</span>
    <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="chip" data-act="pip" data-i="${s.idx}">うかぶメモ</button><button class="chip" data-act="swap" data-i="${s.idx}">⇅ メインと入れかえて けいさん</button></div>
    <div class="note">たいせつ：${STAT_KEYS.filter((k, j) => s.p.w[j]).join('・') || '（えらんでいません）'}</div>
    <div style="margin-top:8px">${loadout(s.r, s.p)}</div>${statsLine(s.r.V)}</section>`;
  html += `<div class="note">※ 火力は ゲームの 正しい計算式ではなく、くらべるための めやすです。メモリの S以外のランクの数字も めやすです。</div>`;
  return html;
}
function vHelp() {
  return `<div class="win"><span class="tag">せつめい</span><div class="lines" style="margin-top:6px">
  <div>1. 「パーティ」で 3人の しょくぎょうと コストの じょうげんを 入れて、★メインを きめる</div>
  <div>2. 「てき」で たたかう ボスを えらぶ</div>
  <div>3. 「メモリ」で もっていない ものを はずす</div>
  <div>4. 「そうび」で もっている そうびを ＋で ふやす</div>
  <div>5. 「さくせん」で さいてきかいを さがす</div></div></div>
  <div class="win"><span class="tag">けいさんの しかた</span><div class="note" style="margin-top:6px">
  火力のめやす ＝ こうげき力 × 物理(呪文)ダメージ × ぞくせいダメージ × けいとう とっこう × じゃくてん × 会心の きたいち。<br>
  メモリは 枠の色と あうと のうりょくが 1.2倍。虹の枠は どの色でも 1.2倍。超弱点は 約1.7倍、弱点は 約1.5倍。会心は きほん${BASE_CRIT}%で ダメージ＋50%として います。<br>
  そうびの のうりょくは レベル1〜最大の あいだを まっすぐ のびる として めやすを だしています。<br>
  版 ${esc(window.APP_V || '')}。データ：メモリ ${MEMS.length}しゅるい、そうび ${Object.values(ITEMS).filter(i => i.kind !== 'm').length}しゅるい、ボス ${BOSSES.length}。${esc(window.DATA_UPDATED || '')} 時点（毎日 じどうで 更新）。</div></div>`;
}

/* ---------- 操作 ---------- */
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act],[data-tab]'); if (!b) return;
  const a = b.dataset.act, i = +b.dataset.i;
  if (b.dataset.tab) { S.tab = b.dataset.tab; save(); $('#sheet').hidden = true; render(); window.scrollTo({ top: 0 }); return; }
  switch (a) {
    case 'swap': { const P = S.party; [P[0], P[i]] = [P[i], P[0]]; S.main = 0; if (S.tab === 'result') window.scrollTo({ top: 0 }); break; }
    case 'w': S.party[i].w[+b.dataset.j] = S.party[i].w[+b.dataset.j] ? 0 : 1; break;
    case 'needdel': S.need = S.need.filter(x => x !== b.dataset.s); break;
    case 'emode': S.enemy.mode = b.dataset.m; break;
    case 'boss': S.enemy.boss = b.dataset.n; break;
    case 'weak': { const cur = S.enemy.weak[b.dataset.el] || ''; S.enemy.weak[b.dataset.el] = WEAK_ORDER[(WEAK_ORDER.indexOf(cur) + 1) % WEAK_ORDER.length]; break; }
    case 'mcol': S.memColor = b.dataset.c; break;
    case 'memsheet': ev.stopPropagation(); memSheet(b.dataset.id); return;
    case 'memtog': S.memNo[b.dataset.id] = !S.memNo[b.dataset.id]; break;
    case 'memtog2': S.memNo[b.dataset.id] = !S.memNo[b.dataset.id]; invalidate(); save(); render(); memSheet(b.dataset.id); return;
    case 'rank': S.memRank[b.dataset.id] = b.dataset.r; invalidate(); save(); render(); memSheet(b.dataset.id); return;
    case 'mpin': S.memPin[b.dataset.id] = !S.memPin[b.dataset.id]; invalidate(); save(); render(); memSheet(b.dataset.id); return;
    case 'close': $('#sheet').hidden = true; return;
    case 'scan': Scan.start(b.dataset.k); return;
    case 'scanapply': Scan.apply(); return;
    case 'pip': Pip.open(i); return;
    case 'pipgo': Pip.go(); return;
    case 'pipclose': Pip.stop(); $('#sheet').hidden = true; return;
    case 'eqtab': S.eqTab = b.dataset.t; save(); render(); return;
    case 'eqowned': S.eqOwned = !S.eqOwned; save(); render(); return;
    case 'eqn': { const id = b.dataset.id; const s = S.eq[id] || { n: 0, lv: 1, t: 0 }; s.n = Math.max(0, Math.min(9, (s.n || 0) + (+b.dataset.d))); S.eq[id] = s; if (S.example) { S.example = false; } break; }
    case 'eqpin': { const s = S.eq[b.dataset.id]; if (s) s.pin = !s.pin; break; }
    case 'run': invalidate(); compute(); return;
    default: return;
  }
  invalidate(); touch(); render();
});
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('tile')) { ev.preventDefault(); ev.target.click(); } });
document.addEventListener('change', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'scanfile') { const files = b.files ? [...b.files] : []; if (files.length) Scan.runFiles(b.dataset.k, files); return; }
  const a = b.dataset.act, i = +b.dataset.i, v = b.value;
  switch (a) {
    case 'job': S.party[i].job = v; break;
    case 'cap': S.party[i].cap = Math.max(0, +v || 0); break;
    case 'base': S.party[i].base[b.dataset.k] = Math.max(0, +v || 0); break;
    case 'fixw': S.fixW = v; break;
    case 'needadd': if (v && !S.need.includes(v)) S.need.push(v); break;
    case 'efam': S.enemy.fam = v; break;
    case 'eqlv': S.eq[b.dataset.id].lv = Math.max(1, Math.min(99, +v || 1)); break;
    case 'eqt': S.eq[b.dataset.id].t = Math.max(0, Math.min(5, +v || 0)); break;
    default: return;
  }
  invalidate(); touch(); render();
});
let qTimer = null;
document.addEventListener('input', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act !== 'memq' && b.dataset.act !== 'eqq') return;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    if (b.dataset.act === 'memq') S.memQ = b.value; else S.eqQ = b.value;
    save(); render();
    const el = document.getElementById(b.id); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 250);
});
render();
