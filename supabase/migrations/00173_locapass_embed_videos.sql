-- 運営者だけが追加できる外部動画(YouTubeショート / TikTok / Instagramリール)の埋め込み。
-- リール・イベントの1枚として並べ、タップでサイト内再生する。識別子だけ保存する(lib/video.ts と同じ形式)。
alter table public.locapass_reels
  add column if not exists embed_provider text check (embed_provider in ('youtube', 'tiktok', 'instagram')),
  add column if not exists embed_ref text;
alter table public.locapass_shop_events
  add column if not exists embed_provider text check (embed_provider in ('youtube', 'tiktok', 'instagram')),
  add column if not exists embed_ref text;
