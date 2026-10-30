// 録音の解析を裏で行うワーカー（解析中も画面が固まらないように）
import { transcribe } from './transcribe.js';

self.onmessage = (e) => {
  const { channels, sampleRate, mode } = e.data;
  try {
    const result = transcribe(channels, sampleRate, {
      mode,
      onProgress: (progress, label) => self.postMessage({ type: 'progress', progress, label }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
