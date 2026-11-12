-- LAPS（スケートラップ）：練習の記録（名前・練習メニュー・ラップの数字だけ。写真や動画は入れない）
-- 本人の決定 2026-11-12：ROOMIN と同じ Supabase に保存してよい。見られるのはチームの合い言葉を知っている人だけ。
-- team には合い言葉そのものではなく、合い言葉から作った 64 文字の印（SHA-256）を入れる。
-- 表は直接さわれない（RLS・ポリシーなし）。出し入れは下の関数だけ。
-- ROOMIN の表・関数には何もさわらない（名前はすべて skate_ で始まる）。
create table if not exists public.skate_records (
  id uuid primary key,
  team text not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default '',
  data jsonb not null
);
create index if not exists skate_records_team on public.skate_records (team, started_at desc);
alter table public.skate_records enable row level security;

create or replace function public.skate_save(p_team text, p_id uuid, p_title text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_team !~ '^[0-9a-f]{64}$' or pg_column_size(p_data) > 200000 then raise exception 'bad request'; end if;
  insert into skate_records (id, team, title, data) values (p_id, p_team, left(coalesce(p_title, ''), 100), p_data)
  on conflict (id) do update set title = excluded.title, data = excluded.data, updated_at = now()
    where skate_records.team = p_team;
end $$;

create or replace function public.skate_list(p_team text)
returns table (id uuid, started_at timestamptz, updated_at timestamptz, title text, data jsonb)
language sql stable security definer set search_path = public as $$
  select id, started_at, updated_at, title, data from skate_records
  where team = p_team order by started_at desc limit 60
$$;

create or replace function public.skate_delete(p_team text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from skate_records where id = p_id and team = p_team
$$;

revoke all on function public.skate_save(text, uuid, text, jsonb) from public;
revoke all on function public.skate_list(text) from public;
revoke all on function public.skate_delete(text, uuid) from public;
grant execute on function public.skate_save(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.skate_list(text) to anon, authenticated;
grant execute on function public.skate_delete(text, uuid) to anon, authenticated;
