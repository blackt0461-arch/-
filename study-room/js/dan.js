// 教科の段位（企画担当）。Lv の上限のあとも、教科ごとに目標が続くように。
// ・教科は profile.js の STUDY_AXES（国語・数学・英語・理科・社会）。studyParams の solved / correct / acc を使う。
// ・段：その教科で正解した数（NEED）と、正解率（ACC）の両方を満たすと上がる。下がることはない（profile.dan に一番高い段を残す）。
// ・昇段のごほうびはプレゼントBOXへ（メダル 段×20、五段で★4以上確定、十段で★5限定）。十段は称号（profile.js）。
// 画面にはさわらない。
import * as S from './store.js';

export const DAN_NAMES = ['', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '十段'];
export const NEED = [0, 50, 120, 220, 350, 520, 750, 1050, 1450, 2000, 2800]; // その段に必要な正解の数
export const ACC = [0, 0, 0, 0, 0.6, 0.65, 0.7, 0.72, 0.75, 0.78, 0.8];        // その段に必要な正解率
export const MAX_DAN = 10;

// a = studyParams の1行（correct・acc）。戻り値 0〜10
export function danOf(a) {
  let d = 0;
  for (let k = 1; k <= MAX_DAN; k++) if ((a.correct || 0) >= NEED[k] && (a.acc || 0) >= ACC[k]) d = k; else break;
  return d;
}
// 次の段まで：{ next, needCorrect: あと何問, needAcc: 正解率が足りない時の目標（0〜1）か null }
export function toNext(a, dan) {
  const k = dan + 1;
  if (k > MAX_DAN) return null;
  return { next: k, needCorrect: Math.max(0, NEED[k] - (a.correct || 0)), needAcc: (a.acc || 0) < ACC[k] ? ACC[k] : null };
}
export function danRewards(k) {
  const r = [{ kind: 'medals', amount: k * 20 }];
  if (k === 5) r.push({ kind: 'ticket4', amount: 1 });
  if (k === 10) r.push({ kind: 'ticket5', amount: 1 });
  return r;
}
// 段が上がったかを調べて、ごほうびを届ける。study = studyParams の結果。戻り値 [{ key, label, dan }]（上がった教科）
export function checkPromotions(study) {
  const p = S.profile(), saved = p.dan || (p.dan = {}), out = [];
  for (const a of study) {
    const now = danOf(a), before = saved[a.key] || 0;
    if (now <= before) continue;
    saved[a.key] = now;
    for (let k = before + 1; k <= now; k++) {
      for (const r of danRewards(k)) S.addGift({ id: `dan-${a.key}-${k}-${r.kind}`, kind: r.kind, amount: r.amount, title: `${a.label} ${DAN_NAMES[k]}のごほうび`, from: 'dan' });
    }
    out.push({ key: a.key, label: a.label, dan: now });
  }
  return out;
}
// 記録に残っている段（下がらない）と、いまの段の高いほう
export const danSaved = (key, pf = S.profile()) => (pf.dan || {})[key] || 0;
