-- その31：いどうナビ（route/）を KOTETSU WORKS の「自分だけのアプリ」にし、予定をアカウントに保存できるようにする（2026-11-10・いどうナビ担当・本人の希望）
-- ・入口ページのマイアプリに出す（自分だけのアプリ＝持っている人にだけサーバーから届く）。本人（kotetsu）に渡す。
-- ・予定・行き方・定期などを kw_app_data（028）に置けるようにする。
-- ・ほかのアプリの分は 027（yotei）までの内容のまま写している。

create or replace function public.kw_app_kind(p_app text)
returns text language sql immutable as $$
  select case
    when p_app in ('roomin', 'lyric-book', 'chord-analyzer', 'smagro-memory', 'fourier', 'yotei') then 'public'
    when p_app in ('test-study', 'alarm', 'class-reminder', 'route') then 'private'
    when p_app in ('roomin-beta') then 'admin'
    else null end
$$;

create or replace function public.kw_private_info(p_app text)
returns json language sql immutable as $$
  select case p_app
    when 'test-study' then json_build_object('id', p_app, 'name', 'テスト勉強', 'desc', '大学の中間・期末テストの勉強', 'href', 'test-study/', 'icon', 'test-study/icon-192.png', 'cat', '勉強')
    when 'class-reminder' then json_build_object('id', p_app, 'name', '授業リマインダー', 'desc', '課題の締切・テスト・出席を LINE でお知らせ', 'href', 'class-reminder', 'ph', '授', 'color', '#1fd469,#06a94d', 'cat', '勉強')
    when 'alarm' then json_build_object('id', p_app, 'name', '目覚まし管理', 'desc', '起きる時間を決めて、iPhone のアラームに入れる', 'href', 'alarm/', 'icon', 'alarm/icon-192.png', 'cat', 'くらし')
    when 'route' then json_build_object('id', p_app, 'name', 'いどうナビ', 'desc', '予定から、乗りかえと出発時刻・すき間時間を出す', 'href', 'route/', 'icon', 'route/icon.svg', 'cat', 'くらし')
    when 'roomin-beta' then json_build_object('id', p_app, 'name', 'ROOMIN テスト版', 'desc', '新しい版を先にためす', 'href', 'study-room-beta/', 'icon', 'study-room-beta/icon-beta-192.png', 'cat', '勉強・パズル')
    else null end
$$;
revoke all on function public.kw_private_info(text) from public, anon, authenticated;

create or replace function public.kw_data_app_ok(p_app text)
returns boolean language sql immutable as $$
  select p_app in ('smagro-memory', 'route')
$$;

-- 本人（kotetsu）に渡す
insert into public.kw_apps (user_id, app)
  select id, 'route' from public.kw_users where username = 'kotetsu'
  on conflict do nothing;
