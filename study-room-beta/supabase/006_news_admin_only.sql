-- ROOMIN その6：管理者だけに見えるお知らせ（アップデートの確認用など）
alter table public.sr_news add column if not exists admin_only boolean not null default false;

create or replace function public.sr_news_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); adm boolean;
begin
  select coalesce(is_admin, false) into adm from sr_users where id = me;
  return coalesce((select json_agg(json_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at, 'admin_only', admin_only) order by created_at desc)
    from (select * from sr_news where not admin_only or coalesce(adm, false) order by created_at desc limit 30) t), '[]'::json);
end $$;

create or replace function public.sr_news_post2(p_token text, p_title text, p_body text, p_admin_only boolean)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); nid bigint;
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  if char_length(trim(p_title)) = 0 then raise exception 'empty'; end if;
  insert into sr_news (title, body, author, admin_only) values (trim(p_title), coalesce(p_body, ''), me, coalesce(p_admin_only, false)) returning id into nid;
  return json_build_object('id', nid);
end $$;

revoke all on function public.sr_news_post2(text, text, text, boolean) from public;
grant execute on function public.sr_news_post2(text, text, text, boolean) to anon, authenticated;
