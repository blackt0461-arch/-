// 訂正データを、精度アップのために送る（「精度アップに協力する」に同意した人だけ）。
// 送るもの：コード名と時間（訂正前・訂正後）、その区間の12音の強さの数字（ここから曲の音は戻せない）、テンポ・曲の長さ・アプリの版。
// 送らないもの：曲の音、歌詞、ファイル名、名前など誰のデータかわかるもの。
// 送り先：開発者の Google スプレッドシート（feedback/apps-script.gs の受け取り口）
export const FEEDBACK_URL = '';

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;

/** 区間の12音の強さの平均（解析で使った0.05秒ごとの記録から） */
function chromaOf(frames, start, end) {
  const inside = (frames ?? []).filter((f) => f.t >= start && f.t < end);
  if (!inside.length) return null;
  const c = new Array(12).fill(0);
  inside.forEach((f) => f.chroma.forEach((v, i) => { c[i] += v; }));
  const tot = c.reduce((a, b) => a + b, 0) || 1;
  return c.map((v) => r3(v / tot));
}

export function buildFeedback({ app, song, analysis, corrections, original }) {
  const seg = (s) => ({ s: r2(s.start), e: r2(s.end), n: s.name });
  return {
    kind: 'chord-correction',
    app,
    song,
    duration: r2(analysis.duration ?? 0),
    bpm: r2(analysis.bpm ?? 0),
    corrections: corrections.slice(0, 500).map((c) => ({ ...c, chroma: chromaOf(analysis.chordFrames, c.start, c.end) })),
    before: original.map(seg),
    after: analysis.timeline.map((s) => ({ ...seg(s), c: chromaOf(analysis.chordFrames, s.start, s.end) })),
  };
}

export async function sendFeedback(args) {
  if (!FEEDBACK_URL) return false;
  try {
    let body = JSON.stringify(buildFeedback(args));
    if (body.length > 58000) body = JSON.stringify({ ...buildFeedback(args), after: undefined });
    // 受け取り口は別のサイト（Google）なので、返事は読まずに送るだけにする（no-cors）
    await fetch(FEEDBACK_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    return true;
  } catch {
    return false;
  }
}
