// スマグロ さいてきか：毎日のデータを Supabase の公開バケット smagro に置く Edge Function（2026-11-10）
// ・GitLab の予定の作業（.gitlab-ci.yml の smagro-update）だけが書ける。
//   鍵は使わず、GitLab が作業ごとに出す身分証（ID トークン）を GitLab の公開鍵で確かめる。
// ・置くもの：data.json（ページが読む）・feats.json（スクショ読みとり用）・cache.json（次の日の作業が使う）。
// ・Supabase には、Management API の functions/deploy で入れる（verify_jwt は false。Supabase のログインは使わないため）。
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const JWKS = createRemoteJWKSet(new URL('https://gitlab.com/oauth/discovery/keys'));
const PROJECT = 'kotetsu-works-group/kotetsuworks-site';
const AUD = 'smagro-upload';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(tok, JWKS, { issuer: 'https://gitlab.com', audience: AUD }));
  } catch (_e) { return json({ error: 'bad_token' }, 401); }
  if (claims.project_path !== PROJECT || !['schedule', 'web'].includes(String(claims.pipeline_source))) return json({ error: 'not_allowed' }, 403);

  let body: { data?: string; feats?: string; cache?: string };
  try { body = await req.json(); } catch (_e) { return json({ error: 'bad_body' }, 400); }
  // 中身のかんたんな確かめ（こわれたデータで ページを 壊さない）
  try {
    const d = JSON.parse(body.data || '');
    if (!d.updated || !Array.isArray(d.mem) || d.mem.length < 50 || !Array.isArray(d.equip) || d.equip.length < 50) throw new Error('shape');
    const f = JSON.parse(body.feats || '');
    if (!f.items || Object.keys(f.items).length < 50) throw new Error('feats');
    JSON.parse(body.cache || '');
  } catch (_e) { return json({ error: 'bad_data' }, 400); }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // cache・feats を先に、data を最後に置く（ページが data を読んだ時に feats がそろっているように）
  for (const [name, text, age] of [['cache.json', body.cache, 60], ['feats.json', body.feats, 300], ['data.json', body.data, 300]] as const) {
    const { error } = await sb.storage.from('smagro').upload(name, new Blob([text!], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: String(age) });
    if (error) return json({ error: 'upload', name, detail: error.message }, 500);
  }
  return json({ ok: true, updated: JSON.parse(body.data!).updated, by: claims.pipeline_source });
});
