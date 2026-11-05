// 録音。声向けの軽い形（約32kbps）で録る。
const MAX_SEC = 600;

function pickMime() {
  const list = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder) return null;
  for (const m of list) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

export function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

// start() → { stop(): Promise<{blob, mime, duration}>, cancel(), elapsed() }
export async function startRecording(onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
  const mime = pickMime();
  const opts = { audioBitsPerSecond: 32000 };
  if (mime) opts.mimeType = mime;
  let rec;
  try { rec = new MediaRecorder(stream, opts); } catch (e) { rec = new MediaRecorder(stream); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const t0 = performance.now();
  let timer = setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    onTick?.(s);
    if (s >= MAX_SEC && rec.state === 'recording') rec.stop();
  }, 200);
  const done = new Promise(resolve => {
    rec.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach(t => t.stop());
      const type = rec.mimeType || mime || 'audio/webm';
      resolve({ blob: new Blob(chunks, { type }), mime: type.split(';')[0], duration: (performance.now() - t0) / 1000 });
    };
  });
  rec.start(1000);
  return {
    stop() { if (rec.state !== 'inactive') rec.stop(); return done; },
    cancel() { chunks.length = 0; if (rec.state !== 'inactive') rec.stop(); },
  };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
