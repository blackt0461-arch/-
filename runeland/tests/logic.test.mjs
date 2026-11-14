// ルールだけの試験：にせプレイヤー 2〜16人で何回も最後まで遊んでみる
import * as G from '../game.js';
let games = 0, worst = 0;
for (const n of [2, 3, 4, 6, 8, 12, 16]) for (let g = 0; g < 20; g++) {
  const seed = (n * 1000 + g) >>> 0, r = G.rng(seed + 9);
  let st = G.newGame({ seed, players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i })) });
  if (new Set(st.players.map(p => p.castle)).size !== n) throw new Error('お城が重なった n=' + n);
  while (st.phase !== 'end') {
    const plans = {}; st.players.forEach((_, pi) => { plans[pi] = G.botPlan(st, pi, r); });
    const t = performance.now();
    const a = G.resolve(st, plans), b = G.resolve(G.unpack(JSON.parse(JSON.stringify(G.pack(st)))), plans);
    worst = Math.max(worst, performance.now() - t);
    if (JSON.stringify(a.owner) !== JSON.stringify(b.owner)) throw new Error('同じ作戦で結果がずれた');
    st = a;
    if (st.round === 6 && g === 0 && n < 16) G.addLatePlayer(st, { id: 'late', name: 'L' });
  }
  games++;
  if (g === 0) console.log(n + '人', G.mapOf(st).N + 'マス', G.ranking(st).slice(0, 3).map(x => x.name + ':' + x.score).join(' '));
}
console.log(`OK ${games}回 最後まで遊べた。1ラウンドの計算 最大 ${worst.toFixed(1)}ms`);
