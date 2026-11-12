// スケートラップ：ラップをほかのスマホへリアルタイムに届ける
// Supabase Realtime の Broadcast（その場かぎりの中継。何も保存しない）を使う。
// 送るのは「名前・練習メニュー・ラップタイム」だけ。写真や動画は送らない（本人の決定 2026-11-12）。
import { RELAY_URL, RELAY_KEY } from './relay-config.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
let clientP = null;
function client() {
  if (!clientP) clientP = new Promise((res, rej) => {
    const done = () => res(window.supabase.createClient(RELAY_URL, RELAY_KEY, { auth: { persistSession: false } }));
    if (window.supabase) return done();
    const s = document.createElement('script'); s.src = LIB; s.onload = done;
    s.onerror = () => { clientP = null; rej(new Error('ネットにつながっていないため、共有できません')); };
    document.head.append(s);
  });
  return clientP;
}
// チームの合い言葉から作る印（64文字）。合い言葉そのものはどこにも送らない
export async function teamKey(pass) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('laps:' + String(pass).trim()));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const chanName = team => 'skate-lap-' + String(team).replace(/[^0-9a-f]/g, '').slice(0, 24);
// 記録（名前・練習メニュー・ラップの数字）を残す・一覧をもらう・消す。合い言葉の印が合うものだけ出し入れできる
export async function saveRecord(team, id, title, data) { const sb = await client(); const { error } = await sb.rpc('skate_save', { p_team: team, p_id: id, p_title: title, p_data: data }); if (error) throw error; }
export async function listRecords(team) { const sb = await client(); const { data, error } = await sb.rpc('skate_list', { p_team: team }); if (error) throw error; return data || []; }
export async function deleteRecord(team, id) { const sb = await client(); const { error } = await sb.rpc('skate_delete', { p_team: team, p_id: id }); if (error) throw error; }

// 撮影する側。データ量を小さくするため、送るのは
//   ・ラップが出た時の「1周分」（数十文字）
//   ・見る側が見始めた時・取りこぼした時に頼まれた「全部」（2秒に1回まで）
// だけ。何もない時は送らない。返り値 { lap, end, stop }
export async function host(code, getState, onStatus, onArm) {
  const sb = await client(), ch = sb.channel(chanName(code));
  let ok = false, lastFull = 0, pending = 0;
  const send = (event, payload) => { if (ok) ch.send({ type: 'broadcast', event, payload }).catch(() => {}); };
  const full = () => { const wait = Math.max(0, 2000 - (Date.now() - lastFull)); clearTimeout(pending); pending = setTimeout(() => { lastFull = Date.now(); send('state', getState()); }, wait); };
  ch.on('broadcast', { event: 'hello' }, full);
  ch.on('broadcast', { event: 'arm' }, p => onArm && onArm(p.payload && p.payload.i)); // 見る側が「このメニューを始める」をタップした
  ch.subscribe(st => { ok = st === 'SUBSCRIBED'; onStatus && onStatus(ok ? 'つながりました' : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? 'つなぎ直しています…' : 'つないでいます…'); if (ok) full(); });
  return { lap: d => send('lap', d), full, end: () => send('end', {}), stop: () => { clearTimeout(pending); setTimeout(() => { try { sb.removeChannel(ch); } catch {} }, 500); } };
}
// 見る側。on = { state(全部), lap(1周分), end() }。返り値 { hello（全部をもらい直す）, stop }
export async function watch(code, on, onStatus) {
  const sb = await client(), ch = sb.channel(chanName(code));
  let ok = false, got = false, retry = 0;
  const hello = () => { if (ok) ch.send({ type: 'broadcast', event: 'hello', payload: {} }).catch(() => {}); };
  ch.on('broadcast', { event: 'state' }, p => { got = true; on.state(p.payload); });
  ch.on('broadcast', { event: 'lap' }, p => on.lap(p.payload));
  ch.on('broadcast', { event: 'end' }, () => on.end && on.end());
  ch.subscribe(st => { ok = st === 'SUBSCRIBED'; onStatus && onStatus(ok ? 'つながりました。撮影側を待っています…' : st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? 'つなぎ直しています…' : 'つないでいます…'); if (ok) hello(); });
  retry = setInterval(() => { if (!got) hello(); }, 5000); // 撮影側がまだ始めていない時は、5秒ごとに声をかける
  return { hello, arm: i => { if (ok) ch.send({ type: 'broadcast', event: 'arm', payload: { i } }).catch(() => {}); return ok; }, stop: () => { clearInterval(retry); try { sb.removeChannel(ch); } catch {} } };
}
