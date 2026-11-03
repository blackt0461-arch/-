-- ROOMIN その3：週間ランキング（その週に解いた問題の数）
-- data.profile.week = { key: その週の月曜日 'YYYY-MM-DD', solved, correct }
create or replace function public.sr_weekly_ranking(p_token text, p_week text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token);
begin
  return (
    with w as (
      select u.id, u.username,
        coalesce((u.data->'profile'->'week'->>'solved')::int, 0) as solved,
        coalesce((u.data->'profile'->'week'->>'correct')::int, 0) as correct
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
revoke all on function public.sr_weekly_ranking(text, text) from public;
grant execute on function public.sr_weekly_ranking(text, text) to anon, authenticated;
