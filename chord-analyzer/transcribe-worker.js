// 録音の解析を裏で行うワーカー（解析中も画面が固まらないように）
import { transcribe, ANALYSIS_PRESETS } from './transcribe.js';

self.onmessage = (e) => {
  const { channels, sampleRate, mode, quality = 'normal' } = e.data;
  const started = Date.now();
  try {
    const result = transcribe(channels, sampleRate, {
      mode,
      ...(ANALYSIS_PRESETS[quality] ?? {}),
      onProgress: (progress, label) => self.postMessage({ type: 'progress', progress, label }),
    });
    self.postMessage({ type: 'done', result: { ...result, seconds: (Date.now() - started) / 1000 } });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
