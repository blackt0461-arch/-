// 「だれの通過か」を決めるしくみの計算上の試験。
// 集団で滑る選手（服の色は実際の動画で測った似かたに合わせる）の通過を作り、今までの方式と新しい方式を比べる。
import { LiveId } from '../liveid.js';
const NH = 31, NB = 93;
let seed = 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
const U = (a, b) => a + (b - a) * rnd();
const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
const sim3 = (a, b) => { let s = 0; for (let i = 0; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s / 3; };
const simHead = (a, b) => { let s = 0; for (let i = NH * 2; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s; };
// ---- 色の作り方 ----
const sparse = k => { const h = new Float32Array(NH); let s = 0; for (let i = 0; i < k; i++) { const w = rnd() + 0.2; h[Math.floor(rnd() * NH)] += w; s += w; } for (let i = 0; i < NH; i++) h[i] /= s; return h; };
const mix = (a, b, w) => a.map((v, i) => v * (1 - w) + b[i] * w);
export const CP = process.env.CP ? JSON.parse(process.env.CP) : { own: [0, 0.62], noise: [0.02, 0.21], pw: 4.5 };
function makeTeam() { const team = [sparse(3), sparse(3), sparse(3)]; return () => { const w = CP.own[0] + (CP.own[1] - CP.own[0]) * Math.pow(rnd(), CP.pw || 2); return team.map(t => mix(t, sparse(3), w)); }; }
function observe(base) { const h = new Float32Array(NB), nz = U(...CP.noise); base.forEach((p, k) => { const o = mix(p, sparse(4), nz * U(0.7, 1.3)); h.set(o, k * NH); }); return h; }
// ---- 場面を作る ----
function scene({ packs = [5], laps = 14, rotate = 0.15, det = [0.93, 0.7], base = 10 }) {
  const mk = makeTeam(), sk = [], ev = [];
  packs.forEach((n, pi) => {
    const ids = []; for (let i = 0; i < n; i++) { ids.push(sk.length); sk.push({ base: mk(), pack: pi }); }
    let order = ids.slice(), t = 5 + pi * (base * U(0.3, 0.7)), pace = base + pi * U(0.4, 1.2);
    const gaps = order.map(() => U(0.35, 0.75));
    for (let k = 0; k <= laps; k++) {
      let off = 0;
      order.forEach((id, r) => { if (r) off += gaps[r] + gauss() * 0.04; const sp = r ? gaps[r] : 9;
        ev.push({ t: t + off + gauss() * 0.03, who: id, seen: rnd() < (sp >= 0.45 ? det[0] : det[1]) }); });
      pace += gauss() * 0.08; t += pace + gauss() * 0.15;
      if (rnd() < rotate) order.push(order.shift()); // 先頭が後ろへ下がる
    }
  });
  ev.sort((a, b) => a.t - b.t);
  let tr = 1; for (const e of ev) { e.h = observe(sk[e.who].base); e.track = tr++; }
  return { sk, ev };
}
// ---- 今までの方式（app.js の onLiveCross と同じ決め方） ----
function oldAlgo(ev, minLap) {
  const P = [], laps = q => { const o = []; for (const c of q.cs) if (!o.length || c.t - o[o.length - 1] >= minLap) o.push(c.t); return o.slice(1).map((x, i) => x - o[i]); };
  const typical = () => { const a = P.flatMap(laps); return a.length ? median(a) : 0; };
  for (const c of ev) {
    const typ = typical(); let best = null, bv = 0;
    for (const q of P) {
      const gap = c.t - q.cs[q.cs.length - 1].t; if (gap < Math.max(3, minLap * 0.6)) continue;
      const qh = q.hist.map(v => v / q.hn), s = sim3(c.h, qh), hd = simHead(c.h, qh), ql = laps(q), exp = ql.length ? median(ql.slice(-3)) : typ;
      let te = 1; if (exp > 0) { const k = Math.max(1, Math.min(3, Math.round(gap / exp))); te = Math.abs(gap - k * exp) / exp + (k - 1) * 0.12; }
      if (!(s > 0.95 && hd >= 0.92) && !(te < 0.2 && s > 0.82)) continue;
      const sc = s - Math.min(te, 1) * 0.35; if (!best || sc > bv) { bv = sc; best = q; }
    }
    if (!best) { best = { cs: [], hist: new Float32Array(NB), hn: 0 }; P.push(best); }
    best.cs.push(c); for (let i = 0; i < NB; i++) best.hist[i] += c.h[i]; best.hn++;
  }
  return P;
}
function newAlgo(ev, minLap, opt = {}) {
  const laps = q => { const o = []; for (const c of q.cs) if (!o.length || c.t - o[o.length - 1] >= minLap) o.push(c.t); return o.slice(1).map((x, i) => x - o[i]); };
  const id = new LiveId({ minLap, lapsOf: laps, typical: () => { const a = id.persons.flatMap(laps); return a.length ? median(a) : 0; }, ...opt });
  for (const c of ev) id.add({ t: c.t, h: c.h, track: c.track, src: c });
  return id.persons.map(p => ({ cs: p.cs.map(x => x.src) }));
}
// ---- 採点 ----
function grade(sc, P, minLap) {
  const seen = sc.ev.filter(e => e.seen), own = new Map(); P.forEach((p, i) => p.cs.forEach(c => own.set(c, i)));
  // 正しいラップ：同じ選手の続いた2回の通過が、どちらも見えていた
  let trueLaps = 0, got = 0, wrong = 0, made = 0;
  const bySk = new Map(); for (const e of sc.ev) { if (!bySk.has(e.who)) bySk.set(e.who, []); bySk.get(e.who).push(e); }
  const next = new Map(); for (const l of bySk.values()) for (let i = 1; i < l.length; i++) next.set(l[i - 1], l[i]);
  const pn = new Map(); for (const p of P) { const cs = p.cs.slice().sort((a, b) => a.t - b.t); for (let i = 1; i < cs.length; i++) { pn.set(cs[i - 1], cs[i]); made++; const a = cs[i - 1], b = cs[i];
    // 出したラップが正しいか：同じ選手で、間に見のがしが無い（見のがしをはさんだ2周分は「まちがい」に数えない）
    if (a.who !== b.who) wrong++; } }
  for (const e of seen) { const n = next.get(e); if (n && n.seen) { trueLaps++; if (pn.get(e) === n) got++; } }
  return { trueLaps, got, wrong, made, persons: P.length, skaters: sc.sk.length };
}
const SC = {
  '5人の集団': { packs: [5] }, '8人の集団': { packs: [8] }, '2つの集団(5+4)': { packs: [5, 4] }, '3つの集団(4+4+3)': { packs: [4, 4, 3] },
  '8人・入れかわり多め': { packs: [8], rotate: 0.4 }, '6人・見のがし多め': { packs: [6], det: [0.85, 0.5] }, '1人ずつ(間かく広い)3人': { packs: [1, 1, 1] },
};
if (process.argv[2] === 'dbg') {
  seed = +(process.argv[4] || 1) * 7919; const sc = scene(SC[process.argv[3]]), ev = sc.ev.filter(e => e.seen), P = newAlgo(ev, 6);
  const own = new Map(); P.forEach((p, i) => p.cs.forEach(c => own.set(c, i)));
  console.log(sc.ev.map(e => `${e.t.toFixed(1)}:${e.who}${e.seen ? '→' + String.fromCharCode(97 + own.get(e)) : 'x'}`).join(' '));
} else if (process.argv[2] === 'cal') {
  const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return +b[Math.floor((b.length - 1) * p)].toFixed(3); };
  const same = [], diff = []; for (let k = 0; k < 300; k++) { const mk = makeTeam(), a = mk(), b = mk(); same.push(sim3(observe(a), observe(a))); diff.push(sim3(observe(a), observe(b))); }
  for (const [n, a] of [['同じ人', same], ['別の人', diff]]) console.log(n, 'p10', q(a, .1), 'p25', q(a, .25), 'p50', q(a, .5), 'p75', q(a, .75), 'p90', q(a, .9));
  console.log('目標 同じ人 p10 .866 p50 .911 p90 .959 ／ 別の人 p10 .682 p50 .856 p90 .956');
} else {
  const N = +(process.argv[2] || 60), opt = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  for (const [name, cfg] of Object.entries(SC)) {
    const tot = { old: { trueLaps: 0, got: 0, wrong: 0, made: 0, persons: 0, skaters: 0 }, neu: { trueLaps: 0, got: 0, wrong: 0, made: 0, persons: 0, skaters: 0 } };
    for (let s = 1; s <= N; s++) { seed = s * 7919; const sc = scene(cfg), ev = sc.ev.filter(e => e.seen);
      const a = grade(sc, oldAlgo(ev, 6), 6), b = grade(sc, newAlgo(ev, 6, opt), 6);
      for (const k in a) { tot.old[k] += a[k]; tot.neu[k] += b[k]; } }
    const f = r => `正しく出せたラップ ${(r.got / r.trueLaps * 100).toFixed(1)}%・別人まじりのラップ ${(r.wrong / r.made * 100).toFixed(1)}%・人数 ${(r.persons / N).toFixed(1)}（本当は ${(r.skaters / N).toFixed(0)}）`;
    console.log(name + '\n  今まで：' + f(tot.old) + '\n  新しい：' + f(tot.neu));
  }
}
