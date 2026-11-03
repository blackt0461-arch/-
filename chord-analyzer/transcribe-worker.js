// 録音の解析を裏で行うワーカー（解析中も画面が固まらないように）
import { transcribe, ANALYSIS_PRESETS, GENRE_PRESETS } from './transcribe.js';
import { loadAI, loadPitchAI } from './ai-loader.js';
import { runPitchAI } from './ai-pitch.js';
import { removeVocalsAI } from './ai-vocal.js';

self.onmessage = async (e) => {
  const { channels, sampleRate, mode, quality = 'normal', genre = 'auto', useAI = false } = e.data;
  const started = Date.now();
  const progress = (p, label) => self.postMessage({ type: 'progress', progress: p, label });
  try {
    // AI で歌声を取り除いた音を作る（歌がはっきり入っている弾き語りなどの曲だけ、解析でその音を使う）
    let aiChannels = null, aiError = null;
    const share = useAI ? 0.25 : 0;
    if (useAI) {
      try {
        progress(0, 'AI を準備しています');
        const { ort, session } = await loadAI();
        aiChannels = await removeVocalsAI(channels, sampleRate, { ort, session, onProgress: (p) => progress(share * p, 'AI で歌声を取り除いています') });
      } catch (err) {
        aiError = String(err?.message || err); // AI が使えなくても、ふつうの解析は続ける
      }
    }
    // AI で音を聞き取る（Basic Pitch）：いつ・どの高さの音が鳴ったかを聞き取って、1音ずつとコードの判定に使う。
    // AI を用意できないとき（初回で電波が無いなど）は、今までの聞き取り方だけで続ける
    let pitchAI = null, pitchError = null;
    const pitchShare = 0.15;
    const base = share;
    try {
      const { ort, session } = await loadPitchAI((got, total) => progress(base, `AI を準備しています（初回だけ・${Math.round(got / 1e6)}／${Math.round(total / 1e6)}MB）`));
      pitchAI = await runPitchAI(channels, sampleRate, { ort, session, onProgress: (p) => progress(base + pitchShare * p, 'AI で音を聞き取っています') });
    } catch (err) {
      pitchError = String(err?.message || err);
    }
    const rest = base + (pitchAI ? pitchShare : 0);
    const result = transcribe(channels, sampleRate, {
      mode,
      ...(ANALYSIS_PRESETS[quality] ?? {}),
      ...(GENRE_PRESETS[genre] ?? {}),
      genre,
      ...(aiChannels ? { aiChannels } : {}),
      ...(pitchAI ? { pitchAI } : {}),
      onProgress: (p, label) => progress(rest + (1 - rest) * p, label),
    });
    self.postMessage({ type: 'done', result: { ...result, seconds: (Date.now() - started) / 1000, ...(aiError ? { aiError } : {}), aiPitch: !!pitchAI, ...(pitchError ? { pitchError } : {}) } });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
