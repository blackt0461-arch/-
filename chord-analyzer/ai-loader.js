// AI の部品を、スマホの中にダウンロードして保存しておく。
// 一度保存すれば、2回目からはダウンロードなしで使える。画面（ダウンロード・削除）と解析ワーカーの両方で使う。
// 使う AI：
//   - 音の聞き取り：Spotify Basic Pitch（Apache 2.0・無料公開）。とても小さい（0.2MB）のでアプリに同梱（models/basic-pitch.onnx）
//   - 歌声を取り除く：Open-Unmix UMX-HQ（歌声用・MIT ライセンス・無料公開）。大きいので「AI をダウンロード」で入れる
// 動かすしくみ：ONNX Runtime Web（MIT）。どちらの AI もこれで動かす（約 14MB・初回だけダウンロード）
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
export const AI_FILES = [
  { key: 'model', url: 'https://huggingface.co/MixDirective/open-unmix-umxhq-vocals-onnx/resolve/e06097d3193a4c3168b5ddd2a479a680b1176c16/model.onnx', size: 35623512 },
  { key: 'wasm', url: `${ORT}ort-wasm-simd-threaded.wasm`, size: 14239897 },
  { key: 'ort', url: `${ORT}ort.wasm.bundle.min.mjs`, size: 73054 },
];
export const AI_TOTAL = AI_FILES.reduce((a, f) => a + f.size, 0);
const RUNTIME_FILES = AI_FILES.filter((f) => f.key !== 'model');
export const RUNTIME_TOTAL = RUNTIME_FILES.reduce((a, f) => a + f.size, 0);
export const PITCH_MODEL_URL = new URL('./models/basic-pitch.onnx', import.meta.url).href;
const CACHE = 'chord-ai-v1';

async function hasAll(files) {
  if (typeof caches === 'undefined') return false;
  const c = await caches.open(CACHE);
  for (const f of files) if (!(await c.match(f.url))) return false;
  return true;
}

/** 全部の部品（歌声を取り除く AI も含む）が保存済みか */
export const aiReady = () => hasAll(AI_FILES);
/** AI を動かすしくみ（音の聞き取りに必要な分）が保存済みか */
export const runtimeReady = () => hasAll(RUNTIME_FILES);

async function download(files, onProgress) {
  if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch { /* 許可されなくても続ける */ } }
  const total = files.reduce((a, f) => a + f.size, 0);
  const c = await caches.open(CACHE);
  let done = 0;
  for (const f of files) {
    if (await c.match(f.url)) { done += f.size; onProgress(done, total); continue; }
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
      onProgress(done + Math.min(got, f.size), total);
    }
    const type = f.key === 'ort' ? 'text/javascript' : f.key === 'wasm' ? 'application/wasm' : 'application/octet-stream';
    await c.put(f.url, new Response(new Blob(parts, { type })));
    done += f.size;
    onProgress(done, total);
  }
}

/** ダウンロードして保存する。onProgress(受け取ったバイト数, 全体のバイト数) */
export const downloadAI = (onProgress = () => {}) => download(AI_FILES, onProgress);

/** 保存した部品を消す（音の聞き取りに使うしくみも消える。次の解析でまた自動でダウンロードする） */
export async function deleteAI() {
  if (typeof caches !== 'undefined') await caches.delete(CACHE);
}

let ortPromise = null;
async function getFile(key) {
  const c = await caches.open(CACHE);
  const f = AI_FILES.find((x) => x.key === key);
  const r = await c.match(f.url);
  if (!r) throw new Error('AI がまだダウンロードされていません');
  return r.blob();
}
/** 保存した部品から、AI を動かすしくみ（ONNX Runtime）を起動する */
function loadRuntime() {
  ortPromise ??= (async () => {
    const ort = await import(/* webpackIgnore: true */ URL.createObjectURL(await getFile('ort')));
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: URL.createObjectURL(await getFile('wasm')) };
    return ort;
  })();
  ortPromise.catch(() => { ortPromise = null; });
  return ortPromise;
}

/** 保存した部品から歌声を取り除く AI を起動する（解析ワーカーの中で使う）。戻り値：{ ort, session } */
export async function loadAI() {
  const ort = await loadRuntime();
  const session = await ort.InferenceSession.create(new Uint8Array(await (await getFile('model')).arrayBuffer()), { executionProviders: ['wasm'] });
  return { ort, session };
}

/**
 * 音を聞き取る AI を起動する（解析ワーカーの中で使う）。動かすしくみがまだ無ければ、ここでダウンロードする（初回だけ・約 14MB）。
 * 電波が無いなどで用意できなければエラーになる（呼ぶ側は、今までの聞き取り方で続ける）。戻り値：{ ort, session }
 */
export async function loadPitchAI(onProgress = () => {}) {
  if (!(await runtimeReady())) await download(RUNTIME_FILES, onProgress);
  const ort = await loadRuntime();
  const res = await fetch(PITCH_MODEL_URL);
  if (!res.ok) throw new Error(`音を聞き取る AI を読み込めませんでした（${res.status}）`);
  const session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'] });
  return { ort, session };
}
