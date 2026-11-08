-- その24：KOTETSU WORKS アカウント（2026-11-08）
-- ・ROOMIN のアカウントとは別。KOTETSU WORKS の入口（kotetsuworks.com）の右上からログイン・登録する。
-- ・アプリのアカウントと「つなぐ」ことができる（いまは ROOMIN だけ）。つないでおくと、入口でログインするだけで ROOMIN にも入れる。
-- ・マイアプリ：持っているアプリ。ログインのないアプリは一度開くと入る。自分だけのアプリ（テスト勉強など）は管理者が渡した人だけ。
-- ・表には直接さわれない（RLS 有効・ポリシーなし）。下の関数からだけ読み書きする。パスワードは bcrypt。

create table if not exists public.kw_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_key text not null unique,
  pass_hash text not null,
  is_admin boolean not null default false,
  fail int not null default 0,
  lock_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.kw_sessions (
  token text primary key,
  user_id uuid not null references public.kw_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);
create index if not exists kw_sessions_user on public.kw_sessions (user_id);
-- 持っているアプリ
create table if not exists public.kw_apps (
  user_id uuid not null references public.kw_users(id) on delete cascade,
  app text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, app)
);
-- つないだアプリのアカウント（1つのアプリに1つ）
create table if not exists public.kw_links (
  user_id uuid not null references public.kw_users(id) on delete cascade,
  app text not null,
  target uuid not null,
  linked_at timestamptz not null default now(),
  primary key (user_id, app),
  unique (app, target)
);
alter table public.kw_users enable row level security;
alter table public.kw_sessions enable row level security;
alter table public.kw_apps enable row level security;
alter table public.kw_links enable row level security;

-- アプリの種類。public = だれでも持てる（開くとマイアプリに入る）。private = 管理者が渡した人だけ。
create or replace function public.kw_app_kind(p_app text)
returns text language sql immutable as $$
  select case
    when p_app in ('roomin', 'lyric-book', 'chord-analyzer', 'smagro-memory', 'fourier') then 'public'
    when p_app in ('test-study', 'alarm', 'class-reminder', 'roomin-beta') then 'private'
    else null end
$$;

create or replace function public.kw_who(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  update kw_sessions set last_used = now() where token = p_token returning user_id into uid;
  return uid;
end $$;

-- ログインした人の情報（名前・持っているアプリ・つないだアプリ）
create or replace function public.kw_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); u kw_users;
begin
  if me is null then raise exception 'bad_token'; end if;
  select * into u from kw_users where id = me;
  return json_build_object(
    'username', u.username, 'admin', u.is_admin,
    'apps', coalesce((select json_agg(app order by added_at) from kw_apps where user_id = me), '[]'::json),
    'links', coalesce((select json_object_agg(l.app, su.username) from kw_links l join sr_users su on su.id = l.target where l.user_id = me and l.app = 'roomin'), '{}'::json));
end $$;

create or replace function public.kw_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare k text := sr_name_key(p_username); uid uuid; tok text;
begin
  if char_length(k) < 2 or char_length(k) > 16 or trim(p_username) !~ '^[[:alnum:]_.\-ぁ-んァ-ヶー一-龠々]+$' then raise exception 'name_length'; end if;
  if char_length(p_password) < 6 then raise exception 'password_short'; end if;
  if exists (select 1 from kw_users where username_key = k) then raise exception 'name_taken'; end if;
  -- 短い時間にたくさん作らせない（全体で1時間に30人まで）
  if (select count(*) from kw_users where created_at > now() - interval '1 hour') >= 30 then raise exception 'too_many'; end if;
  insert into kw_users (username, username_key, pass_hash) values (trim(p_username), k, crypt(p_password, gen_salt('bf', 10))) returning id into uid;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into kw_sessions (token, user_id) values (tok, uid);
  return json_build_object('token', tok, 'username', trim(p_username));
end $$;

-- ログイン。5回まちがえると15分使えない。ほかの端末のログインは残す（いくつもの端末で使えるように）
create or replace function public.kw_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u kw_users; tok text;
begin
  select * into u from kw_users where username_key = sr_name_key(p_username);
  if u.id is null then raise exception 'bad_login'; end if;
  if u.lock_until is not null and u.lock_until > now() then raise exception 'too_many'; end if;
  if u.pass_hash <> crypt(p_password, u.pass_hash) then
    update kw_users set fail = fail + 1, lock_until = case when fail + 1 >= 5 then now() + interval '15 minutes' else null end where id = u.id;
    raise exception 'bad_login';
  end if;
  update kw_users set fail = 0, lock_until = null where id = u.id;
  delete from kw_sessions where user_id = u.id and last_used < now() - interval '90 days';
  tok := encode(gen_random_bytes(32), 'hex');
  insert into kw_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username);
end $$;

create or replace function public.kw_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from kw_sessions where token = p_token;
$$;

-- 開いたアプリをマイアプリに入れる（だれでも持てるアプリだけ）
create or replace function public.kw_app_add(p_token text, p_app text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  if kw_app_kind(p_app) is distinct from 'public' then raise exception 'not_allowed'; end if;
  insert into kw_apps (user_id, app) values (me, p_app) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- ROOMIN のアカウントとつなぐ（ROOMIN のユーザー名とパスワードで確かめる）。つなぐと ROOMIN の合い鍵も返す
create or replace function public.kw_link_roomin(p_token text, p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := kw_who(p_token); u sr_users; tok text; k kw_users;
begin
  if me is null then raise exception 'bad_token'; end if;
  select * into k from kw_users where id = me;
  if k.lock_until is not null and k.lock_until > now() then raise exception 'too_many'; end if;
  select * into u from sr_users where username_key = sr_name_key(p_username);
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then
    update kw_users set fail = fail + 1, lock_until = case when fail + 1 >= 5 then now() + interval '15 minutes' else null end where id = me;
    raise exception 'bad_login';
  end if;
  if exists (select 1 from kw_links where app = 'roomin' and target = u.id and user_id <> me) then raise exception 'already_linked'; end if;
  insert into kw_links (user_id, app, target) values (me, 'roomin', u.id) on conflict (user_id, app) do update set target = excluded.target, linked_at = now();
  insert into kw_apps (user_id, app) values (me, 'roomin') on conflict do nothing;
  delete from sr_sessions where user_id = u.id;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username, 'is_admin', u.is_admin);
end $$;

create or replace function public.kw_unlink(p_token text, p_app text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  delete from kw_links where user_id = me and app = p_app;
  return json_build_object('ok', true);
end $$;

-- つないだ ROOMIN に入る合い鍵をもらう（ROOMIN と同じく、ほかの端末の ROOMIN はログアウトになる）
create or replace function public.kw_roomin_session(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := kw_who(p_token); u sr_users; tok text;
begin
  if me is null then raise exception 'bad_token'; end if;
  select su.* into u from kw_links l join sr_users su on su.id = l.target where l.user_id = me and l.app = 'roomin';
  if u.id is null then raise exception 'not_linked'; end if;
  delete from sr_sessions where user_id = u.id;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username, 'is_admin', u.is_admin);
end $$;

-- 管理者：自分だけのアプリを渡す・取り上げる
create or replace function public.kw_admin_grant(p_token text, p_username text, p_app text, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); target uuid;
begin
  if not coalesce((select is_admin from kw_users where id = me), false) then raise exception 'not_admin'; end if;
  if kw_app_kind(p_app) is null then raise exception 'not_found'; end if;
  select id into target from kw_users where username_key = sr_name_key(p_username);
  if target is null then raise exception 'not_found'; end if;
  if p_on then insert into kw_apps (user_id, app) values (target, p_app) on conflict do nothing;
  else delete from kw_apps where user_id = target and app = p_app; end if;
  return json_build_object('ok', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['kw_me(text)', 'kw_signup(text, text)', 'kw_login(text, text)', 'kw_logout(text)', 'kw_app_add(text, text)', 'kw_link_roomin(text, text, text)', 'kw_unlink(text, text)', 'kw_roomin_session(text)', 'kw_admin_grant(text, text, text, boolean)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  execute 'revoke all on function public.kw_who(text) from public, anon, authenticated';
end $$;
