-- 投稿先(Instagram/Threads × LOCAPASS/LUXELA)を持たせる。
alter table public.locapass_threads_posts add column if not exists platform text not null default 'threads';
alter table public.locapass_threads_posts add column if not exists account text not null default 'locapass';
alter table public.locapass_threads_posts drop constraint if exists locapass_threads_posts_platform_check;
alter table public.locapass_threads_posts add constraint locapass_threads_posts_platform_check check (platform in ('threads', 'instagram'));
alter table public.locapass_threads_posts drop constraint if exists locapass_threads_posts_account_check;
alter table public.locapass_threads_posts add constraint locapass_threads_posts_account_check check (account in ('locapass', 'luxela'));
