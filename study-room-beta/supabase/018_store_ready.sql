-- ROOMIN その18：ストアに出すための土台（1.12.0）
-- 1. 自分でアカウントを消す（sr_delete_me。アプリと Web の削除ページから）
-- 2. パスワードを忘れた時の「復元コード」（sr_recovery_make / sr_password_reset）
-- 3. 通報（要望・バグと同じ受け箱。kind = 'report'）・問題のまちがい報告（kind = 'problem'）
-- 4. ブロック（sr_block / sr_unblock / sr_block_list）。ブロックした人・された人どうしはフレンド申請できない
-- 5. よくない名前・まぎらわしい名前（運営・管理者など）では登録できない
-- 6. アプリのエラーを自動で記録（sr_log_error）・管理者が見る（sr_admin_errors）

-- ---------- 1. 自分でアカウントを消す ----------
create or replace function public.sr_delete_me(p_token text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := sr_who(p_token); u sr_users;
begin
  select * into u from sr_users where id = me;
  if u.id is null then raise exception 'bad_token'; end if;
  if u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'bad_login'; end if;
  if u.is_admin then raise exception 'cannot_delete_admin'; end if;
  delete from sr_users where id = u.id;
  return json_build_object('deleted', u.username);
end $$;
revoke all on function public.sr_delete_me(text, text) from public;
grant execute on function public.sr_delete_me(text, text) to anon, authenticated;

-- ---------- 2. 復元コード ----------
alter table public.sr_users add column if not exists recovery_hash text;
alter table public.sr_users add column if not exists recovery_fail int not null default 0;
alter table public.sr_users add column if not exists recovery_lock timestamptz;

-- 新しい復元コードを作る（前のコードは使えなくなる）。コードはこの時だけ返す（サーバーには暗号にした形だけ残る）
create or replace function public.sr_recovery_make(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := sr_who(p_token); abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; raw text := ''; b bytea := gen_random_bytes(12); i int;
begin
  if me is null then raise exception 'bad_token'; end if;
  for i in 0..11 loop raw := raw || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
  update sr_users set recovery_hash = crypt(raw, gen_salt('bf', 8)), recovery_fail = 0, recovery_lock = null where id = me;
  return json_build_object('code', substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4));
end $$;
revoke all on function public.sr_recovery_make(text) from public;
grant execute on function public.sr_recovery_make(text) to anon, authenticated;

-- 復元コードがあるか（設定画面に「作ってある」と出す）
create or replace function public.sr_recovery_status(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  return json_build_object('has', (select recovery_hash is not null from sr_users where id = me));
end $$;
revoke all on function public.sr_recovery_status(text) from public;
grant execute on function public.sr_recovery_status(text) to anon, authenticated;

-- ユーザー名＋復元コードで、新しいパスワードにする。5回まちがえると1時間使えない。使ったコードは使えなくなる
create or replace function public.sr_password_reset(p_username text, p_code text, p_new text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u sr_users; c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into u from sr_users where username_key = sr_name_key(p_username);
  if u.id is null or u.recovery_hash is null then raise exception 'bad_code'; end if;
  if u.recovery_lock is not null and u.recovery_lock > now() then raise exception 'too_many'; end if;
  if u.recovery_hash <> crypt(c, u.recovery_hash) then
    update sr_users set recovery_fail = recovery_fail + 1, recovery_lock = case when recovery_fail + 1 >= 5 then now() + interval '1 hour' else null end where id = u.id;
    raise exception 'bad_code';
  end if;
  if char_length(p_new) < 4 then raise exception 'password_short'; end if;
  update sr_users set pass_hash = crypt(p_new, gen_salt('bf', 10)), recovery_hash = null, recovery_fail = 0, recovery_lock = null where id = u.id;
  delete from sr_sessions where user_id = u.id;
  return json_build_object('ok', true, 'username', u.username);
end $$;
revoke all on function public.sr_password_reset(text, text, text) from public;
grant execute on function public.sr_password_reset(text, text, text) to anon, authenticated;

-- ---------- 3. 通報・問題のまちがい報告（要望・バグと同じ受け箱） ----------
create or replace function public.sr_feedback_send(p_token text, p_kind text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); nid bigint;
begin
  if p_kind not in ('bug', 'request', 'problem', 'report') then raise exception 'bad_kind'; end if;
  if char_length(trim(p_body)) = 0 then raise exception 'empty'; end if;
  if char_length(p_body) > 2000 then raise exception 'too_long'; end if;
  if (select count(*) from sr_feedback where user_id = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'too_many'; end if;
  insert into sr_feedback (user_id, kind, body) values (me, p_kind, trim(p_body)) returning id into nid;
  return json_build_object('id', nid);
end $$;

-- ---------- 4. ブロック ----------
create table if not exists public.sr_blocks (
  a uuid not null references public.sr_users(id) on delete cascade,  -- ブロックした人
  b uuid not null references public.sr_users(id) on delete cascade,  -- ブロックされた人
  created_at timestamptz not null default now(),
  primary key (a, b)
);
alter table public.sr_blocks enable row level security;
revoke all on public.sr_blocks from anon, authenticated;

create or replace function public.sr_block(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); other uuid;
begin
  if me is null then raise exception 'bad_token'; end if;
  select id into other from sr_users where username = p_username;
  if other is null then raise exception 'no_user'; end if;
  if other = me then raise exception 'self'; end if;
  insert into sr_blocks (a, b) values (me, other) on conflict do nothing;
  delete from sr_friends where (a = me and b = other) or (a = other and b = me);
  return json_build_object('blocked', p_username);
end $$;
create or replace function public.sr_unblock(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  delete from sr_blocks where a = me and b = (select id from sr_users where username = p_username);
  return json_build_object('ok', true);
end $$;
create or replace function public.sr_block_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  return coalesce((select json_agg(u.username order by k.created_at desc) from sr_blocks k join sr_users u on u.id = k.b where k.a = me), '[]'::json);
end $$;
revoke all on function public.sr_block(text, text), public.sr_unblock(text, text), public.sr_block_list(text) from public;
grant execute on function public.sr_block(text, text), public.sr_unblock(text, text), public.sr_block_list(text) to anon, authenticated;

-- フレンド申請：ブロックしている・されている時はできない
create or replace function public.sr_friend_request(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); other uuid;
begin
  select id into other from sr_users where username_key = sr_name_key(p_username);
  if other is null then raise exception 'no_user'; end if;
  if other = me then raise exception 'self'; end if;
  if exists (select 1 from sr_blocks where (a = me and b = other) or (a = other and b = me)) then raise exception 'blocked'; end if;
  if exists (select 1 from sr_friends where a = other and b = me) then
    update sr_friends set status = 'accepted' where a = other and b = me;
    return json_build_object('status', 'accepted');
  end if;
  insert into sr_friends (a, b) values (me, other) on conflict do nothing;
  return json_build_object('status', (select status from sr_friends where a = me and b = other));
end $$;

-- ---------- 5. 名前のチェック ----------
create or replace function public.sr_name_ng(p text)
returns boolean language sql immutable set search_path = public as $$
  select exists (select 1 from unnest(array[
    'しね','死ね','ころす','殺す','きちがい','ガイジ','ちんこ','まんこ','うんこ','せっくす','sex','fuck','shit','bitch','nigger','porn',
    '運営','管理者','管理人','公式','admin','official','roomin'
  ]) w where position(sr_name_key(w) in sr_name_key(p)) > 0)
$$;
create or replace function public.sr_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare k text := sr_name_key(p_username); uid uuid; tok text;
begin
  if char_length(k) < 2 or char_length(k) > 16 then raise exception 'name_length'; end if;
  if sr_name_ng(p_username) then raise exception 'name_ng'; end if;
  if char_length(p_password) < 4 then raise exception 'password_short'; end if;
  if exists (select 1 from sr_users where username_key = k) then raise exception 'name_taken'; end if;
  insert into sr_users (username, username_key, pass_hash)
    values (normalize(trim(p_username), NFKC), k, crypt(p_password, gen_salt('bf', 10)))
    returning id into uid;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, uid);
  return json_build_object('token', tok, 'username', normalize(trim(p_username), NFKC), 'data', '{}'::jsonb, 'updated_at', now(), 'is_admin', false);
end $$;

-- ---------- 6. エラーの自動記録 ----------
create table if not exists public.sr_errors (
  id bigserial primary key,
  user_id uuid references public.sr_users(id) on delete set null,
  version text, msg text, stack text, place text, ua text,
  created_at timestamptz not null default now()
);
create index if not exists sr_errors_time on public.sr_errors (created_at desc);
alter table public.sr_errors enable row level security;
revoke all on public.sr_errors from anon, authenticated;

create or replace function public.sr_log_error(p_token text, p_version text, p_msg text, p_stack text, p_place text, p_ua text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := case when p_token is null then null else sr_who(p_token) end;
begin
  -- 送りすぎを防ぐ：1人1時間30件まで、ログインしていない分は全部で1時間300件まで
  if me is not null and (select count(*) from sr_errors where user_id = me and created_at > now() - interval '1 hour') >= 30 then return json_build_object('ok', false); end if;
  if me is null and (select count(*) from sr_errors where user_id is null and created_at > now() - interval '1 hour') >= 300 then return json_build_object('ok', false); end if;
  insert into sr_errors (user_id, version, msg, stack, place, ua)
    values (me, left(p_version, 20), left(coalesce(p_msg, ''), 500), left(p_stack, 2000), left(p_place, 200), left(p_ua, 300));
  delete from sr_errors where created_at < now() - interval '30 days';
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false);
end $$;
revoke all on function public.sr_log_error(text, text, text, text, text, text) from public;
grant execute on function public.sr_log_error(text, text, text, text, text, text) to anon, authenticated;

-- 管理者：この7日のエラー（同じ文はまとめて数える）
create or replace function public.sr_admin_errors(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x order by x.last desc) from (
    select e.msg, max(e.version) as version, count(*) as n, count(distinct e.user_id) as users, max(e.created_at) as last,
      (array_agg(e.stack order by e.created_at desc))[1] as stack, (array_agg(e.place order by e.created_at desc))[1] as place,
      (array_agg(e.ua order by e.created_at desc))[1] as ua
    from sr_errors e where e.created_at > now() - interval '7 days' group by e.msg order by max(e.created_at) desc limit 50) x), '[]'::json);
end $$;
revoke all on function public.sr_admin_errors(text) from public;
grant execute on function public.sr_admin_errors(text) to anon, authenticated;
