// 物理のサンプル問題。
// phrase は text の部分文字列と完全一致させること。
// hidden: true は「数字は書いていないが文字に当てはまる条件」（例：静かにはなす → v₀ = 0）。
export const SYMBOLS = {
  '力学': ['v₀', 'v', 'a', 't', 'x', 'h', 'g', 'm', 'F'],
  '熱': ['Q', 'm', 'c', 'ΔT', 'p₁', 'p₂', 'V₁', 'V₂', 'T', 'W'],
  '波動': ['v', 'f', 'λ', 'T', 'L', 'n', 'A'],
  '電磁気': ['V', 'R', 'I', 'P', 'W', 't', 'Q'],
};

export const PROBLEMS = [
  {
    id: 'phy-001', unit: '力学',
    text: '初速度 5.0 m/s で走っていた車が、一定の加速度 2.0 m/s² で加速した。4.0 秒後の速さは何 m/s か。',
    quantities: [
      { phrase: '初速度 5.0 m/s', symbol: 'v₀', meaning: '初速度' },
      { phrase: '加速度 2.0 m/s²', symbol: 'a', meaning: '加速度' },
      { phrase: '4.0 秒後', symbol: 't', meaning: '経過時間' },
    ],
    target: { phrase: '速さは何 m/s か', symbol: 'v', meaning: '4.0秒後の速さ' },
    formula: { expr: 'v = v₀ + at', name: '等加速度運動の速度の式' },
    formulaSymbols: [],
    reason: '「時間」がわかっていて「速さ」を求める。距離が出てこないので、速度と時間の式を使う。',
    distractors: ['x = v₀t + ½at²', 'v² − v₀² = 2ax', 'F = ma'],
    verified: true,
  },
  {
    id: 'phy-002', unit: '力学',
    text: 'ボールを高さ 19.6 m のところから静かにはなした。地面に達するまでの時間は何秒か。重力加速度の大きさを 9.8 m/s² とする。',
    quantities: [
      { phrase: '高さ 19.6 m', symbol: 'h', meaning: '落ちる高さ' },
      { phrase: '静かにはなした', symbol: 'v₀', meaning: '初速度（0）', hidden: true },
      { phrase: '9.8 m/s²', symbol: 'g', meaning: '重力加速度' },
    ],
    target: { phrase: '時間は何秒か', symbol: 't', meaning: '落ちるまでの時間' },
    formula: { expr: 'h = ½gt²', name: '自由落下の落下距離の式' },
    formulaSymbols: [],
    reason: '「静かに」なので初速度は0の自由落下。高さと時間の関係を使う。',
    distractors: ['v = gt', 'v² = 2gh', 'F = ma'],
    verified: true,
  },
  {
    id: 'phy-003', unit: '力学',
    text: '質量 2.0 kg の物体に、水平方向に 6.0 N の力を加え続けた。物体に生じる加速度の大きさはいくらか。',
    quantities: [
      { phrase: '質量 2.0 kg', symbol: 'm', meaning: '質量' },
      { phrase: '6.0 N の力', symbol: 'F', meaning: '加えた力' },
    ],
    target: { phrase: '加速度の大きさ', symbol: 'a', meaning: '加速度' },
    formula: { expr: 'F = ma', name: '運動方程式' },
    formulaSymbols: [],
    reason: '「力」と「質量」から「加速度」を出すのは運動方程式。',
    distractors: ['v = v₀ + at', 'x = v₀t + ½at²', 'v² − v₀² = 2ax'],
    verified: true,
  },
  {
    id: 'phy-004', unit: '力学',
    text: '速さ 20 m/s で走っていた自動車がブレーキをかけ、一定の加速度で減速して 40 m 進んで止まった。加速度の大きさはいくらか。',
    quantities: [
      { phrase: '速さ 20 m/s', symbol: 'v₀', meaning: 'ブレーキ前の速さ（初速度）' },
      { phrase: '40 m 進んで', symbol: 'x', meaning: '進んだ距離' },
      { phrase: '止まった', symbol: 'v', meaning: '最後の速さ（0）', hidden: true },
    ],
    target: { phrase: '加速度の大きさ', symbol: 'a', meaning: '加速度' },
    formula: { expr: 'v² − v₀² = 2ax', name: '等加速度運動の時間を含まない式' },
    formulaSymbols: [],
    reason: '時間が書かれていない。速さと距離だけで加速度を出すので、時間を含まない式。',
    distractors: ['v = v₀ + at', 'x = v₀t + ½at²', 'F = ma'],
    verified: true,
  },
  {
    id: 'phy-005', unit: '力学',
    text: '小球を地面から速さ 14 m/s で真上に投げ上げた。最高点に達するまでの時間は何秒か。重力加速度の大きさを 9.8 m/s² とする。',
    quantities: [
      { phrase: '速さ 14 m/s', symbol: 'v₀', meaning: '投げ上げた速さ（初速度）' },
      { phrase: '最高点', symbol: 'v', meaning: '最高点での速さ（0）', hidden: true },
      { phrase: '9.8 m/s²', symbol: 'g', meaning: '重力加速度' },
    ],
    target: { phrase: '時間は何秒か', symbol: 't', meaning: '最高点までの時間' },
    formula: { expr: 'v = v₀ − gt', name: '鉛直投げ上げの速度の式' },
    formulaSymbols: [],
    reason: '最高点では速さが0になる。速さと時間の関係を使う。',
    distractors: ['h = v₀t − ½gt²', 'v² − v₀² = −2gh', 'F = ma'],
    verified: true,
  },
  {
    id: 'phy-006', unit: '熱',
    text: '比熱 4.2 J/(g·K) の水 100 g の温度を 10 K 上げるのに必要な熱量はいくらか。',
    quantities: [
      { phrase: '比熱 4.2 J/(g·K)', symbol: 'c', meaning: '比熱' },
      { phrase: '水 100 g', symbol: 'm', meaning: '質量' },
      { phrase: '10 K 上げる', symbol: 'ΔT', meaning: '温度の上がり幅' },
    ],
    target: { phrase: '必要な熱量', symbol: 'Q', meaning: '熱量' },
    formula: { expr: 'Q = mcΔT', name: '熱量の式' },
    formulaSymbols: [],
    reason: '「比熱」「質量」「温度変化」がそろったら熱量の式。',
    distractors: ['p₁V₁ = p₂V₂', 'ΔU = Q + W', 'W = pΔV'],
    verified: true,
  },
  {
    id: 'phy-007', unit: '熱',
    text: '圧力 1.0×10⁵ Pa、体積 2.0 L の気体を、温度を一定に保ったまま体積 1.0 L まで圧縮した。圧縮後の圧力はいくらか。',
    quantities: [
      { phrase: '圧力 1.0×10⁵ Pa', symbol: 'p₁', meaning: 'はじめの圧力' },
      { phrase: '体積 2.0 L', symbol: 'V₁', meaning: 'はじめの体積' },
      { phrase: '体積 1.0 L', symbol: 'V₂', meaning: 'あとの体積' },
    ],
    target: { phrase: '圧縮後の圧力', symbol: 'p₂', meaning: 'あとの圧力' },
    formula: { expr: 'p₁V₁ = p₂V₂', name: 'ボイルの法則' },
    formulaSymbols: [],
    reason: '「温度一定」で圧力と体積が変わるのはボイルの法則。',
    distractors: ['Q = mcΔT', 'ΔU = Q + W', 'W = pΔV'],
    verified: true,
  },
  {
    id: 'phy-008', unit: '波動',
    text: '振動数 440 Hz の音が、速さ 340 m/s で空気中を伝わる。この音の波長はいくらか。',
    quantities: [
      { phrase: '振動数 440 Hz', symbol: 'f', meaning: '振動数' },
      { phrase: '速さ 340 m/s', symbol: 'v', meaning: '音の速さ' },
    ],
    target: { phrase: '波長', symbol: 'λ', meaning: '波長' },
    formula: { expr: 'v = fλ', name: '波の基本式' },
    formulaSymbols: [],
    reason: '速さ・振動数・波長の3つをつなぐのは波の基本式。',
    distractors: ['f = 1/T', 'f = nv/2L', 'v = λ/T'],
    verified: true,
  },
  {
    id: 'phy-009', unit: '波動',
    text: '長さ 0.60 m の弦の両端を固定してはじいたところ、基本振動が生じた。弦を伝わる波の速さが 240 m/s のとき、振動数はいくらか。',
    quantities: [
      { phrase: '長さ 0.60 m', symbol: 'L', meaning: '弦の長さ' },
      { phrase: '基本振動', symbol: 'n', meaning: '何倍振動か（1）', hidden: true },
      { phrase: '240 m/s', symbol: 'v', meaning: '弦を伝わる波の速さ' },
    ],
    target: { phrase: '振動数', symbol: 'f', meaning: '振動数' },
    formula: { expr: 'f = nv/2L', name: '弦の固有振動数の式' },
    formulaSymbols: [],
    reason: '両端固定の弦。「基本振動」は n = 1 のこと。',
    distractors: ['v = fλ', 'f = 1/T', 'f = nv/4L'],
    verified: true,
  },
  {
    id: 'phy-010', unit: '電磁気',
    text: '抵抗 20 Ω の抵抗器に 0.50 A の電流が流れている。抵抗器の両端の電圧はいくらか。',
    quantities: [
      { phrase: '抵抗 20 Ω', symbol: 'R', meaning: '抵抗' },
      { phrase: '0.50 A の電流', symbol: 'I', meaning: '電流' },
    ],
    target: { phrase: '両端の電圧', symbol: 'V', meaning: '電圧' },
    formula: { expr: 'V = RI', name: 'オームの法則' },
    formulaSymbols: [],
    reason: '抵抗と電流から電圧を出すのはオームの法則。',
    distractors: ['P = VI', 'Q = It', 'W = VIt'],
    verified: true,
  },
  {
    id: 'phy-011', unit: '電磁気',
    text: '100 V の電圧で 2.0 A の電流が流れる電気器具を 60 秒間使った。消費した電力量はいくらか。',
    quantities: [
      { phrase: '100 V の電圧', symbol: 'V', meaning: '電圧' },
      { phrase: '2.0 A の電流', symbol: 'I', meaning: '電流' },
      { phrase: '60 秒間', symbol: 't', meaning: '使った時間' },
    ],
    target: { phrase: '電力量', symbol: 'W', meaning: '電力量' },
    formula: { expr: 'W = VIt', name: '電力量の式' },
    formulaSymbols: [],
    reason: '「時間」が出てきて「電力量」を聞かれている。電力 × 時間。',
    distractors: ['P = VI', 'V = RI', 'Q = It'],
    verified: true,
  },
  {
    id: 'phy-012', unit: '電磁気',
    text: '電圧 12 V の電源につないだ電球に 0.50 A の電流が流れた。電球の消費電力はいくらか。',
    quantities: [
      { phrase: '電圧 12 V', symbol: 'V', meaning: '電圧' },
      { phrase: '0.50 A の電流', symbol: 'I', meaning: '電流' },
    ],
    target: { phrase: '消費電力', symbol: 'P', meaning: '電力' },
    formula: { expr: 'P = VI', name: '電力の式' },
    formulaSymbols: [],
    reason: '時間が出てこないので「電力量」ではなく「電力」。電圧 × 電流。',
    distractors: ['W = VIt', 'V = RI', 'Q = It'],
    verified: true,
  },
];

// 起動時のチェック：phrase が問題文に含まれないものは除外する
export function validProblems() {
  return PROBLEMS.filter(p =>
    [...p.quantities, p.target].every(q => p.text.includes(q.phrase)));
}
