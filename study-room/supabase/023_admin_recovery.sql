-- ROOMIN その23：管理者が、パスワードを忘れた人の「復元コード」を作る（1.16.6・2026-11-08）
-- 本人は、ログイン画面の「パスワードを忘れた」にユーザー名とこのコードを入れて、自分で新しいパスワードを決める。
-- コードはこの時だけ返す（サーバーには暗号にした形だけ残る）。前のコードは使えなくなる。管理者はパスワードを知らない。
create or replace function public.sr_admin_recovery_make(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := sr_who(p_token); target uuid; abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; raw text := ''; b bytea := gen_random_bytes(12); i int;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id into target from sr_users where username = p_username;
  if target is null then raise exception 'not_found'; end if;
  for i in 0..11 loop raw := raw || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
  update sr_users set recovery_hash = crypt(raw, gen_salt('bf', 8)), recovery_fail = 0, recovery_lock = null where id = target;
  return json_build_object('code', substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4), 'username', p_username);
end $$;
revoke all on function public.sr_admin_recovery_make(text, text) from public;
grant execute on function public.sr_admin_recovery_make(text, text) to anon, authenticated;
