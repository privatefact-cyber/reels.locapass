-- LOCAPASSの公式SNS(Threads)への、リールの自動投稿の準備。
-- 店舗が「公式SNSでの紹介をOKにする」を入れたときだけ、その店のリールが投稿の対象になる(既定はオフ)。
alter table public.locapass_shops add column if not exists social_repost_ok boolean not null default false;

-- 投稿した(した結果の)記録。同じリールを同じSNSへ二重に投稿しないための一意制約を兼ねる。サービスロール専用。
create table if not exists public.locapass_social_posts (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.locapass_reels(id) on delete cascade,
  platform text not null check (platform in ('threads')),
  status text not null check (status in ('posted', 'failed')),
  external_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (reel_id, platform)
);
create index if not exists locapass_social_posts_created_idx on public.locapass_social_posts (platform, created_at desc);
alter table public.locapass_social_posts enable row level security;
revoke all on public.locapass_social_posts from anon, authenticated;
