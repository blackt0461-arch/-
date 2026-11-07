-- ROOMIN その21：終わりのないパズル（おしいれパッキング・インテリア・マージ）のランキング（1.15.0）
-- 「今週」（月曜の朝6時・日本時間で区切る）と「歴代」の2つ。1人1パズル1週に1行（その週のベスト）だけ残す。
-- 表には直接さわれない（RLS 有効・ポリシーなし）。下の関数からだけ読み書きする。
-- ずるい高得点を入れないための守り：
--   ・スコアの上限：1手でとれる点の上限 × 手数（アプリの js/endless.js の scoreCap と同じ式）
--       pack：手数 × 319（箱のマス 9 ＋ 6列いっぺん 210 ＋ れんぞく 100）
--       merge：V = 4 ×（手数 + 2）として V × log2(V)（盤にある家具の合計は1手で4までしかふえない）
--   ・手の速さ：pack は1秒に2手、merge は1秒に5手まで（＋少しのゆとり）
--   ・送る回数：1人1時間に60回まで（too_many）
--   ・管理者は、おかしな記録を消せる（sr_admin_endless_delete）

create table if not exists public.sr_endless_scores (
  user_id uuid not null references public.sr_users(id) on delete cascade,
  game text not null check (game in ('pack', 'merge')),
  week date not null,
  score int not null check (score >= 0),
  moves int not null,
  secs int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game, week)
);
create index if not exists sr_endless_scores_rank on public.sr_endless_scores (game, week, score desc);
create index if not exists sr_endless_scores_all on public.sr_endless_scores (game, score desc);
alter table public.sr_endless_scores enable row level security;

create table if not exists public.sr_endless_submits (
  user_id uuid not null references public.sr_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sr_endless_submits_user on public.sr_endless_submits (user_id, created_at);
alter table public.sr_endless_submits enable row level security;

-- 今の週（月曜日の日付）。日本時間の朝6時で区切る（アプリの store.js の weekKey と同じ）
create or replace function public.sr_endless_week()
returns date language sql stable set search_path = public as $$
  select (date_trunc('week', (now() at time zone 'Asia/Tokyo') - interval '6 hours'))::date;
$$;

-- スコアを送る。その週のベストより高い時だけ書きかえる。戻り値 { ok, best, week }
create or replace function public.sr_endless_submit(p_token text, p_game text, p_score int, p_moves int, p_secs int)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); wk date := sr_endless_week(); cap bigint; v numeric; best int;
begin
  if p_game not in ('pack', 'merge') then raise exception 'bad_code'; end if;
  if p_score is null or p_moves is null or p_secs is null or p_score < 0 or p_moves < 1 or p_secs < 0 then raise exception 'bad_code'; end if;
  if (select count(*) from sr_endless_submits where user_id = me and created_at > now() - interval '1 hour') >= 60 then raise exception 'too_many'; end if;
  insert into sr_endless_submits (user_id) values (me);
  delete from sr_endless_submits where user_id = me and created_at < now() - interval '1 day';
  if p_game = 'pack' then
    cap := p_moves::bigint * 319;
    if p_moves > p_secs * 2 + 5 then raise exception 'bad_code'; end if;
  else
    v := 4 * (p_moves + 2);
    cap := floor(v * ln(greatest(v, 2)) / ln(2));
    if p_moves > p_secs * 5 + 10 then raise exception 'bad_code'; end if;
  end if;
  if p_score > cap or p_score > 5000000 then raise exception 'bad_code'; end if;
  insert into sr_endless_scores (user_id, game, week, score, moves, secs)
    values (me, p_game, wk, p_score, p_moves, p_secs)
    on conflict (user_id, game, week) do update set score = excluded.score, moves = excluded.moves, secs = excluded.secs, created_at = now()
    where sr_endless_scores.score < excluded.score;
  select score into best from sr_endless_scores where user_id = me and game = p_game and week = wk;
  return json_build_object('ok', true, 'best', best, 'week', wk);
end $$;
revoke all on function public.sr_endless_submit(text, text, int, int, int) from public;
grant execute on function public.sr_endless_submit(text, text, int, int, int) to anon, authenticated;

-- ランキング。p_scope = 'week'（今週）/ 'all'（歴代：1人のいちばん高いスコア）。上位30人と自分の順位
create or replace function public.sr_endless_ranking(p_token text, p_game text, p_scope text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); wk date := sr_endless_week();
begin
  if p_game not in ('pack', 'merge') then raise exception 'bad_code'; end if;
  return (
    with b as (
      select s.user_id, max(s.score) as score
      from sr_endless_scores s
      where s.game = p_game and (p_scope = 'all' or s.week = wk)
      group by s.user_id
    ), r as (
      select b.user_id, b.score, u.username,
        u.data->'profile'->>'avatar' as avatar, u.data->'profile'->>'avatarColor' as color, u.data->'profile'->>'title' as title,
        rank() over (order by b.score desc) as pos
      from b join sr_users u on u.id = b.user_id
      where b.score > 0
    )
    select json_build_object(
      'top', coalesce((select json_agg(json_build_object('pos', pos, 'username', username, 'score', score, 'me', user_id = me, 'avatar', avatar, 'avatarColor', color, 'title', title) order by pos, username) from (select * from r order by pos, username limit 30) t), '[]'::json),
      'me', (select json_build_object('pos', pos, 'score', score) from r where user_id = me),
      'total', (select count(*) from r),
      'week', wk
    )
  );
end $$;
revoke all on function public.sr_endless_ranking(text, text, text) from public;
grant execute on function public.sr_endless_ranking(text, text, text) to anon, authenticated;

-- 管理者：おかしな記録を消す（その人のそのパズルの記録を全部）
create or replace function public.sr_admin_endless_delete(p_token text, p_username text, p_game text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := sr_who(p_token); target uuid; n int;
begin
  if not coalesce((select is_admin from sr_users where id = me), false) then raise exception 'not_admin'; end if;
  select id into target from sr_users where username = p_username;
  if target is null then raise exception 'not_found'; end if;
  delete from sr_endless_scores where user_id = target and (p_game is null or game = p_game);
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'deleted', n);
end $$;
revoke all on function public.sr_admin_endless_delete(text, text, text) from public;
grant execute on function public.sr_admin_endless_delete(text, text, text) to anon, authenticated;

-- ほかの人のプロフィール：終わりのないパズルの記録（ベスト・回数）も返す（012 の sr_profile に endless を足しただけ）
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
      'puzzleClears', d->'profile'->'puzzleClears', 'mode', d->'profile'->'mode', 'puzzle', d->'profile'->'puzzle',
      'endless', d->'profile'->'endless'),
    'units', (select coalesce(jsonb_object_agg(k, d->'subjects'->k->'units'), '{}'::jsonb) from jsonb_object_keys(coalesce(d->'subjects', '{}'::jsonb)) k),
    'streak', d->'streak',
    'collected', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(coalesce(d->'house'->'collected', '{}'::jsonb)) k),
    'admin', (select is_admin from sr_users where username = p_username)
  );
end $$;
revoke all on function public.sr_profile(text, text) from public;
grant execute on function public.sr_profile(text, text) to anon, authenticated;
