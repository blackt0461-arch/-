-- LYRIC BOOK（歌詞ノート）の保存先。Supabase の SQL Editor に全部貼って実行する。
-- 何回実行しても大丈夫（データは消えない）。新しい版が出たら、もう一度全部貼って実行する。
-- 表には直接さわれないようにし、下の lb_ 関数だけを呼べるようにする。

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lb_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_key text not null unique,
  pass_hash text not null,
  recovery_hash text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.lb_sessions (
  token text primary key,
  user_id uuid not null references public.lb_users(id) on delete cascade,
  last_used timestamptz not null default now()
);
create table if not exists public.lb_artists (
  id uuid primary key,
  user_id uuid not null references public.lb_users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.lb_songs (
  id uuid primary key,
  user_id uuid not null references public.lb_users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.lb_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.lb_users(id) on delete cascade,
  song_id uuid not null references public.lb_songs(id) on delete cascade,
  name text not null,
  mime text not null,
  duration real not null default 0,
  audio text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 自動バックアップ用（あとから足した列）
alter table public.lb_users add column if not exists changed_at timestamptz not null default now();
alter table public.lb_users add column if not exists backup_hash text;
alter table public.lb_users add column if not exists backup_at timestamptz;
alter table public.lb_users add column if not exists backup_info jsonb;
create unique index if not exists lb_users_backup on public.lb_users(backup_hash);

create index if not exists lb_artists_user on public.lb_artists(user_id);
create index if not exists lb_songs_user on public.lb_songs(user_id);
create index if not exists lb_recordings_song on public.lb_recordings(song_id);

alter table public.lb_users enable row level security;
alter table public.lb_sessions enable row level security;
alter table public.lb_artists enable row level security;
alter table public.lb_songs enable row level security;
alter table public.lb_recordings enable row level security;
revoke all on public.lb_users, public.lb_sessions, public.lb_artists, public.lb_songs, public.lb_recordings from anon, authenticated;

-- 名前は全角/半角・大文字小文字をそろえて比べる
create or replace function public.lb_name_key(p text)
returns text language sql immutable as $$ select lower(normalize(trim(p), NFKC)) $$;

-- 合言葉：まぎらわしい文字を除いた12文字（4文字ずつハイフン）
create or replace function public.lb_make_recovery()
returns text language plpgsql set search_path = public, extensions as $$
declare
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(12);
  r text := '';
begin
  for i in 0..11 loop
    r := r || substr(abc, (get_byte(b, i) % 32) + 1, 1);
    if i in (3, 7) then r := r || '-'; end if;
  end loop;
  return r;
end $$;

create or replace function public.lb_recovery_key(p text)
returns text language sql immutable as $$ select upper(regexp_replace(normalize(p, NFKC), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public.lb_new_session(uid uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(gen_random_bytes(32), 'hex');
begin
  insert into lb_sessions (token, user_id) values (tok, uid);
  return tok;
end $$;

create or replace function public.lb_who(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  update lb_sessions set last_used = now() where token = p_token returning user_id into uid;
  if uid is null then raise exception 'bad_token'; end if;
  return uid;
end $$;

-- 何か変わったら、その人の「変わった時刻」を進める（バックアップ係が見る）
create or replace function public.lb_touch(uid uuid)
returns void language sql security definer set search_path = public as $$
  update lb_users set changed_at = now() where id = uid;
$$;

create or replace function public.lb_signup(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := lb_name_key(p_username);
  rec text := lb_make_recovery();
  uid uuid;
begin
  if char_length(k) < 2 or char_length(k) > 20 then raise exception 'name_length'; end if;
  if char_length(p_password) < 4 then raise exception 'password_short'; end if;
  if exists (select 1 from lb_users where username_key = k) then raise exception 'name_taken'; end if;
  insert into lb_users (username, username_key, pass_hash, recovery_hash)
    values (normalize(trim(p_username), NFKC), k, crypt(p_password, gen_salt('bf', 10)),
            crypt(lb_recovery_key(rec), gen_salt('bf', 10)))
    returning id into uid;
  return json_build_object('token', lb_new_session(uid), 'username', normalize(trim(p_username), NFKC), 'recovery', rec);
end $$;

create or replace function public.lb_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u lb_users;
begin
  select * into u from lb_users where username_key = lb_name_key(p_username);
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'bad_login'; end if;
  return json_build_object('token', lb_new_session(u.id), 'username', u.username);
end $$;

-- 合言葉でパスワードを作り直す。ほかの端末のログインは切れる。
create or replace function public.lb_reset(p_username text, p_recovery text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u lb_users;
begin
  select * into u from lb_users where username_key = lb_name_key(p_username);
  if u.id is null or u.recovery_hash <> crypt(lb_recovery_key(p_recovery), u.recovery_hash) then raise exception 'bad_recovery'; end if;
  if char_length(p_password) < 4 then raise exception 'password_short'; end if;
  update lb_users set pass_hash = crypt(p_password, gen_salt('bf', 10)) where id = u.id;
  delete from lb_sessions where user_id = u.id;
  return json_build_object('token', lb_new_session(u.id), 'username', u.username);
end $$;

create or replace function public.lb_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from lb_sessions where token = p_token;
$$;

create or replace function public.lb_load(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token);
begin
  return json_build_object(
    'username', (select username from lb_users where id = uid),
    'settings', (select settings from lb_users where id = uid),
    'backup', (select json_build_object('enabled', backup_hash is not null, 'at', backup_at, 'info', backup_info, 'changed_at', changed_at) from lb_users where id = uid),
    'artists', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'created_at', created_at, 'updated_at', updated_at)) from lb_artists where user_id = uid), '[]'::json),
    'songs', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'created_at', created_at, 'updated_at', updated_at)) from lb_songs where user_id = uid), '[]'::json),
    'recordings', coalesce((select json_agg(json_build_object('id', id, 'song_id', song_id, 'name', name, 'mime', mime, 'duration', duration, 'size', octet_length(audio), 'created_at', created_at, 'updated_at', updated_at) order by created_at) from lb_recordings where user_id = uid), '[]'::json)
  );
end $$;

create or replace function public.lb_save_settings(p_token text, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lb_users set settings = p_settings, changed_at = now() where id = lb_who(p_token);
end $$;

create or replace function public.lb_save_artist(p_token text, p_id uuid, p_data jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token); r lb_artists;
begin
  insert into lb_artists (id, user_id, data) values (p_id, uid, p_data)
  on conflict (id) do update set data = excluded.data, updated_at = now() where lb_artists.user_id = uid
  returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  perform lb_touch(uid);
  return json_build_object('created_at', r.created_at, 'updated_at', r.updated_at);
end $$;

-- 歌手を消すと、その歌手の曲（と録音）も消える
create or replace function public.lb_delete_artist(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token);
begin
  delete from lb_songs where user_id = uid and data->>'artist_id' = p_id::text;
  delete from lb_artists where user_id = uid and id = p_id;
  perform lb_touch(uid);
end $$;

-- p_base：この端末が最後に見た「更新日時」。サーバーのほうが新しければ、別の端末で直されたので conflict を返す
drop function if exists public.lb_save_song(text, uuid, jsonb);
create or replace function public.lb_save_song(p_token text, p_id uuid, p_data jsonb, p_base timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token); r lb_songs; cur timestamptz;
begin
  select updated_at into cur from lb_songs where id = p_id and user_id = uid;
  if cur is not null and p_base is not null and cur > p_base + interval '1 second' then raise exception 'conflict'; end if;
  insert into lb_songs (id, user_id, data) values (p_id, uid, p_data)
  on conflict (id) do update set data = excluded.data, updated_at = now() where lb_songs.user_id = uid
  returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  perform lb_touch(uid);
  return json_build_object('created_at', r.created_at, 'updated_at', r.updated_at);
end $$;

create or replace function public.lb_delete_song(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from lb_songs where user_id = lb_who(p_token) and id = p_id;
  perform lb_touch(lb_who(p_token));
end $$;

create or replace function public.lb_add_recording(p_token text, p_song_id uuid, p_name text, p_mime text, p_duration real, p_audio text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token); r lb_recordings;
begin
  if not exists (select 1 from lb_songs where id = p_song_id and user_id = uid) then raise exception 'not_found'; end if;
  if octet_length(p_audio) > 8000000 then raise exception 'too_big'; end if;
  insert into lb_recordings (user_id, song_id, name, mime, duration, audio)
    values (uid, p_song_id, left(p_name, 40), p_mime, p_duration, p_audio) returning * into r;
  perform lb_touch(uid);
  return json_build_object('id', r.id, 'song_id', r.song_id, 'name', r.name, 'mime', r.mime, 'duration', r.duration, 'size', octet_length(r.audio), 'created_at', r.created_at, 'updated_at', r.updated_at);
end $$;

create or replace function public.lb_replace_recording(p_token text, p_id uuid, p_mime text, p_duration real, p_audio text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_who(p_token); r lb_recordings;
begin
  if octet_length(p_audio) > 8000000 then raise exception 'too_big'; end if;
  update lb_recordings set mime = p_mime, duration = p_duration, audio = p_audio, updated_at = now()
    where id = p_id and user_id = uid returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  perform lb_touch(uid);
  return json_build_object('id', r.id, 'song_id', r.song_id, 'name', r.name, 'mime', r.mime, 'duration', r.duration, 'size', octet_length(r.audio), 'created_at', r.created_at, 'updated_at', r.updated_at);
end $$;

create or replace function public.lb_rename_recording(p_token text, p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lb_recordings set name = left(p_name, 40), updated_at = now() where id = p_id and user_id = lb_who(p_token);
  perform lb_touch(lb_who(p_token));
end $$;

create or replace function public.lb_delete_recording(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from lb_recordings where id = p_id and user_id = lb_who(p_token);
  perform lb_touch(lb_who(p_token));
end $$;

create or replace function public.lb_get_recording(p_token text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r lb_recordings;
begin
  select * into r from lb_recordings where id = p_id and user_id = lb_who(p_token);
  if r.id is null then raise exception 'not_found'; end if;
  return json_build_object('mime', r.mime, 'audio', r.audio);
end $$;

-- ===== グーグルドライブへの自動バックアップ =====
-- アプリで「バックアップの鍵」を作る。鍵はバックアップ係（Google Apps Script）にだけ書く。
-- 新しく作ると、前の鍵は使えなくなる。
create or replace function public.lb_backup_new_key(p_token text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := lb_who(p_token); k text := encode(gen_random_bytes(24), 'hex');
begin
  update lb_users set backup_hash = encode(digest(k, 'sha256'), 'hex'), backup_at = null, backup_info = null where id = uid;
  return k;
end $$;

create or replace function public.lb_backup_who(p_key text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  select id into uid from lb_users where backup_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex');
  if uid is null then raise exception 'bad_key'; end if;
  return uid;
end $$;

create or replace function public.lb_backup_state(p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_backup_who(p_key);
begin
  return (select json_build_object('changed_at', changed_at, 'backup_at', backup_at) from lb_users where id = uid);
end $$;

create or replace function public.lb_backup_export(p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := lb_backup_who(p_key);
begin
  return json_build_object(
    'app', 'LYRIC BOOK', 'format', 1, 'exported_at', now(),
    'username', (select username from lb_users where id = uid),
    'changed_at', (select changed_at from lb_users where id = uid),
    'settings', (select settings from lb_users where id = uid),
    'artists', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'created_at', created_at, 'updated_at', updated_at)) from lb_artists where user_id = uid), '[]'::json),
    'songs', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'created_at', created_at, 'updated_at', updated_at)) from lb_songs where user_id = uid), '[]'::json),
    'recordings', coalesce((select json_agg(json_build_object('id', id, 'song_id', song_id, 'name', name, 'mime', mime, 'duration', duration, 'created_at', created_at, 'updated_at', updated_at) order by created_at) from lb_recordings where user_id = uid), '[]'::json)
  );
end $$;

create or replace function public.lb_backup_recording(p_key text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r lb_recordings;
begin
  select * into r from lb_recordings where id = p_id and user_id = lb_backup_who(p_key);
  if r.id is null then raise exception 'not_found'; end if;
  return json_build_object('mime', r.mime, 'audio', r.audio);
end $$;

create or replace function public.lb_backup_done(p_key text, p_info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lb_users set backup_at = now(), backup_info = p_info where id = lb_backup_who(p_key);
end $$;

-- 外から呼べるのは次の関数だけ
revoke all on function public.lb_who(text), public.lb_new_session(uuid), public.lb_make_recovery(), public.lb_touch(uuid), public.lb_backup_who(text) from public, anon, authenticated;
grant execute on function
  public.lb_signup(text, text), public.lb_login(text, text), public.lb_reset(text, text, text),
  public.lb_logout(text), public.lb_load(text), public.lb_save_settings(text, jsonb),
  public.lb_save_artist(text, uuid, jsonb), public.lb_delete_artist(text, uuid),
  public.lb_save_song(text, uuid, jsonb, timestamptz), public.lb_delete_song(text, uuid),
  public.lb_add_recording(text, uuid, text, text, real, text), public.lb_replace_recording(text, uuid, text, real, text),
  public.lb_rename_recording(text, uuid, text), public.lb_delete_recording(text, uuid), public.lb_get_recording(text, uuid),
  public.lb_backup_new_key(text), public.lb_backup_state(text), public.lb_backup_export(text),
  public.lb_backup_recording(text, uuid), public.lb_backup_done(text, jsonb)
to anon;
