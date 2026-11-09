-- Threadsの投稿に、「自分で書いた文章(manual)」と「予約投稿(scheduled)」を足す。
alter table public.locapass_threads_posts add column if not exists source text not null default 'ai';
alter table public.locapass_threads_posts add column if not exists scheduled_at timestamptz;
alter table public.locapass_threads_posts drop constraint if exists locapass_threads_posts_source_check;
alter table public.locapass_threads_posts add constraint locapass_threads_posts_source_check check (source in ('ai', 'manual'));
alter table public.locapass_threads_posts drop constraint if exists locapass_threads_posts_status_check;
alter table public.locapass_threads_posts add constraint locapass_threads_posts_status_check check (status in ('draft', 'scheduled', 'posted', 'failed', 'discarded'));
create index if not exists locapass_threads_posts_due_idx on public.locapass_threads_posts (scheduled_at) where status = 'scheduled';
