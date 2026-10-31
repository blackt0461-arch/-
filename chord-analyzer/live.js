// マイクでのコード判定（その場で弾いた音を、1秒に約30回判定する）
// 曲の解析で確かめた方法を、少しずつ届く音にも使えるようにしたもの

import { analyzeSpectrum } from './audio.js';
import { identifyFromChroma, describeChord } from './chord-engine.js';
import { STATES, scoreStates, cosine } from './chart.js';
import { magnitudeSpectrum, predominantPitch, removeHarmonics } from './dsp.js';

/**
 * マイクのコード判定。update() に周波数分布（と直近の波形）を渡すたびに、コードの候補を返す。
 * - 倍音をしっかり取り除き（C を Cmaj7 と読み違えない）、シンプルなコードとベース音を手がかりにする
 * - 歌いながら弾いても、ビブラートで揺れる歌のメロディを追いかけて取り除く
 * - コードは急には変わらないものとして、点数に「慣性」をつける（一瞬の誤判定で表示が揺れない）
 * legacy: true にすると、以前の判定方法（比べるため）
 */
export class LiveChordTracker {
  constructor(sampleRate, fftSize, { legacy = false, smoothing = 0.2, inertia = 0.3, changePenalty = 0.03, removeVoice = true, wobbleCents = 30, bassSmoothing = 0.5, slashThreshold = 0.55, bassWeight = null } = {}) {
    Object.assign(this, { sampleRate, fftSize, legacy, smoothing, inertia, changePenalty, removeVoice, wobbleCents, bassSmoothing, slashThreshold, bassWeight });
    // ベース音の信用度：聞き取ったベースの音が、強く鳴っている音（上位3つ）に入っている割合（演奏しながら数える）
    this.bassAgree = 0.5;
    this.chroma = new Array(12).fill(0);
    this.bassVotes = new Array(12).fill(0);
    this.scores = null;
    this.pitchHistory = [];
    this.time = 0;
  }

  reset() {
    this.chroma.fill(0);
    this.bassVotes.fill(0);
    this.scores = null;
    this.pitchHistory = [];
  }

  /**
   * mags：周波数分布（雑音を差し引いたもの） / wave：直近の波形（歌の追跡用。無くてもよい）
   * dt：前回からの時間（秒） / onset：弾き始めた瞬間なら true（平均や慣性をリセットする）
   */
  update(mags, { wave = null, dt = 1 / 30, onset = false } = {}) {
    this.time += dt;
    if (onset) this.reset();
    let spectrum = mags;

    // 歌のメロディ：直近の短い波形から一番目立つ音の高さを測り、0.3秒の間に揺れていれば歌とみなして取り除く
    if (!this.legacy && this.removeVoice && wave && wave.length >= 4096) {
      const shortMags = magnitudeSpectrum(wave, wave.length - 4096, 4096, 16384);
      const { cents } = predominantPitch(shortMags, this.sampleRate / 16384);
      this.pitchHistory.push({ t: this.time, cents });
      this.pitchHistory = this.pitchHistory.filter((p) => this.time - p.t <= 0.3);
      const near = this.pitchHistory.filter((p) => Math.abs(p.cents - cents) < 50).map((p) => p.cents);
      if (near.length >= 3 && Math.max(...near) - Math.min(...near) >= this.wobbleCents) {
        spectrum = Float32Array.from(mags);
        removeHarmonics(spectrum, this.sampleRate / this.fftSize, 440 * 2 ** ((cents / 100 - 69) / 12));
      }
    }

    const { chroma, bass } = analyzeSpectrum(spectrum, this.sampleRate, this.fftSize, { harmonicResidual: 0.35 });
    const total = chroma.reduce((a, b) => a + b, 0) || 1;
    const alpha = onset ? 1 : 1 - Math.exp(-dt / this.smoothing);
    this.chroma = this.chroma.map((v, i) => v + alpha * (chroma[i] / total - v));
    // ベース音はゆっくり見る（分数コードの表示 C ↔ C/E がチラつかないように）
    const bassAlpha = this.legacy ? alpha : onset ? 1 : 1 - Math.exp(-dt / this.bassSmoothing);
    this.bassVotes = this.bassVotes.map((v, i) => v + bassAlpha * ((bass === i ? 1 : 0) - v));
    const bassMax = Math.max(...this.bassVotes);
    const smoothedBass = bassMax > 0.3 ? this.bassVotes.indexOf(bassMax) : null;
    const clearBass = bassMax > this.slashThreshold ? smoothedBass : null;

    if (this.legacy) return { candidates: identifyFromChroma(this.chroma, smoothedBass, 3), bass: smoothedBass };

    // コードの点数に慣性をつける：前の点数を少しずつ忘れながら、今の点数を足していく。
    // 別のコードに移るときは小さな減点（changePenalty）があるので、一瞬の誤判定では切り替わらない
    if (bass !== null) {
      const top3 = chroma.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
      this.bassAgree += 0.02 * ((top3.includes(bass) ? 1 : 0) - this.bassAgree);
    }
    // 低い音の聞き取りが不安定な録音・楽器では、ベースの音を手がかりにしない（Am を F と読み違えるため）
    const reliability = Math.max(0, Math.min(1, (this.bassAgree - 0.5) / 0.35));
    const weight = this.bassWeight ?? 0.1 * reliability;
    const emit = scoreStates(this.chroma, smoothedBass, { rootBonus: weight, foreignBassPenalty: weight });
    const keep = Math.exp(-dt / this.inertia);
    if (!this.scores) this.scores = emit.slice();
    else {
      const best = Math.max(...this.scores);
      this.scores = this.scores.map((s, j) => keep * Math.max(s, best - this.changePenalty) + (1 - keep) * emit[j]);
    }
    const order = this.scores.map((s, j) => j).sort((a, b) => this.scores[b] - this.scores[a]).slice(0, 3);
    const candidates = order.map((j) => {
      const st = STATES[j];
      const slash = reliability >= 0.6 && clearBass !== null && clearBass !== st.root && st.template[clearBass] ? clearBass : null;
      return {
        ...describeChord(st.root, st.type, slash),
        confidence: Math.round(Math.max(0, Math.min(1, cosine(this.chroma, st.template))) * 100),
      };
    });
    return { candidates, bass: smoothedBass };
  }
}
