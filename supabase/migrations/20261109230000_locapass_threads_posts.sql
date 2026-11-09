-- LOCAPASS公式のThreadsへ、AIが書いた文章を投稿する仕組みの記録表。
-- 最初は「下書き(draft)」で作られ、管理画面で内容を確認して投稿する。完全自動にした場合も、投稿の記録はここに残る。
create table if not exists public.locapass_threads_posts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'failed', 'discarded')),
  external_id text,
  error text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists locapass_threads_posts_created_idx on public.locapass_threads_posts (created_at desc);
create index if not exists locapass_threads_posts_status_idx on public.locapass_threads_posts (status, created_at desc);
alter table public.locapass_threads_posts enable row level security;
revoke all on public.locapass_threads_posts from anon, authenticated;
