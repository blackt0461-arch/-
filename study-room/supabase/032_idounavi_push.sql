-- その32：いどうナビ（route/）の通知（2026-11-10・いどうナビ担当・本人の OK ずみ）
-- ・アプリが「通知の宛先（Web プッシュの購読）」と「送る予定（出発の10分前・2分前、乗りかえ・降りる2分前）」を置く。
-- ・1分ごとに pg_cron が Edge Function route-push を呼び、時刻が来た通知を送る。
-- ・表には直接さわれない（RLS 有効・ポリシーなし）。アプリは KOTETSU WORKS のログイン（kw_who）つきの関数からだけ書く。
-- ・route-push を呼ぶ合言葉は Vault（idounavi_cron_key）にだけ置く（値は DB の中で作る。コード・記録に書かない）。

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.idounavi_push_subs (
  endpoint text primary key,
  user_id uuid not null references public.kw_users(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.idounavi_push_subs enable row level security;
revoke all on public.idounavi_push_subs from anon, authenticated;

create table if not exists public.idounavi_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.kw_users(id) on delete cascade,
  at timestamptz not null,
  title text not null,
  body text not null default '',
  tag text not null default '',
  sent_at timestamptz
);
create index if not exists idounavi_alerts_due on public.idounavi_alerts (at) where sent_at is null;
alter table public.idounavi_alerts enable row level security;
revoke all on public.idounavi_alerts from anon, authenticated;

-- 宛先を登録する（同じ宛先なら持ち主と中身を新しくする）
create or replace function public.idounavi_push_sub(p_token text, p_sub jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); ep text := p_sub->>'endpoint';
begin
  if me is null then raise exception 'bad_token'; end if;
  if ep is null or ep !~ '^https://' or length(ep) > 1000 or pg_column_size(p_sub) > 4000 then raise exception 'bad_sub'; end if;
  insert into idounavi_push_subs (endpoint, user_id, sub) values (ep, me, p_sub)
    on conflict (endpoint) do update set user_id = excluded.user_id, sub = excluded.sub;
  return json_build_object('ok', true);
end $$;

-- 宛先をはずす
create or replace function public.idounavi_push_off(p_token text, p_endpoint text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  delete from idounavi_push_subs where endpoint = p_endpoint and user_id = me;
  return json_build_object('ok', true);
end $$;

-- 送る予定を入れかえる（まだ送っていない、これから先の分だけ。3日先まで・300件まで）
create or replace function public.idounavi_push_plan(p_token text, p_alerts jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); n int;
begin
  if me is null then raise exception 'bad_token'; end if;
  if jsonb_typeof(p_alerts) <> 'array' or jsonb_array_length(p_alerts) > 300 then raise exception 'too_big'; end if;
  delete from idounavi_alerts where user_id = me and sent_at is null;
  insert into idounavi_alerts (user_id, at, title, body, tag)
    select me, (a->>'at')::timestamptz, left(a->>'title', 120), left(coalesce(a->>'body', ''), 300), left(coalesce(a->>'tag', ''), 80)
    from jsonb_array_elements(p_alerts) a
    where (a->>'at')::timestamptz between now() - interval '1 minute' and now() + interval '3 days';
  get diagnostics n = row_count;
  -- 送ったものは2日で消す
  delete from idounavi_alerts where user_id = me and sent_at < now() - interval '2 days';
  return json_build_object('ok', true, 'n', n);
end $$;

revoke all on function public.idounavi_push_sub(text, jsonb) from public;
revoke all on function public.idounavi_push_off(text, text) from public;
revoke all on function public.idounavi_push_plan(text, jsonb) from public;
grant execute on function public.idounavi_push_sub(text, jsonb) to anon, authenticated;
grant execute on function public.idounavi_push_off(text, text) to anon, authenticated;
grant execute on function public.idounavi_push_plan(text, jsonb) to anon, authenticated;

-- ここから下は route-push（service_role）だけが使う
create or replace function public.idounavi_cron_ok(p_key text)
returns boolean language sql security definer set search_path = public, vault as $$
  select coalesce((select decrypted_secret = p_key from vault.decrypted_secrets where name = 'idounavi_cron_key'), false)
$$;

-- 時刻が来た通知を取り出して「送った」にする（15分以上おくれたものは送らない）
create or replace function public.idounavi_due()
returns table (id bigint, title text, body text, tag text, subs jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with d as (
    update idounavi_alerts a set sent_at = now()
    where a.sent_at is null and a.at <= now()
    returning a.id, a.user_id, a.at, a.title, a.body, a.tag
  )
  select d.id, d.title, d.body, d.tag,
         coalesce((select jsonb_agg(s.sub) from idounavi_push_subs s where s.user_id = d.user_id), '[]'::jsonb)
  from d where d.at > now() - interval '15 minutes';
end $$;

create or replace function public.idounavi_sub_gone(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from idounavi_push_subs where endpoint = p_endpoint
$$;

revoke all on function public.idounavi_cron_ok(text) from public, anon, authenticated;
revoke all on function public.idounavi_due() from public, anon, authenticated;
revoke all on function public.idounavi_sub_gone(text) from public, anon, authenticated;
grant execute on function public.idounavi_cron_ok(text) to service_role;
grant execute on function public.idounavi_due() to service_role;
grant execute on function public.idounavi_sub_gone(text) to service_role;

-- 合言葉（DB の中で作る。すでにあれば作らない）
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'idounavi_cron_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'idounavi_cron_key', 'いどうナビ：route-push を呼ぶ合言葉');
  end if;
end $$;

-- 1分ごとに route-push を呼ぶ
select cron.unschedule('idounavi-push') where exists (select 1 from cron.job where jobname = 'idounavi-push');
select cron.schedule('idounavi-push', '* * * * *', $cron$
  select net.http_post(
    url := 'https://zmteazudhtnzvfvmndqn.supabase.co/functions/v1/route-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'idounavi_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) where exists (select 1 from public.idounavi_alerts where sent_at is null and at <= now())
$cron$);
