-- その27：よていパズル（yotei）を「だれでも持てるアプリ」に足す（2026-11-08）
create or replace function public.kw_app_kind(p_app text)
returns text language sql immutable as $$
  select case
    when p_app in ('roomin', 'lyric-book', 'chord-analyzer', 'smagro-memory', 'fourier', 'yotei') then 'public'
    when p_app in ('test-study', 'alarm', 'class-reminder') then 'private'
    when p_app in ('roomin-beta') then 'admin'
    else null end
$$;
