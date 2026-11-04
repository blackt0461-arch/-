-- ROOMIN その5：要望・バグ報告（だれでも送れる、管理者だけ読める）
-- 本番には Supabase の管理ツールで適用済み。中身は同じ
create table if not exists public.sr_feedback (
  id bigint generated always as identity primary key,
  user_id uuid references public.sr_users(id) on delete set null,
  kind text not null check (kind in ('bug', 'request')),
  body text not null,
  created_at timestamptz not null default now(),
  done boolean not null default false
);
alter table public.sr_feedback enable row level security;
-- sr_feedback_send(token, kind, body) … 1時間に10件まで、2000文字まで
-- sr_feedback_list(token) … 管理者だけ。新しい順・未対応が先
-- sr_feedback_done(token, id, done) … 管理者だけ。「対応ずみ」の印

-- ROOMIN その6：同じアカウントで同時に使えない
-- sr_login は、ログインするとき同じ人のほかの合い鍵（sr_sessions）をすべて消す
-- sr_ping(token) … 合い鍵がまだ使えるかだけ確かめる（使えなければ bad_token）
