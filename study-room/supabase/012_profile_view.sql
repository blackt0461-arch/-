-- ROOMIN その12：ほかの人のプロフィールを見る（ランキング・フレンド・管理者画面から）
-- 見せるのは、プロフィールに出す物だけ（アイコン・称号・経験値・解いた数・教科ごとの数・パズルの記録・連続日数・集めた家具の名前）。
-- 問題ごとの記録・持ち物・部屋の中身などは返さない。
create or replace function public.sr_profile(p_token text, p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); d jsonb; un text;
begin
  if me is null then raise exception 'bad_token'; end if;
  select data, username into d, un from sr_users where username = p_username;
  if un is null then raise exception 'not_found'; end if;
  return json_build_object(
    'username', un,
    'profile', jsonb_build_object(
      'avatar', d->'profile'->'avatar', 'avatarColor', d->'profile'->'avatarColor', 'title', d->'profile'->'title',
      'xp', d->'profile'->'xp', 'solved', d->'profile'->'solved', 'correct', d->'profile'->'correct',
      'puzzleClears', d->'profile'->'puzzleClears', 'mode', d->'profile'->'mode', 'puzzle', d->'profile'->'puzzle'),
    'units', (select coalesce(jsonb_object_agg(k, d->'subjects'->k->'units'), '{}'::jsonb) from jsonb_object_keys(coalesce(d->'subjects', '{}'::jsonb)) k),
    'streak', d->'streak',
    'collected', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(coalesce(d->'house'->'collected', '{}'::jsonb)) k),
    'admin', (select is_admin from sr_users where username = p_username)
  );
end $$;
revoke all on function public.sr_profile(text, text) from public;
grant execute on function public.sr_profile(text, text) to anon, authenticated;

-- 週間ランキングに、アイコンと称号を足す（勉強・パズル）
create or replace function public.sr_weekly_ranking(p_token text, p_week text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return (
    with w as (
      select u.id, u.username,
        coalesce((u.data->'profile'->'week'->>'solved')::int, 0) as solved,
        coalesce((u.data->'profile'->'week'->>'correct')::int, 0) as correct,
        u.data->'profile'->>'avatar' as avatar, u.data->'profile'->>'avatarColor' as color, u.data->'profile'->>'title' as title
      from sr_users u
      where u.data->'profile'->'week'->>'key' = p_week
    ), r as (
      select *, rank() over (order by solved desc, correct desc) as pos from w where solved > 0
    )
    select json_build_object(
      'top', coalesce((select json_agg(json_build_object('pos', pos, 'username', username, 'solved', solved, 'correct', correct, 'me', id = me, 'avatar', avatar, 'avatarColor', color, 'title', title) order by pos, username) from (select * from r order by pos limit 30) t), '[]'::json),
      'me', (select json_build_object('pos', pos, 'solved', solved, 'correct', correct) from r where id = me),
      'total', (select count(*) from r)
    )
  );
end $$;
create or replace function public.sr_weekly_puzzle(p_token text, p_week text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return (
    with w as (
      select u.id, u.username,
        coalesce((u.data->'profile'->'week'->>'puzzle')::int, 0) as solved,
        coalesce((u.data->'profile'->'week'->>'perfectPuzzle')::int, 0) as correct,
        u.data->'profile'->>'avatar' as avatar, u.data->'profile'->>'avatarColor' as color, u.data->'profile'->>'title' as title
      from sr_users u
      where u.data->'profile'->'week'->>'key' = p_week
    ), r as (
      select *, rank() over (order by solved desc, correct desc) as pos from w where solved > 0
    )
    select json_build_object(
      'top', coalesce((select json_agg(json_build_object('pos', pos, 'username', username, 'solved', solved, 'correct', correct, 'me', id = me, 'avatar', avatar, 'avatarColor', color, 'title', title) order by pos, username) from (select * from r order by pos limit 30) t), '[]'::json),
      'me', (select json_build_object('pos', pos, 'solved', solved, 'correct', correct) from r where id = me),
      'total', (select count(*) from r)
    )
  );
end $$;
