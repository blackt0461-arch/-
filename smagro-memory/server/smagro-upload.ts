// スマグロ さいてきか：毎日のデータを Supabase の公開バケット smagro に置く Edge Function（2026-11-10）
// ・毎朝の Claude の予定（kotetsuworks-site の環境）だけが書ける。
//   合言葉は表 smagro_upload_key（study-room-beta/supabase/029。外からは読めない）にだけ置き、ヘッダー X-Smagro-Key で受け取る。
//   はじめは GitLab の ID トークンで確かめていたが、GameWith が GitLab からの読み取りを断る（403）のでやめた。
// ・置くもの：data.json（ページが読む）・feats.json（スクショ読みとり用）・cache.json（次の日の作業が使う）。
// ・Supabase には、Management API の functions/deploy で入れる（verify_jwt は false）。
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const got = req.headers.get('X-Smagro-Key') || '';
  const { data: row } = await sb.from('smagro_upload_key').select('key').eq('id', 1).maybeSingle();
  if (!row?.key || !got || !same(got, row.key)) return json({ error: 'bad_key' }, 401);

  // 1回に 1ファイル。本文は gzip（大きいと 受け取り口の手前で 止まるため。0.9MB で 止まった 2026-11-10）
  const name = req.headers.get('X-Smagro-File') || '';
  if (!['data', 'feats', 'cache'].includes(name)) return json({ error: 'bad_file' }, 400);
  let text: string;
  try { text = await new Response(req.body!.pipeThrough(new DecompressionStream('gzip'))).text(); } catch (_e) { return json({ error: 'bad_body' }, 400); }
  // 中身のかんたんな確かめ（こわれたデータで ページを 壊さない）
  let updated = '';
  try {
    const d = JSON.parse(text);
    if (name === 'data') { if (!d.updated || !Array.isArray(d.mem) || d.mem.length < 50 || !Array.isArray(d.equip) || d.equip.length < 50) throw new Error('shape'); updated = d.updated; }
    if (name === 'feats' && (!d.items || Object.keys(d.items).length < 50)) throw new Error('feats');
  } catch (_e) { return json({ error: 'bad_data' }, 400); }
  // 送る側は cache → feats → data の順に送る（ページが data を読んだ時に feats がそろっているように）
  const { error } = await sb.storage.from('smagro').upload(name + '.json', new Blob([text], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: name === 'cache' ? '60' : '300' });
  if (error) return json({ error: 'upload', name, detail: error.message }, 500);
  return json({ ok: true, name, updated });
});
