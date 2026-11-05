-- ROOMIN その13：週間ランキングを「その週にかせいだポイント」で（勉強もパズルも同じ数え方・1つのランキング）
-- data.profile.week.points = その週にもらったゲージの合計
create or replace function public.sr_weekly_points(p_token text, p_week text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  if me is null then raise exception 'bad_token'; end if;
  return (
    with w as (
      select u.id, u.username,
        coalesce((u.data->'profile'->'week'->>'points')::int, 0) as points,
        coalesce((u.data->'profile'->'week'->>'solved')::int, 0) as solved,
        coalesce((u.data->'profile'->'week'->>'puzzle')::int, 0) as puzzle,
        u.data->'profile'->>'avatar' as avatar, u.data->'profile'->>'avatarColor' as color, u.data->'profile'->>'title' as title
      from sr_users u
      where u.data->'profile'->'week'->>'key' = p_week
    ), r as (
      select *, rank() over (order by points desc) as pos from w where points > 0
    )
    select json_build_object(
      'top', coalesce((select json_agg(json_build_object('pos', pos, 'username', username, 'points', points, 'solved', solved, 'puzzle', puzzle, 'me', id = me, 'avatar', avatar, 'avatarColor', color, 'title', title) order by pos, username) from (select * from r order by pos, username limit 30) t), '[]'::json),
      'me', (select json_build_object('pos', pos, 'points', points) from r where id = me),
      'total', (select count(*) from r)
    )
  );
end $$;
revoke all on function public.sr_weekly_points(text, text) from public;
grant execute on function public.sr_weekly_points(text, text) to anon, authenticated;
