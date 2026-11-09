-- Threadsの下書きに、写真を1枚付けられるようにする(付けると画像つきの投稿になる)。
alter table public.locapass_threads_posts add column if not exists image_url text;
