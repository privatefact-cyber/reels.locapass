-- 店舗ページの「動画紹介」: YouTube動画のIDだけを保存する(URLは保存しない)。未設定(null)なら店舗ページに何も出さない。(2026-10-23)
alter table public.locapass_shops
  add column if not exists youtube_video_id text
  check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');
