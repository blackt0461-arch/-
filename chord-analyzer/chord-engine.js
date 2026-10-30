// コード判定の中核（マイク入力・指板入力の両方で使う）

export const NOTE_NAMES = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];

// intervals: ルートからの半音数 / degrees: 表示用の度数
// optional5: 5度を省略しても成立するとみなす（ギターでよく省略されるため）
export const CHORD_TYPES = [
  { suffix: '',     intervals: [0, 4, 7],      degrees: ['R', '3', '5'] },
  { suffix: 'm',    intervals: [0, 3, 7],      degrees: ['R', '♭3', '5'] },
  { suffix: '7',    intervals: [0, 4, 7, 10],  degrees: ['R', '3', '5', '♭7'], optional5: true },
  { suffix: 'maj7', intervals: [0, 4, 7, 11],  degrees: ['R', '3', '5', '7'], optional5: true },
  { suffix: 'm7',   intervals: [0, 3, 7, 10],  degrees: ['R', '♭3', '5', '♭7'], optional5: true },
  { suffix: 'sus4', intervals: [0, 5, 7],      degrees: ['R', '4', '5'] },
  { suffix: 'sus2', intervals: [0, 2, 7],      degrees: ['R', '2', '5'] },
  { suffix: '6',    intervals: [0, 4, 7, 9],   degrees: ['R', '3', '5', '6'], optional5: true },
  { suffix: 'm6',   intervals: [0, 3, 7, 9],   degrees: ['R', '♭3', '5', '6'], optional5: true },
  { suffix: 'm7♭5', intervals: [0, 3, 6, 10],  degrees: ['R', '♭3', '♭5', '♭7'] },
  { suffix: 'dim',  intervals: [0, 3, 6],      degrees: ['R', '♭3', '♭5'] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9],   degrees: ['R', '♭3', '♭5', '♭♭7'] },
  { suffix: 'aug',  intervals: [0, 4, 8],      degrees: ['R', '3', '♯5'] },
  { suffix: '5',    intervals: [0, 7],         degrees: ['R', '5'] },
];

const mod12 = (n) => ((n % 12) + 12) % 12;

function buildCandidate(root, type, bass) {
  const name = NOTE_NAMES[root] + type.suffix + (bass != null && bass !== root ? '/' + NOTE_NAMES[bass] : '');
  return {
    name,
    root,
    bass,
    suffix: type.suffix,
    notes: type.intervals.map((i) => NOTE_NAMES[mod12(root + i)]),
    degrees: type.degrees,
  };
}

/**
 * 構成音（ピッチクラス 0〜11）とベース音から、コード候補を順位付きで返す。
 * 指板入力用：構成音がはっきり分かっている前提。
 */
export function identifyFromNotes(pitchClasses, bass = null, limit = 4) {
  const pcs = new Set(pitchClasses.map(mod12));
  if (pcs.size < 2) return [];

  const results = [];
  pcs.forEach((root) => {
    CHORD_TYPES.forEach((type, typeIndex) => {
      const tones = type.intervals.map((i) => mod12(root + i));
      const missing = tones.filter((t) => !pcs.has(t));
      const extra = [...pcs].filter((p) => !tones.includes(p));
      if (extra.length > 0) return;

      let penalty = 0;
      if (missing.length > 0) {
        const onlyFifthMissing = type.optional5 && missing.length === 1 && missing[0] === mod12(root + 7);
        if (!onlyFifthMissing) return;
        penalty += 2;
      }
      if (bass != null && bass !== root) penalty += 1;

      results.push({ ...buildCandidate(root, type, bass), score: 10 - penalty - typeIndex * 0.01, exact: missing.length === 0 });
    });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * 12音の強さ（クロマ）とベース音から、コード候補を信頼度付きで返す。
 * マイク入力用：雑音や倍音を含むので、構成音パターンとの近さ（コサイン類似度）で比べる。
 */
export function identifyFromChroma(chroma, bass = null, limit = 4) {
  const norm = Math.hypot(...chroma);
  if (norm === 0) return [];

  const results = [];
  for (let root = 0; root < 12; root++) {
    CHORD_TYPES.forEach((type, typeIndex) => {
      const template = new Array(12).fill(0);
      type.intervals.forEach((i) => { template[mod12(root + i)] = 1; });
      const dot = chroma.reduce((sum, v, i) => sum + v * template[i], 0);
      const similarity = dot / (norm * Math.sqrt(type.intervals.length));

      // ベース音がルートと一致する解釈を少し優遇し、構成音に無いベースは分数コードにしない
      let score = similarity - typeIndex * 0.001;
      // パワーコード（ルート＋5度）は、3度の音が小さく拾われただけのことが多いので控えめに
      if (type.suffix === '5') score -= 0.08;
      let candidateBass = null;
      if (bass != null) {
        if (bass === root) score += 0.03;
        else if (template[bass]) candidateBass = bass;
        else score -= 0.03;
      }
      results.push({
        ...buildCandidate(root, type, candidateBass),
        score,
        confidence: Math.round(Math.max(0, Math.min(1, similarity)) * 100),
      });
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function midiToPitchClass(midi) {
  return mod12(midi);
}

export function frequencyToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}
