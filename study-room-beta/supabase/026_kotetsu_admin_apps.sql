-- その26：管理者用のアプリ（ROOMIN テスト版など）は、管理者のマイアプリに、ふつうのアプリと同じように出す（2026-11-08）
create or replace function public.kw_app_kind(p_app text)
returns text language sql immutable as $$
  select case
    when p_app in ('roomin', 'lyric-book', 'chord-analyzer', 'smagro-memory', 'fourier') then 'public'
    when p_app in ('test-study', 'alarm', 'class-reminder') then 'private'
    when p_app in ('roomin-beta') then 'admin'
    else null end
$$;

create or replace function public.kw_private_info(p_app text)
returns json language sql immutable as $$
  select case p_app
    when 'test-study' then json_build_object('id', p_app, 'name', 'テスト勉強', 'desc', '大学の中間・期末テストの勉強', 'href', 'test-study/', 'icon', 'test-study/icon-192.png', 'cat', '勉強')
    when 'class-reminder' then json_build_object('id', p_app, 'name', '授業リマインダー', 'desc', '課題の締切・テスト・出席を LINE でお知らせ', 'href', 'class-reminder', 'ph', '授', 'color', '#1fd469,#06a94d', 'cat', '勉強')
    when 'alarm' then json_build_object('id', p_app, 'name', '目覚まし管理', 'desc', '起きる時間を決めて、iPhone のアラームに入れる', 'href', 'alarm/', 'icon', 'alarm/icon-192.png', 'cat', 'くらし')
    when 'roomin-beta' then json_build_object('id', p_app, 'name', 'ROOMIN テスト版', 'desc', '新しい版を先にためす', 'href', 'study-room-beta/', 'icon', 'study-room-beta/icon-beta-192.png', 'cat', '勉強・パズル')
    else null end
$$;
revoke all on function public.kw_private_info(text) from public, anon, authenticated;

create or replace function public.kw_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); u kw_users; adm text[] := array['roomin-beta'];
begin
  if me is null then raise exception 'bad_token'; end if;
  select * into u from kw_users where id = me;
  return json_build_object(
    'username', u.username, 'admin', u.is_admin,
    'apps', coalesce((select json_agg(app order by added_at) from kw_apps where user_id = me and kw_app_kind(app) <> 'admin'), '[]'::json),
    'private', coalesce((select json_agg(kw_private_info(a)) from (
        select app as a, added_at as t from kw_apps where user_id = me and kw_app_kind(app) = 'private'
        union all select x, now() from unnest(adm) x where u.is_admin) q), '[]'::json),
    'links', coalesce((select json_object_agg(l.app, su.username) from kw_links l join sr_users su on su.id = l.target where l.user_id = me and l.app = 'roomin'), '{}'::json));
end $$;

-- 管理者用のアプリは渡すものではない（管理者なら出る）ので、渡す・取り上げるは自分だけのアプリだけ
create or replace function public.kw_admin_grant(p_token text, p_username text, p_app text, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); target uuid;
begin
  if not coalesce((select is_admin from kw_users where id = me), false) then raise exception 'not_admin'; end if;
  if kw_app_kind(p_app) is distinct from 'private' then raise exception 'not_found'; end if;
  select id into target from kw_users where username_key = sr_name_key(p_username);
  if target is null then raise exception 'not_found'; end if;
  if p_on then insert into kw_apps (user_id, app) values (target, p_app) on conflict do nothing;
  else delete from kw_apps where user_id = target and app = p_app; end if;
  return json_build_object('ok', true);
end $$;
delete from public.kw_apps where app = 'roomin-beta';
