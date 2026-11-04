-- ROOMIN その7：運営からのプレゼント（管理者が送って、みんなのプレゼントBOXに届く）
-- 受け取ったかどうかは、それぞれの記録（house.giftSeen）でおぼえる
create table if not exists public.sr_gifts (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null check (kind in ('ticket', 'ticket4', 'ticket5', 'exchange', 'shards4', 'shards5', 'gauge', 'item')),
  amount int not null default 1 check (amount between 1 and 99),
  item_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  author uuid references public.sr_users(id) on delete set null
);
alter table public.sr_gifts enable row level security;

-- 新しい順に最大50件（期限切れは出さない）
create or replace function public.sr_gift_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', id, 'title', title, 'kind', kind, 'amount', amount, 'item_id', item_id, 'created_at', created_at) order by created_at desc)
    from (select * from sr_gifts where expires_at is null or expires_at > now() order by created_at desc limit 50) t), '[]'::json);
end $$;

-- 管理者だけ送れる
create or replace function public.sr_gift_send(p_token text, p_title text, p_kind text, p_amount int, p_item text, p_days int)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); nid bigint;
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  if char_length(trim(p_title)) = 0 then raise exception 'empty'; end if;
  insert into sr_gifts (title, kind, amount, item_id, author, expires_at)
    values (trim(p_title), p_kind, greatest(1, least(99, coalesce(p_amount, 1))), nullif(p_item, ''), me,
            case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) end)
    returning id into nid;
  return json_build_object('id', nid);
end $$;

do $$ declare f text; begin
  foreach f in array array['sr_gift_list(text)', 'sr_gift_send(text, text, text, int, text, int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
