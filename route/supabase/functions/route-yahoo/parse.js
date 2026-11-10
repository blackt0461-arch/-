// Yahoo!乗換案内の検索結果ページ（HTML）から、経路を取り出す
// 見本：本人が保存したページ（須磨→南草津 2026-11-11 08:10着）で確かめた形
export function parseYahoo(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[1]).props.pageProps; } catch (e) { return null; }
  const list = d && d.naviSearchParam && d.naviSearchParam.featureInfoList;
  if (!Array.isArray(list)) return null;
  const toMin = (t) => { // 「1時間31分」「45分」→ 分
    const h = /(\d+)時間/.exec(t || ''), mi = /(\d+)分/.exec(t || '');
    return (h ? +h[1] * 60 : 0) + (mi ? +mi[1] : 0);
  };
  return list.map((f) => {
    const s = f.summaryInfo || {};
    const steps = (f.edgeInfoList || []).map((e) => {
      const times = (e.timeInfo || []);
      const dep = times.find((t) => t.type === 1) || times.find((t) => t.type === 3);
      const arr = times.find((t) => t.type === 2);
      return { station: e.stationName || '', line: e.railName || '', arr: arr ? arr.time : '', dep: dep ? dep.time : '' };
    });
    // 運賃は区間のまとまりごと：edgeGroup「a_b」＝ a番目〜b番目の乗車区間（駅 a 〜 駅 b+1）
    const yen = (v) => Number(String(v || '0').replace(/[^\d]/g, '')) || 0;
    const fares = [], seen = new Set();
    (f.edgeInfoList || []).forEach((e) => {
      const p = e.priceInfo;
      if (!p || !p.edgeGroup || seen.has(p.edgeGroup)) return;
      seen.add(p.edgeGroup);
      const [a, b] = p.edgeGroup.split('_').map(Number);
      fares.push({ a, b, price: yen(p.price), exp: yen(p.expPrice) });
    });
    return {
      dep: s.departureTime || '', arr: s.arrivalTime || '', min: toMin(s.totalTime),
      price: s.totalPrice || '', transfers: Number(s.transferCount || 0), steps, fares,
    };
  });
}
