-- 店舗オプション「動画の自動追加」: 店が登録した YouTube チャンネルの新着動画を、その店のリールとして自動で取り込む。
--   locapass_shop_youtube_channels : 店が登録したチャンネル(1店に複数可)
--   locapass_shop_channel_videos   : 取り込み済み(または取り込みを見送った)動画の台帳。
--                                    店が削除・非表示にした動画を、次回の巡回でまた取り込まないためのもの。
-- 書き込みはサーバー(service role)だけ。店の管理者は、自分の店の分だけ読める。
-- オプションの契約(locapass_shops.auto_video_enabled)の確認は、アプリ側で行う。

create table if not exists public.locapass_shop_youtube_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  channel_id text not null,
  channel_title text,
  channel_thumb_url text,
  uploads_playlist_id text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_checked_at timestamptz,
  last_imported_at timestamptz,
  last_error text,
  imported_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (shop_id, channel_id)
);
create index if not exists locapass_shop_youtube_channels_due_idx on public.locapass_shop_youtube_channels (status, last_checked_at);
alter table public.locapass_shop_youtube_channels enable row level security;

drop policy if exists "shop admins read own channels" on public.locapass_shop_youtube_channels;
create policy "shop admins read own channels" on public.locapass_shop_youtube_channels
  for select to authenticated
  using (public.locapass_is_shop_admin(shop_id));

create table if not exists public.locapass_shop_channel_videos (
  shop_id uuid not null references public.locapass_shops(id) on delete cascade,
  youtube_id text not null,
  channel_row_id uuid references public.locapass_shop_youtube_channels(id) on delete set null,
  reel_id uuid,
  outcome text not null default 'imported' check (outcome in ('imported', 'skipped')),
  note text,
  created_at timestamptz not null default now(),
  primary key (shop_id, youtube_id)
);
alter table public.locapass_shop_channel_videos enable row level security;
-- ポリシーなし = 一般には読めない(サーバーだけが読み書きする)。
