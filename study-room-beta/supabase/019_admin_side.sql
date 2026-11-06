-- ROOMIN その19：管理者がサイドを変える（1.12.0・すぐ直す分）
-- 前は「その人のアプリが次に開いた時に、知らせ（MODE: のコード）を見て切りかえる」だけで、
--  ・その人が「勉強｜パズル」を押した時刻のほうが新しいと、管理者の変更が無視された
--  ・開いたままのアプリが古いサイドで保存すると、元にもどった
-- いまは、サーバーの記録にも直接書く（profile.side・profile.sideAt）。sideAt が新しいほうを、保存の時もサーバーが守る。
create or replace function public.sr_admin_set_side(p_token text, p_username text, p_side text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); target uuid; t bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  if p_side not in ('study', 'puzzle') then raise exception 'bad_code'; end if;
  select id into target from sr_users where username = p_username;
  if target is null then raise exception 'not_found'; end if;
  update sr_users set data = jsonb_set(jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{profile}', coalesce(data->'profile', '{}'::jsonb)),
      '{profile,side}', to_jsonb(p_side)), '{profile,sideAt}', to_jsonb(t))
    where id = target and data ? 'version';
  insert into sr_pack_grants (user_id, code) values (target, 'MODE:' || p_side || ':' || t) on conflict do nothing;
  return json_build_object('ok', true, 'side', p_side, 'at', t);
end $$;
revoke all on function public.sr_admin_set_side(text, text, text) from public;
grant execute on function public.sr_admin_set_side(text, text, text) to anon, authenticated;

-- 保存：サーバーのほうが新しいサイド（sideAt）を持っていたら、それを守る
create or replace function public.sr_save(p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid; t timestamptz := now(); old_r bigint; old_p jsonb; d jsonb := p_data;
begin
  select user_id into uid from sr_sessions where token = p_token;
  if uid is null then raise exception 'bad_token'; end if;
  select coalesce((data->>'restoredAt')::bigint, 0), data->'profile' into old_r, old_p from sr_users where id = uid;
  if coalesce(old_r, 0) > coalesce((p_data->>'restoredAt')::bigint, 0) then raise exception 'restored'; end if;
  if old_p ? 'sideAt' and d ? 'profile' and coalesce((old_p->>'sideAt')::bigint, 0) > coalesce((d->'profile'->>'sideAt')::bigint, 0) then
    d := jsonb_set(jsonb_set(d, '{profile,side}', old_p->'side'), '{profile,sideAt}', old_p->'sideAt');
  end if;
  update sr_users set data = d, updated_at = t where id = uid;
  update sr_sessions set last_used = t where token = p_token;
  return json_build_object('updated_at', t);
end $$;
