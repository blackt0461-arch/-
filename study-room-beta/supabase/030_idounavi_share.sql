-- その30：いどうナビ（route/）の「短いリンクで予定を渡す」置き場（2026-11-10・いどうナビ担当・本人の OK ずみ）
-- ・Claude が作った予定を、kotetsuworks.com/route/#i=コード の短いリンクで本人のスマホに届けるため。
-- ・入れるのは Claude（Management API）だけ。外（anon）は表を直接さわれず、idounavi_take(コード) で1件読むだけ。
-- ・7日たったものは、読み出しのたびに消す。コードは推測しにくい乱数（16進10文字）。
create table if not exists public.idounavi_share (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.idounavi_share enable row level security;
revoke all on public.idounavi_share from anon, authenticated;

create or replace function public.idounavi_take(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.idounavi_share where expires_at < now();
  if p_code is null or length(p_code) not between 6 and 16 then
    return null;
  end if;
  return (select data from public.idounavi_share where code = p_code);
end;
$$;
revoke all on function public.idounavi_take(text) from public;
grant execute on function public.idounavi_take(text) to anon, authenticated;
