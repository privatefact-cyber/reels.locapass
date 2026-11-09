-- 動画(リール)の投稿に対応する。動画はMeta側で処理に時間がかかるため、「処理中(processing)」の状態と、コンテナidを持たせる。
alter table public.locapass_threads_posts add column if not exists video_url text;
alter table public.locapass_threads_posts add column if not exists container_id text;
alter table public.locapass_threads_posts add column if not exists processing_since timestamptz;
alter table public.locapass_threads_posts drop constraint if exists locapass_threads_posts_status_check;
alter table public.locapass_threads_posts add constraint locapass_threads_posts_status_check check (status in ('draft', 'scheduled', 'processing', 'posted', 'failed', 'discarded'));
