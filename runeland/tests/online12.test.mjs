// オンライン試験：にせプレイヤー12人が本物の Supabase Realtime で同じ部屋に入って遊ぶ。
// 使い方：node tests/online12.test.mjs <supabase-js を入れたフォルダ> [人数] [ラウンド数] [コンピューターの数]
// 途中で親をぬけさせて、引きつぎも試す。全員の盤面が毎ラウンド同じかを確かめる。
import { createRequire } from 'module';
import * as G from '../game.js';
import { Room } from '../net.js';
import { RELAY_URL, RELAY_KEY } from '../relay-config.js';
const dir = process.argv[2], N = +(process.argv[3] || 12), ROUNDS = +(process.argv[4] || 5), BOTS = +(process.argv[5] || 0);
const { createClient } = createRequire(dir + '/')('@supabase/supabase-js');
const code = String(900000 + Math.floor(Math.random() * 99999));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rooms = [], lag = [];
for (let i = 0; i < N; i++) {
  const sb = createClient(RELAY_URL, RELAY_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
  const room = new Room({ code, id: 'bot' + i, name: 'にせ' + i, sb });
  room.seen = new Map();
  room.onChange = r => {
    const s = r.state; if (!s) return;
    const k = s.gid + ':' + s.round + ':' + s.step;
    if (!r.seen.has(k)) { r.seen.set(k, { t: Date.now(), owner: s.owner.join(',') });
      if (s.step === 'plan' && s.phase === 'plan' && r.meIndex() >= 0 && !r.planned?.[k]) { (r.planned ||= {})[k] = 1;
        setTimeout(() => { if (r.state && r.state.round === s.round && r.state.step === 'plan') r.submit(G.botPlan(r.state, r.meIndex())); }, 300 + Math.random() * 1500); } }
  };
  rooms.push(room);
  await room.connect(); await sleep(150);
}
await sleep(2500);
const host = rooms.find(r => r.isHost());
console.log(`部屋 ${code}：${N}人 入室。親=${host.id}。全員が同じ親を見ている：${rooms.every(r => r.hostId() === host.id)}`);
host.lobby.rounds = ROUNDS; for (let i = 0; i < BOTS; i++) host.addBot(['easy', 'normal', 'hard'][i % 3]); host.start();
console.log('コンピューター ' + BOTS + '人も参加');
let left = null;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await sleep(500);
  const live = rooms.filter(r => r !== left);
  if (!left && live[0].state && live[0].state.round === 3 && live[0].state.step === 'plan') { left = live.find(r => r.isHost()); console.log('親（' + left.id + '）をぬけさせます'); left.leave(); }
  if (live.every(r => r.state && r.state.phase === 'end')) break;
}
const live = rooms.filter(r => r !== left);
// 全員が同じ盤面を見たか・届くまでの差
let bad = 0;
for (const k of live[0].seen.keys()) {
  const vs = live.map(r => r.seen.get(k)).filter(Boolean);
  if (new Set(vs.map(v => v.owner)).size > 1) bad++;
  const ts = vs.map(v => v.t); lag.push(Math.max(...ts) - Math.min(...ts));
  if (vs.length < live.length && !k.endsWith(':plan')) console.log('届かなかった人がいる:', k, vs.length);
}
const end = live.every(r => r.state && r.state.phase === 'end');
console.log(`最後まで遊べた：${end}（${((Date.now() - t0) / 1000).toFixed(0)}秒）`);
console.log(`盤面がずれた回数：${bad}／${live[0].seen.size}`);
lag.sort((a, b) => a - b);
console.log(`全員に届くまでの差：ふつう ${lag[Math.floor(lag.length / 2)]}ms・いちばん遅い ${lag[lag.length - 1]}ms`);
if (end) console.log('順位：' + G.ranking(live[0].state).slice(0, 3).map(x => x.name + ' ' + x.score + '点').join(' / '));
live.forEach(r => r.leave());
await sleep(500);
process.exit(end && !bad ? 0 : 1);
