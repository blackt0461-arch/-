-- その34：入口ページの新しいアプリ（動画かるく・電波チェッカー・ルーンランド）も、開くとマイアプリに入るようにする（2026-11-14・窓口）
-- ・kw_app_kind の「みんなのアプリ」の一覧に shrink / signal-alert / runeland を足す。ほかは 031 のまま。
-- ・これがないと kw_app_add が not_allowed になり、「持っていないアプリ」から動かなかった。

create or replace function public.kw_app_kind(p_app text)
returns text language sql immutable as $$
  select case
    when p_app in ('roomin', 'lyric-book', 'chord-analyzer', 'smagro-memory', 'fourier', 'yotei', 'shrink', 'signal-alert', 'runeland') then 'public'
    when p_app in ('test-study', 'alarm', 'class-reminder', 'route') then 'private'
    when p_app in ('roomin-beta') then 'admin'
    else null end
$$;
