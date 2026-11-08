-- その25：自分だけのアプリの名前・場所は、入口ページに書かず、持っている人にだけサーバーから返す（2026-11-08）
create or replace function public.kw_private_info(p_app text)
returns json language sql immutable as $$
  select case p_app
    when 'test-study' then json_build_object('id', p_app, 'name', 'テスト勉強', 'desc', '大学の中間・期末テストの勉強', 'href', 'test-study/', 'icon', 'test-study/icon-192.png', 'cat', '勉強')
    when 'class-reminder' then json_build_object('id', p_app, 'name', '授業リマインダー', 'desc', '課題の締切・テスト・出席を LINE でお知らせ', 'href', 'class-reminder', 'ph', '授', 'color', '#1fd469,#06a94d', 'cat', '勉強')
    when 'alarm' then json_build_object('id', p_app, 'name', '目覚まし管理', 'desc', '起きる時間を決めて、iPhone のアラームに入れる', 'href', 'alarm/', 'icon', 'alarm/icon-192.png', 'cat', 'くらし')
    when 'roomin-beta' then json_build_object('id', p_app, 'name', 'ROOMIN テスト版', 'desc', '管理者用', 'href', 'study-room-beta/', 'icon', 'study-room-beta/icon-beta-192.png', 'cat', '管理者')
    else null end
$$;
revoke all on function public.kw_private_info(text) from public, anon, authenticated;

create or replace function public.kw_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := kw_who(p_token); u kw_users;
begin
  if me is null then raise exception 'bad_token'; end if;
  select * into u from kw_users where id = me;
  return json_build_object(
    'username', u.username, 'admin', u.is_admin,
    'apps', coalesce((select json_agg(app order by added_at) from kw_apps where user_id = me), '[]'::json),
    'private', coalesce((select json_agg(kw_private_info(app) order by added_at) from kw_apps where user_id = me and kw_app_kind(app) = 'private'), '[]'::json),
    'links', coalesce((select json_object_agg(l.app, su.username) from kw_links l join sr_users su on su.id = l.target where l.user_id = me and l.app = 'roomin'), '{}'::json));
end $$;
