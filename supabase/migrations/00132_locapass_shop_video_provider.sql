-- 店舗ページの「動画紹介」を YouTube 以外(TikTok / Instagram / Vimeo)にも広げる。(2026-10-23)
alter table public.locapass_shops
  add column if not exists video_provider text check (video_provider is null or video_provider in ('youtube','tiktok','instagram','vimeo')),
  add column if not exists video_ref text check (video_ref is null or char_length(video_ref) <= 60);
update public.locapass_shops set video_provider='youtube', video_ref=youtube_video_id where youtube_video_id is not null and video_provider is null;
