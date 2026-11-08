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
// iPhone・iPad で音が鳴らないことへの対策：
//  1) 最初のタップ（指を離したとき）で音の準備をしておく
//  2) 消音スイッチが入っていても鳴るように、「再生」として扱ってもらう
//  3) マイクを使ったあとやアプリを戻したときに止まった音の準備は、作りなおす
let ctx = null;
let silentEl = null;
function newCtx() {
  try { ctx?.close?.(); } catch (e) { /* もう閉じている */ }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}
function ac() {
  if (!ctx || ctx.state === 'closed') newCtx();
  return ctx;
}
// 0.2秒の無音の WAV を作る（消音スイッチ対策で、ふつうの「再生」として流す）
function silentWav() {
  const rate = 8000, n = 1600, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
// タップのたびに呼んでよい（すでに準備できていれば何もしない）
export function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 古い端末 */ }
  try {
    if (!silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
    }
    if (silentEl.paused) silentEl.play().catch(() => {});
  } catch (e) { /* 使えない端末 */ }
  try {
    const c = ac();
    if (c.state !== 'running') c.resume().catch(() => {});
    // 無音を1つ鳴らして、準備を終わらせる
    const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource();
    src.buffer = b; src.connect(c.destination); src.start(0);
  } catch (e) { /* 使えない端末 */ }
}
// 画面を裏に回したら止める（ロック画面などに出ないように）。戻ったら次のタップでまた準備する
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { try { silentEl?.pause(); } catch (e) { /* なし */ } }
});
// マイクを使い終わったあとに呼ぶ（次に鳴らすとき、作りなおす）
export function resetAudio() {
  try { ctx?.close?.(); } catch (e) { /* もう閉じている */ }
  ctx = null;
}
export async function playNote(midi, len = 1.6) {
  try {
    let c = ac();
    if (c.state !== 'running') { try { await c.resume(); } catch (e) { /* 次で作りなおす */ } }
    // 戻らないときは作りなおす（iPhone で「interrupted」のままになることがある）
    if (c.state !== 'running') { c = newCtx(); try { await c.resume(); } catch (e) { /* 鳴らないこともある */ } }
    const t = c.currentTime + 0.01;
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
