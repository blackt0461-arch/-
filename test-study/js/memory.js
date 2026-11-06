// 記憶のモデル（忘却曲線 ＋ 間隔反復 ＋ 正解率）
//
// ・忘却曲線（エビングハウス）：覚えたことは時間とともに指数関数的に忘れる。
//   思い出せる確率 R = 0.9 ^ (たった日数 / S)
//   S は「記憶の安定度」＝ 90% 思い出せる状態が続く日数。S が大きいほど忘れにくい。
// ・間隔反復：思い出しにくくなったころに思い出すほど、記憶は強くなる（S が大きくのびる）。
//   すぐに解き直しても S はあまりのびない。まちがえると S は小さくもどる。
// ・正解率：何度もまちがえる問題（むずかしい問題）は S がのびにくい。
//
// 「覚えている」＝ いま R が 0.9 以上。R が 0.9 を下回ったら復習のタイミング。
const DAY = 86400000;
export const GOAL = 0.9;

// 古い記録（S がない）も読めるようにする
function base(r) {
  if (!r) return null;
  if (r.S) return r;
  return { ...r, S: r.last === 'ok' ? 1 : 0.3, lt: r.t || Date.now() };
}

// その時点で思い出せる確率（0〜1）。まだ解いていない問題は 0
export function recall(r, at = Date.now()) {
  const m = base(r);
  if (!m) return 0;
  const days = Math.max(0, (at - m.lt) / DAY);
  return Math.pow(GOAL, days / m.S);
}

// 正解率からむずかしさ（0＝やさしい〜1＝むずかしい）。回数が少ないうちは 0.5 に寄せる
export function difficulty(r) {
  const ok = (r?.ok || 0) + 1, n = (r?.n || 0) + 2;
  return 1 - ok / n;
}

// 1回答えたあとの新しい S（r は答える前の記録、counts は答えたあとの回数）
export function nextS(r, res, counts, now = Date.now()) {
  const m = base(r);
  const D = difficulty(counts);
  if (!m) return res === 'ok' ? 1.5 : res === 'mid' ? 0.5 : 0.3; // はじめて解いた
  const R = recall(m, now);
  if (res === 'ok') {
    // 思い出しにくい時（R が低い）ほど大きくのびる。むずかしい問題はのびにくい
    const grow = 1 + (3 - 2 * D) * (1 - R + 0.15);
    return Math.min(365, Math.max(m.S * grow, 0.5));
  }
  if (res === 'mid') return Math.max(0.5, m.S * 0.8);
  return Math.max(0.3, m.S * 0.25);
}

// 次に復習するとよい日時（R が 0.9 になる時）
export function dueAt(r) {
  const m = base(r);
  return m ? m.lt + m.S * DAY : 0;
}
export const isDue = (r, at = Date.now()) => !r || recall(r, at) < GOAL;
