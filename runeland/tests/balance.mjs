// バランス試験：コンピューター同士で何千回も戦わせて、数字で確かめる
//   node tests/balance.mjs [ゲーム数（ふつう 2000）]
// 見る数字
//   ・強さの差：つよい > ふつう > やさしい になっているか
//   ・逆転：半分の時点の1位が最後も勝つ割合（低いほど「最後までわからない」）
//   ・1位の入れかわり回数、1位とビリの点差
//   ・カード：そのカードを使った回数あたりの、勝ちやすさ
//   ・お城の場所：いちばん近いルーンの石までの近さと勝ちやすさ
//   ・途中から入った人の勝ちやすさ
import * as G from '../game.js';
import { aiPlan } from '../ai.js';

const GAMES = +(process.argv[2] || 2000);
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

export function simulate(games = GAMES, opts = {}) {
  const S = { games: 0, lvlWin: {}, lvlPlay: {}, halfLeaderWins: 0, halfN: 0, leadChanges: 0, spread: 0, spreadRel: 0,
    card: {}, cardN: {}, nearWin: [0, 0], nearN: [0, 0], lateWin: 0, lateN: 0, lastHalfWins: 0, ties: 0 };
  for (let g = 0; g < games; g++) {
    const n = opts.n || [2, 3, 4, 4, 6, 8, 12][g % 7];
    const seed = (opts.seed || 1) * 100003 + g, r = G.rng(seed ^ 0x5eed);
    const levels = opts.levels || Array.from({ length: n }, (_, i) => opts.same ? 'normal' : ['easy', 'normal', 'hard'][(g + i) % 3]);
    const ps = levels.map((lv, i) => ({ id: 'c' + i, name: lv + i, bot: lv }));
    let st = G.newGame({ seed, players: ps, rounds: opts.rounds || 18 });
    const late = opts.late && g % 2 === 0;
    const used = st.players.map(() => ({}));
    let half = -1, prevLeader = -1;
    while (st.phase !== 'end') {
      if (late && st.round === 6) G.addLatePlayer(st, { id: 'late', name: 'late', bot: 'normal' });
      const plans = {};
      st.players.forEach((p, pi) => { plans[pi] = aiPlan(st, pi, p.bot, r); if (plans[pi]?.card) { used[pi] ||= {}; used[pi][plans[pi].card.k] = (used[pi][plans[pi].card.k] || 0) + 1; } });
      st = G.resolve(st, plans);
      const rk = G.ranking(st);
      if (rk[0].pi !== prevLeader) { if (prevLeader >= 0) S.leadChanges++; prevLeader = rk[0].pi; }
      if (st.round === Math.floor(st.rounds / 2) + 1) half = rk[0].pi;
    }
    const rk = G.ranking(st), win = rk[0].pi;
    if (rk.length > 1 && rk[0].score === rk[1].score) S.ties++;
    S.games++;
    S.spread += rk[0].score - rk[rk.length - 1].score;
    S.spreadRel += (rk[0].score - rk[rk.length - 1].score) / Math.max(1, rk[0].score);
    st.players.forEach((p, pi) => {
      const lv = pi < levels.length ? p.bot : 'late';
      S.lvlPlay[lv] = (S.lvlPlay[lv] || 0) + 1; if (pi === win) S.lvlWin[lv] = (S.lvlWin[lv] || 0) + 1;
      for (const k in used[pi] || {}) { S.cardN[k] = (S.cardN[k] || 0) + used[pi][k]; if (pi === win) S.card[k] = (S.card[k] || 0) + used[pi][k]; }
    });
    if (half >= 0) { S.halfN++; if (half === win) S.halfLeaderWins++; }
    if (late) { S.lateN++; if (st.players[win].id === 'late') S.lateWin++; }
    // お城の近くにルーンの石があるか
    const m = G.mapOf(st);
    const runes = st.terrain.map((t, i) => t === G.T.RUNE ? i : -1).filter(i => i >= 0);
    const near = levels.map((_, pi) => Math.min(...runes.map(i => dist(m.tiles[i], m.tiles[st.players[pi].castle]))));
    const med = [...near].sort((a, b) => a - b)[Math.floor(near.length / 2)];
    near.forEach((d, pi) => { const k = d <= med ? 0 : 1; S.nearN[k]++; if (pi === win) S.nearWin[k]++; });
  }
  return S;
}

function report(S, label) {
  const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
  console.log(`\n=== ${label}（${S.games}ゲーム）===`);
  console.log('勝率（強さ別）：' + Object.keys(S.lvlPlay).map(k => `${k} ${pct(S.lvlWin[k] || 0, S.lvlPlay[k])}`).join('・'));
  console.log(`半分の時点の1位が勝つ：${pct(S.halfLeaderWins, S.halfN)}　1位の入れかわり：1ゲーム平均 ${(S.leadChanges / S.games).toFixed(1)}回`);
  console.log(`1位とビリの点差：平均 ${(S.spread / S.games).toFixed(1)}点（1位の点の ${(100 * S.spreadRel / S.games).toFixed(0)}%）　同点で決まった：${pct(S.ties, S.games)}`);
  console.log('カード1回あたりの勝ち：' + Object.keys(S.cardN).map(k => `${G.CARDS[k].name} ${(S.card[k] || 0) / S.cardN[k] * 100 | 0}`).join('・'));
  console.log(`お城の近くにルーン：近い ${pct(S.nearWin[0], S.nearN[0])}／遠い ${pct(S.nearWin[1], S.nearN[1])}（勝った割合）`);
  if (S.lateN) console.log(`途中から入った人の勝ち：${pct(S.lateWin, S.lateN)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = Date.now();
  report(simulate(GAMES), 'いろいろな強さ・2〜12人');
  report(simulate(Math.ceil(GAMES / 2), { same: true, n: 4, seed: 7 }), '全員ふつう・4人');
  report(simulate(Math.ceil(GAMES / 2), { same: true, n: 8, seed: 8, late: true }), '全員ふつう・8人・途中参加あり');
  console.log(`\n${((Date.now() - t) / 1000).toFixed(0)}秒`);
}
