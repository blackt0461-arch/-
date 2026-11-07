// 家具・壁・床などのデータを、最初にまとめてダウンロードして端末に保存する。
// 保存先は sw.js と同じ入れ物（studyroom-assets-v1）。sw.js がそこから読むので、2回目からは通信なしで開ける。
import { ASSETS } from './assets.js';

const CACHE = 'studyroom-assets-v1';
const FLAG = 'studyroom.download';

export function downloadList() {
  const list = [];
  for (const m of Object.values(ASSETS.models)) {
    const n = 1 + Object.keys(m.inc || {}).length;
    const each = (m.mb * 1e6) / n;
    list.push({ url: m.url, size: each });
    for (const u of Object.values(m.inc || {})) list.push({ url: u, size: each });
  }
  for (const t of Object.values(ASSETS.textures)) {
    for (const k of ['map', 'normal', 'rough']) if (t[k]) list.push({ url: t[k], size: t.sizes?.[k] || 4e5 });
  }
  return list;
}
export function totalMB() {
  return Math.round(downloadList().reduce((a, b) => a + b.size, 0) / 1e6);
}
export function downloadState() {
  try { return localStorage.getItem(FLAG); } catch (e) { return null; }
}
export function setDownloadState(v) {
  try { localStorage.setItem(FLAG, v); } catch (e) { /* なし */ }
}
// まだ保存していないデータ（アップデートで増えた分など）。{ list, bytes }
export async function missing() {
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map(r => r.url));
  const list = downloadList().filter(x => !have.has(new URL(x.url, location.href).href));
  return { list, bytes: list.reduce((a, b) => a + b.size, 0) };
}
export function canDownload() { return 'caches' in window; }

// onProgress(done, total, bytesDone, bytesTotal)。stop() で中断
export function downloadAll(onProgress) {
  let stopped = false;
  const run = (async () => {
    try { await navigator.storage?.persist?.(); } catch (e) { /* なし */ }
    const cache = await caches.open(CACHE);
    const have = new Set((await cache.keys()).map(r => r.url));
    const list = downloadList().filter(x => !have.has(new URL(x.url, location.href).href));
    const total = list.length;
    const bytesTotal = list.reduce((a, b) => a + b.size, 0);
    let done = 0, bytes = 0, failed = 0, i = 0;
    const worker = async () => {
      while (!stopped && i < list.length) {
        const item = list[i++];
        try {
          if (!(await cache.match(item.url))) {
            const res = await fetch(item.url, { mode: 'cors' });
            if (res.ok) await cache.put(item.url, res);
            else failed++;
          }
        } catch (e) { failed++; }
        done++; bytes += item.size;
        onProgress && onProgress(done, total, bytes, bytesTotal);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (!stopped) setDownloadState(failed ? 'partial' : 'done');
    return { stopped, failed };
  })();
  return { promise: run, stop: () => { stopped = true; } };
}
