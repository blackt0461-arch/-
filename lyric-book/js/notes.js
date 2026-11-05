// 音の高さ（カラオケの呼び方）と、音を鳴らす部分。
// hiA = A4 = 440Hz。A から上がるごとに lowlow → low → mid1 → mid2 → hi → hihi → hihihi。
const LETTERS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const PREFIX = ['lowlow', 'low', 'mid1', 'mid2', 'hi', 'hihi', 'hihihi'];
const DOREMI = { C: 'ド', 'C#': 'ド#', D: 'レ', 'D#': 'レ#', E: 'ミ', F: 'ファ', 'F#': 'ファ#', G: 'ソ', 'G#': 'ソ#', A: 'ラ', 'A#': 'ラ#', B: 'シ' };

export const NOTE_MIN = 36; // C2
export const NOTE_MAX = 84; // C6

export function noteName(midi) {
  if (midi == null || midi === '') return '';
  const n = midi - 21;
  return PREFIX[Math.floor(n / 12)] + LETTERS[((n % 12) + 12) % 12];
}
export function doremi(midi) {
  return DOREMI[LETTERS[((midi - 21) % 12 + 12) % 12]];
}
export function isBlack(midi) { return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12); }
export function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// キー
export const KEYS = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];
export function keyLabel(k) { return k || ''; }
// 原キーを shift 半音ずらしたキー名（"Am" のような短調も）
export function shiftKey(k, shift) {
  if (!k) return '';
  const minor = k.endsWith('m');
  const base = minor ? k.slice(0, -1) : k;
  const i = KEYS.indexOf(base);
  if (i < 0) return '';
  return KEYS[(((i + shift) % 12) + 12) % 12] + (minor ? 'm' : '');
}

// ---- 音を鳴らす（ピアノっぽい音） ----
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function playNote(midi, len = 1.6) {
  try {
    const c = ac();
    const t = c.currentTime;
    const f = freq(midi);
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.32, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.12, t + 0.35);
    out.gain.exponentialRampToValueAtTime(0.0008, t + len);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(4000, f * 3), t + 0.6);
    out.connect(lp); lp.connect(c.destination);
    [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.06, 'sine']].forEach(([h, g, type]) => {
      const o = c.createOscillator(); const og = c.createGain();
      o.type = type; o.frequency.value = f * h; og.gain.value = g;
      o.connect(og); og.connect(out); o.start(t); o.stop(t + len + 0.1);
    });
  } catch (e) { /* 音が出せない端末では何もしない */ }
}
