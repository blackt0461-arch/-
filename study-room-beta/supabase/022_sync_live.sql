-- ROOMIN その22：前の Supabase に直接入れていた直し（設定記録に残っていなかった分）を、そのまま写す。2026-11-07 の引っ越しで作成。
CREATE OR REPLACE FUNCTION public.sr_admin_delete_user(p_token text, p_username text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := sr_who(p_token); target sr_users%rowtype;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select * into target from sr_users where username = p_username;
  if not found then raise exception 'not_found'; end if;
  if target.id = me or target.is_admin then raise exception 'cannot_delete_admin'; end if;
  delete from sr_users where id = target.id;
  return json_build_object('deleted', target.username);
end $function$;
revoke all on function public.sr_admin_delete_user(text, text) from public;
grant execute on function public.sr_admin_delete_user(text, text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_feedback_done(p_token text, p_id bigint, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := sr_who(p_token);
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  update sr_feedback set done = p_done where id = p_id;
end $function$;
revoke all on function public.sr_feedback_done(text, bigint, boolean) from public;
grant execute on function public.sr_feedback_done(text, bigint, boolean) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_feedback_list(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := sr_who(p_token);
begin
  if not (select is_admin from sr_users where id = me) then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(json_build_object('id', f.id, 'kind', f.kind, 'body', f.body, 'created_at', f.created_at, 'done', f.done, 'username', u.username) order by f.done, f.created_at desc)
    from (select * from sr_feedback order by created_at desc limit 200) f left join sr_users u on u.id = f.user_id), '[]'::json);
end $function$;
revoke all on function public.sr_feedback_list(text) from public;
grant execute on function public.sr_feedback_list(text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_log_error(p_token text, p_version text, p_msg text, p_stack text, p_place text, p_ua text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := case when p_token is null then null else sr_who(p_token) end;
begin
  if me is not null and (select count(*) from sr_errors where user_id = me and created_at > now() - interval '1 hour') >= 30 then return json_build_object('ok', false); end if;
  if me is null and (select count(*) from sr_errors where user_id is null and created_at > now() - interval '1 hour') >= 300 then return json_build_object('ok', false); end if;
  insert into sr_errors (user_id, version, msg, stack, place, ua)
    values (me, left(p_version, 20), left(coalesce(p_msg, ''), 500), left(p_stack, 2000), left(p_place, 200), left(p_ua, 300));
  delete from sr_errors where created_at < now() - interval '30 days';
  return json_build_object('ok', true);
exception when others then
  return json_build_object('ok', false);
end $function$;
revoke all on function public.sr_log_error(text, text, text, text, text, text) from public;
grant execute on function public.sr_log_error(text, text, text, text, text, text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_login(p_username text, p_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  u sr_users;
  tok text;
begin
  select * into u from sr_users where username_key = sr_name_key(p_username);
  if u.id is null or u.pass_hash <> crypt(p_password, u.pass_hash) then raise exception 'bad_login'; end if;
  delete from sr_sessions where user_id = u.id;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into sr_sessions (token, user_id) values (tok, u.id);
  return json_build_object('token', tok, 'username', u.username, 'data', u.data, 'updated_at', u.updated_at, 'is_admin', u.is_admin);
end $function$;
revoke all on function public.sr_login(text, text) from public;
grant execute on function public.sr_login(text, text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_logout(p_token text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  delete from sr_sessions where token = p_token;
$function$;
revoke all on function public.sr_logout(text) from public;
grant execute on function public.sr_logout(text) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.sr_ping(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from sr_sessions where token = p_token) then raise exception 'bad_token'; end if;
  return true;
end $function$;
revoke all on function public.sr_ping(text) from public;
grant execute on function public.sr_ping(text) to anon, authenticated;

