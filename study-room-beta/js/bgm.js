// BGM（その場で音を作る。音のファイルはダウンロードしない）。
// 部屋の時間と天気で自動で切りかえ：朝＝オルゴール、昼＝ローファイ、くもり＝森のアンビエント、雨＝雨の部屋、夕方〜夜＝夜のエレピ、冬の夜＝暖炉
// 問題やパズルを解いている間は小さくする。アプリが裏に回ったら止める。
// 設定（この端末に保存）：studyroom.bgm = { on, vol(0〜1), track('auto' か曲名) }
import { moodNow, weatherToday } from './room3d.js';

export const TRACKS = [
  ['auto', '自動（時間と天気で）'], ['lofi', 'ローファイ・ピアノ'], ['music', '朝のオルゴール'], ['ambient', '森のアンビエント'],
  ['rain', '雨の部屋'], ['jazz', '夜のエレピ'], ['fire', '暖炉のそば'],
];
const KEY = 'studyroom.bgm';
let cfg = { on: true, vol: 0.5, track: 'auto' };
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* なし */ }
const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* なし */ } };
export const settings = () => ({ ...cfg });

let ctx = null, master = null, duckGain = null, cur = null, unlocked = false, ducked = false;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const R = (a, b) => a + Math.random() * (b - a);

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  duckGain = ctx.createGain(); duckGain.gain.value = ducked ? 0.45 : 1; duckGain.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = cfg.vol * 0.8; master.connect(duckGain);
  // やわらかい響き（かんたんなリバーブ）
  const conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  master.reverbIn = ctx.createGain();
  master.reverbIn.connect(conv); conv.connect(wet); wet.connect(master);
  return true;
}
const noiseCache = {};
function noiseBuf(sec = 2) { if (noiseCache[sec]) return noiseCache[sec]; const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (noiseCache[sec] = b); }

// 1つの音（音色ごと）
function note(bus, t, midi, dur, kind = 'piano', vel = 0.2) {
  const f = mtof(midi), g = ctx.createGain(), out = ctx.createGain();
  out.gain.value = vel; g.connect(out); out.connect(bus); out.connect(master.reverbIn);
  const oscs = [];
  const add = (type, mult, amp, det = 0) => { const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.value = f * mult; o.detune.value = det; a.gain.value = amp; o.connect(a); a.connect(g); oscs.push(o); };
  if (kind === 'piano') { add('triangle', 1, 0.7); add('sine', 2, 0.25); add('sine', 3, 0.08); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.25, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); }
  else if (kind === 'box') { add('sine', 1, 0.6); add('sine', 4.01, 0.25); add('sine', 6.3, 0.08); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); }
  else if (kind === 'epiano') { add('sine', 1, 0.8); add('sine', 2, 0.18, 4); add('sine', 1, 0.2, -6); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.35, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); }
  else if (kind === 'pad') { add('sawtooth', 1, 0.25, -7); add('sawtooth', 1, 0.25, 7); add('sine', 0.5, 0.4); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; g.disconnect(); g.connect(lp); lp.connect(out); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur); }
  else if (kind === 'bass') { add('sine', 1, 0.9); add('triangle', 2, 0.15); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur); }
  oscs.forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
}
function drum(bus, t, kind) {
  if (kind === 'kick') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32); }
  else { const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.3); const hp = ctx.createBiquadFilter(); hp.type = kind === 'hat' ? 'highpass' : 'bandpass'; hp.frequency.value = kind === 'hat' ? 7000 : 1800; const g = ctx.createGain(); g.gain.setValueAtTime(kind === 'hat' ? 0.05 : 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'hat' ? 0.05 : 0.18)); s.connect(hp); hp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.3); }
}
// ずっと鳴る音（雨・風・火・レコードのノイズ）
function bed(bus, type, level) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
  const f = ctx.createBiquadFilter(), g = ctx.createGain(); g.gain.value = level;
  let l = null;
  if (type === 'rain') { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.4; }
  if (type === 'wind') { f.type = 'lowpass'; f.frequency.value = 500; l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = 0.07; lg.gain.value = 300; l.connect(lg); lg.connect(f.frequency); l.start(); }
  if (type === 'vinyl') { f.type = 'highpass'; f.frequency.value = 3000; }
  if (type === 'fire') { f.type = 'lowpass'; f.frequency.value = 700; }
  s.connect(f); f.connect(g); g.connect(bus); s.start();
  return () => { try { s.stop(); l?.stop(); } catch (e) { /* なし */ } };
}
function crackle(bus, rate, level, band = 3000) {
  let alive = true, h = 0;
  const tick = () => { if (!alive) return; const t = ctx.currentTime + 0.02; const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.05); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(band * 0.6, band * 1.6); const g = ctx.createGain(); g.gain.setValueAtTime(R(level * 0.3, level), t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04); s.connect(f); f.connect(g); g.connect(bus); s.start(t); h = setTimeout(tick, R(0.2, 2) * 1000 / rate); };
  tick(); return () => { alive = false; clearTimeout(h); };
}
function bird(bus, t) { const o = ctx.createOscillator(), g = ctx.createGain(); const f0 = R(2600, 3800); o.frequency.setValueAtTime(f0, t); for (let k = 0; k < 4; k++) { o.frequency.linearRampToValueAtTime(f0 * R(1.1, 1.35), t + 0.05 + k * 0.11); o.frequency.linearRampToValueAtTime(f0, t + 0.1 + k * 0.11); } g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.5); o.connect(g); g.connect(bus); g.connect(master.reverbIn); o.start(t); o.stop(t + 0.55); }

// 和音の進行（MIDI番号）
const PROG = {
  lofi: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
  jazz: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 49, 52, 55]],
  rain: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]],
  ambient: [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 62], [45, 52, 57, 61]],
  music: [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]],
  fire: [[40, 47, 52], [36, 43, 48], [38, 45, 50], [35, 42, 47]],
};
const SCALE = { lofi: [69, 72, 74, 76, 79, 81], music: [72, 74, 76, 79, 81, 84, 86, 88], jazz: [65, 67, 69, 72, 74, 77], ambient: [74, 78, 81, 83, 86] };

function start(k) {
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
  const stops = []; let alive = true, bar = 0, timer = 0;
  const bpm = { lofi: 72, jazz: 66, rain: 50, ambient: 40, music: 84, fire: 40 }[k];
  const beat = 60 / bpm, barLen = beat * 4;
  let next = ctx.currentTime + 0.1;
  if (k === 'lofi') stops.push(bed(bus, 'vinyl', 0.012), crackle(bus, 2, 0.08));
  if (k === 'rain') stops.push(bed(bus, 'rain', 0.05), crackle(bus, 6, 0.05, 5000));
  if (k === 'ambient') stops.push(bed(bus, 'wind', 0.03));
  if (k === 'fire') stops.push(bed(bus, 'fire', 0.05), crackle(bus, 5, 0.25, 2200));
  const schedule = () => {
    if (!alive) return;
    if (ctx.state === 'running') while (next < ctx.currentTime + 1.5) {
      const t = Math.max(next, ctx.currentTime + 0.05), ch = PROG[k][bar % 4];
      if (k === 'lofi') {
        ch.forEach((m, i) => note(bus, t + i * 0.02, m, barLen * 1.1, 'piano', 0.06));
        note(bus, t, ch[0] - 12, barLen, 'bass', 0.16);
        for (let b = 0; b < 4; b++) { const tb = t + b * beat + (b % 2 ? 0.03 : 0); drum(bus, tb, b % 2 ? 'snare' : 'kick'); drum(bus, tb + beat / 2 + 0.04, 'hat'); drum(bus, tb, 'hat'); }
        if (Math.random() < 0.8) for (let n = 0; n < 3; n++) if (Math.random() < 0.6) note(bus, t + beat * (1 + n) + R(0, 0.15), SCALE.lofi[Math.floor(R(0, 6))], beat * 2, 'piano', 0.05);
      } else if (k === 'jazz') {
        ch.forEach((m, i) => note(bus, t + beat * (i % 2 ? 1.5 : 0) + i * 0.015, m + 12, barLen, 'epiano', 0.055));
        [0, 1, 2, 3].forEach(b => note(bus, t + b * beat, ch[0] - 12 + [0, 7, 12, 10][b], beat * 0.95, 'bass', 0.17));
        for (let b = 0; b < 4; b++) { drum(bus, t + b * beat, 'hat'); if (Math.random() < 0.5) drum(bus, t + b * beat + beat * 0.66, 'hat'); }
        if (Math.random() < 0.6) note(bus, t + beat * 2 + R(0, 0.3), SCALE.jazz[Math.floor(R(0, 6))] + 12, beat * 2, 'epiano', 0.045);
      } else if (k === 'rain' || k === 'ambient' || k === 'fire') {
        ch.forEach(m => note(bus, t, m, barLen * 1.3, 'pad', k === 'fire' ? 0.05 : 0.045));
        if (k === 'rain' && Math.random() < 0.7) note(bus, t + R(0, barLen * 0.6), ch[3] + 12 + [0, 2, 4][Math.floor(R(0, 3))], barLen, 'piano', 0.04);
        if (k === 'ambient') { if (Math.random() < 0.6) note(bus, t + R(0, barLen), SCALE.ambient[Math.floor(R(0, 5))], barLen, 'box', 0.03); if (Math.random() < 0.5) bird(bus, t + R(0, barLen)); }
      } else if (k === 'music') {
        [0, 1, 2, 3, 2, 1, 2, 3].forEach((ai, n) => { if (Math.random() < 0.9) note(bus, t + n * beat / 2, ch[ai] + 12, beat * 3, 'box', 0.07); });
        if (Math.random() < 0.7) note(bus, t + beat * 2, SCALE.music[Math.floor(R(0, 8))] + 12, beat * 2, 'box', 0.05);
        note(bus, t, ch[0] - 12, barLen * 1.2, 'pad', 0.03);
        if (Math.random() < 0.45) bird(bus, t + R(0, barLen));
      }
      next = t + barLen; bar++;
    }
    timer = setTimeout(schedule, 300);
  };
  schedule();
  return () => { alive = false; clearTimeout(timer); stops.forEach(f => f()); bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => bus.disconnect(), 3000); };
}

// 今の時間と天気に合う曲
export function autoTrack(d = new Date()) {
  const w = weatherToday(d), m = moodNow(d), mon = d.getMonth() + 1;
  if (w === 'rain') return 'rain';
  if (m === 'morning') return 'music';
  if (m === 'overcast') return 'ambient';
  if (m === 'day') return 'lofi';
  if (m === 'night' && (mon === 12 || mon <= 2)) return 'fire';
  return 'jazz';
}
const wantTrack = () => (cfg.track && cfg.track !== 'auto' ? cfg.track : autoTrack());
// 鳴らす曲を決めて、ちがえば切りかえる（ゆっくり入れかわる）
function refresh() {
  if (!cfg.on || !unlocked || document.hidden) { if (cur) { cur.stop(); cur = null; } return; }
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const k = wantTrack();
  if (cur && cur.k === k) return;
  cur?.stop();
  cur = { k, stop: start(k) };
}
export const nowPlaying = () => cur?.k || null;

// はじめて画面をさわった時に音を出せるようにする（ブラウザのきまり）
export function init() {
  const unlock = () => {
    unlocked = true;
    if (cfg.on) { if (ensure() && ctx.state !== 'running') ctx.resume().catch(() => {}); refresh(); }
    if (!ctx || ctx.state === 'running') ['pointerdown', 'touchend', 'click', 'keydown'].forEach(e => document.removeEventListener(e, unlock, true));
  };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, unlock, true));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend().catch(() => {}); } else if (cfg.on) { ctx.resume().catch(() => {}); refresh(); }
  });
  setInterval(refresh, 60e3); // 時間や天気が変わったら曲も変わる
}
export function setOn(on) { cfg.on = !!on; saveCfg(); if (on) { unlocked = true; refresh(); } else if (cur) { cur.stop(); cur = null; } }
export function setVolume(v) { cfg.vol = Math.max(0, Math.min(1, +v || 0)); saveCfg(); if (master) master.gain.setTargetAtTime(cfg.vol * 0.8, ctx.currentTime, 0.05); }
export function setTrack(k) { cfg.track = k; saveCfg(); refresh(); }
// 問題やパズルを解いている間は小さく
export function duck(on) { ducked = !!on; if (duckGain) duckGain.gain.setTargetAtTime(ducked ? 0.45 : 1, ctx.currentTime, 0.4); }
