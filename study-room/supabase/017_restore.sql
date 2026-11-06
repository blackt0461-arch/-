-- ROOMIN その17：管理者が、記録をバックアップから元に戻す（1.12.0）
-- ・sr_admin_backups：その人のバックアップの一覧（時刻・経験値・解いた数）
-- ・sr_admin_restore：えらんだバックアップに戻す。戻す前の記録も必ずバックアップに残す。
--   戻した記録には restoredAt（ミリ秒）を付ける。アプリはこれが端末の記録より新しければ、進み具合にかかわらずネットの記録を使う。
-- ・sr_save：restoredAt が古い記録（戻す前から開いていた端末）が上書きしないよう、'restored' で断る。アプリは読みなおす。
create or replace function public.sr_admin_backups(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); tid uuid;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id into tid from sr_users where username = p_username;
  if tid is null then raise exception 'not_found'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'created_at', created_at, 'xp', coalesce(xp, 0),
      'solved', coalesce((data->'profile'->>'solved')::int, 0), 'puzzle', coalesce((data->'profile'->>'puzzleClears')::int, 0)) order by created_at desc)
    from sr_user_backups where user_id = tid), '[]'::json);
end $$;
revoke all on function public.sr_admin_backups(text, text) from public;
grant execute on function public.sr_admin_backups(text, text) to anon, authenticated;

create or replace function public.sr_admin_restore(p_token text, p_username text, p_backup bigint)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); tid uuid; bdata jsonb; cur jsonb; t bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id, data into tid, cur from sr_users where username = p_username;
  if tid is null then raise exception 'not_found'; end if;
  select data into bdata from sr_user_backups where id = p_backup and user_id = tid;
  if bdata is null then raise exception 'not_found'; end if;
  if cur is not null then insert into sr_user_backups (user_id, data, xp) values (tid, cur, coalesce((cur->'profile'->>'xp')::int, 0)); end if;
  update sr_users set data = bdata || jsonb_build_object('restoredAt', t, 'savedAt', t), updated_at = now() where id = tid;
  return json_build_object('restored_at', t);
end $$;
revoke all on function public.sr_admin_restore(text, text, bigint) from public;
grant execute on function public.sr_admin_restore(text, text, bigint) to anon, authenticated;

create or replace function public.sr_save(p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; t timestamptz := now(); old_r bigint;
begin
  select user_id into uid from sr_sessions where token = p_token;
  if uid is null then raise exception 'bad_token'; end if;
  select coalesce((data->>'restoredAt')::bigint, 0) into old_r from sr_users where id = uid;
  if coalesce(old_r, 0) > coalesce((p_data->>'restoredAt')::bigint, 0) then raise exception 'restored'; end if;
  update sr_users set data = p_data, updated_at = t where id = uid;
  update sr_sessions set last_used = t where token = p_token;
  return json_build_object('updated_at', t);
end $$;
