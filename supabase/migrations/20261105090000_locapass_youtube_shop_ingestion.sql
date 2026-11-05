-- YouTube Shortsから見つけた店舗候補。APIの生メタデータは保存せず、
-- 判断に必要な最小限の動画ID・URL・タイトル・説明文と、運営の判定だけを保存する。
create table if not exists public.locapass_youtube_ingestions (
  id uuid primary key default gen_random_uuid(),
  portal_id bigint not null references public.locapass_portals(id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_url text not null,
  title text not null,
  description text,
  channel_title text,
  published_at timestamptz,
  duration_seconds integer,
  embeddable boolean,
  source_query text not null,
  candidate_name text,
  candidate_address text,
  official_url text,
  official_url_verified boolean not null default false,
  match_status text not null default 'pending' check (match_status in ('pending', 'matched_existing', 'ready_to_create', 'rejected', 'error')),
  match_reason text,
  matched_shop_id uuid references public.locapass_shops(id) on delete set null,
  reel_id uuid references public.locapass_reels(id) on delete set null,
  error_message text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_id, youtube_id)
);

create index if not exists locapass_youtube_ingestions_portal_status_idx
  on public.locapass_youtube_ingestions (portal_id, match_status, created_at desc);

create index if not exists locapass_youtube_ingestions_shop_idx
  on public.locapass_youtube_ingestions (matched_shop_id) where matched_shop_id is not null;

alter table public.locapass_youtube_ingestions enable row level security;

-- 読み書きは管理画面のサーバー専用クライアントだけで行う。Data APIには公開しない。
revoke all on table public.locapass_youtube_ingestions from anon, authenticated;

drop trigger if exists trg_locapass_youtube_ingestions_updated_at on public.locapass_youtube_ingestions;
create trigger trg_locapass_youtube_ingestions_updated_at
  before update on public.locapass_youtube_ingestions
  for each row execute function public.locapass_touch_updated_at();


