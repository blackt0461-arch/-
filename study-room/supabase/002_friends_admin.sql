-- へやづくり勉強 その2：名前の重複チェックを強める・フレンド・管理者
-- （setup.sql のあとに1回だけ実行する）

-- 1) 名前は NFKC（全角/半角をそろえる）＋小文字で比べる
create or replace function public.sr_name_key(p text)
returns text language sql immutable as $$ select lower(normalize(trim(p), NFKC)) $$;

update public.sr_users set username_key = public.sr_name_key(username);

create or replace function public.sr_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := sr_name_key(p_username);
  uid uuid;
  tok text;
begin
  if char_length(k) < 2 or char_length(k) > 16 then raise exception 'name_length'; end if;
  if char_length(p_password) < 4 then raise exception 'password_short'; end if;
  if exists (select 1 from sr_users where username_key = k) then raise exception 'name_taken'; end if;
  insert into sr_users (username, username_key, pass_hash)
    values (normalize(trim(p_username), NFKC), k, crypt(p_password, gen_salt('bf', 10)))
    returning id into uid;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, uid);
  return json_build_object('token', tok, 'username', normalize(trim(p_username), NFKC), 'data', '{}'::jsonb, 'updated_at', now(), 'is_admin', false);
end $$;

-- 2) 管理者
alter table public.sr_users add column if not exists is_admin boolean not null default false;

create or replace function public.sr_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  u sr_users;
  tok text;
begin
  select * into u from sr_users where username_key = sr_name_key(p_username);
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'bad_login'; end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username, 'data', u.data, 'updated_at', u.updated_at, 'is_admin', u.is_admin);
end $$;

create or replace function public.sr_load(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u sr_users;
begin
  update sr_sessions set last_used = now() where token = p_token;
  select su.* into u from sr_users su join sr_sessions s on s.user_id = su.id where s.token = p_token;
  if u.id is null then raise exception 'bad_token'; end if;
  return json_build_object('username', u.username, 'data', u.data, 'updated_at', u.updated_at, 'is_admin', u.is_admin);
end $$;

-- 合い鍵から本人を出す（中で使う）
create or replace function public.sr_who(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from sr_sessions where token = p_token;
  if uid is null then raise exception 'bad_token'; end if;
  update sr_sessions set last_used = now() where token = p_token;
  return uid;
end $$;

-- 公開してよい要約（ランク・連続日数など）
create or replace function public.sr_summary(d jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xp', coalesce((d->'profile'->>'xp')::int, 0),
    'solved', coalesce((d->'profile'->>'solved')::int, 0),
    'correct', coalesce((d->'profile'->>'correct')::int, 0),
    'streak', coalesce((d->'streak'->>'count')::int, 0),
    'days', coalesce((d->'streak'->>'total')::int, 0),
    'last', d->'streak'->>'last'
  )
$$;

-- 3) フレンド（a が申請した人、b が申請された人）
create table if not exists public.sr_friends (
  a uuid not null references public.sr_users(id) on delete cascade,
  b uuid not null references public.sr_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
alter table public.sr_friends enable row level security;

create or replace function public.sr_friend_request(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); other uuid;
begin
  select id into other from sr_users where username_key = sr_name_key(p_username);
  if other is null then raise exception 'no_user'; end if;
  if other = me then raise exception 'self'; end if;
  -- 相手から申請が来ていたら、そのまま承認
  if exists (select 1 from sr_friends where a = other and b = me) then
    update sr_friends set status = 'accepted' where a = other and b = me;
    return json_build_object('status', 'accepted');
  end if;
  insert into sr_friends (a, b) values (me, other) on conflict do nothing;
  return json_build_object('status', (select status from sr_friends where a = me and b = other));
end $$;

create or replace function public.sr_friend_respond(p_token text, p_username text, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); other uuid;
begin
  select id into other from sr_users where username_key = sr_name_key(p_username);
  if p_accept then update sr_friends set status = 'accepted' where a = other and b = me;
  else delete from sr_friends where a = other and b = me; end if;
end $$;

create or replace function public.sr_friend_remove(p_token text, p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); other uuid;
begin
  select id into other from sr_users where username_key = sr_name_key(p_username);
  delete from sr_friends where (a = me and b = other) or (a = other and b = me);
end $$;

create or replace function public.sr_friend_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return coalesce((
    select json_agg(json_build_object(
      'username', u.username,
      'status', case when f.status = 'accepted' then 'friend' when f.a = me then 'outgoing' else 'incoming' end,
      'summary', sr_summary(u.data)
    ) order by f.status, u.username)
    from sr_friends f join sr_users u on u.id = case when f.a = me then f.b else f.a end
    where f.a = me or f.b = me
  ), '[]'::json);
end $$;

-- フレンド（または管理者）の家を見る
create or replace function public.sr_friend_house(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); u sr_users; admin boolean;
begin
  select * into u from sr_users where username_key = sr_name_key(p_username);
  if u.id is null then raise exception 'no_user'; end if;
  select is_admin into admin from sr_users where id = me;
  if not admin and not exists (
    select 1 from sr_friends where status = 'accepted' and ((a = me and b = u.id) or (a = u.id and b = me))
  ) then raise exception 'not_friend'; end if;
  return json_build_object('username', u.username, 'house', u.data->'house', 'summary', sr_summary(u.data));
end $$;

-- 4) 管理者：全ユーザーの一覧と記録
create or replace function public.sr_admin_users(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'username', u.username, 'created_at', u.created_at, 'updated_at', u.updated_at,
      'last_login', (select max(last_used) from sr_sessions s where s.user_id = u.id),
      'summary', sr_summary(u.data),
      'units', u.data->'subjects'->'physics'->'units'
    ) order by u.created_at)
    from sr_users u
  ), '[]'::json);
end $$;

revoke all on function public.sr_who(text) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array[
    'sr_signup(text, text)', 'sr_login(text, text)', 'sr_load(text)',
    'sr_friend_request(text, text)', 'sr_friend_respond(text, text, boolean)', 'sr_friend_remove(text, text)',
    'sr_friend_list(text)', 'sr_friend_house(text, text)', 'sr_admin_users(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- 管理者にする（本人の希望：kotetsu）
update public.sr_users set is_admin = true where username_key = 'kotetsu';
