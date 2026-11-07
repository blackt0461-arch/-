-- 単元ごとの「ふつうの時間」（1.14.0）：みんなの記録（profile.qtime：{ 'sid|unit': [合計秒, 問題数] }）を単元ごとに合計して返す。
-- 返すのは合計だけ（だれの記録かはわからない）。管理者の記録はふくめない。1人あたり1単元200問ぶんまでに切って、1人の記録にかたよらないようにする。
create or replace function public.sr_unit_times()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(k, json_build_array(secs, n, users)), '{}'::json)
  from (
    select k, sum(least(n0, 200) * s0 / greatest(n0, 1))::int as secs, sum(least(n0, 200))::int as n, count(*)::int as users
    from (
      select q.key as k,
             case when jsonb_typeof(q.value) = 'array' and (q.value->>0) ~ '^[0-9]+(\.[0-9]+)?$' then (q.value->>0)::numeric else 0 end as s0,
             case when jsonb_typeof(q.value) = 'array' and (q.value->>1) ~ '^[0-9]+$' then (q.value->>1)::numeric else 0 end as n0
      from sr_users u, jsonb_each(case when jsonb_typeof(u.data->'profile'->'qtime') = 'object' then u.data->'profile'->'qtime' else '{}'::jsonb end) q
      where not u.is_admin
    ) x
    where n0 > 0
    group by k
  ) t;
$$;
revoke all on function public.sr_unit_times() from public;
grant execute on function public.sr_unit_times() to anon, authenticated;
