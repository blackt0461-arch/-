-- その29：スマグロのデータ受け取り口（Edge Function smagro-upload）の合言葉（2026-11-10・スマグロ担当）
-- ・GameWith が GitLab からの読み取りを断る（403）ので、毎朝の更新は Claude の予定（このリポジトリの環境）で動かす。
-- ・その作業は Management API で合言葉を読み、受け取り口に付けて送る。合言葉はここにだけ置く（コード・履歴・チャットに書かない）。
-- ・表は RLS 有効・ポリシーなしで、外（anon）からは読めない。受け取り口は service_role で読む。
create table if not exists public.smagro_upload_key (
  id int primary key default 1 check (id = 1),
  key text not null,
  created_at timestamptz not null default now()
);
alter table public.smagro_upload_key enable row level security;
revoke all on public.smagro_upload_key from anon, authenticated;
grant select on public.smagro_upload_key to service_role;   -- 受け取り口が読む（はじめから付いていなかった）
insert into public.smagro_upload_key (id, key) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;
