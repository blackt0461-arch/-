// プロフィール：パラメータ（勉強・パズル）と称号。
// パラメータは 0〜100。勉強は「解いた数」と「正解率」、パズルは「クリアした★」「回数」「ノーミス」から出す。

// 勉強の5つの力（理科は物理・化学・生物・地学をまとめる）
export const STUDY_AXES = [
  { key: 'jp', label: '国語', sids: ['jp'] },
  { key: 'math', label: '数学', sids: ['math'] },
  { key: 'english', label: '英語', sids: ['english'] },
  { key: 'sci', label: '理科', sids: ['physics', 'physics4', 'chem', 'bio', 'earth'] },
  { key: 'social', label: '社会', sids: ['social'] },
];
export const PUZZLE_AXES = [
  { key: 'akari', label: 'ひらめき', sub: 'あかりの間取り' },
  { key: 'aburi', label: '観察力', sub: '家具あぶりだし' },
  { key: 'rokujo', label: '論理力', sub: '六畳ロジック' },
  { key: 'hikkoshi', label: '段取り力', sub: 'おひっこし' },
];
export const rankOf = (v) => v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 55 ? 'B' : v >= 35 ? 'C' : v >= 15 ? 'D' : 'E';

// subjectOf(sid) → 記録（units に solved / correct がある）
export function studyParams(subjectOf) {
  return STUDY_AXES.map(ax => {
    let solved = 0, correct = 0;
    for (const sid of ax.sids) for (const u of Object.values(subjectOf(sid)?.units || {})) { solved += u.solved || 0; correct += u.correct || 0; }
    const acc = solved ? correct / solved : 0;
    // たくさん解くほど伸び、正解率が高いほど上がる（120問でおよそ6割、300問でおよそ9割まで伸びる）
    const value = Math.round(100 * acc * (1 - Math.exp(-solved / 120)));
    return { ...ax, solved, correct, acc, value, rank: rankOf(value) };
  });
}
// stateOf(id) → { best, clears, perfect }
export function puzzleParams(stateOf) {
  return PUZZLE_AXES.map(ax => {
    const s = stateOf(ax.key) || {}, best = s.best || 0, clears = s.clears || 0, perfect = s.perfect || 0;
    const value = Math.round(best * 14 + 20 * (1 - Math.exp(-clears / 15)) + (clears ? 10 * perfect / clears : 0));
    return { ...ax, best, clears, perfect, value: Math.min(100, value), rank: rankOf(value) };
  });
}

// 多角形のグラフ（レーダー）。axes = [{ label, value, rank }]
export function radarSVG(axes, { size = 240, color = '#f2b84b' } = {}) {
  const n = axes.length, c = size / 2, R = size * 0.32;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  const poly = (r) => axes.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<polygon points="${poly(R * f)}" fill="none" stroke="currentColor" stroke-opacity="${f === 1 ? 0.35 : 0.15}" stroke-width="1"/>`).join('');
  const spokes = axes.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity=".15"/>`; }).join('');
  const val = axes.map((a, i) => pt(i, R * Math.max(0.04, a.value / 100)).map(v => v.toFixed(1)).join(',')).join(' ');
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, R + size * 0.12);
    return `<text x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="${size * 0.055}" font-weight="700" fill="currentColor">${a.label}</text>
      <text x="${x.toFixed(1)}" y="${(y + size * 0.055).toFixed(1)}" text-anchor="middle" font-size="${size * 0.05}" fill="currentColor" fill-opacity=".75">${a.rank}${a.hideValue ? '' : ' ' + a.value}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="${axes.map(a => `${a.label} ${a.value}`).join('、')}">${grid}${spokes}
    <polygon points="${val}" fill="${color}" fill-opacity=".35" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${axes.map((a, i) => { const [x, y] = pt(i, R * Math.max(0.04, a.value / 100)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"/>`; }).join('')}${labels}</svg>`;
}

// ---------------- 称号 ----------------
// c = { solved, acc, streak, rank, study: [...], puzzle: [...], pzClears, collected, star5, admin }
const sp = (c, k) => c.study.find(x => x.key === k) || { value: 0 };
const pz = (c, k) => c.puzzle.find(x => x.key === k) || { best: 0 };
export const TITLES = [
  { id: 'first', name: 'はじめの一歩', how: '問題を1問解く', test: c => c.solved >= 1 },
  { id: 's50', name: 'コツコツ派', how: '問題を50問解く', test: c => c.solved >= 50 },
  { id: 's300', name: '努力家', how: '問題を300問解く', test: c => c.solved >= 300 },
  { id: 's1000', name: '知の探究者', how: '問題を1000問解く', test: c => c.solved >= 1000 },
  { id: 's3000', name: '歩く参考書', how: '問題を3000問解く', test: c => c.solved >= 3000 },
  { id: 'acc', name: '正確無比', how: '100問以上解いて、正解率90%以上', test: c => c.solved >= 100 && c.acc >= 0.9 },
  { id: 'jp', name: '言の葉マスター', how: '国語のパラメータを A 以上に', test: c => sp(c, 'jp').value >= 75 },
  { id: 'math', name: '数の魔術師', how: '数学のパラメータを A 以上に', test: c => sp(c, 'math').value >= 75 },
  { id: 'english', name: '英語の使い手', how: '英語のパラメータを A 以上に', test: c => sp(c, 'english').value >= 75 },
  { id: 'sci', name: '小さな科学者', how: '理科のパラメータを A 以上に', test: c => sp(c, 'sci').value >= 75 },
  { id: 'social', name: '時と世界の旅人', how: '社会のパラメータを A 以上に', test: c => sp(c, 'social').value >= 75 },
  { id: 'allround', name: 'オールラウンダー', how: '勉強の5つのパラメータをすべて C 以上に', test: c => c.study.every(x => x.value >= 35) },
  { id: 'streak3', name: '三日坊主卒業', how: '3日続けて開く', test: c => c.streak >= 3 },
  { id: 'streak7', name: '一週間の習慣', how: '7日続けて開く', test: c => c.streak >= 7 },
  { id: 'streak30', name: '継続は力なり', how: '30日続けて開く', test: c => c.streak >= 30 },
  { id: 'pz1', name: 'パズル入門', how: 'パズルを1回クリア', test: c => c.pzClears >= 1 },
  { id: 'pz50', name: 'パズル好き', how: 'パズルを50回クリア', test: c => c.pzClears >= 50 },
  { id: 'akari5', name: '照明デザイナー', how: 'あかりの間取りの ★5 をクリア', test: c => pz(c, 'akari').best >= 5 },
  { id: 'aburi5', name: 'あぶりだし名人', how: '家具あぶりだしの ★5 をクリア', test: c => pz(c, 'aburi').best >= 5 },
  { id: 'rokujo5', name: '六畳の論理学者', how: '六畳ロジックの ★5 をクリア', test: c => pz(c, 'rokujo').best >= 5 },
  { id: 'hikkoshi5', name: '引っ越しのプロ', how: 'おひっこしの ★5 をクリア', test: c => pz(c, 'hikkoshi').best >= 5 },
  { id: 'pzking', name: 'パズル王', how: '4つのパズルすべての ★5 をクリア', test: c => c.puzzle.every(x => x.best >= 5) },
  { id: 'lv10', name: '一人前', how: 'Lv10 になる', test: c => c.rank >= 10 },
  { id: 'lv30', name: 'ベテラン', how: 'Lv30 になる', test: c => c.rank >= 30 },
  { id: 'lv50', name: 'レジェンド', how: 'Lv50 になる', test: c => c.rank >= 50 },
  { id: 'items30', name: 'インテリア好き', how: '家具を30種類集める', test: c => c.collected >= 30 },
  { id: 'items100', name: 'コーディネーター', how: '家具を100種類集める', test: c => c.collected >= 100 },
  { id: 'star5', name: '強運の持ち主', how: 'ガチャで ★5 の家具を手に入れる', test: c => c.star5 >= 1 },
  { id: 'admin', name: '管理人', how: '管理者だけ', test: c => c.admin, secret: true },
];
export const titleById = (id) => TITLES.find(t => t.id === id) || null;
export const earnedTitles = (c) => TITLES.filter(t => { try { return t.test(c); } catch (e) { return false; } });
