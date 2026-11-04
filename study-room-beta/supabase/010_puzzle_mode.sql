-- ROOMIN その10：パズルモード
-- data.profile.mode = 'study' | 'puzzle'（はじめに選ぶ。本人は変えられず、管理者が見る・変える）
-- data.profile.puzzleClears = パズルをクリアした合計、data.profile.week.puzzle = その週のクリア数
-- 管理者がモードを変えるときは、sr_admin_grant_code で 'MODE:<mode>:<時刻>' を渡し、本人のアプリが受け取る

-- 管理者画面・フレンドで見える要約に、モードとパズルのクリア数を足す
create or replace function public.sr_summary(d jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xp', coalesce((d->'profile'->>'xp')::int, 0),
    'solved', coalesce((d->'profile'->>'solved')::int, 0),
    'correct', coalesce((d->'profile'->>'correct')::int, 0),
    'streak', coalesce((d->'streak'->>'count')::int, 0),
    'days', coalesce((d->'streak'->>'total')::int, 0),
    'last', d->'streak'->>'last',
    'mode', d->'profile'->>'mode',
    'puzzle', coalesce((d->'profile'->>'puzzleClears')::int, 0)
  )
$$;

-- パズルの週間ランキング（その週にクリアした数）
create or replace function public.sr_weekly_puzzle(p_token text, p_week text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return (
    with w as (
      select u.id, u.username,
        coalesce((u.data->'profile'->'week'->>'puzzle')::int, 0) as solved,
        coalesce((u.data->'profile'->'week'->>'perfectPuzzle')::int, 0) as correct
      from sr_users u
      where u.data->'profile'->'week'->>'key' = p_week
    ), r as (
      select *, rank() over (order by solved desc, correct desc) as pos from w where solved > 0
    )
    select json_build_object(
      'top', coalesce((select json_agg(json_build_object('pos', pos, 'username', username, 'solved', solved, 'correct', correct, 'me', id = me) order by pos, username) from (select * from r order by pos limit 30) t), '[]'::json),
      'me', (select json_build_object('pos', pos, 'solved', solved, 'correct', correct) from r where id = me),
      'total', (select count(*) from r)
    )
  );
end $$;
revoke all on function public.sr_weekly_puzzle(text, text) from public;
grant execute on function public.sr_weekly_puzzle(text, text) to anon, authenticated;
