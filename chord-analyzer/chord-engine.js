// コード判定の中核（マイク入力・指板入力の両方で使う）

// ルート音の名前（よく使われる書き方）。構成音は spellNote で度数に合わせて書き分ける
export const NOTE_NAMES = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];

// intervals: ルートからの半音数 / degrees: 表示用の度数
// optional5: 5度を省略しても成立するとみなす（ギターでよく省略されるため）
// tension: 9th などを含むコード（マイクでは倍音と区別しにくいので控えめに扱う）
export const CHORD_TYPES = [
  { suffix: '',       intervals: [0, 4, 7],         degrees: ['R', '3', '5'] },
  { suffix: 'm',      intervals: [0, 3, 7],         degrees: ['R', '♭3', '5'] },
  { suffix: '7',      intervals: [0, 4, 7, 10],     degrees: ['R', '3', '5', '♭7'], optional5: true },
  { suffix: 'maj7',   intervals: [0, 4, 7, 11],     degrees: ['R', '3', '5', '7'], optional5: true },
  { suffix: 'm7',     intervals: [0, 3, 7, 10],     degrees: ['R', '♭3', '5', '♭7'], optional5: true },
  { suffix: 'sus4',   intervals: [0, 5, 7],         degrees: ['R', '4', '5'] },
  { suffix: 'sus2',   intervals: [0, 2, 7],         degrees: ['R', '2', '5'] },
  { suffix: '6',      intervals: [0, 4, 7, 9],      degrees: ['R', '3', '5', '6'], optional5: true },
  { suffix: 'm6',     intervals: [0, 3, 7, 9],      degrees: ['R', '♭3', '5', '6'], optional5: true },
  { suffix: 'm7♭5',   intervals: [0, 3, 6, 10],     degrees: ['R', '♭3', '♭5', '♭7'] },
  { suffix: 'dim',    intervals: [0, 3, 6],         degrees: ['R', '♭3', '♭5'] },
  { suffix: 'dim7',   intervals: [0, 3, 6, 9],      degrees: ['R', '♭3', '♭5', '♭♭7'] },
  { suffix: 'aug',    intervals: [0, 4, 8],         degrees: ['R', '3', '♯5'] },
  { suffix: 'add9',   intervals: [0, 4, 7, 2],      degrees: ['R', '3', '5', '9'], optional5: true, tension: true },
  { suffix: 'm(add9)', intervals: [0, 3, 7, 2],     degrees: ['R', '♭3', '5', '9'], optional5: true, tension: true },
  { suffix: '7sus4',  intervals: [0, 5, 7, 10],     degrees: ['R', '4', '5', '♭7'], optional5: true, tension: true },
  { suffix: 'm(maj7)', intervals: [0, 3, 7, 11],    degrees: ['R', '♭3', '5', '7'], optional5: true, tension: true },
  { suffix: '9',      intervals: [0, 4, 7, 10, 2],  degrees: ['R', '3', '5', '♭7', '9'], optional5: true, tension: true },
  { suffix: 'm9',     intervals: [0, 3, 7, 10, 2],  degrees: ['R', '♭3', '5', '♭7', '9'], optional5: true, tension: true },
  { suffix: 'maj9',   intervals: [0, 4, 7, 11, 2],  degrees: ['R', '3', '5', '7', '9'], optional5: true, tension: true },
  { suffix: '6(9)',   intervals: [0, 4, 7, 9, 2],   degrees: ['R', '3', '5', '6', '9'], optional5: true, tension: true },
  { suffix: '5',      intervals: [0, 7],            degrees: ['R', '5'] },
];

// どのコードにも当てはまらない音を「近い形」として表すときの度数
const EXTRA_DEGREES = ['R', '♭9', '9', '♯9', '3', '11', '♯11', '5', '♭13', '13', '♭7', '7'];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS = { 0: '', 1: '#', 2: '##', 11: '♭', 10: '♭♭' };

const mod12 = (n) => ((n % 12) + 12) % 12;

/**
 * 度数に合わせて音名を書き分ける（例：Cdim7 の ♭♭7 は A ではなく B♭♭）。
 * 3度ならルートから3つ目の音名（C→E）、5度なら5つ目（C→G）…という音楽理論の書き方。
 */
export function spellNote(rootPc, degree, pc) {
  const rootLetter = NOTE_NAMES[rootPc][0];
  const number = degree === 'R' ? 1 : Number(degree.replace(/[^0-9]/g, ''));
  const letterIndex = (LETTERS.indexOf(rootLetter) + number - 1) % 7;
  const accidental = ACCIDENTALS[mod12(pc - NATURAL_PCS[letterIndex])];
  return accidental === undefined ? NOTE_NAMES[pc] : LETTERS[letterIndex] + accidental;
}

function buildCandidate(root, type, bass, extras = []) {
  const pcs = type.intervals.map((i) => mod12(root + i));
  const degrees = [...type.degrees];
  extras.forEach((pc) => { pcs.push(pc); degrees.push(EXTRA_DEGREES[mod12(pc - root)]); });
  const notes = pcs.map((pc, i) => spellNote(root, degrees[i], pc));
  // 分数コードのベース音は読みやすさを優先し、♭♭ や ## を使わない
  const spelledBass = bass != null && bass !== root ? notes[pcs.indexOf(bass)] : null;
  const bassName = spelledBass && /##|♭♭/.test(spelledBass) ? NOTE_NAMES[bass] : spelledBass;
  const extraText = extras.length ? `(+${extras.map((pc) => notes[pcs.indexOf(pc)]).join(',')})` : '';
  return {
    name: NOTE_NAMES[root] + type.suffix + extraText + (bassName ? '/' + bassName : ''),
    root,
    bass,
    suffix: type.suffix,
    pcs,
    notes,
    degrees,
    approx: extras.length > 0,
  };
}

// 構成音 tones が pcs にそろっているか。5度の省略は optional5 のときだけ認める
function coverage(type, root, pcs) {
  const tones = type.intervals.map((i) => mod12(root + i));
  const missing = tones.filter((t) => !pcs.has(t));
  if (missing.length === 0) return { tones, fifthMissing: false };
  if (type.optional5 && missing.length === 1 && missing[0] === mod12(root + 7)) return { tones, fifthMissing: true };
  return null;
}

/**
 * 構成音（ピッチクラス 0〜11）とベース音から、コード候補を順位付きで返す。
 * 指板入力用：構成音がはっきり分かっている前提。
 * どのコードにもぴったり当てはまらないときは、余分な音を (+D) のように添えた「近い形」を返す。
 */
export function identifyFromNotes(pitchClasses, bass = null, limit = 4) {
  const pcs = new Set(pitchClasses.map(mod12));
  if (pcs.size < 2) return [];

  const exact = [];
  const approx = [];
  pcs.forEach((root) => {
    CHORD_TYPES.forEach((type, typeIndex) => {
      const cov = coverage(type, root, pcs);
      if (!cov) return;
      const extras = [...pcs].filter((p) => !cov.tones.includes(p));
      let penalty = (cov.fifthMissing ? 2 : 0) + (bass != null && bass !== root ? 1 : 0) + typeIndex * 0.01;
      if (extras.length === 0) {
        exact.push({ ...buildCandidate(root, type, bass), score: 10 - penalty });
      } else if (type.suffix !== '5') {
        penalty += extras.length * 3 + (type.tension ? 1 : 0);
        approx.push({ ...buildCandidate(root, type, bass, extras), score: 10 - penalty });
      }
    });
  });

  const sorted = (list) => list.sort((a, b) => b.score - a.score);
  return exact.length ? sorted(exact).slice(0, limit) : sorted(approx).slice(0, Math.min(limit, 2));
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

      let score = similarity - typeIndex * 0.001;
      // パワーコード（ルート＋5度）は、3度の音が小さく拾われただけのことが多いので控えめに
      if (type.suffix === '5') score -= 0.08;
      // 9th などは倍音でも似た形になりやすいので、はっきり鳴っているときだけ選ばれるように
      if (type.tension) score -= 0.02;
      // ベース音がルートと一致する解釈を少し優遇し、構成音に無いベースは分数コードにしない
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

// コード名の書き方のゆれ（M7・△7・m7-5 など）を、CHORD_TYPES の suffix にそろえる
const SUFFIX_ALIASES = {
  '': '', M: '', maj: '', m: 'm', min: 'm', '-': 'm',
  7: '7', maj7: 'maj7', M7: 'maj7', Maj7: 'maj7', '△7': 'maj7', '△': 'maj7', ma7: 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  sus4: 'sus4', sus: 'sus4', sus2: 'sus2',
  6: '6', m6: 'm6',
  m7b5: 'm7♭5', 'm7-5': 'm7♭5', 'ø': 'm7♭5', 'ø7': 'm7♭5',
  dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', '°7': 'dim7', o7: 'dim7',
  aug: 'aug', '+': 'aug', '#5': 'aug', '+5': 'aug',
  add9: 'add9', add2: 'add9', madd9: 'm(add9)', madd2: 'm(add9)',
  '7sus4': '7sus4', '7sus': '7sus4',
  mmaj7: 'm(maj7)', mM7: 'm(maj7)', 'm△7': 'm(maj7)', minmaj7: 'm(maj7)',
  9: '9', m9: 'm9', maj9: 'maj9', M9: 'maj9',
  69: '6(9)', '6/9': '6(9)', '6add9': '6(9)',
  5: '5',
};

/** "Cmaj7" "F#m7-5" "D/F#" "Bbm" などを { root, type, bass } に変換。読めなければ null */
export function parseChordName(text) {
  const t = text.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s/g, '');
  const m = t.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g])([#b]?))?$/);
  if (!m) return null;
  const toPc = (letter, acc) => mod12(NATURAL_PCS[LETTERS.indexOf(letter.toUpperCase())] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0));
  const suffix = SUFFIX_ALIASES[m[3].replace(/[()]/g, '')];
  if (suffix === undefined) return null;
  const type = CHORD_TYPES.find((c) => c.suffix === suffix);
  const root = toPc(m[1], m[2]);
  const bass = m[4] ? toPc(m[4], m[5]) : root;
  return { root, type, bass };
}

export function midiToPitchClass(midi) {
  return mod12(midi);
}

export function frequencyToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}
