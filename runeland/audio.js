// ルーンランド：音（効果音と音楽）。外の音源は使わず、その場で作る（Web Audio）
let ac = null, bgmGain = null, sfxGain = null;
const store = { get(k, d) { try { return localStorage.getItem('runeland:' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('runeland:' + k, v); } catch {} } };
export const opt = { sfx: store.get('sound', '1') === '1', bgm: store.get('bgm', '1') === '1' };
export function setOpt(k, v) { opt[k] = v; store.set(k === 'sfx' ? 'sound' : 'bgm', v ? '1' : '0'); if (k === 'bgm') { v ? bgm.start() : bgm.stop(); } }

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ac = new C();
    sfxGain = ac.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(ac.destination);
    bgmGain = ac.createGain(); bgmGain.gain.value = 0; bgmGain.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
export function unlock() { ctx(); }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function tone({ f, d = 0.1, type = 'triangle', v = 0.15, when = 0, slide = 0, out = null, attack = 0.005 }) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(out || sfxGain); o.start(t); o.stop(t + d + 0.05);
}
function noise({ d = 0.2, v = 0.1, when = 0, f = 2000, q = 1, sweep = 0, out = null }) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + when, len = Math.ceil(a.sampleRate * d), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t); bp.Q.value = q; if (sweep) bp.frequency.exponentialRampToValueAtTime(f * sweep, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(bp).connect(g).connect(out || sfxGain); s.start(t); s.stop(t + d);
}
const vib = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch {} };

export const sfx = {
  place(n = 1) { if (!opt.sfx) return; tone({ f: 520 * Math.pow(1.06, Math.min(n, 12)), d: 0.09, v: 0.18 }); vib(12); },
  undo() { if (!opt.sfx) return; tone({ f: 420, d: 0.08, slide: 0.7, v: 0.14 }); vib(8); },
  card() { if (!opt.sfx) return; noise({ d: 0.25, f: 800, sweep: 4, v: 0.12 }); tone({ f: 988, d: 0.15, type: 'sine', v: 0.1, when: 0.08 }); tone({ f: 1318, d: 0.2, type: 'sine', v: 0.08, when: 0.16 }); vib([20, 40, 20]); },
  lock() { if (!opt.sfx) return; tone({ f: 180, d: 0.15, type: 'sine', v: 0.3, slide: 0.6 }); tone({ f: 660, d: 0.1, v: 0.12, when: 0.05 }); tone({ f: 990, d: 0.18, v: 0.12, when: 0.12 }); vib(25); },
  tick(sec) { if (!opt.sfx) return; tone({ f: 880 * Math.pow(2, (10 - sec) / 12), d: 0.05, type: 'square', v: 0.05 }); if (sec <= 3) vib(30); },
  hush() { if (!opt.sfx) return; noise({ d: 0.5, f: 300, sweep: 6, v: 0.06 }); },
  dragon() { if (!opt.sfx) return; noise({ d: 0.7, f: 200, sweep: 0.5, v: 0.25, q: 0.7 }); tone({ f: 110, d: 0.6, type: 'sawtooth', v: 0.08, slide: 0.5 }); vib(60); },
  shield() { if (!opt.sfx) return; [784, 988, 1175].forEach((f, i) => tone({ f, d: 0.4, type: 'sine', v: 0.08, when: i * 0.05 })); },
  storm() { if (!opt.sfx) return; noise({ d: 0.9, f: 500, sweep: 3, v: 0.18, q: 0.5 }); },
  coin() { if (!opt.sfx) return; tone({ f: 1318, d: 0.08, type: 'square', v: 0.06 }); tone({ f: 1760, d: 0.25, type: 'square', v: 0.06, when: 0.07 }); },
  capture(k = 0) { if (!opt.sfx) return; tone({ f: mtof(72 + [0, 2, 4, 7, 9, 12, 14, 16][k % 8]), d: 0.12, v: 0.1 }); },
  lose() { if (!opt.sfx) return; tone({ f: 300, d: 0.3, type: 'sawtooth', v: 0.06, slide: 0.6 }); },
  rankUp() { if (!opt.sfx) return; [523, 659, 784, 1046].forEach((f, i) => tone({ f, d: 0.16, v: 0.1, when: i * 0.08 })); vib([40, 60, 80]); },
  fanfare() { if (!opt.sfx) return; [[523, 0], [659, .15], [784, .3], [1046, .45], [784, .75], [1046, .9]].forEach(([f, w]) => tone({ f, d: 0.3, v: 0.12, when: w })); },
  pop() { if (!opt.sfx) return; tone({ f: 700, d: 0.06, type: 'sine', v: 0.12, slide: 1.6 }); },
};

// ---- 音楽：やさしいファンタジー風の3拍子。コードと分散和音をその場で作る ----
const PROG = [[50, 'm'], [46, ''], [53, ''], [48, ''], [50, 'm'], [46, ''], [48, ''], [45, '']]; // Dm Bb F C Dm Bb C A
const chordNotes = ([r, q]) => [r, r + (q === 'm' ? 3 : 4), r + 7];
export const bgm = {
  on: false, timer: 0, bar: 0, next: 0, mood: 'calm',
  start() {
    if (!opt.bgm || this.on) return; const a = ctx(); if (!a) return;
    this.on = true; this.next = a.currentTime + 0.2; this.bar = 0;
    bgmGain.gain.cancelScheduledValues(a.currentTime); bgmGain.gain.setTargetAtTime(0.32, a.currentTime, 0.8);
    this.timer = setInterval(() => this.pump(), 150); this.pump();
  },
  stop() { if (!this.on) return; this.on = false; clearInterval(this.timer); if (ac) bgmGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); },
  setMood(m) { this.mood = m; },
  pump() {
    const a = ac; if (!a) return;
    while (this.next < a.currentTime + 0.8) { this.playBar(this.next); this.next += this.barLen(); this.bar++; }
  },
  barLen() { return 3 * 60 / (this.mood === 'tense' ? 116 : this.mood === 'end' ? 84 : 96); },
  playBar(t0) {
    const a = ac, beat = this.barLen() / 3, ch = PROG[this.bar % PROG.length], notes = chordNotes(ch), w = t0 - a.currentTime;
    // ベース
    tone({ f: mtof(ch[0] - 12), d: beat * 2.6, type: 'sine', v: 0.22, when: w, attack: 0.02, out: bgmGain });
    // やわらかい和音
    for (const n of notes) tone({ f: mtof(n + 12), d: beat * 3, type: 'triangle', v: 0.035, when: w, attack: 0.25, out: bgmGain });
    // 分散和音（8分音符6つ）
    const arp = [notes[0], notes[1], notes[2], notes[0] + 12, notes[2], notes[1]];
    arp.forEach((n, i) => tone({ f: mtof(n + 24), d: beat * 0.6, type: 'triangle', v: 0.05, when: w + i * beat / 2, out: bgmGain }));
    // ときどき笛のようなメロディ
    if (this.bar % 2 === 0) { const m = notes[(this.bar / 2) % 3] + 24 + (this.bar % 8 === 6 ? 2 : 0); tone({ f: mtof(m), d: beat * 1.8, type: 'sine', v: 0.05, when: w + beat, attack: 0.08, out: bgmGain }); }
    if (this.mood === 'tense') for (let i = 0; i < 6; i++) noise({ d: 0.04, f: 7000, v: i % 2 ? 0.012 : 0.025, when: w + i * beat / 2, out: bgmGain });
  },
};
