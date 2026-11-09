// スケートラップ：自動で回る台（ESP32＋サーボ）と Bluetooth でつなぐ
// 台のプログラムは tools/stand/stand.ino。iPhone は「Bluefy」ブラウザで開くとつながる（Safari はつなげない）。
// 送るもの：回る速さ（度/秒 ×10、符号つき 2バイト）。0.5 秒届かないと台は止まる。
export const SERVICE = '6b1f0001-5c1e-4b8e-9a51-7a3e2c0d5ab1';
export const SPEED = '6b1f0002-5c1e-4b8e-9a51-7a3e2c0d5ab1';
export const ANGLE = '6b1f0003-5c1e-4b8e-9a51-7a3e2c0d5ab1'; // 台の向き（読むだけ・度×10）

const st = { dev: null, ch: null, busy: false, last: 0, lastV: null };
export const canUse = () => !!navigator.bluetooth;
export const connected = () => !!(st.dev && st.dev.gatt.connected && st.ch);
export async function connect(onLost) {
  if (!navigator.bluetooth) throw new Error('このブラウザは台につなげません（iPhone は Bluefy で開いてください）');
  const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
  dev.addEventListener('gattserverdisconnected', () => { st.ch = null; onLost && onLost(); });
  const srv = await (await dev.gatt.connect()).getPrimaryService(SERVICE);
  st.dev = dev; st.ch = await srv.getCharacteristic(SPEED);
  return dev.name || '台';
}
// 回る速さ（度/秒、右が＋）。送りすぎないよう 0.1 秒に1回まで
export async function setSpeed(dps, force = false) {
  if (!connected() || st.busy) return;
  const now = performance.now(), v = Math.round(Math.max(-3000, Math.min(3000, dps * 10)));
  if (!force && now - st.last < 100 && v === st.lastV) return;
  if (!force && now - st.last < 100) return;
  st.busy = true; st.last = now; st.lastV = v;
  const buf = new DataView(new ArrayBuffer(2)); buf.setInt16(0, v, true);
  try { await st.ch.writeValueWithoutResponse(buf.buffer); } catch { try { await st.ch.writeValue(buf.buffer); } catch {} }
  st.busy = false;
}
export async function stop() { await setSpeed(0, true); }
export function disconnect() { try { st.dev && st.dev.gatt.disconnect(); } catch {} st.ch = null; }

// ---------- どちらに向けるかを決める ----------
// target：{x（いまのコマでの横位置 0〜1）, vx（基準の座標での横の速さ /秒）}。fov：画面の横の角度（度）
// 返り値：回る速さ（度/秒）。まん中に近い時は 0（細かく揺れないように）
export function aimSpeed(target, fov = 65) {
  if (!target) return 0;
  const ex = target.x - 0.5;
  const follow = (target.vx || 0) * fov;          // 人の動きに合わせる分
  const fix = Math.abs(ex) < 0.05 ? 0 : ex * fov * 1.6; // ずれを直す分
  return Math.max(-200, Math.min(200, follow + fix));
}
