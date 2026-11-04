-- テスト勉強の問題集を、管理者がほかの人に渡す（コードを入れたのと同じになる）
-- 渡したコードは sr_pack_grants に残り、その人のアプリが開いた時に受け取る
create table if not exists public.sr_pack_grants (
  id bigserial primary key,
  user_id uuid not null references public.sr_users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);
alter table public.sr_pack_grants enable row level security;
revoke all on public.sr_pack_grants from anon, authenticated;

create or replace function public.sr_admin_grant_code(p_token text, p_username text, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); target uuid;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id into target from sr_users where username = p_username;
  if target is null then raise exception 'not_found'; end if;
  if char_length(coalesce(p_code, '')) not between 1 and 64 then raise exception 'bad_code'; end if;
  insert into sr_pack_grants (user_id, code) values (target, p_code) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

create or replace function public.sr_my_codes(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  return coalesce((select json_agg(code order by id) from sr_pack_grants where user_id = me), '[]'::json);
end $$;

revoke all on function public.sr_admin_grant_code(text, text, text) from public;
revoke all on function public.sr_my_codes(text) from public;
grant execute on function public.sr_admin_grant_code(text, text, text) to anon, authenticated;
grant execute on function public.sr_my_codes(text) to anon, authenticated;
