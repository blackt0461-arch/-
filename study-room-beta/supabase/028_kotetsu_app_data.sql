-- その28：KOTETSU WORKS アカウントごとの「アプリの持ち物」置き場（2026-11-10・スマグロ担当）
-- ・ログインしていると、どの端末でも同じ持ち物になる（いまは smagro-memory だけ）。
-- ・1人・1アプリにつき JSON を1つ。新しい方で上書きする（p_base で「前に読んだ時のまま」かを確かめる）。
-- ・表には直接さわれない（RLS 有効・ポリシーなし）。下の関数からだけ読み書きする。

create table if not exists public.kw_app_data (
  user_id uuid not null references public.kw_users(id) on delete cascade,
  app text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);
alter table public.kw_app_data enable row level security;

-- 置いてよいアプリ
create or replace function public.kw_data_app_ok(p_app text)
returns boolean language sql immutable as $$
  select p_app in ('smagro-memory')
$$;

-- 読む。まだ無いときは null
create or replace function public.kw_data_get(p_token text, p_app text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); r kw_app_data;
begin
  if me is null then raise exception 'bad_token'; end if;
  if not kw_data_app_ok(p_app) then raise exception 'not_found'; end if;
  select * into r from kw_app_data where user_id = me and app = p_app;
  if not found then return null; end if;
  return json_build_object('data', r.data, 'at', r.updated_at);
end $$;

-- 書く。p_base（前に読んだ時の at）が今のものより古いときは 'conflict'（ほかの端末が先に書いた）。
-- p_base が null なら そのまま上書き。返すのは新しい at。
create or replace function public.kw_data_put(p_token text, p_app text, p_data jsonb, p_base timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); cur timestamptz; t timestamptz := clock_timestamp();
begin
  if me is null then raise exception 'bad_token'; end if;
  if not kw_data_app_ok(p_app) then raise exception 'not_found'; end if;
  if p_data is null or pg_column_size(p_data) > 200000 then raise exception 'too_big'; end if;
  select updated_at into cur from kw_app_data where user_id = me and app = p_app for update;
  if found and p_base is not null and cur > p_base + interval '1 millisecond' then raise exception 'conflict'; end if;
  insert into kw_app_data (user_id, app, data, updated_at) values (me, p_app, p_data, t)
    on conflict (user_id, app) do update set data = excluded.data, updated_at = excluded.updated_at;
  return json_build_object('at', t);
end $$;

revoke all on function public.kw_data_get(text, text) from public;
revoke all on function public.kw_data_put(text, text, jsonb, timestamptz) from public;
grant execute on function public.kw_data_get(text, text) to anon, authenticated;
grant execute on function public.kw_data_put(text, text, jsonb, timestamptz) to anon, authenticated;
