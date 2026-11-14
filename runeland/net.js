// ルーンランド：部屋のつながり（Supabase Realtime の Broadcast と Presence。DB には何も保存しない）
// 部屋でいちばん早く入った人が「親」。親が結果を計算して全員に配る。親がぬけたら次の人が引きつぐ。
import * as G from './game.js';
import { aiPlan, BOT_NAMES, LEVELS, BOT_AV } from './ai.js';
import { AV_KEYS } from './icons.js';

export const MAX_PLAYERS = 16;
export const REVEAL_MS = 4000;
// サイコロのとりあいを見せる時間（大きい3か所ぶん。画面の duelMs と同じ計算）
function duelBudget(L) {
  const sizes = (L.dice || []).map(([i, ds]) => { const f = (L.fights || []).find(x => x.i === i); return ds.length + (f && ((f.o >= 0 && !ds.some(([p]) => p === f.o)) || (f.o < 0 && f.d > 0)) ? 1 : 0); });
  return sizes.sort((a, b) => b - a).slice(0, 3).reduce((t, n) => t + 500 + n * 700 + 1300, 0);
}
// 落城と天災（亡霊のしわざ・予告なし）を見せる時間
const BIG = ['raid', 'wave', 'meteor', 'volcano', 'tornado'];
function evBudget(L) { return (L.fallen || []).length * 2200 + (L.ghosts || []).reduce((t, g) => t + 1400 + (BIG.includes(g.k) ? 1500 : 0), 0) + (L.event && BIG.includes(L.event.k) && L.event.k !== 'raid' ? 1500 : 0); }
const chan = code => 'runeland-' + String(code).replace(/[^0-9]/g, '').slice(0, 6);

export class Room {
  // opts: { code, id, name, sb（Supabase のクライアント）, onChange(room), onStatus(text), now() }
  constructor(opts) {
    Object.assign(this, { code: opts.code, id: opts.id, name: opts.name, av: opts.av || '', sb: opts.sb });
    this.onChange = opts.onChange || (() => {}); this.onStatus = opts.onStatus || (() => {});
    this.now = opts.now || (() => Date.now());
    this.state = null;          // ゲームの状態（だれも持っていなければ null＝待合室）
    this.lobby = { rounds: 18, bots: [], cardSec: 10, planSec: 35 };
    this.deadline = 0;          // 自分の時計での、いまの区切りの終わり
    this.plans = {};            // 親だけ：ラウンド → { id: plan }
    this.got = [];              // このラウンドに作戦を出した人
    this.myPlan = null;         // 自分が出した作戦 { round, plan }
    this.members = [];
    this.joinedAt = this.now();
    this.ok = false; this.lastHost = null; this.timer = null; this.countT = 0;
  }
  async connect() {
    const ch = this.ch = this.sb.channel(chan(this.code), { config: { broadcast: { self: false, ack: false }, presence: { key: this.id } } });
    ch.on('presence', { event: 'sync' }, () => this.syncMembers());
    ch.on('broadcast', { event: 'state' }, ({ payload }) => this.gotState(payload));
    ch.on('broadcast', { event: 'hello' }, () => { if (this.isHost()) this.broadcast(); });
    ch.on('broadcast', { event: 'plan' }, ({ payload }) => this.gotPlan(payload));
    ch.on('broadcast', { event: 'pick' }, ({ payload }) => this.gotPick(payload));
    ch.on('broadcast', { event: 'got' }, ({ payload }) => { if (this.state && payload.round === this.state.round) { this.got = payload.ids; this.onChange(this); } });
    ch.on('broadcast', { event: 'lobby' }, ({ payload }) => { if (!this.state || this.state.phase === 'end') { this.lobby = payload; this.onChange(this); } });
    await new Promise(res => ch.subscribe(async st => {
      const was = this.ok; this.ok = st === 'SUBSCRIBED';
      this.onStatus(this.ok ? '' : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? 'つなぎ直しています…' : 'つないでいます…');
      if (this.ok) {
        await ch.track({ id: this.id, name: this.name, av: this.av, at: this.joinedAt });
        if (!was) this.send('hello', {});
        res();
      }
    }));
    this.timer = setInterval(() => this.tick(), 200);
    this.helloT = setInterval(() => { if (!this.state && !this.isHost()) this.send('hello', {}); }, 4000);
  }
  leave() { clearInterval(this.timer); clearInterval(this.helloT); try { this.ch.untrack(); this.sb.removeChannel(this.ch); } catch {} }
  send(event, payload) { if (this.ok) this.ch.send({ type: 'broadcast', event, payload }).catch(() => {}); }

  syncMembers() {
    const ps = this.ch.presenceState(), seen = new Map();
    for (const k in ps) for (const m of ps[k]) if (m.id && (!seen.has(m.id) || seen.get(m.id).at > m.at)) seen.set(m.id, { id: m.id, name: String(m.name || '').slice(0, 12), av: AV_KEYS.includes(m.av) ? m.av : '', at: +m.at || 0 });
    this.members = [...seen.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const h = this.hostId();
    if (h !== this.lastHost) {
      const before = this.lastHost; this.lastHost = h;
      if (h === this.id && before !== null && this.state) {
        // 親を引きつぐ：残り時間は少しのばす
        this.state.hostId = this.id;
        if (this.state.phase === 'plan') this.deadline = Math.max(this.deadline, this.now() + 12000);
        this.broadcast();
      } else if (h !== this.id) this.resendPlan();
    }
    this.onChange(this);
  }
  hostId() {
    const ids = this.members.map(m => m.id);
    if (this.state && this.state.hostId && ids.includes(this.state.hostId)) return this.state.hostId;
    return ids[0] || this.id;
  }
  isHost() { return this.hostId() === this.id; }
  online(id) { return id.startsWith('cpu-') || this.members.some(m => m.id === id); }
  meIndex() { return this.state ? this.state.players.findIndex(p => p.id === this.id) : -1; }
  remain() { return Math.max(0, this.deadline - this.now()); }

  gotState(p) {
    if (p.s && p.s.reset) { this.state = null; this.myPlan = null; this.onChange(this); return; } // 待合室にもどる
    const s = G.unpack(p.s);
    if (this.state && s.gid === this.state.gid && s.seq < this.state.seq) return; // 古い知らせ
    const newRound = !this.state || s.gid !== this.state.gid || s.round !== this.state.round || s.step !== this.state.step;
    this.state = s; this.deadline = this.now() + p.remain;
    if (newRound) this.got = p.got || [];
    if (s.step === 'plan' && this.myPlan && this.myPlan.round === s.round && !(p.got || []).includes(this.id)) this.resendPlan();
    this.onChange(this);
  }
  broadcast() {
    if (!this.state) { this.send('lobby', this.lobby); return; }
    this.state.seq = (this.state.seq || 0) + 1;
    this.send('state', { s: G.pack(this.state), remain: this.remain(), got: this.got });
    this.onChange(this);
  }

  // ---- 遊ぶ人の操作 ----
  submit(plan) {
    if (!this.state || this.state.phase !== 'plan' || this.state.step !== 'plan') return;
    this.myPlan = { round: this.state.round, plan };
    if (this.isHost()) this.gotPlan({ id: this.id, round: this.state.round, plan });
    else this.send('plan', { id: this.id, round: this.state.round, plan });
    if (!this.got.includes(this.id)) this.got = [...this.got, this.id];
    this.onChange(this);
  }
  // カードを選ぶ時間：決めたことだけ知らせる（カードの中身は、兵を置いたあとの作戦といっしょに送る）
  submitCard() {
    if (!this.state || this.state.phase !== 'plan' || this.state.step !== 'card') return;
    const msg = { id: this.id, round: this.state.round };
    if (this.isHost()) this.gotPick(msg); else this.send('pick', msg);
    if (!this.got.includes(this.id)) this.got = [...this.got, this.id];
    this.onChange(this);
  }
  gotPick(p) {
    if (!this.isHost() || !this.state || this.state.step !== 'card' || p.round !== this.state.round) return;
    if (!this.got.includes(p.id)) this.got = [...this.got, p.id];
    if (!this.countT) this.countT = setTimeout(() => { this.countT = 0; if (this.state) this.send('got', { round: this.state.round, ids: this.got }); }, 300);
    this.onChange(this);
  }
  resendPlan() {
    if (this.myPlan && this.state && this.myPlan.round === this.state.round && this.state.step === 'plan') this.send('plan', { id: this.id, round: this.state.round, plan: this.myPlan.plan });
  }
  addBot(level) {
    if (!this.isHost()) return;
    const bots = this.lobby.bots || [];
    if (this.members.length + bots.length >= MAX_PLAYERS) return;
    const used = new Set(bots.map(b => b.name));
    const nm = BOT_NAMES.find(n => !used.has(n)) || 'CPU';
    this.lobby = { ...this.lobby, bots: [...bots, { id: 'cpu-' + Math.random().toString(36).slice(2, 8), name: nm, bot: level, av: BOT_AV[nm] || 'slime' }] };
    this.send('lobby', this.lobby); this.onChange(this);
  }
  removeBot(id) { if (!this.isHost()) return; this.lobby = { ...this.lobby, bots: (this.lobby.bots || []).filter(b => b.id !== id) }; this.send('lobby', this.lobby); this.onChange(this); }
  setTimes(cardSec, planSec) { if (this.isHost()) { this.lobby = { ...this.lobby, cardSec, planSec }; this.send('lobby', this.lobby); this.onChange(this); } }
  setRounds(n) { if (this.isHost()) { this.lobby = { ...this.lobby, rounds: n }; this.send('lobby', this.lobby); this.onChange(this); } }
  start() {
    if (!this.isHost()) return;
    const humans = this.members.slice(0, MAX_PLAYERS).map(m => ({ id: m.id, name: m.name, av: m.av }));
    const ps = [...humans, ...(this.lobby.bots || []).slice(0, MAX_PLAYERS - humans.length)];
    if (ps.length < 1) return;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    this.state = G.newGame({ seed, players: ps, rounds: this.lobby.rounds, planMs: (this.lobby.planSec || 35) * 1000 });
    const cardMs = (this.lobby.cardSec ?? 10) * 1000;
    Object.assign(this.state, { gid: seed.toString(36), hostId: this.id, step: cardMs ? 'card' : 'plan', cardMs, seq: 0 });
    this.plans = {}; this.got = []; this.myPlan = null;
    this.deadline = this.now() + (cardMs || this.state.planMs);
    this.broadcast();
  }
  backToLobby() { if (this.isHost()) { this.state = null; this.myPlan = null; this.broadcastLobbyReset(); } }
  broadcastLobbyReset() { this.send('state', { s: { reset: true }, remain: 0 }); this.send('lobby', this.lobby); this.onChange(this); }

  // ---- 親の仕事 ----
  gotPlan(p) {
    if (!this.isHost() || !this.state || p.round !== this.state.round) return;
    (this.plans[p.round] ||= {})[p.id] = p.plan;
    if (!this.got.includes(p.id)) this.got = [...this.got, p.id];
    // 「だれが決定したか」はまとめて知らせる（短い間に何度も送らない）
    if (!this.countT) this.countT = setTimeout(() => { this.countT = 0; if (this.state) this.send('got', { round: this.state.round, ids: this.got }); }, 300);
    this.onChange(this);
  }
  tick() {
    if (!this.isHost() || !this.state || this.state.phase === 'end') return;
    const st = this.state;
    if (st.step === 'card') { // カードを選ぶ時間：全員が決めたか、時間が来たら、兵を置く時間へ
      const humans = st.players.filter(p => !p.bot && !p.out && this.online(p.id));
      if (this.now() >= this.deadline || (humans.length && humans.every(p => this.got.includes(p.id)))) { st.step = 'plan'; this.got = []; this.deadline = this.now() + st.planMs; this.broadcast(); }
      return;
    }
    if (st.step === 'plan') {
      // コンピューターは、ラウンドが始まって少したってから作戦を出す（人っぽく）
      const t = this.now();
      st.players.forEach((p, pi) => {
        if (!p.bot || this.got.includes(p.id)) return;
        const key = st.round + ':' + p.id;
        this.botAt ||= {};
        if (!this.botAt[key]) this.botAt[key] = t + 2500 + Math.random() * 6000;
        if (t >= this.botAt[key]) this.gotPlan({ id: p.id, round: st.round, plan: aiPlan(st, pi, p.bot) });
      });
      const active = st.players.filter(p => this.online(p.id));
      const all = active.some(p => !p.bot) && active.every(p => this.got.includes(p.id));
      if (this.now() >= this.deadline || all) this.resolveRound();
    } else if (st.step === 'reveal' && this.now() >= this.deadline) this.nextRound();
  }
  resolveRound() {
    const st = this.state, mine = this.plans[st.round] || {}, plans = {};
    st.players.forEach((p, pi) => { if (mine[p.id]) plans[pi] = mine[p.id]; });
    const ns = G.resolve(st, plans);
    Object.assign(ns, { gid: st.gid, hostId: this.id, seq: st.seq, step: ns.phase === 'end' ? 'end' : 'reveal' });
    this.state = ns; delete this.plans[st.round];
    // 結果を見せる時間：起きたことが多いほど少し長く（4〜12秒）
    const L = ns.last; this.deadline = this.now() + Math.min(30000, Math.max(REVEAL_MS, 5500 + L.log.length * 650 + L.log.filter(l => l.card === 'dragon' || l.card === 'wrath').length * 1500 + ((L.fights || []).some(f => f.w >= 0) ? 1700 : 0) + (L.event && L.event.k === 'raid' ? 1500 : 0) + L.changed.length * 60 + duelBudget(L) + Math.min(4, L.opened.length) * 800 + (L.event ? 1400 : 0) + evBudget(L)));
    this.got = [];
    this.broadcast();
  }
  nextRound() {
    const st = this.state;
    // 途中から入った人を足す
    for (const m of this.members) if (!st.players.some(p => p.id === m.id) && st.players.length < MAX_PLAYERS + 4) G.addLatePlayer(st, m);
    st.step = st.cardMs ? 'card' : 'plan'; this.got = [];
    this.deadline = this.now() + (st.cardMs || st.planMs);
    this.broadcast();
  }
}

