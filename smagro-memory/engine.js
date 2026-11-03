/* ===== スマグロ さいてきか エンジン ===== */
const ELS = ['炎', '氷', '雷', '土', '風', '光', '闇'];
const TOKUI = { 戦士: ['剣', 'ヤリ'], 魔法使い: ['ムチ', '杖'], 僧侶: ['ムチ', '杖', 'ヤリ', 'ブーメラン'], 武闘家: ['剣', 'ツメ', 'ヤリ'], 盗賊: ['剣', 'ツメ', 'ブーメラン'], パラディン: ['剣', 'ヤリ'], 賢者: ['ムチ', '杖'], レンジャー: ['ツメ', 'ムチ', 'ブーメラン'], バトルマスター: ['剣', 'ヤリ', 'ツメ'] };
const WT = { 槍: 'ヤリ', やり: 'ヤリ' };
const STATK = { 'こうげき力': 1, '攻撃力': 1, 'こうげき': 1, 'ちから': 1, 'こうげき魔力': 2, 'かいふく魔力': 3, 'しゅび力': 4, '呪文しゅび力': 5, '呪文じゅび力': 5, 'きようさ': 6, '最大HP': 0, 'HP': 0 };
const STATNAMES = ['HP', 'こうげき力', 'こうげき魔力', 'かいふく魔力', 'しゅび力', '呪文しゅび力', 'きようさ'];
const PARTS = ['盾', '頭防具', '上防具', '下防具'];
const ACC_SLOTS = 1;
const RANKF = { S: 1, A: 0.8, B: 0.65, C: 0.5, D: 0.4 };
const COLOR_BONUS = 1.2;
const BASE_CRIT = 5;          // 会心の基本率(%)のめやす
const CRIT_EXTRA = 0.5;       // 会心で +50% のめやす
const WEAKMUL = { 超弱: 1.7, 弱点: 1.5, 耐性: 0.5, 無効: 0, 吸収: 0 };
const NV = 13; // 0hp 1atk 2matk 3heal 4def 5mdef 6dex 7pAll 8pElem 9pFam 10crit 11critdmg 12boom

const q = s => (s || '').replace(/？/g, '?');
let FAMS = [];

function parseEff(raw) {
  let t = q(raw).trim(); const cond = {}; let m;
  while ((m = t.match(/^【([^】]+)】/))) {
    const x = m[1];
    if (x === '得' || x === '特') cond.tokui = 1; else if (TOKUI[x]) cond.job = x; else cond.wt = WT[x] || x;
    t = t.slice(m[0].length);
  }
  const r = { cond, text: q(raw) };
  if ((m = t.match(/^(こうげき魔力|かいふく魔力|呪文しゅび力|呪文じゅび力|こうげき力|攻撃力|こうげき|ちから|しゅび力|きようさ|最大HP|HP)\+(\d+)$/))) return { ...r, k: 'st', i: STATK[m[1]], v: +m[2] };
  if ((m = t.match(/^(物理|呪文)ダメージ\+(\d+)%$/))) return { ...r, k: m[1] === '物理' ? 'phys' : 'spell', v: +m[2] };
  if ((m = t.match(/^([炎氷雷土風光闇])属性(物理|呪文)?\s*ダメージ\+(\d+)%$/))) return { ...r, k: 'elem', el: m[1], sub: m[2] || '', v: +m[3] };
  if ((m = t.match(/^(.+系)(?:に)?(?:ダメージ)?\+(\d+)%?$/)) && FAMS.includes(m[1])) return { ...r, k: 'fam', fam: m[1], v: +m[2] };
  if ((m = t.match(/^(.+)にダメージ\+(\d+)%$/))) return { ...r, k: 'named', name: m[1], v: +m[2] };
  if ((m = t.match(/^会心率\+(\d+)%$/))) return { ...r, k: 'crit', v: +m[1] };
  if ((m = t.match(/^会心ダメージ\+(\d+)%$/))) return { ...r, k: 'critdmg', v: +m[1] };
  if ((m = t.match(/^魔力の暴走率\+(\d+)%$/))) return { ...r, k: 'boom', v: +m[1] };
  if ((m = t.match(/^最初から(.+)を所持$/))) return { ...r, k: 'skill', skill: m[1] };
  if ((m = t.match(/^★(.+)$/))) return { ...r, k: 'skill', skill: m[1] };
  return { ...r, k: 'other' };
}

/* ---- data → items ---- */
const ITEMS = {}; const MEMS = []; const EQ = { w: [], 盾: [], 頭防具: [], 上防具: [], 下防具: [], c: [] };
let BOSSES = [], JOBS = [];
function initData(D) {
  FAMS = D.fam.map(q);
  JOBS = D.jobs;
  for (const m of D.mem) {
    const it = { kind: 'm', id: 'm' + m.id, n: m.n, c: m.c, ct: m.ct, f: q(m.f), r: m.r, img: m.img || '', st: m.st, effs: m.e.filter(Boolean).map(parseEff), get: m.get };
    ITEMS[it.id] = it; MEMS.push(it);
  }
  for (const e of D.equip) {
    const kind = e.cat;
    const it = { kind, id: e.id, n: e.n, t: kind === 'w' ? e.t : (kind === 'c' ? 'アクセ' : e.t), el: e.el || '', rar: e.rar, img: e.img || '', get: e.get || '' };
    it.maxLv = kind === 'w' ? 50 : (kind === 'a' ? 25 : 1);
    const sm = e.stat || {};
    const pick = k => sm[k] || [0, 0];
    it.base = kind === 'w' ? { atk: pick('攻撃'), matk: pick('攻撃魔力'), heal: pick('回復魔力') } : kind === 'a' ? { def: pick('守備'), mdef: pick('呪文守備'), heal: pick('回復魔力') } : {};
    let lv = e.lv && e.lv.length ? e.lv : (e.allE || []).map(x => [1, x]);
    it.lv = lv.filter(x => x[1] && x[1] !== 'なし').map(([L, x]) => [L, parseEff(x)]);
    it.totu = (e.totu || []).filter(x => x[1] && x[1] !== 'なし').map(([L, x]) => [L, parseEff(x)]);
    it.perf = (e.perf || []).map(parseEff);
    if (kind === 'w' && !it.el) it.el = '無';
    ITEMS[it.id] = it;
    if (kind === 'w') EQ.w.push(it); else if (kind === 'c') EQ.c.push(it); else if (EQ[it.t]) EQ[it.t].push(it);
  }
  BOSSES = D.boss.map(b => ({ n: b.n, boss: b.boss, f: q(b.f), w: b.w }));
}

/* 装備の数値（レベル・凸つき） */
function eqStats(it, lv, totu) {
  const out = { st: new Array(7).fill(0), effs: [] };
  const L = Math.max(1, lv || 1), fr = it.maxLv > 1 ? (L - 1) / (it.maxLv - 1) : 0;
  const v = a => a ? Math.round(a[0] + (a[1] - a[0]) * fr) : 0;
  if (it.kind === 'w') { out.st[1] = v(it.base.atk); out.st[2] = v(it.base.matk); out.st[3] = v(it.base.heal); }
  if (it.kind === 'a') { out.st[4] = v(it.base.def); out.st[5] = v(it.base.mdef); out.st[3] = v(it.base.heal); }
  for (const [n, e] of it.lv) if (n <= L) out.effs.push(e);
  for (const [n, e] of it.totu) if (n <= (totu || 0)) out.effs.push(e);
  for (const e of it.perf || []) out.effs.push(e);
  return out;
}
function weaponType(it, lv) {
  if (!it) return 'phys';
  const s = eqStats(it, lv, 0).st;
  return s[2] > s[1] ? 'spell' : 'phys';
}

function condOK(c, ctx) {
  if (c.job && c.job !== ctx.job) return false;
  if (c.wt && (!ctx.wt || c.wt !== ctx.wt)) return false;
  if (c.tokui && !ctx.tokui) return false;
  return true;
}
function addEff(V, e, ctx, sc) {
  if (!condOK(e.cond, ctx)) return;
  const v = (e.v || 0) * sc;
  switch (e.k) {
    case 'st': V[e.i] += v; break;
    case 'phys': if (ctx.type === 'phys') V[7] += v; break;
    case 'spell': if (ctx.type === 'spell') V[7] += v; break;
    case 'elem': if (ctx.el && ctx.el !== '無' && e.el === ctx.el && (!e.sub || (e.sub === '物理') === (ctx.type === 'phys'))) V[8] += v; break;
    case 'fam': if (ctx.fam && e.fam === ctx.fam) V[9] += v; break;
    case 'named': if (ctx.bossName && (ctx.bossName.includes(e.name) || e.name.includes(ctx.bossName))) V[9] += v; break;
    case 'crit': V[10] += v; break;
    case 'critdmg': V[11] += v; break;
    case 'boom': V[12] += v; break;
  }
}
function memVec(m, ctx, matched, rank) {
  const V = new Float64Array(NV), sc = RANKF[rank] || 1, cb = matched ? COLOR_BONUS : 1;
  for (let i = 0; i < 7; i++) V[i] = Math.round(m.st[i] * sc) * cb;
  for (const e of m.effs) addEff(V, e, ctx, sc);
  return V;
}
function eqVec(it, ctx, lv, totu) {
  const V = new Float64Array(NV), s = eqStats(it, lv, totu);
  for (let i = 0; i < 7; i++) V[i] = s.st[i];
  for (const e of s.effs) addEff(V, e, ctx, 1);
  return V;
}
function skillsOf(it, lv, totu) {
  const effs = it.kind === 'm' ? it.effs : eqStats(it, lv, totu).effs;
  return effs.filter(e => e.k === 'skill').map(e => e.skill);
}

function dmgParts(V, ctx) {
  const base = ctx.type === 'phys' ? ctx.baseAtk + V[1] : ctx.baseMatk + V[2];
  const mAll = 1 + V[7] / 100, mEl = 1 + V[8] / 100, mFam = 1 + V[9] / 100;
  let rate, crit;
  if (ctx.type === 'phys') { rate = Math.min(100, BASE_CRIT + V[10]); crit = 1 + rate / 100 * (CRIT_EXTRA + V[11] / 100); }
  else { rate = Math.min(100, V[12]); crit = 1 + rate / 100 * CRIT_EXTRA; }
  const total = base * mAll * mEl * mFam * ctx.weakMul * crit;
  return { base, mAll, mEl, mFam, weak: ctx.weakMul, crit, rate, total };
}

/* ---- 1人ぶんを探す ---- */
// opts: {job, cap, slots(colors), weapons:[{it,lv,t}|null], eqAvail: fn(kind)->[{it,lv,t}], memAvail:[{m,rank}], pins:{eq:{slot:{it,lv,t}}, mem:[ids]}, mode:'dmg'|'stat', weights, enemy, base, needSkills}
function searchChar(o) {
  const results = [];
  const wlist = o.fixWeapon ? [o.fixWeapon] : (o.weapons.length ? o.weapons : [null]);
  for (const W of wlist) {
    const wi = W && W.it;
    const ctx = {
      job: o.job, wt: wi ? wi.t : null, tokui: wi ? (TOKUI[o.job] || []).includes(wi.t) : false,
      type: weaponType(wi, W && W.lv), el: wi ? wi.el : '', fam: o.enemy.fam, bossName: o.enemy.name,
      baseAtk: o.base.atk, baseMatk: o.base.matk
    };
    ctx.weakMul = (ctx.el && ctx.el !== '無') ? (WEAKMUL[o.enemy.weak[ctx.el]] ?? 1) : 1;
    // スロット定義
    const kindOf = s => /^c\d$/.test(s) ? 'c' : s;
    const eqSlots = [...PARTS, ...Array.from({ length: ACC_SLOTS }, (_, i) => 'c' + i)];
    const cands = {};
    for (const s of eqSlots) {
      const k = kindOf(s);
      cands[s] = [null, ...o.eqAvail(k).map(x => ({ ...x, V: eqVec(x.it, ctx, x.lv, x.t), sk: skillsOf(x.it, x.lv, x.t) }))];
    }
    const WV = wi ? eqVec(wi, ctx, W.lv, W.t) : new Float64Array(NV);
    const Wsk = wi ? skillsOf(wi, W.lv, W.t) : [];
    const slots = o.slots;
    const memC = o.memAvail.map(x => ({ m: x.m, rank: x.rank, ct: x.m.ct, Vm: memVec(x.m, ctx, true, x.rank), Vp: memVec(x.m, ctx, false, x.rank), sk: skillsOf(x.m) }));
    const matchOf = (slot, m) => slot === '虹' || slot.includes(m.c);
    // state
    const st = { eq: {}, mem: new Array(slots.length).fill(null) };
    for (const s of eqSlots) st.eq[s] = null;
    const pinnedEq = {}, pinnedMem = new Set();
    if (o.pins) {
      for (const s of eqSlots) { const p = o.pins.eq[kindOf(s)]; if (p && (kindOf(s) !== 'c' || s === 'c0')) { const c = cands[s].find(x => x && x.it.id === p.it.id); if (c) { st.eq[s] = c; pinnedEq[s] = 1; } } }
      // memories: put pinned into best matching slots
      const pm = o.pins.mem.map(id => memC.find(x => x.m.id === id)).filter(Boolean);
      for (const x of pm) {
        let bi = -1;
        for (let i = 0; i < slots.length; i++) if (st.mem[i] === null && !pinnedMem.has(i) && (bi < 0 || (matchOf(slots[i], x.m) && !matchOf(slots[bi], x.m)))) bi = i;
        if (bi >= 0) { st.mem[bi] = x; pinnedMem.add(bi); }
      }
    }
    const costOf = () => st.mem.reduce((a, x) => a + (x ? x.ct : 0), 0);
    const total = () => {
      const V = new Float64Array(NV); V.set(WV);
      for (const s of eqSlots) { const x = st.eq[s]; if (x) for (let i = 0; i < NV; i++) V[i] += x.V[i]; }
      for (let j = 0; j < slots.length; j++) { const x = st.mem[j]; if (x) { const v = matchOf(slots[j], x.m) ? x.Vm : x.Vp; for (let i = 0; i < NV; i++) V[i] += v[i]; } }
      return V;
    };
    const skillPen = () => {
      if (!o.needSkills || !o.needSkills.length) return 1;
      const have = new Set(Wsk);
      for (const s of eqSlots) if (st.eq[s]) st.eq[s].sk.forEach(k => have.add(k));
      for (const x of st.mem) if (x) x.sk.forEach(k => have.add(k));
      let miss = 0; for (const k of o.needSkills) if (!have.has(k)) miss++;
      return Math.pow(0.01, miss);
    };
    const scoreV = V => o.mode === 'dmg' ? dmgParts(V, ctx).total : o.weights.reduce((a, w, i) => a + w * V[i], 0);
    const score = () => scoreV(total()) * skillPen();
    // equip uniqueness (accessory dup)
    const eqOK = (s, c) => { if (!c) return true; let used = 0; for (const t of eqSlots) if (t !== s && st.eq[t] && st.eq[t].it.id === c.it.id) used++; return used < c.n; };
    let best = score(), improved = true, iter = 0;
    while (improved && iter++ < 40) {
      improved = false;
      for (const s of eqSlots) {
        if (pinnedEq[s]) continue;
        const cur = st.eq[s]; let bestC = cur;
        for (const c of cands[s]) {
          if (c === cur || !eqOK(s, c)) continue;
          st.eq[s] = c; const sc = score();
          if (sc > best + 1e-9) { best = sc; bestC = c; improved = true; }
        }
        st.eq[s] = bestC;
      }
      // single memory moves
      for (let j = 0; j < slots.length; j++) {
        if (pinnedMem.has(j)) continue;
        const cur = st.mem[j]; let bestC = cur;
        const base = costOf() - (cur ? cur.ct : 0);
        for (const c of [null, ...memC]) {
          if (c === cur) continue;
          if (c && base + c.ct > o.cap) continue;
          if (c && st.mem.some((y, k) => k !== j && y && y.m.id === c.m.id)) continue;
          st.mem[j] = c; const sc = score();
          if (sc > best + 1e-9) { best = sc; bestC = c; improved = true; }
        }
        st.mem[j] = bestC;
      }
      if (!improved) {
        // pair memory moves
        for (let a = 0; a < slots.length && !improved; a++) for (let b = a + 1; b < slots.length && !improved; b++) {
          if (pinnedMem.has(a) || pinnedMem.has(b)) continue;
          const ca = st.mem[a], cb = st.mem[b];
          const base = costOf() - (ca ? ca.ct : 0) - (cb ? cb.ct : 0);
          let bp = null;
          const usedElse = new Set(st.mem.filter((y, k) => k !== a && k !== b && y).map(y => y.m.id));
          for (const x of memC) {
            if (base + x.ct > o.cap || usedElse.has(x.m.id)) continue;
            st.mem[a] = x;
            for (const y of memC) {
              if (y === x || usedElse.has(y.m.id) || base + x.ct + y.ct > o.cap) continue;
              st.mem[b] = y; const sc = score();
              if (sc > best + 1e-9) { best = sc; bp = [x, y]; }
            }
          }
          if (bp) { st.mem[a] = bp[0]; st.mem[b] = bp[1]; improved = true; } else { st.mem[a] = ca; st.mem[b] = cb; }
        }
      }
    }
    const V = total();
    results.push({
      W, ctx, eq: { ...st.eq }, mem: st.mem.map((x, j) => x ? { m: x.m, rank: x.rank, matched: matchOf(slots[j], x.m) } : null),
      slots, V, cost: costOf(), score: best, parts: o.mode === 'dmg' ? dmgParts(V, ctx) : null, skillOK: skillPen() === 1
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
