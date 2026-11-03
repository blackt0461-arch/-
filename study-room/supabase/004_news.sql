-- ROOMIN その4：お知らせ（管理者が書いて、みんなが読む）
create table if not exists public.sr_news (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  author uuid references public.sr_users(id) on delete set null
);
alter table public.sr_news enable row level security;

-- 新しい順に最大30件
create or replace function public.sr_news_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at) order by created_at desc)
    from (select * from sr_news order by created_at desc limit 30) t), '[]'::json);
end $$;

-- 管理者だけ書ける
create or replace function public.sr_news_post(p_token text, p_title text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); nid bigint;
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  if char_length(trim(p_title)) = 0 then raise exception 'empty'; end if;
  insert into sr_news (title, body, author) values (trim(p_title), coalesce(p_body, ''), me) returning id into nid;
  return json_build_object('id', nid);
end $$;

-- 管理者だけ消せる
create or replace function public.sr_news_delete(p_token text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  delete from sr_news where id = p_id;
end $$;

do $$ declare f text; begin
  foreach f in array array['sr_news_list(text)', 'sr_news_post(text, text, text)', 'sr_news_delete(text, bigint)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
