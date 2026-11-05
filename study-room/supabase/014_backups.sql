-- ROOMIN その14：記録のバックアップ（1.11.0）
-- 記録が書きかわる前に、前の記録を残す。1人につき1時間に1つまで（経験値が減る書きかえの時は、いつでも残す）。14日たったら消す。
-- 本人も管理者も、アプリからは読めない（Supabase の画面で、管理者が戻す時に使う）。
create table if not exists public.sr_user_backups (
  id bigserial primary key,
  user_id uuid not null references public.sr_users(id) on delete cascade,
  data jsonb not null,
  xp int,
  created_at timestamptz not null default now()
);
create index if not exists sr_user_backups_user_time on public.sr_user_backups (user_id, created_at desc);
alter table public.sr_user_backups enable row level security;
revoke all on public.sr_user_backups from anon, authenticated;

create or replace function public.sr_backup_before_save()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_xp int := coalesce((old.data->'profile'->>'xp')::int, 0);
        new_xp int := coalesce((new.data->'profile'->>'xp')::int, 0);
begin
  if old.data is null or old.data = new.data then return new; end if;
  if new_xp < old_xp
     or not exists (select 1 from sr_user_backups b where b.user_id = old.id and b.created_at > now() - interval '1 hour') then
    insert into sr_user_backups (user_id, data, xp) values (old.id, old.data, old_xp);
  end if;
  delete from sr_user_backups where user_id = old.id and created_at < now() - interval '14 days';
  return new;
end $$;
drop trigger if exists sr_backup_before_save on public.sr_users;
create trigger sr_backup_before_save before update of data on public.sr_users
  for each row execute function public.sr_backup_before_save();
