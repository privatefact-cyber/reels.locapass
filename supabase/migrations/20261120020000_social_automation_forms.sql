-- 自動運転で、投稿のかたち(通常・リール・ストーリーズ)を選べるようにする。
alter table public.locapass_social_automation
  add column if not exists forms text[] not null default array['feed'];
-- 投稿の下書き側には、ストーリーズかどうかの印(story)を持たせる。通常・リールは null のまま(写真=通常、動画=リール)。
alter table public.locapass_threads_posts
  add column if not exists post_form text;
