// いどうナビ：時刻が来た通知を Web プッシュで送る（2026-11-10。route/SPEC.md「通知」）
// ・pg_cron が1分ごとに呼ぶ（設定 032）。合言葉（x-cron-key）は Vault にあり、idounavi_cron_ok で確かめる。
// ・送る鍵（VAPID）は Supabase の秘密の設定（VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）にだけ置く。
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc(name: string, body: unknown) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${name} ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const key = req.headers.get('x-cron-key') || '';
  if (!key || !(await rpc('idounavi_cron_ok', { p_key: key }))) return new Response('forbidden', { status: 403 });

  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return new Response('no_vapid', { status: 500 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'https://kotetsuworks.com/route/', pub, priv);

  const due: { id: number; title: string; body: string; tag: string; subs: any[] }[] = await rpc('idounavi_due', {}) || [];
  let sent = 0, gone = 0, failed = 0;
  for (const a of due) {
    const payload = JSON.stringify({ title: a.title, body: a.body, tag: a.tag || `a${a.id}` });
    for (const sub of a.subs || []) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 600, urgency: 'high' });
        sent++;
      } catch (e: any) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) { gone++; await rpc('idounavi_sub_gone', { p_endpoint: sub.endpoint }).catch(() => {}); }
        else { failed++; console.log('push failed', code || String(e)); }
      }
    }
  }
  return new Response(JSON.stringify({ due: due.length, sent, gone, failed }), { headers: { 'Content-Type': 'application/json' } });
});
