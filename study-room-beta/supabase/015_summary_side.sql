-- ROOMIN その15：管理者画面の要約に「サイド」（はじめに選んだ目的。puzzle / study）を足す（1.11.0）
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
    'side', d->'profile'->>'side',
    'puzzle', coalesce((d->'profile'->>'puzzleClears')::int, 0),
    'avatar', left(d->'profile'->>'avatar', 16),
    'avatarColor', case when (d->'profile'->>'avatarColor') ~ '^[0-9]{1,2}$' then (d->'profile'->>'avatarColor')::int else 0 end,
    'title', left(d->'profile'->>'title', 24)
  )
$$;
