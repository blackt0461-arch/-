// AI（歌声を取り除くしくみ）の部品を、スマホの中にダウンロードして保存しておく。
// 一度保存すれば、2回目からはダウンロードなしで使える。画面（ダウンロード・削除）と解析ワーカーの両方で使う。
// 使う AI：Open-Unmix UMX-HQ（歌声用・MIT ライセンス・無料公開）。動かすしくみ：ONNX Runtime Web（MIT）
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
export const AI_FILES = [
  { key: 'model', url: 'https://huggingface.co/MixDirective/open-unmix-umxhq-vocals-onnx/resolve/e06097d3193a4c3168b5ddd2a479a680b1176c16/model.onnx', size: 35623512 },
  { key: 'wasm', url: `${ORT}ort-wasm-simd-threaded.wasm`, size: 14239897 },
  { key: 'ort', url: `${ORT}ort.wasm.bundle.min.mjs`, size: 73054 },
];
export const AI_TOTAL = AI_FILES.reduce((a, f) => a + f.size, 0);
const CACHE = 'chord-ai-v1';

/** 全部の部品が保存済みか */
export async function aiReady() {
  if (typeof caches === 'undefined') return false;
  const c = await caches.open(CACHE);
  for (const f of AI_FILES) if (!(await c.match(f.url))) return false;
  return true;
}

/** ダウンロードして保存する。onProgress(受け取ったバイト数, 全体のバイト数) */
export async function downloadAI(onProgress = () => {}) {
  if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch { /* 許可されなくても続ける */ } }
  const c = await caches.open(CACHE);
  let done = 0;
  for (const f of AI_FILES) {
    if (await c.match(f.url)) { done += f.size; onProgress(done, AI_TOTAL); continue; }
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）`);
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      parts.push(value);
      got += value.length;
      onProgress(done + Math.min(got, f.size), AI_TOTAL);
    }
    const type = f.key === 'ort' ? 'text/javascript' : f.key === 'wasm' ? 'application/wasm' : 'application/octet-stream';
    await c.put(f.url, new Response(new Blob(parts, { type })));
    done += f.size;
    onProgress(done, AI_TOTAL);
  }
}

/** 保存した部品を消す */
export async function deleteAI() {
  if (typeof caches !== 'undefined') await caches.delete(CACHE);
}

/** 保存した部品から AI を起動する（解析ワーカーの中で使う）。戻り値：{ ort, session } */
export async function loadAI() {
  const c = await caches.open(CACHE);
  const get = async (key) => { const f = AI_FILES.find((x) => x.key === key); const r = await c.match(f.url); if (!r) throw new Error('AI がまだダウンロードされていません'); return r.blob(); };
  const ortUrl = URL.createObjectURL(await get('ort'));
  const ort = await import(/* webpackIgnore: true */ ortUrl);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: URL.createObjectURL(await get('wasm')) };
  const session = await ort.InferenceSession.create(new Uint8Array(await (await get('model')).arrayBuffer()), { executionProviders: ['wasm'] });
  return { ort, session };
}
