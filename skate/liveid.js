// LAPS：その場で測る時の「だれの通過か」を決めるしくみ（画面や映像にはふれない。計算だけ）
//
// 考え方（2026-11-13）：
// 実際の練習動画で測ると、同じチームの別の選手どうしは服の色だけではほとんど見分けられない
// （別の人どうしの似ている度の中央が 0.86、同じ人どうしが 0.91 で、大きく重なる）。
// そこで、色は「明らかにちがう人を外す」ために使い、決め手は
//   ・その人が「そろそろ来る時刻」にどれだけ合っているか（秒で比べる）
//   ・集団で続けて通った人たちは、まとめて一番つじつまの合う組み合わせにする
//     （1人ずつ早い者勝ちで決めると、前の人が後ろの人の席を取ってしまうため）
// にする。集団に次の人が来るたびに、その集団の分だけ決め直す。
const NH = 31, NB = NH * 3;
const sim3 = (a, b) => { let s = 0; for (let i = 0; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s / 3; };
const simHead = (a, b) => { let s = 0; for (let i = NH * 2; i < NB; i++) s += Math.sqrt(a[i] * b[i]); return s; };
const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

export const DEF = {
  join: 1.3,     // これより短い間かくで続いた通過は、同じ集団としてまとめて決める（秒）
  span: 7,       // 1つの集団として決め直す長さの上限（秒）
  maxGroup: 8,   // まとめて決め直す通過の数の上限
  sig1: 0.35, rel1: 0.04,   // 1回目：予想とのずれの「ふつうの大きさ」（秒 と 1周に対する割合の大きい方）
  sig2: 0.2, rel2: 0.02,    // 2回目：集団全体のずれ（みんなが同じだけ速い・遅い）を引いたあと
  relNew: 0.12,  // その人自身のラップがまだ無い時（みんなの1周から予想する時）のずれの見こみ
  skip: 1.2,     // 1周とばし（見のがし）を仮定するごとの不利
  packLen: 3, rot: 2,  // 先頭交代で入れかわれる長さ（秒）と、その時の不利
  accept: -3,    // これより点が低い組み合わせは「新しい人」とする
  minGap: 3,     // 同じ人が続けて通れる最短の間かく（秒）
};

// 色の点：同じ人らしさ（明らかにちがう時は大きくマイナス、よく似ていても少しプラスまで）
export function colourScore(s) {
  const zs = Math.min(0, s - 0.915) / 0.035, zd = (s - 0.85) / 0.09;
  // たまたま色が合わないコマもあるので、「まあ似ている」より上なら、時刻がぴったりの時に救えるくらいの減点で止める
  return Math.max(s >= 0.72 ? -2.6 : -6, Math.min(1.5, 0.94 - zs * zs / 2 + zd * zd / 2));
}

export class LiveId {
  // o.lapsOf(person)：その人のこれまでのラップ（秒の並び）。o.typical()：みんなのふつうの1周
  // o.minLap：1周の最短。o.newPerson(crossing)：新しい人を作る。o.busy(person, crossing)：いま別の所に写っている人なら true
  constructor(o = {}) { this.o = Object.assign({}, DEF, o); this.persons = []; this.all = []; }

  // その人の「次に来るまでの予想」。own：その人自身のラップから出したか（みんなの平均からの時は、ずれを大きめに見る）
  expOf(q) {
    const typ = this.typ();
    // 見のがしをはさんだ「2周分」のラップは、周の数で割ってから使う（そのまま使うと、次の予想が2倍になってしまう）
    const l = (this.o.lapsOf ? this.o.lapsOf(q) : []).map(x => typ > 0 ? x / Math.max(1, Math.round(x / typ)) : x);
    return l.length ? { exp: median(l.slice(-3)), own: true } : { exp: typ, own: false };
  }

  // みんなのふつうの1周。出ているラップから求めるが、通過の間かくで見ると「その半分（3分の1）」が1周らしい時は、そちらを使う
  // （1周おきに別の人として数えてしまい、2周分を1周と思いこむのを防ぐ）
  typ() {
    if (this._typ != null) return this._typ;
    const T = (this.o.typical && this.o.typical()) || 0, g = this.guessLap(); let r = T || g;
    if (T > 0 && g > 0) for (const k of [2, 3]) if (Math.abs(g - T / k) < 0.15 * T / k) r = g;
    return this._typ = r;
  }

  // まだだれのラップも分からない時：通過どうしの間かくで、いちばん多い長さを「1周」とみなす。
  // （集団なら、1回目に通った人たちと2回目に通った人たちの間かくが、どれも1周の近くに集まる）
  guessLap() {
    const o = this.o, lo = Math.max(o.minLap || 0, 4), hi = 45, bw = 0.5, n = Math.ceil((hi - lo) / bw), bins = new Float32Array(n + 1);
    const a = this.all.slice(-60);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const g = a[j].t - a[i].t; if (g < lo || g >= hi) continue;
      const s = a[i].h && a[j].h ? sim3(a[i].h, a[j].h) : 0.9; if (s < 0.8) continue; // 明らかに別の人どうしは数えない
      const x = (g - lo) / bw, k = Math.floor(x), f = x - k; bins[k] += 1 - f; bins[k + 1] += f;
    }
    let best = -1, bv = 0;
    for (let k = 0; k < n; k++) { const v = bins[k] + (k ? bins[k - 1] : 0) * 0.5 + bins[k + 1] * 0.5; if (v > bv * 1.15) { bv = v; best = k; } } // 同じくらいなら短い方（2周分より1周分）
    if (best < 0 || bv < 2) return 0;
    let sw = 0, sx = 0; for (let k = Math.max(0, best - 1); k <= best + 1; k++) { sw += bins[k]; sx += bins[k] * (lo + k * bw); }
    return sw ? sx / sw : 0;
  }

  // 通過 c（c.t, c.h：色, c.track）を足す。集団の分を決め直し、持ち主が変わった通過があれば changed に入れて返す
  add(c) {
    const o = this.o;
    // 計算用の印（持ち主・色）は、記録を保存する時に一緒に書き出されないようにしておく
    Object.defineProperties(c, { p: { value: null, writable: true, enumerable: false, configurable: true }, h: { value: c.h || null, writable: true, enumerable: false, configurable: true }, fixed: { value: false, writable: true, enumerable: false, configurable: true } });
    this.all.push(c); this._typ = null; if (this.all.length > 400) this.all.splice(0, 200);
    // 同じ追跡の人がもう一度通った時（行って戻った等）は、そのまま同じ人
    const prev = c.track != null ? this.all.find(x => x !== c && x.track === c.track && x.p) : null;
    if (prev) { c.p = prev.p; c.fixed = true; prev.p.cs.push(c); this._hist(prev.p); return { person: prev.p, changed: [] }; }
    // 決め直す集団：直前から間かくが join 以内で続いている通過
    const G = [c];
    for (let i = this.all.length - 2; i >= 0 && G.length < o.maxGroup; i--) {
      const x = this.all[i];
      if (G[0].t - x.t > o.join || c.t - x.t > o.span) break;
      if (x.fixed || !x.p) continue;
      G.unshift(x);
    }
    const before = new Map(G.map(x => [x, x.p || null]));
    // 集団の通過をいったん持ち主から外す
    for (const x of G) if (x.p) { x.p.cs = x.p.cs.filter(y => y !== x); x.p = null; }
    const pool = this.persons.filter(q => q.cs.length); // 集団の外に通過が残っている人
    const asg = this._solve(G, pool);
    const changed = [];
    G.forEach((x, i) => {
      let q = asg[i];
      if (!q) { const b = before.get(x); q = b && !b.cs.length && !asg.includes(b) ? b : null; } // 前に作った「新しい人」はそのまま使う
      if (!q && o.claim) { const e = o.claim(x); if (e && !asg.includes(e) && e.cs.length && x.t - e.cs[e.cs.length - 1].t >= Math.max(o.minGap, (o.minLap || 0) * 0.6)) q = e; } // 登録した部員の色に合う人
      if (!q) { q = o.newPerson ? o.newPerson(x) : { id: 'p' + this.persons.length, cs: [] }; q.cs = q.cs || []; this.persons.push(q); }
      asg[i] = q; x.p = q; q.cs.push(x);
      if (before.get(x) && before.get(x) !== q) changed.push(x);
    });
    for (const q of new Set([...asg, ...before.values()])) if (q) { q.cs.sort((a, b) => a.t - b.t); this._hist(q); }
    // 通過が1つも無くなった人は消す
    this.persons = this.persons.filter(q => q.cs.length);
    changed.push(...this._adopt(c.t));
    return { person: c.p, changed };
  }

  // あとからつなぎ直す：
  // ・練習の始めは1周の長さがまだ分からず、1周目と2周目が別の人として出てしまう
  // ・色がたまたま合わなかった時に、同じ人が途中から別の人として出てしまう
  // 「しばらく通っていない人 a」と「a の最後のちょうど1周（か2〜3周）あとに現れた人 b」を1人にまとめる。
  _adopt(now) {
    this._typ = null; const out = [], typ = this.typ(); if (!(typ > 0)) return out;
    const mean = q => { const h = new Float32Array(NB); if (q.hn) for (let i = 0; i < NB; i++) h[i] = q.hist[i] / q.hn; return h; };
    const old = this.persons.filter(a => a.cs.length && now - a.cs[a.cs.length - 1].t > typ * 1.3);
    if (!old.length) return out;
    const cands = [];
    for (const b of this.persons) {
      if (!b.cs.length) continue; const first = b.cs[0], x = { t: first.t, h: b.hn ? mean(b) : first.h };
      for (const a of old) { if (a === b || a.cs[a.cs.length - 1].t >= first.t) continue;
        const { exp, own } = this.expOf(a);
        const r = this._pair(x, { q: a, last: a.cs[a.cs.length - 1].t, exp, own, h: mean(a) }, 0, this.o.sig1, this.o.rel1);
        if (r && r.k >= 1 && r.v > this.o.accept) cands.push([r.v, a, b]); }
    }
    cands.sort((p, q) => q[0] - p[0]); const used = new Set();
    for (const [, a, b] of cands) {
      if (used.has(a) || used.has(b) || !a.cs.length || !b.cs.length) continue; used.add(a); used.add(b);
      // 古い方（a）を残す：名前やカードの並びが変わらないように
      for (const x of b.cs) { x.p = a; out.push(x); } a.cs.push(...b.cs); b.cs = []; this._hist(a);
      if (this.o.merged) this.o.merged(b, a);
    }
    this.persons = this.persons.filter(q => q.cs.length);
    return out;
  }

  _hist(q) { if (!q.cs.length) return; const h = new Float32Array(NB); let n = 0; for (const x of q.cs) if (x.h) { for (let i = 0; i < NB; i++) h[i] += x.h[i]; n++; } q.hist = h; q.hn = n; }

  // 通過 x が、人 f.q の次の通過である「らしさ」の点（高いほど同じ人らしい）。組めない時は null
  _pair(x, f, shift, sg, rel) {
    const o = this.o, minGap = Math.max(o.minGap, (o.minLap || 0) * 0.6);
    const gap = x.t - f.last; if (gap < minGap) return null;
    if (o.busy && o.busy(f.q, x)) return null;
    const s = x.h && f.q.hn ? sim3(x.h, f.h) : 0.9, hd = x.h && f.q.hn ? simHead(x.h, f.h) : 0.9;
    const k = f.exp > 0 ? Math.round(gap / f.exp) : 0;
    if (k >= 1 && k <= 3) {
      const e = gap - k * f.exp - (k === 1 ? shift : 0), sd = Math.max(sg, (f.own ? rel : o.relNew) * f.exp) * Math.sqrt(k);
      let tl = -(e / sd) * (e / sd) / 2;
      // 先頭交代：集団の中で前後に入れかわると、集団の長さぶんまで予想からずれる。ほかに合う人がいない時に選べるよう、弱い点を残す
      if (Math.abs(e) < o.packLen) tl = Math.max(tl, -o.rot - Math.abs(e) / o.packLen);
      tl -= (k - 1) * o.skip;
      if (tl > -8) return { v: colourScore(s) + tl, e: gap - k * f.exp, k };
    }
    // 時刻では決められない（久しぶりに来た・まだ1周の長さが分からない）：色がとてもよく似ている時だけ
    if (s > 0.95 && hd >= 0.92) return { v: colourScore(s) - 2.5, e: 0, k: 0 };
    return null;
  }

  // 集団 G（時刻順）を pool の人へ割り当てる。返り値は G と同じ長さの配列（人 か null＝新しい人）
  _solve(G, pool) {
    const o = this.o;
    const info = pool.map(q => { const last = q.cs[q.cs.length - 1].t, { exp, own } = this.expOf(q), h = new Float32Array(NB); if (q.hn) for (let i = 0; i < NB; i++) h[i] = q.hist[i] / q.hn; return { q, last, exp, own, h }; });
    const pair = (x, f, shift, sg, rel) => this._pair(x, f, shift, sg, rel);
    const run = (shift, sg, rel) => {
      const cand = G.map(x => info.map((f, j) => { const r = pair(x, f, shift, sg, rel); return r && r.v > o.accept ? { j, ...r } : null; }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 6));
      // 残りで取れる点の上限（枝刈り用）
      const rest = new Array(G.length + 1).fill(0);
      for (let i = G.length - 1; i >= 0; i--) rest[i] = rest[i + 1] + Math.max(0, cand[i].length ? cand[i][0].v - o.accept : 0);
      let best = -Infinity, bestA = null; const used = new Set(), cur = new Array(G.length).fill(null);
      const go = (i, sc) => {
        if (sc + rest[i] <= best) return;
        if (i === G.length) { best = sc; bestA = cur.slice(); return; }
        for (const c of cand[i]) { if (used.has(c.j)) continue; used.add(c.j); cur[i] = c; go(i + 1, sc + c.v - o.accept); used.delete(c.j); }
        cur[i] = null; go(i + 1, sc);
      };
      go(0, 0);
      return bestA || cur;
    };
    let A = run(0, o.sig1, o.rel1);
    // 集団全体のずれ（みんな同じだけ速い・遅い）を引いて、もう一度細かく決める
    const es = A.filter(a => a && a.k === 1).map(a => a.e);
    if (G.length >= 2 && es.length >= 2) A = run(median(es), o.sig2, o.rel2);
    return A.map(a => a ? info[a.j].q : null);
  }
}
