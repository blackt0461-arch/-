-- ROOMIN その16：1人だけへのプレゼント（管理者の「補填」。1.11.2）
-- sr_gifts に「あて先」（target）を足す。target が空なら、これまでどおりみんなに届く。
-- レベルの補填は kind = 'item'、item_id = 'lv:<Lv>'（そのLvまで経験値を上げる。アプリ側で受け取る）
alter table public.sr_gifts add column if not exists target uuid references public.sr_users(id) on delete cascade;

create or replace function public.sr_gift_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', id, 'title', title, 'kind', kind, 'amount', amount, 'item_id', item_id, 'created_at', created_at) order by created_at desc)
    from (select * from sr_gifts where (expires_at is null or expires_at > now()) and (target is null or target = me) order by created_at desc limit 50) t), '[]'::json);
end $$;

create or replace function public.sr_admin_gift_user(p_token text, p_username text, p_title text, p_kind text, p_amount int, p_item text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); tid uuid; nid bigint;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id into tid from sr_users where username = p_username;
  if tid is null then raise exception 'not_found'; end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then raise exception 'empty'; end if;
  insert into sr_gifts (title, kind, amount, item_id, author, target)
    values (left(trim(p_title), 60), p_kind, greatest(1, least(99, coalesce(p_amount, 1))), nullif(p_item, ''), me, tid)
    returning id into nid;
  return json_build_object('id', nid);
end $$;
revoke all on function public.sr_admin_gift_user(text, text, text, text, int, text) from public;
grant execute on function public.sr_admin_gift_user(text, text, text, text, int, text) to anon, authenticated;
