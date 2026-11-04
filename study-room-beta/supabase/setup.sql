-- へやづくり勉強：ユーザーと記録の保存（Supabase の SQL Editor で1回だけ実行する）
-- 表には直接さわれないようにして（RLS 有効・ポリシーなし）、下の関数からだけ読み書きする。
-- パスワードは bcrypt で変換して保存。ログインすると合い鍵（token）を返し、アプリはそれを覚えておく。

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.sr_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_key text not null unique,
  pass_hash text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sr_sessions (
  token text primary key,
  user_id uuid not null references public.sr_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);

alter table public.sr_users enable row level security;
alter table public.sr_sessions enable row level security;

-- 新しく登録
create or replace function public.sr_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := lower(trim(p_username));
  uid uuid;
  tok text;
begin
  if char_length(k) < 2 or char_length(k) > 16 then raise exception 'name_length'; end if;
  if char_length(p_password) < 4 then raise exception 'password_short'; end if;
  if exists (select 1 from sr_users where username_key = k) then raise exception 'name_taken'; end if;
  insert into sr_users (username, username_key, pass_hash)
    values (trim(p_username), k, crypt(p_password, gen_salt('bf', 10)))
    returning id into uid;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, uid);
  return json_build_object('token', tok, 'username', trim(p_username), 'data', '{}'::jsonb, 'updated_at', now());
end $$;

-- ログイン
create or replace function public.sr_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  u sr_users;
  tok text;
begin
  select * into u from sr_users where username_key = lower(trim(p_username));
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'bad_login'; end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username, 'data', u.data, 'updated_at', u.updated_at);
end $$;

-- 記録を読む
create or replace function public.sr_load(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u sr_users;
begin
  update sr_sessions set last_used = now() where token = p_token;
  select su.* into u from sr_users su join sr_sessions s on s.user_id = su.id where s.token = p_token;
  if u.id is null then raise exception 'bad_token'; end if;
  return json_build_object('username', u.username, 'data', u.data, 'updated_at', u.updated_at);
end $$;

-- 記録を保存する
create or replace function public.sr_save(p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; t timestamptz := now();
begin
  select user_id into uid from sr_sessions where token = p_token;
  if uid is null then raise exception 'bad_token'; end if;
  update sr_users set data = p_data, updated_at = t where id = uid;
  update sr_sessions set last_used = t where token = p_token;
  return json_build_object('updated_at', t);
end $$;

-- ログアウト
create or replace function public.sr_logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from sr_sessions where token = p_token;
$$;

revoke all on function public.sr_signup(text, text) from public;
revoke all on function public.sr_login(text, text) from public;
revoke all on function public.sr_load(text) from public;
revoke all on function public.sr_save(text, jsonb) from public;
revoke all on function public.sr_logout(text) from public;
grant execute on function public.sr_signup(text, text) to anon, authenticated;
grant execute on function public.sr_login(text, text) to anon, authenticated;
grant execute on function public.sr_load(text) to anon, authenticated;
grant execute on function public.sr_save(text, jsonb) to anon, authenticated;
grant execute on function public.sr_logout(text) to anon, authenticated;
