// コレクションと称号のごほうび（企画担当）。
// ・図鑑の％：ふつうの家具・いつでも出るガチャの家具・特別な家具を「全部」として数える（限定・ごほうびの家具は分母に入れない。持っていれば分子には入る。最大100%）。
// ・ガチャのシリーズをそろえる：bySeries（ごほうび以外）を全部持っている。
// ・むずかしい称号・図鑑の％の称号には、限定家具がつく（TITLE_REWARD）。プレゼントBOXに1回だけ届く（profile.titleGifts に届けた称号を残す）。
// 画面にはさわらない。
import { ITEMS } from './items.js';
import * as G from './gacha.js';
import * as S from './store.js';

// 称号 id → ごほうびの家具（gacha.js の series: 'title'）
export const TITLE_REWARD = {
  akari5: 't-akari-lamp', aburi5: 't-aburi-desk', rokujo5: 't-rokujo-board', hikkoshi5: 't-hikkoshi-crates',
  pzking: 't-pz-crown', streak100: 't-streak100', s3000: 't-book-tower', lv50: 't-legend-laurel',
  zukan25: 'c-zukan25', zukan50: 'c-zukan50', zukan75: 'c-zukan75', zukan100: 'c-zukan100',
};

let base = null;
function basePool() {
  if (base) return base;
  const shop = ITEMS.filter(i => !i.rare && !i.special);
  const gacha = G.GACHA_ITEMS.filter(i => !i.limited && !i.reward);
  const special = ITEMS.filter(i => i.special);
  base = [...new Set([...shop, ...gacha, ...special].map(i => i.id))];
  return base;
}
// has(id) → 持っている（集めたことがある）か。戻り値 0〜100（整数・切り捨て）
export function zukanPct(has) {
  const ids = basePool();
  const n = ids.filter(id => has(id)).length;
  return Math.min(100, Math.floor(n / Math.max(1, ids.length) * 100));
}
// そろえたシリーズの id の一覧（いつか開いたことのあるシリーズだけ。家具が1つもないシリーズは数えない）
export function seriesDone(has) {
  return G.SERIES.map(s => s.id).filter(id => { const list = G.bySeries(id); return list.length && list.every(i => has(i.id)); });
}
// 手に入れた称号のごほうびを、プレゼントBOXに届ける（まだのものだけ）。戻り値：届けた家具の id の一覧
export function grantTitleRewards(earnedIds) {
  const out = [], p = S.profile(), done = p.titleGifts || (p.titleGifts = []);
  for (const tid of earnedIds) {
    const item = TITLE_REWARD[tid];
    if (!item) continue;
    const key = 'title-' + tid;
    if (done.includes(tid)) continue;
    done.push(tid);
    S.addGift({ id: key, kind: 'item', itemId: item, title: '称号のごほうび', from: 'title' });
    out.push(item);
  }
  return out;
}
