-- エリアフォトの動画投稿。image_url は動画の1コマ(ポスター)としてそのまま使い、動画本体のURL(R2)を video_url に持つ。(2026-10-14)
alter table public.area_photo_posts add column if not exists video_url text;
