// 録音の解析を裏で行うワーカー（解析中も画面が固まらないように）
import { transcribe, ANALYSIS_PRESETS, GENRE_PRESETS } from './transcribe.js';
import { loadAI } from './ai-loader.js';
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
    const result = transcribe(channels, sampleRate, {
      mode,
      ...(ANALYSIS_PRESETS[quality] ?? {}),
      ...(GENRE_PRESETS[genre] ?? {}),
      genre,
      ...(aiChannels ? { aiChannels } : {}),
      onProgress: (p, label) => progress(share + (1 - share) * p, label),
    });
    self.postMessage({ type: 'done', result: { ...result, seconds: (Date.now() - started) / 1000, ...(aiError ? { aiError } : {}) } });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
