-- 管理者が、ほかの人のアカウントを消す（管理者のアカウントと自分は消せない）
-- 消すと、ログインの記録（sr_sessions）とフレンドのつながり（sr_friends）も消える。
-- お知らせ・要望・プレゼントの「書いた人」は空になる（中身は残る）
create or replace function public.sr_admin_delete_user(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); target sr_users%rowtype;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select * into target from sr_users where username = p_username;
  if not found then raise exception 'not_found'; end if;
  if target.id = me or target.is_admin then raise exception 'cannot_delete_admin'; end if;
  delete from sr_users where id = target.id;
  return json_build_object('deleted', target.username);
end $$;
revoke all on function public.sr_admin_delete_user(text, text) from public;
grant execute on function public.sr_admin_delete_user(text, text) to anon, authenticated;
